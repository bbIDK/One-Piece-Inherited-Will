// The sound library: every effect the game asks for by name, each layered
// from the motifs in motifs.js and the voice's own building blocks (see
// synth.js) — a transient to hear it land, a body with weight, a tail — and
// each a little different every time it plays (round-robin variants, pitch
// and timing jitter). docs/AUDIO.md describes the palette.
//
// An entry: { bus, prio (how much it matters), cd (the least time between two
// of them), max (how many may overlap), send (room echo), drive (grit),
// duck (how far the music dips under it), variants, play(v, k) }. `k` carries
// what the mixer worked out about the moment: `w` the weight of a blow, `rr`
// the variant, `surf` what's underfoot, `armament`, `counter`, `kick`, `blade`,
// `sword` (a guard with a blade), `perfect` (a parry), `wet` (feet)...
import * as M from './motifs.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const r = () => 0.92 + Math.random() * 0.16;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Each character's Haki has a voice (game/haki.js hakiSignature: `k.voice`,
// 0..1, worked out by audio.js from who it is): the same sounds pitched and
// coloured their own way — related, never identical.
const vo = (k) => clamp(k?.voice ?? 0.5, 0, 1);

/**
 * Haki-hardened fists (and a blocked blow off a hardened arm): the GAKIN of
 * struck iron — a hard click, a bright inharmonic ring with a darker one an
 * octave under it (the chorus of iron), a few sparks — in the striker's voice.
 */
function hakiClank(v, t, s = 1, voice = 0.5) {
  const base = (560 + 200 * voice) * rnd(0.97, 1.03);
  v.noise(t, 0.006, { type: 'highpass', freq: 6000, gain: 0.24 * s, attack: 0.0005 });
  v.ring(t + 0.002, base, 0.3 * s, 0.075 * s, [1, 1.47 + 0.06 * voice, 2.31, 2.97]);
  v.ring(t + 0.004, base * 0.503, 0.22 * s, 0.045 * s, [1, 1.52, 2.4]);
  v.crackle(t + 0.01, 0.12, 4, { freq: 2600 + 800 * voice, gain: 0.04 * s });
}

/** Ryou: a master's Haki pushed on into the body — a hollow "dwoom" going through it, a ripple of iron. */
function ryouLayer(v, t, w = 1, voice = 0.5) {
  v.thump(t + 0.01, { f0: 95 + 20 * voice, f1: 32, dur: 0.35, gain: 0.32 * w });
  v.tone(t + 0.02, 0.4, { freq: 180 + 40 * voice, to: 70, type: 'triangle', gain: 0.08, vib: { rate: 22, depth: 18 } });
  v.ring(t + 0.03, 300 + 80 * voice, 0.4, 0.03, [1, 1.5, 2.2]);
}

/** A blade singing after the cut: a pair of slightly detuned rings (the anime's chorus on steel). */
function bladeRing(v, t, base, dur, gain) {
  v.ring(t, base, dur, gain, [1, 2.04, 2.75, 3.6]);
  v.ring(t + 0.003, base * 1.007, dur * 0.8, gain * 0.5, [1, 2.04, 2.75]);
}

/** What a foot scuffs or a body lands on: a short burst of the surface. */
export function surfaceHit(v, t, surf, s = 1) {
  switch (surf) {
    case 'grass': v.noise(t, 0.09, { type: 'lowpass', freq: 1100, sweep: 500, q: 0.6, gain: 0.08 * s, attack: 0.005 }); v.noise(t + 0.01, 0.07, { freq: 3400, q: 0.9, gain: 0.03 * s }); break;
    case 'sand': v.noise(t, 0.13, { freq: 1700, sweep: 700, q: 0.45, gain: 0.09 * s, attack: 0.01 }); v.crackle(t, 0.1, 6, { freq: 4200, gain: 0.02 * s }); break;
    case 'gravel': v.noise(t, 0.09, { freq: 1500, q: 0.6, gain: 0.07 * s }); v.crackle(t, 0.1, 9, { freq: 2800, gain: 0.045 * s }); break;
    case 'mud': v.tone(t + 0.01, 0.09, { freq: 140, to: 320, gain: 0.05 * s, attack: 0.01 }); v.noise(t, 0.12, { type: 'lowpass', freq: 500, q: 0.6, gain: 0.09 * s, attack: 0.01 }); break;
    case 'stone': case 'ice': case 'metal': v.noise(t, 0.016, { type: 'highpass', freq: 3000, q: 0.8, gain: 0.07 * s, attack: 0.001 }); v.noise(t, 0.05, { freq: 900, q: 1.4, gain: 0.06 * s }); break;
    case 'wood': v.tone(t, 0.08, { freq: 215, to: 165, gain: 0.07 * s, attack: 0.002 }); v.noise(t, 0.045, { freq: 1000, q: 1.3, gain: 0.06 * s }); break;
    case 'snow': v.noise(t, 0.14, { freq: 2300, sweep: 1300, q: 0.6, gain: 0.07 * s, attack: 0.015 }); v.crackle(t + 0.01, 0.1, 8, { freq: 5200, gain: 0.025 * s }); break;
    default: v.noise(t, 0.07, { type: 'lowpass', freq: 700, q: 0.7, gain: 0.09 * s, attack: 0.004 });
  }
}

/**
 * How big a splash is: from `k.v` (how fast you hit the water, m/s — a hop in
 * ~4, two metres down ~9, off a ship's deck 13 or more), else `dflt`.
 */
const splashSize = (k, dflt) => (k.v ? clamp((k.v - 2) / 10, 0.25, 1.7) : dflt);

/** How long each kind of swing lasts at size 1 (seconds: see swing). */
const SWING_LEN = { fists: 0.15, sword: 0.15, legs: 0.2, heavy: 0.3, staff: 0.22, axe: 0.36 };

/** The swing of a blow through the air, by what's swung (`kind`) and how big (`s`). */
export function swing(v, t, kind = 'fists', s = 1) {
  switch (kind) {
    case 'sword': // a thin, bright swish
      v.whoosh(t, 0.15 * s, { f0: 2400, f1: 6200, q: 2.2, gain: 0.3 * s, peak: 0.55 });
      v.whoosh(t + 0.01, 0.12 * s, { f0: 900, f1: 1600, q: 0.8, gain: 0.13 * s, peak: 0.5 });
      break;
    case 'legs': // a fuller, lower sweep — and the trouser leg flapping
      v.whoosh(t, 0.2 * s, { f0: 300, f1: 1100, q: 0.9, gain: 0.5 * s, peak: 0.5, color: 'pink', flutter: 24 });
      v.whoosh(t + 0.02, 0.15 * s, { f0: 900, f1: 1800, q: 1, gain: 0.12 * s, peak: 0.5 });
      break;
    case 'heavy': // a big wind-up thrown hard
      v.whoosh(t, 0.3 * s, { f0: 220, f1: 950, q: 0.8, gain: 0.55 * s, peak: 0.6, color: 'pink' });
      v.whoosh(t + 0.08, 0.2 * s, { f0: 1400, f1: 700, q: 0.9, gain: 0.14 * s });
      break;
    case 'staff': // wood through the air: a hollow whirr
      v.whoosh(t, 0.22 * s, { f0: 500, f1: 1500, q: 2.5, gain: 0.34 * s, peak: 0.5 });
      v.whoosh(t + 0.04, 0.16 * s, { f0: 800, f1: 2000, q: 2.5, gain: 0.14 * s, peak: 0.5 });
      break;
    case 'axe': // a great slow weight
      v.whoosh(t, 0.36 * s, { f0: 180, f1: 700, q: 0.9, gain: 0.6 * s, peak: 0.65, color: 'pink' });
      break;
    default: // fists: short and punchy
      v.whoosh(t, 0.15 * s, { f0: 500, f1: 1800, q: 1.1, gain: 0.34 * s, peak: 0.45 });
      v.whoosh(t + 0.03, 0.11 * s, { f0: 1600, f1: 900, q: 0.9, gain: 0.1 * s, peak: 0.5 });
  }
}

/** A gunshot: the crack, the bang, smoke, and the echo coming back. */
function gunshot(v, t, s = 1) {
  v.noise(t, 0.012, { type: 'highpass', freq: 2200, gain: 0.5 * s, attack: 0.0005 });
  v.thump(t, { f0: 200, f1: 60, dur: 0.12, gain: 0.4 * s });
  v.noise(t, 0.3, { type: 'lowpass', freq: 1500, sweep: 300, gain: 0.3 * s, attack: 0.002 });
  const e = v.echo(0.22, 0.25, 1200, 0.35);
  v.noise(t, 0.12, { type: 'lowpass', freq: 1200, gain: 0.25 * s, dest: e });
}

/** A slingshot: the rubber's snap and the shot whistling off. */
function slingshot(v, t, s = 1) {
  v.noise(t, 0.012, { type: 'highpass', freq: 2500, gain: 0.25 * s, attack: 0.0005 });
  v.tone(t, 0.08, { freq: 380, to: 160, type: 'triangle', gain: 0.1 * s });
  v.tone(t + 0.02, 0.25, { freq: 2600, to: 1800, gain: 0.02 * s });
}

// --------------------------------------------------------------- the library
/**
 * The shudder that sells Haki: the air itself vibrating — a low wave throbbing
 * fast (its level beating at `rate`, slowing to `to`), a second a little off
 * it so the two beat against each other, and a brown rumble pulsing with
 * them: the pressure dropping and the ground answering.
 */
function shudder(v, t, dur, { f = 60, rate = 24, to = 9, gain = 0.3, color = 0.5 } = {}) {
  v.tone(t, dur, { freq: f, to: f * 0.85, type: 'sine', gain, attack: 0.02, am: { rate, to, depth: 1 } });
  v.tone(t, dur * 0.9, { freq: f * 1.5, to: f * 1.3, type: 'triangle', gain: gain * 0.35, attack: 0.03, am: { rate: rate * 1.13, to: to * 1.2, depth: 0.9 } });
  v.noise(t, dur, { color: 'brown', type: 'lowpass', freq: 240, gain: gain * color, attack: 0.02, am: { rate: rate * 0.97, depth: 0.85 } });
}

export const SFX = {
  // ---- the fight
  /** The default swing of a blow (a technique's own start sound replaces it: see techStart). */
  whoosh: { prio: 4, cd: 0.04, max: 4, send: 0.04, play: (v, k) => swing(v, 0, k.kind || 'fists', k.s || 1) },
  /**
   * DON, DOGA, BAKI: a landed punch, built as the fighting games' punches
   * measure — a crack you hear land (broadband, 250 Hz–8 kHz all within a few
   * dB in its first 15 ms), the smack of the blow (1–2 kHz, gone in 60 ms), and
   * its weight (a knock at 100–180 Hz with a harmonic over it, so even a
   * laptop's speakers carry it — not a sub they can't play); a kick deeper,
   * Haki ringing like iron.
   */
  punch: {
    prio: 6, cd: 0.03, max: 4, send: 0.06, drive: 2.2, variants: 4,
    play(v, k) {
      const w = clamp(k.w ?? 0.45, 0.15, 1.5);
      const slap = [1350, 1700, 1950, 1200][k.rr] * (k.kick ? 0.75 : 1);
      // the crack: the instant of contact, bright and short
      v.noise(0, 0.01, { type: 'highpass', freq: 2200 * r(), q: 0.7, gain: 0.8 + 0.15 * w, attack: 0.0006 });
      v.noise(0, 0.016, { freq: 4800 * r(), q: 0.8, gain: 0.4, attack: 0.0006 });
      // the smack: skin and cloth and the body behind them
      v.noise(0.001, 0.055 + 0.03 * w, { freq: slap * r(), q: 0.9, gain: 0.9 + 0.15 * w, attack: 0.0012 });
      v.noise(0.002, 0.07 + 0.04 * w, { freq: 600 * r(), q: 1, gain: 0.5, attack: 0.002 });
      // the weight, a moment behind the crack (as it is in a recorded punch): a knock with a harmonic over it
      const f = (k.kick ? 125 : 160) * (1 - 0.15 * w) * r();
      v.tone(0.006, 0.1 + 0.08 * w, { freq: f * 1.6, to: f * 0.55, glide: (0.1 + 0.08 * w) * 0.55, gain: 0.4 + 0.2 * w, attack: 0.006 });
      v.tone(0.006, 0.07 + 0.04 * w, { freq: f * 2.1, to: f * 1.2, type: 'triangle', gain: 0.18, attack: 0.005 });
      v.noise(0.004, 0.1 + 0.08 * w, { type: 'lowpass', freq: k.kick ? 450 : 600, sweep: 160, q: 0.7, gain: 0.2 + 0.15 * w, attack: 0.006 });
      // and the air knocked out past it, the blow's short tail
      v.noise(0.03, 0.16 + 0.06 * w, { freq: 1000, sweep: 450, q: 0.8, gain: 0.09 + 0.05 * w, attack: 0.012 });
      if (k.armament) hakiClank(v, 0.002, 0.7 + 0.4 * w, vo(k));
      if (k.ryou) ryouLayer(v, 0.004, 0.8 + 0.3 * w, vo(k));
      if (k.counter) { v.noise(0, 0.03, { freq: 2500, q: 2, gain: 0.25 }); v.thump(0.02, { f0: 110, f1: 45, dur: 0.25, gain: 0.35 }); }
    },
  },
  /** DOGOOON: the ground shakes — a hard crack, a boom with a second wave behind it, debris. */
  punch_heavy: {
    prio: 7, cd: 0.05, max: 3, send: 0.18, drive: 3, duck: 0.35, side: 0.85, variants: 3,
    play(v, k) {
      const w = clamp(k.w ?? 0.8, 0.5, 1.5);
      v.noise(0, 0.014, { type: 'highpass', freq: 2200, q: 0.6, gain: 0.65, attack: 0.0006 });
      v.noise(0, 0.02, { freq: 4800 * r(), q: 0.8, gain: 0.3, attack: 0.0006 });
      v.noise(0.001, 0.1, { freq: [1100, 900, 1300][k.rr] * r() * (k.kick ? 0.8 : 1), q: 0.9, gain: 0.55 });
      v.noise(0.002, 0.12, { freq: 520 * r(), q: 1, gain: 0.4, attack: 0.002 });
      v.tone(0, 0.12, { freq: 300 * r(), to: 140, type: 'triangle', gain: 0.22, attack: 0.001 });
      v.thump(0, { f0: (k.kick ? 120 : 140) * r(), f1: 45, dur: 0.3 + 0.06 * w, gain: 0.7 });
      v.noise(0, 0.3, { color: 'pink', type: 'lowpass', freq: 800, sweep: 150, gain: 0.4 });
      v.thump(0.045, { f0: 95, f1: 38, dur: 0.45, gain: 0.32 + 0.12 * w });
      v.crackle(0.05, 0.3, 12, { freq: 1600, gain: 0.12 });
      v.noise(0.05, 0.35, { freq: 1200, sweep: 500, q: 0.7, gain: 0.08, attack: 0.02 });
      if (k.armament) hakiClank(v, 0.003, 1.2, vo(k));
      if (k.ryou) ryouLayer(v, 0.005, 1.2, vo(k));
      if (k.counter) v.noise(0, 0.04, { freq: 2600, q: 2, gain: 0.25 });
    },
  },
  /** ZAN: a clean cut, and the blade singing after it. */
  slash_hit: {
    prio: 6, cd: 0.03, max: 4, send: 0.12, drive: 0.8, variants: 3,
    play(v, k) {
      v.noise(0, 0.008, { type: 'highpass', freq: 6500, gain: 0.3, attack: 0.0006 });
      v.noise(0.001, 0.085, { freq: 5200 * r(), sweep: 2200, q: 1.6, gain: 0.3, attack: 0.002 });
      v.thump(0, { f0: 230, f1: 80, dur: 0.07, gain: 0.26 });
      bladeRing(v, 0.004, [1480, 1620, 1360][k.rr] * r(), 0.42, 0.06);
      if (k.armament) hakiClank(v, 0.003, 0.7, vo(k));
    },
  },
  /** ZUBAAAN: the air tearing, a deep cut, a long ring. */
  slash_heavy: {
    prio: 7, cd: 0.05, max: 3, send: 0.22, drive: 1.6, duck: 0.25, variants: 3,
    play(v, k) {
      v.whoosh(0, 0.14, { f0: 1800, f1: 7000, q: 1.3, gain: 0.14, peak: 0.25 });
      v.noise(0, 0.012, { type: 'highpass', freq: 5000, gain: 0.38, attack: 0.0006 });
      v.noise(0.002, 0.16, { freq: 4200 * r(), sweep: 1500, q: 1.2, gain: 0.34, attack: 0.002 });
      v.thump(0, { f0: 150, f1: 38, dur: 0.26, gain: 0.55 });
      bladeRing(v, 0.008, [1100, 1220, 980][k.rr] * r(), 0.75, 0.08);
      if (k.armament) hakiClank(v, 0.004, 1, vo(k));
    },
  },
  /** A blow taken on the guard: a dull leather DOFF on an arm, a short GAKIN off a blade. */
  block: {
    prio: 6, cd: 0.04, max: 3, send: 0.05, drive: 0.6, variants: 3,
    play(v, k) {
      if (k.sword) {
        v.noise(0, 0.008, { type: 'highpass', freq: 4000, gain: 0.3, attack: 0.0006 });
        v.ring(0.001, [900, 980, 840][k.rr] * r(), 0.28, 0.07, [1, 1.62, 2.4, 3.3]);
        v.thump(0, { f0: 300, f1: 120, dur: 0.05, gain: 0.2 });
      } else {
        // the arm takes it: a dull DOFF — a short crack, the leather smack, the bone behind it
        v.noise(0, 0.008, { type: 'highpass', freq: 2000, gain: 0.45, attack: 0.0006 });
        v.noise(0, 0.06, { freq: [850, 760, 950][k.rr] * r(), q: 1.2, gain: 0.75, attack: 0.001 });
        v.noise(0, 0.035, { freq: 1800 * r(), q: 1.4, gain: 0.32, attack: 0.001 });
        v.tone(0.003, 0.09, { freq: 150, to: 75, gain: 0.35, attack: 0.003 });
        v.noise(0.004, 0.05, { freq: 2600, q: 1, gain: 0.1 });
      }
      if (k.armament) hakiClank(v, 0.002, 0.6, vo(k));
    },
  },
  /** KIIN! Steel on steel: a hard click, a bright inharmonic ring, a long shimmer (perfect: brighter, longer, a beat of hush). */
  parry: {
    prio: 8, cd: 0.05, max: 2, send: 0.35, duck: 0.3, variants: 3,
    play(v, k) {
      const p = k.perfect ? 1.12 : 1, len = k.perfect ? 1.5 : 1.05;
      const base = [1320, 1400, 1250][k.rr] * p * r();
      v.noise(0, 0.02, { type: 'highpass', freq: 5000, gain: 0.4, attack: 0.0006 });
      v.thump(0, { f0: 420, f1: 160, dur: 0.05, gain: 0.22 });
      v.ring(0, base, len, 0.12, [1, 1.5, 2.25, 3.14, 3.96]);
      v.ring(0.002, base * 1.007, len * 0.8, 0.05, [1, 1.5, 2.25]);
      v.fm(0.001, len, { freq: base * 2.01, ratio: 1.414, index: 2.2, gain: 0.06 });
      v.tone(0.01, len * 0.5, { freq: base * 4, to: base * 4.1, gain: 0.012 });
      if (k.perfect) {
        v.crackle(0.02, 0.4, 10, { freq: 8000, q: 5, gain: 0.03 });
        v.thump(0.01, { f0: 90, f1: 40, dur: 0.35, gain: 0.32 });
        v.fm(0.06, 1.2, { freq: base * 3, ratio: 2.76, index: 0.7, gain: 0.025 });
      }
    },
  },
  /** BAKIN: a guard smashed aside — a crack, shards, the stagger. */
  guardbreak: {
    prio: 8, cd: 0.1, max: 2, send: 0.18, drive: 2.2, duck: 0.3,
    play(v) {
      v.noise(0, 0.02, { type: 'highpass', freq: 3000, gain: 0.5, attack: 0.0006 });
      v.crackle(0, 0.25, 22, { freq: 3500, spread: 1, q: 3, gain: 0.13 });
      v.noise(0.002, 0.1, { freq: 1300, q: 1, gain: 0.3 });
      for (let i = 0; i < 4; i++) v.ring(rnd(0.01, 0.12), rnd(2400, 3200), 0.25, 0.035, [1, 1.7]);
      v.thump(0, { f0: 160, f1: 40, dur: 0.25, gain: 0.45 });
      v.noise(0, 0.26, { type: 'lowpass', freq: 600, gain: 0.3 });
      v.tone(0.02, 0.35, { freq: 300, to: 70, type: 'sawtooth', gain: 0.1 });
    },
  },
  /** A dodge: cloth and air rushing past, a scuff of the feet. */
  dodge: {
    prio: 5, cd: 0.08, max: 2, send: 0.04, variants: 2,
    play(v, k) {
      v.whoosh(0, 0.17, { f0: 700 * r(), f1: 3000, q: 1, gain: 0.14, peak: 0.35, flutter: 26 });
      v.whoosh(0.04, 0.12, { f0: 2600, f1: 1200, q: 0.9, gain: 0.05, peak: 0.4 });
      surfaceHit(v, 0.01, k.surf || 'dirt', 0.5);
    },
  },
  /** DOON: down and out — the body hits the ground, bounces, the dust settles. */
  ko: {
    prio: 7, cd: 0.08, max: 3, send: 0.22, drive: 1.8, duck: 0.3,
    play(v, k) {
      v.thump(0, { f0: 110, f1: 35, dur: 0.4, gain: 0.6 });
      v.noise(0, 0.4, { color: 'pink', type: 'lowpass', freq: 420, sweep: 90, gain: 0.35 });
      v.thump(0.17, { f0: 90, f1: 40, dur: 0.18, gain: 0.22 });
      surfaceHit(v, 0.17, k.surf || 'dirt', 0.8);
      v.crackle(0.05, 0.3, 6, { freq: 1000, gain: 0.07 });
      v.whoosh(0, 0.15, { f0: 1200, f1: 500, gain: 0.05 });
    },
  },
  /** Knocked down: the breath going out of you, a falling wail (the anime's sad trombone, not quite). */
  knocked: {
    prio: 9, cd: 0.5, max: 1, send: 0.3,
    play(v) {
      v.thump(0, { f0: 90, f1: 38, dur: 0.3, gain: 0.4 });
      v.tone(0.05, 0.95, { freq: 330, to: 105, type: 'sawtooth', gain: 0.09, vib: { rate: 5, depth: 14 } });
      v.tone(0.05, 0.9, { freq: 165, to: 52, gain: 0.14 });
    },
  },
  /** Back on your feet: a rising call, and a breath. */
  getup: {
    prio: 8, cd: 0.5, max: 1, send: 0.25,
    play(v) {
      v.whoosh(0, 0.25, { f0: 400, f1: 1400, gain: 0.05, peak: 0.6 });
      [392, 523, 659].forEach((f, i) => v.tone(i * 0.08, 0.28, { freq: f, type: 'triangle', gain: 0.12 }));
    },
  },
  death: {
    prio: 10, cd: 1, max: 1, send: 0.45, bus: 'ui',
    play(v) { [330, 311, 294, 220].forEach((f, i) => v.tone(i * 0.26, 0.6, { freq: f, type: 'triangle', gain: 0.18 })); },
  },
  /**
   * Armament Haki hardening (in the user's voice) — as the player hears it,
   * and as the anime's own clip measures: a deep, resonant rumble swelling as
   * the black coat spreads up the arm, then, as it sets hard (0.27 s, when the
   * coat has spread: render3d/chars/haki.js), a sharp metallic ring — the
   * crack of it, a dense cluster of struck-steel partials beating against each
   * other, swirling as the anime's "shing" does — with its lows held under it
   * and a long resonant tail (the clip rings 1.6 s before it's 20 dB down).
   * Each character's own: pitched and coloured a few per cent their way.
   * (A hit by Haki itself: a Haki-heavy blow.)
   */
  haki: {
    prio: 7, cd: 0.08, max: 2, send: 0.3, drive: 0.6, variants: 3, side: 0.5, hold: 0.5,
    play(v, k) {
      if (k.hit) { SFX.punch_heavy.play(v, { ...k, armament: true }); return; }
      const V = vo(k), T = 0.27, p = (1 + 0.08 * (V - 0.5)) * [1, 1.03, 0.97][k.rr];
      // the rumble: a sub swelling, a growl over it, the resonance of the body
      v.tone(0, T + 1.1, { freq: 46 * p, to: 39 * p, gain: 0.34, attack: T * 0.9, curve: 'lin' });
      v.tone(0, T + 0.6, { freq: 92 * p, to: 78 * p, type: 'triangle', gain: 0.1, attack: T * 0.85, curve: 'lin', vib: { rate: 11, depth: 3 } });
      v.noise(0, T + 0.8, { color: 'brown', type: 'bandpass', freq: 130 * p, q: 2.5, gain: 0.45, attack: T * 0.9, curve: 'lin' });
      // (the coat drawn tight over the skin as a blade's drawn: a steel scrape rising into the set)
      v.noise(T - 0.14, 0.16, { freq: 2600 * p, sweep: 7000 * p, q: 6, gain: 0.12, attack: 0.12, curve: 'lin' });
      // the set: a crack, the struck-steel clank, locking home — and the arm shuddering with it
      v.noise(T, 0.006, { type: 'highpass', freq: 2000, gain: 0.55, attack: 0.0005 });
      v.noise(T + 0.035, 0.012, { freq: 3200 * p, q: 4, gain: 0.25, attack: 0.0006 });
      shudder(v, T, 0.55, { f: 72 * p, rate: 30, to: 12, gain: 0.22 });
      v.noise(T, 0.05, { freq: 3800 * p, q: 1, gain: 0.25, attack: 0.001 });
      v.thump(T, { f0: 170 * p, f1: 70, dur: 0.2, gain: 0.35 });
      // the ring: inharmonic partials of a struck plate, each beating against its twin, the high ones dying first
      const base = 410 * p * (1 + 0.04 * (V - 0.5));
      [1, 1.47, 1.99, 2.37, 2.76, 3.18, 3.63, 4.11, 4.66, 5.25].forEach((m, i) => {
        const f = base * m * (1 + 0.01 * (Math.random() - 0.5)), d = 4 * Math.pow(0.86, i), g = 0.05 / (1 + i * 0.35);
        v.tone(T + 0.001, d, { freq: f, gain: g, attack: 0.002 });
        v.tone(T + 0.002, d * 0.8, { freq: f * (1.003 + 0.002 * V), gain: g * 0.6, attack: 0.003 });
      });
      // the swirl of it (the anime's shing), and the air shimmering
      v.swirl(T, 2.4, { lp: 9000, hp: 600, d0: 0.5, d1: 4.2 + V, d2: 1.4, fb: 0.8, gain: 0.1, hold: 0.3 });
      v.noise(T + 0.01, 0.9, { type: 'highpass', freq: 5000, gain: 0.03, attack: 0.02 });
      // ringing on round it
      const e = v.echo(0.14, 0.3, 2500, 0.25);
      v.noise(T, 0.25, { freq: 1600, q: 0.8, gain: 0.12, dest: e });
    },
  },
  /** Armament or Observation let go: a soft breath of air settling. */
  haki_off: { prio: 4, cd: 0.1, max: 1, send: 0.1, play: (v, k) => v.whoosh(0, 0.25, { f0: 1500 + 500 * vo(k), f1: 450, q: 1, gain: 0.05, peak: 0.2 }) },
  /** Haki given out (the spirit spent): a dull clank going flat, the coat fizzling away. */
  haki_out: {
    prio: 6, cd: 0.3, max: 1, send: 0.2,
    play(v, k) {
      const V = vo(k);
      v.ring(0, 300 + 120 * V, 0.25, 0.1, [1, 1.4, 2.1]);
      v.tone(0, 0.4, { freq: 220 + 60 * V, to: 90, type: 'triangle', gain: 0.16 });
      v.noise(0.02, 0.45, { type: 'lowpass', freq: 2400, sweep: 300, gain: 0.18, attack: 0.01 });
      v.crackle(0.03, 0.4, 8, { freq: 1800, gain: 0.06 });
    },
  },
  /**
   * Observation Haki (in the user's voice): the heart's soft "doki-doki", the
   * sense going out like sonar (a breath of air, a falling sine), and the world
   * heard — a crystalline ringing held a long moment, its high partials beating
   * slowly, a low hum under it (as the anime's clip: steady high tones over a
   * low bed, near two seconds long).
   */
  haki_obs: {
    prio: 7, cd: 0.2, max: 1, send: 0.55, variants: 3, side: 0.3, hold: 0.4, duck: 0.55,
    play(v, k) {
      // (the world going quiet round you — the duck — and the sense pulsing out in waves)
      shudder(v, 0, 1.4, { f: 96, rate: 7, to: 3, gain: 0.08, color: 0.2 });
      const V = vo(k), f = (2050 + 900 * V) * [1, 1.03, 0.97][k.rr];
      v.thump(0, { f0: 66 - 8 * V, f1: 44, dur: 0.13, gain: 0.32 });
      v.thump(0.2, { f0: 58 - 6 * V, f1: 40, dur: 0.11, gain: 0.2 });
      v.whoosh(0.02, 0.5, { f0: 3800, f1: 1600, q: 2.5, gain: 0.05, peak: 0.15 });
      v.tone(0.03, 0.35, { freq: f * 0.5, to: f * 0.25, gain: 0.045, attack: 0.004 });
      v.ring(0.04, f, 1.6, 0.11, [1, 2.0, 2.76 + 0.2 * V, 4.07]);
      for (const [m, g, a] of [[1, 0.03, 0.08], [1.5, 0.02, 0.15], [2, 0.025, 0.1], [3.01, 0.012, 0.2]]) {
        v.tone(0.05, 2, { freq: f * m, gain: g, attack: a, hold: 0.6, vib: { rate: 4 + 3 * V, depth: f * m * 0.003 } });
        v.tone(0.06, 1.9, { freq: f * m * 1.004, gain: g * 0.7, attack: a + 0.05, hold: 0.5 });
      }
      v.tone(0.05, 1.8, { freq: 72 + 10 * V, gain: 0.05, attack: 0.2, hold: 0.6 });
    },
  },
  /** Foresight (Observation slipping a blow): a whoosh played backwards, swelling out of nothing onto a ting. */
  foresight: {
    prio: 7, cd: 0.15, max: 2, send: 0.4, variants: 2,
    play(v, k) {
      const V = vo(k), f = (2400 + 1200 * V) * [1, 1.04][k.rr];
      v.whoosh(0, 0.22, { f0: 600, f1: 3200, q: 1.2, gain: 0.42, peak: 0.97, color: 'pink' });
      v.whoosh(0.02, 0.2, { f0: 1500, f1: 5000, q: 2, gain: 0.14, peak: 0.95 });
      v.ring(0.22, f, 0.6, 0.12, [1, 2.0, 2.9]);
      v.fm(0.22, 0.8, { freq: f * 1.5, ratio: 2.01, index: 0.6, gain: 0.035 });
      // (a gong played backwards: swelling up out of nothing and cut off at the instant — the future, heard first)
      for (const [m, g] of [[1, 0.06], [1.52, 0.035], [2.3, 0.025], [3.1, 0.015]]) v.tone(0, 0.23, { freq: 180 * m * (1 + 0.1 * V), gain: g, attack: 0.22, curve: 'lin' });
      v.tone(0.0, 0.22, { freq: 900, to: 2600, type: 'square', gain: 0.012, attack: 0.2, curve: 'lin' });
    },
  },
  /** Conqueror's Haki gathering (the wind-up): the air going heavy and still, a growl rising under it. */
  conqueror_rise: {
    prio: 8, cd: 0.4, max: 1, send: 0.3,
    play(v, k) {
      const V = vo(k), T = Math.max(0.2, k.rel || 0.45);
      v.noise(0, T, { color: 'brown', type: 'lowpass', freq: 120, sweep: 500, gain: 0.4, attack: T * 0.9, curve: 'lin' });
      v.tone(0, T + 0.05, { freq: 30 + 8 * V, to: 55 + 10 * V, gain: 0.32, attack: T * 0.85, curve: 'lin' });
      v.whoosh(0, T, { f0: 200, f1: 900, q: 0.9, gain: 0.16, peak: 0.9 });
      // (the high-tension ring before it breaks: a thin whine climbing, the air starting to shake)
      v.tone(0, T, { freq: 2400 + 600 * V, to: 4200 + 600 * V, gain: 0.025, attack: T * 0.9, curve: 'lin' });
      shudder(v, T * 0.3, T * 0.75, { f: 48 + 8 * V, rate: 12, to: 26, gain: 0.14 });
    },
  },
  /**
   * Conqueror's Haki let loose (in the king's voice): a heavy, echoing
   * shockwave — as the player hears it, and as the anime's clip measures (a
   * broadband burst with falling sweeps through it and a tail that rings on
   * for seconds): the crack, the blast of air and a huge low boom falling away,
   * sweeps falling through it (the VWOOOM), black lightning crackling, the
   * shockwave coming back again and again off the world round you, and the
   * deep rumble rolling on.
   */
  conqueror: {
    prio: 9, cd: 0.4, max: 1, send: 0.45, drive: 1.6, duck: 0.7, side: 1, hold: 1.2, variants: 3,
    play(v, k) {
      const V = vo(k), p = (1 + 0.08 * (V - 0.5)) * [1, 0.97, 1.03][k.rr];
      const e = v.echo(0.32, 0.45, 900, 0.55);
      v.noise(0, 0.012, { type: 'highpass', freq: 1500, gain: 0.6, attack: 0.0006 });
      v.noise(0, 0.6, { color: 'pink', type: 'lowpass', freq: 2500, sweep: 220, gain: 0.55, attack: 0.004 });
      v.noise(0, 0.5, { color: 'pink', type: 'lowpass', freq: 1800, sweep: 200, gain: 0.35, attack: 0.004, dest: e });
      v.thump(0, { f0: 85 * p, f1: 26, dur: 1.4, gain: 0.85 });
      v.tone(0.01, 1.6, { freq: 62 * p, to: 38 * p, glide: 1.4, type: 'sawtooth', gain: 0.08, attack: 0.01 });
      v.thump(0.02, { f0: 70 * p, f1: 30, dur: 1, gain: 0.4, dest: e });
      for (const [t0, f0, f1, d, g] of [[0.02, 2600, 380, 1.6, 0.16], [0.12, 1800, 260, 2, 0.13], [0.3, 3400, 700, 1.4, 0.08]]) v.noise(t0, d, { freq: f0 * p, sweep: f1 * p, q: 3, gain: g, attack: 0.02 });
      v.whoosh(0.02, 1.6, { f0: 900, f1: 200, q: 0.7, gain: 0.28, peak: 0.12, color: 'pink' });
      v.zap(0.03, 0.45, { f0: 50, f1: 700 + 400 * V, gain: 0.07 });
      v.crackle(0.02, 1, 16, { freq: 2600 + 1000 * V, gain: 0.05 });
      M.rumble(v, 0.1, 1.2, 2.6, { lp: 170 });
      // the "veen": a sharp ringing hum at the instant, then the heavy vibrating wave of the pressure shifting
      v.tone(0, 0.5, { freq: 3100 * p, to: 2600 * p, gain: 0.05, attack: 0.002 });
      v.tone(0, 0.5, { freq: 3112 * p, to: 2610 * p, gain: 0.035, attack: 0.002 });
      shudder(v, 0.03, 1.8, { f: 52 * p, rate: 32, to: 7, gain: 0.42, color: 0.7 });
      // black lightning: metallic, high-voltage snaps through it
      for (let i = 0; i < 6; i++) {
        const t = 0.05 + i * (0.12 + 0.06 * Math.random());
        v.noise(t, 0.008, { type: 'highpass', freq: 3500, gain: 0.3, attack: 0.0004 });
        v.ring(t, 2400 + 1600 * Math.random(), 0.09, 0.035, [1, 1.73, 2.61]);
        v.zap(t, 0.07, { f0: 800, f1: 3000, gain: 0.05, step: 0.004 });
      }
    },
  },
  /**
   * Two Conqueror's clashing: a sustained, thunderous, grinding crackle — the
   * two wills' growls beating against each other over a roar of the deep,
   * black lightning arcing between them the whole while, thunder rolling as
   * the sky splits, and a last boom as both are thrown back.
   */
  conqueror_clash: {
    prio: 10, cd: 0.8, max: 1, send: 0.5, drive: 2.4, duck: 0.85,
    play(v, k) {
      const V = vo(k), L = 2.6;
      v.noise(0, 0.03, { type: 'highpass', freq: 1800, gain: 0.4, attack: 0.0008 });
      v.thump(0, { f0: 110, f1: 26, dur: 1.2, gain: 0.8 });
      v.tone(0, L, { freq: 48 + 10 * V, to: 42, type: 'sawtooth', gain: 0.11, attack: 0.08, hold: L * 0.6 });
      v.tone(0, L, { freq: 51.5 + 10 * V, to: 45, type: 'sawtooth', gain: 0.11, attack: 0.08, hold: L * 0.6 });
      v.noise(0, L, { color: 'brown', type: 'lowpass', freq: 380, q: 0.8, gain: 0.38, attack: 0.1, hold: L * 0.55 });
      for (let i = 0; i < 6; i++) v.zap(0.05 + i * 0.38, 0.4, { f0: 50, f1: 900 + 300 * Math.random(), gain: 0.08 });
      v.crackle(0.02, L * 0.9, 40, { freq: 2400 + 1200 * V, gain: 0.06 });
      v.noise(0.05, L, { type: 'highpass', freq: 5000, gain: 0.045, attack: 0.1, hold: L * 0.5 });
      M.rumble(v, 0.15, 1.4, 2.2, { lp: 200 });
      v.thump(L * 0.8, { f0: 90, f1: 28, dur: 0.8, gain: 0.5 });
      // (a bomb going off behind thick glass: a hollow, compressed boom — the pocket of space between the blades — and the glass ringing)
      v.noise(0, 0.9, { color: 'brown', type: 'lowpass', freq: 160, sweep: 60, gain: 0.7, attack: 0.003 });
      v.tone(0, 0.7, { freq: 140, to: 95, type: 'sine', gain: 0.18, attack: 0.002, am: { rate: 38, to: 14, depth: 0.8 } });
      v.ring(0.01, 1700, 1.4, 0.05, [1, 1.41, 2.13, 2.97, 3.89, 5.02]);
      v.crackle(0.02, 0.5, 18, { freq: 5200, gain: 0.05, q: 3 });
      shudder(v, 0.05, L * 0.85, { f: 40, rate: 26, to: 10, gain: 0.35, color: 0.8 });
    },
  },

  // ---- the elements (a Devil Fruit's blows sound like what they're made of)
  /** A fire blow: the crack of it landing, then the flame's roaring FWOOMP (see motifs.js flame). */
  fire: {
    prio: 6, cd: 0.07, max: 3, send: 0.15, drive: 0.8,
    play: (v, k) => { v.noise(0, 0.01, { type: 'highpass', freq: 2000, gain: 0.45, attack: 0.0006 }); v.thump(0, { f0: 140, f1: 70, dur: 0.1, gain: 0.15 + 0.1 * (k.w || 0.5) }); M.flame(v, 0, 1.25 + 0.4 * (k.w || 0.5), { dur: 0.5 }); },
  },
  magma: { prio: 7, cd: 0.08, max: 3, send: 0.2, drive: 2, play: (v) => { v.thump(0, { f0: 90, f1: 30, dur: 0.4, gain: 0.55 }); M.lava(v, 0, 1); } },
  /** An ice blow: PAKIN — the crack and crunch, the freeze crackling out over the body (see motifs.js ice). */
  ice: { prio: 6, cd: 0.06, max: 3, send: 0.3, drive: 0.8, play: (v) => M.ice(v, 0, 1.1) },
  snow: {
    prio: 5, cd: 0.06, max: 3, send: 0.25,
    play(v) { v.noise(0, 0.25, { freq: 3000, q: 0.5, sweep: 1200, gain: 0.14, attack: 0.01 }); v.ring(0.01, 3100, 0.3, 0.02, [1, 1.5]); v.crackle(0, 0.2, 6, { freq: 5000, gain: 0.02 }); },
  },
  /** A lightning blow: a strike, not a ping — the crack of the air torn open, the blast, the sizzle, thunder rolling off. */
  lightning: { prio: 6, cd: 0.1, max: 3, send: 0.2, drive: 1.6, play: (v) => M.strike(v, 0, 0.9, 1.2) },
  /** A bolt called down (Enel's, the Clima-Tact's): the same, bigger, the thunder rolling on longer. */
  thunder_small: { prio: 6, cd: 0.14, max: 3, send: 0.25, drive: 1.6, duck: 0.25, side: 0.8, play: (v) => M.strike(v, 0, 1.1, 2) },
  /**
   * Weather thunder: the flash first, the sound after it (a near strike a
   * sharp clap at once, a far one a dull roll seconds later) — a few strikes
   * close together, then the rolling rumble and its echo off the sea.
   */
  thunder: {
    prio: 5, cd: 1, max: 2, send: 0.4, drive: 1, duck: 0.15,
    play(v, k) {
      // (as thunder is recorded: a near one the crack and then 63–500 Hz rolling on for seconds; a far one only the low roll)
      const far = k.far ?? Math.random(), d = 0.08 + far * 2.4, s = 1 - far * 0.5;
      if (far < 0.45) M.strike(v, d, 0.9 - far, 3 + far * 2);
      else { v.noise(d, 0.3, { color: 'pink', type: 'lowpass', freq: 600 - far * 300, gain: 0.2 * s, attack: 0.06 }); M.rumble(v, d + 0.05, 1.3 * s, 3.2, { lp: 260 - far * 120 }); }
      const e = v.echo(0.55, 0.3, 400, 0.4);
      v.noise(d + 0.1, 1.4, { color: 'brown', type: 'lowpass', freq: 200, gain: 0.3 * s, dest: e });
    },
  },
  water: { prio: 5, cd: 0.07, max: 3, send: 0.12, play: (v) => { v.thump(0, { f0: 140, f1: 60, dur: 0.08, gain: 0.2 }); M.splash(v, 0, 0.9); } },
  swamp: {
    prio: 5, cd: 0.08, max: 3, send: 0.1,
    play(v) { v.bubbles(0, 0.45, 7, { f: 150, spread: 0.6, rise: 1.6, gain: 0.12, dur: 0.12 }); v.noise(0, 0.4, { type: 'lowpass', freq: 300, gain: 0.2 }); },
  },
  poison: {
    prio: 5, cd: 0.08, max: 3, send: 0.12,
    play(v) {
      M.hiss(v, 0, 0.5, 1, 6000);
      v.crackle(0.02, 0.4, 12, { freq: 5000, gain: 0.035, q: 3 });
      v.bubbles(0.03, 0.35, 5, { f: 700, gain: 0.04 });
      v.tone(0, 0.45, { freq: 180, to: 120, type: 'sawtooth', gain: 0.06, vib: { rate: 9, depth: 18 } });
    },
  },
  gas: { prio: 4, cd: 0.1, max: 2, send: 0.1, play: (v) => { v.noise(0, 0.55, { type: 'highpass', freq: 4500, q: 0.4, sweep: 2500, gain: 0.12, attack: 0.05 }); v.noise(0, 0.3, { type: 'lowpass', freq: 500, gain: 0.08, attack: 0.03 }); } },
  smoke: { prio: 5, cd: 0.07, max: 3, send: 0.15, play: (v) => { v.noise(0, 0.4, { type: 'lowpass', freq: 650 * r(), q: 0.5, sweep: 220, gain: 0.3, attack: 0.03 }); v.whoosh(0, 0.3, { f0: 300, f1: 900, gain: 0.08, color: 'pink' }); } },
  sand: {
    prio: 5, cd: 0.07, max: 3, send: 0.1,
    play(v) {
      v.noise(0, 0.42, { freq: 1900 * r(), q: 0.45, sweep: 900, gain: 0.22, attack: 0.02 });
      v.crackle(0, 0.4, 22, { freq: 4200, gain: 0.045, q: 2.5 });
      v.noise(0.02, 0.3, { type: 'highpass', freq: 3200, gain: 0.05, attack: 0.03 });
    },
  },
  /** PIKA: a bright flash of light that lands with weight (a kick at the speed of light). */
  light: {
    prio: 6, cd: 0.05, max: 3, send: 0.45,
    play(v) {
      v.noise(0, 0.008, { type: 'highpass', freq: 6000, gain: 0.25, attack: 0.0005 });
      v.thump(0, { f0: 160, f1: 60, dur: 0.12, gain: 0.3 });
      v.tone(0, 0.3, { freq: 1760, to: 3520, gain: 0.1, attack: 0.002 });
      v.ring(0.03, 2640, 0.55, 0.03, [1, 1.5, 2]);
      M.shimmer(v, 0.02, 0.8, 0.45);
    },
  },
  /** ZUZUZU: darkness swallowing — a slow swell inward, a sub, grit. */
  dark: {
    prio: 6, cd: 0.08, max: 3, send: 0.3, drive: 1.5,
    play(v) {
      M.suction(v, 0, 0.5, 1);
      v.tone(0, 0.5, { freq: 55, to: 30, gain: 0.42, attack: 0.15 });
      v.crackle(0.05, 0.4, 8, { freq: 900, gain: 0.06, q: 1.5 });
    },
  },
  /** GOGOGO: the air cracks like glass, then the DOGOON and the shaking ground. */
  quake: {
    prio: 8, cd: 0.1, max: 2, send: 0.3, drive: 2.5, duck: 0.5, side: 1, hold: 0.4,
    play(v) {
      // the air cracking like glass; the ground's own deep crack — stone giving way — and the boom; the rumble shaking on
      M.glassCrack(v, 0, 1);
      v.noise(0.004, 0.09, { freq: 520, q: 0.8, gain: 0.5, attack: 0.002 });
      v.crackle(0.006, 0.25, 14, { freq: 900, spread: 1, q: 1.5, gain: 0.18, len: 0.02 });
      M.boom(v, 0.01, 1, { f0: 100, f1: 30, dur: 0.75 });
      v.tone(0.05, 1.4, { freq: 52, to: 32, gain: 0.4, vib: { rate: 13, depth: 7 } });
      M.rumble(v, 0.08, 1.1, 1.6, { lp: 240 });
      v.crackle(0.15, 1, 12, { freq: 1100, gain: 0.07 });
    },
  },
  /** PIN: a wire-thin string — a twang, the whip of it. */
  string: {
    prio: 5, cd: 0.06, max: 3, send: 0.15,
    play(v) {
      v.noise(0, 0.02, { type: 'highpass', freq: 3500, gain: 0.25, attack: 0.0006 });
      v.ring(0, rnd(1500, 1800), 0.32, 0.05, [1, 2.01, 3.03, 4.05], { spread: 0.004 });
      v.whoosh(0, 0.09, { f0: 3000, f1: 6000, q: 2, gain: 0.07, peak: 0.3 });
    },
  },
  /** DOKAAN: crack, boom, the blast rolling away, debris — and the echo of it. */
  explosion: {
    prio: 8, cd: 0.06, max: 3, send: 0.35, drive: 3, duck: 0.6,
    play(v, k) {
      const s = k.s || 1;
      v.noise(0, 0.05, { type: 'highpass', freq: 1500, gain: 0.5 * s, attack: 0.0008 });
      v.thump(0, { f0: 72, f1: 26, dur: 0.9, gain: 0.85 * s });
      v.noise(0, 1.1, { color: 'pink', type: 'lowpass', freq: 900, sweep: 55, gain: 0.7 * s });
      v.crackle(0.08, 0.7, 16, { freq: 1800, gain: 0.1 });
      const e = v.echo(0.28, 0.3, 900, 0.32);
      v.noise(0, 0.5, { color: 'pink', type: 'lowpass', freq: 700, gain: 0.4 * s, dest: e });
    },
  },
  /** BOOM — and the echo off the water. */
  cannon: {
    prio: 7, cd: 0.05, max: 3, send: 0.45, drive: 2.6, duck: 0.5, variants: 3,
    play(v, k) {
      v.noise(0, 0.04, { type: 'highpass', freq: 1600, gain: 0.5, attack: 0.0008 });
      v.thump(0, { f0: [88, 80, 96][k.rr] * r(), f1: 30, dur: 0.8, gain: 0.85 });
      v.noise(0, 1.3, { color: 'pink', type: 'lowpass', freq: 600, sweep: 60, gain: 0.55 });
      v.noise(0.05, 0.4, { type: 'highpass', freq: 3000, gain: 0.04, attack: 0.05 });
      const e = v.echo(0.42, 0.32, 700, 0.4);
      v.noise(0, 0.6, { color: 'pink', type: 'lowpass', freq: 500, gain: 0.45, dest: e });
    },
  },
  /** A hull striking rock (or another hull): a crunch of timber, splinters, the groan of it, spray. */
  crash: {
    prio: 7, cd: 0.15, max: 2, send: 0.2, drive: 1.5, duck: 0.3,
    play(v) {
      v.thump(0, { f0: 100, f1: 45, dur: 0.3, gain: 0.42 });
      v.noise(0, 0.5, { type: 'lowpass', freq: 320, gain: 0.5 });
      v.crackle(0, 0.45, 16, { freq: 1300, gain: 0.12, q: 4 });
      v.creak(0.05, 0.6, { rate: 42, rate1: 24, freqs: [180, 310, 520], q: 5, gain: 0.14 });
      v.noise(0.03, 0.4, { type: 'lowpass', freq: 900, sweep: 250, gain: 0.14 });
    },
  },
  /** Out of shot: the hammer falls on nothing. */
  dry: {
    prio: 6, cd: 0.3, max: 1, send: 0.08,
    play(v) {
      v.noise(0, 0.035, { freq: 3200, q: 3, gain: 0.32, attack: 0.001 });
      v.ring(0.001, 2400, 0.08, 0.03, [1, 2.7]);
      v.noise(0.09, 0.03, { freq: 2400, q: 3, gain: 0.2, attack: 0.001 });
    },
  },

  // ---- moving about
  /** A hop: a push-off scuff on what's underfoot and the rustle of clothes going up (not a ping). */
  jump: {
    prio: 5, cd: 0.1, max: 2, variants: 3,
    play(v, k) {
      v.thump(0, { f0: 95, f1: 60, dur: 0.07, gain: 0.12 });
      surfaceHit(v, 0, k.surf || 'dirt', 1.3);
      v.whoosh(0.012, 0.18, { f0: [600, 700, 520][k.rr] * r(), f1: 1800, q: 0.8, gain: 0.13, peak: 0.4, flutter: 22 });
    },
  },
  /** A charged leap: a heavy push, a burst of what's underfoot, air rushing past going up. */
  jump_big: {
    prio: 6, cd: 0.15, max: 2, send: 0.06, variants: 3,
    play(v, k) {
      v.thump(0, { f0: [120, 110, 132][k.rr] * r(), f1: 55, dur: 0.12, gain: 0.3 });
      surfaceHit(v, 0, k.surf || 'dirt', 1.8);
      v.crackle(0.005, 0.1, 5, { freq: 1600, gain: 0.04 });
      v.whoosh(0.01, 0.38, { f0: [400, 480, 360][k.rr], f1: 2600, q: 0.7, gain: 0.17, peak: 0.35, flutter: 18 });
      v.tone(0, 0.12, { freq: 90, to: 140, gain: 0.08 });
    },
  },
  /** Coming down from a jump: both feet on what's underfoot, the clothes settling. */
  land: {
    prio: 5, cd: 0.1, max: 2,
    play(v, k) {
      const s = clamp(k.s ?? 0.8, 0.3, 1.2);
      v.thump(0, { f0: 100, f1: 48, dur: 0.09, gain: 0.22 * s });
      surfaceHit(v, 0, k.surf || 'dirt', s);
      surfaceHit(v, 0.035, k.surf || 'dirt', s * 0.6);
      v.whoosh(0.01, 0.12, { f0: 1500, f1: 600, gain: 0.03 * s, peak: 0.3 });
    },
  },
  /** A hard landing: a heavy thud, debris, dust. */
  land_heavy: {
    prio: 6, cd: 0.15, max: 2, send: 0.1, drive: 1.4, duck: 0.15,
    play(v, k) {
      v.noise(0, 0.18, { type: 'lowpass', freq: 260, gain: 0.42 });
      v.thump(0, { f0: 110, f1: 40, dur: 0.2, gain: 0.45 });
      surfaceHit(v, 0, k.surf || 'dirt', 1.6);
      v.crackle(0.01, 0.15, 5, { freq: 1200, gain: 0.05 });
    },
  },
  /**
   * Into the water — sized by how hard you hit it (`k.v`, metres a second:
   * a step in, a hop, a dive off a ship's deck): see motifs.js plunge.
   */
  splash: { prio: 5, cd: 0.18, max: 2, send: 0.08, play: (v, k) => M.plunge(v, 0, splashSize(k, 0.45)) },
  /** Into the water from a height (or something big in it): the same, bigger, its spray raining back for a second and more. */
  splash_big: { prio: 6, cd: 0.25, max: 2, send: 0.15, duck: 0.15, side: 0.6, play: (v, k) => M.plunge(v, 0, splashSize(k, 1)) },
  /**
   * Out of the water (leaping out, or hauling yourself out onto a ledge or a
   * deck): the water letting go of you with a sucking shloop, and pouring off
   * — a stream at first, then drips, fewer and fewer.
   */
  splash_out: {
    prio: 5, cd: 0.2, max: 2,
    play(v) {
      v.noise(0, 0.3, { type: 'lowpass', freq: 300, sweep: 1400, gain: 0.55, attack: 0.08 });
      v.tone(0.06, 0.12, { freq: 260, to: 560, gain: 0.13, attack: 0.01 });
      v.noise(0.12, 0.7, { freq: 2200, q: 0.6, sweep: 1400, gain: 0.25, attack: 0.03 });
      v.bubbles(0.1, 0.25, 5, { f: 900, spread: 0.9, gain: 0.06 });
      // (drips: dense as the water streams off, thinning out)
      for (let i = 0; i < 18; i++) v.bubble(0.15 + Math.pow(Math.random(), 1.8) * 1.1, { f: rnd(1300, 3200), rise: rnd(1.3, 1.9), dur: rnd(0.015, 0.03), gain: rnd(0.03, 0.07) });
    },
  },
  /** Wading: water sloshing round the legs. */
  wade: {
    prio: 3, cd: 0.18, max: 2, variants: 3,
    play(v, k) {
      v.noise(0, 0.2, { freq: [1400, 1200, 1650][k.rr] * r(), q: 0.8, sweep: 600, gain: 0.09 });
      v.noise(0, 0.16, { type: 'lowpass', freq: 500, gain: 0.08, attack: 0.02 });
      v.bubbles(0.02, 0.12, 2, { f: 700, gain: 0.025 });
    },
  },
  /** Breaking the surface out of breath: a long, hungry gulp of air. */
  gasp: {
    prio: 7, cd: 1, max: 1,
    play(v) {
      v.noise(0, 0.1, { freq: 1200, sweep: 500, gain: 0.12 });
      v.formant(0.03, 0.5, { f1: 800, f2: 1600, to1: 1100, to2: 2300, q: 3, gain: 0.45, attack: 0.08 });
      v.formant(0.6, 0.3, { f1: 700, f2: 1200, to1: 500, to2: 900, q: 3, gain: 0.18, attack: 0.04 });
      M.drips(v, 0.05, 0.5, 4, 0.8);
    },
  },
  /** Out of air under water: the last bubbles gurgling out, a muffled cough. */
  choke: {
    prio: 7, cd: 0.5, max: 1,
    play(v) {
      for (let i = 0; i < 5; i++) v.tone(i * 0.07 * r(), 0.08, { freq: 170 + Math.random() * 140, to: 420 + Math.random() * 200, gain: 0.12 });
      v.noise(0, 0.35, { type: 'lowpass', freq: 380, gain: 0.12 });
      v.formant(0.1, 0.18, { f1: 400, f2: 800, q: 3, gain: 0.3, attack: 0.01 });
    },
  },
  // ---- swimming (played in time with the strokes: see foley.js)
  /** The breaststroke's pull: the arms sweeping the water back, a swirl and a little splash. */
  swim_pull: {
    prio: 4, cd: 0.25, max: 2, variants: 3,
    play(v, k) {
      v.whoosh(0, 0.36, { f0: [520, 460, 600][k.rr], f1: 300, q: 0.8, gain: 0.2, peak: 0.4, color: 'pink' });
      v.noise(0.03, 0.16, { type: 'lowpass', freq: 1600, sweep: 600, gain: 0.08 });
      v.bubbles(0.05, 0.2, 2, { f: 480, gain: 0.03 });
    },
  },
  /** The frog kick: the water shoved back, a splash at the heels. */
  swim_kick: {
    prio: 4, cd: 0.25, max: 2,
    play(v) {
      v.thump(0, { f0: 95, f1: 60, dur: 0.09, gain: 0.07 });
      v.noise(0, 0.22, { type: 'lowpass', freq: 1300, sweep: 400, gain: 0.07, attack: 0.01 });
      M.drips(v, 0.08, 0.25, 2, 0.7);
    },
  },
  /** The breath at the top of the stroke. */
  swim_breath: { prio: 3, cd: 0.6, max: 1, play: (v) => v.formant(0, 0.13, { f1: 700, f2: 1250, to1: 600, to2: 1100, q: 3, gain: 0.15, attack: 0.02 }) },
  /** A stroke under water: a muffled sweep and a few bubbles. */
  swim_under: {
    prio: 4, cd: 0.3, max: 2,
    play(v) { v.whoosh(0, 0.42, { f0: 320, f1: 180, q: 0.7, gain: 0.25, peak: 0.45, color: 'pink' }); v.bubbles(0.05, 0.3, 3, { f: 420, gain: 0.05 }); },
  },
  /** Treading water: a gentle slosh. */
  tread: { prio: 3, cd: 0.6, max: 1, play: (v) => { v.noise(0, 0.26, { type: 'lowpass', freq: 900, sweep: 500, gain: 0.08, attack: 0.04 }); v.bubble(0.08, { f: rnd(400, 600), gain: 0.03 }); } },
  /** Thrashing at the surface (a Devil Fruit user who can't swim). */
  thrash: {
    prio: 5, cd: 0.15, max: 2,
    play(v) { v.noise(0, 0.2, { type: 'lowpass', freq: 2000, sweep: 500, gain: 0.12, attack: 0.004 }); v.bubbles(0.02, 0.15, 3, { f: 450, gain: 0.04 }); M.drips(v, 0.1, 0.3, 3, 1); },
  },
  /** Going under: a gloop, and a burst of bubbles. */
  dive: {
    prio: 6, cd: 0.4, max: 1,
    play(v) {
      v.noise(0, 0.25, { type: 'lowpass', freq: 900, sweep: 300, gain: 0.15 });
      v.thump(0, { f0: 120, f1: 60, dur: 0.12, gain: 0.12 });
      v.bubbles(0.02, 0.35, 8, { f: 480, spread: 0.9, gain: 0.05 });
    },
  },
  /** The head breaking the surface: water running off, a breath out. */
  surface: {
    prio: 5, cd: 0.4, max: 1,
    play(v) {
      v.noise(0, 0.22, { freq: 1500, sweep: 600, q: 0.6, gain: 0.08 });
      M.drips(v, 0.05, 0.4, 4, 0.8);
      v.formant(0.06, 0.16, { f1: 600, f2: 1100, q: 4, gain: 0.15, attack: 0.01 });
    },
  },
  /** A scramble up a ledge: hands slapping on, boots scraping, the clothes. */
  climb: {
    prio: 5, cd: 0.3, max: 1,
    play(v, k) {
      v.thump(0, { f0: 160, f1: 100, dur: 0.05, gain: 0.1 });
      surfaceHit(v, 0.01, k.surf || 'stone', 0.7);
      v.noise(0.12, 0.25, { freq: 1500, q: 0.8, gain: 0.04, attack: 0.03 });
      v.whoosh(0.05, 0.3, { f0: 600, f1: 1600, gain: 0.04, flutter: 20 });
      surfaceHit(v, 0.32, k.surf || 'stone', 0.5);
    },
  },
  /** A step up onto a boat, a plank or a ladder: wood under the boot, the hull answering. */
  board: {
    prio: 5, cd: 0.1, max: 2, send: 0.06,
    play(v) {
      v.noise(0, 0.1, { freq: 280 * r(), q: 1.2, gain: 0.22, attack: 0.002 });
      v.thump(0, { f0: 140, f1: 90, dur: 0.07, gain: 0.12 });
      v.tone(0.01, 0.18, { freq: 110 * r(), to: 96, gain: 0.07 });
      v.creak(0.06, 0.25, { rate: 70, rate1: 50, freqs: [250, 395, 560], gain: 0.05 });
    },
  },
  step: {
    prio: 4, cd: 0.08, max: 2,
    play(v, k) {
      // (a hand on a ladder's rung: a wooden knock)
      v.noise(0, 0.05, { freq: 900 * r(), q: 2.5, gain: 0.12, attack: 0.001 });
      v.tone(0, 0.06, { freq: 240 * r(), to: 190, gain: 0.07 });
      if (k.creak) v.creak(0.02, 0.2, { rate: 80, rate1: 60, freqs: [300, 520, 760], gain: 0.04 });
    },
  },

  // ---- the ship
  // (an oar through the water, as recorded from a rowing boat, is bright: each
  // stroke a splashing, gurgling burst with most of its energy at 1–8 kHz, and
  // a knock of the loom in its rowlock — not a dull low swish)
  /** An oar's blade dipping in at the catch: the splosh, the gulp of a pocket of air, the loom knocking home in its lock. */
  oar_catch: {
    prio: 4, cd: 0.05, max: 3, variants: 3,
    play(v, k) {
      const s = k.s || 1;
      v.noise(0, 0.09, { freq: [2600, 3200, 2200][k.rr] * r(), q: 0.7, sweep: 1400, gain: 0.32 * s, attack: 0.003 });
      v.noise(0, 0.11, { type: 'lowpass', freq: 900, sweep: 350, gain: 0.2 * s, attack: 0.004 });
      v.bubble(0.006, { f: rnd(260, 420), rise: 1.6, dur: 0.07, gain: 0.14 * s });
      v.bubbles(0.01, 0.1, 4, { f: 900, spread: 0.8, gain: 0.05 * s });
      // the rowlock: a wooden clock as the loom takes the load
      v.tone(0.012, 0.04, { freq: rnd(560, 700), to: 480, gain: 0.07 * s, attack: 0.0008 });
      v.noise(0.012, 0.008, { freq: 2400, q: 2, gain: 0.08 * s, attack: 0.0005 });
    },
  },
  /** The drive: water swirling and gurgling past the blade as it's pulled through, the rowlock squeaking under the load. */
  oar_pull: {
    prio: 4, cd: 0.1, max: 3,
    play(v, k) {
      const s = k.s || 1, d = k.dur || 0.45;
      // (the swirl: eddies shed off the blade — a bright band falling as it slows, trembling)
      v.noise(0, d, { freq: 3200 * r(), sweep: 1300, q: 0.8, gain: 0.2 * s, attack: d * 0.25, am: { rate: rnd(9, 14), depth: 0.5 } });
      v.noise(0.02, d * 0.9, { type: 'lowpass', freq: 700, sweep: 300, gain: 0.12 * s, attack: d * 0.3 });
      v.bubbles(0.05, d * 0.8, 7, { f: 1100, spread: 0.9, gain: 0.04 * s, dur: 0.04 });
      v.creak(0.02, 0.2, { rate: 140, rate1: 90, freqs: [600, 950, 1400], q: 8, gain: 0.09 * s });
    },
  },
  /** The blade lifting out: a flick of water, drips running off it, the loom knocking in its lock as it's feathered. */
  oar_release: {
    prio: 3, cd: 0.1, max: 3,
    play(v, k) {
      const s = k.s || 1;
      v.noise(0, 0.08, { freq: 4200 * r(), sweep: 2400, q: 0.8, gain: 0.16 * s, attack: 0.004 });
      M.drips(v, 0.06, 0.4, 5, s * 2);
      v.tone(0.12, 0.035, { freq: rnd(480, 620), to: 400, gain: 0.07 * s, attack: 0.0008 });
      v.noise(0.12, 0.008, { freq: 2000, q: 2, gain: 0.06 * s, attack: 0.0005 });
    },
  },
  /** Letting go the anchor: the windlass spinning, the chain running out, the splash. */
  anchor_drop: {
    prio: 5, cd: 1, max: 1, send: 0.1,
    play(v) {
      for (let i = 0; i < 16; i++) v.noise(i * 0.065 * (1 + i * 0.02), 0.006, { freq: 2400, q: 6, gain: 0.05, attack: 0.0005 });
      M.chain(v, 0.02, 1.2, 18, 1);
      M.splash(v, 0.55, 0.9);
    },
  },
  /** Weighing anchor: the windlass clacking round, the chain coming in, water running off it. */
  anchor_weigh: {
    prio: 5, cd: 1, max: 1, send: 0.1,
    play(v) {
      for (let i = 0; i < 9; i++) { v.noise(i * 0.16, 0.012, { freq: 1600, q: 4, gain: 0.07, attack: 0.0006 }); v.thump(i * 0.16, { f0: 260, f1: 180, dur: 0.03, gain: 0.04 }); }
      M.chain(v, 0.05, 1.3, 10, 0.8);
      M.drips(v, 0.2, 1.2, 8, 0.8);
    },
  },
  /** Sails set: canvas unfurling and filling with a flap or two, the halyard squealing through its block. */
  sail_raise: {
    prio: 5, cd: 0.8, max: 1, send: 0.06,
    play(v) {
      v.whoosh(0, 0.7, { f0: 300, f1: 1200, q: 0.6, gain: 0.12, peak: 0.3, flutter: 9, color: 'pink' });
      for (const [t, g] of [[0.15, 0.14], [0.36, 0.1], [0.62, 0.07]]) v.noise(t, 0.08, { type: 'lowpass', freq: 800, gain: g, attack: 0.004 });
      v.creak(0, 0.55, { rate: 220, rate1: 160, freqs: [900, 1500, 2200], q: 9, gain: 0.035 });
    },
  },
  /** Sails struck: the canvas spilling its wind and coming down, the boom thudding home. */
  sail_lower: {
    prio: 5, cd: 0.8, max: 1, send: 0.06,
    play(v) {
      v.whoosh(0, 0.6, { f0: 1100, f1: 300, q: 0.6, gain: 0.1, peak: 0.25, flutter: 7, color: 'pink' });
      v.creak(0.05, 0.4, { rate: 180, rate1: 230, freqs: [900, 1500, 2200], q: 9, gain: 0.03 });
      v.thump(0.55, { f0: 140, f1: 90, dur: 0.08, gain: 0.12 });
    },
  },
  /** The wheel turning: a spoke clicking past the pawl. */
  helm: { prio: 3, cd: 0.05, max: 2, play: (v) => { v.noise(0, 0.015, { freq: 1800 * r(), q: 4, gain: 0.1, attack: 0.0006 }); v.tone(0, 0.025, { freq: 620 * r(), to: 520, gain: 0.04 }); } },
  /** The hull groaning on a swell (stick-slip in the timbers). */
  hull_creak: {
    prio: 2, cd: 0.4, max: 2, send: 0.1,
    play(v, k) {
      const d = rnd(0.5, 1.2) * (k.s || 1);
      v.creak(0, d, { rate: rnd(28, 60), rate1: rnd(22, 70), freqs: [120, 210, 340, 520], q: 5, gain: rnd(0.06, 0.12) * (k.s || 1), attack: rnd(0.3, 0.6) });
    },
  },
  /** Rigging working: a line creaking through a block, the slap of a slack sheet. */
  rigging: {
    prio: 2, cd: 0.4, max: 2, send: 0.08,
    play(v) {
      if (Math.random() < 0.5) v.creak(0, rnd(0.25, 0.5), { rate: rnd(120, 200), rate1: rnd(90, 160), freqs: [500, 800, 1250], q: 8, gain: 0.04 });
      else { v.noise(0, 0.06, { type: 'lowpass', freq: 600, gain: 0.08, attack: 0.003 }); v.noise(0.08, 0.05, { type: 'lowpass', freq: 500, gain: 0.04 }); }
      if (Math.random() < 0.4) v.noise(0.03, 0.012, { freq: 1400, q: 4, gain: 0.05, attack: 0.0006 });
    },
  },
  /** A wave slapping the hull (and the spray off the bow). */
  hull_slap: {
    prio: 2, cd: 0.25, max: 2,
    play(v, k) {
      const s = k.s || 1;
      v.noise(0, 0.22, { type: 'lowpass', freq: 1100, sweep: 300, gain: 0.12 * s, attack: 0.01 });
      v.thump(0, { f0: 120, f1: 70, dur: 0.1, gain: 0.08 * s });
      if (s > 0.8) M.drips(v, 0.08, 0.4, 4, s * 0.8);
    },
  },

  // ---- doors, loot and the like
  knock: {
    prio: 5, cd: 0.4, max: 1, send: 0.12,
    play(v) {
      [0, 0.17, 0.34].forEach((t) => {
        v.noise(t, 0.07, { freq: 900 * r(), q: 3, gain: 0.25 });
        v.noise(t, 0.07, { freq: 260 * r(), q: 1.6, gain: 0.45 });
        v.tone(t, 0.09, { freq: 200 * r(), to: 150, gain: 0.22 });
      });
    },
  },
  /** The latch clicks, the hinges creak (opening a chest: the lid). */
  door: {
    prio: 5, cd: 0.2, max: 2, send: 0.1,
    play(v, k) {
      if (k.chest) {
        v.ring(0, 1800, 0.08, 0.03, [1, 2.4]);
        v.noise(0, 0.015, { freq: 2600, q: 3, gain: 0.15, attack: 0.0006 });
        v.creak(0.04, 0.45, { rate: 50, rate1: 85, freqs: [300, 520, 760], q: 6, gain: 0.08 });
        v.thump(0.42, { f0: 160, f1: 110, dur: 0.07, gain: 0.12 });
        return;
      }
      v.noise(0, 0.03, { freq: 2600, q: 2, gain: 0.2, attack: 0.001 });
      v.ring(0.002, 1500, 0.08, 0.02, [1, 2.3]);
      v.creak(0.04, 0.5, { rate: 70 * r(), rate1: 110, freqs: [400, 650, 900, 1300], q: 7, gain: 0.2 });
      v.noise(0.04, 0.3, { freq: 900, q: 0.6, gain: 0.06 });
    },
  },
  doorshut: {
    prio: 5, cd: 0.2, max: 2, send: 0.12,
    play(v) {
      v.noise(0, 0.12, { type: 'lowpass', freq: 220, gain: 0.32 });
      v.thump(0, { f0: 95, f1: 60, dur: 0.12, gain: 0.3 });
      v.noise(0.04, 0.02, { freq: 2600, q: 3, gain: 0.1, attack: 0.0008 });
    },
  },
  /** BAKOOM: a door kicked in — splintering timber, the crash of it. */
  doorbreak: {
    prio: 7, cd: 0.3, max: 1, send: 0.2, drive: 2, duck: 0.3,
    play(v) {
      v.noise(0, 0.6, { type: 'lowpass', freq: 320, gain: 0.7 });
      v.noise(0, 0.35, { freq: 2600, sweep: 700, gain: 0.3 });
      v.thump(0, { f0: 110, f1: 45, dur: 0.3, gain: 0.5 });
      v.crackle(0, 0.4, 14, { freq: 1500, gain: 0.12, q: 4 });
      v.creak(0.05, 0.3, { rate: 50, rate1: 30, freqs: [200, 340, 520], gain: 0.1 });
    },
  },
  /** Coins: a bright two-note "kaching" over a little clatter. */
  coin: {
    prio: 6, cd: 0.05, max: 2, send: 0.15, bus: 'ui',
    play(v) {
      for (let i = 0; i < 3; i++) v.ring(i * 0.03 + Math.random() * 0.02, rnd(3800, 5200), 0.07, 0.015, [1, 2.4]);
      v.ring(0, 1568, 0.18, 0.07, [1, 2.76]);
      v.ring(0.07, 2093, 0.3, 0.07, [1, 2.76]);
    },
  },
  treasure: {
    prio: 7, cd: 0.3, max: 1, send: 0.3, bus: 'ui', duck: 0.25,
    play(v) {
      [523, 659, 784, 1046].forEach((f, i) => v.tone(i * 0.09, 0.35, { freq: f, type: 'triangle', gain: 0.14 }));
      v.ring(0.36, 2093, 0.5, 0.04, [1, 2.76, 5.4]);
      M.chain(v, 0, 0.3, 5, 0.6);
    },
  },
  bell: { prio: 6, cd: 1, max: 1, send: 0.5, play: (v) => v.ring(0, 196, 3.2, 0.2, [0.5, 1, 1.2, 1.5, 2, 2.6, 3.0]) },
  /** Eating: a few bites and chews, and a gulp. */
  eat: {
    prio: 5, cd: 0.3, max: 1,
    play(v) {
      for (const t of [0, 0.13, 0.24]) { v.noise(t, 0.07, { freq: rnd(900, 1400), q: 1.2, gain: 0.16 }); v.crackle(t, 0.05, 3, { freq: 2600, gain: 0.04 }); }
      v.tone(0.4, 0.12, { freq: 300, to: 120, gain: 0.08 });
      v.formant(0.4, 0.1, { f1: 300, f2: 700, q: 3, gain: 0.15, attack: 0.01 });
    },
  },
  /** A turn of bandage round the arm: cloth drawn tight, a soft rasp. */
  wrap: {
    prio: 4, cd: 0.3, max: 1, variants: 3,
    play(v, k) {
      v.noise(0, 0.22, { freq: [2400, 2800, 2100][k.rr] * r(), sweep: 1600, q: 1.1, gain: 0.07, attack: 0.04, curve: 'lin' });
      v.noise(0.16, 0.06, { freq: 900, q: 2, gain: 0.05, attack: 0.005 });
    },
  },
  /** The bandage tied off: a tug and a pat. */
  wrap_done: {
    prio: 5, cd: 0.3, max: 1,
    play(v) {
      v.noise(0, 0.12, { freq: 1800, sweep: 3200, q: 1.4, gain: 0.08, attack: 0.01 });
      v.tone(0.13, 0.06, { freq: 180, to: 120, gain: 0.12, attack: 0.004 });
      v.tone(0.24, 0.05, { freq: 170, to: 115, gain: 0.09, attack: 0.004 });
    },
  },
  /** GULP: a swallow of water, a little glug behind it. */
  sip: {
    prio: 5, cd: 0.25, max: 1, variants: 3,
    play(v, k) {
      v.tone(0, 0.09, { freq: [420, 470, 390][k.rr] * r(), to: 230, gain: 0.12, attack: 0.008 });
      v.noise(0.02, 0.07, { freq: 900, q: 2.5, gain: 0.06, attack: 0.01 });
      v.tone(0.1, 0.07, { freq: 300 * r(), to: 520, gain: 0.07, attack: 0.01 });
    },
  },
  /** CHOMP: teeth through something crisp, a little crunch after. */
  bite: {
    prio: 5, cd: 0.18, max: 1, variants: 3,
    play(v, k) {
      v.noise(0, 0.05, { freq: [1800, 1500, 2100][k.rr] * r(), q: 1.4, gain: 0.22, attack: 0.002 });
      v.crackle(0.02, 0.12, 5, { freq: 2600, gain: 0.07 });
      v.tone(0, 0.07, { freq: 150 * r(), to: 90, gain: 0.12 });
    },
  },
  /** Gear: a leather creak and a buckle's clink (a blade drawn: a "shing"; sheathed: the guard's click). */
  equip: {
    prio: 5, cd: 0.05, max: 2, send: 0.08,
    play(v, k) {
      if (k.draw === 'sword') {
        v.noise(0, 0.25, { freq: 3500, sweep: 6500, q: 3, gain: 0.08, attack: 0.05, curve: 'lin' });
        v.ring(0.22, rnd(2100, 2400), 0.5, 0.03, [1, 2.04, 2.75]);
        return;
      }
      if (k.draw === 'sheathe') {
        v.noise(0, 0.18, { freq: 4000, sweep: 2000, q: 3, gain: 0.06 });
        v.noise(0.19, 0.01, { type: 'highpass', freq: 4000, gain: 0.18, attack: 0.0006 });
        v.ring(0.19, 1900, 0.12, 0.04, [1, 2.3]);
        return;
      }
      if (k.draw === 'gun') { for (const t of [0, 0.09]) { v.noise(t, 0.02, { freq: 3000, q: 3, gain: 0.2, attack: 0.0006 }); v.ring(t, 2200, 0.06, 0.02, [1, 2.7]); } return; }
      v.noise(0, 0.05, { freq: 2000, q: 1, gain: 0.1, attack: 0.004 });
      v.noise(0, 0.03, { freq: 3500, q: 1.5, gain: 0.12, attack: 0.001 });
      v.ring(0.01, 1900, 0.18, 0.045, [1, 1.6]);
    },
  },
  // ---- SFX pass 3: the small moments that were silent
  /** A boss's name slamming onto the screen: a taiko hit, a cymbal crash and a brass stab. */
  boss_intro: {
    prio: 9, cd: 1, max: 1, send: 0.4, drive: 1.2, bus: 'ui', duck: 0.6,
    play(v) {
      v.thump(0, { f0: 120, f1: 40, dur: 0.6, gain: 0.8, click: 0.4 });
      v.noise(0, 0.02, { type: 'highpass', freq: 1800, gain: 0.5, attack: 0.0005 });
      v.noise(0.01, 1.4, { type: 'highpass', freq: 4000, gain: 0.12, attack: 0.002 });
      [196, 233, 294].forEach((f) => { v.tone(0.02, 0.7, { freq: f, type: 'sawtooth', gain: 0.06, attack: 0.01 }); v.tone(0.02, 0.7, { freq: f * 1.005, type: 'sawtooth', gain: 0.04, attack: 0.01 }); });
      v.thump(0.42, { f0: 90, f1: 35, dur: 0.5, gain: 0.5 });
    },
  },
  /** A lid lifted: the hasp's click, the hinge's long creak, the lid laid back. */
  chest_open: {
    prio: 5, cd: 0.2, max: 1, send: 0.1,
    play(v) {
      v.ring(0, 1900, 0.07, 0.035, [1, 2.4]);
      v.noise(0, 0.014, { freq: 2800, q: 3, gain: 0.16, attack: 0.0006 });
      v.creak(0.05, 0.55, { rate: 42, rate1: 75, freqs: [260, 470, 700], q: 6, gain: 0.09 });
      v.thump(0.55, { f0: 150, f1: 100, dur: 0.08, gain: 0.12 });
      v.noise(0.55, 0.06, { type: 'lowpass', freq: 500, gain: 0.08 });
    },
  },
  /** Sitting down: wood taking the weight, cloth settling. */
  sit: {
    prio: 3, cd: 0.3, max: 1, send: 0.05,
    play(v) {
      v.creak(0.02, 0.28, { rate: rnd(55, 80), rate1: rnd(30, 50), freqs: [180, 300, 460], q: 6, gain: 0.08 });
      v.thump(0.04, { f0: 130, f1: 80, dur: 0.08, gain: 0.1 });
      v.noise(0.02, 0.2, { freq: 1800, q: 0.7, gain: 0.03, attack: 0.03 });
    },
  },
  /** Getting up: the seat's creak let go, a step. */
  stand: {
    prio: 3, cd: 0.3, max: 1, send: 0.05,
    play(v) {
      v.creak(0, 0.18, { rate: rnd(70, 95), rate1: rnd(90, 120), freqs: [200, 330, 500], q: 6, gain: 0.06 });
      v.noise(0.02, 0.15, { freq: 1600, q: 0.7, gain: 0.025, attack: 0.02 });
      v.thump(0.16, { f0: 140, f1: 90, dur: 0.06, gain: 0.08 });
    },
  },
  /** Lying down to sleep: a soft falling lullaby, three notes. */
  sleep: {
    prio: 6, cd: 1, max: 1, send: 0.4, bus: 'ui',
    play: (v) => [659, 523, 392].forEach((f, i) => { v.tone(i * 0.28, 0.9, { freq: f, type: 'sine', gain: 0.07, attack: 0.04 }); v.tone(i * 0.28, 0.9, { freq: f * 2, type: 'sine', gain: 0.012, attack: 0.04 }); }),
  },
  /** Waking: a morning gull's call over a bright rising chime. */
  wake: {
    prio: 6, cd: 1, max: 1, send: 0.35, bus: 'ui',
    play(v) {
      [392, 523, 659, 784].forEach((f, i) => v.tone(i * 0.12, 0.6, { freq: f, type: 'triangle', gain: 0.06, attack: 0.01 }));
      v.chirp(0.5, { f0: 2400, f1: 1500, dur: 0.22, gain: 0.03, warble: 18 });
      v.chirp(0.78, { f0: 2300, f1: 1400, dur: 0.18, gain: 0.025, warble: 18 });
    },
  },
  /** Someone turns to talk to you: a short breath of paper and a low "hm". */
  talk: {
    prio: 4, cd: 0.25, max: 1, bus: 'ui',
    play(v) {
      v.noise(0, 0.08, { type: 'highpass', freq: 3200, gain: 0.04, attack: 0.008 });
      v.vox(0.02, 0.16, { f0: rnd(130, 170), to0: rnd(110, 140), f1: 520, f2: 1100, q: 6, gain: 0.05 });
    },
  },
  /** The next line of a conversation: a little blip. */
  talk_next: { prio: 2, cd: 0.05, max: 1, bus: 'ui', play: (v) => { v.tone(0, 0.04, { freq: rnd(620, 700), to: 560, type: 'triangle', gain: 0.03 }); } },
  /** A chart handled: the rustle of the parchment as it's dragged. */
  map_rustle: {
    prio: 2, cd: 0.18, max: 1, bus: 'ui',
    play(v) {
      v.noise(0, rnd(0.12, 0.2), { freq: rnd(2600, 3800), q: 0.6, gain: 0.025, attack: 0.02 });
      v.crackle(0.01, 0.12, 4, { freq: 3500, gain: 0.015, q: 2 });
    },
  },
  /** Zooming the chart or globe in or out: a soft tick, higher going in. */
  map_zoom: { prio: 2, cd: 0.06, max: 1, bus: 'ui', play: (v, k) => { v.tone(0, 0.03, { freq: k.in ? 1500 : 1000, to: k.in ? 1800 : 850, gain: 0.02 }); } },
  /** Crouching / standing from a crouch: cloth and leather shifting. */
  crouch: {
    prio: 2, cd: 0.2, max: 1,
    play(v, k) {
      v.noise(0, 0.16, { freq: k.up ? 1900 : 1400, q: 0.8, gain: 0.04, attack: 0.02 });
      v.creak(0.03, 0.08, { rate: 120, rate1: 90, freqs: [600, 900], q: 7, gain: 0.015 });
    },
  },
  /** Gathering for a big jump: a rising strain. */
  charge: {
    prio: 3, cd: 0.6, max: 1,
    play(v) {
      v.whoosh(0, 0.6, { f0: 300, f1: 1400, gain: 0.04, peak: 0.95 });
      v.tone(0, 0.6, { freq: 110, to: 220, type: 'triangle', gain: 0.03, attack: 0.3 });
    },
  },
  /** Cannons loaded again: the ramrod's thud, the carriage run out. */
  cannon_load: {
    prio: 4, cd: 0.8, max: 1, send: 0.12,
    play(v) {
      v.thump(0, { f0: 120, f1: 80, dur: 0.08, gain: 0.12 });
      v.noise(0.12, 0.35, { type: 'lowpass', freq: 260, gain: 0.12, attack: 0.04 });
      v.ring(0.46, 700, 0.12, 0.03, [1, 2.2, 3.1]);
      v.thump(0.46, { f0: 100, f1: 60, dur: 0.1, gain: 0.12 });
    },
  },
  /** A hull grinding along rock or another ship. */
  scrape: {
    prio: 5, cd: 0.5, max: 1, send: 0.12,
    play(v, k) {
      const s = k.s || 1;
      v.noise(0, 0.5, { type: 'lowpass', freq: 380, gain: 0.18 * s, attack: 0.05 });
      v.creak(0, 0.5, { rate: rnd(20, 35), rate1: rnd(15, 30), freqs: [140, 230, 380], q: 4, gain: 0.08 * s, attack: 0.1 });
      v.crackle(0.05, 0.4, 8, { freq: 1200, gain: 0.04 * s, q: 3 });
    },
  },
  /** Somewhere new: a rising four-note stinger, airy and open. */
  arrive: {
    prio: 7, cd: 2, max: 1, send: 0.45, bus: 'ui', duck: 0.3,
    play(v) {
      [294, 392, 494, 587].forEach((f, i) => { v.tone(i * 0.13, 0.9 - i * 0.12, { freq: f, type: 'triangle', gain: 0.09, attack: 0.01 }); v.tone(i * 0.13, 0.7, { freq: f * 1.5, type: 'sine', gain: 0.02 }); });
      v.whoosh(0, 0.8, { f0: 400, f1: 2400, gain: 0.03, peak: 0.7 });
    },
  },
  /** Carried away in a moment: a rising rush that cuts off. */
  warp: {
    prio: 5, cd: 0.4, max: 1, bus: 'ui',
    play(v) { v.whoosh(0, 0.35, { f0: 500, f1: 3200, gain: 0.07, peak: 0.85 }); v.tone(0.05, 0.3, { freq: 600, to: 1200, type: 'sine', gain: 0.03 }); },
  },
  /** Iron bars swung shut: a clang and its long ring. */
  cell_door: {
    prio: 6, cd: 0.5, max: 1, send: 0.35,
    play(v) {
      v.noise(0, 0.02, { freq: 2200, q: 2, gain: 0.25, attack: 0.0005 });
      v.ring(0, 420, 1.1, 0.12, [1, 1.47, 2.09, 2.95, 3.9]);
      v.thump(0, { f0: 110, f1: 60, dur: 0.12, gain: 0.2 });
    },
  },
  page: {
    prio: 5, cd: 0.1, max: 1, bus: 'ui',
    play(v) {
      v.noise(0, 0.12, { type: 'highpass', freq: 3000, gain: 0.07, attack: 0.01 });
      v.noise(0.08, 0.14, { freq: 4000, q: 0.6, gain: 0.05, attack: 0.02 });
      v.whoosh(0.02, 0.2, { f0: 1500, f1: 3000, gain: 0.02, flutter: 30 });
    },
  },
  reveal: { prio: 7, cd: 0.3, max: 1, send: 0.3, bus: 'ui', play: (v) => [392, 494, 587].forEach((f, i) => v.tone(i * 0.1, 0.4, { freq: f, type: 'triangle', gain: 0.16 })) },
  /** Ta-ta-ta-DAAA: a brassy run up to a held chord. */
  fanfare: {
    prio: 8, cd: 0.5, max: 1, send: 0.35, drive: 0.4, bus: 'ui', duck: 0.5,
    play(v) {
      [523, 659, 784, 1046].forEach((f, i) => { v.tone(i * 0.1, 0.24, { freq: f, type: 'sawtooth', gain: 0.06 }); v.tone(i * 0.1, 0.24, { freq: f, type: 'triangle', gain: 0.12 }); });
      [523, 659, 784, 1046].forEach((f) => v.tone(0.42, 0.95, { freq: f, type: 'triangle', gain: 0.065, attack: 0.02 }));
      v.ring(0.42, 2093, 0.6, 0.03, [1, 2.76]);
    },
  },
  breakthrough: {
    prio: 8, cd: 0.5, max: 1, send: 0.35, drive: 0.6, bus: 'ui', duck: 0.4,
    play(v) {
      [440, 554, 659, 880].forEach((f, i) => v.tone(i * 0.07, 0.45, { freq: f, type: 'sawtooth', gain: 0.06 }));
      v.tone(0, 0.6, { freq: 55, to: 110, gain: 0.2 });
      M.shimmer(v, 0.25, 0.8, 0.6);
    },
  },
  /** A Sea King rising: the water heaving, and its roar. */
  seaking: {
    prio: 8, cd: 1, max: 1, send: 0.5, drive: 1.5, duck: 0.4,
    play(v) {
      v.noise(0, 1.2, { type: 'lowpass', freq: 700, sweep: 200, gain: 0.3, attack: 0.2 });
      M.roar(v, 0.25, 1.2, 1.6, 64);
      v.tone(0.2, 1.8, { freq: 72, to: 44, type: 'sawtooth', gain: 0.2, attack: 0.3, vib: { rate: 3, depth: 4 } });
      M.drips(v, 0.6, 1.2, 10, 1.4);
    },
  },

  // ---- menus and milestones (on the ui bus: never muffled, never far away)
  // the race roll's wheel clicking past each name (a wooden ratchet, rising a little as it slows)
  roll_tick: { prio: 3, cd: 0.02, max: 2, bus: 'ui', play: (v, k) => { const p = k?.pitch || 1; v.noise(0, 0.018, { freq: 3200 * p, q: 4, gain: 0.09, attack: 0.0004 }); v.tone(0, 0.03, { freq: 1100 * p, to: 820 * p, type: 'triangle', gain: 0.05 }); } },
  ui_hover: { prio: 2, cd: 0.04, max: 2, bus: 'ui', play: (v) => { v.noise(0, 0.012, { freq: 4200, q: 3, gain: 0.05, attack: 0.0006 }); v.tone(0, 0.02, { freq: 2400, gain: 0.016 }); } },
  ui_click: { prio: 4, cd: 0.03, max: 2, bus: 'ui', play: (v) => { v.tone(0, 0.035, { freq: 900, to: 700, gain: 0.05 }); v.noise(0, 0.015, { freq: 2500, q: 2, gain: 0.05, attack: 0.0006 }); } },
  ui_open: { prio: 4, cd: 0.08, max: 1, bus: 'ui', play: (v) => { v.whoosh(0, 0.12, { f0: 900, f1: 2400, gain: 0.05, peak: 0.6 }); v.tone(0.05, 0.07, { freq: 520, to: 480, type: 'triangle', gain: 0.04 }); } },
  ui_close: { prio: 4, cd: 0.08, max: 1, bus: 'ui', play: (v) => { v.whoosh(0, 0.1, { f0: 2200, f1: 800, gain: 0.04, peak: 0.3 }); v.tone(0, 0.06, { freq: 440, to: 400, type: 'triangle', gain: 0.035 }); } },
  /** A quest taken on: a scroll unrolled, a two-note horn call. */
  quest_accept: {
    prio: 7, cd: 0.5, max: 1, bus: 'ui', send: 0.2, duck: 0.25,
    play(v) {
      v.noise(0, 0.25, { freq: 3500, q: 0.7, gain: 0.04, attack: 0.03 });
      v.tone(0.08, 0.22, { freq: 392, type: 'triangle', gain: 0.1 });
      v.tone(0.08, 0.22, { freq: 392, type: 'sawtooth', gain: 0.025 });
      v.tone(0.3, 0.5, { freq: 523, type: 'triangle', gain: 0.11, attack: 0.02 });
      v.tone(0.3, 0.5, { freq: 523, type: 'sawtooth', gain: 0.025, attack: 0.02 });
    },
  },
  quest_update: { prio: 6, cd: 0.4, max: 1, bus: 'ui', send: 0.2, play: (v) => { M.chime(v, 0, 0.8, [1568, 2093], 0.6); } },
  /** A quest done: a bright arpeggio and a shimmer. */
  quest_complete: {
    prio: 8, cd: 0.5, max: 1, bus: 'ui', send: 0.3, duck: 0.45,
    play(v) {
      [523, 659, 784, 1046, 1318].forEach((f, i) => v.tone(i * 0.075, 0.5, { freq: f, type: 'triangle', gain: 0.1 }));
      v.tone(0.38, 0.9, { freq: 523, type: 'sawtooth', gain: 0.02, attack: 0.03 });
      M.shimmer(v, 0.3, 0.8, 0.7);
    },
  },
  /** A new technique: a rising sparkle and a ping. */
  unlock: {
    prio: 7, cd: 0.5, max: 1, bus: 'ui', send: 0.3, duck: 0.3,
    play(v) { M.shimmer(v, 0, 1, 0.6); [784, 1175, 1568].forEach((f, i) => v.tone(0.1 + i * 0.06, 0.5, { freq: f, type: 'triangle', gain: 0.07 })); },
  },
  /** Your bounty raised: DON! — and the wanted poster slapped up. */
  bounty: {
    prio: 7, cd: 1, max: 1, bus: 'ui', send: 0.3, duck: 0.4,
    play(v) {
      v.thump(0, { f0: 100, f1: 36, dur: 0.5, gain: 0.5 });
      v.noise(0, 0.4, { color: 'pink', type: 'lowpass', freq: 500, sweep: 90, gain: 0.25 });
      v.noise(0.12, 0.05, { freq: 2200, q: 0.8, gain: 0.12, attack: 0.002 });
      v.noise(0.12, 0.2, { type: 'highpass', freq: 3000, gain: 0.03 });
    },
  },
  /**
   * A Devil Fruit somewhere close by: a faint, glassy twinkle now and then
   * from where it hangs (with its glint: render3d/glints.js) — a few high
   * notes a fifth apart, shimmering, quiet enough to be missed.
   */
  /** A Devil Fruit calling from somewhere on the island: a low, wavering hum that swells and fades, a breath of chimes over it. */
  df_call: {
    prio: 2, cd: 1.5, max: 1, kind: 'world', send: 0.45,
    play(v, k) {
      const n = k.near || 0, f = rnd(196, 220);
      [1, 1.498, 2.01].forEach((m, i) => v.tone(0.05 * i, 1.6, { freq: f * m, to: f * m * 1.012, type: 'sine', gain: 0.02 - i * 0.004, attack: 0.5 }));
      v.tone(0, 1.6, { freq: f * 0.5, type: 'triangle', gain: 0.012, attack: 0.6 });
      if (n > 0.4) [3, 4, 5].forEach((m, i) => v.tone(0.4 + i * 0.16, 0.7, { freq: f * m * 2, type: 'sine', gain: 0.006 + 0.01 * n, attack: 0.02 }));
    },
  },
  df_glint: {
    prio: 2, cd: 2.5, max: 1, kind: 'world', send: 0.3,
    play(v) {
      const f = rnd(1900, 2300);
      M.shimmer(v, 0, 0.35, 0.9);
      [1, 1.5, 2].forEach((m, i) => v.tone(0.05 + i * 0.09, 0.6, { freq: f * m, type: 'sine', gain: 0.016, attack: 0.01 }));
    },
  },
  /**
   * A fruit picked off a tree: the leaves rustling as the hand goes in among
   * them, the stalk snapping (a sharp crack, a few splinters), the branch
   * springing back with a swish and a last shiver of leaves, the fruit in the
   * hand.
   */
  forage: {
    prio: 5, cd: 0.2, max: 1, variants: 3,
    play(v, k) {
      const T = [0.2, 0.24, 0.17][k.rr];
      v.noise(0, T + 0.05, { freq: 4200, q: 0.7, gain: 0.1, attack: T * 0.6, curve: 'lin' });
      v.crackle(0.02, T, 10, { freq: 4500, spread: 1, gain: 0.07, q: 1.5 });
      // the snap
      v.noise(T, 0.005, { type: 'highpass', freq: 1800, gain: 0.6, attack: 0.0005 });
      v.crackle(T + 0.002, 0.03, 4, { freq: 2800, spread: 0.8, gain: 0.2, len: 0.008 });
      v.tone(T, 0.03, { freq: 900, to: 600, gain: 0.04 });
      // the branch springing back, its leaves shivering
      v.whoosh(T + 0.03, 0.22, { f0: 1500, f1: 3500, q: 0.8, gain: 0.08, peak: 0.3 });
      v.crackle(T + 0.06, 0.35, 12, { freq: 5000, spread: 1, gain: 0.035, q: 1.5 });
      // the fruit in the hand
      v.thump(T + 0.05, { f0: 260, f1: 160, dur: 0.05, gain: 0.08 });
    },
  },
  /** Something picked up off the ground: a rustle of the clothes as you bend, the hand closing on it, into the bag. */
  pickup: {
    prio: 5, cd: 0.1, max: 1,
    play(v) {
      v.whoosh(0, 0.2, { f0: 900, f1: 2200, q: 0.7, gain: 0.12, peak: 0.5, flutter: 20 });
      v.noise(0.12, 0.03, { freq: 1400, q: 1.2, gain: 0.4, attack: 0.002 });
      v.thump(0.12, { f0: 320, f1: 200, dur: 0.04, gain: 0.15 });
      v.noise(0.3, 0.09, { type: 'lowpass', freq: 900, gain: 0.3, attack: 0.006 });
      v.thump(0.3, { f0: 180, f1: 110, dur: 0.06, gain: 0.18 });
      v.ring(0.31, rnd(2400, 3000), 0.08, 0.02, [1, 2.4]);
    },
  },
  /** A Log Pose needle settling: a small magnetic chime. */
  logset: { prio: 6, cd: 1, max: 1, bus: 'ui', send: 0.3, play: (v) => { v.tone(0, 0.3, { freq: 2200, to: 2600, gain: 0.01 }); M.chime(v, 0.05, 0.7, [1760, 2637], 0.8); } },
  /** A low-health heartbeat (doki... doki...). */
  heartbeat: { prio: 6, cd: 0.4, max: 1, bus: 'ui', play: (v) => { v.thump(0, { f0: 62, f1: 40, dur: 0.11, gain: 0.18 }); v.thump(0.2, { f0: 55, f1: 38, dur: 0.1, gain: 0.12 }); } },
};

// What sort of sound each is: its share of the voices (engine.js) — and a
// blow ('hit') of your fight dips the beds under it (audio.js). The world's
// own sounds (thunder, the boat working) have a share of their own.
const KINDS = {
  hit: ['punch', 'punch_heavy', 'slash_hit', 'slash_heavy', 'block', 'parry', 'guardbreak', 'ko', 'fire', 'magma', 'ice', 'snow', 'lightning', 'thunder_small', 'water', 'swamp', 'poison', 'gas', 'smoke', 'sand', 'light', 'dark', 'quake', 'string', 'explosion', 'cannon', 'crash', 'doorbreak'],
  tech: ['whoosh', 'dodge', 'haki', 'haki_off', 'haki_out', 'haki_obs', 'foresight', 'conqueror_rise', 'conqueror', 'conqueror_clash', 'knocked', 'getup', 'dry'],
  move: ['step', 'jump', 'jump_big', 'land', 'land_heavy', 'splash', 'splash_big', 'splash_out', 'wade', 'gasp', 'choke', 'swim_pull', 'swim_kick', 'swim_breath', 'swim_under', 'tread', 'thrash', 'dive', 'surface', 'climb', 'board', 'oar_catch', 'oar_pull', 'oar_release'],
  world: ['thunder', 'hull_creak', 'rigging', 'hull_slap', 'bell', 'seaking'],
};
for (const [kind, names] of Object.entries(KINDS)) for (const n of names) if (SFX[n]) SFX[n].kind = kind;

// ------------------------------------------------------------ techniques
// A technique's start: the wind-up, and (at `rel` seconds, when its first blow
// or shot goes) the release. The fruits sound like themselves; the styles
// like what they swing. Each entry is play(v, k) with k.rel the release time,
// k.def the technique.

const STRETCH = (v, k, s = 1) => { M.stretch(v, 0, Math.max(0.12, k.rel), s); M.snap(v, k.rel, s); };

/** Devil Fruit techniques by fruit (and the signature ones by id). */
export const FRUIT_TECH = {
  gomu: {
    gomu_gatling: (v, k) => { M.stretch(v, 0, Math.max(0.12, k.rel), 0.8); for (let i = 0; i < 11; i++) swing(v, k.rel + i * 0.08 + Math.random() * 0.02, 'fists', 0.8); },
    gomu_rocket: (v, k) => { M.stretch(v, 0, Math.max(0.15, k.rel), 1.1); M.snap(v, k.rel, 1.2); v.whoosh(k.rel, 0.4, { f0: 300, f1: 2400, gain: 0.12 }); },
    gomu_bazooka: (v, k) => { STRETCH(v, k, 1.3); v.thump(k.rel, { f0: 140, f1: 60, dur: 0.1, gain: 0.2 }); },
    // (a head flung back and swung into theirs: GONG — a bell's partials, ringing on)
    gomu_bell: (v, k) => { STRETCH(v, k, 1.2); v.thump(k.rel, { f0: 160, f1: 70, dur: 0.1, gain: 0.2 }); v.ring(k.rel + 0.01, 520, 1.4, 0.05, [1, 2.4, 3.0, 4.5]); },
    // (a fist punched into the ground, rumbling along under it, bursting up)
    gomu_mogura_pistol: (v, k) => { STRETCH(v, k, 1.2); M.rumble(v, k.rel, 0.6, 0.45, { lp: 160 }); M.boom(v, k.rel + 0.42, 1); },
    gomu_gear2: (v) => { for (let i = 0; i < 4; i++) v.thump(i * 0.11, { f0: 70, f1: 46, dur: 0.09, gain: 0.25 }); M.hiss(v, 0.3, 1.6, 1.2, 3500); v.whoosh(0.4, 0.8, { f0: 2500, f1: 1200, gain: 0.06, color: 'pink' }); },
    gomu_gear3: (v, k) => { v.noise(0, Math.max(0.3, k.rel), { type: 'lowpass', freq: 600, gain: 0.2, attack: 0.3, curve: 'lin' }); v.tone(0, Math.max(0.3, k.rel), { freq: 90, to: 60, type: 'triangle', gain: 0.12, attack: 0.2 }); M.snap(v, k.rel, 1.6); M.boom(v, k.rel + 0.02, 0.6); },
    gomu_gear4: (v) => { M.stretch(v, 0, 0.6, 1.2); v.tone(0.5, 0.4, { freq: 80, to: 130, type: 'triangle', gain: 0.25, vib: { rate: 8, depth: 12 } }); hakiClank(v, 0.75, 1.2); for (let i = 0; i < 3; i++) v.thump(0.8 + i * 0.2, { f0: 90, f1: 120, dur: 0.12, gain: 0.18 }); },
    gomu_gear5: (v) => {
      // the Drums of Liberation: don-don, doko-don
      [0, 0.18, 0.46, 0.56, 0.74].forEach((t, i) => v.thump(t, { f0: i === 4 ? 85 : 70, f1: 42, dur: 0.16, gain: 0.35 }));
      v.tone(0.4, 0.9, { freq: 300, to: 520, gain: 0.05, vib: { rate: 6, depth: 40 } });
      M.shimmer(v, 0.8, 1.4, 0.8);
    },
    default: STRETCH,
  },
  gura: {
    gura_tsunami: (v, k) => { v.noise(0, Math.max(0.4, k.rel), { color: 'brown', type: 'lowpass', freq: 160, gain: 0.35, attack: Math.max(0.3, k.rel) * 0.8, curve: 'lin' }); M.glassCrack(v, k.rel, 1.4); M.boom(v, k.rel, 1.4); },
    default: (v, k) => {
      // the air begins to tremble, then cracks like glass
      v.noise(0, Math.max(0.15, k.rel), { color: 'brown', type: 'lowpass', freq: 200, gain: 0.25, attack: Math.max(0.1, k.rel) * 0.8, curve: 'lin' });
      v.crackle(Math.max(0, k.rel - 0.15), 0.15, 4, { freq: 6000, gain: 0.03, q: 4 });
      M.glassCrack(v, k.rel, 1);
    },
  },
  ope: {
    ope_room: (v) => {
      // ROOM: a translucent dome humming out round you
      v.tone(0, 1, { freq: 110, to: 55, gain: 0.2, attack: 0.05 });
      v.fm(0, 1.3, { freq: 220, ratio: 2, index: 0.6, gain: 0.06, attack: 0.1 });
      v.whoosh(0, 0.8, { f0: 200, f1: 1400, q: 0.7, gain: 0.08, peak: 0.6 });
      [440, 660, 990].forEach((f) => v.tone(0.1, 1.4, { freq: f, gain: 0.014, attack: 0.3, curve: 'lin' }));
    },
    ope_shambles: (v) => { v.whoosh(0, 0.12, { f0: 800, f1: 4000, q: 1.5, gain: 0.1, peak: 0.9 }); M.pop(v, 0.12, 0.8, 480); M.shimmer(v, 0.1, 0.5, 0.3, false); },
    ope_amputate: (v, k) => { swing(v, k.rel, 'sword', 1.5); v.ring(k.rel + 0.1, 1600, 0.5, 0.03, [1, 2.04, 2.75]); },
    ope_mes: (v, k) => { M.pop(v, k.rel, 1, 340); v.fm(k.rel + 0.05, 0.3, { freq: 900, ratio: 1.5, index: 1, gain: 0.04 }); },
    ope_counter: (v, k) => M.zapBurst(v, k.rel, 0.8, 0.25),
    ope_gamma: (v, k) => { v.tone(0, Math.max(0.2, k.rel) + 0.3, { freq: 120, type: 'sawtooth', gain: 0.05, attack: 0.1 }); v.zap(k.rel, 0.3, { f0: 300, f1: 1200, gain: 0.06 }); },
    default: (v, k) => swing(v, k.rel, 'sword', 1),
  },
  bara: { default: (v, k) => { M.pop(v, 0, 1, 300); v.noise(0.01, 0.03, { freq: 1500, q: 3, gain: 0.08 }); swing(v, k.rel, 'fists', 1); }, bara_festival: (v) => { for (let i = 0; i < 8; i++) M.pop(v, i * 0.05, 0.6, rnd(220, 420)); },
    bara_muggy: (v, k) => { M.hiss(v, 0, Math.max(0.3, k.rel) + 0.3, 0.8, 5500); v.crackle(0, Math.max(0.3, k.rel), 6, { freq: 4000, gain: 0.03 }); M.pop(v, k.rel, 0.9, 200); } },
  bomu: { default: (v, k) => { M.hiss(v, 0, Math.max(0.2, k.rel), 1, 5500); v.crackle(0, Math.max(0.2, k.rel), 6, { freq: 4000, gain: 0.03 }); swing(v, k.rel, 'legs', 0.9); } },
  hana: {
    default: (v, k) => {
      // arms sprouting in a bloom of petals: soft slaps and a chime
      for (let i = 0; i < 6; i++) v.noise(Math.random() * Math.max(0.2, k.rel), 0.03, { freq: rnd(1200, 1800), q: 2, gain: 0.06 });
      M.chime(v, 0, 0.6, [1760, 2349, 2637], 0.6);
      v.noise(k.rel, 0.012, { type: 'highpass', freq: 2500, gain: 0.18, attack: 0.0006 });
      v.crackle(k.rel, 0.06, 4, { freq: 900, gain: 0.08 });
    },
  },
  ito: {
    ito_birdcage: (v) => { for (let i = 0; i < 6; i++) v.ring(i * 0.1, rnd(900, 1700), 0.6, 0.025, [1, 2.01, 3.02], { spread: 0.004 }); v.tone(0, 1.2, { freq: 2000, type: 'sawtooth', gain: 0.008, attack: 0.4 }); },
    // (strings fired down out of the sky like a hail of bullets: each one a thin twang and a zip)
    ito_fulbright: (v, k) => { for (let i = 0; i < 9; i++) { const t = k.rel + i * 0.07 + Math.random() * 0.03; v.whoosh(t, 0.08, { f0: 6000, f1: 2500, q: 2, gain: 0.06, peak: 0.3 }); v.ring(t + 0.05, rnd(1200, 1900), 0.25, 0.02, [1, 2.01, 3.02], { spread: 0.004 }); } },
    default: (v, k) => { v.ring(0, rnd(900, 1300), 0.4, 0.035, [1, 2.01, 3.02, 4.03], { spread: 0.004 }); v.whoosh(k.rel, 0.1, { f0: 3000, f1: 7000, q: 2, gain: 0.1, peak: 0.2 }); },
  },
  mochi: { default: (v, k) => { v.tone(0, Math.max(0.15, k.rel), { freq: 150, to: 230, gain: 0.08, vib: { rate: 8, depth: 20 } }); v.noise(0, Math.max(0.15, k.rel), { type: 'lowpass', freq: 400, gain: 0.12, attack: 0.05 }); v.thump(k.rel, { f0: 180, f1: 70, dur: 0.1, gain: 0.2 }); v.bubble(k.rel, { f: 220, rise: 1.8, dur: 0.08, gain: 0.08 }); } },
  horo: { default: (v) => { M.wail(v, 0, 1, 0.8); v.whoosh(0.2, 0.5, { f0: 600, f1: 1500, gain: 0.05, flutter: 6 }); }, horo_ghostrap: (v, k) => { M.wail(v, 0, 0.8, 0.6); M.boom(v, Math.max(0.3, k.rel), 0.8); } },
  kage: {
    kage_brickbat: (v, k) => { for (let i = 0; i < 10; i++) v.whoosh(k.rel + Math.random() * 0.25, 0.06, { f0: 900, f1: 1500, q: 1.5, gain: 0.14, flutter: 40 }); },
    kage_steal: (v, k) => { for (const t of [0, 0.08]) { v.noise(k.rel + t, 0.01, { type: 'highpass', freq: 5000, gain: 0.2, attack: 0.0006 }); v.ring(k.rel + t, 3000, 0.08, 0.02, [1, 1.7]); } },
    kage_asgard: (v, k) => { M.suction(v, 0, Math.max(0.6, k.rel) + 0.3, 1.4); M.rumble(v, 0.2, 0.8, Math.max(0.6, k.rel) + 0.4, { lp: 140 }); M.roar(v, Math.max(0.6, k.rel), 1, 0.9, 70); },
    default: (v) => { M.suction(v, 0, 0.5, 0.6); v.formant(0, 0.5, { f1: 300, f2: 600, q: 6, gain: 0.05 }); },
  },
  doku: { doku_gumo: (v, k) => { M.hiss(v, 0, Math.max(0.3, k.rel) + 1, 1.1, 3500); v.bubbles(0, 0.6, 8, { f: 500, gain: 0.04 }); }, doku_chloro: (v, k) => { M.hiss(v, 0, Math.max(0.3, k.rel) + 0.6, 0.9, 4000); M.pop(v, k.rel, 0.7, 260); }, doku_hydra: (v, k) => { M.hiss(v, 0, Math.max(0.3, k.rel) + 0.3, 1.3, 5500); v.bubbles(0, 0.4, 6, { f: 600, gain: 0.04 }); }, default: (v, k) => { M.hiss(v, 0, Math.max(0.2, k.rel), 0.8, 6000); v.bubbles(0, 0.3, 4, { f: 700, gain: 0.04 }); swing(v, k.rel, 'fists', 0.8); } },
  noro: { default: (v, k) => { v.tone(k.rel, 0.8, { freq: 1200, to: 300, gain: 0.06, vib: { rate: 7, depth: 30 } }); v.tone(k.rel, 0.8, { freq: 1800, to: 450, gain: 0.025 }); } },
  bari: { default: (v, k) => { v.fm(k.rel, 0.6, { freq: 1600, ratio: 1.5, index: 1.4, gain: 0.05 }); v.ring(k.rel, 2400, 0.5, 0.03, [1, 1.34, 1.87]); v.tone(k.rel, 0.6, { freq: 220, gain: 0.04, attack: 0.05 }); } },
  suke: { default: (v) => M.shimmer(v, 0, 1, 0.6, false) },
  sube: { default: (v, k) => { v.tone(0, 0.08, { freq: 900, to: 1400, gain: 0.04 }); swing(v, k.rel, 'fists', 1); } },
  doru: { default: (v, k) => { v.noise(0, 0.25, { type: 'lowpass', freq: 500, gain: 0.3, attack: 0.05 }); v.bubble(0.05, { f: 180, rise: 1.6, dur: 0.1, gain: 0.08 }); for (let i = 0; i < 4; i++) v.noise(k.rel + i * 0.05, 0.012, { freq: 2200, q: 4, gain: 0.25, attack: 0.0006 }); } },
  supa: { default: (v, k) => { v.noise(0, 0.2, { freq: 3500, sweep: 6000, q: 3, gain: 0.06, attack: 0.05 }); v.ring(0.15, 2200, 0.4, 0.03, [1, 2.04, 2.75]); swing(v, k.rel, 'sword', 1.2); } },
  nikyu: {
    nikyu_ursus: (v, k) => { v.tone(0, Math.max(0.5, k.rel), { freq: 60, to: 240, gain: 0.14, attack: Math.max(0.4, k.rel) * 0.8, curve: 'lin' }); M.suction(v, 0, Math.max(0.5, k.rel), 0.8); M.pop(v, k.rel, 1.6, 180); },
    default: (v, k) => { M.pop(v, k.rel, 1.1, 210); v.whoosh(k.rel, 0.2, { f0: 400, f1: 1600, gain: 0.08 }); },
  },
  mane: { default: (v) => { M.pop(v, 0.1, 1, 300); v.noise(0.1, 0.3, { type: 'lowpass', freq: 800, gain: 0.08 }); M.shimmer(v, 0.15, 0.4, 0.3); } },
  zushi: {
    zushi_meteor: (v, k) => { v.tone(0, Math.max(0.6, k.rel) + 0.4, { freq: 3200, to: 500, gain: 0.03, attack: 0.2, curve: 'lin' }); v.noise(0, Math.max(0.6, k.rel), { color: 'brown', type: 'lowpass', freq: 200, gain: 0.2, attack: 0.5, curve: 'lin' }); },
    default: (v, k) => { v.tone(0, Math.max(0.3, k.rel) + 0.3, { freq: 42, to: 30, gain: 0.3, attack: 0.08 }); M.suction(v, 0, Math.max(0.3, k.rel) + 0.2, 0.5); },
  },
  hito: { default: (v, k) => { v.crackle(0, 0.1, 4, { freq: 1800, gain: 0.08 }); M.roar(v, 0.05, 0.6, 0.6, 110); if (k.rel > 0.3) swing(v, k.rel, 'heavy', 1); } },
  neko_leopard: { default: (v, k) => { M.roar(v, 0, 0.7, 0.5, 120); swing(v, k.rel, 'fists', 1.2); } },
  tori_phoenix: { default: (v, k) => { M.flame(v, 0, 0.7, { dur: 0.6, low: 500, high: 1800 }); M.chime(v, 0.15, 0.7, [1318, 1760, 2637]); if (k.rel > 0.1) swing(v, k.rel, 'legs', 1); } },
  uo_seiryu: {
    seiryu_bolo: (v, k) => { M.roar(v, 0, 1, Math.max(0.4, k.rel), 80); M.flame(v, k.rel, 1.6, { dur: 0.9 }); },
    seiryu_raimei: (v, k) => { swing(v, 0, 'heavy', 1.3); M.strike(v, k.rel, 1.2, 1.8); },
    seiryu_tatsumaki: (v, k) => { M.roar(v, 0, 0.8, 0.7, 80); v.whoosh(k.rel, 1.6, { f0: 250, f1: 900, q: 0.5, gain: 0.2, peak: 0.4, flutter: 4, color: 'pink' }); },
    seiryu_ragnaraku: (v, k) => { swing(v, 0, 'heavy', 1.3); M.strike(v, k.rel, 1.3, 2); M.boom(v, k.rel + 0.03, 1.2); },
    default: (v, k) => { M.roar(v, 0, 1, 0.9, 70); v.whoosh(k.rel, 0.4, { f0: 300, f1: 2000, gain: 0.1 }); },
  },
  mera: {
    mera_kyokaen: (v, k) => { M.flame(v, k.rel, 1.5, { dur: 1.2 }); v.whoosh(k.rel, 0.6, { f0: 200, f1: 800, q: 0.5, gain: 0.18, color: 'pink' }); },
    mera_entei: (v, k) => { v.whoosh(0, Math.max(0.6, k.rel), { f0: 200, f1: 900, q: 0.5, gain: 0.25, peak: 0.95, flutter: 10, color: 'pink' }); M.flame(v, k.rel, 1.8, { dur: 1 }); },
    default: (v, k) => { v.whoosh(0, Math.max(0.15, k.rel), { f0: 300, f1: 1500, q: 0.6, gain: 0.1, peak: 0.9, color: 'pink' }); M.flame(v, k.rel, 1.1); },
  },
  hie: {
    hie_ageand: (v, k) => { v.noise(0, Math.max(0.4, k.rel), { type: 'highpass', freq: 3000, gain: 0.06, attack: 0.3, curve: 'lin' }); M.ice(v, k.rel, 1.5, 1.1); },
    default: (v, k) => { v.noise(0, Math.max(0.15, k.rel), { type: 'highpass', freq: 3500, gain: 0.05, attack: 0.1, curve: 'lin' }); v.crackle(0, Math.max(0.15, k.rel), 5, { freq: 7000, gain: 0.02, q: 5 }); M.ice(v, k.rel, 0.8); },
  },
  goro: {
    // (El Thor and Raigo: the charge gathering, then a strike from the sky — the crack and the thunder rolling on)
    goro_elthor: (v, k) => { v.zap(0, Math.max(0.5, k.rel), { f0: 40, f1: 200, gain: 0.04 }); M.rumble(v, 0, 0.6, Math.max(0.5, k.rel), { lp: 180 }); M.strike(v, k.rel, 1.3, 2.4); },
    goro_raigo: (v, k) => { M.rumble(v, 0, 1.4, Math.max(1, k.rel) + 1, { lp: 140 }); v.zap(0.3, 1, { f0: 40, f1: 160, gain: 0.03 }); M.strike(v, Math.max(1, k.rel), 1.4, 3); },
    goro_kari: (v, k) => { v.zap(0, Math.max(0.3, k.rel), { f0: 40, f1: 180, gain: 0.04 }); M.strike(v, k.rel, 1.2, 1.8); },
    default: (v, k) => {
      // static gathering (the hair on your neck), then VARI
      v.zap(0, Math.max(0.15, k.rel), { f0: 40, f1: 220, gain: 0.03, step: 0.02 });
      v.crackle(0, Math.max(0.15, k.rel), 6, { freq: 5000, gain: 0.025 });
      M.zapBurst(v, k.rel, 1, 0.25);
    },
  },
  suna: { default: (v, k) => { v.whoosh(0, Math.max(0.2, k.rel) + 0.2, { f0: 600, f1: 2200, q: 0.5, gain: 0.12, peak: 0.6 }); v.crackle(0, Math.max(0.2, k.rel) + 0.2, 20, { freq: 4500, gain: 0.03, q: 2.5 }); } },
  moku: { default: (v, k) => { for (let i = 0; i < 3; i++) v.noise(i * 0.08, 0.3, { type: 'lowpass', freq: 600, sweep: 250, gain: 0.25, attack: 0.04 }); v.whoosh(k.rel, 0.3, { f0: 300, f1: 1000, gain: 0.3, color: 'pink' }); } },
  pika: {
    pika_yata: (v) => { M.shimmer(v, 0, 1, 0.25); v.whoosh(0.02, 0.12, { f0: 3000, f1: 8000, q: 1.5, gain: 0.1, peak: 0.2 }); },
    pika_flash: (v, k) => { v.tone(0, Math.max(0.2, k.rel), { freq: 900, to: 5000, gain: 0.05, attack: Math.max(0.15, k.rel) * 0.9, curve: 'lin' }); M.shimmer(v, k.rel, 1, 0.5); v.noise(k.rel, 0.02, { type: 'highpass', freq: 5000, gain: 0.2, attack: 0.0005 }); },
    default: (v, k) => {
      // a high whine charging, then PYUN
      v.tone(0, Math.max(0.15, k.rel), { freq: 800, to: 4000, gain: 0.04, attack: Math.max(0.1, k.rel) * 0.9, curve: 'lin' });
      v.noise(k.rel, 0.008, { type: 'highpass', freq: 6000, gain: 0.2, attack: 0.0005 });
      v.tone(k.rel, 0.14, { freq: 4000, to: 1500, gain: 0.07 });
      v.fm(k.rel, 0.2, { freq: 2500, ratio: 1.5, index: 2, gain: 0.03 });
    },
  },
  magu: { magu_bakuretsu: (v, k) => { M.rumble(v, 0, 0.8, Math.max(0.3, k.rel), { lp: 140 }); M.boom(v, k.rel, 1.3); M.flame(v, k.rel + 0.05, 1.4, { dur: 0.9 }); }, default: (v, k) => { v.bubbles(0, Math.max(0.2, k.rel), 6, { f: 130, rise: 1.4, gain: 0.08, dur: 0.1 }); v.noise(0, Math.max(0.2, k.rel), { color: 'brown', type: 'lowpass', freq: 400, gain: 0.2, attack: 0.1 }); v.whoosh(k.rel, 0.4, { f0: 200, f1: 900, q: 0.6, gain: 0.18, color: 'pink' }); M.hiss(v, k.rel, 0.4, 0.8, 5000); } },
  yami: {
    yami_kurouzu: (v) => M.suction(v, 0, 0.9, 1.3),
    yami_abyss: (v, k) => { M.suction(v, 0, Math.max(0.5, k.rel) + 1.2, 1.6); M.rumble(v, 0, 1, Math.max(0.5, k.rel) + 1, { lp: 120 }); },
    default: (v, k) => { M.suction(v, 0, Math.max(0.3, k.rel) + 0.2, 0.9); v.crackle(0, 0.5, 8, { freq: 700, gain: 0.04, q: 1.5 }); },
  },
};

/** Style techniques by id (the rest sound like the weapon they swing: see techStart). */
export const STYLE_TECH = {
  roku_soru: (v) => { v.whoosh(0, 0.08, { f0: 1500, f1: 5000, q: 1, gain: 0.12, peak: 0.2 }); for (let i = 0; i < 4; i++) v.noise(i * 0.012, 0.01, { type: 'lowpass', freq: 600, gain: 0.08 }); },
  roku_geppo: (v) => { M.pop(v, 0, 1, 150); v.whoosh(0, 0.2, { f0: 300, f1: 1400, gain: 0.1 }); },
  roku_rankyaku: (v, k) => { swing(v, 0, 'legs', 1.2); v.whoosh(k.rel, 0.35, { f0: 3000, f1: 1200, q: 2, gain: 0.1, peak: 0.15 }); },
  roku_tekkai: (v) => hakiClank(v, 0, 0.7),
  bleg_diable: (v) => { swing(v, 0, 'legs', 1.2); M.flame(v, 0.25, 1.2, { dur: 0.8 }); },
  bleg_skywalk: (v) => { M.pop(v, 0, 0.9, 160); v.whoosh(0, 0.25, { f0: 300, f1: 1500, gain: 0.1 }); },
  fmk_uchimizu: (v, k) => { v.whoosh(k.rel, 0.12, { f0: 1500, f1: 3500, gain: 0.08 }); M.drips(v, k.rel, 0.15, 4, 1); },
  fmk_vagabond: (v, k) => { v.whoosh(0, Math.max(0.3, k.rel) + 0.3, { f0: 300, f1: 1200, q: 0.7, gain: 0.16, peak: 0.7, flutter: 18, color: 'pink' }); M.splash(v, k.rel, 0.8); },
  elec_discharge: (v, k) => M.zapBurst(v, k.rel, 1, 0.35),
  elec_garchu: (v, k) => M.zapBurst(v, k.rel, 0.8, 0.2),
  clima_thunderbolt: (v, k) => { v.zap(0, Math.max(0.3, k.rel), { f0: 40, f1: 150, gain: 0.03 }); M.strike(v, k.rel, 1.1, 1.6); },
  clima_cyclone: (v, k) => v.whoosh(k.rel, 0.9, { f0: 300, f1: 1100, q: 0.6, gain: 0.16, peak: 0.4, flutter: 5, color: 'pink' }),
  clima_mirage: (v) => M.shimmer(v, 0, 0.8, 0.6, false),
  clima_zeus: (v, k) => M.strike(v, k.rel, 1.3, 2.2),
  hassho_bushin: (v, k) => { v.tone(0, Math.max(0.2, k.rel) + 0.2, { freq: 42, gain: 0.25, attack: 0.08, vib: { rate: 18, depth: 6 } }); v.whoosh(k.rel, 0.3, { f0: 200, f1: 900, gain: 0.12, color: 'pink' }); },
  okama_pirouette: (v) => { for (let i = 0; i < 3; i++) swing(v, i * 0.12, 'legs', 0.8); },
  okama_hell_wink: (v, k) => { v.tone(k.rel, 0.3, { freq: 1400, to: 2800, gain: 0.04 }); M.pop(v, k.rel, 0.8, 600); },
  elec_sulong: (v) => { M.roar(v, 0, 1.1, 1, 90); M.shimmer(v, 0.5, 1, 0.8); },
  santo_asura: (v) => { M.rumble(v, 0, 0.8, 1, { lp: 150 }); v.zap(0.2, 0.6, { f0: 40, f1: 300, gain: 0.04 }); v.formant(0.1, 0.8, { f1: 300, f2: 700, q: 5, gain: 0.08 }); },
  snipe_firebird: (v, k) => { slingshot(v, k.rel, 1.1); M.flame(v, k.rel + 0.05, 0.8); },
};

/**
 * A Devil Fruit's touch on a blow it lands (over the blow's own sound): the
 * rubber's boing, a body part's "pon", mochi's squelch, steel's ring...
 */
export const FLAVOUR = {
  gomu: (v) => v.tone(0.005, 0.16, { freq: 320, to: 130, type: 'triangle', gain: 0.06, vib: { rate: 24, depth: 22 } }),
  bara: (v) => M.pop(v, 0, 0.5, 340),
  mochi: (v) => { v.bubble(0.01, { f: 200, rise: 1.8, dur: 0.08, gain: 0.07 }); v.noise(0, 0.1, { type: 'lowpass', freq: 500, gain: 0.08 }); },
  supa: (v) => v.ring(0.003, rnd(1900, 2300), 0.3, 0.03, [1, 2.04, 2.75]),
  nikyu: (v) => M.pop(v, 0, 0.7, 220),
  hana: (v) => { v.noise(0.02, 0.012, { type: 'highpass', freq: 2500, gain: 0.12, attack: 0.0006 }); v.crackle(0.02, 0.05, 3, { freq: 900, gain: 0.06 }); },
  ito: (v) => v.ring(0, rnd(1500, 1800), 0.25, 0.025, [1, 2.01, 3.03], { spread: 0.004 }),
  doru: (v) => v.thump(0.005, { f0: 260, f1: 180, dur: 0.05, gain: 0.08 }),
  bari: (v) => v.fm(0, 0.35, { freq: 1600, ratio: 1.5, index: 1, gain: 0.03 }),
  ope: (v) => v.fm(0.01, 0.25, { freq: 900, ratio: 2, index: 0.6, gain: 0.02 }),
  kage: (v) => v.noise(0, 0.2, { type: 'lowpass', freq: 400, gain: 0.08, attack: 0.05 }),
  horo: (v) => v.tone(0, 0.3, { freq: 600, to: 400, gain: 0.02, vib: { rate: 6, depth: 30 } }),
  zushi: (v) => v.tone(0, 0.3, { freq: 45, to: 32, gain: 0.15 }),
  noro: (v) => v.tone(0, 0.4, { freq: 900, to: 300, gain: 0.025 }),
};

/** The kind of swing for a technique's motion (`anim`). */
function animKind(anim, weapon) {
  if (weapon === 'sword') return 'sword';
  if (weapon === 'staff') return 'staff';
  if (weapon === 'axe') return 'axe';
  if (/kick|knee|mouton|jete|arabesque|pirouette|rankyaku/.test(anim || '') || weapon === 'legs') return 'legs';
  if (/heavy|haymaker|slam|headbutt|charge|axe_slam|palm_double/.test(anim || '')) return 'heavy';
  return 'fists';
}

/**
 * The start of a technique: its own sound if it has one (a Devil Fruit, a
 * signature move), else the swing of what it's done with — and, timed to the
 * moment the blow lands, the release. `def` the technique, `rel` the seconds
 * to its first blow, `weapon` what it's swung with, `gun` a gun's kind.
 */
export function techStart(v, def, { rel = 0, weapon = 'fists', gun = null, heavy = false, voice } = {}) {
  const k = { rel: Math.max(0, rel), def, voice };
  const fr = def.fruit && FRUIT_TECH[def.fruit];
  if (fr) { (fr[def.id] || (def.base && fr[def.base]) || fr.default || STRETCH)(v, k); return; }
  if (STYLE_TECH[def.id]) { STYLE_TECH[def.id](v, k); return; }
  // (Conqueror's: the pressure gathering through the wind-up; the DOOON comes with the burst itself — abilities.js)
  if ((def.steps || []).some((s) => s.conqueror)) { SFX.conqueror_rise.play(v, k); return; }
  if (weapon === 'gun') {
    v.noise(0, 0.02, { freq: 3000, q: 3, gain: 0.1, attack: 0.0006 });
    if (gun === 'slingshot') slingshot(v, k.rel, 1); else gunshot(v, k.rel, heavy ? 1.2 : 1);
    return;
  }
  const kind = animKind(def.anim, weapon);
  // the swing rushes in and is spent as the blow lands — its peak before the
  // hit, never on it, so the crack of a landed blow has the moment to itself
  // (a quick jab gets a quicker, smaller swish)
  const size = heavy || /heavy|cleave|tora|iai|slam/.test(def.anim || '') ? 1.3 : 1;
  const s = Math.min(size, Math.max(0.45, k.rel / (SWING_LEN[kind] * 0.95)));
  swing(v, Math.max(0, k.rel - SWING_LEN[kind] * s * 0.95), kind, s);
  if (weapon === 'sword' && /iai/.test(def.anim || '')) v.ring(k.rel + 0.04, 2300, 0.45, 0.025, [1, 2.04, 2.75]);
}
