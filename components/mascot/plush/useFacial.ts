"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { ExpressionName } from "../expressions";
import { mascotStore } from "../store";
import type { CharacterState } from "./characterState";
import { EXPRESSION_MORPHS } from "./rigConfig";
import type { MorphRegistry } from "./rigUtils";
import { readAudioVisemes } from "./lipSync";

const { damp, clamp } = THREE.MathUtils;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ facial */

export interface Facial {
  update(t: number, dt: number, expression: ExpressionName): void;
  readonly hasFace: boolean;
}

const ALL_EXPRESSION_MORPHS = [...new Set(Object.values(EXPRESSION_MORPHS).flatMap((m) => Object.keys(m)))];

/**
 * Blinks, eye micro-movements, expression blendshapes and lip motion.
 * Every value is damped so expression changes always blend smoothly.
 */
export function useFacial(morphs: MorphRegistry, cs: CharacterState): Facial {
  return useMemo(() => {
    const k = morphs.keys;
    const exprNames = ALL_EXPRESSION_MORPHS.filter((n) => morphs.byName.has(n));
    const current: Record<string, number> = Object.fromEntries(exprNames.map((n) => [n, 0]));
    const hasFace = exprNames.length > 0 || !!(k.blink || k.blinkL || k.jawOpen);

    let nextBlink = rand(1.2, 3);
    let blinkStart = -1;
    let doubleBlink = false;
    let blinkDur = 0.18;
    let nextSaccade = 0;
    let lastEyeX = 0;
    let lastEyeY = 0;
    // procedural speech: one "syllable" at a time
    let syl = { start: 0, len: 0.15, open: 0, shape: 0 };
    const mouth = { open: 0, o: 0, e: 0 };

    const set = (key: string | undefined, v: number) => key && morphs.set(key, clamp(v, 0, 1));

    function blinkCurve(t: number) {
      if (blinkStart < 0) return 0;
      const p = (t - blinkStart) / blinkDur;
      if (p < 0) return 0;
      if (p >= 1) {
        if (doubleBlink) {
          doubleBlink = false;
          blinkStart = t + 0.07;
        } else {
          blinkStart = -1;
          nextBlink = t + rand(2, 6);
        }
        return 0;
      }
      // close fast (35%), reopen slower
      return p < 0.35 ? Math.sin((p / 0.35) * Math.PI * 0.5) : Math.cos(((p - 0.35) / 0.65) * Math.PI * 0.5);
    }

    return {
      hasFace,
      update(t, dt, expression) {
        const s = mascotStore.get();
        const motion = cs.motionScale;

        /* ---- saccades: small, quick re-fixations; bigger right after a gaze shift */
        if (t > nextSaccade) {
          const amp = 0.035 * (motion < 1 ? 0.5 : 1);
          cs.saccade.x = rand(-amp, amp);
          cs.saccade.y = rand(-amp * 0.6, amp * 0.6);
          nextSaccade = t + rand(0.3, 1.6);
        }

        /* ---- blinks: random 2–6 s, ~18% double, and often on a big gaze jump */
        const jump = Math.hypot(cs.eyeYaw + cs.headYaw - lastEyeX, cs.eyePitch + cs.headPitch - lastEyeY);
        lastEyeX = cs.eyeYaw + cs.headYaw;
        lastEyeY = cs.eyePitch + cs.headPitch;
        if (blinkStart < 0 && (t > nextBlink || (jump > 0.06 && Math.random() < 0.35))) {
          blinkStart = t;
          blinkDur = rand(0.15, 0.22);
          doubleBlink = Math.random() < 0.18;
        }
        const blink = blinkCurve(t);

        /* ---- expression blendshapes */
        const targets = EXPRESSION_MORPHS[s.hovered && (expression === "neutral" || expression === "happy") ? "happy" : expression];
        for (const n of exprNames) {
          current[n] = damp(current[n], targets[n] ?? 0, 9, dt);
          morphs.set(n, current[n]);
        }

        /* ---- lids follow the eyes (look down → lids drop a little) + blink */
        const lidFollow = clamp(-cs.eyePitch * 0.6, 0, 0.3);
        const squintL = current["eyesquintleft"] ?? 0;
        const squintR = current["eyesquintright"] ?? 0;
        set(k.blinkL, Math.max(blink, lidFollow + squintL * 0.2));
        set(k.blinkR, Math.max(blink, lidFollow + squintR * 0.2));
        if (!k.blinkL) set(k.blink, Math.max(blink, lidFollow));

        /* ---- eye look morphs (for rigs without eye bones) */
        const ex = clamp(cs.eyeYaw / 0.5, -1, 1);
        const ey = clamp(cs.eyePitch / 0.35, -1, 1);
        set(k.lookOutL, ex);
        set(k.lookInR, ex);
        set(k.lookInL, -ex);
        set(k.lookOutR, -ex);
        set(k.lookUpL, ey);
        set(k.lookUpR, ey);
        set(k.lookDownL, -ey);
        set(k.lookDownR, -ey);

        /* ---- speech */
        const audio = readAudioVisemes();
        let open = 0;
        let o = 0;
        let e = 0;
        if (audio) [open, o, e] = audio;
        else if (s.message) {
          if (t > syl.start + syl.len) {
            // new syllable: short pauses between words, varied openness and shape
            const pause = Math.random() < 0.16;
            syl = { start: t, len: pause ? rand(0.12, 0.25) : rand(0.09, 0.19), open: pause ? 0 : rand(0.35, 1), shape: Math.random() };
          }
          const p = (t - syl.start) / syl.len;
          open = syl.open * Math.sin(Math.min(1, p) * Math.PI);
          o = syl.shape < 0.35 ? open : 0;
          e = syl.shape > 0.7 ? open : 0;
        }
        mouth.open = damp(mouth.open, open, 22, dt);
        mouth.o = damp(mouth.o, o, 18, dt);
        mouth.e = damp(mouth.e, e, 18, dt);

        const exprJaw = current["jawopen"] ?? 0;
        if (k.jawOpen) set(k.jawOpen, Math.max(exprJaw, mouth.open * (k.visemeAA ? 0.55 : 0.7)));
        set(k.visemeAA, mouth.open - mouth.o - mouth.e);
        set(k.visemeO, mouth.o);
        set(k.visemeE, mouth.e);
      },
    };
  }, [morphs, cs]);
}
