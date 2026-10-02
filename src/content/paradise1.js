// Paradise, first half — content pack. From the foot of Reverse Mountain to
// Long Ring Long Land: Laboon's promise, Whisky Peak's bounty hunters, the
// giants of Little Garden, Wapol's return to Drum, Crocodile's Operation
// Utopia in Alabasta, the Golden City of Jaya, God Enel of Skypiea (zone) and
// Foxy's Davy Back Fight. The player is a rival rookie arriving at the same
// moment as the canon events; Straw Hats stay off-stage.
import './bossMoves.js';
import { spawnNow, findActor, aggro, seaBoss, despawn } from './helpers.js';
import { count, useItem } from '../game/inventory.js';
import { makeEnemy } from '../game/npcs.js';

// ------------------------------------------------------------------ helpers
const stg = (g, id) => g.quests.stageId(id);
const isDone = (g, id) => g.quests.isDone(id);
const act = (ctx, id, s) => ctx.game.quests.stageId(id) === s;
const fin = (ctx, id) => ctx.game.quests.isDone(id);
const beat = (c, id) => (c.bosses || []).includes(id) || !!(c.defeated || {})[id];
const inCrew = (c, id) => (c.crew || []).some((m) => m.id === id);
const giver = (id, report = 'report') => (c, g) => (!g.quests.state(id) ? '!' : g.quests.stageId(id) === report ? '?' : null);
const pirate = (c) => (c.bounty || 0) > 0 && c.faction !== 'marine';

/** The island record in the current world (surface or zone). */
function islandRec(game, islandId) {
  return (game.world?.islands || []).find((i) => i.id === islandId) || null;
}
/** Spawn a registered NPC at a spot — only while its island is populated. */
function spawnAt(game, npcId, islandId, spotId, ox = 0) {
  if (!game.spawner.populated.has(islandId)) return null;
  const isl = islandRec(game, islandId);
  const s = isl?.spots?.[spotId];
  if (!s) return spawnNow(game, npcId);
  const p = game.spawner.findFree(s.x + ox, s.y, 4) || { x: s.x + ox, y: s.y };
  return spawnNow(game, npcId, p);
}
/** Spawn an enemy group right now (when a stage starts on the island). */
function spawnGroupNow(game, islandId, spotId, enemies, radius = 5) {
  const list = game.spawner.populated.get(islandId);
  const s = islandRec(game, islandId)?.spots?.[spotId];
  if (!list || !s) return;
  for (const [arch, lvl, over] of enemies) {
    const p = game.spawner.findFree(s.x, s.y, radius);
    if (!p) continue;
    const a = makeEnemy(arch, lvl, p.x, p.y, over || {});
    a.game = game;
    game.addActor(a);
    list.push(a);
  }
}
/** Leave a pickup on the ground at a spot (quest items found in the world). */
function ensureGroundItem(game, islandId, spotId, itemId, label) {
  const c = game.state?.char;
  if (!c || count(c, itemId) > 0) return;
  const s = islandRec(game, islandId)?.spots?.[spotId];
  if (!s) return;
  game.groundItems = game.groundItems || [];
  if (game.groundItems.some((it) => it.p1Key === itemId)) return;
  const p = game.spawner.findFree(s.x, s.y, 5) || { x: s.x, y: s.y };
  game.groundItems.push({ x: p.x, y: p.y, id: itemId, label, p1Key: itemId });
}
const banner = (g, a, b, c, t = 5) => g.ui?.banner?.(a, b, c, t);

// Enemy lists shared by group defs and the "spawn it now" stage starts.
const WP_MILLIONS = [['p1_millions', 16, { name: 'Millions Agent' }], ['p1_millions', 16, { name: 'Millions Agent' }], ['p1_billions', 17, { name: 'Millions Gunner' }], ['p1_millions', 17, { name: 'Millions Agent' }]];
const BLIKING = [['p1_bliking', 21, { name: 'Bliking Pirate' }], ['p1_bliking', 21, { name: 'Bliking Pirate' }], ['p1_bliking', 22, { name: 'Bliking Gunner' }]];
const BILLIONS = [
  ['p1_billions', 25, { id: 'p1_billions_agent', name: 'Billions Agent' }], ['p1_billions', 25, { id: 'p1_billions_agent', name: 'Billions Agent' }],
  ['p1_millions', 25, { id: 'p1_billions_agent', name: 'Billions Swordsman' }], ['p1_billions', 26, { id: 'p1_billions_agent', name: 'Billions Agent' }],
  ['p1_bananawani', 27, { name: 'Bananawani' }],
];
const ALUBARNA_MILLIONS = [['p1_millions', 26, { name: 'Millions Agent' }], ['p1_millions', 26, { name: 'Millions Agent' }], ['p1_billions', 27, { name: 'Billions Sniper' }]];
const JAYA_INSECTS = [['p1_giant_insect', 24, { name: 'Giant Jaya Hornet' }], ['p1_giant_insect', 24, { name: 'Giant Praying Mantis', look: { top: '#7cb342', bottom: '#558b2f', skin: '#9ccc65' } }], ['p1_giant_insect', 25, { name: 'Giant Moth', look: { top: '#8d6e63', bottom: '#6d4c41', skin: '#a1887f' } }]];
const DIVINE = [['p1_divine_soldier', 30, { name: 'Divine Soldier' }], ['p1_divine_soldier', 30, { name: 'Divine Soldier' }], ['p1_divine_soldier', 31, { name: 'Divine Soldier' }]];
const WHITE_BERETS = [['p1_white_beret', 22, { name: 'White Beret' }], ['p1_white_beret', 22, { name: 'White Beret' }], ['p1_white_beret', 23, { name: 'White Beret' }]];

// ==================================================================== NPCs
const npcsA = [
  // ================================================================ Twin Cape
  {
    id: 'p1_crocus', name: 'Crocus', title: 'Keeper of the Twin Cape Lighthouse', island: 'twin_cape', at: { spot: 'lighthouse' },
    look: { hair: 'bald', hairColor: '#eceff1', skin: '#f1c9a0', top: '#eceff1', bottom: '#4e342e', bulk: 1.1 }, level: 45,
    doctor: { line: `"Sit down. I was a ship's doctor once — on a ship you wouldn't believe."` },
    marker: giver('p1_laboon_promise'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (fin(ctx, 'p1_laboon_promise')) return `"Laboon has stopped ramming the Red Line. He's waiting for you now — so don't you dare die out there."`;
            if (act(ctx, 'p1_laboon_promise', 'hunters')) return `"Whale hunters on the north cape, harpoon and all! Stop them before they hurt him!"`;
            if (act(ctx, 'p1_laboon_promise', 'promise')) return `"The hunters are gone. Go down to the western shore — Laboon is right there. Talk to him. He understands more than you'd think."`;
            return `"...Hm. Another crew made it down the mountain alive. Don't mind the whale — that's Laboon. He has been waiting at this cape for fifty years."`;
          },
          choices: [
            { text: 'Fifty years? Waiting for what?', if: () => !ctx.quest('p1_laboon_promise'), next: 'story' },
            { text: 'Laboon and I made a promise.', if: () => act(ctx, 'p1_laboon_promise', 'report'), next: 'reward' },
            { text: 'I have no Log Pose...', if: () => !ctx.has('log_pose') && !ctx.flag('p1_crocusPose'), next: 'pose' },
            { text: 'Tell me about the Grand Line.', next: 'gl' },
            { text: 'Patch me up, doctor.', do: (c) => c.open('doctor', {}) },
            { text: 'Goodbye.', end: true },
          ],
        },
        story: { text: `"The Rumbar Pirates, out of the West Blue. A baby Island Whale followed their ship all the way here. They left him with me and swore they'd sail around the world and come back for him in two or three years."`, next: 'story2' },
        story2: {
          text: `"They never came. Laboon thinks they're behind the Red Line, so he rams it with his head — his skull is nothing but scars. And lately, fools from Cactus Island come to hunt him for meat."`,
          choices: [{ text: 'Nobody hunts him while I\'m here.', do: (c) => c.startQuest('p1_laboon_promise'), end: true }, { text: 'Sad story.', end: true }],
        },
        pose: { text: `"No Log Pose? You'd be dead in a week. Take my spare. Stay on an island until the needle settles, then follow it. From this cape it can lock onto seven different islands."`, onEnter: (c) => { c.setFlag('p1_crocusPose'); c.give('log_pose', 1); }, next: 'a' },
        gl: { text: `"From here the needle picks one of seven islands — seven routes, and all of them end at Sabaody. Every island has its own weather and magnetism. Never trust the sky. Trust the needle."`, next: 'a' },
        reward: { text: `"...You made the old fool happy. I haven't heard him sing like that in fifty years. Here — medicine from my days at sea, and a doctor's thanks."`, onEnter: (c) => c.complete('p1_laboon_promise') },
      },
    }),
  },
  {
    id: 'p1_mr9_cape', name: 'Mr. 9', title: 'Frontier Agent, Baroque Works', island: 'twin_cape', at: { spot: 'harpoon_point' },
    look: { hair: 'short', hairColor: '#212121', top: '#7b1fa2', bottom: '#4a148c', hat: 'crown', hatColor: '#ffd54f' }, level: 15,
    hostile: true, named: true, faction: 'baroque', style: 'brawler', moves: ['p1_mr9_bat'], skill: 0.25,
    alert: `"That whale's meat enough for our whole town for a year! Out of the way!"`, barks: ['Nine Bat!', 'Acrobatics!'],
    when: (c, g) => stg(g, 'p1_laboon_promise') === 'hunters',
  },
  {
    id: 'p1_miss_wednesday', name: 'Miss Wednesday', title: 'Frontier Agent, Baroque Works', island: 'twin_cape', at: { spot: 'harpoon_point' },
    look: { hair: 'ponytail', hairColor: '#4fc3f7', skin: '#f9dcc4', top: '#fafafa', bottom: '#5c6bc0' }, level: 14,
    when: (c, g) => ['hunters', 'promise', 'report'].includes(stg(g, 'p1_laboon_promise')),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => beat(ctx.char, 'p1_mr9_cape')
            ? `"Mr. 9, you idiot... (She sighs.) We're from Whisky Peak, on Cactus Island. Our Log Pose points straight at it. If you're headed that way, we'd love a ride — our town adores visitors."`
            : `"W-we're just... fishing! Our town is hungry and this whale is the size of a mountain. It was Mr. 9's idea!"`,
          onEnter: (c) => { if (beat(c.char, 'p1_mr9_cape')) c.setFlag('p1_wpInvite'); },
        },
      },
    }),
  },

  // ================================================================ Navarone (G-8)
  {
    id: 'p1_jonathan', name: 'Vice Admiral Jonathan', title: 'Commander of Marine Base G-8', island: 'navarone', at: { town: 'g8_base', building: 'G-8 Headquarters' },
    look: { hair: 'short', hairColor: '#212121', skin: '#e0ac7e', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE', hat: 'marine' }, level: 70, faction: 'marine', fixedPower: 9000,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => pirate(ctx.char)
            ? (ctx.flag('p1_g8Escaped') ? `"You broke out of Navarone. My men haven't had that much fun in years, nah. Don't come back — or do. We're bored."` : `"Nah... a pirate strolls into my base? Bold. My men will be thrilled — nothing ever happens here. Go on, try to get out."`)
            : `"Welcome to G-8, 'the Hedgehog'. We patch up the Marines and ships the Grand Line chews up. Headquarters keeps trying to close us down, nah. Care for a game of chess?"`,
          choices: [
            { text: 'Enlist in the Marines', if: () => ctx.char.faction !== 'marine' && !pirate(ctx.char), do: (c) => c.emit('marineEnlist', 'G-8'), end: true },
            { text: 'Marine business', if: () => ctx.char.faction === 'marine', do: (c) => c.emit('marineOffice', { name: 'G-8 Headquarters' }), end: true },
            { text: 'Drill with the G-8 instructors', if: () => ctx.char.faction === 'marine', do: (c) => c.open('trainer', { trainer: 'marine_instructor' }) },
            { text: 'Why "the Hedgehog"?', next: 'hog' },
            { text: 'Leave', end: true },
          ],
        },
        hog: { text: `"A hundred and eight cannons on the main base alone, and one gate on the cape. Nobody gets in, nobody gets out. HQ calls us useless. I call us ready."`, next: 'a' },
      },
    }),
  },
  {
    id: 'p1_jessica', name: 'Head Chef Jessica', title: "G-8's Mess Hall", island: 'navarone', at: { town: 'g8_base', building: "Jessica's Mess Hall" },
    look: { hair: 'bun', hairColor: '#795548', skin: '#f1c9a0', top: '#fafafa', bottom: '#1b4f72', bulk: 1.15 }, level: 20, faction: 'marine',
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => pirate(ctx.char) ? `"Pirate or not, nobody leaves my mess hall hungry! Rule number one of G-8: finish your meal. ...Then run."` : `"Rule number one of G-8: finish your meal! Rule number two: FINISH YOUR MEAL. Sit, sit!"`,
      choices: [{ text: 'Eat', do: (c) => c.open('shop', { shop: ['meat', 'fish_stew', 'rice_ball', 'sea_king_steak'], building: { name: "Jessica's Mess Hall", role: 'restaurant' } }) }, { text: 'Thanks, chef.', end: true }],
    } } }),
  },
  {
    id: 'p1_g8_drake', name: 'Lt. Commander Drake', title: 'Navarone Garrison, G-8', island: 'navarone', at: { spot: 'main_gate' },
    look: { hair: 'short', hairColor: '#5d4037', top: '#fafafa', bottom: '#1b4f72', hat: 'marine', swords: 1 }, level: 24,
    hostile: true, named: true, faction: 'marine', style: 'ittoryu', weapon: 'sword', moves: ['itto_iai', 'itto_whirl'], lethal: false, skill: 0.5, breakthrough: 1,
    alert: `"The gate stays shut! Nobody escapes Navarone!"`,
    when: (c) => pirate(c) && !c.flags.p1_g8Escaped && !c.defeated.p1_g8_drake,
  },

  // ================================================================ Ruluka Island
  {
    id: 'p1_henzo', name: 'Henzo', title: 'Inventor, formerly of the Pumpkin Pirates', island: 'ruluka_island', at: { town: 'ruluka_town', building: "Henzo's Workshop" },
    look: { hair: 'bald', hairColor: '#e0e0e0', skin: '#f1c9a0', top: '#8d6e63', bottom: '#5d4037', goggles: true }, level: 8,
    marker: giver('p1_ruluka_rainbow'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => fin(ctx, 'p1_ruluka_rainbow')
            ? `"No more taxes on breathing! I can finally finish my research. One day the Rainbow Mist will come back — and I'll bring my friends home."`
            : `"Fifty years I've waited for the Rainbow Mist to return. My friends sailed into it as boys and never came out. And Mayor Wetton taxes me for every breath I take while I wait."`,
          choices: [
            { text: 'Who is this Wetton?', if: () => !ctx.quest('p1_ruluka_rainbow'), next: 'wet' },
            { text: 'Wetton won\'t tax anyone again.', if: () => act(ctx, 'p1_ruluka_rainbow', 'report'), do: (c) => c.complete('p1_ruluka_rainbow'), next: 'thx' },
            { text: 'Your workshop — can you fix my ship?', do: (c) => c.open('shipwright', {}) },
            { text: 'Goodbye.', end: true },
          ],
        },
        wet: {
          text: `"A pirate who burned this town, then made himself mayor. Tax on bread, tax on water, tax on eating what you already paid for! He built that Rainbow Tower with our money to reach the mist."`,
          choices: [{ text: 'I\'ll pay the mayor a visit.', do: (c) => c.startQuest('p1_ruluka_rainbow'), end: true }, { text: 'Not my business.', end: true }],
        },
        thx: { text: `"You did it! Here — everything I'd saved for taxes. It's yours. And when the mist comes back... I'll build you a ship that can sail through it."` },
      },
    }),
  },
  {
    id: 'p1_wetton', name: 'Mayor Wetton', title: 'Mayor of Ruluka, former Wetton Pirates captain', island: 'ruluka_island', at: { town: 'ruluka_town', building: "Mayor Wetton's Mansion" },
    look: { hair: 'curly', hairColor: '#9e9e9e', skin: '#e0ac7e', top: '#6a1b9a', bottom: '#212121', hat: 'captain', hatColor: '#4a148c', bulk: 1.3 }, level: 20,
    boss: true, hpMul: 0.95, faction: 'pirate', style: 'brawler', moves: ['p1_wetton_tax', 'brawl_tackle', 'snipe_explode'], bounty: 14800000, infamy: true, breakthrough: 2, skill: 0.35,
    alert: `"Resisting the mayor? That's a Resistance Tax — payable in blood!"`, barks: ['Tax!', 'That\'ll cost you!'],
    when: (c) => !c.bosses.includes('p1_wetton'),
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: `"Speaking to the mayor costs ฿10,000. Looking at me costs ฿5,000. Breathing near me... let's call it ฿3,000. You owe the town of Ruluka a great deal."`,
      choices: [
        { text: 'Your tyranny ends now.', if: () => act(ctx, 'p1_ruluka_rainbow', 'wetton'), do: (c) => aggro(c.game, findActor(c.game, 'p1_wetton')), end: true },
        { text: 'Pay the "talking tax" (฿10,000)', do: (c) => (c.pay(10000) ? 'paid' : 'a') },
        { text: 'Leave (without paying)', end: true },
      ] },
      paid: { text: `"A model citizen! The Rainbow Tower grows taller with every coin. When it reaches the mist, the treasure of the Pumpkin Pirates will be MINE."` } } }),
  },

  // ================================================================ Kenzan Island
  {
    id: 'p1_tenaga', name: 'Old Tenaga', title: 'Longarm fisherman', island: 'kenzan_island', at: { town: 'tehna_gehna', building: "Old Tenaga's House" }, race: 'longarm',
    look: { hair: 'long', hairColor: '#eceff1', top: '#b71c1c', bottom: '#263238' }, level: 12,
    marker: giver('p1_kenzan_whirlpool'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => fin(ctx, 'p1_kenzan_whirlpool')
            ? `"The boats come home full again! Two elbows or one, you have a long reach, friend. Come eat with us whenever you like."`
            : `"Welcome to the Tehna Gehna Kingdom! We Longarms have two elbows — we can pull a fish out of the sea without getting our feet wet. Well... we could."`,
          choices: [
            { text: 'What happened?', if: () => !ctx.quest('p1_kenzan_whirlpool'), next: 'what' },
            { text: 'The Whirlpool Lord is dead.', if: () => act(ctx, 'p1_kenzan_whirlpool', 'report'), do: (c) => c.complete('p1_kenzan_whirlpool'), next: 'thx' },
            { text: 'Goodbye.', end: true },
          ],
        },
        what: {
          text: `"A Sea King nests in the whirlpools north of the island. It swallows our boats whole — even a Longarm can't reach that deep. If someone with a real ship could kill it..."`,
          choices: [{ text: 'I\'ll hunt it.', do: (c) => c.startQuest('p1_kenzan_whirlpool'), end: true }, { text: 'Sounds dangerous.', end: true }],
        },
        thx: { text: `"You really killed it?! Take this — and a fisherman's secret: the whirlpools calm down at dusk. Sail at sunset and the sea will be kind."` },
      },
    }),
  },

  // ================================================================ Foolshout Island
  {
    id: 'p1_koala_mother', name: "Koala's Mother", title: 'Villager of Foolshout', island: 'foolshout_island', at: { town: 'foolshout_village', building: "Koala's Home" },
    look: { hair: 'long', hairColor: '#ff8a65', skin: '#f1c9a0', top: '#aed581', bottom: '#6d4c41' }, level: 3,
    marker: giver('p1_foolshout_sun'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => fin(ctx, 'p1_foolshout_sun')
            ? `"I keep the sun flag folded by the window. If Koala ever comes home again, the first thing she'll see is the mark of the people who saved her."`
            : `"Years ago my daughter Koala was taken to Mary Geoise as a slave. A crew of fish-men — the Sun Pirates — brought her all the way home. Their captain, Fisher Tiger, died on this island."`,
          choices: [
            { text: 'How did he die?', if: () => !ctx.quest('p1_foolshout_sun'), next: 'how' },
            { text: 'I found the Sun Pirates\' flag.', if: () => act(ctx, 'p1_foolshout_sun', 'report') && ctx.has('p1_sun_flag'), do: (c) => { c.take('p1_sun_flag', 1); c.complete('p1_foolshout_sun'); }, next: 'thx' },
            { text: 'Goodbye.', end: true },
          ],
        },
        how: {
          text: `"Marines were waiting at the anchorage — Rear Admiral Strawberry. Someone in town had told them... Tiger refused a transfusion of human blood and died. The Sun Pirates left their flag in the wreck."`,
          choices: [{ text: 'I\'ll find the flag for you.', do: (c) => c.startQuest('p1_foolshout_sun'), end: true }, { text: 'I\'m sorry.', end: true }],
        },
        thx: { text: `"The sun... they painted it over their slave brands, so nobody could tell who had been a slave. Thank you. Koala left to see the world, but this will be here when she comes back."` },
      },
    }),
  },

  // ================================================================ Cactus Island — Whisky Peak
  {
    id: 'p1_igaram', name: 'Igaram', title: '"Mayor Igarappoi" of Whisky Peak', island: 'cactus_island', at: { town: 'whisky_peak', building: 'Whisky Peak Saloon' },
    look: { hair: 'curly', hairColor: '#d7ccc8', skin: '#f1c9a0', top: '#fafafa', bottom: '#212121', coat: '#212121', bulk: 1.15 }, level: 26,
    marker: giver('p1_whisky_peak'),
    when: (c, g) => !isDone(g, 'p1_whisky_peak'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('p1_whisky_peak');
            if (s === 'party') return `"Ma-ma-maaa~! The party is ready! Liquor, song and meat — drink, brave sailors, drink until you drop!"`;
            if (s === 'hunters') return `"...You're sharper than you look. Forgive this old man. Business is business in Whisky Peak."`;
            if (s === 'traitor') return `"Mr. 5 and Miss Valentine — Officer Agents! They've come to kill Miss Wednesday. She is Princess Nefertari Vivi of Alabasta! I beg you, protect her!"`;
            if (s === 'report') return `"You saved the princess. Now listen..."`;
            return `"Ma-ma-maaa~! Welcome, brave sailors, to Whisky Peak — the town of music and liquor! We welcome all who conquer Reverse Mountain. Tonight we throw a party in your honour!"`;
          },
          choices: [
            { text: 'A party? Count me in.', if: () => !ctx.quest('p1_whisky_peak'), do: (c) => c.startQuest('p1_whisky_peak'), next: 'a' },
            { text: 'Drink until you pass out.', if: () => act(ctx, 'p1_whisky_peak', 'party'), next: 'drunk' },
            { text: 'Pretend to drink. Stay awake.', if: () => act(ctx, 'p1_whisky_peak', 'party'), next: 'sober' },
            { text: 'What happens now?', if: () => act(ctx, 'p1_whisky_peak', 'report'), next: 'plan' },
            { text: 'Something to drink.', if: () => !ctx.quest('p1_whisky_peak') || fin(ctx, 'p1_whisky_peak'), do: (c) => c.open('shop', { shop: 'p1_whisky_stock', building: { name: 'Whisky Peak Saloon', role: 'bar' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
        drunk: { text: `(The whisky is excellent. Very excellent. The room spins... When you open your eyes it is midnight, you are tied to a chair — and a hundred bounty hunters are grinning at you. You snap the ropes.)`, onEnter: (c) => c.stage('p1_whisky_peak', 'hunters') },
        sober: { text: `(You pour your drinks into a potted cactus. At midnight the "townsfolk" sharpen their knives and load their rifles. "Whisky Peak is a nest of bounty hunters," you realise. They come for you.)`, onEnter: (c) => c.stage('p1_whisky_peak', 'hunters') },
        plan: { text: `"I will dress as the princess and sail ahead to Alabasta as a decoy. You follow the Log Pose — Little Garden is next. Baroque Works will hunt anyone who helped us. May the sea be kind to you."`, onEnter: (c) => c.complete('p1_whisky_peak') },
      },
    }),
  },
  {
    id: 'p1_distiller', name: 'Brewmaster Bourbon', title: 'Whisky Peak Distillery (and part-time bounty hunter)', island: 'cactus_island', at: { town: 'whisky_peak', building: 'Whisky Peak Distillery' },
    look: { hair: 'short', hairColor: '#8d6e63', skin: '#e0ac7e', top: '#795548', bottom: '#3e2723', hat: 'cowboy', hatColor: '#5d4037' }, level: 12,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => fin(ctx, 'p1_whisky_peak') ? `"No hard feelings about the ambush, eh? The whisky, at least, was always honest. Best in the Grand Line."` : `"Whisky Peak whisky! Aged in cactus barrels. One sip and you'll sleep like a baby. ...Heh. Just a figure of speech."`,
      choices: [{ text: 'Buy', do: (c) => c.open('shop', { shop: 'p1_whisky_stock', building: { name: 'Whisky Peak Distillery', role: 'shop' } }) }, { text: 'Leave', end: true }],
    } } }),
  },
  {
    id: 'p1_mr9', name: 'Mr. 9', title: 'Frontier Agent, Baroque Works', island: 'cactus_island', at: { town: 'whisky_peak', plaza: true, ox: -4 },
    look: { hair: 'short', hairColor: '#212121', top: '#7b1fa2', bottom: '#4a148c', hat: 'crown', hatColor: '#ffd54f' }, level: 17,
    hostile: true, named: true, faction: 'baroque', style: 'brawler', moves: ['p1_mr9_bat'], skill: 0.3,
    alert: `"Your head is worth good money in Whisky Peak!"`, barks: ['Nine Bat!'],
    when: (c, g) => stg(g, 'p1_whisky_peak') === 'hunters' && !c.defeated.p1_mr9,
  },
  {
    id: 'p1_miss_monday', name: 'Miss Monday', title: 'Frontier Agent, Baroque Works', island: 'cactus_island', at: { town: 'whisky_peak', plaza: true, ox: 4 },
    look: { hair: 'short', hairColor: '#ff7043', skin: '#e0ac7e', top: '#fdd835', bottom: '#3e2723', bulk: 1.35 }, bulk: 1.35, level: 18,
    hostile: true, named: true, faction: 'baroque', style: 'brawler', moves: ['p1_monday_punch', 'brawl_tackle'], skill: 0.3, hpMul: 1.2,
    alert: `"Nobody out-muscles Miss Monday!"`,
    when: (c, g) => stg(g, 'p1_whisky_peak') === 'hunters' && !c.defeated.p1_miss_monday,
  },
  {
    id: 'p1_mr5', name: 'Mr. 5', title: '"Gem of the Border", Officer Agent of Baroque Works', island: 'cactus_island', at: { spot: 'wp_outskirts' },
    look: { hair: 'pompadour', hairColor: '#ffcc80', skin: '#e0ac7e', top: '#fafafa', bottom: '#1a237e', coat: '#283593', goggles: true }, level: 21,
    boss: true, hpMul: 0.95, faction: 'baroque', fruit: 'bomu', fruitMastery: 55, moves: ['bomu_kick', 'bomu_nose', 'bomu_breeze'],
    bounty: 10000000, infamy: true, breakthrough: 3, skill: 0.4, hostile: true,
    alert: `"Orders from the boss: the traitor dies — and so does anyone who gets in the way."`, barks: ['Nose Fancy Cannon.', 'Boom.'],
    when: (c, g) => stg(g, 'p1_whisky_peak') === 'traitor',
  },
  {
    id: 'p1_miss_valentine', name: 'Miss Valentine', title: '"Courier", Officer Agent of Baroque Works', island: 'cactus_island', at: { spot: 'wp_outskirts' },
    look: { hair: 'ponytail', hairColor: '#ffe082', skin: '#f9dcc4', top: '#fff176', bottom: '#f9a825', hat: 'cowboy', hatColor: '#fdd835' }, level: 19,
    hostile: true, named: true, faction: 'baroque', style: 'brawler', moves: ['p1_kilo_press'], bounty: 7500000, infamy: true, skill: 0.35,
    alert: `"Kyahahaha! Ten thousand kilo press!"`,
    when: (c, g) => stg(g, 'p1_whisky_peak') === 'traitor' && !c.defeated.p1_miss_valentine,
  },
  {
    id: 'p1_vivi_wp', name: 'Nefertari Vivi', title: 'Princess of Alabasta ("Miss Wednesday")', island: 'cactus_island', at: { spot: 'wp_outskirts' },
    look: { hair: 'ponytail', hairColor: '#4fc3f7', skin: '#f9dcc4', top: '#fafafa', bottom: '#5c6bc0' }, level: 16,
    when: (c, g) => ['traitor', 'report'].includes(stg(g, 'p1_whisky_peak')),
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => act(ctx, 'p1_whisky_peak', 'traitor')
        ? `"Please — stop them! I joined Baroque Works to learn who their boss is. I found out: Mr. 0 is Crocodile, one of the Seven Warlords! He's the one tearing my country apart!"`
        : `"Thank you... Alabasta is dying. Crocodile made it stop raining, and my people think it's my father's fault. If you ever reach Nanohana, find me."`,
    } } }),
  },
  {
    id: 'p1_mr9_crew', name: 'Mr. 9', title: 'Former Frontier Agent', island: 'cactus_island', at: { town: 'whisky_peak', plaza: true, ox: -3 },
    look: { hair: 'short', hairColor: '#212121', top: '#7b1fa2', bottom: '#4a148c', hat: 'crown', hatColor: '#ffd54f' }, level: 18, style: 'brawler', moves: ['p1_mr9_bat'],
    when: (c, g) => isDone(g, 'p1_whisky_peak') && !inCrew(c, 'p1_mr9_crew') && !c.flags['leftCrew_p1_mr9_crew'],
    recruit: { role: 'fighter', fighter: true, requires: (c, g) => isDone(g, 'p1_whisky_peak'), pitch: `"Baroque Works wants my head for failing. Take me along — I'll swing a bat for you! (Miss Monday says she'll wait for me. She's scary when she waits.)"` },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: `"Baroque Works fires people with bombs, you know. So I quit first! ...A king of the bat needs a new kingdom. Any openings on your ship?"` } } }),
  },
  {
    id: 'p1_miss_all_sunday', name: 'Miss All Sunday', title: 'Partner of Mr. 0, Baroque Works', island: 'cactus_island', at: { town: 'whisky_peak', plaza: true, ox: 6 },
    look: { hair: 'long', hairColor: '#212121', skin: '#c68642', top: '#6a1b9a', bottom: '#4a148c', hat: 'cowboy', hatColor: '#6a1b9a' }, level: 60, fixedPower: 8000, ai: 'idle',
    when: (c, g) => isDone(g, 'p1_whisky_peak') && !c.flags.p1_poseChoice,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: `"So you're the ones who helped the princess. How sweet. The log route to Alabasta will kill you long before Baroque Works does. Here — an Eternal Pose to Nanimonai Island, one stop before Alabasta."`,
          choices: [
            { text: 'Take the Eternal Pose.', do: (c) => { c.setFlag('p1_poseChoice'); c.give('eternal_pose_nanimonai', 1); }, next: 'take' },
            { text: 'Crush it. Nobody sets my course but me.', do: (c) => { c.setFlag('p1_poseChoice'); c.setFlag('p1_crushedPose'); c.progression.raiseAttr('wil', 1); }, next: 'crush' },
          ],
        },
        take: { text: `"A sensible choice. ...Or is it? (She smiles and is gone, like a flower closing.)"` },
        crush: { text: `"(The glass crunches in your fist.) ...Interesting. I do like people who are hard to kill. (She walks away without looking back.)"` },
      },
    }),
  },

  // ================================================================ Kyuka Island
  {
    id: 'p1_kyuka_manager', name: 'Manager Sunny', title: 'Hotel Kyuka', island: 'kyuka_island', at: { town: 'kyuka_resort', building: 'Hotel Kyuka' },
    look: { hair: 'short', hairColor: '#ffcc80', skin: '#f1c9a0', top: '#fafafa', bottom: '#26a69a', hat: 'cowboy', hatColor: '#fff59d' }, level: 4,
    marker: giver('p1_kyuka_bill'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => act(ctx, 'p1_kyuka_bill', 'report')
            ? `"You found him?! And he... paid? Well, you took it out of his hide, I suppose. Here's your finder's fee!"`
            : `"Welcome to Kyuka Island, the holiday island! Pools, ice cream and the finest hotel in Paradise. Will you be staying with us?"`,
          choices: [
            { text: 'A room for the night.', do: (c) => c.open('inn', { building: { name: 'Hotel Kyuka', role: 'inn' } }) },
            { text: 'You look troubled.', if: () => !ctx.quest('p1_kyuka_bill') && (ctx.flag('p1_mr3LeftKyuka') || !!ctx.quest('p1_little_garden') || beat(ctx.char, 'p1_mr3')), next: 'bill' },
            { text: 'Here\'s what those two owed.', if: () => act(ctx, 'p1_kyuka_bill', 'report'), do: (c) => c.complete('p1_kyuka_bill'), end: true },
            { text: 'Goodbye.', end: true },
          ],
        },
        bill: {
          text: `"Two guests left without paying! A man whose hair looks like a '3', and a little girl with a paintbrush — room service, forty ice creams, tea every hour! They sailed for Little Garden. If you run into them..."`,
          choices: [{ text: 'I\'ll collect.', do: (c) => c.startQuest('p1_kyuka_bill'), end: true }, { text: 'Not my problem.', end: true }],
        },
      },
    }),
  },
  {
    id: 'p1_mr3_vacation', name: 'Mr. 3', title: 'On holiday (do not disturb)', island: 'kyuka_island', at: { spot: 'umbrella_tree' },
    look: { hair: 'curly', hairColor: '#212121', skin: '#f1c9a0', top: '#fafafa', bottom: '#212121', coat: '#ef6c00', goggles: true }, level: 24, ai: 'idle', fixedPower: 60,
    when: (c, g) => !g.quests.state('p1_little_garden') && !c.flags.p1_mr3LeftKyuka && !c.bosses.includes('p1_mr3'),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: `"Can't you see I'm on vacation? ...Hm? The Den Den Mushi. (He listens.) Yes, boss. Little Garden. The princess and her new friends. Understood."`, next: 'b' },
      b: { text: `"(He snaps the snail shut.) Miss Goldenweek! Pack the paints — we're leaving. The hotel? Oh, the hotel can send the bill to Baroque Works. Hahahaha!"`, onEnter: (c) => c.setFlag('p1_mr3LeftKyuka') },
    } }),
  },
  {
    id: 'p1_goldenweek_vacation', name: 'Miss Goldenweek', title: 'On holiday', island: 'kyuka_island', at: { spot: 'umbrella_tree' },
    look: { hair: 'short', hairColor: '#212121', skin: '#f9dcc4', top: '#fafafa', bottom: '#ef9a9a', hat: 'beanie', hatColor: '#ffe082', scale: 0.8 }, level: 20, ai: 'idle', fixedPower: 50,
    when: (c, g) => !c.flags.p1_mr3LeftKyuka && !c.bosses.includes('p1_mr3'),
    dialogue: () => ({ start: 'a', nodes: { a: { text: `"...Tea time." (She sips her tea, paints a small picture of a rice cracker, and does not look at you again.)` } } }),
  },
  {
    id: 'p1_hina_kyuka', name: 'Captain Hina', title: '"Black Cage" Hina, Marine Captain (on holiday)', island: 'kyuka_island', at: { town: 'kyuka_resort', plaza: true, ox: 4 },
    look: { hair: 'long', hairColor: '#f48fb1', skin: '#f9dcc4', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE' }, level: 55, faction: 'marine', fixedPower: 7000,
    when: (c, g) => isDone(g, 'p1_alabasta'),
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => ctx.char.faction === 'marine'
        ? `"Hina is on holiday. Hina is also hunting Baroque Works' escaped agents. Hina is annoyed that you are asking. What do you need, sailor?"`
        : pirate(ctx.char) ? `"Hina is on holiday. Hina will pretend she did not see a wanted pirate eating ice cream. Today only. Hina is merciful."` : `"Hina is on holiday. Hina's subordinates are somewhere in the pool, doing a dance. Hina is displeased."`,
      choices: [
        { text: 'Marine business', if: () => ctx.char.faction === 'marine', do: (c) => c.emit('marineOffice', { name: 'Captain Hina' }), end: true },
        { text: 'Enjoy your holiday.', end: true },
      ],
    } } }),
  },

  // ================================================================ Vira
  {
    id: 'p1_vira_archivist', name: 'Archivist Soleil', title: 'Keeper of the Vira Harbour Archives', island: 'vira', at: { town: 'vira_town', building: 'Vira Harbour Archives' },
    look: { hair: 'bun', hairColor: '#bdbdbd', skin: '#f1c9a0', top: '#5c6bc0', bottom: '#37474f', goggles: true }, level: 5,
    marker: giver('p1_vira_logbook'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => fin(ctx, 'p1_vira_logbook')
            ? `"The register is whole again. Four hundred years of ships, every one written down. History is what you choose to keep, traveller."`
            : `"Vira was a sunny little town once. Four hundred years of ships came through this harbour, and every one is in our register. Two years ago the Revolutionary Army toppled the king... and the palace burned."`,
          choices: [
            { text: 'Read in the archives.', do: (c) => c.open('library', { building: { name: 'Vira Harbour Archives', role: 'library' } }) },
            { text: 'Anything lost in the fire?', if: () => !ctx.quest('p1_vira_logbook'), next: 'lost' },
            { text: 'I recovered your page.', if: () => act(ctx, 'p1_vira_logbook', 'report'), do: (c) => c.complete('p1_vira_logbook'), next: 'thx' },
            { text: 'Goodbye.', end: true },
          ],
        },
        lost: {
          text: `"One page above all: 'Mont Blanc Noland, explorer of Lvneel, departed June 21, 1120.' The man the storybooks call a liar! Looters took it from the palace vault. They hide in the burnt ruins east of town."`,
          choices: [{ text: 'I\'ll get it back.', do: (c) => c.startQuest('p1_vira_logbook'), end: true }, { text: 'Maybe later.', end: true }],
        },
        thx: { text: `"You found it! ...Keep a copy — I made one for you. Noland sailed from here to an island called Jaya. They say his family still searches the sea there. Maybe they'd like to see it."` },
      },
    }),
  },
  {
    id: 'p1_looter_boss', name: 'Ashford the Looter', title: 'Scavenger of the burnt palace', island: 'vira', at: { spot: 'old_palace' },
    look: { hair: 'mohawk', hairColor: '#e53935', skin: '#e0ac7e', top: '#4e342e', bottom: '#212121', scarEye: true, swords: 2 }, level: 20,
    hostile: true, named: true, faction: 'bandit', style: 'nitoryu', weapon: 'sword', moves: ['nito_taka'], bounty: 6000000, infamy: true, skill: 0.35, breakthrough: 1,
    alert: `"Everything in this palace is mine now — the king isn't using it!"`,
    when: (c, g) => stg(g, 'p1_vira_logbook') === 'ruins' && !c.defeated.p1_looter_boss,
  },
  {
    id: 'p1_vira_revolutionary', name: 'Revolutionary Ember', title: 'Officer of the Revolutionary Army', island: 'vira', at: { town: 'vira_town', building: 'Council of the Revolution' },
    look: { hair: 'long', hairColor: '#212121', skin: '#c68642', top: '#37474f', bottom: '#212121', coat: '#263238', hat: 'tricorne', hatColor: '#212121' }, level: 40, faction: 'revolutionary', trainer: 'revolutionary',
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => ctx.char.faction === 'marine'
        ? `"A Marine, in free Vira? ...Relax. The people chose this. We only lit the match. Walk carefully, and nobody gets hurt."`
        : `"Vira's king sold his people to the World Government for a seat at the Levely. We lit the match; the people did the rest. Freedom isn't given — it's taken back."`,
      choices: [
        { text: 'Teach me to fight like a revolutionary.', if: () => ctx.char.faction !== 'marine', do: (c) => c.open('trainer', { trainer: 'revolutionary' }) },
        { text: 'Goodbye.', end: true },
      ],
    } } }),
  },
];

const npcsB = [
  // ================================================================ Little Garden
  {
    id: 'p1_dorry', name: 'Dorry', title: '"Dorry the Blue Ogre", Captain of the Giant Warrior Pirates', island: 'little_garden', at: { spot: 'dorry_camp' },
    look: { hair: 'long', hairColor: '#3e2723', skin: '#e0ac7e', top: '#5c6bc0', bottom: '#3e2723', hat: 'horns', hatColor: '#b0bec5', swords: 1 }, scale: 3, bulk: 1.5,
    level: 62, style: 'ittoryu', weapon: 'sword', trainer: 'elbaf_warrior', fixedPower: 12000,
    marker: (c, g) => (!g.quests.state('p1_little_garden') ? '!' : ['ale', 'report'].includes(g.quests.stageId('p1_little_garden')) ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('p1_little_garden');
            if (fin(ctx, 'p1_little_garden')) return `"GEGYAGYAGYA! The duel goes on — as it should, with no filthy tricks! Come, little warrior, and I'll teach you the ways of Elbaf!"`;
            if (s === 'ale') return `"Brogy sent me ale? Before a duel? ...GEGYAGYA! That stubborn old fool. Pour it, pour it!"`;
            if (['wax', 'goldenweek', 'mr3', 'pose'].includes(s)) return `"Ugh... the ale exploded in my belly. There was a bomb in it. Brogy would never — it was that wax man in the south. Go! A warrior's duel must not be soiled!"`;
            if (s === 'report') return `"The wax man is beaten? And the tiny birds brought an Eternal Pose? GEGYAGYAGYA! Then you can leave this island without waiting a year!"`;
            return `"GEGYAGYAGYA! A tiny human! I am Dorry, warrior of Elbaf. For a hundred years Brogy and I have fought — neither can win, neither will yield. Why do we fight? We've both forgotten!"`;
          },
          choices: [
            { text: 'Why keep fighting, then?', if: () => !ctx.quest('p1_little_garden'), next: 'pride' },
            { text: 'Give him Brogy\'s ale.', if: () => act(ctx, 'p1_little_garden', 'ale') && ctx.has('p1_giant_ale'), do: (c) => c.take('p1_giant_ale', 1), next: 'boom' },
            { text: 'It\'s done. The duel is yours again.', if: () => act(ctx, 'p1_little_garden', 'report'), do: (c) => c.complete('p1_little_garden'), next: 'gift' },
            { text: 'Teach me the warrior way of Elbaf.', do: (c) => c.open('trainer', { trainer: 'elbaf_warrior' }) },
            { text: 'Goodbye, Dorry.', end: true },
          ],
        },
        pride: {
          text: `"Because we are warriors of Elbaf! When the volcano erupts, we fight. And your Log Pose? Little Garden's log takes a YEAR to set. You're stuck with us, little one! Talk to Brogy — he's the red one, to the east."`,
          choices: [{ text: 'A year?! There must be another way.', do: (c) => c.startQuest('p1_little_garden'), end: true }, { text: 'Good luck with your duel.', end: true }],
        },
        boom: { text: `(Dorry drains the barrel in one gulp — and it EXPLODES inside him. The giant staggers, blood on his beard. "A... bomb... Who...?" Among the barrel's splinters, you find drops of hard white wax.)`, onEnter: (c) => c.stage('p1_little_garden', 'wax') },
        gift: { text: `"Take Brogy's spare axe — no, take mine, it's better! And a helm of Elbaf. A warrior who carries a friend's honour deserves both. GEGYAGYAGYA!"` },
      },
    }),
  },
  {
    id: 'p1_brogy', name: 'Brogy', title: '"Brogy the Red Ogre", Captain of the Giant Warrior Pirates', island: 'little_garden', at: { spot: 'brogy_camp' },
    look: { hair: 'long', hairColor: '#e65100', skin: '#e0ac7e', top: '#c62828', bottom: '#3e2723', hat: 'horns', hatColor: '#b0bec5' }, scale: 3, bulk: 1.5,
    level: 62, style: 'elbaf', weapon: 'axe', trainer: 'elbaf_warrior', fixedPower: 12000,
    marker: (c, g) => (g.quests.stageId('p1_little_garden') === 'brogy' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('p1_little_garden');
            if (s === 'brogy') return `"GABABABA! A guest! Sit, sit — dinosaur meat! Dorry and I fight whenever the volcano erupts. This will be our seventy-three thousand, four hundred and sixty-seventh duel!"`;
            if (s === 'mr3') return `"Grrh... wax... it's hardening on my body! The cake — the wax man wants to make a statue of me! Stop him, little one!"`;
            if (fin(ctx, 'p1_little_garden')) return `"GABABABA! A warrior of the sea came to Little Garden! When you reach Elbaf one day, tell them Brogy sent you!"`;
            return `"GABABABA! A tiny guest! I am Brogy of Elbaf. The volcano will erupt soon, and then I fight Dorry again. Sit and watch!"`;
          },
          choices: [
            { text: 'Why a hundred years?', if: () => act(ctx, 'p1_little_garden', 'brogy'), next: 'why' },
            { text: 'Teach me the warrior way of Elbaf.', do: (c) => c.open('trainer', { trainer: 'elbaf_warrior' }) },
            { text: 'Goodbye, Brogy.', end: true },
          ],
        },
        why: {
          text: `"We forgot the reason long ago! But a warrior's pride does not forget. Here — take this barrel of giant's ale to Dorry. Warriors share a drink before battle. Tell him it's from me!"`,
          onEnter: (c) => { if (!c.has('p1_giant_ale')) c.give('p1_giant_ale', 1); c.stage('p1_little_garden', 'ale'); },
        },
      },
    }),
  },
  {
    id: 'p1_goldenweek', name: 'Miss Goldenweek', title: '"Flag-Bearer of Freedom", Officer Agent of Baroque Works', island: 'little_garden', at: { spot: 'wax_house' },
    look: { hair: 'short', hairColor: '#212121', skin: '#f9dcc4', top: '#fafafa', bottom: '#ef9a9a', hat: 'beanie', hatColor: '#ffe082', scale: 0.8 }, level: 20,
    hostile: true, named: true, faction: 'baroque', style: 'brawler', moves: ['p1_colors_red', 'p1_colors_blue'], bounty: 29000000, infamy: true, skill: 0.4,
    alert: `"...Colors Trap." (She raises her paintbrush.)`, barks: ['Tea time.', 'Colors Trap!'],
    when: (c, g) => stg(g, 'p1_little_garden') === 'goldenweek' && !c.defeated.p1_goldenweek,
  },
  {
    id: 'p1_mr3', name: 'Mr. 3', title: 'Officer Agent of Baroque Works — the Wax Man', island: 'little_garden', at: { spot: 'candle_service' },
    look: { hair: 'curly', hairColor: '#212121', skin: '#f1c9a0', top: '#fafafa', bottom: '#212121', coat: '#ef6c00', goggles: true }, level: 24,
    boss: true, hostile: true, faction: 'baroque', fruit: 'doru', fruitMastery: 62, moves: ['doru_arrow', 'doru_lock', 'doru_armor', 'p1_candle_service'],
    bounty: 24000000, infamy: true, breakthrough: 3, skill: 0.45,
    alert: `"Candle Service Set! You'll make a lovely wax statue — right next to the giant!"`, barks: ['Hahahaha!', 'Candle Wall!'],
    phases: [{ at: 0.5, run: (a, g) => { g.fx?.text?.(a.x, a.y - 2.4, 'CANDLE CHAMPION!', '#fff8e1', 0.6); a.addBuff({ id: 'p1_champion', name: 'Candle Champion', dur: 25, mods: { defMul: 0.6, damage: 1.2 }, aura: 'rgba(255,248,225,0.8)' }); } }],
    when: (c, g) => stg(g, 'p1_little_garden') === 'mr3',
  },
  {
    id: 'p1_mr13', name: 'Mr. 13', title: 'The Unluckies (Baroque Works executioner)', island: 'little_garden', at: { spot: 'wax_house' },
    fullLook: { race: 'mink', skin: '#8d6e63', fur: '#8d6e63', hairColor: '#8d6e63', hand: '#8d6e63', ears: 'round', muzzle: true, tail: 'thin', hair: 'bald', top: '#8d6e63', bottom: '#6d4c41', hat: 'cowboy', hatColor: '#212121', goggles: true, scale: 0.6 },
    level: 18, hostile: true, named: true, faction: 'baroque', style: 'brawler', moves: ['brawl_tackle', 'brawl_knee'], skill: 0.45,
    alert: `(The otter in sunglasses draws your face in a sketchbook. Then it attacks.)`,
    when: (c, g) => stg(g, 'p1_little_garden') === 'pose' && !c.defeated.p1_mr13,
  },
  {
    id: 'p1_miss_friday', name: 'Miss Friday', title: 'The Unluckies (Baroque Works executioner)', island: 'little_garden', at: { spot: 'wax_house' },
    fullLook: { race: 'skypiean', wings: 'sky', skin: '#5d4037', fur: '#5d4037', hairColor: '#fafafa', hand: '#5d4037', hair: 'bald', top: '#4e342e', bottom: '#3e2723', nose: 'long', scale: 0.7 },
    level: 18, hostile: true, named: true, faction: 'baroque', style: 'brawler', moves: ['brawl_tackle'], skill: 0.4,
    alert: `(A vulture in a flight cap screeches and dives at you.)`,
    when: (c, g) => stg(g, 'p1_little_garden') === 'pose' && !c.defeated.p1_miss_friday,
  },

  // ================================================================ Drum Island
  {
    id: 'p1_dalton', name: 'Dalton', title: 'Captain of the Bighorn Guard', island: 'drum_island', at: { town: 'bighorn', building: "Dalton's House" },
    look: { hair: 'short', hairColor: '#212121', skin: '#e0ac7e', top: '#5d4037', bottom: '#3e2723', coat: '#6d4c41', hat: 'horns', hatColor: '#795548', bulk: 1.3 }, level: 32,
    style: 'ittoryu', weapon: 'sword', moves: ['itto_pound'],
    marker: giver('p1_drum_kingdom', '__none'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (fin(ctx, 'p1_drum_kingdom')) return `"They want to make me king. Me! ...Hiriluk's flag flies over the castle now, and the snow fell pink. This country will be called the Sakura Kingdom."`;
            if (ctx.quest('p1_drum_kingdom')) return `"The castle is at the top of Drum Rock. The ropeway is cut — you'll have to climb. Watch out for the Lapahn; those snow rabbits eat people."`;
            return ctx.char.bounty > 0 ? `"Pirates. Turn back — this country has suffered enough... Wait. You haven't drawn a weapon. Then hear me out."` : `"A traveller? In winter? Welcome to Drum Island. Keep your coat on and your voice down — avalanches."`;
          },
          choices: [
            { text: 'What happened to this country?', if: () => !ctx.quest('p1_drum_kingdom'), next: 'story' },
            { text: 'Goodbye.', end: true },
          ],
        },
        story: { text: `"Our king, Wapol, fled when a pirate named Blackbeard attacked. Before that he banished every doctor but his own twenty. Now the only doctor left is a witch — Dr. Kureha, living in the empty castle on Drum Rock."`, next: 'story2' },
        story2: {
          text: `"A girl here in Bighorn has had a fever for a week. Kureha comes down when she pleases, on her sled, and she hasn't pleased. Someone would have to climb up and fetch her."`,
          choices: [{ text: 'I\'ll climb Drum Rock.', do: (c) => c.startQuest('p1_drum_kingdom'), end: true }, { text: 'Not today.', end: true }],
        },
      },
    }),
  },
  {
    id: 'p1_kureha', name: 'Dr. Kureha', title: '"Doctorine", the Witch of Drum', island: 'drum_island', at: { town: 'drum_castle', building: "Dr. Kureha's Clinic" },
    look: { hair: 'long', hairColor: '#eceff1', skin: '#f1c9a0', top: '#7b1fa2', bottom: '#212121', goggles: true }, level: 45,
    doctor: { line: `"Hee-hee! Want to know the secret of my youth? ...Sit down. I'm a doctor, and you're bleeding on my floor."` },
    marker: (c, g) => (g.quests.stageId('p1_drum_kingdom') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('p1_drum_kingdom');
            if (s === 'report') return `"Hee-hee! You threw that tin-plated fool off my mountain. Now watch the sky, brat. Watch it closely."`;
            if (fin(ctx, 'p1_drum_kingdom')) return `"Pink snow... that quack Hiriluk's dream. Don't get sentimental on me. Doctors fix bodies, not countries. ...Though sometimes it's the same thing."`;
            if (s && s !== 'climb') return `"Wapol's back, with his Bliking Pirates, and he wants his castle. Well? You climbed my mountain. Don't just stand there!"`;
            return `"Hee-hee! You climbed Drum Rock in this snow? Either you're sick or you're stupid. I'm a doctor, and I only treat one of those. What is it?"`;
          },
          choices: [
            { text: 'Treat my wounds.', do: (c) => c.open('doctor', {}) },
            { text: 'A girl in Bighorn has a fever.', if: () => ctx.quest('p1_drum_kingdom') && !ctx.flag('p1_kurehaMedicine'), next: 'med' },
            { text: 'Watch the sky.', if: () => act(ctx, 'p1_drum_kingdom', 'report'), next: 'sakura' },
            { text: 'Goodbye.', end: true },
          ],
        },
        med: { text: `"Hmph. Dalton sent you? (She throws you a bottle.) Three spoons a day. And tell that bull-headed guard captain he owes me. ...Now what is that noise at my gate?"`, onEnter: (c) => { c.setFlag('p1_kurehaMedicine'); c.give('antidote', 1); } },
        sakura: { text: `(Kureha fires the castle cannons — not shells, but Dr. Hiriluk's pink powder. The snow drifting over Drum turns the colour of cherry blossoms. Below, the whole country looks up.) "...There. Happy, you old quack?"`, onEnter: (c) => { c.complete('p1_drum_kingdom'); c.emit('p1Sakura'); } },
      },
    }),
  },
  {
    id: 'p1_wapol', name: 'Wapol', title: '"Tin-Plate" Wapol, deposed King of Drum', island: 'drum_island', at: { spot: 'castle_gate' },
    look: { hair: 'short', hairColor: '#795548', skin: '#f1c9a0', top: '#e53935', bottom: '#212121', hat: 'crown', hatColor: '#ffd54f', coat: '#8e24aa', bulk: 1.6, grin: true, sharpTeeth: true }, bulk: 1.6, level: 27,
    boss: true, hostile: true, hpMul: 1.1, faction: 'pirate', style: 'brawler', moves: ['p1_baku_munch', 'p1_bero_cannon', 'brawl_tackle'], breakthrough: 4, skill: 0.35,
    alert: `"Mahahaha! I'm back to reclaim MY kingdom! Kneel before your king!"`, barks: ['Mahahaha!', 'Baku Baku!', 'I\'ll eat you whole!'],
    phases: [{ at: 0.5, run: (a, g) => { g.fx?.text?.(a.x, a.y - 2.4, 'WAPOL HOUSE!', '#ffab40', 0.6); a.addBuff({ id: 'p1_wapol_house_buff', name: 'Wapol House', dur: 30, mods: { defMul: 0.6, damage: 1.25, scale: 1.3 } }); } }],
    when: (c, g) => stg(g, 'p1_drum_kingdom') === 'wapol',
  },
  {
    id: 'p1_chess', name: 'Chess', title: 'Chief of Staff, Bliking Pirates', island: 'drum_island', at: { spot: 'castle_gate' },
    look: { hair: 'short', hairColor: '#fafafa', skin: '#f1c9a0', top: '#fafafa', bottom: '#212121', hat: 'captain', hatColor: '#212121' }, level: 22,
    hostile: true, named: true, faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, prefRange: 7, moves: ['p1_chess_arrows'], skill: 0.35,
    alert: `"For King Wapol! Loose the arrows!"`,
    when: (c, g) => stg(g, 'p1_drum_kingdom') === 'bliking' && !c.defeated.p1_chess,
  },
  {
    id: 'p1_kuromarimo', name: 'Kuromarimo', title: 'Magistrate, Bliking Pirates', island: 'drum_island', at: { spot: 'castle_gate' },
    look: { hair: 'afro', hairColor: '#212121', skin: '#f1c9a0', top: '#fafafa', bottom: '#263238' }, level: 22,
    hostile: true, named: true, faction: 'pirate', style: 'brawler', moves: ['p1_marimo_afro', 'brawl_tackle'], skill: 0.3,
    alert: `"My afro marimo will stick to you forever!"`,
    when: (c, g) => stg(g, 'p1_drum_kingdom') === 'bliking' && !c.defeated.p1_kuromarimo,
  },
  {
    id: 'p1_chessmarimo', name: 'Chessmarimo', title: 'Chess + Kuromarimo, fused by Baku Baku Factory', island: 'drum_island', at: { spot: 'castle_gate' },
    look: { hair: 'afro', hairColor: '#212121', skin: '#f1c9a0', top: '#fafafa', bottom: '#263238', hat: 'captain', hatColor: '#212121', bulk: 1.6 }, bulk: 1.6, scale: 1.5, level: 25,
    boss: true, hostile: true, hpMul: 0.9, faction: 'pirate', style: 'brawler', moves: ['p1_chess_arrows', 'p1_marimo_afro', 'brawl_headbutt'], breakthrough: 2, skill: 0.3,
    alert: `"CHESSMARIMO! Two minds, one magnificent body!"`,
    when: (c, g) => stg(g, 'p1_drum_kingdom') === 'chessmarimo',
  },
  {
    id: 'p1_dr_lapin', name: 'Dr. Lapin', title: 'Former Isshi-20 physician', island: 'drum_island', at: { town: 'gyasta', building: "Dr. Lapin's Surgery" },
    look: { hair: 'curly', hairColor: '#8d6e63', skin: '#f9dcc4', top: '#fafafa', bottom: '#5c6bc0', hat: 'beanie', hatColor: '#f48fb1', goggles: true }, level: 16,
    doctor: { line: `"Let me see... hold still. Dr. Kureha taught me that a doctor who hesitates is a doctor who loses patients."` },
    when: (c) => !inCrew(c, 'p1_dr_lapin') && !c.flags['leftCrew_p1_dr_lapin'],
    recruit: { role: 'doctor', requires: (c, g) => isDone(g, 'p1_drum_kingdom'), pitch: `"Dr. Hiriluk used to say there's no disease a doctor can't cure. I want to test that — on the Grand Line, with you. Count me in, captain!"` },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => fin(ctx, 'p1_drum_kingdom')
        ? `"The snow turned pink... I was one of Wapol's twenty doctors, you know. The Isshi-20. I let people die because the king said so. I want to be a real doctor now. A pirate's doctor, maybe."`
        : `"Shh — patients. I was one of Wapol's twenty doctors, the Isshi-20. When he fled, I stayed. Somebody had to."`,
      choices: [{ text: 'Treat my wounds.', do: (c) => c.open('doctor', {}) }, { text: 'Goodbye.', end: true }],
    } } }),
  },

  // ================================================================ Alabasta
  {
    id: 'p1_vivi', name: 'Nefertari Vivi', title: 'Princess of Alabasta', island: 'alabasta', at: { town: 'nanohana', plaza: true, ox: -3 },
    look: { hair: 'ponytail', hairColor: '#4fc3f7', skin: '#f9dcc4', top: '#fafafa', bottom: '#5c6bc0', hat: 'bandana', hatColor: '#fafafa' }, level: 20,
    marker: giver('p1_alabasta', '__none'),
    when: (c, g) => !g.quests.state('p1_alabasta') || stg(g, 'p1_alabasta') === 'yuba',
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => ctx.quest('p1_alabasta')
            ? `"Yuba is west, across the Sandora River and the desert. Take water. A lot of water."`
            : (ctx.game.quests.isDone('p1_whisky_peak') ? `"You came! Thank you... Alabasta is dying. It hasn't rained in three years except in the capital, and the rebels blame my father. It's all Crocodile's doing."` : `"A traveller... Please, be careful in Alabasta. It hasn't rained in three years, and there is a civil war coming. I am Vivi — the princess."`),
          choices: [
            { text: 'How can I help?', if: () => !ctx.quest('p1_alabasta'), next: 'plan' },
            { text: 'See you in Yuba.', end: true },
          ],
        },
        plan: {
          text: `"Crocodile uses Dance Powder to steal the rain. The rebels gather at Yuba, in the western desert — their leader, Kohza, is my childhood friend. If I can reach him, maybe I can stop the war."`,
          choices: [{ text: 'Then let\'s go to Yuba.', do: (c) => c.startQuest('p1_alabasta'), end: true }, { text: 'Later.', end: true }],
        },
      },
    }),
  },
  {
    id: 'p1_vivi_palace', name: 'Nefertari Vivi', title: 'Princess of Alabasta', island: 'alabasta', at: { town: 'alubarna', plaza: true, ox: -3 },
    look: { hair: 'long', hairColor: '#4fc3f7', skin: '#f9dcc4', top: '#fafafa', bottom: '#5c6bc0' }, level: 22,
    when: (c, g) => isDone(g, 'p1_alabasta'),
    dialogue: () => ({ start: 'a', nodes: { a: { text: `"It's raining! Can you hear it? ...I can't go with you. I love this country too much. But if we ever meet again — will you still call me your friend?"` } } }),
  },
  {
    id: 'p1_cobra', name: 'Nefertari Cobra', title: 'King of Alabasta', island: 'alabasta', at: { town: 'alubarna', building: 'Alubarna Palace' },
    look: { hair: 'long', hairColor: '#212121', skin: '#c68642', top: '#fafafa', bottom: '#fafafa', hat: 'crown', hatColor: '#ffd54f', coat: '#8d6e63' }, level: 30,
    marker: (c, g) => (g.quests.stageId('p1_alabasta') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (act(ctx, 'p1_alabasta', 'report')) return `"Rain... on Alubarna, on Yuba, on the whole country. You fought for a kingdom that was not yours. Alabasta will never forget."`;
            if (fin(ctx, 'p1_alabasta')) return `"A king who cannot protect his people is no king. You reminded me what one is. Our palace is always open to you."`;
            return `"A visitor, in these times? Forgive the guards. My people believe I stole their rain. I did not — but a king who cannot prove it may as well have."`;
          },
          choices: [
            { text: 'The Desert King is beaten.', if: () => act(ctx, 'p1_alabasta', 'report'), do: (c) => c.complete('p1_alabasta'), next: 'thanks' },
            { text: 'What is in the Tomb of the Kings?', next: 'tomb' },
            { text: 'Goodbye, Your Majesty.', end: true },
          ],
        },
        tomb: { text: `"A stone that no one can read. Our ancestors swore to guard it. Crocodile wanted it — he believed it would lead him to an ancient weapon. The stone did not say what he hoped."`, next: 'a' },
        thanks: { text: `"Take this cape of the Royal Guard. Whoever wears it is a friend of Alabasta, in any port of the world."` },
      },
    }),
  },
  {
    id: 'p1_pell', name: 'Pell', title: '"Pell the Falcon", Guardian Deity of Alabasta', island: 'alabasta', at: { town: 'alubarna', plaza: true, ox: 3 },
    look: { hair: 'short', hairColor: '#212121', skin: '#c68642', top: '#fafafa', bottom: '#8d6e63', hat: 'bandana', hatColor: '#fafafa' }, level: 34,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => act(ctx, 'p1_alabasta', 'bomb')
        ? `"The bomb in the Clock Tower! If it falls on the square, everything within five kilometres dies. Get to the tower — I'll carry it into the sky myself if I must!"`
        : fin(ctx, 'p1_alabasta') ? `"I flew the bomb out over the desert. My body is still recovering... but the sky is ours again."` : `"I am Pell, one of the two Guardian Deities of Alabasta. The Tori Tori fruit gave me the falcon's wings. They are the kingdom's wings now."`,
    } } }),
  },
  {
    id: 'p1_chaka', name: 'Chaka', title: '"Chaka the Jackal", Guardian Deity of Alabasta', island: 'alabasta', at: { town: 'alubarna', plaza: true, ox: 6 },
    look: { hair: 'short', hairColor: '#212121', skin: '#a0643a', top: '#fafafa', bottom: '#5d4037', hat: 'bandana', hatColor: '#fafafa', bulk: 1.2 }, level: 32,
    dialogue: () => ({ start: 'a', nodes: { a: { text: `"The Royal Guard holds the palace. If the rebels come through the south gate, we will not raise our swords first. Those are our people."` } } }),
  },
  {
    id: 'p1_igaram_ala', name: 'Igaram', title: 'Captain of the Royal Guard', island: 'alabasta', at: { town: 'alubarna', building: 'Palace Guest House' },
    look: { hair: 'curly', hairColor: '#d7ccc8', skin: '#f1c9a0', top: '#fafafa', bottom: '#212121', coat: '#fafafa', bulk: 1.15 }, level: 28,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => fin(ctx, 'p1_whisky_peak') ? `"Ma-ma-maaa~! You thought my ship went up in flames? Some of it did. A royal guard is hard to kill. Thank you for looking after the princess."` : `"Ma-ma-maaa~! I am Igaram, Captain of the Royal Guard. These are dark days for Alabasta, traveller."`,
      choices: [{ text: 'Rest at the guest house.', do: (c) => c.open('inn', { building: { name: 'Palace Guest House', role: 'inn' } }) }, { text: 'Goodbye.', end: true }],
    } } }),
  },
  {
    id: 'p1_kohza', name: 'Kohza', title: 'Leader of the Rebel Army', island: 'alabasta', at: { town: 'katorea', building: 'Rebel Army Headquarters' },
    look: { hair: 'short', hairColor: '#e0e0e0', skin: '#c68642', top: '#fafafa', bottom: '#5d4037', hat: 'goggles', scarEye: true }, level: 26,
    marker: (c, g) => (g.quests.stageId('p1_alabasta') === 'kohza' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (act(ctx, 'p1_alabasta', 'kohza')) return `"Crocodile? The hero who drives off pirates? ...The king stole our rain. We found Dance Powder in Alubarna's port with our own eyes."`;
            if (fin(ctx, 'p1_alabasta')) return `"We almost destroyed our own country for a lie. Now we rebuild Yuba — my father's town. Every well, every tree."`;
            return `"Rebels, they call us. We're just people who want water. Stay out of Katorea if you're one of the king's."`;
          },
          choices: [
            { text: 'The Dance Powder was Crocodile\'s. It\'s his plot.', if: () => act(ctx, 'p1_alabasta', 'kohza'), next: 'b' },
            { text: 'Goodbye.', end: true },
          ],
        },
        b: { text: `"...Vivi is alive? And she says it was Crocodile? (He clenches his fists.) Even if it's true, three hundred thousand men are already marching on Alubarna. I can't stop them alone — but I'll be at the front, and I'll listen. Go!"`, onEnter: (c) => c.stage('p1_alabasta', 'officers') },
      },
    }),
  },
  {
    id: 'p1_toto', name: 'Toto', title: 'Last resident of Yuba', island: 'alabasta', at: { town: 'yuba', building: "Toto's Well" },
    look: { hair: 'bald', skin: '#a0643a', top: '#d7ccc8', bottom: '#8d6e63', scale: 0.9 }, level: 3,
    marker: (c, g) => (!g.quests.state('p1_toto_well') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (fin(ctx, 'p1_toto_well')) return `"Water! Real water! Take the barrel — it's the first water Yuba has given in three years. Somehow I think you'll need it more than I will."`;
            if (act(ctx, 'p1_alabasta', 'yuba')) return `"The rebels? They left for Katorea days ago. Yuba is dead... every night the sandstorms come. But the ground here is still damp. I dig."`;
            return `"Yuba was built on an oasis. Every night the sandstorms bury it again. I dig all day. One day the water will come back — I know it will."`;
          },
          choices: [
            { text: 'Let me help you dig.', if: () => !fin(ctx, 'p1_toto_well'), next: 'dig' },
            { text: 'Could I have more of that water?', if: () => fin(ctx, 'p1_toto_well') && !ctx.has('p1_yuba_water'), do: (c) => c.give('p1_yuba_water', 2), next: 'a' },
            { text: 'Goodbye, Toto.', end: true },
          ],
        },
        dig: {
          text: () => `(You grab a shovel. The sand is hot and heavy; for every scoop, the wind throws half of it back. Toto hums as he digs. Progress: ${Math.min(3, (ctx.char.flags.p1_totoDig || 0))}/3 hours.)`,
          choices: [
            { text: 'Dig for an hour.', do: (c) => {
              if (!c.quest('p1_toto_well')) c.startQuest('p1_toto_well');
              c.game.env.clock += 1;
              c.char.flags.p1_totoDig = (c.char.flags.p1_totoDig || 0) + 1;
              if (c.char.flags.p1_totoDig >= 3) c.emit('questEvent', 'p1_toto_dug');
              return c.char.flags.p1_totoDig >= 3 ? 'water' : 'dig';
            } },
            { text: 'Stop for now.', end: true },
          ],
        },
        water: { text: `(Your shovel hits wet sand. Then mud. Then — water, bubbling up cold and clear.) "Water... WATER! Yuba lives! Here, take this barrel. Crocodile's sand hates water, doesn't it?"` },
      },
    }),
  },
  {
    id: 'p1_paula', name: 'Paula', title: 'Owner of the Spiders Café', island: 'alabasta', at: { spot: 'spiders_cafe' },
    look: { hair: 'long', hairColor: '#212121', skin: '#e0ac7e', top: '#f5f5f5', bottom: '#212121', hat: 'cowboy', hatColor: '#212121' }, level: 30, fixedPower: 60,
    when: (c, g) => !isDone(g, 'p1_alabasta'),
    dialogue: () => ({ start: 'a', nodes: { a: {
      text: `"Welcome to the Spiders Café, traveller. Coffee? Water? The desert is no place to be thirsty... Don't mind the guests who come in at night. They like their privacy."`,
      choices: [{ text: 'Coffee and a meal.', do: (c) => c.open('shop', { shop: 'tavern', building: { name: 'Spiders Café', role: 'bar' } }) }, { text: 'Leave', end: true }],
    } } }),
  },
  {
    id: 'p1_bon_clay', name: 'Bon Clay', title: 'Mr. 2 of Baroque Works — "Bentham of the Wild"', island: 'alabasta', at: { town: 'nanohana', building: 'Okama Way Dojo' },
    look: { hair: 'short', hairColor: '#212121', skin: '#f1c9a0', top: '#fafafa', bottom: '#f48fb1', coat: '#f48fb1', hat: 'pinkhat', hatColor: '#f48fb1' }, level: 30, trainer: 'bon_clay',
    style: 'okama_kenpo', fruit: 'mane', fruitMastery: 60, moves: ['okama_pirouette', 'okama_swan_dash', 'mane_memoir'],
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => beat(ctx.char, 'p1_mr2')
        ? `"You kicked me like a true friend! Friendship doesn't care which side you're on, you know! Un, deux, trois — let me teach you the Okama Way!"`
        : `"Un, deux, trois! I am Mr. 2 Bon Clay — but between friends, just call me Bon-chan! The way of the okama is the way of FRIENDSHIP!"`,
      choices: [{ text: 'Train in Okama Kenpo.', do: (c) => c.open('trainer', { trainer: 'bon_clay' }) }, { text: 'Show me your Mimicry!', next: 'mane' }, { text: 'Au revoir, Bon-chan.', end: true }],
    },
    mane: { text: `(He touches his face with his right hand — and suddenly he is YOU. He waves your hand at you and winks.) "Mane Mane no Mi! Any face I've touched, I can copy. Don't worry, I only use it on friends' enemies!"` } } }),
  },
  {
    id: 'p1_ace_nanohana', name: 'Portgas D. Ace', title: '"Fire Fist" Ace, 2nd Division Commander, Whitebeard Pirates', island: 'alabasta', at: { town: 'nanohana', building: 'Nanohana Diner' },
    look: { hair: 'spiky', hairColor: '#212121', skin: '#e0ac7e', top: '#e0ac7e', bottom: '#212121', hat: 'cowboy', hatColor: '#ef6c00' }, level: 80, fixedPower: 20000, ai: 'idle',
    when: (c, g) => !isDone(g, 'p1_alabasta'),
    dialogue: () => ({ start: 'a', nodes: {
      a: {
        text: `(The man face-down in his fried rice suddenly sits up.) "Oh — sorry, I fell asleep. ...I'm hunting a man named Blackbeard. Big guy, missing teeth, laughs 'Zehahaha'. Seen him?"`,
        choices: [{ text: 'Buy a meal here.', do: (c) => c.open('shop', { shop: 'tavern', building: { name: 'Nanohana Diner', role: 'restaurant' } }) }, { text: 'Who is Blackbeard?', next: 'bb' }, { text: 'Leave', end: true }],
      },
      bb: { text: `"A man from my crew. He killed a comrade and ran. The captain of the Whitebeard Pirates' second division doesn't let that go. (He tips his hat and walks out without paying.)"` },
    } }),
  },
  {
    id: 'p1_smoker_ala', name: 'Captain Smoker', title: '"The White Hunter"', island: 'alabasta', at: { town: 'nanohana', plaza: true, ox: 5 },
    look: { hair: 'short', hairColor: '#eceff1', skin: '#e0ac7e', top: '#37474f', bottom: '#263238', coat: '#fafafa', coatText: 'JUSTICE' }, level: 70, faction: 'marine', fixedPower: 15000, ai: 'idle',
    when: (c, g) => !isDone(g, 'p1_alabasta'),
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => pirate(ctx.char)
        ? `"...Pirate. I'd arrest you right here, but there's something rotten in this country and it smells like a Warlord. Stay out of my way — for now."`
        : `"A Warlord of the Sea running a crime syndicate under the World Government's nose. Nobody at HQ will listen. So I'll find the proof myself."`,
    } } }),
  },
  {
    id: 'p1_doublefinger', name: 'Miss Doublefinger', title: '"Poison Spider" Zala, Officer Agent of Baroque Works', island: 'alabasta', at: { town: 'alubarna', plaza: true, ox: -6 },
    look: { hair: 'long', hairColor: '#212121', skin: '#e0ac7e', top: '#f5f5f5', bottom: '#212121' }, level: 30,
    hostile: true, named: true, faction: 'baroque', style: 'brawler', moves: ['p1_toge_spike', 'p1_toge_urchin'], bounty: 35000000, infamy: true, skill: 0.5, breakthrough: 1,
    alert: `"The Spiders Café is closed today, darling. Permanently, for you."`,
    when: (c, g) => stg(g, 'p1_alabasta') === 'officers' && !c.defeated.p1_doublefinger,
  },
  {
    id: 'p1_mr1', name: 'Mr. 1', title: '"The Killer" Daz Bonez, Officer Agent of Baroque Works', island: 'alabasta', at: { town: 'alubarna', plaza: true, ox: -9 },
    look: { hair: 'bald', skin: '#e0ac7e', top: '#e0ac7e', bottom: '#212121', goggles: true, bulk: 1.25 }, bulk: 1.25, level: 33,
    boss: true, hostile: true, hpMul: 0.9, faction: 'baroque', fruit: 'supa', fruitMastery: 60, moves: ['supa_sparkling', 'supa_spider', 'p1_atomic_spurt'],
    bounty: 75000000, infamy: true, breakthrough: 3, skill: 0.55,
    alert: `"My whole body is a blade. Nothing you swing can cut me."`, barks: ['Sparkling Daisy.', 'Atomic Spurt.'],
    when: (c, g) => stg(g, 'p1_alabasta') === 'officers',
  },
  {
    id: 'p1_mr2', name: 'Mr. 2 Bon Clay', title: 'Officer Agent of Baroque Works', island: 'alabasta', at: { town: 'alubarna', plaza: true, ox: 9 },
    look: { hair: 'short', hairColor: '#212121', skin: '#f1c9a0', top: '#fafafa', bottom: '#f48fb1', coat: '#f48fb1', hat: 'pinkhat', hatColor: '#f48fb1' }, level: 30,
    hostile: true, named: true, faction: 'baroque', style: 'okama_kenpo', fruit: 'mane', fruitMastery: 60, moves: ['okama_pirouette', 'okama_swan_dash', 'mane_memoir'],
    bounty: 32000000, infamy: true, skill: 0.5, breakthrough: 1,
    alert: `"Orders are orders, even between friends! Un, deux, trois — Swan Arabesque!"`,
    when: (c, g) => stg(g, 'p1_alabasta') === 'officers' && !c.defeated.p1_mr2,
  },
  {
    id: 'p1_mr4', name: 'Mr. 4', title: '"Catcher-Killing" Babe, Officer Agent of Baroque Works', island: 'alabasta', at: { town: 'alubarna', plaza: true, ox: 12 },
    look: { hair: 'short', hairColor: '#795548', skin: '#e0ac7e', top: '#fafafa', bottom: '#1565c0', hat: 'captain', hatColor: '#1565c0', bulk: 1.5 }, bulk: 1.5, level: 28,
    hostile: true, named: true, faction: 'baroque', style: 'brawler', moves: ['p1_mr4_bat', 'p1_lassoo_bomb'], bounty: 3200000, infamy: true, skill: 0.25, hpMul: 1.3,
    alert: `"...Mr. 4... hits... home runs..."`,
    when: (c, g) => stg(g, 'p1_alabasta') === 'officers' && !c.defeated.p1_mr4,
  },
  {
    id: 'p1_merry_christmas', name: 'Miss Merry Christmas', title: '"Town-Collapser" Drophy, Officer Agent of Baroque Works', island: 'alabasta', at: { town: 'alubarna', plaza: true, ox: 14 },
    look: { hair: 'curly', hairColor: '#212121', skin: '#e0ac7e', top: '#f9a825', bottom: '#212121', hat: 'goggles', scale: 0.85 }, level: 27,
    hostile: true, named: true, faction: 'baroque', style: 'brawler', moves: ['p1_mogu_rush', 'brawl_headbutt'], bounty: 14000000, infamy: true, skill: 0.35,
    alert: `"Hurry up, Mr. 4! Mogura Banana — you won't even see me coming!"`,
    when: (c, g) => stg(g, 'p1_alabasta') === 'officers' && !c.defeated.p1_merry_christmas,
  },
  {
    id: 'p1_crocodile', name: 'Sir Crocodile', title: '"Desert King", Warlord of the Sea — Mr. 0 of Baroque Works', island: 'alabasta', at: { spot: 'tomb_of_kings' },
    look: { hair: 'short', hairColor: '#212121', skin: '#e0ac7e', top: '#ff7043', bottom: '#212121', coat: '#4e342e', hand: '#ffd54f', scarEye: true, bulk: 1.2 }, bulk: 1.2, level: 38,
    boss: true, hostile: true, hpMul: 1.25, faction: 'pirate', fruit: 'suna', fruitMastery: 75, moves: ['suna_barjan', 'suna_sables', 'suna_spada', 'suna_dry', 'p1_croc_hook', 'p1_desert_girasole'],
    bounty: 81000000, infamy: true, breakthrough: 6, skill: 0.65,
    alert: `"Kuhahaha! You came all the way to the tomb to die? This country belongs to me — and so does the weapon sleeping under it."`, barks: ['Kuhahaha!', 'Desert Spada!', 'Dry up and blow away.'],
    phases: [{ at: 0.45, run: (a, g) => { g.fx?.text?.(a.x, a.y - 2.4, 'GROUND DEATH!', '#e1c16e', 0.6); a.addBuff({ id: 'p1_desert_king', name: 'Desert King', dur: 40, mods: { damage: 1.3, atkSpeed: 1.15 } }); } }],
    when: (c, g) => stg(g, 'p1_alabasta') === 'crocodile',
  },
  {
    id: 'p1_robin_tomb', name: 'Miss All Sunday', title: 'Nico Robin', island: 'alabasta', at: { spot: 'tomb_of_kings' },
    look: { hair: 'long', hairColor: '#212121', skin: '#c68642', top: '#6a1b9a', bottom: '#4a148c', hat: 'cowboy', hatColor: '#6a1b9a' }, level: 60, fixedPower: 8000, ai: 'idle',
    when: (c, g) => c.bosses.includes('p1_crocodile') && !c.flags.p1_robinTomb,
    dialogue: () => ({ start: 'a', nodes: { a: {
      text: `"(She is kneeling before the black stone, reading it like a letter.) ...It does not say what I hoped. Only history — the history the world is forbidden to know. You won. I have nowhere to go now."`,
      onEnter: (c) => c.setFlag('p1_robinTomb'),
    } } }),
  },
];

const PRIESTS = ['p1_satori', 'p1_shura', 'p1_gedatsu', 'p1_ohm'];

const npcsC = [
  // ================================================================ Jaya
  {
    id: 'p1_cricket', name: 'Montblanc Cricket', title: 'Boss of the Saruyama Alliance', island: 'jaya', at: { spot: 'cricket_house' },
    look: { hair: 'spiky', hairColor: '#ffd54f', skin: '#e0ac7e', top: '#e0ac7e', bottom: '#3e2723', bulk: 1.3 }, bulk: 1.3, level: 34, trainer: 'p1_cricket_diver',
    marker: (c, g) => (!g.quests.state('p1_golden_city') ? '!' : g.quests.stageId('p1_noland_honor') === 'tell' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (act(ctx, 'p1_noland_honor', 'tell')) return `"...You've got a strange look on your face. Don't tell me. You saw it. You were up there..."`;
            if (fin(ctx, 'p1_noland_honor')) return `"Every morning I dive anyway. Old habits. Noland was no liar — and now the whole of Mock Town knows it. Hahaha!"`;
            const s = ctx.game.quests.stageId('p1_golden_city');
            if (s === 'bird') return `"You need a South Bird. Its head always points south, even in the sky. They live in the woods on the southern arm — careful, they sic their giant bugs on hunters."`;
            if (s === 'ship') return `"Got the bird? Then go see Masira by the boat. He and his boys will turn your ship into a bird — a ship that can't fly gets eaten by the stream."`;
            if (s === 'stream') return `"South. Follow the bird. When the sea starts to churn, don't you dare turn back. If you die, at least you'll die chasing something!"`;
            if (fin(ctx, 'p1_golden_city')) return `"You came back down alive? Hah! Did you see it? The city of gold? ...Don't tell me yet. I'm not ready."`;
            return `"Hah? Come to steal my gold? ...No? Then sit. You've got a dreamer's face. Everyone in Mock Town laughs at the words 'City of Gold'. My ancestor, Mont Blanc Noland, saw it with his own eyes."`;
          },
          choices: [
            { text: 'Tell me about Noland.', if: () => !ctx.quest('p1_golden_city'), next: 'n1' },
            { text: 'I found this in the archives of Vira.', if: () => ctx.has('p1_noland_page') && !ctx.flag('p1_pageShown'), next: 'page' },
            { text: 'I rang the Golden Bell of Shandora.', if: () => act(ctx, 'p1_noland_honor', 'tell'), next: 'bell' },
            { text: 'Teach me to dive.', do: (c) => c.open('trainer', { trainer: 'p1_cricket_diver' }) },
            { text: 'Goodbye.', end: true },
          ],
        },
        n1: { text: `"Four hundred years ago the explorer Noland found a city of gold here on Jaya. He came back with the King of Lvneel to show him — and found only jungle and sea. The king had him executed as a liar."`, next: 'n2' },
        n2: {
          text: `"But there are ruins on the seabed. South Birds point at nothing. Ships fall out of the sky. Half of Jaya is UP there, I'd bet my life on it. The Knock Up Stream can throw a ship to the clouds... or kill it."`,
          choices: [{ text: 'Then I\'ll ride it to the sky.', do: (c) => c.startQuest('p1_golden_city'), end: true }, { text: 'You\'re crazy, old man.', end: true }],
        },
        page: { text: `"(His hands shake.) 'Mont Blanc Noland, explorer of Lvneel, departed June 21, 1120.' ...He really sailed. Every word in his logbook was true. Here — gold from the sea floor. You've earned it."`, onEnter: (c) => { c.setFlag('p1_pageShown'); c.give('gold_coins', 3); c.progression.raiseAttr('wil', 1); } },
        bell: { text: `"A bell. From the sky. I HEARD it this morning — I thought I was dreaming. Noland wasn't a liar... he wasn't lying! (The big man sits down in the sand and laughs until he cries.)"`, onEnter: (c) => c.complete('p1_noland_honor') },
      },
    }),
  },
  {
    id: 'p1_masira', name: 'Masira', title: '"Salvage King" Masira, Saruyama Alliance', island: 'jaya', at: { spot: 'saruyama_camp' },
    look: { hair: 'short', hairColor: '#5d4037', skin: '#8d6e63', top: '#fdd835', bottom: '#3e2723', ears: 'round', fur: '#6d4c41', bulk: 1.6 }, bulk: 1.6, scale: 1.4, level: 26,
    marker: (c, g) => (g.quests.stageId('p1_golden_city') === 'ship' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => act(ctx, 'p1_golden_city', 'ship')
            ? `"Wooo-hoo! Is that a South Bird?! You're really going up?! Then leave your ship to the Saruyama Alliance!"`
            : `"Wooo-hoo! I'm the Salvage King, Masira! Anything that sinks near Jaya is MINE! Need your ship patched? We fix anything!"`,
          choices: [
            { text: 'Make my ship fly.', if: () => act(ctx, 'p1_golden_city', 'ship') && ctx.has('south_bird'), next: 'wings' },
            { text: 'Repair my ship.', do: (c) => c.open('shipwright', {}) },
            { text: 'Goodbye.', end: true },
          ],
        },
        wings: { text: `"(The whole crew works through the night: wings, a chicken head on the bow, ropes everywhere.) Wooo-hoo! Now she's a bird! Sail south where the bird points — the stream erupts at noon, straight into the Imperial Cumulus!"`, onEnter: (c) => { c.setFlag('knockUpKnown'); c.stage('p1_golden_city', 'stream'); } },
      },
    }),
  },
  {
    id: 'p1_shoujou', name: 'Shoujou', title: '"Sonar King" Shoujou, Saruyama Alliance', island: 'jaya', at: { spot: 'saruyama_camp' },
    look: { hair: 'afro', hairColor: '#6d4c41', skin: '#8d6e63', top: '#1565c0', bottom: '#3e2723', ears: 'round', fur: '#6d4c41', bulk: 1.6 }, bulk: 1.6, scale: 1.4, level: 27,
    dialogue: () => ({ start: 'a', nodes: {
      a: { text: `"UHOHOHO! Sonar King Shoujou! My voice goes down to the sea floor and comes back with secrets!"`, choices: [{ text: 'When does the Knock Up Stream erupt?', next: 'b' }, { text: 'Goodbye.', end: true }] },
      b: { text: `"The Imperial Cumulus drifts over the stream at noon. First a whirlpool big enough to swallow a Sea King, then the sea goes quiet... then BOOM! Straight up ten thousand metres! Uhohoho!"` },
    } }),
  },
  {
    id: 'p1_bellamy', name: 'Bellamy', title: '"Bellamy the Hyena", Captain of the Bellamy Pirates', island: 'jaya', at: { town: 'mock_town', plaza: true, ox: 3 },
    look: { hair: 'short', hairColor: '#fdd835', skin: '#e0ac7e', top: '#fafafa', bottom: '#1565c0', coat: '#fdd835', grin: true, bulk: 1.2 }, bulk: 1.2, level: 30,
    boss: true, hpMul: 1.0, faction: 'pirate', style: 'brawler', moves: ['p1_spring_hopper', 'p1_spring_snipe', 'brawl_knee'], bounty: 55000000, infamy: true, breakthrough: 3, skill: 0.5,
    alert: `"Hahaha! A dreamer! The age of dreams is OVER, idiot!"`, barks: ['Spring Hopper!', 'Hahahaha!'],
    marker: (c, g) => (!g.quests.state('p1_mock_town') ? '!' : null),
    when: (c) => !c.bosses.includes('p1_bellamy'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: `"Hahaha! Look at this one! You want to go to the sky? Find the One Piece? IDIOT! The age of pirate dreams is over — what matters now is money and a big bounty. Mine's fifty-five million. Yours?"`,
          choices: [
            { text: 'Take that back.', if: () => !ctx.quest('p1_mock_town'), do: (c) => c.startQuest('p1_mock_town'), end: true },
            { text: 'Walk away.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'p1_sarquiss', name: 'Sarquiss', title: '"Big Knife" Sarquiss, First Mate of the Bellamy Pirates', island: 'jaya', at: { town: 'mock_town', plaza: true, ox: 6 },
    look: { hair: 'long', hairColor: '#1565c0', skin: '#f1c9a0', top: '#212121', bottom: '#455a64', swords: 1 }, level: 26,
    named: true, faction: 'pirate', style: 'ittoryu', weapon: 'sword', moves: ['p1_big_knife', 'itto_iai'], bounty: 38000000, infamy: true, skill: 0.45, breakthrough: 1,
    alert: `"Bellamy doesn't dirty his hands on dreamers. That's what I'm for."`,
    when: (c) => !c.defeated.p1_sarquiss,
    dialogue: () => ({ start: 'a', nodes: { a: { text: `"You heard the boss. The sky? Hahaha! Next you'll tell me the sea floor has a city of gold, like that fool Cricket."` } } }),
  },
  {
    id: 'p1_teach_jaya', name: 'Marshall D. Teach', title: 'A big man eating cherry pie', island: 'jaya', at: { town: 'mock_town', building: 'Mock Town Tavern' },
    look: { hair: 'curly', hairColor: '#212121', skin: '#e0ac7e', top: '#fafafa', bottom: '#212121', coat: '#212121', hat: 'bandana', hatColor: '#c62828', bulk: 1.6, grin: true }, bulk: 1.6, level: 85, fixedPower: 25000, ai: 'idle',
    when: (c) => !c.flags.p1_bellRung,
    dialogue: () => ({ start: 'a', nodes: { a: {
      text: `"Zehahaha! Barkeep — another cherry pie! ...Hm? A pirate who dreams of the sky? GOOD! They laugh at you here? Let them! People's dreams... never end! Zehahahaha!"`,
      choices: [{ text: 'Order food and drink.', do: (c) => c.open('shop', { shop: 'tavern', building: { name: 'Mock Town Tavern', role: 'bar' } }) }, { text: 'Leave', end: true }],
    } } }),
  },

  // ================================================================ Skypiea (zone) — Heaven's Gate
  {
    id: 'p1_amazon', name: 'Amazon', title: "Gatekeeper of Heaven's Gate", island: 'heavens_gate', at: { spot: 'gate_booth' }, race: 'skypiean',
    look: { hair: 'curly', hairColor: '#eceff1', skin: '#f1c9a0', top: '#fafafa', bottom: '#fafafa', scale: 0.85 }, level: 5,
    marker: (c, g) => (g.quests.stageId('p1_skypiea_god') === 'gate' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => act(ctx, 'p1_skypiea_god', 'gate')
            ? `"Heso! Are you tourists? Or here to fight? Either way — the entry toll is one billion extol per person. (That is about ฿100,000 in Blue Sea money.)"`
            : `"Heso. Enjoy the Upper Sea. Don't go near Upper Yard — the Sacred Land belongs to God."`,
          choices: [
            { text: 'Pay the toll (฿100,000)', if: () => act(ctx, 'p1_skypiea_god', 'gate'), do: (c) => { if (!c.pay(100000)) return 'a'; c.setFlag('p1_skyTollPaid'); c.stage('p1_skypiea_god', 'angel'); return 'paid'; } },
            { text: 'I have no extol. I\'m going in anyway.', if: () => act(ctx, 'p1_skypiea_god', 'gate'), do: (c) => { c.setFlag('p1_skyIllegal'); c.stage('p1_skypiea_god', 'angel'); return 'free'; } },
            { text: 'Goodbye.', end: true },
          ],
        },
        paid: { text: `"Heso! Thank you kindly. Welcome to Skypiea! Angel Island lies to the north-west, across the White-White Sea."` },
        free: { text: `"You don't have to pay. You may pass... or not. Heso." (She points a strange shell at you. Click. It seems to have taken your picture.)` },
      },
    }),
  },
  // ---------------------------------------------------------------- Angel Island
  {
    id: 'p1_conis', name: 'Conis', title: 'A girl of Angel Island', island: 'angel_island', at: { spot: 'angel_beach' }, race: 'skypiean',
    look: { hair: 'long', hairColor: '#fff59d', skin: '#f9dcc4', top: '#f48fb1', bottom: '#fafafa' }, level: 6,
    marker: (c, g) => (g.quests.stageId('p1_skypiea_god') === 'angel' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (fin(ctx, 'p1_skypiea_god')) return `"The sky is quiet. No more Judgments, no more Ordeals. Heso — thank you! Come and have cloud-fish stew with us any time."`;
            if (act(ctx, 'p1_skypiea_god', 'angel')) return `"Heso! Welcome to Angel Island! You came up the Knock Up Stream? That's amazing! ...Have you heard of God Enel? You shouldn't go near the Sacred Land."`;
            return `"Heso! That's our greeting — it means 'hello'. Try the Dial shop in Lovely Street; my father Pagaya can fix any Dial boat."`;
          },
          choices: [
            { text: 'Tell me about God Enel.', if: () => act(ctx, 'p1_skypiea_god', 'angel'), next: 'enel' },
            { text: 'Goodbye, Conis.', end: true },
          ],
        },
        enel: { text: `"Enel hears everything said on Skypiea — they call it Mantra. His four priests guard Upper Yard with Ordeals: Balls, String, Swamp and Iron. Hardly anyone survives. ...Please forget I said that."`, onEnter: (c) => c.stage('p1_skypiea_god', 'ordeals') },
      },
    }),
  },
  {
    id: 'p1_pagaya', name: 'Pagaya', title: 'Dial Boat Engineer', island: 'angel_island', at: { town: 'lovely_street', building: "Pagaya's House" }, race: 'skypiean',
    look: { hair: 'short', hairColor: '#eceff1', skin: '#f1c9a0', top: '#fafafa', bottom: '#90caf9', goggles: true }, level: 8,
    dialogue: () => ({ start: 'a', nodes: { a: {
      text: `"Welcome, welcome! Dials are shells from the White-White Sea. They store wind, flame, light, sound — even impact! With a Breath Dial a Waver sails with no wind at all."`,
      choices: [
        { text: 'Browse Dials.', do: (c) => c.open('shop', { shop: 'skypiea', building: { name: "Pagaya's Dials", role: 'shop' } }) },
        { text: 'Repair my ship.', do: (c) => c.open('shipwright', {}) },
        { text: 'Goodbye.', end: true },
      ],
    } } }),
  },
  {
    id: 'p1_mckinley', name: 'McKinley', title: 'Captain of the White Berets', island: 'angel_island', at: { town: 'lovely_street', building: 'White Berets Post' }, race: 'skypiean',
    look: { hair: 'short', hairColor: '#fff59d', skin: '#f1c9a0', top: '#fafafa', bottom: '#fafafa', hat: 'beanie', hatColor: '#fafafa' }, level: 25,
    named: true, style: 'brawler', moves: ['dial_impact', 'brawl_tackle'], lethal: false, skill: 0.4,
    when: (c) => !c.defeated.p1_mckinley,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => ctx.flag('p1_skyIllegal') && !ctx.flag('p1_finePaid') && !fin(ctx, 'p1_class_eleven')
            ? `"Halt! You entered Skypiea without paying the toll — a Class-11 crime! The fine is ten times the toll: ten billion extol (฿1,000,000). Pay now, or face Heaven's Judgment!"`
            : `"The White Berets keep the peace on Angel Island. Remember: catching sky sharks is a Class-9 crime, and snoring loudly is Class-6."`,
          choices: [
            { text: 'Pay the fine (฿1,000,000)', if: () => ctx.flag('p1_skyIllegal') && !ctx.flag('p1_finePaid') && !fin(ctx, 'p1_class_eleven'), do: (c) => { if (!c.pay(1000000)) return 'a'; c.setFlag('p1_finePaid'); if (!c.quest('p1_class_eleven')) c.startQuest('p1_class_eleven'); c.complete('p1_class_eleven'); return 'ok'; } },
            { text: 'I\'m not paying.', if: () => ctx.flag('p1_skyIllegal') && !ctx.flag('p1_finePaid') && !ctx.quest('p1_class_eleven'), do: (c) => { c.startQuest('p1_class_eleven'); aggro(c.game, findActor(c.game, 'p1_mckinley')); }, end: true },
            { text: 'Goodbye.', end: true },
          ],
        },
        ok: { text: `"Your debt to Skypiea is paid. Welcome, law-abiding citizen! ...Please do not go to Upper Yard. We would have to arrest you, and that is if God doesn't get you first."` },
      },
    }),
  },
  {
    id: 'p1_gan_fall', name: 'Gan Fall', title: '"Knight of the Sky", former God of Skypiea', island: 'angel_island', at: { dx: -0.55, dy: -0.35 }, race: 'skypiean',
    look: { hair: 'short', hairColor: '#eceff1', skin: '#f1c9a0', top: '#90a4ae', bottom: '#607d8b', hat: 'horns', hatColor: '#b0bec5' }, level: 42, trainer: 'p1_sky_knight',
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => fin(ctx, 'p1_skypiea_god')
            ? `"The Sacred Land is free. Skypieans and Shandia will share Upper Yard at last — as it should have been all along. A knight thanks you."`
            : `"I am the Sky Knight! When you are in trouble in the sky, blow a whistle and I shall come. Six years ago Enel's army took Upper Yard from me — I was God of Skypiea before him."`,
          choices: [
            { text: 'What is Upper Yard?', next: 'uy' },
            { text: 'Train with the Sky Knight.', do: (c) => c.open('trainer', { trainer: 'p1_sky_knight' }) },
            { text: 'Farewell, knight.', end: true },
          ],
        },
        uy: { text: `"Not a cloud — earth. Vearth, from the Blue Sea. Four hundred years ago the Knock Up Stream hurled it up here, and a war for it began. The Shandia were its people. We took it from them."`, next: 'a' },
      },
    }),
  },
  // ---------------------------------------------------------------- Upper Yard
  {
    id: 'p1_satori', name: 'Satori', title: '"Satori of the Forest", Priest — Ordeal of Balls', island: 'upper_yard', at: { spot: 'ordeal_balls' },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#fafafa', bottom: '#90caf9', bulk: 1.4, scale: 0.85 }, bulk: 1.4, level: 29,
    boss: true, hostile: true, hpMul: 0.85, faction: 'rival', style: 'brawler', moves: ['p1_surprise_balls', 'dial_impact'], breakthrough: 2, skill: 0.75,
    alert: `"Hohoho! I can hear your heart, Blue Sea dweller. Your next move is... to the left! Hohoho!"`, barks: ['Hohoho!', 'Surprise Balls!', 'Mantra never lies!'],
    when: (c) => !c.bosses.includes('p1_satori'),
  },
  {
    id: 'p1_satori_humbled', name: 'Satori', title: 'Priest of Upper Yard (defeated)', island: 'upper_yard', at: { spot: 'ordeal_balls' },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#fafafa', bottom: '#90caf9', bulk: 1.4, scale: 0.85 }, bulk: 1.4, level: 29, trainer: 'skypiea_priest',
    when: (c) => c.bosses.includes('p1_satori'),
    dialogue: () => ({ start: 'a', nodes: { a: {
      text: `"Hohoho... ouch. You beat me — even Mantra couldn't read you at the end. Very well. I'll teach you to hear the voices of all living things. Even if you only hear a little."`,
      choices: [{ text: 'Teach me Mantra.', do: (c) => c.open('trainer', { trainer: 'skypiea_priest' }) }, { text: 'Leave', end: true }],
    } } }),
  },
  {
    id: 'p1_shura', name: 'Shura', title: '"Sky Rider", Priest — Ordeal of String', island: 'upper_yard', at: { spot: 'ordeal_string' },
    look: { hair: 'short', hairColor: '#212121', skin: '#e0ac7e', top: '#fafafa', bottom: '#e0e0e0', hat: 'goggles', swords: 1 }, level: 31,
    boss: true, hostile: true, hpMul: 0.85, faction: 'rival', style: 'ittoryu', weapon: 'sword', moves: ['p1_heat_javelin', 'p1_fuza_flame'], breakthrough: 2, skill: 0.6,
    alert: `"The Ordeal of String! My threads are strung through this whole forest — every one of them tells me where you are."`, barks: ['Heat Javelin!', 'Fuza, burn them!'],
    when: (c) => !c.bosses.includes('p1_shura'),
  },
  {
    id: 'p1_gedatsu', name: 'Gedatsu', title: '"Sky Boss", Priest — Ordeal of Swamp', island: 'upper_yard', at: { spot: 'ordeal_swamp' },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#fafafa', bottom: '#fafafa', goggles: true, bulk: 1.2 }, level: 30,
    boss: true, hostile: true, hpMul: 0.9, faction: 'rival', style: 'brawler', moves: ['p1_jet_punch', 'p1_swamp_cloud'], breakthrough: 2, skill: 0.5,
    alert: `"...The Ordeal of Swamp. (He stares at you, lost in thought.) ...Oh. I forgot to attack. JET PUNCH!"`, barks: ['...Hm?', 'Jet Punch!', 'I forgot.'],
    when: (c) => !c.bosses.includes('p1_gedatsu'),
  },
  {
    id: 'p1_ohm', name: 'Ohm', title: '"Skybreeder", Priest — Ordeal of Iron', island: 'upper_yard', at: { spot: 'ordeal_iron' },
    look: { hair: 'short', hairColor: '#fafafa', skin: '#f1c9a0', top: '#fafafa', bottom: '#fafafa', goggles: true, swords: 1 }, level: 33,
    boss: true, hostile: true, hpMul: 0.95, faction: 'rival', style: 'ittoryu', weapon: 'sword', moves: ['p1_eisen_whip', 'p1_iron_cloud'], breakthrough: 2, skill: 0.65,
    alert: `"The Ordeal of Iron. Survival rate: zero percent. The heavens do not forgive. Holy — heel."`, barks: ['Eisen Whip.', 'Nothing escapes the Iron Cloud.'],
    when: (c) => !c.bosses.includes('p1_ohm'),
  },
  {
    id: 'p1_yama', name: 'Yama', title: 'Commander of the Divine Soldiers', island: 'upper_yard', at: { spot: 'god_shrine' },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#fafafa', bottom: '#e0e0e0', bulk: 1.9, scale: 1.3 }, bulk: 1.9, scale: 1.3, level: 30,
    hostile: true, named: true, faction: 'rival', style: 'brawler', moves: ['p1_yama_axe', 'brawl_tackle'], skill: 0.35, hpMul: 1.4, breakthrough: 1,
    alert: `"Intruders at God's shrine! Ten-Fold Axe — Mountain Crush!"`,
    when: (c, g) => stg(g, 'p1_skypiea_god') === 'enel' && !c.defeated.p1_yama,
  },
  {
    id: 'p1_enel', name: 'Enel', title: '"God" of Skypiea', island: 'upper_yard', at: { spot: 'god_shrine' },
    look: { hair: 'curly', hairColor: '#fff59d', skin: '#f1d9c0', top: '#f1d9c0', bottom: '#ff8f00', hat: 'beanie', hatColor: '#fafafa', belt: '#1565c0' }, level: 40,
    boss: true, hostile: true, hpMul: 1.2, faction: 'rival', fruit: 'goro', fruitMastery: 88, moves: ['goro_vari', 'goro_sango', 'goro_elthor', 'goro_amaru', 'goro_raigo'],
    breakthrough: 6, skill: 0.75, aggroRange: 16,
    alert: `"Yahahaha! I am God. You are a creature that crawled up from the Blue Sea. Kneel — or be judged."`, barks: ['Yahahaha!', 'Fear is what makes a god.', 'El Thor!'],
    phases: [{ at: 0.4, run: (a, g) => { g.fx?.text?.(a.x, a.y - 2.6, '200,000,000 VOLT AMARU!', '#fff176', 0.6); a.addBuff({ id: 'p1_enel_amaru', name: 'Amaru', dur: 30, mods: { damage: 1.4, speedMul: 1.2, scale: 1.25 }, aura: 'rgba(255,241,118,0.9)' }); } }],
    when: (c, g) => stg(g, 'p1_skypiea_god') === 'enel',
  },
  // ---------------------------------------------------------------- Hidden Shandian Village
  {
    id: 'p1_wyper', name: 'Wyper', title: '"Berserker", Warrior of the Shandia', island: 'shandia_village', at: { town: 'shandia_camp', building: "Wyper's Hut" },
    look: { hair: 'mohawk', hairColor: '#212121', skin: '#a0643a', top: '#a0643a', bottom: '#5d4037', hat: 'headband', hatColor: '#fafafa', scarEye: true }, level: 34,
    named: true, style: 'brawler', weapon: 'gun', ranged: true, prefRange: 5, moves: ['p1_burn_bazooka', 'dial_reject'], skill: 0.55, breakthrough: 2, hpMul: 1.3,
    duel: true, recover: 8, recoverLine: `"...Hah. You're strong, Blue Sea dweller. Go and see the Chief."`,
    alert: `"Stand against me, then! BURN BAZOOKA!"`, barks: ['For Kalgara!', 'The Sacred Land is ours!'],
    marker: (c, g) => (g.quests.stageId('p1_skypiea_god') === 'shandia' ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (fin(ctx, 'p1_skypiea_god')) return `"Shandora's bell rang. Kalgara... our ancestors can rest now. Upper Yard belongs to everyone again. Even to you, Blue Sea dweller."`;
            if (beat(ctx.char, 'p1_wyper')) return `"...You're strong. Go to the Chief. Tell him Wyper sent you."`;
            if (act(ctx, 'p1_skypiea_god', 'shandia')) return `"Blue Sea dweller. Why come to our village? ...You beat Enel's priests? Then show me. If you want to stand beside the Shandia, you'll stand against me first!"`;
            return `"This is the Hidden Village of the Shandia. Leave, Blue Sea dweller, before I decide you're one of Enel's."`;
          },
          choices: [
            { text: 'Accept the duel.', if: () => act(ctx, 'p1_skypiea_god', 'shandia') && !beat(ctx.char, 'p1_wyper'), do: (c) => aggro(c.game, findActor(c.game, 'p1_wyper')), end: true },
            { text: 'Leave', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'p1_shandia_chief', name: 'Chief of the Shandia', title: 'Elder of the Hidden Village', island: 'shandia_village', at: { town: 'shandia_camp', building: "Chief's Hut" },
    look: { hair: 'long', hairColor: '#eceff1', skin: '#a0643a', top: '#8d6e63', bottom: '#5d4037', hat: 'headband', hatColor: '#ffb300' }, level: 20,
    marker: (c, g) => (g.quests.stageId('p1_skypiea_god') === 'chief' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (fin(ctx, 'p1_skypiea_god')) return `"The Light of Shandora has rung. The Shandia and the Skypieans will share this land now. Go in peace, friend of Kalgara."`;
            if (act(ctx, 'p1_skypiea_god', 'chief')) return `"Wyper accepted you? Then sit and hear our story. Four hundred years ago, our great warrior Kalgara befriended a man from the Blue Sea — an explorer named Noland."`;
            return `"Welcome to the Hidden Village. We have little, but you may rest by our fire."`;
          },
          choices: [
            { text: 'What happened to them?', if: () => act(ctx, 'p1_skypiea_god', 'chief'), next: 'k2' },
            { text: 'I need more Shandoran gold.', if: () => act(ctx, 'p1_skypiea_god', 'enel') && !ctx.has('p1_gold_ball'), do: (c) => c.give('p1_gold_ball', 3), next: 'a' },
            { text: 'Rest by the fire.', do: (c) => c.open('inn', { building: { name: 'Shandian Fire', role: 'inn' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
        k2: { text: `"Noland sailed home, and our land was blasted into the sky. When he returned, there was only sea — and he was called a liar. Kalgara swore to ring the Golden Bell so Noland could find us. It has not rung since."`, next: 'k3' },
        k3: { text: `"Enel's thunder flows around blades and fists like water. But Shandoran gold, swung hard enough, strikes true. Take these three golden balls. Defeat the false god — and ring the bell for Kalgara."`, onEnter: (c) => { c.give('p1_gold_ball', 3); c.stage('p1_skypiea_god', 'enel'); } },
      },
    }),
  },
  {
    id: 'p1_aisa', name: 'Aisa', title: 'A girl of the Shandia', island: 'shandia_village', at: { town: 'shandia_camp', plaza: true, ox: -3 },
    look: { hair: 'short', hairColor: '#212121', skin: '#a0643a', top: '#ffb74d', bottom: '#5d4037', hat: 'headband', hatColor: '#e53935', scale: 0.75 }, level: 3,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => fin(ctx, 'p1_skypiea_god')
        ? `"The voices are loud and happy now! Did you know you can hear them too, if you try? Close your eyes... there. That's Mantra."`
        : `"I can hear voices — everyone's voices — the way Enel does. It's called Mantra. When he strikes, the voices go out like candles. I hate it."`,
    } } }),
  },
  {
    id: 'p1_braham', name: 'Braham', title: 'Shandian gunslinger', island: 'shandia_village', at: { town: 'shandia_camp', plaza: true, ox: 3 },
    look: { hair: 'short', hairColor: '#212121', skin: '#a0643a', top: '#6d4c41', bottom: '#4e342e', hat: 'goggles' }, level: 30, style: 'sniper', weapon: 'gun',
    when: (c) => !inCrew(c, 'p1_braham') && !c.flags['leftCrew_p1_braham'],
    recruit: { role: 'sniper', requires: (c, g) => isDone(g, 'p1_skypiea_god'), pitch: `"The war is over. My ancestors came from the Blue Sea — from Jaya, under the clouds. I want to see it before I die. My Flash Guns are yours, captain."` },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => fin(ctx, 'p1_skypiea_god')
        ? `"No more war. It's strange... I don't know what a warrior does when there is nothing to fight. Maybe he goes to see the sea his ancestors sailed."`
        : `"My Flash Guns have Flash Dials built in. You never see the bullet — only the light. Enel's soldiers learned that the hard way."`,
    } } }),
  },
  // ---------------------------------------------------------------- Weatheria
  {
    id: 'p1_haredas', name: 'Haredas', title: 'Weather scientist of Weatheria', island: 'weatheria', at: { town: 'weatheria_town', building: 'Weather Laboratory' }, race: 'skypiean',
    look: { hair: 'bald', skin: '#f1c9a0', top: '#fafafa', bottom: '#90caf9', goggles: true, scale: 0.8 }, level: 30, trainer: 'weatheria_scholar',
    dialogue: () => ({ start: 'a', nodes: { a: {
      text: `"Weather is science! Well — science and stubbornness. We Weatherians drift about the sky studying clouds and writing everything down. Care to learn Weather Science? Bring berries; clouds are expensive."`,
      choices: [{ text: 'Teach me Weather Science.', do: (c) => c.open('trainer', { trainer: 'weatheria_scholar' }) }, { text: 'Goodbye.', end: true }],
    } } }),
  },

  // ================================================================ Long Ring Long Land
  {
    id: 'p1_tonjit', name: 'Tonjit', title: 'Nomad of Long Ring Long Land', island: 'long_ring_long_land', at: { spot: 'tonjit_camp' },
    look: { hair: 'bald', skin: '#e0ac7e', top: '#8d6e63', bottom: '#5d4037', legs: 2.4, nose: 'long' }, level: 3,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => fin(ctx, 'p1_davy_back_fight')
            ? `"You beat that Foxy! He shot my Shelly, you know, just for being in his way. Thank you, young one. Shelly thanks you too. Neigh."`
            : `"Oh! You're back! ...Hm? We've never met? That explains why I didn't recognise you. I've been up on these stilts for ten years — I wanted a record, and I'm afraid of heights."`,
          choices: [{ text: 'Where is your tribe?', next: 'tribe' }, { text: 'Goodbye.', end: true }],
        },
        tribe: { text: `"The path between our ten islands only rises from the sea once a year. My tribe moved on while I was up here. Only my horse Shelly waited for me. Good Shelly. Everything here grows long — even the waiting."`, next: 'a' },
      },
    }),
  },
  {
    id: 'p1_foxy', name: 'Foxy', title: '"Silver Fox" Foxy, Captain of the Foxy Pirates', island: 'long_ring_long_land', at: { town: 'foxy_camp', plaza: true },
    look: { hair: 'short', hairColor: '#ff7043', skin: '#f1c9a0', top: '#fafafa', bottom: '#ff7043', coat: '#fafafa', nose: 'long', grin: true }, level: 33,
    boss: true, hpMul: 1.05, faction: 'pirate', fruit: 'noro', fruitMastery: 55, moves: ['noro_beam', 'noro_mirror', 'p1_gorilla_puncher'], bounty: 24000000, infamy: true, breakthrough: 3, skill: 0.5,
    duel: true, recover: 10, recoverLine: '"...I lost..." (Foxy sinks into a bottomless depression.)',
    alert: `"Game three: COMBAT! Noro Noro Beam!"`, barks: ['Fe fe fe!', 'Noro Noro Beam!', 'Foxy Face!'],
    marker: (c, g) => (!g.quests.state('p1_davy_back_fight') ? '!' : g.quests.stageId('p1_davy_back_fight') === 'combat' ? '!' : null),
    when: (c) => !c.bosses.includes('p1_foxy'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('p1_davy_back_fight');
            if (ctx.char.bosses.includes('p1_foxy')) return `"...Nine hundred and twenty wins, and I lost... (Foxy stares at the grass, radiating gloom. Then he bounces back.) Fe fe fe! Next time, you're MINE!"`;
            if (s === 'combat') return `"Fe fe fe! Game three — COMBAT! I haven't lost a Davy Back Fight in nine hundred and twenty games!"`;
            if (s) return `"Fe fe fe! The games have begun! No backing out — you promised Davy Jones himself!"`;
            return `"Fe fe fe! A new crew! I am the Silver Fox Foxy, and I challenge you to a DAVY BACK FIGHT! Three coins, three games. The winner of each game takes one member of the losing crew!"`;
          },
          choices: [
            { text: 'Accept. (Fire a shot into the sky.)', if: () => !ctx.quest('p1_davy_back_fight'), do: (c) => c.startQuest('p1_davy_back_fight'), end: true },
            { text: 'Fight!', if: () => act(ctx, 'p1_davy_back_fight', 'combat'), do: (c) => aggro(c.game, findActor(c.game, 'p1_foxy')), end: true },
            { text: 'Not now.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'p1_porche', name: 'Porche', title: 'Idol of the Foxy Pirates', island: 'long_ring_long_land', at: { town: 'foxy_camp', plaza: true, ox: -4 },
    look: { hair: 'long', hairColor: '#ff8a65', skin: '#f9dcc4', top: '#f48fb1', bottom: '#fafafa', hat: 'pinkhat', hatColor: '#f48fb1' }, level: 24,
    when: (c, g) => !isDone(g, 'p1_davy_back_fight'),
    dialogue: () => ({ start: 'a', nodes: { a: { text: `"Oyabin~! Show them the Foxy Face! ...Hmph. You're kind of cute. When the Oyabin wins you, I'll let you carry my baton."` } } }),
  },
  {
    id: 'p1_hamburg', name: 'Hamburg', title: 'Leader of the Groggy Monsters', island: 'long_ring_long_land', at: { spot: 'groggy_ring' },
    look: { hair: 'bald', skin: '#e0ac7e', top: '#ff7043', bottom: '#3e2723', bulk: 1.5, grin: true }, bulk: 1.5, level: 28,
    hostile: true, named: true, faction: 'pirate', style: 'brawler', moves: ['p1_monster_rush', 'brawl_headbutt'], skill: 0.35, hpMul: 1.3,
    duel: true, recover: 10, recoverLine: 'Pupupu... this game is yours.',
    alert: `"Pupupu! GROGGY RING! The ball is you!"`,
    when: (c, g) => stg(g, 'p1_davy_back_fight') === 'groggy' && !c.defeated.p1_hamburg,
  },
  {
    id: 'p1_pickles', name: 'Pickles', title: 'Groggy Monster', island: 'long_ring_long_land', at: { spot: 'groggy_ring' },
    look: { hair: 'short', hairColor: '#212121', skin: '#f1c9a0', top: '#ffb74d', bottom: '#3e2723', bulk: 1.3 }, bulk: 1.3, level: 26,
    hostile: true, named: true, faction: 'pirate', style: 'brawler', moves: ['p1_monster_rush', 'brawl_tackle'], skill: 0.3, hpMul: 1.2,
    duel: true, recover: 10, recoverLine: 'Ugh... foul...',
    alert: `"Pickles' Pass! Foul? What foul?"`,
    when: (c, g) => stg(g, 'p1_davy_back_fight') === 'groggy' && !c.defeated.p1_pickles,
  },
  {
    id: 'p1_big_pan', name: 'Big Pan', title: 'Groggy Monster', island: 'long_ring_long_land', at: { spot: 'groggy_ring' },
    look: { hair: 'short', hairColor: '#5d4037', skin: '#e0ac7e', top: '#8d6e63', bottom: '#3e2723', bulk: 1.8 }, bulk: 1.8, scale: 1.6, level: 27,
    hostile: true, named: true, faction: 'pirate', style: 'brawler', moves: ['p1_pan_slam', 'brawl_tackle'], skill: 0.2, hpMul: 1.6,
    duel: true, recover: 10, recoverLine: 'Big Pan... lost...',
    alert: `"BIG PAN... SLAM!"`,
    when: (c, g) => stg(g, 'p1_davy_back_fight') === 'groggy' && !c.defeated.p1_big_pan,
  },
  {
    id: 'p1_kerokko', name: 'Kerokko', title: 'Navigator, formerly of the Fanged Toad Pirates', island: 'long_ring_long_land', at: { town: 'foxy_camp', plaza: true, ox: 5 },
    look: { hair: 'curly', hairColor: '#7cb342', skin: '#f1c9a0', top: '#558b2f', bottom: '#33691e', goggles: true }, level: 20,
    marker: (c, g) => (g.quests.stageId('p1_davy_back_fight') === 'claim' ? '?' : null),
    when: (c) => !inCrew(c, 'p1_kerokko') && !c.flags['leftCrew_p1_kerokko'],
    recruit: { role: 'navigator', requires: (c, g) => isDone(g, 'p1_davy_back_fight'), pitch: `"By the Three Articles of Defeat, I belong to the winner — and the winner is you! I can read the Grand Line's weather like a book, captain. Let's go!"` },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (act(ctx, 'p1_davy_back_fight', 'claim')) return `"You... you beat Foxy?! Then by the Three Articles of Defeat, you get to claim one of us. Everyone's looking at me. ...Me? Really? Kero!"`;
            if (fin(ctx, 'p1_davy_back_fight')) return `"My old crew, the Fanged Toad Pirates, lost me in a Davy Back Fight. Now I'm free. A navigator without a ship is just a frog on a log, though. Kero."`;
            return `"...Foxy won me from the Fanged Toad Pirates, along with our captain, our doctor and our flag. Our ship's still drifting out there, full of crying men. Nobody beats Foxy."`;
          },
          choices: [
            { text: 'I claim you, Kerokko.', if: () => act(ctx, 'p1_davy_back_fight', 'claim'), do: (c) => c.complete('p1_davy_back_fight'), next: 'claimed' },
            { text: 'Goodbye.', end: true },
          ],
        },
        claimed: { text: `"KERO! Foxy's crew can't touch me now — rule one of the Three Articles! Whether I join your crew is up to you, captain... just ask."` },
      },
    }),
  },
  {
    id: 'p1_aokiji', name: 'Kuzan', title: '"Aokiji", Admiral of the Marines', island: 'long_ring_long_land', at: { spot: 'aokiji_grass' },
    look: { hair: 'curly', hairColor: '#212121', skin: '#a0643a', top: '#fafafa', bottom: '#fafafa', coat: '#fafafa', coatText: 'JUSTICE', goggles: true, scale: 1.3 }, scale: 1.3, level: 100, fixedPower: 99999, ai: 'idle', faction: 'marine',
    when: (c, g) => isDone(g, 'p1_davy_back_fight') && !c.flags.p1_aokijiMet,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: `(A very tall man is asleep in the long grass, a sleep mask over his eyes. He lifts it.) "...Ara ara. A rookie from the Blue Sea. I'm just out for a walk. Don't mind me."`,
          choices: [
            { text: 'Who are you?', next: 'who' },
            { text: 'Draw your weapon.', next: 'ice' },
            { text: 'Let him sleep.', do: (c) => c.setFlag('p1_aokijiMet'), end: true },
          ],
        },
        who: { text: () => pirate(ctx.char) ? `"Kuzan. They call me Aokiji. Admiral. ...Relax. Arresting you today would be a lot of work. The Grand Line gets harder from here, rookie — don't die of boredom."` : `"Kuzan. They call me Aokiji. Admiral. I follow my own Lazy Justice, you might say. The Grand Line gets harder from here. Don't die."`, onEnter: (c) => c.setFlag('p1_aokijiMet') },
        ice: { text: `"...Ice Time." (Cold crawls up your legs faster than you can blink. When you can move again, he is gone, the grass around you is frozen solid — and your hands have turned blue.)`, onEnter: (c) => { c.setFlag('p1_aokijiMet'); c.player.hp = Math.max(1, Math.round(c.player.hp * 0.3)); c.player.addStatus?.('freeze', 3); } },
      },
    }),
  },
];

const npcs = [...npcsA, ...npcsB, ...npcsC];
// Cameos and quest-givers can't be struck down (a knocked-out Kohza would stall the war).
const UNTOUCHABLE = new Set([
  'p1_crocus', 'p1_miss_wednesday', 'p1_jonathan', 'p1_jessica', 'p1_henzo', 'p1_tenaga', 'p1_koala_mother', 'p1_igaram', 'p1_distiller', 'p1_vivi_wp',
  'p1_miss_all_sunday', 'p1_kyuka_manager', 'p1_mr3_vacation', 'p1_goldenweek_vacation', 'p1_hina_kyuka', 'p1_vira_archivist', 'p1_vira_revolutionary',
  'p1_dorry', 'p1_brogy', 'p1_dalton', 'p1_kureha', 'p1_vivi', 'p1_vivi_palace', 'p1_cobra', 'p1_pell', 'p1_chaka', 'p1_igaram_ala', 'p1_kohza', 'p1_toto',
  'p1_paula', 'p1_bon_clay', 'p1_ace_nanohana', 'p1_smoker_ala', 'p1_robin_tomb', 'p1_cricket', 'p1_masira', 'p1_shoujou', 'p1_teach_jaya', 'p1_amazon',
  'p1_conis', 'p1_pagaya', 'p1_gan_fall', 'p1_satori_humbled', 'p1_shandia_chief', 'p1_aisa', 'p1_haredas', 'p1_tonjit', 'p1_porche', 'p1_aokiji',
]);
for (const n of npcs) if (UNTOUCHABLE.has(n.id)) n.invulnerable = true;

// ============================================================ enemy groups
// Few, small and tied to a story beat (or to canon wildlife).
const LOOTERS = [['bandit', 17, { name: 'Palace Looter' }], ['bandit', 17, { name: 'Palace Looter' }], ['bandit', 18, { name: 'Palace Looter' }]];
const TAXMEN = [['pirate', 16, { name: 'Tax Collector' }], ['pirate_gunner', 16, { name: 'Tax Collector' }]];
const FOXY_CREW = [['p1_foxy_pirate', 24, { name: 'Foxy Pirate' }], ['p1_foxy_pirate', 24, { name: 'Foxy Pirate' }]];

const groups = [
  { island: 'cactus_island', spot: 'wp_square', radius: 9, enemies: WP_MILLIONS, when: (c, g) => stg(g, 'p1_whisky_peak') === 'hunters' },
  { island: 'navarone', spot: 'main_gate', radius: 6, enemies: [['marine', 20, { name: 'G-8 Marine' }], ['marine_rifle', 20, { name: 'G-8 Rifleman' }], ['marine', 21, { name: 'Navarone Fighting Corps' }]], when: (c) => pirate(c) && !c.flags.p1_g8Escaped },
  { island: 'vira', spot: 'old_palace', radius: 5, enemies: LOOTERS, when: (c, g) => stg(g, 'p1_vira_logbook') === 'ruins' },
  { island: 'ruluka_island', spot: 'rainbow_tower', radius: 5, enemies: TAXMEN, when: (c, g) => stg(g, 'p1_ruluka_rainbow') === 'wetton' },
  // Little Garden is a prehistoric island: its dinosaurs roam near the volcano.
  { island: 'little_garden', dx: 0.4, dy: -0.35, radius: 7, enemies: [['dinosaur', 22, { name: 'Little Garden Dinosaur' }], ['dinosaur', 23, { name: 'Tyrannosaurus of Little Garden' }]] },
  { island: 'drum_island', spot: 'lapahn_slope', radius: 6, enemies: [['p1_lapahn', 20, { name: 'Lapahn' }], ['p1_lapahn', 20, { name: 'Lapahn' }], ['p1_lapahn', 21, { name: 'Lapahn Boss' }]], when: (c, g) => stg(g, 'p1_drum_kingdom') === 'climb' },
  { island: 'drum_island', spot: 'castle_gate', radius: 6, enemies: BLIKING, when: (c, g) => stg(g, 'p1_drum_kingdom') === 'bliking' },
  { island: 'alabasta', spot: 'rain_dinners', radius: 6, enemies: BILLIONS, when: (c, g) => stg(g, 'p1_alabasta') === 'billions' },
  { island: 'alabasta', spot: 'alubarna_square', radius: 8, enemies: ALUBARNA_MILLIONS, when: (c, g) => stg(g, 'p1_alabasta') === 'officers' },
  { island: 'jaya', dx: -0.62, dy: 0.12, radius: 7, enemies: [['p1_bellamy_pirate', 22, { name: 'Bellamy Pirate' }], ['p1_bellamy_pirate', 22, { name: 'Bellamy Pirate' }]], when: (c, g) => !!stg(g, 'p1_mock_town') },
  { island: 'jaya', spot: 'south_bird_woods', radius: 6, enemies: JAYA_INSECTS, when: (c, g) => stg(g, 'p1_golden_city') === 'bird' },
  { island: 'angel_island', dx: 0.05, dy: 0.12, radius: 7, enemies: WHITE_BERETS, when: (c, g) => stg(g, 'p1_class_eleven') === 'fine' },
  { island: 'upper_yard', spot: 'god_shrine', radius: 8, enemies: DIVINE, when: (c, g) => stg(g, 'p1_skypiea_god') === 'enel' },
  { island: 'upper_yard', spot: 'ordeal_iron', radius: 4, enemies: [['p1_holy', 30, { name: 'Holy' }]], when: (c) => !c.bosses.includes('p1_ohm') },
  { island: 'long_ring_long_land', spot: 'dbf_beach', radius: 6, enemies: FOXY_CREW, when: (c, g) => stg(g, 'p1_davy_back_fight') === 'combat' },
];

// ================================================================= quests
/** Move a quest on (deferred, so it is safe inside onStart) when a condition already holds. */
const skipIf = (qid, stageId, next, cond) => (ctx, g) => {
  const c = g.state?.char;
  if (!c || !cond(c, g)) return;
  setTimeout(() => { if (g.quests.stageId(qid) === stageId) { if (next) g.quests.setStage(qid, next); else g.quests.complete(qid); } }, 0);
};
const aggroNow = (g, id) => { const a = findActor(g, id); if (a) aggro(g, a); return a; };
/** Enemies spawned at the player's feet when a stage starts on the current island. */
function spawnGroupHere(game, islandId, enemies, radius = 6) {
  const list = game.spawner.populated.get(islandId);
  if (!list || !game.player) return;
  for (const [arch, lvl, over] of enemies) {
    const p = game.spawner.findFree(game.player.x + 4, game.player.y, radius);
    if (!p) continue;
    const a = makeEnemy(arch, lvl, p.x, p.y, over || {});
    a.game = game;
    game.addActor(a);
    list.push(a);
  }
}

const quests = [
  // ----------------------------------------------------------- Twin Cape
  { id: 'p1_laboon_promise', name: 'The Whale Who Waits', island: 'twin_cape', kind: 'story',
    summary: 'Laboon has waited fifty years at Twin Cape for the Rumbar Pirates. Now whale hunters from Cactus Island are after him.',
    stages: [
      { id: 'hunters', desc: 'Whale hunters are sneaking up on Laboon from Harpoon Point. Stop Mr. 9.', goal: { type: 'defeat', npc: 'p1_mr9_cape' },
        onStart: (ctx, g) => { spawnAt(g, 'p1_mr9_cape', 'twin_cape', 'harpoon_point'); spawnAt(g, 'p1_miss_wednesday', 'twin_cape', 'harpoon_point', 2); } },
      { id: 'promise', desc: 'Go down to the water where Laboon waits, at the foot of the torrent, and speak to him.', goal: { type: 'event', event: 'p1_laboon_promise' },
        where: (g) => { const lb = g.surface?._p1LaboonAt; return lb ? { x: lb.x - 4, y: lb.y + 25, place: 'Laboon' } : null; } },
      { id: 'report', desc: 'Return to Crocus at the lighthouse.' },
    ],
    rewards: { berries: 6000, points: 1, attrs: { wil: 1 }, items: [['bandage', 3], ['antidote', 1]] } },

  // ----------------------------------------------------------- the seven routes
  { id: 'p1_g8_escape', name: 'Escape from Navarone', island: 'navarone', kind: 'side',
    summary: 'A pirate walked into Marine Base G-8, "the Hedgehog". It has one gate, and it is shut.',
    stages: [{ id: 'gate', desc: 'Break out of Navarone: defeat Lt. Commander Drake at the main gate on the south cape.', goal: { type: 'defeat', npc: 'p1_g8_drake' },
      onStart: skipIf('p1_g8_escape', 'gate', null, (c) => !!c.defeated.p1_g8_drake) }],
    rewards: { points: 1, bounty: 5000000, flag: 'p1_g8Escaped' } },
  { id: 'p1_ruluka_rainbow', name: 'The Rainbow Mist', island: 'ruluka_island', kind: 'side',
    summary: 'Mayor Wetton, a former pirate, taxes Ruluka to death to build a tower to the Rainbow Mist. Old Henzo just wants to wait in peace.',
    stages: [
      { id: 'wetton', desc: 'Confront Mayor Wetton in his mansion in Ruluka and end his taxes.', goal: { type: 'defeat', npc: 'p1_wetton' },
        onStart: (ctx, g) => { skipIf('p1_ruluka_rainbow', 'wetton', 'report', (c) => c.bosses.includes('p1_wetton'))(ctx, g); spawnGroupNow(g, 'ruluka_island', 'rainbow_tower', TAXMEN); } },
      { id: 'report', desc: 'Tell Henzo at his workshop.' },
    ],
    rewards: { berries: 14000, points: 1, liberate: 'Ruluka Island' },
    onComplete: (ctx, g) => banner(g, 'THE RAINBOW MIST', 'Ruluka Island', 'Far out to sea, an arch of seven colours rises from the water, shimmers... and fades.', 5) },
  { id: 'p1_kenzan_whirlpool', name: 'The Whirlpool Lord', island: 'kenzan_island', kind: 'side',
    summary: 'A Sea King nests in the whirlpools north of Kenzan Island and swallows the Longarms\' fishing boats.',
    stages: [
      { id: 'hunt', desc: 'Sail into the whirlpools north of Kenzan Island and slay the Whirlpool Lord.', goal: { type: 'defeat', npc: 'p1_whirlpool_lord' },
        where: (g) => { const s = g.surface.islands.find((i) => i.id === 'kenzan_island')?.spots?.whirlpool; return s && g.world === g.surface ? { x: s.x, y: s.y, place: 'The Kenzan whirlpools' } : null; } },
      { id: 'report', desc: 'Return to Old Tenaga in the Tehna Gehna Kingdom.' },
    ],
    rewards: { berries: 12000, points: 1, items: [['sea_king_steak', 1]] } },
  { id: 'p1_foolshout_sun', name: "The Sun Pirates' Flag", island: 'foolshout_island', kind: 'side',
    summary: 'Fisher Tiger brought Koala home to Foolshout Island and died here in a Marine ambush. His crew\'s flag was left in the wreck.',
    stages: [
      { id: 'flag', desc: "Search the wreck at the old anchorage on Foolshout's south-west shore for the Sun Pirates' flag.", goal: { type: 'item', item: 'p1_sun_flag' }, at: { spot: 'sun_anchorage', place: 'The wreck at the old anchorage' },
        onStart: (ctx, g) => ensureGroundItem(g, 'foolshout_island', 'sun_anchorage', 'p1_sun_flag', "the Sun Pirates' flag") },
      { id: 'report', desc: "Bring the flag to Koala's mother." },
    ],
    rewards: { berries: 6000, points: 1, attrs: { wil: 1 } } },
  { id: 'p1_kyuka_bill', name: 'The Unpaid Bill', island: 'kyuka_island', kind: 'side',
    summary: 'Two Baroque Works agents left Hotel Kyuka without paying — forty ice creams and tea every hour.',
    stages: [
      { id: 'collect', desc: 'Find the man with the "3" hairdo — Mr. 3 of Baroque Works — on Little Garden, and defeat him.', goal: { type: 'defeat', npc: 'p1_mr3' },
        onStart: skipIf('p1_kyuka_bill', 'collect', 'report', (c) => c.bosses.includes('p1_mr3')) },
      { id: 'report', desc: 'Return to the manager of Hotel Kyuka.', npc: 'p1_kyuka_manager' },
    ],
    rewards: { berries: 9000, items: [['p1_ice_cream', 5]] } },
  { id: 'p1_vira_logbook', name: "Noland's Departure", island: 'vira', kind: 'side',
    summary: 'Vira\'s harbour register recorded the day Mont Blanc Noland set sail in 1120. Looters stole the page when the palace burned.',
    stages: [
      { id: 'ruins', desc: 'Recover the stolen page from the looters in the burnt palace ruins east of Vira: defeat Ashford the Looter.', goal: { type: 'defeat', npc: 'p1_looter_boss' },
        onStart: (ctx, g) => { spawnAt(g, 'p1_looter_boss', 'vira', 'old_palace'); spawnGroupNow(g, 'vira', 'old_palace', LOOTERS); } },
      { id: 'report', desc: 'Return the page to Archivist Soleil at the Vira Harbour Archives.' },
    ],
    rewards: { berries: 9000, points: 1, items: [['p1_noland_page', 1]] } },

  // ----------------------------------------------------------- Whisky Peak
  { id: 'p1_whisky_peak', name: 'Welcome to Whisky Peak', island: 'cactus_island', kind: 'story',
    summary: 'Whisky Peak throws a party for every crew that survives Reverse Mountain. The whole town is very, very welcoming.',
    stages: [
      { id: 'party', desc: "Enjoy Mayor Igarappoi's welcome party at the Whisky Peak Saloon (talk to him).", npc: 'p1_igaram' },
      { id: 'hunters', desc: 'Whisky Peak is a nest of Baroque Works bounty hunters! Defeat their ringleaders, Mr. 9 and Miss Monday.', goal: { type: 'defeat', any: ['p1_mr9', 'p1_miss_monday'], count: 2 },
        onStart: (ctx, g) => {
          banner(g, 'WHISKY PEAK', 'Midnight', 'A hundred bounty hunters step out of the shadows, grinning.', 4);
          if (g.spawner.populated.has('cactus_island')) { aggro(g, spawnNow(g, 'p1_mr9')); aggro(g, spawnNow(g, 'p1_miss_monday')); spawnGroupNow(g, 'cactus_island', 'wp_square', WP_MILLIONS, 9); }
        } },
      { id: 'traitor', desc: 'Officer Agents Mr. 5 and Miss Valentine have come to kill "Miss Wednesday" — Princess Vivi of Alabasta. Defeat Mr. 5 on the western outskirts of town.', goal: { type: 'defeat', npc: 'p1_mr5' },
        onStart: (ctx, g) => { spawnAt(g, 'p1_vivi_wp', 'cactus_island', 'wp_outskirts', -2); spawnAt(g, 'p1_miss_valentine', 'cactus_island', 'wp_outskirts', 2); aggro(g, spawnAt(g, 'p1_mr5', 'cactus_island', 'wp_outskirts')); banner(g, 'OFFICER AGENTS', 'Mr. 5 & Miss Valentine', '"The boss sends his regards to the traitor princess."', 4); } },
      { id: 'report', desc: 'Talk to Igaram ("Mayor Igarappoi") in the saloon.' },
    ],
    rewards: { berries: 15000, points: 2, items: [['p1_whisky', 2]] } },

  // ----------------------------------------------------------- Little Garden
  { id: 'p1_little_garden', name: 'The Hundred-Year Duel', island: 'little_garden', kind: 'story',
    summary: 'Dorry and Brogy of Elbaf have fought for a century. Little Garden\'s log takes a YEAR to set — and someone is sabotaging the giants.',
    stages: [
      { id: 'brogy', desc: 'Meet Brogy, the red giant, at his camp east of the duel ground.' },
      { id: 'ale', desc: "Bring Brogy's barrel of giant's ale to Dorry at his camp west of the duel ground." },
      { id: 'wax', desc: 'The ale was a bomb! Follow the trail of hard white wax to the Candle House in the south of the island.', goal: { type: 'reach', island: 'little_garden', spot: 'wax_house', r: 7 } },
      { id: 'goldenweek', desc: "Miss Goldenweek's Colors Trap! Defeat the little painter by the Candle House.", goal: { type: 'defeat', npc: 'p1_goldenweek' },
        onStart: (ctx, g) => { aggro(g, spawnAt(g, 'p1_goldenweek', 'little_garden', 'wax_house')); } },
      { id: 'mr3', desc: 'Mr. 3 is turning Brogy into a wax statue on the Candle Service Set! Defeat the Wax Man — fire melts wax.', goal: { type: 'defeat', npc: 'p1_mr3' },
        onStart: (ctx, g) => { aggro(g, spawnAt(g, 'p1_mr3', 'little_garden', 'candle_service')); banner(g, 'CANDLE SERVICE SET', 'Mr. 3', '"Hahaha! A wax statue of a giant — my masterpiece!"', 4); } },
      { id: 'pose', desc: "Mr. 0's couriers, the Unluckies, are flying in with a delivery for the Candle House. Intercept them.", goal: { type: 'defeat', any: ['p1_mr13', 'p1_miss_friday'], count: 2 },
        onStart: (ctx, g) => { aggro(g, spawnAt(g, 'p1_mr13', 'little_garden', 'wax_house')); aggro(g, spawnAt(g, 'p1_miss_friday', 'little_garden', 'wax_house', 2)); },
        onComplete: (ctx) => { ctx.give('eternal_pose_alabasta', 1); ctx.log('Among the Unluckies\' parcels: an Eternal Pose set to ALABASTA, meant for Mr. 3. Now you won\'t have to wait a year.', '#81d4fa'); } },
      { id: 'report', desc: 'Return to Dorry — the duel can go on with honour.' },
    ],
    rewards: { berries: 20000, points: 2, items: [['giant_axe', 1], ['horned_helm', 1]] },
    onComplete: (ctx, g) => { ctx.setFlag('p1_islandEaterPending'); } },

  // ----------------------------------------------------------- Drum Island
  { id: 'p1_drum_kingdom', name: "Hiriluk's Cherry Blossoms", island: 'drum_island', kind: 'story',
    summary: 'Drum Island has no doctors but one "witch". And its runaway king, "Tin-Plate" Wapol, has come home to take his castle back.',
    stages: [
      { id: 'climb', desc: 'Climb to Drum Castle on the summit of Drum Rock and find Dr. Kureha. Beware the Lapahn on the slopes.', goal: { type: 'reach', island: 'drum_island', spot: 'castle_gate', r: 8 } },
      { id: 'bliking', desc: '"Tin-Plate" Wapol has returned with his Bliking Pirates to retake the castle! Defeat Chess and Kuromarimo at the castle gate.', goal: { type: 'defeat', any: ['p1_chess', 'p1_kuromarimo'], count: 2 },
        onStart: (ctx, g) => {
          banner(g, 'WAPOL RETURNS', 'Drum Castle', '"Mahahaha! My castle! My country! Chess, Kuromarimo — throw these peasants off my mountain!"', 5);
          aggro(g, spawnAt(g, 'p1_chess', 'drum_island', 'castle_gate', -3)); aggro(g, spawnAt(g, 'p1_kuromarimo', 'drum_island', 'castle_gate', 3)); spawnGroupNow(g, 'drum_island', 'castle_gate', BLIKING);
        } },
      { id: 'chessmarimo', desc: '"Baku Baku Factory!" Wapol swallowed his own men and fused them. Defeat Chessmarimo!', goal: { type: 'defeat', npc: 'p1_chessmarimo' },
        onStart: (ctx, g) => { aggro(g, spawnAt(g, 'p1_chessmarimo', 'drum_island', 'castle_gate')); } },
      { id: 'wapol', desc: 'Defeat "Tin-Plate" Wapol before he eats the castle armoury.', goal: { type: 'defeat', npc: 'p1_wapol' },
        onStart: (ctx, g) => { aggro(g, spawnAt(g, 'p1_wapol', 'drum_island', 'castle_gate')); } },
      { id: 'report', desc: 'Talk to Dr. Kureha in her clinic in Drum Castle.' },
    ],
    rewards: { berries: 22000, points: 2, liberate: 'Drum Island', items: [['p1_sakura_powder', 1], ['bandage', 3]] } },

  // ----------------------------------------------------------- Alabasta
  { id: 'p1_alabasta', name: 'Operation Utopia', island: 'alabasta', kind: 'story',
    summary: 'Sir Crocodile — Warlord of the Sea, hero of Alabasta, and secretly Mr. 0 of Baroque Works — is driving the kingdom into civil war to seize it.',
    stages: [
      { id: 'yuba', desc: 'Cross the Sandora River and the western desert to the oasis town of Yuba, where the rebels were last seen.', goal: { type: 'reach', island: 'alabasta', spot: 'yuba_well', r: 9 } },
      { id: 'spiders', desc: "The rebels have left Yuba. Spy on the Spiders Café, south-west of Yuba, where Baroque Works' officer agents meet.", goal: { type: 'reach', island: 'alabasta', spot: 'spiders_cafe', r: 5 },
        onComplete: (ctx, g) => banner(g, 'THE SPIDERS CAFÉ', 'Overheard at night', '"Operation Utopia begins. The rebels march on Alubarna, the capital burns, and the kingdom falls into Mr. 0\'s hands."', 6) },
      { id: 'rainbase', desc: "Strike at the root: infiltrate Crocodile's casino, Rain Dinners, in Rainbase (north-west).", goal: { type: 'reach', island: 'alabasta', spot: 'rain_dinners', r: 6 } },
      { id: 'billions', desc: 'A trap! The floor of Rain Dinners opens and the Billions pour out. Defeat four Billions agents.', goal: { type: 'defeat', any: ['p1_billions_agent'], count: 4 }, at: { spot: 'rain_dinners', place: 'Rain Dinners' },
        onStart: (ctx, g) => { banner(g, 'RAIN DINNERS', "Crocodile's casino", '"Kuhahaha. Welcome, little rat." A voice from the dark — then the floor gives way.', 5); spawnGroupNow(g, 'alabasta', 'rain_dinners', BILLIONS); } },
      { id: 'kohza', desc: 'Warn Kohza at the Rebel Army headquarters in Katorea (east of the river) that the war is Crocodile\'s plot.' },
      { id: 'officers', desc: 'The rebels march on Alubarna. Stop Baroque Works\' Officer Agents in the capital\'s square — defeat 3 of them.', goal: { type: 'defeat', any: ['p1_mr1', 'p1_mr2', 'p1_mr4', 'p1_merry_christmas', 'p1_doublefinger'], count: 3 },
        onStart: (ctx, g) => {
          [['p1_mr1', -9], ['p1_mr2', 9], ['p1_mr4', 12], ['p1_merry_christmas', 14], ['p1_doublefinger', -6]].forEach(([id, ox]) => spawnAt(g, id, 'alabasta', 'alubarna_square', ox));
          spawnGroupNow(g, 'alabasta', 'alubarna_square', ALUBARNA_MILLIONS, 8);
        } },
      { id: 'bomb', desc: 'A cannon-bomb hidden in the Clock Tower will wipe out the square at 4:30! Get to the Clock Tower plaza in Alubarna.', goal: { type: 'reach', island: 'alabasta', spot: 'clock_tower', r: 4 },
        onComplete: (ctx, g) => banner(g, 'THE CLOCK TOWER', 'Alubarna', 'Pell the Falcon seizes the bomb and flies it high over the desert. The sky flashes white.', 6) },
      { id: 'crocodile', desc: "Crocodile has gone to the Tomb of the Kings, just north of Alubarna, for its Poneglyph. Defeat the Desert King! (Sand can't be struck unless you're soaked — Toto's water, the river — or you find some other way to touch a Logia.)", goal: { type: 'defeat', npc: 'p1_crocodile' },
        onStart: (ctx, g) => { aggro(g, spawnAt(g, 'p1_crocodile', 'alabasta', 'tomb_of_kings')); } },
      { id: 'report', desc: 'Rain falls on Alabasta. Talk to King Cobra in Alubarna Palace.' },
    ],
    rewards: { berries: 60000, points: 3, liberate: 'Alabasta Kingdom', items: [['p1_royal_cape', 1]], attrs: { wil: 1 }, flag: 'p1_alabastaSaved' } },
  { id: 'p1_toto_well', name: "Toto's Well", island: 'alabasta', kind: 'side',
    summary: 'Old Toto digs every day in the middle of dead Yuba, sure that the water will come back.',
    stages: [{ id: 'dig', desc: 'Help Toto dig for water in Yuba (talk to him — three hours of digging).', goal: { type: 'event', event: 'p1_toto_dug' } }],
    rewards: { items: [['p1_yuba_water', 3]], attrs: { vit: 1 } } },

  // ----------------------------------------------------------- Jaya
  { id: 'p1_mock_town', name: 'The Hyena of Mock Town', island: 'jaya', kind: 'side',
    summary: 'Bellamy the Hyena laughs at anyone who still dreams of the sky, the One Piece, or cities of gold.',
    stages: [
      { id: 'sarquiss', desc: '"Big Knife" Sarquiss wants to teach you a lesson in the square. Defeat him.', goal: { type: 'defeat', npc: 'p1_sarquiss' },
        onStart: (ctx, g) => { aggroNow(g, 'p1_sarquiss'); skipIf('p1_mock_town', 'sarquiss', 'bellamy', (c) => !!c.defeated.p1_sarquiss)(ctx, g); } },
      { id: 'bellamy', desc: 'Defeat "Bellamy the Hyena" and shut his laughing mouth for good.', goal: { type: 'defeat', npc: 'p1_bellamy' },
        onStart: (ctx, g) => { aggroNow(g, 'p1_bellamy'); skipIf('p1_mock_town', 'bellamy', null, (c) => c.bosses.includes('p1_bellamy'))(ctx, g); } },
    ],
    rewards: { berries: 25000, points: 1 } },
  { id: 'p1_golden_city', name: 'The City of Gold', island: 'jaya', kind: 'story',
    summary: 'Montblanc Cricket\'s ancestor, "Liar Noland", swore he saw a city of gold on Jaya. Maybe it is not under the sea — but above the clouds.',
    stages: [
      { id: 'bird', desc: "Catch a South Bird in the woods on Jaya's southern arm. Its giant insects will defend it.", goal: { type: 'item', item: 'south_bird' }, at: { spot: 'south_bird_woods', place: 'The woods on Jaya\'s southern arm' },
        onStart: (ctx, g) => { ensureGroundItem(g, 'jaya', 'south_bird_woods', 'south_bird', 'a South Bird (its head points south)'); spawnGroupNow(g, 'jaya', 'south_bird_woods', JAYA_INSECTS); } },
      { id: 'ship', desc: 'Bring the South Bird to Masira of the Saruyama Alliance, beside Cricket\'s house.' },
      { id: 'stream', desc: 'Sail south of Jaya to where the sea churns, and ride the Knock Up Stream to the sky (press E on the churning sea).', goal: { type: 'event', event: 'p1_reached_sky' },
        where: (g) => { const s = g.surface.islands.find((i) => i.id === 'jaya')?.spots?.knock_up_stream; return s && g.world === g.surface ? { x: s.x, y: s.y, place: 'The Knock Up Stream' } : null; } },
    ],
    rewards: { berries: 12000, points: 1 } },
  { id: 'p1_noland_honor', name: 'Noland Was No Liar', island: 'jaya', kind: 'side',
    summary: 'The Golden Bell of Shandora rang out over the sky. Down on Jaya, a diver heard it.',
    stages: [{ id: 'tell', desc: 'Return to Jaya and tell Montblanc Cricket what rang in the sky.' }],
    rewards: { berries: 30000, points: 1, items: [['golden_statue', 1]], attrs: { wil: 1 } } },

  // ----------------------------------------------------------- Skypiea (zone)
  { id: 'p1_skypiea_god', name: 'The God of Skypiea', island: 'upper_yard', kind: 'story',
    summary: '10,000 metres above the sea, "God" Enel rules Skypiea with lightning, while the Shandia fight to reclaim the land of their ancestors.',
    stages: [
      { id: 'gate', desc: "Pass Heaven's Gate: speak to the gatekeeper, Amazon." },
      { id: 'angel', desc: 'Sail the White-White Sea to Angel Island and talk to Conis on Angel Beach.' },
      { id: 'ordeals', desc: "Enter Upper Yard and survive the Ordeals: defeat three of Enel's four Priests — Satori (Balls), Shura (String), Gedatsu (Swamp), Ohm (Iron).", goal: { type: 'defeat', any: PRIESTS, count: 3 },
        onStart: (ctx, g) => {
          const c = g.state?.char;
          const n = PRIESTS.filter((id) => c?.bosses.includes(id)).length;
          const s = g.quests.state('p1_skypiea_god');
          if (n >= 3) setTimeout(() => { if (g.quests.stageId('p1_skypiea_god') === 'ordeals') g.quests.setStage('p1_skypiea_god', 'shandia'); }, 0);
          else if (s) s.n = n;
        } },
      { id: 'shandia', desc: 'Find the Hidden Shandian Village in the far north-west of the Upper Sea and face Wyper, the Berserker.', goal: { type: 'defeat', npc: 'p1_wyper' },
        onStart: skipIf('p1_skypiea_god', 'shandia', 'chief', (c) => !!c.defeated.p1_wyper) },
      { id: 'chief', desc: 'Talk to the Chief of the Shandia.' },
      { id: 'enel', desc: "Defeat God Enel at his shrine in the heart of Upper Yard. (Lightning flows around blades and fists. Rubber doesn't conduct it — and the Shandia say gold can catch it.)", goal: { type: 'defeat', npc: 'p1_enel' },
        onStart: (ctx, g) => { spawnAt(g, 'p1_yama', 'upper_yard', 'god_shrine', -4); spawnAt(g, 'p1_enel', 'upper_yard', 'god_shrine'); spawnGroupNow(g, 'upper_yard', 'god_shrine', DIVINE, 8); } },
      { id: 'bell', desc: 'Ring the Golden Bell of Shandora, beside Giant Jack — the great beanstalk of Upper Yard.', goal: { type: 'event', event: 'rang_bell:golden_bell' } },
    ],
    rewards: { berries: 50000, points: 3, haki: { observation: 5 }, items: [['shandora_gold', 2]], attrs: { wil: 1 }, liberate: 'Angel Island', flag: 'p1_bellRung' },
    onComplete: (ctx, g) => {
      banner(g, 'THE LIGHT OF SHANDORA', 'The Golden Bell', 'The bell rings out across the sky — so loud that, far below, a diver on Jaya looks up from the sea.', 7);
      const p = g.player;
      if (p) g.fx?.burst?.(p.x, p.y - 1, 50, { color: ['#ffd54f', '#fff8e1', '#ffe082'], speed: 6, vz: 6, g: 4, life: 1.6, kind: 'star' });
      g.quests.start('p1_noland_honor');
    } },
  { id: 'p1_class_eleven', name: 'Class-11 Criminal', island: 'angel_island', kind: 'side',
    summary: 'You entered Skypiea without paying the toll. Captain McKinley of the White Berets wants ten times the fee.',
    stages: [{ id: 'fine', desc: "Pay McKinley's fine at the White Berets Post in Lovely Street — or defeat the White Berets' captain.", goal: { type: 'defeat', npc: 'p1_mckinley' },
      onStart: (ctx, g) => spawnGroupHere(g, 'angel_island', WHITE_BERETS) }],
    rewards: { berries: 4000 } },

  // ----------------------------------------------------------- Long Ring Long Land
  { id: 'p1_davy_back_fight', name: 'The Davy Back Fight', island: 'long_ring_long_land', kind: 'story',
    summary: 'Foxy the Silver Fox challenges you to the pirates\' crew-stealing game: three coins, three games, and the winner takes a crewmate.',
    stages: [
      { id: 'donut', desc: 'Game 1 — the Donut Race: sail out to the buoy in the lagoon at the heart of the ring.', goal: { type: 'reach', island: 'long_ring_long_land', spot: 'donut_buoy', r: 9 },
        onStart: (ctx, g) => banner(g, 'DAVY BACK FIGHT', 'Three coins into the sea', '"Game one: the Donut Race! Ready... set... fe fe fe — our boat already left!"', 5) },
      { id: 'groggy', desc: 'Game 2 — the Groggy Ring: defeat the Groggy Monsters (Hamburg, Pickles and Big Pan) at the ring on the southern island.', goal: { type: 'defeat', any: ['p1_hamburg', 'p1_pickles', 'p1_big_pan'], count: 3 },
        onStart: (ctx, g) => { spawnAt(g, 'p1_hamburg', 'long_ring_long_land', 'groggy_ring'); spawnAt(g, 'p1_pickles', 'long_ring_long_land', 'groggy_ring', 2); spawnAt(g, 'p1_big_pan', 'long_ring_long_land', 'groggy_ring', -2); } },
      { id: 'combat', desc: 'Game 3 — Combat: defeat Foxy the Silver Fox on the stage in his camp.', goal: { type: 'defeat', npc: 'p1_foxy' },
        onStart: (ctx, g) => { aggroNow(g, 'p1_foxy'); spawnGroupNow(g, 'long_ring_long_land', 'dbf_beach', FOXY_CREW); skipIf('p1_davy_back_fight', 'combat', 'claim', (c) => c.bosses.includes('p1_foxy'))(ctx, g); } },
      { id: 'claim', desc: 'Claim your prize: talk to Kerokko, the navigator Foxy won from the Fanged Toad Pirates.' },
    ],
    rewards: { berries: 30000, points: 2, flag: 'p1_dbfWon' } },
];

// ================================================================== items
const items = {
  eternal_pose_alabasta: { name: 'Eternal Pose (Alabasta)', icon: '🧭', type: 'pose', target: 'alabasta', price: 0, desc: 'Sent by Mr. 0 to his agent on Little Garden. Its needle always points to Sandy Island — the Kingdom of Alabasta — wherever you are.' },
  eternal_pose_nanimonai: { name: 'Eternal Pose (Nanimonai Island)', icon: '🧭', type: 'pose', target: 'nanimonai_island', price: 0, desc: 'A gift from Miss All Sunday: "one stop before Alabasta". There is nothing on Nanimonai Island. Nothing at all.' },
  p1_whisky: { name: 'Whisky Peak Whisky', icon: '🥃', type: 'food', heal: 20, price: 240, buff: { id: 'p1_tipsy', name: 'Tipsy', dur: 60, mods: { damage: 1.1, defMul: 1.1 } }, desc: 'Aged in cactus barrels. Famous for putting pirates to sleep.' },
  p1_giant_ale: { name: "Barrel of Giant's Ale", icon: '🛢', type: 'key', price: 0, desc: "Brogy's gift for Dorry. Warriors of Elbaf share a drink before battle." },
  p1_sun_flag: { name: "Sun Pirates' Flag", icon: '🏴', type: 'key', price: 0, desc: "A red sun on a black field — the mark Fisher Tiger's crew painted over their slave brands." },
  p1_noland_page: { name: 'Vira Harbour Register (copy)', icon: '📜', type: 'key', price: 0, desc: '"Mont Blanc Noland, explorer of Lvneel, departed June 21, 1120." Proof that the storybook liar really sailed.' },
  p1_sakura_powder: { name: "Dr. Hiriluk's Sakura Powder", icon: '🌸', type: 'treasure', price: 20000, desc: "The quack doctor's life's work: a powder that turns falling snow the colour of cherry blossoms." },
  p1_yuba_water: { name: "Toto's Water", icon: '💧', type: 'food', heal: 30, price: 0, buff: { id: 'p1_soaked', name: 'Soaked', dur: 120, mods: {} }, desc: "The first water Yuba gave in three years. Drink it, pour it over yourself: while you're soaked, your blows can strike a man made of sand." },
  p1_gold_ball: { name: 'Golden Ball of Shandora', icon: '🟡', type: 'medicine', heal: 0, price: 0, buff: { id: 'p1_golden_arm', name: 'Golden Arm', dur: 45, forceArmament: true, mods: { damage: 1.1 }, aura: 'rgba(255,213,79,0.85)' }, desc: 'A ball of Shandoran gold to swing on your fist. For 45 seconds your blows strike true — even through lightning or sand.' },
  p1_royal_cape: { name: 'Cape of the Royal Guard', icon: '🧥', type: 'coat', look: { coat: '#fafafa' }, bonus: { end: 1, wil: 1 }, price: 0, unique: true, desc: 'Worn by the Royal Guard of Alabasta. A friend of Alabasta is welcome in any port.' },
  p1_ice_cream: { name: 'Kyuka Ice Cream', icon: '🍨', type: 'food', heal: 25, price: 90, desc: "Forty of these went on Mr. 3's bill." },
  p1_nanohana_perfume: { name: 'Nanohana Perfume', icon: '🌺', type: 'treasure', price: 2500, desc: "Nanohana's famous perfume. Overpowering to anyone who isn't used to it." },
};

// =============================================================== trainers
const trainers = {
  p1_sky_knight: {
    name: 'Gan Fall, the Sky Knight', where: 'Angel Island, Skypiea', styles: {}, teaches: ['brawl_tackle'], train: { end: 42, vit: 40, agi: 36 },
    spar: { level: 32, style: 'ittoryu', weapon: 'sword', name: 'Gan Fall' },
    lines: ['Fear not! I am the Sky Knight!', 'Your spirit is as sturdy as a knight\'s lance.'],
  },
  p1_cricket_diver: {
    name: 'Montblanc Cricket', where: 'Jaya', styles: {}, teaches: ['brawl_headbutt'], train: { vit: 40, end: 38 },
    spar: { level: 28, style: 'brawler', name: 'Montblanc Cricket' },
    lines: ["Hold your breath and dive! The sea floor won't come to you!", 'Not bad... for a dreamer.'],
  },
};

// ================================================================== stock
const stock = {
  p1_alabasta_bazaar: ['meat', 'rice_ball', 'fish_stew', 'sake', 'bandage', 'antidote', 'cowboy_hat', 'bandana', 'p1_nanohana_perfume'],
  p1_perfume_stock: ['p1_nanohana_perfume', 'pink_hat', 'red_cloak', 'cowboy_hat'],
  p1_whisky_stock: ['p1_whisky', 'sake', 'meat', 'rice_ball', 'fish_stew'],
  p1_kyuka_cafe: ['p1_ice_cream', 'cola', 'fish_stew', 'rice_ball'],
};

// ============================================================= archetypes
const FUR = (col, extra = {}) => ({ skin: col, fur: col, hairColor: col, hand: col, top: col, hair: 'bald', ...extra });
const archetypes = {
  p1_millions: { name: 'Millions Agent', faction: 'baroque', style: 'ittoryu', weapon: 'sword', look: { top: '#5d4037', bottom: '#3e2723', hat: 'cowboy', hatColor: '#3e2723' }, skill: 0.3, barks: ['Your bounty is ours!', 'For Baroque Works!'] },
  p1_billions: { name: 'Billions Agent', faction: 'baroque', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#212121', bottom: '#212121', hat: 'cowboy', hatColor: '#212121' }, skill: 0.4, moves: ['snipe_explode'], barks: ['Mr. 0 sends his regards.'] },
  p1_bliking: { name: 'Bliking Pirate', faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#455a64', bottom: '#263238', hat: 'beanie', hatColor: '#263238' }, skill: 0.25, barks: ['For King Wapol!'] },
  p1_lapahn: { name: 'Lapahn', faction: 'beast', style: 'brawler', look: FUR('#fafafa', { bottom: '#eeeeee', ears: 'long', furFace: true, muzzle: true, tail: 'fluffy' }), bulk: 1.5, scale: 1.4, hpMul: 1.8, skill: 0.1, moves: ['brawl_tackle'], barks: ['Grrrr!'] },
  p1_bananawani: { name: 'Bananawani', faction: 'beast', style: 'brawler', look: FUR('#7cb342', { bottom: '#558b2f', muzzle: true, tail: 'thin', sharpTeeth: true }), bulk: 1.7, scale: 1.5, hpMul: 2.2, skill: 0.1, moves: ['p1_croc_bite', 'brawl_tackle'] },
  p1_divine_soldier: { name: 'Divine Soldier', faction: 'rival', race: 'skypiean', style: 'brawler', look: { top: '#fafafa', bottom: '#e0e0e0', hat: 'bandana', hatColor: '#fafafa' }, skill: 0.4, moves: ['dial_impact'], barks: ['For God Enel!'] },
  p1_white_beret: { name: 'White Beret', faction: 'civilian', race: 'skypiean', style: 'brawler', look: { top: '#fafafa', bottom: '#fafafa', hat: 'beanie', hatColor: '#fafafa' }, skill: 0.3, lethal: false, barks: ["Heaven's Judgment!", 'Halt, criminal!'] },
  p1_bellamy_pirate: { name: 'Bellamy Pirate', faction: 'pirate', style: 'brawler', look: { top: '#fafafa', bottom: '#1565c0', hat: 'bandana', hatColor: '#fdd835' }, skill: 0.3, barks: ['Hahaha! Dreamers!'] },
  p1_foxy_pirate: { name: 'Foxy Pirate', faction: 'pirate', style: 'brawler', look: { top: '#fafafa', bottom: '#ff7043', hat: 'bandana', hatColor: '#ff7043' }, skill: 0.25, barks: ['Fe fe fe!', 'Oyabin, go!'] },
  p1_giant_insect: { name: 'Giant Jaya Hornet', faction: 'beast', race: 'skypiean', style: 'brawler', look: { top: '#fdd835', bottom: '#212121', skin: '#fdd835', hair: 'bald', ears: 'pointy' }, scale: 0.9, hpMul: 1.1, skill: 0.25, moves: ['p1_insect_sting'] },
  p1_holy: { name: 'Holy', faction: 'beast', style: 'brawler', look: FUR('#fafafa', { bottom: '#eeeeee', ears: 'pointy', muzzle: true, furFace: true, tail: 'fluffy' }), bulk: 1.6, scale: 1.5, hpMul: 2.4, skill: 0.3, moves: ['brawl_tackle', 'brawl_headbutt'], barks: ['WOOF!'] },
};

// ============================================================== abilities
// Signature techniques of this sea's named foes (NPC-only).
const abilities = [
  // Whisky Peak
  { id: 'p1_mr9_bat', name: 'Nine Bat', anim: 'slash', windup: 0.3, recover: 0.35, cd: 4, say: 'Nine Bat!',
    steps: [{ dash: { dist: 4, time: 0.2, hit: { damage: 11, knockback: 4, stun: 0.4 } } }] },
  { id: 'p1_monday_punch', name: 'Brass Knuckle Smash', anim: 'heavy', windup: 0.5, recover: 0.45, cd: 4,
    steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.3, offset: 0.3, damage: 18, knockback: 8, stun: 0.6, heavy: true, guardBreak: true, shake: 0.3 } }] },
  { id: 'p1_kilo_press', name: '10,000-Kilo Press', anim: 'thrust', windup: 0.6, recover: 0.5, cd: 7, say: 'Ten-thousand-kilo press!',
    steps: [{ zone: { range: 1.8, duration: 0.3, interval: 0.3, damage: 24, color: '#fff176', atTarget: true, kind: 'field', status: { root: 0.8 } } }] },
  // Little Garden
  { id: 'p1_candle_service', name: 'Candle Service Set', anim: 'cast', windup: 0.8, recover: 0.4, cd: 16, say: 'Candle Service Set!',
    steps: [{ zone: { range: 3, duration: 4, interval: 0.5, damage: 4, color: '#fff8e1', atTarget: true, kind: 'field', slow: 0.5, status: { root: 0.6 } } }] },
  { id: 'p1_colors_red', name: 'Colors Trap: Bullfight Red', anim: 'shoot', windup: 0.35, recover: 0.3, cd: 6,
    steps: [{ proj: { speed: 16, range: 10, radius: 0.35, damage: 7, sprite: 'petal', color: '#e53935', stun: 0.8 } }] },
  { id: 'p1_colors_blue', name: 'Colors Trap: Tears of Sorrow Blue', anim: 'shoot', windup: 0.45, recover: 0.3, cd: 12,
    steps: [{ proj: { speed: 14, range: 10, radius: 0.4, damage: 4, sprite: 'petal', color: '#1e88e5', status: { despair: 1.5 } } }] },
  // Drum Island
  { id: 'p1_baku_munch', name: 'Baku Baku Munch', anim: 'grab', windup: 0.45, recover: 0.4, cd: 5, say: 'Baku Baku!',
    steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.3, offset: 0.3, damage: 22, knockback: 1, stun: 0.9, guardBreak: true } }, { at: 0.55, heal: 25 }] },
  { id: 'p1_bero_cannon', name: 'Bero Cannon', anim: 'shoot', windup: 0.55, recover: 0.4, cd: 7, say: 'Bero Cannon!',
    steps: [{ proj: { speed: 13, range: 12, radius: 0.5, damage: 10, sprite: 'cannonball', size: 1.4, explode: { range: 2.4, damage: 26 } } }] },
  { id: 'p1_chess_arrows', name: 'Royal Arrows', anim: 'shoot', windup: 0.4, recover: 0.3, cd: 4,
    steps: [{ proj: { speed: 22, range: 13, radius: 0.2, damage: 9, count: 3, spread: 0.2, sprite: 'iceshard', color: '#8d6e63' } }] },
  { id: 'p1_marimo_afro', name: 'Afro Marimo', anim: 'shoot', windup: 0.4, recover: 0.35, cd: 6,
    steps: [{ proj: { speed: 11, range: 9, radius: 0.5, damage: 8, sprite: 'darkorb', color: '#212121', status: { root: 1.2 } } }] },
  // Alabasta
  { id: 'p1_croc_hook', name: 'Poison Hook', anim: 'slash', windup: 0.3, recover: 0.35, cd: 5,
    steps: [{ hit: { shape: 'arc', range: 1.9, arc: 1.2, offset: 0.2, damage: 20, knockback: 3, stun: 0.4, slashing: true, status: { poison: 5 } }, vfx: 'slash', color: '#ffd54f' }] },
  { id: 'p1_desert_girasole', name: 'Desert Girasole', anim: 'grab', windup: 0.7, recover: 0.4, cd: 16, say: 'Desert Girasole!',
    steps: [{ zone: { range: 4, duration: 4, interval: 0.4, damage: 8, element: 'sand', color: '#d7b56d', atTarget: true, kind: 'storm', pull: 3, slow: 0.4 } }] },
  { id: 'p1_atomic_spurt', name: 'Atomic Spurt', anim: 'thrust', windup: 0.35, recover: 0.4, cd: 7, say: 'Atomic Spurt.',
    steps: [{ dash: { dist: 9, time: 0.3, iframes: 0.15, hit: { damage: 30, knockback: 6, stun: 0.5, slashing: true } } }] },
  { id: 'p1_toge_spike', name: 'Sting Bump', anim: 'thrust', windup: 0.3, recover: 0.3, cd: 3.5,
    steps: [{ hit: { shape: 'line', range: 3.2, width: 0.6, damage: 18, knockback: 3, stun: 0.3, status: { bleed: 3 } }, vfx: 'beam', color: '#bdbdbd' }] },
  { id: 'p1_toge_urchin', name: 'Spider Urchin', anim: 'cast', windup: 0.45, recover: 0.4, cd: 9, say: 'Spider Urchin!',
    steps: [{ hit: { shape: 'circle', range: 2.4, damage: 24, knockback: 6, stun: 0.5, status: { bleed: 4 } }, vfx: 'ring', color: '#9e9e9e' }] },
  { id: 'p1_mr4_bat', name: '4-Ton Bat', anim: 'heavy', windup: 0.9, recover: 0.6, cd: 5,
    steps: [{ hit: { shape: 'arc', range: 2.4, arc: 1.4, offset: 0.3, damage: 30, knockback: 10, stun: 0.8, heavy: true, guardBreak: true, shake: 0.5 } }] },
  { id: 'p1_lassoo_bomb', name: "Lassoo's Sneeze", anim: 'shoot', windup: 0.6, recover: 0.4, cd: 7,
    steps: [{ proj: { speed: 9, range: 11, radius: 0.45, damage: 6, sprite: 'bomb', explode: { range: 2.4, damage: 28 } } }] },
  { id: 'p1_mogu_rush', name: 'Mogura Banana', anim: 'thrust', windup: 0.4, recover: 0.4, cd: 6, say: 'Mogura Banana!',
    steps: [{ dash: { dist: 8, time: 0.35, iframes: 0.3, hit: { damage: 20, knockback: 7, stun: 0.6, heavy: true } } }] },
  { id: 'p1_croc_bite', name: 'Bananawani Bite', anim: 'grab', windup: 0.45, recover: 0.4, cd: 4,
    steps: [{ hit: { shape: 'arc', range: 1.9, arc: 1.2, offset: 0.3, damage: 20, knockback: 2, stun: 0.6 } }] },
  // Ruluka
  { id: 'p1_wetton_tax', name: 'Tax Collection', anim: 'slash', windup: 0.35, recover: 0.35, cd: 4, say: "That'll cost you!",
    steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.4, offset: 0.2, damage: 14, knockback: 4, stun: 0.4 } }] },
  // Jaya
  { id: 'p1_spring_hopper', name: 'Spring Hopper', anim: 'thrust', windup: 0.25, recover: 0.3, cd: 5, say: 'Spring Hopper!',
    steps: [0, 0.22, 0.44].map((t, i) => ({ at: 0.25 + t, angleOffset: (i - 1) * 0.5, dash: { dist: 5, time: 0.18, hit: { damage: 11, knockback: 4, stun: 0.3 } } })) },
  { id: 'p1_spring_snipe', name: 'Spring Sniper', anim: 'thrust', windup: 0.6, recover: 0.5, cd: 9, say: 'Spring... SNIPER!',
    steps: [{ dash: { dist: 11, time: 0.3, iframes: 0.2, hit: { damage: 34, knockback: 9, stun: 0.7, heavy: true, guardBreak: true } } }] },
  { id: 'p1_big_knife', name: 'Big Knife', anim: 'slash', windup: 0.35, recover: 0.35, cd: 4,
    steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.8, offset: 0.2, damage: 18, knockback: 3, stun: 0.3, slashing: true, status: { bleed: 3 } }, vfx: 'slash' }] },
  { id: 'p1_insect_sting', name: 'Giant Sting', anim: 'thrust', windup: 0.3, recover: 0.35, cd: 4,
    steps: [{ hit: { shape: 'line', range: 2, width: 0.5, damage: 12, knockback: 2, stun: 0.3, status: { poison: 3 } } }] },
  // Skypiea
  { id: 'p1_surprise_balls', name: 'Surprise Balls', anim: 'shoot', windup: 0.35, recover: 0.3, cd: 5, say: 'Surprise!',
    steps: [{ proj: { speed: 10, range: 11, radius: 0.45, damage: 6, count: 3, spread: 0.6, sprite: 'lightorb', color: '#e1f5fe', explode: { range: 1.8, damage: 16 } } }] },
  { id: 'p1_heat_javelin', name: 'Heat Javelin', anim: 'thrust', windup: 0.35, recover: 0.35, cd: 4,
    steps: [{ hit: { shape: 'line', range: 3.6, width: 0.7, damage: 20, knockback: 4, stun: 0.3, element: 'fire', status: { burn: 3 } }, vfx: 'beam', color: '#ff7043' }] },
  { id: 'p1_fuza_flame', name: "Fuza's Flame Dial", anim: 'cast', windup: 0.5, recover: 0.4, cd: 8,
    steps: [{ hit: { shape: 'arc', range: 4, arc: 0.9, offset: 0.3, damage: 10, knockback: 2, stun: 0.2, element: 'fire', status: { burn: 3 }, duration: 0.6, interval: 0.2 }, vfx: 'ring', color: '#ff7043' }] },
  { id: 'p1_jet_punch', name: 'Jet Punch', anim: 'punch', windup: 0.5, recover: 0.4, cd: 4, say: 'Jet Punch!',
    steps: [{ proj: { speed: 26, range: 9, radius: 0.4, damage: 22, sprite: 'shockwave', color: '#e0f7fa', knockback: 7, stun: 0.5 } }] },
  { id: 'p1_swamp_cloud', name: 'Swamp Cloud', anim: 'cast', windup: 0.6, recover: 0.4, cd: 12,
    steps: [{ zone: { range: 3, duration: 5, interval: 0.5, damage: 3, color: '#8d6e63', atTarget: true, kind: 'field', slow: 0.6, status: { root: 0.5 } } }] },
  { id: 'p1_eisen_whip', name: 'Eisen Whip', anim: 'slash', windup: 0.4, recover: 0.35, cd: 4, say: 'Eisen Whip.',
    steps: [{ hit: { shape: 'line', range: 7, width: 0.8, damage: 22, knockback: 3, stun: 0.3, slashing: true }, vfx: 'beam', color: '#b0bec5' }] },
  { id: 'p1_iron_cloud', name: 'Iron Cloud: Barbed Wire', anim: 'cast', windup: 0.7, recover: 0.4, cd: 14,
    steps: [{ zone: { range: 3.4, duration: 4, interval: 0.5, damage: 7, color: '#90a4ae', atTarget: true, kind: 'field', slow: 0.5, status: { bleed: 2 } } }] },
  { id: 'p1_yama_axe', name: 'Mountain Crush', anim: 'heavy', windup: 0.8, recover: 0.6, cd: 6, say: 'Mountain Crush!',
    steps: [{ zone: { range: 2.4, duration: 0.3, interval: 0.3, damage: 30, color: '#eceff1', atTarget: true, kind: 'field', status: { bleed: 2 } } }] },
  { id: 'p1_burn_bazooka', name: 'Burn Bazooka', anim: 'shoot', windup: 0.6, recover: 0.5, cd: 6, say: 'Burn Bazooka!',
    steps: [{ hit: { shape: 'line', range: 8, width: 1.4, damage: 28, knockback: 6, stun: 0.4, element: 'fire', status: { burn: 3 }, heavy: true }, vfx: 'beam', color: '#81d4fa' }] },
  // Long Ring Long Land
  { id: 'p1_gorilla_puncher', name: 'Gorilla Puncher 13', anim: 'punch', windup: 0.7, recover: 0.5, cd: 7, say: 'Gorilla Puncher 13!',
    steps: [{ proj: { speed: 20, range: 8, radius: 0.5, damage: 22, sprite: 'gomufist', color: '#8d6e63', knockback: 8, stun: 0.5 } }] },
  { id: 'p1_monster_rush', name: 'Groggy Monster Rush', anim: 'thrust', windup: 0.4, recover: 0.4, cd: 5,
    steps: [{ dash: { dist: 7, time: 0.3, hit: { damage: 18, knockback: 7, stun: 0.5 } } }] },
  { id: 'p1_pan_slam', name: 'Big Pan Slam', anim: 'heavy', windup: 0.8, recover: 0.6, cd: 5,
    steps: [{ hit: { shape: 'circle', range: 2.6, damage: 24, knockback: 8, stun: 0.7, heavy: true, shake: 0.4 }, vfx: 'ring', color: '#8d6e63' }] },
];

// ============================================================ Laboon
/** Laboon, drawn as a world object floating in the bay (tile units, anchor = whale centre). */
function drawWhale(g, env, marked) {
  const t = env?.time || 0;
  const TAU = Math.PI * 2;
  g.save();
  g.translate(0, Math.sin(t * 0.7) * 0.12);
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.beginPath(); g.ellipse(0, 0.9, 11.5, 2.4, 0, 0, TAU); g.fill();
  // tail fluke (east), body, belly
  g.fillStyle = '#4e6177';
  g.beginPath(); g.moveTo(9, -0.8); g.lineTo(12.6, -2.8); g.lineTo(11.7, -0.8); g.lineTo(12.6, 1.1); g.closePath(); g.fill();
  g.fillStyle = '#5d7389';
  g.beginPath(); g.ellipse(0, -1.4, 10, 3.4, 0, 0, TAU); g.fill();
  g.fillStyle = '#d7e1ea';
  g.beginPath(); g.ellipse(-1, 0.6, 8.5, 1.5, 0, 0, Math.PI); g.fill();
  // fifty years of scars on the forehead (west, facing the Red Line)
  g.strokeStyle = 'rgba(255,235,238,0.75)'; g.lineWidth = 0.18;
  for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-9.6 + k * 0.35, -3.6 + k * 0.4); g.lineTo(-8.2 + k * 0.3, -2.2 + k * 0.5); g.stroke(); }
  // eye
  g.fillStyle = '#fafafa'; g.beginPath(); g.arc(-6.6, -1.8, 0.45, 0, TAU); g.fill();
  g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(-6.7, -1.8, 0.24, 0, TAU); g.fill();
  if (marked) {
    // the Jolly Roger you painted over his scars
    g.fillStyle = '#fafafa'; g.beginPath(); g.arc(-8.2, -3.1, 0.8, 0, TAU); g.fill();
    g.strokeStyle = '#fafafa'; g.lineWidth = 0.25;
    g.beginPath(); g.moveTo(-9.3, -2.0); g.lineTo(-7.1, -4.2); g.moveTo(-9.3, -4.2); g.lineTo(-7.1, -2.0); g.stroke();
    g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(-8.45, -3.2, 0.16, 0, TAU); g.arc(-7.95, -3.2, 0.16, 0, TAU); g.fill();
  }
  // a spout every fourteen seconds
  const ph = t % 14;
  if (ph < 1.6) {
    const h = Math.sin((ph / 1.6) * Math.PI) * 3.2;
    g.fillStyle = 'rgba(225,245,254,0.8)';
    g.beginPath(); g.ellipse(-3, -4.8 - h / 2, 0.5 + h * 0.2, h / 2 + 0.2, 0, 0, TAU); g.fill();
  }
  g.font = 'bold 0.5px Nunito, sans-serif'; g.textAlign = 'center';
  g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 0.08;
  g.strokeText('Laboon', 0, -5.6); g.fillText('Laboon', 0, -5.6);
  g.restore();
}

const laboonDialogue = (ctx) => ({
  start: 'a',
  nodes: {
    a: {
      speaker: 'Laboon',
      text: () => {
        if (ctx.flag('p1_laboonPromise')) return `(Laboon floats calmly in the bay. ${ctx.flag('p1_laboonMark') ? 'Your Jolly Roger is still on his forehead. ' : ''}When he sees you, he hums a low, happy note that makes the water tremble.)`;
        if (act(ctx, 'p1_laboon_promise', 'promise')) return `(The island whale Laboon floats before you. His forehead is a mass of scars from fifty years of ramming the Red Line. One enormous, wet eye watches you.)`;
        return `(A whale as big as a mountain rams his scarred head against the Red Line — BOOM. Then again. Then again. The lighthouse keeper might know why.)`;
      },
      choices: [
        { text: 'Promise to come back and fight him again.', if: () => act(ctx, 'p1_laboon_promise', 'promise'), next: 'vow' },
        { text: 'Paint your Jolly Roger over his scars.', if: () => act(ctx, 'p1_laboon_promise', 'promise'), next: 'paint' },
        { text: 'Watch him for a while.', end: true },
      ],
    },
    vow: { speaker: 'Laboon', text: `"Your friends aren't coming back — but I will. When I've sailed around the Grand Line, we'll finish this fight. Until then, stop smashing your head!" (Laboon's cry shakes both capes.)`, onEnter: (c) => { c.setFlag('p1_laboonPromise'); c.emit('questEvent', 'p1_laboon_promise'); } },
    paint: { speaker: 'Laboon', text: `(You climb onto his forehead with a bucket of paint and draw your Jolly Roger across the scars.) "That's our mark. If you smash your head, you'll smudge it. Wait for me!" (Laboon cries — but not in pain.)`, onEnter: (c) => { c.setFlag('p1_laboonPromise'); c.setFlag('p1_laboonMark'); c.emit('questEvent', 'p1_laboon_promise'); } },
  },
});

// ================================================================ install
function install(game) {
  const C = () => game.state?.char;
  const onSurface = () => game.world === game.surface;
  const surfIsland = (id) => game.surface?.islands?.find((i) => i.id === id) || null;

  // ---- Laboon: right where the torrent comes down off Reverse Mountain,
  // his scarred forehead to the Red Line (a whale the size of a hill: seen
  // from far off, and solid — ships go round him)
  const placeLaboon = () => {
    const w = game.surface, M = w?.reverseMountain;
    if (!w?.objects || w._p1Laboon || !M?.exit) return;
    w._p1Laboon = true;
    const ax = M.exit.x + 68, ay = M.exit.y - 47;
    w._p1LaboonAt = { x: ax, y: ay };
    w.objects.add({ kind: 'p1_laboon', x: ax, y: ay, block: false, far: 1500, draw(g, env) { try { drawWhale(g, env, !!game.state?.char?.flags?.p1_laboonMark); } catch (e) { /* never break the frame */ } } });
    for (let j = -23; j <= 23; j++) {
      for (let i = -60; i <= 62; i++) {
        if ((i / 60) ** 2 + (j / 22.5) ** 2 < 1 && w.isLiquid(ax + i, ay + j)) w.setBlocked(ax + i, ay + j, 1);
      }
    }
    // (talk to him from the water or a deck on his southern side, by the torrent)
    w.objects.add({ kind: 'p1_laboon_talk', x: ax - 4, y: ay + 25, block: false, interact: 'Speak to Laboon', interactRange: 26, use: 'p1_laboon', draw() {} });
  };
  game.on('characterStart', placeLaboon);
  placeLaboon();
  game.on('useObject', (o) => { if (o?.use === 'p1_laboon') game.dialogue?.open(null, laboonDialogue); });

  // ---- quest items lying in the world
  game.spawner.addBuilder(({ island }) => {
    if (!C()) return;
    if (island.id === 'foolshout_island' && stg(game, 'p1_foolshout_sun') === 'flag') ensureGroundItem(game, 'foolshout_island', 'sun_anchorage', 'p1_sun_flag', "the Sun Pirates' flag");
    if (island.id === 'jaya' && stg(game, 'p1_golden_city') === 'bird') ensureGroundItem(game, 'jaya', 'south_bird_woods', 'south_bird', 'a South Bird (its head points south)');
  });

  // ---- arrivals
  game.on('enterIsland', (isl) => {
    const c = C();
    if (!c || !isl) return;
    if (isl.id === 'navarone' && pirate(c) && !c.flags.p1_g8Escaped && !game.quests.state('p1_g8_escape')) {
      game.quests.start('p1_g8_escape');
      banner(game, 'NAVARONE', 'Marine Base G-8', '"Pirate spotted inside the base! Seal the gate!" Alarms ring across the Hedgehog.', 5);
    }
    if (isl.id === 'nanimonai_island' && !c.flags.p1_nanimonaiSeen) {
      c.flags.p1_nanimonaiSeen = true;
      banner(game, 'NANIMONAI ISLAND', '"The Island of Nothing"', 'There is nothing here. The ground is soft, brown and warm... Something enormous left it behind.', 6);
    }
    if (isl.id === 'little_garden' && !c.flags.p1_lgSeen) {
      c.flags.p1_lgSeen = true;
      banner(game, 'LITTLE GARDEN', 'Prehistoric island', 'The volcano erupts — and somewhere in the jungle, two giants roar and charge at each other.', 6);
    }
  });
  game.on('enterZone', (id) => {
    const c = C();
    if (!c || id !== 'skypiea') return;
    game.emit('questEvent', 'p1_reached_sky');
    if (!game.quests.state('p1_skypiea_god')) game.quests.start('p1_skypiea_god');
  });

  // ---- scripted moments
  let sakuraT = 0;
  game.on('p1Sakura', () => {
    sakuraT = 14;
    banner(game, "HIRILUK'S SAKURA", 'Drum Island', 'Pink snow falls over the whole country. Somewhere, an old quack doctor is smiling.', 6);
  });
  game.on('questStage', (id, st) => {
    if (id === 'p1_alabasta' && st === 'report') {
      if (game.env) { game.env.stormTarget = 0.8; game.env.storm = Math.max(game.env.storm || 0, 0.3); }
      banner(game, 'RAIN', 'Alabasta', 'For the first time in three years, rain falls on Alabasta. The fighting in the square stops. Everyone looks up.', 6);
    }
  });
  game.on('questDone', (id) => {
    const c = C();
    if (id === 'p1_little_garden' && c && count(c, 'eternal_pose_alabasta')) {
      try { useItem(game, 'eternal_pose_alabasta'); } catch (e) { /* the pose can also be put in the Log Pose slot from the inventory */ }
      game.log('The Eternal Pose is in your Log Pose slot, pointing to Alabasta. (Put your Log Pose back in the slot, in the Inventory, to follow it instead.)', '#81d4fa');
    }
  });

  let tt = 0, ramT = 20;
  game.on('tick', (dt) => {
    const c = C(), p = game.player;
    if (!c || !p) return;
    // Soaked in Toto's water (or standing in Alabasta's river): your blows can hit sand.
    if (p.buffs?.some((b) => b.id === 'p1_soaked')) p.addStatus?.('wet', 1.5);
    else if (onSurface() && p.inWater && game.currentIsland?.id === 'alabasta') p.addStatus?.('wet', 12);
    // Hiriluk's pink snow
    if (sakuraT > 0) {
      sakuraT -= dt;
      if (Math.random() < dt * 10) game.fx?.burst?.(p.x + (Math.random() - 0.5) * 18, p.y - 5 + Math.random() * 4, 3, { color: ['#f8bbd0', '#f48fb1', '#fce4ec'], speed: 1, vz: 0.5, g: 1.5, life: 2.2, size: 0.14 });
    }
    if ((tt -= dt) > 0) return;
    tt = 0.5;
    if (!onSurface()) return;
    // Laboon rams the Red Line until someone gives him a new promise (in time
    // with his model: every 26 seconds, the blow lands 1.6 s in)
    const lb = game.surface?._p1LaboonAt;
    const ph = game.env.time % 26;
    if (lb && !c.flags.p1_laboonPromise && ph >= 1.6 && ramT < 1.6 && game.world.distance(p.x, p.y, lb.x, lb.y) < 320) {
      const near = game.world.distance(p.x, p.y, lb.x, lb.y) < 140;
      game.fx?.shake?.(near ? 0.45 : 0.2);
      game.audio?.sfx?.('explosion');
      if (!(c.flags.p1_laboonBoomSeen > 2)) { c.flags.p1_laboonBoomSeen = (c.flags.p1_laboonBoomSeen || 0) + 1; game.log('BOOM... BOOM... Laboon rams his scarred head against the Red Line.', '#b0bec5'); }
    }
    ramT = ph;
    // The Whirlpool Lord surfaces when you sail into the Kenzan whirlpools.
    if (stg(game, 'p1_kenzan_whirlpool') === 'hunt' && !findActor(game, 'p1_whirlpool_lord')) {
      const s = surfIsland('kenzan_island')?.spots?.whirlpool;
      if (s && game.world.distance(p.x, p.y, s.x, s.y) < 28 && game.world.isLiquid(s.x, s.y)) {
        seaBoss(game, { id: 'p1_whirlpool_lord', name: 'Whirlpool Lord', title: 'Sea King of the Kenzan Maelstrom', level: 23, hpMul: 3.4, color: '#00838f', breakthrough: 2 }, s.x, s.y);
        banner(game, 'THE WHIRLPOOL LORD', 'Sea King', 'The whirlpool spins faster — and something vast rises out of its eye.', 4);
      }
    }
    // Leaving Little Garden: the Island Eater, and the giants' Hakoku.
    if (c.flags.p1_islandEaterPending && p.mode === 'sail') {
      const lg = surfIsland('little_garden');
      const d = lg ? game.world.distance(p.x, p.y, lg.x, lg.y) : 999;
      if (d > 64 && d < 130) {
        c.flags.p1_islandEaterPending = false;
        const ang = p.ship?.heading ?? p.facing ?? 0;
        const x = p.x + Math.cos(ang) * 10, y = p.y + Math.sin(ang) * 10;
        if (game.world.isLiquid(x, y)) {
          const k = seaBoss(game, { id: 'p1_island_eater', name: 'Island Eater', title: 'Giant goldfish of Little Garden', level: 30, hpMul: 6, color: '#ff9800' }, x, y);
          banner(game, 'THE ISLAND EATER', 'Giant goldfish', 'A mouth big enough to swallow an island opens right in front of your bow!', 3);
          setTimeout(() => {
            if (!k?.alive) return;
            banner(game, 'HAKOKU!', 'Dorry & Brogy', 'From the shore of Little Garden, two giants thrust sword and axe — and the sea splits in two.', 5);
            game.fx?.shake?.(1);
            game.fx?.burst?.(k.x, k.y, 60, { color: ['#ffe082', '#ffffff'], speed: 9, vz: 6, g: 5, life: 1.2 });
            k.alive = false;
            if (game.bossTarget === k) game.bossTarget = null;
          }, 5000);
        }
      }
    }
  });
}

// where the events that finish quest steps happen (for their waypoints)
const places = {
  'rang_bell:golden_bell': { island: 'upper_yard', spot: 'golden_bell', place: 'The Golden Bell of Shandora' },
};

export default {
  id: 'paradise1', npcs, groups, quests, places, items, trainers, stock, archetypes, abilities, install,
  dynamicIds: ['p1_billions_agent', 'p1_whirlpool_lord', 'p1_island_eater'],
};



