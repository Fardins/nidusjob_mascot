import * as THREE from "three";
import { useMemo } from "react";
import type { MascotMaterials } from "../materials";
import { assign, type Rig } from "../rig";
import { BrowGeometry } from "../render/BrowGeometry";

const SMILE_ARC = Math.PI * 0.78;
const smileGeo = new THREE.TorusGeometry(0.095, 0.017, 12, 40, SMILE_ARC);
const mouthGeo = new THREE.SphereGeometry(0.1, 32, 20);
const tongueGeo = new THREE.SphereGeometry(0.055, 20, 12);
const teethGeo = new THREE.BoxGeometry(0.11, 0.022, 0.02);
const blushGeo = new THREE.CircleGeometry(0.085, 32);

/** Mouth, brows and cheeks. Positions are in head-local space. */
export function Face({ rig, m }: { rig: Rig; m: MascotMaterials }) {
  // one dynamic geometry per brow (3 control points each)
  const brows = useMemo(() => ({ L: new BrowGeometry(1), R: new BrowGeometry(-1) }), []);
  rig.browL.geo = brows.L;
  rig.browR.geo = brows.R;

  return (
    <>
      {/* Mouth */}
      <group position={[0, -0.3, 0.522]} rotation={[0.48, 0, 0]}>
        <group ref={assign<THREE.Group>((v) => (rig.mouth = v))}>
          <mesh
            ref={assign<THREE.Mesh>((v) => (rig.smile = v))}
            geometry={smileGeo}
            material={m.mouth}
            position={[0, 0.06, 0]}
            rotation={[0, 0, -Math.PI / 2 - SMILE_ARC / 2]}
          />
          <group ref={assign<THREE.Group>((v) => (rig.mouthOpen = v))} position={[0, -0.02, -0.012]}>
            <mesh geometry={mouthGeo} material={m.mouth} scale={[1, 1, 0.38]} />
            <mesh ref={assign<THREE.Mesh>((v) => (rig.teeth = v))} geometry={teethGeo} material={m.teeth} position={[0, 0.07, 0.02]} />
            <mesh ref={assign<THREE.Mesh>((v) => (rig.tongue = v))} geometry={tongueGeo} material={m.tongue} position={[0, -0.05, 0.012]} scale={[1.1, 0.6, 0.5]} />
          </group>
        </group>
      </group>

      {/* Brows (left brow: inner end toward +x; right brow: inner end toward -x) */}
      {([-1, 1] as const).map((s) => (
        <group key={s} position={[0.27 * s, 0.39, 0.43]} rotation={[-0.62, 0.32 * s, 0]}>
          <mesh geometry={s < 0 ? brows.L : brows.R} material={m.brow} frustumCulled={false} />
        </group>
      ))}

      {/* Cheeks */}
      {([-1, 1] as const).map((s) => (
        <mesh
          key={s}
          ref={assign<THREE.Mesh>((v) => (s < 0 ? (rig.cheekL = v) : (rig.cheekR = v)))}
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
