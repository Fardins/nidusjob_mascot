# Nidus — Interactive 3D AI Mascot (Next.js + React Three Fiber)

A real-time, fully procedural 3D character (no PNG/GIF/video) with idle life, cursor/touch tracking,
six expressions, click/tap reactions, drag-to-spin, speech bubbles, and a holographic platform.

```bash
npm install
npm run dev        # http://localhost:3000
```

## Drop it into your existing Next.js (App Router) project

1. Install the dependencies you don't already have:
   ```bash
   npm i three @react-three/fiber @react-three/drei framer-motion
   npm i -D @types/three
   ```
2. Copy `components/mascot/` into your project (any folder; the code uses only relative imports internally).
3. Add `transpilePackages: ["three"]` to `next.config` (optional, recommended).
4. Use it in any client component:
   ```tsx
   "use client";
   import { MascotStage } from "@/components/mascot";

   <MascotStage className="aspect-square w-full max-w-[32rem]" />
   ```
   `MascotStage` lazy-loads three.js on the client only (`next/dynamic`, `ssr: false`), shows a CSS
   placeholder, then fades in the live scene. The canvas is transparent, so it sits on your own background.

`components/hero/Hero.tsx` is a full reference hero (Tailwind) showing every integration hook.
The Tailwind tokens (`brand-*`, `ink`) live in `tailwind.config.ts`. Point them at your design system's colors.

## Controlling the mascot from anywhere

```ts
import { mascotStore, useMascot } from "@/components/mascot";

mascotStore.setExpression("excited", 3000);   // neutral | happy | curious | surprised | thinking | excited
mascotStore.trigger("wave");                  // jump | spin | wave | nod | shake | squash
mascotStore.say("Welcome back!");             // speech bubble (mouth animates while talking)
mascotStore.lookAtElement(buttonEl);          // look at a DOM element (e.g. CTA hover); null to release

const mood = useMascot((s) => s.expression);  // subscribe in React UI
```

## Architecture

| File | Role |
|---|---|
| `MascotStage.tsx` | Public drop-in: lazy load, placeholder, fade-in, speech bubble |
| `MascotCanvas.tsx` | R3F canvas: lights, procedural environment (no HDR download), shadows, effects, perf |
| `Mascot.tsx` | Character assembly + hover/click/drag interaction |
| `useMascotBrain.ts` | Every frame: blending, gaze, blink, reactions, springs (no React re-renders) |
| `expressions.ts` | Expression presets (tweak these to change the personality) |
| `parts/*` | Eye, Face (mouth/brows/cheeks), Accessories (glasses/antennae/cap), Body |
| `materials.ts` / `palette.ts` | Physical (PBR) materials and brand colors |
| `store.ts` | Tiny external store shared by the 3D scene and the DOM |
| `Effects.tsx` | Holographic platform, orbiting orbs, responsive camera |
| `ExportBridge.tsx` | Dev: open `/?export-glb` and press **Shift+E** to download a `.glb` |

## Performance

- three.js is code-split out of first load (`/` ships about 157 kB of JS; the 3D chunk loads after hydration).
- Rendering pauses when the hero scrolls off-screen. `PerformanceMonitor` and `AdaptiveDpr` lower resolution on weak GPUs.
- All geometry and materials are created once and shared. The procedural mascot downloads nothing. The plush
  character downloads only `plush.glb` (with a progress ring), and nothing else when the model isn't there.
- Plush quality tiers: 32 fur shells (desktop), 24 (mid-range), 14 (phones), or no shells with a sheen material
  on weak GPUs. The tier steps down automatically if frames drop.
- Respects `prefers-reduced-motion` (smaller motion, no spin).
- `touch-action: pan-y` keeps vertical page scrolling working on mobile while you tap or drag the mascot.

## GLB

`public/models/nidus-mascot.glb` is an export of the procedural model (static pose). Use it in Blender
to sculpt or re-texture it, or in other engines. The website itself renders the procedural version so that every
facial feature stays rigged.

## Rigged plush character (`components/mascot/plush/`)

Put a rigged model at `public/models/plush.glb` and the stage uses it automatically. If the file is
missing or fails to load, the procedural mascot is shown instead. The public API is unchanged.

**What the model should contain.** Everything is optional. Any layer whose bones, clips or blendshapes
aren't found is switched off.

| Layer | Needs in the GLB |
| --- | --- |
| State machine | Clips named like `idle`, `look_around`, `wave`, `happy_bounce`, `surprised`, `thinking`, `shy`, `talk_gesture`; extra `idle_*` clips become random idle variations; an optional `breathing` clip is played additively |
| Look-at, balance, foot IK | Bones `Hips`, `Spine`, `Spine2`/`Chest`, `Neck`, `Head`, `LeftEye`/`RightEye`, `LeftUpLeg`/`LeftLeg`/`LeftFoot` (and the right-side equivalents). Mixamo, Rigify and `thigh.L`-style names all work |
| Jiggle | Bones whose names contain `belly`, `hood`, `fluff`, `ear`, `tail` or `jiggle` |
| Face | ARKit-style blendshapes (`eyeBlinkLeft`, `jawOpen`, `mouthSmileLeft`, `browInnerUp` …) and optional `viseme_aa`/`viseme_O`/`viseme_E` |
| Fur | Meshes or materials whose names contain `fur`, `plush`, `body`, `fluff` or `hood`. Optional maps: `public/models/plush_fur_length.png` (R = length) and `plush_fur_flow.png` (RG = flow direction) |
| Catch-lights | Meshes or materials whose names contain `eye`, `cornea` or `iris` |

The name lists, look-at weights, spring settings, fur length/density and expression→blendshape
mapping all live in `plush/rigConfig.ts`. Open the page with `?plush-debug` to log what was detected.
Draco and KTX2 decoders are served from `public/decoders/`.

Optional audio lip-sync: `setMascotLipSyncAudio(audioElement)` while it plays, then `null`. It estimates mouth
shapes from loudness and frequency balance. That convinces at mascot scale but is not phoneme-accurate.
Without audio, the mouth flaps procedurally while `say()` is showing a line.
