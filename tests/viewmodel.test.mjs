// First person: your arms and your weapon in front of your eyes. Every
// weapon's wind-up gives its hand as an angle and a reach ({a, r}); read as a
// point, the first-person arms went NaN and drew as wreckage across the view
// ("I can see my insides"). And a weapon is carried as you run, not swung
// about with the stride.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { fpStrike, fpSwing } = await import('../src/render3d/chars/viewmodel.js');
const { actionClip, samplePose, stanceFor, restPose, STANCES } = await import('../src/render/anims.js');
const { allAbilities } = await import('../src/game/abilities.js');
const { STYLES } = await import('../src/data/styles.js');
await import('../src/data/fruits.js');

const WEAPONS = { sword: { kind: 'sword', count: 1 }, sword2: { kind: 'sword', count: 2 }, sword3: { kind: 'sword', count: 3 }, gun: { kind: 'gun', count: 1 }, staff: { kind: 'staff', count: 1 }, axe: { kind: 'axe', count: 1 } };
const finite = (h) => Array.isArray(h) && h.length === 2 && h.every(Number.isFinite);

test('every weapon swing, wind-up to follow-through, gives first-person hands that are real points', () => {
  let swings = 0;
  for (const [sid, st] of Object.entries(STYLES)) {
    const wpn = st.weapon ? WEAPONS[st.weapon === 'sword' ? (st.swords >= 3 ? 'sword3' : st.swords === 2 ? 'sword2' : 'sword') : st.weapon] : null;
    if (!wpn) continue;
    const actor = { weapon: wpn, style: sid, fruit: null };
    const stance = stanceFor(sid, wpn);
    for (const def of allAbilities().filter((d) => d.style === sid || d.source === 'style:' + sid)) {
      const clip = actionClip(def, actor, stance);
      if (!clip.weapon) continue;
      swings++;
      const T = clip.trailTo || 0.6;
      for (let i = 0; i <= 24; i++) {
        const t = (T * i) / 24;
        const P = samplePose(clip, t, { stanceP: STANCES[stance] });
        for (const h of [P.hF, P.hB]) {
          if (!h) continue;
          assert.ok(finite(fpSwing(h)), `${def.id} at ${t.toFixed(2)}s: swing hand ${JSON.stringify(h)} → ${JSON.stringify(fpSwing(h))}`);
          assert.ok(finite(fpStrike(h)), `${def.id} at ${t.toFixed(2)}s: strike hand ${JSON.stringify(h)} → ${JSON.stringify(fpStrike(h))}`);
        }
      }
    }
  }
  assert.ok(swings > 20, `only ${swings} weapon swings found`);
});

test('a swing never folds the hand back past your head, nor lays the arm up along your line of sight', () => {
  for (const h of [{ a: -2.1, r: 0.34 }, { a: 2.0, r: 0.34 }, { a: -1.85, r: 0.36 }, { a: -0.62, r: 0.43 }, [-0.2, -0.3], [0.5, -0.4]]) {
    const [x, y] = fpSwing(h);
    assert.ok(x >= 0.2, `hand ${JSON.stringify(h)} only ${x.toFixed(2)} out in front`);
    assert.ok(y >= -0.05, `hand ${JSON.stringify(h)} raised ${(-y).toFixed(2)} over the shoulder`);
  }
});

test('running with a weapon drawn, its hand stays in the stance instead of swinging back and forth', () => {
  for (const name of ['sword', 'sword2', 'heavyw', 'staff']) {
    const base = STANCES[name];
    const xs = [];
    for (let i = 0; i < 16; i++) {
      const P = restPose({ moving: true, drawn: true, stanceP: base, speed: 4.3, walk: (i / 16) * Math.PI * 2, time: i * 0.05 });
      xs.push(P.hF[0]);
      assert.ok(Number.isFinite(P.wF), `${name}: no blade angle on the run`);
    }
    const swing = Math.max(...xs) - Math.min(...xs);
    assert.ok(swing < 0.06, `${name}: the weapon hand swings ${swing.toFixed(2)} back and forth`);
  }
  // (at a sprint a sword trails low behind)
  const P = restPose({ moving: true, drawn: true, sprint: true, stanceP: STANCES.sword, speed: 6.6, walk: 1, time: 0 });
  assert.ok(P.hF[0] < 0 && P.wF > 2, `sprinting sword: hand ${P.hF}, blade ${P.wF}`);
});
