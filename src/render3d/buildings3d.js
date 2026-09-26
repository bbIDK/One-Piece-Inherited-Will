// 3D town buildings from the town generator's records, in the town's style:
// half-timbered villages, stucco towns, brick ports and cities, log cabins
// under snow, adobe with domes and parapets, Wano and Chinese houses with
// curved tiered roofs, white Marine bases, candy houses with cream, shell-
// roofed fish-man homes, round thatched huts, ruins… Each building is ONE
// merged vertex-coloured mesh (walls, trims, frames, roof, chimney, door,
// windows that glow at night) plus its shop sign and name board.
//
// Local frame: the front (street side, the door) faces +z at z = 0, the
// building goes back to z = -fd; x runs from -fw/2 to fw/2; y is up.
import * as THREE from 'three';
import { uiIcon } from '../render/icons.js';
import { tick } from './props/mats.js';
import { vcMat, bindCtx, STATE } from './props/mats.js';
import { Mesher, box, cyl, cone, lathe, slab, C, shade, hash } from './props/kit.js';
import { CLIMATE } from '../world/tiles.js';

const ROLE_ICON = {
  tavern: 'bar', bar: 'bar', inn: 'inn', shop: 'shop', market: 'shop', weapons: 'sword', dojo: 'trainer', doctor: 'doctor', shipwright: 'shipwright',
  marine_base: 'marine', bounty: 'bounty', trainer: 'trainer', library: 'library', bank: 'berries', cafe: 'bar', restaurant: 'food', church: 'help',
};

// ---------------------------------------------------------------- textures
const signMats = new Map();
function signMaterial(name) {
  let m = signMats.get(name);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#f5e6c4'; g.strokeStyle = '#5a3a22'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(4, 4, 88, 88, 12); g.fill(); g.stroke();
  try { g.drawImage(uiIcon(name, 48), 16, 16, 64, 64); } catch { /* no icon */ }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshToonMaterial({ map: t, side: THREE.DoubleSide });
  signMats.set(name, m);
  return m;
}

function nameBoard(text, marine) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = 'bold 44px Nunito, "Trebuchet MS", sans-serif';
  g.font = font;
  const w = Math.min(1024, Math.ceil(g.measureText(text).width) + 56);
  c.width = w; c.height = 72;
  g.font = font;
  g.fillStyle = marine ? '#f5f6fa' : '#6d4c33';
  g.strokeStyle = marine ? '#1b4f72' : '#3e2a1a';
  g.lineWidth = 6;
  g.beginPath(); g.roundRect(3, 3, w - 6, 66, 10); g.fill(); g.stroke();
  g.fillStyle = marine ? '#1b4f72' : '#f5e6c4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, 38, w - 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { mat: new THREE.MeshToonMaterial({ map: t }), aspect: w / 72 };
}

// kept for the renderer's night hook (lit windows now glow through the shared material)
const windowMat = new THREE.MeshToonMaterial({ color: 0x2b3a4a, emissive: 0x000000 });
export function setNightWindows(k) {
  windowMat.emissive.setRGB(1.0 * k, 0.78 * k, 0.42 * k);
  tick(k); // per-frame: shared uniforms and animated props
}

// ---------------------------------------------------------------- styles
// wall: 'timber' | 'plaster' | 'brick' | 'log' | 'adobe' | 'post' | 'column' | 'smooth' | 'stone'
const STYLE = {
  village: { wall: 'timber', beam: '#5a3a22', base: '#8d8a82', win: 'cross', shutters: true, flowers: true, door: 'plank' },
  town: { wall: 'plaster', trim: '#d8cbb0', base: '#9e9a90', win: 'cross', shutters: true, door: 'panel', quoins: true },
  port: { wall: 'brick', trim: '#8d6e63', base: '#7f7a72', win: 'cross', door: 'plank' },
  city: { wall: 'brick', trim: '#f0e6d2', base: '#8a8378', win: 'tall', door: 'panel', cornice: true },
  desert: { wall: 'adobe', base: '#c9a878', win: 'arch', door: 'arch', vigas: true },
  snow: { wall: 'log', base: '#7f8c8d', win: 'cross', door: 'plank', snow: true },
  wano: { wall: 'post', beam: '#3e2723', base: '#5d5d5d', win: 'shoji', door: 'noren', engawa: true },
  chinese: { wall: 'column', beam: '#b03a2e', base: '#9e9a90', win: 'lattice', door: 'panel', lanterns: true },
  sky: { wall: 'smooth', base: '#e3eef7', win: 'round', door: 'arch' },
  candy: { wall: 'smooth', base: '#f5b7b1', win: 'round', door: 'arch', icing: true },
  fishman: { wall: 'smooth', base: '#76d7c4', win: 'round', door: 'arch' },
  marine: { wall: 'plaster', trim: '#1b4f72', base: '#b0bec5', win: 'tall', door: 'panel', band: true },
  noble: { wall: 'plaster', trim: '#d4ac0d', base: '#ecf0f1', win: 'tall', door: 'panel', portico: true, cornice: true },
  spooky: { wall: 'plaster', trim: '#2c2c3a', base: '#4a4a5a', win: 'gothic', door: 'plank', crooked: true },
  future: { wall: 'smooth', trim: '#48c9b0', base: '#d0ece7', win: 'round', door: 'panel', strips: true },
  tribal: { wall: 'hut', base: '#8d6e63', win: 'none', door: 'hide' },
  mink: { wall: 'hut', base: '#8d6e63', win: 'round', door: 'plank' },
  giant: { wall: 'timber', beam: '#4e342e', base: '#7f7a72', win: 'cross', door: 'plank', scale: 2.1 },
  ruins: { wall: 'stone', base: '#8d8a82', win: 'hole', door: 'hole' },
};

const lit = (b, i) => ((i * 7 + (b.v || 0) * 3) % 5) < 3; // which windows are lit at night
const WARM = '#ffc766';

// ---------------------------------------------------------------- parts

/** Axis-aligned box from (x0, y0, z0) to (x1, y1, z1). */
function B(k, x0, y0, z0, x1, y1, z1, color, o = {}) {
  k.add(box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), { at: [(x0 + x1) / 2, Math.min(y0, y1), (z0 + z1) / 2], color, ...o });
}

/** A window on a wall; (x, y) its centre, `face` +1 front (z = 0 plane) or ±2 for the side walls at x = ±fw/2. */
function windowAt(k, b, S, x, y, w, h, faceZ, litOn, wallCol, flowers) {
  k.save();
  k.translate(x, y, faceZ);
  const frame = S.wall === 'post' ? '#3e2723' : S.wall === 'brick' || S.wall === 'adobe' ? shade(wallCol, 0.35) : shade(wallCol, -0.45);
  const glass = '#2d4150';
  const glow = litOn ? WARM : null;
  switch (S.win) {
    case 'shoji': {
      B(k, -w / 2 - 0.06, -h / 2 - 0.06, -0.02, w / 2 + 0.06, h / 2 + 0.06, 0.06, '#3e2723');
      B(k, -w / 2, -h / 2, 0, w / 2, h / 2, 0.035, '#f3ead3', { glow: litOn ? '#ffb84d' : null });
      for (let i = 1; i < 3; i++) B(k, -w / 2 + i * w / 3 - 0.015, -h / 2, 0.03, -w / 2 + i * w / 3 + 0.015, h / 2, 0.05, '#5d4037');
      B(k, -w / 2, -0.015, 0.03, w / 2, 0.015, 0.05, '#5d4037');
      break;
    }
    case 'lattice': {
      B(k, -w / 2 - 0.08, -h / 2 - 0.08, -0.02, w / 2 + 0.08, h / 2 + 0.08, 0.06, '#8e2b22');
      B(k, -w / 2, -h / 2, 0, w / 2, h / 2, 0.035, '#f6ddcc', { glow: litOn ? '#ffab66' : null });
      for (let i = 1; i < 4; i++) B(k, -w / 2 + i * w / 4 - 0.012, -h / 2, 0.03, -w / 2 + i * w / 4 + 0.012, h / 2, 0.05, '#8e2b22');
      for (let i = 1; i < 4; i++) B(k, -w / 2, -h / 2 + i * h / 4 - 0.012, 0.03, w / 2, -h / 2 + i * h / 4 + 0.012, 0.05, '#8e2b22');
      break;
    }
    case 'round': {
      const r = Math.min(w, h) * 0.5;
      k.add(new THREE.TorusGeometry(r, 0.07, 5, 14), { at: [0, 0, 0.03], color: frame });
      k.add(new THREE.CircleGeometry(r, 14), { at: [0, 0, 0.02], color: S.wall === 'smooth' && b.style === 'sky' ? '#bde3ff' : glass, glow });
      B(k, -0.015, -r, 0.03, 0.015, r, 0.05, frame);
      break;
    }
    case 'arch': case 'gothic': {
      const s = new THREE.Shape();
      const r = w / 2;
      s.moveTo(-r, -h / 2); s.lineTo(r, -h / 2); s.lineTo(r, h / 2 - r);
      if (S.win === 'gothic') { s.quadraticCurveTo(r, h / 2 - r * 0.2, 0, h / 2 + r * 0.35); s.quadraticCurveTo(-r, h / 2 - r * 0.2, -r, h / 2 - r); }
      else s.absarc(0, h / 2 - r, r, 0, Math.PI, false);
      s.closePath();
      const g = new THREE.ShapeGeometry(s, 8);
      const out = new THREE.ShapeGeometry(s, 8);
      out.scale((r + 0.09) / r, (h / 2 + 0.09) / (h / 2), 1);
      k.add(out, { at: [0, 0, 0.012], color: frame });
      k.add(g, { at: [0, 0, 0.025], color: S.win === 'gothic' ? '#2a3a2a' : glass, glow: litOn ? (S.win === 'gothic' ? '#b6ff8a' : WARM) : null });
      if (S.win === 'gothic') B(k, -0.015, -h / 2, 0.03, 0.015, h / 2, 0.045, frame);
      if (b.style === 'desert') B(k, -r - 0.12, -h / 2 - 0.12, 0, r + 0.12, -h / 2 - 0.04, 0.12, shade(wallCol, -0.15));
      break;
    }
    case 'hole': {
      B(k, -w / 2, -h / 2, -0.02, w / 2, h / 2, 0.012, '#2a2622');
      break;
    }
    case 'none': break;
    default: { // 'cross' / 'tall': framed glass with mullions and a sill
      const hh = S.win === 'tall' ? h * 1.2 : h;
      B(k, -w / 2 - 0.08, -hh / 2 - 0.08, -0.02, w / 2 + 0.08, hh / 2 + 0.08, 0.05, frame);
      B(k, -w / 2, -hh / 2, 0, w / 2, hh / 2, 0.06, glass, { glow });
      B(k, -0.025, -hh / 2, 0.05, 0.025, hh / 2, 0.08, frame);
      B(k, -w / 2, -0.025, 0.05, w / 2, 0.025, 0.08, frame);
      B(k, -w / 2 - 0.12, -hh / 2 - 0.14, -0.02, w / 2 + 0.12, -hh / 2 - 0.06, 0.14, shade(frame, 0.1));
      if (S.shutters) {
        const sc = ['#2e6b8a', '#4f7d3a', '#8a3b2e', '#6d4c33'][(b.v || 0) % 4];
        for (const s of [-1, 1]) {
          B(k, s * (w / 2 + 0.1), -hh / 2, 0, s * (w / 2 + 0.1 + w * 0.45), hh / 2, 0.04, sc);
          for (let i = 1; i < 4; i++) B(k, s * (w / 2 + 0.12), -hh / 2 + i * hh / 4 - 0.01, 0.03, s * (w / 2 + 0.08 + w * 0.45), -hh / 2 + i * hh / 4 + 0.01, 0.05, shade(sc, -0.3));
        }
      }
      if (flowers) {
        B(k, -w / 2 - 0.05, -hh / 2 - 0.36, 0.02, w / 2 + 0.05, -hh / 2 - 0.14, 0.26, '#7a4b2a');
        for (let i = 0; i < 5; i++) {
          const fx = -w / 2 + (i + 0.5) * (w / 5);
          k.add(new THREE.IcosahedronGeometry(0.075, 0), { at: [fx, -hh / 2 - 0.1, 0.15], color: i % 2 ? '#e84a7f' : '#ffd54f' });
          k.add(new THREE.IcosahedronGeometry(0.07, 0), { at: [fx + 0.05, -hh / 2 - 0.14, 0.1], color: '#4caf50' });
        }
      }
    }
  }
  k.restore();
}

/** The front door (with frame, step and style details). */
function doorAt(k, b, S, x, g, wallCol, big) {
  const dw = (big ? 1.7 : 1.05) * g, dh = (big ? 2.5 : 2.15) * g;
  const wood = S.door === 'panel' && (b.style === 'marine' || b.role === 'marine_base') ? '#1b4f72' : b.style === 'noble' ? '#6d3b1f' : '#5a3a22';
  const frame = S.wall === 'post' ? '#3e2723' : S.wall === 'brick' ? shade(wallCol, 0.4) : shade(wallCol, -0.4);
  k.save();
  k.translate(x, 0, 0);
  // step
  B(k, -dw / 2 - 0.2, -0.3, -0.02, dw / 2 + 0.2, 0.12, 0.45, '#9a948a', { outline: 0.02 });
  switch (S.door) {
    case 'arch': case 'hole': {
      const s = new THREE.Shape();
      const r = dw / 2;
      s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, dh - r); s.absarc(0, dh - r, r, 0, Math.PI, false); s.closePath();
      const out = new THREE.ShapeGeometry(s, 10);
      out.scale((r + 0.13) / r, (dh + 0.13) / dh, 1);
      if (S.door !== 'hole') k.add(out, { at: [0, 0.1, 0.012], color: frame });
      k.add(new THREE.ShapeGeometry(s, 10), { at: [0, 0.1, 0.03], color: S.door === 'hole' ? '#231f1b' : wood });
      if (S.door !== 'hole') k.add(new THREE.SphereGeometry(0.05, 5, 4), { at: [r * 0.6, 0.1 + dh * 0.45, 0.06], color: '#f1c40f' });
      break;
    }
    case 'noren': {
      B(k, -dw / 2 - 0.12, 0.1, -0.02, dw / 2 + 0.12, dh + 0.2, 0.05, '#3e2723');
      B(k, -dw / 2, 0.1, 0, dw / 2, dh, 0.03, '#2b2420');
      const nc = ['#1f3a68', '#7b1f1f', '#2e5e3a', '#4a2e6b'][(b.v || 0) % 4];
      for (let i = 0; i < 3; i++) B(k, -dw / 2 + i * dw / 3 + 0.02, dh - 0.75, 0.05, -dw / 2 + (i + 1) * dw / 3 - 0.02, dh, 0.08, nc);
      B(k, -dw / 2 - 0.05, dh - 0.05, 0.04, dw / 2 + 0.05, dh + 0.05, 0.1, '#3e2723');
      break;
    }
    case 'hide': {
      const s = new THREE.Shape();
      s.moveTo(-dw / 2, 0); s.lineTo(dw / 2, 0); s.lineTo(dw * 0.35, dh * 0.8); s.lineTo(0, dh * 0.95); s.lineTo(-dw * 0.35, dh * 0.8); s.closePath();
      k.add(new THREE.ShapeGeometry(s), { at: [0, 0.1, 0.05], color: '#a1784f' });
      break;
    }
    default: {
      B(k, -dw / 2 - 0.14, 0.1, -0.02, dw / 2 + 0.14, dh + 0.16, 0.07, frame, { outline: 0.015 });
      B(k, -dw / 2, 0.1, 0, dw / 2, dh, 0.09, wood);
      if (S.door === 'plank') for (let i = 1; i < 4; i++) B(k, -dw / 2 + i * dw / 4 - 0.012, 0.15, 0.08, -dw / 2 + i * dw / 4 + 0.012, dh - 0.05, 0.1, shade(wood, -0.3));
      else { B(k, -dw / 2 + 0.12, 0.35, 0.08, dw / 2 - 0.12, dh * 0.45, 0.11, shade(wood, 0.12)); B(k, -dw / 2 + 0.12, dh * 0.55, 0.08, dw / 2 - 0.12, dh - 0.15, 0.11, shade(wood, 0.12)); }
      if (big) B(k, -0.012, 0.1, 0.09, 0.012, dh, 0.11, shade(wood, -0.35));
      k.add(new THREE.SphereGeometry(0.05, 5, 4), { at: [dw / 2 - 0.16, 0.1 + dh * 0.47, 0.13], color: '#f1c40f' });
      // a lamp over shop doors
      if (b.role && b.role !== 'house') {
        B(k, -0.04, dh + 0.25, 0.05, 0.04, dh + 0.3, 0.45, '#2d3436');
        k.add(cyl(0.1, 0.13, 0.28, 6), { at: [0, dh + 0.02, 0.42], color: '#fff1c4', glow: '#ffcf70', flicker: 0.15 });
        k.add(cone(0.16, 0.12, 6), { at: [0, dh + 0.3, 0.42], color: '#2d3436' });
      }
    }
  }
  k.restore();
  return { dw, dh };
}

/** A pitched roof with the ridge along x (gable ends at x = ±hw). */
function gableRoof(k, S, b, hw, hd, y, rise, ov, roofCol, wallCol, snowy, g) {
  const alpha = Math.atan2(rise, hd);
  const ovS = 0.3 * g;
  const L = hw * 2 + ovS * 2;
  const slopeLen = (hd + ov) / Math.cos(alpha);
  const th = 0.16 * g;
  const zc = -hd; // ridge line z (the building is centred at z = -hd)
  // the gable ends fill the attic (wall colour)
  k.save(); k.translate(0, y, zc); k.rotateY(Math.PI / 2);
  k.add(slab([[-hd, 0], [hd, 0], [0, rise]], hw * 2), { color: wallCol, outline: 0.03 });
  k.restore();
  if (S.wall === 'timber') {
    // timber framing on the gable
    for (const sx of [-1, 1]) {
      k.save(); k.translate(sx * (hw + 0.01), y, zc);
      B(k, -0.03, 0, -hd, 0.03, 0.12, hd, S.beam);
      k.add(box(0.06, rise, 0.12), { at: [0, 0, 0], color: S.beam });
      k.restore();
    }
  }
  for (const side of [1, -1]) {
    k.save();
    k.translate(0, y + rise, zc);
    k.rotateX(side * alpha);
    if (side < 0) k.rotateY(Math.PI);
    k.add(box(L, th, slopeLen), { at: [0, 0, slopeLen / 2], color: roofCol, outline: 0.05 });
    // tile rows / shingle courses
    if (!snowy) {
      const rows = Math.max(3, Math.round(slopeLen / (0.42 * g)));
      for (let i = 1; i < rows; i++) {
        const z = (i / rows) * slopeLen;
        k.add(box(L, 0.05 * g, 0.07 * g), { at: [0, th, z], color: shade(roofCol, -0.22) });
      }
    } else {
      // a thick snow blanket with a rounded lip at the eave
      k.add(box(L - 0.1, 0.18 * g, slopeLen - 0.05), { at: [0, th, slopeLen / 2 + 0.02], color: '#f4f9ff' });
      k.add(cyl(0.13 * g, 0.13 * g, L - 0.1, 7), { at: [(L - 0.1) / 2, th + 0.06, slopeLen], rot: [0, 0, Math.PI / 2], color: '#ffffff' });
    }
    // bargeboards on the gable edges
    for (const sx of [-1, 1]) k.add(box(0.1 * g, th + 0.08, slopeLen), { at: [sx * (L / 2 + 0.03), -0.04, slopeLen / 2], color: shade(roofCol, -0.4) });
    k.restore();
  }
  // ridge cap
  k.add(box(L + 0.1, 0.16 * g, 0.26 * g), { at: [0, y + rise + th * 0.5, zc], color: snowy ? '#ffffff' : shade(roofCol, -0.3), outline: 0.02 });
  return rise + th;
}

/**
 * A hip roof with a concave curve and upturned corners (Wano / Chinese).
 * Centred at (0, y, cz); W × D is the eave rectangle before the overhang.
 */
function curvedRoof(k, cx, cz, y, W, D, rise, ov, roofCol, opts = {}) {
  const R = 4, M = 4; // rings up the roof, points per side
  const hw0 = W / 2 + ov, hd0 = D / 2 + ov;
  const ridge = Math.max(0.05, W / 2 - D / 2 * 0.85);
  const up = opts.upturn ?? 0.35;
  const C4 = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
  const rings = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R;
    const e = Math.pow(t, 0.62);
    const hw = hw0 + (ridge - hw0) * e, hd = hd0 + (0.03 - hd0) * e, yy = y + rise * Math.pow(t, 1.8);
    const lift = i === 0 ? up : i === 1 ? up * 0.3 : 0;
    const pts = [];
    for (let s = 0; s < 4; s++) {
      const [ax, az] = C4[s], [bx, bz] = C4[(s + 1) % 4];
      for (let m = 0; m < M; m++) {
        const u = m / M;
        const l = lift * (Math.max(0, 1 - u / 0.3) ** 2 + Math.max(0, 1 - (1 - u) / 0.3) ** 2);
        pts.push([cx + (ax + (bx - ax) * u) * hw, yy + l, cz + (az + (bz - az) * u) * hd]);
      }
    }
    rings.push(pts);
  }
  const N = 4 * M;
  const pos = [], idx = [];
  rings.forEach((r) => r.forEach((p) => pos.push(...p)));
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * N + j, b2 = i * N + (j + 1) % N, c = a + N, d = b2 + N;
      idx.push(a, b2, d, a, d, c);
    }
  }
  // close the top
  const t0 = R * N;
  for (let j = 1; j < N - 1; j++) idx.push(t0, t0 + j, t0 + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  k.add(g.toNonIndexed(), { color: roofCol, outline: 0.05, flat: true });
  // fascia and soffit under the eaves
  const th = opts.th ?? 0.18;
  const e0 = rings[0];
  const fp = [], fi = [];
  e0.forEach((p) => fp.push(...p));
  e0.forEach((p) => fp.push(p[0], p[1] - th, p[2]));
  fp.push(cx, y - th + 0.05, cz);
  for (let j = 0; j < N; j++) {
    const a = j, b2 = (j + 1) % N;
    fi.push(a, b2 + N, b2, a, a + N, b2 + N);
    fi.push(2 * N, b2 + N, j + N);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fg.setIndex(fi);
  k.add(fg.toNonIndexed(), { color: shade(roofCol, -0.35), flat: true });
  // hip ridges from the corners and the main ridge with raised ends
  const top = rings[R];
  const ridgeCol = opts.ridgeCol || shade(roofCol, -0.4);
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < R; i++) {
      const a = rings[i][s * M], bb = rings[i + 1][s * M];
      const d = new THREE.Vector3(bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]);
      const len = d.length();
      const m = new THREE.Matrix4().compose(new THREE.Vector3(...a), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1));
      k.save(); k.transform(m); k.add(box(0.13, len + 0.04, 0.13), { color: ridgeCol }); k.restore();
    }
  }
  const rhw = Math.abs(top[0][0] - cx), ry = top[0][1];
  k.add(box(rhw * 2 + 0.3, 0.2, 0.22), { at: [cx, ry - 0.02, cz], color: ridgeCol, outline: 0.02 });
  for (const sx of [-1, 1]) {
    k.add(slab([[0, 0], [0.22, 0], [0.3, 0.5], [0.08, 0.42]], 0.12), { at: [cx + sx * (rhw + 0.12), ry + 0.08, cz], scale: [sx, 1, 1], color: opts.finCol || shade(roofCol, -0.45) });
  }
  return rise;
}

/** A dome from the eave ring (radius r) up. kind: 'dome' | 'onion' | 'shell'. */
function domeRoof(k, cx, cz, y, r, sy, col, kind = 'dome') {
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let rr = Math.cos(t * Math.PI / 2) * r, yy = Math.sin(t * Math.PI / 2) * r * sy;
    if (kind === 'onion') { rr = r * (Math.sin((1 - t) * Math.PI * 0.85 + 0.25) * 1.08) * (1 - t * 0.2); yy = t * r * sy * 1.25; }
    pts.push([Math.max(0.001, rr), yy]);
  }
  const g = lathe(pts, 16);
  if (kind === 'shell') {
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), yy = P.getY(i);
      const a = Math.atan2(z, x);
      const f = 1 + 0.07 * Math.cos(a * 9) * (1 - yy / (r * sy + 0.01));
      P.setX(i, x * f); P.setZ(i, z * f);
    }
    g.computeVertexNormals();
  }
  k.add(g, { at: [cx, y, cz], color: col, outline: 0.05 });
  return r * sy * (kind === 'onion' ? 1.25 : 1);
}

// ---------------------------------------------------------------- building

export function buildBuilding(b, ctx) {
  bindCtx(ctx);
  ctx = ctx || STATE.ctx;
  const S = STYLE[b.style] || STYLE.village;
  const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
  const g = S.scale || 1; // giant scale for doors, windows and storeys
  const role = b.role || 'house';
  const big = role === 'marine_base' || role === 'palace' || role === 'hall' || role === 'church';
  const rt = b.roofType || 'gable';
  const k = new Mesher();
  const wallCol = C(b.wall || '#d8c29d');
  const roofCol = C(b.roof || '#9c4a2a');
  const baseCol = S.base;
  const storeys = Math.max(1, Math.min(5, (b.hgt || 2) - 1));
  const storeyH = 2.75 * g;
  const plinth = 0.35;
  const H = plinth + 3.0 * g + (storeys - 1) * storeyH;
  const hd = fd / 2;
  const winter = S.snow || (ctx?.world && ctx.world.climate(b.x, b.y - 1) === CLIMATE.WINTER);
  const door = { x: Math.max(-fw / 2 + 0.9, Math.min(fw / 2 - 0.9, (b.door?.x ?? b.x) - b.x)) };

  // round huts are their own thing
  if (S.wall === 'hut' || rt === 'hut') return finish(b, hut(k, b, S, fw, fd, H, wallCol, roofCol), null, H + fd);

  // foundation (sunk into the ground to hide slopes)
  B(k, -fw / 2 - 0.08, -2.0, -fd - 0.08, fw / 2 + 0.08, plinth, 0.08, baseCol, { outline: 0.03 });

  // walls
  const ruined = rt === 'ruin' || S.wall === 'stone';
  if (ruined) {
    ruinWalls(k, b, fw, fd, H, wallCol);
  } else {
    const lean = S.crooked ? 0.04 : 0;
    k.save();
    if (lean) k.rotateZ(lean * ((b.v || 0) % 2 ? 1 : -1));
    B(k, -fw / 2, plinth - 0.05, -fd, fw / 2, H, 0, wallCol, { outline: 0.045 });
    wallDetail(k, b, S, fw, fd, H, plinth, storeys, storeyH, wallCol, g);
    k.restore();
  }

  // door and windows
  const dd = doorAt(k, b, S, door.x, g, wallCol, big && fw >= 5);
  const winW = 0.85 * g, winH = 1.05 * g;
  const cols = Math.max(1, Math.floor(fw / (1.7 * g)));
  let wi = 0;
  for (let f = 0; f < storeys; f++) {
    const y = plinth + f * storeyH + 1.55 * g;
    for (let i = 0; i < cols + 1; i++) {
      const x = -fw / 2 + (i + 0.5) * (fw / (cols + 1));
      if (f === 0 && Math.abs(x - door.x) < dd.dw / 2 + winW / 2 + 0.35) continue;
      if (Math.abs(x) > fw / 2 - winW / 2 - 0.2) continue;
      windowAt(k, b, S, x, y, winW, winH, 0.0, lit(b, wi++), wallCol, S.flowers && f === 0 && (i + (b.v || 0)) % 2 === 0);
    }
    if (fd >= 3) {
      for (const sx of [-1, 1]) {
        k.save(); k.translate(sx * fw / 2, 0, -fd / 2); k.rotateY(sx * Math.PI / 2);
        windowAt(k, b, S, 0, y, winW, winH, 0.0, lit(b, wi++), wallCol, false);
        k.restore();
      }
    }
  }

  // roof
  let top = H;
  if (!ruined) {
    if (rt === 'flat') top += flatRoof(k, b, S, fw, fd, H, wallCol, roofCol);
    else if (rt === 'dome' || rt === 'shell') {
      B(k, -fw / 2 - 0.15, H - 0.05, -fd - 0.15, fw / 2 + 0.15, H + 0.18, 0.15, shade(wallCol, -0.12), { outline: 0.03 });
      const r = Math.min(fw, fd) / 2 * 0.98;
      const kind = rt === 'shell' ? 'shell' : b.style === 'candy' ? 'onion' : 'dome';
      top += 0.18 + domeRoof(k, 0, -hd, H + 0.15, r, rt === 'shell' ? 0.8 : 0.9, roofCol, kind);
      if (fw > fd * 1.4) {
        // long buildings get a flat roof beside the dome
        B(k, -fw / 2, H + 0.1, -fd, fw / 2, H + 0.2, 0, roofCol);
      }
      if (S.icing) {
        for (let i = 0; i < 14; i++) {
          const a = i / 14 * Math.PI * 2;
          k.add(new THREE.IcosahedronGeometry(0.2, 1), { at: [Math.cos(a) * r * 0.98, H + 0.2, -hd + Math.sin(a) * r * 0.98], color: '#ffffff' });
        }
        k.add(new THREE.IcosahedronGeometry(0.22, 1), { at: [0, top + 0.1, -hd], color: '#e74c3c', outline: 0.02 });
        k.add(cyl(0.02, 0.02, 0.3, 4), { at: [0, top + 0.25, -hd], rot: [0, 0, 0.4], color: '#4e6b2a' });
      }
      if (b.style === 'future') {
        k.add(cyl(0.04, 0.06, 1.4, 5), { at: [0, top, -hd], color: '#b0bec5' });
        k.add(new THREE.SphereGeometry(0.12, 6, 4), { at: [0, top + 1.45, -hd], color: '#e74c3c', glow: '#ff5252' });
      }
      if (rt === 'shell') k.add(cone(0.18, 0.6, 7), { at: [0, top - 0.05, -hd], color: shade(roofCol, 0.2), outline: 0.02 });
    } else if (rt === 'pagoda') {
      top += pagodaRoofs(k, b, S, fw, fd, H, storeys, storeyH, plinth, wallCol, roofCol);
    } else {
      const rise = Math.min(3.4 * g, Math.max(1.2, fd * (S.crooked ? 0.62 : 0.45)));
      top += gableRoof(k, S, b, fw / 2, hd, H, rise, 0.4 * g, roofCol, wallCol, winter, g);
      // chimney
      if ((b.style === 'village' || b.style === 'snow' || b.style === 'town' || b.style === 'giant') && fw >= 4) {
        const cxh = fw / 2 - 0.9 * g, czh = -hd - hd * 0.35;
        const yTop = H + rise * (1 - 0.35) + 0.9 * g;
        B(k, cxh - 0.28 * g, H, czh - 0.28 * g, cxh + 0.28 * g, yTop, czh + 0.28 * g, '#8d6e63', { outline: 0.03 });
        B(k, cxh - 0.36 * g, yTop, czh - 0.36 * g, cxh + 0.36 * g, yTop + 0.16, czh + 0.36 * g, '#5d4037');
        if (winter) B(k, cxh - 0.36 * g, yTop + 0.16, czh - 0.36 * g, cxh + 0.36 * g, yTop + 0.28, czh + 0.36 * g, '#ffffff');
      }
      if (b.style === 'noble' && big) {
        // a little bell tower
        B(k, -0.7, H + rise - 0.2, -hd - 0.7, 0.7, H + rise + 1.6, -hd + 0.7, wallCol, { outline: 0.03 });
        k.add(cone(1.05, 1.5, 4), { at: [0, H + rise + 1.6, -hd], rot: [0, Math.PI / 4, 0], color: roofCol, outline: 0.03 });
        top = H + rise + 3.1;
      }
    }
  }

  // extras by style and role
  styleExtras(k, b, S, fw, fd, H, door, dd, wallCol, roofCol, winter);

  return finish(b, k, { door, dd, H, S }, top);
}

function finish(b, k, info, top) {
  const grp = new THREE.Group();
  const mesh = new THREE.Mesh(k.build(false), vcMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  grp.add(mesh);
  const role = b.role || 'house';
  const icon = ROLE_ICON[role];
  if (info && icon && role !== 'marine_base') {
    // hanging shop sign on a bracket beside the door
    const sx = info.door.x + info.dd.dw / 2 + 0.75;
    const sy = Math.min(info.H - 0.6, info.dd.dh + 0.55);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78), signMaterial(icon));
    sign.position.set(sx, sy, 0.62);
    sign.rotation.y = Math.PI / 2 * 0; // faces the street
    grp.add(sign);
    const bk = new Mesher();
    bk.add(box(0.06, 0.06, 0.7), { at: [sx, sy + 0.42, 0.33], color: '#3e2a1a' });
    bk.add(box(0.02, 0.02, 0.02), { at: [sx, sy + 0.39, 0.62], color: '#3e2a1a' });
    const bm = new THREE.Mesh(bk.build(false), vcMat());
    grp.add(bm);
  }
  if (info && b.name && role !== 'house' && b.fw >= 4) {
    const marine = role === 'marine_base' || b.style === 'marine';
    const nb = nameBoard(b.name, marine);
    const h = marine ? 0.6 : 0.5;
    const w = Math.min(b.fw - 0.6, h * nb.aspect);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, w / nb.aspect), nb.mat);
    board.position.set(0, Math.min(info.H - 0.45, info.dd.dh + 0.75 + (marine ? 0.4 : 0)), 0.1);
    if (board.position.y < info.dd.dh + 0.4) board.position.y = info.dd.dh + 0.4;
    grp.add(board);
  }
  grp.userData.height = top;
  return grp;
}

function wallDetail(k, b, S, fw, fd, H, plinth, storeys, storeyH, wallCol, g) {
  const beam = S.beam || shade(wallCol, -0.5);
  switch (S.wall) {
    case 'timber': {
      // half-timbering: corner posts, floor beams, braces
      for (const sx of [-1, 1]) for (const sz of [0, -fd]) B(k, sx * fw / 2 - 0.12, plinth, sz - 0.12, sx * fw / 2 + 0.12, H, sz + 0.12, beam);
      for (let f = 0; f <= storeys; f++) {
        const y = f === storeys ? H - 0.2 : plinth + f * storeyH;
        B(k, -fw / 2 - 0.02, y, -0.02, fw / 2 + 0.02, y + 0.2, 0.07, beam);
        for (const sx of [-1, 1]) B(k, sx * fw / 2 - 0.07, y, -fd, sx * fw / 2 + 0.02 * sx, y + 0.2, 0, beam);
      }
      if (fw >= 4) {
        for (const sx of [-1, 1]) {
          const x0 = sx * (fw / 2 - 0.1), x1 = sx * (fw / 2 - 1.0 * g);
          const y0 = plinth + 0.2, y1 = plinth + Math.min(storeyH, H - plinth) - 0.1;
          const len = Math.hypot(x1 - x0, y1 - y0);
          k.add(box(0.13, len, 0.06), { at: [x0, y0, 0.03], rot: [0, 0, -Math.atan2(x1 - x0, y1 - y0)], color: beam });
        }
      }
      break;
    }
    case 'log': {
      // horizontal log courses with crossed corners
      const n = Math.floor((H - plinth) / 0.34);
      for (let i = 0; i < n; i++) {
        const y = plinth + i * 0.34 + 0.17;
        const c = i % 2 ? shade(wallCol, -0.1) : wallCol;
        k.add(cyl(0.16, 0.16, fw + 0.5, 6, true), { at: [(fw + 0.5) / 2, y, 0.02], rot: [0, 0, Math.PI / 2], color: c });
        for (const sx of [-1, 1]) k.add(cyl(0.16, 0.16, fd + 0.5, 6, true), { at: [sx * (fw / 2 + 0.02), y, 0.25], rot: [-Math.PI / 2, 0, 0], color: c });
      }
      break;
    }
    case 'brick': {
      // brick courses (mortar lines) and a string course per floor
      const mortar = shade(wallCol, -0.25);
      for (let y = plinth + 0.42; y < H - 0.1; y += 0.42) {
        B(k, -fw / 2 - 0.01, y, -0.01, fw / 2 + 0.01, y + 0.025, 0.012, mortar);
        for (const sx of [-1, 1]) B(k, sx * (fw / 2 + 0.006) - 0.006, y, -fd, sx * (fw / 2 + 0.006) + 0.006, y + 0.025, 0, mortar);
      }
      for (let f = 1; f < storeys; f++) B(k, -fw / 2 - 0.06, plinth + f * storeyH - 0.2, -0.06, fw / 2 + 0.06, plinth + f * storeyH, 0.1, S.trim || shade(wallCol, 0.3));
      for (const sx of [-1, 1]) B(k, sx * fw / 2 - 0.16, plinth, -0.06, sx * fw / 2 + 0.16, H, 0.08, shade(wallCol, -0.12));
      break;
    }
    case 'plaster': {
      // stone quoins at the corners, a string course, a cornice
      const qc = S.trim || shade(wallCol, -0.2);
      if (S.quoins || b.style === 'marine' || b.style === 'noble') {
        for (const sx of [-1, 1]) {
          for (let y = plinth, i = 0; y < H - 0.3; y += 0.45, i++) {
            const w = i % 2 ? 0.35 : 0.55;
            B(k, sx * fw / 2 - (sx > 0 ? w : 0.05), y, -0.05, sx * fw / 2 + (sx > 0 ? 0.05 : w), y + 0.38, 0.05, shade(wallCol, -0.14));
          }
        }
      }
      for (let f = 1; f < storeys; f++) B(k, -fw / 2 - 0.05, plinth + f * storeyH - 0.15, -0.05, fw / 2 + 0.05, plinth + f * storeyH, 0.08, qc);
      if (S.band) B(k, -fw / 2 - 0.04, H - 0.7, -0.04, fw / 2 + 0.04, H - 0.2, 0.08, qc);
      break;
    }
    case 'post': {
      // Wano: dark posts and rails over white plaster, a raised veranda
      const n = Math.max(2, Math.round(fw / 1.3));
      for (let i = 0; i <= n; i++) B(k, -fw / 2 + i * fw / n - 0.08, plinth, -0.02, -fw / 2 + i * fw / n + 0.08, H, 0.08, S.beam);
      for (const sx of [-1, 1]) for (let i = 0; i <= 2; i++) B(k, sx * fw / 2 - 0.08, plinth, -i * fd / 2 - 0.08, sx * fw / 2 + 0.08, H, -i * fd / 2 + 0.08, S.beam);
      for (let f = 0; f < storeys; f++) {
        const y = plinth + f * storeyH + storeyH * 0.45;
        B(k, -fw / 2 - 0.02, y, -0.02, fw / 2 + 0.02, y + 0.14, 0.1, S.beam);
      }
      B(k, -fw / 2 - 0.02, H - 0.25, -0.02, fw / 2 + 0.02, H, 0.1, S.beam);
      break;
    }
    case 'column': {
      // Chinese: red columns and a red lintel along the front
      const n = Math.max(2, Math.round(fw / 1.6));
      for (let i = 0; i <= n; i++) k.add(cyl(0.14, 0.16, H - plinth, 8), { at: [-fw / 2 + i * fw / n, plinth, 0.25], color: '#b03a2e', outline: 0.02 });
      B(k, -fw / 2 - 0.1, H - 0.45, 0.05, fw / 2 + 0.1, H - 0.1, 0.42, '#b03a2e');
      B(k, -fw / 2 - 0.1, H - 0.55, 0.1, fw / 2 + 0.1, H - 0.45, 0.4, '#d4ac0d');
      break;
    }
    case 'adobe': {
      // rounded edges and roof beams poking out (vigas)
      if (S.vigas) for (let x = -fw / 2 + 0.5; x < fw / 2 - 0.3; x += 0.9) k.add(cyl(0.08, 0.08, 0.45, 5), { at: [x, H - 0.45, -0.02], rot: [Math.PI / 2, 0, 0], color: '#6d4c33' });
      B(k, -fw / 2 - 0.05, plinth, -0.05, fw / 2 + 0.05, plinth + 0.25, 0.06, shade(wallCol, -0.1));
      break;
    }
    case 'smooth': {
      if (S.strips) for (let f = 0; f < storeys; f++) B(k, -fw / 2 - 0.02, plinth + f * storeyH + 0.4, -0.02, fw / 2 + 0.02, plinth + f * storeyH + 0.5, 0.05, S.trim, { glow: '#4ff5e0' });
      break;
    }
  }
  if (S.cornice) {
    B(k, -fw / 2 - 0.18, H - 0.3, -fd - 0.18, fw / 2 + 0.18, H - 0.1, 0.18, S.trim || shade(wallCol, 0.25), { outline: 0.02 });
  }
}

function ruinWalls(k, b, fw, fd, H, wallCol) {
  // broken stone walls: the front and sides with jagged tops, rubble
  const stone = C(wallCol);
  const R = (i) => hash(b.x, b.y, i);
  const seg = Math.max(2, Math.round(fw / 1.2));
  for (let i = 0; i < seg; i++) {
    const x0 = -fw / 2 + i * fw / seg, x1 = x0 + fw / seg;
    const h = 0.8 + R(i) * (H - 0.8) * 0.9;
    B(k, x0, -1, -0.45, x1 + 0.01, h, 0, i % 2 ? shade(stone, -0.08) : stone, { outline: 0.03 });
  }
  for (const sx of [-1, 1]) {
    const sseg = Math.max(2, Math.round(fd / 1.2));
    for (let i = 0; i < sseg; i++) {
      const z0 = -i * fd / sseg, z1 = z0 - fd / sseg;
      const h = 0.5 + R(i + sx * 10) * (H - 0.5) * 0.8;
      B(k, sx * fw / 2 - 0.45 * (sx > 0 ? 1 : 0), -1, z1, sx * fw / 2 + 0.45 * (sx > 0 ? 0 : 1), h, z0, stone, { outline: 0.03 });
    }
  }
  for (let i = 0; i < 6; i++) {
    const g = new THREE.IcosahedronGeometry(0.25 + R(i + 40) * 0.25, 0);
    k.add(g, { at: [(R(i + 20) - 0.5) * fw, 0.1, -R(i + 30) * fd], flat: true, color: shade(stone, -0.1), outline: 0.02 });
  }
}

function flatRoof(k, b, S, fw, fd, H, wallCol, roofCol) {
  const hd = fd / 2;
  B(k, -fw / 2 - 0.12, H - 0.05, -fd - 0.12, fw / 2 + 0.12, H + 0.15, 0.12, roofCol, { outline: 0.03 });
  // parapet
  const pc = b.style === 'marine' ? '#f5f6fa' : shade(wallCol, -0.06);
  const ph = 0.45;
  B(k, -fw / 2 - 0.12, H + 0.15, -0.1, fw / 2 + 0.12, H + ph, 0.12, pc);
  B(k, -fw / 2 - 0.12, H + 0.15, -fd - 0.12, fw / 2 + 0.12, H + ph, -fd + 0.1, pc);
  for (const sx of [-1, 1]) B(k, sx * fw / 2 - 0.12, H + 0.15, -fd, sx * fw / 2 + 0.12, H + ph, 0, pc);
  if (b.style === 'desert') {
    // rounded merlons and a dome on bigger houses
    for (let x = -fw / 2 + 0.3; x < fw / 2; x += 0.8) k.add(new THREE.SphereGeometry(0.16, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), { at: [x, H + ph, 0.01], color: pc });
    if (fw >= 4 && fd >= 3) {
      const r = Math.min(fw, fd) * 0.32;
      B(k, -r - 0.1, H + 0.15, -hd - r - 0.1, r + 0.1, H + 0.55, -hd + r + 0.1, shade(wallCol, 0.05));
      domeRoof(k, 0, -hd, H + 0.55, r, 0.95, shade(wallCol, 0.18), 'dome');
      k.add(cyl(0.02, 0.05, 0.5, 4), { at: [0, H + 0.55 + r * 0.95, -hd], color: '#d4ac0d' });
      return 0.55 + r * 0.95 + 0.5;
    }
  }
  if (b.style === 'marine' || b.role === 'marine_base') {
    // a flagpole on the roof
    const fx = fw / 2 - 0.6, fz = -fd + 0.6;
    k.add(cyl(0.04, 0.05, 3, 5), { at: [fx, H + 0.15, fz], color: '#b0bec5' });
  }
  return ph;
}

function pagodaRoofs(k, b, S, fw, fd, H, storeys, storeyH, plinth, wallCol, roofCol) {
  const hd = fd / 2;
  const chinese = b.style === 'chinese';
  const ridgeCol = chinese ? '#d4ac0d' : shade(roofCol, -0.35);
  // skirt roofs between the storeys
  for (let f = 1; f < storeys; f++) {
    const y = plinth + f * storeyH - 0.25;
    curvedRoof(k, 0, -hd, y, fw, fd, 0.55, 0.55, roofCol, { upturn: 0.22, th: 0.14, ridgeCol });
  }
  const rise = Math.min(2.8, Math.max(1.3, fd * 0.5));
  curvedRoof(k, 0, -hd, H - 0.1, fw, fd, rise, 0.75, roofCol, { upturn: chinese ? 0.5 : 0.32, ridgeCol, finCol: chinese ? '#d4ac0d' : '#2b2b2b' });
  let top = rise;
  // palaces and halls get a smaller tower storey on top
  if ((b.role === 'palace' || (b.role === 'hall' && fw >= 7)) && fw >= 6) {
    const tw = fw * 0.5, td = fd * 0.55, y0 = H - 0.1 + rise * 0.55, th = 2.6;
    B(k, -tw / 2, y0, -hd - td / 2, tw / 2, y0 + th, -hd + td / 2, wallCol, { outline: 0.04 });
    for (let i = 0; i <= 3; i++) B(k, -tw / 2 + i * tw / 3 - 0.07, y0, -hd + td / 2 - 0.02, -tw / 2 + i * tw / 3 + 0.07, y0 + th, -hd + td / 2 + 0.06, S.beam || '#3e2723');
    for (let i = 0; i < 3; i++) windowAt(k, b, { win: 'shoji', wall: 'post' }, -tw / 3 + i * tw / 3, y0 + th * 0.55, 0.7, 0.8, -hd + td / 2 + 0.05, lit(b, i + 20), wallCol, false);
    const r2 = Math.min(2.2, td * 0.55);
    curvedRoof(k, 0, -hd, y0 + th - 0.1, tw, td, r2, 0.6, roofCol, { upturn: 0.35, ridgeCol });
    top = y0 + th + r2 - H;
    if (b.role === 'palace') {
      // golden fish on the ridge ends (shachihoko)
      for (const sx of [-1, 1]) k.add(cone(0.14, 0.5, 5), { at: [sx * (tw / 2 - td / 2 * 0.85 + 0.1), y0 + th + r2 - 0.1, -hd], rot: [0, 0, sx * 0.4], color: '#f1c40f', outline: 0.02 });
    }
  }
  return top;
}

function hut(k, b, S, fw, fd, H, wallCol, roofCol) {
  // an elliptical hut with a conical thatched roof and a straw fringe
  const rx = fw / 2, rz = fd / 2;
  const h = Math.max(2.4, Math.min(H * 0.7, 2.6 + (b.hgt || 2) * 0.5));
  k.save(); k.translate(0, 0, -rz); k.scale(1, 1, rz / rx);
  k.add(cyl(rx, rx * 1.03, h + 2, 12, true), { at: [0, -2, 0], color: wallCol, outline: 0.04 });
  // wall bands
  for (let y = 0.5; y < h - 0.2; y += 0.6) k.add(cyl(rx + 0.03, rx + 0.03, 0.08, 12, true), { at: [0, y, 0], color: shade(wallCol, -0.25) });
  const rr = rx + 0.7, rh = rx * 1.15 + 0.8;
  const roof = cone(rr, rh, 14, false, 3);
  const P = roof.attributes.position;
  for (let i = 0; i < P.count; i++) if (Math.abs(P.getY(i)) < 1e-4 && i % 2) P.setY(i, -0.18);
  roof.computeVertexNormals();
  const tmp = new THREE.Color(), rc = C(roofCol), dark = shade(roofCol, -0.25);
  k.add(roof, { at: [0, h - 0.15, 0], color: (p) => tmp.copy(Math.floor((p.y - h) / 0.45) % 2 ? rc : dark), outline: 0.05 });
  k.add(cyl(0.05, 0.1, 0.7, 5), { at: [0, h - 0.15 + rh - 0.1, 0], color: '#6d4c33' });
  k.restore();
  // doorway facing the street
  const dw = 0.95, dh = Math.min(1.9, h - 0.3);
  const s = new THREE.Shape();
  s.moveTo(-dw / 2, 0); s.lineTo(dw / 2, 0); s.lineTo(dw / 2, dh - dw / 2); s.absarc(0, dh - dw / 2, dw / 2, 0, Math.PI, false); s.closePath();
  k.add(new THREE.ShapeGeometry(s, 8), { at: [0, 0.02, 0.06], color: S.door === 'hide' ? '#8d6e4a' : '#3e2a1a' });
  if (S.win === 'round') {
    for (const sx of [-1, 1]) {
      k.add(new THREE.CircleGeometry(0.28, 10), { at: [sx * rx * 0.55, 1.5, -rz * 0.16 + 0.06], rot: [0, sx * 0.55, 0], color: '#2d4150', glow: lit(b, sx + 2) ? WARM : null });
    }
  }
  // totems / mink lantern by the door
  k.add(cyl(0.06, 0.08, 1.6, 5), { at: [dw / 2 + 0.5, 0, 0.35], color: '#6d4c33' });
  k.add(new THREE.SphereGeometry(0.16, 6, 4), { at: [dw / 2 + 0.5, 1.7, 0.35], color: b.style === 'mink' ? '#ffcc80' : '#e67e22', glow: '#ffb74d', flicker: 0.3 });
  return k;
}

function styleExtras(k, b, S, fw, fd, H, door, dd, wallCol, roofCol, winter) {
  const role = b.role || 'house';
  // shop awnings (striped cloth) over the door
  if (['shop', 'market', 'restaurant', 'cafe', 'weapons', 'bar', 'tavern', 'inn'].includes(role) && S.door !== 'noren' && fw >= 3.5) {
    const cols = ['#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6', '#16a085'];
    const c = cols[(b.v || 0) % cols.length];
    const aw = Math.min(fw - 0.6, dd.dw + 2.4), ay = dd.dh + 0.55;
    const n = Math.max(4, Math.round(aw / 0.45));
    for (let i = 0; i < n; i++) {
      const x0 = door.x - aw / 2 + i * aw / n;
      k.add(box(aw / n + 0.005, 0.05, 1.0), { at: [x0 + aw / n / 2, ay, 0.45], rot: [0.42, 0, 0], color: i % 2 ? '#ffffff' : c });
    }
    // scalloped valance
    for (let i = 0; i < n; i++) k.add(new THREE.CylinderGeometry(aw / n / 2, aw / n / 2, 0.04, 8, 1, false, 0, Math.PI), { at: [door.x - aw / 2 + (i + 0.5) * aw / n, ay - 0.42, 0.9], rot: [Math.PI / 2, 0, 0], color: i % 2 ? '#ffffff' : c });
  }
  if (S.engawa) {
    // a raised wooden veranda along the front
    B(k, -fw / 2 - 0.1, -0.5, 0, fw / 2 + 0.1, 0.42, 0.9, '#8d6e4a', { outline: 0.02 });
    for (let x = -fw / 2 + 0.2; x < fw / 2; x += 0.3) B(k, x, 0.42, 0.02, x + 0.02, 0.425, 0.88, '#6d4c33');
    if (Math.abs(door.x) < fw) B(k, door.x - 0.6, -0.3, 0.85, door.x + 0.6, 0.22, 1.3, '#9a948a');
  }
  if (S.lanterns || (b.style === 'wano' && role !== 'house')) {
    // red paper lanterns under the eaves
    for (const sx of [-1, 1]) {
      const x = door.x + sx * (dd.dw / 2 + 0.55);
      if (Math.abs(x) > fw / 2 - 0.2) continue;
      k.add(cyl(0.01, 0.01, 0.35, 3), { at: [x, dd.dh + 0.35, 0.45], color: '#2d3436' });
      k.add(new THREE.SphereGeometry(0.22, 8, 6), { at: [x, dd.dh + 0.2, 0.45], scale: [1, 1.25, 1], color: '#d63a2f', glow: '#ff7043', flicker: 0.25 });
      B(k, x - 0.13, dd.dh + 0.44, 0.33, x + 0.13, dd.dh + 0.48, 0.57, '#2d3436');
      B(k, x - 0.13, dd.dh - 0.08, 0.33, x + 0.13, dd.dh - 0.04, 0.57, '#2d3436');
    }
  }
  if (S.portico && fw >= 5) {
    // columns and a pediment around the door
    const px = door.x, pw = dd.dw + 1.8;
    for (const sx of [-1, 1]) {
      k.add(cyl(0.17, 0.2, dd.dh + 0.9, 10), { at: [px + sx * pw / 2, 0.3, 1.1], color: '#fdfefe', outline: 0.02 });
      B(k, px + sx * pw / 2 - 0.26, 0.1, 0.85, px + sx * pw / 2 + 0.26, 0.32, 1.35, '#ecf0f1');
    }
    B(k, px - pw / 2 - 0.35, dd.dh + 1.2, -0.05, px + pw / 2 + 0.35, dd.dh + 1.45, 1.4, '#fdfefe', { outline: 0.02 });
    k.save(); k.translate(px, dd.dh + 1.45, 0.65); k.rotateY(0);
    k.add(slab([[-pw / 2 - 0.35, 0], [pw / 2 + 0.35, 0], [0, 0.9]], 1.4), { color: S.trim === '#d4ac0d' ? '#fdfefe' : '#fdfefe', outline: 0.02 });
    k.add(slab([[-pw / 2 + 0.1, 0.06], [pw / 2 - 0.1, 0.06], [0, 0.72]], 0.05), { at: [0, 0, 0.71], color: '#d4ac0d' });
    k.restore();
  }
  if (b.role === 'marine_base' || (b.style === 'marine' && fw >= 6)) {
    // the blue MARINE band with the gull, and a gull on the roof edge
    B(k, -fw / 2 - 0.05, H - 1.15, 0.0, fw / 2 + 0.05, H - 0.35, 0.12, '#f5f6fa', { outline: 0.02 });
    B(k, -fw / 2 - 0.06, H - 1.2, 0.0, fw / 2 + 0.06, H - 1.1, 0.13, '#1b4f72');
    B(k, -fw / 2 - 0.06, H - 0.4, 0.0, fw / 2 + 0.06, H - 0.3, 0.13, '#1b4f72');
  }
  if (b.style === 'spooky') {
    // boarded-up planks across a window and a crooked weathervane
    B(k, -fw / 2 + 0.3, 1.4, 0.06, -fw / 2 + 1.4, 1.52, 0.1, '#5d4037', { rot: [0, 0, 0.3] });
  }
  if (b.style === 'port' && role === 'house' && fw >= 4) {
    // crates and a rope coil by the wall
    B(k, fw / 2 - 1.1, 0, 0.1, fw / 2 - 0.3, 0.8, 0.9, '#b08850', { outline: 0.02 });
  }
  if (winter && (b.style !== 'snow')) {
    // snow drifts along the walls
    for (const sx of [-1, 1]) k.add(new THREE.SphereGeometry(0.5, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), { at: [sx * (fw / 2 - 0.2), -0.1, 0.1], scale: [1.4, 0.6, 1], color: '#ffffff' });
  }
}

export { windowMat };
