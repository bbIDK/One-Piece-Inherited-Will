// The multiplayer wire format: what the players' games send each other, and
// the checks on whatever comes in. It's from someone else's browser, so
// anything at all could arrive: every field is read with its type and its
// range, strings are cut short, nothing unknown is passed on, and nothing
// from it is ever put on the page as HTML (the screens use textContent).
//
// Every message is a small object with a kind `k`:
//   hi   hello, both ways as two games meet: who you are, host or guest
//   wel  the host's welcome to a guest (with the world's clock and weather)
//   no   the host turning a guest away (a different version, a full ship…)
//   lk   your look: name, race, body and outfit, weapon, Devil Fruit, flag
//   sh   the ship you sail (or stand aboard, or left at the pier nearby)
//   st   your state, a dozen times a second while anything changes
//   env  the host's clock, day and weather
//   say  a line of chat
//   gone you've left the world (back to the title, or your lineage ended)
//   bye  you've left the voyage
export const PROTO = 1;
/** States sent a second while anything changes; and every IDLE_MS regardless (all quiet), to say you're still there. */
export const SEND_HZ = 12;
export const IDLE_MS = 500;
/** A voyage's crew: the host and seven others at most (every game talks to every other). */
export const MAX_PLAYERS = 8;
export const NAME_MAX = 32;
export const CHAT_MAX = 200;

/** What a state's `b` bits say. */
export const BIT = {
  moving: 1, sprint: 2, water: 4, under: 8, sinking: 16, block: 32, drawn: 64, armament: 128,
  knocked: 256, dead: 512, flying: 1024, climb: 2048, roofed: 4096, helm: 8192, conqueror: 16384,
};

// --------------------------------------------------------------- reading values
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
/** A number in [lo, hi] (clamped), or `d` when it isn't one. */
export const num = (v, lo, hi, d = 0) => (finite(v) ? (v < lo ? lo : v > hi ? hi : v) : d);
const int = (v, lo, hi, d = 0) => (finite(v) ? Math.round(num(v, lo, hi, d)) : d);
const ID = /^[A-Za-z0-9_]{1,32}$/;
/** An identifier (a race, a style, an item, a technique…), or `d`. */
export const ident = (v, d = null) => (typeof v === 'string' && ID.test(v) ? v : d);
/** Text, without control characters, trimmed and cut to `max` characters (or `d` when empty). */
export function cleanText(v, max, d = '') {
  if (typeof v !== 'string') return d;
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || d;
}

/**
 * A flat record of plain values (a look, a Jolly Roger…): short identifier
 * keys, and strings, numbers, booleans or null — no nested objects (none of
 * the game's looks have any), at most `maxKeys` of them. null if it isn't an
 * object at all.
 */
export function flat(o, maxKeys = 120) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {};
  let n = 0;
  for (const k of Object.keys(o)) {
    if (n >= maxKeys) break;
    if (!ID.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const v = o[k];
    if (typeof v === 'string') out[k] = v.slice(0, 80);
    else if (finite(v)) out[k] = num(v, -1e6, 1e6);
    else if (typeof v === 'boolean' || v === null) out[k] = v;
    else continue;
    n++;
  }
  return out;
}

const r2 = (v) => Math.round((v || 0) * 100) / 100;
const r3 = (v) => Math.round((v || 0) * 1000) / 1000;
export { r2, r3 };

// --------------------------------------------------------------- messages in
/** A hello: { v, role, sig, since, name, slot, prof, play } or null. */
export function readHello(m) {
  if (!m || m.k !== 'hi') return null;
  const role = m.role === 'host' ? 'host' : m.role === 'guest' ? 'guest' : null;
  if (!role) return null;
  return {
    v: int(m.v, 0, 1e6, 0),
    role,
    sig: typeof m.sig === 'string' ? m.sig.slice(0, 32) : '',
    since: num(m.since, 0, 1e15, 0),
    name: cleanText(m.name, NAME_MAX, ''),
    slot: int(m.slot, 0, 9, 0),
    prof: typeof m.prof === 'string' ? m.prof.slice(0, 32) : '',
    play: !!m.play,
  };
}

/** The host's clock and weather (in a welcome or an env message). */
export function readEnv(m) {
  if (!m || typeof m !== 'object') return null;
  return {
    live: !!m.live,
    day: int(m.day, 1, 1e6, 1),
    clock: num(m.clock, 0, 23.9999, 8.5),
    st: num(m.st, 0, 1, 0),
    wt: num(m.wt, -1e3, 1e3, 0),
    wa: num(m.wa, -1e3, 1e3, 0),
    fc: cleanText(m.fc, 16, 'Clear'),
  };
}

const WEAPON_KINDS = new Set(['sword', 'gun', 'staff', 'axe']);
function readWeapon(w) {
  if (!w || typeof w !== 'object' || !WEAPON_KINDS.has(w.kind)) return null;
  const ids = Array.isArray(w.ids) ? w.ids.slice(0, 3).map((x) => ident(x)).filter(Boolean) : [];
  return { kind: w.kind, count: int(w.count, 1, 3, 1), gun: ident(w.gun, undefined), ids, power: 1 };
}

/** A visual buff (a transformation's look, an aura, a fade, a size): what the others need to draw it. */
function readBuff(b) {
  if (!b || typeof b !== 'object') return null;
  const id = ident(b.id);
  if (!id) return null;
  const out = { id };
  const look = flat(b.look, 40);
  if (look) out.look = look;
  if (typeof b.aura === 'string') out.aura = b.aura.slice(0, 40);
  if (finite(b.alpha)) out.alpha = num(b.alpha, 0, 1);
  if (finite(b.scale)) out.scale = num(b.scale, 0.3, 6, 1);
  const el = ident(b.element, undefined);
  if (el) out.element = el;
  return out;
}

/** Someone's look: { name, race, look, weapon, fruit, gills, faction, crew, jr, style, buffs } or null. */
export function readLook(m) {
  if (!m || m.k !== 'lk') return null;
  const look = flat(m.look);
  if (!look) return null;
  return {
    name: cleanText(m.n, NAME_MAX, 'Pirate'),
    race: ident(m.r, 'human'),
    look,
    weapon: readWeapon(m.wp),
    fruit: ident(m.fr),
    gills: !!m.gl,
    faction: ident(m.fa, 'civilian'),
    crew: cleanText(m.cr, 40, ''),
    jr: flat(m.jr, 16),
    style: ident(m.sy, 'brawler'),
    buffs: Array.isArray(m.bf) ? m.bf.slice(0, 8).map(readBuff).filter(Boolean) : [],
  };
}

/** The ship someone sails: { id, type, name, jr, coated, upgrades, faction } — or { id: null } for none. */
export function readShip(m) {
  if (!m || m.k !== 'sh') return null;
  const id = typeof m.id === 'string' && m.id ? m.id.slice(0, 40) : null;
  if (!id) return { id: null };
  const type = ident(m.ty);
  if (!type) return null;
  return {
    id, type,
    name: cleanText(m.n, 40, 'Ship'),
    jr: flat(m.jr, 16),
    coated: !!m.co,
    upgrades: Array.isArray(m.up) ? m.up.slice(0, 12).map((x) => ident(x)).filter(Boolean) : [],
    faction: ident(m.fa, 'player'),
  };
}

const COORD = 1e7;
/**
 * Someone's state, flattened for the snapshot buffer (see interp.js): their
 * place and motion, what they're doing, and the ship they're on. null if
 * it's not a state.
 */
export function readState(m) {
  if (!m || m.k !== 'st' || !finite(m.t) || !finite(m.x) || !finite(m.y)) return null;
  const s = {
    q: int(m.q, 0, 1e12, 0),
    t: num(m.t, 0, 1e13),
    w: typeof m.w === 'string' ? m.w.slice(0, 32) : '',
    x: num(m.x, -COORD, COORD), y: num(m.y, -COORD, COORD), z: num(m.z, -200, 2000),
    f: num(m.f, -1e4, 1e4),
    vx: num(m.vx, -500, 500), vy: num(m.vy, -500, 500), vz: num(m.vz, -500, 500),
    sp: num(m.sp, 0, 500),
    b: int(m.b, 0, 0x7fffffff, 0),
    st: ident(m.st, 'brawler'),
    d: num(m.d, 0, 2000), wd: num(m.wd, 0, 5), mz: num(m.mz, -1, 1),
    g: num(m.g, -2000, 5000), hs: num(m.hs, 0, 10), c: num(m.c, 0, 1),
    hb: !!m.hb,
  };
  if (Array.isArray(m.dk) && m.dk.length === 3 && m.dk.every(finite)) { s.du = num(m.dk[0], -400, 400); s.dv = num(m.dk[1], -100, 100); s.dh = num(m.dk[2], -50, 200); }
  if (Array.isArray(m.s) && m.s.length >= 5 && m.s.slice(0, 5).every(finite) && typeof m.si === 'string') {
    s.si = m.si.slice(0, 40);
    s.sx = num(m.s[0], -COORD, COORD); s.sy = num(m.s[1], -COORD, COORD); s.sh = num(m.s[2], -1e4, 1e4);
    s.ss = num(m.s[3], -500, 500); s.sl = num(m.s[4], 0, 1);
    s.lv = num(m.s[5], -2000, 5000); s.pi = num(m.s[6], -1.5, 1.5);
    s.rl = num(m.s[7], -1, 1); s.rr = num(m.s[8], -1, 1);
  }
  // (a technique under way: which one, how far into it, how fast they move, and whether it's a basic swing of a combo)
  if (Array.isArray(m.a) && (m.a.length === 4 || m.a.length === 5)) {
    const id = ident(m.a[1]);
    if (id) { s.an = int(m.a[0], 0, 1e9, 0); s.aid = id; s.at = num(m.a[2], 0, 60); s.ar = num(m.a[3], 0.1, 10, 1); s.am = !!m.a[4]; }
  }
  if (Array.isArray(m.dg) && m.dg.length === 4 && m.dg.every(finite)) {
    s.gn = int(m.dg[0], 0, 1e9, 0); s.gvx = num(m.dg[1], -100, 100); s.gvy = num(m.dg[2], -100, 100); s.gt = num(m.dg[3], 0, 2);
  }
  return s;
}

/** A line of chat, cleaned up (null if there's nothing left of it). */
export function readSay(m) {
  if (!m || m.k !== 'say') return null;
  return cleanText(m.text, CHAT_MAX, '') || null;
}

// --------------------------------------------------------------- states out
/**
 * Has anything worth sending changed between two states (as packed: see
 * session.js)? Everything is already rounded to the centimetre (and the
 * thousandth of a radian), so a body standing still sends nothing new.
 */
export function stateChanged(a, b) {
  if (!a || !b) return true;
  for (const k of Object.keys(b)) {
    if (k === 'q' || k === 't' || k === 'hb') continue;
    const x = a[k], y = b[k];
    if (Array.isArray(y)) {
      if (!Array.isArray(x) || x.length !== y.length) return true;
      for (let i = 0; i < y.length; i++) if (x[i] !== y[i]) return true;
    } else if (x !== y) return true;
  }
  for (const k of Object.keys(a)) if (!(k in b) && k !== 'q' && k !== 't' && k !== 'hb') return true;
  return false;
}

/**
 * A short fingerprint of the world (every island's place and size, and the
 * world's own): two games only meet in a voyage if theirs match, so that
 * everyone stands on the same islands (a stale cached build from before the
 * map changed would put them in different places).
 */
export function worldSig(world) {
  let h = 0x811c9dc5;
  const add = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
  add(`${Math.round(world.width || 0)}x${Math.round(world.height || 0)};`);
  for (const i of world.islands || []) add(`${i.id}:${Math.round(i.x)}:${Math.round(i.y)}:${Math.round(i.radius || 0)};`);
  return h.toString(36);
}
