// Cutscenes: the camera taken out of your hands for a few seconds to show
// something — above all a boss, the first time you come face to face with
// them, as the anime does it: the screen letterboxes, the camera swings in
// low round them as they size you up, their name slams onto the screen with
// their title and their bounty, a drum hits, and then it's back to you and
// the fight is on. Space, Enter, E, Esc or a click skips one.
//
// A cutscene is a list of shots, each a camera move over `dur` seconds:
// { focus (an actor), from: { yaw, dist, h }, to: { … }, look (height looked
// at on them) } — yaw relative to the way the focus faces (0: straight in
// front), dist in metres, h the camera's height above their feet. While one
// plays nobody fights (ai.js holds them), you're untouchable, and the HUD
// steps back behind the bars.
import { h } from '../ui/dom.js';
import { wantedPoster } from '../ui/screens.js';

const SKIP = ['Space', 'Enter', 'E', 'Escape'];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** The bounty the way a wanted poster prints it: ฿8,000,000. */
export function bountyText(n) { return n ? `฿${Math.round(n).toLocaleString('en-US')}` : ''; }

/** A boss's intro: three shots round them, their card over the second. */
export function bossIntroShots(boss, player) {
  // (from your side of them, so the first shot has you in the corner of it)
  const toYou = Math.atan2(player.y - boss.y, (player.x - boss.x)) - (boss.facing || 0);
  const s = boss.look?.scale || 1;
  return [
    { focus: boss, from: { yaw: toYou + 0.9, dist: 9 * s, h: 1.2 * s }, to: { yaw: toYou + 0.45, dist: 6.5 * s, h: 1.5 * s }, look: 1.4 * s, dur: 1.4 },
    { focus: boss, from: { yaw: -0.5, dist: 3.4 * s, h: 0.7 * s }, to: { yaw: 0.35, dist: 2.7 * s, h: 0.9 * s }, look: 1.55 * s, dur: 2.3, card: true },
    { focus: boss, from: { yaw: 0.25, dist: 2.6 * s, h: 1.7 * s }, to: { yaw: 0.05, dist: 1.9 * s, h: 1.65 * s }, look: 1.65 * s, dur: 1.0 },
  ];
}

export function installCinematics(game) {
  game.cine = null;

  /** Play a cutscene: { shots, card: { name, title, bounty }, onEnd }. */
  game.playCinematic = (spec) => {
    if (game.cine) endCine(game, false);
    const v = game.view3d;
    const C = { ...spec, t: 0, shot: 0, shotT: 0, prevMode: v?.rig?.mode };
    // (the player seen as the boss sees them: never first person in a cutscene)
    if (v?.rig) v.rig.mode = 'third';
    C.el = h('div.cine', h('div.cine-bar.top'), h('div.cine-bar.bot'), h('div.cine-skip', 'Space to skip'));
    if (spec.card) {
      // (anyone with a price on their head: their wanted poster beside the
      // name, posed the way their bounty and their fights have them)
      let poster = null;
      if (spec.card.bounty && spec.card.look) {
        try { poster = wantedPoster({ name: spec.card.name, look: spec.card.look, bounty: spec.card.bounty, fruit: spec.card.fruit || null, stats: { kills: spec.card.kills ?? 12 }, equipped: { weapons: spec.card.weapons || [] }, inventory: [] }); } catch (e) { poster = null; }
      }
      C.card = h('div.cine-card' + (spec.card.kind === 'meet' ? '.meet' : '') + (poster ? '.has-poster' : ''),
        poster ? h('div.cine-poster', poster) : null,
        h('div.cine-text',
          spec.card.title ? h('div.cine-title', spec.card.title) : null,
          h('div.cine-name', spec.card.name),
          spec.card.bounty && !poster ? h('div.cine-bounty', h('small', 'BOUNTY'), bountyText(spec.card.bounty)) : null));
      C.el.appendChild(C.card);
    }
    document.body.appendChild(C.el);
    requestAnimationFrame(() => C.el.classList.add('on'));
    game.ui?.hud?.classList.add('cine-dim');
    game.cine = C;
    if (spec.mood !== 'meet') game.audio?.hint?.('battle', 12);
  };

  game.on('tick', (dt) => {
    const C = game.cine;
    if (!C) return;
    const inp = game.input, p = game.player;
    if (p) { p.iframes = Math.max(p.iframes || 0, 0.3); p.intent.mx = p.intent.my = 0; }
    if (C.t > 0.4 && SKIP.some((k) => inp?.wasPressed?.(k))) { for (const k of SKIP) inp.consume?.(k); endCine(game, true); return; }
    C.t += dt; C.shotT += dt;
    let S = C.shots[C.shot];
    while (S && C.shotT > S.dur) { C.shotT -= S.dur; C.shot++; S = C.shots[C.shot]; }
    if (!S || !S.focus?.alive) { endCine(game, true); return; }
    // (the card slams on with its shot, a drum under it)
    if (S.card && C.card && !C.card.classList.contains('show')) { C.card.classList.add('show'); game.audio?.sfx?.(C.mood === 'meet' ? 'arrive' : 'boss_intro'); }
    const f = S.focus, w = game.world;
    // (each shot, once: turned as little as it takes for a clear line to the focus — not from behind a wall or a fountain)
    if (S.turn === undefined) S.turn = clearTurn(game, f, (f.facing || 0) + S.from.yaw, Math.max(S.from.dist, S.to.dist));
    const k = ease(Math.min(1, C.shotT / S.dur));
    const yaw = (f.facing || 0) + S.turn + lerp(S.from.yaw, S.to.yaw, k), dist = lerp(S.from.dist, S.to.dist, k), hh = lerp(S.from.h, S.to.h, k);
    const g = (x, y) => game.view3d?.ground?.(x, y) ?? 0;
    const fx = f.x, fy = f.y, base = g(fx, fy) + (f.z || 0);
    const cx = w.wx ? w.wx(fx + Math.cos(yaw) * dist) : fx + Math.cos(yaw) * dist, cy = fy + Math.sin(yaw) * dist;
    // (never under the ground the camera stands over)
    const ch = Math.max(base + hh, g(cx, cy) + 0.4);
    // (the focus turns to face whoever they're sizing up)
    if (p && f !== p && !f._leaning) f.facing = Math.atan2(p.y - f.y, w.dx ? w.dx(f.x, p.x) : p.x - f.x);
    if (game.view3d?.rig) game.view3d.rig.shot = { from: [cx, cy, ch], at: [fx, fy, base + (S.look ?? 1.5)] };
  });
}

/** The least turn (radians) from `yaw` that sees the focus from `dist` away with nothing solid between. */
function clearTurn(game, f, yaw, dist) {
  const w = game.world;
  if (!w?.isBlocked) return 0;
  // (and nobody else standing in the way: a townsman's head filling the shot)
  const others = (game.actorsNear?.(f.x, f.y, dist + 2) || []).filter((a) => a !== f && a !== game.player && a.alive);
  const clear = (a) => {
    for (let i = 1; i <= 10; i++) {
      const r = (i / 10) * dist, x = w.wx ? w.wx(f.x + Math.cos(a) * r) : f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r;
      if (r > 0.8 && w.isBlocked(x, y)) return false;
      if (r > 0.6 && others.some((o) => Math.hypot(w.dx ? w.dx(x, o.x) : o.x - x, o.y - y) < 0.7 * (o.look?.scale || 1))) return false;
    }
    return true;
  };
  for (const d of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.9, -1.9, 2.5, -2.5, Math.PI]) if (clear(yaw + d)) return d;
  return 0;
}

function endCine(game, run) {
  const C = game.cine;
  if (!C) return;
  game.cine = null;
  const v = game.view3d;
  if (v?.rig) { v.rig.shot = null; if (C.prevMode) v.rig.mode = C.prevMode; }
  C.el.classList.remove('on');
  setTimeout(() => C.el.remove(), 450);
  game.ui?.hud?.classList.remove('cine-dim');
  if (run) C.onEnd?.();
}

/**
 * A boss's intro, the first time you come face to face with them (once per
 * character: remembered in their flags). Not at sea, not in a crowd of menus,
 * not when they're already in the thick of a fight.
 */
export function installBossIntros(game) {
  const seenOf = () => { const c = game.state?.char; return c ? (c.flags.bossIntro || (c.flags.bossIntro = {})) : null; };
  const idOf = (b) => b.npcId || b.name;
  const can = (b) => {
    const p = game.player;
    return !!(p && !game.cine && b.alive && b.state === 'idle' && p.mode !== 'sail' && game.view3d?.rig && !game.ui?.blocksInput?.());
  };
  const play = (b) => {
    const seen = seenOf(), p = game.player;
    if (!seen) return false;
    seen[idOf(b)] = 1;
    b.introDone = true;
    game.playCinematic({
      shots: bossIntroShots(b, p),
      card: { name: b.name, title: b.title || '', bounty: b.bountyValue || b.def?.bounty || 0, look: b.look, fruit: b.fruit, weapons: b.def?.weapon ? [b.def.weapon] : [] },
      onEnd: () => { if (b.alertLine) game.fx?.text?.(b.x, b.y - 2.4, b.alertLine, '#ffcdd2', 0.35, { life: 2.6 }); },
    });
    return true;
  };
  /**
   * A boss you haven't been introduced to can't be hurt yet: the first blow
   * (from close or from afar) brings on their intro instead — the fight
   * starts after it, never before (see Actor.takeDamage).
   */
  game.bossIntroPending = (b) => {
    if (!b?.boss || b.introDone) return false;
    const seen = seenOf();
    if (!seen || seen[idOf(b)]) { b.introDone = true; return false; }
    if (!can(b)) return false;
    return play(b);
  };
  let scanT = 0;
  game.on('tick', (dt) => {
    const p = game.player, c = game.state?.char;
    if (!p || !c || game.cine || p.mode === 'sail' || p.state !== 'idle') return;
    if (game.ui?.blocksInput?.() || !game.view3d?.rig) return;
    const seen = seenOf();
    // the one you're fighting, or (every quarter second) any boss you've come
    // near: the intro as you come face to face, before a blow is struck
    let b = game.bossTarget && game.bossTarget.alive && game.bossTarget.state === 'idle' && !seen[idOf(game.bossTarget)] ? game.bossTarget : null;
    if (!b && (scanT -= dt) <= 0) {
      scanT = 0.25;
      let best = 1e9;
      for (const a of game.actorsNear(p.x, p.y, 24)) {
        if (!a.boss || !a.alive || a.state !== 'idle' || a.introDone || seen[idOf(a)] || a.faction === 'player' || a.isPlayer) continue;
        if (!(a.hostile || a.controller?.kind === 'hostile' || a.def?.hostile)) continue;
        if (game.world.roomOf?.(a) !== game.world.roomOf?.(p)) continue;
        const d = game.world.distance(p.x, p.y, a.x, a.y);
        if (d < best) { best = d; b = a; }
      }
    }
    if (!b) return;
    if (game.world.distance(p.x, p.y, b.x, b.y) > 26) return;
    play(b);
  });
}
