// The music's themes: what a piece is made of in each place — its key and
// mode, tempo, feel (straight or the lilting 6/8 of a shanty), chord
// progressions, and which instruments carry the melody, the arpeggio, the
// bass and the pad. The first seven are the originals and stay exactly as they
// were; every other place's theme is a sibling of them, composed by the same
// composer (music.js), so a voyage from the East Blue to the New World sounds
// like one score.
//
// A theme: { key (MIDI root), mode, bpm, feel, prog (chord roots as scale
// degrees), lead, leadVol, leadOct, legato, arp, arpVol, arpOct, arpDensity,
// bass, bassPat, pad, padInst, padVol, bars [min, max], rest [min, max]
// seconds of quiet after a piece, melody (how often the motif speaks), follow
// (the melody follows the chords), drums, shifts (keys it may be transposed to) }.

// ------------------------------------------------------------ the originals
export const THEMES = {
  title: { key: 50, mode: 'ionian', bpm: 70, feel: 'straight', prog: [[0, 5, 3, 4], [0, 3, 5, 4]], lead: 'piano', arp: 'piano', pad: true, arpDensity: 0.8, bars: [16, 24], rest: [6, 14], melody: 0.85 },
  sea: { key: 55, mode: 'mixolydian', bpm: 58, feel: 'lilt', prog: [[0, 3, 0, 4], [0, 6, 3, 0], [0, 3, 6, 0]], lead: 'flute', arp: 'pluck', pad: true, arpDensity: 0.75, bars: [16, 32], rest: [18, 45], melody: 0.75 },
  town: { key: 57, mode: 'ionian', bpm: 62, feel: 'lilt', prog: [[0, 3, 4, 0], [0, 5, 3, 4]], lead: 'accordion', leadVol: 0.05, arp: 'pluck', bass: 'pluck', pad: false, arpDensity: 0.9, bars: [16, 24], rest: [15, 35], melody: 0.8 },
  night: { key: 52, mode: 'aeolian', bpm: 56, feel: 'straight', prog: [[0, 5, 2, 6], [0, 3, 5, 4]], lead: 'piano', leadVol: 0.06, arp: 'piano', arpVol: 0.8, pad: true, padVol: 0.014, arpDensity: 0.45, bars: [12, 20], rest: [25, 60], melody: 0.55 },
  grandline: { key: 53, mode: 'dorian', bpm: 64, feel: 'straight', prog: [[0, 3, 0, 6], [0, 6, 3, 4]], lead: 'musicbox', leadVol: 0.05, arp: 'piano', pad: true, arpDensity: 0.65, bars: [16, 24], rest: [18, 45], melody: 0.7 },
  underwater: { key: 50, mode: 'lydian', bpm: 50, feel: 'straight', prog: [[0, 1, 0, 1], [0, 4, 1, 0]], lead: 'musicbox', leadVol: 0.045, arp: null, pad: true, padVol: 0.022, bars: [12, 16], rest: [10, 25], melody: 0.6 },
  battle: { key: 45, mode: 'dorian', bpm: 128, feel: 'straight', prog: [[0, 0, 5, 6], [0, 3, 6, 4]], lead: 'pluck', leadVol: 0.07, legato: 0.6, arp: 'pluck', arpVol: 0.8, bass: 'pluck', pad: true, padVol: 0.012, arpDensity: 1, bars: [32, 48], rest: [0, 0], melody: 0.9, follow: true,
    drums: { kick: [1, 0, 0, 1, 0, 0, 1, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: true } },
};

const T = THEMES;
const add = (id, t) => { THEMES[id] = { id, ...t }; };
for (const id of Object.keys(THEMES)) THEMES[id].id = id;

// ------------------------------------------------------------ the seas
// (Paradise keeps the original Grand Line theme; the East Blue the original sea)
add('north_blue', { key: 50, mode: 'dorian', bpm: 56, feel: 'lilt', prog: [[0, 6, 3, 0], [0, 3, 6, 4], [0, 4, 6, 0]], lead: 'whistle', leadVol: 0.045, arp: 'harp', arpVol: 0.9, pad: true, padVol: 0.016, arpDensity: 0.7, bars: [16, 28], rest: [20, 45], melody: 0.7 });
add('west_blue', { key: 53, mode: 'aeolian', bpm: 60, feel: 'lilt', prog: [[0, 5, 2, 6], [0, 3, 4, 0], [0, 5, 3, 4]], lead: 'mandolin', leadVol: 0.045, arp: 'guitar', bass: 'bass', pad: true, padVol: 0.014, arpDensity: 0.75, bars: [16, 24], rest: [18, 40], melody: 0.75 });
add('south_blue', { key: 52, mode: 'mixolydian', bpm: 64, feel: 'lilt', prog: [[0, 3, 4, 0], [0, 6, 3, 0], [0, 3, 0, 4]], lead: 'steel', leadVol: 0.05, arp: 'marimba', arpVol: 0.9, bass: 'bass', pad: true, padVol: 0.012, arpDensity: 0.85, bars: [16, 24], rest: [18, 40], melody: 0.75, drums: { shaker: [1, 0, 1, 1, 0, 1], vol: 0.35 } });
add('new_world', { key: 50, mode: 'aeolian', bpm: 58, feel: 'straight', prog: [[0, 5, 6, 0], [0, 3, 5, 4], [0, 6, 5, 4]], lead: 'horn', leadVol: 0.065, arp: 'piano', arpVol: 1, pad: true, padInst: 'strings', padVol: 0.016, arpDensity: 0.6, bars: [16, 24], rest: [22, 50], melody: 0.65 });
add('calm_belt', { key: 46, mode: 'lydian', bpm: 44, feel: 'straight', prog: [[0, 1, 0, 1], [0, 4, 1, 0]], lead: 'musicbox', leadVol: 0.035, arp: null, pad: true, padVol: 0.02, bars: [10, 14], rest: [30, 60], melody: 0.45 });
add('polar', { key: 54, mode: 'dorian', bpm: 50, feel: 'straight', prog: [[0, 3, 0, 4], [0, 6, 3, 0]], lead: 'celesta', leadVol: 0.05, arp: 'harp', arpVol: 0.7, pad: true, padVol: 0.016, arpDensity: 0.5, bars: [12, 20], rest: [25, 55], melody: 0.6 });
add('red_line', { key: 48, mode: 'lydian', bpm: 60, feel: 'straight', prog: [[0, 1, 4, 0], [0, 5, 1, 4]], lead: 'horn', leadVol: 0.045, arp: 'harp', pad: true, padInst: 'choir', padVol: 0.014, arpDensity: 0.6, bars: [12, 20], rest: [20, 45], melody: 0.7 });
add('mary_geoise', { key: 50, mode: 'ionian', bpm: 60, feel: 'straight', prog: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 1, 4, 0]], lead: 'organ', leadVol: 0.03, arp: 'harp', arpVol: 0.8, pad: true, padInst: 'choir', padVol: 0.014, arpDensity: 0.6, bars: [12, 20], rest: [20, 45], melody: 0.7 });
// Reverse Mountain: up the torrent — a driving, rising ride with no breath in it
add('reverse_mountain', { key: 52, mode: 'lydian', bpm: 132, feel: 'straight', prog: [[0, 1, 2, 4], [0, 1, 4, 5], [0, 5, 1, 4]], lead: 'whistle', leadVol: 0.05, legato: 0.8, arp: 'pluck', arpVol: 0.9, bassInst: 'pluck', bassPat: [1, 0, 1, 1, 0, 1, 1, 0], pad: true, padInst: 'strings', padVol: 0.012, arpDensity: 1, bars: [32, 48], rest: [0, 0], melody: 0.9, follow: true, loop: true,
  drums: { kick: [1, 0, 0, 1, 0, 0, 1, 0], tom: [0, 0, 0, 0, 0, 1, 0, 1], hat: true, vol: 0.9 } });

// ------------------------------------------------------------ zones
add('skypiea', { key: 48, mode: 'lydian', bpm: 62, feel: 'lilt', prog: [[0, 1, 0, 4], [0, 5, 1, 0], [0, 3, 1, 4]], lead: 'flute', leadVol: 0.05, arp: 'harp', arpVol: 0.9, pad: true, padVol: 0.016, arpDensity: 0.7, bars: [16, 24], rest: [18, 40], melody: 0.75 });
add('shandia', { key: 50, mode: 'dorian', bpm: 66, feel: 'straight', prog: [[0, 6, 0, 3], [0, 3, 6, 0]], lead: 'shakuhachi', leadVol: 0.045, arp: 'marimba', arpVol: 0.85, pad: true, padVol: 0.012, arpDensity: 0.6, bars: [12, 20], rest: [15, 35], melody: 0.7, drums: { taiko: [1, 0, 0, 0, 1, 0, 0, 0], tom: [0, 0, 1, 0, 0, 0, 1, 1], vol: 0.35 } });
add('fishman', { key: 53, mode: 'ionian', bpm: 68, feel: 'lilt', prog: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 1, 4, 0]], lead: 'steel', leadVol: 0.05, arp: 'marimba', arpVol: 0.85, bass: 'bass', pad: true, padVol: 0.016, arpDensity: 0.8, bars: [16, 24], rest: [15, 35], melody: 0.8, drums: { shaker: [1, 0, 1, 1, 0, 1], vol: 0.3 } });
add('impel_down', { key: 49, mode: 'phrygian', bpm: 52, feel: 'straight', prog: [[0, 1, 0, 6], [0, 5, 1, 0]], lead: 'piano', leadOct: -1, leadVol: 0.055, arp: null, bass: 'piano', pad: true, padInst: 'strings', padVol: 0.014, bars: [12, 16], rest: [25, 50], melody: 0.5 });
add('newkama', { key: 55, mode: 'mixolydian', bpm: 84, feel: 'lilt', prog: [[0, 3, 4, 0], [0, 6, 3, 4]], lead: 'accordion', leadVol: 0.05, arp: 'pluck', arpVol: 0.8, bassInst: 'bass', bassPat: [1, 0, 0, 2, 0, 0], pad: false, arpDensity: 0.85, bars: [16, 24], rest: [10, 25], melody: 0.85, drums: { kick: [1, 0, 0, 0, 0, 0], snare: [0, 0, 0, 1, 0, 0], vol: 0.35 } });

// ------------------------------------------------------------ islands and towns
// The East Blue
add('foosha', { key: 50, mode: 'ionian', bpm: 64, feel: 'lilt', prog: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 3, 0, 4]], lead: 'whistle', leadVol: 0.045, arp: 'guitar', arpVol: 0.9, pad: true, padVol: 0.014, arpDensity: 0.8, bars: [16, 24], rest: [15, 35], melody: 0.85 });
add('marine', { key: 46, mode: 'ionian', bpm: 72, feel: 'straight', prog: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 1, 4, 0]], lead: 'horn', leadVol: 0.045, arp: 'piano', arpVol: 0.8, bass: 'pluck', pad: true, padInst: 'strings', padVol: 0.01, arpDensity: 0.7, bars: [16, 24], rest: [15, 35], melody: 0.8, drums: { snare: [1, 0, 0, 1, 1, 0, 1, 0], vol: 0.25 } });
add('wano', { key: 50, mode: 'in', bpm: 58, feel: 'straight', prog: [[0, 3, 0, 2], [0, 2, 3, 0], [0, 4, 3, 0]], lead: 'shakuhachi', leadVol: 0.05, arp: 'koto', arpVol: 0.9, pad: true, padVol: 0.012, arpDensity: 0.6, bars: [12, 20], rest: [18, 40], melody: 0.7, drums: { taiko: [1, 0, 0, 0, 0, 0, 0, 0], vol: 0.25 } });
add('circus', { key: 53, mode: 'ionian', bpm: 84, feel: 'lilt', prog: [[0, 4, 4, 0], [0, 3, 4, 0], [0, 1, 4, 0]], lead: 'calliope', leadVol: 0.04, arp: 'pluck', arpVol: 0.7, bassInst: 'bass', bassPat: [1, 0, 0, 2, 0, 0], pad: false, arpDensity: 0.7, bars: [16, 24], rest: [15, 30], melody: 0.85, drums: { block: [0, 0, 1, 0, 0, 1], vol: 0.3 } });
add('syrup', { key: 55, mode: 'ionian', bpm: 66, feel: 'lilt', prog: [[0, 3, 4, 0], [0, 1, 4, 0], [0, 3, 1, 4]], lead: 'flute', leadVol: 0.055, arp: 'harp', arpVol: 0.85, pad: true, padVol: 0.014, arpDensity: 0.75, bars: [16, 24], rest: [18, 40], melody: 0.8 });
add('baratie', { key: 53, mode: 'dorian', bpm: 76, feel: 'lilt', prog: [[0, 3, 0, 4], [1, 4, 0, 0], [0, 5, 1, 4]], lead: 'sax', leadVol: 0.04, arp: 'piano', arpVol: 0.75, bassInst: 'bass', bassPat: [1, 0, 1, 1, 0, 1], pad: false, arpDensity: 0.65, bars: [16, 24], rest: [12, 30], melody: 0.85, drums: { hat: true, vol: 0.45 } });
add('cocoyasi', { key: 52, mode: 'aeolian', bpm: 62, feel: 'lilt', prog: [[0, 5, 6, 0], [0, 3, 6, 2], [0, 5, 3, 4]], lead: 'accordion', leadVol: 0.045, arp: 'guitar', arpVol: 0.9, pad: true, padVol: 0.014, arpDensity: 0.75, bars: [16, 24], rest: [18, 40], melody: 0.8 });
add('arlong', { key: 50, mode: 'phrygian', bpm: 60, feel: 'straight', prog: [[0, 1, 0, 1], [0, 1, 6, 0], [0, 5, 1, 0]], lead: 'horn', leadOct: -1, leadVol: 0.05, arp: 'pluck', arpVol: 0.8, bass: 'piano', pad: true, padInst: 'strings', padVol: 0.012, arpDensity: 0.55, bars: [12, 20], rest: [15, 35], melody: 0.6, drums: { taiko: [1, 0, 0, 0, 0, 0, 1, 0], vol: 0.3 } });
add('loguetown', { key: 57, mode: 'mixolydian', bpm: 70, feel: 'lilt', prog: [[0, 6, 3, 0], [0, 3, 4, 0], [0, 6, 4, 0]], lead: 'fiddle', leadVol: 0.045, arp: 'pluck', bass: 'pluck', pad: true, padVol: 0.012, arpDensity: 0.9, bars: [16, 24], rest: [12, 30], melody: 0.85 });
add('bleak', { key: 47, mode: 'aeolian', bpm: 52, feel: 'straight', prog: [[0, 5, 3, 4], [0, 6, 5, 4]], lead: 'fiddle', leadVol: 0.04, arp: 'piano', arpVol: 0.7, pad: true, padInst: 'strings', padVol: 0.012, arpDensity: 0.45, bars: [12, 20], rest: [25, 55], melody: 0.55 });
// Paradise
add('twin_cape', { key: 51, mode: 'ionian', bpm: 56, feel: 'straight', prog: [[0, 5, 3, 4], [0, 3, 5, 4]], lead: 'musicbox', leadVol: 0.045, arp: 'piano', pad: true, padVol: 0.018, arpDensity: 0.6, bars: [12, 20], rest: [20, 40], melody: 0.7 });
add('whiskey_peak', { key: 55, mode: 'mixolydian', bpm: 74, feel: 'lilt', prog: [[0, 6, 0, 4], [0, 3, 6, 0]], lead: 'accordion', leadVol: 0.045, arp: 'guitar', arpVol: 0.85, bassInst: 'bass', bassPat: [1, 0, 0, 2, 0, 0], pad: false, arpDensity: 0.85, bars: [16, 24], rest: [12, 30], melody: 0.85, drums: { block: [1, 0, 1, 0, 1, 1], vol: 0.25 }, night: 'whiskey_peak_night' });
add('whiskey_peak_night', { key: 55, mode: 'harmonic', bpm: 60, feel: 'lilt', prog: [[0, 5, 3, 4], [0, 1, 4, 0]], lead: 'piano', leadVol: 0.05, arp: 'guitar', arpVol: 0.6, pad: true, padInst: 'strings', padVol: 0.012, arpDensity: 0.5, bars: [12, 20], rest: [20, 40], melody: 0.6 });
add('little_garden', { key: 45, mode: 'dorian', bpm: 60, feel: 'straight', prog: [[0, 6, 0, 3], [0, 3, 6, 4]], lead: 'horn', leadOct: -1, leadVol: 0.05, arp: 'marimba', arpVol: 0.9, bass: 'pluck', pad: true, padVol: 0.012, arpDensity: 0.6, bars: [12, 20], rest: [15, 35], melody: 0.6, drums: { taiko: [1, 0, 0, 1, 0, 0, 0, 0], tom: [0, 0, 0, 0, 0, 0, 1, 0], vol: 0.35 } });
add('drum', { key: 50, mode: 'aeolian', bpm: 56, feel: 'lilt', prog: [[0, 5, 3, 4], [0, 6, 5, 4], [0, 3, 6, 2]], lead: 'celesta', leadVol: 0.05, arp: 'harp', arpVol: 0.85, pad: true, padInst: 'strings', padVol: 0.012, arpDensity: 0.6, bars: [16, 24], rest: [20, 45], melody: 0.75 });
add('alabasta', { key: 50, mode: 'hijaz', bpm: 60, feel: 'straight', prog: [[0, 1, 0, 6], [0, 5, 1, 0], [0, 3, 1, 0]], lead: 'shakuhachi', leadVol: 0.05, arp: 'oud', arpVol: 0.9, pad: true, padVol: 0.014, arpDensity: 0.65, bars: [12, 20], rest: [18, 40], melody: 0.75, drums: { tom: [1, 0, 0, 1, 0, 0, 1, 0], vol: 0.22 } });
add('mocktown', { key: 52, mode: 'mixolydian', bpm: 78, feel: 'lilt', prog: [[0, 6, 3, 0], [0, 3, 4, 0]], lead: 'fiddle', leadVol: 0.045, arp: 'pluck', arpVol: 0.85, bassInst: 'bass', bassPat: [1, 0, 0, 1, 0, 0], pad: false, arpDensity: 0.85, bars: [16, 24], rest: [12, 30], melody: 0.85, drums: { kick: [1, 0, 0, 1, 0, 0], block: [0, 0, 1, 0, 0, 1], vol: 0.3 } });
add('water7', { key: 57, mode: 'ionian', bpm: 66, feel: 'lilt', prog: [[0, 3, 4, 0], [0, 5, 1, 4], [0, 2, 3, 4]], lead: 'mandolin', leadVol: 0.04, arp: 'guitar', arpVol: 0.85, bass: 'bass', pad: true, padInst: 'strings', padVol: 0.01, arpDensity: 0.8, bars: [16, 24], rest: [15, 35], melody: 0.8 });
add('enies_lobby', { key: 48, mode: 'harmonic', bpm: 66, feel: 'straight', prog: [[0, 5, 3, 4], [0, 3, 4, 0]], lead: 'horn', leadVol: 0.045, arp: 'piano', arpVol: 0.8, bass: 'pluck', pad: true, padInst: 'strings', padVol: 0.012, arpDensity: 0.7, bars: [12, 20], rest: [15, 30], melody: 0.7, drums: { snare: [1, 0, 0, 1, 1, 0, 1, 0], vol: 0.25 } });
add('thriller', { key: 49, mode: 'harmonic', bpm: 54, feel: 'lilt', prog: [[0, 5, 3, 4], [0, 1, 4, 0]], lead: 'organ', leadVol: 0.045, arp: 'musicbox', arpVol: 0.9, pad: true, padInst: 'choir', padVol: 0.01, arpDensity: 0.55, bars: [12, 20], rest: [20, 45], melody: 0.6 });
add('sabaody', { key: 53, mode: 'lydian', bpm: 66, feel: 'lilt', prog: [[0, 1, 4, 0], [0, 5, 1, 0]], lead: 'celesta', leadVol: 0.05, arp: 'harp', arpVol: 0.85, bass: 'bass', pad: true, padVol: 0.014, arpDensity: 0.75, bars: [16, 24], rest: [15, 35], melody: 0.8 });
add('marineford', { key: 46, mode: 'aeolian', bpm: 70, feel: 'straight', prog: [[0, 5, 6, 0], [0, 3, 4, 0]], lead: 'horn', leadVol: 0.05, arp: 'piano', arpVol: 0.8, bass: 'pluck', pad: true, padInst: 'strings', padVol: 0.012, arpDensity: 0.7, bars: [12, 20], rest: [12, 30], melody: 0.75, drums: { snare: [1, 0, 0, 1, 1, 0, 1, 0], taiko: [1, 0, 0, 0, 0, 0, 0, 0], vol: 0.3 } });
add('amazon', { key: 52, mode: 'penta', bpm: 64, feel: 'straight', prog: [[0, 3, 0, 2], [0, 2, 3, 4]], lead: 'flute', leadVol: 0.05, arp: 'marimba', arpVol: 0.9, pad: true, padVol: 0.012, arpDensity: 0.7, bars: [16, 24], rest: [15, 35], melody: 0.8, drums: { tom: [1, 0, 0, 1, 0, 0, 1, 0], vol: 0.25 } });
add('gothic', { key: 48, mode: 'aeolian', bpm: 52, feel: 'lilt', prog: [[0, 5, 3, 4], [0, 6, 5, 4]], lead: 'organ', leadVol: 0.03, arp: 'pluck', arpVol: 0.7, pad: true, padInst: 'choir', padVol: 0.012, arpDensity: 0.5, bars: [12, 20], rest: [25, 50], melody: 0.55 });
add('future', { key: 50, mode: 'lydian', bpm: 74, feel: 'straight', prog: [[0, 1, 4, 5], [0, 5, 1, 4]], lead: 'synth', leadVol: 0.035, arp: 'synth', arpVol: 0.55, arpOct: 0, bass: 'bass', pad: true, padVol: 0.012, arpDensity: 0.9, bars: [16, 24], rest: [15, 30], melody: 0.75 });
add('punk_hazard', { key: 49, mode: 'phrygian', bpm: 64, feel: 'straight', prog: [[0, 1, 0, 6], [0, 5, 1, 0]], lead: 'synth', leadVol: 0.035, arp: 'piano', arpVol: 0.75, pad: true, padInst: 'strings', padVol: 0.012, arpDensity: 0.6, bars: [12, 20], rest: [18, 40], melody: 0.6 });
// The New World
add('dressrosa', { key: 52, mode: 'hijaz', bpm: 74, feel: 'lilt', prog: [[0, 6, 5, 0], [0, 5, 6, 0], [3, 6, 5, 0]], lead: 'fiddle', leadVol: 0.045, arp: 'guitar', arpVol: 0.95, pad: false, arpDensity: 0.95, bars: [16, 24], rest: [12, 30], melody: 0.85, drums: { block: [1, 0, 1, 1, 0, 1], vol: 0.25 } });
add('totland', { key: 55, mode: 'ionian', bpm: 76, feel: 'lilt', prog: [[0, 4, 0, 4], [0, 3, 4, 0], [0, 5, 1, 4]], lead: 'celesta', leadVol: 0.05, arp: 'pluck', arpVol: 0.7, bassInst: 'bass', bassPat: [1, 0, 0, 2, 0, 0], pad: false, arpDensity: 0.7, bars: [16, 24], rest: [15, 30], melody: 0.85, night: 'totland_night' });
add('totland_night', { key: 55, mode: 'harmonic', bpm: 62, feel: 'lilt', prog: [[0, 5, 3, 4], [0, 4, 0, 4]], lead: 'musicbox', leadVol: 0.045, arp: 'celesta', arpVol: 0.6, pad: true, padVol: 0.012, arpDensity: 0.5, bars: [12, 20], rest: [20, 40], melody: 0.6 });
add('zou', { key: 50, mode: 'dorian', bpm: 62, feel: 'straight', prog: [[0, 3, 0, 6], [0, 6, 3, 4]], lead: 'flute', leadVol: 0.05, arp: 'marimba', arpVol: 0.85, pad: true, padVol: 0.014, arpDensity: 0.65, bars: [16, 24], rest: [15, 35], melody: 0.75, drums: { tom: [1, 0, 0, 0, 1, 0, 1, 0], vol: 0.2 } });
add('elbaf', { key: 45, mode: 'dorian', bpm: 54, feel: 'straight', prog: [[0, 6, 3, 0], [0, 3, 6, 4]], lead: 'horn', leadOct: -1, leadVol: 0.05, arp: 'harp', arpVol: 0.85, pad: true, padInst: 'choir', padVol: 0.016, arpDensity: 0.55, bars: [12, 20], rest: [18, 40], melody: 0.7, drums: { taiko: [1, 0, 0, 0, 1, 0, 0, 0], vol: 0.35 } });
add('tontatta', { key: 60, mode: 'ionian', bpm: 80, feel: 'lilt', prog: [[0, 3, 4, 0], [0, 5, 3, 4]], lead: 'whistle', leadOct: -1, leadVol: 0.045, arp: 'pluck', arpVol: 0.7, pad: false, arpDensity: 0.9, bars: [16, 24], rest: [12, 30], melody: 0.85 });
add('onigashima', { key: 48, mode: 'in', bpm: 70, feel: 'straight', prog: [[0, 1, 0, 3], [0, 3, 1, 0]], lead: 'shakuhachi', leadVol: 0.05, arp: 'koto', arpVol: 0.85, pad: true, padInst: 'strings', padVol: 0.012, arpDensity: 0.7, bars: [12, 20], rest: [12, 30], melody: 0.7, drums: { taiko: [1, 0, 0, 1, 0, 0, 1, 0], vol: 0.4 } });
add('pirate_den', { key: 50, mode: 'phrygian', bpm: 74, feel: 'lilt', prog: [[0, 1, 0, 6], [0, 6, 5, 0]], lead: 'fiddle', leadVol: 0.045, arp: 'pluck', arpVol: 0.8, bassInst: 'bass', bassPat: [1, 0, 0, 1, 0, 0], pad: false, arpDensity: 0.8, bars: [16, 24], rest: [12, 30], melody: 0.8 });
add('laugh_tale', { ...T.title, padInst: 'strings', padVol: 0.016, melody: 0.95, rest: [8, 16] });
add('germa', { key: 50, mode: 'aeolian', bpm: 74, feel: 'straight', prog: [[0, 5, 6, 0], [0, 3, 4, 0]], lead: 'horn', leadVol: 0.045, arp: 'piano', arpVol: 0.75, bass: 'pluck', pad: true, padInst: 'strings', padVol: 0.012, arpDensity: 0.7, bars: [12, 20], rest: [15, 30], melody: 0.75, drums: { snare: [1, 0, 1, 1, 1, 0, 1, 0], vol: 0.25 } });
// The other Blues
add('flevance', { key: 52, mode: 'aeolian', bpm: 50, feel: 'straight', prog: [[0, 5, 3, 4], [0, 3, 5, 4]], lead: 'piano', leadVol: 0.055, arp: 'celesta', arpVol: 0.6, pad: true, padVol: 0.014, arpDensity: 0.45, bars: [12, 16], rest: [25, 55], melody: 0.5 });
add('ohara', { key: 53, mode: 'ionian', bpm: 60, feel: 'straight', prog: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 2, 5, 4]], lead: 'piano', leadVol: 0.06, arp: 'harp', arpVol: 0.8, pad: true, padVol: 0.016, arpDensity: 0.6, bars: [12, 20], rest: [20, 45], melody: 0.7 });
add('kano', { key: 52, mode: 'penta', bpm: 62, feel: 'straight', prog: [[0, 3, 0, 2], [0, 2, 3, 0], [0, 4, 3, 0]], lead: 'erhu', leadVol: 0.04, legato: 1, arp: 'koto', arpVol: 0.85, pad: true, padVol: 0.012, arpDensity: 0.65, bars: [12, 20], rest: [18, 40], melody: 0.75, drums: { block: [1, 0, 0, 0, 1, 0, 1, 0], vol: 0.2 } });
add('samba', { key: 55, mode: 'mixolydian', bpm: 72, feel: 'straight', prog: [[0, 3, 4, 0], [0, 6, 3, 0]], lead: 'steel', leadVol: 0.05, arp: 'guitar', arpVol: 0.85, bassInst: 'bass', bassPat: [1, 0, 0, 1, 1, 0, 0, 1], pad: false, arpDensity: 0.85, bars: [16, 24], rest: [12, 30], melody: 0.85, drums: { shaker: [1, 1, 1, 1, 1, 1, 1, 1], block: [1, 0, 0, 1, 0, 0, 1, 0], vol: 0.3 } });
add('hymn', { key: 53, mode: 'ionian', bpm: 54, feel: 'straight', prog: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 3, 0, 4]], lead: 'organ', leadVol: 0.028, arp: 'harp', arpVol: 0.8, pad: true, padInst: 'choir', padVol: 0.012, arpDensity: 0.55, bars: [12, 20], rest: [20, 45], melody: 0.7 });

// ------------------------------------------------------------ which place gets which
// (notable islands by id; a town inside an island can have its own: Arlong Park)
export const ISLAND_THEME = {
  dawn_island: 'foosha', shells_island: 'marine', shimotsuki: 'wano', organ_islands: 'circus', gecko_islands: 'syrup',
  baratie: 'baratie', conomi_islands: 'cocoyasi', polestar_islands: 'loguetown', tequila_wolf: 'bleak',
  twin_cape: 'twin_cape', cactus_island: 'whiskey_peak', little_garden: 'little_garden', drum_island: 'drum',
  alabasta: 'alabasta', jaya: 'mocktown', water_7: 'water7', st_poplar: 'water7', pucci: 'water7', san_faldo: 'water7', spa_island: 'water7',
  enies_lobby: 'enies_lobby', thriller_bark: 'thriller', sabaody: 'sabaody', marineford: 'marineford', navarone: 'marine',
  amazon_lily: 'amazon', rusukaina: 'amazon', impel_down: 'impel_down', kuraigana: 'gothic', karakuri: 'future', momoiro: 'newkama', boin: 'amazon',
  dressrosa: 'dressrosa', whole_cake_island: 'totland', cacao_island: 'totland', zou: 'zou', elbaf: 'elbaf', green_bit: 'tontatta',
  wano: 'wano', onigashima: 'onigashima', hachinosu: 'pirate_den', laugh_tale: 'laugh_tale', egghead: 'future', punk_hazard: 'punk_hazard',
  new_marineford: 'marine', g5_base: 'marine', karai_bari: 'circus', baltigo: 'bleak',
  germa_kingdom: 'germa', flevance: 'flevance', minion_island: 'flevance', spider_miles: 'pirate_den', rubeck: 'marine',
  ohara: 'ohara', god_valley: 'gothic', esperia: 'flevance', kano_country: 'kano', marine_80th: 'marine',
  karate_island: 'kano', samba_kingdom: 'samba', sorbet_kingdom: 'hymn',
};
export const TOWN_THEME = { arlong_park: 'arlong', marine_153: 'marine', marine_16: 'marine', ph_laboratory: 'future', id_newkama: 'newkama' };
export const ZONE_THEME = { skypiea: 'skypiea', fishman_island: 'fishman', impel_down: 'impel_down' };
// (islands inside the zones)
export const ZONE_ISLAND_THEME = { upper_yard: 'shandia', shandia_village: 'shandia', id_newkama: 'newkama' };

// each sea's own sound, for its islands that have no theme of their own:
// the instruments a town plays there, and the open sea's theme
const SEA_PALETTE = {
  east_blue: { sea: 'sea', town: 'town' },
  north_blue: { sea: 'north_blue', lead: 'whistle', arp: 'harp', key: 50, mode: 'dorian' },
  west_blue: { sea: 'west_blue', lead: 'mandolin', arp: 'guitar', key: 53, mode: 'aeolian' },
  south_blue: { sea: 'south_blue', lead: 'steel', arp: 'marimba', key: 52, mode: 'mixolydian' },
  paradise: { sea: 'grandline', lead: 'musicbox', arp: 'piano', key: 53, mode: 'dorian' },
  new_world: { sea: 'new_world', lead: 'horn', arp: 'piano', key: 50, mode: 'aeolian' },
  calm_belt: { sea: 'calm_belt', lead: 'musicbox', arp: 'harp', key: 46, mode: 'lydian' },
};
// what an island's climate does to its music (the instruments, the mode)
const CLIMATE = {
  winter: { lead: 'celesta', arp: 'harp', mode: 'aeolian', bpm: -6 },
  desert: { lead: 'shakuhachi', arp: 'oud', mode: 'hijaz' },
  jungle: { arp: 'marimba', drums: { tom: [1, 0, 0, 1, 0, 0, 1, 0], vol: 0.2 } },
  tropical: { arp: 'marimba', lead: 'steel' },
  sakura: { lead: 'shakuhachi', arp: 'koto', mode: 'in' },
  gloom: { lead: 'organ', arp: 'musicbox', mode: 'harmonic', bpm: -8 },
  volcanic: { arp: 'piano', padInst: 'strings', mode: 'phrygian' },
  candy: { lead: 'celesta', arp: 'pluck' },
  rocky: { lead: 'horn', mode: 'dorian' },
  marsh: { lead: 'musicbox', mode: 'aeolian', bpm: -6 },
  autumn: { lead: 'fiddle', mode: 'aeolian' },
  spring: { lead: 'whistle', mode: 'ionian' },
  mangrove: { lead: 'celesta', arp: 'harp' },
  prehistoric: { base: 'little_garden' },
};
// what a town's look says (a Marine base sounds like one wherever it is)
const STYLE = { marine: 'marine', wano: 'wano', chinese: 'kano', desert: 'alabasta', snow: 'drum', fishman: 'fishman', future: 'future', candy: 'totland', tribal: 'shandia', giant: 'elbaf', ruins: 'flevance' };
// an island's own hint (its data's `music`) when nothing else says
const HINT = { night: 'night', battle: 'arlong', title: 'laugh_tale', grandline: 'grandline', town: 'town', sea: null };

/** A small, steady hash of a name (an island always gets the same variations). */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const cache = new Map();
/**
 * The theme for an island no table names: its sea's palette, coloured by its
 * climate and its towns, and turned a little (key, tempo) by its name so no
 * two islands sound quite alike.
 */
export function islandTheme(def, seaId, townStyle = null) {
  const key = `isl:${def.id}`;
  if (cache.has(key)) return cache.get(key);
  const pal = SEA_PALETTE[seaId] || SEA_PALETTE.east_blue;
  const cl = CLIMATE[def.climate] || {};
  let base = cl.base ? T[cl.base] : null;
  if (!base && townStyle && STYLE[townStyle]) base = T[STYLE[townStyle]];
  if (!base && def.music && HINT[def.music]) base = T[HINT[def.music]];
  const town = !base && (def.towns?.length || townStyle);
  let out;
  if (base) out = { ...base };
  else {
    // a town of this sea (the town theme with the sea's instruments), or its wild country
    out = { ...(town ? T.town : T[pal.sea] || T.sea) };
    if (pal.lead && town) out.lead = pal.lead;
    if (pal.arp) out.arp = pal.arp;
    if (pal.mode) out.mode = pal.mode;
    if (pal.key) out.key = pal.key;
    if (cl.lead) out.lead = cl.lead;
    if (cl.arp) out.arp = cl.arp;
    if (cl.mode) out.mode = cl.mode;
    if (cl.padInst) { out.padInst = cl.padInst; out.pad = true; }
    if (cl.drums) out.drums = cl.drums;
    if (cl.bpm) out.bpm += cl.bpm;
  }
  // (each its own: a key a step or a fourth away, a few beats faster or slower)
  const h = hash(def.id);
  out.key += [0, 2, -2, 5, -3, 3][Math.floor(h * 6)];
  out.bpm = Math.round(out.bpm + (h * 8 - 4));
  out.id = key;
  out.leadVol = out.leadVol ?? (out.lead === 'accordion' ? 0.05 : 0.05);
  cache.set(key, out);
  return out;
}

// ------------------------------------------------------------ variants
/** The night's version of a theme: slower, sparser, softer, the melody on a piano or a music box. */
export function nightOf(t) {
  if (t.night && T[t.night]) return T[t.night];
  const key = `night:${t.id}`;
  if (cache.has(key)) return cache.get(key);
  const soft = { accordion: 'piano', fiddle: 'piano', whistle: 'flute', steel: 'musicbox', mandolin: 'guitar', calliope: 'musicbox', sax: 'piano', horn: 'piano', synth: 'celesta', organ: 'organ' };
  const out = {
    ...t, id: key, bpm: Math.round(t.bpm * 0.9), lead: soft[t.lead] || t.lead, leadVol: (t.leadVol ?? 0.07) * 0.85,
    arpDensity: (t.arpDensity ?? 0.7) * 0.6, melody: t.melody * 0.75, drums: null, bassPat: null,
    bass: t.bass || (t.bassPat ? 'bass' : undefined), pad: true, padVol: (t.padVol ?? 0.018) * 0.9,
    rest: [t.rest[0] * 1.4, t.rest[1] * 1.4],
  };
  cache.set(key, out);
  return out;
}

// the lead a fight takes up in each place (the East Blue's is the original pluck)
const BATTLE_LEAD = { whistle: 'fiddle', flute: 'fiddle', harp: 'pluck', celesta: 'pluck', musicbox: 'pluck', piano: 'pluck', accordion: 'pluck', organ: 'brass', shakuhachi: 'koto', calliope: 'brass' };
const DARKER = { ionian: 'dorian', lydian: 'dorian', mixolydian: 'dorian', dorian: 'dorian', aeolian: 'aeolian', phrygian: 'phrygian', harmonic: 'harmonic', hijaz: 'hijaz', in: 'in', yo: 'yo', penta: 'dorian' };

/**
 * A fight's theme for a place: the original battle music, in the place's key
 * and colours (its lead, a darker turn of its mode). `boss`: bigger — faster,
 * heavier drums, brass stabs on the beat, a driving bass.
 */
export function battleOf(place, boss = false) {
  const key = `battle:${place.id}:${boss ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const B = T.battle;
  const plain = ['sea', 'town', 'title', 'night'].includes(place.id);
  const out = { ...B, id: key, battle: true, loop: true, stabs: [1, 0, 0, 1, 0, 0, 1, 0], bassPat: [1, 0, 1, 1, 0, 1, 1, 0], bassVol: 0.06 };
  if (!plain) {
    // the place's key, as the bottom of the fight's range (A2 to G#3)
    const pc = ((place.key - B.key) % 12 + 12) % 12;
    out.key = B.key + (pc > 7 ? pc - 12 : pc);
    out.mode = DARKER[place.mode] || 'dorian';
    out.lead = BATTLE_LEAD[place.lead] || place.lead || 'pluck';
    if (['strings', 'choir'].includes(out.lead)) out.lead = 'brass';
    if (place.arp && ['koto', 'marimba', 'steel', 'guitar', 'oud', 'harp', 'mandolin'].includes(place.arp)) out.arp = place.arp;
    out.bpm = B.bpm + Math.round((place.bpm - 62) * 0.5);
  }
  if (boss) {
    Object.assign(out, {
      bpm: out.bpm + 8, mode: out.mode === 'dorian' ? 'aeolian' : out.mode, bassPat: [1, 1, 1, 1, 1, 1, 1, 1],
      drums: { kick: [1, 0, 1, 1, 0, 0, 1, 0], snare: [0, 0, 1, 0, 0, 0, 1, 1], taiko: [1, 0, 0, 0, 0, 0, 0, 0], hat: true },
      stabs: [1, 0, 0, 1, 0, 1, 0, 0], padInst: 'strings', padVol: 0.014,
    });
  }
  cache.set(key, out);
  return out;
}

/**
 * Which theme plays where. `w` is the moment, plain data (see director.js
 * where): { title, zone ('surface'|'sky'|'undersea'|'prison'), zoneId,
 * island ({ id, def, sea }), town ({ id, style }), seaId (the region's id),
 * rm (riding Reverse Mountain), under (head under water), night, holyLand }.
 */
export function placeTheme(w) {
  if (w.title) return T.title;
  if (w.rm) return T.reverse_mountain;
  if (w.under && w.zone !== 'undersea') return T.underwater;
  let t;
  if (w.zone && w.zone !== 'surface') {
    const zi = w.island && ZONE_ISLAND_THEME[w.island.id];
    t = T[zi] || T[ZONE_THEME[w.zoneId]] || (w.zone === 'sky' ? T.skypiea : w.zone === 'undersea' ? T.fishman : T.impel_down);
  } else if (w.town && TOWN_THEME[w.town.id]) t = T[TOWN_THEME[w.town.id]];
  else if (w.island) t = T[ISLAND_THEME[w.island.id]] || islandTheme(w.island.def || w.island, w.island.sea || w.seaId, w.town?.style);
  else if (w.holyLand) t = T.mary_geoise;
  else t = T[SEA_PALETTE[w.seaId]?.sea] || T[w.seaId] || T.sea;
  if (w.night) {
    // (the open East Blue at night has the original night piece)
    if (t === T.sea) return T.night;
    if (t !== T.reverse_mountain && t !== T.underwater) return nightOf(t);
  }
  return t;
}
