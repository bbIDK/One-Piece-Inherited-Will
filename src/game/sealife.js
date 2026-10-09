// Life in the seas of the One Piece world. Bright reef fish crowd the corals
// (the seas round Fish-Man Island are full of them), silver sardines wheel in
// shoals, flying fish — the kind the Flying Fish Riders saddle — skim under
// the surface and leap clear to glide, and out in the blue the Elephant
// Honmaguro, a giant tuna with a trunk and ears, is the finest eating in the
// sea. Strings of baby Sea Kings trail through the deeps of the Grand Line;
// Sea Cats paddle warm water and Yagara Bulls graze the shallows. Hunting
// swimmers out past the reef: Sea Cows in the four Blues (big, greedy, and
// cowards when they're hurt — MOO!) and horned Fighting Fish in the Grand
// Line. Giant clams on the reef hold Mermaid Pearls. Grab a fish when you
// lunge at a school. Nothing is saved but the clams you've opened: the sea is
// simply alive wherever you swim.
import { Actor } from './actor.js';
import { addItem } from './inventory.js';
import { regionAt, isCalmBelt, isGrandLine, REGION } from '../world/constants.js';
import { warmth, clamAt } from '../world/seabed.js';
import { T } from '../world/tiles.js';
import { TAU, clamp, angleDiff } from '../core/math.js';
import { findShore } from './interact.js';
import { placeOnDeck } from './decks.js';
import { deckLift } from '../world/hull.js';

// shape: how the 3D view draws them — 'fish' / 'reef' / 'flying' (instanced
// shoals), or a model per animal ('elephant', 'serpent', 'seacat', 'yagara')
export const FISH = {
  reef: { name: 'reef fish', n: [6, 11], size: 0.22, speed: 1.3, spread: 1.4, colors: ['#ffd23f', '#3fa7ff', '#ff8a3d', '#b37bff', '#ff5d8f', '#4fe0c0'], item: 'fresh_fish', warm: [0.55, 1], depth: [0.8, 16], catch: 0.75, reef: true, w: 4, shape: 'reef' },
  sardine: { name: 'sardines', n: [16, 26], size: 0.17, speed: 2.3, spread: 1.7, colors: ['#c9d6df', '#b7c7d3', '#aab9c4'], item: 'fresh_fish', warm: [0, 1], depth: [1.2, 40], catch: 0.8, w: 3, shape: 'fish' },
  flying: { name: 'flying fish', n: [8, 14], size: 0.34, speed: 3.2, spread: 2.2, colors: ['#3f7fc0', '#5a9fd8'], item: 'fresh_fish', warm: [0.3, 1], depth: [1, 30], catch: 0.6, w: 2.5, shape: 'flying', leap: true },
  elephant: { name: 'Elephant Honmaguro', n: [1, 3], size: 1.9, speed: 2.4, spread: 3.2, colors: ['#35557a', '#2f4d78'], item: 'elephant_tuna', warm: [0.15, 1], depth: [6, 70], catch: 0.25, w: 1, shape: 'elephant' },
  seaking_fry: { name: 'baby Sea Kings', n: [2, 4], size: 1.5, speed: 1.7, spread: 2.6, colors: ['#2e7d32', '#6a1b9a', '#c62828', '#00838f', '#ef6c00'], warm: [0, 1], depth: [8, 80], w: 1.4, shape: 'serpent', grandLine: true, wild: true },
  seacat: { name: 'a Sea Cat', n: [1, 1], size: 1.7, speed: 0.9, spread: 0, colors: ['#e8a45c'], warm: [0.6, 1], depth: [2, 26], critter: true, w: 0.5, shape: 'seacat' },
  yagara: { name: 'a Yagara Bull', n: [1, 1], size: 1.2, speed: 1.0, spread: 0, colors: ['#f2a38a'], warm: [0.3, 0.95], depth: [1.5, 18], critter: true, w: 0.5, shape: 'yagara' },
};

const MAX_SCHOOLS = 7;
const P = { x: 0, y: 0, z: 0 };

export function installSeaLife(game) {
  const S = game.seaLife = { schools: [], t: 0, spawnT: 1, sharkT: 30, lastAct: null, fishPos: (s, f, out) => fishPos(s, f, S.t, out), shark: (x, y, lvl = 10, kind = null) => game.addActor(makeShark(game, x, y, lvl, kind)), spawn: (kind, x, y, z, hd = 0) => { const s = makeSchool(kind, x, y, z, hd); S.schools.push(s); return s; } };
  game.on('tick', (dt) => tick(game, S, dt));
  game.on('characterStart', () => { S.schools.length = 0; });
  game.on('enterZone', () => { S.schools.length = 0; });
  game.on('leaveZone', () => { S.schools.length = 0; });
  // giant clams on the reef: prise one open for a pearl
  const prevFoot = game.footInteraction;
  game.footInteraction = (p) => {
    const other = prevFoot ? prevFoot(p) : null;
    const c = clamNear(game, p);
    return c ? { d: c.d, x: c.x, y: c.y, label: 'Prise open the giant clam', run: () => openClam(game, c) } : other;
  };
}

/** Where a fish is now (world x, y and depth z below the surface). */
export function fishPos(s, f, t, out) {
  const a = f.ph + t * f.w;
  const k = s.scare > 0 ? 0.55 : 1; // a frightened school bunches up
  let lx = f.lead + Math.cos(a) * f.r * k;
  const ly = Math.sin(a * 1.3) * f.r * 0.7 * k, lz = Math.sin(a * 0.7 + f.ph) * f.r * 0.35 * k;
  // flying fish: every so often one bursts out of the water and glides
  out.leap = 0;
  if (s.def.leap && s.z < 2.5) {
    const L = leapOf(f, t);
    if (L > 0) { out.leap = L; lx += Math.sin(L * Math.PI * 0.5) * 3.5; }
  }
  const ch = Math.cos(s.hd), sh = Math.sin(s.hd);
  out.x = s.x + lx * ch - ly * sh;
  out.y = s.y + lx * sh + ly * ch;
  out.z = out.leap > 0 ? s.z * (1 - Math.min(1, out.leap * 4)) - Math.sin(out.leap * Math.PI) * 1.3 : Math.max(0.3, s.z + lz);
  return out;
}

/** 0 in the water; 0..1 along a leap out of it (and a glide back down). */
export function leapOf(f, t) {
  const period = 7 + (f.ph % 1) * 5, q = ((t + f.ph * 11) % period) / period;
  return q < 0.16 ? q / 0.16 : 0;
}

function tick(game, S, dt) {
  const p = game.player, w = game.world;
  if (!p || !w || !game.seaDepth) return;
  S.t += dt;
  const live = w.zone === 0;
  // life comes to the water you're in (or wading beside)
  const near = live && p.mode !== 'sail' && (p.inWater || (w.sd && w.sd(p.x, p.y) < 7));
  S.spawnT -= dt;
  if (near && S.spawnT <= 0) {
    S.spawnT = 1.5;
    if (S.schools.length < MAX_SCHOOLS) spawnSchool(game, S, p);
  }
  for (const s of S.schools) updateSchool(game, s, dt, p);
  S.schools = S.schools.filter((s) => s.alive && w.distance(s.x, s.y, p.x, p.y) < 60 && s.fish.some((f) => f.alive));
  // lunging at a fish (any attack in the water)
  const act = p.action;
  if (act && act !== S.lastAct && p.inWater) tryCatch(game, S, p);
  S.lastAct = act;
  if (live) sharks(game, S, dt, p);
  rescue(game, S, dt, p);
  // (under the surface the music turns dreamy, and comes back when you surface: see audio/director.js)
  // swimming and holding your breath build endurance
  if (p.inWater && !p.gills && !p.fruit && (p.moving || p.under)) {
    S.trainT = (S.trainT || 0) + dt;
    if (S.trainT > 5) { game.progression?.train('end', S.trainT * (p.under ? 0.07 : 0.05)); S.trainT = 0; }
  }
}

// ------------------------------------------------------------ schools

function spawnSchool(game, S, p) {
  const w = game.world;
  const critters = S.schools.filter((s) => s.def.critter).length;
  for (let tries = 0; tries < 10; tries++) {
    const a = Math.random() * TAU, r = 12 + Math.random() * 20;
    const x = w.wx(p.x + Math.cos(a) * r), y = p.y + Math.sin(a) * r;
    const t = w.type(x, y);
    if ((t !== T.SEA && t !== T.REEF) || w.isOverlay(x, y)) continue;
    const depth = game.seaDepth(x, y);
    if (depth < 1.6) continue;
    const warm = warmth(w, x, y);
    const grand = isGrandLine(regionAt(x, y)) || isCalmBelt(regionAt(x, y));
    const fits = Object.entries(FISH).filter(([, d]) => warm >= d.warm[0] && warm <= d.warm[1] && depth >= d.depth[0] + 0.5 && (!d.reef || depth < 18) && (!d.critter || critters < 2) && (!d.grandLine || grand));
    if (!fits.length) continue;
    let tot = 0;
    for (const [, d] of fits) tot += d.w;
    let q = Math.random() * tot, kind = fits[0][0];
    for (const [k, d] of fits) { q -= d.w; if (q <= 0) { kind = k; break; } }
    const def = FISH[kind];
    const z = clamp(def.low ? depth - 1 : def.depth[0] + Math.random() * Math.min(depth - def.depth[0], 8), 0.5, Math.max(0.5, depth - 0.6));
    S.schools.push(makeSchool(kind, x, y, z, Math.random() * TAU));
    return;
  }
}

/** A school of `kind` (or a lone animal) at (x, y), z metres down, heading hd. */
export function makeSchool(kind, x, y, z, hd) {
  const def = FISH[kind];
  const n = def.n[0] + Math.floor(Math.random() * (def.n[1] - def.n[0] + 1));
  const col = def.colors[Math.floor(Math.random() * def.colors.length)];
  const fish = [];
  for (let i = 0; i < n; i++) {
    fish.push({
      lead: (Math.random() - 0.5) * 2 * def.spread, r: 0.15 + Math.random() * def.spread * 0.6,
      ph: Math.random() * TAU, w: (0.25 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1),
      size: def.size * (0.8 + Math.random() * 0.4),
      col: def.reef || def.shape === 'serpent' ? def.colors[Math.floor(Math.random() * def.colors.length)] : col,
      alive: true,
    });
  }
  // (flying fish keep just under the surface, ready to leap)
  const z2 = def.leap ? Math.min(z, 1.1) : z;
  return { kind, def, x, y, z: z2, hd, want: hd, wantZ: z2, scare: 0, turnT: 2, alive: true, fish, seed: Math.random() * 100 };
}

function updateSchool(game, s, dt, p) {
  const w = game.world, def = s.def;
  s.turnT -= dt;
  if (s.turnT <= 0) {
    s.turnT = 2 + Math.random() * 4;
    s.want = s.hd + (Math.random() - 0.5) * 1.8;
    s.wantZ = s.z + (Math.random() - 0.5) * 3;
  }
  // don't swim into the shallows (or up a beach)
  const ax = w.wx(s.x + Math.cos(s.hd) * 3.5), ay = s.y + Math.sin(s.hd) * 3.5;
  const aheadD = w.isLiquid(ax, ay) && !w.isOverlay(ax, ay) ? game.seaDepth(ax, ay) : 0;
  if (aheadD < def.depth[0] + 0.3) { s.want = s.hd + Math.PI * (0.55 + Math.random() * 0.3); s.turnT = 1.5; }
  // keep away from swimmers (and bolt from anyone who lunges)
  const dx = w.dx(p.x, s.x), dy = s.y - p.y, dz = s.z - (p.depth || 0);
  const pd = Math.hypot(dx, dy, dz);
  const wary = def.critter || def.wild ? 3 : s.scare > 0 ? 7 : (p.intent?.sprint || p.action) ? 4 : 2.2;
  if (p.inWater && pd < wary) { s.want = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.3; if (!def.critter && !def.wild) s.scare = Math.max(s.scare, 1.2); }
  s.scare = Math.max(0, s.scare - dt);
  s.hd += clamp(angleDiff(s.hd, s.want), -1.2, 1.2) * dt * (s.scare > 0 ? 4 : 1.1);
  const sp = def.speed * (s.scare > 0 ? 2.6 : 1);
  const nx = w.wx(s.x + Math.cos(s.hd) * sp * dt), ny = s.y + Math.sin(s.hd) * sp * dt;
  if (w.isLiquid(nx, ny) && !w.isOverlay(nx, ny)) { s.x = nx; s.y = ny; } else s.want = s.hd + Math.PI;
  // depth: toward where it wants to be, never into the floor or out of the water
  const floor = game.seaDepth(s.x, s.y);
  const zmax = Math.max(0.5, floor - (def.low ? 0.45 : def.critter ? 0.8 : 0.9));
  const zmin = Math.min(zmax, Math.max(0.5, def.depth[0] * 0.6));
  if (def.low) s.wantZ = zmax;
  if (def.leap) s.wantZ = Math.min(s.wantZ, 1.3);
  s.wantZ = clamp(s.wantZ, zmin, Math.min(def.depth[1], zmax));
  s.z += clamp(s.wantZ - s.z, -1, 1) * dt * 0.7;
  s.z = clamp(s.z, 0.35, zmax);
}

function tryCatch(game, S, p) {
  const w = game.world;
  const spear = /spear|trident|harpoon/.test(p.weapon?.kind || p.weapon?.id || '');
  const reach = 1.5 + (spear ? 1.1 : 0) + (p.look?.scale || 1) * 0.2;
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
  const hz = (p.depth || 0) + 0.35;
  let best = null, bd = 1e9;
  for (const s of S.schools) {
    if (s.def.critter || !s.def.item) continue;
    for (const f of s.fish) {
      if (!f.alive) continue;
      fishPos(s, f, S.t, P);
      const dx = w.dx(p.x, P.x), dy = P.y - p.y, dz = P.z - hz;
      const d = Math.hypot(dx, dy);
      if (d > reach + f.size || Math.abs(dz) > 1.15 + f.size * 0.5) continue;
      if (d > 0.45 && (dx * fx + dy * fy) / d < 0.25) continue;
      const score = d + Math.abs(dz) * 0.6;
      if (score < bd) { bd = score; best = { s, f, x: P.x, y: P.y, z: P.z }; }
    }
  }
  if (!best) return;
  const { s, f } = best;
  const chance = s.def.catch + (p.attrs?.agi || 0) * 0.006 + (p.gills ? 0.25 : 0) + (spear ? 0.15 : 0);
  s.scare = 2.5;
  if (Math.random() < chance) {
    f.alive = false;
    addItem(game, s.def.item, 1);
    game.log(s.def.item === 'elephant_tuna' ? 'You wrestle an Elephant Honmaguro out of the sea — trunk, ears and all!' : `You snatch one of the ${s.def.name} out of the water.`, '#81d4fa');
    game.fx.burst(best.x, best.y, 10, { color: ['#e1f5fe', '#b3e5fc'], speed: 2, vz: 2, g: -1, life: 0.6, size: 0.08, kind: 'bubble' });
    game.audio?.sfx('splash');
    game.progression?.train?.('agi', 0.4);
    if (!S.caughtHint) { S.caughtHint = true; game.hint?.('fishing', 'Fish you catch go in your bag — eat them to heal, or sell them. An Elephant Honmaguro from the deep blue is worth a fortune to a cook.'); }
  } else if (!S.missLog || game.time - S.missLog > 6) {
    S.missLog = game.time;
    game.log(`The ${s.def.name} dart away!`, '#b0bec5');
  }
}

// ------------------------------------------------------------ giant clams

function clamKey(x, y) { return `${Math.floor(x)},${Math.floor(y)}`; }

function clamNear(game, p) {
  const w = game.world;
  if (!p.inWater || !p.under || w.zone !== 0) return null;
  const c = game.state?.char;
  let best = null;
  for (let j = -2; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      const x = Math.floor(p.x) + i, y = Math.floor(p.y) + j;
      const depth = game.seaDepth(x + 0.5, y + 0.5);
      if (!clamAt(w, x, y, depth)) continue;
      const k = clamKey(x, y);
      if (c?.world?.clams?.[k] && game.env.day < c.world.clams[k]) continue;
      const d = Math.hypot(w.dx(p.x, x + 0.5), y + 0.5 - p.y);
      // you have to be down at the bottom beside it
      if (d > 2.2 || Math.abs(depth - (p.depth || 0)) > 2.4) continue;
      if (!best || d < best.d) best = { d, x: x + 0.5, y: y + 0.5, k };
    }
  }
  return best;
}

function openClam(game, cl) {
  const c = game.state?.char;
  if (!c) return;
  c.world = c.world || {};
  c.world.clams = c.world.clams || {};
  c.world.clams[cl.k] = game.env.day + 6; // grows another in a few days
  const lucky = Math.random() < 0.55 + (c.traits?.includes?.('lucky') ? 0.2 : 0);
  if (lucky) {
    addItem(game, 'pearl', 1);
    game.log('Inside the giant clam, a pearl the size of your thumb!', '#fff59d');
    game.audio?.sfx('coin');
  } else {
    addItem(game, 'fresh_fish', 1);
    game.log('The clam snaps at your fingers. Nothing inside but clam.', '#b0bec5');
  }
  game.fx.burst(cl.x, cl.y, 14, { color: ['#e1f5fe', '#b3e5fc'], speed: 2, vz: 2.5, g: -1, life: 0.8, size: 0.08, kind: 'bubble' });
}

// ------------------------------------------------------------ hunters of the open sea

// what hunts a swimmer out past the reef, sea by sea
const HUNTERS = {
  seacow: {
    name: 'Sea Cow', big: 'Great Sea Cow', title: 'Greedy glutton of the Blues', race: 'beast_seacow', color: '#8e7ca8',
    hpMul: 1.8, bite: 12, r: 1.05, scale: 1.25, flees: true,
    arrive: 'Something huge surfaces with a snort... a Sea Cow!',
    hint: 'Sea Cows hunt swimmers in the Blues. Hit it hard enough and it will bolt — or get out of the water.',
  },
  fightfish: {
    name: 'Fighting Fish', big: 'Giant Fighting Fish', title: 'Horned terror of the Grand Line', race: 'beast_fightfish', color: '#324a7a',
    hpMul: 1.4, bite: 16, r: 0.9, scale: 1.2, horn: true,
    arrive: 'A horn slices through the water toward you... a Fighting Fish!',
    hint: 'Fighting Fish charge swimmers horn-first in the Grand Line. Dodge the charge, then strike — or get out of the water.',
  },
};

function sharks(game, S, dt, p) {
  const w = game.world;
  const reg = regionAt(p.x, p.y);
  const out = p.inWater && p.mode !== 'sail' && !isCalmBelt(reg) && (w.sd ? w.sd(p.x, p.y) < -9 : true) && game.seaDepth(p.x, p.y) > 5;
  if (!out) { S.sharkT = Math.max(S.sharkT, 15); return; }
  S.sharkT -= dt;
  if (S.sharkT > 0) return;
  S.sharkT = 45 + Math.random() * 50;
  if (Math.random() > 0.55) return;
  const count = game.actors.filter((a) => a.alive && a.shark).length;
  if (count >= 2) return;
  const kind = isGrandLine(reg) ? 'fightfish' : 'seacow';
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * TAU;
    const x = w.wx(p.x + Math.cos(a) * 22), y = p.y + Math.sin(a) * 22;
    if (!w.isLiquid(x, y) || w.isOverlay(x, y) || game.seaDepth(x, y) < 3) continue;
    const lvl = reg === REGION.NEW_WORLD ? 55 : isGrandLine(reg) ? 30 : reg === REGION.EAST_BLUE ? 7 : 14;
    const k = game.addActor(makeShark(game, x, y, lvl, kind));
    game.log(HUNTERS[kind].arrive, '#ff8a80');
    game.audio?.sfx('reveal');
    game.hint?.('shark', HUNTERS[kind].hint);
    return k;
  }
}

/** A Sea Cow (the Blues) or a Fighting Fish (the Grand Line) hunting a swimmer. */
export function makeShark(game, x, y, level, kind = null) {
  kind = kind || (isGrandLine(regionAt(x, y)) ? 'fightfish' : 'seacow');
  const H = HUNTERS[kind];
  const k = new Actor({
    x, y, name: level > 40 ? H.big : H.name, title: H.title, faction: 'beast',
    look: { race: H.race, scale: (level > 40 ? 1.5 : 1) * H.scale },
    attrs: { str: Math.round(level * 0.8), agi: Math.round(level * 0.7), end: Math.round(level * 0.6), vit: Math.round(level * 0.7), wil: 5 },
    hpMul: H.hpMul,
  });
  k.game = game;
  k.r = H.r;
  k.shark = true;
  k.hunter = kind;
  k.seaCreature = true;
  k.swimmer = true;
  k.depth = 0.7;
  k.bodyColor = H.color;
  k.kbResist = 0.35;
  k.passable = (w, px, py) => w.isLiquid(px, py) && !w.isOverlay(px, py) && game.seaDepth(px, py) > 1.4;
  k.canOccupy = function (w, px, py) { return this.passable(w, px, py); };
  k.updateWater = () => {};
  k.controller = new SharkBrain(H);
  k.showName = true;
  k.aggroPlayer = true;
  k.onKO = (a, att, g) => {
    g.fx.burst(a.x, a.y, 20, { color: ['#e1f5fe', '#81d4fa'], speed: 4, vz: 4, g: 8, life: 0.8, size: 0.14 });
    if (att?.isPlayer) {
      if (kind === 'fightfish') {
        addItem(g, 'fighting_fish_horn', 1);
        addItem(g, 'fresh_fish', 3);
        g.log('You beat the Fighting Fish! Its horn is worth a small fortune to a smith.', '#ffe082');
      } else {
        addItem(g, 'fresh_fish', 2);
        g.log('The Sea Cow goes belly-up, coughing up its lunch.', '#ffe082');
      }
    }
    setTimeout(() => { a.alive = false; }, 2500);
  };
  return k;
}

/**
 * Circles its prey near the surface, then dives and charges at the swimmer's
 * depth and bites (a Fighting Fish charges horn-first). A Sea Cow that's been
 * hurt badly bellows and bolts for the open sea. Loses interest in anyone out
 * of the water.
 */
class SharkBrain {
  constructor(H = HUNTERS.seacow) { this.H = H; this.mode = 'circle'; this.t = 4 + Math.random() * 3; this.ang = Math.random() * TAU; this.bored = 0; this.biteT = 0; }
  update(k, dt, game) {
    const p = game.player, w = game.world;
    k.intent.mx = 0; k.intent.my = 0;
    const dx = w.dx(k.x, p.x), dy = p.y - k.y, d = Math.hypot(dx, dy);
    if (d > 75) { k.alive = false; return; }
    if (k.state !== 'idle') return;
    // a Sea Cow's courage runs out with its blood: MOO!
    if (this.H.flees && this.mode !== 'flee' && k.hp < k.d.maxHp * 0.35) {
      this.mode = 'flee'; this.t = 8;
      game.fx.text(k.x, k.y - 1.6, 'MOOOOO!!', '#ffcc80', 0.45, { life: 1.4 });
      game.log(`The ${k.name} bellows in terror and flees!`, '#ffe082');
      if (d < 30) addItem(game, 'fresh_fish', 1);
    }
    const prey = p.inWater && p.mode !== 'sail' && p.state !== 'dead';
    let tx, ty, tz = 0.7, speed = 0.6;
    if (this.mode === 'flee') {
      // away from the swimmer as fast as it can go, then gone
      tx = k.x - dx; ty = k.y - dy; speed = 1.4;
      this.t -= dt;
      if (this.t <= 0 || d > 45) { k.alive = false; return; }
    } else if (!prey || this.bored > 30) {
      // wander off (and vanish once far enough away)
      this.bored += dt;
      this.ang += dt * 0.25;
      tx = p.x + Math.cos(this.ang) * (14 + this.bored); ty = p.y + Math.sin(this.ang) * (14 + this.bored);
      speed = 0.55;
      if (prey && this.bored > 40) this.bored = 0;
    } else if (this.mode === 'circle') {
      this.ang += dt * 0.55;
      const R = 6.5;
      tx = p.x + Math.cos(this.ang) * R; ty = p.y + Math.sin(this.ang) * R;
      this.t -= dt;
      if (this.t <= 0 && d < 12) { this.mode = 'charge'; this.t = 2.6; }
    } else {
      // the charge: straight at the swimmer, at their depth
      tx = p.x; ty = p.y; tz = (p.depth || 0) + 0.35; speed = this.H.horn ? 1.55 : 1.3;
      this.t -= dt;
      const dz = Math.abs(k.depth - tz);
      if (d < (this.H.horn ? 2.6 : 1.9) && dz < 1.2 && !k.action && this.biteT <= 0) {
        this.biteT = 0.3;
        k.action = { def: { anim: 'heavy', steps: [], windup: 0.3, recover: 0.5 }, t: 0, step: 0, total: 0.8, mult: 1, angle: k.facing };
      }
      if (this.t <= 0) { this.mode = 'circle'; this.t = 3.5 + Math.random() * 4; this.ang = Math.atan2(k.y - p.y, w.dx(p.x, k.x)); }
    }
    if (this.biteT > 0) {
      this.biteT -= dt;
      if (this.biteT <= 0 && k.alive && k.state === 'idle') {
        const reach = this.H.horn ? 1.9 : 1.3;
        const mx = k.x + Math.cos(k.facing) * reach, my = k.y + Math.sin(k.facing) * reach;
        const dmg = this.H.bite * (1 + k.attrs.str / 12);
        game.combat.hitbox({ owner: k, x: mx, y: my, shape: 'circle', range: 1.3, damage: dmg, knockback: this.H.horn ? 7 : 5, stun: 0.35, duration: 0.1 });
        game.fx.burst(mx, my, 12, { color: ['#e1f5fe', '#ffffff'], speed: 3, vz: 2, g: 4, life: 0.5, size: 0.1 });
        game.audio?.sfx('punch');
        this.mode = 'circle'; this.t = 3 + Math.random() * 3;
      }
    }
    // swim toward the target, rising and diving smoothly
    const ex = w.dx(k.x, tx), ey = ty - k.y, el = Math.hypot(ex, ey);
    if (el > 0.3) {
      const want = Math.atan2(ey, ex);
      k.facing += clamp(angleDiff(k.facing, want), -1, 1) * Math.min(1, dt * 5);
      // it can't turn on the spot: swim along its facing
      k.intent.mx = Math.cos(k.facing) * speed; k.intent.my = Math.sin(k.facing) * speed;
    }
    const floor = game.seaDepth(k.x, k.y);
    k.depth += clamp(Math.min(tz, floor - 0.6) - k.depth, -1, 1) * dt * 1.8;
    k.depth = clamp(k.depth, 0.5, Math.max(0.5, floor - 0.5));
  }
}

// ------------------------------------------------------------ man overboard

/**
 * Going under — a Devil Fruit user sinking like a stone, or anyone whose
 * breath is running out down there: a crewmate who can swim comes for you,
 * and you see it. Wherever they are — on deck with you along, or keeping the
 * ship while you're off on your own — they run and leap over the side in a
 * dive, hit the water with a splash, and swim down to you; they get hold of
 * you, the screen goes black, and you come to on your ship's deck (or the
 * nearest shore) with them beside you, coughing up seawater. While they're
 * on their way the sea doesn't finish you: they're coming.
 */
function rescue(game, S, dt, p) {
  const low = p.oxygen != null && p.maxOxygen < Infinity && p.oxygen < p.maxOxygen * 0.25;
  const going = p.inWater && p.under && p.state === 'idle' && ((p.fruit && !p.gills) || low);
  let R = S.res;
  if (R && R.phase !== 'grab' && R.phase !== 'out' && (!going || !R.who.alive)) { endRescue(game, S, false); return; }
  if (!R) {
    if (!going) return;
    // (those along with you, and those keeping the ship)
    const crew = [...(game.crew?.followers?.values() || []), ...(game.crew?.hands?.values() || [])];
    const w = game.world;
    let who = null, bd = Infinity;
    for (const a of crew) {
      if (!a.alive || a.state !== 'idle' || (a.fruit && !a.gills) || a.scripted) continue;
      const d = w.distance(a.x, a.y, p.x, p.y);
      if (d < 90 && d < bd) { bd = d; who = a; }
    }
    if (!who) return;
    R = S.res = { who, phase: 'dive', t: 0 };
    const time = game.env?.time || 0;
    // where they leap from (the deck's height, or the ground's), and where they hit the water: a little short of you
    const h0 = who.deck ? deckLift(who.deck, time) + (who.z || 0) : who.inWater ? 0 : Math.max(0, game.view3d?.ground?.(who.x, who.y) ?? 0) + (who.z || 0);
    if (who.deck) { who.deck.ship.aboard?.delete(who); who.deck = null; }
    const dx = w.dx(p.x, who.x), dy = who.y - p.y, d = Math.hypot(dx, dy) || 1;
    const off = Math.min(2.5, d * 0.5);
    let ex = p.x + dx / d * off, ey = p.y + dy / d * off;
    if (!w.isLiquid?.(w.wx(ex), ey)) { ex = p.x; ey = p.y; }
    Object.assign(R, { x0: who.x, y0: who.y, h0, ex: w.wx(ex), ey, T: clamp(d / 9, 0.8, 1.8), peak: 1.2 + Math.min(3, d * 0.06) });
    who.scripted = { moving: false };
    if (who.inWater) R.phase = 'swim';
    game.log(`${who.name} dives in after you!`, '#81d4fa');
    game.audio?.sfx('jump', who);
  }
  // (they're coming: the sea holds off till they get there)
  if (p.oxygen != null && p.oxygen < 0.6) p.oxygen = 0.6;
  const w = game.world, who = R.who;
  R.t += dt;
  if (R.phase === 'dive') {
    const k = Math.min(1, R.t / R.T);
    who.x = w.wx(R.x0 + w.dx(R.x0, R.ex) * k); who.y = R.y0 + (R.ey - R.y0) * k;
    who.z = R.h0 + (0 - R.h0) * k + R.peak * 4 * k * (1 - k);
    who.vz = k < 0.45 ? 2 : -6; who.jumpK = 1; who.inWater = false; who.under = false;
    who.facing = Math.atan2(R.ey - R.y0, w.dx(R.x0, R.ex));
    if (k >= 1) {
      R.phase = 'swim'; R.t = 0;
      who.z = 0; who.vz = 0;
      game.fx.ripple?.(who.x, who.y, 2);
      game.fx.burst(who.x, who.y, 20, { color: ['#e1f5fe', '#81d4fa', '#ffffff'], speed: 2.6, z: 0.05, vz: 6, g: 11, life: 0.7, size: 0.12 });
      game.audio?.sfx('splash_big', who);
    }
    return;
  }
  if (R.phase === 'swim') {
    who.inWater = true; who.under = true; who.wading = 0;
    who.depth = Math.max(0.3, Math.min((p.depth || 0) + 0.2, (who.depth || 0) + dt * 2.5));
    const dx = w.dx(who.x, p.x), dy = p.y - who.y, d = Math.hypot(dx, dy);
    const sp = (who.gills ? 7 : 4.5) * dt;
    who.facing = Math.atan2(dy, dx);
    who.scripted.moving = true; who.moving = true;
    if (d > 1.0) { const k = Math.min(1, sp / d); who.x = w.wx(who.x + dx * k); who.y += dy * k; }
    // (their strokes, heard coming)
    R.stroke = (R.stroke || 0) - dt;
    if (R.stroke <= 0) { R.stroke = 0.75; game.audio?.sfx('swim_pull', who); }
    if (d <= 1.0 || R.t > 12) { R.phase = 'grab'; R.t = 0; who.scripted.moving = false; who.moving = false; }
    return;
  }
  if (R.phase === 'grab') {
    who.facing = Math.atan2(p.y - who.y, w.dx(who.x, p.x));
    if (R.t > 0.35 && !R.faded) { R.faded = true; game.ui?.fade?.(true); }
    if (R.t > 1.3) {
      // (out of it: aboard your ship, or ashore)
      const ship = game.ships.find((s) => !s.sunk && s.owner === 'player' && w.distance(s.x, s.y, p.x, p.y) < 200);
      if (ship) {
        if (p.inWater) p.leaveWater?.(game);
        p.mode = 'foot'; p.onShip = false;
        placeOnDeck(game, p, ship, 0.5, 0);
        placeOnDeck(game, who, ship, 0.56, 0.6);
      } else {
        const spot = findShore(w, p.x, p.y, 24);
        if (spot) {
          p.leaveWater(game);
          p.x = spot.x; p.y = spot.y; p.vx = p.vy = 0;
          who.x = w.wx(spot.x + 0.8); who.y = spot.y; who.inWater = false; who.under = false; who.depth = 0; who.z = 0;
        }
      }
      p.oxygen = p.maxOxygen;
      who.scripted = null;
      R.phase = 'out'; R.t = 0;
      game.log(`${who.name} hauls you out of the sea, coughing and spluttering.`, '#a5d6a7');
      game.audio?.sfx('splash_out'); game.audio?.sfx('gasp');
    }
    return;
  }
  if (R.phase === 'out' && R.t > 0.5) endRescue(game, S, true);
}

/** The rescue's over (or called off: you swam up yourself) — the screen comes back, the crewmate is theirs again. */
function endRescue(game, S, done) {
  const R = S.res;
  if (!R) return;
  if (R.who) R.who.scripted = null;
  if (R.faded) game.ui?.fade?.(false);
  S.res = null;
  void done;
}
