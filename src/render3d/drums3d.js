// The snow on the Drum Rockies (see world/drums.js): each drum's flat top is
// snow (the terrain's own), and here its cap — a cornice of snow built up
// round the rim and draped a few metres down the cliff, hanging in drips and
// tongues, the way the anime draws them: grey drums iced white on top.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { vcMat } from './props/mats.js';
import { drumR } from '../world/drums.js';

const views = new Map(); // drum → mesh
let group = null;

const hash = (i, s) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

/**
 * The cap of drum `d`, about its middle: a ring of quads all the way round —
 * from just inside the rim (buried in the snow on top) up over the cornice,
 * bulging out a touch, and down the face to a ragged edge 1.5–6 m below.
 */
function capGeometry(d) {
  const n = Math.max(48, Math.round((Math.PI * 2 * d.R) / 1.1));
  // rows: [radius offset from the face, height over the top]
  const rows = (depth) => [[-1.3, -0.25], [-0.6, 0.22], [0.15, 0.42], [0.42, 0.1], [0.4, -0.7], [0.36, -depth * 0.55], [0.3, -depth]];
  const R = rows(0).length;
  const pos = new Float32Array(n * R * 3), col = new Float32Array(n * R * 3);
  const white = new THREE.Color('#f7fbff'), blue = new THREE.Color('#cfdcec'), shade = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = drumR(d, a), c = Math.cos(a), s = Math.sin(a);
    // how far the snow hangs down here: tongues and drips, now and then a long one
    const tongue = 0.5 + 0.5 * Math.sin(a * 7 + d.seed * 3) * Math.sin(a * 3.1 - d.seed);
    const drip = hash(i, d.seed) > 0.82 ? 1.6 + hash(i + 7, d.seed) * 2.4 : 0;
    const depth = 1.5 + tongue * 2.6 + drip;
    rows(depth).forEach(([dr, dy], j) => {
      const k = (i * R + j) * 3;
      pos[k] = c * (r + dr); pos[k + 1] = d.H + dy; pos[k + 2] = s * (r + dr);
      // (whiter on top, a cold blue in the shadow of the drape)
      shade.copy(white).lerp(blue, Math.min(1, Math.max(0, -dy / Math.max(1, depth)) * 0.7 + (j >= 4 ? 0.15 : 0)));
      col[k] = shade.r; col[k + 1] = shade.g; col[k + 2] = shade.b;
    });
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < R - 1; j++) {
      const a = i * R + j, b = i2 * R + j, c2 = i * R + j + 1, e = i2 * R + j + 1;
      idx.push(a, b, c2, b, e, c2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // (the prop material's own: no tint, no glow)
  g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n * R), 1));
  g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n * R * 4), 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

registerFrameHook((env, ctx) => {
  const game = ctx.game, v = game?.view3d, w = ctx.world;
  if (!group) { group = new THREE.Group(); group.name = 'drum-caps'; ctx.scene.add(group); }
  // (a plate's edge is leaves, not snow: plates3d.js)
  const list = ((w && w === game?.world && w.zone === 0 && w.drums) || []).filter((d) => !d.plate);
  for (const [d, m] of views) {
    if (list.includes(d)) continue;
    m.removeFromParent(); m.geometry.dispose();
    views.delete(d);
  }
  if (!v || !list.length) return;
  const px = game.player?.x ?? v.ox, py = game.player?.y ?? v.oy;
  for (const d of list) {
    let m = views.get(d);
    const near = w.distance(px, py, d.x, d.y) < 700;
    if (!near) { if (m) m.visible = false; continue; }
    if (!m) {
      m = new THREE.Mesh(capGeometry(d), vcMat());
      m.castShadow = true; m.receiveShadow = true;
      m.name = 'drum-cap';
      views.set(d, m);
      group.add(m);
    }
    m.visible = true;
    m.position.set(w.dx(v.ox, d.x), 0, d.y - v.oy);
  }
}, 'drum-caps');
