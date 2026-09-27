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
import { vcMat, bindCtx, STATE } from './props/mats.js';
import { Mesher, box, cyl, cone, lathe, slab, C, shade, hash } from './props/kit.js';
import { CLIMATE } from '../world/tiles.js';
import { doorOf, doorLocalX, windowSlots } from '../world/interiors.js';
import { bw, bangle } from '../world/bframe.js';
import { hollowWalls, rectFrame, shapeFrame, doorLeaf, animateDoor, roomSteps, requestRoom, cancelRoom } from './interiors3d.js';

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
  mink: { wall: 'log', base: '#8d6e63', win: 'round', door: 'plank' },
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

/**
 * A window on a wall; (x, y) its centre, facing +z at `faceZ`. With a `pane`
 * mesher the glass goes there instead (a see-through window over a real hole
 * in the wall), and the frame is a ring rather than a backing board.
 */
function windowAt(k, b, S, x, y, w, h, faceZ, litOn, wallCol, flowers, pane = null) {
  k.save();
  k.translate(x, y, faceZ);
  const frame = S.wall === 'post' ? '#3e2723' : S.wall === 'brick' || S.wall === 'adobe' ? shade(wallCol, 0.35) : shade(wallCol, -0.45);
  const glass = '#2d4150';
  const glow = litOn ? WARM : null;
  const G = pane ? (pane.m.copy(k.m), pane) : k;
  switch (S.win) {
    case 'shoji': {
      if (pane) rectFrame(k, w, h, 0.06, -0.02, 0.06, '#3e2723');
      else B(k, -w / 2 - 0.06, -h / 2 - 0.06, -0.02, w / 2 + 0.06, h / 2 + 0.06, 0.06, '#3e2723');
      B(G, -w / 2, -h / 2, 0, w / 2, h / 2, 0.035, '#f3ead3', { glow: litOn ? '#ffb84d' : null });
      for (let i = 1; i < 3; i++) B(k, -w / 2 + i * w / 3 - 0.015, -h / 2, 0.03, -w / 2 + i * w / 3 + 0.015, h / 2, 0.05, '#5d4037');
      B(k, -w / 2, -0.015, 0.03, w / 2, 0.015, 0.05, '#5d4037');
      break;
    }
    case 'lattice': {
      if (pane) rectFrame(k, w, h, 0.08, -0.02, 0.06, '#8e2b22');
      else B(k, -w / 2 - 0.08, -h / 2 - 0.08, -0.02, w / 2 + 0.08, h / 2 + 0.08, 0.06, '#8e2b22');
      B(G, -w / 2, -h / 2, 0, w / 2, h / 2, 0.035, '#f6ddcc', { glow: litOn ? '#ffab66' : null });
      for (let i = 1; i < 4; i++) B(k, -w / 2 + i * w / 4 - 0.012, -h / 2, 0.03, -w / 2 + i * w / 4 + 0.012, h / 2, 0.05, '#8e2b22');
      for (let i = 1; i < 4; i++) B(k, -w / 2, -h / 2 + i * h / 4 - 0.012, 0.03, w / 2, -h / 2 + i * h / 4 + 0.012, 0.05, '#8e2b22');
      break;
    }
    case 'round': {
      const r = Math.min(w, h) * 0.5;
      k.add(new THREE.TorusGeometry(r, 0.07, 5, 14), { at: [0, 0, 0.03], color: frame });
      G.add(new THREE.CircleGeometry(r, 14), { at: [0, 0, 0.02], color: S.wall === 'smooth' && b.style === 'sky' ? '#bde3ff' : glass, glow });
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
      const sx = (r + 0.09) / r, sy = (h / 2 + 0.09) / (h / 2);
      if (pane) k.add(shapeFrame(s, sx, sy), { at: [0, 0, 0.012], color: frame, double: true, backShade: 0.9 });
      else {
        const out = new THREE.ShapeGeometry(s, 8);
        out.scale(sx, sy, 1);
        k.add(out, { at: [0, 0, 0.012], color: frame });
      }
      G.add(new THREE.ShapeGeometry(s, 8), { at: [0, 0, 0.025], color: S.win === 'gothic' ? '#2a3a2a' : glass, glow: litOn ? (S.win === 'gothic' ? '#b6ff8a' : WARM) : null });
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
      if (pane) rectFrame(k, w, hh, 0.08, -0.02, 0.05, frame);
      else B(k, -w / 2 - 0.08, -hh / 2 - 0.08, -0.02, w / 2 + 0.08, hh / 2 + 0.08, 0.05, frame);
      B(G, -w / 2, -hh / 2, 0, w / 2, hh / 2, 0.06, glass, { glow });
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

/**
 * The front door (with frame, step and style details). For a building you
 * can enter (`y0` = its floor height) only the frame, the steps up and the
 * trimmings are drawn here — the doorway is a real opening and the leaf is
 * its own mesh (see interiors3d.doorLeaf).
 */
function doorAt(k, b, S, x, g, wallCol, big, y0 = null) {
  const dw = (big ? 1.7 : 1.05) * g, dh = (big ? 2.5 : 2.15) * g;
  const wood = doorWood(b, S);
  const frame = S.wall === 'post' ? '#3e2723' : S.wall === 'brick' ? shade(wallCol, 0.4) : shade(wallCol, -0.4);
  const open = y0 !== null;
  const yb = open ? y0 : 0.1; // bottom of the door
  k.save();
  k.translate(x, 0, 0);
  if (open) {
    // steps up to the threshold
    const n = Math.max(1, Math.round(y0 / 0.2));
    for (let i = 0; i < n; i++) {
      const top = y0 - (i + 1) * y0 / (n + 1);
      B(k, -dw / 2 - 0.2 - i * 0.05, -0.3, i * 0.32 - 0.02, dw / 2 + 0.2 + i * 0.05, top, (i + 1) * 0.32, '#9a948a', { outline: 0.02 });
    }
  } else B(k, -dw / 2 - 0.2, -0.3, -0.02, dw / 2 + 0.2, 0.12, 0.45, '#9a948a', { outline: 0.02 });
  switch (S.door) {
    case 'arch': case 'hole': {
      const s = new THREE.Shape();
      const r = dw / 2;
      s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, dh - r); s.absarc(0, dh - r, r, 0, Math.PI, false); s.closePath();
      if (open) k.add(shapeFrame(s, (r + 0.13) / r, (dh + 0.13) / dh), { at: [0, yb, 0.012], color: frame, double: true, backShade: 0.9 });
      else {
        const out = new THREE.ShapeGeometry(s, 10);
        out.scale((r + 0.13) / r, (dh + 0.13) / dh, 1);
        if (S.door !== 'hole') k.add(out, { at: [0, yb, 0.012], color: frame });
        k.add(new THREE.ShapeGeometry(s, 10), { at: [0, yb, 0.03], color: S.door === 'hole' ? '#231f1b' : wood });
        if (S.door !== 'hole') k.add(new THREE.SphereGeometry(0.05, 5, 4), { at: [r * 0.6, yb + dh * 0.45, 0.06], color: '#f1c40f' });
      }
      break;
    }
    case 'noren': {
      if (open) doorFrame(k, dw, dh, yb, 0.12, -0.02, 0.05, '#3e2723');
      else {
        B(k, -dw / 2 - 0.12, yb, -0.02, dw / 2 + 0.12, yb + dh + 0.1, 0.05, '#3e2723');
        B(k, -dw / 2, yb, 0, dw / 2, dh, 0.03, '#2b2420');
      }
      const nc = ['#1f3a68', '#7b1f1f', '#2e5e3a', '#4a2e6b'][(b.v || 0) % 4];
      const top = open ? yb + dh : dh;
      for (let i = 0; i < 3; i++) B(k, -dw / 2 + i * dw / 3 + 0.02, top - 0.75, 0.05, -dw / 2 + (i + 1) * dw / 3 - 0.02, top, 0.08, nc);
      B(k, -dw / 2 - 0.05, top - 0.05, 0.04, dw / 2 + 0.05, top + 0.05, 0.1, '#3e2723');
      break;
    }
    case 'hide': {
      const s = new THREE.Shape();
      s.moveTo(-dw / 2, 0); s.lineTo(dw / 2, 0); s.lineTo(dw * 0.35, dh * 0.8); s.lineTo(0, dh * 0.95); s.lineTo(-dw * 0.35, dh * 0.8); s.closePath();
      k.add(new THREE.ShapeGeometry(s), { at: [0, 0.1, 0.05], color: '#a1784f' });
      break;
    }
    default: {
      if (open) doorFrame(k, dw, dh, yb, 0.14, -0.02, 0.07, frame);
      else {
        B(k, -dw / 2 - 0.14, 0.1, -0.02, dw / 2 + 0.14, dh + 0.16, 0.07, frame, { outline: 0.015 });
        B(k, -dw / 2, 0.1, 0, dw / 2, dh, 0.09, wood);
        if (S.door === 'plank') for (let i = 1; i < 4; i++) B(k, -dw / 2 + i * dw / 4 - 0.012, 0.15, 0.08, -dw / 2 + i * dw / 4 + 0.012, dh - 0.05, 0.1, shade(wood, -0.3));
        else { B(k, -dw / 2 + 0.12, 0.35, 0.08, dw / 2 - 0.12, dh * 0.45, 0.11, shade(wood, 0.12)); B(k, -dw / 2 + 0.12, dh * 0.55, 0.08, dw / 2 - 0.12, dh - 0.15, 0.11, shade(wood, 0.12)); }
        if (big) B(k, -0.012, 0.1, 0.09, 0.012, dh, 0.11, shade(wood, -0.35));
        k.add(new THREE.SphereGeometry(0.05, 5, 4), { at: [dw / 2 - 0.16, 0.1 + dh * 0.47, 0.13], color: '#f1c40f' });
      }
      // a lamp over shop doors
      const top = open ? yb + dh : dh;
      if (b.role && b.role !== 'house') {
        B(k, -0.04, top + 0.25, 0.05, 0.04, top + 0.3, 0.45, '#2d3436');
        k.add(cyl(0.1, 0.13, 0.28, 6), { at: [0, top + 0.02, 0.42], color: '#fff1c4', glow: '#ffcf70', flicker: 0.15 });
        k.add(cone(0.16, 0.12, 6), { at: [0, top + 0.3, 0.42], color: '#2d3436' });
      }
    }
  }
  k.restore();
  return { dw, dh, top: open ? yb + dh : dh };
}

/** Jambs and a lintel round a doorway (the opening itself stays open). */
function doorFrame(k, dw, dh, yb, t, z0, z1, color) {
  B(k, -dw / 2 - t, yb, z0, -dw / 2, yb + dh + t, z1, color, { outline: 0.015 });
  B(k, dw / 2, yb, z0, dw / 2 + t, yb + dh + t, z1, color, { outline: 0.015 });
  B(k, -dw / 2 - t, yb + dh, z0, dw / 2 + t, yb + dh + t, z1, color, { outline: 0.015 });
}

// painted front doors: every house its own colour
const DOOR_PAINT = ['#5a3a22', '#2e5e4e', '#1f4e79', '#7b2d26', '#6d4c33', '#3d5a3a', '#4a3b5c', '#8a5a2b'];
function doorWood(b, S) {
  if (S.door === 'panel' && (b.style === 'marine' || b.role === 'marine_base')) return '#1b4f72';
  if ((b.role || 'house') === 'house' && ['village', 'town', 'port', 'city', 'noble', 'snow', 'spooky'].includes(b.style)) return DOOR_PAINT[Math.floor(hash(b.x, b.y, 5.3) * DOOR_PAINT.length)];
  return b.style === 'noble' ? '#6d3b1f' : '#5a3a22';
}

/** A pitched roof with the ridge along x (gable ends at x = ±hw). */
function gableRoof(k, S, b, hw, hd, y, rise, ov, roofCol, wallCol, snowy, g, ex = () => 0.3) {
  const alpha = Math.atan2(rise, hd);
  // the eaves run past the gable ends — but not into a neighbour's roof
  const oL = ex(-1, 0.3 * g), oR = ex(1, 0.3 * g);
  const L = hw * 2 + oL + oR, xc = (oR - oL) / 2;
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
      if (!ex(sx, 1)) continue;
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
    // (side < 0 is turned half round: its x runs the other way)
    const xs = side < 0 ? -xc : xc;
    k.add(box(L, th, slopeLen), { at: [xs, 0, slopeLen / 2], color: roofCol, outline: 0.05 });
    // tile rows / shingle courses
    if (!snowy) {
      const rows = Math.max(3, Math.round(slopeLen / (0.42 * g)));
      for (let i = 1; i < rows; i++) {
        const z = (i / rows) * slopeLen;
        k.add(box(L, 0.05 * g, 0.07 * g), { at: [xs, th, z], color: shade(roofCol, -0.22) });
      }
    } else {
      // a thick snow blanket with a rounded lip at the eave
      k.add(box(L - 0.1, 0.18 * g, slopeLen - 0.05), { at: [xs, th, slopeLen / 2 + 0.02], color: '#f4f9ff' });
      k.add(cyl(0.13 * g, 0.13 * g, L - 0.1, 7), { at: [xs + (L - 0.1) / 2, th + 0.06, slopeLen], rot: [0, 0, Math.PI / 2], color: '#ffffff' });
    }
    // bargeboards on the gable edges (not where a neighbour's roof carries on)
    for (const sx of [-1, 1]) {
      const world = side < 0 ? -sx : sx;
      if (!ex(world, 1)) continue;
      k.add(box(0.1 * g, th + 0.08, slopeLen), { at: [xs + sx * (L / 2 + 0.03), -0.04, slopeLen / 2], color: shade(roofCol, -0.4) });
    }
    k.restore();
  }
  // ridge cap
  k.add(box(L + (oL ? 0.05 : 0) + (oR ? 0.05 : 0), 0.16 * g, 0.26 * g), { at: [xc + ((oR ? 0.05 : 0) - (oL ? 0.05 : 0)) / 2, y + rise + th * 0.5, zc], color: snowy ? '#ffffff' : shade(roofCol, -0.3), outline: 0.02 });
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
  const grp = buildBuilding0(b, ctx);
  // (built in its own frame, then turned to face its street: see world/bframe.js)
  if (grp) grp.rotation.y = bangle(b);
  return grp;
}

function buildBuilding0(b, ctx) {
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
  // a building you can walk into: its ground floor sits where the game puts
  // your feet (a step up from the street, and above the ground inside)
  const enter = !!b.enterable && S.wall !== 'hut' && rt !== 'hut' && rt !== 'ruin' && S.wall !== 'stone';
  let plinth = 0.35;
  if (enter && ctx?.ground) {
    const mid = bw(b, 0, -fd / 2);
    const rise = ctx.ground(mid.x, mid.y) - ctx.ground(b.x, b.y);
    if (Number.isFinite(rise)) plinth = Math.max(0.35, Math.min(3, rise));
  }
  const H = plinth + 3.0 * g + (storeys - 1) * storeyH;
  const Hc = plinth + (storeys > 1 ? storeyH : 3.0 * g); // the ground floor's ceiling
  const hd = fd / 2;
  const winter = S.snow || (ctx?.world && ctx.world.climate(b.x, b.y - 1) === CLIMATE.WINTER);
  const door = { x: Math.max(-fw / 2 + 0.9, Math.min(fw / 2 - 0.9, doorLocalX(b))) };
  // sides standing against a neighbour (a terrace): nothing may stick out there
  const att = b.attach || {};
  const AL = !!att.left, AR = !!att.right;
  const ex = (sx, d) => ((sx < 0 ? AL : AR) ? 0 : d); // how far a trim may pass the corner on side sx
  const V = variant(b, S, storeys, fw, fd, role);

  // round huts are their own thing
  if (S.wall === 'hut' || rt === 'hut') return finish(b, hut(k, b, S, fw, fd, H, wallCol, roofCol), null, H + fd);

  // foundation (sunk into the ground to hide slopes)
  B(k, -fw / 2 - ex(-1, 0.08), -2.0, -fd - 0.08, fw / 2 + ex(1, 0.08), plinth, 0.08, V.baseCol || baseCol, { outline: 0.03 });

  // walls
  const ruined = rt === 'ruin' || S.wall === 'stone';
  if (ruined) {
    ruinWalls(k, b, fw, fd, H, wallCol);
  } else {
    const lean = S.crooked && !enter ? 0.04 : 0;
    k.save();
    if (lean) k.rotateZ(lean * ((b.v || 0) % 2 ? 1 : -1));
    let holes = null;
    const groundCol = V.groundCol || wallCol; // (some houses stand on a stone or brick ground floor)
    if (enter) {
      // a hollow ground floor with real openings, solid storeys above
      const ops = hollowWalls(k, b, { fw, fd, y0: plinth, top: Hc, wallCol: groundCol });
      if (H > Hc + 0.01) B(k, -fw / 2, Hc, -fd, fw / 2, H, 0, wallCol, { outline: 0.045 });
      holes = holesOf(ops, doorOf(b), plinth);
    } else if (V.groundCol && H > Hc + 0.01) {
      B(k, -fw / 2, plinth - 0.05, -fd, fw / 2, Hc, 0, groundCol, { outline: 0.045 });
      B(k, -fw / 2, Hc, -fd, fw / 2, H, 0, wallCol, { outline: 0.045 });
    } else B(k, -fw / 2, plinth - 0.05, -fd, fw / 2, H, 0, wallCol, { outline: 0.045 });
    wallDetail(k, b, S, fw, fd, H, plinth, storeys, storeyH, wallCol, g, holes, ex);
    if (V.jetty) jetty(k, S, fw, plinth, storeys, storeyH, H, Hc, V.jetty, wallCol, ex);
    k.restore();
  }

  // door and windows (on a walk-in ground floor the glass is its own mesh: see-through up close)
  const dd = doorAt(k, b, S, door.x, g, wallCol, big && fw >= 5, enter ? plinth : null);
  const panes = enter ? new Mesher() : null;
  const winW = 0.85 * g, winH = 1.05 * g;
  let wi = 0;
  for (let f = 0; f < storeys; f++) {
    const y = plinth + f * storeyH + 1.55 * g;
    const pane = f === 0 ? panes : null;
    const W = windowSlots(b, f);
    const jz = f > 0 && V.jetty ? V.jetty : 0; // (upper floors of a jettied house stand out)
    W.front.forEach((x, i) => {
      if (f > 0 && V.balcony && Math.abs(x - V.balcony.x) < V.balcony.w / 2 + 0.3 && f === 1) return; // (the balcony door is there)
      const flowers = (S.flowers || V.flowers) && (i + f + (b.v || 0)) % 2 === 0;
      windowAt(k, b, S, x, y, winW, winH, jz, lit(b, wi++), wallCol, flowers, pane);
    });
    for (const sx of [-1, 1]) {
      for (const z of W[sx < 0 ? 'left' : 'right']) {
        k.save(); k.translate(sx * fw / 2, 0, z); k.rotateY(sx * Math.PI / 2);
        windowAt(k, b, S, 0, y, winW, winH, 0.0, lit(b, wi++), wallCol, false, pane);
        k.restore();
      }
    }
  }
  if (V.balcony) balcony(k, b, S, V.balcony, plinth + storeyH, wallCol, lit(b, wi++));
  // (a balcony over the door already keeps the rain off it)
  if (V.canopy && !(V.balcony && Math.abs(V.balcony.x - door.x) < (V.balcony.w + dd.dw + 0.9) / 2)) canopy(k, door, dd, V.canopy, roofCol);

  // roof
  let top = H;
  if (!ruined) {
    if (rt === 'flat') top += flatRoof(k, b, S, fw, fd, H, wallCol, roofCol, ex);
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
      const rise = Math.min(3.6 * g, Math.max(1.2, fd * (S.crooked ? 0.62 : 0.45) * V.pitch));
      top += gableRoof(k, S, b, fw / 2, hd, H, rise, 0.4 * g, roofCol, wallCol, winter, g, ex);
      if (V.dormers) dormers(k, b, S, fw, hd, H, rise, 0.4 * g, V.dormers, roofCol, wallCol, winter, lit(b, 30));
      // chimney
      if ((b.style === 'village' || b.style === 'snow' || b.style === 'town' || b.style === 'giant' || b.style === 'port' || b.style === 'city') && fw >= 4 && V.chimney) {
        const cxh = V.chimney * (fw / 2 - 0.9 * g), czh = -hd - hd * 0.35;
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
  styleExtras(k, b, S, fw, fd, H, door, dd, wallCol, roofCol, winter, ex);

  const grp = finish(b, k, { door, dd, H, S }, top);
  if (enter) walkIn(grp, b, S, { fw, fd, y0: plinth, ceil: Hc - plinth, panes });
  return grp;
}

// glass on walk-in ground floors: dark from afar, see-through near enough to look in
const GLASS_CLEAR = vcMat({ transparent: true, opacity: 0.22, depthWrite: false });

/** The door leaf, the window glass and (when you're near) the furnished room. */
function walkIn(grp, b, S, o) {
  const leaf = doorLeaf(b, { y0: o.y0, wood: doorWood(b, S) });
  grp.add(leaf);
  let glass = null;
  if (o.panes && o.panes.vertexCount) {
    glass = new THREE.Mesh(o.panes.build(false), vcMat());
    glass.renderOrder = 2;
    grp.add(glass);
  }
  const st = { room: null, t: performance.now() };
  grp.userData.update = (obj, env, ctx) => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - st.t) / 1000);
    st.t = now;
    animateDoor(leaf, b, dt);
    const p = ctx?.game?.player, w = ctx?.world;
    if (!p || !w) return;
    const c = bw(b, 0, -o.fd / 2);
    const d = w.distance(p.x, p.y, c.x, c.y);
    if (!st.room && d < 26) {
      requestRoom(st, d, () => roomSteps(b, o), (room) => {
        if (st.room || (!grp.parent && !grp.userData.pendingAdd)) { room.geometry.dispose(); return; } // (already has one, or the building's gone)
        st.room = room;
        grp.add(room);
        if (glass) glass.material = GLASS_CLEAR;
      });
    } else if (!st.room) cancelRoom(st);
    else if (d > 36) {
      grp.remove(st.room);
      st.room.geometry.dispose();
      st.room = null;
      if (glass) glass.material = vcMat();
    }
  };
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
    let sx = info.door.x + info.dd.dw / 2 + 0.75;
    if (sx > b.fw / 2 - 0.5) sx = info.door.x - info.dd.dw / 2 - 0.75; // (the other side of the door, if it'd hang off the corner)
    const sy = Math.min(info.H - 0.6, info.dd.top + 0.55);
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
    board.position.set(0, Math.min(info.H - 0.45, info.dd.top + 0.75 + (marine ? 0.4 : 0)), 0.1);
    if (board.position.y < info.dd.top + 0.4) board.position.y = info.dd.top + 0.4;
    grp.add(board);
  }
  grp.userData.height = top;
  return grp;
}

/**
 * Timbers, brick courses, rails and trims on the outside of the walls. With
 * `holes` (a building you can walk into) the horizontal bands are cut round
 * the doorway and the windows, and posts that would cross an opening are left
 * out. holes = { front: [{ a0, a1, y0, y1 }], left: [...], right: [...] } (a along the wall).
 */
function wallDetail(k, b, S, fw, fd, H, plinth, storeys, storeyH, wallCol, g, holes = null, ex = (sx, d) => d) {
  // (on a side against a neighbour, trims stop at the corner and side-wall detail is left off)
  const free = (sx) => ex(sx, 1) > 0;
  const xl = (d) => -fw / 2 - ex(-1, d), xr = (d) => fw / 2 + ex(1, d);
  const beam = S.beam || shade(wallCol, -0.5);
  const HF = holes?.front || [], HS = { [-1]: holes?.left || [], [1]: holes?.right || [] };
  const segs = (a0, a1, y0, y1, list) => {
    let parts = [[Math.min(a0, a1), Math.max(a0, a1)]];
    for (const o of list) {
      if (o.y1 <= y0 || o.y0 >= y1) continue;
      const next = [];
      for (const [p, q] of parts) {
        if (o.a1 <= p || o.a0 >= q) { next.push([p, q]); continue; }
        if (o.a0 > p) next.push([p, o.a0]);
        if (o.a1 < q) next.push([o.a1, q]);
      }
      parts = next;
    }
    return parts.filter(([p, q]) => q - p > 0.02);
  };
  // a band along the front (x0..x1) / along a side wall (z0..z1), cut round the openings
  const FB = (x0, y0, z0, x1, y1, z1, col, o) => { for (const [p, q] of segs(x0, x1, y0, y1, HF)) B(k, p, y0, z0, q, y1, z1, col, o); };
  const SB = (sx, xa, y0, za, xb, y1, zb, col, o) => { for (const [p, q] of segs(za, zb, y0, y1, HS[sx])) B(k, xa, y0, p, xb, y1, q, col, o); };
  const crosses = (x, y0, y1, pad = 0.12) => HF.some((o) => x > o.a0 - pad && x < o.a1 + pad && y1 > o.y0 && y0 < o.y1);
  const crossesSide = (sx, z, y0, y1, pad = 0.12) => HS[sx].some((o) => z > o.a0 - pad && z < o.a1 + pad && y1 > o.y0 && y0 < o.y1);
  switch (S.wall) {
    case 'timber': {
      // half-timbering: corner posts, floor beams, braces
      // corner posts (half a post each where two houses share the corner)
      for (const sx of [-1, 1]) for (const sz of [0, -fd]) {
        const inner = sx * fw / 2 - sx * 0.12, outer = sx * fw / 2 + sx * ex(sx, 0.12);
        B(k, Math.min(inner, outer), plinth, sz - 0.12, Math.max(inner, outer), H, sz + 0.12, beam);
      }
      for (let f = 0; f <= storeys; f++) {
        const y = f === storeys ? H - 0.2 : plinth + f * storeyH;
        FB(xl(0.02), y, -0.02, xr(0.02), y + 0.2, 0.07, beam);
        for (const sx of [-1, 1]) if (free(sx)) SB(sx, sx * fw / 2 - 0.07, y, -fd, sx * fw / 2 + 0.02 * sx, y + 0.2, 0, beam);
      }
      if (fw >= 4) {
        for (const sx of [-1, 1]) {
          const x0 = sx * (fw / 2 - 0.1), x1 = sx * (fw / 2 - 1.0 * g);
          const y0 = plinth + 0.2, y1 = plinth + Math.min(storeyH, H - plinth) - 0.1;
          if (crosses(x0, y0, y1, 0.05) || crosses(x1, y0, y1, 0.05) || crosses((x0 + x1) / 2, y0, y1, 0.05)) continue;
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
        for (const [p, q] of segs(xl(0.25), xr(0.25), y - 0.16, y + 0.16, HF)) k.add(cyl(0.16, 0.16, q - p, 6, true), { at: [q, y, 0.02], rot: [0, 0, Math.PI / 2], color: c });
        for (const sx of [-1, 1]) {
          if (!free(sx)) continue;
          for (const [p, q] of segs(-fd - 0.25, 0.25, y - 0.16, y + 0.16, HS[sx])) k.add(cyl(0.16, 0.16, q - p, 6, true), { at: [sx * (fw / 2 + 0.02), y, q], rot: [-Math.PI / 2, 0, 0], color: c });
        }
      }
      break;
    }
    case 'brick': {
      // brick courses (mortar lines) and a string course per floor
      const mortar = shade(wallCol, -0.25);
      for (let y = plinth + 0.42; y < H - 0.1; y += 0.42) {
        FB(xl(0.01), y, -0.01, xr(0.01), y + 0.025, 0.012, mortar);
        for (const sx of [-1, 1]) if (free(sx)) SB(sx, sx * (fw / 2 + 0.006) - 0.006, y, -fd, sx * (fw / 2 + 0.006) + 0.006, y + 0.025, 0, mortar);
      }
      for (let f = 1; f < storeys; f++) FB(xl(0.06), plinth + f * storeyH - 0.2, -0.06, xr(0.06), plinth + f * storeyH, 0.1, S.trim || shade(wallCol, 0.3));
      // corner piers (a half pier where the next house carries on)
      for (const sx of [-1, 1]) {
        const inner = sx * fw / 2 - sx * 0.16, outer = sx * fw / 2 + sx * ex(sx, 0.16);
        B(k, Math.min(inner, outer), plinth, -0.06, Math.max(inner, outer), H, 0.08, shade(wallCol, -0.12));
      }
      break;
    }
    case 'plaster': {
      // stone quoins at the corners, a string course, a cornice
      const qc = S.trim || shade(wallCol, -0.2);
      if (S.quoins || b.style === 'marine' || b.style === 'noble') {
        for (const sx of [-1, 1]) {
          if (!free(sx)) continue; // (a shared wall has no corner)
          for (let y = plinth, i = 0; y < H - 0.3; y += 0.45, i++) {
            const w = i % 2 ? 0.35 : 0.55;
            B(k, sx * fw / 2 - (sx > 0 ? w : 0.05), y, -0.05, sx * fw / 2 + (sx > 0 ? 0.05 : w), y + 0.38, 0.05, shade(wallCol, -0.14));
          }
        }
      }
      for (let f = 1; f < storeys; f++) FB(xl(0.05), plinth + f * storeyH - 0.15, -0.05, xr(0.05), plinth + f * storeyH, 0.08, qc);
      if (S.band) FB(xl(0.04), H - 0.7, -0.04, xr(0.04), H - 0.2, 0.08, qc);
      break;
    }
    case 'post': {
      // Wano: dark posts and rails over white plaster, a raised veranda
      const n = Math.max(2, Math.round(fw / 1.3));
      for (let i = 0; i <= n; i++) {
        const x = -fw / 2 + i * fw / n;
        if (crosses(x, plinth, H, 0.1)) continue;
        B(k, x - 0.08, plinth, -0.02, x + 0.08, H, 0.08, S.beam);
      }
      for (const sx of [-1, 1]) for (let i = 0; i <= 2; i++) {
        if (!free(sx) || crossesSide(sx, -i * fd / 2, plinth, H, 0.1)) continue;
        B(k, sx * fw / 2 - 0.08, plinth, -i * fd / 2 - 0.08, sx * fw / 2 + 0.08, H, -i * fd / 2 + 0.08, S.beam);
      }
      for (let f = 0; f < storeys; f++) {
        const y = plinth + f * storeyH + storeyH * 0.45;
        FB(xl(0.02), y, -0.02, xr(0.02), y + 0.14, 0.1, S.beam);
      }
      B(k, xl(0.02), H - 0.25, -0.02, xr(0.02), H, 0.1, S.beam);
      break;
    }
    case 'column': {
      // Chinese: red columns and a red lintel along the front
      const n = Math.max(2, Math.round(fw / 1.6));
      for (let i = 0; i <= n; i++) {
        const x = -fw / 2 + i * fw / n;
        if (holes && crosses(x, plinth, plinth + 1.9, 0.3) && HF[0] && x > HF[0].a0 - 0.3 && x < HF[0].a1 + 0.3) continue; // not in the doorway
        k.add(cyl(0.14, 0.16, H - plinth, 8), { at: [x, plinth, 0.25], color: '#b03a2e', outline: 0.02 });
      }
      B(k, xl(0.1), H - 0.45, 0.05, xr(0.1), H - 0.1, 0.42, '#b03a2e');
      B(k, xl(0.1), H - 0.55, 0.1, xr(0.1), H - 0.45, 0.4, '#d4ac0d');
      break;
    }
    case 'adobe': {
      // rounded edges and roof beams poking out (vigas)
      if (S.vigas) for (let x = -fw / 2 + 0.5; x < fw / 2 - 0.3; x += 0.9) k.add(cyl(0.08, 0.08, 0.45, 5), { at: [x, H - 0.45, -0.02], rot: [Math.PI / 2, 0, 0], color: '#6d4c33' });
      FB(xl(0.05), plinth, -0.05, xr(0.05), plinth + 0.25, 0.06, shade(wallCol, -0.1));
      break;
    }
    case 'smooth': {
      if (S.strips) for (let f = 0; f < storeys; f++) FB(xl(0.02), plinth + f * storeyH + 0.4, -0.02, xr(0.02), plinth + f * storeyH + 0.5, 0.05, S.trim, { glow: '#4ff5e0' });
      break;
    }
  }
  if (S.cornice) {
    B(k, xl(0.18), H - 0.3, -fd - 0.18, xr(0.18), H - 0.1, 0.18, S.trim || shade(wallCol, 0.25), { outline: 0.02 });
  }
}

/** Openings of a walk-in ground floor as wall bands see them (see wallDetail). */
function holesOf(ops, d, y0) {
  const pad = 0.03;
  const win = (w) => ({ a0: w.u - w.w / 2 - pad, a1: w.u + w.w / 2 + pad, y0: w.y - w.h / 2 - pad, y1: w.y + w.h / 2 + (w.kind === 'gothic' ? w.w * 0.18 : 0) + pad });
  return {
    front: [{ a0: d.x - d.dw / 2 - pad, a1: d.x + d.dw / 2 + pad, y0: -10, y1: y0 + d.dh + pad }, ...ops.front.map(win)],
    left: ops.left.map(win),
    right: ops.right.map(win),
  };
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

function flatRoof(k, b, S, fw, fd, H, wallCol, roofCol, ex = (sx, d) => d) {
  const hd = fd / 2;
  const xl = -fw / 2 - ex(-1, 0.12), xr = fw / 2 + ex(1, 0.12);
  B(k, xl, H - 0.05, -fd - 0.12, xr, H + 0.15, 0.12, roofCol, { outline: 0.03 });
  // parapet (none along a shared wall)
  const pc = b.style === 'marine' ? '#f5f6fa' : shade(wallCol, -0.06);
  const ph = 0.45;
  B(k, xl, H + 0.15, -0.1, xr, H + ph, 0.12, pc);
  B(k, xl, H + 0.15, -fd - 0.12, xr, H + ph, -fd + 0.1, pc);
  for (const sx of [-1, 1]) if (ex(sx, 1)) B(k, sx * fw / 2 - 0.12, H + 0.15, -fd, sx * fw / 2 + 0.12, H + ph, 0, pc);
  if (b.style === 'desert') {
    // rounded merlons and a dome on bigger houses
    for (let x = -fw / 2 + 0.3; x < fw / 2 - 0.15; x += 0.8) k.add(new THREE.SphereGeometry(0.16, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), { at: [x, H + ph, 0.01], color: pc });
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
  // thatch in three stepped tiers, each one shade, with a ragged straw fringe
  // (each tier has the same slope and starts a little way up the one below,
  // so its rim stands just proud of it and the tips stay hidden)
  const dark = shade(roofCol, -0.18);
  let y0 = h - 0.15, R = rr, Hh = rh;
  for (let i = 0; i < 3; i++) {
    const roof = cone(R, Hh, 14, false, 1);
    const P = roof.attributes.position;
    for (let j = 0; j < P.count; j++) if (Math.abs(P.getY(j)) < 1e-4 && j % 2) P.setY(j, -0.16);
    roof.computeVertexNormals();
    k.add(roof, { at: [0, y0, 0], color: i % 2 ? dark : roofCol, outline: i ? 0.03 : 0.05 });
    const up = Hh * 0.32;
    y0 += up; R *= 0.7; Hh = R * (rh / rr);
  }
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

// ---------------------------------------------------------------- one of a kind
/**
 * What makes this house its own (seeded from where it stands, so it's always
 * built the same): the pitch of its roof, a chimney (and which end), upper
 * floors jutting out over the street, a balcony, a little roof over the front
 * door, dormers, window boxes, a stone ground floor.
 */
function variant(b, S, storeys, fw, fd, role) {
  const R = (i) => hash(b.x, b.y, i + 0.71);
  const house = role === 'house';
  const V = { pitch: 0.82 + R(1) * 0.4, chimney: R(2) < 0.8 ? (R(3) < 0.5 ? -1 : 1) : 0 };
  if (house && storeys >= 2 && (S.wall === 'timber' || S.wall === 'log') && R(4) < 0.55) V.jetty = 0.32;
  if (house && storeys >= 2 && ['plaster', 'brick', 'adobe', 'smooth'].includes(S.wall) && fw >= 4.5 && R(5) < 0.45) {
    const w = Math.min(fw - 1.4, 1.5 + R(6) * 1.2);
    V.balcony = { x: (R(7) - 0.5) * Math.max(0, fw - w - 1.4), w, d: 0.72 };
  }
  if (house && R(8) < 0.55 && S.door !== 'noren' && S.door !== 'arch' && S.wall !== 'hut') V.canopy = { d: 0.62 + R(9) * 0.25, kind: R(10) < 0.5 ? 'gable' : 'lean' };
  if (fw >= 5 && fd >= 4 && R(11) < 0.4) V.dormers = fw >= 7.5 ? 2 : 1;
  if (R(12) < 0.3) V.flowers = true;
  if (storeys >= 2 && (S.wall === 'timber' || S.wall === 'plaster') && R(13) < 0.35) V.groundCol = R(14) < 0.5 ? '#b3aa9c' : '#a0634a';
  return V;
}

/** Upper storeys jutting out over the front on a timber floor beam and brackets. */
function jetty(k, S, fw, plinth, storeys, storeyH, H, Hc, j, wallCol, ex) {
  const beam = S.beam || shade(wallCol, -0.5);
  B(k, -fw / 2, Hc, 0, fw / 2, H, j, wallCol, { outline: 0.04 });
  B(k, -fw / 2 - ex(-1, 0.03), Hc - 0.2, -0.02, fw / 2 + ex(1, 0.03), Hc + 0.04, j + 0.07, beam);
  for (let x = -fw / 2 + 0.35; x < fw / 2 - 0.2; x += 1.15) k.add(box(0.1, 0.5, 0.1), { at: [x, Hc - 0.62, 0.06], rot: [0.55, 0, 0], color: beam });
  for (const sx of [-1, 1]) {
    const inner = sx * fw / 2 - sx * 0.12, outer = sx * fw / 2 + sx * ex(sx, 0.02);
    B(k, Math.min(inner, outer), Hc, j - 0.1, Math.max(inner, outer), H, j + 0.04, beam);
  }
  for (let f = 1; f <= storeys; f++) {
    const y = f === storeys ? H - 0.2 : plinth + f * storeyH;
    if (y <= Hc + 0.05) continue;
    B(k, -fw / 2, y, j - 0.02, fw / 2, y + 0.18, j + 0.05, beam);
  }
}

/** A first-floor balcony: a slab on brackets, a railing, and French windows behind. */
function balcony(k, b, S, V, y, wallCol, litOn) {
  const { x, w, d } = V;
  const rail = S.wall === 'adobe' ? '#6d4c33' : S.wall === 'brick' ? '#2d3436' : shade(wallCol, -0.55);
  B(k, x - w / 2, y - 0.12, 0, x + w / 2, y + 0.03, d, shade(wallCol, -0.18), { outline: 0.02 });
  for (const sx of [-1, 1]) k.add(box(0.09, 0.5, 0.09), { at: [x + sx * (w / 2 - 0.18), y - 0.6, 0.05], rot: [0.6, 0, 0], color: shade(wallCol, -0.3) });
  const rh = 0.9;
  B(k, x - w / 2, y + rh - 0.05, d - 0.07, x + w / 2, y + rh, d, rail);
  for (const sx of [-1, 1]) B(k, x + sx * w / 2 - (sx > 0 ? 0.05 : 0), y + rh - 0.05, 0.02, x + sx * w / 2 + (sx > 0 ? 0 : 0.05), y + rh, d, rail);
  for (let px = x - w / 2 + 0.06; px <= x + w / 2 - 0.02; px += 0.16) B(k, px - 0.015, y + 0.03, d - 0.05, px + 0.015, y + rh - 0.05, d - 0.02, rail);
  for (const sx of [-1, 1]) for (let pz = 0.12; pz < d - 0.05; pz += 0.16) B(k, x + sx * (w / 2 - 0.025) - 0.015, y + 0.03, pz - 0.015, x + sx * (w / 2 - 0.025) + 0.015, y + rh - 0.05, pz + 0.015, rail);
  // French windows onto it
  const ww = Math.min(1.1, w - 0.5), wh = 1.95;
  const frame = S.wall === 'brick' || S.wall === 'adobe' ? shade(wallCol, 0.35) : shade(wallCol, -0.45);
  B(k, x - ww / 2 - 0.08, y + 0.03, -0.02, x + ww / 2 + 0.08, y + wh + 0.08, 0.05, frame);
  B(k, x - ww / 2, y + 0.06, 0, x + ww / 2, y + wh, 0.06, '#2d4150', { glow: litOn ? WARM : null });
  B(k, x - 0.02, y + 0.06, 0.05, x + 0.02, y + wh, 0.08, frame);
}

/** A little roof over the front door: a lean-to board on brackets, or a tiny gable. */
function canopy(k, door, dd, C, roofCol) {
  const w = dd.dw + 0.75, y = dd.top + 0.22, d = C.d;
  const col = shade(roofCol, 0.04), wood = '#5a3a22';
  if (C.kind === 'lean') {
    k.save(); k.translate(door.x, y, 0); k.rotateX(0.3);
    k.add(box(w, 0.07, d), { at: [0, 0, d / 2], color: col, outline: 0.02 });
    k.restore();
  } else {
    k.save(); k.translate(door.x, y, d / 2);
    k.add(slab([[-w / 2, 0], [w / 2, 0], [0, 0.34]], d), { color: col, outline: 0.02 });
    k.restore();
    B(k, door.x - w / 2, y - 0.05, 0, door.x + w / 2, y, d, wood);
  }
  for (const sx of [-1, 1]) k.add(box(0.07, 0.42, 0.07), { at: [door.x + sx * (w / 2 - 0.12), y - 0.46, 0.04], rot: [0.75, 0, 0], color: wood });
}

/** Gabled dormer windows standing out of the front slope of the roof. */
function dormers(k, b, S, fw, hd, H, rise, ov, n, roofCol, wallCol, snowy, litOn) {
  const t = 0.3; // how far up the slope (0 eave … 1 ridge)
  const zf = -hd * t, yb = H + rise * t - 0.12, dw = 1.0, dh = 0.92, dep = Math.min(1.35, hd * 0.9), rr = 0.4;
  // only where the dormer (and its little roof) stays under the ridge
  if (rise * (1 - t) < dh + rr - 0.12 + 0.15) return;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (i ? 1 : -1) * fw * 0.24;
    B(k, x - dw / 2, yb, zf - dep, x + dw / 2, yb + dh, zf, wallCol, { outline: 0.03 });
    windowAt(k, b, { ...S, shutters: false }, x, yb + dh * 0.54, 0.52, 0.55, zf, litOn && i === 0, wallCol, false);
    k.save(); k.translate(x, yb + dh, zf - dep / 2 + 0.12);
    k.add(slab([[-dw / 2 - 0.14, 0], [dw / 2 + 0.14, 0], [0, rr]], dep + 0.25), { color: snowy ? '#f4f9ff' : roofCol, outline: 0.03 });
    k.restore();
  }
}

function styleExtras(k, b, S, fw, fd, H, door, dd, wallCol, roofCol, winter, ex = (sx, d) => d) {
  const role = b.role || 'house';
  const clearOfDoor = (x0, x1) => x1 < door.x - dd.dw / 2 - 0.25 || x0 > door.x + dd.dw / 2 + 0.25;
  // shop awnings (striped cloth) over the door
  if (['shop', 'market', 'restaurant', 'cafe', 'weapons', 'bar', 'tavern', 'inn'].includes(role) && S.door !== 'noren' && fw >= 3.5) {
    const cols = ['#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6', '#16a085'];
    const c = cols[(b.v || 0) % cols.length];
    const aw = Math.min(fw - 0.6, dd.dw + 2.4), ay = dd.top + 0.55;
    const n = Math.max(4, Math.round(aw / 0.45));
    for (let i = 0; i < n; i++) {
      const x0 = door.x - aw / 2 + i * aw / n;
      k.add(box(aw / n + 0.005, 0.05, 1.0), { at: [x0 + aw / n / 2, ay, 0.45], rot: [0.42, 0, 0], color: i % 2 ? '#ffffff' : c });
    }
    // scalloped valance
    for (let i = 0; i < n; i++) k.add(new THREE.CircleGeometry(aw / n / 2, 8, Math.PI, Math.PI), { at: [door.x - aw / 2 + (i + 0.5) * aw / n, ay - 0.4, 0.92], rot: [-0.42, 0, 0], color: i % 2 ? '#ffffff' : c, double: true, backShade: 0.85 });
  }
  if (S.engawa) {
    // a raised wooden veranda along the front
    B(k, -fw / 2 - ex(-1, 0.1), -0.5, 0, fw / 2 + ex(1, 0.1), 0.42, 0.9, '#8d6e4a', { outline: 0.02 });
    for (let x = -fw / 2 + 0.2; x < fw / 2; x += 0.3) B(k, x, 0.42, 0.02, x + 0.02, 0.425, 0.88, '#6d4c33');
    if (Math.abs(door.x) < fw) B(k, door.x - 0.6, -0.3, 0.85, door.x + 0.6, 0.22, 1.3, '#9a948a');
  }
  if (S.lanterns || (b.style === 'wano' && role !== 'house')) {
    // red paper lanterns under the eaves
    for (const sx of [-1, 1]) {
      const x = door.x + sx * (dd.dw / 2 + 0.55);
      if (Math.abs(x) > fw / 2 - 0.2) continue;
      k.add(cyl(0.01, 0.01, 0.35, 3), { at: [x, dd.top + 0.35, 0.45], color: '#2d3436' });
      k.add(new THREE.SphereGeometry(0.22, 8, 6), { at: [x, dd.top + 0.2, 0.45], scale: [1, 1.25, 1], color: '#d63a2f', glow: '#ff7043', flicker: 0.25 });
      B(k, x - 0.13, dd.top + 0.44, 0.33, x + 0.13, dd.top + 0.48, 0.57, '#2d3436');
      B(k, x - 0.13, dd.top - 0.08, 0.33, x + 0.13, dd.top - 0.04, 0.57, '#2d3436');
    }
  }
  if (S.portico && fw >= 6 && role !== 'house' && Math.abs(door.x) + (dd.dw + 1.8) / 2 + 0.5 < fw / 2) {
    // columns and a pediment around the door (grand buildings only)
    const px = door.x, pw = dd.dw + 1.8;
    for (const sx of [-1, 1]) {
      k.add(cyl(0.17, 0.2, dd.top + 0.9, 10), { at: [px + sx * pw / 2, 0.3, 1.1], color: '#fdfefe', outline: 0.02 });
      B(k, px + sx * pw / 2 - 0.26, 0.1, 0.85, px + sx * pw / 2 + 0.26, 0.32, 1.35, '#ecf0f1');
    }
    B(k, px - pw / 2 - 0.35, dd.top + 1.2, -0.05, px + pw / 2 + 0.35, dd.top + 1.45, 1.4, '#fdfefe', { outline: 0.02 });
    k.save(); k.translate(px, dd.top + 1.45, 0.65); k.rotateY(0);
    k.add(slab([[-pw / 2 - 0.35, 0], [pw / 2 + 0.35, 0], [0, 0.9]], 1.4), { color: S.trim === '#d4ac0d' ? '#fdfefe' : '#fdfefe', outline: 0.02 });
    k.add(slab([[-pw / 2 + 0.1, 0.06], [pw / 2 - 0.1, 0.06], [0, 0.72]], 0.05), { at: [0, 0, 0.71], color: '#d4ac0d' });
    k.restore();
  }
  if (b.role === 'marine_base' || (b.style === 'marine' && fw >= 6)) {
    // the blue MARINE band with the gull, and a gull on the roof edge
    B(k, -fw / 2 - ex(-1, 0.05), H - 1.15, 0.0, fw / 2 + ex(1, 0.05), H - 0.35, 0.12, '#f5f6fa', { outline: 0.02 });
    B(k, -fw / 2 - ex(-1, 0.06), H - 1.2, 0.0, fw / 2 + ex(1, 0.06), H - 1.1, 0.13, '#1b4f72');
    B(k, -fw / 2 - ex(-1, 0.06), H - 0.4, 0.0, fw / 2 + ex(1, 0.06), H - 0.3, 0.13, '#1b4f72');
  }
  if (b.style === 'spooky') {
    // boarded-up planks across a window and a crooked weathervane
    if (clearOfDoor(-fw / 2 + 0.3, -fw / 2 + 1.4)) B(k, -fw / 2 + 0.3, 1.4, 0.06, -fw / 2 + 1.4, 1.52, 0.1, '#5d4037', { rot: [0, 0, 0.3] });
  }
  if (b.style === 'port' && role === 'house' && fw >= 4) {
    // a crate by the wall (not in front of the door)
    const sx = door.x > 0 ? -1 : 1;
    const x0 = sx > 0 ? fw / 2 - 1.1 : -fw / 2 + 0.3, x1 = x0 + 0.8;
    if (clearOfDoor(x0, x1)) B(k, x0, 0, 0.1, x1, 0.8, 0.9, '#b08850', { outline: 0.02 });
  }
  if (b.pirate) {
    // a crude Jolly Roger nailed over the door: pirates live here
    const x = door.x, y = dd.top + 0.14;
    B(k, x - 0.42, y, 0.04, x + 0.42, y + 0.56, 0.07, '#141414', { outline: 0.01 });
    k.add(new THREE.SphereGeometry(0.12, 8, 6), { at: [x, y + 0.33, 0.08], scale: [1, 0.95, 0.35], color: '#f5f5f5' });
    B(k, x - 0.07, y + 0.19, 0.07, x + 0.07, y + 0.25, 0.1, '#f5f5f5');
    for (const sx of [-1, 1]) k.add(box(0.46, 0.045, 0.02), { at: [x, y + 0.1, 0.085], rot: [0, 0, sx * 0.62], color: '#f5f5f5' });
    for (const sx of [-1, 1]) B(k, x + sx * 0.045 - 0.025, y + 0.32, 0.115, x + sx * 0.045 + 0.025, y + 0.37, 0.12, '#141414');
  }
  if (winter && (b.style !== 'snow')) {
    // snow drifts along the walls
    for (const sx of [-1, 1]) if (ex(sx, 1) && clearOfDoor(sx * (fw / 2 - 0.2) - 0.7, sx * (fw / 2 - 0.2) + 0.7)) k.add(new THREE.SphereGeometry(0.5, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), { at: [sx * (fw / 2 - 0.2), -0.1, 0.1], scale: [1.4, 0.6, 1], color: '#ffffff' });
  }
}

export { windowMat };
