"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MascotSlot,
  mascot,
  mascotStore,
  useMascot,
  EXPRESSION_META,
  EXPRESSION_NAMES,
  REACTION_NAMES,
  GESTURE_NAMES,
  type AssistantState,
  type ExpressionName,
} from "@/components/mascot";

const STATES: AssistantState[] = ["welcome", "idle", "listening", "thinking", "speaking", "success", "confused", "error", "drowsy", "sleeping", "waking", "goodbye"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function Chip({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
        active ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white text-ink-soft hover:border-brand-300 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Showcase: every expression, reaction, gesture and assistant state, plus the
 * continuous emotion space. `?expr=happy&seed=1&freeze` gives deterministic
 * frames for visual regression tests.
 */
export default function Showcase() {
  const state = useMascot((s) => s.assistantState);
  const expression = useMascot((s) => s.expression);
  const [emotion, setEmotion] = useState({ on: false, valence: 0.5, arousal: 0.5 });
  const [text, setText] = useState("Hi! I'm Nidus. First, we look at the problem. Then, we fix it together — easy!");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const expr = q.get("expr") as ExpressionName | null;
    const st = q.get("state") as AssistantState | null;
    if (st) mascot.setState(st);
    if (expr && EXPRESSION_NAMES.includes(expr)) {
      mascotStore.setExpression(expr);
      mascotStore.hideMessage();
    }
  }, []);

  useEffect(() => {
    mascot.setEmotion(emotion.on ? { valence: emotion.valence, arousal: emotion.arousal, intensity: 0.9 } : null);
  }, [emotion]);

  return (
    <main className="mx-auto grid min-h-[100svh] max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1fr_1.1fr]">
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Link href="/" className="text-sm text-brand-600 hover:underline">
          ← Home
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Nidus showcase</h1>
        <p className="mt-1 text-sm text-ink-soft">
          State: <b data-testid="state">{state}</b> · Expression: <b data-testid="expression">{expression}</b>
        </p>
        <MascotSlot className="mt-4 aspect-square w-full" />
      </div>

      <div className="space-y-8 pb-24">
        <Section title="Assistant states">
          {STATES.map((s) => (
            <Chip key={s} active={state === s} onClick={() => mascot.setState(s)}>
              {s}
            </Chip>
          ))}
        </Section>

        <Section title="Expressions">
          <Chip active={false} onClick={() => mascotStore.clearExpression()}>
            (state default)
          </Chip>
          {EXPRESSION_NAMES.map((e) => (
            <Chip key={e} active={expression === e} onClick={() => mascotStore.setExpression(e)} title={EXPRESSION_META[e].description}>
              {EXPRESSION_META[e].label}
            </Chip>
          ))}
        </Section>

        <Section title="Reactions">
          {REACTION_NAMES.map((r) => (
            <Chip key={r} onClick={() => mascot.react(r)}>
              {r}
            </Chip>
          ))}
          <Chip onClick={() => mascot.react("wink")}>wink</Chip>
        </Section>

        <Section title="Talking gestures">
          {GESTURE_NAMES.map((g) => (
            <Chip key={g} onClick={() => mascot.gesture(g, 1.8)}>
              {g}
            </Chip>
          ))}
        </Section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Emotion space</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-emerald-600" checked={emotion.on} onChange={(e) => setEmotion({ ...emotion, on: e.target.checked })} />
            Drive the face from valence / arousal
          </label>
          <label className="block text-sm">
            Valence ({emotion.valence.toFixed(2)})
            <input type="range" min={-1} max={1} step={0.01} value={emotion.valence} onChange={(e) => setEmotion({ ...emotion, valence: +e.target.value, on: true })} className="w-full accent-emerald-600" />
          </label>
          <label className="block text-sm">
            Arousal ({emotion.arousal.toFixed(2)})
            <input type="range" min={0} max={1} step={0.01} value={emotion.arousal} onChange={(e) => setEmotion({ ...emotion, arousal: +e.target.value, on: true })} className="w-full accent-emerald-600" />
          </label>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Speech (text-driven lip sync + gestures)</h2>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 p-3 text-sm" aria-label="Text to speak" />
          <div className="flex flex-wrap gap-2">
            <Chip onClick={() => void mascot.speak({ text })}>Speak</Chip>
            <Chip onClick={() => mascot.stopSpeaking()}>Stop</Chip>
            <Chip onClick={() => mascot.say(text)}>Bubble only</Chip>
          </div>
        </section>

        <Section title="Effects & placement">
          <Chip onClick={() => mascot.react("celebrate")}>Celebrate (confetti + tassel flip)</Chip>
          <Chip onClick={() => mascotStore.fx("sparkles")}>Sparkles</Chip>
          <Chip onClick={() => mascotStore.fx("glint")}>Glasses glint</Chip>
          <Chip onClick={() => mascotStore.fx("hearts")}>Hearts</Chip>
          <Chip onClick={() => mascot.setChatOpen(true)}>Open chat</Chip>
          <Chip onClick={() => mascot.setPlacement("minimized")}>Minimize</Chip>
          <Chip onClick={() => mascot.setPlacement("docked")}>Restore</Chip>
        </Section>
      </div>
    </main>
  );
}
