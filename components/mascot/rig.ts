import type * as THREE from "three";

/** Mutable bag of scene-graph handles the animation "brain" drives every frame. */
export interface EyeRig {
  ball?: THREE.Group; // rotates for gaze
  pupil?: THREE.Group; // scales for pupil dilation
  lidUpper?: THREE.Mesh;
  lidLower?: THREE.Mesh;
}

export interface BrowRig {
  lift?: THREE.Group; // vertical offset
  tilt?: THREE.Group; // roll
}

export interface Rig {
  root?: THREE.Group; // float / jump / spin / squash
  body?: THREE.Group; // breathing, lean
  head?: THREE.Group; // look-at
  eyeL: EyeRig;
  eyeR: EyeRig;
  browL: BrowRig;
  browR: BrowRig;
  smile?: THREE.Mesh;
  mouthOpen?: THREE.Group;
  antennaL?: THREE.Group;
  antennaR?: THREE.Group;
  tassel?: THREE.Group;
  armL?: THREE.Group;
  armR?: THREE.Group;
}

export const createRig = (): Rig => ({ eyeL: {}, eyeR: {}, browL: {}, browR: {} });

/** Helper: `ref={assign(v => rig.head = v)}` that ignores null on unmount. */
export const assign =
  <T,>(fn: (v: T) => void) =>
  (v: T | null) => {
    if (v) fn(v);
  };
