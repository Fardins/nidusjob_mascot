"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mascotStore } from "../store";
import { rand, random } from "../brain/rng";
import { createHoloMaterial } from "./holoMaterial";
import type { FxName } from "../brain/types";

/* ======================================================= particle atlas */

const KINDS = ["sparkle", "confetti", "z", "question", "heart", "dot"] as const;
type Kind = (typeof KINDS)[number];

function makeAtlas() {
  const cell = 64;
  const c = document.createElement("canvas");
  c.width = cell * KINDS.length;
  c.height = cell;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "middle";
  KINDS.forEach((k, i) => {
    const cx = i * cell + cell / 2;
    const cy = cell / 2;
    g.save();
    g.fillStyle = "#fff";
    g.strokeStyle = "#fff";
    if (k === "sparkle") {
      g.beginPath();
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        const r = j % 2 ? 7 : 28;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    } else if (k === "confetti") g.fillRect(cx - 12, cy - 6, 24, 12);
    else if (k === "z") {
      g.font = "bold 46px system-ui, sans-serif";
      g.fillText("Z", cx, cy + 2);
    } else if (k === "question") {
      g.font = "bold 48px system-ui, sans-serif";
      g.fillText("?", cx, cy + 3);
    } else if (k === "heart") {
      g.beginPath();
      g.moveTo(cx, cy + 20);
      g.bezierCurveTo(cx - 34, cy - 4, cx - 14, cy - 28, cx, cy - 10);
      g.bezierCurveTo(cx + 14, cy - 28, cx + 34, cy - 4, cx, cy + 20);
      g.fill();
    } else {
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, 28);
      grd.addColorStop(0, "rgba(255,255,255,1)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(cx - 32, cy - 32, 64, 64);
    }
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const MAX = 160;

interface P {
  alive: boolean;
  kind: number;
  life: number;
  age: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  size: number;
  spin: number;
  gravity: number;
}

/**
 * Pooled particle system (one draw call): sparkles on success, confetti on
 * celebrating, Z's while sleeping, "?" while confused, hearts on petting.
 */
export function Particles({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const pool = useMemo<P[]>(
    () =>
      Array.from({ length: MAX }, () => ({
        alive: false,
        kind: 0,
        life: 1,
        age: 0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        color: new THREE.Color(),
        size: 1,
        spin: 0,
        gravity: 0,
      })),
    [],
  );
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aKind", new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSpin", new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 4);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: { uAtlas: { value: makeAtlas() }, uCells: { value: KINDS.length }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec4 color;
        attribute float aSize, aKind, aSpin;
        uniform float uScale;
        varying vec4 vColor;
        varying float vKind, vSpin;
        void main() {
          vColor = color; vKind = aKind; vSpin = aSpin;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        uniform float uCells;
        varying vec4 vColor;
        varying float vKind, vSpin;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vSpin), s = sin(vSpin);
          p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
          if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
          vec4 tex = texture2D(uAtlas, vec2((vKind + p.x) / uCells, 1.0 - p.y));
          gl_FragColor = vec4(vColor.rgb * 1.6, tex.a * vColor.a);
          if (gl_FragColor.a < 0.01) discard;
        }`,
    });
    return { geo, mat };
  }, []);

  const lastFx = useRef(-1);
  const nextZ = useRef(0);

  function spawn(kind: Kind, n: number, at: THREE.Vector3, opts: { speed: number; up: number; spread: number; life: number; size: number; gravity: number; colors: string[] }) {
    const k = KINDS.indexOf(kind);
    let made = 0;
    for (const p of pool) {
      if (made >= n) break;
      if (p.alive) continue;
      p.alive = true;
      p.kind = k;
      p.age = 0;
      p.life = opts.life * rand(0.8, 1.2);
      p.pos.set(at.x + rand(-opts.spread, opts.spread), at.y + rand(-opts.spread, opts.spread) * 0.5, at.z + rand(-0.1, 0.1));
      const a = rand(0, Math.PI * 2);
      p.vel.set(Math.cos(a) * opts.speed * rand(0.4, 1), opts.up * rand(0.6, 1.2), Math.sin(a) * opts.speed * 0.4);
      p.color.set(opts.colors[Math.floor(random() * opts.colors.length)]);
      p.size = opts.size * rand(0.7, 1.3);
      p.spin = rand(-3, 3);
      p.gravity = opts.gravity;
      made++;
    }
  }

  const _at = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = mascotStore.get();
    const motion = reducedMotion ? 0.3 : 1;
    for (const fx of s.fx) {
      if (fx.id <= lastFx.current) continue;
      lastFx.current = fx.id;
      emit(fx.name);
    }
    if (s.assistantState === "sleeping" && state.clock.elapsedTime > nextZ.current) {
      nextZ.current = state.clock.elapsedTime + rand(1.2, 1.8);
      spawn("z", 1, _at.set(0.45, 1.05, 0.2), { speed: 0.05, up: 0.22, spread: 0.05, life: 3, size: 0.5, gravity: -0.01, colors: ["#cfe0ff"] });
    }

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const size = geo.attributes.aSize as THREE.BufferAttribute;
    const kind = geo.attributes.aKind as THREE.BufferAttribute;
    const spin = geo.attributes.aSpin as THREE.BufferAttribute;
    let n = 0;
    for (const p of pool) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-0.8 * dt));
      p.pos.addScaledVector(p.vel, dt * motion);
      if (p.kind === 2) p.pos.x += Math.sin(p.age * 2.5) * 0.002; // Z's drift
      const lifeK = p.age / p.life;
      const fade = Math.min(1, p.age / 0.12) * (1 - Math.max(0, (lifeK - 0.7) / 0.3));
      pos.setXYZ(n, p.pos.x, p.pos.y, p.pos.z);
      col.setXYZW(n, p.color.r, p.color.g, p.color.b, fade);
      size.setX(n, p.size * (p.kind === 2 ? 0.6 + lifeK * 0.8 : 1));
      kind.setX(n, p.kind);
      spin.setX(n, p.kind === 1 ? p.spin * p.age * 3 : p.kind === 0 ? p.age * 2 : 0);
      n++;
    }
    geo.setDrawRange(0, n);
    pos.needsUpdate = col.needsUpdate = size.needsUpdate = kind.needsUpdate = spin.needsUpdate = true;
  });

  function emit(name: FxName) {
    switch (name) {
      case "sparkles":
        spawn("sparkle", 26, _at.set(0, 0.6, 0.3), { speed: 1.4, up: 1.2, spread: 0.4, life: 1.2, size: 0.32, gravity: 1.2, colors: ["#fff6b0", "#d9ff5a", "#9ffbe8", "#ffffff"] });
        break;
      case "confetti":
        spawn("confetti", 70, _at.set(0, 1.4, 0.2), { speed: 1.6, up: 2.2, spread: 0.5, life: 2.4, size: 0.26, gravity: 2.4, colors: ["#ff6b81", "#fbbf24", "#22c55e", "#2f8cff", "#a78bfa", "#ffffff"] });
        break;
      case "question":
        spawn("question", 3, _at.set(0.55, 1.1, 0.2), { speed: 0.15, up: 0.35, spread: 0.15, life: 2, size: 0.5, gravity: 0, colors: ["#86d6ff", "#ffffff"] });
        break;
      case "hearts":
        spawn("heart", 6, _at.set(0, 0.9, 0.4), { speed: 0.35, up: 0.6, spread: 0.3, life: 1.6, size: 0.3, gravity: 0, colors: ["#ff8fa3", "#ff6b81"] });
        break;
      case "ripple":
        spawn("dot", 10, _at.set(0, 0.3, 0.5), { speed: 0.8, up: 0.2, spread: 0.05, life: 0.6, size: 0.18, gravity: 0, colors: ["#d9ff5a", "#ffffff"] });
        break;
    }
  }

  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/* ======================================================= holograms */

const qArc = new THREE.TorusGeometry(0.07, 0.022, 10, 32, Math.PI * 1.3);
const qStem = new THREE.CapsuleGeometry(0.02, 0.05, 4, 8);
const dotGeo = new THREE.SphereGeometry(0.028, 14, 10);
const exBar = new THREE.CapsuleGeometry(0.03, 0.15, 6, 10);
const ringGeo = new THREE.TorusGeometry(1.15, 0.012, 8, 128, Math.PI * 1.6);
const ringBase = new THREE.TorusGeometry(1.15, 0.004, 6, 128);
const bulbGeo = new THREE.SphereGeometry(0.09, 20, 14);
const bulbBase = new THREE.CylinderGeometry(0.04, 0.045, 0.06, 14);
const gearGeo = new THREE.TorusGeometry(0.08, 0.025, 8, 24);
const toothGeo = new THREE.BoxGeometry(0.035, 0.05, 0.03);
const barGeo = new THREE.BoxGeometry(0.04, 1, 0.03);
const cardGeo = new THREE.PlaneGeometry(0.62, 0.32);

/**
 * Hologram details: "?" when confused, "!" on errors, a progress ring
 * during long thinking, floating idea icons while explaining, and a card
 * previewing the topic of the answer.
 */
export function Holograms() {
  const mats = useMemo(
    () => ({
      q: createHoloMaterial("#86d6ff"),
      ex: createHoloMaterial("#ffb020"),
      ring: createHoloMaterial("#7ff7ff"),
      icon: createHoloMaterial("#d9ff5a"),
      card: createHoloMaterial("#9ffbe8"),
    }),
    [],
  );
  const cardTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { c, t };
  }, []);
  const cardText = useMemo(
    () =>
      new THREE.MeshBasicMaterial({ map: cardTex.t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }),
    [cardTex],
  );

  const q = useRef<THREE.Group>(null);
  const ex = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);
  const icons = useRef<THREE.Group>(null);
  const bulb = useRef<THREE.Group>(null);
  const gear = useRef<THREE.Group>(null);
  const chart = useRef<THREE.Group>(null);
  const card = useRef<THREE.Group>(null);
  const op = useRef({ q: 0, ex: 0, ring: 0, icon: 0, card: 0, which: 0 });
  const lastCard = useRef<string | null>(null);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const t = state.clock.elapsedTime;
    const s = mascotStore.get();
    const o = op.current;
    const k = 1 - Math.exp(-5 * dt);
    const recent = (name: FxName, ms: number) => s.fx.some((f) => f.name === name) && performance.now() - s.stateSince < ms;
    o.q += ((s.assistantState === "confused" || s.expression === "confused" || recent("question", 2000) ? 1 : 0) - o.q) * k;
    o.ex += ((s.assistantState === "error" ? 1 : 0) - o.ex) * k;
    o.ring += ((s.assistantState === "thinking" && s.thinkingEscalated ? 1 : 0) - o.ring) * k;
    const g = s.gesture?.name;
    const explaining = s.assistantState === "speaking" || s.expression === "explaining";
    if (g === "bigIdea") o.which = 0;
    else if (g === "count") o.which = 2;
    else if (g === "openPalm" || g === "pointSide") o.which = 1;
    o.icon += ((explaining ? 1 : 0) - o.icon) * k;
    o.card += ((s.card && (s.assistantState === "thinking" || s.assistantState === "speaking") ? 1 : 0) - o.card) * k;

    for (const m of Object.values(mats)) m.uniforms.uTime.value = t;
    mats.q.uniforms.uOpacity.value = o.q;
    mats.ex.uniforms.uOpacity.value = o.ex;
    mats.ring.uniforms.uOpacity.value = o.ring;
    mats.icon.uniforms.uOpacity.value = o.icon;
    mats.card.uniforms.uOpacity.value = o.card * 0.6;
    cardText.opacity = o.card;

    if (q.current) {
      q.current.visible = o.q > 0.01;
      q.current.position.y = 1.35 + Math.sin(t * 2) * 0.04;
      q.current.rotation.y = Math.sin(t * 1.3) * 0.4;
      q.current.scale.setScalar(0.6 + 0.4 * o.q);
    }
    if (ex.current) {
      ex.current.visible = o.ex > 0.01;
      ex.current.position.y = 1.38 + Math.sin(t * 3) * 0.03;
      ex.current.scale.setScalar(0.6 + 0.4 * o.ex);
    }
    if (ring.current) {
      ring.current.visible = o.ring > 0.01;
      ring.current.rotation.z = -t * 2.2;
    }
    if (icons.current) {
      icons.current.visible = o.icon > 0.01;
      icons.current.position.set(-0.95 + Math.sin(t * 0.8) * 0.05, 1.05 + Math.sin(t * 1.4) * 0.05, 0.2);
      icons.current.rotation.y = Math.sin(t * 0.9) * 0.5;
      icons.current.scale.setScalar(0.7 + 0.3 * o.icon);
      if (bulb.current) bulb.current.visible = o.which === 0;
      if (gear.current) {
        gear.current.visible = o.which === 1;
        gear.current.rotation.z = t * 1.5;
      }
      if (chart.current) {
        chart.current.visible = o.which === 2;
        chart.current.children.forEach((c, i) => (c.scale.y = 0.08 + 0.06 * (i + 1) + 0.03 * Math.sin(t * 3 + i)));
      }
    }
    if (card.current) {
      card.current.visible = o.card > 0.01;
      card.current.position.set(1.05, 0.95 + Math.sin(t * 1.1) * 0.03, 0.1);
      card.current.rotation.y = -0.4 + Math.sin(t * 0.7) * 0.05;
      if (s.card !== lastCard.current) {
        lastCard.current = s.card;
        const g2 = cardTex.c.getContext("2d")!;
        g2.clearRect(0, 0, 512, 256);
        g2.fillStyle = "rgba(160,255,240,0.9)";
        g2.font = "600 26px system-ui, sans-serif";
        g2.fillText("TOPIC", 28, 52);
        g2.font = "bold 40px system-ui, sans-serif";
        g2.fillStyle = "#ffffff";
        const text = (s.card ?? "").slice(0, 40);
        const words = text.split(" ");
        let line = "";
        let y = 120;
        for (const w of words) {
          if (g2.measureText(line + w).width > 450) {
            g2.fillText(line, 28, y);
            line = "";
            y += 50;
          }
          line += w + " ";
        }
        g2.fillText(line, 28, y);
        cardTex.t.needsUpdate = true;
      }
    }
  });

  return (
    <>
      <group ref={q} position={[0.62, 1.35, 0.1]} visible={false}>
        <mesh geometry={qArc} material={mats.q} position={[0, 0.06, 0]} rotation={[0, 0, -0.65]} />
        <mesh geometry={qStem} material={mats.q} position={[0.0, -0.04, 0]} />
        <mesh geometry={dotGeo} material={mats.q} position={[0, -0.13, 0]} />
      </group>
      <group ref={ex} position={[-0.6, 1.38, 0.1]} visible={false}>
        <mesh geometry={exBar} material={mats.ex} position={[0, 0.05, 0]} />
        <mesh geometry={dotGeo} material={mats.ex} position={[0, -0.12, 0]} />
      </group>
      <group ref={ring} position={[0, 0.25, 0]} rotation={[Math.PI / 2 - 0.25, 0, 0]} visible={false}>
        <mesh geometry={ringGeo} material={mats.ring} />
        <mesh geometry={ringBase} material={mats.ring} />
      </group>
      <group ref={icons} visible={false}>
        <group ref={bulb}>
          <mesh geometry={bulbGeo} material={mats.icon} />
          <mesh geometry={bulbBase} material={mats.icon} position={[0, -0.11, 0]} />
        </group>
        <group ref={gear}>
          <mesh geometry={gearGeo} material={mats.icon} />
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={i} geometry={toothGeo} material={mats.icon} position={[Math.cos((i / 8) * Math.PI * 2) * 0.11, Math.sin((i / 8) * Math.PI * 2) * 0.11, 0]} rotation={[0, 0, (i / 8) * Math.PI * 2]} />
          ))}
        </group>
        <group ref={chart}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={barGeo} material={mats.icon} position={[-0.06 + i * 0.06, 0, 0]} />
          ))}
        </group>
      </group>
      <group ref={card} visible={false}>
        <mesh geometry={cardGeo} material={mats.card} />
        <mesh geometry={cardGeo} material={cardText} position={[0, 0, 0.002]} />
      </group>
    </>
  );
}
