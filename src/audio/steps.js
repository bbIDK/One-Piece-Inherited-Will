// Footsteps. A step is two touches — the heel, then the ball of the foot
// rolling down a moment after (quicker at a run) — each sounding of what it
// lands on: grass crushed, sand giving, gravel shifting, mud sucking at the
// boot, stone clicking, boards knocking hollow (a ship's deck booming under
// them, and now and then a creak), snow squeaking, ice ringing thin. The left
// and right feet sit a touch apart in the stereo and in pitch, and wet feet
// squelch for a while after a swim.
//
// Measured off recordings of each surface: grass, gravel, dirt and sand are
// bright — a crunch or a scuff with most of its energy at 2–9 kHz, over in a
// few tens of milliseconds (sand's grains hiss on a little longer) — while
// wood and stone are a knock at 125–500 Hz with a click on top. So the crunch
// is what carries a step through the world's beds; the thud is its weight.
const rnd = (a, b) => a + Math.random() * (b - a);

/** One footstep into voice `v`: `surf` what's underfoot, `loud` 0..1 (a stroll to a sprint), `k`: { foot (±1), deck, wet }. */
export function footstep(v, surf, loud, k = {}) {
  const L = 0.7 + 0.5 * loud, r = () => 0.9 + Math.random() * 0.2;
  // (the left foot a shade lower than the right: a gait has a rhythm, not a metronome)
  v.pj *= k.foot < 0 ? 0.97 : 1.02;
  const roll = 0.045 - 0.022 * loud; // heel to toe
  const thud = (t, f, g) => v.thump(t, { f0: f * r(), f1: f * 0.62, dur: 0.06, gain: g * L });
  // a crunch: many tiny breaks in a short burst (blades, grains, pebbles)
  const crunch = (t, dur, n, f, g, q = 2.2) => v.crackle(t, dur, n, { freq: f * r(), gain: g * L, q, spread: 0.9, len: 0.012 });
  switch (surf) {
    case 'grass': // blades crushed and swished aside: a bright crunch over a soft thud
      thud(0, 82, 0.045);
      v.noise(0, 0.07, { freq: 1200 * r(), q: 0.6, type: 'lowpass', gain: 0.07, attack: 0.004 });
      crunch(0.002, 0.05, 9, 5200, 0.05);
      v.noise(0.004, 0.06, { freq: 6000 * r(), q: 0.7, gain: 0.05 * L, attack: 0.004, sweep: 4200 });
      crunch(roll, 0.04, 5, 4400, 0.035);
      break;
    case 'sand': // a soft give, and the grains hissing a moment after
      thud(0, 70, 0.05);
      v.noise(0, 0.1, { freq: 900 * r(), q: 0.6, type: 'lowpass', gain: 0.06, attack: 0.008 });
      v.noise(0.01, 0.16, { freq: 6000 * r(), q: 0.6, gain: 0.035 * L, attack: 0.02, sweep: 4500 });
      crunch(roll * 0.6, 0.12, 8, 5600, 0.03);
      break;
    case 'dirt': // packed earth: a dull pat and a gritty scuff
      thud(0, 95, 0.08);
      v.noise(0, 0.06, { freq: 650 * r(), q: 0.7, type: 'lowpass', gain: 0.12, attack: 0.003 });
      v.noise(0.002, 0.045, { freq: 3600 * r(), q: 0.8, gain: 0.08 * L, attack: 0.003 });
      crunch(roll, 0.05, 4, 4200, 0.03);
      break;
    case 'gravel': // loose stones shifting: a bright, grainy crunch
      thud(0, 90, 0.06);
      v.noise(0, 0.08, { freq: 1500 * r(), q: 0.6, gain: 0.05, attack: 0.004 });
      crunch(0, 0.09, 14, 4200, 0.06, 2.6);
      crunch(roll, 0.08, 7, 3200, 0.04, 2.6);
      break;
    case 'mud': // a wet squelch, and the boot sucked out of it
      thud(0, 75, 0.06);
      v.tone(0.01, 0.09, { freq: 140 * r(), to: 320, gain: 0.05, attack: 0.01 });
      v.noise(0, 0.12, { freq: 500, q: 0.6, type: 'lowpass', gain: 0.09, attack: 0.01 });
      v.noise(0.02, 0.08, { freq: 2400 * r(), q: 1, gain: 0.025 * L, attack: 0.01 });
      v.bubble(roll + 0.04, { f: rnd(260, 340), rise: 2, dur: 0.05, gain: 0.035 });
      break;
    case 'stone': // a crisp heel tap on stone and paving, the knock of it under
      v.noise(0, 0.014, { freq: 3200 * r(), q: 0.9, type: 'highpass', gain: 0.16 * L, attack: 0.001 });
      v.tone(0, 0.05, { freq: 210 * r(), to: 130, gain: 0.07 * L, attack: 0.002 });
      v.noise(0, 0.045, { freq: 700 * r(), q: 1.2, gain: 0.14, attack: 0.002 });
      v.noise(roll, 0.012, { freq: 3800 * r(), q: 0.8, type: 'highpass', gain: 0.035, attack: 0.001 });
      crunch(roll, 0.03, 2, 4800, 0.015);
      break;
    case 'wood': // boards: a hollow knock (a deck booms under it, and creaks now and then)
      v.tone(0, 0.1, { freq: 215 * r(), to: 165, gain: 0.08 * L, attack: 0.002 });
      v.tone(0, 0.05, { freq: 430 * r(), to: 360, gain: 0.03, attack: 0.002 });
      v.noise(0, 0.04, { freq: 1000 * r(), q: 1.3, gain: 0.07, attack: 0.002 });
      v.noise(0, 0.01, { freq: 3000 * r(), q: 0.8, type: 'highpass', gain: 0.03 * L, attack: 0.0008 });
      v.noise(roll, 0.03, { freq: 1300 * r(), q: 1.5, gain: 0.03, attack: 0.002 });
      if (k.deck) {
        v.tone(0, 0.16, { freq: 118 * r(), to: 92, gain: 0.05 * L, attack: 0.003 });
        if (Math.random() < 0.18) v.creak(0.03, rnd(0.18, 0.35), { rate: rnd(60, 110), rate1: rnd(40, 90), freqs: [250, 395, 560], gain: 0.03 });
      }
      break;
    case 'snow': // a squeaky crunch
      thud(0, 80, 0.04);
      v.noise(0, 0.13, { freq: 2300 * r(), q: 0.6, gain: 0.07, attack: 0.015, sweep: 1300 });
      crunch(0.02, 0.11, 10, 5200, 0.04);
      v.tone(roll, 0.05, { freq: rnd(1000, 1300), to: 850, gain: 0.01 });
      break;
    case 'ice': // a hard little click
      v.noise(0, 0.02, { freq: 4200 * r(), q: 1, type: 'highpass', gain: 0.08, attack: 0.001 });
      v.ring(0, 2300 * r(), 0.08, 0.014, [1, 1.7]);
      v.tone(0, 0.04, { freq: 160, to: 110, gain: 0.04 });
      v.noise(roll, 0.012, { freq: 5000, type: 'highpass', gain: 0.03, attack: 0.001 });
      break;
    case 'metal': // a dull clank
      v.ring(0, 520 * r(), 0.14, 0.03, [1, 2.2, 3.4]);
      v.noise(0, 0.03, { freq: 2600, q: 1, gain: 0.05, attack: 0.001 });
      thud(0, 120, 0.05);
      v.ring(roll, 700 * r(), 0.08, 0.012, [1, 2.2]);
      break;
    default: // soft: a rug, tatami, cloud — a muffled pat and the brush of it
      v.noise(0, 0.07, { freq: 420 * r(), q: 0.6, type: 'lowpass', gain: 0.1, attack: 0.006 });
      thud(0, 70, 0.05);
      v.noise(0.003, 0.05, { freq: 2600 * r(), q: 0.7, gain: 0.02, attack: 0.006 });
      v.noise(roll, 0.06, { freq: 300 * r(), type: 'lowpass', gain: 0.03, attack: 0.006 });
  }
  // running: the sole drags a little as it pushes off
  if (loud > 0.85) v.noise(roll + 0.01, 0.06, { freq: 2600, sweep: 1500, q: 0.8, gain: 0.03, attack: 0.004 });
  // wet feet: a squelch in the shoe
  if (k.wet > 0) { v.bubble(0.01, { f: rnd(380, 480), rise: 1.8, dur: 0.04, gain: 0.03 * k.wet }); v.noise(0, 0.06, { freq: 1200, q: 1, gain: 0.03 * k.wet }); }
}
