// The shipwright on every harbour pier, in a carpenter's working clothes on
// the pier head's shoulder (see islandgen.js shipwrightStand). Talk to one
// (E) and there are three things to say: have one of your ships brought
// round to this pier ("Spawn ship"), buy a new one ("Buy ships"), or
// goodbye. The yards are where new ships come from, and any of them can
// fetch any ship you own (see fleet.js).
import { makeNPC } from './npcs.js';
import { randomName, townRaces } from './spawner.js';
import { RNG } from '../core/rng.js';
import { openShipwright, pierName } from '../ui/shipwrightPanel.js';

const TOPS = ['#eceff1', '#f5f5f5', '#8d6e63', '#607d8b', '#ffe0b2', '#90a4ae'];
const BOTTOMS = ['#37474f', '#4e342e', '#1e3a5f', '#5d4037', '#455a64'];
const HATS = [['bandana', '#1565c0'], ['bandana', '#c62828'], ['headband', '#fafafa'], ['cap', '#6d8f5e'], ['goggles', '#8d6e63'], ['bandana', '#f9a825']];
const HELLO = [
  '"Ahoy! Every hull on this pier is mine to mind. Want one of yours brought round — or a new one off the slipway?"',
  '"Mind the tar, it\'s fresh. Now: fetch you one of your ships, or have a look at what I\'ve got for sale?"',
  '"Hah! Sea legs and empty hands. Let me guess — you want a ship."',
  '"Any ship you own, I can have her here by the next tide. Any ship you don\'t, I can sell you."',
];

/** Spawner builder: a shipwright on every pier of an island (on the surface; the zones have none). */
export function shipwrightBuilder(ctx) {
  const { island, game, list } = ctx;
  if (game.world !== game.surface || !island.docks?.length) return;
  island.docks.forEach((dock, i) => {
    const st = dock.stand;
    if (!st) return;
    const at = game.spawner.freeSpot(st.x, st.y) ? st : game.spawner.findFree(st.x, st.y, 1.2);
    if (!at) return;
    const a = makeShipwright(island, dock, i, at.x, at.y);
    a.facing = a.faceHome = st.face;
    a.game = game;
    game.addActor(a);
    list.push(a);
  });
}

function makeShipwright(island, dock, i, x, y) {
  const rng = new RNG(`${island.id}:shipwright:${i}`);
  const race = rng.weighted(island.def?.population || townRaces(island));
  const hat = rng.pick(HATS);
  const def = {
    name: `Shipwright ${randomName(rng, race).split(' ')[0]}`,
    title: pierName(dock, island).replace(/^the (.)/, (m, c) => c.toUpperCase()),
    race, faction: 'civilian', level: 8, ai: 'idle', seed: rng.int(1, 1e9),
    // (a carpenter's working clothes: rolled-up sleeves or none, work trousers, a tool belt and boots)
    look: {
      fem: rng.chance(0.2), topStyle: rng.pick(['tank', 'tee', 'shirt', 'vest']), top: rng.pick(TOPS),
      bottomStyle: rng.pick(['baggy', 'trousers', 'capri']), bottom: rng.pick(BOTTOMS),
      waist: 'belt', shoeStyle: 'boots', hat: hat[0], hatColor: hat[1], muscle: +(0.7 + rng.next() * 0.3).toFixed(2),
    },
    dialogue: (ctx) => talk(ctx.game, ctx.npc),
  };
  const a = makeNPC(def, x, y);
  a.invulnerable = true;
  a.shipwright = { dock, island, hello: rng.pick(HELLO) };
  return a;
}

/** Spawn ship, Buy ships, Goodbye. */
function talk(game, npc) {
  const sw = npc?.shipwright;
  if (!sw) return null;
  const open = (tab) => () => { game.dialogue.close(); openShipwright(game, { dock: sw.dock, island: sw.island, npc, tab }); };
  return { start: 'a', nodes: { a: {
    text: sw.hello,
    choices: [
      { text: 'Spawn ship', do: open('spawn'), end: true },
      { text: 'Buy ships', do: open('buy'), end: true },
      { text: 'Goodbye', end: true },
    ],
  } } };
}
