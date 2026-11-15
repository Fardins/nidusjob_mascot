"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMascot } from "./store";
import { usePlushProgress } from "./plush/progress";
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
      <div className="relative h-40 w-40">
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

function SpeechBubble() {
  const message = useMascot((s) => s.message);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end pr-1 sm:pr-4" aria-live="polite">
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="relative max-w-[13rem] rounded-2xl rounded-bl-md border border-white/60 bg-white/85 px-4 py-2.5 text-center text-sm font-medium text-ink shadow-[0_10px_40px_-10px_rgba(16,185,129,0.45)] backdrop-blur-md"
          >
            {message.text}
            <span className="absolute -bottom-1.5 left-5 h-3 w-3 rotate-45 border-b border-r border-white/60 bg-white/85" />
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
}

/** Drop-in: placeholder → fades into the live 3D mascot, with speech bubble overlay. */
export function MascotStage({ className = "", showSpeech = true, onReady, ...props }: MascotStageProps) {
  const [ready, setReady] = useState(false);
  return (
    <div className={`relative ${className}`}>
      <AnimatePresence>{!ready && <motion.div exit={{ opacity: 0 }} className="absolute inset-0"><Placeholder /></motion.div>}</AnimatePresence>
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={ready ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <MascotCanvas
          {...props}
          className="h-full w-full"
          onReady={() => {
            setReady(true);
            onReady?.();
          }}
        />
      </motion.div>
      {showSpeech && <SpeechBubble />}
    </div>
  );
}
