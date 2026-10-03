// Afterimages in 3D: a dash, a dodge, a teleport leaves translucent copies
// of the character in the pose it had — the real 3D body, frozen, glowing
// in the afterimage's tint brightest round its silhouette. Each ghost is a
// skinned mesh sharing the character's own geometry, bound to a skeleton of
// stand-in bones holding a snapshot of the pose (taken the first frame the
// ghost is seen, relative to where the character stood, so it can sit
// wherever the ghost is placed). Pooled: no garbage while dashing.
// Characters without a skinned 3D model keep the 2D afterimage.
import * as THREE from 'three';
import { col } from './kit.js';

const MAX = 28;
const IDENT = new THREE.Matrix4();

const VS = /* glsl */`
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vN, vV;
  void main() {
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <beginnormal_vertex>
    #include <skinnormal_vertex>
    #include <skinning_vertex>
    vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
    vN = normalize(normalMatrix * objectNormal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const FS = /* glsl */`
  uniform vec3 uTint;
  uniform float uAlpha, uAdd;
  varying vec3 vN, vV;
  void main() {
    float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
    vec3 c = uTint * (0.45 + 1.1 * fr);
    float a = uAlpha * (0.3 + 0.7 * fr);
    gl_FragColor = vec4(c * a, a * (1.0 - uAdd));
    #include <colorspace_fragment>
  }
`;

class Ghost {
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTint: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 0.5 }, uAdd: { value: 0.5 } },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = null; this.skel = null; this.bones = []; this.inv = [];
    this.geo = null;
  }

  /** Copy the pose of a skinned mesh, relative to the point (ax, ay, az). */
  take(src, ax, ay, az) {
    const sk = src.skeleton, n = sk.bones.length;
    if (this.bones.length !== n || !this.mesh || this.geo !== src.geometry) {
      while (this.bones.length < n) { this.bones.push(new THREE.Object3D()); this.inv.push(new THREE.Matrix4()); }
      this.bones.length = n; this.inv.length = n;
      if (this.skel) this.skel.dispose();
      this.skel = new THREE.Skeleton(this.bones, this.inv);
      if (!this.mesh || this.geo !== src.geometry) {
        this.mesh = new THREE.SkinnedMesh(src.geometry, this.mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 3;
        this.geo = src.geometry;
      }
      this.mesh.bindMode = 'detached';
      this.mesh.bind(this.skel, IDENT);
      this.mesh.bindMatrixInverse.identity();
    }
    for (let i = 0; i < n; i++) {
      const m = this.bones[i].matrixWorld;
      m.copy(sk.bones[i].matrixWorld);
      m.elements[12] -= ax; m.elements[13] -= ay; m.elements[14] -= az;
      this.inv[i].copy(sk.boneInverses[i]);
    }
  }
}

export class Ghosts {
  constructor(v) {
    this.v = v;
    this.group = new THREE.Group();
    this.group.name = 'vfx-ghosts';
    v.group.add(this.group);
    this.pool = [];
    this.live = new Map();
    this.frame = 0;
    this._sweep = (g, s) => {
      if (g.frame === this.frame) return;
      if (g.mesh) g.mesh.removeFromParent();
      this.pool.push(g);
      this.live.delete(s);
    };
  }

  /** Is this afterimage drawn here? */
  has(s) { return this.live.has(s); }

  begin() { this.frame++; }

  /** One afterimage shape: snapshot its actor's 3D pose the first time, then place and fade it. */
  draw(s, k, a) {
    let g = this.live.get(s);
    const v = this.v;
    if (!g) {
      const act = s.actor;
      const view = act && v.view.actorViews.get(act);
      const src = view && view.model && view.model.mesh;
      if (!src || !src.isSkinnedMesh || !src.skeleton || !view.root || this.live.size >= MAX) return false;
      // (first person: your own body is only drawn below the neck — its afterimages would be headless)
      if (act === v.player && v.fp) return false;
      g = this.pool.pop() || new Ghost();
      // (the body's matrices as posed this frame, not as last drawn)
      view.root.updateMatrixWorld(true);
      const r = view.root.position;
      g.take(src, r.x, r.y, r.z);
      g.dy = r.y - v.ground(act.x, act.y);
      this.live.set(s, g);
      this.group.add(g.mesh);
    }
    g.frame = this.frame;
    const m = g.mesh;
    m.position.set(v.lx(s.x), v.ground(s.x, s.y) + g.dy, v.lz(s.y));
    m.updateMatrixWorld(true);
    const c = col(s.look && s.look.skin ? s.look.skin : '#e3f2fd');
    g.mat.uniforms.uTint.value.setRGB(c[0], c[1], c[2]);
    g.mat.uniforms.uAlpha.value = Math.min(1, (s.alpha ?? 0.5) * 1.3) * (1 - k) * a;
    g.mat.uniforms.uAdd.value = s.add ? 0.9 : 0.45;
    return true;
  }

  end() { this.live.forEach(this._sweep); }

  clear() {
    this.live.forEach((g) => { if (g.mesh) g.mesh.removeFromParent(); this.pool.push(g); });
    this.live.clear();
  }
}
