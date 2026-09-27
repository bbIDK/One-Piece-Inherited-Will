// Part 3: The New World. Pirates cross under the Red Line by way of Fish-Man
// Island and surface in the second half of the Grand Line; Marines and
// hunters are carried over it on the Bondola, with the papers their Part 2
// earned them. From there each road runs to its end: Laugh Tale for the
// pirates, Blackbeard's fortress for the Navy and the hunters.
import { chapter, T, PLANS, CHAPTERS, onward } from './define.js';
import { MARY_GEOISE } from '../../world/worldgen.js';
import { regionAt, REGION } from '../../world/constants.js';

const beaten = (id) => (c) => (c.bosses || []).includes(id) || !!c.defeated?.[id];
const inNewWorld = (g) => g.world === g.surface && regionAt(g.player.x, g.player.y) === REGION.NEW_WORLD;
/** Where the Bondola waits, on the Paradise side of the Red Line (for the map). */
const redPort = (g) => {
  if (!g.player || g.world !== g.surface || regionAt(g.player.x, g.player.y) === REGION.NEW_WORLD) return null;
  const b = MARY_GEOISE.portParadise?.bondola;
  return b ? { x: b.x, y: b.y, place: 'the Red Port' } : null;
};
const BONDOLA = 'Cross the Red Line: take the Bondola at the Red Port, east of Marineford, then sail to';

// ================================================================= PIRATES
chapter('nw_fishman', { part: 3, kind: 'solo', place: 'Fish-Man Island' }, {
  pirate: {
    name: 'Ten Thousand Metres Down', lure: 'the only way into the New World for a pirate is under the Red Line',
    summary: 'The New World lies on the far side of the Red Line. Pirates can\'t use the Bondola — so they sail under it, ten thousand metres down, to Fish-Man Island.',
    tasks: [
      T.check('dive', 'Take your coated ship to the dive point east of Sabaody and sink to Fish-Man Island, ten thousand metres down.', (c, g) => g.world?.id === 'fishman_island' || !!c.quests.p2_coating?.done || inNewWorld(g)),
      T.quest('nw_fmi_coup', 'Help King Neptune save Fish-Man Island from the New Fish-Man Pirates (Ryugu Palace).', 'nw_neptune', undefined, { alt: (c, g) => inNewWorld(g) }),
      T.check('rise', 'Rise to the New World (the current at the far end of Fish-Man Island).', (c, g) => inNewWorld(g)),
    ],
  },
});

chapter('nw_punk', { part: 3, island: 'punk_hazard', kind: 'solo' }, {
  pirate: {
    name: 'The Poisoned Island', lure: 'a distress call is coming from Punk Hazard — an island half on fire and half frozen',
    summary: 'Punk Hazard, half fire and half ice, was closed by the World Government after an accident. Someone there is calling for help.',
    tasks: [T.quest('nw_punk_hazard', 'Answer the distress call from Punk Hazard, the poisoned island.', undefined)],
  },
});

chapter('nw_dressrosa', { part: 3, island: 'dressrosa' }, {
  pirate: {
    name: 'The Kingdom of Love and Toys', lure: 'Dressrosa, the kingdom of passion — and of toys that remember being people',
    summary: 'Dressrosa is ruled by Donquixote Doflamingo, Warlord of the Sea. The toys in its streets were people once. The tiny Tontatta know the truth.',
    contact: { npc: 'nw_wicca', where: 'at the Acacia market' }, noReport: true,
    meet: ['Shh! You can see me?! Then you must be a hero! The Tontatta need heroes.', 'Doflamingo turned our friends into toys, and everyone forgot them. We have a plan — Operation SOP. Will you help?'],
    tasks: [
      T.quest('nw_sop', 'Carry out Operation SOP with the Tontatta (Wicca).', 'nw_wicca'),
      T.quest('nw_birdcage', 'Bring down Donquixote Doflamingo and his Birdcage.', undefined),
    ],
  },
});

chapter('nw_zou', { part: 3, island: 'zou', kind: 'solo' }, {
  pirate: {
    name: 'The Land on the Elephant\'s Back', lure: 'an island on the back of a thousand-year-old elephant, where the Minks live',
    summary: 'Zou is a country on the back of an elephant that has walked the sea for a thousand years. Something terrible has happened to the Minks who live there.',
    tasks: [T.quest('nw_zou_jack', 'Find out what happened to the Minks of Zou.', undefined)],
  },
});

chapter('nw_wano', { part: 3, island: 'wano', kind: 'solo' }, {
  pirate: {
    name: 'The Land of Wano', lure: 'the closed country of Wano, where the samurai wait for their dawn',
    summary: 'Wano, the closed country of samurai, has lived under Kaido of the Beasts for twenty years. The Nine Red Scabbards are waiting for their dawn.',
    tasks: [
      T.quest('wano_dawn', 'Find the retainers of the Kozuki clan in Wano.', 'kinemon_wano'),
      T.quest('raid_onigashima', 'Join the raid on Onigashima and end Kaido\'s rule.', 'kinemon_wano'),
    ],
  },
});

chapter('nw_laugh_tale', { part: 3, island: 'lodestar', kind: 'solo', noLog: true }, {
  pirate: {
    name: 'The Road to Laugh Tale', lure: 'Lodestar, the last island a Log Pose can find — beyond it, only the Road Poneglyphs point the way',
    summary: 'Lodestar is the last island the Log Pose can find. Beyond it lies Laugh Tale, where Gol D. Roger left everything — and only the four Road Poneglyphs can point the way.',
    tasks: [T.quest('laugh_tale_voyage', 'Gather the four Road Poneglyph rubbings, decipher them, and sail to Laugh Tale.', undefined)],
  },
});

// ================================================================= MARINES
chapter('nw_m_hq', { part: 3, island: 'new_marineford' }, {
  marine: {
    name: 'Justice in the New World', lure: 'Fleet Admiral Sakazuki has moved Headquarters to the New World',
    summary: 'Marine Headquarters has moved to the New World. Fleet Admiral Sakazuki — Akainu — believes in Absolute Justice, and he has orders for you.',
    arrive: `${BONDOLA} New Marineford.`, arriveWhere: redPort,
    contact: { npc: 'nw_sakazuki', where: 'at Marine Headquarters, New Marineford' }, noReport: true,
    meet: ['You survived Marineford. Good. Headquarters does not need survivors, it needs Marines who finish things.', 'Caesar Clown is making weapons on Punk Hazard. Doflamingo, a Warlord, sells them. G-5 is the nearest base. Bring them both down — that is Absolute Justice.'],
    tasks: [T.quest('nw_new_justice', 'Carry out Fleet Admiral Sakazuki\'s orders: G-5, Caesar Clown, Doflamingo.', 'nw_sakazuki')],
  },
});

chapter('nw_m_koby', { part: 3, island: 'hachinosu' }, {
  marine: {
    name: 'The Hero of Rocky Port', lure: 'a Marine hero has been captured and taken to the pirate island of Hachinosu',
    summary: 'Captain Koby — the hero of Rocky Port — has been captured by the Blackbeard Pirates and taken to Hachinosu, their island fortress.',
    contact: { npc: 'koby_hachinosu', where: 'in the Hachinosu Prison Block' }, noReport: true,
    meet: ['You came?! A Marine, here? I — I can\'t believe it. I\'m Koby. They caught me, but I\'m not beaten.', 'Keep Pizarro busy, and I\'ll get us both out. Together!'],
    tasks: [T.quest('koby_escape', 'Break Captain Koby out of the Hachinosu prison.', 'koby_hachinosu')],
  },
});

// ================================================================= HUNTERS
chapter('nw_h_raijin', { part: 3, island: 'raijin_island', kind: 'solo' }, {
  hunter: {
    name: 'The Mad Monk', lure: 'Urouge the Mad Monk — one hundred and eight million — meditates on the Thunder Plain of Raijin Island',
    summary: 'The New World\'s posters start at a hundred million. The first worth your time: Urouge, the Mad Monk of the Worst Generation, on Raijin Island.',
    arrive: `${BONDOLA} Raijin Island.`, arriveWhere: redPort,
    tasks: [T.quest('nw_urouge', 'Take on Urouge, the Mad Monk (฿108,000,000), on the Thunder Plain.', 'nw_urouge', undefined, { alt: beaten('nw_urouge') })],
  },
});

chapter('nw_h_sphinx', { part: 3, island: 'sphinx' }, {
  hunter: {
    name: 'Whitebeard\'s Homeland', lure: 'Edward Weevil — four hundred and eighty million — is plundering Whitebeard\'s homeland',
    summary: 'Edward Weevil claims to be Whitebeard\'s son, and he is plundering Sphinx, Whitebeard\'s homeland, for the "inheritance". His poster is enormous.',
    contact: { npc: 'nw_marco', where: 'at his clinic in Sphinx' }, noReport: true,
    meet: ['A bounty hunter. Yoi. Weevil and his mother are tearing this island apart looking for money that doesn\'t exist.', 'I\'m a doctor now. But I won\'t stop you.'],
    tasks: [T.quest('nw_sphinx', 'Stop Edward Weevil from plundering Sphinx (Marco).', 'nw_marco')],
  },
});

chapter('nw_h_winner', { part: 3, island: 'winner_island', kind: 'solo' }, {
  hunter: {
    name: 'The Winner Island Ambush', lure: 'Jesus Burgess of the Blackbeard Pirates ambushed a crew at Winner Island',
    summary: 'Jesus Burgess, "the Champion" of the Blackbeard Pirates, ambushed the Heart Pirates at Winner Island. One survivor is still hiding by his boat.',
    tasks: [T.quest('winner_ambush', 'Deal with Jesus Burgess at Winner Island (the Heart Pirates crewman at his boat).', 'heart_pirate_winner')],
  },
});

// ================================================================= THE END OF THE ROAD (Navy and hunters)
chapter('nw_teach', { part: 3, island: 'hachinosu', kind: 'solo' }, {
  all: {
    name: 'The Man Who Would Be King',
    tasks: [T.quest('blackbeard_showdown', 'Face Marshall D. Teach — Blackbeard — in his fortress on Hachinosu.', 'teach_hachinosu')],
  },
  marine: {
    lure: 'Blackbeard himself sits in his fortress on Hachinosu',
    summary: 'Marshall D. Teach, Blackbeard, an Emperor of the Sea, sits in his fortress on Hachinosu. For a Marine, there is no greater enemy.',
  },
  hunter: {
    lure: 'the greatest bounty in the world is sitting in a fortress on Hachinosu',
    summary: 'Marshall D. Teach — Blackbeard — Emperor of the Sea. The largest bounty the world has ever posted is his.',
  },
});

// ================================================================= the plan
PLANS[3] = (c, path, from, g) => {
  const inNW = g && g.player && g.world === g.surface && regionAt(g.player.x, g.player.y) === REGION.NEW_WORLD;
  const done = new Set((c.main?.done || []).map((q) => q.split(':')[1]));
  let chain;
  if (path === 'marine') chain = ['nw_m_hq', 'nw_m_koby', 'nw_teach'];
  else if (path === 'hunter') chain = ['nw_h_raijin', 'nw_h_sphinx', 'nw_h_winner', 'nw_teach'];
  else chain = [...(inNW ? [] : ['nw_fishman']), 'nw_punk', 'nw_dressrosa', 'nw_zou', 'nw_wano', 'nw_laugh_tale'];
  return chain.filter((id) => CHAPTERS.has(id) && !done.has(id));
};

void onward;
