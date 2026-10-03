// The world's ambience: beds — the sea's swell and wash, wind (and its howl in
// a storm), rain, Reverse Mountain's torrent, the deep under water, a town's
// murmur, insects, leaves, a fire's roar, the hull through the water and the
// wind in the sails — each a loop of noise through filters that wander on
// slow oscillators, so no two minutes sound alike; and spots — one-off sounds
// at random moments (a gull, a songbird, an owl, a frog, a voice in the
// street, a hammer on an anvil, a dog, a Sea King's moan, whale song, a drip).
//
// The foley director (foley.js) says how loud each bed should be and how
// often each spot should come; here they're made and faded (a bed nobody
// wants for a while is taken apart to save the CPU).
const rnd = (a, b) => a + Math.random() * (b - a);

// each bed: its layers [noise colour, filter type, frequency, Q, level], and
// slow wobbles on them [target ('f<i>' a layer's frequency, 'g<i>' its level), rate Hz, depth]
const BEDS = {
  ocean: { layers: [['pink', 'lowpass', 420, 0.6, 0.5], ['white', 'bandpass', 2400, 0.5, 0.09]], lfo: [['f0', 0.083, 260], ['g0', 0.137, 0.22], ['g1', 0.111, 0.06], ['f1', 0.07, 700]] },
  wind: { layers: [['pink', 'bandpass', 520, 0.8, 0.55]], lfo: [['f0', 0.07, 260], ['g0', 0.05, 0.25], ['g0', 0.17, 0.12]] },
  howl: { layers: [['white', 'bandpass', 1300, 14, 0.4], ['white', 'bandpass', 1900, 16, 0.25]], lfo: [['f0', 0.09, 260], ['f1', 0.13, 320], ['g0', 0.11, 0.2]] },
  rain: { layers: [['white', 'highpass', 2800, 0.5, 0.18], ['pink', 'lowpass', 650, 0.5, 0.35]], lfo: [['g1', 0.05, 0.08]] },
  torrent: { layers: [['brown', 'lowpass', 900, 0.5, 0.9], ['pink', 'bandpass', 1400, 0.6, 0.35], ['white', 'highpass', 3500, 0.5, 0.06]], lfo: [['g1', 0.3, 0.1], ['f0', 0.11, 200]] },
  deep: { layers: [['brown', 'lowpass', 220, 0.7, 0.9]], lfo: [['f0', 0.05, 80], ['g0', 0.08, 0.25]] },
  town: { layers: [['pink', 'bandpass', 520, 3, 0.9], ['pink', 'bandpass', 1150, 4, 0.65], ['pink', 'bandpass', 2400, 5, 0.3]], lfo: [['g0', 3.1, 0.45], ['g1', 4.7, 0.35], ['g2', 5.9, 0.15], ['f1', 0.4, 150]] },
  cicada: { layers: [['white', 'bandpass', 5400, 3, 0.18]], lfo: [['g0', 46, 0.17], ['g0', 0.2, 0.07]] },
  cricket: { layers: [['white', 'bandpass', 4600, 12, 0.3]], lfo: [['g0', 18, 0.2], ['g0', 0.6, 0.08]] },
  leaves: { layers: [['white', 'highpass', 2600, 0.5, 0.12]], lfo: [['g0', 0.19, 0.06], ['g0', 0.07, 0.04]] },
  fire: { layers: [['pink', 'lowpass', 800, 0.7, 0.5], ['white', 'highpass', 4000, 0.5, 0.05]], lfo: [['g0', 7, 0.12], ['g0', 0.3, 0.1]] },
  sky: { layers: [['white', 'bandpass', 3200, 0.4, 0.12], ['pink', 'bandpass', 700, 0.6, 0.2]], lfo: [['f0', 0.06, 900], ['g1', 0.09, 0.08]] },
  hull: { layers: [['pink', 'bandpass', 600, 0.7, 0.5], ['white', 'highpass', 3000, 0.5, 0.08]], lfo: [['g0', 0.21, 0.18], ['f0', 0.13, 150]] },
  sails: { layers: [['pink', 'lowpass', 320, 0.7, 0.6]], lfo: [['g0', 7, 0.0]] },
};

class Bed {
  constructor(A, name) {
    const E = A.E, c = E.ctx, D = BEDS[name];
    this.name = name;
    this.out = c.createGain(); this.out.gain.value = 0;
    this.out.connect(E.amb);
    this.nodes = [];
    this.layers = D.layers.map(([color, type, f, q, g]) => {
      const src = c.createBufferSource(); src.buffer = E.noiseBuf(color); src.loop = true;
      // (a random place in the loop, and a hair off the usual speed: two beds of one kind never line up)
      src.playbackRate.value = rnd(0.97, 1.03);
      const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const gn = c.createGain(); gn.gain.value = g;
      src.connect(flt); flt.connect(gn); gn.connect(this.out);
      src.start(0, Math.random() * 1.9);
      this.nodes.push(src);
      return { src, flt, gn };
    });
    for (const [tgt, rate, depth] of D.lfo) {
      const L = this.layers[Number(tgt.slice(1))];
      const o = c.createOscillator(), og = c.createGain();
      o.frequency.value = rate * rnd(0.85, 1.15); og.gain.value = depth;
      o.connect(og); og.connect(tgt[0] === 'f' ? L.flt.frequency : L.gn.gain);
      o.start(0);
      this.nodes.push(o);
      if (name === 'sails' && tgt === 'g0') this.flap = og; // (the canvas's flutter: deeper when she's luffing)
    }
    this.level = 0;
    this.quietSince = 0;
  }

  set(level, t, sec) {
    if (Math.abs(level - this.level) < 0.002) return;
    this.level = level;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level, t + sec);
  }

  stop() {
    for (const n of this.nodes) { try { n.stop(); } catch { /* not started */ } }
    try { this.out.disconnect(); } catch { /* gone */ }
  }
}

// the spots: one-off sounds, each drawn into a voice `v` on the ambience bus
const SPOTS = {
  /** A gull's "kyow-kyow" (two or three calls, falling). */
  gull(v) {
    const n = 1 + Math.floor(Math.random() * 3), f = rnd(1300, 1700);
    for (let i = 0; i < n; i++) {
      const t = i * rnd(0.22, 0.3);
      v.tone(t, 0.2, { freq: f * 1.25, to: f * 0.8, glide: 0.16, type: 'sawtooth', gain: 0.012, attack: 0.02 });
      v.tone(t, 0.2, { freq: f * 0.62, to: f * 0.4, glide: 0.16, type: 'triangle', gain: 0.02, attack: 0.02 });
    }
  },
  /** A songbird: a short phrase of chirps and trills. */
  bird(v) {
    const n = 2 + Math.floor(Math.random() * 5), base = rnd(2600, 4200);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const up = Math.random() < 0.5, d = rnd(0.04, 0.11);
      v.chirp(t, { f0: base * (up ? 0.8 : 1.2), f1: base * (up ? 1.25 : 0.75), dur: d, gain: rnd(0.02, 0.04), warble: Math.random() < 0.3 ? rnd(30, 60) : 0 });
      t += d + rnd(0.02, 0.12);
    }
  },
  /** A jungle bird's whooping call. */
  tropical(v) {
    const f = rnd(900, 1500);
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) v.chirp(i * 0.25, { f0: f, f1: f * 1.6, dur: 0.18, gain: 0.03, warble: 8 });
  },
  /** An owl: hoo... hoo-hoo. */
  owl(v) { for (const [t, d] of [[0, 0.35], [0.6, 0.18], [0.82, 0.3]]) v.tone(t, d, { freq: rnd(370, 400), to: 350, gain: 0.03, attack: 0.05, curve: 'lin' }); },
  /** A frog's croak. */
  frog(v) { for (let i = 0; i < 2; i++) v.tone(i * 0.18, 0.12, { freq: rnd(180, 240), to: 150, type: 'sawtooth', gain: 0.03, attack: 0.01, vib: { rate: 30, depth: 25 } }); },
  /** A voice in the street: a few syllables, the vowel sliding. */
  voice(v) {
    let t = 0;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 4); i++) {
      const d = rnd(0.08, 0.2), f1 = rnd(350, 750), f2 = rnd(900, 2000);
      v.formant(t, d, { f1, f2, to1: f1 * rnd(0.8, 1.2), to2: f2 * rnd(0.8, 1.2), q: 6, gain: 0.45, attack: 0.02 });
      t += d + rnd(0.02, 0.1);
    }
  },
  /** Laughter across the square: ha-ha-ha. */
  laugh(v) { for (let i = 0; i < 4; i++) v.formant(i * 0.13, 0.09, { f1: 750, f2: 1250, q: 5, gain: 0.35 * (1 - i * 0.15), attack: 0.01 }); },
  /** A hammer on an anvil (or a cooper at a barrel). */
  clink(v) { for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) v.ring(i * rnd(0.35, 0.5), rnd(1200, 1700), 0.25, 0.02, [1, 2.4, 3.9]); },
  /** A dog barking. */
  dog(v) { for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) v.formant(i * 0.32, 0.12, { f1: 650, f2: 1300, to1: 450, to2: 1000, q: 4, gain: 0.5, attack: 0.008 }); },
  /** A Sea King's moan, far down. */
  moan(v) { v.formant(0, 2.5, { f1: 160, f2: 420, to1: 120, to2: 300, q: 5, gain: 0.12, attack: 0.8, color: 'brown' }); v.tone(0, 2.5, { freq: 55, to: 42, type: 'sawtooth', gain: 0.03, attack: 0.8, curve: 'lin' }); },
  /** Whale song. */
  whale(v) { v.tone(0, 2.2, { freq: rnd(260, 320), to: rnd(380, 480), glide: 1.2, gain: 0.025, attack: 0.5, curve: 'lin', vib: { rate: 4, depth: 6 } }); v.tone(1.2, 1.4, { freq: 450, to: 230, gain: 0.02, attack: 0.3, curve: 'lin' }); },
  /** A drip into a pool, in a cave or a cell. */
  drip(v) { v.bubble(0, { f: rnd(1300, 2200), rise: 1.6, dur: 0.05, gain: 0.04 }); },
  /** Chains, far off (Impel Down). */
  chains(v) { for (let i = 0; i < 6; i++) v.ring(i * rnd(0.05, 0.1), rnd(900, 1500), 0.15, 0.025, [1, 2.7]); },
  /** Bubbles rising past you. */
  bubbles(v) { v.bubbles(0, 0.6, 6, { f: 500, spread: 0.9, gain: 0.03 }); },
  /** A burst of crackling embers. */
  embers(v) { v.crackle(0, 0.5, 8, { freq: 2600, gain: 0.12 }); },
  /** Rain drops on something near: a few patters. */
  drops(v) { v.crackle(0, 0.4, 6, { freq: 3500, gain: 0.09, q: 3 }); },
  /** A wave breaking on the shore: the surge, the crash, the hiss of it running back. */
  surf(v, k) {
    const s = k.s || 1;
    v.noise(0, 1.6, { color: 'pink', type: 'lowpass', freq: 500, sweep: 2200, gain: 0.25 * s, attack: 1.1, curve: 'lin' });
    v.noise(1.1, 1.8, { color: 'pink', type: 'lowpass', freq: 2400, sweep: 600, gain: 0.3 * s, attack: 0.08 });
    v.noise(1.6, 2.4, { type: 'highpass', freq: 3500, gain: 0.07 * s, attack: 0.3, curve: 'lin' });
    v.crackle(1.8, 1.8, 10, { freq: 4500, gain: 0.015 * s, q: 3 });
  },
};

export class Ambience {
  constructor(audio) {
    this.audio = audio;
    this.beds = {};
    this.next = {};
  }

  /**
   * Bring each bed to its level (`levels`: name → 0..1; missing ones fade out)
   * and roll the dice for each spot (`spots`: name → how many a minute).
   */
  update(levels, spots, dt, sec = 1.2) {
    const E = this.audio.E, t = E.now();
    for (const name of Object.keys(BEDS)) {
      const want = levels[name] || 0;
      let b = this.beds[name];
      if (!b && want > 0.005) b = this.beds[name] = new Bed(this.audio, name);
      if (!b) continue;
      b.set(want, t, sec);
      // (a bed silent for twenty seconds is taken apart)
      if (want <= 0.005) { if (!b.quietSince) b.quietSince = t; else if (t - b.quietSince > 20) { b.stop(); delete this.beds[name]; } }
      else b.quietSince = 0;
    }
    for (const [name, perMin] of Object.entries(spots)) {
      if (!(perMin > 0)) continue;
      if (Math.random() < (perMin / 60) * dt) this.spot(name);
    }
  }

  /** How deep the sails' flutter is (0 drawing nicely … 1 luffing, flogging in the wind). */
  luff(k) {
    const b = this.beds.sails;
    if (b?.flap) { const g = b.flap.gain, t = this.audio.E.now(); g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.1 + 0.45 * k, t + 0.5); }
  }

  /** Play a spot now: off to one side or the other, a little far away. */
  spot(name, { vol = 1, pan = rnd(-0.8, 0.8), far = rnd(0, 1), s = 1 } = {}) {
    const E = this.audio.E;
    const v = E.open('amb:' + name, { bus: 'amb', vol, pan, lp: far > 0.5 ? 9000 - far * 5000 : 0, send: 0.05 + far * 0.25, prio: 2, max: 2 });
    if (!v) return;
    v.pj = rnd(0.95, 1.05);
    SPOTS[name]?.(v, { s });
    v.end += v.tail || 0;
  }

  /** Stop every bed (the title's quiet, a page hidden). */
  silence() { for (const b of Object.values(this.beds)) b.set(0, this.audio.E.now(), 0.5); }
}
