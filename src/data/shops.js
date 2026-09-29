// Shop stock by type and sea tier. Prices come from items.js, scaled by sea.
import { ITEMS } from './items.js';

export const STOCK = {
  general: ['meat', 'rice_ball', 'fish_stew', 'coconut', 'apple', 'bandage', 'antidote', 'sake', 'bandana', 'headband', 'traveller_hood', 'lucky_charm', 'shell_bracelet', 'den_den_mushi'],
  // (in the four Blues, where everyone's journey starts, the general store keeps a rack of old swords)
  general_blue: ['meat', 'rice_ball', 'fish_stew', 'coconut', 'apple', 'bandage', 'antidote', 'sake', 'wooden_sword', 'rusty_katana', 'bandana', 'headband', 'traveller_hood', 'lucky_charm', 'shell_bracelet', 'den_den_mushi'],
  tavern: ['meat', 'rice_ball', 'fish_stew', 'sake', 'tangerine', 'mango'],
  weapons_blue: ['wooden_sword', 'rusty_katana', 'cutlass', 'slingshot', 'flintlock', 'bo_staff', 'woodsman_axe', 'padded_vest', 'leather_jerkin', 'leather_bracers', 'iron_ring'],
  weapons_grand: ['cutlass', 'fine_katana', 'marine_saber', 'flintlock', 'marine_rifle', 'bo_staff', 'woodsman_axe', 'shigure', 'leather_jerkin', 'chain_shirt', 'hand_wraps', 'iron_ring'],
  weapons_new: ['fine_katana', 'marine_saber', 'marine_rifle', 'shigure', 'seastone_cuffs', 'chain_shirt', 'samurai_armor', 'hand_wraps', 'sea_prism_charm'],
  outfitter: ['bandana', 'traveller_hood', 'black_hood', 'tricorne', 'captain_hat', 'cowboy_hat', 'pink_hat', 'goggles', 'headband', 'captain_coat', 'red_cloak', 'haramaki', 'red_sash', 'gold_earrings', 'shell_bracelet', 'lucky_charm'],
  navigator: ['log_pose', 'den_den_mushi'],
  navigator_grand: ['log_pose', 'new_world_log_pose', 'den_den_mushi'],
  skypiea: ['impact_dial', 'flame_dial', 'breath_dial', 'flash_dial', 'rice_ball', 'fish_stew'],
  fishman: ['fish_stew', 'sea_king_steak', 'pearl', 'pearl_necklace', 'bandage', 'antidote'],
  loguetown_swords: ['wooden_sword', 'rusty_katana', 'cutlass', 'fine_katana', 'yubashiri'],
  black_market: ['rumble_ball', 'seastone', 'seastone_cuffs', 'cola', 'jewels', 'black_hood'],
};

// multiplier on list prices depending on the sea (Grand Line prices are wild)
export const SEA_PRICE = { east_blue: 1, north_blue: 1.1, west_blue: 1.1, south_blue: 1.1, paradise: 1.6, calm_belt: 2, red_line: 3, new_world: 2.4, sky: 1.8, undersea: 2 };

export function stockFor(building, island) {
  const sea = island?.def?.sea || 'east_blue';
  const grand = sea === 'paradise' || sea === 'new_world' || sea === 'calm_belt';
  if (building.shop) return STOCK[building.shop] || building.shop;
  const n = (building.name || '').toLowerCase();
  switch (building.role) {
    case 'tavern': case 'bar': case 'restaurant': case 'cafe': return STOCK.tavern;
    case 'weapons': return n.includes('ipponmatsu') ? STOCK.loguetown_swords : sea === 'new_world' ? STOCK.weapons_new : grand ? STOCK.weapons_grand : STOCK.weapons_blue;
    case 'market': case 'shop':
      // (a navigator's, or a shop that says it sells Log Poses — not any name with "log" in it: "Loguetown Outfitters")
      if (n.includes('navigator') || /\blog[ -]?poses?\b/.test(n)) return grand ? STOCK.navigator_grand : STOCK.navigator;
      if (n.includes('outfit') || n.includes('boutique')) return STOCK.outfitter;
      if (island?.def?.climate === 'sky') return STOCK.skypiea;
      return grand || sea === 'red_line' || sea === 'sky' || sea === 'undersea' ? STOCK.general : STOCK.general_blue;
    default: return STOCK.general;
  }
}

export function priceOf(id, island, char) {
  const d = ITEMS[id];
  if (!d) return 0;
  const sea = island?.def?.sea || 'east_blue';
  let p = (d.price || 0) * (SEA_PRICE[sea] || 1);
  if (char?.traits?.includes('silver_tongue')) p *= 0.9;
  if (char?.liberated?.includes(island?.name)) p *= 0.75; // the islands you freed remember you
  return Math.max(1, Math.round(p / 5) * 5);
}
