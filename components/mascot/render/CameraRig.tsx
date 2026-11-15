"use client";

import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mascotStore } from "../store";
import { sceneSignals } from "../animation/pose";
import type { Framing } from "../brain/types";

/** Framing presets: camera distance and look-at height. */
const FRAMES: Record<Framing, { z: number; y: number; look: number }> = {
  hero: { z: 6.2, y: 0.2, look: 0.05 },
  chat: { z: 4.3, y: 0.45, look: 0.35 },
  widget: { z: 3.4, y: 0.6, look: 0.5 },
  face: { z: 2.4, y: 0.62, look: 0.62 },
};

const _look = new THREE.Vector3();

/**
 * Camera with framing presets (hero / chat bust / widget head-and-shoulders
 * / face bubble), a gentle push-in while speaking and pull-out while
 * celebrating, subtle "breathing" and mouse parallax. Tall/narrow viewports
 * pull back so the character always fits. Reduced motion: static framing.
 */
export function CameraRig({ framing = "hero", reducedMotion = false }: { framing?: Framing; reducedMotion?: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const aspect = useThree((s) => s.viewport.aspect);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const f = FRAMES[framing];
    const s = mascotStore.get();
    const fit = framing === "hero" ? (aspect < 0.75 ? 1.22 : aspect < 1 ? 1.1 : 1) : aspect < 0.8 ? 1.15 : 1;
    let z = f.z * fit;
    let x = 0;
    let y = f.y;
    if (!reducedMotion) {
      if (s.assistantState === "speaking") z -= 0.3 * (f.z / 6.2);
      if (s.assistantState === "success" || s.expression === "celebrating") z += 0.45 * (f.z / 6.2);
      const t = state.clock.elapsedTime;
      z += Math.sin(t * 0.35) * 0.04;
      y += Math.sin(t * 0.27 + 1) * 0.02;
      x += sceneSignals.pointerX * 0.12;
      y += sceneSignals.pointerY * 0.06;
    }
    const k = 1 - Math.exp(-3 * dt);
    camera.position.x += (x - camera.position.x) * k;
    camera.position.y += (y - camera.position.y) * k;
    camera.position.z += (z - camera.position.z) * k;
    camera.lookAt(_look.set(0, f.look, 0));
  });
  return null;
}
