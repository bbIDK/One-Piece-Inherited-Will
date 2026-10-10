// The line between the players' games: a room named by the voyage's code, in
// which every game hears every other. Its kinds, the same to the game:
//
//  - trystero: WebRTC, straight from browser to browser, the games finding
//    each other through public Nostr relays (no server of our own, so it
//    works from GitHub Pages or any static host; ?relay= names others). Only
//    the meeting goes through the relays; what's said afterwards goes peer
//    to peer, encrypted.
//  - local: a BroadcastChannel between pages of this site open in the one
//    browser — for the automated tests (a sandbox may not reach the relays)
//    and for trying a voyage out in two tabs. ?net=local picks it.
//  - web (the real thing, off claude.ai): trystero's direct line and the
//    message relay (relay.js: public MQTT brokers) at once — whichever
//    gets through (webTransport below).
//  - room: on the game's claude.ai page (the published artifact), the
//    page's own room there (room.js) — the only way out of that page.
//
// openTransport(kind, code, handlers) → a transport:
//   { kind, selfId, send(msg, to?), peers(), relays(), leave() }
// with handlers { onMessage(msg, from), onPeerJoin(id), onPeerLeave(id), onError(text) }.
// Nothing here touches the network until a voyage is hosted or joined
// (trystero isn't even loaded before then).
import { claudeRoom, roomTransport } from './room.js';
import { relayTransport } from './relay.js';

export const APP_ID = 'inherited-will.one-piece-roguelike';
const ROOM = (code) => `voyage-${code}`;

/** Which kind the page asks for: ?net=local, else the real thing. */
export function netKind(search = globalThis.location?.search || '') {
  const n = /[?&]net=([a-z]+)/.exec(String(search))?.[1];
  return n === 'local' ? 'local' : 'trystero';
}

/**
 * Nostr relays the page asks to meet through instead of the public ones
 * trystero picks (?relay=wss://one.example,wss://two.example): a relay of
 * your own, say, where the public ones are blocked — or one on this machine,
 * for the tests (tools/nostr-relay.mjs). null when none are asked for.
 */
export function relayUrls(search = globalThis.location?.search || '') {
  const m = /[?&]relay=([^&#]*)/.exec(String(search));
  if (!m) return null;
  let list;
  try { list = decodeURIComponent(m[1]); } catch { return null; }
  const urls = list.split(',').map((u) => u.trim()).filter((u) => /^wss?:\/\/[^\s/?#]+[^\s]*$/i.test(u));
  return urls.length ? urls.slice(0, 8) : null;
}

/**
 * TURN relays: the way round networks that won't let two browsers talk
 * directly (most home routers do, but some — and many mobile carriers —
 * don't, so a friend on another network can't join). With one configured on
 * either side, the line goes through it instead. Where they come from, the
 * first that's set:
 *  - ?turn=turn:host:port&turnuser=…&turnpass=… in the page's address;
 *  - the Multiplayer screen's Connection setting (saved in this browser):
 *    either a credentials URL that hands back a list of ICE servers (as
 *    Metered's free TURN gives you: https://<app>.metered.live/api/v1/turn/credentials?apiKey=…),
 *    or a TURN address with its username and password;
 *  - and always, as a last resort, Metered's Open Relay (a public, shared,
 *    free relay — best effort: it may be busy or gone).
 */
export const TURN_KEY = 'iw.turn';
const OPEN_RELAY_STATIC = [
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];
/**
 * The Open Relay Project's free TURN (metered.ca): short-lived passwords made
 * from its shared secret, on ports 80 and 443 over UDP, TCP and TLS, so they
 * get through most firewalls (the old fixed password, as a last resort).
 */
export async function openRelay() {
  try {
    const te = new TextEncoder();
    const username = `${Math.floor(Date.now() / 1000) + 24 * 3600}:inheritedwill`;
    const key = await crypto.subtle.importKey('raw', te.encode('openrelayprojectsecret'), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(username)));
    const host = 'staticauth.openrelay.metered.ca';
    return [{ urls: [`turn:${host}:80`, `turn:${host}:80?transport=tcp`, `turn:${host}:443`, `turns:${host}:443?transport=tcp`], username, credential: btoa(String.fromCharCode(...sig)) }, ...OPEN_RELAY_STATIC];
  } catch { return OPEN_RELAY_STATIC; } // (no WebCrypto off a secure page)
}

/** The saved Connection setting: { url } (a credentials URL) or { urls, username, credential }, or null. */
export function savedTurn(store = globalThis.localStorage) {
  try { const v = JSON.parse(store?.getItem(TURN_KEY) || 'null'); return v && (v.url || v.urls) ? v : null; } catch { return null; }
}
export function saveTurn(v, store = globalThis.localStorage) {
  try { if (v) store?.setItem(TURN_KEY, JSON.stringify(v)); else store?.removeItem(TURN_KEY); } catch { /* (private window) */ }
}

/** The TURN servers to use (fetching fresh credentials from a credentials URL if one's set). */
export async function turnServers(search = globalThis.location?.search || '', store = globalThis.localStorage, fetchFn = globalThis.fetch) {
  const out = [];
  const q = new URLSearchParams(String(search).replace(/^\?/, ''));
  const qt = q.get('turn');
  if (qt && /^turns?:/i.test(qt)) out.push({ urls: qt.split(','), username: q.get('turnuser') || undefined, credential: q.get('turnpass') || undefined });
  const s = savedTurn(store);
  if (s?.url && fetchFn) {
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 6000) : null;
      const r = await fetchFn(s.url, ctl ? { signal: ctl.signal } : undefined);
      if (timer) clearTimeout(timer);
      const list = await r.json();
      const arr = Array.isArray(list) ? list : list?.iceServers;
      if (Array.isArray(arr)) for (const x of arr) if (x?.urls) out.push(x);
    } catch { /* (unreachable: fall back on the rest) */ }
  } else if (s?.urls) out.push({ urls: [].concat(s.urls), username: s.username || undefined, credential: s.credential || undefined });
  // (only TURN entries: trystero brings its own STUN)
  const turns = out.filter((x) => [].concat(x.urls).some((u) => /^turns?:/i.test(u)));
  return turns.concat(await openRelay());
}

export async function openTransport(kind, code, handlers = {}, opts = {}) {
  if (kind === 'local') return localTransport(code, handlers, opts);
  // (on the game's claude.ai page, its room: the page may open no connection of its own there)
  const room = opts.room === undefined ? await claudeRoom() : opts.room;
  if (room) return roomTransport(room, code, handlers);
  return webTransport(code, handlers, opts);
}

// ------------------------------------------------------------------ web
/**
 * Off claude.ai, three routes at once, as many as get through: straight from
 * browser to browser (WebRTC, through a TURN relay where a router won't let
 * it straight through: trystero below), and the message relay (relay.js:
 * public MQTT brokers over a secure WebSocket, for networks that let no
 * WebRTC through at all — schools, offices, mobile data). Who's aboard comes
 * from both; each message goes straight to whoever has a direct line, and by
 * the relay to anyone without one (numbered, so one heard both ways is taken
 * once). If the relay can't be reached at all, the direct line alone.
 */
async function webTransport(code, h, opts) {
  let relay = null;
  const direct = new Map(); // our id for a game → its trystero id
  const relayP = relayTransport(code, h).catch(() => null);
  // (the direct line: its messages carry our own ids, so the two routes agree on who's who)
  const T = await import('trystero').catch(() => null);
  let room = null, act = null;
  if (T) {
    const urls = opts.relays || relayUrls();
    let turnConfig = opts.turn;
    if (!turnConfig) { try { turnConfig = await turnServers(); } catch { turnConfig = OPEN_RELAY_STATIC; } }
    try {
      room = T.joinRoom({ appId: APP_ID, relayConfig: { warnOnRelayFailure: false, ...(urls ? { urls } : {}) }, turnConfig, ...(opts.config || {}) }, ROOM(code), {
        onJoinError: () => { /* (no direct line to them: the relay carries it) */ },
      });
      act = room.makeAction('iw2');
    } catch { room = null; }
  }
  relay = await relayP;
  if (!relay) {
    // (no relay at all: the direct line as it always was)
    try { room?.leave(); } catch { /* (already) */ }
    return trysteroTransport(code, h, opts);
  }
  const me = relay.selfId;
  if (act) {
    act.onMessage = (env, ctx) => {
      if (!env || typeof env.f !== 'string' || env.f === me) return;
      direct.set(env.f, ctx.peerId);
      relay.meet(env.f);
      if (typeof env.n === 'number' && env.d !== undefined) relay.take(env.f, env.n, env.d);
    };
    room.onPeerJoin = (tid) => { try { act.send({ f: me, hi: 1 }, { target: tid })?.catch?.(() => {}); } catch { /* (gone) */ } };
    room.onPeerLeave = (tid) => { for (const [k, v] of direct) if (v === tid) direct.delete(k); };
  }
  let left = false;
  const sendDirect = (env, tid) => { try { act.send(env, tid ? { target: tid } : undefined)?.catch?.(() => {}); } catch { /* (gone meanwhile) */ } };
  return {
    kind: 'web',
    selfId: me,
    send(msg, to) {
      if (left) return;
      const n = relay.next(), env = { f: me, n, d: msg };
      if (to) {
        const tid = act && direct.get(to);
        if (tid) sendDirect(env, tid); else relay.sendNumbered(n, msg, to);
        return;
      }
      // (straight to everyone on a direct line; and by the relay too if anyone
      // isn't on one — whoever hears it both ways takes it once)
      const all = relay.peers();
      if (act && direct.size) sendDirect(env);
      if (!act || all.some((id) => !direct.has(id))) relay.sendNumbered(n, msg);
    },
    peers: () => relay.peers(),
    relays() {
      const r = relay.relays();
      let open = r.open, all = r.all;
      for (const s of Object.values(T?.getRelaySockets?.() || {})) { all++; if (s && s.readyState === 1) open++; }
      return { open, all, direct: direct.size };
    },
    leave() {
      if (left) return;
      left = true;
      relay.leave();
      try { room?.leave(); } catch { /* (already) */ }
    },
  };
}

// ------------------------------------------------------------------ trystero
async function trysteroTransport(code, h, opts) {
  const T = await import('trystero');
  const urls = opts.relays || relayUrls();
  // (TURN relays, for networks that won't let browsers talk directly: see turnServers)
  let turnConfig = opts.turn;
  if (!turnConfig) { try { turnConfig = await turnServers(); } catch { turnConfig = OPEN_RELAY_STATIC; } }
  const room = T.joinRoom({ appId: APP_ID, relayConfig: { warnOnRelayFailure: false, ...(urls ? { urls } : {}) }, turnConfig, ...(opts.config || {}) }, ROOM(code), {
    // (two games that met but couldn't open a line to each other: usually a
    // network that won't let browsers talk directly — see the README)
    onJoinError: (d) => h.onError?.(String(d?.error || 'could not connect')),
  });
  const act = room.makeAction('iw');
  act.onMessage = (data, ctx) => h.onMessage?.(data, ctx.peerId);
  room.onPeerJoin = (id) => h.onPeerJoin?.(id);
  room.onPeerLeave = (id) => h.onPeerLeave?.(id);
  let left = false;
  return {
    kind: 'trystero',
    selfId: T.selfId,
    send(msg, to) {
      if (left) return;
      try { act.send(msg, to ? { target: to } : undefined)?.catch?.(() => {}); } catch { /* (gone meanwhile) */ }
    },
    peers: () => Object.keys(room.getPeers()),
    /** How many of the signal relays are reachable just now: { open, all }. */
    relays() {
      let open = 0, all = 0;
      for (const s of Object.values(T.getRelaySockets?.() || {})) { all++; if (s && s.readyState === 1) open++; }
      return { open, all };
    },
    leave() { if (left) return; left = true; try { room.leave(); } catch { /* (already) */ } },
  };
}

// ------------------------------------------------------------------ local
/**
 * Pages in the one browser, over a BroadcastChannel. Each says hello on
 * joining ('join'; whoever's there answers 'here'), beats every `beat` ms,
 * and is taken for gone at once when it says goodbye (closing, it does) — or
 * after `timeout` ms without a word (a page that crashed). That's long: a
 * page busy setting sail into the world can say nothing for a good while.
 */
export function localTransport(code, h = {}, { beat = 1000, timeout = 20000, Channel = globalThis.BroadcastChannel } = {}) {
  if (!Channel) throw new Error('BroadcastChannel is not available here');
  const selfId = 'L' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const bc = new Channel(`${APP_ID}:${ROOM(code)}`);
  const peers = new Map(); // id → when last heard (ms)
  let left = false;
  const post = (m) => { if (!left) { try { bc.postMessage(m); } catch { /* (closed) */ } } };
  const meet = (id) => {
    const fresh = !peers.has(id);
    peers.set(id, Date.now());
    if (fresh) h.onPeerJoin?.(id);
    return fresh;
  };
  const part = (id) => { if (peers.delete(id)) h.onPeerLeave?.(id); };
  bc.onmessage = (ev) => {
    const m = ev.data;
    if (left || !m || typeof m !== 'object' || typeof m.from !== 'string' || m.from === selfId) return;
    if (m.to && m.to !== selfId) return;
    if (m.type === 'leave') { part(m.from); return; }
    const fresh = meet(m.from);
    if (m.type === 'join' || (fresh && m.type === 'beat')) post({ type: 'here', from: selfId, to: m.from });
    else if (m.type === 'data') h.onMessage?.(m.data, m.from);
  };
  const timer = setInterval(() => {
    post({ type: 'beat', from: selfId });
    const now = Date.now();
    for (const [id, t] of peers) if (now - t > timeout) part(id);
  }, beat);
  timer.unref?.();
  post({ type: 'join', from: selfId });
  return {
    kind: 'local',
    selfId,
    send(msg, to) { post({ type: 'data', from: selfId, to: to || undefined, data: msg }); },
    peers: () => [...peers.keys()],
    relays: () => null,
    leave() {
      if (left) return;
      post({ type: 'leave', from: selfId });
      left = true;
      clearInterval(timer);
      peers.clear();
      try { bc.close(); } catch { /* (already) */ }
    },
  };
}
