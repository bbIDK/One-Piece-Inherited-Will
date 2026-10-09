// Pose sampling shared by the world characters and the first-person
// viewmodel: the actor's current look and weapon, the 2D rig pose sampled
// exactly as the 2D renderer does, and the 3D rig options for the frame.
import * as THREE from 'three';
import { infusedAura } from '../../game/haki.js';
import { samplePose, restPose, blendPose } from '../../render/anims.js';
import { shipDims, oarPoints, rowLean, floorAt, wheelSpec, shipPoint } from '../../world/hull.js';
import { ITEMS } from '../../data/items.js';
import { swordLook } from './swords.js';

// ------------------------------------------------------------------ pose
/** The look an actor shows right now (buff looks merged; cached per buff). */
export function currentLook(a, cache) {
  const buffLook = a.buffs && a.buffs.find((b) => b.look);
  if (!buffLook) return a.look;
  if (cache && cache.base === a.look && cache.buff === buffLook) return cache.look;
  const look = { ...a.look, ...buffLook.look };
  if (cache) { cache.base = a.look; cache.buff = buffLook; cache.look = look; }
  return look;
}
/**
 * What an actor fights with, as the models need it: { kind, count, gun,
 * ids, back } — for swords, which ones, in the order they're worn (each is
 * drawn as itself: swords.js), and whether the first is carried on the back
 * (Yoru).
 */
export function weaponOf(a) {
  if (!a.weapon) return null;
  const w = a.weapon;
  const gun = w.kind === 'gun' && (w.ids || []).some((id) => /sling|kabuto/.test(id)) ? 'sling' : w.gun;
  const count = w.count || 1;
  let ids = null;
  if (w.kind === 'sword') {
    // (the equipped list holds every weapon: the swords among it; an NPC's are all swords)
    if (!w._swords || w._swordsOf !== w.ids) { w._swordsOf = w.ids; w._swords = (w.ids || []).filter((id) => !ITEMS[id] || ITEMS[id].kind === 'sword'); }
    ids = w._swords.length > count ? w._swords.slice(0, count) : w._swords;
  }
  return { kind: w.kind, count, gun, ids, back: !!(ids && ids[0] && swordLook(ids[0]).onBack) };
}
/** A key that changes when the weapon's models would (kind, count, gun, which swords). */
export function weaponKey(w) {
  return w ? `${w.kind}${w.count}${w.gun || ''}${w.ids ? ':' + w.ids.join(',') : ''}` : '';
}

/**
 * Sample an actor's pose exactly as the 2D renderer does (and keep the
 * blend/afterimage bookkeeping the 2D path relies on). Returns { pose, P }.
 */
export function actorPose(a, env, look) {
  const act = a.action;
  const alphaBuff = a.buffs.find((b) => b.alpha !== undefined);
  // (Conqueror's Infusion: near black, deep in the king's own colour — game/haki.js)
  const aura = a.conquerorInfused ? infusedAura(a) : a.buffs.find((b) => b.aura)?.aura || null;
  const pose = a.visualPose(env, look, act, aura, alphaBuff);
  // in 3D a dodge rolls when it goes along the facing, else it's a side-step
  if (pose.dodge !== undefined && a.dash) {
    const d = a.dash, dl = Math.hypot(d.vx, d.vy) || 1;
    pose.dodgeDir = (d.vx * Math.cos(a.facing) + d.vy * Math.sin(a.facing)) / dl;
    pose.dodgeSide = (-d.vx * Math.sin(a.facing) + d.vy * Math.cos(a.facing)) / dl;
  }
  let P = pose.anim ? samplePose(pose.anim, pose.anim.t, pose) : restPose(pose, look);
  // (in first person a dash is felt, not watched: the view rides your head,
  // so it dips and lunges with it — not thrown about with the whole dash)
  if (pose.dodge !== undefined && a.isPlayer && a.game?.view3d?.rig?.mode === 'first') firstPersonDash(P, pose);
  if (pose.station && !pose.anim) stationPose(P, pose.station);
  if (!pose.anim && (a.held || a.eating) && !a.inWater) heldPose(P, a, env ? env.time : 0);
  // (eased, not linear: a blend between two moves starts and ends gently, as the moves themselves do)
  if (pose.blend && pose.blend.P) { const k = pose.blend.k; P = blendPose(pose.blend.P, P, k * k * (3 - 2 * k)); }
  pose.P = P;
  a._lastP = P; a._lastPose = pose; a._lastLook = look;
  return { pose, P };
}

/**
 * A dash in first person: the dash's crouch and lean, toned down (your eyes
 * ride your head: thrown forward with the whole lunge, the view would pitch
 * at the ground), and no hop off the ground.
 */
function firstPersonDash(P, pose) {
  P.r = 0;
  P.l = (P.l || 0) * 0.6;
  P.z = (P.z || 0) * 0.3;
  P.b = [P.b[0] * 0.5, P.b[1]];
}

// ------------------------------------------------------------------ food in hand
/**
 * Holding food (or medicine, or a Devil Fruit) in the right hand, a little
 * out in front; eating it, the hand at the mouth, the head bowed to meet it,
 * a bite every third of a second.
 */
function heldPose(P, a, t) {
  P.hand = 'hold';
  if (a.eating?.wrap) {
    // binding a wound: the left forearm held out across the chest, the right
    // hand winding the bandage round and round it, the head bowed to watch
    const e = a.eating, k = Math.min(1, e.t / 0.3), w = e.t * 10;
    P.hB = [0.3 * k + 0.05 * (1 - k), 0.16 * k + 0.4 * (1 - k)];
    P.eB = 1;
    P.hF = [0.3 * k + 0.06 * Math.cos(w) * k, 0.16 * k + 0.07 * Math.sin(w) * k + 0.4 * (1 - k)];
    P.eF = 1;
    P.hand = 'hold'; P.handB = 'fist';
    P.ht = (P.ht || 0) + 0.16 * k;
    return;
  }
  if (a.eating) {
    // (raised to the mouth, the palm turns to face it)
    if (a.eating.t > 0.09) P.hand = 'eat';
    const e = a.eating, k = Math.min(1, e.t / 0.18);
    const bite = Math.max(0, Math.sin((e.t / 0.36) * Math.PI * 2)) * 0.03;
    const hF = Array.isArray(P.hF) ? P.hF : [0.05, 0.4];
    P.hF = [hF[0] + (0.11 + bite - hF[0]) * k, hF[1] + (-0.2 - hF[1]) * k];
    P.eF = 1;
    P.ht = (P.ht || 0) + 0.12 * k + bite;
  } else {
    P.hF = [0.16, 0.2];
    P.eF = 1;
  }
}

// ------------------------------------------------------------------ at a ship's station
/**
 * Rowing: sitting on the thwart facing the bow with the feet braced against
 * the floor, leaning back to the catch with the hands at the chest, then
 * forward into the drive as the arms push the grips out (see hull.js
 * oarStroke: the blades dip, sweep aft and lift out), the head up and looking
 * ahead. At the wheel: standing square to it, weight back a little. The
 * hands themselves go to the oar grips or the wheel's rim (stationReach).
 */
function stationPose(P, st) {
  P.wF = null; P.wB = null;
  P.hand = 'fist'; P.handB = 'fist'; P.eF = 1; P.eB = 1;
  if (st.kind === 'row') {
    const lean = rowLean(st.ship);
    P.l = lean; P.b = [-0.03, 0];
    P.fF = [0.3, 0]; P.fB = [0.27, 0];
    P.ht = 0.06 - lean * 0.55;
    P.hF = [0.3 + lean * 0.3, 0.26]; P.hB = [0.3 + lean * 0.3, 0.26];
  } else {
    P.l = 0.04; P.b = [0, 0.01];
    P.fF = [0.1, 0]; P.fB = [-0.12, 0];
    P.hF = [0.3, 0.14]; P.hB = [0.3, 0.14];
  }
}

/**
 * Where a station's work puts the helmsman or rower (ship-local: u along
 * her, the floor under the feet) and what the hands hold: { u, floor, row }.
 * At the wheel you stand just behind it (when it's on your deck).
 */
export function stationSpot(st) {
  const d = shipDims(st.ship.def);
  if (d.row) return { u: d.row.seatU, floor: d.deckY, row: true };
  const w = wheelSpec(d);
  const u = w.u - 0.36, floor = floorAt(d, (u + d.L / 2) / d.L);
  // (a wheel down on the main deck under the quarterdeck's rail: stand at the helm above it)
  if (Math.abs(floor - w.floor) > 0.1) return { u: d.helmX, floor: d.helmFloor, row: false };
  return { u, floor, row: false };
}

const _g = new THREE.Vector3();
/**
 * The hands' targets at a rowboat's oars, in a character model's own frame
 * (metres / scale, from the feet; +x ahead, +z to the right): on the oar
 * grips as the oars lie now (the right hand on the starboard oar). `rel`:
 * how far the model is turned from the ship's heading. Kept within arm's
 * reach of the shoulders (no rubber arms). Writes into `out` ([Vector3,
 * Vector3]: right, left) and returns it. (At the wheel: HelmHands.)
 */
export function stationReach(st, spot, d, s, rel, lean, hipY, out) {
  const sh = shipDims(st.ship.def);
  for (let k = 0; k < 2; k++) {
    const side = k === 0 ? 1 : -1, T = out[k];
    const o = st.ship.oars[k === 0 ? 1 : 0];
    const q = oarPoints(sh, side, o.a, o.b);
    // (the hand round the grip, a little in from its end)
    const back = sh.row.inboard - 0.07;
    T.set(q.lock[0] - q.dir[0] * back - spot.u, q.lock[1] - q.dir[1] * back - spot.floor, q.lock[2] - q.dir[2] * back);
    // into the model's frame (turned `rel` from the ship, and scaled)
    const c = Math.cos(rel), sn = Math.sin(rel), x = T.x, z = T.z;
    T.set((x * c + z * sn) / s, T.y / s, (-x * sn + z * c) / s);
    inReach(T, d, side, lean, hipY);
  }
  return out;
}

/** Keep a hand target within arm's reach of its shoulder (over the hips at `hipY`, leaning `lean`). */
function inReach(T, d, side, lean, hipY) {
  _g.set(d.shY * Math.sin(lean), hipY + d.shY * Math.cos(lean), side * d.shW);
  const L = (d.A1 + d.A2) * 0.97;
  const dist = T.distanceTo(_g);
  if (dist > L) T.sub(_g).multiplyScalar(L / dist).add(_g);
}

// ---- the hands on the wheel
// Each hand holds a spoke just outside the rim, in its own reach of the
// wheel (the right hand on the starboard side of the top, the left the port
// side). As the wheel turns, the spoke goes round with it, and the hand with
// the spoke — until it's carried out of the hand's reach, when the hand lets
// go and takes the next spoke coming round (hand over hand, as a helmsman
// spins a wheel), one hand at a time.
const SPOKE = Math.PI / 4;
export const HELM_GRIP = {
  near: 0.5, far: 1.58, // the arc each hand works its spoke through, radians from the top (never up over it, by the face)
  rest: 0.95, // where it likes to take hold
  shift: 0.15, // s to let go and take the next spoke
};
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _pa = [0, 0, 0], _pb = [0, 0, 0], _q = new THREE.Quaternion();
export class HelmHands {
  constructor() { this.h = [null, null]; this.ship = null; }

  /** The spoke nearest where this hand likes to hold, of those in its reach (or any, if `any`). */
  pick(W, side, not = -1, any = false) {
    let best = -1, bd = 1e9;
    for (let k = 0; k < 8; k++) {
      if (k === not) continue;
      const a = wrapA(k * SPOKE + W) * side;
      if (!any && (a < HELM_GRIP.near || a > HELM_GRIP.far)) continue;
      const dd = Math.abs(a - HELM_GRIP.rest);
      if (dd < bd) { bd = dd; best = k; }
    }
    return best;
  }

  /**
   * This frame's targets for the hands at `st`'s wheel (out: [right, left]
   * Vector3s, in the model's frame): `rel` — the root, from the actor's own
   * spot (render axes, metres); `ox, oz` — the ship's middle from there;
   * `facing` the model's turn, `tilt` its lean with the deck (a quaternion,
   * or null), `s` its scale; `d` its rig's dimensions, `hipY` and `lean`
   * for the reach.
   */
  update(st, time, dt, rel, ox, oz, facing, tilt, s, d, hipY, lean, out) {
    const ship = st.ship, sh = shipDims(ship.def), w = wheelSpec(sh), W = ship.wheel || 0;
    if (this.ship !== ship) { this.ship = ship; this.h = [null, null]; }
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      let H = this.h[k];
      if (!H) H = this.h[k] = { k: this.pick(W, side, -1, true), from: -1, t: 1 };
      if (H.t < 1) H.t = Math.min(1, H.t + dt / HELM_GRIP.shift);
      const a = wrapA(H.k * SPOKE + W) * side;
      const other = this.h[1 - k];
      // (out of its reach: on to the next spoke — once the other hand has hold, unless it's well past)
      const out2 = a < HELM_GRIP.near || a > HELM_GRIP.far, way = a < HELM_GRIP.near - 0.3 || a > HELM_GRIP.far + 0.3;
      if (H.t >= 1 && out2 && (!other || other.t >= 1 || way)) {
        const n = this.pick(W, side, H.k);
        if (n >= 0) { H.from = H.k; H.k = n; H.t = 0; }
      }
      // where it holds (or, taking a new spoke, on its way from the old one: drawn back a little off the wheel)
      const T = out[k];
      gripAt(ship, time, w, H.k * SPOKE + W, _pa);
      if (H.t < 1 && H.from >= 0) {
        gripAt(ship, time, w, H.from * SPOKE + W, _pb);
        const e = H.t * H.t * (3 - 2 * H.t), lift = Math.sin(H.t * Math.PI);
        for (let i = 0; i < 3; i++) _pa[i] = _pb[i] + (_pa[i] - _pb[i]) * e;
        // (off the spokes, toward the helmsman: back along her)
        const c = Math.cos(ship.heading), sn = Math.sin(ship.heading);
        _pa[0] -= c * 0.09 * lift; _pa[2] -= sn * 0.09 * lift; _pa[1] += 0.03 * lift;
      }
      T.set(ox + _pa[0] - rel.x, _pa[1] - rel.y, oz + _pa[2] - rel.z);
      // into the model's frame: its lean with the deck undone, then its turn, and its scale
      if (tilt) T.applyQuaternion(_q.copy(tilt).invert());
      const c = Math.cos(facing), sn = Math.sin(facing), x = T.x, z = T.z;
      T.set((x * c + z * sn) / s, T.y / s, (-x * sn + z * c) / s);
      inReach(T, d, side, lean, hipY);
    }
    return out;
  }
}

/** Where a hand holds the spoke that's at angle `a` round the wheel (from the top, toward starboard): render axes from her middle. */
function gripAt(ship, time, w, a, out) {
  // (round the spoke just outside the rim, the hand a little behind the wheel's face)
  return shipPoint(ship, time, w.u - 0.05, Math.sin(a) * w.grip, w.hub + Math.cos(a) * w.grip, out);
}

export const LYING = { b: [0, 0], l: 0, r: 0, z: 0, sp: 0, ht: -0.2, hF: [0.03, 0.3], hB: [0.03, 0.3], eF: 0.35, eB: 0.35, fF: [0.07, 0], fB: [-0.03, 0], wF: null, wB: null, m: 0.15, hand: 'palm', handB: 'palm', face: null };

/** Rig options for this frame (walk direction, knock-down, swim, sweep tilt…). */
export function rigOptions(a, pose, P, o = {}) {
  const A = pose.anim;
  o.tilt = A && A.sweep && A.limb !== 'fF' && A.limb !== 'fB' ? A.sweep * 0.5 : 0;
  o.walkRel = null;
  if (pose.moving && (!A || !A.legs) && pose.dodge === undefined && pose.state !== 'knocked' && !pose.flight) {
    const sp = Math.hypot(a.vx || 0, a.vy || 0);
    if (sp > 0.3) o.walkRel = Math.atan2(a.vy, a.vx) - a.facing;
  }
  o.spread = 0; o.legSpread = 0; o.leanAdd = 0; o.tiltAdd = 0; o.lying = 0; o.bounce = 0; o.headRoll = 0; o.grip2 = 0; o.grip2K = 1;
  // (staggered by a blow with no telling where it came from, the head's thrown back; a
  // blow from somewhere has its own flinch: render/anims.js)
  if (pose.state === 'hurt' && pose.stunBlind) o.tiltAdd = -0.25;
  // getting up after a knockdown starts from the ground: still tipped back as
  // it sits up (render/anims.js getUpPose), righting itself as a knee comes under it
  if (pose.getUp !== undefined && pose.state !== 'knocked') { const k = Math.max(0, 1 - pose.getUp / 0.3); o.lying = k * k * 0.9; }
  if (pose.swimming && (pose.swim === 'tread' || !pose.swim)) o.leanAdd = 0.2;
  if (pose.swimming && P.spread) o.spread = P.spread;
  if (pose.swimming && P.legSpread) o.legSpread = P.legSpread; // (the frog kick's knees and feet apart)
  if (pose.swimming) o.walkRel = null; // the legs kick, they don't walk
  o.roll = 0; o.infR = 0; o.infL = 0;
  o.lift = ((P.z || 0) + (pose.z || 0)) * 1.3;
  o.squash = (pose.squash || 1) * (P.sq || 1);
  if (pose.toon) o.squash *= 1 + Math.sin((pose.time || 0) * 9) * 0.05;
  o.moving = !!pose.moving;
  o.sprint = !!pose.sprint;
  o.flow = pose.flight ? Math.min(0.9, (pose.flight.speed || 0) / 14) : pose.moving ? (pose.sprint ? 0.55 : 0.25) : 0;
  o.time = pose.time || 0;
  o.armed = !!pose.armed;
  o.armament = !!pose.armament;
  o.blade = pose.blade || null; o.bladeB = pose.bladeB || null; o.bladeLen = pose.bladeLen || 1;
  // a side-step leans into the slide (as much as the dash goes sideways)
  o.sideRoll = 0;
  if (pose.dodge !== undefined && pose.dodgeSide !== undefined) {
    const n = Math.hypot(pose.dodgeDir || 0, pose.dodgeSide) || 1, s = pose.dodgeSide / n;
    const lean = pose.dodgeKind === 'heavy' ? 0.22 : pose.dodgeKind === 'wing' || pose.dodgeKind === 'glide' ? 0.45 : 0.34;
    o.sideRoll = Math.sign(s) * s * s * lean * Math.sin(Math.min(1, pose.dodge / 0.85) * Math.PI);
  }
  // everyday poses: arms folded across the chest, a seat under you, something in your hand
  if (pose.activity === 'lean' || pose.activity === 'poster-fold' || pose.activity === 'fold') o.spread = -0.17;
  else if (pose.activity === 'think') o.spread = -0.12;
  else if (pose.activity === 'hips') o.spread = 0.07;
  else if (pose.activity === 'attention') o.spread = -0.1;
  o.seatH = pose.activity === 'sit' || pose.activity === 'fish' ? pose.seatH || 0 : null;
  // (at a rowboat's oars, on her thwart)
  if (pose.station && pose.station.kind === 'row' && !A) { o.seatH = shipDims(pose.station.ship.def).row.seatH; o.walkRel = null; }
  o.prop = pose.prop || null;
  // out of a fight, hands hang loose rather than clenched (articulated hands) —
  // but on the oars or the wheel they grip
  o.relaxHands = !A && !pose.combat && !pose.armed && pose.block === undefined && pose.dodge === undefined && pose.state !== 'hurt' && !pose.station;
  return o;
}

