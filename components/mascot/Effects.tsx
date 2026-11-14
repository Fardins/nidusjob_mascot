"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* ------------------------------------------------------------------ Holo platform */

/** Concentric glowing rings under the character (echoes the reference artwork). */
export function HoloPlatform({ y = -1.05 }: { y?: number }) {
  const g = useRef<THREE.Group>(null);
  const dash = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);

  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#7ff0d6",
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const dashTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 8;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = "white";
      ctx.fillRect(i * (512 / 24), 0, 512 / 48, 8);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }, []);

  const discTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const grd = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(160,255,225,0.55)");
    grd.addColorStop(0.45, "rgba(110,240,210,0.22)");
    grd.addColorStop(1, "rgba(110,240,210,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (dash.current) dash.current.rotation.z = t * 0.25;
    if (g.current) g.current.children.forEach((c, i) => i > 1 && (c.scale.setScalar(1 + Math.sin(t * 1.2 + i) * 0.015)));
    if (glow.current) glow.current.opacity = 0.75 + Math.sin(t * 1.15 + Math.PI) * 0.2;
  });

  return (
    <group ref={g} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <circleGeometry args={[1.5, 64]} />
        <meshBasicMaterial ref={glow} map={discTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={dash}>
        <ringGeometry args={[1.18, 1.2, 128, 1]} />
        <meshBasicMaterial
          map={dashTex}
          color="#a5fff0"
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {[0.7, 0.95, 1.42].map((r, i) => (
        <mesh key={r} material={ringMat}>
          <ringGeometry args={[r, r + (i === 1 ? 0.018 : 0.008), 128]} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ Orbiting orbs */

export function OrbitingOrbs({ count = 3 }: { count?: number }) {
  const refs = useRef<THREE.Mesh[]>([]);
  const cfg = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        r: 1.25 + i * 0.22,
        speed: 0.35 + i * 0.12,
        phase: (i / count) * Math.PI * 2,
        tilt: 0.25 + i * 0.15,
        y: -0.2 + i * 0.35,
      })),
    [count],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    cfg.forEach((c, i) => {
      const o = refs.current[i];
      if (!o) return;
      const a = t * c.speed + c.phase;
      o.position.set(Math.cos(a) * c.r, c.y + Math.sin(a) * c.tilt, Math.sin(a) * c.r * 0.6);
      o.scale.setScalar(0.8 + 0.2 * Math.sin(t * 3 + i));
    });
  });
  return (
    <>
      {cfg.map((_, i) => (
        <mesh key={i} ref={(o) => void (o && (refs.current[i] = o))}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshBasicMaterial color="#7ff7ff" toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ Responsive camera */

/** Pulls the camera back on tall/narrow viewports so the full character always fits. */
export function ResponsiveCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const aspect = useThree((s) => s.viewport.aspect);
  useFrame((_, dt) => {
    const targetZ = aspect < 0.75 ? 7.6 : aspect < 1 ? 6.8 : 6.2;
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZ, 4, dt);
    camera.lookAt(0, 0.05, 0);
  });
  return null;
}
