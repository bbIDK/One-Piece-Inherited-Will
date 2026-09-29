// Content registry: NPCs, quests, enemy groups and special events per sea.
// Each pack is a plain object:
//   { id, npcs, groups, quests, places, items, trainers, stock, archetypes, abilities, dynamicIds, install(game) }
// (places: where the events that finish quest steps happen, for their
// waypoints — see quests.js registerPlaces)
// Registries (items, trainers, shop stock, enemy archetypes, abilities) are
// merged as soon as this module loads so every system sees them.
import { registerNPCs, registerGroups, ARCHETYPES, sizeBuildingsForOccupants } from '../game/npcs.js';
import { registerQuests, registerPlaces } from '../game/quests.js';
import { registerAbilities } from '../game/abilities.js';
import { ITEMS } from '../data/items.js';
import { TRAINERS } from '../data/trainers.js';
import { STOCK } from '../data/shops.js';
import { installFruits } from './fruits.js';
import './bossMoves.js';
import eastBlue from './eastBlue.js';
import northBlue from './northBlue.js';
import westBlue from './westBlue.js';
import southBlue from './southBlue.js';
import paradise1 from './paradise1.js';
import paradise2 from './paradise2.js';
import newWorld from './newWorld.js';
import newWorld2 from './newWorld2.js';
import redLine from './redLine.js';
import mainStory from './mainStory.js';

export const PACKS = [eastBlue, northBlue, westBlue, southBlue, paradise1, paradise2, newWorld, newWorld2, redLine, mainStory];

for (const p of PACKS) {
  if (p.abilities) registerAbilities(p.abilities, 'npc');
  if (p.items) Object.assign(ITEMS, p.items);
  if (p.trainers) Object.assign(TRAINERS, p.trainers);
  if (p.stock) Object.assign(STOCK, p.stock);
  if (p.stockAdd) for (const [k, list] of Object.entries(p.stockAdd)) (STOCK[k] = STOCK[k] || []).push(...list);
  if (p.archetypes) Object.assign(ARCHETYPES, p.archetypes);
}

export function installContent(game) {
  for (const p of PACKS) {
    if (p.npcs) registerNPCs(p.npcs);
    if (p.groups) registerGroups(p.groups);
    if (p.quests) registerQuests(p.quests);
    if (p.places) registerPlaces(p.places);
  }
  installFruits(game);
  for (const p of PACKS) if (p.install) p.install(game);
  // (the houses of very tall people are built to fit them: see npcs.js)
  if (game.surface) sizeBuildingsForOccupants(game.surface);
}
