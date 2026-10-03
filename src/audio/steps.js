// Footsteps. A step is two touches — the heel, then the ball of the foot
// rolling down a moment after (quicker at a run) — each sounding of what it
// lands on: grass crushed, sand giving, gravel shifting, mud sucking at the
// boot, stone clicking, boards knocking hollow (a ship's deck booming under
// them, and now and then a creak), snow squeaking, ice ringing thin. The left
// and right feet sit a touch apart in the stereo and in pitch, and wet feet
// squelch for a while after a swim.
const rnd = (a, b) => a + Math.random() * (b - a);

/** One footstep into voice `v`: `surf` what's underfoot, `loud` 0..1 (a stroll to a sprint), `k`: { foot (±1), deck, wet }. */
export function footstep(v, surf, loud, k = {}) {
  const L = 0.7 + 0.5 * loud, r = () => 0.9 + Math.random() * 0.2;
  // (the left foot a shade lower than the right: a gait has a rhythm, not a metronome)
  v.pj *= k.foot < 0 ? 0.97 : 1.02;
  const roll = 0.045 - 0.022 * loud; // heel to toe
  const thud = (t, f, g) => v.thump(t, { f0: f * r(), f1: f * 0.62, dur: 0.06, gain: g * L });
  switch (surf) {
    case 'grass': // a soft crush of blades
      thud(0, 82, 0.06);
      v.noise(0, 0.1, { freq: 1100 * r(), q: 0.55, type: 'lowpass', gain: 0.085, attack: 0.006, sweep: 500 });
      v.noise(roll, 0.075, { freq: 3400 * r(), q: 0.9, gain: 0.024, attack: 0.005 });
      break;
    case 'sand': // a gritty shuffle that gives underfoot
      thud(0, 70, 0.045);
      v.noise(0, 0.14, { freq: 1700 * r(), q: 0.45, gain: 0.08, attack: 0.012, sweep: 700 });
      v.crackle(roll * 0.5, 0.1, 5, { freq: 4200, gain: 0.018 });
      v.noise(roll, 0.08, { type: 'highpass', freq: 3000, gain: 0.015, attack: 0.01 });
      break;
    case 'dirt': // packed earth: a dull pat
      thud(0, 95, 0.08);
      v.noise(0, 0.07, { freq: 620 * r(), q: 0.7, type: 'lowpass', gain: 0.1, attack: 0.003 });
      v.noise(roll, 0.04, { freq: 900 * r(), q: 0.7, type: 'lowpass', gain: 0.04, attack: 0.003 });
      v.crackle(0, 0.05, 2, { freq: 2600, gain: 0.02 });
      break;
    case 'gravel': // loose stones shifting
      thud(0, 90, 0.06);
      v.noise(0, 0.09, { freq: 1500 * r(), q: 0.6, gain: 0.07, attack: 0.004 });
      v.crackle(0, 0.1, 8, { freq: 2800, gain: 0.04 });
      v.crackle(roll, 0.08, 4, { freq: 3300, gain: 0.025 });
      break;
    case 'mud': // a wet squelch, and the boot sucked out of it
      thud(0, 75, 0.06);
      v.tone(0.01, 0.09, { freq: 140 * r(), to: 320, gain: 0.05, attack: 0.01 });
      v.noise(0, 0.12, { freq: 500, q: 0.6, type: 'lowpass', gain: 0.09, attack: 0.01 });
      v.bubble(roll + 0.04, { f: rnd(260, 340), rise: 2, dur: 0.05, gain: 0.03 });
      break;
    case 'stone': // a crisp tap on stone and paving
      v.noise(0, 0.016, { freq: 3000 * r(), q: 0.8, type: 'highpass', gain: 0.07, attack: 0.001 });
      v.tone(0, 0.045, { freq: 190 * r(), to: 120, gain: 0.06 * L, attack: 0.002 });
      v.noise(0, 0.05, { freq: 900 * r(), q: 1.4, gain: 0.065, attack: 0.002 });
      v.noise(roll, 0.012, { freq: 3500 * r(), q: 0.8, type: 'highpass', gain: 0.03, attack: 0.001 });
      break;
    case 'wood': // boards: a hollow knock (a deck booms under it, and creaks now and then)
      v.tone(0, 0.1, { freq: 215 * r(), to: 165, gain: 0.075 * L, attack: 0.002 });
      v.tone(0, 0.05, { freq: 430 * r(), to: 360, gain: 0.024, attack: 0.002 });
      v.noise(0, 0.045, { freq: 1000 * r(), q: 1.3, gain: 0.065, attack: 0.002 });
      v.noise(roll, 0.03, { freq: 1300 * r(), q: 1.5, gain: 0.03, attack: 0.002 });
      if (k.deck) {
        v.tone(0, 0.16, { freq: 118 * r(), to: 92, gain: 0.05 * L, attack: 0.003 });
        if (Math.random() < 0.18) v.creak(0.03, rnd(0.18, 0.35), { rate: rnd(60, 110), rate1: rnd(40, 90), freqs: [250, 395, 560], gain: 0.03 });
      }
      break;
    case 'snow': // a squeaky crunch
      thud(0, 80, 0.04);
      v.noise(0, 0.15, { freq: 2300 * r(), q: 0.6, gain: 0.07, attack: 0.02, sweep: 1300 });
      v.crackle(0.02, 0.12, 9, { freq: 5200, gain: 0.03 });
      v.tone(roll, 0.05, { freq: rnd(1000, 1300), to: 850, gain: 0.008 });
      break;
    case 'ice': // a hard little click
      v.noise(0, 0.02, { freq: 4200 * r(), q: 1, type: 'highpass', gain: 0.07, attack: 0.001 });
      v.ring(0, 2300 * r(), 0.08, 0.012, [1, 1.7]);
      v.tone(0, 0.04, { freq: 160, to: 110, gain: 0.04 });
      v.noise(roll, 0.012, { freq: 5000, type: 'highpass', gain: 0.025, attack: 0.001 });
      break;
    case 'metal': // a dull clank
      v.ring(0, 520 * r(), 0.14, 0.03, [1, 2.2, 3.4]);
      v.noise(0, 0.03, { freq: 2600, q: 1, gain: 0.05, attack: 0.001 });
      thud(0, 120, 0.05);
      v.ring(roll, 700 * r(), 0.08, 0.012, [1, 2.2]);
      break;
    default: // soft: a rug, tatami, cloud
      v.noise(0, 0.08, { freq: 420 * r(), q: 0.6, type: 'lowpass', gain: 0.07, attack: 0.006 });
      thud(0, 70, 0.035);
      v.noise(roll, 0.06, { freq: 300 * r(), type: 'lowpass', gain: 0.03, attack: 0.006 });
  }
  // running: the sole drags a little as it pushes off
  if (loud > 0.85) v.noise(roll + 0.01, 0.06, { freq: 2000, sweep: 1200, q: 0.8, gain: 0.025, attack: 0.004 });
  // wet feet: a squelch in the shoe
  if (k.wet > 0) { v.bubble(0.01, { f: rnd(380, 480), rise: 1.8, dur: 0.04, gain: 0.025 * k.wet }); v.noise(0, 0.06, { freq: 1200, q: 1, gain: 0.025 * k.wet }); }
}
