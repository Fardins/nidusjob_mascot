# Spec 01 — Making the Nidus Mascot a World-Class, Production-Ready 3D Character

## 0. Purpose and principles

This spec lists every feature, enhancement and detail needed to take the current mascot (`components/mascot/*` and `components/mascot/plush/*`) to a polished, production-grade AI assistant character.

**Guiding rule (applies to everything below):** the animation must never feel robotic. Every movement uses natural easing, smooth transitions (blend, never snap), overlapping action (different body parts settle at different times) and subtle secondary motion. If a motion looks mechanical, make it smaller, slower, or offset it in time.

Concretely:

- Every parameter blends with critically damped springs (already the pattern in `expressions.ts`). No linear tweens, no instant switches.
- Use **layered animation**: base layer (idle/locomotion) + additive layers (breathing, look-at, gestures, facial). Layers never cancel each other out.
- Add **randomness everywhere**: blink timing, idle variation choice, gaze targets, breathing rate. No two cycles should be identical.
- Use **anticipation → action → follow-through → settle** for every one-shot reaction.
- Respect `prefers-reduced-motion` (already partly handled via `motionScale`).

### Current state (baseline)

| Area | What already exists |
| --- | --- |
| Expressions | `neutral`, `happy`, `curious`, `surprised`, `thinking`, `excited` (`expressions.ts`, `EXPRESSION_MORPHS` in `rigConfig.ts`) |
| Reactions | `jump`, `spin`, `wave`, `nod`, `shake`, `squash` (`store.ts`) |
| Look-at | Eyes, head, neck and spine weights, saccades (`useLookAt.ts`, `useFacial.ts`) |
| Lip sync | Loudness/spectrum-based viseme estimate (`lipSync.ts`) |
| Materials | Plush fur shader, catch lights (`FurMaterial.ts`, `CatchLights.ts`) |
| Physics | Springs, jiggle bones, balance (`plush/physics/*`) |
| Performance | Quality tiers `low / mobile / medium / high` + PerformanceMonitor (`quality.ts`) |
| Asset | `public/models/nidus-mascot.glb`, Draco/KTX2 decoders in `public/decoders/` |

Note: `rigConfig.ts` points at `/models/plush.glb`, but the asset on disk is `nidus-mascot.glb`. Reconcile this first.

---

## 1. Core idle and life animations

Each item: **what it does → how it should feel → implementation notes**.

1. **Idle breathing** — The chest and shoulders rise and fall naturally.
   - 3–5 s cycle with ±15% random variation per breath. Inhale is slightly shorter than exhale.
   - Additive layer: chest scale (~1–2%), shoulders lift slightly, head bobs a little after the chest (follow-through).
   - Breathing rate follows emotion: faster when excited or celebrating, slow and deep when sleeping, held briefly when surprised.
   - Use `BREATH_CLIP_NAMES` if the GLB has a clip. Otherwise drive it procedurally on the spine/chest bones.

2. **Natural eye blinking**
   - Random interval of 2–6 s, with an occasional double blink (~15% chance).
   - The blink is asymmetric in time: close in ~70 ms, open in ~120–150 ms.
   - Blink on large gaze shifts (people blink when they move their eyes far).
   - Blink rate follows emotion: more blinking when thinking or nervous, fewer blinks when focused or listening, slow heavy blinks when drowsy.
   - The upper lid follows the pupil's vertical position (lid follows gaze), so looking down partly lowers the lids.

3. **Eye tracking (mouse cursor follow)**
   - The eyes lead, then the head follows, then the neck and spine (already set up with `EYE_LEAD` and `LOOK_WEIGHTS`). Keep that order.
   - Add micro-saccades while fixating and smooth pursuit while the cursor moves slowly.
   - When the cursor leaves the window, glance around the room for a moment, then return to center.
   - Converge the eyes slightly (cross a little) when the cursor is very close to the character.
   - On touch devices with no cursor, follow the last tap and the focused input field, then drift back to idle looking.

4. **Subtle head movement**
   - Low-amplitude Perlin/simplex noise on head yaw, pitch and roll (≤2–3°), layered on top of look-at.
   - Use a different noise frequency on each axis so the motion never loops visibly.

5. **Body floating (slow hover)**
   - Gentle vertical float (±2–4% of character height, 4–6 s period) with a slight phase-offset rotation.
   - The shadow under the character scales and fades with height (contact-shadow coupling).
   - Antenna, ears and accessories lag behind the float (secondary motion through the jiggle bones).

6. **Antenna movement**
   - Spring-driven: reacts to head turns, floating and jumps with overshoot and settle.
   - Has its own idle sway, plus a quick "twitch" when the character notices something (new message, hover).
   - The tip glow is tied to state (see §4.1).

7. **Hand gestures while talking**
   - A library of 8–12 short gesture clips: open palm, point to the side, count on fingers, shrug, "small amount" pinch, both hands out ("big idea"), chin touch.
   - Picked automatically while speaking, weighted by sentence content (question → open palm, list → counting, emphasis → beat gesture).
   - Beat gestures land on stressed words or loudness peaks from the lip-sync analyser.
   - Never repeat the same gesture twice in a row. Blend in and out over 0.3–0.5 s (`CROSSFADE`).

8. **Head tilting (curiosity)**
   - Tilt 8–15° toward one side, with one eyebrow raised and the eyes slightly widened.
   - Triggered by: user typing a question, the cursor hovering for a long time, a confusing input.
   - Alternate the tilt side randomly. Hold for 0.6–1.2 s, then ease back.

9. **Happy animation (jump)**
   - Anticipation crouch (squash) → jump (stretch) → airborne tuck → landing squash → small secondary bounce → settle.
   - The arms swing up, the antenna whips, and the eyes do a happy squint ("^ ^").
   - Variants: small hop, double hop, spin-jump. Pick one at random so it never feels canned.

10. **Sleep animation (inactivity)**
    - Progressive stages instead of one switch:
      1. After ~20 s idle: idle variations (stretch, look around, fidget). `IDLE_ROUTINE_AFTER` is already 8 s.
      2. After ~45 s: drowsy, with heavy lids, slow blinks, a yawn and head nods.
      3. After ~90 s: asleep, with closed eyes, slow deep breathing, body sinking slightly, antenna drooping and dimmed, optional floating "Z" particles.
    - **Wake-up:** on any interaction, startle (small jump with wide eyes) → blink rapidly → stretch → return to neutral. Never snap from sleep to awake.

11. **Additional idle variations** (to avoid looking robotic)
    - Look around, stretch, yawn, scratch head, adjust glasses, straighten the graduation cap, tap the wrist device, small hum/sway, look at the user and smile.
    - Picked with weighted randomness plus a cooldown so none repeat too often.

---

## 2. Advanced facial design

1. **More detailed eyes**
   - Layered eye: sclera, iris with a radial fiber pattern and color gradient, a pupil that dilates (larger when excited or in dim light, smaller under bright light), and a limbal ring (dark iris edge).
   - A refractive cornea dome, or a parallax-mapped iris, for real depth.
   - Wet-line and tear-line highlight along the lower lid.

2. **Natural eyelids**
   - Lids wrap the eyeball's curvature. They are not flat planes.
   - Upper and lower lids move independently: happy squint raises the lower lid, a sleepy look lowers the upper lid.
   - Lids follow gaze (see §1.2).
   - Optional eyelashes as alpha cards. They are optional on a plush style, but they add a lot of charm.

3. **Eye reflections**
   - Keep the catch lights (`CatchLights.ts`) and add an environment reflection on the cornea (env-map sampled).
   - The catch light stays fixed relative to the light while the eye rotates. This sells "real eyes".
   - Two highlights: a large soft one and a small sharp one.

4. **Eyebrow movement**
   - Separate inner, middle and outer control per brow (already `browY`, `browTilt`, `browAsym`). Extend this to 3 points per brow for richer shapes.
   - Brows lead an expression change by ~80–120 ms, because the brows move first in real faces.
   - Quick brow flash (up-down in ~300 ms) on greeting or recognition.

5. **Smooth facial expressions**
   - Drive the face with ARKit-style blendshapes (already the convention in `EXPRESSION_MORPHS`). Aim for the full set of ~52, or at least 25–30 key shapes.
   - Expression transitions use per-feature timing (brows → eyes → mouth → cheeks), not one uniform blend.
   - Add **micro-expressions**: tiny smile twitches, brief squints, small mouth movements during idle.
   - Corrective blendshapes for combined extremes (smile + jaw open) to avoid broken mouth shapes.
   - Cheek puff, nose scrunch and blush intensity driven by emotion.

---

## 3. Premium materials

1. **Soft skin shader**
   - `MeshPhysicalMaterial` with `sheen` (soft velvet edge), low roughness variation and subtle color variation (warmer on the cheeks, nose and ears).
   - Painted or procedural micro-detail normal maps, so surfaces never look like flat plastic.

2. **Subsurface scattering**
   - Use `transmission` + `thickness`, or a custom SSS approximation (wrap lighting + thickness map), for the ears, antenna tip, fingers and nose.
   - Light visibly bleeds through thin parts when backlit (rim glow on the ears).
   - Fall back to wrap lighting only on the `low` and `mobile` tiers.

3. **Realistic glasses reflections**
   - Lens: `MeshPhysicalMaterial` with `transmission: 1`, `ior: 1.5`, thin thickness, clearcoat and env-map reflections.
   - Subtle Fresnel reflections plus an optional faint anti-reflective tint (blue/green hue at grazing angles via `iridescence`).
   - A slight refraction offset of the eyes behind the lens.
   - The frame gets a metallic or acetate material with edge highlights.
   - Animation: occasional glint sweep across the lens on "idea" or "smart" moments.

4. **Fabric texture on clothes**
   - Woven fabric normal map + `sheen` for cloth. Visible stitching and seams on the edges.
   - Different fabric types: cotton for the shirt, felt for the cap, knit for any scarf or hoodie.
   - Cloth secondary motion: hems and sleeves lag through jiggle bones (extend `JIGGLE_GROUPS`).

5. **Detailed graduation cap**
   - Mortarboard with a felt texture, a beveled board edge and a center button.
   - **Tassel physics**: a chain of 3–5 bones simulated with springs, swinging on head turns, jumps and floating.
   - Optional embroidered logo on the board top.
   - The tassel can be moved to the other side as a "graduation moment" celebration easter egg.

6. **Plush fur (existing)** — keep `FurMaterial.ts`, and add:
   - Fur direction (flow) maps so the fur combs naturally.
   - Fur reacts to velocity (already `velocity` in `CharacterState`) and to petting/clicking (a local ripple).
   - Fur density and shell count scale with the quality tier.

---

## 4. Signature accessories

1. **Glowing antenna**
   - Emissive tip with bloom. Color and pulse encode state:
     - Idle: soft brand-color breathing pulse.
     - Listening: steady bright glow.
     - Thinking: rotating or chasing light, faster pulse.
     - Speaking: flickers with voice amplitude.
     - Success: green flash. Error: amber/red blink.
     - Sleeping: very dim, slow pulse.
   - A point light from the tip lightly lights the face (cheap fake: an emissive term on nearby surfaces).

2. **Animated chest logo**
   - Emissive/shader-animated brand logo: idle shimmer, a loading ring while thinking, an equalizer while speaking, a checkmark morph on success.
   - Implement as a shader on a decal or plane (SDF logo for crisp edges at any zoom).

3. **Smart wrist device**
   - Small watch-like device with an animated screen (time, a pulse icon, notification count).
   - Used in gestures: the character glances at it while "processing", taps it to "open" tools, and shows it to the user when presenting a result.
   - Can project a small hologram (see next item).

4. **Small holographic details**
   - Hologram shader: scanlines, Fresnel edge glow, flicker, additive blending, slight chromatic offset.
   - Uses: floating icons while explaining (lightbulb, gear, chart), a progress ring around the character during long tasks, a hologram "card" previewing the answer topic, and a "!" warning glyph on error.
   - Particles: sparkles on success, confetti on celebrating, "Z"s while sleeping, "?" while confused.

---

## 5. Professional rendering

1. **Ambient occlusion**
   - Baked AO in the GLB (in creases, under the arms, around the eyes and glasses) as the base.
   - Plus screen-space AO (N8AO or SSAO via `@react-three/postprocessing`) on the `medium` and `high` tiers.

2. **Soft shadows**
   - `ContactShadows` or `AccumulativeShadows` from drei for the ground.
   - PCSS (`SoftShadows`) for self-shadowing on `high`.
   - The shadow reacts to float height (§1.5).

3. **Global illumination**
   - Image-based lighting with a custom studio HDRI (`Environment` with `Lightformer`s for full control).
   - Baked light/AO maps for static parts. Optional light probes.
   - Bounce light from the ground (a warm fill from below).

4. **Realistic reflections**
   - Env-map reflections on the glasses, eyes, wrist device and logo.
   - Optional `MeshReflectorMaterial` floor on the hero/landing page (`high` tier only).

5. **Cinematic lighting**
   - Three-point setup: key (warm, soft), fill (cool, low), rim/back (strong, for silhouette separation on the fur and ears).
   - The lighting mood changes with state: warmer when happy, cooler and dimmer when sleeping, a subtle amber tint on warning.
   - Post-processing stack: tone mapping (AgX or ACES), bloom (selective, emissive parts only), subtle vignette, very light film grain, and depth of field on the hero shot only.
   - Color management: sRGB output, linear workflow, consistent exposure across pages.

6. **Camera**
   - Subtle camera breathing and parallax on mouse move.
   - Gentle push-in on "speaking" and pull-out on "celebrating".
   - Framing presets: hero (full body), chat (bust), widget (head and shoulders).

---

## 6. Full expression set

Extend `ExpressionName` and `EXPRESSIONS` / `EXPRESSION_MORPHS` with the states below. Each expression defines face, body pose, antenna/logo state and idle overrides.

| Expression | Face | Body / extras |
| --- | --- | --- |
| **Listening** | Eyes on user, slightly wide, attentive brows, small nods | Lean forward, antenna steady glow, ear perk |
| **Thinking** (exists, refine) | Eyes up and to the side, lips pursed, one brow up | Hand on chin, chest logo loading ring, antenna chase light |
| **Explaining** | Open, engaged, eyebrows active | Talking gestures (§1.7), hologram icons |
| **Speaking** | Lip-sync visemes plus emotion overlay | Beat gestures, logo equalizer |
| **Excited** (exists, refine) | Wide eyes, big smile, raised brows | Bouncy idle, faster breathing, sparkles |
| **Laughing** | Eyes squeezed shut, wide open smile | Shoulders shake, head tilts back, belly bounce |
| **Winking** | One eye closes with the cheek raised, smirk | Small head tilt, optional finger-point |
| **Celebrating** | Joyful, eyes "^ ^" | Jump variant, arms up, confetti, cap toss/tassel flip |
| **Confused** | One brow up, mouth skewed, squint | Head tilt, shrug, "?" particle |
| **Error / Warning** | Worried brows, slight frown, wide eyes | Step back, antenna amber/red blink, "!" hologram |
| **Sad / Apologetic** | Inner brows up, eyes down, small frown | Shoulders drop, antenna droops |
| **Sleeping** | Eyes closed, mouth relaxed or slightly open | Slow breathing, sinking float, "Z"s |
| **Welcome / Greeting** | Brow flash, big smile | Wave, small hop |
| **Goodbye** | Warm smile, slight sadness | Wave, then a slow bow or fade |
| **Shy / Embarrassed** | Eyes away, blush up | Hands together, small sway |

**Automatic switching from AI responses:** expressions change based on the AI's state and the sentiment of the response (see §7). Each expression has a minimum hold time (~0.8 s) and a priority, so the face never flickers between states.

---

## 7. Intelligent AI interaction system

The character becomes the website's AI assistant. This needs a **behavior state machine** on top of the existing store.

### 7.1 Core state machine

Add `assistantState` to `MascotState` in `store.ts`:

`offscreen → welcome → idle → listening → thinking → speaking → (success | confused | error) → idle → drowsy → sleeping → goodbye`

| User / system event | Character behavior |
| --- | --- |
| User enters website | Welcome animation: peek in or pop up, brow flash, wave, greeting bubble |
| User clicks character | Happy bounce, then opens the AI chat panel. The character moves to the chat corner |
| User focuses the chat input | Listening: lean in, eyes on the input field |
| User is typing | Glances at the text as it grows, small nods |
| User submits a question | Thinking animation: chin touch, eyes up, logo loading, antenna chase |
| AI streams a response | Speaking animation: lip-sync, gestures, logo equalizer |
| AI doesn't understand / low confidence | Confused expression: head tilt, shrug, "?" |
| AI completes a task | Happy animation: jump, sparkles |
| AI encounters an error / timeout | Warning expression: amber antenna, "!" hologram, apologetic follow-up |
| User is idle for a long time | Idle variations → drowsy → sleeping |
| User returns after being idle | Wake-up sequence, then "Welcome back!" |
| User leaves (tab hidden / exit intent) | Goodbye animation: wave, small sad smile |

**Requirements**

- Transitions are queued and interruptible with priority: error > user interaction > speaking > idle.
- Every state has an enter animation, a looping body, and an exit animation, so every transition is smooth.
- Thinking that lasts longer than ~4 s escalates (taps the wrist device, a progress hologram) so the wait feels alive.

### 7.2 Public API (for the chat integration)

Expose a small, typed, framework-agnostic API from `components/mascot/index.ts`:

```ts
mascot.setState("listening" | "thinking" | "speaking" | "idle" | ...)
mascot.react("celebrate" | "nod" | "shrug" | ...)
mascot.setEmotion({ valence: -1..1, arousal: 0..1 })   // continuous emotion
mascot.speak({ text, audio?, visemes? })              // lip-sync + gestures
mascot.lookAt(element | {x, y} | null)
mascot.say(text, { durationMs })                      // speech bubble
mascot.on("click" | "stateChange", handler)
```

Also add a React hook (`useMascotAssistant`) that wires a streaming chat response to these calls automatically.

### 7.3 Advanced interactions

1. **Mouse tracking** — The character looks toward the cursor (extend §1.3). It looks at the active UI element when the AI references it (for example "click this button" → the character looks and points at it).

2. **Scroll awareness** — Head and eyes follow the scroll direction. On fast scrolling the body lags and wobbles (inertia). When scrolling stops it settles with overshoot. Optionally it "rides along" in a fixed corner and reacts to sections entering view.

3. **Voice interaction and mouth synchronization**
   - Upgrade `lipSync.ts` from loudness-based visemes to **phoneme-accurate visemes**:
     - With TTS that returns viseme or word timestamps (Azure TTS visemes, ElevenLabs alignment, etc.), use the timeline directly.
     - Fallback: the current analyser approach.
   - Map to ~15 visemes (Oculus/ARKit set: sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U) with coarticulation smoothing.
   - Jaw, lips and tongue are separate. Emotion overlays on top of the visemes (smiling while talking).
   - Speech-to-text input: the character shows listening ears and pulsing glow while the mic is active, and nods at pauses.

4. **Context awareness** — Behavior changes by page:
   - Home: welcoming and energetic.
   - Pricing: helpful, offers to explain.
   - Docs: calm, "explaining" pose, may wear the glasses lower.
   - Checkout/forms: quiet, out of the way, helps only on validation errors.
   - 404: confused or playful.
   - Configured via a route → behavior profile map (greeting text, idle energy, position, allowed reactions).

5. **Emotion awareness** — Sentiment of the AI response (and optionally the user message) drives the face:
   - Have the LLM return a structured emotion tag alongside the text (e.g. `{"emotion": "excited", "intensity": 0.7}`). This is cheaper and more reliable than a separate sentiment model.
   - Map it to the continuous valence/arousal space, so in-between emotions blend instead of jumping between presets.
   - Emotion can change per sentence during streaming (an emotion marker per chunk).
   - The user's tone influences the response: if the user is frustrated, the character becomes calm and empathetic, not overly cheerful.

6. **Petting and physical play** — Hover makes the character lean toward the cursor (exists). Click-and-drag tickles or pets the fur, which produces a ripple and a giggle. Rapid clicks make it dizzy (spiral eyes), then it recovers.

7. **Time awareness** — Morning greeting, a sleepy look late at night, optional seasonal accessories (hat, scarf) for holidays.

8. **Memory and personality** — Remembers returning visitors (local only, with consent): "Welcome back!". Has a consistent personality bible (curious, helpful, slightly playful) that the LLM system prompt and the animation choices share.

---

## 8. Production readiness

### 8.1 Asset pipeline

- Model in Blender with clean quad topology, proper edge loops around the eyes and mouth, and named bones matching `BONE_NAMES`.
- Export glTF with Draco or Meshopt geometry compression and KTX2/Basis textures (decoders are already in `public/decoders/`).
- Texture budget: 2K max on desktop, 1K on mobile. Use texture atlases, and pack ORM maps (occlusion/roughness/metal) into one texture.
- LODs: 3 levels (e.g. 40k / 15k / 5k triangles) chosen by the quality tier.
- An automated asset validation script (`gltf-transform inspect` / `gltf-validator`) runs in CI.
- Animation clips are named per `CLIP_NAMES`, with root motion removed and an additive breathing clip.

### 8.2 Performance budgets

| Tier | Target FPS | Draw calls | Triangles | Post-FX |
| --- | --- | --- | --- | --- |
| high | 60 | < 80 | ≤ 40k | AO, bloom, DOF, PCSS |
| medium | 60 | < 60 | ≤ 20k | AO, bloom |
| mobile | 30–60 | < 40 | ≤ 10k | bloom (half-res) |
| low | 30 | < 25 | ≤ 5k | none, static fallback allowed |

- Pause rendering when the tab is hidden or the canvas is off-screen (`frameloop="demand"` + IntersectionObserver).
- Lazy-load the 3D bundle after first paint. Show a static poster or Lottie placeholder first.
- Target: canvas bundle < 300 KB gzipped (excluding three.js), model < 2.5 MB.
- No allocations inside `useFrame` (reuse vectors, as `CharacterState` already does).

### 8.3 Fallbacks and robustness

- WebGL unavailable or context lost → a static image or video loop of the mascot with the same chat functionality.
- Handle `webglcontextlost` / `restored` events.
- An error boundary around the canvas so a 3D failure never breaks the page.
- Missing morphs or bones degrade gracefully (already the approach: "missing morphs are ignored").

### 8.4 Accessibility

- `prefers-reduced-motion`: no floating, jumping or camera motion. Expressions only, with slower transitions.
- The character is decorative to screen readers (`aria-hidden`). The chat panel and speech bubbles are real accessible DOM with `aria-live` for AI responses.
- Keyboard: the character can be focused with a visible focus ring. Enter/Space opens the chat.
- No flashing faster than 3 Hz (WCAG 2.3.1) on the antenna, logo or error blinks.
- Respect a user setting to minimize or hide the assistant, and remember it.
- Captions for any voice output.

### 8.5 Responsiveness and placement

- Modes: hero (large, centered), docked widget (corner, bust shot), minimized (bubble with the face only).
- Animated transitions between modes. On mobile, docked at the bottom with a safe-area inset.
- Never cover important UI. The character auto-moves away from focused inputs and modals.

### 8.6 Developer experience and quality

- **Debug panel** (dev only, via `leva`): trigger any expression or reaction, scrub emotion valence/arousal, toggle the quality tier, show FPS and draw calls.
- **Storybook / showcase page** listing every expression, reaction and state transition.
- **Tests:** unit tests for the state machine and emotion mapping, plus visual regression screenshots of key expressions (Playwright + a deterministic seed for randomness).
- **Telemetry** (privacy-safe): FPS tier distribution, load time, WebGL failures, chat-open rate from character clicks.
- Clean module boundaries: `brain` (state machine, emotion) ← `animation` (layers, blending) ← `render` (materials, lighting). The brain stays three.js-free so it can run in the main bundle and be tested in isolation.

### 8.7 Audio (optional but high-impact)

- Small sound set: pop on appear, a soft chime on success, a gentle "hmm" on thinking, a giggle on petting, a snore while sleeping.
- Off by default, enabled after the first user interaction (browser autoplay policy), with a mute toggle.

---

## 9. Suggested implementation order

1. **Foundation:** fix the model path mismatch, the state machine + public API (§7.1–7.2), and the animation layering system.
2. **Natural motion:** breathing, blinking, head noise, float, antenna and tassel physics, idle variations, the sleep sequence (§1).
3. **Face:** extended blendshapes, eyes, lids and brow timing, the new expressions (§2, §6).
4. **AI integration:** chat wiring, emotion tags from the LLM, streaming → speaking, phoneme lip-sync (§7.3).
5. **Look:** materials, accessories, hologram FX, lighting and post-processing (§3–§5).
6. **Production:** budgets, LODs, fallbacks, accessibility, tests, telemetry (§8).

## 10. Definition of done

- Every state in §7.1 has enter, loop and exit animations, with no visible snapping.
- Every expression in §6 can be triggered from the API and is reached automatically from AI responses.
- 60 FPS on a mid-range laptop and 30+ FPS on a mid-range phone, with automatic tier fallback.
- Works with reduced motion, keyboard only and a screen reader. Has a non-WebGL fallback.
- Visual regression tests pass for all expressions. Asset validation passes in CI.
