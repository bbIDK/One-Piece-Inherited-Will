// What fighting with a Devil Fruit opens up: its forms and its awakening —
// and how each fruit fights hand to hand (its M1 and heavy).
//
// A fruit's base techniques (data/fruits.js `techniques`) are all yours the
// moment you eat it, as in the anime: a new user can already do most of what
// the fruit does. Fighting with it (fruit mastery, 0-100) opens the rest:
//
//  * forms — transformations and modes, each a hotbar entry once its mastery
//    is reached (Gum-Gum's Gear Second, Third and Fourth; Amaru; Monster
//    Point; the Azure Dragon). Taking one out plays its `activate` technique,
//    whose buff carries `form: <id>`: while that buff lasts the form's own
//    skills are on the skill keys (or the base ones, if it has none of its
//    own), with its own M1 and heavy. Most run out (`dur`), and some leave
//    you spent afterwards (`after`).
//  * the awakening — at full mastery, the next time a hard fight brings you
//    to your knees (or close), the fruit awakens (progression.js
//    maybeAwakenFruit). From then on its awakened set is a hotbar entry of its
//    own, switched on and off at will (a buff with `form: 'awake'` that
//    doesn't run out): every move bigger, stronger and faster, with its own
//    look, and the iconic fruits' own awakened techniques.
//
// Adding a move: write it as any technique (game/abilities.js primitives) in
// a form's or the awakening's `skills` — a def is registered here as this
// fruit's — or reuse one by id. `awaken(id, {...})` makes the awakened version
// of a base technique (scaled by AW, keeping its look: `base` points the
// icons, clips and effects back at the original). A fruit with no awakening
// written gets one made from its base set. See docs/CONTENT_GUIDE.md §14.
import { registerAbilities, getAbility } from '../game/abilities.js';

/** How much bigger, stronger and faster an awakened move is than its base. */
export const AW = { dmg: 1.6, size: 1.35, reach: 1.25, kb: 1.25, cd: 0.75, wind: 0.85, dur: 1.25 };
/** Fruit mastery that makes a fruit ready to awaken (then a moment in battle does it). */
export const AWAKEN_MASTERY = 100;

const r1 = (v) => Math.round(v * 10) / 10;
/** A '#rrggbb' colour at alpha `a` (an aura's strength is its alpha). */
const rgba = (hex, a) => (/^#[0-9a-f]{6}$/i.test(hex || '') ? `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})` : hex);
const scaleMods = (m, k) => {
  if (!m) return m;
  const o = { ...m };
  for (const key of ['damage', 'speedMul', 'atkSpeed']) if (o[key] > 1) o[key] = r1(1 + (o[key] - 1) * 1.4);
  if (o.defMul < 1) o.defMul = Math.max(0.2, r1(1 - (1 - o.defMul) * 1.3));
  if (o.evade) o.evade = Math.min(0.9, r1(o.evade * 1.3));
  return o;
};
function scaleStep(s, k) {
  const o = { ...s };
  if (s.at !== undefined) o.at = r1(s.at * k.wind * 100) / 100;
  if (s.hit) {
    const h = { ...s.hit };
    h.damage = Math.round((h.damage || 5) * k.dmg);
    h.range = r1((h.range || 1.4) * k.size);
    if (h.width) h.width = r1(h.width * k.size);
    if (h.knockback !== undefined) h.knockback = r1(h.knockback * k.kb);
    if (h.shake) h.shake = r1(h.shake * 1.3);
    if (h.shipDamage) h.shipDamage = Math.round(h.shipDamage * k.dmg);
    o.hit = h;
  }
  if (s.proj) {
    const p = { ...s.proj };
    p.damage = Math.round((p.damage || 5) * k.dmg);
    p.radius = r1((p.radius ?? 0.3) * k.size * 100) / 100;
    p.size = r1((p.size ?? 1) * k.size);
    p.range = r1((p.range ?? 10) * k.reach);
    p.speed = r1((p.speed ?? 14) * 1.1);
    if (p.knockback !== undefined) p.knockback = r1(p.knockback * k.kb);
    if (p.count > 1) p.count += Math.max(1, Math.round(p.count * 0.4));
    if (p.explode) p.explode = { ...p.explode, range: r1((p.explode.range || 1.8) * k.size), damage: Math.round((p.explode.damage || 10) * k.dmg) };
    if (p.shipDamage) p.shipDamage = Math.round(p.shipDamage * k.dmg);
    o.proj = p;
  }
  if (s.dash) {
    const d = { ...s.dash, dist: r1(s.dash.dist * k.reach) };
    if (d.hit) d.hit = { ...d.hit, damage: Math.round((d.hit.damage || 5) * k.dmg), range: r1((d.hit.range || 1.1) * k.size), knockback: r1((d.hit.knockback ?? 4) * k.kb) };
    o.dash = d;
  }
  if (s.zone) o.zone = { ...s.zone, range: r1(s.zone.range * k.size), damage: Math.round((s.zone.damage || 0) * k.dmg), duration: r1(s.zone.duration * k.dur) };
  if (s.buff) o.buff = { ...s.buff, dur: s.buff.dur ? r1(s.buff.dur * k.dur) : s.buff.dur, mods: scaleMods(s.buff.mods, k), reflect: s.buff.reflect ? r1(s.buff.reflect * k.size) : s.buff.reflect, regen: s.buff.regen ? r1(s.buff.regen * 1.4) : s.buff.regen };
  if (s.heal) o.heal = Math.round(s.heal * 1.5);
  if (s.teleport) o.teleport = { ...s.teleport, dist: r1(s.teleport.dist * k.reach) };
  if (s.pull) o.pull = { ...s.pull, range: r1(s.pull.range * k.size), strength: r1(s.pull.strength * 1.2) };
  if (s.power) o.power = { ...s.power, ...(s.power.damage ? { damage: Math.round(s.power.damage * k.dmg) } : {}), ...(s.power.range ? { range: r1(s.power.range * k.size) } : {}), ...(s.power.h ? { h: r1(s.power.h * 1.2) } : {}), ...(s.power.cap ? { cap: Math.round(s.power.cap * k.dmg) } : {}) };
  if (s.fx) o.fx = { ...s.fx, ...(s.fx.ring ? { ring: r1(s.fx.ring * k.size) } : {}), ...(s.fx.burst ? { burst: Math.round(s.fx.burst * 1.5) } : {}) };
  if (s.summon) o.summon = { ...s.summon, duration: r1((s.summon.duration || 15) * k.dur), hpMul: r1((s.summon.hpMul ?? 1) * 1.5) };
  if (s.self?.hurt) o.self = { ...s.self, hurt: r1(s.self.hurt * 0.7 * 100) / 100 };
  return o;
}

/**
 * The awakened version of technique `d`: every blow, shot, field and form of
 * it scaled by AW (or `o.k`), quicker to wind up and to come round again —
 * under its own id (`<id>_aw` unless `o.id`) and name, pointing back at the
 * original (`base`) for its icon, its clip and its effects.
 */
export function awakenDef(d, o = {}) {
  const k = { ...AW, ...(o.k || {}) };
  const steps = (d.steps || []).map((s) => scaleStep(s, k));
  const out = {
    ...d, ...o, k: undefined, id: o.id || d.id + '_aw', name: o.name || `Awakened ${d.name}`, base: d.base || d.id, awakened: true, steps,
    windup: d.windup !== undefined ? r1(d.windup * k.wind * 100) / 100 : d.windup, recover: d.recover !== undefined ? r1(d.recover * k.wind * 100) / 100 : d.recover,
    cd: d.cd ? r1(d.cd * k.cd) : d.cd, desc: o.desc || `${d.desc ? d.desc + ' ' : ''}Awakened: bigger, stronger, faster.`,
  };
  delete out.k; delete out.mastery;
  if (d.flight) out.flight = { ...d.flight, gauge: r1(d.flight.gauge * 1.5), speed: r1(d.flight.speed * 1.2), climb: r1((d.flight.climb || 6) * 1.2) };
  return out;
}
/** In a set: the awakened version of base technique `id` (made once the fruit's base is known). */
export const awaken = (id, o = {}) => ({ awaken: id, ...o });

// ------------------------------------------------------------------ Gum-Gum
// Gear Second: blood pumped at speed — faster and stronger, every move a
// Jet; steam pours off you, and when it wears off you're spent a moment.
const GEAR2 = {
  id: 'gear2', name: 'Gear Second', short: 'Gear 2', mastery: 25, activate: 'gomu_gear2',
  desc: 'Pump your blood at high speed: faster and stronger, every move a Jet. You\'re spent for a moment when it wears off.',
  heavy: { id: 'gomu_jet_whip', name: 'Jet Whip', anim: 'sweep', windup: 0.14, recover: 0.28, cd: 1.3, desc: 'A leg whipped round faster than the eye can follow.',
    steps: [{ hit: { shape: 'arc', range: 3.4, arc: 2.0, offset: 0.2, damage: 16, knockback: 7, stun: 0.4, heavy: true, guardBreak: true } }] },
  skills: [
    { id: 'gomu_jet_pistol', name: 'Jet Pistol', icon: '👊', anim: 'punch', windup: 0.06, recover: 0.18, cd: 1.6, say: 'Jet Pistol!', desc: 'A Pistol too fast to see coming.',
      steps: [{ proj: { speed: 42, range: 10, radius: 0.4, damage: 20, sprite: 'gomufist', stretch: true, knockback: 6, stun: 0.35 } }] },
    { id: 'gomu_jet_gatling', name: 'Jet Gatling', icon: '🔫', anim: 'punch', windup: 0.12, recover: 0.25, cd: 5, say: 'Jet Gatling!', desc: 'A Gatling at Jet speed: a wall of fists.',
      steps: [{ hit: { shape: 'arc', range: 3.6, arc: 1.0, offset: 0.3, damage: 5, knockback: 1, stun: 0.12, duration: 1.0, interval: 0.05 } }] },
    { id: 'gomu_jet_rocket', name: 'Jet Rocket', icon: '🚀', anim: 'thrust', windup: 0.1, recover: 0.15, cd: 3, desc: 'Slingshot yourself at a blur.',
      steps: [{ dash: { dist: 12, time: 0.25, iframes: 0.25, air: true, hit: { damage: 20, knockback: 7, stun: 0.4 } } }] },
    { id: 'gomu_jet_bazooka', name: 'Jet Bazooka', icon: '💥', anim: 'heavy', windup: 0.22, recover: 0.3, cd: 6, say: 'Jet Bazooka!', desc: 'Both palms, at Jet speed.',
      steps: [{ hit: { shape: 'arc', range: 2.8, arc: 1.2, offset: 0.4, damage: 44, knockback: 16, stun: 0.8, heavy: true, guardBreak: true, impactFrame: true, hitShips: true } }] },
    { id: 'gomu_jet_spear', name: 'Jet Spear', anim: 'kick_high', windup: 0.15, recover: 0.3, cd: 4, say: 'Jet Spear!', desc: 'Both feet driven out like a spearhead, at Jet speed.',
      steps: [{ hit: { shape: 'line', range: 4.5, width: 1.0, damage: 30, knockback: 8, stun: 0.5, heavy: true } }] },
  ],
};
// Gear Third: bone balloon — a limb blown up to a giant's, and swung.
const GEAR3 = {
  id: 'gear3', name: 'Gear Third', short: 'Gear 3', mastery: 45,
  desc: 'Blow air into your bones: giant limbs — Gigant Pistol, Elephant Gatling, Gigant Axe. A little slower, a lot heavier.',
  activate: { id: 'gomu_gear3_on', name: 'Gear Third', icon: '🦴', anim: 'flex', windup: 0.35, recover: 0.2, cd: 20, say: 'Gear... Third!', desc: 'Bite your thumb and blow: your bones swell like balloons.',
    steps: [{ fx: { burst: 16, color: '#ffe0b2', kind: 'smoke' } }, { at: 0.35, buff: { id: 'gear3', form: 'gear3', name: 'Gear Third', dur: 25, mods: { damage: 1.1, speedMul: 0.92 }, aura: 'rgba(255,224,178,0.45)' } }] },
  m1: { dmg: 1.3, reach: 1.35 },
  heavy: { id: 'gomu_gigant_stamp', name: 'Gigant Stamp', anim: 'kick_high', windup: 0.4, recover: 0.4, cd: 2.4, desc: 'A giant\'s sole driven straight out.',
    steps: [{ hit: { shape: 'line', range: 4.5, width: 1.8, damage: 36, knockback: 12, stun: 0.6, heavy: true, guardBreak: true, shake: 0.4 } }] },
  skills: [
    { id: 'gomu_gigant_pistol', name: 'Gigant Pistol', icon: '🦴', anim: 'punch', clip: 'gigant', windup: 0.55, recover: 0.45, cd: 6, say: 'Gigant Pistol!', desc: 'A fist as big as a house, flung on its rubber.',
      steps: [{ proj: { speed: 17, range: 11, radius: 1.6, damage: 60, sprite: 'gomufist', size: 4, stretch: true, pierce: true, knockback: 14, stun: 1, heavy: true, hitShips: true, shipDamage: 200 } }] },
    { id: 'gomu_elephant_gatling', name: 'Elephant Gatling', icon: '🐘', anim: 'punch', windup: 0.4, recover: 0.4, cd: 9, say: 'Elephant Gatling!', desc: 'A barrage of giant fists.',
      steps: [{ hit: { shape: 'arc', range: 4.6, arc: 1.2, offset: 0.4, damage: 13, knockback: 3, stun: 0.3, duration: 1.0, interval: 0.1, heavy: true } }] },
    { id: 'gomu_gigant_axe', name: 'Gigant Axe', anim: 'axe_kick', windup: 0.5, recover: 0.45, cd: 8, say: 'Gigant Axe!', desc: 'Leap and bring a giant heel down like an axe: the ground caves in.',
      steps: [{ dash: { dist: 2.5, time: 0.2, iframes: 0.2 } }, { at: 0.62, hit: { shape: 'circle', range: 3.4, damage: 70, knockback: 12, stun: 0.9, heavy: true, guardBreak: true, launch: 4, impactFrame: true, shake: 0.6 }, vfx: 'ring' }] },
    { id: 'gomu_gigant_bazooka', name: 'Gigant Bazooka', icon: '💥', anim: 'heavy', windup: 0.6, recover: 0.45, cd: 11, say: 'Gigant Bazooka!', desc: 'Two giant palms.',
      steps: [{ hit: { shape: 'arc', range: 3.8, arc: 1.3, offset: 0.5, damage: 95, knockback: 20, stun: 1, heavy: true, guardBreak: true, impactFrame: true, shake: 0.7, hitShips: true, shipDamage: 250 } }] },
    { id: 'gomu_gigant_balloon', name: 'Gigant Balloon', anim: 'flex', windup: 0.25, recover: 0.3, cd: 12, say: 'Gigant Balloon!', desc: 'Blow yourself up huge: shots bounce away, and whoever is pressed against you is thrown off.',
      steps: [{ buff: { id: 'balloon', name: 'Gigant Balloon', dur: 2.6, mods: { speedMul: 0.3 }, reflect: 3.2, reflectWord: 'BOING!', look: { bulk: 2.6 } } }, { at: 0.3, hit: { shape: 'circle', range: 2.6, damage: 24, knockback: 12, stun: 0.5 }, vfx: 'ring' }] },
  ],
};
// Gear Fourth: Boundman — muscles blown up and coated in Haki, bouncing like
// a ball; every blow a cannon. It burns Haki, runs out, and leaves you spent.
const GEAR4 = {
  id: 'gear4', name: 'Gear Fourth', short: 'Gear 4', mastery: 70, needs: 'armament', activate: 'gomu_gear4',
  desc: 'Boundman: Haki-hardened muscles blown up like a ball — Kong Gun, Rhino Schneider, Culverin, Leo Bazooka. It runs out, and leaves you exhausted.',
  m1: { dmg: 1.4, reach: 1.3 },
  heavy: { id: 'gomu_leo_bazooka', name: 'Leo Bazooka', anim: 'heavy', windup: 0.35, recover: 0.4, cd: 2.2, say: 'Leo Bazooka!', desc: 'Both fists pulled back into the arms, then fired point-blank.',
    steps: [{ hit: { shape: 'arc', range: 2.8, arc: 1.2, offset: 0.4, damage: 30, knockback: 20, stun: 0.9, heavy: true, guardBreak: true, impactFrame: true } }] },
  skills: [
    { id: 'gomu_kong_gun', name: 'Kong Gun', icon: '🦍', anim: 'punch', windup: 0.35, recover: 0.35, cd: 3, say: 'Kong Gun!', desc: 'A fist pulled back into the swollen arm, then fired like a cannon.',
      steps: [{ proj: { speed: 30, range: 12, radius: 1.0, damage: 34, sprite: 'gomufist', size: 3, stretch: true, knockback: 14, stun: 0.7, heavy: true, guardBreak: true, hitShips: true } }] },
    { id: 'gomu_kong_organ', name: 'Kong Organ', anim: 'punch', windup: 0.45, recover: 0.45, cd: 8, say: 'Kong Organ!', desc: 'Kong Guns, one after another, like the pipes of an organ.',
      steps: [{ hit: { shape: 'arc', range: 5, arc: 1.1, offset: 0.4, damage: 18, knockback: 6, stun: 0.35, duration: 0.9, interval: 0.15, heavy: true } }] },
    { id: 'gomu_rhino_schneider', name: 'Rhino Schneider', anim: 'thrust', windup: 0.3, recover: 0.4, cd: 5, say: 'Rhino Schneider!', desc: 'Bounce off the ground and ram both feet through the target.',
      steps: [{ dash: { dist: 13, time: 0.3, iframes: 0.3, hit: { damage: 40, knockback: 18, stun: 0.8, heavy: true, guardBreak: true, launch: 4 } } }] },
    { id: 'gomu_culverin', name: 'Culverin', anim: 'punch', windup: 0.3, recover: 0.35, cd: 6, say: 'Culverin!', desc: 'A punch that bends round after its target.',
      steps: [{ proj: { speed: 22, range: 16, radius: 0.9, damage: 38, sprite: 'gomufist', size: 2.2, stretch: true, homing: 5, knockback: 12, stun: 0.6, heavy: true } }] },
    { id: 'gomu_king_kong_gun', name: 'King Kong Gun', icon: '🦍', anim: 'punch', clip: 'gigant', windup: 1.3, recover: 0.6, cd: 30, say: 'King Kong Gun!', desc: 'A whole arm swollen into a giant\'s fist and fired at everything in front of you.',
      steps: [{ fx: { ring: 3, color: '#b71c1c', impact: 0.06 } }, { at: 1.3, proj: { speed: 18, range: 15, radius: 2.4, damage: 120, sprite: 'gomufist', size: 7, stretch: true, pierce: true, knockback: 26, stun: 1.4, heavy: true, guardBreak: true, hitShips: true, shipDamage: 600 } }, { at: 1.35, fx: { shake: 0.8, impact: 0.12 } }] },
  ],
};
// Gear Fifth: the fruit's awakening (Hito Hito no Mi, Model: Nika) — a body
// as free as a cartoon: everything giant, everything a joke, nothing held back.
const GEAR5 = {
  name: 'Gear Fifth', short: 'Gear 5', desc: 'Awakening: the warrior of liberation. Your body as free as your imagination — Dawn Pistol, Dawn Gatling, Gomu Gomu no Kaminari, Bajrang Gun.',
  activate: { id: 'gomu_awaken', name: 'Gear Fifth', icon: '☀', anim: 'cast', windup: 0.9, recover: 0.2, cd: 6, say: '...Drums of Liberation.', desc: 'Your heartbeat drums: Gear Fifth.',
    steps: [{ fx: { ring: 6, color: '#ffffff', flash: 0.5, impact: 0.15, text: 'GEAR 5' } }, { at: 0.9, buff: { id: 'gear5', form: 'awake', name: 'Gear Fifth', dur: Infinity, mods: { damage: 1.3, defMul: 0.8, speedMul: 1.3, atkSpeed: 1.25 }, aura: 'rgba(255,255,255,1)', look: { hairColor: '#ffffff', top: '#ffffff', bottom: '#ffffff', nika: true } } }] },
  m1: { dmg: 1.5, reach: 1.7 },
  heavy: { id: 'gomu_dawn_whip', name: 'Dawn Whip', anim: 'sweep', windup: 0.2, recover: 0.35, cd: 1.8, desc: 'A leg stretched across the whole field and swept.',
    steps: [{ hit: { shape: 'arc', range: 4.6, arc: 2.4, offset: 0.2, damage: 30, knockback: 18, stun: 0.6, heavy: true, guardBreak: true } }] },
  skills: [
    { id: 'gomu_dawn_pistol', name: 'Dawn Pistol', icon: '👊', anim: 'punch', windup: 0.2, recover: 0.3, cd: 2.2, say: 'Dawn Pistol!', desc: 'A cartoon-giant fist.',
      steps: [{ proj: { speed: 34, range: 14, radius: 1.3, damage: 60, sprite: 'gomufist', size: 3.2, stretch: true, knockback: 16, stun: 0.7, heavy: true, guardBreak: true, hitShips: true } }] },
    { id: 'gomu_dawn_gatling', name: 'Dawn Gatling', icon: '🔫', anim: 'punch', windup: 0.25, recover: 0.35, cd: 6, say: 'Dawn Gatling!', desc: 'Giant fists from everywhere at once.',
      steps: [{ hit: { shape: 'arc', range: 5.5, arc: 1.3, offset: 0.4, damage: 12, knockback: 3, stun: 0.2, duration: 1.2, interval: 0.07, heavy: true } }] },
    { id: 'gomu_dawn_rocket', name: 'Dawn Rocket', icon: '🚀', anim: 'thrust', windup: 0.15, recover: 0.2, cd: 3.5, say: 'Dawn Rocket!', desc: 'Fling yourself like a toy, headfirst through them.',
      steps: [{ dash: { dist: 16, time: 0.32, iframes: 0.3, air: true, hit: { damage: 46, knockback: 14, stun: 0.6, launch: 5 } } }] },
    { id: 'gomu_kaminari', name: 'Gomu Gomu no Kaminari', icon: '⚡', anim: 'raise', windup: 0.6, recover: 0.4, cd: 12, say: 'Gomu Gomu no... Kaminari!', desc: 'Grab a bolt of lightning out of the sky like a rope and hurl it.',
      steps: [{ proj: { speed: 34, range: 18, radius: 1.0, damage: 70, sprite: 'thunder', size: 2.4, element: 'lightning', pierce: true, status: { shock: 1.5 }, knockback: 10, stun: 0.8, hitShips: true } }] },
    { id: 'gomu_bajrang_gun', name: 'Bajrang Gun', icon: '☀', anim: 'punch', clip: 'gigant', windup: 1.4, recover: 0.6, cd: 40, say: 'Gomu Gomu no... BAJRANG GUN!', desc: 'A fist the size of an island.',
      steps: [{ fx: { ring: 5, color: '#ffffff', impact: 0.08 } }, { at: 1.4, proj: { speed: 15, range: 17, radius: 3, damage: 180, sprite: 'gomufist', size: 9, stretch: true, pierce: true, knockback: 30, stun: 1.6, heavy: true, guardBreak: true, hitShips: true, shipDamage: 800 } }, { at: 1.45, fx: { shake: 1, impact: 0.15 } }] },
  ],
};

// ------------------------------------------------------------------ the kits
/**
 * Per fruit: `heavy` (its own heavy blow — an id, or a def; while it cools
 * down your fists' heavy stands in), `m1` (how its basic attacks differ from
 * your fists': `element`, `status`, `dmg` and `reach` multipliers), `forms`,
 * and `awakening` ({ name, desc, activate, skills, heavy, m1, look, aura }).
 */
export const KITS = {
  gomu: {
    m1: { reach: 1.5 },
    heavy: { id: 'gomu_whip', name: 'Gum-Gum Whip', anim: 'sweep', windup: 0.18, recover: 0.32, cd: 1.5, desc: 'A rubber leg stretched out and swept round.',
      steps: [{ hit: { shape: 'arc', range: 3.2, arc: 1.8, offset: 0.2, damage: 13, knockback: 6, stun: 0.4, heavy: true, guardBreak: true } }] },
    forms: [GEAR2, GEAR3, GEAR4],
    awakening: GEAR5,
  },
  gura: { m1: { element: 'quake', dmg: 1.1 }, awakening: { name: 'Awakened Quakes', extra: [
    { id: 'gura_kabutowari', name: 'Kabutowari', icon: '✊', anim: 'quake', windup: 0.5, recover: 0.45, cd: 14, desc: 'Helmet Splitter: a quake bubble driven straight down — the ground for a long way round heaves and splits.',
      steps: [{ hit: { shape: 'circle', range: 7, damage: 110, knockback: 16, stun: 1.2, element: 'quake', heavy: true, unblockable: true, launch: 7, impactFrame: true, shake: 1.2, hitShips: true, shipDamage: 400 }, vfx: 'ring' }] },
  ] } },
  // Ope Ope: the surgeon fights hand to hand with a shock in the palm. Awakened,
  // the ROOM goes where the surgeon goes (room.js roomFollows): no need to stay in it.
  ope: {
    heavy: 'ope_counter',
    awakening: {
      name: 'K-ROOM', desc: 'Awakening: your ROOM goes where you go — always in it, always the surgeon. Radio Knife, Shock Wille, Puncture Wille.',
      skills: [
        awaken('ope_room', { name: 'ROOM', desc: 'Open a ROOM — awakened, it goes where you go, so you are always in it.', k: { dur: 1.3 } }),
        awaken('ope_shambles', { name: 'Shambles', desc: 'Change places with anyone in your ROOM — awakened, it goes where you go.' }),
        awaken('ope_radio', { name: 'Radio Knife' }),
        'ope_shockwille',
        { id: 'ope_puncture_wille', name: 'K-Room: Puncture Wille', icon: '💙', anim: 'thrust', windup: 0.6, recover: 0.5, cd: 30, say: 'K-Room... Puncture Wille!', desc: 'A ROOM coated on your blade, driven through the target: a shockwave that pierces everything behind them.',
          steps: [{ hit: { shape: 'line', range: 9, width: 2.4, damage: 160, knockback: 20, stun: 1.4, unblockable: true, heavy: true, impactFrame: true, shake: 1, hitShips: true, shipDamage: 500 }, vfx: 'beam', color: '#81d4fa' }] },
      ],
      heavy: awaken('ope_injection', { name: 'Injection Shot', k: { cd: 0.3 } }),
    },
  },
  ito: { m1: { element: 'string', status: { bleed: 1.5 } }, awakening: { name: 'Awakened Strings', extra: [
    { id: 'ito_nami_shiraito', name: 'Nami Shiraito', icon: '🧵', anim: 'spread', windup: 0.5, recover: 0.4, cd: 12, desc: 'Awakened: the very ground turns to strings and rolls at them in waves.',
      steps: [{ hit: { shape: 'line', range: 12, width: 3.2, damage: 55, knockback: 9, stun: 0.9, slashing: true, element: 'string' }, vfx: 'beam', color: '#f8bbd0' }, { zone: { range: 3, duration: 3, interval: 0.5, damage: 8, color: '#f8bbd0', atTarget: true, kind: 'field', slow: 0.4 } }] },
  ] } },
  mochi: { m1: { dmg: 1.1, reach: 1.25 } },
  // (fists that fly off on their own, arms that sprout out of anything: a longer reach)
  bara: { m1: { reach: 1.4 } },
  hana: { m1: { reach: 1.3 } },
  // (a Zoan's beast in every blow)
  neko_leopard: { m1: { dmg: 1.2 } },
  doku: { m1: { element: 'poison', status: { poison: 2 } } },
  bomu: { m1: { element: 'explosion', dmg: 1.1 } },
  // the Logia: their own stuff in every blow
  mera: { m1: { element: 'fire', status: { burn: 1.5 } }, awakening: { name: 'Awakened Flames', skills: [
    awaken('mera_hiken'),
    { id: 'mera_jujika', name: 'Jujika', icon: '✝', anim: 'cast', windup: 0.3, recover: 0.35, cd: 7, say: 'Jujika!', desc: 'Fire Cross: a cross of flame shot from crossed fingers.',
      steps: [{ proj: { speed: 22, range: 14, radius: 1.1, damage: 48, sprite: 'fireball', size: 2.2, element: 'fire', pierce: true, status: { burn: 3 }, knockback: 8, trail: { color: ['#ff7043', '#ffca28'] } } }] },
    { id: 'mera_shiranui', name: 'Shinka: Shiranui', anim: 'thrust', windup: 0.35, recover: 0.35, cd: 9, say: 'Shinka... Shiranui!', desc: 'Divine Fire: two spears of flame thrown side by side.',
      steps: [{ proj: { speed: 26, range: 15, radius: 0.6, damage: 40, count: 2, spread: 0.18, sprite: 'firefist', element: 'fire', pierce: true, status: { burn: 3 }, knockback: 6, trail: { color: ['#ff7043', '#ffca28'] } } }] },
    awaken('mera_enkai'), awaken('mera_entei'),
  ] } },
  hie: { m1: { element: 'ice', status: { chill: 1.5 } }, awakening: { name: 'Awakened Ice', skills: [
    awaken('hie_saber'), awaken('hie_pheasant'),
    { id: 'hie_partisan', name: 'Ice Block: Partisan', icon: '❄', anim: 'cast', windup: 0.35, recover: 0.35, cd: 8, desc: 'A volley of ice spears.',
      steps: [{ proj: { speed: 24, range: 14, radius: 0.35, damage: 26, count: 6, spread: 0.6, sprite: 'iceshard', size: 1.6, color: '#e1f5fe', element: 'ice', status: { freeze: 0.8 }, pierce: true } }] },
    awaken('hie_ageand'), awaken('hie_time'),
  ] } },
  goro: {
    m1: { element: 'lightning', status: { shock: 0.4 } },
    forms: [{ id: 'amaru', name: '200 Million Volt Amaru', short: 'Amaru', mastery: 55, activate: 'goro_amaru', desc: 'A body of thunder, its drums ringing: bigger, faster, every bolt harder.' }],
  },
  suna: { m1: { element: 'sand', status: { dry: 1 } } },
  moku: { m1: { element: 'smoke' } },
  pika: { m1: { element: 'light', dmg: 1.1 } },
  magu: { m1: { element: 'magma', status: { burn: 2 } } },
  yami: { m1: { element: 'dark' } },
  hito: { m1: { dmg: 1.1 }, forms: [{ id: 'monster', name: 'Monster Point', short: 'Monster', mastery: 50, activate: 'hito_monster', desc: 'A Rumble Ball overdose: a towering monster, enormous power, barely controlled.', m1: { dmg: 1.5, reach: 1.4 } }] },
  uo_seiryu: { m1: { dmg: 1.2 }, forms: [{ id: 'dragon', name: 'Azure Dragon Form', short: 'Dragon', mastery: 40, activate: 'seiryu_form', desc: 'Take the Azure Dragon\'s whole shape: bigger and stronger, every breath a furnace.', m1: { dmg: 1.4, reach: 1.4 } }] },
};

/**
 * Give every fruit its kit: forms, an awakening (one made from its base set
 * if none is written: each base move awakened, plus its `extra` moves), its
 * heavy and its M1 — and register every technique they bring as the fruit's.
 */
export function attachKits(FRUITS) {
  const reg = (fid, d, extra) => {
    const def = { ...d, ...extra, source: 'fruit:' + fid, fruit: fid };
    registerAbilities([def], 'fruit:' + fid);
    return def.id;
  };
  for (const [fid, f] of Object.entries(FRUITS)) {
    const kit = KITS[fid] || {};
    const base = Object.fromEntries([...f.techniques, ...(f.more || [])].map((t) => [t.id, t]));
    // (a def, a base technique's id, or awaken(id): the awakened version of a base one)
    const one = (s, extra) => {
      if (!s) return null;
      if (typeof s === 'string') return s;
      if (s.awaken) {
        const b = base[s.awaken] || getAbility(s.awaken);
        if (!b) return null;
        const o = { ...s }; delete o.awaken;
        return reg(fid, awakenDef(b, o), extra);
      }
      return reg(fid, s, extra);
    };
    f.m1 = kit.m1 || null;
    f.heavy = one(kit.heavy) || null;
    f.forms = (kit.forms || []).map((F) => {
      const form = { ...F, fruit: fid };
      form.activate = one(F.activate, { formOf: F.id });
      form.skills = F.skills ? F.skills.map((s) => one(s, { formSkill: F.id })).filter(Boolean) : null;
      form.heavy = one(F.heavy, { formSkill: F.id });
      return form;
    });
    const A = kit.awakening || {};
    const aw = { name: A.name || `Awakened ${f.en.replace(/ Fruit.*$/, '')}`, short: A.short || (A.name && A.name.length <= 12 ? A.name : 'Awakened'), desc: A.desc || `Awakening: every move of the ${f.name} bigger, stronger, faster.`, fruit: fid, m1: A.m1 || f.m1 || null };
    aw.activate = one(A.activate || {
      id: fid + '_awaken', name: aw.name, icon: f.techniques[0]?.icon, anim: 'cast', windup: 0.6, recover: 0.2, cd: 6, desc: `Awaken the ${f.name}.`,
      steps: [{ fx: { ring: 4, color: f.color, flash: 0.25, impact: 0.08, text: 'AWAKENED' } }, { at: 0.6, buff: { id: fid + '_awake', form: 'awake', name: aw.name, dur: Infinity, mods: { damage: 1.15, speedMul: 1.1 }, aura: rgba(f.color, 0.8), ...(A.look ? { look: A.look } : {}) } }],
    }, { formOf: 'awake', awakened: true, awColor: f.color });
    // (written out, or the base set awakened, flight left out — it's Space in the air — plus the fruit's own extras)
    const skills = A.skills || [...f.techniques.filter((t) => !t.flight).map((t) => awaken(t.id)), ...(A.extra || [])];
    aw.skills = skills.map((s) => one(s, { awakenedSkill: true, awakened: true, awColor: f.color })).filter(Boolean);
    aw.heavy = one(A.heavy, { awakenedSkill: true, awakened: true, awColor: f.color }) || (f.heavy ? one(awaken(f.heavy), { awakenedSkill: true, awakened: true, awColor: f.color }) : null);
    f.awakening = aw;
  }
}
