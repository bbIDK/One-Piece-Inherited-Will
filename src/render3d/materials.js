// Shared materials and helpers for the 3D view: cel-shading ramps, outlines,
// canvas textures. Everything in 3D uses these so the look stays consistent
// (anime cel shading: flat light/shadow bands, dark outlines).
import * as THREE from 'three';

let grad = null;
/** The cel-shading ramp: three flat bands (shadow, mid, light). */
export function toonGradient() {
  if (grad) return grad;
  const data = new Uint8Array([96, 96, 96, 255, 170, 170, 170, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  grad = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  grad.minFilter = THREE.NearestFilter;
  grad.magFilter = THREE.NearestFilter;
  grad.generateMipmaps = false;
  grad.needsUpdate = true;
  return grad;
}

const toonCache = new Map();
/** A shared cel-shaded material for a flat colour. */
export function toon(color, opts = {}) {
  const key = `${color}|${opts.emissive || ''}|${opts.transparent ? 1 : 0}|${opts.side || 0}|${opts.opacity ?? 1}`;
  let m = toonCache.get(key);
  if (m) return m;
  m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });
  toonCache.set(key, m);
  return m;
}

const outlineCache = new Map();
/** Back-face "inverted hull" outline material (use on a slightly scaled copy). */
export function outlineMaterial(color = 0x2b1d14) {
  let m = outlineCache.get(color);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  outlineCache.set(color, m);
  return m;
}

/** Add a cheap anime outline to a mesh (a scaled back-face shell). */
export function addOutline(mesh, thickness = 0.04, color) {
  const shell = new THREE.Mesh(mesh.geometry, outlineMaterial(color));
  const s = mesh.geometry.boundingSphere || (mesh.geometry.computeBoundingSphere(), mesh.geometry.boundingSphere);
  const r = Math.max(0.05, s.radius);
  shell.scale.setScalar(1 + thickness / r);
  shell.position.copy(s.center).multiplyScalar(-(thickness / r));
  shell.castShadow = false;
  shell.receiveShadow = false;
  mesh.add(shell);
  return shell;
}

/** A texture backed by a canvas you draw on (call tex.needsUpdate = true after drawing). */
export function canvasTexture(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return { canvas: c, ctx: c.getContext('2d'), tex };
}

export { THREE };
