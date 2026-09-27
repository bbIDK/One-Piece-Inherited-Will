// Live 3D character previews for menus (character creation, the character
// sheet) and still portraits, drawn with the same 3D character views as the
// game (VIEWS.actor), so what you see is exactly how you'll look.
//
// One small WebGL renderer is shared by every preview and portrait (only one
// live preview is on screen at a time).
import * as THREE from 'three';
import { VIEWS } from '../render3d/registry.js';
import { Actor } from '../game/actor.js';
import '../render3d/chars3d.js';

let shared = null;
function sharedRenderer() {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  canvas.className = 'preview3d-canvas';
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.setClearColor(0x000000, 0);
  shared = r;
  return r;
}

/** A small lit stage with a soft round shadow for one character. */
function makeStage() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x7a6448, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(2.2, 4, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe3ff, 1.4);
  rim.position.set(-3, 2.5, -3);
  scene.add(rim);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), new THREE.MeshBasicMaterial({ color: 0x3b2a1a, transparent: true, opacity: 0.22, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  scene.add(shadow);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 60);
  return { scene, camera, shadow };
}

function makeActor(look) {
  const a = new Actor({ name: '', look, race: look.race || 'human' });
  a.facing = Math.PI / 2; // toward the camera (+z)
  return a;
}

/** Approximate standing height (m) for framing the camera. */
function heightOf(look) {
  const s = look.scale || 1;
  const legs = look.legs || 1;
  return (1.08 + 0.72 * legs) * s;
}

const env0 = () => ({ time: 0, daylight: 1, ambient: [1, 1, 1], clock: 12, storm: 0, fog: 0 });

/**
 * A live preview inside `container`: it stands still, a little turned toward
 * you, and turns when you drag it.
 * Returns { setLook(look), dispose() }.
 */
export function createPreview(container, look, { game } = {}) {
  const renderer = sharedRenderer();
  const canvas = renderer.domElement;
  container.appendChild(canvas);
  const { scene, camera, shadow } = makeStage();
  const env = env0();
  const ctx = { THREE, scene, game: game || null, ground: () => 0, terrain: () => 0, camera, world: null, yaw: 0, mode: 'third' };
  let actor = null, view = null, h = 1.8;
  let turn = 0.35, drag = null, raf = 0, last = performance.now();
  let framing = 'full', zoom = 0; // zoom eases between the full figure (0) and the face (1)
  const t0 = last;

  const setLook = (lk) => {
    if (view) { scene.remove(view.root); try { view.dispose?.(); } catch { /* ignore */ } }
    actor = makeActor(lk);
    try { view = VIEWS.actor ? VIEWS.actor(actor, ctx) : null; } catch (e) { console.warn('preview failed', e); view = null; }
    if (view) scene.add(view.root);
    h = heightOf(lk);
    shadow.scale.setScalar(Math.max(1, (lk.scale || 1) * (lk.bulk || 1)));
  };

  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    env.time = (now - t0) / 1000;
    const w = container.clientWidth || 260, hh = container.clientHeight || 300;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(hh * pr)) renderer.setSize(w, hh, false);
    camera.aspect = w / Math.max(1, hh);
    // frame the whole figure, or the head when choosing a face or hair
    zoom += ((framing === 'face' ? 1 : 0) - zoom) * Math.min(1, dt * 6);
    const fovY = camera.fov * Math.PI / 180;
    const fitH = h * (1.34 - 0.94 * zoom), fitW = h * (0.8 - 0.46 * zoom) / camera.aspect;
    const dist = Math.max(fitH, fitW) / (2 * Math.tan(fovY / 2));
    const cy = h * (0.54 + 0.35 * zoom);
    camera.position.set(0, cy + h * 0.06 * (1 - zoom) + h * 0.01 * zoom, dist);
    camera.lookAt(0, cy, 0);
    camera.updateProjectionMatrix();
    if (actor && view) {
      actor.facing = Math.PI / 2 + turn;
      try { view.update(actor, env, ctx, { camYaw3: 0, redraw: true }); } catch (e) { /* keep the last frame */ }
      view.root.position.set(0, 0, 0);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };

  const down = (e) => { drag = { x: e.clientX, turn }; canvas.style.cursor = 'grabbing'; try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ } };
  const move = (e) => { if (drag) turn = drag.turn - (e.clientX - drag.x) * 0.012; };
  const up = () => { drag = null; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';

  setLook(look);
  raf = requestAnimationFrame(frame);
  return {
    setLook,
    /** 'full' (the whole figure) or 'face' (head and shoulders). */
    setFraming(f) { framing = f; },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      if (view) { scene.remove(view.root); try { view.dispose?.(); } catch { /* ignore */ } }
      if (canvas.parentNode === container) container.removeChild(canvas);
    },
  };
}

/**
 * A still portrait as a 2D canvas: 'bust' (head and shoulders) or 'full'.
 * Falls back to null when 3D isn't available.
 */
export function renderPortrait(look, { w = 120, h = 140, view: framing = 'bust', game = null, turn = 0, elev = 0 } = {}) {
  try {
    const renderer = sharedRenderer();
    const { scene, camera } = makeStage();
    const ctx = { THREE, scene, game, ground: () => 0, terrain: () => 0, camera, world: null, yaw: 0, mode: 'third' };
    const actor = makeActor(look);
    actor.facing = Math.PI / 2 - 0.25 + turn;
    const v = VIEWS.actor ? VIEWS.actor(actor, ctx) : null;
    if (!v) return null;
    scene.add(v.root);
    v.update(actor, env0(), ctx, { camYaw3: 0, redraw: true });
    const H = heightOf(look);
    camera.aspect = w / h;
    if (framing === 'full') {
      const fovY = camera.fov * Math.PI / 180;
      const dist = H * 1.15 / (2 * Math.tan(fovY / 2));
      camera.position.set(0, H * 0.55, dist);
      camera.lookAt(0, H * 0.5, 0);
    } else if (framing === 'head') {
      // a close study of the head (elev: camera angle above the eye line)
      const head = H * 0.915, dist = H * 0.52;
      camera.position.set(0, head + Math.sin(elev) * dist, Math.cos(elev) * dist);
      camera.lookAt(0, head, 0);
    } else {
      const head = H * 0.86;
      camera.position.set(0, head, H * 0.95);
      camera.lookAt(0, head - H * 0.03, 0);
    }
    camera.updateProjectionMatrix();
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(pr);
    renderer.render(scene, camera);
    const out = document.createElement('canvas');
    out.width = Math.round(w * pr); out.height = Math.round(h * pr);
    out.style.width = w + 'px'; out.style.height = h + 'px';
    out.getContext('2d').drawImage(renderer.domElement, 0, 0, out.width, out.height);
    try { v.dispose?.(); } catch { /* ignore */ }
    return out;
  } catch (e) {
    console.warn('portrait failed', e);
    return null;
  }
}
