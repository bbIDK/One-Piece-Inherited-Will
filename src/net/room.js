// The claude.ai room: how a voyage sails when the game is played on its
// claude.ai page (the published artifact), where the page may open no
// connection of its own — no WebRTC, no relays. Everyone with the page open
// there is in its room; a voyage is a named room inside it (`iw-<code>`),
// heard only by the games that joined that name.
//
// Everything goes by presence — each game's one small public object, which
// the platform hands to everyone else in the room whenever it changes (about
// 30 times a second, coalesced) — never by room events, which only the
// artifact's editors may send: a friend opening the shared link can always
// set their presence. A game's presence is its outbox: the last few things
// it said, each numbered, addressed to everyone ('*') or to one game, as
// ASCII JSON in pieces of under 1 KiB (the platform's limit on a string),
// 4 KiB in all. The latest state, look, ship and weather stand in for the
// ones before them; anything else (a hello, a line of chat, goodbye) stays
// a few seconds, long enough for everyone to have seen it, then goes.
// Whoever reads it takes each number once, in order.
//
// The same face as the other transports (transport.js):
//   { kind, selfId, send(msg, to?), peers(), relays(), leave() }
const KEEP_MS = 3000; // how long a one-off message stays in the outbox
const BUDGET = 3700; // bytes of presence used (the platform's limit is 4096)
const PIECE = 900; // characters of a message per string
const FLUSH_MS = 40; // presence pushed at most this often
// (kinds where the newest stands in for the ones before it, to the same address)
const LATEST = new Set(['st', 'lk', 'sh', 'env']);

let roomP = null;
/**
 * The claude.ai room, or null where there's none (not on claude.ai, or not
 * granted): asked once, the answer kept.
 */
export function claudeRoom() {
  if (roomP) return roomP;
  roomP = (async () => {
    // (the page's `claude` can turn up a moment after the game's script starts)
    for (let i = 0; i < 30 && typeof globalThis.claude?.use !== 'function'; i++) {
      if (globalThis.IW_HOST !== 'artifact') return null;
      await new Promise((r) => setTimeout(r, 100));
    }
    const use = globalThis.claude?.use;
    if (typeof use !== 'function') return null;
    try {
      return await Promise.race([Promise.resolve(use.call(globalThis.claude, 'room')), new Promise((r) => setTimeout(() => r(null), 12000))]) || null;
    } catch { return null; }
  })();
  return roomP;
}

/** A message as ASCII JSON (nothing the platform could take for an invisible character). */
export const ascii = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const size = (o) => JSON.stringify(o).length; // (ASCII: characters are bytes)

/**
 * The outbox, on its own (no room): `add(msg, to)` queues it; `entries()`
 * is what goes in the presence. Pieces of one message go in together or not
 * at all, and in the order they were said.
 */
export function outbox({ keep = KEEP_MS, budget = BUDGET, piece = PIECE, now = () => Date.now() } = {}) {
  let seq = 0;
  let out = []; // { seq, to, k, at, parts: [[seq, to, i, n, text]] }
  const wait = [];
  const used = () => size(out.flatMap((m) => m.parts));
  const fits = (m) => size(out.flatMap((x) => x.parts).concat(m.parts)) <= budget;
  const pump = () => {
    const t = now();
    let changed = false;
    // (one-offs that have been up long enough)
    const kept = out.filter((m) => LATEST.has(m.k) || t - m.at < keep);
    if (kept.length !== out.length) { out = kept; changed = true; }
    while (wait.length) {
      const m = wait[0];
      // (a newer one of the same kind to the same address stands in for one waiting to go)
      const old = LATEST.has(m.k) ? out.findIndex((x) => x.k === m.k && x.to === m.to) : -1;
      const without = old >= 0 ? out.filter((_, i) => i !== old) : out;
      if (size(without.flatMap((x) => x.parts).concat(m.parts)) > budget) {
        // (too big to go at all, even alone: dropped)
        if (size(m.parts) > budget) { wait.shift(); continue; }
        // (make room: one-offs that have been up a little while go early)
        const early = without.filter((x) => LATEST.has(x.k) || t - x.at < 400);
        if (early.length !== without.length && size(early.flatMap((x) => x.parts).concat(m.parts)) <= budget) { out = early; }
        else break;
      } else out = without;
      wait.shift();
      m.at = t;
      out.push(m);
      changed = true;
    }
    return changed;
  };
  return {
    add(msg, to = '*') {
      const s = ++seq, text = ascii(msg), n = Math.max(1, Math.ceil(text.length / piece)), parts = [];
      for (let i = 0; i < n; i++) parts.push([s, to, i, n, text.slice(i * piece, (i + 1) * piece)]);
      const k = msg && typeof msg.k === 'string' ? msg.k : '';
      // (one of the latest kinds already waiting to the same address: this one instead)
      const w = LATEST.has(k) ? wait.findIndex((x) => x.k === k && x.to === to) : -1;
      const m = { seq: s, to, k, at: 0, parts };
      if (w >= 0) wait.splice(w, 1);
      wait.push(m);
      return pump();
    },
    pump,
    entries: () => out.flatMap((m) => m.parts),
    used,
    fits,
    waiting: () => wait.length,
  };
}

/**
 * Reading someone's outbox: each message once, in order, those for everyone
 * and those for `self`. Returns the messages new since the last read.
 */
export function reader(self) {
  let last = 0;
  return (entries) => {
    if (!Array.isArray(entries)) return [];
    const got = new Map();
    for (const e of entries) {
      if (!Array.isArray(e) || e.length !== 5) continue;
      const [s, to, i, n, text] = e;
      if (!Number.isInteger(s) || s <= last || (to !== '*' && to !== self) || !Number.isInteger(i) || !Number.isInteger(n) || n < 1 || n > 8 || i < 0 || i >= n || typeof text !== 'string') continue;
      const m = got.get(s) || { n, parts: [] };
      m.parts[i] = text;
      got.set(s, m);
    }
    const out = [];
    for (const s of [...got.keys()].sort((a, b) => a - b)) {
      const m = got.get(s);
      if (m.parts.filter((x) => typeof x === 'string').length !== m.n) continue;
      try { out.push(JSON.parse(m.parts.join(''))); } catch { /* (garbled: skipped) */ }
      last = s;
    }
    return out;
  };
}

/** A voyage in the claude.ai room (see the top of this file). */
export async function roomTransport(room, code, h = {}) {
  const name = 'iw-' + String(code).toLowerCase().replace(/[^a-z0-9]/g, '');
  // (a room of its own for the voyage; where named rooms aren't offered, the
  // page's own room, the code in everyone's presence telling voyages apart)
  let R = null, lobby = false;
  try { R = await room.join(name); } catch (e) {
    if (e?.code === 'not_granted') throw new Error('This page can\'t reach the claude.ai room.');
    R = room; lobby = true;
  }
  // who we are here: our open page's label (the platform's: the same on everyone's screen)
  let selfId = null;
  for (let i = 0; i < 50 && !selfId; i++) {
    selfId = (R.peers() || []).find((p) => p.sameTab)?.peer || (room.peers() || []).find((p) => p.sameTab)?.peer || null;
    if (!selfId) await new Promise((r) => setTimeout(r, 100));
  }
  if (!selfId) throw new Error('The claude.ai room didn\'t answer.');
  const box = outbox();
  const others = new Map(); // peer → reader
  let left = false, dirty = true, lastPush = 0;
  const push = () => {
    if (left || !dirty) return;
    const t = Date.now();
    if (t - lastPush < FLUSH_MS) return;
    lastPush = t; dirty = false;
    R.presence(lobby ? { iw: name, o: box.entries() } : { o: box.entries() }).catch(() => { dirty = true; });
  };
  const mine = (p) => p && !p.sameTab && p.kind === 'viewer' && (!lobby || p.presence?.iw === name);
  const see = (p) => {
    if (!mine(p)) return;
    let read = others.get(p.peer);
    if (!read) { read = reader(selfId); others.set(p.peer, read); h.onPeerJoin?.(p.peer); }
    for (const m of read(p.presence?.o)) if (!left) h.onMessage?.(m, p.peer);
  };
  const gone = (id) => { if (others.delete(id)) h.onPeerLeave?.(id); };
  const subs = [
    R.onPeers((ch) => {
      for (const p of ch.joined) see(p);
      for (const p of ch.updated) {
        // (in the lobby, someone who's left this voyage for another)
        if (lobby && others.has(p.peer) && p.presence?.iw !== name) gone(p.peer);
        else see(p);
      }
      for (const p of ch.left) gone(p.peer);
    }, (e) => h.onError?.(e?.message || 'the room closed')),
  ];
  const timer = setInterval(() => { if (box.pump()) dirty = true; push(); }, FLUSH_MS);
  push();
  return {
    kind: 'room',
    selfId,
    send(msg, to) {
      if (left) return;
      if (box.add(msg, to || '*')) dirty = true;
      push();
    },
    peers: () => [...others.keys()],
    relays: () => ({ open: R.connected() ? 1 : 0, all: 1 }),
    leave() {
      if (left) return;
      // (goodbye said, and seen, before we go)
      box.add({ k: 'bye' }, '*'); dirty = true; lastPush = 0; push();
      left = true;
      clearInterval(timer);
      for (const u of subs) { try { u(); } catch { /* (already) */ } }
      setTimeout(() => { try { if (lobby) R.presence({ iw: null, o: null }); else R.leave(); } catch { /* (already) */ } }, 400);
    },
  };
}
