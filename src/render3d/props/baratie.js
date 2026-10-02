// The Baratie, the floating restaurant out past the Gecko Islands, as in the
// anime: a ship shaped like a great fish — its head the bow, round-eyed and
// mouth agape; a forked fin the stern — her hull sea green under a white
// gunwale, round portholes down her sides; two masts with sails striped
// yellow and white, a red flag with her B at each masthead; and on the
// restaurant (a building of its own you walk into: buildings3d.js, style
// 'baratie') its two signs. She's drawn round the island's deck, which
// stands a pier's height over the sea (islandgen.js shipDeck): her sides
// follow its edge, traced from the deck itself.
import * as THREE from 'three';
import { Mesher, box, cyl, torus, C } from './kit.js';
import { meshOf, bindCtx } from './mats.js';
import { registerPropBuilder } from '../registry.js';
import { canvasTexture } from '../materials.js';
import { DOCK_Y } from '../height.js';

const reg = (kind, fn) => registerPropBuilder(kind, (o, ctx) => { bindCtx(ctx); return fn(o, ctx); });

// her measures (m, along her from the middle: + toward the bow): the masts
// (their places are solid: world/objects.js), their height over the deck,
// and the restaurant the signs go on (its data: data/islands/eastBlue.js)
const MASTS = [18.5, -18.5], MAST_H = 26;
const HOUSE = { fw: 24, fd: 10, g: 1.35, front: 5 };
const GREEN = '#3d8c6c', GREEN_D = '#2b6b51', WHITE = '#fbf8ef', BELOW = '#23463b';
const YELLOW = '#ffcf33', SAIL_W = '#fffaf0';

/**
 * How far her deck reaches from her middle, all round (N directions from +x,
 * turning toward +z): traced across the deck's own tiles, its tile-steps
 * smoothed away — or, with no world to trace, as the data shapes it.
 */
function deckOutline(o, w, N = 144) {
  const R = new Float32Array(N);
  const deck = (x, y) => !!w?.dockAt?.(w.wx ? w.wx(x) : x, y)?.deck;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    let r = 0;
    while (r < 80 && deck(o.x + ca * (r + 0.25), o.y + sa * (r + 0.25))) r += 0.25;
    R[i] = r;
  }
  if (!R.some((r) => r > 2)) {
    // (her deck's three overlapping ellipses: see the island's blobs)
    const blobs = [[0, 23.7, 10.1], [15.2, 15.2, 8.3], [-15.2, 15.2, 9.1]];
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      let r = 0;
      for (const [bx, rx, ry] of blobs) {
        const A = (ca * ca) / (rx * rx) + (sa * sa) / (ry * ry), B = -2 * bx * ca / (rx * rx), Cc = (bx * bx) / (rx * rx) - 1;
        const D = B * B - 4 * A * Cc;
        if (D >= 0) r = Math.max(r, (-B + Math.sqrt(D)) / (2 * A));
      }
      R[i] = r;
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const S = R.slice();
    for (let i = 0; i < N; i++) R[i] = (S[(i + N - 1) % N] + 2 * S[i] + S[(i + 1) % N]) / 4;
  }
  return R;
}

/** Her hull: bands of paint down her side from the gunwale into the sea, and the gunwale's top and inner face (seen from her deck). */
function hullGeometry(R) {
  const N = R.length, top = DOCK_Y + 0.36;
  // rings down her side: [height, out past the deck's edge]
  const rings = [[top, 0.5], [DOCK_Y - 0.12, 0.56], [0.45, 0.5], [-0.55, 0.12], [-2.6, -2.4]];
  const bands = [WHITE, GREEN, GREEN_D, BELOW];
  const pos = [], col = [];
  const P = (i, h, out) => { const a = (i % N) / N * Math.PI * 2, r = Math.max(0.4, R[i % N] + out); return [Math.cos(a) * r, h, Math.sin(a) * r]; };
  const tri = (a, b, c, cc) => { pos.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) col.push(cc.r, cc.g, cc.b); };
  for (let b = 0; b < bands.length; b++) {
    const cc = C(bands[b]), [h0, o0] = rings[b], [h1, o1] = rings[b + 1];
    for (let i = 0; i < N; i++) {
      const p00 = P(i, h0, o0), p01 = P(i + 1, h0, o0), p10 = P(i, h1, o1), p11 = P(i + 1, h1, o1);
      tri(p00, p01, p10, cc); tri(p01, p11, p10, cc);
    }
  }
  // the gunwale: its top, and its inner face down to the deck
  const cw = C(WHITE), ci = C('#e9e2d0');
  for (let i = 0; i < N; i++) {
    const o0 = P(i, top, 0.5), o1 = P(i + 1, top, 0.5), n0 = P(i, top, -0.12), n1 = P(i + 1, top, -0.12);
    tri(o0, n1, o1, cw); tri(o0, n0, n1, cw);
    const d0 = P(i, DOCK_Y - 0.05, -0.12), d1 = P(i + 1, DOCK_Y - 0.05, -0.12);
    tri(n0, d0, n1, ci); tri(n1, d0, d1, ci);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A sail hung from its yard: stripes of yellow and white, bellied forward (+x) by the wind. */
function sail(k, x, yTop, w, h, belly) {
  const n = 8, sw = w / n;
  for (let s = 0; s < n; s++) {
    const geo = new THREE.PlaneGeometry(sw, h, 1, 6);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i);
      const across = (s + 0.5) * sw - w / 2 + px; // (across the ship)
      const down = (h / 2 - py) / h; // 0 at the yard, 1 at the foot
      const b = belly * Math.sin(Math.PI * Math.min(1, down * 0.95 + 0.05)) * Math.cos(across / w * Math.PI * 0.9);
      p.setXYZ(i, b, py, (s + 0.5) * sw - w / 2 + px);
    }
    geo.computeVertexNormals();
    k.add(geo, { at: [x, yTop - h / 2, 0], color: s % 2 ? SAIL_W : YELLOW, double: true });
  }
}

/** A canvas sign: text on a board of colour bg, framed. */
function sign(text, w, h, { bg, fg, frame, font }) {
  const { ctx: g, tex } = canvasTexture(w, h);
  g.fillStyle = frame; g.fillRect(0, 0, w, h);
  g.fillStyle = bg; g.fillRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + h * 0.04);
  tex.needsUpdate = true;
  return new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide });
}

let FLAG_MAT = null, SIGN_MATS = null;

reg('baratie', (o, ctx) => {
  const root = new THREE.Group();
  root.name = 'baratie';
  root.userData.noGround = true; // (modelled from the sea's level up)
  const R = deckOutline(o, ctx?.world);
  const N = R.length;
  const rAt = (a) => { const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * N, i = Math.floor(f), t = f - i; return R[i % N] * (1 - t) + R[(i + 1) % N] * t; };
  const k = new Mesher();
  k.add(hullGeometry(R), { attrs: true, outline: 0.06 });
  // portholes down her sides
  for (let i = 0; i < N; i += 3) {
    const a = i / N * Math.PI * 2;
    if (Math.abs(Math.sin(a)) < 0.55) continue; // (not round her bow and stern)
    const r = R[i] + 0.56, x = Math.cos(a) * r, z = Math.sin(a) * r, yaw = Math.PI / 2 - a;
    k.add(new THREE.CircleGeometry(0.34, 12), { at: [x, 0.95, z], rot: [0, yaw, 0], color: '#1d2b33' });
    k.add(torus(0.36, 0.07, 5, 14), { at: [x, 0.95, z], rot: [0, yaw, 0], color: WHITE });
  }
  // the fish's head, her bow: an orange crown, a cream jaw, the mouth agape, big round eyes
  const hx = rAt(0) + 4.4;
  const S = (r = 1) => new THREE.SphereGeometry(r, 28, 18);
  k.add(S(), { at: [hx, 4.3, 0], scale: [6.2, 5.0, 5.3], color: '#f39a26', outline: 0.07 });
  k.add(S(), { at: [hx + 0.7, 1.5, 0], scale: [5.7, 3.4, 4.9], color: '#fff0d2', outline: 0.06 });
  k.add(S(), { at: [hx + 4.3, 2.9, 0], scale: [3.1, 2.6, 3.3], color: '#f6a63a', outline: 0.05 });
  // (the mouth just proud of the snout's front, which comes to hx + 7.4)
  k.add(torus(2.0, 0.55, 8, 22), { at: [hx + 7.3, 2.75, 0], rot: [0, Math.PI / 2, 0], scale: [1, 0.66, 1], color: '#fff4dc', outline: 0.04 });
  k.add(new THREE.CircleGeometry(1.75, 20), { at: [hx + 7.44, 2.75, 0], rot: [0, Math.PI / 2, 0], scale: [1, 0.66, 1], color: '#5a1414' });
  for (const sz of [-1, 1]) {
    k.add(S(1.45), { at: [hx + 2.4, 5.9, sz * 4.3], color: '#ffffff', outline: 0.04 });
    k.add(S(0.8), { at: [hx + 2.95, 6.0, sz * 5.15], color: '#141414' });
    k.add(S(0.22), { at: [hx + 3.3, 6.45, sz * 5.6], color: '#ffffff' });
    k.add(torus(1.5, 0.17, 6, 18), { at: [hx + 2.4, 5.9, sz * 4.45], rot: [0, sz < 0 ? Math.PI : 0, 0], color: '#c96a12' });
  }
  // (the line of its gills, over the top from cheek to cheek)
  k.add(torus(4.6, 0.24, 6, 22, Math.PI), { at: [hx - 2.5, 3.4, 0], rot: [0, Math.PI / 2, 0], color: '#d9781a' });
  // the fish's tail, her stern: a forked fin standing up
  const tail = new THREE.Shape();
  tail.moveTo(0, 0.8);
  tail.quadraticCurveTo(-3.5, 2.6, -6.6, 8.6);
  tail.quadraticCurveTo(-5.4, 4.6, -4.4, 3.4);
  tail.quadraticCurveTo(-6.0, 0.6, -7.3, -1.6);
  tail.quadraticCurveTo(-3.6, -0.6, 0, -0.8);
  const tg = new THREE.ExtrudeGeometry(tail, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 1, curveSegments: 10 });
  k.add(tg, { at: [-rAt(Math.PI) + 0.8, DOCK_Y + 0.7, -0.35], color: YELLOW, outline: 0.05 });
  for (const sz of [-1, 1]) {
    // (orange rays down each face of it)
    for (const [x0, y0, x1, y1] of [[-1, 1.4, -5.6, 7.4], [-1, 0.9, -5.0, 3.6], [-1, 0.2, -6.2, -1.0]]) {
      const L = Math.hypot(x1 - x0, y1 - y0);
      k.add(box(L, 0.14, 0.04), { at: [-rAt(Math.PI) + 0.8 + (x0 + x1) / 2, DOCK_Y + 0.7 + (y0 + y1) / 2, sz * 0.5], rot: [0, 0, Math.atan2(y1 - y0, x1 - x0)], color: '#ee8a1a' });
    }
  }
  // the masts: yards with their striped sails, shrouds and ratlines to the gunwales, a flag at each masthead
  for (const mx of MASTS) {
    const fore = mx > 0, base = DOCK_Y;
    k.add(cyl(0.3, 0.48, MAST_H, 10), { at: [mx, base, 0], color: '#6b4426', outline: 0.03 });
    k.add(cyl(0.38, 0.38, 0.3, 10), { at: [mx, base + MAST_H, 0], color: '#3e2716' });
    const yards = [[12, 12.2, 5.8], [17.6, 9.8, 4.4], [22, 7.2, 3.2]];
    for (const [yh, w, h] of yards) {
      k.add(cyl(0.17, 0.17, w + 0.7, 8), { at: [mx, base + yh, 0], rot: [Math.PI / 2, 0, 0], color: '#5a3a22', outline: 0.02 });
      sail(k, mx + 0.35, base + yh - 0.1, w, h, fore ? 1.1 : 0.9);
    }
    // (how far across her deck is at the mast: the shrouds come down to the gunwales there)
    let side = 6;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 180) { const r = rAt(a); if (Math.abs(Math.cos(a) * r - mx) < 0.4) side = Math.max(side, Math.abs(Math.sin(a) * r)); }
    for (const sz of [-1, 1]) {
      const fx = mx, fy = base + 0.36, fz = sz * (side + 0.3), tx = mx, ty = base + 20.5, tz = sz * 0.3;
      for (const dx of [-1.6, -0.55, 0.55, 1.6]) {
        // (a line from the gunwale up to the mast: the cylinder stands on its foot, turned to point up the line)
        const a = new THREE.Vector3(fx + dx, fy, fz), b = new THREE.Vector3(tx + dx * 0.15, ty, tz);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
        k.add(cyl(0.035, 0.035, a.distanceTo(b), 4), { at: [a.x, a.y, a.z], rot: [e.x, e.y, e.z], color: '#3a2a1c' });
      }
      // ratlines across them, every 0.55 m up
      for (let h = 0.7; h < 19; h += 0.55) {
        const t = h / (ty - fy), z = fz + (tz - fz) * t;
        k.add(box(3.4 * (1 - t * 0.85), 0.03, 0.03), { at: [mx, fy + h, z], color: '#4a3524' });
      }
    }
  }
  // (the hull and all that's on her, one mesh)
  root.add(meshOf(k.build()));
  // her flags: red, her B on white
  if (!FLAG_MAT) {
    const { ctx: g, tex } = canvasTexture(192, 128);
    g.fillStyle = '#c62828'; g.fillRect(0, 0, 192, 128);
    g.fillStyle = '#fff6e6'; g.fillRect(58, 26, 76, 76);
    g.fillStyle = '#c62828'; g.font = 'bold 66px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('B', 96, 68);
    tex.needsUpdate = true;
    FLAG_MAT = new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide });
  }
  for (const mx of MASTS) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.2, 6, 1), FLAG_MAT);
    // (streaming aft, rippled a little)
    const p = f.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + 1.65) * 1.9) * 0.18 * (p.getX(i) + 1.65) / 3.3);
    f.geometry.computeVertexNormals();
    f.position.set(mx - 1.75, DOCK_Y + MAST_H - 0.9, 0);
    root.add(f);
  }
  // the restaurant's signs: BARATIE along its gallery, RESTAURANT on the brow of its roof
  if (!SIGN_MATS) {
    SIGN_MATS = {
      name: sign('BARATIE', 768, 128, { bg: '#24614d', fg: '#ffd34d', frame: '#f4e3a6', font: 'bold 88px Georgia, serif' }),
      rest: sign('RESTAURANT', 896, 140, { bg: '#fff6e0', fg: '#b3261e', frame: '#3b2a1a', font: 'bold 92px Georgia, serif' }),
    };
  }
  const g = HOUSE.g, H = 0.35 + 3.0 * g + 2.75 * g, storey = 0.35 + 2.75 * g;
  const nameBoard = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.2), SIGN_MATS.name);
  nameBoard.position.set(0, DOCK_Y + storey + 0.5, HOUSE.front + 1.02);
  root.add(nameBoard);
  // (the roof's band runs along the front 1.2·g in from its eaves, 0.3 out from the wall: see buildings3d.js mansardDims)
  const bandTop = DOCK_Y + H + 2.5 * g + 0.18, bandZ = HOUSE.front - HOUSE.fd / 2 + (HOUSE.fd + 0.6 - 2.4 * g) / 2;
  const rest = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1.45), SIGN_MATS.rest);
  rest.position.set(0, bandTop + 1.05, bandZ + 0.1);
  root.add(rest);
  const legs = new Mesher();
  for (const sx of [-3.6, 3.6]) legs.add(box(0.18, 0.5, 0.18), { at: [sx, bandTop, bandZ], color: '#3b2a1a' });
  root.add(meshOf(legs.build()));
  return root;
});
