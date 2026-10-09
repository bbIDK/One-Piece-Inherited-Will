// The Drum Ropeway in 3D (see game/ropeway.js): its two stations — a timber
// house at the foot of Drum Rock, and at the summit a platform run out over
// the edge of the cliff on struts, the cabin's bay at its end — the cable
// slung between their bullwheels, and the cabin hanging from it on its arm,
// riding the cable up and down the face (where game/ropeway.js has it).
import * as THREE from 'three';
import { registerFrameHook, registerPropBuilder } from './registry.js';
import { Mesher, box, cyl, torus } from './props/kit.js';
import { vcMat, meshOf, bindCtx } from './props/mats.js';
import { model } from './props/street.js';
import { HANG, FLOOR, rigRopeway, cableAt, cableXY } from '../game/ropeway.js';

const TIMBER = '#6d4c33', DARK = '#4e3524', PLANK = '#8d6748', STONE = '#8e9aa3', IRON = '#37474f', SNOW = '#f4f8fb', RED = '#a23b2c', GLASS = '#1e3240';

/**
 * A station, built along +x from where you step off (x = 0, on firm ground)
 * to the cabin's bay (x = reach) and a little past it: a platform at the
 * cabin's floor, a roof over the bay with the bullwheel the cable turns on
 * under it, a winch house behind. At the top it hangs out over the cliff:
 * struts brace it back into the rock below (the edge is `edge` along).
 */
function stationGeo(top, reach, edge) {
  return model(`ropeway:${top ? 1 : 0}:${reach.toFixed(1)}:${edge.toFixed(1)}`, (k) => {
    const L = reach + 2.2, W = 4.2;
    // the platform: planks on joists (on the summit, its stone footing on the plateau, the rest out over the drop)
    k.add(box(L, 0.22, W), { at: [L / 2, FLOOR - 0.22, 0], color: PLANK, outline: 0.03 });
    for (let x = 0.4; x < L; x += 0.9) k.add(box(0.06, 0.03, W - 0.1), { at: [x, FLOOR, 0], color: DARK });
    for (const z of [-1, 1]) k.add(box(L, 0.3, 0.18), { at: [L / 2, FLOOR - 0.5, z * (W / 2 - 0.1)], color: TIMBER });
    if (top) {
      k.add(box(Math.max(1.2, edge - 0.3), 1.4, W + 0.6), { at: [Math.max(0.6, (edge - 0.3) / 2), -1.2, 0], color: STONE, outline: 0.04 });
      // struts from the platform's end back into the cliff, below the edge
      for (const z of [-1, 1]) {
        const x0 = L - 0.3, y0 = FLOOR - 0.5, x1 = edge + 0.15, y1 = -6.5;
        const len = Math.hypot(x0 - x1, y0 - y1), a = Math.atan2(y0 - y1, x0 - x1);
        k.add(box(len, 0.24, 0.24), { at: [(x0 + x1) / 2, (y0 + y1) / 2 - 0.12, z * (W / 2 - 0.2)], rot: [0, 0, a], color: TIMBER, outline: 0.03 });
        k.add(box(0.5, 0.6, 0.5), { at: [x1, y1 - 0.3, z * (W / 2 - 0.2)], color: IRON });
      }
    } else {
      // (at the foot: posts down to the snow)
      for (let x = 0.3; x < L; x += 2.2) for (const z of [-1, 1]) k.add(box(0.22, 1.2, 0.22), { at: [x, FLOOR - 1.4, z * (W / 2 - 0.15)], color: TIMBER });
    }
    // a rail along each side of the platform, open at the bay
    for (const z of [-1, 1]) {
      k.add(box(reach - 1.2, 0.08, 0.08), { at: [(reach - 1.2) / 2, FLOOR + 1.0, z * (W / 2 - 0.05)], color: TIMBER });
      for (let x = 0.1; x < reach - 1.1; x += 1.2) k.add(box(0.1, 1.0, 0.1), { at: [x, FLOOR, z * (W / 2 - 0.05)], color: TIMBER });
    }
    // the roof over the bay: four posts, a gable, snow on it
    const bx = reach, H = HANG + 1.5;
    for (const sx of [-1.6, 1.6]) for (const z of [-1, 1]) k.add(box(0.26, H, 0.26), { at: [bx + sx, FLOOR, z * (W / 2 - 0.15)], color: TIMBER, outline: 0.03 });
    for (const z of [-1, 1]) k.add(box(3.6, 0.3, 0.3), { at: [bx, FLOOR + H, z * (W / 2 - 0.15)], color: DARK });
    for (const s of [-1, 1]) {
      k.add(box(4.4, 0.16, W / 2 + 0.5), { at: [bx, FLOOR + H + 0.55, s * (W / 4 + 0.1)], rot: [s * 0.42, 0, 0], color: RED, outline: 0.03 });
      k.add(box(4.5, 0.12, W / 2 + 0.4), { at: [bx, FLOOR + H + 0.68, s * (W / 4 + 0.05)], rot: [s * 0.42, 0, 0], color: SNOW });
    }
    // the bullwheel the cable turns on (under the roof), on its iron frame
    k.add(torus(1.25, 0.09, 6, 20), { at: [bx, FLOOR + HANG, 0], rot: [Math.PI / 2, 0, 0], color: IRON });
    k.add(cyl(0.18, 0.18, 0.5, 8), { at: [bx, FLOOR + HANG - 0.25, 0], color: IRON });
    k.add(box(0.2, H - HANG + 0.2, 0.2), { at: [bx, FLOOR + HANG, 0], color: IRON });
    // two steps up onto the platform at its back, where you come to it
    k.add(box(0.5, 0.15, 2.2), { at: [-0.25, FLOOR - 0.3, 0], color: PLANK });
    k.add(box(0.5, 0.3, 2.2), { at: [0.2, FLOOR - 0.3, 0], color: PLANK });
    // the winch house beside the platform (on firm ground: at the top, back
    // from the edge): timber walls, its door onto the platform, a stove pipe,
    // a lantern by the door
    const hx = top ? -0.9 : reach * 0.45, hz = -(W / 2 + 1.9);
    k.add(box(3.2, 2.6, 3.4), { at: [hx, -0.2, hz], color: TIMBER, outline: 0.04 });
    for (const s of [-1, 1]) {
      k.add(box(2.2, 0.14, 3.8), { at: [hx + s * 0.95, 2.55, hz], rot: [0, 0, -s * 0.5], color: RED, outline: 0.03 });
      k.add(box(2.1, 0.1, 3.9), { at: [hx + s * 0.93, 2.66, hz], rot: [0, 0, -s * 0.5], color: SNOW });
    }
    k.add(box(1.1, 1.9, 0.05), { at: [hx, -0.2, hz + 1.72], color: DARK });
    k.add(box(0.8, 0.6, 0.06), { at: [hx, 1.0, hz - 1.72], color: GLASS, glow: '#ffcc80' });
    k.add(cyl(0.12, 0.12, 1.2, 6), { at: [hx - 0.9, 2.5, hz - 0.8], color: IRON });
    k.add(box(0.2, 0.3, 0.2), { at: [hx + 0.75, 1.7, hz + 1.8], color: '#ffe082', glow: '#ffcc80' });
  });
}

registerPropBuilder('ropeway', (o, ctx) => {
  bindCtx(ctx);
  const root = new THREE.Group();
  root.name = 'ropeway-station';
  root.add(meshOf(stationGeo(o.end === 'b', o.reach || 7, o.edge || 4)));
  // (built along +x: turned to face the cabin's bay)
  root.rotation.y = -(o.face || 0);
  return root;
});

// ------------------------------------------------------------------ the cable and its cabin
/**
 * The cabin (its floor at y 0, where its rider's feet are): a red lower half,
 * open above it between timber posts, a snowy roof, and its arm up to the
 * carriage that runs on the cable.
 */
function cabinGeo() {
  const k = new Mesher();
  const L = 2.5, W = 1.9;
  // the floor you stand on, and the red lower half as walls round it (not a
  // solid block you'd stand in): the long sides whole, each end with a
  // doorway in its middle — you step in at the end by the platform you're on
  const T = 0.08, D = 0.8;
  k.add(box(L, 0.18, W), { at: [0, -0.18, 0], color: IRON, outline: 0.03 });
  for (const s of [-1, 1]) {
    k.add(box(L, 0.95, T), { at: [0, 0, s * (W / 2 - T / 2)], color: RED, outline: 0.03 });
    for (const t of [-1, 1]) k.add(box(T, 0.95, (W - D) / 2), { at: [s * (L / 2 - T / 2), 0, t * (D / 2 + (W - D) / 4)], color: RED, outline: 0.03 });
  }
  // open above the waist all round (you look out over the snow as you ride,
  // and you're seen standing in it): corner posts, a post mid-side, a rail,
  // and a post either side of each doorway
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      k.add(box(0.12, 0.9, 0.12), { at: [s * (L / 2 - 0.06), 0.92, t * (W / 2 - 0.06)], color: TIMBER });
      k.add(box(0.09, 1.82, 0.09), { at: [s * (L / 2 - 0.045), 0, t * (D / 2 + 0.045)], color: TIMBER });
      k.add(box(0.07, 0.07, (W - D) / 2 - 0.09), { at: [s * (L / 2 - 0.035), 0.95, t * (D / 2 + 0.09 + ((W - D) / 2 - 0.09) / 2)], color: DARK });
    }
    k.add(box(0.07, 0.85, 0.07), { at: [0, 0.95, s * (W / 2 - 0.035)], color: TIMBER });
    k.add(box(L, 0.07, 0.07), { at: [0, 0.95, s * (W / 2 - 0.035)], color: DARK });
  }
  k.add(box(L, 0.2, W), { at: [0, 1.8, 0], color: TIMBER, outline: 0.03 });
  // the roof, and the snow on it
  k.add(box(L + 0.3, 0.16, W + 0.3), { at: [0, 2.0, 0], color: RED, outline: 0.03 });
  k.add(box(L + 0.1, 0.1, W + 0.1), { at: [0, 2.16, 0], color: SNOW });
  // a lamp over the front window
  k.add(box(0.14, 0.18, 0.14), { at: [L / 2 + 0.06, 1.8, 0], color: '#ffe082', glow: '#ffcc80' });
  // the arm: a hoop over the roof, up to the carriage
  const top = HANG - 0.25;
  for (const s of [-1, 1]) k.add(box(0.1, top - 2.16, 0.1), { at: [s * 0.55, 2.16, 0], color: IRON });
  k.add(box(1.2, 0.12, 0.12), { at: [0, top - 0.12, 0], color: IRON });
  k.add(box(0.12, 0.3, 0.12), { at: [0, top, 0], color: IRON });
  // the carriage on the cable: a frame with two wheels
  k.add(box(1.4, 0.26, 0.3), { at: [0, top + 0.1, 0], color: IRON, outline: 0.02 });
  for (const s of [-1, 1]) k.add(cyl(0.16, 0.16, 0.12, 10), { at: [s * 0.5, HANG + 0.02, -0.06], rot: [Math.PI / 2, 0, 0], color: '#546e7a' });
  return k.build();
}

const views = new Map(); // ropeway → { root, cable, cabin, key }
let group = null, cabinG = null;
const ROPE_MAT = new THREE.MeshLambertMaterial({ color: '#2b2b2b' });

/** The cable as a tube, slung from bay to bay (with its sag), in view space. */
function cableMesh(world, v, rw) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const s = i / 40, p = cableXY(world, rw, s);
    pts.push(new THREE.Vector3(world.dx(rw.a.x, p.x), cableAt(rw, s), p.y - rw.a.y));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.08, 5, false);
  const m = new THREE.Mesh(g, ROPE_MAT);
  m.castShadow = false;
  return m;
}

registerFrameHook((env, ctx) => {
  const game = ctx.game, v = game?.view3d, w = ctx.world;
  if (!group) { group = new THREE.Group(); group.name = 'ropeways'; ctx.scene.add(group); }
  const list = (w && w === game?.world && w.ropeways) || [];
  for (const [rw, view] of views) {
    if (list.includes(rw)) continue;
    view.root.removeFromParent();
    view.cable.geometry.dispose();
    views.delete(rw);
  }
  if (!v || !list.length) return;
  for (const rw of list) {
    // (only near enough to see)
    const px = game.player?.x ?? v.ox, py = game.player?.y ?? v.oy;
    const near = w.distance(px, py, rw.a.x, rw.a.y) < 420 || w.distance(px, py, rw.b.x, rw.b.y) < 420;
    let view = views.get(rw);
    if (!near) { if (view) view.root.visible = false; continue; }
    if (!rigRopeway(game, rw)) continue;
    if (!view) {
      cabinG ||= cabinGeo();
      const root = new THREE.Group();
      root.name = 'ropeway';
      const cable = cableMesh(w, v, rw);
      const cabin = new THREE.Mesh(cabinG, vcMat());
      cabin.castShadow = true; cabin.receiveShadow = true;
      root.add(cable, cabin);
      view = { root, cable, cabin };
      views.set(rw, view);
      group.add(root);
    }
    view.root.visible = true;
    // (the cable's laid out from the foot station: placed there in view space)
    view.cable.position.set(w.dx(v.ox, rw.a.x), 0, rw.a.y - v.oy);
    // the cabin where it is on the cable (waiting at the foot till someone calls it)
    const s = rw.s ?? rw.at ?? 0, p = cableXY(w, rw, s);
    const sway = Math.sin((game.time || 0) * 1.3) * 0.015 * Math.sin(Math.PI * s);
    view.cabin.position.set(w.dx(v.ox, p.x), cableAt(rw, s) - HANG, p.y - v.oy);
    view.cabin.rotation.set(0, -Math.atan2(rw.b.y - rw.a.y, w.dx(rw.a.x, rw.b.x)), sway, 'YXZ');
  }
}, 'ropeways');
