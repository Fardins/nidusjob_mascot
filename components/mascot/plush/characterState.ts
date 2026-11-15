import * as THREE from "three";

/**
 * Per-character scratch state shared by the behaviour modules. Mutated in
 * place every frame; never triggers React renders.
 */
export interface CharacterState {
  /** Latest pointer position in client px and when it moved (ms). */
  pointer: { x: number; y: number; t: number };
  /** Idle look target in normalised (-1…1) gaze space, set by the brain. Null = follow pointer/attention. */
  idleLook: { x: number; y: number } | null;
  /** Gaze bias from the current expression (e.g. thinking looks up-right). */
  gazeBias: { x: number; y: number };
  /** Hover lean toward the cursor, 0…1 (damped). */
  lean: number;
  /** Small saccadic eye offsets (radians), written by useFacial. */
  saccade: { x: number; y: number };

  /** Written by useLookAt (radians, character space). */
  headYaw: number;
  headPitch: number;
  /** Eye rotation relative to the head (radians). */
  eyeYaw: number;
  eyePitch: number;

  /** World-space velocity of the character root, for fur drag and jiggle. */
  velocity: THREE.Vector3;
  /** 1 normally, reduced when prefers-reduced-motion is on. */
  motionScale: number;
}

export function createCharacterState(reducedMotion: boolean): CharacterState {
  return {
    pointer: { x: 0, y: 0, t: -1e9 },
    idleLook: null,
    gazeBias: { x: 0, y: 0 },
    lean: 0,
    saccade: { x: 0, y: 0 },
    headYaw: 0,
    headPitch: 0,
    eyeYaw: 0,
    eyePitch: 0,
    velocity: new THREE.Vector3(),
    motionScale: reducedMotion ? 0.35 : 1,
  };
}
