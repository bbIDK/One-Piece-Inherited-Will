// The line between the players' games: a room named by the voyage's code, in
// which every game hears every other. Two kinds, the same to the game:
//
//  - trystero: WebRTC, straight from browser to browser, the games finding
//    each other through public Nostr relays (no server of our own, so it
//    works from GitHub Pages or any static host; ?relay= names others). Only
//    the meeting goes through the relays; what's said afterwards goes peer
//    to peer, encrypted.
//  - local: a BroadcastChannel between pages of this site open in the one
//    browser — for the automated tests (a sandbox may not reach the relays)
//    and for trying a voyage out in two tabs. ?net=local picks it.
//
// openTransport(kind, code, handlers) → a transport:
//   { kind, selfId, send(msg, to?), peers(), relays(), leave() }
// with handlers { onMessage(msg, from), onPeerJoin(id), onPeerLeave(id), onError(text) }.
// Nothing here touches the network until a voyage is hosted or joined
// (trystero isn't even loaded before then).
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
const OPEN_RELAY = [
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];

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
  return turns.concat(OPEN_RELAY);
}

export function openTransport(kind, code, handlers = {}, opts = {}) {
  return kind === 'local' ? Promise.resolve(localTransport(code, handlers, opts)) : trysteroTransport(code, handlers, opts);
}

// ------------------------------------------------------------------ trystero
async function trysteroTransport(code, h, opts) {
  const T = await import('trystero');
  const urls = opts.relays || relayUrls();
  // (TURN relays, for networks that won't let browsers talk directly: see turnServers)
  let turnConfig = opts.turn;
  if (!turnConfig) { try { turnConfig = await turnServers(); } catch { turnConfig = OPEN_RELAY; } }
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
