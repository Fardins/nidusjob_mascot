# Nidus — Interactive 3D AI Assistant Mascot

Nidus is a real-time 3D character that lives on the website and works as its AI assistant. Built with **Next.js 15**, **React 19**, **React Three Fiber** and **Claude**.

The character is fully procedural (no rigged model required). It breathes, blinks, follows the cursor, reacts to clicks and scrolling, and falls asleep when left alone. When a visitor chats with it, the character listens, thinks, speaks with lip sync, and changes its face to match the emotion of each sentence in the AI's reply.

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Using the mascot](#using-the-mascot)
- [Public API](#public-api)
- [Chat backend](#chat-backend)
- [Behavior model](#behavior-model)
- [Customization](#customization)
- [Debugging and URL flags](#debugging-and-url-flags)
- [Performance](#performance)
- [Accessibility](#accessibility)
- [Testing](#testing)
- [3D models (GLB)](#3d-models-glb)
- [Deployment notes](#deployment-notes)
- [Troubleshooting](#troubleshooting)

---

## Features

**Character and animation**
- Layered, natural motion: breathing, blinking, gentle floating, head drift, micro-expressions and antenna/tassel physics. Every value blends through springs, so nothing snaps.
- **21 expressions**, including happy, curious, thinking, listening, explaining, laughing, winking, celebrating, confused, warning, sad, drowsy, sleeping, welcome, goodbye, shy and dizzy.
- **28 one-shot reactions** (jumps, wave, shrug, laugh, bow, celebrate, stretch, yawn, adjust glasses…) built as anticipation → action → follow-through → settle.
- **11 talking gestures**, chosen automatically from the sentence content and timed to stressed words.
- Eye tracking of the cursor, focused fields and page elements; reacts to scrolling.
- Glowing antenna, animated chest logo, smart wrist screen, hologram icons and particles (sparkles, confetti, "?", "!", "Z").

**AI assistant**
- Streaming chat powered by Claude through a Next.js route.
- Sentence-level emotion tags from the model drive the face, blended in a continuous valence/arousal space.
- Text-driven lip sync, or real audio / TTS viseme timelines when available.
- Behavior state machine: welcome, listening, thinking, speaking, success, confused, error, drowsy, sleeping, goodbye.
- Page-aware behavior profiles (home, pricing, docs, checkout, 404).

**Production**
- Lazy-loaded 3D bundle, automatic quality tiers, rendering paused when off-screen or in a hidden tab.
- Fallback to a static poster when WebGL fails or the context is lost. The chat keeps working.
- Reduced-motion support, keyboard access, screen-reader announcements, no flashing above 3 Hz.
- Unit tests, visual regression tests, and a privacy-safe telemetry hook.

---

## Quick start

**Requirements:** Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local     # then set ANTHROPIC_API_KEY
npm run dev
```

Open:
- http://localhost:3000 for the landing page with the live assistant.
- http://localhost:3000/showcase for every expression, reaction, state and emotion control.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | For chat | Claude API key used by `app/api/chat/route.ts`. Without it the character still works, but chat requests return a friendly `503` and the character shows its warning state. |

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Vitest unit tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright visual regression (run `npx playwright install chromium` once first) |

---

## Project structure

```
app/
  layout.tsx            Mounts one <MascotHost /> for the whole site
  page.tsx              Landing page (Hero)
  showcase/page.tsx     Interactive catalogue of expressions, reactions, states
  not-found.tsx         404 page (uses the "notFound" behavior profile)
  api/chat/route.ts     Streaming Claude endpoint (NDJSON)

components/
  hero/Hero.tsx         Landing hero with the <MascotSlot />
  mascot/
    index.ts            Public exports (three.js-free except the stage components)
    MascotHost.tsx      Site-wide host: placement modes, chat panel, route profiles
    MascotStage.tsx     Stand-alone canvas + speech bubble + fallbacks
    MascotCanvas.tsx    R3F canvas, lighting, camera, post FX
    store.ts            Tiny shared store (read per frame, no React re-renders)

    brain/              three.js-free logic (enforced by tests)
      api.ts              Public `mascot` API and behavior driver
      machine.ts          Assistant state machine
      expressions.ts      21 expression presets + metadata
      emotion.ts          Valence/arousal emotion space, user-tone detection
      emotionStream.ts    Parser for ⟦emotion⟧ / ⟦state⟧ tags in streamed text
      behaviors.ts        Idle scheduler, gesture picker, time-of-day, seasonal accessories
      visemes.ts          Text → viseme timeline, stress timing
      profiles.ts         Per-route behavior profiles
      personality.ts      System prompt / personality
      prefs.ts            Saved user preferences (placement, mute, visits)
      sound.ts            Synthesized sound effects
      telemetry.ts        Opt-in telemetry hook
      rng.ts              Seedable randomness + URL flags
      __tests__/          Unit tests

    animation/          Per-frame layers combined into one Pose
                        (facial blend, look-at, reactions, gestures, secondary motion, springs, noise)
    render/             Applies the pose to the meshes: brows, chest logo, antenna modes, wrist screen,
                        holograms, lighting, camera rig, post FX, fallback poster, debug stats
    chat/               ChatPanel (accessible UI), useMascotAssistant hook, NDJSON transport
    parts/              Procedural character parts: Eye, Face, Body, Accessories
    plush/              Optional renderer for a rigged, furry GLB model

e2e/                    Playwright visual regression tests
public/models/          GLB files
public/decoders/        Self-hosted Draco / Basis (KTX2) decoders
.claude/specs/          Design specs (see 01_modification.md for the feature roadmap)
```

**Layering rule:** `brain` (decisions) → `animation` (motion) → `render` (three.js). The `brain` folder must never import three.js. This keeps the API out of the 3D bundle and testable in Node, and `boundaries.test.ts` enforces it.

---

## Using the mascot

### Site-wide assistant (recommended)

`app/layout.tsx` mounts a single host for the whole site:

```tsx
import { MascotHost } from "@/components/mascot";

<body>
  {children}
  <MascotHost />
</body>
```

Then place a slot wherever the character should stand in "hero" mode:

```tsx
import { MascotSlot } from "@/components/mascot";

<MascotSlot className="aspect-square w-full" />
```

The host handles placement automatically:

| Placement | When |
| --- | --- |
| `hero` | A `MascotSlot` is visible. The character flies into it. |
| `docked` | The slot scrolls away or the chat opens. The character moves to a corner (bottom with safe-area inset on mobile). |
| `minimized` | The user minimizes it to a face bubble. |
| `hidden` | The user hides it. The choice is remembered. |

The character also moves aside from focused inputs and open modals.

### Stand-alone stage

For a single embedded scene without the host:

```tsx
import { MascotStage } from "@/components/mascot";

<MascotStage className="h-96" framing="hero" />
```

Main props:

| Prop | Default | Description |
| --- | --- | --- |
| `framing` | — | Camera preset: `hero`, `chat`, `widget`, `face` |
| `effects` | — | Glowing platform, orbs and particles |
| `post` | `false` | Post-processing (bloom, vignette, grain, AgX tone mapping, depth of field) |
| `background` | transparent | CSS background. Makes the canvas opaque and enables screen-space AO |
| `showSpeech` | `true` | Show the speech bubble |
| `speechAlign` | `"right"` | Bubble position: `right`, `left`, `center` |
| `focusable` | `true` | Keyboard-focusable overlay (Enter/Space opens chat) |
| `clickReactions` | built-in | Reactions picked when the character is clicked |

Post-processing is off by default because, on a transparent canvas, the composer drops the additive glow, and N8AO needs an opaque background. Use `<MascotStage post background="#fff" />` together.

---

## Public API

Everything below is three.js-free and safe to import anywhere.

```ts
import { mascot, useMascotAssistant } from "@/components/mascot";

// Behavior state
mascot.setState("listening");   // offscreen | welcome | idle | listening | thinking | speaking
                                // | success | confused | error | drowsy | sleeping | waking | goodbye

// One-shot reactions
mascot.react("celebrate");      // jump, hop, wave, shrug, laugh, wink, bow, dizzy, stretch, …

// Continuous emotion (blended between expression presets); null clears it
mascot.setEmotion({ valence: 0.6, arousal: 0.7 });

// Speech with lip sync and gestures
mascot.speak({ text: "Hello!" });
mascot.speak({ text, audio: audioEl });              // mouth follows real audio
mascot.speak({ text, audio: audioEl, visemes });     // or a TTS viseme timeline
// For streams: speak({ text, streaming: true }), then speakAppend(chunk) and speakEnd()

// Attention and speech bubble
mascot.lookAt(buttonElement);   // element, { x, y } in client px, or null
mascot.say("Welcome back!", { durationMs: 2500 });

// Events: click | stateChange | emotion | speakStart | speakEnd | chatToggle
const off = mascot.on("stateChange", ({ state, from }) => console.log(from, "→", state));
```

### Chat hook

`useMascotAssistant` connects a streaming chat to all of the above (listening → thinking → speaking → success / confused / error):

```tsx
const { messages, status, send, stop } = useMascotAssistant({
  endpoint: "/api/chat",   // optional; any backend that speaks the wire format below
  page: "pricing",         // optional; behavior profile sent to the backend
});
```

`ChatPanel` is the ready-made accessible chat UI built on this hook. `MascotHost` already includes it.

### Other exports

| Export | Purpose |
| --- | --- |
| `mascotStore`, `useMascot` | Low-level store. The legacy calls (`setExpression`, `trigger`, `say`, `lookAtElement`) still work. |
| `EXPRESSIONS`, `EXPRESSION_META`, `EXPRESSION_NAMES` | Expression presets and labels |
| `REACTION_NAMES`, `GESTURE_NAMES` | Lists of available reactions and gestures |
| `tagToEmotion`, `emotionToExpression` | Emotion mapping helpers |
| `profileForPath`, `PROFILES` | Route behavior profiles |
| `setMascotTelemetry` | Plug in analytics |
| `setMascotLipSyncAudio` | Drive the mouth from any playing `<audio>` / `<video>` element |
| `PALETTE` | Brand colors used by the character |

---

## Chat backend

`app/api/chat/route.ts` streams replies from Claude (`claude-opus-5-5`):

- Low effort setting for fast, short replies.
- The system prompt (personality + page context) is cached.
- Server-side refusal fallback; a refusal is shown to the user as a polite error.
- Input limits: last 20 messages, 4,000 characters per message.
- Rate limit: 20 requests per minute per IP (in memory).

### Emotion tags

The model starts each sentence with a tag such as `⟦emotion:excited:0.7⟧`, and may add `⟦state:confused⟧` or `⟦state:success⟧`. The route strips these tags out of the text and sends them as separate events.

### Wire format (NDJSON)

Response type `application/x-ndjson`, one JSON object per line:

```json
{"type":"emotion","name":"happy","intensity":0.7}
{"type":"text","text":"Sure! Here's how it works."}
{"type":"state","state":"success"}
{"type":"done","stopReason":"end_turn"}
{"type":"error","message":"The assistant is unavailable right now."}
```

Request body: `{ "messages": [{ "role": "user", "content": "…" }], "page": "home" }`.

Any backend that returns this format works with `useMascotAssistant({ endpoint })`.

---

## Behavior model

### States

```
offscreen → welcome → idle → listening → thinking → speaking → success | confused | error → idle
idle → drowsy (45 s inactive) → sleeping (90 s) → waking (on interaction) → idle
any → goodbye (tab hidden / exit intent)
```

- Each state has **enter**, **loop** and **exit** phases, so every transition is animated.
- States have a priority (error > user interaction > speaking > idle) and a minimum hold time, so the face never flickers.
- If thinking lasts longer than 4 s, it escalates (taps the wrist device, shows a progress hologram) so the wait feels alive.

### What triggers what

| Event | Character behavior |
| --- | --- |
| Visitor arrives | Welcome: brow flash, wave, greeting bubble |
| Clicks the character | Happy reaction, then opens the chat |
| Focuses / types in the chat | Listening: leans in, watches the text, nods |
| Sends a message | Thinking: chin touch, eyes up, loading logo |
| Reply streams in | Speaking: lip sync, gestures, emotion per sentence |
| AI is unsure | Confused: head tilt, shrug, "?" |
| Task done | Success: jump, sparkles |
| Error / timeout | Warning: amber antenna, "!" hologram |
| Rapid clicks | Dizzy: spiral eyes, then recovers |
| Long inactivity | Idle variations → drowsy → sleeping with "Z"s |
| Tab hidden | Goodbye wave |

The user's tone is detected too: if the user sounds frustrated, the character stays calm and empathetic instead of overly cheerful.

---

## Customization

| What | Where |
| --- | --- |
| Personality and system prompt | `components/mascot/brain/personality.ts` |
| Per-page behavior (greeting, energy, idle expression, allowed reactions, quiet mode) | `components/mascot/brain/profiles.ts` |
| Expression shapes and timing | `components/mascot/brain/expressions.ts` |
| Inactivity timings | `AssistantMachine` options in `components/mascot/brain/machine.ts` (`drowsyAfter`, `sleepAfter`) |
| Idle variations and gestures | `components/mascot/brain/behaviors.ts` |
| Colors | `components/mascot/palette.ts` |
| Model used by the chat route | `MODEL` in `app/api/chat/route.ts` |

### Telemetry

Telemetry is a no-op until you connect it. Events never contain message content or personal data.

```ts
import { setMascotTelemetry } from "@/components/mascot";

setMascotTelemetry((event) => analytics.track(event.name, event));
// quality_tier | load_time | webgl_failure | chat_open | fps_sample
```

---

## Debugging and URL flags

| Flag | Effect |
| --- | --- |
| `?debug` | Dev only: leva panel (states, expressions, reactions, emotion sliders, quality tier override) and FPS / draw-call stats |
| `?seed=1` | Makes all randomness deterministic (blinks, idle choices, gaze) |
| `?freeze` | Holds a deterministic pose, for screenshots |
| `/showcase?expr=happy` | Opens the showcase with an expression applied |
| `/showcase?state=thinking` | Opens the showcase in a given state |
| `?export-glb` | Enables GLB export of the procedural model (press **Shift+E**, or call `await window.__exportMascotGLB()`) |
| `?plush-debug` | Debug output for the rigged plush renderer |

---

## Performance

- three.js and the scene load **after first paint**. The public API does not pull in the 3D bundle.
- Rendering pauses when the canvas is off-screen or the tab is hidden.
- Quality tiers `high / medium / mobile / low` are picked from device hints and step down automatically when frame rate drops.
- No allocations inside frame loops.
- Post-processing and screen-space AO are opt-in (see [Stand-alone stage](#stand-alone-stage)).

---

## Accessibility

- `prefers-reduced-motion`: no floating, jumping, spinning or camera motion, and slower expression blends.
- Antenna and logo flashes stay at or below 3 Hz (WCAG 2.3.1).
- The canvas is `aria-hidden`. A focusable overlay opens the chat with Enter or Space.
- AI replies are announced once through a polite live region.
- WebGL failure, context loss or a render error falls back to a static poster (`public/mascot-poster.png` if present, otherwise a CSS face). The chat keeps working.
- Users can minimize or hide the assistant, and the choice is remembered.

---

## Testing

**Unit tests** (`npm test`, Vitest, in `components/mascot/brain/__tests__/`):
- State machine transitions, priorities and timings
- Emotion mapping and user-tone adjustment
- Emotion/state tag stream parser
- Idle scheduler and gesture picker
- Text → viseme conversion
- Module boundaries (`brain/` must stay three.js-free)

**Visual regression** (`npm run test:e2e`, Playwright, in `e2e/`):
- Screenshots of key expressions using `?seed=1&freeze` for deterministic output.
- Runs its own dev server on port 3123 and renders WebGL with SwiftShader, so no GPU is needed.
- After an intentional visual change, update the baselines with `npx playwright test --update-snapshots`.

Before opening a pull request, run:

```bash
npm run lint && npm run typecheck && npm test
```

---

## 3D models (GLB)

| File | Role |
| --- | --- |
| `public/models/nidus-mascot.glb` | **Static, unrigged export** of the procedural character, for Blender or other engines. It is never loaded as the live character. Regenerate it with `?export-glb` + Shift+E. |
| `public/models/plush.glb` (optional) | A **rigged** model. If present, the stage switches to the plush renderer (`components/mascot/plush/`) automatically. Bone, morph and clip names are configured in `plush/rigConfig.ts`. |

Draco and KTX2 (Basis) decoders are self-hosted in `public/decoders/`, so no CDN is needed.

---

## Deployment notes

- Set `ANTHROPIC_API_KEY` in your hosting provider's environment settings. Never expose it to the client.
- The chat route runs on the Node.js runtime and streams. Make sure your host or proxy does not buffer responses (the route already sends `x-accel-buffering: no`).
- The built-in rate limiter is **in memory and per instance**. On serverless or multi-instance hosting, replace it with a shared store (e.g. Redis) for a real limit.
- Add `public/mascot-poster.png` for a branded no-WebGL fallback.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Character shows the warning face and chat says it "isn't configured yet" | `ANTHROPIC_API_KEY` is missing in `.env.local`. Restart `npm run dev` after adding it. |
| Static poster instead of the 3D character | WebGL is disabled or failed. Check `chrome://gpu`, or try another browser. |
| Glow disappears when enabling `post` | Set an opaque `background` together with `post`. |
| Visual regression tests fail on a new machine | Run `npx playwright install chromium`. If the change is intended, update the snapshots. |
| Character looks low quality | It may have stepped down a quality tier. Open `?debug` to check and override the tier. |

---

## Tech stack

Next.js 15 · React 19 · TypeScript · three.js 0.187 · @react-three/fiber · @react-three/drei · @react-three/postprocessing · framer-motion · Tailwind CSS · Anthropic SDK · Vitest · Playwright · leva

## License

Private project. No license file is included, so all rights are reserved.
