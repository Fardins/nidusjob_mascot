import * as THREE from "three";
import { useMemo } from "react";

import { PALETTE } from "./palette";


/** Soft procedural micro-noise used as a bump map for a subtle "vinyl skin" feel. */
function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // layered value noise, cheap and tile-friendly enough at this scale
      const n =
        0.55 * Math.sin(x * 0.21 + Math.sin(y * 0.13) * 2) +
        0.35 * Math.sin(y * 0.37 + Math.cos(x * 0.17) * 3) +
        0.6 * (Math.random() - 0.5);
      const v = Math.max(0, Math.min(255, 128 + n * 40));
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.needsUpdate = true;
  return tex;
}

export type MascotMaterials = ReturnType<typeof createMaterials>;

function createMaterials() {
  const noise = makeNoiseTexture();
  const P = PALETTE;

  const skin = new THREE.MeshPhysicalMaterial({
    color: P.skin,
    roughness: 0.42,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    sheen: 0.6,
    sheenColor: new THREE.Color("#d8ffb0"),
    sheenRoughness: 0.5,
    bumpMap: noise,
    bumpScale: 0.004,
  });

  return {
    skin,
    sclera: new THREE.MeshPhysicalMaterial({
      color: "#fbfdff",
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
    iris: new THREE.MeshPhysicalMaterial({
      color: P.iris,
      roughness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      emissive: new THREE.Color(P.iris),
      emissiveIntensity: 0.18,
    }),
    irisRing: new THREE.MeshStandardMaterial({ color: P.irisDeep, roughness: 0.3 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: "#05070f", roughness: 0.1, clearcoat: 1 }),
    highlight: new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
    cornea: new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      roughness: 0,
      metalness: 0,
      transparent: true,
      opacity: 0.12,
      clearcoat: 1,
      depthWrite: false,
    }),
    frame: new THREE.MeshPhysicalMaterial({
      color: P.frame,
      roughness: 0.22,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    lens: new THREE.MeshPhysicalMaterial({
      color: "#cfe8ff",
      roughness: 0.02,
      metalness: 0,
      transparent: true,
      opacity: 0.1,
      clearcoat: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    cap: new THREE.MeshPhysicalMaterial({
      color: P.cap,
      roughness: 0.55,
      sheen: 0.8,
      sheenColor: new THREE.Color("#5b6b9a"),
    }),
    tassel: new THREE.MeshPhysicalMaterial({
      color: P.tassel,
      roughness: 0.35,
      metalness: 0.6,
      clearcoat: 0.6,
    }),
    outfit: new THREE.MeshPhysicalMaterial({
      color: P.outfit,
      roughness: 0.62,
      sheen: 1,
      sheenColor: new THREE.Color("#ffe1a1"),
      sheenRoughness: 0.4,
      bumpMap: noise,
      bumpScale: 0.006,
    }),
    outfitAccent: new THREE.MeshPhysicalMaterial({
      color: P.outfitAccent,
      roughness: 0.5,
      sheen: 1,
      sheenColor: new THREE.Color("#fff4c2"),
    }),
    collar: new THREE.MeshPhysicalMaterial({ color: P.collar, roughness: 0.45, clearcoat: 0.4 }),
    badge: new THREE.MeshPhysicalMaterial({
      color: P.badge,
      roughness: 0.2,
      metalness: 0.5,
      clearcoat: 1,
      emissive: new THREE.Color(P.badge),
      emissiveIntensity: 0.25,
    }),
    badgeIcon: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.3,
      metalness: 0.2,
      emissive: new THREE.Color("#bfe0ff"),
      emissiveIntensity: 0.4,
    }),
    antennaStalk: new THREE.MeshPhysicalMaterial({ color: P.skinDeep, roughness: 0.4, clearcoat: 0.5 }),
    antennaTip: new THREE.MeshPhysicalMaterial({
      color: P.antennaTip,
      roughness: 0.15,
      clearcoat: 1,
      emissive: new THREE.Color(P.antennaTip),
      emissiveIntensity: 0.6,
    }),
    blush: new THREE.MeshBasicMaterial({
      color: P.blush,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
    mouth: new THREE.MeshStandardMaterial({ color: P.mouth, roughness: 0.6 }),
    tongue: new THREE.MeshStandardMaterial({ color: P.tongue, roughness: 0.5 }),
    brow: new THREE.MeshStandardMaterial({ color: "#2e5a17", roughness: 0.6 }),
  };
}

let cache: MascotMaterials | null = null;

/** Shared materials (created once per page, reused across remounts). */
export function useMascotMaterials() {
  return useMemo(() => (cache ??= createMaterials()), []);
}
