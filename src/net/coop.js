// Co-op: the fights you share on a voyage with friends. Everyone's game runs
// its own copy of the world's people (session.js), so a boss you're both
// beating on is two bosses, one on each screen. What keeps them one: a blow
// you land on someone who matters (a boss, a named foe, anyone with a price
// on their head) tells the others how much of them is left, and their copy
// drops to match; and when one of you puts them down, they go down on every
// screen near the fight — and the win counts for everyone who was there: the
// quest step, the bounty, the reward, the breakthrough.
import { num } from './protocol.js';

const SEND_GAP = 0.2; // a boss's health, at most five times a second
const NEAR = 150; // metres: the fight you share is the one you're at

/** Someone whose fight is worth sharing (their health on every screen). */
export const sharedFoe = (a) => !!(a?.npcId && (a.boss || a.named || a.bountyValue || a.def?.story));
/** Someone whose defeat counts for everyone there: those, and any foe a quest might send you after. */
export const sharedKO = (a) => sharedFoe(a) || !!(a?.npcId && (a.hostile || a.def?.hostile));
const down = (a) => a.state === 'knocked' || a.state === 'dead' || !a.alive;

export function installCoop(game) {
  const sentT = new Map();
  const voyage = () => (game.net && !game.net.over && game.net.inWorld ? game.net : null);
  // (a blow of yours, or your crew's)
  const ours = (att) => !!att && (att.isPlayer || (att.crewId && !att.remote) || att.summonedBy?.isPlayer);

  game.on('playerHit', (a) => {
    const v = voyage();
    if (!v || !sharedFoe(a) || down(a)) return;
    const t = game.time, last = sentT.get(a.npcId) ?? -1;
    if (t - last < SEND_GAP) return;
    sentT.set(a.npcId, t);
    v.send({ k: 'bh', id: a.npcId, f: Math.round((a.hp / a.d.maxHp) * 1000) / 1000 });
  });
  game.on('knockout', (a, att) => {
    const v = voyage();
    if (!v || !sharedKO(a) || a._netKO || !ours(att)) return;
    v.send({ k: 'bd', id: a.npcId });
  });

  // a quest's moments (the bell rung, the clue found) — shared with friends on the same island
  let echo = false;
  game.on('questEvent', (name) => {
    const v = voyage(), isl = game.currentIsland?.id;
    if (!v || echo || !isl || typeof name !== 'string') return;
    v.send({ k: 'qe', n: name.slice(0, 60), isl });
  });

  /** Their copy of the foe, here: the one near you, still standing. */
  const find = (id) => {
    const p = game.player;
    if (!p || typeof id !== 'string' || id.length > 80) return null;
    return game.actorsNear(p.x, p.y, NEAR).find((a) => a.npcId === id && !down(a)) || null;
  };

  game.coop = {
    /** A message about a shared fight from a friend's game (session.js receive). */
    receive(m, r) {
      if (m.k === 'qe') {
        // (only where you are too: their bell on another island rings nothing for you)
        if (typeof m.n !== 'string' || m.isl !== game.currentIsland?.id) return;
        echo = true;
        try { game.emit('questEvent', m.n.slice(0, 60)); } finally { echo = false; }
        return;
      }
      const a = find(m.id);
      if (!a) return;
      const p = game.player;
      if (m.k === 'bh') {
        // (never below one: only the blow that ends it, on whoever's screen, ends it)
        const hp = Math.max(1, num(m.f, 0, 1, 1) * a.d.maxHp);
        if (hp < a.hp) { a.hp = hp; a.damageShown = 3; a.provoked = true; }
        return;
      }
      if (m.k === 'bd') {
        // the friend's blow put them down: they go down here too, as yours — you were in it
        a._netKO = true;
        a.introDone = true;
        a.hp = 0;
        a.knockOut(game, p);
        game.log(`${a.name} is down — ${r?.label || 'your crewmate'} landed the last blow. The win is yours too.`, '#ffd54f');
      }
    },
  };
}
