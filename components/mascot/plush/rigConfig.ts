import type { ExpressionName } from "../expressions";

/**
 * Everything that depends on how plush.glb was authored lives here.
 *
 * Names are matched after normalisation (lower-case, "mixamorig" prefix and
 * all non-alphanumerics stripped), so "mixamorig:LeftUpLeg", "thigh.L" and
 * "Thigh_L" become "leftupleg", "thighl", "thighl". Each list is tried in
 * order: exact matches first, then substring matches. Anything that isn't
 * found is skipped gracefully — the character still works, just with that
 * layer disabled. When the real model arrives, open it once with
 * `?plush-debug` to log what was detected, then adjust these lists.
 */

/**
 * Model assets. Only `rigged` is ever loaded as the live character.
 * `staticExport` is the frozen, unrigged export of the procedural mascot
 * (made with `?export-glb` + Shift+E) for Blender / other engines — loading
 * it here would replace the fully rigged character with a statue.
 */
export const MODEL_ASSETS = {
  rigged: "/models/plush.glb",
  staticExport: "/models/nidus-mascot.glb",
} as const;

export const PLUSH_MODEL_URL = MODEL_ASSETS.rigged;

/** Self-hosted decoders copied from three/examples/jsm/libs (same version as three). */
export const DECODER_PATHS = {
  draco: "/decoders/draco/",
  basis: "/decoders/basis/",
};

/* ------------------------------------------------------------------ clips */

export type ClipState =
  | "idle"
  | "look_around"
  | "wave"
  | "happy_bounce"
  | "surprised"
  | "thinking"
  | "shy"
  | "talk_gesture";

export const CLIP_NAMES: Record<ClipState, string[]> = {
  idle: ["idle", "idlemain", "idle01", "breathingidle", "standing"],
  look_around: ["lookaround", "look", "curious"],
  wave: ["wave", "waving", "hello", "greet"],
  happy_bounce: ["happybounce", "bounce", "jump", "happy", "excited", "cheer"],
  surprised: ["surprised", "surprise", "shock", "startle"],
  thinking: ["thinking", "think", "ponder"],
  shy: ["shy", "bashful", "embarrassed"],
  talk_gesture: ["talkgesture", "talk", "talking", "explain", "gesture"],
};

/** Extra idle clips played at random (any clip whose name contains one of these, other than the main idle). */
export const IDLE_VARIATION_HINTS = ["idle", "fidget", "stretch", "yawn", "scratch", "sway"];

/** Optional additive breathing clip; procedural breathing is always used as well. */
export const BREATH_CLIP_NAMES = ["breath", "breathing", "breathadditive"];

/** Crossfade duration bounds (seconds). */
export const CROSSFADE = { min: 0.3, max: 0.5 };

/* ------------------------------------------------------------------ bones */

export const BONE_NAMES = {
  hips: ["hips", "pelvis", "hip", "root"],
  spine: ["spine", "spine01", "spine1", "spinelower"],
  chest: ["spine2", "chest", "spine02", "spine3", "upperchest", "spineupper"],
  neck: ["neck", "neck01", "neck1"],
  head: ["head", "head01"],
  eyeL: ["lefteye", "eyel", "eyeleft", "leye"],
  eyeR: ["righteye", "eyer", "eyeright", "reye"],
  upLegL: ["leftupleg", "thighl", "upperlegl", "leftthigh", "lthigh"],
  legL: ["leftleg", "shinl", "calfl", "lowerlegl", "leftshin", "lcalf"],
  footL: ["leftfoot", "footl", "lfoot"],
  upLegR: ["rightupleg", "thighr", "upperlegr", "rightthigh", "rthigh"],
  legR: ["rightleg", "shinr", "calfr", "lowerlegr", "rightshin", "rcalf"],
  footR: ["rightfoot", "footr", "rfoot"],
} as const;

export type BoneKey = keyof typeof BONE_NAMES;

/** Look-at weights per bone (fraction of the full gaze rotation each takes). */
export const LOOK_WEIGHTS = { eyes: 1.0, head: 0.6, neck: 0.25, spine: 0.1 };
/** Max rotation (radians) the whole chain may turn: yaw / pitch. */
export const LOOK_LIMITS = { yaw: 1.05, pitch: 0.6 };
/** Eyes lead the head by this many seconds. */
export const EYE_LEAD = 0.12;

/* ------------------------------------------------------------- jiggle bones */

export interface JiggleGroup {
  /** Normalised substrings; any bone whose name contains one is driven. */
  match: string[];
  stiffness: number; // spring constant (1/s²)
  damping: number; // 1/s
  gravity: number; // m/s² pull on the tip
  /** How much the bone reacts to the character's own motion/turns. */
  inertia: number;
  /** Max swing angle (radians). */
  limit: number;
}

export const JIGGLE_GROUPS: JiggleGroup[] = [
  { match: ["belly", "tummy", "stomach"], stiffness: 220, damping: 14, gravity: 0.6, inertia: 1.0, limit: 0.18 },
  { match: ["hood", "hoodrim", "cap"], stiffness: 140, damping: 9, gravity: 1.2, inertia: 1.2, limit: 0.35 },
  { match: ["fluff", "armfluff", "tuft", "fur"], stiffness: 90, damping: 6, gravity: 1.5, inertia: 1.4, limit: 0.5 },
  { match: ["ear", "antenna", "tail", "jiggle"], stiffness: 110, damping: 7, gravity: 1.0, inertia: 1.3, limit: 0.45 },
];

/* ------------------------------------------------------------- blendshapes */

/** Morph names for blinks/eye darts — ARKit names first, then common alternatives. */
export const MORPH_NAMES = {
  blinkL: ["eyeblinkleft", "blinkl", "blinkleft", "eyeclosedl", "eyeclosel"],
  blinkR: ["eyeblinkright", "blinkr", "blinkright", "eyeclosedr", "eyecloser"],
  blink: ["blink", "eyesclosed", "eyeclose"],
  lookUpL: ["eyelookupleft"],
  lookUpR: ["eyelookupright"],
  lookDownL: ["eyelookdownleft"],
  lookDownR: ["eyelookdownright"],
  lookInL: ["eyelookinleft"],
  lookInR: ["eyelookinright"],
  lookOutL: ["eyelookoutleft"],
  lookOutR: ["eyelookoutright"],
  jawOpen: ["jawopen", "mouthopen", "open", "a"],
  visemeAA: ["visemeaa", "vaa", "aa"],
  visemeO: ["visemeo", "vo", "oh", "o"],
  visemeE: ["visemee", "ve", "ee", "e"],
} as const;

export type MorphKey = keyof typeof MORPH_NAMES;

/**
 * Expression presets → blendshape weights (0…1). Keys are normalised morph
 * names; missing morphs are ignored. ARKit-style names are used by default.
 */
export const EXPRESSION_MORPHS: Record<ExpressionName, Record<string, number>> = {
  neutral: { mouthsmileleft: 0.15, mouthsmileright: 0.15 },
  happy: {
    mouthsmileleft: 0.85,
    mouthsmileright: 0.85,
    cheeksquintleft: 0.5,
    cheeksquintright: 0.5,
    eyesquintleft: 0.25,
    eyesquintright: 0.25,
    smile: 0.85,
    happy: 1,
  },
  curious: {
    browinnerup: 0.45,
    browouterupleft: 0.55,
    eyewideleft: 0.2,
    eyewideright: 0.2,
    mouthsmileleft: 0.25,
    mouthpucker: 0.15,
    curious: 1,
  },
  surprised: {
    browinnerup: 0.9,
    browouterupleft: 0.8,
    browouterupright: 0.8,
    eyewideleft: 0.9,
    eyewideright: 0.9,
    jawopen: 0.45,
    mouthfunnel: 0.4,
    surprised: 1,
  },
  thinking: {
    browdownleft: 0.35,
    browouterupright: 0.4,
    mouthpressleft: 0.3,
    mouthrollupper: 0.15,
    mouthleft: 0.3,
    eyesquintleft: 0.2,
    eyesquintright: 0.2,
    thinking: 1,
  },
  excited: {
    mouthsmileleft: 1,
    mouthsmileright: 1,
    jawopen: 0.3,
    cheeksquintleft: 0.6,
    cheeksquintright: 0.6,
    browinnerup: 0.4,
    eyewideleft: 0.3,
    eyewideright: 0.3,
    smile: 1,
    excited: 1,
  },
  listening: { browinnerup: 0.25, eyewideleft: 0.25, eyewideright: 0.25, mouthsmileleft: 0.4, mouthsmileright: 0.4 },
  explaining: { browinnerup: 0.2, mouthsmileleft: 0.5, mouthsmileright: 0.5, browouterupleft: 0.15, browouterupright: 0.15 },
  speaking: { mouthsmileleft: 0.45, mouthsmileright: 0.45 },
  laughing: { eyeblinkleft: 0.7, eyeblinkright: 0.7, mouthsmileleft: 1, mouthsmileright: 1, jawopen: 0.55, cheeksquintleft: 0.9, cheeksquintright: 0.9 },
  winking: { eyeblinkright: 1, cheeksquintright: 0.7, mouthsmileleft: 0.5, mouthsmileright: 0.9, browouterupleft: 0.3 },
  celebrating: { eyesquintleft: 0.7, eyesquintright: 0.7, mouthsmileleft: 1, mouthsmileright: 1, jawopen: 0.4, cheeksquintleft: 0.8, cheeksquintright: 0.8 },
  confused: { browouterupleft: 0.7, browdownright: 0.4, mouthleft: 0.5, mouthpressright: 0.3, eyesquintright: 0.3 },
  error: { browinnerup: 0.9, eyewideleft: 0.6, eyewideright: 0.6, mouthfrownleft: 0.5, mouthfrownright: 0.5 },
  sad: { browinnerup: 0.9, mouthfrownleft: 0.7, mouthfrownright: 0.7, eyelookdownleft: 0.4, eyelookdownright: 0.4, mouthpucker: 0.15 },
  drowsy: { eyeblinkleft: 0.5, eyeblinkright: 0.5, mouthsmileleft: 0.1, mouthsmileright: 0.1 },
  sleeping: { eyeblinkleft: 1, eyeblinkright: 1, jawopen: 0.12, mouthfunnel: 0.2 },
  welcome: { browinnerup: 0.5, browouterupleft: 0.5, browouterupright: 0.5, mouthsmileleft: 1, mouthsmileright: 1, cheeksquintleft: 0.5, cheeksquintright: 0.5 },
  goodbye: { browinnerup: 0.4, mouthsmileleft: 0.55, mouthsmileright: 0.55 },
  shy: { mouthsmileleft: 0.6, mouthsmileright: 0.6, eyelookdownleft: 0.4, eyelookdownright: 0.4, cheekpuff: 0.2, browinnerup: 0.3 },
  dizzy: { browinnerup: 0.4, mouthleft: 0.4, jawopen: 0.15, eyesquintleft: 0.2 },
};

/** Expressions that also play a body clip (looping/held while active). */
export const EXPRESSION_CLIPS: Partial<Record<ExpressionName, ClipState>> = {
  surprised: "surprised",
  thinking: "thinking",
};

/* ------------------------------------------------------------------- fur */

export const FUR = {
  /** Normalised substrings matched against mesh AND material names. */
  match: ["fur", "plush", "body", "fluff", "fleece", "hood"],
  /** Never fur these, even if they match above. */
  exclude: ["eye", "iris", "pupil", "cornea", "teeth", "tongue", "mouth", "nose", "lash", "brow", "button", "badge"],
  /** Optional maps; missing files fall back to neutral defaults. R = length (0…1). RG = tangent-space flow. */
  lengthMap: "/models/plush_fur_length.png",
  flowMap: "/models/plush_fur_flow.png",
  /** Shell offset at full length, in mesh units — tune to the model's scale. */
  length: 0.035,
  /** Strands per UV unit. */
  density: 900,
  shells: { high: 32, medium: 24, mobile: 14 },
  sheenColor: "#ffe4ef",
  tipColor: "#ffffff",
};

/** Lights the fur shader's Kajiya-Kay highlight follows (match MascotCanvas). */
export const FUR_LIGHTS = {
  key: { position: [2.5, 4, 3.5] as const, intensity: 1.0 },
  rim: { position: [-2.5, 2.2, -3.2] as const, intensity: 1.6 },
};

/* ------------------------------------------------------------- reactions */

export const IDLE_ROUTINE_AFTER = 8; // seconds without interaction

export const CLICK_LINES = [
  "Hi there! I'm Nidus.",
  "Hehe, that tickles!",
  "Need a hand? Just ask me.",
  "What are we building today?",
  "Ooh, hello again!",
];
