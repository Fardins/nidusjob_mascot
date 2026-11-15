import * as THREE from "three";
import {
  BONE_NAMES,
  BREATH_CLIP_NAMES,
  CLIP_NAMES,
  IDLE_VARIATION_HINTS,
  MORPH_NAMES,
  type BoneKey,
  type ClipState,
  type MorphKey,
} from "./rigConfig";

export const norm = (s: string) => s.toLowerCase().replace(/mixamorig\d*/g, "").replace(/[^a-z0-9]/g, "");

/** Exact match first, then substring match, honouring candidate order. */
export function pickByName<T>(items: T[], name: (t: T) => string, candidates: readonly string[]): T | undefined {
  const named = items.map((t) => [norm(name(t)), t] as const);
  for (const c of candidates) {
    const hit = named.find(([n]) => n === c);
    if (hit) return hit[1];
  }
  for (const c of candidates) {
    if (c.length < 3) continue; // avoid "a"/"o" matching everything
    const hit = named.find(([n]) => n.includes(c));
    if (hit) return hit[1];
  }
  return undefined;
}

export type BoneMap = Partial<Record<BoneKey, THREE.Bone>>;

export function collectBones(root: THREE.Object3D): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  return bones;
}

export function findBones(root: THREE.Object3D): BoneMap {
  const bones = collectBones(root);
  const map: BoneMap = {};
  const used = new Set<THREE.Bone>();
  for (const key of Object.keys(BONE_NAMES) as BoneKey[]) {
    const b = pickByName(
      bones.filter((x) => !used.has(x)),
      (x) => x.name,
      BONE_NAMES[key],
    );
    if (b) {
      map[key] = b;
      used.add(b);
    }
  }
  // "spine" substring also matches spine2 — make sure chest ≠ spine and spine is the lower one
  if (map.spine && map.chest && map.chest.parent !== map.spine && isAncestor(map.chest, map.spine)) {
    [map.spine, map.chest] = [map.chest, map.spine];
  }
  return map;
}

function isAncestor(a: THREE.Object3D, b: THREE.Object3D) {
  for (let p = b.parent; p; p = p.parent) if (p === a) return true;
  return false;
}

export interface ClipMap {
  states: Partial<Record<ClipState, THREE.AnimationClip>>;
  idleVariations: THREE.AnimationClip[];
  breath?: THREE.AnimationClip;
}

export function findClips(clips: THREE.AnimationClip[]): ClipMap {
  const states: ClipMap["states"] = {};
  const used = new Set<THREE.AnimationClip>();
  const breath = pickByName(clips, (c) => c.name, BREATH_CLIP_NAMES);
  if (breath) used.add(breath);
  for (const key of Object.keys(CLIP_NAMES) as ClipState[]) {
    const c = pickByName(
      clips.filter((x) => !used.has(x)),
      (x) => x.name,
      CLIP_NAMES[key],
    );
    if (c) {
      states[key] = c;
      used.add(c);
    }
  }
  // No clip called idle? Use the first unused clip so there's always a base pose.
  if (!states.idle) {
    const first = clips.find((c) => !used.has(c));
    if (first) {
      states.idle = first;
      used.add(first);
    }
  }
  const idleVariations = clips.filter(
    (c) => !used.has(c) && IDLE_VARIATION_HINTS.some((h) => norm(c.name).includes(h)),
  );
  return { states, idleVariations, breath };
}

/** A blendshape addressable on every mesh that has it (face may be split across meshes). */
export interface MorphTarget {
  influences: number[];
  index: number;
}

export interface MorphRegistry {
  /** All morph targets by normalised name. */
  byName: Map<string, MorphTarget[]>;
  /** Well-known facial controls resolved from MORPH_NAMES. */
  keys: Partial<Record<MorphKey, string>>;
  set(name: string, value: number): void;
}

export function findMorphs(root: THREE.Object3D): MorphRegistry {
  const byName = new Map<string, MorphTarget[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.morphTargetDictionary || !m.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(m.morphTargetDictionary)) {
      const n = norm(name);
      const list = byName.get(n) ?? [];
      list.push({ influences: m.morphTargetInfluences, index });
      byName.set(n, list);
    }
  });
  const names = [...byName.keys()];
  const keys: MorphRegistry["keys"] = {};
  for (const key of Object.keys(MORPH_NAMES) as MorphKey[]) {
    const hit = pickByName(names, (x) => x, MORPH_NAMES[key]);
    if (hit) keys[key] = hit;
  }
  return {
    byName,
    keys,
    set(name, value) {
      const list = byName.get(name);
      if (list) for (const t of list) t.influences[t.index] = value;
    },
  };
}

export function debugEnabled() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("plush-debug");
}
