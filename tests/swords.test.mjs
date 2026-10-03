// Every sword its own model (render3d/chars/swords.js): each sword item has a
// look, builds, runs as long as its blade, and has its edge on the side a
// downward cut leads with; the equipped swords (and an NPC's own) reach the
// models in slot order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/data/items.js';
import { SWORD_LOOKS, swordGeo, swordLook } from '../src/render3d/chars/swords.js';
import { weaponOf } from '../src/render3d/chars/pose.js';
import { weaponFromChar } from '../src/game/lineage.js';
import { npcWeapon } from '../src/game/npcs.js';
import { lin } from '../src/render3d/chars/geom.js';

// (the content packs' own swords, on top of the base items)
const SWORDS = [...Object.keys(ITEMS).filter((id) => ITEMS[id].kind === 'sword'), 'wano_katana', 'nb_shibireru', 'p2_funkfreed'];

test('every sword has its own look, and builds', () => {
  for (const id of SWORDS) {
    assert.ok(SWORD_LOOKS[id], `${id} has a look`);
    const g = swordGeo(id);
    g.computeBoundingBox();
    const bb = g.boundingBox, L = swordLook(id);
    // (from the pommel to the point: the hilt behind the grip, the blade before it)
    assert.ok(bb.max.x > L.len && bb.max.x < L.len + 0.32, `${id}: the point ${bb.max.x.toFixed(2)} m out for a ${L.len} m blade`);
    assert.ok(bb.min.x < -0.08 && bb.min.x > -0.4, `${id}: the pommel ${bb.min.x.toFixed(2)} m behind the grip`);
    assert.ok(g.attributes.position.count < 3000, `${id}: ${g.attributes.position.count} vertices`);
  }
});

test('a katana\'s edge is toward -Y (a cut from overhead leads with it), its back toward +Y', () => {
  for (const id of ['fine_katana', 'wado_ichimonji', 'sandai_kitetsu', 'cutlass']) {
    const L = swordLook(id), g = swordGeo(id), P = g.attributes.position, C = g.attributes.color;
    const edge = lin(L.edge), back = lin(L.back);
    let ye = 0, ne = 0, yb = 0, nb = 0;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i);
      if (x < 0.35 || x > 0.5) continue;
      const near = (c) => Math.abs(C.getX(i) - c.r) + Math.abs(C.getY(i) - c.g) + Math.abs(C.getZ(i) - c.b) < 1e-3;
      if (near(edge)) { ye += P.getY(i); ne++; } else if (near(back)) { yb += P.getY(i); nb++; }
    }
    assert.ok(ne && nb, `${id}: edge and back vertices mid-blade`);
    assert.ok(ye / ne < yb / nb - 0.015, `${id}: the edge (${(ye / ne).toFixed(3)}) below the back (${(yb / nb).toFixed(3)})`);
  }
});

test('the equipped swords reach the models in the order they are worn (not the pistol between them)', () => {
  const w = weaponFromChar({ equipped: { weapons: ['wado_ichimonji', 'flintlock', 'sandai_kitetsu'] } });
  const o = weaponOf({ weapon: w });
  assert.equal(o.kind, 'sword');
  assert.deepEqual(o.ids, ['wado_ichimonji', 'sandai_kitetsu']);
  assert.equal(o.back, false);
  assert.equal(weaponOf({ weapon: weaponFromChar({ equipped: { weapons: ['yoru'] } }) }).back, true, 'Yoru is worn on the back');
});

test('NPC swordsmen carry their own blades, or their kind\'s', () => {
  assert.deepEqual(npcWeapon({ id: 'mihawk', weapon: 'sword', style: 'ittoryu', blades: ['yoru'] }).ids, ['yoru']);
  assert.deepEqual(npcWeapon({ id: 'm1', weapon: 'sword', style: 'ittoryu', faction: 'marine', level: 10 }).ids, ['marine_saber']);
  assert.deepEqual(npcWeapon({ id: 's1', weapon: 'sword', style: 'ittoryu', island: 'wano', level: 60 }).ids, ['wano_katana']);
  const two = npcWeapon({ id: 'p1', weapon: 'sword', style: 'nitoryu', faction: 'pirate', level: 8 }).ids;
  assert.equal(two.length, 2);
  for (const id of two) assert.ok(['cutlass', 'rusty_katana'].includes(id), id);
  assert.equal(npcWeapon({ id: 'g1', weapon: 'gun', style: 'sniper' }).ids, undefined);
});
