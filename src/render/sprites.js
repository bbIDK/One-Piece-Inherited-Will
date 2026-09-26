// Procedural art for world props. All drawing functions work in tile units
// with the origin at the object's base point (bottom-centre of its footprint);
// +y is down on screen, so things "stand up" into negative y.
import { uiIcon } from './icons.js';
import { shade, mixHex } from '../core/math.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// sprite cache for small repeated props (trees, rocks, bushes)
const PX = 64; // cache resolution in px per tile
const cache = new Map();

export function cachedSprite(key, wTiles, hTiles, draw) {
  let s = cache.get(key);
  if (s) return s;
  const c = document.createElement('canvas');
  c.width = Math.ceil(wTiles * PX);
  c.height = Math.ceil(hTiles * PX);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height - PX * 0.35);
  g.scale(PX, PX);
  draw(g);
  s = { canvas: c, w: wTiles, h: hTiles, ax: wTiles / 2, ay: hTiles - 0.35 };
  cache.set(key, s);
  return s;
}

export function drawCached(ctx, s, x, y, scale = 1) {
  ctx.drawImage(s.canvas, x - s.ax * scale, y - s.ay * scale, s.w * scale, s.h * scale);
}

function blob(g, x, y, r, fill, outline) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = fill;
  g.fill();
  if (outline) { g.lineWidth = 0.05; g.strokeStyle = outline; g.stroke(); }
}

function canopy(g, cx, cy, r, base, n = 5, seed = 0) {
  const dark = shade(base, -0.28), light = shade(base, 0.22), line = shade(base, -0.5);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + seed;
    pts.push([cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.35, r * (0.55 + ((i * 37 + seed * 11) % 7) / 20)]);
  }
  pts.push([cx, cy - r * 0.15, r * 0.7]);
  for (const [x, y, rr] of pts) blob(g, x, y + rr * 0.12, rr, dark, line);
  for (const [x, y, rr] of pts) blob(g, x, y, rr * 0.92, base);
  for (const [x, y, rr] of pts) blob(g, x - rr * 0.25, y - rr * 0.28, rr * 0.45, light);
}

function trunk(g, h, w = 0.18, col = '#6d4c33') {
  g.fillStyle = shade(col, -0.25);
  g.fillRect(-w / 2, -h, w, h);
  g.fillStyle = col;
  g.fillRect(-w / 2, -h, w * 0.55, h);
}

const TREE_COLORS = {
  oak: ['#3f9a3a', '#4aa843', '#378f35', '#52b04a'],
  autumn: ['#d35400', '#e67e22', '#c0392b', '#f39c12'],
  sakura: ['#f8b4cf', '#f5a3c4', '#fbc6dc', '#f29bbf'],
  blossom: ['#f7d6e4', '#fff0f6', '#fde2ec', '#f9cfe0'],
  jungle: ['#2e8b3a', '#237a33', '#3a9e45', '#1f6f2e'],
  spooky: ['#4b3b5b', '#3c3050', '#56466a', '#352a47'],
  cottoncandy: ['#f8a5c2', '#9ad0f5', '#f7c1d9', '#b8e0f7'],
  cloudtree: ['#ffffff', '#f4f8ff', '#eef4ff', '#ffffff'],
};

export function treeSprite(sub, v) {
  const key = `tree:${sub}:${v}`;
  const sizes = { palm: [2.6, 3.6], pine: [2, 3.4], snowpine: [2, 3.4], jungle: [3, 3.6], cactus: [1.6, 2.4], dead: [2, 2.8], deadsnow: [2, 2.8], lollipop: [1.8, 3], candycane: [1.4, 2.8], bamboo: [1.6, 3.6], coral: [2, 2.4], kelp: [1.6, 3], spooky: [2.6, 3.4] };
  const [w, h] = sizes[sub] || [2.6, 3.2];
  return cachedSprite(key, w, h, (g) => drawTree(g, sub, v));
}

/** Fruit hanging on a tree that bears it (see world/fruitTrees.js). */
export function drawTreeFruit(g, o, fruit, spots, colors) {
  const [c1, c2] = colors;
  for (const [x, y, r] of spots) {
    if (fruit === 'banana') {
      g.fillStyle = c1; g.strokeStyle = c2; g.lineWidth = 0.03;
      g.beginPath(); g.ellipse(x, y, r * 0.55, r * 1.25, 0.5, 0, TAU); g.fill(); g.stroke();
      continue;
    }
    blob(g, x, y, r, c1, c2);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, TAU); g.fill();
  }
}

function drawTree(g, sub, v) {
  const r = (n) => ((v * 9301 + n * 49297) % 233280) / 233280;
  // soft shadow
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.ellipse(0.15, -0.05, 0.75, 0.28, 0, 0, TAU); g.fill();
  switch (sub) {
    case 'palm': {
      const lean = (r(1) - 0.5) * 0.9;
      g.strokeStyle = '#8d6e4a'; g.lineWidth = 0.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(lean * 0.3, -1.4, lean, -2.5); g.stroke();
      g.strokeStyle = '#6d5236'; g.lineWidth = 0.05;
      for (let k = 0.3; k < 2.4; k += 0.28) { const t = k / 2.5; g.beginPath(); g.moveTo(lean * t * t - 0.1, -k); g.lineTo(lean * t * t + 0.1, -k - 0.05); g.stroke(); }
      const top = [lean, -2.5];
      const fronds = 7;
      for (let i = 0; i < fronds; i++) {
        const a = (i / fronds) * TAU + r(2);
        const len = 1.1 + r(i + 3) * 0.35;
        const ex = top[0] + Math.cos(a) * len, ey = top[1] + Math.sin(a) * len * 0.55 + 0.35;
        g.strokeStyle = i % 2 ? '#2f9e44' : '#37b24d';
        g.lineWidth = 0.22;
        g.beginPath(); g.moveTo(top[0], top[1]); g.quadraticCurveTo((top[0] + ex) / 2, top[1] - 0.35, ex, ey); g.stroke();
        g.strokeStyle = '#1f7a33'; g.lineWidth = 0.05; g.stroke();
      }
      // (coconuts are drawn live by drawTreeFruit, so picked palms are bare)
      break;
    }
    case 'pine':
    case 'snowpine': {
      trunk(g, 0.6, 0.2, '#5d4030');
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const y = -0.45 - i * 0.62, w = 0.95 - i * 0.18;
        g.fillStyle = shade('#2d6a4f', -0.1 + i * 0.05);
        g.beginPath(); g.moveTo(-w, y); g.lineTo(0, y - 0.95); g.lineTo(w, y); g.closePath(); g.fill();
        g.fillStyle = shade('#40916c', i * 0.04);
        g.beginPath(); g.moveTo(-w * 0.9, y - 0.02); g.lineTo(0, y - 0.95); g.lineTo(-w * 0.05, y - 0.02); g.closePath(); g.fill();
        if (sub === 'snowpine') {
          g.fillStyle = '#f4f9ff';
          g.beginPath(); g.moveTo(-w * 0.55, y - 0.4); g.lineTo(0, y - 0.95); g.lineTo(w * 0.55, y - 0.4); g.quadraticCurveTo(0, y - 0.3, -w * 0.55, y - 0.4); g.fill();
        }
      }
      break;
    }
    case 'cactus': {
      g.fillStyle = '#3f8f3f'; g.strokeStyle = '#2a6a2a'; g.lineWidth = 0.05;
      const rr = (x, y, w, h) => { g.beginPath(); g.roundRect(x, y, w, h, w / 2); g.fill(); g.stroke(); };
      rr(-0.16, -1.9, 0.32, 1.9);
      rr(-0.62, -1.3, 0.26, 0.7); rr(-0.62, -0.75, 0.5, 0.22);
      if (v % 2) { rr(0.36, -1.55, 0.26, 0.8); rr(0.1, -0.95, 0.5, 0.22); }
      g.fillStyle = '#6fbf5f'; g.fillRect(-0.08, -1.8, 0.06, 1.7);
      if (v === 2) blob(g, 0, -1.95, 0.12, '#ff6b9a');
      break;
    }
    case 'dead':
    case 'deadsnow':
    case 'spooky': {
      const col = sub === 'spooky' ? '#3b2f3f' : '#6b5a4a';
      g.strokeStyle = col; g.lineCap = 'round';
      const branch = (x, y, a, len, w, depth) => {
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
        if (depth > 0) {
          branch(ex, ey, a - 0.5 - r(depth) * 0.3, len * 0.7, w * 0.65, depth - 1);
          branch(ex, ey, a + 0.45 + r(depth + 5) * 0.3, len * 0.66, w * 0.65, depth - 1);
        }
      };
      branch(0, 0, -Math.PI / 2 + (r(1) - 0.5) * 0.3, 1.2, 0.2, 3);
      if (sub === 'deadsnow') { g.strokeStyle = '#f4f9ff'; g.lineWidth = 0.06; branch(0, -0.02, -Math.PI / 2, 1.15, 0.06, 2); }
      if (sub === 'spooky') {
        canopy(g, 0, -2.3, 0.75, TREE_COLORS.spooky[v % 4], 4, v);
        blob(g, -0.2, -2.3, 0.07, '#f1c40f'); blob(g, 0.15, -2.28, 0.07, '#f1c40f');
      }
      break;
    }
    case 'lollipop': {
      g.fillStyle = '#fdfefe'; g.fillRect(-0.06, -2, 0.12, 2);
      const cols = ['#e74c3c', '#9b59b6', '#3498db', '#f39c12'];
      const c = cols[v % 4];
      blob(g, 0, -2.2, 0.7, c, shade(c, -0.4));
      g.strokeStyle = '#ffffff'; g.lineWidth = 0.12;
      g.beginPath();
      for (let a = 0; a < TAU * 2.2; a += 0.2) { const rr2 = 0.06 + a * 0.045; g.lineTo(Math.cos(a) * rr2, -2.2 + Math.sin(a) * rr2); }
      g.stroke();
      break;
    }
    case 'candycane': {
      g.lineCap = 'round';
      g.lineWidth = 0.3; g.strokeStyle = '#ffffff';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -1.9); g.arc(0.35, -1.9, 0.35, Math.PI, 0); g.stroke();
      g.strokeStyle = '#e74c3c'; g.lineWidth = 0.3; g.setLineDash([0.18, 0.18]);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -1.9); g.arc(0.35, -1.9, 0.35, Math.PI, 0); g.stroke();
      g.setLineDash([]);
      break;
    }
    case 'bamboo': {
      for (let i = -2; i <= 2; i++) {
        const x = i * 0.22, hh = 2.6 + r(i + 3) * 0.8;
        g.fillStyle = i % 2 ? '#7cb342' : '#8bc34a';
        g.fillRect(x - 0.07, -hh, 0.14, hh);
        g.fillStyle = '#558b2f';
        for (let y = 0.5; y < hh; y += 0.55) g.fillRect(x - 0.08, -y, 0.16, 0.04);
        g.fillStyle = '#9ccc65';
        g.beginPath(); g.ellipse(x + 0.2, -hh + 0.2, 0.28, 0.08, -0.5, 0, TAU); g.fill();
      }
      break;
    }
    case 'coral': {
      const c = ['#ff7675', '#fd79a8', '#fdcb6e', '#a29bfe'][v % 4];
      g.strokeStyle = c; g.lineCap = 'round';
      const br = (x, y, a, len, w, d) => {
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
        if (d > 0) { br(ex, ey, a - 0.6, len * 0.75, w * 0.8, d - 1); br(ex, ey, a + 0.6, len * 0.75, w * 0.8, d - 1); }
      };
      br(0, 0, -Math.PI / 2, 0.8, 0.22, 3);
      break;
    }
    case 'kelp': {
      g.strokeStyle = '#27ae60'; g.lineWidth = 0.14; g.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        g.beginPath(); g.moveTo(i * 0.25, 0);
        for (let y = 0; y > -2.6; y -= 0.2) g.lineTo(i * 0.25 + Math.sin(y * 3 + i) * 0.15, y);
        g.stroke();
      }
      break;
    }
    default: {
      // broadleaf family: oak, autumn, sakura, blossom, jungle, cottoncandy, cloudtree
      const pal = TREE_COLORS[sub] || TREE_COLORS.oak;
      const base = pal[v % pal.length];
      const tall = sub === 'jungle' ? 1.3 : 1.0;
      trunk(g, 1.1 * tall, sub === 'jungle' ? 0.26 : 0.2, sub === 'cloudtree' ? '#c8d6e5' : sub === 'cottoncandy' ? '#f5f5f5' : '#6d4c33');
      canopy(g, 0, -1.6 * tall, sub === 'jungle' ? 1.2 : 0.95, base, 5, v * 1.3);
      if (sub === 'jungle') {
        g.strokeStyle = '#1e6b2a'; g.lineWidth = 0.05;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-0.6 + i * 0.5, -1.4); g.quadraticCurveTo(-0.5 + i * 0.5, -0.9, -0.55 + i * 0.5, -0.6); g.stroke(); }
      }
      if (sub === 'oak' && v === 3) { blob(g, -0.35, -1.5, 0.08, '#e74c3c'); blob(g, 0.3, -1.8, 0.08, '#e74c3c'); blob(g, 0.1, -1.3, 0.08, '#e74c3c'); }
      if (sub === 'sakura' || sub === 'blossom') { for (let i = 0; i < 8; i++) blob(g, (r(i) - 0.5) * 1.6, -1.6 + (r(i + 9) - 0.5) * 1.2, 0.05, '#ffffff'); }
    }
  }
}

export function rockSprite(v) {
  return cachedSprite(`rock:${v}`, 1.6, 1.4, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.ellipse(0.05, -0.05, 0.6, 0.2, 0, 0, TAU); g.fill();
    const col = ['#8e8a82', '#9a948a', '#7f7a72', '#a39d92'][v % 4];
    g.fillStyle = shade(col, -0.25);
    g.beginPath(); g.moveTo(-0.6, 0); g.lineTo(-0.5, -0.5); g.lineTo(-0.1, -0.8); g.lineTo(0.4, -0.65); g.lineTo(0.62, -0.2); g.lineTo(0.5, 0); g.closePath(); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.moveTo(-0.5, -0.1); g.lineTo(-0.45, -0.5); g.lineTo(-0.1, -0.76); g.lineTo(0.35, -0.62); g.lineTo(0.2, -0.3); g.closePath(); g.fill();
    g.fillStyle = shade(col, 0.25);
    g.beginPath(); g.moveTo(-0.4, -0.48); g.lineTo(-0.1, -0.72); g.lineTo(0.1, -0.6); g.lineTo(-0.2, -0.45); g.closePath(); g.fill();
  });
}

export function bushSprite(sub, v) {
  return cachedSprite(`bush:${sub}:${v}`, 1.4, 1.2, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(0, -0.03, 0.5, 0.16, 0, 0, TAU); g.fill();
    if (sub === 'fern') {
      g.strokeStyle = '#2e7d32'; g.lineWidth = 0.08; g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.35;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a) * 0.4, -0.5, Math.cos(a) * 0.7, Math.sin(a) * 0.5 - 0.2); g.stroke();
      }
      return;
    }
    if (sub === 'deadbush') {
      g.strokeStyle = '#8d6e4a'; g.lineWidth = 0.05;
      for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5); g.stroke(); }
      return;
    }
    const base = ['#4caf50', '#43a047', '#66bb6a', '#388e3c'][v % 4];
    canopy(g, 0, -0.35, 0.42, base, 4, v);
    if (v === 1) { blob(g, -0.15, -0.45, 0.06, '#f06292'); blob(g, 0.18, -0.38, 0.06, '#fff176'); }
  });
}

// ---------------------------------------------------------------------------
// Buildings (drawn live, they're big and unique)

// shop signs: drawn icons (render/icons.js), no emoji
const ROLE_ICON = {
  tavern: 'bar', bar: 'bar', inn: 'inn', shop: 'shop', market: 'shop', weapons: 'sword', dojo: 'trainer', doctor: 'doctor', shipwright: 'shipwright',
  marine_base: 'marine', bounty: 'bounty', trainer: 'trainer', library: 'library', bank: 'berries', cafe: 'bar', restaurant: 'food', church: 'help',
};

export function drawBuilding(g, b, night, time) {
  const fw = b.fw, fd = b.fd;
  const wallH = Math.min(b.hgt || 2, 4) * 0.75 + 0.6;
  const x0 = -fw / 2, x1 = fw / 2;
  const roofTop = -fd - wallH * 0.55;
  const wall = b.wall || '#d8c29d', roof = b.roof || '#9c4a2a';
  const style = b.style;
  const ruined = b.roofType === 'ruin';

  // ground shadow
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(x0 + 0.25, -0.1, fw, 0.35);

  // front wall
  const wy0 = -wallH;
  g.fillStyle = wall;
  g.fillRect(x0, wy0, fw, wallH);
  // material texture
  g.save();
  g.beginPath(); g.rect(x0, wy0, fw, wallH); g.clip();
  if (style === 'village' || style === 'snow' || style === 'giant' || style === 'mink' || style === 'tribal') {
    g.strokeStyle = shade(wall, -0.18); g.lineWidth = 0.035;
    for (let y = wy0 + 0.22; y < 0; y += 0.22) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
  } else if (style === 'city' || style === 'port') {
    g.strokeStyle = shade(wall, -0.2); g.lineWidth = 0.025;
    for (let y = wy0, row = 0; y < 0; y += 0.16, row++) {
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      for (let x = x0 + (row % 2) * 0.18; x < x1; x += 0.36) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 0.16); g.stroke(); }
    }
  } else if (style === 'wano' || style === 'chinese') {
    g.fillStyle = shade(wall, -0.35);
    for (let x = x0; x <= x1; x += fw / Math.max(2, Math.round(fw / 1.2))) g.fillRect(x - 0.05, wy0, 0.1, wallH);
    g.fillRect(x0, wy0 + wallH * 0.45, fw, 0.07);
  } else if (style === 'town') {
    g.strokeStyle = shade(wall, -0.45); g.lineWidth = 0.08;
    g.strokeRect(x0 + 0.04, wy0 + 0.04, fw - 0.08, wallH - 0.08);
    g.beginPath(); g.moveTo(x0, wy0 + wallH * 0.5); g.lineTo(x1, wy0 + wallH * 0.5); g.stroke();
  }
  g.restore();
  // wall bottom shade + outline
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0, -0.12, fw, 0.12);
  g.strokeStyle = shade(wall, -0.55); g.lineWidth = 0.05; g.strokeRect(x0, wy0, fw, wallH);

  // windows
  const winCount = Math.max(1, Math.floor(fw / 1.6));
  const doorX = 0;
  for (let i = 0; i < winCount + 1; i++) {
    const wx = x0 + (i + 0.5) * (fw / (winCount + 1));
    if (Math.abs(wx - doorX) < 0.7) continue;
    const wyy = wy0 + wallH * 0.28;
    const lit = night && ((i * 7 + (b.v || 0)) % 3 !== 0);
    g.fillStyle = lit ? '#ffd56b' : (style === 'sky' ? '#bde3ff' : '#3d5a6c');
    if (style === 'desert' || style === 'fishman' || style === 'candy' || style === 'sky') {
      g.beginPath(); g.ellipse(wx, wyy + 0.2, 0.2, 0.24, 0, 0, TAU); g.fill();
    } else {
      g.fillRect(wx - 0.22, wyy, 0.44, 0.4);
      g.strokeStyle = shade(wall, -0.6); g.lineWidth = 0.04; g.strokeRect(wx - 0.22, wyy, 0.44, 0.4);
      g.beginPath(); g.moveTo(wx, wyy); g.lineTo(wx, wyy + 0.4); g.stroke();
    }
    if (b.hgt >= 3 && !ruined) {
      g.fillStyle = lit ? '#ffe28a' : '#3d5a6c';
      g.fillRect(wx - 0.2, wy0 + 0.12, 0.4, 0.3);
    }
  }
  // door
  const dw = b.role === 'marine_base' || b.role === 'palace' || b.role === 'hall' ? 1.1 : 0.6;
  g.fillStyle = style === 'marine' ? '#1b4f72' : '#5a3a22';
  if (style === 'desert' || style === 'fishman' || style === 'sky') {
    g.beginPath(); g.moveTo(doorX - dw / 2, 0); g.lineTo(doorX - dw / 2, -0.55); g.arc(doorX, -0.55, dw / 2, Math.PI, 0); g.lineTo(doorX + dw / 2, 0); g.fill();
  } else {
    g.fillRect(doorX - dw / 2, -0.9, dw, 0.9);
    g.fillStyle = '#f1c40f'; g.fillRect(doorX + dw / 2 - 0.14, -0.48, 0.06, 0.06);
  }
  if (night && b.role && b.role !== 'house') {
    g.fillStyle = 'rgba(255,210,120,0.35)';
    g.fillRect(doorX - dw / 2, -0.9, dw, 0.9);
  }

  // roof
  if (!ruined) {
    const ov = 0.18;
    const rx0 = x0 - ov, rx1 = x1 + ov, ry0 = roofTop, ry1 = wy0 + 0.08;
    const rt = b.roofType;
    if (rt === 'flat') {
      g.fillStyle = shade(roof, -0.1); g.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
      g.fillStyle = roof; g.fillRect(rx0 + 0.15, ry0 + 0.15, rx1 - rx0 - 0.3, ry1 - ry0 - 0.3);
      g.strokeStyle = shade(roof, -0.45); g.lineWidth = 0.05; g.strokeRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
      if (style === 'desert' && fw >= 4) {
        const dc = shade(wall, 0.15);
        blob(g, 0, (ry0 + ry1) / 2, Math.min(fw, fd) * 0.32, dc, shade(wall, -0.4));
        blob(g, -0.2, (ry0 + ry1) / 2 - 0.2, Math.min(fw, fd) * 0.12, shade(wall, 0.35));
      }
    } else if (rt === 'dome' || rt === 'shell') {
      g.fillStyle = shade(roof, -0.2);
      g.beginPath(); g.ellipse(0, (ry0 + ry1) / 2 + 0.1, (rx1 - rx0) / 2, (ry1 - ry0) / 2 + 0.15, 0, 0, TAU); g.fill();
      g.fillStyle = roof;
      g.beginPath(); g.ellipse(0, (ry0 + ry1) / 2, (rx1 - rx0) / 2 - 0.08, (ry1 - ry0) / 2, 0, 0, TAU); g.fill();
      g.fillStyle = shade(roof, 0.3);
      g.beginPath(); g.ellipse(-(rx1 - rx0) * 0.15, (ry0 + ry1) / 2 - (ry1 - ry0) * 0.18, (rx1 - rx0) * 0.2, (ry1 - ry0) * 0.15, -0.3, 0, TAU); g.fill();
      if (rt === 'shell') {
        g.strokeStyle = shade(roof, -0.35); g.lineWidth = 0.05;
        for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(0, ry1); g.lineTo(k * (rx1 - rx0) * 0.2, ry0 + 0.2); g.stroke(); }
      }
      if (style === 'candy') {
        g.fillStyle = '#ffffff';
        for (let k = 0; k < 6; k++) blob(g, rx0 + 0.3 + k * (rx1 - rx0 - 0.6) / 5, ry1 - 0.05, 0.14, '#ffffff');
        blob(g, 0, ry0 + 0.1, 0.18, '#e74c3c');
      }
    } else if (rt === 'hut') {
      g.fillStyle = shade(roof, -0.2);
      g.beginPath(); g.moveTo(rx0 - 0.1, ry1 + 0.05); g.lineTo(0, ry0 - 0.5); g.lineTo(rx1 + 0.1, ry1 + 0.05); g.closePath(); g.fill();
      g.fillStyle = roof;
      g.beginPath(); g.moveTo(rx0, ry1); g.lineTo(0, ry0 - 0.45); g.lineTo(0, ry1); g.closePath(); g.fill();
      g.strokeStyle = shade(roof, -0.35); g.lineWidth = 0.03;
      for (let k = 0; k < 8; k++) { const t = k / 8; g.beginPath(); g.moveTo(0, ry0 - 0.45); g.lineTo(rx0 + (rx1 - rx0) * t, ry1); g.stroke(); }
    } else {
      // gable / pagoda
      const ridge = ry0 + (ry1 - ry0) * 0.38;
      const pag = rt === 'pagoda';
      const lift = pag ? 0.25 : 0;
      g.fillStyle = shade(roof, 0.18); // back slope
      g.beginPath(); g.moveTo(rx0, ridge); g.lineTo(rx0 + 0.1, ry0); g.lineTo(rx1 - 0.1, ry0); g.lineTo(rx1, ridge); g.closePath(); g.fill();
      g.fillStyle = roof; // front slope
      g.beginPath();
      g.moveTo(rx0 - lift, ry1 - lift);
      if (pag) g.quadraticCurveTo(rx0 + 0.3, ry1 - 0.05, rx0 + 0.4, ry1);
      g.lineTo(rx1 - (pag ? 0.4 : 0), ry1);
      if (pag) g.quadraticCurveTo(rx1 - 0.3, ry1 - 0.05, rx1 + lift, ry1 - lift);
      g.lineTo(rx1, ridge); g.lineTo(rx0, ridge); g.closePath(); g.fill();
      // tile rows
      g.strokeStyle = shade(roof, -0.25); g.lineWidth = 0.035;
      for (let y = ridge + 0.2; y < ry1; y += 0.2) { g.beginPath(); g.moveTo(rx0, y); g.lineTo(rx1, y); g.stroke(); }
      if (style === 'wano' || style === 'chinese' || style === 'village' || style === 'snow') {
        for (let x = rx0 + 0.25; x < rx1; x += 0.3) { g.beginPath(); g.moveTo(x, ridge); g.lineTo(x, ry1); g.stroke(); }
      }
      g.strokeStyle = shade(roof, -0.5); g.lineWidth = 0.06;
      g.beginPath(); g.moveTo(rx0, ridge); g.lineTo(rx1, ridge); g.stroke();
      g.strokeRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
      if (style === 'snow') {
        g.fillStyle = '#ffffff';
        g.beginPath(); g.moveTo(rx0, ridge); g.lineTo(rx1, ridge); g.lineTo(rx1, ridge + 0.25);
        for (let x = rx1; x > rx0; x -= 0.3) g.lineTo(x - 0.15, ridge + 0.25 + ((x * 7) % 1) * 0.15);
        g.closePath(); g.fill();
      }
      // chimney
      if ((style === 'village' || style === 'snow' || style === 'town') && b.role === 'house' && fw >= 4) {
        const chx = rx1 - 0.8;
        g.fillStyle = '#7b5e57'; g.fillRect(chx, ry0 - 0.2, 0.35, 0.6);
        g.fillStyle = '#5d4037'; g.fillRect(chx - 0.05, ry0 - 0.25, 0.45, 0.1);
        if (time !== undefined) {
          for (let k = 0; k < 3; k++) {
            const t = (time * 0.4 + k / 3 + (b.v || 0) * 0.13) % 1;
            g.fillStyle = `rgba(220,220,220,${0.45 * (1 - t)})`;
            blob(g, chx + 0.18 + Math.sin(t * 4 + k) * 0.15, ry0 - 0.3 - t * 1.2, 0.12 + t * 0.2, `rgba(225,225,225,${0.4 * (1 - t)})`);
          }
        }
      }
    }
    // eave shadow on the wall
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x0, wy0 + 0.08, fw, 0.14);
  } else {
    // ruined: broken wall tops
    g.fillStyle = shade(wall, -0.2);
    g.beginPath(); g.moveTo(x0, wy0);
    for (let x = x0; x <= x1; x += 0.4) g.lineTo(x, wy0 - ((x * 13.7) % 1) * 0.6);
    g.lineTo(x1, wy0); g.closePath(); g.fill();
  }

  // role sign
  const icon = ROLE_ICON[b.role];
  if (icon) {
    if (b.role === 'marine_base') {
      g.fillStyle = '#ffffff'; g.fillRect(-1.3, wy0 - 0.05, 2.6, 0.5);
      g.strokeStyle = '#1b4f72'; g.lineWidth = 0.05; g.strokeRect(-1.3, wy0 - 0.05, 2.6, 0.5);
      g.fillStyle = '#1b4f72'; g.font = 'bold 0.36px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('MARINE', 0, wy0 + 0.2);
    } else {
      const sy = -1.25;
      g.fillStyle = '#6d4c33'; g.fillRect(0.45, sy - 0.05, 0.05, 0.3);
      g.fillStyle = '#f5e6c4'; g.strokeStyle = '#5a3a22'; g.lineWidth = 0.04;
      g.beginPath(); g.roundRect(0.5, sy - 0.1, 0.62, 0.48, 0.06); g.fill(); g.stroke();
      g.drawImage(uiIcon(icon, 32), 0.81 - 0.21, sy + 0.14 - 0.21, 0.42, 0.42);
    }
  }
  if (b.name && b.role && b.role !== 'house' && b.showName) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.font = 'bold 0.3px Nunito, sans-serif'; g.textAlign = 'center';
    g.fillText(b.name, 0, roofTop - 0.2);
  }
}

// ---------------------------------------------------------------------------
// Misc props

export function drawProp(g, o, t, night) {
  switch (o.kind) {
    case 'barrel': {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(0, 0, 0.35, 0.12, 0, 0, TAU); g.fill();
      g.fillStyle = '#8d5b33'; g.beginPath(); g.roundRect(-0.3, -0.75, 0.6, 0.75, 0.12); g.fill();
      g.fillStyle = '#a86f3f'; g.fillRect(-0.3, -0.7, 0.2, 0.62);
      g.fillStyle = '#4a4a4a'; g.fillRect(-0.3, -0.6, 0.6, 0.06); g.fillRect(-0.3, -0.2, 0.6, 0.06);
      g.fillStyle = '#6d4526'; g.beginPath(); g.ellipse(0, -0.75, 0.3, 0.1, 0, 0, TAU); g.fill();
      break;
    }
    case 'crate': {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-0.3, -0.05, 0.7, 0.15);
      g.fillStyle = '#b08850'; g.fillRect(-0.35, -0.7, 0.7, 0.7);
      g.fillStyle = '#c9a063'; g.fillRect(-0.35, -0.85, 0.7, 0.2);
      g.strokeStyle = '#7a5a30'; g.lineWidth = 0.05; g.strokeRect(-0.35, -0.7, 0.7, 0.7);
      g.beginPath(); g.moveTo(-0.35, -0.7); g.lineTo(0.35, 0); g.moveTo(0.35, -0.7); g.lineTo(-0.35, 0); g.stroke();
      break;
    }
    case 'haystack': {
      g.fillStyle = '#d4ac0d'; g.beginPath(); g.ellipse(0, -0.35, 0.55, 0.45, 0, 0, TAU); g.fill();
      g.strokeStyle = '#b7950b'; g.lineWidth = 0.03;
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 0.12, -0.75); g.lineTo(i * 0.16, -0.05); g.stroke(); }
      break;
    }
    case 'lamp':
    case 'lantern': {
      g.fillStyle = '#2d3436'; g.fillRect(-0.05, -1.9, 0.1, 1.9);
      if (o.kind === 'lamp') {
        g.fillStyle = night ? '#ffe28a' : '#dfe6e9';
        g.beginPath(); g.moveTo(-0.18, -1.9); g.lineTo(0.18, -1.9); g.lineTo(0.12, -2.25); g.lineTo(-0.12, -2.25); g.closePath(); g.fill();
        g.fillStyle = '#2d3436'; g.fillRect(-0.22, -2.3, 0.44, 0.07);
      } else {
        g.fillStyle = night ? '#ff8a5c' : '#e74c3c';
        g.beginPath(); g.ellipse(0, -2.05, 0.2, 0.26, 0, 0, TAU); g.fill();
        g.fillStyle = '#2d3436'; g.fillRect(-0.12, -2.34, 0.24, 0.06); g.fillRect(-0.12, -1.8, 0.24, 0.06);
      }
      break;
    }
    case 'well': {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(0, 0, 0.8, 0.25, 0, 0, TAU); g.fill();
      g.fillStyle = '#8e8a82'; g.beginPath(); g.ellipse(0, -0.3, 0.7, 0.35, 0, 0, TAU); g.fill();
      g.fillStyle = '#26465b'; g.beginPath(); g.ellipse(0, -0.35, 0.5, 0.22, 0, 0, TAU); g.fill();
      g.fillStyle = '#6d4c33'; g.fillRect(-0.62, -1.4, 0.1, 1.1); g.fillRect(0.52, -1.4, 0.1, 1.1);
      g.fillStyle = '#9c4a2a'; g.beginPath(); g.moveTo(-0.85, -1.3); g.lineTo(0, -1.8); g.lineTo(0.85, -1.3); g.closePath(); g.fill();
      break;
    }
    case 'fountain': {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(0, 0, 1.3, 0.4, 0, 0, TAU); g.fill();
      g.fillStyle = '#cfc8ba'; g.beginPath(); g.ellipse(0, -0.25, 1.2, 0.5, 0, 0, TAU); g.fill();
      g.fillStyle = '#4fb3d9'; g.beginPath(); g.ellipse(0, -0.3, 1.0, 0.38, 0, 0, TAU); g.fill();
      g.fillStyle = '#b8b0a2'; g.fillRect(-0.12, -1.2, 0.24, 0.9);
      g.fillStyle = '#cfc8ba'; g.beginPath(); g.ellipse(0, -1.2, 0.45, 0.16, 0, 0, TAU); g.fill();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + t * 0.5;
        const ph = (t * 1.5 + k / 6) % 1;
        g.fillStyle = `rgba(200,235,255,${0.8 - ph * 0.6})`;
        g.beginPath(); g.arc(Math.cos(a) * ph * 0.7, -1.3 + ph * ph * 1.0 - ph * 0.6, 0.06, 0, TAU); g.fill();
      }
      break;
    }
    case 'flagpole': {
      g.fillStyle = '#b2bec3'; g.fillRect(-0.05, -3.4, 0.1, 3.4);
      const wave = Math.sin(t * 4) * 0.08;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(0.05, -3.35); g.quadraticCurveTo(0.6, -3.35 + wave, 1.2, -3.3); g.lineTo(1.2, -2.7); g.quadraticCurveTo(0.6, -2.75 - wave, 0.05, -2.75); g.closePath(); g.fill();
      g.fillStyle = '#2874a6'; g.font = 'bold 0.25px sans-serif'; g.textAlign = 'center'; g.fillText('M', 0.62, -2.95);
      break;
    }
    case 'stall': {
      const cols = ['#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6', '#16a085'];
      const c = cols[(o.v || 0) % cols.length];
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-0.8, -0.05, 1.7, 0.2);
      g.fillStyle = '#8d6e4a'; g.fillRect(-0.8, -0.6, 1.6, 0.6);
      g.fillStyle = '#6d4c33'; g.fillRect(-0.78, -1.5, 0.08, 1.5); g.fillRect(0.7, -1.5, 0.08, 1.5);
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#ffffff' : c; g.fillRect(-0.9 + i * 0.45, -1.75, 0.45, 0.4); }
      for (let i = 0; i < 4; i++) blob(g, -0.5 + i * 0.33, -0.68, 0.12, ['#e67e22', '#f1c40f', '#c0392b', '#27ae60'][(i + (o.v || 0)) % 4]);
      break;
    }
    case 'platform': {
      // Loguetown execution platform
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-1.6, -0.1, 3.4, 0.35);
      g.fillStyle = '#7b5e3b'; g.fillRect(-1.5, -2.2, 3, 2.2);
      g.fillStyle = '#9c7a4f'; g.fillRect(-1.5, -2.5, 3, 0.35);
      g.strokeStyle = '#4e3a22'; g.lineWidth = 0.05;
      for (let x = -1.3; x < 1.5; x += 0.4) { g.beginPath(); g.moveTo(x, -2.2); g.lineTo(x, 0); g.stroke(); }
      g.fillStyle = '#6d4c33'; g.fillRect(-1.2, -4.3, 0.14, 1.9); g.fillRect(1.06, -4.3, 0.14, 1.9); g.fillRect(-1.25, -4.4, 2.5, 0.15);
      g.fillStyle = '#5a3a22';
      for (let s = 0; s < 5; s++) g.fillRect(-0.4, -0.2 - s * 0.45, 0.8, 0.12);
      break;
    }
    case 'statue': {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(0, 0, 0.8, 0.25, 0, 0, TAU); g.fill();
      g.fillStyle = '#b8b0a2'; g.fillRect(-0.6, -0.8, 1.2, 0.8);
      g.fillStyle = '#95a5a6'; g.fillRect(-0.25, -2.2, 0.5, 1.4);
      blob(g, 0, -2.45, 0.28, '#95a5a6');
      g.fillRect(-0.55, -2.0, 0.3, 0.12); g.fillRect(0.25, -2.25, 0.3, 0.12);
      break;
    }
    case 'torii': {
      g.fillStyle = '#c0392b';
      g.fillRect(-1.3, -2.8, 0.18, 2.8); g.fillRect(1.12, -2.8, 0.18, 2.8);
      g.fillRect(-1.7, -3.05, 3.4, 0.22); g.fillRect(-1.4, -2.55, 2.8, 0.14);
      g.fillStyle = '#2d3436'; g.fillRect(-1.8, -3.2, 3.6, 0.15);
      break;
    }
    case 'lighthouse': {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0.2, 0, 1.2, 0.35, 0, 0, TAU); g.fill();
      g.fillStyle = '#fdfefe';
      g.beginPath(); g.moveTo(-0.8, 0); g.lineTo(-0.5, -4.5); g.lineTo(0.5, -4.5); g.lineTo(0.8, 0); g.closePath(); g.fill();
      g.fillStyle = '#c0392b';
      g.beginPath(); g.moveTo(-0.7, -1.3); g.lineTo(-0.62, -2.1); g.lineTo(0.62, -2.1); g.lineTo(0.7, -1.3); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-0.58, -2.9); g.lineTo(-0.52, -3.6); g.lineTo(0.52, -3.6); g.lineTo(0.58, -2.9); g.closePath(); g.fill();
      g.fillStyle = '#2d3436'; g.fillRect(-0.6, -4.6, 1.2, 0.15);
      g.fillStyle = night ? '#fff3b0' : '#aed6f1'; g.fillRect(-0.35, -5.2, 0.7, 0.6);
      g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(-0.5, -5.2); g.lineTo(0, -5.7); g.lineTo(0.5, -5.2); g.closePath(); g.fill();
      if (night) {
        const a = t * 1.2;
        g.fillStyle = 'rgba(255,245,180,0.18)';
        g.beginPath(); g.moveTo(0, -4.9); g.lineTo(Math.cos(a) * 9 - 0.8, -4.9 + Math.sin(a) * 3); g.lineTo(Math.cos(a) * 9 + 0.8, -4.9 + Math.sin(a) * 3 + 0.8); g.closePath(); g.fill();
      }
      break;
    }
    case 'mooring': {
      g.fillStyle = '#5d4037'; g.fillRect(-0.1, -0.5, 0.2, 0.5);
      g.fillStyle = '#795548'; g.beginPath(); g.ellipse(0, -0.5, 0.12, 0.05, 0, 0, TAU); g.fill();
      g.strokeStyle = '#c8b89a'; g.lineWidth = 0.04; g.beginPath(); g.arc(0, -0.3, 0.13, 0, TAU); g.stroke();
      break;
    }
    case 'grave': {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-0.3, -0.05, 0.7, 0.15);
      g.fillStyle = '#95a5a6'; g.beginPath(); g.moveTo(-0.3, 0); g.lineTo(-0.3, -0.7); g.arc(0, -0.7, 0.3, Math.PI, 0); g.lineTo(0.3, 0); g.fill();
      g.strokeStyle = '#7f8c8d'; g.lineWidth = 0.05; g.beginPath(); g.moveTo(0, -0.85); g.lineTo(0, -0.35); g.moveTo(-0.15, -0.7); g.lineTo(0.15, -0.7); g.stroke();
      break;
    }
    case 'chest': {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-0.4, -0.05, 0.85, 0.15);
      g.fillStyle = o.opened ? '#6d4526' : '#8d5b33'; g.fillRect(-0.4, -0.5, 0.8, 0.5);
      g.fillStyle = '#a86f3f';
      if (o.opened) { g.fillRect(-0.4, -0.95, 0.8, 0.3); g.fillStyle = '#3b2a1a'; g.fillRect(-0.34, -0.55, 0.68, 0.08); }
      else { g.beginPath(); g.moveTo(-0.4, -0.5); g.quadraticCurveTo(0, -0.85, 0.4, -0.5); g.fill(); }
      g.fillStyle = '#f1c40f'; g.fillRect(-0.4, -0.52, 0.8, 0.06); g.fillRect(-0.06, -0.55, 0.12, 0.2);
      if (!o.opened) { const s = 0.5 + 0.5 * Math.sin(t * 3 + (o.id || 0)); g.fillStyle = `rgba(255,230,120,${0.35 * s})`; g.beginPath(); g.arc(0, -0.5, 0.7, 0, TAU); g.fill(); }
      break;
    }
    case 'campfire': {
      g.fillStyle = '#5d4037'; g.fillRect(-0.4, -0.12, 0.8, 0.12); g.fillRect(-0.3, -0.2, 0.6, 0.1);
      for (let k = 0; k < 3; k++) {
        const f = Math.sin(t * 9 + k * 2) * 0.06;
        g.fillStyle = ['#e74c3c', '#f39c12', '#f1c40f'][k];
        g.beginPath(); g.moveTo(-0.25 + k * 0.05, -0.15); g.quadraticCurveTo(f, -0.9 + k * 0.2, 0.25 - k * 0.05, -0.15); g.fill();
      }
      break;
    }
    case 'tent': {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-1.1, -0.05, 2.3, 0.2);
      const c = ['#e8d5b5', '#c0392b', '#2e86c1'][(o.v || 0) % 3];
      g.fillStyle = shade(c, -0.2); g.beginPath(); g.moveTo(-1.1, 0); g.lineTo(0, -1.5); g.lineTo(1.1, 0); g.closePath(); g.fill();
      g.fillStyle = c; g.beginPath(); g.moveTo(-1.1, 0); g.lineTo(0, -1.5); g.lineTo(0, 0); g.closePath(); g.fill();
      g.fillStyle = '#3b2a1a'; g.beginPath(); g.moveTo(-0.25, 0); g.lineTo(0, -0.7); g.lineTo(0.25, 0); g.closePath(); g.fill();
      break;
    }
    case 'cannon': {
      g.fillStyle = '#5d4037'; g.fillRect(-0.5, -0.35, 1.0, 0.3);
      blob(g, -0.3, -0.1, 0.16, '#3e2723'); blob(g, 0.3, -0.1, 0.16, '#3e2723');
      g.fillStyle = '#2d3436'; g.save(); g.translate(0, -0.45); g.rotate(-0.25); g.beginPath(); g.roundRect(-0.6, -0.16, 1.3, 0.32, 0.15); g.fill(); g.restore();
      break;
    }
    case 'bench': {
      g.fillStyle = '#8d6e4a'; g.fillRect(-0.7, -0.5, 1.4, 0.14); g.fillRect(-0.7, -0.85, 1.4, 0.12);
      g.fillStyle = '#5d4037'; g.fillRect(-0.62, -0.5, 0.08, 0.5); g.fillRect(0.54, -0.5, 0.08, 0.5);
      break;
    }
    case 'dummy': {
      g.fillStyle = '#6d4c33'; g.fillRect(-0.06, -1.6, 0.12, 1.6); g.fillRect(-0.5, -1.25, 1.0, 0.1);
      g.fillStyle = '#d4ac0d'; g.beginPath(); g.ellipse(0, -1.0, 0.28, 0.45, 0, 0, TAU); g.fill();
      blob(g, 0, -1.7, 0.2, '#e8d5b5');
      g.strokeStyle = '#8d6e4a'; g.lineWidth = 0.03; g.beginPath(); g.moveTo(-0.2, -1.1); g.lineTo(0.2, -0.8); g.stroke();
      break;
    }
    case 'boat': {
      g.save(); g.rotate(-0.2);
      g.fillStyle = '#8d5b33'; g.beginPath(); g.ellipse(0, -0.3, 1.1, 0.4, 0, 0, TAU); g.fill();
      g.fillStyle = '#6d4526'; g.beginPath(); g.ellipse(0, -0.35, 0.9, 0.26, 0, 0, TAU); g.fill();
      g.restore();
      break;
    }
    case 'bell': {
      // Shandora's golden bell
      g.fillStyle = '#b7950b'; g.fillRect(-1.2, -3.6, 0.2, 3.6); g.fillRect(1.0, -3.6, 0.2, 3.6); g.fillRect(-1.3, -3.7, 2.6, 0.2);
      g.fillStyle = '#f1c40f';
      g.beginPath(); g.moveTo(-0.7, -1.2); g.quadraticCurveTo(-0.7, -3.3, 0, -3.3); g.quadraticCurveTo(0.7, -3.3, 0.7, -1.2); g.closePath(); g.fill();
      g.fillStyle = '#fcf3cf'; g.fillRect(-0.4, -2.9, 0.15, 1.4);
      break;
    }
    case 'pillar': {
      g.fillStyle = '#bdc3c7'; g.fillRect(-0.3, -2.4, 0.6, 2.4);
      g.fillStyle = '#95a5a6'; g.fillRect(-0.4, -2.55, 0.8, 0.2); g.fillRect(-0.4, -0.15, 0.8, 0.15);
      g.fillStyle = '#ecf0f1'; g.fillRect(-0.25, -2.35, 0.12, 2.2);
      break;
    }
    case 'bubble': {
      const bob = Math.sin(t * 1.3 + (o.id || 0)) * 0.3;
      const r = 0.3 + ((o.v || 0) % 3) * 0.12;
      g.strokeStyle = 'rgba(180,230,255,0.9)'; g.fillStyle = 'rgba(210,240,255,0.25)'; g.lineWidth = 0.04;
      g.beginPath(); g.arc(0, -1.5 + bob, r, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(-r * 0.35, -1.5 + bob - r * 0.35, r * 0.2, 0, TAU); g.fill();
      break;
    }
    case 'sign': {
      g.fillStyle = '#6d4c33'; g.fillRect(-0.05, -1.1, 0.1, 1.1);
      g.fillStyle = '#c8a878'; g.fillRect(-0.55, -1.3, 1.1, 0.45);
      g.strokeStyle = '#5a3a22'; g.lineWidth = 0.04; g.strokeRect(-0.55, -1.3, 1.1, 0.45);
      g.fillStyle = '#3b2a1a'; g.fillRect(-0.4, -1.15, 0.8, 0.04); g.fillRect(-0.4, -1.02, 0.6, 0.04);
      break;
    }
    case 'windmill': {
      g.fillStyle = '#d7ccc8'; g.beginPath(); g.moveTo(-0.9, 0); g.lineTo(-0.6, -3); g.lineTo(0.6, -3); g.lineTo(0.9, 0); g.closePath(); g.fill();
      g.fillStyle = '#8d6e63'; g.beginPath(); g.moveTo(-0.75, -3); g.lineTo(0, -3.8); g.lineTo(0.75, -3); g.closePath(); g.fill();
      g.save(); g.translate(0, -3.1); g.rotate(t * 0.8);
      g.fillStyle = '#efebe9';
      for (let k = 0; k < 4; k++) { g.rotate(TAU / 4); g.fillRect(0.1, -0.12, 1.6, 0.24); }
      g.restore();
      break;
    }
    case 'arch': {
      // Reverse Mountain gate arch
      g.fillStyle = '#8e6e53';
      g.fillRect(-2.2, -3, 0.5, 3); g.fillRect(1.7, -3, 0.5, 3); g.fillRect(-2.3, -3.4, 4.6, 0.5);
      g.fillStyle = '#c0a080'; g.fillRect(-2.1, -3.3, 4.2, 0.1);
      g.strokeStyle = '#5d4037'; g.lineWidth = 0.05;
      for (let x = -2.1; x < 2.1; x += 0.35) { g.beginPath(); g.moveTo(x, -3.35); g.lineTo(x + 0.15, -3.0); g.stroke(); }
      break;
    }
    case 'ruins': {
      g.fillStyle = '#a1887f';
      g.fillRect(-1.2, -1.2, 0.4, 1.2); g.fillRect(0.6, -0.8, 0.4, 0.8); g.fillRect(-0.4, -0.4, 0.9, 0.4);
      g.fillStyle = '#8d6e63'; g.fillRect(-1.2, -1.3, 0.4, 0.12);
      break;
    }
    case 'bones': {
      g.fillStyle = '#ecf0f1';
      g.save(); g.rotate(0.4); g.fillRect(-0.5, -0.1, 1.0, 0.1); blob(g, -0.5, -0.05, 0.08, '#ecf0f1'); blob(g, 0.5, -0.05, 0.08, '#ecf0f1'); g.restore();
      blob(g, 0.2, -0.3, 0.2, '#ecf0f1'); g.fillStyle = '#2d3436'; g.fillRect(0.12, -0.35, 0.05, 0.05); g.fillRect(0.24, -0.35, 0.05, 0.05);
      break;
    }
    case 'anchor': {
      g.strokeStyle = '#5d6d7e'; g.lineWidth = 0.14; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, -1.6); g.lineTo(0, -0.2); g.arc(0, -0.6, 0.5, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
      g.beginPath(); g.moveTo(-0.35, -1.3); g.lineTo(0.35, -1.3); g.stroke();
      g.beginPath(); g.arc(0, -1.7, 0.14, 0, TAU); g.stroke();
      break;
    }
    case 'fence': {
      g.fillStyle = '#8d6e4a';
      for (let x = -0.45; x <= 0.45; x += 0.3) g.fillRect(x - 0.04, -0.6, 0.08, 0.6);
      g.fillRect(-0.5, -0.5, 1.0, 0.07); g.fillRect(-0.5, -0.28, 1.0, 0.07);
      break;
    }
    case 'poneglyph': {
      // a perfect cube of indestructible stone; Road Poneglyphs are red
      const red = !!o.road;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, 0, 1.1, 0.3, 0, 0, TAU); g.fill();
      g.fillStyle = red ? '#8e2b22' : '#37474f'; g.fillRect(-0.95, -1.9, 1.9, 1.9);
      g.fillStyle = red ? '#b03a2e' : '#546e7a'; g.beginPath(); g.moveTo(-0.95, -1.9); g.lineTo(-0.6, -2.25); g.lineTo(1.3, -2.25); g.lineTo(0.95, -1.9); g.closePath(); g.fill();
      g.fillStyle = red ? '#6e2019' : '#263238'; g.beginPath(); g.moveTo(0.95, -1.9); g.lineTo(1.3, -2.25); g.lineTo(1.3, -0.35); g.lineTo(0.95, 0); g.closePath(); g.fill();
      g.fillStyle = red ? 'rgba(255,205,180,0.45)' : 'rgba(200,230,240,0.35)';
      for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
        const k = (r * 7 + c * 3 + (o.v || 0)) % 5;
        g.fillRect(-0.8 + c * 0.33, -1.75 + r * 0.28, 0.1 + k * 0.03, 0.12);
      }
      if (night) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(-0.95, -1.9, 1.9, 1.9); }
      break;
    }
    case 'shipwreck': {
      g.save(); g.rotate(-0.25);
      g.fillStyle = '#5d4037'; g.beginPath(); g.moveTo(-2.4, -0.2); g.quadraticCurveTo(0, 0.6, 2.4, -0.4); g.lineTo(2.0, -1.4); g.lineTo(-2.0, -1.1); g.closePath(); g.fill();
      g.fillStyle = '#4e342e'; for (let x = -1.8; x < 2; x += 0.5) g.fillRect(x, -1.2, 0.08, 1.0);
      g.fillStyle = '#3e2723'; g.fillRect(-0.1, -3.4, 0.16, 2.3);
      g.fillStyle = 'rgba(236,239,241,0.7)'; g.beginPath(); g.moveTo(0.06, -3.2); g.lineTo(1.1, -2.7); g.lineTo(0.06, -2.2); g.fill();
      g.restore();
      break;
    }
    case 'totem': {
      g.fillStyle = '#8d6e63'; g.fillRect(-0.3, -2.6, 0.6, 2.6);
      for (let k = 0; k < 3; k++) {
        const y = -2.5 + k * 0.85;
        g.fillStyle = ['#c0392b', '#f39c12', '#27ae60'][k]; g.fillRect(-0.36, y, 0.72, 0.7);
        g.fillStyle = '#2d3436'; g.fillRect(-0.2, y + 0.18, 0.1, 0.1); g.fillRect(0.1, y + 0.18, 0.1, 0.1); g.fillRect(-0.15, y + 0.45, 0.3, 0.06);
      }
      g.fillStyle = '#6d4c41'; g.fillRect(-0.7, -2.2, 0.35, 0.15); g.fillRect(0.35, -2.2, 0.35, 0.15);
      break;
    }
    case 'portal': {
      // stairwell (Impel Down) or passage
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(0, -0.2, 1.0, 0.5, 0, 0, TAU); g.fill();
      g.fillStyle = '#5d5d5d';
      for (let k = 0; k < 4; k++) g.fillRect(-0.8 + k * 0.1, -0.5 + k * 0.12, 1.6 - k * 0.2, 0.1);
      {
        const ay = -1.05 + Math.sin(t * 3) * 0.08, d = o.up ? -1 : 1;
        g.fillStyle = o.up ? '#90caf9' : '#ff8a65'; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.04;
        g.beginPath(); g.moveTo(-0.2, ay - d * 0.14); g.lineTo(0.2, ay - d * 0.14); g.lineTo(0, ay + d * 0.18); g.closePath(); g.fill(); g.stroke();
      }
      break;
    }
    case 'gate': {
      g.fillStyle = '#455a64'; g.fillRect(-2.2, -3.2, 0.6, 3.2); g.fillRect(1.6, -3.2, 0.6, 3.2);
      g.fillStyle = '#37474f'; g.fillRect(-2.4, -3.6, 4.8, 0.5);
      g.fillStyle = '#263238'; for (let x = -1.5; x < 1.6; x += 0.35) g.fillRect(x, -3.1, 0.1, 3.1);
      break;
    }
    case 'elevator': {
      // the Bondola: a gondola lift up the Red Line
      g.strokeStyle = '#90a4ae'; g.lineWidth = 0.06; g.beginPath(); g.moveTo(-0.6, -6); g.lineTo(-0.6, -1.4); g.moveTo(0.6, -6); g.lineTo(0.6, -1.4); g.stroke();
      g.fillStyle = '#eceff1'; g.strokeStyle = '#546e7a'; g.lineWidth = 0.05;
      g.beginPath(); g.roundRect(-1.1, -1.5 + Math.sin(t) * 0.05, 2.2, 1.3, 0.2); g.fill(); g.stroke();
      g.fillStyle = '#81d4fa'; g.fillRect(-0.9, -1.3, 0.8, 0.5); g.fillRect(0.1, -1.3, 0.8, 0.5);
      g.fillStyle = '#1565c0'; g.font = 'bold 0.26px sans-serif'; g.textAlign = 'center'; g.fillText('W.G.', 0, -0.45);
      break;
    }
    case 'skull': {
      blob(g, 0, -0.9, 0.8, '#ecf0f1');
      g.fillStyle = '#2d3436'; g.beginPath(); g.arc(-0.28, -1.0, 0.18, 0, TAU); g.arc(0.28, -1.0, 0.18, 0, TAU); g.fill();
      g.fillRect(-0.3, -0.45, 0.6, 0.1);
      break;
    }
    case 'tower': {
      g.fillStyle = '#b0bec5'; g.fillRect(-0.8, -5, 1.6, 5);
      g.fillStyle = '#78909c'; g.fillRect(-1.0, -5.3, 2.0, 0.4);
      g.fillStyle = '#37474f'; for (let y = -4.6; y < -0.5; y += 0.9) { g.fillRect(-0.45, y, 0.25, 0.4); g.fillRect(0.2, y, 0.25, 0.4); }
      break;
    }
    case 'crystal': {
      g.fillStyle = 'rgba(128,222,234,0.85)'; g.strokeStyle = '#006064'; g.lineWidth = 0.04;
      g.beginPath(); g.moveTo(0, -1.8); g.lineTo(0.4, -0.6); g.lineTo(0, 0); g.lineTo(-0.4, -0.6); g.closePath(); g.fill(); g.stroke();
      break;
    }
    case 'mushroom': {
      g.fillStyle = '#efebe9'; g.fillRect(-0.12, -0.8, 0.24, 0.8);
      g.fillStyle = '#e53935'; g.beginPath(); g.ellipse(0, -0.8, 0.6, 0.35, 0, Math.PI, 0); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(-0.2, -0.95, 0.08, 0, TAU); g.arc(0.18, -1.0, 0.06, 0, TAU); g.fill();
      break;
    }
    case 'wheel': {
      g.strokeStyle = '#6d4c41'; g.lineWidth = 0.12;
      g.beginPath(); g.arc(0, -1.2, 0.8, 0, TAU); g.stroke();
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + t * 0.2; g.beginPath(); g.moveTo(0, -1.2); g.lineTo(Math.cos(a) * 1.05, -1.2 + Math.sin(a) * 1.05); g.stroke(); }
      break;
    }
    default: {
      // unknown landmark: a signpost-sized marker
      g.fillStyle = '#e17055'; g.beginPath(); g.arc(0, -0.6, 0.3, 0, TAU); g.fill();
    }
  }
}

export function propHeight(o) {
  const hts = { poneglyph: 2.3, shipwreck: 3.4, totem: 2.7, gate: 3.6, elevator: 6, tower: 5.4, lighthouse: 6, windmill: 5, flagpole: 3.6, torii: 3.3, platform: 4.5, bell: 3.8, arch: 3.5, statue: 2.8, pillar: 2.6, lamp: 2.4, lantern: 2.4, well: 1.9, fountain: 1.6, building: 6, tree: 4 };
  return hts[o.kind] ?? 1.5;
}

export { mixHex };

/** Items lying on the ground (Devil Fruits get a special swirl). */
export function drawGroundItem(g, env) {
  const t = env.time;
  const bob = Math.sin(t * 3 + this.x) * 0.08;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, 0, 0.3, 0.1, 0, 0, TAU); g.fill();
  if (this.id && this.id.startsWith('fruit_')) {
    const glow = 0.4 + 0.3 * Math.sin(t * 4);
    g.fillStyle = `rgba(255,171,145,${glow * 0.5})`; g.beginPath(); g.arc(0, -0.5 + bob, 0.55, 0, TAU); g.fill();
    g.fillStyle = '#8e44ad'; g.beginPath(); g.arc(0, -0.45 + bob, 0.28, 0, TAU); g.fill();
    g.strokeStyle = '#e1bee7'; g.lineWidth = 0.04;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, -0.45 + bob, 0.08 + k * 0.07, k, k + 4); g.stroke(); }
    g.fillStyle = '#2e7d32'; g.beginPath(); g.ellipse(0.1, -0.78 + bob, 0.12, 0.05, -0.5, 0, TAU); g.fill();
  } else {
    g.fillStyle = '#ffd54f'; g.beginPath(); g.arc(0, -0.3 + bob, 0.2, 0, TAU); g.fill();
    g.fillStyle = '#fff8e1'; g.beginPath(); g.arc(-0.06, -0.36 + bob, 0.06, 0, TAU); g.fill();
  }
}
