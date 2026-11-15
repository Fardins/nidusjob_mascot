"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BASE_PARAMS, copyParams, EXPRESSION_META, EXPRESSIONS, type LogoMode } from "./brain/expressions";
import { emotionParams, overlayEmotion } from "./brain/emotion";
import { urlFlags } from "./brain/rng";
import { sampleTimeline, textToVisemes, VisemeMixer, type VisemeKey } from "./brain/visemes";
import type { AssistantState } from "./brain/types";
import { FacialBlender } from "./animation/facial";
import { GestureLayer } from "./animation/gestures";
import { Blink, Breathing, Float, HeadNoise, MicroExpressions } from "./animation/layers";
import { LookAt, type GazeOverride } from "./animation/lookAt";
import { blendArm, createPose, sceneSignals } from "./animation/pose";
import { ReactionLayer } from "./animation/reactions";
import { Secondary } from "./animation/secondary";
import { Spring } from "./animation/springs";
import { applyPose } from "./render/applyPose";
import { antennaModeForState, updateAntennaTips } from "./render/antennaModes";
import { LOGO_MODE_INDEX } from "./render/logoMaterial";
import { drawWristScreen } from "./render/wristScreen";
import { readAudioVisemes } from "./plush/lipSync";
import type { MascotMaterials } from "./materials";
import type { Rig } from "./rig";
import { mascotStore } from "./store";

const { clamp } = THREE.MathUtils;
const TAU = Math.PI * 2;

export interface DragState {
  active: boolean;
  yaw: number;
  vel: number;
}

interface Options {
  reducedMotion?: boolean;
  drag: React.MutableRefObject<DragState>;
}

function logoModeFor(state: AssistantState, fallback: LogoMode): LogoMode {
  if (state === "thinking") return "loading";
  if (state === "speaking") return "equalizer";
  if (state === "success") return "check";
  if (state === "error") return "alert";
  return fallback;
}

/**
 * The mascot's per-frame orchestrator. Runs the animation layers in order
 * (expression blend → reactions → gestures → look-at → breathing → blink →
 * float → head noise → speech) into one Pose, then applies it. Zero React
 * re-renders per frame and no allocations in the frame loop.
 */
export function useMascotBrain(rig: Rig, m: MascotMaterials, { reducedMotion = false, drag }: Options) {
  const gl = useThree((s) => s.gl);

  const mem = useMemo(
    () => ({
      pose: createPose(),
      facial: new FacialBlender(EXPRESSIONS.happy),
      target: { ...BASE_PARAMS },
      emo: { ...BASE_PARAMS },
      breathing: new Breathing(),
      blink: new Blink(),
      float: new Float(),
      headNoise: new HeadNoise(),
      micro: new MicroExpressions(),
      lookAt: new LookAt(),
      reactions: new ReactionLayer(),
      gestures: new GestureLayer(),
      secondary: new Secondary(),
      visemes: new VisemeMixer(),
      squash: new Spring(190, 11),
      scroll: new Spring(60, 5),
      override: { x: 0, y: 0, w: 0 } as GazeOverride,
      lastReactionId: -1,
      lastGestureId: -1,
      lastFxId: -1,
      lastMessageId: -1,
      msgKeys: [] as VisemeKey[],
      msgStart: 0,
      lastHovered: false,
      prevHeadYaw: 0,
      prevRootYaw: 0,
      prevY: 0,
      vy: 0,
      lean: 0,
      browFlash: -10,
      glint: -10,
      logo: { a: 0, b: 0, mix: 1 },
      nextWrist: 0,
      tasselX: 0.4,
      frame: 0,
      lastState: "offscreen" as AssistantState,
    }),
    [],
  );

  useEffect(() => {
    mem.lookAt.attach();
    return () => mem.lookAt.detach();
  }, [mem]);

  useFrame((state, rawDt) => {
    const mm = mem;
    mm.frame++;
    let dt = Math.min(rawDt, 1 / 20);
    let t = state.clock.elapsedTime;
    if (urlFlags.freeze) {
      // deterministic snapshots: fixed timestep, then hold still
      dt = mm.frame > 120 ? 0 : 1 / 60;
      t = Math.min(mm.frame, 120) / 60;
    }
    const s = mascotStore.get();
    const reduced = reducedMotion;
    const motion = reduced ? 0 : 1;
    const nowMs = performance.now();
    const rect = gl.domElement.getBoundingClientRect();

    /* ------------------------------------------------ events from the store */
    if (s.reaction && s.reaction.id !== mm.lastReactionId) {
      mm.lastReactionId = s.reaction.id;
      mm.reactions.play(s.reaction.name, t, reduced);
      mm.squash.impulse(s.reaction.name === "squash" ? 5 : 1.5);
      mm.secondary.twitch(0.8);
      if (s.reaction.name === "startle") mm.blink.trigger(t + 0.5, true);
    }
    if (s.gesture && s.gesture.id !== mm.lastGestureId) {
      mm.lastGestureId = s.gesture.id;
      mm.gestures.push(s.gesture.id, s.gesture.name, s.gesture.duration, t);
      if (s.gesture.name === "bigIdea") mm.glint = t;
    }
    for (const fx of s.fx) {
      if (fx.id <= mm.lastFxId) continue;
      mm.lastFxId = fx.id;
      if (fx.name === "twitch") mm.secondary.twitch(1.2);
      if (fx.name === "browFlash") mm.browFlash = t;
      if (fx.name === "glint") mm.glint = t;
    }
    if (s.assistantState !== mm.lastState) {
      if (s.assistantState === "success" || s.assistantState === "welcome") mm.glint = t + 0.2;
      if (s.assistantState === "listening") mm.secondary.twitch(1);
      mm.lastState = s.assistantState;
    }
    if (s.message && s.message.id !== mm.lastMessageId) {
      mm.lastMessageId = s.message.id;
      mm.msgKeys = textToVisemes(s.message.text);
      mm.msgStart = nowMs;
      mm.secondary.twitch(0.6);
    }
    if (s.hovered && !mm.lastHovered) {
      mm.squash.impulse(2.5);
      mm.secondary.twitch(0.7);
    }
    mm.lastHovered = s.hovered;

    /* ------------------------------------------------ expression target */
    let expr = s.expression;
    if (s.hovered && (expr === "neutral" || expr === "happy")) expr = "happy";
    const base = EXPRESSIONS[expr];
    if (s.emotion) overlayEmotion(mm.target, base, emotionParams(mm.emo, s.emotion), s.emotion.intensity);
    else copyParams(mm.target, base);
    mm.target.bounce *= 0.4 + 0.6 * s.profile.energy;
    if (mm.frame === 1) mm.facial.snap(mm.target);
    const p = mm.facial.update(mm.target, t, dt, reduced ? 0.5 : 1);

    /* ------------------------------------------------ layers */
    const R = mm.reactions;
    R.update(t, dt, motion, reduced);
    const ro = R.out;
    const G = mm.gestures;
    G.update(t, dt);
    mm.micro.update(t, dt, s.assistantState === "idle" ? 1 : 0.5);

    const ov = mm.override;
    if (ro.gazeW >= G.gazeW) {
      ov.x = ro.gazeX;
      ov.y = ro.gazeY;
      ov.w = ro.gazeW;
    } else {
      ov.x = G.gazeX;
      ov.y = G.gazeY;
      ov.w = G.gazeW;
    }
    const L = mm.lookAt;
    L.update(t, dt, rect, { x: p.gazeX, y: p.gazeY }, ov, reduced ? 0.4 : 1);
    const breath = mm.breathing.update(dt, p.breathRate, p.breathDepth * (reduced ? 0.5 : 1));
    const heavy = clamp((p.lidUpper - 0.3) / 0.4, 0, 1);
    const blink = mm.blink.update(t, p.blinkRate, heavy, L.gazeJump);
    mm.float.update(dt, p.float * motion);
    mm.headNoise.update(t, reduced ? 0.3 : 1);

    /* ------------------------------------------------ speech → mouth channels */
    let ch;
    const sp = s.speech;
    if (sp) {
      const audio = !sp.audioClock ? readAudioVisemes() : null;
      if (audio) ch = mm.visemes.updateFromAudio(dt, audio[0], audio[1], audio[2]);
      else {
        const tt = sp.audioClock && sp.audio ? sp.audio.currentTime : (nowMs - sp.start) / 1000;
        const v = sampleTimeline(sp.keys, tt);
        ch = mm.visemes.update(dt, v.cur, v.next, v.k);
      }
    } else if (s.message && mm.msgKeys.length) {
      const v = sampleTimeline(mm.msgKeys, (nowMs - mm.msgStart) / 1000);
      ch = mm.visemes.update(dt, v.cur, v.next, v.k, 0.85);
    } else ch = mm.visemes.relax(dt);
    const amplitude = ch.jaw;
    sceneSignals.amplitude = amplitude;
    s.amplitude = amplitude; // hot path, no notify

    /* ------------------------------------------------ compose the pose */
    const P = mm.pose;

    // root: float + idle bounce + reactions + scroll wobble + drag-to-spin
    const bounceY = Math.abs(Math.sin(t * 3.4)) * 0.09 * p.bounce * p.bounce * motion;
    const sink = (1 - Math.min(1, p.float)) * -0.07;
    const wobble = mm.scroll.step(clamp(sceneSignals.scrollVel / 3000, -0.6, 0.6), dt) * motion;
    const d = drag.current;
    if (!d.active) {
      const home = Math.round(d.yaw / TAU) * TAU;
      d.vel += (home - d.yaw) * 14 * dt;
      d.vel *= Math.exp(-4.5 * dt);
      d.yaw += d.vel * dt;
    }
    mm.lean += ((s.hovered ? 1 : 0) - mm.lean) * (1 - Math.exp(-5 * dt));

    P.rootY = mm.float.y + bounceY + sink + ro.y - wobble * 0.05;
    P.rootX = ro.x;
    P.rootZ = mm.lean * 0.12 + ro.z + p.lean * 0.05;
    P.rootYaw = ro.yaw + d.yaw + L.head.x * 0.12;
    P.rootPitch = mm.lean * 0.06 + mm.float.pitch + ro.pitch + p.lean * 0.04 + wobble * 0.08;
    P.rootRoll = mm.float.roll + ro.roll;
    P.squash = mm.squash.step(ro.squash, dt);

    const vy = (P.rootY - mm.prevY) / Math.max(dt, 1e-4);
    mm.vy = dt > 0 ? vy : 0;
    mm.prevY = P.rootY;

    // torso
    P.chest = breath;
    P.bodyYaw = L.head.x * 0.1;
    P.bodyPitch = ro.bodyPitch + p.slump * 0.06;
    P.bodyRoll = 0;
    P.shoulders = ro.shoulders + G.shoulders + breath * 0.035 - p.slump * 0.05;

    // head: look-at + expression + reactions + gestures + noise; trails the chest breath
    P.headYaw = L.head.x * 0.5 + ro.headYaw + mm.headNoise.yaw;
    P.headPitch = L.head.y * 0.3 + p.headPitch + ro.headPitch + G.headPitch + mm.headNoise.pitch - mm.breathing.delayed * 0.015;
    P.headRoll = p.headTilt - L.head.x * 0.07 + mm.headNoise.roll + ro.headRoll + G.headRoll;

    // eyes (relative to the head)
    const ex = clamp((L.eye.x - L.head.x * 0.5) * 0.55, -0.42, 0.42);
    const ey = clamp((L.eye.y - L.head.y * 0.4) * 0.45, -0.32, 0.32);
    P.eyeYaw = ex;
    P.eyePitch = ey;
    P.converge = L.converge;
    P.pupil = p.pupil * (1 + (s.emotion ? s.emotion.arousal * 0.1 : 0));
    P.dizzy = p.dizzy;

    // lids follow the gaze (looking down lowers them) + blink + winks
    const upperBase = p.lidUpper - ey * 0.35 + mm.micro.squint + ro.lidClose;
    P.lidUpperL = Math.max(Math.min(1, upperBase + p.winkL), blink);
    P.lidUpperR = Math.max(Math.min(1, upperBase + p.winkR), blink);
    const lowerBase = p.lidLower + ro.happyEyes + mm.micro.squint * 0.5 + blink * 0.2;
    P.lidLowerL = lowerBase + p.winkL * 0.35;
    P.lidLowerR = lowerBase + p.winkR * 0.35;

    // brows: 3 points each; quick flash on greeting; tiny dip on blink
    const fl = t - mm.browFlash;
    const flash = fl >= 0 && fl < 0.32 ? Math.sin((fl / 0.32) * Math.PI) * 0.035 : 0;
    const raise = ro.browRaise;
    const midL = p.browY + p.browAsym + flash + raise * (ro.browSide < 0 ? 1 : 0.25) - blink * 0.01;
    const midR = p.browY - p.browAsym * 0.4 + flash + raise * (ro.browSide > 0 ? 1 : 0.25) - blink * 0.01;
    P.browL.mid = midL;
    P.browL.inner = midL + p.browTilt * 0.065 + p.browInner;
    P.browL.outer = midL - p.browTilt * 0.065 + p.browOuter;
    P.browR.mid = midR;
    P.browR.inner = midR + p.browTilt * 0.065 + p.browInner;
    P.browR.outer = midR - p.browTilt * 0.065 + p.browOuter;

    // mouth (expression) + speech channels; emotion keeps smiling while talking
    P.smile = clamp(p.smile + ro.smile + mm.micro.smile, -1, 1);
    P.mouthOpen = clamp(p.mouthOpen + ro.mouthOpen, 0, 1);
    P.mouthWidth = p.mouthWidth;
    P.mouthSkew = clamp(p.mouthSkew + ro.mouthSkew + mm.micro.skew, -1, 1);
    P.pucker = clamp(p.pucker + ro.pucker, 0, 1);
    P.jaw = ch.jaw;
    P.lipRound = ch.round;
    P.lipWide = ch.wide;
    P.lipClosed = ch.closed;
    P.teethLip = ch.teethLip;
    P.tongue = ch.tongue;

    P.blush = p.blush + (s.hovered ? 0.25 : 0);
    P.cheekPuff = p.cheekPuff;

    // arms: base (expression) → gestures → reactions (highest layer)
    const armsUp = p.arms;
    const sway = Math.sin(t * 1.6) * 0.04 * motion;
    P.armL.raise = 0.32 + armsUp * 2.25 + Math.sin(t * 6 + 1.3) * 0.14 * armsUp;
    P.armR.raise = 0.32 + armsUp * 2.25 + Math.sin(t * 6) * 0.14 * armsUp;
    P.armL.forward = -sway + amplitude * 0.06;
    P.armR.forward = sway + amplitude * 0.1;
    P.armL.twist = P.armR.twist = 0;
    P.armL.elbow = 0.15 + 0.15 * armsUp + amplitude * 0.15;
    P.armR.elbow = 0.15 + 0.15 * armsUp + amplitude * 0.25;
    if (G.wL > 0) blendArm(P.armL, G.armL, G.wL);
    if (G.wR > 0) blendArm(P.armR, G.armR, G.wR);
    if (ro.wL > 0) blendArm(P.armL, ro.armL, ro.wL);
    if (ro.wR > 0) blendArm(P.armR, ro.armR, ro.wR);

    P.antennaEnergy = p.antenna * (reduced ? 0.5 : 1);
    P.droop = p.droop;
    P.glow = p.glow;
    P.glassesDrop = (s.profile.glassesLow ? 0.5 : 0) + ro.glassesDrop;
    P.capTilt = 0.07 + ro.capTilt;
    P.floatHeight = P.rootY;

    applyPose(rig, P);

    /* ------------------------------------------------ secondary motion */
    const headVel = dt > 0 ? (P.headYaw - mm.prevHeadYaw) / dt : 0;
    const yawVel = dt > 0 ? (P.rootYaw - mm.prevRootYaw) / dt : 0;
    mm.prevHeadYaw = P.headYaw;
    mm.prevRootYaw = P.rootYaw;
    const so = mm.secondary.update(t, dt, P.antennaEnergy, P.droop, headVel, mm.vy, L.head.y, clamp(yawVel, -20, 20));
    if (rig.antennaL) rig.antennaL.rotation.set(so.antLx, 0, so.antLz);
    if (rig.antennaR) rig.antennaR.rotation.set(so.antRx, 0, so.antRz);
    for (let i = 0; i < rig.tasselSegs.length; i++) rig.tasselSegs[i]?.rotation.set(so.tx[i], 0, so.tz[i]);
    if (rig.tasselPivot) {
      // graduation easter egg: tassel moves to the other side
      mm.tasselX += (0.4 * s.tasselSide - mm.tasselX) * (1 - Math.exp(-3 * dt));
      rig.tasselPivot.position.x = mm.tasselX;
    }

    /* ------------------------------------------------ materials */
    m.blush.opacity = clamp(0.12 + P.blush * 0.42, 0, 0.95);
    m.spiral.opacity = P.dizzy;
    const antMode = antennaModeForState(s.assistantState, EXPRESSION_META[s.expression].antenna);
    updateAntennaTips(m.antennaTipL, m.antennaTipR, antMode, t, 0.5 + P.glow * 0.6, amplitude, dt);
    sceneSignals.glow = m.antennaTipL.emissiveIntensity;
    m.iris.emissiveIntensity = 0.12 + P.glow * 0.1;
    m.badge.emissiveIntensity = 0.2 + 0.15 * Math.sin(t * 2);

    // chest logo: cross-fade between modes
    const lu = m.logo.uniforms;
    const want = LOGO_MODE_INDEX[logoModeFor(s.assistantState, EXPRESSION_META[s.expression].logo)];
    if (want !== mm.logo.b) {
      mm.logo.a = mm.logo.mix < 0.5 ? mm.logo.a : mm.logo.b;
      mm.logo.b = want;
      mm.logo.mix = 0;
    }
    mm.logo.mix = Math.min(1, mm.logo.mix + dt * 3);
    lu.uModeA.value = mm.logo.a;
    lu.uModeB.value = mm.logo.b;
    lu.uMix.value = mm.logo.mix;
    lu.uTime.value = t;
    lu.uAmp.value = amplitude;

    // glasses glint sweep on "idea" / success moments
    const gp = (t - mm.glint) / 0.7;
    m.lensGlint.uGlint.value = gp >= 0 && gp <= 1 ? -1 + gp * 3 : -1;

    // wrist screen (a few redraws per second)
    if (t > mm.nextWrist) {
      mm.nextWrist = t + 0.25;
      drawWristScreen(m, t, s.thinkingEscalated ? "thinking" : s.assistantState, s.chatOpen ? 0 : s.message ? 1 : 0);
    }

    sceneSignals.floatHeight = P.floatHeight;
  });
}
