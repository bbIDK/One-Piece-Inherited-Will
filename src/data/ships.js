// Ship classes. Speeds in tiles/second at full sail with a following wind.
export const SHIPS = {
  dinghy: {
    name: 'Rowboat', desc: 'A tiny boat with oars and a scrap of sail. Fine for the Blues — suicide in the Grand Line.',
    length: 2.8, beam: 1.2, hull: 60, speed: 7, turn: 2.6, masts: 1, sail: 'small', cannons: 0, crew: 1, cargo: 4,
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
};

export const SHIP_UPGRADES = {
  hull_plating: { name: 'Iron Hull Plating', desc: '+30% hull strength.', price: 20000, apply: (s) => { s.hullMul = (s.hullMul || 1) * 1.3; } },
  better_sails: { name: 'Fine Canvas Sails', desc: '+10% top speed.', price: 16000, apply: (s) => { s.speedMul = (s.speedMul || 1) * 1.1; } },
  extra_cannons: { name: 'Extra Cannons', desc: '+2 cannons per broadside.', price: 25000, apply: (s) => { s.extraCannons = (s.extraCannons || 0) + 2; } },
  seastone_keel: { name: 'Seastone Keel', desc: 'Sea Kings rarely notice you in the Calm Belt.', price: 300000, apply: (s) => { s.seastone = true; } },
  oars: { name: 'Rowing Sweeps', desc: 'Move at 45% speed without wind (Calm Belt).', price: 9000, apply: (s) => { s.oars = true; } },
  coating: { name: 'Resin Coating', desc: 'A bubble coating for the dive to Fish-Man Island. Lasts one voyage.', price: 100000, apply: (s) => { s.coated = true; } },
};
