// Unique and animated world objects: windmills with turning sails, flags that
// wave in the wind, fountains with falling water, campfires, Sabaody's
// soap bubbles, the Ferris wheel, lighthouses with a sweeping beam at night,
// treasure chests that open, the Bondola up the Red Line, fortress gates,
// cave and mine arches, torii, execution platforms and rings, Shandora's
// golden bell, Poneglyphs, statues, shipwrecks, towers, stairwells, named
// signposts and Laboon. Static parts are merged, cached geometries; the moving
// parts animate every frame through animate() (see mats.js).
import * as THREE from 'three';
import { Mesher, box, cbox, cyl, cone, lathe, torus, extrude, slab, ribbon, blob, C, shade, hash, rng } from './kit.js';
import { vcMat, glowMat, meshOf, animate, bindCtx, STATE, U } from './mats.js';
import { model, simple, signModel, footY, postFeet } from './street.js';
import { registerPropBuilder } from '../registry.js';
import { canvasTexture } from '../materials.js';
import { drawJollyRoger, drawMarineEmblem } from '../../render/ship.js';
import { hullGeometry } from '../ships3d.js';
import { SHIPS } from '../../data/ships.js';

const reg = (kind, fn) => registerPropBuilder(kind, (o, ctx) => { bindCtx(ctx); return fn(o, ctx); });
const group = (name) => { const g = new THREE.Group(); g.name = name; return g; };
const add = (g, geo, opts) => { const m = meshOf(geo, opts); g.add(m); return m; };
const envOf = () => STATE.env || STATE.game?.env;

// ------------------------------------------------------------ soap bubbles
let bubbleMat = null;
export function bubbleMaterial() {
  if (bubbleMat) return bubbleMat;
  bubbleMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mvPosition.xyz;
        vP = position;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize(vN), v = normalize(vV);
        float f = 1.0 - abs(dot(n, v));
        float rim = pow(f, 2.0);
        vec3 irid = 0.55 + 0.45 * cos(6.2831 * (f * 1.3 + vP.y * 0.35 + uTime * 0.05 + vec3(0.0, 0.33, 0.67)));
        vec3 col = mix(vec3(0.82, 0.93, 1.0), irid, 0.5);
        float spec = pow(max(0.0, dot(n, normalize(vec3(-0.35, 0.55, 0.75)))), 40.0);
        col += spec * 1.5;
        gl_FragColor = vec4(col, clamp(0.05 + rim * 0.8 + spec, 0.0, 0.95));
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
  bubbleMat.uniforms.uTime = U.time;
  return bubbleMat;
}

// ------------------------------------------------------------ flags
const flagMats = new Map();
function flagMaterial(kind) {
  let m = flagMats.get(kind);
  if (m) return m;
  const { ctx: g, tex } = canvasTexture(256, 170);
  if (kind === 'jr') {
    g.fillStyle = '#141414'; g.fillRect(0, 0, 256, 170);
    g.setTransform(110, 0, 0, 110, 128, 88); drawJollyRoger(g, { skull: 'classic', bones: 'cross' }, 1, '#141414');
  } else if (kind === 'wg') {
    g.fillStyle = '#f5f6fa'; g.fillRect(0, 0, 256, 170);
    g.strokeStyle = '#1f3a68'; g.lineWidth = 10;
    g.beginPath(); g.arc(128, 85, 52, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 7;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(128 + Math.cos(a) * 30, 85 + Math.sin(a) * 30, 24, a + 2.2, a + 4.1); g.stroke(); }
  } else {
    g.fillStyle = '#f5f6fa'; g.fillRect(0, 0, 256, 170);
    g.setTransform(120, 0, 0, 120, 128, 80); drawMarineEmblem(g, 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#2874a6'; g.fillRect(0, 150, 256, 20);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  tex.needsUpdate = true;
  m = new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide });
  flagMats.set(kind, m);
  return m;
}

/** A waving flag mesh (w × h), hoist at x = 0; animated in place. */
function wavingFlag(kind, w, h) {
  const geo = new THREE.PlaneGeometry(w, h, 10, 3);
  geo.translate(w / 2, 0, 0);
  const mesh = new THREE.Mesh(geo, flagMaterial(kind));
  mesh.castShadow = true;
  const base = geo.attributes.position.array.slice();
  mesh.userData.wave = (t, amp = 1) => {
    const a = geo.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = base[i * 3];
      a.array[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * 6 + x * 2.6) * 0.12 * x / w * amp * 1.6;
      a.array[i * 3 + 1] = base[i * 3 + 1] - x * x * 0.02;
    }
    a.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return mesh;
}

const poleGeo = () => model('flagpole', (k) => {
  k.add(box(0.9, 0.3, 0.9), { color: '#9e9a90', outline: 0.02 });
  k.add(box(0.6, 0.25, 0.6), { at: [0, 0.3, 0], color: '#b0aba2' });
  k.add(cyl(0.05, 0.085, 6.6, 8), { at: [0, 0.5, 0], color: '#b2bec3', outline: 0.015 });
  k.add(new THREE.SphereGeometry(0.12, 8, 6), { at: [0, 7.15, 0], color: '#d4ac0d', outline: 0.012 });
});

reg('flagpole', (o) => {
  const root = group('flagpole');
  add(root, poleGeo());
  const name = o.name || '';
  const kind = /jolly roger|pirate/i.test(name) ? 'jr' : /world government|\bwg\b/i.test(name) ? 'wg' : 'marine';
  const flag = wavingFlag(kind, 2.1, 1.35);
  flag.position.set(0.08, 6.3, 0);
  root.add(flag);
  animate(root, (t, env) => {
    flag.rotation.y = Math.PI - (env?.windAngle || 0);
    flag.userData.wave(t + hash(o.x, o.y) * 10, 0.7 + (env?.windStrength ?? 1) * 0.4);
  });
  return root;
});

// ------------------------------------------------------------ windmill
const windmillBody = () => model('windmill-body', (k) => {
  k.add(cyl(1.7, 1.78, 0.75, 8), { at: [0, -0.35, 0], flat: true, color: '#9e9a90', outline: 0.03 });
  k.add(lathe([[1.5, 0], [1.38, 1.5], [1.18, 3.4], [1.02, 5.0]], 8), { at: [0, 0.38, 0], flat: true, color: '#efe4d2', outline: 0.045 });
  k.add(box(1.0, 1.95, 0.14), { at: [0, 0.35, 1.4], rot: [-0.05, 0, 0], color: '#5a3a22' });
  k.add(box(0.8, 1.78, 0.1), { at: [0, 0.4, 1.46], rot: [-0.05, 0, 0], color: '#8d5b33' });
  for (const [y, z, w] of [[2.4, 1.33, 0.5], [3.8, 1.2, 0.42]]) {
    k.add(box(w + 0.14, w + 0.24, 0.1), { at: [0, y - 0.07, z], rot: [-0.08, 0, 0], color: '#6d4c33' });
    k.add(box(w, w + 0.1, 0.1), { at: [0, y, z + 0.03], rot: [-0.08, 0, 0], color: '#2d4150', glow: '#ffc766' });
  }
  k.add(cyl(1.3, 1.3, 0.14, 8), { at: [0, 5.3, 0], flat: true, color: '#6d4c33' });
  k.add(cone(1.32, 1.9, 8), { at: [0, 5.42, 0], flat: true, color: '#8d6e63', outline: 0.04 });
  k.add(new THREE.SphereGeometry(0.14, 6, 4), { at: [0, 7.32, 0], color: '#5d4037' });
  k.add(box(0.6, 0.6, 0.75), { at: [0, 4.72, 0.95], color: '#6d4c33', outline: 0.02 });
});

const windmillBlades = () => model('windmill-blades', (k) => {
  k.add(cyl(0.22, 0.24, 0.35, 8), { rot: [Math.PI / 2, 0, 0], color: '#5d4037', outline: 0.015 });
  k.add(new THREE.SphereGeometry(0.16, 8, 6), { at: [0, 0, 0.36], color: '#4e342e' });
  for (let i = 0; i < 4; i++) {
    k.save(); k.rotateZ(i * Math.PI / 2 + 0.3);
    k.add(box(0.13, 3.7, 0.1), { at: [0, 0.15, 0.22], color: '#6d4c33', outline: 0.015 });
    k.add(box(0.98, 2.85, 0.03), { at: [0.6, 0.8, 0.2], color: '#f5efe4', double: true, backShade: 0.85, outline: 0.012 });
    for (let j = 0; j < 5; j++) k.add(box(1.08, 0.05, 0.06), { at: [0.55, 0.8 + j * 0.7, 0.24], color: '#5d4037' });
    k.add(box(0.05, 2.85, 0.06), { at: [1.08, 0.8, 0.24], color: '#5d4037' });
    k.restore();
  }
});

reg('windmill', (o) => {
  const root = group('windmill');
  add(root, windmillBody());
  const blades = add(root, windmillBlades());
  blades.position.set(0, 4.95, 1.45);
  const ph = hash(o.x, o.y) * 6;
  animate(root, (t, env) => { blades.rotation.z = -(t * (0.45 + (env?.windStrength ?? 1) * 0.35) + ph); });
  return root;
});

// ------------------------------------------------------------ fountain
const fountainGeo = () => model('fountain', (k) => {
  // a town fountain in carved sandstone: an eight-sided basin with sunk
  // panels and a moulded rim you can sit on, on a low step; a column with a
  // moulded foot rising to a scalloped bowl, a smaller bowl over it and a
  // carved finial; four lion masks round the column spout into the basin
  const stone = '#ddd2bd', dark = '#bcae96', deep = '#a8987e', water = '#3a9fd0', pale = '#a8e0f2';
  // the step round it and the basin wall (octagonal: 8 sides)
  k.add(cyl(1.62, 1.66, 0.12, 8), { at: [0, -0.06, 0], rot: [0, Math.PI / 8, 0], color: deep, outline: 0.025 });
  // (an open wall, its inside face too: a solid drum here, or a solid cap
  // on top, covered the pool and left the water falling into stone)
  k.add(cyl(1.46, 1.5, 0.52, 8, true), { at: [0, 0.06, 0], rot: [0, Math.PI / 8, 0], color: stone, outline: 0.03 });
  k.add(cyl(1.3, 1.3, 0.52, 8, true), { at: [0, 0.06, 0], rot: [0, Math.PI / 8, 0], color: dark, double: true, backShade: 1 });
  // the rim: a broad coping overhanging the wall all round, the pool open inside it
  k.add(new THREE.RingGeometry(1.3, 1.58, 8, 1), { at: [0, 0.68, 0], rot: [-Math.PI / 2, 0, Math.PI / 8], color: stone, double: true, backShade: 0.8 });
  k.add(cyl(1.58, 1.58, 0.1, 8, true), { at: [0, 0.58, 0], rot: [0, Math.PI / 8, 0], color: stone, outline: 0.025 });
  k.add(cyl(1.3, 1.3, 0.1, 8, true), { at: [0, 0.58, 0], rot: [0, Math.PI / 8, 0], color: dark, double: true, backShade: 1 });
  // a sunk panel on each face of the basin
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, r = 1.385; // (on the face of the octagon: its apothem, not its corner radius)
    k.add(box(0.82, 0.3, 0.04), { at: [Math.cos(a) * r, 0.14, Math.sin(a) * r], rot: [0, Math.PI / 2 - a, 0], color: dark });
    k.add(box(0.6, 0.18, 0.05), { at: [Math.cos(a) * (r + 0.005), 0.2, Math.sin(a) * (r + 0.005)], rot: [0, Math.PI / 2 - a, 0], color: shade(stone, -0.04) });
  }
  // the pool
  k.add(new THREE.CircleGeometry(1.3, 8), { at: [0, 0.5, 0], rot: [-Math.PI / 2, 0, Math.PI / 8], color: water });
  k.add(new THREE.RingGeometry(1.14, 1.3, 8), { at: [0, 0.505, 0], rot: [-Math.PI / 2, 0, Math.PI / 8], color: shade(water, -0.15) });
  // the column: a square plinth in the water, a moulded foot, a shaft
  k.add(box(0.7, 0.4, 0.7), { at: [0, 0.3, 0], color: dark, outline: 0.02 });
  k.add(lathe([[0.36, 0], [0.36, 0.06], [0.28, 0.12], [0.26, 0.2], [0.2, 0.26], [0.18, 1.0], [0.24, 1.08], [0.26, 1.14]], 12), { at: [0, 0.7, 0], color: stone, outline: 0.02 });
  for (let i = 0; i < 4; i++) {
    // lion masks spouting into the pool
    const a = i / 4 * Math.PI * 2 + Math.PI / 4, r = 0.2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    k.add(new THREE.SphereGeometry(0.11, 8, 6), { at: [x, 1.0, z], scale: [1, 1, 0.6], color: '#d8b04a', outline: 0.012 });
    k.add(new THREE.SphereGeometry(0.045, 6, 4), { at: [Math.cos(a) * 0.29, 0.96, Math.sin(a) * 0.29], color: deep });
  }
  // the scalloped bowl, its rim lobed
  k.add(lathe([[0.18, 0], [0.5, 0.06], [0.78, 0.18], [0.92, 0.3], [0.94, 0.36], [0.86, 0.36], [0.2, 0.22]], 16), { at: [0, 1.82, 0], color: stone, outline: 0.022 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.add(new THREE.SphereGeometry(0.1, 7, 5), { at: [Math.cos(a) * 0.92, 2.15, Math.sin(a) * 0.92], scale: [1, 0.55, 1], color: stone }); }
  k.add(new THREE.CircleGeometry(0.86, 16), { at: [0, 2.12, 0], rot: [-Math.PI / 2, 0, 0], color: water });
  // the upper stem and the little bowl
  k.add(lathe([[0.14, 0], [0.1, 0.1], [0.08, 0.5], [0.12, 0.56]], 10), { at: [0, 2.1, 0], color: stone, outline: 0.015 });
  k.add(lathe([[0.1, 0], [0.3, 0.06], [0.42, 0.18], [0.36, 0.18], [0.1, 0.1]], 14), { at: [0, 2.64, 0], color: stone, outline: 0.015 });
  k.add(new THREE.CircleGeometry(0.36, 14), { at: [0, 2.81, 0], rot: [-Math.PI / 2, 0, 0], color: water });
  // the finial: a carved bud the water bubbles out of
  k.add(lathe([[0.08, 0], [0.12, 0.08], [0.1, 0.2], [0.03, 0.32], [0.001, 0.36]], 10), { at: [0, 2.8, 0], color: '#d8b04a', outline: 0.012 });
});

// (a stone base under the basin, h deep: see the fountain below)
const fountainBase = (h) => model('fountain-base:' + h, (k) => {
  k.add(cyl(1.49, 1.53, h, 18), { at: [0, -h - 0.1, 0], color: '#c2b9aa', outline: 0.03 });
});
reg('fountain', (o, ctx) => {
  const root = group('fountain');
  add(root, fountainGeo());
  // on a slope it stands level at its middle on a stone base down to the
  // lowest ground under it (sunk into the high side as small things are, a
  // basin this wide ended up flush with the paving there: a pool in the
  // ground whose wall you still bumped into)
  root.userData.founded = true;
  const terr = ctx?.terrain || ctx?.ground;
  if (terr && ctx.ground) {
    let lo = terr(o.x, o.y);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; lo = Math.min(lo, terr(o.x + Math.cos(a) * 1.5, o.y + Math.sin(a) * 1.5)); }
    const depth = Math.min(8, ctx.ground(o.x, o.y) - lo);
    if (depth > 0.05) add(root, fountainBase(Math.ceil((depth + 0.2) * 4) / 4));
  }
  // the water: thin streams curving over the bowl's lip and from the lion
  // masks down into the pool (not a glassy tube round the column), little
  // rings spreading where they land, and a bubbling at the top
  const streamMat = glowMat(0xd8f3ff, { opacity: 0.55 });
  const streams = new THREE.Group();
  const arc = (x0, y0, z0, out, drop, r) => {
    const dx = x0, dz = z0, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x0 + ux * out, y0 + 0.08, z0 + uz * out), new THREE.Vector3(x0 + ux * out * 1.5, y0 - drop, z0 + uz * out * 1.5));
    streams.add(new THREE.Mesh(new THREE.TubeGeometry(c, 10, r, 5, false), streamMat));
  };
  for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; arc(Math.cos(a) * 0.95, 2.14, Math.sin(a) * 0.95, 0.22, 1.62, 0.025); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; arc(Math.cos(a) * 0.3, 0.96, Math.sin(a) * 0.3, 0.35, 0.44, 0.03); }
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; arc(Math.cos(a) * 0.43, 2.82, Math.sin(a) * 0.43, 0.12, 0.68, 0.018); }
  root.add(streams);
  // rings spreading where the water lands
  const ringMat = glowMat(0xe6f7ff, { opacity: 0.4 });
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.96, 24), ringMat);
    r.rotation.x = -Math.PI / 2; r.position.y = 0.52; root.add(r); rings.push(r);
  }
  const bub = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glowMat(0xe6f7ff, { opacity: 0.7 }));
  bub.position.y = 3.17; root.add(bub);
  animate(root, (t) => {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.5 + i / 3) % 1, sc = 1 + ph * 0.42;
      rings[i].scale.set(sc, sc, 1);
      rings[i].material.opacity = 0.4 * (1 - ph);
    }
    bub.scale.setScalar(1 + Math.sin(t * 9) * 0.25);
    streams.scale.set(1 + Math.sin(t * 6) * 0.015, 1, 1 + Math.cos(t * 6.4) * 0.015);
  });
  return root;
});

// ------------------------------------------------------------ campfire
const fireBase = () => model('campfire', (k) => {
  const R = rng(4);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    k.add(new THREE.IcosahedronGeometry(0.14 + R() * 0.05, 0), { at: [Math.cos(a) * 0.58, 0.05, Math.sin(a) * 0.58], scale: [1, 0.7, 1], flat: true, color: '#8e8a82', outline: 0.012 });
  }
  k.add(new THREE.CircleGeometry(0.5, 10), { at: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0], color: '#2e2622' });
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.3;
    k.save(); k.translate(Math.cos(a) * 0.35, 0.08, Math.sin(a) * 0.35); k.rotateY(-a); k.rotateZ(Math.PI / 2 - 0.5);
    k.add(cyl(0.06, 0.07, 0.62, 6), { color: '#5d4037', outline: 0.01 });
    k.add(cyl(0.061, 0.061, 0.12, 6), { at: [0, 0.5, 0], color: '#1d1512' });
    k.restore();
  }
  for (let i = 0; i < 6; i++) k.add(new THREE.IcosahedronGeometry(0.05, 0), { at: [(R() - 0.5) * 0.4, 0.06, (R() - 0.5) * 0.4], color: '#ff7043', glow: '#ff5722', flicker: 0.6 });
});

const flameGeo = () => model('flame', (k) => {
  const prof = (s) => [[0.001, 0], [0.16 * s, 0.1 * s], [0.2 * s, 0.25 * s], [0.14 * s, 0.5 * s], [0.06 * s, 0.75 * s], [0.001, 0.95 * s]];
  k.add(lathe(prof(1), 8), { color: '#ff6d1f' });
  k.add(lathe(prof(0.72), 8), { at: [0.03, 0.02, 0.02], color: '#ffae1a' });
  k.add(lathe(prof(0.45), 8), { at: [0.0, 0.03, 0.03], color: '#ffe46b' });
});
let flameMat = null;

let glowTex = null;
function groundGlowTexture() {
  if (glowTex) return glowTex;
  const { ctx: g, tex } = canvasTexture(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,170,80,1)'); gr.addColorStop(0.5, 'rgba(255,120,40,0.35)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  tex.needsUpdate = true;
  glowTex = tex;
  return tex;
}

reg('campfire', (o) => {
  const root = group('campfire');
  add(root, fireBase());
  const cold = /cold|ashes/i.test(o.name || '');
  if (cold) return root;
  if (!flameMat) flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(flameGeo(), flameMat);
    f.position.set(Math.cos(i * 2.1) * 0.12, 0.08, Math.sin(i * 2.1) * 0.12);
    f.scale.setScalar(i ? 0.72 : 1.05);
    root.add(f);
    flames.push(f);
  }
  if (!fireGlowMat) fireGlowMat = new THREE.MeshBasicMaterial({ map: groundGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, opacity: 0.5 });
  const glow = new THREE.Mesh(GLOW_PLANE, fireGlowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  glow.renderOrder = 2;
  root.add(glow);
  const ph = hash(o.x, o.y) * 10;
  animate(root, (t, env, st) => {
    flames.forEach((f, i) => {
      const s = (i ? 0.72 : 1.05) * (1 + Math.sin(t * 13 + i * 2 + ph) * 0.08 + Math.sin(t * 7.3 + i) * 0.06);
      f.scale.set(s * (1 - Math.sin(t * 9 + i) * 0.05), s * (1.1 + Math.sin(t * 11 + i * 3 + ph) * 0.14), s);
      f.rotation.y = t * (0.5 + i * 0.3);
    });
    fireGlowMat.opacity = 0.18 + st.night * 0.7;
    glow.scale.setScalar(0.9 + Math.sin(t * 12 + ph) * 0.06 + Math.sin(t * 5.1 + ph) * 0.05);
  });
  return root;
});

// ------------------------------------------------------------ Sabaody bubbles
const BUBBLE_GEO = new THREE.SphereGeometry(1, 20, 14);
BUBBLE_GEO.userData.shared = true;
const AURA_GEO = new THREE.SphereGeometry(0.75, 12, 8);
AURA_GEO.userData.shared = true;
const GLOW_PLANE = new THREE.PlaneGeometry(5, 5);
GLOW_PLANE.userData.shared = true;
let fireGlowMat = null;

reg('bubble', (o) => {
  const root = group('bubbles');
  const R = rng(hash(o.x, o.y) * 1000 + (o.v || 0));
  const bubbles = [];
  const n = 2 + Math.floor(R() * 2);
  for (let i = 0; i < n; i++) {
    const r = 0.35 + R() * 0.6 + (i === 0 ? 0.3 : 0);
    const m = new THREE.Mesh(BUBBLE_GEO, bubbleMaterial());
    m.scale.setScalar(r);
    m.renderOrder = 3;
    const b = { m, r, x: (R() - 0.5) * 2.4, y: 1.3 + R() * 2.4, z: (R() - 0.5) * 2.4, ph: R() * 6, sp: 0.4 + R() * 0.5 };
    root.add(m);
    bubbles.push(b);
  }
  animate(root, (t) => {
    for (const b of bubbles) {
      b.m.position.set(b.x + Math.sin(t * 0.3 * b.sp + b.ph) * 0.6, b.y + Math.sin(t * b.sp + b.ph) * 0.35, b.z + Math.cos(t * 0.25 * b.sp + b.ph) * 0.6);
      const w = 1 + Math.sin(t * 2.3 + b.ph) * 0.03;
      b.m.scale.set(b.r * w, b.r / w, b.r * w);
    }
  });
  return root;
});

// ------------------------------------------------------------ wheels
const ferrisStatic = () => model('ferris-frame', (k) => {
  const R = 7.4, hy = R + 1.4;
  for (const z of [-1.3, 1.3]) {
    for (const s of [-1, 1]) {
      const a = [s * 3.2, 0, z], b = [0, hy, z * 0.55];
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = d.length();
      k.save(); k.transform(new THREE.Matrix4().compose(new THREE.Vector3(...a), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
      k.add(box(0.28, len, 0.28), { color: '#eceff1', outline: 0.025 });
      k.restore();
    }
    k.add(box(4.2, 0.2, 0.2), { at: [0, 2.5, z * 0.9], color: '#eceff1' });
  }
  k.add(cyl(0.35, 0.35, 1.8, 10), { at: [0, hy, -0.9], rot: [Math.PI / 2, 0, 0], color: '#b0bec5' });
  k.add(box(3.4, 0.5, 2.6), { at: [0, -0.2, 0], color: '#b0aba2', outline: 0.02 });
  k.add(box(1.6, 2.3, 1.4), { at: [2.6, 0, 1.8], color: '#f06292', outline: 0.02 });
  k.add(cone(1.2, 0.8, 4), { at: [2.6, 2.3, 1.8], rot: [0, Math.PI / 4, 0], color: '#ffd54f', outline: 0.02 });
});

const ferrisWheel = () => model('ferris-wheel', (k) => {
  const R = 7.4;
  for (const z of [-0.55, 0.55]) {
    k.add(torus(R, 0.12, 5, 40), { at: [0, 0, z], color: '#ff8a65', outline: 0.02 });
    k.add(torus(R * 0.55, 0.08, 5, 28), { at: [0, 0, z], color: '#4fc3f7' });
    for (let i = 0; i < 16; i++) k.add(box(0.07, R, 0.07), { at: [0, 0, z], rot: [0, 0, i / 16 * Math.PI * 2], color: '#eceff1' });
  }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    k.add(cyl(0.05, 0.05, 1.1, 4), { at: [Math.cos(a) * R, Math.sin(a) * R, -0.55], rot: [Math.PI / 2, 0, 0], color: '#eceff1' });
    k.add(new THREE.SphereGeometry(0.12, 6, 4), { at: [Math.cos(a) * R, Math.sin(a) * R, 0.6], color: '#ffeb3b', glow: '#fff176' });
  }
  k.add(cyl(0.5, 0.5, 1.3, 12), { at: [0, 0, -0.65], rot: [Math.PI / 2, 0, 0], color: '#90a4ae' });
});

function gondolaGeo() {
  const k = new Mesher();
  const cols = ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28', '#ab47bc', '#26c6da'];
  for (let i = 0; i < 12; i++) {
    const c = cols[i % cols.length];
    k.save(); k.translate(i * 100, 0, 0); // parked apart; moved per frame
    k.add(cyl(0.02, 0.02, 0.5, 3), { at: [0, -0.5, 0], color: '#546e7a' });
    k.add(cyl(0.55, 0.45, 0.85, 8), { at: [0, -1.45, 0], color: c, outline: 0.02 });
    k.add(cone(0.62, 0.35, 8), { at: [0, -0.6, 0], color: shade(c, -0.25), outline: 0.015 });
    k.add(cyl(0.56, 0.56, 0.3, 8, true), { at: [0, -0.95, 0], color: '#2d4150', glow: '#ffe28a' });
    k.restore();
  }
  return k.build(false);
}

const millWheel = () => model('mill-wheel', (k) => {
  const R = 1.5;
  for (const z of [-0.3, 0.3]) {
    k.add(torus(R, 0.07, 5, 20), { at: [0, 0, z], color: '#6d4c41', outline: 0.015 });
    for (let i = 0; i < 8; i++) k.add(box(0.08, R, 0.08), { at: [0, 0, z], rot: [0, 0, i / 8 * Math.PI * 2], color: '#795548' });
  }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    k.add(box(0.06, 0.4, 0.7), { at: [-Math.sin(a) * (R - 0.05), Math.cos(a) * (R - 0.05), 0], rot: [0, 0, a], color: '#8d6e4a' });
  }
  k.add(cyl(0.15, 0.15, 1.0, 8), { at: [0, 0, -0.5], rot: [Math.PI / 2, 0, 0], color: '#4e342e' });
});

const millFrame = () => model('mill-frame', (k) => {
  for (const z of [-0.6, 0.6]) {
    for (const s of [-1, 1]) k.add(box(0.14, 2.0, 0.14), { at: [s * 0.55, 0, z], rot: [0, 0, s * -0.25], color: '#5d4037', outline: 0.015 });
  }
  k.add(box(1.8, 0.12, 1.6), { at: [0, -0.06, 0], color: '#6d4c33' });
});

reg('wheel', (o) => {
  const root = group('wheel');
  const ferris = /ferris/i.test(o.name || '');
  if (ferris) {
    add(root, ferrisStatic());
    const wheel = add(root, ferrisWheel());
    wheel.position.set(0, 8.8, 0);
    const gg = gondolaGeo();
    const gond = new THREE.Mesh(gg, vcMat());
    gond.castShadow = true;
    gond.frustumCulled = false;
    root.add(gond);
    const base = gg.attributes.position.array.slice();
    const per = gg.attributes.position.count / 12;
    animate(root, (t) => {
      const a0 = t * 0.12;
      wheel.rotation.z = a0;
      const a = gg.attributes.position.array;
      for (let i = 0; i < 12; i++) {
        const ang = a0 + i / 12 * Math.PI * 2;
        const cx = Math.cos(ang) * 7.4, cy = 8.8 + Math.sin(ang) * 7.4;
        const sway = Math.sin(t * 1.3 + i) * 0.04;
        for (let v = i * per; v < (i + 1) * per; v++) {
          const lx = base[v * 3] - i * 100, ly = base[v * 3 + 1];
          a[v * 3] = cx + lx + ly * sway; a[v * 3 + 1] = cy + ly; a[v * 3 + 2] = base[v * 3 + 2] + 0.0;
        }
      }
      gg.attributes.position.needsUpdate = true;
    });
    return root;
  }
  add(root, millFrame());
  const wheel = add(root, millWheel());
  wheel.position.set(0, 1.75, 0);
  animate(root, (t) => { wheel.rotation.z = -t * 0.35; });
  return root;
});

// ------------------------------------------------------------ lighthouse
const lighthouseGeo = () => model('lighthouse', (k) => {
  const bands = [[0, 2.2, '#fdfefe'], [2.2, 3.3, '#c0392b'], [3.3, 5.4, '#fdfefe'], [5.4, 6.5, '#c0392b'], [6.5, 8.2, '#fdfefe']];
  const r = (y) => 1.7 - y / 8.2 * 0.62;
  k.add(cyl(1.95, 2.0, 0.6, 12), { at: [0, -0.3, 0], color: '#9e9a90', outline: 0.03 });
  // (each band meets the next edge to edge, the same width at the seam: run a
  // centimetre into it, the two flickered in a thin ring round the tower)
  for (const [y0, y1, c] of bands) k.add(cyl(r(y1), r(y0), y1 - y0, 14, true), { at: [0, y0 + 0.28, 0], color: c, outline: 0.045 });
  k.add(box(0.85, 1.9, 0.2), { at: [0, 0.28, 1.62], rot: [-0.07, 0, 0], color: '#5a3a22' });
  for (const [y, z] of [[3.9, 1.38], [6.9, 1.2]]) k.add(box(0.36, 0.6, 0.12), { at: [0, y, z], rot: [-0.07, 0, 0], color: '#2d4150', glow: '#ffc766' });
  k.add(cyl(1.5, 1.5, 0.16, 14), { at: [0, 8.48, 0], color: '#2d3436', outline: 0.02 });
  k.add(torus(1.45, 0.03, 4, 20), { at: [0, 9.1, 0], rot: [Math.PI / 2, 0, 0], color: '#2d3436' });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.add(cyl(0.025, 0.025, 0.62, 4), { at: [Math.cos(a) * 1.45, 8.62, Math.sin(a) * 1.45], color: '#2d3436' }); }
  k.add(cyl(0.78, 0.78, 1.15, 12, true), { at: [0, 8.64, 0], color: '#cfe8f7', glow: '#fff3b0', double: true, backShade: 0.9 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.add(box(0.06, 1.15, 0.06), { at: [Math.cos(a) * 0.78, 8.64, Math.sin(a) * 0.78], color: '#2d3436' }); }
  k.add(new THREE.SphereGeometry(0.34, 10, 8), { at: [0, 9.2, 0], color: '#fff8d0', glow: '#fff3b0' });
  k.add(cone(1.0, 1.0, 12), { at: [0, 9.78, 0], color: '#c0392b', outline: 0.03 });
  k.add(new THREE.SphereGeometry(0.14, 6, 4), { at: [0, 10.8, 0], color: '#2d3436' });
});

let beamMat = null;
reg('lighthouse', (o) => {
  const root = group('lighthouse');
  add(root, lighthouseGeo());
  if (!beamMat) beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
  const beam = new THREE.Group();
  beam.position.y = 9.2;
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(4.5, 45, 16, 1, true), beamMat);
    c.rotation.z = s * Math.PI / 2;
    c.position.x = s * 22.5;
    c.renderOrder = 4;
    beam.add(c);
  }
  root.add(beam);
  animate(root, (t, env, st) => {
    beam.visible = st.night > 0.25;
    beam.rotation.y = t * 0.8;
  });
  return root;
});

// ------------------------------------------------------------ treasure chest
const chestBody = (tier) => model('chest-body:' + tier, (k) => {
  const [wood, band] = tier >= 3 ? ['#8e2b22', '#f1c40f'] : tier === 2 ? ['#5d4037', '#cfd8dc'] : ['#8d5b33', '#f1c40f'];
  k.add(box(0.92, 0.5, 0.6), { color: wood, outline: 0.02 });
  for (const x of [-0.34, 0.34]) k.add(box(0.08, 0.52, 0.62), { at: [x, -0.005, 0], color: band });
  k.add(box(0.94, 0.06, 0.62), { at: [0, 0.44, 0], color: band });
  k.add(box(0.16, 0.2, 0.04), { at: [0, 0.25, 0.31], color: band });
  k.add(box(0.05, 0.08, 0.02), { at: [0, 0.3, 0.335], color: '#2d3436' });
  for (const x of [-0.4, 0.4]) for (const z of [-0.24, 0.24]) k.add(box(0.1, 0.06, 0.1), { at: [x, -0.04, z], color: band });
  k.add(new THREE.CircleGeometry(0.3, 10), { at: [0, 0.47, 0], rot: [-Math.PI / 2, 0, 0], scale: [1.4, 0.9, 1], color: '#3b2a1a' });
});
const chestLid = (tier) => model('chest-lid:' + tier, (k) => {
  const [wood, band] = tier >= 3 ? ['#a63a2e', '#f1c40f'] : tier === 2 ? ['#6d4c33', '#cfd8dc'] : ['#a86f3f', '#f1c40f'];
  // hinge at the origin (back top edge); the lid extends towards +z
  k.add(new THREE.CylinderGeometry(0.3, 0.3, 0.92, 12, 1, false, 0, Math.PI), { at: [0, 0, 0.3], rot: [0, 0, Math.PI / 2], color: wood, outline: 0.02 });
  for (const x of [-0.34, 0, 0.34]) k.add(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 12, 1, false, 0, Math.PI), { at: [x, 0, 0.3], rot: [0, 0, Math.PI / 2], color: band });
});
const coinsGeo = () => model('coins', (k) => {
  const R = rng(5);
  for (let i = 0; i < 14; i++) k.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8), { at: [(R() - 0.5) * 0.7, 0.42 + R() * 0.12, (R() - 0.5) * 0.4], rot: [R(), 0, R()], color: '#ffd54f', glow: '#ffb300' });
  k.add(new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), { at: [0, 0.4, 0], scale: [1.3, 0.35, 0.8], color: '#f1c40f' });
});

reg('chest', (o) => {
  const root = group('chest');
  const tier = o.tier ?? 1;
  add(root, chestBody(tier));
  const lid = add(root, chestLid(tier));
  lid.position.set(0, 0.5, -0.3);
  const coins = add(root, coinsGeo(), { castShadow: false });
  const aura = new THREE.Mesh(AURA_GEO, glowMat(0xffe066, { opacity: 0.16, additive: true }));
  aura.position.y = 0.35;
  aura.renderOrder = 3;
  root.add(aura);
  let open = o.opened ? 1 : 0;
  root.rotation.y = (hash(o.x, o.y) - 0.5) * 0.6;
  animate(root, (t) => {
    open += ((o.opened ? 1 : 0) - open) * 0.08;
    lid.rotation.x = -open * 1.95;
    coins.visible = open > 0.05 && !o.empty;
    aura.visible = !o.opened;
    const s = 1 + Math.sin(t * 3 + (o.id || 0)) * 0.12;
    aura.scale.setScalar(s);
  });
  return root;
});

// ------------------------------------------------------------ the Bondola
const bondolaStation = () => model('bondola-station', (k) => {
  k.add(box(5.2, 0.4, 5.2), { at: [0, -0.2, 0], color: '#b0aba2', outline: 0.03 });
  for (const s of [-1, 1]) {
    k.add(box(0.35, 7.5, 0.35), { at: [s * 1.9, 0.2, -1.2], color: '#78909c', outline: 0.02 });
    k.add(box(0.35, 7.5, 0.35), { at: [s * 1.9, 0.2, 1.2], color: '#78909c', outline: 0.02 });
  }
  k.add(box(4.3, 0.4, 2.8), { at: [0, 7.6, 0], color: '#546e7a', outline: 0.02 });
  for (const s of [-1, 1]) k.add(cyl(0.06, 0.06, 70, 5), { at: [s * 0.6, 7.9, 0], color: '#90a4ae' });
  k.add(torus(0.35, 0.08, 5, 12), { at: [-0.6, 8.2, 0], color: '#37474f' });
  k.add(torus(0.35, 0.08, 5, 12), { at: [0.6, 8.2, 0], color: '#37474f' });
});
const bondolaCar = () => model('bondola-car', (k) => {
  k.add(box(2.6, 1.7, 2.1), { at: [0, 0, 0], color: '#eceff1', outline: 0.03 });
  for (const s of [-1, 1]) k.add(cyl(1.05, 1.05, 1.7, 12, false, 1, false), { at: [s * 1.3, 0, 0], scale: [0.35, 1, 1], color: '#eceff1', outline: 0.02 });
  k.add(box(2.7, 0.18, 2.15), { at: [0, 0.55, 0], color: '#1565c0' });
  for (const z of [-1.06, 1.06]) for (let i = -1; i <= 1; i++) k.add(box(0.55, 0.5, 0.05), { at: [i * 0.75, 0.85, z], color: '#81d4fa', glow: '#fff3b0' });
  k.add(box(2.8, 0.2, 2.2), { at: [0, 1.7, 0], color: '#1565c0', outline: 0.02 });
  k.add(cyl(0.08, 0.08, 1.4, 6), { at: [0, 1.9, 0], color: '#546e7a' });
});

reg('elevator', (o) => {
  const root = group('bondola');
  add(root, bondolaStation());
  const car = add(root, bondolaCar());
  const bub = new THREE.Mesh(BUBBLE_GEO, bubbleMaterial());
  bub.scale.set(2.2, 1.7, 1.9);
  bub.renderOrder = 3;
  root.add(bub);
  animate(root, (t) => {
    const y = 1.5 + Math.sin(t * 0.8) * 0.12;
    car.position.y = y; bub.position.y = y + 0.9;
  });
  return root;
});

// ------------------------------------------------------------ gates & arches
const gateGeo = (big) => model('gate:' + big, (k) => {
  const stone = big ? '#e8e2d4' : '#607d8b', dark = big ? '#b0a58f' : '#455a64';
  const W = 6.6, H = 6.4;
  for (const s of [-1, 1]) {
    k.add(box(1.5, H, 1.8), { at: [s * (W / 2 + 0.2), -0.5, 0], color: stone, outline: 0.04 });
    for (let i = -1; i <= 1; i += 2) k.add(box(0.42, 0.55, 0.42), { at: [s * (W / 2 + 0.2) + i * 0.45, H - 0.5, 0.55], color: stone });
    for (let i = -1; i <= 1; i += 2) k.add(box(0.42, 0.55, 0.42), { at: [s * (W / 2 + 0.2) + i * 0.45, H - 0.5, -0.55], color: stone });
    for (let y = 0.6; y < H - 1; y += 0.55) k.add(box(1.52, 0.04, 1.82), { at: [s * (W / 2 + 0.2), y, 0], color: dark });
    k.add(box(0.25, 0.9, 0.05), { at: [s * (W / 2 + 0.2), H - 2.4, 0.91], color: '#1d2a30', glow: '#ffcc80' });
  }
  k.add(box(W, 1.3, 1.5), { at: [0, H - 1.9, 0], color: stone, outline: 0.04 });
  k.add(box(W + 0.4, 0.2, 1.7), { at: [0, H - 0.65, 0], color: dark });
  for (let x = -W / 2 + 0.35; x < W / 2 - 0.2; x += 0.45) k.add(box(0.1, H - 2.1, 0.1), { at: [x, 0, 0.3], color: '#263238' });
  for (const y of [1.2, 2.8]) k.add(box(W, 0.1, 0.1), { at: [0, y, 0.3], color: '#263238' });
  for (let x = -W / 2 + 0.35; x < W / 2 - 0.2; x += 0.45) k.add(cone(0.08, 0.25, 4), { at: [x, -0.25, 0.3], rot: [Math.PI, 0, 0], color: '#263238' });
});

// the great stone gates over Reverse Mountain's canals (origin: the canal's
// middle at the water; the pillars stand on the banks either side)
const rmArchGeo = () => model('rm_arch', (k) => {
  const stone = '#9c5b4a', dark = '#6f3d31', light = '#c08a74', moss = '#5d7a3a';
  const X = 15.2;
  for (const s of [-1, 1]) {
    const x = s * X;
    k.add(box(6.2, 12, 6.2), { at: [x, -10, 0], color: dark, outline: 0.05 });
    k.add(box(5.4, 12, 5.4), { at: [x, 2, 0], color: stone, outline: 0.05 });
    k.add(box(4.8, 9, 4.8), { at: [x, 14, 0], color: stone, outline: 0.05 });
    k.add(box(5.8, 1.2, 5.8), { at: [x, 13.4, 0], color: light });
    k.add(box(5.6, 1.4, 5.6), { at: [x, 22.6, 0], color: light, outline: 0.05 });
    // moss down the weather side
    k.add(box(0.3, 7, 3.2), { at: [x - s * 2.75, 1, 0.4], color: moss });
    k.add(box(2.6, 4, 0.3), { at: [x, 4, 2.75], color: moss });
  }
  // the arch
  const band = new THREE.Shape();
  const Ro = 18.1, Ri = 12.4;
  band.moveTo(-Ro, 0); band.absarc(0, 0, Ro, Math.PI, 0, true); band.lineTo(Ri, 0); band.absarc(0, 0, Ri, 0, Math.PI, false); band.closePath();
  k.add(extrude(band, 4.6, 0, 20), { at: [0, 24, 0], color: stone, outline: 0.06 });
  const trim = new THREE.Shape();
  trim.moveTo(-Ro - 0.4, 0); trim.absarc(0, 0, Ro + 0.4, Math.PI, 0, true); trim.lineTo(Ro - 0.9, 0); trim.absarc(0, 0, Ro - 0.9, 0, Math.PI, false); trim.closePath();
  k.add(extrude(trim, 5.2, 0, 20), { at: [0, 24, 0], color: dark });
  // the keystone, carved with the four seas' waves
  k.add(box(4, 5.2, 5.8), { at: [0, 24 + Ro - 3.6, 0], color: light, outline: 0.05 });
  k.add(box(2.6, 0.5, 0.2), { at: [0, 24 + Ro - 1.4, 2.95], color: '#3d6f8f' });
  k.add(box(2.6, 0.5, 0.2), { at: [0, 24 + Ro - 2.4, 2.95], color: '#3d6f8f' });
});
/**
 * A gate over a Reverse Mountain canal, `a` the way the current runs (the
 * canal water draws these: see rmCanals3d.js). Built for a canal 11 m either
 * side of its middle; stood as wide as the canal is, and tall enough for the
 * greatest ships' mastheads to pass under the arch.
 */
export function rmArch(a, halfW = 11) {
  const root = group('rm_arch');
  add(root, rmArchGeo());
  // (across the canal: its local z runs with the current)
  root.rotation.y = Math.PI / 2 - (a || 0);
  const w = (halfW + 4.2) / 15.2;
  root.scale.set(w, 2.9, w);
  return root;
}

reg('gate', (o) => {
  const root = group('gate');
  const big = /justice/i.test(o.name || '') ? 1 : 0;
  const m = add(root, gateGeo(big));
  if (big) m.scale.setScalar(2.2);
  if (o.name && !/^main gate$/i.test(o.name)) root.add(nameBoard(o.name, big ? 13 : 6, (big ? 2.2 : 1) * 4.75, big ? 1.8 : 0.85, big));
  return root;
});

function nameBoard(text, maxW, y, z, marine) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = 'bold 44px Nunito, "Trebuchet MS", sans-serif';
  g.font = font;
  const w = Math.min(1024, Math.ceil(g.measureText(text).width) + 56);
  c.width = w; c.height = 72;
  g.font = font;
  g.fillStyle = marine ? '#f5f6fa' : '#5a3a22'; g.strokeStyle = marine ? '#1b4f72' : '#2b1d14'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(3, 3, w - 6, 66, 10); g.fill(); g.stroke();
  g.fillStyle = marine ? '#1b4f72' : '#f5e6c4'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, 38, w - 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const aspect = w / 72;
  const bw = Math.min(maxW, 0.62 * aspect);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw / aspect), new THREE.MeshToonMaterial({ map: t }));
  m.position.set(0, y, z);
  m.userData.ownTexture = t;
  return m;
}

const stoneArch = () => model('arch-stone', (k) => {
  const s = new THREE.Shape();
  const R = 2.3, r = 1.55, H = 2.2;
  s.moveTo(-R, 0); s.lineTo(-R, H); s.absarc(0, H, R, Math.PI, 0, true); s.lineTo(R, 0); s.lineTo(r, 0); s.lineTo(r, H);
  s.absarc(0, H, r, 0, Math.PI, false); s.lineTo(-r, 0); s.closePath();
  k.add(extrude(s, 1.2, 0.06, 10), { at: [0, -0.3, 0], flat: true, color: '#8e7a66', outline: 0.04 });
  const d = new THREE.Shape();
  d.moveTo(-r, 0); d.lineTo(r, 0); d.lineTo(r, H); d.absarc(0, H, r, 0, Math.PI, false); d.closePath();
  k.add(new THREE.ShapeGeometry(d, 10), { at: [0, -0.3, -0.3], color: '#15100c' });
  const R2 = rng(3);
  for (let i = 0; i < 7; i++) k.add(new THREE.IcosahedronGeometry(0.3 + R2() * 0.4, 0), { at: [(R2() > 0.5 ? 1 : -1) * (R + 0.3 + R2() * 0.6), R2() * 0.5, (R2() - 0.5) * 1.2], flat: true, color: '#7d6b5a', outline: 0.02 });
  for (let i = 0; i < 9; i++) { const a = i / 8 * Math.PI; k.add(box(0.3, 0.12, 1.25), { at: [Math.cos(a) * (R - 0.05), H - 0.3 + Math.sin(a) * (R - 0.05), 0], rot: [0, 0, a - Math.PI / 2], color: '#a8927c' }); }
});

const mineArch = () => model('arch-mine', (k) => {
  const g = new THREE.SphereGeometry(3.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  k.add(g, { at: [0, -0.4, -1.8], scale: [1, 0.75, 0.8], flat: true, color: '#7d7066', outline: 0.04 });
  k.add(box(2.2, 2.6, 0.2), { at: [0, -0.2, 0.62], color: '#120d0a' });
  for (const s of [-1, 1]) k.add(box(0.28, 2.8, 0.28), { at: [s * 1.2, -0.2, 0.75], color: '#6d4c33', outline: 0.02 });
  k.add(box(3.0, 0.32, 0.36), { at: [0, 2.5, 0.75], color: '#6d4c33', outline: 0.02 });
  k.add(box(0.8, 0.12, 0.05), { at: [0, 2.2, 0.95], color: '#c8a878' });
  for (const s of [-1, 1]) k.add(box(0.12, 0.05, 3), { at: [s * 0.45, 0, 1.5], color: '#5d4037' });
  for (let z = 0.3; z < 3; z += 0.45) k.add(box(1.2, 0.06, 0.16), { at: [0, -0.02, z], color: '#6d4c33' });
});

const heavensGate = () => model('arch-heaven', (k) => {
  const R = rng(7);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) k.add(new THREE.IcosahedronGeometry(0.8 + R() * 0.3, 1), { at: [s * 3.2 + (R() - 0.5) * 0.4, i * 0.9, (R() - 0.5) * 0.4], color: '#ffffff', outline: 0.03, outlineColor: '#9fb7cc' });
  }
  k.add(box(7.8, 1.1, 0.9), { at: [0, 5.1, 0], color: '#f5f6fa', outline: 0.04 });
  for (let i = 0; i < 9; i++) k.add(new THREE.IcosahedronGeometry(0.7 + R() * 0.3, 1), { at: [-3.6 + i * 0.9, 6.1 + R() * 0.3, (R() - 0.5) * 0.3], color: '#ffffff', outline: 0.03, outlineColor: '#9fb7cc' });
  for (let i = 0; i < 8; i++) k.add(new THREE.IcosahedronGeometry(0.6 + R() * 0.4, 1), { at: [(R() - 0.5) * 8, 0, 0.6 + R() * 0.8], color: '#f4f8ff' });
});

const grandArch = () => model('arch-grand', (k) => {
  const s = new THREE.Shape();
  const R = 3.6, r = 2.6, H = 3.2;
  s.moveTo(-R, 0); s.lineTo(-R, H); s.absarc(0, H, R, Math.PI, 0, true); s.lineTo(R, 0); s.lineTo(r, 0); s.lineTo(r, H);
  s.absarc(0, H, r, 0, Math.PI, false); s.lineTo(-r, 0); s.closePath();
  k.add(extrude(s, 1.6, 0.08, 12), { at: [0, -0.3, 0], color: '#cfc3a8', outline: 0.05 });
  const t = new THREE.Shape();
  t.moveTo(-R - 0.05, H); t.absarc(0, H, R + 0.05, Math.PI, 0, true); t.lineTo(R - 0.25, H); t.absarc(0, H, R - 0.25, 0, Math.PI, false); t.closePath();
  k.add(extrude(t, 1.7, 0, 12), { at: [0, -0.3, 0], color: '#d4ac0d' });
});

reg('arch', (o) => {
  const root = group('arch');
  const n = o.name || '';
  if (/heaven/i.test(n)) { add(root, heavensGate()); root.add(nameBoard("HEAVEN'S GATE", 6, 5.65, 0.47)); }
  else if (/mine|hatch|laboratory/i.test(n)) add(root, mineArch());
  else if (/one piece|resting/i.test(n)) add(root, grandArch());
  else add(root, stoneArch());
  return root;
});

// ------------------------------------------------------------ torii
const toriiGeo = () => model('torii', (k) => {
  const red = '#c0392b', black = '#2d3436';
  // (the pillars run on down into the ground: on a slope it stands at its lower foot, see footY)
  for (const s of [-1, 1]) {
    k.add(cyl(0.2, 0.24, 5.0, 12), { at: [s * 1.55, -0.7, 0], color: red, outline: 0.03 });
    k.add(cyl(0.3, 0.32, 1.05, 12), { at: [s * 1.55, -0.7, 0], color: black });
  }
  k.add(box(3.9, 0.26, 0.3), { at: [0, 3.25, 0], color: red, outline: 0.02 });
  k.add(box(0.28, 0.72, 0.24), { at: [0, 3.5, 0], color: red });
  // the curved top lintel with upturned ends
  const n = 9;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) * 2 - 1;
    const x = u * 2.6, y = 4.3 + Math.pow(Math.abs(u), 2.4) * 0.38;
    const slope = 0.38 * 2.4 * Math.pow(Math.abs(u), 1.4) * Math.sign(u) / 2.6;
    const ang = Math.atan(slope);
    k.add(cbox(5.25 / (n - 1) + 0.08, 0.3, 0.5), { at: [x, y, 0], rot: [0, 0, ang], color: red, outline: 0.02 });
    k.add(cbox(5.25 / (n - 1) + 0.08, 0.18, 0.56), { at: [x - Math.sin(ang) * 0.23, y + Math.cos(ang) * 0.23, 0], rot: [0, 0, ang], color: black });
  }
});
const TORII_FEET = [...postFeet(-1.55, 0, 0.32), ...postFeet(1.55, 0, 0.32)];
reg('torii', (o, ctx) => simple(o, ctx, 'torii', toriiGeo(), { yaw: 0, y: footY(o, ctx, TORII_FEET) }));

// ------------------------------------------------------------ platforms
const scaffoldGeo = () => model('platform-exec', (k) => {
  const wood = '#7b5e3b', dark = '#4e3a22';
  k.add(box(3.4, 2.5, 2.6), { at: [0, -0.3, -0.2], color: wood, outline: 0.035 });
  for (let x = -1.5; x <= 1.5; x += 0.42) k.add(box(0.05, 2.45, 0.02), { at: [x, -0.25, 1.11], color: dark });
  k.add(box(3.6, 0.2, 2.8), { at: [0, 2.2, -0.2], color: '#9c7a4f', outline: 0.02 });
  for (let i = 0; i < 6; i++) k.add(box(1.0, 0.1, 0.34), { at: [0, i * 0.38, 1.2 + (5 - i) * 0.3], color: '#6d4c33', outline: 0.012 });
  for (const s of [-1, 1]) {
    k.add(box(0.2, 2.6, 0.2), { at: [s * 1.25, 2.4, -0.8], color: dark, outline: 0.02 });
    k.add(box(0.06, 0.9, 0.06), { at: [s * 1.6, 2.4, 0.9], color: dark });
  }
  k.add(box(2.9, 0.22, 0.24), { at: [0, 4.95, -0.8], color: dark, outline: 0.02 });
  k.add(box(3.4, 0.06, 0.06), { at: [0, 3.2, 0.9], color: dark });
});
const ringGeo = () => model('platform-ring', (k) => {
  k.add(box(4.6, 1.0, 4.6), { at: [0, -0.2, 0], color: '#546e7a', outline: 0.03 });
  k.add(box(4.4, 0.08, 4.4), { at: [0, 0.8, 0], color: '#eceff1' });
  const cols = ['#e53935', '#1e88e5', '#e53935', '#1e88e5'];
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, z], i) => k.add(cyl(0.1, 0.1, 1.5, 6), { at: [x * 2.1, 0.8, z * 2.1], color: cols[i], outline: 0.012 }));
  for (const y of [1.25, 1.65, 2.05]) for (const [a, b] of [[[-2.1, -2.1], [2.1, -2.1]], [[2.1, -2.1], [2.1, 2.1]], [[2.1, 2.1], [-2.1, 2.1]], [[-2.1, 2.1], [-2.1, -2.1]]]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    k.add(cyl(0.025, 0.025, len, 4), { at: [a[0], y, a[1]], rot: [0, -Math.atan2(b[1] - a[1], b[0] - a[0]), -Math.PI / 2], color: '#fafafa' });
  }
  for (let i = 0; i < 4; i++) k.add(box(0.9, 0.12, 0.3), { at: [1.4, i * 0.2 - 0.1, 2.5 + (3 - i) * 0.28], color: '#90a4ae' });
});
const stageGeo = () => model('platform-stage', (k) => {
  k.add(box(4.6, 1.1, 3.2), { at: [0, -0.2, 0], color: '#8d6e4a', outline: 0.03 });
  k.add(box(4.8, 0.12, 3.4), { at: [0, 0.9, 0], color: '#a1887f' });
  for (const s of [-1, 1]) {
    k.add(box(0.3, 3.4, 0.3), { at: [s * 2.25, 0.9, -1.4], color: '#6d4c33', outline: 0.02 });
    k.add(box(1.3, 2.8, 0.1), { at: [s * 1.6, 1.4, -1.3], color: '#c62828', double: true });
  }
  k.add(box(4.9, 0.6, 0.35), { at: [0, 4.2, -1.4], color: '#c62828', outline: 0.02 });
  k.add(box(4.6, 2.6, 0.08), { at: [0, 1.0, -1.55], color: '#5d1a1a' });
  for (let i = 0; i < 4; i++) k.add(box(1.2, 0.14, 0.34), { at: [0, i * 0.24 - 0.1, 1.8 + (3 - i) * 0.3], color: '#6d4c33' });
});

reg('platform', (o, ctx) => {
  // (its deck is the ground for anyone standing on it — the height model says
  // so — but the platform itself stands on the terrain underneath, or it would
  // float a deck's height up in the air)
  const root = group('platform');
  const body = new THREE.Group();
  root.add(body);
  const n = o.name || '';
  add(body, /ring/i.test(n) ? ringGeo() : /stage|carnival/i.test(n) ? stageGeo() : scaffoldGeo());
  if (o.s && o.s !== 1) body.scale.setScalar(o.s);
  body.position.y = ctx.terrain(o.x, o.y);
  root.userData.noGround = true;
  return root;
});

// ------------------------------------------------------------ bell
const bellGeo = (big) => model('bell:' + big, (k) => {
  const s = big ? 1 : 0.32;
  const frame = big ? '#b7950b' : '#6d4c33';
  const P = [[0.02, 2.15], [0.3, 2.12], [0.5, 1.98], [0.6, 1.7], [0.66, 1.3], [0.78, 0.95], [0.95, 0.72], [1.0, 0.64], [0.9, 0.62]].map(([r, y]) => [r * s, y * s]);
  k.save(); k.translate(0, (big ? 1.2 : 1.0), 0);
  k.add(lathe(P, 16), { color: '#f1c40f', outline: 0.04 * s + 0.01 });
  k.add(torus(0.95 * s, 0.05 * s, 5, 16), { at: [0, 0.72 * s, 0], rot: [Math.PI / 2, 0, 0], color: '#d4ac0d' });
  k.add(new THREE.SphereGeometry(0.18 * s, 8, 6), { at: [0, 0.75 * s, 0], color: '#b7950b' });
  k.add(cyl(0.12 * s, 0.12 * s, 0.3 * s, 8), { at: [0, 2.12 * s, 0], color: '#b7950b' });
  k.restore();
  const top = (big ? 1.2 : 1.0) + 2.45 * s;
  for (const sx of [-1, 1]) k.add(box(0.3 * s + 0.08, top + 0.8, 0.3 * s + 0.08), { at: [sx * (1.35 * s + 0.2), -0.6, 0], color: frame, outline: 0.03 });
  k.add(box(2.9 * s + 0.7, 0.3 * s + 0.1, 0.4 * s + 0.1), { at: [0, top + 0.1, 0], color: frame, outline: 0.02 });
  if (big) for (const sx of [-1, 1]) k.add(cone(0.35, 0.5, 4), { at: [sx * 1.9, top + 0.4, 0], rot: [0, Math.PI / 4, 0], color: frame });
});
// (on a slope it stands at the lower of its posts' feet, the other running on into the ground)
const bellFeet = (big) => { const s = big ? 1 : 0.32, x = 1.35 * s + 0.2, h = (0.3 * s + 0.08) / 2; return [...postFeet(-x, 0, h), ...postFeet(x, 0, h)]; };
reg('bell', (o, ctx) => {
  const big = /harbou?r/i.test(o.name || '') ? 0 : 1;
  return simple(o, ctx, 'bell:' + big, bellGeo(big), { yaw: 0, y: footY(o, ctx, bellFeet(big)) });
});

// ------------------------------------------------------------ poneglyph
const poneglyphGeo = (red) => model('poneglyph:' + red, (k) => {
  const stone = red ? '#8e2b22' : '#37474f', light = red ? '#ffcdb4' : '#c8e6f0';
  k.add(box(2.6, 0.35, 2.4), { at: [0, -0.2, 0], color: red ? '#6e5a50' : '#5d6468', outline: 0.025 });
  k.add(box(2.05, 2.05, 2.05), { at: [0, 0.15, 0], color: stone, outline: 0.04, flat: true });
  const R = rng(red ? 5 : 3);
  for (const face of [0, 1, 2, 3]) {
    k.save(); k.rotateY(face * Math.PI / 2);
    for (let r = 0; r < 7; r++) {
      let x = -0.85;
      while (x < 0.8) {
        const w = 0.08 + R() * 0.16;
        k.add(box(w, 0.11, 0.02), { at: [x + w / 2, 0.42 + r * 0.25, 1.03], color: light, glow: red ? '#ff8a65' : '#4fc3f7' });
        x += w + 0.06 + R() * 0.06;
      }
    }
    k.restore();
  }
});
reg('poneglyph', (o, ctx) => simple(o, ctx, 'poneglyph:' + (o.road ? 1 : 0), poneglyphGeo(o.road ? 1 : 0), { yaw: 0, scale: 1 }));

// ------------------------------------------------------------ statue
const statueGeo = () => model('statue', (k) => {
  const stone = '#a3adb0', base = '#8a8378';
  k.add(box(1.8, 1.1, 1.8), { at: [0, -0.2, 0], color: base, outline: 0.03 });
  k.add(box(2.0, 0.18, 2.0), { at: [0, 0.9, 0], color: shade(base, 0.1) });
  k.add(box(1.5, 0.16, 1.5), { at: [0, -0.2, 0], color: shade(base, -0.1) });
  k.save(); k.translate(0, 1.08, 0);
  for (const s of [-1, 1]) k.add(cyl(0.16, 0.2, 1.3, 7), { at: [s * 0.22, 0, 0], color: stone, outline: 0.02 });
  k.add(cyl(0.42, 0.34, 1.2, 8), { at: [0, 1.25, 0], color: stone, outline: 0.03 });
  k.add(new THREE.SphereGeometry(0.3, 10, 8), { at: [0, 2.72, 0], color: stone, outline: 0.02 });
  k.add(cyl(0.34, 0.34, 0.12, 10), { at: [0, 2.9, 0], color: stone });
  k.add(cyl(0.16, 0.22, 0.28, 8), { at: [0, 2.98, 0], color: stone });
  // one arm raised with a sword, one at the side
  k.add(cyl(0.1, 0.12, 0.95, 6), { at: [0.45, 2.25, 0], rot: [0, 0, -2.6], color: stone, outline: 0.015 });
  k.add(box(0.07, 1.3, 0.16), { at: [0.9, 2.95, 0], rot: [0, 0, -0.25], color: '#cfd8dc', outline: 0.012 });
  k.add(cyl(0.1, 0.12, 0.9, 6), { at: [-0.44, 2.35, 0], rot: [0, 0, 0.35], color: stone, outline: 0.015 });
  k.add(slab([[-0.55, 0], [0.55, 0], [0.4, 1.3], [-0.4, 1.3]], 0.1), { at: [0, 1.25, -0.4], color: shade(stone, -0.1) });
  k.restore();
});
reg('statue', (o, ctx) => simple(o, ctx, 'statue', statueGeo(), { yaw: 0 }));

// ------------------------------------------------------------ shipwreck
// (a wreck, and a beached ship, are the size of the brigantine these models
// were made round — 6.8 m — not a full-size One Piece brigantine: see
// world/objects.js COLLIDE, where they're solid)
const SMALL_SHIP = 6.8;
const smallHull = (def) => { const g = hullGeometry(def).clone(); const f = SMALL_SHIP / def.length; g.scale(f, f, f); return g; };
const wreckGeo = () => model('shipwreck', (k) => {
  const g = smallHull(SHIPS.brigantine);
  k.save(); k.translate(0, 0.35, 0); k.rotateZ(-0.12); k.rotateX(0.42);
  k.add(g, { attrs: true, colorMul: 0.72 });
  // a snapped mast with a torn sail, broken ribs
  k.add(cyl(0.1, 0.13, 3.8, 7), { at: [0.6, 0.6, 0], rot: [0, 0, 0.25], color: '#3e2723', outline: 0.02 });
  k.add(ribbon([[0.2, 3.7, 0, 0.05], [0.9, 3.2, 0.4, 0.5], [1.4, 2.5, 0.2, 0.35], [1.6, 2.0, 0.5, 0.12]], { side: [0, 0, 1] }), { color: '#ece6d6', double: true });
  for (let i = 0; i < 5; i++) k.add(torus(1.2, 0.07, 4, 8, Math.PI * 0.7), { at: [-2.4 - i * 0.35, 0.6, 0], rot: [Math.PI / 2, Math.PI / 2, 0], color: '#4e342e' });
  k.restore();
  const R = rng(6);
  for (let i = 0; i < 6; i++) k.add(box(1.2 + R(), 0.08, 0.22), { at: [(R() - 0.5) * 7, 0.03, 2 + R() * 2], rot: [0, R() * 3, 0], color: '#6d4c33' });
});
reg('shipwreck', (o, ctx) => {
  const m = simple(o, ctx, 'shipwreck', wreckGeo(), { yaw: o.yaw ?? hash(o.x, o.y) * Math.PI * 2 });
  return m;
});

// ------------------------------------------------------------ boats
const boatGeo = (big) => model('boat:' + big, (k) => {
  const g = big ? smallHull(SHIPS.brigantine) : hullGeometry(SHIPS.dinghy);
  k.save(); k.translate(0, big ? 0.2 : 0.42, 0); k.rotateX(big ? 0.05 : 0.18);
  k.add(g, { attrs: true });
  k.restore();
});
reg('boat', (o, ctx) => {
  const big = /flagship|perfume/i.test(o.name || '') ? 1 : 0;
  return simple(o, ctx, 'boat:' + big, boatGeo(big), { yaw: o.yaw ?? hash(o.x, o.y) * Math.PI * 2 });
});

// ------------------------------------------------------------ tower
const towerGeo = (h) => model('tower:' + h, (k) => {
  const stone = '#b0bec5', dark = '#78909c';
  k.add(cyl(2.0, 2.2, 0.8, 12), { at: [0, -0.4, 0], color: dark, outline: 0.03 });
  k.add(cyl(1.6, 1.8, h, 12), { at: [0, 0.3, 0], color: stone, outline: 0.045 });
  for (let y = 1.2; y < h; y += 1.1) k.add(cyl(1.62 + (1 - y / h) * 0.2, 1.62 + (1 - y / h) * 0.2, 0.05, 12, true), { at: [0, y, 0], color: shade(stone, -0.12) });
  k.add(cyl(2.05, 1.85, 0.6, 12), { at: [0, h + 0.2, 0], color: dark, outline: 0.03 });
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.add(box(0.5, 0.6, 0.4), { at: [Math.cos(a) * 1.8, h + 0.8, Math.sin(a) * 1.8], rot: [0, -a, 0], color: stone, outline: 0.015 }); }
  for (let y = 2.2; y < h - 0.5; y += 2.2) for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + y; k.add(box(0.28, 0.75, 0.2), { at: [Math.cos(a) * 1.68, y, Math.sin(a) * 1.68], rot: [0, -a + Math.PI / 2, 0], color: '#1d2a30', glow: '#ffcc80' }); }
  k.add(box(1.0, 2.0, 0.3), { at: [0, 0.3, 1.72], color: '#4e342e' });
});
reg('tower', (o, ctx) => {
  const n = o.name || '';
  const h = o.h || (/justice/i.test(n) ? 16 : /impel/i.test(n) ? 12 : /umbrella|lodge/i.test(n) ? 7 : 10);
  const s = Math.max(1, (o.fw || 1) / 2.5);
  return simple(o, ctx, 'tower:' + h, towerGeo(h), { yaw: 0, scale: s });
});

// ------------------------------------------------------------ stairwell
const portalGeo = (up) => model('portal:' + up, (k) => {
  k.add(box(2.7, 0.35, 2.7), { at: [0, -0.2, 0], color: '#5d5d5d', outline: 0.025 });
  k.add(box(2.1, 0.06, 2.1), { at: [0, 0.14, 0], color: '#0b0b0d' });
  for (let i = 0; i < 5; i++) k.add(box(1.7, 0.1, 0.34), { at: [0, 0.1 - i * 0.24, -0.8 + i * 0.36], color: shade('#6d6d6d', -i * 0.1) });
  for (const s of [-1, 1]) k.add(box(0.2, 0.9, 2.3), { at: [s * 1.2, 0, 0], color: '#6d6d6d', outline: 0.02 });
});
const arrowGeo = () => model('portal-arrow', (k) => {
  k.add(cone(0.28, 0.42, 4), { at: [0, 0, 0], rot: [Math.PI, 0, 0], color: '#ffffff', glow: '#ffffff', outline: 0.02 });
  k.add(box(0.14, 0.35, 0.14), { at: [0, 0, 0], color: '#ffffff', glow: '#ffffff', outline: 0.015 });
});
reg('portal', (o) => {
  const root = group('portal');
  add(root, portalGeo(o.up ? 1 : 0));
  const arrow = new THREE.Mesh(arrowGeo(), glowMat(o.up ? 0x90caf9 : 0xff8a65));
  root.add(arrow);
  if (o.up) arrow.rotation.z = Math.PI;
  animate(root, (t) => { arrow.position.y = 1.4 + Math.sin(t * 3) * 0.15; arrow.rotation.y = t * 1.5; });
  return root;
});

// ------------------------------------------------------------ signs
reg('sign', (o, ctx) => {
  if (!o.name) return simple(o, ctx, 'sign', signModel(), { yaw: 0 });
  const root = group('sign');
  const board = nameBoard(o.name, 2.6, 0, 0);
  const bw = board.geometry.parameters.width, bh = Math.max(0.3, board.geometry.parameters.height);
  board.scale.set(1, bh / board.geometry.parameters.height, 1);
  const k = new Mesher();
  const y0 = 1.05;
  for (const s2 of bw > 1.2 ? [-1, 1] : [0]) k.add(box(0.1, y0 + bh + 0.1, 0.1), { at: [s2 * (bw / 2 - 0.12), 0, 0], color: '#6d4c33', outline: 0.012 });
  k.add(box(bw + 0.14, bh + 0.14, 0.07), { at: [0, y0 - 0.07, 0.07], color: '#5a3a22', outline: 0.018 });
  root.add(meshOf(k.build(false)));
  board.position.set(0, y0 + bh / 2, 0.112);
  root.add(board);
  return root;
});

// ------------------------------------------------------------ Laboon
// The Island Whale of Twin Cape: a hill of a whale, most of him a blunt,
// towering head — a front like a cliff face, battered pink with fifty years
// of scars from ramming the Red Line — a long mouth line low down, a pale
// pleated throat and belly, a small sad eye set just above the corner of the
// mouth, little flippers, and a body that tapers away behind to the flukes.
// Model units are metres; +x runs from his forehead (−x, facing the Red Line)
// back to his tail; y = 0 is the waterline.
const LB = { L: 112, X0: -52 };
// (half height, half width and the height of the middle, along him: t 0 forehead → 1 tail)
const lbCurve = (t, pts) => {
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, a] = pts[i - 1], [t1, b] = pts[i];
      const k = (t - t0) / (t1 - t0), s = k * k * (3 - 2 * k);
      return a + (b - a) * s;
    }
  }
  return pts[pts.length - 1][1];
};
const LB_H = [[0, 21], [0.035, 26.5], [0.12, 28.5], [0.38, 27.5], [0.52, 22], [0.68, 14], [0.84, 7.5], [0.95, 3.6], [1, 2.4]];
const LB_W = [[0, 16], [0.035, 20.5], [0.2, 22], [0.42, 21], [0.58, 15.5], [0.74, 9.5], [0.9, 4.6], [1, 2.6]];
const LB_Y = [[0, 3.5], [0.2, 3], [0.6, 1.5], [1, 0.6]];
const LB_N = [[0, 3.4], [0.35, 3], [0.6, 2.4], [1, 2]]; // squarer at the head, rounder toward the tail
const lbMouthY = (t) => lbCurve(t, LB_Y) - lbCurve(t, LB_H) * 0.34; // the mouth line (to t ≈ 0.5)
const lbX = (t) => LB.X0 + t * LB.L;
const lbT = (x) => (x - LB.X0) / LB.L;

function laboonBody() {
  const NU = 96, NV = 72;
  const pos = [], idx = [];
  const ring = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, t = Math.pow(u, 1.25); // (closer rings at the head)
    const H = lbCurve(t, LB_H), Wd = lbCurve(t, LB_W), Y = lbCurve(t, LB_Y), n = lbCurve(t, LB_N);
    const e = 2 / n;
    const x = lbX(t) - (t < 0.03 ? 0 : 0);
    ring.push(pos.length / 3);
    for (let j = 0; j < NV; j++) {
      const a = (j / NV) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const yy = Math.sign(sn) * Math.pow(Math.abs(sn), e) * H;
      const zz = Math.sign(c) * Math.pow(Math.abs(c), e) * Wd;
      // (the forehead bulges forward a little in the middle, like a cliff that leans)
      const bulge = t < 0.06 ? (1 - t / 0.06) * (1 - (yy / H) ** 2 * 0.6) * 2.2 : 0;
      pos.push(x - bulge, Y + yy, zz);
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = ring[i] + j, b = ring[i] + ((j + 1) % NV), c = ring[i + 1] + j, d = ring[i + 1] + ((j + 1) % NV);
      // (wound to face outward: turned inside out, the lit skin faced into
      // him and his ink outline drew over him — a black silhouette)
      idx.push(a, c, b, b, c, d);
    }
  }
  // caps: the flat forehead and the tail tip
  const front = pos.length / 3; pos.push(LB.X0 - 3.2, lbCurve(0, LB_Y), 0);
  for (let j = 0; j < NV; j++) idx.push(front, ring[0] + j, ring[0] + ((j + 1) % NV));
  const back = pos.length / 3; pos.push(lbX(1) + 1.5, lbCurve(1, LB_Y), 0);
  for (let j = 0; j < NV; j++) idx.push(back, ring[NU] + ((j + 1) % NV), ring[NU] + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const laboonGeo = () => model('laboon2', (k) => {
  const slate = C('#56708e'), slateTop = C('#4a6180'), belly = C('#e7edf0'), pleat = C('#b8c6cf'), scar = C('#d9b7b1'), scarDark = C('#b98e8a');
  const tmp = new THREE.Color();
  k.add(laboonBody(), {
    outline: 0.18,
    color: (p) => {
      const t = lbT(p.x);
      const H = lbCurve(Math.max(0, t), LB_H), Y = lbCurve(Math.max(0, t), LB_Y);
      const my = t < 0.52 ? lbMouthY(Math.max(0, t)) : Y - H * (0.34 + (t - 0.52) * 0.5);
      if (p.y < my) {
        // the throat and belly, pleated from the chin back
        const d = my - p.y;
        return (t < 0.62 && ((d * 0.42) % 1) < 0.2) ? pleat : belly;
      }
      // fifty years of scars across the forehead
      if (t < 0.07 && p.y > my + 2) {
        const h = hash(Math.floor(p.y * 0.55), Math.floor(p.z * 0.55), 7);
        if (h > 0.58) return h > 0.8 ? scarDark : scar;
      }
      const up = Math.max(0, (p.y - Y) / H);
      return tmp.copy(slate).lerp(slateTop, up * 0.8);
    },
  });
  // the mouth line: along both sides and across the forehead's foot
  for (const s of [-1, 1]) {
    const pts = [];
    for (let t = 0; t <= 0.5; t += 0.02) {
      const W = lbCurve(t, LB_W);
      pts.push(new THREE.Vector3(lbX(t) + (t === 0 ? -1.6 : 0), lbMouthY(t), s * (t === 0 ? 0 : W * 0.985)));
    }
    k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.55, 5), { color: '#26313d' });
  }
  // the eyes: small, set just above the corner of the mouth, with a heavy lid
  const te = 0.43, xe = lbX(te), ye = lbMouthY(te) + 3.4, we = lbCurve(te, LB_W);
  for (const s of [-1, 1]) {
    k.add(new THREE.SphereGeometry(2.1, 14, 10), { at: [xe, ye, s * (we - 0.9)], color: '#f4f6f8' });
    k.add(new THREE.SphereGeometry(1.25, 12, 8), { at: [xe - 0.5, ye - 0.2, s * (we + 0.35)], color: '#111418' });
    k.add(new THREE.SphereGeometry(0.35, 6, 5), { at: [xe - 0.9, ye + 0.35, s * (we + 1.2)], color: '#ffffff' });
    k.add(new THREE.SphereGeometry(2.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), { at: [xe + 0.2, ye + 0.35, s * (we - 0.8)], rot: [s * 0.35, 0, 0.25], color: '#4d6481', outline: 0.06 });
    // a flipper low behind the mouth
    k.add(new THREE.SphereGeometry(1, 12, 8), { at: [lbX(0.55), lbMouthY(0.5) - 5, s * (lbCurve(0.55, LB_W) + 1.5)], rot: [s * 0.9, -s * 0.55, -0.35], scale: [7.5, 0.9, 3.2], color: '#4e6785', outline: 0.08 });
  }
  // the blowhole on the crown, a hump along the back, and the flukes
  k.add(new THREE.SphereGeometry(1, 10, 6), { at: [lbX(0.13), lbCurve(0.13, LB_Y) + lbCurve(0.13, LB_H) - 0.25, 0], scale: [2.2, 0.35, 1.1], color: '#2e3a47' });
  k.add(new THREE.SphereGeometry(1, 10, 8), { at: [lbX(0.66), lbCurve(0.66, LB_Y) + lbCurve(0.66, LB_H) - 0.6, 0], scale: [4.5, 1.8, 1.6], color: '#4a6180', outline: 0.06 });
  for (const s of [-1, 1]) {
    k.add(new THREE.SphereGeometry(1, 14, 8), { at: [lbX(1) + 5.5, lbCurve(1, LB_Y) + 0.2, s * 6.5], rot: [0, s * 0.45, 0], scale: [5.5, 0.8, 8.5], color: '#4a6180', outline: 0.08 });
  }
});
reg('p1_laboon', (o) => {
  const root = group('laboon');
  root.userData.noGround = true;
  const whale = add(root, laboonGeo());
  // the Jolly Roger you painted over his scars
  const mark = new Mesher();
  mark.add(new THREE.SphereGeometry(0.8, 10, 8), { at: [0, 0.3, 0], scale: [0.2, 1, 1], color: '#fafafa' });
  for (const a of [0.8, -0.8]) mark.add(box(0.1, 2.6, 0.26), { at: [0, -0.6, 0], rot: [a, 0, 0], color: '#fafafa' });
  const markMesh = new THREE.Mesh(mark.build(false), vcMat());
  markMesh.scale.setScalar(5.5);
  markMesh.position.set(LB.X0 - 3.0, 12, 0);
  root.add(markMesh);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 3.2, 1, 12, 1, true), glowMat(0xe1f5fe, { opacity: 0.6 }));
  spout.position.set(lbX(0.13), 30, 0);
  root.add(spout);
  animate(root, (t) => {
    const c = STATE.game?.state?.char;
    // until he's made his promise he still rams the Red Line, every so often
    const ph = t % 26;
    const ram = !c?.flags?.p1_laboonPromise && ph < 3.2 ? Math.sin((ph / 3.2) * Math.PI) : 0;
    const y = -0.8 + Math.sin(t * 0.45) * 0.35 - ram * 0.6;
    whale.position.set(-ram * 7, y, 0);
    markMesh.position.set(LB.X0 - 3.0 - ram * 7, 12 + y, 0);
    markMesh.visible = !!c?.flags?.p1_laboonMark;
    const sp = t % 17;
    const h = sp < 2.4 ? Math.sin((sp / 2.4) * Math.PI) * 18 : 0;
    spout.visible = h > 0.2;
    spout.scale.set(1 + h * 0.04, h, 1 + h * 0.04);
    spout.position.set(lbX(0.13) - ram * 7, 28 + y + h / 2, 0);
  });
  return root;
});
reg('p1_laboon_talk', () => { const g = new THREE.Object3D(); return g; });

// ------------------------------------------------------------ Ryugu Palace
// The palace of the Ryugu Kingdom, high over Fish-Man Island as in the
// anime: a castle of white walls and onion domes, coral pink, sea green and
// gold, on a great stalk of coral, in a bubble of its own.
const ryuguGeo = () => model('ryugu', (k) => {
  const coral = '#f48fb1', coralD = '#d9668f', wall = '#fff4f6', band = '#f8bbd0', pink = '#ec407a', teal = '#26c6da', gold = '#ffca28', win = '#3a2a4a';
  // the stalk: flared at its foot, slender in the middle, opening out under the palace
  k.add(lathe([[9.5, 0], [8.2, 2], [6.1, 7], [4.7, 15], [4.4, 23], [5.4, 30], [8.2, 36], [12.2, 40], [13.4, 41.4], [0, 41.6]], 28), { color: coral, outline: 0.08 });
  // its branches, curling up and out (with knobbly tips)
  for (let i = 0; i < 6; i++) {
    const a = i * 1.047 + 0.4, y = 9 + (i % 3) * 7, L = 6 + (i % 2) * 3;
    const ca = Math.cos(a), sa = Math.sin(a);
    k.add(cyl(0.9, 1.4, L, 8), { at: [ca * 4.4, y, sa * 4.4], rot: [0, -a, -1.0], color: coralD, outline: 0.05 });
    const tx = ca * (4.4 + L * 0.84), ty = y + L * 0.54, tz = sa * (4.4 + L * 0.84);
    k.add(cyl(0.6, 0.9, 3.4, 8), { at: [tx, ty, tz], rot: [0, -a, -0.25], color: coralD, outline: 0.04 });
    k.add(blob(1.1, 1), { at: [tx + ca * 0.9, ty + 3.2, tz + sa * 0.9], color: coral, outline: 0.04 });
  }
  // the terrace, its wall round the edge
  k.add(cyl(13.6, 13.6, 1.2, 32), { at: [0, 41.2, 0], color: band, outline: 0.05 });
  k.add(cyl(13.2, 13.2, 1.8, 32, true), { at: [0, 42.4, 0], color: wall, outline: 0.04 });
  // the keep: tiers of white, a band of pink, arched windows, the great onion dome
  const Y = 42.4;
  k.add(cyl(6.2, 6.6, 7, 24), { at: [0, Y, 0], color: wall, outline: 0.06 });
  k.add(cyl(6.7, 6.7, 0.8, 24), { at: [0, Y + 7, 0], color: band, outline: 0.04 });
  k.add(cyl(4.6, 5.0, 7, 20), { at: [0, Y + 7.8, 0], color: wall, outline: 0.06 });
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    k.add(box(1.0, 2.2, 0.3), { at: [Math.cos(a) * 6.45, Y + 2.2, Math.sin(a) * 6.45], rot: [0, -a + Math.PI / 2, 0], color: win });
    if (i % 2 === 0) k.add(box(0.8, 1.8, 0.3), { at: [Math.cos(a) * 4.85, Y + 10.5, Math.sin(a) * 4.85], rot: [0, -a + Math.PI / 2, 0], color: win });
  }
  const onion = (r, at, color) => {
    k.add(lathe([[r * 0.9, 0], [r * 1.15, r * 0.45], [r * 1.05, r * 0.95], [r * 0.6, r * 1.45], [r * 0.18, r * 1.85], [0.05, r * 2.15]], 18), { at, color, outline: 0.05 });
    k.add(cyl(0.06 * r, 0.1 * r, r * 0.7, 6), { at: [at[0], at[1] + r * 2.1, at[2]], color: gold });
    k.add(blob(0.14 * r, 0), { at: [at[0], at[1] + r * 2.85, at[2]], color: gold });
  };
  onion(4.8, [0, Y + 14.8, 0], pink);
  // the towers round it, white with sea-green and pink domes
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.26, R = 9.6, h = i % 2 ? 9 : 11.5;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    k.add(cyl(1.8, 2.0, h, 14), { at: [x, Y, z], color: wall, outline: 0.05 });
    k.add(cyl(2.15, 2.15, 0.5, 14), { at: [x, Y + h, z], color: band, outline: 0.03 });
    k.add(box(0.7, 1.5, 0.25), { at: [x * 1.11, Y + h - 3, z * 1.11], rot: [0, -a + Math.PI / 2, 0], color: win });
    onion(2.0, [x, Y + h + 0.5, z], i % 2 ? teal : pink);
  }
  // the walk between them, round the keep
  k.add(torus(9.6, 0.9, 6, 36), { at: [0, Y + 3.6, 0], rot: [Math.PI / 2, 0, 0], color: wall, outline: 0.04 });
});

reg('ryugu', (o) => {
  const root = group('ryugu');
  add(root, ryuguGeo());
  // its own bubble, round the palace on top of the coral
  const b = new THREE.Mesh(BUBBLE_GEO, bubbleMaterial());
  b.scale.setScalar(23);
  b.position.y = 52;
  b.renderOrder = 3;
  root.add(b);
  animate(root, (t) => {
    const w = 1 + Math.sin(t * 0.6) * 0.006;
    b.scale.set(23 * w, 23 / w, 23 * w);
  });
  return root;
});

// ------------------------------------------------------------ the dive point
// Where the sea goes down at the foot of the Red Line, east of Sabaody (the
// spot fishman_dive): the water darkening in a slow, wide swirl, foam drawn
// round and into it — the way down to Fish-Man Island, for a coated ship.
let swirlMat = null;
reg('downcurrent', () => {
  const root = group('downcurrent');
  root.userData.noGround = true; // (on the sea itself)
  if (!swirlMat) {
    swirlMat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.time },
      vertexShader: /* glsl */`
        varying vec2 vP;
        void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec2 vP;
        void main() {
          float r = length(vP) / 26.0;
          if (r > 1.0) discard;
          float a = atan(vP.y, vP.x);
          // (arms of foam wound in toward the middle, turning slowly)
          float arm = sin(a * 3.0 + r * 15.0 - uTime * 0.9 + sin(a * 5.0 + uTime * 0.3) * 0.4);
          float foam = smoothstep(0.78, 1.0, arm) * smoothstep(0.04, 0.3, r) * (1.0 - r);
          float dark = (1.0 - smoothstep(0.0, 0.95, r)) * 0.62;
          vec3 col = mix(vec3(0.0, 0.04, 0.09), vec3(0.86, 0.95, 1.0), foam / max(0.001, foam + dark));
          gl_FragColor = vec4(col, (dark + foam * 0.7) * (1.0 - smoothstep(0.8, 1.0, r)));
        }`,
      transparent: true, depthWrite: false,
    });
  }
  const m = new THREE.Mesh(new THREE.CircleGeometry(26, 56).rotateX(-Math.PI / 2), swirlMat);
  m.position.y = 0.14;
  m.renderOrder = 2;
  m.castShadow = false; m.receiveShadow = false;
  root.add(m);
  return root;
});

export { bubbleMaterial as bubbleMat };

// ------------------------------------------------------------ Buggy's Big Top
// The Buggy Pirates' circus in Orange Town, as in the anime: a big top in
// their red and yellow, its canvas up on a ring of striped poles (open all
// round under the eaves — you walk straight in), a scalloped valance, the
// king pole up the middle with the Buggy Pirates' flag (the skull with the
// round red nose) over it; inside, the sawdust ring and the Buggy Ball
// cannon on its platform at the back, a heap of its shot beside it.
const BIGTOP = { R: 8.6, eave: 4.3, apex: 11.6, n: 16 };
const bigtopGeo = () => model('bigtop', (k) => {
  const { R, eave, apex, n } = BIGTOP;
  const RED = '#d32f2f', YEL = '#fbc02d', WHITE = '#fafafa';
  // the canvas: a cone of alternating gores, seen from outside and from under it
  const pos = [], tri = [];
  const P = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, c = i % 2 ? RED : YEL;
    // (in two bands, the lower one a little flatter: the canvas sags between its ropes)
    const mid = [R * 0.55, eave + (apex - eave) * 0.52];
    for (const [r0, y0, r1, y1] of [[R + 0.35, eave, mid[0], mid[1]], [mid[0], mid[1], 0.3, apex]]) {
      const p00 = P(a0, r0, y0), p01 = P(a1, r0, y0), p10 = P(a0, r1, y1), p11 = P(a1, r1, y1);
      pos.push(...p00, ...p10, ...p01, ...p01, ...p10, ...p11);
      tri.push(c, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  k.add(g, { split: true, color: (p, nn, i) => tri[Math.floor(i / 3)], double: true, backShade: 0.7, outline: 0.06 });
  // the valance round the eave: a scallop under each gore, and a white band
  for (let i = 0; i < n * 2; i++) {
    const a = (i + 0.5) / (n * 2) * Math.PI * 2, w = (R + 0.35) * Math.PI * 2 / (n * 2);
    k.save(); k.translate(Math.cos(a) * (R + 0.36), eave, Math.sin(a) * (R + 0.36)); k.rotateY(-a + Math.PI / 2);
    k.add(box(w + 0.02, 0.32, 0.03), { at: [0, -0.32, 0], color: WHITE });
    k.add(new THREE.CircleGeometry(w / 2, 10, Math.PI, Math.PI), { at: [0, -0.32, 0.005], color: i % 2 ? RED : YEL, double: true, backShade: 0.85 });
    k.restore();
  }
  // the ring of poles under the eave, striped like candy, and the king pole
  for (let i = 0; i < n; i += 2) {
    const a = i / n * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
    k.add(cyl(0.13, 0.15, eave, 8), { at: [x, 0, z], color: WHITE, outline: 0.02 });
    for (let y = 0.25; y < eave - 0.2; y += 0.7) k.add(cyl(0.155, 0.155, 0.3, 8), { at: [x, y, z], color: RED });
    k.add(new THREE.SphereGeometry(0.2, 8, 6), { at: [x, eave + 0.05, z], color: YEL });
  }
  k.add(cyl(0.22, 0.28, apex + 1.4, 10), { color: '#8d6e4a', outline: 0.02 });
  k.add(new THREE.SphereGeometry(0.3, 10, 8), { at: [0, apex + 1.5, 0], color: YEL, outline: 0.015 });
  // the ring: sawdust inside a low red-and-white kerb
  k.add(cyl(5.2, 5.2, 0.03, 32), { at: [0, 0.01, 0], color: '#e6c58f' });
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    k.save(); k.translate(Math.cos(a) * 5.35, 0, Math.sin(a) * 5.35); k.rotateY(-a);
    k.add(box(0.22, 0.42, 1.42), { color: i % 2 ? RED : WHITE, outline: 0.012 });
    k.restore();
  }
  // the Buggy Ball cannon on its platform at the back (-x), muzzle to the ring
  k.add(box(3.2, 0.7, 2.6), { at: [-7.0, 0, 0], color: '#6d4c33', outline: 0.025 });
  k.add(box(1.6, 0.6, 1.4), { at: [-7.0, 0.7, 0], color: RED, outline: 0.02 });
  for (const s of [-1, 1]) k.add(torus(0.5, 0.1, 6, 14), { at: [-7.0, 1.0, s * 0.78], color: '#3e2723' });
  k.add(cyl(0.42, 0.62, 2.6, 14), { at: [-7.4, 1.5, 0], rot: [0, 0, -Math.PI / 2 + 0.18], color: '#263238', outline: 0.03 });
  k.add(torus(0.46, 0.09, 6, 16), { at: [-4.85, 1.95, 0], rot: [0, Math.PI / 2, 0], color: '#37474f' });
  for (let i = 0; i < 6; i++) k.add(new THREE.SphereGeometry(0.3, 10, 8), { at: [-6.6 + (i % 3) * 0.62, 0.7 + 0.3 + Math.floor(i / 3) * 0.5, 1.7 + (i % 2) * 0.1], color: '#1c1c1c', outline: 0.012 });
  // barrels and crates of the crew's loot round the walls
  for (const [x, z] of [[3.6, 6.8], [4.3, 6.2], [-3.2, -7.1], [6.6, -3.6]]) k.add(cyl(0.38, 0.42, 0.95, 10), { at: [x, 0, z], color: '#8d5b33', outline: 0.015 });
  for (const [x, z] of [[-2.4, 7.3], [6.9, 2.8]]) k.add(box(0.9, 0.8, 0.9), { at: [x, 0, z], color: '#a1784f', outline: 0.015 });
});

function buggyFlagMaterial() {
  let m = flagMats.get('buggy');
  if (m) return m;
  const { ctx: g, tex } = canvasTexture(256, 170);
  g.fillStyle = '#141414'; g.fillRect(0, 0, 256, 170);
  g.setTransform(110, 0, 0, 110, 128, 88); drawJollyRoger(g, { skull: 'classic', bones: 'cross' }, 1, '#141414');
  g.setTransform(1, 0, 0, 1, 0, 0);
  // (Buggy's own: the round red clown's nose)
  g.fillStyle = '#e53935'; g.beginPath(); g.arc(128, 100, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(124, 96, 3.5, 0, Math.PI * 2); g.fill();
  tex.needsUpdate = true;
  m = new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide });
  flagMats.set('buggy', m);
  return m;
}

reg('bigtop', (o, ctx) => {
  const root = group('bigtop');
  add(root, bigtopGeo());
  root.rotation.y = o.yaw || 0;
  const geo = new THREE.PlaneGeometry(2.4, 1.6, 10, 3);
  geo.translate(1.2, 0, 0);
  const flag = new THREE.Mesh(geo, buggyFlagMaterial());
  flag.castShadow = true;
  flag.position.set(0.22, BIGTOP.apex + 0.6, 0);
  root.add(flag);
  const base = geo.attributes.position.array.slice();
  animate(root, (t, env) => {
    flag.rotation.y = Math.PI - (env?.windAngle || 0) - root.rotation.y;
    const a = geo.attributes.position, amp = 0.7 + (env?.windStrength ?? 1) * 0.4;
    for (let i = 0; i < a.count; i++) {
      const x = base[i * 3];
      a.array[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * 6 + x * 2.6) * 0.12 * x / 2.4 * amp * 1.6;
      a.array[i * 3 + 1] = base[i * 3 + 1] - x * x * 0.02;
    }
    a.needsUpdate = true;
  });
  return root;
});
