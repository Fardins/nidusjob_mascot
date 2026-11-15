"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useMascotMaterials } from "./materials";
import { assign, createRig } from "./rig";
import { mascotStore, useMascot } from "./store";
import { mascot } from "./brain/api";
import type { ClickReaction } from "./reactions";
import { useMascotBrain, type DragState } from "./useMascotBrain";
import { Eye } from "./parts/Eye";
import { Face } from "./parts/Face";
import { Antenna, Glasses, GradCap } from "./parts/Accessories";
import { Body, Scarf } from "./parts/Body";

const headGeo = new THREE.SphereGeometry(0.62, 64, 48);

export interface MascotProps {
  reducedMotion?: boolean;
  /** Legacy: custom click reactions. When set, clicks cycle through these instead of opening the chat. */
  clickReactions?: ClickReaction[];
  scale?: number;
  /** Show eyelashes (off on the lowest tiers). */
  lashes?: boolean;
}

/** The character: geometry + interaction. All motion lives in useMascotBrain. */
export function Mascot({ reducedMotion, clickReactions, scale = 1, lashes = true }: MascotProps) {
  const m = useMascotMaterials();
  const rig = useMemo(createRig, []);
  const drag = useRef<DragState>({ active: false, yaw: 0, vel: 0 });
  const clickIndex = useRef(0);
  const accessory = useMascot((s) => s.accessory);

  useMascotBrain(rig, m, { reducedMotion, drag });

  // Drag-to-spin (horizontal), petting (vertical rub). Short press = click.
  const press = useRef<{ x: number; y: number; lastX: number; lastY: number; lastT: number; dx: number; dy: number; lastPet: number } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pr = press.current;
      if (!pr) return;
      const dx = e.clientX - pr.lastX;
      const dy = e.clientY - pr.lastY;
      const now = performance.now();
      pr.dx += Math.abs(dx);
      pr.dy += Math.abs(dy);
      if (pr.dy > 18 && pr.dy > pr.dx * 1.4) {
        // rubbing up and down = petting
        if (now - pr.lastPet > 450) {
          pr.lastPet = now;
          mascot.pet(e.clientX, e.clientY);
        }
      } else if (pr.dx > 6) {
        drag.current.active = true;
        drag.current.yaw += dx * 0.012;
        drag.current.vel = (dx * 0.012) / Math.max((now - pr.lastT) / 1000, 1 / 120);
      }
      pr.lastX = e.clientX;
      pr.lastY = e.clientY;
      pr.lastT = now;
    };
    const onUp = () => {
      const pr = press.current;
      if (!pr) return;
      press.current = null;
      drag.current.active = false;
      document.body.style.cursor = mascotStore.get().hovered ? "grab" : "";
      if (pr.dx <= 6 && pr.dy <= 6) react();
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
    if (clickReactions?.length) {
      const r = clickReactions[clickIndex.current++ % clickReactions.length];
      mascotStore.setExpression(r.expression, 2600);
      mascotStore.trigger(r.reaction);
      if (r.say) mascotStore.say(r.say);
      return;
    }
    mascot.click("pointer");
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    press.current = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, lastT: performance.now(), dx: 0, dy: 0, lastPet: 0 };
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
      <group ref={assign<THREE.Group>((v) => (rig.root = v))} onPointerDown={onDown} onPointerOver={onOver} onPointerOut={onOut}>
        <Body rig={rig} m={m} />
        {accessory === "scarf" && <Scarf m={m} />}

        <group ref={assign<THREE.Group>((v) => (rig.head = v))} position={[0, 0.55, 0]}>
          <mesh geometry={headGeo} material={m.skin} scale={[1.12, 0.95, 0.98]} castShadow receiveShadow />
          <Eye side={-1} rig={rig.eyeL} m={m} position={[-0.28, 0.06, 0.45]} lashes={lashes} />
          <Eye side={1} rig={rig.eyeR} m={m} position={[0.28, 0.06, 0.45]} lashes={lashes} />
          <Face rig={rig} m={m} />
          <Glasses rig={rig} m={m} />
          <Antenna side={-1} rig={rig} m={m} />
          <Antenna side={1} rig={rig} m={m} />
          <GradCap rig={rig} m={m} />
        </group>
      </group>
    </group>
  );
}
