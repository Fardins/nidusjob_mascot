import { pick, rand } from "../brain/rng";
import type { ReactionName } from "../brain/types";
import { createPose, type ArmPose } from "./pose";

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
};
/** Ease in over [0,a], hold, ease out over [b,1]. */
const env = (p: number, a: number, b: number) => smooth(0, a, p) * (1 - smooth(b, 1, p));
const bell = (p: number, a: number, b: number) => (p <= a || p >= b ? 0 : Math.sin(((p - a) / (b - a)) * Math.PI));
const easeInOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** Everything a reaction may add to the pose this frame. */
export interface ReactionOut {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  squash: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  bodyPitch: number;
  shoulders: number;
  armL: ArmPose;
  armR: ArmPose;
  wL: number;
  wR: number;
  gazeX: number;
  gazeY: number;
  gazeW: number;
  lidClose: number;
  happyEyes: number;
  smile: number;
  mouthOpen: number;
  mouthSkew: number;
  pucker: number;
  browRaise: number;
  browSide: number;
  glassesDrop: number;
  capTilt: number;
}

export function createReactionOut(): ReactionOut {
  const p = createPose();
  return {
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, squash: 0,
    headPitch: 0, headYaw: 0, headRoll: 0, bodyPitch: 0, shoulders: 0,
    armL: { ...p.armL }, armR: { ...p.armR }, wL: 0, wR: 0,
    gazeX: 0, gazeY: 0, gazeW: 0, lidClose: 0, happyEyes: 0, smile: 0,
    mouthOpen: 0, mouthSkew: 0, pucker: 0, browRaise: 0, browSide: 1, glassesDrop: 0, capTilt: 0,
  };
}

const NUM_KEYS = (Object.keys(createReactionOut()) as (keyof ReactionOut)[]).filter((k) => k !== "armL" && k !== "armR" && k !== "browSide") as Exclude<
  keyof ReactionOut,
  "armL" | "armR" | "browSide"
>[];

function reset(o: ReactionOut) {
  for (const k of NUM_KEYS) o[k] = 0;
  o.browSide = 1;
}

function arm(a: ArmPose, raise: number, forward: number, twist: number, elbow: number) {
  a.raise = raise;
  a.forward = forward;
  a.twist = twist;
  a.elbow = elbow;
}

export const REACTION_DURATION: Record<ReactionName, number> = {
  jump: 0.95, hop: 0.95, doubleHop: 1.35, spinJump: 1.2, spin: 1.15, wave: 1.9, nod: 1.0, headNod: 0.6, shake: 1.0,
  squash: 0.4, startle: 0.8, flinch: 1.0, shrug: 1.2, laugh: 1.6, bow: 1.8, dizzy: 2.6, curiousTilt: 1.7,
  celebrate: 2.2, giggle: 1.2, lookAround: 3.2, stretch: 2.4, yawn: 2.4, scratchHead: 2.2, adjustGlasses: 1.6,
  straightenCap: 1.8, tapWrist: 2.2, humSway: 3.0, lookAndSmile: 2.2,
};

interface Active {
  name: ReactionName;
  start: number;
  dur: number;
  /** per-play randomness so repeats differ */
  side: number;
  amt: number;
}

/** Hop: anticipation squash → stretch → airborne tuck → land squash → small bounce → settle. */
function hop(o: ReactionOut, p: number, height: number, motion: number) {
  o.squash += 0.9 * bell(p, 0, 0.17) - 0.7 * bell(p, 0.13, 0.27) + 0.25 * bell(p, 0.3, 0.52) + 1.0 * bell(p, 0.56, 0.72) - 0.25 * bell(p, 0.72, 0.84);
  o.y += (bell(p, 0.18, 0.6) * height + bell(p, 0.7, 0.88) * height * 0.13) * motion;
  const air = env(p, 0.2, 0.62);
  o.wL = o.wR = Math.max(o.wR, env(p, 0.12, 0.75));
  arm(o.armL, 0.32 + 1.5 * air, -0.35 * bell(p, 0, 0.18), 0, 0.3 + 0.4 * air);
  arm(o.armR, 0.32 + 1.5 * air, -0.35 * bell(p, 0, 0.18), 0, 0.3 + 0.4 * air);
  o.happyEyes += 0.6 * env(p, 0.15, 0.9);
  o.smile += 0.3 * env(p, 0.1, 0.9);
  o.headPitch += 0.08 * air - 0.06 * bell(p, 0.56, 0.75);
}

function evaluate(a: Active, t: number, o: ReactionOut, motion: number, reduced: boolean) {
  const p = clamp01((t - a.start) / a.dur);
  const e = t - a.start;
  const m = reduced ? 0 : motion;
  switch (a.name) {
    case "jump":
    case "hop":
      hop(o, p, 0.45 * a.amt, m);
      break;
    case "doubleHop":
      if (p < 0.5) hop(o, p * 2, 0.3 * a.amt, m);
      else hop(o, (p - 0.5) * 2, 0.22 * a.amt, m);
      break;
    case "spinJump":
      hop(o, p, 0.5 * a.amt, m);
      if (!reduced) o.yaw += easeInOut((p - 0.16) / 0.5) * TAU * a.side;
      break;
    case "celebrate": {
      const w = env(p, 0.1, 0.85);
      o.wL = o.wR = w;
      arm(o.armL, 2.45 + Math.sin(e * 9) * 0.12, -0.1, 0, 0.35);
      arm(o.armR, 2.45 + Math.sin(e * 9 + 1.4) * 0.12, -0.1, 0, 0.35);
      o.y += Math.abs(Math.sin(p * Math.PI * 3)) * 0.22 * w * m;
      o.squash += Math.sin(p * Math.PI * 6) * 0.35 * w;
      o.happyEyes += 0.8 * w;
      o.smile += 0.4 * w;
      o.headPitch += 0.12 * w;
      break;
    }
    case "spin":
      if (!reduced) o.yaw += easeInOut(p) * TAU * a.side;
      o.squash += 0.3 * bell(p, 0, 0.15) + 0.4 * bell(p, 0.85, 1);
      o.y += bell(p, 0.1, 0.9) * 0.08 * m;
      break;
    case "wave": {
      const w = Math.min(1, Math.sin(p * Math.PI) * 2.2);
      o.wR = w;
      arm(o.armR, 2.55 + Math.sin(p * Math.PI * 7) * 0.38, -0.25, 0, 0.35 + Math.sin(p * Math.PI * 7 + 0.6) * 0.18);
      o.roll += Math.sin(p * Math.PI * 3.5) * 0.03 * w * motion;
      o.headRoll += 0.08 * w;
      o.smile += 0.25 * w;
      o.happyEyes += 0.3 * w;
      break;
    }
    case "nod":
      o.headPitch -= Math.sin(p * Math.PI * 3) * 0.2 * (1 - p);
      break;
    case "headNod":
      o.headPitch -= bell(p, 0, 1) * 0.12 * a.amt;
      break;
    case "shake":
      o.headYaw += Math.sin(p * Math.PI * 4) * 0.3 * (1 - p);
      break;
    case "squash":
      o.squash += 1.2 * bell(p, 0, 1);
      break;
    case "startle": {
      o.squash += -0.7 * bell(p, 0, 0.18) + 0.6 * bell(p, 0.45, 0.7);
      o.y += bell(p, 0.05, 0.5) * 0.18 * m;
      const w = env(p, 0.06, 0.6);
      o.wL = o.wR = w;
      arm(o.armL, 1.1, 0.2, 0, 0.6);
      arm(o.armR, 1.1, 0.2, 0, 0.6);
      o.lidClose -= 0.3 * w;
      o.headPitch += 0.1 * w;
      o.browRaise += 0.03 * w;
      break;
    }
    case "flinch": {
      const w = env(p, 0.15, 0.6);
      o.z -= 0.18 * w * m;
      o.bodyPitch -= 0.12 * w;
      o.headPitch -= 0.05 * w;
      o.wL = o.wR = w;
      arm(o.armL, 0.5, 0.6, 0, 1.3);
      arm(o.armR, 0.5, 0.6, 0, 1.3);
      o.squash += 0.4 * bell(p, 0, 0.2);
      break;
    }
    case "shrug": {
      const w = env(p, 0.2, 0.72);
      o.shoulders += 0.11 * w;
      o.wL = o.wR = w;
      arm(o.armL, 0.75, 0.45, 0.3, 1.6);
      arm(o.armR, 0.75, 0.45, 0.3, 1.6);
      o.headRoll += 0.14 * w * a.side;
      o.mouthSkew += 0.35 * w;
      break;
    }
    case "laugh": {
      const w = env(p, 0.1, 0.85);
      o.y += Math.abs(Math.sin(e * 16)) * 0.025 * w * m;
      o.shoulders += Math.abs(Math.sin(e * 16)) * 0.05 * w;
      o.headPitch += 0.16 * w;
      o.happyEyes += 0.5 * w;
      o.squash += Math.sin(e * 16) * 0.12 * w;
      break;
    }
    case "giggle": {
      const w = env(p, 0.12, 0.8);
      o.shoulders += Math.abs(Math.sin(e * 20)) * 0.04 * w;
      o.headRoll += Math.sin(e * 7) * 0.06 * w;
      o.y += Math.abs(Math.sin(e * 20)) * 0.012 * w * m;
      o.happyEyes += 0.7 * w;
      o.wL = o.wR = w * 0.8;
      arm(o.armL, 0.2, 0.7, 0, 1.5);
      arm(o.armR, 0.2, 0.7, 0, 1.5);
      break;
    }
    case "bow": {
      const w = env(p, 0.25, 0.72);
      o.pitch += 0.35 * w;
      o.headPitch -= 0.2 * w;
      o.wL = o.wR = w * 0.7;
      arm(o.armL, 0.2, 0.3, 0, 0.6);
      arm(o.armR, 0.2, 0.3, 0, 0.6);
      break;
    }
    case "dizzy": {
      const w = env(p, 0.08, 0.85);
      o.headRoll += Math.sin(e * 6) * 0.13 * w;
      o.headYaw += Math.cos(e * 6) * 0.12 * w;
      o.roll += Math.sin(e * 3) * 0.06 * w * motion;
      o.gazeX = Math.cos(e * 8) * 0.5;
      o.gazeY = Math.sin(e * 8) * 0.4;
      o.gazeW = w;
      break;
    }
    case "curiousTilt": {
      // tilt 8–15° to a random side, hold 0.6–1.2 s, ease back
      const w = env(p, 0.22, 0.78);
      o.headRoll += a.side * (0.14 + 0.12 * a.amt) * w;
      o.browRaise += 0.035 * w;
      o.browSide = a.side;
      o.lidClose -= 0.12 * w;
      o.pucker += 0.15 * w;
      break;
    }
    case "lookAround": {
      const w = env(p, 0.05, 0.92);
      const seq = p < 0.32 ? [-0.85 * a.side, 0.1] : p < 0.64 ? [0.85 * a.side, 0.2] : p < 0.84 ? [0.15, 0.6] : [0, 0.05];
      o.gazeX = seq[0];
      o.gazeY = seq[1];
      o.gazeW = w;
      o.browRaise += 0.015 * w;
      break;
    }
    case "lookAndSmile": {
      const w = env(p, 0.15, 0.85);
      o.gazeX = 0;
      o.gazeY = 0.05;
      o.gazeW = w;
      o.smile += 0.35 * w;
      o.happyEyes += 0.45 * w;
      o.bodyPitch += 0.04 * w;
      o.browRaise += 0.02 * bell(p, 0.1, 0.35);
      break;
    }
    case "stretch": {
      const w = env(p, 0.25, 0.75);
      o.wL = o.wR = w;
      arm(o.armL, 2.8, -0.2, 0, 0.1);
      arm(o.armR, 2.8, -0.2, 0, 0.1);
      o.squash -= 0.55 * w;
      o.headPitch += 0.16 * w;
      o.lidClose += 0.65 * w;
      o.mouthOpen += 0.35 * bell(p, 0.3, 0.7);
      break;
    }
    case "yawn": {
      const w = env(p, 0.22, 0.72);
      o.headPitch += 0.2 * w;
      o.mouthOpen += 0.85 * w;
      o.pucker += 0.3 * w;
      o.lidClose += 0.85 * w;
      o.shoulders += 0.06 * w;
      o.wR = w * 0.6;
      arm(o.armR, 0.6, 1.0, 0, 2.1);
      break;
    }
    case "scratchHead": {
      const w = env(p, 0.2, 0.8);
      o.wR = w;
      arm(o.armR, 2.3, 0.4, Math.sin(e * 14) * 0.15, 2.3 + Math.sin(e * 14) * 0.08);
      o.headRoll -= 0.1 * w;
      o.mouthSkew += 0.3 * w;
      o.gazeX = 0.3;
      o.gazeY = 0.35;
      o.gazeW = w * 0.7;
      break;
    }
    case "adjustGlasses": {
      const w = env(p, 0.25, 0.72);
      o.wR = w;
      arm(o.armR, 0.95, 1.05, 0, 2.5);
      o.glassesDrop -= 0.7 * bell(p, 0.38, 0.75);
      o.headPitch -= 0.05 * w;
      break;
    }
    case "straightenCap": {
      const w = env(p, 0.25, 0.75);
      o.wL = o.wR = w;
      arm(o.armL, 2.5, 0.3, 0, 1.9);
      arm(o.armR, 2.5, 0.3, 0, 1.9);
      o.capTilt += Math.sin(p * Math.PI * 4) * 0.08 * w;
      o.headPitch -= 0.06 * w;
      break;
    }
    case "tapWrist": {
      const w = env(p, 0.22, 0.8);
      o.wL = o.wR = w;
      arm(o.armL, 0.4, 1.1, 0, 1.7);
      arm(o.armR, 0.45, 1.15, 0, 1.95 + Math.max(0, Math.sin(e * 16)) * 0.1 * bell(p, 0.3, 0.7));
      o.gazeX = -0.25;
      o.gazeY = -0.65;
      o.gazeW = w;
      o.headPitch -= 0.08 * w;
      break;
    }
    case "humSway": {
      const w = env(p, 0.15, 0.85);
      o.roll += Math.sin(p * Math.PI * 4) * 0.06 * w * motion;
      o.headRoll += Math.sin(p * Math.PI * 4 + 0.6) * 0.08 * w;
      o.lidClose += 0.4 * w;
      o.smile += 0.2 * w;
      o.pucker += 0.35 * w;
      break;
    }
  }
}

/**
 * Plays one-shot reactions and cross-fades into a new one when interrupted
 * (the previous reaction's contribution fades out over ~0.25 s instead of
 * snapping).
 */
export class ReactionLayer {
  readonly out = createReactionOut();
  private cur: Active | null = null;
  private prev: Active | null = null;
  private prevFade = 0;
  private tmp = createReactionOut();

  get active() {
    return this.cur?.name ?? null;
  }

  play(name: ReactionName, t: number, reduced: boolean) {
    let n = name;
    if (n === "jump") n = reduced ? "nod" : pick(["hop", "hop", "doubleHop", "spinJump"] as const);
    if (reduced && (n === "spin" || n === "spinJump")) n = "nod";
    if (this.cur && t - this.cur.start < this.cur.dur) {
      this.prev = this.cur;
      this.prevFade = 1;
    }
    this.cur = { name: n, start: t, dur: REACTION_DURATION[n] * rand(0.94, 1.08), side: rand(0, 1) < 0.5 ? -1 : 1, amt: rand(0.85, 1.15) };
    if (n === "curiousTilt") this.cur.dur = rand(1.4, 2.0);
  }

  update(t: number, dt: number, motion: number, reduced: boolean) {
    const o = this.out;
    reset(o);
    if (this.cur) {
      evaluate(this.cur, t, o, motion, reduced);
      if (t - this.cur.start >= this.cur.dur) this.cur = null;
    }
    if (this.prev && this.prevFade > 0) {
      this.prevFade = Math.max(0, this.prevFade - dt / 0.25);
      const tmp = this.tmp;
      reset(tmp);
      evaluate(this.prev, t, tmp, motion, reduced);
      const k = this.prevFade;
      for (const key of NUM_KEYS) o[key] += tmp[key] * k;
      if (tmp.wL > 0) mixArm(o.armL, tmp.armL, (tmp.wL * k) / Math.max(1e-3, o.wL + tmp.wL * k));
      if (tmp.wR > 0) mixArm(o.armR, tmp.armR, (tmp.wR * k) / Math.max(1e-3, o.wR + tmp.wR * k));
      o.wL = Math.min(1, o.wL);
      o.wR = Math.min(1, o.wR);
      o.gazeW = Math.min(1, o.gazeW);
      if (this.prevFade === 0 || t - this.prev.start >= this.prev.dur) this.prev = null;
    }
  }
}

function mixArm(a: ArmPose, b: ArmPose, k: number) {
  a.raise += (b.raise - a.raise) * k;
  a.forward += (b.forward - a.forward) * k;
  a.twist += (b.twist - a.twist) * k;
  a.elbow += (b.elbow - a.elbow) * k;
}
