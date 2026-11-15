/**
 * Smooth 1D value noise (no dependency). Different frequencies per axis
 * keep layered motion from ever visibly looping.
 */

function hash(i: number, seed: number) {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296; // 0…1
}

/** Value noise in -1…1 with smootherstep interpolation. */
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = hash(i, seed);
  const b = hash(i + 1, seed);
  return (a + (b - a) * u) * 2 - 1;
}

/** Two octaves, roughly -1…1. */
export function fbm1(x: number, seed = 0) {
  return noise1(x, seed) * 0.7 + noise1(x * 2.13 + 17.1, seed + 7) * 0.3;
}
