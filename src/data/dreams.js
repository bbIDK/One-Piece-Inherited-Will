// Legends: great feats any character can achieve. Nobody chooses a goal —
// the sea is free — but the world remembers those who do the impossible.
// Each legend fulfilled adds Inherited Will when the lineage passes on.
export const LEGENDS = {
  king: {
    name: 'King of the Pirates',
    desc: 'Find the One Piece on Laugh Tale, the final island of the Grand Line.',
    check: (c) => !!c.flags?.laughTale,
    progress: (c) => [Math.min(4, (c.inventory || []).filter((i) => i.id === 'poneglyph_rubbing').reduce((s, i) => s + (i.qty || 1), 0)), 4, 'Road Poneglyph rubbings'],
    will: 150,
  },
  swordsman: {
    name: "World's Greatest Swordsman",
    desc: 'Defeat "Hawk-Eyes" Dracule Mihawk in a duel.',
    check: (c) => (c.bosses || []).includes('mihawk'),
    will: 90,
  },
  admiral: {
    name: 'Admiral of the Marines',
    desc: 'Rise through the Marines to the rank of Admiral.',
    check: (c) => c.marineRank === 'Admiral' || c.marineRank === 'Fleet Admiral',
    will: 90,
  },
  fleet_admiral: {
    name: 'Fleet Admiral',
    desc: 'Command every Marine in the world.',
    check: (c) => c.marineRank === 'Fleet Admiral',
    will: 120,
  },
  all_blue: {
    name: 'The All Blue',
    desc: 'Find the legendary sea where the fish of all four Blues meet.',
    check: (c) => !!c.flags?.allBlue,
    will: 80,
  },
  world_map: {
    name: 'Map of the World',
    desc: 'Chart 60 islands with your own eyes.',
    check: (c) => (c.discovered || []).length >= 60,
    progress: (c) => [(c.discovered || []).length, 60, 'islands charted'],
    will: 70,
  },
  warrior: {
    name: 'Brave Warrior of the Sea',
    desc: 'Defeat 12 great foes.',
    check: (c) => (c.bosses || []).length >= 12,
    progress: (c) => [(c.bosses || []).length, 12, 'great foes defeated'],
    will: 70,
  },
  true_history: {
    name: 'The True History',
    desc: 'Read 8 Poneglyphs and learn what happened in the Void Century.',
    check: (c) => (c.flags?.poneglyphsRead || 0) >= 8,
    progress: (c) => [c.flags?.poneglyphsRead || 0, 8, 'Poneglyphs read'],
    will: 80,
  },
  liberation: {
    name: 'Liberator',
    desc: 'Free 6 places from their tyrants.',
    check: (c) => (c.liberated || []).length >= 6,
    progress: (c) => [(c.liberated || []).length, 6, 'places liberated'],
    will: 70,
  },
  emperor: {
    name: 'Emperor of the Sea',
    desc: 'Carry a bounty of over 3,000,000,000 berries.',
    check: (c) => (c.bounty || 0) >= 3000000000,
    progress: (c) => [Math.floor((c.bounty || 0) / 1e6), 3000, 'million berries'],
    will: 100,
  },
};
export const LEGEND_IDS = Object.keys(LEGENDS);
// older saves and code paths
export const DREAMS = LEGENDS;
export const DREAM_IDS = LEGEND_IDS;
