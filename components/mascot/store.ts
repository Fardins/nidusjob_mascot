"use client";

import { useSyncExternalStore } from "react";
import type { ExpressionName } from "./brain/expressions";
import type { EmotionState } from "./brain/emotion";
import type { VisemeKey } from "./brain/visemes";
import { PROFILES, type BehaviorProfile } from "./brain/profiles";
import type { AssistantState, FxName, GestureName, Placement, ReactionName, StatePhase } from "./brain/types";

export type { ReactionName } from "./brain/types";

/**
 * Tiny dependency-free store shared between the 3D scene (read every frame
 * via `mascotStore.get()`, no React re-renders) and the DOM UI (subscribed
 * via `useMascot()`). The behaviour logic lives in `brain/`; this is only
 * the transport.
 */

export interface SpeechState {
  id: number;
  /** performance.now() (ms) when the utterance started. */
  start: number;
  text: string;
  /** Viseme timeline relative to `start` (seconds). */
  keys: VisemeKey[];
  /** Beat-gesture times relative to `start` (seconds). */
  beats: number[];
  /** Optional audio element (the analyser drives the mouth when attached). */
  audio: HTMLMediaElement | null;
  /** Use the audio element's clock for the timeline (TTS with viseme timestamps). */
  audioClock: boolean;
  /** True once no more text will be appended. */
  final: boolean;
}

export interface FxEvent {
  name: FxName;
  id: number;
  /** Optional screen/world hint, e.g. ripple position in client px. */
  x?: number;
  y?: number;
}

export interface MascotState {
  /** Expression the character is currently showing (override ?? state expression). */
  expression: ExpressionName;
  /** Expression wanted by the assistant state. */
  baseExpression: ExpressionName;
  /** Temporary expression set via setExpression(). */
  override: ExpressionName | null;
  /** One-shot body animation. `id` changes on every trigger. */
  reaction: { name: ReactionName; id: number } | null;
  /** Talking gesture. */
  gesture: { name: GestureName; id: number; duration: number } | null;
  /** Speech bubble text (null = hidden). */
  message: { text: string; id: number } | null;
  /** Screen-space point (client px) the mascot should look at instead of the cursor. */
  attention: { x: number; y: number } | null;
  /** Live element target (its rect is re-read every frame). */
  attentionEl: Element | null;
  /** Timestamp (ms) of the last user interaction with the page/mascot. */
  lastInteraction: number;
  /** Whether the pointer is over the character. */
  hovered: boolean;

  /* --------------------------------------------------- assistant */
  assistantState: AssistantState;
  phase: StatePhase;
  /** performance.now() (ms) when the current state was entered. */
  stateSince: number;
  thinkingEscalated: boolean;
  emotion: EmotionState | null;
  speech: SpeechState | null;
  /** Hot path (no notify): live speech loudness 0…1 for antenna/logo. */
  amplitude: number;
  /** Recent transient effects; renderers consume ids they haven't seen. */
  fx: FxEvent[];
  /** Hologram card topic shown while answering. */
  card: string | null;

  /* --------------------------------------------------- presentation */
  placement: Placement;
  chatOpen: boolean;
  micActive: boolean;
  profile: BehaviorProfile;
  accessory: "scarf" | null;
  /** Tassel side (flipped as a graduation easter egg). */
  tasselSide: 1 | -1;
  /** Debug override for the quality tier. */
  qualityOverride: "low" | "mobile" | "medium" | "high" | null;
  /** WebGL unavailable / lost — show the static fallback. */
  webglFailed: boolean;
}

type Listener = () => void;

let state: MascotState = {
  expression: "happy",
  baseExpression: "happy",
  override: null,
  reaction: null,
  gesture: null,
  message: null,
  attention: null,
  attentionEl: null,
  lastInteraction: 0,
  hovered: false,
  assistantState: "offscreen",
  phase: "loop",
  stateSince: 0,
  thinkingEscalated: false,
  emotion: null,
  speech: null,
  amplitude: 0,
  fx: [],
  card: null,
  placement: "hero",
  chatOpen: false,
  micActive: false,
  profile: PROFILES.home,
  accessory: null,
  tasselSide: 1,
  qualityOverride: null,
  webglFailed: false,
};

const listeners = new Set<Listener>();
let seq = 0;
let expressionTimer: ReturnType<typeof setTimeout> | undefined;
let messageTimer: ReturnType<typeof setTimeout> | undefined;

function set(patch: Partial<MascotState>) {
  state = { ...state, ...patch };
  if ("override" in patch || "baseExpression" in patch) state.expression = state.override ?? state.baseExpression;
  listeners.forEach((l) => l());
}

export const nextId = () => ++seq;

export const mascotStore = {
  get: () => state,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** Low-level patch (used by the brain/API). */
  set,

  /**
   * Show an expression. With `holdMs`, it reverts afterwards to `revertTo`
   * (or to the expression of the current assistant state).
   */
  setExpression(expression: ExpressionName, holdMs?: number, revertTo?: ExpressionName) {
    clearTimeout(expressionTimer);
    set({ override: expression });
    if (holdMs) expressionTimer = setTimeout(() => set({ override: revertTo ?? null }), holdMs);
  },

  /** Drop any temporary expression and return to the state's own face. */
  clearExpression() {
    clearTimeout(expressionTimer);
    set({ override: null });
  },

  trigger(name: ReactionName) {
    set({ reaction: { name, id: ++seq } });
  },

  gesture(name: GestureName, duration = 1.4) {
    set({ gesture: { name, id: ++seq, duration } });
  },

  fx(name: FxName, x?: number, y?: number) {
    const fx = [...state.fx.slice(-7), { name, id: ++seq, x, y }];
    set({ fx });
  },

  say(text: string, ms = 2800) {
    clearTimeout(messageTimer);
    set({ message: { text, id: ++seq } });
    messageTimer = setTimeout(() => set({ message: null }), ms);
  },

  hideMessage() {
    clearTimeout(messageTimer);
    set({ message: null });
  },

  /** Make the mascot look at a DOM element (e.g. a CTA on hover). Pass null to release. */
  lookAtElement(el: Element | null) {
    if (!el) return set({ attention: null, attentionEl: null });
    const r = el.getBoundingClientRect();
    set({ attentionEl: el, attention: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
  },

  /** Look at a client-px point. Pass null to release. */
  lookAtPoint(p: { x: number; y: number } | null) {
    set({ attention: p, attentionEl: null });
  },

  setHovered(hovered: boolean) {
    if (hovered !== state.hovered) set({ hovered });
  },

  touch() {
    state.lastInteraction = performance.now(); // hot path: no notify
  },
};

/** Current attention point in client px (live for element targets), or null. */
export function getAttentionPoint(): { x: number; y: number } | null {
  const el = state.attentionEl;
  if (el) {
    if (!el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return state.attention;
}

/** React hook for DOM components. */
export function useMascot<T = MascotState>(selector: (s: MascotState) => T = (s) => s as T): T {
  return useSyncExternalStore(
    mascotStore.subscribe,
    () => selector(state),
    () => selector(state),
  );
}
