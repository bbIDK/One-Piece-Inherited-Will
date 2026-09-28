// Ship classes. Speeds in tiles/second at full sail with a following wind
// (a rowboat has no sail: her speed is what a good pull on the oars gives).
export const SHIPS = {
  dinghy: {
    name: 'Rowboat', desc: 'A little open boat with no sail: you row her with a pair of oars, wind or no wind. Fine for the Blues — suicide in the Grand Line.',
    length: 2.8, beam: 1.2, hull: 60, speed: 7, turn: 2.2, masts: 0, sail: null, oarsOnly: true, cannons: 0, crew: 1, cargo: 4,
    price: 900, stormResist: 0.2, grandLine: false, color: '#9a6a3c',
  },
  sloop: {
    name: 'Sloop', desc: 'A nimble single-masted boat. Enough to reach Loguetown in style.',
    length: 4.4, beam: 1.7, hull: 150, speed: 9.5, turn: 2.0, masts: 1, sail: 'fore', cannons: 2, crew: 3, cargo: 10,
    price: 14000, stormResist: 0.45, grandLine: true, color: '#8d5b33',
  },
  caravel: {
    name: 'Caravel', desc: 'A sturdy two-masted caravel with a ram figurehead — the kind of ship a crew grows to love.',
    length: 5.6, beam: 2.2, hull: 260, speed: 10.8, turn: 1.7, masts: 2, sail: 'square', cannons: 4, crew: 6, cargo: 18,
    price: 48000, stormResist: 0.6, grandLine: true, figurehead: 'ram', color: '#a0703c',
  },
  brigantine: {
    name: 'Brigantine', desc: 'Two masts, eight guns and a hold for plunder.',
    length: 6.8, beam: 2.5, hull: 400, speed: 11.8, turn: 1.4, masts: 2, sail: 'square', cannons: 8, crew: 10, cargo: 26,
    price: 150000, stormResist: 0.7, grandLine: true, color: '#7b4a2a',
  },
  frigate: {
    name: 'Frigate', desc: 'A three-masted warship built for the New World.',
    length: 8.2, beam: 2.9, hull: 600, speed: 12.4, turn: 1.15, masts: 3, sail: 'square', cannons: 14, crew: 16, cargo: 34,
    price: 450000, stormResist: 0.8, grandLine: true, color: '#5d3a1f',
  },
  galleon: {
    name: 'Galleon', desc: 'A floating fortress. Slow to turn, impossible to sink.',
    length: 9.6, beam: 3.4, hull: 850, speed: 11.2, turn: 0.9, masts: 3, sail: 'square', cannons: 20, crew: 24, cargo: 50,
    price: 950000, stormResist: 0.85, grandLine: true, color: '#4e342e',
  },
  adam_brig: {
    name: 'Adam-wood Brig', desc: 'Built from the Treasure Tree Adam by a Water 7 master shipwright. Paddle wheels, a Coup de Burst, and a lion that roars.',
    length: 7.4, beam: 2.9, hull: 1000, speed: 14, turn: 1.5, masts: 2, sail: 'square', cannons: 6, crew: 12, cargo: 30,
    price: 0, stormResist: 0.95, grandLine: true, figurehead: 'lion', coupDeBurst: true, paddle: true, color: '#b07d48', special: true,
  },
  marine_warship: {
    name: 'Marine Warship', desc: 'A seastone-bottomed battleship. Sea Kings mistake it for a rock.',
    length: 9.2, beam: 3.1, hull: 800, speed: 12, turn: 1.0, masts: 3, sail: 'marine', cannons: 18, crew: 30, cargo: 30,
    price: 0, stormResist: 0.85, grandLine: true, seastone: true, figurehead: 'seagull', color: '#f5f6fa', special: true,
  },
  // ---- the big ships: One Piece scale, with decks you can hold a feast on
  carrack: {
    name: 'Carrack', desc: 'A deep-bellied three-master with high castles fore and aft: the workhorse of the Grand Line trade routes, with room for a real crew and a hold you could get lost in.',
    length: 16, beam: 5.2, hull: 1400, speed: 11.6, turn: 0.95, masts: 3, sail: 'square', cannons: 12, crew: 20, cargo: 90,
    price: 1800000, stormResist: 0.88, grandLine: true, color: '#8a5a32', figurehead: 'mermaid', big: true,
  },
  war_galleon: {
    name: 'War Galleon', desc: 'Two gun decks, a towering stern castle and a deck big enough for a party: the kind of ship a Supernova crosses the Grand Line in.',
    length: 24, beam: 7, hull: 2600, speed: 12.2, turn: 0.8, masts: 3, sail: 'square', cannons: 32, crew: 45, cargo: 140,
    price: 5200000, stormResist: 0.92, grandLine: true, color: '#5b3a24', figurehead: 'dragon', big: true,
  },
  man_o_war: {
    name: 'Man-o\'-War', desc: 'A three-decked giant bristling with guns, her poop deck higher than most ships\' mastheads. Fleets scatter when she shows her colours.',
    length: 32, beam: 9, hull: 4200, speed: 12.6, turn: 0.64, masts: 3, sail: 'square', cannons: 56, crew: 90, cargo: 200,
    price: 12000000, stormResist: 0.95, grandLine: true, color: '#3f2a1c', figurehead: 'lion_gold', big: true,
  },
  great_galleon: {
    name: 'Great Galleon', desc: 'A Yonko\'s flagship: a white whale of a four-master with a whale\'s head for a bow. A whole pirate fleet could live aboard.',
    length: 44, beam: 12, hull: 7000, speed: 12.8, turn: 0.5, masts: 4, sail: 'square', cannons: 80, crew: 160, cargo: 320,
    price: 30000000, stormResist: 0.98, grandLine: true, color: '#f1ece0', figurehead: 'whale', big: true,
  },
  marine_battleship: {
    name: 'Marine Battleship', desc: 'A Vice Admiral\'s flagship: a great grey-and-white warship with a seagull at the bow, MARINE across her sails and a seastone keel.',
    length: 38, beam: 10.5, hull: 6000, speed: 13, turn: 0.55, masts: 3, sail: 'marine', cannons: 64, crew: 140, cargo: 120,
    price: 0, stormResist: 0.96, grandLine: true, seastone: true, figurehead: 'seagull', color: '#f5f6fa', special: true, big: true,
  },
};

export const SHIP_UPGRADES = {
  hull_plating: { name: 'Iron Hull Plating', desc: '+30% hull strength.', price: 20000, apply: (s) => { s.hullMul = (s.hullMul || 1) * 1.3; } },
  better_sails: { name: 'Fine Canvas Sails', desc: '+10% top speed.', price: 16000, apply: (s) => { s.speedMul = (s.speedMul || 1) * 1.1; } },
  extra_cannons: { name: 'Extra Cannons', desc: '+2 cannons per broadside.', price: 25000, apply: (s) => { s.extraCannons = (s.extraCannons || 0) + 2; } },
  seastone_keel: { name: 'Seastone Keel', desc: 'Sea Kings rarely notice you in the Calm Belt.', price: 300000, apply: (s) => { s.seastone = true; } },
  oars: { name: 'Rowing Sweeps', desc: 'Move at 45% speed without wind (Calm Belt).', price: 9000, apply: (s) => { s.oars = true; } },
  coating: { name: 'Resin Coating', desc: 'A bubble coating for the dive to Fish-Man Island. Lasts one voyage.', price: 100000, apply: (s) => { s.coated = true; } },
};
