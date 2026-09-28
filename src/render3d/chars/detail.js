// The characters' detail texture: the manga's ink work on the body — the
// line under each pec, the abs, the obliques' V, collarbones, the deltoid and
// biceps, knees and calves — and the folds and seams of clothes, painted
// once on a shared canvas atlas. Every body part carries UVs into one region
// of it (the rest of the body into a blank corner); the body shader
// multiplies it into the vertex colour, so the lines come out as a darker
// shade of whatever skin or cloth they're on.
//
// Regions are parametrised the way the parts are built (body.js):
//   torso*   u = angle round the body (-π back … 0 front … π back), v = s
//            (height / chest length) from -0.1 to 1
//   limbs    u = angle round the limb (0 = the limb's +X), v = t from the
//            upper joint (0) to the lower one (1); the left limbs mirror u
import * as THREE from 'three';

const W = 1024, H = 1024;
const TAU = Math.PI * 2;

// [x, y, w, h] in canvas pixels (y down)
const R = {
  torsoLean: [0, 0, 512, 256], torsoMusc: [512, 0, 512, 256],
  torsoFem: [0, 256, 512, 256], torsoCloth: [512, 256, 512, 256],
  uarm: [0, 512, 256, 256], farm: [256, 512, 256, 256], thigh: [512, 512, 256, 256], shin: [768, 512, 256, 256],
  sleeve: [0, 768, 256, 256], trouser: [256, 768, 256, 256], trouserShin: [512, 768, 256, 256], skirt: [768, 768, 240, 256],
  blank: [1012, 1012, 8, 8],
};
const pad = 3 / W;
/** UV rectangle [u0, v0, u1, v1] of a region (three.js UVs: v up). */
function rect(name) {
  const [x, y, w, h] = R[name];
  return [x / W + pad, 1 - (y + h) / H + pad, (x + w) / W - pad, 1 - y / H - pad];
}
export const BLANK_UV = (() => { const [x, y, w, h] = R.blank; return [(x + w / 2) / W, 1 - (y + h / 2) / H]; })();
const RECTS = Object.fromEntries(Object.keys(R).map((k) => [k, rect(k)]));
/** Map a region's (u, v) in 0..1 to atlas UVs. */
export function atlasUV(region, u, v) {
  const r = RECTS[region];
  return [r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * v];
}
/** Torso UV for angle a (-π..π) and height s (-0.1..1). */
export const torsoUV = (region, a, s) => atlasUV(region, (a + Math.PI) / TAU, (s + 0.1) / 1.1);

// ------------------------------------------------------------------ painting
// The torso's cross-section is a superellipse (body.js torsoPt): a point a
// fraction zn of the half-width out from the middle sits at angle
// asin(|zn|^(1/0.78)) — so art laid out across the body lands in place.
const angOfZ = (zn) => Math.sign(zn) * Math.asin(Math.min(1, Math.pow(Math.abs(zn), 1 / 0.78)));
function painter(g, name) {
  const [x, y, w, h] = R[name];
  return {
    /** Canvas point for a torso front point (zn across -1..1, s up), or the back (back = true). */
    T(zn, s, back = false) {
      let a = angOfZ(zn);
      if (back) a = (a >= 0 ? Math.PI : -Math.PI) - a;
      return [x + ((a + Math.PI) / TAU) * w, y + (1 - (s + 0.1) / 1.1) * h];
    },
    /** Canvas point for a limb point (angle th in degrees from the limb's +X, t along). */
    L(th, t) { return [x + (((th % 360) + 360) % 360) / 360 * w, y + t * h]; },
    g,
  };
}
/** A smooth stroke through points (canvas px), tapered at both ends by drawing it twice. */
// (bold enough to survive the texture's mipmaps at a street's distance)
const LW = 1.35;
function stroke(g, pts, width, shade, alpha = 1) {
  if (pts.length < 2) return;
  width *= LW;
  const path = () => {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  };
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.globalAlpha = alpha * 0.55; g.strokeStyle = `rgb(${shade + 40},${shade + 40},${shade + 40})`; g.lineWidth = width * 1.9; path(); g.stroke();
  g.globalAlpha = alpha; g.strokeStyle = `rgb(${shade},${shade},${shade})`; g.lineWidth = width; path(); g.stroke();
  g.globalAlpha = 1;
}
/** Sample a curve fn(k) → [a, b] (painter coords) into canvas points. */
const curve = (P, fn, n = 14, back = false) => Array.from({ length: n + 1 }, (_, i) => { const [a, b] = fn(i / n); return P.T(a, b, back); });
const lcurve = (P, fn, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const [a, b] = fn(i / n); return P.L(a, b); });

/** The male torso's lines; `k` 0 (lean: a hint of pecs and abs) … 1 (muscular: every plate). */
function maleTorso(g, name, k) {
  const P = painter(g, name);
  const ink = 104, soft = 140;
  const w = 3.2 + k * 1.6;
  for (const sd of [-1, 1]) {
    // under each pec: from beside the sternum, dipping, up into the armpit
    stroke(g, curve(P, (t) => [sd * (0.07 + t * 0.8), 0.615 + 0.05 * Math.pow(Math.abs(t - 0.38) / 0.62, 2) + t * 0.08]), w, ink, 0.55 + 0.45 * k);
    // collarbone
    stroke(g, curve(P, (t) => [sd * (0.1 + t * 0.62), 0.945 - t * 0.03 + Math.sin(t * Math.PI) * 0.012], 8), 2.4, soft, 0.7);
    // the obliques' V down toward the groin
    stroke(g, curve(P, (t) => [sd * (0.78 - t * 0.5), 0.2 - t * 0.28], 10), 2.6 + k, ink, 0.35 + 0.55 * k);
    if (k > 0.3) {
      // serratus under the arm
      for (let i = 0; i < 3; i++) stroke(g, curve(P, (t) => [sd * (0.8 + t * 0.12), 0.47 + i * 0.055 + t * 0.03], 4), 2.4, soft, 0.6 * k);
      // the ribcage's edge / obliques
      stroke(g, curve(P, (t) => [sd * (0.42 + t * 0.4), 0.56 - t * 0.2], 8), 2.2, soft, 0.5 * k);
    }
  }
  // sternum
  stroke(g, curve(P, (t) => [0, 0.66 + t * 0.22], 6), 2.2, soft, 0.5);
  // abs: the linea alba and the plates
  const rows = [0.505, 0.415, 0.325];
  stroke(g, curve(P, (t) => [0, 0.57 - t * 0.43], 10), 2.6 + k, ink, 0.45 + 0.5 * k);
  for (let i = 0; i < rows.length; i++) {
    const s0 = rows[i];
    for (const sd of [-1, 1]) stroke(g, curve(P, (t) => [sd * (0.04 + t * 0.34), s0 + Math.sin(t * Math.PI) * 0.012 - t * 0.012], 6), 2.2 + k * 1.3, ink, (i < 2 ? 0.4 : 0.3) + 0.55 * k);
  }
  for (const sd of [-1, 1]) stroke(g, curve(P, (t) => [sd * (0.39 - t * 0.04), 0.56 - t * 0.4], 8), 2.2 + k, soft, 0.3 + 0.5 * k);
  // navel
  g.fillStyle = `rgb(${ink},${ink},${ink})`; g.globalAlpha = 0.85;
  const [nx, ny] = P.T(0, 0.19); g.beginPath(); g.ellipse(nx, ny, 3.2, 4.4, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
  // back: spine and shoulder blades
  stroke(g, curve(P, (t) => [0.001, 0.12 + t * 0.72], 10, true), 2.4, soft, 0.6);
  for (const sd of [-1, 1]) stroke(g, curve(P, (t) => [sd * (0.16 + Math.sin(t * Math.PI) * 0.2), 0.84 - t * 0.2], 10, true), 2.6, soft, 0.35 + 0.4 * k);
}
function femaleTorso(g, name) {
  const P = painter(g, name);
  const soft = 162;
  for (const sd of [-1, 1]) {
    stroke(g, curve(P, (t) => [sd * (0.1 + t * 0.55), 0.955 - t * 0.02 + Math.sin(t * Math.PI) * 0.01], 8), 2.2, soft, 0.65);
    // a soft line under the bust
    stroke(g, curve(P, (t) => [sd * (0.12 + t * 0.52), 0.6 + Math.pow(Math.abs(t - 0.45) / 0.55, 2) * 0.05], 10), 2.4, 150, 0.55);
    // the waist's curve toward the hip
    stroke(g, curve(P, (t) => [sd * (0.7 - t * 0.35), 0.16 - t * 0.2], 8), 2.0, soft, 0.35);
  }
  stroke(g, curve(P, (t) => [0, 0.5 - t * 0.2], 6), 1.8, 170, 0.4);
  g.fillStyle = 'rgb(150,150,150)'; g.globalAlpha = 0.8;
  const [nx, ny] = P.T(0, 0.19); g.beginPath(); g.ellipse(nx, ny, 2.6, 4.2, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
  stroke(g, curve(P, (t) => [0.001, 0.2 + t * 0.6], 10, true), 2.0, 175, 0.45);
}
/** Folds of a shirt or jacket: pulled from the armpits toward the waist, gathered where it's tucked. */
function clothTorso(g, name) {
  const P = painter(g, name);
  const c = 168;
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 3; i++) stroke(g, curve(P, (t) => [sd * (0.9 - t * (0.35 + i * 0.1)), 0.78 - i * 0.07 - t * (0.28 + i * 0.05)], 8), 2.2, c, 0.55);
    stroke(g, curve(P, (t) => [sd * (0.35 + t * 0.1), 0.12 + t * 0.12], 5), 2.0, c, 0.5);
    stroke(g, curve(P, (t) => [sd * (0.62 - t * 0.12), 0.1 + t * 0.16], 5), 2.0, c, 0.45);
    // side seams
    stroke(g, curve(P, (t) => [sd * 0.985, -0.08 + t * 0.95], 10), 1.8, 185, 0.6);
    // back folds
    for (let i = 0; i < 2; i++) stroke(g, curve(P, (t) => [sd * (0.25 + i * 0.25 + t * 0.1), 0.72 - t * 0.35], 6, true), 2.0, c, 0.4);
  }
}
/** Arm: the deltoid's edge, the biceps and triceps, the crook of the elbow; forearm muscles. */
function armLines(g) {
  // limbs: +X = the back of the arm (the elbow's point), lateral = 270° (mirrored for the left arm), front = 180°
  const U = painter(g, 'uarm'), F = painter(g, 'farm');
  const ink = 112, soft = 146;
  // deltoid: a V from the front and the back to its insertion on the outside of the arm
  stroke(g, lcurve(U, (t) => [150 + t * 115, 0.1 + t * 0.34]), 3, ink, 0.8);
  stroke(g, lcurve(U, (t) => [30 - t * 115, 0.12 + t * 0.32]), 3, ink, 0.7);
  // biceps: its outline down the front, the crook of the elbow
  stroke(g, lcurve(U, (t) => [140 + t * 6, 0.45 + t * 0.4]), 2.4, soft, 0.6);
  stroke(g, lcurve(U, (t) => [220 - t * 6, 0.45 + t * 0.4]), 2.4, soft, 0.6);
  stroke(g, lcurve(U, (t) => [150 + t * 60, 0.94 + Math.sin(t * Math.PI) * 0.02], 6), 2.4, ink, 0.7);
  // triceps' horseshoe at the back
  stroke(g, lcurve(U, (t) => [330 + t * 60, 0.62 + Math.sin(t * Math.PI) * 0.06], 8), 2.2, soft, 0.5);
  // forearm: the ridge of the brachioradialis, the flexors' line
  stroke(g, lcurve(F, (t) => [235 - t * 40, 0.06 + t * 0.62]), 2.4, soft, 0.6);
  stroke(g, lcurve(F, (t) => [120 + t * 30, 0.1 + t * 0.55]), 2.0, soft, 0.45);
}
/** Leg: kneecap and the teardrop above it, the shin, the calf's two heads. */
function legLines(g) {
  // legs: +X = the front (the knee), lateral = 90° (mirrored for the left leg)
  const T = painter(g, 'thigh'), S = painter(g, 'shin');
  const ink = 114, soft = 148;
  // quads: the line down the front of the thigh, the teardrop above the knee inside
  stroke(g, lcurve(T, (t) => [300 + t * 20, 0.25 + t * 0.55]), 2.2, soft, 0.5);
  stroke(g, lcurve(T, (t) => [285 + Math.sin(t * Math.PI) * 25, 0.72 + t * 0.24], 8), 2.4, ink, 0.6);
  stroke(g, lcurve(T, (t) => [40 + t * 25, 0.2 + t * 0.55]), 2.0, soft, 0.4);
  // kneecap outline at the top of the shin
  stroke(g, lcurve(S, (t) => [335 + t * 50, 0.1 + Math.sin(t * Math.PI) * 0.07], 10), 2.6, ink, 0.65);
  // the calf: its two heads and the line down the shin
  stroke(g, lcurve(S, (t) => [215 - Math.sin(t * Math.PI) * 30, 0.14 + t * 0.4], 10), 2.6, soft, 0.6);
  stroke(g, lcurve(S, (t) => [140 + Math.sin(t * Math.PI) * 25, 0.14 + t * 0.34], 10), 2.4, soft, 0.5);
  stroke(g, lcurve(S, (t) => [10 + t * 12, 0.2 + t * 0.65]), 2.0, 172, 0.45);
}
/** Folds of cloth over a limb: bunching at the elbow or knee, pulled lines along it. */
function limbCloth(g, name, bend) {
  const P = painter(g, name);
  const c = 165;
  for (let i = 0; i < 4; i++) {
    const th0 = 110 + i * 40;
    stroke(g, lcurve(P, (t) => [th0 + t * 30, bend - 0.12 + i * 0.05 + t * 0.06], 6), 2.2, c, 0.55);
  }
  for (let i = 0; i < 3; i++) stroke(g, lcurve(P, (t) => [20 + i * 100 + t * 10, 0.1 + t * 0.4], 6), 1.8, c, 0.35);
  // the seam down the outside
  stroke(g, lcurve(P, (t) => [90, t], 10), 1.8, 188, 0.6);
  stroke(g, lcurve(P, (t) => [270, t], 10), 1.8, 188, 0.6);
}
function skirtLines(g) {
  const P = painter(g, 'skirt');
  for (let i = 0; i < 16; i++) {
    const th = i * 22.5 + (i % 2) * 6;
    stroke(g, lcurve(P, (t) => [th + t * 4, 0.15 + t * 0.85], 6), 2.0, 172, 0.5);
  }
}

let TEX = null;
/** The shared detail atlas (built on first use). */
export function detailTexture() {
  if (TEX) return TEX;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  maleTorso(g, 'torsoLean', 0.15);
  maleTorso(g, 'torsoMusc', 1);
  femaleTorso(g, 'torsoFem');
  clothTorso(g, 'torsoCloth');
  armLines(g);
  legLines(g);
  limbCloth(g, 'sleeve', 0.95);
  limbCloth(g, 'trouser', 0.95);
  limbCloth(g, 'trouserShin', 0.12);
  skirtLines(g);
  TEX = new THREE.CanvasTexture(c);
  TEX.colorSpace = THREE.SRGBColorSpace;
  TEX.anisotropy = 4;
  TEX.generateMipmaps = true;
  TEX.minFilter = THREE.LinearMipmapLinearFilter;
  return TEX;
}
