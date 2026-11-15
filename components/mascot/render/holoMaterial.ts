import * as THREE from "three";

/**
 * Hologram shader: Fresnel edge glow, scanlines, flicker, slight chromatic
 * offset, additive blending. `uOpacity` fades the whole hologram.
 */
export function createHoloMaterial(color = "#7ff7ff") {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      uniform float uTime, uOpacity;
      uniform vec3 uColor;
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float scan = 0.65 + 0.35 * sin(vW.y * 220.0 - uTime * 6.0);
        float flicker = 0.85 + 0.15 * hash(floor(uTime * 18.0));
        vec3 col = uColor * (0.45 + 1.4 * fres) * scan * flicker;
        // chromatic offset: red and blue scanlines slightly out of phase
        col.r *= 0.9 + 0.2 * sin(vW.y * 220.0 - uTime * 6.0 + 0.8);
        col.b *= 0.9 + 0.2 * sin(vW.y * 220.0 - uTime * 6.0 - 0.8);
        gl_FragColor = vec4(col * 1.6, (0.35 + 0.65 * fres) * uOpacity);
      }`,
  });
}
