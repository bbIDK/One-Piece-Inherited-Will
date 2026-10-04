// East Blue content pack: the canon arcs of the "weakest sea".
import './bossMoves.js';
import { spawnNow, findActor, aggro, seaBoss, despawn } from './helpers.js';
import { makeEnemy } from '../game/npcs.js';
import { addItem, count } from '../game/inventory.js';
import { persist } from '../game/lineage.js';

const C = (id) => (ctx) => ctx.quest(id);
const active = (ctx, id, stage) => ctx.game.quests.stageId(id) === stage;
const done = (ctx, id) => ctx.game.quests.isDone(id);

// ------------------------------------------------------------------ NPCs
const npcs = [
  // ---------------------------------------------------------- Dawn Island
  {
    id: 'makino', name: 'Makino', title: "Owner of Party's Bar", island: 'dawn_island', at: { town: 'foosha', building: "Party's Bar" },
    look: { hair: 'long', hairColor: '#2d2d2d', top: '#43a047', bottom: '#fafafa', skin: '#f9dcc4', hat: 'bandana', hatColor: '#fafafa' }, level: 3,
    marker: (c, g) => (!g.quests.state('lord_of_the_coast') ? '!' : g.quests.stageId('lord_of_the_coast') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => done(ctx, 'lord_of_the_coast') ? '"The whole village is talking about you! That hat suits you, by the way."' : '"Welcome to Party\'s Bar! You look like someone about to set out to sea... The last pirates who drank here were the Red Hair Pirates. Their captain, Shanks, lost his arm to the Lord of the Coast out in the bay."',
          choices: [
            { text: 'Tell me about the Lord of the Coast.', if: () => !ctx.quest('lord_of_the_coast'), next: 'lotc' },
            { text: 'I killed the Lord of the Coast.', if: () => active(ctx, 'lord_of_the_coast', 'report'), next: 'reward' },
            { text: 'I\'ll have something to eat.', do: (c) => c.open('shop', { shop: 'tavern', building: { name: "Party's Bar", role: 'bar' } }) },
            { text: 'Any news from the sea?', next: 'news' },
            { text: 'See you, Makino.', end: true },
          ],
        },
        lotc: { text: '"It\'s a Sea King that lives near the coast. It\'s been attacking fishing boats again... Shanks let it take his arm to save a boy from this village. If someone could finally drive it off... Please be careful. It surfaces just south of the pier."', choices: [{ text: 'I\'ll deal with it.', do: (c) => { c.startQuest('lord_of_the_coast'); }, end: true }, { text: 'Maybe later.', end: true }] },
        reward: { text: '"You actually did it?! ...Shanks left this hat here the day he sailed. He said to give it to the next person who dared to chase a dream bigger than the sea. I think that\'s you."', do: null, onEnter: (c) => { c.complete('lord_of_the_coast'); }, next: 'a' },
        news: { text: () => ctx.game.fruitRumor?.(new (class { constructor() { this.v = Math.random(); } next() { return Math.random(); } pick(a) { return a[Math.floor(Math.random() * a.length)]; } chance(p) { return Math.random() < p; } })()) || '"They say the Marines are watching Loguetown closely these days. Every rookie pirate passes through there on the way to the Grand Line."', next: 'a' },
      },
    }),
  },
  {
    id: 'woop_slap', name: 'Woop Slap', title: 'Mayor of Foosha Village', island: 'dawn_island', at: { town: 'foosha', building: "Mayor Woop Slap's House" },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#8d6e63', bottom: '#5d4037', hat: 'cowboy', hatColor: '#6d4c41' }, level: 3,
    marker: (c, g) => (!g.quests.state('higuma_bandits') ? '!' : g.quests.stageId('higuma_bandits') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => ctx.char.bounty ? '"A PIRATE?! Out of my village! Pirates are nothing but scoundrels!"' : '"Hmph. Another youngster with salt in their eyes. Don\'t you dare become a pirate, you hear me?"',
          choices: [
            { text: 'Is something troubling the village?', if: () => !ctx.quest('higuma_bandits'), next: 'bandits' },
            { text: 'Higuma won\'t bother you again.', if: () => active(ctx, 'higuma_bandits', 'report'), next: 'thanks' },
            { text: 'Goodbye, mayor.', end: true },
          ],
        },
        bandits: { text: '"Higuma and his mountain bandits come down from Mt. Colubo and help themselves to Makino\'s bar! They camp by the road on the mountain\'s south side. If only someone would teach them a lesson..."', choices: [{ text: 'I\'ll teach them.', do: (c) => c.startQuest('higuma_bandits'), end: true }, { text: 'Not my problem.', end: true }] },
        thanks: { text: '"Higuma, beaten? ...Hmph. Well. Thank you. Here — the village took up a collection. Just promise me you won\'t turn pirate."', onEnter: (c) => c.complete('higuma_bandits') },
      },
    }),
  },
  {
    id: 'higuma', name: 'Higuma', title: 'Mountain Bandit Boss', island: 'dawn_island', at: { dx: -0.25, dy: 0.12 }, hostile: true, boss: true, hpMul: 0.7,
    look: { hair: 'short', hairColor: '#3e2723', top: '#8d6e63', bottom: '#4e342e', hat: 'bandana', hatColor: '#795548', scarEye: true }, level: 6, style: 'ittoryu', weapon: 'sword',
    faction: 'bandit', skill: 0.25, alert: 'Heh. Another brat who wants to play hero?', bounty: 8000000, infamy: true, breakthrough: 2,
    when: (c) => !c.bosses.includes('higuma'),
  },
  {
    id: 'dadan', name: 'Curly Dadan', title: 'Mountain Bandit Chief of Mt. Colubo', island: 'dawn_island', at: { spot: 'dadan_hideout' },
    look: { hair: 'curly', hairColor: '#e65100', top: '#6d4c41', bottom: '#3e2723', skin: '#e0ac7e', bulk: 1.3 }, level: 8, bulk: 1.3, trainer: 'dadan',
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: { text: '"WHAT?! Who let you up the mountain? ...Fine. If you want to survive the sea, you survive the mountain first. Wolves, bears, crocodiles in the rivers. I\'ll train you — for a price, brat."', choices: [
          { text: 'Train with the Dadan Family', do: (c) => c.open('trainer', { trainer: 'dadan' }) },
          { text: 'Leave', end: true },
        ] },
      },
    }),
  },
  {
    id: 'bluejam', name: 'Bluejam', title: 'Pirate Captain of the Gray Terminal', island: 'dawn_island', at: { dx: 0.42, dy: 0.35 }, hostile: true, boss: true, hpMul: 0.65,
    look: { hair: 'spiky', hairColor: '#1a237e', top: '#1565c0', bottom: '#263238', hat: 'tricorne', hatColor: '#0d47a1' }, level: 8, style: 'sniper', weapon: 'gun', ranged: true,
    // (Dawn Island's second fight, and the first gunman: his shots sting rather than maim)
    faction: 'pirate', moves: ['snipe_explode'], skill: 0.3, dmgMul: 1.25, alert: 'Garbage belongs in the Gray Terminal. So do you.', bounty: 12000000, infamy: true, breakthrough: 2,
    when: (c) => !c.bosses.includes('bluejam'),
  },
  {
    id: 'gray_kid', name: 'Gray Terminal Kid', title: 'Scavenger', island: 'dawn_island', at: { dx: 0.35, dy: 0.28 },
    look: { hair: 'spiky', hairColor: '#212121', top: '#5d4037', bottom: '#3e2723' }, level: 2,
    marker: (c, g) => (!g.quests.state('gray_terminal') ? '!' : g.quests.stageId('gray_terminal') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a', nodes: {
        a: { text: () => active(ctx, 'gray_terminal', 'report') ? '"Bluejam\'s gone! The nobles can\'t use him to burn us out anymore. Here — I found this in the junk. Take it!"' : '"The nobles of Goa call this place a stain. I heard they paid Bluejam\'s pirates to set the whole Gray Terminal on fire before the Celestial Dragon visits..."',
          onEnter: (c) => { if (active(c, 'gray_terminal', 'report')) c.complete('gray_terminal'); },
          choices: [{ text: 'I\'ll stop Bluejam.', if: () => !ctx.quest('gray_terminal'), do: (c) => c.startQuest('gray_terminal'), end: true }, { text: 'Take care.', end: true }] },
      },
    }),
  },

  // ---------------------------------------------------------- Goat Island
  {
    id: 'alvida', name: '"Iron Mace" Alvida', title: 'Captain of the Alvida Pirates', island: 'goat_island', at: { dx: 0, dy: 0 }, hostile: true, boss: true, hpMul: 0.8,
    look: { hair: 'curly', hairColor: '#212121', top: '#e91e63', bottom: '#880e4f', skin: '#f1c9a0', bulk: 1.5, hat: 'cowboy', hatColor: '#212121' }, bulk: 1.5, level: 6,
    moves: ['alvida_mace'], faction: 'pirate', alert: 'Who is the most beautiful woman on all the seas?!', bounty: 5000000, infamy: true, breakthrough: 2,
    when: (c) => !c.bosses.includes('alvida'),
  },
  {
    id: 'koby', name: 'Koby', title: 'Cabin boy of the Alvida Pirates', island: 'goat_island', at: { dx: 0.2, dy: 0.25 },
    look: { hair: 'short', hairColor: '#f48fb1', top: '#ffffff', bottom: '#1565c0', hat: 'goggles' }, level: 2,
    marker: (c, g) => (!g.quests.state('koby_dream') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a', nodes: {
        a: { text: () => ctx.char.bosses.includes('alvida') ? '"You beat Alvida-sama?! Then... then I can finally do it. Please, take me to Shells Town! I want to join the Marines and become an Admiral!"' : '"I-I\'ve been Alvida\'s cabin boy for two years... I only wanted to go fishing. My real dream is to join the Marines. But she\'ll kill me if I leave!"',
          choices: [
            { text: 'Then let\'s get you out of here.', if: () => !ctx.quest('koby_dream'), do: (c) => c.startQuest('koby_dream'), end: true },
            { text: 'Come with me to Shells Town.', if: () => active(ctx, 'koby_dream', 'escort') && ctx.char.bosses.includes('alvida'), do: (c) => { c.setFlag('kobyAboard'); c.log('Koby hops into your boat. Sail to Shells Town (Yotsuba Island).', '#90caf9'); }, end: true },
            { text: 'Chin up, Koby.', end: true },
          ] },
      },
    }),
    when: (c) => !c.flags.kobyAboard && !c.flags.kobyMarine,
  },

  // ---------------------------------------------------------- Shells Town
  {
    id: 'ririka', name: 'Rika', title: "Rika's Family Restaurant", island: 'shells_island', at: { town: 'shells_town', building: "Rika's Family Restaurant" },
    look: { hair: 'ponytail', hairColor: '#6d4c41', top: '#ffcdd2', bottom: '#c62828', skin: '#f9dcc4', scale: 0.8 }, level: 1,
    marker: (c, g) => (!g.quests.state('pirate_hunter') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a', nodes: {
        a: { text: () => done(ctx, 'pirate_hunter') ? '"Mister Pirate Hunter says thank you! And so does the whole town — Captain Morgan is gone!"' : '"Mister... there\'s a man tied up in the Marine base yard. The pirate hunter. He hasn\'t eaten in nine days! He only got caught because he stopped Helmeppo\'s wolf from hurting me... I made him rice balls. Could you bring them to him? I\'m scared of the guards."',
          choices: [
            { text: 'Give me the rice balls.', if: () => !ctx.quest('pirate_hunter'), do: (c) => { c.startQuest('pirate_hunter'); c.give('rice_ball', 1); }, end: true },
            { text: 'Something to eat, please.', do: (c) => c.open('shop', { shop: 'tavern', building: { name: "Rika's Family Restaurant", role: 'restaurant' } }) },
            { text: 'Bye, Rika.', end: true },
          ] },
      },
    }),
  },
  {
    id: 'zoro_tied', name: 'Roronoa Zoro', title: 'Pirate Hunter (tied up)', island: 'shells_island', at: { spot: 'execution_yard' },
    look: { hair: 'buzz', hairColor: '#43a047', top: '#fafafa', bottom: '#212121', belt: '#2e7d32', swords: 0, hat: 'headband', hatColor: '#212121' }, level: 20, ai: 'idle',
    marker: (c, g) => (g.quests.stageId('pirate_hunter') === 'deliver' || g.quests.stageId('pirate_hunter') === 'free' ? '?' : null),
    when: (c) => !c.flags.zoroLeft,
    dialogue: (ctx) => ({
      start: 'a', nodes: {
        a: {
          text: () => {
            if (done(ctx, 'pirate_hunter')) return '"Hah. You\'re not bad. I made a promise to a friend that I\'d become the world\'s greatest swordsman. If our paths cross on the Grand Line... don\'t hold back."';
            if (active(ctx, 'pirate_hunter', 'free')) return '"Morgan\'s kid Helmeppo is the one who promised to let me go after a month. He lied. If you want to do something useful, knock that idiot down — then his father."';
            return '"...What do you want? Leave. I\'m going to survive this month tied up, and then they let me go. That\'s the deal."';
          },
          choices: [
            { text: 'Rika made you rice balls.', if: () => active(ctx, 'pirate_hunter', 'deliver') && ctx.has('rice_ball'), do: (c) => { c.take('rice_ball', 1); c.stage('pirate_hunter', 'free'); }, next: 'eat' },
            { text: 'Morgan is finished. You\'re free.', if: () => active(ctx, 'pirate_hunter', 'zoro'), next: 'freed' },
            { text: 'Leave', end: true },
          ],
        },
        eat: { text: '(He eats it in one bite, sugar-for-salt and all.) "...Tell the kid it was delicious. Every last grain."', next: 'a' },
        freed: { text: '(You cut the ropes. He rolls his shoulders, picks up his three swords, and grins.) "Heh. So Axe-Hand went down. ...I owe you one. I don\'t forget debts."', onEnter: (c) => { if (active(c, 'pirate_hunter', 'zoro')) c.complete('pirate_hunter'); }, next: 'a' },
      },
    }),
  },
  {
    id: 'helmeppo', name: 'Helmeppo', title: "Captain Morgan's son", island: 'shells_island', at: { town: 'shells_town', plaza: true, ox: -3 }, hostile: false, named: true,
    look: { hair: 'short', hairColor: '#fff176', top: '#8e24aa', bottom: '#4a148c' }, level: 3, faction: 'marine',
    alert: 'Do you know who my FATHER is?!',
    when: (c) => !c.defeated.helmeppo,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: '"Hey you! Bow down! My father is CAPTAIN MORGAN! I can have you executed like THAT!"', choices: [
      { text: 'Punch him.', if: () => active(ctx, 'pirate_hunter', 'free'), do: (c) => { const a = findActor(c.game, 'helmeppo'); aggro(c.game, a); }, end: true },
      { text: 'Walk away.', end: true }] } } }),
  },
  {
    id: 'morgan', name: '"Axe-Hand" Morgan', title: 'Captain, 153rd Marine Branch', island: 'shells_island', at: { town: 'marine_153', building: '153rd Branch HQ' }, boss: true, hpMul: 1.1,
    look: { hair: 'buzz', hairColor: '#795548', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE', skin: '#e0ac7e', bulk: 1.4, hand: '#90a4ae' }, bulk: 1.35, level: 10,
    style: 'brawler', moves: ['morgan_axe', 'morgan_sweep'], faction: 'marine', lethal: true, skill: 0.3, bounty: 10000000, breakthrough: 3,
    alert: 'I am Captain Morgan! My rank is my justice!',
    when: (c) => !c.bosses.includes('morgan'),
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: '"Salute when you speak to me! In this town my word is law — rank is everything! ...What do you want?"', choices: [
      { text: 'Your tyranny ends today.', if: () => active(ctx, 'pirate_hunter', 'morgan'), do: (c) => { aggro(c.game, findActor(c.game, 'morgan')); }, end: true },
      { text: 'Nothing, Captain.', end: true }] } } }),
  },
  {
    id: 'ripper', name: 'Lieutenant Ripper', title: '153rd Marine Branch', island: 'shells_island', at: { town: 'marine_153', plaza: true, ox: 2 },
    look: { hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#1b4f72', hat: 'marine' }, level: 8, faction: 'marine',
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => ctx.char.bosses.includes('morgan') ? '"With Morgan gone, this base serves the people again. If you want to wear the coat of Justice, I can sign your enlistment papers."' : '"...We don\'t like what Captain Morgan does either. But orders are orders."',
      choices: [
        { text: 'Enlist in the Marines', if: () => ctx.char.faction !== 'marine', do: (c) => c.emit('marineEnlist', 'Shells Town'), end: true },
        { text: 'Marine business', if: () => ctx.char.faction === 'marine', do: (c) => c.emit('marineOffice', { name: '153rd Branch' }), end: true },
        { text: 'Carry on.', end: true },
      ] } } }),
  },

  // ---------------------------------------------------------- Shimotsuki
  {
    id: 'koshiro', name: 'Koshiro', title: 'Master of the Isshin Dojo', island: 'shimotsuki', at: { town: 'shimotsuki_village', building: 'Isshin Dojo' }, trainer: 'koshiro',
    look: { hair: 'ponytail', hairColor: '#3e2723', top: '#eceff1', bottom: '#455a64', skin: '#f1c9a0', swords: 1 }, level: 22,
    marker: (c, g) => (c.masteries.ittoryu !== undefined && !g.quests.state('kuina_promise') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a', nodes: {
        a: { text: () => ctx.char.masteries.ittoryu === undefined ? '"Welcome to the Isshin Dojo. The sword is a way of living, not a weapon. Will you learn the One Sword Style?"' : '"Your blade is still honest. Good."',
          choices: [
            { text: 'Train at the dojo', do: (c) => c.open('trainer', { trainer: 'koshiro' }) },
            { text: 'Tell me about the white sword on the wall.', if: () => ctx.char.masteries.ittoryu !== undefined && !ctx.quest('kuina_promise'), next: 'wado' },
            { text: 'I beat you in a spar. About that promise...', if: () => active(ctx, 'kuina_promise', 'report'), next: 'give' },
            { text: 'Farewell, master.', end: true },
          ] },
        wado: { text: '"That is Wado Ichimonji. It belonged to my daughter, Kuina. She wanted to be the greatest swordsman in the world... she fell down the stairs, and that was all. I will give it to the swordsman who can defeat me — and who carries her dream."', choices: [{ text: 'Then I\'ll defeat you.', do: (c) => c.startQuest('kuina_promise'), end: true }, { text: 'I\'m not ready.', end: true }] },
        give: { text: '"...Then take it. Carry her dream to the top of the world. If you ever dishonour this blade, I will come for it myself."', onEnter: (c) => c.complete('kuina_promise') },
      },
    }),
  },

  // ---------------------------------------------------------- Orange Town
  {
    id: 'boodle', name: 'Mayor Boodle', title: 'Mayor of Orange Town', island: 'organ_islands', at: { town: 'orange_town', building: 'Town Clinic' },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#ff8f00', bottom: '#5d4037', hat: 'captain', hatColor: '#1a237e' }, level: 5,
    marker: (c, g) => (!g.quests.state('buggy_circus') ? '!' : g.quests.stageId('buggy_circus') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a', nodes: {
        a: { text: () => done(ctx, 'buggy_circus') ? '"Forty years we built this town. And you gave it back to us. Orange Town will never forget you."' : '"Buggy the Clown\'s pirates took over our town! We built it with our own hands, forty years ago... I\'m the mayor, I can\'t just watch! Their cannon — the Buggy Ball — flattened a whole street!"',
          choices: [
            { text: 'I\'ll take care of the clown.', if: () => !ctx.quest('buggy_circus'), do: (c) => c.startQuest('buggy_circus'), end: true },
            { text: 'Buggy is finished.', if: () => active(ctx, 'buggy_circus', 'report'), do: (c) => c.complete('buggy_circus'), next: 'thanks' },
            { text: 'Patch me up (clinic)', do: (c) => c.open('doctor', {}) },
            { text: 'Goodbye.', end: true },
          ] },
        thanks: { text: '"And this... Buggy was hoarding a sea chart of the Grand Line. Take it — you\'ll need it far more than we do."' },
      },
    }),
  },
  {
    id: 'chouchou', name: 'Chouchou', title: 'Loyal guard dog', island: 'organ_islands', at: { town: 'orange_town', building: 'Pet Food Shop' }, ai: 'idle',
    fullLook: { race: 'mink', skin: '#fafafa', fur: '#fafafa', hairColor: '#fafafa', hand: '#fafafa', ears: 'pointy', muzzle: true, tail: 'fluffy', furFace: true, hair: 'bald', top: '#fafafa', bottom: '#eeeeee', scale: 0.6 },
    level: 3,
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Woof." (Chouchou guards his late master\'s pet shop. He won\'t move an inch — not for pirates, not for anyone.)' } } }),
  },
  { id: 'mohji', name: 'Beast Tamer Mohji', title: 'Buggy Pirates', island: 'organ_islands', at: { town: 'orange_town', plaza: true, ox: -4 }, hostile: true, calm: true, named: true, faction: 'pirate', level: 7,
    look: { hair: 'afro', hairColor: '#fafafa', top: '#fafafa', bottom: '#ef6c00', ears: 'round', fur: '#fafafa' }, moves: ['brawl_tackle'], bounty: 3000000, infamy: true, when: (c) => !c.defeated.mohji },
  { id: 'cabaji', name: 'Acrobat Cabaji', title: 'Chief of Staff, Buggy Pirates', island: 'organ_islands', at: { town: 'orange_town', plaza: true, ox: 4 }, hostile: true, calm: true, named: true, faction: 'pirate', level: 9,
    look: { hair: 'long', hairColor: '#212121', top: '#1a237e', bottom: '#fafafa', scarEye: true }, style: 'ittoryu', weapon: 'sword', moves: ['cabaji_fire', 'cabaji_dash'], bounty: 5000000, infamy: true, skill: 0.35, when: (c) => !c.defeated.cabaji },
  {
    id: 'buggy', name: 'Buggy the Clown', title: 'Captain of the Buggy Pirates', island: 'organ_islands', at: { town: 'orange_town', building: 'Buggy Pirates HQ (Tavern)' }, hostile: true, boss: true, hpMul: 0.95, faction: 'pirate', level: 11,
    look: { hair: 'long', hairColor: '#1976d2', top: '#e53935', bottom: '#1565c0', skin: '#fafafa', nose: 'red', hat: 'captain', hatColor: '#6d4c41', coat: '#e53935' },
    fruit: 'bara', fruitMastery: 45, moves: ['bara_cannon', 'bara_festival', 'buggy_ball', 'buggy_knives'], bounty: 15000000, infamy: true, breakthrough: 3, skill: 0.3,
    alert: 'Who are you calling a big red nose?!', barks: ['Flashy!', 'Gyahahaha!'],
    when: (c) => !c.bosses.includes('buggy'),
  },

  // ------------------------------------------------ Island of Rare Animals
  {
    id: 'gaimon', name: 'Gaimon', title: 'The man in the treasure chest', island: 'rare_animals', at: { spot: 'gaimon' }, ai: 'idle',
    look: { hair: 'afro', hairColor: '#ef6c00', top: '#8d5b33', bottom: '#8d5b33', scale: 0.8 }, level: 4,
    marker: (c, g) => (!g.quests.state('gaimon_treasure') ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => done(ctx, 'gaimon_treasure') ? '"Twenty years guarding empty chests... but you know what? The animals here are my crew. I\'m happy."' : '"Don\'t come closer, pirate! These treasure chests are MINE! I\'ve guarded them for twenty years! ...Could you... look inside the ones on the cliff for me? I can\'t reach them. I\'m stuck in this box."',
        choices: [{ text: 'I\'ll check the chests.', if: () => !ctx.quest('gaimon_treasure'), do: (c) => c.startQuest('gaimon_treasure'), end: true },
          { text: 'They were empty, Gaimon. I\'m sorry.', if: () => active(ctx, 'gaimon_treasure', 'report'), do: (c) => c.complete('gaimon_treasure'), next: 'sad' },
          { text: 'Take care of your animals.', end: true }] },
      sad: { text: '"...Empty. I knew it, deep down. Here — this is my real treasure, found it washed up years ago. It\'s useless to a man in a box. Go chase your dream before you end up like me!"' },
    } }),
  },

  // ---------------------------------------------------------- Syrup Village
  {
    id: 'usopp', name: 'Usopp', title: 'Captain of the Usopp Pirates (self-proclaimed)', island: 'gecko_islands', at: { spot: 'usopp_target' }, trainer: 'usopp',
    look: { hair: 'curly', hairColor: '#212121', top: '#f5deb3', bottom: '#6d4c41', skin: '#a0643a', nose: 'long', hat: 'bandana', hatColor: '#795548' }, level: 7,
    marker: (c, g) => (!g.quests.state('black_cat_plot') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a', nodes: {
        a: { text: () => done(ctx, 'black_cat_plot') ? '"We did it! The village doesn\'t even know how close it came... That\'s how it should be. I\'m going to be a brave warrior of the sea someday. Just you watch!"' : '"PIRATES ARE COMING! ...Just kidding! Ha! I, Captain Usopp, have eight thousand men under my command! ...Okay, three kids. But I\'m the best shot in the East Blue!"',
          choices: [
            { text: 'Teach me to shoot.', do: (c) => c.open('trainer', { trainer: 'usopp' }) },
            { text: 'You look worried about something.', if: () => !ctx.quest('black_cat_plot'), next: 'plot' },
            { text: 'Bye, Captain.', end: true },
          ] },
        plot: { text: '"...Okay. This one isn\'t a lie. I overheard Kaya\'s butler, Klahadore, on the cliffs with a hypnotist. He\'s really Captain Kuro of the Black Cat Pirates! He faked his death and now he wants to kill Kaya for her fortune! His crew land on the north coast at dawn and come up the north slope, north of the village. Nobody believes me — I\'m the boy who cried pirates..."', choices: [{ text: 'I believe you.', do: (c) => c.startQuest('black_cat_plot'), end: true }, { text: 'Sounds like another lie.', end: true }] },
      },
    }),
  },
  {
    id: 'kaya', name: 'Kaya', title: 'Heiress of Syrup Village', island: 'gecko_islands', at: { town: 'kaya_mansion', building: "Kaya's Mansion" },
    look: { hair: 'long', hairColor: '#fff59d', top: '#fafafa', bottom: '#e1f5fe', skin: '#fdeee4' }, level: 2,
    marker: (c, g) => (g.quests.stageId('black_cat_plot') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => {
        if (active(ctx, 'black_cat_plot', 'report')) return '"Klahadore... three years he took care of me, and it was all a lie. Thank you for protecting the village. Merry and I want you to have something — a ship. She\'s moored below the mansion."';
        if (done(ctx, 'black_cat_plot')) return '"I\'m going to become a doctor. So next time, I can protect people too."';
        return '"Oh! A traveller? Usopp tells me such wonderful stories about the sea... I\'m sick most of the time, so his stories are my adventures."';
      }, onEnter: (c) => { if (active(c, 'black_cat_plot', 'report')) c.complete('black_cat_plot'); } } } }),
  },
  // (the estate's butler, at the mansion's front door: he designed a ship once, but he doesn't sell them)
  { id: 'merry', name: 'Merry', title: 'Butler of the Kaya estate', island: 'gecko_islands', at: { town: 'kaya_mansion', door: "Kaya's Mansion", ox: 1.8 },
    look: { hair: 'curly', hairColor: '#fafafa', top: '#212121', bottom: '#212121', skin: '#fafafa', hat: 'horns' }, level: 2,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: '"I designed the caravel myself. She\'s not big, but she has a heart. Treat her well, and she\'ll carry you anywhere."', choices: [
      { text: 'Thank you, Merry.', end: true }] } } }) },
  { id: 'jango', name: 'Jango', title: 'Hypnotist, Black Cat Pirates', island: 'gecko_islands', at: { spot: 'north_slope' }, hostile: true, named: true, faction: 'pirate', level: 8,
    look: { hair: 'afro', hairColor: '#212121', top: '#fafafa', bottom: '#1a237e', hat: 'cowboy', hatColor: '#212121', goggles: true }, moves: ['jango_chakram', 'jango_hypnosis'], bounty: 9000000, infamy: true, breakthrough: 1,
    when: (c, g) => g.quests.stageId('black_cat_plot') === 'slope' || g.quests.stageId('black_cat_plot') === 'kuro' },
  // (a starter island's boss: a hard fight, not a wall)
  { id: 'kuro', name: 'Captain Kuro', title: '"Kuro of a Hundred Plans"', island: 'gecko_islands', at: { spot: 'north_slope' }, hostile: true, boss: true, hpMul: 0.85, faction: 'pirate', level: 11,
    look: { hair: 'buzz', hairColor: '#212121', top: '#212121', bottom: '#212121', skin: '#f1c9a0', goggles: true, hand: '#eceff1' }, style: 'brawler', moves: ['kuro_stealth', 'kuro_claws'],
    bounty: 16000000, infamy: true, breakthrough: 3, skill: 0.35, alert: 'Three years of planning. I will not let a nobody ruin it.',
    when: (c, g) => g.quests.stageId('black_cat_plot') === 'kuro' },

  // ------------------------------------------------------------ Baratie
  {
    id: 'zeff', name: '"Red Leg" Zeff', title: 'Head chef of the Baratie', island: 'baratie', at: { spot: 'baratie_deck' }, trainer: 'zeff',
    look: { hair: 'long', hairColor: '#fff59d', top: '#fafafa', bottom: '#212121', skin: '#f1c9a0', hat: 'captain', hatColor: '#fafafa' }, level: 30,
    marker: (c, g) => (!g.quests.state('baratie_krieg') ? '!' : g.quests.stageId('baratie_krieg') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => done(ctx, 'baratie_krieg') ? '"Hmph. You fight with your whole heart, brat. Eat something before you go."' : '"Welcome to the Baratie, the sea restaurant. We feed anyone who\'s hungry — even pirates. Especially pirates. What\'ll it be?"',
        choices: [
          { text: 'A full course, please.', do: (c) => c.open('shop', { shop: ['baratie_course', 'fish_stew', 'meat', 'sea_king_steak'], building: { name: 'Baratie', role: 'restaurant' } }) },
          { text: 'Teach me Black Leg.', do: (c) => c.open('trainer', { trainer: 'zeff' }) },
          { text: 'There\'s a starving man outside...', if: () => !ctx.quest('baratie_krieg'), next: 'gin' },
          { text: 'Krieg\'s armada is finished.', if: () => active(ctx, 'baratie_krieg', 'report'), do: (c) => c.complete('baratie_krieg'), next: 'thx' },
          { text: 'Is the All Blue real?', next: 'allblue' },
          { text: 'Goodbye.', end: true },
        ] },
      allblue: { text: '"The All Blue... a sea where the fish of the East, West, North and South Blue all swim together. Every cook dreams of it. Fools say it doesn\'t exist. I say it\'s out there — past the Red Line, somewhere in that madhouse they call the New World. Sail with a cook who has the nose for it, and you might just smell it."', onEnter: (c) => c.setFlag('allBlueLegend'), next: 'a' },
      gin: { text: '"A Krieg pirate named Gin, starving on a dinghy. ...No one who is hungry leaves my ship without eating. Take him this. But mark my words — where Gin goes, Don Krieg follows."', choices: [{ text: 'I\'ll feed him.', do: (c) => { c.startQuest('baratie_krieg'); c.give('meat', 1); }, end: true }] },
      thx: { text: '"You protected my restaurant. As thanks, I\'ll teach you Black Leg for free — if you\'ve got the legs for it. And the cooks will always have a plate for you."' },
    } }),
  },
  { id: 'gin', name: 'Gin', title: '"Man-Demon", Krieg Pirates', island: 'baratie', at: { spot: 'baratie_deck', ox: 3 },
    look: { hair: 'short', hairColor: '#212121', top: '#455a64', bottom: '#263238', hat: 'bandana', hatColor: '#9e9e9e' }, level: 12,
    marker: (c, g) => (g.quests.stageId('baratie_krieg') === 'feed' ? '?' : null),
    when: (c, g) => !g.quests.isDone('baratie_krieg') && g.quests.stageId('baratie_krieg') !== 'krieg',
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: '"...Food? For me?"', choices: [
      { text: 'Give him the meat.', if: () => active(ctx, 'baratie_krieg', 'feed') && ctx.has('meat'), do: (c) => { c.take('meat', 1); c.stage('baratie_krieg', 'krieg'); }, next: 'b' },
      { text: 'Leave', end: true }] },
      b: { text: '(Gin eats, crying.) "...Thank you. I\'m sorry. Don Krieg is coming. Fifty ships went into the Grand Line, and one came back. He wants this restaurant. Run..."' } } }),
  },
  {
    id: 'johnny', name: 'Johnny', title: 'Bounty hunter', island: 'baratie', at: { spot: 'baratie_deck', ox: -5 }, level: 7, style: 'ittoryu', weapon: 'sword',
    look: { hair: 'short', hairColor: '#212121', top: '#8d6e63', bottom: '#3e2723', goggles: true, swords: 1 },
    recruit: {
      role: 'swordsman', fighter: true, requires: (c) => !!c.flags.yosakuCured,
      pitch: {
        pirate: '"Aniki! You saved Yosaku\'s life! We hunt pirates for a living... but for you? Johnny and Yosaku will follow a pirate anywhere! Just don\'t tell anyone back home."',
        marine: '"Aniki! You saved Yosaku\'s life! A Marine, huh? We\'ve never taken orders from the Navy — but from you, we will! Johnny and Yosaku, at your command!"',
        hunter: '"Aniki! You saved Yosaku\'s life! A hunter, like us! Johnny and Yosaku, the pirate-hunting duo — make it a trio! Partners, aniki!"',
        free: '"Aniki! You saved Yosaku\'s life! Johnny and Yosaku, the pirate-hunting duo — we\'ll follow you anywhere!"',
      },
      again: '"Aniki! You changed your mind? Yosaku, pack the bags — we\'re sailing!"',
      declined: '"Aww... alright, aniki. We\'ll be right here on the deck if you need a blade. Or two!"',
      aboard: ['"I\'m keeping an eye out for bounties, aniki!"', '"Yosaku eats his fruit every day now. Every. Day."'],
    },
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => ctx.flag('yosakuCured') ? '"Yosaku\'s back on his feet! We owe you big, aniki!"' : '"H-hey! You there! My partner Yosaku collapsed — his teeth are falling out and his old wounds opened up! Is this some kind of plague?!"',
        choices: [
          { text: 'That\'s scurvy. He needs fresh fruit — here, a tangerine.', if: () => !ctx.flag('yosakuCured') && (ctx.has('tangerine') || ctx.has('rice_ball')), do: (c) => { if (c.has('tangerine')) c.take('tangerine', 1); else c.take('rice_ball', 1); c.setFlag('yosakuCured'); c.log('Yosaku wolfs down the fruit and colour returns to his face. (Scurvy: a lack of vitamin C.)', '#a5d6a7'); }, next: 'b' },
          { text: 'Good luck.', end: true },
        ] },
      b: { text: '"He\'s... he\'s getting better already?! Aniki, you\'re a genius!"' },
    } }),
  },
  {
    id: 'yosaku', name: 'Yosaku', title: 'Bounty hunter', island: 'baratie', at: { spot: 'baratie_deck', ox: -6.5 }, level: 7, style: 'ittoryu', weapon: 'sword',
    look: { hair: 'short', hairColor: '#6d4c41', top: '#43a047', bottom: '#2e7d32', hat: 'bandana', hatColor: '#1b5e20', swords: 1 },
    recruit: {
      role: 'swordsman', fighter: true, requires: (c) => !!c.flags.yosakuCured,
      pitch: {
        pirate: '"You cured me with a piece of fruit... I thought I was done for. Hunting pirates or sailing with one — what\'s the difference, if it\'s you? Take me along — I\'m handy with a blade!"',
        marine: '"You cured me with a piece of fruit... I thought I was done for. I\'ll serve under a Marine if it\'s you. Take me along — I\'m handy with a blade!"',
        hunter: '"You cured me with a piece of fruit... I thought I was done for. Another hunter! Take me along — I\'m handy with a blade, partner!"',
        free: '"You cured me with a piece of fruit... I thought I was done for. Take me along — I\'m handy with a blade!"',
      },
      again: '"You came back for me? I knew eating my fruit would pay off!"',
      declined: '"Fair enough. I\'ll be here, eating tangerines. Lots of tangerines."',
      aboard: ['"Fruit, fruit, every day. I\'m never getting scurvy again."', '"Quiet sea. Johnny says that\'s when the big ones come."'],
    },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: () => ctx.flag('yosakuCured') ? '"Never felt better! Scurvy, huh? I\'ll never skip my fruit again."' : '"(Yosaku lies pale on the deck, groaning. His gums are bleeding.)"' } } }),
  },
  {
    id: 'patty', name: 'Patty', title: 'Cook of the Baratie', island: 'baratie', at: { spot: 'baratie_deck', ox: 2 }, level: 9,
    look: { hair: 'bald', skin: '#e0ac7e', top: '#fafafa', bottom: '#212121', hat: 'captain', hatColor: '#fafafa', bulk: 1.2 },
    recruit: {
      role: 'cook', fighter: false, requires: (c, g) => g.quests.isDone('baratie_krieg'),
      intro: '"Patty, cook of the Baratie! Old Zeff kicks us when we waste food and kicks us harder when we don\'t fight. I can do both. Mostly the cooking."',
      pitch: {
        pirate: '"The old geezer says a cook who\'s never seen the Grand Line is only half a cook. Fine! I\'ll cook for your crew — and you\'d better eat every bite!"',
        marine: '"A Navy galley, eh? The old geezer says a cook feeds whoever\'s hungry, flag or no flag. Fine! I\'ll cook for your ship, Marine — but I don\'t salute anybody with a ladle in my hand!"',
        hunter: '"The old geezer says a cook who\'s never seen the Grand Line is only half a cook. You hunt, I cook — and you\'d better eat every bite, partner!"',
        free: '"The old geezer says a cook who\'s never seen the Grand Line is only half a cook. Fine! I\'ll cook for your ship — and you\'d better eat every bite!"',
      },
      again: '"Changed your mind, eh? The old geezer already packed my knives. He says I eat too much."',
      declined: '"Hmph! Your loss, you lousy customer. The kitchen\'s always open — come back when you\'re hungry."',
      aboard: ['"Dinner\'s on! Eat it all, or don\'t come back to my galley!"', '"Nobody goes hungry on a ship I cook for. Nobody!"', '"Fish stew again. Complain and it\'s fish stew forever."'],
    },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: () => ctx.game.quests.isDone('baratie_krieg') ? '"You fought for this restaurant like one of us. Hungry? Of course you are."' : '"Welcome, you shitty customer! Sit down, eat, pay, get out!"' } } }),
  },
  { id: 'krieg', name: 'Don Krieg', title: 'Admiral of the Krieg Pirate Armada', island: 'baratie', at: { spot: 'baratie_deck', ox: -3 }, hostile: true, boss: true, hpMul: 1.1, faction: 'pirate', level: 15,
    look: { hair: 'short', hairColor: '#212121', top: '#ffd54f', bottom: '#5d4037', skin: '#e0ac7e', bulk: 1.5, coat: '#b71c1c' }, bulk: 1.5, defMul: 0.8, moves: ['krieg_mh5', 'krieg_spears', 'krieg_cape'],
    bounty: 17000000, infamy: true, breakthrough: 3, skill: 0.4, alert: 'I am the strongest! Give me your ship and your food!',
    when: (c, g) => g.quests.stageId('baratie_krieg') === 'krieg' },
  { id: 'mihawk_cameo', name: 'Dracule Mihawk', title: '"Hawk-Eyes", World\'s Greatest Swordsman', island: 'baratie', at: { spot: 'baratie_deck', ox: 5 }, ai: 'idle',
    look: { hair: 'short', hairColor: '#212121', top: '#212121', bottom: '#3e2723', coat: '#212121', hat: 'captain', hatColor: '#212121', eyeColor: '#fbc02d', swords: 1 }, level: 100, fixedPower: 99999,
    when: (c) => c.flags.mihawkBaratie && !c.flags.mihawkMet,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"...I came to see the one who stopped Krieg\'s armada. You hold a blade. What is your dream, and how far will you go for it?"', choices: [
        { text: '"To become the world\'s greatest swordsman." (take his blow on your chest)', do: (c) => { c.setFlag('mihawkMet'); c.progression.raiseAttr('wil', 3); c.progression.breakthrough(2, 'The scar of a swordsman'); c.player.hp = Math.max(1, c.player.hp * 0.3); c.save(); }, next: 'b' },
        { text: 'Stay silent.', do: (c) => { c.setFlag('mihawkMet'); }, next: 'c' }] },
      b: { text: '"A wound on the back is a swordsman\'s shame. You took it on the chest. ...I will wait for you at the top, however many years it takes. Surpass me."' },
      c: { text: '"...A pity." (He is gone before you can blink.)' },
    } }),
  },

  // ----------------------------------------------------------- Conomi Islands
  {
    id: 'nojiko', name: 'Nojiko', title: 'Tangerine farmer', island: 'conomi_islands', at: { town: 'cocoyasi', building: "Nojiko's House" },
    look: { hair: 'short', hairColor: '#1976d2', top: '#fff176', bottom: '#8d6e63', skin: '#c68642' }, level: 6,
    marker: (c, g) => (!g.quests.state('arlong_park') ? '!' : g.quests.stageId('arlong_park') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => {
        if (done(ctx, 'arlong_park')) return '"Eight years... We\'re free. Take as many tangerines as you want. Bell-mère would have liked you."';
        if (ctx.char.race === 'fishman') return '"...A fish-man. Are you one of Arlong\'s? No? Then why are you here — to make fun of us?"';
        return '"Every adult in Cocoyasi pays Arlong 100,000 berries a month — or dies. My mother, Bell-mère, couldn\'t pay for both of us... and he shot her in front of our tangerine grove. My sister has been working for Arlong for eight years to buy the village back."';
      }, choices: [
        { text: 'I\'ll free Cocoyasi from Arlong.', if: () => !ctx.quest('arlong_park'), do: (c) => c.startQuest('arlong_park'), end: true },
        { text: 'Arlong Park has fallen.', if: () => active(ctx, 'arlong_park', 'report'), do: (c) => c.complete('arlong_park'), next: 'a' },
        { text: 'Buy tangerines', do: (c) => c.open('shop', { shop: ['tangerine', 'rice_ball', 'fish_stew'], building: { name: 'Nojiko\'s Grove', role: 'shop' } }) },
        { text: 'Take care.', end: true }] },
    } }),
  },
  { id: 'genzo', name: 'Genzo', title: 'Sheriff of Cocoyasi', island: 'conomi_islands', at: { town: 'cocoyasi', building: "Genzo's House" },
    look: { hair: 'buzz', hairColor: '#795548', top: '#fafafa', bottom: '#5d4037', hat: 'marine', scarEye: true }, level: 8,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: () => ctx.game.quests.isDone('arlong_park') ? '"...Look at them all laughing. I haven\'t heard that in eight years."' : '"The pinwheel on my hat is for the girls. Nami and Nojiko. ...If you hurt them, I\'ll kill you. If you save them, I\'ll owe you my life."' } } }) },
  { id: 'nako', name: 'Doctor Nako', title: 'Cocoyasi physician', island: 'conomi_islands', at: { town: 'cocoyasi', building: "Doctor Nako's" },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#fafafa', bottom: '#90a4ae' }, level: 3, doctor: { line: '"Sit down, sit down. Let\'s see those wounds."' },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: '"Hurt? Of course you\'re hurt. Everyone around here is."', choices: [{ text: 'Treat me', do: (c) => c.open('doctor', {}) }, { text: 'Leave', end: true }] } } }) },
  { id: 'nezumi', name: 'Captain Nezumi', title: 'Marine 16th Branch (in Arlong\'s pocket)', island: 'conomi_islands', at: { town: 'marine_16', building: '16th Branch' }, faction: 'marine', level: 7, named: true,
    look: { hair: 'short', hairColor: '#9e9e9e', top: '#fafafa', bottom: '#1b4f72', hat: 'marine', skin: '#e0e0e0', ears: 'round', fur: '#9e9e9e' },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: '"Chi-chi-chi! Arlong? Never heard of him. The Marines have no business interfering with... private arrangements."', choices: [
      { text: 'You\'re protecting Arlong for money!', do: (c) => aggro(c.game, findActor(c.game, 'nezumi')), end: true }, { text: 'Leave', end: true }] } } }),
    when: (c) => !c.defeated.nezumi },
  { id: 'kuroobi', name: 'Kuroobi', title: 'Arlong Pirates officer (Fish-Man Karate)', island: 'conomi_islands', at: { town: 'arlong_park', plaza: true, ox: -3 }, faction: 'pirate', level: 12, named: true, race: 'fishman',
    look: { hair: 'bald', skin: '#5c6bc0', top: '#fafafa', bottom: '#fafafa', belt: '#212121', fin: true }, style: 'fishman_karate', moves: ['fmk_uchimizu', 'fmk_arabesque'], skill: 0.45,
    hostile: true, bounty: 8000000, infamy: true, when: (c) => !c.defeated.kuroobi, alert: 'Fish-Man Karate is forty times stronger than your punches, human.' },
  { id: 'chew', name: 'Chew', title: 'Arlong Pirates officer', island: 'conomi_islands', at: { town: 'arlong_park', plaza: true, ox: 3 }, faction: 'pirate', level: 11, named: true, race: 'fishman',
    look: { hair: 'bald', skin: '#26a69a', top: '#ff7043', bottom: '#5d4037' }, style: 'brawler', moves: ['chew_watergun'], ranged: true, prefRange: 6,
    hostile: true, bounty: 7000000, infamy: true, when: (c) => !c.defeated.chew },
  { id: 'hatchan', name: 'Hatchan', title: 'Arlong Pirates officer (Six Sword Style)', island: 'conomi_islands', at: { town: 'arlong_park', plaza: true, ox: 0, oy: 3 }, faction: 'pirate', level: 12, named: true, race: 'fishman',
    look: { hair: 'curly', hairColor: '#e53935', skin: '#ef9a9a', top: '#ffeb3b', bottom: '#5d4037', swords: 2 }, style: 'nitoryu', weapon: 'sword', blades: ['fine_katana'], moves: ['hatchan_six'],
    hostile: true, bounty: 7000000, infamy: true, when: (c) => !c.defeated.hatchan },
  {
    id: 'arlong', name: 'Arlong the Saw', title: 'Captain of the Arlong Pirates', island: 'conomi_islands', at: { town: 'arlong_park', building: 'Arlong Park Tower' }, faction: 'pirate', level: 17, boss: true, hpMul: 1.2, race: 'fishman',
    look: { hair: 'spiky', hairColor: '#212121', skin: '#546e7a', top: '#fafafa', bottom: '#1a237e', fin: true, grin: true, sharpTeeth: true, bulk: 1.3, nose: 'long' }, bulk: 1.3,
    style: 'fishman_karate', moves: ['arlong_darts', 'arlong_kiribachi', 'arlong_bite'], skill: 0.45, bounty: 20000000, infamy: true, breakthrough: 4,
    hostile: true, alert: 'Shahahaha! A lowly human thinks they can stand against a Fish-Man?!', barks: ['Know your place, human!', 'Shahahaha!'],
    phases: [{ at: 0.5, run: (a, g) => { g.fx.text(a.x, a.y - 2.4, 'KIRIBACHI!', '#ff5252', 0.6); a.addBuff({ id: 'arlong_rage', name: 'Rage', dur: 60, mods: { damage: 1.25, atkSpeed: 1.15 } }); } }],
    when: (c) => !c.bosses.includes('arlong'),
  },

  // ------------------------------------------------------------ Loguetown
  { id: 'ipponmatsu', name: 'Ipponmatsu', title: 'Swordsmith of Loguetown', island: 'polestar_islands', at: { town: 'loguetown', building: "Ipponmatsu's Sword Shop" },
    look: { hair: 'buzz', hairColor: '#9e9e9e', top: '#8d6e63', bottom: '#5d4037', skin: '#f1c9a0' }, level: 4,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Welcome, welcome! The finest blades in the East Blue. ...Hm? You\'re looking at the barrel of discount swords. There\'s one in there... the Sandai Kitetsu. Cursed. Every owner has met a terrible end."', choices: [
        { text: 'Browse swords', do: (c) => c.open('shop', { shop: 'loguetown_swords', building: { name: "Ipponmatsu's Sword Shop", role: 'weapons' } }) },
        { text: 'Let me test the cursed sword\'s luck.', if: () => !ctx.flag('kitetsu'), next: 'k1' },
        { text: 'Goodbye.', end: true }] },
      k1: { text: '(You throw the Sandai Kitetsu high into the air and hold your arm out beneath it. The blade spins, falls...)', next: () => (Math.random() < 0.8 ? 'k2' : 'k3') },
      k2: { text: '(...and slices the air a hair\'s width from your arm, burying itself in the floor.) Ipponmatsu drops to his knees: "Take it! Take it free! And take this — a Wazamono, Yubashiri, for half price? No — FREE! I\'ve never seen such courage!"', onEnter: (c) => { c.setFlag('kitetsu'); c.give('sandai_kitetsu', 1); c.give('yubashiri', 1); } },
      k3: { text: '(...and nicks your arm. Blood wells up.) Ipponmatsu: "The curse! Put it back, put it back! ...Well, you\'re alive. Consider yourself lucky."', onEnter: (c) => { c.setFlag('kitetsu'); c.player.hp = Math.max(1, c.player.hp - 30); } },
    } }),
  },
  { id: 'navigator_merchant', name: 'Old Navigator', title: 'Navigator Supplies', island: 'polestar_islands', at: { town: 'loguetown', building: 'Navigator Supplies (Log Poses!)' },
    look: { hair: 'long', hairColor: '#bdbdbd', top: '#1565c0', bottom: '#37474f', hat: 'tricorne' }, level: 3,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: '"Heading to the Grand Line, eh? You\'ll need a Log Pose. The compass you\'ve got will spin like a top the moment you come down Reverse Mountain. Stay on each island until the needle sets — then follow it."', choices: [
      { text: 'Browse', do: (c) => c.open('shop', { shop: 'navigator', building: { name: 'Navigator Supplies', role: 'shop' } }) }, { text: 'Thanks.', end: true }] } } }) },
  { id: 'gunsmith_logue', name: 'Gunsmith', title: 'Loguetown Range', island: 'polestar_islands', at: { town: 'loguetown', building: 'Gunsmith & Range' }, trainer: 'gunsmith',
    look: { hair: 'short', hairColor: '#5d4037', top: '#795548', bottom: '#3e2723', hat: 'cowboy', goggles: true }, level: 12,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: '"Guns, slingshots, powder. Or lessons — the range is out back."', choices: [
      { text: 'Train with the gunsmith', do: (c) => c.open('trainer', { trainer: 'gunsmith' }) },
      { text: 'Buy a weapon', do: (c) => c.open('shop', { shop: ['slingshot', 'flintlock', 'marine_rifle'], building: { name: 'Gunsmith', role: 'weapons' } }) },
      { text: 'Leave', end: true }] } } }) },
  { id: 'smoker', name: 'Captain Smoker', title: '"The White Hunter"', island: 'polestar_islands', at: { town: 'loguetown', plaza: true, ox: 5 }, faction: 'marine', level: 30, boss: true, hpMul: 1.5,
    look: { hair: 'short', hairColor: '#eceff1', top: '#37474f', bottom: '#263238', coat: '#fafafa', coatText: 'JUSTICE', skin: '#e0ac7e' }, fruit: 'moku', fruitMastery: 60, moves: ['moku_blow', 'moku_snake', 'smoker_jitte', 'moku_launcher', 'moku_vine'],
    lethal: false, skill: 0.55, bounty: 0, breakthrough: 4, alert: 'Pirate. You won\'t leave Loguetown.',
    when: (c) => c.bounty > 0 && !c.bosses.includes('smoker') && !c.flags.escapedLoguetown },
  { id: 'tashigi', name: 'Tashigi', title: 'Marine Sergeant Major', island: 'polestar_islands', at: { town: 'loguetown', plaza: true, ox: 7 }, faction: 'marine', level: 14, named: true,
    look: { hair: 'short', hairColor: '#212121', top: '#e1bee7', bottom: '#1565c0', swords: 1, hat: 'goggles' }, style: 'ittoryu', weapon: 'sword', blades: ['shigure'], moves: ['itto_iai'], lethal: false, skill: 0.5,
    when: (c) => c.bounty > 0 && !c.flags.escapedLoguetown },
];

// --------------------------------------------------------- enemy groups
// Kuro's crew on the north slope: a band while the fight there lasts (see groups)
const BLACK_CAT_CREW = [['pirate', 6, { name: 'Black Cat Pirate' }], ['pirate', 6, { name: 'Black Cat Pirate' }], ['brute', 7, { name: 'Siam (Nyaban Brother)' }], ['brute', 7, { name: 'Butchie (Nyaban Brother)' }]];

/**
 * The crew come up the slope now, if you're on the island when the fight
 * starts (a band only turns up when an island fills with people: with you
 * already there, Jango stood on the slope alone).
 */
function blackCatCrew(g) {
  const list = g.spawner.populated.get('gecko_islands');
  const s = g.surface.islands.find((i) => i.id === 'gecko_islands')?.spots.north_slope;
  if (!list || !s || g.world !== g.surface) return;
  if (g.actors.some((a) => a.alive && /^(Black Cat Pirate|Siam|Butchie)/.test(a.name || ''))) return;
  for (const [arch, lvl, over] of BLACK_CAT_CREW) {
    const p = g.spawner.findFree(s.x, s.y, 6) || { x: s.x, y: s.y };
    const a = makeEnemy(arch, lvl, p.x, p.y, over);
    a.game = g;
    g.addActor(a);
    list.push(a);
  }
}

const groups = [
  { island: 'dawn_island', dx: -0.25, dy: 0.12, radius: 5, level: 4, enemies: [['bandit', 4], ['bandit', 4], ['bandit', 5]], when: (c) => !c.bosses.includes('higuma') },
  { island: 'dawn_island', dx: 0.1, dy: -0.25, radius: 8, enemies: [['tiger', 9, { name: 'Colubo Tiger' }], ['beast', 5, { name: 'Mountain Boar' }]] },
  { island: 'dawn_island', dx: 0.42, dy: 0.35, radius: 5, enemies: [['pirate', 5, { name: 'Bluejam Pirate' }], ['pirate_gunner', 5, { name: 'Bluejam Gunner' }], ['pirate', 5, { name: 'Bluejam Pirate' }]], when: (c) => !c.bosses.includes('bluejam') },
  { island: 'goat_island', dx: 0, dy: 0.2, radius: 4, enemies: [['pirate', 3, { name: 'Alvida Pirate' }], ['pirate', 3, { name: 'Alvida Pirate' }]], when: (c) => !c.bosses.includes('alvida') },
  { island: 'shells_island', town: 'marine_153', spot: 'execution_yard', radius: 4, enemies: [['marine', 5, { name: 'Morgan\'s Marine', lethal: false }], ['marine_rifle', 5, { name: 'Morgan\'s Rifleman' }]], when: (c, g) => g.quests.stageId('pirate_hunter') === 'morgan' },
  // (Buggy's crew lord it over Orange Town, but leave a newcomer be — till
  // someone lays a hand on one of them, or stands up to their captain)
  { island: 'organ_islands', dx: 0, dy: 0.1, radius: 7, calm: true, enemies: [['pirate', 6, { name: 'Buggy Pirate' }], ['pirate', 6, { name: 'Buggy Pirate' }], ['pirate_gunner', 6, { name: 'Buggy Cannoneer' }], ['beast', 8, { name: 'Richie the Lion', look: { fur: '#f6b93b', skin: '#f6b93b', hairColor: '#e67e22', hair: 'afro' } }]], when: (c) => !c.bosses.includes('buggy') },
  { island: 'gecko_islands', spot: 'north_slope', radius: 6, enemies: BLACK_CAT_CREW, when: (c, g) => g.quests.stageId('black_cat_plot') === 'slope' },
  { island: 'baratie', spot: 'baratie_deck', radius: 4, enemies: [['pirate', 10, { name: 'Krieg Pirate' }], ['pirate_gunner', 10, { name: 'Krieg Gunner' }], ['pirate', 10, { name: 'Pearl the Iron Wall', hpMul: 2, look: { bulk: 1.4 } }]], when: (c, g) => g.quests.stageId('baratie_krieg') === 'krieg' },
  { island: 'conomi_islands', dx: 0.55, dy: -0.15, radius: 7, enemies: [['fishman_thug', 9], ['fishman_thug', 9], ['fishman_thug', 10], ['fishman_thug', 10]], when: (c) => !c.bosses.includes('arlong') },
  { island: 'polestar_islands', dx: 0, dy: 0, radius: 9, enemies: [['marine', 10, { name: 'Loguetown Marine' }], ['marine_rifle', 10, { name: 'Loguetown Rifleman' }], ['marine', 10, { name: 'Loguetown Marine' }]], when: (c) => c.bounty > 0 && !c.flags.escapedLoguetown },
  { island: 'tequila_wolf', dx: 0, dy: 0, radius: 6, enemies: [['marine', 8, { name: 'Bridge Overseer', lethal: true }], ['marine', 8, { name: 'Bridge Overseer', lethal: true }]] },
  { island: 'oykot', dx: 0.35, dy: -0.3, radius: 5, enemies: [['bandit', 6], ['bandit', 6], ['bandit', 7]] },
  { island: 'satsuruzo', dx: -0.35, dy: -0.2, radius: 5, enemies: [['beast', 6], ['beast', 6]] },
];

// -------------------------------------------------------------- quests
const quests = [
  { id: 'lord_of_the_coast', name: 'The Lord of the Coast', island: 'dawn_island', kind: 'story', summary: 'A Sea King lurks off Foosha Village. It took Shanks\' arm ten years ago.',
    stages: [
      { id: 'hunt', desc: 'Sail out south of Foosha Village\'s pier and slay the Lord of the Coast.', goal: { type: 'defeat', npc: 'lord_of_the_coast' },
        // (out on the bay where it surfaces: see install)
        where: (g) => { const d = g.surface.islands.find((i) => i.id === 'dawn_island')?.docks[0]; return d && g.world === g.surface ? { x: d.moor.x, y: d.moor.y + 16, place: 'Foosha Bay' } : null; } },
      { id: 'report', desc: 'Return to Makino at Party\'s Bar.' },
    ],
    rewards: { berries: 3000, items: [['straw_hat', 1]], points: 1 } },
  { id: 'higuma_bandits', name: 'Bandits of Mt. Colubo', island: 'dawn_island', kind: 'side', summary: 'Higuma\'s mountain bandits harass Foosha Village.',
    stages: [{ id: 'fight', desc: 'Defeat Higuma at his camp on the south side of Mt. Colubo.', goal: { type: 'defeat', npc: 'higuma' } }, { id: 'report', desc: 'Tell Mayor Woop Slap.' }],
    rewards: { berries: 2500 } },
  { id: 'gray_terminal', name: 'Fire in the Gray Terminal', island: 'dawn_island', kind: 'side', summary: 'The nobles of Goa hired Bluejam to burn the junkyard slum.',
    stages: [{ id: 'fight', desc: 'Defeat Bluejam in the Gray Terminal, east of Mt. Colubo.', goal: { type: 'defeat', npc: 'bluejam' } }, { id: 'report', desc: 'Tell the kid in the Gray Terminal.' }],
    rewards: { berries: 4000, items: [['headband', 1]] } },
  { id: 'koby_dream', name: 'Koby\'s Dream', island: 'goat_island', kind: 'side', summary: 'Koby wants to escape Alvida and join the Marines.',
    stages: [
      { id: 'alvida', desc: 'Defeat "Iron Mace" Alvida on Goat Island.', goal: { type: 'defeat', npc: 'alvida' } },
      { id: 'escort', desc: 'Talk to Koby, then sail him to Shells Town on Yotsuba Island.', goal: { type: 'reach', island: 'shells_island' }, onComplete: (ctx) => { ctx.setFlag('kobyMarine'); ctx.setFlag('kobyAboard', false); ctx.log('Koby runs toward the Marine base. "I\'ll become an Admiral! Thank you!!"', '#90caf9'); } },
    ],
    rewards: { berries: 1500, points: 1 } },
  { id: 'pirate_hunter', name: 'The Pirate Hunter', island: 'shells_island', kind: 'story', summary: 'The pirate hunter Roronoa Zoro is tied up in the yard of Captain Morgan\'s Marine base.',
    stages: [
      { id: 'deliver', desc: 'Bring Rika\'s rice ball to the man tied up in the Marine base yard.', goal: { type: 'flag', flag: '_never' }, npc: 'zoro_tied' },
      { id: 'free', desc: 'Deal with Helmeppo, the captain\'s son (he\'s near the town square).', goal: { type: 'defeat', npc: 'helmeppo' } },
      { id: 'morgan', desc: 'Defeat "Axe-Hand" Morgan at the 153rd Branch.', goal: { type: 'defeat', npc: 'morgan' }, onStart: (ctx, g) => { const m = findActor(g, 'morgan'); if (m) aggro(g, m); } },
      { id: 'zoro', desc: 'Talk to Zoro.', goal: { type: 'flag', flag: '_never2' } },
    ],
    rewards: { berries: 6000, points: 1, liberate: 'Shells Town' },
    onComplete: (ctx) => ctx.setFlag('morganFallen') },
  { id: 'kuina_promise', name: 'Kuina\'s Promise', island: 'shimotsuki', kind: 'story', summary: 'Koshiro will give Wado Ichimonji to the swordsman who defeats him.',
    stages: [
      { id: 'spar', desc: 'Beat Koshiro in a spar at the Isshin Dojo (use a sword style).', goal: { type: 'event', event: 'beat_koshiro' } },
      { id: 'report', desc: 'Talk to Koshiro.' },
    ],
    rewards: { items: [['wado_ichimonji', 1]], mastery: { ittoryu: 5 } } },
  { id: 'buggy_circus', name: 'Buggy\'s Circus', island: 'organ_islands', kind: 'story', summary: 'Buggy the Clown and his pirates have taken over Orange Town.',
    stages: [
      { id: 'mohji', desc: 'Defeat Beast Tamer Mohji.', goal: { type: 'defeat', npc: 'mohji' } },
      { id: 'cabaji', desc: 'Defeat Acrobat Cabaji.', goal: { type: 'defeat', npc: 'cabaji' } },
      { id: 'buggy', desc: 'Defeat Buggy the Clown. Blades can\'t cut him — use your fists!', goal: { type: 'defeat', npc: 'buggy' }, onStart: (ctx, g) => aggro(g, findActor(g, 'buggy')) },
      { id: 'report', desc: 'Return to Mayor Boodle.' },
    ],
    rewards: { berries: 12000, points: 1, liberate: 'Orange Town', flag: 'buggyChart' },
    onComplete: (ctx, g) => { for (const id of ['cactus_island', 'little_garden', 'drum_island', 'alabasta', 'jaya', 'water_7', 'sabaody']) if (!ctx.char.discovered.includes(id)) { const isl = g.surface.islands.find((i) => i.id === id); if (isl) { g.surface.reveal(isl.x, isl.y, isl.radius + 10); } } ctx.log('Buggy\'s chart of the Grand Line reveals several islands on your world map (M).', '#ffe082'); } },
  { id: 'gaimon_treasure', name: 'The Man in the Box', island: 'rare_animals', kind: 'side', summary: 'Gaimon has guarded treasure chests on a cliff for twenty years.',
    stages: [
      { id: 'check', desc: 'Look inside the treasure chests on the Island of Rare Animals.', goal: { type: 'event', event: 'gaimon_chest' } },
      { id: 'report', desc: 'Tell Gaimon the truth.' },
    ],
    rewards: { items: [['jewels', 2]], berries: 2000 } },
  { id: 'black_cat_plot', name: 'The Black Cat\'s Plot', island: 'gecko_islands', kind: 'story', summary: 'Kaya\'s butler Klahadore is really Captain Kuro. He plans to kill her at dawn.',
    stages: [
      { id: 'slope', desc: 'The Black Cat Pirates are coming ashore on the north coast. Hold the north slope (north of Syrup Village, up from the beach) — defeat Jango the hypnotist.', goal: { type: 'defeat', npc: 'jango' },
        onStart: (ctx, g) => { spawnNow(g, 'jango'); blackCatCrew(g); } },
      { id: 'kuro', desc: 'Captain Kuro has shed his disguise. Defeat him on the north slope!', goal: { type: 'defeat', npc: 'kuro' }, onStart: (ctx, g) => { const k = spawnNow(g, 'kuro'); aggro(g, k); g.ui.banner('Captain Kuro', '"Kuro of a Hundred Plans"', 'The butler removes his glasses...', 4); } },
      { id: 'report', desc: 'Visit Kaya at her mansion.' },
    ],
    rewards: { berries: 8000, points: 1 },
    onComplete: (ctx, g) => {
      const isl = g.surface.islands.find((i) => i.id === 'gecko_islands');
      const dock = isl?.docks.find((d) => d.name === "Kaya's Mansion") || isl?.docks[0];
      // (there's only the one Going Merry: never a second, whoever saved Kaya before)
      const have = (ctx.char.fleet || []).some((f) => /going merry/i.test(f.name || '')) || (g.ships || []).some((s) => /going merry/i.test(s.name || '') && !s.sunk);
      if (dock && !have) { g.giveShip('caravel', dock.moor.x, dock.moor.y, 'Going Merry'); g.ui.toast('A NEW SHIP!', 'Kaya gives you a caravel — the Going Merry!', '#ffe082'); }
    } },
  { id: 'baratie_krieg', name: 'The Sea Restaurant', island: 'baratie', kind: 'story', summary: 'A starving Krieg pirate named Gin is adrift near the Baratie.',
    stages: [
      { id: 'feed', desc: 'Give Gin some meat.', goal: { type: 'flag', flag: '_never3' } },
      { id: 'krieg', desc: 'Don Krieg attacks the Baratie! Defeat him.', goal: { type: 'defeat', npc: 'krieg' }, onStart: (ctx, g) => { const k = spawnNow(g, 'krieg'); aggro(g, k); g.ui.banner('Don Krieg', 'Admiral of the Pirate Armada', 'A galleon covered in claw marks appears out of the fog...', 4); } },
      { id: 'report', desc: 'Talk to "Red Leg" Zeff.' },
    ],
    rewards: { berries: 10000, items: [['baratie_course', 2]], points: 1 },
    onComplete: (ctx, g) => {
      if (ctx.char.masteries.black_leg === undefined) { ctx.char.masteries.black_leg = 0; g.log('Zeff teaches you the basics of Black Leg Style. Switch to it in Skills (Tab).', '#90caf9'); }
      if ((ctx.char.weaponMastery?.sword || 0) >= 10 || /ittoryu|nitoryu|santoryu/.test(ctx.char.style)) { ctx.setFlag('mihawkBaratie'); spawnNow(g, 'mihawk_cameo'); }
    } },
  { id: 'arlong_park', name: 'Arlong Park', island: 'conomi_islands', kind: 'story', summary: 'For eight years Arlong\'s Fish-Man pirates have ruled the Conomi Islands.',
    stages: [
      { id: 'officers', desc: 'Defeat Arlong\'s officers: Kuroobi, Chew and Hatchan.', goal: { type: 'defeat', any: ['kuroobi', 'chew', 'hatchan'], count: 3 } },
      { id: 'arlong', desc: 'Defeat Arlong the Saw in Arlong Park.', goal: { type: 'defeat', npc: 'arlong' }, onStart: (ctx, g) => aggro(g, findActor(g, 'arlong')) },
      { id: 'report', desc: 'Return to Nojiko in Cocoyasi Village.' },
    ],
    rewards: { berries: 20000, points: 2, liberate: 'Cocoyasi Village', items: [['tangerine', 6]] },
    // (a pirate who topples Arlong gets a poster; a hunter or a Marine gets thanks)
    onComplete: (ctx, g) => { if (ctx.char.faction === 'pirate' || ctx.char.crewName) g.progression.addBounty(10000000, 'Toppled Arlong Park'); } },
  { id: 'town_of_beginning', name: 'The Town of the Beginning and the End', island: 'polestar_islands', kind: 'story', summary: 'Loguetown, where Gol D. Roger was born and executed. The last stop before the Grand Line.',
    stages: [
      { id: 'platform', desc: 'Stand before the execution platform in Loguetown\'s square.', goal: { type: 'event', event: 'saw_platform' } },
      { id: 'pose', desc: 'Buy a Log Pose (Navigator Supplies).', goal: { type: 'item', item: 'log_pose' } },
      { id: 'mountain', desc: 'Sail to Reverse Mountain, southwest of Loguetown, and ride the current into the Grand Line.', goal: { type: 'event', event: 'entered_grand_line' } },
    ],
    rewards: { points: 1, berries: 5000 } },
];

/** More than `d` tiles out from an island's shore? */
function awayFrom(game, id, d) {
  const isl = game.surface.islands.find((i) => i.id === id);
  return !isl || game.world.distance(game.player.x, game.player.y, isl.x, isl.y) > (isl.radius || 0) + d;
}

// -------------------------------------------------------------- install
function install(game) {
  // Lord of the Coast: surfaces south of Foosha's pier while its quest is on
  game.on('tick', () => {
    const c = game.state?.char;
    if (!c || game.world !== game.surface) return;
    if (game.quests.stageId('lord_of_the_coast') === 'hunt' && !findActor(game, 'lord_of_the_coast')) {
      const isl = game.surface.islands.find((i) => i.id === 'dawn_island');
      const dock = isl?.docks[0];
      if (!dock) return;
      const tx = dock.moor.x, ty = dock.moor.y + 16;
      if (game.world.distance(game.player.x, game.player.y, tx, ty) < 26 && game.world.isLiquid(tx, ty)) {
        const k = seaBoss(game, { id: 'lord_of_the_coast', name: 'Lord of the Coast', title: 'Sea King of Foosha Bay', level: 12, hpMul: 3.2, color: '#1e88e5', breakthrough: 3 }, tx, ty);
        k.npcId = 'lord_of_the_coast';
        game.ui.banner('LORD OF THE COAST', 'Sea King', 'The water boils. Something ancient is hungry.', 4);
      }
    }
    // Loguetown square (for whichever quest is waiting on it: this one, or the
    // main story's — which you may reach after this one has moved on)
    if (game.currentIsland?.id === 'polestar_islands' && game.quests.active().some(({ s, def }) => def.stages[s.stage]?.goal?.event === 'saw_platform')) {
      const t = game.currentIsland.towns[0];
      if (t && game.world.distance(game.player.x, game.player.y, t.plaza.x, t.plaza.y) < 5) {
        game.emit('questEvent', 'saw_platform');
        game.ui.banner('The Execution Platform', 'Loguetown', '"My treasure? If you want it, you can have it!" — twenty-two years ago, on this very spot.', 6);
      }
    }
  });
  game.on('enterIsland', (isl) => {
    const c = game.state?.char;
    if (!c) return;
    if (isl.id === 'polestar_islands' && !game.quests.state('town_of_beginning')) game.quests.start('town_of_beginning');
    if (isl.id === 'polestar_islands' && c.bounty > 0 && !c.flags.escapedLoguetown) {
      game.ui.banner('The White Hunter', 'Loguetown Marine Base', 'Captain Smoker has seen your wanted poster. Get to the Grand Line — or get caught.', 5);
    }
  });
  // leaving Loguetown alive by sea = escaped Smoker
  game.on('enterRegion', () => {
    const c = game.state?.char;
    if (c && c.bounty > 0 && game.player.mode === 'sail' && game.lastIslandName === 'Polestar Islands' && !c.flags.escapedLoguetown && awayFrom(game, 'polestar_islands', 120)) {
      c.flags.escapedLoguetown = true;
    }
  });
  game.on('knockout', (a, att) => {
    const c = game.state?.char;
    if (!c) return;
    // "Dragon's gale" — a hooded man intervenes when Smoker has you
    if (a.isPlayer && att && att.npcId === 'smoker' && Math.random() < 0.6) {
      setTimeout(() => {
        if (game.player.state !== 'knocked') return;
        game.lives.k = null;
        game.player.state = 'idle';
        game.player.hp = Math.round(game.player.d.maxHp * 0.4);
        game.env.storm = 1; game.env.stormTarget = 0.9;
        const sm = findActor(game, 'smoker');
        if (sm) sm.knock(12, 0);
        game.ui.banner('A Sudden Gale', '', '"...Why are you getting in my way, Dragon?!" — a hooded man stands in the storm. When you look again, he is gone.', 6);
        c.flags.escapedLoguetown = true;
        despawn(game, 'smoker'); despawn(game, 'tashigi');
      }, 1500);
    }
  });
  // Koshiro spar victory → Kuina's promise
  game.on('knockout', (a) => {
    if (a.spar === 'koshiro' && game.quests.stageId('kuina_promise') === 'spar' && /ittoryu|nitoryu|santoryu/.test(game.player.style)) game.emit('questEvent', 'beat_koshiro');
  });
  // Gaimon's chests (placed on the cliff)
  game.spawner.addBuilder(({ island }) => {
    if (island.id !== 'rare_animals') return;
    const s = island.spots.gaimon;
    if (!s || island._chests) return;
    island._chests = true;
    for (let k = 0; k < 2; k++) game.world.objects.add({ kind: 'chest', x: s.x + 3 + k * 1.6, y: s.y - 3, block: true, key: 'gaimon' + k, empty: true, tier: 0 });
  });
  game.on('openChest', (o) => {
    if (o.key && o.key.startsWith('gaimon') && game.quests.stageId('gaimon_treasure') === 'check') {
      game.log('The chest is empty. Completely empty.', '#b0bec5');
      game.emit('questEvent', 'gaimon_chest');
    }
  });
}

// where the events that finish quest steps happen (for their waypoints)
const places = {
  saw_platform: { island: 'polestar_islands', town: 'loguetown', place: 'The execution platform, Loguetown' },
  gaimon_chest: { island: 'rare_animals', spot: 'gaimon', ox: 3.8, oy: -3, place: 'Gaimon\'s treasure chests' },
  // (the mouth of the current up Reverse Mountain from the Blue you're in)
  entered_grand_line: (g) => {
    const M = g.world === g.surface ? g.surface.reverseMountain : null, p = g.player;
    if (!M?.mouths || !p) return null;
    let best = null, bd = Infinity;
    for (const m of Object.values(M.mouths)) { const d = g.world.distance(p.x, p.y, m.x, m.y); if (d < bd) { bd = d; best = m; } }
    return best ? { x: best.x, y: best.y, place: 'Reverse Mountain' } : null;
  },
};

export default { id: 'east_blue', npcs, groups, quests, places, install, dynamicIds: ['lord_of_the_coast'] };
export { C, count, addItem, persist };
