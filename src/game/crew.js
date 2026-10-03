// Crew: companions recruited from the world. A recruitable NPC carries
// `recruit: { role, fighter?, cost?, requires?(char, game), pitch?, intro?,
// again?, declined?, aboard? }` on its definition. Once they'd sail with you
// (`requires`), they make you an offer: a ! over their head, and the offer
// leads their conversation — yes or no, your call. Turned down, they stay
// where they are and can be asked again whenever you like (the "Join my
// crew!" choice in their conversation). Who you are changes the words: a
// pirate's nakama, a Marine's subordinate, a bounty hunter's partner, a free
// sailor's shipmate. Roles give passive bonuses; fighters follow you on land
// (two at most); everyone else stays with the ship, at their station on her
// deck while you're aboard.
//   pitch, intro, again, declined: a line, or one per road { pirate, marine,
//     hunter, free } (free: anyone else), or fn(char, game, road)
//   aboard: [lines] what they say on deck now and then (else their role's)
import { npcDef, makeNPC } from './npcs.js';
import { AIController } from './ai.js';
import { pay } from './inventory.js';
import { persist } from './lineage.js';
import { placeOnDeck, crewStation } from './decks.js';
import { formatBerries } from '../core/math.js';
export const CREW_ROLES = {
  fighter: { name: 'Combatant', icon: 'skills', desc: 'Fights beside you on land.' },
  swordsman: { name: 'Swordsman', icon: 'sword', desc: 'Fights beside you on land with a blade.' },
  navigator: { name: 'Navigator', icon: 'log_pose', desc: 'Log Pose sets twice as fast, storms are announced early, +10% sailing speed.' },
  cook: { name: 'Cook', icon: 'food', desc: 'Food heals 50% more; hot meals at sea heal you while you sail.' },
  doctor: { name: 'Doctor', icon: 'doctor', desc: 'Patches you up after every battle (heals 30% when combat ends).' },
  shipwright: { name: 'Shipwright', icon: 'shipwright', desc: 'Repairs your ship slowly while sailing.' },
  sniper: { name: 'Sniper', icon: 'gun', desc: 'Cannons deal 30% more damage.' },
  musician: { name: 'Musician', icon: 'bar', desc: 'Lifts your spirits: techniques come back 10% sooner.' },
  archaeologist: { name: 'Archaeologist', icon: 'library', desc: 'Can read Poneglyphs.' },
  helmsman: { name: 'Helmsman', icon: 'ship', desc: 'Your ship turns 25% faster.' },
};


const MAX_FOLLOWERS = 2;
// (the stations on deck after the ones the fighters take while you steer: see decks.js crewStation)
const HAND_STATION0 = MAX_FOLLOWERS;

/**
 * Who you are to someone who'd sail with you: a pirate (a flag, or the
 * pirate's road), a Marine (the Navy's cap, or its road), a bounty hunter —
 * or 'free': a sailor with a ship and no road.
 */
export function roadOf(c) {
  if (!c) return 'free';
  if (c.faction === 'marine') return 'marine';
  if (c.crewName || c.faction === 'pirate') return 'pirate';
  const path = c.main?.path || c.mainShelf?.main?.path;
  if (path === 'pirate' || path === 'marine' || path === 'hunter') return path;
  if (c.flags?.bountyHunter) return 'hunter';
  return 'free';
}
// the words that go with it
const WORDS = {
  pirate: { ask: '"Join my crew!"', yes: 'Welcome aboard, nakama!', joined: 'NEW NAKAMA!', group: 'crew', list: 'Nakama' },
  marine: { ask: '"Serve under my command!"', yes: 'Welcome aboard. You serve under me now.', joined: 'A NEW SUBORDINATE!', group: 'command', list: 'Under your command' },
  hunter: { ask: '"Partner up with me!"', yes: 'Partners, then. Welcome aboard!', joined: 'A NEW PARTNER!', group: 'partnership', list: 'Partners' },
  free: { ask: '"Sail with me!"', yes: 'Welcome aboard!', joined: 'A NEW SHIPMATE!', group: 'crew', list: 'Shipmates' },
};
export const crewWords = (c) => WORDS[roadOf(c)];

/** One of a recruit's lines: a line, one per road ({ pirate, marine, hunter, free }), or fn(char, game, road). */
function lineOf(v, c, g) {
  const road = roadOf(c);
  if (typeof v === 'function') return v(c, g, road);
  if (v && typeof v === 'object') return v[road] ?? v.free ?? v.pirate ?? null;
  return v ?? null;
}

// what a crewmate on deck has to say, by their role (when they've no lines of their own)
const ABOARD = {
  fighter: ['"Quiet seas. I don\'t trust them."', '"Wake me if anything wants a fight."'],
  swordsman: ['"I keep my blade oiled. The sea gets into everything."', '"Anything on the horizon? No? Pity."'],
  navigator: ['"Wind\'s holding. Keep her on this heading, captain."', '"There\'s weather to the west — a day off, maybe two."', '"The needle doesn\'t lie. People do. The needle doesn\'t."'],
  cook: ['"Dinner\'s on, whether you\'re hungry or not."', '"Nobody on this ship goes hungry. Not while I\'m aboard."'],
  doctor: ['"Hold still when you get hurt. It makes my job easier."', '"Eat something green once in a while. Doctor\'s orders."'],
  shipwright: ['"She creaks a bit at the stern. Nothing I can\'t fix."', '"Treat her well and she\'ll carry you anywhere."'],
  sniper: ['"I can see a gull on that mast from here. Just saying."', '"Powder\'s dry. Shot\'s stacked. Ready when you are."'],
  musician: ['(A few bars of something cheerful drift across the deck.)', '"A ship without a song is just wood on water."'],
  archaeologist: ['"Every island has a history. Most of it is buried."', '"Read anything good lately? I have."'],
  helmsman: ['"She answers the wheel like a dream, captain."', '"Give me a current and I\'ll ride it."'],
};

/** Passive modifiers from the crew roster (read by ships, food, log pose…). */
function computeMods(members) {
  const has = (r) => members.some((m) => m.role === r);
  return {
    speedMul: has('navigator') ? 1.1 : 1,
    logMul: has('navigator') ? 2 : 1,
    foodMul: has('cook') ? 1.5 : 1,
    seaMeals: has('cook'),
    doctor: has('doctor'),
    repair: has('shipwright') ? 0.6 : 0,
    cannonMul: has('sniper') ? 1.3 : 1,
    cdMul: has('musician') ? 0.9 : 1,
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
    this.hands = new Map(); // member id → actor: the crew who stay with the ship, at their stations aboard her
    this.t = 0;
    this.chatT = 20;
    this.wasFighting = false;
    game.on('characterStart', () => { this.followers.clear(); this.dropHands(); this.refresh(); });
    game.on('tick', (dt) => this.tick(dt));
    game.on('enterZone', () => { this.followers.clear(); this.dropHands(); });
    game.on('leaveZone', () => { this.followers.clear(); this.dropHands(); });
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

  // ------------------------------------------------ offers
  /** Has someone's offer been answered — yes or no — or are they aboard already, or gone for good? */
  answered(id) {
    const c = this.char;
    return !!c?.crewOffers?.[id] || this.has(id) || !!c?.flags?.['leftCrew_' + id];
  }
  /** Someone who'd sail with you now, and hasn't asked yet: they make you an offer. */
  offerPending(def) { return !!def?.recruit && this.canRecruit(def) && !this.answered(def.id); }
  /** The ! over someone with an offer to make (npcs.js asks, after the main story's own marks). */
  marker(a) { return a?.def?.recruit && !a.crewId && this.offerPending(a.def) ? '!' : null; }

  /** Yes or no to someone who'd sail with you. Yes takes them aboard (and their fee, if they ask one); no leaves them where they are, to be asked again some day. */
  answer(def, yes, actor) {
    const c = this.char, g = this.game;
    if (!c || !def?.recruit) return false;
    c.crewOffers = c.crewOffers || {};
    if (yes) {
      const cost = def.recruit.cost || 0;
      if (cost && !pay(g, cost)) { g.log('Not enough berries.', '#ff8a80'); return false; }
      c.crewOffers[def.id] = { said: 'yes', day: g.env.day };
      this.recruit(def, actor);
    } else {
      c.crewOffers[def.id] = { said: 'no', day: g.env.day };
      g.log(`${def.name} stays behind. (Changed your mind? Talk to them again — the offer's still open.)`, '#b0bec5');
      persist(g);
    }
    g.emit('crewOffer', def.id, !!yes);
    return true;
  }

  /**
   * A recruit's conversation: with an offer to make, it leads (their pitch,
   * then yes, no — or something else first); otherwise "Join my crew!" (in
   * the words that suit who you are) asks them yourself, once they'd come.
   */
  decorate(tree, npc) {
    const def = npc?.def;
    if (!def?.recruit || !tree?.nodes || npc.crewId) return tree;
    const startId = tree.start || 'start';
    const start = tree.nodes[startId];
    if (!start) return tree;
    const r = def.recruit, g = this.game, c = this.char;
    const role = CREW_ROLES[r.role] || CREW_ROLES.fighter;
    const W = crewWords(c);
    const cost = r.cost || 0;
    const nodes = { ...tree.nodes };
    const pending = this.offerPending(def);
    const turnedDown = c?.crewOffers?.[def.id]?.said === 'no';
    const pitch = () => {
      if (turnedDown) return lineOf(r.again, c, g) || '"You\'re asking me now? ...Ha. I hoped you might. I\'m in — if you\'ll have me."';
      return lineOf(r.pitch, c, g) || `"You want me aboard as your ${role.name.toLowerCase()}? ...Alright. I'm in!"`;
    };
    nodes.__recruit = {
      text: pitch,
      choices: [
        { text: `${W.yes} (${role.name}: ${role.desc})${cost ? ` — ${formatBerries(cost)}` : ''}`, do: () => { this.answer(def, true, npc); }, end: true },
        { text: 'Tell me about yourself first.', if: () => !!r.intro, next: '__intro' },
        { text: 'Not this time.', do: () => { this.answer(def, false, npc); }, next: '__no' },
        { text: 'About something else...', if: () => pending, next: startId },
      ],
    };
    nodes.__intro = { text: () => lineOf(r.intro, c, g) || '', next: '__recruit' };
    nodes.__no = {
      text: () => lineOf(r.declined, c, g) || '"Suit yourself. I\'ll be around — if you change your mind, you know where to find me."',
      choices: [{ text: 'About something else...', next: startId }, { text: 'Goodbye.', end: true }],
    };
    if (pending) return { ...tree, nodes, start: '__recruit' };
    // (asking them yourself, once they'd come — again, after a no)
    const choice = { text: `${W.ask}${cost ? ` (${formatBerries(cost)})` : ''}`, if: () => this.canRecruit(def), next: '__recruit' };
    nodes[startId] = { ...start, choices: [choice, ...(start.choices || [])] };
    if (!start.choices || !start.choices.length) nodes[startId].choices.push({ text: 'Goodbye.', end: true });
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
    c.crewOffers = c.crewOffers || {};
    if (!c.crewOffers[def.id]) c.crewOffers[def.id] = { said: 'yes', day: g.env.day };
    this.refresh();
    const role = CREW_ROLES[m.role];
    const W = crewWords(c);
    g.ui.toast(W.joined, `${m.name} joins your ${W.group} as ${role?.name || m.role}.`, '#ffd54f');
    g.log(`${m.name} sails with you now. ${role?.desc || ''} ${m.fighter && m.follow ? 'They\'ll follow you ashore.' : 'They\'ll keep to the ship.'} (Crew: U)`, '#ffe082');
    g.audio?.sfx('breakthrough');
    // the NPC on the island becomes your companion (or goes down to the ship)
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
    this.dropHand(id);
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
    else this.dropHand(id);
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
    a.controller = new AIController({ kind: 'follower', skill: 0.45, moves: a.def?.moves || [], ranged: a.def?.ranged, barks: a.def?.barks });
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

  // ------------------------------------------------ hands aboard
  /** Your ship, if you're aboard her or close by her (one with a deck to stand on), in this world. */
  homeShip() {
    const g = this.game, p = g.player, c = this.char;
    if (!p || !c) return null;
    const mine = (s) => s && !s.sunk && s.alive !== false && s.owner === 'player' && s.def?.big && !s.traffic && !s.diving;
    if (mine(p.ship) && (p.mode === 'sail' || p.onShip)) return p.ship;
    if (mine(p.deck?.ship)) return p.deck.ship;
    const s = g.ships.find((x) => x.uid === c.activeShip) || null;
    return mine(s) && g.world.distance(p.x, p.y, s.x, s.y) < 45 ? s : null;
  }

  /** Someone who stays with the ship, at their station on her deck. */
  spawnHand(m, ship, k) {
    const g = this.game;
    const def = npcDef(m.id);
    if (!def) return null;
    const lines = def.recruit?.aboard || ABOARD[m.role] || ABOARD.fighter;
    const role = CREW_ROLES[m.role] || CREW_ROLES.fighter;
    // (a shipboard word, not their island's talk: they're aboard now)
    const talk = (ctx) => ({ start: 'a', nodes: { a: { text: () => lineOf(lines[Math.floor(Math.random() * lines.length)], ctx.char, g), choices: [{ text: 'Carry on.', end: true }] } } });
    const a = makeNPC({ ...def, id: def.id, hostile: false, boss: false, ai: 'idle', when: undefined, marker: undefined, recruit: undefined, dialogue: talk, title: `${role.name}${def.title ? ' · ' + def.title : ''}`, level: Math.round(m.level || def.level || 6) }, ship.x, ship.y);
    a.game = g;
    a.npcId = null; // (no quest goes by them while they're aboard)
    a.crewId = m.id;
    a.handOf = ship;
    a.faction = 'player';
    a.invulnerable = true;
    a.stationary = true;
    a.persistent = true;
    a.showName = true;
    a.nameColor = '#ffe082';
    if (a.controller) a.controller.home = null;
    g.addActor(a);
    const st = crewStation(ship, HAND_STATION0 + k);
    placeOnDeck(g, a, ship, st.t, st.v);
    a.facing = ship.heading + (k % 2 ? 1.2 : -1.2);
    return a;
  }

  dropHand(id) {
    const a = this.hands.get(id);
    if (a) { a.alive = false; a.deck?.ship?.aboard?.delete(a); }
    this.hands.delete(id);
  }
  dropHands() { for (const id of [...this.hands.keys()]) this.dropHand(id); }

  /** Keep the crew who stay with the ship at their stations aboard her (and nobody who's gone). */
  updateHands() {
    const ship = this.homeShip();
    const stay = ship ? this.members().filter((m) => !(m.fighter && m.follow)) : [];
    const want = new Set(stay.map((m) => m.id));
    for (const [id, a] of this.hands) if (!want.has(id) || !a.alive || a.handOf !== ship || a.deck?.ship !== ship) this.dropHand(id);
    stay.forEach((m, k) => { if (!this.hands.has(m.id)) { const a = this.spawnHand(m, ship, k); if (a) this.hands.set(m.id, a); } });
  }

  /** Now and then, a crewmate on deck near you has a word to say. */
  chatter(dt) {
    const g = this.game, p = g.player;
    if ((this.chatT -= dt) > 0 || !p || p.inCombat || !this.hands.size) return;
    this.chatT = 28 + Math.random() * 25;
    const near = [...this.hands.values()].filter((a) => a.alive && g.world.distance(a.x, a.y, p.x, p.y) < 9);
    if (!near.length) return;
    const a = near[Math.floor(Math.random() * near.length)];
    const m = this.members().find((x) => x.id === a.crewId);
    const def = npcDef(a.crewId);
    const lines = def?.recruit?.aboard || ABOARD[m?.role] || ABOARD.fighter;
    const line = lineOf(lines[Math.floor(Math.random() * lines.length)], this.char, g);
    if (line) g.fx.text(a.x, a.y - 2.2, line.replace(/^"|"$/g, ''), '#ffe082', 0.3, { life: 3.2 });
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
      // and the rest of the crew at their stations aboard
      this.updateHands();
    }
    this.chatter(dt);
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
      if (mods.seaMeals && !p.inCombat && p.hp < p.d.maxHp) p.hp = Math.min(p.d.maxHp, p.hp + p.d.maxHp * 0.01 * dt);
    }
  }
}
