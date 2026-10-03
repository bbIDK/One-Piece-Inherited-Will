// Life at sea: Log Pose navigation, discoveries, Reverse Mountain, Sea Kings
// in the Calm Belt, ship encounters and flotsam.
import { regionAt, REGION, REGION_INFO, isGrandLine, isCalmBelt, isBlue, RM_X, EQ } from '../world/constants.js';
import { REVERSE_MOUNTAIN } from '../world/worldgen.js';
import { T } from '../world/tiles.js';
import { Actor } from './actor.js';
import { AIController } from './ai.js';
import { makeLook } from '../data/races.js';
import { makeNPC } from './npcs.js';
import { count, addItem, earn } from './inventory.js';
import { ITEMS } from '../data/items.js';
import { persist } from './lineage.js';
import { crime } from './reputation.js';
import { RNG } from '../core/rng.js';
import { TAU, clamp } from '../core/math.js';
import { drawShip } from '../render/ship.js';
import { hullGap, hbAt } from '../world/hull.js';
import { sightRange } from './traffic.js';

// the eight points of the compass, round from east (y points south)
const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const fmtKm = (d) => (d >= 1000 ? (d / 1000).toFixed(d >= 10000 ? 0 : 1) + ' km' : Math.round(d / 10) * 10 + ' m');

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
    game.on('enterIsland', (isl) => { this.discover(isl); this.arrive(isl); });
    // (a pose put in the Log Pose slot: where its needle points)
    game.on('poseEquipped', () => this.announce('LOG POSE'));
    game.on('enterRegion', (reg, prev) => this.region(reg, prev));
    game.on('tick', (dt) => this.tick(dt));
    game.on('shipSunk', (s) => this.shipSunk(s));
    game.on('characterStart', () => { this.encT = 60; this.rmState = null; });
    game.logPoseInfo = () => this.logPoseInfo();
    game.logPoseTarget = () => this.logTarget();
    game.logPoseOptions = () => this.logOptions();
    game.setLogCourse = (id) => this.setCourse(id);
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
    // (the island's music: the audio director hears the arrival itself — see audio/director.js)
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
  }

  // ------------------------------------------------------------ log pose
  // The needle you follow is the pose in your Log Pose slot (see inventory.js):
  // your Log Pose, pointing where its log is set (`c.logPose.target`), or an
  // Eternal Pose (or a Vivre Card), always at its own island. The log sets on
  // the islands of the Grand Line as long as you carry a Log Pose, in the slot
  // or not; and you choose which island it points to (setCourse): where the
  // story goes next, any of the islands the last log could lock onto, or, in
  // the Blues, where an ordinary compass and a chart do, any island you've
  // charted in that sea.
  island(id) {
    const isls = this.game.surface?.islands;
    if (!id || !isls) return null;
    if (this.islIdx?.src !== isls) this.islIdx = { src: isls, by: new Map(isls.map((i) => [i.id, i])) };
    return this.islIdx.by.get(id) || null;
  }
  /** The pose in the Log Pose slot, if you still carry it: { id, d, eternal }. */
  pose() {
    const c = this.char, id = c?.equipped?.pose, d = ITEMS[id];
    if (!d || !count(c, id)) return null;
    return { id, d, eternal: !d.logPose };
  }
  logPoseInfo() {
    const g = this.game, c = this.char;
    if (!c || g.world !== g.surface) return null;
    const ps = this.pose();
    if (!ps) return null;
    const p = g.player, lp = c.logPose, here = g.currentIsland;
    const t = this.logTarget();
    if (!ps.eternal) {
      if (here?.def?.logSpins) return { angle: g.time * 9, label: 'The needle spins wildly…' };
      // on an island of the Grand Line whose log you haven't got: it's setting
      if (here && (!t || t === here) && here.def?.logNext?.length && lp.last !== here.id) {
        const held = g.storyLogHold?.(here);
        return { angle: -Math.PI / 2 + Math.sin(g.time * 7) * 0.3, label: held ? 'The log is setting…' : `Setting log… ${Math.round((lp.progress || 0) * 100)}%` };
      }
      if (!t) return { angle: g.time * 3, label: isGrandLine(regionAt(p.x, p.y)) ? 'Needle spinning…' : ps.d.name };
    } else if (!t) return { angle: g.time * 3, label: ps.d.name };
    const ang = Math.atan2(t.y - p.y, g.world.dx(p.x, t.x));
    return { angle: ang, label: this.named(t) ? t.name : '???' };
  }
  logTarget() {
    const c = this.char, ps = this.pose();
    if (!ps) return null;
    return this.island(ps.eternal ? ps.d.target : c.logPose?.target);
  }
  /** Whether the needle's island goes by its name (an Eternal Pose names its own). */
  named(t) {
    const c = this.char;
    return !!t && (this.pose()?.eternal || c.discovered.includes(t.id));
  }

  /**
   * Where you can set the needle of the Log Pose in your slot: the island the
   * story goes on to; the islands the last log could lock onto (every needle
   * of it); in the Blues, any island you've charted in the sea you're in; and
   * wherever it points now. [{ id, isl, why: 'story' | 'needle' | 'chart' | 'now', known }]
   */
  logOptions() {
    const g = this.game, c = this.char, ps = this.pose();
    if (!c || !ps || ps.eternal || g.world !== g.surface) return [];
    const lp = c.logPose, out = [], seen = new Set();
    const add = (id, why) => {
      const isl = this.island(id);
      if (!isl || seen.has(id) || (isl.def?.hidden && !c.flags?.laughTaleRevealed)) return;
      seen.add(id);
      out.push({ id, isl, why, known: c.discovered.includes(id) });
    };
    const story = g.storyLogIsland?.();
    if (story) add(story, 'story');
    const from = this.island(lp.last);
    for (const id of lp.options || (from?.def?.logSpins ? null : from?.def?.logNext) || []) add(id, 'needle');
    const p = g.player, reg = regionAt(p.x, p.y);
    if (isBlue(reg)) {
      const near = [];
      for (const id of c.discovered) {
        const isl = this.island(id);
        if (isl && isl !== g.currentIsland && !isl.def?.islet && regionAt(isl.x, isl.y) === reg) near.push([g.world.distance(p.x, p.y, isl.x, isl.y), id]);
      }
      near.sort((a, b) => a[0] - b[0]);
      for (const [, id] of near) add(id, 'chart');
    }
    if (lp.target) add(lp.target, 'now');
    return out;
  }

  /** Set the needle on one of logOptions(): it points there, and stays there until you choose again. */
  setCourse(id) {
    const g = this.game, c = this.char, lp = c?.logPose;
    const opt = this.logOptions().find((o) => o.id === id);
    if (!opt || !lp) return false;
    const story = g.storyLogIsland?.();
    lp.target = id;
    // (off the story's road: it won't swing the needle back until it moves on, see mainStory.js)
    lp.own = id === story ? null : story || true;
    lp.setting = null; lp.progress = 0;
    g.audio?.sfx('reveal');
    this.announce(opt.why === 'chart' ? 'COURSE SET' : 'LOG SET', false);
    g.emit('logSet', id);
    persist(g);
    return true;
  }

  /**
   * The banner for where the needle points now: the island (if it goes by a
   * name), which way and how far — and, if it swung there by itself and could
   * have gone elsewhere, where to choose another.
   */
  announce(head, hint = true) {
    const g = this.game, c = this.char, p = g.player, ps = this.pose();
    const t = this.logTarget();
    if (!c || !p || !ps || !t || g.world !== g.surface) return;
    const d = g.world.distance(p.x, p.y, t.x, t.y);
    const way = d < (t.radius || 0) ? 'You are there.' : `${DIRS[((Math.round(Math.atan2(t.y - p.y, g.world.dx(p.x, t.x)) / (Math.PI / 4)) % 8) + 8) % 8]}, ${fmtKm(d)} away.`;
    const more = hint && !ps.eternal && this.logOptions().length > 1 ? ' Another island? Choose at your Log Pose slot (Tab).' : '';
    g.ui?.banner?.(this.named(t) ? t.name : 'An uncharted island', ps.eternal ? (/vivre/i.test(ps.d.name) ? 'VIVRE CARD' : 'ETERNAL POSE') : head || 'LOG SET', `The needle points ${way}${more}`, 5);
  }

  /** Arrived where an Eternal Pose points: it goes back in your bag, and out comes your Log Pose. */
  arrive(isl) {
    const g = this.game, c = this.char, ps = this.pose();
    if (!c || !ps?.eternal || isl.id !== ps.d.target || g.world !== g.surface) return;
    const log = c.inventory.find((i) => ITEMS[i.id]?.logPose);
    if (!log) return;
    c.equipped.pose = log.id;
    g.log(`You've arrived where the ${ps.d.name} points. You put it away and follow your ${ITEMS[log.id].name} again.`, '#81d4fa');
  }

  updateLog(dt) {
    const g = this.game, c = this.char, p = g.player;
    // (carried, in the slot or in your bag, a Log Pose sets all the same)
    if (!count(c, 'log_pose') && !count(c, 'new_world_log_pose')) return;
    const isl = g.currentIsland;
    if (!isl || !isl.def?.logNext?.length || isl.def.logSpins || p.mode !== 'foot' || g.world !== g.surface) return;
    // (the main story is steering: the needle stays on the island it continues on)
    if (g.storyLogHold?.(isl)) return;
    const lp = c.logPose;
    if (lp.last === isl.id && lp.target) return;
    if (lp.setting !== isl.id) { lp.setting = isl.id; lp.progress = 0; }
    const secs = (isl.def.logTime ?? 1) * 45 / (g.crewMods?.logMul || 1); // canon log times are compressed
    lp.progress = Math.min(1, (lp.progress || 0) + dt / secs);
    if (lp.progress >= 1) {
      lp.last = isl.id;
      const next = isl.def.logNext;
      lp.options = next.slice();
      const rng = new RNG(c.runSeed + isl.id);
      const unknown = next.filter((id) => !c.discovered.includes(id));
      lp.target = (unknown.length ? rng.pick(unknown) : rng.pick(next));
      lp.progress = 0;
      if (!this.pose()?.eternal) this.announce('LOG SET');
      else g.log(`The Log Pose in your bag has set: its needle swings toward ${c.discovered.includes(lp.target) ? this.island(lp.target)?.name : 'an unknown island'}.`, '#81d4fa');
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
    // (not up Reverse Mountain's canals, where they cross the Calm Belt's latitudes in the rock)
    if (isCalmBelt(reg) && (s || p.inWater) && !this.rmState && g.world.type(p.x, p.y) !== T.RAPIDS) {
      this.kingT -= dt * (s?.def?.seastone || s?.upgrades?.includes('seastone_keel') ? 0.15 : 1);
      if (this.kingT <= 0) { this.kingT = 22 + Math.random() * 20; this.spawnSeaKing(p, reg); }
    } else this.kingT = Math.max(this.kingT, 6);
    // ship encounters (not in sight of land, nor riding Reverse Mountain)
    if (s && !g.currentIsland && !this.rmState) {
      this.encT -= dt;
      if (this.encT <= 0) {
        this.encT = (isGrandLine(reg) ? 80 : 120) + Math.random() * 80;
        this.encounter(p, s, reg);
      }
      this.flotsamT -= dt;
      if (this.flotsamT <= 0) { this.flotsamT = 25 + Math.random() * 30; this.spawnFlotsam(p, s); }
    }
    // pick up flotsam by sailing through it
    if (s && g.flotsam) {
      for (const f of g.flotsam) {
        if (!f.alive) continue;
        // (sailing through it: a big ship's hull, or within a small boat's reach)
        if (s.def.big ? hullGap(s, g.world.dx(s.x, f.x), f.y - s.y) < 2 : g.world.distance(f.x, f.y, s.x, s.y) < s.def.length * 0.6) {
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

  /**
   * Riding Reverse Mountain: into a gate, up the mountain on the current, the
   * summit where the four seas meet, and the plunge down into Paradise.
   * (Swimmers get carried up too — see actor.js.)
   */
  reverseMountain(dt, p, s) {
    const g = this.game, c = this.char;
    const who = s || (p.inWater ? p : null);
    if (!who) { if (this.rmState && p.mode === 'foot' && !p.inWater) this.rmState = null; return; }
    const cur = g.currentAt(who.x, who.y);
    const k = cur.canal;
    if (k && !this.rmState) {
      this.rmState = { t: 0, from: k.exit ? null : k.id, top: false };
      g.ui.banner('REVERSE MOUNTAIN', 'The gateway to the Grand Line', k.exit ? 'Down the torrent into the Grand Line!' : 'The sea is running UP the mountain — and it has you! Keep to the middle of the canal!', 5);
      if (s && !s.def.grandLine) g.log('Your little boat creaks in the current... The Grand Line will not be kind to it.', '#ff8a80');
      if (!s) g.log('The current tears you off your feet and sweeps you up the canal!', '#ff8a80');
    }
    const st = this.rmState;
    if (!st) return;
    st.t += dt;
    // the summit: the four seas crash together
    if (k && !st.top && (k.exit || cur.level > 150)) {
      st.top = true;
      g.ui.banner('THE SUMMIT', 'Where the four seas meet', 'Every current in the world crashes together up here... and there\'s only one way down.', 4);
      g.fx.shake?.(0.35);
      g.audio?.sfx('splash_big');
    }
    // out at the bottom of the torrent: the Grand Line
    if (!k && st.top) {
      this.rmState = null;
      c.flags.enteredGrandLine = true; // (the region change may have said so already)
      if (!c.flags.rodeReverseMountain) {
        c.flags.rodeReverseMountain = true;
        g.ui.toast('WELCOME TO THE GRAND LINE', 'You rode the current over Reverse Mountain!', '#ffd54f');
        g.progression.breakthrough(2, 'Crossed Reverse Mountain');
        g.hint('logpose', 'In the Grand Line your compass is useless. Carry a Log Pose, stay on an island until the log sets, and follow the needle to the next island.');
      }
      g.emit('questEvent', 'entered_grand_line');
      persist(g);
    } else if (!k && st.t > 4 && !st.top) this.rmState = null; // (swept back out to sea at a gate)
  }

  spawnSeaKing(p, reg) {
    const g = this.game;
    const a = Math.random() * TAU;
    // (clear of the hull, however big the ship)
    const R = 14 + (p.ship?.def.length || 0) * 0.5;
    const x = g.world.wx(p.x + Math.cos(a) * R), y = p.y + Math.sin(a) * R * 0.75;
    if (!g.world.isLiquid(x, y)) return;
    const lvl = reg === REGION.CALM_NORTH || reg === REGION.CALM_SOUTH ? (Math.abs(p.x - RM_X) < 1000 && p.x > RM_X ? 40 : 55) : 30;
    const k = makeSeaKing(g, x, y, lvl);
    g.addActor(k);
    g.fx.ring(x, y, 1, 6, '#e1f5fe', 1.2, 0.3);
    g.audio?.sfx('seaking');
    g.ui.banner('SEA KING!', '', 'A monster rises from the depths!', 3);
  }

  /**
   * A ship comes out of the haze: a Marine patrol on your trail once you're
   * wanted, a pirate crossing your bow at a distance, or a merchantman
   * passing closer. She's a ship at sea like any other (see traffic.js): her
   * crew are aboard and sailing her, and she can be boarded and beaten, or
   * sunk.
   */
  encounter(p, s, reg) {
    const g = this.game, w = g.world;
    if (!g.traffic) return;
    const rng = new RNG(Math.floor(g.time * 1000));
    const a = rng.range(0, TAU);
    // out beyond the haze (see sightRange), making for you: she sails into sight
    const R = sightRange(g) + 30;
    const x = w.wx(s.x + Math.cos(a) * R), y = s.y + Math.sin(a) * R;
    if (!w.sailable(x, y)) return;
    const gl = isGrandLine(reg);
    const nw = reg === REGION.NEW_WORLD;
    const roll = rng.next();
    let kind;
    if ((g.wanted?.tier() ?? 0) >= 2 && roll < 0.35) kind = 'marine';
    else if (roll < 0.7) kind = 'pirate';
    else kind = 'merchant';
    const lvl = nw ? rng.int(45, 70) : gl ? rng.int(22, 40) : isBlue(reg) && reg !== REGION.EAST_BLUE ? rng.int(10, 18) : rng.int(5, 12);
    const type = kind === 'marine' ? (nw ? 'marine_battleship' : gl ? rng.pick(['marine_warship', 'marine_battleship']) : 'brigantine')
      : nw ? rng.pick(['frigate', 'galleon', 'war_galleon', 'man_o_war']) : gl ? rng.pick(['brigantine', 'caravel', 'frigate', 'war_galleon']) : rng.pick(['sloop', 'caravel', 'sloop']);
    // (pirates keep to their own business: she crosses your bow at a distance
    // rather than bearing down on you; a merchantman passes closer; a Marine
    // patrol comes after you, for as long as she's given — see traffic.js)
    const spared = kind === 'pirate';
    const pass = Math.asin(Math.min(1, (spared ? 90 : kind === 'merchant' ? 45 : 0) / R)) * (rng.next() < 0.5 ? -1 : 1);
    const heading = a + Math.PI + pass;
    const ship = g.traffic.spawn({ kind, type, x, y, heading, level: lvl, dest: { x: w.wx(x + Math.cos(heading) * R * 2), y: y + Math.sin(heading) * R * 2 }, hunt: kind === 'marine' ? 180 + R / 6 : 0 });
    if (!ship) return;
    ship.label = `${ship.name} (Lv ${lvl})`;
    ship.showBar = true;
    // (her news waits till she's seen)
    ship.announce = spared ? ['A pirate ship flying an unfamiliar Jolly Roger crosses your bow in the distance — and sails on.', '#b0bec5']
      : kind === 'marine' ? ['A Marine patrol ship has spotted you! (You have a bounty.)', '#64b5f6'] : ['A merchant ship sails by.', '#b0bec5'];
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
      if (s.faction === 'marine') crime(g, 4000000 * (1 + (s.level || 5) / 40), 'sank a Marine ship', { rep: 2 });
      if (s.faction === 'civilian') crime(g, 2000000, 'sank a merchant ship', { rep: 10 });
      const rng = new RNG(Math.floor(s.x * 13 + s.y));
      if (rng.chance(0.25)) addItem(g, rng.pick(['jewels', 'gold_coins', 'sea_king_steak', 'rumble_ball']), 1);
      if (rng.chance(0.03)) this.fruitFromBarrel(rng);
    }
  }

  spawnFlotsam(p, s) {
    const g = this.game;
    const a = s.heading + (Math.random() - 0.5) * 1.2;
    const R = 20 + s.def.length * 0.6;
    const x = g.world.wx(s.x + Math.cos(a) * R), y = s.y + Math.sin(a) * R;
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

function drawBarrel(g, env) {
  const bob = Math.sin(env.time * 2 + this.t) * 0.08;
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(0, 0, 0.55, 0.2, 0, 0, TAU); g.fill();
  g.fillStyle = '#8d5b33'; g.fillRect(-0.3, -0.55 + bob, 0.6, 0.55);
  g.fillStyle = '#4a4a4a'; g.fillRect(-0.3, -0.45 + bob, 0.6, 0.06); g.fillRect(-0.3, -0.18 + bob, 0.6, 0.06);
  g.fillStyle = '#ffd54f'; g.font = 'bold 0.3px sans-serif'; g.textAlign = 'center'; g.fillText('?', 0, -0.75 + bob);
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
    let tx = p.x, ty = p.y;
    if (tgtShip) {
      // (a ship: it goes for her deck on the side it's come up, not her middle — a
      // great ship's broader than it can reach across)
      const c = Math.cos(tgtShip.heading), sn = Math.sin(tgtShip.heading), L = tgtShip.def.length;
      const ox = game.world.dx(tgtShip.x, k.x), oy = k.y - tgtShip.y;
      const u = clamp(ox * c + oy * sn, -L * 0.35, L * 0.35), hb = hbAt(u / L + 0.5, tgtShip.def.beam) * 0.7;
      const v = clamp(-ox * sn + oy * c, -hb, hb);
      tx = game.world.wx(tgtShip.x + u * c - v * sn); ty = tgtShip.y + u * sn + v * c;
    }
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
        // (unless she's sailed on out from under it)
        if (tgtShip && hullGap(tgtShip, game.world.dx(tgtShip.x, tx), ty - tgtShip.y) < 2.5) tgtShip.damage(dmg, k);
        game.fx.burst(tx, ty, 30, { color: ['#e1f5fe', '#81d4fa', '#ffffff'], speed: 6, vz: 7, g: 12, life: 0.9, size: 0.22 });
        game.fx.shake(0.6);
        game.audio?.sfx('crash', { x: tx, y: ty });
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
