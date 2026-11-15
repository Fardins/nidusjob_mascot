import * as THREE from "three";
import type { AntennaMode } from "../brain/expressions";
import type { AssistantState } from "../brain/types";

/**
 * Antenna tip colour/pulse per state. Every pulse stays ≤ 3 Hz (WCAG 2.3.1).
 * `chase` offsets the two tips so the light "runs" between them.
 */
export const ANTENNA_MODES: Record<AntennaMode, { color: string; alt?: string; base: number; amp: number; hz: number; chase?: boolean; voice?: boolean }> = {
  idle: { color: "#d9ff5a", base: 0.75, amp: 0.25, hz: 0.45 },
  listening: { color: "#c9fff0", base: 1.35, amp: 0.05, hz: 0.3 },
  thinking: { color: "#86d6ff", base: 0.9, amp: 0.7, hz: 1.4, chase: true },
  speaking: { color: "#d9ff5a", base: 0.9, amp: 0.15, hz: 0.6, voice: true },
  success: { color: "#5bff8a", base: 1.5, amp: 0.4, hz: 1.2 },
  error: { color: "#ffb020", alt: "#ff4d4d", base: 1.2, amp: 0.6, hz: 2 },
  sleeping: { color: "#9fb86a", base: 0.12, amp: 0.08, hz: 0.18 },
};

export const MAX_FLASH_HZ = 3;

export function antennaModeForState(state: AssistantState, fallback: AntennaMode): AntennaMode {
  switch (state) {
    case "listening":
      return "listening";
    case "thinking":
      return "thinking";
    case "speaking":
      return "speaking";
    case "success":
      return "success";
    case "error":
      return "error";
    case "sleeping":
    case "drowsy":
      return "sleeping";
    default:
      return fallback;
  }
}

const _c = new THREE.Color();
const _alt = new THREE.Color();

/** Writes the tip colours/intensities for this frame. */
export function updateAntennaTips(
  left: THREE.MeshPhysicalMaterial,
  right: THREE.MeshPhysicalMaterial,
  mode: AntennaMode,
  t: number,
  glowScale: number,
  amplitude: number,
  dt: number,
) {
  const cfg = ANTENNA_MODES[mode];
  const hz = Math.min(cfg.hz, MAX_FLASH_HZ);
  const w = t * hz * Math.PI * 2;
  _c.set(cfg.color);
  let l = cfg.base + cfg.amp * Math.sin(w);
  let r = cfg.chase ? cfg.base + cfg.amp * Math.sin(w + Math.PI) : l;
  if (cfg.voice) {
    l += amplitude * 1.1;
    r += amplitude * 1.1;
  }
  if (cfg.alt) {
    // alternate between two colours (amber ↔ red) at ≤ 2 Hz
    _alt.set(cfg.alt);
    _c.lerp(_alt, 0.5 + 0.5 * Math.sin(w));
  }
  const k = 1 - Math.exp(-8 * dt);
  left.emissive.lerp(_c, k);
  right.emissive.lerp(_c, k);
  left.color.lerp(_c, k * 0.5);
  right.color.lerp(_c, k * 0.5);
  left.emissiveIntensity += (Math.max(0.05, l * glowScale) - left.emissiveIntensity) * k;
  right.emissiveIntensity += (Math.max(0.05, r * glowScale) - right.emissiveIntensity) * k;
  return _c;
}
