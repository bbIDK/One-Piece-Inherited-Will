// Instanced meshes split up for culling: one set near the centre, and eight
// wedges around it beyond, each with its own bounds, so the wedges behind the
// camera aren't drawn at all. Beyond the near set, a simpler model can stand
// in. (The ground cover and the sea bed are scattered around a centre that
// follows the camera; this is how each of their kinds is drawn.)
import * as THREE from 'three';

// which wedge a point (dx, dz) from the centre falls in, for 1, 4 or 8 wedges
const WEDGE = {
  1: () => 0,
  4: (dx, dz) => (dx >= 0 ? 0 : 2) + (dz >= 0 ? 0 : 1),
  8: (dx, dz) => (dx >= 0 ? 0 : 4) + (dz >= 0 ? 0 : 2) + (Math.abs(dx) >= Math.abs(dz) ? 0 : 1),
};

export class WedgeSet {
  /**
   * group: where the meshes go; name: for debugging;
   * geo / farGeo: the model near and beyond `near` metres; mat: the material;
   * capNear / capFar: how many instances near, and beyond in all the wedges
   * together (one wedge may take `share` of those); wedges: 8 for a dense
   * kind, 4 or just 1 for sparse ones (each wedge in view is a draw call);
   * pad: the model's size (m), for the bounds; setup(mesh): shadows and such.
   */
  constructor(group, name, { geo, farGeo = geo, mat, capNear, capFar, near, wedges = 8, pad = 1, share = 0.3, setup = null }) {
    this.n2 = near * near;
    this.wedgeOf = WEDGE[wedges];
    this.capFar = capFar;
    this.pad = pad;
    this.meshes = [];
    const make = (g, cap, nm) => {
      const m = new THREE.InstancedMesh(g, mat, cap);
      m.name = nm;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.count = 0;
      m.visible = false;
      m.boundingSphere = new THREE.Sphere();
      m.userData.cap = cap;
      m.userData.box = new Float32Array(6);
      if (setup) setup(m);
      group.add(m);
      this.meshes.push(m);
      return m;
    };
    this.nearMesh = make(geo, capNear, name);
    const wc = wedges === 1 ? capFar : Math.ceil(capFar * Math.min(1, share * 8 / wedges));
    this.wedges = [];
    for (let i = 0; i < wedges; i++) this.wedges.push(make(farGeo, wc, `${name}.far${i}`));
    this.farCount = 0;
  }

  /** Start placing again. */
  reset() {
    for (const m of this.meshes) {
      m.count = 0;
      const b = m.userData.box;
      b[0] = b[1] = b[2] = Infinity; b[3] = b[4] = b[5] = -Infinity;
    }
    this.farCount = 0;
  }

  /**
   * One instance at (dx, h, dz) from the centre, turned by rot about the
   * vertical and scaled (s, sy, s), in colour (r, g, b). False when full.
   */
  put(dx, h, dz, rot, s, sy, r, g, b) {
    let m;
    if (dx * dx + dz * dz <= this.n2) m = this.nearMesh;
    else {
      if (this.farCount >= this.capFar) return false;
      m = this.wedges[this.wedgeOf(dx, dz)];
    }
    const idx = m.count;
    if (idx >= m.userData.cap) return false;
    m.count++;
    if (m !== this.nearMesh) this.farCount++;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const e = m.instanceMatrix.array, o = idx * 16;
    e[o] = c * s; e[o + 1] = 0; e[o + 2] = -sn * s; e[o + 3] = 0;
    e[o + 4] = 0; e[o + 5] = sy; e[o + 6] = 0; e[o + 7] = 0;
    e[o + 8] = sn * s; e[o + 9] = 0; e[o + 10] = c * s; e[o + 11] = 0;
    e[o + 12] = dx; e[o + 13] = h; e[o + 14] = dz; e[o + 15] = 1;
    const ca = m.instanceColor.array, oc = idx * 3;
    ca[oc] = r; ca[oc + 1] = g; ca[oc + 2] = b;
    const bx = m.userData.box;
    if (dx < bx[0]) bx[0] = dx;
    if (h < bx[1]) bx[1] = h;
    if (dz < bx[2]) bx[2] = dz;
    if (dx > bx[3]) bx[3] = dx;
    if (h > bx[4]) bx[4] = h;
    if (dz > bx[5]) bx[5] = dz;
    return true;
  }

  /** Done placing: each mesh's bounds, and only the part in use goes to the GPU. */
  finish() {
    for (const m of this.meshes) {
      m.visible = m.count > 0;
      if (!m.count) continue;
      const b = m.userData.box;
      m.boundingSphere.center.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      m.boundingSphere.radius = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2 + this.pad * 2;
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, m.count * 16); m.instanceMatrix.needsUpdate = true;
      m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, m.count * 3); m.instanceColor.needsUpdate = true;
    }
  }

  /** Instances placed (near and far). */
  get count() { let n = 0; for (const m of this.meshes) n += m.count; return n; }
}
