// A voyage with friends. One game hosts: its world is the shared one — its
// clock, its day and its weather — and the others join it with the host's
// room code, each with their own character from their own save. Everyone's
// game simulates its own world (the islands are the same everywhere: they're
// generated from the same seed) and sends the others where its player is and
// what they're doing; the others are drawn as they come in (remote.js).
//
// game.net is the voyage while there is one (null otherwise: singleplayer
// never opens a connection, and nothing here runs).
import { openTransport, netKind } from './transport.js';
import { PROTO, SEND_HZ, IDLE_MS, MAX_PLAYERS, NAME_MAX, CHAT_MAX, BIT, readHello, readEnv, readLook, readShip, readState, readSay, stateChanged, worldSig, cleanText, r2, r3 } from './protocol.js';
import { Remote, MATE_COLOR } from './remote.js';
import { deckLift } from '../world/hull.js';
import { angleDiff } from '../core/math.js';

// how long to look for the host before giving up (the relays can take a while to put two games in touch)
const SEARCH_MS = { local: 4000, trystero: 30000 };
const RELAY_MS = 15000; // no relay reachable after this long: say so
const LOOK_MS = 250; // how often your look is checked for changes
const ENV_MS = 2000; // the host's clock and weather, this often (and whenever the weather turns)
const PROFILE_KEY = 'op-inherited-will:profile';
// buffs that change how you're drawn without a look of their own (see render/combatfx.js actorVisuals)
const VIS_BUFFS = new Set(['diable', 'gear4', 'gear5']);

/** What went wrong, for the screens: [title, text] ({code}, {host} and {detail} filled in). */
export const ERRORS = {
  notfound: ['No voyage with that code', 'Nobody is hosting {code} just now. Check the code, and that your friend\'s game is open and hosting it.'],
  version: ['A different version of the game', 'The host\'s game isn\'t the same version as yours. Both of you reload the page (Ctrl+F5 or Cmd+Shift+R) to get the latest, then try again.'],
  world: ['A different version of the game', 'The host\'s world isn\'t laid out like yours (one of you has an older version). Both of you reload the page (Ctrl+F5 or Cmd+Shift+R), then try again.'],
  full: ['The voyage is full', `${MAX_PLAYERS} players are aboard already.`],
  taken: ['That code is already in use', 'Another game is hosting with this code — is this lineage open in another tab? Close it there, or host with a new code.'],
  relays: ['Can\'t reach the meeting place', 'Players find each other through public relays on the internet, and none of them answered. Check your connection (some firewalls and VPNs block them), then try again.'],
  hostLeft: ['The host has left', 'The voyage is over: {host} has left it. You sail on alone, in your own world; nothing of yours is lost.'],
  transport: ['Multiplayer couldn\'t start', '{detail}'],
};
export function errorText(err, ctx = {}) {
  const [title, text] = ERRORS[err?.code] || ERRORS.transport;
  const fill = (s) => s.replace('{code}', ctx.code || '').replace('{host}', ctx.host || 'the host').replace('{detail}', err?.detail || 'Something went wrong.');
  return { title: fill(title), text: fill(text) };
}

/** This browser's own mark, the same in all its tabs (two tabs share one browser's saves: see busySlots). */
export function browserProfile() {
  try {
    let p = localStorage.getItem(PROFILE_KEY);
    if (!p) { p = Math.random().toString(36).slice(2, 12); localStorage.setItem(PROFILE_KEY, p); }
    return p;
  } catch { return ''; }
}

export class Voyage {
  /**
   * role: 'host' or 'guest'; code: the room code; slot: the lineage played;
   * name: who you are, before you're in the world; kind: the transport;
   * searchMs: how long a guest looks for the host before giving up.
   */
  constructor(game, { role, code, slot = 0, name = '', kind = netKind(), searchMs = SEARCH_MS[kind] }) {
    Object.assign(this, { game, role, code, slot, kind, searchMs });
    this.status = 'connecting'; // → 'open' (hosting) or 'searching' → 'joined' (a guest); 'failed', 'closed'
    this.error = null;
    this.remotes = new Map(); // peer id → Remote
    this.hostId = null;
    this.hostName = '';
    this.name = name;
    this.since = Date.now();
    this.prof = browserProfile();
    this.sig = worldSig(game.surface || game.world);
    this.avatars = []; // the others drawn this frame (render3d/index.js), and their ships
    this.ships = [];
    this.hooks = {};
    this.helloSent = new Set();
    this.seq = 0; this.lastSent = null; this.lastSendT = -1e9;
    this.lookKey = ''; this.lookT = -1e9; this.shipKey = '';
    this.actN = 0; this.actRef = null; this.dodgeN = 0; this.dashRef = null;
    this.envT = -1e9; this.envKey = ''; this.hostEnv = null;
    this.relays = null;
  }

  on(ev, fn) { (this.hooks[ev] ||= []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const l = this.hooks[ev]; if (l) this.hooks[ev] = l.filter((f) => f !== fn); }
  emit(ev, ...args) {
    for (const fn of (this.hooks[ev] || []).slice()) {
      try { fn(...args); } catch (e) { console.warn('voyage listener failed', e); }
    }
  }

  /** Under way: hosting with the room open, or a guest the host has welcomed. */
  get open() { return this.status === 'open' || this.status === 'joined'; }
  get over() { return this.status === 'failed' || this.status === 'closed'; }
  get inWorld() { return !!this.game.player && !!this.game.state?.char; }
  myName() { return this.game.state?.char?.name || this.name || (this.role === 'host' ? 'The host' : 'A sailor'); }
  /** Everyone aboard, you first: { id, name, host, you, play, remote }. */
  crew() {
    const out = [{ id: this.selfId || 'me', name: this.myName(), host: this.role === 'host', you: true, play: this.inWorld }];
    for (const r of this.remotes.values()) out.push({ id: r.id, name: r.label, host: r.role === 'host', you: false, play: r.play, remote: r });
    return out;
  }
  /** Lineage slots someone else is playing in this same browser (two tabs: they'd share the save). */
  busySlots() {
    const out = new Set();
    for (const r of this.remotes.values()) if (r.prof && r.prof === this.prof && r.slot) out.add(r.slot);
    return out;
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  async start() {
    let tr;
    try {
      tr = await openTransport(this.kind, this.code, {
        onMessage: (m, from) => this.receive(m, from),
        onPeerJoin: (id) => this.sayHello(id),
        onPeerLeave: (id) => this.drop(id),
        onError: (text) => this.emit('note', `A player couldn't connect (${cleanText(text, 80)}) — a network that blocks direct connections, most likely.`, '#ffab91'),
      });
    } catch (e) {
      this.fail('transport', String(e?.message || e));
      return;
    }
    if (this.over) { tr.leave(); return; }
    this.tr = tr;
    this.selfId = tr.selfId;
    this.t0 = performance.now();
    this.setStatus(this.role === 'host' ? (this.kind === 'local' ? 'open' : 'connecting') : 'searching');
  }

  send(msg, to) { if (this.tr && !this.over) this.tr.send(msg, to); }

  hello() {
    return { k: 'hi', v: PROTO, role: this.role, sig: this.sig, since: this.since, name: this.inWorld ? this.myName() : this.name, slot: this.slot, prof: this.prof, play: this.inWorld };
  }
  sayHello(to) { this.helloSent.add(to); this.send(this.hello(), to); }

  receive(m, from) {
    if (!m || typeof m !== 'object' || this.over || typeof from !== 'string') return;
    if (m.k === 'hi') { this.greet(readHello(m), from); return; }
    const r = this.remotes.get(from);
    if (!r) return; // (nothing counts before a hello)
    switch (m.k) {
      case 'wel': if (from === this.hostId) this.welcomed(m); break;
      case 'no': if (from === this.hostId) this.fail(['version', 'world', 'full'].includes(m.why) ? m.why : 'full'); break;
      case 'lk': { const L = readLook(m); if (L) { r.setLook(L); this.announce(r); this.emit('roster'); } break; }
      case 'sh': { const S = readShip(m); if (S) r.setShip(S); break; }
      case 'st': {
        const s = readState(m);
        if (!s) break;
        const was = r.play;
        r.push(s, performance.now());
        if (!was && r.play) this.emit('roster');
        break;
      }
      case 'env': if (from === this.hostId) this.applyEnv(readEnv(m)); break;
      case 'say': {
        const t = readSay(m);
        if (!t) break;
        // (a flood from one game is cut short: five lines in three seconds at most)
        const now = performance.now(), q = r.said || (r.said = []);
        while (q.length && q[0] < now - 3000) q.shift();
        if (q.length >= 5) break;
        q.push(now);
        this.emit('chat', { name: r.label, text: t, color: MATE_COLOR, from });
        break;
      }
      case 'gone': if (r.play) { r.gone(); this.emit('note', `${r.label}'s journey has ended. The next of their line is on the way.`, '#b0bec5'); this.emit('roster'); } break;
      case 'bye': this.drop(from); break;
      default: break;
    }
  }

  /** A hello: someone new aboard (or someone telling us they're in the world now). */
  greet(h, from) {
    if (!h) return;
    let r = this.remotes.get(from);
    const fresh = !r;
    const bad = h.v !== PROTO ? 'version' : h.sig !== this.sig ? 'world' : null;
    if (this.role === 'host') {
      if (h.role === 'host') {
        // two hosts on one code (the same lineage hosted in two tabs?): the later gives way
        if (h.since < this.since || (h.since === this.since && from < this.selfId)) this.fail('taken');
        return;
      }
      if (fresh && bad) { this.send({ k: 'no', why: bad }, from); return; }
      if (fresh && this.remotes.size >= MAX_PLAYERS - 1) { this.send({ k: 'no', why: 'full' }, from); return; }
    } else if (h.role === 'host') {
      if (this.hostId && this.hostId !== from) return; // (a second host on the code: not ours)
      this.hostId = from;
      if (bad) { this.fail(bad); return; }
    }
    // (another guest, even met before the host, is aboard the same voyage)
    if (fresh) { r = new Remote(from, this); this.remotes.set(from, r); }
    r.hello(h);
    if (fresh) {
      if (!this.helloSent.has(from)) this.sayHello(from);
      if (this.role === 'host') this.send({ k: 'wel', host: this.myName(), env: this.packEnv() }, from);
      // (they've met us: how we look, and the ship we're with, if we're about)
      if (this.inWorld) this.introduce(from);
    }
    this.announce(r);
    this.emit('roster');
  }

  /** "Kaito has joined the voyage", once we know who they are (a guest's still choosing a pirate at first). */
  announce(r) {
    if (r.announced || !r.name || r.role === 'host' || !this.open) return;
    r.announced = true;
    this.emit('note', `${r.name} has joined the voyage.`, MATE_COLOR);
  }

  welcomed(m) {
    this.hostName = cleanText(m.host, NAME_MAX, 'the host');
    const e = readEnv(m.env);
    if (e) { this.hostEnv = e; this.applyEnv(e); }
    if (this.status === 'searching') {
      this.setStatus('joined');
      this.emit('joined');
    }
  }

  /** Someone left (or their game stopped answering). */
  drop(id) {
    this.helloSent.delete(id);
    const r = this.remotes.get(id);
    if (!r) return;
    this.remotes.delete(id);
    if (id === this.hostId) {
      this.hostId = null;
      if (this.status === 'joined') { this.hostName = this.hostName || r.label; this.fail('hostLeft'); }
      return;
    }
    this.emit('note', `${r.label} has left the voyage.`, '#b0bec5');
    this.emit('roster');
  }

  fail(code, detail = '') {
    if (this.over) return;
    this.error = { code, detail };
    this.shutdown('failed');
    this.emit('failed', this.error);
  }

  /** End the voyage on purpose (back to the title, leaving it from the menu, the page closing). */
  close(reason = 'left') {
    if (this.over) return;
    this.send({ k: 'bye' });
    this.shutdown('closed');
    this.emit('closed', reason);
  }

  shutdown(status) {
    this.setStatus(status);
    try { this.tr?.leave(); } catch { /* (already) */ }
    this.remotes.clear();
    this.avatars.length = 0; this.ships.length = 0;
    // (a guest's own weather takes over again, a little later)
    if (this.role === 'guest') this.game.env.weatherTimer = 20 + Math.random() * 20;
    if (this.game.net === this) this.game.net = null;
  }

  // ---------------------------------------------------------------- each frame
  frame(dt) {
    if (this.over) return;
    const g = this.game, now = performance.now();
    if (this.tr) this.watch(now);
    if (this.over) return;
    if (!g.player) return;
    // the shared clock runs on while a menu's open here (the others' doesn't stop for it)
    if (g.paused) g.env.update(dt, g);
    // (a guest's weather is the host's: it never rolls its own)
    if (this.role === 'guest') g.env.weatherTimer = 1e9;
    if (this.open && this.inWorld) {
      this.sendLook(now);
      this.sendState(now);
      if (this.role === 'host') this.sendEnv(now);
    }
    // the others, as they are just now (drawn by render3d/index.js with everyone else)
    const world = g.inZone?.() || '';
    this.avatars.length = 0; this.ships.length = 0;
    for (const r of this.remotes.values()) {
      r.update(g, now, Math.min(0.1, dt), world);
      if (!r.visible) continue;
      this.avatars.push(r.actor);
      if (r.shipShown) this.ships.push(r.shipShown);
    }
  }

  /** The relays coming up (or not), and a guest giving up looking. */
  watch(now) {
    const el = now - (this.t0 ?? now);
    if (this.kind !== 'local') {
      this.relays = this.tr.relays?.() || null;
      if (this.relays?.open && this.status === 'connecting') this.setStatus('open');
      if (!this.relays?.open && el > RELAY_MS && !this.remotes.size) {
        if (this.role === 'guest') { this.fail('relays'); return; }
        if (!this.relayWarned) { this.relayWarned = true; this.emit('status', this.status); }
      }
    }
    if (this.status === 'searching' && el > this.searchMs) this.fail('notfound');
  }

  // ---------------------------------------------------------------- what we send
  /** Your look (and name, weapon, Devil Fruit, flag…) — sent when it changes. */
  packLook() {
    const g = this.game, p = g.player, c = g.state.char;
    const bf = [];
    for (const b of p.buffs || []) {
      if (!b.id || !(b.look || b.aura || b.alpha !== undefined || b.mods?.scale || b.element || VIS_BUFFS.has(b.id))) continue;
      bf.push({ id: b.id, look: b.look || undefined, aura: typeof b.aura === 'string' ? b.aura : undefined, alpha: b.alpha, scale: b.mods?.scale, element: b.element });
      if (bf.length >= 8) break;
    }
    const w = p.weapon;
    return {
      k: 'lk', n: c.name, r: c.race, look: p.look, sy: p.style,
      wp: w ? { kind: w.kind, count: w.count || 1, gun: w.gun, ids: (w.ids || []).slice(0, 3) } : null,
      fr: p.fruit || null, gl: !!p.gills, fa: c.faction, cr: c.crewName || '', jr: c.jr || null, bf,
    };
  }

  sendLook(now) {
    if (now - this.lookT < LOOK_MS) return;
    this.lookT = now;
    const m = this.packLook(), key = JSON.stringify(m);
    if (key === this.lookKey) return;
    this.lookKey = key;
    this.send(m);
    if (this.inWorld && this.name !== m.n) { this.name = m.n; this.send(this.hello()); }
  }

  /** The ship to show the others: the one you sail or stand aboard — else yours lying close by. */
  shipShown() {
    const g = this.game, p = g.player;
    if (p.mode === 'sail' && p.ship && !p.ship.sunk) return p.ship;
    const dk = p.deck?.ship;
    if (dk && dk.owner === 'player' && !dk.sunk) return dk;
    let best = null, bd = 250 * 250;
    for (const s of g.ships) {
      if (s.owner !== 'player' || s.sunk || s.alive === false) continue;
      const d2 = g.world.dist2(p.x, p.y, s.x, s.y);
      if (d2 < bd) { bd = d2; best = s; }
    }
    return best;
  }

  packShip(s) {
    if (!s) return { k: 'sh', id: null };
    const c = this.game.state.char;
    return { k: 'sh', id: String(s.uid || 's' + s.id), ty: s.type, n: s.name, jr: s.jr || null, co: !!s.coated, up: s.upgrades || [], fa: c.faction === 'marine' ? 'marine' : 'player' };
  }

  sendShip(s, to) {
    const m = this.packShip(s), key = JSON.stringify(m);
    if (to) { this.send(m, to); return; }
    if (key === this.shipKey) return;
    this.shipKey = key;
    this.send(m);
  }

  /** Where you are and what you're doing, in a dozen numbers or so (see protocol.js readState). */
  packState(now, ship) {
    const g = this.game, p = g.player;
    let b = 0;
    if (p.moving) b |= BIT.moving;
    if (p.intent?.sprint) b |= BIT.sprint;
    if (p.inWater) b |= BIT.water;
    if (p.under) b |= BIT.under;
    if (p.sinking) b |= BIT.sinking;
    if (p.blocking) b |= BIT.block;
    if (p.drawn) b |= BIT.drawn;
    if (p.armament) b |= BIT.armament;
    if (p.state === 'knocked') b |= BIT.knocked;
    if (p.state === 'dead') b |= BIT.dead;
    if (p.flying) b |= BIT.flying;
    if (p.climb) b |= BIT.climb;
    if (p.conquerorInfused) b |= BIT.conqueror;
    const m = {
      k: 'st', t: Math.round(now), w: g.inZone?.() || '',
      x: r2(p.x), y: r2(p.y), z: r2(p.z), f: r3(p.facing), vx: r2(p.vx), vy: r2(p.vy), vz: r2(p.vz), sp: r2(p.speed), st: p.style,
    };
    if (p.inWater) { m.d = r2(p.depth); m.mz = r2(p.intent?.mz); }
    if (p.wading) m.wd = r2(p.wading);
    if (p.hitstun > 0) m.hs = r2(p.hitstun);
    if (p.charging > 0) m.c = r2(p.charging);
    // what they stand on: their ship's deck (where on her: drawn on her as she rides
    // there), or another deck, a gangway, a roof — the height of it
    const dk = p.deck;
    if (p.mode === 'sail' && ship === p.ship) b |= BIT.helm;
    else if (dk && ship && dk.ship === ship && !dk.plank) m.dk = [r2(dk.u ?? (dk.t - 0.5) * ship.def.length), r2(dk.v || 0), r2(dk.h || 0)];
    else if (dk) { m.g = r2(deckLift(dk, g.env.time)); b |= BIT.roofed; }
    else if (p.roofed && p.lastG != null) { m.g = r2(p.lastG); b |= BIT.roofed; }
    else if (p.belowDeck) { m.g = r2(p.groundAt(g, p.x, p.y)); b |= BIT.roofed; }
    m.b = b;
    if (ship) { m.si = String(ship.uid || 's' + ship.id); m.s = [r2(ship.x), r2(ship.y), r3(ship.heading), r2(ship.speed), r2(ship.sailSet), r2(ship.lvl || 0), r3(ship.pitch || 0), ship.rowL || 0, ship.rowR || 0]; }
    // a technique under way (numbered, so the same one twice is two), and a dodge
    const act = p.action;
    if (act) {
      if (act !== this.actRef) { this.actRef = act; this.actN++; }
      m.a = [this.actN, act.def.id, r2(act.t), r2(act.def.noSpeedup ? 1 : p.atkSpeed()), act.def.m1Chain ? 1 : 0];
    } else this.actRef = null;
    const dash = p.dash?.dodge ? p.dash : null;
    if (dash) {
      if (dash !== this.dashRef) { this.dashRef = dash; this.dodgeN++; }
      m.dg = [this.dodgeN, r2(dash.vx), r2(dash.vy), r2((dash.t0 || 0.22) - dash.t)];
    } else this.dashRef = null;
    return m;
  }

  sendState(now) {
    const p = this.game.player;
    // (a technique or a dodge just begun goes at once: the others see it start when it did)
    const urgent = (p.action && p.action !== this.actRef) || (p.dash?.dodge && p.dash !== this.dashRef);
    const since = now - this.lastSendT;
    if (!urgent && since < 1000 / SEND_HZ - 4) return;
    const ship = this.shipShown();
    this.sendShip(ship);
    const st = this.packState(now, ship);
    const changed = stateChanged(this.lastSent, st);
    if (!urgent && !changed && since < IDLE_MS) return;
    st.q = ++this.seq;
    if (!changed) st.hb = 1;
    this.send(st);
    this.lastSent = st;
    this.lastSendT = now;
  }

  /** A newcomer: how you look and the ship you're with (your states reach them with everyone's). */
  introduce(to) {
    this.send(this.packLook(), to);
    this.sendShip(this.shipShown(), to);
    this.lastSendT = -1e9; // (and a state straight away)
  }

  // ---------------------------------------------------------------- the host's clock and weather
  packEnv() {
    const g = this.game, e = g.env;
    return { k: 'env', live: !!g.player, day: e.day, clock: r3(e.clock), st: r2(e.stormTarget), wt: r3(e.windTarget), wa: r3(e.windAngle), fc: e.forecast || 'Clear' };
  }

  sendEnv(now) {
    const e = this.packEnv(), key = `${e.st}|${e.wt}|${e.fc}`;
    if (now - this.envT < ENV_MS && key === this.envKey) return;
    this.envT = now; this.envKey = key;
    this.send(e);
  }

  /** A guest takes the host's clock and weather (a small difference is caught up gently; a big one at once). */
  applyEnv(e) {
    if (!e) return;
    this.hostEnv = e;
    const g = this.game, env = g.env;
    if (!e.live || !g.player) return;
    const diff = (e.day * 24 + e.clock) - (env.day * 24 + env.clock);
    if (Math.abs(diff) > 0.25) {
      const was = env.day;
      env.day = e.day; env.clock = e.clock;
      if (env.day > was) g.onNewDay?.(env.day);
    } else {
      env.clock += diff * 0.5;
      if (env.clock >= 24) { env.clock -= 24; env.day++; g.onNewDay?.(env.day); } else if (env.clock < 0) { env.clock += 24; env.day--; }
    }
    env.stormTarget = e.st; env.windTarget = e.wt; env.forecast = e.fc;
    if (Math.abs(angleDiff(env.windAngle, e.wa)) > 0.6) env.windAngle = e.wa;
    env.weatherTimer = 1e9;
  }

  // ---------------------------------------------------------------- chat, and coming and going
  say(text) {
    const t = cleanText(text, CHAT_MAX, '');
    if (!t || !this.open) return false;
    this.send({ k: 'say', text: t });
    this.emit('chat', { name: this.myName(), text: t, self: true });
    return true;
  }

  /** In the world (a new character, or back in with one): tell everyone, and take the host's time. */
  onCharacterStart() {
    this.name = this.myName();
    this.lookKey = ''; this.shipKey = ''; this.lastSent = null; this.lastSendT = -1e9;
    this.send(this.hello());
    if (this.role === 'guest' && this.hostEnv) this.applyEnv(this.hostEnv);
    this.emit('roster');
  }

  /** Out of the world (the lineage ended; a new generation is on its way): nothing to draw of you till then. */
  leftWorld() {
    this.send({ k: 'gone' });
    this.lastSent = null;
  }
}

/**
 * Once, at boot: the voyage hears when your character enters the world or
 * leaves it, and says goodbye when the page closes. (Until a voyage is
 * hosted or joined, game.net stays null and none of this does anything.)
 */
export function installNet(game) {
  game.net = null;
  game.on('characterStart', () => game.net?.onCharacterStart());
  game.on('lineageEnded', () => game.net?.leftWorld());
  window.addEventListener('pagehide', () => game.net?.close('page'));
}

/** Host or join a voyage (any voyage already under way ends first). */
export function startVoyage(game, opts) {
  game.net?.close('replaced');
  const v = new Voyage(game, opts);
  game.net = v;
  v.start();
  return v;
}
