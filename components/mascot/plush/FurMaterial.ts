import * as THREE from "three";
import { FUR, FUR_LIGHTS } from "./rigConfig";

/**
 * Shell-textured fur.
 *
 * One extra draw call per furred mesh: the mesh's own geometry is wrapped in
 * an InstancedBufferGeometry with `shells` instances, and the vertex shader
 * pushes instance i out along the (skinned, morphed) normal by i/shells of
 * the fur length. Strands are carved per-pixel from a hashed cell grid,
 * combed by the flow map and cut by the length map. Bending (gravity, wind,
 * the character's own motion) grows quadratically toward the tips.
 *
 * Lighting is three's MeshStandardMaterial (so it gets the scene lights,
 * environment and shadows) plus a Kajiya-Kay strand highlight, a rim
 * sheen and height-based self-occlusion added on top.
 */

export interface FurUniforms {
  uFurLength: { value: number };
  uDensity: { value: number };
  uThickness: { value: number };
  uTime: { value: number };
  /** Object-space bend at the tips: gravity + motion drag (+ wind added in shader). */
  uBend: { value: THREE.Vector3 };
  uWindDir: { value: THREE.Vector3 };
  uWindStrength: { value: number };
  uLengthMap: { value: THREE.Texture };
  uFlowMap: { value: THREE.Texture };
  uOcclusion: { value: number };
  uSheenColor: { value: THREE.Color };
  uTipColor: { value: THREE.Color };
  uKeyDir: { value: THREE.Vector3 }; // view space
  uRimDir: { value: THREE.Vector3 }; // view space
  uKeyInt: { value: number };
  uRimInt: { value: number };
}

function solidTexture(r: number, g: number, b: number) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}
const DEFAULT_LENGTH = solidTexture(255, 255, 255);
const DEFAULT_FLOW = solidTexture(128, 96, 128); // gentle "downward" comb in tangent space

/** Loads an optional texture; resolves to `fallback` if the file is missing. */
export function loadOptionalTexture(url: string | undefined, fallback: THREE.Texture, srgb = false): Promise<THREE.Texture> {
  if (!url) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.flipY = false; // glTF UV convention
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        resolve(t);
      },
      undefined,
      () => resolve(fallback),
    );
  });
}

export function createFurUniforms(): FurUniforms {
  return {
    uFurLength: { value: FUR.length },
    uDensity: { value: FUR.density },
    uThickness: { value: 0.9 },
    uTime: { value: 0 },
    uBend: { value: new THREE.Vector3(0, -0.35, 0) },
    uWindDir: { value: new THREE.Vector3(1, 0, 0.3).normalize() },
    uWindStrength: { value: 0.12 },
    uLengthMap: { value: DEFAULT_LENGTH },
    uFlowMap: { value: DEFAULT_FLOW },
    uOcclusion: { value: 0.42 },
    uSheenColor: { value: new THREE.Color(FUR.sheenColor) },
    uTipColor: { value: new THREE.Color(FUR.tipColor) },
    uKeyDir: { value: new THREE.Vector3(...FUR_LIGHTS.key.position).normalize() },
    uRimDir: { value: new THREE.Vector3(...FUR_LIGHTS.rim.position).normalize() },
    uKeyInt: { value: FUR_LIGHTS.key.intensity },
    uRimInt: { value: FUR_LIGHTS.rim.intensity },
  };
}

const VERT_PARS = /* glsl */ `
attribute float aShell;
uniform float uFurLength;
uniform float uTime;
uniform vec3 uBend;
uniform vec3 uWindDir;
uniform float uWindStrength;
uniform sampler2D uLengthMap;
varying float vShell;
varying vec2 vFurUv;
`;

const VERT_DISPLACE = /* glsl */ `
#include <skinning_vertex>
{
  float h = aShell;
  float lenMask = texture2D(uLengthMap, uv).r;
  vec3 n = normalize(objectNormal);
  // Wind: travelling gusts, phase varies across the surface so it ripples.
  float gust = sin(uTime * 1.7 + dot(transformed, vec3(9.1, 5.3, 7.7))) * 0.5 + 0.5;
  gust *= 0.6 + 0.4 * sin(uTime * 0.43 + transformed.y * 3.0);
  vec3 bend = uBend + uWindDir * gust * uWindStrength;
  // Remove the part of the bend along the normal so strands bend, not stretch.
  bend -= n * dot(bend, n) * 0.85;
  transformed += (n * h + bend * h * h) * uFurLength * lenMask;
  vShell = h;
  vFurUv = uv;
}
`;

const FRAG_PARS = /* glsl */ `
uniform float uDensity;
uniform float uThickness;
uniform float uOcclusion;
uniform sampler2D uLengthMap;
uniform sampler2D uFlowMap;
uniform vec3 uSheenColor;
uniform vec3 uTipColor;
uniform vec3 uKeyDir;
uniform vec3 uRimDir;
uniform float uKeyInt;
uniform float uRimInt;
varying float vShell;
varying vec2 vFurUv;

float furHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Kajiya-Kay: highlight from the strand tangent instead of the surface normal.
float kajiyaKay(vec3 T, vec3 V, vec3 L, float expo) {
  vec3 H = normalize(L + V);
  float th = dot(T, H);
  return pow(sqrt(max(0.0, 1.0 - th * th)), expo) * smoothstep(-0.2, 0.4, dot(T, L) + 0.5);
}
`;

const FRAG_STRANDS = /* glsl */ `
#include <map_fragment>
{
  vec2 flow = texture2D(uFlowMap, vFurUv).rg * 2.0 - 1.0;
  // Comb: higher layers sample further along the flow, so strands lean.
  vec2 st = (vFurUv + flow * vShell * (1.5 / uDensity) * 6.0) * uDensity;
  vec2 cell = floor(st);
  vec2 f = fract(st) - 0.5;
  float rnd = furHash(cell);
  // jitter strand root within its cell
  f -= (vec2(furHash(cell + 17.0), furHash(cell + 31.0)) - 0.5) * 0.35;
  float strandLen = mix(0.55, 1.0, rnd) * texture2D(uLengthMap, vFurUv).r;
  float taper = 1.0 - vShell / max(strandLen, 1e-3);
  if (vShell > strandLen || length(f) * 2.0 > taper * uThickness) discard;
  // soft self-occlusion: roots are darker, tips catch light
  float occ = mix(uOcclusion, 1.0, smoothstep(0.0, 1.0, vShell));
  diffuseColor.rgb *= occ;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uTipColor * 1.08, vShell * vShell * 0.35);
}
`;

const FRAG_SHEEN = /* glsl */ `
#include <opaque_fragment>
{
  vec3 V = normalize(vViewPosition);
  vec3 T = normalize(normal); // strands grow along the normal
  // two shifted lobes, like Marschner R / TRT
  float s1 = kajiyaKay(normalize(T + V * 0.08), V, uKeyDir, 80.0);
  float s2 = kajiyaKay(normalize(T - V * 0.12), V, uKeyDir, 18.0) * 0.45;
  float rimKK = kajiyaKay(T, V, uRimDir, 10.0);
  float fres = pow(1.0 - saturate(dot(T, V)), 3.0);
  vec3 sheen = uSheenColor * ((s1 + s2) * uKeyInt * 0.35 + (rimKK * 0.5 + fres * 0.9) * uRimInt * 0.45);
  gl_FragColor.rgb += sheen * mix(0.25, 1.0, vShell) * diffuseColor.rgb * 1.6 + sheen * fres * 0.15;
}
`;

/** Turns a copy of the source's material into a fur shell material. */
export function createFurShellMaterial(source: THREE.Material, uniforms: FurUniforms): THREE.MeshStandardMaterial {
  const src = source as THREE.MeshStandardMaterial;
  const mat = new THREE.MeshStandardMaterial({
    color: src.color?.clone() ?? new THREE.Color("#f4c6d6"),
    map: src.map ?? null,
    normalMap: null, // per-strand shading comes from the shell normal
    roughness: 0.9,
    metalness: 0,
    side: THREE.FrontSide,
  });
  mat.name = `${source.name || "fur"}_shells`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
      .replace("#include <skinning_vertex>", VERT_DISPLACE);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
      .replace("#include <map_fragment>", FRAG_STRANDS)
      .replace("#include <opaque_fragment>", FRAG_SHEEN);
  };
  mat.customProgramCacheKey = () => "plush-fur-shells-v1";
  return mat;
}

/**
 * Low-end fallback (and the furred mesh's own base layer): a physical
 * material with fabric sheen, keeping the model's textures.
 */
export function createSheenFurMaterial(source: THREE.Material): THREE.MeshPhysicalMaterial {
  const src = source as THREE.MeshStandardMaterial;
  const mat = new THREE.MeshPhysicalMaterial({
    color: src.color?.clone() ?? new THREE.Color("#f4c6d6"),
    map: src.map ?? null,
    normalMap: src.normalMap ?? null,
    aoMap: src.aoMap ?? null,
    roughness: 0.92,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(FUR.sheenColor),
  });
  if (src.normalScale) mat.normalScale.copy(src.normalScale);
  mat.name = `${source.name || "fur"}_sheen`;
  return mat;
}

export interface FurShells {
  mesh: THREE.Mesh;
  dispose(): void;
}

/**
 * Builds the instanced shell mesh for `source` (skinned or static) and adds
 * it as a child so it inherits the same transform. Shells share the source's
 * skeleton and morph influences, so they deform identically.
 */
export function createFurShells(source: THREE.Mesh, count: number, uniforms: FurUniforms): FurShells {
  const g = source.geometry;
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = g.index;
  for (const [name, attr] of Object.entries(g.attributes)) ig.setAttribute(name, attr);
  ig.morphAttributes = g.morphAttributes;
  ig.morphTargetsRelative = g.morphTargetsRelative;
  ig.boundingSphere = g.boundingSphere?.clone() ?? null;
  ig.boundingBox = g.boundingBox?.clone() ?? null;
  const shell = new Float32Array(count);
  for (let i = 0; i < count; i++) shell[i] = (i + 1) / count;
  ig.setAttribute("aShell", new THREE.InstancedBufferAttribute(shell, 1));
  ig.instanceCount = count;

  const material = createFurShellMaterial(source.material as THREE.Material, uniforms);
  let mesh: THREE.Mesh;
  const skinned = source as THREE.SkinnedMesh;
  if (skinned.isSkinnedMesh) {
    const sm = new THREE.SkinnedMesh(ig, material);
    sm.bindMode = skinned.bindMode;
    sm.bind(skinned.skeleton, skinned.bindMatrix);
    mesh = sm;
  } else {
    mesh = new THREE.Mesh(ig, material);
  }
  mesh.name = `${source.name}_furShells`;
  mesh.morphTargetInfluences = source.morphTargetInfluences; // shared array → same face shapes
  mesh.morphTargetDictionary = source.morphTargetDictionary;
  mesh.frustumCulled = false; // skinned bounds are unreliable
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.raycast = () => {}; // pointer hits go to the body
  mesh.renderOrder = 1;
  source.add(mesh);

  return {
    mesh,
    dispose() {
      source.remove(mesh);
      ig.dispose();
      material.dispose();
    },
  };
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Per-frame update: time, view-space light directions, and the tip bend from
 * gravity + the character's world velocity (fur trails behind motion).
 */
export function updateFurUniforms(
  u: FurUniforms,
  t: number,
  camera: THREE.Camera,
  object: THREE.Object3D,
  worldVelocity: THREE.Vector3,
  windScale: number,
) {
  u.uTime.value = t;
  u.uKeyDir.value.set(...FUR_LIGHTS.key.position).normalize().transformDirection(camera.matrixWorldInverse);
  u.uRimDir.value.set(...FUR_LIGHTS.rim.position).normalize().transformDirection(camera.matrixWorldInverse);
  // world-space bend → object space (direction only)
  _v.set(0, -0.35, 0).addScaledVector(worldVelocity, -0.9);
  _v.clampLength(0, 1.2);
  _m.copy(object.matrixWorld).invert();
  u.uBend.value.copy(_v).transformDirection(_m).multiplyScalar(_v.length());
  u.uWindStrength.value = 0.12 * windScale;
}
