import { beforeEach, describe, expect, it } from "vitest";
import { GesturePicker, IdleScheduler, splitSentences, timeOfDay } from "../behaviors";
import { setSeed } from "../rng";

describe("IdleScheduler", () => {
  beforeEach(() => setSeed(42));

  it("never repeats the previous action and respects cooldowns", () => {
    const s = new IdleScheduler([1, 1]);
    s.reset(0, 0);
    const picks: { name: string; t: number }[] = [];
    for (let t = 0; t < 400; t += 1) {
      const r = s.next(t);
      if (r) picks.push({ name: r, t });
    }
    expect(picks.length).toBeGreaterThan(20);
    for (let i = 1; i < picks.length; i++) expect(picks[i].name).not.toBe(picks[i - 1].name);
    const yawns = picks.filter((p) => p.name === "yawn").map((p) => p.t);
    for (let i = 1; i < yawns.length; i++) expect(yawns[i] - yawns[i - 1]).toBeGreaterThanOrEqual(60);
  });

  it("is deterministic for a given seed", () => {
    const run = () => {
      setSeed(7);
      const s = new IdleScheduler([1, 1]);
      s.reset(0, 0);
      const out: string[] = [];
      for (let t = 0; t < 60; t++) {
        const r = s.next(t);
        if (r) out.push(r);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe("GesturePicker", () => {
  beforeEach(() => setSeed(3));

  it("never picks the same gesture twice in a row", () => {
    const g = new GesturePicker();
    let last = "";
    for (let i = 0; i < 50; i++) {
      const pick = g.pick("Is this a question?");
      expect(pick).not.toBe(last);
      last = pick;
    }
  });

  it("prefers content-appropriate gestures", () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const p = new GesturePicker().pick("First, open the menu, then pick a file, then save.");
      counts[p] = (counts[p] ?? 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    expect(best).toBe("count");
  });
});

describe("helpers", () => {
  it("splits streamed text into sentences", () => {
    expect(splitSentences("Hello there. How are")).toEqual({ sentences: ["Hello there."], rest: "How are" });
    expect(splitSentences("Wow! Really? Yes.")).toEqual({ sentences: ["Wow!", "Really?", "Yes."], rest: "" });
  });

  it("greets by time of day", () => {
    expect(timeOfDay(new Date(2026, 0, 1, 8)).part).toBe("morning");
    expect(timeOfDay(new Date(2026, 0, 1, 2)).energy).toBeLessThan(1);
  });
});
