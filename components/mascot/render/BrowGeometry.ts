import * as THREE from "three";

const SEG = 18; // along the brow
const RAD = 8; // around the tube

/**
 * A tapered tube through three control points (inner, mid, outer) whose
 * vertices are rewritten in place every frame — fixed vertex count, no
 * allocation. Gives the brows real shape changes (worried, angry, arched…)
 * instead of a rigid bar that only moves and tilts.
 */
export class BrowGeometry extends THREE.BufferGeometry {
  private pos: Float32Array;
  private nor: Float32Array;
  private last = [NaN, NaN, NaN];

  /** `innerSign` = +1 when the inner end lies toward +x in brow-local space. */
  constructor(
    private innerSign: 1 | -1,
    private halfLength = 0.078,
    private radius = 0.022,
  ) {
    super();
    const verts = (SEG + 1) * (RAD + 1);
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const idx: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      for (let j = 0; j <= RAD; j++) {
        const k = i * (RAD + 1) + j;
        uv[k * 2] = i / SEG;
        uv[k * 2 + 1] = j / RAD;
        if (i < SEG && j < RAD) {
          const a = k;
          const b = k + RAD + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    this.setIndex(idx);
    this.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.setAttribute("normal", new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.update(0, 0, 0);
    this.computeBoundingSphere();
    if (this.boundingSphere) this.boundingSphere.radius += 0.06;
  }

  /** Heights (y offsets) of the inner, middle and outer points. */
  update(inner: number, mid: number, outer: number) {
    if (Math.abs(inner - this.last[0]) + Math.abs(mid - this.last[1]) + Math.abs(outer - this.last[2]) < 1e-5) return;
    this.last[0] = inner;
    this.last[1] = mid;
    this.last[2] = outer;
    const L = this.halfLength;
    const x0 = this.innerSign * L;
    const x2 = -this.innerSign * L;
    // natural arch: the middle sits a little higher
    const y0 = inner;
    const y1 = mid + 0.012;
    const y2 = outer - 0.004;
    // quadratic bezier control point so the curve passes through the mid point
    const cx = 0;
    const cy = 2 * y1 - (y0 + y2) / 2;
    const P = this.pos;
    const N = this.nor;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      const px = a * x0 + b * cx + c * x2;
      const py = a * y0 + b * cy + c * y2;
      // tangent
      let tx = 2 * (1 - u) * (cx - x0) + 2 * u * (x2 - cx);
      let ty = 2 * (1 - u) * (cy - y0) + 2 * u * (y2 - cy);
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      // in-plane normal; binormal is +z
      const nx = -ty;
      const ny = tx;
      // taper: fuller toward the inner end, thin at the outer tip
      const taper = Math.sin(Math.PI * (0.12 + 0.88 * u)) * (1.05 - 0.35 * u);
      const r = this.radius * Math.max(0.25, taper);
      for (let j = 0; j <= RAD; j++) {
        const th = (j / RAD) * Math.PI * 2;
        const cs = Math.cos(th);
        const sn = Math.sin(th);
        const k = (i * (RAD + 1) + j) * 3;
        const ox = nx * cs;
        const oy = ny * cs;
        const oz = sn * 0.75; // slightly flattened against the head
        P[k] = px + ox * r;
        P[k + 1] = py + oy * r;
        P[k + 2] = oz * r;
        const nl = Math.hypot(ox, oy, oz) || 1;
        N[k] = ox / nl;
        N[k + 1] = oy / nl;
        N[k + 2] = oz / nl;
      }
    }
    (this.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
  }
}
