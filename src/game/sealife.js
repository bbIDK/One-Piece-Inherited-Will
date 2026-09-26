// Life in the sea around you. Schools of fish wheel through the water — reef
// fish over the corals, great silver shoals of sardines and herring, snapper
// and cod down by the bottom, tuna out in the blue — and scatter when you
// lunge at them: grab one for a meal. Sea turtles and manta rays cruise warm
// water, sharks hunt swimmers out past the reef, and giant clams on the reef
// hold pearls for a diver who can hold their breath. Nothing is saved but the
// clams you've opened: the sea is simply alive wherever you swim.
import { Actor } from './actor.js';
import { addItem } from './inventory.js';
import { regionAt, isCalmBelt, isGrandLine, REGION } from '../world/constants.js';
import { warmth, clamAt } from '../world/seabed.js';
import { T } from '../world/tiles.js';
import { TAU, clamp, angleDiff } from '../core/math.js';
import { findShore, board } from './interact.js';

export const FISH = {
  sardine: { name: 'sardines', n: [16, 26], size: 0.17, speed: 2.3, spread: 1.7, colors: ['#c9d6df', '#b7c7d3'], item: 'fresh_fish', warm: [0.25, 1], depth: [1.2, 30], catch: 0.8, w: 3 },
  herring: { name: 'herring', n: [16, 26], size: 0.2, speed: 2.3, spread: 1.8, colors: ['#aab9c4', '#9fb0bd'], item: 'fresh_fish', warm: [0, 0.5], depth: [1.5, 40], catch: 0.8, w: 3 },
  reef: { name: 'reef fish', n: [6, 11], size: 0.2, speed: 1.3, spread: 1.4, colors: ['#ffd23f', '#3fa7ff', '#ff8a3d', '#b37bff', '#ff5d8f', '#4fe0c0'], item: 'fresh_fish', warm: [0.55, 1], depth: [0.8, 16], catch: 0.75, reef: true, w: 4 },
  snapper: { name: 'snapper', n: [4, 7], size: 0.36, speed: 1.6, spread: 1.4, colors: ['#e2574c', '#f08a5d'], item: 'fresh_fish', warm: [0.4, 1], depth: [3, 30], catch: 0.6, low: true, w: 2 },
  cod: { name: 'cod', n: [4, 7], size: 0.46, speed: 1.3, spread: 1.4, colors: ['#8d9270', '#a09a78'], item: 'fresh_fish', warm: [0, 0.55], depth: [4, 60], catch: 0.6, low: true, w: 2 },
  tuna: { name: 'tuna', n: [3, 6], size: 0.75, speed: 3.2, spread: 2.2, colors: ['#3f5f86', '#35557a'], item: 'tuna', warm: [0.3, 1], depth: [6, 60], catch: 0.35, w: 1.2 },
  turtle: { name: 'a sea turtle', n: [1, 1], size: 1, speed: 0.8, spread: 0, colors: ['#6f8a4a'], warm: [0.5, 1], depth: [2, 18], critter: true, w: 0.5 },
  manta: { name: 'a manta ray', n: [1, 1], size: 1.7, speed: 1.1, spread: 0, colors: ['#3a4452'], warm: [0.6, 1], depth: [6, 40], critter: true, w: 0.35 },
};

const MAX_SCHOOLS = 7;
const P = { x: 0, y: 0, z: 0 };

export function installSeaLife(game) {
  const S = game.seaLife = { schools: [], t: 0, spawnT: 1, sharkT: 30, lastAct: null, fishPos: (s, f, out) => fishPos(s, f, S.t, out), shark: (x, y, lvl = 10) => game.addActor(makeShark(game, x, y, lvl)) };
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
  const lx = f.lead + Math.cos(a) * f.r * k, ly = Math.sin(a * 1.3) * f.r * 0.7 * k, lz = Math.sin(a * 0.7 + f.ph) * f.r * 0.35 * k;
  const ch = Math.cos(s.hd), sh = Math.sin(s.hd);
  out.x = s.x + lx * ch - ly * sh;
  out.y = s.y + lx * sh + ly * ch;
  out.z = Math.max(0.3, s.z + lz);
  return out;
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
  // under the surface the music turns dreamy (and comes back when you surface)
  const au = game.audio;
  if (au) {
    if (p.under && au.theme !== 'underwater' && au.theme !== 'battle') { S.prevTheme = au.theme; au.music('underwater'); }
    else if (!p.under && au.theme === 'underwater') { S.surfT = (S.surfT || 0) + dt; if (S.surfT > 1.5) { S.surfT = 0; au.music(S.prevTheme || 'sea'); } }
    else S.surfT = 0;
  }
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
    const fits = Object.entries(FISH).filter(([, d]) => warm >= d.warm[0] && warm <= d.warm[1] && depth >= d.depth[0] + 0.5 && (!d.reef || depth < 18) && (!d.critter || critters < 2));
    if (!fits.length) continue;
    let tot = 0;
    for (const [, d] of fits) tot += d.w;
    let q = Math.random() * tot, kind = fits[0][0];
    for (const [k, d] of fits) { q -= d.w; if (q <= 0) { kind = k; break; } }
    const def = FISH[kind];
    const n = def.n[0] + Math.floor(Math.random() * (def.n[1] - def.n[0] + 1));
    const hd = Math.random() * TAU;
    const z = clamp(def.low ? depth - 1 : def.depth[0] + Math.random() * Math.min(depth - def.depth[0], 8), 0.5, Math.max(0.5, depth - 0.6));
    const col = def.colors[Math.floor(Math.random() * def.colors.length)];
    const fish = [];
    for (let i = 0; i < n; i++) {
      fish.push({
        lead: (Math.random() - 0.5) * 2 * def.spread, r: 0.15 + Math.random() * def.spread * 0.6,
        ph: Math.random() * TAU, w: (0.25 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1),
        size: def.size * (0.8 + Math.random() * 0.4),
        col: def.reef ? def.colors[Math.floor(Math.random() * def.colors.length)] : col,
        alive: true,
      });
    }
    S.schools.push({ kind, def, x, y, z, hd, want: hd, wantZ: z, scare: 0, turnT: 2, alive: true, fish, seed: Math.random() * 100 });
    return;
  }
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
  const wary = def.critter ? 2.5 : s.scare > 0 ? 7 : (p.intent?.sprint || p.action) ? 4 : 2.2;
  if (p.inWater && pd < wary) { s.want = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.3; if (!def.critter) s.scare = Math.max(s.scare, 1.2); }
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
    if (s.def.critter) continue;
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
    game.log(s.def.item === 'tuna' ? 'You wrestle a big bluefin tuna out of the shoal!' : `You snatch one of the ${s.def.name} out of the water.`, '#81d4fa');
    game.fx.burst(best.x, best.y, 10, { color: ['#e1f5fe', '#b3e5fc'], speed: 2, vz: 2, g: -1, life: 0.6, size: 0.08, kind: 'bubble' });
    game.audio?.sfx('splash');
    game.progression?.train?.('agi', 0.4);
    if (!S.caughtHint) { S.caughtHint = true; game.hint?.('fishing', 'Fish you catch go in your bag — eat them for health and stamina, or sell them. Tuna out in the deep blue are worth much more.'); }
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

// ------------------------------------------------------------ sharks

function sharks(game, S, dt, p) {
  const w = game.world;
  const reg = regionAt(p.x, p.y);
  const out = p.inWater && p.mode !== 'sail' && !isCalmBelt(reg) && (w.sd ? w.sd(p.x, p.y) < -9 : true) && game.seaDepth(p.x, p.y) > 5;
  if (!out) { S.sharkT = Math.max(S.sharkT, 15); return; }
  S.sharkT -= dt;
  if (S.sharkT > 0) return;
  S.sharkT = 45 + Math.random() * 50;
  if (warmth(w, p.x, p.y) < 0.3 || Math.random() > 0.55) return;
  const count = game.actors.filter((a) => a.alive && a.shark).length;
  if (count >= 2) return;
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * TAU;
    const x = w.wx(p.x + Math.cos(a) * 22), y = p.y + Math.sin(a) * 22;
    if (!w.isLiquid(x, y) || w.isOverlay(x, y) || game.seaDepth(x, y) < 3) continue;
    const lvl = reg === REGION.NEW_WORLD ? 55 : isGrandLine(reg) ? 30 : reg === REGION.EAST_BLUE ? 7 : 14;
    const k = game.addActor(makeShark(game, x, y, lvl));
    game.log('A fin cuts through the water nearby... a shark!', '#ff8a80');
    game.audio?.sfx('reveal');
    game.hint?.('shark', 'Sharks hunt swimmers out past the reef. Fight back — or get out of the water.');
    return k;
  }
}

export function makeShark(game, x, y, level) {
  const k = new Actor({
    x, y, name: level > 40 ? 'Great Shark' : 'Shark', title: 'Hunter of the open sea', faction: 'beast',
    look: { race: 'beast_shark', scale: level > 40 ? 1.5 : 1 },
    attrs: { str: Math.round(level * 0.8), agi: Math.round(level * 0.7), end: Math.round(level * 0.6), vit: Math.round(level * 0.7), wil: 5 },
    hpMul: 1.3,
  });
  k.game = game;
  k.r = 0.8;
  k.shark = true;
  k.seaCreature = true;
  k.swimmer = true;
  k.depth = 0.7;
  k.bodyColor = level > 40 ? '#5b6770' : '#6f8796';
  k.kbResist = 0.3;
  k.passable = (w, px, py) => w.isLiquid(px, py) && !w.isOverlay(px, py) && game.seaDepth(px, py) > 1.4;
  k.canOccupy = function (w, px, py) { return this.passable(w, px, py); };
  k.updateWater = () => {};
  k.controller = new SharkBrain();
  k.showName = true;
  k.aggroPlayer = true;
  k.onKO = (a, att, g) => {
    g.fx.burst(a.x, a.y, 20, { color: ['#e1f5fe', '#81d4fa'], speed: 4, vz: 4, g: 8, life: 0.8, size: 0.14 });
    if (att?.isPlayer) {
      addItem(g, 'shark_fin', 1);
      addItem(g, 'fresh_fish', 2);
      g.log('You beat the shark! Its fin is worth a fortune to a cook.', '#ffe082');
    }
    setTimeout(() => { a.alive = false; }, 2500);
  };
  return k;
}

/**
 * Circles its prey with its fin out of the water, then dives and charges at
 * the swimmer's depth and bites. Loses interest in anyone out of the water.
 */
class SharkBrain {
  constructor() { this.mode = 'circle'; this.t = 4 + Math.random() * 3; this.ang = Math.random() * TAU; this.bored = 0; this.biteT = 0; }
  update(k, dt, game) {
    const p = game.player, w = game.world;
    k.intent.mx = 0; k.intent.my = 0;
    const dx = w.dx(k.x, p.x), dy = p.y - k.y, d = Math.hypot(dx, dy);
    if (d > 75) { k.alive = false; return; }
    if (k.state !== 'idle') return;
    const prey = p.inWater && p.mode !== 'sail' && p.state !== 'dead';
    let tx, ty, tz = 0.7, speed = 0.6;
    if (!prey || this.bored > 30) {
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
      tx = p.x; ty = p.y; tz = (p.depth || 0) + 0.35; speed = 1.3;
      this.t -= dt;
      const dz = Math.abs(k.depth - tz);
      if (d < 1.9 && dz < 1.2 && !k.action && this.biteT <= 0) {
        this.biteT = 0.3;
        k.action = { def: { anim: 'heavy', steps: [], windup: 0.3, recover: 0.5 }, t: 0, step: 0, total: 0.8, mult: 1, angle: k.facing };
      }
      if (this.t <= 0) { this.mode = 'circle'; this.t = 3.5 + Math.random() * 4; this.ang = Math.atan2(k.y - p.y, w.dx(p.x, k.x)); }
    }
    if (this.biteT > 0) {
      this.biteT -= dt;
      if (this.biteT <= 0 && k.alive && k.state === 'idle') {
        const mx = k.x + Math.cos(k.facing) * 1.2, my = k.y + Math.sin(k.facing) * 1.2;
        const dmg = 14 * (1 + k.attrs.str / 12);
        game.combat.hitbox({ owner: k, x: mx, y: my, shape: 'circle', range: 1.3, damage: dmg, knockback: 5, stun: 0.35, duration: 0.1 });
        game.fx.burst(mx, my, 12, { color: ['#e1f5fe', '#ffffff'], speed: 3, vz: 2, g: 4, life: 0.5, size: 0.1 });
        game.audio?.sfx('punch');
        this.mode = 'circle'; this.t = 3 + Math.random() * 3;
      }
    }
    // swim toward the target, rising and diving smoothly
    const ex = w.dx(k.x, tx), ey = ty - k.y, el = Math.hypot(ex, ey);
    if (el > 0.3) {
      k.intent.mx = ex / el * speed; k.intent.my = ey / el * speed;
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
 * A Devil Fruit user sinking like a stone: a crewmate who can swim dives in
 * after them and hauls them back to the ship (or the nearest shore).
 */
function rescue(game, S, dt, p) {
  const sinking = p.inWater && p.fruit && !p.gills && p.state === 'idle' && p.under;
  if (!sinking) { S.rescueT = 0; S.rescuer = null; return; }
  if (!S.rescuer) {
    const crew = game.crew?.followers ? [...game.crew.followers.values()] : [];
    S.rescuer = crew.find((a) => a.alive && a.state === 'idle' && !(a.fruit && !a.gills) && game.world.distance(a.x, a.y, p.x, p.y) < 35) || null;
    if (!S.rescuer) return;
    S.rescueT = 0;
    game.log(`${S.rescuer.name} dives in after you!`, '#81d4fa');
  }
  S.rescueT += dt;
  if (S.rescueT < (S.rescuer.gills ? 1.5 : 3.2)) return;
  const w = game.world, who = S.rescuer;
  S.rescuer = null; S.rescueT = 0;
  const ship = game.ships.find((s) => !s.sunk && s.owner === 'player' && w.distance(s.x, s.y, p.x, p.y) < 45);
  if (ship) board(game, p, ship);
  else {
    const spot = findShore(w, p.x, p.y, 24);
    if (!spot) return;
    p.leaveWater(game);
    p.x = spot.x; p.y = spot.y; p.vx = p.vy = 0;
  }
  p.oxygen = p.maxOxygen;
  if (who.alive) { who.x = p.x + 0.8; who.y = p.y; }
  game.log(`${who.name} hauls you out of the sea, coughing and spluttering.`, '#a5d6a7');
}
