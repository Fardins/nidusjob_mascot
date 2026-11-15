/**
 * Inline tag protocol shared by the chat API route and the client.
 *
 * The LLM prefixes sentences with tags such as `⟦emotion:excited:0.7⟧` and may
 * emit `⟦state:confused⟧` / `⟦state:success⟧`. Tags can be split across
 * stream chunks, so the parser buffers from `⟦` until `⟧`.
 */

export const TAG_OPEN = "⟦";
export const TAG_CLOSE = "⟧";
const MAX_TAG = 48;

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "emotion"; name: string; intensity: number }
  | { type: "state"; state: "confused" | "success" };

export class TagStreamParser {
  private buf = "";

  push(chunk: string): StreamEvent[] {
    this.buf += chunk;
    return this.drain(false);
  }

  /** Call once at the end of the stream. */
  flush(): StreamEvent[] {
    return this.drain(true);
  }

  private drain(final: boolean): StreamEvent[] {
    const out: StreamEvent[] = [];
    let text = "";
    while (this.buf.length) {
      const open = this.buf.indexOf(TAG_OPEN);
      if (open < 0) {
        text += this.buf;
        this.buf = "";
        break;
      }
      text += this.buf.slice(0, open);
      this.buf = this.buf.slice(open);
      const close = this.buf.indexOf(TAG_CLOSE);
      if (close < 0) {
        if (!final && this.buf.length < MAX_TAG) break; // wait for the rest of the tag
        // Not a real tag: emit the opener as text and continue.
        text += this.buf[0];
        this.buf = this.buf.slice(1);
        continue;
      }
      const ev = parseTag(this.buf.slice(1, close));
      if (ev) {
        if (text) out.push({ type: "text", text });
        text = "";
        out.push(ev);
      }
      this.buf = this.buf.slice(close + 1);
    }
    if (text) out.push({ type: "text", text });
    return mergeText(out);
  }
}

function parseTag(body: string): StreamEvent | null {
  const [kind, a, b] = body.split(":").map((s) => s.trim());
  if (kind === "emotion" && a) {
    const intensity = b === undefined ? 0.7 : Number(b);
    return { type: "emotion", name: a.toLowerCase(), intensity: Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0.7 };
  }
  if (kind === "state" && (a === "confused" || a === "success")) return { type: "state", state: a };
  return null; // unknown tags are dropped silently
}

function mergeText(evs: StreamEvent[]): StreamEvent[] {
  const out: StreamEvent[] = [];
  for (const e of evs) {
    const prev = out[out.length - 1];
    if (e.type === "text" && prev?.type === "text") prev.text += e.text;
    else out.push(e);
  }
  return out;
}

/** Removes any tags from a finished string (e.g. for display or history). */
export function stripTags(s: string) {
  return s.replace(/⟦[^⟧]{0,48}⟧/g, "");
}

/* ----------------------------------------------------------- wire format */

/** NDJSON events sent from /api/chat to the browser. */
export type ChatWireEvent =
  | StreamEvent
  | { type: "done"; stopReason?: string | null }
  | { type: "error"; message: string; code?: string };
