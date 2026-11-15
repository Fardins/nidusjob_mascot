import * as THREE from "three";
import { JIGGLE_GROUPS, type JiggleGroup } from "../rigConfig";
import { collectBones, norm } from "../rigUtils";

const _pos = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _restDir = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _worldQ = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const IDENTITY = new THREE.Quaternion();

/**
 * A spring-driven bone: its tail point is simulated in world space and the
 * bone is rotated to aim at it, on top of whatever the animation did.
 */
class JiggleBone {
  /** Tail in the bone's local space (direction × length). */
  private tail = new THREE.Vector3();
  private tip = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private fresh = true;

  constructor(
    readonly bone: THREE.Bone,
    private g: JiggleGroup,
  ) {
    const child = bone.children.find((c) => (c as THREE.Bone).isBone);
    if (child && child.position.lengthSq() > 1e-10) this.tail.copy(child.position);
    else this.tail.set(0, 0.1, 0); // leaf bone: assume a short tail along +Y (Blender convention)
  }

  update(dt: number, motionScale: number) {
    const b = this.bone;
    b.updateWorldMatrix(true, false);
    b.getWorldPosition(_pos);
    _rest.copy(this.tail).applyMatrix4(b.matrixWorld);
    const len = _rest.distanceTo(_pos);
    if (len < 1e-6) return;

    if (this.fresh || dt > 0.1) {
      this.tip.copy(_rest);
      this.vel.set(0, 0, 0);
      this.fresh = false;
      return;
    }

    const { stiffness, damping, gravity, inertia, limit } = this.g;
    // F = k·(rest − tip) − c·v + g   (gravity scaled to the bone's size)
    _acc.subVectors(_rest, this.tip).multiplyScalar(stiffness);
    _acc.addScaledVector(this.vel, -damping);
    _acc.y -= gravity * len;
    this.vel.addScaledVector(_acc, dt);
    this.tip.addScaledVector(this.vel, dt);

    // Inertia: how far the tip may lag behind its rest point.
    const k = Math.min(1, inertia * motionScale);
    this.tip.lerpVectors(_rest, this.tip, k);

    // Keep the bone length and clamp the swing.
    _restDir.subVectors(_rest, _pos).normalize();
    _dir.subVectors(this.tip, _pos).normalize();
    const angle = Math.acos(THREE.MathUtils.clamp(_restDir.dot(_dir), -1, 1));
    if (angle > limit) {
      _q.setFromUnitVectors(_restDir, _dir);
      _q.slerp(IDENTITY, 1 - limit / angle);
      _dir.copy(_restDir).applyQuaternion(_q);
    }
    this.tip.copy(_pos).addScaledVector(_dir, len);

    // Rotate the bone (in world space) from rest direction to simulated direction.
    _q.setFromUnitVectors(_restDir, _dir);
    b.matrixWorld.decompose(_pos, _worldQ, _scale);
    _worldQ.premultiply(_q);
    if (b.parent) {
      b.parent.getWorldQuaternion(_parentQ);
      b.quaternion.copy(_parentQ.invert().multiply(_worldQ));
    } else b.quaternion.copy(_worldQ);
    b.updateMatrixWorld(true);
  }

  reset() {
    this.fresh = true;
  }
}

/** All jiggle bones on a character, processed parent-first. */
export class JiggleSystem {
  readonly bones: JiggleBone[] = [];

  constructor(root: THREE.Object3D, groups: JiggleGroup[] = JIGGLE_GROUPS) {
    for (const bone of collectBones(root)) {
      const n = norm(bone.name);
      const g = groups.find((gr) => gr.match.some((m) => n.includes(m)));
      if (g) this.bones.push(new JiggleBone(bone, g));
    }
  }

  get size() {
    return this.bones.length;
  }

  /** Call after the animation pose and procedural layers are applied. */
  update(dt: number, motionScale = 1) {
    if (motionScale <= 0) return;
    for (const j of this.bones) j.update(dt, motionScale);
  }

  reset() {
    for (const j of this.bones) j.reset();
  }
}
