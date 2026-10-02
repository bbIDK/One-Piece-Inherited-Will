// Gangways in 3D (see game/gangway.js): boards on a pair of stringers, from
// the foot of the steps on your deck up over your rail, across the water to
// hers and down the steps onto her deck — a step nailed across every 30 cm
// on the steps, a cleat every half metre across the water — with a rope
// along each side between posts at the rails. Each of its three runs is
// stretched between its points as the two ships ride, so it's where its
// planks are walked.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { Mesher, box, cyl } from './props/kit.js';
import { vcMat } from './props/mats.js';
import { PLANK_W } from '../game/gangway.js';

const WOOD = '#b08457', DARK = '#6d4c33', ROPE = '#cdb98e';

/** One run, built a metre long along +x (its top at y 0) and stretched to its length: `n` cross-pieces along it, and its ropes if it's the run across the water. */
function runGeometry(n, ropes) {
  const k = new Mesher();
  k.add(box(1, 0.06, PLANK_W), { at: [0.5, -0.06, 0], color: WOOD, outline: 0.01 });
  for (const z of [-1, 1]) k.add(box(1, 0.13, 0.07), { at: [0.5, -0.19, z * (PLANK_W / 2 - 0.05)], color: DARK });
  for (let i = 0; i < n; i++) k.add(box(0.04, 0.035, PLANK_W - 0.08), { at: [(i + 0.5) / n, 0, 0], color: DARK });
  if (ropes) for (const z of [-1, 1]) k.add(box(1, 0.035, 0.035), { at: [0.5, 0.86, z * (PLANK_W / 2 - 0.03)], color: ROPE });
  return k.build(false);
}

let postGeo = null;
const views = new Map(); // plank → { root, runs: [Mesh, Mesh, Mesh], posts: [Mesh × 4] }
let group = null;

function build(P) {
  const L = P.pts(), root = new THREE.Group();
  root.name = 'gangway';
  const runs = [0, 1, 2].map((i) => {
    const len = L.s[i + 1] - L.s[i];
    const m = new THREE.Mesh(runGeometry(i === 1 ? Math.max(2, Math.round(len / 0.5)) : Math.max(3, Math.round(len / 0.3)), i === 1), vcMat());
    m.castShadow = true; m.receiveShadow = true;
    m.rotation.order = 'YXZ';
    root.add(m);
    return m;
  });
  postGeo ||= (() => { const k = new Mesher(); k.add(cyl(0.035, 0.04, 0.96, 6), { color: DARK }); return k.build(true); })();
  const posts = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(postGeo, vcMat()); m.castShadow = true; root.add(m); return m; });
  return { root, runs, posts };
}

registerFrameHook((env, ctx) => {
  const game = ctx.game, v = game?.view3d, w = ctx.world;
  if (!group) { group = new THREE.Group(); group.name = 'gangways'; ctx.scene.add(group); }
  const planks = game?.planks || [];
  for (const [P, view] of views) {
    if (planks.includes(P) && w === game.world) continue;
    view.root.removeFromParent();
    for (const m of view.runs) m.geometry.dispose();
    views.delete(P);
  }
  if (!v || !w) return;
  for (const P of planks) {
    let view = views.get(P);
    if (!view) { view = build(P); views.set(P, view); group.add(view.root); }
    const L = P.pts(), d = L.dir, yaw = Math.atan2(d.y, d.x);
    const at = (s) => [w.dx(v.ox, L.x + d.x * s), L.y + d.y * s - v.oy];
    for (let i = 0; i < 3; i++) {
      const [x, z] = at(L.s[i]), run = L.s[i + 1] - L.s[i], rise = L.h[i + 1] - L.h[i];
      const m = view.runs[i];
      m.position.set(x, L.h[i], z);
      m.rotation.set(0, -yaw, Math.atan2(rise, run));
      m.scale.set(Math.max(0.01, Math.hypot(run, rise)), 1, 1);
    }
    // (the posts the ropes run between, at each rail)
    for (let j = 0; j < 4; j++) {
      const i = j < 2 ? 1 : 2, side = j % 2 ? 1 : -1, off = side * (PLANK_W / 2 - 0.03);
      const [x, z] = at(L.s[i]);
      view.posts[j].position.set(x - d.y * off, L.h[i] - 0.08, z + d.x * off);
    }
  }
});
