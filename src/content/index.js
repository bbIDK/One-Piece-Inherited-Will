// Content registry: NPCs, quests, enemy groups and special events per sea.
// Each pack is a plain object:
//   { id, npcs, groups, quests, items, trainers, stock, archetypes, abilities, dynamicIds, install(game) }
// Registries (items, trainers, shop stock, enemy archetypes, abilities) are
// merged as soon as this module loads so every system sees them.
import { registerNPCs, registerGroups, ARCHETYPES } from '../game/npcs.js';
import { registerQuests } from '../game/quests.js';
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

export const PACKS = [eastBlue, northBlue, westBlue, southBlue, paradise1, paradise2, newWorld, newWorld2];

for (const p of PACKS) {
  if (p.abilities) registerAbilities(p.abilities, 'npc');
  if (p.items) Object.assign(ITEMS, p.items);
  if (p.trainers) Object.assign(TRAINERS, p.trainers);
  if (p.stock) Object.assign(STOCK, p.stock);
  if (p.archetypes) Object.assign(ARCHETYPES, p.archetypes);
}

export function installContent(game) {
  for (const p of PACKS) {
    if (p.npcs) registerNPCs(p.npcs);
    if (p.groups) registerGroups(p.groups);
    if (p.quests) registerQuests(p.quests);
  }
  installFruits(game);
  for (const p of PACKS) if (p.install) p.install(game);
}
