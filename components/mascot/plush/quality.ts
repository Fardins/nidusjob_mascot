"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlushQuality } from "./PlushCharacter";
import { PLUSH_MODEL_URL } from "./rigConfig";

const ORDER: PlushQuality[] = ["low", "mobile", "medium", "high"];

/** Initial tier from device hints; PerformanceMonitor then steps it down if frames drop. */
function initialQuality(): PlushQuality {
  if (typeof window === "undefined") return "medium";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = window.innerWidth < 768;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (memory <= 2 || cores <= 2) return "low";
  if (coarse || small) return "mobile";
  if (cores <= 4 || memory <= 4) return "medium";
  return "high";
}

export function useQualityTier() {
  const [quality, setQuality] = useState<PlushQuality>("medium");
  useEffect(() => setQuality(initialQuality()), []);
  const decline = useCallback(() => setQuality((q) => ORDER[Math.max(0, ORDER.indexOf(q) - 1)]), []);
  const fallback = useCallback(() => setQuality("low"), []);
  return { quality, decline, fallback };
}

/** Whether public/models/plush.glb exists. "checking" until we know. */
export function usePlushAvailable() {
  const [state, setState] = useState<"checking" | "yes" | "no">("checking");
  useEffect(() => {
    let alive = true;
    fetch(PLUSH_MODEL_URL, { method: "HEAD" })
      .then((r) => {
        const type = r.headers.get("content-type") ?? "";
        if (alive) setState(r.ok && !type.includes("text/html") ? "yes" : "no");
      })
      .catch(() => alive && setState("no"));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
