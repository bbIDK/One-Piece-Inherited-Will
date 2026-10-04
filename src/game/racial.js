// What each people's body does in a fight, as data/races.js describes it
// (the numbers that are just numbers — health, stride, reach, jump, swim —
// live there; these are the ones that act):
//  * Minks: Electro crackles through every bare blow they land, now and
//    then shocking whoever it hits; and under a full moon, at night, in the
//    open, a Mink in a fight awakens Sulong — the white-furred battle beast
//    — once a night, worn out afterwards.
//  * Lunarians: Ignition, the flame on their back — it halves the harm done
//    to them while it burns (combat.js) and sets light to whoever they
//    strike; the sea or a soaking puts it out, and it lights again a few
//    seconds after they're dry. Their wings fly (flight.js).
//  * Buccaneers: a frame nothing light can shake (no stagger from light
//    blows) and that knockback hardly moves.
//  * Skypieans get more out of a Dial (abilities.js powerFor); a Fish-Man
//    leaving the water at speed leaps like a dolphin (actor.js tryJump).

const SULONG = {
  id: 'sulong', name: 'Sulong', dur: 25, mods: { damage: 1.8, speedMul: 1.35, defMul: 0.8, atkSpeed: 1.2 }, aura: 'rgba(255,255,255,0.95)', look: { furWhite: true },
  after: { id: 'sulong_spent', name: 'Spent', dur: 12, mods: { speedMul: 0.85, atkSpeed: 0.85 } },
};
const RELIGHT = 6; // s dry before a Lunarian's flame lights again

/** A blow `att` landed on `tgt` (not blocked): what their people's body adds to it. */
export function raceHit(att, tgt, h, game) {
  if (!att || !h || tgt.state !== 'idle') return;
  const bare = !h.element || h.element === 'physical';
  const blow = h.vx === undefined && !h.blast;
  if (att.race === 'mink' && bare && blow && h.def?.m1Chain && !att.inWater && Math.random() < 0.3) {
    // (Electro: the fur's charge goes into them)
    tgt.addStatus('shock', 0.5, att);
    game.fx.burst(tgt.x, tgt.y, 5, { color: ['#fff176', '#ffffff'], speed: 3, g: 0, z: 0.9, life: 0.18, kind: 'line', size: 0.05 });
  }
  if (att.race === 'lunarian' && att.flameLit !== false && bare && blow && !att.inWater && Math.random() < 0.25) {
    // (Ignition: the flame catches)
    tgt.addStatus('burn', 2, att);
    game.fx.burst(tgt.x, tgt.y, 6, { color: ['#ff7043', '#ffca28'], speed: 1.5, g: -1, z: 0.9, vz: 1.5, life: 0.4, kind: 'fire', size: 0.16 });
  }
}

/** Each frame: a Lunarian's flame, a Mink under the full moon. */
export function raceTick(a, dt, game) {
  if (a.race === 'lunarian') {
    // the flame goes out in the sea (or soaked through), and lights again once they're dry
    if (a.inWater || a.status?.wet) {
      if (a.flameLit !== false) {
        a.flameLit = false;
        game.fx.burst(a.x, a.y, 8, { color: ['#eceff1', '#cfd8dc'], speed: 1.2, g: -1, z: 1.4, vz: 1, life: 0.6, kind: 'smoke', size: 0.25 });
        if (a.isPlayer) game.log('Your flame goes out — nothing shields you now.', '#90a4ae');
      }
      a.relightT = RELIGHT;
    } else if (a.flameLit === false) {
      a.relightT = (a.relightT ?? RELIGHT) - dt;
      if (a.relightT <= 0) {
        a.flameLit = true;
        game.fx.burst(a.x, a.y, 10, { color: ['#ff7043', '#ffca28', '#ffffff'], speed: 2, g: -1.5, z: 1.4, vz: 2, life: 0.6, kind: 'fire', size: 0.2 });
        if (a.isPlayer) game.log('Your flame lights again.', '#ffab91');
      }
    }
  }
  if (a.race === 'mink') sulongCheck(a, game);
}

/** A Mink in a fight, out under the full moon at night: Sulong — once a night. */
function sulongCheck(a, game) {
  const env = game.env;
  if (!env?.fullMoon || !env.isNight || a.state !== 'idle' || a.hasBuff('sulong') || a.hasBuff('sulong_spent')) return;
  if (a.sulongNight === env.day) return;
  const w = game.world;
  if (w.zone === 2 || w.zone === 3 || w.interiorAt?.(a.x, a.y) || a.inWater) return;
  const fighting = a.isPlayer ? !!a.inCombat : !!a.controller?.target;
  if (!fighting) return;
  a.sulongNight = env.day;
  a.addBuff({ ...SULONG, source: 'race:mink' });
  game.fx.ring(a.x, a.y, 0.3, 3, '#ffffff', 0.6, 0.2, { add: true });
  game.fx.callout(a.x, a.y - 2.2, 'SULONG!', '#ffffff', 0.5, { life: 1.2 });
  game.fx.flashScreen?.(0.15, 'rgba(255,255,255,1)');
  if (a.isPlayer) game.log('You look up at the full moon... your blood boils. SULONG!', '#ffffff');
}

/** Can a light blow stagger `a`? (Buccaneers, like bosses, shrug it off) */
export const unshakable = (a) => !!a.poise || a.race === 'buccaneer';
/** How far knockback moves `a` (×): a Buccaneer's frame hardly shifts. */
export const kbFrame = (a) => (a.race === 'buccaneer' ? 0.7 : 1);
