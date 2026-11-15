"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mascotStore } from "../store";
import type { CharacterState } from "./characterState";
import { CritSpring2, DelayLine2 } from "./physics/springs";
import { EYE_LEAD, IDLE_ROUTINE_AFTER, LOOK_LIMITS, LOOK_WEIGHTS } from "./rigConfig";
import type { BoneMap } from "./rigUtils";

const _ndc = new THREE.Vector3();
const _headPos = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _rootQ = new THREE.Quaternion();
const _invRootQ = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _worldQ = new THREE.Quaternion();
const _delayed = { x: 0, y: 0 };
const { clamp } = THREE.MathUtils;

/** Rotate a bone by a world-space yaw (about `up`) and pitch (about `right`), on top of its current pose. */
function rotateBoneWorld(bone: THREE.Object3D, up: THREE.Vector3, right: THREE.Vector3, yaw: number, pitch: number) {
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_worldQ);
  _q.setFromAxisAngle(right, -pitch); // +X rotation tips a +Z-facing head down, so negate
  _worldQ.premultiply(_q);
  _q.setFromAxisAngle(up, yaw);
  _worldQ.premultiply(_q);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_parentQ);
    bone.quaternion.copy(_parentQ.invert().multiply(_worldQ));
  } else bone.quaternion.copy(_worldQ);
  bone.updateMatrixWorld(true);
}

export interface LookAt {
  update(t: number, dt: number): void;
}

/**
 * Procedural gaze layered over the animation. The eyes track the target with
 * a fast spring; the head chain follows the target as it was `EYE_LEAD`
 * seconds ago with a slower spring, split across spine/neck/head by weight.
 * The eyes then cover whatever angle the chain hasn't, so gaze is always on target.
 */
export function useLookAt(root: THREE.Object3D, bones: BoneMap, cs: CharacterState): LookAt {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  // Track the pointer anywhere on the page (mouse, pen or touch).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      cs.pointer.x = e.clientX;
      cs.pointer.y = e.clientY;
      cs.pointer.t = performance.now();
      mascotStore.touch();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, [cs]);

  return useMemo(() => {
    const eyes = new CritSpring2(28);
    const head = new CritSpring2(7.5);
    const history = new DelayLine2(0.6);
    const headBone = bones.head;

    /** Screen point → yaw/pitch from the head, in the character's own frame. */
    function screenToAngles(x: number, y: number, out: { x: number; y: number }) {
      const rect = gl.domElement.getBoundingClientRect();
      if (!rect.width || !headBone) return false;
      headBone.getWorldPosition(_headPos);
      _ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1, 0.5).unproject(camera);
      // Intersect the view ray with a plane in front of the character so
      // close-by cursors give natural, not extreme, angles.
      _dir.subVectors(_ndc, camera.position).normalize();
      const planeZ = _headPos.z + 1.6;
      const k = (planeZ - camera.position.z) / (_dir.z || -1e-4);
      _target.copy(camera.position).addScaledVector(_dir, Math.max(k, 0.5));
      _dir.subVectors(_target, _headPos);
      root.getWorldQuaternion(_rootQ);
      _dir.applyQuaternion(_invRootQ.copy(_rootQ).invert());
      out.x = Math.atan2(_dir.x, _dir.z);
      out.y = Math.atan2(_dir.y, Math.hypot(_dir.x, _dir.z));
      return true;
    }

    const goal = { x: 0, y: 0 };

    return {
      update(t: number, dt: number) {
        if (!headBone) return;
        const s = mascotStore.get();
        const idleFor = (performance.now() - Math.max(cs.pointer.t, s.lastInteraction)) / 1000;

        // 1. Pick what to look at: explicit attention > recent pointer > idle routine.
        let ok = false;
        if (s.attention) ok = screenToAngles(s.attention.x, s.attention.y, goal);
        else if (!cs.idleLook && idleFor < IDLE_ROUTINE_AFTER && cs.pointer.t > 0) ok = screenToAngles(cs.pointer.x, cs.pointer.y, goal);
        if (!ok) {
          const idle = cs.idleLook ?? { x: 0, y: 0.05 };
          goal.x = idle.x * 0.8;
          goal.y = idle.y * 0.4;
        }
        goal.x = clamp(goal.x + cs.gazeBias.x * 0.5, -LOOK_LIMITS.yaw, LOOK_LIMITS.yaw);
        goal.y = clamp(goal.y + cs.gazeBias.y * 0.35, -LOOK_LIMITS.pitch, LOOK_LIMITS.pitch);

        // 2. Eyes lead; the head chases where the eyes were EYE_LEAD seconds ago.
        history.push(t, goal.x, goal.y);
        history.sample(t - EYE_LEAD, _delayed);
        eyes.step(goal.x + cs.saccade.x, goal.y + cs.saccade.y, dt);
        const m = cs.motionScale < 1 ? 0.7 : 1;
        head.step(_delayed.x * m, _delayed.y * m, dt);

        // 3. Distribute across the chain, root-first so each bone builds on its parent.
        root.getWorldQuaternion(_rootQ);
        _up.set(0, 1, 0).applyQuaternion(_rootQ);
        _right.set(1, 0, 0).applyQuaternion(_rootQ);
        const hy = head.x;
        const hp = head.y;
        const chain: [THREE.Bone | undefined, number][] = [
          [bones.spine, LOOK_WEIGHTS.spine],
          [bones.neck, LOOK_WEIGHTS.neck],
          [headBone, LOOK_WEIGHTS.head],
        ];
        let applied = 0;
        for (const [bone, w] of chain) {
          if (!bone) continue;
          rotateBoneWorld(bone, _up, _right, hy * w, hp * w);
          applied += w;
        }
        cs.headYaw = hy * applied;
        cs.headPitch = hp * applied;

        // 4. Eyes: 100% of the target, minus what the chain already turned.
        cs.eyeYaw = clamp(eyes.x - cs.headYaw, -0.55, 0.55) * LOOK_WEIGHTS.eyes;
        cs.eyePitch = clamp(eyes.y - cs.headPitch, -0.4, 0.4) * LOOK_WEIGHTS.eyes;
        for (const eye of [bones.eyeL, bones.eyeR]) {
          if (eye) rotateBoneWorld(eye, _up, _right, cs.eyeYaw, cs.eyePitch);
        }
      },
    };
  }, [bones, camera, cs, gl, root]);
}
