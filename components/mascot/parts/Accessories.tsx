import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import type { MascotMaterials } from "../materials";
import { assign, type Rig } from "../rig";

/* ------------------------------------------------------------------ Glasses */

const ringGeo = new THREE.TorusGeometry(0.25, 0.03, 20, 64);
const lensGeo = new THREE.CircleGeometry(0.245, 48);
const bridgeGeo = new THREE.TorusGeometry(0.05, 0.022, 12, 24, Math.PI);

function Temple({ from, to, m }: { from: THREE.Vector3; to: THREE.Vector3; m: MascotMaterials }) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return (
    <mesh position={mid} quaternion={quat} material={m.frame} castShadow>
      <cylinderGeometry args={[0.018, 0.018, len, 10]} />
    </mesh>
  );
}

const TEMPLES = ([-1, 1] as const).map((s) => ({
  s,
  from: new THREE.Vector3(0.52 * s, 0.03, -0.04),
  to: new THREE.Vector3(0.69 * s, 0.05, -0.62),
}));

export function Glasses({ rig, m }: { rig: Rig; m: MascotMaterials }) {
  return (
    <group ref={assign<THREE.Group>((v) => (rig.glasses = v))} position={[0, 0.06, 0.675]}>
      {([-1, 1] as const).map((s) => (
        <group key={s} position={[0.28 * s, 0, 0]} rotation={[0, 0.16 * s, 0]}>
          <mesh geometry={ringGeo} material={m.frame} castShadow />
          <mesh geometry={lensGeo} material={m.lens} position={[0, 0, 0.004]} />
        </group>
      ))}
      <mesh geometry={bridgeGeo} material={m.frame} position={[0, 0.04, 0.01]} />
      {TEMPLES.map(({ s, from, to }) => (
        <Temple key={s} m={m} from={from} to={to} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ Antennae */

const stalkCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0.02, 0.18, 0.01),
  new THREE.Vector3(0.08, 0.34, 0.03),
  new THREE.Vector3(0.17, 0.46, 0.05),
]);
const stalkGeo = new THREE.TubeGeometry(stalkCurve, 32, 0.022, 10, false);
const tipGeo = new THREE.SphereGeometry(0.068, 28, 20);
const baseGeo = new THREE.SphereGeometry(0.05, 16, 12);
export const ANTENNA_TIP = stalkCurve.getPoint(1);

export function Antenna({ side, rig, m }: { side: 1 | -1; rig: Rig; m: MascotMaterials }) {
  return (
    <group position={[0.36 * side, 0.43, -0.1]} rotation={[-0.12, 0, -0.32 * side]}>
      <group ref={assign<THREE.Group>((v) => (side < 0 ? (rig.antennaL = v) : (rig.antennaR = v)))} scale={[side, 1, 1]}>
        <mesh geometry={baseGeo} material={m.skin} />
        <mesh geometry={stalkGeo} material={m.antennaStalk} castShadow />
        <mesh geometry={tipGeo} material={side < 0 ? m.antennaTipL : m.antennaTipR} position={ANTENNA_TIP} castShadow />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ Graduation cap */

const boardEdgeGeo = new THREE.BoxGeometry(0.93, 0.006, 0.006);
const segCordGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.08, 8);
const tasselHeadGeo = new THREE.CylinderGeometry(0.022, 0.045, 0.1, 16);
const knotGeo = new THREE.SphereGeometry(0.025, 12, 10);

/**
 * Mortarboard: felt skull cap, beveled board with stitched edge, button, cord
 * and a 3-segment tassel chain (spring-simulated by the brain).
 */
export function GradCap({ rig, m }: { rig: Rig; m: MascotMaterials }) {
  rig.tasselSegs.length = 0;
  return (
    <group position={[0, 0.45, -0.05]} rotation={[-0.2, 0, 0.07]}>
      <group ref={assign<THREE.Group>((v) => (rig.cap = v))}>
        {/* skull cap */}
        <mesh material={m.cap} position={[0, 0.06, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.38, 0.43, 0.2, 48, 1, true]} />
        </mesh>
        <mesh material={m.cap} position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.38, 0.38, 0.01, 48]} />
        </mesh>
        {/* board */}
        <RoundedBox args={[0.92, 0.04, 0.92]} radius={0.012} smoothness={3} position={[0, 0.18, 0]} material={m.cap} castShadow receiveShadow />
        {/* stitched board edge */}
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            geometry={boardEdgeGeo}
            material={m.stitch}
            position={[i === 1 ? 0.462 : i === 3 ? -0.462 : 0, 0.2, i === 0 ? 0.462 : i === 2 ? -0.462 : 0]}
            rotation={[0, i % 2 ? Math.PI / 2 : 0, 0]}
          />
        ))}
        {/* button */}
        <mesh material={m.tassel} position={[0, 0.21, 0]}>
          <cylinderGeometry args={[0.045, 0.05, 0.03, 24]} />
        </mesh>
        {/* cord across the board */}
        <mesh material={m.tassel} position={[0.2, 0.205, 0.2]} rotation={[0, -Math.PI / 4, Math.PI / 2]}>
          <cylinderGeometry args={[0.009, 0.009, 0.57, 8]} />
        </mesh>
        {/* hanging tassel: pivot at the corner → 3 spring-driven segments → head */}
        <group ref={assign<THREE.Group>((v) => (rig.tasselPivot = v))} position={[0.4, 0.2, 0.4]}>
          <group ref={assign<THREE.Group>((v) => (rig.tasselSegs[0] = v))}>
            <mesh geometry={segCordGeo} material={m.tassel} position={[0, -0.04, 0]} />
            <group ref={assign<THREE.Group>((v) => (rig.tasselSegs[1] = v))} position={[0, -0.08, 0]}>
              <mesh geometry={segCordGeo} material={m.tassel} position={[0, -0.04, 0]} />
              <group ref={assign<THREE.Group>((v) => (rig.tasselSegs[2] = v))} position={[0, -0.08, 0]}>
                <mesh geometry={segCordGeo} material={m.tassel} position={[0, -0.02, 0]} scale={[1, 0.5, 1]} />
                <mesh geometry={knotGeo} material={m.tassel} position={[0, -0.055, 0]} />
                <mesh geometry={tasselHeadGeo} material={m.tassel} position={[0, -0.11, 0]} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
