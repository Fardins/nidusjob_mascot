"use client";

import { useSyncExternalStore } from "react";

/**
 * Byte-level download progress for plush.glb. Dependency-free on purpose:
 * MascotStage imports it, and it must not drag three.js into the main bundle.
 */
let progress = -1; // 0…1 while downloading, -1 when no model is being loaded
const listeners = new Set<() => void>();
let pending: Promise<void> | null = null;

function set(v: number) {
  progress = v;
  listeners.forEach((l) => l());
}

/** Streams the file into the HTTP cache so useGLTF's own request is instant. */
export function prefetchWithProgress(url: string): Promise<void> {
  if (pending) return pending;
  set(0);
  pending = (async () => {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      const total = Number(res.headers.get("content-length")) || 0;
      if (!res.body || !total) {
        await res.arrayBuffer();
      } else {
        const reader = res.body.getReader();
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          got += value.byteLength;
          set(Math.min(0.99, got / total));
        }
      }
    } catch {
      /* useGLTF will retry and surface the error to the error boundary */
    }
    set(1);
  })();
  return pending;
}

export function usePlushProgress() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => progress,
    () => -1,
  );
}
