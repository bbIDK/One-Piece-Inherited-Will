// 3D anime characters (registerActorView) and the first-person arms/weapon
// viewmodel (registerViewmodel) — see registry.js.
//
// Every actor gets a cel-shaded, outlined 3D model (chars/model.js) posed
// from the same data as the 2D renderer: actor.visualPose → the sampled rig
// pose P (render/anims.js) → the 3D rig (chars/rig.js). Faces are canvas
// decals with expressions and blinks, hair and hats are 3D geometry, and
// labels, quest markers, auras, glows, ice and stars float around them.
// Sea Kings get their own serpent model.
import { FlameAura } from './chars/flameaura.js';
import * as THREE from 'three';
import { angleDiff } from '../core/math.js';
import { registerActorView, registerViewmodel, registerFrameHook } from './registry.js';
import { Actor } from '../game/actor.js';
import { CharacterModel } from './chars/model.js';
import { expression } from './chars/face.js';
import { B } from './chars/bones.js';
import { Label, Marker, Glow, Aura, iceShell, Stars, rootRing, guardShimmer } from './chars/fx.js';
import { SeaKingView } from './chars/seaking.js';
import { SeaCowView, FightingFishView } from './chars/seacreature.js';
import { Trail } from './chars/trail.js';
import { BackFlame, PhoenixWings, driftInto } from './chars/flame.js';
import { createViewmodel } from './chars/viewmodel.js';
import { holdItem, heldSize } from './chars/helditem.js';
import { rubberFist, fistState } from './chars/rubber.js';
import { currentLook, weaponOf, weaponKey, actorPose, rigOptions, LYING, stationSpot, stationReach, HelmHands } from './chars/pose.js';
import { BOAT_FEEL } from '../game/boatFeel.js';
import { blendPose } from '../render/anims.js';
import { shipBob, shipPoint, shipRock } from '../world/hull.js';
import { WakeTrail } from './wake3d.js';
import { deckBalance, balanceState, clearBalance } from './chars/balance.js';
import { coatBody, senseOf } from './chars/haki.js';
import { gearOf, formRig, formBody, shadowRise } from './chars/forms.js';
import { sigOf } from '../game/haki.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _eyeP = new THREE.Vector3(), _eyeQ = new THREE.Quaternion();
const _sp3 = [0, 0, 0], _eu = new THREE.Euler(), _qh = new THREE.Quaternion(), _up3 = new THREE.Vector3(0, 1, 0);
const _fq = new THREE.Quaternion(), _fq2 = new THREE.Quaternion();
const _fs1 = new THREE.Vector3(), _fs2 = new THREE.Vector3();
// knocked off your feet, on the way down (see ActorView.update): arched back
// with the arms thrown up over the head, the legs going out from under you
const FALLING = { ...LYING, l: -0.32, ht: -0.4, hF: [0.0, -0.33], hB: [-0.08, -0.29], eF: 0.5, eB: 0.5, fF: [0.17, -0.07], fB: [0.03, -0.02], face: 'hurt' };

// ------------------------------------------------------------------ actor view
/**
 * Detail level at a distance (m): 0 (full) up close, 2 (mid) across the
 * street, 1 (far) beyond; with a metre and a half of hysteresis either way
 * from the current level, so nobody flickers between two.
 */
function lodFor(dist, cur) {
  const near = cur === 0 ? 10.5 : 7.5, mid = cur === 1 ? 22 : 25.5;
  return dist < near ? 0 : dist < mid ? 2 : 1;
}

/** Standing still with nothing to do (no clip, fight, errand, seat, weapon or food in hand). */
function idleStill(a, pose, P, o) {
  return pose.state === 'idle' && !pose.anim && !pose.moving && !pose.combat && !pose.activity && !pose.station && pose.block === undefined
    && !pose.swimming && !pose.air && !pose.charge && !pose.crouch && !pose.launch && !pose.getUp && P.wF == null && P.wB == null
    && !a.held && !a.eating && o.seatH === null;
}
/**
 * How someone stands about: arms folded ('cross'), hands on the hips
 * ('hips') or just at rest (null) — `look.idle`, or by the look's seed.
 */
export function attitudeOf(look) {
  if (look.idle !== undefined) return look.idle === 'rest' ? null : look.idle;
  if ((look.arms || 1) > 1.3 || look.race === 'mink' && look.muzzle) return null;
  const i = (Math.imul((look.seed || 0) + 17, 2654435761) >>> 0) % 100;
  const [c, h] = look.fem ? [22, 52] : [34, 54];
  return i < c ? 'cross' : i < h ? 'hips' : null;
}



class ActorView {
  constructor(a, ctx, opts = {}) {
    this.a = a;
    this.lookCache = {};
    this.look = currentLook(a, this.lookCache);
    this.baseLook = a.look;
    const bl = a.buffs.find((b) => b.look);
    this.buffLookObj = bl ? bl.look : null;
    this.wpn = weaponOf(a);
    this.wpnKey = weaponKey(this.wpn);
    this.root = new THREE.Group();
    this.yaw = new THREE.Group();
    this.root.add(this.yaw);
    // (start at the detail its distance calls for: no near model built just to swap it out)
    this.model = new CharacterModel(this.look, this.wpn, { fingers: !!a.isPlayer, lod: a.isPlayer ? 0 : lodFor(opts.dist ?? 0, -1) });
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
    return weaponKey(weaponOf(a)) !== this.wpnKey;
  }

  update(a, env, ctx, { camYaw3, redraw }) {
    const m = this.model;
    // at the helm (or the oars) you're drawn where the work is — standing to
    // the wheel, or rowing — riding with your ship
    const helm = a.isPlayer && a.mode === 'sail' && a.ship && !a.ship.sunk ? a.station() : null;
    this.root.visible = !(a.isPlayer && a.mode === 'sail' && !helm);
    if (helm) this.placeAtStation(a, helm, env, ctx);
    else if (this.tilted) { this.root.quaternion.identity(); this.tilted = false; }
    // in the water the body settles to a new height over a moment — treading
    // water or swimming along, afloat or wading on the bottom — not in a jump
    const wet = !helm && (a.inWater || a.wading > 0);
    const dty = Math.min(0.1, Math.max(0, env.time - (this.yT ?? env.time)));
    this.yT = env.time;
    if (wet) {
      const y = this.root.position.y;
      if (!this.wetY || Math.abs(y - this.smY) > 1.2) this.smY = y;
      else this.smY += (y - this.smY) * Math.min(1, dty * 9);
      this.root.position.y = this.smY;
    }
    this.wetY = wet;
    // swimming along the surface: a faint V of foam spreading back from the
    // shoulders (as a swimmer leaves one — not a string of rings)
    const swimming = !helm && a.inWater && !a.under && a.moving && !(a.fruit && !a.gills);
    if (swimming || this.wake) {
      const v3 = ctx.game?.view3d, sc = a.look?.scale || 1;
      if (!this.wake) this.wake = new WakeTrail({ n: 26, life: 2.4, every: 0.09, y: 0.035, grain: 0.9, drift: 0.5 });
      if (this.root.parent && this.wake.mesh.parent !== this.root.parent) this.root.parent.add(this.wake.mesh);
      const sp = Math.hypot(a.vx || 0, a.vy || 0);
      const src = swimming && sp > 0.4 ? { x: a.x + Math.cos(a.facing) * 0.3 * sc, y: a.y + Math.sin(a.facing) * 0.3 * sc, h: Math.atan2(a.vy, a.vx), sp } : null;
      if (v3 && ctx.world) this.wake.update(src, env.time, v3.ox, v3.oy, ctx.world, (q, age) => [(0.2 + age * 1.15) * sc, Math.pow(1 - age, 1.8) * 0.45 * Math.min(1, q.sp / 2)]);
    }
    const cam = ctx.camera;
    const dist = cam ? cam.position.distanceTo(this.root.position) : 10;
    // (the third-person camera pressed right up behind your head — your back
    // to a cabin wall on deck, say: you're not drawn over the view)
    if (a.isPlayer && !helm && cam && ctx.mode === 'third' && dist < 3) {
      const r = this.root.position;
      if (cam.position.distanceTo(_v.set(r.x, r.y + 1.55 * (this.look.scale || 1), r.z)) < 0.45) this.root.visible = false;
    }
    this.frame++;
    // far characters animate at a lower rate (their position still updates every frame) —
    // never you, though: at the helm the camera stands well off, and your hands
    // keep to the spokes of a turning wheel only if they move with it every frame
    const every = a.isPlayer || dist < 22 ? 1 : dist < 45 ? 2 : 3;
    const full = redraw !== false && (this.frame % every === 0 || this.lastT < 0);
    const scaleBuff = a.buffs.find((b) => b.mods?.scale);
    const s = (this.look.scale || 1) * (scaleBuff ? scaleBuff.mods.scale : 1);
    this.root.scale.setScalar(s);
    // (a living shadow rises up out of the ground, and sinks back into it)
    if (a.look?.shadow) this.root.scale.y *= shadowRise(a, env.time);
    if (full) {
      const look = currentLook(a, this.lookCache);
      const { pose, P } = actorPose(a, env, look);
      const o = rigOptions(a, pose, P, this.o);
      // (a sword goes black once the coat has spread down the arm into it: past the wrist)
      if (o.armament && (this.coat?.arm ?? 1) < 0.17) o.armament = false;
      this.easeWalk(a, pose, o, this.lastT < 0 ? 1 : Math.min(0.2, env.time - this.lastT));
      o.wpn = this.wpn;
      // in first person, looking down you bow your head (and looking up, tip
      // it back), as anyone does: the eyes the view rides go with it, out over
      // your chest (see eyeOffset) — and your shadow nods too
      if (a.isPlayer && ctx.mode === 'first') {
        const pt = ctx.pitch || 0;
        o.tiltAdd += pt < 0 ? -pt * 0.55 : -pt * 0.3;
        // (and a blow's own lean back, its step back and its hop barely move
        // it: the view rides your head a beat behind, and a kick thrown
        // leaning back left it out in front of your neck, looking down your
        // own collar)
        if ((P.l || 0) < 0 && pose.state !== 'knocked') o.leanAdd = (o.leanAdd || 0) - P.l;
        o.lift *= 0.3;
      }
      this.drawing(pose, o, this.lastT < 0 ? 1 : Math.min(0.2, env.time - this.lastT));
      // sit down (and get up) over a moment
      const dtv = this.lastT < 0 ? 1 : Math.min(0.2, env.time - this.lastT);
      this.sitK = (this.sitK || 0) + ((o.seatH !== null ? 1 : 0) - (this.sitK || 0)) * Math.min(1, dtv * 6);
      if (o.seatH !== null) this.sitH = o.seatH;
      o.sitK = this.sitK > 0.01 ? this.sitK : 0;
      o.dt = dtv; // (a skirt's panels settle back at their own pace, however often this one is drawn)
      o.sitY = (this.sitH || 0) / s;
      // standing on a ship's deck as she moves: the knees and hips ride her (balance.js)
      const dk = a.deck, sh = dk && !dk.plank ? dk.ship : null;
      if (sh && !helm && !sh.sunk && o.sitK < 0.3 && !a.inWater && !a.climb && !(a.z > 0.15) && pose.state !== 'knocked' && dist < 40) {
        const w = ctx.world, bal = this.bal || (this.bal = balanceState());
        deckBalance(bal, sh, env.time, dtv, this.visF ?? a.facing, w ? w.dx(sh.x, a.x) : a.x - sh.x, a.y - sh.y, this.root.position.y - shipBob(sh, env.time), s, o, a.isPlayer && ctx.mode === 'first' ? 0.3 : 1);
        if (!pose.combat && !o.armed && !pose.anim && !pose.station) o.spread = (o.spread || 0) + (o.balArms || 0);
      } else { if (this.bal) this.bal = null; clearBalance(o); }
      // the hands on the oar grips (or the wheel's rim) — or a rubber punch in
      // flight: the arm stretches out to the fist, and snaps back after it
      o.reachR = null; o.reachL = null; o.reachRK = 1; o.reachLK = 1; o.infR = 0;
      if (pose.station) {
        const st = pose.station, R = this._grips || (this._grips = [new THREE.Vector3(), new THREE.Vector3()]);
        const hipY = m.d.hip0 + ((o.sitY ?? m.d.hA) + 0.07 - m.d.hip0) * o.sitK;
        // (at the helm you face square to her wheel, turning exactly as she turns)
        if (helm) this.visF = st.ship.heading;
        if (st.kind === 'row' || !st.ship.def || st.ship.def.oarsOnly) stationReach(st, stationSpot(st), m.d, s, (this.visF ?? a.facing) - st.ship.heading, P.l || 0, hipY, R);
        else {
          // on the wheel's spokes as it turns, hand over hand (pose.js HelmHands)
          const w = ctx.world, sh = st.ship;
          (this.helmHands || (this.helmHands = new HelmHands())).update(st, env.time, dtv, this.root.position, w ? w.dx(a.x, sh.x) : sh.x - a.x, sh.y - a.y, this.visF ?? a.facing, helm ? this.root.quaternion : null, s, m.d, hipY, P.l || 0, R);
        }
        o.reachR = R[0]; o.reachL = R[1];
        o.rubber = false; // (hands that hold on: never a rubber arm reaching after them)
      } else if (a.fruit === 'gomu') this.stretchTarget(a, ctx, s, o, dtv);
      const knocked = pose.state === 'knocked' || pose.state === 'dead';
      let PP = P;
      if (a.isPlayer && ctx.mode === 'first' && P.b && P.b[0] < 0) PP = { ...P, b: [P.b[0] * 0.3, P.b[1]] };
      if (knocked) {
        const kt = pose.knockT ?? 1;
        const fall = Math.min(1, kt / 0.28);
        const bounce = kt > 0.28 && kt < 0.5 ? Math.sin((kt - 0.28) / 0.22 * Math.PI) : 0;
        // (going over: thrown back with the arms flung up and the knees giving,
        // flat out by the time it hits the ground, the limbs flopping up off
        // it with the bounce)
        if (pose.state === 'knocked') PP = fall < 1 ? blendPose(FALLING, LYING, fall * fall) : bounce > 0 ? blendPose(LYING, FALLING, bounce * 0.3) : LYING;
        else PP = LYING;
        o.lying = fall * fall;
        o.bounce = bounce * 0.1;
        o.spread = 0.32 * fall; o.legSpread = 0.06 * fall;
        o.lift = 0; o.armed = false;
      }
      // standing about, folk fold their arms or put their hands on their hips
      // (each their own way; eased in, and dropped the moment they move)
      const att = !a.isPlayer && !knocked && idleStill(a, pose, P, o) ? attitudeOf(look) : null;
      if (att) this.att = att;
      this.attK = (this.attK || 0) + ((att ? 1 : 0) - (this.attK || 0)) * Math.min(1, dtv * (att ? 4 : 9));
      o.att = this.attK > 0.01 ? this.att : null; o.attK = this.attK;
      // NPCs glance at you when you're close and they aren't busy
      o.lookYaw = this.lookAt(a, dist, pose, cam, s);
      // (in first person your head turns to where you look — at the helm or
      // the oars, say, your body square to the ship: as far as a neck turns;
      // look further round than that and you'd have turned: see ownBody)
      this.lookPast = 0;
      if (a.isPlayer && ctx.mode === 'first') {
        const want = -angleDiff(this.visF ?? a.facing ?? 0, ctx.yaw ?? 0);
        o.lookYaw = clamp(want, -1.45, 1.45);
        this.lookPast = Math.abs(want - o.lookYaw);
      }
      // (Gear Third's fist blowing up through a punch: chars/forms.js)
      const gear = a.fruit === 'gomu' ? gearOf(a) : 0;
      formRig(a, pose, o, gear);
      this.gear = gear;
      m.pose(PP, o);
      // turning: eased, so people swing round rather than snap (quickly for
      // you and anyone mid-technique, more gently for folk walking about)
      const want = helm ? helm.ship.heading : a.facing || 0;
      if (this.visF === undefined || dtv >= 1 || knocked || helm) this.visF = want;
      else this.visF += angleDiff(this.visF, want) * (1 - Math.exp(-dtv * (a.isPlayer ? 24 : a.action ? 20 : 10)));
      this.yaw.rotation.y = -(this.visF + (P.sp || 0) * TAU);
      // long hair and coat tails swing (close enough to see)
      if (dist < 32) m.swing(this.lastT < 0 ? 1 : dtv, this.root);
      // face
      m.setExpression(expression(look, pose, P, pose.time || 0));
      this.effects(a, pose, P, o, env, ctx, camYaw3, dist, s);
      this.lastT = env.time;
    }
    // your food in your hand (going down as you eat it; in first person, the view's own hand has it)
    const fp = a.isPlayer && ctx.mode === 'first';
    if (a.isPlayer) {
      const held = holdItem(m, a.held && !a.inWater && !helm && !a.action && !fp ? a.held : null);
      if (held) { const e = a.eating && a.eating.id === a.held ? a.eating : null; heldSize(m, e ? 1 - 0.55 * Math.min(1, e.t / e.dur) : 1); }
    }
    this.labels(a, env, dist, s);
    // detail by distance
    const lod = a.isPlayer ? 0 : lodFor(dist, m.lod);
    if (lod !== m.lod) m.setLod(lod);
    // (far off, the ink pass's outlines are enough, when it's on)
    m.outline.visible = dist < (ctx.game?.view3d?.post ? 34 : 55) && this.alpha > 0.5;
    m.setShaded(!ctx.world?.roomOf?.(a));
    this.bodyParts(a);
    if (a.isPlayer) this.ownBody(fp, a, ctx, env);
  }

  /**
   * Bara Bara: a hand that's flying off at someone isn't on the end of its
   * arm (render3d/vfx/projectiles.js); in the Festival the arms and legs are
   * off whirling round (vfx/shapes.js pieces) — the head and the body float
   * on where they were.
   */
  bodyParts(a) {
    const now = performance.now() / 1000;
    const hand = !!a._baraHand && now - a._baraHand < 0.15;
    const limbs = !!a._baraLimbs && now < a._baraLimbs;
    if (!hand && !limbs && !this._partsOff) return;
    const bones = this.model.bones;
    const set = (i, off) => bones[i].scale.setScalar(off ? 0 : 1);
    set(B.handL, hand || limbs);
    for (const i of [B.uarmR, B.uarmL, B.thighR, B.thighL]) set(i, limbs);
    this._partsOff = hand || limbs;
  }

  /**
   * First person: your own body under your eyes — look down and there are
   * your chest, your legs and your feet — but not your head (you're looking
   * out of it), and not your arms while the view's own arms are up (a guard,
   * a weapon, the food you're holding). Its shadow stays whole.
   */
  ownBody(fp, a, ctx, env) {
    const m = this.model, u = m.fx, pose = a._lastPose || {};
    // (at the helm or the oars the view has no arms of its own: yours are on the wheel, or the grips)
    // (and whenever the first-person arms are up in view: see viewmodel.js)
    const busy = !!pose.anim || !!pose.combat || !!pose.armed || !!this.draw || pose.block !== undefined || (!!pose.station && a.mode !== 'sail') || !!a.held || !!pose.launch || a.inWater || !!a._fpArms;
    // (like the first-person view in the big open-world games: from the eyes you
    // see your chest, arms, legs and feet — never your own head, hair or hat,
    // however long the hair or deep the hood. The body is whole below the
    // head: the eyes are in front of the neck, so looking down you see your
    // chest and belly from above, never into yourself — and the neck is
    // closed over at the top (body.js neckGeo). None of you is drawn over
    // the view knocked flat (it's down on the ground where you lie), at the
    // helm or the oars looking back over your shoulder further than a neck
    // turns (you'd have turned round), or while the view is held back behind
    // your eyes: a lunge up against a wall, and the head goes on without it.)
    // (nor flying: the body's laid out along the flight under eyes that stay level)
    const away = a.state === 'knocked' || a.state === 'dead' || (!!pose.station && (this.lookPast || 0) > 0.4) || (a._eye3?.held || 0) > 0.15 || !!a.flying;
    u.uClipY.value = fp && away ? -1e6 : 1e6;
    u.uHideHead.value = fp ? 1 : 0;
    u.uHideArms.value = fp && busy ? 1 : 0;
    m.face.visible = !fp;
    if (m.bubble) m.bubble.visible = !fp;
    if (fp) m.outline.visible = false;
    for (const h of m.held) if (h) h.group.visible = !fp;
    if (fp && a.inWater && !away && ctx.camera) {
      // In the water the view keeps its own height (the surface, a dive, the
      // sea floor: camera3d.js), so the body goes to it instead: your head where
      // the view is, treading water with your chest under you, or stretched
      // out behind you swimming — never floating out in front of your eyes.
      this.eyeAt();
      this.root.position.add(_v2.subVectors(ctx.camera.position, _eyeP));
      this.root.updateMatrixWorld(true);
    }
    if (fp) this.eyeOffset(a, pose, ctx, env);
    // (nor anything right up against your eyes — and while the view is still
    // catching up with your head, a little further out: it rides it a beat
    // behind, and a blow's lunge or a kick thrown leaning back left it behind
    // your neck or out in front of it, looking down your own collar)
    const lag = fp && ctx.camera && !pose.station ? ctx.camera.position.distanceTo(_eyeP) : 0;
    u.uNear.value = fp ? 0.2 + clamp(lag * 1.5, 0, 0.25) : 0;
  }

  /** Where the eyes are on the posed body, in the scene (into _eyeP). */
  eyeAt() {
    const m = this.model, d = m.d, hb = m.bones[B.head];
    this.root.updateMatrixWorld(true);
    hb.getWorldPosition(_eyeP);
    hb.getWorldQuaternion(_eyeQ);
    // (the eyes: at the front of the head, a little above its middle)
    _v.set(d.hx + d.headR * 0.7, d.hc + d.headR * 0.12, 0).multiplyScalar(this.root.scale.x).applyQuaternion(_eyeQ);
    return _eyeP.add(_v);
  }

  /**
   * The way the legs step (o.walkRel: where you're going, from where you
   * face), eased: flicking left and right — strafing in shift lock, say —
   * they swing round through the front rather than snapping across, and
   * turning round (slowing to a stop and going back) they keep stepping the
   * way they were until the new way takes over.
   */
  easeWalk(a, pose, o, dt) {
    const w = o.walkRel;
    if (w === null || w === undefined) {
      // (slowing through a stop to go back the other way, the last way is kept a moment)
      this.walkIdle = (this.walkIdle || 0) + dt;
      if (this.walkIdle > 0.35) this.walkSm = undefined;
      else if (pose.moving && this.walkSm !== undefined) o.walkRel = this.walkSm;
      return;
    }
    this.walkIdle = 0;
    let want = Math.atan2(Math.sin(w), Math.cos(w));
    if (this.walkSm === undefined || dt >= 1) { this.walkSm = want; return; }
    // (from stepping one way sideways to the other: by way of the front —
    // stepping forward, not backward; walking backward is let be)
    const d = angleDiff(this.walkSm, want);
    if (Math.abs(d) > 2.4 && Math.abs(want) > 0.5 && Math.abs(want) < 2.6) want = 0;
    this.walkSm += angleDiff(this.walkSm, want) * (1 - Math.exp(-dt * 11));
    o.walkRel = this.walkSm;
  }

  /**
   * Where your eyes are on your posed body, from where you stand (scene
   * axes): the first-person camera rides there (camera3d.js), so the view
   * goes with your head — leaning into a sprint, lunging into a blow,
   * bowing it to look down at yourself — as your eyes would.
   */
  eyeOffset(a, pose, ctx, env) {
    this.eyeAt();
    const e = a._eye3 || (a._eye3 = { x: 0, y: 0, z: 0, t: 0, ship: null, u: 0, v: 0, hy: 0 });
    e.x = _eyeP.x - this.root.position.x; e.y = _eyeP.y - this.root.position.y; e.z = _eyeP.z - this.root.position.z;
    e.t = performance.now();
    // at the helm or the oars, where they are on the ship (along her, across
    // her, over her waterline): she has moved on by the time the view is placed
    const s = pose.station?.ship;
    e.ship = s || null;
    if (s) {
      const w = ctx.world, h = s.heading, c = Math.cos(h), sn = Math.sin(h);
      const rx = _eyeP.x - (w ? w.dx(a.x, s.x) : s.x - a.x), rz = _eyeP.z - (s.y - a.y);
      e.u = rx * c + rz * sn; e.v = -rx * sn + rz * c; e.hy = _eyeP.y - shipBob(s, env.time);
    }
  }

  /**
   * A weapon coming out of its sheath (the holster, or off the back) — or
   * going back — over about half a second, whenever it's taken in hand or a
   * fight starts or ends; an attack draws it at once. (The motion itself:
   * CharacterModel.drawPath.)
   */
  drawing(pose, o, dt) {
    const want = !!o.armed && !!this.wpn;
    if (this.armedVis === undefined || dt >= 1) { this.armedVis = want; this.draw = null; }
    let D = this.draw;
    if (D && D.out !== want) { D.out = want; D.k = 1 - D.k; } // (changed its mind halfway: back the way it came)
    else if (!D && want !== this.armedVis) {
      if (pose.anim) this.armedVis = want;
      else D = this.draw = { k: 0, out: want };
    }
    if (D) {
      if (pose.anim && D.out) { this.armedVis = true; this.draw = D = null; }
      else {
        D.k = Math.min(1, D.k + dt / (D.out ? 0.6 : 0.5));
        if (D.k >= 1) { this.armedVis = D.out; this.draw = D = null; }
      }
    }
    o.draw = D;
    o.armed = D ? (D.out ? D.k > 0.42 : D.k < 0.58) : this.armedVis;
  }

  /** At the helm or the oars of your ship: stand (or sit) where the work is, riding up and down with her. */
  placeAtStation(a, st, env, ctx) {
    const s = st.ship, spot = stationSpot(st), w = ctx.world;
    // (the ship's middle relative to you: nothing, at her helm)
    const dx = w ? w.dx(a.x, s.x) : s.x - a.x, dy = s.y - a.y;
    // on her deck where the work is, as she rolls and pitches — not where
    // she'd have it lying flat: up on a big ship's quarterdeck that's half a
    // metre off in a few degrees of roll, and the wheel's spokes with it
    const p = shipPoint(s, env.time, spot.u, 0, spot.floor, _sp3);
    this.root.position.set(dx + p[0], p[1], dy + p[2]);
    // leaning a little with the deck under the feet (braced on it, not stood stiff upright on a slope)
    const k = BOAT_FEEL.standTilt;
    if (k > 0) {
      const [roll, pitch] = shipRock(s, env.time);
      _eu.set(roll * k, -s.heading, pitch * k, 'YXZ');
      this.root.quaternion.setFromEuler(_eu).multiply(_qh.setFromAxisAngle(_up3, s.heading));
      this.tilted = true;
    } else this.root.quaternion.identity();
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

  /**
   * A Gum-Gum fist in flight, in this model's pose frame (turned as the
   * model is drawn, at the height of the shoulder it flies from): the right
   * arm runs out to it, and once it's spent snaps back (chars/rubber.js).
   */
  stretchTarget(a, ctx, s, o, dt) {
    const F = this.fist || (this.fist = fistState());
    const f = this.visF ?? a.facing ?? 0, c = Math.cos(f), sn = Math.sin(f);
    const sh = this.model.rig.S[0].y - 0.05, base = this.root.position.y;
    // (where the fist flies from, in the world: index.js fistY)
    this.shoulderY = base + sh * s;
    const k = rubberFist(F, a, ctx, dt, (out, dx, dy, pr) => {
      const y = ctx.projY ? (ctx.projY(pr) - base) / s : sh;
      out.set((dx * c + dy * sn) / s, y, (-dx * sn + dy * c) / s);
    });
    if (k > 0) { o.reachR = F.at; o.reachRK = k; if (F.big) o.infR = 1; }
  }

  effects(a, pose, P, o, env, ctx, camYaw3, dist, s) {
    const m = this.model, fx = m.fx, rig = m.rig;
    const t = env.time;
    // hit flash, armament, legs, freeze
    fx.uFlash.value = a.flashT > 0 ? Math.min(0.78, a.flashT / 0.12 * 0.95) : 0;
    // (Armament: the coat spreading up the limbs, chars/haki.js)
    coatBody(this.coat || (this.coat = {}), a, !!pose.armLegs, t, fx);
    // (the Gears, a living shadow, Future Sight: chars/forms.js)
    formBody(this, a, m, o, t, this.gear || 0, a.isPlayer && ctx.mode === 'first');
    // sensed by your Observation Haki: their will glowing through the walls
    const sn = ctx.game ? senseOf(a, ctx.game) : null;
    m.sense(sn && sn.col, sn ? sn.k : 0);
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
    // aura (not round your own eyes in first person: the view's edges take its tint instead)
    // (the blaze hugging the figure — flameaura.js — and the flecks drifting up off it)
    if (pose.aura && near && !(a.isPlayer && ctx.mode === 'first')) {
      if (!this.flame) this.flame = new FlameAura(m);
      this.flame.visible = true;
      this.flame.set(pose.aura, t, m.d.hip0, m.d.Bk);
      if (!this.aura) { this.aura = new Aura(); this.root.add(this.aura.mesh); this.aura.shell.visible = this.aura.outer.visible = false; }
      this.aura.mesh.visible = true;
      this.aura.set(pose.aura, t, 2.25 * (1 + (m.d.hip0 - 0.93) * 0.5), 1.45 * m.d.Bk, camYaw3);
      this.aura.mesh.position.set(-Math.sin(camYaw3) * 0.3, -0.05 + o.lift, -Math.cos(camYaw3) * 0.3);
    } else {
      if (this.aura) this.aura.mesh.visible = false;
      if (this.flame) this.flame.visible = false;
    }
    // the Lunarian flame on the back, between the wings (out in the sea, and
    // not over your own shoulders in first person: you'd be looking out of it)
    const lit = !!this.look.backFlame && a.flameLit !== false && !a.inWater && !(a.isPlayer && ctx.mode === 'first');
    if ((lit || this.backFlame?.grow > 0.02) && near) {
      const chest = m.bones[B.chest];
      if (!this.backFlame) this.backFlame = new BackFlame(a.seed || 0);
      if (this.backFlame.group.parent !== chest) chest.add(this.backFlame.group);
      // (rooted between the shoulder blades, riding the chest as it leans and
      // turns — but fire burns upward, however the body's bent: the chest's
      // lean and roll undone, the way they face kept)
      this.backFlame.group.position.set(-0.15 * m.d.Bk, m.d.chestLen * 0.6, 0);
      chest.updateWorldMatrix(true, false);
      chest.getWorldQuaternion(_fq).invert();
      this.backFlame.group.quaternion.copy(_fq).multiply(this.yaw.getWorldQuaternion(_fq2));
      // (a chest swollen by a move — Gigant Balloon, Gear Third, a Monster
      // Point — carries the flame on its back, not blown up with it: the
      // bone's own scale undone, the body's size kept)
      chest.getWorldScale(_fs1); this.yaw.getWorldScale(_fs2);
      this.backFlame.group.scale.set(_fs2.x / (_fs1.x || 1), _fs2.y / (_fs1.y || 1), _fs2.z / (_fs1.z || 1));
      const fdt = Math.min(0.1, Math.max(0, t - (this.flameT ?? t)));
      this.flameT = t;
      // (the air going past: the way they're moving, from where they were a frame ago)
      const w = ctx.world, px = this.flameX ?? a.x, py = this.flameY ?? a.y;
      const k = fdt > 0 ? 1 / fdt : 0, mvx = (w ? w.dx(px, a.x) : a.x - px) * k, mvy = (a.y - py) * k;
      this.flameX = a.x; this.flameY = a.y;
      const sp = Math.hypot(mvx, mvy), lim = sp > 9 ? 9 / sp : 1;
      driftInto(this.yaw, -mvx * lim * 0.05, -mvy * lim * 0.05, _v2);
      _v2.x -= 0.08; // (and a little back off the shoulders even standing still)
      // (its size from the body as it is, not as a move has blown it up: a
      // look a buff puts on — Balloon's bulk, a Gear — leaves the flame be)
      if (!a.buffs?.some((b) => b.look)) this.flameBk = m.d.Bk;
      this.backFlame.update(t, fdt, 1.1 * (this.flameBk ?? m.d.Bk), _v2, lit);
    } else if (this.backFlame) this.backFlame.group.visible = false;
    // the Phoenix's wings of blue flame: flying as the Phoenix, or while its form is on
    const phoenix = (a.flying && a.flightStyle === 'phoenix') || !!a.phoenixForm;
    if ((phoenix || this.wings?.grow > 0.02) && near && !(a.isPlayer && ctx.mode === 'first')) {
      if (!this.wings) { this.wings = new PhoenixWings(a.seed || 0); m.group.add(this.wings.group); }
      const wdt = Math.min(0.1, Math.max(0, t - (this.wingT ?? t)));
      this.wingT = t;
      // (streaming back off the arms, and the more so the faster they go)
      const w = ctx.world, px = this.wingX ?? a.x, py = this.wingY ?? a.y, k = wdt > 0 ? 1 / wdt : 0;
      const mvx = (w ? w.dx(px, a.x) : a.x - px) * k, mvy = (a.y - py) * k;
      this.wingX = a.x; this.wingY = a.y;
      driftInto(this.yaw, -mvx * 0.06, -mvy * 0.06, _v2);
      _v2.x -= 0.8; _v2.y += 0.15;
      this.wings.update(t, wdt, rig, m.d, _v2.normalize(), phoenix);
    } else if (this.wings) this.wings.group.visible = false;
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
    if (a.armament && pose.anim && near) glow(sigOf(a).armament, 0.13, rig.E[pose.anim.limb === 'hB' ? 1 : 0]);
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
    // (no name tags over anyone — crewmates included: only the marks over
    // their heads, and a health bar in a fight. You learn names by talking)
    const name = null;
    // (a health bar over anyone hurt a moment ago, or in a fight with you or
    // your crew — not only for a few seconds after each blow; a boss has the
    // big bar at the top of the screen instead, while it's up for them)
    const t = a.controller?.target;
    const fighting = !!t && (t.isPlayer || t.faction === 'player') && a.controller.state !== 'idle';
    const bigBar = a.boss && a.game?.bossTarget === a && !a.game.ui?.el?.boss?.classList.contains('hidden');
    const bar = !a.isPlayer && (a.damageShown > 0 || fighting) && idle && !a.hideBar && !bigBar && dist < 36 ? clamp(a.hp / a.d.maxHp, 0, 1) : null;
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
      // (a road's sign is a round badge, a little bigger)
      if (a.questMarker[0] === 'R') this.marker.sprite.scale.set(0.78 * k * 1.2, 0.78 * k * 1.2, 1);
      else this.marker.sprite.scale.set(0.42 * k * 1.2, 0.63 * k * 1.2, 1);
    } else if (this.marker) this.marker.sprite.visible = false;
  }

  dispose() {
    this.model.dispose();
    this.wake?.dispose();
    this.label?.dispose();
    this.aura?.dispose();
    this.flame?.dispose();
    this.collar?.dispose();
    this.backFlame?.dispose();
    this.wings?.dispose();
    this.trail?.dispose();
    this.shimmer?.material.dispose();
    this.root.removeFromParent();
  }
}

// ------------------------------------------------------------------ registration
const baseDraw = Actor.prototype.draw;
registerActorView((a, ctx, opts) => {
  try {
    if (a.look && a.look.race === 'seaking') return new SeaKingView(a);
    if (a.look && a.look.race === 'beast_seacow') return new SeaCowView(a);
    if (a.look && a.look.race === 'beast_fightfish') return new FightingFishView(a);
    if (a.draw !== baseDraw) return null; // custom-drawn creatures keep their sprite
    return new ActorView(a, ctx, opts);
  } catch (e) {
    console.warn('3D character failed', e);
    return null;
  }
});
registerViewmodel((ctx) => createViewmodel(ctx));

// First person at a rowboat's oars: your own arms on the grips, rowing (the
// everyday first-person arms are put away at sea; these sit in the boat)
let rowArms = null;
registerFrameHook((env, ctx) => {
  const p = ctx.game?.player;
  const rowing = !!p && ctx.mode === 'first' && p.mode === 'sail' && !!p.ship?.def.oarsOnly && !p.ship.sunk && p.state !== 'knocked';
  if (!rowing) { if (rowArms) rowArms.root.visible = false; return; }
  if (!rowArms) {
    rowArms = createViewmodel(ctx);
    const cam = ctx.camera;
    if (!cam.parent) ctx.scene.add(cam);
    cam.add(rowArms.root);
  }
  rowArms.root.visible = true;
  rowArms.update(p, env, ctx);
}, 'rowing arms');

export { ActorView };
