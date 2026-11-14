import * as THREE from "three";
import type { MascotMaterials } from "../materials";
import { assign, type Rig } from "../rig";

const SMILE_ARC = Math.PI * 0.78;
const smileGeo = new THREE.TorusGeometry(0.095, 0.017, 12, 40, SMILE_ARC);
const mouthGeo = new THREE.SphereGeometry(0.1, 32, 20);
const tongueGeo = new THREE.SphereGeometry(0.055, 20, 12);
const browGeo = new THREE.CapsuleGeometry(0.022, 0.11, 6, 12);
const blushGeo = new THREE.CircleGeometry(0.085, 32);

/** Mouth, brows and cheeks. Positions are in head-local space. */
export function Face({ rig, m }: { rig: Rig; m: MascotMaterials }) {
  return (
    <>
      {/* Mouth */}
      <group position={[0, -0.3, 0.522]} rotation={[0.48, 0, 0]}>
        <mesh
          ref={assign<THREE.Mesh>((v) => (rig.smile = v))}
          geometry={smileGeo}
          material={m.mouth}
          position={[0, 0.06, 0]}
          rotation={[0, 0, -Math.PI / 2 - SMILE_ARC / 2]}
        />
        <group ref={assign<THREE.Group>((v) => (rig.mouthOpen = v))} position={[0, -0.02, -0.012]}>
          <mesh geometry={mouthGeo} material={m.mouth} scale={[1, 1, 0.38]} />
          <mesh geometry={tongueGeo} material={m.tongue} position={[0, -0.05, 0.012]} scale={[1.1, 0.6, 0.5]} />
        </group>
      </group>

      {/* Brows */}
      {([-1, 1] as const).map((s) => (
        <group key={s} position={[0.27 * s, 0.39, 0.43]} rotation={[-0.62, 0.32 * s, 0]}>
          <group ref={assign<THREE.Group>((v) => ((s < 0 ? rig.browL : rig.browR).lift = v))}>
            <group ref={assign<THREE.Group>((v) => ((s < 0 ? rig.browL : rig.browR).tilt = v))}>
              <mesh geometry={browGeo} material={m.brow} rotation={[0, 0, Math.PI / 2]} />
            </group>
          </group>
        </group>
      ))}

      {/* Cheeks */}
      {([-1, 1] as const).map((s) => (
        <mesh
          key={s}
          geometry={blushGeo}
          material={m.blush}
          position={[0.43 * s, -0.235, 0.425]}
          rotation={[0.3, 0.72 * s, 0]}
          scale={[1.35, 0.8, 1]}
        />
      ))}
    </>
  );
}
