import { describe, expect, it } from "vitest";
import { adjustForUserTone, detectUserTone, emotionParams, emotionToExpression, emotionWeights, tagToEmotion } from "../emotion";
import { BASE_PARAMS, EXPRESSIONS } from "../expressions";

describe("emotion mapping", () => {
  it("maps anchor points to their expressions", () => {
    expect(emotionToExpression({ valence: 0.85, arousal: 0.95 })).toBe("excited");
    expect(emotionToExpression({ valence: -0.75, arousal: 0.2 })).toBe("sad");
    expect(emotionToExpression({ valence: 0.7, arousal: 0.45 })).toBe("happy");
  });

  it("blends in-between emotions (weights sum to 1)", () => {
    const w = emotionWeights({ valence: 0.78, arousal: 0.7 });
    expect(w).toHaveLength(2);
    expect(w[0][1] + w[1][1]).toBeCloseTo(1, 6);
    const p = emotionParams({ ...BASE_PARAMS }, { valence: 0.78, arousal: 0.7 });
    expect(p.smile).toBeGreaterThan(EXPRESSIONS.neutral.smile);
  });

  it("scales tag intensity toward neutral", () => {
    const weak = tagToEmotion("excited", 0.1);
    const strong = tagToEmotion("excited", 1);
    expect(strong.valence).toBeGreaterThan(weak.valence);
    expect(strong.intensity).toBeGreaterThan(weak.intensity);
    expect(tagToEmotion("nonsense").valence).toBeCloseTo(tagToEmotion("neutral").valence);
  });

  it("calms the face down for frustrated users", () => {
    expect(detectUserTone("this is STILL NOT WORKING!!")).toBe("frustrated");
    expect(detectUserTone("thanks, that is awesome")).toBe("happy");
    expect(detectUserTone("how do I export a file")).toBe("neutral");
    const e = adjustForUserTone(tagToEmotion("excited", 1), "frustrated");
    expect(e.arousal).toBeLessThanOrEqual(0.35);
    expect(e.valence).toBeLessThanOrEqual(0.25);
  });
});
