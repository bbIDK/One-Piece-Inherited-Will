// Named NPCs, enemy groups and bosses from data, spawned when their island is
// populated. Also the interaction dispatcher for buildings, townsfolk,
// chests and props.
import { Actor } from './actor.js';
import { AIController } from './ai.js';
import { makeLook } from '../data/races.js';
import { RNG } from '../core/rng.js';
import { openShop, openInn, openDoctor, openShipyard, openTrainer } from '../ui/panels.js';
import { addItem, earn, useItem } from './inventory.js';
import { ITEMS } from '../data/items.js';
import { STYLES } from '../data/styles.js';
import { FRUITS } from '../data/fruits.js';
import { persist } from './lineage.js';
import { rumorFor } from './rumors.js';

const NPC_DEFS = new Map();
const GROUPS = []; // enemy groups: { island, spot|dx/dy, enemies: [archetype...], when }
export function registerNPCs(list) { for (const n of list) NPC_DEFS.set(n.id, n); }
export function registerGroups(list) { for (const g of list) GROUPS.push(g); }
export const npcDef = (id) => NPC_DEFS.get(id);
export const allNpcDefs = () => [...NPC_DEFS.values()];

// ---------------------------------------------------------- enemy archetypes
// level ~ attribute value; tier gives HP/damage multipliers
export const ARCHETYPES = {
  bandit: { name: 'Mountain Bandit', faction: 'bandit', style: 'brawler', look: { top: '#6d4c41', hat: 'bandana', hatColor: '#8d6e63' }, skill: 0.15, barks: ['Hand over your money!', 'Heh heh heh!'] },
  pirate: { name: 'Pirate Grunt', faction: 'pirate', style: 'ittoryu', weapon: 'sword', look: { top: '#37474f', hat: 'bandana', hatColor: '#b71c1c' }, skill: 0.2, barks: ['Yo-ho!', 'Get \'em!'] },
  pirate_gunner: { name: 'Pirate Gunner', faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#5d4037', hat: 'tricorne' }, skill: 0.15 },
  marine: { name: 'Marine', faction: 'marine', style: 'ittoryu', weapon: 'sword', look: { top: '#ffffff', bottom: '#1b4f72', hat: 'marine' }, skill: 0.25, lethal: false, barks: ['For Justice!', 'Halt, pirate!'] },
  marine_rifle: { name: 'Marine Rifleman', faction: 'marine', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#ffffff', bottom: '#1b4f72', hat: 'marine' }, skill: 0.2, lethal: false },
  marine_officer: { name: 'Marine Officer', faction: 'marine', style: 'rokushiki', look: { top: '#ffffff', bottom: '#1b4f72', hat: 'marine', coat: '#fafafa', coatText: 'JUSTICE' }, skill: 0.5, lethal: false, moves: ['roku_soru', 'roku_rankyaku'] },
  swordsman: { name: 'Wandering Swordsman', faction: 'rival', style: 'nitoryu', weapon: 'sword', look: { top: '#455a64', hat: 'headband', hatColor: '#212121' }, skill: 0.45, moves: ['nito_taka'] },
  brute: { name: 'Brute', faction: 'pirate', style: 'brawler', look: { top: '#795548' }, bulk: 1.35, skill: 0.1, moves: ['brawl_tackle', 'brawl_headbutt'], hpMul: 1.6 },
  fishman_thug: { name: 'Fish-Man Pirate', faction: 'pirate', race: 'fishman', style: 'fishman_karate', look: {}, skill: 0.3, moves: ['fmk_uchimizu'], hpMul: 1.2 },
  baroque: { name: 'Baroque Works Agent', faction: 'baroque', style: 'sniper', weapon: 'gun', look: { top: '#212121', hat: 'cowboy', hatColor: '#212121' }, skill: 0.35, moves: ['snipe_explode'] },
  cp: { name: 'Cipher Pol Agent', faction: 'cp', style: 'rokushiki', look: { top: '#212121', bottom: '#212121' }, skill: 0.6, moves: ['roku_soru', 'roku_rankyaku', 'roku_tekkai'] },
  zombie: { name: 'Zombie', faction: 'zombie', style: 'brawler', look: { top: '#4e342e', skin: '#9e9d89' }, skill: 0.05, barks: ['Uuurgh...'] },
  beast: { name: 'Wild Boar', faction: 'beast', style: 'brawler', beast: 'boar', look: { top: '#6d4c41', skin: '#6d4c41', hair: 'bald', ears: 'round', fur: '#6d4c41', muzzle: true, tail: 'thin' }, skill: 0, hpMul: 1.3 },
  tiger: { name: 'Mountain Tiger', faction: 'beast', style: 'electro', beast: 'tiger', look: { skin: '#f39c12', fur: '#f39c12', hairColor: '#f39c12', ears: 'round', tail: 'thin', muzzle: true, top: '#f39c12', bottom: '#e67e22', hair: 'bald', furFace: true }, skill: 0.2, hpMul: 1.5 },
  dinosaur: { name: 'Dinosaur', faction: 'beast', style: 'brawler', look: { skin: '#558b2f', top: '#558b2f', bottom: '#33691e', hair: 'bald', fin: true, muzzle: true, tail: 'fluffy', fur: '#558b2f' }, bulk: 1.6, scale: 1.5, hpMul: 2.5, skill: 0 },
  gorilla: { name: 'Snow Gorilla', faction: 'beast', style: 'brawler', look: { skin: '#eceff1', fur: '#eceff1', hairColor: '#eceff1', top: '#eceff1', bottom: '#cfd8dc', ears: 'round', furFace: true, muzzle: true, hair: 'bald' }, bulk: 1.4, hpMul: 1.8, skill: 0.1 },
  pacifista: { name: 'Pacifista', faction: 'marine', style: 'brawler', look: { top: '#263238', bottom: '#263238', skin: '#607d8b', hat: 'bandana', hatColor: '#263238' }, bulk: 1.5, scale: 1.4, hpMul: 3, skill: 0.3, moves: ['kuma_laser'], lethal: true },
};

// ------------------------------------------------------------ spawning
export function makeNPC(def, x, y, extra = {}) {
  const L = def.level ?? 6;
  const look = def.fullLook ? { ...def.fullLook } : makeLook(def.race || 'human', hashSeed(def.id || def.name), { ...(def.look || {}) });
  if (def.bulk) look.bulk = def.bulk;
  if (def.scale) look.scale = def.scale;
  const attrs = def.attrs || { str: L, agi: L, end: L, vit: L, wil: L };
  const a = new Actor({
    x, y, name: def.name, title: def.title, look, race: def.race || look.race, faction: def.faction || 'civilian', attrs,
    style: def.style || 'brawler', fruit: def.fruit || null, fruitMastery: def.fruitMastery ?? (def.fruit ? 60 : 0),
    weapon: def.weapon ? { kind: def.weapon, power: def.weaponPower || 1.2, count: STYLES[def.style]?.swords || 1 } : null,
    hakiSkill: def.haki || {}, boss: def.boss, hpMul: (def.hpMul || 1) * (def.boss ? 2.2 : 1), lethal: def.lethal ?? true, poise: def.poise,
    dmgMul: def.dmgMul, defMul: def.defMul,
    ...extra,
  });
  a.npcId = def.id || null;
  a.masteries = { [a.style]: def.mastery ?? Math.min(100, L * 1.5) };
  a.techniques = def.moves || [];
  a.tier = def.tier || Math.max(1, Math.round(L / 12));
  a.named = !!def.named || !!def.boss;
  a.bountyValue = def.bounty;
  a.infamy = def.infamy;
  a.reward = def.reward;
  a.breakthrough = def.breakthrough;
  a.alertLine = def.alert;
  a.defeatLine = def.defeatLine;
  a.talk = def.dialogue ? { def } : null;
  a.def = def;
  if (def.armament) a.armament = true;
  if (def.invulnerable) a.invulnerable = true;
  if (def.recover) a.recoverAfter = def.recover;
  if (def.fixedPower) a.fixedPower = def.fixedPower;
  a.showName = def.showName ?? (!!def.dialogue || !!def.boss || !!def.named);
  a.nameColor = def.boss ? '#ff8a80' : def.dialogue ? '#ffe082' : '#fff';
  const kind = def.ai || (def.hostile ? 'hostile' : def.dialogue ? 'guard' : 'wander');
  a.controller = new AIController({
    kind, home: { x, y }, skill: def.skill ?? (def.boss ? 0.55 : 0.25), moves: def.moves || [], aggroRange: def.aggroRange ?? (def.boss ? 12 : 8),
    ranged: def.ranged, leash: def.leash ?? (def.boss ? 18 : 16), phases: def.phases, barks: def.barks, fleeAt: def.boss || def.named ? 0 : def.fleeAt,
  });
  if (kind === 'guard' || kind === 'idle') { a.stationary = true; a.faceHome = Math.PI / 2; }
  if (def.hostile) a.aggroPlayer = true;
  return a;
}

function hashSeed(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

export function makeEnemy(arch, level, x, y, over = {}) {
  const A = ARCHETYPES[arch] || ARCHETYPES.bandit;
  return makeNPC({
    ...A, level, hostile: true, name: over.name || A.name, look: { ...(A.look || {}), ...(over.look || {}) }, moves: over.moves || A.moves, id: over.id,
    hpMul: (A.hpMul || 1) * (over.hpMul || 1), skill: over.skill ?? A.skill, fleeAt: 0.15, ...over,
  }, x, y);
}

/** Spawner builder: named NPCs + enemy groups for an island. */
export function npcBuilder(ctx) {
  const { island, game, spawner, list, rng } = ctx;
  const c = game.state?.char;
  if (!c) return;
  for (const def of NPC_DEFS.values()) {
    if (def.island !== island.id) continue;
    if (def.when && !def.when(c, game)) continue;
    if (def.boss && c.bosses.includes(def.id) && !def.respawn) continue;
    if (def.once && c.defeated[def.id]) continue;
    if ((c.crew || []).some((m) => m.id === def.id) || c.flags['leftCrew_' + def.id]) continue;
    const pos = placeNPC(game, island, def, rng, spawner);
    if (!pos) continue;
    const a = makeNPC(def, pos.x, pos.y);
    a.game = game;
    game.addActor(a);
    list.push(a);
    if (pos.building) pos.building.npcSpawned = true;
  }
  for (const grp of GROUPS) {
    if (grp.island !== island.id) continue;
    if (grp.when && !grp.when(c, game)) continue;
    if (grp.cleared && c.flags[grp.cleared]) continue;
    const base = grp.spot ? island.spots[grp.spot] : { x: island.x + (grp.dx || 0) * island.def.w / 2, y: island.y + (grp.dy || 0) * island.def.h / 2 };
    if (!base) continue;
    for (const e of grp.enemies) {
      const [arch, lvl, over] = Array.isArray(e) ? e : [e, grp.level || 6, {}];
      const p = spawner.findFree(base.x, base.y, grp.radius || 5, rng);
      if (!p) continue;
      const a = makeEnemy(arch, lvl, p.x, p.y, over || {});
      a.game = game;
      if (grp.leash) a.controller.leash = grp.leash;
      game.addActor(a);
      list.push(a);
    }
  }
}

function placeNPC(game, island, def, rng, spawner) {
  const pl = (typeof def.at === 'function' ? def.at(game.state?.char, game) : def.at) || {};
  if (pl.spot && island.spots[pl.spot]) {
    const s = island.spots[pl.spot];
    const x = s.x + (pl.ox || 0), y = s.y + (pl.oy || 0);
    if (spawner.freeSpot(x, y)) return { x, y };
    return spawner.findFree(x, y, 2.5, rng) || spawner.findFree(s.x, s.y, 3, rng) || s;
  }
  for (const town of island.towns) {
    if (pl.town && town.id !== pl.town) continue;
    if (pl.building) {
      const b = town.buildings.find((x) => x.name === pl.building || x.npc === def.id || x.role === pl.building);
      if (b) return { x: b.door.x + (pl.ox || 0.9), y: b.door.y + 0.9, building: b };
    }
    if (pl.plaza || (!pl.building && !pl.dx)) return spawner.findFree(town.plaza.x + (pl.ox || 1.5), town.plaza.y + 2.5, 3, rng);
  }
  // any building that names this NPC
  for (const town of island.towns) {
    const b = town.buildings.find((x) => x.npc === def.id);
    if (b) return { x: b.door.x + 0.9, y: b.door.y + 0.9, building: b };
  }
  const lm = island.landmarks.find((l) => l.npc === def.id);
  if (lm) return { x: lm.x + 0.6, y: lm.y + 1.2 };
  if (pl.dx !== undefined) return spawner.findFree(island.x + pl.dx * island.def.w / 2, island.y + pl.dy * island.def.h / 2, 5, rng);
  return spawner.findFree(island.x, island.y, 10, rng);
}

// --------------------------------------------------------- interactions
export class Interactions {
  constructor(game) {
    this.game = game;
    game.on('talk', (a) => this.talk(a));
    game.on('enterBuilding', (b) => this.building(b));
    game.on('knockDoor', (b) => this.knock(b));
    game.on('openChest', (o) => this.chest(o));
    game.on('trainDummy', (o) => this.dummy(o));
    game.on('openService', (kind, arg, npc) => this.service(kind, arg, npc));
    game.on('quickHeal', () => this.quickHeal());
    this.objectHandlers = {};
    game.on('useObject', (o) => this.objectHandlers[o.use]?.(o, game));
    // `summon` ability steps: call allies to the fight (they leave when it ends)
    game.summon = (owner, spec) => {
      const n = spec.count || 1;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const p = game.spawner.findFree(owner.x + Math.cos(ang) * 2, owner.y + Math.sin(ang) * 2, 3) || { x: owner.x, y: owner.y + 1 };
        const a = makeEnemy(spec.archetype || 'pirate', spec.level || Math.max(3, Math.round((owner.attrs?.str || 8) * 0.8)), p.x, p.y, { name: spec.name, look: spec.look, moves: spec.moves, hpMul: spec.hpMul });
        a.game = game;
        a.faction = owner.faction;
        a.summonedBy = owner;
        a.summonT = spec.duration || 30;
        a.aggroPlayer = owner.aggroPlayer || owner.faction !== 'player';
        if (owner.isPlayer || owner.faction === 'player') { a.aggroPlayer = false; a.controller = new AIController({ kind: 'follower', skill: 0.3, moves: spec.moves || [] }); }
        else if (owner.controller?.target) { a.controller.target = owner.controller.target; a.controller.state = 'chase'; }
        game.addActor(a);
        game.fx.burst(a.x, a.y - 0.6, 12, { color: spec.color || '#eeeeee', speed: 3, g: 0, life: 0.4, kind: 'smoke', size: 0.3 });
      }
    };
    game.on('tick', (dt) => {
      for (const a of game.actors) {
        if (!a.summonedBy) continue;
        a.summonT -= dt;
        if (a.summonT <= 0 || !a.summonedBy.alive || a.summonedBy.state === 'knocked') { a.alive = false; game.fx.burst(a.x, a.y - 0.6, 8, { color: '#eeeeee', speed: 2, g: 0, life: 0.3, kind: 'smoke' }); }
      }
    });
    this.onObject('lore', (o) => {
      game.dialogue.open(null, { start: 'a', nodes: { a: { speaker: o.name || 'Inscription', text: typeof o.lore === 'function' ? o.lore(game.state.char, game) : o.lore } } });
      if (o.loreEvent) game.emit('questEvent', o.loreEvent, o);
    });
    // quest markers (! / ?) over NPC heads
    let mt = 0;
    game.on('tick', (dt) => {
      if ((mt -= dt) > 0) return;
      mt = 0.5;
      const c = game.state?.char;
      if (!c) return;
      for (const a of game.actors) {
        // duelists and sparring partners get back up after a while
        if (a.recoverAfter && a.state === 'knocked' && a.knockT > a.recoverAfter && a.alive) {
          a.state = 'idle'; a.hp = Math.round(a.d.maxHp * 0.5); a.provoked = false; a.aggroPlayer = !!a.def?.hostile;
          if (a.controller) { a.controller.target = null; a.controller.state = 'return'; }
          game.fx.text(a.x, a.y - 2, a.def?.recoverLine || '...Hah. You win.', '#fff', 0.32);
        }
        const m = a.def?.marker;
        if (!m || !a.alive) continue;
        try { a.questMarker = m(c, game) || null; } catch (e) { a.questMarker = null; }
      }
    });
  }

  onObject(id, fn) { this.objectHandlers[id] = fn; }

  islandOf(x, y) { const w = this.game.world; return w.islandAt(x, y) || w.nearestIsland(x, y, 60); }

  talk(a) {
    const g = this.game;
    const def = a.def;
    if (def && def.dialogue) {
      const tree = typeof def.dialogue === 'string' ? def.dialogue : def.dialogue;
      g.dialogue.open(a, tree);
      g.emit('talked', def.id);
      return;
    }
    if (a.talk?.kind === 'townsfolk') {
      const rng = new RNG(a.talk.seed + g.env.day);
      const isl = this.islandOf(a.x, a.y);
      g.dialogue.open(a, { start: 'a', nodes: { a: { text: rumorFor(g, isl, rng, a) } } });
    }
  }

  building(b) {
    const g = this.game;
    const isl = this.islandOf(b.x, b.y);
    const town = isl?.towns.find((t) => t.id === b.town);
    const npc = b.npc && npcDef(b.npc);
    if (npc && npc.dialogue && !(npc.boss && g.state.char.bosses.includes(npc.id))) {
      // talk to the owner (their dialogue offers the services)
      const live = g.actors.find((x) => x.npcId === npc.id && x.state === 'idle');
      if (live) { g.dialogue.open(live, npc.dialogue); return; }
    }
    this.service(b.role, { building: b, island: isl, town });
  }

  service(kind, arg = {}, npc) {
    const g = this.game;
    let { building, island, town } = arg || {};
    if (!island) island = this.islandOf(g.player.x, g.player.y);
    if (!building) building = { name: npc?.def?.shopName || npc?.name, role: kind, shop: arg?.shop };
    const dock = island?.docks?.[0];
    switch (kind) {
      case 'shop': case 'market': case 'weapons': case 'bank':
        openShop(g, { ...building, shop: arg?.shop || building.shop }, island); break;
      case 'tavern': case 'bar': case 'restaurant': case 'cafe':
        this.tavern(building, island); break;
      case 'inn': openInn(g, building, island, town); break;
      case 'doctor': openDoctor(g, building, island, arg?.doc || (npc?.def?.doctor ? { ...npc.def.doctor, id: npc.def.id, name: npc.name } : null)); break;
      case 'shipwright': openShipyard(g, { ...building, adam: arg?.adam || npc?.def?.adam, coating: arg?.coating }, island, dock); break;
      case 'dojo': case 'trainer': openTrainer(g, arg?.trainer || npc?.def?.trainer || building.trainer || 'dojo_generic', npc?.name); break;
      case 'marine_base': g.emit('marineOffice', building, island); break;
      case 'bounty': g.emit('bountyBoard', building, island); break;
      case 'library': this.library(building, island); break;
      case 'palace': case 'hall': case 'church': case 'house': default:
        g.dialogue.open(null, { start: 'a', nodes: { a: { speaker: building.name || 'Door', text: flavorFor(building) } } });
    }
  }

  tavern(building, island) {
    const g = this.game;
    const rng = new RNG(Math.floor(g.time) + (building.id || 0));
    g.dialogue.open(null, {
      start: 'a',
      nodes: {
        a: {
          speaker: building.name || 'Tavern', text: 'The tavern is loud with sailors\' songs. The barkeep polishes a mug. "What\'ll it be?"',
          choices: [
            { text: 'Buy food and drink', do: (c) => { c.open('shop', { building: { ...building, role: 'tavern' }, island }); } },
            { text: 'Buy a round and listen for rumours (฿100)', do: (c) => (c.pay(100) ? 'r' : 'a') },
            { text: 'Leave', end: true },
          ],
        },
        r: { speaker: 'Sailor at the bar', text: () => rumorFor(g, island, rng, null, true), next: 'a' },
      },
    });
  }

  library(building, island) {
    const g = this.game;
    const c = g.state.char;
    const key = 'read_' + (building.id || building.name);
    const first = !c.flags[key];
    g.dialogue.open(null, { start: 'a', nodes: { a: { speaker: building.name || 'Library', text: () => {
      if (first) { c.flags[key] = true; g.progression.raiseAttr('wil', 1); }
      return (first ? '(+1 Willpower) ' : '') + rumorFor(g, island, new RNG(building.id || 1), null, true, 'lore');
    } } } });
  }

  knock(b) {
    const g = this.game;
    const rng = new RNG((b.id || 1) * 13 + g.env.day);
    const lines = ['"Who\'s there? ...Go away, we don\'t want trouble."', '"Nobody home!" (someone is clearly home)', '"If you\'re a pirate, keep walking!"', '"Oh, a traveller? Here, take this for the road." You receive a rice ball.', '"Shh! The baby is sleeping."', '"Are you the new postman? No? Then shoo."'];
    const line = rng.pick(lines);
    if (line.includes('rice ball') && !g.state.char.flags['door_' + b.id]) { g.state.char.flags['door_' + b.id] = true; addItem(g, 'rice_ball', 1, { silent: true }); }
    g.dialogue.open(null, { start: 'a', nodes: { a: { speaker: 'Behind the door', text: line } } });
  }

  chest(o) {
    const g = this.game, c = g.state.char;
    const key = 'chest_' + (o.key || `${Math.round(o.x)}_${Math.round(o.y)}`);
    if (c.world.chests[key]) { o.opened = true; return; }
    c.world.chests[key] = true;
    o.opened = true;
    const rng = new RNG(key + c.runSeed);
    const luck = c.traits.includes('lucky') ? 1.5 : 1;
    const tier = o.tier || 1;
    const berries = Math.round(rng.range(300, 1200) * tier * luck);
    earn(g, berries, 'treasure');
    if (o.item) addItem(g, o.item, 1);
    else if (rng.chance(0.35 * luck)) addItem(g, rng.pick(tier > 2 ? ['jewels', 'gold_coins', 'golden_statue', 'rumble_ball'] : ['gold_coins', 'meat', 'bandage', 'jewels']), 1);
    g.fx.burst(o.x, o.y - 0.5, 20, { color: ['#ffd54f', '#fff59d'], speed: 4, vz: 4, g: 8, life: 0.8, kind: 'star' });
    g.audio?.sfx('treasure');
    persist(g);
  }

  dummy(o) {
    const g = this.game, c = g.state.char, p = g.player;
    if (c.flags.dummyDay === g.env.day) { g.log('Your arms are too tired for more practice today.', '#b0bec5'); return; }
    c.flags.dummyDay = g.env.day;
    const m = c.masteries[p.style] || 0;
    g.env.clock += 1;
    if (m < 10) { g.progression.addStyleMastery(p.style, 2); g.log('You practise your forms on the dummy for an hour. (Dummies only teach the very basics — mastery up to 10.)', '#90caf9'); }
    else g.log('The dummy has nothing left to teach you. Find a real opponent — or a master.', '#b0bec5');
  }

  quickHeal() {
    const g = this.game, c = g.state.char;
    const foods = ['meat', 'fish_stew', 'rice_ball', 'tangerine', 'sea_king_steak', 'baratie_course', 'bandage'];
    const id = foods.find((f) => c.inventory.some((i) => i.id === f));
    if (!id) { g.log('You have nothing to eat!', '#ff8a80'); return; }
    useItem(g, id);
  }
}

function flavorFor(b) {
  switch (b.role) {
    case 'palace': return 'Guards cross their spears in front of the gate. "The palace is closed to commoners."';
    case 'hall': return 'The great doors are shut tight.';
    case 'church': return 'Candles flicker inside. A priest nods at you silently.';
    case 'bank': return 'A clerk counts berries behind iron bars.';
    default: return 'The door is locked.';
  }
}

export { ITEMS, FRUITS };
