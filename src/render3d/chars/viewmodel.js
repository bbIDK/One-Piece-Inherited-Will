// First-person viewmodel: your own arms (and a kicking leg) in front of the
// camera, animated by the very same pose data as your body in third person
// (so every style's combos, blocks, casts and weapons read), placed in
// camera space with idle sway, walk bob and sprint pump. Swords (1–3), guns
// with a muzzle flash, staffs, axes and energy blades are held in the hands;
// Devil Fruit techniques glow in the fruit's colour; Gum-Gum punches stretch
// the arm out to the flying fist; Armament Haki turns the forearms glossy
// black. Hidden when knocked down or swimming.
//
// The model is the same CharacterModel as a world character with its body,
// head and hips hidden; it draws after the world with the depth buffer
// cleared so it never clips into walls.
import * as THREE from 'three';
import { CharacterModel } from './model.js';
import { B } from './bones.js';
import { bodyMaterial, outlineMaterial, glowMaterial, charGradient } from './mats.js';
import { Glow } from './fx.js';
import { actorPose, rigOptions, currentLook, weaponOf } from './pose.js';
import { FRUITS } from '../../data/fruits.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const xy = (h, fb) => (!h ? fb : Array.isArray(h) ? h : [Math.cos(h.a) * h.r, Math.sin(h.a) * h.r]);
const mix2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const HIDE = [B.hips, B.chest, B.head, B.sheath, B.hilts, B.tail];
const LEGS = [B.thighR, B.shinR, B.footR, B.thighL, B.shinL, B.footL];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

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
    const hidden = p.state === 'knocked' || p.state === 'dead' || p.inWater || p.hidden;
    this.root.visible = !hidden;
    if (hidden) return;
    const { pose, P } = actorPose(p, env, look);
    const o = rigOptions(p, pose, P, this.o);
    o.wpn = wpn;
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
    if (p.reachT > 0) p.reachT = Math.max(0, p.reachT - dtv);
    const reach = p.reachT > 0 ? Math.sin((1 - p.reachT / 0.45) * Math.PI) : 0;
    this.pump = (this.pump ?? 0) + ((pose.sprint && !busy ? 1 : 0) - (this.pump ?? 0)) * Math.min(1, dtv * 6);
    if (!busy) {
      const w = pose.walk || 0, sw = pose.moving ? Math.sin(w) : 0;
      const k = this.ready, q = this.pump * (1 - k);
      // relaxed: hanging at the sides; sprinting: swinging up into the lower corners
      const relF = [0.04 + q * (0.12 - sw * 0.18), 0.42 - q * (0.08 + Math.max(0, -sw) * 0.13)];
      const relB = [0.02 + q * (0.1 + sw * 0.18), 0.42 - q * (0.08 + Math.max(0, sw) * 0.13)];
      PP = {
        ...P,
        hF: mix2(relF, xy(P.hF, [0.05, 0.4]), k), hB: mix2(relB, xy(P.hB, [-0.03, 0.4]), k),
        eF: 1, eB: 1,
        hand: k > 0.5 ? P.hand : q > 0.3 ? 'palm' : 'fist', handB: k > 0.5 ? P.handB : q > 0.3 ? 'palm' : 'fist',
      };
      if (k > 0.5) { PP.hF = [PP.hF[0], PP.hF[1] + 0.04 * k]; PP.hB = [PP.hB[0], PP.hB[1] + 0.04 * k]; }
      o.spread = (o.spread || 0) + 0.05 * q + 0.03 * k;
    }
    if (reach > 0) { PP = { ...PP, hF: mix2(xy(PP.hF, [0.05, 0.4]), [0.4, 0.06], reach), hand: 'palm' }; }
    // attacks aim at the crosshair: an extending hand rises toward eye level
    // (the shoulders sit well below the eye) and swings in toward the centre
    if (A) {
      const lift = (h) => (h ? [h[0], h[1] - 0.17 * clamp(h[0] / 0.43, 0, 1)] : h);
      PP = { ...PP, hF: lift(PP.hF), hB: lift(PP.hB) };
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
    const use = Math.max(this.ready ?? 0, reach, (this.pump ?? 0) * 0.28);
    this.body.position.set(this.sway.x + bx, -0.1 + 0.26 * use - eyeY + this.sway.y + by, -0.06);
    this.body.updateMatrix();
    // ---- effects: haki, flash, fruit glow, muzzle flash
    const fx = m.fx;
    fx.uHaki.value.set(p.armament ? 1 : 0, p.armament ? 1 : 0, pose.armLegs ? 1 : 0, pose.armLegs ? 1 : 0);
    fx.uFlash.value = p.flashT > 0 ? Math.min(0.5, p.flashT / 0.12 * 0.6) : 0;
    if (pose.legFx) { fx.uLegFxCol.value.set(pose.legFx); fx.uLegFx.value.set(1, 1); } else fx.uLegFx.value.set(0, 0);
    this.effects(p, pose, A, env);
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
