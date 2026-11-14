import * as THREE from "three";
import type { MascotMaterials } from "../materials";
import { assign, type Rig } from "../rig";

// Torso silhouette (radius, height) revolved around Y — a soft jacket shape.
const torsoGeo = new THREE.LatheGeometry(
  [
    [0.0, -0.4],
    [0.16, -0.39],
    [0.29, -0.33],
    [0.36, -0.2],
    [0.37, -0.06],
    [0.33, 0.08],
    [0.24, 0.18],
    [0.12, 0.225],
    [0.0, 0.23],
  ].map(([x, y]) => new THREE.Vector2(x, y)),
  64,
);
torsoGeo.computeVertexNormals();

const hemGeo = new THREE.TorusGeometry(0.315, 0.04, 16, 64);
const collarGeo = new THREE.TorusGeometry(0.2, 0.055, 16, 48);
const flapGeo = new THREE.ConeGeometry(0.08, 0.16, 3, 1);
const badgeGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 40);
const badgeRimGeo = new THREE.TorusGeometry(0.085, 0.012, 10, 40);
const iconRingGeo = new THREE.TorusGeometry(0.038, 0.009, 10, 32);
const iconDotGeo = new THREE.SphereGeometry(0.016, 12, 10);
const armGeo = new THREE.CapsuleGeometry(0.07, 0.18, 8, 16);
const handGeo = new THREE.SphereGeometry(0.075, 20, 14);
const neckGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.22, 24);

function Arm({ side, rig, m }: { side: 1 | -1; rig: Rig; m: MascotMaterials }) {
  return (
    <group
      ref={assign<THREE.Group>((v) => (side < 0 ? (rig.armL = v) : (rig.armR = v)))}
      position={[0.29 * side, 0.06, 0]}
      rotation={[0, 0, 0.32 * side]}
    >
      <mesh geometry={armGeo} material={m.outfit} position={[0, -0.14, 0]} castShadow />
      <mesh geometry={hemGeo} material={m.outfitAccent} position={[0, -0.25, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.25} />
      <mesh geometry={handGeo} material={m.skin} position={[0, -0.3, 0]} castShadow />
    </group>
  );
}

export function Body({ rig, m }: { rig: Rig; m: MascotMaterials }) {
  return (
    <group position={[0, -0.27, 0]} scale={1.12}>
    <group ref={assign<THREE.Group>((v) => (rig.body = v))}>
      <mesh geometry={torsoGeo} material={m.outfit} castShadow receiveShadow />
      <mesh geometry={hemGeo} material={m.outfitAccent} position={[0, -0.3, 0]} rotation={[Math.PI / 2, 0, 0]} />

      <mesh geometry={neckGeo} material={m.skin} position={[0, 0.27, 0]} />
      {/* collar */}
      <mesh geometry={collarGeo} material={m.collar} position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.8]} />
      {([-1, 1] as const).map((s) => (
        <mesh
          key={s}
          geometry={flapGeo}
          material={m.collar}
          position={[0.085 * s, 0.13, 0.25]}
          rotation={[0.35, 0, Math.PI + 0.5 * s]}
          scale={[1, 1, 0.25]}
        />
      ))}

      {/* zipper + chest badge */}
      <group position={[0, -0.02, 0.365]} rotation={[Math.PI / 2 - 0.12, 0, 0]}>
        <mesh geometry={badgeGeo} material={m.badge} />
        <mesh geometry={badgeRimGeo} material={m.tassel} position={[0, 0.016, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={iconRingGeo} material={m.badgeIcon} position={[0, 0.018, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={iconDotGeo} material={m.badgeIcon} position={[0, 0.02, 0]} />
      </group>

      <Arm side={-1} rig={rig} m={m} />
      <Arm side={1} rig={rig} m={m} />
    </group>
    </group>
  );
}
