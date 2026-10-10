// The Gum-Gum Gears, a Shadow-fruit's living shadow and Future Sight on a 3D
// body, the way the anime draws each (the moves' own effects are
// combatfx.js's, and so are the steam and the wisps coming off a body:
// bodyFx there puffs them out):
//
//  * Gear Second: the skin flushed pink and shining (the buff's look) and
//    steam pouring off it — no glow round it.
//  * Gear Third: every punch thrown on a fist blown up like a balloon (the
//    bone balloon), swelling as it goes, huge as it lands, down again as it
//    comes home; once you have Armament, coated black with it.
//  * Gear Fourth, Boundman: the arms, the legs and the shoulders coated black
//    in Armament that licks out over the skin in tongues of flame; a collar of
//    steam over the shoulders, pouring back off them like a scarf; bouncing on
//    the spot like a ball (render/anims.js gear4Bounce).
//  * Gear Fifth: white hair like a flame, white clothes, a purple sash, red
//    eyes (the buff's look), and a fat ring of cartoon cloud round the neck.
//  * Doppelman (Kage Kage): your own shadow stood up off the ground as a body
//    of its own — flat black, a dim violet edge, no face — rising up out of
//    the ground, sinking back into it; and whoever it belongs to casts no
//    shadow while it's out.
//  * Future Sight: a red outline round the figure that sees the future,
//    flaring with each vision and pulsing while the technique is on.
import * as THREE from 'three';
import { B } from './bones.js';

/** Which Gear a Gum-Gum user is in (2 to 5), or 0. */
export function gearOf(a) {
  const bs = a && a.buffs;
  if (!bs || !bs.length) return 0;
  for (const b of bs) {
    if (b.id === 'gear2') return 2;
    if (b.id === 'gear3') return 3;
    if (b.id === 'gear4') return 4;
    if (b.id === 'gear5') return 5;
  }
  return 0;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Before the body is posed (rig options `o`): Gear Third's fist blowing up
 * through a punch — up as the blow goes out, huge as it lands, down again as
 * the arm comes home (o.infR / o.infL: model.js).
 */
export function formRig(a, pose, o, gear) {
  if (gear !== 3) return;
  const act = a.action, an = pose.anim;
  if (!act || !an || act.def?.weapon) return;
  const limb = an.limb || 'hF';
  if (limb !== 'hF' && limb !== 'hB' && limb !== 'both') return;
  const w = act.def.windup ?? 0.15, r = act.def.recover ?? 0.25, t = act.t || 0;
  const k = smooth(0, Math.max(0.05, w), t) * (1 - smooth(w + 0.06, w + Math.max(0.15, r), t)) * 0.72;
  if (limb === 'hF' || limb === 'both') o.infR = Math.max(o.infR || 0, k);
  if (limb === 'hB' || limb === 'both') o.infL = Math.max(o.infL || 0, k);
}

const FUTURE_RED = new THREE.Color('#ff2b3d');

/** How far a living shadow has risen up out of the ground (0..1): up as it's called, down again as its time runs out. */
export function shadowRise(a, t) {
  const born = a.bornT ?? t - 9, left = a.summonT ?? 9;
  return Math.max(0.02, Math.min(smooth(0, 0.55, t - born), smooth(0, 0.45, left)));
}

/**
 * After the coat's been worked out (haki.js coatBody): the forms' and the
 * shadow's own looks on the body (the material's uniforms `u`: mats.js), the
 * collars round the neck, a shadow's rise out of the ground. `view`: the
 * actor's view (its memory), `m` its model, `o` the rig options it was posed
 * with, `t` the time, `fp` your own body seen from your eyes.
 */
const STEEL = 0x8f9ba3;

export function formBody(view, a, m, o, t, gear, fp) {
  const u = m.fx, d = m.d;
  // Gear Third: the swollen fist black with Armament (once you have it)
  if (gear === 3 && (a.hakiLevel?.('armament') || 0) > 0) {
    const h = u.uHaki.value;
    if ((o.infR || 0) > 0.06) h.x = Math.max(h.x, 0.62);
    if ((o.infL || 0) > 0.06) h.y = Math.max(h.y, 0.62);
  }
  // Gear Fourth: arms, legs and shoulders coated, the edge in flames
  if (gear === 4) {
    u.uHaki.value.set(1, 1, 0.84, 0.84);
    u.uHakiRip.value.set(0, 0, 0, 0);
    u.uFlame.value = 1;
    u.uTorso.value.set(d.hip0 + d.chestLen * 0.45, d.hip0 + d.chestLen, d.shW + 0.06, 1);
  } else if (u.uFlame.value || u.uTorso.value.w) { u.uFlame.value = 0; u.uTorso.value.w = 0; }
  // Spider (Supa Supa): the whole body turned to steel — the coat's shading
  // over every limb and the torso, in steel grey with a hard white sheen
  if (a.hasBuff?.('steel')) {
    u.uHaki.value.set(1, 1, 1, 1);
    u.uHakiRip.value.set(0, 0, 0, 0);
    u.uTorso.value.set(0, 0.01, 1, 1);
    u.uHakiCol.value.set(STEEL); u.uHakiSheen.value.set(0xffffff);
    view._steel = true;
  } else if (view._steel) {
    view._steel = false;
    u.uHakiCol.value.set(0x0b0a10); u.uTorso.value.w = 0;
    if (view.coat) view.coat.sheen = null;
  }
  // Future Sight: the red outline — pulsing while the technique's on, flaring with a vision
  const fs = a.hasBuff?.('future_sight') ? 0.42 + 0.18 * Math.sin(t * 7) : 0;
  const vis = a._visionT !== undefined && t - a._visionT >= 0 && t - a._visionT < 0.45 ? 1 - (t - a._visionT) / 0.45 : 0;
  const rk = Math.max(fs, vis * 1.1);
  u.uRimFx.value.set(FUTURE_RED.r, FUTURE_RED.g, FUTURE_RED.b, rk);
  // a living shadow: flat black, no face (its rise out of the ground: shadowRise)
  const shadow = !!(a.look && a.look.shadow);
  u.uShadow.value = shadow ? 1 : 0;
  if (shadow) m.face.visible = false;
  // (whoever's shadow is out there fighting casts none)
  const shadowless = !!a.buffs?.some((b) => b.id === 'doppel');
  if (m.mesh.castShadow === shadowless) m.mesh.castShadow = !shadowless;
  // the collars: Boundman's steam, Nika's cloud (not round your own eyes in first person)
  const kind = fp ? null : gear === 4 ? 'steam' : gear === 5 ? 'cloud' : null;
  if (kind || view.collar) {
    if (!view.collar) view.collar = new Collar();
    const c = view.collar, chest = m.bones[B.chest];
    if (c.group.parent !== chest) chest.add(c.group);
    c.update(kind, t, d);
  }
}

// ------------------------------------------------------------------ collars
// Gear Fourth's steam and Gear Fifth's cloud round the neck and over the
// shoulders: puffs riding the chest, each swelling and shrinking on its own
// beat as the ring slowly turns. Nika's is a fat ring of cartoon cloud —
// white, a lilac shade underneath, inked round the edge; Boundman's is steam,
// soft-edged and thinning, pouring back off the shoulders like a scarf.
const PUFF_VERT = /* glsl */`
  attribute float aAlpha;
  varying vec3 vN, vV;
  varying float vA, vUp;
  void main() {
    vec4 ip = instanceMatrix * vec4(position, 1.0);
    vec4 mv = modelViewMatrix * ip;
    vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vV = normalize(-mv.xyz);
    vUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal).y;
    vA = aAlpha;
    gl_Position = projectionMatrix * mv;
  }
`;
const PUFF_FRAG = /* glsl */`
  uniform vec3 uLit, uShade, uInk;
  uniform float uSoft;
  varying vec3 vN, vV;
  varying float vA, vUp;
  void main() {
    float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    // two tones: lit from above, the shade beneath
    vec3 c = mix(uShade, uLit, smoothstep(-0.25, 0.05, vUp));
    // (a cloud's inked edge; steam has none — it thins out to nothing instead)
    c = mix(c, uInk, smoothstep(0.84, 0.92, rim) * 0.75 * (1.0 - uSoft));
    float a = vA * mix(1.0, (1.0 - smoothstep(0.3, 0.92, rim)) * 0.85, uSoft);
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, a);
    #include <colorspace_fragment>
  }
`;
const RING = 12, TAIL = 12, N = RING + TAIL;
let PUFF_GEO = null;
const _m4 = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Collar {
  constructor() {
    if (!PUFF_GEO) PUFF_GEO = new THREE.IcosahedronGeometry(1, 2);
    const geo = PUFF_GEO.clone();
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    geo.setAttribute('aAlpha', this.alpha);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uLit: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color('#c9c3e3') }, uInk: { value: new THREE.Color('#5a4a66') }, uSoft: { value: 0 } },
      vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, transparent: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.kind = null;
  }

  /** Lay the puffs out for `kind` ('cloud', 'steam' or null: gone) at time `t`, round a body of dimensions `d`. */
  update(kind, t, d) {
    this.group.visible = !!kind;
    if (!kind) return;
    if (kind !== this.kind) {
      this.kind = kind;
      const steam = kind === 'steam';
      this.mat.uniforms.uSoft.value = steam ? 1 : 0;
      this.mat.uniforms.uShade.value.set(steam ? '#e2e6ec' : '#cdc4e8');
      this.mat.depthWrite = !steam;
      this.mat.needsUpdate = true;
    }
    const Bk = d.Bk, top = d.chestLen, steam = kind === 'steam';
    const al = this.alpha.array;
    let n = 0;
    const put = (x, y, z, r, a) => {
      _p.set(x, y, z); _s.setScalar(Math.max(0.001, r));
      this.mesh.setMatrixAt(n, _m4.compose(_p, _q, _s));
      al[n++] = a;
    };
    // the ring round the neck and over the shoulders, slowly turning
    const rx = (steam ? 0.19 : 0.15) * Bk, rz = (steam ? 0.25 : 0.2) * Bk;
    for (let i = 0; i < RING; i++) {
      const th = (i / RING) * Math.PI * 2 + t * (steam ? 0.6 : 0.32);
      const beat = Math.sin(t * (steam ? 3.1 : 2.2) + i * 1.7);
      const r = (steam ? 0.06 : 0.078) * Bk * (1 + 0.18 * beat);
      put(Math.cos(th) * rx - 0.015, top - 0.01 + 0.025 * Math.sin(th * 2 + t), Math.sin(th) * rz, r, steam ? 0.42 : 1);
    }
    if (steam) {
      // pouring back off the shoulders like a scarf, thinning as it goes
      for (let j = 0; j < TAIL; j++) {
        const u = (t * 0.75 + j / TAIL) % 1, side = j % 2 ? 1 : -1;
        const a = 0.42 * (1 - u) * smooth(0, 0.12, u);
        put((-0.12 - 0.62 * u) * Bk, top + 0.04 + 0.36 * u + 0.04 * Math.sin(t * 3 + j), side * (0.17 - 0.07 * u + 0.03 * Math.sin(t * 2 + j * 2)) * Bk, (0.045 + 0.09 * u) * Bk, a);
      }
    } else {
      // (Nika's: two fat puffs on the shoulders, more draped down the back, swelling and settling)
      for (let j = 0; j < TAIL; j++) {
        const beat = Math.sin(t * 1.9 + j * 2.3);
        if (j < 2) put(-0.01, top - 0.03, (j ? 1 : -1) * 0.24 * Bk, 0.095 * Bk * (1 + 0.12 * beat), 1);
        else if (j < 7) { const k = j - 2; put(-0.17 * Bk, top - 0.07 - k * 0.075, (k % 2 ? 0.07 : -0.06) * Bk, (0.08 - k * 0.008) * Bk * (1 + 0.1 * beat), 1); }
        else put(0, 0, 0, 0.0001, 0);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.group.removeFromParent(); }
}
