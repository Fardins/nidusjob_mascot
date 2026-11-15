"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor, Sparkles } from "@react-three/drei";
import { useInView, useReducedMotion } from "framer-motion";
import * as THREE from "three";
import { Mascot } from "./Mascot";
import type { ClickReaction } from "./reactions";
import { HoloPlatform, OrbitingOrbs } from "./Effects";
import { ExportBridge } from "./ExportBridge";
import { PlushCharacter } from "./plush/PlushCharacter";
import { PlushErrorBoundary, PlushLighting } from "./plush/PlushScene";
import { usePlushAvailable, useQualityTier } from "./plush/quality";
import { prefetchWithProgress } from "./plush/progress";
import { PLUSH_MODEL_URL } from "./plush/rigConfig";
import { Lighting } from "./render/Lighting";
import { CameraRig } from "./render/CameraRig";
import { Holograms, Particles } from "./render/Fx";
import { PostFX } from "./render/PostFX";
import { DebugStats } from "./render/DebugStats";
import { urlFlags } from "./brain/rng";
import { mascotStore, useMascot } from "./store";
import { track } from "./brain/telemetry";
import type { Framing } from "./brain/types";

export interface MascotCanvasProps {
  className?: string;
  /** Show glowing platform, orbs and particles. */
  effects?: boolean;
  clickReactions?: ClickReaction[];
  onReady?: () => void;
  /** Camera framing preset. */
  framing?: Framing;
  /** Post-processing stack (bloom, vignette, grain, AgX, DOF). Off by default on the transparent canvas. */
  post?: boolean;
  /** CSS background behind the scene; makes the canvas opaque and enables screen-space AO. */
  background?: string;
}

/** Fires once the Suspense boundary it lives in has resolved and painted. */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    const id = requestAnimationFrame(() => onReady?.());
    return () => cancelAnimationFrame(id);
  }, [onReady]);
  return null;
}

const t0 = typeof performance !== "undefined" ? performance.now() : 0;

/**
 * Self-contained, transparent R3F canvas. Uses the rigged plush character
 * when public/models/plush.glb exists, otherwise the procedural mascot.
 * Pauses rendering off-screen and in hidden tabs, adapts pixel ratio and
 * quality tier to the device, recovers from WebGL context loss, and honours
 * prefers-reduced-motion.
 */
export default function MascotCanvas({ className, effects = true, clickReactions, onReady, framing = "hero", post = false, background }: MascotCanvasProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, { margin: "100px" });
  const reducedMotion = useReducedMotion() ?? false;
  const [dpr, setDpr] = useState(1.75);
  const [visible, setVisible] = useState(true);
  const [contextKey, setContextKey] = useState(0);
  const plush = usePlushAvailable();
  const tier = useQualityTier();
  const override = useMascot((s) => s.qualityOverride);
  const quality = override ?? tier.quality;
  const maxDpr = quality === "mobile" || quality === "low" ? Math.min(dpr, 1.5) : dpr;
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    track({ name: "quality_tier", tier: quality });
  }, [quality]);

  // Download the GLB with byte progress (shown by MascotStage's placeholder) before parsing it.
  useEffect(() => {
    if (plush !== "yes") return;
    let alive = true;
    void prefetchWithProgress(PLUSH_MODEL_URL).then(() => alive && setFetched(true));
    return () => {
      alive = false;
    };
  }, [plush]);

  const ready = () => {
    track({ name: "load_time", ms: Math.round(performance.now() - t0) });
    onReady?.();
  };

  const procedural = (
    <Suspense fallback={null}>
      <Mascot reducedMotion={reducedMotion} clickReactions={clickReactions} scale={1.12} lashes={quality !== "low"} />
      <ReadySignal onReady={ready} />
    </Suspense>
  );

  const rich = quality === "medium" || quality === "high";

  return (
    <div ref={wrap} className={className} style={{ touchAction: "pan-y" }} aria-hidden="true">
      {plush !== "checking" && (
        <Canvas
          key={contextKey}
          frameloop={inView && visible ? "always" : "never"}
          dpr={[1, maxDpr]}
          shadows
          camera={{ position: [0, 0.2, 6.2], fov: 30, near: 0.1, far: 50 }}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false }}
          onCreated={({ gl }) => {
            if (background) gl.setClearColor(background, 1);
            else gl.setClearColor(0x000000, 0);
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            const el = gl.domElement;
            el.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              track({ name: "webgl_failure", reason: "context_lost" });
              mascotStore.set({ webglFailed: true });
            });
            el.addEventListener("webglcontextrestored", () => {
              mascotStore.set({ webglFailed: false });
              setContextKey((k) => k + 1);
            });
          }}
        >
          <PerformanceMonitor
            onDecline={() => {
              setDpr(1);
              tier.decline();
            }}
            onIncline={() => setDpr(1.75)}
            onFallback={tier.fallback}
            flipflops={3}
          />
          <AdaptiveDpr pixelated={false} />
          <CameraRig framing={framing} reducedMotion={reducedMotion} />

          {plush === "yes" ? (
            <>
              <PlushLighting />
              <PlushErrorBoundary fallback={procedural}>
                <Suspense fallback={null}>
                  {fetched && <PlushCharacter quality={quality} reducedMotion={reducedMotion} clickReactions={clickReactions} onLoaded={ready} />}
                </Suspense>
              </PlushErrorBoundary>
            </>
          ) : (
            <>
              <ExportBridge />
              <Lighting quality={quality} />
              {procedural}
            </>
          )}

          <Holograms />
          <Particles reducedMotion={reducedMotion} />

          {effects && (
            <>
              <HoloPlatform y={-1.05} />
              <OrbitingOrbs count={3} />
              {quality !== "low" && (
                <Sparkles count={reducedMotion ? 20 : rich ? 48 : 24} scale={[3.6, 3, 2.4]} position={[0, 0.2, 0]} size={2.2} speed={reducedMotion ? 0.1 : 0.35} opacity={0.75} color="#9ffbe8" noise={0.6} />
              )}
            </>
          )}

          {post && <PostFX quality={quality} framing={framing} opaque={!!background} />}
          {urlFlags.debug && <DebugStats />}
        </Canvas>
      )}
    </div>
  );
}
