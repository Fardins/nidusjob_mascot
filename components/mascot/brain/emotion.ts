import { EXPRESSIONS, lerpParams, PARAM_KEYS, type ExpressionName, type ExpressionParams } from "./expressions";

/**
 * Continuous emotion space. Valence -1 (negative) … 1 (positive), arousal
 * 0 (calm) … 1 (energetic). Named expressions are anchors in this space;
 * an arbitrary point blends the nearest anchors so in-between emotions
 * look in-between instead of jumping between presets.
 */
export interface Emotion {
  valence: number;
  arousal: number;
}

export interface EmotionState extends Emotion {
  /** How strongly the emotion overrides the state's own face, 0 … 1. */
  intensity: number;
}

/** Anchor coordinates for the expressions that represent emotions. */
export const EMOTION_ANCHORS: { name: ExpressionName; valence: number; arousal: number }[] = [
  { name: "neutral", valence: 0.05, arousal: 0.3 },
  { name: "happy", valence: 0.7, arousal: 0.45 },
  { name: "excited", valence: 0.85, arousal: 0.95 },
  { name: "curious", valence: 0.3, arousal: 0.6 },
  { name: "surprised", valence: 0.1, arousal: 1 },
  { name: "sad", valence: -0.75, arousal: 0.2 },
  { name: "error", valence: -0.55, arousal: 0.75 },
  { name: "shy", valence: 0.35, arousal: 0.25 },
  { name: "confused", valence: -0.2, arousal: 0.5 },
  { name: "drowsy", valence: 0, arousal: 0.02 },
];

/** Emotion tags the LLM may emit (`⟦emotion:name:0.7⟧`) → valence/arousal. */
export const EMOTION_TAGS: Record<string, Emotion> = {
  neutral: { valence: 0.05, arousal: 0.3 },
  calm: { valence: 0.2, arousal: 0.2 },
  happy: { valence: 0.7, arousal: 0.45 },
  joyful: { valence: 0.85, arousal: 0.7 },
  excited: { valence: 0.85, arousal: 0.95 },
  playful: { valence: 0.75, arousal: 0.7 },
  proud: { valence: 0.7, arousal: 0.6 },
  curious: { valence: 0.3, arousal: 0.6 },
  thoughtful: { valence: 0.1, arousal: 0.35 },
  surprised: { valence: 0.1, arousal: 1 },
  empathetic: { valence: 0.15, arousal: 0.2 },
  apologetic: { valence: -0.45, arousal: 0.25 },
  sad: { valence: -0.75, arousal: 0.2 },
  concerned: { valence: -0.4, arousal: 0.55 },
  worried: { valence: -0.55, arousal: 0.7 },
  confused: { valence: -0.2, arousal: 0.5 },
  shy: { valence: 0.35, arousal: 0.25 },
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function clampEmotion(e: Emotion): Emotion {
  return { valence: clamp(e.valence, -1, 1), arousal: clamp(e.arousal, 0, 1) };
}

/** Tag name + intensity → emotion state. Unknown tags fall back to neutral. */
export function tagToEmotion(tag: string, intensity = 0.7): EmotionState {
  const base = EMOTION_TAGS[tag.trim().toLowerCase()] ?? EMOTION_TAGS.neutral;
  const k = clamp(Number.isFinite(intensity) ? intensity : 0.7, 0, 1);
  // Intensity scales the distance from neutral, so "happy:0.3" is a gentle smile.
  return {
    valence: base.valence * (0.4 + 0.6 * k),
    arousal: 0.3 + (base.arousal - 0.3) * (0.4 + 0.6 * k),
    intensity: 0.45 + 0.55 * k,
  };
}

/**
 * Inverse-distance weights of the two nearest anchors. Returns pairs
 * `[name, weight]` summing to 1 (weights for the rest are 0).
 */
export function emotionWeights(e: Emotion): [ExpressionName, number][] {
  const d = EMOTION_ANCHORS.map((a) => {
    const dv = a.valence - e.valence;
    const da = (a.arousal - e.arousal) * 0.8;
    return { name: a.name, dist: Math.sqrt(dv * dv + da * da) };
  }).sort((x, y) => x.dist - y.dist);
  const [a, b] = d;
  if (a.dist < 1e-4) return [[a.name, 1]];
  const wa = 1 / a.dist;
  const wb = 1 / b.dist;
  return [
    [a.name, wa / (wa + wb)],
    [b.name, wb / (wa + wb)],
  ];
}

/** Nearest named expression (for code that needs a single preset). */
export function emotionToExpression(e: Emotion): ExpressionName {
  return emotionWeights(e)[0][0];
}

/** Blended expression params for a point in emotion space. Writes into `out`. */
export function emotionParams(out: ExpressionParams, e: Emotion): ExpressionParams {
  const w = emotionWeights(e);
  for (const key of PARAM_KEYS) {
    let v = 0;
    for (const [name, k] of w) v += EXPRESSIONS[name][key] * k;
    out[key] = v;
  }
  return out;
}

/**
 * Mix an emotion over a base expression. `k` = emotion intensity.
 * Keeps the base's gaze and breathing so state-driven behaviour survives.
 */
export function overlayEmotion(out: ExpressionParams, base: ExpressionParams, emo: ExpressionParams, k: number) {
  lerpParams(out, base, emo, k);
  out.gazeX = base.gazeX;
  out.gazeY = base.gazeY;
  out.mouthOpen = Math.max(base.mouthOpen, emo.mouthOpen * k * 0.5);
  return out;
}

/* -------------------------------------------------------------- user tone */

const FRUSTRATED = /\b(not working|doesn'?t work|broken|useless|annoy|frustrat|angry|wtf|terrible|awful|hate|stupid|again\?|still not|why (won'?t|doesn'?t|isn'?t))\b|!{2,}|\?{2,}/i;
const SAD = /\b(sad|sorry|lost|failed|upset|depress|lonely|worried|anxious|stress)\b/i;
const HAPPY = /\b(thanks|thank you|awesome|great|love|amazing|perfect|nice|cool|yay)\b|!(?!!)/i;

export type UserTone = "frustrated" | "sad" | "happy" | "neutral";

export function detectUserTone(text: string): UserTone {
  const caps = text.replace(/[^A-Za-z]/g, "");
  const shouting = caps.length > 8 && caps === caps.toUpperCase();
  if (shouting || FRUSTRATED.test(text)) return "frustrated";
  if (SAD.test(text)) return "sad";
  if (HAPPY.test(text)) return "happy";
  return "neutral";
}

/**
 * The user's tone shapes the reply's face: a frustrated or sad user gets a
 * calm, empathetic character — never an overly cheerful one.
 */
export function adjustForUserTone(e: EmotionState, tone: UserTone): EmotionState {
  if (tone === "frustrated" || tone === "sad") {
    return {
      valence: clamp(Math.min(e.valence, 0.25), -0.5, 0.25),
      arousal: Math.min(e.arousal, 0.35),
      intensity: e.intensity,
    };
  }
  return e;
}
