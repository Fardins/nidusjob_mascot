import * as THREE from "three";
import type { BoneMap } from "../rigUtils";
import { CritSpring } from "./springs";

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _at = new THREE.Vector3();
const _ba = new THREE.Vector3();
const _bc = new THREE.Vector3();
const _axis0 = new THREE.Vector3();
const _axis1 = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _inv = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const clampUnit = (x: number) => Math.min(1, Math.max(-1, x));

interface Leg {
  upper: THREE.Bone;
  lower: THREE.Bone;
  foot: THREE.Bone;
  target: THREE.Vector3;
  footWorldQ: THREE.Quaternion;
}

/**
 * Analytic two-bone IK: rotates `upper` and `lower` so `foot` reaches `t`.
 * (Same formulation as Daniel Holden's "simple two joint IK".)
 */
function solveTwoBone(leg: Leg, t: THREE.Vector3) {
  const { upper, lower, foot } = leg;
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  foot.getWorldPosition(_c);

  const lab = _b.distanceTo(_a);
  const lcb = _c.distanceTo(_b);
  if (lab < 1e-6 || lcb < 1e-6) return;
  const lat = THREE.MathUtils.clamp(t.distanceTo(_a), 1e-4, lab + lcb - 1e-4);

  _ab.subVectors(_b, _a).normalize();
  _ac.subVectors(_c, _a).normalize();
  _at.subVectors(t, _a).normalize();
  _ba.subVectors(_a, _b).normalize();
  _bc.subVectors(_c, _b).normalize();

  const acab0 = Math.acos(clampUnit(_ac.dot(_ab)));
  const babc0 = Math.acos(clampUnit(_ba.dot(_bc)));
  const acat0 = Math.acos(clampUnit(_ac.dot(_at)));
  const acab1 = Math.acos(clampUnit((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat)));
  const babc1 = Math.acos(clampUnit((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb)));

  _axis0.crossVectors(_ac, _ab);
  if (_axis0.lengthSq() < 1e-10) {
    // straight leg: bend around the hip's local X axis
    _axis0.set(1, 0, 0).applyQuaternion(upper.getWorldQuaternion(_q));
  }
  _axis0.normalize();
  _axis1.crossVectors(_ac, _at);
  const hasAxis1 = _axis1.lengthSq() > 1e-10;
  if (hasAxis1) _axis1.normalize();

  upper.getWorldQuaternion(_qa);
  lower.getWorldQuaternion(_qb);

  _inv.copy(_qa).invert();
  upper.quaternion.multiply(_q.setFromAxisAngle(_tmp.copy(_axis0).applyQuaternion(_inv), acab1 - acab0));
  if (hasAxis1) upper.quaternion.multiply(_q.setFromAxisAngle(_tmp.copy(_axis1).applyQuaternion(_inv), acat0));
  _inv.copy(_qb).invert();
  lower.quaternion.multiply(_q.setFromAxisAngle(_tmp.copy(_axis0).applyQuaternion(_inv), babc1 - babc0));
  upper.updateMatrixWorld(true);
}

/**
 * Weight shift: the hips counter-rotate and slide opposite to where the head
 * turns, while foot IK keeps the feet planted where the animation put them.
 */
export class Balance {
  private legs: Leg[] = [];
  private yaw = new CritSpring(4);
  private sway = new CritSpring(3.5);
  private hipsRestScale = 1;
  readonly enabled: boolean;

  constructor(private bones: BoneMap) {
    const mk = (upper?: THREE.Bone, lower?: THREE.Bone, foot?: THREE.Bone) =>
      upper && lower && foot ? { upper, lower, foot, target: new THREE.Vector3(), footWorldQ: new THREE.Quaternion() } : null;
    const l = mk(bones.upLegL, bones.legL, bones.footL);
    const r = mk(bones.upLegR, bones.legR, bones.footR);
    if (l) this.legs.push(l);
    if (r) this.legs.push(r);
    this.enabled = !!bones.hips;
    if (bones.upLegL && bones.footL) {
      // leg length in hips-local units → scale of the hip slide
      this.hipsRestScale = bones.upLegL.getWorldPosition(_a).distanceTo(bones.footL.getWorldPosition(_b)) || 1;
    }
  }

  /** Record where the animation placed the feet. Call after the mixer, before procedural layers. */
  capture() {
    for (const leg of this.legs) {
      leg.foot.updateWorldMatrix(true, false);
      leg.foot.getWorldPosition(leg.target);
      leg.foot.getWorldQuaternion(leg.footWorldQ);
    }
  }

  /** `headYaw` in radians (+ = turned to character's left). */
  apply(headYaw: number, dt: number, motionScale: number) {
    const hips = this.bones.hips;
    if (!hips) return;
    const yaw = this.yaw.step(-headYaw * 0.16 * motionScale, dt);
    const slide = this.sway.step(-headYaw * 0.035 * motionScale, dt);

    hips.quaternion.multiply(_q.setFromAxisAngle(_tmp.set(0, 1, 0), yaw));
    // Slide in world X (scaled to leg length), converted into the hips' parent space.
    hips.updateWorldMatrix(true, false);
    hips.getWorldPosition(_a);
    _a.x += slide * this.hipsRestScale * 0.25;
    if (hips.parent) hips.parent.worldToLocal(_a);
    hips.position.copy(_a);
    hips.updateMatrixWorld(true);

    for (const leg of this.legs) {
      solveTwoBone(leg, leg.target);
      // restore the animated foot orientation so the sole stays flat
      if (leg.foot.parent) {
        leg.foot.parent.getWorldQuaternion(_parentQ);
        leg.foot.quaternion.copy(_parentQ.invert().multiply(leg.footWorldQ));
      }
      leg.foot.updateMatrixWorld(true);
    }
  }
}
