// Sea life and the feel of being under water, in 3D: the fish schools from
// game/sealife.js as one instanced mesh of little fish (tails beating, bellies
// pale, backs dark), sea turtles and manta rays rowing along, and — once your
// head goes under — motes drifting in the water and shafts of sunlight
// slanting down from the surface.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { toon, addOutline, toonGradient } from './materials.js';

const TAU = Math.PI * 2;
const MAX_FISH = 260;

// ---------------------------------------------------------------- fish
/** A fish 1 m long, nose along +x: a lofted body, a forked tail and a dorsal fin. */
function fishGeo() {
  const secs = [[0.5, 0, 0], [0.3, 0.15, 0.065], [0.02, 0.18, 0.075], [-0.28, 0.07, 0.035]];
  const n = 6;
  const ring = (x, h, w) => {
    const r = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; r.push([x, Math.cos(a) * h, Math.sin(a) * w]); }
    return r;
  };
  const pos = [];
  const rings = secs.map(([x, h, w]) => ring(x, h, w));
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], B = rings[s + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pos.push(...A[i], ...B[i], ...B[j], ...A[i], ...B[j], ...A[j]);
    }
  }
  // tail stock cap + forked tail + dorsal and pelvic fins
  pos.push(-0.28, 0, 0, -0.52, 0.2, 0, -0.43, 0, 0);
  pos.push(-0.28, 0, 0, -0.43, 0, 0, -0.52, -0.2, 0);
  pos.push(0.12, 0.16, 0, -0.14, 0.14, 0, -0.1, 0.3, 0);
  pos.push(0.05, -0.15, 0, -0.1, -0.13, 0, -0.08, -0.24, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const c = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const fin = Math.abs(z) < 1e-6 && (x < -0.29 || Math.abs(y) > 0.13);
    // pale belly, dark back; the eye as a dark spot near the nose
    let k = fin ? 0.8 : y < -0.04 ? 1.35 : y > 0.07 ? 0.62 : 1;
    if (!fin && x > 0.26 && x < 0.34 && y > 0.02 && y < 0.1) k = 0.15;
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
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        // the tail beats side to side, the body following through
        float ph = uTime * 11.0 + instanceMatrix[3][0] * 3.7 + instanceMatrix[3][2] * 2.3;
        float b = max(0.0, 0.25 - transformed.x);
        transformed.z += sin(ph - transformed.x * 3.0) * b * b * 0.9;
      }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.14;');
  };
  m.customProgramCacheKey = () => 'fish1';
  return m;
}

// ---------------------------------------------------------------- critters
function turtleView(col) {
  const root = new THREE.Group();
  const shell = toon(col), skin = toon('#a8b77a'), dark = toon('#2d3a22'), belly = toon('#d9cf9a');
  const S = new THREE.SphereGeometry(1, 14, 10);
  const add = (m, s, p, o = 0.03) => { const x = new THREE.Mesh(S, m); x.scale.set(...s); x.position.set(...p); if (o) addOutline(x, o); root.add(x); return x; };
  add(shell, [0.62, 0.24, 0.5], [0, 0.06, 0]);
  add(belly, [0.58, 0.1, 0.46], [0, -0.06, 0], 0);
  // scutes on the shell
  for (const [x, z] of [[0.2, 0], [-0.12, 0], [0.04, 0.22], [0.04, -0.22], [-0.3, 0.14], [-0.3, -0.14]]) add(dark, [0.12, 0.04, 0.1], [x, 0.26, z], 0);
  const head = add(skin, [0.17, 0.13, 0.13], [0.72, 0.04, 0]);
  add(dark, [0.03, 0.03, 0.03], [0.83, 0.09, 0.08], 0); add(dark, [0.03, 0.03, 0.03], [0.83, 0.09, -0.08], 0);
  const flips = [];
  for (const [x, z, L, front] of [[0.32, 0.46, 0.55, 1], [0.32, -0.46, 0.55, 1], [-0.45, 0.32, 0.26, 0], [-0.45, -0.32, 0.26, 0]]) {
    const hinge = new THREE.Group();
    hinge.position.set(x, 0, z * 0.9);
    const f = new THREE.Mesh(S, skin);
    f.scale.set(L * 0.42, 0.04, L);
    f.position.set(-L * 0.25, 0, Math.sign(z) * L * 0.75);
    f.rotation.y = Math.sign(z) * (front ? 0.5 : 0.3);
    addOutline(f, 0.025);
    hinge.add(f);
    root.add(hinge);
    flips.push({ hinge, front, side: Math.sign(z) });
  }
  return {
    root,
    update(t) {
      for (const f of flips) f.hinge.rotation.x = f.side * (f.front ? Math.sin(t * 1.6) * 0.55 : Math.sin(t * 1.6 + 1.5) * 0.25);
      head.position.y = 0.04 + Math.sin(t * 0.8) * 0.02;
    },
  };
}

function mantaView() {
  const root = new THREE.Group();
  const top = toon('#2f3844'), under = toon('#e8ecef');
  const S = new THREE.SphereGeometry(1, 14, 8);
  const body = new THREE.Mesh(S, top); body.scale.set(0.55, 0.12, 0.45); addOutline(body, 0.02); root.add(body);
  const b2 = new THREE.Mesh(S, under); b2.scale.set(0.5, 0.08, 0.4); b2.position.y = -0.05; root.add(b2);
  // wings: a flat triangle each side, hinged along the body
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0.45, 0, 0, -0.35, 0, 0, -0.05, 0, 1.25, 0.45, 0, 0, -0.05, 0, 1.25, -0.35, 0, 0], 3));
  wingGeo.computeVertexNormals();
  const wings = [];
  for (const s of [1, -1]) {
    const hinge = new THREE.Group();
    hinge.position.set(0, 0, s * 0.35);
    const w = new THREE.Mesh(wingGeo, new THREE.MeshToonMaterial({ color: '#2f3844', gradientMap: toonGradient(), side: THREE.DoubleSide }));
    w.scale.z = s;
    hinge.add(w);
    root.add(hinge);
    wings.push({ hinge, s });
  }
  // the horn-like head fins and the long tail
  for (const s of [1, -1]) { const f = new THREE.Mesh(S, top); f.scale.set(0.16, 0.04, 0.05); f.position.set(0.58, 0, s * 0.18); root.add(f); }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 1.1, 5), top);
  tail.rotation.z = Math.PI / 2; tail.position.set(-1.05, 0, 0); root.add(tail);
  return {
    root,
    update(t) {
      for (const w of wings) w.hinge.rotation.x = w.s * Math.sin(t * 1.1) * 0.45;
      root.children[0].position.y = Math.sin(t * 1.1 + 1) * 0.03;
    },
  };
}

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
    this.fish = new THREE.InstancedMesh(fishGeo(), fishMaterial(), MAX_FISH);
    this.fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fish.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FISH * 3), 3);
    this.fish.frustumCulled = false;
    this.fish.count = 0;
    this.group.add(this.fish);
    this.critters = new Map(); // school → view
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
    let n = 0;
    const seen = new Set();
    if (S) {
      for (const s of S.schools) {
        if (s.def.critter) { seen.add(s); this.critter(s, w, ox, oy, env, S); continue; }
        for (const f of s.fish) {
          if (!f.alive || n >= MAX_FISH) continue;
          S.fishPos(s, f, this.P);
          const dx = w.dx(ox, this.P.x), dz = this.P.y - oy;
          if (dx * dx + dz * dz > 60 * 60) continue;
          this.p.set(dx, -this.P.z, dz);
          // along the school's heading, each fish weaving a little
          const yaw = -(s.hd + Math.sin(env.time * 0.9 + f.ph) * 0.35 * Math.sign(f.w));
          this.e.set(0, yaw, Math.sin(env.time * 0.6 + f.ph) * 0.12);
          this.q.setFromEuler(this.e);
          this.s.setScalar(f.size * (s.def.size > 0.6 ? 1 : 1));
          this.m4.compose(this.p, this.q, this.s);
          this.fish.setMatrixAt(n, this.m4);
          this.col.set(f.col);
          this.fish.setColorAt(n, this.col);
          n++;
        }
      }
    }
    this.fish.count = n;
    this.fish.instanceMatrix.needsUpdate = true;
    if (this.fish.instanceColor) this.fish.instanceColor.needsUpdate = true;
    for (const [s, view] of this.critters) if (!seen.has(s)) { view.root.removeFromParent(); this.critters.delete(s); }
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

  critter(s, w, ox, oy, env, S) {
    let view = this.critters.get(s);
    if (!view) {
      view = s.kind === 'manta' ? mantaView() : turtleView(s.def.colors[0]);
      view.root.scale.setScalar(s.def.size);
      this.group.add(view.root);
      this.critters.set(s, view);
    }
    const f = s.fish[0];
    S.fishPos(s, f, this.P);
    view.root.position.set(w.dx(ox, this.P.x), -this.P.z, this.P.y - oy);
    view.root.rotation.set(0, -s.hd, 0);
    view.update(env.time + (s.seed || 0));
  }
}

let life = null;
registerFrameHook((env, ctx) => {
  if (!life) { life = new SeaLife3D(ctx.scene); if (ctx.game?.view3d) ctx.game.view3d.seaLife3d = life; }
  life.update(ctx, env);
});
