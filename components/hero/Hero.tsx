"use client";

import { motion, type Variants } from "framer-motion";
import { useEffect } from "react";
import {
  MascotStage,
  mascotStore,
  useMascot,
  EXPRESSION_NAMES,
  type ExpressionName,
} from "@/components/mascot";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

const LABELS: Record<ExpressionName, string> = {
  neutral: "Calm",
  happy: "Happy",
  curious: "Curious",
  surprised: "Surprised",
  thinking: "Thinking",
  excited: "Excited",
};

/** Hovering a CTA makes the mascot look at it with an expression. */
function useAttention(expression: ExpressionName, line?: string) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      mascotStore.lookAtElement(e.currentTarget);
      mascotStore.setExpression(expression);
      if (line) mascotStore.say(line, 2000);
    },
    onMouseLeave: () => {
      mascotStore.lookAtElement(null);
      mascotStore.setExpression("happy");
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => mascotStore.lookAtElement(e.currentTarget),
    onBlur: () => mascotStore.lookAtElement(null),
  };
}

function ExpressionChips() {
  const current = useMascot((s) => s.expression);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Mascot mood">
      {EXPRESSION_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => {
            mascotStore.setExpression(name, 4000, "happy");
            if (name === "excited") mascotStore.trigger("jump");
            if (name === "surprised") mascotStore.trigger("squash");
            if (name === "thinking") mascotStore.trigger("nod");
          }}
          aria-pressed={current === name}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
            current === name
              ? "border-brand-500 bg-brand-500 text-white shadow-md shadow-brand-500/30"
              : "border-slate-200 bg-white/70 text-ink-soft hover:border-brand-300 hover:text-ink"
          }`}
        >
          {LABELS[name]}
        </button>
      ))}
    </div>
  );
}

export function Hero() {
  const primary = useAttention("excited", "Ooh, let's go!");
  const secondary = useAttention("curious");

  // Friendly greeting shortly after load.
  useEffect(() => {
    const id = setTimeout(() => {
      mascotStore.trigger("wave");
      mascotStore.say("Hi! I'm Nidus, your AI companion.", 3200);
    }, 1400);
    return () => clearTimeout(id);
  }, []);

  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
      {/* backdrop */}
      <div className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="absolute right-[-10%] top-[-10%] -z-10 h-[38rem] w-[38rem] rounded-full bg-brand-300/30 blur-[120px]" />
      <div className="absolute bottom-[-20%] left-[-10%] -z-10 h-[30rem] w-[30rem] rounded-full bg-cyan-200/40 blur-[120px]" />

      {/* nav */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="#" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white shadow-lg shadow-brand-500/30">
            N
          </span>
          NidusLab
        </a>
        <nav className="hidden gap-8 text-sm text-ink-soft md:flex">
          <a href="#" className="hover:text-ink">Product</a>
          <a href="#" className="hover:text-ink">Solutions</a>
          <a href="#" className="hover:text-ink">Pricing</a>
          <a href="#" className="hover:text-ink">Docs</a>
        </nav>
        <a href="#" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90">
          Sign in
        </a>
      </header>

      <div className="mx-auto grid max-w-7xl items-center gap-4 px-5 pb-16 pt-2 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pb-24 lg:pt-8">
        {/* copy */}
        <motion.div variants={container} initial="hidden" animate="show" className="order-2 text-center lg:order-1 lg:text-left">
          <motion.div variants={item} className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-xs font-medium text-brand-600 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            Your AI companion is online
          </motion.div>

          <motion.h1 variants={item} className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Meet <span className="bg-gradient-to-r from-brand-500 to-cyan-500 bg-clip-text text-transparent">Nidus</span>,
            <br className="hidden sm:block" /> the AI that lives in your workflow.
          </motion.h1>

          <motion.p variants={item} className="mx-auto mt-5 max-w-xl text-base text-ink-soft sm:text-lg lg:mx-0">
            A friendly, always-curious companion that learns how you work, answers in seconds and
            keeps your team moving. Go ahead — say hi. It’s watching your cursor.
          </motion.p>

          <motion.div variants={item} className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a
              href="#"
              {...primary}
              className="w-full rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:-translate-y-0.5 hover:bg-brand-600 sm:w-auto"
            >
              Start for free
            </a>
            <a
              href="#"
              {...secondary}
              className="w-full rounded-full border border-slate-200 bg-white/80 px-6 py-3 text-sm font-semibold text-ink backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-300 sm:w-auto"
            >
              Watch demo
            </a>
          </motion.div>

          <motion.div variants={item} className="mt-8 flex flex-col items-center gap-2 lg:items-start">
            <span className="text-xs uppercase tracking-widest text-slate-400">Try a mood</span>
            <ExpressionChips />
          </motion.div>
        </motion.div>

        {/* mascot */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="order-1 lg:order-2"
        >
          <MascotStage className="mx-auto aspect-square w-full max-w-[22rem] sm:max-w-[30rem] lg:max-w-none" />
          <p className="-mt-2 text-center text-xs text-slate-400">Click, tap or drag to play</p>
        </motion.div>
      </div>
    </section>
  );
}
