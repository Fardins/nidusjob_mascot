import { rand, chance, random } from "../brain/rng";
import { fbm1 } from "./noise";

const TAU = Math.PI * 2;
const ease = (x: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, x)))) / 2;

/* --------------------------------------------------------------- breathing */

/**
 * Natural breathing: 3–5 s per breath with ±15% variation per breath, the
 * inhale (40%) shorter than the exhale (60%). Rate/depth follow emotion; a
 * rate near zero holds the breath (surprise).
 */
export class Breathing {
  private phase = random();
  private period = 4;
  value = 0;
  /** Breath value ~120 ms ago — the head follows the chest. */
  delayed = 0;

  private shape(ph: number) {
    const p = ((ph % 1) + 1) % 1;
    return p < 0.4 ? ease(p / 0.4) : 1 - ease((p - 0.4) / 0.6);
  }

  update(dt: number, rate: number, depth: number) {
    const r = Math.max(0, rate);
    const prev = this.phase;
    this.phase += (dt / this.period) * r;
    if (Math.floor(this.phase) !== Math.floor(prev)) {
      // new breath: re-randomise the period
      this.period = rand(3, 5) * rand(0.85, 1.15);
    }
    this.value = this.shape(this.phase) * depth;
    this.delayed = this.shape(this.phase - 0.12 / this.period) * depth;
    return this.value;
  }
}

/* -------------------------------------------------------------------- blink */

/**
 * Asymmetric blinks (close ≈70 ms, open ≈130 ms), random 2–6 s apart with
 * ~15% double blinks, extra blinks on large gaze shifts, and slow heavy
 * blinks when drowsy.
 */
export class Blink {
  private next = rand(1, 3);
  private start = -1;
  private double = false;
  private lastEnd = -10;
  private close = 0.07;
  private hold = 0.02;
  private open = 0.13;
  value = 0;

  /** Force a blink now (e.g. wake-up rapid blinks). */
  trigger(t: number, double = false) {
    if (this.start < 0) {
      this.start = t;
      this.double = double;
    }
  }

  update(t: number, rate: number, heavy: number, gazeJump: boolean) {
    const h = Math.min(1, Math.max(0, heavy));
    if (rate <= 0.01) {
      this.value = 0;
      this.next = t + 1;
      return 0;
    }
    if (this.start < 0) {
      const big = gazeJump && t - this.lastEnd > 0.4 && chance(0.7);
      if (t >= this.next || big) {
        this.start = t;
        this.double = chance(0.15);
        this.close = 0.07 + h * 0.12;
        this.hold = 0.02 + h * 0.12;
        this.open = rand(0.12, 0.15) + h * 0.22;
      }
    }
    if (this.start < 0 || t < this.start) {
      this.value = 0;
      return 0;
    }
    const e = t - this.start;
    let v: number;
    if (e < this.close) v = Math.sin((e / this.close) * Math.PI * 0.5);
    else if (e < this.close + this.hold) v = 1;
    else if (e < this.close + this.hold + this.open) v = Math.cos(((e - this.close - this.hold) / this.open) * Math.PI * 0.5);
    else {
      v = 0;
      this.lastEnd = t;
      if (this.double) {
        this.double = false;
        this.start = t + 0.06;
      } else {
        this.start = -1;
        this.next = t + rand(2, 6) / Math.max(0.2, rate);
      }
    }
    this.value = v;
    return v;
  }
}

/* -------------------------------------------------------------------- float */

/** Slow hover: ±3% of height, 4–6 s period, with a phase-offset roll/pitch. */
export class Float {
  private phase = random() * TAU;
  private period = rand(4, 6);
  y = 0;
  roll = 0;
  pitch = 0;

  update(dt: number, amp: number) {
    this.phase += (dt / this.period) * TAU;
    if (this.phase > TAU * 8) {
      this.phase -= TAU * 8;
      this.period = rand(4, 6);
    }
    this.y = Math.sin(this.phase) * 0.065 * amp;
    this.roll = Math.sin(this.phase * 0.5 + 1.1) * 0.022 * amp;
    this.pitch = Math.sin(this.phase + 0.9) * 0.012 * amp;
    return this.y;
  }
}

/* -------------------------------------------------------------- head noise */

/** Low-amplitude noise on yaw/pitch/roll (≤ ~2.5°) at incommensurate rates. */
export class HeadNoise {
  yaw = 0;
  pitch = 0;
  roll = 0;
  update(t: number, amp: number) {
    this.yaw = fbm1(t * 0.13, 11) * 0.042 * amp;
    this.pitch = fbm1(t * 0.17, 23) * 0.035 * amp;
    this.roll = fbm1(t * 0.11, 37) * 0.03 * amp;
  }
}

/* ------------------------------------------------------ micro-expressions */

/** Tiny idle face movements: smile twitches, brief squints, lip shifts. */
export class MicroExpressions {
  smile = 0;
  squint = 0;
  skew = 0;
  private until = 0;
  private next = rand(2, 5);
  private kind = 0;
  update(t: number, dt: number, amp: number) {
    if (t > this.next) {
      this.kind = Math.floor(rand(0, 3));
      this.until = t + rand(0.25, 0.6);
      this.next = t + rand(2.5, 7);
    }
    const on = t < this.until ? 1 : 0;
    const k = 1 - Math.exp(-14 * dt);
    this.smile += ((this.kind === 0 ? on * 0.12 : 0) * amp - this.smile) * k;
    this.squint += ((this.kind === 1 ? on * 0.15 : 0) * amp - this.squint) * k;
    this.skew += ((this.kind === 2 ? on * 0.18 : 0) * amp - this.skew) * k;
  }
}
