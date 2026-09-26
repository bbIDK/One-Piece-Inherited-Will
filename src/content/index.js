// Content registry: NPCs, quests, enemy groups and special events per sea.
import { registerNPCs, registerGroups } from '../game/npcs.js';
import { registerQuests } from '../game/quests.js';
import { installFruits } from './fruits.js';

const PACKS = [];
export function addPack(p) { PACKS.push(p); }

export function installContent(game) {
  for (const p of PACKS) {
    if (p.npcs) registerNPCs(p.npcs);
    if (p.groups) registerGroups(p.groups);
    if (p.quests) registerQuests(p.quests);
  }
  installFruits(game);
  for (const p of PACKS) if (p.install) p.install(game);
}
