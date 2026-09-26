// Projectile art. `this` is the projectile; the renderer has translated the
// context to its position (tile units, +y down).
const TAU = Math.PI * 2;

export function drawProjectile(g, env, r) {
  const p = this;
  const a = Math.atan2(p.vy, p.vx);
  const s = p.size || 1;
  const t = p.t || 0;
  const lift = -0.5; // projectiles fly at chest height
  g.translate(0, lift);
  switch (p.sprite) {
    case 'gomufist': {
      // stretched rubber arm back to the owner
      if (p.stretch && p.stretch.alive) {
        const w = r.game ? r.game.world : null;
        const dx = w ? w.dx(p.x, p.stretch.x) : p.stretch.x - p.x;
        const dy = p.stretch.y - 0.9 - p.y + 0.5;
        g.strokeStyle = p.stretch.look?.sleeve || p.stretch.look?.skin || '#f1c9a0';
        g.lineWidth = 0.22 * s; g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, 0); g.lineTo(dx, dy); g.stroke();
        g.strokeStyle = 'rgba(40,20,20,0.6)'; g.lineWidth = 0.04; g.stroke();
      }
      g.fillStyle = p.stretch?.armament ? '#212121' : (p.stretch?.look?.skin || '#f1c9a0');
      g.strokeStyle = '#3b2a1a'; g.lineWidth = 0.05;
      g.beginPath(); g.arc(0, 0, 0.3 * s, 0, TAU); g.fill(); g.stroke();
      break;
    }
    case 'fireball':
    case 'firefist': {
      for (let k = 0; k < 3; k++) {
        g.fillStyle = ['rgba(255,87,34,0.55)', 'rgba(255,152,0,0.8)', 'rgba(255,235,59,0.95)'][k];
        g.beginPath(); g.ellipse(-Math.cos(a) * 0.15 * (2 - k), -Math.sin(a) * 0.15 * (2 - k), (0.55 - k * 0.13) * s, (0.42 - k * 0.1) * s, a, 0, TAU); g.fill();
      }
      break;
    }
    case 'magmafist': {
      g.fillStyle = '#bf360c'; g.beginPath(); g.arc(0, 0, 0.55 * s, 0, TAU); g.fill();
      g.fillStyle = '#ff6f00'; g.beginPath(); g.arc(Math.sin(t * 20) * 0.05, 0, 0.38 * s, 0, TAU); g.fill();
      g.fillStyle = '#ffd54f'; g.beginPath(); g.arc(0, 0, 0.18 * s, 0, TAU); g.fill();
      break;
    }
    case 'iceshard': {
      g.rotate(a);
      g.fillStyle = '#b3e5fc'; g.strokeStyle = '#e1f5fe'; g.lineWidth = 0.04;
      g.beginPath(); g.moveTo(0.5 * s, 0); g.lineTo(-0.3 * s, -0.16 * s); g.lineTo(-0.45 * s, 0); g.lineTo(-0.3 * s, 0.16 * s); g.closePath(); g.fill(); g.stroke();
      break;
    }
    case 'bird': {
      g.rotate(a);
      g.fillStyle = p.color || '#b3e5fc';
      g.beginPath(); g.moveTo(0.5 * s, 0); g.quadraticCurveTo(-0.1, -0.7 * s + Math.sin(t * 20) * 0.2, -0.5 * s, -0.5 * s); g.lineTo(-0.2 * s, 0); g.lineTo(-0.5 * s, 0.5 * s); g.quadraticCurveTo(-0.1, 0.7 * s - Math.sin(t * 20) * 0.2, 0.5 * s, 0); g.fill();
      break;
    }
    case 'airslash': {
      g.rotate(a);
      g.strokeStyle = p.color || '#e3f2fd'; g.lineWidth = 0.12 * s; g.lineCap = 'round';
      g.beginPath(); g.arc(-0.4 * s, 0, 0.7 * s, -1.1, 1.1); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.05 * s; g.stroke();
      break;
    }
    case 'bullet': {
      g.rotate(a);
      g.fillStyle = '#ffe082'; g.fillRect(-0.3, -0.03, 0.3, 0.06);
      g.fillStyle = '#424242'; g.beginPath(); g.arc(0, 0, 0.07, 0, TAU); g.fill();
      break;
    }
    case 'cannonball': {
      g.fillStyle = '#212121'; g.beginPath(); g.arc(0, 0, 0.22 * s, 0, TAU); g.fill();
      g.fillStyle = '#616161'; g.beginPath(); g.arc(-0.06, -0.06, 0.07 * s, 0, TAU); g.fill();
      break;
    }
    case 'bomb': {
      g.fillStyle = '#263238'; g.beginPath(); g.arc(0, 0, 0.25 * s, 0, TAU); g.fill();
      g.strokeStyle = '#8d6e63'; g.lineWidth = 0.04; g.beginPath(); g.moveTo(0.1, -0.2); g.lineTo(0.2, -0.35); g.stroke();
      g.fillStyle = Math.sin(t * 30) > 0 ? '#ffeb3b' : '#ff7043'; g.beginPath(); g.arc(0.2, -0.37, 0.06, 0, TAU); g.fill();
      break;
    }
    case 'sandblade': {
      g.rotate(a);
      g.fillStyle = 'rgba(225,193,110,0.9)';
      g.beginPath(); g.moveTo(0.5 * s, 0); g.quadraticCurveTo(0, -0.8 * s, -0.5 * s, -0.6 * s); g.quadraticCurveTo(-0.1, 0, -0.5 * s, 0.6 * s); g.quadraticCurveTo(0, 0.8 * s, 0.5 * s, 0); g.fill();
      break;
    }
    case 'smokefist': {
      g.fillStyle = 'rgba(236,239,241,0.9)';
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(-Math.cos(a) * k * 0.2, -Math.sin(a) * k * 0.2, (0.5 - k * 0.08) * s, 0, TAU); g.fill(); }
      break;
    }
    case 'lightorb': {
      g.fillStyle = 'rgba(255,249,196,0.5)'; g.beginPath(); g.arc(0, 0, 0.4 * s, 0, TAU); g.fill();
      g.fillStyle = '#fffde7'; g.beginPath(); g.arc(0, 0, 0.2 * s, 0, TAU); g.fill();
      g.rotate(a); g.fillStyle = 'rgba(255,245,157,0.5)'; g.fillRect(-1.2 * s, -0.08, 1.2 * s, 0.16);
      break;
    }
    case 'darkorb': {
      g.fillStyle = 'rgba(49,27,146,0.6)'; g.beginPath(); g.arc(0, 0, 0.55 * s, 0, TAU); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, 0.35 * s, 0, TAU); g.fill();
      break;
    }
    case 'thunder': {
      g.strokeStyle = '#fff176'; g.lineWidth = 0.08;
      g.beginPath();
      for (let k = 0; k < 6; k++) { const aa = (k / 6) * TAU + t * 10; g.moveTo(0, 0); g.lineTo(Math.cos(aa) * 0.5 * s, Math.sin(aa) * 0.5 * s); }
      g.stroke();
      g.fillStyle = '#fffde7'; g.beginPath(); g.arc(0, 0, 0.22 * s, 0, TAU); g.fill();
      break;
    }
    case 'waterdrop': {
      g.fillStyle = '#4fc3f7'; g.beginPath(); g.arc(0, 0, 0.14 * s, 0, TAU); g.fill();
      g.fillStyle = '#e1f5fe'; g.beginPath(); g.arc(-0.04, -0.04, 0.05 * s, 0, TAU); g.fill();
      break;
    }
    case 'shockwave': {
      g.rotate(a);
      g.strokeStyle = p.color || '#e0f7fa'; g.lineWidth = 0.1;
      for (let k = 0; k < 3; k++) { g.globalAlpha = 1 - k * 0.3; g.beginPath(); g.arc(-k * 0.25, 0, (0.4 + k * 0.1) * s, -1.2, 1.2); g.stroke(); }
      g.globalAlpha = 1;
      break;
    }
    case 'star': {
      g.fillStyle = p.color || '#ffeb3b'; g.rotate(t * 12);
      g.beginPath();
      for (let k = 0; k < 10; k++) { const rr = k % 2 ? 0.1 * s : 0.25 * s; g.lineTo(Math.cos(k * TAU / 10) * rr, Math.sin(k * TAU / 10) * rr); }
      g.closePath(); g.fill();
      break;
    }
    case 'poison': {
      g.fillStyle = 'rgba(123,31,162,0.8)'; g.beginPath(); g.arc(0, 0, 0.4 * s, 0, TAU); g.fill();
      g.fillStyle = 'rgba(174,213,129,0.8)'; g.beginPath(); g.arc(0.08, -0.08, 0.15 * s, 0, TAU); g.fill();
      break;
    }
    case 'string': {
      g.rotate(a); g.strokeStyle = '#f8bbd0'; g.lineWidth = 0.03;
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-1.2, k * 0.06); g.lineTo(0.3, k * 0.02); g.stroke(); }
      break;
    }
    case 'paw': {
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.strokeStyle = '#fff'; g.lineWidth = 0.04;
      g.beginPath(); g.arc(0, 0.1, 0.35 * s, 0, TAU); g.fill(); g.stroke();
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc((k - 1) * 0.2 * s, -0.3 * s, 0.1 * s, 0, TAU); g.fill(); g.stroke(); }
      break;
    }
    case 'petal': {
      g.fillStyle = '#f48fb1';
      for (let k = 0; k < 5; k++) { g.save(); g.rotate(k * TAU / 5 + t * 5); g.beginPath(); g.ellipse(0.15, 0, 0.14, 0.07, 0, 0, TAU); g.fill(); g.restore(); }
      break;
    }
    default: {
      g.fillStyle = p.color || '#ffffff';
      g.beginPath(); g.arc(0, 0, 0.25 * s, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(-0.06, -0.06, 0.08 * s, 0, TAU); g.fill();
    }
  }
}
