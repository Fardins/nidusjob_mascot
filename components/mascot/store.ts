"use client";

import { useSyncExternalStore } from "react";
import type { ExpressionName } from "./expressions";

/**
 * Tiny dependency-free store shared between the 3D scene (read every frame
 * via `mascotStore.get()`, no React re-renders) and the DOM UI (subscribed
 * via `useMascot()`).
 */

export type ReactionName = "jump" | "spin" | "wave" | "nod" | "shake" | "squash";

export interface MascotState {
  /** Expression the character is currently showing. */
  expression: ExpressionName;
  /** One-shot body animation. `id` changes on every trigger. */
  reaction: { name: ReactionName; id: number } | null;
  /** Speech bubble text (null = hidden). */
  message: { text: string; id: number } | null;
  /** Screen-space point (client px) the mascot should look at instead of the cursor. */
  attention: { x: number; y: number } | null;
  /** Timestamp (ms) of the last user interaction with the page/mascot. */
  lastInteraction: number;
  /** Whether the pointer is over the character. */
  hovered: boolean;
}

type Listener = () => void;

let state: MascotState = {
  expression: "happy",
  reaction: null,
  message: null,
  attention: null,
  lastInteraction: 0,
  hovered: false,
};

const listeners = new Set<Listener>();
let seq = 0;
let expressionTimer: ReturnType<typeof setTimeout> | undefined;
let messageTimer: ReturnType<typeof setTimeout> | undefined;

function set(patch: Partial<MascotState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const mascotStore = {
  get: () => state,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** Set an expression. With `holdMs`, it reverts to `revertTo` afterwards. */
  setExpression(expression: ExpressionName, holdMs?: number, revertTo: ExpressionName = "happy") {
    clearTimeout(expressionTimer);
    set({ expression });
    if (holdMs) expressionTimer = setTimeout(() => set({ expression: revertTo }), holdMs);
  },

  trigger(name: ReactionName) {
    set({ reaction: { name, id: ++seq } });
  },

  say(text: string, ms = 2800) {
    clearTimeout(messageTimer);
    set({ message: { text, id: ++seq } });
    messageTimer = setTimeout(() => set({ message: null }), ms);
  },

  /** Make the mascot look at a DOM element (e.g. a CTA on hover). Pass null to release. */
  lookAtElement(el: Element | null) {
    if (!el) return set({ attention: null });
    const r = el.getBoundingClientRect();
    set({ attention: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
  },

  setHovered(hovered: boolean) {
    if (hovered !== state.hovered) set({ hovered });
  },

  touch() {
    state.lastInteraction = performance.now(); // hot path: no notify
  },
};

/** React hook for DOM components. */
export function useMascot<T = MascotState>(selector: (s: MascotState) => T = (s) => s as T): T {
  return useSyncExternalStore(
    mascotStore.subscribe,
    () => selector(state),
    () => selector(state),
  );
}
