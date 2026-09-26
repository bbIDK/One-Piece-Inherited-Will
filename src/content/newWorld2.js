// New World, second half — Wano Country, Onigashima, Egghead, Elbaph,
// Hachinosu, the Cross Guild's Karai Bari, Lodestar... and the ENDGAME:
// the four Road Poneglyphs, the voyage to Laugh Tale and the One Piece.
//
// Road Poneglyph rubbings (item `poneglyph_rubbing`): Zou and Whole Cake
// Island are the newWorld pack's. This pack gives the other two:
//   * Wano  — the red stone in the secret cavern at the foot of Mt. Fuji
//             (canon), reached through the Shogun Castle: `wano_road_poneglyph`.
//   * The lost fourth — once in the Sea Forest by Fish-Man Island, now said to be
//             held by the mysterious "man with the burn scar" (Hinokizu) and his
//             all-black ship. Here it waits in a sea cave on Lodestar: `burn_scar`.
// Then `laugh_tale_voyage`: four rubbings → deciphered (an archaeologist in the
// crew, char.flags.canReadPoneglyphs, or Kozuki Sukiyaki in Wano) → the fog
// lifts (char.flags.laughTaleRevealed) → Laugh Tale → char.flags.laughTale.
import './bossMoves.js';
import { spawnNow, findActor, aggro, despawn } from './helpers.js';
import { count, addItem } from '../game/inventory.js';
import { makeEnemy } from '../game/npcs.js';

// ------------------------------------------------------------------ helpers
const stage = (g, q) => g.quests.stageId(q);
const isDone = (g, q) => g.quests.isDone(q);
const started = (g, q) => !!g.quests.state(q);
// defeated by the player — or knocked out by the player's crew (see install())
const beat = (c, id) => (c.bosses || []).includes(id) || !!(c.defeated || {})[id] || !!(c.flags?.nw2_ko || {})[id];
const has = (c, id, n = 1) => count(c, id) >= n;

const TOBI_ROPPO = ['whos_who', 'black_maria', 'sasaki', 'ulti', 'page_one'];
const ALL_STARS = ['king_wildfire', 'queen_plague', 'jack_drought'];
const TITANIC = ['shiryu_hachinosu', 'pizarro_hachinosu', 'devon_hachinosu', 'burgess_winner'];
const TRACKED = ['holdem', 'babanuki', 'orochi', 'fukurokuju', 'kaku_cp0', 'kaido', ...ALL_STARS, ...TOBI_ROPPO, 'lucci_cp0', 'kizaru_egghead', 'killingham', 'loki',
  ...TITANIC, 'teach_hachinosu', 'brownbeard_foodvalten', 'teach_laugh_tale'];

/** Keep `nw2_beat_<id>` flags (and the "any N of" counters) in sync, so quest
 *  stages also complete for foes the player beat before the stage began. */
function syncBeatFlags(c) {
  if (!c) return;
  for (const id of TRACKED) if (beat(c, id)) c.flags['nw2_beat_' + id] = true;
  if (TOBI_ROPPO.filter((id) => beat(c, id)).length >= 3) c.flags.nw2_tobiroppo3 = true;
  if (ALL_STARS.filter((id) => beat(c, id)).length >= 2) c.flags.nw2_allstars2 = true;
  if (TITANIC.filter((id) => beat(c, id)).length >= 2) c.flags.nw2_captains2 = true;
}

/** Can the player (or someone aboard) read the ancient script? */
function canDecipher(game, c) {
  if (c.flags.canReadPoneglyphs) return true;
  try { if (game.canReadPoneglyphs && game.canReadPoneglyphs()) return true; } catch (e) { /* title screen / mock */ }
  if ((c.crew || []).some((m) => m.role === 'archaeologist')) return true;
  // same rule as src/game/legends.js: the Three-Eye tribe hears the Voice of All Things
  return c.race === 'three_eye' && (c.haki?.observation || 0) >= 20;
}

/** The four rubbings are read together: the fog around Laugh Tale lifts. */
function revealLaughTale(game, c, who) {
  if (!c || c.flags.laughTaleRevealed) return;
  c.flags.laughTaleRevealed = true;
  if (!has(c, 'four_points_chart')) addItem(game, 'four_points_chart', 1);
  game.ui?.banner?.('THE FOUR POINTS', 'The Road Poneglyphs are read', `${who} lays the four rubbings side by side. Four places — join them on a chart and two lines cross in an X, beyond Lodestar, where no Log Pose can lead.`, 8);
  game.log?.('The four Road Poneglyphs point to the final island. Laugh Tale lies just before Reverse Mountain, east of Lodestar.', '#ffd54f');
}

/** Spawn an enemy group right now — only while the island is populated, so the
 *  actors are cleared with it (helpers.js' spawnGroup spawns unconditionally). */
function spawnSquad(game, islandId, spotId, enemies, radius = 5) {
  const list = game.spawner?.populated?.get(islandId);
  if (!list || game.world !== game.surface) return [];
  const isl = game.surface.islands.find((i) => i.id === islandId);
  const base = isl?.spots?.[spotId];
  if (!base) return [];
  const out = [];
  for (const [arch, lvl, over] of enemies) {
    const p = game.spawner.findFree(base.x, base.y, radius) || { x: base.x, y: base.y };
    const a = makeEnemy(arch, lvl, p.x, p.y, { ...(over || {}) });
    a.game = game;
    game.addActor(a);
    list.push(a);
    out.push(a);
  }
  return out;
}

function giveRubbing(ctx, id) {
  const c = ctx.char;
  if (c.flags['rubbing_' + id]) return false;
  c.flags['rubbing_' + id] = true;
  ctx.give('poneglyph_rubbing', 1);
  return true;
}

// ----------------------------------------------------------- enemy rosters
const SERAPHIM = [
  ['pacifista', 80, { id: 's_hawk', name: 'S-Hawk', style: 'ittoryu', weapon: 'sword', moves: ['itto_iai', 'itto_whirl', 'kuma_laser'], scale: 0.95, bulk: 1, look: { hat: 'halo', hatColor: '#fff59d', hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa', eyeColor: '#fbc02d', swords: 1 } }],
  ['pacifista', 80, { id: 's_bear', name: 'S-Bear', moves: ['kuma_paw_npc', 'kuma_laser'], scale: 1.05, bulk: 1.2, look: { hat: 'halo', hatColor: '#fff59d', hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa', ears: 'round', fur: '#212121' } }],
  ['pacifista', 78, { id: 's_snake', name: 'S-Snake', moves: ['nw2_slave_arrow', 'kuma_laser'], scale: 0.95, bulk: 1, look: { hat: 'halo', hatColor: '#fff59d', hair: 'long', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa' } }],
  ['pacifista', 80, { id: 's_shark', name: 'S-Shark', race: 'fishman', style: 'fishman_karate', moves: ['fmk_uchimizu', 'fmk_5000', 'kuma_laser'], scale: 1.1, bulk: 1.2, look: { hat: 'halo', hatColor: '#fff59d', top: '#fafafa', bottom: '#fafafa', skin: '#5c6bc0' } }],
];
const BUSTER_CALL = [
  ['marine_officer', 72, { name: 'Vice Admiral (Buster Call)' }],
  ['pacifista', 70, { name: 'Pacifista Mark III' }],
  ['marine_rifle', 66, { name: 'Buster Call Rifleman' }],
];
const MMA = [
  ['nw2_mma', 72, { id: 'mma_beast', name: 'MMA — Nightmare Wolf' }],
  ['nw2_mma', 72, { id: 'mma_beast', name: 'MMA — Jörmungandr' }],
  ['nw2_mma', 74, { id: 'mma_beast', name: 'MMA — Lindworm' }],
];
const SCAVENGERS = [
  ['pirate', 58, { id: 'bb_scavenger', name: 'Blackbeard Scavenger' }],
  ['pirate_gunner', 58, { id: 'bb_scavenger', name: 'Blackbeard Scavenger' }],
  ['brute', 60, { id: 'bb_scavenger', name: 'Blackbeard Heavy' }],
];
const ONIWABANSHU = [['nw2_oniwabanshu', 60], ['nw2_oniwabanshu', 60], ['nw2_oniwabanshu', 62]];

// ------------------------------------------------------------------- looks
const MMA_LOOK = { skin: '#311b92', top: '#4a148c', bottom: '#311b92', fur: '#311b92', hair: 'bald', ears: 'pointy', muzzle: true, tail: 'thin', sharpTeeth: true, eyeColor: '#ff1744' };
const GIFTER_LOOK = { top: '#212121', bottom: '#4e342e', hat: 'horns', hatColor: '#9e9e9e', fur: '#795548', ears: 'round' };
const L = {
  kaido: { hair: 'long', hairColor: '#1a1a1a', skin: '#d7a67a', top: '#eceff1', bottom: '#4a148c', coat: '#f5f5f5', hat: 'horns', hatColor: '#cfd8dc', sharpTeeth: true, belt: '#ffd54f' },
  teach: { hair: 'curly', hairColor: '#212121', skin: '#d7a67a', top: '#fafafa', bottom: '#212121', coat: '#212121', hat: 'bandana', hatColor: '#e53935', grin: true, sharpTeeth: true },
  samurai: (top, hair = '#212121') => ({ hair: 'topknot', hairColor: hair, top, bottom: '#3e2723', skin: '#f1c9a0', swords: 2 }),
};

// ------------------------------------------------------------------- NPCs
const npcs = [
  // ============================================================ FOODVALTEN
  {
    id: 'foodvalten_chief', name: 'Chief of Foodvalten', title: 'Elder of the feathered people', island: 'foodvalten', at: { town: 'foodvalten_town', building: "Chief's Longhouse" },
    look: { hair: 'long', hairColor: '#eceff1', top: '#8d6e63', bottom: '#5d4037', skin: '#c68642', hat: 'crown', hatColor: '#ef6c00' }, level: 12,
    marker: (c, g) => (!g.quests.state('foodvalten_flag') ? '!' : g.quests.stageId('foodvalten_flag') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => (isDone(ctx.game, 'foodvalten_flag')
        ? `"The feathers dance again in Foodvalten. We will sew Whitebeard's flag back together — and yours beside it, if you like."`
        : `"For thirty years Whitebeard's flag kept every pirate away from Foodvalten. The day he died, the Brownbeard Pirates sailed in and cut it in half. Now they eat our harvest and laugh at our feathers."`),
      choices: [
        { text: 'I\'ll throw the Brownbeard Pirates out.', if: () => !ctx.quest('foodvalten_flag'), do: (c) => c.startQuest('foodvalten_flag'), end: true },
        { text: 'Brownbeard is finished.', if: () => stage(ctx.game, 'foodvalten_flag') === 'report', do: (c) => c.complete('foodvalten_flag'), next: 'thanks' },
        { text: 'Goodbye.', end: true },
      ] },
      thanks: { text: `"Brownbeard ran with his tail between his legs! The whole village will dance tonight. Take this — and wear a feather, so every Foodvalten child knows your face."` },
    } }),
  },
  {
    id: 'brownbeard_foodvalten', name: '"Brownbeard" Chadros Higelyges', title: 'Captain of the Brownbeard Pirates', island: 'foodvalten', at: { spot: 'brownbeard_camp' },
    hostile: true, boss: true, hpMul: 1.3, level: 58, faction: 'pirate', style: 'ittoryu', weapon: 'sword', moves: ['itto_pound', 'itto_iai', 'itto_whirl'],
    look: { hair: 'long', hairColor: '#6d4c41', top: '#8d6e63', bottom: '#4e342e', hat: 'tricorne', hatColor: '#4e342e', skin: '#e0ac7e', bulk: 1.4 }, bulk: 1.4,
    haki: { armament: 20 }, bounty: 80000000, infamy: true, breakthrough: 3, skill: 0.45,
    alert: 'Whitebeard is DEAD! His islands belong to whoever takes them!', barks: ['This island is mine now!', 'Hah! Feathers!'],
    when: (c) => !beat(c, 'brownbeard_foodvalten'),
  },
  {
    id: 'hawkins_foodvalten', name: 'Basil Hawkins', title: '"The Magician" — Supernova', island: 'foodvalten', at: { spot: 'town_gate', ox: 3 }, ai: 'idle', faction: 'neutral', invulnerable: true,
    look: { hair: 'long', hairColor: '#fff59d', top: '#5d4037', bottom: '#3e2723', coat: '#6d4c41', skin: '#fafafa' }, level: 72, fixedPower: 99999,
    when: (c, g) => g.quests.isDone('foodvalten_flag') && !c.flags.nw2_hawkinsMet,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: `(A pale man turns over a tarot card without looking up.) "The cards said Brownbeard would fall to a stranger today. My chance of being annoyed by that... zero percent. The Death card, reversed. Your road does not end here."`,
      onEnter: (c) => c.setFlag('nw2_hawkinsMet'),
    } } }),
  },

  // ================================================================= WANO
  {
    id: 'kinemon_wano', name: '"Foxfire" Kin\'emon', title: 'Leader of the Nine Red Scabbards', island: 'wano', at: { spot: 'oden_castle' },
    look: { ...L.samurai('#b71c1c'), coat: '#6d4c41' }, level: 78, style: 'nitoryu', weapon: 'sword', moves: ['nito_taka', 'nw2_foxfire'], haki: { armament: 60, observation: 45 },
    marker: (c, g) => {
      const s = g.quests.stageId('wano_dawn');
      if (s === 'meet' || s === 'report') return s === 'meet' ? '!' : '?';
      if (g.quests.isDone('wano_dawn') && !g.quests.state('raid_onigashima')) return '!';
      return null;
    },
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => {
          const g = ctx.game;
          if (isDone(g, 'raid_onigashima')) return `"Oden-sama's dream came true... Wano is free. The borders will open one day — and Wano will never forget the stranger who fought beside the Scabbards."`;
          if (started(g, 'raid_onigashima')) return `"The Fire Festival burns on Onigashima! Beat the Tobi Roppo and the All-Stars, then climb to the roof of the Skull Dome. For Oden-sama!"`;
          if (isDone(g, 'wano_dawn')) return `"Kuri and Udon stand with us! Twenty years we waited. Tonight is the Fire Festival, when Kaido's men drink themselves blind on Onigashima. Will you join the raid?"`;
          if (stage(g, 'wano_dawn') === 'report') return `"Holdem fallen, the Prisoner Mine broken open! The people of Wano have seen the dawn at last."`;
          return `"You are not of Wano... I am Kin'emon, retainer of the Kozuki clan. Twenty years ago Kaido and the shogun Orochi burned this castle and boiled my lord, Kozuki Oden, alive. We crossed twenty years of time to take our country back."`;
        },
        choices: [
          { text: 'How can I help?', if: () => !ctx.flag('nw2_met_kinemon') || stage(ctx.game, 'wano_dawn') === 'meet' || !ctx.quest('wano_dawn'), do: (c) => { c.setFlag('nw2_met_kinemon'); if (!c.quest('wano_dawn')) c.startQuest('wano_dawn'); }, next: 'plan' },
          { text: 'Holdem and Babanuki are finished.', if: () => stage(ctx.game, 'wano_dawn') === 'report', do: (c) => c.complete('wano_dawn'), next: 'dawn' },
          { text: 'I\'ll join the raid on Onigashima.', if: () => isDone(ctx.game, 'wano_dawn') && !ctx.quest('raid_onigashima'), do: (c) => c.startQuest('raid_onigashima'), next: 'raid' },
          { text: 'Tell me about Oden.', next: 'oden' },
          { text: 'Farewell.', end: true },
        ],
      },
      plan: { text: `"The tyrants of each region keep the people in chains. Holdem, a Headliner with a lion growing from his belly, rules Bakura Town beyond the great torii. The warden Babanuki works Udon's prisoners to death in the mine. Break them, and Wano will rise."`, next: 'a' },
      dawn: { text: `"The yakuza bosses, the prisoners, the people of Kuri — they gather under the Kozuki crest! Take this, from what little we have. When you are ready, speak to me of the raid."`, next: 'a' },
      raid: { text: `"Then sail south to Onigashima! Defeat the Tobi Roppo and the All-Stars and climb to the roof of the Skull Dome. Kaido must fall where the whole island can see it."` },
      oden: { text: `"Oden-sama was a wild man who wanted to see the world. He sailed with Whitebeard — and with Gol D. Roger himself, to the very end of the Grand Line. He could read the Poneglyphs, and he said Wano's borders must one day be opened..."`, next: 'a' },
    } }),
  },
  {
    id: 'momonosuke_wano', name: 'Kozuki Momonosuke', title: 'Shogun of Wano', island: 'wano', at: { spot: 'shogun_castle', ox: 2 },
    look: { hair: 'topknot', hairColor: '#212121', top: '#e91e63', bottom: '#4a148c', skin: '#f9dcc4', scale: 0.9 }, level: 30,
    when: (c, g) => g.quests.stageId('raid_onigashima') === 'report' || g.quests.isDone('raid_onigashima'),
    marker: (c, g) => (g.quests.stageId('raid_onigashima') === 'report' ? '?' : (g.quests.isDone('raid_onigashima') && !g.quests.state('wano_road_poneglyph') && !c.flags.rubbing_road_wano ? '!' : null)),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (stage(ctx.game, 'raid_onigashima') === 'report'
          ? `"You... you really did it! Kaido is beaten and Orochi with him. I am Kozuki Momonosuke, shogun of Wano — and I will open this country's borders, as my father wished!"`
          : `"Wano is free. The people eat rice again and the rivers run clean. If there is anything the shogun can do for you, speak."`),
        choices: [
          { text: 'The honour was mine, Shogun.', if: () => stage(ctx.game, 'raid_onigashima') === 'report', do: (c) => c.complete('raid_onigashima'), next: 'gift' },
          { text: 'Show me the Road Poneglyph.', if: () => isDone(ctx.game, 'raid_onigashima') && !ctx.quest('wano_road_poneglyph') && !ctx.flag('rubbing_road_wano'), do: (c) => c.startQuest('wano_road_poneglyph'), next: 'road' },
          { text: 'Farewell.', end: true },
        ],
      },
      gift: { text: `"My father sailed to Laugh Tale with the Pirate King. The Kozuki keep a secret beneath this very castle. It is yours to see, if you wish."`, next: 'a' },
      road: { text: `"Beneath this castle a stairway descends to the foot of Mt. Fuji, where the red stone the Kozuki carved long ago still waits. Take its rubbing. My father would have wanted it to reach someone who laughs."` },
    } }),
  },
  {
    id: 'hitetsu_wano', name: 'Tenguyama Hitetsu', title: 'Swordsmith of Amigasa Village', island: 'wano', at: { town: 'amigasa_village', building: "Hitetsu's Forge" },
    look: { hair: 'long', hairColor: '#eceff1', top: '#5d4037', bottom: '#3e2723', skin: '#e57373', nose: 'long' }, level: 40,
    marker: (c, g) => (g.quests.stageId('enma_blade') === 'report' || g.quests.stageId('laugh_tale_voyage') === 'decipher' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (stage(ctx.game, 'enma_blade') === 'report'
          ? `"...So Shusui rests with Ryuma again. Hiyori sent word before you arrived."`
          : `"Hm? A traveller in Kuri? I forge swords, nothing more. ...Don't stare at the mask."`),
        choices: [
          { text: 'Shusui is back on Ryuma\'s grave.', if: () => stage(ctx.game, 'enma_blade') === 'report', do: (c) => c.complete('enma_blade'), next: 'enma' },
          { text: 'Browse blades', do: (c) => c.open('shop', { shop: 'amigasa_forge', building: { name: "Hitetsu's Forge", role: 'weapons' } }) },
          { text: 'Can you read these Road Poneglyph rubbings?', if: () => stage(ctx.game, 'laugh_tale_voyage') === 'decipher' && !ctx.flag('laughTaleRevealed'), next: () => (isDone(ctx.game, 'wano_dawn') || isDone(ctx.game, 'raid_onigashima') ? 'decipher' : 'refuse') },
          { text: 'Is there a Road Poneglyph in Wano?', if: () => isDone(ctx.game, 'wano_dawn') && !ctx.quest('wano_road_poneglyph') && !ctx.flag('rubbing_road_wano'), do: (c) => c.startQuest('wano_road_poneglyph'), next: 'road' },
          { text: 'Farewell.', end: true },
        ],
      },
      enma: { text: `"Then this is yours: Enma, the blade of Kozuki Oden. It drinks its wielder's Haki until you master it — or it masters you. Oden cut the Emperor with it. The only scar Kaido ever carried."` },
      decipher: { text: `(He lifts the tengu mask. Beneath it is an old man with the eyes of the Kozuki.) "I am Kozuki Sukiyaki, Oden's father. My family carved these stones, and we can still read them. Lay the four rubbings out... there. And there. Do you see it?"`, next: 'decipher2' },
      decipher2: { text: `"Four points. Join them and the lines cross in an X — there, past Lodestar, where no Log Pose can follow. That is Laugh Tale. My son saw it with Gol D. Roger. ...Go. And laugh for him."`, onEnter: (c) => revealLaughTale(c.game, c.char, 'Kozuki Sukiyaki') },
      refuse: { text: `"Rubbings of the red stones? ...I am only a swordsmith. Perhaps if Wano had reason to trust you — if Kuri were free of the Beasts — an old man might remember things he has hidden."` },
      road: { text: `"The red stone of Wano lies at the foot of Mt. Fuji. A secret stair leads down to it from beneath the Shogun Castle in the Flower Capital. Slip in while Orochi's guards drink to the Fire Festival — and tell no one who sent you."` },
    } }),
  },
  {
    id: 'hiyori_wano', name: 'Komurasaki', title: 'Oiran of the Flower Capital (Kozuki Hiyori)', island: 'wano', at: { town: 'flower_capital', building: "Komurasaki's Teahouse" },
    look: { hair: 'bun', hairColor: '#212121', top: '#7b1fa2', bottom: '#4a148c', skin: '#fdeee4', coat: '#e1bee7' }, level: 20,
    marker: (c, g) => ((has(c, 'shusui') && !g.quests.state('enma_blade')) || (g.quests.isDone('raid_onigashima') && !has(c, 'enma') && !c.flags.nw2_enma_given && !g.quests.state('enma_blade')) ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: `"Welcome to my teahouse. I am Komurasaki... or I was. My true name is Kozuki Hiyori, daughter of Oden. The whole capital wept when they thought I had died — how sweet of them."`,
        choices: [
          { text: 'This blade is Shusui.', if: () => ctx.has('shusui') && !ctx.quest('enma_blade'), next: 'shusui' },
          { text: 'About your father\'s sword...', if: () => isDone(ctx.game, 'raid_onigashima') && !ctx.has('enma') && !ctx.flag('nw2_enma_given') && !ctx.quest('enma_blade'), next: 'gift' },
          { text: 'Farewell.', end: true },
        ],
      },
      shusui: { text: `"Shusui — the black blade of Shimotsuki Ryuma, Wano's national treasure! It was stolen from his grave. Would you return it to the Northern Cemetery in Ringo? In exchange I will give you a blade worthy of it: my father's sword, Enma."`, choices: [
        { text: 'I\'ll return it to Ryuma.', do: (c) => c.startQuest('enma_blade'), end: true },
        { text: 'Shusui stays with me.', end: true },
      ] },
      gift: { text: `"You fought Kaido, as my father once did. Enma belongs in the hands of such a swordsman. Take it — it will test you. It tested him."`, onEnter: (c) => { c.setFlag('nw2_enma_given'); c.give('enma', 1); } },
    } }),
  },
  {
    id: 'denjiro_wano', name: 'Denjiro', title: 'Nine Red Scabbards (once "Kyoshiro")', island: 'wano', at: { town: 'flower_capital', building: "Kozuki Retainers' Dojo" }, trainer: 'kozuki_samurai',
    look: { ...L.samurai('#1a237e'), coat: '#212121' }, level: 76, style: 'nitoryu', weapon: 'sword',
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: `"For twenty years I wore the face of Kyoshiro, the yakuza boss, and smiled at Orochi's side. ...Now I teach Oden-sama's two-sword style to anyone with the spine for it."`,
      choices: [
        { text: 'Train at the dojo', do: (c) => c.open('trainer', { trainer: 'kozuki_samurai' }) },
        { text: 'Farewell.', end: true },
      ],
    } } }),
  },
  {
    id: 'hyogoro_wano', name: 'Hyogoro of the Flower', title: 'Former yakuza boss of all Wano', island: 'wano', at: { town: 'udon_mine', building: 'Cell Block of the Yakuza Bosses' }, trainer: 'hyogoro',
    look: { hair: 'long', hairColor: '#eceff1', top: '#6d4c41', bottom: '#4e342e', skin: '#e0c2a2', scale: 0.85 }, level: 72, haki: { armament: 80 },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (beat(ctx.char, 'babanuki')
        ? `"The Prisoner Mine is open! The old bosses of Wano stand with the Kozuki again. Now — Ryuo. Again. Feel it flow."`
        : `"Heh... they starve us to keep us weak. You want to learn Ryuo, kid? Haki isn't a coat of armour. Let it flow into your enemy — and break them from the inside."`),
      choices: [
        { text: 'Teach me Ryuo', do: (c) => c.open('trainer', { trainer: 'hyogoro' }) },
        { text: 'Farewell.', end: true },
      ],
    } } }),
  },
  {
    id: 'tama_wano', name: 'Tama', title: 'Kunoichi-in-training of Amigasa Village', island: 'wano', at: { town: 'amigasa_village', building: "Tama's Kibi Dango Stand" },
    look: { hair: 'short', hairColor: '#212121', top: '#e91e63', bottom: '#f48fb1', skin: '#f9dcc4', scale: 0.6 }, level: 4,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: `"Ace-sama promised he'd come back to Amigasa one day... He can't now, I know. But I'll become a kunoichi anyway! Want some kibi dango? They make even the scariest beasts behave!"`,
      choices: [
        { text: 'Buy dango', do: (c) => c.open('shop', { shop: 'amigasa_food', building: { name: "Tama's Kibi Dango Stand", role: 'shop' } }) },
        { text: 'Goodbye, Tama.', end: true },
      ],
    } } }),
  },
  {
    id: 'yamato', name: 'Yamato', title: '"Oni Princess" — Kaido\'s child, who calls himself Kozuki Oden', island: 'wano', at: { spot: 'oden_castle', ox: 4 }, faction: 'neutral',
    look: { hair: 'long', hairColor: '#eceff1', top: '#fafafa', bottom: '#ef6c00', hat: 'horns', hatColor: '#e53935', skin: '#f1c9a0', eyeColor: '#ff8f00' }, level: 92,
    style: 'brawler', weapon: 'staff', moves: ['nw2_narikabura', 'nw2_namuji_hyoga', 'seiryu_raimei'], haki: { armament: 80, observation: 75, conqueror: 60 },
    recruit: {
      role: 'fighter', requires: (c) => beat(c, 'kaido'),
      pitch: `"I've read Oden's journal a thousand times. He sailed with Whitebeard and Roger to the end of the sea! Now that my father is beaten, nothing chains me here. I am Kozuki Oden — and Oden would go with you!"`,
    },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (beat(ctx.char, 'kaido')
        ? `"You beat my father! Hahaha! The cuffs are off and the sea is waiting... I want to see the world Oden saw!"`
        : `"You there! I am Kozuki Oden! ...Well, I've decided to become him. My father Kaido chained bombs to my wrists so I could never leave. One day someone will beat him — and on that day I'll finally go to sea."`),
      choices: [{ text: 'See you, Yamato.', end: true }],
    } } }),
  },
  {
    id: 'holdem', name: 'Holdem', title: 'Headliner of the Beasts Pirates, ruler of Bakura Town', island: 'wano', at: { spot: 'bakura_town' },
    hostile: true, boss: true, hpMul: 1.2, level: 62, faction: 'pirate', style: 'ittoryu', weapon: 'sword', moves: ['itto_iai', 'nw2_shishi_no_hi', 'nw2_call_gifters'], haki: { armament: 25 },
    look: { hair: 'spiky', hairColor: '#f9a825', top: '#fdd835', bottom: '#5d4037', coat: '#e65100', skin: '#e0ac7e', bulk: 1.3, grin: true }, bulk: 1.3,
    breakthrough: 3, skill: 0.4, alert: 'Kneel before a Headliner of the Beasts Pirates, Kuri trash!', barks: ['My lion is hungry!', 'Worthless leftovers!'],
    when: (c) => !beat(c, 'holdem'),
  },
  {
    id: 'babanuki', name: 'Babanuki', title: 'Headliner — warden of the Prisoner Mine', island: 'wano', at: { town: 'udon_mine', building: "Prisoner Mine Warden's Office" },
    hostile: true, boss: true, hpMul: 1.3, level: 64, faction: 'pirate', style: 'brawler', moves: ['nw2_hakkushon', 'brawl_tackle'], haki: { armament: 25 },
    look: { hair: 'bald', skin: '#b0bec5', top: '#5d4037', bottom: '#3e2723', nose: 'long', ears: 'round', fur: '#90a4ae', bulk: 1.6 }, bulk: 1.6,
    breakthrough: 3, skill: 0.35, alert: 'Back to work, prisoner! Or I\'ll blow you away!',
    when: (c) => !beat(c, 'babanuki'),
  },
  {
    id: 'orochi', name: 'Kurozumi Orochi', title: 'Shogun of Wano', island: 'wano', at: { spot: 'shogun_castle', ox: -3 },
    hostile: true, boss: true, hpMul: 1.3, level: 66, faction: 'pirate', style: 'brawler', moves: ['nw2_orochi_bite', 'nw2_orochi_coil'],
    look: { hair: 'long', hairColor: '#212121', top: '#7b1fa2', bottom: '#4a148c', coat: '#ffd54f', skin: '#fce4ec', grin: true }, haki: { observation: 20 },
    breakthrough: 3, skill: 0.35, alert: 'Guards! GUARDS! The shogun commands you to kill this intruder!', barks: ['I am the shogun of Wano!', 'Eight heads, eight lives!'],
    when: (c, g) => g.quests.stageId('wano_road_poneglyph') === 'castle' && !beat(c, 'kaido') && !beat(c, 'orochi'),
  },
  {
    id: 'fukurokuju', name: 'Fukurokuju', title: 'Leader of the Orochi Oniwabanshu', island: 'wano', at: { spot: 'shogun_castle', ox: 4 },
    hostile: true, named: true, level: 68, faction: 'bandit', style: 'rokushiki', moves: ['roku_soru', 'nw2_kunai', 'roku_rankyaku'],
    look: { hair: 'bald', skin: '#f1c9a0', top: '#212121', bottom: '#212121', hat: 'bandana', hatColor: '#212121', nose: 'long' }, skill: 0.5,
    alert: 'Ninpo! No one reaches the shogun!',
    when: (c, g) => g.quests.stageId('wano_road_poneglyph') === 'castle' && !beat(c, 'kaido') && !beat(c, 'fukurokuju'),
  },

  // =========================================================== ONIGASHIMA
  {
    id: 'kaido', name: 'Kaido of the Beasts', title: 'Emperor of the Sea — "the Strongest Creature in the World"', island: 'onigashima', at: { spot: 'skull_roof' },
    hostile: true, boss: true, hpMul: 3.2, level: 115, faction: 'pirate', style: 'brawler', weapon: 'staff', fruit: 'uo_seiryu', fruitMastery: 100,
    moves: ['seiryu_bolo', 'seiryu_kaifu', 'seiryu_raimei', 'nw2_ragnaraku', 'nw2_hakai', 'nw2_tatsumaki', 'nw2_kaen_daiko'],
    haki: { armament: 98, observation: 90, conqueror: 95 }, look: L.kaido, bulk: 1.9, scale: 1.8,
    bounty: 4611100000, infamy: true, breakthrough: 8, skill: 0.75, leash: 26,
    alert: 'Wororororo! You climbed all the way up here to die? Good. Entertain me!', barks: ['Wororo...!', 'Power is everything!', 'Is that all?!', 'Don\'t bore me!'],
    phases: [
      { at: 0.6, run: (a, g) => { g.fx.text(a.x, a.y - 3.6, 'Shuron Hakke!', '#ff8a80', 0.6); a.addBuff({ id: 'shuron_hakke', name: 'Shuron Hakke', dur: 45, mods: { damage: 1.3, atkSpeed: 1.2 } }); } },
      { at: 0.3, run: (a, g) => { g.ui?.banner?.('KAIDO', 'Human-Beast form', '"Let\'s see you survive THIS!"', 3); a.addBuff({ id: 'kaido_hybrid', name: 'Human-Beast Form', dur: 60, mods: { damage: 1.5, defMul: 0.7 } }); } },
    ],
    when: (c, g) => g.quests.stageId('raid_onigashima') === 'kaido' && !beat(c, 'kaido'),
  },
  {
    id: 'king_wildfire', name: 'King the Wildfire', title: 'All-Star of the Beasts Pirates', island: 'onigashima', at: { spot: 'skull_dome' }, race: 'lunarian',
    hostile: true, boss: true, hpMul: 2, level: 98, faction: 'pirate', style: 'ittoryu', weapon: 'sword', moves: ['itto_iai', 'nw2_karyudon', 'nw2_tempuraudon', 'nw2_barizodon'],
    haki: { armament: 85, observation: 70 }, look: { hair: 'long', hairColor: '#f5f6fa', skin: '#5c3a21', top: '#212121', bottom: '#212121', coat: '#212121', swords: 1 },
    bounty: 1390000000, infamy: true, breakthrough: 6, skill: 0.65, alert: 'Intruder. You will burn.',
    when: (c, g) => !!g.quests.state('raid_onigashima') && !beat(c, 'king_wildfire'),
  },
  {
    id: 'queen_plague', name: 'Queen the Plague', title: 'All-Star of the Beasts Pirates (cyborg scientist)', island: 'onigashima', at: { spot: 'live_floor' },
    hostile: true, boss: true, hpMul: 2.2, level: 94, faction: 'pirate', style: 'brawler', moves: ['nw2_black_coffee', 'nw2_brachio_bomber', 'nw2_ice_oni'],
    haki: { armament: 75, observation: 60 }, look: { hair: 'long', hairColor: '#212121', skin: '#e0ac7e', top: '#fafafa', bottom: '#212121', goggles: true, grin: true, bulk: 1.8 }, bulk: 1.8,
    bounty: 1320000000, infamy: true, breakthrough: 6, skill: 0.55, alert: 'Murmurmur! Welcome to the Live Floor, baby! You\'re the next act!', barks: ['Funk it up!', 'Murmurmur!'],
    when: (c, g) => !!g.quests.state('raid_onigashima') && !beat(c, 'queen_plague'),
  },
  {
    id: 'jack_drought', name: 'Jack the Drought', title: 'All-Star of the Beasts Pirates', island: 'onigashima', at: { spot: 'wisteria_pond' }, race: 'fishman',
    hostile: true, boss: true, hpMul: 2, level: 88, faction: 'pirate', style: 'brawler', moves: ['nw2_mammoth_charge', 'nw2_drought_stomp', 'brawl_tackle'],
    haki: { armament: 60 }, look: { hair: 'bald', skin: '#78909c', top: '#212121', bottom: '#263238', coat: '#37474f', fin: true, sharpTeeth: true, bulk: 1.7 }, bulk: 1.7,
    bounty: 1000000000, infamy: true, breakthrough: 5, skill: 0.5, alert: '...Kaido-san\'s enemies die here.',
    when: (c, g) => !!g.quests.state('raid_onigashima') && !beat(c, 'jack_drought'),
  },
  {
    id: 'whos_who', name: 'Who\'s-Who', title: 'Tobi Roppo — former CP9 agent', island: 'onigashima', at: { spot: 'treasure_room' },
    hostile: true, named: true, level: 82, faction: 'pirate', style: 'rokushiki', moves: ['roku_soru', 'nw2_madara', 'roku_tekkai'], haki: { armament: 55, observation: 50 },
    look: { hair: 'long', hairColor: '#212121', top: '#fafafa', bottom: '#212121', coat: '#6d4c41', sharpTeeth: true, grin: true }, bounty: 546000000, infamy: true, skill: 0.6,
    alert: 'Did you know? The Gomu Gomu no Mi has another name...', when: (c) => !beat(c, 'whos_who'),
  },
  {
    id: 'black_maria', name: 'Black Maria', title: 'Tobi Roppo — mistress of the pleasure hall', island: 'onigashima', at: { spot: 'pleasure_hall' },
    hostile: true, named: true, level: 77, faction: 'pirate', style: 'brawler', moves: ['nw2_marianette', 'brawl_tackle'], haki: { armament: 40 },
    look: { hair: 'long', hairColor: '#212121', top: '#880e4f', bottom: '#ad1457', skin: '#f1c9a0', bulk: 1.3 }, scale: 1.6, bounty: 480000000, infamy: true, skill: 0.45,
    alert: 'Ara ara~ a new guest for my web?', when: (c) => !beat(c, 'black_maria'),
  },
  {
    id: 'sasaki', name: 'Sasaki', title: 'Tobi Roppo — commander of the Armored Division', island: 'onigashima', at: { spot: 'southern_gate' },
    hostile: true, named: true, level: 78, faction: 'pirate', style: 'ittoryu', weapon: 'sword', moves: ['itto_whirl', 'nw2_tamaceratops'], haki: { armament: 45 },
    look: { hair: 'pompadour', hairColor: '#212121', top: '#fafafa', bottom: '#212121', coat: '#8d6e63', swords: 1 }, bounty: 472000000, infamy: true, skill: 0.5,
    alert: 'Armored Division, formation!', when: (c) => !beat(c, 'sasaki'),
  },
  {
    id: 'ulti', name: 'Ulti', title: 'Tobi Roppo', island: 'onigashima', at: { spot: 'torii_gate', ox: -3 },
    hostile: true, named: true, level: 75, faction: 'pirate', style: 'brawler', moves: ['nw2_ul_zugan', 'brawl_headbutt'], haki: { armament: 40 },
    look: { hair: 'long', hairColor: '#29b6f6', top: '#e1f5fe', bottom: '#0277bd', skin: '#f9dcc4', hat: 'horns', hatColor: '#fafafa' }, bounty: 400000000, infamy: true, skill: 0.45,
    alert: 'Who said you could walk on Onigashima?!', when: (c) => !beat(c, 'ulti'),
  },
  {
    id: 'page_one', name: 'Page One', title: 'Tobi Roppo', island: 'onigashima', at: { spot: 'torii_gate', ox: 3 },
    hostile: true, named: true, level: 72, faction: 'pirate', style: 'brawler', moves: ['nw2_spino_bite', 'brawl_tackle'], haki: { armament: 35 },
    look: { hair: 'spiky', hairColor: '#212121', top: '#fafafa', bottom: '#212121', coat: '#1565c0' }, bounty: 290000000, infamy: true, skill: 0.4,
    alert: 'Sis, stay back — I\'ve got this one.', when: (c) => !beat(c, 'page_one'),
  },

  // ================================================================ BALTIGO
  {
    id: 'rev_officer_baltigo', name: 'Revolutionary Officer', title: 'Remnant cell of the Revolutionary Army', island: 'baltigo', at: { town: 'baltigo_ruins', building: 'Revolutionary Training Ground' },
    trainer: 'revolutionary', faction: 'revolutionary', level: 60, look: { hair: 'short', hairColor: '#212121', top: '#212121', bottom: '#4e342e', coat: '#3e2723', hat: 'tricorne', hatColor: '#212121' },
    marker: (c, g) => (!g.quests.state('baltigo_archive') ? '!' : g.quests.stageId('baltigo_archive') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (isDone(ctx.game, 'baltigo_archive')
          ? `"Dragon's dossier is safe. The Army will remember you — and so will the Holy Land, if they ever find out. Keep your head down, friend."`
          : `"Baltigo was our headquarters until the Blackbeard Pirates came. Dragon moved the Army to Momoiro Island; I stayed to burn what we couldn't carry. Now scavengers are picking through the ruins."`),
        choices: [
          { text: 'Train with the Revolutionary Army', do: (c) => c.open('trainer', { trainer: 'revolutionary' }) },
          { text: 'I\'ll clear out the scavengers.', if: () => !ctx.quest('baltigo_archive'), do: (c) => c.startQuest('baltigo_archive'), end: true },
          { text: 'Here is the dossier.', if: () => stage(ctx.game, 'baltigo_archive') === 'report', do: (c) => c.complete('baltigo_archive'), next: 'thanks' },
          { text: 'Goodbye.', end: true },
        ],
      },
      thanks: { text: `"Sealed, unread. Good. Let me show you something Sabo taught us — the Dragon Claw. A grip that can crush the bars of any cage the world puts you in."` },
    } }),
  },

  // ========================================================== WINNER ISLAND
  {
    id: 'heart_pirate_winner', name: 'Heart Pirates Crewman', title: 'Stranded after the ambush', island: 'winner_island', at: { spot: 'heart_boat' },
    look: { hair: 'short', hairColor: '#6d4c41', top: '#fafafa', bottom: '#fafafa', hat: 'beanie', hatColor: '#fafafa' }, level: 35,
    marker: (c, g) => (!g.quests.state('winner_ambush') ? '!' : g.quests.stageId('winner_ambush') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (isDone(ctx.game, 'winner_ambush')
          ? `"Thanks. I'll wait here with the boat. The captain always comes back for his crew."`
          : `"Blackbeard ambushed us here, for our Road Poneglyph copies! Captain Law fought him... I saw him and Bepo escape into the sea. The rest of us scattered. That monster Burgess is still on the beach, hunting stragglers."`),
        choices: [
          { text: 'I\'ll deal with Burgess.', if: () => !ctx.quest('winner_ambush'), do: (c) => c.startQuest('winner_ambush'), end: true },
          { text: 'Burgess won\'t hunt anyone now.', if: () => stage(ctx.game, 'winner_ambush') === 'report', do: (c) => c.complete('winner_ambush'), next: 'thanks' },
          { text: 'Stay hidden.', end: true },
        ],
      },
      thanks: { text: `"You beat the Champion?! ...Here, take this. The captain would pay you back himself, but he's busy staying alive. If you ever meet a man with a spotted hat and a big sword, tell him Winner Island owes you."` },
    } }),
  },
  {
    id: 'burgess_winner', name: '"Champion" Jesus Burgess', title: 'Captain of the 1st ship, Blackbeard Pirates', island: 'winner_island', at: { spot: 'bb_camp' },
    hostile: true, boss: true, hpMul: 1.8, level: 84, faction: 'pirate', style: 'brawler', moves: ['nw2_galleon_lariat', 'nw2_champion_driver', 'nw2_hado_elbow'],
    haki: { armament: 60, observation: 40 }, look: { hair: 'bald', top: '#1565c0', bottom: '#212121', hat: 'headband', hatColor: '#1565c0', skin: '#e0ac7e', bulk: 1.8 }, bulk: 1.8,
    breakthrough: 5, skill: 0.5, alert: 'WEEEHAHAHA! A fresh challenger for the Champion!', barks: ['WEEEHAHAHA!', 'Strength is everything!'],
    when: (c) => !beat(c, 'burgess_winner'),
  },

  // ========================================================== GARTEL ISLAND
  {
    id: 'gartel_mayor', name: 'Mayor of Gartel', title: 'Gartel Town', island: 'gartel_island', at: { town: 'gartel_town', building: "Mayor's Office" },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#5d4037', bottom: '#3e2723', hat: 'captain', hatColor: '#5d4037' }, level: 5,
    marker: (c, g) => (!g.quests.state('red_hair_flag') ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (isDone(ctx.game, 'red_hair_flag')
          ? `"The Red-Haired himself stood on our pier and laughed — and paid for the burned buildings! What kind of pirate does that?"`
          : `"Some pirates in a ridiculous ship burned the Red Hair Pirates' flag over our town! That flag was our protection. If Shanks hears of this... we're finished. Or they are. Probably they are."`),
        choices: [
          { text: 'I\'ll raise a new flag.', if: () => !ctx.quest('red_hair_flag'), do: (c) => c.startQuest('red_hair_flag'), end: true },
          { text: 'Goodbye.', end: true },
        ],
      },
    } }),
  },
  {
    id: 'shanks_gartel', name: 'Shanks', title: '"Red-Haired" — Emperor of the Sea', island: 'gartel_island', at: { spot: 'gartel_pier' }, ai: 'idle', faction: 'neutral', invulnerable: true,
    look: { hair: 'short', hairColor: '#c62828', top: '#fafafa', bottom: '#5d4037', coat: '#212121', scarEye: true, skin: '#f1c9a0', swords: 1 }, level: 120, fixedPower: 99999,
    when: (c, g) => g.quests.stageId('red_hair_flag') === 'shanks',
    marker: (c, g) => (g.quests.stageId('red_hair_flag') === 'shanks' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: `"Dahahaha! So you're the one who put our flag back up? Thanks. ...You've got a look in your eye. Like a kid I once knew, in a little village in the East Blue."`,
        choices: [
          { text: 'What do you want with the One Piece?', next: 'op' },
          { text: 'Test my will.', next: 'haki' },
        ],
      },
      op: { text: `"It's time we went and got it, that's all. Whoever reaches Laugh Tale decides what happens to this world. I'd rather it wasn't Blackbeard. Or the Holy Land. ...Or my brother." (He grins, and says no more.)`, onEnter: (c) => c.complete('red_hair_flag') },
      haki: { text: `(Shanks doesn't move. The air turns to iron and your knees buckle... but you stay standing.) "Hoh. Not bad at all. Keep that will — you'll need it on the last island."`, onEnter: (c) => c.complete('red_hair_flag') },
    } }),
  },

  // ================================================================ EGGHEAD
  {
    id: 'vegapunk', name: 'Dr. Vegapunk ("Stella")', title: 'The world\'s greatest scientist', island: 'egghead', at: { town: 'labophase', building: "Vegapunk's Laboratory" },
    look: { hair: 'long', hairColor: '#8d6e63', top: '#fafafa', bottom: '#fafafa', coat: '#fafafa', skin: '#f1c9a0', goggles: true }, level: 12,
    when: (c, g) => !g.quests.isDone('egghead_incident') && g.quests.stageId('egghead_incident') !== 'report',
    marker: (c, g) => (g.quests.stageId('egghead_incident') === 'meet' || !g.quests.state('egghead_incident') ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => {
          const s = stage(ctx.game, 'egghead_incident');
          if (s === 'seraphim') return `"York gave the Seraphim's authority to CP0! They were grown from the lineage factors of Warlords — Hawk-Eyes, Kuma, the Pirate Empress, Jinbe... Please stop them before they reach the lab!"`;
          if (s === 'lucci') return `"Rob Lucci of CP0 is hunting me through the Fabriophase. The Government wants my brain — and my silence."`;
          if (s === 'kizaru') return `"Borsalino... he was my friend once. Now he comes with a Buster Call. Whatever happens to me, the message must reach the world."`;
          if (s === 'message') return `"It has begun. Every Den Den Mushi in the world is listening."`;
          return `"Oh! A visitor who got past the Frontier Dome? Welcome to Egghead, the island of the future! I am Vegapunk — the original, "Stella". My six satellites do the thinking. And the eating. And the scheming, apparently..."`;
        },
        choices: [
          { text: 'Why is the World Government after you?', if: () => !ctx.flag('nw2_met_vegapunk'), do: (c) => { c.setFlag('nw2_met_vegapunk'); if (!c.quest('egghead_incident')) c.startQuest('egghead_incident'); }, next: 'why' },
          { text: 'What are the Seraphim?', next: 'ser' },
          { text: 'Goodbye, doctor.', end: true },
        ],
      },
      why: { text: `"I know too much. About the Void Century. About the Mother Flame. About why the sea keeps rising... I have recorded a message for the whole world. If they come for me, it must still be heard."`, next: 'a' },
      ser: { text: `"The strongest weapons of the World Government: children of Lunarian blood, carrying the lineage factors of the Warlords. S-Hawk, S-Bear, S-Snake, S-Shark... In the wrong hands they are a nightmare."`, next: 'a' },
    } }),
  },
  {
    id: 'vegapunk_shaka', name: 'Shaka', title: 'Vegapunk satellite "Good" (Punk-01)', island: 'egghead', at: { town: 'labophase', plaza: true, ox: -3 },
    look: { hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa', coat: '#e0e0e0', goggles: true }, level: 30,
    when: (c, g) => !g.quests.state('egghead_incident') || g.quests.stageId('egghead_incident') === 'meet' || g.quests.stageId('egghead_incident') === 'seraphim',
    dialogue: () => ({ start: 'a', nodes: { a: { text: `"I am Shaka, Vegapunk's "good". Each of us is a piece of the doctor's mind: Lilith his "evil", York his "greed", Edison his "thinking"... And one of us has betrayed him. I have my suspicions."` } } }),
  },
  {
    id: 'vegapunk_york', name: 'York', title: 'Vegapunk satellite "Greed" (Punk-06)', island: 'egghead', at: { town: 'labophase', plaza: true, ox: 3 },
    look: { hair: 'curly', hairColor: '#ffcc80', top: '#ffab91', bottom: '#ffab91', skin: '#f9dcc4', bulk: 1.5 }, level: 25,
    when: (c, g) => !g.quests.state('egghead_incident') || g.quests.stageId('egghead_incident') === 'meet',
    dialogue: () => ({ start: 'a', nodes: { a: { text: `"*munch* I'm York, the doctor's "greed". Eating, sleeping, going to the toilet — I do it all so the others don't have to. ...Why are you looking at me like that? I'm not hiding anything."` } } }),
  },
  {
    id: 'vegapunk_lilith', name: 'Lilith', title: 'Vegapunk satellite "Evil" (Punk-02)', island: 'egghead', at: { town: 'labophase', building: "Lilith's Workshop" },
    look: { hair: 'long', hairColor: '#ff7043', top: '#f48fb1', bottom: '#f48fb1', coat: '#7b1fa2', hat: 'goggles', hatColor: '#c62828', skin: '#f9dcc4' }, level: 45,
    style: 'sniper', weapon: 'gun', ranged: true,
    marker: (c, g) => (g.quests.stageId('egghead_incident') === 'report' ? '?' : null),
    recruit: {
      role: 'archaeologist', fighter: false, requires: (c, g) => g.quests.isDone('egghead_incident'),
      pitch: `"A Vegapunk on your crew? Heh — I'm the evil one, you know. ...The doctor deciphered the ancient script from the books of Ohara, and I remember everything he knew. If you're heading for Laugh Tale you'll need someone who can read the Road Poneglyphs. I'm in!"`,
    },
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => {
          if (stage(ctx.game, 'egghead_incident') === 'report') return `"The broadcast got out... the whole world heard it. The doctor is gone. ...Don't look at me like that, I'm the "evil" one, I don't cry. We have to get off this island before the Elders sink it."`;
          if (isDone(ctx.game, 'egghead_incident')) return `"The doctor said the fate of the world depends on whoever finds the One Piece. So — are you going to find it or not?"`;
          return `"Lilith, Punk-02, genius of evil! Don't touch anything in my workshop. Especially the red button. ...ESPECIALLY that one."`;
        },
        choices: [
          { text: 'Let\'s get out of here.', if: () => stage(ctx.game, 'egghead_incident') === 'report', do: (c) => c.complete('egghead_incident'), next: 'after' },
          { text: 'Goodbye.', end: true },
        ],
      },
      after: { text: `"The Seraphim are in bubbles, Kizaru is licking his wounds, and the Elders... we don't talk about the Elders. If you're chasing the Road Poneglyphs, I could come with you. The doctor could read them. So can I."`, next: 'a' },
    } }),
  },
  {
    id: 'lucci_cp0', name: 'Rob Lucci', title: 'CP0 agent', island: 'egghead', at: { town: 'fabriophase', plaza: true, ox: 3 },
    hostile: true, boss: true, hpMul: 1.8, level: 90, faction: 'cp', style: 'rokushiki', fruit: 'neko_leopard', fruitMastery: 90,
    moves: ['roku_soru', 'roku_rankyaku', 'roku_rokuogan', 'neko_hybrid', 'neko_claw', 'neko_pounce'], haki: { armament: 70, observation: 70 },
    look: { hair: 'long', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa', coat: '#fafafa', hat: 'captain', hatColor: '#fafafa', skin: '#f1c9a0' },
    breakthrough: 5, skill: 0.7, alert: 'Justice is the power to take lives in the name of the world. Stand aside.',
    when: (c, g) => g.quests.stageId('egghead_incident') === 'lucci' && !beat(c, 'lucci_cp0'),
  },
  {
    id: 'kaku_cp0', name: 'Kaku', title: 'CP0 agent "Mountain Wind"', island: 'egghead', at: { town: 'fabriophase', plaza: true, ox: -3 },
    hostile: true, named: true, level: 82, faction: 'cp', style: 'rokushiki', moves: ['roku_rankyaku', 'roku_soru', 'roku_tekkai'], haki: { armament: 55, observation: 50 },
    look: { hair: 'short', hairColor: '#ff8f00', top: '#fafafa', bottom: '#fafafa', hat: 'captain', hatColor: '#fafafa', nose: 'long' }, skill: 0.6,
    when: (c, g) => g.quests.stageId('egghead_incident') === 'lucci' && !beat(c, 'kaku_cp0'),
  },
  {
    id: 'kizaru_egghead', name: '"Kizaru" Borsalino', title: 'Admiral of the Marines', island: 'egghead', at: { spot: 'labophase_gate' },
    hostile: true, boss: true, hpMul: 2.6, level: 112, faction: 'marine', style: 'rokushiki', fruit: 'pika', fruitMastery: 100,
    moves: ['pika_yasakani', 'pika_yata', 'pika_murakumo', 'pika_amaterasu', 'roku_geppo'], haki: { armament: 90, observation: 90 },
    look: { hair: 'short', hairColor: '#212121', top: '#fdd835', bottom: '#fdd835', coat: '#fafafa', coatText: 'JUSTICE', goggles: true, skin: '#e0ac7e' },
    lethal: false, bounty: 500000000, breakthrough: 7, skill: 0.7, leash: 24,
    alert: 'Ooh~ how scary... Sorry, but I have orders. A Buster Call is on its way.', barks: ['Have you ever been kicked at the speed of light?', 'Ooh~ scary...'],
    when: (c, g) => g.quests.stageId('egghead_incident') === 'kizaru' && !beat(c, 'kizaru_egghead'),
  },
  {
    id: 'saturn_cameo', name: 'Saint Jaygarcia Saturn', title: 'One of the Five Elders', island: 'egghead', at: { spot: 'labophase_gate', ox: 7 }, ai: 'idle', faction: 'neutral', invulnerable: true,
    look: { hair: 'bald', skin: '#eceff1', top: '#212121', bottom: '#212121', coat: '#212121', hand: '#eceff1' }, scale: 1.2, level: 150, fixedPower: 99999,
    when: (c, g) => g.quests.stageId('egghead_incident') === 'kizaru',
    dialogue: () => ({ start: 'a', nodes: { a: { text: `(An old man in black looks through you as if you were already dead.) "...Vermin. The Holy Land has no need to learn your name."` } } }),
  },

  // ================================================================= ELBAPH
  {
    id: 'jarul', name: '"Mountain Beard" Jarul', title: 'Elder of the Western Village — the oldest giant alive', island: 'elbaf', at: { town: 'western_village', building: "Elder Jarul's Longhouse" },
    look: { hair: 'long', hairColor: '#eceff1', top: '#4e342e', bottom: '#3e2723', coat: '#212121', hat: 'horns', hatColor: '#9e9e9e', bulk: 1.5 }, scale: 2.6, level: 95,
    marker: (c, g) => (!g.quests.state('elbaf_siege') || g.quests.stageId('elbaf_siege') === 'jarul' ? '!' : g.quests.stageId('elbaf_siege') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => {
          const s = stage(ctx.game, 'elbaf_siege');
          if (isDone(ctx.game, 'elbaf_siege')) return `"The children sleep without nightmares again. Elbaph does not forget its friends, little one. Ever."`;
          if (s === 'school' || s === 'killingham') return `"Their nightmares walk! The Knight called Killingham blows a horn and the beasts come. Defend the school, warrior!"`;
          return `"Hoho... a human in the Sun World? Welcome to Elbaph, the Warland. Once we lived for war alone. King Harald taught our children to read. Now men from the Holy Land want our warriors for their own war."`;
        },
        choices: [
          { text: 'Men from the Holy Land?', if: () => !ctx.quest('elbaf_siege') || stage(ctx.game, 'elbaf_siege') === 'jarul', do: (c) => { c.setFlag('nw2_met_jarul'); if (!c.quest('elbaf_siege')) c.startQuest('elbaf_siege'); }, next: 'knights' },
          { text: 'The Knight of God is gone.', if: () => stage(ctx.game, 'elbaf_siege') === 'report', do: (c) => c.complete('elbaf_siege'), next: 'thanks' },
          { text: 'Farewell, elder.', end: true },
        ],
      },
      knights: { text: `"The Knights of God. They say a Great War is coming and Elbaph must choose a side. We choose our own side! ...Hear that? Screams from the Walrus School. Go, warrior — Elbaph's children first!"` },
      thanks: { text: `"Take this helm. Every warrior in Elbaph will know you fought for our children."` },
    } }),
  },
  {
    id: 'hajrudin_elbaf', name: 'Hajrudin', title: 'Captain of the New Giant Warrior Pirates', island: 'elbaf', at: { town: 'western_village', building: 'Hall of Warriors' }, trainer: 'elbaf_warrior',
    look: { hair: 'long', hairColor: '#212121', top: '#8d6e63', bottom: '#5d4037', hat: 'horns', hatColor: '#9e9e9e', bulk: 1.3 }, scale: 2, level: 82, style: 'elbaf', weapon: 'axe',
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: `"GEGYAGYAGYA! A little warrior in the Hall of Warriors! I am Hajrudin. I once dreamed of being King of Elbaph — then a man in a straw hat knocked me flat. So I became a pirate instead. Want to learn how giants fight?"`,
      choices: [
        { text: 'Train as a warrior of Elbaph', do: (c) => c.open('trainer', { trainer: 'elbaf_warrior' }) },
        { text: 'Farewell.', end: true },
      ],
    } } }),
  },
  {
    id: 'gaban_elbaf', name: 'Scopper Gaban', title: '"Left Hand of the Pirate King"', island: 'elbaf', at: { town: 'western_village', building: "Gaban's Lodge" }, trainer: 'nw2_gaban',
    look: { hair: 'long', hairColor: '#424242', top: '#fafafa', bottom: '#212121', skin: '#e0ac7e', hat: 'bandana', hatColor: '#6d4c41' }, level: 105, style: 'elbaf', weapon: 'axe',
    haki: { armament: 90, observation: 85, conqueror: 85 },
    marker: (c, g) => (!g.quests.state('burn_scar') && !c.flags.rubbing_road_4 && count(c, 'poneglyph_rubbing') >= 1 ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: `"Hm? Gaban. Just an old man living among the giants. ...Yeah, I sailed with Roger. Rayleigh was his right hand; I was his left. We laughed a lot on that last island."`,
        choices: [
          { text: 'Teach me.', do: (c) => c.open('trainer', { trainer: 'nw2_gaban' }) },
          { text: 'What is on Laugh Tale?', next: 'lt' },
          { text: 'Where is the fourth Road Poneglyph?', if: () => !ctx.flag('rubbing_road_4') && !isDone(ctx.game, 'burn_scar'), next: 'fourth' },
          { text: 'Farewell.', end: true },
        ],
      },
      lt: { text: `"Wahaha! If I told you, you'd never forgive me. Some things you have to see with your own eyes. ...It's a funny story. That's all I'll say."`, next: 'a' },
      fourth: { text: `"Roger found the fourth red stone in the Sea Forest, down by Fish-Man Island. It isn't there anymore. Sailors whisper about a man with a burn scar, an all-black ship, and whirlpools that swallow anyone who follows. They gather around Lodestar, they say."`, onEnter: (c) => { if (!c.quest('burn_scar')) c.startQuest('burn_scar'); }, next: 'a' },
    } }),
  },
  {
    id: 'saul_elbaf', name: 'Jaguar D. Saul', title: 'Giant scholar of the Owl Library', island: 'elbaf', at: { town: 'owl_library', building: 'Owl Library' },
    look: { hair: 'curly', hairColor: '#bdbdbd', top: '#795548', bottom: '#5d4037', grin: true, bulk: 1.5 }, scale: 2.6, level: 88,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: `"Dereshishishi! Welcome to the Owl Library! Every book here was pulled from the lake of Ohara after the Buster Call. The scholars died so that knowledge could live — so read, little one, read!"`,
        choices: [
          { text: 'Read in the library', do: (c) => c.open('library') },
          { text: 'You knew Ohara?', next: 'robin' },
          { text: 'Farewell.', end: true },
        ],
      },
      robin: { text: `"I told a little girl there, once: no one is born into this world alone. Someday you'll find friends who will protect you. ...She did. Dereshishishi!"`, next: 'a' },
    } }),
  },
  {
    id: 'mato_elbaf', name: 'Mato', title: "Proprietor of Ida's Bar", island: 'elbaf', at: { town: 'ida_bar', building: "Ida's Bar" },
    look: { hair: 'bun', hairColor: '#8d6e63', top: '#a1887f', bottom: '#5d4037', bulk: 1.2 }, scale: 2.3, level: 30,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: `"A human in the Underworld? Brave or stupid. Sit, sit. Ida built this bar for anyone the cold spat out — pirates, fishermen, even the Red Hair Pirates. Shanks drank here while he ran his errands."`,
      choices: [
        { text: 'Food and mead', do: (c) => c.open('shop', { shop: 'elbaf_tavern', building: { name: "Ida's Bar", role: 'bar' } }) },
        { text: 'Goodbye.', end: true },
      ],
    } } }),
  },
  {
    id: 'loki', name: 'Loki', title: '"The Accursed Prince" of Elbaph', island: 'elbaf', at: { spot: 'loki_chains' }, faction: 'neutral',
    look: { hair: 'long', hairColor: '#e91e63', top: '#4e342e', bottom: '#3e2723', skin: '#e0c2a2', sharpTeeth: true, grin: true, bulk: 1.5 }, scale: 3, level: 108,
    boss: true, respawn: true, hpMul: 2.4, style: 'elbaf', weapon: 'axe', moves: ['nw2_ragna_arrow', 'nw2_thorheim', 'nw2_niflheim', 'elbaf_hakoku'],
    haki: { armament: 90, observation: 80, conqueror: 90 }, bounty: 2600000000, breakthrough: 7, lethal: false, skill: 0.65, // a friendly duel: no infamy
    duel: true, recover: 4, recoverLine: '"Hehehe... not bad, little one. Come here — let\'s talk."',
    alert: 'Show me you\'re worth following, little warrior!', barks: ['Hahahaha!', 'The Sun God will end this world!'],
    marker: (c, g) => (g.quests.stageId('accursed_prince') === 'free' && has(c, 'loki_chain_key') ? '?' : g.quests.stageId('accursed_prince') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => {
          const s = stage(ctx.game, 'accursed_prince');
          if (s === 'report') return `"...Heh. Hehehe. You hit like a giant. Fine — you've earned a word from the Shame of Elbaph."`;
          if (isDone(ctx.game, 'accursed_prince')) return `"Still alive? Good. This world is about to get interesting."`;
          if (s === 'free' && ctx.has('loki_chain_key')) return `(The key fits the seastone chains.) "Well? Turn it, little one. Or are you afraid of what I'll do?"`;
          return `(A giant larger than any you have seen, chained to the roots of the Adam Tree with seastone.) "Hah? A human come to laugh at the Shame of Elbaph? I killed my father, they say. Free me, and I'll tell you about the Sun God."`;
        },
        choices: [
          { text: 'Where is the key?', if: () => !ctx.quest('accursed_prince'), do: (c) => c.startQuest('accursed_prince'), next: 'key' },
          { text: 'Turn the key.', if: () => stage(ctx.game, 'accursed_prince') === 'free' && ctx.has('loki_chain_key'), do: (c) => { c.take('loki_chain_key', 1); c.stage('accursed_prince', 'duel'); aggro(c.game, findActor(c.game, 'loki')); }, end: true },
          { text: 'Tell me about the Sun God.', if: () => stage(ctx.game, 'accursed_prince') === 'report', do: (c) => c.complete('accursed_prince'), next: 'lore' },
          { text: 'Leave him.', end: true },
        ],
      },
      key: { text: `"In Aurust Castle, where I fought my father and a hundred warriors. It's sealed up with their bones. Bring me the key — if the dead let you."` },
      lore: { text: `"The giants have waited eight hundred years for the Sun God, Nika, the warrior who makes people laugh. When he comes, this world ends and a new one begins. When you reach that last island, look for the name Joy Boy. The Holy Land fears it more than anything."` },
    } }),
  },
  {
    id: 'killingham', name: 'Saint Rimoshifu Killingham', title: 'Knight of God (World Noble)', island: 'elbaf', at: { spot: 'walrus_school' },
    hostile: true, boss: true, hpMul: 2.2, level: 100, faction: 'cp', style: 'brawler', moves: ['nw2_flame_clouds', 'nw2_nightmare_holes', 'nw2_nightmare_roar', 'nw2_mma_horn'],
    look: { hair: 'long', hairColor: '#212121', top: '#ef6c00', bottom: '#212121', coat: '#ef6c00', sharpTeeth: true, skin: '#f1c9a0' }, scale: 1.4,
    haki: { armament: 80, observation: 70 }, bounty: 500000000, breakthrough: 6, skill: 0.6,
    alert: 'Nightmares are such lovely things. Let\'s see what yours look like.', barks: ['Dream for me!', 'A World Noble does not bleed for giants!'],
    phases: [{ at: 0.5, run: (a, g) => { g.fx.text(a.x, a.y - 3, 'Qilin form!', '#ffcc80', 0.5); a.addBuff({ id: 'qilin', name: 'Qilin Form', dur: 40, mods: { damage: 1.35, speedMul: 1.2 } }); } }],
    when: (c, g) => g.quests.stageId('elbaf_siege') === 'killingham' && !beat(c, 'killingham'),
  },
  {
    id: 'sigrid_elbaf', name: 'Sigrid', title: 'Young huntress of the Huntsmen Village', island: 'elbaf', at: { town: 'western_village', plaza: true, ox: -5 },
    look: { hair: 'ponytail', hairColor: '#ffcc80', top: '#6d4c41', bottom: '#4e342e', hat: 'horns', hatColor: '#9e9e9e' }, scale: 2, level: 62,
    style: 'sniper', weapon: 'gun', ranged: true, moves: ['snipe_explode', 'snipe_firebird'],
    recruit: {
      role: 'sniper', fighter: true, requires: (c, g) => g.quests.isDone('elbaf_siege'),
      pitch: `"The Huntsmen Village is too small for my arrows! King Harald said the young ones should see the world beyond the fog. My bow can bring down a Sea King at three hundred paces. Take me — I'll try not to sink your ship!"`,
    },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (isDone(ctx.game, 'elbaf_siege')
        ? `"You fought the Knight of God for our children. A warrior like that... I'd follow them anywhere."`
        : `"Oi, little one! Mind my arrows. I'm Sigrid of the Huntsmen Village. We're warriors — but I want to see the Blue Sea, not just hunt wolves in the Underworld."`),
      choices: [{ text: 'Goodbye, Sigrid.', end: true }],
    } } }),
  },

  // ============================================================== HACHINOSU
  {
    id: 'laffitte_hachinosu', name: 'Laffitte', title: 'Navigator of the Blackbeard Pirates', island: 'hachinosu', at: { town: 'hachinosu_town', building: "Pirates' Paradise Tavern" }, faction: 'neutral',
    look: { hair: 'long', hairColor: '#eceff1', skin: '#fafafa', top: '#212121', bottom: '#212121', coat: '#212121', hat: 'captain', hatColor: '#212121' }, level: 80,
    marker: (c, g) => (!g.quests.state('burn_scar') && !c.flags.rubbing_road_4 ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: `"Welcome to Hachinosu, the pirates' paradise! I am Laffitte. Our captain is away collecting... things. Can I interest you in a rumour? Rumours are my trade."`,
        choices: [
          { text: 'Rumours about the Road Poneglyphs?', next: 'hino' },
          { text: 'Food and drink', do: (c) => c.open('shop', { shop: 'tavern', building: { name: "Pirates' Paradise Tavern", role: 'bar' } }) },
          { text: 'Goodbye.', end: true },
        ],
      },
      hino: { text: `"Two red stones belonged to Big Mom and Kaido. One sleeps in the whale of Zou. And the fourth... a man with a burn scar keeps it, they say, sailing an all-black ship. He raises whirlpools that swallow anyone who follows. Last seen near Lodestar."`, onEnter: (c) => { if (!c.quest('burn_scar') && !c.flag('rubbing_road_4')) c.startQuest('burn_scar'); }, next: 'a' },
    } }),
  },
  {
    id: 'teach_hachinosu', name: '"Blackbeard" Marshall D. Teach', title: 'Emperor of the Sea — Admiral of the Blackbeard Pirates', island: 'hachinosu', at: { spot: 'skull_fortress' }, faction: 'neutral',
    boss: true, hpMul: 3, level: 110, style: 'brawler', fruit: 'yami', fruitMastery: 100,
    moves: ['yami_kurouzu', 'yami_blackhole', 'yami_nullify', 'yami_liberation', 'gura_punch', 'gura_kaishin', 'gura_wave', 'gura_tsunami'],
    haki: { armament: 85, observation: 75 }, look: L.teach, bulk: 1.7, bounty: 3996000000, infamy: true, breakthrough: 8, skill: 0.7,
    alert: 'Zehahahaha! People\'s dreams... never end!', barks: ['Zehahahaha!', 'The darkness swallows everything!', 'I\'ll be the King of the Pirates!'],
    phases: [{ at: 0.5, run: (a, g) => { g.fx.text(a.x, a.y - 3, 'Kurouzu!', '#b39ddb', 0.6); a.addBuff({ id: 'two_fruits', name: 'Darkness and Tremors', dur: 60, mods: { damage: 1.35 } }); } }],
    when: (c) => !beat(c, 'teach_hachinosu'),
    marker: (c, g) => (g.quests.stageId('blackbeard_showdown') === 'teach' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: `"Zehahahaha! A guest on Pirate Island! I'm Marshall D. Teach — the man who'll be King of the Pirates. Two Devil Fruits in one body: darkness and tremors! Want to join me? Or... do you want to die?"`,
        choices: [
          { text: 'I\'ll never join you.', if: () => !ctx.quest('blackbeard_showdown'), do: (c) => c.startQuest('blackbeard_showdown'), next: 'captains' },
          { text: 'Your captains are down. Fight me, Blackbeard!', if: () => stage(ctx.game, 'blackbeard_showdown') === 'teach', do: (c) => aggro(c.game, findActor(c.game, 'teach_hachinosu')), end: true },
          { text: 'Leave the fortress.', end: true },
        ],
      },
      captains: { text: `"Zehahaha! Then get past my Titanic Captains first! Shiryu, Pizarro, Devon — beat two of them and I'll dance with you myself!"` },
    } }),
  },
  {
    id: 'shiryu_hachinosu', name: 'Shiryu of the Rain', title: 'Captain of the 2nd ship, Blackbeard Pirates', island: 'hachinosu', at: { spot: 'captains_yard' },
    hostile: true, boss: true, hpMul: 1.7, level: 96, faction: 'pirate', style: 'ittoryu', weapon: 'sword', moves: ['itto_iai', 'nw2_shisha_no_te', 'itto_whirl'],
    haki: { armament: 70, observation: 65 }, look: { hair: 'long', hairColor: '#212121', top: '#212121', bottom: '#212121', coat: '#37474f', swords: 1, sharpTeeth: true },
    breakthrough: 5, skill: 0.7, alert: 'The rain is starting. You won\'t even see me cut you.',
    when: (c, g) => !!g.quests.state('blackbeard_showdown') && !beat(c, 'shiryu_hachinosu'),
  },
  {
    id: 'pizarro_hachinosu', name: 'Avalo Pizarro', title: '"Corrupt King" — Captain of the 4th ship', island: 'hachinosu', at: { town: 'hachinosu_town', building: 'Prison Block', ox: -2 },
    hostile: true, boss: true, hpMul: 1.6, level: 92, faction: 'pirate', style: 'brawler', moves: ['nw2_island_fist', 'brawl_tackle'], haki: { armament: 60 },
    look: { hair: 'bald', top: '#4e342e', bottom: '#212121', hat: 'crown', hatColor: '#ffd54f', skin: '#d7a67a', bulk: 1.6 }, bulk: 1.6,
    breakthrough: 5, skill: 0.5, alert: 'The whole island is my body! Where will you run?',
    when: (c, g) => (g.quests.stageId('koby_escape') === 'guards' || !!g.quests.state('blackbeard_showdown')) && !beat(c, 'pizarro_hachinosu'),
  },
  {
    id: 'devon_hachinosu', name: 'Catarina Devon', title: '"Crescent Moon Hunter" — Captain of the 6th ship', island: 'hachinosu', at: { spot: 'captains_yard', ox: 4 },
    hostile: true, boss: true, hpMul: 1.5, level: 88, faction: 'pirate', style: 'ittoryu', weapon: 'sword', moves: ['nw2_kitsune_mirage', 'itto_iai'], haki: { armament: 55, observation: 55 },
    look: { hair: 'long', hairColor: '#8e24aa', top: '#212121', bottom: '#212121', grin: true }, breakthrough: 4, skill: 0.55,
    alert: 'Mwahahaha! Which one of me is real, darling?',
    when: (c, g) => !!g.quests.state('blackbeard_showdown') && !beat(c, 'devon_hachinosu'),
  },
  {
    id: 'koby_hachinosu', name: 'Koby', title: 'Marine Captain (held captive)', island: 'hachinosu', at: { town: 'hachinosu_town', building: 'Prison Block' }, faction: 'neutral',
    look: { hair: 'short', hairColor: '#f48fb1', top: '#fafafa', bottom: '#1565c0', coat: '#fafafa', coatText: 'JUSTICE' }, level: 60,
    when: (c, g) => !c.flags.nw2_kobyRunning && !g.quests.isDone('koby_escape'),
    marker: (c, g) => (!g.quests.state('koby_escape') ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: `"Please — keep your voice down! I'm Koby, a Marine captain. Blackbeard wants to trade me to the Government in exchange for recognising this island as a nation. I refuse to be a bargaining chip! If someone kept Avalo Pizarro busy, I could find my own way to the harbour."`,
      choices: [
        { text: 'I\'ll keep Pizarro busy.', if: () => !ctx.quest('koby_escape'), do: (c) => c.startQuest('koby_escape'), end: true },
        { text: 'Hang in there.', end: true },
      ],
    } } }),
  },

  // ============================================================= KARAI BARI
  {
    id: 'buggy_cross_guild', name: 'Buggy', title: 'Emperor of the Sea — Leader of the Cross Guild (allegedly)', island: 'karai_bari', at: { town: 'buggy_town', plaza: true, ox: 2 }, faction: 'neutral', invulnerable: true,
    look: { hair: 'long', hairColor: '#1976d2', top: '#e53935', bottom: '#1565c0', skin: '#fafafa', nose: 'red', hat: 'captain', hatColor: '#6d4c41', coat: '#fafafa' }, level: 60, fixedPower: 99999,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (ctx.char.bosses.includes('buggy')
          ? `"YOU AGAIN?! ...I mean — ahem. Welcome to Buggy Town, headquarters of the Cross Guild, run by ME, Emperor Buggy! Crocodile and Hawk-Eyes are my loyal subordinates. Totally. Don't tell them I said that."`
          : `"Gyahahaha! Welcome to Buggy Town, headquarters of the Cross Guild! I, Emperor Buggy, am putting bounties on the Marines themselves! Flashy, right?! ...Crocodile and Hawk-Eyes? My loyal subordinates. Totally."`),
        choices: [
          { text: 'Heard anything about the One Piece?', next: 'op' },
          { text: 'Goodbye, Emperor.', end: true },
        ],
      },
      op: { text: `"Of course! I sailed with Roger, you know! ...As a cabin boy. The Road Poneglyphs point the way — four red stones. The last one's with some creepy guy near Lodestar. And no, I'm not going there. Too many whirlpools. Flashy whirlpools."`, next: 'a' },
    } }),
  },

  // ================================================================ LODESTAR
  {
    id: 'lodestar_watcher', name: 'Old Watcher of Lodestar', title: 'A hermit who counts the ships', island: 'lodestar', at: { spot: 'watcher_tent' },
    look: { hair: 'long', hairColor: '#eceff1', top: '#6d4c41', bottom: '#4e342e', hat: 'tricorne', hatColor: '#4e342e', skin: '#d7a67a' }, level: 20,
    marker: (c, g) => (!g.quests.state('laugh_tale_voyage') || (!g.quests.state('burn_scar') && !c.flags.rubbing_road_4) ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: `"Look at your Log Pose. Spinning, isn't it? Every road in the Grand Line ends here, and here the needles go mad. Thirty-nine years ago a crew landed laughing and sailed off again — heading where no needle points."`,
        choices: [
          { text: 'How do I go further?', do: (c) => { if (!c.quest('laugh_tale_voyage')) c.startQuest('laugh_tale_voyage'); }, next: 'road' },
          { text: 'Have you seen an all-black ship?', if: () => !ctx.flag('rubbing_road_4'), do: (c) => { if (!c.quest('burn_scar')) c.startQuest('burn_scar'); }, next: 'ship' },
          { text: 'Goodbye.', end: true },
        ],
      },
      road: { text: `"Four red stones. Read together, they name four places; join them on a chart and the lines cross in an X. That is the road to the last island. Don't ask me where the stones are — I only watch the sea."`, next: 'a' },
      ship: { text: `"Black hull, black sails, no flag. When it comes, the sea off the eastern cliffs begins to spin. I've seen it moor in the sea cave on the far side of the island. I don't go near it. Neither should you."`, next: 'a' },
    } }),
  },
  {
    id: 'hinokizu', name: 'The Man with the Burn Scar', title: '"Hinokizu"', island: 'lodestar', at: { spot: 'road4_cave', ox: 2 }, ai: 'idle', faction: 'neutral', invulnerable: true,
    look: { hair: 'long', hairColor: '#212121', top: '#212121', bottom: '#212121', coat: '#212121', hat: 'tricorne', hatColor: '#212121', skin: '#a1887f', scarEye: true }, level: 110, fixedPower: 99999,
    when: (c, g) => g.quests.stageId('burn_scar') === 'stranger',
    marker: (c, g) => (g.quests.stageId('burn_scar') === 'stranger' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: `(A man in black stands between you and the red stone. Half of his face is one old burn.) "...So the sea let you through. It doesn't, usually."`,
        choices: [
          { text: 'Who are you?', next: 'who' },
          { text: 'I need a rubbing of that stone.', next: 'rub' },
        ],
      },
      who: { text: `"A man who keeps something that must not be found too soon. People call me by my scar. That's name enough."`, next: 'a' },
      rub: { text: `"Take your copy, then. The stone stays where it is — and so do I, until the one who was promised comes. ...You're not the first to get this far. We'll see if you're the last."`, onEnter: (c) => { giveRubbing(c, 'road_4'); c.complete('burn_scar'); }, next: 'gone' },
      gone: { text: `(When you look up from the paper, the man is gone. Out on the water, an all-black ship slides into a whirlpool and does not come up again.)`, onEnter: (c) => despawn(c.game, 'hinokizu') },
    } }),
  },

  // ============================================================== LAUGH TALE
  {
    id: 'teach_laugh_tale', name: '"Blackbeard" Marshall D. Teach', title: 'The last rival', island: 'laugh_tale', at: { spot: 'final_duel' },
    hostile: true, boss: true, hpMul: 3.6, level: 120, faction: 'pirate', style: 'brawler', fruit: 'yami', fruitMastery: 100,
    moves: ['yami_kurouzu', 'yami_blackhole', 'yami_nullify', 'yami_liberation', 'gura_punch', 'gura_kaishin', 'gura_wave', 'gura_tsunami'],
    haki: { armament: 92, observation: 85, conqueror: 60 }, look: L.teach, bulk: 1.7, bounty: 3996000000, infamy: true, breakthrough: 10, skill: 0.78, leash: 30,
    alert: 'Zehahahaha! So YOU got here first?! Hand it over — the One Piece is MINE!', barks: ['Zehahahaha!', 'Fate is on MY side!', 'The darkness swallows even the sun!'],
    phases: [{ at: 0.4, run: (a, g) => { g.ui?.banner?.('BLACKBEARD', 'Darkness and tremors', '"I won\'t lose — not here! Not NOW!"', 3); a.addBuff({ id: 'teach_rage', name: 'Desperation', dur: 60, mods: { damage: 1.45, atkSpeed: 1.2 } }); } }],
    when: (c, g) => g.quests.stageId('final_rival') === 'duel' && !beat(c, 'teach_laugh_tale'),
  },
];

// ------------------------------------------------------------ enemy groups
const groups = [
  // Wano
  { island: 'wano', spot: 'bakura_town', radius: 6, enemies: [['nw2_gifter', 55, { name: 'Gifter (SMILE: Rhino)' }], ['nw2_gifter', 55, { name: 'Gifter (SMILE: Bat)' }], ['pirate', 52, { name: 'Beasts Pirates Waiter' }]], when: (c) => !beat(c, 'holdem') },
  { island: 'wano', dx: 0.58, dy: 0.5, radius: 8, enemies: [['nw2_gifter', 57, { name: 'Prison Guard (Gifter)' }], ['pirate_gunner', 54, { name: 'Mine Overseer' }], ['pirate', 54, { name: 'Mine Overseer' }]], when: (c) => !beat(c, 'babanuki') },
  { island: 'wano', spot: 'shogun_castle', radius: 6, enemies: ONIWABANSHU, when: (c, g) => g.quests.stageId('wano_road_poneglyph') === 'castle' && !beat(c, 'kaido') },
  // Onigashima
  { island: 'onigashima', spot: 'torii_gate', radius: 7, enemies: [['nw2_gifter', 64, { name: 'Gifter (SMILE: Rhino)' }], ['nw2_gifter', 64, { name: 'Gifter (SMILE: Rooster)' }], ['pirate', 60, { name: 'Pleasure' }], ['pirate_gunner', 60, { name: 'Waiter Gunner' }]], when: (c) => !beat(c, 'kaido') },
  { island: 'onigashima', spot: 'live_floor', radius: 7, enemies: [['nw2_gifter', 68, { name: 'Headliner' }], ['nw2_gifter', 66, { name: 'Gifter' }], ['brute', 66, { name: 'Numbers Giant', scale: 2.2, hpMul: 1.6 }]], when: (c, g) => !!g.quests.state('raid_onigashima') && !beat(c, 'kaido') },
  // Egghead
  { island: 'egghead', spot: 'labophase_gate', radius: 6, enemies: SERAPHIM, when: (c, g) => g.quests.stageId('egghead_incident') === 'seraphim' },
  { island: 'egghead', spot: 'labophase_gate', radius: 9, enemies: BUSTER_CALL, when: (c, g) => g.quests.stageId('egghead_incident') === 'kizaru' },
  // Elbaph
  { island: 'elbaf', spot: 'walrus_school', radius: 8, enemies: MMA, when: (c, g) => g.quests.stageId('elbaf_siege') === 'school' },
  { island: 'elbaf', spot: 'underworld_hunt', radius: 8, enemies: [['beast', 58, { name: 'Underworld Wolf', scale: 1.8, look: { fur: '#eceff1', skin: '#eceff1', top: '#eceff1', bottom: '#cfd8dc', ears: 'pointy', muzzle: true, tail: 'fluffy', hair: 'bald' } }], ['gorilla', 60, { name: 'Giant Snow Bear', scale: 2 }]] },
  // Winner Island, Foodvalten, Baltigo
  { island: 'winner_island', spot: 'bb_camp', radius: 6, enemies: [['pirate', 62, { name: 'Blackbeard Pirate' }], ['pirate_gunner', 62, { name: 'Blackbeard Gunner' }], ['pirate', 64, { name: 'Blackbeard Pirate' }]], when: (c) => !beat(c, 'burgess_winner') },
  { island: 'foodvalten', spot: 'brownbeard_camp', radius: 6, enemies: [['pirate', 50, { name: 'Brownbeard Pirate' }], ['pirate', 50, { name: 'Brownbeard Pirate' }], ['pirate_gunner', 50, { name: 'Brownbeard Gunner' }]], when: (c) => !beat(c, 'brownbeard_foodvalten') },
  { island: 'baltigo', spot: 'scavenger_camp', radius: 6, enemies: SCAVENGERS, when: (c, g) => g.quests.stageId('baltigo_archive') === 'scavengers' },
];

// ------------------------------------------------------------------ quests
const quests = [
  { id: 'foodvalten_flag', name: 'Whitebeard\'s Torn Flag', island: 'foodvalten', kind: 'side', summary: 'After Whitebeard\'s death the Brownbeard Pirates seized Foodvalten and slashed his flag in half.',
    stages: [
      { id: 'brownbeard', desc: 'Drive the Brownbeard Pirates out of Foodvalten: defeat Brownbeard at his camp north-east of the village.', goal: { type: 'flag', flag: 'nw2_beat_brownbeard_foodvalten' } },
      { id: 'report', desc: 'Return to the chief of Foodvalten.' },
    ],
    rewards: { berries: 600000, points: 2, liberate: 'Foodvalten', items: [['sea_king_steak', 2]] } },

  // ------------------------------------------------------------------ Wano
  { id: 'wano_dawn', name: 'The Dawn of Wano', island: 'wano', kind: 'story', summary: 'Wano is ruled by the shogun Orochi and Kaido\'s Beasts Pirates. The Kozuki retainers have returned to take it back.',
    stages: [
      { id: 'meet', desc: 'Find Kin\'emon at the ruins of Oden Castle, on the hill above Kuri.', goal: { type: 'flag', flag: 'nw2_met_kinemon' } },
      { id: 'holdem', desc: 'Defeat Holdem, the Headliner who rules Bakura Town beyond the great torii of Kuri.', goal: { type: 'flag', flag: 'nw2_beat_holdem' } },
      { id: 'udon', desc: 'Break open the Prisoner Mine in Udon: defeat the warden Babanuki.', goal: { type: 'flag', flag: 'nw2_beat_babanuki' } },
      { id: 'report', desc: 'Return to Kin\'emon at the ruins of Oden Castle.' },
    ],
    rewards: { berries: 400000, points: 2, haki: { armament: 5 }, flag: 'wanoAllies' } },
  { id: 'raid_onigashima', name: 'The Raid on Onigashima', island: 'onigashima', kind: 'story', summary: 'On the night of the Fire Festival the Kozuki alliance storms Kaido\'s island fortress.',
    stages: [
      { id: 'sail', desc: 'The Fire Festival has begun. Sail to Onigashima, just south of Wano.', goal: { type: 'reach', island: 'onigashima' },
        onComplete: (ctx, g) => g.ui.banner('THE FIRE FESTIVAL', 'Onigashima', 'Drums, lanterns, sake — and a whole army of Beasts Pirates who do not know what is coming.', 5) },
      { id: 'tobiroppo', desc: 'Defeat three of the Tobi Roppo (Who\'s-Who, Black Maria, Sasaki, Ulti, Page One).', goal: { type: 'flag', flag: 'nw2_tobiroppo3' } },
      { id: 'all_stars', desc: 'Defeat two of the All-Stars: King, Queen or Jack.', goal: { type: 'flag', flag: 'nw2_allstars2' } },
      { id: 'kaido', desc: 'Climb to the roof of the Skull Dome and defeat Kaido of the Beasts.', goal: { type: 'flag', flag: 'nw2_beat_kaido' },
        onStart: (ctx, g) => { const k = spawnNow(g, 'kaido'); if (k) aggro(g, k); g.ui.banner('KAIDO OF THE BEASTS', 'Emperor of the Sea', 'Thunder cracks over the Skull Dome. The strongest creature in the world is waiting on the roof.', 5); } },
      { id: 'report', desc: 'Return to the Flower Capital: the new shogun awaits at the Shogun Castle.' },
    ],
    rewards: { berries: 5000000, points: 3, liberate: 'Wano Country', haki: { armament: 10 }, items: [['wano_sake', 3]], flag: 'wanoLiberated' } },
  { id: 'wano_road_poneglyph', name: 'The Red Stone of Wano', island: 'wano', kind: 'story', summary: 'Kaido claimed Wano\'s Road Poneglyph. It lies in a secret cavern at the foot of Mt. Fuji, reached by a stair beneath the Shogun Castle.',
    stages: [
      { id: 'castle', desc: 'Slip into the Shogun Castle in the Flower Capital and find the way down.', goal: { type: 'reach', island: 'wano', spot: 'shogun_castle', r: 4 },
        onStart: (ctx, g) => { if (!beat(ctx.char, 'kaido')) { spawnSquad(g, 'wano', 'shogun_castle', ONIWABANSHU, 6); spawnNow(g, 'orochi'); spawnNow(g, 'fukurokuju'); } } },
      { id: 'fuji', desc: 'Follow the secret stair to the cavern at the foot of Mt. Fuji and take a rubbing of the red Road Poneglyph.', goal: { type: 'reach', island: 'wano', spot: 'fuji_poneglyph', r: 3 } },
    ],
    rewards: { points: 2, flag: 'rubbing_road_wano', items: [['poneglyph_rubbing', 1]] },
    onComplete: (ctx, g) => g.ui.banner('ROAD PONEGLYPH', 'Wano Country', 'You press paper against the red stone the Kozuki carved eight hundred years ago. One of four.', 5) },
  { id: 'enma_blade', name: 'Enma', island: 'wano', kind: 'side', summary: 'Kozuki Hiyori offers her father\'s sword Enma in exchange for Shusui, Wano\'s national treasure.',
    stages: [
      { id: 'grave', desc: 'Return Shusui to the grave of Shimotsuki Ryuma in the Northern Cemetery of Ringo.', goal: { type: 'reach', island: 'wano', spot: 'ryuma_grave', r: 3 },
        onComplete: (ctx) => { if (ctx.has('shusui')) ctx.take('shusui', 1); ctx.log('You lay Shusui on the grave of Shimotsuki Ryuma. The black blade is home.', '#b0bec5'); } },
      { id: 'report', desc: 'Visit Tenguyama Hitetsu in Amigasa Village, Kuri.' },
    ],
    rewards: { items: [['enma', 1]], mastery: { ittoryu: 3 }, haki: { armament: 3 } } },

  // --------------------------------------------------------------- Baltigo
  { id: 'baltigo_archive', name: 'The Island of White Soil', island: 'baltigo', kind: 'side', summary: 'Blackbeard\'s scavengers are digging through the ruins of the Revolutionary Army\'s headquarters.',
    stages: [
      { id: 'scavengers', desc: 'Drive the Blackbeard scavengers out of the ruins of Baltigo.', goal: { type: 'defeat', any: ['bb_scavenger'], count: 3 },
        onStart: (ctx, g) => spawnSquad(g, 'baltigo', 'scavenger_camp', SCAVENGERS, 6) },
      { id: 'archive', desc: 'Search the collapsed vault north of the ruins for Dragon\'s sealed dossier.', goal: { type: 'reach', island: 'baltigo', spot: 'burned_archive', r: 3 } },
      { id: 'report', desc: 'Bring the dossier to the Revolutionary officer.' },
    ],
    rewards: { berries: 500000, points: 1, mastery: { ryusoken: 5 } } },

  // ---------------------------------------------------------- Winner Island
  { id: 'winner_ambush', name: 'The Winner Island Ambush', island: 'winner_island', kind: 'side', summary: 'Blackbeard ambushed the Heart Pirates for their Road Poneglyph copies. Burgess is still hunting the survivors.',
    stages: [
      { id: 'burgess', desc: 'Defeat "Champion" Jesus Burgess at the Blackbeard camp on the beach.', goal: { type: 'flag', flag: 'nw2_beat_burgess_winner' } },
      { id: 'report', desc: 'Tell the stranded Heart Pirate.' },
    ],
    rewards: { berries: 800000, points: 2, items: [['rumble_ball', 1]] } },

  // ---------------------------------------------------------- Gartel Island
  { id: 'red_hair_flag', name: 'The Burned Flag', island: 'gartel_island', kind: 'side', summary: 'Pirates burned the Red Hair Pirates\' flag over Gartel Town. The townsfolk are terrified.',
    stages: [
      { id: 'flag', desc: 'Raise a new Red Hair Jolly Roger on the flagpole above Gartel Town.', goal: { type: 'reach', island: 'gartel_island', spot: 'red_hair_flag', r: 3 },
        onComplete: (ctx, g) => { g.ui.banner('A NEW FLAG', 'Gartel Island', 'The Red Hair Jolly Roger snaps in the wind again. Down at the pier, a ship with a familiar flag has dropped anchor.', 5); spawnNow(g, 'shanks_gartel'); } },
      { id: 'shanks', desc: 'Someone is waiting on the pier.' },
    ],
    rewards: { berries: 300000, points: 1 },
    onComplete: (ctx, g) => { const c = ctx.char; if (c.haki.conqueror) g.progression.addHaki('conqueror', 5); else if (c.haki.observation) g.progression.addHaki('observation', 5); else g.progression.raiseAttr('wil', 2); } },

  // --------------------------------------------------------------- Egghead
  { id: 'egghead_incident', name: 'The Egghead Incident', island: 'egghead', kind: 'story', summary: 'Dr. Vegapunk knows the truth of the Void Century — and the World Government has come to silence him.',
    stages: [
      { id: 'meet', desc: 'Climb to the Labophase and meet Dr. Vegapunk.', goal: { type: 'flag', flag: 'nw2_met_vegapunk' } },
      { id: 'seraphim', desc: 'York has handed control of the Seraphim to CP0. Stop the Seraphim at the Labophase gate.', goal: { type: 'defeat', any: ['s_hawk', 's_bear', 's_snake', 's_shark'], count: 3 },
        onStart: (ctx, g) => { spawnSquad(g, 'egghead', 'labophase_gate', SERAPHIM, 6); g.ui.banner('THE SERAPHIM', 'Egghead', 'Winged children with the faces of Warlords drop from the Labophase — and turn on their creator.', 5); } },
      { id: 'lucci', desc: 'Rob Lucci of CP0 is hunting Vegapunk through the Fabriophase. Stop him.', goal: { type: 'flag', flag: 'nw2_beat_lucci_cp0' },
        onStart: (ctx, g) => { const a = spawnNow(g, 'lucci_cp0'); if (a) aggro(g, a); spawnNow(g, 'kaku_cp0'); } },
      { id: 'kizaru', desc: 'A Buster Call fleet surrounds Egghead. Admiral Kizaru lands at the Labophase gate — hold the line!', goal: { type: 'flag', flag: 'nw2_beat_kizaru_egghead' },
        onStart: (ctx, g) => { const a = spawnNow(g, 'kizaru_egghead'); if (a) aggro(g, a); spawnNow(g, 'saturn_cameo'); spawnSquad(g, 'egghead', 'labophase_gate', BUSTER_CALL, 9); g.ui.banner('BUSTER CALL', 'Admiral Kizaru — and one of the Five Elders', 'Battleships ring the island. A flash of yellow light lands at the gate... and behind it, an old man in black.', 6); } },
      { id: 'message', desc: 'Every Den Den Mushi in the world begins to speak. Listen to Vegapunk\'s message.', goal: { type: 'event', event: 'nw2_vegapunk_broadcast' } },
      { id: 'report', desc: 'Find Lilith in her workshop in the Labophase.' },
    ],
    rewards: { berries: 3000000, points: 3, haki: { observation: 10 }, flag: 'vegapunkMessage', items: [['cola', 3]] } },

  // ---------------------------------------------------------------- Elbaph
  { id: 'elbaf_siege', name: 'Warland under Siege', island: 'elbaf', kind: 'story', summary: 'The Knights of God have come to force Elbaph\'s warriors into the World Government\'s coming war.',
    stages: [
      { id: 'jarul', desc: 'Find Elder Jarul in the Western Village.', goal: { type: 'flag', flag: 'nw2_met_jarul' } },
      { id: 'school', desc: 'The children\'s nightmares walk as MMA. Protect the Walrus School and the Owl Library — defeat three of the monsters.', goal: { type: 'defeat', any: ['mma_beast'], count: 3 },
        onStart: (ctx, g) => { spawnSquad(g, 'elbaf', 'walrus_school', MMA, 8); g.ui.banner('MMA', 'Nightmares made flesh', 'Monsters taller than giants stalk out of the children\'s dreams toward the Walrus School.', 5); } },
      { id: 'killingham', desc: 'Saint Killingham commands the MMA with his horn. Drive the Knight of God out of Elbaph.', goal: { type: 'flag', flag: 'nw2_beat_killingham' },
        onStart: (ctx, g) => { const a = spawnNow(g, 'killingham'); if (a) aggro(g, a); } },
      { id: 'report', desc: 'Return to Elder Jarul.' },
    ],
    rewards: { berries: 2000000, points: 3, liberate: 'Elbaph', items: [['elbaf_helm', 1]], flag: 'elbafDefended' },
    onComplete: (ctx, g) => g.ui.banner('THE KNIGHT RETREATS', 'Elbaph', 'Killingham vanishes into the black circle he came from. Knights of God do not die easily — but today, Elbaph stood.', 5) },
  { id: 'accursed_prince', name: 'The Accursed Prince', island: 'elbaf', kind: 'side', summary: 'Loki, the prince who killed King Harald, lies chained at the roots of the Adam Tree.',
    stages: [
      { id: 'key', desc: 'Find the key to Loki\'s chains inside the sealed Aurust Castle, at the western cliffs.', goal: { type: 'reach', island: 'elbaf', spot: 'aurust_castle', r: 4 },
        onComplete: (ctx) => { ctx.give('loki_chain_key', 1); ctx.log('Among the bones of a hundred warriors you find a key as long as your arm.', '#b0bec5'); } },
      { id: 'free', desc: 'Bring the key to Loki at the roots of the Adam Tree, in the Underworld.' },
      { id: 'duel', desc: 'Freed, the Accursed Prince wants to know whether you are worth following. Defeat Loki.', goal: { type: 'flag', flag: 'nw2_beat_loki' } },
      { id: 'report', desc: 'Talk to Loki.' },
    ],
    rewards: { berries: 1000000, points: 3 },
    onComplete: (ctx, g) => { if (ctx.char.haki.conqueror) g.progression.addHaki('conqueror', 5); else g.progression.raiseAttr('wil', 2); } },

  // ------------------------------------------------------------- Hachinosu
  { id: 'koby_escape', name: 'The Hero of Rocky Port', island: 'hachinosu', kind: 'side', summary: 'Blackbeard holds the Marine captain Koby hostage on Pirate Island.',
    stages: [
      { id: 'guards', desc: 'Keep Koby\'s jailer busy: defeat Avalo Pizarro, the Titanic Captain at the Prison Block.', goal: { type: 'flag', flag: 'nw2_beat_pizarro_hachinosu' },
        onStart: (ctx, g) => { const a = spawnNow(g, 'pizarro_hachinosu'); if (a) aggro(g, a); },
        onComplete: (ctx, g) => { ctx.setFlag('nw2_kobyRunning'); despawn(g, 'koby_hachinosu'); g.log('Koby slips out of the Prison Block and sprints for the harbour. "Meet me at the pier!"', '#90caf9'); } },
      { id: 'escape', desc: 'Get to the Hachinosu pier before the Blackbeard Pirates catch Koby.', goal: { type: 'reach', island: 'hachinosu', spot: 'hachinosu_pier', r: 6 } },
    ],
    rewards: { berries: 500000, points: 2 },
    onComplete: (ctx, g) => g.ui.banner('RESCUE', 'Hachinosu harbour', 'A Marine warship bursts through the harbour mouth and Koby leaps aboard. "I won\'t forget this! ...Even if I have to arrest you one day!"', 6) },
  { id: 'blackbeard_showdown', name: 'The Man Who Would Be King', island: 'hachinosu', kind: 'side', summary: 'Blackbeard dares you to fight your way through his Titanic Captains.',
    stages: [
      { id: 'captains', desc: 'Defeat two of Blackbeard\'s Titanic Captains (Shiryu, Pizarro and Devon on Hachinosu; Burgess on Winner Island).', goal: { type: 'flag', flag: 'nw2_captains2' } },
      { id: 'teach', desc: 'Face Marshall D. Teach in the Skull Fortress.', goal: { type: 'flag', flag: 'nw2_beat_teach_hachinosu' } },
    ],
    rewards: { berries: 4000000, points: 3, flag: 'blackbeardBeaten' } },

  // ---------------------------------------------------- the lost fourth stone
  { id: 'burn_scar', name: 'The Man with the Burn Scar', island: 'lodestar', kind: 'story', summary: 'The fourth Road Poneglyph vanished from the Sea Forest. They say a man with a burn scar keeps it, sailing an all-black ship.',
    stages: [
      { id: 'rumor', desc: 'Follow the rumours of whirlpools to Lodestar Island, the last island of the Log.', goal: { type: 'reach', island: 'lodestar' } },
      { id: 'vortex', desc: 'Sail into the whirlpools off Lodestar\'s eastern cliffs.', goal: { type: 'reach', island: 'lodestar', spot: 'vortex_bay', r: 12 },
        onComplete: (ctx, g) => { g.env.storm = Math.max(g.env.storm || 0, 0.8); g.ui.banner('THE VORTEX', 'Off Lodestar', 'The sea spins. For a moment an all-black ship is right beside you — then the current throws you into a sea cave on the island\'s far side.', 6); } },
      { id: 'cave', desc: 'Go ashore and find the red stone in the sea cave on Lodestar\'s east coast.', goal: { type: 'reach', island: 'lodestar', spot: 'road4_cave', r: 4 } },
      { id: 'stranger', desc: 'Speak with the man with the burn scar.', onStart: (ctx, g) => { spawnNow(g, 'hinokizu'); } },
    ],
    rewards: { points: 2, haki: { observation: 5 } } },

  // ------------------------------------------------------------- the ending
  { id: 'laugh_tale_voyage', name: 'The Voyage to Laugh Tale', island: 'lodestar', kind: 'story', summary: 'No Log Pose can reach the final island. Only the four red Road Poneglyphs, read together, show the way to Laugh Tale.',
    stages: [
      { id: 'rubbings', desc: 'Collect rubbings of the four Road Poneglyphs: Zou, Whole Cake Island, Wano — and the lost fourth.', goal: { type: 'item', item: 'poneglyph_rubbing', n: 4 } },
      { id: 'decipher', island: 'wano', desc: 'Have the rubbings read: an archaeologist in your crew — or the last of the Kozuki, who still read the ancient script (a certain swordsmith of Amigasa Village, Wano).', goal: { type: 'flag', flag: 'laughTaleRevealed' } },
      { id: 'voyage', desc: 'Sail to where the four lines cross: past Lodestar, just before Reverse Mountain, where no Log Pose leads.', goal: { type: 'reach', island: 'laugh_tale' },
        onComplete: (ctx, g) => g.ui.banner('LAUGH TALE', 'The final island', 'The storm that turned every ship away for eight hundred years parts in front of your bow.', 7) },
      { id: 'treasure', desc: 'Climb past the Last Poneglyph to the top of the cliffs — to what Joy Boy left behind.', goal: { type: 'reach', island: 'laugh_tale', spot: 'one_piece', r: 3 },
        onComplete: (ctx, g) => openFinale(g) },
      { id: 'laugh', desc: 'Laugh.', goal: { type: 'flag', flag: 'laughTale' } },
    ],
    rewards: { points: 5, attrs: { wil: 5 }, items: [['joy_boy_promise', 1]] } },
  { id: 'final_rival', name: 'The Last Rival', island: 'laugh_tale', kind: 'side', summary: 'Blackbeard followed your wake to the final island. He wants the One Piece.',
    stages: [
      { id: 'duel', desc: 'Blackbeard\'s ship has run aground below the cliffs. Defeat Marshall D. Teach on Laugh Tale.', goal: { type: 'flag', flag: 'nw2_beat_teach_laugh_tale' } },
    ],
    rewards: { points: 5, berries: 10000000, flag: 'pirateKingUndisputed' },
    onComplete: (ctx, g) => g.ui.banner('KING OF THE PIRATES', 'Laugh Tale', 'The darkness is beaten. The whole sea will hear about this by morning.', 7) },
];

// ------------------------------------------------------ the final revelation
function openFinale(game) {
  const c = game.state?.char;
  if (!c || c.flags.laughTale) return;
  game.dialogue.open(null, {
    start: 'a',
    nodes: {
      a: { speaker: 'Laugh Tale', text: '(Past the Last Poneglyph the path climbs to the top of the cliffs, and the wind simply stops. Whatever Joy Boy left here has waited eight hundred years — for someone to come back and keep a promise.)', next: 'b' },
      b: { speaker: 'Laugh Tale', text: '(You read what is written — or hear it read. The Void Century. A great kingdom that dreamed of a world without walls. A war it could not win, the weapons that raised the sea... and a promise Joy Boy could not keep.)', next: 'c' },
      c: { speaker: 'Laugh Tale', text: '(And then you see the treasure itself. It is not what the World Government fears you will find. It is bigger than that — so absurd, so enormous, so exactly like the sea — that there is only one thing a person can do.)', next: 'd' },
      d: { speaker: 'Laugh Tale', text: '(You laugh until your ribs ache and your eyes run. Long ago, on this same spot, a man named Gol D. Roger laughed exactly like this — "Wahahahaha!" — and named the island after the joke.)', next: 'e' },
      e: { speaker: 'Laugh Tale', text: '(The One Piece is real. You found it. What the world becomes now depends on what you do next.)',
        onEnter: (ctx) => { ctx.setFlag('laughTale'); ctx.setFlag('nw2_finaleSeen'); ctx.progression?.checkDream?.(); ctx.save(); } },
    },
  });
}

// --------------------------------------------------------- boss techniques
const abilities = [
  // Kaido
  { id: 'nw2_ragnaraku', name: 'Kosanze: Ragnaraku', anim: 'heavy', windup: 0.8, recover: 0.6, cd: 14, cost: { stamina: 20 }, say: 'Ragnaraku!',
    steps: [{ hit: { shape: 'circle', range: 5.5, damage: 90, knockback: 16, stun: 1.2, heavy: true, guardBreak: true, impactFrame: true, shake: 1.2 }, vfx: 'ring', color: '#b39ddb' }] },
  { id: 'nw2_hakai', name: 'Hakai', anim: 'heavy', windup: 0.9, recover: 0.6, cd: 20, cost: { stamina: 24 }, say: 'Hakai!',
    steps: [{ hit: { shape: 'arc', range: 3.2, arc: 1.4, offset: 0.4, damage: 120, knockback: 18, stun: 1.4, heavy: true, unblockable: true, haki: true, impactFrame: true, shake: 1.2 }, vfx: 'ring', color: '#000000' }] },
  { id: 'nw2_tatsumaki', name: 'Tatsumaki', anim: 'cast', windup: 0.7, recover: 0.5, cd: 18, cost: { stamina: 22 },
    steps: [{ zone: { range: 5, duration: 3, interval: 0.3, damage: 14, color: '#90caf9', kind: 'storm', pull: 4, atTarget: true } }] },
  { id: 'nw2_kaen_daiko', name: 'Kaen Daiko', anim: 'cast', windup: 0.9, recover: 0.5, cd: 16, cost: { stamina: 26 }, say: 'Kaen Daiko!',
    steps: [{ hit: { shape: 'line', range: 13, width: 3, damage: 75, knockback: 10, stun: 0.8, element: 'fire', status: { burn: 4 }, heavy: true, hitShips: true }, vfx: 'beam', color: '#ff5722' }] },
  // King
  { id: 'nw2_karyudon', name: 'Karyudon', anim: 'thrust', windup: 0.45, recover: 0.4, cd: 7, cost: { stamina: 16 }, say: 'Karyudon!',
    steps: [{ dash: { dist: 9, time: 0.3, iframes: 0.2, air: true, trail: '#ff7043', hit: { damage: 48, knockback: 9, stun: 0.7, element: 'fire', status: { burn: 3 }, heavy: true } } }] },
  { id: 'nw2_tempuraudon', name: 'Tempura Udon', anim: 'heavy', windup: 0.6, recover: 0.5, cd: 10, cost: { stamina: 18 },
    steps: [{ hit: { shape: 'circle', range: 3.5, damage: 55, knockback: 12, stun: 1, element: 'fire', heavy: true, guardBreak: true, shake: 0.6 }, vfx: 'ring', color: '#ff7043' }] },
  { id: 'nw2_barizodon', name: 'Barizodon', anim: 'slash', windup: 0.4, recover: 0.4, cd: 6, cost: { stamina: 14 },
    steps: [{ hit: { shape: 'line', range: 7, width: 1.4, damage: 42, knockback: 6, stun: 0.5, slashing: true, element: 'fire' }, vfx: 'beam', color: '#ffab40' }] },
  // Queen
  { id: 'nw2_black_coffee', name: 'Black Coffee', anim: 'cast', windup: 0.7, recover: 0.4, cd: 8, cost: { stamina: 16 }, say: 'Black Coffee!',
    steps: [{ hit: { shape: 'line', range: 12, width: 1.2, damage: 50, knockback: 7, stun: 0.6, element: 'light', heavy: true }, vfx: 'beam', color: '#8d6e63' }] },
  { id: 'nw2_brachio_bomber', name: 'Brachio Bomber', anim: 'thrust', windup: 0.6, recover: 0.5, cd: 9, cost: { stamina: 18 },
    steps: [{ dash: { dist: 8, time: 0.35, hit: { damage: 58, knockback: 12, stun: 0.9, heavy: true, guardBreak: true } } }] },
  { id: 'nw2_ice_oni', name: 'Plague Rounds: Ice Oni', anim: 'shoot', windup: 0.5, recover: 0.4, cd: 14, cost: { stamina: 14 },
    steps: [{ proj: { speed: 14, range: 11, radius: 0.4, damage: 18, count: 3, spread: 0.5, sprite: 'iceshard', color: '#b3e5fc', element: 'ice', status: { freeze: 1.2, poison: 3 } } }] },
  // Jack
  { id: 'nw2_mammoth_charge', name: 'Mammoth Charge', anim: 'thrust', windup: 0.55, recover: 0.5, cd: 7, cost: { stamina: 16 },
    steps: [{ dash: { dist: 10, time: 0.4, hit: { damage: 52, knockback: 14, stun: 0.9, heavy: true, guardBreak: true } } }] },
  { id: 'nw2_drought_stomp', name: 'Drought Stomp', anim: 'heavy', windup: 0.7, recover: 0.5, cd: 10, cost: { stamina: 18 },
    steps: [{ hit: { shape: 'circle', range: 4.5, damage: 46, knockback: 10, stun: 0.8, heavy: true, shake: 0.8 }, vfx: 'ring', color: '#a1887f' }] },
  // Tobi Roppo
  { id: 'nw2_madara', name: 'Shigan "Madara"', anim: 'thrust', windup: 0.3, recover: 0.3, cd: 6, cost: { stamina: 12 },
    steps: [0, 0.08, 0.16, 0.24, 0.32].map((t) => ({ at: 0.3 + t, hit: { shape: 'arc', range: 1.8, arc: 0.8, offset: 0.2, damage: 9, knockback: 1, stun: 0.2, status: { bleed: 2 } } })) },
  { id: 'nw2_marianette', name: 'Marianette', anim: 'cast', windup: 0.5, recover: 0.4, cd: 12, cost: { stamina: 14 },
    steps: [{ proj: { speed: 13, range: 10, radius: 0.5, damage: 12, sprite: 'orb', color: '#f8bbd0', status: { root: 2.5 }, homing: 2 } }] },
  { id: 'nw2_tamaceratops', name: 'Tamaceratops', anim: 'heavy', windup: 0.6, recover: 0.5, cd: 9, cost: { stamina: 16 },
    steps: [{ dash: { dist: 8, time: 0.35, hit: { damage: 44, knockback: 12, stun: 0.8, heavy: true, guardBreak: true } } }] },
  { id: 'nw2_ul_zugan', name: 'Ul-Zugan', anim: 'thrust', windup: 0.45, recover: 0.4, cd: 7, cost: { stamina: 14 }, say: 'Ul-Zugan!',
    steps: [{ dash: { dist: 7, time: 0.3, hit: { damage: 40, knockback: 10, stun: 1, heavy: true } } }] },
  { id: 'nw2_spino_bite', name: 'Spinosaurus Bite', anim: 'grab', windup: 0.4, recover: 0.4, cd: 6, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.2, offset: 0.3, damage: 34, knockback: 4, stun: 0.6, status: { bleed: 3 } } }] },
  // Wano tyrants
  { id: 'nw2_shishi_no_hi', name: 'Shishi no Hi', anim: 'cast', windup: 0.5, recover: 0.4, cd: 8, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'arc', range: 4, arc: 0.9, offset: 0.3, damage: 30, knockback: 4, stun: 0.4, element: 'fire', status: { burn: 3 } }, vfx: 'ring', color: '#ff7043' }] },
  { id: 'nw2_hakkushon', name: 'Elephant Hakkushon', anim: 'cast', windup: 0.6, recover: 0.4, cd: 9, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'arc', range: 5, arc: 1.1, offset: 0.3, damage: 22, knockback: 16, stun: 0.6 }, vfx: 'ring', color: '#e0f7fa' }] },
  { id: 'nw2_orochi_bite', name: 'Yamata no Orochi', anim: 'grab', windup: 0.5, recover: 0.5, cd: 7, cost: { stamina: 14 },
    steps: [0, 0.1, 0.2, 0.3].map((t, i) => ({ at: 0.5 + t, angleOffset: (i % 2 ? 1 : -1) * 0.4, hit: { shape: 'arc', range: 3.2, arc: 0.7, offset: 0.3, damage: 14, knockback: 3, stun: 0.3, status: { poison: 2 } } })) },
  { id: 'nw2_orochi_coil', name: 'Serpent Coil', anim: 'grab', windup: 0.4, recover: 0.4, cd: 11, cost: { stamina: 12 },
    steps: [{ pull: { range: 7, strength: 10, stun: 0.8 } }] },
  { id: 'nw2_kunai', name: 'Kunai Volley', anim: 'shoot', windup: 0.3, recover: 0.3, cd: 4, cost: { stamina: 8 },
    steps: [{ proj: { speed: 20, range: 10, radius: 0.25, damage: 11, count: 3, spread: 0.35, sprite: 'iceshard', color: '#90a4ae', slashing: true } }] },
  // Kozuki
  { id: 'nw2_foxfire', name: 'Foxfire Style: Flame Cut', anim: 'slash', weapon: 'sword', windup: 0.35, recover: 0.35, cd: 7, cost: { stamina: 14 },
    steps: [{ hit: { shape: 'arc', range: 2.6, arc: 1.8, offset: 0.3, damage: 34, knockback: 5, stun: 0.5, slashing: true, element: 'fire' }, vfx: 'slash', color: '#ff8a65' }] },
  { id: 'nw2_narikabura', name: 'Narikabura Arrow', anim: 'heavy', windup: 0.5, recover: 0.4, cd: 8, cost: { stamina: 16 },
    steps: [{ proj: { speed: 22, range: 12, radius: 0.7, damage: 46, sprite: 'shockwave', color: '#e1f5fe', pierce: true, knockback: 8, stun: 0.6, heavy: true } }] },
  { id: 'nw2_namuji_hyoga', name: 'Namuji Hyoga', anim: 'thrust', windup: 0.45, recover: 0.4, cd: 10, cost: { stamina: 18 },
    steps: [{ dash: { dist: 7, time: 0.3, hit: { damage: 44, knockback: 8, stun: 0.6, element: 'ice', status: { freeze: 1.5 }, heavy: true } } }] },
  // Egghead
  { id: 'nw2_slave_arrow', name: 'Slave Arrow', anim: 'cast', windup: 0.6, recover: 0.4, cd: 12, cost: { stamina: 14 },
    steps: [{ proj: { speed: 18, range: 12, radius: 0.35, damage: 16, count: 5, spread: 0.6, sprite: 'orb', color: '#f06292', status: { freeze: 1.2 } } }] },
  // Elbaph
  { id: 'nw2_flame_clouds', name: 'Flame Clouds', anim: 'cast', windup: 0.6, recover: 0.4, cd: 10, cost: { stamina: 16 },
    steps: [{ zone: { range: 3.5, duration: 3, interval: 0.4, damage: 14, element: 'fire', status: { burn: 2 }, color: '#ff8a65', kind: 'field', atTarget: true } }] },
  { id: 'nw2_nightmare_holes', name: 'Nightmare Holes', anim: 'cast', windup: 0.8, recover: 0.5, cd: 16, cost: { stamina: 20 },
    steps: [{ zone: { range: 4.5, duration: 4, interval: 0.5, damage: 10, color: '#4a148c', kind: 'dark', pull: 3, slow: 0.4, atTarget: true } }] },
  // summons: every field is given because game.summon passes unset ones on as undefined
  { id: 'nw2_mma_horn', name: 'Nightmare Horn', anim: 'cast', windup: 0.8, recover: 0.5, cd: 28, cost: { stamina: 20 }, say: 'Wake up, my nightmares!',
    steps: [{ summon: { archetype: 'nw2_mma', level: 70, count: 1, name: 'MMA — Nightmare', look: MMA_LOOK, moves: ['brawl_tackle', 'nw2_nightmare_roar'], hpMul: 1.6, duration: 25, color: '#7e57c2' },
      buff: { id: 'nw2_horn', name: 'Nightmare Horn', dur: 8, mods: { damage: 1.1 } }, fx: { ring: 4, color: '#7e57c2' } }] },
  { id: 'nw2_call_gifters', name: 'Call the Gifters', anim: 'cast', windup: 0.6, recover: 0.4, cd: 30, cost: { stamina: 14 }, say: 'Gifters! Eat them!',
    steps: [{ summon: { archetype: 'nw2_gifter', level: 52, count: 2, name: 'Gifter', look: GIFTER_LOOK, moves: ['brawl_tackle', 'brawl_headbutt'], hpMul: 1.2, duration: 30, color: '#a1887f' },
      buff: { id: 'nw2_gifters', name: 'Headliner\'s Orders', dur: 8, mods: { damage: 1.1 } } }] },
  { id: 'nw2_nightmare_roar', name: 'Nightmare Roar', anim: 'cast', windup: 0.6, recover: 0.4, cd: 10, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'circle', range: 4, damage: 20, knockback: 8, stun: 0.7 }, vfx: 'ring', color: '#7e57c2' }] },
  { id: 'nw2_ragna_arrow', name: 'Ragna Go-Arrow', anim: 'shoot', windup: 0.6, recover: 0.4, cd: 9, cost: { stamina: 16 },
    steps: [{ proj: { speed: 20, range: 13, radius: 0.8, damage: 60, sprite: 'thunder', size: 2, element: 'lightning', pierce: true, status: { shock: 1.2 }, knockback: 8, heavy: true } }] },
  { id: 'nw2_thorheim', name: 'Thorheim', anim: 'cast', windup: 0.9, recover: 0.5, cd: 15, cost: { stamina: 24 },
    steps: [{ zone: { range: 3.5, duration: 1, interval: 0.45, damage: 55, element: 'lightning', status: { shock: 1.5 }, color: '#fff176', atTarget: true, kind: 'thunder' } }] },
  { id: 'nw2_niflheim', name: 'Niflheim', anim: 'heavy', windup: 0.8, recover: 0.5, cd: 18, cost: { stamina: 24 },
    steps: [{ hit: { shape: 'circle', range: 5, damage: 60, knockback: 6, stun: 0.5, element: 'ice', status: { freeze: 2 }, heavy: true }, vfx: 'ring', color: '#e1f5fe' }] },
  // Blackbeard Pirates
  { id: 'nw2_shisha_no_te', name: 'Shisha no Te', anim: 'thrust', windup: 0.25, recover: 0.4, cd: 8, cost: { stamina: 14 },
    steps: [{ teleport: { dist: 6, color: '#b0bec5' } }, { at: 0.35, hit: { shape: 'arc', range: 2, arc: 1, offset: 0.2, damage: 48, knockback: 5, stun: 0.6, slashing: true, status: { bleed: 4 } }, vfx: 'slash', color: '#b0bec5' }] },
  { id: 'nw2_island_fist', name: 'Island Human: Rock Fist', anim: 'heavy', windup: 0.6, recover: 0.5, cd: 8, cost: { stamina: 16 },
    steps: [{ hit: { shape: 'arc', range: 3.4, arc: 1.4, offset: 0.4, damage: 50, knockback: 12, stun: 0.8, heavy: true, guardBreak: true, shake: 0.6 }, vfx: 'ring', color: '#8d6e63' }] },
  { id: 'nw2_kitsune_mirage', name: 'Kitsune Illusion', anim: 'cast', windup: 0.4, recover: 0.3, cd: 12, cost: { stamina: 12 },
    steps: [{ teleport: { dist: 7, color: '#ce93d8' } }, { at: 0.3, hit: { shape: 'circle', range: 2.5, damage: 20, knockback: 3, stun: 1.2 }, vfx: 'ring', color: '#ce93d8' }] },
  { id: 'nw2_galleon_lariat', name: 'Galleon Lariat', anim: 'thrust', windup: 0.5, recover: 0.5, cd: 8, cost: { stamina: 16 }, say: 'Galleon Lariat!',
    steps: [{ dash: { dist: 8, time: 0.35, hit: { damage: 46, knockback: 12, stun: 0.8, heavy: true } } }] },
  { id: 'nw2_champion_driver', name: 'Champion Driver', anim: 'grab', windup: 0.5, recover: 0.6, cd: 12, cost: { stamina: 18 },
    steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.2, offset: 0.2, damage: 60, knockback: 2, stun: 1.4, heavy: true, guardBreak: true, shake: 0.7 } }] },
  { id: 'nw2_hado_elbow', name: 'Hado Elbow', anim: 'punch', windup: 0.35, recover: 0.35, cd: 5, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'arc', range: 2, arc: 1, offset: 0.3, damage: 36, knockback: 8, stun: 0.5, heavy: true } }] },
];

// ------------------------------------------------------------------ items
const items = {
  wano_katana: { name: 'Wano Katana', icon: '🗡', type: 'weapon', kind: 'sword', power: 1.5, price: 320000, grade: 'Wazamono', desc: 'Forged in Wano Country, home of the finest swordsmiths in the world.' },
  oden_stew: { name: 'Oden', icon: '🍢', type: 'food', heal: 140, stamina: 80, price: 240, desc: 'Wano\'s hearty simmered stew. A certain lord was famously fond of it.' },
  oshiruko: { name: 'Oshiruko', icon: '🥣', type: 'food', heal: 90, stamina: 90, price: 180, desc: 'Sweet red-bean soup from Okobore Town. An Emperor of the Sea once tore Udon apart for a bowl.' },
  kibi_dango: { name: 'Kibi Dango', icon: '🍡', type: 'food', heal: 45, stamina: 40, price: 60, desc: 'Tama\'s millet dumplings. Said to make even the fiercest beasts behave.' },
  wano_sake: { name: 'Wano Sake', icon: '🍶', type: 'food', heal: 20, stamina: 120, price: 400, buff: { id: 'drunken_courage', name: 'Drunken Courage', dur: 90, mods: { damage: 1.12, defMul: 1.05 } }, desc: 'Kaido\'s favourite. Strong enough to make you fight like a dragon — and about as carefully.' },
  elbaf_mead: { name: 'Giant\'s Mead', icon: '🍺', type: 'food', heal: 200, stamina: 150, price: 900, desc: 'From the Brewers Village of Elbaph. One giant-sized mug feeds a whole crew.' },
  elbaf_axe: { name: 'Elbaph War Axe', icon: '🪓', type: 'weapon', kind: 'axe', power: 1.7, price: 600000, desc: 'Forged for giants and cut down to human size. Still absurdly heavy.' },
  elbaf_helm: { name: 'Helm of Elbaph', icon: '⛑', type: 'hat', look: { hat: 'horns' }, bonus: { end: 2, wil: 1 }, price: 30000, desc: 'A horned helm of the Warland. Giants nod when they see it.' },
  loki_chain_key: { name: 'Key to Loki\'s Chains', icon: '🗝', type: 'key', price: 0, desc: 'Found among the bones of a hundred warriors in Aurust Castle.' },
  four_points_chart: { name: 'Chart of the Four Points', icon: '🗺', type: 'key', price: 0, desc: 'Four red marks from the four Road Poneglyphs, joined by two lines that cross in an X — past Lodestar, where no Log Pose leads.' },
  joy_boy_promise: { name: 'Joy Boy\'s Promise', icon: '☀', type: 'key', price: 0, desc: 'You know what was left on Laugh Tale. You understand why Roger laughed. The rest is yours to decide.' },
};

const stock = {
  wano_capital_market: ['oden_stew', 'oshiruko', 'rice_ball', 'wano_sake', 'bandage', 'antidote', 'den_den_mushi'],
  wano_capital_arms: ['wano_katana', 'fine_katana', 'shigure', 'bo_staff'],
  amigasa_forge: ['wano_katana', 'fine_katana', 'rusty_katana'],
  amigasa_food: ['kibi_dango', 'oshiruko', 'rice_ball'],
  egghead_store: ['rumble_ball', 'cola', 'bandage', 'antidote', 'fish_stew', 'new_world_log_pose', 'den_den_mushi'],
  elbaf_market: ['elbaf_mead', 'meat', 'sea_king_steak', 'fish_stew', 'bandage'],
  elbaf_arms: ['elbaf_axe', 'woodsman_axe', 'elbaf_helm'],
  elbaf_tavern: ['elbaf_mead', 'meat', 'fish_stew', 'sake'],
  hachinosu_black: ['rumble_ball', 'seastone', 'seastone_cuffs', 'cola', 'jewels', 'wano_sake', 'sea_king_steak'],
};

const trainers = {
  nw2_gaban: {
    name: 'Scopper Gaban', where: "Gaban's Lodge, Western Village of Elbaph", styles: { elbaf: 25000 },
    teaches: ['elbaf_hakoku', 'haki_emission', 'haki_infusion'], train: { str: 85, vit: 85, wil: 80 }, haki: { armament: 85, observation: 80, conqueror: 70 },
    spar: { level: 90, style: 'elbaf', weapon: 'axe', name: 'Scopper Gaban', haki: true },
    lines: ['Roger used to say: the one who laughs last wins. Then he laughed first anyway.', 'Coat your blade with your will. Not your fear — your will.'],
  },
};

const archetypes = {
  nw2_gifter: { name: 'Gifter', faction: 'pirate', style: 'brawler', look: GIFTER_LOOK, skill: 0.3, hpMul: 1.5, moves: ['brawl_tackle', 'brawl_headbutt'], barks: ['For Kaido-sama!', 'Ahahaha! (It never stops...)'] },
  nw2_oniwabanshu: { name: 'Oniwabanshu Ninja', faction: 'bandit', style: 'rokushiki', look: { top: '#212121', bottom: '#212121', hat: 'bandana', hatColor: '#212121' }, skill: 0.5, moves: ['roku_soru', 'nw2_kunai'], barks: ['Ninpo!', 'For the shogun!'] },
  nw2_mma: { name: 'MMA', faction: 'beast', style: 'brawler', look: MMA_LOOK, bulk: 1.8, scale: 2.4, hpMul: 3, skill: 0.2, moves: ['brawl_tackle', 'nw2_nightmare_roar'] },
};

// ------------------------------------------------------------------ install
const BROADCAST = [
  ['VEGAPUNK\'S MESSAGE', 'Every Den Den Mushi in the world', '"Hello, everyone in the world. I am Vegapunk. If you are hearing this, I am probably already dead..."'],
  ['THE VOID CENTURY', 'Eight hundred years ago', '"There was once a Great Kingdom. An alliance of twenty nations waged a Great War against it — and against Joy Boy — and became the World Government."'],
  ['THE RISING SEA', 'The Ancient Weapons', '"The weapons of that war raised the sea by two hundred metres. The continents sank. The islands you live on are all that remains... and they are sinking again."'],
  ['JOY BOY', 'History\'s first pirate', '"Joy Boy held a power like that of the sun god Nika. The crew of the Pirate King, Gol D. Roger, know the truth of that century..."'],
  ['THE LAST WORDS', 'The broadcast cuts out', '"...The fate of the world depends on whoever finds the One Piece. Please, someone—" (Static.)'],
];

function install(game) {
  const C = () => game.state?.char;
  let t = 0;
  let broadcast = null; // { t, i } while Vegapunk's message plays
  let teachT = -1; // seconds until Blackbeard lands on Laugh Tale
  let vortexT = 0;

  game.on('characterStart', () => { broadcast = null; teachT = -1; });

  game.on('knockout', (a, att) => {
    const c = C();
    if (!c || !a) return;
    if (a.npcId && TRACKED.includes(a.npcId) && att && (att.isPlayer || att.faction === 'player')) c.flags.nw2_ko = { ...(c.flags.nw2_ko || {}), [a.npcId]: true };
    syncBeatFlags(c);
  });

  game.on('bossDefeated', (a) => {
    const c = C();
    if (!c || !a) return;
    if (a.npcId === 'kaido') game.ui.banner('KAIDO HAS FALLEN', 'Onigashima', 'The strongest creature in the world crashes through the Skull Dome into the magma below. Wano will talk about this night for a thousand years.', 7);
    if (a.npcId === 'teach_hachinosu') game.ui.banner('BLACKBEARD DEFEATED', 'Hachinosu', '"Zehaha... ha... This isn\'t over! People\'s dreams... never end...!"', 6);
    if (a.npcId === 'kizaru_egghead') game.log('Kizaru staggers back into the light. "Ooh~ that one actually hurt..." Somewhere in the Labophase, a Den Den Mushi starts to speak.', '#fff59d');
  });

  game.on('enterIsland', (isl) => {
    const c = C();
    if (!c || !isl) return;
    if (isl.id === 'wano' && !started(game, 'wano_dawn')) game.quests.start('wano_dawn');
    if (isl.id === 'egghead' && !started(game, 'egghead_incident')) game.quests.start('egghead_incident');
    if (isl.id === 'elbaf' && !started(game, 'elbaf_siege')) game.quests.start('elbaf_siege');
    if (isl.id === 'lodestar') {
      // canon: at Lodestar the Log Pose cannot record the next island — the needles just spin.
      if (c.logPose) { c.logPose.target = null; c.logPose.last = 'lodestar'; c.logPose.progress = 0; }
      if (!c.flags.nw2_lodestarSeen) {
        c.flags.nw2_lodestarSeen = true;
        game.ui.banner('LODESTAR ISLAND', 'The end of the Log', 'Every needle of your Log Pose starts to spin and does not stop. No Log Pose can lead any further.', 6);
      }
      if (!started(game, 'laugh_tale_voyage')) game.quests.start('laugh_tale_voyage');
    }
  });

  // Any Road Poneglyph rubbing starts the final voyage.
  game.on('itemGained', (id) => {
    const c = C();
    if (c && id === 'poneglyph_rubbing' && !started(game, 'laugh_tale_voyage')) game.quests.start('laugh_tale_voyage');
  });

  game.on('questDone', (id) => {
    if (id === 'laugh_tale_voyage' && !started(game, 'final_rival')) { game.quests.start('final_rival'); teachT = 5; }
  });

  // Joy Boy's message on Laugh Tale is a `lore` landmark; examining it fires questEvent 'nw2_joyboy'
  game.on('questEvent', (ev) => { const c = C(); if (c && ev === 'nw2_joyboy') c.flags.nw2_readJoyBoy = true; });

  // Elbaph is a nation of giants: its townsfolk are giant-sized
  game.spawner.addBuilder((ctx) => {
    if (ctx.island.id !== 'elbaf') return;
    ctx.onTownsfolk = (a) => { a.look = { ...a.look, scale: 2 + ctx.rng.next() * 0.6, bulk: 1.2 }; };
  });

  game.on('tick', (dt) => {
    const c = C();
    if (!c || !game.player) return;

    // Vegapunk's broadcast plays over several banners
    if (game.quests.stageId('egghead_incident') === 'message') {
      if (!broadcast) broadcast = { t: 0, i: 0 };
      broadcast.t -= dt;
      if (broadcast.t <= 0) {
        if (broadcast.i < BROADCAST.length) {
          const [title, sub, text] = BROADCAST[broadcast.i++];
          game.ui.banner(title, sub, text, 7);
          broadcast.t = 7.5;
        } else {
          broadcast = null;
          game.emit('questEvent', 'nw2_vegapunk_broadcast');
        }
      }
    } else broadcast = null;

    // Blackbeard reaches Laugh Tale a few seconds after the finale
    if (teachT > 0) {
      teachT -= dt;
      if (teachT <= 0 && game.quests.stageId('final_rival') === 'duel') {
        const a = spawnNow(game, 'teach_laugh_tale');
        if (a) aggro(game, a);
        game.ui.banner('ZEHAHAHAHA!', 'Blackbeard', 'A black-flagged ship has run aground below the cliffs. Marshall D. Teach is climbing toward you.', 5);
      }
    }

    // whirlpools off Lodestar while the black ship is near
    if (game.quests.stageId('burn_scar') === 'vortex' && game.world === game.surface) {
      const isl = game.surface.islands.find((i) => i.id === 'lodestar');
      const s = isl?.spots?.vortex_bay;
      if (s && game.world.distance(game.player.x, game.player.y, s.x, s.y) < 40 && (vortexT -= dt) <= 0) {
        vortexT = 1.2;
        const ang = Math.random() * Math.PI * 2, r = 4 + Math.random() * 14;
        game.fx.ring(s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * r, 0.5, 5 + Math.random() * 4, '#4fc3f7', 1.4, 0.12);
        game.env.storm = Math.max(game.env.storm || 0, 0.5);
      }
    }

    if ((t -= dt) > 0) return;
    t = 0.5;
    syncBeatFlags(c);
    if (game.currentIsland?.id === 'elbaf') {
      const loki = findActor(game, 'loki');
      if (loki && loki.state === 'idle' && !loki.aggroPlayer && !loki.provoked && loki.controller?.kind === 'hostile') { loki.controller.kind = 'guard'; loki.stationary = true; }
    }
    // the rubbings are read as soon as someone aboard can read the ancient script
    if (game.quests.stageId('laugh_tale_voyage') === 'decipher' && !c.flags.laughTaleRevealed && canDecipher(game, c)) {
      const who = (c.crew || []).find((m) => m.role === 'archaeologist')?.name || 'You';
      revealLaughTale(game, c, who);
    }
    // finale re-opens if the dialogue was closed early
    if (game.quests.stageId('laugh_tale_voyage') === 'laugh' && !c.flags.laughTale && !game.dialogue?.active && game.currentIsland?.id === 'laugh_tale') {
      const s = game.currentIsland.spots?.one_piece;
      if (s && game.world.distance(game.player.x, game.player.y, s.x, s.y) < 4) openFinale(game);
    }
  });
}

export default {
  id: 'newWorld2', npcs, groups, quests, items, trainers, stock, archetypes, abilities,
  dynamicIds: ['s_hawk', 's_bear', 's_snake', 's_shark', 'mma_beast', 'bb_scavenger'],
  install,
};
