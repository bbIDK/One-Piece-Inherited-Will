// Being wanted. A small bounty goes unnoticed — nobody remembers the face of a
// petty thief — but once your poster is worth something, Marines who get a
// good look at you know you: a "?" as they squint, a "!" when they're sure,
// and then they come for you (and shout for their friends). Notorious pirates
// are recognised from further off. Pull a hood over your head and only
// someone right in front of you might see who you are — until you start a
// fight or commit a crime in it, when the hood slips.
import { ITEMS } from '../data/items.js';
import { bountySea } from './reputation.js';
import { formatBerries } from '../core/math.js';

/** 0 no bounty · 1 small fry (unnoticed) · 2 wanted (recognised) · 3 notorious (recognised from afar). */
export function wantedTier(game) {
  const c = game.state?.char;
  const b = c?.bounty || 0;
  if (!b || c.faction === 'marine') return 0;
  const k = bountySea(game);
  if (b < 2500000 * k) return 1;
  if (b < 30000000 * k) return 2;
  return 3;
}

/** Is the player's face hidden (a hood up, and not blown by a fight)? */
export function hooded(game) {
  const c = game.state?.char, p = game.player;
  const hat = c?.equipped?.hat;
  return !!(hat && ITEMS[hat]?.hood) && !(p?.hoodBlownT > 0);
}

export function installWanted(game) {
  const W = game.wanted = { t: 0, spotted: 0, watched: 0, tier: () => wantedTier(game), hooded: () => hooded(game) };
  game.on('tick', (dt) => tick(game, W, dt));
  // fighting (or thieving) in a hood gives your face away
  const blow = () => {
    const p = game.player;
    if (!p || !hooded(game)) return;
    p.hoodBlownT = 40;
    game.log('Your hood slips in the struggle — they\'ve seen your face!', '#ffab91');
  };
  game.on('playerLanded', (tgt) => { if (tgt && (tgt.faction === 'marine' || tgt.faction === 'civilian' || tgt.faction === 'guard')) blow(); });
  game.on('crime', blow);
}

function tick(game, W, dt) {
  const p = game.player;
  if (!p) return;
  if (p.hoodBlownT > 0) p.hoodBlownT = Math.max(0, p.hoodBlownT - dt);
  const tier = wantedTier(game);
  const hood = hooded(game);
  // (older checks — Marine bases, AI targeting — read this flag)
  p.disguised = hood;
  W.spotted = Math.max(0, W.spotted - dt);
  W.t -= dt;
  if (W.t > 0) return;
  const step = 0.25;
  W.t = step;
  let watched = 0;
  const R = tier >= 3 ? 16 : 10;
  const range = hood ? (tier >= 3 ? 4 : 2.5) : R;
  const aboard = p.mode === 'sail' || p.onShip;
  for (const a of game.actorsNear(p.x, p.y, R + 2)) {
    if (a === p || a.faction !== 'marine' || !a.controller || a.state !== 'idle' || a.controller.kind === 'follower') continue;
    if (a.provoked) continue;
    const d = game.world.distance(a.x, a.y, p.x, p.y);
    const inView = tier >= 2 && !aboard && d < range && (!game.world.interiorAt || sameSpace(game, a, p));
    if (!inView) { a.suspect = Math.max(0, (a.suspect || 0) - step * 0.4); continue; }
    const rate = (tier >= 3 ? 1.1 : 0.6) * (1 - (d / range) * 0.6) * (hood ? 0.4 : 1);
    const before = a.suspect || 0;
    a.suspect = before + rate * step;
    if (a.suspect > 0.2) watched++;
    if (before < 0.3 && a.suspect >= 0.3) game.fx.text(a.x, a.y - 2.2, '?', '#fff59d', 0.55, { life: 1.2 });
    if (a.suspect >= 1) recognise(game, a, p);
  }
  W.watched = watched;
}

function sameSpace(game, a, b) {
  const w = game.world;
  return (w.interiorAt(a.x, a.y) || null) === (w.interiorAt(b.x, b.y) || null);
}

/** A Marine knows who you are: the chase is on (and their friends hear it). */
function recognise(game, a, p) {
  const c = game.state.char;
  game.fx.text(a.x, a.y - 2.2, '!', '#ff5252', 0.7, { life: 1.2 });
  const line = [`It's ${c.name}! ${formatBerries(c.bounty)} bounty! Seize them!`, `That face — it's on the wanted posters!`, 'A pirate! Sound the alarm!'][Math.floor(Math.random() * 3)];
  game.fx.text(a.x, a.y - 2.7, line, '#fff', 0.32, { life: 2 });
  game.wanted.spotted = 20;
  const call = (m) => {
    m.provoked = true; m.aggroPlayer = true; m.suspect = 1;
    if (m.controller) { if (m.controller.kind === 'townsfolk' || m.controller.kind === 'wander' || m.controller.kind === 'idle') m.controller.kind = 'hostile'; m.controller.target = p; m.controller.state = 'chase'; }
  };
  call(a);
  for (const m of game.actorsNear(a.x, a.y, 14)) if (m !== a && m.faction === 'marine' && m.state === 'idle' && m.controller && !m.provoked && m.controller.kind !== 'follower') call(m);
  if (!game.wanted.hintShown) {
    game.wanted.hintShown = true;
    game.hint?.('wanted', 'Marines recognise wanted pirates on sight. A hood hides your face — but it slips if you fight or steal in it.');
  }
}
