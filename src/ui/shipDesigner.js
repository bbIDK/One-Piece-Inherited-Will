// Fitting out a new ship (or repainting one you own) at the shipwright's, as
// the character creator does a body: a live 3D model of her, turning on the
// slipway, and her name, the colour of her hull, the cloth of her sails and
// (on a ship big enough to carry one) her figurehead — what you pick is what
// sails out (Ship.paint, drawn by render3d/ships3d.js paintedDef).
import * as THREE from 'three';
import { h } from './dom.js';
import { SHIPS, shipStats } from '../data/ships.js';
import { ShipView } from '../render3d/ships3d.js';
import { shipDims } from '../world/hull.js';

/** Hull paints: the timber's own browns, and the colours crews have painted theirs. */
export const HULL_PAINTS = [
  ['Oak', '#8d5b33'], ['Teak', '#a0703c'], ['Walnut', '#5b3a24'], ['Ebony', '#2f2622'], ['Driftwood', '#b9a88f'],
  ['Pearl white', '#ece6d8'], ['Ship red', '#9c2f25'], ['Navy blue', '#24406b'], ['Sea green', '#2e6b55'], ['Gold leaf', '#c49a3a'],
  ['Royal purple', '#5b3a78'], ['Sunflower', '#d9a72b'],
];
/** Sailcloth. */
export const SAIL_CLOTHS = [
  ['Canvas', '#efe6cf'], ['Bleached', '#fbf8f1'], ['Tan', '#d8b98a'], ['Ochre', '#c98d3a'], ['Crimson', '#b33a2e'],
  ['Black', '#2b2a2c'], ['Sky', '#9cc3e0'], ['Violet', '#8e6bb0'],
];
/** Figureheads a ship of the line can carry (a small one has her carved scroll). */
export const FIGUREHEADS = [['scroll', 'Carved scroll'], ['mermaid', 'Gilded mermaid'], ['dragon', 'Dragon'], ['lion_gold', 'Golden lion'], ['whale', 'White whale']];

/** Can she be painted at all? (The Navy's ships, and the legendary ones, keep their colours.) */
export const paintable = (def) => !!def && def.sail !== 'marine' && !def.special;

/**
 * Open the fitting-out screen for a ship of `type`. `start` { name, paint }
 * fills it in; `ok` names the confirm button. Resolves to { name, paint } —
 * or null if you back out.
 */
export function openShipDesigner(game, type, { name = '', paint = null, title = '', ok = 'Launch her', jr = null } = {}) {
  const ui = game.ui, def = shipStats(type, []) || SHIPS[type];
  const big = shipDims(def).big;
  const st = {
    name: name || SHIPS[type].name,
    color: paint?.color || def.color || HULL_PAINTS[0][1],
    sail: paint?.sail || SAIL_CLOTHS[0][1],
    figurehead: paint?.figurehead || (big && FIGUREHEADS.some(([k]) => k === def.figurehead) ? def.figurehead : 'scroll'),
  };
  return new Promise((resolve) => {
    let done = false;
    const stage = shipStage(type, jr ?? game.state?.char?.jr ?? null);
    const finish = (v) => { if (done) return; done = true; stage.dispose(); ui.closePanel(entry); resolve(v); };
    const swatches = (list, key) => h('div.sd-swatches', list.map(([label, col]) => {
      const b = h('button.sd-swatch' + (st[key] === col ? '.on' : ''), { title: label, style: { background: col }, on: { click: () => { st[key] = col; draw(); } } });
      return b;
    }));
    const body = h('div.ship-designer');
    const draw = () => {
      stage.set({ color: st.color, sail: st.sail, figurehead: big ? st.figurehead : null });
      body.replaceChildren(
        h('h2', title || `Fit out your ${SHIPS[type].name}`),
        h('div.sd-wrap', stage.el,
          h('div.sd-opts',
            h('label.sd-label', 'Her name'),
            h('input.sd-name', { value: st.name, maxLength: 24, on: { input: (e) => { st.name = e.target.value; } } }),
            h('label.sd-label', 'Hull'), swatches(HULL_PAINTS, 'color'),
            def.oarsOnly ? null : [h('label.sd-label', 'Sails'), swatches(SAIL_CLOTHS, 'sail')],
            big ? [h('label.sd-label', 'Figurehead'), h('div.sd-figs', FIGUREHEADS.map(([k, label]) => h('button.btn.small' + (st.figurehead === k ? '.gold' : ''), { on: { click: () => { st.figurehead = k; draw(); } } }, label)))] : h('p.muted', 'A ship her size has a carved scroll at her stem; the ships of the line carry figureheads.'),
            h('p.muted', 'Drag her to turn her round.'))),
        h('div.sd-buttons',
          h('button.btn', { on: { click: () => finish(null) } }, 'Cancel'),
          h('button.btn.gold', { on: { click: () => finish({ name: (st.name || '').trim().slice(0, 24) || SHIPS[type].name, paint: { color: st.color, sail: def.oarsOnly ? null : st.sail, figurehead: big ? st.figurehead : null } }) } }, ok)));
    };
    draw();
    const entry = ui.openPanel(body, { wide: true, onClose: () => { if (!done) { done = true; stage.dispose(); resolve(null); } } });
  });
}

/** A turning 3D model of a ship of `type` on its own little stage, repainted with set(). */
function shipStage(type, jr) {
  const el = h('div.sd-stage');
  const canvas = document.createElement('canvas');
  el.appendChild(canvas);
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  } catch (e) { el.appendChild(h('p.muted', 'No 3D preview on this device.')); }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x55708a, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(4, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe3ff, 1.2); rim.position.set(-5, 3, -4); scene.add(rim);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x2a6a9c, transparent: true, opacity: 0.55, depthWrite: false }));
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);
  const camera = new THREE.PerspectiveCamera(30, 1.4, 0.1, 500);
  const def = SHIPS[type], d = shipDims(def);
  const R = Math.max(d.L, 4);
  sea.scale.setScalar(R * 0.75);
  let view = null, yaw = 0.7, dragging = false, lastX = 0, raf = 0, last = performance.now();
  const stub = { type, def, name: def.name, jr, owner: 'player', faction: 'player', heading: 0, x: 0, y: 0, speed: 0, sail: 1, sailSet: 1, anchored: true, hull: 1, maxHull: 1, aboard: new Set(), paint: null };
  const build = () => {
    if (view) { scene.remove(view.root); view.dispose?.(); view = null; }
    try { view = new ShipView(stub); scene.add(view.root); } catch (e) { console.warn('ship preview', e); }
  };
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!dragging) yaw += dt * 0.25;
    const w = el.clientWidth || 420, hh = el.clientHeight || 300;
    if (renderer) {
      if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); }
      // (far enough back to take her in, masts and all)
      const dist = R * 2.1 + 4, top = d.big ? R * 0.42 : R * 0.3;
      camera.position.set(Math.cos(yaw) * dist, top + R * 0.3, Math.sin(yaw) * dist);
      camera.lookAt(0, top * 0.75, 0);
      renderer.render(scene, camera);
    }
  };
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (dragging) { yaw += (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  raf = requestAnimationFrame(frame);
  return {
    el,
    set(p) { stub.paint = { color: p.color, sail: p.sail, figurehead: p.figurehead || undefined }; build(); },
    dispose() { cancelAnimationFrame(raf); if (view) { scene.remove(view.root); view.dispose?.(); } renderer?.dispose(); },
  };
}
