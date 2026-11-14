/**
 * Facial/body pose presets. Every value is blended (critically damped) toward
 * its target each frame, so switching expressions always transitions smoothly.
 */
export interface ExpressionParams {
  /** Upper lid: -0.3 wide open … 0 normal … 1 closed */
  lidUpper: number;
  /** Lower lid raise (happy squint): 0 … 1 */
  lidLower: number;
  /** Pupil/iris scale */
  pupil: number;
  /** Eyebrow vertical offset */
  browY: number;
  /** Eyebrow inner-corner tilt (+ = worried/curious, - = determined) */
  browTilt: number;
  /** Left/right brow asymmetry (one brow raised) */
  browAsym: number;
  /** Smile curve: -1 frown … 1 big smile */
  smile: number;
  /** Mouth opening: 0 closed … 1 wide "O" */
  mouthOpen: number;
  /** Mouth width multiplier */
  mouthWidth: number;
  /** Cheek blush intensity */
  blush: number;
  /** Head roll (radians) */
  headTilt: number;
  /** Extra gaze offset (x, y in -1…1) applied on top of tracking */
  gazeX: number;
  gazeY: number;
  /** Antenna wobble energy */
  antenna: number;
  /** Antenna tip glow */
  glow: number;
  /** Idle bounce amplitude */
  bounce: number;
  /** Arm raise (0 rest … 1 up) */
  arms: number;
}

export type ExpressionName = "neutral" | "happy" | "curious" | "surprised" | "thinking" | "excited";

const base: ExpressionParams = {
  lidUpper: 0.08,
  lidLower: 0,
  pupil: 1,
  browY: 0,
  browTilt: 0,
  browAsym: 0,
  smile: 0.45,
  mouthOpen: 0,
  mouthWidth: 1,
  blush: 0.35,
  headTilt: 0,
  gazeX: 0,
  gazeY: 0,
  antenna: 0.5,
  glow: 0.6,
  bounce: 0.25,
  arms: 0,
};

export const EXPRESSIONS: Record<ExpressionName, ExpressionParams> = {
  neutral: { ...base },
  happy: {
    ...base,
    lidUpper: 0.12,
    lidLower: 0.32,
    smile: 1,
    mouthWidth: 1.1,
    blush: 0.85,
    browY: 0.02,
    antenna: 0.7,
    glow: 0.85,
    bounce: 0.45,
  },
  curious: {
    ...base,
    lidUpper: -0.05,
    pupil: 1.12,
    browY: 0.035,
    browTilt: 0.18,
    browAsym: 0.05,
    smile: 0.25,
    mouthWidth: 0.8,
    headTilt: 0.22,
    antenna: 0.9,
    glow: 0.9,
  },
  surprised: {
    ...base,
    lidUpper: -0.32,
    pupil: 0.72,
    browY: 0.075,
    browTilt: 0.12,
    smile: 0,
    mouthOpen: 0.9,
    mouthWidth: 0.7,
    blush: 0.5,
    antenna: 1.6,
    glow: 1.2,
    bounce: 0.1,
    arms: 0.45,
  },
  thinking: {
    ...base,
    lidUpper: 0.3,
    pupil: 0.95,
    browY: 0.01,
    browTilt: -0.12,
    browAsym: 0.06,
    smile: 0.1,
    mouthWidth: 0.6,
    headTilt: -0.14,
    gazeX: 0.55,
    gazeY: 0.6,
    antenna: 0.3,
    glow: 1.4,
    bounce: 0.12,
  },
  excited: {
    ...base,
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
  },
};

export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS) as ExpressionName[];
