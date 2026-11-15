"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mascotStore } from "../store";
import { DEFAULT_CLICK_REACTIONS, type ClickReaction } from "../reactions";
import { CatchLights } from "./CatchLights";
import { createCharacterState } from "./characterState";
import {
  createFurShells,
  createFurUniforms,
  createSheenFurMaterial,
  loadOptionalTexture,
  updateFurUniforms,
  type FurShells,
} from "./FurMaterial";
import { Balance } from "./physics/balance";
import { JiggleSystem } from "./physics/jiggle";
import { DECODER_PATHS, FUR, PLUSH_MODEL_URL } from "./rigConfig";
import {
  collectBones,
  debugEnabled,
  findBones,
  findClips,
  findMorphs,
  norm,
} from "./rigUtils";
import { useFacial } from "./useFacial";
import { useLocomotionBrain } from "./useLocomotionBrain";
import { useLookAt } from "./useLookAt";

export type PlushQuality = "high" | "medium" | "mobile" | "low";

export interface PlushCharacterProps {
  quality: PlushQuality;
  reducedMotion: boolean;
  clickReactions?: ClickReaction[];
  /** Target height in world units; the model is normalised to this. */
  height?: number;
  /** World Y of the floor (feet are placed here). */
  floorY?: number;
  onLoaded?: () => void;
}

let ktx2: KTX2Loader | null = null;
function getKTX2(gl: THREE.WebGLRenderer) {
  if (!ktx2)
    ktx2 = new KTX2Loader()
      .setTranscoderPath(DECODER_PATHS.basis)
      .detectSupport(gl);
  return ktx2;
}

function isFurMesh(mesh: THREE.Mesh) {
  const mat = mesh.material as THREE.Material;
  const names = [norm(mesh.name), norm(mat?.name ?? "")];
  if (names.some((n) => FUR.exclude.some((x) => n.includes(x)))) return false;
  return names.some((n) => FUR.match.some((x) => n.includes(x)));
}

function isEyeMesh(mesh: THREE.Mesh) {
  const mat = mesh.material as THREE.Material;
  return /eye|cornea|iris|pupil/.test(norm(mesh.name) + norm(mat?.name ?? ""));
}

/**
 * The rigged plush character. Loads plush.glb, sets up fur, then layers the
 * behaviour systems every frame in a fixed order:
 *
 *   -2  restore rest pose          (so additive layers never accumulate)
 *   -1  state machine              (crossfades, idle variations, reactions)
 *    0  mixer.update               (drei useAnimations)
 *    0  procedural → look-at → balance/IK → jiggle → face → fur
 */
export function PlushCharacter({
  quality,
  reducedMotion,
  clickReactions = DEFAULT_CLICK_REACTIONS,
  height = 2.05,
  floorY = -1.04,
  onLoaded,
}: PlushCharacterProps) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const gltf = useGLTF(PLUSH_MODEL_URL, DECODER_PATHS.draco, true, (loader) => {
    loader.setKTX2Loader(
      getKTX2(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0],
    );
  });

  /* ------------------------------------------------------------ one-time setup */
  const rig = useMemo(() => {
    const model = cloneSkinned(gltf.scene);
    model.name = "PlushCharacter";

    // Normalise: fixed height, feet on the floor, centred.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const size = box.getSize(new THREE.Vector3());
    const s = size.y > 0 ? height / size.y : 1;
    model.scale.setScalar(s);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x * s, floorY - box.min.y * s, -center.z * s);
    model.updateMatrixWorld(true);

    const bones = findBones(model);
    const clips = findClips(gltf.animations);
    const morphs = findMorphs(model);
    const allBones = collectBones(model);
    const rest = allBones.map((b) => ({
      b,
      p: b.position.clone(),
      q: b.quaternion.clone(),
      s: b.scale.clone(),
    }));

    return { model, bones, clips, morphs, rest };
  }, [gltf, height, floorY]);

  /* ------------------------------------------------------------ materials + fur */
  const furUniforms = useMemo(createFurUniforms, []);
  const catchGroup = useMemo(() => new THREE.Group(), []);
  const catchLights = useRef<CatchLights | null>(null);
  useEffect(() => {
    const shells: FurShells[] = [];
    const eyeMeshes: THREE.Mesh[] = [];
    const made: THREE.Material[] = [];
    const shellCount = quality === "low" ? 0 : FUR.shells[quality];
    let furred = 0;

    rig.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.name.endsWith("_furShells")) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat || Array.isArray(mat)) return;

      if (isEyeMesh(mesh)) {
        // Glossy eyes: environment reflections become HDR catch-lights that the bloom picks up.
        // Physical.copy() expects physical-only fields, so copy a standard source via the standard copy.
        const eye = (mat as unknown as THREE.MeshPhysicalMaterial)
          .isMeshPhysicalMaterial
          ? (mat.clone() as THREE.MeshPhysicalMaterial)
          : (THREE.MeshStandardMaterial.prototype.copy.call(
              new THREE.MeshPhysicalMaterial(),
              mat,
            ) as THREE.MeshPhysicalMaterial);
        eye.roughness = Math.min(eye.roughness ?? 0.1, 0.08);
        eye.clearcoat = 1;
        eye.clearcoatRoughness = 0.02;
        eye.envMapIntensity = 2.6;
        mesh.material = eye;
        made.push(eye);
        eyeMeshes.push(mesh);
        return;
      }

      if (isFurMesh(mesh)) {
        furred++;
        const base = createSheenFurMaterial(mat);
        mesh.material = base;
        made.push(base);
        if (shellCount > 0)
          shells.push(createFurShells(mesh, shellCount, furUniforms));
      }
    });

    const lights = new CatchLights(eyeMeshes, rig.bones);
    catchGroup.add(lights.group);
    catchLights.current = lights;

    let cancelled = false;
    void Promise.all([
      loadOptionalTexture(FUR.lengthMap, furUniforms.uLengthMap.value),
      loadOptionalTexture(FUR.flowMap, furUniforms.uFlowMap.value),
    ]).then(([len, flow]) => {
      if (cancelled) return;
      furUniforms.uLengthMap.value = len;
      furUniforms.uFlowMap.value = flow;
    });

    if (debugEnabled()) {
      console.info(
        "[plush] bones " +
          JSON.stringify(
            Object.fromEntries(
              Object.entries(rig.bones).map(([k, b]) => [k, b?.name]),
            ),
          ),
      );
      console.info(
        "[plush] clips " +
          JSON.stringify(
            Object.fromEntries(
              Object.entries(rig.clips.states).map(([k, c]) => [k, c?.name]),
            ),
          ),
        "variations",
        rig.clips.idleVariations.map((c) => c.name),
        "breath",
        rig.clips.breath?.name,
      );
      console.info(
        "[plush] morph keys " + JSON.stringify(rig.morphs.keys),
        "all morphs",
        [...rig.morphs.byName.keys()],
      );
      console.info(
        `[plush] fur meshes: ${furred}, shells: ${shellCount}, catch-lights: ${lights.count}, quality: ${quality}`,
      );
    }

    return () => {
      cancelled = true;
      lights.dispose();
      catchLights.current = null;
      shells.forEach((s) => s.dispose());
      made.forEach((m) => m.dispose());
    };
  }, [rig, quality, furUniforms, catchGroup]);

  /* ------------------------------------------------------------ behaviour systems */
  const root = useMemo(() => new THREE.Group(), []);
  const cs = useMemo(
    () => createCharacterState(reducedMotion),
    [reducedMotion],
  );
  const { mixer } = useAnimations(gltf.animations, rig.model);
  const physics = useMemo(
    () => ({
      jiggle: new JiggleSystem(rig.model),
      balance: new Balance(rig.bones),
    }),
    [rig],
  );

  const brain = useLocomotionBrain({
    mixer: gltf.animations.length ? mixer : null,
    model: rig.model,
    root,
    clips: rig.clips,
    bones: rig.bones,
    cs,
    reducedMotion,
    clickReactions,
  });
  const lookAt = useLookAt(root, rig.bones, cs);
  const facial = useFacial(rig.morphs, cs);

  useEffect(() => {
    if (debugEnabled())
      console.info(
        `[plush] jiggle bones: ${physics.jiggle.size}, balance: ${physics.balance.enabled}, face: ${facial.hasFace}`,
      );
    onLoaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -2: rest pose. Bones the clips animate get overwritten by the mixer; the rest stay clean.
  useFrame(() => {
    for (const r of rig.rest) {
      r.b.position.copy(r.p);
      r.b.quaternion.copy(r.q);
      r.b.scale.copy(r.s);
    }
  }, -2);

  // -1: state machine decides what the mixer plays this frame.
  useFrame(
    (state, delta) =>
      brain.updateAnimation(state.clock.elapsedTime, Math.min(delta, 1 / 20)),
    -1,
  );

  // 0 (after the mixer, since useAnimations registered first): procedural layers.
  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const t = state.clock.elapsedTime;
    physics.balance.capture();
    brain.updateProcedural(t, dt);
    root.updateMatrixWorld(true);
    lookAt.update(t, dt);
    physics.balance.apply(cs.headYaw, dt, cs.motionScale);
    physics.jiggle.update(dt, reducedMotion ? 0.3 : 1);
    facial.update(t, dt, brain.expression);
    updateFurUniforms(
      furUniforms,
      t,
      camera,
      rig.model,
      cs.velocity,
      reducedMotion ? 0.3 : 1,
    );
    rig.model.updateMatrixWorld(true);
    catchLights.current?.update(camera, 1);
  });

  /* ------------------------------------------------------------ pointer: hover, click, drag */
  const press = useRef<{ x: number; moved: number } | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pr = press.current;
      if (!pr) return;
      pr.moved += Math.abs(e.clientX - pr.x);
      if (pr.moved > 6) {
        if (!brain.drag.active) brain.drag.start(pr.x);
        brain.drag.move(e.clientX);
      }
      pr.x = e.clientX;
    };
    const onUp = () => {
      const pr = press.current;
      if (!pr) return;
      press.current = null;
      brain.drag.end();
      document.body.style.cursor = mascotStore.get().hovered ? "grab" : "";
      if (pr.moved <= 6) brain.onClick();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
    };
  }, [brain]);

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    press.current = { x: e.clientX, moved: 0 };
    document.body.style.cursor = "grabbing";
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    mascotStore.setHovered(true);
    brain.onHover(true);
    if (!press.current) document.body.style.cursor = "grab";
  };
  const onOut = () => {
    mascotStore.setHovered(false);
    brain.onHover(false);
    if (!press.current) document.body.style.cursor = "";
  };

  return (
    <>
      <primitive object={catchGroup} />
      <primitive
        object={root}
        onPointerDown={onDown}
        onPointerOver={onOver}
        onPointerOut={onOut}
      >
        <primitive object={rig.model} />
      </primitive>
    </>
  );
}
