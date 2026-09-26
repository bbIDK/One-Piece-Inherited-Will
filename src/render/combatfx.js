// Combat visual language: element and style palettes, hit feedback scaled by
// the weight of a blow, parry / guard-break moments, technique signatures
// (styles, Devil Fruits, Haki), zone visuals, explosions, afterimages and the
// per-actor extras the character renderer draws (energy blades, charge-ups,
// element glows on the striking limb).
//
// Everything here only spawns effects through the FX instance passed in
// (see game/fx.js) or draws in the actor's own space; no gameplay state.
import { drawCharacter, rgba } from './character.js';
import { actionClip, weaponFor } from './anims.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ------------------------------------------------------------------ palettes
export const ELEM = {
  physical: { c: '#ffffff', spark: ['#ffffff', '#fff8e1', '#ffe0b2'], kind: 'spark' },
  slash: { c: '#e3f2fd', spark: ['#ffffff', '#e3f2fd'], kind: 'spark' },
  fire: { c: '#ff7043', spark: ['#ffca28', '#ff7043', '#ff5722', '#fff176'], kind: 'fire', add: true },
  bluefire: { c: '#4dd0e1', spark: ['#4dd0e1', '#80deea', '#e0f7fa'], kind: 'fire', add: true },
  magma: { c: '#ff5722', spark: ['#ff6f00', '#ffab40', '#bf360c'], kind: 'ember', add: true },
  ice: { c: '#81d4fa', spark: ['#e1f5fe', '#b3e5fc', '#ffffff'], kind: 'shard' },
  snow: { c: '#ffffff', spark: ['#ffffff', '#e3f2fd'], kind: 'shard' },
  lightning: { c: '#fff176', spark: ['#ffffff', '#fff59d', '#fff176'], kind: 'spark', add: true },
  water: { c: '#4fc3f7', spark: ['#e1f5fe', '#81d4fa', '#4fc3f7'], kind: 'drop' },
  sand: { c: '#e1c16e', spark: ['#e1c16e', '#d7b56d', '#fff3c4'], kind: 'sand' },
  smoke: { c: '#cfd8dc', spark: ['#eceff1', '#cfd8dc'], kind: 'smoke' },
  gas: { c: '#b2dfdb', spark: ['#b2dfdb', '#e0f2f1'], kind: 'smoke' },
  light: { c: '#fff9c4', spark: ['#ffffff', '#fff9c4', '#fff59d'], kind: 'spark', add: true },
  dark: { c: '#7e57c2', spark: ['#311b92', '#7e57c2', '#1a0033'], kind: 'smoke' },
  quake: { c: '#e0f7fa', spark: ['#ffffff', '#e0f7fa'], kind: 'spark' },
  poison: { c: '#ab47bc', spark: ['#8e24aa', '#ab47bc', '#aed581'], kind: 'drop' },
  haki: { c: '#9c27b0', spark: ['#1a0033', '#7b1fa2', '#ff1744'], kind: 'spark' },
  explosion: { c: '#ffab40', spark: ['#ffab40', '#ff7043', '#fff176'], kind: 'fire', add: true },
  string: { c: '#f8bbd0', spark: ['#f8bbd0', '#ffffff'], kind: 'spark' },
  wax: { c: '#fff8e1', spark: ['#fff8e1', '#ffffff'], kind: 'shard' },
  swamp: { c: '#6d4c41', spark: ['#6d4c41', '#8d6e63'], kind: 'drop' },
};
const elemOf = (e) => ELEM[e] || ELEM.physical;

/** Each style's colour/effect language. */
export const STYLE_FX = {
  brawler: { trail: '#fff3e0', spark: ['#ffffff', '#ffe0b2', '#fff8e1'] },
  ittoryu: { trail: '#e3f2fd', spark: ['#ffffff', '#e3f2fd'], arcs: 1 },
  nitoryu: { trail: '#e3f2fd', spark: ['#ffffff', '#e3f2fd'], arcs: 2 },
  santoryu: { trail: '#e8f5e9', spark: ['#ffffff', '#e8f5e9', '#c8e6c9'], arcs: 3, oni: true },
  black_leg: { trail: '#ffe0b2', spark: ['#ffffff', '#ffcc80'], legArc: '#ffe0b2' },
  fishman_karate: { trail: '#b3e5fc', spark: ['#e1f5fe', '#81d4fa'], ripple: '#81d4fa' },
  rokushiki: { trail: '#eceff1', spark: ['#ffffff', '#eceff1'], pierce: true },
  okama_kenpo: { trail: '#f8bbd0', spark: ['#f48fb1', '#fce4ec', '#ffffff'], sparkle: ['#f48fb1', '#fce4ec', '#ffffff'], legArc: '#f8bbd0' },
  electro: { trail: '#fff59d', spark: ['#ffffff', '#fff176'], bolt: '#fff176', claw: '#fff59d', elem: 'lightning' },
  hasshoken: { trail: '#ffe0b2', spark: ['#ffffff', '#ffcc80'], vibrate: '#ffcc80' },
  weather_science: { trail: '#81d4fa', spark: ['#ffffff', '#b3e5fc'] },
  elbaf: { trail: '#ffe082', spark: ['#ffffff', '#ffe082', '#ffca28'], arcs: 1, giant: true },
  ryusoken: { trail: '#ffccbc', spark: ['#ffffff', '#ffab91'], clawMarks: '#ffab91', claw: '#ffffff' },
  sniper: { trail: '#fff8e1', spark: ['#ffffff', '#ffe082'] },
};
function styleOf(def, actor) {
  if (!def || !(def.source || '').startsWith('style')) return null;
  return STYLE_FX[def.style || (actor && actor.style)] || null;
}

// energy blades held during fruit slashes
const BLADES = {
  hie_saber: '#b3e5fc', pika_murakumo: '#fff59d', noro_mirror: '#80deea', ope_amputate: '#b3e5fc',
  supa_sparkling: '#eceff1', zushi_blade: '#b39ddb', mochi_zangiri: '#fff8e1',
};

// ------------------------------------------------------------------ helpers
function sparks(fx, x, y, z, ang, n, cols, o = {}) {
  if (n <= 0) return;
  fx.burst(x, y, n, { angle: ang, spread: o.spread ?? 1.8, speed: o.speed ?? 7, z, vz: o.vz ?? 1.2, g: o.g ?? 6, life: o.life ?? 0.28, size: o.size ?? 0.09, color: cols, kind: o.kind || 'spark', drag: o.drag ?? 4, add: o.add });
}
function dust(fx, x, y, n, o = {}) {
  fx.burst(x, y, n, { angle: o.angle, spread: o.spread ?? TAU, speed: o.speed ?? 2.2, z: o.z ?? 0.08, vz: o.vz ?? 0.6, g: 1.2, life: o.life ?? 0.5, size: o.size ?? 0.17, grow: o.grow ?? 0.3, color: o.color || ['#d7ccc8', '#bcaaa4', '#efebe9'], kind: 'dust', drag: 3 });
}
function glow(fx, x, y, z, size, color, life = 0.2) {
  fx.particle({ x, y, z, size, color, kind: 'glow', life, g: 0, drag: 0, vz: 0, add: true });
}
function flames(fx, x, y, z, n, cols, o = {}) {
  fx.burst(x, y, n, { angle: o.angle, spread: o.spread ?? TAU, speed: o.speed ?? 2, z, vz: o.vz ?? 2.4, g: -2.5, life: o.life ?? 0.5, size: o.size ?? 0.2, grow: -0.15, color: cols, kind: 'fire', drag: 3 });
}
function embers(fx, x, y, z, n, cols) {
  fx.burst(x, y, n, { speed: 2.4, z, vz: 3, g: 2, life: 0.8, size: 0.07, color: cols || ['#ffab40', '#ff6f00', '#ffd54f'], kind: 'ember', drag: 1.5 });
}
function splash(fx, x, y, z, n, ang) {
  fx.burst(x, y, n, { angle: ang, spread: ang === undefined ? TAU : 2.2, speed: 5, z, vz: 3, g: 12, life: 0.45, size: 0.08, color: ['#e1f5fe', '#81d4fa', '#4fc3f7'], kind: 'drop', drag: 1.5 });
}
function shards(fx, x, y, z, n, cols, ang) {
  fx.burst(x, y, n, { angle: ang, spread: ang === undefined ? TAU : 2.4, speed: 5.5, z, vz: 2.5, g: 10, life: 0.5, size: 0.11, color: cols || ['#e1f5fe', '#b3e5fc', '#ffffff'], kind: 'shard', drag: 2 });
}
function sparkle(fx, x, y, z, n, cols) {
  for (let i = 0; i < n; i++) fx.particle({ x: x + rnd(-0.4, 0.4), y: y + rnd(-0.25, 0.25), z: z + rnd(-0.2, 0.4), vx: rnd(-0.6, 0.6), vy: rnd(-0.4, 0.4), vz: rnd(0.3, 1.2), g: 0, drag: 1.5, life: rnd(0.35, 0.6), size: rnd(0.08, 0.14), color: cols[i % cols.length], kind: 'star', add: true, rot: rnd(0, TAU), vr: rnd(-4, 4) });
}
function smoke(fx, x, y, z, n, cols, o = {}) {
  fx.burst(x, y, n, { angle: o.angle, spread: o.spread ?? TAU, speed: o.speed ?? 1.6, z, vz: o.vz ?? 0.8, g: -0.4, life: o.life ?? 0.9, size: o.size ?? 0.3, grow: o.grow ?? 0.5, color: cols, kind: 'smoke', drag: 2 });
}
function miniBolts(fx, x, y, z, n, r, col) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU);
    fx.bolt(x, y, x + Math.cos(a) * r * rnd(0.6, 1), y + Math.sin(a) * r * 0.7 * rnd(0.6, 1), col, 0.14, 0.035, { z0: z, z1: z + rnd(-0.35, 0.35), branches: 0, amp: -0.2 });
  }
}
function vibration(fx, x, y, z, R, col, n = 3) {
  for (let i = 0; i < n; i++) fx.ring(x, y, 0.05, R * (0.6 + i * 0.25), col, 0.28 + i * 0.05, 0.05, { z, flat: 0.85, wobble: 0.18, lobes: 11, delay: i * 0.05, noCore: true, add: true });
}
function ripple(fx, x, y, R, col, n = 2) {
  for (let i = 0; i < n; i++) fx.ring(x, y, 0.1, R * (0.8 + i * 0.35), col, 0.45, 0.07, { z: 0.06, flat: 0.55, delay: i * 0.08, add: true });
}
const clipOf = (actor, a) => a.clip || (a.clip = actionClip(a.def, actor));
const lastLook = (a) => a._lastLook || a.look;

// ------------------------------------------------------------------ hit feedback
/**
 * Called by combat.js for every landed (or blocked) hit. `o`: { final, crit,
 * blocked, el, ang, playerInvolved }. Scales sparks, hit-stop, kick and
 * rings by the weight of the blow: tiny on jabs, big on heavies/finishers.
 */
export function hitFeedback(fx, att, tgt, h, o = {}) {
  const game = fx.game;
  const final = o.final || 0, crit = !!o.crit, blocked = !!o.blocked;
  const elem = o.el || 'physical';
  const E = elemOf(elem);
  const ang = o.ang ?? 0;
  const def = h.def || (att && att.action ? att.action.def : null);
  const st = att && !h.sprite ? styleOf(def, att) : null;
  const m1 = !!(def && def.m1Chain && !h.sprite);
  let w = m1 ? 0.22 : h.sprite ? 0.35 : 0.45;
  if (m1 && (h.knockback ?? 0) >= 3.2) w = 0.52;
  if (h.heavy) w = Math.max(w, 0.72);
  if (h.guardBreak) w += 0.06;
  if (h.impactFrame) w = Math.max(w, 1);
  const maxHp = tgt.d ? tgt.d.maxHp : 100;
  w += Math.min(0.3, (final / maxHp) * 1.2);
  if (crit) w += 0.22;
  if (h.interval) w *= 0.55;
  w = Math.min(1.25, w);
  const scale = (tgt.look && tgt.look.scale) || 1;
  const z = 0.78 * scale;
  const cx = tgt.x - Math.cos(ang) * 0.22 * scale, cy = tgt.y - Math.sin(ang) * 0.14 * scale;
  if (blocked) blockFx(fx, tgt, ang, w, z);
  else if (final > 0 || h.trueDamage) {
    const col = st ? st.spark[1] || st.spark[0] : E.c;
    fx.add('impact', { x: cx, y: cy, z, angle: ang, size: 0.24 + 0.42 * w, color: col, core: '#ffffff', life: 0.1 + 0.09 * w, spikes: 8 + Math.round(w * 5), lines: 2 + Math.round(w * 5) });
    sparks(fx, cx, cy, z, ang, Math.round(3 + 9 * w), st ? st.spark : E.spark, { speed: 5 + 6 * w, life: 0.2 + 0.14 * w, size: 0.07 + 0.05 * w });
    elemHit(fx, elem, E, cx, cy, z, ang, w);
    if (st) styleHit(fx, st, def, tgt, cx, cy, z, ang, w);
    if (w >= 0.68) {
      fx.ring(tgt.x, tgt.y, 0.25, 0.9 + 0.8 * w, rgba(col, 0.9), 0.3, 0.08 + 0.06 * w, { z: 0.06, flat: 0.55, add: true });
      dust(fx, tgt.x, tgt.y + 0.04, Math.round(4 + 6 * w), { angle: ang, spread: 2.4, speed: 2.5 + 2 * w });
      if ((h.knockback ?? 2) * (tgt.kbResist ?? 1) >= 4) fx.add('skid', { x: tgt.x, y: tgt.y, angle: ang + Math.PI, length: 0.7 + 0.7 * w, life: 1.4 });
    }
    if (crit) {
      fx.add('flare', { x: cx, y: cy, z: z + 0.08, size: 0.8 + 0.3 * w, color: '#ffd740', life: 0.3 });
      sparkle(fx, cx, cy, z, 4, ['#ffd740', '#fff59d', '#ffffff']);
    }
    if (att && att.conquerorInfused) {
      miniBolts(fx, cx, cy, z, 3, 0.9, '#d50000');
      miniBolts(fx, cx, cy, z, 2, 0.8, '#000000');
    } else if (att && att.armament && elem === 'physical') {
      fx.ring(cx, cy, 0.08, 0.5 + 0.3 * w, '#7c4dff', 0.2, 0.06, { z, flat: 1, noCore: true, add: true });
    }
    tgt.hitFx = { t0: game.env ? game.env.time : fx.time, w, ang };
  }
  if (final > 0) fx.damage(tgt, final, { crit, blocked, toPlayer: tgt.isPlayer });
  if (o.playerInvolved) {
    const stop = blocked ? 0.035 : h.interval ? 0.018 : 0.028 + 0.075 * Math.min(1, w) + (crit ? 0.02 : 0);
    fx.stop(stop);
    fx.kick(ang, blocked ? 2.5 : 1.5 + 8 * Math.min(1, w));
    if (!blocked && w >= 0.7) fx.shake(0.12 + 0.25 * (w - 0.7));
    if (!blocked && h.impactFrame) { fx.impactFrame(0.07); fx.focus(tgt.x, tgt.y, 0.22); }
    else if (!blocked && (crit || w >= 0.95)) fx.focus(tgt.x, tgt.y, 0.14);
  }
}

function elemHit(fx, elem, E, x, y, z, ang, w) {
  switch (elem) {
    case 'fire':
    case 'explosion':
      flames(fx, x, y, z, Math.round(4 + 6 * w), E.spark, { speed: 2 + 2 * w });
      if (elem === 'explosion') { glow(fx, x, y, z, 0.8 + w, '#ffab40', 0.25); fx.ring(x, y, 0.1, 0.8 + 0.6 * w, '#ffab40', 0.28, 0.1, { z, flat: 0.9, add: true }); }
      else embers(fx, x, y, z, Math.round(2 + 3 * w));
      break;
    case 'bluefire':
      flames(fx, x, y, z, Math.round(4 + 6 * w), E.spark);
      break;
    case 'magma':
      flames(fx, x, y, z, Math.round(3 + 5 * w), ['#ff6f00', '#bf360c', '#ffab40']);
      embers(fx, x, y, z, Math.round(4 + 5 * w));
      smoke(fx, x, y, z + 0.2, 2, ['#5d4037', '#4e342e'], { size: 0.25 });
      fx.add('scorch', { x, y: y + 0.12, r: 0.35 + 0.3 * w, life: 2.6 });
      break;
    case 'ice':
    case 'snow':
      shards(fx, x, y, z, Math.round(5 + 7 * w), E.spark, ang);
      fx.ring(x, y, 0.1, 0.6 + 0.4 * w, '#e1f5fe', 0.25, 0.07, { z, flat: 0.9, add: true });
      break;
    case 'lightning':
      miniBolts(fx, x, y, z, 2 + Math.round(w * 2), 0.7 + 0.5 * w, '#fff176');
      glow(fx, x, y, z, 0.6 + 0.5 * w, '#fff59d', 0.15);
      break;
    case 'water':
      splash(fx, x, y, z, Math.round(5 + 6 * w), ang);
      ripple(fx, x, y + 0.05, 0.8 + 0.5 * w, '#81d4fa');
      break;
    case 'sand':
      fx.burst(x, y, Math.round(8 + 8 * w), { angle: ang, spread: 2, speed: 4, z, vz: 1.5, g: 6, life: 0.5, size: 0.05, color: E.spark, kind: 'sand' });
      break;
    case 'smoke':
    case 'gas':
      smoke(fx, x, y, z, Math.round(3 + 3 * w), E.spark, { size: 0.28 });
      break;
    case 'light':
      glow(fx, x, y, z, 0.8 + 0.6 * w, '#fff9c4', 0.2);
      fx.add('flare', { x, y, z, size: 0.6 + 0.4 * w, color: '#fff9c4', life: 0.2 });
      break;
    case 'dark':
      smoke(fx, x, y, z, Math.round(3 + 4 * w), ['#1a0033', '#311b92', '#4a148c'], { speed: 1, size: 0.25 });
      fx.ring(x, y, 0.7 + 0.3 * w, 0.1, '#7e57c2', 0.3, 0.07, { z, flat: 0.9, noCore: true });
      break;
    case 'quake':
      fx.add('aircrack', { x, y, z, size: 0.5 + 0.6 * w, life: 0.4, color: '#e0f7fa' });
      break;
    case 'poison':
      fx.burst(x, y, Math.round(4 + 5 * w), { angle: ang, spread: 2.4, speed: 3.5, z, vz: 2, g: 9, life: 0.5, size: 0.09, color: E.spark, kind: 'drop' });
      fx.burst(x, y, 3, { speed: 0.8, z, vz: 0.8, g: -0.5, life: 0.7, size: 0.08, color: '#ce93d8', kind: 'bubble' });
      break;
    case 'haki':
      miniBolts(fx, x, y, z, 2, 0.7, '#7c4dff');
      break;
    case 'string':
      sparks(fx, x, y, z, ang, 4, ['#f8bbd0', '#ffffff'], { kind: 'line', size: 0.05 });
      break;
    default: break;
  }
}

function styleHit(fx, st, def, tgt, x, y, z, ang, w) {
  if (st.ripple) ripple(fx, x, y + 0.05, 0.6 + 0.6 * w, st.ripple, w > 0.6 ? 3 : 2);
  if (st.vibrate) vibration(fx, x, y, z, 0.5 + 0.7 * w, st.vibrate, w > 0.6 ? 4 : 2);
  if (st.sparkle) sparkle(fx, x, y, z, Math.round(2 + 3 * w), st.sparkle);
  if (st.clawMarks) fx.add('claw', { x: tgt.x, y: tgt.y, z: z * 0.95, angle: ang, size: 0.5 + 0.4 * w, color: st.clawMarks, life: 0.35 });
  if (st.bolt && w > 0.5) miniBolts(fx, x, y, z, 2, 0.8, st.bolt);
  if (st.pierce) fx.ring(x, y, 0.02, 0.32 + 0.25 * w, '#ffffff', 0.18, 0.04, { z, flat: 1, add: true });
  if (st.giant && w > 0.5) { fx.crack(tgt.x, tgt.y + 0.1, 0.8 + 0.5 * w, 1.6); dust(fx, tgt.x, tgt.y, 6, { speed: 3 }); }
  if (st.oni && w > 0.6) fx.add('flare', { x, y, z, size: 0.7, color: '#ff1744', life: 0.2 });
}

function blockFx(fx, tgt, ang, w, z) {
  const fa = ang + Math.PI;
  const px = tgt.x + Math.cos(fa) * 0.35, py = tgt.y + Math.sin(fa) * 0.22;
  fx.add('crescent', { x: tgt.x, y: tgt.y, angle: fa, radius: 0.62, arc: 1.8, width: 0.17, color: '#90caf9', core: '#ffffff', life: 0.22, z, reveal: 0.01, dir: 1, tilt: 0.85 });
  sparks(fx, px, py, z, fa, 4 + Math.round(3 * w), ['#e3f2fd', '#90caf9', '#ffffff'], { speed: 5, life: 0.2 });
  tgt._blockFlash = fx.game.env ? fx.game.env.time : fx.time;
}

/** A perfect parry: a clean flash, a ring, focus lines and a beat of slow motion. */
export function parryFx(fx, tgt, att, ang) {
  const fa = ang + Math.PI;
  const s = (tgt.look && tgt.look.scale) || 1;
  const px = tgt.x + Math.cos(fa) * 0.45, py = tgt.y + Math.sin(fa) * 0.3, z = 0.85 * s;
  fx.add('flare', { x: px, y: py, z, size: 1.3, color: '#fff59d', life: 0.36 });
  fx.add('impact', { x: px, y: py, z, angle: fa, size: 0.8, color: '#fff59d', core: '#ffffff', life: 0.2, spikes: 12, lines: 8 });
  fx.ring(tgt.x, tgt.y, 0.3, 2, '#fff59d', 0.4, 0.12, { add: true });
  sparks(fx, px, py, z, fa, 16, ['#ffffff', '#fff59d', '#ffe082'], { speed: 9, spread: 2.6, life: 0.35 });
  fx.callout(tgt.x, tgt.y - 1.45, 'PARRY!', '#fff59d', 0.5);
  fx.stop(0.12);
  if (tgt.isPlayer || (att && att.isPlayer)) {
    fx.slowmo(0.45, 0.3);
    fx.flashScreen(0.05);
    fx.kick(fa, 6);
    fx.focus(px, py, 0.28);
  }
}

/** Guard broken: the guard shatters, a jolt and a short slow-down. */
export function guardBreakFx(fx, tgt, att, ang) {
  const s = (tgt.look && tgt.look.scale) || 1, z = 0.85 * s;
  fx.burst(tgt.x, tgt.y, 14, { kind: 'shard', color: ['#e3f2fd', '#90caf9', '#ffffff'], speed: 6, z, vz: 3, g: 9, life: 0.55, size: 0.12, drag: 2 });
  fx.add('impact', { x: tgt.x, y: tgt.y, z, angle: ang, size: 0.75, color: '#ff8a65', core: '#ffffff', life: 0.2, spikes: 11 });
  fx.ring(tgt.x, tgt.y, 0.3, 1.6, '#ff7675', 0.35, 0.12, { add: true });
  fx.callout(tgt.x, tgt.y - 1.4, 'GUARD BREAK', '#ff7675', 0.42);
  if (tgt.isPlayer || (att && att.isPlayer)) { fx.slowmo(0.28, 0.4); fx.kick(ang, 7); fx.focus(tgt.x, tgt.y, 0.2); }
}

// ------------------------------------------------------------------ technique visuals
/**
 * Visuals for one step of a technique. `kind`: 'hit' (extra = hitbox),
 * 'proj' (extra = { projs }), 'dash', 'teleport' (extra = { x0, y0 }),
 * 'heal', 'pull', 'buff' (extra = { buff }), 'fx'. A signature in SIG
 * replaces the default look for that step (it may call DEFAULTS itself).
 */
export function techFx(fx, actor, s, a, kind, extra = {}) {
  const def = (a && a.def) || {};
  const f = SIG[def.id] && SIG[def.id][kind];
  try {
    if (f) f(fx, actor, s, a, extra);
    else if (DEFAULTS[kind]) DEFAULTS[kind](fx, actor, s, a, extra);
  } catch (e) {
    if (!fx._techWarned) { fx._techWarned = true; console.warn('technique fx', def.id, kind, e); }
  }
}

function beamStyle(el, def) {
  const s = SIG[def.id] && SIG[def.id].beam;
  if (s) return s;
  return { lightning: 'lightning', fire: 'fire', magma: 'fire', explosion: 'fire', light: 'light', ice: 'ice', snow: 'ice', sand: 'sand', quake: 'quake', string: 'string', dark: 'dark', water: 'water', smoke: 'wind', gas: 'wind' }[el] || 'energy';
}

function slashFx(fx, actor, a, h, ang, range, col, st, clip, o = {}) {
  const n = o.arcs || (st ? st.arcs || 1 : 1);
  const dir = o.dir || (clip && clip.sweep) || 1;
  const heavy = !!h.heavy;
  const baseW = o.width || (h.width ? h.width * 0.35 : heavy ? 0.34 : 0.22);
  const arc = h.arc ?? 1.8;
  const life = heavy ? 0.27 : 0.2;
  const x = actor.x + Math.cos(ang) * 0.12, y = actor.y + Math.sin(ang) * 0.08;
  if (h.shape === 'line') {
    // a straight cleave down the line
    const L = range;
    for (let i = 0; i < Math.max(1, n); i++) {
      const off = (i - (n - 1) / 2) * 0.22;
      fx.add('cutline', { x: actor.x, y: actor.y, x1: actor.x + Math.cos(ang) * L, y1: actor.y + Math.sin(ang) * L, off, z: 0.6, color: col, life: 0.4, delay: i * 0.03 });
    }
    fx.add('crescent', { x, y, angle: ang, radius: Math.min(2.2, range * 0.6), arc: 1.4, width: baseW, color: col, core: '#ffffff', dir, life, z: 0.65 });
    if (heavy) fx.crack(actor.x + Math.cos(ang) * L * 0.6, actor.y + Math.sin(ang) * L * 0.6, 0.9, 1.4);
    return;
  }
  for (let i = 0; i < n; i++) {
    fx.add('crescent', {
      x, y, angle: ang + (i - (n - 1) / 2) * 0.14 * dir, radius: range * (0.9 - i * 0.08), arc: arc * (1 - i * 0.07),
      width: baseW * (1 - i * 0.2), color: col, core: '#ffffff', dir, life: life + i * 0.02, delay: i * 0.022, z: 0.62 + (i - (n - 1) / 2) * 0.1, reveal: 0.14,
    });
  }
  if (st && st.giant) {
    fx.add('crescent', { x, y, angle: ang, radius: range * 1.08, arc: arc * 1.05, width: baseW * 1.7, color: '#ffe082', core: '#fffde7', dir, life: life + 0.05, z: 0.55 });
    if (heavy) { fx.crack(actor.x + Math.cos(ang) * range * 0.7, actor.y + Math.sin(ang) * range * 0.7, 1, 1.6); dust(fx, actor.x + Math.cos(ang) * range * 0.7, actor.y + Math.sin(ang) * range * 0.7, 6, { speed: 3 }); }
  }
}

function ringFx(fx, actor, a, h, hb, col, E, st) {
  const R = h.range || 2;
  const x = hb.x, y = hb.y + 0.4;
  fx.ring(x, y, 0.2, R, col, 0.36, 0.2, { add: !!E.add || col === '#ffffff' });
  fx.ring(x, y, 0.1, R * 0.7, '#ffffff', 0.26, 0.07, { add: true });
  if ((h.duration || 0) > 0.3) {
    for (let t = 0.12; t < h.duration; t += 0.14) fx.ring(x, y, 0.2, R * 0.9, col, 0.3, 0.1, { delay: t, add: true });
  }
  fx.burst(x, y, Math.round(8 + R * 3), { speed: R * 3, spread: TAU, kind: E.kind === 'drop' ? 'drop' : E.kind, color: E.spark, z: 0.45, vz: 1, g: 3, life: 0.4, size: 0.1 });
  const el = h.element || 'physical';
  if (el === 'lightning') miniBolts(fx, x, y, 0.6, 5, R * 0.9, '#fff176');
  else if (el === 'fire' || el === 'explosion') flames(fx, x, y, 0.3, 14, ELEM.fire.spark, { speed: R * 1.6 });
  else if (el === 'ice') ringSpikes(fx, x, y, R * 0.75, Math.round(R * 4), 'ice');
  else if (el === 'quake') { for (let i = 0; i < 3; i++) fx.add('aircrack', { x: x + rnd(-R, R) * 0.5, y: y + rnd(-R, R) * 0.3, z: rnd(0.6, 1.4), size: R * 0.3, life: 0.45, delay: i * 0.05 }); }
  else if (el === 'water') ripple(fx, x, y, R, '#81d4fa', 3);
  else if (el === 'dark') fx.add('vortex', { x, y, r: R * 0.7, kind: 'dark', life: 0.5, spin: -6 });
  else if (el === 'light') glow(fx, x, y, 0.8, R, '#fff9c4', 0.25);
  if (st && st.vibrate) vibration(fx, x, y, 0.7, R, st.vibrate, 3);
  if (st && st.sparkle) sparkle(fx, x, y, 0.8, 6, st.sparkle);
  if (h.heavy) { fx.crack(x, y, R * 0.7); dust(fx, x, y, Math.round(6 + R * 2), { speed: R * 1.5 }); }
}

function ringSpikes(fx, x, y, R, n, kind, col) {
  const pts = [];
  for (let i = 0; i < n; i++) { const th = (i / n) * TAU + rnd(-0.2, 0.2); const rr = R * rnd(0.55, 1); pts.push({ dx: Math.cos(th) * rr, dy: Math.sin(th) * rr * 0.62, h: rnd(0.5, 1.1), w: rnd(0.12, 0.2), delay: rr / R * 0.12, lean: Math.cos(th) * 0.25 }); }
  pts.sort((p, q) => p.dy - q.dy);
  fx.add('spikes', { x, y, pts, kind, color: col || (kind === 'ice' ? '#b3e5fc' : kind === 'sand' ? '#d7b56d' : '#8d6e63'), edge: kind === 'ice' ? '#e1f5fe' : '#5d4037', life: 1.1 });
}
function lineSpikes(fx, x, y, ang, L, kind, col, width = 0.6) {
  const pts = [];
  const n = Math.max(3, Math.round(L * 2.2));
  for (let i = 0; i < n; i++) {
    const d = ((i + 0.5) / n) * L, side = rnd(-width, width);
    pts.push({ dx: Math.cos(ang) * d - Math.sin(ang) * side, dy: (Math.sin(ang) * d + Math.cos(ang) * side), h: rnd(0.45, 1.0), w: rnd(0.1, 0.18), delay: (d / L) * 0.25, lean: Math.cos(ang) * 0.3 });
  }
  pts.sort((p, q) => p.dy - q.dy);
  fx.add('spikes', { x, y, pts, kind, color: col || (kind === 'ice' ? '#b3e5fc' : kind === 'sand' ? '#d7b56d' : '#8d6e63'), edge: kind === 'ice' ? '#e1f5fe' : '#6d4c41', life: 1.2 });
}

function beamFx(fx, actor, s, a, h, ang, range, col, E) {
  const style = beamStyle(h.element, a.def);
  fx.beam(actor.x, actor.y, ang, range, h.width || 0.6, col, h.duration ? Math.max(0.26, h.duration) : 0.3, s.core || '#ffffff', { style });
  fx.add('flare', { x: actor.x + Math.cos(ang) * 0.5, y: actor.y + Math.sin(ang) * 0.35, z: 0.75, size: 0.6 + (h.width || 0.6) * 0.3, color: col, life: 0.22 });
  const W = h.width || 0.6;
  if (style === 'ice') lineSpikes(fx, actor.x, actor.y, ang, range, 'ice', null, W * 0.5);
  else if (style === 'sand') lineSpikes(fx, actor.x, actor.y, ang, range, 'sand', null, W * 0.5);
  else if (style === 'quake') {
    for (let i = 1; i <= 4; i++) { const d = (i / 4.5) * range; fx.add('aircrack', { x: actor.x + Math.cos(ang) * d, y: actor.y + Math.sin(ang) * d, z: rnd(0.5, 1.2), size: W * 0.6 + 0.3, life: 0.5, delay: i * 0.04 }); }
    fx.crack(actor.x + Math.cos(ang) * range * 0.5, actor.y + Math.sin(ang) * range * 0.5, range * 0.35, 2);
  } else if (style === 'lightning') {
    for (let i = 0; i < 3; i++) { const d = rnd(0.3, 1) * range; const px = actor.x + Math.cos(ang) * d, py = actor.y + Math.sin(ang) * d; miniBolts(fx, px, py, 0.7, 1, W * 1.5, '#fff176'); }
  } else if (style === 'fire') {
    for (let i = 0; i < 6; i++) { const d = rnd(0.2, 1) * range; flames(fx, actor.x + Math.cos(ang) * d, actor.y + Math.sin(ang) * d, 0.6, 2, ELEM.fire.spark, { speed: 1 }); }
  }
  if (h.heavy) { const ex = actor.x + Math.cos(ang) * range, ey = actor.y + Math.sin(ang) * range; glow(fx, ex, ey, 0.7, W * 1.6, col, 0.3); }
}

/** Default swing look for fists and feet: a leg arc or a puff of pushed air, plus the style's accent. */
function swingFx(fx, actor, a, h, hb, ang, range, col, E, st, clip) {
  const reachPt = (h.offset ?? 0) * (actor.reach ?? 1) + range * 0.62;
  const px = actor.x + Math.cos(ang) * reachPt, py = actor.y + Math.sin(ang) * reachPt * 0.8;
  const legs = !!(clip && (clip.legs || clip.limb === 'fF' || clip.limb === 'fB'));
  const z = legs ? 0.55 : 0.8;
  const heavy = !!h.heavy;
  const diable = actor.buffs && actor.buffs.some((b) => b.id === 'diable');
  if (legs) {
    // the swing already happened by the hit frame: the arc appears swept, then fades
    fx.add('crescent', { x: actor.x, y: actor.y, angle: ang, radius: range * 0.85, arc: heavy ? 2 : 1.6, width: heavy ? 0.3 : 0.2, color: diable ? '#ff9800' : (st && st.legArc) || col, core: diable ? '#ffeb3b' : '#ffffff', dir: (clip && clip.sweep) || -1, life: heavy ? 0.26 : 0.2, z: 0.5, tilt: 0.62, reveal: 0.08 });
    if (diable) flames(fx, px, py, z, 5, ELEM.fire.spark, { speed: 2 });
  } else {
    fx.burst(px, py, heavy ? 5 : 3, { angle: ang, spread: 0.35, speed: 7, kind: 'line', color: 'rgba(255,255,255,0.85)', z, vz: 0, g: 0, life: 0.12, size: 0.05, drag: 2 });
  }
  if (heavy) fx.ring(px, py, 0.1, 0.7, '#ffffff', 0.2, 0.06, { z, flat: 1, add: true });
  if (st) {
    if (st.ripple) { fx.ring(px, py, 0.04, 0.45, st.ripple, 0.28, 0.05, { z, flat: 1, wobble: 0.1, add: true }); splash(fx, px, py, z, 3, ang); }
    if (st.pierce && !legs) fx.ring(px, py, 0.02, 0.22, '#ffffff', 0.14, 0.035, { z, flat: 1, add: true });
    if (st.sparkle) sparkle(fx, px, py, z, 2, st.sparkle);
    if (st.bolt) miniBolts(fx, px, py, z, 1, 0.45, st.bolt);
    if (st.vibrate) fx.ring(px, py, 0.05, 0.38, st.vibrate, 0.2, 0.04, { z, flat: 0.9, wobble: 0.25, lobes: 12, add: true });
    if (st.clawMarks) sparks(fx, px, py, z, ang, 3, ['#ffffff'], { kind: 'line', speed: 5, spread: 0.6, size: 0.05 });
  }
  if (h.element && h.element !== 'physical' && !diable) fx.burst(px, py, 4, { kind: E.kind === 'spark' ? 'spark' : E.kind, color: E.spark, z, speed: 2, g: -1, life: 0.3, size: 0.12 });
}

function ghostsAlong(fx, actor, x0, y0, n, tint, o = {}) {
  const w = fx.game.world;
  const dx = w ? w.dx(x0, actor.x) : actor.x - x0, dy = actor.y - y0;
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    afterimage(fx, actor, { x: x0 + dx * k, y: y0 + dy * k, tint, life: 0.2 + k * 0.15, alpha: 0.25 + 0.3 * k, add: o.add });
  }
}

function muzzle(fx, actor, ang, col = '#ffe082') {
  const mx = actor.x + Math.cos(ang) * 0.62, my = actor.y + Math.sin(ang) * 0.45;
  fx.add('flare', { x: mx, y: my, z: 0.8, size: 0.45, color: col, life: 0.1, rot: ang });
  glow(fx, mx, my, 0.8, 0.5, col, 0.1);
  sparks(fx, mx, my, 0.8, ang, 3, ['#ffffff', col], { speed: 6, spread: 0.6, life: 0.12, size: 0.05 });
  smoke(fx, mx, my, 0.8, 2, ['#eceff1', '#cfd8dc'], { speed: 0.6, size: 0.14, life: 0.45, angle: ang, spread: 0.8 });
}

const DEFAULTS = {
  hit(fx, actor, s, a, hb) {
    const h = s.hit, def = a.def;
    const ang = hb.angle;
    const reach = actor.reach ?? 1;
    const E = elemOf(h.element);
    const st = styleOf(def, actor);
    const col = s.color || h.color || (h.element && h.element !== 'physical' ? E.c : st ? st.trail : '#ffffff');
    const vfx = s.vfx || h.vfx;
    const clip = clipOf(actor, a);
    const range = (h.range || 1.4) * (h.shape === 'circle' ? 1 : reach);
    if (vfx === 'stab') {
      // a straight thrust: a bright line to the tip, a glint and speed lines
      const x1 = actor.x + Math.cos(ang) * range, y1 = actor.y + Math.sin(ang) * range;
      fx.add('cutline', { x: actor.x + Math.cos(ang) * 0.3, y: actor.y + Math.sin(ang) * 0.2, x1, y1, z: 0.7, color: col, life: 0.22 });
      fx.add('flare', { x: x1, y: y1, z: 0.7, size: 0.55, color: col === '#ffffff' ? '#e3f2fd' : col, life: 0.16, rot: ang });
      fx.burst(x1, y1, 4, { angle: ang, spread: 0.4, speed: 7, kind: 'line', color: '#ffffff', z: 0.7, vz: 0, g: 0, life: 0.14, size: 0.05 });
      return;
    }
    if (vfx === 'slash' || (!vfx && h.slashing)) slashFx(fx, actor, a, h, ang, range, col, st, clip);
    else if (vfx === 'ring' || h.shape === 'circle' || h.shape === 'ring') ringFx(fx, actor, a, h, hb, col, E, st);
    else if (vfx === 'beam' || h.shape === 'line') beamFx(fx, actor, s, a, h, ang, range, col, E);
    else swingFx(fx, actor, a, h, hb, ang, range, col, E, st, clip);
  },
  proj(fx, actor, s, a) {
    const p = s.proj;
    const ang = a.angle + (s.angleOffset || 0);
    const E = elemOf(p.element);
    const col = p.color || E.c;
    const gun = weaponFor(a.def, actor) === 'gun' || p.sprite === 'bullet';
    const hx = actor.x + Math.cos(ang) * 0.55, hy = actor.y + Math.sin(ang) * 0.4;
    if (gun) muzzle(fx, actor, ang, p.element === 'fire' ? '#ff9800' : '#ffe082');
    else if (p.element && p.element !== 'physical') {
      glow(fx, hx, hy, 0.8, 0.7 + (p.size || 1) * 0.2, col, 0.18);
      fx.burst(hx, hy, 5, { angle: ang, spread: 1.2, speed: 3, kind: E.kind, color: E.spark, z: 0.8, vz: 0.5, g: 0, life: 0.3, size: 0.12 });
    } else fx.ring(hx, hy, 0.05, 0.45, col === '#ffffff' ? '#ffffff' : col, 0.18, 0.05, { z: 0.8, flat: 1, add: true });
  },
  dash(fx, actor, s, a) {
    const d = s.dash;
    const ang = a.angle + (s.angleOffset || 0);
    actor._ghostT = d.time + 0.05;
    actor._ghostTint = d.trail || (d.hit ? '#e3f2fd' : '#ffffff');
    dust(fx, actor.x, actor.y, 6, { angle: ang + Math.PI, spread: 1.3, speed: 3 });
    fx.add('streaks', { follow: actor, angle: ang, life: d.time + 0.08, color: d.trail || '#ffffff' });
    if (d.air) fx.ring(actor.x, actor.y, 0.1, 0.9, '#ffffff', 0.3, 0.08, { z: 0.1, flat: 0.5, add: true });
    if (d.trail) fx.burst(actor.x, actor.y, 8, { color: d.trail, speed: 2, g: 0, life: 0.3, kind: 'smoke', size: 0.25, z: 0.5 });
    const wk = weaponFor(a.def, actor);
    if (wk === 'sword' || (d.hit && d.hit.slashing)) {
      const x0 = actor.x, y0 = actor.y;
      const n = wk === 'sword' ? Math.min(3, actor.weapon ? actor.weapon.count || 1 : 1) : 1;
      for (let i = 0; i < n; i++) {
        fx.add('cutline', { x: x0, y: y0, x1: x0, y1: y0, off: (i - (n - 1) / 2) * 0.28, z: 0.65 + (i - 1) * 0.12, color: '#e3f2fd', life: 0.5, delay: d.time + 0.03 + i * 0.03, onStart: (sh) => { sh.x1 = actor.x; sh.y1 = actor.y; } });
      }
    }
  },
  teleport(fx, actor, s, a, ex) {
    const col = s.teleport.color || '#ffffff';
    ghostsAlong(fx, actor, ex.x0, ex.y0, 3, col);
    fx.burst(ex.x0, ex.y0, 10, { color: col, speed: 3, g: 0, life: 0.25, kind: 'line', z: 0.6 });
    fx.burst(actor.x, actor.y, 10, { color: col, speed: 3, g: 0, life: 0.25, kind: 'line', z: 0.6 });
    fx.add('flare', { x: actor.x, y: actor.y, z: 0.8, size: 0.6, color: col, life: 0.2 });
  },
  heal(fx, actor, s) {
    const col = s.color || '#80deea';
    flames(fx, actor.x, actor.y, 0.3, 14, [col, '#ffffff', col], { speed: 1.5, vz: 2.5, life: 0.9, size: 0.18 });
    fx.ring(actor.x, actor.y, 0.2, 1.3, col, 0.5, 0.1, { z: 0.1, flat: 0.55, add: true });
    sparkle(fx, actor.x, actor.y, 1.2, 4, [col, '#ffffff']);
  },
  pull(fx, actor, s, a) {
    const R = s.pull.range;
    const col = s.color || '#7e57c2';
    const ang = a.angle;
    fx.add('vortex', { x: actor.x + Math.cos(ang) * 0.6, y: actor.y + Math.sin(ang) * 0.4, r: 1.1, kind: 'dark', life: 0.6, spin: -8, arms: 5 });
    fx.ring(actor.x, actor.y, R, 0.3, col, 0.5, 0.3);
    for (let i = 0; i < 18; i++) {
      const th = rnd(0, TAU), rr = R * rnd(0.5, 0.95);
      fx.particle({ x: actor.x + Math.cos(th) * rr, y: actor.y + Math.sin(th) * rr * 0.7, z: rnd(0.3, 1.2), vx: -Math.cos(th) * rr * 2.2, vy: -Math.sin(th) * rr * 1.6, vz: 0, g: 0, drag: 0.5, life: 0.45, size: 0.12, color: i % 2 ? '#311b92' : '#7e57c2', kind: 'spark', add: false });
    }
  },
  buff(fx, actor, s, a, ex) {
    const b = (ex && ex.buff) || s.buff || {};
    const col = b.aura || '#ffffff';
    fx.ring(actor.x, actor.y, 0.2, 1.8, col, 0.45, 0.14, { add: true });
    fx.burst(actor.x, actor.y, 16, { color: [col, '#ffffff'], speed: 4, z: 0.7, vz: 2, g: 2, life: 0.5, kind: 'spark' });
    fx.add('pillar', { x: actor.x, y: actor.y, r: 0.5, h: 2.6, color: col, life: 0.35, kind: 'light' });
  },
  fx(fx, actor, s) {
    const f = s.fx;
    const col = f.color || '#ffffff';
    if (f.ring) fx.ring(actor.x, actor.y, 0.3, f.ring, col, f.life || 0.45, f.width || 0.2, { add: col !== '#000000' && col !== '#212121' });
    if (f.burst) fx.burst(actor.x, actor.y, f.burst, { color: col, speed: f.speed || 5, g: f.g ?? 2, life: f.life || 0.5, kind: f.kind || 'spark', size: f.size || 0.14, z: 0.8 });
    if (f.shake) fx.shake(f.shake);
    if (f.impact) fx.impactFrame(f.impact);
    if (f.flash) fx.flashScreen(f.flash);
    if (f.text) fx.callout(actor.x, actor.y - 2.2, f.text, f.color || '#fff', 0.5, { life: 1.1 });
  },
};

// ------------------------------------------------------------------ signatures
const SIG = {};
function sig(ids, o) { for (const id of ids.split(/\s+/)) if (id) SIG[id] = { ...(SIG[id] || {}), ...o }; }
const fwd = (actor, ang, d, zy = 0.8) => [actor.x + Math.cos(ang) * d, actor.y + Math.sin(ang) * d * zy];

// ---- swords
sig('itto_pound santo_108', {
  proj(fx, actor, s, a) {
    const n = a.def.id === 'santo_108' ? 3 : 1;
    for (let i = 0; i < n; i++) fx.add('crescent', { x: actor.x, y: actor.y, angle: a.angle, radius: 1.3 - i * 0.1, arc: 2, width: 0.2, color: '#e3f2fd', dir: 1, life: 0.2, delay: i * 0.03, z: 0.55 + i * 0.12 });
  },
});
sig('itto_whirl', {
  hit(fx, actor, s, a, hb) {
    fx.add('vortex', { x: actor.x, y: actor.y, r: 2.4, h: 2, kind: 'wind', color: '#b3e5fc', color2: '#ffffff', life: 0.7, spin: 14, follow: actor });
    for (let i = 0; i < 5; i++) fx.add('crescent', { x: actor.x, y: actor.y, follow: actor, angle: a.angle + i * 1.3, radius: 2.1, arc: 2.2, width: 0.2, color: '#e3f2fd', dir: 1, life: 0.2, delay: i * 0.11, z: 0.6 });
  },
});
sig('nito_nigiri santo_onigiri', {
  dash(fx, actor, s, a) {
    DEFAULTS.dash(fx, actor, s, a);
    const d = s.dash, x0 = actor.x, y0 = actor.y, oni = a.def.id === 'santo_onigiri';
    // an X of cuts where the blades passed
    for (const [off, z] of [[-0.35, 0.3], [0.35, 1.1]]) {
      fx.add('cutline', { x: x0, y: y0, x1: x0, y1: y0, off, z, color: oni ? '#ffcdd2' : '#e3f2fd', life: 0.55, delay: d.time + 0.08, onStart: (sh) => { sh.x1 = actor.x; sh.y1 = actor.y; } });
    }
    if (oni) actor._ghostTint = '#ff8a80';
  },
});
sig('santo_heavy', {
  hit(fx, actor, s, a, hb) {
    const h = s.hit, ang = hb.angle, R = (h.range || 2.4) * (actor.reach ?? 1);
    // Tora Gari: two crossing cuts
    for (const [dir, z] of [[1, 0.9], [-1, 0.45]]) fx.add('crescent', { x: actor.x, y: actor.y, angle: ang, radius: R * 0.9, arc: 1.9, width: 0.3, color: '#e8f5e9', dir, life: 0.28, z, tilt: 0.55 });
    fx.add('flare', { x: actor.x + Math.cos(ang) * R * 0.7, y: actor.y + Math.sin(ang) * R * 0.5, z: 0.7, size: 0.9, color: '#ff5252', life: 0.22 });
  },
});
sig('santo_sanzen', {
  fx(fx, actor, s, a) {
    DEFAULTS.fx(fx, actor, s, a);
    if (!s.fx.ring) return;
    // windmill blades spinning during the wind-up
    for (let i = 0; i < 6; i++) fx.add('crescent', { x: actor.x, y: actor.y, follow: actor, angle: a.angle + i * 2.1, radius: 1.2, arc: 2.6, width: 0.16, color: '#e8f5e9', dir: 1, life: 0.2, delay: i * 0.09, z: 0.7 + (i % 3 - 1) * 0.25 });
  },
  dash(fx, actor, s, a) {
    DEFAULTS.dash(fx, actor, s, a);
    const d = s.dash, x0 = actor.x, y0 = actor.y;
    for (let i = 0; i < 3; i++) fx.add('cutline', { x: x0, y: y0, x1: x0, y1: y0, off: (i - 1) * 0.4, z: 0.4 + i * 0.35, color: '#e8f5e9', life: 0.6, delay: d.time + 0.05 + i * 0.04, onStart: (sh) => { sh.x1 = actor.x; sh.y1 = actor.y; } });
  },
});
sig('santo_asura', {
  fx(fx, actor, s, a) {
    DEFAULTS.fx(fx, actor, s, a);
    smoke(fx, actor.x, actor.y, 0.6, 10, ['#212121', '#424242', '#000000'], { speed: 2, size: 0.4 });
  },
});

// ---- Black Leg
sig('bleg_party', {
  hit(fx, actor, s, a, hb) {
    for (let i = 0; i < 6; i++) fx.add('crescent', { x: actor.x, y: actor.y, follow: actor, angle: a.angle + i * 1.05, radius: 2.1, arc: 2.4, width: 0.18, color: '#ffe0b2', dir: -1, life: 0.18, delay: i * 0.08, z: 0.35 + (i % 2) * 0.35, tilt: 0.6 });
    dust(fx, actor.x, actor.y, 8, { speed: 3 });
  },
});
sig('bleg_antimanner', {
  hit(fx, actor, s, a, hb) {
    const [px, py] = fwd(actor, hb.angle, 1.1);
    fx.add('pillar', { x: px, y: py, r: 0.28, h: 3, color: '#ffe0b2', life: 0.3, kind: 'light' });
    sparks(fx, px, py, 0.8, -Math.PI / 2, 10, ['#ffffff', '#ffe0b2'], { spread: 0.8, speed: 8, g: 2 });
    fx.add('crescent', { x: actor.x, y: actor.y, angle: hb.angle, radius: 1.2, arc: 1.6, width: 0.2, color: '#ffe0b2', dir: -1, life: 0.2, z: 0.9, tilt: 1.3 });
  },
});
sig('bleg_concasse', {
  hit(fx, actor, s, a, hb) {
    DEFAULTS.hit(fx, actor, s, a, hb);
    fx.add('pillar', { x: hb.x, y: hb.y + 0.4, r: 0.35, h: 3.5, color: '#ffffff', life: 0.18, kind: 'light' });
    for (let i = 0; i < 3; i++) fx.add('aircrack', { x: hb.x + rnd(-0.6, 0.6), y: hb.y + 0.4 + rnd(-0.3, 0.3), z: 0.15, size: 0.7, life: 0.5, color: '#ffe0b2' });
  },
});
sig('bleg_diable', {
  fx(fx, actor, s, a) {
    for (let i = 0; i < 3; i++) fx.add('crescent', { x: actor.x, y: actor.y, follow: actor, angle: i * 2.1, radius: 0.9, arc: 3, width: 0.22, color: '#ff7043', core: '#ffeb3b', dir: 1, life: 0.3, delay: i * 0.1, z: 0.3 + i * 0.15, tilt: 0.5 });
    flames(fx, actor.x, actor.y, 0.3, 20, ELEM.fire.spark, { speed: 2.5 });
  },
  buff(fx, actor, s, a, ex) {
    DEFAULTS.buff(fx, actor, s, a, ex);
    fx.add('pillar', { x: actor.x, y: actor.y, r: 0.55, h: 2.4, color: '#ff7043', life: 0.4, kind: 'fire' });
  },
});
const skyStep = {
  dash(fx, actor, s, a) {
    DEFAULTS.dash(fx, actor, s, a);
    // kicking the air: rings under the feet along the way
    for (let i = 1; i <= 3; i++) fx.add('ring', { x: actor.x, y: actor.y, r0: 0.1, r1: 0.8, color: '#ffffff', width: 0.07, life: 0.3, z: 0.05, flat: 0.5, add: true, delay: i * s.dash.time / 3.5, onStart: (sh) => { sh.x = actor.x; sh.y = actor.y; } });
  },
};
sig('bleg_skywalk roku_geppo', skyStep);

// ---- Fish-Man Karate
sig('fmk_arabesque fmk_vagabond', {
  proj(fx, actor, s, a) {
    const [px, py] = fwd(actor, a.angle, 0.6);
    ripple(fx, px, py, 0.9, '#81d4fa', 3);
    splash(fx, px, py, 0.8, 10, a.angle);
    if (a.def.id === 'fmk_vagabond') for (let i = 0; i < 4; i++) fx.ring(px, py, 0.05, 0.5 + i * 0.12, '#4fc3f7', 0.3, 0.06, { z: 0.8, flat: 1, wobble: 0.15, delay: i * 0.05, add: true });
  },
});
sig('fmk_5000 fmk_heavy', {
  hit(fx, actor, s, a, hb) {
    const [px, py] = fwd(actor, hb.angle, 1.2);
    for (let i = 0; i < 4; i++) fx.ring(px, py, 0.1, 0.9 + i * 0.45, '#81d4fa', 0.45, 0.08, { z: 0.8, flat: 0.9, wobble: 0.12, delay: i * 0.05, add: true });
    splash(fx, px, py, 0.8, 14, hb.angle);
  },
});

// ---- Rokushiki
sig('roku_soru', {
  teleport(fx, actor, s, a, ex) {
    ghostsAlong(fx, actor, ex.x0, ex.y0, 4, '#eceff1');
    dust(fx, ex.x0, ex.y0, 8, { speed: 3.5 });
    fx.ring(ex.x0, ex.y0, 0.2, 1.1, '#ffffff', 0.3, 0.08, { z: 0.05, flat: 0.5, add: true });
    fx.burst(actor.x, actor.y, 8, { color: '#ffffff', speed: 4, g: 0, life: 0.2, kind: 'line', z: 0.6 });
  },
});
sig('roku_rankyaku', {
  proj(fx, actor, s, a) {
    fx.add('crescent', { x: actor.x, y: actor.y, angle: a.angle, radius: 1.3, arc: 2.2, width: 0.26, color: '#e3f2fd', dir: -1, life: 0.22, z: 0.5, tilt: 0.6 });
    const [px, py] = fwd(actor, a.angle, 0.9);
    fx.burst(px, py, 6, { angle: a.angle, spread: 0.5, speed: 8, kind: 'line', color: '#ffffff', z: 0.6, g: 0, life: 0.18, size: 0.05 });
  },
});
sig('roku_heavy', {
  hit(fx, actor, s, a, hb) {
    const h = s.hit;
    for (let t = 0; t < (h.duration || 0.4); t += 0.06) {
      const d = rnd(0.6, 1.4), th = hb.angle + rnd(-0.35, 0.35);
      const [px, py] = fwd(actor, th, d);
      fx.ring(px, py, 0.02, 0.3, '#ffffff', 0.15, 0.035, { z: rnd(0.6, 1.1), flat: 1, delay: t, add: true });
    }
  },
});
sig('roku_rokuogan', {
  hit(fx, actor, s, a, hb) {
    const [px, py] = fwd(actor, hb.angle, 1.3);
    for (let i = 0; i < 4; i++) fx.ring(px, py, 0.1, 1.2 + i * 0.6, '#e0f7fa', 0.5, 0.12, { z: 0.8, flat: 0.85, wobble: 0.1, delay: i * 0.04, add: true });
    fx.add('aircrack', { x: px, y: py, z: 0.8, size: 1.5, life: 0.5 });
    fx.focus(px, py, 0.3);
  },
});
sig('roku_tekkai', { buff(fx, actor, s, a, ex) { DEFAULTS.buff(fx, actor, s, a, ex); sparks(fx, actor.x, actor.y, 0.9, 0, 10, ['#cfd8dc', '#ffffff'], { spread: TAU, speed: 3, size: 0.06 }); } });
sig('roku_kamie', { buff(fx, actor) { fx.burst(actor.x, actor.y, 14, { kind: 'petal', color: ['#ffffff', '#f5f5f5'], speed: 2.5, z: 0.9, vz: 1, g: -0.2, life: 0.9, size: 0.12 }); } });

// ---- Okama Kenpo
sig('okama_pirouette', {
  hit(fx, actor, s, a) {
    for (let i = 0; i < 5; i++) fx.add('crescent', { x: actor.x, y: actor.y, follow: actor, angle: a.angle + i * 1.25, radius: 1.9, arc: 2.2, width: 0.16, color: '#f8bbd0', dir: -1, life: 0.18, delay: i * 0.09, z: 0.3 + (i % 2) * 0.5, tilt: 0.6 });
    sparkle(fx, actor.x, actor.y, 0.9, 10, STYLE_FX.okama_kenpo.sparkle);
  },
});
sig('okama_swan_dash', {
  dash(fx, actor, s, a) {
    DEFAULTS.dash(fx, actor, s, a);
    actor._ghostTint = '#f8bbd0';
    fx.burst(actor.x, actor.y, 12, { kind: 'petal', color: ['#ffffff', '#f8bbd0'], speed: 2, z: 0.8, vz: 1, g: -0.3, life: 0.8, size: 0.1 });
  },
});
sig('okama_hell_wink', {
  proj(fx, actor, s, a) {
    const [px, py] = fwd(actor, a.angle, 0.35);
    fx.add('flare', { x: px, y: py, z: 1.25, size: 0.8, color: '#f48fb1', life: 0.3 });
    sparkle(fx, px, py, 1.2, 6, STYLE_FX.okama_kenpo.sparkle);
  },
});
sig('okama_heavy', {
  hit(fx, actor, s, a, hb) {
    const ang = hb.angle, L = (s.hit.range || 2.4) * (actor.reach ?? 1);
    fx.add('cutline', { x: actor.x, y: actor.y, x1: actor.x + Math.cos(ang) * L, y1: actor.y + Math.sin(ang) * L, z: 0.5, color: '#f8bbd0', life: 0.4 });
    sparkle(fx, actor.x + Math.cos(ang) * L * 0.6, actor.y + Math.sin(ang) * L * 0.6, 0.8, 6, STYLE_FX.okama_kenpo.sparkle);
  },
});

// ---- Electro, Hasshoken, Weather, Elbaf, Dragon Claw, Sniper
sig('elec_discharge', {
  hit(fx, actor, s, a, hb) {
    DEFAULTS.hit(fx, actor, s, a, hb);
    for (let i = 0; i < 8; i++) { const th = (i / 8) * TAU + rnd(-0.2, 0.2); fx.bolt(actor.x, actor.y, actor.x + Math.cos(th) * 2.6, actor.y + Math.sin(th) * 1.8, '#fff176', 0.22, 0.05, { z0: 0.9, z1: rnd(0.1, 1), branches: 1 }); }
    glow(fx, actor.x, actor.y, 0.9, 2.2, '#fff59d', 0.25);
  },
});
sig('elec_heavy ryu_claw neko_claw kuro_claws', {
  hit(fx, actor, s, a, hb) {
    const h = s.hit, R = (h.range || 1.8) * (actor.reach ?? 1);
    const col = a.def.id === 'elec_heavy' ? '#fff59d' : a.def.id === 'neko_claw' ? '#ffcc80' : '#ffffff';
    const [px, py] = fwd(actor, hb.angle, R * 0.65);
    fx.add('claw', { x: px, y: py, z: 0.8, angle: hb.angle, size: 0.9 + R * 0.2, color: col, life: 0.4, n: a.def.id === 'ryu_claw' ? 4 : 3 });
    if (a.def.id === 'elec_heavy') miniBolts(fx, px, py, 0.8, 3, 1, '#fff176');
    if (a.def.id === 'ryu_claw') fx.crack(px, py + 0.1, 0.8, 1.6);
  },
});
sig('elec_sulong', {
  buff(fx, actor, s, a, ex) {
    DEFAULTS.buff(fx, actor, s, a, ex);
    fx.add('pillar', { x: actor.x, y: actor.y, r: 0.9, h: 6, color: '#ffffff', core: '#fffde7', life: 0.6, kind: 'light' });
    glow(fx, actor.x, actor.y, 2.5, 1.5, '#fffde7', 0.6);
  },
});
sig('hassho_bushin', { proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.6); vibration(fx, px, py, 0.8, 1, '#ffcc80', 4); } });
sig('hassho_heavy', { hit(fx, actor, s, a, hb) { const [px, py] = fwd(actor, hb.angle, 1); vibration(fx, px, py, 0.8, 1.6, '#ffcc80', 5); } });
sig('hassho_drill', { dash(fx, actor, s, a) { DEFAULTS.dash(fx, actor, s, a); fx.add('vortex', { x: actor.x, y: actor.y, follow: actor, r: 0.9, h: 1.4, kind: 'wind', color: '#ffe0b2', life: s.dash.time + 0.1, spin: 20 }); } });
sig('clima_heavy clima_cyclone', {
  proj(fx, actor, s, a) {
    const [px, py] = fwd(actor, a.angle, 0.9);
    if (a.def.id === 'clima_cyclone') fx.add('vortex', { x: px, y: py, r: 0.7, h: 1.1, kind: 'wind', color: '#b3e5fc', life: 0.4, spin: 16 });
    else { glow(fx, px, py, 0.9, 0.7, '#ff8a65', 0.3); fx.burst(px, py, 6, { kind: 'bubble', color: '#ffccbc', speed: 1, z: 0.9, vz: 1, g: -1, life: 0.6, size: 0.08 }); }
  },
});
sig('clima_thunderbolt', {
  zone(fx, actor, spec, a, zone) {
    fx.add('zone', { x: zone.x, y: zone.y, r: zone.r, kind: 'thunder', color: zone.color, zone, life: 1e6 });
    fx.add('cloud', { x: zone.x, y: zone.y, r: 1.6, z: 4.5, life: 1, color: '#37474f' });
    // bubbles of weather rising from the Clima-Tact
    const [px, py] = fwd(actor, a.angle, 0.8);
    fx.burst(px, py, 8, { kind: 'bubble', color: ['#b3e5fc', '#e1f5fe'], speed: 1, z: 1, vz: 2.5, g: -1, life: 0.7, size: 0.09 });
    return true;
  },
});
sig('clima_mirage', { buff(fx, actor, s, a, ex) { fx.ring(actor.x, actor.y, 0.2, 1.4, '#e1f5fe', 0.5, 0.06, { wobble: 0.2, add: true }); sparkle(fx, actor.x, actor.y, 0.9, 6, ['#ffffff', '#e1f5fe']); void ex; } });
sig('clima_zeus', {
  hit(fx, actor, s, a, hb) {
    DEFAULTS.hit(fx, actor, s, a, hb);
    const L = (s.hit.range || 12) * (actor.reach ?? 1);
    const ex = actor.x + Math.cos(hb.angle) * L * 0.7, ey = actor.y + Math.sin(hb.angle) * L * 0.7;
    fx.bolt(ex, ey - 0.01, ex, ey, '#fff176', 0.35, 0.12, { z0: 9, z1: 0.1, branches: 3 });
    fx.flashScreen(0.08, 'rgba(255,253,231,1)');
  },
});
sig('elbaf_heavy', {
  hit(fx, actor, s, a, hb) {
    const R = s.hit.range || 2.3;
    fx.add('crescent', { x: actor.x, y: actor.y, angle: a.angle, radius: R, arc: TAU * 0.95, width: 0.42, color: '#ffe082', core: '#fffde7', dir: 1, life: 0.35, z: 0.45, reveal: 0.35 });
    fx.crack(actor.x, actor.y, R * 0.8);
    dust(fx, actor.x, actor.y, 14, { speed: R * 1.8, size: 0.26 });
    fx.ring(actor.x, actor.y, 0.3, R * 1.2, '#ffe082', 0.35, 0.14, { z: 0.05, flat: 0.55, add: true });
  },
});
sig('elbaf_hakoku', {
  hit(fx, actor, s, a, hb) {
    DEFAULTS.hit(fx, actor, s, a, hb);
    const L = (s.hit.range || 8) * (actor.reach ?? 1);
    for (let i = 1; i <= 3; i++) fx.crack(actor.x + Math.cos(hb.angle) * L * i / 4, actor.y + Math.sin(hb.angle) * L * i / 4, 0.9, 1.8);
  },
});
sig('ryu_heavy', {
  hit(fx, actor, s, a, hb) {
    DEFAULTS.hit(fx, actor, s, a, hb);
    for (let i = 0; i < 4; i++) { const th = (i / 4) * TAU + 0.4; fx.add('claw', { x: actor.x + Math.cos(th) * 1.3, y: actor.y + Math.sin(th) * 0.9, z: 0.5, angle: th, size: 0.9, color: '#ffab91', life: 0.45, delay: i * 0.04 }); }
  },
});
sig('snipe_kabuto', { proj(fx, actor, s, a) { muzzle(fx, actor, a.angle, '#ffe082'); sparkle(fx, actor.x + Math.cos(a.angle) * 0.7, actor.y + Math.sin(a.angle) * 0.5, 0.8, 4, ['#ffeb3b', '#ffffff']); } });
sig('snipe_popgreen', {
  zone(fx, actor, spec, a, zone) {
    fx.add('zone', { x: zone.x, y: zone.y, r: zone.r, kind: 'plant', color: zone.color, zone, life: 1e6 });
    fx.burst(zone.x, zone.y, 12, { kind: 'leaf', color: ['#43a047', '#66bb6a', '#2e7d32'], speed: 3, z: 0.4, vz: 3, g: 6, life: 0.8, size: 0.12 });
    return true;
  },
});

// ---- Gomu Gomu
sig('gomu_pistol gomu_gear3', {
  proj(fx, actor, s, a) {
    const big = a.def.id === 'gomu_gear3';
    const [px, py] = fwd(actor, a.angle, 0.4);
    fx.ring(px, py, 0.05, big ? 1.4 : 0.6, '#ffffff', 0.2, big ? 0.12 : 0.06, { z: 0.8, flat: 1, add: true });
    if (big) { smoke(fx, px, py, 0.8, 8, ['#ffffff', '#eceff1'], { speed: 2.5, size: 0.35 }); fx.shake(0.2, a.angle); }
  },
});
sig('gomu_gatling', {
  hit(fx, actor, s, a, hb) {
    fx.add('gatling', { x: actor.x, y: actor.y, follow: actor, range: (s.hit.range || 3.2) * 0.85, arc: 0.9, skin: (lastLook(actor)).skin, dark: !!actor.armament, life: s.hit.duration || 0.9 });
  },
});
sig('gomu_rocket', { dash(fx, actor, s, a) { DEFAULTS.dash(fx, actor, s, a); actor._ghostTint = '#ffcdd2'; fx.ring(actor.x, actor.y, 0.1, 1, '#ffffff', 0.25, 0.08, { add: true }); } });
sig('gomu_bazooka', {
  hit(fx, actor, s, a, hb) {
    const [px, py] = fwd(actor, hb.angle, 1.6);
    fx.add('impact', { x: px, y: py, z: 0.8, angle: hb.angle, size: 1.2, color: '#ffffff', core: '#ffffff', life: 0.2, spikes: 14, lines: 8 });
    for (let i = 0; i < 2; i++) fx.ring(px, py, 0.1, 1.4 + i * 0.6, '#ffffff', 0.3, 0.1, { z: 0.8, flat: 0.9, delay: i * 0.05, add: true });
    dust(fx, px, py, 8, { speed: 3 });
  },
});
sig('gomu_gear2', {
  fx(fx, actor, s, a) { DEFAULTS.fx(fx, actor, s, a); smoke(fx, actor.x, actor.y, 0.8, 16, ['#ffffff', '#ffebee', '#ffcdd2'], { speed: 2.5, size: 0.35, vz: 2 }); },
  buff(fx, actor, s, a, ex) { DEFAULTS.buff(fx, actor, s, a, ex); fx.flashScreen(0.05, 'rgba(255,205,210,1)'); },
});
sig('gomu_gear4', {
  fx(fx, actor, s, a) { DEFAULTS.fx(fx, actor, s, a); smoke(fx, actor.x, actor.y, 0.8, 18, ['#ffffff', '#eceff1', '#b71c1c'], { speed: 3.5, size: 0.4 }); },
  buff(fx, actor, s, a, ex) {
    DEFAULTS.buff(fx, actor, s, a, ex);
    fx.ring(actor.x, actor.y, 0.5, 3.2, '#b71c1c', 0.5, 0.25);
    smoke(fx, actor.x, actor.y, 1, 14, ['#ffffff', '#f5f5f5'], { speed: 4, size: 0.5 });
    fx.shake(0.4); fx.focus(actor.x, actor.y, 0.25);
  },
});
sig('gomu_gear5', {
  fx(fx, actor, s, a) {
    DEFAULTS.fx(fx, actor, s, a);
    sparkle(fx, actor.x, actor.y, 1.2, 12, ['#ffffff', '#fffde7']);
    for (let i = 0; i < 3; i++) fx.ring(actor.x, actor.y, 0.3, 3 + i * 1.5, '#ffffff', 0.6, 0.18, { delay: i * 0.1, add: true, wobble: 0.08 });
  },
  buff(fx, actor, s, a, ex) {
    DEFAULTS.buff(fx, actor, s, a, ex);
    fx.flashScreen(0.35, '#ffffff');
    fx.add('pillar', { x: actor.x, y: actor.y, r: 1.1, h: 7, color: '#ffffff', core: '#ffffff', life: 0.7, kind: 'light' });
    smoke(fx, actor.x, actor.y, 1.3, 16, ['#ffffff'], { speed: 3.5, size: 0.45, vz: 2.5 });
  },
});

// ---- Gura Gura
sig('gura_punch', {
  hit(fx, actor, s, a, hb) {
    const [px, py] = fwd(actor, hb.angle, 1.1);
    fx.add('aircrack', { x: px, y: py, z: 0.8, size: 1.3, life: 0.55 });
    for (let i = 0; i < 3; i++) fx.ring(px, py, 0.1, 1.2 + i * 0.7, '#e0f7fa', 0.45, 0.1, { z: 0.8, flat: 0.8, delay: i * 0.05, add: true });
    fx.focus(px, py, 0.2);
  },
});
sig('gura_kaishin gura_tsunami', {
  hit(fx, actor, s, a, hb) {
    const R = s.hit.range || 4.5, big = a.def.id === 'gura_tsunami';
    const n = big ? 9 : 5;
    for (let i = 0; i < n; i++) { const th = (i / n) * TAU + rnd(-0.3, 0.3), rr = R * rnd(0.3, 0.8); fx.add('aircrack', { x: actor.x + Math.cos(th) * rr, y: actor.y + Math.sin(th) * rr * 0.6, z: rnd(0.6, 2), size: rnd(0.8, 1.4) * (big ? 1.5 : 1), life: 0.6, delay: i * 0.03 }); }
    for (let i = 0; i < 4; i++) fx.ring(actor.x, actor.y, 0.5, R * (0.5 + i * 0.2), '#e0f7fa', 0.55, 0.14, { delay: i * 0.06, add: true, wobble: 0.05 });
    fx.crack(actor.x, actor.y, R * 0.6, 2.5);
    if (big) { fx.flashScreen(0.1, 'rgba(224,247,250,1)'); fx.focus(actor.x, actor.y, 0.35); }
  },
});

// ---- Ope Ope
sig('ope_room', {
  fx(fx, actor, s, a) { if (!s.fx.ring) return DEFAULTS.fx(fx, actor, s, a); fx.ring(actor.x, actor.y, 0.3, s.fx.ring, '#81d4fa', 0.5, 0.1, { add: true }); },
  buff(fx, actor, s, a, ex) {
    const b = ex.buff;
    fx.add('dome', { x: actor.x, y: actor.y, follow: actor, r: 7, kind: 'room', color: '#81d4fa', life: 1e6, until: () => actor.alive !== false && actor.buffs.includes(b) });
  },
});
sig('ope_shambles', {
  teleport(fx, actor, s, a, ex) {
    for (const [x, y] of [[ex.x0, ex.y0], [actor.x, actor.y]]) {
      fx.add('cube', { x, y, z: 0.85, size: 0.55, color: '#81d4fa', life: 0.4, spin: 3 });
      fx.ring(x, y, 0.1, 1.1, '#81d4fa', 0.3, 0.07, { add: true });
    }
    fx.flashScreen(0.04, 'rgba(129,212,250,1)');
  },
});
sig('ope_amputate', {
  hit(fx, actor, s, a, hb) {
    DEFAULTS.hit(fx, actor, s, a, hb);
    const R = (s.hit.range || 4) * (actor.reach ?? 1);
    fx.add('cutline', { x: actor.x - Math.sin(hb.angle) * R * 0.6, y: actor.y + Math.cos(hb.angle) * R * 0.4, x1: actor.x + Math.sin(hb.angle) * R * 0.6 + Math.cos(hb.angle) * R * 0.5, y1: actor.y - Math.cos(hb.angle) * R * 0.4 + Math.sin(hb.angle) * R * 0.5, z: 0.7, color: '#b3e5fc', life: 0.45 });
    for (let i = 0; i < 3; i++) { const [px, py] = fwd(actor, hb.angle + rnd(-0.5, 0.5), rnd(1, R * 0.8)); fx.add('cube', { x: px, y: py, z: rnd(0.5, 1.2), size: 0.2, color: '#81d4fa', life: 0.5, delay: 0.05 * i }); }
  },
});
sig('ope_mes', { hit(fx, actor, s, a, hb) { const [px, py] = fwd(actor, hb.angle, 1.1); fx.add('cube', { x: px, y: py, z: 1.0, size: 0.3, color: '#81d4fa', heart: true, life: 0.8, spin: 1.5 }); } });
sig('ope_counter', { hit(fx, actor, s, a, hb) { const [px, py] = fwd(actor, hb.angle, 0.9); miniBolts(fx, px, py, 0.8, 6, 1.2, '#fff176'); glow(fx, px, py, 0.8, 1, '#fff59d', 0.2); } });

// ---- Paramecia (misc)
sig('bara_festival', { hit(fx, actor, s, a) { const l = lastLook(actor); fx.add('pieces', { x: actor.x, y: actor.y, follow: actor, r: 2.6, skin: l.skin, top: l.top, bottom: l.bottom, life: s.hit.duration || 1.2 }); } });
sig('bara_escape', { dash(fx, actor, s, a) { DEFAULTS.dash(fx, actor, s, a); const l = lastLook(actor); fx.burst(actor.x, actor.y, 8, { kind: 'square', color: [l.skin || '#f1c9a0', l.top || '#e53935', l.bottom || '#1565c0'], speed: 3, z: 0.7, vz: 2, g: 8, life: 0.5, size: 0.14 }); } });
sig('bomu_kick bomu_breeze', {
  hit(fx, actor, s, a, hb) {
    const R = (s.hit.range || 1.8) * (actor.reach ?? 1);
    const [px, py] = fwd(actor, hb.angle, R * 0.6);
    explosionFx(fx, px, py + 0.45, { range: R * 0.6, element: 'explosion' }, actor, true);
  },
});
sig('hana_mil', {
  hit(fx, actor, s, a) {
    const pts = [];
    for (let i = 0; i < 12; i++) { const th = rnd(0, TAU), rr = rnd(0.8, 3.2); pts.push({ dx: Math.cos(th) * rr, dy: Math.sin(th) * rr * 0.62, L: rnd(0.7, 1.1), ang: th, delay: i * 0.05, seed: i }); }
    pts.sort((p, q) => p.dy - q.dy);
    const l = lastLook(actor);
    fx.add('arms', { x: actor.x, y: actor.y, pts, skin: l.skin, sleeve: l.top || '#7e57c2', life: (s.hit.duration || 1) + 0.2 });
    fx.burst(actor.x, actor.y, 16, { kind: 'petal', color: ['#f48fb1', '#f8bbd0', '#ffffff'], speed: 3, z: 0.6, vz: 1.5, g: 1, life: 0.9, size: 0.1 });
  },
});
sig('ito_parasite', { proj(fx, actor, s, a) { const tx = a.tx ?? actor.x + Math.cos(a.angle) * 6, ty = a.ty ?? actor.y + Math.sin(a.angle) * 6; fx.add('strings', { x: actor.x, y: actor.y, x1: tx, y1: ty, color: '#f8bbd0', n: 5, life: 0.6 }); } });
sig('ito_fivecolor', { hit(fx, actor, s, a, hb) { const R = (s.hit.range || 3.4) * (actor.reach ?? 1); for (let i = 0; i < 5; i++) fx.add('crescent', { x: actor.x, y: actor.y, angle: hb.angle + (i - 2) * 0.08, radius: R * (0.95 - i * 0.05), arc: 1.4, width: 0.05, color: ['#f48fb1', '#ce93d8', '#90caf9', '#a5d6a7', '#fff59d'][i], dir: 1, life: 0.28, delay: i * 0.02, z: 0.5 + i * 0.1 }); } });
sig('ito_overheat', { beam: 'string' });
sig('mochi_zangiri', { beam: 'mochi' });
sig('noro_beam', { beam: 'light', hit(fx, actor, s, a, hb) { DEFAULTS.hit(fx, actor, s, a, hb); const L = (s.hit.range || 9); for (let i = 0; i < 6; i++) { const [px, py] = fwd(actor, hb.angle, rnd(0.5, L), 1); sparkle(fx, px, py, 0.7, 1, ['#80deea', '#ffffff']); } } });
sig('zushi_blade', { beam: 'gravity' });
sig('bari_barrier', { buff(fx, actor, s, a, ex) { const b = ex.buff; fx.add('barrier', { x: actor.x, y: actor.y, follow: actor, color: '#b3e5fc', life: 1e6, until: () => actor.alive !== false && actor.buffs.includes(b) }); } });
sig('bari_crash', { dash(fx, actor, s, a) { DEFAULTS.dash(fx, actor, s, a); fx.add('barrier', { x: actor.x, y: actor.y, follow: actor, color: '#b3e5fc', life: s.dash.time + 0.15 }); } });
sig('suke_vanish', { buff(fx, actor) { fx.ring(actor.x, actor.y, 1.4, 0.1, '#eceff1', 0.5, 0.05, { add: true }); sparkle(fx, actor.x, actor.y, 0.9, 5, ['#ffffff', '#eceff1']); } });
sig('sube_slide', { dash(fx, actor, s, a) { DEFAULTS.dash(fx, actor, s, a); actor._ghostTint = '#fce4ec'; sparkle(fx, actor.x, actor.y, 0.6, 4, ['#ffffff', '#fce4ec']); } });
sig('supa_sparkling', { hit(fx, actor, s, a, hb) { DEFAULTS.hit(fx, actor, s, a, hb); for (let i = 0; i < 4; i++) fx.add('crescent', { x: actor.x, y: actor.y, angle: hb.angle + i * 1.57, radius: 1.5, arc: 1.6, width: 0.12, color: '#eceff1', dir: 1, life: 0.2, delay: i * 0.03, z: 0.7 }); } });
sig('nikyu_repel', { hit(fx, actor, s, a, hb) { DEFAULTS.hit(fx, actor, s, a, hb); for (let i = 0; i < 6; i++) fx.burst(actor.x, actor.y, 1, { kind: 'bubble', color: '#ffffff', speed: 4, z: 0.8, vz: 0.5, g: 0, life: 0.6, size: 0.25 }); } });
sig('nikyu_travel', { teleport(fx, actor, s, a, ex) { DEFAULTS.teleport(fx, actor, s, a, ex); fx.burst(ex.x0, ex.y0, 6, { kind: 'bubble', color: '#ffffff', speed: 2, z: 0.8, vz: 1, g: -1, life: 0.8, size: 0.2 }); } });
sig('nikyu_ursus', { proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.8); fx.ring(px, py, 0.2, 2, '#ffffff', 0.4, 0.12, { z: 0.8, add: true }); smoke(fx, px, py, 0.8, 10, ['#ffffff', '#e0f7fa'], { speed: 3 }); } });
sig('kage_steal', { hit(fx, actor, s, a, hb) { const [px, py] = fwd(actor, hb.angle, 1.6); fx.add('claw', { x: px, y: py, z: 0.1, angle: hb.angle, size: 1.1, color: '#263238', life: 0.5, n: 2, tilt: 0 }); smoke(fx, px, py, 0.3, 8, ['#263238', '#37474f', '#000000'], { speed: 1.5 }); } });
sig('kage_doppelman', { buff(fx, actor, s, a, ex) { DEFAULTS.buff(fx, actor, s, a, ex); smoke(fx, actor.x, actor.y, 0.6, 12, ['#263238', '#000000'], { speed: 2 }); } });
sig('doku_fist', { hit(fx, actor, s, a, hb) { DEFAULTS.hit(fx, actor, s, a, hb); const [px, py] = fwd(actor, hb.angle, 1); fx.burst(px, py, 10, { kind: 'drop', color: ['#8e24aa', '#ab47bc'], speed: 4, z: 0.8, vz: 2, g: 9, life: 0.5, size: 0.1 }); } });
sig('doku_hydra', { proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.6); smoke(fx, px, py, 0.8, 10, ['#6a1b9a', '#8e24aa', '#4a148c'], { speed: 2.5, size: 0.3 }); } });

// ---- Logia
sig('mera_hiken ryu_hiken', { proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.7); flames(fx, px, py, 0.8, 16, ELEM.fire.spark, { speed: 3, angle: a.angle, spread: 1.6 }); glow(fx, px, py, 0.8, 1.2, '#ff9100', 0.25); fx.ring(px, py, 0.1, 0.9, '#ffab40', 0.22, 0.08, { z: 0.8, flat: 1, add: true }); } });
sig('mera_hidaruma', { proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.5); fx.burst(px, py, 10, { kind: 'glow', color: ['#aeea00', '#ffab40'], speed: 2, z: 0.9, vz: 0.5, g: 0, life: 0.5, size: 0.2 }); } });
sig('mera_enkai', {
  hit(fx, actor, s, a, hb) {
    DEFAULTS.hit(fx, actor, s, a, hb);
    const R = s.hit.range || 3;
    for (let i = 0; i < 6; i++) { const th = (i / 6) * TAU; fx.add('pillar', { x: actor.x + Math.cos(th) * R * 0.75, y: actor.y + Math.sin(th) * R * 0.5, r: 0.35, h: 3, color: '#ff7043', core: '#ffeb3b', life: 0.6, kind: 'fire', delay: i * 0.03 }); }
    fx.add('pillar', { x: actor.x, y: actor.y, r: 0.8, h: 4.5, color: '#ff5722', core: '#ffeb3b', life: 0.6, kind: 'fire' });
    fx.add('scorch', { x: actor.x, y: actor.y, r: R * 0.8, life: 3 });
  },
});
sig('mera_entei', {
  charge: { kind: 'sun', color: '#ff9100', at: 'hF' },
  proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.8); glow(fx, px, py, 1.4, 3, '#ff6d00', 0.4); fx.flashScreen(0.08, 'rgba(255,145,0,1)'); fx.shake(0.3, a.angle); },
});
sig('hie_pheasant', { proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.7); shards(fx, px, py, 0.8, 12, null, a.angle); fx.ring(px, py, 0.1, 1, '#e1f5fe', 0.3, 0.08, { z: 0.8, flat: 1, add: true }); } });
sig('hie_ageand', {
  hit(fx, actor, s, a, hb) {
    const R = s.hit.range || 5;
    ringSpikes(fx, actor.x, actor.y, R * 0.85, 22, 'ice');
    fx.ring(actor.x, actor.y, 0.3, R, '#e1f5fe', 0.6, 0.2, { add: true });
    shards(fx, actor.x, actor.y, 0.6, 20);
    fx.flashScreen(0.06, 'rgba(225,245,254,1)');
  },
});
sig('hie_time', { beam: 'ice' });
sig('goro_sango', { charge: { kind: 'bolt', color: '#fff176' }, proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.7); miniBolts(fx, px, py, 0.9, 6, 1.4, '#fff176'); glow(fx, px, py, 0.9, 1.5, '#fff59d', 0.3); } });
sig('goro_elthor', {
  zone(fx, actor, spec, a, zone) {
    fx.add('zone', { x: zone.x, y: zone.y, r: zone.r, kind: 'thunder', color: zone.color, zone, life: 1e6 });
    fx.add('pillar', { x: zone.x, y: zone.y, r: zone.r * 0.55, h: 10, color: '#fff176', core: '#ffffff', life: 0.5, kind: 'lightning' });
    fx.bolt(zone.x, zone.y - 0.01, zone.x, zone.y, '#fff176', 0.5, 0.2, { z0: 10, z1: 0.1, branches: 4 });
    fx.flashScreen(0.08, 'rgba(255,253,231,1)');
    return true;
  },
});
sig('goro_raigo', {
  charge: { kind: 'bolt', color: '#fff176' },
  zone(fx, actor, spec, a, zone) {
    fx.add('zone', { x: zone.x, y: zone.y, r: zone.r, kind: 'thunder', color: zone.color, zone, life: 1e6 });
    fx.add('cloud', { x: zone.x, y: zone.y, r: zone.r * 0.9, z: 6.5, life: 3.2, color: '#212121', glow: '#fff176' });
    return true;
  },
});
sig('goro_amaru', { buff(fx, actor, s, a, ex) { DEFAULTS.buff(fx, actor, s, a, ex); fx.add('pillar', { x: actor.x, y: actor.y, r: 0.8, h: 7, color: '#fff176', core: '#ffffff', life: 0.5, kind: 'lightning' }); miniBolts(fx, actor.x, actor.y, 1, 8, 2, '#fff176'); } });
sig('suna_barjan', { proj(fx, actor, s, a) { fx.add('crescent', { x: actor.x, y: actor.y, angle: a.angle, radius: 1.1, arc: 1.8, width: 0.2, color: '#e1c16e', dir: 1, life: 0.2, z: 0.7, add: false }); } });
sig('suna_sables', {
  zone(fx, actor, spec, a, zone) {
    fx.add('zone', { x: zone.x, y: zone.y, r: zone.r, kind: 'storm', color: '#e1c16e', zone, life: 1e6 });
    fx.add('vortex', { x: zone.x, y: zone.y, r: zone.r * 0.85, h: zone.r * 2.2, kind: 'sand', color: '#d7b56d', color2: '#fff3c4', life: zone.t, spin: 9 });
    return true;
  },
});
sig('suna_dry', { zone(fx, actor, spec, a, zone) { fx.add('zone', { x: zone.x, y: zone.y, r: zone.r, kind: 'field', color: '#d7b56d', zone, life: 1e6 }); fx.crack(zone.x, zone.y, zone.r * 0.9, zone.t); return true; } });
sig('moku_snake moku_blow', { proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.6); smoke(fx, px, py, 0.8, 8, ['#ffffff', '#eceff1', '#cfd8dc'], { speed: 1.8, size: 0.3 }); } });
sig('moku_launcher', { dash(fx, actor, s, a) { DEFAULTS.dash(fx, actor, s, a); actor._ghostTint = '#eceff1'; smoke(fx, actor.x, actor.y, 0.4, 12, ['#ffffff', '#eceff1'], { speed: 2.5, size: 0.4 }); } });
sig('pika_yata', {
  teleport(fx, actor, s, a, ex) {
    const w = fx.game.world;
    const dx = w ? w.dx(ex.x0, actor.x) : actor.x - ex.x0, dy = actor.y - ex.y0;
    fx.beam(ex.x0, ex.y0, Math.atan2(dy, dx), Math.hypot(dx, dy), 0.35, '#fff59d', 0.22, '#ffffff', { style: 'light', z: 0.8 });
    ghostsAlong(fx, actor, ex.x0, ex.y0, 3, '#fff59d', { add: true });
    fx.add('flare', { x: actor.x, y: actor.y, z: 0.85, size: 1.4, color: '#fff59d', life: 0.3 });
    fx.flashScreen(0.05, 'rgba(255,253,231,1)');
  },
});
sig('pika_yasakani', { proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.6); glow(fx, px, py, 0.9, 1.3, '#fff59d', 0.3); fx.add('flare', { x: px, y: py, z: 0.9, size: 0.9, color: '#fff9c4', life: 0.2 }); } });
sig('pika_amaterasu', { charge: { kind: 'glow', color: '#fff59d', size: 0.35 }, hit(fx, actor, s, a, hb) { DEFAULTS.hit(fx, actor, s, a, hb); fx.flashScreen(0.1, 'rgba(255,253,231,1)'); } });
sig('magu_daifunka', { proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.7); flames(fx, px, py, 0.8, 10, ['#ff6f00', '#bf360c', '#ffab40'], { speed: 2.5 }); embers(fx, px, py, 0.8, 8); smoke(fx, px, py, 1, 4, ['#4e342e', '#5d4037'], { size: 0.3 }); } });
sig('magu_meigo', { dash(fx, actor, s, a) { DEFAULTS.dash(fx, actor, s, a); actor._ghostTint = '#ff7043'; const x0 = actor.x, y0 = actor.y; fx.add('scorch', { x: x0, y: y0, r: 0.6, life: 3 }); embers(fx, x0, y0, 0.6, 10); } });
sig('magu_ryusei zushi_meteor mochi_chikara hana_gigante hana_clutch', {
  zone(fx, actor, spec, a, zone) {
    const id = a.def.id;
    const kind = id === 'magu_ryusei' ? 'fist' : id === 'mochi_chikara' ? 'mochi' : id === 'zushi_meteor' ? 'rock' : 'hand';
    fx.add('zone', { x: zone.x, y: zone.y, r: zone.r, kind: id.startsWith('hana') ? 'arms' : zone.kind, color: zone.color, zone, life: 1e6 });
    if (id.startsWith('hana')) {
      if (id === 'hana_gigante') {
        const l = lastLook(actor);
        fx.add('arms', { x: zone.x, y: zone.y, pts: [{ dx: -zone.r * 0.6, dy: 0.1, L: 1, ang: 0.6, delay: 0, seed: 1 }, { dx: zone.r * 0.6, dy: 0.1, L: 1, ang: Math.PI - 0.6, delay: 0.05, seed: 2 }], skin: l.skin, sleeve: l.top || '#7e57c2', big: true, life: 0.9 });
      }
      fx.burst(zone.x, zone.y, 14, { kind: 'petal', color: ['#f48fb1', '#f8bbd0', '#ffffff'], speed: 2.5, z: 0.4, vz: 2, g: 2, life: 0.9, size: 0.1 });
      return true;
    }
    const n = Math.max(1, Math.ceil(zone.t / zone.interval));
    for (let i = 0; i < n; i++) {
      const t = i * zone.interval;
      const r = i === 0 ? 0 : Math.sqrt(Math.random()) * zone.r * 0.8, th = rnd(0, TAU);
      const big = id === 'zushi_meteor';
      fx.add('meteor', { x: zone.x + Math.cos(th) * r, y: zone.y + Math.sin(th) * r * 0.62, size: big ? zone.r * 0.4 : kind === 'mochi' ? 0.5 : 0.45, fall: i === 0 ? 0.14 : 0.3, h: big ? 14 : 9, drift: big ? 3 : 1.2, kind, color: kind === 'fist' ? '#bf360c' : big ? '#5d4037' : undefined, glow: kind === 'mochi' ? '#fff8e1' : '#ff9100', life: 1, delay: Math.max(0, t - (i === 0 ? 0 : 0.3)) });
    }
    return true;
  },
});
sig('yami_kurouzu', { charge: { kind: 'dark' } });
sig('yami_blackhole', { charge: { kind: 'dark' }, zone(fx, actor, spec, a, zone) { fx.add('zone', { x: zone.x, y: zone.y, r: zone.r, kind: 'dark', color: '#311b92', zone, life: 1e6 }); smoke(fx, actor.x, actor.y, 0.3, 12, ['#12001c', '#311b92'], { speed: 3 }); return true; } });
sig('yami_liberation', { hit(fx, actor, s, a, hb) { DEFAULTS.hit(fx, actor, s, a, hb); smoke(fx, actor.x, actor.y, 0.8, 20, ['#12001c', '#311b92', '#4a148c'], { speed: 5, size: 0.4 }); fx.add('pillar', { x: actor.x, y: actor.y, r: 1, h: 5, color: '#311b92', core: '#b388ff', life: 0.5, kind: 'dark' }); } });
sig('yami_nullify', { hit(fx, actor, s, a, hb) { const [px, py] = fwd(actor, hb.angle, 1); fx.add('vortex', { x: px, y: py, r: 0.6, kind: 'dark', life: 0.4, spin: -10 }); smoke(fx, px, py, 0.8, 6, ['#12001c', '#311b92'], { speed: 1 }); } });

// ---- Zoan
sig('phoenix_fly phoenix_brand', {
  dash(fx, actor, s, a) {
    DEFAULTS.dash(fx, actor, s, a);
    actor._ghostTint = '#4dd0e1'; actor._ghostAdd = true;
    flames(fx, actor.x, actor.y, 0.7, 14, ['#4dd0e1', '#80deea', '#fff59d'], { speed: 2 });
  },
});
sig('phoenix_rebirth', { heal(fx, actor, s, a) { DEFAULTS.heal(fx, actor, s, a); fx.add('pillar', { x: actor.x, y: actor.y, r: 1, h: 5, color: '#4dd0e1', core: '#e0f7fa', life: 0.7, kind: 'fire' }); } });
sig('seiryu_bolo', { beam: 'fire' });
sig('seiryu_kaifu', { proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.8); fx.burst(px, py, 8, { angle: a.angle, spread: 1, speed: 7, kind: 'line', color: '#e3f2fd', z: 1, g: 0, life: 0.25, size: 0.05 }); } });
sig('seiryu_raimei', { hit(fx, actor, s, a, hb) { DEFAULTS.hit(fx, actor, s, a, hb); const [px, py] = fwd(actor, hb.angle, 1.8); miniBolts(fx, px, py, 0.8, 6, 2, '#fff176'); fx.bolt(px, py - 0.01, px, py, '#fff176', 0.3, 0.14, { z0: 8, z1: 0.3, branches: 3 }); } });
sig('hito_heavy hito_monster neko_hybrid seiryu_form mane_disguise doru_armor supa_spider', {
  buff(fx, actor, s, a, ex) {
    DEFAULTS.buff(fx, actor, s, a, ex);
    smoke(fx, actor.x, actor.y, 0.8, 14, ['#ffffff', '#eceff1', '#cfd8dc'], { speed: 3, size: 0.4 });
    if (a.def.id === 'seiryu_form') { miniBolts(fx, actor.x, actor.y, 1.5, 6, 2.5, '#90caf9'); fx.shake(0.4); }
  },
});

// ---- Haki
sig('haki_emission', { proj(fx, actor, s, a) { const [px, py] = fwd(actor, a.angle, 0.6); miniBolts(fx, px, py, 0.8, 3, 0.9, '#7c4dff'); fx.ring(px, py, 0.1, 0.8, '#212121', 0.25, 0.1, { z: 0.8, flat: 1 }); } });
sig('haki_ryuo', { hit(fx, actor, s, a, hb) { DEFAULTS.hit(fx, actor, s, a, hb); const [px, py] = fwd(actor, hb.angle, 1.1); for (let i = 0; i < 3; i++) fx.ring(px, py, 0.05, 0.6 + i * 0.3, '#7c4dff', 0.3, 0.06, { z: 0.8, flat: 0.9, wobble: 0.2, delay: i * 0.05, add: true }); } });
sig('haki_infusion', { buff(fx, actor, s, a, ex) { DEFAULTS.buff(fx, actor, s, a, ex); miniBolts(fx, actor.x, actor.y, 1, 6, 1.6, '#d50000'); miniBolts(fx, actor.x, actor.y, 1, 4, 1.6, '#000000'); } });
sig('haki_futuresight', { buff(fx, actor, s, a, ex) { DEFAULTS.buff(fx, actor, s, a, ex); fx.add('flare', { x: actor.x, y: actor.y, z: 1.5, size: 0.9, color: '#ce93d8', life: 0.4 }); } });

// ------------------------------------------------------------------ zones, explosions, trails, conqueror
/** Persistent visuals for an area technique (and its opening burst). */
export function zoneFx(fx, zone, spec, actor, a) {
  const def = (a && a.def) || {};
  const f = SIG[def.id] && SIG[def.id].zone;
  try { if (f && f(fx, actor, spec, a, zone) === true) return; } catch (e) { if (!fx._techWarned) { fx._techWarned = true; console.warn('zone fx', def.id, e); } }
  const kind = zone.kind || 'field';
  fx.add('zone', { x: zone.x, y: zone.y, r: zone.r, kind, color: zone.color, zone, life: 1e6 });
  switch (kind) {
    case 'meteor':
      fx.add('meteor', { x: zone.x, y: zone.y, size: Math.max(0.4, zone.r * 0.3), fall: 0.16, life: 0.7, kind: 'rock', color: '#5d4037', glow: '#ff9100' });
      break;
    case 'thunder':
      fx.add('cloud', { x: zone.x, y: zone.y, r: Math.max(1.2, zone.r), z: 4.8, life: Math.max(0.8, zone.t + 0.3), color: '#37474f' });
      break;
    case 'ice':
      ringSpikes(fx, zone.x, zone.y, zone.r * 0.8, Math.round(zone.r * 4), 'ice');
      break;
    case 'dark':
      smoke(fx, zone.x, zone.y, 0.3, 10, ['#12001c', '#311b92'], { speed: 2 });
      break;
    case 'storm':
      smoke(fx, zone.x, zone.y, 0.5, 10, [zone.color || '#eceff1', '#ffffff'], { speed: 3, size: 0.4 });
      break;
    case 'cage':
      for (let i = 0; i < 10; i++) { const th = (i / 10) * TAU; fx.add('strings', { x: actor.x, y: actor.y, x1: zone.x + Math.cos(th) * zone.r, y1: zone.y + Math.sin(th) * zone.r * 0.62, color: '#f8bbd0', n: 1, life: 0.6 }); }
      break;
    default:
      fx.ring(zone.x, zone.y, 0.2, zone.r, zone.color || '#ffffff', 0.4, 0.1, { z: 0.05, flat: 0.62, add: true });
  }
}

/** Explosions (bombs, exploding projectiles, Entei, Ursus Shock...). */
export function explosionFx(fx, x, y, e, owner, small) {
  const R = e.range || 1.8;
  const el = e.element || 'explosion';
  const E = elemOf(el);
  const cols = e.colors || (el === 'explosion' ? ['#ffab40', '#ff7043', '#fff176', '#616161'] : E.spark);
  const gy = y + 0.45; // the projectile flies at chest height; the blast sits on the ground
  glow(fx, x, gy, 0.5, R * 1.1, cols[0], 0.3);
  fx.add('impact', { x, y: gy, z: 0.5, angle: 0, size: R * 0.55, color: cols[0], core: '#ffffff', life: 0.22, spikes: 12, lines: 6 });
  fx.ring(x, gy, 0.2, R, e.color || cols[0], 0.35, 0.3, { add: true });
  fx.burst(x, gy, Math.round(10 + R * 5), { color: cols, speed: 3 + R * 2, g: 3, z: 0.4, vz: 3, life: 0.6, kind: el === 'explosion' || el === 'fire' ? 'fire' : E.kind, size: 0.22 + R * 0.03 });
  smoke(fx, x, gy, 0.6, Math.round(4 + R * 2), ['#616161', '#757575', '#424242'], { speed: R * 1.2, size: 0.35 + R * 0.05, vz: 1.5 });
  dust(fx, x, gy, Math.round(4 + R), { speed: R * 1.5 });
  if (!small) fx.crack(x, gy, R * 0.6, 1.5);
  if (el === 'explosion' || el === 'fire') fx.add('scorch', { x, y: gy, r: R * 0.55, life: 3 });
  const pl = fx.game.player;
  if (!small && (owner?.isPlayer || (pl && fx.game.world && fx.game.world.distance(x, y, pl.x, pl.y) < 12))) fx.shake(0.3);
}

/** Particle trails behind projectiles (data: proj.trail). */
export function projTrailFx(fx, p, t) {
  if (Math.random() >= (t.rate || 0.6)) return;
  const col = Array.isArray(t.color) ? t.color[Math.floor(Math.random() * t.color.length)] : t.color;
  fx.particle({ x: p.x, y: p.y + 0.5, z: 1.0, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), vz: 0.4, g: 0, life: t.life || 0.35, size: t.size || 0.18, color: col, kind: t.kind || 'fire', grow: t.grow ?? -0.2 });
}

/** Conqueror's Haki: black-and-red lightning, shockwaves, an impact frame. */
export function conquerorFx(fx, actor, c) {
  const R = c.range;
  fx.ring(actor.x, actor.y, 0.5, R, '#1a1a1a', 0.7, 0.45);
  fx.ring(actor.x, actor.y, 0.3, R * 0.8, '#d50000', 0.55, 0.16, { add: true });
  fx.ring(actor.x, actor.y, 0.2, R * 1.1, '#000000', 0.9, 0.08, { wobble: 0.08 });
  for (let k = 0; k < 10; k++) {
    const a = Math.random() * TAU;
    fx.bolt(actor.x, actor.y, actor.x + Math.cos(a) * R * rnd(0.5, 0.8), actor.y + Math.sin(a) * R * rnd(0.35, 0.55), k % 2 ? '#d50000' : '#000000', 0.4, 0.09, { z0: 0.9, z1: rnd(0, 1.6), branches: 2 });
  }
  fx.add('pillar', { x: actor.x, y: actor.y, r: 0.6, h: 5, color: '#000000', core: '#d50000', kind: 'dark', life: 0.5 });
  dust(fx, actor.x, actor.y, 14, { speed: R * 0.8, size: 0.3 });
  fx.impactFrame(0.12);
  fx.shake(0.7);
  fx.focus(actor.x, actor.y, 0.3);
}

// ------------------------------------------------------------------ afterimages & motion
/** A flat-tinted copy of a look (afterimages, shadow doubles, mirages). */
export function ghostLook(look, c) {
  return {
    ...look, skin: c, top: c, bottom: c, hairColor: c, shoes: c, sleeve: c, hand: c, hatColor: c, fur: c, belt: c, vest: undefined,
    coat: look.coat ? c : undefined, eyeColor: c, furWhite: false, hat: null, wings: undefined, backFlame: false, drums: false,
    dragonForm: false, asura: false, spots: false,
  };
}
/** Leave an afterimage of an actor's last drawn pose. */
export function afterimage(fx, a, o = {}) {
  const P = a._lastPose;
  if (!P || !P.P) return null;
  const tint = o.tint || '#e3f2fd';
  return fx.add('ghost', {
    x: o.x ?? a.x, y: o.y ?? a.y, look: ghostLook(lastLook(a), tint),
    pose: { facing: P.facing, P: P.P, time: P.time, state: P.state === 'hurt' ? 'idle' : P.state, swimming: P.swimming, z: P.z, squash: P.squash },
    life: o.life ?? 0.24, alpha: o.alpha ?? 0.45, add: o.add,
  });
}

/** Per-frame motion effects for one actor (called by fx.update). */
export function motion(fx, a, dt) {
  // afterimages while dodging, dashing or right after a teleport
  if (a._ghostT > 0) a._ghostT -= dt;
  const dash = a.dash;
  if ((dash || a._ghostT > 0) && a._lastPose && a.state === 'idle') {
    a._ghostAcc = (a._ghostAcc || 0) + dt;
    const every = dash && dash.dodge ? 0.035 : 0.03;
    if (a._ghostAcc >= every) {
      a._ghostAcc = 0;
      afterimage(fx, a, { tint: a._ghostTint || (dash && dash.dodge ? '#b3e5fc' : '#e3f2fd'), life: 0.22, alpha: 0.42, add: a._ghostAdd });
    }
  } else if (!(a._ghostT > 0)) { a._ghostTint = null; a._ghostAdd = false; }
  // sprint dust kicked up behind the feet
  if (a.moving && a.intent && a.intent.sprint && !a.inWater && a.state === 'idle' && !a.onShip) {
    a._dustAcc = (a._dustAcc || 0) + dt;
    if (a._dustAcc > 0.12) {
      a._dustAcc = 0;
      dust(fx, a.x - Math.cos(a.facing) * 0.18, a.y + 0.02, 2, { speed: 0.9, size: 0.14, life: 0.45, angle: a.facing + Math.PI, spread: 1.2 });
    }
  }
  // skid dust while being knocked back
  const kbm = Math.hypot(a.kb.x, a.kb.y);
  if (kbm > 3.5 && !a.inWater) {
    a._skidAcc = (a._skidAcc || 0) + dt;
    if (a._skidAcc > 0.045) { a._skidAcc = 0; dust(fx, a.x, a.y + 0.03, 1, { speed: 0.6, size: 0.16 + kbm * 0.01, life: 0.5, angle: Math.atan2(-a.kb.y, -a.kb.x), spread: 1 }); }
  }
  // the thud of hitting the ground when knocked down
  if (a.state === 'knocked') {
    if (!a._fxLanded && a.knockT > 0.26) {
      a._fxLanded = true;
      // (the body lies centred on the spot, its head away from where it faced)
      const s = (a.look && a.look.scale) || 1, dir = Math.cos(a.facing || 0) < 0 ? 1 : -1;
      dust(fx, a.x + dir * 0.75 * s, a.y - 0.05, 3, { speed: 1.6, size: 0.16 });
      dust(fx, a.x - dir * 0.6 * s, a.y - 0.05, 3, { speed: 1.6, size: 0.16 });
      dust(fx, a.x, a.y - 0.05, 3, { speed: 2.2, size: 0.18 });
      fx.ring(a.x + dir * 0.1 * s, a.y - 0.05, 0.3, 1.2 * s, 'rgba(215,204,200,0.8)', 0.32, 0.06, { z: 0.03, flat: 0.42, noCore: true });
      if (a.isPlayer || a.lastHitBy?.isPlayer) fx.kick(Math.PI / 2, 3);
    }
  } else a._fxLanded = false;
}

// ------------------------------------------------------------------ per-actor pose extras
function defaultCharge(def, actor, elem, st) {
  const src = def.source || '';
  if (st && st.oni && weaponFor(def, actor) === 'sword') return { kind: 'oni' };
  if (!elem || elem === 'physical') {
    if (src.startsWith('haki')) return { kind: 'glow', color: '#7c4dff' };
    if (src.startsWith('fruit')) return { kind: 'glow', color: '#ffffff', size: 0.16 };
    return null;
  }
  if (elem === 'lightning') return { kind: 'bolt', color: '#fff176' };
  if (elem === 'dark') return { kind: 'dark' };
  const E = elemOf(elem);
  return { kind: 'glow', color: elem === 'fire' || elem === 'magma' || elem === 'explosion' ? '#ff9100' : E.c };
}

/**
 * Renderer extras for an actor this frame: element glow on the striking
 * limb, energy blades, charge-ups, flurries, Diable Jambe legs, Haki legs,
 * Gear 4 bounce and Gear 5 toon wobble.
 */
export function actorVisuals(actor, act, clip) {
  const out = {};
  const bufs = actor.buffs || [];
  const diable = bufs.find((b) => b.id === 'diable');
  const elemBuff = bufs.find((b) => b.element);
  if (diable) { out.legFx = '#ff6d00'; out.legFxAll = true; }
  if (actor.armament && (actor.style === 'black_leg' || actor.style === 'okama_kenpo')) out.armLegs = true;
  if (bufs.some((b) => b.id === 'gear4')) out.bounce = true;
  if (bufs.some((b) => b.id === 'gear5')) out.toon = true;
  if (!act || !clip) return out;
  const def = act.def;
  const w = def.windup ?? 0.1;
  const t = act.t;
  const steps = def.steps || [];
  const main = steps.find((s) => s.hit || s.proj || s.dash || s.zone) || {};
  const elem = main.hit?.element || main.proj?.element || main.dash?.hit?.element || main.zone?.element || (elemBuff ? elemBuff.element : null);
  const sg = SIG[def.id] || {};
  const st = styleOf(def, actor);
  const E = elem ? elemOf(elem) : null;
  const k = t < w ? clamp01(t / Math.max(0.04, w)) : Math.max(0, 1 - (t - w) / 0.3);
  const trail = sg.trail || (E && elem !== 'physical' ? E.c : st ? st.trail : '#ffffff');
  const fxElem = sg.elem || (elem && elem !== 'physical' ? elem : st && st.elem) || null;
  out.fx = { elem: fxElem, color: E ? E.c : trail, trail, limb: sg.limb || clip.limb, k, additive: !!(E && E.add), claw: st && st.claw };
  if (diable && (clip.limb === 'fF' || clip.limb === 'fB')) { out.fx.elem = 'fire'; out.fx.trail = '#ff9800'; out.fx.additive = true; }
  const blade = sg.blade || BLADES[def.id];
  if (blade) { out.blade = blade; out.bladeLen = 1.0; }
  if (t < w && w >= 0.3 && !def.m1Chain) {
    const ch = sg.charge !== undefined ? sg.charge : defaultCharge(def, actor, elem, st);
    if (ch) out.charge = { ...ch, k: t / w };
  }
  if (clip.flurry && t >= clip.flurry.t0 && t <= clip.flurry.t1) {
    const rubber = actor.fruit === 'gomu' && (def.source || '').startsWith('fruit');
    out.flurry = { n: rubber ? 9 : 7, rate: 10, reach: rubber ? 1.9 : 0.85, spread: rubber ? 1.1 : 0.8, stretch: rubber, legs: clip.flurry.legs };
  }
  return out;
}

/**
 * Extras drawn around a character in its own space: 'back' (before the
 * body: Doppelman's shadow, Mirage copies) and 'front' (after: guard
 * shimmer while blocking, the Clear-Clear shimmer).
 */
export function drawActorExtras(g, actor, look, pose, env, phase) {
  const bufs = actor.buffs || [];
  const t = env.time;
  if (phase === 'back') {
    if (!actor._lastP) return;
    const base = { facing: pose.facing, P: actor._lastP, time: pose.time, state: 'idle', noShadow: true, ghost: true };
    if (bufs.some((b) => b.id === 'doppel')) {
      g.save();
      g.translate(-Math.cos(pose.facing) * 0.55 + 0.25, -0.04 - Math.sin(pose.facing) * 0.25);
      g.globalAlpha *= 0.62;
      drawCharacter(g, ghostLook(look, '#263238'), { ...base });
      g.restore();
    }
    if (bufs.some((b) => b.id === 'mirage')) {
      for (const sx of [-0.7, 0.7]) {
        g.save(); g.translate(sx + Math.sin(t * 3 + sx) * 0.1, 0);
        g.globalAlpha *= 0.14 + 0.08 * Math.sin(t * 5 + sx);
        drawCharacter(g, ghostLook(look, '#e1f5fe'), { ...base });
        g.restore();
      }
    }
    return;
  }
  // front
  if (actor.blocking) {
    const since = t - (actor._blockFlash ?? -9);
    const hitK = since >= 0 && since < 0.25 ? 1 - since / 0.25 : 0;
    const fresh = Math.max(0, 1 - (actor.blockTime || 0) / 0.2);
    const f = pose.facing || 0;
    const s = look.scale || 1;
    g.save();
    g.translate(Math.cos(f) * 0.32 * s, -0.8 * s + Math.sin(f) * 0.2 * s);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.18 + 0.2 * fresh + 0.5 * hitK;
    g.strokeStyle = fresh > 0 ? '#fff59d' : '#90caf9'; g.lineWidth = 0.06 + 0.05 * hitK; g.lineCap = 'round';
    g.beginPath(); g.ellipse(0, 0, 0.55 * s, 0.75 * s, 0, f - 1.1, f + 1.1); g.stroke();
    g.restore();
  }
  if (bufs.some((b) => b.id === 'invisible') && pose.P) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.06 + 0.05 * Math.sin(t * 7);
    drawCharacter(g, ghostLook(look, '#ffffff'), { facing: pose.facing, P: pose.P, time: pose.time, state: 'idle', noShadow: true, ghost: true });
    g.restore();
  }
}
