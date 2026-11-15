import { mascotStore, type SpeechState } from "../store";
import { adjustForUserTone, clampEmotion, detectUserTone, tagToEmotion, type Emotion, type UserTone } from "./emotion";
import type { ExpressionName } from "./expressions";
import { AssistantMachine, type MachineEffect } from "./machine";
import { DROWSY_POOL, GesturePicker, IDLE_POOL, IdleScheduler, seasonalAccessory, splitSentences, timeOfDay } from "./behaviors";
import { reactionAllowed, type BehaviorProfile } from "./profiles";
import { loadPrefs, recordVisit, savePrefs } from "./prefs";
import { chance, pick } from "./rng";
import { playSound } from "./sound";
import { track } from "./telemetry";
import type { AssistantState, GestureName, Placement, ReactionName } from "./types";
import { stressTimes, textToVisemes, visemeDuration, type VisemeKey } from "./visemes";
import { setMascotLipSyncAudio } from "../plush/lipSync";

/**
 * Public, framework-agnostic API for the mascot (three.js-free, so it can be
 * imported anywhere without pulling in the 3D bundle).
 *
 * ```ts
 * mascot.setState("thinking");
 * mascot.react("celebrate");
 * mascot.setEmotion({ valence: 0.6, arousal: 0.7 });
 * mascot.speak({ text: "Hello!" });
 * mascot.lookAt(buttonEl);
 * mascot.say("Welcome back!", { durationMs: 2500 });
 * mascot.on("click", () => openChat());
 * ```
 */

export type MascotEventName = "click" | "stateChange" | "emotion" | "speakStart" | "speakEnd" | "chatToggle";
export interface MascotEventMap {
  click: { source: "pointer" | "keyboard" };
  stateChange: { state: AssistantState; from: AssistantState };
  emotion: { valence: number; arousal: number; intensity: number } | null;
  speakStart: { text: string };
  speakEnd: { text: string };
  chatToggle: { open: boolean };
}
type Handler<K extends MascotEventName> = (payload: MascotEventMap[K]) => void;

export type MascotReaction = ReactionName | "wink";

export interface SpeakOptions {
  text: string;
  /** Audio element playing the speech (mouth follows its loudness or `visemes`). */
  audio?: HTMLMediaElement | null;
  /** Phoneme timeline from TTS (seconds relative to audio start). */
  visemes?: VisemeKey[];
  /** More text will follow via `speakAppend()`. */
  streaming?: boolean;
}

/* ---------------------------------------------------------------- internals */

const IDLE_ROUTINE_AFTER = 8; // s without interaction before idle variations
const SPEAK_RATE = 14; // characters per second for text-driven lip sync
const TICK_MS = 50;

const machine = new AssistantMachine();
const idleScheduler = new IdleScheduler();
const gestures = new GesturePicker();
const handlers = new Map<MascotEventName, Set<Handler<MascotEventName>>>();
let timers: ReturnType<typeof setTimeout>[] = [];
let driver: ReturnType<typeof setInterval> | undefined;
let refs = 0;
let userTone: UserTone = "neutral";
let afterSpeak: AssistantState = "idle";
let clickTimes: number[] = [];
let lastNod = 0;
let lastTilt = 0;
let lastSnore = 0;
let pendingSentence = "";
/** Gestures / beats / bubbles scheduled on the speech clock (seconds from speech start). */
let speechQueue: { t: number; kind: "gesture" | "beat" | "bubble"; value: string }[] = [];

const nowS = () => performance.now() / 1000;
const store = mascotStore;

function emit<K extends MascotEventName>(name: K, payload: MascotEventMap[K]) {
  handlers.get(name)?.forEach((h) => {
    try {
      (h as Handler<K>)(payload);
    } catch (err) {
      console.error("[mascot] handler error", err);
    }
  });
}

function later(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms));
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function applyEffects(effects: MachineEffect[]) {
  for (const e of effects) {
    if (e.type === "enter") onEnter(e.state, e.from);
    else if (e.type === "loop") store.set({ phase: "loop" });
    else if (e.type === "exit") store.set({ phase: "exit" });
    else if (e.type === "escalate") {
      store.set({ thinkingEscalated: true });
      store.gesture("tapWrist", 2.4);
    }
  }
}

function onEnter(state: AssistantState, from: AssistantState) {
  clearTimers();
  const s = store.get();
  const profile = s.profile;
  const def = machine.def(state);
  const baseExpression: ExpressionName = state === "idle" ? profile.idleExpression : def.expression;
  store.set({
    assistantState: state,
    phase: machine.phase,
    stateSince: performance.now(),
    baseExpression,
    override: null,
    thinkingEscalated: false,
    ...(state !== "speaking" && state !== "thinking" ? { card: null } : {}),
    ...(state !== "speaking" ? { emotion: null } : {}),
  });

  switch (state) {
    case "welcome": {
      store.trigger("wave");
      store.fx("browFlash");
      playSound("pop");
      break;
    }
    case "listening":
      store.fx("twitch");
      break;
    case "thinking":
      store.gesture("chinTouch", 1.8);
      playSound("hmm");
      break;
    case "success":
      store.trigger("jump");
      store.fx("sparkles");
      playSound("chime");
      break;
    case "confused":
      store.trigger("shrug");
      store.gesture("shrug", 1.4);
      store.fx("question");
      break;
    case "error":
      store.trigger("flinch");
      store.fx("warning");
      break;
    case "waking":
      store.trigger("startle");
      later(900, () => store.trigger("stretch"));
      later(1500, () => {
        if (!profile.quiet) store.say("Welcome back!", 2200);
      });
      break;
    case "goodbye":
      store.trigger("wave");
      break;
    case "drowsy":
      idleScheduler.reset(nowS(), 3);
      break;
    case "idle":
      idleScheduler.reset(nowS());
      break;
  }
  emit("stateChange", { state, from });
}

/* ------------------------------------------------------------------ driver */

function tick() {
  const s = store.get();
  const now = nowS();
  const idleFor = (performance.now() - s.lastInteraction) / 1000;
  applyEffects(machine.tick(now, idleFor));

  const st = store.get();
  // Idle variations (weighted random + cooldown), only when nobody is interacting.
  if (st.phase === "loop" && !st.profile.quiet && !st.chatOpen) {
    const energy = st.profile.energy * timeOfDay().energy;
    if (st.assistantState === "idle" && idleFor > IDLE_ROUTINE_AFTER && !st.attentionEl) {
      const r = idleScheduler.next(now, IDLE_POOL, energy);
      if (r && reactionAllowed(st.profile, r)) store.trigger(r);
    } else if (st.assistantState === "drowsy") {
      const r = idleScheduler.next(now, DROWSY_POOL, 1);
      if (r) store.trigger(r);
    } else if (st.assistantState === "sleeping" && now - lastSnore > 6) {
      lastSnore = now;
      playSound("snore");
    }
  }

  // Speech clock: gestures on sentence starts, beats on stressed words, bubbles.
  const sp = st.speech;
  if (sp) {
    const t = speechTime(sp);
    while (speechQueue.length && speechQueue[0].t <= t) {
      const ev = speechQueue.shift()!;
      if (ev.kind === "gesture") store.gesture(ev.value as GestureName, 1.6);
      else if (ev.kind === "beat") {
        const g = store.get().gesture;
        if (!g || g.name === "beat") store.gesture("beat", 0.55);
      } else if (ev.kind === "bubble" && !st.chatOpen) store.say(ev.value, Math.max(1800, ev.value.length * 70));
    }
    const ended = sp.audio && !sp.audioClock ? sp.audio.ended || sp.audio.paused : t > visemeDuration(sp.keys) + 0.25;
    if (sp.final && ended) finishSpeech();
  }
}

function speechTime(sp: SpeechState) {
  if (sp.audioClock && sp.audio) return sp.audio.currentTime;
  return (performance.now() - sp.start) / 1000;
}

function finishSpeech() {
  const sp = store.get().speech;
  if (!sp) return;
  store.set({ speech: null });
  if (sp.audio) setMascotLipSyncAudio(null);
  speechQueue = [];
  pendingSentence = "";
  emit("speakEnd", { text: sp.text });
  if (machine.state === "speaking") applyEffects(machine.request(afterSpeak, nowS()));
  afterSpeak = "idle";
}

function onActivity(e: Event) {
  store.touch();
  if (e.type === "pointermove" && (e as PointerEvent).pointerType === "touch") return;
  applyEffects(machine.interaction(nowS()));
}

function onVisibility() {
  if (document.hidden) {
    if (machine.state !== "offscreen") applyEffects(machine.request("goodbye", nowS()));
  } else if (machine.state === "goodbye") {
    applyEffects(machine.request("welcome", nowS()));
    if (!store.get().profile.quiet) store.say("Welcome back!", 2200);
  }
}

/** Exit intent: the pointer leaves through the top of the window. */
function onMouseOut(e: MouseEvent) {
  if (e.relatedTarget || e.clientY > 8) return;
  const st = machine.state;
  if (st === "idle" || st === "drowsy") {
    applyEffects(machine.request("goodbye", nowS()));
    if (!store.get().profile.quiet) store.say("Leaving already? See you soon!", 2200);
  }
}

function onMouseOver() {
  if (machine.state === "goodbye") applyEffects(machine.request("idle", nowS()));
}

const ACTIVITY = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

/** Start the behaviour driver. Ref-counted; returns a stop function. */
export function startMascot(): () => void {
  refs++;
  if (refs === 1 && typeof window !== "undefined") {
    ACTIVITY.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("mouseover", onMouseOver);
    driver = setInterval(tick, TICK_MS);

    const prefs = loadPrefs();
    store.set({ accessory: seasonalAccessory() });
    const returning = recordVisit();
    store.touch();
    const profile = store.get().profile;
    if (profile.greet && !prefs.hidden) {
      applyEffects(machine.request("welcome", nowS()));
      const tod = timeOfDay();
      const greet = profile.greeting.replace(/^Hi!\s*/, "");
      const line = returning ? "Welcome back! Good to see you again." : `${tod.greeting} ${greet}`;
      later(700, () => store.say(line.trim(), 3400));
    } else applyEffects(machine.request("idle", nowS()));
  }
  return () => {
    refs = Math.max(0, refs - 1);
    if (refs === 0 && typeof window !== "undefined") {
      ACTIVITY.forEach((ev) => window.removeEventListener(ev, onActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("mouseover", onMouseOver);
      clearInterval(driver);
      clearTimers();
    }
  };
}

/* -------------------------------------------------------------- public API */

function scheduleSentences(text: string, startT: number, final: boolean) {
  pendingSentence += text;
  const { sentences, rest } = splitSentences(pendingSentence);
  pendingSentence = rest;
  if (final && rest.trim()) {
    sentences.push(rest.trim());
    pendingSentence = "";
  }
  let t = startT;
  for (const sentence of sentences) {
    speechQueue.push({ t, kind: "gesture", value: gestures.pick(sentence) });
    speechQueue.push({ t, kind: "bubble", value: sentence });
    for (const b of stressTimes(sentence, SPEAK_RATE, t)) if (b > t + 0.3) speechQueue.push({ t: b, kind: "beat", value: "" });
    t += sentence.length / SPEAK_RATE + 0.3;
  }
  speechQueue.sort((a, b) => a.t - b.t);
}

export const mascot = {
  /** Start the behaviour driver (MascotStage/MascotHost do this for you). */
  start: startMascot,

  setState(state: AssistantState) {
    applyEffects(machine.request(state, nowS()));
  },

  getState(): AssistantState {
    return machine.state;
  },

  /** Play a one-shot reaction. `"celebrate"` also adds confetti and flips the tassel. */
  react(name: MascotReaction) {
    store.touch();
    switch (name) {
      case "wink":
        store.setExpression("winking", 1300);
        store.trigger("curiousTilt");
        return;
      case "celebrate":
        store.setExpression("celebrating", 2400);
        store.trigger("celebrate");
        store.fx("confetti");
        store.fx("tasselFlip");
        store.set({ tasselSide: store.get().tasselSide === 1 ? -1 : 1 });
        playSound("chime");
        return;
      case "laugh":
        store.setExpression("laughing", 1800);
        break;
      case "shrug":
        store.setExpression("confused", 1500);
        store.fx("question");
        break;
      case "dizzy":
        store.setExpression("dizzy", 2600);
        break;
      case "giggle":
        store.setExpression("laughing", 1200);
        store.fx("hearts");
        playSound("giggle");
        break;
    }
    store.trigger(name);
  },

  /** Continuous emotion (valence -1…1, arousal 0…1). Pass null to clear. */
  setEmotion(e: (Emotion & { intensity?: number }) | null) {
    if (!e) {
      store.set({ emotion: null });
      emit("emotion", null);
      return;
    }
    const c = clampEmotion(e);
    const emotion = { ...c, intensity: Math.min(1, Math.max(0, e.intensity ?? 0.8)) };
    store.set({ emotion });
    emit("emotion", emotion);
  },

  /** Emotion from an LLM tag, softened when the user is frustrated or sad. */
  setEmotionTag(tag: string, intensity = 0.7) {
    const emotion = adjustForUserTone(tagToEmotion(tag, intensity), userTone);
    store.set({ emotion });
    emit("emotion", emotion);
  },

  /** Tell the brain how the user sounds (from their message). */
  setUserMessage(text: string) {
    userTone = detectUserTone(text);
    const topic = text.replace(/\s+/g, " ").trim().split(" ").slice(0, 5).join(" ");
    store.set({ card: topic.length > 2 ? topic : null });
    return userTone;
  },

  /** Lip-sync + gestures. With `streaming`, call `speakAppend()` then `speakEnd()`. */
  speak({ text, audio = null, visemes, streaming = false }: SpeakOptions): Promise<void> {
    speechQueue = [];
    pendingSentence = "";
    const audioClock = !!(audio && visemes);
    if (audio && !visemes) setMascotLipSyncAudio(audio);
    const keys = visemes ?? textToVisemes(text, SPEAK_RATE);
    const sp: SpeechState = { id: Date.now(), start: performance.now(), text, keys, beats: [], audio, audioClock, final: !streaming };
    store.set({ speech: sp });
    scheduleSentences(text, 0, !streaming);
    if (machine.state !== "speaking") applyEffects(machine.request("speaking", nowS()));
    emit("speakStart", { text });
    return new Promise((resolve) => {
      const off = mascot.on("speakEnd", () => {
        off();
        resolve();
      });
    });
  },

  /** Append streamed text to the current utterance. */
  speakAppend(text: string) {
    const sp = store.get().speech;
    if (!sp) {
      void mascot.speak({ text, streaming: true });
      return;
    }
    const elapsed = speechTime(sp);
    const startT = Math.max(elapsed, visemeDuration(sp.keys));
    const more = textToVisemes(text, SPEAK_RATE, startT);
    sp.keys = sp.keys.slice(0, -1).concat(more); // drop trailing "sil" before appending
    sp.text += text;
    scheduleSentences(text, startT, false);
    if (machine.state !== "speaking") applyEffects(machine.request("speaking", nowS()));
  },

  /** No more text for the current utterance. `then` = state after speaking. */
  speakEnd(then: AssistantState = "idle") {
    afterSpeak = then;
    const sp = store.get().speech;
    if (!sp) {
      if (machine.state === "speaking" || machine.state === "thinking") applyEffects(machine.request(then, nowS()));
      return;
    }
    scheduleSentences("", visemeDuration(sp.keys), true);
    store.set({ speech: { ...sp, final: true } });
  },

  stopSpeaking() {
    afterSpeak = "idle";
    finishSpeech();
  },

  /** Look at an element (live), a client-px point, or null to release. */
  lookAt(target: Element | { x: number; y: number } | null) {
    if (target === null) store.lookAtElement(null);
    else if (typeof Element !== "undefined" && target instanceof Element) store.lookAtElement(target);
    else store.lookAtPoint(target as { x: number; y: number });
  },

  /** Speech bubble. */
  say(text: string, opts: { durationMs?: number } = {}) {
    store.say(text, opts.durationMs ?? Math.max(2200, text.length * 60));
  },

  gesture(name: GestureName, duration?: number) {
    store.gesture(name, duration);
  },

  /** The user is typing (glances, small nods, curious tilt on "?"). */
  typing(text: string) {
    store.touch();
    const t = nowS();
    if (text.trimEnd().endsWith("?") && t - lastTilt > 3) {
      lastTilt = t;
      store.trigger("curiousTilt");
    } else if (t - lastNod > 1.6 && chance(0.35)) {
      lastNod = t;
      store.trigger("headNod");
    }
  },

  setProfile(profile: BehaviorProfile) {
    store.set({ profile, ...(machine.state === "idle" ? { baseExpression: profile.idleExpression } : {}) });
  },

  setPlacement(placement: Placement) {
    if (store.get().placement !== placement) store.set({ placement });
    if (placement === "minimized" || placement === "hidden") savePrefs({ minimized: placement === "minimized", hidden: placement === "hidden" });
    else savePrefs({ minimized: false, hidden: false });
  },

  setChatOpen(open: boolean, source: "mascot" | "button" | "keyboard" = "button") {
    if (store.get().chatOpen === open) return;
    store.set({ chatOpen: open });
    savePrefs({ chatOpen: open });
    if (open) {
      track({ name: "chat_open", source });
      store.hideMessage();
    } else if (machine.state === "listening") applyEffects(machine.request("idle", nowS()));
    emit("chatToggle", { open });
  },

  /** Click/tap/Enter on the character: happy bounce, then the chat opens. */
  click(source: "pointer" | "keyboard" = "pointer") {
    store.touch();
    const t = nowS();
    clickTimes = clickTimes.filter((x) => t - x < 2).concat(t);
    if (clickTimes.length >= 5) {
      clickTimes = [];
      mascot.react("dizzy");
      store.say(pick(["Whoa… everything's spinning!", "Easy there, I'm getting dizzy!"]), 2400);
      return;
    }
    applyEffects(machine.interaction(t));
    const st = store.get();
    if (!st.chatOpen) {
      store.trigger("hop");
      playSound("pop");
      mascot.setChatOpen(true, source === "keyboard" ? "keyboard" : "mascot");
    } else {
      store.trigger(pick(["hop", "squash", "giggle"] as const));
      if (chance(0.5)) store.fx("hearts");
    }
    emit("click", { source });
  },

  /** Pointer petting (vertical rub): ripple + giggle + blush. */
  pet(x?: number, y?: number) {
    store.touch();
    store.fx("ripple", x, y);
    if (store.get().reaction?.name !== "giggle") {
      mascot.react("giggle");
      if (chance(0.4)) store.say(pick(["Hehe, that tickles!", "Hihi!", "Aww, thanks!"]), 1600);
    }
  },

  on<K extends MascotEventName>(name: K, fn: Handler<K>) {
    let set = handlers.get(name);
    if (!set) handlers.set(name, (set = new Set()));
    set.add(fn as Handler<MascotEventName>);
    return () => mascot.off(name, fn);
  },

  off<K extends MascotEventName>(name: K, fn: Handler<K>) {
    handlers.get(name)?.delete(fn as Handler<MascotEventName>);
  },

  /** Access to the underlying machine (tests / debug panel). */
  _machine: machine,
};

export type MascotAPI = typeof mascot;
