// Quest givers are staged, not stood about. The way story games set up the
// people who send you off on something (an RPG's quest giver, the anime's
// first look at a character): each one is placed with a reason to be there
// and a pose that says who they are, they notice you when you come near, and
// the first time you meet one of the main story's people the camera
// introduces them — a wide shot across to them, then in close as they turn
// to you, their name and what they are across the screen.
//
//   staging — out in town they lean back against a wall facing the street
//     (not stood in the middle of it); indoors they face the door you come
//     in by (not the back wall); Marines keep to attention, scholars to
//     their thinking. Their stance (npcs.js stanceFor) is kept where there's
//     no wall to lean on.
//   noticing — within a few steps they turn to you: head and shoulders from
//     a wall they're leaning on, all the way round if they're standing; once
//     you've gone, back the way they were.
//   meeting — until you've met them their name is "???" over their head;
//     the first time you talk to one the camera introduces them (a short
//     cutscene) and the conversation follows. A few — the legends you run
//     into (introOnSight, cameos) — are introduced as soon as you come near.
import { spotsOf } from './townlife.js';

const NOTICE = 8, FORGET = 12, MEET = 9;
const LEAN_TURN = 1.0; // (how far round someone leaning on a wall turns to you: radians)

/** Is this someone who gives you quests (and should look like it)? */
export function isQuestGiver(a) {
  const d = a.def;
  if (!d || a.isPlayer || a.townsfolk || a.crewId || d.hostile || d.boss || d.shop || d.role === 'shop' || d.role === 'vendor' || d.role === 'inn') return false;
  return !!(d.story || d.marker || d.trainer || a.questMarker);
}

const wrapA = (x) => Math.atan2(Math.sin(x), Math.cos(x));

export function installQuestGivers(game) {
  const Q = { t: 0 };
  game.questGivers = Q;

  /** Give them their place: a wall to lean on, or the door to face. */
  const stage = (a) => {
    a._staged = true;
    const w = game.world;
    // indoors: looking at the door you'll come in by
    if (a.homeB && a.homeB.door) {
      const d = a.homeB.door;
      a.facing = a.faceHome = Math.atan2(d.y - a.y, w.dx(a.x, d.x));
      a._stageFace = a.faceHome;
      return;
    }
    const st = a.act3d?.pose;
    // (a Marine stays at attention, a scholar thinking, someone at work at it)
    if (st === 'attention' || st === 'think' || (a.act3d && !a.act3d.stance)) { a._stageFace = a.faceHome ?? a.facing; return; }
    const isl = game.currentIsland;
    let best = null, bd = 14;
    for (const town of isl?.towns || []) {
      if (w.distance(a.x, a.y, town.x, town.y) > 160) continue;
      const S = spotsOf(game, town, isl);
      for (const s of S.wall) {
        if (s.taken && s.taken !== a) continue;
        const dd = w.distance(a.x, a.y, s.x, s.y);
        if (dd < bd) { bd = dd; best = s; }
      }
    }
    if (best) {
      best.taken = a;
      a.x = best.x; a.y = best.y; a.vx = a.vy = 0;
      a.facing = a.faceHome = best.face;
      if (a.controller?.home) a.controller.home = { x: best.x, y: best.y };
      a.stationary = true;
      a.act3d = { pose: 'lean', prop: null, h: 0, stance: true };
      a._leaning = true;
    }
    a._stageFace = a.faceHome ?? a.facing;
  };

  game.on('tick', (dt) => {
    const p = game.player, w = game.world, c = game.state?.char;
    if (!p || !w || !c) return;
    // (staging: a few at a time, as they come into the world)
    if ((Q.t -= dt) <= 0) {
      Q.t = 0.5;
      for (const a of game.actorsNear(p.x, p.y, 90)) if (a.alive && !a._staged && a.state === 'idle' && isQuestGiver(a)) stage(a);
    }
    for (const a of game.actorsNear(p.x, p.y, FORGET + 2)) {
      if (!a._staged || !a.alive || a.state !== 'idle' || a.controller?.target || a.activity) continue;
      const d = w.distance(a.x, a.y, p.x, p.y);
      const home = a._stageFace ?? a.faceHome;
      let want = home;
      if (d < NOTICE || (a._noticed && d < FORGET)) {
        a._noticed = true;
        const to = Math.atan2(p.y - a.y, w.dx(a.x, p.x));
        // (from a wall, head and shoulders round; standing, all the way)
        want = a._leaning ? home + Math.max(-LEAN_TURN, Math.min(LEAN_TURN, wrapA(to - home))) : to;
      } else a._noticed = false;
      if (want === undefined) continue;
      const cur = a.faceHome ?? a.facing;
      a.faceHome = cur + wrapA(want - cur) * Math.min(1, dt * 3);
    }
    // who you haven't met yet: "???" over their head (chars3d labels, interact.js)
    const met0 = c.flags.metIntro || (c.flags.metIntro = {});
    for (const a of game.actorsNear(p.x, p.y, 40)) if (a._staged) a.unmet = !!a.npcId && !met0[a.npcId];
    // the legends: introduced on sight
    if (game.cine || game.ui?.blocksInput?.() || p.inCombat || p.mode !== 'foot' || p.state !== 'idle' || !game.view3d?.rig || game.bossTarget) return;
    const met = c.flags.metIntro || (c.flags.metIntro = {});
    for (const a of game.actorsNear(p.x, p.y, MEET)) {
      if (!a._staged || !a.alive || a.state !== 'idle' || !a.npcId || met[a.npcId]) continue;
      if (!onSight(a) || hidden(game, a, p)) continue;
      if (w.distance(a.x, a.y, p.x, p.y) > MEET) continue;
      met[a.npcId] = 1;
      game.playCinematic({
        mood: 'meet',
        shots: meetShots(a, p, w),
        card: { name: a.name, title: a.def?.title || a.title || '', kind: 'meet' },
      });
      break;
    }
  });
  /**
   * Talking to someone you haven't met: their introduction first, then the
   * conversation. True when it's taken care of (talk again once it ends).
   */
  Q.introOnTalk = (a) => {
    const c = game.state?.char, p = game.player;
    if (!c || !a?.npcId || !a.unmet || game.cine || !game.view3d?.rig || p?.mode !== 'foot') return false;
    const met = c.flags.metIntro || (c.flags.metIntro = {});
    met[a.npcId] = 1; a.unmet = false;
    // (not one for everybody: the legends, and anyone marked for it — and
    // never where the camera can't get at them, indoors behind walls)
    if (!(onSight(a) || a.def?.introCutscene) || hidden(game, a, p)) return false;
    game.playCinematic({
      mood: 'meet',
      shots: meetShots(a, p, game.world),
      card: { name: a.name, title: a.def?.title || a.title || '', kind: 'meet' },
      onEnd: () => { if (a.alive) game.emit('talk', a); },
    });
    return true;
  };
  return Q;
}

/** Indoors (they or you): the shots swing out to 7 m and would be looking at a wall. */
function hidden(game, a, p) {
  const w = game.world;
  return !!(w.roomOf?.(a) || w.roomOf?.(p));
}

/** The ones you're introduced to just by coming near: legends, cameos. */
function onSight(a) {
  const d = a.def || {};
  return !!(d.introOnSight || /cameo|shanks|mihawk|whitebeard|garp|dragon_|roger/.test(a.npcId || ''));
}

/** A first meeting: across to them from over your shoulder, then in close as they look round at you. */
export function meetShots(a, p, w) {
  const toYou = Math.atan2(p.y - a.y, w ? w.dx(a.x, p.x) : p.x - a.x) - (a.facing || 0);
  const s = a.look?.scale || 1;
  return [
    { focus: a, from: { yaw: toYou + 0.3, dist: 7.5 * s, h: 1.9 * s }, to: { yaw: toYou + 0.12, dist: 5.6 * s, h: 1.7 * s }, look: 1.3 * s, dur: 1.5 },
    { focus: a, from: { yaw: 0.55, dist: 2.6 * s, h: 1.55 * s }, to: { yaw: 0.3, dist: 2.1 * s, h: 1.6 * s }, look: 1.55 * s, dur: 2.6, card: true },
  ];
}
