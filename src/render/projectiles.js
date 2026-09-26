// Projectile art. `this` is the projectile; the renderer has translated the
// context to its position (tile units, +y down). Every sprite gets a motion
// tail along its velocity so fast shots read at a glance.
const TAU = Math.PI * 2;
const OUT = 'rgba(30,20,20,0.85)';

function tail(g, a, len, w, col0, col1) {
  // a tapered streak behind the projectile (drawn in its local frame)
  g.save();
  g.rotate(a);
  const gr = g.createLinearGradient(0, 0, -len, 0);
  gr.addColorStop(0, col0); gr.addColorStop(1, col1 || 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(0, -w / 2); g.lineTo(-len, 0); g.lineTo(0, w / 2); g.closePath(); g.fill();
  g.restore();
}
function glowDisc(g, r, col, a = 0.35) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= a;
  g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.restore();
}
function rgbaOf(col, a) {
  if (col && col[0] === '#') {
    let h = col.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return col;
}
function fistShape(g, R, col, dark) {
  // a chunky fist seen from the knuckles, pointing along +x
  g.fillStyle = col; g.strokeStyle = OUT; g.lineWidth = 0.05 * Math.max(1, R / 0.3);
  g.beginPath(); g.roundRect(-R * 0.9, -R * 0.85, R * 1.8, R * 1.7, R * 0.5); g.fill(); g.stroke();
  g.strokeStyle = dark; g.lineWidth = 0.03 * Math.max(1, R / 0.3);
  g.beginPath();
  for (let k = -1; k <= 1; k++) { g.moveTo(R * 0.45, k * R * 0.5 - R * 0.12); g.lineTo(R * 0.85, k * R * 0.5 - R * 0.12); }
  g.stroke();
  g.fillStyle = col; g.strokeStyle = OUT; g.lineWidth = 0.035 * Math.max(1, R / 0.3);
  g.beginPath(); g.ellipse(R * 0.1, R * 0.62, R * 0.5, R * 0.25, 0.2, 0, TAU); g.fill(); g.stroke();
}

export function drawProjectile(g) {
  const p = this;
  const a = Math.atan2(p.vy, p.vx);
  const s = p.size || 1;
  const t = p.t || 0;
  const sp = Math.hypot(p.vx, p.vy);
  const lift = -0.5; // projectiles fly at chest height
  g.translate(0, lift);
  switch (p.sprite) {
    case 'gomufist': {
      // stretched rubber arm back to the owner
      const o = p.stretch;
      const skin = o?.look?.skin || '#f1c9a0';
      const sleeve = o?.look?.sleeve || skin;
      const dark = o?.armament ? '#1c1a24' : null;
      if (o && o.alive) {
        const w = o.game ? o.game.world : null;
        const dx = w ? w.dx(p.x, o.x) : o.x - p.x;
        const dy = o.y - 0.9 - p.y + 0.5;
        const L = Math.hypot(dx, dy) || 1;
        const wd = Math.min(0.26 * s, 0.16 + 0.04 * s);
        g.lineCap = 'round';
        g.strokeStyle = OUT; g.lineWidth = wd + 0.07;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(dx * 0.5, dy * 0.5 + Math.sin(t * 30) * 0.08, dx, dy); g.stroke();
        g.strokeStyle = dark || sleeve; g.lineWidth = wd;
        g.stroke();
        // rubbery stretch marks
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.02;
        g.beginPath();
        for (let k = 1; k < Math.min(12, L * 2.5); k++) {
          const u = k / Math.min(12, L * 2.5);
          const x = dx * u, y = dy * u, nx = -dy / L * wd * 0.45, ny = dx / L * wd * 0.45;
          g.moveTo(x + nx, y + ny); g.lineTo(x - nx, y - ny);
        }
        g.stroke();
      }
      g.save(); g.rotate(a);
      // speed lines ahead of a fast punch
      if (sp > 10) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.03; g.beginPath(); for (let k = -1; k <= 1; k++) { g.moveTo(0.35 * s, k * 0.14 * s); g.lineTo(0.35 * s - 0.4, k * 0.16 * s); } g.stroke(); }
      fistShape(g, 0.3 * s, dark || skin, dark ? '#7c4dff' : 'rgba(80,40,30,0.45)');
      if (s >= 3) { g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 0.06; g.beginPath(); g.arc(-0.1 * s, -0.25 * s, 0.25 * s, 3.4, 4.6); g.stroke(); }
      g.restore();
      break;
    }
    case 'fireball': {
      if (s >= 3) {
        // Entei: a second sun
        const R = 0.55 * s;
        glowDisc(g, R * 1.9, '#ff6d00', 0.35);
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 16; k++) {
          const ang = (k / 16) * TAU + t * 1.2;
          const fl = 1.18 + 0.2 * Math.sin(t * 11 + k * 1.7);
          g.fillStyle = k % 2 ? 'rgba(255,171,0,0.7)' : 'rgba(255,61,0,0.65)';
          g.beginPath(); g.moveTo(Math.cos(ang - 0.18) * R * 0.92, Math.sin(ang - 0.18) * R * 0.92); g.lineTo(Math.cos(ang) * R * fl, Math.sin(ang) * R * fl); g.lineTo(Math.cos(ang + 0.18) * R * 0.92, Math.sin(ang + 0.18) * R * 0.92); g.fill();
        }
        g.restore();
        const gr = g.createRadialGradient(-R * 0.25, -R * 0.25, R * 0.1, 0, 0, R);
        gr.addColorStop(0, '#fff8e1'); gr.addColorStop(0.35, '#ffd54f'); gr.addColorStop(0.75, '#ff9100'); gr.addColorStop(1, '#e65100');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
        break;
      }
      tail(g, a, 0.9 * s + sp * 0.03, 0.5 * s, 'rgba(255,152,0,0.75)', 'rgba(255,87,34,0)');
      for (let k = 0; k < 3; k++) {
        g.fillStyle = ['rgba(255,87,34,0.6)', 'rgba(255,152,0,0.85)', 'rgba(255,241,118,0.95)'][k];
        g.beginPath(); g.ellipse(-Math.cos(a) * 0.1 * (2 - k), -Math.sin(a) * 0.1 * (2 - k), (0.36 - k * 0.09) * s * (1 + 0.08 * Math.sin(t * 30 + k)), (0.3 - k * 0.07) * s, a, 0, TAU); g.fill();
      }
      break;
    }
    case 'firefist': {
      g.save(); g.rotate(a);
      // flame body streaming back
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 4; k++) {
        const L = (1.3 - k * 0.22) * s, W = (0.62 - k * 0.12) * s;
        g.fillStyle = ['rgba(255,61,0,0.45)', 'rgba(255,109,0,0.6)', 'rgba(255,171,0,0.75)', 'rgba(255,241,118,0.9)'][k];
        g.beginPath(); g.moveTo(W * 0.7, 0);
        g.quadraticCurveTo(W * 0.6, -W, -L * 0.4, -W * (0.7 + 0.1 * Math.sin(t * 25 + k)));
        g.quadraticCurveTo(-L * 0.7, -W * 0.3, -L, Math.sin(t * 20 + k) * W * 0.2);
        g.quadraticCurveTo(-L * 0.7, W * 0.3, -L * 0.4, W * (0.7 + 0.1 * Math.cos(t * 25 + k)));
        g.quadraticCurveTo(W * 0.6, W, W * 0.7, 0); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha *= 0.75;
      fistShape(g, 0.24 * s, '#ff7043', 'rgba(120,20,0,0.6)');
      g.restore();
      break;
    }
    case 'magmafist': {
      g.save(); g.rotate(a);
      tail(g, 0, 0.9 * s, 0.7 * s, 'rgba(62,39,35,0.8)', 'rgba(62,39,35,0)');
      glowDisc(g, 0.6 * s, '#ff6f00', 0.35);
      fistShape(g, 0.34 * s, '#4e342e', 'rgba(0,0,0,0.4)');
      // glowing cracks
      g.strokeStyle = '#ffab40'; g.lineWidth = 0.035 * s; g.lineCap = 'round';
      g.beginPath();
      for (let k = 0; k < 5; k++) { const x0 = (Math.sin(k * 3.1) * 0.25) * s, y0 = (Math.cos(k * 2.3) * 0.25) * s; g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(k * 1.9) * 0.18 * s, y0 + Math.sin(k * 1.9) * 0.18 * s); }
      g.stroke();
      g.fillStyle = '#ff9100';
      for (let k = 0; k < 3; k++) { const ph = (t * 3 + k / 3) % 1; g.globalAlpha = 1 - ph; g.beginPath(); g.arc(-0.2 * s - ph * 0.6, (k - 1) * 0.2 * s + ph * 0.3, 0.06 * s, 0, TAU); g.fill(); }
      g.restore();
      break;
    }
    case 'iceshard': {
      g.rotate(a);
      tail(g, 0, 0.5 * s + sp * 0.02, 0.2 * s, rgbaOf(p.color || '#b3e5fc', 0.5));
      g.fillStyle = p.color || '#b3e5fc'; g.strokeStyle = p.color && p.color !== '#b3e5fc' ? OUT : '#e1f5fe'; g.lineWidth = 0.035;
      g.beginPath(); g.moveTo(0.5 * s, 0); g.lineTo(-0.25 * s, -0.15 * s); g.lineTo(-0.45 * s, 0); g.lineTo(-0.25 * s, 0.15 * s); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath(); g.moveTo(0.45 * s, -0.01); g.lineTo(-0.2 * s, -0.11 * s); g.lineTo(-0.1 * s, 0); g.closePath(); g.fill();
      break;
    }
    case 'bird': {
      g.rotate(a);
      const col = p.color || '#b3e5fc';
      const flap = Math.sin(t * 20);
      glowDisc(g, 0.7 * s, col, 0.3);
      tail(g, 0, 1.1 * s, 0.5 * s, rgbaOf(col, 0.55));
      g.fillStyle = col; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.03;
      // wings
      for (const sy of [-1, 1]) {
        g.beginPath(); g.moveTo(0.1 * s, 0);
        g.quadraticCurveTo(-0.15 * s, sy * (0.55 + 0.2 * flap * sy) * s, -0.55 * s, sy * (0.6 + 0.25 * flap * sy) * s);
        g.quadraticCurveTo(-0.3 * s, sy * 0.25 * s, -0.25 * s, 0); g.closePath(); g.fill(); g.stroke();
      }
      // body and beak
      g.beginPath(); g.ellipse(0, 0, 0.35 * s, 0.14 * s, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(0.35 * s, -0.06 * s); g.lineTo(0.6 * s, 0); g.lineTo(0.35 * s, 0.06 * s); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0.22 * s, -0.04 * s, 0.03 * s, 0, TAU); g.fill();
      break;
    }
    case 'airslash': {
      g.rotate(a);
      const col = p.color || '#e3f2fd';
      g.lineCap = 'round';
      // faint wake lines
      g.strokeStyle = rgbaOf(col, 0.4); g.lineWidth = 0.03;
      g.beginPath(); for (let k = -1; k <= 1; k++) { g.moveTo(-0.3 * s, k * 0.3 * s); g.lineTo(-1.1 * s, k * 0.35 * s); } g.stroke();
      // crescent blade
      const R = 0.7 * s;
      const gr = g.createLinearGradient(0, -R, 0, R);
      gr.addColorStop(0, rgbaOf(col, 0)); gr.addColorStop(0.5, rgbaOf(col, 0.95)); gr.addColorStop(1, rgbaOf(col, 0));
      g.fillStyle = gr;
      g.beginPath(); g.arc(-0.45 * s, 0, R, -1.15, 1.15); g.arc(-0.62 * s, 0, R * 0.9, 1.05, -1.05, true); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 0.045 * s;
      g.beginPath(); g.arc(-0.45 * s, 0, R, -0.9, 0.9); g.stroke();
      break;
    }
    case 'bullet': {
      g.rotate(a);
      // tracer
      const L = Math.min(1.6, 0.3 + sp * 0.04);
      const gr = g.createLinearGradient(0, 0, -L, 0);
      gr.addColorStop(0, 'rgba(255,248,225,0.95)'); gr.addColorStop(0.3, 'rgba(255,213,79,0.6)'); gr.addColorStop(1, 'rgba(255,213,79,0)');
      g.fillStyle = gr; g.fillRect(-L, -0.03, L, 0.06);
      g.fillStyle = '#ffffff'; g.fillRect(-0.12, -0.012, 0.12, 0.024);
      g.fillStyle = '#546e7a'; g.beginPath(); g.arc(0, 0, 0.065, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(-0.015, -0.02, 0.02, 0, TAU); g.fill();
      break;
    }
    case 'cannonball': {
      tail(g, a, 0.8 * s, 0.35 * s, 'rgba(120,120,120,0.45)', 'rgba(120,120,120,0)');
      g.fillStyle = '#212121'; g.strokeStyle = OUT; g.lineWidth = 0.04;
      g.beginPath(); g.arc(0, 0, 0.22 * s, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#757575'; g.beginPath(); g.arc(-0.07 * s, -0.07 * s, 0.07 * s, 0, TAU); g.fill();
      break;
    }
    case 'bomb': {
      g.fillStyle = '#263238'; g.strokeStyle = OUT; g.lineWidth = 0.04;
      g.beginPath(); g.arc(0, 0, 0.25 * s, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#546e7a'; g.beginPath(); g.arc(-0.08 * s, -0.08 * s, 0.07 * s, 0, TAU); g.fill();
      g.strokeStyle = '#8d6e63'; g.lineWidth = 0.04; g.beginPath(); g.moveTo(0.1 * s, -0.2 * s); g.quadraticCurveTo(0.2 * s, -0.32 * s, 0.14 * s, -0.4 * s); g.stroke();
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = Math.sin(t * 30) > 0 ? '#ffeb3b' : '#ff7043';
      g.beginPath(); g.arc(0.14 * s, -0.42 * s, 0.07 + 0.03 * Math.sin(t * 40), 0, TAU); g.fill();
      g.restore();
      break;
    }
    case 'sandblade': {
      g.rotate(a);
      g.fillStyle = 'rgba(225,193,110,0.85)'; g.strokeStyle = 'rgba(141,110,99,0.7)'; g.lineWidth = 0.03;
      g.beginPath(); g.moveTo(0.5 * s, 0); g.quadraticCurveTo(0, -0.8 * s, -0.5 * s, -0.62 * s); g.quadraticCurveTo(-0.1, 0, -0.5 * s, 0.62 * s); g.quadraticCurveTo(0, 0.8 * s, 0.5 * s, 0); g.fill(); g.stroke();
      // grains shed behind
      g.fillStyle = '#d7b56d';
      for (let k = 0; k < 8; k++) { const ph = (t * 4 + k / 8) % 1; g.globalAlpha = 1 - ph; g.fillRect(-0.4 * s - ph * 0.9, (Math.sin(k * 7.3) * 0.6) * s, 0.05, 0.05); }
      g.globalAlpha = 1;
      break;
    }
    case 'smokefist': {
      for (let k = 0; k < 5; k++) {
        const r = (0.5 - k * 0.07) * s;
        g.fillStyle = k ? `rgba(236,239,241,${0.85 - k * 0.14})` : 'rgba(255,255,255,0.95)';
        g.beginPath(); g.arc(-Math.cos(a) * k * 0.22 * s + Math.sin(t * 9 + k) * 0.03, -Math.sin(a) * k * 0.22 * s, r, 0, TAU); g.fill();
      }
      g.save(); g.rotate(a); g.globalAlpha *= 0.35; fistShape(g, 0.22 * s, '#cfd8dc', 'rgba(0,0,0,0.2)'); g.restore();
      break;
    }
    case 'smokesnake': {
      // White Snake: a winding body of smoke with a head
      g.rotate(a);
      for (let k = 7; k >= 0; k--) {
        const x = -k * 0.16 * s, y = Math.sin(t * 12 - k * 0.9) * 0.14 * s;
        g.fillStyle = `rgba(236,239,241,${0.95 - k * 0.09})`;
        g.beginPath(); g.arc(x, y, (0.26 - k * 0.018) * s, 0, TAU); g.fill();
      }
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(0.12 * s, 0, 0.26 * s, 0.2 * s, 0, 0, TAU); g.fill();
      g.fillStyle = '#546e7a'; g.beginPath(); g.arc(0.2 * s, -0.08 * s, 0.035 * s, 0, TAU); g.arc(0.2 * s, 0.08 * s, 0.035 * s, 0, TAU); g.fill();
      break;
    }
    case 'lightorb': {
      g.save(); g.rotate(a);
      const L = 1.4 * s + sp * 0.04;
      const gr = g.createLinearGradient(0, 0, -L, 0);
      gr.addColorStop(0, 'rgba(255,253,231,0.95)'); gr.addColorStop(1, 'rgba(255,245,157,0)');
      g.fillStyle = gr; g.fillRect(-L, -0.08 * s, L, 0.16 * s);
      g.restore();
      glowDisc(g, 0.45 * s, '#fff59d', 0.5);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 0.16 * s, 0, TAU); g.fill();
      break;
    }
    case 'darkorb': {
      g.fillStyle = 'rgba(49,27,146,0.55)'; g.beginPath(); g.arc(0, 0, 0.55 * s, 0, TAU); g.fill();
      g.strokeStyle = '#b388ff'; g.lineWidth = 0.035;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, 0, (0.4 + k * 0.06) * s, t * 6 + k * 2, t * 6 + k * 2 + 2); g.stroke(); }
      g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, 0.32 * s, 0, TAU); g.fill();
      break;
    }
    case 'thunder': {
      if (s >= 2) {
        // Sango: a dragon of lightning
        g.save(); g.rotate(a); g.globalCompositeOperation = 'lighter';
        const segs = 9;
        for (const [col, lw] of [['rgba(255,241,118,0.45)', 0.4 * s], ['#fff59d', 0.16 * s], ['#ffffff', 0.06 * s]]) {
          g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round';
          g.beginPath();
          for (let k = 0; k <= segs; k++) { const x = -k * 0.28 * s, y = Math.sin(t * 14 - k * 0.8) * 0.3 * s + (((k * 7 + Math.floor(t * 20)) % 5) - 2) * 0.03 * s; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
          g.stroke();
        }
        // head with horns
        g.fillStyle = '#fffde7'; g.beginPath(); g.ellipse(0.1 * s, 0, 0.32 * s, 0.22 * s, 0, 0, TAU); g.fill();
        g.strokeStyle = '#fff176'; g.lineWidth = 0.05 * s;
        g.beginPath(); g.moveTo(0, -0.15 * s); g.lineTo(-0.25 * s, -0.4 * s); g.moveTo(0, 0.15 * s); g.lineTo(-0.25 * s, 0.4 * s); g.stroke();
        g.fillStyle = '#ffab00'; g.beginPath(); g.arc(0.22 * s, -0.07 * s, 0.04 * s, 0, TAU); g.fill();
        g.restore();
        break;
      }
      glowDisc(g, 0.55 * s, '#fff176', 0.35);
      g.save(); g.globalCompositeOperation = 'lighter';
      g.strokeStyle = '#fff176'; g.lineWidth = 0.06;
      g.beginPath();
      for (let k = 0; k < 6; k++) { const aa = (k / 6) * TAU + Math.floor(t * 20) * 0.7; g.moveTo(0, 0); g.lineTo(Math.cos(aa) * 0.3 * s, Math.sin(aa) * 0.3 * s); g.lineTo(Math.cos(aa + 0.4) * 0.5 * s, Math.sin(aa + 0.4) * 0.5 * s); }
      g.stroke();
      g.restore();
      g.fillStyle = '#fffde7'; g.beginPath(); g.arc(0, 0, 0.2 * s, 0, TAU); g.fill();
      break;
    }
    case 'waterdrop': {
      tail(g, a, 0.5 * s + sp * 0.02, 0.2 * s, 'rgba(129,212,250,0.7)');
      g.save(); g.rotate(a);
      g.fillStyle = p.color || '#4fc3f7';
      g.beginPath(); g.moveTo(0.18 * s, 0); g.quadraticCurveTo(0, -0.14 * s, -0.16 * s, 0); g.quadraticCurveTo(0, 0.14 * s, 0.18 * s, 0); g.fill();
      g.fillStyle = '#e1f5fe'; g.beginPath(); g.arc(0.02, -0.04, 0.045 * s, 0, TAU); g.fill();
      g.restore();
      break;
    }
    case 'shockwave': {
      g.rotate(a);
      const col = p.color || '#e0f7fa';
      g.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        const ph = (t * 3 + k * 0.25) % 1;
        g.globalAlpha = (1 - k * 0.2) * (0.6 + 0.4 * Math.sin(ph * Math.PI));
        g.strokeStyle = k ? col : '#ffffff'; g.lineWidth = (0.12 - k * 0.02) * Math.max(1, s * 0.8);
        g.beginPath(); g.arc(-k * 0.22 * s, 0, (0.45 + k * 0.12) * s, -1.15, 1.15); g.stroke();
      }
      g.globalAlpha = 1;
      break;
    }
    case 'star': {
      tail(g, a, 0.5 * s, 0.18 * s, rgbaOf(p.color || '#ffeb3b', 0.55));
      g.fillStyle = p.color || '#ffeb3b'; g.strokeStyle = OUT; g.lineWidth = 0.03; g.rotate(t * 12);
      g.beginPath();
      for (let k = 0; k < 10; k++) { const rr = k % 2 ? 0.1 * s : 0.25 * s; g.lineTo(Math.cos(k * TAU / 10) * rr, Math.sin(k * TAU / 10) * rr); }
      g.closePath(); g.fill(); g.stroke();
      break;
    }
    case 'hydra': {
      // Doku Doku Hydra: a venom dragon's head on a dripping neck
      g.save(); g.rotate(a);
      g.strokeStyle = 'rgba(106,27,154,0.85)'; g.lineWidth = 0.34 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-1.2 * s, Math.sin(t * 8) * 0.2 * s); g.quadraticCurveTo(-0.6 * s, Math.cos(t * 8) * 0.25 * s, 0, 0); g.stroke();
      g.strokeStyle = 'rgba(171,71,188,0.8)'; g.lineWidth = 0.14 * s; g.stroke();
      g.fillStyle = '#7b1fa2'; g.strokeStyle = OUT; g.lineWidth = 0.035;
      g.beginPath(); g.moveTo(0.55 * s, -0.08 * s); g.quadraticCurveTo(0.2 * s, -0.4 * s, -0.2 * s, -0.25 * s); g.quadraticCurveTo(-0.25 * s, 0, -0.2 * s, 0.25 * s); g.quadraticCurveTo(0.2 * s, 0.4 * s, 0.55 * s, 0.08 * s); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#aed581'; g.beginPath(); g.arc(0.15 * s, -0.16 * s, 0.05 * s, 0, TAU); g.arc(0.15 * s, 0.16 * s, 0.05 * s, 0, TAU); g.fill();
      g.fillStyle = 'rgba(174,213,129,0.8)';
      for (let k = 0; k < 3; k++) { const ph = (t * 2 + k / 3) % 1; g.beginPath(); g.arc(0.3 * s - ph * 0.5, 0.2 * s + ph * 0.4, 0.04 * s, 0, TAU); g.fill(); }
      g.restore();
      break;
    }
    case 'poison': {
      g.fillStyle = 'rgba(123,31,162,0.8)'; g.beginPath(); g.arc(0, 0, 0.4 * s, 0, TAU); g.fill();
      g.fillStyle = 'rgba(174,213,129,0.8)'; g.beginPath(); g.arc(0.08, -0.08, 0.15 * s, 0, TAU); g.fill();
      break;
    }
    case 'string': {
      g.rotate(a); g.strokeStyle = p.color || '#f8bbd0'; g.lineWidth = 0.025;
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-1.4, k * 0.07); g.quadraticCurveTo(-0.6, k * 0.05 + Math.sin(t * 20 + k) * 0.03, 0.3, k * 0.015); g.stroke(); }
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0.42, 0); g.lineTo(0.28, -0.04); g.lineTo(0.28, 0.04); g.fill();
      break;
    }
    case 'paw': {
      // Nikyu Nikyu: a paw-shaped bubble of repelled air
      const wob = 1 + 0.05 * Math.sin(t * 14);
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.045;
      g.beginPath(); g.ellipse(0, 0.08 * s, 0.36 * s * wob, 0.32 * s / wob, 0, 0, TAU); g.fill(); g.stroke();
      for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse((k - 1) * 0.22 * s, -0.3 * s - (k === 1 ? 0.05 * s : 0), 0.1 * s, 0.12 * s, 0, 0, TAU); g.fill(); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(-0.14 * s, -0.02 * s, 0.06 * s, 0, TAU); g.fill();
      break;
    }
    case 'petal': {
      g.fillStyle = '#f48fb1';
      for (let k = 0; k < 5; k++) { g.save(); g.rotate(k * TAU / 5 + t * 5); g.beginPath(); g.ellipse(0.15, 0, 0.14, 0.07, 0, 0, TAU); g.fill(); g.restore(); }
      g.fillStyle = '#fff59d'; g.beginPath(); g.arc(0, 0, 0.05, 0, TAU); g.fill();
      break;
    }
    case 'ghost': {
      // Horo Horo: a little hollow with a curling tail
      const bob = Math.sin(t * 8) * 0.05;
      g.translate(0, bob);
      const col = p.color || '#e1bee7';
      glowDisc(g, 0.5 * s, col, 0.25);
      g.fillStyle = rgbaOf(col, 0.85); g.strokeStyle = 'rgba(123,31,162,0.6)'; g.lineWidth = 0.03;
      g.beginPath(); g.arc(0, -0.05 * s, 0.3 * s, Math.PI, 0);
      const dir = Math.cos(a) >= 0 ? -1 : 1;
      g.quadraticCurveTo(0.3 * s, 0.25 * s, dir * 0.15 * s + 0.1 * s, 0.3 * s);
      g.quadraticCurveTo(dir * 0.5 * s, 0.45 * s + Math.sin(t * 10) * 0.05, dir * 0.55 * s, 0.25 * s);
      g.quadraticCurveTo(-0.1 * s, 0.35 * s, -0.3 * s, -0.05 * s); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#4a148c';
      g.beginPath(); g.ellipse(-0.1 * s, -0.08 * s, 0.045 * s, 0.07 * s, 0, 0, TAU); g.ellipse(0.1 * s, -0.08 * s, 0.045 * s, 0.07 * s, 0, 0, TAU); g.fill();
      g.strokeStyle = '#4a148c'; g.lineWidth = 0.025; g.beginPath(); g.arc(0, 0.05 * s, 0.06 * s, 0.2, Math.PI - 0.2); g.stroke();
      break;
    }
    case 'bat': {
      // Kage Kage Brick Bat
      g.rotate(a);
      const flap = Math.sin(t * 28);
      g.fillStyle = '#1c1b22'; g.strokeStyle = '#000'; g.lineWidth = 0.02;
      for (const sy of [-1, 1]) {
        g.beginPath(); g.moveTo(0.05 * s, 0);
        g.quadraticCurveTo(-0.05 * s, sy * (0.35 + 0.2 * flap) * s, -0.3 * s, sy * (0.45 + 0.25 * flap) * s);
        g.lineTo(-0.2 * s, sy * 0.2 * s); g.lineTo(-0.3 * s, sy * 0.12 * s); g.lineTo(-0.12 * s, 0); g.closePath(); g.fill(); g.stroke();
      }
      g.beginPath(); g.ellipse(0.02 * s, 0, 0.16 * s, 0.1 * s, 0, 0, TAU); g.fill();
      g.fillStyle = '#ff1744'; g.beginPath(); g.arc(0.1 * s, -0.035 * s, 0.022 * s, 0, TAU); g.arc(0.1 * s, 0.035 * s, 0.022 * s, 0, TAU); g.fill();
      break;
    }
    case 'mochi': {
      g.save(); g.rotate(a);
      tail(g, 0, 0.8 * s, 0.6 * s, 'rgba(255,248,225,0.6)');
      g.fillStyle = '#fff8e1'; g.strokeStyle = '#bcaaa4'; g.lineWidth = 0.04;
      g.beginPath(); g.ellipse(0, 0, 0.42 * s, 0.34 * s, 0, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = '#d7ccc8'; g.lineWidth = 0.03;
      g.beginPath(); for (let k = -1; k <= 1; k++) { g.moveTo(0.18 * s, k * 0.13 * s); g.lineTo(0.36 * s, k * 0.12 * s); } g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-0.1 * s, -0.14 * s, 0.14 * s, 0.07 * s, -0.3, 0, TAU); g.fill();
      g.restore();
      break;
    }
    case 'barafist': {
      // Bara Bara Ho: a detached fist, cut clean at the wrist
      g.save(); g.rotate(a);
      tail(g, 0, 0.6 * s, 0.3 * s, 'rgba(255,255,255,0.5)');
      g.fillStyle = '#90caf9'; g.fillRect(-0.42 * s, -0.12 * s, 0.22 * s, 0.24 * s);
      fistShape(g, 0.26 * s, p.color && p.color !== '#ffccbc' ? p.color : '#f1c9a0', 'rgba(80,40,30,0.45)');
      g.strokeStyle = '#ffffff'; g.lineWidth = 0.025; g.beginPath(); g.moveTo(-0.2 * s, -0.14 * s); g.lineTo(-0.2 * s, 0.14 * s); g.stroke();
      g.restore();
      break;
    }
    default: {
      const col = p.color || '#ffffff';
      tail(g, a, 0.5 * s + sp * 0.02, 0.4 * s, rgbaOf(col, 0.45));
      glowDisc(g, 0.42 * s, col, 0.3);
      g.fillStyle = col;
      g.beginPath(); g.arc(0, 0, 0.25 * s, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(-0.06 * s, -0.06 * s, 0.08 * s, 0, TAU); g.fill();
    }
  }
}
