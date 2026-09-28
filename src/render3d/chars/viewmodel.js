// First-person viewmodel: your own arms (and a kicking leg) in front of the
// camera, animated by the very same pose data as your body in third person
// (so every style's combos, blocks, casts and weapons read), placed in
// camera space with idle sway, walk bob and sprint pump. Swords (1–3), guns
// with a muzzle flash, staffs, axes and energy blades are held in the hands;
// Devil Fruit techniques glow in the fruit's colour; Gum-Gum punches stretch
// the arm out to the flying fist; Armament Haki turns the forearms glossy
// black. Swimming, the hands pull a breaststroke (or scull, treading water;
// or flail, for a Devil Fruit user going under). Hidden when knocked down.
//
// The model is the same CharacterModel as a world character with its body,
// head and hips hidden; it draws after the world with the depth buffer
// cleared so it never clips into walls.
import * as THREE from 'three';
import { CharacterModel } from './model.js';
import { B } from './bones.js';
import { bodyMaterial, outlineMaterial, glowMaterial, charGradient } from './mats.js';
import { Glow } from './fx.js';
import { actorPose, rigOptions, currentLook, weaponOf, stationSpot, stationReach } from './pose.js';
import { FRUITS } from '../../data/fruits.js';
import { shipDims, shipBob, pitchRise } from '../../world/hull.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// first-person strikes (see update): reach kept to x0 + xs of the rest (and never pulled in closer than
// xmin: a wind-up stays in view), hands raised c, and L more at full reach, never above top (an
// uppercut ends up in the middle of the view, not over it)
const FP = { x0: 0.2, xs: 0.2, c: 0.14, L: -0.12, xmin: 0.2, xhigh: 0.42, top: -0.16 };
const xy = (h, fb) => (!h ? fb : Array.isArray(h) ? h : [Math.cos(h.a) * h.r, Math.sin(h.a) * h.r]);
const mix2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const HIDE = [B.hips, B.chest, B.head, B.sheath, B.hilts, B.tail];
const LEGS = [B.thighR, B.shinR, B.footR, B.thighL, B.shinL, B.footL];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _one = new THREE.Vector3(1, 1, 1), _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4();

export function createViewmodel(ctx) { return new Viewmodel(ctx); }

class Viewmodel {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.name = 'viewmodel';
    this.body = new THREE.Group();      // body space → camera space
    this.root.add(this.body);
    this.model = null;
    this.key = '';
    this.lookCache = {};
    this.o = {};
    this.sway = new THREE.Vector2();
    this.lastYaw = null; this.lastPitch = null;
    this.bob = 0;
    this.glows = [];
    this.flashT = 0;
    this.lastActT = -1;
    this.cleared = -1;
    this.frame = 0;
    this.outlineMat = outlineMaterial(0.0022, 0x3a2418, { fog: false });
    this.outlineMat.transparent = true;
    this.weaponMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: charGradient(), transparent: true, fog: false });
  }

  build(p, look, wpn) {
    if (this.model) this.model.dispose();
    const m = new CharacterModel(look, wpn, { viewmodel: true, lod: -1, fog: false, outline: this.outlineMat, weaponOpts: { material: this.weaponMat, outline: this.outlineMat, noShadow: true } });
    m.mat.transparent = true;
    m.mat.fog = false;
    m.visibleParts = HIDE.map((i) => [i, false]);
    m.face.visible = false;
    if (m.bubble) m.bubble.visible = false;
    this.body.add(m.group);
    this.model = m;
    this.fixup();
  }

  /** Everything in the viewmodel draws last, over a cleared depth buffer (never clips into walls). */
  fixup() {
    const self = this;
    // (clearDepth ignores a disabled depth mask: re-enable it through three's state cache first)
    if (!this.clear) this.clear = function (renderer) { if (self.cleared !== self.frame) { self.cleared = self.frame; renderer.state.buffers.depth.setMask(true); renderer.clearDepth(); } };
    this.model.group.traverse((o) => {
      if (o.userData.vm || !(o.isMesh || o.isSprite)) return;
      o.userData.vm = true;
      o.renderOrder = Math.max(o.renderOrder, 10000);
      o.frustumCulled = false;
      o.castShadow = false;
      o.onBeforeRender = this.clear;
    });
  }

  update(p, env, ctx) {
    this.frame++;
    const look = currentLook(p, this.lookCache);
    const wpn = weaponOf(p);
    const key = `${look === p.look ? '' : JSON.stringify(look)}|${wpn ? wpn.kind + wpn.count + (wpn.gun || '') : ''}`;
    if (!this.model || key !== this.key || this.baseLook !== p.look) { this.key = key; this.baseLook = p.look; this.build(p, look, wpn); }
    const m = this.model;
    const hidden = p.state === 'knocked' || p.state === 'dead' || p.hidden;
    this.root.visible = !hidden;
    if (hidden) return;
    const { pose, P } = actorPose(p, env, look);
    const o = rigOptions(p, pose, P, this.o);
    o.wpn = wpn;
    if (pose.station && pose.station.kind === 'row' && !pose.anim) { this.rowing(p, pose.station, P, o, m, env); return; }
    o.sitK = 0; o.reachL = null;
    o.walkRel = null;
    o.lookYaw = 0;
    o.twistK = 0.8;
    const A = pose.anim;
    let PP = P;
    const dtv = Math.min(0.05, Math.max(0.001, (env.time - (this.lastT ?? env.time)) || 0.016));
    // Out of a fight the hands drop out of sight (like a lowered weapon); they come
    // up into a guard when you fight, block, dodge or draw a weapon, pump at the
    // bottom corners when you sprint, and reach out when you use something.
    const busy = !!A || pose.block !== undefined || pose.dodge !== undefined || pose.getUp !== undefined || !!pose.launch || pose.state === 'hurt';
    const wantReady = busy || pose.combat || pose.armed ? 1 : 0;
    this.ready = (this.ready ?? 0) + (wantReady - (this.ready ?? 0)) * Math.min(1, dtv * (wantReady ? 12 : 2.5));
    // (a blow starts from the guard, not from the hands down at your sides)
    if (A) this.ready = 1;
    if (p.reachT > 0) p.reachT = Math.max(0, p.reachT - dtv);
    const reach = p.reachT > 0 ? Math.sin((1 - p.reachT / 0.45) * Math.PI) : 0;
    this.pump = (this.pump ?? 0) + ((pose.sprint && !busy ? 1 : 0) - (this.pump ?? 0)) * Math.min(1, dtv * 6);
    const swimming = p.inWater && !busy;
    if (swimming) {
      // breaststroke: reach out together, sweep wide and back, tuck in under the chin
      const df = !!p.fruit && !p.gills;
      const stroking = pose.moving || !!p.intent?.mz;
      this.swimPh = (this.swimPh || 0) + dtv * (df ? 9 : stroking ? (p.gills ? 5.5 : 3.6) : 1.9);
      const ph = this.swimPh, s = Math.sin(ph);
      let hF, hB, spread;
      if (df) {
        hF = [0.16 + 0.08 * s, 0.02 + 0.1 * Math.cos(ph)];
        hB = [0.13 - 0.08 * Math.sin(ph + 1.9), 0.06 + 0.1 * Math.cos(ph + 1.9)];
        spread = 0.2 + 0.06 * Math.sin(ph * 0.7);
      } else if (stroking) {
        hF = [0.34 + 0.12 * Math.cos(ph), 0.02 - 0.05 * s]; hB = hF.slice();
        spread = 0.02 + 0.24 * Math.max(0, s);
      } else {
        hF = [0.3 + 0.04 * Math.cos(ph), 0.1 + 0.03 * s]; hB = [0.3 + 0.04 * Math.cos(ph + 0.5), 0.1 + 0.03 * Math.sin(ph + 0.5)];
        spread = 0.14 + 0.07 * s;
      }
      // fingers together for the pull, loosening on the way back (clutching at the water, sinking)
      const grip = df ? 'claw' : stroking && s < -0.2 ? 'relaxed' : 'flat';
      PP = { ...P, r: 0, hF, hB, eF: 1, eB: 1, hand: grip, handB: grip };
      o.spread = spread;
    } else if (!busy) {
      const w = pose.walk || 0, sw = pose.moving ? Math.sin(w) : 0;
      const k = this.ready, q = this.pump * (1 - k);
      // relaxed: hanging at the sides; sprinting: swinging up into the lower corners
      const relF = [0.04 + q * (0.12 - sw * 0.18), 0.42 - q * (0.08 + Math.max(0, -sw) * 0.13)];
      const relB = [0.02 + q * (0.1 + sw * 0.18), 0.42 - q * (0.08 + Math.max(0, sw) * 0.13)];
      PP = {
        ...P,
        hF: mix2(relF, xy(P.hF, [0.05, 0.4]), k), hB: mix2(relB, xy(P.hB, [-0.03, 0.4]), k),
        eF: 1, eB: 1,
        hand: k > 0.5 ? P.hand : 'relaxed', handB: k > 0.5 ? P.handB : 'relaxed',
      };
      if (k > 0.5) { PP.hF = [PP.hF[0], PP.hF[1] + 0.04 * k]; PP.hB = [PP.hB[0], PP.hB[1] + 0.04 * k]; }
      o.spread = (o.spread || 0) + 0.05 * q + 0.03 * k;
    }
    // reaching out to use something: the hand opens on the way out and takes hold coming back
    if (reach > 0) { PP = { ...PP, hF: mix2(xy(PP.hF, [0.05, 0.4]), [0.4, 0.06], reach), hand: p.reachT > 0.22 ? 'palm' : 'grab' }; }
    // attacks aim at the crosshair: an extending hand rises toward eye level
    // (the shoulders sit well below the eye) and swings in toward the centre
    if (A) {
      // Seen from your own eyes a straight punch drives INTO the view: the
      // fist ends big, just right of and below the crosshair, the forearm
      // foreshortened behind it. Full reach (as the body strikes in third
      // person) would put it the length of a pole away, a small fist at the
      // end of a long sleeve; the last of the reach is taken in.
      const T = FP;
      const fp = (h) => {
        if (!h) return h;
        const k = clamp(h[0] / 0.43, 0, 1);
        // (a hand drawn back for a swing is left where it is: it winds up out of sight)
        let x = h[0] > T.x0 ? T.x0 + (h[0] - T.x0) * T.xs : h[0] >= 0 ? Math.max(T.xmin, h[0]) : h[0];
        const y = h[1] - T.c - T.L * k;
        // (a fist going up in front of the face is kept further out, so it stays in view)
        if (y < 0 && h[0] > 0) x = Math.max(x, T.xmin + (T.xhigh - T.xmin) * clamp(-y / 0.3, 0, 1));
        return [x, Math.max(T.top, y)];
      };
      PP = { ...PP, hF: fp(PP.hF), hB: fp(PP.hB) };
    }
    // the body lean mostly stays out of first person
    o.leanAdd = -(PP.l || 0) * 0.55;
    o.lift = 0; o.roll = 0; o.squash = 1;
    // Gum-Gum: the arm stretches out to the fist in flight
    o.reachR = p.fruit === 'gomu' ? this.stretch(p, ctx) : null;
    m.pose(PP, o);
    this.fixup();
    // show the legs only while a kick is out in front
    const kick = A && (A.limb === 'fF' || A.limb === 'fB') && A.legs;
    for (const i of LEGS) m.showBone(i, !!kick);
    // ---- place in camera space: body x → -z, z → +x; eye at the origin
    const d = m.d;
    const eyeY = d.hip0 + d.chestLen + d.neck + d.hc * 0.95;
    const dt = Math.min(0.05, Math.max(0.001, (env.time - (this.lastT ?? env.time)) || 0.016));
    this.lastT = env.time;
    // sway: lag behind camera turns; bob with the walk
    const rig = this.ctx.game?.view3d?.rig;
    const yaw = rig ? rig.yaw : 0, pitch = rig ? rig.pitch : 0;
    if (this.lastYaw !== null) {
      let dy = yaw - this.lastYaw; dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      this.sway.x = clamp(this.sway.x - dy * 0.35, -0.06, 0.06);
      this.sway.y = clamp(this.sway.y + (pitch - this.lastPitch) * 0.3, -0.05, 0.05);
    }
    this.lastYaw = yaw; this.lastPitch = pitch;
    this.sway.multiplyScalar(Math.exp(-dt * 7));
    const moving = pose.moving;
    this.bob += dt * (moving ? (pose.sprint ? 13 : 9) : 1.6);
    const bobA = moving ? (pose.sprint ? 0.028 : 0.014) : 0.004;
    const bx = Math.cos(this.bob * 0.5) * bobA, by = -Math.abs(Math.sin(this.bob * 0.5)) * bobA * 1.4 + Math.sin(env.time * 1.3) * 0.003;
    this.body.rotation.set(0, Math.PI / 2, 0);
    // the shoulders ride up toward the eye when the hands are in use, and sink when they aren't
    const use = swimming ? 0.8 : Math.max(this.ready ?? 0, reach, (this.pump ?? 0) * 0.28);
    this.body.position.set(this.sway.x + bx, -0.1 + 0.26 * use - eyeY + this.sway.y + by, -0.06);
    this.body.updateMatrix();
    // ---- effects: haki, flash, fruit glow, muzzle flash
    const fx = m.fx;
    fx.uHaki.value.set(p.armament ? 1 : 0, p.armament ? 1 : 0, pose.armLegs ? 1 : 0, pose.armLegs ? 1 : 0);
    fx.uFlash.value = p.flashT > 0 ? Math.min(0.5, p.flashT / 0.12 * 0.6) : 0;
    if (pose.legFx) { fx.uLegFxCol.value.set(pose.legFx); fx.uLegFx.value.set(1, 1); } else fx.uLegFx.value.set(0, 0);
    this.effects(p, pose, A, env);
  }

  /**
   * At a rowboat's oars: your arms on the grips, pushing them out through the
   * drive and drawing them back on the recovery. The arms sit in the boat
   * (on the thwart, facing her bow), not in front of the view: look round and
   * they stay on the oars where they are; look down and you see them row.
   */
  rowing(p, st, P, o, m, env) {
    const s = st.ship, spot = stationSpot(st), row = shipDims(s.def).row;
    o.sitK = 1; o.sitY = row.seatH; o.lift = 0; o.roll = 0; o.squash = 1; o.lookYaw = 0; o.walkRel = null; o.leanAdd = 0; o.twistK = 0.8;
    const R = this._grips || (this._grips = [new THREE.Vector3(), new THREE.Vector3()]);
    stationReach(st, spot, m.d, 1, 0, P.l || 0, row.seatH + 0.07, R);
    o.reachR = R[0]; o.reachL = R[1];
    m.pose(P, o);
    this.fixup();
    for (const i of LEGS) m.showBone(i, false);
    this.lastT = env.time;
    // the body's frame in the boat (the floor under the thwart, facing the
    // bow), seen from the camera (the view's origin is the ship's middle)
    const cam = this.ctx.camera, h = s.heading, w = this.ctx.world;
    const dx = w ? w.dx(p.x, s.x) : s.x - p.x, dy = s.y - p.y;
    _v.set(dx + Math.cos(h) * spot.u, shipBob(s, env.time) + spot.floor + pitchRise(s, spot.u), dy + Math.sin(h) * spot.u);
    _q.setFromAxisAngle(_up, -h);
    _mA.compose(_v, _q, _one);
    _mB.copy(cam.matrixWorld).invert().multiply(_mA);
    _mB.decompose(this.body.position, this.body.quaternion, this.body.scale);
    this.body.updateMatrix();
    const fx = m.fx;
    fx.uHaki.value.set(p.armament ? 1 : 0, p.armament ? 1 : 0, 0, 0);
    fx.uFlash.value = p.flashT > 0 ? Math.min(0.5, p.flashT / 0.12 * 0.6) : 0;
    fx.uLegFx.value.set(0, 0);
    for (const g of this.glows) g.sprite.visible = false;
  }

  /** The Gum-Gum fist projectile in flight, in body space. */
  stretch(p, ctx) {
    const g = ctx.game;
    const pr = g && g.combat && g.combat.projectiles.find((q) => q.stretch === p && !(q.delay > 0));
    if (!pr) return null;
    const w = ctx.world;
    const dx = w ? w.dx(p.x, pr.x) : pr.x - p.x, dy = pr.y - (p.y - 0.5);
    const f = p.facing || 0;
    const fx = dx * Math.cos(f) + dy * Math.sin(f), fz = -dx * Math.sin(f) + dy * Math.cos(f);
    return (this._reach || (this._reach = new THREE.Vector3())).set(fx, 1.3, fz * 0.6 + 0.05);
  }

  effects(p, pose, A, env) {
    const m = this.model, rig = m.rig;
    let gi = 0;
    const glow = (col, size, pos) => {
      let g = this.glows[gi];
      if (!g) {
        g = this.glows[gi] = new Glow(col);
        g.sprite.renderOrder = 10001; g.core.renderOrder = 10002;
        g.sprite.material.depthTest = false;
        m.group.add(g.sprite);
      }
      if (g.sprite.parent !== m.group) m.group.add(g.sprite);
      g.sprite.visible = true;
      g.set(col, size, pos);
      gi++;
    };
    const t = env.time;
    const def = p.action && p.action.def;
    // Devil Fruit techniques: the hands glow in the fruit's colour (charge → burst → fade)
    if (def && (def.source || '').startsWith('fruit') && A) {
      const fc = (FRUITS[p.fruit] && FRUITS[p.fruit].color) || '#ffffff';
      const col = pose.fx && pose.fx.elem ? pose.fx.color || fc : fc;
      const w = A.w || 0.1;
      const k = A.t < w ? 0.35 + 0.65 * (A.t / w) : Math.max(0, 1 - (A.t - w) / 0.35);
      const both = pose.P && pose.P.hand === 'palm' && pose.P.handB === 'palm';
      const s = (0.1 + 0.16 * k) * (0.9 + 0.1 * Math.sin(t * 34));
      if (k > 0.02) {
        glow(col, s, rig.E[A.limb === 'hB' ? 1 : 0]);
        if (both) glow(col, s, rig.E[A.limb === 'hB' ? 0 : 1]);
      }
    } else if (pose.charge && pose.charge.k > 0) {
      const c = pose.charge;
      glow(c.kind === 'dark' ? '#7e57c2' : c.color || '#ffffff', 0.08 + (c.size || 0.2) * Math.min(1, c.k), rig.E[c.at === 'hB' ? 1 : 0]);
    }
    if (pose.fx && pose.fx.elem && (pose.fx.k ?? 1) > 0.05 && !(def && (def.source || '').startsWith('fruit'))) {
      const f = pose.fx;
      const pos = f.limb === 'fF' ? rig.F[0] : f.limb === 'fB' ? rig.F[1] : f.limb === 'hB' ? rig.E[1] : rig.E[0];
      glow(f.color || '#ffffff', 0.2 * (f.k ?? 1), pos);
    }
    // muzzle flash on the shot frame
    if (A && pose.armed && pose.weapon && pose.weapon.kind === 'gun' && (A.name === 'shoot' || A.name === 'aim')) {
      const w = A.w || 0.1;
      if (A.t >= w && this.lastActT < w) this.flashT = 0.08;
      this.lastActT = A.t;
    } else this.lastActT = -1;
    if (this.flashT > 0) {
      this.flashT -= 1 / 60;
      _v.copy(rig.E[0]).addScaledVector(rig.blade[0], 0.45);
      glow('#ffd54f', 0.22 + Math.random() * 0.08, _v);
      glow('#ffffff', 0.1, _v);
    }
    for (let i = gi; i < this.glows.length; i++) this.glows[i].sprite.visible = false;
  }

  dispose() {
    if (this.model) this.model.dispose();
    this.outlineMat.dispose();
    this.weaponMat.dispose();
    this.root.removeFromParent();
  }
}

export { glowMaterial, bodyMaterial, _v2 };
