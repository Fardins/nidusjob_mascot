import type { ExpressionName } from "./expressions";
import type { AssistantState, StatePhase } from "./types";

/**
 * Behaviour state machine for the assistant (pure, three.js-free, timer-free).
 *
 * Every state has an enter phase, a looping body and an exit phase, so every
 * transition can be animated. Requests are queued and interruptible by
 * priority (error > user interaction > speaking > idle) and each state has a
 * minimum hold time so the face never flickers between states.
 *
 * Time is passed in explicitly (seconds), which keeps it unit-testable.
 */

export interface StateDef {
  expression: ExpressionName;
  priority: number;
  /** Enter / exit animation durations in seconds. */
  enter: number;
  exit: number;
  /** Lower-or-equal priority requests wait until the state has been held this long. */
  minHold: number;
  /** Leave automatically after this many seconds in the loop phase. */
  auto?: { after: number; then: AssistantState };
}

export const STATE_DEFS: Record<AssistantState, StateDef> = {
  offscreen: { expression: "neutral", priority: 0, enter: 0, exit: 0, minHold: 0 },
  idle: { expression: "happy", priority: 0, enter: 0.3, exit: 0.2, minHold: 0.8 },
  drowsy: { expression: "drowsy", priority: 0, enter: 1.2, exit: 0.3, minHold: 2 },
  sleeping: { expression: "sleeping", priority: 0, enter: 2, exit: 0.2, minHold: 2 },
  success: { expression: "celebrating", priority: 1, enter: 0.3, exit: 0.4, minHold: 1.2, auto: { after: 1.6, then: "idle" } },
  confused: { expression: "confused", priority: 1, enter: 0.3, exit: 0.4, minHold: 1.2, auto: { after: 2.2, then: "idle" } },
  speaking: { expression: "speaking", priority: 2, enter: 0.25, exit: 0.4, minHold: 0.8 },
  thinking: { expression: "thinking", priority: 2, enter: 0.35, exit: 0.3, minHold: 0.8 },
  listening: { expression: "listening", priority: 3, enter: 0.3, exit: 0.3, minHold: 0.8 },
  welcome: { expression: "welcome", priority: 3, enter: 0.4, exit: 0.4, minHold: 1.5, auto: { after: 2.4, then: "idle" } },
  waking: { expression: "surprised", priority: 3, enter: 0.15, exit: 0.4, minHold: 1.2, auto: { after: 1.6, then: "idle" } },
  goodbye: { expression: "goodbye", priority: 3, enter: 0.4, exit: 0.3, minHold: 1 },
  error: { expression: "error", priority: 4, enter: 0.25, exit: 0.5, minHold: 1.5, auto: { after: 3, then: "idle" } },
};

export type MachineEffect =
  | { type: "enter"; state: AssistantState; from: AssistantState }
  | { type: "loop"; state: AssistantState }
  | { type: "exit"; state: AssistantState; to: AssistantState }
  | { type: "escalate"; state: AssistantState };

export interface MachineOptions {
  /** Idle seconds before drowsy / asleep. */
  drowsyAfter?: number;
  sleepAfter?: number;
  /** Thinking longer than this escalates (wrist tap, progress hologram). */
  escalateAfter?: number;
}

export interface MachineSnapshot {
  state: AssistantState;
  phase: StatePhase;
  /** Time the current phase started (s). */
  phaseStart: number;
  /** Time the current state was entered (s). */
  enteredAt: number;
  pending: AssistantState | null;
}

export class AssistantMachine {
  state: AssistantState = "offscreen";
  phase: StatePhase = "loop";
  phaseStart = 0;
  enteredAt = 0;
  pending: AssistantState | null = null;
  private escalated = false;
  readonly drowsyAfter: number;
  readonly sleepAfter: number;
  readonly escalateAfter: number;

  constructor(
    private defs: Record<AssistantState, StateDef> = STATE_DEFS,
    opts: MachineOptions = {},
  ) {
    this.drowsyAfter = opts.drowsyAfter ?? 45;
    this.sleepAfter = opts.sleepAfter ?? 90;
    this.escalateAfter = opts.escalateAfter ?? 4;
  }

  get snapshot(): MachineSnapshot {
    return { state: this.state, phase: this.phase, phaseStart: this.phaseStart, enteredAt: this.enteredAt, pending: this.pending };
  }

  def(s: AssistantState = this.state) {
    return this.defs[s];
  }

  /** Ask for a state. Returns the effects caused right now (may be none if queued). */
  request(target: AssistantState, now: number): MachineEffect[] {
    if (target === this.state && this.phase !== "exit") {
      this.pending = null;
      return [];
    }
    const out: MachineEffect[] = [];
    if (this.phase === "exit") {
      this.queue(target);
      return out;
    }
    const cur = this.defs[this.state];
    const nxt = this.defs[target];
    const held = now - this.enteredAt >= cur.minHold;
    if (nxt.priority > cur.priority || held) this.beginExit(target, now, out);
    else this.queue(target);
    return out;
  }

  /** Any user interaction: wakes the character if it is drowsy or asleep. */
  interaction(now: number): MachineEffect[] {
    if (this.state === "drowsy" || this.state === "sleeping") return this.request("waking", now);
    return [];
  }

  /** Advance phases, auto transitions, escalation and idle timers. */
  tick(now: number, idleSeconds: number): MachineEffect[] {
    const out: MachineEffect[] = [];
    const def = this.defs[this.state];

    if (this.phase === "enter" && now - this.phaseStart >= def.enter) {
      this.phase = "loop";
      this.phaseStart = now;
      out.push({ type: "loop", state: this.state });
    } else if (this.phase === "exit" && now - this.phaseStart >= def.exit) {
      this.enterState(this.pending ?? "idle", now, out);
      return out;
    }

    if (this.phase !== "loop") return out;

    if (this.pending && now - this.enteredAt >= def.minHold) {
      this.beginExit(this.pending, now, out);
      return out;
    }

    if (def.auto && now - this.phaseStart >= def.auto.after) {
      out.push(...this.request(def.auto.then, now));
      return out;
    }

    if (this.state === "thinking" && !this.escalated && now - this.enteredAt >= this.escalateAfter) {
      this.escalated = true;
      out.push({ type: "escalate", state: "thinking" });
    }

    if (this.state === "idle" && idleSeconds >= this.drowsyAfter) out.push(...this.request("drowsy", now));
    else if (this.state === "drowsy" && idleSeconds >= this.sleepAfter) out.push(...this.request("sleeping", now));
    else if ((this.state === "drowsy" || this.state === "sleeping") && idleSeconds < 1) out.push(...this.request("waking", now));

    return out;
  }

  private queue(target: AssistantState) {
    if (!this.pending || this.defs[target].priority >= this.defs[this.pending].priority) this.pending = target;
  }

  private beginExit(target: AssistantState, now: number, out: MachineEffect[]) {
    this.pending = target;
    const def = this.defs[this.state];
    if (def.exit <= 0 || this.state === "offscreen") {
      this.enterState(target, now, out);
      return;
    }
    this.phase = "exit";
    this.phaseStart = now;
    out.push({ type: "exit", state: this.state, to: target });
  }

  private enterState(target: AssistantState, now: number, out: MachineEffect[]) {
    const from = this.state;
    this.state = target;
    this.pending = null;
    this.escalated = false;
    this.enteredAt = now;
    this.phaseStart = now;
    const def = this.defs[target];
    this.phase = def.enter > 0 ? "enter" : "loop";
    out.push({ type: "enter", state: target, from });
    if (this.phase === "loop") out.push({ type: "loop", state: target });
  }
}
