import { BASE_PARAMS, copyParams, GROUP_TIMING, PARAM_GROUP, PARAM_KEYS, type ExpressionParams } from "../brain/expressions";

const HISTORY = 32;

/**
 * Blends expression params toward a target with per-feature timing: brows
 * react first, then eyes, mouth and cheeks (real faces move in that order).
 * Each feature group samples the target as it was `delay` seconds ago from
 * a fixed ring buffer, then damps toward it at its own rate. No allocation
 * per frame.
 */
export class FacialBlender {
  readonly current: ExpressionParams;
  private ring: { t: number; p: ExpressionParams }[];
  private head = 0;
  private filled = 0;

  constructor(initial: ExpressionParams = BASE_PARAMS) {
    this.current = { ...initial };
    this.ring = Array.from({ length: HISTORY }, () => ({ t: -1e9, p: { ...initial } }));
  }

  /** Snap without blending (first frame, tests). */
  snap(p: ExpressionParams) {
    copyParams(this.current, p);
    for (const slot of this.ring) copyParams(slot.p, p);
  }

  update(target: ExpressionParams, t: number, dt: number, rateScale = 1) {
    // push the target snapshot
    this.head = (this.head + 1) % HISTORY;
    const slot = this.ring[this.head];
    slot.t = t;
    copyParams(slot.p, target);
    this.filled = Math.min(HISTORY, this.filled + 1);

    for (const key of PARAM_KEYS) {
      const g = GROUP_TIMING[PARAM_GROUP[key]];
      const src = this.sample(t - g.delay);
      const k = 1 - Math.exp(-g.rate * rateScale * dt);
      this.current[key] += (src[key] - this.current[key]) * k;
    }
    return this.current;
  }

  /** Newest snapshot at or before time `t`. */
  private sample(t: number): ExpressionParams {
    for (let i = 0; i < this.filled; i++) {
      const s = this.ring[(this.head - i + HISTORY) % HISTORY];
      if (s.t <= t) return s.p;
    }
    return this.ring[(this.head - this.filled + 1 + HISTORY) % HISTORY].p;
  }
}
