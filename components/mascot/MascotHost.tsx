"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { MascotStage } from "./MascotStage";
import { ChatPanel } from "./chat/ChatPanel";
import { mascot } from "./brain/api";
import { loadPrefs } from "./brain/prefs";
import { profileForPath } from "./brain/profiles";
import { mascotStore, useMascot } from "./store";
import type { Framing, Placement } from "./brain/types";
import { urlFlags } from "./brain/rng";

const DebugPanel = dynamic(() => import("./DebugPanel"), { ssr: false });

/* -------------------------------------------------------------- slot registry */

let slotEl: HTMLElement | null = null;
const slotListeners = new Set<() => void>();
function setSlot(el: HTMLElement | null) {
  slotEl = el;
  slotListeners.forEach((l) => l());
}
const useSlot = () =>
  useSyncExternalStore(
    (l) => {
      slotListeners.add(l);
      return () => {
        slotListeners.delete(l);
      };
    },
    () => slotEl,
    () => null,
  );

/**
 * Marks where the character stands in "hero" mode. The single live mascot
 * (owned by <MascotHost/>) flies to this box while it's on screen and docks
 * to a corner when it scrolls away or the chat opens.
 */
export function MascotSlot({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSlot(ref.current);
    return () => setSlot(null);
  }, []);
  return <div ref={ref} className={className} aria-hidden="true" />;
}

/* -------------------------------------------------------------- geometry */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function safeBottom() {
  const probe = document.getElementById("nidus-safe-probe");
  return probe ? probe.getBoundingClientRect().height : 0;
}

function rectsOverlap(a: Box, b: DOMRect) {
  return a.x < b.right && a.x + a.w > b.left && a.y < b.bottom && a.y + a.h > b.top;
}

/**
 * Hosts the single assistant instance for the whole site: placement modes
 * (hero / docked / minimized / hidden), animated transitions between them,
 * the chat panel, route-based behaviour profiles, and "never cover important
 * UI" (moves away from focused inputs and modals).
 */
export function MascotHost() {
  const pathname = usePathname();
  const slot = useSlot();
  const chatOpen = useMascot((s) => s.chatOpen);
  const placementPref = useMascot((s) => s.placement);
  const reduced = useReducedMotion() ?? false;
  const box = useRef<HTMLDivElement>(null);
  const [slotVisible, setSlotVisible] = useState(false);
  const [side, setSide] = useState<"right" | "left">("right");
  const [mounted, setMounted] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // restore user preferences
  useEffect(() => {
    setMounted(true);
    const p = loadPrefs();
    if (p.hidden) mascot.setPlacement("hidden");
    else if (p.minimized) mascot.setPlacement("minimized");
  }, []);

  // route → behaviour profile (the 404 page marks itself with data-mascot-profile)
  useEffect(() => {
    const nf = !!document.querySelector('[data-mascot-profile="notFound"]');
    setNotFound(nf);
    mascot.setProfile(profileForPath(pathname, nf));
  }, [pathname]);

  // is the hero slot on screen?
  useEffect(() => {
    if (!slot) return setSlotVisible(false);
    const io = new IntersectionObserver(([e]) => setSlotVisible(e.intersectionRatio > 0.3), { threshold: [0, 0.3, 0.6, 1] });
    io.observe(slot);
    return () => io.disconnect();
  }, [slot]);

  const userMode: Placement = placementPref === "hidden" || placementPref === "minimized" ? placementPref : "docked";
  const mode: Placement =
    userMode === "hidden" ? "hidden" : chatOpen ? "docked" : userMode === "minimized" ? "minimized" : slot && slotVisible ? "hero" : "docked";

  // never cover focused inputs or open modals: switch the dock side
  useEffect(() => {
    const check = () => {
      const el = document.activeElement;
      const w = window.innerWidth;
      const size = w < 640 ? 120 : 180;
      const dockR: Box = { x: w - size - 16, y: window.innerHeight - size - 16, w: size, h: size };
      const modal = document.querySelector('[aria-modal="true"]');
      const blocked =
        (el instanceof HTMLElement && el.matches("input, textarea, select") && !el.closest("[data-nidus]") && rectsOverlap(dockR, el.getBoundingClientRect())) ||
        (modal && !modal.closest("[data-nidus]") && rectsOverlap(dockR, modal.getBoundingClientRect()));
      setSide(blocked ? "left" : "right");
    };
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    const id = setInterval(check, 1500);
    return () => {
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
      clearInterval(id);
    };
  }, []);

  // keep the store in sync (camera framing, idle behaviour)
  useEffect(() => {
    if (mode === "hero" || mode === "docked") mascotStore.set({ placement: placementPref === "hidden" || placementPref === "minimized" ? placementPref : mode });
  }, [mode, placementPref]);

  // fly the box to its target every frame (spring), tracking the hero slot while scrolling
  useEffect(() => {
    if (!mounted) return;
    const cur: Box = { x: 0, y: 0, w: 0, h: 0 };
    let first = true;
    let raf = 0;
    let last = performance.now();
    const target = (): Box => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const sb = safeBottom();
      const mobile = w < 640;
      if (mode === "hero" && slot) {
        const r = slot.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      }
      if (mode === "minimized") {
        const s = 76;
        return { x: side === "right" ? w - s - 16 : 16, y: h - s - 16 - sb, w: s, h: s };
      }
      if (chatOpen) {
        if (mobile) {
          const s = 110;
          const sheetTop = h - Math.min(h * 0.7, 544) - 8 - sb;
          return { x: w - s - 12, y: sheetTop - s + 18, w: s, h: s };
        }
        const s = 190;
        const panelLeft = w - 20 - 368;
        return { x: panelLeft - s - 4, y: h - s - 24 - sb, w: s, h: s };
      }
      const s = mobile ? 120 : 180;
      return { x: side === "right" ? w - s - 16 : 16, y: h - s - 16 - sb, w: s, h: s };
    };
    const tick = (now: number) => {
      const el = box.current;
      if (el) {
        const tg = target();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const k = first || reduced ? 1 : 1 - Math.exp(-9 * dt);
        first = false;
        // while in hero mode and settled, follow the slot exactly (no lag while scrolling)
        const settled = Math.abs(cur.w - tg.w) < 2 && Math.abs(cur.h - tg.h) < 2;
        const kk = mode === "hero" && settled ? 1 : k;
        cur.x += (tg.x - cur.x) * kk;
        cur.y += (tg.y - cur.y) * kk;
        cur.w += (tg.w - cur.w) * kk;
        cur.h += (tg.h - cur.h) * kk;
        el.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0)`;
        el.style.width = `${Math.max(40, cur.w).toFixed(1)}px`;
        el.style.height = `${Math.max(40, cur.h).toFixed(1)}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mounted, mode, slot, side, chatOpen, reduced]);

  if (!mounted) return null;

  const framing: Framing = mode === "hero" ? "hero" : mode === "minimized" ? "face" : chatOpen ? "chat" : "widget";
  const hidden = mode === "hidden";

  return (
    <div data-nidus="" className="contents">
      {/* safe-area probe for the dock position */}
      <div id="nidus-safe-probe" aria-hidden="true" className="pointer-events-none fixed bottom-0 left-0 h-[env(safe-area-inset-bottom)] w-px opacity-0" />

      <div
        ref={box}
        className={`group/host fixed left-0 top-0 z-[55] ${hidden ? "pointer-events-none invisible" : ""} ${
          mode === "minimized" ? "overflow-hidden rounded-full border border-white/70 bg-gradient-to-b from-brand-50 to-white shadow-xl" : ""
        }`}
        style={{ willChange: "transform, width, height" }}
      >
        {!hidden && (
          <MascotStage
            className="h-full w-full"
            framing={framing}
            effects={mode === "hero" && !notFound}
            showSpeech={mode !== "minimized"}
            speechAlign={mode === "hero" ? "right" : "center"}
          />
        )}
        {mode === "minimized" && (
          <button
            type="button"
            onClick={() => mascot.setPlacement("docked")}
            className="absolute inset-0 rounded-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-brand-500"
            aria-label="Restore the Nidus assistant"
          />
        )}
        {(mode === "docked" || mode === "hero") && !chatOpen && (
          <button
            type="button"
            onClick={() => mascot.setPlacement("minimized")}
            className="absolute right-1 top-1 z-20 hidden h-6 w-6 place-items-center rounded-full bg-white/80 text-xs text-ink-soft shadow hover:bg-white focus-visible:grid focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 group-hover/host:grid"
            aria-label="Minimize assistant"
          >
            –
          </button>
        )}
      </div>

      {hidden && (
        <button
          type="button"
          onClick={() => mascot.setPlacement("docked")}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[55] rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-ink shadow-lg backdrop-blur hover:border-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          Show Nidus
        </button>
      )}

      <ChatPanel />
      {process.env.NODE_ENV !== "production" && urlFlags.debug && <DebugPanel />}
    </div>
  );
}
