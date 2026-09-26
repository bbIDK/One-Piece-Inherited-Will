// Rumours, tips and lore — how the world tells you where to go.
import { regionAt, REGION } from '../world/constants.js';
import { FRUITS } from '../data/fruits.js';

const SEA_TIPS = {
  [REGION.EAST_BLUE]: [
    'They call the East Blue the weakest sea. Funny — the Pirate King was born here.',
    'Loguetown is the "town of the beginning and the end". Gol D. Roger was executed on the platform in its square. Every pirate heading for the Grand Line stops there — and so do the Marines.',
    'To reach the Grand Line you sail to Reverse Mountain, at the southwest edge of the East Blue where the Red Line meets the four seas. The current carries you UP the mountain. Steer true or you\'ll smash into the canal walls.',
    'Don\'t even think about crossing the Calm Belt. No wind, no current — and it\'s the nest of the Sea Kings.',
    'A Fish-Man named Arlong took over the Conomi Islands. The villagers pay him tribute or die.',
    'There\'s a floating restaurant called the Baratie out past the Gecko Islands. The head chef, "Red Leg" Zeff, was once a pirate captain.',
    'The Marine captain in Shells Town, "Axe-Hand" Morgan, rules that town like a tyrant.',
    'If you want to learn the sword, the Isshin Dojo in Shimotsuki Village takes students.',
  ],
  [REGION.NORTH_BLUE]: [
    'The North Blue has cold seas and colder people. The Donquixote Family started out in Spider Miles, you know.',
    'Lvneel is the homeland of Noland the Liar, who claimed he saw a city of gold on an island in the Grand Line.',
    'Flevance, the White Town, was destroyed by its neighbours. They said the amber lead sickness was contagious. It wasn\'t.',
    'Reverse Mountain lies at the southeast corner of the North Blue. Ride the canal up the mountain to enter the Grand Line.',
    'The Vinsmoke family once ruled the whole North Blue. Their kingdom, Germa, now roams the seas on giant snail ships.',
  ],
  [REGION.WEST_BLUE]: [
    'The West Blue is ruled from the shadows by the mafia families. Watch your purse.',
    'Ohara was an island of scholars, burned to ash by a Buster Call for studying the Poneglyphs. A few survivors still camp in the ruins.',
    'The Chinjao Family of Kano Country teaches the Hasshoken — a fist that vibrates through armour.',
    'Reverse Mountain rises at the northeast corner of the West Blue.',
  ],
  [REGION.SOUTH_BLUE]: [
    'The South Blue is full of giant animals — gryphons, super sparrows, birds the size of houses in the Torino Kingdom.',
    'Karate Island is where fighters from all over come to train until their fists bleed.',
    'Baterilla... the Marines once searched every pregnant woman on that island, looking for the Pirate King\'s child.',
    'Reverse Mountain lies at the northwest corner of the South Blue, where the four seas meet.',
    'The Sorbet Kingdom once had a kind king named Kuma. They say he was a Buccaneer.',
  ],
  [REGION.PARADISE]: [
    'In the Grand Line your compass is useless. Trust the Log Pose and nothing else.',
    'From Reverse Mountain there are seven routes, all ending at the Sabaody Archipelago.',
    'Islands in the Grand Line each have their own climate. The sea between them goes mad.',
    'To cross the Red Line, pirates must have their ship coated at Sabaody and sink ten thousand metres to Fish-Man Island. Only the World Government may pass over Mary Geoise.',
    'The Knock Up Stream near Jaya shoots ships into the sky. Nobody believes the sky islands are real... except the ones who\'ve been.',
    'Never, ever touch a Celestial Dragon. An Admiral will come.',
    'The Warlords of the Sea have government pardons. Crocodile of Alabasta is treated like a hero there.',
  ],
  [REGION.NEW_WORLD]: [
    'In the New World, Haki is everything. If you can\'t use it, turn back now.',
    'You need a three-needle Log Pose here. Islands change their magnetism on a whim.',
    'The Four Emperors rule these seas: Big Mom in Totto Land, Kaido in Wano, Red-Haired Shanks, and... they say Blackbeard now.',
    'Laugh Tale cannot be found with a Log Pose. You need the four Road Poneglyphs.',
    'Zou is not an island. It\'s on the back of an elephant that has walked the sea for a thousand years.',
  ],
  [REGION.CALM_NORTH]: ['You\'re in the Calm Belt?! Get out before the Sea Kings wake!'],
  [REGION.CALM_SOUTH]: ['You\'re in the Calm Belt?! Get out before the Sea Kings wake!'],
};

const LORE = [
  'Twenty-two years ago, Gol D. Roger\'s last words started the Great Pirate Era: "My treasure? If you want it, you can have it! I left everything I own in that place!"',
  'The Void Century: one hundred years of history, erased. Only the Poneglyphs remember — and reading them is a crime.',
  'Poneglyphs come in three kinds: historical ones, instructional ones, and four red Road Poneglyphs that point to Laugh Tale.',
  'Haki comes in three colours: Armament, Observation, and the rare Conqueror\'s — the Haki of kings.',
  'Devil Fruits: Paramecia change the body, Zoan transform it into beasts, Logia turn it into an element. Every user becomes a hammer in the sea.',
  'When a Devil Fruit user dies, their power is reborn in an ordinary fruit somewhere nearby.',
  'The Red Line is the only continent in the world. It circles the planet. Where it crosses the Grand Line stand Reverse Mountain — and on the opposite side, Mary Geoise.',
  'Seastone emits the same energy as the sea itself. It weakens Devil Fruit users on touch, and Marines line their hulls with it to cross the Calm Belt unnoticed.',
  'The Rokushiki are six superhuman arts taught to the Marines and to Cipher Pol: Soru, Geppo, Tekkai, Shigan, Rankyaku and Kami-e. Strength is measured in "Doriki".',
  'Some families carry the initial "D." in their name. The World Government fears it. Nobody knows why.',
  'Vivre Cards are made from a person\'s fingernail. They point toward that person — and burn away as their life fades.',
  'Log Poses must stay on an island a while to "set" before they point to the next one. Eternal Poses always point to a single island.',
];

export function rumorFor(game, island, rng, npc, tavern, kind) {
  if (kind === 'lore') return rng.pick(LORE);
  const p = game.player;
  const reg = regionAt(p.x, p.y);
  const pool = [];
  if (island?.def?.rumors) pool.push(...island.def.rumors, ...island.def.rumors);
  pool.push(...(SEA_TIPS[reg] || []));
  if (tavern) pool.push(...LORE.slice(0, 6));
  // devil fruit rumours
  const fr = game.fruitRumor?.(rng);
  if (fr && rng.chance(tavern ? 0.45 : 0.2)) return fr;
  const c = game.state?.char;
  if (c?.bounty && rng.chance(0.2)) return `"Hey... aren't you the one on that wanted poster? ฿${c.bounty.toLocaleString()}... I didn't see anything!"`;
  const quest = game.questRumor?.(island, rng);
  if (quest && rng.chance(0.35)) return quest;
  const line = pool.length ? rng.pick(pool) : 'Nice weather today.';
  return npc ? `"${line.replace(/^"|"$/g, '')}"` : line;
}

export { FRUITS };
