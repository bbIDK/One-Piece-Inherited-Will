// Pose sampling shared by the world characters and the first-person
// viewmodel: the actor's current look and weapon, the 2D rig pose sampled
// exactly as the 2D renderer does, and the 3D rig options for the frame.
import { samplePose, restPose, blendPose } from '../../render/anims.js';

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
  if (pose.blend && pose.blend.P) P = blendPose(pose.blend.P, P, pose.blend.k);
  pose.P = P;
  a._lastP = P; a._lastPose = pose; a._lastLook = look;
  return { pose, P };
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
  o.prop = pose.prop || null;
  // out of a fight, hands hang loose rather than clenched (articulated hands)
  o.relaxHands = !A && !pose.combat && !pose.armed && pose.block === undefined && pose.dodge === undefined && pose.state !== 'hurt';
  return o;
}

