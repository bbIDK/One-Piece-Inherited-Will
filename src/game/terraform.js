// What a Devil Fruit's technique does to the ground under it — for a while
// (world/deform.js: it settles back). Whitebeard's quake grabs the air and
// tilts the island and the sea with it; a quake punch splits the ground; a
// meteor, a gravity press, a black hole, a lightning bolt leave a crater;
// sand sinks into a pit; Takt and Rubble Rise heave the ground up.
//
// at: 'self' (where you stand), 'target' (where it lands), 'ahead' (`dist`
// metres in front); ang: the tilt's (or the split's) direction — 'facing',
// 'side' (rolled across you), or 'back'; the rest as world/deform.js.
import { addDeform } from '../world/deform.js';
import { techScale } from './abilities.js';

export const TERRAFORM = {
  // Gura Gura: the land and the sea rock and split
  gura_punch: { kind: 'trench', at: 'self', ang: 'facing', r: 7, amp: 0.9, w: 0.55, hold: 2.5, fall: 2 },
  gura_kaishin: { kind: 'tilt', at: 'self', ang: 'facing', r: 34, amp: 5, wob: 0.18, rise: 0.6, hold: 4, fall: 4 },
  gura_wave: { kind: 'trench', at: 'self', ang: 'facing', r: 15, amp: 1.8, w: 1.2, wob: 0.15, hold: 3.5, fall: 2.5 },
  gura_tsunami: { kind: 'tilt', at: 'ahead', dist: 14, ang: 'back', r: 42, amp: 6, wob: 0.2, rise: 0.9, hold: 5, fall: 5 },
  gura_tilt: { kind: 'tilt', at: 'self', ang: 'side', r: 55, amp: 10, wob: 0.12, rise: 1.1, hold: 5, fall: 5 },
  gura_kabutowari: { kind: 'crater', at: 'self', r: 9, amp: 2.4, wob: 0.2, rise: 0.25, hold: 5, fall: 4 },
  // gravity: pressed into craters, rubble heaved up
  zushi_press: { kind: 'crater', at: 'target', r: 4, amp: 1.1, rise: 0.2, hold: 3, fall: 2 },
  zushi_meteor: { kind: 'crater', at: 'target', delay: 1.1, r: 9, amp: 3.5, rise: 0.15, hold: 8, fall: 5 },
  zushi_lift: { kind: 'rise', at: 'target', r: 5, amp: 2.4, rise: 0.6, hold: 4, fall: 2.5 },
  // darkness: the ground swallowed
  yami_blackhole: { kind: 'crater', at: 'target', r: 6, amp: 2.4, rise: 0.8, hold: 5, fall: 3 },
  yami_abyss: { kind: 'crater', at: 'target', r: 8, amp: 3, rise: 0.8, hold: 5, fall: 3 },
  // magma: the ground heaves and is blasted
  magu_bakuretsu: { kind: 'rise', at: 'self', r: 7, amp: 2, wob: 0.15, rise: 0.4, hold: 4, fall: 3 },
  magu_ryusei: { kind: 'crater', at: 'target', delay: 0.9, r: 6, amp: 1.6, rise: 0.2, hold: 6, fall: 4 },
  // sand: the ground dried to dust and sinking
  suna_dry: { kind: 'crater', at: 'self', r: 10, amp: 2, rise: 1.2, hold: 6, fall: 4 },
  suna_girasole: { kind: 'crater', at: 'target', r: 7, amp: 3, rise: 1, hold: 5, fall: 3 },
  // lightning, fire from the sky: blasted craters
  goro_elthor: { kind: 'crater', at: 'target', r: 3.5, amp: 1.1, rise: 0.1, hold: 5, fall: 3 },
  goro_raigo: { kind: 'crater', at: 'target', r: 9, amp: 2.6, rise: 0.15, hold: 8, fall: 5 },
  mera_entei: { kind: 'crater', at: 'target', delay: 1.1, r: 5, amp: 1.5, rise: 0.2, hold: 5, fall: 3 },
  // the ground made soft and heaving, or lifted by the surgeon
  mochi_shirotsuki: { kind: 'rise', at: 'self', r: 6, amp: 0.9, wob: 0.25, rise: 0.5, hold: 3, fall: 2 },
  ope_takt: { kind: 'rise', at: 'target', r: 4, amp: 3, rise: 0.5, hold: 3, fall: 2 },
};

/**
 * Technique `a` (an actor's action) has just struck: its mark on the ground,
 * if it leaves one. It grows with the move (abilities.js techScale: mastery,
 * Haki, the awakened form) — wider, deeper — and the bigger it is the longer
 * the ground takes to settle. What it heaves or splits, the town on it takes
 * too (game/destruction.js). Whitebeard's Sky Tilt, awakened at full mastery,
 * is Marineford: the whole island and the sea round it tilted like a deck,
 * every building on it brought down.
 */
export function terraform(actor, a, ang, game) {
  const T = TERRAFORM[a.def.id] || (a.def.base && TERRAFORM[a.def.base]);
  if (!T || actor.inWater || actor.onShip || actor.deck) return null;
  let x = actor.x, y = actor.y;
  const f = a.scale ?? techScale(actor, a.def);
  if (T.at === 'target' && a.tx !== undefined) { x = a.tx; y = a.ty; }
  else if (T.at === 'ahead') { x = actor.x + Math.cos(ang) * (T.dist || 8) * f; y = actor.y + Math.sin(ang) * (T.dist || 8) * f; }
  const dir = T.ang === 'side' ? ang + Math.PI / 2 : T.ang === 'back' ? ang + Math.PI : ang;
  let r = T.r * f, amp = T.amp * Math.min(f, 3.5), hold = T.hold * (2 + f), fall = T.fall * (1.5 + f * 0.5);
  const w = game.world;
  const isl = T.kind === 'tilt' ? w?.islandAt?.(x, y) || w?.nearestIsland?.(x, y, 80) : null;
  const marineford = a.def.id === 'gura_tilt' && (actor.fruitMastery || 0) >= 100 && actor.buffs?.some((b) => b.form === 'awake') && isl;
  if (marineford) {
    // the island's whole breadth and a sea's width beyond it, rocked a good 15°
    const b = isl.bbox;
    r = Math.max(r, Math.hypot(b.hw, (b.y1 - b.y0) / 2) * 1.5 + 30);
    amp = r * 0.3;
    hold = 45; fall = 18;
  }
  const d = addDeform({ ...T, r, amp, hold, fall, x: w?.wx ? w.wx(x) : x, y, ang: dir });
  // what it moves of the town comes down with it
  const D = game.destruction;
  if (D && (actor.isPlayer || actor.summonedBy?.isPlayer)) {
    if (marineford) {
      const n = D.levelAll(x, y, r, 6000, actor, 30);
      if (n && actor.isPlayer) game.log?.(`The whole island tilts! ${n} buildings come down.`, '#ffcc80');
      game.fx?.pressure?.(4, '#9fd9ef', 0.6);
      game.fx?.shake?.(1.6);
    } else {
      // (a tilt rocks everything on it, hardest at its rising edge; a crater or a split wrecks what's over it)
      const reach = T.kind === 'tilt' ? r * 0.75 : T.kind === 'trench' ? r : r * 0.9;
      const power = amp * 90 * f;
      if (T.kind === 'trench') for (let t = 0; t <= r; t += 3) D.strike(x + Math.cos(dir) * t, y + Math.sin(dir) * t, T.w * f + 2, power, actor);
      else D.strike(x, y, reach, power, actor);
    }
  }
  return d;
}
