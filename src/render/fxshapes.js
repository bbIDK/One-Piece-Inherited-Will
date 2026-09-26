// Drawers for effect shapes (see game/fx.js). Every drawer is called with the
// context translated to the shape's ground point and scaled to tile units
// (+y down); `z` lifts things off the ground. `k` is the shape's age (0..1),
// `a` an extra fade (persistent shapes fading out), `c` a small context
// { t: fx clock, rel(x, y) → local coords of a world point, fx }.
import { drawCharacter, starPath, rgba } from './character.js';

const TAU = Math.PI * 2;
const easeOut = (k) => 1 - (1 - k) ** 3;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Deterministic pseudo-random in [0, 1) from a seed. */
export function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

function ellipsePath(g, rx, ry) { g.beginPath(); g.ellipse(0, 0, Math.max(0.001, rx), Math.max(0.001, ry), 0, 0, TAU); }
function spiky(g, R, n, seed, sx = 1) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU;
    const rr = i % 2 ? R * (0.26 + 0.08 * hash(seed + i)) : R * (0.62 + 0.55 * hash(seed + i * 3.1));
    const x = Math.cos(a) * rr * sx, y = Math.sin(a) * rr;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath();
}
function jagged(g, x0, y0, x1, y1, seed, amp, n) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  g.moveTo(x0, y0);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const j = (hash(seed + i * 7.3) - 0.5) * 2 * amp * Math.sin(t * Math.PI);
    g.lineTo(x0 + dx * t + nx * j, y0 + dy * t + ny * j);
  }
  g.lineTo(x1, y1);
}

// ------------------------------------------------------------------ core shapes
export const SHAPES = {};

/** Enemy wind-up telegraphs (hit areas, true shapes on the ground). */
SHAPES.tele = {
  ground(g, s, k, a, c) {
    const col = s.color || 'rgba(255,60,60,1)';
    const pulse = 0.5 + 0.5 * Math.sin(c.t * 22);
    g.fillStyle = col; g.strokeStyle = col; g.lineJoin = 'round';
    if (s.shape === 'circle') {
      g.globalAlpha = a * (0.1 + 0.12 * k); g.beginPath(); g.arc(0, 0, s.r, 0, TAU); g.fill();
      g.globalAlpha = a * (0.3 + 0.35 * k); g.beginPath(); g.arc(0, 0, s.r * easeOut(k), 0, TAU); g.fill();
      g.globalAlpha = a * (0.55 + 0.4 * pulse * k); g.lineWidth = 0.05 + 0.04 * k; g.beginPath(); g.arc(0, 0, s.r, 0, TAU); g.stroke();
    } else if (s.shape === 'arc') {
      const a0 = s.angle - s.arc / 2, a1 = s.angle + s.arc / 2;
      g.globalAlpha = a * (0.1 + 0.12 * k); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s.r, a0, a1); g.closePath(); g.fill();
      g.globalAlpha = a * (0.3 + 0.35 * k); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s.r * easeOut(k), a0, a1); g.closePath(); g.fill();
      g.globalAlpha = a * (0.55 + 0.4 * pulse * k); g.lineWidth = 0.05 + 0.04 * k; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s.r, a0, a1); g.closePath(); g.stroke();
    } else if (s.shape === 'line') {
      g.rotate(s.angle);
      g.globalAlpha = a * (0.1 + 0.12 * k); g.fillRect(0, -s.width / 2, s.length, s.width);
      g.globalAlpha = a * (0.3 + 0.35 * k); g.fillRect(0, -s.width / 2, s.length * easeOut(k), s.width);
      g.globalAlpha = a * (0.55 + 0.4 * pulse * k); g.lineWidth = 0.05 + 0.04 * k; g.strokeRect(0, -s.width / 2, s.length, s.width);
      // chevrons pointing the way
      g.globalAlpha = a * 0.5; g.lineWidth = 0.05;
      const n = Math.max(1, Math.floor(s.length / 1.5));
      for (let i = 0; i < n; i++) {
        const x = ((i + (c.t * 2) % 1) / n) * s.length;
        g.beginPath(); g.moveTo(x - 0.2, -s.width * 0.25); g.lineTo(x, 0); g.lineTo(x - 0.2, s.width * 0.25); g.stroke();
      }
    }
  },
};

/** Ground cracks radiating from a point. */
SHAPES.crack = {
  ground(g, s, k, a) {
    const alpha = Math.min(1, (1 - k) * 2.5) * a;
    const n = s.n || 8;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [col, lw] of [['rgba(255,255,255,0.18)', 0.12], ['rgba(35,25,18,0.85)', 0.065]]) {
      g.globalAlpha = alpha; g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + s.seed + (hash(s.seed + i) - 0.5) * 0.5;
        let px = 0, py = 0;
        g.moveTo(0, 0);
        const len = s.r * (0.6 + 0.5 * hash(s.seed * 3 + i));
        for (let j = 1; j <= 4; j++) {
          const rr = (len * j) / 4;
          const off = (hash(s.seed + i * 13 + j) - 0.5) * 0.6;
          px = Math.cos(ang + off) * rr; py = Math.sin(ang + off) * rr * 0.7;
          g.lineTo(px, py);
          if (j === 2 && hash(s.seed + i * 5) > 0.45) {
            const b = ang + (hash(s.seed + i * 9) > 0.5 ? 0.7 : -0.7);
            g.moveTo(px, py); g.lineTo(px + Math.cos(b) * len * 0.3, py + Math.sin(b) * len * 0.21); g.moveTo(px, py);
          }
        }
      }
      g.stroke();
    }
  },
};

SHAPES.decal = {
  ground(g, s, k, a) {
    g.globalAlpha = Math.min(1, (1 - k) * 2) * 0.6 * a;
    g.fillStyle = s.color; ellipsePath(g, s.r, s.r * 0.6); g.fill();
  },
};

/** Burn mark with a glowing rim that cools down. */
SHAPES.scorch = {
  ground(g, s, k, a) {
    const alpha = Math.min(1, (1 - k) * 2) * a;
    g.globalAlpha = alpha * 0.7; g.fillStyle = s.color || 'rgba(30,18,12,1)';
    ellipsePath(g, s.r, s.r * 0.6); g.fill();
    const hot = clamp01(1 - k * 2.5);
    if (hot > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = alpha * hot * 0.8; g.strokeStyle = s.rim || '#ff6f00'; g.lineWidth = 0.06;
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const a0 = (i / 9) * TAU + s.seed, a1 = a0 + 0.35;
        g.moveTo(Math.cos(a0) * s.r * 0.85, Math.sin(a0) * s.r * 0.51); g.lineTo(Math.cos(a1) * s.r * 0.95, Math.sin(a1) * s.r * 0.57);
      }
      g.stroke();
    }
  },
};

/** Knockback skid marks: two scuffed streaks along the slide. */
SHAPES.skid = {
  ground(g, s, k, a) {
    g.rotate(s.angle);
    g.globalAlpha = (1 - k) * 0.55 * a; g.strokeStyle = s.color || 'rgba(60,45,30,1)'; g.lineCap = 'round';
    for (const off of [-0.13, 0.13]) {
      g.lineWidth = 0.07;
      g.beginPath(); g.moveTo(0, off); g.lineTo(-s.length, off * 1.4); g.stroke();
    }
  },
};

/** Afterimage: a flat-tinted copy of a character pose. */
SHAPES.ghost = {
  ground(g, s, k, a) {
    g.globalAlpha = (s.alpha ?? 0.5) * (1 - k) * a;
    if (s.add) g.globalCompositeOperation = 'lighter';
    try { drawCharacter(g, s.look, { ...s.pose, P: s.pose.P, anim: null, blend: null, noShadow: true, noTrails: true, ghost: true, armed: false, charge: null, flurry: null, aura: null, alpha: undefined }); } catch { /* snapshot of an odd pose */ }
  },
};

/** Expanding ring (existing API: r0 → r1, width, colour). */
SHAPES.ring = {
  air(g, s, k, a, c) {
    const e = s.ease === 'lin' ? k : 1 - (1 - k) * (1 - k);
    const rad = s.r0 + (s.r1 - s.r0) * e;
    const ry = s.flat ?? 0.62;
    g.translate(0, -(s.z ?? 0.4));
    const alpha = (1 - k) * a;
    if (s.add) g.globalCompositeOperation = 'lighter';
    if (s.fill) { g.globalAlpha = alpha * 0.22; g.fillStyle = s.fill === true ? s.color : s.fill; ellipsePath(g, rad, rad * ry); g.fill(); }
    const path = () => {
      if (s.wobble) {
        g.beginPath();
        const n = 48;
        for (let i = 0; i <= n; i++) {
          const th = (i / n) * TAU;
          const wr = rad * (1 + s.wobble * (1 - k) * Math.sin(th * (s.lobes || 9) + c.t * 40));
          const x = Math.cos(th) * wr, y = Math.sin(th) * wr * ry;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
      } else ellipsePath(g, rad, rad * ry);
    };
    g.globalAlpha = alpha; g.strokeStyle = s.color; g.lineWidth = s.width * (1 - k * 0.6);
    path(); g.stroke();
    if (!s.noCore) { g.globalAlpha = alpha * 0.7; g.strokeStyle = '#ffffff'; g.lineWidth = s.width * 0.3 * (1 - k); path(); g.stroke(); }
  },
};

/**
 * Weapon/limb smear across the facing: the head sweeps from one side to the
 * other, the tail chases it, alpha falls off from a white head to nothing.
 */
function crescent(g, s, k, a) {
  const dir = s.dir || 1;
  const arc = s.arc || 1.6;
  const a0 = s.angle - dir * arc / 2;
  const reveal = s.reveal ?? 0.28;
  const headK = reveal > 0 ? Math.min(1, k / reveal) : 1;
  const tailK = clamp01((k - reveal * 0.6) / (1 - reveal * 0.6));
  const head = a0 + dir * arc * easeOut(headK);
  const tail = a0 + dir * arc * tailK * tailK;
  if (Math.abs(head - tail) < 0.02) return;
  g.translate(0, -(s.z ?? 0.6));
  g.scale(1, s.tilt ?? 0.72);
  const R = s.radius, W = s.width || 0.2;
  const N = 20;
  const outer = [], inner = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N; // 0 tail → 1 head
    const th = tail + (head - tail) * u;
    const w = W * Math.pow(u, 0.7) * (1 - 0.35 * Math.pow(u, 10));
    outer.push([Math.cos(th) * R, Math.sin(th) * R]);
    inner.push([Math.cos(th) * (R - w), Math.sin(th) * (R - w)]);
  }
  const fade = (1 - Math.pow(k, 2.2)) * a;
  if (s.add !== false) g.globalCompositeOperation = 'lighter';
  const gr = g.createLinearGradient(outer[0][0], outer[0][1], outer[N][0], outer[N][1]);
  gr.addColorStop(0, rgba(s.color, 0));
  gr.addColorStop(0.55, rgba(s.color, 0.55 * fade));
  gr.addColorStop(0.92, rgba(s.color, 0.95 * fade));
  gr.addColorStop(1, rgba(s.core || '#ffffff', fade));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i <= N; i++) g.lineTo(outer[i][0], outer[i][1]);
  for (let i = N; i >= 0; i--) g.lineTo(inner[i][0], inner[i][1]);
  g.closePath(); g.fill();
  // hot leading edge
  g.strokeStyle = s.core || '#ffffff'; g.lineCap = 'round';
  for (let i = Math.floor(N * 0.45); i < N; i++) {
    const u = i / N;
    g.globalAlpha = fade * u * u;
    g.lineWidth = Math.max(0.012, W * 0.22 * u);
    g.beginPath(); g.moveTo(outer[i][0], outer[i][1]); g.lineTo(outer[i + 1][0], outer[i + 1][1]); g.stroke();
  }
}
SHAPES.crescent = { air: crescent };
// the old `slash` shape (x, y, angle, radius, arc, colour, life, width) is a crescent
SHAPES.slash = { air(g, s, k, a) { crescent(g, { ...s, z: s.z ?? 0.6, width: s.width || 0.22, dir: s.dir || 1 }, k, a); } };

/** Hit star: a spiky burst with a white core and a few speed lines. */
SHAPES.impact = {
  air(g, s, k, a) {
    const grow = k < 0.25 ? easeOut(k / 0.25) : 1;
    const fade = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7;
    const R = s.size * (0.45 + 0.75 * grow);
    g.translate(0, -(s.z ?? 0.7));
    g.rotate(s.angle || 0);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a * fade * 0.9;
    g.fillStyle = s.color || '#ffffff';
    spiky(g, R, s.spikes || 9, s.seed, 1.3); g.fill();
    g.globalAlpha = a * fade;
    g.fillStyle = s.core || '#ffffff';
    spiky(g, R * 0.52, s.spikes || 9, s.seed + 5, 1.2); g.fill();
    g.strokeStyle = s.color || '#ffffff'; g.lineWidth = 0.035; g.lineCap = 'round';
    g.globalAlpha = a * fade * 0.85;
    g.beginPath();
    const n = s.lines ?? 5;
    for (let i = 0; i < n; i++) {
      const th = (hash(s.seed + i * 17) - 0.5) * 2.2;
      const r0 = R * (0.9 + 0.5 * k), r1 = R * (1.5 + 0.9 * hash(s.seed + i) + k * 0.8);
      g.moveTo(Math.cos(th) * r0, Math.sin(th) * r0 * 0.8); g.lineTo(Math.cos(th) * r1, Math.sin(th) * r1 * 0.8);
    }
    g.stroke();
  },
};

/** Four-point glint (crits, parries, muzzle flashes, light). */
SHAPES.flare = {
  air(g, s, k, a) {
    const grow = k < 0.2 ? easeOut(k / 0.2) : 1;
    const fade = 1 - k;
    const R = s.size * (0.4 + 0.6 * grow);
    g.translate(0, -(s.z ?? 0.7));
    g.rotate(s.rot ?? 0.2 + k * 0.6);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a * fade * 0.4; g.fillStyle = s.color || '#fff59d';
    g.beginPath(); g.arc(0, 0, R * 0.55, 0, TAU); g.fill();
    g.globalAlpha = a * fade * 0.95;
    starPath(g, 0, 0, R, 4, 0.12, 0); g.fill();
    g.fillStyle = '#ffffff'; starPath(g, 0, 0, R * 0.6, 4, 0.14, Math.PI / 4); g.fill();
  },
};

/** Beams: energy, lightning, fire, light, ice, sand, quake, string, poison, gravity, dark, wind. */
SHAPES.beam = {
  air(g, s, k, a, c) {
    const fade = Math.min(1, (1 - k) * 1.6) * a;
    g.translate(0, -(s.z ?? 0.7));
    g.rotate(s.angle);
    const ext = easeOut(Math.min(1, k * 6));
    const L = s.length * ext;
    const style = s.style || 'energy';
    const flick = 0.78 + 0.22 * Math.sin(c.t * 55 + s.seed);
    const wd = s.width * flick * (1 - k * 0.45);
    const col = s.color || '#ffffff';
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (style === 'lightning') {
      g.globalCompositeOperation = 'lighter';
      const seed = s.seed + Math.floor(c.t * 25);
      for (let i = 0; i < 3; i++) {
        for (const [cc, lw, al] of [[col, wd * 0.9, 0.35], [col, wd * 0.35, 0.9], ['#ffffff', wd * 0.14, 1]]) {
          g.globalAlpha = fade * al; g.strokeStyle = cc; g.lineWidth = Math.max(0.02, lw * (i ? 0.6 : 1));
          g.beginPath(); jagged(g, 0, (i - 1) * wd * 0.15, L, (i - 1) * wd * 0.1, seed + i * 31, wd * (0.5 + i * 0.3), Math.max(4, Math.round(L * 2.2))); g.stroke();
        }
      }
      return;
    }
    if (style === 'string') {
      g.globalAlpha = fade; g.strokeStyle = col; g.lineWidth = 0.022;
      const n = 5;
      g.beginPath();
      for (let i = 0; i < n; i++) { const y = (i / (n - 1) - 0.5) * wd; g.moveTo(0, y * 0.3); g.lineTo(L, y); }
      g.stroke();
      g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#ffffff'; g.lineWidth = 0.01; g.stroke();
      return;
    }
    const add = style !== 'dark' && style !== 'sand' && style !== 'mochi';
    if (add) g.globalCompositeOperation = 'lighter';
    // outer glow
    g.globalAlpha = fade * 0.3; g.fillStyle = col;
    g.beginPath(); g.roundRect(-wd * 0.3, -wd * 0.85, L + wd * 0.6, wd * 1.7, wd * 0.85); g.fill();
    // body
    g.globalAlpha = fade * 0.85;
    if (style === 'fire') {
      const gr = g.createLinearGradient(0, 0, L, 0);
      gr.addColorStop(0, '#ffeb3b'); gr.addColorStop(0.3, '#ff9800'); gr.addColorStop(1, rgba('#ff3d00', 0.7));
      g.fillStyle = gr;
    } else if (style === 'dark') g.fillStyle = '#12001c';
    else g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, -wd / 2);
    const segs = Math.max(4, Math.round(L * 3));
    for (let i = 1; i <= segs; i++) {
      const x = (i / segs) * L;
      const ripple = style === 'fire' || style === 'wind' || style === 'water' ? Math.sin(x * 4 - c.t * 30 + s.seed) * wd * 0.18 : style === 'sand' ? (hash(s.seed + i + Math.floor(c.t * 20)) - 0.5) * wd * 0.3 : 0;
      g.lineTo(x, -wd / 2 - ripple);
    }
    g.lineTo(L + wd * 0.3, 0);
    for (let i = segs; i >= 1; i--) {
      const x = (i / segs) * L;
      const ripple = style === 'fire' || style === 'wind' || style === 'water' ? Math.sin(x * 4 + c.t * 30 + s.seed) * wd * 0.18 : style === 'sand' ? (hash(s.seed + i * 3 + Math.floor(c.t * 20)) - 0.5) * wd * 0.3 : 0;
      g.lineTo(x, wd / 2 + ripple);
    }
    g.lineTo(0, wd / 2); g.closePath(); g.fill();
    // core
    if (style === 'dark') { g.globalCompositeOperation = 'lighter'; g.globalAlpha = fade * 0.8; g.strokeStyle = '#b388ff'; g.lineWidth = 0.03; g.beginPath(); g.moveTo(0, -wd / 2); g.lineTo(L, -wd / 2); g.moveTo(0, wd / 2); g.lineTo(L, wd / 2); g.stroke(); }
    else {
      g.globalAlpha = fade; g.fillStyle = s.core || '#ffffff';
      const cw = wd * (style === 'light' ? 0.55 : 0.32);
      g.beginPath(); g.roundRect(0, -cw / 2, L, cw, cw / 2); g.fill();
    }
    // decorations
    if (style === 'quake') {
      g.globalAlpha = fade * 0.9; g.strokeStyle = '#ffffff'; g.lineWidth = 0.035;
      g.beginPath();
      const n = Math.max(3, Math.round(L / 1.2));
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) / n * L;
        jagged(g, x, -wd * 0.9, x + 0.3, wd * 0.9, s.seed + i * 9, 0.25, 4);
      }
      g.stroke();
    } else if (style === 'ice') {
      g.globalAlpha = fade * 0.9; g.fillStyle = '#e1f5fe';
      const n = Math.max(3, Math.round(L * 1.5));
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) / n * L, sd = hash(s.seed + i) > 0.5 ? 1 : -1, h = wd * (0.5 + hash(s.seed + i * 3) * 0.6);
        g.beginPath(); g.moveTo(x - 0.12, sd * wd * 0.35); g.lineTo(x, sd * (wd * 0.35 + h)); g.lineTo(x + 0.12, sd * wd * 0.35); g.fill();
      }
    } else if (style === 'gravity') {
      g.globalAlpha = fade * 0.8; g.strokeStyle = '#ede7f6'; g.lineWidth = 0.03;
      const n = Math.max(3, Math.round(L));
      for (let i = 0; i < n; i++) { const x = ((i + (c.t * 3) % 1) / n) * L; g.beginPath(); g.moveTo(x - 0.15, -wd * 0.3); g.lineTo(x, wd * 0.3); g.lineTo(x + 0.15, -wd * 0.3); g.stroke(); }
    } else if (style === 'light' || style === 'energy') {
      g.globalAlpha = fade * 0.9; g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(0, 0, wd * 0.9, 0, TAU); g.fill();
      starPath(g, 0, 0, wd * 1.8, 4, 0.12, c.t * 3); g.fill();
    }
    // end cap flare
    g.globalAlpha = fade * 0.8; g.fillStyle = s.core || '#ffffff';
    g.beginPath(); g.arc(L, 0, wd * 0.55, 0, TAU); g.fill();
  },
};

/** Lightning between two points (optionally from the sky). */
SHAPES.bolt = {
  air(g, s, k, a, c) {
    const [dx, dy] = c.rel(s.x1, s.y1);
    const fade = (1 - k) * a;
    const z0 = s.z0 ?? 0.8, z1 = s.z1 ?? 0.8;
    const n = Math.max(5, Math.ceil(Math.hypot(dx, dy - z1 + z0) * 2.2));
    const seed = s.seed + Math.floor(c.t * 30);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round'; g.lineJoin = 'round';
    const w = s.width || 0.08;
    for (const [col, lw, al] of [[s.color, w * 4, 0.3], [s.color, w * 1.6, 0.85], ['#ffffff', w * 0.6, 1]]) {
      g.globalAlpha = fade * al; g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); jagged(g, 0, -z0, dx, dy - z1, seed, 0.35 + (s.amp || 0), n); g.stroke();
    }
    if (s.branches !== 0) {
      g.globalAlpha = fade * 0.7; g.strokeStyle = s.color; g.lineWidth = w * 0.7;
      g.beginPath();
      const nb = s.branches || 2;
      for (let b = 0; b < nb; b++) {
        const t0 = 0.25 + hash(seed + b) * 0.5;
        const bx = dx * t0, by = (dy - z1 + z0) * t0 - z0;
        const ba = Math.atan2(dy - z1 + z0, dx) + (hash(seed + b * 3) - 0.5) * 2;
        const bl = 0.4 + hash(seed + b * 5) * 0.8;
        jagged(g, bx, by, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl, seed + b * 11, 0.15, 4);
      }
      g.stroke();
    }
  },
};

/** Cracked air (Gura Gura): shattered-glass lines hanging in space. */
SHAPES.aircrack = {
  air(g, s, k, a) {
    const grow = easeOut(Math.min(1, k / 0.12));
    const fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    const R = s.size * grow;
    g.translate(0, -(s.z ?? 0.8));
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a * fade * 0.25; g.fillStyle = s.color || '#e0f7fa';
    g.beginPath(); g.arc(0, 0, R * 0.35, 0, TAU); g.fill();
    g.lineCap = 'round'; g.lineJoin = 'miter';
    const n = s.n || 9;
    for (const [col, lw] of [[s.color || '#e0f7fa', 0.09], ['#ffffff', 0.035]]) {
      g.globalAlpha = a * fade; g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU + (hash(s.seed + i) - 0.5) * 0.5;
        let x = 0, y = 0;
        g.moveTo(0, 0);
        const L = R * (0.6 + 0.5 * hash(s.seed + i * 3));
        for (let j = 1; j <= 3; j++) {
          const r = (L * j) / 3, o = (hash(s.seed + i * 7 + j) - 0.5) * 0.5;
          x = Math.cos(th + o) * r; y = Math.sin(th + o) * r;
          g.lineTo(x, y);
        }
        // concentric shard edges
        const th2 = th + TAU / n;
        const r2 = L * 0.55;
        g.moveTo(Math.cos(th) * r2, Math.sin(th) * r2); g.lineTo(Math.cos(th2) * r2 * 0.95, Math.sin(th2) * r2 * 0.95);
      }
      g.stroke();
    }
  },
};

/** Vertical column (fire / light / lightning / ice / water / dark). */
SHAPES.pillar = {
  ground(g, s, k, a) {
    const fade = Math.min(1, (1 - k) * 3) * a;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = fade * 0.45; g.fillStyle = s.color;
    ellipsePath(g, s.r * 1.6, s.r); g.fill();
  },
  air(g, s, k, a, c) {
    const grow = easeOut(Math.min(1, k / 0.15));
    const fade = Math.min(1, (1 - k) * 3) * a;
    const H = (s.h || 4) * grow, R = s.r * (0.6 + 0.4 * grow) * (1 - k * 0.3);
    g.globalCompositeOperation = s.kind === 'dark' ? 'source-over' : 'lighter';
    const col = s.color;
    for (let layer = 0; layer < 3; layer++) {
      const w = R * [1.4, 1, 0.45][layer];
      g.globalAlpha = fade * [0.25, 0.6, 0.95][layer];
      g.fillStyle = layer === 2 ? (s.core || '#ffffff') : col;
      g.beginPath();
      g.moveTo(-w, 0);
      const segs = 10;
      for (let i = 1; i <= segs; i++) {
        const y = -H * (i / segs);
        const wob = s.kind === 'fire' ? Math.sin(i * 1.7 - c.t * 18 + layer) * w * 0.25 : s.kind === 'lightning' ? (hash(s.seed + i + Math.floor(c.t * 30)) - 0.5) * w * 0.8 : 0;
        g.lineTo(-w * (1 - 0.3 * i / segs) + wob, y);
      }
      for (let i = segs; i >= 1; i--) {
        const y = -H * (i / segs);
        const wob = s.kind === 'fire' ? Math.sin(i * 1.3 + c.t * 16 + layer) * w * 0.25 : s.kind === 'lightning' ? (hash(s.seed + i * 3 + Math.floor(c.t * 30)) - 0.5) * w * 0.8 : 0;
        g.lineTo(w * (1 - 0.3 * i / segs) + wob, y);
      }
      g.lineTo(w, 0); g.closePath(); g.fill();
    }
  },
};

/** Hemisphere (Room, Birdcage, barriers, frost domes). */
SHAPES.dome = {
  ground(g, s, k, a, c) {
    const grow = easeOut(Math.min(1, (s.age || 0) / 0.35));
    const R = s.r * grow;
    g.globalAlpha = 0.12 * a; g.fillStyle = s.color;
    ellipsePath(g, R, R * 0.62); g.fill();
    g.globalAlpha = 0.7 * a; g.strokeStyle = s.color; g.lineWidth = 0.06;
    ellipsePath(g, R, R * 0.62); g.stroke();
    if (s.kind === 'room') {
      // a slow scanning ring inside the Room
      const ph = (c.t * 0.5) % 1;
      g.globalAlpha = 0.35 * a * (1 - ph); g.lineWidth = 0.035;
      ellipsePath(g, R * ph, R * ph * 0.62); g.stroke();
    }
  },
  air(g, s, k, a, c) {
    const grow = easeOut(Math.min(1, (s.age || 0) / 0.35));
    const R = s.r * grow, H = R * (s.hk ?? 0.55);
    g.globalAlpha = 0.08 * a; g.fillStyle = s.color;
    g.beginPath(); g.ellipse(0, 0, R, H + R * 0.62, 0, Math.PI, 0); g.ellipse(0, 0, R, R * 0.62, 0, 0, Math.PI); g.fill();
    g.globalAlpha = 0.55 * a; g.strokeStyle = s.color; g.lineWidth = 0.05;
    g.beginPath(); g.ellipse(0, 0, R, H + R * 0.62 * 0.4, 0, Math.PI, 0); g.stroke();
    if (s.kind === 'cage') {
      // strings converging to the top of the Birdcage
      g.globalAlpha = 0.7 * a; g.lineWidth = 0.02;
      const n = 16;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI;
        const bx = Math.cos(th) * R, by = Math.sin(th) * R * 0.62;
        g.moveTo(bx, by); g.quadraticCurveTo(bx * 0.55, -H * 0.9, 0, -(H + R * 0.25));
        g.moveTo(-bx, -by * 0.4); g.quadraticCurveTo(-bx * 0.55, -H * 0.9, 0, -(H + R * 0.25));
      }
      g.stroke();
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 * a; g.strokeStyle = '#ffffff'; g.lineWidth = 0.008; g.stroke();
    } else if (s.kind === 'room') {
      g.globalAlpha = 0.25 * a; g.lineWidth = 0.02;
      g.beginPath();
      for (let i = 1; i < 4; i++) { const f = i / 4; g.ellipse(0, -H * f * 0.85, R * Math.sqrt(1 - f * f), R * 0.1 * (1 - f), 0, 0, TAU); }
      g.stroke();
    }
  },
};

/** Hex-cell barrier panel in front of an actor (Bari Bari). */
SHAPES.barrier = {
  air(g, s, k, a, c) {
    const grow = easeOut(Math.min(1, (s.age || 0) / 0.2));
    const f = s.follow ? s.follow.facing : s.angle || 0;
    const dx = Math.cos(f), dy = Math.sin(f);
    g.translate(dx * 0.75, dy * 0.45 - 0.9);
    const side = Math.abs(dx) > Math.abs(dy);
    const W = (side ? 0.45 : 1.4) * grow, H = 1.5 * grow;
    const shimmer = 0.5 + 0.5 * Math.sin(c.t * 6);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a * (0.16 + 0.08 * shimmer); g.fillStyle = s.color || '#b3e5fc';
    g.beginPath(); g.roundRect(-W / 2, -H / 2, W, H, 0.12); g.fill();
    g.globalAlpha = a * 0.7; g.strokeStyle = s.color || '#b3e5fc'; g.lineWidth = 0.035; g.stroke();
    g.globalAlpha = a * 0.45; g.lineWidth = 0.018;
    const hr = 0.16;
    g.beginPath();
    for (let row = -4; row <= 4; row++) {
      for (let col = -4; col <= 4; col++) {
        const cx = col * hr * 1.5 * (side ? 0.35 : 1), cy = row * hr * 1.73 + (col & 1 ? hr * 0.86 : 0);
        if (Math.abs(cx) > W / 2 - 0.05 || Math.abs(cy) > H / 2 - 0.05) continue;
        for (let i = 0; i <= 6; i++) { const th = (i / 6) * TAU; const x = cx + Math.cos(th) * hr * 0.55 * (side ? 0.35 : 1), y = cy + Math.sin(th) * hr * 0.55; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      }
    }
    g.stroke();
  },
};

/** Swirl: black hole, sand tornado, cyclone, whirlpool. */
SHAPES.vortex = {
  ground(g, s, k, a, c) {
    const grow = easeOut(Math.min(1, (s.age || 0) / 0.3));
    const R = s.r * grow;
    const spin = c.t * (s.spin || 4);
    if (s.kind === 'dark') {
      g.globalAlpha = 0.85 * a; g.fillStyle = '#05000a'; ellipsePath(g, R * 0.35, R * 0.22); g.fill();
      g.globalAlpha = 0.5 * a; g.fillStyle = '#1a0033'; ellipsePath(g, R * 0.7, R * 0.43); g.fill();
    } else {
      g.globalAlpha = 0.18 * a; g.fillStyle = s.color; ellipsePath(g, R, R * 0.62); g.fill();
    }
    g.lineCap = 'round';
    const arms = s.arms || 5;
    for (let i = 0; i < arms; i++) {
      g.globalAlpha = 0.6 * a;
      g.strokeStyle = s.kind === 'dark' ? (i % 2 ? '#7e57c2' : '#311b92') : s.color;
      g.lineWidth = 0.08;
      g.beginPath();
      for (let j = 0; j <= 16; j++) {
        const u = j / 16;
        const th = spin + (i / arms) * TAU + u * 3.2;
        const r = R * (1 - u * 0.85);
        const x = Math.cos(th) * r, y = Math.sin(th) * r * 0.62;
        if (j) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
  },
  air(g, s, k, a, c) {
    if (s.kind !== 'sand' && s.kind !== 'wind' && s.kind !== 'smoke' && s.kind !== 'water') return;
    // a funnel rising from the ground
    const grow = easeOut(Math.min(1, (s.age || 0) / 0.3));
    const R = s.r * grow, H = (s.h || s.r * 1.6) * grow;
    const spin = c.t * (s.spin || 7);
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      const y = -H * u, r = R * (0.25 + 0.75 * u);
      g.globalAlpha = a * (0.25 + 0.3 * u); g.strokeStyle = i % 2 ? s.color : (s.color2 || '#ffffff'); g.lineWidth = 0.07 + u * 0.05;
      const ph = spin + i * 0.9;
      g.beginPath(); g.ellipse(Math.sin(ph * 0.7) * 0.15 * u, y, r, r * 0.3, 0, ph, ph + 4.2); g.stroke();
    }
  },
};

/** Storm cloud hanging over a spot. */
SHAPES.cloud = {
  air(g, s, k, a, c) {
    const grow = easeOut(Math.min(1, (s.age || 0) / 0.4));
    const R = s.r * grow;
    g.translate(0, -(s.z ?? 5));
    const n = 9;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU;
        const x = Math.cos(th) * R * 0.75 + Math.sin(c.t * 0.8 + i) * 0.1, y = Math.sin(th) * R * 0.28;
        const rr = R * (0.38 + 0.12 * hash(s.seed + i));
        g.globalAlpha = a * (pass ? 0.9 : 0.5);
        g.fillStyle = pass ? (s.color || '#37474f') : '#263238';
        g.beginPath(); g.arc(x, y + (pass ? -0.05 : 0.08), rr * (pass ? 0.9 : 1.05), 0, TAU); g.fill();
      }
    }
    // inner lightning flicker
    if (s.flicker !== false && Math.sin(c.t * 23 + s.seed) > 0.6) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a * 0.5; g.fillStyle = s.glow || '#fff59d';
      g.beginPath(); g.arc((hash(Math.floor(c.t * 8) + s.seed) - 0.5) * R, 0, R * 0.35, 0, TAU); g.fill();
    }
  },
};

/** Spikes (ice, sand blades, rock) rising from the ground at offsets. */
SHAPES.spikes = {
  air(g, s, k, a) {
    const age = s.age || 0;
    const fade = Math.min(1, (1 - k) * 3) * a;
    for (const p of s.pts) {
      const t = age - (p.delay || 0);
      if (t < 0) continue;
      const grow = easeOut(Math.min(1, t / 0.12));
      const [px, py] = [p.dx, p.dy];
      const h = p.h * grow, w = p.w;
      g.globalAlpha = fade;
      g.fillStyle = s.color || '#b3e5fc'; g.strokeStyle = s.edge || '#e1f5fe'; g.lineWidth = 0.025;
      g.beginPath(); g.moveTo(px - w, py); g.lineTo(px + (p.lean || 0) * h, py - h); g.lineTo(px + w, py); g.closePath(); g.fill(); g.stroke();
      if (s.kind === 'ice') { g.globalAlpha = fade * 0.8; g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(px - w * 0.3, py - h * 0.1); g.lineTo(px + (p.lean || 0) * h * 0.95, py - h * 0.92); g.lineTo(px, py - h * 0.1); g.closePath(); g.fill(); }
    }
  },
};

/** Sprouting arms (Hana Hana): arms bloom out of petals and clutch. */
SHAPES.arms = {
  air(g, s, k, a, c) {
    const age = s.age || 0;
    const fade = Math.min(1, (1 - k) * 4) * a;
    const skin = s.skin || '#f1c9a0', sleeve = s.sleeve || '#7e57c2';
    for (const p of s.pts) {
      const t = age - (p.delay || 0);
      if (t < 0) continue;
      const grow = easeOut(Math.min(1, t / 0.16));
      const clutch = Math.min(1, Math.max(0, (t - 0.16) / 0.12));
      const x = p.dx, y = p.dy, L = p.L * grow * (s.big ? 2.2 : 1);
      g.globalAlpha = fade;
      // petal burst at the base
      g.fillStyle = s.petal || '#f48fb1';
      for (let i = 0; i < 5; i++) { const th = i / 5 * TAU + p.seed; g.beginPath(); g.ellipse(x + Math.cos(th) * 0.09, y + Math.sin(th) * 0.05, 0.08, 0.04, th, 0, TAU); g.fill(); }
      const ang = p.ang;
      const ex = x + Math.cos(ang) * L * 0.4, ey = y - L * 0.8;
      g.strokeStyle = 'rgba(30,20,20,0.85)'; g.lineWidth = (s.big ? 0.3 : 0.1) + 0.05; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - Math.cos(ang) * L * 0.2, y - L * 0.5, ex, ey); g.stroke();
      g.strokeStyle = sleeve; g.lineWidth = s.big ? 0.3 : 0.1; g.stroke();
      g.fillStyle = skin; g.strokeStyle = 'rgba(30,20,20,0.85)'; g.lineWidth = 0.025;
      const hr = (s.big ? 0.26 : 0.08) * (1 - clutch * 0.2);
      g.beginPath(); g.arc(ex, ey, hr, 0, TAU); g.fill(); g.stroke();
      if (!clutch) {
        for (let f = -1; f <= 1; f++) { g.beginPath(); g.moveTo(ex, ey - hr * 0.6); g.lineTo(ex + f * hr * 0.6, ey - hr * 1.6); g.lineWidth = s.big ? 0.08 : 0.03; g.strokeStyle = skin; g.stroke(); }
      }
    }
  },
};

/** Something falling from the sky onto a spot (meteors, magma fists, giant hands). */
SHAPES.meteor = {
  air(g, s, k, a, c) {
    const fall = s.fall || 0.35;
    const age = (s.age || 0) - (s.delay0 || 0);
    if (age < 0) return;
    const t = Math.min(1, age / fall);
    const zh = (s.h || 9) * (1 - t * t);
    const ox = (s.drift || 1.5) * (1 - t);
    const R = s.size || 1;
    if (t >= 1) {
      // landed: glowing crater flash
      const f = 1 - Math.min(1, (age - fall) / 0.35);
      if (f <= 0) return;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = f * a; g.fillStyle = s.glow || '#ff9100';
      ellipsePath(g, R * 1.6, R); g.fill();
      return;
    }
    g.translate(-ox, -zh);
    g.globalAlpha = a;
    // trail
    g.globalCompositeOperation = 'lighter';
    const gr = g.createLinearGradient(0, 0, ox * 0.8 + 0.8, -R * 3);
    gr.addColorStop(0, rgba(s.glow || '#ff9100', 0.9)); gr.addColorStop(1, rgba(s.glow || '#ff9100', 0));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-R * 0.8, 0); g.lineTo(ox * 0.8 + 0.8, -R * 3.2); g.lineTo(R * 0.8, 0); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
    if (s.kind === 'fist' || s.kind === 'mochi') {
      g.fillStyle = s.kind === 'mochi' ? '#fff8e1' : s.color || '#bf360c'; g.strokeStyle = 'rgba(30,20,20,0.85)'; g.lineWidth = 0.05;
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = s.kind === 'mochi' ? '#d7ccc8' : '#ffab40'; g.lineWidth = 0.04;
      g.beginPath(); for (let i = -1; i <= 1; i++) { g.moveTo(i * R * 0.35, -R * 0.2); g.lineTo(i * R * 0.35, R * 0.45); } g.stroke();
    } else if (s.kind === 'hand') {
      g.fillStyle = s.color || '#f1c9a0'; g.strokeStyle = 'rgba(30,20,20,0.85)'; g.lineWidth = 0.05;
      g.beginPath(); g.ellipse(0, 0, R * 1.2, R * 0.8, 0, 0, TAU); g.fill(); g.stroke();
    } else {
      g.fillStyle = s.color || '#5d4037';
      g.beginPath();
      for (let i = 0; i < 9; i++) { const th = (i / 9) * TAU; const rr = R * (0.8 + 0.3 * hash(s.seed + i)); g.lineTo(Math.cos(th) * rr, Math.sin(th) * rr); }
      g.closePath(); g.fill();
      g.globalCompositeOperation = 'lighter'; g.fillStyle = s.glow || '#ff9100'; g.globalAlpha = 0.6 * a;
      g.beginPath(); g.arc(R * 0.2, R * 0.2, R * 0.5, 0, TAU); g.fill();
    }
  },
};

/** Three parallel claw marks raked across a spot. */
SHAPES.claw = {
  air(g, s, k, a) {
    const reveal = easeOut(Math.min(1, k / 0.25));
    const fade = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
    g.translate(0, -(s.z ?? 0.75));
    g.rotate((s.angle || 0) + (s.tilt ?? 0.9));
    const L = s.size || 1;
    g.lineCap = 'round';
    const n = s.n || 3;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * L * 0.22;
      const x0 = -L / 2, x1 = -L / 2 + L * reveal;
      for (const [col, lw, add] of [[s.color || '#ffffff', 0.11, true], ['#ffffff', 0.04, true]]) {
        g.globalCompositeOperation = add ? 'lighter' : 'source-over';
        g.globalAlpha = a * fade; g.strokeStyle = col; g.lineWidth = lw * (1 - Math.abs(off) / L);
        g.beginPath(); g.moveTo(x0, off - 0.1); g.quadraticCurveTo((x0 + x1) / 2, off + 0.06, x1, off - 0.1 + (x1 - x0) * 0.05); g.stroke();
      }
    }
  },
};

/** Wireframe cube (Ope Ope). */
SHAPES.cube = {
  air(g, s, k, a, c) {
    const grow = easeOut(Math.min(1, k / 0.2));
    const fade = 1 - k * k;
    g.translate(0, -(s.z ?? 0.8));
    const R = s.size * grow;
    const rot = (s.rot || 0) + c.t * (s.spin ?? 2);
    const v = [];
    for (const [x, y, z] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) {
      const cx = Math.cos(rot), sx = Math.sin(rot);
      const X = x * cx - z * sx, Z = x * sx + z * cx;
      const cy = Math.cos(0.5), sy = Math.sin(0.5);
      v.push([X * R, (y * cy - Z * sy) * R]);
    }
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a * fade * 0.18; g.fillStyle = s.color;
    g.beginPath(); g.moveTo(v[4][0], v[4][1]); g.lineTo(v[5][0], v[5][1]); g.lineTo(v[6][0], v[6][1]); g.lineTo(v[7][0], v[7][1]); g.closePath(); g.fill();
    g.globalAlpha = a * fade; g.strokeStyle = s.color; g.lineWidth = 0.035;
    g.beginPath();
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) { g.moveTo(v[i][0], v[i][1]); g.lineTo(v[j][0], v[j][1]); }
    g.stroke();
    if (s.heart) { g.fillStyle = '#ff5252'; g.globalAlpha = a * fade; g.beginPath(); g.arc(-R * 0.18, -R * 0.1, R * 0.22, 0, TAU); g.arc(R * 0.18, -R * 0.1, R * 0.22, 0, TAU); g.moveTo(-R * 0.38, 0); g.lineTo(0, R * 0.4); g.lineTo(R * 0.38, 0); g.fill(); }
  },
};

/** A clean cut line appearing along a path (iai dashes: "the enemy falls behind you"). */
SHAPES.cutline = {
  air(g, s, k, a, c) {
    const [dx, dy] = c.rel(s.x1, s.y1);
    const reveal = easeOut(Math.min(1, k / 0.18));
    const fade = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
    const z = s.z ?? 0.7;
    const off = s.off || 0;
    const nx = -dy, ny = dx, l = Math.hypot(dx, dy) || 1;
    const ox = nx / l * off, oy = ny / l * off;
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (const [col, lw] of [[s.color || '#e3f2fd', 0.12], ['#ffffff', 0.035]]) {
      g.globalAlpha = a * fade; g.strokeStyle = col; g.lineWidth = lw * (1 - k * 0.5);
      g.beginPath(); g.moveTo(ox - dx * 0.15, oy - z - dy * 0.15); g.lineTo(ox + dx * (reveal * 1.3 - 0.15), oy - z + dy * (reveal * 1.3 - 0.15)); g.stroke();
    }
  },
};

/** Speed lines streaming behind a moving actor. */
SHAPES.streaks = {
  air(g, s, k, a, c) {
    const ang = s.angle;
    g.rotate(ang);
    g.globalAlpha = a * (1 - k) * 0.8; g.strokeStyle = s.color || '#ffffff'; g.lineWidth = 0.03; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i < 7; i++) {
      const y = (hash(s.seed + i) - 0.5) * 1.4 - 0.7;
      const x0 = -0.4 - hash(s.seed + i * 3 + Math.floor(c.t * 30)) * 0.4, x1 = x0 - 0.6 - hash(s.seed + i * 5) * 0.9;
      g.moveTo(x0, y * 0.9); g.lineTo(x1, y * 0.9);
    }
    g.stroke();
  },
};

/** Gatling: fists popping all over a cone in front of the actor. */
SHAPES.gatling = {
  air(g, s, k, a, c) {
    const f = s.follow;
    const ang = f ? f.facing : s.angle || 0;
    const n = 9;
    const skin = s.skin || '#f1c9a0';
    for (let i = 0; i < n; i++) {
      const ph = (c.t * 7 + i / n) % 1;
      const seed = Math.floor(c.t * 7 + i / n) * 13 + i;
      const d = 0.8 + hash(seed) * (s.range || 2.6);
      const th = ang + (hash(seed + 3) - 0.5) * (s.arc || 0.9);
      const x = Math.cos(th) * d, y = Math.sin(th) * d * 0.8 - 0.75 - (hash(seed + 7) - 0.5) * 0.5;
      const pop = Math.sin(ph * Math.PI);
      g.globalAlpha = a * pop * 0.95;
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.05; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(th) * 0.4 * pop, y - Math.sin(th) * 0.32 * pop); g.stroke();
      g.fillStyle = s.dark ? '#1c1a24' : skin; g.strokeStyle = 'rgba(30,20,20,0.85)'; g.lineWidth = 0.025;
      g.beginPath(); g.arc(x, y, 0.13 * (0.7 + pop * 0.4), 0, TAU); g.fill(); g.stroke();
      if (ph > 0.45 && ph < 0.6) {
        g.globalCompositeOperation = 'lighter'; g.fillStyle = '#ffffff'; g.globalAlpha = a * 0.8;
        starPath(g, x + Math.cos(th) * 0.12, y + Math.sin(th) * 0.1, 0.16, 6, 0.4, seed); g.fill();
        g.globalCompositeOperation = 'source-over';
      }
    }
  },
};

/** Bara Bara Festival: body pieces orbiting and pummelling. */
SHAPES.pieces = {
  air(g, s, k, a, c) {
    const n = 10;
    const R = s.r || 2.4;
    for (let i = 0; i < n; i++) {
      const th = c.t * (2.5 + (i % 3)) + i * 2.39;
      const r = R * (0.35 + 0.65 * hash(s.seed + i));
      const x = Math.cos(th) * r, y = Math.sin(th) * r * 0.62 - 0.6 - Math.sin(c.t * 7 + i) * 0.25;
      g.globalAlpha = a * Math.min(1, (1 - k) * 4);
      g.save(); g.translate(x, y); g.rotate(th * 2);
      const kind = i % 3;
      g.strokeStyle = 'rgba(30,20,20,0.85)'; g.lineWidth = 0.025;
      if (kind === 0) { g.fillStyle = s.skin || '#f1c9a0'; g.beginPath(); g.arc(0, 0, 0.12, 0, TAU); g.fill(); g.stroke(); }
      else { g.fillStyle = kind === 1 ? s.top || '#e53935' : s.bottom || '#1565c0'; g.beginPath(); g.roundRect(-0.16, -0.06, 0.32, 0.12, 0.05); g.fill(); g.stroke(); }
      // the cut line
      g.strokeStyle = '#ffffff'; g.lineWidth = 0.015; g.beginPath(); g.moveTo(-0.06, -0.08); g.lineTo(0.06, 0.08); g.stroke();
      g.restore();
    }
  },
};

/** Strings from a point to another (Parasite, Overheat, puppet strings). */
SHAPES.strings = {
  air(g, s, k, a, c) {
    const [dx, dy] = c.rel(s.x1, s.y1);
    const fade = 1 - k;
    const n = s.n || 5;
    g.globalAlpha = a * fade; g.strokeStyle = s.color || '#f8bbd0'; g.lineWidth = 0.02;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = (i / (n - 1) - 0.5) * 0.3;
      g.moveTo(sp * 0.3, -1.0); g.quadraticCurveTo(dx * 0.5 + sp, dy * 0.5 - 1.1 + Math.sin(c.t * 6 + i) * 0.1, dx + sp * 0.5, dy - 0.8);
    }
    g.stroke();
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#ffffff'; g.lineWidth = 0.008; g.stroke();
  },
};

// ------------------------------------------------------------------ zones
function zoneAlpha(s) { return s.endT !== undefined ? Math.max(0, s.endT / 0.35) : 1; }
SHAPES.zone = {
  ground(g, s, k, a, c) {
    const z = s.zone;
    const R = s.r * easeOut(Math.min(1, (s.age || 0) / 0.3));
    const col = s.color || '#ffffff';
    switch (s.kind) {
      case 'dark': SHAPES.vortex.ground(g, { ...s, r: R, kind: 'dark', spin: -3, arms: 6 }, k, a, c); break;
      case 'storm': SHAPES.vortex.ground(g, { ...s, r: R, kind: 'sand', spin: 5 }, k, a * 0.7, c); break;
      case 'gravity': {
        g.globalAlpha = 0.22 * a; g.fillStyle = col; ellipsePath(g, R, R * 0.62); g.fill();
        g.globalAlpha = 0.6 * a; g.strokeStyle = col; g.lineWidth = 0.06; g.stroke();
        for (let i = 0; i < 3; i++) { const ph = (c.t * 0.9 + i / 3) % 1; g.globalAlpha = 0.5 * a * ph; g.lineWidth = 0.04; ellipsePath(g, R * (1 - ph), R * (1 - ph) * 0.62); g.stroke(); }
        break;
      }
      case 'ice': {
        g.globalAlpha = 0.3 * a; g.fillStyle = '#e1f5fe'; ellipsePath(g, R, R * 0.62); g.fill();
        g.globalAlpha = 0.5 * a; g.strokeStyle = '#ffffff'; g.lineWidth = 0.03;
        g.beginPath();
        for (let i = 0; i < 10; i++) { const th = (i / 10) * TAU + s.seed; g.moveTo(0, 0); g.lineTo(Math.cos(th) * R * 0.9, Math.sin(th) * R * 0.55); }
        g.stroke();
        break;
      }
      case 'field': case 'plant': case 'smoke': {
        g.globalAlpha = 0.24 * a; g.fillStyle = col;
        for (let i = 0; i < 6; i++) { const th = (i / 6) * TAU + c.t * 0.2, rr = R * 0.45; g.beginPath(); g.ellipse(Math.cos(th) * rr * 0.6, Math.sin(th) * rr * 0.35, rr, rr * 0.6, 0, 0, TAU); g.fill(); }
        g.globalAlpha = 0.35 * a; g.strokeStyle = col; g.lineWidth = 0.04; ellipsePath(g, R, R * 0.62); g.stroke();
        if (s.kind === 'plant') {
          g.strokeStyle = '#2e7d32'; g.lineWidth = 0.07; g.lineCap = 'round'; g.globalAlpha = 0.9 * a;
          g.beginPath();
          for (let i = 0; i < 7; i++) { const th = (i / 7) * TAU + s.seed; const x = Math.cos(th) * R * 0.7, y = Math.sin(th) * R * 0.45; g.moveTo(x, y); g.quadraticCurveTo(x * 0.5, y * 0.5 - 0.4 - Math.sin(c.t * 3 + i) * 0.1, 0, -0.1); }
          g.stroke();
        }
        break;
      }
      case 'thunder': case 'meteor': case 'fists': case 'arms': case 'cage': {
        g.globalAlpha = 0.16 * a; g.fillStyle = col; ellipsePath(g, R, R * 0.62); g.fill();
        g.globalAlpha = 0.5 * a; g.strokeStyle = col; g.lineWidth = 0.05; ellipsePath(g, R, R * 0.62); g.stroke();
        if (s.kind === 'cage') SHAPES.dome.ground(g, { ...s, kind: 'cage', r: R, age: 9 }, k, a, c);
        break;
      }
      default: {
        g.globalAlpha = 0.18 * a; g.fillStyle = col; ellipsePath(g, R, R * 0.62); g.fill();
        g.globalAlpha = 0.5 * a; g.strokeStyle = col; g.lineWidth = 0.04; ellipsePath(g, R, R * 0.62); g.stroke();
      }
    }
    void z;
  },
  air(g, s, k, a, c) {
    const R = s.r * easeOut(Math.min(1, (s.age || 0) / 0.3));
    switch (s.kind) {
      case 'thunder': SHAPES.cloud.air(g, { ...s, r: Math.max(1.4, R * 0.9), z: 4.5 + R * 0.3, color: '#37474f' }, k, a, c); break;
      case 'storm': SHAPES.vortex.air(g, { ...s, r: R, kind: 'sand', h: R * 1.3, color: s.color, color2: '#ffffff' }, k, a * 0.8, c); break;
      case 'cage': SHAPES.dome.air(g, { ...s, kind: 'cage', r: R, age: 9, hk: 0.6 }, k, a, c); break;
      case 'arms': {
        if (!s.pts) {
          s.pts = [];
          const n = Math.max(3, Math.round(R * 3));
          for (let i = 0; i < n; i++) { const th = (i / n) * TAU + hash(s.seed + i); const rr = R * (0.3 + 0.6 * hash(s.seed + i * 3)); s.pts.push({ dx: Math.cos(th) * rr, dy: Math.sin(th) * rr * 0.62, L: 0.9, ang: th, delay: i * 0.03, seed: i }); }
        }
        SHAPES.arms.air(g, { ...s, big: R > 2 }, k, a, c);
        break;
      }
      case 'gravity': {
        g.globalAlpha = 0.6 * a; g.strokeStyle = '#ede7f6'; g.lineWidth = 0.035; g.lineCap = 'round';
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const x = (hash(s.seed + i) - 0.5) * R * 1.6, y0 = -3 + ((c.t * 3 + hash(s.seed + i * 3)) % 1) * 3;
          g.moveTo(x, y0 - 0.6); g.lineTo(x, y0);
        }
        g.stroke();
        break;
      }
      case 'field': {
        // bubbles popping in poison/dry fields
        for (let i = 0; i < 5; i++) {
          const ph = (c.t * 0.8 + hash(s.seed + i)) % 1;
          const x = (hash(s.seed + i * 7 + Math.floor(c.t * 0.8 + hash(s.seed + i))) - 0.5) * R * 1.4, y = (hash(s.seed + i * 11) - 0.5) * R * 0.8;
          g.globalAlpha = a * (1 - ph) * 0.7; g.strokeStyle = s.color; g.lineWidth = 0.025;
          g.beginPath(); g.arc(x, y - ph * 0.3, 0.06 + ph * 0.12, 0, TAU); g.stroke();
        }
        break;
      }
      default: break;
    }
  },
};

/** Dispatch helpers used by fx.js. */
export function drawShapeLayer(g, s, layer, k, a, c) {
  const d = SHAPES[s.type];
  if (!d || !d[layer]) return false;
  d[layer](g, s, k, a * zoneAlpha(s), c);
  return true;
}
export function hasLayer(type, layer) { return !!(SHAPES[type] && SHAPES[type][layer]); }
