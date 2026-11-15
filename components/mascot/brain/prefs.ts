/**
 * Per-visitor conveniences in localStorage (local only). Every access is
 * wrapped so private windows / blocked storage never break the page.
 */

const KEY = "nidus:prefs:v1";

export interface MascotPrefs {
  /** Assistant shown as a corner widget / face bubble / hidden. */
  minimized: boolean;
  hidden: boolean;
  chatOpen: boolean;
  soundOn: boolean;
  /** User agreed to be remembered on this device ("Welcome back!"). */
  rememberMe: boolean;
  visits: number;
  lastSeen: number;
}

const DEFAULTS: MascotPrefs = {
  minimized: false,
  hidden: false,
  chatOpen: false,
  soundOn: false,
  rememberMe: false,
  visits: 0,
  lastSeen: 0,
};

let cache: MascotPrefs | null = null;

export function loadPrefs(): MascotPrefs {
  if (cache) return cache;
  let next: MascotPrefs = { ...DEFAULTS };
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (raw) next = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  cache = next;
  return next;
}

export function savePrefs(patch: Partial<MascotPrefs>) {
  const next = { ...loadPrefs(), ...patch };
  // Visit memory only persists with consent.
  if (!next.rememberMe) {
    next.visits = 0;
    next.lastSeen = 0;
  }
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}

/** Records this visit (only with consent). Returns true for a returning visitor. */
export function recordVisit(now = Date.now()): boolean {
  const p = loadPrefs();
  if (!p.rememberMe) return false;
  const returning = p.visits > 0 && now - p.lastSeen > 60_000;
  savePrefs({ visits: p.visits + 1, lastSeen: now });
  return returning;
}
