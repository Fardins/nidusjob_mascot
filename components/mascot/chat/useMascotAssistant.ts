"use client";

import { useCallback, useRef, useState } from "react";
import { mascot } from "../brain/api";
import { mascotStore } from "../store";
import { streamChat, type ChatMessage } from "./transport";

const FIRST_TOKEN_TIMEOUT = 20_000;

export interface AssistantOptions {
  endpoint?: string;
  /** Behaviour profile id sent to the backend as page context. */
  page?: string;
}

export type AssistantStatus = "idle" | "thinking" | "streaming" | "error";

/**
 * Wires a streaming chat backend to the mascot automatically:
 * submit → thinking; first token → speaking (lip-sync + gestures);
 * per-sentence emotion tags → face; `⟦state:confused⟧` → confused;
 * `⟦state:success⟧` → happy jump; errors/timeouts → warning + apology.
 */
export function useMascotAssistant({ endpoint, page }: AssistantOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    mascot.stopSpeaking();
    setStatus("idle");
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || status === "thinking" || status === "streaming") return;
      setError(null);
      const history: ChatMessage[] = [...messages, { role: "user", content }];
      setMessages([...history, { role: "assistant", content: "" }]);
      setStatus("thinking");
      mascot.setUserMessage(content);
      mascot.setState("thinking");
      mascot.lookAt(null);

      const ctrl = new AbortController();
      abort.current = ctrl;
      let gotText = false;
      let reply = "";
      let then: "idle" | "confused" | "success" = "idle";
      const timer = setTimeout(() => {
        if (!gotText) ctrl.abort(new DOMException("timeout", "TimeoutError"));
      }, FIRST_TOKEN_TIMEOUT);

      const fail = (msg: string) => {
        clearTimeout(timer);
        setStatus("error");
        setError(msg);
        mascot.stopSpeaking();
        mascot.setState("error");
        const apology = "Sorry — something went wrong on my side. Could you try again?";
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", content: reply || apology };
          return copy;
        });
        if (!mascotStore.get().chatOpen) mascot.say(apology);
      };

      try {
        for await (const ev of streamChat(history, { signal: ctrl.signal, page, endpoint })) {
          if (ev.type === "text") {
            if (!gotText) {
              gotText = true;
              clearTimeout(timer);
              setStatus("streaming");
              void mascot.speak({ text: ev.text, streaming: true });
            } else mascot.speakAppend(ev.text);
            reply += ev.text;
            const snapshot = reply;
            setMessages((m) => {
              const copy = m.slice();
              copy[copy.length - 1] = { role: "assistant", content: snapshot };
              return copy;
            });
          } else if (ev.type === "emotion") {
            mascot.setEmotionTag(ev.name, ev.intensity);
          } else if (ev.type === "state") {
            then = ev.state;
          } else if (ev.type === "error") {
            fail(ev.message);
            return;
          } else if (ev.type === "done") {
            break;
          }
        }
        clearTimeout(timer);
        if (!gotText) {
          fail("The assistant returned an empty reply.");
          return;
        }
        mascot.speakEnd(then);
        setStatus("idle");
      } catch (err) {
        const aborted = (err as Error)?.name === "AbortError" || ctrl.signal.aborted;
        const timeout = ctrl.signal.reason instanceof DOMException && ctrl.signal.reason.name === "TimeoutError";
        if (aborted && !timeout) {
          setStatus("idle");
          mascot.speakEnd("idle");
          return;
        }
        fail(timeout ? "The assistant took too long to answer." : "Network error.");
      } finally {
        if (abort.current === ctrl) abort.current = null;
      }
    },
    [endpoint, messages, page, status],
  );

  const reset = useCallback(() => {
    stop();
    setMessages([]);
    setError(null);
  }, [stop]);

  return { messages, status, error, send, stop, reset };
}
