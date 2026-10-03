// Per-character extras in 3D: floating name labels with NPC health bars,
// quest markers ('!' gold, '?' blue), buff auras (shells of energy round
// the body), energy glows (charge-ups, element glows on the striking
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
/** The shared '!' / '?' quest marker sprite material ('M!' / 'M?': the main story's, in orange). */
function markerMat(ch) {
  if (MARKERS[ch]) return MARKERS[ch];
  const main = ch[0] === 'M', glyph = main ? ch.slice(1) : ch;
  const c = canvas(64, 96), g = c.getContext('2d');
  g.font = 'bold 84px Bangers, Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (main) {
    // a warm halo so the story stands out from the side quests
    const gr = g.createRadialGradient(32, 50, 4, 32, 50, 34);
    gr.addColorStop(0, 'rgba(255,183,77,0.55)'); gr.addColorStop(1, 'rgba(255,183,77,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 96);
  }
  g.lineWidth = 10; g.strokeStyle = '#000'; g.lineJoin = 'round';
  g.strokeText(glyph, 32, 52);
  g.fillStyle = main ? (glyph === '!' ? '#ff9100' : '#ffb74d') : glyph === '!' ? '#ffd54f' : '#90caf9';
  g.fillText(glyph, 32, 52);
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
// A power-up aura in 3D, the way the anime draws one: a shell of energy
// standing round the whole body, brightest at its edges (where you look
// through the most of it) and clear in the middle, so the figure inside reads;
// streaks running up it, its top torn into tongues by rising noise, licking
// and swelling with the beat of the power; motes drifting up off it. Bright
// colours glow (added on); dark ones (an Asura's shadow, a Shadow-fruit's
// gloom) are laid over as a smoke instead.
const AURA_NOISE = /* glsl */`
  float ahash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float anoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(ahash(i), ahash(i + vec3(1, 0, 0)), f.x), mix(ahash(i + vec3(0, 1, 0)), ahash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(ahash(i + vec3(0, 0, 1)), ahash(i + vec3(1, 0, 1)), f.x), mix(ahash(i + vec3(0, 1, 1)), ahash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`;
const AURA_VERT = /* glsl */`
  uniform float uTime, uSpeed;
  varying float vH, vA;
  varying vec3 vN, vV;
  ${AURA_NOISE}
  void main() {
    vec3 p = position;
    float h = clamp(p.y, 0.0, 1.0), t = uTime * uSpeed;
    float a = atan(p.z, p.x);
    // tongues licking up off the top, the whole shell breathing
    float n = anoise(vec3(a * 2.0, h * 3.0 - t * 2.6, t * 0.4)) - 0.5;
    p.xz *= 1.0 + n * 0.7 * h * h + 0.05 * sin(t * 9.0 + h * 6.0);
    p.y *= 1.0 + 0.07 * sin(t * 7.3) + n * 0.25 * h * h;
    vH = h; vA = a;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const AURA_FRAG = /* glsl */`
  uniform float uTime, uSpeed, uAlpha, uAdd;
  uniform vec3 uColor;
  varying float vH, vA;
  varying vec3 vN, vV;
  ${AURA_NOISE}
  void main() {
    float t = uTime * uSpeed;
    float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    // the top torn into tongues of flame, streaks running up the sides
    float n = anoise(vec3(vA * 3.0, vH * 3.5 - t * 3.4, t * 0.6));
    float s = anoise(vec3(vA * 9.0, vH * 1.6 - t * 2.4, 3.0));
    float tongue = vH + (n - 0.5) * 0.7 * smoothstep(0.25, 1.0, vH);
    if (tongue > 0.9) discard;
    float a = pow(rim, 1.25) * 0.95 + 0.1 + smoothstep(0.55, 0.9, s) * 0.5;
    a *= (1.0 - smoothstep(0.62, 0.9, tongue)) * smoothstep(0.0, 0.12, vH);
    a *= uAlpha * (0.85 + 0.15 * sin(t * 12.0));
    vec3 col = mix(uColor, vec3(1.0), (pow(rim, 3.0) * 0.5 + smoothstep(0.7, 0.95, s) * 0.35) * uAdd);
    gl_FragColor = uAdd > 0.5 ? vec4(col * a * 1.6, a) : vec4(col, min(1.0, a * 1.3));
  }
`;
const MOTE_VERT = /* glsl */`
  attribute vec3 seed;
  uniform float uTime, uPx, uH, uR;
  varying float vLife;
  void main() {
    float life = fract(uTime * (0.35 + seed.z * 0.3) + seed.x);
    float a = seed.y + life * 1.2;
    vec3 p = vec3(cos(a) * uR * (0.75 + seed.z * 0.4), life * uH * 1.1, sin(a) * uR * (0.75 + seed.z * 0.4));
    vLife = life;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPx * 0.07 * (1.0 - life * 0.6) / max(0.2, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const MOTE_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uAlpha, uAdd;
  varying float vLife;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = (1.0 - d * d) * sin(vLife * 3.14159) * uAlpha;
    vec3 c = mix(uColor, vec3(1.0), 0.35 * uAdd);
    gl_FragColor = uAdd > 0.5 ? vec4(c * a * 1.4, a) : vec4(c, a * 0.8);
  }
`;
let AURA_GEO = null, MOTES = null;
/** The shell: wide through the shoulders, narrowing over the head (1 high, 1 across at the widest). */
function auraGeo() {
  if (AURA_GEO) return AURA_GEO;
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const y = i / 16;
    const r = 0.5 * (0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, y * 1.25))) * (1 - 0.55 * y ** 3);
    pts.push(new THREE.Vector2(Math.max(0.01, r), y));
  }
  AURA_GEO = new THREE.LatheGeometry(pts, 20);
  return AURA_GEO;
}
function moteGeo() {
  if (MOTES) return MOTES;
  const n = 16, seed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { seed[i * 3] = (i * 0.618) % 1; seed[i * 3 + 1] = i * 2.399; seed[i * 3 + 2] = (i * 0.381) % 1; }
  MOTES = new THREE.BufferGeometry();
  MOTES.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  MOTES.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  MOTES.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
  return MOTES;
}
const _sz = new THREE.Vector2();
export class Aura {
  constructor() {
    // (the shell and its motes sit in an inner group, centred on the body
    // whatever offset the caller gives the outer one: see set)
    this.mesh = new THREE.Group();
    this.inner = new THREE.Group();
    this.mesh.add(this.inner);
    const u = { uTime: { value: 0 }, uSpeed: { value: 1 }, uAlpha: { value: 0.7 }, uAdd: { value: 1 }, uColor: { value: new THREE.Color() } };
    this.mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: AURA_VERT, fragmentShader: AURA_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.shell = new THREE.Mesh(auraGeo(), this.mat);
    this.shell.renderOrder = 2;
    // (a second, looser shell outside it, fainter and quicker: depth to the blaze)
    this.mat2 = this.mat.clone();
    this.mat2.uniforms.uTime = u.uTime; this.mat2.uniforms.uColor = u.uColor; this.mat2.uniforms.uAdd = u.uAdd;
    this.mat2.uniforms.uSpeed.value = 1.45;
    this.outer = new THREE.Mesh(auraGeo(), this.mat2);
    this.outer.renderOrder = 2;
    this.moteMat = new THREE.ShaderMaterial({
      uniforms: { uTime: u.uTime, uAlpha: u.uAlpha, uAdd: u.uAdd, uColor: u.uColor, uPx: { value: 800 }, uH: { value: 2 }, uR: { value: 0.4 } },
      vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, transparent: true, depthWrite: false,
    });
    this.motes = new THREE.Points(moteGeo(), this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 3;
    this.motes.onBeforeRender = (r, sc, cam) => {
      r.getDrawingBufferSize(_sz);
      this.moteMat.uniforms.uPx.value = _sz.y / (2 * Math.tan(((cam.fov || 60) * Math.PI) / 360));
    };
    this.inner.add(this.shell, this.outer, this.motes);
    this.color = null;
  }
  /** color: the aura's css colour (its alpha how strong); height and width in the body's units; camYaw3: the camera's yaw. */
  set(color, t, height, width, camYaw3) {
    if (color !== this.color) {
      this.color = color;
      const { c, a } = parseCol(color);
      this.mat.uniforms.uColor.value.set(c);
      const add = brightness(color) > 0.45;
      this.mat.uniforms.uAdd.value = add ? 1 : 0;
      this.mat.uniforms.uAlpha.value = Math.min(1, 0.5 + a * 0.5);
      this.mat2.uniforms.uAlpha.value = this.mat.uniforms.uAlpha.value * 0.45;
      const bl = add ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (this.mat.blending !== bl) {
        for (const m of [this.mat, this.mat2, this.moteMat]) { m.blending = bl; m.needsUpdate = true; }
      }
    }
    this.mat.uniforms.uTime.value = t;
    this.shell.scale.set(width * 0.62, height * 1.08, width * 0.62);
    this.outer.scale.set(width * 0.74, height * 1.22, width * 0.74);
    this.moteMat.uniforms.uH.value = height;
    this.moteMat.uniforms.uR.value = width * 0.3;
    // (the caller sets the outer group a little toward the camera, as it did a
    // flat card's: the shell goes back round the body)
    this.inner.position.set(Math.sin(camYaw3) * 0.3, 0.05, Math.cos(camYaw3) * 0.3);
  }
  dispose() { this.mat.dispose(); this.mat2.dispose(); this.moteMat.dispose(); }
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
