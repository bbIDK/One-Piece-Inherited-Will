// A tiny Nostr relay for trying multiplayer on one machine (or a LAN) without
// the public relays: the game's real transport (trystero: the games meet
// through a relay, then talk over WebRTC) pointed at it with ?relay=.
//
//   node tools/nostr-relay.mjs [port]      (7777 if none; HOST=0.0.0.0 for a LAN)
//   → open http://localhost:8080/?relay=ws://localhost:7777 in two windows
//
// It speaks just what trystero needs of NIP-01 — EVENT, REQ (kinds, #x and
// since filters), CLOSE — keeps nothing (an event goes to whoever's
// subscribed just then), and checks no signatures: a test tool, not a relay
// for the internet. The WebSocket side is hand-made (no dependency): text
// frames, fragments, ping and close. The multiplayer scenario `mprtc`
// (tools/scenarios-multiplayer.mjs) starts one of its own.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalize } from 'node:path';

const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Start a relay on `port`: resolves to { port, stats, close() } once it's listening. */
export function startRelay(port = 7777, { host = '127.0.0.1', log = null } = {}) {
  const conns = new Set();
  const stats = { connections: 0, events: 0, subscriptions: 0, delivered: 0 };
  const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('A Nostr relay for testing (WebSocket only).\n'); });
  server.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { sock.destroy(); return; }
    const accept = createHash('sha1').update(key + MAGIC).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sock.setNoDelay(true);
    const c = { sock, subs: new Map(), buf: Buffer.alloc(0), parts: [] };
    conns.add(c);
    stats.connections++;
    sock.on('data', (d) => { c.buf = Buffer.concat([c.buf, d]); read(c); });
    sock.on('close', () => conns.delete(c));
    sock.on('error', () => conns.delete(c));
  });

  const frame = (op, payload) => {
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | op, n]);
    else if (n < 65536) head = Buffer.from([0x80 | op, 126, n >> 8, n & 255]);
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    return Buffer.concat([head, payload]);
  };
  const send = (c, msg) => {
    if (c.sock.destroyed) return;
    c.sock.write(frame(1, Buffer.from(JSON.stringify(msg))));
  };

  // the frames come in as they will: read whole ones off the front, unmask them, put fragments together
  function read(c) {
    for (;;) {
      const b = c.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 15, masked = b[1] & 0x80;
      let n = b[1] & 127, at = 2;
      if (n === 126) { if (b.length < 4) return; n = b.readUInt16BE(2); at = 4; } else if (n === 127) { if (b.length < 10) return; n = Number(b.readBigUInt64BE(2)); at = 10; }
      if (n > 1 << 20) { c.sock.destroy(); conns.delete(c); return; } // (a megabyte is plenty for a signal)
      const mask = masked ? b.subarray(at, at + 4) : null;
      if (masked) at += 4;
      if (b.length < at + n) return;
      const data = Buffer.from(b.subarray(at, at + n));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      c.buf = b.subarray(at + n);
      if (op === 8) { try { c.sock.end(frame(8, Buffer.alloc(0))); } catch { /* (gone) */ } conns.delete(c); return; }
      if (op === 9) { c.sock.write(frame(10, data)); continue; }
      if (op === 10) continue;
      c.parts.push(data);
      if (!fin) continue;
      const text = Buffer.concat(c.parts).toString('utf8');
      c.parts = [];
      let msg;
      try { msg = JSON.parse(text); } catch { continue; }
      handle(c, msg);
    }
  }

  const matches = (f, ev) => (!f.kinds || f.kinds.includes(ev.kind))
    && (!f['#x'] || (Array.isArray(ev.tags) && ev.tags.some((t) => t[0] === 'x' && f['#x'].includes(t[1]))))
    && (!f.since || ev.created_at >= f.since - 5); // (a few seconds' grace between clocks)
  function handle(c, msg) {
    if (!Array.isArray(msg)) return;
    if (msg[0] === 'EVENT' && msg[1] && typeof msg[1].id === 'string') {
      const ev = msg[1];
      stats.events++;
      send(c, ['OK', ev.id, true, '']);
      for (const o of conns) {
        for (const [id, filters] of o.subs) if (filters.some((f) => f && matches(f, ev))) { send(o, ['EVENT', id, ev]); stats.delivered++; }
      }
      log?.('event', ev.kind);
    } else if (msg[0] === 'REQ' && typeof msg[1] === 'string') {
      stats.subscriptions++;
      c.subs.set(msg[1], msg.slice(2));
      send(c, ['EOSE', msg[1]]);
      log?.('subscribe', msg[1]);
    } else if (msg[0] === 'CLOSE' && typeof msg[1] === 'string') c.subs.delete(msg[1]);
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve({
      port: server.address().port,
      stats,
      close() { for (const c of conns) c.sock.destroy(); conns.clear(); server.close(); },
    }));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = Number(process.argv[2] || process.env.PORT || 7777), host = process.env.HOST || '127.0.0.1';
  await startRelay(port, { host });
  console.log(`Nostr relay for testing on ws://${host === '0.0.0.0' ? 'localhost' : host}:${port} — open the game with ?relay=ws://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
}
