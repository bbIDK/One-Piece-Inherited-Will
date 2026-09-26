// 3D ships: a curved wooden hull, deck, masts and sails. The main sail and
// the masthead flag show the owner's colours: the player's Jolly Roger once
// they found a crew, the Marine gull for Marines, pirate flags for pirates.
import * as THREE from 'three';
import { toon, canvasTexture } from './materials.js';
import { drawJollyRoger, drawMarineEmblem } from '../render/ship.js';

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k); else c.lerp(new THREE.Color(1, 1, 1), k);
  return c;
};

/** Half-width of the hull at t along the length (0 = stern, 1 = bow). */
function halfBeam(t, B) {
  if (t > 0.72) { const k = (t - 0.72) / 0.28; return B / 2 * Math.sqrt(Math.max(0, 1 - k * k)); }
  if (t < 0.08) return B / 2 * (0.78 + t / 0.08 * 0.22);
  return B / 2;
}

function hullGeometry(L, B, D) {
  // rings along the length: deck edge → waterline → keel
  const segs = 18, prof = [[1, 0], [0.96, -0.45], [0.8, -0.8], [0.45, -1.0], [0, -1.05]];
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = -L / 2 + t * L;
    const hb = Math.max(0.02, halfBeam(t, B));
    const sheer = 0.12 * Math.pow(Math.abs(t - 0.45) * 2, 2) * D; // deck curves up at bow & stern
    for (let side = -1; side <= 1; side += 2) {
      for (const [w, d] of prof) pos.push(x, d * D + sheer, side * hb * w);
    }
  }
  const P = prof.length;
  const ring = P * 2;
  for (let i = 0; i < segs; i++) {
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < P - 1; k++) {
        const a = i * ring + side * P + k, b = a + 1, c = a + ring, d = c + 1;
        if (side === 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    }
  }
  // stern transom
  const s0 = 0;
  for (let k = 0; k < P - 1; k++) idx.push(s0 + k, s0 + P + k, s0 + k + 1, s0 + k + 1, s0 + P + k, s0 + P + k + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function deckGeometry(L, B) {
  const shape = new THREE.Shape();
  const n = 16;
  for (let i = 0; i <= n; i++) { const t = i / n; const x = -L / 2 + t * L; const hb = halfBeam(t, B) * 0.94; if (i === 0) shape.moveTo(x, -hb); else shape.lineTo(x, -hb); }
  for (let i = n; i >= 0; i--) { const t = i / n; const x = -L / 2 + t * L; const hb = halfBeam(t, B) * 0.94; shape.lineTo(x, hb); }
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** Texture for a sail showing an emblem. */
function sailTexture(kind, jr) {
  const { canvas, ctx: g, tex } = canvasTexture(256, 256);
  g.fillStyle = kind === 'marine' ? '#f5f6fa' : '#efe6cf';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(80,60,40,0.25)'; g.lineWidth = 3;
  for (let x = 32; x < 256; x += 42) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.setTransform(150, 0, 0, 150, 128, 132);
  if (kind === 'marine') drawMarineEmblem(g, 1);
  else if (jr) drawJollyRoger(g, jr, 1, '#efe6cf');
  g.setTransform(1, 0, 0, 1, 0, 0);
  tex.needsUpdate = true;
  void canvas;
  return tex;
}

function flagTexture(kind, jr) {
  const { ctx: g, tex } = canvasTexture(128, 96);
  g.fillStyle = kind === 'marine' ? '#f5f6fa' : '#141414';
  g.fillRect(0, 0, 128, 96);
  g.setTransform(70, 0, 0, 70, 64, 50);
  if (kind === 'marine') drawMarineEmblem(g, 1); else if (jr) drawJollyRoger(g, jr, 1, '#141414');
  tex.needsUpdate = true;
  return tex;
}

export class ShipView {
  constructor(s) {
    this.ship = s;
    const def = s.def;
    const L = def.length, B = def.beam, D = Math.max(0.6, B * 0.42);
    const root = new THREE.Group();
    const hullCol = def.color || '#8d5b33';
    const hull = new THREE.Mesh(hullGeometry(L, B, D), toon(shade(hullCol, -0.15).getHex(), { side: THREE.DoubleSide }));
    hull.castShadow = true;
    root.add(hull);
    const deck = new THREE.Mesh(deckGeometry(L, B), toon(def.seastone ? 0xdfe6e9 : shade(hullCol, 0.2).getHex(), { side: THREE.DoubleSide }));
    deck.position.y = -0.02;
    root.add(deck);
    // railing
    const railMat = toon(shade(hullCol, -0.35).getHex());
    const rail = new THREE.Mesh(new THREE.BoxGeometry(L * 0.8, 0.12, 0.08), railMat);
    for (const side of [-1, 1]) { const r = rail.clone(); r.position.set(-L * 0.05, 0.3, side * B * 0.46); root.add(r); }
    // masts & sails
    this.sails = [];
    const kind = this.flagKind();
    const masts = def.masts || 1;
    const mastH = 2.2 + L * 0.42;
    const mastMat = toon(0x5d4037);
    for (let m = 0; m < masts; m++) {
      const mx = masts === 1 ? 0.05 * L : L * (0.28 - m * (0.56 / Math.max(1, masts - 1)));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, mastH, 8), mastMat);
      mast.position.set(mx, mastH / 2, 0);
      mast.castShadow = true;
      root.add(mast);
      const main = m === (masts > 1 ? 1 : 0) || masts === 1;
      const sw = B * (m === 0 && masts > 1 ? 1.35 : 1.6);
      const sh = mastH * 0.62;
      const sailGeo = new THREE.PlaneGeometry(sw, sh, 6, 4);
      sailGeo.rotateY(Math.PI / 2);
      const tex = main && kind !== 'none' ? sailTexture(kind, s.jr) : null;
      const sailMat = new THREE.MeshToonMaterial({ color: tex ? 0xffffff : 0xefe6cf, map: tex, side: THREE.DoubleSide });
      const sail = new THREE.Mesh(sailGeo, sailMat);
      sail.position.set(mx + 0.18, mastH * 0.52, 0);
      sail.castShadow = true;
      sail.userData.base = sailGeo.attributes.position.array.slice();
      root.add(sail);
      this.sails.push({ mesh: sail, sw, sh });
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, sw * 1.05, 6), mastMat);
      yard.rotation.x = Math.PI / 2;
      yard.position.set(mx + 0.12, mastH * 0.52 + sh / 2, 0);
      root.add(yard);
    }
    // flag at the masthead
    if (kind !== 'none') {
      const fg = new THREE.PlaneGeometry(1.0, 0.7, 4, 1);
      fg.translate(0.5, 0, 0);
      const flag = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: flagTexture(kind, s.jr), side: THREE.DoubleSide, fog: true }));
      const mx0 = masts === 1 ? 0.05 * L : L * 0.28;
      flag.position.set(mx0, mastH + 0.2, 0);
      flag.userData.base = fg.attributes.position.array.slice();
      root.add(flag);
      this.flag = flag;
    }
    this.root = root;
    this.kindKey = kind + ':' + JSON.stringify(s.jr || null);
  }

  flagKind() {
    const s = this.ship;
    if (s.def.sail === 'marine' || s.faction === 'marine' || (s.owner === 'player' && s.game?.state?.char?.faction === 'marine')) return 'marine';
    if (s.jr) return 'jr';
    return 'none';
  }

  /** True when the colours changed (e.g. the player founded a crew) and the view must be rebuilt. */
  stale() { return this.kindKey !== this.flagKind() + ':' + JSON.stringify(this.ship.jr || null); }

  update(env, rx, rz, windAngle, ctx) {
    const s = this.ship;
    const r = this.root;
    // from the helm of your own ship the sails are see-through, so you can steer
    const own = ctx?.game?.player?.ship === s && ctx.game.player.mode === 'sail' && ctx.mode === 'first';
    if (own !== this.ghost) {
      this.ghost = own;
      for (const sl of this.sails) { sl.mesh.material.transparent = own; sl.mesh.material.opacity = own ? 0.28 : 1; sl.mesh.material.depthWrite = !own; sl.mesh.material.needsUpdate = true; }
    }
    const t = env.time + (s.seed || 0);
    const sinking = s.sunk ? Math.min(1, s.sinkT / 4) : 0;
    r.position.set(rx, 0.05 + Math.sin(t * 1.3) * 0.07 - sinking * 3, rz);
    r.rotation.set(Math.sin(t * 0.9) * 0.035 + sinking * 0.5, -s.heading, Math.sin(t * 1.1) * 0.02, 'YXZ');
    // sails fill with the wind
    const rel = Math.cos((windAngle || 0) - s.heading);
    const billow = (0.15 + (s.sailSet ?? 0.5) * 0.45) * (0.6 + 0.4 * Math.max(0, rel));
    for (const sl of this.sails) {
      const set = s.sailSet ?? 0.5;
      sl.mesh.visible = set > 0.05;
      sl.mesh.scale.y = 0.35 + set * 0.65;
      const a = sl.mesh.geometry.attributes.position;
      const base = sl.mesh.userData.base;
      for (let i = 0; i < a.count; i++) {
        const z = base[i * 3 + 2], y = base[i * 3 + 1];
        const k = 1 - (z / (sl.sw / 2)) ** 2;
        const kv = 1 - (y / (sl.sh / 2)) ** 2 * 0.5;
        a.array[i * 3] = base[i * 3] + billow * k * kv;
      }
      a.needsUpdate = true;
    }
    if (this.flag) {
      const a = this.flag.geometry.attributes.position, base = this.flag.userData.base;
      for (let i = 0; i < a.count; i++) {
        const x = base[i * 3];
        a.array[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * 7 + x * 4) * 0.08 * x;
      }
      a.needsUpdate = true;
      this.flag.rotation.y = (s.heading - (windAngle || 0)) + Math.PI;
    }
  }

  dispose() {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material?.map) o.material.map.dispose(); });
  }
}
