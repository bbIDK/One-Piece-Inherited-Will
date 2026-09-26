// Visual effects: particles, damage numbers, slashes, rings, beams, lightning,
// telegraphs, screen shake, hit-stop and anime-style impact frames.
import { TAU } from '../core/math.js';

export class FX {
  constructor(game) {
    this.game = game;
    this.parts = [];
    this.texts = [];
    this.shapes = []; // rings, slashes, beams, bolts, telegraphs
    this.trauma = 0;
    this.hitstop = 0;
    this.impact = 0; // impact-frame flash timer
    this.impactColor = null;
    this.flash = 0;
    this.maxParts = 1600;
  }

  shake(amount) { this.trauma = Math.min(1.2, this.trauma + amount); }
  stop(t) { this.hitstop = Math.max(this.hitstop, t); }
  impactFrame(t = 0.08, color = null) { this.impact = Math.max(this.impact, t); this.impactColor = color; }

  particle(p) {
    if (this.parts.length > this.maxParts) this.parts.shift();
    p.life = p.life ?? 0.6;
    p.max = p.life;
    p.z = p.z ?? 0.5;
    p.vz = p.vz ?? 0;
    p.g = p.g ?? 0;
    p.drag = p.drag ?? 2;
    p.size = p.size ?? 0.12;
    p.grow = p.grow ?? 0;
    this.parts.push(p);
    return p;
  }

  burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.angle ?? Math.random() * TAU) + (o.spread !== undefined ? (Math.random() - 0.5) * o.spread : 0);
      const sp = (o.speed ?? 4) * (0.4 + Math.random() * 0.8);
      this.particle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7,
        z: o.z ?? 0.6, vz: o.vz !== undefined ? o.vz * (0.5 + Math.random()) : Math.random() * 3,
        g: o.g ?? 9, life: (o.life ?? 0.5) * (0.6 + Math.random() * 0.8), size: (o.size ?? 0.1) * (0.6 + Math.random() * 0.8),
        color: Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color || '#fff',
        kind: o.kind || 'spark', drag: o.drag ?? 3, grow: o.grow ?? 0,
      });
    }
  }

  text(x, y, str, color = '#fff', size = 0.42, o = {}) {
    this.texts.push({ x: x + (Math.random() - 0.5) * 0.4, y, z: 1.6, str, color, size, life: o.life ?? 0.9, max: o.life ?? 0.9, vz: 2.6, crit: o.crit });
  }

  ring(x, y, r0, r1, color, life = 0.4, width = 0.15) { this.shapes.push({ type: 'ring', x, y, r0, r1, color, life, max: life, width }); }
  slash(x, y, angle, radius, arc, color = '#fff', life = 0.18, width = 0.25) { this.shapes.push({ type: 'slash', x, y, angle, radius, arc, color, life, max: life, width }); }
  beam(x, y, angle, length, width, color, life = 0.25, core = '#fff') { this.shapes.push({ type: 'beam', x, y, angle, length, width, color, core, life, max: life }); }
  bolt(x0, y0, x1, y1, color = '#fff176', life = 0.2, width = 0.08) { this.shapes.push({ type: 'bolt', x0, y0, x1, y1, color, life, max: life, width, seed: Math.random() * 1000 }); }
  telegraph(x, y, shape, o) { const s = { type: 'tele', x, y, shape, ...o, life: o.life, max: o.life }; this.shapes.push(s); return s; }
  crack(x, y, r, life = 2) { this.shapes.push({ type: 'crack', x, y, r, life, max: life, seed: Math.random() * 100 }); }
  decal(x, y, r, color, life = 3) { this.shapes.push({ type: 'decal', x, y, r, color, life, max: life }); }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.impact = Math.max(0, this.impact - dt);
    this.flash = Math.max(0, this.flash - dt);
    const w = this.game.world;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x = w.wx(p.x + p.vx * dt);
      p.y += p.vy * dt;
      p.vz -= p.g * dt;
      p.z += p.vz * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      p.size += p.grow * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.vz -= 5 * dt;
      t.z += Math.max(t.vz, 0.2) * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      s.life -= dt;
      if (s.follow && s.follow.alive) { s.x = s.follow.x; s.y = s.follow.y; }
      if (s.life <= 0) this.shapes.splice(i, 1);
    }
  }

  /** Ground-level shapes (drawn before entities). */
  drawGround(g, r) {
    const w = this.game.world;
    for (const s of this.shapes) {
      if (s.type !== 'tele' && s.type !== 'crack' && s.type !== 'decal') continue;
      const [sx, sy] = r.toScreen(w, s.x, s.y);
      const z = r.cam.zoom;
      g.setTransform(r.dpr * z, 0, 0, r.dpr * z, sx * r.dpr, sy * r.dpr);
      const k = 1 - s.life / s.max;
      if (s.type === 'tele') {
        g.globalAlpha = 0.25 + 0.35 * k;
        g.fillStyle = s.color || 'rgba(255,40,40,1)';
        g.strokeStyle = s.color || '#ff3b3b';
        g.lineWidth = 0.06;
        if (s.shape === 'circle') {
          g.beginPath(); g.arc(0, 0, s.r, 0, TAU); g.globalAlpha *= 0.5; g.fill(); g.globalAlpha = 0.8; g.stroke();
          g.beginPath(); g.arc(0, 0, s.r * k, 0, TAU); g.globalAlpha = 0.35; g.fill();
        } else if (s.shape === 'arc') {
          g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s.r, s.angle - s.arc / 2, s.angle + s.arc / 2); g.closePath(); g.globalAlpha *= 0.6; g.fill(); g.globalAlpha = 0.8; g.stroke();
        } else if (s.shape === 'line') {
          g.save(); g.rotate(s.angle); g.globalAlpha *= 0.6; g.fillRect(0, -s.width / 2, s.length, s.width); g.globalAlpha = 0.8; g.strokeRect(0, -s.width / 2, s.length, s.width);
          g.globalAlpha = 0.4; g.fillRect(0, -s.width / 2, s.length * k, s.width); g.restore();
        }
        g.globalAlpha = 1;
      } else if (s.type === 'crack') {
        g.globalAlpha = Math.min(1, s.life / s.max * 2);
        g.strokeStyle = 'rgba(40,30,20,0.8)'; g.lineWidth = 0.07;
        for (let k2 = 0; k2 < 7; k2++) {
          const a = (k2 / 7) * TAU + s.seed;
          g.beginPath(); g.moveTo(0, 0);
          let px = 0, py = 0;
          for (let j = 1; j <= 4; j++) { const rr = (s.r * j) / 4; px = Math.cos(a + Math.sin(j * 3 + s.seed) * 0.3) * rr; py = Math.sin(a + Math.sin(j * 3 + s.seed) * 0.3) * rr * 0.7; g.lineTo(px, py); }
          g.stroke();
        }
        g.globalAlpha = 1;
      } else if (s.type === 'decal') {
        g.globalAlpha = Math.min(1, s.life / s.max * 2) * 0.6;
        g.fillStyle = s.color; g.beginPath(); g.ellipse(0, 0, s.r, s.r * 0.6, 0, 0, TAU); g.fill();
        g.globalAlpha = 1;
      }
    }
  }

  /** Air-level effects (after entities). */
  draw(g, r) {
    const w = this.game.world;
    const z = r.cam.zoom;
    const dpr = r.dpr;
    for (const s of this.shapes) {
      if (s.type === 'tele' || s.type === 'crack' || s.type === 'decal') continue;
      const k = 1 - s.life / s.max;
      if (s.type === 'bolt') {
        const [ax, ay] = r.toScreen(w, s.x0, s.y0);
        g.setTransform(dpr * z, 0, 0, dpr * z, ax * dpr, ay * dpr);
        const dx = w.dx(s.x0, s.x1), dy = s.y1 - s.y0;
        const n = Math.max(4, Math.ceil(Math.hypot(dx, dy) * 2));
        g.globalAlpha = s.life / s.max;
        for (const [col, lw] of [[s.color, s.width * 3], ['#ffffff', s.width]]) {
          g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round';
          g.beginPath(); g.moveTo(0, -0.8);
          for (let i = 1; i <= n; i++) {
            const t = i / n;
            const jit = i === n ? 0 : Math.sin(s.seed + i * 12.9898 + Math.floor(k * 12)) * 0.35;
            g.lineTo(dx * t + jit * (dy / (Math.hypot(dx, dy) || 1)), dy * t - 0.8 - jit * (dx / (Math.hypot(dx, dy) || 1)));
          }
          g.stroke();
        }
        g.globalAlpha = 1;
        continue;
      }
      const [sx, sy] = r.toScreen(w, s.x, s.y);
      g.setTransform(dpr * z, 0, 0, dpr * z, sx * dpr, sy * dpr);
      if (s.type === 'ring') {
        const rad = s.r0 + (s.r1 - s.r0) * (1 - Math.pow(1 - k, 2));
        g.globalAlpha = 1 - k;
        g.strokeStyle = s.color; g.lineWidth = s.width * (1 - k * 0.6);
        g.beginPath(); g.ellipse(0, -0.4, rad, rad * 0.62, 0, 0, TAU); g.stroke();
        g.globalAlpha = 1;
      } else if (s.type === 'slash') {
        g.globalAlpha = 1 - k * k;
        g.translate(0, -0.6);
        const a0 = s.angle - s.arc / 2, a1 = s.angle - s.arc / 2 + s.arc * Math.min(1, k * 2.5);
        g.strokeStyle = s.color; g.lineWidth = s.width * (1 - k); g.lineCap = 'round';
        g.beginPath(); g.ellipse(0, 0, s.radius, s.radius * 0.75, 0, a0, a1); g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = s.width * 0.35 * (1 - k);
        g.beginPath(); g.ellipse(0, 0, s.radius, s.radius * 0.75, 0, a0, a1); g.stroke();
        g.globalAlpha = 1;
      } else if (s.type === 'beam') {
        g.globalAlpha = Math.min(1, s.life / s.max * 1.5);
        g.translate(0, -0.7);
        g.rotate(s.angle);
        const wdt = s.width * (0.7 + 0.3 * Math.sin(k * 40));
        g.fillStyle = s.color; g.beginPath(); g.roundRect(0, -wdt / 2, s.length, wdt, wdt / 2); g.fill();
        g.fillStyle = s.core; g.beginPath(); g.roundRect(0, -wdt / 5, s.length, wdt / 2.5, wdt / 5); g.fill();
        g.globalAlpha = 1;
      }
    }
    // particles
    for (const p of this.parts) {
      const [sx, sy] = r.toScreen(w, p.x, p.y);
      if (sx < -50 || sy < -80 || sx > r.cw + 50 || sy > r.ch + 50) continue;
      const a = Math.min(1, p.life / p.max * 1.6);
      g.setTransform(dpr * z, 0, 0, dpr * z, sx * dpr, (sy - p.z * z) * dpr);
      g.globalAlpha = a;
      switch (p.kind) {
        case 'smoke':
          g.fillStyle = p.color; g.beginPath(); g.arc(0, 0, p.size, 0, TAU); g.fill(); break;
        case 'fire': {
          g.fillStyle = p.color; g.beginPath(); g.arc(0, 0, p.size * (0.5 + a * 0.5), 0, TAU); g.fill();
          break;
        }
        case 'petal':
        case 'leaf':
          g.fillStyle = p.color; g.rotate(p.life * 6); g.beginPath(); g.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU); g.fill(); break;
        case 'star':
          g.fillStyle = p.color; g.font = `${p.size * 3}px sans-serif`; g.textAlign = 'center'; g.fillText('✦', 0, 0); break;
        case 'bubble':
          g.strokeStyle = p.color; g.lineWidth = 0.03; g.beginPath(); g.arc(0, 0, p.size, 0, TAU); g.stroke(); break;
        case 'line':
          g.strokeStyle = p.color; g.lineWidth = p.size * 0.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(-p.vx * 0.05, -p.vy * 0.05 + p.vz * 0.05); g.stroke(); break;
        default:
          g.fillStyle = p.color; g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
    }
    g.globalAlpha = 1;
    // damage numbers
    for (const t of this.texts) {
      const [sx, sy] = r.toScreen(w, t.x, t.y);
      const a = Math.min(1, t.life / t.max * 2);
      const pop = 1 + Math.max(0, (t.max - t.life) < 0.1 ? (0.1 - (t.max - t.life)) * 5 : 0);
      g.setTransform(dpr, 0, 0, dpr, sx * dpr, (sy - t.z * z) * dpr);
      g.globalAlpha = a;
      const px = Math.round(t.size * Math.min(z, 44) * pop * (t.crit ? 1.35 : 1));
      g.font = `${px}px Bangers, Impact, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = Math.max(2, px * 0.16);
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(t.str, 0, 0);
      g.fillStyle = t.color;
      g.fillText(t.str, 0, 0);
    }
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Screen-space post effects (impact frames, flashes). */
  drawScreen(g, r) {
    if (this.impact > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'difference';
      g.fillStyle = this.impactColor || '#ffffff';
      g.fillRect(0, 0, r.canvas.width, r.canvas.height);
      g.globalCompositeOperation = 'source-over';
    }
    if (this.flash > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = `rgba(255,255,255,${this.flash * 2})`;
      g.fillRect(0, 0, r.canvas.width, r.canvas.height);
    }
  }
}
