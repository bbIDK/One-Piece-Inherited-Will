// Bundled for Node by tools/zfight.mjs. Builds the 3D model of every world
// object (houses, landmarks, street props) as the game does and looks for
// z-fighting: two faces in (or within a few millimetres of) the same plane,
// facing the same way and overlapping, so the depth buffer can't tell which
// is in front and the picture flickers between them as the camera moves.
import './zfight-shim.js';
import * as THREE from 'three';
import { ALL_ISLANDS } from '../src/data/islands/index.js';
import { generateWorld } from '../src/world/worldgen.js';
import { PROP_BUILDERS, registerPropBuilder } from '../src/render3d/registry.js';
import { buildBuilding } from '../src/render3d/buildings3d.js';
import '../src/render3d/props/landmarks.js';
import '../src/render3d/props/street.js';
import { HeightField } from '../src/render3d/height.js';
import { triangles, fights, hidden } from './zfight-geo.js';
import { hullGeometry, interiorGeometry } from '../src/render3d/ships3d.js';
import { SHIPS } from '../src/data/ships.js';

registerPropBuilder('building', (o, ctx) => buildBuilding(o, ctx));
export { triangles, fights, hidden };

const axisOf = (n) => (Math.abs(n[1]) > 0.9 ? (n[1] > 0 ? 'up' : 'down') : Math.abs(n[0]) > 0.9 ? 'x' : Math.abs(n[2]) > 0.9 ? (n[2] > 0 ? 'front' : 'back') : 'slope');
/** Fights grouped by their likely cause: what, which way the faces look, their colours. */
function group(map, key, f, ex) {
  let g = map.get(key);
  if (!g) map.set(key, (g = { key, area: 0, n: 0, objects: new Set(), ex: null }));
  g.area += f.area; g.n++; g.objects.add(ex.id);
  if (!g.ex || f.area > g.ex.area) g.ex = { ...ex, area: f.area, sep: f.sep, at: f.at, n: f.n, triA: f.triA, triB: f.triB };
}
const tidy = (map) => [...map.values()].map((g) => ({ ...g, objects: g.objects.size })).sort((a, b) => b.area - a.area);

export async function run({ island = null, kinds = null, limit = Infinity, cross = true, per = Infinity } = {}) {
  const world = await generateWorld({ seed: 'blue-planet', islands: ALL_ISLANDS });
  const hf = new HeightField(world);
  const ctx = { THREE, world, ground: (x, y) => hf.ground(x, y), terrain: (x, y) => hf.terrain(x, y), game: null, yaw: 0, mode: 'first', camera: null, scene: null };
  const objs = [...world.objects.byId.values()].filter((o) => PROP_BUILDERS.has(o.kind) && !o.hidden && (!kinds || kinds.includes(o.kind)) && (!island || o.islandId === island || o.island === island));
  const res = { objects: 0, failed: {}, byKind: {}, groups: new Map(), crossGroups: new Map() };
  const placed = [];
  const seen = new Map();
  for (const o of objs.slice(0, limit)) {
    // (--per: only so many of each kind, style and role: the causes repeat)
    const sk = `${o.kind}|${o.style || ''}|${o.role || o.sub || ''}`;
    if ((seen.get(sk) || 0) >= per) continue;
    seen.set(sk, (seen.get(sk) || 0) + 1);
    let v = null;
    try { v = PROP_BUILDERS.get(o.kind)(o, ctx); } catch (e) { res.failed[o.kind] = (res.failed[o.kind] || 0) + 1; if (!res.failed['?' + o.kind]) res.failed['?' + o.kind] = String(e && e.stack || e).split('\n').slice(0, 3).join(' | '); continue; }
    if (!v) continue;
    res.objects++;
    const tris = triangles(v);
    const f = fights(tris, { verbose: true }).filter((x) => !x.same && !hidden(tris, x));
    const K = res.byKind[o.kind] || (res.byKind[o.kind] = { n: 0, withFights: 0, exact: 0, near: 0 });
    K.n++;
    if (f.length) K.withFights++;
    for (const x of f) {
      if (x.sep < 0.0005) K.exact += x.area; else K.near += x.area;
      const exact = x.sep < 0.0005 ? 'exact' : 'near';
      group(res.groups, `${o.kind}|${o.style || ''}|${axisOf(x.n)}|${[...x.cols].sort().join('/')}|${exact}`, x, { id: o.id, kind: o.kind, role: o.role || o.sub || '', style: o.style || '', x: +o.x.toFixed(1), y: +o.y.toFixed(1) });
    }
    if (cross && o.kind === 'building') {
      v.position.set(o.x, hf.ground(o.x, o.y), o.y);
      v.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(v);
      placed.push({ o, v, box });
    }
  }
  // one house against the next (a terrace shoulder to shoulder): faces of two
  // buildings in the same plane
  if (cross) {
    const I = new THREE.Matrix4();
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const A = placed[i], B = placed[j];
        if (!A.box.clone().expandByScalar(0.02).intersectsBox(B.box)) continue;
        const tris = [...triangles(A.v, I).map((t) => ((t.who = 0), t)), ...triangles(B.v, I).map((t) => ((t.who = 1), t))];
        for (const x of fights(tris, { owner: (t) => t.who, verbose: true }).filter((x) => !x.same && !hidden(tris, x))) group(res.crossGroups, `${A.o.style || ''}|${axisOf(x.n)}|${[...x.cols].sort().join('/')}|${x.sep < 0.0005 ? 'exact' : 'near'}`, x, { id: A.o.id, other: B.o.id, role: A.o.role, otherRole: B.o.role, style: A.o.style, x: +A.o.x.toFixed(1), y: +A.o.y.toFixed(1) });
      }
    }
  }
  res.groups = tidy(res.groups);
  res.crossGroups = tidy(res.crossGroups);
  return res;
}

/** The meshes of one object, and its fights with where each face came from (for a closer look). */
export async function inspect(id) {
  const world = await generateWorld({ seed: 'blue-planet', islands: ALL_ISLANDS });
  const hf = new HeightField(world);
  const ctx = { THREE, world, ground: (x, y) => hf.ground(x, y), terrain: (x, y) => hf.terrain(x, y), game: null, yaw: 0, mode: 'first' };
  const o = world.objects.byId.get(id);
  const v = PROP_BUILDERS.get(o.kind)(o, ctx);
  const meshes = [];
  v.traverse((m) => { if (m.isMesh) meshes.push({ name: m.name, type: m.material.type, side: m.material.side, transparent: m.material.transparent, verts: m.geometry.attributes.position.count, attrs: Object.keys(m.geometry.attributes).join(','), visible: m.visible }); });
  return { o: { kind: o.kind, role: o.role, style: o.style, fw: o.fw, fd: o.fd, enterable: !!o.enterable, roofType: o.roofType }, meshes, fights: (() => { const tris = triangles(v); return fights(tris, { verbose: true }).filter((x) => !x.same && !hidden(tris, x)).sort((p, q) => q.area - p.area).slice(0, 12).map(({ c3, nv, ...x }) => x); })() };
}

/** Every ship class: its hull (decks, rails, cabins, guns) and, for the big ones, below decks. */
export function ships() {
  const out = [];
  for (const [id, def] of Object.entries(SHIPS)) {
    const parts = [['hull', hullGeometry(def)]];
    const ins = interiorGeometry(def);
    if (ins) parts.push(['inside', ins.main], ['overhead', ins.overhead]);
    for (const [part, g] of parts) {
      if (!g) continue;
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
      const tris = triangles(m, null, { buried: false });
      for (const f of fights(tris, { verbose: true })) if (!f.same && !hidden(tris, f)) out.push({ ship: id, part, ...f });
    }
  }
  return out.sort((p, q) => q.area - p.area);
}
