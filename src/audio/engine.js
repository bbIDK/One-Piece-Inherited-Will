// The mixer: where every sound goes on its way to the speakers, and the rules
// that keep a busy fight from turning to mush. Nothing here is recorded — the
// noise the effects are carved from and the echoes they ring in are generated
// once, when the sound first comes on.
//
//   yours ─── sfx bus ─────────────────────────┐
//   others ── npc bus ── duck ─────────────────┤
//   beds ──── ambience bus ── duck ── shelter ─┤── muffle (under water) ── limiter ── clipper ── speakers
//   music ─── music bus ── duck ───────────────┘                                  │
//   menus ─── ui bus ──────────────────────────────────────────────────────────────┘ (never muffled)
//
// The mix has a pecking order, as a game's must (the loudest, most important
// thing is the one you hear; HDR audio in Frostbite and Wwise): your own
// actions and the blows of your fight on top; other people's below; the music
// under them; the beds at the bottom. A blow, an impact or an ability dips the
// beds (and the music and the others a little) for a moment — a side-chain
// duck, down in a hundredth of a second, back up over a third — so its crack
// and its weight get through, and a flurry holds them down instead of pumping.
//
// Each effect is a voice (see synth.js): a little chain of oscillators and
// filtered noise with one gain at its end. Each kind of sound (blows, moves,
// abilities, foley, the world's) has its own share of the voices, so a storm's
// creaks can never crowd out a punch: when a share is full the least important
// of that kind makes way (faded out over a few milliseconds, never cut), and a
// landed blow is never refused — at worst an older blow's tail makes room.
import { Voice } from './synth.js';

// how many voices each bus may have at once, and each kind of effect (a phone gets fewer)
const CAP = { sfx: 28, npc: 10, amb: 12, ui: 6 };
const CAP_LOW = { sfx: 18, npc: 6, amb: 7, ui: 4 };
const KIND = { hit: 9, tech: 6, move: 6, foley: 6, world: 5 };
const KIND_LOW = { hit: 6, tech: 4, move: 4, foley: 4, world: 3 };
// how many sounds may start each second, and in a burst — past that, all but
// blows wait their turn: a downpour's drops or a crowd's chatter can't flood
// the audio thread with thousands of new nodes a second (it stutters, then
// falls silent)
const START_RATE = 60, START_BURST = 24;
// all the voices of every bus together, at most (the audio thread's budget)
const TOTAL = 44, TOTAL_LOW = 28;
// a blow's first moments are its own: nothing may take its voice before this (seconds)
const HIT_GUARD = 0.14;
// the soft clipper's reach: input up to ±1.4 is rounded into ±0.98
const CLIP_HEAD = 1.4, CEIL = 0.98;
// the limiter: catches pile-ups a few dB under the clipper, lets go gently (no pumping)
const LIM = { threshold: -6, knee: 4, ratio: 14, attack: 0.002, release: 0.28 };

export class Engine {
  constructor(ctx, { low = false } = {}) {
    this.ctx = ctx;
    this.cap = low ? CAP_LOW : CAP;
    this.kindCap = low ? KIND_LOW : KIND;
    const c = ctx;
    // the last stop: a soft clipper that leaves everything below about 0.7
    // alone and rounds off what would otherwise clip (the shaper reads its
    // input as −1..1, so the mix goes in scaled down to its ±1.4 range)
    this.clip = c.createWaveShaper();
    this.clip.curve = softClipCurve();
    // (no oversampling here: its filter rings past the ceiling on the very peaks it's there to catch)
    this.clip.oversample = 'none';
    this.clip.connect(c.destination);
    // before it, a limiter (a compressor at a high ratio with a fast attack and
    // a slow, smooth release); its automatic make-up gain is taken back off
    // first, so below its threshold the mix passes through untouched
    this.limiter = c.createDynamicsCompressor ? c.createDynamicsCompressor() : null;
    const head = this.head = c.createGain(); head.gain.value = 1 / CLIP_HEAD;
    if (this.limiter) {
      for (const k of Object.keys(LIM)) this.limiter[k].value = LIM[k];
      head.gain.value = 1 / (CLIP_HEAD * makeup(LIM));
      head.connect(this.limiter); this.limiter.connect(this.clip);
    } else head.connect(this.clip);
    this.master = c.createGain();
    this.master.connect(head);
    // under water the whole mix goes dull (see setMuffle)
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.6;
    this.muffle.connect(this.master);
    // your own sounds; other people's (ducked under yours)
    this.sfx = c.createGain(); this.sfx.connect(this.muffle);
    this.npcDuck = c.createGain(); this.npcDuck.connect(this.muffle);
    this.npc = c.createGain(); this.npc.connect(this.npcDuck);
    // the beds have a shelter of their own: indoors, or below decks, the sea and the rain outside go muffled
    this.shelter = c.createBiquadFilter();
    this.shelter.type = 'lowpass'; this.shelter.frequency.value = 20000; this.shelter.Q.value = 0.5;
    this.shelter.connect(this.muffle);
    this.ambDuck = c.createGain(); this.ambDuck.connect(this.shelter);
    this.amb = c.createGain(); this.amb.connect(this.ambDuck);
    this.music = c.createGain();
    this.duckGain = c.createGain();
    this.music.connect(this.duckGain); this.duckGain.connect(this.muffle);
    this.ui = c.createGain(); this.ui.connect(this.master);
    // the mix as it goes into the limiter and as it comes out (see heal)
    this.tapIn = c.createAnalyser(); this.tapIn.fftSize = 1024;
    this.tapOut = c.createAnalyser(); this.tapOut.fftSize = 1024;
    this.master.connect(this.tapIn); this.clip.connect(this.tapOut);
    this.tapBuf = new Float32Array(1024);
    this.deadT = 0;
    this.voices = { sfx: [], npc: [], amb: [], ui: [] };
    // voices that have finished (or made way), waiting for their last echo to
    // die before their nodes are unplugged from the mix (see retire)
    this.retired = [];
    // how many new sounds may start: a bucket refilled at a steady rate (see open)
    this.tokens = START_BURST; this.tokT = 0;
    this.total = low ? TOTAL_LOW : TOTAL;
    // (till when the audio thread's been found lagging: the mix sheds load — see open)
    this.strainUntil = 0;
    this.rr = {}; // round-robin counters by sound
    this.ducks = new Map();
    this.makeNoise();
    this.makeRooms();
  }

  now() { return this.ctx.currentTime; }

  /** RMS of what an analyser hears just now (NaN if anything in it isn't a number). */
  rms(a) {
    const b = this.tapBuf;
    a.getFloatTimeDomainData(b);
    let sum = 0;
    for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
    return Math.sqrt(sum / b.length);
  }

  /**
   * Keep the mix alive (called a few times a second). One bad sample — a
   * number blown up to infinity, or not a number at all — stalls the filters
   * and the limiter it passes through: the limiter clamps everything down
   * and takes seconds to let go, a filter's state goes to NaN and stays
   * there. All of it fell silent, then came back on its own (or didn't). If
   * the mix goes in but nothing comes out, or what comes out isn't a number,
   * the filters and the limiter are made anew. Returns true when it healed.
   */
  heal(dt) {
    const a = this.rms(this.tapIn), b = this.rms(this.tapOut);
    const bad = !Number.isFinite(a) || !Number.isFinite(b);
    const dead = a > 0.004 && b < a * 0.02;
    this.deadT = bad ? 1 : dead ? this.deadT + dt : 0;
    if (this.deadT < 0.6) return false;
    this.deadT = 0;
    this.rebuildTail();
    return true;
  }

  /** New muffle and shelter filters and a new limiter, wired in as the old ones were. */
  rebuildTail() {
    const c = this.ctx;
    const fresh = (old, type, q) => {
      const f = c.createBiquadFilter();
      f.type = type; f.frequency.value = Number.isFinite(old.frequency.value) ? old.frequency.value : 20000; f.Q.value = q;
      try { old.disconnect(); } catch { /* gone */ }
      return f;
    };
    const muffle = fresh(this.muffle, 'lowpass', 0.6), shelter = fresh(this.shelter, 'lowpass', 0.5);
    for (const n of [this.sfx, this.npcDuck, this.duckGain]) { try { n.disconnect(this.muffle); } catch { /* not wired */ } n.connect(muffle); }
    try { this.ambDuck.disconnect(this.shelter); } catch { /* not wired */ }
    this.ambDuck.connect(shelter); shelter.connect(muffle); muffle.connect(this.master);
    this.muffle = muffle; this.shelter = shelter;
    if (this.limiter) {
      const lim = c.createDynamicsCompressor();
      for (const k of Object.keys(LIM)) lim[k].value = LIM[k];
      try { this.head.disconnect(this.limiter); this.limiter.disconnect(); } catch { /* gone */ }
      this.head.connect(lim); lim.connect(this.clip);
      this.limiter = lim;
    }
    // (and the ducks let go)
    const t = this.now();
    for (const p of [this.duckGain.gain, this.ambDuck.gain, this.npcDuck.gain]) { p.cancelScheduledValues(t); p.setValueAtTime(1, t); }
    this.ducks.clear();
  }

  /** Volumes from the settings: effects (and the beds with them), and music (`sec` 0: at once). */
  setVolumes(sfx, music, sec = 0.05) {
    const t = this.now();
    for (const [p, v] of [[this.sfx.gain, sfx * 0.6], [this.npc.gain, sfx * 0.5], [this.amb.gain, sfx * 0.3], [this.ui.gain, sfx * 0.6], [this.music.gain, music * 0.28]]) {
      if (sec > 0) ramp(p, v, t, sec); else { p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
    }
  }

  /**
   * How muffled the mix is: 0 in the open air, 1 with your head under water
   * (the low-pass sweeps down over a fifth of a second — a plunge, not a switch).
   */
  setMuffle(k, sec = 0.18) {
    const f = k <= 0.001 ? 20000 : 20000 * Math.pow(620 / 20000, Math.min(1, k));
    const p = this.muffle.frequency, t = this.now();
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.exponentialRampToValueAtTime(Math.max(60, f), t + sec);
  }

  /** Indoors (1) the beds outside go dull and the effects ring in the room a little more. */
  setShelter(k, sec = 0.6) {
    const t = this.now();
    const f = 20000 * Math.pow(700 / 20000, Math.min(1, k));
    const p = this.shelter.frequency;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.exponentialRampToValueAtTime(f, t + sec);
    ramp(this.roomRet.gain, 0.8 + 0.7 * k, t, sec);
  }

  /**
   * Duck the music under a big moment (a heavy blow, a cannon, a fanfare):
   * down by `depth` (0..1) almost at once, back over `release` seconds.
   */
  duck(depth = 0.35, hold = 0.12, release = 0.7) {
    this.dip(this.duckGain.gain, Math.max(0.2, 1 - depth), 0.03, hold, release);
  }

  /**
   * The side-chain: a blow, an impact or an ability of `k` (0..1, how big)
   * dips the beds (to about −8 dB at the biggest), others' sounds (−5 dB) and
   * the music (−3 dB) — in at once, held through the hit, back up smoothly.
   * Overlapping dips don't stack: the deepest wins and the latest holds.
   */
  sidechain(k = 0.5, hold = 0.12) {
    if (!(k > 0.01)) return;
    k = Math.min(1, k);
    const rel = 0.3 + 0.35 * k;
    this.dip(this.ambDuck.gain, 1 - 0.6 * k, 0.012, hold, rel);
    this.dip(this.npcDuck.gain, 1 - 0.45 * k, 0.012, hold, rel);
    this.dip(this.duckGain.gain, 1 - 0.3 * k, 0.02, hold, rel + 0.2);
  }

  /**
   * Bring gain `p` down to `to` in `att`, hold it `hold`, and let it back up to
   * 1 over about `rel`. A dip coming while another holds or lets go never
   * bobs the level up and down: it carries on from where the level is (or goes
   * deeper) and holds a little longer — a flurry keeps the beds down.
   */
  dip(p, to, att, hold, rel) {
    const t = this.now();
    let d = this.ducks.get(p);
    if (!d) this.ducks.set(p, d = { to: 1, until: 0, rel: 0.3 });
    // (where the level is now: held down, or on its way back up)
    const cur = t < d.until ? d.to : 1 - (1 - d.to) * Math.exp(-(t - d.until) / (d.rel / 4));
    if (cur < 0.995) { to = Math.min(to, cur); hold += 0.08; }
    const until = t + att + hold;
    if (t < d.until && to >= d.to && until <= d.until) return;
    d.to = to; d.until = Math.max(until, d.until); d.rel = rel;
    // (not cancelAndHoldAtTime: see ambience.js Glide)
    p.cancelScheduledValues(t); p.setValueAtTime(Math.min(1, Math.max(0.05, Number.isFinite(p.value) ? p.value : 1)), t);
    p.setTargetAtTime(to, t, att / 3);
    p.setTargetAtTime(1, d.until, rel / 4);
  }

  // ------------------------------------------------------------ the material
  /** White, pink and brown noise: two seconds of each, a different stretch read every time. */
  makeNoise() {
    const c = this.ctx, n = Math.floor(c.sampleRate * 2);
    const mk = () => c.createBuffer(1, n, c.sampleRate);
    this.white = mk(); this.pink = mk(); this.brown = mk();
    const w = this.white.getChannelData(0), p = this.pink.getChannelData(0), b = this.brown.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x;
      // (Paul Kellet's pink filter: equal energy per octave, the sound of surf and rain)
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
      // (brown: the rumble under thunder, a torrent, the deep sea)
      br = (br + 0.02 * x) / 1.02; b[i] = br * 3.5;
    }
    // (the buffers loop for the beds: fade the seam so it never clicks)
    for (const d of [w, p, b]) for (let i = 0; i < 256; i++) { const k = i / 256; d[n - 1 - i] = d[n - 1 - i] * k + d[i] * (1 - k); }
    // stick-slip friction for creaks: a train of clicks a little uneven in time
    // and strength (played back faster or slower for the pitch of the groan)
    const cn = Math.floor(c.sampleRate * 1.5);
    this.creakBuf = c.createBuffer(1, cn, c.sampleRate);
    const cd = this.creakBuf.getChannelData(0);
    for (let i = 0; i < cn;) {
      const amp = 0.4 + Math.random() * 0.6;
      for (let j = 0; j < 24 && i + j < cn; j++) cd[i + j] = amp * Math.exp(-j / 5) * (j % 2 ? -1 : 1) * (1 - j / 24);
      i += Math.floor(c.sampleRate / 90 * (0.7 + Math.random() * 0.6));
    }
  }
  noiseBuf(color) { return color === 'pink' ? this.pink : color === 'brown' ? this.brown : this.white; }

  /** The rooms sounds ring in: a short dark one for the effects, a long hall for the music. */
  makeRooms() {
    const c = this.ctx;
    // a short, dark room: decaying noise, a little different in each ear
    this.room = c.createConvolver();
    this.room.buffer = impulse(c, 1.6, (t) => Math.exp(-t / 0.32) * (t < 0.012 ? t / 0.012 : 1));
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    this.roomRet = c.createGain(); this.roomRet.gain.value = 1;
    this.room.connect(lp); lp.connect(this.roomRet); this.roomRet.connect(this.sfx);
    // the music's hall (as it always was: three seconds of soft tail)
    this.hall = c.createConvolver();
    const len = 3.2;
    this.hall.buffer = impulse(c, len, (t) => Math.pow(1 - t / len, 3.2) * (t * c.sampleRate < 80 ? (t * c.sampleRate) / 80 : 1));
    const wet = c.createGain(); wet.gain.value = 0.42;
    this.hall.connect(wet); wet.connect(this.music);
    this.clipCurve = drive();
  }

  // ------------------------------------------------------------ voices
  /**
   * A new voice on `bus` ('sfx' your own, 'npc' others', 'amb' or 'ui'): `vol`
   * its level, `pan` −1..1, `lp` a low-pass for a sound far off (the air takes
   * the top off it), `send` how much rings in the room, `drive` grit through the
   * soft clipper. `kind` is what sort of sound it is (hit, tech, move, foley,
   * world: each has its share of the voices), `prio` how much it matters (a blow
   * on you beats one across the harbour) and `max` how many of the same sound
   * may overlap. Null: there's no room for it (never so for a blow).
   */
  open(name, { bus = 'sfx', vol = 1, pan = 0, lp = 0, send = 0, drive: drv = 0, prio = 5, max = 4, at = null, kind = 'foley' } = {}) {
    const c = this.ctx, t = at ?? this.now();
    const list = this.voices[bus];
    // (forget the ones that have finished, and unplug the long-silent)
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end < t) this.retired.push(list.splice(i, 1)[0]);
    this.retire(t);
    const hit = kind === 'hit';
    // (the audio thread lagging behind: only what matters starts, and fewer voices at once)
    const strained = t < this.strainUntil;
    if (strained && !hit && bus !== 'ui' && prio < 6) return null;
    // (too many starting at once: everything but a blow (or the menus) waits)
    if (this.tokT) this.tokens = Math.min(START_BURST, this.tokens + (t - this.tokT) * START_RATE * (strained ? 0.4 : 1));
    this.tokT = t;
    if (!hit && bus !== 'ui') { if (this.tokens < 1) return null; this.tokens--; }
    let same = 0, oldest = null;
    for (const v of list) if (v.name === name) { same++; if (!oldest || v.t0 < oldest.t0) oldest = v; }
    if (same >= max && oldest && this.mayTake(oldest, hit, prio, vol, t, true)) this.steal(oldest, t, list);
    // its kind's share full: the least of that kind makes way; the bus full: the least of all
    const kc = bus === 'sfx' || bus === 'npc' ? this.kindCap[kind] : 0;
    if (kc) {
      let n = 0; for (const v of list) if (v.kind === kind) n++;
      if (n >= kc && !this.makeRoom(list, t, hit, prio, vol, (v) => v.kind === kind) && !hit) return null;
    }
    const cap = strained ? Math.ceil(this.cap[bus] * 0.6) : this.cap[bus];
    if (list.length >= cap && !this.makeRoom(list, t, hit, prio, vol) && !(hit && list.length < cap + 6)) return null;
    // (and every bus together: the voices still ringing, and those fading whose nodes are still in the graph)
    const all = this.voices.sfx.length + this.voices.npc.length + this.voices.amb.length + this.voices.ui.length;
    const total = strained ? Math.ceil(this.total * 0.6) : this.total;
    if (!hit && bus !== 'ui' && (all >= total || this.retired.length > total * 2)) return null;
    const out = c.createGain();
    out.gain.value = vol;
    let tail = out;
    const chain = [out];
    if (lp > 0 && lp < 18000) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.5;
      tail.connect(f); tail = f; chain.push(f);
    }
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      tail.connect(p); tail = p; chain.push(p);
    }
    tail.connect(this[bus]);
    if (send > 0 && bus !== 'ui') { const s = c.createGain(); s.gain.value = send; out.connect(s); s.connect(this.room); chain.push(s); }
    let input = out;
    if (drv > 0) {
      // (driven hard into the clipper, a blow lands at full weight: the soft
      // clipper at the end of the chain rounds off a pile-up of them)
      const pre = c.createGain(); pre.gain.value = 1 + drv;
      const ws = c.createWaveShaper(); ws.curve = this.clipCurve; ws.oversample = 'none';
      pre.connect(ws); ws.connect(out);
      input = pre;
    }
    const v = new Voice(this, input, t, { name, prio, vol, out });
    v.kind = kind;
    v.chain = chain;
    list.push(v);
    return v;
  }

  /**
   * May a newcomer (a blow or not, of `prio` and `vol`) take voice `v`? Never
   * a blow's first moments; never a blow at all for anything but another blow;
   * otherwise only one less important (or as important and quieter) — or, for
   * the same sound overlapping itself, an older one.
   */
  mayTake(v, hit, prio, vol, t, same = false) {
    if (v.kind === 'hit' && (!hit || t - v.t0 < HIT_GUARD)) return false;
    if (same || (hit && v.kind === 'hit')) return true;
    return v.prio < prio || (v.prio === prio && v.vol <= vol);
  }

  /** Steal the least important voice (of those `which` allows) that the newcomer may take; false if there's none. */
  makeRoom(list, t, hit, prio, vol, which = null) {
    let worst = null;
    for (const v of list) {
      if (which && !which(v)) continue;
      if (!this.mayTake(v, hit, prio, vol, t)) continue;
      // (the least important first; among equals the quietest, then the oldest)
      if (!worst || v.prio < worst.prio || (v.prio === worst.prio && (v.vol < worst.vol - 1e-6 || (Math.abs(v.vol - worst.vol) < 1e-6 && v.t0 < worst.t0)))) worst = v;
    }
    if (!worst) return false;
    this.steal(worst, t, list);
    return true;
  }

  /** Fade a voice out in a few milliseconds (no click) and let it go. */
  steal(v, t, list) {
    const g = v.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.012);
    v.end = t;
    const i = list.indexOf(v);
    if (i >= 0) { list.splice(i, 1); this.retired.push(v); }
  }

  /**
   * Unplug the voices that have been silent a while (their echoes rung out):
   * left connected, every sound ever played stays in the mix's graph, and the
   * audio thread works through more of them each second till it can't keep up.
   */
  retire(t) {
    const R = this.retired;
    if (!R.length) return;
    let w = 0;
    for (let i = 0; i < R.length; i++) {
      const v = R[i];
      if (v.end + (v.tail || 0) + 0.3 < t) {
        for (const n of v.chain || []) { try { n.disconnect(); } catch { /* gone */ } }
        try { v.in?.disconnect?.(); } catch { /* gone */ }
      } else R[w++] = v;
    }
    R.length = w;
  }

  /**
   * Run `fn` once `sec` more seconds of sound have played (letting go of a
   * faded deck's nodes). An offline render (the audio checks) runs ahead of
   * the wall clock, so there the tidying is left to the end of the render.
   */
  later(fn, sec) {
    if (this.offline) return;
    setTimeout(fn, Math.max(0, sec) * 1000);
  }

  /** The next of `n` variants of a sound, never the one just played. */
  variant(name, n) {
    if (n <= 1) return 0;
    const last = this.rr[name] ?? -1;
    let k = Math.floor(Math.random() * (n - 1));
    if (k >= last) k++;
    this.rr[name] = k;
    return k;
  }

  /** How many voices are sounding now (for the tests and the debug overlay). */
  count(bus = 'sfx') {
    const t = this.now();
    return this.voices[bus].filter((v) => v.end >= t).length;
  }
}

/** Ramp an AudioParam from where it is to `v` over `sec` (never a jump: no clicks). */
export function ramp(p, v, t, sec) {
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(v, t + Math.max(0.005, sec));
}

/**
 * The make-up gain a WebAudio compressor adds by itself, worked out as the
 * browsers do (WebKit's kernel, in Chrome, Safari and Firefox alike: the
 * inverse of its gain at full scale through its knee and ratio, to the power
 * 0.6), so that it can be taken back off and quiet sounds pass untouched.
 */
export function makeup({ threshold, knee, ratio }) {
  const lin = (db) => Math.pow(10, db / 20), dbOf = (x) => 20 * Math.log10(x);
  const t0 = lin(threshold);
  const kneeCurve = (x, k) => (x < t0 ? x : t0 + (1 - Math.exp(-k * (x - t0))) / k);
  const slopeAt = (x, k) => (x < t0 ? 1 : (dbOf(kneeCurve(x * 1.001, k)) - dbOf(kneeCurve(x, k))) / (dbOf(x * 1.001) - dbOf(x)));
  // (the knee's sharpness that meets the ratio at its top: a bisection, fifteen steps)
  const xk = lin(threshold + knee);
  let lo = 0.1, hi = 10000, k = 5;
  for (let i = 0; i < 15; i++) { if (slopeAt(xk, k) < 1 / ratio) hi = k; else lo = k; k = Math.sqrt(lo * hi); }
  const yk = dbOf(kneeCurve(xk, k));
  // (full scale: past the knee, the ratio; inside it, the knee)
  const full = xk <= 1 ? lin(yk + (0 - (threshold + knee)) / ratio) : kneeCurve(1, k);
  return Math.pow(1 / full, 0.6);
}

/** A stereo impulse response: noise shaped by `env(t)` (a little different in each ear). */
function impulse(c, sec, env) {
  const len = Math.floor(c.sampleRate * sec), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * env(i / c.sampleRate);
  }
  return ir;
}

/** The soft clipper at the end of the chain: straight up to 0.7, then rounded off towards 1. */
function softClipCurve() {
  const n = 4096, curve = new Float32Array(n), k = 0.7;
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * CLIP_HEAD, a = Math.abs(x);
    curve[i] = a <= k ? x : Math.sign(x) * (k + (CEIL - k) * Math.tanh((a - k) / (CEIL - k)));
  }
  return curve;
}

/** Grit for an impact: a tanh soft clip. */
function drive() {
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.6) / Math.tanh(2.6); }
  return curve;
}
