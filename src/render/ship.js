// Top-down ship art. Drawn in tile units, origin at the hull centre, bow
// pointing along +x before rotation by the ship heading.
import { shade } from '../core/math.js';

const TAU = Math.PI * 2;

export function drawJollyRoger(g, jr = {}, size = 1, bg = '#111') {
  // jr: { skull, bones, accessory, color, bgColor }
  g.save();
  g.scale(size, size);
  const fg = jr.color || '#f5f6fa';
  // crossbones
  g.strokeStyle = fg; g.lineCap = 'round'; g.lineWidth = 0.12;
  const bones = jr.bones || 'cross';
  if (bones === 'cross') {
    g.beginPath(); g.moveTo(-0.42, -0.3); g.lineTo(0.42, 0.35); g.moveTo(0.42, -0.3); g.lineTo(-0.42, 0.35); g.stroke();
    for (const [x, y] of [[-0.42, -0.3], [0.42, 0.35], [0.42, -0.3], [-0.42, 0.35]]) {
      g.beginPath(); g.arc(x + (x < 0 ? -0.03 : 0.03), y - 0.04, 0.06, 0, TAU); g.arc(x + (x < 0 ? 0.03 : -0.03), y + 0.04, 0.06, 0, TAU); g.fillStyle = fg; g.fill();
    }
  } else if (bones === 'swords') {
    g.lineWidth = 0.07;
    g.beginPath(); g.moveTo(-0.45, 0.4); g.lineTo(0.35, -0.35); g.moveTo(0.45, 0.4); g.lineTo(-0.35, -0.35); g.stroke();
    g.lineWidth = 0.12; g.beginPath(); g.moveTo(-0.45, 0.2); g.lineTo(-0.25, 0.4); g.moveTo(0.45, 0.2); g.lineTo(0.25, 0.4); g.stroke();
  } else if (bones === 'anchor') {
    g.lineWidth = 0.08;
    g.beginPath(); g.moveTo(0, -0.35); g.lineTo(0, 0.45); g.arc(0, 0.15, 0.35, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  }
  // skull
  const skull = jr.skull || 'classic';
  g.fillStyle = fg;
  g.beginPath(); g.ellipse(0, -0.05, 0.3, 0.27, 0, 0, TAU); g.fill();
  g.fillRect(-0.17, 0.1, 0.34, 0.16);
  g.fillStyle = bg;
  const eye = skull === 'grin' ? 0.07 : 0.085;
  g.beginPath(); g.ellipse(-0.11, -0.05, eye, eye * 1.15, 0, 0, TAU); g.ellipse(0.11, -0.05, eye, eye * 1.15, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(0, 0.04); g.lineTo(-0.035, 0.1); g.lineTo(0.035, 0.1); g.fill();
  if (skull === 'grin') { g.fillRect(-0.12, 0.17, 0.24, 0.03); for (let k = -2; k <= 2; k++) g.fillRect(k * 0.05 - 0.005, 0.14, 0.01, 0.1); }
  else { for (let k = -1; k <= 1; k++) g.fillRect(k * 0.07 - 0.01, 0.16, 0.02, 0.1); }
  if (skull === 'eyepatch') { g.strokeStyle = bg; g.lineWidth = 0.03; g.beginPath(); g.moveTo(-0.3, -0.25); g.lineTo(0.3, 0.05); g.stroke(); }
  // accessory on top
  const acc = jr.accessory || 'none';
  if (acc === 'strawhat') {
    g.fillStyle = '#f2d16b'; g.beginPath(); g.ellipse(0, -0.24, 0.42, 0.1, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(0, -0.3, 0.23, 0.15, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#c0392b'; g.fillRect(-0.23, -0.32, 0.46, 0.06);
  } else if (acc === 'bandana') {
    g.fillStyle = jr.accColor || '#c0392b'; g.beginPath(); g.arc(0, -0.12, 0.31, Math.PI, 0); g.fill();
    g.beginPath(); g.moveTo(0.28, -0.14); g.lineTo(0.48, -0.02); g.lineTo(0.42, 0.06); g.closePath(); g.fill();
  } else if (acc === 'horns') {
    g.fillStyle = fg; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.15, -0.28); g.quadraticCurveTo(s * 0.45, -0.45, s * 0.38, -0.65); g.lineTo(s * 0.08, -0.3); g.fill(); }
  } else if (acc === 'crown') {
    g.fillStyle = '#f1c40f'; g.beginPath(); g.moveTo(-0.22, -0.26); g.lineTo(-0.26, -0.48); g.lineTo(-0.11, -0.36); g.lineTo(0, -0.52); g.lineTo(0.11, -0.36); g.lineTo(0.26, -0.48); g.lineTo(0.22, -0.26); g.fill();
  } else if (acc === 'tricorne') {
    g.fillStyle = '#2d3436'; g.beginPath(); g.moveTo(-0.45, -0.22); g.quadraticCurveTo(0, -0.62, 0.45, -0.22); g.quadraticCurveTo(0, -0.3, -0.45, -0.22); g.fill();
  } else if (acc === 'flames') {
    g.fillStyle = '#e17055'; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * 0.11 - 0.06, -0.28); g.quadraticCurveTo(k * 0.11, -0.55 - Math.abs(k) * -0.05, k * 0.11 + 0.06, -0.28); g.fill(); }
  } else if (acc === 'halo') {
    g.strokeStyle = '#f1c40f'; g.lineWidth = 0.04; g.beginPath(); g.ellipse(0, -0.42, 0.25, 0.07, 0, 0, TAU); g.stroke();
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
