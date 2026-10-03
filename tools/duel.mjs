// Headless duel simulation: a new pirate, driven by scripted inputs, against
// the bosses of the Blues on open flat ground — the game's own actors, AI,
// abilities and combat, with no browser and no renderer. It measures how fair
// a fight is: how often the newcomer wins, how long it takes, how much health
// it costs and how long they are ever held helpless.
//
//   node tools/duel.mjs [--boss=alvida,morgan] [--pilot=masher,blocker,reader]
//                       [--trials=24] [--sea=blue|paradise|newworld] [--style=brawler|ittoryu]
//                       [--attrs=5] [--mastery=0] [--limit=240] [--root=<another checkout>]
//                       [--tune=blue.dmg=0.6,...] [--log] [--json]
//
// (attrs: every attribute of the newcomer, 5 at the start of a life; mastery:
// of their style; limit: seconds before a fight is called off as lost)
//
// The pilots are three kinds of player:
//   masher   mashes the attack button (and the heavy when it's back), nothing else
//   blocker  also holds block (F) whenever a blow is coming — a quarter of a second
//            after it starts — and never dodges
//   reader   has learnt the rule: taps F as a blow lands to parry it, dodges (Q)
//            the ones that smash guards, and strikes back after a parry
// Every pilot reacts in human time (a reaction delay and a timing error on
// each press, from a seeded random stream), so trials differ but repeat.
//
// --root runs the same duels against another checkout of the game (the code
// as it was, say), for a before-and-after; --log prints one fight blow by blow.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const root = resolve(String(args.root || join(dirname(fileURLToPath(import.meta.url)), '..')));
const src = (p) => pathToFileURL(join(root, 'src', p)).href;

// (the game's modules expect a browser about them; nothing here draws)
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { Game } = await import(src('game/game.js'));
const { Actor } = await import(src('game/actor.js'));
const { Combat } = await import(src('game/combat.js'));
const { FX } = await import(src('game/fx.js'));
const { T } = await import(src('world/tiles.js'));
const { STYLES } = await import(src('data/styles.js'));
await import(src('data/fruits.js'));
await import(src('data/haki.js'));
const { PACKS } = await import(src('content/index.js'));
const { registerNPCs, npcDef, makeNPC } = await import(src('game/npcs.js'));
const { getAbility, canUse } = await import(src('game/abilities.js'));
for (const p of PACKS) if (p.npcs) registerNPCs(p.npcs);
// --tune=blue.windupMin=0.5,paradise.dmg=0.8: try other numbers for a tier (game/difficulty.js) without editing it
if (args.tune) {
  const { TIERS } = await import(src('game/difficulty.js'));
  for (const kv of String(args.tune).split(',')) {
    const [k, v] = kv.split('=');
    const [tier, key] = k.split('.');
    TIERS[tier][key] = Number(v);
  }
}

// a seeded stream for everything random (AI choices, crits, the pilots' nerves)
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (rnd, m, s) => m + s * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

// where the arena is: a spot in each sea (the game tunes fights by where they happen)
const SEAS = { blue: { x: 20000, y: 2000 }, paradise: { x: 20000, y: 6000 }, newworld: { x: 6000, y: 6000 } };

/** Open, dry, flat ground as far as anyone can run. */
function flatWorld() {
  return {
    width: 24576, height: 12288, zone: 0, quays: new Set(), islands: [],
    dx: (a, b) => b - a, wx: (x) => x,
    distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    dist2: (ax, ay, bx, by) => (bx - ax) ** 2 + (by - ay) ** 2,
    type: () => T.GRASS, solid: () => false, walkable: () => true, isBlocked: () => false, hitsProp: () => false,
    speedAt: () => 1, isLiquid: () => false, isOverlay: () => false, damageAt: () => 0, isQuay: () => false,
  };
}

/** Just enough of a Game to fight in: its own event, damage and zone code, none of its rendering. */
function arena(sea) {
  const game = Object.create(Game.prototype);
  const world = flatWorld();
  Object.assign(game, {
    world, surface: world, hooks: {}, hintsShown: new Set(), logLines: [], actors: [], ships: [], areaZones: [], zones: new Map(),
    time: 0, slowmo: 1, player: null, state: null, ui: null, audio: null,
    env: { time: 0, daylight: 1, clock: 12, day: 1, lightning: 0 },
  });
  game.fx = new FX(game);
  game.combat = new Combat(game);
  game.at = SEAS[sea] || SEAS.blue;
  return game;
}

/** One step of the game's own loop (game.js update), for the parts a fight needs. */
function step(game, dt) {
  game.time += dt;
  game.env.time += dt;
  game.fx.update(dt);
  let simDt = dt * game.slowmo;
  if (game.fx.hitstop > 0) { game.fx.hitstop -= dt; simDt *= 0.08; }
  game.combatT = Math.max(0, (game.combatT || 0) - dt);
  game.player.inCombat = true;
  for (let i = game.actors.length - 1; i >= 0; i--) {
    const a = game.actors[i];
    if (!a.alive) { game.actors.splice(i, 1); continue; }
    a.update(simDt, game);
  }
  game.combat.update(simDt);
  game.updateZones(simDt);
  game.emit('tick', dt);
}

const damaging = (s) => !!(s.hit || s.proj || s.zone || s.dash?.hit);
const breaksGuard = (s) => !!(s.hit?.guardBreak || s.hit?.unblockable || s.dash?.hit?.guardBreak || s.proj?.unblockable);

const PILOTS = {
  masher: { defend: 'none', react: [0.25, 0.05] },
  blocker: { defend: 'hold', react: [0.27, 0.06] },
  reader: { defend: 'read', react: [0.22, 0.05], lead: [0.09, 0.05], dodge: [0.09, 0.04], burst: 0.5 },
};

/**
 * Scripted inputs for the player: what a person at the keys would press,
 * fed through the same calls the player controller makes (tryM1, tryHeavy,
 * setBlock every frame with whether F is down, tryDodge).
 */
class Pilot {
  constructor(kind, rnd, foe, stats) {
    this.kind = kind; this.P = PILOTS[kind]; this.rnd = rnd; this.foe = foe; this.stats = stats;
    this.act = null; this.plans = new Map(); this.rate = 1; this.lastT = 0; this.holdTill = -1; this.counterUntil = -1;
    this.burstN = 0; this.burstLen = 3; this.pauseTill = -1;
  }

  /**
   * The foe's next blow: which step of their move, when it lands (real
   * seconds, as a person watching the swing would judge it) and whether it
   * smashes guards. The move's clock is read off how fast it has been running.
   */
  read(game, p) {
    const b = this.foe, act = b.action;
    if (!act) return null;
    const steps = act.def.steps || [];
    let i = act.step;
    while (i < steps.length && !damaging(steps[i])) i++;
    if (i >= steps.length) return null;
    const s = steps[i];
    const at = s.at ?? act.def.windup ?? 0;
    const d = game.world.distance(p.x, p.y, b.x, b.y);
    let travel = 0;
    if (s.proj) travel = Math.max(0, d - 0.6) / (s.proj.speed || 14);
    else if (s.dash) travel = Math.max(0, d - 1) / Math.max(1, s.dash.dist / s.dash.time);
    return { i, impact: game.time + Math.max(0, at - act.t) / Math.max(0.05, this.rate * (game.slowmo || 1)) + travel, breaks: breaksGuard(s), far: !!s.proj && (d > 3.5 || !p.hasWeapon('sword')) };
  }

  update(p, dt, game) {
    const now = game.time, b = this.foe, P = this.P, w = game.world;
    p.intent.mx = 0; p.intent.my = 0; p.intent.sprint = false;
    if (b.state !== 'idle' || !b.alive) { p.setBlock(false); return; }
    const dx = w.dx(p.x, b.x), dy = b.y - p.y, dist = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
    // watching the foe: a new move is noticed a reaction time after it starts
    const act = b.action;
    if (act !== this.act) {
      for (const pl of this.plans.values()) if (pl.kind === 'press' && pl.at !== undefined && now >= pl.at) this.holdTill = Math.max(this.holdTill, pl.impact + 0.15);
      this.act = act; this.plans = new Map();
      this.seen = act ? now + Math.max(0.12, gauss(this.rnd, P.react[0], P.react[1])) : Infinity;
      this.rate = b.atkSpeed(); this.lastT = act ? act.t : 0;
    } else if (act && dt > 0) {
      // (how fast the move's clock runs, in game time: hit-stop and slow motion aside)
      const r = (act.t - this.lastT) / dt;
      if (act.t > this.lastT && r > 0) this.rate = r;
      this.lastT = act.t;
    }
    if (act && P.defend !== 'none') {
      // a plan for each blow, once it's been seen coming: when to press, or to dodge
      for (const pl of this.plans.values()) {
        if (pl.i < act.step && !pl.ran) { pl.ran = true; if (pl.kind === 'press' && pl.at !== undefined && now >= pl.at) this.holdTill = Math.max(this.holdTill, pl.impact + 0.15); }
      }
      const th = now >= this.seen ? this.read(game, p) : null;
      // (a shot: run on in, as anyone would, rather than stand there guarding — unless it's close and you've a sword to turn it aside)
      if (th && !th.far) {
        let pl = this.plans.get(th.i);
        if (!pl) {
          pl = P.defend === 'hold' ? { i: th.i, kind: 'press', lead: Infinity }
            : th.breaks ? { i: th.i, kind: 'dodge', lead: Math.max(0.01, gauss(this.rnd, P.dodge[0], P.dodge[1])) }
              : { i: th.i, kind: 'press', lead: Math.max(-0.02, gauss(this.rnd, P.lead[0], P.lead[1])) };
          this.plans.set(th.i, pl);
          this.log?.(`sees ${act.def.name || act.def.id} (step ${th.i}) landing in ${(th.impact - now).toFixed(2)}s: ${pl.kind}${Number.isFinite(pl.lead) ? ' ' + pl.lead.toFixed(2) + 's early' : ''}`);
        }
        // (the swing tracked until the moment comes)
        if (pl.at === undefined || now < pl.at) { pl.impact = th.impact; pl.at = Math.max(now, th.impact - pl.lead); }
        if (pl.kind === 'dodge' && now >= pl.at && !pl.dodged) {
          pl.dodged = true;
          if (p.tryDodge(game, -dy / dist, dx / dist)) this.stats.dodges++;
          else this.log?.(`dodge refused (hitstun ${p.hitstun.toFixed(2)}, dodge back in ${(p.dodgeCd || 0).toFixed(2)})`);
        }
      }
    }
    if (P.defend === 'hold' && act && now >= this.seen) this.holdTill = Math.max(this.holdTill, now + 0.15);
    const countering = now < this.counterUntil;
    // (a string of blows not parried: the guard stays up while they keep swinging)
    if (P.defend === 'read' && !countering && act && now < this.holdTill) this.holdTill = Math.max(this.holdTill, now + 0.3);
    let wantBlock = now < this.holdTill && !countering;
    let pending = false;
    for (const pl of this.plans.values()) {
      if (pl.ran || pl.dodged) continue;
      if (pl.kind === 'press' && pl.at !== undefined && now >= pl.at) wantBlock = true;
      if (pl.at !== undefined && pl.at - now < 0.35) pending = true;
    }
    p.setBlock(wantBlock);
    if (!p.action || p.action.t < (p.action.def.windup ?? 0.1)) p.facing = ang;
    // closing in (running them down when they keep their distance)
    if (dist > 1.25) { p.intent.mx = dx / dist; p.intent.my = dy / dist; p.intent.sprint = dist > 2.2; }
    // striking: the masher always; the blocker whenever nothing's coming; the
    // reader in short bursts (two or three blows, then a look) and at once
    // after a parry — never into a blow it has seen coming
    let strike = dist < 1.7 && (P.defend === 'none' || countering || (!wantBlock && !pending));
    if (strike && P.burst && !countering && now < this.pauseTill) strike = false;
    if (strike) {
      const heavy = getAbility(STYLES[p.style]?.heavyId || 'brawl_heavy');
      if (heavy && canUse(p, heavy) && (countering || this.rnd() < 0.04) && p.tryHeavy(game)) this.stats.heavies++;
      else if (p.tryM1(game) && P.burst && !countering && ++this.burstN >= this.burstLen) {
        this.burstN = 0; this.burstLen = 2 + (this.rnd() < 0.5 ? 1 : 0);
        this.pauseTill = now + Math.max(0.2, gauss(this.rnd, P.burst, 0.12));
      }
    }
  }

  onHurt() {}
}

function newPirate(game, style, attrsLvl, o = {}) {
  const L = attrsLvl;
  const p = new Actor({ name: 'Newcomer', race: 'human', attrs: { str: L, agi: L, end: L, vit: L, wil: L + 1 } });
  p.game = game; p.isPlayer = true; p.faction = 'player'; p.persistent = true;
  p.style = style; p.masteries = { [style]: o.mastery || 0 };
  if (style === 'ittoryu') { p.weapon = { kind: 'sword', power: 1.2, count: 1 }; p.drawn = true; }
  p.char = { traits: [] };
  p.recalc(); p.hp = p.d.maxHp;
  p.x = game.at.x; p.y = game.at.y; p.facing = 0;
  game.player = p; game.actors.push(p);
  return p;
}

function spawnFoe(game, id) {
  const def = npcDef(id);
  if (!def) throw new Error(`no such NPC: ${id}`);
  const a = makeNPC(def, game.at.x + 4.5, game.at.y);
  a.game = game; game.actors.push(a);
  a.aggroPlayer = true; a.provoked = true; a.calm = false;
  a.facing = Math.PI;
  const c = a.controller;
  c.target = game.player; c.state = 'chase'; c.sawAt(game.player, game, a); c.leash = 0; c.pursuit = 0;
  return a;
}

function duel(id, kind, seed, o) {
  const rnd = mulberry(seed * 7919 + 17);
  Math.random = mulberry(seed * 104729 + 3);
  const game = arena(o.sea);
  const p = newPirate(game, o.style, o.attrs, o);
  const b = spawnFoe(game, id);
  const stats = { hitsTaken: 0, blocked: 0, parries: 0, perfect: 0, parried: 0, guardBreaks: 0, dodges: 0, heavies: 0, counters: 0, maxStun: 0 };
  const log = o.log ? (s) => console.log(`${game.time.toFixed(2).padStart(6)}  ${s}`) : null;
  // (the foe parrying you)
  const parryFx = game.fx.parry.bind(game.fx);
  game.fx.parry = (tgt, ...rest) => { if (tgt !== p) { stats.parried++; log?.('the foe parries you'); } return parryFx(tgt, ...rest); };
  p.controller = new Pilot(kind, rnd, b, stats);
  p.controller.log = log;
  game.on('playerHurt', (att, n) => { stats.hitsTaken++; log?.(`you take ${Math.round(n)} (${Math.round(p.hp)}/${p.d.maxHp})${p.hitstun > 0 ? ` stunned ${p.hitstun.toFixed(2)}s` : ''}`); });
  game.on('playerBlocked', () => { stats.blocked++; log?.('blocked'); });
  game.on('parry', () => { stats.parries++; if (p.parryPerfect) stats.perfect++; p.controller.counterUntil = game.time + 0.9; log?.(`PARRY${p.parryPerfect ? ' (perfect)' : ''}`); });
  game.on('playerCounter', () => { stats.counters++; log?.('COUNTER'); });
  game.on('playerHit', (t, n) => log?.(`you hit for ${Math.round(n)} (${Math.round(b.hp)}/${b.d.maxHp})`));
  let stun = 0, lastAct = null;
  const dt = 1 / 60, limit = o.limit;
  const hp0 = p.hp;
  while (game.time < limit) {
    step(game, dt);
    if (log && b.action && b.action !== lastAct) log(`${b.name}: ${b.action.def.name || b.action.def.id}`);
    lastAct = b.action;
    if (p.hitstun > 0 || p.state !== 'idle') { stun += dt; stats.maxStun = Math.max(stats.maxStun, stun); } else stun = 0;
    // (a guard smashed aside: it can't come up again for a moment)
    if (p.guardCd > 0 && !p._gbSeen) { p._gbSeen = true; stats.guardBreaks++; log?.('guard broken'); }
    if (!(p.guardCd > 0)) p._gbSeen = false;
    if (p.state !== 'idle' || b.state !== 'idle') break;
  }
  const won = b.state !== 'idle', lost = p.state !== 'idle';
  return { won, lost, time: game.time, hpLost: hp0 - Math.max(0, p.hp), hpPct: (hp0 - Math.max(0, p.hp)) / p.d.maxHp, foeLeft: Math.max(0, b.hp) / b.d.maxHp, ...stats };
}

const EAST = ['mq_v_dawn_island', 'higuma', 'alvida', 'morgan', 'buggy', 'kuro', 'krieg', 'arlong'];
const bosses = args.boss ? String(args.boss).split(',') : EAST;
const pilots = args.pilot ? String(args.pilot).split(',') : Object.keys(PILOTS);
const trials = Number(args.trials || 24);
const o = { sea: String(args.sea || 'blue'), style: String(args.style || 'brawler'), attrs: Number(args.attrs || 5), mastery: Number(args.mastery || 0), limit: Number(args.limit || 240), log: !!args.log };
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const rows = [];
for (const id of bosses) {
  for (const kind of pilots) {
    const rs = [];
    for (let k = 0; k < (o.log ? 1 : trials); k++) rs.push(duel(id, kind, k + 1, o));
    const wins = rs.filter((r) => r.won);
    rows.push({
      boss: id, pilot: kind, trials: rs.length, winRate: wins.length / rs.length,
      ttk: mean(wins.map((r) => r.time)), time: mean(rs.map((r) => r.time)),
      hpLostPct: mean(rs.map((r) => Math.min(1, r.hpPct))), hpLostWin: mean(wins.map((r) => r.hpPct)),
      foeLeft: mean(rs.filter((r) => !r.won).map((r) => r.foeLeft)),
      hitsTaken: mean(rs.map((r) => r.hitsTaken)), parries: mean(rs.map((r) => r.parries)), perfect: mean(rs.map((r) => r.perfect)),
      guardBreaks: mean(rs.map((r) => r.guardBreaks)), parried: mean(rs.map((r) => r.parried)), maxStun: Math.max(...rs.map((r) => r.maxStun)), counters: mean(rs.map((r) => r.counters)),
    });
  }
}
if (args.json) console.log(JSON.stringify(rows, null, 1));
else {
  const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');
  console.log(`root ${root}  sea ${o.sea}  style ${o.style}  attrs ${o.attrs}  mastery ${o.mastery}  ${trials} trials`);
  // (ttk: seconds to win, over the fights won; hp lost: of your health, over all of them; foe left: of theirs, over the fights lost)
  console.log('boss                 pilot     win%   ttk(s)  hp lost%  hits  parries(perfect)  counters  parried  guard-breaks  max stun(s)  foe left%');
  for (const r of rows) {
    console.log(`${r.boss.padEnd(20)} ${r.pilot.padEnd(8)} ${f(r.winRate * 100, 0).padStart(5)} ${f(r.ttk).padStart(8)} ${f(r.hpLostPct * 100, 0).padStart(9)} ${f(r.hitsTaken).padStart(5)} ${(f(r.parries) + '(' + f(r.perfect) + ')').padStart(16)} ${f(r.counters).padStart(9)} ${f(r.parried).padStart(8)} ${f(r.guardBreaks).padStart(13)} ${f(r.maxStun, 2).padStart(12)} ${f(r.foeLeft * 100, 0).padStart(10)}`);
  }
}
