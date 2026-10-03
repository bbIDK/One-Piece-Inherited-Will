// Searching the fallen. Everyone you knock out — pirates, bandits, Marines,
// thugs, wild beasts — carries something: berries, food, medicine, the weapon
// they fought with, the odd trinket. Walk up and press E to search them and
// take what you want. Bodies don't lie about for ever: a couple of minutes
// later they're gone (dragged off, or come to and crawled away), sooner once
// you've picked them clean.
import { ITEMS } from '../data/items.js';
import { addItem, earn } from './inventory.js';
import { crime, bountySea } from './reputation.js';
import { openLoot } from '../ui/loot.js';

const BODY_TIME = 120, EMPTY_TIME = 25, FADE = 2;

export function installLoot(game) {
  game.on('knockout', (a) => { if (lootable(a)) { a.pocket = a.pocket || pocketOf(game, a); a.bodyT = 0; } });
  game.on('tick', (dt) => tick(game, dt));
  const prevFoot = game.footInteraction;
  game.footInteraction = (p) => {
    const other = prevFoot ? prevFoot(p) : null;
    const a = nearestBody(game, p);
    if (!a) return other;
    const d = game.world.distance(p.x, p.y, a.x, a.y);
    const mine = { d: d - 0.3, x: a.x, y: a.y, label: `Search ${a.name}`, run: () => search(game, a) };
    return !other || mine.d <= other.d ? mine : other;
  };
}

/** Ordinary folk and foes can be searched (not crewmates, quest people, Sea Kings…). */
function lootable(a) {
  if (!a || a.isPlayer || a.faction === 'player' || a.seaCreature || a.look?.race === 'seaking') return false;
  if (a.controller?.kind === 'follower' || a.crewId || a.summonedBy || a.spar) return false;
  if (a.talk || a.recoverAfter || a.canCarry || a.def?.duel) return false;
  return true;
}

/** What someone was carrying, by what they are. */
function pocketOf(game, a) {
  const lvl = a.attrs?.str || a.def?.level || 5;
  const seaK = Math.min(3, 0.5 + bountySea(game) * 0.4);
  const f = a.faction, beast = f === 'beast' || !!a.def?.beast;
  const items = [];
  const give = (id, n = 1) => { if (ITEMS[id]) { const e = items.find((x) => x.id === id); if (e) e.qty += n; else items.push({ id, qty: n }); } };
  const r = Math.random;
  let berries = 0;
  if (beast) {
    give('meat', 1 + (r() < 0.5 ? 1 : 0));
  } else {
    const purse = f === 'pirate' || f === 'bandit' || f === 'baroque' || f === 'rival' ? 1 : f === 'marine' || f === 'cp' ? 0.6 : 0.35;
    berries = Math.round((40 + r() * 140) * (1 + lvl / 8) * seaK * purse);
    // the weapon they fought with
    const w = a.weapon?.kind;
    if (w && r() < (a.named || a.boss ? 0.6 : 0.3)) {
      const high = lvl >= 25, mid = lvl >= 12;
      // (the sword you saw in their hand, if it's one anyone could own)
      const held = a.weapon.ids?.[0], own = held && ITEMS[held] && !ITEMS[held].unique && ITEMS[held].kind === w ? held : null;
      const id = own || (w === 'sword' ? (f === 'marine' ? 'marine_saber' : high ? 'fine_katana' : mid ? 'cutlass' : 'rusty_katana')
        : w === 'gun' ? (f === 'marine' ? 'marine_rifle' : 'flintlock')
          : w === 'staff' ? 'bo_staff' : w === 'axe' ? 'woodsman_axe' : null);
      if (id) give(id);
    }
    if (r() < 0.4) give(f === 'marine' ? 'rice_ball' : r() < 0.5 ? 'meat' : 'sake');
    if (r() < (f === 'marine' ? 0.35 : 0.2)) give('bandage');
    if (f === 'pirate' || f === 'bandit') { if (r() < 0.1) give('gold_coins'); if (r() < 0.03) give('jewels'); }
    if (f === 'marine' && r() < 0.05) give('marine_cap');
    if (f === 'civilian' && r() < 0.3) give(r() < 0.5 ? 'apple' : 'rice_ball');
    if (a.named || a.boss) { berries = Math.round(berries * 2.5); if (r() < 0.5) give(r() < 0.4 ? 'jewels' : 'gold_coins'); }
  }
  return { berries, items };
}

function empty(a) { return !a.pocket || (!a.pocket.berries && !a.pocket.items.length); }

function nearestBody(game, p) {
  if (p.mode !== 'foot' || p.state !== 'idle') return null;
  let best = null, bd = 1.9;
  for (const a of game.actorsNear(p.x, p.y, 2.2)) {
    if (a.state !== 'knocked' || !a.pocket || empty(a) || a.fading) continue;
    const d = game.world.distance(p.x, p.y, a.x, a.y);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

function search(game, a) {
  a.searched = true;
  openLoot(game, a, {
    take(which) {
      const pk = a.pocket;
      if (!pk) return;
      if (which === 'berries' || which === 'all') { if (pk.berries) earn(game, pk.berries, `${a.name}'s purse`); pk.berries = 0; }
      const list = which === 'all' ? pk.items.slice() : pk.items.filter((x) => x.id === which);
      for (const it of list) { addItem(game, it.id, it.qty); pk.items = pk.items.filter((x) => x !== it); }
      // going through an unconscious townsperson's pockets is theft
      if (a.faction === 'civilian' && !a.robbed) { a.robbed = true; crime(game, 150000, 'robbed someone lying senseless', { rep: 3 }); }
      game.audio?.sfx('coin');
    },
  });
}

function tick(game, dt) {
  for (const a of game.actors) {
    if (a.state !== 'knocked' || a.bodyT === undefined || a.isPlayer) continue;
    a.bodyT += dt;
    const limit = empty(a) ? EMPTY_TIME : BODY_TIME;
    if (a.bodyT > limit) {
      a.fading = true;
      a.fadeAlpha = Math.max(0, 1 - (a.bodyT - limit) / FADE);
      if (a.fadeAlpha <= 0) a.alive = false;
    }
  }
}
