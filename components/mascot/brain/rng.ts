/**
 * Seedable PRNG shared by every behaviour module. All randomness in the
 * mascot goes through here so tests and visual snapshots can be made
 * deterministic with `setSeed()` or the `?seed=123` URL parameter.
 */

let state = (Date.now() ^ 0x9e3779b9) >>> 0;

/** mulberry32 — tiny, fast, good enough for animation. */
export function random(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function setSeed(seed: number) {
  state = seed >>> 0;
}

export const rand = (a: number, b: number) => a + random() * (b - a);
export const chance = (p: number) => random() < p;
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)];

/** Weighted pick; `weight(x) <= 0` excludes an item. Returns undefined if nothing is eligible. */
export function weightedPick<T>(xs: readonly T[], weight: (x: T) => number): T | undefined {
  let total = 0;
  for (const x of xs) total += Math.max(0, weight(x));
  if (total <= 0) return undefined;
  let r = random() * total;
  for (const x of xs) {
    r -= Math.max(0, weight(x));
    if (r <= 0) return x;
  }
  return xs[xs.length - 1];
}

/** Read `?seed=` (and `?freeze`) once in the browser. */
export const urlFlags = (() => {
  if (typeof window === "undefined") return { seed: null as number | null, freeze: false, debug: false };
  const q = new URLSearchParams(window.location.search);
  const seed = q.has("seed") ? Number(q.get("seed")) || 1 : null;
  if (seed !== null) setSeed(seed);
  return { seed, freeze: q.has("freeze"), debug: q.has("debug") };
})();
