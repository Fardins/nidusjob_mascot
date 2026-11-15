import { random, rand, weightedPick } from "./rng";
import type { GestureName, ReactionName } from "./types";

/* ------------------------------------------------------------ idle actions */

export interface IdleAction {
  name: ReactionName;
  weight: number;
  /** Seconds before this action may be picked again. */
  cooldown: number;
}

export const IDLE_POOL: IdleAction[] = [
  { name: "lookAround", weight: 5, cooldown: 12 },
  { name: "lookAndSmile", weight: 4, cooldown: 14 },
  { name: "humSway", weight: 3, cooldown: 18 },
  { name: "adjustGlasses", weight: 2.5, cooldown: 25 },
  { name: "scratchHead", weight: 2, cooldown: 30 },
  { name: "stretch", weight: 1.5, cooldown: 40 },
  { name: "straightenCap", weight: 1.5, cooldown: 35 },
  { name: "tapWrist", weight: 1.5, cooldown: 30 },
  { name: "curiousTilt", weight: 2, cooldown: 20 },
  { name: "yawn", weight: 0.8, cooldown: 60 },
];

export const DROWSY_POOL: IdleAction[] = [
  { name: "yawn", weight: 3, cooldown: 12 },
  { name: "headNod", weight: 4, cooldown: 6 },
];

/**
 * Weighted random idle variations with per-action cooldowns; never repeats
 * the previous action. Intervals are randomised so no two cycles match.
 */
export class IdleScheduler {
  private last: ReactionName | null = null;
  private lastAt = new Map<ReactionName, number>();
  private nextAt = 0;

  constructor(private interval: [number, number] = [4.5, 9]) {}

  reset(now: number, delay = rand(this.interval[0], this.interval[1])) {
    this.nextAt = now + delay;
  }

  /** Returns an action if one is due, else null. `energy` 0…1 scales frequency. */
  next(now: number, pool: IdleAction[] = IDLE_POOL, energy = 1): ReactionName | null {
    if (now < this.nextAt) return null;
    const action = weightedPick(pool, (a) => {
      if (a.name === this.last) return 0;
      const at = this.lastAt.get(a.name);
      if (at !== undefined && now - at < a.cooldown) return 0;
      return a.weight;
    });
    const e = Math.max(0.2, energy);
    this.nextAt = now + rand(this.interval[0], this.interval[1]) / e;
    if (!action) return null;
    this.last = action.name;
    this.lastAt.set(action.name, now);
    return action.name;
  }
}

/* ---------------------------------------------------------------- gestures */

const LIST_RE = /(^|\s)(\d+[.)]|first|second|third|finally|-\s)|,[^,]+,[^,]+,/i;
const IDEA_RE = /\b(idea|imagine|big|huge|whole|entire|everything|amazing)\b/i;
const THINK_RE = /\b(maybe|perhaps|think|consider|depends|might|hmm|wonder)\b/i;
const SMALL_RE = /\b(small|little|bit|tiny|slightly|just|quick)\b/i;
const POINT_RE = /\b(here|this|that|click|button|there|below|above|menu|link|page)\b/i;
const WRIST_RE = /\b(time|minute|second|check|result|done|ready)\b/i;

/**
 * Picks a talking gesture for a sentence, weighted by content
 * (question → open palm, list → counting, emphasis → beat, …). Never returns
 * the same gesture twice in a row.
 */
export class GesturePicker {
  last: GestureName | null = null;

  pick(sentence: string): GestureName {
    const s = sentence.trim();
    const candidates: [GestureName, number][] = [
      ["openPalm", s.endsWith("?") ? 6 : 1.5],
      ["count", LIST_RE.test(s) ? 6 : 0.3],
      ["beat", /!/.test(s) ? 4 : 1.5],
      ["bigIdea", IDEA_RE.test(s) ? 4 : 0.6],
      ["chinTouch", THINK_RE.test(s) ? 4 : 0.4],
      ["pinch", SMALL_RE.test(s) ? 3.5 : 0.3],
      ["pointSide", POINT_RE.test(s) ? 3.5 : 0.5],
      ["presentWrist", WRIST_RE.test(s) ? 1.5 : 0.2],
      ["shrug", /\b(not sure|don'?t know|unclear|no idea)\b/i.test(s) ? 5 : 0.2],
    ];
    const g = weightedPick(candidates, ([name, w]) => (name === this.last ? 0 : w))?.[0] ?? "openPalm";
    this.last = g;
    return g;
  }
}

/** Splits streamed text into complete sentences (keeps the remainder). */
export function splitSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const re = /[^.!?\n]*[.!?\n]+(\s|$)/g;
  let m: RegExpExecArray | null;
  let end = 0;
  while ((m = re.exec(buffer))) {
    const s = m[0].trim();
    if (s) sentences.push(s);
    end = re.lastIndex;
    if (m[0].length === 0) re.lastIndex++;
  }
  return { sentences, rest: buffer.slice(end) };
}

/* ------------------------------------------------------------------ timing */

/** Greeting by local time; late at night the character is sleepier. */
export function timeOfDay(date = new Date()): { greeting: string; energy: number; part: "morning" | "afternoon" | "evening" | "night" } {
  const h = date.getHours();
  if (h >= 5 && h < 12) return { greeting: "Good morning!", energy: 1, part: "morning" };
  if (h >= 12 && h < 18) return { greeting: "Good afternoon!", energy: 1, part: "afternoon" };
  if (h >= 18 && h < 23) return { greeting: "Good evening!", energy: 0.85, part: "evening" };
  return { greeting: "Burning the midnight oil?", energy: 0.6, part: "night" };
}

/** Optional seasonal accessory. */
export function seasonalAccessory(date = new Date()): "scarf" | null {
  const m = date.getMonth();
  return m === 11 || m === 0 ? "scarf" : null;
}

/** Small helper so callers can jitter durations without importing rng. */
export const jitter = (base: number, frac = 0.15) => base * (1 + (random() * 2 - 1) * frac);
