import type * as THREE from "three";
import type { BrowGeometry } from "./render/BrowGeometry";

/** Mutable bag of scene-graph handles the animation "brain" drives every frame. */
export interface EyeRig {
  ball?: THREE.Group; // rotates for gaze
  pupil?: THREE.Group; // scales for pupil dilation
  lidUpper?: THREE.Mesh;
  lidLower?: THREE.Mesh;
  spiral?: THREE.Group; // dizzy eyes
}

export interface BrowRig {
  geo?: BrowGeometry;
}

export interface ArmRig {
  shoulder?: THREE.Group;
  elbow?: THREE.Group;
}

export interface Rig {
  root?: THREE.Group; // float / jump / spin / squash
  body?: THREE.Group; // breathing, lean
  head?: THREE.Group; // look-at
  eyeL: EyeRig;
  eyeR: EyeRig;
  browL: BrowRig;
  browR: BrowRig;
  mouth?: THREE.Group; // skew
  smile?: THREE.Mesh;
  mouthOpen?: THREE.Group;
  tongue?: THREE.Mesh;
  teeth?: THREE.Mesh;
  cheekL?: THREE.Mesh;
  cheekR?: THREE.Mesh;
  antennaL?: THREE.Group;
  antennaR?: THREE.Group;
  glasses?: THREE.Group;
  cap?: THREE.Group;
  tasselPivot?: THREE.Group;
  tasselSegs: THREE.Group[];
  armL: ArmRig;
  armR: ArmRig;
  wrist?: THREE.Group;
}

export const createRig = (): Rig => ({ eyeL: {}, eyeR: {}, browL: {}, browR: {}, armL: {}, armR: {}, tasselSegs: [] });

/** Helper: `ref={assign(v => rig.head = v)}` that ignores null on unmount. */
export const assign =
  <T,>(fn: (v: T) => void) =>
  (v: T | null) => {
    if (v) fn(v);
  };
