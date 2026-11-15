import type { ChatWireEvent } from "../brain/emotionStream";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Streams NDJSON events from the chat endpoint. Works with any backend that
 * speaks the same wire format (see `ChatWireEvent`).
 */
export async function* streamChat(
  messages: ChatMessage[],
  { signal, page, endpoint = "/api/chat" }: { signal?: AbortSignal; page?: string; endpoint?: string } = {},
): AsyncGenerator<ChatWireEvent> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, page }),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* not JSON */
    }
    yield { type: "error", message, code: String(res.status) };
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        yield JSON.parse(line) as ChatWireEvent;
      } catch {
        /* ignore malformed line */
      }
    }
  }
  if (buf.trim()) {
    try {
      yield JSON.parse(buf) as ChatWireEvent;
    } catch {
      /* ignore */
    }
  }
}
