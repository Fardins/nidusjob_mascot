import * as THREE from "three";
import type { LogoMode } from "../brain/expressions";

export const LOGO_MODE_INDEX: Record<LogoMode, number> = { idle: 0, loading: 1, equalizer: 2, check: 3, alert: 4 };

/**
 * Animated chest logo drawn with signed distance fields (crisp at any zoom):
 * idle shimmer, loading ring, voice equalizer, checkmark, alert glyph.
 * Two modes cross-fade through `uMix`, so mode changes never snap.
 */
export function createLogoMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uModeA: { value: 0 },
      uModeB: { value: 0 },
      uMix: { value: 1 },
      uAmp: { value: 0 },
      uColor: { value: new THREE.Color("#e8f4ff") },
      uIntensity: { value: 1.4 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime, uModeA, uModeB, uMix, uAmp, uIntensity;
      uniform vec3 uColor;

      float sdSegment(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
      }
      float fill(float d, float w) { return 1.0 - smoothstep(w - 0.025, w + 0.025, d); }

      float logo(vec2 p) {
        float ring = abs(length(p) - 0.48) ;
        return max(fill(ring, 0.1), fill(length(p), 0.17));
      }

      float shape(float mode, vec2 p) {
        if (mode < 0.5) {
          float l = logo(p);
          float band = smoothstep(0.25, 0.0, abs(p.x + p.y - mod(uTime * 0.7, 4.0) + 2.0));
          return l * (0.75 + 0.6 * band);
        }
        if (mode < 1.5) {
          float a = atan(p.y, p.x);
          float head = mod(-uTime * 4.0, 6.2831853);
          float da = mod(a - head + 6.2831853, 6.2831853);
          float arc = fill(abs(length(p) - 0.55), 0.09) * smoothstep(2.6, 0.0, da);
          float dot0 = fill(length(p), 0.12 + 0.04 * sin(uTime * 5.0));
          return max(arc, dot0);
        }
        if (mode < 2.5) {
          float v = 0.0;
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float x = -0.56 + fi * 0.28;
            float h = 0.12 + (0.25 + 0.45 * uAmp) * (0.5 + 0.5 * sin(uTime * (6.0 + fi * 1.7) + fi * 1.3));
            v = max(v, fill(sdSegment(p, vec2(x, -h), vec2(x, h)), 0.07));
          }
          return v;
        }
        if (mode < 3.5) {
          float d = min(sdSegment(p, vec2(-0.45, 0.02), vec2(-0.12, -0.32)), sdSegment(p, vec2(-0.12, -0.32), vec2(0.48, 0.34)));
          return fill(d, 0.1);
        }
        float bar = fill(sdSegment(p, vec2(0.0, 0.45), vec2(0.0, -0.08)), 0.1);
        float dt = fill(length(p - vec2(0.0, -0.36)), 0.11);
        return max(bar, dt);
      }

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        if (length(p) > 1.0) discard;
        float a = mix(shape(uModeA, p), shape(uModeB, p), uMix);
        gl_FragColor = vec4(uColor * uIntensity, clamp(a, 0.0, 1.0));
      }`,
  });
}
