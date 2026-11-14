"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EXPRESSIONS, type ExpressionName, type ExpressionParams } from "./expressions";
import type { MascotMaterials } from "./materials";
import type { Rig } from "./rig";
import { mascotStore, type ReactionName } from "./store";

const { damp, clamp, lerp } = THREE.MathUtils;
const TAU = Math.PI * 2;

const REACTION_DURATION: Record<ReactionName, number> = {
  jump: 0.95,
  spin: 1.15,
  wave: 1.9,
  nod: 1.0,
  shake: 1.0,
  squash: 0.4,
};

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Damped spring integrator (semi-implicit Euler). */
class Spring {
  x = 0;
  v = 0;
  constructor(public k = 80, public c = 8) {}
  step(target: number, dt: number) {
    this.v += (-(this.x - target) * this.k - this.v * this.c) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export interface DragState {
  active: boolean;
  yaw: number;
  vel: number;
}

interface Options {
  reducedMotion?: boolean;
  drag: React.MutableRefObject<DragState>;
}

/**
 * The mascot's "brain": idle life, gaze tracking, expression blending,
 * one-shot reactions and secondary motion. Runs entirely in useFrame —
 * zero React re-renders per frame.
 */
export function useMascotBrain(rig: Rig, m: MascotMaterials, { reducedMotion = false, drag }: Options) {
  const gl = useThree((s) => s.gl);
  const motion = reducedMotion ? 0.35 : 1;

  const mem = useRef({
    p: { ...EXPRESSIONS.happy } as ExpressionParams,
    pointer: { x: 0, y: 0, t: -1e9 },
    head: new THREE.Vector2(),
    eye: new THREE.Vector2(),
    prevHeadYaw: 0,
    saccade: new THREE.Vector2(),
    nextSaccade: 0,
    blinkStart: -1,
    nextBlink: 1.5,
    doubleBlink: false,
    reaction: null as null | { name: ReactionName; start: number },
    lastReactionId: -1,
    idleLook: new THREE.Vector2(),
    idleExpr: null as ExpressionName | null,
    nextIdle: 4,
    lastHovered: false,
    lean: 0,
    antL: new Spring(70, 5),
    antR: new Spring(70, 5),
    antLx: new Spring(60, 5),
    antRx: new Spring(60, 5),
    tasselZ: new Spring(40, 3.5),
    tasselX: new Spring(40, 3.5),
    squash: new Spring(220, 12),
    prevY: 0,
    vy: 0,
  });

  // Global pointer tracking — the eyes follow the cursor anywhere on the page.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const mm = mem.current;
      mm.pointer.x = e.clientX;
      mm.pointer.y = e.clientY;
      mm.pointer.t = performance.now();
      mascotStore.touch();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const t = state.clock.elapsedTime;
    const mm = mem.current;
    const s = mascotStore.get();
    const nowMs = performance.now();
    const idleFor = (nowMs - Math.max(mm.pointer.t, s.lastInteraction)) / 1000;
    const rect = gl.domElement.getBoundingClientRect();

    /* -------------------------------------------------- reactions */
    if (s.reaction && s.reaction.id !== mm.lastReactionId) {
      mm.lastReactionId = s.reaction.id;
      let name = s.reaction.name;
      if (reducedMotion && name === "spin") name = "nod";
      mm.reaction = { name, start: t };
      mm.squash.v += name === "jump" ? 3.5 : name === "squash" ? 6 : 2;
      mm.antL.v += 6;
      mm.antR.v -= 6;
    }
    const r = mm.reaction;
    const rp = r ? clamp((t - r.start) / REACTION_DURATION[r.name], 0, 1) : 0;
    if (r && rp >= 1) {
      if (r.name === "jump") mm.squash.v += 4; // landing
      mm.reaction = null;
    }

    /* -------------------------------------------------- hover perk */
    if (s.hovered && !mm.lastHovered) {
      mm.squash.v += 2.5;
      mm.antL.v += 4;
      mm.antR.v -= 4;
    }
    mm.lastHovered = s.hovered;

    /* -------------------------------------------------- idle personality */
    if (idleFor > 6 && !s.attention) {
      if (t > mm.nextIdle) {
        const roll = Math.random();
        mm.idleLook.set(rand(-0.9, 0.9), rand(-0.35, 0.6));
        mm.idleExpr = roll < 0.25 ? "curious" : roll < 0.45 ? "thinking" : null;
        if (roll > 0.92) mascotStore.trigger("nod");
        mm.nextIdle = t + rand(2.2, 4.5);
      }
    } else {
      mm.idleExpr = null;
      mm.nextIdle = t + 2;
    }

    /* -------------------------------------------------- expression blend */
    let exprName: ExpressionName = s.expression;
    if (mm.idleExpr && s.expression === "happy") exprName = mm.idleExpr;
    if (s.hovered && (exprName === "neutral" || exprName === "happy")) exprName = "happy";
    const target = EXPRESSIONS[exprName];
    const p = mm.p;
    for (const k in target) {
      const key = k as keyof ExpressionParams;
      p[key] = damp(p[key], target[key], 7, dt);
    }
    const hoverBlush = s.hovered ? 0.25 : 0;

    /* -------------------------------------------------- gaze */
    let lx: number, ly: number;
    const focus = s.attention ?? (idleFor < 6 ? mm.pointer : null);
    if (focus && rect.width > 0) {
      const nx = (focus.x - (rect.left + rect.width / 2)) / (rect.width * 0.5);
      // head sits in the upper part of the canvas
      const ny = (focus.y - (rect.top + rect.height * 0.4)) / (rect.height * 0.5);
      lx = Math.tanh(nx * 0.85);
      ly = Math.tanh(-ny * 0.85);
    } else {
      lx = mm.idleLook.x;
      ly = mm.idleLook.y;
    }
    lx += p.gazeX * 0.6;
    ly += p.gazeY * 0.6;

    if (t > mm.nextSaccade) {
      mm.saccade.set(rand(-0.06, 0.06), rand(-0.04, 0.04));
      mm.nextSaccade = t + rand(0.35, 1.4);
    }

    mm.head.x = damp(mm.head.x, lx, 3.2, dt);
    mm.head.y = damp(mm.head.y, ly, 3.2, dt);
    mm.eye.x = damp(mm.eye.x, lx + mm.saccade.x, 16, dt);
    mm.eye.y = damp(mm.eye.y, ly + mm.saccade.y, 16, dt);

    /* -------------------------------------------------- blink */
    if (t > mm.nextBlink && mm.blinkStart < 0) {
      mm.blinkStart = t;
      mm.doubleBlink = Math.random() < 0.18;
    }
    let blink = 0;
    if (mm.blinkStart >= 0) {
      const bp = (t - mm.blinkStart) / 0.16;
      blink = bp < 1 ? Math.sin(bp * Math.PI) : 0;
      if (bp >= 1) {
        if (mm.doubleBlink) {
          mm.doubleBlink = false;
          mm.blinkStart = t + 0.06;
        } else {
          mm.blinkStart = -1;
          mm.nextBlink = t + rand(2, 5.5);
        }
      }
    }

    /* -------------------------------------------------- root: float, jump, spin, squash */
    if (rig.root) {
      let y = Math.sin(t * 1.15) * 0.065 * motion;
      y += Math.abs(Math.sin(t * 3.4)) * 0.09 * p.bounce * p.bounce * motion;
      let yaw = 0;
      if (r?.name === "jump") y += Math.sin(rp * Math.PI) * 0.5 * motion;
      if (r?.name === "spin") yaw += easeInOutCubic(rp) * TAU;

      // drag-to-spin with inertia, settling to the nearest full turn
      const d = drag.current;
      if (!d.active) {
        const home = Math.round(d.yaw / TAU) * TAU;
        d.vel += (home - d.yaw) * 14 * dt;
        d.vel *= Math.exp(-4.5 * dt);
        d.yaw += d.vel * dt;
      }
      yaw += d.yaw;

      mm.vy = (y - mm.prevY) / Math.max(dt, 1e-4);
      mm.prevY = y;

      mm.lean = damp(mm.lean, s.hovered ? 1 : 0, 5, dt);
      rig.root.position.y = y;
      rig.root.position.z = mm.lean * 0.12;
      rig.root.rotation.y = yaw + mm.head.x * 0.12;
      rig.root.rotation.x = mm.lean * 0.06;
      rig.root.rotation.z = Math.sin(t * 0.8) * 0.025 * motion;

      const sq = mm.squash.step(0, dt);
      rig.root.scale.set(1 + sq * 0.06, 1 - sq * 0.09, 1 + sq * 0.06);
    }

    /* -------------------------------------------------- body: breathing */
    if (rig.body) {
      const br = Math.sin(t * 1.6);
      rig.body.scale.set(1 - br * 0.008, 1 + br * 0.02, 1 + br * 0.01);
      rig.body.rotation.y = mm.head.x * 0.1;
    }

    /* -------------------------------------------------- head */
    let headYaw = 0;
    if (rig.head) {
      headYaw = mm.head.x * 0.5;
      let pitch = -mm.head.y * 0.3;
      if (r?.name === "nod") pitch += Math.sin(rp * Math.PI * 3) * 0.2 * (1 - rp);
      if (r?.name === "shake") headYaw += Math.sin(rp * Math.PI * 4) * 0.3 * (1 - rp);
      rig.head.rotation.set(
        pitch + Math.sin(t * 1.6 + 0.6) * 0.012,
        headYaw,
        p.headTilt - mm.head.x * 0.07 + Math.sin(t * 0.7) * 0.03 * motion,
      );
    }
    const headVel = (headYaw - mm.prevHeadYaw) / Math.max(dt, 1e-4);
    mm.prevHeadYaw = headYaw;

    /* -------------------------------------------------- eyes */
    const ex = clamp((mm.eye.x - mm.head.x * 0.5) * 0.55, -0.42, 0.42);
    const ey = clamp((mm.eye.y - mm.head.y * 0.4) * 0.45, -0.32, 0.32);
    const lidV = Math.min(1, Math.max(p.lidUpper - ey * 0.25, blink));
    const upper = lidV < 0 ? -1.22 + lidV * 0.95 : lerp(-1.22, 1.58, lidV);
    const lowerV = clamp(p.lidLower + blink * 0.2, 0, 1);
    const lower = Math.PI + clamp(1.5 - lowerV * 2.6, 0.15, 1.5);
    for (const eye of [rig.eyeL, rig.eyeR]) {
      eye.ball?.rotation.set(-ey, ex, 0);
      if (eye.pupil) {
        // scale across the cap; push out slightly when shrinking so the rim never sinks into the iris
        const ps = damp(eye.pupil.scale.x, p.pupil, 10, dt);
        eye.pupil.scale.set(ps, 1 + Math.max(0, 1 - ps) * 0.08, ps);
      }
      if (eye.lidUpper) eye.lidUpper.rotation.x = upper;
      if (eye.lidLower) eye.lidLower.rotation.x = lower;
    }

    /* -------------------------------------------------- brows */
    const browBounce = blink * -0.01;
    if (rig.browL.lift) rig.browL.lift.position.y = p.browY + p.browAsym + browBounce;
    if (rig.browR.lift) rig.browR.lift.position.y = p.browY - p.browAsym * 0.4 + browBounce;
    if (rig.browL.tilt) rig.browL.tilt.rotation.z = p.browTilt;
    if (rig.browR.tilt) rig.browR.tilt.rotation.z = -p.browTilt;

    /* -------------------------------------------------- mouth (+ talking flap) */
    const talking = s.message ? (Math.sin(t * 17) * 0.5 + 0.5) * 0.4 * (0.6 + 0.4 * Math.sin(t * 5.3)) : 0;
    const open = clamp(p.mouthOpen + talking, 0, 1);
    if (rig.smile) {
      const fade = 1 - open * (1 - p.smile);
      rig.smile.scale.set(p.mouthWidth * Math.max(fade, 0.001), (0.3 + 0.7 * Math.max(p.smile, 0)) * Math.max(fade, 0.001), 1);
    }
    if (rig.mouthOpen) {
      rig.mouthOpen.visible = open > 0.02;
      rig.mouthOpen.scale.set(0.55 + 0.45 * p.mouthWidth * (1 - p.mouthOpen * 0.35), open * 1.05, 1);
    }

    /* -------------------------------------------------- arms */
    let armR = 0.32 + p.arms * 2.25 + Math.sin(t * 6) * 0.14 * p.arms;
    let armL = 0.32 + p.arms * 2.25 + Math.sin(t * 6 + 1.3) * 0.14 * p.arms;
    if (r?.name === "wave") {
      const w = Math.sin(rp * Math.PI);
      armR = lerp(armR, 2.55 + Math.sin(rp * Math.PI * 7) * 0.38, Math.min(1, w * 2.2));
    }
    const sway = Math.sin(t * 1.6) * 0.04 * motion;
    if (rig.armR) rig.armR.rotation.set(sway, 0, armR);
    if (rig.armL) rig.armL.rotation.set(-sway, 0, -armL);

    /* -------------------------------------------------- secondary motion */
    const energy = p.antenna * motion;
    const f = 1.7 + p.antenna * 2.2;
    const drive = -headVel * 0.06 - mm.vy * 0.12;
    if (rig.antennaL) {
      rig.antennaL.rotation.z = mm.antL.step(Math.sin(t * f) * 0.07 * energy + drive, dt);
      rig.antennaL.rotation.x = mm.antLx.step(Math.sin(t * f * 0.8 + 1) * 0.05 * energy + mm.vy * 0.08, dt);
    }
    if (rig.antennaR) {
      rig.antennaR.rotation.z = mm.antR.step(Math.sin(t * f + 2.1) * 0.07 * energy + drive, dt);
      rig.antennaR.rotation.x = mm.antRx.step(Math.sin(t * f * 0.8 + 2.4) * 0.05 * energy + mm.vy * 0.08, dt);
    }
    if (rig.tassel) {
      rig.tassel.rotation.z = mm.tasselZ.step(-headVel * 0.12 + Math.sin(t * 1.3) * 0.05, dt);
      rig.tassel.rotation.x = mm.tasselX.step(mm.vy * 0.25 - mm.head.y * 0.2, dt);
    }

    /* -------------------------------------------------- materials */
    m.blush.opacity = 0.12 + (p.blush + hoverBlush) * 0.42;
    m.antennaTip.emissiveIntensity = p.glow * (0.75 + 0.25 * Math.sin(t * 3.1));
    m.iris.emissiveIntensity = 0.12 + p.glow * 0.1;
    m.badge.emissiveIntensity = 0.2 + 0.15 * Math.sin(t * 2);
  });
}
