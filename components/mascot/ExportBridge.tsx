"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

declare global {
  interface Window {
    __exportMascotGLB?: () => Promise<ArrayBuffer>;
  }
}

/**
 * Dev utility: open the page with `?export-glb` and run
 * `await window.__exportMascotGLB()` (or press Shift+E) to download the
 * character as a .glb for Blender / other engines.
 */
export function ExportBridge() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("export-glb")) return;
    const run = async () => {
      const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
      const target = scene.getObjectByName("NidusMascot");
      if (!target) throw new Error("Mascot not found");
      return (await new GLTFExporter().parseAsync(target, { binary: true })) as ArrayBuffer;
    };
    window.__exportMascotGLB = run;
    const onKey = async (e: KeyboardEvent) => {
      if (!(e.shiftKey && e.key === "E")) return;
      const buf = await run();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "model/gltf-binary" }));
      a.download = "nidus-mascot.glb";
      a.click();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      delete window.__exportMascotGLB;
    };
  }, [scene]);
  return null;
}
