// Sea life and the feel of being under water, in 3D: the shoals from
// game/sealife.js as instanced cartoon fish (big eyes, tails beating, bellies
// pale, backs dark; flying fish with long wing fins, leaping and gliding), a
// model each for the bigger animals — the trunked Elephant Honmaguro, baby Sea
// Kings, Sea Cats and Yagara Bulls — and, once your head goes under, motes
// drifting in the water and shafts of sunlight slanting down from the surface.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { toon, addOutline, toonGradient } from './materials.js';

const TAU = Math.PI * 2;
const MAX_FISH = 260;

// ---------------------------------------------------------------- fish
// (cartoon eyes: an extra attribute marks the white of the eye and the pupil,
// drawn untinted by the fish's colour)
function sphereInto(pos, eye, cx, cy, cz, r, tag, seg = 6) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(3, seg - 2)).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { pos.push(p.getX(i) + cx, p.getY(i) + cy, p.getZ(i) + cz); eye.push(tag); }
}

/** A fish 1 m long, nose along +x: a lofted body, a forked tail, fins and big cartoon eyes (flying fish: long wing fins). */
function fishGeo(kind = 'fish') {
  const secs = kind === 'flying'
    ? [[0.5, 0, 0], [0.3, 0.12, 0.07], [0.0, 0.13, 0.075], [-0.3, 0.06, 0.035]]
    : [[0.5, 0, 0], [0.3, 0.15, 0.065], [0.02, 0.18, 0.075], [-0.28, 0.07, 0.035]];
  const n = 6;
  const ring = (x, h, w) => {
    const r = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; r.push([x, Math.cos(a) * h, Math.sin(a) * w]); }
    return r;
  };
  const pos = [], eye = [];
  const tri = (...v) => { pos.push(...v); eye.push(0, 0, 0); };
  const rings = secs.map(([x, h, w]) => ring(x, h, w));
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], B = rings[s + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(...A[i], ...B[i], ...B[j]); tri(...A[i], ...B[j], ...A[j]);
    }
  }
  const tx = secs[3][0];
  // tail stock cap + forked tail + dorsal and pelvic fins
  tri(tx, 0, 0, tx - 0.24, 0.22, 0, tx - 0.15, 0, 0);
  tri(tx, 0, 0, tx - 0.15, 0, 0, tx - 0.24, -0.22, 0);
  tri(0.12, 0.14, 0, -0.14, 0.13, 0, -0.1, 0.3, 0);
  tri(0.05, -0.14, 0, -0.1, -0.12, 0, -0.08, -0.24, 0);
  if (kind === 'flying') {
    // the long wing fins it glides on
    for (const s of [-1, 1]) {
      tri(0.2, 0.02, s * 0.06, -0.2, 0.02, s * 0.06, -0.05, 0.05, s * 0.62);
      tri(-0.05, 0.05, s * 0.62, -0.2, 0.02, s * 0.06, -0.3, 0.04, s * 0.4);
    }
  }
  // big round eyes
  for (const s of [-1, 1]) {
    sphereInto(pos, eye, 0.31, 0.045, s * 0.055, 0.05, 1);
    sphereInto(pos, eye, 0.335, 0.05, s * 0.088, 0.026, 2, 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aEye', new THREE.Float32BufferAttribute(eye, 1));
  g.computeVertexNormals();
  const c = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const fin = Math.abs(z) < 1e-6 && (x < tx - 0.01 || Math.abs(y) > 0.13);
    // pale belly, dark back, darker fins (and the flying fish's wings a glassy blue)
    let k = fin ? 0.8 : y < -0.04 ? 1.35 : y > 0.07 ? 0.62 : 1;
    if (kind === 'flying' && Math.abs(z) > 0.1) k = 1.25;
    c[i] = k; c[i + 1] = k; c[i + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

const uTime = { value: 0 };
function fishMaterial() {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aEye;\nvarying float vEye;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vEye = aEye;
      {
        // the tail beats side to side, the body following through
        float ph = uTime * 11.0 + instanceMatrix[3][0] * 3.7 + instanceMatrix[3][2] * 2.3;
        float b = max(0.0, 0.25 - transformed.x);
        transformed.z += sin(ph - transformed.x * 3.0) * b * b * 0.9;
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEye;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (vEye > 1.5) diffuseColor.rgb = vec3(0.04, 0.03, 0.05); else if (vEye > 0.5) diffuseColor.rgb = vec3(1.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.14;');
  };
  m.customProgramCacheKey = () => 'fish2';
  return m;
}

// ---------------------------------------------------------------- the bigger animals (one model each)
const SPH = new THREE.SphereGeometry(1, 14, 10);
const CON = new THREE.ConeGeometry(1, 1, 7);
CON.translate(0, 0.5, 0);
function piece(root, geo, mat, s, p, o = 0.03, r = null) {
  const x = new THREE.Mesh(geo, mat);
  x.scale.set(...s); x.position.set(...p);
  if (r) x.rotation.set(...r);
  if (o) addOutline(x, o);
  root.add(x);
  return x;
}
function cartoonEyes(root, x, y, z, r, iris = '#141018') {
  const white = toon('#ffffff'), dark = toon(iris);
  for (const s of [-1, 1]) {
    piece(root, SPH, white, [r * 0.8, r, r * 0.55], [x, y, s * z], 0.015);
    piece(root, SPH, dark, [r * 0.42, r * 0.55, r * 0.3], [x + r * 0.25, y, s * (z + r * 0.35)], 0);
  }
}

/**
 * The Elephant Honmaguro: a giant tuna (dark blue back, silver belly, yellow
 * finlets) with an elephant's floppy ears, a trunk that swings as it swims
 * and a pair of little tusks.
 */
function elephantView(col) {
  const root = new THREE.Group();
  const back = toon(col), belly = toon('#dfe7ee'), grey = toon('#8c8f98'), greyD = toon('#6c6f78'), yellow = toon('#f2c230'), ivory = toon('#f3ead2');
  piece(root, SPH, back, [0.55, 0.2, 0.17], [0, 0.02, 0], 0.025);
  piece(root, SPH, belly, [0.5, 0.13, 0.14], [0.02, -0.07, 0], 0);
  for (let i = 0; i < 5; i++) {
    piece(root, CON, yellow, [0.018, 0.06, 0.012], [-0.22 - i * 0.055, 0.16 - i * 0.01, 0], 0);
    piece(root, CON, yellow, [0.018, 0.06, 0.012], [-0.22 - i * 0.055, -0.13 + i * 0.01, 0], 0, [Math.PI, 0, 0]);
  }
  cartoonEyes(root, 0.4, 0.06, 0.1, 0.04);
  const ears = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(0.3, 0.05, s * 0.14);
    piece(hinge, SPH, grey, [0.11, 0.13, 0.02], [-0.06, 0, s * 0.06], 0.015, [0, s * 0.5, 0]);
    root.add(hinge);
    ears.push({ hinge, s });
    piece(root, CON, ivory, [0.014, 0.08, 0.014], [0.5, -0.05, s * 0.045], 0, [0, 0, -2.2]);
  }
  // the trunk: a string of shrinking beads curling down from the snout
  const trunk = [];
  for (let i = 0; i < 5; i++) trunk.push(piece(root, SPH, i % 2 ? greyD : grey, [0.045 - i * 0.005, 0.045 - i * 0.005, 0.045 - i * 0.005], [0.55, 0, 0], 0.01));
  const tail = new THREE.Group();
  tail.position.set(-0.5, 0.02, 0);
  root.add(tail);
  piece(tail, SPH, back, [0.12, 0.05, 0.04], [-0.06, 0, 0], 0.015);
  piece(tail, CON, back, [0.03, 0.26, 0.02], [-0.12, 0, 0], 0.015, [0, 0, 0.6]);
  piece(tail, CON, back, [0.03, 0.26, 0.02], [-0.12, 0, 0], 0.015, [0, 0, Math.PI - 0.6]);
  return {
    root,
    update(t) {
      tail.rotation.y = Math.sin(t * 5) * 0.4;
      for (const e of ears) e.hinge.rotation.x = e.s * (0.2 + Math.sin(t * 2.2) * 0.25);
      for (let i = 0; i < trunk.length; i++) {
        const a = -0.6 - i * 0.35 + Math.sin(t * 1.7 - i * 0.6) * 0.25;
        const prev = i ? trunk[i - 1].position : { x: 0.55, y: -0.01 };
        trunk[i].position.set(prev.x + Math.cos(a) * 0.055, prev.y + Math.sin(a) * 0.055, Math.sin(t * 1.3 + i) * 0.01 * i);
      }
    },
  };
}

/** A baby Sea King: a little horned serpent (a couple of metres of it) winding through the water. */
function serpentView(col) {
  const root = new THREE.Group();
  const body = toon(col), belly = toon('#f3e7c9'), horn = toon('#f3ead2'), red = toon('#d32f2f');
  const head = new THREE.Group();
  root.add(head);
  piece(head, SPH, body, [0.2, 0.12, 0.13], [0, 0, 0], 0.02);
  piece(head, SPH, belly, [0.16, 0.06, 0.1], [0.04, -0.06, 0], 0);
  for (const s of [-1, 1]) {
    piece(head, CON, horn, [0.025, 0.16, 0.025], [-0.08, 0.08, s * 0.07], 0.01, [s * 0.5, 0, 0.9]);
    piece(head, SPH, toon('#ffffff'), [0.035, 0.035, 0.025], [0.1, 0.05, s * 0.09], 0.01);
    piece(head, SPH, red, [0.016, 0.028, 0.012], [0.115, 0.05, s * 0.105], 0);
  }
  const segs = [];
  for (let i = 0; i < 8; i++) {
    const r = 0.1 * (1 - i * 0.085);
    const g = new THREE.Group();
    root.add(g);
    piece(g, SPH, body, [r * 1.25, r, r], [0, 0, 0], 0.015);
    if (i % 2 === 0 && i < 7) piece(g, CON, i % 4 ? body : red, [r * 0.3, r * 1.1, r * 0.12], [0, r * 0.7, 0], 0);
    segs.push(g);
  }
  return {
    root,
    update(t) {
      // a travelling wave down the body
      head.position.set(0.02, Math.sin(t * 1.3) * 0.02, Math.sin(t * 3) * 0.05);
      for (let i = 0; i < segs.length; i++) segs[i].position.set(-0.17 - i * 0.16, Math.sin(t * 1.3 - i * 0.4) * 0.02, Math.sin(t * 3 - (i + 1) * 0.75) * 0.08 * (0.6 + i * 0.12));
    },
  };
}

/** A Sea Cat (the sacred beasts of Alabasta's seas): a big tabby cat's head and paws on a sleek body with a fish's tail. */
function seaCatView(col) {
  const root = new THREE.Group();
  const fur = toon(col), stripe = toon('#a8602a'), cream = toon('#f6e3c4'), pink = toon('#f29aa9'), dark = toon('#2a1d14');
  piece(root, SPH, fur, [0.55, 0.26, 0.28], [0, 0, 0], 0.025);
  piece(root, SPH, cream, [0.45, 0.14, 0.22], [0.05, -0.13, 0], 0);
  for (let i = 0; i < 4; i++) piece(root, SPH, stripe, [0.035, 0.2, 0.29], [0.25 - i * 0.16, 0.06, 0], 0);
  const head = new THREE.Group();
  head.position.set(0.6, 0.12, 0);
  root.add(head);
  piece(head, SPH, fur, [0.25, 0.23, 0.26], [0, 0, 0], 0.025);
  piece(head, SPH, cream, [0.13, 0.1, 0.16], [0.17, -0.07, 0], 0.015);
  piece(head, SPH, pink, [0.035, 0.028, 0.04], [0.29, -0.02, 0], 0);
  for (const s of [-1, 1]) {
    piece(head, CON, fur, [0.09, 0.16, 0.05], [-0.02, 0.17, s * 0.13], 0.015, [s * -0.25, 0, 0]);
    piece(head, CON, pink, [0.05, 0.1, 0.02], [0.0, 0.18, s * 0.13], 0, [s * -0.25, 0, 0]);
    piece(head, SPH, toon('#d9f06a'), [0.05, 0.06, 0.03], [0.17, 0.07, s * 0.12], 0.012);
    piece(head, SPH, dark, [0.014, 0.05, 0.02], [0.195, 0.07, s * 0.135], 0);
    for (const k of [-1, 0, 1]) piece(head, SPH, toon('#ffffff'), [0.12, 0.004, 0.004], [0.22, -0.05 + k * 0.02, s * 0.14], 0, [0, s * 0.35, k * 0.12]);
  }
  const paws = [];
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    h.position.set(0.35, -0.12, s * 0.2);
    piece(h, SPH, fur, [0.07, 0.16, 0.07], [0.04, -0.1, 0], 0.015);
    piece(h, SPH, cream, [0.075, 0.05, 0.075], [0.06, -0.24, 0], 0);
    root.add(h);
    paws.push({ h, s });
  }
  const tail = new THREE.Group();
  tail.position.set(-0.52, 0.02, 0);
  root.add(tail);
  piece(tail, SPH, fur, [0.22, 0.12, 0.12], [-0.12, 0, 0], 0.02);
  piece(tail, SPH, stripe, [0.1, 0.03, 0.26], [-0.34, 0, 0], 0.02);
  return {
    root,
    update(t) {
      for (const p of paws) p.h.rotation.z = Math.sin(t * 2.4 + (p.s > 0 ? 0 : Math.PI)) * 0.7;
      tail.rotation.z = Math.sin(t * 1.6) * 0.3;
      head.rotation.z = Math.sin(t * 0.8) * 0.06;
    },
  };
}

/**
 * A Yagara Bull (the ride of Water 7's canals): a chubby seahorse of a beast
 * with a big round head, huge friendly eyes, little bull horns, a curling
 * tail — and a saddle, in case you'd like a lift.
 */
function yagaraView(col) {
  const root = new THREE.Group();
  const skin = toon(col), belly = toon('#fbe3d6'), horn = toon('#f3ead2'), fin = toon('#e0795f'), dark = toon('#3a1f1a');
  const saddle = toon('#6d4c33'), cloth = toon('#c0392b');
  piece(root, SPH, skin, [0.3, 0.3, 0.26], [0, 0, 0], 0.025);
  piece(root, SPH, belly, [0.22, 0.24, 0.2], [0.06, -0.06, 0], 0);
  const head = new THREE.Group();
  head.position.set(0.3, 0.26, 0);
  root.add(head);
  piece(head, SPH, skin, [0.27, 0.24, 0.25], [0, 0, 0], 0.025);
  piece(head, SPH, belly, [0.16, 0.12, 0.18], [0.16, -0.09, 0], 0.015);
  piece(head, SPH, dark, [0.1, 0.02, 0.13], [0.24, -0.1, 0], 0);
  cartoonEyes(head, 0.14, 0.07, 0.15, 0.08, '#2a1d14');
  for (const s of [-1, 1]) piece(head, CON, horn, [0.035, 0.14, 0.035], [-0.05, 0.18, s * 0.14], 0.012, [s * 0.5, 0, -0.3]);
  // the saddle and its blanket
  piece(root, SPH, cloth, [0.2, 0.03, 0.27], [-0.02, 0.26, 0], 0.012);
  piece(root, SPH, saddle, [0.14, 0.06, 0.18], [-0.02, 0.3, 0], 0.012);
  // the curling tail
  const tail = [];
  for (let i = 0; i < 6; i++) tail.push(piece(root, SPH, i % 2 ? skin : fin, [0.09 - i * 0.012, 0.09 - i * 0.012, 0.09 - i * 0.012], [0, 0, 0], 0.012));
  const fins = [];
  for (const s of [-1, 1]) fins.push(piece(root, SPH, fin, [0.1, 0.03, 0.07], [0.05, 0.02, s * 0.27], 0.012));
  piece(root, CON, fin, [0.1, 0.18, 0.02], [-0.12, 0.26, 0], 0.012, [0, 0, 0.5]);
  return {
    root,
    update(t) {
      root.children[0].position.y = Math.sin(t * 1.4) * 0.02;
      head.rotation.z = Math.sin(t * 1.1) * 0.08;
      for (let i = 0; i < tail.length; i++) {
        const a = -Math.PI / 2 - i * 0.75 + Math.sin(t * 1.5) * 0.15;
        const prev = i ? tail[i - 1].position : { x: -0.2, y: -0.2 };
        tail[i].position.set(prev.x + Math.cos(a) * 0.1, prev.y + Math.sin(a) * 0.1, 0);
      }
      for (let i = 0; i < fins.length; i++) fins[i].rotation.x = (i ? 1 : -1) * Math.sin(t * 6) * 0.4;
    },
  };
}

const VIEWS = { elephant: elephantView, serpent: serpentView, seacat: seaCatView, yagara: yagaraView };

// ---------------------------------------------------------------- the water itself
/** Motes of plankton drifting in the water around the camera. */
function snow() {
  const N = 900, B = 26;
  const base = new Float32Array(N * 3), pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { base[i * 3] = Math.random() * B; base[i * 3 + 1] = Math.random() * 16; base[i * 3 + 2] = Math.random() * B; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: '#d7f1f5', size: 0.045, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, fog: true });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return {
    pts,
    /** (wx, wz) = the camera's world position on the sea plane; cy its height. */
    update(wx, wz, cy, t) {
      for (let i = 0; i < N; i++) {
        const bx = base[i * 3] + t * 0.05 + Math.sin(t * 0.3 + i) * 0.3, bz = base[i * 3 + 2] + t * 0.03;
        pos[i * 3] = (((bx - wx) % B) + B) % B - B / 2;
        const by = base[i * 3 + 1] - t * 0.04;
        pos[i * 3 + 1] = Math.min(-0.1, cy + ((((by - cy) % 16) + 16) % 16) - 8);
        pos[i * 3 + 2] = (((bz - wz) % B) + B) % B - B / 2;
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

/** Shafts of sunlight slanting down from the surface. */
function shafts() {
  const N = 14, B = 48;
  const uStr = { value: 0 }, uCol = { value: new THREE.Color(0.8, 0.95, 1) }, uT = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStr, uCol, uT },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying float vSeed;
      attribute float seed;
      void main() {
        vUv = uv; vSeed = seed;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uStr, uT;
      uniform vec3 uCol;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        float across = sin(vUv.x * 3.14159);
        float down = pow(vUv.y, 1.6);
        float flick = 0.6 + 0.4 * sin(uT * (0.5 + vSeed * 0.4) + vSeed * 17.0);
        float a = across * across * down * flick * uStr;
        gl_FragColor = vec4(uCol * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const group = new THREE.Group();
  const list = [];
  for (let i = 0; i < N; i++) {
    const w = 1.2 + Math.random() * 2.6, h = 34;
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, -h / 2, 0);
    g.setAttribute('seed', new THREE.BufferAttribute(new Float32Array(4).fill(Math.random()), 1));
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = 5;
    group.add(m);
    list.push({ m, bx: Math.random() * B, bz: Math.random() * B, tilt: 0.12 + Math.random() * 0.1 });
  }
  return {
    group, uStr, uCol, uT,
    update(wx, wz, yaw, t) {
      for (const s of list) {
        s.m.position.set((((s.bx + t * 0.1 - wx) % B) + B) % B - B / 2, 0, (((s.bz - wz) % B) + B) % B - B / 2);
        // face the camera around the vertical, leaning a little like sunlight does
        s.m.rotation.set(0, 0, 0);
        s.m.rotation.y = -yaw - Math.PI / 2;
        s.m.rotateZ(s.tilt);
      }
    },
  };
}

// ---------------------------------------------------------------- the system
class SeaLife3D {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'sealife';
    scene.add(this.group);
    // shoals: plain fish (and reef fish, drawn deeper-bodied) and flying fish
    const mat = fishMaterial();
    this.shoals = {};
    for (const kind of ['fish', 'flying']) {
      const m = new THREE.InstancedMesh(fishGeo(kind), mat, MAX_FISH);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FISH * 3), 3);
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
      this.shoals[kind] = m;
    }
    this.critters = new Map(); // school → [view per animal]
    this.snow = snow();
    this.snow.pts.visible = false;
    scene.add(this.snow.pts);
    this.rays = shafts();
    this.rays.group.visible = false;
    scene.add(this.rays.group);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YZX'); this.s = new THREE.Vector3(); this.p = new THREE.Vector3();
    this.col = new THREE.Color();
    this.P = { x: 0, y: 0, z: 0 };
  }

  update(ctx, env) {
    const game = ctx.game, v = game.view3d, w = ctx.world, S = game.seaLife;
    if (!w || !v) return;
    uTime.value = env.time;
    const ox = v.ox, oy = v.oy;
    // fish
    const count = { fish: 0, flying: 0 };
    const seen = new Set();
    if (S) {
      for (const s of S.schools) {
        if (VIEWS[s.def.shape]) { seen.add(s); this.animals(s, w, ox, oy, env, S); continue; }
        const kind = s.def.shape === 'flying' ? 'flying' : 'fish', mesh = this.shoals[kind];
        const deep = s.def.shape === 'reef' ? 1.55 : 1; // (reef fish: rounder and deeper-bodied)
        for (const f of s.fish) {
          if (!f.alive || count[kind] >= MAX_FISH) continue;
          S.fishPos(s, f, this.P);
          const dx = w.dx(ox, this.P.x), dz = this.P.y - oy;
          if (dx * dx + dz * dz > 60 * 60) continue;
          this.p.set(dx, -this.P.z, dz);
          // along the school's heading, each fish weaving a little (a leaping flying fish noses up, then glides down)
          const leap = this.P.leap || 0;
          const yaw = -(s.hd + (leap ? 0 : Math.sin(env.time * 0.9 + f.ph) * 0.35 * Math.sign(f.w)));
          const pitch = leap ? (leap < 0.4 ? 0.6 : -0.25) : Math.sin(env.time * 0.6 + f.ph) * 0.12;
          this.e.set(0, yaw, pitch);
          this.q.setFromEuler(this.e);
          this.s.set(f.size, f.size * deep, f.size);
          this.m4.compose(this.p, this.q, this.s);
          mesh.setMatrixAt(count[kind], this.m4);
          this.col.set(f.col);
          mesh.setColorAt(count[kind], this.col);
          count[kind]++;
        }
      }
    }
    for (const kind in this.shoals) {
      const m = this.shoals[kind];
      m.count = count[kind];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    for (const [s, views] of this.critters) if (!seen.has(s)) { for (const v of views) v.root.removeFromParent(); this.critters.delete(s); }
    // under water: motes and sunbeams
    const under = !!v.isUnder;
    this.snow.pts.visible = under;
    this.rays.group.visible = under;
    if (under) {
      const cam = ctx.camera;
      const wx = w.wx(ox) + cam.position.x, wz = oy + cam.position.z;
      this.snow.update(wx, wz, cam.position.y, env.time);
      this.snow.pts.position.set(cam.position.x, 0, cam.position.z);
      const depth = -cam.position.y;
      const day = Math.max(0, (env.daylight ?? 1) - 0.15) / 0.85;
      this.rays.uStr.value = 0.22 * day * Math.max(0, 1 - depth / 40) * (1 - (env.storm || 0) * 0.8);
      this.rays.uT.value = env.time;
      this.rays.update(wx, wz, ctx.yaw, env.time);
      this.rays.group.position.set(cam.position.x, 0, cam.position.z);
    }
  }

  /** The bigger animals: a model each (a trunked tuna, a baby Sea King, a Sea Cat, a Yagara Bull). */
  animals(s, w, ox, oy, env, S) {
    let views = this.critters.get(s);
    if (!views) {
      views = s.fish.map((f) => {
        const v = VIEWS[s.def.shape](f.col || s.def.colors[0]);
        v.root.scale.setScalar(f.size || s.def.size);
        this.group.add(v.root);
        return v;
      });
      this.critters.set(s, views);
    }
    s.fish.forEach((f, i) => {
      const v = views[i];
      v.root.visible = f.alive;
      if (!f.alive) return;
      S.fishPos(s, f, this.P);
      v.root.position.set(w.dx(ox, this.P.x), -this.P.z, this.P.y - oy);
      // (a school's animals each weave a little off the common heading)
      v.root.rotation.set(0, -(s.hd + (s.fish.length > 1 ? Math.sin(env.time * 0.7 + f.ph) * 0.25 : 0)), 0);
      v.update(env.time + (s.seed || 0) + i * 1.7);
    });
  }
}

let life = null;
registerFrameHook((env, ctx) => {
  if (!life) { life = new SeaLife3D(ctx.scene); if (ctx.game?.view3d) ctx.game.view3d.seaLife3d = life; }
  life.update(ctx, env);
});
