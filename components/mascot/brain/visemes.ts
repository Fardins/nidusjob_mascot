/**
 * Phoneme-style lip sync (three.js-free).
 *
 * 15 Oculus/ARKit visemes are mapped to independent mouth channels (jaw,
 * lip width, lip rounding, lip closure, lower-lip tuck, tongue). Inputs, in
 * priority order: a timestamped viseme timeline from TTS, the live audio
 * analyser, or a text-driven estimate. A coarticulation mixer blends toward
 * the next viseme and smooths every channel so the mouth never pops.
 */

export type Viseme = "sil" | "PP" | "FF" | "TH" | "DD" | "kk" | "CH" | "SS" | "nn" | "RR" | "aa" | "E" | "I" | "O" | "U";

export const VISEMES: Viseme[] = ["sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "I", "O", "U"];

export interface MouthChannels {
  jaw: number;
  wide: number;
  round: number;
  closed: number;
  teethLip: number;
  tongue: number;
}

export const zeroChannels = (): MouthChannels => ({ jaw: 0, wide: 0, round: 0, closed: 0, teethLip: 0, tongue: 0 });

const C = (p: Partial<MouthChannels>): MouthChannels => ({ ...zeroChannels(), ...p });

export const VISEME_SHAPES: Record<Viseme, MouthChannels> = {
  sil: C({}),
  PP: C({ closed: 1 }),
  FF: C({ jaw: 0.15, teethLip: 1, wide: 0.3 }),
  TH: C({ jaw: 0.2, tongue: 1, wide: 0.2 }),
  DD: C({ jaw: 0.3, tongue: 0.7, wide: 0.3 }),
  kk: C({ jaw: 0.35, wide: 0.3 }),
  CH: C({ jaw: 0.25, round: 0.55 }),
  SS: C({ jaw: 0.12, wide: 0.6 }),
  nn: C({ jaw: 0.2, tongue: 0.6, wide: 0.2 }),
  RR: C({ jaw: 0.25, round: 0.45 }),
  aa: C({ jaw: 0.85, wide: 0.3 }),
  E: C({ jaw: 0.45, wide: 0.7 }),
  I: C({ jaw: 0.3, wide: 0.85 }),
  O: C({ jaw: 0.55, round: 0.9 }),
  U: C({ jaw: 0.25, round: 1 }),
};

export interface VisemeKey {
  /** Start time in seconds (relative to the utterance start). */
  t: number;
  v: Viseme;
}

/* ------------------------------------------------------ text → visemes */

const DIGRAPHS: [string, Viseme][] = [
  ["th", "TH"],
  ["sh", "CH"],
  ["ch", "CH"],
  ["ph", "FF"],
  ["oo", "U"],
  ["ee", "I"],
  ["ea", "I"],
  ["ou", "O"],
  ["ow", "O"],
  ["ng", "nn"],
  ["qu", "kk"],
];

const SINGLE: Record<string, Viseme> = {
  a: "aa", e: "E", i: "I", o: "O", u: "U", y: "I",
  b: "PP", m: "PP", p: "PP",
  f: "FF", v: "FF",
  d: "DD", t: "DD", l: "DD",
  n: "nn",
  k: "kk", g: "kk", c: "kk", q: "kk", x: "kk", h: "kk",
  s: "SS", z: "SS",
  j: "CH",
  r: "RR",
  w: "U",
};

const VOWELS = new Set<Viseme>(["aa", "E", "I", "O", "U"]);

/**
 * Crude grapheme → viseme estimate used when no TTS timing exists.
 * `rate` is characters per second (≈ 14 for natural speech).
 */
export function textToVisemes(text: string, rate = 14, start = 0): VisemeKey[] {
  const out: VisemeKey[] = [];
  const s = text.toLowerCase();
  const unit = 1 / rate;
  let t = start;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[.!?]/.test(ch)) {
      out.push({ t, v: "sil" });
      t += 0.32;
      i++;
      continue;
    }
    if (/[,;:\n]/.test(ch)) {
      out.push({ t, v: "sil" });
      t += 0.18;
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      t += unit * 0.4;
      i++;
      continue;
    }
    const pair = s.slice(i, i + 2);
    const di = DIGRAPHS.find(([g]) => g === pair);
    let v: Viseme | undefined;
    if (di) {
      v = di[1];
      i += 2;
    } else {
      v = SINGLE[ch];
      i++;
    }
    if (!v) continue; // digits, symbols
    const prev = out[out.length - 1];
    if (prev && prev.v === v) {
      t += unit * 0.6; // merge doubled letters
      continue;
    }
    out.push({ t, v });
    t += VOWELS.has(v) ? unit * 1.35 : unit * 0.85;
  }
  out.push({ t, v: "sil" });
  return out;
}

/** Duration of a text-driven utterance (seconds). */
export function visemeDuration(keys: VisemeKey[]) {
  return keys.length ? keys[keys.length - 1].t : 0;
}

/** Find the active and next viseme at time `t` (binary search). */
export function sampleTimeline(keys: VisemeKey[], t: number): { cur: Viseme; next: Viseme; k: number } {
  if (!keys.length || t < keys[0].t) return { cur: "sil", next: keys[0]?.v ?? "sil", k: 0 };
  let lo = 0;
  let hi = keys.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keys[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const cur = keys[lo];
  const nxt = keys[lo + 1];
  if (!nxt) return { cur: cur.v, next: "sil", k: 0 };
  const k = Math.min(1, (t - cur.t) / Math.max(1e-3, nxt.t - cur.t));
  return { cur: cur.v, next: nxt.v, k };
}

/* ------------------------------------------------------- coarticulation */

/**
 * Blends toward the upcoming viseme (anticipatory coarticulation) and
 * critically damps every channel. Allocation-free per update.
 */
export class VisemeMixer {
  readonly out = zeroChannels();
  private v = zeroChannels();

  constructor(private omega = 26) {}

  update(dt: number, cur: Viseme, next: Viseme, k: number, gain = 1) {
    const a = VISEME_SHAPES[cur];
    const b = VISEME_SHAPES[next];
    // Look ahead more as we approach the next viseme.
    const look = 0.15 + 0.35 * k;
    for (const key of Object.keys(this.out) as (keyof MouthChannels)[]) {
      const target = (a[key] * (1 - look) + b[key] * look) * gain;
      this.step(key, target, dt);
    }
    return this.out;
  }

  /** Drive directly from analyser output [open, round, wide]. */
  updateFromAudio(dt: number, open: number, round: number, wide: number) {
    this.step("jaw", open, dt);
    this.step("round", round * 1.6, dt);
    this.step("wide", wide * 1.6, dt);
    this.step("closed", open < 0.05 ? 0.4 : 0, dt);
    this.step("teethLip", 0, dt);
    this.step("tongue", 0, dt);
    return this.out;
  }

  relax(dt: number) {
    for (const key of Object.keys(this.out) as (keyof MouthChannels)[]) this.step(key, 0, dt);
    return this.out;
  }

  private step(key: keyof MouthChannels, target: number, dt: number) {
    const w = this.omega;
    const x = this.out[key];
    const v = this.v[key];
    const f = 1 + 2 * dt * w;
    const hoo = dt * w * w;
    const inv = 1 / (f + dt * hoo);
    this.out[key] = Math.min(1, Math.max(0, (f * x + dt * v + dt * hoo * target) * inv));
    this.v[key] = (v + hoo * (target - x)) * inv;
  }
}

/** Words likely to carry stress → beat gesture times (seconds) for a sentence. */
export function stressTimes(text: string, rate = 14, start = 0): number[] {
  const out: number[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const w = m[0];
    const stressed = w.length >= 7 || /^[A-Z]{2,}/.test(w) || /!$/.test(w) || /\*\*/.test(w);
    if (stressed) out.push(start + m.index / rate);
  }
  return out;
}
