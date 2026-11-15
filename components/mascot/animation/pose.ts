/**
 * The per-frame pose every animation layer writes into. Layers are additive:
 * the base layer sets it from the blended expression, then breathing, float,
 * head noise, look-at, reactions and gestures add on top. `applyPose` then
 * pushes it onto the scene graph. Created once, mutated in place.
 */

export interface ArmPose {
  /** Sideways raise (rad, + = away from the body). */
  raise: number;
  /** Forward swing (rad, + = forward). */
  forward: number;
  /** Twist around the arm (rad). */
  twist: number;
  /** Elbow flex (rad, + = bend forward). */
  elbow: number;
}

export interface BrowPose {
  inner: number;
  mid: number;
  outer: number;
}

export interface Pose {
  /* root (whole character) */
  rootX: number;
  rootY: number;
  rootZ: number;
  rootYaw: number;
  rootPitch: number;
  rootRoll: number;
  /** + = squash (wider/shorter), - = stretch. */
  squash: number;

  /* body / torso */
  chest: number; // breathing 0…1
  bodyYaw: number;
  bodyPitch: number;
  bodyRoll: number;
  shoulders: number; // lift (rad on arms)

  /* head */
  headPitch: number;
  headYaw: number;
  headRoll: number;

  /* eyes */
  eyeYaw: number;
  eyePitch: number;
  converge: number;
  pupil: number;
  lidUpperL: number;
  lidUpperR: number;
  lidLowerL: number;
  lidLowerR: number;
  dizzy: number;

  /* brows (3 control points each, head-local lift in mesh units) */
  browL: BrowPose;
  browR: BrowPose;

  /* mouth */
  smile: number;
  mouthOpen: number;
  mouthWidth: number;
  mouthSkew: number;
  pucker: number;
  /** Speech channels (visemes). */
  jaw: number;
  lipRound: number;
  lipWide: number;
  lipClosed: number;
  teethLip: number;
  tongue: number;

  /* cheeks */
  blush: number;
  cheekPuff: number;

  /* arms */
  armL: ArmPose;
  armR: ArmPose;

  /* accessories */
  antennaEnergy: number;
  droop: number;
  glow: number;
  glassesDrop: number;
  capTilt: number;
  /** Height of the float above rest (for the contact shadow). */
  floatHeight: number;
}

const arm = (): ArmPose => ({ raise: 0.32, forward: 0, twist: 0, elbow: 0.15 });

export function createPose(): Pose {
  return {
    rootX: 0,
    rootY: 0,
    rootZ: 0,
    rootYaw: 0,
    rootPitch: 0,
    rootRoll: 0,
    squash: 0,
    chest: 0,
    bodyYaw: 0,
    bodyPitch: 0,
    bodyRoll: 0,
    shoulders: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    eyeYaw: 0,
    eyePitch: 0,
    converge: 0,
    pupil: 1,
    lidUpperL: 0,
    lidUpperR: 0,
    lidLowerL: 0,
    lidLowerR: 0,
    dizzy: 0,
    browL: { inner: 0, mid: 0, outer: 0 },
    browR: { inner: 0, mid: 0, outer: 0 },
    smile: 0,
    mouthOpen: 0,
    mouthWidth: 1,
    mouthSkew: 0,
    pucker: 0,
    jaw: 0,
    lipRound: 0,
    lipWide: 0,
    lipClosed: 0,
    teethLip: 0,
    tongue: 0,
    blush: 0,
    cheekPuff: 0,
    armL: arm(),
    armR: arm(),
    antennaEnergy: 0.5,
    droop: 0,
    glow: 0.6,
    glassesDrop: 0,
    capTilt: 0,
    floatHeight: 0,
  };
}

export function setArm(a: ArmPose, raise: number, forward: number, twist: number, elbow: number) {
  a.raise = raise;
  a.forward = forward;
  a.twist = twist;
  a.elbow = elbow;
}

/** a += (b - a) * k for every arm channel. */
export function blendArm(a: ArmPose, b: ArmPose, k: number) {
  a.raise += (b.raise - a.raise) * k;
  a.forward += (b.forward - a.forward) * k;
  a.twist += (b.twist - a.twist) * k;
  a.elbow += (b.elbow - a.elbow) * k;
}

/**
 * Shared live signals other parts of the scene read (contact shadow,
 * camera, lights). Mutated by the brain every frame; never triggers renders.
 */
export const sceneSignals = {
  floatHeight: 0,
  /** Head world position, for hologram FX placement. */
  headY: 0.55,
  /** Current speech loudness 0…1. */
  amplitude: 0,
  /** Current antenna glow (for the fake tip light). */
  glow: 0.6,
  /** Pointer in normalised device space (-1…1), for camera parallax. */
  pointerX: 0,
  pointerY: 0,
  /** Damped scroll velocity (px/s). */
  scrollVel: 0,
};
