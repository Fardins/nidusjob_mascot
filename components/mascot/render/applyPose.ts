import * as THREE from "three";
import type { Pose, ArmPose } from "../animation/pose";
import type { Rig } from "../rig";

const { clamp, lerp } = THREE.MathUtils;

function applyArm(arm: { shoulder?: THREE.Group; elbow?: THREE.Group }, a: ArmPose, side: 1 | -1, shoulders: number) {
  if (arm.shoulder) {
    arm.shoulder.rotation.set(-a.forward, a.twist * side, a.raise * side);
    arm.shoulder.position.y = 0.06 + shoulders * 0.25;
  }
  if (arm.elbow) arm.elbow.rotation.x = -a.elbow;
}

/** Converts a lid closure value (−0.3 wide … 1 closed) to the upper-lid angle. */
export const upperLidAngle = (v: number) => (v < 0 ? -1.22 + v * 0.95 : lerp(-1.22, 1.58, Math.min(1, v)));
export const lowerLidAngle = (v: number) => Math.PI + clamp(1.5 - clamp(v, 0, 1) * 2.6, 0.15, 1.5);

/** Push the pose onto the procedural scene graph. */
export function applyPose(rig: Rig, p: Pose) {
  if (rig.root) {
    rig.root.position.set(p.rootX, p.rootY, p.rootZ);
    rig.root.rotation.set(p.rootPitch, p.rootYaw, p.rootRoll);
    const sq = p.squash;
    rig.root.scale.set(1 + sq * 0.06, 1 - sq * 0.09, 1 + sq * 0.06);
  }

  if (rig.body) {
    const b = p.chest;
    rig.body.scale.set(1 + b * 0.01, 1 + b * 0.02, 1 + b * 0.014);
    rig.body.rotation.set(p.bodyPitch, p.bodyYaw, p.bodyRoll);
  }

  if (rig.head) rig.head.rotation.set(-p.headPitch, p.headYaw, p.headRoll);

  /* eyes */
  const eyes = [
    { e: rig.eyeL, up: p.lidUpperL, lo: p.lidLowerL, conv: p.converge },
    { e: rig.eyeR, up: p.lidUpperR, lo: p.lidLowerR, conv: -p.converge },
  ];
  for (const { e, up, lo, conv } of eyes) {
    e.ball?.rotation.set(-p.eyePitch, p.eyeYaw + conv, 0);
    if (e.pupil) {
      const ps = p.pupil;
      e.pupil.scale.set(ps, 1 + Math.max(0, 1 - ps) * 0.08, ps);
    }
    if (e.lidUpper) e.lidUpper.rotation.x = upperLidAngle(up);
    if (e.lidLower) e.lidLower.rotation.x = lowerLidAngle(lo);
    if (e.spiral) {
      e.spiral.visible = p.dizzy > 0.02;
      e.spiral.rotation.z -= 0.18 * p.dizzy;
      e.spiral.scale.setScalar(0.6 + 0.4 * p.dizzy);
    }
  }

  /* brows (3 control points each) */
  rig.browL.geo?.update(p.browL.inner, p.browL.mid, p.browL.outer);
  rig.browR.geo?.update(p.browR.inner, p.browR.mid, p.browR.outer);

  /* mouth: expression + speech channels */
  const speechOpen = p.jaw * 0.95 * (1 - p.lipClosed);
  const open = clamp(Math.max(p.mouthOpen, speechOpen) * (1 - p.lipClosed * 0.9), 0, 1);
  const round = clamp(p.pucker + p.lipRound, 0, 1);
  const width = p.mouthWidth * (1 + p.lipWide * 0.22 - round * 0.38);
  if (rig.mouth) {
    rig.mouth.rotation.z = p.mouthSkew * 0.2;
    rig.mouth.position.x = p.mouthSkew * 0.03;
  }
  if (rig.smile) {
    const fade = Math.max(0.001, 1 - open * (1 - Math.max(0, p.smile)) - round * 0.5);
    const flat = 1 - p.teethLip * 0.4 - p.lipClosed * 0.3;
    // nearly flat at 0 so the smile → frown flip is invisible
    const curve = 0.06 + 0.94 * Math.pow(Math.abs(p.smile), 0.8);
    const sy = curve * fade * flat;
    rig.smile.scale.set(width * fade, sy, 1);
    const frown = p.smile < 0;
    rig.smile.rotation.z = frown ? Math.PI / 2 - (Math.PI * 0.78) / 2 : -Math.PI / 2 - (Math.PI * 0.78) / 2;
    rig.smile.position.y = frown ? 0.06 - 0.095 * sy * 0.6 : 0.06;
  }
  if (rig.mouthOpen) {
    rig.mouthOpen.visible = open > 0.02;
    rig.mouthOpen.scale.set((0.55 + 0.45 * width * (1 - p.mouthOpen * 0.35)) * (1 - round * 0.3), open * 1.05 + round * 0.12 * open, 1);
  }
  if (rig.tongue) {
    rig.tongue.position.y = -0.05 + p.tongue * 0.045;
    rig.tongue.position.z = 0.012 + p.tongue * 0.02;
  }
  if (rig.teeth) rig.teeth.visible = p.teethLip > 0.2 || (open > 0.25 && p.smile > 0.5);

  /* cheeks */
  const puff = 1 + p.cheekPuff * 0.35;
  rig.cheekL?.scale.set(1.35 * puff, 0.8 * puff, 1);
  rig.cheekR?.scale.set(1.35 * puff, 0.8 * puff, 1);

  /* arms */
  applyArm(rig.armL, p.armL, -1, p.shoulders);
  applyArm(rig.armR, p.armR, 1, p.shoulders);

  /* accessories */
  if (rig.glasses) {
    rig.glasses.position.y = 0.06 - p.glassesDrop * 0.035;
    rig.glasses.position.z = 0.675 + p.glassesDrop * 0.012;
  }
  if (rig.cap) rig.cap.rotation.z = p.capTilt;
}
