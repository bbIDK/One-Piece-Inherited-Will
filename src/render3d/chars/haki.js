// Armament Haki on a 3D body (the coat itself is the body shader's: mats.js).
// Switched on, the black spreads up from the fingertips — and the toes, for
// a kicker — over COAT.spread seconds, as far as the level reaches (the fists,
// the forearms, the whole arms), a bright ripple riding its edge as it
// hardens; let go (or spent), it falls away quicker than it came. Every
// blow it lands sends the ripple through it again. The sheen on its rim is
// the character's own (game/haki.js).
//
// Observation Haki, from your side: the wills of those who mean you harm,
// within its reach, glowing through walls in your own tint — brighter as
// they wind up a blow at you (senseOf, drawn by model.js sense).
import { armamentReach, COAT, sigOf, senseRange } from '../../game/haki.js';
import { hostile } from '../../game/entity.js';

/**
 * Bring a body's coat (`st`, the view's own memory of it) up to date for
 * this moment and set the body material's uniforms (`u`: mats.js). `legs`:
 * the legs coat too (a kicking style). Returns how far up the arms it is.
 */
export function coatBody(st, a, legs, now, u) {
  const dt = Math.min(0.2, Math.max(0, now - (st.t ?? now)));
  st.t = now;
  const on = !!a.armament;
  const reach = on ? Math.max(0.2, armamentReach((a.hakiLevel && a.hakiLevel('armament')) || 30)) : 0;
  st.arm = step(st.arm || 0, reach, reach, dt);
  st.leg = step(st.leg || 0, legs ? reach : 0, reach, dt);
  // the ripple: bright while the coat climbs, dying away once it's there;
  // and again for a moment with every blow it lands (combat.js: armHitT)
  const climbing = on && (st.arm < reach - 1e-3 || (legs && st.leg < reach - 1e-3));
  st.rip = climbing ? 1 : (st.rip || 0) * Math.exp(-dt * 7);
  const hitAge = now - (a.armHitT ?? -9);
  const hit = on && hitAge >= 0 && hitAge < 0.22 ? 1 - hitAge / 0.22 : 0;
  const rip = Math.max(st.rip, hit);
  u.uHaki.value.set(st.arm, st.arm, st.leg, st.leg);
  u.uHakiRip.value.set(rip, rip, legs ? rip : 0, legs ? rip : 0);
  if (on || st.arm > 0) {
    const sheen = sigOf(a).armament;
    if (st.sheen !== sheen) { st.sheen = sheen; u.uHakiSheen.value.set(sheen); }
  }
  return st.arm;
}

/** Toward `want`: up over COAT.spread (however far it reaches), down over COAT.fall. */
function step(cur, want, reach, dt) {
  if (cur < want) return Math.min(want, cur + dt * Math.max(0.2, reach) / COAT.spread);
  if (cur > want) return Math.max(want, cur - dt * Math.max(0.5, cur) / COAT.fall);
  return cur;
}

/**
 * Does the player's Observation sense `a` just now? Its tint and strength
 * ({ col, k }), or null: someone hostile (or out for you), up and about,
 * within its reach; fading out toward the edge of it, swelling as they wind
 * up a blow at you.
 */
export function senseOf(a, game) {
  const p = game?.player;
  if (!p || !p.observation || a === p || a.isPlayer || !a.alive || a.state !== 'idle' || a.hidden) return null;
  if (!(hostile(p, a) || a.provoked || a.controller?.target === p) || a.faction === 'player') return null;
  const w = game.world, d = w ? w.distance(p.x, p.y, a.x, a.y) : Math.hypot(a.x - p.x, a.y - p.y);
  const R = senseRange(p.hakiLevel('observation'));
  if (d > R) return null;
  const edge = Math.min(1, (R - d) / 3);
  const act = a.action;
  const winding = act && (act.target === p || a.controller?.target === p) && act.t < (act.hitAt ?? act.def?.windup ?? 0.2) ? 1 : 0;
  const now = game.env?.time ?? 0;
  return { col: sigOf(p).observation, k: edge * (0.7 + 0.1 * Math.sin(now * 5 + (a.seed || 0)) + 0.6 * winding) };
}
