// Ability runtime. Techniques are data (see data/styles.js, data/fruits.js,
// data/haki.js) made of timed "steps" using a few primitives:
//   hit      – melee hitbox (arc / circle / line / ring) in front of the user
//   proj     – projectile(s)
//   dash     – move the user quickly (optionally carrying a hitbox)
//   buff     – timed stat modifiers / auras / transformations
//   zone     – lingering damaging or slowing area
//   pull     – drag enemies toward a point (Black Hole, Kurouzu)
//   teleport – blink forward (Soru, Yata no Kagami)
//   heal     – restore health (Phoenix flames)
//   fx       – purely visual flourish
import { TAU, clamp } from '../core/math.js';
import { ELEMENT_COLORS } from './combat.js';
import { drawProjectile } from '../render/projectiles.js';

const REG = new Map();
export function registerAbilities(list, source) {
  for (const a of list) { a.source = a.source || source; REG.set(a.id, a); }
}
export const getAbility = (id) => REG.get(id);
export const allAbilities = () => [...REG.values()];

export function abilityTotal(def) {
  const last = Math.max(0, ...(def.steps || []).map((s) => (s.at ?? def.windup ?? 0) + (s.dash ? s.dash.time : 0) + (s.hit ? s.hit.duration ?? 0.1 : 0)));
  return Math.max((def.windup ?? 0) + (def.active ?? 0.1), last) + (def.recover ?? 0.2);
}

/** Damage multiplier for an ability used by an actor. */
export function powerFor(actor, def) {
  const src = def.source || '';
  if (actor.dmgOverride) return actor.dmgOverride * (actor.buffMul('damage'));
  const str = actor.d ? actor.d.dmg : 1;
  let m = 1;
  if (src.startsWith('fruit')) {
    const fm = actor.fruitMastery || 0;
    m = (0.7 + str * 0.35) * (1 + fm * 0.022);
  } else if (src.startsWith('haki')) {
    m = (0.6 + str * 0.3) * (1 + (actor.hakiLevel(def.hakiType || 'armament') || 0) * 0.02) * (1 + (actor.attrs?.wil || 0) * 0.01);
  } else {
    const sm = actor.styleMastery ? actor.styleMastery(def.style || actor.style) : 0;
    m = str * (1 + sm * 0.012);
    if (def.weapon && actor.weaponMul) m *= actor.weaponMul(def.weapon);
  }
  m *= actor.buffMul('damage');
  if (actor.armament && !src.startsWith('fruit_ranged')) m *= 1.25 + (actor.hakiLevel('armament') || 0) * 0.004;
  if (actor.conquerorInfused) m *= 1.4;
  return m;
}

export function canUse(actor, def) {
  if (!def) return false;
  if ((actor.cooldowns[def.id] || 0) > 0) return false;
  const c = def.cost || {};
  if (c.stamina && actor.stamina < c.stamina * 0.5) return false;
  if (c.haki && actor.haki < c.haki) return false;
  if (def.source?.startsWith('fruit') && (actor.inWater || actor.seastoned)) return false;
  if (def.weapon && !actor.hasWeapon(def.weapon)) return false;
  if (def.requiresBuff && !actor.hasBuff(def.requiresBuff)) return false;
  return true;
}

export function startAbility(actor, def, game, target) {
  const c = def.cost || {};
  if (c.stamina) actor.stamina = Math.max(0, actor.stamina - c.stamina);
  if (c.haki) actor.haki -= c.haki;
  const cdMul = actor.cdMul ?? 1;
  if (def.cd) actor.cooldowns[def.id] = def.cd * cdMul;
  const angle = actor.facing;
  const tx = target ? target.x : actor.x + Math.cos(angle) * 5;
  const ty = target ? target.y : actor.y + Math.sin(angle) * 5;
  actor.action = { def, t: 0, step: 0, angle, tx, ty, target, total: abilityTotal(def) / (def.noSpeedup ? 1 : actor.atkSpeed()), mult: powerFor(actor, def) };
  if (def.say && Math.random() < 0.9) game.fx.text(actor.x, actor.y - 2.1, def.say, '#ffffff', 0.34, { life: 1.2 });
  if (!actor.isPlayer && def.telegraph !== false) telegraph(actor, def, game);
  if (def.onStart) def.onStart(actor, game);
  game.audio?.sfx(def.sfxStart || 'whoosh');
}

function telegraph(actor, def, game) {
  const wind = def.windup ?? 0.2;
  if (wind < 0.12) return;
  const first = (def.steps || []).find((s) => s.hit || s.proj || s.dash || s.zone);
  if (!first) return;
  const col = actor.boss ? 'rgba(255,40,80,1)' : 'rgba(255,60,60,1)';
  const life = wind * (actor.game?.player?.observation ? 1.35 : 1);
  if (first.hit) {
    const h = first.hit;
    const ox = actor.x + Math.cos(actor.facing) * (h.offset || 0), oy = actor.y + Math.sin(actor.facing) * (h.offset || 0);
    if (h.shape === 'circle' || h.shape === 'ring') game.fx.telegraph(ox, oy, 'circle', { r: h.range, life, color: col, follow: h.offset ? null : actor });
    else if (h.shape === 'line') game.fx.telegraph(actor.x, actor.y, 'line', { angle: actor.facing, length: h.range, width: h.width || 1, life, color: col });
    else game.fx.telegraph(ox, oy, 'arc', { r: h.range, angle: actor.facing, arc: h.arc || 1.4, life, color: col });
  } else if (first.proj || first.dash) {
    const len = first.proj ? Math.min(14, first.proj.range || 10) : first.dash.dist;
    game.fx.telegraph(actor.x, actor.y, 'line', { angle: actor.facing, length: len, width: first.proj ? (first.proj.radius || 0.4) * 2 + 0.3 : 1.2, life, color: col });
  } else if (first.zone) {
    game.fx.telegraph(actor.action.tx, actor.action.ty, 'circle', { r: first.zone.range, life, color: col });
  }
}

export function updateAbility(actor, dt, game) {
  const a = actor.action;
  const def = a.def;
  a.t += dt * (def.noSpeedup ? 1 : actor.atkSpeed());
  const steps = def.steps || [];
  if (def.track && a.t < (def.windup ?? 0)) a.angle = actor.facing; // aim during windup
  while (a.step < steps.length && a.t >= (steps[a.step].at ?? def.windup ?? 0)) {
    runStep(actor, steps[a.step], game, a);
    a.step++;
  }
  if (a.t >= a.total * (def.noSpeedup ? 1 : actor.atkSpeed())) {
    if (def.onEnd) def.onEnd(actor, game);
    actor.action = null;
  }
}

function runStep(actor, s, game, a) {
  const ang = s.angleOffset ? a.angle + s.angleOffset : a.angle;
  const mult = a.mult;
  const col = ELEMENT_COLORS[s.hit?.element || s.proj?.element || 'physical'];
  if (s.hit) {
    const h = s.hit;
    const off = h.offset ?? 0;
    const reach = actor.reach ?? 1;
    const hb = {
      owner: actor, x: game.world.wx(actor.x + Math.cos(ang) * off * reach), y: actor.y - 0.4 + Math.sin(ang) * off * reach,
      shape: h.shape || 'arc', range: (h.range || 1.4) * (h.shape === 'circle' ? 1 : reach), arc: h.arc ?? 1.8, width: h.width, angle: ang,
      damage: (h.damage || 5) * mult, knockback: h.knockback, stun: h.stun ?? 0.25, element: h.element || 'physical',
      status: h.status, duration: h.duration ?? 0.1, interval: h.interval, heavy: h.heavy, slashing: h.slashing, guardBreak: h.guardBreak,
      unblockable: h.unblockable, haki: h.haki || (actor.armament && def_isPhysical(h)), critChance: h.crit ?? (actor.critChance || 0.05),
      follow: h.follow, offX: Math.cos(ang) * off * reach, offY: -0.4 + Math.sin(ang) * off * reach, followAngle: h.followAngle,
      impactFrame: h.impactFrame, trueDamage: h.trueDamage, hitShips: h.hitShips, shipDamage: h.shipDamage, radial: h.radial,
      onHit: h.onHit, forceWater: h.forceWater, hitsAll: h.hitsAll,
    };
    game.combat.hitbox(hb);
    const vfx = s.vfx || h.vfx;
    const color = s.color || h.color || col;
    if (vfx === 'slash' || (!vfx && h.slashing)) game.fx.slash(actor.x + Math.cos(ang) * 0.3, actor.y, ang, (h.range || 1.4) * reach * 0.85, h.arc ?? 1.8, color, 0.18, h.width ? h.width * 0.4 : 0.22);
    else if (vfx === 'ring' || h.shape === 'circle') {
      game.fx.ring(hb.x, hb.y + 0.4, 0.2, h.range || 2, color, 0.35, 0.2);
      if (h.heavy) game.fx.crack(hb.x, hb.y + 0.4, (h.range || 2) * 0.7);
    } else if (vfx === 'beam' || h.shape === 'line') game.fx.beam(actor.x, actor.y, ang, (h.range || 4) * reach, h.width || 0.6, color, h.duration ? Math.max(0.2, h.duration) : 0.25, s.core || '#ffffff');
    else if (vfx === 'fist' || !vfx) game.fx.burst(hb.x + Math.cos(ang) * (h.range || 1.3) * 0.6, hb.y, 5, { color, speed: 3, g: 0, life: 0.18, kind: 'line', angle: ang, spread: 0.8 });
    if (h.shake) game.fx.shake(h.shake);
  }
  if (s.proj) {
    const p = s.proj;
    const n = p.count || 1;
    for (let i = 0; i < n; i++) {
      const spread = n > 1 ? (i / (n - 1) - 0.5) * (p.spread ?? 0.5) : (p.jitter ? (Math.random() - 0.5) * p.jitter : 0);
      const pa = ang + spread;
      const sp = p.speed || 14;
      const sx = actor.x + Math.cos(pa) * 0.6, sy = actor.y - 0.5 + Math.sin(pa) * 0.6;
      game.combat.projectile({
        owner: actor, x: game.world.wx(sx), y: sy, vx: Math.cos(pa) * sp, vy: Math.sin(pa) * sp,
        range: p.range || 10, radius: p.radius || 0.3, damage: (p.damage || 5) * mult, element: p.element || 'physical',
        knockback: p.knockback ?? 2, stun: p.stun ?? 0.2, status: p.status, pierce: p.pierce, homing: p.homing,
        target: a.target, sprite: p.sprite || 'orb', color: p.color || col, size: p.size || 1, haki: actor.armament && p.element === undefined,
        stretch: p.stretch ? actor : null, passWalls: p.passWalls, hitShips: p.hitShips ?? true, shipDamage: p.shipDamage,
        slashing: p.slashing, heavy: p.heavy, critChance: 0.05, unblockable: p.unblockable,
        onEnd: p.explode ? (pr, g) => explode(pr, g, p.explode, mult) : null,
        trail: p.trail ? (pr, g) => trail(pr, g, p.trail) : null,
        draw: drawProjectile,
      });
    }
  }
  if (s.dash) {
    const d = s.dash;
    const dist = d.dist * (actor.dashMul || 1);
    actor.dash = { vx: Math.cos(ang) * dist / d.time, vy: Math.sin(ang) * dist / d.time, t: d.time, ignoreWater: d.air };
    if (d.iframes) actor.iframes = Math.max(actor.iframes, d.iframes);
    if (d.hit) {
      game.combat.hitbox({
        owner: actor, x: actor.x, y: actor.y - 0.4, shape: 'circle', range: d.hit.range || 1.1, damage: (d.hit.damage || 5) * mult,
        knockback: d.hit.knockback ?? 4, stun: d.hit.stun ?? 0.3, element: d.hit.element || 'physical', follow: true, offX: 0, offY: -0.4,
        duration: d.time + 0.05, slashing: d.hit.slashing, heavy: d.hit.heavy, status: d.hit.status, radial: true, guardBreak: d.hit.guardBreak,
      });
    }
    if (d.trail) game.fx.burst(actor.x, actor.y, 8, { color: d.trail, speed: 2, g: 0, life: 0.3, kind: 'smoke', size: 0.25 });
  }
  if (s.teleport) {
    const t = s.teleport;
    const dist = t.dist;
    let nx = actor.x, ny = actor.y;
    for (let k = 0; k < 20; k++) {
      const tx = actor.x + Math.cos(ang) * dist * (1 - k / 20), ty = actor.y + Math.sin(ang) * dist * (1 - k / 20);
      if (actor.canOccupy(game.world, tx, ty)) { nx = tx; ny = ty; break; }
    }
    game.fx.burst(actor.x, actor.y - 0.5, 10, { color: t.color || '#fff', speed: 3, g: 0, life: 0.25, kind: 'line' });
    actor.x = game.world.wx(nx); actor.y = ny;
    game.fx.burst(actor.x, actor.y - 0.5, 10, { color: t.color || '#fff', speed: 3, g: 0, life: 0.25, kind: 'line' });
    actor.iframes = Math.max(actor.iframes, 0.15);
  }
  if (s.buff) actor.addBuff({ ...s.buff, source: a.def.id });
  if (s.heal) {
    const amt = s.heal * (a.def.source?.startsWith('fruit') ? 1 + (actor.fruitMastery || 0) * 0.02 : 1);
    actor.heal(amt, game);
    game.fx.burst(actor.x, actor.y - 0.6, 14, { color: s.color || '#80deea', speed: 2, vz: 2, g: -1, life: 0.8, kind: 'fire', size: 0.2 });
  }
  if (s.zone) {
    const z = s.zone;
    const zx = z.atTarget ? a.tx : actor.x + Math.cos(ang) * (z.offset || 0);
    const zy = z.atTarget ? a.ty : actor.y + Math.sin(ang) * (z.offset || 0);
    game.addZone({ owner: actor, x: game.world.wx(zx), y: zy, r: z.range, t: z.duration, interval: z.interval || 0.5, damage: (z.damage || 0) * mult, element: z.element || 'physical', status: z.status, slow: z.slow, color: z.color || col, kind: z.kind || 'field', pull: z.pull });
  }
  if (s.pull) {
    for (const e of game.actorsNear(actor.x, actor.y, s.pull.range)) {
      if (!game.combat.canHit(actor, e, {})) continue;
      const dx = game.world.dx(e.x, actor.x), dy = actor.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.knock(dx / d * s.pull.strength, dy / d * s.pull.strength);
      if (s.pull.stun) e.stagger(s.pull.stun);
      if (s.pull.nullify) e.addStatus('seastone', s.pull.nullify);
    }
    game.fx.ring(actor.x, actor.y, s.pull.range, 0.3, s.color || '#7e57c2', 0.5, 0.3);
  }
  if (s.conqueror) conquerorBurst(actor, game, s.conqueror, mult);
  if (s.self) {
    if (s.self.iframes) actor.iframes = Math.max(actor.iframes, s.self.iframes);
    if (s.self.cleanse) actor.status = {};
  }
  if (s.fx) {
    const f = s.fx;
    if (f.ring) game.fx.ring(actor.x, actor.y, 0.3, f.ring, f.color || col, f.life || 0.4, f.width || 0.2);
    if (f.burst) game.fx.burst(actor.x, actor.y - 0.6, f.burst, { color: f.color || col, speed: f.speed || 5, g: f.g ?? 2, life: f.life || 0.5, kind: f.kind || 'spark', size: f.size || 0.14 });
    if (f.shake) game.fx.shake(f.shake);
    if (f.impact) game.fx.impactFrame(f.impact);
    if (f.flash) game.fx.flash = Math.max(game.fx.flash, f.flash);
    if (f.text) game.fx.text(actor.x, actor.y - 2.2, f.text, f.color || '#fff', 0.5, { life: 1.1 });
  }
  if (s.sfx) game.audio?.sfx(s.sfx);
}

function def_isPhysical(h) { return !h.element || h.element === 'physical'; }

function explode(p, game, e, mult) {
  game.combat.hitbox({ owner: p.owner, x: p.x, y: p.y, shape: 'circle', range: e.range || 1.8, damage: (e.damage || 10) * mult, knockback: e.knockback ?? 6, stun: e.stun ?? 0.4, element: e.element || 'explosion', duration: 0.1, radial: true, heavy: true, hitShips: true, status: e.status });
  game.fx.ring(p.x, p.y + 0.4, 0.2, e.range || 1.8, e.color || '#ffab40', 0.35, 0.3);
  game.fx.burst(p.x, p.y, 22, { color: e.colors || ['#ffab40', '#ff7043', '#fff176', '#616161'], speed: 7, g: 3, life: 0.6, kind: 'fire', size: 0.25 });
  game.fx.crack(p.x, p.y + 0.4, (e.range || 1.8) * 0.6, 1.5);
  if (p.owner?.isPlayer || game.world.distance(p.x, p.y, game.player.x, game.player.y) < 12) game.fx.shake(0.3);
  game.audio?.sfx('explosion');
}

function trail(p, game, t) {
  if (Math.random() < (t.rate || 0.6)) game.fx.particle({ x: p.x, y: p.y + 0.5, z: 0.5, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), vz: 0.4, g: 0, life: t.life || 0.35, size: t.size || 0.18, color: Array.isArray(t.color) ? t.color[Math.floor(Math.random() * t.color.length)] : t.color, kind: t.kind || 'fire', grow: t.grow ?? -0.2 });
}

/** Conqueror's Haki: weak-willed foes faint, the rest are shaken. */
export function conquerorBurst(actor, game, c, mult) {
  const lvl = actor.hakiLevel('conqueror') || 20;
  const my = actor.power();
  game.fx.ring(actor.x, actor.y, 0.5, c.range, '#1a1a1a', 0.6, 0.4);
  game.fx.ring(actor.x, actor.y, 0.3, c.range * 0.8, '#d50000', 0.5, 0.15);
  for (let k = 0; k < 6; k++) {
    const a = Math.random() * TAU;
    game.fx.bolt(actor.x, actor.y, actor.x + Math.cos(a) * c.range * 0.7, actor.y + Math.sin(a) * c.range * 0.5, '#000000', 0.35, 0.09);
  }
  game.fx.impactFrame(0.12);
  game.fx.shake(0.7);
  let fainted = 0;
  for (const e of game.actorsNear(actor.x, actor.y, c.range)) {
    if (e === actor || !game.combat.canHit(actor, e, {})) continue;
    const ratio = e.power() / Math.max(1, my);
    const resist = (e.hakiLevel && e.hakiLevel('conqueror') > 0) ? 0.5 : 0;
    if (ratio < 0.35 + lvl * 0.004 - resist && !e.boss) {
      e.faint(game);
      fainted++;
    } else {
      e.stagger(0.6 + lvl * 0.01);
      e.takeDamage(Math.round((c.damage || 0) * mult), actor, { element: 'haki' }, game);
    }
  }
  if (fainted && actor.isPlayer) game.log(`${fainted} ${fainted === 1 ? 'foe' : 'foes'} fainted before your will.`, '#ef5350');
}

export { clamp };
