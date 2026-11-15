import { describe, expect, it } from "vitest";
import { sampleTimeline, textToVisemes, VisemeMixer, VISEMES, visemeDuration, type VisemeKey } from "../visemes";

describe("visemes", () => {
  it("defines the 15-viseme set", () => {
    expect(VISEMES).toHaveLength(15);
  });

  it("maps text to a monotonic timeline that ends in silence", () => {
    const keys = textToVisemes("Hello, the moon!");
    for (let i = 1; i < keys.length; i++) expect(keys[i].t).toBeGreaterThanOrEqual(keys[i - 1].t);
    expect(keys[keys.length - 1].v).toBe("sil");
    const vs = keys.map((k) => k.v);
    expect(vs).toContain("TH");
    expect(vs).toContain("U");
    expect(visemeDuration(keys)).toBeGreaterThan(0.5);
  });

  it("samples the active and next viseme", () => {
    const keys: VisemeKey[] = [
      { t: 0, v: "PP" },
      { t: 0.1, v: "aa" },
      { t: 0.2, v: "sil" },
    ];
    expect(sampleTimeline(keys, 0.15)).toMatchObject({ cur: "aa", next: "sil" });
    expect(sampleTimeline(keys, -1).cur).toBe("sil");
  });

  it("smooths channels (no instant jumps) and closes the lips for PP", () => {
    const m = new VisemeMixer();
    const a = m.update(1 / 60, "aa", "aa", 0).jaw;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(0.85);
    for (let i = 0; i < 60; i++) m.update(1 / 60, "PP", "PP", 0);
    expect(m.out.closed).toBeGreaterThan(0.6);
    expect(m.out.jaw).toBeLessThan(0.1);
  });
});
