import * as THREE from "three";
import type { BoneMap } from "./rigUtils";

/** World position of the small, bright softbox that should reflect in the eyes (see PlushLighting). */
export const CATCH_LIGHT_POSITION = new THREE.Vector3(1.4, 2.2, 4);

function glowTexture() {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Eye {
  mesh: THREE.Mesh;
  /** Bone that carries the eye when the mesh is skinned. */
  bone?: THREE.Bone;
  center: THREE.Vector3; // local (mesh) bounding-sphere centre
  radius: number;
  core: THREE.Sprite;
  halo: THREE.Sprite;
}

const _c = new THREE.Vector3();
const _l = new THREE.Vector3();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Specular catch-lights with a soft glow, placed where a spherical cornea
 * would reflect the catch-light softbox: on the half-vector between the
 * light and the camera. This is the "bloom only on catch-lights" — done as
 * two additive sprites per eye instead of a full-screen post pass, so it is
 * cheap on phones and keeps the canvas background transparent.
 */
export class CatchLights {
  readonly group = new THREE.Group();
  private eyes: Eye[] = [];
  private tex: THREE.Texture;
  private mats: THREE.SpriteMaterial[] = [];

  constructor(eyeMeshes: THREE.Mesh[], bones: BoneMap) {
    this.tex = glowTexture();
    this.group.name = "CatchLights";
    const mk = (opacity: number) => {
      const m = new THREE.SpriteMaterial({
        map: this.tex,
        color: new THREE.Color(1, 1, 1).multiplyScalar(opacity > 0.5 ? 2.2 : 1.2), // > 1: reads as HDR highlight
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this.mats.push(m);
      return m;
    };

    for (const mesh of eyeMeshes) {
      mesh.geometry.computeBoundingSphere();
      const bs = mesh.geometry.boundingSphere!;
      const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
      mesh.updateWorldMatrix(true, false);
      const worldCenter = bs.center.clone().applyMatrix4(mesh.matrixWorld);
      // skinned eyes follow their bone; pick the closer of the two eye bones
      let bone: THREE.Bone | undefined;
      if (skinned) {
        const cands = [bones.eyeL, bones.eyeR].filter(Boolean) as THREE.Bone[];
        bone = cands.sort((a, b) => a.getWorldPosition(_c).distanceTo(worldCenter) - b.getWorldPosition(_v).distanceTo(worldCenter))[0] ?? bones.head;
      }
      // skip duplicates (iris + cornea + eyeball of the same eye)
      if (this.eyes.some((e) => this.worldCenter(e, _s).distanceTo(worldCenter) < bs.radius * mesh.matrixWorld.getMaxScaleOnAxis() * 0.6)) continue;
      const core = new THREE.Sprite(mk(0.95));
      const halo = new THREE.Sprite(mk(0.28));
      core.renderOrder = halo.renderOrder = 10;
      core.visible = halo.visible = false; // until the first update places and sizes them
      this.group.add(halo, core);
      this.eyes.push({ mesh, bone, center: bs.center.clone(), radius: bs.radius, core, halo });
    }
  }

  get count() {
    return this.eyes.length;
  }

  private worldCenter(e: Eye, out: THREE.Vector3) {
    return e.bone && (e.mesh as THREE.SkinnedMesh).isSkinnedMesh ? e.bone.getWorldPosition(out) : out.copy(e.center).applyMatrix4(e.mesh.matrixWorld);
  }

  update(camera: THREE.Camera, intensity: number) {
    for (const e of this.eyes) {
      this.worldCenter(e, _c);
      const r = e.radius * e.mesh.matrixWorld.getMaxScaleOnAxis();
      _l.subVectors(CATCH_LIGHT_POSITION, _c).normalize();
      _v.subVectors(camera.position, _c).normalize();
      const h = _l.add(_v).normalize();
      // only visible on the camera-facing side of the cornea
      const facing = THREE.MathUtils.smoothstep(h.dot(_v), 0.2, 0.6);
      e.core.position.copy(_c).addScaledVector(h, r * 1.01);
      e.halo.position.copy(e.core.position);
      e.core.scale.setScalar(r * 0.32);
      e.halo.scale.setScalar(r * 1.1);
      e.core.material.opacity = 0.95 * facing * intensity;
      e.halo.material.opacity = 0.28 * facing * intensity;
      e.core.visible = e.halo.visible = facing > 0;
    }
  }

  dispose() {
    this.tex.dispose();
    this.mats.forEach((m) => m.dispose());
    this.group.removeFromParent();
  }
}
