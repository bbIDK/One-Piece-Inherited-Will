// The fx engine's particles in 3D. Each kind keeps its 2D meaning, with a
// look of its own: sparks are white-hot spindles stretched along their
// flight, flames cel-shaded tongues that rise and shrink, smoke and dust
// two-tone billows lit from the sun's side that fray away as they thin,
// shards real tumbling splinters (ice, wax, a broken guard), drops little
// streaks of water, sand grains, petals turning as they fall.
import { col, hash, TAU } from './kit.js';
import { SK } from './sprites.js';
import { OK, putAlong } from './solids.js';

const WHITE = col('#ffffff');
const HOT = col('#fff6dc');

export function drawParticles(v, parts) {
  const S = v.sprites, w = v.world;
  const low = v.low;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const life = p.max > 0 ? p.life / p.max : 0;
    const k = 1 - life;
    const c = col(p.color);
    const al = Math.min(1, life * 1.6) * (p.alpha ?? 1) * c[3];
    if (al < 0.01) continue;
    const h = p.under !== undefined ? p.z - p.under : p.z;
    const X = w.dx(v.ox, p.x), Z = p.y - v.oy, Y = v.ground(p.x, p.y) + h;
    const sz = p.size || 0.1;
    const add = p.add ? 1 : 0;
    switch (p.kind) {
      case 'spark':
      case 'line': {
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        const len = Math.min(0.8, sp * 0.05 + sz * 0.6);
        const j = S.put(SK.STREAK, X, Y, Z, Math.max(0.012, sz * (p.kind === 'line' ? 0.2 : 0.3)), c, al, add ? WHITE : c, add, 0, i, k);
        S.vel(j, p.vx, p.vz, p.vy, len);
        break;
      }
      case 'drop': {
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        const j = S.put(SK.DROP, X, Y, Z, sz * 0.55, c, al, WHITE, 0.1, 0, i, k);
        S.vel(j, p.vx, p.vz, p.vy, Math.max(sz * 2.4, Math.min(0.6, sp * 0.045)));
        break;
      }
      case 'smoke':
        S.put(SK.SMOKE, X, Y, Z, sz * 1.3, c, al * 0.95, c, 0, p.rot || 0, (p.max * 97.3) % 50, k);
        break;
      case 'dust':
        S.put(SK.DUST, X, Y, Z, sz * 1.4, c, al, c, 0, p.rot || 0, (p.max * 89.1) % 50, k);
        break;
      case 'fire':
        S.put(SK.FIRE, X, Y, Z, sz * (0.75 + 0.55 * life) * 1.6, c, Math.min(1, al * 1.2), HOT, add ? 0.7 : 0.2, 0, (p.max * 71.9) % 50, k);
        break;
      case 'glow':
        S.put(SK.GLOW, X, Y, Z, sz, c, al, WHITE, 1, 0, 0, k);
        break;
      case 'ember':
        S.put(SK.EMBER, X, Y, Z, Math.max(0.03, sz * 0.6), c, al, WHITE, 1, 0, (p.max * 31.7) % 50, k);
        break;
      case 'star':
        S.put(SK.STAR, X, Y, Z, sz * 1.4, c, al, WHITE, 1, p.rot || 0, 0, k);
        break;
      case 'petal':
      case 'leaf':
        S.put(SK.PETAL, X, Y, Z, sz, c, al, c, 0, p.rot || life * 6, 0, k);
        break;
      case 'bubble':
        S.put(SK.BUBBLE, X, Y, Z, sz, c, al, WHITE, 0.3, 0, 0, k);
        break;
      case 'shard': {
        if (low && (i & 1)) break;
        // a splinter tumbling end over end
        const r = p.rot || 0, q = hash((p.max || 0) * 13.7) * TAU;
        const icy = c[2] > c[0] * 1.1 || (c[0] > 0.8 && c[1] > 0.8 && c[2] > 0.8);
        putAlong(v.solids.shards, X, Y, Z, Math.cos(r) * Math.cos(q), Math.sin(r), Math.cos(r) * Math.sin(q), sz * 1.25, sz * 1.0, r * 0.7, c, icy ? OK.ICE : OK.WAX, k > 0.75 ? (k - 0.75) * 4 : 0, (p.max * 7.1) % 10, 0.1);
        break;
      }
      case 'sand':
        S.put(SK.SPECK, X, Y, Z, Math.max(0.018, sz * 0.55), c, al, c, 0, p.rot || 0, 0, k);
        break;
      case 'square':
        S.put(SK.SQUARE, X, Y, Z, sz * 0.6, c, al, c, 0, p.rot || 0, 0, k);
        break;
      case 'ring': {
        const j = S.put(SK.RING, X, Y, Z, sz * 1.1, c, al, c, add ? 1 : 0.3, 0, 0, k);
        S.vel(j, 0.06, 0, 1, 0);
        break;
      }
      default:
        S.put(SK.SPECK, X, Y, Z, sz * 0.5, c, al, c, add, p.rot || 0, 0, k);
    }
  }
}
