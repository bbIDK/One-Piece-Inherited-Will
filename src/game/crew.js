// Crew: companions recruited from the world. A recruitable NPC carries
// `recruit: { role, fighter?, cost?, requires?(char, game), pitch?, accept? }`
// on its definition; the "Join my crew" choice is added to its dialogue
// automatically. Roles give passive bonuses; fighters follow you on land.
import { npcDef, makeNPC } from './npcs.js';
import { AIController } from './ai.js';
import { pay } from './inventory.js';
import { persist } from './lineage.js';
import { formatBerries } from '../core/math.js';
export const CREW_ROLES = {
  fighter: { name: 'Combatant', icon: '⚔', desc: 'Fights beside you on land.' },
  swordsman: { name: 'Swordsman', icon: '🗡', desc: 'Fights beside you on land with a blade.' },
  navigator: { name: 'Navigator', icon: '🧭', desc: 'Log Pose sets twice as fast, storms are announced early, +10% sailing speed.' },
  cook: { name: 'Cook', icon: '🍳', desc: 'Food heals 50% more; stamina regenerates at sea.' },
  doctor: { name: 'Doctor', icon: '🩺', desc: 'Patches you up after every battle (heals 30% when combat ends).' },
  shipwright: { name: 'Shipwright', icon: '🔨', desc: 'Repairs your ship slowly while sailing.' },
  sniper: { name: 'Sniper', icon: '🎯', desc: 'Cannons deal 30% more damage.' },
  musician: { name: 'Musician', icon: '🎻', desc: 'Stamina regenerates 25% faster.' },
  archaeologist: { name: 'Archaeologist', icon: '📜', desc: 'Can read Poneglyphs.' },
  helmsman: { name: 'Helmsman', icon: '⎈', desc: 'Your ship turns 25% faster.' },
};


const MAX_FOLLOWERS = 2;

/** Passive modifiers from the crew roster (read by ships, food, log pose…). */
function computeMods(members) {
  const has = (r) => members.some((m) => m.role === r);
  return {
    speedMul: has('navigator') ? 1.1 : 1,
    logMul: has('navigator') ? 2 : 1,
    foodMul: has('cook') ? 1.5 : 1,
    seaStamina: has('cook'),
    doctor: has('doctor'),
    repair: has('shipwright') ? 0.6 : 0,
    cannonMul: has('sniper') ? 1.3 : 1,
    staminaMul: has('musician') ? 1.25 : 1,
    poneglyphs: has('archaeologist'),
    turnMul: has('helmsman') ? 1.25 : 1,
  };
}

export class Crew {
  constructor(game) {
    this.game = game;
    game.crew = this;
    game.crewMods = computeMods([]);
    this.followers = new Map(); // member id → actor
    this.t = 0;
    this.wasFighting = false;
    game.on('characterStart', () => { this.followers.clear(); this.refresh(); });
    game.on('tick', (dt) => this.tick(dt));
    game.on('enterZone', () => this.followers.clear());
    game.on('leaveZone', () => this.followers.clear());
    game.on('bossDefeated', () => {
      for (const m of this.members()) m.level = Math.min((m.baseLevel || m.level) + 40, (m.level || 5) + 1.5);
    });
  }

  get char() { return this.game.state?.char; }
  members() { return this.char?.crew || []; }
  has(id) { return this.members().some((m) => m.id === id); }
  count() { return this.members().length; }
  hasRole(role) { return this.members().some((m) => m.role === role); }
  refresh() { this.game.crewMods = computeMods(this.members()); }

  canRecruit(def) {
    const c = this.char;
    if (!c || !def.recruit || this.has(def.id)) return false;
    if (def.boss && !c.bosses.includes(def.id) && def.recruit.afterDefeat) return false;
    try { if (def.recruit.requires && !def.recruit.requires(c, this.game)) return false; } catch { return false; }
    return true;
  }

  /** Add the "Join my crew" choice to an NPC's dialogue tree. */
  decorate(tree, npc) {
    const def = npc?.def;
    if (!def?.recruit || !tree?.nodes) return tree;
    const startId = tree.start || 'start';
    const start = tree.nodes[startId];
    if (!start) return tree;
    const r = def.recruit;
    const role = CREW_ROLES[r.role] || CREW_ROLES.fighter;
    const cost = r.cost || 0;
    const nodes = { ...tree.nodes };
    const choice = {
      text: `${role.icon} "Join my crew!"${cost ? ` (${formatBerries(cost)})` : ''}`,
      if: () => this.canRecruit(def),
      next: '__recruit',
    };
    nodes[startId] = { ...start, choices: [choice, ...(start.choices || [])] };
    if (!start.choices || !start.choices.length) nodes[startId].choices.push({ text: 'Goodbye.', end: true });
    nodes.__recruit = {
      text: r.pitch || `"You want me as your ${role.name.toLowerCase()}? ...Alright. I'm in!"`,
      choices: [
        { text: `Welcome aboard! (${role.name}: ${role.desc})`, do: () => { if (cost && !pay(this.game, cost)) { this.game.log('Not enough berries.', '#ff8a80'); return; } this.recruit(def, npc); }, end: true },
        { text: 'On second thought...', end: true },
      ],
    };
    return { ...tree, nodes };
  }

  recruit(def, actor) {
    const c = this.char, g = this.game;
    if (!c || this.has(def.id)) return;
    const m = {
      id: def.id, name: def.name, title: def.title, role: def.recruit.role, fighter: def.recruit.fighter ?? (def.recruit.role === 'fighter' || def.recruit.role === 'swordsman'),
      level: def.level ?? 6, baseLevel: def.level ?? 6, joined: g.env.day, follow: true,
    };
    const fighters = this.members().filter((x) => x.fighter && x.follow).length;
    if (m.fighter && fighters >= MAX_FOLLOWERS) m.follow = false;
    c.crew.push(m);
    this.refresh();
    const role = CREW_ROLES[m.role];
    g.ui.toast('NEW NAKAMA!', `${m.name} joins your crew as ${role?.name || m.role}.`, '#ffd54f');
    g.log(`${m.name} joined the crew. ${role?.desc || ''} (Crew: U)`, '#ffe082');
    g.audio?.sfx('breakthrough');
    // the NPC on the island becomes your companion
    if (actor && actor.alive) {
      if (m.fighter && m.follow) this.adopt(actor, m);
      else { actor.alive = false; g.fx.burst(actor.x, actor.y - 0.6, 10, { color: ['#ffe082'], speed: 3, g: 0, life: 0.4, kind: 'star' }); }
    }
    g.emit('crewJoined', def.id);
    persist(g);
  }

  dismiss(id) {
    const c = this.char;
    const i = c.crew.findIndex((m) => m.id === id);
    if (i < 0) return;
    const [m] = c.crew.splice(i, 1);
    const a = this.followers.get(id);
    if (a) a.alive = false;
    this.followers.delete(id);
    c.flags['leftCrew_' + id] = true;
    this.refresh();
    this.game.log(`${m.name} leaves the crew. "Take care of yourself, captain."`, '#b0bec5');
    persist(this.game);
  }

  setFollow(id, on) {
    const m = this.members().find((x) => x.id === id);
    if (!m) return false;
    if (on && this.members().filter((x) => x.fighter && x.follow && x !== m).length >= MAX_FOLLOWERS) return false;
    m.follow = !!on;
    if (!on) { const a = this.followers.get(id); if (a) a.alive = false; this.followers.delete(id); }
    return true;
  }

  adopt(a, m) {
    const g = this.game;
    a.faction = 'player';
    a.crewId = m.id;
    a.persistent = true;
    a.aggroPlayer = false;
    a.provoked = false;
    a.boss = false;
    a.talk = a.def?.dialogue ? { def: a.def } : null;
    a.nameColor = '#ffe082';
    a.showName = true;
    a.controller = new AIController({ kind: 'follower', skill: 0.45, moves: a.def?.moves || [], ranged: a.def?.ranged });
    a.stationary = false;
    // drop it from the island population so leaving the island keeps it
    for (const list of g.spawner.populated.values()) { const k = list.indexOf(a); if (k >= 0) list.splice(k, 1); }
    this.followers.set(m.id, a);
  }

  spawnFollower(m) {
    const g = this.game, p = g.player;
    const def = npcDef(m.id);
    if (!def) return null;
    const a = makeNPC({ ...def, hostile: false, boss: false, level: Math.round(m.level || def.level || 6), when: undefined }, p.x - 1, p.y + 0.8);
    a.game = g;
    g.addActor(a);
    this.adopt(a, m);
    return a;
  }

  tick(dt) {
    const g = this.game, p = g.player, c = this.char;
    if (!c || !p) return;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.5;
      // keep the land party in sync
      for (const m of this.members()) {
        if (!m.fighter || !m.follow) continue;
        let a = this.followers.get(m.id);
        if (a && !a.alive) { this.followers.delete(m.id); a = null; }
        if (!a && p.mode === 'foot' && p.state === 'idle') a = this.spawnFollower(m);
        if (a && a.state === 'knocked' && !p.inCombat) {
          a.state = 'idle'; a.hp = Math.round(a.d.maxHp * 0.3);
          g.fx.text(a.x, a.y - 2, 'Still standing!', '#ffe082', 0.35);
        }
      }
    }
    const mods = g.crewMods;
    // doctor patches everyone up when a fight ends
    const fighting = !!p.inCombat;
    if (this.wasFighting && !fighting && mods.doctor && p.state === 'idle' && p.hp < p.d.maxHp) {
      const heal = Math.round(p.d.maxHp * 0.3);
      p.hp = Math.min(p.d.maxHp, p.hp + heal);
      g.fx.text(p.x, p.y - 1.6, `+${heal}`, '#69f0ae', 0.45);
      const doc = this.members().find((m) => m.role === 'doctor');
      g.log(`${doc?.name || 'Your doctor'} patches you up.`, '#a5d6a7');
    }
    this.wasFighting = fighting;
    // at sea: shipwright repairs, cook keeps everyone fed
    if (p.mode === 'sail' && p.ship && !p.ship.sunk) {
      if (mods.repair && p.ship.hull < p.ship.maxHull) p.ship.hull = Math.min(p.ship.maxHull, p.ship.hull + mods.repair * dt);
      if (mods.seaStamina) p.stamina = Math.min(p.d.maxStamina, p.stamina + 4 * dt);
    }
  }
}
