// 3D town buildings from the town generator's building records: walls,
// a roof in the town's style, a door on the street side, windows that glow
// at night, and a shop sign with the shop's icon.
import * as THREE from 'three';
import { toon } from './materials.js';
import { uiIcon } from '../render/icons.js';

const ROLE_ICON = {
  tavern: 'bar', bar: 'bar', inn: 'inn', shop: 'shop', market: 'shop', weapons: 'sword', dojo: 'trainer', doctor: 'doctor', shipwright: 'shipwright',
  marine_base: 'marine', bounty: 'bounty', trainer: 'trainer', library: 'library', bank: 'berries', cafe: 'bar', restaurant: 'food', church: 'help',
};
const signTex = new Map();
function iconTexture(name) {
  let t = signTex.get(name);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#f5e6c4'; g.strokeStyle = '#5a3a22'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(4, 4, 88, 88, 12); g.fill(); g.stroke();
  try { g.drawImage(uiIcon(name, 48), 16, 16, 64, 64); } catch { /* no icon */ }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  signTex.set(name, t);
  return t;
}

const windowMat = new THREE.MeshToonMaterial({ color: 0x2b3a4a, emissive: 0x000000 });
export function setNightWindows(k) {
  windowMat.emissive.setRGB(1.0 * k, 0.78 * k, 0.42 * k);
}

export function buildBuilding(b) {
  const fw = b.fw || 3, fd = b.fd || 3;
  const g = new THREE.Group();
  const floors = Math.max(1, Math.min(4, (b.hgt || 2) - 1));
  const wallH = 2.4 + floors * 1.35;
  const wallCol = new THREE.Color(b.wall || '#d8c29d').getHex();
  const roofCol = new THREE.Color(b.roof || '#9c4a2a').getHex();
  // walls (extend below ground to hide slopes)
  const body = new THREE.Mesh(new THREE.BoxGeometry(fw, wallH + 1.5, fd), toon(wallCol));
  body.position.set(0, (wallH - 1.5) / 2, -fd / 2);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  // trim at the base and the top
  const trimMat = toon(new THREE.Color(wallCol).multiplyScalar(0.72).getHex());
  const trim = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.08, 0.18, fd + 0.08), trimMat);
  trim.position.set(0, wallH, -fd / 2);
  g.add(trim);
  // roof
  const rt = b.roofType || 'gable';
  const roofMat = toon(roofCol);
  if (rt === 'flat' || rt === 'ruin') {
    const r = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.3, 0.3, fd + 0.3), roofMat);
    r.position.set(0, wallH + 0.15, -fd / 2);
    g.add(r);
  } else if (rt === 'dome') {
    const r = new THREE.Mesh(new THREE.SphereGeometry(Math.min(fw, fd) * 0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), roofMat);
    r.position.set(0, wallH, -fd / 2);
    g.add(r);
  } else {
    // gable (pagoda styles get a flared double roof)
    const rh = Math.min(3, fd * 0.45 + 0.5);
    const shape = new THREE.Shape();
    const ov = rt === 'pagoda' ? 0.7 : 0.35;
    shape.moveTo(-fd / 2 - ov, 0); shape.lineTo(0, rh); shape.lineTo(fd / 2 + ov, 0); shape.lineTo(-fd / 2 - ov, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: fw + ov * 1.2, bevelEnabled: false });
    geo.translate(0, 0, -(fw + ov * 1.2) / 2);
    geo.rotateY(Math.PI / 2);
    const r = new THREE.Mesh(geo, roofMat);
    r.position.set(0, wallH + 0.05, -fd / 2);
    r.castShadow = true;
    g.add(r);
    if (rt === 'pagoda') {
      const r2 = r.clone();
      r2.scale.set(0.7, 0.8, 0.7);
      r2.position.y = wallH + rh * 0.55;
      g.add(r2);
    }
  }
  // door on the street side (the front is +z, towards the building's y)
  const doorMat = toon(0x4e342e);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.08), doorMat);
  const dx = (b.door?.x ?? b.x) - b.x;
  door.position.set(Math.max(-fw / 2 + 0.6, Math.min(fw / 2 - 0.6, dx)), 1.0, 0.03);
  g.add(door);
  // windows
  const winW = 0.7, winH = 0.8;
  const cols = Math.max(1, Math.floor(fw / 1.6));
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < cols + 1; i++) {
      const x = -fw / 2 + (i + 0.5) * (fw / (cols + 1));
      if (f === 0 && Math.abs(x - door.position.x) < 0.9) continue;
      const w = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.06), windowMat);
      w.position.set(x, 1.4 + f * 1.35 + 0.2, 0.03);
      g.add(w);
    }
    // side windows
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.06, winH, winW), windowMat);
      w.position.set(sx * (fw / 2 + 0.03), 1.6 + f * 1.35, -fd / 2);
      g.add(w);
    }
  }
  // shop sign
  const icon = ROLE_ICON[b.role];
  if (icon) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: iconTexture(icon), fog: true }));
    sign.position.set(door.position.x + 1.0, 2.5, 0.12);
    g.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), doorMat);
    post.position.set(door.position.x + 1.0, 2.95, -0.1);
    g.add(post);
  }
  if (b.role === 'marine_base') {
    const band = new THREE.Mesh(new THREE.BoxGeometry(fw * 0.8, 0.5, 0.06), toon(0xf5f6fa));
    band.position.set(0, wallH - 0.5, 0.05);
    g.add(band);
  }
  g.userData.height = wallH + 2;
  return g;
}
