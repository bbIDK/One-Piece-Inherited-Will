// The Red Line: Mary Geoise, the Holy Land on top of the world.
import { findActor, aggro, spawnNow } from './helpers.js';

const npcs = [
  {
    id: 'saint_mjosgard', name: 'Saint Donquixote Mjosgard', title: 'Celestial Dragon', island: 'mary_geoise', at: { town: 'holy_land', plaza: true, ox: -3 },
    look: { hair: 'short', hairColor: '#fafafa', top: '#fafafa', bottom: '#eceff1', coat: '#fafafa', hat: 'bubble' }, level: 5, ai: 'idle',
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"...You are not a Celestial Dragon, and yet you do not kneel. Good. Long ago, a Fish-Man queen named Otohime saved my life when my own kind left me to die. I have not forgotten. Most of the people up here never learned anything."',
        choices: [
          { text: 'Tell me about the Holy Land.', next: 'b' },
          { text: 'What is the Empty Throne?', next: 'c' },
          { text: 'Goodbye.', end: true },
        ] },
      b: { text: '"Eight hundred years ago, twenty kings founded the World Government and came to live here, above everyone. Their descendants call themselves gods. Every four years the kings of the world gather here for the Reverie — and every four years, someone disappears."', next: 'a' },
      c: { text: '"A symbol: the twenty kings swore that no one would sit on it, so that no one would rule the world alone. ...Or so we are told. Some nights, I swear I hear footsteps in the Pangaea Castle that belong to no one I know."', next: 'a' },
    } }),
  },
  {
    id: 'saint_shalria', name: 'Saint Shalria', title: 'Celestial Dragon', island: 'mary_geoise', at: { town: 'holy_land', plaza: true, ox: 3 },
    look: { hair: 'long', hairColor: '#fff59d', top: '#fafafa', bottom: '#f5f5f5', hat: 'bubble' }, level: 3, ai: 'idle',
    when: (c) => !c.flags.punchedDragon,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Kneel, commoner! You are breathing the same air as a World Noble! ...And you, fetch me a new slave. This one broke."',
        choices: [
          { text: '(Kneel and keep your head down.)', end: true },
          { text: '(Punch the Celestial Dragon.)', do: (c) => {
            const g = c.game;
            c.setFlag('punchedDragon');
            const a = findActor(g, 'saint_shalria');
            if (a) { a.knock(8, 2); a.state = 'knocked'; a.hp = 1; }
            g.fx.impactFrame(0.3); g.fx.shake(1);
            g.ui.banner('YOU STRUCK A WORLD NOBLE', 'Mary Geoise', 'Bells ring across the Holy Land. An Admiral is on the way.', 6);
            g.progression.addBounty(300000000, 'Assaulted a Celestial Dragon');
            if (c.char.faction === 'marine') { c.char.faction = 'pirate'; c.char.marineRank = null; c.char.flags.deserter = true; }
            for (const id of ['cp0_guard_1', 'cp0_guard_2']) { const cp = spawnNow(g, id); if (cp) aggro(g, cp); }
          }, end: true },
        ] },
    } }),
  },
  { id: 'cp0_guard_1', name: 'CP0 Agent', title: 'Cipher Pol Aigis Zero', island: 'mary_geoise', at: { town: 'holy_land', building: 'Pangaea Castle' }, faction: 'cp', level: 70, named: true,
    look: { hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa', coat: '#fafafa', hat: 'bubble' }, style: 'rokushiki', moves: ['roku_soru', 'roku_rankyaku', 'roku_tekkai', 'roku_rokuogan'], skill: 0.7,
    haki: { armament: 40, observation: 40 }, lethal: true, when: (c) => !!c.flags.punchedDragon, hostile: true },
  { id: 'cp0_guard_2', name: 'CP0 Agent', title: 'Cipher Pol Aigis Zero', island: 'mary_geoise', at: { town: 'holy_land', building: 'Reverie Assembly Hall' }, faction: 'cp', level: 70, named: true,
    look: { hair: 'long', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa', coat: '#fafafa' }, style: 'rokushiki', moves: ['roku_soru', 'roku_kamie', 'roku_rankyaku'], skill: 0.7,
    haki: { armament: 40, observation: 40 }, lethal: true, when: (c) => !!c.flags.punchedDragon, hostile: true },
];

const items = {
  wg_permit: { name: 'Holy Land Permit (forged)', icon: '📜', type: 'key', price: 50000000, desc: 'A very good forgery of a World Government travel permit. The Red Port guards will let you ride the Bondola — and carry your ship over the Red Line.' },
};

// the Holy Land's permit can be bought — for a fortune — on the black market
export default { id: 'redLine', npcs, items, stockAdd: { black_market: ['wg_permit'] } };
