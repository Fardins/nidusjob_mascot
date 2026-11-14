import * as THREE from "three";
import type { MascotMaterials } from "../materials";
import { assign, type EyeRig } from "../rig";

const R = 0.215;

// Shared geometries (module scope = created once).
const sclera = new THREE.SphereGeometry(R, 40, 28);
// Caps built around +Y then rotated to face +Z.
const irisGeo = new THREE.SphereGeometry(R * 1.004, 40, 12, 0, Math.PI * 2, 0, 0.62);
const irisRingGeo = new THREE.SphereGeometry(R * 1.003, 40, 6, 0, Math.PI * 2, 0.58, 0.07);
const pupilGeo = new THREE.SphereGeometry(R * 1.008, 32, 8, 0, Math.PI * 2, 0, 0.3);
const corneaGeo = new THREE.SphereGeometry(R * 1.04, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.55);
const lidGeo = new THREE.SphereGeometry(R * 1.06, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
const hlBig = new THREE.SphereGeometry(0.036, 16, 12);
const hlSmall = new THREE.SphereGeometry(0.02, 12, 8);

interface EyeProps {
  side: 1 | -1;
  rig: EyeRig;
  m: MascotMaterials;
  position: [number, number, number];
}

/**
 * Socket (static) → ball (gaze rotation) → pupil (dilation).
 * Lids and specular highlights live on the socket so they don't roll with the eyeball,
 * which keeps the "catch-light" alive the way animated films do.
 */
export function Eye({ side, rig, m, position }: EyeProps) {
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
      </group>

      {/* glossy cornea */}
      <mesh geometry={corneaGeo} material={m.cornea} rotation={[Math.PI / 2, 0, 0]} />

      {/* catch-lights */}
      <mesh geometry={hlBig} material={m.highlight} position={[-0.065, 0.08, 0.186]} />
      <mesh geometry={hlSmall} material={m.highlight} position={[0.065, -0.065, 0.194]} />

      {/* lids (skin coloured hemispheres rotated over the eye) */}
      <mesh
        ref={assign<THREE.Mesh>((v) => (rig.lidUpper = v))}
        geometry={lidGeo}
        material={m.skin}
        rotation={[-1.2, 0, 0]}
      />
      <mesh
        ref={assign<THREE.Mesh>((v) => (rig.lidLower = v))}
        geometry={lidGeo}
        material={m.skin}
        rotation={[Math.PI + 1.35, 0, 0]}
      />
    </group>
  );
}
