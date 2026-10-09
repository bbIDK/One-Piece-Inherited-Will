// Every sound effect builds without error, on a stand-in audio graph (each
// node the Web Audio API makes, recording only how many there are).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SFX } from '../src/audio/sfx.js';
import { Voice } from '../src/audio/synth.js';

function param(v = 0) {
  const p = { value: v };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'setValueCurveAtTime', 'cancelAndHoldAtTime']) p[m] = (x) => { if (typeof x === 'number' && !Number.isFinite(x)) throw new Error(`${m}(${x})`); return p; };
  return p;
}
function fakeCtx() {
  let n = 0;
  const node = (extra = {}) => { n++; return { connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), detune: param(0), Q: param(1), pan: param(0), delayTime: param(0), playbackRate: param(1), offset: param(0), ...extra }; };
  const c = {
    currentTime: 0, sampleRate: 48000,
    createGain: () => node(), createOscillator: () => node(), createBiquadFilter: () => node(), createBufferSource: () => node(),
    createDelay: () => node(), createStereoPanner: () => node(), createWaveShaper: () => node({ curve: null }), createConvolver: () => node({ buffer: null }),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createConstantSource: () => node(), createPeriodicWave: () => ({}),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len), length: len, duration: len / 48000 }),
    get nodes() { return n; },
  };
  return c;
}

test('every sound effect builds', () => {
  const ctx = fakeCtx();
  const E = { ctx, now: () => 0, noiseBuf: () => ({}), curve: () => new Float32Array(16) };
  const bad = [];
  for (const [name, def] of Object.entries(SFX)) {
    if (typeof def?.play !== 'function') continue;
    for (let rr = 0; rr < (def.variants || 1); rr++) {
      const v = new Voice(E, ctx.createGain(), 0, { name });
      try { def.play(v, { rr, w: 0.5, s: 1, voice: 0.5 }); } catch (e) { bad.push(`${name}: ${e.message}`); }
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(ctx.nodes > 1000);
});
