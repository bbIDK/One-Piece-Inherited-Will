// Pose sampling shared by the world characters and the first-person
// viewmodel: the actor's current look and weapon, the 2D rig pose sampled
// exactly as the 2D renderer does, and the 3D rig options for the frame.
import * as THREE from 'three';
import { samplePose, restPose, blendPose } from '../../render/anims.js';
import { shipDims, oarPoints, rowLean, floorAt } from '../../world/hull.js';

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
export function weaponOf(a) {
  if (!a.weapon) return null;
  const w = a.weapon;
  const gun = w.kind === 'gun' && (w.ids || []).some((id) => /sling|kabuto/.test(id)) ? 'sling' : w.gun;
  return { kind: w.kind, count: w.count || 1, gun };
}

/**
 * Sample an actor's pose exactly as the 2D renderer does (and keep the
 * blend/afterimage bookkeeping the 2D path relies on). Returns { pose, P }.
 */
export function actorPose(a, env, look) {
  const act = a.action;
  const alphaBuff = a.buffs.find((b) => b.alpha !== undefined);
  const aura = a.buffs.find((b) => b.aura)?.aura || (a.conquerorInfused ? 'rgba(0,0,0,0.8)' : null);
  const pose = a.visualPose(env, look, act, aura, alphaBuff);
  // in 3D a dodge rolls when it goes along the facing, else it's a side-step
  if (pose.dodge !== undefined && a.dash) {
    const d = a.dash, dl = Math.hypot(d.vx, d.vy) || 1;
    pose.dodgeDir = (d.vx * Math.cos(a.facing) + d.vy * Math.sin(a.facing)) / dl;
    pose.dodgeSide = (-d.vx * Math.sin(a.facing) + d.vy * Math.cos(a.facing)) / dl;
  }
  let P = pose.anim ? samplePose(pose.anim, pose.anim.t, pose) : restPose(pose, look);
  if (pose.station && !pose.anim) stationPose(P, pose.station);
  if (!pose.anim && (a.held || a.eating) && !a.inWater) heldPose(P, a, env ? env.time : 0);
  if (pose.blend && pose.blend.P) P = blendPose(pose.blend.P, P, pose.blend.k);
  pose.P = P;
  a._lastP = P; a._lastPose = pose; a._lastLook = look;
  return { pose, P };
}

// ------------------------------------------------------------------ food in hand
/**
 * Holding food (or medicine, or a Devil Fruit) in the right hand, a little
 * out in front; eating it, the hand at the mouth, the head bowed to meet it,
 * a bite every third of a second.
 */
function heldPose(P, a, t) {
  P.hand = 'hold';
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
  const w = wheelOf(d);
  const u = w.u - 0.42, floor = floorAt(d, (u + d.L / 2) / d.L);
  // (a wheel down on the main deck under the quarterdeck's rail: stand at the helm above it)
  if (Math.abs(floor - w.floor) > 0.1) return { u: d.helmX, floor: d.helmFloor, row: false };
  return { u, floor, row: false };
}

/** The wheel: where it stands along the hull, its floor, and its hub's height and radius. */
function wheelOf(d) {
  if (d.big) return { u: d.wheelU, floor: d.yq, hub: d.yq + 0.92, r: 0.5 };
  const u = d.wheelU, floor = floorAt(d, (u + 0.1 + d.L / 2) / d.L);
  return { u, floor, hub: floor + 0.92, r: 0.4 };
}

const _g = new THREE.Vector3();
/**
 * The hands' targets for a station, in a character model's own frame
 * (metres / scale, from the feet; +x ahead, +z to the right): on the oar
 * grips as the oars lie now (the right hand on the starboard oar), or on the
 * wheel's rim. `rel`: how far the model is turned from the ship's heading.
 * Kept within arm's reach of the shoulders (no rubber arms). Writes into
 * `out` ([Vector3, Vector3]: right, left) and returns it.
 */
export function stationReach(st, spot, d, s, rel, lean, hipY, out) {
  const sh = shipDims(st.ship.def);
  for (let k = 0; k < 2; k++) {
    const side = k === 0 ? 1 : -1, T = out[k];
    if (spot.row) {
      const o = st.ship.oars[k === 0 ? 1 : 0];
      const q = oarPoints(sh, side, o.a, o.b);
      // (the hand round the grip, a little in from its end)
      const back = sh.row.inboard - 0.07;
      T.set(q.lock[0] - q.dir[0] * back - spot.u, q.lock[1] - q.dir[1] * back - spot.floor, q.lock[2] - q.dir[2] * back);
    } else {
      const w = wheelOf(sh);
      T.set(w.u - 0.02 - spot.u, w.hub - spot.floor + w.r * 0.55, side * w.r * 0.7);
    }
    // into the model's frame (turned `rel` from the ship, and scaled)
    const c = Math.cos(rel), sn = Math.sin(rel), x = T.x, z = T.z;
    T.set((x * c + z * sn) / s, T.y / s, (-x * sn + z * c) / s);
    // within reach of the shoulder (over the hips at `hipY`, leaning `lean`)
    _g.set(d.shY * Math.sin(lean), hipY + d.shY * Math.cos(lean), side * d.shW);
    const L = (d.A1 + d.A2) * 0.97;
    const dist = T.distanceTo(_g);
    if (dist > L) T.sub(_g).multiplyScalar(L / dist).add(_g);
  }
  return out;
}

export const LYING = { b: [0, 0], l: 0, r: 0, z: 0, sp: 0, ht: -0.2, hF: [0.03, 0.3], hB: [0.03, 0.3], eF: 0.35, eB: 0.35, fF: [0.07, 0], fB: [-0.03, 0], wF: null, wB: null, m: 0.15, hand: 'palm', handB: 'palm', face: null };

/** Rig options for this frame (walk direction, knock-down, swim, sweep tilt…). */
export function rigOptions(a, pose, P, o = {}) {
  const A = pose.anim;
  o.tilt = A && A.sweep && A.limb !== 'fF' && A.limb !== 'fB' ? A.sweep * 0.5 : 0;
  o.walkRel = null;
  if (pose.moving && (!A || !A.legs) && pose.dodge === undefined && pose.state !== 'knocked') {
    const sp = Math.hypot(a.vx || 0, a.vy || 0);
    if (sp > 0.3) o.walkRel = Math.atan2(a.vy, a.vx) - a.facing;
  }
  o.spread = 0; o.legSpread = 0; o.leanAdd = 0; o.tiltAdd = 0; o.lying = 0; o.bounce = 0; o.headRoll = 0;
  if (pose.state === 'hurt') o.tiltAdd = -0.25;
  if (pose.swimming && (pose.swim === 'tread' || !pose.swim)) o.leanAdd = 0.2;
  if (pose.swimming && P.spread) o.spread = P.spread;
  if (pose.swimming) o.walkRel = null; // the legs kick, they don't walk
  o.roll = 0;
  o.lift = ((P.z || 0) + (pose.z || 0)) * 1.3;
  o.squash = pose.squash || 1;
  if (pose.toon) o.squash *= 1 + Math.sin((pose.time || 0) * 9) * 0.05;
  o.moving = !!pose.moving;
  o.sprint = !!pose.sprint;
  o.flow = pose.moving ? (pose.sprint ? 0.55 : 0.25) : 0;
  o.time = pose.time || 0;
  o.armed = !!pose.armed;
  o.armament = !!pose.armament;
  o.blade = pose.blade || null; o.bladeB = pose.bladeB || null; o.bladeLen = pose.bladeLen || 1;
  // a side-step leans into the slide
  o.sideRoll = 0;
  if (pose.dodge !== undefined && pose.dodgeSide !== undefined && Math.abs(pose.dodgeDir) <= 0.35) o.sideRoll = Math.sign(pose.dodgeSide) * 0.38 * Math.sin(pose.dodge * Math.PI);
  // everyday poses: arms folded across the chest, a seat under you, something in your hand
  if (pose.activity === 'lean') o.spread = -0.17;
  o.seatH = pose.activity === 'sit' || pose.activity === 'fish' ? pose.seatH || 0 : null;
  // (at a rowboat's oars, on her thwart)
  if (pose.station && pose.station.kind === 'row' && !A) { o.seatH = shipDims(pose.station.ship.def).row.seatH; o.walkRel = null; }
  o.prop = pose.prop || null;
  // out of a fight, hands hang loose rather than clenched (articulated hands) —
  // but on the oars or the wheel they grip
  o.relaxHands = !A && !pose.combat && !pose.armed && pose.block === undefined && pose.dodge === undefined && pose.state !== 'hurt' && !pose.station;
  return o;
}

