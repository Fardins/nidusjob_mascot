"use client";

import { useFrame, useThree } from "@react-three/fiber";

/** Live renderer stats for the dev debug panel. */
export const debugStats = { fps: 0, calls: 0, triangles: 0 };

export function DebugStats() {
  const gl = useThree((s) => s.gl);
  let acc = 0;
  let frames = 0;
  useFrame((_, dt) => {
    acc += dt;
    frames++;
    if (acc > 0.5) {
      debugStats.fps = Math.round(frames / acc);
      acc = 0;
      frames = 0;
    }
    debugStats.calls = gl.info.render.calls;
    debugStats.triangles = gl.info.render.triangles;
  });
  return null;
}
