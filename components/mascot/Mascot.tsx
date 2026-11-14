"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useMascotMaterials } from "./materials";
import { assign, createRig } from "./rig";
import { mascotStore } from "./store";
import { DEFAULT_CLICK_REACTIONS, type ClickReaction } from "./reactions";
import { useMascotBrain, type DragState } from "./useMascotBrain";
import { Eye } from "./parts/Eye";
import { Face } from "./parts/Face";
import { Antenna, Glasses, GradCap } from "./parts/Accessories";
import { Body } from "./parts/Body";

const headGeo = new THREE.SphereGeometry(0.62, 64, 48);

export interface MascotProps {
  reducedMotion?: boolean;
  clickReactions?: ClickReaction[];
  scale?: number;
}

/** The character: geometry + interaction. All motion lives in useMascotBrain. */
export function Mascot({ reducedMotion, clickReactions = DEFAULT_CLICK_REACTIONS, scale = 1 }: MascotProps) {
  const m = useMascotMaterials();
  const rig = useMemo(createRig, []);
  const drag = useRef<DragState>({ active: false, yaw: 0, vel: 0 });
  const clickIndex = useRef(0);

  useMascotBrain(rig, m, { reducedMotion, drag });

  // Drag-to-spin (works for mouse and touch). Short press = click.
  const press = useRef<{ x: number; lastX: number; lastT: number; moved: number } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pr = press.current;
      if (!pr) return;
      const dx = e.clientX - pr.lastX;
      const now = performance.now();
      pr.moved += Math.abs(dx);
      if (pr.moved > 6) {
        drag.current.active = true;
        drag.current.yaw += dx * 0.012;
        drag.current.vel = (dx * 0.012) / Math.max((now - pr.lastT) / 1000, 1 / 120);
      }
      pr.lastX = e.clientX;
      pr.lastT = now;
    };
    const onUp = () => {
      const pr = press.current;
      if (!pr) return;
      press.current = null;
      drag.current.active = false;
      document.body.style.cursor = mascotStore.get().hovered ? "grab" : "";
      if (pr.moved <= 6) react();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickReactions]);

  function react() {
    const r = clickReactions[clickIndex.current++ % clickReactions.length];
    mascotStore.setExpression(r.expression, 2600, "happy");
    mascotStore.trigger(r.reaction);
    if (r.say) mascotStore.say(r.say);
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    press.current = { x: e.clientX, lastX: e.clientX, lastT: performance.now(), moved: 0 };
    document.body.style.cursor = "grabbing";
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    mascotStore.setHovered(true);
    if (!press.current) document.body.style.cursor = "grab";
  };
  const onOut = () => {
    mascotStore.setHovered(false);
    if (!press.current) document.body.style.cursor = "";
  };

  return (
    <group scale={scale} name="NidusMascot">
      <group
        ref={assign<THREE.Group>((v) => (rig.root = v))}
        onPointerDown={onDown}
        onPointerOver={onOver}
        onPointerOut={onOut}
      >
        <Body rig={rig} m={m} />

        <group ref={assign<THREE.Group>((v) => (rig.head = v))} position={[0, 0.55, 0]}>
          <mesh geometry={headGeo} material={m.skin} scale={[1.12, 0.95, 0.98]} castShadow receiveShadow />
          <Eye side={-1} rig={rig.eyeL} m={m} position={[-0.28, 0.06, 0.45]} />
          <Eye side={1} rig={rig.eyeR} m={m} position={[0.28, 0.06, 0.45]} />
          <Face rig={rig} m={m} />
          <Glasses m={m} />
          <Antenna side={-1} rig={rig} m={m} />
          <Antenna side={1} rig={rig} m={m} />
          <GradCap rig={rig} m={m} />
        </group>
      </group>
    </group>
  );
}
