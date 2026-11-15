import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
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
const stitchGeo = new THREE.TorusGeometry(0.335, 0.004, 4, 96);
const collarGeo = new THREE.TorusGeometry(0.2, 0.055, 16, 48);
const flapGeo = new THREE.ConeGeometry(0.08, 0.16, 3, 1);
const badgeGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 40);
const badgeRimGeo = new THREE.TorusGeometry(0.085, 0.012, 10, 40);
const logoGeo = new THREE.PlaneGeometry(0.15, 0.15);
const upperArmGeo = new THREE.CapsuleGeometry(0.07, 0.08, 8, 16);
const foreArmGeo = new THREE.CapsuleGeometry(0.066, 0.07, 8, 16);
const handGeo = new THREE.SphereGeometry(0.075, 20, 14);
const neckGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.22, 24);
const screenGeo = new THREE.PlaneGeometry(0.06, 0.06);

/** Shoulder → elbow → hand. The left forearm wears the smart wrist device. */
function Arm({ side, rig, m }: { side: 1 | -1; rig: Rig; m: MascotMaterials }) {
  const arm = side < 0 ? rig.armL : rig.armR;
  return (
    <group ref={assign<THREE.Group>((v) => (arm.shoulder = v))} position={[0.29 * side, 0.06, 0]} rotation={[0, 0, 0.32 * side]}>
      <mesh geometry={upperArmGeo} material={m.outfit} position={[0, -0.07, 0]} castShadow />
      <group ref={assign<THREE.Group>((v) => (arm.elbow = v))} position={[0, -0.14, 0]}>
        <mesh geometry={foreArmGeo} material={m.outfit} position={[0, -0.04, 0]} castShadow />
        <mesh geometry={hemGeo} material={m.outfitAccent} position={[0, -0.11, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.25} />
        <mesh geometry={handGeo} material={m.hands} position={[0, -0.16, 0]} castShadow />
        {side < 0 && (
          <group ref={assign<THREE.Group>((v) => (rig.wrist = v))} position={[0, -0.075, 0.055]} rotation={[0.15, 0, 0]}>
            <RoundedBox args={[0.085, 0.05, 0.03]} radius={0.01} smoothness={2} material={m.wristBody} />
            <mesh geometry={screenGeo} material={m.wristScreen} position={[0, 0, 0.0155]} scale={[1.15, 0.65, 1]} />
          </group>
        )}
      </group>
    </group>
  );
}

export function Body({ rig, m }: { rig: Rig; m: MascotMaterials }) {
  return (
    <group position={[0, -0.27, 0]} scale={1.12}>
      <group ref={assign<THREE.Group>((v) => (rig.body = v))}>
        <mesh geometry={torsoGeo} material={m.outfit} castShadow receiveShadow />
        <mesh geometry={hemGeo} material={m.outfitAccent} position={[0, -0.3, 0]} rotation={[Math.PI / 2, 0, 0]} />
        {/* visible stitching above the hem */}
        <mesh geometry={stitchGeo} material={m.stitch} position={[0, -0.255, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.04, 1.04, 1]} />

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

        {/* chest badge with the animated SDF logo */}
        <group position={[0, -0.02, 0.365]} rotation={[Math.PI / 2 - 0.12, 0, 0]}>
          <mesh geometry={badgeGeo} material={m.badge} />
          <mesh geometry={badgeRimGeo} material={m.tassel} position={[0, 0.016, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={logoGeo} material={m.logo} position={[0, 0.0165, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        </group>

        <Arm side={-1} rig={rig} m={m} />
        <Arm side={1} rig={rig} m={m} />
      </group>
    </group>
  );
}

/** Seasonal knit scarf. */
const scarfGeo = new THREE.TorusGeometry(0.205, 0.06, 14, 48);
const tailGeo = new THREE.CapsuleGeometry(0.055, 0.16, 6, 12);
export function Scarf({ m }: { m: MascotMaterials }) {
  return (
    <group position={[0, -0.27 + 0.21 * 1.12, 0]} scale={1.12}>
      <mesh geometry={scarfGeo} material={m.scarf} rotation={[Math.PI / 2, 0, 0]} scale={[1.05, 1.05, 0.9]} castShadow />
      <mesh geometry={tailGeo} material={m.scarf} position={[0.11, -0.12, 0.2]} rotation={[0.25, 0, 0.18]} scale={[1, 1, 0.45]} castShadow />
    </group>
  );
}
