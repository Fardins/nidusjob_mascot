# Plan 01 — Nidus Mascot: Production-Ready AI Assistant Character

> Source spec: `.claude/specs/01_modification.md`.

## Context

The spec turns the current hero-page mascot into a polished, production-grade AI assistant: natural layered animation, a rich face, premium look, a behavior state machine, a public API, and a working chat. It also covers accessibility, fallbacks and tests.

**Decisions already made:**
- **Procedural mascot first.** Every feature ships on the code-built mascot (`Mascot.tsx` + `useMascotBrain.ts` + `parts/*`), which is what renders today. The brain becomes three.js-free and renderer-agnostic, so a future rigged `plush.glb` plugs into the same layers.
- **Full AI stack.** An accessible chat panel, plus a Next.js route that streams from the Claude API with emotion tags, plus the `useMascotAssistant` hook.
- **Whole spec, in 6 phases.** Phases 1–2 are planned in the most detail. Every phase ends at a merge point.

**What the code looks like today (it differs from the spec's assumptions):**
- There are **two independent renderers**:
  - Procedural: `useMascotBrain.ts`, a 336-line monolithic `useFrame`.
  - Plush/GLB: `plush/useLocomotionBrain.ts`, `useFacial.ts` and `useLookAt.ts`. This one is used only if `/models/plush.glb` exists, which is checked by a HEAD request in `plush/quality.ts`.
- `public/models/nidus-mascot.glb` is a **static, unrigged export** of the procedural model (`ExportBridge.tsx`). Pointing `PLUSH_MODEL_URL` at it would replace the rigged character with a frozen one. The spec's §0 "reconcile the path" item therefore becomes "make it explicit", not "repoint".
- `store.ts` is a tiny external store with `expression`, `reaction`, `message`, `attention`, `lastInteraction` and `hovered`. `Hero.tsx` drives it directly.
- Reusable pieces already exist:
  - `CritSpring`, `CritSpring2` and `DelayLine2` in `plush/physics/springs.ts`.
  - The `Spring` class in `useMascotBrain.ts`.
  - `JiggleSystem` in `plush/physics/jiggle.ts`.
  - `CatchLights`, the fur shader, `useQualityTier`, `prefetchWithProgress`, and `readAudioVisemes` in `lipSync.ts` (already three.js-free).
- The repo has **no test runner, no lint config, no chat UI, no API routes, and no postprocessing package**. The stack is Next 15, React 19, R3F 9, drei 10, three 0.187, framer-motion and Tailwind 3.

---

## Target architecture

```
components/mascot/
  brain/            ← three.js-free. Unit-tested. Safe in the main bundle.
    machine.ts        assistantState machine: queue, priority, min-hold, enter/loop/exit phases
    emotion.ts        valence/arousal ↔ named expressions, blending, user-tone damping
    expressionsDef.ts the 21 expressions from §6 (face params + body/antenna/logo/idle overrides)
    behaviors.ts      idle-variation scheduler (weighted random + cooldown), sleep stages
    profiles.ts       route → behavior profile (greeting, energy, placement, allowed reactions)
    rng.ts            seedable PRNG (mulberry32). Every Math.random() goes through it (deterministic tests)
    api.ts            the public `mascot` object + event emitter (wraps the store)
    emotionStream.ts  parser for the inline emotion-tag protocol (shared by server and client)
  animation/        ← per-frame, no React renders, no allocations in useFrame
    springs.ts        moved from plush/physics/springs.ts and shared by both renderers
    noise.ts          small 1D value/simplex noise (no dependency)
    layers/           base, breathing, float, headNoise, lookAt, blink, facial, gestures, secondary
    compose.ts        runs the layers in order into a `Pose` struct (additive, never cancelling)
    proceduralRig.ts  applies a Pose to the procedural Rig (today's tail end of useMascotBrain)
  render/           materials, lighting, post-FX, hologram/particle FX, camera rig
  chat/             ChatPanel.tsx, useMascotAssistant.ts, transport.ts
  plush/            unchanged for now. Later it consumes brain/ + animation/ through a plushRig adapter
app/api/chat/route.ts   Claude streaming endpoint
```

Dependencies only point one way: `brain` ← `animation` ← `render`. Rule: `brain/*` may not import `three`. A lint rule (`no-restricted-imports`) or a vitest check enforces this.

---

## Phase 0 — Tooling (small, do first)

- Add `vitest` with `test` / `test:watch` scripts, `eslint` + `eslint-config-next` with a `lint` script, and a `typecheck` script (`tsc --noEmit`).
- Add `brain/rng.ts`. Replace `Math.random()` in new code with it. `?seed=123` in the URL fixes the seed (used for visual tests).
- Before installing, check current package versions and APIs with Context7: `@react-three/postprocessing`, `leva`, `@anthropic-ai/sdk`, `@playwright/test`.

## Phase 1 — Foundation (§9.1, §7.1–7.2)

1. **Model path (§0 note)**
   - Rename `PLUSH_MODEL_URL` handling so the intent is explicit. Add a `MODEL_ASSETS` map in `plush/rigConfig.ts` with `rigged: "/models/plush.glb"` and `staticExport: "/models/nidus-mascot.glb"`.
   - Add a comment, and a README fix, saying that `nidus-mascot.glb` is a Blender/export artifact and is never loaded as the live character.
   - Optionally add a `?mascot=procedural|plush` override for development.
2. **State machine (`brain/machine.ts`)**
   - States: `offscreen, welcome, idle, listening, thinking, speaking, success, confused, error, drowsy, sleeping, waking, goodbye`.
   - Each state is `{ enter, loop, exit }` with durations, a priority (`error > user > speaking > idle`), a minimum hold of about 0.8 s, and an `interruptible` flag.
   - A pure `step(state, event, now)` function returns `{ next, effects[] }`. Effects are things like `setExpression`, `trigger`, `say` and `fx`. This keeps the machine testable without timers.
   - Escalation: `thinking` lasting more than 4 s emits `{fx: "progressRing"}` and the `tapWrist` gesture.
3. **Store extension (`store.ts`)**
   - Add `assistantState`, `phase` (`enter|loop|exit`), `emotion {valence, arousal}`, `gesture`, `speech {visemes?, amplitude}`, `fx[]` and `placement`.
   - Keep every existing method signature, because `Hero.tsx` and the README depend on them.
   - `store.ts` becomes the transport. The machine owns the logic.
4. **Public API (`brain/api.ts`, exported from `index.ts`)**
   - `mascot.setState`, `react`, `setEmotion`, `speak`, `lookAt(element|{x,y}|null)`, `say`, `on/off("click"|"stateChange"|...)`.
   - `lookAt(element)` re-reads the element's rect every frame through a stored element ref, not a one-shot rect as `lookAtElement` does today. `lookAtElement` stays as an alias.
   - The API and its types are three.js-free, so importing `mascot` doesn't pull in the 3D chunk.
5. **Animation layering refactor**
   - Split `useMascotBrain.ts` into `animation/layers/*` that write into a reusable `Pose` object: root transform, body scale, head rotation, eye, lid, brow, mouth, arm, antenna, tassel, and material scalars.
   - `compose.ts` sums the additive layers on top of the base layer. `proceduralRig.ts` applies the result.
   - **Acceptance:** visual parity with today. Compare side-by-side screenshots at a fixed seed before and after.
   - Replace the inline `Spring` with the shared `CritSpring`.
6. **Expression schema** (`expressions.ts` → `brain/expressionsDef.ts`)
   - Extend `ExpressionParams` with per-feature fields (brow inner/mid/outer per side, `lidUpperL/R`, `lidLowerL/R`, `cheekPuff`, `noseScrunch`, `mouthSkew`, `jawOpen`) plus overrides: `bodyLean`, `breathRate`, `blinkRate`, `antennaMode`, `logoMode`, `idleEnergy`.
   - Add **per-feature blend timing**: brows lead by 80–120 ms, then eyes, then mouth, then cheeks. This uses a per-group `DelayLine` plus a damping rate.
   - Keep the six old names as aliases, so `EXPRESSION_NAMES` and `Hero.tsx` chips still work.

**Merge point:** behavior unchanged; tests pass for the machine, rng and emotion basics.

## Phase 2 — Natural motion (§1)

All items are additive layers in `animation/layers/`. Each one reads a `ctx` (dt, the emotion's `breathRate`/`blinkRate`, `motionScale`, state) and writes into the `Pose`.

| Spec | Layer / file | Key details |
| --- | --- | --- |
| 1.1 Breathing | `breathing.ts` | Per-breath period 3–5 s ±15%. Inhale is 40% of the cycle, exhale 60%. Chest +1–2%, shoulders lift, head follows ~120 ms later through a delay line. Rate comes from the emotion. Surprised = hold. |
| 1.2 Blink | `blink.ts` | 2–6 s interval, 15% double blink. Close 70 ms, open 130 ms. Blink when the gaze shifts more than 0.5 normalized. Rate varies by state. The lid follows the pupil's pitch (the existing `ey*0.25` term is upgraded). |
| 1.3 Eye tracking | `lookAt.ts` | Keep the eyes → head → neck/spine lead order. Add micro-saccades while fixating, smooth pursuit when the cursor is slow, a glance-around routine on `pointerleave` of `document`, convergence when the cursor is near the canvas center, and touch handling: last tap, then the focused input (`focusin`), then drift. |
| 1.4 Head noise | `headNoise.ts` | `noise.ts` with incommensurate frequencies per axis (e.g. 0.13 / 0.17 / 0.11 Hz), ≤2.5°. |
| 1.5 Float | `float.ts` | ±3% height, 4–6 s period, phase-offset roll. Exposes `floatHeight` so `ContactShadows` can scale its opacity and size. |
| 1.6 Antenna | `secondary.ts` | Keeps the existing springs. Adds an idle sway, a `twitch()` impulse on hover or a new message, and a glow mode driven by state (Phase 5 renders it). |
| 1.7 Gestures | `gestures.ts` + `brain/gestures.ts` | Procedural arm/hand pose library of 10: openPalm, pointSide, count, shrug, pinch, bigIdea, chinTouch, beat, tapWrist, wave. The brain picks one (question → openPalm, list → count, emphasis → beat) and never repeats the previous one. 0.3–0.5 s crossfade. Beat gestures fire on lip-sync amplitude peaks. The procedural arms may need an elbow joint (`parts/Body.tsx`: split each arm into upper and fore groups, add a hand group). |
| 1.8 Head tilt | `brain/behaviors.ts` → `curious` overlay | 8–15° tilt, random side, held 0.6–1.2 s. Triggered by typing a `?`, a long hover, or a low-confidence reply. |
| 1.9 Jump | `reactions/jump.ts` | Anticipation squash → stretch → tuck → land squash → secondary bounce → settle. Variants: hop, double hop, spin-jump, picked through rng. Arms swing up, antenna impulse, "^ ^" eyes. |
| 1.10 Sleep | machine states `drowsy` (45 s), `sleeping` (90 s), `waking` | Drowsy: heavy lids, slow blinks, a yawn, nods. Asleep: closed eyes, deep breathing, sink, antenna droop and dim, Z particles (Phase 5). Wake: startle → rapid blinks → stretch → neutral. |
| 1.11 Idle variations | `brain/behaviors.ts` | Weighted pool with cooldowns: lookAround, stretch, yawn, scratchHead, adjustGlasses, straightenCap, tapWrist, humSway, lookAndSmile. Starts after `IDLE_ROUTINE_AFTER` (8 s); a 20 s threshold is configurable per profile. |

The tassel becomes a 4-segment spring chain (`animation/chain.ts`, reusing `CritSpring2`). This replaces the single `tasselZ`/`tasselX` pair.

**Merge point:** a reviewer can watch 2 minutes of idle, then sleep, then wake, and see no loops and no snapping.

## Phase 3 — Face (§2, §6)

- **Eyes (`parts/Eye.tsx`, `render/eyeMaterial.ts`):** an `onBeforeCompile` iris shader with radial fibers, gradient and limbal ring. Pupil dilation is driven by arousal and scene brightness. A cornea dome with a physical material samples the env map. A wet line on the lower lid. Two highlights (big/soft and small/sharp) that stay fixed relative to the light: counter-rotate them against `eye.ball` rotation, or reuse the `CatchLights` approach from `plush/CatchLights.ts`.
- **Lids:** keep the spherical-cap lids, which already wrap the eye. Split left and right upper/lower values. Add optional lash cards (alpha plane strip), on by default on `high` and `medium`.
- **Brows:** turn each brow into 3 control points. Replace the single torus segment in `parts/Face.tsx` with a `TubeGeometry` along a CatmullRom curve whose control points are updated in place (fixed vertex count, no allocations). Brow flash on greet or recognition.
- **Mouth:** extend `smile`/`mouthOpen` with `skew`, `pucker`, `press` and a corrective blend so smile + jaw-open never breaks. Add cheek puff, nose scrunch and blush driven by emotion.
- **Micro-expressions:** a facial noise layer gives smile twitches, brief squints and lip movements during idle.
- **New expressions:** listening, explaining, speaking, laughing, winking, celebrating, confused, error, sad, sleeping, welcome, goodbye, shy. Each one has face params, a body overlay, antenna/logo modes and idle overrides. Also add matching `EXPRESSION_MORPHS` entries in `plush/rigConfig.ts` (ARKit names) so the plush path stays in step.

## Phase 4 — AI integration (§7)

1. **`app/api/chat/route.ts`** (Node runtime, server-only `ANTHROPIC_API_KEY`)
   - `@anthropic-ai/sdk`, `client.beta.messages.stream(...)`, model `claude-opus-5-5`, `output_config: { effort: "low" }` (chat), `max_tokens` around 2000.
   - Server-side refusal fallback: `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`. Check `stop_reason === "refusal"` and map it to the `error` state.
   - The system prompt is the **personality bible** (§7.3.8). It lives in a shared file that the animation side also reads.
   - **Emotion protocol:** the model prefixes each sentence with an inline tag `⟦emotion:excited:0.7⟧` and may emit `⟦state:confused⟧` when its confidence is low. The route parses the text stream with `brain/emotionStream.ts`, which is tolerant of tags split across chunks, and streams NDJSON events to the client: `{type:"emotion"|"text"|"state"|"done"|"error"}`.
   - Basic input limits: message length, history cap, and a simple per-IP rate limit.
2. **`chat/ChatPanel.tsx`:** an accessible dialog. Focus trap, `aria-live="polite"` for the streaming reply, Esc closes it, and the open choice is remembered. It opens on a mascot click or Enter/Space on the focused mascot. Input `focus` sends `listening`, `input` events send typing glances and nods, submit sends `thinking`.
3. **`chat/useMascotAssistant.ts`:** consumes the NDJSON stream. The first text moves the mascot to `speaking`. Emotion events go to `mascot.setEmotion` per sentence. Text is fed to the gesture picker, which looks at punctuation and lists. `done` goes to `success` or `idle`. Errors and timeouts (20 s) go to `error` plus an apology line.
4. **Lip sync (§7.3.3):** add a `visemes.ts` with the 15 Oculus visemes and a coarticulation smoother. Inputs are, in priority order:
   - a timestamped viseme or word timeline (Azure, ElevenLabs alignment) passed to `mascot.speak({visemes})`;
   - `readAudioVisemes()`;
   - a text-driven estimate from the streamed characters (a crude grapheme → viseme mapping) when there is no audio.

   Jaw, lips and tongue are separate channels. Emotion is overlaid on top.
5. **Scroll awareness:** a `scroll` listener feeds velocity into `Pose` root lag/wobble and the gaze direction, then settles with overshoot.
6. **Context profiles:** `brain/profiles.ts` maps a route to a profile, read through `usePathname`. Ship profiles for home, pricing, docs, checkout and 404.
7. **Petting:** pointer drag over the mascot (as distinct from drag-to-spin when the motion is mostly horizontal) produces a ripple, a giggle and blush. More than 5 clicks within 2 s makes it dizzy (spiral-eye texture swap, then recover).
8. **Time and memory:** morning and night greetings, plus `localStorage` (gated by consent, wrapped in try/catch) for "Welcome back".
9. **Speech-to-text (optional):** if the Web Speech API exists, a mic button sets `listening` with a pulsing glow and nods at pauses.

## Phase 5 — Look (§3–§5)

- **Materials (`render/` / `materials.ts`):** `MeshPhysicalMaterial` skin with sheen, warm zones and a procedural micro-normal. Wrap-lighting SSS via `onBeforeCompile` (ears, antenna tip, fingers), falling back to plain wrap lighting on `low`/`mobile`. Lens material with `transmission:1`, `ior:1.5`, clearcoat and `iridescence`, plus a glint sweep uniform. Fabric normal + sheen on the outfit, felt on the cap, and stitch lines.
- **Accessories:** an emissive antenna whose mode is a state → color/pulse table, with every blink kept at ≤3 Hz (WCAG). A chest logo as an SDF shader plane (shimmer, loading ring, equalizer, checkmark). A wrist device as a new part with a canvas-texture screen. A hologram material (scanlines, Fresnel, flicker, chromatic offset) for icons, the progress ring, the "!" and "?" glyphs, and particles (sparkles, confetti, Z, ?). All are pooled instances.
- **Lighting and post:** a three-point rig whose mood is lerped by state. Add `@react-three/postprocessing`: N8AO on medium/high, selective bloom on emissive layers, a vignette and light grain, DOF only in hero mode on high, and AgX tone mapping. Keep the existing `Environment` + `Lightformer` setup and add a warm ground bounce. `ContactShadows` is coupled to `floatHeight`. `SoftShadows` (PCSS) on high only.
- **Camera (`Effects.tsx` `ResponsiveCamera`):** subtle breathing and mouse parallax, push-in when speaking, pull-out when celebrating, and framing presets for hero, chat and widget.

## Phase 6 — Production (§8)

- **Performance:** a `frameloop="demand"` + invalidate strategy, or keep `"never"` when off-screen plus `visibilitychange`. Budgets per tier come from §8.2. Shell, post-FX and lash toggles are tied to `quality`. A bundle check runs `next build` and records the size of the canvas chunk.
- **Fallbacks:**
  - A static poster image, rendered once from the procedural model and saved to `public/`, used when WebGL is unavailable or the context is lost.
  - `webglcontextlost`/`restored` handlers in `MascotCanvas`.
  - Generalize `PlushErrorBoundary` into a `CanvasErrorBoundary` that wraps the whole canvas.
  - The chat works without 3D.
- **Accessibility:**
  - Reduced motion: no float, jump or camera motion, and slower expression blends.
  - The canvas gets `aria-hidden`, plus a focusable button overlay with a visible focus ring.
  - A minimize/hide toggle, remembered across visits.
  - Captions for voice.
- **Placement modes:** hero, docked (bottom-right with a safe-area inset), and minimized (face bubble). The mascot moves between them with framer-motion layout animations and stays clear of a focused input or an open modal.
- **Developer experience:**
  - A `leva` debug panel (dev only, dynamic import).
  - A `/showcase` page listing every expression, reaction and state.
  - Unit tests: machine transitions, priority and hold; emotion mapping; tag parser; idle scheduler cooldowns.
  - Playwright visual snapshots of each expression at `?seed=1&freeze=1`.
- **Telemetry (privacy-safe, behind a no-op adapter by default):** tier, load time, WebGL failures, and chat opens triggered by a mascot click.
- **Audio:** a small sound set, off by default, enabled after the first interaction, with a mute toggle.

**Out of code scope** (needs an artist or asset work; tracked, not built here): the Blender re-topology, a rigged `plush.glb`, baked AO/light maps, 3 LODs, KTX2 texture atlases, and `gltf-validator` in CI. CI validation is added only once a rigged asset exists.

---

## Critical files

- **Modified:** `components/mascot/store.ts`, `index.ts`, `useMascotBrain.ts` (becomes a thin orchestrator), `expressions.ts`, `Mascot.tsx`, `parts/{Eye,Face,Body,Accessories}.tsx`, `materials.ts`, `MascotCanvas.tsx`, `MascotStage.tsx`, `Effects.tsx`, `plush/rigConfig.ts`, `plush/physics/springs.ts` (moved), `components/hero/Hero.tsx`, `README.md`, `package.json`.
- **New:** `components/mascot/brain/*`, `animation/*`, `render/*`, `chat/*`, `app/api/chat/route.ts`, `app/showcase/page.tsx`, `vitest.config.ts`, `playwright.config.ts`, `.env.example` (`ANTHROPIC_API_KEY=`).

## Verification

- **After every phase:** `npm run typecheck && npm run lint && npm test && npm run build`.
- **Phase 1:** run `npm run dev`. Check that the hero looks and behaves the same as before (screenshots side by side at `?seed=1`). In the browser console, call `mascot.setState("thinking")` and confirm the transition is smooth and the face doesn't flicker.
- **Phase 2:** leave the page idle and confirm idle variations, then drowsy at about 45 s, sleeping at about 90 s, then click and watch the wake sequence. Throttle the CPU in DevTools and confirm no hitches and no GC spikes in the Performance panel.
- **Phase 4:** with `ANTHROPIC_API_KEY` set, ask a question and confirm listening → thinking → speaking with per-sentence emotion → success. Kill the network mid-stream and confirm the error state plus an apology. A unit test feeds the tag parser chunk splits.
- **Phase 5–6:** Lighthouse/a11y pass. Reduced-motion emulation. A keyboard-only run (Tab to the mascot, Enter opens the chat). Disable WebGL (`--disable-webgl`) and confirm the poster and the chat still work. Playwright visual tests pass. Check FPS per tier with the leva panel.
