"use client";

import { Component, type ReactNode } from "react";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { CATCH_LIGHT_POSITION } from "./CatchLights";
import { FUR_LIGHTS } from "./rigConfig";

/**
 * Soft studio lighting for the plush: key, warm fill, strong pink-white rim,
 * and a procedural Lightformer environment (no HDR download).
 */
export function PlushLighting() {
  return (
    <>
      <hemisphereLight args={["#fff6fb", "#3a2a3a", 0.35]} />
      {/* key */}
      <directionalLight
        position={FUR_LIGHTS.key.position}
        intensity={2.4}
        color="#fff8f2"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={8}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
      />
      {/* warm fill */}
      <pointLight position={[-2.6, 0.2, 2.8]} intensity={7} distance={9} decay={2} color="#ffd2a6" />
      {/* strong pink-white rim from behind */}
      <directionalLight position={FUR_LIGHTS.rim.position} intensity={4.2} color="#ffd9ea" />
      <directionalLight position={[2.8, 1.2, -2.6]} intensity={2.2} color="#fff0f6" />

      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.6} position={[0, 4, 3]} scale={[6, 2, 1]} color="#fffaf5" />
        <Lightformer form="rect" intensity={1.6} position={[-4, 1, 2]} scale={[2, 4, 1]} color="#ffe2cc" />
        <Lightformer form="rect" intensity={3} position={[0, 1.5, -4]} scale={[8, 3, 1]} color="#ffd6ea" />
        {/* small, bright softbox: reads as the catch-light in glossy eyes */}
        <Lightformer form="circle" intensity={9} position={CATCH_LIGHT_POSITION.toArray()} scale={0.6} />
        <Lightformer form="rect" intensity={0.6} position={[0, -3, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} color="#f2c6d8" />
      </Environment>

      <ContactShadows position={[0, -1.04, 0]} opacity={0.42} scale={4} blur={2.8} far={1.6} resolution={512} color="#4a2a3a" frames={Infinity} />
    </>
  );
}

/** If the GLB fails to parse/load, render `fallback` instead of crashing the page. */
export class PlushErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[plush] failed to load, using the procedural mascot instead:", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
