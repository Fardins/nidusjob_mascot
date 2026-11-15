import type { ExpressionName } from "./expressions";
import type { ReactionName } from "./types";

/**
 * Route → behaviour profile. Behaviour changes by page: welcoming on the
 * home page, helpful on pricing, calm on docs, quiet on checkout, playful
 * on the 404 page.
 */
export interface BehaviorProfile {
  id: string;
  greeting: string;
  /** Resting expression for the idle state. */
  idleExpression: ExpressionName;
  /** 0 … 1 — scales idle-variation frequency and bounce. */
  energy: number;
  /** Whether to auto-greet on arrival. */
  greet: boolean;
  /** Quiet mode: no idle variations or speech unless there's an error. */
  quiet: boolean;
  /** Reactions the character may play on its own. */
  allowedReactions: "all" | ReactionName[];
  /** Glasses sit lower on the nose (docs "reading" look). */
  glassesLow?: boolean;
}

export const PROFILES: Record<string, BehaviorProfile> = {
  home: {
    id: "home",
    greeting: "Hi! I'm Nidus, your AI companion.",
    idleExpression: "happy",
    energy: 1,
    greet: true,
    quiet: false,
    allowedReactions: "all",
  },
  pricing: {
    id: "pricing",
    greeting: "Comparing plans? I can explain any of them.",
    idleExpression: "happy",
    energy: 0.7,
    greet: true,
    quiet: false,
    allowedReactions: ["lookAround", "lookAndSmile", "adjustGlasses", "curiousTilt", "tapWrist", "nod", "wave", "hop"],
  },
  docs: {
    id: "docs",
    greeting: "Reading the docs? Ask me anything.",
    idleExpression: "neutral",
    energy: 0.45,
    greet: false,
    quiet: false,
    allowedReactions: ["lookAround", "adjustGlasses", "curiousTilt", "nod", "tapWrist"],
    glassesLow: true,
  },
  checkout: {
    id: "checkout",
    greeting: "",
    idleExpression: "neutral",
    energy: 0.15,
    greet: false,
    quiet: true,
    allowedReactions: ["nod"],
  },
  notFound: {
    id: "notFound",
    greeting: "Hmm… this page wandered off. Want help finding it?",
    idleExpression: "confused",
    energy: 0.9,
    greet: true,
    quiet: false,
    allowedReactions: "all",
  },
};

const ROUTES: [RegExp, string][] = [
  [/^\/?$/, "home"],
  [/^\/pricing/, "pricing"],
  [/^\/docs/, "docs"],
  [/^\/(checkout|signup|login|account)/, "checkout"],
];

export function profileForPath(pathname: string | null | undefined, notFound = false): BehaviorProfile {
  if (notFound) return PROFILES.notFound;
  const p = pathname ?? "/";
  for (const [re, id] of ROUTES) if (re.test(p)) return PROFILES[id];
  return PROFILES.home;
}

export function reactionAllowed(profile: BehaviorProfile, r: ReactionName) {
  return profile.allowedReactions === "all" || profile.allowedReactions.includes(r);
}
