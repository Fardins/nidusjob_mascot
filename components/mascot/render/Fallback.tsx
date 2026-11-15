"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { useMascot } from "../store";
import { track } from "../brain/telemetry";

let webglCache: boolean | null = null;

/** True when a WebGL context can be created (checked once). */
export function hasWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  if (typeof document === "undefined") return true;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    webglCache = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglCache = false;
  }
  if (!webglCache) track({ name: "webgl_failure", reason: "unavailable" });
  return webglCache;
}

export function useWebGLSupport() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => setOk(hasWebGL()), []);
  return ok;
}

/**
 * Static stand-in for the 3D character (no WebGL, context lost, or a render
 * error). Uses the pre-rendered poster when it exists, otherwise a CSS face.
 * The expression is still reflected so the chat keeps feeling alive.
 */
export function MascotPoster({ className = "" }: { className?: string }) {
  const expression = useMascot((s) => s.expression);
  const state = useMascot((s) => s.assistantState);
  const [img, setImg] = useState(true);
  const bob = state === "sleeping" ? "" : "motion-safe:animate-[float_5s_ease-in-out_infinite]";
  return (
    <div className={`relative grid h-full w-full place-items-center ${className}`} aria-hidden="true">
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/mascot-poster.png" alt="" className={`h-full w-full object-contain ${bob}`} onError={() => setImg(false)} draggable={false} />
      ) : (
        <div className={`relative aspect-square w-3/5 rounded-full bg-gradient-to-br from-lime-300 to-green-500 shadow-xl ${bob}`}>
          <div className="absolute left-[24%] top-[38%] h-[22%] w-[18%] rounded-full bg-white">
            <div className={`absolute left-1/4 top-1/4 h-1/2 w-1/2 rounded-full bg-blue-600 ${state === "sleeping" ? "scale-y-0" : ""}`} />
          </div>
          <div className="absolute right-[24%] top-[38%] h-[22%] w-[18%] rounded-full bg-white">
            <div className={`absolute left-1/4 top-1/4 h-1/2 w-1/2 rounded-full bg-blue-600 ${state === "sleeping" ? "scale-y-0" : ""}`} />
          </div>
          <div
            className={`absolute left-1/2 top-[68%] h-[10%] w-[26%] -translate-x-1/2 rounded-b-full border-b-4 border-rose-900 ${
              expression === "sad" || expression === "error" ? "rotate-180" : ""
            }`}
          />
        </div>
      )}
    </div>
  );
}

/** Error boundary around the canvas: a 3D failure never breaks the page. */
export class CanvasErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[mascot] 3D failed, showing the static fallback:", err);
    track({ name: "webgl_failure", reason: "render_error" });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
