// The wider Grand Line: its islands sit inside the band (and clear of each
// other), every road's stops exist for the road's path and end at the right
// place, and old saves' rows are re-laid onto the new chart and back.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
const { CHAPTERS } = await import('../src/content/main/define.js');
await import('../src/content/mainStory.js');
const { GL_ROADS } = await import('../src/content/main/grandLine.js');
const { ALL_ISLANDS, ISLAND_BY_ID } = await import('../src/data/islands/index.js');
const { GL_TOP, GL_BOTTOM, regionAt, REGION, isGrandLine } = await import('../src/world/constants.js');
const { relayRow, unrelayRow } = await import('../src/game/lineage.js');

test('twice the Grand Line: its islands inside the band, and twice as many', () => {
  const gl = ALL_ISLANDS.filter((i) => i.sea === 'paradise' || i.sea === 'new_world');
  assert.ok(gl.length >= 100, `${gl.length} islands`);
  for (const i of gl) {
    if (['amazon_lily', 'rusukaina', 'impel_down'].includes(i.id)) { assert.ok(!isGrandLine(regionAt(i.x, i.y)), `${i.id} in the Calm Belt`); continue; }
    assert.ok(i.y - i.h / 2 > GL_TOP && i.y + i.h / 2 < GL_BOTTOM, `${i.id} inside the Grand Line`);
    assert.equal(regionAt(i.x, i.y), i.sea === 'paradise' ? REGION.PARADISE : REGION.NEW_WORLD, i.id);
  }
});

test('every road: stops told for its path, on real islands, ending where its path ends', () => {
  const END = { pirate: 'gl_sabaody', marine: 'gl_marineford', hunter: 'gl_enies' };
  for (const [path, roads] of Object.entries(GL_ROADS)) {
    for (const r of roads) {
      for (const id of r.chain) {
        const ch = CHAPTERS.get(id);
        assert.ok(ch, `${r.id}: ${id} exists`);
        assert.ok(ch.v[path], `${r.id}: ${id} told for ${path}s`);
        assert.ok(ISLAND_BY_ID[ch.island], `${id}: island ${ch.island}`);
      }
      assert.equal(r.chain.at(-1), END[path], `${path} road ${r.id} ends at ${END[path]}`);
      if (path !== 'hunter') assert.ok(r.chain.includes('gl_sabaody'), `${r.id} goes by Sabaody`);
    }
  }
  assert.ok(GL_ROADS.pirate.length >= 8);
});

test('old saves: rows re-laid onto the wider Grand Line and back', () => {
  for (const y of [40, 300, 723, 750, 824, 900, 1024, 1150, 1224, 1300, 1400, 1800, 2010]) {
    assert.ok(Math.abs(unrelayRow(relayRow(y)) - y) < 1e-6, `row ${y}`);
  }
  assert.equal(relayRow(1024), 1024, 'the equator stays put');
  assert.equal(relayRow(1124), 1224, 'the Grand Line twice as wide');
  assert.ok(relayRow(700) < 524, 'the North Blue drawn in toward the pole');
});
