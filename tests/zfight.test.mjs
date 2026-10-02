// Z-fighting: two faces in one plane, facing the same way and overlapping,
// flicker against each other as you move (the depth buffer can't tell which
// is in front). Every kind of house in every style, standing alone and
// shoulder to shoulder in a terrace, and every ship, must have none that can
// be seen. (tools/zfight.mjs runs the same check over the whole world.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../tools/zfight-shim.js');
const THREE = await import('three');
const { buildBuilding } = await import('../src/render3d/buildings3d.js');
const { hullGeometry, interiorGeometry } = await import('../src/render3d/ships3d.js');
const { SHIPS } = await import('../src/data/ships.js');
const { TOWN_STYLES } = await import('../src/world/towngen.js');
const { triangles, fights, hidden } = await import('../tools/zfight-geo.js');

const STYLES = ['village', 'town', 'port', 'city', 'desert', 'snow', 'wano', 'chinese', 'sky', 'candy', 'fishman', 'marine', 'noble', 'spooky', 'future', 'mink', 'giant', 'ruins'];
const ROLES = ['house', 'shop', 'inn', 'hall', 'palace', 'marine_base'];

/** The faces of a model that fight where someone could see them: [{ area, at, cols }]. */
function seen(obj, buried = true) {
  const tris = triangles(obj, null, { buried });
  return fights(tris).filter((f) => f.sep < 0.0005 && !f.same && !hidden(tris, f));
}
const report = (list) => list.sort((a, b) => b.area - a.area).slice(0, 6).map((f) => `${(f.area * 1e4).toFixed(0)} cm² at [${f.at}] facing [${f.n}] ${f.cols.join(' vs ')}`).join('\n  ');

test('no house, alone or in a terrace, has faces flickering against each other', () => {
  const bad = [];
  let built = 0;
  for (const style of STYLES) {
    const S = TOWN_STYLES[style] || {};
    for (const role of ROLES) {
      for (const [i, attach] of [{}, { left: true }, { right: true }, { left: true, right: true }].entries()) {
        for (const enterable of [false, true]) {
          const big = role === 'palace' || role === 'hall' || role === 'marine_base';
          const b = {
            kind: 'building', style, role, roofType: style === 'ruins' ? 'ruin' : S.roof || 'gable', x: 1000, y: 1000, rot: 0,
            fw: big ? 10 : 4 + i, fd: big ? 8 : 5, hgt: big ? 4 : 3, wall: S.walls?.[0] || '#d8c29d', roof: S.roofs?.[0] || '#9c4a2a',
            name: role === 'house' ? undefined : 'Test', doorX: 0, v: i, attach, enterable,
          };
          const g = buildBuilding(b, null);
          if (!g) continue;
          built++;
          const f = seen(g);
          const area = f.reduce((s, x) => s + x.area, 0);
          // (a few tiny slivers where two roof pieces meet at a corner are allowed: never a band, a board or a wall)
          if (area > 0.03 || f.some((x) => x.area > 0.01)) bad.push(`${style} ${role} ${JSON.stringify(attach)}${enterable ? ' walk-in' : ''}: ${(area * 1e4).toFixed(0)} cm²\n  ${report(f)}`);
        }
      }
    }
  }
  assert.ok(built > 300, `only ${built} houses built`);
  assert.deepEqual(bad, []);
});

test('no ship has faces flickering against each other on her decks, sides or stern', () => {
  const bad = [];
  for (const [id, def] of Object.entries(SHIPS)) {
    const f = seen(new THREE.Mesh(hullGeometry(def)), false);
    const area = f.reduce((s, x) => s + x.area, 0);
    if (area > 0.05 || f.some((x) => x.area > 0.01)) bad.push(`${id}: ${(area * 1e4).toFixed(0)} cm²\n  ${report(f)}`);
    const ins = interiorGeometry(def);
    if (!ins) continue;
    const fi = seen(new THREE.Mesh(ins.main), false).filter((x) => x.n[1] > -0.9); // (a crate's underside on the floor: never seen)
    const ai = fi.reduce((s, x) => s + x.area, 0);
    if (ai > 0.05) bad.push(`${id} below decks: ${(ai * 1e4).toFixed(0)} cm²\n  ${report(fi)}`);
  }
  assert.deepEqual(bad, []);
});
