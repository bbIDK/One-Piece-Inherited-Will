// The music: calm, generative pieces in the spirit of a Minecraft soundtrack
// with a One Piece heart — a reverb-soaked piano, soft pads, and a flute,
// accordion or music-box melody in lilting sea-shanty rhythms. Each piece is
// composed on the spot from a theme (key, mode, chords, feel, instruments:
// see themes.js) — a motif stated, answered, varied and brought back — and
// plays for a minute or two; then there is quiet before the next.
//
// A piece plays on a Deck: its own bus, split into stems (pad, bass, arp,
// lead, two of percussion, brass stabs and a boss layer), so a fight's music
// can bring its layers in as it heats up and two decks can crossfade from
// one place's music to the next. The director (director.js) decides what
// plays; this file only knows how to play it.

// ------------------------------------------------------------------ composing
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
  // (the desert's and Dressrosa's: a phrygian with a bright third)
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  // the pentatonics: Wano's in-scale, the yo-scale of a folk song, a plain major
  in: [0, 1, 5, 7, 8], yo: [0, 2, 5, 7, 9], penta: [0, 2, 4, 7, 9],
};
// rhythms for a two-bar motif, in eighths (negative = a rest)
const RHYTHMS = {
  straight: [[2, 2, 4, 2, 2, 4], [3, 1, 2, 2, 4, -4], [2, 2, 2, 2, 6, -2], [1, 1, 2, 4, 2, 2, 4], [4, 2, 2, 8]],
  lilt: [[3, 3, 2, 1, 3], [2, 1, 2, 1, 6], [3, 2, 1, 3, -3], [2, 1, 3, 2, 1, 3], [1, 1, 1, 3, 6]],
};
// arpeggio patterns: indices into [root, third, fifth, root+8ve, third+8ve, fifth+8ve]
const ARPS = {
  straight: [[0, 2, 3, 2, 4, 2, 3, 2], [0, 2, 4, 5, 4, 2, 3, 2], [0, null, 2, null, 3, null, 2, null]],
  lilt: [[0, 2, 3, 0, 2, 3], [0, 3, 4, 2, 3, 4], [0, null, 2, 3, null, 2]],
};

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

/** A two-bar motif: mostly stepwise, the odd leap, ending on a chord tone. */
function motif(T) {
  const rh = pick(RHYTHMS[T.feel]);
  const notes = [];
  let deg = pick([0, 2, 4, 4, 2]);
  rh.forEach((len, i) => {
    if (len < 0) { notes.push({ len, deg }); return; }
    if (i > 0) {
      const r = Math.random();
      deg += r < 0.34 ? 1 : r < 0.62 ? -1 : r < 0.78 ? 2 : r < 0.9 ? -2 : r < 0.95 ? 3 : -3;
      deg = Math.max(-2, Math.min(9, deg));
    }
    // the long last note settles on a chord tone
    if (i === rh.length - 1) deg = [0, 2, 4, 7].reduce((b, x) => (Math.abs(x - deg) < Math.abs(b - deg) ? x : b), 0);
    notes.push({ len, deg });
  });
  return notes;
}

/** Vary a motif: the same rhythm, its tail nudged. */
function vary(m) {
  return m.map((n, i) => (i >= m.length - 2 && n.len > 0 ? { ...n, deg: n.deg + pick([-1, 1, 2, 0]) } : n));
}

/**
 * Compose a piece for a theme: its chords, a motif and its answers, the form.
 * `key` fixes the key (a fight's next piece stays in the key it began in).
 */
export function compose(T, key = null) {
  const mode = MODES[T.mode] || MODES.ionian;
  const perBar = T.feel === 'lilt' ? 6 : 8;
  const eighth = T.feel === 'lilt' ? 60 / (T.bpm * 3) : 60 / (T.bpm * 2);
  const prog = pick(T.prog);
  const chords = prog.map((r) => [r, r + 2, r + 4]);
  const k = key ?? T.key + pick(T.shifts || [0, 0, 0, 2, -2, 5]);
  const n = mode.length;
  const midi = (d, oct) => {
    const o = Math.floor(d / n), i = ((d % n) + n) % n;
    return k + 12 + mode[i] + 12 * (o + oct);
  };
  const A = motif(T), B = motif(T), C = motif(T);
  const rest = null;
  // A A' B A — then maybe C B' A, with a bar or two of breathing room
  const form = [A, vary(A), B, A, Math.random() < T.melody ? C : rest, vary(B), A, rest];
  const phrases = form.map((m) => (m && Math.random() < T.melody + 0.2 ? m : null));
  phrases[0] = A;
  const bars = 2 * Math.round((T.bars[0] + Math.random() * (T.bars[1] - T.bars[0])) / 2);
  return { T, key: k, n, chords, midi, perBar, eighth, barDur: eighth * perBar, bars, phrases, arpPat: pick(ARPS[T.feel]) };
}

// the stems every deck has (the director fades them by intensity)
export const STEMS = ['pad', 'bass', 'arp', 'lead', 'perc', 'perc2', 'brass', 'boss'];

// ------------------------------------------------------------------ playing
export class Music {
  constructor(E) {
    this.E = E;
    this.ctx = E.ctx;
  }

  /** One note on an instrument into `bus` (a deck's stem). */
  inst(kind, t, dur, midi, vol, bus, o = {}) {
    const c = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = c.createGain();
    g.connect(bus);
    const osc = (type, freq, gain = 1, detune = 0) => {
      const n = c.createOscillator(); n.type = type; n.frequency.value = freq; n.detune.value = detune;
      if (gain !== 1) { const og = c.createGain(); og.gain.value = gain; n.connect(og); return [n, og]; }
      return [n, n];
    };
    const out = [];
    let end = t + dur;
    if (kind === 'piano' || kind === 'pluck' || kind === 'musicbox') {
      // struck: a bright attack mellowing as it rings
      const decay = kind === 'pluck' ? Math.min(1.6, dur + 0.5) : kind === 'musicbox' ? 1.8 : Math.max(0.9, Math.min(3.4, 3.6 - (midi - 48) * 0.05));
      end = t + decay + 0.05;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(kind === 'musicbox' ? 6000 : kind === 'pluck' ? 3200 : 2600, t);
      lp.frequency.exponentialRampToValueAtTime(kind === 'pluck' ? 700 : 900, t + decay * 0.6);
      lp.connect(g);
      if (kind === 'musicbox') { out.push(osc('sine', f * 2, 1), osc('sine', f * 4, 0.25), osc('sine', f * 6.01, 0.08)); }
      else if (kind === 'pluck') { out.push(osc('triangle', f, 1), osc('sine', f * 2, 0.35), osc('sawtooth', f, 0.05)); }
      else { out.push(osc('triangle', f, 1, -3), osc('sine', f, 0.7, 4), osc('sine', f * 2, 0.22), osc('sine', f * 3, 0.06)); }
      for (const [, node] of out) node.connect(lp);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    } else if (kind === 'pad' || kind === 'strings' || kind === 'choir') {
      // held: a slow swell (strings a fuller ensemble, the choir an "aah")
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'pad' ? 850 : kind === 'strings' ? 2000 : 1600; lp.Q.value = 0.3;
      if (kind === 'choir') {
        for (const [fr, q] of [[700, 5], [1150, 6]]) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q; lp.connect(bp); bp.connect(g); }
        const dry = c.createGain(); dry.gain.value = 0.25; lp.connect(dry); dry.connect(g);
      } else lp.connect(g);
      if (kind === 'pad') out.push(osc('sawtooth', f, 0.5, -7), osc('sawtooth', f, 0.5, 7), osc('triangle', f / 2, 0.4));
      else if (kind === 'strings') out.push(osc('sawtooth', f, 0.4, -10), osc('sawtooth', f, 0.4, 0), osc('sawtooth', f, 0.4, 11));
      else out.push(osc('sawtooth', f, 0.6, -6), osc('sawtooth', f, 0.6, 6));
      for (const [, node] of out) node.connect(lp);
      const att = Math.min(kind === 'pad' ? 1.4 : 0.6, dur * 0.4);
      end = t + dur + (kind === 'pad' ? 1.6 : 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + att);
      g.gain.setValueAtTime(vol, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
    } else if (STRUCK[kind]) {
      end = this.struck(kind, t, dur, f, vol, g, osc, out, bus);
    } else {
      end = this.blown(kind, t, dur, f, vol, g, osc, out, bus, o);
    }
    for (const [n] of out) { n.start(t); n.stop(end + 0.05); }
  }

  /** The new struck and plucked voices: marimba, steel pan, harp, celesta, koto, guitar, oud, bass, bell. */
  struck(kind, t, dur, f, vol, g, osc, out, bus) {
    const c = this.ctx, S = STRUCK[kind];
    const decay = S.decay(dur, f);
    const end = t + decay + 0.05;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(S.bright, t);
    lp.frequency.exponentialRampToValueAtTime(S.dull, t + decay * 0.6);
    if (S.body) { const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = S.body; pk.Q.value = 1.2; pk.gain.value = 6; lp.connect(pk); pk.connect(g); } else lp.connect(g);
    for (const [type, m, gain] of S.parts) out.push(osc(type, f * m, gain));
    for (const [n, node] of out) {
      node.connect(lp);
      // (a koto's or an oud's string bends down into tune as it's plucked)
      if (S.bend) { n.frequency.setValueAtTime(n.frequency.value * S.bend, t); n.frequency.exponentialRampToValueAtTime(n.frequency.value, t + 0.04); }
    }
    if (S.click) {
      // the mallet (or the plectrum) itself
      const src = c.createBufferSource(); src.buffer = this.E.white;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = S.click; bp.Q.value = 1.5;
      const cg = c.createGain(); cg.gain.setValueAtTime(vol * 0.35, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
      src.connect(bp); bp.connect(cg); cg.connect(g); src.start(t, Math.random()); src.stop(t + 0.02);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(vol * S.sustain, t + Math.min(0.25, decay * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    if (S.trem) {
      // (a mandolin's tremolo: the note picked again and again)
      const lfo = c.createOscillator(), lg = c.createGain(), tg = c.createGain();
      lfo.type = 'triangle'; lfo.frequency.value = S.trem; lg.gain.value = 0.45; tg.gain.value = 0.55;
      lfo.connect(lg); lg.connect(tg.gain);
      g.disconnect(); g.connect(tg); tg.connect(bus);
      lfo.start(t); lfo.stop(end);
    }
    return end;
  }

  /** Blown, bowed and squeezed voices: flute, accordion, whistle, shakuhachi, fiddle, erhu, horn, brass, organ, calliope, sax. */
  blown(kind, t, dur, f, vol, g, osc, out, bus, o) {
    const c = this.ctx;
    const B = BLOWN[kind] || BLOWN.accordion;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = B.lp;
    if (B.formant) { const bp = c.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = B.formant; bp.Q.value = 1.4; bp.gain.value = 8; lp.connect(bp); bp.connect(g); } else lp.connect(g);
    for (const [type, m, gain, det] of B.parts) out.push(osc(type, f * m, gain, det || 0));
    for (const [, node] of out) node.connect(lp);
    if (B.lpEnv) {
      // brass: the tone opens as the breath builds
      lp.frequency.setValueAtTime(B.lpEnv[0], t);
      lp.frequency.exponentialRampToValueAtTime(B.lpEnv[1], t + B.lpEnv[2]);
      lp.frequency.exponentialRampToValueAtTime(B.lp, t + B.lpEnv[2] + 0.2);
    }
    // a slide into the note (the shakuhachi's meri, the erhu gliding from the last one)
    if (B.slide || (B.glide && o.from)) {
      const from = B.glide && o.from ? o.from / f : B.slide;
      for (const [n] of out) { const v = n.frequency.value; n.frequency.setValueAtTime(v * from, t); n.frequency.exponentialRampToValueAtTime(v, t + (B.glide ? 0.08 : 0.12)); }
    }
    // vibrato that blooms after the attack
    const lfo = c.createOscillator(); lfo.frequency.value = B.vib[0];
    const lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * B.vib[1], t + (B.vib[2] ?? 0.35));
    lfo.connect(lg);
    for (const [n] of out) lg.connect(n.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.6);
    const att = B.att;
    const end = t + dur + B.rel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol * 0.85, t + Math.max(att + 0.01, dur * 0.8));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    if (B.breath) {
      // breath: at the start of each note (all the way through, for a shakuhachi)
      const src = c.createBufferSource(); src.buffer = this.E.white; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
      const bg = c.createGain();
      const len = B.breathHold ? dur : 0.12;
      bg.gain.setValueAtTime(vol * B.breath, t); bg.gain.exponentialRampToValueAtTime(vol * B.breath * (B.breathHold ? 0.5 : 0.001), t + len);
      if (B.breathHold) bg.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.2);
      src.connect(bp); bp.connect(bg); bg.connect(bus); src.start(t, Math.random()); src.stop(t + len + 0.25);
    }
    return end;
  }

  /** A drum hit into `bus`: `kind` kick (more taiko than techno), snare, hat, tom, taiko, timp(ani), crash, shaker, block. */
  drum(t, kind, bus, vol = 1, midi = 40) {
    const c = this.ctx;
    const tone = (f0, f1, dur, gain, type = 'sine') => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
      g.gain.setValueAtTime(gain * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
    };
    const hiss = (type, freq, dur, gain, q = 1) => {
      const src = c.createBufferSource(); src.buffer = this.E.white;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(gain * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(bus); src.start(t, Math.random()); src.stop(t + dur + 0.02);
    };
    switch (kind) {
      case 'kick': tone(95, 42, 0.3, 0.32); break;
      case 'snare': hiss('bandpass', 1500, 0.14, 0.1); break;
      case 'hat': hiss('highpass', 7500, 0.035, 0.025); break;
      case 'tom': tone(170, 95, 0.22, 0.22); hiss('bandpass', 900, 0.06, 0.04); break;
      case 'taiko': tone(78, 46, 0.5, 0.38); hiss('lowpass', 300, 0.12, 0.12); break;
      case 'timp': { const f = 440 * Math.pow(2, (midi - 69) / 12); tone(f * 1.02, f, 0.9, 0.22); tone(f * 2, f * 2, 0.5, 0.05); hiss('lowpass', 200, 0.08, 0.08); break; }
      case 'crash': hiss('highpass', 5000, 1.3, 0.05); hiss('bandpass', 9000, 0.6, 0.03, 0.8); break;
      case 'shaker': hiss('highpass', 6500, 0.04, 0.03); break;
      case 'block': hiss('bandpass', 1900, 0.03, 0.09, 4); tone(900, 850, 0.03, 0.04); break;
      default: hiss('bandpass', 1500, 0.14, 0.1);
    }
  }
}

// struck and plucked voices: partials [type, multiple, level], how they decay, how bright
const STRUCK = {
  marimba: { parts: [['sine', 1, 1], ['sine', 4, 0.25], ['sine', 10, 0.03]], decay: (d, f) => Math.min(0.9, 0.25 + 160 / f), bright: 5000, dull: 1500, sustain: 0.3, click: 2800 },
  steel: { parts: [['sine', 1, 1], ['sine', 2, 0.55], ['sine', 3.01, 0.2], ['sine', 4.02, 0.06]], decay: () => 1.1, bright: 6000, dull: 1800, sustain: 0.45, click: 4000 },
  harp: { parts: [['triangle', 1, 1], ['sine', 2, 0.3], ['sine', 3, 0.08]], decay: (d) => Math.max(1.6, Math.min(2.8, d + 1.6)), bright: 3500, dull: 900, sustain: 0.5 },
  celesta: { parts: [['sine', 2, 1], ['sine', 4, 0.15], ['sine', 8.02, 0.03]], decay: () => 1.4, bright: 5000, dull: 2000, sustain: 0.4 },
  koto: { parts: [['triangle', 1, 1], ['sawtooth', 1, 0.25], ['sine', 3, 0.1]], decay: () => 1.4, bright: 4000, dull: 1100, sustain: 0.35, bend: 1.018, click: 3500 },
  guitar: { parts: [['triangle', 1, 1], ['sine', 2, 0.4], ['sawtooth', 1, 0.08]], decay: (d) => Math.min(1.9, d + 0.9), bright: 2800, dull: 800, sustain: 0.4, body: 220 },
  oud: { parts: [['sawtooth', 1, 0.45], ['triangle', 1, 0.8]], decay: () => 1.2, bright: 2500, dull: 700, sustain: 0.35, bend: 1.012, body: 900 },
  bass: { parts: [['sine', 1, 1], ['triangle', 1, 0.5]], decay: (d) => Math.min(0.9, d + 0.3), bright: 900, dull: 400, sustain: 0.5 },
  bell: { parts: [['sine', 2, 1], ['sine', 5.4, 0.2], ['sine', 2.76 * 2, 0.15]], decay: () => 2, bright: 7000, dull: 2500, sustain: 0.5 },
  mandolin: { parts: [['triangle', 1, 1], ['sawtooth', 1, 0.35]], decay: (d) => Math.min(1.2, d + 0.2), bright: 3200, dull: 1200, sustain: 0.6, trem: 11 },
  synth: { parts: [['square', 1, 0.35], ['sawtooth', 1.005, 0.35]], decay: (d) => Math.min(0.7, d + 0.15), bright: 2400, dull: 700, sustain: 0.4 },
};
// blown, bowed and squeezed voices: partials [type, multiple, level, detune], lowpass, attack, release, vibrato [rate, depth, delay]
const BLOWN = {
  flute: { parts: [['sine', 1, 1], ['triangle', 1, 0.18], ['sine', 2, 0.08]], lp: 3000, att: 0.07, rel: 0.35, vib: [5.2, 0.006], breath: 0.35 },
  accordion: { parts: [['square', 1, 0.35, -5], ['sawtooth', 1, 0.3, 5], ['square', 2, 0.08]], lp: 1700, att: 0.04, rel: 0.35, vib: [6, 0.003] },
  whistle: { parts: [['sine', 1, 1], ['triangle', 1, 0.25], ['sine', 2, 0.12]], lp: 4500, att: 0.04, rel: 0.25, vib: [5.6, 0.008, 0.25], breath: 0.5 },
  shakuhachi: { parts: [['sine', 1, 1], ['triangle', 1, 0.15]], lp: 2400, att: 0.09, rel: 0.4, vib: [4.5, 0.01, 0.4], breath: 0.6, breathHold: true, slide: 0.965 },
  fiddle: { parts: [['sawtooth', 1, 0.5], ['sawtooth', 1, 0.3, 6]], lp: 2600, att: 0.07, rel: 0.25, vib: [5.5, 0.006, 0.2], formant: 950 },
  erhu: { parts: [['sawtooth', 1, 0.5], ['triangle', 1, 0.5]], lp: 2200, att: 0.08, rel: 0.3, vib: [5.8, 0.009, 0.15], formant: 1500, glide: true },
  horn: { parts: [['sawtooth', 1, 0.6], ['sawtooth', 1, 0.4, 3]], lp: 1200, lpEnv: [500, 1600, 0.12], att: 0.06, rel: 0.3, vib: [5, 0.003, 0.4] },
  brass: { parts: [['sawtooth', 1, 0.6, -8], ['sawtooth', 1, 0.6, 8]], lp: 1400, lpEnv: [300, 3200, 0.03], att: 0.012, rel: 0.12, vib: [5, 0.002] },
  organ: { parts: [['sine', 1, 1], ['sine', 2, 0.5], ['sine', 3, 0.25], ['sine', 4, 0.12], ['square', 0.5, 0.05]], lp: 3000, att: 0.02, rel: 0.12, vib: [6.5, 0.0025, 0.05] },
  calliope: { parts: [['sine', 1, 1], ['sine', 2, 0.3], ['triangle', 1, 0.2]], lp: 3500, att: 0.03, rel: 0.15, vib: [6.2, 0.012, 0.05], breath: 0.4 },
  sax: { parts: [['sawtooth', 1, 0.7], ['square', 1, 0.15]], lp: 2600, att: 0.05, rel: 0.25, vib: [5, 0.006, 0.3], formant: 1100, breath: 0.3 },
};
export const INSTRUMENTS = ['piano', 'pluck', 'musicbox', 'pad', 'strings', 'choir', ...Object.keys(STRUCK), ...Object.keys(BLOWN)];

// ------------------------------------------------------------------ a deck
/**
 * One piece playing: its own bus (fades in, crossfades out), split into stems.
 * `loop`: when the piece ends another begins at once in the same key (a
 * fight's music never stops for breath). `T` the theme, `at` when it starts.
 */
export class Deck {
  constructor(mu, T, { at, fade = 1.2, level = 2.2, loop = false, key = null, stems = null } = {}) {
    this.mu = mu;
    this.T = T;
    this.loop = loop;
    const c = mu.ctx;
    this.S = compose(T, key);
    this.bus = c.createGain();
    this.bus.gain.setValueAtTime(0.0001, at);
    this.bus.gain.linearRampToValueAtTime(level, at + fade);
    this.bus.connect(mu.E.music);
    this.bus.connect(mu.E.hall);
    this.level = level;
    this.fadeIn = { at, fade };
    this.stems = {};
    this.stemTo = {};
    for (const s of STEMS) {
      const g = c.createGain();
      g.gain.value = this.stemTo[s] = stems ? stems[s] ?? 1 : 1;
      g.connect(this.bus);
      this.stems[s] = g;
    }
    this.t0 = at + 0.15;
    this.t = this.t0;
    this.bar = 0;
    this.pieces = 1;
    this.ended = false;
    this.stopAt = Infinity;
  }

  get barDur() { return this.S.barDur; }
  get beat() { return this.S.eighth * (this.S.perBar === 6 ? 3 : 2); }
  /** When the next bar line comes (at least `lead` seconds from `now`). */
  nextBar(now, lead = 0.05) {
    if (this.t0 > now + lead) return this.t0;
    const k = Math.ceil((now + lead - this.t0) / this.barDur);
    return this.t0 + k * this.barDur;
  }
  /** When the next beat comes. */
  nextBeat(now, lead = 0.04) {
    if (this.t0 > now + lead) return this.t0;
    const b = this.beat, k = Math.ceil((now + lead - this.t0) / b);
    return this.t0 + k * b;
  }

  /** Schedule what's due in the next half second. False once the piece has run out. */
  schedule(now) {
    if (this.ended) return false;
    // (fallen behind — a tab in the background — skip ahead rather than bunch the notes up)
    if (this.t < now - 0.25) {
      const skip = Math.ceil((now - this.t) / this.barDur);
      this.t += skip * this.barDur; this.bar += skip;
    }
    while (this.t < now + 0.5 && this.t < this.stopAt) {
      if (this.bar >= this.S.bars) {
        if (!this.loop) { this.ended = true; return false; }
        // a new piece straight on, in the same key
        this.S = compose(this.T, this.S.key);
        this.bar = 0;
        this.pieces++;
      }
      this.playBar(this.bar, this.t);
      this.t += this.S.barDur;
      this.bar++;
    }
    return true;
  }

  /** The bus's level at `time`, as its fade in left it (a ramp always starts from a known point). */
  levelAt(time) {
    const f = this.fadeIn;
    if (time >= f.at + f.fade) return this.level;
    if (time <= f.at) return 0.0001;
    return 0.0001 + (this.level - 0.0001) * (time - f.at) / f.fade;
  }

  /** Fade the deck out from `at` over `sec`, then let it go. */
  fadeOut(at, sec) {
    const g = this.bus.gain, c = this.mu.ctx, now = c.currentTime;
    at = Math.max(at, now);
    // (already on its way out sooner than this)
    if (this.fading && this.stopAt <= at + sec) return;
    const v0 = this.fading ? Math.max(0.0001, g.value) : this.levelAt(at);
    g.cancelScheduledValues(at);
    g.setValueAtTime(v0, at);
    g.linearRampToValueAtTime(0.0001, at + sec);
    this.stopAt = Math.min(this.stopAt, at + sec);
    this.fading = true;
    const bus = this.bus;
    setTimeout(() => { try { bus.disconnect(); } catch { /* gone */ } }, (at - now + sec + 6) * 1000);
  }

  /** Bring the stems to these levels (0..1), over `sec` from `at`. */
  setStems(levels, at, sec = 0.6) {
    this.stemAt = this.stemAt || {};
    this.stemFrom = this.stemFrom || {};
    for (const [s, v] of Object.entries(levels)) {
      const g = this.stems[s];
      if (!g || Math.abs(this.stemTo[s] - v) < 0.01) continue;
      // (from where the last change left it — changes come a bar or more apart —
      // or, changed again for the same moment, from where it was before that)
      const again = at <= (this.stemAt[s] ?? -1) + 0.001;
      const from = again ? this.stemFrom[s] : this.stemTo[s];
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(from, at);
      g.gain.linearRampToValueAtTime(v, at + sec);
      this.stemFrom[s] = from; this.stemAt[s] = at; this.stemTo[s] = v;
    }
  }

  /** A closing chord on the next bar line (a fight resolving), the deck fading under it. */
  cadence(at) {
    const S = this.S, T = this.T, mu = this.mu;
    for (const d of S.chords[0]) {
      mu.inst(T.battle ? 'brass' : T.arp || 'piano', at, S.barDur * 0.9, S.midi(d, -1), 0.05, this.stems.lead);
      mu.inst('strings', at, S.barDur * 1.5, S.midi(d, 0), 0.02, this.stems.pad);
    }
    mu.drum(at, 'crash', this.stems.perc2, 1);
    mu.drum(at, 'taiko', this.stems.perc, 1);
    this.stopAt = at;
  }

  playBar(bar, t0) {
    const mu = this.mu, S = this.S, T = S.T, e = S.eighth, n = S.perBar, st = this.stems;
    const chord = S.chords[bar % S.chords.length];
    const last = bar >= S.bars - 2 && !this.loop;
    // pad: the chord, swelling slowly
    if (T.pad) for (const d of chord) mu.inst(T.padInst || 'pad', t0, S.barDur * 1.05, S.midi(d, -1), T.padVol ?? 0.018, st.pad);
    // bass / left hand: the root on the downbeat (a fight's bass drives in eighths)
    if (T.bassPat) {
      for (let i = 0; i < n; i++) if (T.bassPat[i % T.bassPat.length]) mu.inst(T.bassInst || 'pluck', t0 + i * e, e * 0.9, S.midi(chord[0], -2) + (T.bassPat[i % T.bassPat.length] === 2 ? 12 : 0), T.bassVol ?? 0.07, st.bass);
    } else if (T.bass) mu.inst(T.bass, t0, e * n * 0.9, S.midi(chord[0], -2), T.bassVol ?? 0.09, st.bass);
    // arpeggio
    if (T.arp) {
      const pat = S.arpPat;
      for (let i = 0; i < n; i++) {
        const k = pat[i % pat.length];
        if (k === null || (i > 0 && Math.random() > T.arpDensity)) continue;
        const d = k < 3 ? chord[k] : chord[k - 3] + S.n;
        mu.inst(T.arp, t0 + i * e * (T.feel === 'lilt' && i % 3 === 2 ? 1.04 : 1), e * 3, S.midi(d, T.arpOct ?? -1), (i === 0 ? 0.085 : 0.06) * (T.arpVol ?? 1), st.arp);
      }
    }
    // melody: phrase by phrase, from the piece's motifs
    const ph = S.phrases[Math.floor(bar / 2) % S.phrases.length];
    if (ph && !last) {
      const half = bar % 2;
      let pos = 0;
      for (const note of ph) {
        const len = Math.abs(note.len);
        const start = pos - half * n;
        pos += len;
        if (start < 0 || start >= n || note.len < 0) continue;
        // follow the chord under the note (each motif degree sits on this bar's root)
        const d = note.deg + (T.follow ? chord[0] : 0);
        const m = S.midi(d, T.leadOct ?? 0);
        mu.inst(T.lead, t0 + start * e, len * e * (T.legato ?? 0.95), m, T.leadVol ?? 0.07, st.lead, { from: this.lastLead });
        this.lastLead = 440 * Math.pow(2, (m - 69) / 12);
      }
    }
    // a closing chord to end on
    if (bar === S.bars - 1 && !this.loop) for (const d of S.chords[0]) mu.inst(T.arp || 'piano', t0 + e * 2, e * n * 2, S.midi(d, 0), 0.05, st.arp);
    // brass stabs on the chord (a fight's, as it heats up)
    if (T.stabs) for (let i = 0; i < n; i++) if (T.stabs[i % T.stabs.length]) for (const d of chord) mu.inst('brass', t0 + i * e, e * 0.8, S.midi(d, -1), T.stabVol ?? 0.03, st.brass);
    // the boss layer: a choir under the chord, a timpani roll into each phrase
    if (T.battle) {
      for (const d of chord) mu.inst('choir', t0, S.barDur * 1.02, S.midi(d, 0), 0.012, st.boss);
      if (bar % 4 === 3) for (let i = n - 4; i < n; i++) mu.drum(t0 + i * e, 'timp', st.boss, 0.6 + 0.1 * (i - n + 4), S.midi(chord[0], -2));
    }
    // drums
    if (T.drums) {
      const D = T.drums, v = D.vol ?? 1;
      const fill = T.battle && bar % 4 === 3;
      for (let i = 0; i < n; i++) {
        const at = t0 + i * e;
        if (D.kick && D.kick[i % D.kick.length]) mu.drum(at, D.kickKind || 'kick', st.perc, v);
        if (D.hat && i % 2 === 1) mu.drum(at, 'hat', st.perc, v);
        if (D.shaker && D.shaker[i % D.shaker.length]) mu.drum(at, 'shaker', st.perc, v);
        if (D.block && D.block[i % D.block.length]) mu.drum(at, 'block', st.perc, v);
        if (fill && i >= n - 3) { mu.drum(at, 'tom', st.perc2, v * (0.8 + 0.1 * (i - n + 3))); continue; }
        if (D.snare && D.snare[i % D.snare.length]) mu.drum(at, D.snareKind || 'snare', st.perc2, v);
        if (D.tom && D.tom[i % D.tom.length]) mu.drum(at, 'tom', st.perc2, v);
        if (D.taiko && D.taiko[i % D.taiko.length]) mu.drum(at, 'taiko', st.perc2, v);
      }
      // a crash to open each phrase of a fight
      if (T.battle && bar % 4 === 0) mu.drum(t0, 'crash', st.perc2, 0.8);
    }
  }
}
