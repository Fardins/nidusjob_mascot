"use client";

import { Bloom, DepthOfField, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import type { Framing } from "../brain/types";

/**
 * Post stack per tier: AO + selective bloom (only HDR emissive parts exceed
 * the threshold) + subtle vignette and grain + AgX tone mapping, and depth
 * of field on the hero shot at the high tier only.
 *
 * Opt-in (`<MascotStage post />`): the default canvas is transparent over
 * the page, and a composer pipeline drops additive glow on transparent
 * pixels. N8AO additionally writes opaque alpha, so it only runs when the
 * canvas has its own background (`opaque`).
 */
export function PostFX({ quality, framing, opaque = false }: { quality: "low" | "mobile" | "medium" | "high"; framing: Framing; opaque?: boolean }) {
  if (quality === "low") return null;
  const high = quality === "high";
  const medium = quality === "medium";
  const mobile = quality === "mobile";
  return (
    <EffectComposer multisampling={mobile ? 0 : 4} resolutionScale={mobile ? 0.5 : 1}>
      {opaque && (high || medium) ? <N8AO aoRadius={0.35} distanceFalloff={0.6} intensity={high ? 2.2 : 1.6} quality={high ? "high" : "low"} halfRes={!high} /> : null}
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={mobile ? 0.45 : 0.7} resolutionScale={mobile ? 0.5 : 1} />
      {high && framing === "hero" ? <DepthOfField focusDistance={0.0} focalLength={0.06} bokehScale={1.2} /> : null}
      <Vignette offset={0.32} darkness={0.35} eskil={false} />
      <Noise opacity={0.025} premultiply blendFunction={BlendFunction.SOFT_LIGHT} />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  );
}
