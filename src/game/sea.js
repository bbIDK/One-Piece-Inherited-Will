// Life at sea: Log Pose navigation, discoveries, Reverse Mountain, Sea Kings
// in the Calm Belt, ship encounters and flotsam.
import { regionAt, REGION, REGION_INFO, isGrandLine, isCalmBelt, isBlue, RM_X, EQ } from '../world/constants.js';
import { REVERSE_MOUNTAIN } from '../world/worldgen.js';
import { Actor } from './actor.js';
import { AIController } from './ai.js';
import { makeLook } from '../data/races.js';
import { makeNPC } from './npcs.js';
import { count, addItem, earn } from './inventory.js';
import { persist } from './lineage.js';
import { RNG } from '../core/rng.js';
import { TAU, clamp, angleDiff } from '../core/math.js';
import { drawShip } from '../render/ship.js';

export function installSea(game) {
  const sea = new SeaSystem(game);
  game.sea = sea;
  return sea;
}

class SeaSystem {
  constructor(game) {
    this.game = game;
    this.encT = 40;
    this.kingT = 8;
    this.flotsamT = 20;
    this.rmState = null;
    game.on('enterIsland', (isl) => this.discover(isl));
    game.on('enterRegion', (reg, prev) => this.region(reg, prev));
    game.on('tick', (dt) => this.tick(dt));
    game.on('shipSunk', (s) => this.shipSunk(s));
    game.on('characterStart', () => { this.encT = 60; this.rmState = null; });
    game.logPoseInfo = () => this.logPoseInfo();
    game.logPoseTarget = () => this.logTarget();
  }
  get char() { return this.game.state?.char; }

  // ------------------------------------------------------------ discovery
  discover(isl) {
    const g = this.game, c = this.char;
    if (!c || !isl.name || isl.def?.islet) return;
    const first = !c.discovered.includes(isl.id);
    const inZone = g.world !== g.surface;
    if (first) {
      c.discovered.push(isl.id);
      if (!inZone) g.surface.reveal(isl.x, isl.y, isl.radius + 10);
      g.progression?.checkDream();
    }
    const reg = inZone ? { name: g.world.name } : REGION_INFO[regionAt(isl.x, isl.y)];
    g.ui.banner(isl.name, reg?.name || '', first ? (isl.def.tagline || 'New island charted!') : isl.def.tagline || '', first ? 5 : 3);
    if (first) g.emit('discovered', isl);
    g.audio?.music(isl.def.music || (isl.towns.length ? 'town' : 'sea'));
    if (first) persist(g);
  }

  region(reg, prev) {
    const g = this.game;
    const info = REGION_INFO[reg];
    if (!info) return;
    if (isCalmBelt(reg)) {
      g.ui.banner('CALM BELT', 'Nest of the Sea Kings', 'No wind. No current. Something enormous is moving beneath you.', 5);
      g.hint('calm', 'The Calm Belt has no wind — sails are useless. Hold SPACE to row. Sea Kings attack anything that floats here unless its hull is lined with Seastone.');
    } else if (reg === REGION.PARADISE && prev !== REGION.PARADISE && prev !== REGION.NEW_WORLD) {
      g.ui.banner('GRAND LINE', 'PARADISE', 'The first half of the pirates\' graveyard.', 6);
    } else if (reg === REGION.NEW_WORLD && prev !== REGION.NEW_WORLD) {
      const c = g.state?.char;
      const known = !!(c?.haki && (c.haki.armament || c.haki.observation || c.haki.conqueror));
      g.ui.banner('NEW WORLD', 'The second half of the Grand Line', known ? 'Here, Haki is not optional.' : 'Only the strongest survive here.', 6);
    } else if (isBlue(reg) && !isBlue(prev)) {
      g.ui.banner(info.name.toUpperCase(), '', '', 3);
    }
    g.audio?.music(isGrandLine(reg) ? 'grandline' : isCalmBelt(reg) ? 'night' : 'sea');
  }

  // ------------------------------------------------------------ log pose
  logPoseInfo() {
    const g = this.game, c = this.char;
    if (!c || g.world !== g.surface) return null;
    const p = g.player;
    const reg = regionAt(p.x, p.y);
    const hasPose = count(c, 'log_pose') || count(c, 'new_world_log_pose') || (c.logPose.eternal && count(c, c.logPose.eternal));
    if (!hasPose) return null;
    const lp = c.logPose;
    const t = this.logTarget();
    if (g.currentIsland?.def?.logSpins) return { angle: g.time * 9, label: 'The needle spins wildly…' };
    if (!t) {
      const isl = g.currentIsland;
      if (isl && isGrandLine(regionAt(isl.x, isl.y)) && isl.def?.logNext?.length) return { angle: -Math.PI / 2 + Math.sin(g.time * 7) * 0.3, label: `Setting log… ${Math.round((lp.progress || 0) * 100)}%` };
      return { angle: g.time * 3, label: isGrandLine(reg) ? 'Needle spinning…' : 'Log Pose' };
    }
    const ang = Math.atan2(t.y - p.y, g.world.dx(p.x, t.x));
    const known = c.discovered.includes(t.id);
    return { angle: ang, label: known ? t.name : '???' };
  }
  logTarget() {
    const c = this.char;
    if (!c?.logPose?.target) return null;
    return this.game.surface.islands.find((i) => i.id === c.logPose.target) || null;
  }

  updateLog(dt) {
    const g = this.game, c = this.char, p = g.player;
    if (!count(c, 'log_pose') && !count(c, 'new_world_log_pose')) return;
    const isl = g.currentIsland;
    if (!isl || !isl.def?.logNext?.length || isl.def.logSpins || p.mode !== 'foot' || g.world !== g.surface) return;
    const lp = c.logPose;
    if (lp.eternal && count(c, lp.eternal)) {
      if (lp.target !== isl.id) return; // an Eternal Pose keeps pointing at its island
      lp.eternal = null; lp.target = null; // arrived: the ordinary log takes over again
      g.log('You have arrived where the Eternal Pose was pointing.', '#81d4fa');
    }
    if (lp.last === isl.id && lp.target) return;
    if (lp.setting !== isl.id) { lp.setting = isl.id; lp.progress = 0; }
    const secs = (isl.def.logTime ?? 1) * 45 / (g.crewMods?.logMul || 1); // canon log times are compressed
    lp.progress = Math.min(1, (lp.progress || 0) + dt / secs);
    if (lp.progress >= 1) {
      lp.last = isl.id;
      const next = isl.def.logNext;
      const rng = new RNG(c.runSeed + isl.id);
      const unknown = next.filter((id) => !c.discovered.includes(id));
      lp.target = (unknown.length ? rng.pick(unknown) : rng.pick(next));
      lp.progress = 0;
      const t = this.logTarget();
      g.ui.toast('LOG SET', `The needle swings toward ${c.discovered.includes(lp.target) ? t?.name : 'an unknown island'}.`, '#81d4fa');
      g.emit('logSet', lp.target);
      g.audio?.sfx('reveal');
      persist(g);
    }
  }

  // ------------------------------------------------------------ per frame
  tick(dt) {
    const g = this.game, p = g.player, c = this.char;
    if (!c || !p || g.world !== g.surface) return;
    this.updateLog(dt);
    const reg = regionAt(p.x, p.y);
    const s = p.mode === 'sail' ? p.ship : null;
    this.reverseMountain(dt, p, s);
    // Sea Kings in the Calm Belt
    if (isCalmBelt(reg) && (s || p.inWater)) {
      this.kingT -= dt * (s?.def?.seastone || s?.upgrades?.includes('seastone_keel') ? 0.15 : 1);
      if (this.kingT <= 0) { this.kingT = 22 + Math.random() * 20; this.spawnSeaKing(p, reg); }
    } else this.kingT = Math.max(this.kingT, 6);
    // ship encounters (not in sight of land)
    if (s && !g.currentIsland) {
      this.encT -= dt;
      if (this.encT <= 0) {
        this.encT = (isGrandLine(reg) ? 50 : 80) + Math.random() * 60;
        this.encounter(p, s, reg);
      }
      this.flotsamT -= dt;
      if (this.flotsamT <= 0) { this.flotsamT = 25 + Math.random() * 30; this.spawnFlotsam(p, s); }
    }
    // pick up flotsam by sailing through it
    if (s && g.flotsam) {
      for (const f of g.flotsam) {
        if (!f.alive) continue;
        if (g.world.distance(f.x, f.y, s.x, s.y) < s.def.length * 0.6) {
          f.alive = false;
          const rng = new RNG(Math.floor(f.x * 7 + f.y));
          const item = rng.pick(['meat', 'fish_stew', 'sake', 'bandage', 'gold_coins', 'cola', 'rice_ball']);
          addItem(g, item, 1);
          if (rng.chance(0.3)) earn(g, rng.int(200, 1500), 'floating barrel');
          if (rng.chance(0.04)) this.fruitFromBarrel(rng);
          g.audio?.sfx('coin');
        }
      }
      g.flotsam = g.flotsam.filter((f) => f.alive);
    }
    // the Calm Belt swallows swimmers
    if (isCalmBelt(reg) && p.inWater && Math.random() < dt * 0.1) g.hint('calm_swim', 'Swimming in the Calm Belt is suicide. Only Silvers Rayleigh ever did it.');
  }

  reverseMountain(dt, p, s) {
    const g = this.game, c = this.char;
    if (!s) return;
    const M = REVERSE_MOUNTAIN;
    const dx = g.world.dx(M.x, s.x), dy = s.y - M.y;
    const inside = Math.abs(dx) < M.rx * Math.sqrt(Math.max(0, 1 - (dy / M.ry) ** 2));
    if (inside && !this.rmState) {
      this.rmState = { t: 0 };
      g.ui.banner('REVERSE MOUNTAIN', 'The gateway to the Grand Line', 'The current is dragging you UP the mountain! Keep to the middle of the canal!', 5);
      g.audio?.music('battle');
      if (!s.def.grandLine) g.log('Your little boat creaks in the current... The Grand Line will not be kind to it.', '#ff8a80');
    }
    if (this.rmState) {
      this.rmState.t += dt;
      if (dx > M.rx - 5 && Math.abs(dy) < 20) {
        this.rmState = null;
        if (!c.flags.enteredGrandLine) {
          c.flags.enteredGrandLine = true;
          g.ui.toast('WELCOME TO THE GRAND LINE', 'You rode the current over Reverse Mountain!', '#ffd54f');
          g.progression.breakthrough(2, 'Crossed Reverse Mountain');
          g.hint('logpose', 'In the Grand Line your compass is useless. Carry a Log Pose, stay on an island until the log sets, and follow the needle to the next island.');
          g.emit('questEvent', 'entered_grand_line');
          persist(g);
        }
        g.audio?.music('grandline');
      } else if (!inside && this.rmState.t > 3) this.rmState = null;
    }
  }

  spawnSeaKing(p, reg) {
    const g = this.game;
    const a = Math.random() * TAU;
    const x = g.world.wx(p.x + Math.cos(a) * 14), y = p.y + Math.sin(a) * 10;
    if (!g.world.isLiquid(x, y)) return;
    const lvl = reg === REGION.CALM_NORTH || reg === REGION.CALM_SOUTH ? (Math.abs(p.x - RM_X) < 1000 && p.x > RM_X ? 40 : 55) : 30;
    const k = makeSeaKing(g, x, y, lvl);
    g.addActor(k);
    g.fx.ring(x, y, 1, 6, '#e1f5fe', 1.2, 0.3);
    g.audio?.sfx('seaking');
    g.ui.banner('SEA KING!', '', 'A monster rises from the depths!', 3);
  }

  encounter(p, s, reg) {
    const g = this.game, c = this.char;
    const rng = new RNG(Math.floor(g.time * 1000));
    const a = rng.range(0, TAU);
    const x = g.world.wx(s.x + Math.cos(a) * 26), y = s.y + Math.sin(a) * 18;
    if (!g.world.sailable(x, y)) return;
    const gl = isGrandLine(reg);
    const nw = reg === REGION.NEW_WORLD;
    const roll = rng.next();
    let kind;
    if (c.bounty > 0 && roll < 0.35) kind = 'marine';
    else if (roll < 0.7) kind = 'pirate';
    else kind = 'merchant';
    const lvl = nw ? rng.int(45, 70) : gl ? rng.int(22, 40) : isBlue(reg) && reg !== REGION.EAST_BLUE ? rng.int(10, 18) : rng.int(5, 12);
    const type = nw ? rng.pick(['frigate', 'galleon', 'brigantine']) : gl ? rng.pick(['brigantine', 'caravel', 'frigate']) : rng.pick(['sloop', 'caravel', 'sloop']);
    const faction = kind === 'marine' ? 'marine' : kind === 'pirate' ? 'pirate' : 'civilian';
    const ship = g.addShip({
      type: kind === 'marine' ? (gl ? 'marine_warship' : 'brigantine') : type, x, y, heading: a + Math.PI, owner: kind, faction,
      name: kind === 'marine' ? 'Marine Patrol' : kind === 'pirate' ? pirateShipName(rng) : 'Merchant Ship',
      jr: kind === 'pirate' ? { skull: rng.pick(['classic', 'grin', 'eyepatch']), bones: rng.pick(['cross', 'swords']), accessory: rng.pick(['bandana', 'horns', 'tricorne', 'none', 'flames']), color: '#f5f6fa' } : null,
    });
    ship.level = lvl;
    ship.label = `${ship.name} (Lv ${lvl})`;
    ship.showBar = true;
    ship.cannonsOverride = kind === 'merchant' ? 0 : undefined;
    ship.ai = kind === 'merchant' ? merchantAI : warshipAI;
    ship.hull = ship.maxHull = Math.round(ship.maxHull * (0.5 + lvl / 40));
    ship.loot = Math.round((kind === 'merchant' ? 3000 : 1500) * (1 + lvl / 10));
    ship.expire = 180;
    if (kind === 'pirate') g.log(`A pirate ship flying an unfamiliar Jolly Roger is closing in!`, '#ff8a80');
    else if (kind === 'marine') g.log('A Marine patrol ship has spotted you! (You have a bounty.)', '#64b5f6');
    else g.log('A merchant ship sails by.', '#b0bec5');
  }

  shipSunk(s) {
    const g = this.game, p = g.player;
    if (s.owner === 'player') {
      g.log(`The ${s.name} is sinking!`, '#ff5252');
      if (p.ship === s && p.onShip) {
        p.onShip = false;
        p.mode = 'foot';
        s.captain = null;
        p.x = s.x; p.y = s.y;
        g.ui.banner('SHIPWRECKED', '', p.fruit ? 'A Devil Fruit user in open water… find something to hold onto — fast!' : 'Swim for the nearest shore!', 4);
      }
      persist(g);
      return;
    }
    if (s.lastHitBy && s.lastHitBy.isPlayer) {
      earn(g, s.loot || 1000, `plunder from the ${s.name}`);
      if (s.faction === 'marine') g.progression.addBounty(8000 * (1 + (s.level || 5) / 10), 'sank a Marine ship');
      if (s.faction === 'civilian') g.progression.addBounty(3000, 'attacked a merchant ship');
      const rng = new RNG(Math.floor(s.x * 13 + s.y));
      if (rng.chance(0.25)) addItem(g, rng.pick(['jewels', 'gold_coins', 'sea_king_steak', 'rumble_ball']), 1);
      if (rng.chance(0.03)) this.fruitFromBarrel(rng);
    }
  }

  spawnFlotsam(p, s) {
    const g = this.game;
    const a = s.heading + (Math.random() - 0.5) * 1.2;
    const x = g.world.wx(s.x + Math.cos(a) * 20), y = s.y + Math.sin(a) * 20;
    if (!g.world.isLiquid(x, y)) return;
    g.flotsam = g.flotsam || [];
    const f = { x, y, alive: true, sortY: y, draw: drawBarrel, t: Math.random() * 10 };
    g.flotsam.push(f);
  }

  fruitFromBarrel(rng) {
    const g = this.game;
    const fid = g.rollFruit?.(rng);
    if (fid) { addItem(g, 'fruit_' + fid, 1); g.ui.toast('A DEVIL FRUIT?!', 'A strange swirled fruit was floating in the barrel!', '#ffab91'); }
  }
}

function pirateShipName(rng) {
  return `${rng.pick(['Black', 'Crimson', 'Howling', 'Iron', 'Salty', 'Grinning', 'Rotten', 'Screaming', 'Golden'])} ${rng.pick(['Shark', 'Maiden', 'Gull', 'Kraken', 'Widow', 'Barracuda', 'Skull', 'Jackal', 'Tide'])}`;
}

function drawBarrel(g, env) {
  const bob = Math.sin(env.time * 2 + this.t) * 0.08;
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(0, 0, 0.55, 0.2, 0, 0, TAU); g.fill();
  g.fillStyle = '#8d5b33'; g.fillRect(-0.3, -0.55 + bob, 0.6, 0.55);
  g.fillStyle = '#4a4a4a'; g.fillRect(-0.3, -0.45 + bob, 0.6, 0.06); g.fillRect(-0.3, -0.18 + bob, 0.6, 0.06);
  g.fillStyle = '#ffd54f'; g.font = 'bold 0.3px sans-serif'; g.textAlign = 'center'; g.fillText('?', 0, -0.75 + bob);
}

// ------------------------------------------------------------- ship AI
function warshipAI(s, dt, game) {
  const p = game.player;
  s.expire -= dt;
  const target = p.mode === 'sail' && p.ship ? p.ship : null;
  const d = game.world.distance(s.x, s.y, p.x, p.y);
  if (s.expire <= 0 && d > 40) { s.alive = false; return; }
  const hostileToPlayer = s.faction === 'pirate' || (s.faction === 'marine' && (game.state.char.bounty > 0 || s.provoked));
  if (!hostileToPlayer) return merchantAI(s, dt, game);
  s.sail = 1;
  if (!target && d > 50) return;
  // circle to present a broadside at ~9 tiles
  const toT = Math.atan2(p.y - s.y, game.world.dx(s.x, p.x));
  const want = d > 12 ? toT : toT + Math.PI / 2 * (angleDiff(s.heading, toT) > 0 ? -1 : 1);
  s.heading += clamp(angleDiff(s.heading, want), -1, 1) * s.def.turn * dt;
  const side = Math.abs(Math.abs(angleDiff(s.heading, toT)) - Math.PI / 2);
  if (d < 16 && side < 0.6 && s.cannonCd <= 0) s.fireBroadside(game, p.x, p.y, { name: s.name, faction: s.faction, isShip: true, power: () => (s.level || 5) * 10 });
}

function merchantAI(s, dt, game) {
  s.expire -= dt;
  s.sail = 0.8;
  const d = game.world.distance(s.x, s.y, game.player.x, game.player.y);
  if (s.expire <= 0 && d > 40) s.alive = false;
  if (s.hull < s.maxHull && d < 25) { // flee
    const away = Math.atan2(s.y - game.player.y, game.world.dx(game.player.x, s.x));
    s.heading += clamp(angleDiff(s.heading, away), -1, 1) * s.def.turn * dt;
  }
}

// --------------------------------------------------------------- Sea Kings
export function makeSeaKing(game, x, y, level, opts = {}) {
  const k = new Actor({
    x, y, name: opts.name || 'Sea King', title: opts.title || 'Monster of the Calm Belt', faction: 'seaking',
    look: { race: 'seaking' }, attrs: { str: level, agi: Math.round(level * 0.6), end: level, vit: level, wil: level * 0.5 }, hpMul: opts.hpMul || 5,
    boss: !!opts.boss, poise: true,
  });
  k.game = game;
  k.r = 1.6;
  k.swimmer = true;
  k.npcId = opts.id || null;
  k.bodyColor = opts.color || ['#2e7d32', '#6a1b9a', '#b71c1c', '#1565c0', '#ef6c00'][Math.floor(Math.random() * 5)];
  k.kbResist = 0.05;
  k.passable = (w, px, py) => w.isLiquid(px, py) && !w.isOverlay(px, py);
  k.canOccupy = function (w, px, py) { return this.passable(w, px, py) && this.passable(w, px + 1, py) && this.passable(w, px - 1, py); };
  k.updateWater = () => {};
  k.controller = new SeaKingBrain(opts);
  k.draw = drawSeaKing;
  k.showName = true;
  k.lethal = true;
  k.aggroPlayer = true;
  k.breakthrough = opts.breakthrough;
  k.onKO = (a, att, g) => {
    g.fx.burst(a.x, a.y, 40, { color: ['#e1f5fe', '#81d4fa'], speed: 6, vz: 6, g: 10, life: 1, size: 0.2 });
    if (att?.isPlayer) { addItem(g, 'sea_king_steak', 1); g.log('You hauled in a chunk of Sea King. That\'s a feast!', '#ffe082'); }
    setTimeout(() => { a.alive = false; }, 2500);
  };
  return k;
}

class SeaKingBrain {
  constructor(opts) { this.t = 1 + Math.random(); this.opts = opts; this.submerged = false; }
  update(k, dt, game) {
    const p = game.player;
    const tgtShip = p.mode === 'sail' && p.ship && !p.ship.sunk ? p.ship : null;
    const tx = tgtShip ? tgtShip.x : p.x, ty = tgtShip ? tgtShip.y : p.y;
    const dx = game.world.dx(k.x, tx), dy = ty - k.y;
    const d = Math.hypot(dx, dy);
    k.facing = Math.atan2(dy, dx);
    k.intent.mx = 0; k.intent.my = 0;
    if (d > 60) { k.alive = false; return; }
    this.t -= dt;
    if (!k.action && d > 4) { k.intent.mx = dx / d; k.intent.my = dy / d; }
    if (this.t <= 0 && d < 7) {
      this.t = 3 + Math.random() * 2;
      const bite = Math.random() < 0.6;
      game.fx.telegraph(tx, ty, 'circle', { r: bite ? 2.6 : 4, life: 0.9, color: 'rgba(255,40,40,1)' });
      k.action = { def: { anim: 'heavy', steps: [], windup: 0.9, recover: 0.6 }, t: 0, step: 0, total: 1.6, mult: 1, angle: k.facing };
      setTimeout(() => {
        if (!k.alive || k.state !== 'idle') return;
        const dmg = (bite ? 60 : 40) * (1 + k.attrs.str / 25);
        game.combat.hitbox({ owner: k, x: tx, y: ty - 0.4, shape: 'circle', range: bite ? 2.6 : 4, damage: dmg * 0.5, knockback: 10, stun: 0.6, heavy: true, duration: 0.1, radial: true });
        if (tgtShip && game.world.distance(tgtShip.x, tgtShip.y, tx, ty) < 4) tgtShip.damage(dmg, k);
        game.fx.burst(tx, ty, 30, { color: ['#e1f5fe', '#81d4fa', '#ffffff'], speed: 6, vz: 7, g: 12, life: 0.9, size: 0.22 });
        game.fx.shake(0.6);
        game.audio?.sfx('crash');
      }, 900);
    }
  }
}

function drawSeaKing(g, env) {
  const t = env.time + this.seed;
  const col = this.bodyColor;
  const f = this.facing;
  const n = 7;
  // serpent coils breaking the surface
  for (let i = n - 1; i >= 0; i--) {
    const bx = -Math.cos(f) * i * 1.1 + Math.sin(t * 2 + i) * 0.3 * Math.sin(f);
    const by = -Math.sin(f) * i * 0.8 + Math.sin(t * 2 + i) * 0.3 * Math.cos(f);
    const hump = Math.max(0, Math.sin(t * 1.5 - i * 0.9)) * 0.8 + (i === 0 ? 1.6 : 0.2);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(bx, by, 1.1 - i * 0.08, 0.4, 0, 0, TAU); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.ellipse(bx, by - hump, 0.9 - i * 0.07, 0.75 - i * 0.05, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.beginPath(); g.ellipse(bx - 0.2, by - hump - 0.25, 0.4, 0.2, 0, 0, TAU); g.fill();
  }
  // head
  const hx = 0, hy = -2.6;
  g.fillStyle = col;
  g.beginPath(); g.ellipse(hx, hy, 1.3, 1.0, 0, 0, TAU); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(hx - 0.45, hy - 0.25, 0.22, 0, TAU); g.arc(hx + 0.45, hy - 0.25, 0.22, 0, TAU); g.fill();
  g.fillStyle = '#b71c1c'; g.beginPath(); g.arc(hx - 0.45, hy - 0.22, 0.1, 0, TAU); g.arc(hx + 0.45, hy - 0.22, 0.1, 0, TAU); g.fill();
  g.fillStyle = '#3e2723'; g.beginPath(); g.ellipse(hx, hy + 0.4, 0.8, 0.3 + (this.action ? 0.25 : 0), 0, 0, TAU); g.fill();
  g.fillStyle = '#fff'; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(hx + k * 0.2, hy + 0.2); g.lineTo(hx + k * 0.2 + 0.08, hy + 0.45); g.lineTo(hx + k * 0.2 + 0.16, hy + 0.2); g.fill(); }
  if (this.state === 'idle') {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(-1.2, -4.2, 2.4, 0.16);
    g.fillStyle = '#ef5350'; g.fillRect(-1.2, -4.2, 2.4 * Math.max(0, this.hp / this.d.maxHp), 0.16);
    g.font = 'bold 0.34px Nunito, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 0.06;
    g.strokeText(this.name, 0, -4.35); g.fillText(this.name, 0, -4.35);
  }
}

export { makeLook, AIController, drawShip, makeNPC, EQ };
