// Solids: real little objects, instanced — faceted ice crystals bursting up
// out of the ground, shards and splinters tumbling through the air, chunks
// of rock heaved up round a crater, the fists of a Gatling barrage. They're
// opaque and write depth (so the ink pass outlines them like the rest of the
// world), cel-lit by the sun: ice catches a hard glint and a pale rim, rock
// two flat tones, magma glows through its cracks. They don't fade — they
// crumble away (a noise dissolve), and do the same when the camera is on
// top of them.
import * as THREE from 'three';
import { VS_COMMON, FS_COMMON, SHARED, dynAttr, upload } from './kit.js';

export const OK = { ICE: 0, ROCK: 1, SAND: 2, SKIN: 3, MAGMA: 4, PLAIN: 5, WAX: 6 };

const VS = /* glsl */`
  ${VS_COMMON}
  attribute vec4 iCol, iPrm;
  varying vec3 vN, vV, vObj;
  varying vec4 vCol, vPrm;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * wp;
    vN = normalize(mat3(viewMatrix) * mat3(instanceMatrix) * normal);
    vV = normalize(-mv.xyz);
    vObj = position;
    vCol = iCol; vPrm = iPrm;
    vfxFogNear(mv);
    gl_Position = projectionMatrix * mv;
  }
`;
const FS = /* glsl */`
  ${FS_COMMON}
  uniform vec3 uSunV, uSunCol, uAmb;
  varying vec3 vN, vV, vObj;
  varying vec4 vCol, vPrm;
  void main() {
    int kind = int(vPrm.x + 0.5);
    float n = texture2D(uNoise, vObj.xy * 0.55 + vObj.z * 0.35 + vPrm.z).r;
    // crumbling away (and stippled out right in front of the camera)
    if (n < vPrm.y || n > 0.1 + 0.9 * vNear) discard;
    vec3 N = normalize(vN);
    vec3 V = normalize(vV);
    float l = dot(N, uSunV);
    float lit = smoothstep(-0.03, 0.06, l);
    vec3 light = mix(uAmb * 0.82, uSunCol * 1.08, lit);
    vec3 base = vCol.rgb;
    vec3 c;
    if (kind == ${OK.ICE} || kind == ${OK.WAX}) {
      // ice: deep blue in shadow, pale on the sunlit facets, a cyan rim, a
      // hard white glint on the facet that catches the sun
      bool ice = kind == ${OK.ICE};
      float fr = pow(1.0 - abs(dot(N, V)), 2.0);
      vec3 h = normalize(uSunV + V);
      float spec = step(0.965, max(0.0, dot(N, h)));
      vec3 shadow = base * (ice ? vec3(0.32, 0.5, 0.78) : vec3(0.7, 0.66, 0.6));
      vec3 sunlit = base * (ice ? vec3(0.78, 0.9, 1.0) : vec3(1.0));
      c = mix(shadow * uAmb * 1.4, sunlit * uSunCol, lit);
      c += (ice ? vec3(0.12, 0.32, 0.45) : vec3(0.15)) * fr;
      c += vec3(1.2) * spec * (ice ? 1.0 : 0.6);
      // a cold light inside, toward the tip
      if (ice) c += vec3(0.05, 0.14, 0.2) * smoothstep(0.3, 1.0, vObj.y);
    } else if (kind == ${OK.MAGMA}) {
      float cell = texture2D(uNoise, vObj.xz * 0.6 + vObj.y * 0.3 + vPrm.z).a;
      float crack = 1.0 - smoothstep(0.04, 0.13, cell);
      c = base * light * 0.8;
      c = mix(c, vec3(2.6, 1.0, 0.25), crack * vPrm.w);
    } else {
      // rock, sand, skin: two flat tones, a darker rim
      float fr = 1.0 - abs(dot(N, V));
      c = base * light;
      c *= 1.0 - smoothstep(0.75, 0.95, fr) * 0.22;
      c += base * vPrm.w;
    }
    gl_FragColor = vec4(mix(c, vFogCol, vFog), 1.0);
    #include <colorspace_fragment>
  }
`;

function material() {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
    vertexShader: VS, fragmentShader: FS, fog: true,
  });
  for (const k of Object.keys(SHARED)) m.uniforms[k] = SHARED[k];
  return m;
}

/** A crystal: a hexagonal shaft with a pointed tip, from y = 0 to 1, radius 1, faceted. */
function crystalGeo() {
  const g = new THREE.CylinderGeometry(0.62, 1, 0.72, 6, 1, false);
  g.translate(0, 0.36, 0);
  const tip = new THREE.ConeGeometry(0.62, 0.28, 6, 1, true);
  tip.translate(0, 0.72 + 0.14, 0);
  return flat(merge([g, tip]));
}
/** A splinter: a long thin double point (−1..1 along y). */
function shardGeo() {
  const g = new THREE.OctahedronGeometry(1, 0);
  g.scale(0.32, 1, 0.22);
  return flat(g);
}
/** A rough chunk of rock. */
function rockGeo() {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.78 + 0.4 * Math.abs(Math.sin(x * 12.9 + y * 78.2 + z * 37.7));
    p.setXYZ(i, x * k, y * k * 0.85, z * k);
  }
  return flat(g);
}
/** A clenched fist: a rounded block, knuckles forward (+x). */
function blockGeo() {
  const g = new THREE.BoxGeometry(1, 0.86, 0.92, 3, 3, 3);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    // round the corners off (part way to a sphere)
    const s = v.clone().normalize().multiplyScalar(0.62);
    v.lerp(s, 0.45);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
/**
 * A clenched fist as a Bara Bara hand flies (the length along +y, knuckles
 * leading; +x the back of the hand): the back of it, the row of knuckles,
 * the curled fingers under them, the thumb wrapped across, and the wrist —
 * cut clean off, a flat end — trailing behind. (Its sleeve: cuffGeo.)
 */
function fistGeo() {
  const parts = [];
  const add = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); parts.push(g); };
  // the back of the hand and the palm: a rounded block
  const b = new THREE.BoxGeometry(0.62, 0.78, 0.8, 2, 2, 2);
  const p = b.attributes.position, q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { q.set(p.getX(i), p.getY(i), p.getZ(i)); q.lerp(q.clone().normalize().multiplyScalar(0.5), 0.3); p.setXYZ(i, q.x, q.y, q.z); }
  add(b, 0, 0, 0);
  // the knuckles: four, in a row across the front, the middle two proudest
  for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.17, 8, 6), 0.14, 0.4 + (i === 1 || i === 2 ? 0.03 : 0), -0.29 + i * 0.193);
  // the curled fingers under them, folded into the palm
  for (let i = 0; i < 4; i++) add(new THREE.CapsuleGeometry(0.1, 0.18, 3, 6), -0.16, 0.36, -0.29 + i * 0.193, 0, 0, Math.PI / 2);
  // the thumb, across the front of the fingers
  add(new THREE.CapsuleGeometry(0.1, 0.34, 3, 6), -0.3, 0.2, -0.1, Math.PI / 2, 0, 0.25);
  // the wrist, cut off clean
  add(new THREE.CylinderGeometry(0.27, 0.3, 0.42, 10), 0, -0.56, 0);
  return flat(merge(parts));
}
/** The sleeve's cuff round a flying hand's wrist (in the fist's frame), its end cut off too. */
function cuffGeo() {
  const g = new THREE.CylinderGeometry(0.38, 0.4, 0.34, 10);
  g.translate(0, -0.72, 0);
  const band = new THREE.TorusGeometry(0.39, 0.05, 4, 12);
  band.rotateX(Math.PI / 2); band.translate(0, -0.56, 0);
  return flat(merge([g, band]));
}
/** A thrown knife: a pointed blade along +y, its guard and grip behind it. */
function knifeGeo() {
  const sh = new THREE.Shape();
  sh.moveTo(-0.09, 0); sh.lineTo(0.09, 0); sh.lineTo(0.08, 0.6); sh.quadraticCurveTo(0.05, 0.9, 0, 1.05); sh.quadraticCurveTo(-0.02, 0.8, -0.09, 0.62); sh.closePath();
  const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 1, curveSegments: 4 });
  blade.translate(0, 0, -0.015);
  const guard = new THREE.BoxGeometry(0.34, 0.05, 0.08); guard.translate(0, -0.02, 0);
  const grip = new THREE.CylinderGeometry(0.045, 0.05, 0.4, 6); grip.translate(0, -0.25, 0);
  const pommel = new THREE.SphereGeometry(0.06, 6, 4); pommel.translate(0, -0.47, 0);
  return flat(merge([blade, guard, grip, pommel]));
}
/** A length of limb (a sleeved forearm, a trouser leg), along y from -1 to 1, cut flat at both ends. */
function limbGeo() {
  return flat(new THREE.CylinderGeometry(0.85, 1, 2, 10));
}
function merge(list) {
  let n = 0;
  for (const g of list) n += (g.index ? g.toNonIndexed() : g).attributes.position.count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (let g of list) {
    if (g.index) g = g.toNonIndexed();
    pos.set(g.attributes.position.array, o);
    o += g.attributes.position.array.length;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return m;
}
function flat(g) {
  const f = g.index ? g.toNonIndexed() : g;
  f.deleteAttribute('normal');
  f.computeVertexNormals();
  return f;
}

class SolidBatch {
  constructor(geo, max, name) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, material(), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.vfxRange = { start: 0, count: 0 };
    this.col = dynAttr(max, 4, true); this.prm = dynAttr(max, 4, true);
    geo.setAttribute('iCol', this.col); geo.setAttribute('iPrm', this.prm);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.name = name;
    this.mesh.count = 0;
    this.M = this.mesh.instanceMatrix.array; this.C = this.col.array; this.R = this.prm.array;
    this.n = 0;
  }
  begin() { this.n = 0; }
  /**
   * One object: position, a basis (its local x, y, z axes already scaled: the
   * columns of its matrix), colour, kind, dissolve (0..1), seed, glow.
   */
  put(x, y, z, ax, ay, az, bx, by, bz, cx, cy, cz, c, kind, dissolve = 0, seed = 0, glow = 0) {
    const i = this.n;
    if (i >= this.max || dissolve >= 1) return -1;
    this.n++;
    const M = this.M, o = i * 16;
    M[o] = ax; M[o + 1] = ay; M[o + 2] = az; M[o + 3] = 0;
    M[o + 4] = bx; M[o + 5] = by; M[o + 6] = bz; M[o + 7] = 0;
    M[o + 8] = cx; M[o + 9] = cy; M[o + 10] = cz; M[o + 11] = 0;
    M[o + 12] = x; M[o + 13] = y; M[o + 14] = z; M[o + 15] = 1;
    const C = this.C, R = this.R, q = i * 4;
    C[q] = c[0]; C[q + 1] = c[1]; C[q + 2] = c[2]; C[q + 3] = 1;
    R[q] = kind; R[q + 1] = dissolve; R[q + 2] = seed; R[q + 3] = glow;
    return i;
  }
  /** Crumble every object put since index `from` at least (1 − m) of the way. */
  fade(from, m) {
    const R = this.R;
    for (let i = from; i < this.n; i++) R[i * 4 + 1] = Math.max(R[i * 4 + 1], 1 - m);
  }
  end() {
    const n = this.n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    upload(this.mesh.instanceMatrix, n); upload(this.col, n); upload(this.prm, n);
  }
}

export class Solids {
  constructor() {
    this.crystals = new SolidBatch(crystalGeo(), 640, 'vfx-crystals');
    this.shards = new SolidBatch(shardGeo(), 640, 'vfx-shards');
    this.rocks = new SolidBatch(rockGeo(), 320, 'vfx-rocks');
    this.blocks = new SolidBatch(blockGeo(), 96, 'vfx-blocks');
    this.fists = new SolidBatch(fistGeo(), 48, 'vfx-fists');
    this.cuffs = new SolidBatch(cuffGeo(), 48, 'vfx-cuffs');
    this.limbs = new SolidBatch(limbGeo(), 48, 'vfx-limbs');
    this.knives = new SolidBatch(knifeGeo(), 64, 'vfx-knives');
    this.all = [this.crystals, this.shards, this.rocks, this.blocks, this.fists, this.cuffs, this.limbs, this.knives];
  }
  begin() { for (let i = 0; i < this.all.length; i++) this.all[i].begin(); }
  end() { for (let i = 0; i < this.all.length; i++) this.all[i].end(); }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
/**
 * Put an object standing along a direction: its y axis along (dx, dy, dz)
 * scaled to `len`, the other two `wid` across, turned `spin` about its axis.
 */
export function putAlong(batch, x, y, z, dx, dy, dz, len, wid, spin, c, kind, dissolve, seed, glow) {
  const l = Math.hypot(dx, dy, dz) || 1;
  _b.set(dx / l, dy / l, dz / l);
  if (Math.abs(_b.y) < 0.95) _a.set(0, 1, 0); else _a.set(1, 0, 0);
  _c.crossVectors(_a, _b).normalize();
  _a.crossVectors(_b, _c);
  const cs = Math.cos(spin), sn = Math.sin(spin);
  // rotate the cross axes about the length
  const ax = _a.x * cs + _c.x * sn, ay = _a.y * cs + _c.y * sn, az = _a.z * cs + _c.z * sn;
  const cx = _c.x * cs - _a.x * sn, cy = _c.y * cs - _a.y * sn, cz = _c.z * cs - _a.z * sn;
  return batch.put(x, y, z, ax * wid, ay * wid, az * wid, _b.x * len, _b.y * len, _b.z * len, cx * wid, cy * wid, cz * wid, c, kind, dissolve, seed, glow);
}
