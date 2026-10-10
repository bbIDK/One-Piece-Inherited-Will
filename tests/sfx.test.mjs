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

test('every ambience spot (voices across the street, laughter, the rest) builds', async () => {
  const { SPOTS } = await import('../src/audio/ambience.js');
  const ctx = fakeCtx();
  const E = { ctx, now: () => 0, noiseBuf: () => ({}), curve: () => new Float32Array(16) };
  const bad = [];
  for (const [name, def] of Object.entries(SPOTS)) {
    if (typeof def?.play !== 'function') continue;
    for (let k = 0; k < 5; k++) {
      const v = new Voice(E, ctx.createGain(), 0, { name });
      try { def.play(v, { s: 1, sea: 0.5 }); } catch (e) { bad.push(`${name}: ${e.message}`); }
    }
  }
  assert.deepEqual(bad, []);
});

test('every effect and technique builds with its recorded layers decoded, and without them', async () => {
  const { FRUIT_TECH, STYLE_TECH } = await import('../src/audio/sfx.js');
  const { SAMPLE_NAMES } = await import('../src/audio/samples.js');
  for (const withSamples of [true, false]) {
    const ctx = fakeCtx();
    const asked = new Set();
    // (a stand-in for the bank: every name asked for must be one it has)
    const sample = (n) => { asked.add(n); return withSamples ? { duration: 1.2, sampleRate: 48000 } : null; };
    const E = { ctx, now: () => 0, noiseBuf: () => ({}), curve: () => new Float32Array(16), sample };
    const bad = [];
    const run = (name, fn, k) => { const v = new Voice(E, ctx.createGain(), 0, { name }); try { fn(v, k); } catch (e) { bad.push(`${name}: ${e.message}`); } };
    for (const [name, def] of Object.entries(SFX)) if (typeof def?.play === 'function') for (let rr = 0; rr < (def.variants || 1); rr++) run(name, def.play, { rr, w: 0.5, s: 1, voice: 0.5, far: 0.3 });
    for (const [fruit, techs] of Object.entries(FRUIT_TECH)) for (const [id, fn] of Object.entries(techs)) run(`${fruit}.${id}`, fn, { rel: 0.4, def: {} });
    for (const [id, fn] of Object.entries(STYLE_TECH)) run(id, fn, { rel: 0.4, def: {} });
    assert.deepEqual(bad, []);
    assert.deepEqual([...asked].filter((n) => !SAMPLE_NAMES.includes(n)), [], 'unknown sample names');
    assert.ok(asked.has('shatter_1') && asked.has('sub_boom') && asked.has('quake'), 'the quake has its recorded layers');
  }
});

test('the recorded layers decode into the bank, and a group picks among its variants', async () => {
  const { loadSamples, pickSample, SAMPLE_NAMES } = await import('../src/audio/samples.js');
  for (const g of ['punch', 'shatter', 'fire', 'fire_roar', 'ice', 'zap', 'quake', 'sub_boom']) assert.ok(SAMPLE_NAMES.includes(g), g);
  assert.equal(pickSample('shatter'), null);
  const buf = (len) => ({ duration: len / 48000, sampleRate: 48000, numberOfChannels: 1, length: len, getChannelData: () => { const d = new Float32Array(len); d.fill(0.5, 10); return d; } });
  const ctx = { decodeAudioData: (ab) => Promise.resolve(buf(4800)), createBuffer: (ch, len) => buf(len) };
  const n = await loadSamples(ctx);
  assert.equal(n, Object.keys((await import('../src/audio/samples.data.js')).SAMPLE_DATA).length);
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(pickSample('shatter'));
  assert.ok(seen.size > 1);
  assert.ok(pickSample('fire_roar'));
  assert.equal(pickSample('nope'), null);
});
