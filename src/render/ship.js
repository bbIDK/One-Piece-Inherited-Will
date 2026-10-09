// Top-down ship art. Drawn in tile units, origin at the hull centre, bow
// pointing along +x before rotation by the ship heading.
import { shade } from '../core/math.js';

const TAU = Math.PI * 2;

export function drawJollyRoger(g, jr = {}, size = 1, bg = '#111') {
  // jr: { skull, mark, bones, accessory, color (the skull's), bg (the flag's), acc (the accessory's) }
  g.save();
  g.scale(size, size);
  const fg = jr.color || '#f5f6fa';
  const accC = jr.acc || jr.accColor || '#c0392b';
  const disc = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  // ---- behind the skull
  g.strokeStyle = fg; g.fillStyle = fg; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 0.12;
  const bones = jr.bones || 'cross';
  const bone = (x0, y0, x1, y1) => {
    g.lineWidth = 0.12; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * 0.055, ny = dx / l * 0.055;
    for (const [x, y, s] of [[x0, y0, -1], [x1, y1, 1]]) { disc(x + nx + dx / l * 0.02 * s, y + ny + dy / l * 0.02 * s, 0.065); disc(x - nx + dx / l * 0.02 * s, y - ny + dy / l * 0.02 * s, 0.065); }
  };
  if (bones === 'cross') { bone(-0.42, -0.3, 0.42, 0.35); bone(0.42, -0.3, -0.42, 0.35); }
  else if (bones === 'bone') bone(-0.46, 0.36, 0.46, 0.36);
  else if (bones === 'swords') {
    for (const s of [-1, 1]) {
      g.lineWidth = 0.07; g.beginPath(); g.moveTo(-0.45 * s, 0.4); g.lineTo(0.38 * s, -0.4); g.stroke();
      g.beginPath(); g.moveTo(0.38 * s, -0.4); g.lineTo(0.44 * s, -0.5); g.lineTo(0.33 * s, -0.43); g.fill();
      g.lineWidth = 0.11; g.beginPath(); g.moveTo(-0.45 * s, 0.2); g.lineTo(-0.27 * s, 0.4); g.stroke();
      disc(-0.5 * s, 0.46, 0.05);
    }
  } else if (bones === 'flintlocks') {
    for (const s of [-1, 1]) {
      g.save(); g.rotate(s * 0.75);
      g.lineWidth = 0.085; g.beginPath(); g.moveTo(-0.08 * s, 0.42); g.lineTo(-0.08 * s, -0.42); g.stroke();
      g.beginPath(); g.moveTo(-0.11 * s, 0.3); g.quadraticCurveTo(-0.25 * s, 0.42, -0.2 * s, 0.56); g.lineTo(-0.06 * s, 0.5); g.closePath(); g.fill();
      g.restore();
    }
  } else if (bones === 'anchor') {
    g.lineWidth = 0.08;
    g.beginPath(); g.moveTo(0, -0.35); g.lineTo(0, 0.45); g.arc(0, 0.15, 0.35, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    g.beginPath(); g.moveTo(-0.2, -0.3); g.lineTo(0.2, -0.3); g.stroke();
  } else if (bones === 'crescent') {
    g.beginPath(); g.arc(0, 0.02, 0.5, Math.PI * 0.1, Math.PI * 0.9); g.arc(0, -0.08, 0.5, Math.PI * 0.82, Math.PI * 0.18, true); g.fill();
  }
  // ---- the skull
  const skull = jr.skull || 'classic';
  const shape = { classic: [0.3, 0.27, 0.34, 0.16], grin: [0.3, 0.27, 0.34, 0.16], eyepatch: [0.3, 0.27, 0.34, 0.16], round: [0.34, 0.27, 0.42, 0.14], long: [0.25, 0.31, 0.28, 0.2], fanged: [0.31, 0.27, 0.36, 0.15] }[skull] || [0.3, 0.27, 0.34, 0.16];
  const [rx, ry, jw, jh] = shape;
  g.fillStyle = fg;
  g.beginPath(); g.ellipse(0, -0.05, rx, ry, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(-jw / 2, 0.1); g.lineTo(jw / 2, 0.1); g.lineTo(jw / 2 * 0.9, 0.1 + jh); g.quadraticCurveTo(0, 0.1 + jh * 1.18, -jw / 2 * 0.9, 0.1 + jh); g.closePath(); g.fill();
  if (skull === 'fanged') { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.06, 0.24); g.lineTo(s * 0.13, 0.24); g.lineTo(s * 0.095, 0.36); g.fill(); } }
  g.fillStyle = bg;
  const eye = skull === 'grin' ? 0.07 : skull === 'round' ? 0.095 : 0.085, ex = skull === 'long' ? 0.095 : skull === 'round' ? 0.13 : 0.11;
  g.beginPath(); g.ellipse(-ex, -0.05, eye, eye * 1.15, 0, 0, TAU);
  if (skull !== 'eyepatch') g.ellipse(ex, -0.05, eye, eye * 1.15, 0, 0, TAU);
  g.fill();
  g.beginPath(); g.moveTo(0, 0.04); g.lineTo(-0.035, 0.1); g.lineTo(0.035, 0.1); g.fill();
  const my = 0.1 + jh * 0.45;
  if (skull === 'grin') { g.fillRect(-0.12, my, 0.24, 0.03); for (let k = -2; k <= 2; k++) g.fillRect(k * 0.05 - 0.005, my - 0.03, 0.01, 0.1); }
  else { const n = skull === 'round' ? 2 : 1; for (let k = -n; k <= n; k++) g.fillRect(k * 0.07 - 0.01, my - 0.02, 0.02, jh * 0.6); }
  if (skull === 'eyepatch') {
    g.strokeStyle = bg; g.lineWidth = 0.035; g.beginPath(); g.moveTo(-rx, -0.24); g.lineTo(rx, 0.0); g.stroke();
    g.beginPath(); g.ellipse(ex, -0.05, eye * 1.25, eye * 1.2, 0.35, 0, TAU); g.fill();
  }
  // ---- a mark on the face
  const mark = jr.mark || 'none';
  if (mark === 'scars') { // (three claw scars over the left eye)
    g.strokeStyle = bg; g.lineWidth = 0.028;
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(-ex - 0.1 + k * 0.045, -0.24); g.lineTo(-ex + 0.04 + k * 0.045, 0.1); g.stroke(); }
  } else if (mark === 'stitches') {
    g.strokeStyle = bg; g.lineWidth = 0.022;
    g.beginPath(); g.moveTo(-rx * 0.85, -0.2); g.quadraticCurveTo(0, -0.27, rx * 0.85, -0.2); g.stroke();
    for (let k = -3; k <= 3; k++) { const x = k * rx * 0.24; g.beginPath(); g.moveTo(x, -0.27); g.lineTo(x, -0.18); g.stroke(); }
  } else if (mark === 'mustache') { // (a great crescent moustache, ends swept up past the skull)
    g.fillStyle = fg; g.strokeStyle = bg; g.lineWidth = 0.02;
    g.beginPath(); g.moveTo(0, 0.1); g.quadraticCurveTo(-0.3, 0.2, -0.56, -0.12); g.quadraticCurveTo(-0.32, 0.08, 0, 0.06);
    g.quadraticCurveTo(0.32, 0.08, 0.56, -0.12); g.quadraticCurveTo(0.3, 0.2, 0, 0.1); g.closePath(); g.fill(); g.stroke();
  } else if (mark === 'beard') {
    g.fillStyle = fg; g.beginPath(); g.moveTo(-jw / 2, 0.18); g.lineTo(jw / 2, 0.18); g.lineTo(0, 0.5); g.closePath(); g.fill();
    g.strokeStyle = bg; g.lineWidth = 0.015; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(k * 0.07, 0.3); g.lineTo(k * 0.03, 0.44); g.stroke(); }
  }
  // ---- on its head
  const acc = jr.accessory || 'none';
  const top = -0.05 - ry;
  if (acc === 'strawhat') {
    g.fillStyle = '#f2d16b'; g.beginPath(); g.ellipse(0, top + 0.08, 0.44, 0.1, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(0, top + 0.02, 0.24, 0.16, 0, Math.PI, 0); g.fill();
    g.fillStyle = jr.acc || '#c0392b'; g.fillRect(-0.24, top - 0.01, 0.48, 0.06);
  } else if (acc === 'bandana') {
    g.fillStyle = accC; g.beginPath(); g.arc(0, top + 0.2, rx + 0.01, Math.PI, 0); g.fill();
    g.beginPath(); g.moveTo(rx - 0.02, top + 0.18); g.lineTo(rx + 0.18, top + 0.3); g.lineTo(rx + 0.12, top + 0.38); g.closePath(); g.fill();
  } else if (acc === 'horns') {
    g.fillStyle = fg; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.15, top + 0.04); g.quadraticCurveTo(s * 0.45, top - 0.13, s * 0.38, top - 0.33); g.lineTo(s * 0.08, top + 0.02); g.fill(); }
  } else if (acc === 'crown') {
    g.fillStyle = jr.acc || '#f1c40f'; g.beginPath(); g.moveTo(-0.22, top + 0.06); g.lineTo(-0.26, top - 0.16); g.lineTo(-0.11, top - 0.04); g.lineTo(0, top - 0.2); g.lineTo(0.11, top - 0.04); g.lineTo(0.26, top - 0.16); g.lineTo(0.22, top + 0.06); g.fill();
  } else if (acc === 'tricorne') {
    g.fillStyle = jr.acc || '#2d3436'; g.beginPath(); g.moveTo(-0.45, top + 0.1); g.quadraticCurveTo(0, top - 0.3, 0.45, top + 0.1); g.quadraticCurveTo(0, top + 0.02, -0.45, top + 0.1); g.fill();
    g.strokeStyle = '#f1c40f'; g.lineWidth = 0.02; g.beginPath(); g.moveTo(-0.4, top + 0.08); g.quadraticCurveTo(0, top - 0.24, 0.4, top + 0.08); g.stroke();
  } else if (acc === 'tophat') {
    g.fillStyle = jr.acc || '#2d3436'; g.beginPath(); g.ellipse(0, top + 0.08, 0.36, 0.06, 0, 0, TAU); g.fill();
    g.fillRect(-0.2, top - 0.3, 0.4, 0.38);
    g.fillStyle = '#c0392b'; g.fillRect(-0.2, top - 0.02, 0.4, 0.06);
  } else if (acc === 'viking') {
    g.fillStyle = jr.acc || '#95a5a6'; g.beginPath(); g.arc(0, top + 0.16, rx + 0.02, Math.PI, 0); g.fill();
    g.fillStyle = '#efe2c4'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * (rx - 0.02), top + 0.08); g.quadraticCurveTo(s * (rx + 0.2), top + 0.02, s * (rx + 0.16), top - 0.22); g.lineTo(s * (rx - 0.08), top + 0.02); g.fill(); }
  } else if (acc === 'flames') {
    g.fillStyle = jr.acc || '#e17055'; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * 0.11 - 0.06, top + 0.04); g.quadraticCurveTo(k * 0.11, top - 0.22 + Math.abs(k) * 0.05, k * 0.11 + 0.06, top + 0.04); g.fill(); }
  } else if (acc === 'halo') {
    g.strokeStyle = jr.acc || '#f1c40f'; g.lineWidth = 0.04; g.beginPath(); g.ellipse(0, top - 0.1, 0.25, 0.07, 0, 0, TAU); g.stroke();
  }
  g.restore();
}

/** The Marine seagull emblem (blue gull over the word-less anchor bar). */
export function drawMarineEmblem(g, size = 1) {
  g.save();
  g.scale(size, size);
  g.strokeStyle = '#2874a6'; g.fillStyle = '#2874a6'; g.lineCap = 'round'; g.lineJoin = 'round';
  // gull wings
  g.lineWidth = 0.09;
  g.beginPath(); g.moveTo(-0.42, -0.05); g.quadraticCurveTo(-0.22, -0.3, 0, -0.08); g.quadraticCurveTo(0.22, -0.3, 0.42, -0.05); g.stroke();
  // body and head
  g.beginPath(); g.ellipse(0, 0.02, 0.08, 0.12, 0, 0, TAU); g.fill();
  // the bar below
  g.lineWidth = 0.06;
  g.beginPath(); g.moveTo(-0.3, 0.26); g.lineTo(0.3, 0.26); g.stroke();
  g.restore();
}

/** Draw a ship. s: { type def, heading, sailSet (0..1), wind{x,y}, jr, t, damage(0..1), sinking } */
export function drawShip(g, def, st) {
  const L = def.length, B = def.beam;
  const t = st.t || 0;
  g.save();
  g.rotate(st.heading);
  const bobRoll = Math.sin(t * 1.6 + (st.seed || 0)) * 0.02;
  g.scale(1, 1 + bobRoll);

  // shadow / water displacement
  g.fillStyle = 'rgba(0,20,40,0.28)';
  g.beginPath(); g.ellipse(0.1, 0.12, L * 0.55, B * 0.62, 0, 0, TAU); g.fill();

  const hullCol = def.color || '#8d5b33';
  const hullPath = () => {
    g.beginPath();
    g.moveTo(L * 0.52, 0);
    g.bezierCurveTo(L * 0.35, -B * 0.55, -L * 0.3, -B * 0.55, -L * 0.48, -B * 0.38);
    g.lineTo(-L * 0.5, B * 0.38);
    g.bezierCurveTo(-L * 0.3, B * 0.55, L * 0.35, B * 0.55, L * 0.52, 0);
    g.closePath();
  };
  // hull side (darker rim)
  hullPath();
  g.fillStyle = shade(hullCol, -0.35); g.fill();
  g.lineWidth = 0.06; g.strokeStyle = 'rgba(20,10,5,0.9)'; g.stroke();
  // deck
  g.save();
  g.scale(0.86, 0.8);
  hullPath();
  g.fillStyle = def.seastone ? '#dfe6e9' : shade(hullCol, 0.18); g.fill();
  g.clip();
  g.strokeStyle = shade(hullCol, -0.1); g.lineWidth = 0.03;
  for (let y = -B; y < B; y += 0.22) { g.beginPath(); g.moveTo(-L, y); g.lineTo(L, y); g.stroke(); }
  g.restore();
  // railing highlight
  hullPath(); g.strokeStyle = shade(hullCol, 0.35); g.lineWidth = 0.035; g.stroke();

  // cannons
  const nC = Math.min(def.cannons || 0, 20) / 2;
  for (let i = 0; i < nC; i++) {
    const x = -L * 0.3 + (i + 0.5) * (L * 0.6 / nC);
    for (const sy of [-1, 1]) {
      g.fillStyle = '#2d3436';
      g.fillRect(x - 0.08, sy * B * 0.46 - 0.05, 0.16, 0.1);
    }
  }
  // figurehead
  if (def.figurehead === 'ram') {
    g.fillStyle = '#f5f6fa'; g.beginPath(); g.arc(L * 0.52, 0, 0.26, 0, TAU); g.fill();
    g.strokeStyle = '#d4a373'; g.lineWidth = 0.08; g.beginPath(); g.arc(L * 0.5, -0.12, 0.12, 0, TAU); g.arc(L * 0.5, 0.12, 0.12, 0, TAU); g.stroke();
  } else if (def.figurehead === 'lion') {
    g.fillStyle = '#f39c12'; for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; g.beginPath(); g.arc(L * 0.52 + Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.14, 0, TAU); g.fill(); }
    g.fillStyle = '#fdcb6e'; g.beginPath(); g.arc(L * 0.52, 0, 0.26, 0, TAU); g.fill();
  } else if (def.figurehead === 'seagull') {
    g.fillStyle = '#f5f6fa'; g.beginPath(); g.moveTo(L * 0.62, 0); g.lineTo(L * 0.45, -0.3); g.lineTo(L * 0.45, 0.3); g.fill();
  }

  // masts + sails (sails swing with the wind, billow when set)
  // (a rowboat has no mast: her oars lie along her sides)
  const masts = def.masts ?? 1;
  if (def.oarsOnly) {
    g.strokeStyle = '#b08850'; g.lineWidth = 0.06;
    for (const sy of [-1, 1]) { g.beginPath(); g.moveTo(-0.1, sy * B * 0.3); g.lineTo(-0.9, sy * (B * 0.5 + 0.35)); g.stroke(); }
  }
  const wind = st.windAngle ?? 0;
  const rel = wind - st.heading;
  const set = st.sailSet ?? 0;
  for (let m = 0; m < masts; m++) {
    const mx = masts === 1 ? 0.05 * L : L * (0.28 - m * (0.56 / Math.max(1, masts - 1)));
    const sw = B * (m === 0 && masts > 1 ? 1.0 : 1.2);
    const billow = 0.12 + set * 0.35;
    g.save();
    g.translate(mx, 0);
    g.rotate(Math.sin(rel) * 0.35);
    // yard
    g.fillStyle = '#5d4037'; g.fillRect(-0.06, -sw / 2 - 0.1, 0.12, sw + 0.2);
    if (set > 0.05) {
      const marine = def.sail === 'marine' || st.marine;
      const sc = marine ? '#f5f6fa' : (st.sailColor || '#f3ecd8');
      g.fillStyle = sc; g.strokeStyle = 'rgba(60,40,20,0.7)'; g.lineWidth = 0.035;
      g.beginPath();
      g.moveTo(0, -sw / 2);
      g.quadraticCurveTo(billow * 2.2, 0, 0, sw / 2);
      g.lineTo(-0.12, sw / 2 - 0.05);
      g.quadraticCurveTo(billow * 1.4 - 0.12, 0, -0.12, -sw / 2 + 0.05);
      g.closePath(); g.fill(); g.stroke();
      // emblem on the main sail
      if (m === (masts > 1 ? 1 : 0) || masts === 1) {
        g.save(); g.translate(billow * 0.9, 0); g.rotate(-Math.PI / 2); g.scale(0.9, 0.35 + billow * 0.5);
        if (marine) drawMarineEmblem(g, 0.9);
        else if (st.jr) drawJollyRoger(g, st.jr, 0.9, sc);
        g.restore();
      }
    } else {
      // furled sail bundle
      g.fillStyle = '#e8dfc8'; g.fillRect(-0.1, -sw / 2, 0.2, sw);
    }
    g.restore();
    // mast top
    g.fillStyle = '#4e342e'; g.beginPath(); g.arc(mx, 0, 0.12, 0, TAU); g.fill();
  }
  // flag on the main mast (points downwind) — a ship with no colours flies none
  const marineFlag = def.sail === 'marine' || st.marine;
  if ((!st.noFlag || marineFlag) && masts > 0) {
    const mx = masts === 1 ? 0.05 * L : L * 0.28 - (masts > 1 ? L * 0.56 / (masts - 1) : 0) * Math.min(1, masts - 1) * 0.5;
    g.save(); g.translate(mx, 0); g.rotate(rel + Math.PI);
    const wave = Math.sin(t * 7) * 0.08;
    g.fillStyle = marineFlag ? '#f5f6fa' : '#111';
    g.beginPath(); g.moveTo(0, -0.02); g.quadraticCurveTo(0.35, wave, 0.7, -0.05); g.lineTo(0.7, 0.4); g.quadraticCurveTo(0.35, 0.42 - wave, 0, 0.42); g.closePath(); g.fill();
    g.save(); g.translate(0.35, 0.2); g.rotate(Math.PI / 2);
    if (marineFlag) drawMarineEmblem(g, 0.32);
    else if (st.jr) drawJollyRoger(g, st.jr, 0.32, '#111');
    g.restore();
    g.restore();
  }
  // damage: smoke & fire
  if (st.damage > 0.5) {
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.7 + k / 3) % 1;
      g.fillStyle = `rgba(60,60,60,${0.5 * (1 - ph)})`;
      g.beginPath(); g.arc(-L * 0.2 + k * 0.3, -ph * 1.5, 0.2 + ph * 0.4, 0, TAU); g.fill();
    }
  }
  if (st.coated) {
    g.strokeStyle = 'rgba(180,230,255,0.8)'; g.fillStyle = 'rgba(200,240,255,0.18)'; g.lineWidth = 0.06;
    g.beginPath(); g.ellipse(0, 0, L * 0.7, B * 1.2, 0, 0, TAU); g.fill(); g.stroke();
  }
  g.restore();
}
