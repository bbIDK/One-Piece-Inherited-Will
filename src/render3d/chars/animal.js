// Real animals for the beasts of the islands: rigged, animated low-poly models
// (Quaternius' CC0 animal packs, turned into game assets by
// tools/fbx2animal.mjs) instead of a human body with fur and a muzzle. Each
// kind is one of those models, sized and painted for what it is — a Wild
// Boar is the pig, dark brown; a Mountain Tiger is the cat, three times the
// size, orange with black stripes and a white belly — cel-shaded with an ink
// outline that bends with the skin. Its clips play from what it's doing:
// idle, walking or running (sped up with its pace), lunging when it attacks
// (the jump clip, or a pounce of the whole body), and down on its side when
// it's beaten.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { toonGradient } from '../materials.js';
import { Label } from './fx.js';
import pig from '../../assets/animals/pig.js';
import cat from '../../assets/animals/cat.js';
import dog from '../../assets/animals/dog.js';
import wolf from '../../assets/animals/wolf.js';
import sheep from '../../assets/animals/sheep.js';
import chick from '../../assets/animals/chick.js';

const MODELS = { pig, cat, dog, wolf, sheep, chick };

/**
 * What each beast is drawn as: the model, its length nose to tail (m), and
 * how it's painted — `tint` multiplies the model's own colours; `coat`
 * paints a plain model from scratch (back, belly, and optional stripes).
 */
export const ANIMALS = {
  boar: { model: 'pig', len: 1.55, tint: '#7a5038', label: 1.3 },
  tiger: { model: 'cat', len: 2.5, coat: { back: '#f08a24', belly: '#fff3e0', stripe: '#2b1d14', stripes: 9 }, label: 1.9 },
  wolf: { model: 'wolf', len: 1.6, coat: { back: '#8d939b', belly: '#e9ecef' }, label: 1.2 },
  dog: { model: 'dog', len: 0.95, coat: { back: '#c08a4e', belly: '#f3e2c8' }, label: 0.9 },
  cat: { model: 'cat', len: 0.6, coat: { back: '#8a8d93', belly: '#f2f2f2', stripe: '#4a4d52', stripes: 7 }, label: 0.6 },
  sheep: { model: 'sheep', len: 1.2, label: 1.1 },
  chick: { model: 'chick', len: 0.32, coat: { back: '#ffd54f', belly: '#fff59d' }, label: 0.4 },
};

// ---------------------------------------------------------------- loading (once per model)
const loaded = new Map(); // model → Promise<{ scene, clips }>
function load(model) {
  let p = loaded.get(model);
  if (!p) {
    const bin = Uint8Array.from(atob(MODELS[model]), (c) => c.charCodeAt(0));
    p = new GLTFLoader().parseAsync(bin.buffer, '').then((g) => ({ scene: g.scene, clips: g.animations }));
    loaded.set(model, p);
  }
  return p;
}

// ---------------------------------------------------------------- materials
// (one painted geometry and set of materials per kind, shared by all of that kind)
const _c = new THREE.Color(), _d = new THREE.Color();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
function coatGeometry(geo, coat, mw) {
  const g = geo.clone();
  // (measured as the model stands — its own frame may have z up — but painted onto its own vertices)
  const P = g.attributes.position, N = g.attributes.normal;
  const pos = new THREE.BufferAttribute(new Float32Array(P.count * 3), 3), nor = N && new THREE.BufferAttribute(new Float32Array(N.count * 3), 3);
  _m3.getNormalMatrix(mw);
  for (let i = 0; i < P.count; i++) {
    _v.fromBufferAttribute(P, i).applyMatrix4(mw); pos.setXYZ(i, _v.x, _v.y, _v.z);
    if (N) { _n.fromBufferAttribute(N, i).applyMatrix3(_m3).normalize(); nor.setXYZ(i, _n.x, _n.y, _n.z); }
  }
  const bb = new THREE.Box3().setFromBufferAttribute(pos);
  const sx = bb.max.x - bb.min.x || 1, sy = bb.max.y - bb.min.y || 1, sz = bb.max.z - bb.min.z || 1;
  // (the model's long axis, whatever its own frame: the stripes run across it)
  const long = sx >= sz ? 'x' : 'z', L = long === 'x' ? sx : sz, l0 = long === 'x' ? bb.min.x : bb.min.z;
  const back = new THREE.Color(coat.back), belly = new THREE.Color(coat.belly), stripe = coat.stripe && new THREE.Color(coat.stripe);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = (pos.getY(i) - bb.min.y) / sy, ny = nor ? nor.getY(i) : 0;
    const u = ((long === 'x' ? pos.getX(i) : pos.getZ(i)) - l0) / L;
    // pale underneath (the belly, the chest, the insides of the legs), the coat colour above
    const under = Math.min(1, Math.max(0, (0.5 - y) * 2.2 + Math.max(0, -ny) * 0.9));
    _c.copy(back).lerp(belly, under * 0.85);
    if (stripe && y > 0.3 && Math.sin(u * Math.PI * 2 * coat.stripes + y * 3) > 0.62 && under < 0.5) _c.lerp(stripe, 0.85);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function outlineMaterial(thick) {
  const m = new THREE.MeshBasicMaterial({ color: 0x2b1d14, side: THREE.BackSide });
  // (pushed out along the normal before the skinning, so the line bends with the body)
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(objectNormal) * ${thick.toFixed(5)};`); };
  m.customProgramCacheKey = () => 'animalInk' + thick.toFixed(5);
  return m;
}
const kinds = new Map(); // kind → { geos: Map(src → painted), mats: Map, ink: Map }
function dressed(kind) {
  let k = kinds.get(kind);
  if (!k) { k = { geos: new Map(), mats: new Map(), ink: new Map() }; kinds.set(kind, k); }
  return k;
}
function toonOf(color, vc) { return new THREE.MeshToonMaterial({ color, vertexColors: vc, gradientMap: toonGradient() }); }

/** A model of this kind, dressed: its own skinned copy, painted, with an outline that follows the skin. */
function build(kind, src) {
  const K = ANIMALS[kind], D = dressed(kind);
  const scene = cloneSkinned(src.scene);
  const meshes = [];
  scene.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) meshes.push(o); });
  src.scene.updateMatrixWorld(true);
  const srcMeshes = [];
  src.scene.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) srcMeshes.push(o); });
  meshes.forEach((m, mi) => {
    if (K.coat) {
      let g = D.geos.get(m.geometry);
      if (!g) { g = coatGeometry(m.geometry, K.coat, srcMeshes[mi].matrixWorld); D.geos.set(m.geometry, g); }
      m.geometry = g;
      let mat = D.mats.get('coat');
      if (!mat) { mat = toonOf('#ffffff', true); D.mats.set('coat', mat); }
      m.material = mat;
    } else {
      m.material = [].concat(m.material).map((om) => {
        const key = om.name + om.color.getHexString();
        let mat = D.mats.get(key);
        if (!mat) {
          const c = om.color.clone();
          if (K.tint) c.multiply(_d.set(K.tint)).multiplyScalar(1.6);
          mat = toonOf(c, false);
          D.mats.set(key, mat);
        }
        return mat;
      });
      if (m.material.length === 1) m.material = m.material[0];
    }
    m.castShadow = true;
    m.frustumCulled = false;
    // the ink line: the same skin drawn again, inside out and a little fatter
    m.geometry.computeBoundingSphere();
    const thick = m.geometry.boundingSphere.radius * 0.025;
    let ink = D.ink.get(thick);
    if (!ink) { ink = outlineMaterial(thick); D.ink.set(thick, ink); }
    const shell = m.isSkinnedMesh ? new THREE.SkinnedMesh(m.geometry, ink) : new THREE.Mesh(m.geometry, ink);
    if (m.isSkinnedMesh) shell.bind(m.skeleton, m.bindMatrix);
    shell.frustumCulled = false;
    shell.position.copy(m.position); shell.quaternion.copy(m.quaternion); shell.scale.copy(m.scale);
    m.parent.add(shell);
  });
  return scene;
}

// ---------------------------------------------------------------- the view
export class AnimalView {
  constructor(a, kind) {
    this.a = a;
    this.kind = kind;
    const K = ANIMALS[kind];
    this.root = new THREE.Group();
    this.yaw = new THREE.Group();
    this.root.add(this.yaw);
    this.body = new THREE.Group(); // (pounces, falls over: on top of the clips)
    this.yaw.add(this.body);
    this.size = K.len * (a.look?.scale || 1);
    this.body.scale.setScalar(this.size);
    this.label = new Label();
    this.root.add(this.label.sprite);
    this.mixer = null; this.acts = {}; this.cur = null;
    this.lastT = null;
    load(K.model).then((src) => {
      if (this.disposed) return;
      const model = build(kind, src);
      this.body.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of src.clips) this.acts[clip.name] = this.mixer.clipAction(clip);
      this.play('idle', 0);
    });
  }

  play(name, fade = 0.25) {
    const act = this.acts[name] || this.acts.idle;
    if (!act || act === this.cur) return act;
    act.reset().setEffectiveWeight(1).play();
    if (this.cur) this.cur.crossFadeTo(act, fade, false);
    this.cur = act;
    return act;
  }

  update(a, env, ctx) {
    const t = env.time, dt = this.lastT == null ? 0 : Math.min(0.25, Math.max(0, t - this.lastT));
    this.lastT = t;
    this.yaw.rotation.y = -(a.facing || 0);
    const speed = Math.hypot(a.vx || 0, a.vy || 0);
    const down = a.state === 'knocked' || a.state === 'dead';
    const act = a.action;
    // what it's doing → which clip, and how fast
    let pounce = 0;
    if (down) {
      if (this.acts.death) { const d = this.play('death', 0.15); d.setLoop(THREE.LoopOnce, 1); d.clampWhenFinished = true; }
      else this.play('idle');
    } else if (act) {
      const w = act.def.windup ?? 0.3, k = act.t < w ? act.t / w : Math.max(0, 1 - (act.t - w) * 4);
      pounce = k;
      if (this.acts.jump) { const j = this.play('jump', 0.1); j.timeScale = 1.4; } else this.play('idle', 0.1);
    } else if (speed > 0.25) {
      const run = speed > 3.2 * (a.look?.scale || 1) && this.acts.run;
      const c = this.play(run ? 'run' : this.acts.walk ? 'walk' : 'idle', 0.2);
      if (c && (c === this.acts.walk || c === this.acts.run)) c.timeScale = Math.min(2.6, 0.5 + speed / (run ? 6 : 2.2) / this.size * 1.2);
    } else this.play('idle');
    this.mixer?.update(dt);
    // a pig or a sheep has no walk of its own: it trots with a bob and a waggle
    const trot = !down && !act && speed > 0.25 && !this.acts.walk;
    this.body.position.y = trot ? Math.abs(Math.sin(t * (6 + speed))) * 0.05 * this.size : 0;
    this.body.rotation.z = (trot ? Math.sin(t * (6 + speed) * 2) * 0.04 : 0) + pounce * 0.22;
    this.body.position.x = pounce * 0.25 * this.size;
    // beaten and no death clip: over on its side
    const fall = down && !this.acts.death ? Math.min(1, (a.knockT || 0) * 3) : 0;
    this.body.rotation.x = fall * Math.PI / 2;
    // the name and health bar, over its back
    const showBar = a.damageShown > 0 && a.state === 'idle';
    this.label.set(a.showName && a.state === 'idle' ? a.name : null, a.nameColor || '#fff', showBar ? Math.max(0, a.hp / a.d.maxHp) : null, '#ef5350', showBar ? `${Math.max(0, Math.ceil(a.hp))} / ${Math.round(a.d.maxHp)}` : null);
    this.label.sprite.position.set(0, ANIMALS[this.kind].label * (a.look?.scale || 1) + 0.4, 0);
    const cam = ctx.camera;
    const dist = cam ? cam.position.distanceTo(this.root.position) : 10;
    const k = Math.min(2.4, Math.max(0.5, dist / 8));
    this.label.sprite.scale.set(2 * k, 2 * k * 40 / 256, 1);
  }

  dispose() { this.disposed = true; this.mixer?.stopAllAction(); this.label.dispose(); this.root.removeFromParent(); }
}
