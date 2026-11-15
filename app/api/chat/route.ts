import Anthropic from "@anthropic-ai/sdk";
import { TagStreamParser, type ChatWireEvent } from "@/components/mascot/brain/emotionStream";
import { buildSystemPrompt } from "@/components/mascot/brain/personality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-opus-5-5";
const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;
const PAGES = new Set(["home", "pricing", "docs", "checkout", "notFound"]);

/* ---------------------------------------------- tiny in-memory rate limit */
const hits = new Map<string, number[]>();
function limited(ip: string, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

interface Body {
  messages?: { role?: string; content?: unknown }[];
  page?: string;
}

function json(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return json(503, "The assistant isn't configured yet (missing ANTHROPIC_API_KEY).");
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return json(429, "Too many messages — please wait a moment.");

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, "Invalid JSON.");
  }

  const messages: Anthropic.MessageParam[] = (body.messages ?? [])
    .slice(-MAX_MESSAGES)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role as "user" | "assistant", content: (m.content as string).slice(0, MAX_CHARS) }));
  // the conversation must start with a user turn
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return json(400, "Expected a user message.");

  const page = body.page && PAGES.has(body.page) ? body.page : "home";
  const client = new Anthropic();
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatWireEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      const parser = new TagStreamParser();
      try {
        const s = client.beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 2000,
            // Server-side refusal fallback: a declined request is retried on the fallback model in the same call.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            // Chat replies are short; low effort keeps latency down.
            output_config: { effort: "low" },
            system: [{ type: "text", text: buildSystemPrompt(page), cache_control: { type: "ephemeral" } }],
            messages,
          },
          { signal: req.signal },
        );
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            for (const ev of parser.push(event.delta.text)) send(ev);
          }
        }
        for (const ev of parser.flush()) send(ev);
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") {
          send({ type: "error", message: "I can't help with that one, sorry.", code: "refusal" });
        } else send({ type: "done", stopReason: final.stop_reason });
      } catch (err) {
        if (req.signal.aborted) return controller.close();
        let message = "The assistant is unavailable right now.";
        if (err instanceof Anthropic.RateLimitError) message = "I'm getting a lot of questions — try again in a moment.";
        else if (err instanceof Anthropic.AuthenticationError) message = "The assistant's API key is invalid.";
        else if (err instanceof Anthropic.APIError) message = `The assistant hit an error (${err.status ?? "network"}).`;
        console.error("[api/chat]", err);
        send({ type: "error", message });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
