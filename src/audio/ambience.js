// The world's ambience, built the way a film's or a game's track is: three
// kinds of thing.
//
//   * Beds — the sea's swell, the wind, the water past a hull, canvas in the
//     wind, leaves stirring, a torrent, the deep: noise through filters,
//     never still and never cycling either. Each moves on a random walk of
//     its own (a wave comes in when it comes in, a gust when it gusts: see
//     Bed.tick), so nothing in the world hums or chugs like a machine.
//   * Rain (its own little system: see Rain) — a soft wash far off, a patter
//     of many small drops round about, and near drops landing on whatever is
//     close: the sea, leaves, the ground and the roofs, a deck and its canvas,
//     or the roof over your head. Light rain, a downpour and a storm are each
//     their own sound.
//   * Spots — one sound at a time, at a random moment, somewhere round you: a
//     gull, a songbird, a cicada chorus swelling up and dying away, a cricket
//     chirping a while, an owl, a frog; in a town a voice across the street,
//     laughter, a hammer on an anvil, a cup set down, a dog, a door, a cart
//     going by. Each kind keeps its distance from the last of its kind, and
//     each is different every time, so none of them falls into a rhythm.
//     A town has no bed at all: its life is its spots.
//
// The foley director (foley.js) says how loud each bed should be, how hard it
// rains and on what, and how often each spot should come; here they're made
// and faded (a bed or the rain unwanted for twenty seconds is taken apart, to
// spare the CPU).
const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * An AudioParam moved by hand, knowing where it is at any moment (setTargetAtTime
 * curves worked out here, so a change always starts from where the last one has
 * got to — in an offline render too, whose clock runs ahead of `.value`).
 */
class Glide {
  constructor(p, v) { this.p = p; this.v0 = v; this.to = v; this.t0 = 0; this.tc = 0.01; p.value = v; }
  at(t) { return this.to + (this.v0 - this.to) * Math.exp(-Math.max(0, t - this.t0) / this.tc); }
  /** Head for `to` from time `t`, most of the way there in `sec`. */
  go(to, t, sec) {
    const now = this.at(t), p = this.p, tc = Math.max(0.004, sec / 3);
    // (not cancelAndHoldAtTime: in Chrome, cut into a setTargetAtTime curve it
    // can hold the wrong level — a bed or the whole mix gone quiet till the next change)
    p.cancelScheduledValues(t); p.setValueAtTime(now, t);
    p.setTargetAtTime(to, t, tc);
    this.v0 = now; this.to = to; this.t0 = t; this.tc = tc;
  }
  /** And then, from `t2`, head for `to2` (a wave: up, then away). */
  then(to2, t2, sec) {
    const tc = Math.max(0.004, sec / 3);
    this.p.setTargetAtTime(to2, t2, tc);
    this.v0 = this.at(t2); this.to = to2; this.t0 = t2; this.tc = tc;
  }
}

// ---------------------------------------------------------------- beds
// each bed: its layers [noise colour, filter type, frequency, Q, level], and how
// it moves — `swell` (waves: a rise, a fall, a while till the next; the first
// layer's filter opening as each comes in), `gust` (a new strength every few
// seconds, its band rising with it), `flap` (canvas fluttering: see luff)
const BEDS = {
  // the sea: a low surge, a wash of foam over it
  ocean: { layers: [['pink', 'lowpass', 420, 0.6, 0.55], ['pink', 'bandpass', 1300, 0.5, 0.06]], swell: { gap: [4.5, 9.5], rise: [1.1, 2.2], fall: [2.4, 4.4], lo: 0.45, f: [300, 760] } },
  // wind: a broad band and a thinner whistle over it
  wind: { layers: [['pink', 'bandpass', 520, 0.7, 0.5], ['pink', 'bandpass', 1500, 1.6, 0.07]], gust: { gap: [2, 7], lo: 0.2, f: [360, 900] } },
  // a storm's howl: narrow whistles sliding with the gusts
  howl: { layers: [['white', 'bandpass', 900, 12, 0.35], ['white', 'bandpass', 1450, 14, 0.2]], gust: { gap: [1.2, 4], lo: 0.08, f: [620, 1300] } },
  // leaves stirring as the wind comes and goes
  leaves: { layers: [['white', 'bandpass', 4200, 0.6, 0.09], ['white', 'bandpass', 2200, 0.8, 0.04]], gust: { gap: [2, 6], lo: 0.08 } },
  // the water past a hull: the rushing wash, the spray at the bow, surging with each swell she meets
  hull: { layers: [['pink', 'lowpass', 1100, 0.6, 0.5], ['white', 'bandpass', 3000, 0.7, 0.05]], swell: { gap: [2.2, 5.5], rise: [0.5, 1.1], fall: [1, 2.2], lo: 0.5, f: [800, 1500] } },
  // canvas in the wind: a low thrum, fluttering when she's luffing (see luff)
  sails: { layers: [['pink', 'lowpass', 300, 0.7, 0.6]], flap: true },
  torrent: { layers: [['brown', 'lowpass', 900, 0.5, 0.9], ['pink', 'bandpass', 1400, 0.6, 0.35], ['white', 'highpass', 3500, 0.5, 0.06]], gust: { gap: [0.4, 1.6], lo: 0.75 } },
  deep: { layers: [['brown', 'lowpass', 220, 0.7, 0.9]], swell: { gap: [6, 12], rise: [2, 4], fall: [3, 6], lo: 0.6 } },
  fire: { layers: [['pink', 'lowpass', 800, 0.7, 0.5], ['white', 'highpass', 4000, 0.5, 0.05]], gust: { gap: [0.15, 0.6], lo: 0.55 } },
  sky: { layers: [['white', 'bandpass', 3200, 0.4, 0.12], ['pink', 'bandpass', 700, 0.6, 0.2]], gust: { gap: [3, 8], lo: 0.5 } },
};

class Bed {
  constructor(A, name) {
    const E = A.E, c = E.ctx, D = BEDS[name];
    this.name = name; this.D = D;
    this.out = c.createGain(); this.out.connect(E.amb);
    this.vol = new Glide(this.out.gain, 0);
    // (its motion — waves, gusts — on a gain of its own, under the level the foley asks for)
    this.mv = c.createGain(); this.mv.connect(this.out);
    this.move = new Glide(this.mv.gain, D.swell ? D.swell.lo : D.gust ? D.gust.lo : 1);
    this.nodes = [];
    this.layers = D.layers.map(([color, type, f, q, g]) => {
      const src = c.createBufferSource(); src.buffer = E.noiseBuf(color); src.loop = true;
      // (a random place in the loop, and a hair off the usual speed: two beds of one kind never line up)
      src.playbackRate.value = rnd(0.97, 1.03);
      const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const gn = c.createGain(); gn.gain.value = g;
      src.connect(flt); flt.connect(gn); gn.connect(this.mv);
      src.start(0, Math.random() * 1.9);
      this.nodes.push(src);
      return { src, flt, gn };
    });
    this.f0 = new Glide(this.layers[0].flt.frequency, D.layers[0][2]);
    if (D.flap) {
      // canvas flapping: the level trembling a few times a second (deeper when luffing: see luff)
      const o = c.createOscillator(), og = c.createGain();
      o.frequency.value = rnd(4, 6); og.gain.value = 0.05;
      o.connect(og); og.connect(this.mv.gain); o.start(0);
      this.flapRate = new Glide(o.frequency, o.frequency.value);
      this.flap = og; this.flapDepth = new Glide(og.gain, 0.05);
      this.nodes.push(o);
    }
    this.level = 0;
    this.quietSince = 0;
    this.next = 0;
  }

  set(level, t, sec) {
    if (Math.abs(level - this.level) < 0.002) return;
    this.level = level;
    this.vol.go(level, t, sec);
  }

  /** Keep it moving: the next wave or gust when its time comes (never on a beat). */
  tick(t) {
    if (t < this.next) return;
    const D = this.D;
    if (D.swell) {
      // a wave: in over `rise`, away over `fall`
      const S = D.swell, rise = rnd(...S.rise), fall = rnd(...S.fall), pk = rnd(0.75, 1);
      this.move.go(pk, t, rise); this.move.then(S.lo * rnd(0.8, 1.15), t + rise, fall);
      if (S.f) { this.f0.go(S.f[1] * rnd(0.85, 1.1), t, rise); this.f0.then(S.f[0] * rnd(0.9, 1.1), t + rise, fall); }
      this.next = t + rise + rnd(...S.gap) - rise * 0.5;
    } else if (D.gust) {
      // a gust: a new strength (mostly middling, now and then a strong one), its band rising with it
      const G = D.gust, k = Math.pow(Math.random(), 1.6), to = G.lo + (1 - G.lo) * k;
      const gap = rnd(...G.gap);
      this.move.go(to, t, Math.min(gap, rnd(0.6, 2.2)));
      if (G.f) this.f0.go(G.f[0] + (G.f[1] - G.f[0]) * k, t, Math.min(gap, rnd(0.8, 2.4)));
      this.next = t + gap;
    } else this.next = t + 5;
    if (this.flapRate) this.flapRate.go(rnd(3.5, 7.5), t, 1.5);
  }

  stop() {
    for (const n of this.nodes) { try { n.stop(); } catch { /* not started */ } }
    try { this.out.disconnect(); } catch { /* gone */ }
  }
}

// ---------------------------------------------------------------- rain
// Rain in three layers, as a sound designer layers it: a soft wash far off, a
// patter of many small drops round about (a loop of drops made here, each a
// tick of noise and a ring of its own pitch, most faint and a few loud), and
// near drops landing on what's close (DROPS: live, every one different).
// What they land on changes all three (measured off recordings of each):
// rain on open water is a bright hiss — each drop's impact is broadband and
// the bubble it leaves rings at 13–20 kHz (oceanographers measure rainfall by
// it) — with plips of the bigger drops; on leaves a patter peaking at 1–4 kHz;
// on the ground and roofs a duller one; on a deck the planks knock round
// 500–900 Hz and the canvas thrums low; under a roof it's drumming above you,
// nothing over a kilohertz or so. Light rain is drops you could count (a dozen
// a second near you); a downpour is a dense, steady roar with few you can pick
// out; a storm is the downpour driven in sheets by the gusts.
//
// each surface: the wash's band [high-pass, low-pass] and level, the patter's
// band and level, a body to it [peak Hz, dB], the near drop's kind and how many
// a second in a downpour
// (the shapes are the recordings': rain on a lake is flat from 1 kHz to 16 kHz
// in octaves, leaves and the ground peak at 1–2 kHz and fall away above 4, a
// roof heard from under it peaks at 500 Hz–1 kHz with little over 4 kHz)
const RAIN = {
  sea: { wash: [750, 16000, 0.34], pat: [600, 14000, 0.3], body: [1300, 3], drop: 'plip', rate: 5 },
  deck: { wash: [150, 9000, 0.22], pat: [260, 5000, 0.4], body: [850, 6], drop: 'tok', rate: 8 },
  leaves: { wash: [170, 5000, 0.32], pat: [480, 6000, 0.4], body: [1600, 3], drop: 'tak', rate: 9 },
  ground: { wash: [190, 2600, 0.36], pat: [340, 3600, 0.34], body: [1000, 5], drop: 'pat', rate: 6 },
  town: { wash: [200, 3000, 0.36], pat: [400, 4000, 0.36], body: [1100, 5], drop: 'tik', rate: 7 },
  inside: { wash: [90, 2400, 0.36], pat: [260, 3000, 0.5], body: [650, 6], drop: 'dup', rate: 5 },
};

/** Near drops, on what they fall on (each drawn into voice `v` at `t`, `s` its strength). */
/**
 * The drops landing round you in the world (precip3d.js pushes them as they
 * hit: how far off, which side, on what), heard one by one where they fall —
 * as many as there are voices for; the rest are the wash.
 */
export const RAIN_HITS = [];

const DROPS = {
  /** On water: the plip of a drop and the little whistle of the bubble it leaves. */
  // (a splash of noise, the bubble's ring faint and high — up where rain on the
  // sea really rings, 10 kHz and over — not a tuned plink from a dripping tap)
  plip(v, t, s) { v.noise(t, 0.012, { freq: rnd(2500, 6000), q: 0.8, gain: 0.04 * s, attack: 0.0006 }); v.noise(t, 0.004, { type: 'highpass', freq: 6000, gain: 0.02 * s, attack: 0.0004 }); if (Math.random() < 0.25) v.bubble(t + 0.004, { f: rnd(9000, 14000), rise: 1.3, dur: 0.008, gain: 0.006 * s }); },
  /** On a leaf: a sharp little tap, the leaf trembling after it. */
  tak(v, t, s) { v.noise(t, 0.01, { freq: rnd(2200, 4200), q: 2, gain: 0.06 * s, attack: 0.0006 }); v.noise(t + 0.008, 0.035, { freq: rnd(3000, 5200), q: 1, gain: 0.012 * s }); },
  /** On the ground: a soft pat. */
  pat(v, t, s) { v.noise(t, 0.014, { freq: rnd(900, 1800), q: 1.2, gain: 0.055 * s, attack: 0.001 }); },
  /** On a roof tile, a shutter, a barrel: a dry tick. */
  tik(v, t, s) { v.noise(t, 0.008, { freq: rnd(2500, 4500), q: 3, gain: 0.05 * s, attack: 0.0005 }); v.tone(t, 0.02, { freq: rnd(1700, 2600), gain: 0.008 * s }); },
  /** On deck planks a hollow tok — and now and then on the canvas, a thrum. */
  tok(v, t, s) {
    if (Math.random() < 0.3) { v.thump(t, { f0: rnd(170, 240), f1: 130, dur: 0.05, gain: 0.035 * s }); v.noise(t, 0.03, { type: 'lowpass', freq: 650, gain: 0.03 * s }); return; }
    v.tone(t, 0.035, { freq: rnd(520, 900), to: 420, gain: 0.03 * s, attack: 0.0008 });
    v.noise(t, 0.007, { freq: 2600, q: 1.5, gain: 0.03 * s, attack: 0.0005 });
  },
  /** On the roof over your head: a muffled dup. */
  dup(v, t, s) { v.thump(t, { f0: rnd(140, 230), f1: 100, dur: 0.06, gain: 0.05 * s }); v.noise(t, 0.02, { type: 'lowpass', freq: 600, gain: 0.03 * s }); },
};

/**
 * A loop of rain drops (`rate` a second in each ear, over `secs`): each a tick
 * of noise and a short ring of its own pitch, most faint and a few loud, the
 * loop wrapped so it has no seam; scaled to a known level.
 */
function patterLoop(c, secs, rate) {
  const sr = c.sampleRate, n = Math.floor(sr * secs), buf = c.createBuffer(2, n, sr);
  let ss = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0, cnt = Math.round(rate * secs); i < cnt; i++) {
      const at = Math.floor(Math.random() * n), a = 0.12 + 0.88 * Math.pow(Math.random(), 3);
      const f = 800 + Math.random() * Math.random() * 6500, tau = (0.0004 + Math.random() * 0.0012) * sr;
      const w = 2 * Math.PI * f / sr, len = Math.floor(tau * 5);
      // (mostly the tick of noise, only a trace of a ring: many drops, not a xylophone)
      for (let j = 0; j < len; j++) d[(at + j) % n] += a * Math.exp(-j / tau) * (0.12 * Math.sin(w * j) + 0.88 * (Math.random() * 2 - 1));
    }
    for (let i = 0; i < n; i++) ss += d[i] * d[i];
  }
  const k = 0.1 / Math.sqrt(ss / (2 * n) || 1);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) d[i] *= k; }
  return buf;
}

class Rain {
  constructor(A) {
    const E = A.E, c = E.ctx;
    this.A = A;
    // (the loops are made once and shared)
    E.patter = E.patter || { sparse: patterLoop(c, 6, 16), dense: patterLoop(c, 3, 240) };
    this.out = c.createGain(); this.out.connect(E.amb);
    this.vol = new Glide(this.out.gain, 0);
    // (the storm's gusts drive it in sheets)
    this.mv = c.createGain(); this.mv.connect(this.out);
    this.move = new Glide(this.mv.gain, 1);
    this.nodes = [];
    const chain = (into) => {
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = 0.6;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
      const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.Q.value = 1.1;
      const g = c.createGain();
      hp.connect(lp); lp.connect(pk); pk.connect(g); g.connect(into);
      return { in: hp, hp: new Glide(hp.frequency, 1000), lp: new Glide(lp.frequency, 8000), pk: new Glide(pk.frequency, 1000), pkg: new Glide(pk.gain, 0), g: new Glide(g.gain, 0) };
    };
    this.wash = chain(this.mv);
    const ws = c.createBufferSource(); ws.buffer = E.pink; ws.loop = true; ws.connect(this.wash.in); ws.start(0, Math.random() * 1.9);
    this.pat = chain(this.mv);
    const loop = (buf, rate) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
      const g = c.createGain(); s.connect(g); g.connect(this.pat.in); s.start(0, Math.random() * buf.duration);
      this.nodes.push(s);
      return new Glide(g.gain, 0);
    };
    this.sparse = loop(E.patter.sparse, rnd(0.95, 1.05));
    this.dense = loop(E.patter.dense, rnd(0.95, 1.05));
    this.nodes.push(ws);
    this.where = null; this.r = -1; this.level = 0; this.quietSince = 0; this.next = 0;
  }

  /** How hard it rains (`r` 0..1: light from 0.2, a downpour from ~0.6, a storm with `storm`), and on what (`where`: a RAIN key). */
  set(r, storm, where, t, sec = 1.5) {
    const S = RAIN[where] || RAIN.ground;
    if (where !== this.where) {
      // (walking in under a roof, or out onto a deck: the rain's colour changes over a second or so)
      const w = S.wash, p = S.pat, k = 1.2;
      this.wash.hp.go(w[0], t, k); this.wash.lp.go(w[1], t, k);
      this.pat.hp.go(p[0], t, k); this.pat.lp.go(p[1], t, k);
      this.pat.pk.go(S.body[0], t, k); this.pat.pkg.go(S.body[1], t, k);
      this.where = where;
      this.r = -1;
    }
    if (Math.abs(r - this.r) < 0.01 && Math.abs(storm - (this.storm || 0)) < 0.02) return;
    this.r = r; this.storm = storm;
    // how hard it sounds: the weather's rain (0.35-0.55) is a steady rain, a
    // squall's a downpour, a storm's a roar. Out of doors light rain is some
    // 45 dB(A) and a downpour 65 or more, so the rain swings 20 dB from the
    // one to the other (the wash most: the dense, steady roar of a downpour is
    // the wash; light rain is drops you could count over a faint one)
    const k = Math.max(0, Math.min(1, (r - 0.06) / 0.6)), heavy = smooth(0.25, 0.9, k);
    const lev = Math.pow(10, -20 * (1 - k) / 20) * (1 + 0.2 * storm);
    this.wash.g.go(S.wash[2] * lev * (0.5 + 0.5 * heavy), t, sec);
    this.pat.g.go(S.pat[2] * Math.pow(10, -10 * (1 - k) / 20), t, sec);
    this.sparse.go(0.55 * (1 - 0.7 * heavy), t, sec);
    this.dense.go(heavy * (0.6 + 0.4 * k), t, sec);
  }

  /** The overall level (0 fades it out). */
  fade(level, t, sec) { if (Math.abs(level - this.level) > 0.002) { this.level = level; this.vol.go(level, t, sec); } }

  /** Gusts driving the rain in sheets (a storm), and the near drops landing round you. */
  tick(t, dt) {
    if (this.level < 0.01 || this.r <= 0) return;
    if (t >= this.next) {
      const st = this.storm || 0, k = Math.pow(Math.random(), 1.5);
      this.move.go(st > 0.5 ? 0.6 + 0.4 * k + 0.15 * st : 0.9 + 0.1 * k, t, rnd(0.6, 1.8));
      this.next = t + rnd(1.5, 4.5);
    }
    const S = RAIN[this.where] || RAIN.ground;
    // the drops you see land, heard where they land (the nearest few; the engine keeps only so many voices)
    if (RAIN_HITS.length) {
      const hits = RAIN_HITS.splice(0).sort((a, b) => a.d - b.d).slice(0, 6);
      const E = this.A.E;
      for (const h of hits) {
        const kind = h.on === 'roof' ? (this.where === 'inside' ? 'dup' : 'tik') : h.on === 'water' ? 'plip' : this.where === 'leaves' || this.where === 'deck' || this.where === 'town' ? S.drop : 'pat';
        const near = 1 / (1 + h.d / 2.5);
        const v = E.open('amb:rain', { bus: 'amb', vol: this.level * (0.35 + near), pan: Math.max(-0.9, Math.min(0.9, h.pan * (0.4 + 0.6 * Math.min(1, h.d / 2)))), lp: this.where === 'inside' ? 1200 : 9000 - 5000 * (1 - near), send: 0.04, prio: 1, max: 6 });
        if (!v) break;
        v.pj = rnd(0.92, 1.08);
        DROPS[kind](v, Math.random() * dt, 0.6 + 0.6 * near);
      }
      this.seen = t;
      return;
    }
    // (none seen just now — under cover, or the view's elsewhere: a few near drops all the same)
    if (t - (this.seen || -9) < 1) return;
    // near drops: a few each moment (counted out fairly: some moments none, some several)
    const want = S.rate * (0.35 + 0.65 * this.r) * dt;
    // (a Poisson count: some moments none, some several)
    let n = 0, p = Math.random();
    const L = Math.exp(-want);
    while (p > L && n < 12) { n++; p *= Math.random(); }
    if (!n) return;
    const E = this.A.E;
    const v = E.open('amb:rain', { bus: 'amb', vol: this.level, pan: rnd(-0.7, 0.7), lp: this.where === 'inside' ? 1200 : 0, send: 0.04, prio: 1, max: 3 });
    if (!v) return;
    v.pj = rnd(0.94, 1.06);
    for (let i = 0; i < n; i++) DROPS[S.drop](v, Math.random() * dt, 0.5 + 0.5 * Math.random());
  }

  stop() {
    for (const n of this.nodes) { try { n.stop(); } catch { /* not started */ } }
    try { this.out.disconnect(); } catch { /* gone */ }
  }
}

// ---------------------------------------------------------------- spots
// the spots: one-off sounds, each drawn into a voice `v` on the ambience bus;
// `gap` the least time between two of a kind (seconds)
export const SPOTS = {
  /** A gull's "kyow-kyow" (two or three calls, falling). */
  gull: {
    gap: 3, play(v) {
      const n = 1 + Math.floor(Math.random() * 3), f = rnd(1300, 1700);
      for (let i = 0; i < n; i++) {
        const t = i * rnd(0.22, 0.3);
        v.tone(t, 0.2, { freq: f * 1.25, to: f * 0.8, glide: 0.16, type: 'sawtooth', gain: 0.012, attack: 0.02 });
        v.tone(t, 0.2, { freq: f * 0.62, to: f * 0.4, glide: 0.16, type: 'triangle', gain: 0.02, attack: 0.02 });
      }
    },
  },
  /** A songbird: a short phrase of chirps and trills. */
  bird: {
    gap: 2.5, play(v) {
      const n = 2 + Math.floor(Math.random() * 5), base = rnd(2600, 4200);
      let t = 0;
      for (let i = 0; i < n; i++) {
        const up = Math.random() < 0.5, d = rnd(0.04, 0.11);
        v.chirp(t, { f0: base * (up ? 0.8 : 1.2), f1: base * (up ? 1.25 : 0.75), dur: d, gain: rnd(0.015, 0.032), warble: Math.random() < 0.3 ? rnd(30, 60) : 0 });
        t += d + rnd(0.02, 0.12);
      }
    },
  },
  /** A jungle bird's whooping call. */
  tropical: { gap: 5, play(v) { const f = rnd(900, 1500); for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) v.chirp(i * rnd(0.22, 0.3), { f0: f, f1: f * 1.6, dur: 0.18, gain: 0.025, warble: 8 }); } },
  /**
   * Cicadas: a chorus swelling up out of nothing, holding, and dying away (as
   * they do, in waves) — a band of noise round 4–6 kHz pulsing at their own
   * rate, and a fainter band over it. Never a constant whine.
   */
  cicada: {
    gap: 7, play(v) {
      const dur = rnd(4, 9), f = rnd(4200, 6000), rate = rnd(11, 19), up = dur * rnd(0.3, 0.45);
      v.noise(0, dur, { type: 'bandpass', freq: f, q: 3, gain: 0.03, attack: up, hold: dur * 0.15, curve: 'lin', am: { rate, depth: 0.75 } });
      v.noise(0, dur, { type: 'bandpass', freq: f * rnd(1.55, 1.75), q: 4, gain: 0.008, attack: up, hold: dur * 0.15, curve: 'lin', am: { rate, depth: 0.75 } });
    },
  },
  /** A cricket chirping a while from one spot: trills of three to five pulses, a tone near 4.5 kHz. */
  cricket: {
    gap: 3, play(v) {
      const f = rnd(3900, 4900), n = 3 + Math.floor(Math.random() * 3), per = rnd(0.024, 0.034), span = rnd(2.5, 6);
      for (let t = 0; t < span; t += rnd(0.45, 1.1)) for (let i = 0; i < n; i++) v.tone(t + i * per, 0.016, { freq: f, gain: 0.012 * (i ? 1 : 0.7), attack: 0.003 });
    },
  },
  /** An owl: hoo... hoo-hoo. */
  owl: { gap: 8, play(v) { for (const [t, d] of [[0, 0.35], [0.6, 0.18], [0.82, 0.3]]) v.tone(t, d, { freq: rnd(370, 400), to: 350, gain: 0.03, attack: 0.05, curve: 'lin' }); } },
  /** A frog's croak. */
  frog: { gap: 3, play(v) { for (let i = 0; i < 2; i++) v.tone(i * 0.18, 0.12, { freq: rnd(180, 240), to: 150, type: 'sawtooth', gain: 0.025, attack: 0.01, vib: { rate: 30, depth: 25 } }); } },
  /**
   * A voice across the street: a phrase or two of somebody talking (words
   * you can't quite make out) — a man's or a woman's, at their own pitch,
   * syllables run together into words, words into a phrase.
   */
  voice: {
    gap: 2.5, play(v) {
      const fem = Math.random() < 0.5;
      const f0 = fem ? rnd(185, 245) : rnd(100, 140);
      const V = 'aaeeiioou', C = ['', '', 's', 't', 'k', 'm', 't', ''];
      const syl = [];
      for (let w = 0, words = 2 + Math.floor(Math.random() * 5); w < words; w++) {
        for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
          syl.push({ d: rnd(0.08, 0.17), v: V[Math.floor(Math.random() * V.length)], c: C[Math.floor(Math.random() * C.length)], gap: i === n - 1 ? rnd(0.05, 0.16) : 0 });
        }
      }
      if (Math.random() < 0.2) syl[syl.length - 1].q = true;
      v.speech(0, syl, { f0, fem, gain: 0.16, far: rnd(1800, 2800) });
    },
  },
  /** Laughter across the square: ha-ha-ha, breathy, each a little lower. */
  laugh: {
    gap: 8, play(v) {
      const fem = Math.random() < 0.5;
      const f0 = fem ? rnd(230, 300) : rnd(125, 170);
      const syl = [];
      for (let i = 0, n = 3 + Math.floor(Math.random() * 3); i < n; i++) syl.push({ d: rnd(0.07, 0.1), v: 'a', c: 'h', gap: rnd(0.04, 0.07) });
      v.speech(0, syl, { f0, fem, gain: 0.15, far: 2600 });
    },
  },
  /** A cup or a bottle set down, a coin on a counter. */
  clink: { gap: 5, play(v) { for (let i = 0, n = 1 + Math.floor(Math.random() * 2); i < n; i++) v.ring(i * rnd(0.12, 0.3), rnd(2200, 3400), 0.22, 0.012, [1, 2.32, 4.1]); } },
  /**
   * A smith at the anvil: a few blows at a working pace (never on a beat) —
   * the hammer's crack and the anvil's bright ring round 1.5 kHz, gone in a
   * quarter of a second (as a recorded anvil is).
   */
  hammer: {
    gap: 12, play(v) {
      let t = 0;
      for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) {
        const f = rnd(1350, 1650) * (i % 2 ? 1 : 1.02);
        v.noise(t, 0.006, { type: 'highpass', freq: 3000, gain: 0.05, attack: 0.0004 });
        v.ring(t, f, 0.3, 0.018, [1, 2.76, 5.4, 8.9]);
        v.thump(t, { f0: 220, f1: 150, dur: 0.04, gain: 0.02 });
        t += rnd(0.55, 1.05);
      }
    },
  },
  /** A dog barking. */
  dog: { gap: 10, play(v) { for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) v.formant(i * rnd(0.28, 0.4), 0.12, { f1: 650, f2: 1300, to1: 450, to2: 1000, q: 4, gain: 0.4, attack: 0.008 }); } },
  /** A door across the way: the latch, a short creak, shut. */
  door: {
    gap: 8, play(v) {
      v.noise(0, 0.012, { freq: 2600, q: 3, gain: 0.04, attack: 0.0006 });
      v.creak(0.03, rnd(0.25, 0.5), { rate: rnd(60, 90), rate1: rnd(80, 120), freqs: [400, 650, 900], q: 7, gain: 0.03 });
      if (Math.random() < 0.6) { const t = rnd(0.7, 1.6); v.thump(t, { f0: 110, f1: 70, dur: 0.1, gain: 0.06 }); v.noise(t, 0.08, { type: 'lowpass', freq: 400, gain: 0.05 }); }
    },
  },
  /** A cart going by: wheels on the cobbles, a rumble and their clatter, and the creak of the axle. */
  cart: {
    gap: 25, play(v) {
      const dur = rnd(2.5, 4);
      v.noise(0, dur, { color: 'brown', type: 'lowpass', freq: 260, gain: 0.08, attack: dur * 0.45, curve: 'lin' });
      v.crackle(0.2, dur - 0.4, Math.round(dur * 9), { freq: 1100, gain: 0.025, q: 3 });
      v.creak(dur * 0.3, dur * 0.4, { rate: 30, rate1: 24, freqs: [260, 430, 700], q: 6, gain: 0.015 });
    },
  },
  /** A Sea King's moan, far down. */
  moan: { gap: 20, play(v) { v.formant(0, 2.5, { f1: 160, f2: 420, to1: 120, to2: 300, q: 5, gain: 0.12, attack: 0.8, color: 'brown' }); v.tone(0, 2.5, { freq: 55, to: 42, type: 'sawtooth', gain: 0.03, attack: 0.8, curve: 'lin' }); } },
  /** Whale song. */
  whale: { gap: 15, play(v) { v.tone(0, 2.2, { freq: rnd(260, 320), to: rnd(380, 480), glide: 1.2, gain: 0.025, attack: 0.5, curve: 'lin', vib: { rate: 4, depth: 6 } }); v.tone(1.2, 1.4, { freq: 450, to: 230, gain: 0.02, attack: 0.3, curve: 'lin' }); } },
  /** A drip into a pool, in a cave or a cell (or off the eaves after rain). */
  drip: { gap: 0.6, play(v) { v.bubble(0, { f: rnd(1300, 2200), rise: 1.6, dur: 0.05, gain: 0.035 }); } },
  /** Chains, far off (Impel Down). */
  chains: { gap: 6, play(v) { for (let i = 0; i < 6; i++) v.ring(i * rnd(0.05, 0.1), rnd(900, 1500), 0.15, 0.025, [1, 2.7]); } },
  /** Bubbles rising past you. */
  bubbles: { gap: 2, play(v) { v.bubbles(0, 0.6, 6, { f: 500, spread: 0.9, gain: 0.03 }); } },
  /** A burst of crackling embers. */
  embers: { gap: 2, play(v) { v.crackle(0, 0.5, 8, { freq: 2600, gain: 0.1 }); } },
  /**
   * A gust going by: the air rushing up and away over a few seconds (leaves
   * thrashing with it on land, the rigging singing at sea).
   */
  gust: {
    gap: 4, play(v, k) {
      const dur = rnd(1.8, 3.5);
      v.whoosh(0, dur, { f0: rnd(250, 350), f1: rnd(700, 1100), q: 0.7, gain: 0.07 * (k.s || 1), peak: rnd(0.35, 0.55), color: 'pink' });
      if (k.sea) v.tone(dur * 0.2, dur * 0.6, { freq: rnd(520, 880), to: rnd(600, 1000), gain: 0.004 * (k.s || 1), attack: dur * 0.25, curve: 'lin', vib: { rate: 5, depth: 12 } });
      else v.noise(dur * 0.15, dur * 0.7, { freq: 4000, q: 0.6, gain: 0.03 * (k.s || 1), attack: dur * 0.25, curve: 'lin' });
    },
  },
  /** A wave breaking on the shore: the surge, the crash, the hiss of it running back over the sand. */
  surf: {
    gap: 4, play(v, k) {
      const s = k.s || 1;
      v.noise(0, 1.6, { color: 'pink', type: 'lowpass', freq: 500, sweep: 1800, gain: 0.22 * s, attack: 1.1, curve: 'lin' });
      v.noise(1.1, 1.8, { color: 'pink', type: 'lowpass', freq: 2000, sweep: 600, gain: 0.26 * s, attack: 0.08 });
      v.noise(1.5, 2.2, { type: 'bandpass', freq: 2600, q: 0.5, gain: 0.03 * s, attack: 0.3, curve: 'lin' });
      v.crackle(1.8, 1.8, 10, { freq: 3600, gain: 0.012 * s, q: 3 });
    },
  },
};

export class Ambience {
  constructor(audio) {
    this.audio = audio;
    this.beds = {};
    this.rainBed = null;
    this.lastSpot = {};
  }

  /**
   * Bring each bed to its level (`levels`: name → 0..1; missing ones fade
   * out), the rain to `rain` ({ r, storm, where } or nothing), and roll the
   * dice for each spot (`spots`: name → how many a minute).
   */
  update(levels, spots, dt, sec = 1.2, rain = null) {
    const E = this.audio.E, t = E.now();
    for (const name of Object.keys(BEDS)) {
      const want = levels[name] || 0;
      let b = this.beds[name];
      if (!b && want > 0.005) b = this.beds[name] = new Bed(this.audio, name);
      if (!b) continue;
      b.set(want, t, sec);
      if (want > 0.005) b.tick(t);
      // (a bed silent for twenty seconds is taken apart)
      if (want <= 0.005) { if (!b.quietSince) b.quietSince = t; else if (t - b.quietSince > 20) { b.stop(); delete this.beds[name]; } }
      else b.quietSince = 0;
    }
    this.rain(rain, t, dt);
    for (const [name, perMin] of Object.entries(spots)) {
      if (!(perMin > 0)) continue;
      if (Math.random() < (perMin / 60) * dt) this.spot(name);
    }
  }

  /** The rain: made when it starts, set to how hard and on what, faded and taken apart when it's over. */
  rain(R, t, dt) {
    let b = this.rainBed;
    const want = R && R.r > 0.02 ? 1 : 0;
    if (!b && want) b = this.rainBed = new Rain(this.audio);
    if (!b) return;
    if (want) { b.set(R.r, R.storm || 0, R.where, t); b.quietSince = 0; }
    b.fade(want ? (R.level ?? 1) : 0, t, want ? 2.5 : 3);
    b.tick(t, dt);
    if (!want) { if (!b.quietSince) b.quietSince = t; else if (t - b.quietSince > 20) { b.stop(); this.rainBed = null; } }
  }

  /** How deep the sails' flutter is (0 drawing nicely … 1 luffing, flogging in the wind). */
  luff(k) {
    const b = this.beds.sails;
    if (b?.flapDepth) b.flapDepth.go(0.05 + 0.45 * k, this.audio.E.now(), 0.6);
  }

  /** Play a spot now: off to one side or the other, near or far (never two of a kind too close together). */
  spot(name, { vol = 1, pan = rnd(-0.8, 0.8), far = rnd(0, 1), s = 1, sea = false } = {}) {
    const E = this.audio.E, S = SPOTS[name], t = E.now();
    if (!S || t - (this.lastSpot[name] ?? -99) < S.gap * rnd(0.8, 1.3)) return;
    // (further off: quieter, duller, more of the room)
    const v = E.open('amb:' + name, { bus: 'amb', vol: vol * (1 - 0.45 * far), pan, lp: far > 0.4 ? 9500 - far * 5500 : 0, send: 0.05 + far * 0.25, prio: 2, max: 2 });
    if (!v) return;
    this.lastSpot[name] = t;
    v.pj = rnd(0.95, 1.05);
    S.play(v, { s, sea });
    v.end += v.tail || 0;
  }

  /** Stop every bed (the title's quiet, a page hidden). */
  silence() {
    const t = this.audio.E.now();
    for (const b of Object.values(this.beds)) b.set(0, t, 0.5);
    this.rainBed?.fade(0, t, 0.5);
  }
}
