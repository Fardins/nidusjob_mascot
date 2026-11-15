import { Spring } from "./springs";

/**
 * Secondary motion: antennae and the 3-segment tassel chain lag behind the
 * head and body, overshoot and settle. Each tassel segment is driven by the
 * velocity of the one above it, so the swing travels down the chain.
 */
export class Secondary {
  antL = new Spring(70, 5);
  antR = new Spring(70, 5);
  antLx = new Spring(60, 5);
  antRx = new Spring(60, 5);
  tz = [new Spring(40, 3.5), new Spring(55, 3.2), new Spring(70, 3)];
  tx = [new Spring(40, 3.5), new Spring(55, 3.2), new Spring(70, 3)];
  out = { antLz: 0, antLx: 0, antRz: 0, antRx: 0, tz: [0, 0, 0], tx: [0, 0, 0] };

  twitch(amount = 1) {
    this.antL.impulse(6 * amount);
    this.antR.impulse(-6 * amount);
    this.antLx.impulse(-3 * amount);
    this.antRx.impulse(-3 * amount);
  }

  update(t: number, dt: number, energy: number, droop: number, headVel: number, vy: number, headY: number, yawVel: number) {
    const f = 1.7 + energy * 2.2;
    const drive = -headVel * 0.06 - vy * 0.12 - yawVel * 0.02;
    const o = this.out;
    o.antLz = this.antL.step(Math.sin(t * f) * 0.07 * energy + drive, dt);
    o.antLx = this.antLx.step(Math.sin(t * f * 0.8 + 1) * 0.05 * energy + vy * 0.08 + droop * 0.65, dt);
    o.antRz = this.antR.step(Math.sin(t * f + 2.1) * 0.07 * energy + drive, dt);
    o.antRx = this.antRx.step(Math.sin(t * f * 0.8 + 2.4) * 0.05 * energy + vy * 0.08 + droop * 0.65, dt);

    const dz = -headVel * 0.12 - yawVel * 0.05 + Math.sin(t * 1.3) * 0.05;
    const dx = vy * 0.25 - headY * 0.2;
    o.tz[0] = this.tz[0].step(dz, dt);
    o.tx[0] = this.tx[0].step(dx, dt);
    for (let i = 1; i < 3; i++) {
      o.tz[i] = this.tz[i].step(-this.tz[i - 1].v * 0.035, dt);
      o.tx[i] = this.tx[i].step(-this.tx[i - 1].v * 0.035, dt);
    }
    return o;
  }
}
