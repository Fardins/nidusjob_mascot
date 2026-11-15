"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, ContactShadows, Environment, Lightformer, PerformanceMonitor, Sparkles } from "@react-three/drei";
import { useInView, useReducedMotion } from "framer-motion";
import * as THREE from "three";
import { Mascot } from "./Mascot";
import type { ClickReaction } from "./reactions";
import { HoloPlatform, OrbitingOrbs, ResponsiveCamera } from "./Effects";
import { ExportBridge } from "./ExportBridge";
import { PlushCharacter } from "./plush/PlushCharacter";
import { PlushErrorBoundary, PlushLighting } from "./plush/PlushScene";
import { usePlushAvailable, useQualityTier } from "./plush/quality";
import { prefetchWithProgress } from "./plush/progress";
import { PLUSH_MODEL_URL } from "./plush/rigConfig";

export interface MascotCanvasProps {
  className?: string;
  /** Show glowing platform, orbs and particles. */
  effects?: boolean;
  clickReactions?: ClickReaction[];
  onReady?: () => void;
}

/** Fires once the Suspense boundary it lives in has resolved and painted. */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    const id = requestAnimationFrame(() => onReady?.());
    return () => cancelAnimationFrame(id);
  }, [onReady]);
  return null;
}

/** Original lighting for the procedural mascot (unchanged look). */
function ProceduralLighting() {
  return (
    <>
      <hemisphereLight args={["#f4fff0", "#1d3b4a", 0.55]} />
      <directionalLight
        position={[2.5, 4, 3.5]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={6}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
      />
      <directionalLight position={[-3, 1.5, -2.5]} intensity={2.4} color="#7ff7e1" />
      <pointLight position={[-2, -0.5, 2.5]} intensity={6} distance={8} color="#ffd9a8" />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 3]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={2} position={[-4, 1, 2]} scale={[2, 4, 1]} color="#bff7ff" />
        <Lightformer form="rect" intensity={1.6} position={[4, 0.5, 1]} scale={[2, 4, 1]} color="#fff1d6" />
        <Lightformer form="ring" intensity={2.5} position={[0, 1, 4]} scale={1.5} />
        <Lightformer form="rect" intensity={1} position={[0, -3, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} color="#2dd4bf" />
      </Environment>
      <ContactShadows position={[0, -1.04, 0]} opacity={0.38} scale={4} blur={2.6} far={1.6} resolution={512} color="#0b3b2e" frames={Infinity} />
    </>
  );
}

/**
 * Self-contained, transparent R3F canvas. Uses the rigged plush character
 * when public/models/plush.glb exists, otherwise the procedural mascot.
 * Pauses rendering off-screen, adapts pixel ratio and quality tier to the
 * device, and honours prefers-reduced-motion.
 */
export default function MascotCanvas({ className, effects = true, clickReactions, onReady }: MascotCanvasProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, { margin: "100px" });
  const reducedMotion = useReducedMotion() ?? false;
  const [dpr, setDpr] = useState(1.75);
  const plush = usePlushAvailable();
  const { quality, decline, fallback } = useQualityTier();
  const maxDpr = quality === "mobile" || quality === "low" ? Math.min(dpr, 1.5) : dpr;
  const [fetched, setFetched] = useState(false);

  // Download the GLB with byte progress (shown by MascotStage's placeholder) before parsing it.
  useEffect(() => {
    if (plush !== "yes") return;
    let alive = true;
    void prefetchWithProgress(PLUSH_MODEL_URL).then(() => alive && setFetched(true));
    return () => {
      alive = false;
    };
  }, [plush]);

  const procedural = (
    <Suspense fallback={null}>
      <Mascot reducedMotion={reducedMotion} clickReactions={clickReactions} scale={1.12} />
      <ReadySignal onReady={onReady} />
    </Suspense>
  );

  return (
    <div ref={wrap} className={className} style={{ touchAction: "pan-y" }}>
      {plush !== "checking" && (
        <Canvas
          frameloop={inView ? "always" : "never"}
          dpr={[1, maxDpr]}
          shadows
          camera={{ position: [0, 0.2, 6.2], fov: 30, near: 0.1, far: 50 }}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
          }}
          aria-label="Interactive 3D mascot. Click or tap to interact, drag to spin."
        >
          <PerformanceMonitor
            onDecline={() => {
              setDpr(1);
              decline();
            }}
            onIncline={() => setDpr(1.75)}
            onFallback={fallback}
            flipflops={3}
          />
          <AdaptiveDpr pixelated={false} />
          <ResponsiveCamera />

          {plush === "yes" ? (
            <>
              <PlushLighting />
              <PlushErrorBoundary fallback={procedural}>
                <Suspense fallback={null}>
                  {fetched && <PlushCharacter quality={quality} reducedMotion={reducedMotion} clickReactions={clickReactions} onLoaded={onReady} />}
                </Suspense>
              </PlushErrorBoundary>
            </>
          ) : (
            <>
              <ExportBridge />
              <ProceduralLighting />
              {procedural}
            </>
          )}

          {effects && (
            <>
              <HoloPlatform y={-1.05} />
              <OrbitingOrbs count={3} />
              <Sparkles count={reducedMotion ? 20 : 48} scale={[3.6, 3, 2.4]} position={[0, 0.2, 0]} size={2.2} speed={reducedMotion ? 0.1 : 0.35} opacity={0.75} color="#9ffbe8" noise={0.6} />
            </>
          )}
        </Canvas>
      )}
    </div>
  );
}
