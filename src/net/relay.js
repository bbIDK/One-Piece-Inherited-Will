// The message relay: how a voyage gets through when two browsers can't open
// a line to each other at all. Some networks (schools, offices, mobile data)
// let no direct connection through, and some block the meeting places too;
// then everything goes by way of a public MQTT broker, reached over a secure
// WebSocket like any web page — so it works anywhere a page loads. Every game
// on the voyage listens at every broker it can reach and says everything at
// each of them (whoever hears a thing twice takes it once). Nothing is kept
// there; what goes through is sealed (AES-GCM) with a key made from the
// voyage's code, on topics named after another part of its hash, so someone
// watching a public broker sees neither the code nor what's said.
//
// relayTransport(code, handlers) → { kind: 'relay', selfId, send(msg, to?),
//   peers(), relays(), leave(), onDirect? } — the same face as the others
//   (transport.js); `hear(f, n, d)` is how the WebRTC line hands in what came
//   that way, so the two are one voyage (see webTransport there).
export const BROKERS = [
  { url: 'wss://broker.emqx.io:8084/mqtt' },
  { url: 'wss://broker.hivemq.com:8884/mqtt' },
  { url: 'wss://public.cloud.shiftr.io', user: 'public', pass: 'public' },
];
const ROOT = 'iw1';
const BEAT_MS = 2000; // everyone says they're here this often
const QUIET_MS = 15000; // and is taken for gone after this long unheard
const enc = new TextEncoder(), dec = new TextDecoder();

export const randomId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function str(s) {
  const b = enc.encode(s);
  return concat([Uint8Array.of(b.length >> 8, b.length & 255), b]);
}
/** An MQTT packet: its type byte, the length of the rest, the rest. */
export function packet(type, parts) {
  const body = concat(parts), len = [];
  let n = body.length;
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
  return concat([Uint8Array.of(type, ...len), body]);
}

/** A small MQTT 3.1.1 client: connect, subscribe and publish (at most once), and keep alive. */
export class Mqtt {
  static connect(broker, clientId, timeout = 7000, WS = globalThis.WebSocket) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WS(broker.url, 'mqtt'); } catch (e) { reject(e); return; }
      ws.binaryType = 'arraybuffer';
      const m = new Mqtt(ws);
      const fail = (why) => { clearTimeout(t); m.close(); reject(new Error(why)); };
      const t = setTimeout(() => fail('no answer'), timeout);
      ws.onopen = () => {
        const flags = 0x02 | (broker.user ? 0x80 : 0) | (broker.pass ? 0x40 : 0);
        m.raw(packet(0x10, [str('MQTT'), Uint8Array.of(4, flags, 0, 60), str(clientId),
          ...(broker.user ? [str(broker.user)] : []), ...(broker.pass ? [str(broker.pass)] : [])]));
      };
      ws.onerror = () => fail('socket error');
      ws.onclose = () => fail('closed');
      m.onConnack = (rc) => {
        if (rc !== 0) { fail(`refused (${rc})`); return; }
        clearTimeout(t);
        ws.onerror = null;
        ws.onclose = () => m.lost();
        resolve(m);
      };
    });
  }

  constructor(ws) {
    this.ws = ws;
    this.buf = new Uint8Array(0);
    this.nextId = 1;
    this.dead = false;
    this.onMessage = null; // (topic, bytes)
    this.onClose = null;
    this.onConnack = null;
    ws.onmessage = (e) => this.data(new Uint8Array(e.data));
    this.pinger = setInterval(() => this.raw(Uint8Array.of(0xc0, 0)), 25000);
  }

  raw(bytes) {
    if (this.dead || this.ws.readyState !== 1) return false;
    try { this.ws.send(bytes); return true; } catch { return false; }
  }

  subscribe(topic) {
    const id = (this.nextId++ & 0xffff) || 1;
    this.raw(packet(0x82, [Uint8Array.of(id >> 8, id & 255), str(topic), Uint8Array.of(0)]));
  }

  publish(topic, bytes) { return this.raw(packet(0x30, [str(topic), bytes])); }

  // (packets can arrive split across messages, or several in one)
  data(bytes) {
    this.buf = this.buf.length ? concat([this.buf, bytes]) : bytes;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      let len = 0, mul = 1, i = 1;
      for (; i < 5; i++) {
        if (i >= b.length) return;
        len += (b[i] & 127) * mul;
        mul *= 128;
        if (!(b[i] & 128)) break;
      }
      const start = i + 1;
      if (b.length < start + len) return;
      this.handle(b[0] >> 4, b[0] & 15, b.subarray(start, start + len));
      this.buf = b.subarray(start + len);
    }
  }

  handle(type, flags, body) {
    if (type === 2) this.onConnack?.(body[1]);
    else if (type === 3) {
      const tl = (body[0] << 8) | body[1];
      const topic = dec.decode(body.subarray(2, 2 + tl));
      const qos = (flags >> 1) & 3;
      this.onMessage?.(topic, body.slice(2 + tl + (qos ? 2 : 0)));
    }
  }

  lost() {
    if (this.dead) return;
    this.close();
    this.onClose?.();
  }

  close() {
    if (this.dead) return;
    this.dead = true;
    clearInterval(this.pinger);
    try { if (this.ws.readyState === 1) this.ws.send(Uint8Array.of(0xe0, 0)); } catch { /* going anyway */ }
    try { this.ws.close(); } catch { /* already */ }
  }
}

/** The topics and seal for a voyage's code. */
export async function sealFor(code) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`inherited-will relay ${code}`)));
  const key = await crypto.subtle.importKey('raw', h.slice(16), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const room = `${ROOT}/${[...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  return {
    all: `${room}/all`,
    to: (id) => `${room}/${id}`,
    async seal(obj) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      return concat([iv, new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))))]);
    },
    async open(bytes) {
      try {
        const d = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))));
        return d && typeof d === 'object' ? d : null;
      } catch { return null; }
    },
  };
}

/**
 * The relay on its own (see the top of this file). `h`: { onMessage(msg,
 * from), onPeerJoin(id), onPeerLeave(id) }. Resolves once the first broker
 * answers (the others join in as they do); rejects if none does.
 */
export async function relayTransport(code, h = {}, { brokers = BROKERS, selfId = randomId(), WS = globalThis.WebSocket } = {}) {
  const seal = await sealFor(code);
  const conns = [];
  const peers = new Map(); // id → when last heard (ms)
  const seen = new Map(); // id → Set of message numbers taken (recent)
  let left = false, n = 0;
  const say = (topic, obj) => {
    if (left && !obj.bye) return;
    seal.seal(obj).then((bytes) => { for (const m of conns) if (m && !m.dead) m.publish(topic, bytes); });
  };
  const meet = (id) => {
    const fresh = !peers.has(id);
    peers.set(id, Date.now());
    if (fresh) { h.onPeerJoin?.(id); say(seal.to(id), { f: selfId, hi: 1 }); }
  };
  const part = (id) => { if (peers.delete(id)) { seen.delete(id); h.onPeerLeave?.(id); } };
  /** Something from game `f` (number `num`, by any route): passed on once. */
  const take = (f, num, d) => {
    let s = seen.get(f);
    if (!s) { s = new Set(); seen.set(f, s); }
    if (s.has(num)) return;
    s.add(num);
    if (s.size > 400) { const it = s.values(); for (let i = 0; i < 200; i++) s.delete(it.next().value); }
    h.onMessage?.(d, f);
  };
  const got = (d) => {
    if (left || !d || typeof d.f !== 'string' || !/^[a-z0-9]{4,16}$/.test(d.f) || d.f === selfId) return;
    if (d.bye) { part(d.f); return; }
    meet(d.f);
    if (typeof d.n === 'number' && d.d !== undefined) take(d.f, d.n, d.d);
  };
  const add = (m) => {
    conns.push(m);
    m.onMessage = (topic, bytes) => seal.open(bytes).then(got);
    m.onClose = () => { const i = conns.indexOf(m); if (i >= 0) conns[i] = null; };
    m.subscribe(seal.all);
    m.subscribe(seal.to(selfId));
    say(seal.all, { f: selfId, hi: 1 });
  };
  await new Promise((resolve, reject) => {
    let settled = 0, ok = false;
    brokers.forEach((b, i) => Mqtt.connect(b, `iw-${selfId}-${i}`, 7000, WS).then((m) => {
      if (left) { m.close(); return; }
      add(m);
      if (!ok) { ok = true; resolve(); }
    }, () => {
      if (++settled === brokers.length && !ok && !conns.length) reject(new Error('None of the relays could be reached.'));
    }));
  });
  const timer = setInterval(() => {
    say(seal.all, { f: selfId, hi: 1 });
    const now = Date.now();
    for (const [id, t] of peers) if (now - t > QUIET_MS) part(id);
  }, BEAT_MS);
  return {
    kind: 'relay',
    selfId,
    send(msg, to) { say(to ? seal.to(to) : seal.all, { f: selfId, n: ++n, d: msg }); },
    /** The next message number (the direct line numbers its messages the same way, so a thing heard both ways is taken once). */
    next: () => ++n,
    sendNumbered(num, msg, to) { say(to ? seal.to(to) : seal.all, { f: selfId, n: num, d: msg }); },
    take,
    meet,
    peers: () => [...peers.keys()],
    relays: () => ({ open: conns.filter((m) => m && !m.dead).length, all: brokers.length }),
    leave() {
      if (left) return;
      say(seal.all, { f: selfId, bye: 1 });
      left = true;
      clearInterval(timer);
      setTimeout(() => { for (const m of conns) m?.close(); }, 300);
    },
  };
}
