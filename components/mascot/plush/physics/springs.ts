/**
 * Critically damped spring, integrated implicitly so it is stable at any
 * frame rate. `omega` ≈ responsiveness (rad/s); settle time ≈ 4.6 / omega.
 */
export class CritSpring {
  x: number;
  v = 0;
  constructor(public omega = 10, initial = 0) {
    this.x = initial;
  }
  step(target: number, dt: number) {
    const w = this.omega;
    const f = 1 + 2 * dt * w;
    const oo = w * w;
    const hoo = dt * oo;
    const hhoo = dt * hoo;
    const inv = 1 / (f + hhoo);
    const nx = (f * this.x + dt * this.v + hhoo * target) * inv;
    const nv = (this.v + hoo * (target - this.x)) * inv;
    this.x = nx;
    this.v = nv;
    return nx;
  }
  reset(x = 0) {
    this.x = x;
    this.v = 0;
  }
}

/** Two critically damped springs, for yaw/pitch style pairs. */
export class CritSpring2 {
  a: CritSpring;
  b: CritSpring;
  constructor(omega = 10) {
    this.a = new CritSpring(omega);
    this.b = new CritSpring(omega);
  }
  step(ta: number, tb: number, dt: number) {
    this.a.step(ta, dt);
    this.b.step(tb, dt);
  }
  get x() {
    return this.a.x;
  }
  get y() {
    return this.b.x;
  }
}

/**
 * Remembers recent 2D samples so a follower can read the value from `delay`
 * seconds ago (used to make the head trail the eyes).
 */
export class DelayLine2 {
  private t: number[] = [];
  private x: number[] = [];
  private y: number[] = [];
  constructor(private keep = 0.6) {}
  push(time: number, x: number, y: number) {
    this.t.push(time);
    this.x.push(x);
    this.y.push(y);
    while (this.t.length > 2 && this.t[1] < time - this.keep) {
      this.t.shift();
      this.x.shift();
      this.y.shift();
    }
  }
  sample(time: number, out: { x: number; y: number }) {
    const n = this.t.length;
    if (!n) return out;
    if (time <= this.t[0]) {
      out.x = this.x[0];
      out.y = this.y[0];
      return out;
    }
    for (let i = n - 1; i > 0; i--) {
      if (this.t[i - 1] <= time) {
        const span = this.t[i] - this.t[i - 1] || 1;
        const k = Math.min(1, (time - this.t[i - 1]) / span);
        out.x = this.x[i - 1] + (this.x[i] - this.x[i - 1]) * k;
        out.y = this.y[i - 1] + (this.y[i] - this.y[i - 1]) * k;
        return out;
      }
    }
    out.x = this.x[n - 1];
    out.y = this.y[n - 1];
    return out;
  }
}
