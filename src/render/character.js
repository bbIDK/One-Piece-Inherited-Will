// Procedural chibi characters, drawn in tile units with the origin at the
// feet. Handles 4 facings (left mirrors right), walk/attack/block/knocked/swim
// poses and every playable race's features.
import { shade } from '../core/math.js';

const TAU = Math.PI * 2;

function circ(g, x, y, r, fill, stroke, lw = 0.04) {
  g.beginPath(); g.arc(x, y, r, 0, TAU);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function rrect(g, x, y, w, h, r, fill, stroke, lw = 0.04) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function limb(g, x0, y0, x1, y1, w, col, outline) {
  g.lineCap = 'round';
  if (outline) { g.strokeStyle = outline; g.lineWidth = w + 0.07; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}

const OUTLINE = 'rgba(30,20,20,0.85)';

/** facing angle → 'down' | 'up' | 'right' | 'left' */
export function dir4(angle) {
  const a = ((angle % TAU) + TAU) % TAU;
  if (a > Math.PI * 0.25 && a <= Math.PI * 0.75) return 'down';
  if (a > Math.PI * 0.75 && a <= Math.PI * 1.25) return 'left';
  if (a > Math.PI * 1.25 && a <= Math.PI * 1.75) return 'up';
  return 'right';
}

/**
 * Draw a character.
 * look: appearance (see data/races.js makeLook)
 * pose: { facing, walk (phase), moving, action, actionT (0..1), state, bob, flash, alpha, weapon, aura, swimming }
 */
export function drawCharacter(g, look, pose) {
  const s = look.scale || 1;
  const d = dir4(pose.facing || 0);
  const flip = d === 'left';
  const side = d === 'left' || d === 'right';
  const back = d === 'up';
  const skin = look.skin || '#f1c9a0';
  const top = look.top || '#d63031';
  const bottom = look.bottom || '#2d3436';
  const hair = look.hairColor || '#2d2d2d';
  const t = pose.time || 0;

  g.save();
  if (pose.alpha !== undefined) g.globalAlpha *= pose.alpha;

  // shadow
  if (!pose.swimming) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(0, 0, 0.36 * s * (look.bulk || 1), 0.13 * s, 0, 0, TAU); g.fill();
  }

  if (pose.state === 'knocked' || pose.state === 'dead') {
    drawLying(g, look, pose, s);
    g.restore();
    return;
  }

  g.scale(flip ? -s : s, s);
  const legLen = look.legs || 1; // longleg tribe → 2
  const armLen = look.arms || 1; // longarm tribe → 1.8
  const bulk = look.bulk || 1;
  const walk = pose.moving ? Math.sin(pose.walk || 0) : 0;
  const bob = pose.moving ? Math.abs(Math.cos(pose.walk || 0)) * 0.05 : Math.sin(t * 2.2) * 0.012;

  const hipY = -0.42 * legLen - 0.05;
  const shoulderY = hipY - 0.42 * bulk - bob;
  const headY = shoulderY - 0.3 - (look.neck || 0);
  const headR = 0.3;

  if (pose.swimming) {
    // only upper body above water
    g.translate(0, 0.45 * legLen + 0.2);
    g.beginPath(); g.rect(-2, -4, 4, 3.62); g.clip();
  }

  // aura (haki / devil fruit awakening)
  if (pose.aura) {
    const a = pose.aura;
    g.save();
    g.globalAlpha *= 0.35 + 0.15 * Math.sin(t * 10);
    g.fillStyle = a;
    g.beginPath(); g.ellipse(0, (headY + 0) / 2, 0.6 * bulk + 0.1, -headY / 2 + 0.3, 0, 0, TAU); g.fill();
    g.restore();
  }

  // --- back layer: wings, tail, back flame, cape
  const drawWings = () => {
    if (look.wings === 'sky') {
      g.fillStyle = '#ffffff'; g.strokeStyle = OUTLINE; g.lineWidth = 0.035;
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * 0.1, shoulderY + 0.05);
        g.quadraticCurveTo(sx * 0.55, shoulderY - 0.35 + Math.sin(t * 3) * 0.03, sx * 0.45, shoulderY + 0.25);
        g.quadraticCurveTo(sx * 0.3, shoulderY + 0.2, sx * 0.1, shoulderY + 0.2);
        g.closePath(); g.fill(); g.stroke();
      }
    } else if (look.wings === 'lunar') {
      g.fillStyle = '#1e1e24'; g.strokeStyle = '#000'; g.lineWidth = 0.03;
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * 0.1, shoulderY);
        g.quadraticCurveTo(sx * 0.9, shoulderY - 0.7 + Math.sin(t * 2.5) * 0.05, sx * 0.85, shoulderY + 0.35);
        g.lineTo(sx * 0.6, shoulderY + 0.15); g.lineTo(sx * 0.5, shoulderY + 0.4); g.lineTo(sx * 0.3, shoulderY + 0.2);
        g.closePath(); g.fill(); g.stroke();
      }
    }
  };
  const drawBackFlame = () => {
    if (!look.backFlame) return;
    for (let k = 0; k < 4; k++) {
      const ph = (t * 3 + k * 0.25) % 1;
      g.fillStyle = ['#ff6b35', '#f7931e', '#ffd23f', '#ff6b35'][k];
      g.globalAlpha *= 1;
      g.beginPath();
      const bx = (k - 1.5) * 0.08;
      g.moveTo(bx - 0.12, shoulderY + 0.1);
      g.quadraticCurveTo(bx + Math.sin(t * 8 + k) * 0.1, shoulderY - 0.45 - ph * 0.3, bx + 0.12, shoulderY + 0.1);
      g.fill();
    }
  };
  const drawTail = () => {
    if (!look.tail) return;
    g.strokeStyle = look.fur || hair; g.lineWidth = look.tail === 'fluffy' ? 0.2 : 0.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, hipY + 0.05);
    g.quadraticCurveTo(-0.45, hipY + 0.1 + Math.sin(t * 4) * 0.08, -0.5, hipY - 0.35);
    g.stroke();
  };
  const drawCape = () => {
    if (!look.coat) return;
    const c = look.coat;
    g.fillStyle = c; g.strokeStyle = OUTLINE; g.lineWidth = 0.035;
    const sway = pose.moving ? Math.sin((pose.walk || 0) * 0.5) * 0.06 : 0;
    g.beginPath();
    g.moveTo(-0.28 * bulk, shoulderY);
    g.lineTo(0.28 * bulk, shoulderY);
    g.lineTo(0.36 * bulk + sway, hipY + 0.35);
    g.lineTo(-0.36 * bulk + sway, hipY + 0.35);
    g.closePath(); g.fill(); g.stroke();
    if (look.coatText && back) {
      g.fillStyle = '#1b4f72'; g.font = 'bold 0.16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(look.coatText, sway * 0.5, (shoulderY + hipY) / 2 + 0.08);
    }
  };

  if (!back) { drawBackFlame(); drawWings(); drawTail(); if (look.coat) drawCape(); }

  // --- legs
  const legW = 0.15 * bulk;
  const legSpread = side ? 0.04 : 0.11 * bulk;
  const stepA = walk * 0.14 * legLen, stepB = -walk * 0.14 * legLen;
  const footY = pose.swimming ? 0 : -0.02;
  if (side) {
    limb(g, 0.02, hipY, 0.02 + stepB, footY, legW, shade(bottom, -0.15), OUTLINE);
    limb(g, -0.02, hipY, -0.02 + stepA, footY, legW, bottom, OUTLINE);
    rrect(g, -0.02 + stepA - 0.02, footY - 0.06, 0.2, 0.09, 0.04, look.shoes || '#3b2a1a');
  } else {
    limb(g, -legSpread, hipY, -legSpread, footY - stepA * 0.4, legW, bottom, OUTLINE);
    limb(g, legSpread, hipY, legSpread, footY - stepB * 0.4, legW, bottom, OUTLINE);
    rrect(g, -legSpread - 0.09, footY - stepA * 0.4 - 0.06, 0.18, 0.09, 0.04, look.shoes || '#3b2a1a');
    rrect(g, legSpread - 0.09, footY - stepB * 0.4 - 0.06, 0.18, 0.09, 0.04, look.shoes || '#3b2a1a');
  }
  if (look.sandals) { /* bare-ish feet */ }

  // --- action-driven arm positions
  const act = pose.action;
  const p = pose.actionT ?? 0;
  const sh = { x: side ? 0.02 : 0.27 * bulk, y: shoulderY + 0.08 };
  let armF = { a: 0.2 + walk * 0.5, len: 0.42 * armLen }; // front arm angle from straight-down
  let armB = { a: -0.2 - walk * 0.5, len: 0.42 * armLen };
  let weaponAngle = null;
  if (act === 'punch' || act === 'kick' || act === 'heavy' || act === 'slash' || act === 'thrust' || act === 'shoot' || act === 'cast' || act === 'block' || act === 'grab') {
    const ease = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65 * 0.6;
    if (act === 'punch' || act === 'thrust' || act === 'shoot' || act === 'grab') {
      armF = { a: -Math.PI / 2 * ease * (side ? 1 : 0.9), len: (0.42 + 0.25 * ease) * armLen };
      if (armLen > 1.2) armF.len = (0.42 + 0.6 * ease) * armLen;
    } else if (act === 'slash' || act === 'heavy') {
      const swing = -2.6 + p * 3.6;
      armF = { a: swing, len: 0.44 * armLen };
      weaponAngle = swing;
    } else if (act === 'cast') {
      armF = { a: -2.6, len: 0.44 * armLen }; armB = { a: 2.6, len: 0.44 * armLen };
    } else if (act === 'block') {
      armF = { a: -1.2, len: 0.3 }; armB = { a: 1.2, len: 0.3 };
    }
  }
  const armEnd = (arm) => ({ x: sh.x + Math.sin(-arm.a) * arm.len * (side ? 1 : 0.2), y: sh.y + Math.cos(arm.a) * arm.len });

  // back arm (behind body)
  if (side || back) {
    const e = armEnd(armB);
    const bx = side ? -0.04 : -sh.x;
    limb(g, bx, sh.y, bx + (e.x - sh.x) * (side ? 1 : 0) - (side ? 0.05 : 0), e.y, 0.12 * bulk, shade(look.sleeve || skin, -0.15), OUTLINE);
  }

  // --- torso
  const torsoW = 0.46 * bulk, torsoH = hipY - shoulderY + 0.05;
  if (back) drawCapeBackFirst();
  function drawCapeBackFirst() { /* cape drawn after torso when facing up */ }
  rrect(g, -torsoW / 2, shoulderY - 0.02, torsoW, torsoH, 0.12, top, OUTLINE);
  if (look.vest) {
    g.fillStyle = look.vest;
    g.fillRect(-torsoW / 2 + 0.02, shoulderY + 0.02, 0.1, torsoH - 0.1);
    g.fillRect(torsoW / 2 - 0.12, shoulderY + 0.02, 0.1, torsoH - 0.1);
  }
  if (look.openShirt && !back && !side) {
    g.fillStyle = skin;
    g.beginPath(); g.moveTo(-0.07, shoulderY); g.lineTo(0.07, shoulderY); g.lineTo(0.03, hipY - 0.05); g.lineTo(-0.03, hipY - 0.05); g.fill();
    if (look.scar) { g.strokeStyle = '#b0413e'; g.lineWidth = 0.03; g.beginPath(); g.moveTo(-0.08, shoulderY + 0.1); g.lineTo(0.08, shoulderY + 0.25); g.stroke(); }
  }
  // belt / sash
  g.fillStyle = look.belt || shade(bottom, -0.3);
  g.fillRect(-torsoW / 2, hipY - 0.07, torsoW, 0.07);
  if (look.gills) {
    g.strokeStyle = shade(skin, -0.35); g.lineWidth = 0.02;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-0.12 + k * 0.03, shoulderY + 0.02); g.lineTo(-0.08 + k * 0.03, shoulderY + 0.1); g.stroke(); }
  }
  if (back) { drawCape(); drawTail(); drawWings(); drawBackFlame(); }

  // sword(s) at the hip when not attacking
  const swords = look.swords || 0;
  if (swords && weaponAngle === null) {
    for (let k = 0; k < Math.min(swords, 3); k++) {
      g.save();
      g.translate(side ? -0.12 : 0.18 - k * 0.05, hipY - 0.02);
      g.rotate(side ? 2.3 - k * 0.12 : 2.6 - k * 0.15);
      g.fillStyle = ['#ecf0f1', '#2c3e50', '#c0392b'][k] || '#2c3e50';
      g.fillRect(-0.02, 0, 0.05, 0.62);
      g.fillStyle = '#f1c40f'; g.fillRect(-0.05, 0.0, 0.11, 0.03);
      g.restore();
    }
  }

  // front arm
  {
    const e = armEnd(armF);
    const fx = side ? 0.06 : sh.x;
    const ex = side ? fx + (e.x - sh.x) : fx + (e.x - sh.x) * 0.2;
    limb(g, fx, sh.y, ex, e.y, 0.13 * bulk, look.sleeve || skin, OUTLINE);
    if (armLen > 1.2) circ(g, (fx + ex) / 2, (sh.y + e.y) / 2, 0.075, look.sleeve || skin, OUTLINE, 0.03); // extra elbow
    circ(g, ex, e.y, 0.085 * bulk, look.hand || skin, OUTLINE, 0.03);
    if (weaponAngle !== null && (look.weapon === 'sword' || swords)) {
      g.save(); g.translate(ex, e.y); g.rotate(weaponAngle + Math.PI);
      g.fillStyle = '#dfe6e9'; g.strokeStyle = '#636e72'; g.lineWidth = 0.02;
      g.beginPath(); g.moveTo(-0.03, 0.05); g.lineTo(0.03, 0.05); g.lineTo(0.02, 0.95); g.lineTo(-0.01, 1.02); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#f1c40f'; g.fillRect(-0.07, 0.02, 0.14, 0.04);
      g.restore();
    } else if (look.weapon === 'gun' && (act === 'shoot' || pose.aiming)) {
      g.save(); g.translate(ex, e.y); g.rotate(-Math.PI / 2 * (side ? 1 : 0));
      g.fillStyle = '#2d3436'; g.fillRect(0, -0.04, 0.35, 0.08); g.fillStyle = '#8d5b33'; g.fillRect(-0.05, -0.02, 0.1, 0.14);
      g.restore();
    } else if (look.weapon === 'staff') {
      g.strokeStyle = '#74b9ff'; g.lineWidth = 0.05;
      g.beginPath(); g.moveTo(ex, e.y - 0.5); g.lineTo(ex, e.y + 0.4); g.stroke();
    }
  }
  if (!side && !back) {
    // second arm in front view
    const e = armEnd(armB);
    limb(g, -sh.x, sh.y, -sh.x - (e.x - sh.x) * 0.2, e.y, 0.13 * bulk, look.sleeve || skin, OUTLINE);
    circ(g, -sh.x - (e.x - sh.x) * 0.2, e.y, 0.085 * bulk, look.hand || skin, OUTLINE, 0.03);
  }

  // neck (snakeneck/longneck)
  if (look.neck) {
    rrect(g, -0.08, headY + 0.1, 0.16, shoulderY - headY - 0.08, 0.06, skin, OUTLINE);
  }

  // --- head
  drawHead(g, look, headY, headR, d, pose, t);

  g.restore();
}

function drawHead(g, look, hy, r, d, pose, t) {
  const skin = look.skin || '#f1c9a0';
  const hair = look.hairColor || '#2d2d2d';
  const side = d === 'left' || d === 'right';
  const back = d === 'up';

  // mink ears (behind hair)
  if (look.ears) {
    const ec = look.fur || hair;
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
  // fish-man dorsal fin
  if (look.fin) {
    g.fillStyle = shade(skin, -0.2); g.strokeStyle = OUTLINE; g.lineWidth = 0.03;
    g.beginPath(); g.moveTo(-0.12, hy - r * 0.8); g.quadraticCurveTo(0.05, hy - r * 1.9, 0.22, hy - r * 0.75); g.closePath(); g.fill(); g.stroke();
  }

  circ(g, 0, hy, r, look.fur && look.furFace ? look.fur : skin, OUTLINE, 0.04);
  // mink snout / muzzle
  if (look.muzzle && !back) {
    circ(g, side ? r * 0.55 : 0, hy + r * 0.3, r * 0.38, shade(look.fur || skin, 0.35), null);
    circ(g, side ? r * 0.82 : 0, hy + r * 0.18, 0.045, '#2d2d2d');
  }

  // hair
  drawHair(g, look.hair || 'short', hair, hy, r, d);

  // face
  if (!back) {
    const ex = side ? r * 0.4 : r * 0.36;
    const eyeY = hy + r * 0.05;
    const eyeCol = look.eyeColor || '#222';
    const blink = Math.sin(t * 1.7 + (look.seed || 0)) > 0.985;
    const drawEye = (x) => {
      if (blink) { g.strokeStyle = '#222'; g.lineWidth = 0.025; g.beginPath(); g.moveTo(x - 0.05, eyeY); g.lineTo(x + 0.05, eyeY); g.stroke(); return; }
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, eyeY, 0.06, 0.075, 0, 0, TAU); g.fill();
      g.fillStyle = eyeCol; g.beginPath(); g.ellipse(x + (side ? 0.015 : 0), eyeY + 0.01, 0.035, 0.05, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 0.01, eyeY - 0.02, 0.012, 0, TAU); g.fill();
    };
    if (side) drawEye(ex);
    else { drawEye(-ex); drawEye(ex); }
    if (look.thirdEye) {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(side ? r * 0.2 : 0, hy - r * 0.35, 0.05, 0.065, 0, 0, TAU); g.fill();
      g.fillStyle = look.eyeColor || '#8e44ad'; g.beginPath(); g.arc(side ? r * 0.21 : 0, hy - r * 0.34, 0.028, 0, TAU); g.fill();
    }
    // mouth
    g.strokeStyle = '#6b2b2b'; g.lineWidth = 0.025;
    const my = hy + r * 0.5;
    g.beginPath();
    if (pose.state === 'hurt' || pose.action === 'heavy') { g.ellipse(side ? r * 0.35 : 0, my, 0.05, 0.035, 0, 0, TAU); g.fillStyle = '#6b2b2b'; g.fill(); }
    else if (look.grin) { g.arc(side ? r * 0.35 : 0, my - 0.04, 0.08, 0.2, Math.PI - 0.2); g.stroke(); if (look.sharpTeeth) { g.fillStyle = '#fff'; g.fillRect((side ? r * 0.35 : 0) - 0.06, my - 0.01, 0.12, 0.03); } }
    else { g.moveTo((side ? r * 0.3 : 0) - 0.04, my); g.lineTo((side ? r * 0.3 : 0) + 0.04, my); g.stroke(); }
    if (look.scarEye) { g.strokeStyle = '#b0413e'; g.lineWidth = 0.025; g.beginPath(); g.moveTo(-ex - 0.02, eyeY - 0.12); g.lineTo(-ex + 0.03, eyeY + 0.12); g.stroke(); }
    if (look.nose === 'long') { g.fillStyle = skin; g.strokeStyle = OUTLINE; g.lineWidth = 0.02; g.beginPath(); g.moveTo(side ? r * 0.7 : -0.04, hy + r * 0.2); g.lineTo(side ? r * 1.6 : 0, hy + r * 0.25); g.lineTo(side ? r * 0.7 : 0.04, hy + r * 0.32); g.fill(); g.stroke(); }
    if (pose.flash) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(0, hy, r, 0, TAU); g.fill(); }
  }

  drawHat(g, look.hat, hy, r, d, look);
}

function drawHair(g, style, col, hy, r, d) {
  if (style === 'bald') return;
  const back = d === 'up';
  g.fillStyle = col; g.strokeStyle = OUTLINE; g.lineWidth = 0.035;
  g.beginPath();
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

function drawHat(g, hat, hy, r, d, look) {
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
    case 'pinkhat': { // Chopper-style
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
    case 'crown': {
      g.fillStyle = '#f1c40f';
      g.beginPath(); g.moveTo(-r * 0.7, hy - r * 0.7); g.lineTo(-r * 0.8, hy - r * 1.4); g.lineTo(-r * 0.35, hy - r * 1.05); g.lineTo(0, hy - r * 1.5); g.lineTo(r * 0.35, hy - r * 1.05); g.lineTo(r * 0.8, hy - r * 1.4); g.lineTo(r * 0.7, hy - r * 0.7); g.closePath(); g.fill(); g.stroke();
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

function drawLying(g, look, pose, s) {
  // knocked out / defeated: character lying on their back
  g.save();
  g.scale(s, s);
  g.rotate(-Math.PI / 2 * 0.92);
  g.translate(0.55, -0.1);
  const skin = look.skin || '#f1c9a0';
  rrect(g, -0.25, -0.75, 0.5, 0.55, 0.12, look.top || '#d63031', OUTLINE);
  limb(g, -0.1, -0.2, -0.12, 0.25, 0.15, look.bottom || '#2d3436', OUTLINE);
  limb(g, 0.1, -0.2, 0.14, 0.25, 0.15, look.bottom || '#2d3436', OUTLINE);
  circ(g, 0, -1.0, 0.3, skin, OUTLINE);
  drawHair(g, look.hair || 'short', look.hairColor || '#2d2d2d', -1.0, 0.3, 'down');
  g.strokeStyle = '#222'; g.lineWidth = 0.03;
  for (const ex of [-0.1, 0.1]) { g.beginPath(); g.moveTo(ex - 0.04, -1.02); g.lineTo(ex + 0.04, -0.96); g.moveTo(ex + 0.04, -1.02); g.lineTo(ex - 0.04, -0.96); g.stroke(); }
  g.restore();
  if (pose.state === 'knocked' && pose.time !== undefined) {
    // spinning stars
    for (let k = 0; k < 3; k++) {
      const a = pose.time * 4 + k * TAU / 3;
      g.fillStyle = '#f1c40f';
      g.font = '0.3px sans-serif';
      g.fillText('★', Math.cos(a) * 0.4 * s - 0.6 * s, -0.45 * s + Math.sin(a) * 0.15);
    }
  }
}
