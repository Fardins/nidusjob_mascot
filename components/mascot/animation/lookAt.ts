import { getAttentionPoint, mascotStore } from "../store";
import { rand } from "../brain/rng";
import { sceneSignals } from "./pose";

const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export interface GazeOverride {
  x: number;
  y: number;
  /** 0…1 blend over the normal target. */
  w: number;
}

/**
 * Eye tracking. Eyes lead, the head follows (slower damping), the body
 * follows the head. Adds micro-saccades while fixating, smooth pursuit for
 * slow cursor motion, a glance-around when the cursor leaves the window,
 * slight convergence when the cursor is close, and touch support (last tap,
 * then the focused input, then idle drift). Scroll pulls the gaze along.
 */
export class LookAt {
  head = { x: 0, y: 0 };
  eye = { x: 0, y: 0 };
  converge = 0;
  /** True on the frame the target jumped far (drives a blink). */
  gazeJump = false;

  private pointer = { x: 0, y: 0, t: -1e9, speed: 0, touch: false };
  private tap = { x: 0, y: 0, t: -1e9 };
  private leftAt = -1e9;
  private inside = true;
  private focusEl: Element | null = null;
  private glance: { x: number; y: number; until: number }[] = [];
  private idleLook = { x: 0, y: 0.05 };
  private nextIdleLook = 0;
  private sacc = { x: 0, y: 0 };
  private nextSacc = 0;
  private last = { x: 0, y: 0 };
  private scrollY = 0;
  private scrollT = 0;
  private cleanup: (() => void) | null = null;

  attach() {
    if (typeof window === "undefined" || this.cleanup) return;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      const dtp = Math.max(1, now - this.pointer.t);
      const d = Math.hypot(e.clientX - this.pointer.x, e.clientY - this.pointer.y);
      this.pointer.speed = this.pointer.speed * 0.7 + (d / dtp) * 1000 * 0.3;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.t = now;
      this.pointer.touch = e.pointerType === "touch";
      this.inside = true;
      sceneSignals.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      sceneSignals.pointerY = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    const onDown = (e: PointerEvent) => {
      onMove(e);
      if (e.pointerType === "touch") this.tap = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget) return;
      this.inside = false;
      this.leftAt = performance.now();
      // glance around the room for a moment, then return to centre
      const n = Math.round(rand(2, 3));
      let t = performance.now();
      this.glance = [];
      for (let i = 0; i < n; i++) {
        t += rand(450, 900);
        this.glance.push({ x: rand(-0.9, 0.9), y: rand(-0.3, 0.55), until: t });
      }
      this.glance.push({ x: 0, y: 0.05, until: t + 900 });
    };
    const isField = (el: Element | null) => !!el && (el.matches("input, textarea, select, [contenteditable='true']") as boolean);
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as Element | null;
      if (isField(el)) this.focusEl = el;
    };
    const onFocusOut = () => {
      this.focusEl = null;
    };
    const onScroll = () => {
      const now = performance.now();
      const dy = window.scrollY - this.scrollY;
      const dt = Math.max(8, now - this.scrollT);
      sceneSignals.scrollVel = sceneSignals.scrollVel * 0.6 + (dy / dt) * 1000 * 0.4;
      this.scrollY = window.scrollY;
      this.scrollT = now;
    };
    this.scrollY = window.scrollY;
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", onScroll, { passive: true });
    this.cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", onScroll);
    };
  }

  detach() {
    this.cleanup?.();
    this.cleanup = null;
  }

  update(t: number, dt: number, rect: DOMRect, bias: { x: number; y: number }, override: GazeOverride | null, motion: number) {
    const nowMs = performance.now();
    const s = mascotStore.get();
    const idleFor = (nowMs - Math.max(this.pointer.t, s.lastInteraction)) / 1000;

    // decay scroll velocity when scrolling stops
    sceneSignals.scrollVel *= Math.exp(-6 * dt);

    /* ------------------------------------------- choose the target point */
    let point: { x: number; y: number } | null = getAttentionPoint();
    if (!point && this.focusEl?.isConnected && (this.pointer.touch || s.chatOpen || idleFor > 1.5)) {
      const r = this.focusEl.getBoundingClientRect();
      // glance at where the text grows (right end of the field)
      point = { x: r.left + Math.min(r.width - 8, r.width * 0.75), y: r.top + r.height / 2 };
    }
    if (!point && nowMs - this.tap.t < 3000) point = this.tap;
    if (!point && this.inside && !this.pointer.touch && idleFor < 6 && this.pointer.t > 0) point = this.pointer;

    let lx: number;
    let ly: number;
    let close = 0;
    if (point && rect.width > 0) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.4;
      const nx = (point.x - cx) / (rect.width * 0.5);
      const ny = (point.y - cy) / (rect.height * 0.5);
      lx = Math.tanh(nx * 0.85);
      ly = Math.tanh(-ny * 0.85);
      const d = Math.hypot(point.x - cx, point.y - cy) / Math.max(1, rect.width);
      close = clamp(1 - d / 0.32, 0, 1);
    } else if (this.glance.length && nowMs - this.leftAt < 5000) {
      while (this.glance.length > 1 && nowMs > this.glance[0].until) this.glance.shift();
      lx = this.glance[0].x;
      ly = this.glance[0].y;
    } else {
      if (t > this.nextIdleLook) {
        this.idleLook.x = rand(-0.75, 0.75);
        this.idleLook.y = rand(-0.3, 0.5);
        this.nextIdleLook = t + rand(2.2, 4.5);
      }
      lx = this.idleLook.x;
      ly = this.idleLook.y;
    }

    // expression bias (thinking looks up-right, shy looks away …)
    lx += bias.x * 0.6;
    ly += bias.y * 0.6;
    // scrolling: look along the scroll direction
    ly -= clamp(sceneSignals.scrollVel / 2500, -0.35, 0.35);
    if (override && override.w > 0) {
      lx += (override.x - lx) * override.w;
      ly += (override.y - ly) * override.w;
    }

    this.gazeJump = Math.hypot(lx - this.last.x, ly - this.last.y) > 0.5;
    this.last.x = lx;
    this.last.y = ly;

    /* ------------------------------------------- micro-saccades */
    const fixating = this.pointer.speed < 120 || !point;
    if (t > this.nextSacc) {
      const amp = (fixating ? rand(0.012, 0.03) : 0.008) * (point ? 1 : 2);
      this.sacc.x = rand(-amp, amp);
      this.sacc.y = rand(-amp * 0.7, amp * 0.7);
      this.nextSacc = t + rand(0.3, 1.4);
    }

    /* ------------------------------------------- pursuit vs saccade */
    const slow = this.pointer.speed < 650 && point === this.pointer;
    const eyeRate = this.gazeJump ? 28 : slow ? 10 : 18;
    this.head.x = damp(this.head.x, lx, 3.2 * (0.6 + 0.4 * motion), dt);
    this.head.y = damp(this.head.y, ly, 3.2 * (0.6 + 0.4 * motion), dt);
    this.eye.x = damp(this.eye.x, lx + this.sacc.x, eyeRate, dt);
    this.eye.y = damp(this.eye.y, ly + this.sacc.y, eyeRate, dt);
    this.converge = damp(this.converge, close * 0.14, 6, dt);
    this.pointer.speed *= Math.exp(-4 * dt);
  }
}
