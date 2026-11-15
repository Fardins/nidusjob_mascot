"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { ExpressionName } from "../expressions";
import { mascotStore, type ReactionName } from "../store";
import type { ClickReaction } from "../reactions";
import type { CharacterState } from "./characterState";
import { CritSpring } from "./physics/springs";
import { CLICK_LINES, CROSSFADE, EXPRESSION_CLIPS, IDLE_ROUTINE_AFTER, type ClipState } from "./rigConfig";
import type { BoneMap, ClipMap } from "./rigUtils";

const { damp, clamp } = THREE.MathUtils;
const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Store reactions → body clips. */
const REACTION_CLIPS: Record<ReactionName, ClipState> = {
  jump: "happy_bounce",
  wave: "wave",
  spin: "happy_bounce",
  nod: "talk_gesture",
  shake: "shy",
  squash: "surprised",
};

/** Procedural stand-ins when a clip is missing (or reduced motion is on). Duration in s. */
const PROC_DURATION: Partial<Record<ClipState | "spin" | "nod", number>> = {
  happy_bounce: 0.9,
  surprised: 0.55,
  shy: 1.6,
  wave: 1.6,
  talk_gesture: 1.2,
  look_around: 3.2,
  spin: 1.1,
  nod: 0.9,
};

const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _parentQ = new THREE.Quaternion();
const _worldQ = new THREE.Quaternion();
const _pos = new THREE.Vector3();

/** Additive world-space rotation about the character's local axis. */
function addRotation(bone: THREE.Object3D | undefined, root: THREE.Object3D, axis: [number, number, number], angle: number) {
  if (!bone || Math.abs(angle) < 1e-5) return;
  root.getWorldQuaternion(_q);
  _axis.set(...axis).applyQuaternion(_q);
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_worldQ);
  _worldQ.premultiply(_q.setFromAxisAngle(_axis, angle));
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_parentQ);
    bone.quaternion.copy(_parentQ.invert().multiply(_worldQ));
  } else bone.quaternion.copy(_worldQ);
  bone.updateMatrixWorld(true);
}

export interface DragInput {
  start(x: number): void;
  move(x: number): void;
  end(): void;
  readonly active: boolean;
}

export interface LocomotionBrain {
  /** Advance the state machine (crossfades, timers). Call before the mixer updates. */
  updateAnimation(t: number, dt: number): void;
  /** Additive procedural layers (breathing, head life, lean, root motion). Call after the mixer. */
  updateProcedural(t: number, dt: number): void;
  onClick(): void;
  onHover(hovered: boolean): void;
  drag: DragInput;
  /** Current expression after idle routines (what the face should show). */
  readonly expression: ExpressionName;
}

interface Options {
  mixer: THREE.AnimationMixer | null;
  model: THREE.Object3D;
  /** Outer group the brain moves for drag spin, hops and lean. */
  root: THREE.Object3D;
  clips: ClipMap;
  bones: BoneMap;
  cs: CharacterState;
  reducedMotion: boolean;
  clickReactions: ClickReaction[];
}

/**
 * The character's behaviour: a crossfading animation state machine with
 * random idle variations, plus procedural layers that always run on top.
 *
 *   base  — idle, or a held expression clip (thinking/surprised)
 *   one-shot — wave, happy_bounce, shy … fades in, plays once, fades back
 *   additive — breathing + head micro-motion, every frame, over everything
 */
export function useLocomotionBrain(o: Options): LocomotionBrain {
  return useMemo(() => {
    const { mixer, model, root, clips, bones, cs, reducedMotion, clickReactions } = o;
    const has = (s: ClipState) => !!clips.states[s];

    /* ------------------------------------------------------- mixer helpers */
    let current: THREE.AnimationAction | null = null;
    let baseState: ClipState = "idle";
    let oneShot: { state: ClipState | "variation"; endsAt: number; fade: number } | null = null;
    let nextVariation = rand(7, 14);
    let lastOneShot: ClipState | null = null;

    function fadeTo(clip: THREE.AnimationClip, once: boolean, t: number, timeScale = 1) {
      if (!mixer) return 0;
      const next = mixer.clipAction(clip, model);
      const fade = rand(CROSSFADE.min, CROSSFADE.max);
      if (next === current && !once) return fade;
      next.reset();
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(timeScale * (reducedMotion ? 0.85 : 1));
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      if (!once) next.time = Math.random() * clip.duration; // desync loops so they never look canned
      if (current && current !== next) next.crossFadeFrom(current, fade, true);
      else next.fadeIn(fade);
      next.play();
      current = next;
      if (once) {
        const len = clip.duration / Math.abs(next.getEffectiveTimeScale() || 1);
        oneShot = { state: "variation", endsAt: t + len, fade };
      }
      return fade;
    }

    function playBase(t: number) {
      const clip = clips.states[baseState] ?? clips.states.idle;
      if (clip) fadeTo(clip, false, t, rand(0.95, 1.05));
    }

    // Additive breathing clip, if the model ships one.
    if (mixer && clips.breath) {
      const additive = THREE.AnimationUtils.makeClipAdditive(clips.breath.clone());
      const a = mixer.clipAction(additive, model);
      a.blendMode = THREE.AdditiveAnimationBlendMode;
      a.setEffectiveWeight(reducedMotion ? 0.5 : 1);
      a.play();
    }
    if (clips.states.idle) playBase(0);

    /* ------------------------------------------------------- procedural state */
    let proc: { name: ClipState | "spin" | "nod"; start: number; dur: number } | null = null;
    let t0 = 0;
    const yaw = { value: 0, vel: 0, active: false, lastX: 0, lastT: 0, sinceRelease: 99 };
    const leanSpring = new CritSpring(6);
    const hop = new CritSpring(14);
    let hovered = false;
    let shyUntil = -1;
    let routine: { kind: "look" | "think"; until: number; step: number; nextStep: number } | null = null;
    let nextRoutine = 0;
    let expression: ExpressionName = mascotStore.get().expression;
    let lastExpression = expression;
    let lastReactionId = mascotStore.get().reaction?.id ?? -1;
    let lastMessageId = mascotStore.get().message?.id ?? -1;
    let clickIndex = 0;
    const prevRootPos = new THREE.Vector3();
    let prevYaw = 0;

    function play(state: ClipState, t: number, procName?: "spin" | "nod") {
      const clip = clips.states[state];
      lastOneShot = state;
      if (clip && mixer && !(reducedMotion && state === "happy_bounce")) {
        fadeTo(clip, true, t);
        if (oneShot) oneShot.state = state;
      }
      const name = procName ?? state;
      // Procedural layer still runs for spins/nods, and stands in for missing clips.
      if (procName || !clip) proc = { name, start: t, dur: PROC_DURATION[name] ?? 1 };
    }

    function react(name: ReactionName, t: number) {
      const r = reducedMotion && name === "spin" ? "nod" : name;
      play(REACTION_CLIPS[r], t, r === "spin" ? "spin" : r === "nod" ? "nod" : undefined);
    }

    /* ------------------------------------------------------- public API */
    const brain: LocomotionBrain = {
      get expression() {
        return expression;
      },

      updateAnimation(t, dt) {
        t0 = t;
        const s = mascotStore.get();
        const idleFor = (performance.now() - Math.max(cs.pointer.t, s.lastInteraction)) / 1000;

        // store reactions (trigger())
        if (s.reaction && s.reaction.id !== lastReactionId) {
          lastReactionId = s.reaction.id;
          react(s.reaction.name, t);
        }

        // talking: occasional gesture when a new line starts
        if (s.message && s.message.id !== lastMessageId) {
          lastMessageId = s.message.id;
          if (!oneShot && Math.random() < 0.6) play("talk_gesture", t);
        }

        // expression → base clip / one-shot
        expression = routine?.kind === "think" && s.expression === "happy" ? "thinking" : s.expression;
        if (expression !== lastExpression) {
          if (expression === "excited" && !oneShot) play("happy_bounce", t);
          lastExpression = expression;
        }
        const wantBase = EXPRESSION_CLIPS[expression] ?? "idle";
        const resolvedBase = has(wantBase) ? wantBase : "idle";
        if (resolvedBase !== baseState) {
          baseState = resolvedBase;
          if (!oneShot) playBase(t);
        }

        // one-shot finished → fade back to base slightly before the end
        if (oneShot && t >= oneShot.endsAt - oneShot.fade) {
          oneShot = null;
          playBase(t);
          nextVariation = t + rand(6, 14);
        }

        // idle variations at random intervals
        if (!oneShot && baseState === "idle" && !reducedMotion && t > nextVariation) {
          const pool = [...clips.idleVariations];
          if (clips.states.look_around && idleFor > 2) pool.push(clips.states.look_around);
          const clip = pool.length ? pick(pool) : null;
          if (clip) fadeTo(clip, true, t, rand(0.9, 1.08));
          nextVariation = t + rand(7, 15);
        }

        // idle routine after 8 s without interaction: look around, or think
        if (idleFor > IDLE_ROUTINE_AFTER && !s.attention) {
          if (!routine && t > nextRoutine) {
            const kind = Math.random() < 0.6 ? "look" : "think";
            routine = { kind, until: t + (kind === "look" ? rand(3, 4.5) : rand(3.5, 5)), step: 0, nextStep: t };
            if (kind === "look") {
              if (has("look_around") && !oneShot) play("look_around", t);
            } else if (has("thinking") && !oneShot) play("thinking", t);
          }
        } else if (routine) {
          routine = null;
          cs.idleLook = null;
        }
        if (routine) {
          if (t > routine.nextStep) {
            // a few distinct glances, holding each one
            cs.idleLook =
              routine.kind === "look"
                ? { x: rand(-1, 1) * (routine.step % 2 ? -1 : 1), y: rand(-0.2, 0.5) }
                : { x: rand(0.4, 0.8), y: rand(0.5, 0.9) };
            routine.step++;
            routine.nextStep = t + rand(0.7, 1.4);
          }
          if (t > routine.until) {
            routine = null;
            cs.idleLook = null;
            nextRoutine = t + rand(5, 9);
          }
        }

        // shy hover reaction expires
        if (shyUntil > 0 && t > shyUntil) shyUntil = -1;
        void dt; // the mixer itself is advanced by drei's useAnimations, right after this
      },

      updateProcedural(t, dt) {
        const m = cs.motionScale;

        /* ---- drag spin with inertia, then turn back to face the viewer */
        if (!yaw.active) {
          yaw.sinceRelease += dt;
          yaw.vel *= Math.exp(-2.8 * dt);
          if (yaw.sinceRelease > 1.4 && Math.abs(yaw.vel) < 1.5) {
            const home = Math.round(yaw.value / TAU) * TAU;
            yaw.vel += (home - yaw.value) * 9 * dt;
            yaw.vel *= Math.exp(-3 * dt);
          }
          yaw.value += yaw.vel * dt;
        }

        /* ---- procedural one-shots (spin, nod, and stand-ins for missing clips) */
        let py = 0;
        let pyaw = 0;
        let ppitch = 0;
        let proll = 0;
        let headNod = 0;
        if (proc) {
          const p = clamp((t - proc.start) / proc.dur, 0, 1);
          const env = Math.sin(p * Math.PI);
          switch (proc.name) {
            case "happy_bounce":
              py = Math.abs(Math.sin(p * Math.PI * 2)) * 0.16 * (1 - p * 0.4) * m;
              break;
            case "spin":
              pyaw = (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2) * TAU;
              py = env * 0.12 * m;
              break;
            case "surprised":
              ppitch = -env * 0.12 * m;
              py = env * 0.05 * m;
              break;
            case "shy":
              pyaw = -env * 0.35;
              proll = env * 0.08;
              headNod = env * 0.15;
              break;
            case "nod":
            case "talk_gesture":
              headNod = Math.sin(p * Math.PI * 3) * 0.12 * (1 - p);
              break;
            case "wave":
              proll = Math.sin(p * Math.PI * 4) * 0.05 * env;
              break;
            case "look_around":
              pyaw = Math.sin(p * TAU) * 0.25 * env;
              break;
          }
          if (p >= 1) proc = null;
        }

        /* ---- hover: lean toward the cursor (or turn away shyly) */
        cs.lean = leanSpring.step(hovered && shyUntil < 0 ? 1 : 0, dt);
        const shy = shyUntil > 0 ? 1 : 0;

        /* ---- root transform (outer group) */
        const sq = hop.step(0, dt);
        root.position.set(0, py, cs.lean * 0.08 * m);
        root.rotation.set(ppitch + cs.lean * 0.05, yaw.value + pyaw, proll + Math.sin(t * 0.55) * 0.012 * m);
        root.scale.set(1 + sq * 0.04, 1 - sq * 0.06, 1 + sq * 0.04);

        /* ---- additive: breathing (always on) */
        const breathRate = expression === "excited" ? 1.9 : expression === "surprised" ? 2.2 : 1.35;
        const br = Math.sin(t * breathRate * Math.PI * 0.75);
        addRotation(bones.spine, root, [1, 0, 0], br * 0.012 * m);
        addRotation(bones.chest, root, [1, 0, 0], br * 0.022 * m);
        if (bones.chest) {
          // ribs expand slightly forward/sideways on the in-breath (pose is reset each frame, so no drift)
          const k = 1 + (br * 0.5 + 0.5) * 0.012 * m;
          bones.chest.scale.set(bones.chest.scale.x * k, bones.chest.scale.y, bones.chest.scale.z * k);
        }

        /* ---- additive: head micro-movement (incommensurate sines ≈ smooth noise) */
        const nx = Math.sin(t * 0.73) * 0.6 + Math.sin(t * 1.91 + 1.3) * 0.4;
        const ny = Math.sin(t * 0.57 + 2.1) * 0.6 + Math.sin(t * 1.37 + 0.4) * 0.4;
        const nz = Math.sin(t * 0.41 + 0.9);
        addRotation(bones.head ?? bones.neck, root, [0, 1, 0], nx * 0.02 * m);
        addRotation(bones.head ?? bones.neck, root, [1, 0, 0], ny * 0.015 * m + headNod + shy * 0.12);
        addRotation(bones.head ?? bones.neck, root, [0, 0, 1], nz * 0.025 * m);

        /* ---- hover lean bends the upper body forward */
        addRotation(bones.chest ?? bones.spine, root, [1, 0, 0], cs.lean * 0.1 * m);

        /* ---- velocity for fur drag + jiggle drive */
        root.getWorldPosition(_pos);
        if (dt > 0) {
          cs.velocity.subVectors(_pos, prevRootPos).divideScalar(dt);
          const yawVel = (root.rotation.y - prevYaw) / dt;
          cs.velocity.x += -yawVel * 0.12; // turning swings the fur sideways
        }
        prevRootPos.copy(_pos);
        prevYaw = root.rotation.y;
        cs.velocity.clampLength(0, 3);
      },

      onClick() {
        const t = t0;
        const r = clickReactions.length ? clickReactions[clickIndex % clickReactions.length] : null;
        clickIndex++;
        // alternate wave / happy bounce, never the same twice in a row
        const body: ClipState = lastOneShot === "wave" ? "happy_bounce" : lastOneShot === "happy_bounce" ? "wave" : Math.random() < 0.5 ? "wave" : "happy_bounce";
        play(body, t);
        hop.v += 2.5;
        mascotStore.setExpression(r?.expression ?? (body === "wave" ? "happy" : "excited"), 2600, "happy");
        mascotStore.say(r?.say ?? pick(CLICK_LINES));
        mascotStore.touch();
      },

      onHover(h) {
        if (h === hovered) return;
        hovered = h;
        if (!h) return;
        hop.v += 1.2;
        // shy now and then, otherwise a curious lean
        if (Math.random() < 0.35) {
          shyUntil = t0 + 1.8;
          play("shy", t0);
        } else if (!oneShot) {
          mascotStore.setExpression("curious", 1600, "happy");
        }
      },

      drag: {
        get active() {
          return yaw.active;
        },
        start(x) {
          yaw.active = true;
          yaw.lastX = x;
          yaw.lastT = performance.now();
          yaw.vel = 0;
        },
        move(x) {
          if (!yaw.active) return;
          const now = performance.now();
          const dx = x - yaw.lastX;
          const step = dx * 0.012;
          yaw.value += step;
          const inst = step / Math.max((now - yaw.lastT) / 1000, 1 / 240);
          yaw.vel = damp(yaw.vel, inst, 18, (now - yaw.lastT) / 1000);
          yaw.lastX = x;
          yaw.lastT = now;
        },
        end() {
          if (!yaw.active) return;
          yaw.active = false;
          yaw.sinceRelease = 0;
          yaw.vel = clamp(yaw.vel, -14, 14);
        },
      },
    };
    return brain;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.mixer, o.model, o.root, o.clips, o.bones, o.cs, o.reducedMotion, o.clickReactions]);
}
