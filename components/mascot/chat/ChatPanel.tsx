"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { mascot } from "../brain/api";
import { loadPrefs, savePrefs } from "../brain/prefs";
import { setSoundEnabled } from "../brain/sound";
import { mascotStore, useMascot } from "../store";
import { useMascotAssistant } from "./useMascotAssistant";

const SUGGESTIONS: Record<string, string[]> = {
  home: ["What can you do?", "Tell me something fun", "How does Nidus work?"],
  pricing: ["Which plan fits a small team?", "Is there a free tier?", "Explain the differences"],
  docs: ["How do I get started?", "Show me an example", "What are the main concepts?"],
  notFound: ["Where can I go from here?", "Take me home"],
  checkout: ["I have a question about billing"],
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const W = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  return C ? new C() : null;
}

/**
 * Accessible chat panel. The streaming reply is rendered visually as it
 * arrives; screen readers get the complete reply once via a polite live
 * region (and captions for any voice output come for free).
 */
export function ChatPanel() {
  const open = useMascot((s) => s.chatOpen);
  const profile = useMascot((s) => s.profile);
  const state = useMascot((s) => s.assistantState);
  const micActive = useMascot((s) => s.micActive);
  const { messages, status, error, send, stop, reset } = useMascotAssistant({ page: profile.id });
  const [input, setInput] = useState("");
  const [announce, setAnnounce] = useState("");
  const [settings, setSettings] = useState(false);
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const recog = useRef<SpeechRecognitionLike | null>(null);
  const reduced = useReducedMotion();
  const titleId = useId();
  const [canMic, setCanMic] = useState(false);

  useEffect(() => setCanMic(!!getRecognition()), []);
  useEffect(() => setSoundEnabled(prefs.soundOn), [prefs.soundOn]);

  // focus management: focus the input on open, restore on close
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement;
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
    if (opener.current instanceof HTMLElement) opener.current.focus();
  }, [open]);

  // keep the newest message in view
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [messages, reduced]);

  // announce complete replies to screen readers
  useEffect(() => {
    if (status === "idle" || status === "error") {
      const last = messages[messages.length - 1];
      if (last?.role === "assistant" && last.content) setAnnounce(last.content);
    }
  }, [status, messages]);

  const close = () => mascot.setChatOpen(false);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
    if (e.key === "Tab" && panelRef.current) {
      // keep keyboard focus inside the panel while it is open
      const f = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), textarea, input, [href]");
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const submit = (text = input) => {
    if (!text.trim()) return;
    void send(text);
    setInput("");
  };

  const toggleMic = () => {
    if (micActive) {
      recog.current?.stop();
      return;
    }
    const r = getRecognition();
    if (!r) return;
    recog.current = r;
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    let lastNod = 0;
    r.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      setInput(finalText + interim);
      // nod at pauses in speech
      if (performance.now() - lastNod > 1500) {
        lastNod = performance.now();
        mascotStore.trigger("headNod");
      }
    };
    r.onend = () => {
      mascotStore.set({ micActive: false });
      if (finalText.trim()) submit(finalText);
    };
    r.onerror = () => mascotStore.set({ micActive: false });
    mascotStore.set({ micActive: true });
    mascot.setState("listening");
    r.start();
  };

  const updatePrefs = (patch: Partial<typeof prefs>) => setPrefs(savePrefs(patch));

  const statusText =
    status === "thinking" ? "Thinking…" : status === "streaming" ? "Answering…" : micActive ? "Listening…" : state === "sleeping" ? "Napping" : "Online";
  const busy = status === "thinking" || status === "streaming";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          onKeyDown={onKeyDown}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-[60] flex h-[min(70vh,34rem)] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-2xl shadow-emerald-900/10 backdrop-blur-xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[23rem]"
        >
          <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <span className="relative grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
              N
              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${busy ? "bg-sky-400" : "bg-brand-500"}`} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-sm font-semibold text-ink">
                Nidus
              </h2>
              <p className="text-xs text-ink-soft" aria-live="off">
                {statusText}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettings((v) => !v)}
              aria-expanded={settings}
              aria-label="Assistant settings"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <circle cx="4" cy="10" r="1.6" />
                <circle cx="10" cy="10" r="1.6" />
                <circle cx="16" cy="10" r="1.6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close chat"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </header>

          {settings && (
            <div className="space-y-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span>Sound effects</span>
                <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={prefs.soundOn} onChange={(e) => updatePrefs({ soundOn: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Remember me on this device</span>
                <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={prefs.rememberMe} onChange={(e) => updatePrefs({ rememberMe: e.target.checked })} />
              </label>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={reset} className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-white">
                  Clear chat
                </button>
                <button type="button" onClick={() => mascot.setPlacement("minimized")} className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-white">
                  Minimize assistant
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    mascot.setPlacement("hidden");
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-white"
                >
                  Hide assistant
                </button>
              </div>
            </div>
          )}

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" role="log" aria-label="Conversation">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="rounded-2xl rounded-tl-md bg-brand-50 px-4 py-2.5 text-sm text-ink">{profile.greeting || "Hi! How can I help?"}</p>
                <div className="flex flex-wrap gap-2">
                  {(SUGGESTIONS[profile.id] ?? SUGGESTIONS.home).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-600 hover:border-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user" ? "rounded-br-md bg-ink text-white" : "rounded-tl-md bg-brand-50 text-ink"
                  }`}
                >
                  <span className="sr-only">{m.role === "user" ? "You: " : "Nidus: "}</span>
                  {m.content || (busy && i === messages.length - 1 ? <TypingDots /> : null)}
                </p>
              </div>
            ))}
            {error && (
              <p className="text-xs text-amber-700" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {announce}
          </div>

          <form
            className="flex items-end gap-2 border-t border-slate-100 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor={`${titleId}-input`} className="sr-only">
              Message Nidus
            </label>
            <textarea
              id={`${titleId}-input`}
              ref={inputRef}
              rows={1}
              value={input}
              placeholder="Ask Nidus anything…"
              onChange={(e) => {
                setInput(e.target.value);
                mascot.typing(e.target.value);
              }}
              onFocus={() => {
                if (!busy) mascot.setState("listening");
              }}
              onBlur={() => {
                if (mascot.getState() === "listening" && !mascotStore.get().micActive) mascot.setState("idle");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-ink outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
            />
            {canMic && (
              <button
                type="button"
                onClick={toggleMic}
                aria-pressed={micActive}
                aria-label={micActive ? "Stop voice input" : "Start voice input"}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${
                  micActive ? "border-sky-400 bg-sky-50 text-sky-600 motion-safe:animate-pulse" : "border-slate-200 text-ink-soft hover:bg-slate-50"
                } focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500`}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M10 13a3 3 0 003-3V5a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a5 5 0 01-4 4.9V17h3v1.5H6V17h3v-2.1A5 5 0 015 10h1.5a3.5 3.5 0 007 0H15z" />
                </svg>
              </button>
            )}
            {busy ? (
              <button
                type="button"
                onClick={stop}
                className="h-10 shrink-0 rounded-full bg-slate-200 px-4 text-sm font-semibold text-ink hover:bg-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="h-10 shrink-0 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Send
              </button>
            )}
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1" aria-label="Nidus is typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-brand-500 motion-safe:animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
