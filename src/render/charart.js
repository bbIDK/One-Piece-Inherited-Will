// Head art for the character renderer: faces, eyes, hair and hats.
// Called by ./character.js with the context already posed (upper-body frame,
// mirrored for left-facing, tilted with the head). Units are tiles.
//
//   drawHead(g, look, hy, r, d, pose, t, P)
//     hy: head centre y, r: head radius (0.3), d: 'down' | 'up' | 'left' | 'right'
//     (left is drawn as right: the context is already mirrored), pose: the
//     character pose (uses state, flash, ghost), t: time, P: sampled rig pose
//     (uses P.face: null | 'fierce' | 'shout').
//   drawHair(g, style, col, hy, r, d, nikaT)   nikaT: time for Nika's flame hair, else null
//   drawHat(g, hat, hy, r, d, look)
import { shade } from '../core/math.js';

const TAU = Math.PI * 2;
const OUTLINE = 'rgba(30,20,20,0.85)';

function circ(g, x, y, r, fill, stroke, lw = 0.04) {
  g.beginPath(); g.arc(x, y, Math.max(0.001, r), 0, TAU);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}

export function drawHead(g, look, hy, r, d, pose, t, P) {
  const skin = look.skin || '#f1c9a0';
  const hair = look.hairColor || '#2d2d2d';
  const side = d === 'left' || d === 'right';
  const back = d === 'up';
  const white = look.furWhite;

  // mink ears (behind hair)
  if (look.ears) {
    const ec = white ? '#fafafa' : look.fur || hair;
    for (const sx of [-1, 1]) {
      g.save(); g.translate(sx * r * 0.62, hy - r * 0.75);
      g.rotate(sx * 0.35);
      g.fillStyle = ec; g.strokeStyle = OUTLINE; g.lineWidth = 0.03;
      g.beginPath();
      if (look.ears === 'long') g.ellipse(0, -0.2, 0.08, 0.26, 0, 0, TAU);
      else if (look.ears === 'round') g.arc(0, -0.02, 0.12, 0, TAU);
      else { g.moveTo(-0.11, 0.05); g.lineTo(0, -0.22); g.lineTo(0.11, 0.05); g.closePath(); }
      g.fill(); g.stroke();
      g.restore();
      if (side) break;
    }
  }
  if (look.fin) {
    g.fillStyle = shade(skin, -0.2); g.strokeStyle = OUTLINE; g.lineWidth = 0.03;
    g.beginPath(); g.moveTo(-0.12, hy - r * 0.8); g.quadraticCurveTo(0.05, hy - r * 1.9, 0.22, hy - r * 0.75); g.closePath(); g.fill(); g.stroke();
  }

  const faceCol = white ? '#fafafa' : look.fur && look.furFace ? look.fur : skin;
  circ(g, 0, hy, r, faceCol, OUTLINE, 0.04);
  if (look.muzzle && !back && !pose.ghost) {
    circ(g, side ? r * 0.55 : 0, hy + r * 0.3, r * 0.38, shade(white ? '#fafafa' : look.fur || skin, 0.35), null);
    circ(g, side ? r * 0.82 : 0, hy + r * 0.18, 0.045, '#2d2d2d');
  }

  drawHair(g, look.hair || 'short', white ? '#fafafa' : hair, hy, r, d, look.nika ? t : null);

  if (!back && !pose.ghost) {
    const ex = side ? r * 0.4 : r * 0.36;
    const eyeY = hy + r * 0.05;
    const eyeCol = white ? '#ff1744' : look.eyeColor || '#222';
    const blink = Math.sin(t * 1.7 + (look.seed || 0)) > 0.985;
    const fierce = P && (P.face === 'shout' || P.face === 'fierce');
    const drawEye = (x) => {
      if (pose.state === 'hurt') {
        g.strokeStyle = '#222'; g.lineWidth = 0.028; g.beginPath();
        g.moveTo(x - 0.05, eyeY - 0.04); g.lineTo(x + 0.04, eyeY); g.lineTo(x - 0.05, eyeY + 0.04); g.stroke();
        return;
      }
      if (blink && !fierce) { g.strokeStyle = '#222'; g.lineWidth = 0.025; g.beginPath(); g.moveTo(x - 0.05, eyeY); g.lineTo(x + 0.05, eyeY); g.stroke(); return; }
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, eyeY, 0.06, 0.075, 0, 0, TAU); g.fill();
      g.fillStyle = eyeCol; g.beginPath(); g.ellipse(x + (side ? 0.015 : 0), eyeY + 0.01, 0.035, 0.05, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 0.01, eyeY - 0.02, 0.012, 0, TAU); g.fill();
      if (fierce) {
        g.strokeStyle = '#222'; g.lineWidth = 0.03; g.beginPath();
        g.moveTo(x - 0.07, eyeY - 0.1 + (side ? 0 : x > 0 ? 0.03 : 0)); g.lineTo(x + 0.06, eyeY - 0.06 + (side ? 0 : x > 0 ? -0.03 : 0.03)); g.stroke();
      }
    };
    if (side) drawEye(ex);
    else { drawEye(-ex); drawEye(ex); }
    if (look.thirdEye) {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(side ? r * 0.2 : 0, hy - r * 0.35, 0.05, 0.065, 0, 0, TAU); g.fill();
      g.fillStyle = look.eyeColor || '#8e44ad'; g.beginPath(); g.arc(side ? r * 0.21 : 0, hy - r * 0.34, 0.028, 0, TAU); g.fill();
    }
    g.strokeStyle = '#6b2b2b'; g.lineWidth = 0.025;
    const my = hy + r * 0.5;
    const mx = side ? r * 0.35 : 0;
    g.beginPath();
    if (pose.state === 'hurt' || (P && P.face === 'shout')) {
      g.ellipse(mx, my, 0.06, 0.045, 0, 0, TAU); g.fillStyle = '#6b2b2b'; g.fill();
    } else if (look.nika || look.grin) {
      g.arc(mx, my - 0.04, 0.08, 0.2, Math.PI - 0.2); g.stroke();
      if (look.sharpTeeth) { g.fillStyle = '#fff'; g.fillRect(mx - 0.06, my - 0.01, 0.12, 0.03); }
    } else { g.moveTo(mx - 0.04, my); g.lineTo(mx + 0.04, my); g.stroke(); }
    if (look.scarEye) { g.strokeStyle = '#b0413e'; g.lineWidth = 0.025; g.beginPath(); g.moveTo(-ex - 0.02, eyeY - 0.12); g.lineTo(-ex + 0.03, eyeY + 0.12); g.stroke(); }
    if (look.nose === 'long') { g.fillStyle = skin; g.strokeStyle = OUTLINE; g.lineWidth = 0.02; g.beginPath(); g.moveTo(side ? r * 0.7 : -0.04, hy + r * 0.2); g.lineTo(side ? r * 1.6 : 0, hy + r * 0.25); g.lineTo(side ? r * 0.7 : 0.04, hy + r * 0.32); g.fill(); g.stroke(); }
    if (pose.flash) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(0, hy, r, 0, TAU); g.fill(); }
  }

  drawHat(g, look.hat, hy, r, d, look);
}

export function drawHair(g, style, col, hy, r, d, nikaT) {
  if (style === 'bald' && nikaT === null) return;
  const back = d === 'up';
  g.fillStyle = col; g.strokeStyle = OUTLINE; g.lineWidth = 0.035;
  g.beginPath();
  if (nikaT !== null && nikaT !== undefined) {
    // Nika: hair billowing like white flame
    g.moveTo(-r * 1.05, hy);
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI + (k / 8) * Math.PI;
      const rr = r * (k % 2 ? 1.25 + 0.2 * Math.sin(nikaT * 9 + k) : 1.0);
      g.lineTo(Math.cos(a) * rr * 1.1, hy + Math.sin(a) * rr * 1.25 - (k % 2 ? r * 0.2 : 0));
    }
    g.lineTo(r * 1.05, hy); g.quadraticCurveTo(0, hy - r * 0.4, -r * 1.05, hy);
    g.fill(); g.stroke();
    return;
  }
  switch (style) {
    case 'spiky':
      g.moveTo(-r * 1.05, hy);
      for (let k = 0; k <= 6; k++) {
        const a = Math.PI + (k / 6) * Math.PI;
        const rr = k % 2 ? r * 1.35 : r * 1.02;
        g.lineTo(Math.cos(a) * rr, hy + Math.sin(a) * rr);
      }
      g.lineTo(r * 1.05, hy); g.quadraticCurveTo(0, hy - r * 0.4, -r * 1.05, hy);
      break;
    case 'long':
      g.moveTo(-r * 1.05, hy + r * 1.3);
      g.lineTo(-r * 1.1, hy);
      g.arc(0, hy, r * 1.1, Math.PI, 0);
      g.lineTo(r * 1.05, hy + r * 1.3);
      g.quadraticCurveTo(0, hy + (back ? r * 1.5 : r * 0.2), -r * 1.05, hy + r * 1.3);
      break;
    case 'ponytail':
      g.arc(0, hy, r * 1.06, Math.PI * 1.02, -0.02);
      g.quadraticCurveTo(0, hy - r * 0.5, -r * 1.05, hy);
      g.moveTo(r * 0.6, hy - r * 0.7); g.quadraticCurveTo(r * 1.6, hy - r * 0.2, r * 1.1, hy + r * 1.1);
      g.lineTo(r * 0.8, hy - r * 0.3);
      break;
    case 'afro':
      g.arc(0, hy - r * 0.35, r * 1.35, 0, TAU);
      break;
    case 'topknot':
      g.arc(0, hy, r * 1.04, Math.PI, 0);
      g.quadraticCurveTo(0, hy - r * 0.55, -r * 1.04, hy);
      g.moveTo(r * 0.2, hy - r * 1.0); g.arc(0, hy - r * 1.2, r * 0.25, 0, TAU);
      break;
    case 'buzz':
      g.arc(0, hy, r * 1.02, Math.PI * 1.05, -0.05);
      g.quadraticCurveTo(0, hy - r * 0.7, -r * 1.0, hy - r * 0.15);
      break;
    case 'mohawk':
      g.moveTo(-r * 0.2, hy - r * 0.8); g.lineTo(-r * 0.1, hy - r * 1.7); g.lineTo(r * 0.3, hy - r * 1.6); g.lineTo(r * 0.3, hy - r * 0.8);
      break;
    case 'bun':
      g.arc(0, hy, r * 1.05, Math.PI * 1.02, -0.02);
      g.quadraticCurveTo(0, hy - r * 0.5, -r * 1.03, hy);
      g.moveTo(r * 0.45, hy - r * 1.25); g.arc(0, hy - r * 1.25, r * 0.45, 0, TAU);
      break;
    case 'pompadour':
      g.moveTo(-r * 1.02, hy);
      g.arc(0, hy, r * 1.02, Math.PI, Math.PI * 1.4);
      g.quadraticCurveTo(r * 0.2, hy - r * 2.1, r * 1.9, hy - r * 1.3);
      g.quadraticCurveTo(r * 0.8, hy - r * 1.05, r * 1.02, hy);
      g.quadraticCurveTo(0, hy - r * 0.5, -r * 1.02, hy);
      break;
    case 'curly':
      for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6) * Math.PI; g.moveTo(Math.cos(a) * r + r * 0.28, hy + Math.sin(a) * r * 0.95); g.arc(Math.cos(a) * r, hy + Math.sin(a) * r * 0.95, r * 0.28, 0, TAU); }
      break;
    default: // short
      g.arc(0, hy, r * 1.06, Math.PI * 1.02, -0.02);
      g.lineTo(r * 0.9, hy - r * 0.1);
      g.lineTo(r * 0.55, hy - r * 0.45);
      g.lineTo(r * 0.2, hy - r * 0.2);
      g.lineTo(-r * 0.2, hy - r * 0.5);
      g.lineTo(-r * 0.6, hy - r * 0.2);
      g.lineTo(-r * 0.95, hy - r * 0.05);
  }
  g.fill(); g.stroke();
  if (back && style !== 'bald') { g.beginPath(); g.arc(0, hy, r * 1.02, 0, TAU); g.fill(); }
}

export function drawHat(g, hat, hy, r, d, look) {
  if (!hat) return;
  g.strokeStyle = OUTLINE; g.lineWidth = 0.035;
  switch (hat) {
    case 'straw': {
      g.fillStyle = '#f2d16b';
      g.beginPath(); g.ellipse(0, hy - r * 0.55, r * 1.55, r * 0.42, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#f5da7a';
      g.beginPath(); g.ellipse(0, hy - r * 0.85, r * 0.85, r * 0.62, 0, Math.PI, 0); g.fill(); g.stroke();
      g.fillStyle = '#c0392b'; g.fillRect(-r * 0.85, hy - r * 0.8, r * 1.7, r * 0.2);
      break;
    }
    case 'bandana': {
      g.fillStyle = look.hatColor || '#2d3436';
      g.beginPath(); g.arc(0, hy - r * 0.1, r * 1.05, Math.PI * 1.05, -0.05); g.closePath(); g.fill(); g.stroke();
      if (d !== 'up') { g.beginPath(); g.moveTo(-r, hy - r * 0.1); g.lineTo(-r * 1.5, hy + r * 0.3); g.lineTo(-r * 1.2, hy + r * 0.4); g.closePath(); g.fill(); }
      break;
    }
    case 'marine': {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(0, hy - r * 0.75, r * 1.0, r * 0.45, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#1b4f72'; g.fillRect(-r * 0.95, hy - r * 0.6, r * 1.9, r * 0.2);
      if (d === 'down' || d === 'right') { g.fillStyle = '#34495e'; g.beginPath(); g.ellipse(r * 0.3, hy - r * 0.45, r * 0.6, r * 0.15, 0, 0, TAU); g.fill(); }
      break;
    }
    case 'tricorne': {
      g.fillStyle = look.hatColor || '#2d3436';
      g.beginPath(); g.moveTo(-r * 1.5, hy - r * 0.6); g.quadraticCurveTo(0, hy - r * 2.1, r * 1.5, hy - r * 0.6); g.quadraticCurveTo(0, hy - r * 0.9, -r * 1.5, hy - r * 0.6); g.fill(); g.stroke();
      g.fillStyle = '#f1c40f'; g.beginPath(); g.arc(0, hy - r * 1.15, r * 0.15, 0, TAU); g.fill();
      break;
    }
    case 'captain': {
      g.fillStyle = look.hatColor || '#1e272e';
      g.beginPath(); g.ellipse(0, hy - r * 0.6, r * 1.6, r * 0.38, 0, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(0, hy - r * 0.95, r * 0.95, r * 0.6, 0, Math.PI, 0); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, hy - r * 1.1, r * 0.18, 0, TAU); g.fill();
      g.fillStyle = '#e74c3c'; g.beginPath(); g.moveTo(r * 0.8, hy - r * 1.0); g.quadraticCurveTo(r * 1.6, hy - r * 1.9, r * 1.3, hy - r * 0.8); g.fill();
      break;
    }
    case 'cowboy': {
      g.fillStyle = look.hatColor || '#8d6e4a';
      g.beginPath(); g.ellipse(0, hy - r * 0.6, r * 1.6, r * 0.35, 0, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.roundRect(-r * 0.7, hy - r * 1.5, r * 1.4, r * 0.95, r * 0.3); g.fill(); g.stroke();
      break;
    }
    case 'beanie': {
      g.fillStyle = look.hatColor || '#e74c3c';
      g.beginPath(); g.arc(0, hy - r * 0.2, r * 1.05, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, hy - r * 1.25, r * 0.22, 0, TAU); g.fill();
      break;
    }
    case 'pinkhat': {
      g.fillStyle = '#f78fb3';
      g.beginPath(); g.ellipse(0, hy - r * 0.55, r * 1.3, r * 0.35, 0, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.roundRect(-r * 0.8, hy - r * 1.6, r * 1.6, r * 1.05, r * 0.4); g.fill(); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 0.05; g.beginPath(); g.moveTo(-r * 0.3, hy - r * 1.1); g.lineTo(r * 0.3, hy - r * 1.1); g.moveTo(0, hy - r * 1.4); g.lineTo(0, hy - r * 0.8); g.stroke();
      break;
    }
    case 'horns': {
      g.fillStyle = '#ecf0f1';
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * r * 0.5, hy - r * 0.7); g.quadraticCurveTo(sx * r * 1.4, hy - r * 1.4, sx * r * 1.1, hy - r * 2.0); g.lineTo(sx * r * 0.3, hy - r * 0.8); g.fill(); g.stroke(); }
      break;
    }
    case 'antlers': {
      g.strokeStyle = '#8d6e63'; g.lineWidth = 0.06; g.lineCap = 'round';
      for (const sx of [-1, 1]) {
        g.beginPath(); g.moveTo(sx * r * 0.5, hy - r * 0.8); g.lineTo(sx * r * 1.2, hy - r * 1.9);
        g.moveTo(sx * r * 0.85, hy - r * 1.35); g.lineTo(sx * r * 1.5, hy - r * 1.4);
        g.moveTo(sx * r * 1.05, hy - r * 1.7); g.lineTo(sx * r * 0.8, hy - r * 2.2); g.stroke();
      }
      break;
    }
    case 'crown': {
      g.fillStyle = '#f1c40f';
      g.beginPath(); g.moveTo(-r * 0.7, hy - r * 0.7); g.lineTo(-r * 0.8, hy - r * 1.4); g.lineTo(-r * 0.35, hy - r * 1.05); g.lineTo(0, hy - r * 1.5); g.lineTo(r * 0.35, hy - r * 1.05); g.lineTo(r * 0.8, hy - r * 1.4); g.lineTo(r * 0.7, hy - r * 0.7); g.closePath(); g.fill(); g.stroke();
      break;
    }
    case 'bubble': {
      g.fillStyle = 'rgba(200,235,255,0.22)'; g.strokeStyle = 'rgba(220,245,255,0.8)'; g.lineWidth = 0.04;
      g.beginPath(); g.arc(0, hy - r * 0.1, r * 1.7, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(-r * 0.7, hy - r * 0.9, r * 0.22, 0, TAU); g.fill();
      break;
    }
    case 'halo': {
      g.strokeStyle = '#ffe082'; g.lineWidth = 0.06;
      g.beginPath(); g.ellipse(0, hy - r * 1.55, r * 0.7, r * 0.2, 0, 0, TAU); g.stroke();
      break;
    }
    case 'headband': {
      g.fillStyle = look.hatColor || '#c0392b'; g.fillRect(-r * 1.02, hy - r * 0.55, r * 2.04, r * 0.22);
      break;
    }
    case 'goggles': {
      g.fillStyle = '#2d3436'; g.fillRect(-r * 1.02, hy - r * 0.62, r * 2.04, r * 0.14);
      circ(g, -r * 0.35, hy - r * 0.55, r * 0.22, '#74b9ff', OUTLINE); circ(g, r * 0.35, hy - r * 0.55, r * 0.22, '#74b9ff', OUTLINE);
      break;
    }
    default: break;
  }
}
