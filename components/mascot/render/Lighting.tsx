"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { mascotStore } from "../store";
import { sceneSignals } from "../animation/pose";
import type { AssistantState } from "../brain/types";

interface Mood {
  key: string;
  keyI: number;
  fill: string;
  fillI: number;
  rim: string;
  rimI: number;
  bounce: string;
  bounceI: number;
}

const MOODS: Record<"default" | "happy" | "sleep" | "warning" | "thinking", Mood> = {
  default: { key: "#fff4e6", keyI: 2.2, fill: "#bfe9ff", fillI: 0.9, rim: "#7ff7e1", rimI: 2.4, bounce: "#ffd9a8", bounceI: 6 },
  happy: { key: "#ffeccc", keyI: 2.35, fill: "#ffe4c4", fillI: 0.9, rim: "#9ffbe0", rimI: 2.6, bounce: "#ffcf8f", bounceI: 7 },
  thinking: { key: "#f2f6ff", keyI: 2.1, fill: "#a8d8ff", fillI: 1.1, rim: "#86d6ff", rimI: 2.6, bounce: "#cfe6ff", bounceI: 5 },
  sleep: { key: "#c9d6ff", keyI: 1.2, fill: "#7f9cff", fillI: 0.6, rim: "#6f8cff", rimI: 1.4, bounce: "#8fa2d6", bounceI: 3 },
  warning: { key: "#ffe1b8", keyI: 2.1, fill: "#ffcf9a", fillI: 0.9, rim: "#ffb020", rimI: 2.4, bounce: "#ffb27a", bounceI: 6 },
};

function moodFor(state: AssistantState, expression: string): Mood {
  if (state === "error") return MOODS.warning;
  if (state === "sleeping" || state === "drowsy") return MOODS.sleep;
  if (state === "thinking") return MOODS.thinking;
  if (state === "success" || expression === "happy" || expression === "excited" || expression === "celebrating") return MOODS.happy;
  return MOODS.default;
}

const _c = new THREE.Color();

/**
 * Cinematic three-point lighting (warm soft key, cool low fill, strong rim)
 * plus a warm ground bounce, a Lightformer studio environment (no HDR
 * download) and a contact shadow that reacts to the float height. The mood
 * eases with the assistant state: warmer when happy, cooler and dimmer when
 * sleeping, an amber tint on warnings.
 */
export function Lighting({ quality }: { quality: "low" | "mobile" | "medium" | "high" }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const bounce = useRef<THREE.PointLight>(null);
  const tip = useRef<THREE.PointLight>(null);
  const shadow = useRef<THREE.Group>(null);
  const shadowMat = useRef<THREE.Material | null>(null);
  const rich = quality === "medium" || quality === "high";

  useFrame((_, dt) => {
    const s = mascotStore.get();
    const mood = moodFor(s.assistantState, s.expression);
    const k = 1 - Math.exp(-2.5 * dt);
    const ease = (l: THREE.Light | null, color: string, intensity: number) => {
      if (!l) return;
      l.color.lerp(_c.set(color), k);
      l.intensity += (intensity - l.intensity) * k;
    };
    ease(key.current, mood.key, mood.keyI);
    ease(fill.current, mood.fill, mood.fillI);
    ease(rim.current, mood.rim, mood.rimI);
    ease(bounce.current, mood.bounce, mood.bounceI);
    if (tip.current) tip.current.intensity = Math.min(2.5, sceneSignals.glow * 0.9);

    // contact shadow shrinks and fades as the character floats up
    const h = sceneSignals.floatHeight;
    if (shadow.current) {
      const sc = THREE.MathUtils.clamp(1 - h * 1.6, 0.6, 1.15);
      shadow.current.scale.set(sc, 1, sc);
      if (!shadowMat.current) shadow.current.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && !shadowMat.current) shadowMat.current = mesh.material as THREE.Material;
      });
      if (shadowMat.current) shadowMat.current.opacity = THREE.MathUtils.clamp(0.42 - h * 1.4, 0.15, 0.5);
    }
  });

  return (
    <>
      <hemisphereLight args={["#f4fff0", "#1d3b4a", 0.5]} />
      {/* key: warm, soft */}
      <directionalLight
        ref={key}
        position={[2.5, 4, 3.5]}
        intensity={2.2}
        castShadow
        shadow-mapSize={quality === "high" ? [2048, 2048] : [1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={6}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
      />
      {/* fill: cool, low */}
      <directionalLight ref={fill} position={[-3, 1.2, 2.5]} intensity={0.9} color="#bfe9ff" />
      {/* rim/back: strong, for silhouette separation */}
      <directionalLight ref={rim} position={[-3, 1.5, -2.5]} intensity={2.4} color="#7ff7e1" />
      <directionalLight position={[2.8, 1.2, -2.6]} intensity={1.2} color="#e8fff7" />
      {/* warm bounce from the ground */}
      <pointLight ref={bounce} position={[0, -1.4, 1.8]} intensity={6} distance={6} color="#ffd9a8" />
      {/* the antenna glow faintly lights the face */}
      {rich && <pointLight ref={tip} position={[0, 1.25, 0.4]} intensity={0.6} distance={1.8} decay={2} color="#d9ff5a" />}

      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 3]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={2} position={[-4, 1, 2]} scale={[2, 4, 1]} color="#bff7ff" />
        <Lightformer form="rect" intensity={1.6} position={[4, 0.5, 1]} scale={[2, 4, 1]} color="#fff1d6" />
        <Lightformer form="ring" intensity={2.5} position={[0, 1, 4]} scale={1.5} />
        <Lightformer form="circle" intensity={8} position={[1.4, 2.2, 4]} scale={0.5} />
        <Lightformer form="rect" intensity={1} position={[0, -3, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} color="#2dd4bf" />
      </Environment>

      <group ref={shadow}>
        <ContactShadows
          position={[0, -1.04, 0]}
          opacity={0.38}
          scale={4}
          blur={2.6}
          far={1.6}
          resolution={rich ? 512 : 256}
          color="#0b3b2e"
          frames={Infinity}
        />
      </group>
    </>
  );
}
