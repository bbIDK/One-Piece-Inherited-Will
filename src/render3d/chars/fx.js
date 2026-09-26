// Per-character extras in 3D: floating name labels with NPC health bars,
// quest markers ('!' gold, '?' blue), buff auras (flickering flame
// silhouettes), energy glows (charge-ups, element glows on the striking
// limb, muzzle flashes), the ice shell of a frozen character, dazed stars,
// root vines, the guard shimmer and the Lunarian back flame.
// Textures are drawn once and shared; labels redraw only when they change.
import * as THREE from 'three';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ helpers
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function parseCol(s) {
  if (!s) return { c: '#ffffff', a: 1 };
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { c: `rgb(${p[0] | 0},${p[1] | 0},${p[2] | 0})`, a: p[3] ?? 1 };
  }
  return { c: s, a: 1 };
}
export function brightness(col) {
  const { c } = parseCol(col);
  const k = new THREE.Color(); try { k.set(c); } catch { return 1; }
  return k.r * 0.299 + k.g * 0.587 + k.b * 0.114;
}

// ------------------------------------------------------------------ labels
/** Name + health bar above a character (a sprite, redrawn only on change). */
export class Label {
  constructor() {
    this.c = canvas(256, 72);
    this.g = this.c.getContext('2d');
    this.tex = tex(this.c);
    this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.set(2.2, 0.62, 1);
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 5;
    this.key = '';
  }
  /** name: text or null; bar: fraction 0..1 or null; barCol */
  set(name, color, bar, barCol) {
    const key = `${name}|${color}|${bar === null ? '' : Math.round(bar * 60)}|${barCol}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.g;
    g.clearRect(0, 0, 256, 72);
    if (bar !== null) {
      g.fillStyle = 'rgba(0,0,0,0.62)'; g.beginPath(); g.roundRect(56, 52, 144, 13, 5); g.fill();
      g.fillStyle = barCol; g.beginPath(); g.roundRect(59, 55, Math.max(0, 138 * Math.min(1, bar)), 7, 3); g.fill();
    }
    if (name) {
      g.font = 'bold 26px Nunito, "Trebuchet MS", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineJoin = 'round';
      g.strokeText(name, 128, 30, 248);
      g.fillStyle = color || '#ffffff'; g.fillText(name, 128, 30, 248);
    }
    this.tex.needsUpdate = true;
  }
  dispose() { this.tex.dispose(); this.mat.dispose(); }
}

const MARKERS = {};
/** The shared '!' / '?' quest marker sprite material. */
function markerMat(ch) {
  if (MARKERS[ch]) return MARKERS[ch];
  const c = canvas(64, 96), g = c.getContext('2d');
  g.font = 'bold 84px Bangers, Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#000'; g.lineJoin = 'round';
  g.strokeText(ch, 32, 52);
  g.fillStyle = ch === '!' ? '#ffd54f' : '#90caf9'; g.fillText(ch, 32, 52);
  MARKERS[ch] = new THREE.SpriteMaterial({ map: tex(c), transparent: true, depthWrite: false, fog: false });
  return MARKERS[ch];
}
export class Marker {
  constructor() {
    this.sprite = new THREE.Sprite(markerMat('!'));
    this.sprite.scale.set(0.42, 0.63, 1);
    this.sprite.renderOrder = 6;
    this.ch = '!';
  }
  set(ch) { if (ch !== this.ch) { this.ch = ch; this.sprite.material = markerMat(ch); } }
}

// ------------------------------------------------------------------ glows
let GLOW_TEX = null;
function glowTex() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = canvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  GLOW_TEX = tex(c);
  return GLOW_TEX;
}
const GLOW_MATS = new Map();
/** A shared additive glow sprite material for a colour. */
export function glowSpriteMat(color, additive = true) {
  const key = color + (additive ? '+' : '');
  let m = GLOW_MATS.get(key);
  if (!m) {
    const { c } = parseCol(color);
    m = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(c), transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
    GLOW_MATS.set(key, m);
  }
  return m;
}
export class Glow {
  constructor(color = '#ffffff') {
    this.sprite = new THREE.Sprite(glowSpriteMat(color));
    this.core = new THREE.Sprite(glowSpriteMat('#ffffff'));
    this.core.scale.setScalar(0.45);
    this.sprite.add(this.core);
    this.color = color;
  }
  set(color, size, pos) {
    if (color !== this.color) { this.color = color; this.sprite.material = glowSpriteMat(color); }
    this.sprite.scale.setScalar(Math.max(0.001, size));
    if (pos) this.sprite.position.copy(pos);
  }
}

// ------------------------------------------------------------------ auras
const AURA = new Map();
/** Flickering flame silhouette (4 frames in a strip) for an aura colour. */
function auraTex(color) {
  let t = AURA.get(color);
  if (t) return t;
  const W = 96, H = 128, F = 4;
  const c = canvas(W, H * F), g = c.getContext('2d');
  const { c: col, a } = parseCol(color);
  for (let f = 0; f < F; f++) {
    g.save(); g.translate(0, f * H);
    for (let layer = 0; layer < 2; layer++) {
      const sc = layer ? 0.8 : 1;
      g.globalAlpha = (layer ? 0.9 : 0.55) * Math.min(1, a + 0.15);
      g.fillStyle = layer ? '#ffffff' : col;
      if (layer) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.25; }
      g.beginPath();
      const w = W * 0.42 * sc, cx = W / 2, base = H - 4;
      g.moveTo(cx - w, base);
      for (let k = 0; k <= 10; k++) {
        const x = cx - w + (k / 10) * 2 * w;
        const env = Math.sin((k / 10) * Math.PI);
        const tip = (k % 2 ? 6 : 16 + 8 * Math.sin(f * 1.7 + k * 1.9)) * sc;
        g.quadraticCurveTo(x - 4, base - H * (0.5 + 0.3 * env) * sc, x, base - H * (0.42 + 0.46 * env) * sc - tip);
      }
      g.lineTo(cx + w, base); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }
  t = tex(c);
  t.repeat.set(1, 1 / F);
  AURA.set(color, t);
  return t;
}
const PLANE = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
export class Aura {
  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    this.mesh = new THREE.Mesh(PLANE, this.mat);
    this.mesh.renderOrder = 2;
    this.color = null;
  }
  set(color, t, height, width, camYaw3) {
    if (color !== this.color) {
      this.color = color;
      this.mat.map = auraTex(color);
      this.mat.blending = brightness(color) > 0.45 ? THREE.AdditiveBlending : THREE.NormalBlending;
      this.mat.needsUpdate = true;
    }
    const f = Math.floor(t * 12) % 4;
    this.mat.map.offset.set(0, f / 4);
    this.mat.opacity = 0.55 + 0.2 * Math.sin(t * 10);
    this.mesh.scale.set(width * (1 + 0.04 * Math.sin(t * 13)), height * (1 + 0.05 * Math.sin(t * 9)), 1);
    this.mesh.rotation.set(0, camYaw3, 0);
  }
  dispose() { this.mat.dispose(); }
}

// ------------------------------------------------------------------ status
let ICE = null;
/** The ice shell a frozen character is trapped in (shared). */
export function iceShell() {
  if (!ICE) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const j = 1 + 0.12 * Math.sin(i * 12.9898) ;
      p.setXYZ(i, x * 0.55 * j, (y * 0.5 + 0.5) * 1.95 * (0.95 + 0.08 * Math.cos(i * 7.1)), z * 0.5 * j);
    }
    g.computeVertexNormals();
    const m = new THREE.MeshPhongMaterial({ color: 0xb3e5fc, emissive: 0x1a3a50, specular: 0xffffff, shininess: 80, transparent: true, opacity: 0.5, depthWrite: false, flatShading: true });
    ICE = { g, m };
  }
  const mesh = new THREE.Mesh(ICE.g, ICE.m);
  mesh.renderOrder = 3;
  return mesh;
}

let STAR = null;
function starMat() {
  if (STAR) return STAR;
  const c = canvas(64, 64), g = c.getContext('2d');
  g.translate(32, 32);
  g.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 26, a = -Math.PI / 2 + (i / 10) * TAU; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath();
  g.fillStyle = '#ffeb3b'; g.fill();
  g.lineWidth = 4; g.strokeStyle = 'rgba(90,60,0,0.9)'; g.lineJoin = 'round'; g.stroke();
  STAR = new THREE.SpriteMaterial({ map: tex(c), transparent: true, depthWrite: false });
  return STAR;
}
/** Three little stars circling a dazed head. */
export class Stars {
  constructor() {
    this.group = new THREE.Group();
    this.s = [0, 1, 2].map(() => { const s = new THREE.Sprite(starMat()); s.scale.setScalar(0.16); this.group.add(s); return s; });
  }
  update(t, r = 0.3) {
    for (let k = 0; k < 3; k++) {
      const a = t * 5 + k * TAU / 3;
      this.s[k].position.set(Math.cos(a) * r, Math.sin(a * 2) * 0.04, Math.sin(a) * r);
      this.s[k].scale.setScalar(0.13 * (0.85 + 0.15 * Math.sin(a * 2)));
    }
  }
}

let ROOT = null;
export function rootRing() {
  if (!ROOT) ROOT = { g: new THREE.TorusGeometry(0.42, 0.05, 5, 16).rotateX(Math.PI / 2), m: new THREE.MeshToonMaterial({ color: 0x6d4c41 }) };
  return new THREE.Mesh(ROOT.g, ROOT.m);
}

let SHIM = null;
/** The curved guard shimmer in front of a blocking character. */
export function guardShimmer() {
  if (!SHIM) SHIM = new THREE.CylinderGeometry(0.62, 0.62, 1.3, 14, 1, true, -1.05 + Math.PI / 2, 2.1).translate(0, 0.65, 0);
  const m = new THREE.MeshBasicMaterial({ color: 0x90caf9, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(SHIM, m);
  mesh.renderOrder = 3;
  return mesh;
}

export { TAU };
