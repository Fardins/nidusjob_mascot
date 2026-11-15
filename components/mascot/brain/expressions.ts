/**
 * Facial/body pose presets (three.js-free). Every numeric value is blended
 * toward its target each frame with per-feature timing (brows lead, then
 * eyes, mouth, cheeks), so switching expressions never snaps.
 */
export interface ExpressionParams {
  /* ---------------------------------------------------------------- eyes */
  /** Upper lid: -0.3 wide open … 0 normal … 1 closed */
  lidUpper: number;
  /** Lower lid raise (happy squint): 0 … 1 */
  lidLower: number;
  /** Extra closure of the left / right eye only (wink), 0 … 1 */
  winkL: number;
  winkR: number;
  /** Pupil/iris scale */
  pupil: number;
  /** Extra gaze offset (x, y in -1…1) applied on top of tracking */
  gazeX: number;
  gazeY: number;
  /** Spiral "dizzy" eyes, 0 … 1 */
  dizzy: number;

  /* --------------------------------------------------------------- brows */
  /** Eyebrow vertical offset (whole brow) */
  browY: number;
  /** Eyebrow inner-corner tilt (+ = worried/curious, - = determined) */
  browTilt: number;
  /** Left/right brow asymmetry (left brow raised) */
  browAsym: number;
  /** Extra inner-point / outer-point lift (3-point brows) */
  browInner: number;
  browOuter: number;

  /* --------------------------------------------------------------- mouth */
  /** Smile curve: -1 frown … 1 big smile */
  smile: number;
  /** Mouth opening: 0 closed … 1 wide "O" */
  mouthOpen: number;
  /** Mouth width multiplier */
  mouthWidth: number;
  /** Sideways skew/smirk: -1 … 1 */
  mouthSkew: number;
  /** Rounded lips: 0 … 1 */
  pucker: number;

  /* -------------------------------------------------------------- cheeks */
  /** Cheek blush intensity */
  blush: number;
  /** Cheek puff 0 … 1 */
  cheekPuff: number;

  /* ---------------------------------------------------------------- body */
  /** Head roll (radians) */
  headTilt: number;
  /** Head pitch (radians, + = chin up) */
  headPitch: number;
  /** Lean toward the viewer (+) or away (-), 0 … 1 scale */
  lean: number;
  /** Shoulders drop / sad posture, 0 … 1 */
  slump: number;
  /** Antenna wobble energy */
  antenna: number;
  /** Antenna droop (sleepy/sad), 0 … 1 */
  droop: number;
  /** Antenna tip glow */
  glow: number;
  /** Idle bounce amplitude */
  bounce: number;
  /** Arm raise (0 rest … 1 up) */
  arms: number;
  /** Breathing rate multiplier (1 = 3–5 s per breath, ~0 = held) */
  breathRate: number;
  /** Breathing depth multiplier */
  breathDepth: number;
  /** Blink rate multiplier */
  blinkRate: number;
  /** Float amplitude multiplier (sleep sinks) */
  float: number;
}

export type ParamKey = keyof ExpressionParams;

export type ExpressionName =
  | "neutral"
  | "happy"
  | "curious"
  | "surprised"
  | "thinking"
  | "excited"
  | "listening"
  | "explaining"
  | "speaking"
  | "laughing"
  | "winking"
  | "celebrating"
  | "confused"
  | "error"
  | "sad"
  | "drowsy"
  | "sleeping"
  | "welcome"
  | "goodbye"
  | "shy"
  | "dizzy";

/** Antenna tip behaviour (rendered by the antenna material). */
export type AntennaMode = "idle" | "listening" | "thinking" | "speaking" | "success" | "error" | "sleeping";
/** Chest logo behaviour. */
export type LogoMode = "idle" | "loading" | "equalizer" | "check" | "alert";

export interface ExpressionMeta {
  label: string;
  antenna: AntennaMode;
  logo: LogoMode;
  /** Short description used by the showcase page. */
  description: string;
}

export const BASE_PARAMS: ExpressionParams = {
  lidUpper: 0.08,
  lidLower: 0,
  winkL: 0,
  winkR: 0,
  pupil: 1,
  gazeX: 0,
  gazeY: 0,
  dizzy: 0,
  browY: 0,
  browTilt: 0,
  browAsym: 0,
  browInner: 0,
  browOuter: 0,
  smile: 0.45,
  mouthOpen: 0,
  mouthWidth: 1,
  mouthSkew: 0,
  pucker: 0,
  blush: 0.35,
  cheekPuff: 0,
  headTilt: 0,
  headPitch: 0,
  lean: 0,
  slump: 0,
  antenna: 0.5,
  droop: 0,
  glow: 0.6,
  bounce: 0.25,
  arms: 0,
  breathRate: 1,
  breathDepth: 1,
  blinkRate: 1,
  float: 1,
};

const e = (p: Partial<ExpressionParams>): ExpressionParams => ({ ...BASE_PARAMS, ...p });

export const EXPRESSIONS: Record<ExpressionName, ExpressionParams> = {
  neutral: e({}),
  happy: e({
    lidUpper: 0.12,
    lidLower: 0.32,
    smile: 1,
    mouthWidth: 1.1,
    blush: 0.85,
    browY: 0.02,
    antenna: 0.7,
    glow: 0.85,
    bounce: 0.45,
  }),
  curious: e({
    lidUpper: -0.05,
    pupil: 1.12,
    browY: 0.035,
    browTilt: 0.18,
    browAsym: 0.05,
    browOuter: 0.01,
    smile: 0.25,
    mouthWidth: 0.8,
    headTilt: 0.22,
    antenna: 0.9,
    glow: 0.9,
    lean: 0.3,
  }),
  surprised: e({
    lidUpper: -0.32,
    pupil: 0.72,
    browY: 0.075,
    browTilt: 0.12,
    browInner: 0.01,
    smile: 0,
    mouthOpen: 0.9,
    mouthWidth: 0.7,
    pucker: 0.4,
    blush: 0.5,
    antenna: 1.6,
    glow: 1.2,
    bounce: 0.1,
    arms: 0.45,
    headPitch: 0.06,
    lean: -0.4,
    breathRate: 0.15,
    blinkRate: 0.3,
  }),
  thinking: e({
    lidUpper: 0.3,
    pupil: 0.95,
    browY: 0.01,
    browTilt: -0.12,
    browAsym: 0.06,
    smile: 0.1,
    mouthWidth: 0.6,
    mouthSkew: 0.35,
    pucker: 0.25,
    headTilt: -0.14,
    gazeX: 0.55,
    gazeY: 0.6,
    antenna: 0.3,
    glow: 1.4,
    bounce: 0.12,
    blinkRate: 1.5,
  }),
  excited: e({
    lidUpper: -0.12,
    lidLower: 0.2,
    pupil: 1.18,
    browY: 0.05,
    smile: 1,
    mouthOpen: 0.55,
    mouthWidth: 1.25,
    blush: 1,
    antenna: 1.8,
    glow: 1.6,
    bounce: 1,
    arms: 1,
    breathRate: 1.7,
    lean: 0.2,
  }),
  listening: e({
    lidUpper: -0.08,
    pupil: 1.1,
    browY: 0.025,
    browTilt: 0.06,
    smile: 0.55,
    mouthWidth: 0.95,
    lean: 0.8,
    antenna: 0.35,
    glow: 1.1,
    bounce: 0.15,
    blinkRate: 0.6,
    headTilt: 0.05,
  }),
  explaining: e({
    lidUpper: 0.02,
    pupil: 1.05,
    browY: 0.03,
    browInner: 0.008,
    smile: 0.6,
    mouthWidth: 1.05,
    antenna: 0.8,
    glow: 1,
    bounce: 0.3,
    lean: 0.25,
  }),
  speaking: e({
    lidUpper: 0.04,
    browY: 0.02,
    smile: 0.55,
    mouthWidth: 1,
    antenna: 0.7,
    glow: 1,
    bounce: 0.25,
    lean: 0.2,
  }),
  laughing: e({
    lidUpper: 0.78,
    lidLower: 0.7,
    browY: 0.04,
    browTilt: 0.1,
    smile: 1,
    mouthOpen: 0.75,
    mouthWidth: 1.3,
    blush: 1,
    headPitch: 0.16,
    antenna: 1.5,
    glow: 1.3,
    bounce: 0.6,
    breathRate: 2,
  }),
  winking: e({
    lidLower: 0.2,
    winkR: 1,
    browAsym: 0.035,
    smile: 0.85,
    mouthSkew: 0.45,
    mouthWidth: 1.05,
    blush: 0.7,
    headTilt: 0.12,
    antenna: 0.9,
    glow: 1,
  }),
  celebrating: e({
    lidUpper: 0.75,
    lidLower: 0.75,
    browY: 0.06,
    smile: 1,
    mouthOpen: 0.6,
    mouthWidth: 1.3,
    blush: 1,
    antenna: 2,
    glow: 1.8,
    bounce: 1,
    arms: 1,
    breathRate: 1.8,
  }),
  confused: e({
    lidUpper: 0.16,
    lidLower: 0.15,
    browAsym: 0.06,
    browTilt: 0.08,
    browY: 0.01,
    smile: 0.05,
    mouthSkew: -0.6,
    mouthWidth: 0.75,
    headTilt: -0.24,
    antenna: 0.6,
    glow: 0.8,
    bounce: 0.1,
    blinkRate: 1.4,
  }),
  error: e({
    lidUpper: -0.2,
    pupil: 0.82,
    browY: 0.03,
    browTilt: 0.22,
    browInner: 0.02,
    smile: -0.45,
    mouthWidth: 0.8,
    blush: 0.2,
    lean: -0.5,
    antenna: 1.1,
    glow: 1.2,
    bounce: 0.05,
    blinkRate: 1.6,
    breathRate: 1.4,
  }),
  sad: e({
    lidUpper: 0.3,
    pupil: 1.1,
    browY: -0.01,
    browTilt: 0.3,
    browInner: 0.025,
    smile: -0.55,
    mouthWidth: 0.85,
    blush: 0.15,
    headPitch: -0.14,
    gazeY: -0.5,
    slump: 1,
    antenna: 0.2,
    droop: 0.7,
    glow: 0.35,
    bounce: 0.02,
    breathRate: 0.75,
  }),
  drowsy: e({
    lidUpper: 0.55,
    lidLower: 0.08,
    pupil: 1.15,
    browY: -0.01,
    smile: 0.2,
    mouthWidth: 0.85,
    headPitch: -0.08,
    slump: 0.4,
    antenna: 0.15,
    droop: 0.4,
    glow: 0.35,
    bounce: 0,
    breathRate: 0.7,
    breathDepth: 1.3,
    blinkRate: 0.55,
    float: 0.6,
  }),
  sleeping: e({
    lidUpper: 1,
    lidLower: 0.1,
    browY: -0.012,
    browTilt: 0.04,
    smile: 0.15,
    mouthOpen: 0.12,
    mouthWidth: 0.7,
    pucker: 0.4,
    blush: 0.45,
    headPitch: -0.2,
    headTilt: 0.12,
    slump: 0.8,
    antenna: 0.05,
    droop: 1,
    glow: 0.12,
    bounce: 0,
    breathRate: 0.55,
    breathDepth: 1.8,
    blinkRate: 0,
    float: 0.35,
  }),
  welcome: e({
    lidUpper: -0.05,
    lidLower: 0.25,
    pupil: 1.12,
    browY: 0.05,
    smile: 1,
    mouthOpen: 0.25,
    mouthWidth: 1.2,
    blush: 0.9,
    antenna: 1.2,
    glow: 1.2,
    bounce: 0.5,
    lean: 0.3,
  }),
  goodbye: e({
    lidUpper: 0.18,
    lidLower: 0.25,
    browY: 0.01,
    browTilt: 0.16,
    browInner: 0.01,
    smile: 0.6,
    mouthWidth: 0.95,
    blush: 0.6,
    headTilt: 0.1,
    antenna: 0.5,
    droop: 0.2,
    glow: 0.8,
    bounce: 0.15,
  }),
  shy: e({
    lidUpper: 0.25,
    lidLower: 0.3,
    browTilt: 0.14,
    browInner: 0.012,
    smile: 0.7,
    mouthWidth: 0.8,
    blush: 1.6,
    headTilt: 0.18,
    headPitch: -0.1,
    gazeX: -0.6,
    gazeY: -0.35,
    antenna: 0.3,
    droop: 0.2,
    glow: 0.7,
    bounce: 0.2,
  }),
  dizzy: e({
    lidUpper: 0.1,
    dizzy: 1,
    browTilt: 0.15,
    browAsym: 0.04,
    smile: 0.2,
    mouthSkew: 0.5,
    mouthOpen: 0.2,
    mouthWidth: 0.9,
    headTilt: 0.15,
    antenna: 1.6,
    glow: 0.9,
    bounce: 0.1,
  }),
};

export const EXPRESSION_META: Record<ExpressionName, ExpressionMeta> = {
  neutral: { label: "Calm", antenna: "idle", logo: "idle", description: "Relaxed default face" },
  happy: { label: "Happy", antenna: "idle", logo: "idle", description: "Warm smile, happy squint" },
  curious: { label: "Curious", antenna: "listening", logo: "idle", description: "Head tilt, one brow up" },
  surprised: { label: "Surprised", antenna: "listening", logo: "idle", description: "Wide eyes, open mouth, breath held" },
  thinking: { label: "Thinking", antenna: "thinking", logo: "loading", description: "Eyes up, lips pursed, chase light" },
  excited: { label: "Excited", antenna: "success", logo: "idle", description: "Big smile, bouncy idle, faster breathing" },
  listening: { label: "Listening", antenna: "listening", logo: "idle", description: "Lean in, attentive, steady glow" },
  explaining: { label: "Explaining", antenna: "speaking", logo: "equalizer", description: "Engaged, active brows, gestures" },
  speaking: { label: "Speaking", antenna: "speaking", logo: "equalizer", description: "Lip-sync plus emotion overlay" },
  laughing: { label: "Laughing", antenna: "success", logo: "idle", description: "Eyes squeezed, shoulders shake" },
  winking: { label: "Winking", antenna: "idle", logo: "idle", description: "One eye closed, smirk" },
  celebrating: { label: "Celebrating", antenna: "success", logo: "check", description: "Arms up, ^ ^ eyes, confetti" },
  confused: { label: "Confused", antenna: "thinking", logo: "idle", description: "One brow up, skewed mouth, head tilt" },
  error: { label: "Warning", antenna: "error", logo: "alert", description: "Worried brows, step back, amber blink" },
  sad: { label: "Sad", antenna: "sleeping", logo: "idle", description: "Inner brows up, shoulders drop" },
  drowsy: { label: "Drowsy", antenna: "sleeping", logo: "idle", description: "Heavy lids, slow blinks" },
  sleeping: { label: "Sleeping", antenna: "sleeping", logo: "idle", description: "Eyes closed, deep slow breathing" },
  welcome: { label: "Welcome", antenna: "success", logo: "idle", description: "Brow flash, big smile" },
  goodbye: { label: "Goodbye", antenna: "idle", logo: "idle", description: "Warm smile, slight sadness" },
  shy: { label: "Shy", antenna: "idle", logo: "idle", description: "Eyes away, blush up" },
  dizzy: { label: "Dizzy", antenna: "thinking", logo: "idle", description: "Spiral eyes after too many clicks" },
};

export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS) as ExpressionName[];
export const PARAM_KEYS = Object.keys(BASE_PARAMS) as ParamKey[];

/** Feature groups for staggered blending: brows move first, cheeks last. */
export type FeatureGroup = "brows" | "eyes" | "mouth" | "cheeks" | "body";

export const PARAM_GROUP: Record<ParamKey, FeatureGroup> = {
  browY: "brows",
  browTilt: "brows",
  browAsym: "brows",
  browInner: "brows",
  browOuter: "brows",
  lidUpper: "eyes",
  lidLower: "eyes",
  winkL: "eyes",
  winkR: "eyes",
  pupil: "eyes",
  gazeX: "eyes",
  gazeY: "eyes",
  dizzy: "eyes",
  smile: "mouth",
  mouthOpen: "mouth",
  mouthWidth: "mouth",
  mouthSkew: "mouth",
  pucker: "mouth",
  blush: "cheeks",
  cheekPuff: "cheeks",
  headTilt: "body",
  headPitch: "body",
  lean: "body",
  slump: "body",
  antenna: "body",
  droop: "body",
  glow: "body",
  bounce: "body",
  arms: "body",
  breathRate: "body",
  breathDepth: "body",
  blinkRate: "body",
  float: "body",
};

/** Seconds each group lags behind a target change, and its blend rate (1/s). */
export const GROUP_TIMING: Record<FeatureGroup, { delay: number; rate: number }> = {
  brows: { delay: 0, rate: 10 },
  eyes: { delay: 0.05, rate: 11 },
  mouth: { delay: 0.1, rate: 8 },
  cheeks: { delay: 0.14, rate: 4 },
  body: { delay: 0.04, rate: 4.5 },
};

/** Writes `a + (b - a) * k` into `out` (all keys). No allocation. */
export function lerpParams(out: ExpressionParams, a: ExpressionParams, b: ExpressionParams, k: number) {
  for (const key of PARAM_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

export function copyParams(out: ExpressionParams, src: ExpressionParams) {
  for (const key of PARAM_KEYS) out[key] = src[key];
  return out;
}
