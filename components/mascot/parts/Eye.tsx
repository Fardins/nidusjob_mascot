import * as THREE from "three";
import type { MascotMaterials } from "../materials";
import { assign, type EyeRig } from "../rig";

const R = 0.215;

// Shared geometries (module scope = created once).
const sclera = new THREE.SphereGeometry(R, 40, 28);
// Caps built around +Y then rotated to face +Z.
const irisGeo = new THREE.SphereGeometry(R * 1.004, 48, 14, 0, Math.PI * 2, 0, 0.62);
const irisRingGeo = new THREE.SphereGeometry(R * 1.003, 40, 6, 0, Math.PI * 2, 0.58, 0.07);
const pupilGeo = new THREE.SphereGeometry(R * 1.008, 32, 8, 0, Math.PI * 2, 0, 0.3);
const corneaGeo = new THREE.SphereGeometry(R * 1.04, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.55);
const lidGeo = new THREE.SphereGeometry(R * 1.06, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
const hlBig = new THREE.SphereGeometry(0.042, 16, 12);
const hlSmall = new THREE.SphereGeometry(0.018, 12, 8);
// lashes: an arc along the upper lid's rim (child of the lid, so it follows the blink)
const LASH_ARC = 2.1;
const lashGeo = new THREE.TorusGeometry(R * 1.075, 0.008, 6, 32, LASH_ARC);
// wet line along the lower lid
const wetGeo = new THREE.TorusGeometry(R * 1.02, 0.004, 4, 32, 1.6);
// dizzy spiral
const spiralGeo = (() => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * Math.PI * 6;
    const r = 0.012 + (i / 80) * 0.1;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.007, 5, false);
})();

interface EyeProps {
  side: 1 | -1;
  rig: EyeRig;
  m: MascotMaterials;
  position: [number, number, number];
  lashes?: boolean;
}

/**
 * Socket (static) → ball (gaze rotation) → pupil (dilation).
 * Lids and specular highlights live on the socket so they don't roll with the
 * eyeball: the catch-lights stay fixed relative to the light while the eye
 * turns, which is what sells "real eyes".
 */
export function Eye({ side, rig, m, position, lashes = true }: EyeProps) {
  return (
    <group position={position} rotation={[0, side * 0.18, 0]}>
      <group ref={assign<THREE.Group>((v) => (rig.ball = v))}>
        <mesh geometry={sclera} material={m.sclera} />
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh geometry={irisGeo} material={m.iris} />
          <mesh geometry={irisRingGeo} material={m.irisRing} />
          <group ref={assign<THREE.Group>((v) => (rig.pupil = v))}>
            <mesh geometry={pupilGeo} material={m.pupil} />
          </group>
        </group>
        <group ref={assign<THREE.Group>((v) => (rig.spiral = v))} position={[0, 0, R * 1.03]} visible={false}>
          <mesh geometry={spiralGeo} material={m.spiral} />
        </group>
      </group>

      {/* glossy cornea (env-mapped reflections) */}
      <mesh geometry={corneaGeo} material={m.cornea} rotation={[Math.PI / 2, 0, 0]} />

      {/* catch-lights: one large soft, one small sharp */}
      <mesh geometry={hlBig} material={m.highlightSoft} position={[-0.065, 0.08, 0.184]} scale={[1, 1, 0.4]} />
      <mesh geometry={hlBig} material={m.highlight} position={[-0.062, 0.078, 0.19]} scale={0.55} />
      <mesh geometry={hlSmall} material={m.highlight} position={[0.065, -0.065, 0.194]} />

      {/* wet line along the lower lid */}
      <mesh geometry={wetGeo} material={m.wetLine} rotation={[0.55, 0, -Math.PI / 2 - 0.8]} />

      {/* lids (skin coloured hemispheres rotated over the eye) */}
      <mesh ref={assign<THREE.Mesh>((v) => (rig.lidUpper = v))} geometry={lidGeo} material={m.skin} rotation={[-1.2, 0, 0]}>
        {lashes && <mesh geometry={lashGeo} material={m.lash} rotation={[Math.PI / 2, 0, Math.PI / 2 - LASH_ARC / 2]} scale={[1, 1, 1]} />}
      </mesh>
      <mesh ref={assign<THREE.Mesh>((v) => (rig.lidLower = v))} geometry={lidGeo} material={m.skin} rotation={[Math.PI + 1.35, 0, 0]} />
    </group>
  );
}
