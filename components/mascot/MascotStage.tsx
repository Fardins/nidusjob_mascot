"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMascot } from "./store";
import { mascot } from "./brain/api";
import { usePlushProgress } from "./plush/progress";
import { CanvasErrorBoundary, MascotPoster, useWebGLSupport } from "./render/Fallback";
import type { MascotCanvasProps } from "./MascotCanvas";

// three.js only ships to the client, after hydration, in its own chunk.
const MascotCanvas = dynamic(() => import("./MascotCanvas"), { ssr: false, loading: () => null });

/** Lightweight CSS placeholder shown until the 3D scene's first frame, with model download progress. */
function Placeholder() {
  const progress = usePlushProgress();
  const r = 74;
  const c = 2 * Math.PI * r;
  return (
    <div className="absolute inset-0 grid place-items-center" aria-hidden={progress < 0}>
      <div className="relative h-40 w-40 max-h-full max-w-full">
        <div className="absolute inset-0 rounded-full bg-brand-400/30 blur-2xl" />
        <div className="absolute inset-6 animate-pulse rounded-full bg-gradient-to-br from-brand-300 to-brand-600 opacity-70" />
        {progress >= 0 && (
          <svg
            viewBox="0 0 160 160"
            className="absolute inset-0 -rotate-90"
            role="progressbar"
            aria-label="Loading mascot"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <circle cx="80" cy="80" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/50" />
            <circle
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - progress)}
              className="text-brand-500 transition-[stroke-dashoffset] duration-200"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

export function SpeechBubble({ align = "right" }: { align?: "right" | "left" | "center" }) {
  const message = useMascot((s) => s.message);
  const chatOpen = useMascot((s) => s.chatOpen);
  const show = message && !chatOpen;
  const justify = align === "right" ? "justify-end pr-1 sm:pr-4" : align === "left" ? "justify-start pl-1" : "justify-center";
  return (
    <div className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex ${justify}`} aria-live="polite" role="status">
      <AnimatePresence mode="wait">
        {show && (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="relative max-w-[13rem] rounded-2xl rounded-bl-md border border-white/60 bg-white/90 px-4 py-2.5 text-center text-sm font-medium text-ink shadow-[0_10px_40px_-10px_rgba(16,185,129,0.45)] backdrop-blur-md"
          >
            {message.text}
            <span className="absolute -bottom-1.5 left-5 h-3 w-3 rotate-45 border-b border-r border-white/60 bg-white/90" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface MascotStageProps extends Omit<MascotCanvasProps, "className" | "onReady"> {
  className?: string;
  showSpeech?: boolean;
  onReady?: () => void;
  /** Render the keyboard-focusable overlay (Enter/Space opens the chat). */
  focusable?: boolean;
  speechAlign?: "right" | "left" | "center";
}

/**
 * Drop-in: placeholder → fades into the live 3D mascot, with speech bubble
 * overlay. Starts the behaviour driver, falls back to a static poster when
 * WebGL is unavailable, lost, or the scene throws.
 */
export function MascotStage({ className = "", showSpeech = true, onReady, focusable = true, speechAlign = "right", ...props }: MascotStageProps) {
  const [ready, setReady] = useState(false);
  const webgl = useWebGLSupport();
  const failed = useMascot((s) => s.webglFailed);

  useEffect(() => mascot.start(), []);

  const poster = <MascotPoster />;
  const use3D = webgl !== false && !failed;

  return (
    <div className={`group/mascot relative ${className}`}>
      <AnimatePresence>
        {use3D && !ready && (
          <motion.div exit={{ opacity: 0 }} className="absolute inset-0">
            <Placeholder />
          </motion.div>
        )}
      </AnimatePresence>
      {use3D ? (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={ready ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          {webgl && (
            <CanvasErrorBoundary fallback={poster}>
              <MascotCanvas
                {...props}
                className="h-full w-full"
                onReady={() => {
                  setReady(true);
                  onReady?.();
                }}
              />
            </CanvasErrorBoundary>
          )}
        </motion.div>
      ) : (
        <div className="absolute inset-0">{poster}</div>
      )}
      {focusable && (
        <button
          type="button"
          onClick={() => mascot.click("keyboard")}
          className="pointer-events-none absolute inset-[8%] rounded-full opacity-0 outline-none ring-4 ring-brand-500/70 ring-offset-2 focus-visible:opacity-100"
          aria-label="Nidus, your AI assistant. Press Enter to chat."
        />
      )}
      {showSpeech && <SpeechBubble align={speechAlign} />}
    </div>
  );
}
