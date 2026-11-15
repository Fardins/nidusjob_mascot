import { describe, expect, it } from "vitest";
import { AssistantMachine } from "../machine";

const effectsOf = (fx: ReturnType<AssistantMachine["tick"]>) => fx.map((e) => `${e.type}:${e.state}`);

describe("AssistantMachine", () => {
  it("enters a state through enter → loop phases", () => {
    const m = new AssistantMachine();
    m.request("idle", 0);
    expect(m.state).toBe("idle");
    expect(m.phase).toBe("enter");
    m.tick(0.31, 0);
    expect(m.phase).toBe("loop");
  });

  it("plays an exit phase before entering the next state", () => {
    const m = new AssistantMachine();
    m.request("idle", 0);
    m.tick(1, 0);
    m.request("listening", 2);
    expect(m.phase).toBe("exit");
    expect(m.state).toBe("idle");
    m.tick(2.25, 0);
    expect(m.state).toBe("listening");
  });

  it("holds a state for its minimum time against equal/lower priority requests", () => {
    const m = new AssistantMachine();
    m.request("idle", 0);
    m.tick(1, 0);
    m.request("thinking", 1); // higher priority than idle: interrupts
    m.tick(1.3, 0);
    expect(m.state).toBe("thinking");
    m.request("speaking", 1.4); // same priority, hold not reached → queued
    expect(m.state).toBe("thinking");
    expect(m.pending).toBe("speaking");
    m.tick(1.3 + 0.81, 0); // hold reached → exit
    m.tick(1.3 + 0.81 + 0.31, 0);
    expect(m.state).toBe("speaking");
  });

  it("lets higher priority interrupt immediately (error > user > speaking > idle)", () => {
    const m = new AssistantMachine();
    m.request("speaking", 0);
    m.tick(0.3, 0);
    m.request("error", 0.35);
    expect(m.phase).toBe("exit");
    expect(m.pending).toBe("error");
  });

  it("keeps the highest-priority pending request", () => {
    const m = new AssistantMachine();
    m.request("listening", 0);
    m.request("error", 0.1);
    m.request("idle", 0.15);
    expect(m.pending).toBe("error");
  });

  it("auto-advances states with an `auto` rule", () => {
    const m = new AssistantMachine();
    m.request("success", 0);
    m.tick(0.3, 0);
    m.tick(2, 0);
    m.tick(2.45, 0);
    expect(m.state).toBe("idle");
  });

  it("escalates thinking after 4 s, once", () => {
    const m = new AssistantMachine();
    m.request("thinking", 0);
    m.tick(0.4, 0);
    expect(effectsOf(m.tick(4.1, 0))).toContain("escalate:thinking");
    expect(effectsOf(m.tick(5, 0))).not.toContain("escalate:thinking");
  });

  it("goes drowsy then asleep with inactivity, and wakes on interaction", () => {
    const m = new AssistantMachine();
    m.request("idle", 0);
    m.tick(1, 10);
    m.tick(2, 46);
    m.tick(2.3, 46);
    expect(m.state).toBe("drowsy");
    m.tick(10, 91);
    m.tick(10.4, 91);
    expect(m.state).toBe("sleeping");
    m.tick(12.5, 92);
    m.interaction(13);
    m.tick(13.3, 0);
    expect(m.state).toBe("waking");
    m.tick(13.6, 0);
    m.tick(15.3, 0);
    m.tick(15.75, 0);
    expect(m.state).toBe("idle");
  });
});
