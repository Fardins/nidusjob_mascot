import type { GestureName } from "../brain/types";
import type { ArmPose } from "./pose";

interface GesturePose {
  L?: ArmPose;
  R?: ArmPose;
  headPitch?: number;
  headRoll?: number;
  shoulders?: number;
  gaze?: { x: number; y: number };
}

const A = (raise: number, forward: number, twist: number, elbow: number): ArmPose => ({ raise, forward, twist, elbow });

/** Talking gesture library (procedural arm poses). */
export const GESTURE_POSES: Record<GestureName, GesturePose> = {
  openPalm: { R: A(0.9, 0.65, 0.5, 0.95), L: A(0.65, 0.45, 0.4, 0.8), headRoll: 0.04 },
  pointSide: { R: A(1.45, 0.25, 0, 0.12), gaze: { x: 0.8, y: 0.1 }, headRoll: -0.04 },
  count: { L: A(0.5, 0.9, 0.3, 1.45), R: A(0.5, 0.95, 0.2, 1.55) },
  shrug: { L: A(0.75, 0.45, 0.3, 1.6), R: A(0.75, 0.45, 0.3, 1.6), shoulders: 0.1, headRoll: 0.1 },
  pinch: { R: A(0.6, 1.0, 0.2, 1.75), gaze: { x: 0.25, y: -0.15 } },
  bigIdea: { L: A(1.6, 0.3, 0, 0.4), R: A(1.6, 0.3, 0, 0.4), headPitch: 0.08 },
  chinTouch: { R: A(0.35, 1.35, 0, 2.45), headPitch: -0.06, headRoll: -0.06 },
  beat: { R: A(0.6, 0.8, 0.2, 1.1) },
  tapWrist: { L: A(0.4, 1.1, 0, 1.7), R: A(0.45, 1.15, 0, 1.95), gaze: { x: -0.25, y: -0.65 }, headPitch: -0.08 },
  presentWrist: { L: A(0.65, 1.25, 0.4, 1.2), gaze: { x: -0.3, y: -0.3 } },
  handsTogether: { L: A(0.15, 0.6, 0, 1.4), R: A(0.15, 0.6, 0, 1.4), headPitch: -0.05 },
};

interface Slot {
  name: GestureName;
  start: number;
  dur: number;
  /** current blend weight (springy) */
  w: number;
}

const FADE_IN = 0.38;
const FADE_OUT = 0.42;

/**
 * Blends talking gestures over the base arm pose. A new gesture cross-fades
 * from the old one (0.3–0.5 s); beats add a quick down-up accent.
 */
export class GestureLayer {
  armL: ArmPose = A(0.32, 0, 0, 0.15);
  armR: ArmPose = A(0.32, 0, 0, 0.15);
  wL = 0;
  wR = 0;
  headPitch = 0;
  headRoll = 0;
  shoulders = 0;
  gazeX = 0;
  gazeY = 0;
  gazeW = 0;
  private slots: Slot[] = [];
  private lastId = -1;

  push(id: number, name: GestureName, duration: number, t: number) {
    if (id === this.lastId) return;
    this.lastId = id;
    // everything currently playing starts fading out now
    for (const s of this.slots) s.dur = Math.min(s.dur, t - s.start + FADE_OUT * 0.5);
    this.slots.push({ name, start: t, dur: Math.max(0.6, duration), w: 0 });
    if (this.slots.length > 3) this.slots.shift();
  }

  update(t: number, dt: number) {
    let wl = 0;
    let wr = 0;
    let hp = 0;
    let hr = 0;
    let sh = 0;
    let gx = 0;
    let gy = 0;
    let gw = 0;
    const L = this.armL;
    const R = this.armR;
    L.raise = L.forward = L.twist = L.elbow = 0;
    R.raise = R.forward = R.twist = R.elbow = 0;

    for (const s of this.slots) {
      const e = t - s.start;
      const target = e < s.dur ? 1 : 0;
      const rate = target ? 1 / FADE_IN : 1 / FADE_OUT;
      s.w += Math.sign(target - s.w) * Math.min(Math.abs(target - s.w), rate * dt * 2.2);
      const w = s.w * s.w * (3 - 2 * s.w); // smoothstep for a soft start/stop
      if (w <= 1e-3) continue;
      const g = GESTURE_POSES[s.name];
      const accent = s.name === "beat" ? Math.sin(Math.min(1, e / 0.35) * Math.PI) : 0;
      const count = s.name === "count" ? Math.sin(e * 5.5) * 0.12 : 0;
      if (g.L) {
        L.raise += g.L.raise * w;
        L.forward += g.L.forward * w;
        L.twist += (g.L.twist + count) * w;
        L.elbow += g.L.elbow * w;
        wl += w;
      }
      if (g.R) {
        R.raise += g.R.raise * w;
        R.forward += (g.R.forward - accent * 0.25) * w;
        R.twist += (g.R.twist - count) * w;
        R.elbow += (g.R.elbow - accent * 0.45) * w;
        wr += w;
      }
      hp += (g.headPitch ?? 0) * w;
      hr += (g.headRoll ?? 0) * w;
      sh += (g.shoulders ?? 0) * w;
      if (g.gaze) {
        gx += g.gaze.x * w;
        gy += g.gaze.y * w;
        gw += w;
      }
    }
    // normalise accumulated poses by weight; overall weight caps at 1
    if (wl > 0) {
      L.raise /= wl;
      L.forward /= wl;
      L.twist /= wl;
      L.elbow /= wl;
    }
    if (wr > 0) {
      R.raise /= wr;
      R.forward /= wr;
      R.twist /= wr;
      R.elbow /= wr;
    }
    this.wL = Math.min(1, wl);
    this.wR = Math.min(1, wr);
    this.headPitch = hp;
    this.headRoll = hr;
    this.shoulders = sh;
    this.gazeW = Math.min(1, gw) * 0.7;
    if (gw > 0) {
      this.gazeX = gx / gw;
      this.gazeY = gy / gw;
    }
    this.slots = this.slots.filter((s) => s.w > 1e-3 || t - s.start < s.dur);
  }
}
