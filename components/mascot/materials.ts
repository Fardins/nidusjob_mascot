import * as THREE from "three";
import { useMemo } from "react";

import { PALETTE } from "./palette";
import { random } from "./brain/rng";
import { createLogoMaterial } from "./render/logoMaterial";

/* -------------------------------------------------------------- textures */

/** Soft procedural micro-noise used as a bump map for a subtle "vinyl skin" feel. */
function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n =
        0.55 * Math.sin(x * 0.21 + Math.sin(y * 0.13) * 2) +
        0.35 * Math.sin(y * 0.37 + Math.cos(x * 0.17) * 3) +
        0.6 * (random() - 0.5);
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

/** Tangent-space normal map of a plain weave (cotton) or a knit (scarf). */
function makeFabricNormal(kind: "weave" | "knit", size = 128) {
  const data = new Uint8Array(size * size * 4);
  const h = (x: number, y: number) => {
    if (kind === "weave") {
      // over-under threads
      const cx = Math.floor(x / 8) % 2;
      const cy = Math.floor(y / 8) % 2;
      const along = cx === cy ? Math.sin(((x % 8) / 8) * Math.PI) : Math.sin(((y % 8) / 8) * Math.PI);
      return along * 0.9 + 0.1 * Math.sin(x * 0.9) * Math.sin(y * 0.9);
    }
    // knit: stacked chevrons
    const u = (x % 16) / 16;
    const v = ((y + Math.abs(u - 0.5) * 16) % 16) / 16;
    return Math.sin(v * Math.PI) * Math.sin(u * Math.PI);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h((x + 1) % size, y) - h((x - 1 + size) % size, y);
      const dy = h(x, (y + 1) % size) - h(x, (y - 1 + size) % size);
      const n = new THREE.Vector3(-dx, -dy, 1.2).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(kind === "weave" ? 10 : 6, kind === "weave" ? 10 : 2);
  tex.needsUpdate = true;
  return tex;
}

/** Dashed alpha strip used for stitching along seams. */
function makeDashTexture() {
  const w = 256;
  const data = new Uint8Array(w * 4 * 4);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < w; x++) {
      const on = x % 16 < 9 ? 255 : 0;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = on;
    }
  const tex = new THREE.DataTexture(data, w, 4, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(12, 1);
  tex.needsUpdate = true;
  return tex;
}

/* -------------------------------------------------------- shader patches */

/**
 * Cheap subsurface approximation: a soft, coloured rim term (light bleeding
 * through thin edges) added to the emissive radiance. Works on every tier.
 */
function addSubsurface(m: THREE.MeshPhysicalMaterial, color: string, strength: number) {
  const uniforms = { uSSSColor: { value: new THREE.Color(color) }, uSSS: { value: strength } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSSSColor;\nuniform float uSSS;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float sssRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);
        totalEmissiveRadiance += uSSSColor * sssRim * uSSS;`,
      );
  };
  m.customProgramCacheKey = () => `sss-${color}`;
  return uniforms;
}

/** Iris: radial fibres, centre-to-edge gradient and a dark limbal ring. */
function patchIris(m: THREE.MeshPhysicalMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vIrisUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvIrisUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vIrisUv;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float ir = 1.0 - vIrisUv.y;               // 0 at the pupil, 1 at the rim
        float ang = vIrisUv.x * 6.2831853;
        float fib = 0.5 + 0.5 * sin(ang * 37.0 + sin(ang * 7.0) * 2.0)
                  * (0.6 + 0.4 * sin(ang * 13.0 + ir * 9.0));
        vec3 inner = diffuseColor.rgb * 1.55 + vec3(0.06, 0.08, 0.02);
        vec3 outer = diffuseColor.rgb * 0.7;
        vec3 col = mix(inner, outer, smoothstep(0.15, 0.95, ir));
        col *= 0.82 + 0.3 * fib * smoothstep(0.1, 0.5, ir);
        col *= 1.0 - 0.75 * smoothstep(0.82, 1.0, ir); // limbal ring
        diffuseColor.rgb = col;`,
      );
  };
  m.customProgramCacheKey = () => "iris-v1";
}

/** Lens: animated glint band sweeping across (uGlint goes -1 → 2). */
function patchLens(m: THREE.MeshPhysicalMaterial) {
  const uniforms = { uGlint: { value: -1 } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vLensUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLensUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vLensUv;\nuniform float uGlint;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float glintBand = smoothstep(0.09, 0.0, abs(vLensUv.x + vLensUv.y - uGlint * 2.0));
        totalEmissiveRadiance += vec3(glintBand) * 1.6;`,
      )
      .replace("#include <opaque_fragment>", "diffuseColor.a = max(diffuseColor.a, glintBand * 0.8);\n#include <opaque_fragment>");
  };
  m.customProgramCacheKey = () => "lens-glint";
  return uniforms;
}

/* ------------------------------------------------------------- materials */

export type MascotMaterials = ReturnType<typeof createMaterials>;

function createMaterials() {
  const noise = makeNoiseTexture();
  const weave = makeFabricNormal("weave");
  const knit = makeFabricNormal("knit");
  const dash = makeDashTexture();
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
  const skinSSS = addSubsurface(skin, "#b6ff7a", 0.22);

  const iris = new THREE.MeshPhysicalMaterial({
    color: P.iris,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    emissive: new THREE.Color(P.iris),
    emissiveIntensity: 0.18,
  });
  patchIris(iris);

  const lens = new THREE.MeshPhysicalMaterial({
    color: "#cfe8ff",
    roughness: 0.02,
    metalness: 0,
    transparent: true,
    opacity: 0.1,
    clearcoat: 1,
    iridescence: 0.55,
    iridescenceIOR: 1.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lensGlint = patchLens(lens);

  const tip = () =>
    new THREE.MeshPhysicalMaterial({
      color: P.antennaTip,
      roughness: 0.15,
      clearcoat: 1,
      emissive: new THREE.Color(P.antennaTip),
      emissiveIntensity: 0.6,
      toneMapped: false,
    });
  const antennaTipL = tip();
  const antennaTipR = tip();
  addSubsurface(antennaTipL, "#ffffff", 0.25);
  addSubsurface(antennaTipR, "#ffffff", 0.25);

  const hands = skin.clone();
  addSubsurface(hands, "#c8ff8a", 0.35);

  const wristCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (wristCanvas) wristCanvas.width = wristCanvas.height = 128;
  const wristTexture = wristCanvas ? new THREE.CanvasTexture(wristCanvas) : null;
  if (wristTexture) wristTexture.colorSpace = THREE.SRGBColorSpace;

  return {
    skin,
    skinSSS,
    hands,
    sclera: new THREE.MeshPhysicalMaterial({
      color: "#fbfdff",
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
    iris,
    irisRing: new THREE.MeshStandardMaterial({ color: P.irisDeep, roughness: 0.3 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: "#05070f", roughness: 0.1, clearcoat: 1 }),
    highlight: new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
    highlightSoft: new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, transparent: true, opacity: 0.55, depthWrite: false }),
    cornea: new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      roughness: 0,
      metalness: 0,
      transparent: true,
      opacity: 0.14,
      clearcoat: 1,
      envMapIntensity: 1.6,
      depthWrite: false,
    }),
    wetLine: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }),
    lash: new THREE.MeshStandardMaterial({ color: "#1c3a0e", roughness: 0.7 }),
    spiral: new THREE.MeshBasicMaterial({ color: "#10162a", transparent: true, opacity: 0, depthWrite: false }),
    frame: new THREE.MeshPhysicalMaterial({
      color: P.frame,
      roughness: 0.22,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    lens,
    lensGlint,
    cap: new THREE.MeshPhysicalMaterial({
      color: P.cap,
      roughness: 0.88,
      sheen: 1,
      sheenColor: new THREE.Color("#5b6b9a"),
      sheenRoughness: 0.8,
      bumpMap: noise,
      bumpScale: 0.003,
    }),
    tassel: new THREE.MeshPhysicalMaterial({
      color: P.tassel,
      roughness: 0.35,
      metalness: 0.6,
      clearcoat: 0.6,
    }),
    outfit: new THREE.MeshPhysicalMaterial({
      color: P.outfit,
      roughness: 0.66,
      sheen: 1,
      sheenColor: new THREE.Color("#ffe1a1"),
      sheenRoughness: 0.45,
      normalMap: weave,
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
    outfitAccent: new THREE.MeshPhysicalMaterial({
      color: P.outfitAccent,
      roughness: 0.55,
      sheen: 1,
      sheenColor: new THREE.Color("#fff4c2"),
      normalMap: weave,
      normalScale: new THREE.Vector2(0.25, 0.25),
    }),
    stitch: new THREE.MeshBasicMaterial({ color: "#fff2c9", alphaMap: dash, transparent: true, alphaTest: 0.4 }),
    collar: new THREE.MeshPhysicalMaterial({ color: P.collar, roughness: 0.45, clearcoat: 0.4 }),
    badge: new THREE.MeshPhysicalMaterial({
      color: P.badge,
      roughness: 0.2,
      metalness: 0.5,
      clearcoat: 1,
      emissive: new THREE.Color(P.badge),
      emissiveIntensity: 0.25,
    }),
    logo: createLogoMaterial(),
    antennaStalk: new THREE.MeshPhysicalMaterial({ color: P.skinDeep, roughness: 0.4, clearcoat: 0.5 }),
    antennaTipL,
    antennaTipR,
    blush: new THREE.MeshBasicMaterial({
      color: P.blush,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
    mouth: new THREE.MeshStandardMaterial({ color: P.mouth, roughness: 0.6 }),
    tongue: new THREE.MeshStandardMaterial({ color: P.tongue, roughness: 0.5 }),
    teeth: new THREE.MeshStandardMaterial({ color: "#fffdf6", roughness: 0.35 }),
    brow: new THREE.MeshStandardMaterial({ color: "#2e5a17", roughness: 0.6 }),
    wristBody: new THREE.MeshPhysicalMaterial({ color: "#1d2540", roughness: 0.3, metalness: 0.4, clearcoat: 1 }),
    wristScreen: new THREE.MeshBasicMaterial({ map: wristTexture, toneMapped: false }),
    wristCanvas,
    wristTexture,
    scarf: new THREE.MeshPhysicalMaterial({
      color: "#e5484d",
      roughness: 0.9,
      sheen: 1,
      sheenColor: new THREE.Color("#ffd0d0"),
      normalMap: knit,
      normalScale: new THREE.Vector2(0.8, 0.8),
    }),
  };
}

let cache: MascotMaterials | null = null;

/** Shared materials (created once per page, reused across remounts). */
export function useMascotMaterials() {
  return useMemo(() => (cache ??= createMaterials()), []);
}
