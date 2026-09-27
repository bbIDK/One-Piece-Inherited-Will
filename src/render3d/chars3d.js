// 3D anime characters (registerActorView) and the first-person arms/weapon
// viewmodel (registerViewmodel) — see registry.js.
//
// Every actor gets a cel-shaded, outlined 3D model (chars/model.js) posed
// from the same data as the 2D renderer: actor.visualPose → the sampled rig
// pose P (render/anims.js) → the 3D rig (chars/rig.js). Faces are canvas
// decals with expressions and blinks, hair and hats are 3D geometry, and
// labels, quest markers, auras, glows, ice and stars float around them.
// Sea Kings get their own serpent model.
import * as THREE from 'three';
import { registerActorView, registerViewmodel } from './registry.js';
import { Actor } from '../game/actor.js';
import { CharacterModel } from './chars/model.js';
import { expression } from './chars/face.js';
import { B } from './chars/bones.js';
import { Label, Marker, Glow, Aura, iceShell, Stars, rootRing, guardShimmer } from './chars/fx.js';
import { SeaKingView } from './chars/seaking.js';
import { SharkView } from './chars/seacreature.js';
import { Trail } from './chars/trail.js';
import { createViewmodel } from './chars/viewmodel.js';
import { currentLook, weaponOf, actorPose, rigOptions, LYING } from './chars/pose.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

// ------------------------------------------------------------------ actor view
class ActorView {
  constructor(a, ctx) {
    this.a = a;
    this.lookCache = {};
    this.look = currentLook(a, this.lookCache);
    this.baseLook = a.look;
    const bl = a.buffs.find((b) => b.look);
    this.buffLookObj = bl ? bl.look : null;
    this.wpn = weaponOf(a);
    this.wpnKey = this.wpn ? `${this.wpn.kind}${this.wpn.count}${this.wpn.gun || ''}` : '';
    this.root = new THREE.Group();
    this.yaw = new THREE.Group();
    this.root.add(this.yaw);
    this.model = new CharacterModel(this.look, this.wpn, { fingers: !!a.isPlayer });
    this.yaw.add(this.model.group);
    this.o = {};
    this.label = null; this.marker = null; this.aura = null; this.glows = []; this.ice = null; this.stars = null;
    this.rootFx = null; this.shimmer = null; this.backFlame = null; this.trail = null;
    this.lastT = -1;
    this.alpha = 1;
    this.frame = 0;
  }

  stale() {
    const a = this.a;
    const bl = a.buffs.find((b) => b.look);
    // a new look object (equipment, content scripts) or a transformation's look
    if (a.look !== this.baseLook || (bl ? bl.look : null) !== this.buffLookObj) return true;
    const w = weaponOf(a);
    const k = w ? `${w.kind}${w.count}${w.gun || ''}` : '';
    return k !== this.wpnKey;
  }

  update(a, env, ctx, { camYaw3, redraw }) {
    const m = this.model;
    // at the helm the camera rides the ship; the body isn't drawn on the water below it
    this.root.visible = !(a.isPlayer && a.mode === 'sail');
    const cam = ctx.camera;
    const dist = cam ? cam.position.distanceTo(this.root.position) : 10;
    this.frame++;
    // far characters animate at a lower rate (their position still updates every frame)
    const every = dist < 22 ? 1 : dist < 45 ? 2 : 3;
    const full = redraw !== false && (this.frame % every === 0 || this.lastT < 0);
    const scaleBuff = a.buffs.find((b) => b.mods?.scale);
    const s = (this.look.scale || 1) * (scaleBuff ? scaleBuff.mods.scale : 1);
    this.root.scale.setScalar(s);
    if (full) {
      const look = currentLook(a, this.lookCache);
      const { pose, P } = actorPose(a, env, look);
      const o = rigOptions(a, pose, P, this.o);
      o.wpn = this.wpn;
      // sit down (and get up) over a moment
      const dtv = this.lastT < 0 ? 1 : Math.min(0.2, env.time - this.lastT);
      this.sitK = (this.sitK || 0) + ((o.seatH !== null ? 1 : 0) - (this.sitK || 0)) * Math.min(1, dtv * 6);
      if (o.seatH !== null) this.sitH = o.seatH;
      o.sitK = this.sitK > 0.01 ? this.sitK : 0;
      o.sitY = (this.sitH || 0) / s;
      // rubber punch in flight: the arm stretches out to the fist
      o.reachR = null;
      if (a.fruit === 'gomu') o.reachR = this.stretchTarget(a, ctx, s);
      const knocked = pose.state === 'knocked' || pose.state === 'dead';
      let PP = P;
      if (knocked) {
        const kt = pose.knockT ?? 1;
        const fall = Math.min(1, kt / 0.28);
        PP = LYING;
        o.lying = fall * fall;
        o.bounce = kt > 0.28 && kt < 0.5 ? Math.sin((kt - 0.28) / 0.22 * Math.PI) * 0.1 : 0;
        o.spread = 0.32 * fall; o.legSpread = 0.06 * fall;
        o.lift = 0; o.armed = false;
      }
      // NPCs glance at you when you're close and they aren't busy
      o.lookYaw = this.lookAt(a, dist, pose, cam, s);
      m.pose(PP, o);
      this.yaw.rotation.y = -((a.facing || 0) + (P.sp || 0) * TAU);
      // face
      m.setExpression(expression(look, pose, P, pose.time || 0));
      this.effects(a, pose, P, o, env, ctx, camYaw3, dist, s);
      this.lastT = env.time;
    }
    this.labels(a, env, dist, s);
    // detail by distance (with a little hysteresis)
    const lod = m.lod === 0 ? (dist > 24 ? 1 : 0) : (dist < 20 ? 0 : 1);
    if (lod !== m.lod) m.setLod(lod);
    m.outline.visible = dist < 55 && this.alpha > 0.5;
  }

  /** Head yaw toward the camera for nearby idle NPCs. */
  lookAt(a, dist, pose, cam, s) {
    const want = !a.isPlayer && dist < 5 * s && !pose.anim && !pose.combat && pose.state === 'idle' && cam;
    let y = 0;
    if (want) {
      const f = a.facing || 0;
      const dx = cam.position.x - this.root.position.x, dz = cam.position.z - this.root.position.z;
      let d = Math.atan2(dz, dx) - f;
      d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
      y = clamp(-d, -1.0, 1.0);
      if (Math.abs(d) > 1.9) y = 0;
    }
    this.headYaw = (this.headYaw || 0) + (y - (this.headYaw || 0)) * 0.12;
    return this.headYaw;
  }

  /** Where a Gum-Gum fist in flight is, in this model's pose frame. */
  stretchTarget(a, ctx, s) {
    const g = ctx.game;
    const pr = g && g.combat && g.combat.projectiles.find((p) => p.stretch === a && !(p.delay > 0));
    if (!pr) return null;
    const w = ctx.world;
    const dx = w ? w.dx(a.x, pr.x) : pr.x - a.x, dy = pr.y - (a.y - 0.5);
    const f = a.facing || 0;
    const fx = dx * Math.cos(f) + dy * Math.sin(f), fz = -dx * Math.sin(f) + dy * Math.cos(f);
    _v.set(fx / s, 1.28, fz / s);
    return this._reach ? this._reach.copy(_v) : (this._reach = _v.clone());
  }

  effects(a, pose, P, o, env, ctx, camYaw3, dist, s) {
    const m = this.model, fx = m.fx, rig = m.rig;
    const t = env.time;
    // hit flash, armament, legs, freeze
    fx.uFlash.value = a.flashT > 0 ? Math.min(0.78, a.flashT / 0.12 * 0.95) : 0;
    const arm = a.armament ? 1 : 0;
    fx.uHaki.value.set(arm, arm, pose.armLegs ? 1 : 0, pose.armLegs ? 1 : 0);
    if (pose.legFx) {
      fx.uLegFxCol.value.set(pose.legFx);
      const lim = pose.fx && pose.fx.limb;
      fx.uLegFx.value.set(pose.legFxAll || lim === 'fF' ? 1 : 0, pose.legFxAll || lim === 'fB' ? 1 : 0);
    } else fx.uLegFx.value.set(0, 0);
    const frozen = !!(a.status && a.status.freeze);
    fx.uFreeze.value = frozen ? 1 : 0;
    // fading / invisible
    const alpha = pose.alpha ?? 1;
    if ((alpha < 0.99) !== (this.alpha < 0.99)) { m.mat.transparent = alpha < 0.99; m.mat.depthWrite = alpha >= 0.99; m.mat.needsUpdate = true; }
    m.mat.opacity = alpha;
    this.alpha = alpha;
    const near = dist < 45;
    // aura
    if (pose.aura && near) {
      if (!this.aura) { this.aura = new Aura(); this.root.add(this.aura.mesh); }
      this.aura.mesh.visible = true;
      this.aura.set(pose.aura, t, 2.25 * (1 + (m.d.hip0 - 0.93) * 0.5), 1.45 * m.d.Bk, camYaw3);
      this.aura.mesh.position.set(-Math.sin(camYaw3) * 0.3, -0.05 + o.lift, -Math.cos(camYaw3) * 0.3);
    } else if (this.aura) this.aura.mesh.visible = false;
    // Lunarian back flame
    if (this.look.backFlame && a.flameLit !== false && near) {
      if (!this.backFlame) { this.backFlame = new Aura(); this.yaw.add(this.backFlame.mesh); }
      this.backFlame.mesh.visible = true;
      this.backFlame.set('rgba(255,112,40,0.95)', t + 1.3, 0.62, 0.62, camYaw3 - this.yaw.rotation.y);
      this.backFlame.mesh.position.set(-0.24 * m.d.Bk, m.d.hip0 + m.d.chestLen * 0.72 + o.lift, 0);
    } else if (this.backFlame) this.backFlame.mesh.visible = false;
    // energy: charge-ups and element glows on the striking limb
    let gi = 0;
    const glow = (col, size, pos) => {
      if (!near) return;
      let g = this.glows[gi];
      if (!g) { g = this.glows[gi] = new Glow(col); m.group.add(g.sprite); }
      g.sprite.visible = true;
      g.set(col, size, pos);
      gi++;
    };
    const ch = pose.charge;
    if (ch && ch.k > 0) {
      const k = Math.min(1, ch.k);
      const hand = ch.at === 'hB' ? rig.E[1] : rig.E[0];
      if (ch.kind === 'sun') glow('#ff9100', 0.3 + k * 1.6, _v.copy(hand).add(_v2.set(0, 0.5 + k * 0.9, 0)));
      else if (ch.kind === 'dark') glow('#4a148c', 0.2 + k * 0.4, hand);
      else if (ch.kind === 'oni') glow('#b71c1c', 0.4 + k * 0.5, rig.headC);
      else glow(ch.color || '#ffffff', 0.12 + (ch.size || 0.22) * k * 1.4 * (0.9 + 0.1 * Math.sin(t * 30)), hand);
    }
    const f = pose.fx;
    if (f && f.elem && (f.k ?? 1) > 0.05) {
      const k = f.k ?? 1;
      const col = f.color || '#ffffff';
      const sz = 0.28 * k * (0.85 + 0.15 * Math.sin(t * 40));
      if (f.limb === 'hF' || f.limb === 'both') glow(col, sz, rig.E[0]);
      if (f.limb === 'hB' || f.limb === 'both') glow(col, sz, rig.E[1]);
      if (f.limb === 'fF') glow(col, sz, rig.F[0]);
      if (f.limb === 'fB') glow(col, sz, rig.F[1]);
      if (f.limb === 'head') glow(col, sz, rig.headC);
    }
    if (a.armament && pose.anim && near) glow('#7c4dff', 0.16, rig.E[pose.anim.limb === 'hB' ? 1 : 0]);
    for (let i = gi; i < this.glows.length; i++) this.glows[i].sprite.visible = false;
    // slash / strike trails
    if (pose.anim && !pose.noTrails && dist < 30) {
      if (!this.trail) { this.trail = new Trail(); m.group.add(this.trail.mesh); }
      this.trail.update(m, a, pose, P, o);
    } else if (this.trail) this.trail.hide();
    // frozen: an ice shell
    if (frozen) {
      if (!this.ice) { this.ice = iceShell(); this.yaw.add(this.ice); }
      this.ice.visible = true;
      this.ice.scale.set(m.d.Bk, (m.d.hip0 + m.d.chestLen + m.d.neck + m.d.headR * 2.2) / 1.95, m.d.Bk);
    } else if (this.ice) this.ice.visible = false;
    // rooted: vines round the feet
    if (a.status && a.status.root) {
      if (!this.rootFx) { this.rootFx = rootRing(); this.root.add(this.rootFx); }
      this.rootFx.visible = true;
      this.rootFx.position.y = 0.06;
      this.rootFx.rotation.y = t * 0.5;
    } else if (this.rootFx) this.rootFx.visible = false;
    // dazed or knocked out: stars round the head
    const knocked = pose.state === 'knocked' || pose.state === 'dead';
    if ((a.hitstun > 0.4 || (a.status && a.status.shock) || (knocked && o.lying >= 0.99)) && near) {
      if (!this.stars) { this.stars = new Stars(); this.yaw.add(this.stars.group); }
      this.stars.group.visible = true;
      m.group.updateMatrix();
      _v.copy(rig.headC).applyMatrix4(m.group.matrix);
      this.stars.group.position.set(_v.x, _v.y + m.d.headR * (knocked ? 1.5 : 1.35), _v.z);
      this.stars.update(t, 0.3);
    } else if (this.stars) this.stars.group.visible = false;
    // guard shimmer while blocking
    if (a.blocking && near) {
      if (!this.shimmer) { this.shimmer = guardShimmer(); this.yaw.add(this.shimmer); }
      const since = t - (a._blockFlash ?? -9);
      const hitK = since >= 0 && since < 0.25 ? 1 - since / 0.25 : 0;
      const fresh = Math.max(0, 1 - (a.blockTime || 0) / 0.2);
      this.shimmer.visible = true;
      this.shimmer.material.color.set(fresh > 0 ? 0xfff59d : 0x90caf9);
      this.shimmer.material.opacity = 0.16 + 0.2 * fresh + 0.5 * hitK;
      this.shimmer.position.set(0.05, m.d.hip0 * 0.62, 0);
      this.shimmer.scale.set(m.d.Bk, 1 + (m.d.hip0 - 0.93) * 0.6, m.d.Bk);
    } else if (this.shimmer) this.shimmer.visible = false;
  }

  labels(a, env, dist, s) {
    const idle = a.state === 'idle';
    const name = a.showName && idle && dist < 36 ? a.name : null;
    const bar = !a.isPlayer && (a.damageShown > 0 || a.boss) && idle && !a.hideBar && !a.boss && dist < 36 ? clamp(a.hp / a.d.maxHp, 0, 1) : null;
    const d = this.model.d;
    const top = (d.hip0 + d.chestLen + d.neck + d.hc + d.headR * Math.max(1.15, this.model.body.meta.top) + (this.model.body.hatKind ? 0.12 : 0)) * s + 0.12;
    const k = clamp(dist / 8, 0.32, 1.8) / s;
    if (name || bar !== null) {
      if (!this.label) { this.label = new Label(); this.root.add(this.label.sprite); }
      this.label.sprite.visible = true;
      this.label.set(name, a.nameColor || '#ffffff', bar, a.faction === 'player' ? '#66bb6a' : '#ef5350');
      this.label.sprite.position.set(0, top / s, 0);
      this.label.sprite.scale.set(2.2 * k, 0.62 * k, 1);
    } else if (this.label) this.label.sprite.visible = false;
    if (a.questMarker && dist < 60) {
      if (!this.marker) { this.marker = new Marker(); this.root.add(this.marker.sprite); }
      this.marker.set(a.questMarker);
      this.marker.sprite.visible = true;
      const bob = Math.sin(env.time * 4) * 0.08;
      this.marker.sprite.position.set(0, (top + (name ? 0.62 * k * s : 0) + 0.3 * k * s + bob) / s, 0);
      this.marker.sprite.scale.set(0.42 * k * 1.2, 0.63 * k * 1.2, 1);
    } else if (this.marker) this.marker.sprite.visible = false;
  }

  dispose() {
    this.model.dispose();
    this.label?.dispose();
    this.aura?.dispose();
    this.backFlame?.dispose();
    this.trail?.dispose();
    this.shimmer?.material.dispose();
    this.root.removeFromParent();
  }
}

// ------------------------------------------------------------------ registration
const baseDraw = Actor.prototype.draw;
registerActorView((a, ctx) => {
  try {
    if (a.look && a.look.race === 'seaking') return new SeaKingView(a);
    if (a.look && a.look.race === 'beast_shark') return new SharkView(a);
    if (a.draw !== baseDraw) return null; // custom-drawn creatures keep their sprite
    return new ActorView(a, ctx);
  } catch (e) {
    console.warn('3D character failed', e);
    return null;
  }
});
registerViewmodel((ctx) => createViewmodel(ctx));

export { ActorView };
