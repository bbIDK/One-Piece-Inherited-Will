// North Blue content pack: the cold northern sea.
//
// Each island keeps its own canon moment, as the East Blue pack does (its
// Gray Terminal fire is a flashback event played "now"):
//  * The Donquixote era, 16–13 years before the Straw Hats: the raid on
//    Rakesh, the Donquixote Family's junkyard base in Spider Miles, the boy
//    from Flevance who walks in strapped with grenades, the Ope Ope no Mi
//    deal on Minion Island, and the birth of the Heart Pirates on Swallow
//    Island (with Wolf, Rudd and Artur Bacca from One Piece novel Law).
//  * Lvneel and Noland's 400-year-old legend, Notice, Kuen Village, Downs,
//    Deul, Whiteland and the roaming Germa Kingdom (Germa 66 as the Straw Hats
//    would find it) are told as they stand.
// The quest chain "The Boy with the Grenades" → "The Ope Ope no Mi" → "The
// Heart Pirates" follows Trafalgar Law's canon story from an outsider's side.
// All ids are prefixed "nb_" (registries are global).
//
// Bounties: Machvise's 11,000,000 is canon. The other Donquixote officers'
// canon bounties (Senor Pink 58M, Gladius 31M, Trebol/Diamante/Pica 99M) date
// from Dressrosa, 16 years after this snapshot, so lower period values are used
// here (the Blue-sea scale, and the 30M Impel Down threshold, stay sane).
// Barrels' and Bacca's bounties are unknown in canon.
import { spawnNow, findActor, aggro, seaBoss, despawn } from './helpers.js';

const at = (ctx, id, stage) => ctx.game.quests.stageId(id) === stage;
const done = (ctx, id) => ctx.game.quests.isDone(id);
const stageOf = (g, id) => g.quests.stageId(id);
const spawnAggro = (g, id) => { const a = spawnNow(g, id); if (a) aggro(g, a); return a; };

// recurring looks
const DOFFY_LOOK = { hair: 'short', hairColor: '#fdd835', top: '#fafafa', bottom: '#ff7043', coat: '#f06292', goggles: true, grin: true, skin: '#f1c9a0' };
const CORA_LOOK = { hair: 'short', hairColor: '#fdd835', top: '#fafafa', bottom: '#1a237e', coat: '#212121', grin: true, skin: '#f9dcc4' };
const LAW_LOOK = { hair: 'short', hairColor: '#212121', top: '#eceff1', bottom: '#5d4037', hat: 'beanie', hatColor: '#fafafa', skin: '#f1c9a0' };

// ------------------------------------------------------------------ NPCs
const npcs = [
  // ================================================================ Rakesh
  {
    id: 'nb_brandt', name: 'Harbourmaster Brandt', title: 'Harbourmaster of Rakesh', island: 'rakesh', at: { town: 'rakesh_port', building: "Harbourmaster's Office" },
    look: { hair: 'short', hairColor: '#9e9e9e', top: '#37474f', bottom: '#263238', coat: '#1a237e', hat: 'captain', hatColor: '#1a237e', skin: '#e0ac7e' }, level: 7,
    marker: (c, g) => {
      if (!g.quests.state('nb_rakesh_raid')) return '!';
      if (stageOf(g, 'nb_rakesh_raid') === 'report' || stageOf(g, 'nb_rakesh_strongbox') === 'report') return '?';
      if (g.quests.isDone('nb_rakesh_raid') && !g.quests.state('nb_rakesh_strongbox')) return '!';
      return null;
    },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nb_rakesh_strongbox')) return `"Rakesh pays its debts. As long as I keep this harbour, you'll have a berth in it."`;
            if (done(ctx, 'nb_rakesh_raid')) return `"The raiders came from Spider Miles, north-east of here — the Donquixote Family nests in the old waste plant. And they carried off the harbour strongbox. Every berry this town had to rebuild with."`;
            if (ctx.quest('nb_rakesh_raid')) return `"Pink sails in the bay! Ring the bell, then hold the quay. We're fishermen and dockhands — we can't fight monsters like these alone!"`;
            return `"Rakesh used to run guns for the Donquixote Family. Then the council got greedy and signed with another crew. Doflamingo doesn't forgive. My lookouts saw pink sails at dawn — his 'family' is coming to make an example of us."`;
          },
          choices: [
            { text: 'I\'ll stand with Rakesh.', if: () => !ctx.quest('nb_rakesh_raid'), do: (c) => c.startQuest('nb_rakesh_raid'), end: true },
            { text: 'The raiders are beaten.', if: () => at(ctx, 'nb_rakesh_raid', 'report'), do: (c) => c.complete('nb_rakesh_raid'), next: 'thanks' },
            { text: 'I\'ll get your strongbox back.', if: () => done(ctx, 'nb_rakesh_raid') && !ctx.quest('nb_rakesh_strongbox'), do: (c) => c.startQuest('nb_rakesh_strongbox'), end: true },
            { text: 'Here is Rakesh\'s strongbox.', if: () => at(ctx, 'nb_rakesh_strongbox', 'report') && ctx.has('nb_rakesh_strongbox'), do: (c) => { c.take('nb_rakesh_strongbox', 1); c.complete('nb_rakesh_strongbox'); }, next: 'box' },
            { text: 'Who are the Donquixote Family?', next: 'who' },
            { text: 'Goodbye.', end: true },
          ],
        },
        who: { text: `"Pirates. Brokers. Smugglers. Their captain wears a pink feather coat and laughs like 'fuffuffu' — underground they call him Joker. His officers are monsters: a boy who makes things burst like balloons, a man who swims through paving stones..."`, next: 'a' },
        thanks: { text: `"You broke the raid! The council voted you a purse — and Greta, our pilot, hasn't stopped asking about you. ...But they took the harbour strongbox with them. Everything Rakesh had."`, next: 'a' },
        box: { text: `"Every berry still in it! You walked into Doflamingo's junkyard and walked OUT again? Take your share. And if anyone in the North Blue asks, Rakesh vouches for you."` },
      },
    }),
  },
  {
    id: 'nb_greta', name: 'Greta Voss', title: 'Harbour pilot of Rakesh', island: 'rakesh', at: { town: 'rakesh_port', building: 'Navigator Supplies (Log Poses)' },
    look: { hair: 'ponytail', hairColor: '#d84315', top: '#5d4037', bottom: '#37474f', coat: '#8d6e63', hat: 'tricorne', hatColor: '#3e2723', skin: '#f1c9a0' }, level: 6,
    recruit: { role: 'navigator', requires: (c, g) => g.quests.isDone('nb_rakesh_raid'), pitch: `"Take me with you? ...Ha! I thought you'd never ask. My charts have been packed for three years. Let's go and see if the Grand Line is as mad as they say."` },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nb_rakesh_raid')
            ? `"You fought for a town that isn't even yours. I've charted every reef between here and Reverse Mountain... and I'm sick of watching other people sail away."`
            : `"Log Poses, charts, compasses. You'll want a Log Pose before Reverse Mountain — its canal opens at the south-east corner of the North Blue. Past it, an ordinary compass just spins."`),
          choices: [
            { text: 'Browse', do: (c) => c.open('shop', { shop: 'navigator', building: { name: 'Navigator Supplies', role: 'shop' } }) },
            { text: 'Tell me about the North Blue.', next: 'map' },
            { text: 'Bye, Greta.', end: true },
          ],
        },
        map: { text: `"West: Spider Miles and its junkyards — stay out of the waste plant. North: Flevance, what's left of it, and grimy Downs. The middle: Lvneel, Noland's home, and rich old Notice. East: Deul, Rubeck, Minion and Swallow. And sometimes the sea itself moves — Germa's snail-ships, out by the Red Line."`, next: 'a' },
      },
    }),
  },
  {
    id: 'nb_giolla', name: 'Giolla', title: 'Donquixote Pirates officer ("Ato Ato no Mi")', island: 'rakesh', at: { spot: 'rakesh_harbour', ox: -2 }, hostile: true, named: true, faction: 'pirate', level: 8,
    look: { hair: 'bun', hairColor: '#ff9800', top: '#ec407a', bottom: '#ad1457', skin: '#f1c9a0' }, style: 'brawler', moves: ['nb_broken_fu', 'nb_art_art'], skill: 0.3,
    alert: 'Such an UGLY little port. I shall make it into art!', barks: ['Hold still, darling — you\'re my canvas!', 'Ohohoho! How vulgar!'],
    when: (c, g) => stageOf(g, 'nb_rakesh_raid') === 'harbour',
  },
  {
    id: 'nb_machvise', name: 'Machvise', title: 'Donquixote Pirates officer ("Ton Ton no Mi")', island: 'rakesh', at: { spot: 'rakesh_harbour', ox: 2 }, hostile: true, named: true, faction: 'pirate', level: 10,
    look: { hair: 'long', hairColor: '#fdd835', top: '#c62828', bottom: '#8e0000', hat: 'captain', hatColor: '#c62828', skin: '#f1c9a0' }, bulk: 1.5, style: 'brawler', moves: ['nb_jutton_vise', 'brawl_tackle'], skill: 0.25,
    bounty: 11000000, infamy: true, alert: 'Ten tons, coming right down on you!', barks: ['Ton Ton!', 'Heavy, isn\'t it?!'],
    when: (c, g) => stageOf(g, 'nb_rakesh_raid') === 'harbour',
  },
  {
    id: 'nb_senor_pink', name: 'Senor Pink', title: 'Donquixote Pirates officer ("Sui Sui no Mi")', island: 'rakesh', at: { spot: 'rakesh_warehouse' }, hostile: true, boss: true, hpMul: 0.9, faction: 'pirate', level: 12,
    look: { hair: 'short', hairColor: '#3e2723', top: '#f48fb1', bottom: '#212121', coat: '#263238', goggles: true, skin: '#e0ac7e' }, style: 'brawler', moves: ['nb_terra_swim', 'nb_nekomimi_punch', 'nb_nyannyan_suplex'], skill: 0.4,
    bounty: 18000000, infamy: true, breakthrough: 3,
    alert: 'A man doesn\'t explain himself. He just swims.', barks: ['Hard-boiled...', 'The ground is my sea.'],
    when: (c, g) => stageOf(g, 'nb_rakesh_raid') === 'pink',
  },
  {
    id: 'nb_gladius', name: 'Gladius', title: 'Donquixote Pirates officer ("Pamu Pamu no Mi")', island: 'rakesh', at: { spot: 'rakesh_light' }, hostile: true, boss: true, hpMul: 1.0, faction: 'pirate', level: 14,
    look: { hair: 'spiky', hairColor: '#4fc3f7', top: '#212121', bottom: '#212121', coat: '#212121', hat: 'pinkhat', hatColor: '#212121', goggles: true, skin: '#f1c9a0' },
    style: 'sniper', weapon: 'gun', moves: ['nb_punc_bala', 'nb_jirai_punc', 'nb_met_punc'], ranged: true, prefRange: 5, skill: 0.45,
    bounty: 14000000, infamy: true, breakthrough: 3,
    alert: 'You dare stand in the Young Master\'s way?! I\'ll burst you like a balloon!', barks: ['Punc!', 'Don\'t... make me... ANGRY!'],
    phases: [{ at: 0.4, run: (a, g) => { g.fx.text(a.x, a.y - 2.4, 'PUNC ROCK FEST!', '#ffab40', 0.6); a.addBuff({ id: 'nb_gladius_rage', name: 'Bursting Rage', dur: 45, mods: { damage: 1.3 } }); } }],
    when: (c, g) => stageOf(g, 'nb_rakesh_raid') === 'gladius',
  },

  // ========================================================== Spider Miles
  {
    id: 'nb_law_kid', name: 'Law', title: 'A boy blotched with white', island: 'spider_miles', at: { spot: 'dq_gate', ox: -3 },
    look: LAW_LOOK, scale: 0.7, level: 4, ai: 'idle',
    when: (c, g) => !g.quests.state('nb_boy_grenades') || stageOf(g, 'nb_boy_grenades') === 'gate',
    marker: (c, g) => (!g.quests.state('nb_boy_grenades') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (ctx.quest('nb_boy_grenades')
            ? `"Well? Are you coming or not? The gate's right there."`
            : `(A boy of about ten walks toward the waste plant, his skin blotched with white. Grenades are strapped all over him.) "...Move. I'm joining the Donquixote Family. If they say no, I blow up their hideout. Either way, something gets destroyed."`),
          choices: [
            { text: 'Why would a kid want to join pirates?', if: () => !ctx.quest('nb_boy_grenades'), next: 'why' },
            { text: 'Fine. I\'ll walk you to the gate.', if: () => !ctx.quest('nb_boy_grenades'), do: (c) => c.startQuest('nb_boy_grenades'), end: true },
            { text: 'Leave him be.', end: true },
          ],
        },
        why: { text: `"My town was called the White City. Flevance. The neighbours said our sickness was catching, so they shot everyone who tried to leave. My parents. My little sister, Lami. I hid under the dead to get out. ...And the World Government knew all along."`, next: 'a' },
      },
    }),
  },
  {
    id: 'nb_law_scrap', name: 'Law', title: 'The newest member of the Donquixote Family', island: 'spider_miles', at: { spot: 'dq_window' },
    look: LAW_LOOK, scale: 0.7, level: 5, ai: 'idle',
    when: (c, g) => (stageOf(g, 'nb_boy_grenades') === 'talk' || g.quests.isDone('nb_boy_grenades')) && !g.quests.state('nb_ope_ope'),
    marker: (c, g) => (stageOf(g, 'nb_boy_grenades') === 'talk' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (at(ctx, 'nb_boy_grenades', 'talk')) return `(The boy crawls out of the scrap, blood running down his forehead. He glares up at the broken window.) "...That tall clown threw me out a window. Doesn't matter. I'm going back up. They're going to take me."`;
            if (done(ctx, 'nb_white_city')) return `"You went to Flevance? ...Then you saw it. Don't call it a tragedy. It was MURDER. And the World Government watched and did nothing."`;
            return `"I'm part of the family now. Diamante teaches me the sword, Gladius the gun, Lao G the fists. I read 'Sora, Warrior of the Sea' at night. ...Three years. I'll use every day of them."`;
          },
          choices: [
            { text: 'Why go back to them?', if: () => at(ctx, 'nb_boy_grenades', 'talk'), next: 'flev' },
            { text: 'Leave him be.', end: true },
          ],
        },
        flev: { text: `"Amber Lead Syndrome. White spots, then the pain, then you die. Three years, maybe less. So I'll spend them destroying the world that did this. ...Go away. I don't need anybody's pity."`, onEnter: (c) => c.complete('nb_boy_grenades') },
      },
    }),
  },
  {
    id: 'nb_corazon', name: 'Corazon', title: 'Elite officer of the Donquixote Pirates (never speaks)', island: 'spider_miles', at: { town: 'dq_hideout', plaza: true, ox: 6 },
    look: CORA_LOOK, scale: 1.3, level: 30, faction: 'neutral', ai: 'idle',
    when: (c, g) => !g.quests.state('nb_ope_ope'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (ctx.char.faction === 'marine') return `(The towering man glances at your Marine cap. He scribbles on a notepad and holds it up: "WRONG PLACE FOR THAT HAT. LEAVE BEFORE HE SEES IT." Then he trips over a pipe and falls flat on his face.)`;
            if (done(ctx, 'nb_boy_grenades')) return `(He writes on his notepad: "I HATE KIDS." He tears off the page and burns it with his cigarette — and his feathered sleeve catches fire. He stares at you, daring you to laugh.)`;
            return `(A towering man in a black feather coat watches you through a haze of cigarette smoke. His painted smile never moves. He holds up a notepad: "GO HOME.")`;
          },
          choices: [
            { text: 'Why don\'t you ever talk?', next: 'mute' },
            { text: 'Leave', end: true },
          ],
        },
        mute: { text: `(He taps his throat and shakes his head. Strange... when he walked across the scrap metal just now, his boots made no sound at all. None.)` },
      },
    }),
  },
  {
    id: 'nb_doflamingo', name: 'Donquixote Doflamingo', title: '"Heavenly Yaksha", captain of the Donquixote Pirates', island: 'spider_miles', at: { town: 'dq_hideout', building: 'Donquixote Family Hideout' },
    look: DOFFY_LOOK, scale: 1.35, level: 80, fixedPower: 99999, faction: 'neutral', ai: 'idle',
    fruit: 'ito', fruitMastery: 90, moves: ['ito_overheat', 'ito_parasite', 'ito_fivecolor'], haki: { armament: 60, observation: 60, conqueror: 40 },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (at(ctx, 'nb_rakesh_strongbox', 'escape')) return `"Fuffuffuffu! So you're the rat who knocked Trebol down. Relax — I'm in a generous mood today. Run along... before I change my mind."`;
            if (ctx.char.faction === 'marine') return `"Fuffuffu... a Marine, all alone in my junkyard? Brave. Tell your masters I send my regards. ...Or don't. I'll deliver them myself, one day."`;
            return `"Fuffuffuffu! A new face. Everyone who comes here wants something — money, revenge, a family. Careful how you answer. In this family, betrayal is paid for in blood."`;
          },
          choices: [
            { text: 'What are you, exactly?', next: 'what' },
            { text: 'I\'m leaving.', end: true },
          ],
        },
        what: { text: `"A pirate. A broker — the 'Joker', if you do business underground. And once... well. Once I was something far above all of you. The world owes me a crown, and I intend to collect it. Fuffuffu."` },
      },
    }),
  },
  {
    id: 'nb_trebol', name: 'Trebol', title: 'Top executive of the Donquixote Pirates ("Beta Beta no Mi")', island: 'spider_miles', at: { spot: 'dq_vault' }, hostile: true, boss: true, hpMul: 1.2, faction: 'pirate', level: 17,
    look: { hair: 'long', hairColor: '#37474f', top: '#1565c0', bottom: '#212121', coat: '#0d47a1', goggles: true, skin: '#e0ac7e' }, scale: 1.35,
    style: 'brawler', moves: ['nb_beta_chain', 'nb_beto_launcher', 'nb_betton_meteora'], skill: 0.45,
    bounty: 45000000, infamy: true, breakthrough: 3,
    alert: 'Nnnee~ nee nee! Stealing from Doffy? Bad, bad, BAD! Behehehe!', barks: ['Nee nee! Nee nee!', 'Behehehe!', 'Sticky, sticky~'],
    when: (c, g) => stageOf(g, 'nb_rakesh_strongbox') === 'trebol',
  },
  {
    id: 'nb_diamante', name: 'Diamante', title: 'Top executive of the Donquixote Pirates ("Hira Hira no Mi")', island: 'spider_miles', at: { spot: 'dq_arena' }, boss: true, hpMul: 1.1, faction: 'pirate', level: 19,
    look: { hair: 'long', hairColor: '#8d6e63', hat: 'cowboy', hatColor: '#d7ccc8', top: '#f48fb1', bottom: '#6a1b9a', coat: '#b71c1c', skin: '#f1c9a0' }, scale: 1.5,
    style: 'ittoryu', weapon: 'sword', moves: ['nb_hangetsu_glaive', 'nb_vipera_glaive', 'nb_hira_release'], skill: 0.5,
    bounty: 45000000, infamy: true, breakthrough: 3, alert: 'Uhahahaha! Let\'s see how long you last!', barks: ['Uhahahaha!', 'Is that all?!'],
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: `"Uhahahaha! Another stray who wants to join? Over a hundred brats came crawling to us this year. Not one lasted two days." (He rests a hand on his sword.) "Want to see what scared them off?"`,
          choices: [
            { text: 'Show me. (Duel Diamante)', do: (c) => aggro(c.game, findActor(c.game, 'nb_diamante')), end: true },
            { text: 'Not today.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'nb_pica', name: 'Pica', title: 'Top executive of the Donquixote Pirates ("Ishi Ishi no Mi")', island: 'spider_miles', at: { spot: 'dq_stoneyard' }, boss: true, hpMul: 1.3, faction: 'pirate', level: 20,
    look: { hair: 'long', hairColor: '#b39ddb', top: '#fbc02d', bottom: '#212121', hat: 'horns', hatColor: '#fbc02d', skin: '#e0ac7e' }, bulk: 1.6, scale: 1.55,
    style: 'brawler', moves: ['nb_pulpostone', 'nb_ishiusu', 'brawl_headbutt'], skill: 0.4,
    bounty: 45000000, infamy: true, breakthrough: 3, alert: '(in a squeaky little voice) YOU LAUGHED.', barks: ['(squeak) Die!', '(squeak) Stone does not forgive!'],
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: `(A giant in golden armour looms over you. He opens his mouth — and out comes a tiny, squeaky, high-pitched voice.) "...What are you looking at?"`,
          choices: [
            { text: '(Say nothing.)', next: 'b' },
            { text: '(Burst out laughing.)', do: (c) => { c.log('The ground itself rises up behind Pica.', '#ff8a80'); aggro(c.game, findActor(c.game, 'nb_pica')); }, end: true },
          ],
        },
        b: { text: `(squeaky) "Good. The last man who laughed at my voice is part of that wall now." (He points at a slab of scrap and stone. You decide not to look too closely.)` },
      },
    }),
  },
  {
    id: 'nb_lao_g', name: 'Lao G', title: 'Donquixote Pirates officer (martial artist)', island: 'spider_miles', at: { town: 'dq_hideout', plaza: true, ox: -2 },
    look: { hair: 'bald', skin: '#e0ac7e', top: '#1565c0', bottom: '#c62828' }, scale: 0.75, level: 22, faction: 'neutral', ai: 'idle',
    dialogue: () => ({ start: 'a', nodes: { a: { text: `"G. G! A guest of the family, hmm? Then learn our blood law, youngster: whoever harms the Young Master's family pays in blood. G! ...I teach the brats to fight. The white-spotted one punches like he wants to die."` } } }),
  },
  {
    id: 'nb_baby5', name: 'Baby 5', title: 'The youngest of the Donquixote Family', island: 'spider_miles', at: { town: 'dq_hideout', plaza: true, ox: 1 },
    look: { hair: 'long', hairColor: '#212121', top: '#6d4c41', bottom: '#4e342e', skin: '#f9dcc4' }, scale: 0.6, level: 3, ai: 'idle',
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: `"Buffalo put a banana peel on the stairs for Corazon! He ALWAYS falls for it! ...Hey. Hey! Do you need me for anything? I can do anything! If you need me, just say so!"`,
          choices: [
            { text: 'Where are you from, kid?', next: 'home' },
            { text: 'I don\'t need anything.', next: 'cry' },
            { text: 'Bye.', end: true },
          ],
        },
        home: { text: `"A village called Kuen. Mama said she couldn't feed me... and left me on the mountain." (She smiles too brightly.) "But the Young Master found me! Now I'm needed. Everyone here NEEDS me."`, onEnter: (c) => c.setFlag('nbFoundBaby5') },
        cry: { text: `(Her lip trembles. "You don't... need me?" Tears well up in her eyes. From across the yard, Diamante glares at you.)` },
      },
    }),
  },
  {
    id: 'nb_buffalo', name: 'Buffalo', title: 'A boy with propeller-shaped hair', island: 'spider_miles', at: { town: 'dq_hideout', plaza: true, ox: 2.5 },
    look: { hair: 'spiky', hairColor: '#212121', top: '#fdd835', bottom: '#5d4037', skin: '#f1c9a0' }, scale: 0.8, level: 5, ai: 'idle',
    dialogue: () => ({ start: 'a', nodes: { a: { text: `"Shhh! I'm setting up a prank for Corazon, dasuyan. He falls for EVERYTHING — hot tea, banana peels, a bucket on the door... And he never yells! He can't. He's mute, dasuyan."` } } }),
  },
  {
    id: 'nb_gus', name: 'Old Gus', title: 'Scrapyard shipwright', island: 'spider_miles', at: { town: 'spider_miles_port', building: 'Scrapyard Shipwright' },
    look: { hair: 'bald', skin: '#e0ac7e', top: '#795548', bottom: '#3e2723', goggles: true }, level: 5,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: `"Need a hull? Half my boats are built from what the Donquixote Family throws out of the plant. Don't ask where the planks come from, and I won't ask where you're sailing."`,
          choices: [{ text: 'Shipyard', do: (c) => c.open('shipwright', {}) }, { text: 'Goodbye.', end: true }],
        },
      },
    }),
  },

  // ============================================================== Flevance
  {
    id: 'nb_konrad', name: 'Konrad', title: 'Gravekeeper of the White Town', island: 'flevance', at: { town: 'whiteland_town', building: "Gravekeeper's Lodge" },
    look: { hair: 'buzz', hairColor: '#bdbdbd', top: '#546e7a', bottom: '#37474f', coat: '#455a64', scarEye: true, skin: '#e0ac7e' }, level: 12,
    marker: (c, g) => (!g.quests.state('nb_white_city') ? '!' : stageOf(g, 'nb_white_city') === 'choice' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nb_white_city')) return `"The dead don't need the truth. The living do. ...Thank you for carrying it as far as you did. The lodge is yours whenever you need a bed."`;
            if (at(ctx, 'nb_white_city', 'choice')) return `"You found it. A hundred years of lies in one envelope — and the Government came running to take it back." (He leans on his shovel.) "So. What will you do with it?"`;
            if (ctx.quest('nb_white_city')) return `"The hospital is east of the square, the palace north. Mind the white dust — it's only poison if you breathe it for a lifetime."`;
            return `"Welcome to the White Town. Or what we left of it." (He leans on his shovel.) "I stood on the quarantine line. We were told the white sickness spread by touch, so we shot anyone who crossed. Children too. It never spread. So I stay, and I dig."`;
          },
          choices: [
            { text: 'Rest at the lodge.', do: (c) => c.open('inn') },
            { text: 'What really happened here?', if: () => !ctx.quest('nb_white_city'), next: 'story' },
            { text: 'Give the survey to the Revolutionary.', if: () => at(ctx, 'nb_white_city', 'choice') && ctx.has('nb_amber_survey'), do: (c) => { c.take('nb_amber_survey', 1); c.setFlag('nbSurveyRevolution'); c.complete('nb_white_city'); }, next: 'rev' },
            { text: 'Burn it. No one would believe it.', if: () => at(ctx, 'nb_white_city', 'choice') && ctx.has('nb_amber_survey'), do: (c) => { c.take('nb_amber_survey', 1); c.setFlag('nbSurveyBurned'); c.complete('nb_white_city'); }, next: 'burn' },
            { text: 'I\'ll keep it. One day the world will listen.', if: () => at(ctx, 'nb_white_city', 'choice'), do: (c) => { c.setFlag('nbSurveyKept'); c.complete('nb_white_city'); }, next: 'keep' },
            { text: 'Goodbye.', end: true },
          ],
        },
        story: {
          text: `"Amber Lead. The white ore that made this town rich — paint, dishes, sweets, even the soil. It poisons you slowly, down the generations. Somebody knew: the royals fled on Government ships the week the quarantine began. Look for proof in the palace, north. But see the hospital first. Dr. Trafalgar's."`,
          choices: [{ text: 'I\'ll find the proof.', do: (c) => c.startQuest('nb_white_city'), end: true }, { text: 'It\'s not my business.', end: true }],
        },
        rev: { text: `(The hooded woman from the chapel takes the envelope without a word.) "The Revolutionary Army will see this printed from here to Mary Geoise." (Konrad watches her go.) "...Maybe. Maybe."` },
        burn: { text: `(The paper curls and blackens in the lodge stove.) "...Aye. They'd call it a forgery and hang whoever carried it. The dead will have to wait a while longer."` },
        keep: { text: `"Then keep it close, and keep your head down. People have vanished for less than that envelope."` },
      },
    }),
  },
  {
    id: 'nb_mervin', name: 'Mervin', title: 'Salvager (and amber smuggler)', island: 'flevance', at: { town: 'whiteland_town', building: 'Salvage Stall' },
    look: { hair: 'curly', hairColor: '#6d4c41', top: '#795548', bottom: '#4e342e', hat: 'bandana', hatColor: '#9e9e9e', skin: '#f1c9a0' }, level: 6,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: `"Salvage, friend! Dishes, lamps, a little Amber Lead if you've the stomach for it — collectors on the Grand Line pay a fortune for 'Flevance White'. Poison? Only if you eat it every day for fifty years. Probably."`,
          choices: [
            { text: 'Browse the salvage', do: (c) => c.open('shop', { shop: 'nb_flevance_salvage', building: { name: 'Salvage Stall', role: 'shop' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'nb_rev_agent', name: 'Hooded Stranger', title: 'Revolutionary Army', island: 'flevance', at: { town: 'whiteland_town', building: 'Chapel of the White Town' }, faction: 'revolutionary', level: 18,
    look: { hair: 'long', hairColor: '#212121', top: '#3e2723', bottom: '#212121', coat: '#4e342e', skin: '#e0ac7e' },
    when: (c, g) => stageOf(g, 'nb_white_city') === 'choice',
    dialogue: () => ({ start: 'a', nodes: { a: { text: `"The World Government buries its crimes in white dust and calls it peace. If you have proof, the Revolutionary Army can make the whole world read it." (She glances toward the lodge.) "Decide with the gravekeeper. He's earned a say."` } } }),
  },
  {
    id: 'nb_moritz', name: 'Agent Moritz', title: 'Cipher Pol No. 5', island: 'flevance', at: { spot: 'palace_ruins' }, hostile: true, boss: true, hpMul: 1.0, faction: 'cp', level: 16,
    look: { hair: 'short', hairColor: '#212121', top: '#212121', bottom: '#212121', coat: '#263238', goggles: true, skin: '#f1c9a0' },
    style: 'rokushiki', moves: ['roku_soru', 'roku_rankyaku', 'roku_tekkai'], skill: 0.55, breakthrough: 3, lethal: true,
    alert: 'That document is World Government property. Hand it over — and forget you ever read it.', barks: ['There is no such thing as Amber Lead Syndrome.', 'Justice keeps its secrets.'],
    when: (c, g) => stageOf(g, 'nb_white_city') === 'agents',
  },

  // ================================================================ Lvneel
  {
    id: 'nb_pell', name: 'Archivist Pell', title: 'Keeper of the Royal Archive of Lvneel', island: 'lvneel', at: { town: 'lvneel_town', building: 'Royal Archive' },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#6d4c41', bottom: '#3e2723', coat: '#4e342e' }, level: 4,
    marker: (c, g) => (!g.quests.state('nb_liar_noland') ? '!' : ['archive', 'report'].includes(stageOf(g, 'nb_liar_noland')) ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nb_liar_noland')) return `"Carry the log well. If you ever reach Jaya, find Noland's descendant, Montblanc Cricket. Tell him the archive of Lvneel remembers the truth — even if the Crown never will."`;
            if (at(ctx, 'nb_liar_noland', 'report')) return `"The Sea King is slain? Then you have done what the picture book says a KING did." (He smiles thinly.) "The log tells it otherwise: ADMIRAL Noland dragged that beast aboard alone, while His Majesty hid below deck."`;
            if (at(ctx, 'nb_liar_noland', 'archive')) return `"You have the picture book? Good — you know what the Crown tells children. Now read what it wrote in private." (He unlocks a cabinet sealed with royal wax.) "The ship's log of the royal expedition to Jaya. Four hundred years old."`;
            if (ctx.char.race === 'skypiean') return `"...Wings? Then the stories are true. Noland wrote of fish that swim through clouds, and a golden bell ringing above Jaya. Welcome to the Royal Archive, child of the sky. I have thirty years of questions for you."`;
            return `"Welcome to the Royal Archive. Every child in the North Blue learns 'Liar Noland' before they can read. I have spent thirty years in these stacks, and I will tell you a secret: I do not believe a word of it."`;
          },
          choices: [
            { text: 'Browse the archive.', do: (c) => c.open('library') },
            { text: 'Why don\'t you believe it?', if: () => !ctx.quest('nb_liar_noland'), next: 'why' },
            { text: 'Let\'s find out the truth.', if: () => !ctx.quest('nb_liar_noland'), do: (c) => c.startQuest('nb_liar_noland'), end: true },
            { text: 'Read the sealed log.', if: () => at(ctx, 'nb_liar_noland', 'archive'), next: 'log' },
            { text: 'The Sea King is dead.', if: () => at(ctx, 'nb_liar_noland', 'report'), do: (c) => c.complete('nb_liar_noland'), next: 'end' },
            { text: 'Goodbye.', end: true },
          ],
        },
        why: { text: `"Noland was an admiral and a botanist. He took his crew into the Grand Line and brought them home — more than once. Liars don't come home from the Grand Line. And who published the picture book? The very king who hanged him. Buy a copy next door and read it with a clear head."`, next: 'a' },
        log: { text: `"'A Sea King rose off our bow. His Majesty fled below. Admiral Noland dove into the sea with his sword and a rope, and the beast was served at supper.' ...There are Sea Kings off Lvneel to this day. Stand where Noland died — then go and do what the book claims a king did."`, onEnter: (c) => c.stage('nb_liar_noland', 'stand') },
        end: { text: `"Take this copy of the log — with Noland's own route to Jaya in the margins. Follow it if you ever sail the Grand Line. His descendant still dives for the City of Gold there, they say. And people laugh at him too."` },
      },
    }),
  },
  {
    id: 'nb_hedda', name: 'Hedda', title: 'Royal Bookshop of Lvneel', island: 'lvneel', at: { town: 'lvneel_town', building: 'Royal Bookshop' },
    look: { hair: 'bun', hairColor: '#8d6e63', top: '#6a1b9a', bottom: '#4a148c', skin: '#f9dcc4' }, level: 2,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: `"Picture books, sea charts, and this week's 'Sora, Warrior of the Sea'! Every child in the North Blue owns 'Liar Noland' — parents read it at bedtime. Lie, and you'll end up like Noland!"`,
          choices: [
            { text: 'Browse books', do: (c) => c.open('shop', { shop: 'nb_lvneel_books', building: { name: 'Royal Bookshop', role: 'shop' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'nb_ostrander', name: 'Master Ostrander', title: 'Royal Fencing Hall of Lvneel', island: 'lvneel', at: { town: 'lvneel_town', building: 'Royal Fencing Hall' }, trainer: 'nb_lvneel_fencing',
    look: { hair: 'ponytail', hairColor: '#bdbdbd', top: '#1a237e', bottom: '#fafafa', swords: 1, skin: '#f1c9a0' }, level: 20, style: 'ittoryu', weapon: 'sword',
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: `"They say Admiral Noland trained in this hall, before the Crown decided he had never been anything but a liar. The Lvneel style is plain: one blade, no flourishes, cut true."`,
          choices: [{ text: 'Train at the fencing hall', do: (c) => c.open('trainer', { trainer: 'nb_lvneel_fencing' }) }, { text: 'Goodbye.', end: true }],
        },
      },
    }),
  },
  {
    id: 'nb_corazon_lv', name: 'Corazon', title: 'Donquixote Pirates officer (far from home)', island: 'lvneel', at: { spot: 'lvneel_bench' },
    look: CORA_LOOK, scale: 1.3, level: 30, faction: 'neutral', ai: 'idle',
    when: (c, g) => g.quests.isDone('nb_boy_grenades') && (!g.quests.state('nb_ope_ope') || ['whiteland', 'call', 'rubeck'].includes(stageOf(g, 'nb_ope_ope'))),
    marker: (c, g) => (!g.quests.state('nb_ope_ope') ? '!' : stageOf(g, 'nb_ope_ope') === 'call' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (at(ctx, 'nb_ope_ope', 'call')) return `(Before you can speak, the Den Den Mushi in Corazon's coat rings. "Corazon. It's me." Doflamingo's voice. Corazon taps the receiver — three taps for yes, two for no. "...I've found the Ope Ope no Mi. We steal it, you eat it, you cure the brat." Click.)`;
            if (at(ctx, 'nb_ope_ope', 'rubeck')) return `(Corazon mouths two words: "RUBECK. SOUTH-EAST." Then he gets up, trips over the bench and lands face-first on the cobbles.)`;
            if (at(ctx, 'nb_ope_ope', 'whiteland')) return `(Corazon writes on his notepad: "WHITELAND ROYAL HOSPITAL. NORTH OF HERE. ASK FOR A DOCTOR WHO'LL TREAT HIM. I CAN'T GO IN — I BROKE THE LAST DOCTOR'S JAW.")`;
            return `(Corazon sits on a harbour bench beside the white-spotted boy, who is shivering. He writes: "SIX MONTHS. EVERY HOSPITAL IN THE NORTH BLUE. THEY CALL HIM A MONSTER." He looks at you for a long time. Then: "WILL YOU HELP US?")`;
          },
          choices: [
            { text: 'I\'ll help.', if: () => !ctx.quest('nb_ope_ope'), do: (c) => c.startQuest('nb_ope_ope'), next: 'help' },
            { text: '...Wait. Can you talk?', if: () => at(ctx, 'nb_ope_ope', 'call'), next: 'talk' },
            { text: 'Leave', end: true },
          ],
        },
        help: { text: `(He writes: "FIND ME ONE DOCTOR. WHITELAND ROYAL HOSPITAL, NORTH OF HERE. I'LL WAIT WITH THE KID." The boy doesn't even look up.)` },
        talk: {
          text: () => (ctx.char.faction === 'marine'
            ? `(Corazon breathes out — and speaks, low and cracked.) "You're a Marine too. Then keep this from your superiors until I say. That fruit can cure him — but Doffy wants it for something worse. I'm taking it first. The trade is on Rubeck Island, south-east of here. Find out where they're hiding it."`
            : `(Corazon breathes out — and speaks, low and cracked.) "...So now you know. That fruit can cure him. But Doffy wants it for something worse. I'm taking it first. The trade is on Rubeck Island, south-east of here. Find out where they're hiding it."`),
          onEnter: (c) => c.stage('nb_ope_ope', 'rubeck'),
        },
      },
    }),
  },
  {
    id: 'nb_law_lv', name: 'Law', title: 'A sick boy blotched with white', island: 'lvneel', at: { spot: 'lvneel_bench', ox: 1.5 },
    look: LAW_LOOK, scale: 0.75, level: 5, ai: 'idle',
    when: (c, g) => g.quests.isDone('nb_boy_grenades') && (!g.quests.state('nb_ope_ope') || ['whiteland', 'call', 'rubeck'].includes(stageOf(g, 'nb_ope_ope'))),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (at(ctx, 'nb_ope_ope', 'rubeck')
            ? `"...Cora-san can talk. He lied to everybody. Even to Doflamingo." (The boy almost smiles.) "A Devil Fruit that can cure me? I don't believe in anything anymore. But he does. Idiot."`
            : `(The boy shivers, the white patches creeping up his neck.) "Cora-san keeps dragging me to hospitals. They all scream the same thing: 'Get the white monster out.' ...It's pointless. I'm going to die anyway."`),
        },
      },
    }),
  },

  // ============================================================= Whiteland
  {
    id: 'nb_iwatobi', name: 'Iwatobi', title: 'King of the Whiteland Kingdom', island: 'whiteland', at: { town: 'whiteland_castle_town', building: 'Whiteland Palace' },
    look: { hair: 'short', hairColor: '#eeeeee', top: '#1565c0', bottom: '#0d47a1', coat: '#90a4ae', hat: 'crown', hatColor: '#fdd835', nose: 'red', skin: '#f9dcc4' }, scale: 0.75, level: 6,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: `"Brr! A visitor, in this weather? Welcome to Whiteland — the coldest kingdom that still pays its dues to Mary Geoise." (The short old king rubs his red nose.) "If you've come about the Flevance business, the whole North Blue would rather forget it. So would I."`,
          choices: [{ text: 'What is Whiteland known for?', next: 'b' }, { text: 'Farewell, Your Majesty.', end: true }],
        },
        b: { text: `"Ice fishing, furs, and penguins that bite! And the finest hospital north of Lvneel — Dr. Abel's. Though between us, the man is frightened of his own shadow. Especially of anything white that isn't snow."` },
      },
    }),
  },
  {
    id: 'nb_abel', name: 'Dr. Abel', title: 'Chief physician, Whiteland Royal Hospital', island: 'whiteland', at: { town: 'whiteland_castle_town', building: 'Whiteland Royal Hospital' },
    look: { hair: 'short', hairColor: '#9e9e9e', top: '#fafafa', bottom: '#90a4ae', coat: '#fafafa', skin: '#f9dcc4' }, level: 5,
    doctor: { line: '"Sit, sit. Frostbite, broken bones, fever — let\'s have a look."' },
    marker: (c, g) => (stageOf(g, 'nb_ope_ope') === 'whiteland' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (ctx.has('nb_amber_survey')
            ? `"What is that — a Government seal? '...not contagious.'" (He reads it twice, then sits down heavily.) "We turned away dying children. For NOTHING."`
            : `"Whiteland Royal Hospital. Frostbite, broken bones, fever. Sit down, sit down."`),
          choices: [
            { text: 'Treat me.', do: (c) => c.open('doctor', {}) },
            { text: 'Will you treat a boy with Amber Lead Syndrome?', if: () => at(ctx, 'nb_ope_ope', 'whiteland'), next: 'refuse' },
            { text: 'Goodbye.', end: true },
          ],
        },
        refuse: { text: `"A white-spotted boy? From FLEVANCE?! The Amber Lead sickness spreads by touch! If that child sets foot in my hospital, I'll burn the ward down with him in it! OUT!" (Orderlies shove you into the snow. Corazon was right: there is no cure here.)`, onEnter: (c) => c.stage('nb_ope_ope', 'call') },
      },
    }),
  },

  // ================================================================== Deul
  {
    id: 'nb_chap', name: 'Chap', title: 'King of the Deul Kingdom', island: 'deul', at: { town: 'deul_capital', building: 'Deul Palace' },
    look: { hair: 'short', hairColor: '#212121', top: '#556b2f', bottom: '#33691e', coat: '#3e2723', hat: 'marine', hatColor: '#33691e', goggles: true, skin: '#f1c9a0' }, level: 10,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: `(King Chap looks you over through round dark glasses.) "A traveller. Hm. Deul respects strength — and alliances. Small nations that stand alone get swallowed. By pirates. By Germa. By their neighbours."`,
          choices: [{ text: 'Germa?', next: 'germa' }, { text: 'Farewell, Your Majesty.', end: true }],
        },
        germa: { text: `"The Vinsmokes once ruled the whole North Blue. Now their army sells itself to whoever pays — they struck down four kings in one campaign, and Judge hung the portrait in his throne room. If you see snail-ships flying '66', turn around."` },
      },
    }),
  },
  {
    id: 'nb_hask', name: 'Lieutenant Hask', title: 'North Blue Marine Branch, Deul', island: 'deul', at: { town: 'deul_capital', building: 'North Blue Marine Branch' }, faction: 'marine', trainer: 'marine_instructor',
    look: { hair: 'short', hairColor: '#5d4037', top: '#fafafa', bottom: '#1b4f72', hat: 'marine', skin: '#e0ac7e' }, level: 16,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (ctx.char.faction === 'marine'
            ? `"At ease. The North Blue is quiet on paper and rotten underneath: the Donquixote Family in the west, a deserter called Barrels on Minion Island, Germa's mercenaries by the Red Line. Pick one and bring me results."`
            : `"North Blue Marine Branch. If you've come to enlist, sign here. If you're here for a bounty, the office is across the square. If you're a pirate... you've got nerve."`),
          choices: [
            { text: 'Enlist in the Marines', if: () => ctx.char.faction !== 'marine', do: (c) => c.emit('marineEnlist', 'Deul'), end: true },
            { text: 'Marine business', if: () => ctx.char.faction === 'marine', do: (c) => c.emit('marineOffice', { name: 'North Blue Marine Branch' }), end: true },
            { text: 'Rokushiki training', if: () => ctx.char.faction === 'marine', do: (c) => c.open('trainer', { trainer: 'marine_instructor' }) },
            { text: 'Carry on.', end: true },
          ],
        },
      },
    }),
  },

  // ================================================================ Notice
  {
    id: 'nb_ulrich', name: 'Ulrich', title: 'Master of the Longarm Boxing Club', island: 'notice', race: 'longarm', at: { town: 'notice_town', building: 'Longarm Boxing Club' }, trainer: 'nb_longarm',
    look: { hair: 'buzz', hairColor: '#9e9e9e', top: '#b71c1c', bottom: '#212121', skin: '#e0ac7e' }, level: 18,
    marker: (c, g) => (!g.quests.state('nb_notice_cup') ? '!' : stageOf(g, 'nb_notice_cup') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nb_notice_cup')
            ? `"The champion of the Notice Cup! Otto still can't stop talking about you. The club's door is always open to you."`
            : `"Two elbows on each arm — the Friend Elbow and the Lover Elbow. That's the Longarm Tribe! Notice is a rich, boring town, but my club isn't boring. Want to learn to hit from where they can't hit back?"`),
          choices: [
            { text: 'Train at the club', do: (c) => c.open('trainer', { trainer: 'nb_longarm' }) },
            { text: 'Is there a tournament?', if: () => !ctx.quest('nb_notice_cup'), next: 'cup' },
            { text: 'Otto is down.', if: () => at(ctx, 'nb_notice_cup', 'report'), do: (c) => c.complete('nb_notice_cup'), next: 'won' },
            { text: 'Goodbye.', end: true },
          ],
        },
        cup: {
          text: `"The Notice Cup! Beat my best student, Otto, in the ring east of the square, and the whole town will know your name. ...Go easy on him. Actually, don't. He's been itching to leave this town ever since the Bellamy boys sailed off."`,
          choices: [{ text: 'I\'ll enter.', do: (c) => c.startQuest('nb_notice_cup'), end: true }, { text: 'Maybe later.', end: true }],
        },
        won: { text: `"HA! The new champion of the Notice Cup! Here — the purse, and the belt. Otto's already packing a bag, by the way. I think he means to follow you."` },
      },
    }),
  },
  {
    id: 'nb_otto', name: 'Otto', title: 'Longarm boxer, champion of Notice', island: 'notice', race: 'longarm', at: { spot: 'notice_ring' }, faction: 'civilian', level: 9, named: true, lethal: false, duel: true,
    look: { hair: 'spiky', hairColor: '#ff7043', top: '#1565c0', bottom: '#212121', skin: '#f1c9a0' }, style: 'brawler', moves: ['brawl_tackle', 'brawl_knee'], skill: 0.4,
    alert: 'Friend Elbow! Lover Elbow! Here I come!',
    recruit: { role: 'fighter', requires: (c, g) => g.quests.isDone('nb_notice_cup'), pitch: `"You beat me fair and square. ...Take me to sea! The Bellamy boys left this boring town to be pirates and everyone laughed. Nobody's laughing now. My turn!"` },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nb_notice_cup')) return `"Champ! My arms still hurt. Both elbows on both of them."`;
            if (at(ctx, 'nb_notice_cup', 'bout')) return `"So you're my opponent! Keep your guard up — my Lover Elbow comes in from angles you won't believe!"`;
            return `"Notice is the richest, most BORING town in the North Blue. Banks, gardens, tea at four. I want OUT. ...You're a sailor, right? What's it like out there?"`;
          },
          choices: [
            { text: 'Fight! (Notice Cup)', if: () => at(ctx, 'nb_notice_cup', 'bout'), do: (c) => aggro(c.game, findActor(c.game, 'nb_otto')), end: true },
            { text: 'See you around.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'nb_emil', name: 'Emil', title: 'A boy reading "Sora, Warrior of the Sea"', island: 'notice', at: { town: 'notice_town', building: 'Café Sora' },
    look: { hair: 'curly', hairColor: '#fdd835', top: '#42a5f5', bottom: '#5d4037', skin: '#f9dcc4' }, scale: 0.65, level: 1,
    marker: (c, g) => (!g.quests.state('nb_germa') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nb_germa')
            ? `"You REALLY beat a prince of Germa 66?! Like Sora?! ...Can you sign my comic? Please please please?"`
            : `"Have you read 'Sora, Warrior of the Sea'? Sora beats Germa 66 in every issue, with his transforming robot and his seagull! Papa says Germa 66 is REAL, and their snail-ships are anchored by the Red Line, far to the east. I bet you're too scared to go and look!"`),
          choices: [
            { text: 'I\'ll go and look.', if: () => !ctx.quest('nb_germa'), do: (c) => c.startQuest('nb_germa'), end: true },
            { text: 'Buy a comic.', do: (c) => c.open('shop', { shop: ['nb_sora_comic'], building: { name: 'Café Sora', role: 'cafe' } }) },
            { text: 'Something to eat.', do: (c) => c.open('shop', { shop: 'tavern', building: { name: 'Café Sora', role: 'cafe' } }) },
            { text: 'Bye, Emil.', end: true },
          ],
        },
      },
    }),
  },

  // ================================================================== Kuen
  {
    id: 'nb_kuen_mother', name: 'A Thin Woman', title: 'Mother, Kuen Village', island: 'kuen', at: { town: 'kuen_village', building: 'A lonely house' },
    look: { hair: 'long', hairColor: '#212121', top: '#8d6e63', bottom: '#5d4037', skin: '#e0ac7e' }, level: 1,
    marker: (c, g) => (!g.quests.state('nb_kuen') ? '!' : stageOf(g, 'nb_kuen') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nb_kuen')) return `"...She's alive. Somewhere out there she's alive, and eating. That's more than I could ever give her."`;
            if (at(ctx, 'nb_kuen', 'report')) return `"You went up the mountain? ...What did you find? Tell me. Please."`;
            return `(A thin woman sits on her doorstep, staring at the mountain.) "Four years ago the rains stopped. The elders said a child who can't work is a mouth we can't feed. So I walked my little girl up the mountain... and came back alone. She was four. Every night I hear her calling."`;
          },
          choices: [
            { text: 'I\'ll search the mountain.', if: () => !ctx.quest('nb_kuen'), do: (c) => c.startQuest('nb_kuen'), end: true },
            { text: 'I found a ribbon... and a pink feather.', if: () => at(ctx, 'nb_kuen', 'report'), next: 'news' },
            { text: 'Goodbye.', end: true },
          ],
        },
        news: {
          text: () => (ctx.flag('nbFoundBaby5')
            ? `"Pink feathers? The pirates in pink...!" (You tell her about the little girl in Spider Miles who begs to be needed.) "...That's her. She always tried so hard to be useful, even when she was tiny." (She weeps, and smiles.)`
            : `"A pink feather... There are pirates who wear pink feathers. Everyone in the North Blue knows that name." (She covers her mouth.) "Then she's alive. With pirates... but alive."`),
          onEnter: (c) => c.complete('nb_kuen'),
        },
      },
    }),
  },
  {
    id: 'nb_grom', name: 'Elder Grom', title: 'Elder of Kuen Village', island: 'kuen', at: { town: 'kuen_village', building: "Village Elder's House" },
    look: { hair: 'bald', skin: '#c68642', top: '#8d6e63', bottom: '#5d4037' }, level: 2,
    marker: (c, g) => (stageOf(g, 'nb_kuen') === 'elder' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (at(ctx, 'nb_kuen', 'elder')
            ? `"Rice? REAL rice? ...You don't know what you're carrying, stranger. That's five children who eat tonight."`
            : `"Kuen, they call this place. 'Can't eat', the old folk say it means. The name came true: the wells are dust and the fields are straw. Any food you bring here is a life."`),
          choices: [
            { text: 'Give 5 Rice Balls.', if: () => at(ctx, 'nb_kuen', 'elder') && ctx.has('rice_ball', 5), do: (c) => { c.take('rice_ball', 5); c.stage('nb_kuen', 'mountain'); }, next: 'thanks' },
            { text: 'Goodbye.', end: true },
          ],
        },
        thanks: { text: `"...Her mother will want to know. The cave at the foot of the mountain, west of here — that's where the little ones were left. I carried none of them up. I tell myself that every night."` },
      },
    }),
  },

  // ================================================================= Downs
  {
    id: 'nb_moss', name: 'Old Moss', title: 'Junk-picker of Downs', island: 'downs', at: { town: 'downs_town', plaza: true, ox: 2 },
    look: { hair: 'long', hairColor: '#9e9e9e', top: '#5d4037', bottom: '#3e2723', hat: 'beanie', hatColor: '#4e342e', skin: '#c68642' }, level: 3,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: `"Fifteen years back, four brats ran this heap like a kingdom — a snotty one, a lanky one, a big one with a squeaky voice, a quiet one with a stick. Then a fifth came. Blond. Talked like a nobleman. They made HIM their king."`,
          choices: [{ text: 'What happened to them?', next: 'b' }, { text: 'Goodbye.', end: true }],
        },
        b: { text: `"Grew up. Burned a town to the ground when they were barely ten, just because their 'king' was unhappy. Now they fly a Jolly Roger with a crossed-out smile." (He spits.) "The heap where they crowned him is out east, by the old shack. Nobody goes there."` },
      },
    }),
  },

  // ================================================================= Germa
  {
    id: 'nb_judge', name: 'Vinsmoke Judge', title: '"Garuda", King of Germa, Supreme Commander of Germa 66', island: 'germa_kingdom', at: { town: 'germa_castle', building: 'Vinsmoke Castle' },
    look: { hair: 'long', hairColor: '#fdd835', top: '#9e9e9e', bottom: '#616161', coat: '#ef6c00', hat: 'horns', hatColor: '#fbc02d', skin: '#f1c9a0' }, scale: 1.3, level: 40, faction: 'neutral', ai: 'idle',
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nb_germa')
            ? `"So you are the commoner who struck my son. Niji will be... repaired. Improved. Pray you never set foot on Germa again."`
            : `"You stand in the Germa Kingdom — a nation without land, the only one that can climb the Red Line on its own. Once the name Vinsmoke ruled the entire North Blue. It will again. State your business."`),
          choices: [
            { text: 'That painting of four fallen kings...', next: 'kings' },
            { text: 'Hire me for your army.', next: 'hire' },
            { text: 'I\'ll be going.', end: true },
          ],
        },
        kings: { text: `"The Conquest of Four Nations. Four kings who would not kneel. History is written by whoever is left standing — and I was the one left standing."`, next: 'a' },
        hire: { text: `"Germa 66 does not hire outsiders. We MAKE our soldiers — stronger, obedient, identical. Science, not sentiment."`, next: 'a' },
      },
    }),
  },
  {
    id: 'nb_reiju', name: 'Vinsmoke Reiju', title: '"Poison Pink", Princess of Germa', island: 'germa_kingdom', at: { town: 'germa_castle', plaza: true, ox: -4 },
    look: { hair: 'long', hairColor: '#f48fb1', top: '#ec407a', bottom: '#ec407a', coat: '#7b1fa2', skin: '#f9dcc4' }, level: 24, faction: 'neutral', ai: 'idle',
    marker: (c, g) => (!g.quests.state('nb_third_prince') ? '!' : stageOf(g, 'nb_third_prince') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nb_third_prince')) return `"A cook, on a sea restaurant. Alive, and cooking." (A real smile, quickly hidden.) "Father must never know I asked. And neither must my brothers."`;
            if (at(ctx, 'nb_third_prince', 'report')) return `"You went all the way to the East Blue? ...Well? Tell me. Did he look happy?"`;
            if (ctx.quest('nb_third_prince')) return `"The Baratie — a floating restaurant in the East Blue. I can't go myself. Germa never sails anywhere without a war to sell."`;
            return `"You're brave, or stupid, to wander around Germa." (She lowers her voice.) "I had a brother once. Everyone was told he died in a shipwreck. There's a rumour of a young cook in the East Blue, on a sea restaurant — curly eyebrow, kicks like a cannon. If it's true... just tell me he's alive."`;
          },
          choices: [
            { text: 'I\'ll find out.', if: () => !ctx.quest('nb_third_prince'), do: (c) => { c.startQuest('nb_third_prince'); if (c.game.quests.isDone('baratie_krieg')) c.setFlag('nbSawSanji'); }, end: true },
            { text: 'He\'s alive. He cooks at the Baratie — and he\'s happy.', if: () => at(ctx, 'nb_third_prince', 'report'), do: (c) => c.complete('nb_third_prince'), next: 'thanks' },
            { text: 'Goodbye, princess.', end: true },
          ],
        },
        thanks: { text: `(She presses three small pink vials into your hand.) "Germa medicine. It draws out any poison — I should know. Don't tell a soul where you got it."` },
      },
    }),
  },
  {
    id: 'nb_niji', name: 'Vinsmoke Niji', title: '"Dengeki Blue", Second Prince of Germa', island: 'germa_kingdom', at: { spot: 'germa_courtyard' }, hostile: true, boss: true, hpMul: 1.4, faction: 'rival', level: 22,
    look: { hair: 'spiky', hairColor: '#1e88e5', top: '#1565c0', bottom: '#0d47a1', coat: '#212121', goggles: true, hand: '#fdd835', skin: '#f9dcc4' },
    style: 'black_leg', moves: ['nb_henry_blazer', 'nb_henry_needle', 'nb_dengeki_blue'], skill: 0.6, breakthrough: 4, lethal: true,
    alert: 'A commoner raising a hand to a prince of Germa? I\'ll take my time electrocuting you.', barks: ['Dengeki Blue!', 'Pathetic.', 'Commoners break so easily.'],
    phases: [{ at: 0.5, run: (a, g) => { g.fx.text(a.x, a.y - 2.4, 'LIGHTSPEED!', '#64b5f6', 0.6); a.addBuff({ id: 'nb_niji_speed', name: 'Dengeki Blue', dur: 60, mods: { speedMul: 1.3, atkSpeed: 1.25 } }); } }],
    when: (c, g) => stageOf(g, 'nb_germa') === 'niji',
  },
  {
    id: 'nb_cosette', name: 'Cosette', title: 'Head chef of the Germa royal kitchen', island: 'germa_kingdom', at: { town: 'germa_castle', building: 'Royal Kitchen' },
    look: { hair: 'ponytail', hairColor: '#c8a165', top: '#7b1f2a', bottom: '#fafafa', skin: '#f9dcc4' }, level: 5,
    marker: (c, g) => (!g.quests.state('nb_germa') || stageOf(g, 'nb_germa') === 'cosette' ? '!' : stageOf(g, 'nb_germa') === 'report' ? '?' : null),
    recruit: { role: 'cook', requires: (c, g) => g.quests.isDone('nb_germa'), pitch: `"Leave Germa? ...I've cooked for kings who never once said 'delicious'. If you'll say it — just once in a while — I'll cook for you until the end of the sea!"` },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nb_germa')) return `"Prince Niji won't be throwing plates for a while..." (She laughs, covers her mouth, then laughs again.) "Nobody here has ever stood up for a servant. Would you... let me cook for YOUR table?"`;
            if (at(ctx, 'nb_germa', 'report')) return `"You... you beat Prince Niji? In his raid suit?!"`;
            if (ctx.quest('nb_germa') && !at(ctx, 'nb_germa', 'cosette')) return `"The soldiers drill on the west platform. They all have the same face — they come out of the Depot like that. Please be careful."`;
            return `(A young cook with a bruised, freckled face is scrubbing a pot.) "Oh! You shouldn't be in the royal kitchen... Please keep your voice down. Prince Niji doesn't like noise. He doesn't like anything. Least of all the servants."`;
          },
          choices: [
            { text: 'Who did this to you?', if: () => !ctx.quest('nb_germa') || at(ctx, 'nb_germa', 'cosette'), next: 'who' },
            { text: 'Niji is beaten.', if: () => at(ctx, 'nb_germa', 'report'), do: (c) => c.complete('nb_germa'), next: 'a' },
            { text: 'Something to eat?', do: (c) => c.open('shop', { shop: 'nb_germa_kitchen', building: { name: 'Royal Kitchen', role: 'restaurant' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
        who: {
          text: `"Prince Niji. The soup was 'too warm', so he threw the plate at my face — and later he... finished the lesson." (She tries to laugh.) "The soldiers won't stop him. They're not even... not like people. If only someone could show him how it feels."`,
          choices: [
            { text: 'I\'ll show him.', do: (c) => { if (!c.quest('nb_germa')) c.startQuest('nb_germa'); if (c.game.quests.stageId('nb_germa') === 'cosette') c.stage('nb_germa', 'depot'); }, end: true },
            { text: 'I can\'t fight a prince.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'nb_eponi', name: 'Époni', title: 'Nurse of the Germa royal household', island: 'germa_kingdom', at: { town: 'germa_castle', building: 'Medical Ward' },
    look: { hair: 'short', hairColor: '#212121', top: '#212121', bottom: '#fafafa', skin: '#f1c9a0' }, bulk: 1.3, level: 4,
    doctor: { line: '"Sit still. Germa medicine works quickly — and it stings."' },
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: `"This ward was the Queen's, once. Queen Sora. She was kind — far too kind for this kingdom." (She smooths an empty bed.) "...Are you hurt? I may treat guests, as long as the princes don't hear of it."`,
          choices: [{ text: 'Treat my wounds.', do: (c) => c.open('doctor', {}) }, { text: 'Goodbye.', end: true }],
        },
      },
    }),
  },
  {
    id: 'nb_clone_captain', name: 'Clone Soldier Type-MST', title: 'Germa 66 squad leader ("Man Strong")', island: 'germa_kingdom', at: { spot: 'germa_parade' }, hostile: true, named: true, faction: 'rival', level: 16,
    look: { hair: 'buzz', hairColor: '#212121', top: '#37474f', bottom: '#263238', coat: '#263238', coatText: '66', goggles: true, skin: '#f1c9a0' }, bulk: 1.4, hpMul: 1.6,
    style: 'brawler', moves: ['brawl_tackle', 'brawl_headbutt', 'brawl_knee'], skill: 0.45,
    alert: 'Intruder. Orders: eliminate.', barks: ['For Germa.', 'Orders are absolute.'],
    when: (c, g) => !g.quests.isDone('nb_germa'),
  },

  // ================================================================ Rubeck
  {
    id: 'nb_garrow', name: 'Lieutenant Garrow', title: 'Marine exchange detail, Rubeck Island', island: 'rubeck', at: { town: 'rubeck_camp', building: 'Exchange Command Post' }, faction: 'marine',
    look: { hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#1b4f72', hat: 'marine', skin: '#f1c9a0' }, level: 12,
    marker: (c, g) => (stageOf(g, 'nb_ope_ope') === 'rubeck' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (at(ctx, 'nb_ope_ope', 'rubeck')
            ? `"This island is under Marine control. ...The 'exchange'? (He glances around, then lowers his voice.) Five BILLION berries, for one Devil Fruit. Makes you sick, doesn't it?"`
            : `"This island is under Marine control until further notice. Move along — nothing to see here."`),
          choices: [
            { text: 'Who is selling it?', if: () => at(ctx, 'nb_ope_ope', 'rubeck'), next: 'where' },
            { text: 'Marine business', if: () => ctx.char.faction === 'marine', do: (c) => c.emit('marineOffice', { name: 'Rubeck Exchange Camp' }), end: true },
            { text: 'Moving along.', end: true },
          ],
        },
        where: { text: `"A pirate named Diez Barrels. Used to be one of OURS, can you believe it? He's holed up in the ghost town on Minion Island, just east of here, sitting on the fruit until we bring the money. Admiral Sengoku's orders: nobody goes near him. So don't."`, onEnter: (c) => c.stage('nb_ope_ope', 'barrels') },
      },
    }),
  },

  // ================================================================ Minion
  {
    id: 'nb_barrels', name: 'Diez Barrels', title: 'Captain of the Barrels Pirates (ex-Marine officer)', island: 'minion_island', at: { town: 'minion_ghost_town', building: "Barrels' Mansion" }, hostile: true, boss: true, hpMul: 1.2, faction: 'pirate', level: 15,
    look: { hair: 'short', hairColor: '#ef6c00', top: '#263238', bottom: '#37474f', coat: '#d7ccc8', skin: '#f1c9a0' }, bulk: 1.4,
    style: 'sniper', weapon: 'gun', moves: ['nb_barrels_volley', 'snipe_explode', 'brawl_tackle'], ranged: true, prefRange: 5, skill: 0.4,
    bounty: 30000000, infamy: true, breakthrough: 3,
    alert: 'Who the hell are you?! That fruit is worth FIVE BILLION berries! Nobody touches it!', barks: ['Five billion!', 'Where\'s that useless son of mine?!'],
    when: (c, g) => stageOf(g, 'nb_ope_ope') === 'barrels',
  },
  {
    id: 'nb_dory', name: 'Dory', title: 'Son of Diez Barrels', island: 'minion_island', at: { spot: 'dory_post' },
    look: { hair: 'short', hairColor: '#ef6c00', top: '#5d4037', bottom: '#3e2723', skin: '#f1c9a0' }, level: 14, faction: 'neutral', ai: 'idle',
    when: (c, g) => !g.quests.isDone('nb_ope_ope') && !['birdcage', 'farewell'].includes(stageOf(g, 'nb_ope_ope')),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (at(ctx, 'nb_ope_ope', 'vergo')
            ? `"The fruit's gone. Father's down... and there's something glittering in the sky. Strings?" (He looks at the sea, then at the mansion.) "...I'm sorry, Father."`
            : `(A tall, orange-haired youth stands guard, bruises on his arms.) "My father was a Marine officer once. A good one — people saluted him in the street. Now he hits me when a deal goes wrong. Don't look at me like that. He's still my father."`),
          choices: [{ text: 'You could leave.', next: 'b' }, { text: 'Leave', end: true }],
        },
        b: { text: `"...Someday I'll wear the Marine coat myself. The way he used to, before all this." (He says it quietly, as if the mansion might hear.)` },
      },
    }),
  },
  {
    id: 'nb_vergo', name: 'Vergo', title: '"Demon Bamboo", Marine officer (secretly a Donquixote executive)', island: 'minion_island', at: { spot: 'law_hideaway' }, hostile: true, boss: true, hpMul: 1.3, faction: 'pirate', level: 21,
    look: { hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE', hat: 'marine', goggles: true, skin: '#f1c9a0' },
    style: 'rokushiki', moves: ['nb_demon_bamboo', 'roku_soru', 'roku_tekkai', 'roku_rankyaku'], haki: { armament: 35, observation: 20 }, armament: true, skill: 0.6, breakthrough: 4,
    alert: 'A letter to the Marines, from Corazon? ...How unfortunate. For both of you.', barks: ['Hardened bamboo. It does not break.', 'Don\'t misunderstand. I\'m not trying to kill you. Yet.'],
    when: (c, g) => stageOf(g, 'nb_ope_ope') === 'vergo',
  },
  {
    id: 'nb_doflamingo_minion', name: 'Donquixote Doflamingo', title: '"Heavenly Yaksha"', island: 'minion_island', at: { spot: 'mansion_yard' },
    look: DOFFY_LOOK, scale: 1.35, level: 80, fixedPower: 99999, faction: 'neutral', ai: 'idle',
    fruit: 'ito', fruitMastery: 90, moves: ['ito_overheat', 'ito_parasite', 'ito_fivecolor', 'ito_birdcage'], haki: { armament: 60, observation: 60, conqueror: 40 },
    when: (c, g) => ['birdcage', 'farewell'].includes(stageOf(g, 'nb_ope_ope')),
    dialogue: () => ({ start: 'a', nodes: { a: { text: `"Fuffuffu... you again. My little brother took something from me — somewhere on this island. Nobody leaves until I find it." (He points up. Thin, glittering strings cage the whole sky.) "Birdcage. Go on. Run."` } } }),
  },
  {
    id: 'nb_rosinante', name: 'Donquixote Rosinante', title: 'Codename "Corazon"', island: 'minion_island', at: { spot: 'corazon_last' },
    look: CORA_LOOK, scale: 1.3, level: 30, ai: 'idle',
    when: (c, g) => ['vergo', 'birdcage', 'farewell'].includes(stageOf(g, 'nb_ope_ope')),
    marker: (c, g) => (stageOf(g, 'nb_ope_ope') === 'farewell' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (at(ctx, 'nb_ope_ope', 'farewell')) return `(Rosinante sits against a ruined wall, the snow around him red. The strings above hum like a harp. He smiles — a wide, painted, clumsy smile.) "...You got him into the chest. Good. Now he's free."`;
            if (at(ctx, 'nb_ope_ope', 'birdcage')) return `"Strings... Doffy's Birdcage. He'll comb every inch." (He coughs red onto the snow.) "The Barrels' treasure chests, east of the mansion — his crew will load them onto their ship. Put Law in one. I'll make sure no one can hear him. Go!"`;
            return `(Corazon is slumped in the snow, riddled with bullets, a cigarette still between his lips. And he SPEAKS, softly.) "He ate it. Law ate the fruit. ...I sent him to the Marines with a letter. If the wrong Marine reads it..."`;
          },
          choices: [
            { text: 'Tell me who you really are.', if: () => at(ctx, 'nb_ope_ope', 'farewell'), next: 'f1' },
            { text: 'Hold on!', end: true },
          ],
        },
        f1: { text: `"I lied to him. Told him I wasn't a Marine. I'm Commander Donquixote Rosinante — Doffy's little brother, and Sengoku's spy." (He laughs, and it hurts.) "Heh. I always trip at the worst possible moment."`, next: 'f2' },
        f2: { text: `(Footsteps crunch in the snow. A pink feather coat. Rosinante waves you away — and every sound around you simply stops.) "Go. I'll die smiling. That way, when he remembers me... he'll remember me smiling."`, onEnter: (c) => c.complete('nb_ope_ope') },
      },
    }),
  },

  // ======================================================== Swallow Island
  {
    id: 'nb_wolf', name: 'Wolf', title: 'Inventor ("a genius", by his own account)', island: 'swallow_island', at: { spot: 'wolf_house' }, trainer: 'nb_wolf',
    look: { hair: 'short', hairColor: '#bdbdbd', top: '#ff7043', bottom: '#8d6e63', hat: 'headband', hatColor: '#e53935', skin: '#e0ac7e' }, level: 18, style: 'sniper', weapon: 'gun',
    marker: (c, g) => (stageOf(g, 'nb_bacca') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (at(ctx, 'nb_bacca', 'report')) return `"You beat Bacca? ...Then you know. He's my son." (Wolf stares at his hands.) "I sailed with him for years to keep him in line. It didn't work. When he came home and burned this town, I cut him off. I should have stopped him myself."`;
            if (done(ctx, 'nb_heart_pirates')) return `"Those four brats eat like a crew of forty. Give and take! They pay me back in chores. ...Don't you dare tell them I said they're good kids."`;
            return `"Hm? Who are you? If you want something from Wolf the genius inventor, you give something back. Give and take! That's my policy. Firewood, bullets, a hand in the greenhouse — or money. Money is also good."`;
          },
          choices: [
            { text: 'Teach me to shoot.', do: (c) => c.open('trainer', { trainer: 'nb_wolf' }) },
            { text: 'What do you invent?', next: 'inv' },
            { text: 'You gave this town a chance, too.', if: () => at(ctx, 'nb_bacca', 'report'), do: (c) => c.complete('nb_bacca'), next: 'gift' },
            { text: 'Goodbye.', end: true },
          ],
        },
        inv: { text: `"The Anywhere Hot-Spring Heater — boils water anywhere! It just never stops. The Super Cleaner — only tried to eat my foot twice. A telescope that sees Pleasure Town from the far side of the island... The rest is top secret."`, next: 'a' },
        gift: { text: `"...Give and take. You gave this town its life back. Take this: Hyper Shibireru-kun, an electrified katana. It cuts things that shouldn't be cuttable. A genius invention! It only shocks its owner occasionally."` },
      },
    }),
  },
  {
    id: 'nb_rudd', name: 'Rudd', title: 'Police officer of Pleasure Town', island: 'swallow_island', at: { town: 'swallow_town', building: 'Pleasure Town Police Station' },
    look: { hair: 'short', hairColor: '#5d4037', top: '#c62828', bottom: '#212121', hat: 'marine', hatColor: '#c62828', swords: 1, skin: '#f1c9a0' }, level: 10, style: 'ittoryu', weapon: 'sword',
    marker: (c, g) => (!g.quests.state('nb_bacca') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nb_bacca')) return `"Pleasure Town's still standing, thanks to you. I'll write it in the station log in my very best handwriting."`;
            if (ctx.quest('nb_bacca')) return `"Bacca's crew holds the Temple of the Sea God. The people inside are... not themselves. Like puppets made of water. His power melts people's will. Be careful."`;
            return `"Officer Rudd, Pleasure Town police. Quiet town, cold winters, and a legend of a 'flying undersea swallow' that roars around the coast at night. Harmless. Probably."`;
          },
          choices: [
            { text: 'Any trouble lately?', if: () => !ctx.quest('nb_bacca'), next: 'trouble' },
            { text: 'Goodbye.', end: true },
          ],
        },
        trouble: {
          text: `"...A pirate ship with a melted-looking Jolly Roger dropped anchor off the north cape. The captain says he was BORN here. Artur Bacca. They say he's after old Captain Ladoga's treasure. If he comes ashore, my sword won't be enough."`,
          choices: [{ text: 'I\'ll deal with him.', do: (c) => c.startQuest('nb_bacca'), end: true }, { text: 'Not my problem.', end: true }],
        },
      },
    }),
  },
  {
    // (the chapter on Swallow Island promises someone who'll sail with you once Bacca is beaten)
    id: 'nb_solveig', name: 'Solveig Brandt', title: 'Ice-fisher of Pleasure Town', island: 'swallow_island', at: { town: 'swallow_town', plaza: true, ox: -2.5 },
    look: { hair: 'ponytail', hairColor: '#fff3e0', skin: '#f1d3c0', top: '#455a64', bottom: '#37474f', coat: '#6d4c41', hat: 'bandana', hatColor: '#90a4ae', fem: true }, level: 8, style: 'brawler',
    recruit: { role: 'fighter', requires: (c, g) => g.quests.isDone('nb_bacca'), pitch: `"I watched you take Bacca's crew apart from behind the fish racks. ...This island's too small for me now. Take me along — I can gut a fish or a pirate, whichever comes first."` },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nb_bacca')
            ? `"Bacca's lot are gone, and the whole town's talking about you. Nobody's talked about anything here in ten years." (She sets down her harpoon.) "I'm not going to spend the next ten gutting cod."`
            : `"Keep your head down, stranger. The Bacca Pirates take a cut of every catch — and a finger from anyone who argues." (She glares at the harbour.) "Someone ought to do something. Rudd can't, alone."`),
          choices: [{ text: 'Goodbye.', end: true }],
        },
      },
    }),
  },
  {
    id: 'nb_bepo', name: 'Bepo', title: 'A lost polar-bear cub (Mink)', island: 'swallow_island', race: 'mink', at: { spot: 'bepo_field' },
    fullLook: { race: 'mink', skin: '#fafafa', fur: '#fafafa', hairColor: '#fafafa', hand: '#fafafa', ears: 'round', muzzle: true, furFace: true, hair: 'bald', top: '#ff7043', bottom: '#ff7043', scale: 0.8 }, level: 8, ai: 'idle',
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nb_heart_pirates')
            ? `"Captain Law says I'm going to be the navigator! I study charts every night, so someday I can find the way back to Zou... and see my big brother Zepo again. I'm sorry! I'm talking too much!"`
            : `(A small white bear hugs his knees in the snow.) "I'm sorry... I'm sorry for being a bear. I climbed down Zou's leg to look at the sea, and the sea took me away. My brother Zepo is still up there. ...Why do they keep kicking me?"`),
        },
      },
    }),
  },
  {
    id: 'nb_penguin', name: 'Penguin', title: 'Local tough (his hat says so)', island: 'swallow_island', at: { spot: 'bepo_field', ox: 2 },
    look: { hair: 'short', hairColor: '#5d4037', top: '#546e7a', bottom: '#37474f', hat: 'beanie', hatColor: '#fafafa', skin: '#f1c9a0' }, scale: 0.8, level: 4, ai: 'idle',
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nb_heart_pirates')
            ? `"That Law guy knocked us both flat without even touching us. ...So we're gonna be pirates with him. The Heart Pirates! Don't laugh."`
            : `"Whaddaya want? This bear's got no business on our island. A bear that TALKS? Creepy! ...And he keeps saying sorry!"`),
        },
      },
    }),
  },
  {
    id: 'nb_shachi', name: 'Shachi', title: 'Local tough (sunglasses)', island: 'swallow_island', at: { spot: 'bepo_field', ox: 3.5 },
    look: { hair: 'short', hairColor: '#ff7043', top: '#546e7a', bottom: '#37474f', hat: 'beanie', hatColor: '#e53935', goggles: true, skin: '#f1c9a0' }, scale: 0.8, level: 4, ai: 'idle',
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nb_heart_pirates')
            ? `"Captain Law, huh... Old Wolf took us in too. Our aunt and uncle never even noticed we were gone. Nobody's gonna miss us — so we might as well go see the world!"`
            : `"Shachi and Penguin, terrors of Swallow Island! ...Our aunt and uncle don't even notice when we don't come home. So we do what we want. Got a problem with that?"`),
        },
      },
    }),
  },
  {
    id: 'nb_law_swallow', name: 'Law', title: 'A boy in a spotted hat', island: 'swallow_island', at: { spot: 'wolf_house', ox: 2.5 },
    look: { ...LAW_LOOK, top: '#fdd835' }, scale: 0.8, level: 12, ai: 'idle',
    when: (c, g) => g.quests.isDone('nb_ope_ope'),
    marker: (c, g) => (stageOf(g, 'nb_heart_pirates') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nb_heart_pirates')) return `"Cora-san's business in the New World isn't finished. I'll finish it. Someday Doflamingo will pay. ...Don't get in my way. And don't die before then."`;
            if (at(ctx, 'nb_heart_pirates', 'report')) return `"...You were on Minion Island." (He watches three boys squabble over firewood.) "Three years ago I wanted to destroy the world. Now I have something to do in it. We're going to be pirates."`;
            return `"...Don't say his name. Not yet." (The boy turns away. The white patches on his skin are fading.)`;
          },
          choices: [
            { text: 'What will you call your crew?', if: () => at(ctx, 'nb_heart_pirates', 'report'), do: (c) => c.complete('nb_heart_pirates'), next: 'heart' },
            { text: 'Take care, Law.', end: true },
          ],
        },
        heart: { text: `"The Heart Pirates — for the heart seat he left empty. Our flag will look like Doflamingo's, without the cross. So I'll always remember him smiling." (A thin, crooked smile.) "Bepo's our navigator. He can't read a chart yet. He'll learn."` },
      },
    }),
  },
  {
    id: 'nb_koni', name: 'Koni Boakeno', title: 'Sumo brute of the Bacca Pirates', island: 'swallow_island', at: { spot: 'sea_god_temple', ox: -2 }, hostile: true, boss: true, hpMul: 1.2, faction: 'pirate', level: 13,
    look: { hair: 'bun', hairColor: '#212121', top: '#e0ac7e', bottom: '#fafafa', skin: '#e0ac7e' }, bulk: 1.8,
    style: 'brawler', moves: ['nb_yokozuna_bomber', 'brawl_tackle'], skill: 0.3, breakthrough: 2,
    alert: 'Nobody lasts more than two of my blows. Let\'s see if you make three!', barks: ['Dosukoi!', 'Heh... still standing?'],
    when: (c, g) => stageOf(g, 'nb_bacca') === 'temple',
  },
  {
    id: 'nb_bacca', name: 'Artur Bacca', title: 'Captain of the Bacca Pirates ("Dero Dero no Mi")', island: 'swallow_island', at: { spot: 'sea_god_temple' }, hostile: true, boss: true, hpMul: 1.2, faction: 'pirate', level: 17,
    look: { hair: 'long', hairColor: '#212121', hat: 'tricorne', hatColor: '#212121', top: '#4a148c', bottom: '#212121', coat: '#311b92', grin: true, skin: '#f1c9a0' },
    style: 'brawler', moves: ['nb_bacca_maces', 'nb_derorinpa'], skill: 0.5, bounty: 26000000, infamy: true, breakthrough: 3,
    alert: 'This is MY hometown, and I do what I want with it. That\'s freedom!', barks: ['Melt!', 'Where did the old man hide Ladoga\'s gold?!'],
    when: (c, g) => stageOf(g, 'nb_bacca') === 'bacca',
  },
];

// --------------------------------------------------------- enemy groups
const groups = [
  { island: 'rakesh', spot: 'rakesh_harbour', radius: 5, enemies: [['nb_dq_grunt', 7], ['nb_dq_gunner', 7], ['nb_dq_grunt', 8]], when: (c, g) => stageOf(g, 'nb_rakesh_raid') === 'harbour' },
  { island: 'spider_miles', spot: 'dq_vault', radius: 5, enemies: [['nb_dq_grunt', 12], ['nb_dq_gunner', 12]], when: (c, g) => stageOf(g, 'nb_rakesh_strongbox') === 'trebol' },
  { island: 'flevance', spot: 'palace_ruins', radius: 5, enemies: [['cp', 11, { name: 'Cipher Pol Agent' }], ['cp', 11, { name: 'Cipher Pol Agent' }]], when: (c, g) => stageOf(g, 'nb_white_city') === 'agents' },
  { island: 'minion_island', spot: 'mansion_yard', radius: 6, enemies: [['nb_barrels_pirate', 11], ['nb_barrels_pirate', 11], ['pirate_gunner', 12, { name: 'Barrels Gunner' }]], when: (c, g) => stageOf(g, 'nb_ope_ope') === 'barrels' },
  { island: 'minion_island', spot: 'mansion_yard', radius: 5, enemies: [['nb_dq_grunt', 13], ['nb_dq_gunner', 13]], when: (c, g) => stageOf(g, 'nb_ope_ope') === 'birdcage' },
  { island: 'germa_kingdom', spot: 'germa_parade', radius: 5, enemies: [['nb_germa_clone', 13, { name: 'Clone Soldier Type-MB' }], ['nb_germa_clone', 13, { name: 'Clone Soldier Type-WB' }], ['nb_germa_clone', 14, { name: 'Clone Soldier Type-MR' }]], when: (c, g) => !g.quests.isDone('nb_germa') },
  { island: 'swallow_island', spot: 'sea_god_temple', radius: 5, enemies: [['nb_bacca_pirate', 10], ['nb_bacca_pirate', 10]], when: (c, g) => ['temple', 'bacca'].includes(stageOf(g, 'nb_bacca')) },
];

// --------------------------------------------------------------- quests
const quests = [
  {
    id: 'nb_rakesh_raid', name: 'The Pillage of Rakesh', island: 'rakesh', kind: 'story',
    summary: 'Rakesh broke its deal with the Donquixote Family. Now Doflamingo\'s officers are coming to make an example of the port.',
    stages: [
      { id: 'bell', desc: 'Ring the harbour bell on Rakesh\'s east quay to warn the town.', goal: { type: 'reach', island: 'rakesh', spot: 'rakesh_bell', r: 3 },
        onComplete: (ctx, g) => g.ui.banner('Pink Sails!', 'Rakesh', 'The bell booms across the harbour. Boats flying a Jolly Roger with a crossed-out smile are already at the quay...', 5) },
      { id: 'harbour', desc: 'Donquixote raiders are landing on the quay. Defeat their officers, Giolla and Machvise.', goal: { type: 'defeat', any: ['nb_giolla', 'nb_machvise'], count: 2, island: 'rakesh', spot: 'rakesh_harbour' },
        onStart: (ctx, g) => { spawnAggro(g, 'nb_giolla'); spawnAggro(g, 'nb_machvise'); } },
      { id: 'pink', desc: 'Senor Pink is swimming through the paving stones toward Harbour Warehouse No. 3, north of the quay. Stop him.', goal: { type: 'defeat', npc: 'nb_senor_pink', island: 'rakesh', spot: 'rakesh_warehouse' },
        onStart: (ctx, g) => spawnAggro(g, 'nb_senor_pink') },
      { id: 'gladius', desc: 'Gladius is rigging Rakesh Light to burst. Defeat him at the lighthouse.', goal: { type: 'defeat', npc: 'nb_gladius', island: 'rakesh', spot: 'rakesh_light' },
        onStart: (ctx, g) => spawnAggro(g, 'nb_gladius') },
      { id: 'report', desc: 'Report to Harbourmaster Brandt.' },
    ],
    rewards: { berries: 15000, points: 2, liberate: 'Rakesh' },
  },
  {
    id: 'nb_rakesh_strongbox', name: 'Rakesh\'s Strongbox', island: 'spider_miles', kind: 'side',
    summary: 'The raiders carried Rakesh\'s harbour strongbox to the Donquixote vault in Spider Miles.',
    stages: [
      { id: 'plant', desc: 'Sneak into the Waste Processing Plant at Spider Miles, north-east of Rakesh.', goal: { type: 'reach', island: 'spider_miles', spot: 'dq_gate', r: 5 } },
      { id: 'trebol', desc: 'Trebol guards the family vault on the west side of the plant. Defeat him.', goal: { type: 'defeat', npc: 'nb_trebol', island: 'spider_miles', spot: 'dq_vault' },
        onStart: (ctx, g) => spawnAggro(g, 'nb_trebol'), onComplete: (ctx) => ctx.give('nb_rakesh_strongbox', 1) },
      { id: 'escape', desc: '"Fuffuffu..." Doflamingo himself has come down. Get to Spider Miles harbour — now!', goal: { type: 'reach', island: 'spider_miles', spot: 'sm_harbour', r: 6 },
        onStart: (ctx, g) => g.ui.banner('Fuffuffuffu...', 'Donquixote Doflamingo', 'A pink feather coat on the hideout roof. Strings glitter in the air... then every sound in the plant stops. The tall mute officer stands between you and the roof. RUN.', 6) },
      { id: 'report', desc: 'Return the strongbox to Harbourmaster Brandt in Rakesh.' },
    ],
    rewards: { berries: 25000, points: 1, items: [['jewels', 1]] },
  },
  {
    id: 'nb_boy_grenades', name: 'The Boy with the Grenades', island: 'spider_miles', kind: 'story',
    summary: 'A white-spotted boy from Flevance, strapped with grenades, wants to join the Donquixote Family.',
    stages: [
      { id: 'gate', desc: 'Walk the boy to the gate of the Waste Processing Plant.', goal: { type: 'reach', island: 'spider_miles', spot: 'dq_gate', r: 4 },
        onComplete: (ctx, g) => {
          despawn(g, 'nb_law_kid');
          spawnNow(g, 'nb_law_scrap');
          g.ui.banner('Out the Window', 'Spider Miles', 'The boy marches in. Moments later glass shatters: a tall man in a black feather coat has thrown him out of a fourth-floor window into the scrap. The man is on fire — he lit his own coat with his cigarette.', 7);
        } },
      { id: 'talk', desc: 'Check on the boy in the scrap heap below the hideout window.', npc: 'nb_law_scrap' },
    ],
    rewards: { berries: 1500, points: 1 },
    onComplete: (ctx, g) => {
      ctx.setFlag('nbMetLaw');
      g.log('(Sailors will later say the Donquixote Family\'s mute officer was seen on a harbour bench in Lvneel, with a sick, white-spotted boy.)', '#b0bec5');
    },
  },
  {
    id: 'nb_white_city', name: 'The White City', island: 'flevance', kind: 'story',
    summary: 'Flevance was destroyed over Amber Lead. The gravekeeper believes someone knew the truth all along.',
    stages: [
      { id: 'hospital', desc: 'Visit the ruins of the Trafalgar hospital, east of the White Town.', goal: { type: 'reach', island: 'flevance', spot: 'hospital_ruins', r: 4 },
        onComplete: (ctx, g) => g.ui.banner('Dr. Trafalgar\'s Hospital', 'Flevance', 'Charred beams and white dust. The best doctors in the country worked here until the end. A small cross stands in the white: "Lami".', 6) },
      { id: 'palace', desc: 'Search the abandoned royal palace, north of the town, for proof.', goal: { type: 'reach', island: 'flevance', spot: 'palace_ruins', r: 4 },
        onComplete: (ctx, g) => { ctx.give('nb_amber_survey', 1); g.ui.banner('Sealed and Stamped', 'The Royal Palace', 'In the royal study, under a century of dust: a World Government geological survey. "Amber Lead — toxic on exposure. Hereditary. NOT contagious." Stamped CLASSIFIED.', 7); } },
      { id: 'agents', desc: 'Cipher Pol followed you into the palace ruins. Defeat Agent Moritz.', goal: { type: 'defeat', npc: 'nb_moritz', island: 'flevance', spot: 'palace_ruins' },
        onStart: (ctx, g) => spawnAggro(g, 'nb_moritz'), onComplete: (ctx, g) => spawnNow(g, 'nb_rev_agent') },
      { id: 'choice', desc: 'Return to Konrad the gravekeeper and decide what to do with the survey.' },
    ],
    rewards: { berries: 12000, points: 2, attrs: { wil: 1 } },
  },
  {
    id: 'nb_ope_ope', name: 'The Ope Ope no Mi', island: 'minion_island', kind: 'story',
    summary: 'Corazon has found a cure for the white-spotted boy: a Devil Fruit a pirate means to sell to the Marines for five billion berries.',
    stages: [
      { id: 'whiteland', island: 'whiteland', desc: 'Ask the Whiteland Royal Hospital, north of Lvneel, to treat the boy.', npc: 'nb_abel' },
      { id: 'call', island: 'lvneel', desc: 'Return to Corazon on the harbour bench in Lvneel.' },
      { id: 'rubeck', island: 'rubeck', desc: 'Find out where the fruit is: ask at the Marine exchange camp on Rubeck Island, south-east of Lvneel.', npc: 'nb_garrow' },
      { id: 'barrels', desc: 'Storm the ghost town on Minion Island, east of Rubeck, and defeat Diez Barrels while Corazon steals the fruit.', goal: { type: 'defeat', npc: 'nb_barrels', island: 'minion_island', spot: 'mansion_yard' },
        onStart: (ctx, g) => spawnAggro(g, 'nb_barrels'),
        onComplete: (ctx, g) => g.ui.banner('Calm', 'Minion Island', 'The lamps go out, and not one sound follows. When the light returns, the Ope Ope no Mi is gone — and somewhere in the snow a boy is choking down the worst-tasting fruit in the world.', 7) },
      { id: 'vergo', desc: 'Law ran to the Marines with Corazon\'s letter — and found Vergo. Defeat "Demon Bamboo" Vergo in the snowy hollow south-west of the town.', goal: { type: 'defeat', npc: 'nb_vergo', island: 'minion_island', spot: 'law_hideaway' },
        onStart: (ctx, g) => { spawnNow(g, 'nb_rosinante'); spawnAggro(g, 'nb_vergo'); },
        onComplete: (ctx, g) => g.ui.banner('Too Late', 'Minion Island', 'Vergo\'s Den Den Mushi crackles as he falls: "Vergo? It\'s me. I\'m on Minion Island." Above the island, the clouds begin to glitter.', 6) },
      { id: 'birdcage', desc: 'Doflamingo\'s Birdcage closes over Minion Island. Hide Law in one of the Barrels\' treasure chests, east of the mansion.', goal: { type: 'reach', island: 'minion_island', spot: 'treasure_chests', r: 3 },
        onStart: (ctx, g) => { spawnNow(g, 'nb_doflamingo_minion'); g.ui.banner('BIRDCAGE', 'Minion Island', 'Glittering strings fall from the sky and cage the whole island. Somewhere, a man in a pink feather coat is laughing.', 6); },
        onComplete: (ctx, g) => g.ui.banner('Calm', 'Minion Island', 'You lift the boy into a chest of gold. A big, clumsy hand passes over him — and his sobbing makes no sound at all.', 6) },
      { id: 'farewell', desc: 'Go back to Corazon.' },
    ],
    rewards: { berries: 20000, points: 3, attrs: { wil: 1 }, items: [['nb_corazon_coat', 1]] },
    onComplete: (ctx, g) => {
      ctx.setFlag('nbCorazonDied');
      despawn(g, 'nb_rosinante');
      despawn(g, 'nb_doflamingo_minion');
      g.ui.banner('Silence', 'Minion Island', 'Gunshots — and not one of them makes a sound. The Donquixote Pirates sail away with their treasure chests. One of them is not full of gold.', 8);
      g.log('(Days later, a boy climbs out of a treasure chest and walks away into the snow. They say he turned up on Swallow Island, south of here.)', '#b0bec5');
    },
  },
  {
    id: 'nb_heart_pirates', name: 'The Heart Pirates', island: 'swallow_island', kind: 'story',
    summary: 'The boy from Minion Island has come to Swallow Island, alone, with a Devil Fruit in his belly and a debt he can never repay.',
    stages: [
      { id: 'bepo', desc: 'There\'s shouting in the snowfield west of Pleasure Town. Go and look.', goal: { type: 'reach', island: 'swallow_island', spot: 'bepo_field', r: 5 },
        onComplete: (ctx, g) => g.ui.banner('ROOM', 'Swallow Island', 'Two local boys are kicking a bear cub. A thin boy in a spotted hat raises one hand — a pale blue dome spreads over the snow — and the bullies simply fall over.', 7) },
      { id: 'wolf', desc: 'Follow the four boys to old Wolf\'s house on the southern wing of the island.', goal: { type: 'reach', island: 'swallow_island', spot: 'wolf_house', r: 4 } },
      { id: 'report', desc: 'Talk to Law at Wolf\'s house.' },
    ],
    rewards: { berries: 6000, points: 1, flag: 'nbHeartPirates' },
  },
  {
    id: 'nb_bacca', name: 'The Flying Undersea Swallow', island: 'swallow_island', kind: 'side',
    summary: 'Artur Bacca, a pirate born on Swallow Island, has come home for Captain Ladoga\'s treasure — and he doesn\'t care who melts.',
    stages: [
      { id: 'temple', desc: 'Bacca\'s pirates hold the Temple of the Sea God in Pleasure Town. Defeat his sumo brute, Koni Boakeno.', goal: { type: 'defeat', npc: 'nb_koni', island: 'swallow_island', spot: 'sea_god_temple' },
        onStart: (ctx, g) => spawnAggro(g, 'nb_koni') },
      { id: 'bacca', desc: 'Defeat Artur Bacca before his Dero Dero power melts the townsfolk\'s will for good.', goal: { type: 'defeat', npc: 'nb_bacca', island: 'swallow_island', spot: 'sea_god_temple' },
        onStart: (ctx, g) => spawnAggro(g, 'nb_bacca') },
      { id: 'report', desc: 'Tell Wolf, at his house on the southern wing. Bacca is his son.' },
    ],
    rewards: { berries: 14000, points: 2, items: [['nb_shibireru', 1]] },
  },
  {
    id: 'nb_liar_noland', name: 'Noland the Liar', island: 'lvneel', kind: 'story',
    summary: 'Every child in the North Blue learns that Montblanc Noland was a liar. Lvneel\'s Royal Archivist does not believe it.',
    stages: [
      { id: 'book', desc: 'Buy a copy of "Liar Noland" at the Royal Bookshop in Lvneel.', goal: { type: 'item', item: 'nb_liar_noland' }, npc: 'nb_hedda' },
      { id: 'archive', desc: 'Bring the picture book to Archivist Pell at the Royal Archive.' },
      { id: 'stand', desc: 'Stand where Noland was executed — the old stand east of the town.', goal: { type: 'reach', island: 'lvneel', spot: 'noland_stand', r: 3 },
        onComplete: (ctx, g) => g.ui.banner('"That\'s it!"', 'Lvneel, four hundred years ago', '"...The City of Gold must have sunk into the sea!" — the last words of Montblanc Noland, admiral, explorer and botanist, before the axe fell.', 7) },
      { id: 'seaking', desc: 'The picture book says the KING slew a Sea King. Sail out south of Lvneel harbour and slay the one that haunts these waters.', goal: { type: 'defeat', npc: 'nb_lvneel_seaking', island: 'lvneel', spot: 'lvneel_seaking' } },
      { id: 'report', desc: 'Report to Archivist Pell.' },
    ],
    rewards: { berries: 12000, points: 2, items: [['nb_expedition_log', 1]], flag: 'nbNolandTruth' },
    onComplete: (ctx, g) => {
      const isl = g.surface?.islands?.find((i) => i.id === 'jaya');
      if (isl && g.surface.reveal) {
        g.surface.reveal(isl.x, isl.y, (isl.radius || 60) + 10);
        g.log('Noland\'s route marks Jaya, in the Grand Line, on your world map (M).', '#ffe082');
      }
    },
  },
  {
    id: 'nb_germa', name: 'The Kingdom of Science', island: 'germa_kingdom', kind: 'side',
    summary: 'Germa 66 — the evil army from "Sora, Warrior of the Sea" — is real, and its snail-ships are anchored by the Red Line.',
    stages: [
      { id: 'reach', desc: 'Find the Germa Kingdom\'s snail-ships, anchored near the Red Line at the eastern edge of the North Blue.', goal: { type: 'reach', island: 'germa_kingdom' } },
      { id: 'cosette', desc: 'Someone in the Royal Kitchen of Vinsmoke Castle needs help. Find the head chef.', npc: 'nb_cosette' },
      { id: 'depot', desc: 'Break the Germa 66 squad drilling on the west platform: defeat their clone squad leader.', goal: { type: 'defeat', npc: 'nb_clone_captain', island: 'germa_kingdom', spot: 'germa_parade' } },
      { id: 'niji', desc: 'Prince Niji, "Dengeki Blue", waits on the south-east platform. Defeat him.', goal: { type: 'defeat', npc: 'nb_niji', island: 'germa_kingdom', spot: 'germa_courtyard' },
        onStart: (ctx, g) => { spawnAggro(g, 'nb_niji'); g.ui.banner('Dengeki Blue', 'Vinsmoke Niji, Second Prince of Germa', 'A can hisses open. A blue raid suit wraps itself around the prince, and his boots lift him off the ground.', 5); } },
      { id: 'report', desc: 'Tell Cosette in the Royal Kitchen.' },
    ],
    rewards: { berries: 30000, points: 2 },
  },
  {
    id: 'nb_third_prince', name: 'The Third Prince', island: 'germa_kingdom', kind: 'side',
    summary: 'Princess Reiju had a brother who "died in a shipwreck". She has heard of a curly-browed cook on a sea restaurant in the East Blue.',
    stages: [
      { id: 'baratie', island: 'baratie', desc: 'See the curly-browed cook of the Baratie, the sea restaurant of the East Blue, with your own eyes. (A long voyage: Reverse Mountain, the Grand Line, then north across the Calm Belt.)', goal: { type: 'flag', flag: 'nbSawSanji' }, at: { dock: true } },
      { id: 'report', desc: 'Tell Reiju what you saw, on the Germa Kingdom.' },
    ],
    rewards: { berries: 20000, points: 1, items: [['nb_germa_antidote', 3]] },
  },
  {
    id: 'nb_kuen', name: 'The Village That Cannot Eat', island: 'kuen', kind: 'side',
    summary: 'Four years ago, a starving mother in Kuen Village left her four-year-old daughter on the mountain.',
    stages: [
      { id: 'food', desc: 'Kuen is starving. Bring 5 Rice Balls (sold in most North Blue towns).', goal: { type: 'item', item: 'rice_ball', n: 5 } },
      { id: 'elder', desc: 'Give the rice balls to Elder Grom so the village can eat.' },
      { id: 'mountain', desc: 'Search the shallow cave at the foot of Kuen Mountain, west of the village.', goal: { type: 'reach', island: 'kuen', spot: 'kuen_cave', r: 3 },
        onComplete: (ctx, g) => g.ui.banner('A Faded Ribbon', 'Kuen Mountain', 'Cold ashes, a child\'s ribbon... and caught on a thornbush, one long PINK FEATHER.', 6) },
      { id: 'report', desc: 'Tell the mother what you found.', npc: 'nb_kuen_mother' },
    ],
    rewards: { berries: 3000, attrs: { wil: 1 } },
  },
  {
    id: 'nb_notice_cup', name: 'The Notice Cup', island: 'notice', kind: 'side',
    summary: 'The Longarm Boxing Club\'s tournament. Beat Notice\'s champion in the ring.',
    stages: [
      { id: 'bout', desc: 'Beat Otto in the boxing ring east of Notice\'s square. (Talk to him to start the bout.)', goal: { type: 'defeat', npc: 'nb_otto', island: 'notice', spot: 'notice_ring' } },
      { id: 'report', desc: 'Tell Ulrich at the Longarm Boxing Club.' },
    ],
    rewards: { berries: 4000, points: 1, mastery: { brawler: 3 } },
  },
];

// ------------------------------------------------------------- registries
const items = {
  amber_lead: { name: 'Amber Lead', icon: '🤍', type: 'treasure', price: 4000, desc: 'The white ore of Flevance. Beautiful — and slowly, hereditarily poisonous. Grand Line collectors still pay for "Flevance White".' },
  nb_amber_survey: { name: 'Sealed Government Survey', icon: '📜', type: 'key', price: 0, desc: 'A century-old World Government geological survey of Flevance: "Amber Lead — toxic on exposure; effects hereditary; NOT contagious." Stamped CLASSIFIED.' },
  nb_liar_noland: { name: 'Liar Noland (picture book)', icon: '📕', type: 'key', price: 300, desc: 'The North Blue\'s favourite bedtime story. "Nobody believed Noland anymore, but he never stopped lying until he was dead."' },
  nb_expedition_log: { name: 'Log of the Royal Expedition', icon: '📘', type: 'key', price: 0, desc: 'Four hundred years old, from the Royal Archive of Lvneel: Admiral Noland\'s true voyage to Jaya, with his route in the margins.' },
  nb_rakesh_strongbox: { name: 'Rakesh Harbour Strongbox', icon: '🧰', type: 'key', price: 0, desc: 'Taken back from the Donquixote vault at Spider Miles. It belongs to the people of Rakesh.' },
  nb_corazon_coat: { name: 'Black Feather Coat', icon: '🪶', type: 'coat', look: { coat: '#212121' }, bonus: { wil: 2, agi: 1 }, price: 0, unique: true, desc: 'Corazon\'s coat, singed at the hem — he set it alight more than once lighting a cigarette. It makes no sound when you move.' },
  nb_shibireru: { name: 'Hyper Shibireru-kun', icon: '⚡', type: 'weapon', kind: 'sword', power: 1.4, price: 0, grade: 'Unranked (invention)', unique: true, desc: 'Wolf\'s electrified katana. A genius invention that only occasionally shocks its owner.' },
  nb_sora_comic: { name: 'Sora, Warrior of the Sea (comic)', icon: '📰', type: 'treasure', price: 250, desc: 'The World Economy News Paper\'s hit comic. Sora, his transforming robot and his seagull always beat Germa 66, the evil army. North Blue kids swear Germa 66 is real.' },
  nb_germa_antidote: { name: 'Germa Antidote', icon: '💉', type: 'medicine', heal: 180, price: 0, cure: ['poison', 'bleed'], desc: 'Germa medical science in a pink vial. Princess Reiju swears by it.' },
};

const trainers = {
  nb_wolf: {
    name: 'Wolf', where: 'Wolf\'s house, Swallow Island', styles: { sniper: 1500 }, teaches: ['snipe_explode', 'snipe_tabasco', 'snipe_firebird'], train: { agi: 24, wil: 22 },
    spar: { level: 12, style: 'sniper', weapon: 'gun', name: 'Wolf' },
    lines: ['Give and take! You want lessons, you split the firewood first.', 'A hunter breathes out before the shot. Everybody forgets that.'],
  },
  nb_longarm: {
    name: 'Ulrich', where: 'Longarm Boxing Club, Notice', styles: {}, teaches: ['brawl_tackle', 'brawl_knee', 'brawl_headbutt'], train: { str: 24, end: 22, agi: 20 },
    spar: { level: 10, style: 'brawler', name: 'Longarm Sparring Partner' },
    lines: ['Friend Elbow! Lover Elbow! Again!', 'Reach is a weapon. Make them come to you.'],
  },
  nb_lvneel_fencing: {
    name: 'Master Ostrander', where: 'Royal Fencing Hall, Lvneel', styles: { ittoryu: 2000 }, teaches: ['itto_iai', 'itto_pound'], train: { str: 22, agi: 24 },
    spar: { level: 12, style: 'ittoryu', weapon: 'sword', name: 'Royal Fencer' },
    lines: ['One blade. Cut true. That is the Lvneel way.', 'The true log says Admiral Noland cut down a Sea King with a blade like this.'],
  },
};

const stock = {
  nb_lvneel_books: ['nb_liar_noland', 'nb_sora_comic', 'den_den_mushi', 'rice_ball'],
  nb_flevance_salvage: ['amber_lead', 'bandage', 'antidote', 'rusty_katana', 'flintlock'],
  nb_scrap_market: ['cutlass', 'flintlock', 'rusty_katana', 'woodsman_axe', 'seastone', 'cola'],
  nb_germa_kitchen: ['fish_stew', 'meat', 'sea_king_steak', 'sake'],
  nb_kuen_post: ['bandage', 'sake', 'bandana'],
};

const archetypes = {
  nb_dq_grunt: { name: 'Donquixote Pirate', faction: 'pirate', style: 'ittoryu', weapon: 'sword', look: { top: '#f48fb1', bottom: '#212121', hat: 'bandana', hatColor: '#ad1457' }, skill: 0.25, barks: ['For the Young Master!', 'Fuffuffu... that\'s what the boss says!'] },
  nb_dq_gunner: { name: 'Donquixote Gunman', faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#212121', hat: 'tricorne', hatColor: '#ad1457' }, skill: 0.2 },
  nb_germa_clone: { name: 'Germa 66 Clone Soldier', faction: 'rival', style: 'brawler', look: { top: '#37474f', bottom: '#263238', coat: '#263238', coatText: '66', goggles: true }, skill: 0.4, hpMul: 1.3, moves: ['brawl_tackle'], barks: ['For Germa.', '...', 'Orders are absolute.'] },
  nb_barrels_pirate: { name: 'Barrels Pirate', faction: 'pirate', style: 'ittoryu', weapon: 'sword', look: { top: '#5d4037', hat: 'bandana', hatColor: '#ef6c00' }, skill: 0.2, barks: ['Five billion berries, boys!', 'Nobody touches the fruit!'] },
  nb_bacca_pirate: { name: 'Bacca Pirate', faction: 'pirate', style: 'brawler', look: { top: '#4a148c', hat: 'bandana', hatColor: '#311b92' }, skill: 0.2, barks: ['Melt \'em, Captain!', 'Where\'s the treasure?!'] },
};

// Signature moves of North Blue villains (canon technique names from the One
// Piece Wiki; Devil Fruits that are not in the fruit registry are emulated).
const abilities = [
  // Giolla (Ato Ato no Mi)
  { id: 'nb_broken_fu', name: 'Broken-Fu Art', anim: 'punch', windup: 0.3, recover: 0.35, cd: 5, say: 'Broken-Fu Art!',
    steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.4, offset: 0.2, damage: 5, knockback: 1, stun: 0.15, duration: 0.6, interval: 0.12 }, vfx: 'ring', color: '#ce93d8' }] },
  { id: 'nb_art_art', name: 'Art-Art Transformation', anim: 'cast', windup: 0.45, recover: 0.35, cd: 10,
    steps: [{ proj: { speed: 13, range: 10, radius: 0.5, damage: 6, sprite: 'petal', color: '#ce93d8', status: { root: 2 }, stun: 0.4 } }] },
  // Machvise (Ton Ton no Mi)
  { id: 'nb_jutton_vise', name: 'Jutton Vise', anim: 'heavy', windup: 0.9, recover: 0.6, cd: 8, say: 'Jutton Vise!',
    steps: [{ zone: { range: 2.4, duration: 0.3, interval: 0.3, damage: 30, atTarget: true, kind: 'meteor', color: '#8d6e63' } }] },
  // Senor Pink (Sui Sui no Mi)
  { id: 'nb_terra_swim', name: 'Terra Swimming', anim: 'thrust', windup: 0.3, recover: 0.3, cd: 6,
    steps: [{ dash: { dist: 8, time: 0.4, iframes: 0.4, hit: { damage: 14, knockback: 5, stun: 0.5 } } }] },
  { id: 'nb_nekomimi_punch', name: 'Nekomimi Punch', anim: 'punch', windup: 0.3, recover: 0.3, cd: 4, say: 'Nekomimi Punch!',
    steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.0, offset: 0.2, damage: 16, knockback: 6, stun: 0.5 } }] },
  { id: 'nb_nyannyan_suplex', name: 'NyanNyan Suplex', anim: 'grab', windup: 0.45, recover: 0.5, cd: 8, say: 'NyanNyan Suplex!',
    steps: [{ hit: { shape: 'arc', range: 1.5, arc: 1.2, offset: 0.2, damage: 22, knockback: 4, stun: 1.0, heavy: true, guardBreak: true, shake: 0.35 } }] },
  // Gladius (Pamu Pamu no Mi)
  { id: 'nb_punc_bala', name: 'Punc Bala', anim: 'shoot', windup: 0.45, recover: 0.35, cd: 6, say: 'Punc Bala!',
    steps: [{ proj: { speed: 13, range: 11, radius: 0.4, damage: 8, count: 3, spread: 0.4, sprite: 'bomb', explode: { range: 1.8, damage: 14 } } }] },
  { id: 'nb_jirai_punc', name: 'Jirai Punc', anim: 'cast', windup: 0.6, recover: 0.4, cd: 10, say: 'Jirai Punc!',
    steps: [{ zone: { range: 2.4, duration: 1.2, interval: 0.6, damage: 14, atTarget: true, element: 'explosion', kind: 'field', color: '#ffab40' } }] },
  { id: 'nb_met_punc', name: 'Met Punc', anim: 'heavy', windup: 0.5, recover: 0.4, cd: 7,
    steps: [{ hit: { shape: 'circle', range: 2.6, damage: 20, knockback: 8, stun: 0.5, element: 'explosion', shake: 0.3 }, vfx: 'ring', color: '#ffab40' }] },
  // Trebol (Beta Beta no Mi)
  { id: 'nb_beta_chain', name: 'Beta Beta Chain', anim: 'cast', windup: 0.35, recover: 0.3, cd: 7, say: 'Beta Beta Chain!',
    steps: [{ proj: { speed: 16, range: 11, radius: 0.45, damage: 10, sprite: 'string', color: '#90caf9', status: { root: 2.2 }, stun: 0.3 } }] },
  { id: 'nb_beto_launcher', name: 'Beto Launcher', anim: 'shoot', windup: 0.6, recover: 0.4, cd: 9, say: 'Beto Launcher!',
    steps: [{ proj: { speed: 11, range: 11, radius: 0.5, damage: 8, sprite: 'orb', color: '#81d4fa', explode: { range: 2.8, damage: 26 } } }] },
  { id: 'nb_betton_meteora', name: 'Beta Betton Meteora', anim: 'cast', windup: 0.8, recover: 0.5, cd: 14,
    steps: [{ zone: { range: 3.2, duration: 4, interval: 0.5, damage: 4, atTarget: true, slow: 0.5, color: '#81d4fa', kind: 'field' } }] },
  // Diamante (Hira Hira no Mi)
  { id: 'nb_hangetsu_glaive', name: 'Hangetsu Glaive', anim: 'slash', windup: 0.45, recover: 0.4, cd: 5, say: 'Hangetsu Glaive!',
    steps: [{ hit: { shape: 'arc', range: 3.0, arc: 2.6, offset: 0.2, damage: 24, knockback: 5, stun: 0.5, slashing: true }, vfx: 'slash', color: '#e0e0e0' }] },
  { id: 'nb_vipera_glaive', name: 'Vipera Glaive', anim: 'thrust', windup: 0.4, recover: 0.4, cd: 7, say: 'Vipera Glaive!',
    steps: [{ hit: { shape: 'line', range: 5.5, width: 1.0, damage: 26, knockback: 4, stun: 0.5, slashing: true }, vfx: 'beam', color: '#ef5350' }] },
  { id: 'nb_hira_release', name: 'Hira Release', anim: 'cast', windup: 0.5, recover: 0.4, cd: 10,
    steps: [{ hit: { shape: 'circle', range: 3.4, damage: 16, knockback: 10, stun: 0.5 }, vfx: 'ring', color: '#b71c1c' }] },
  // Pica (Ishi Ishi no Mi)
  { id: 'nb_pulpostone', name: 'Pulpostone', anim: 'heavy', windup: 0.75, recover: 0.5, cd: 7, say: 'Pulpostone!',
    steps: [{ zone: { range: 2.2, duration: 0.4, interval: 0.4, damage: 30, atTarget: true, kind: 'fists', color: '#9e9e9e' } }] },
  { id: 'nb_ishiusu', name: 'Ishiusu', anim: 'heavy', windup: 0.8, recover: 0.5, cd: 11, say: 'Ishiusu!',
    steps: [{ hit: { shape: 'circle', range: 3.6, damage: 24, knockback: 8, stun: 0.7, element: 'quake', heavy: true, shake: 0.5 }, vfx: 'ring', color: '#9e9e9e' }] },
  // Vergo
  { id: 'nb_demon_bamboo', name: 'Demon Bamboo', anim: 'heavy', windup: 0.4, recover: 0.4, cd: 5,
    steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.2, offset: 0.3, damage: 30, knockback: 8, stun: 0.7, heavy: true, guardBreak: true, haki: true, shake: 0.4 }, vfx: 'ring', color: '#6a1b9a' }] },
  // Diez Barrels
  { id: 'nb_barrels_volley', name: 'Deserter\'s Volley', anim: 'shoot', windup: 0.45, recover: 0.4, cd: 6,
    steps: [{ proj: { speed: 20, range: 12, radius: 0.25, damage: 9, count: 4, spread: 0.5, sprite: 'bullet' } }] },
  // Vinsmoke Niji (Raid Suit: Dengeki Blue)
  { id: 'nb_henry_blazer', name: 'Lightspeed Sword: Henry Blazer', anim: 'thrust', windup: 0.25, recover: 0.35, cd: 6, say: 'Henry Blazer!',
    steps: [{ dash: { dist: 10, time: 0.18, iframes: 0.2, hit: { damage: 28, knockback: 6, stun: 0.6, element: 'lightning', status: { shock: 1.2 } } } }] },
  { id: 'nb_henry_needle', name: 'Henry Needle', anim: 'shoot', windup: 0.3, recover: 0.3, cd: 4,
    steps: [{ proj: { speed: 26, range: 12, radius: 0.3, damage: 14, sprite: 'thunder', element: 'lightning', status: { shock: 1 } } }] },
  { id: 'nb_dengeki_blue', name: 'Dengeki Blue', anim: 'cast', windup: 0.6, recover: 0.4, cd: 12,
    steps: [{ hit: { shape: 'circle', range: 3.4, damage: 20, knockback: 6, stun: 0.8, element: 'lightning', status: { shock: 1.5 } }, vfx: 'ring', color: '#64b5f6' }] },
  // Koni Boakeno
  { id: 'nb_yokozuna_bomber', name: 'Yokozuna Bomber', anim: 'grab', windup: 0.5, recover: 0.5, cd: 7, say: 'Yokozuna Bomber!',
    steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.2, offset: 0.2, damage: 26, knockback: 3, stun: 1.0, heavy: true, guardBreak: true, shake: 0.4 } }] },
  // Artur Bacca (Dero Dero no Mi)
  { id: 'nb_bacca_maces', name: 'Twin Mace Crush', anim: 'heavy', windup: 0.4, recover: 0.4, cd: 4,
    steps: [{ hit: { shape: 'arc', range: 2.0, arc: 2.0, offset: 0.2, damage: 20, knockback: 6, stun: 0.5, heavy: true } }] },
  { id: 'nb_derorinpa', name: 'Derorinpa', anim: 'cast', windup: 0.6, recover: 0.4, cd: 11, say: 'Derorinpa!',
    steps: [{ zone: { range: 3.2, duration: 4, interval: 0.5, damage: 5, atTarget: true, element: 'water', status: { wet: 3 }, slow: 0.5, color: '#4fc3f7', kind: 'field' } }] },
];

// -------------------------------------------------------------- install
function install(game) {
  // The Sea King of the Lvneel picture book surfaces south of the harbour
  let tt = 0;
  game.on('tick', (dt) => {
    const c = game.state?.char;
    if (!c || !game.surface || game.world !== game.surface) return;
    tt -= dt;
    if (tt > 0) return;
    tt = 0.5;
    if (game.quests.stageId('nb_liar_noland') === 'seaking' && !findActor(game, 'nb_lvneel_seaking')) {
      const isl = game.surface.islands.find((i) => i.id === 'lvneel');
      const s = isl?.spots?.lvneel_seaking;
      if (s && game.world.distance(game.player.x, game.player.y, s.x, s.y) < 28 && game.world.isLiquid(s.x, s.y)) {
        const k = seaBoss(game, { id: 'nb_lvneel_seaking', name: 'Sea King of Lvneel', title: 'The beast from the picture book', level: 18, hpMul: 3.4, color: '#5e35b1', breakthrough: 3 }, s.x, s.y);
        k.npcId = 'nb_lvneel_seaking';
        game.ui.banner('SEA KING', 'Off the coast of Lvneel', 'The sea heaves. The beast from the picture book is real — and hungry.', 4);
      }
    }
  });

  game.on('enterIsland', (isl) => {
    const c = game.state?.char;
    if (!c || !isl) return;
    if (isl.id === 'swallow_island' && game.quests.isDone('nb_ope_ope') && !game.quests.state('nb_heart_pirates')) game.quests.start('nb_heart_pirates');
    if (isl.id === 'baratie' && game.quests.stageId('nb_third_prince') === 'baratie' && !c.flags.nbSawSanji) {
      c.flags.nbSawSanji = true;
      game.ui.banner('The Curly-Browed Cook', 'Baratie', 'A young cook with a curly eyebrow and a cigarette kicks a rowdy customer clean over the rail — then serves the man\'s hungry crewmate a free plate. He looks... happy.', 7);
    }
    if (isl.id === 'flevance' && !c.flags.nbSawFlevance) {
      c.flags.nbSawFlevance = true;
      game.ui.banner('The White Town', 'Flevance', 'White fields, white trees, white roofs. It looks like snow. It is not.', 5);
    }
    if (isl.id === 'germa_kingdom' && !c.flags.nbSawGerma) {
      c.flags.nbSawGerma = true;
      game.ui.banner('The Germa Kingdom', 'A nation without land', 'Brick castles ride on the shells of giant snails, locked together around a five-towered keep. Every flag reads "66".', 6);
    }
  });

  // Where Rosinante died, a heart is traced in the snow.
  game.spawner.addBuilder(({ island, spawner }) => {
    const c = game.state?.char;
    if (!c || island.id !== 'minion_island' || !c.flags.nbCorazonDied || island._nbGrave) return;
    const s = island.spots?.corazon_last;
    if (!s) return;
    const p = spawner.findFree(s.x, s.y, 4) || s;
    island._nbGrave = true;
    game.world.objects.add({ kind: 'grave', x: p.x, y: p.y, block: true, name: 'A heart traced in the snow' });
  });
}

export default {
  id: 'northBlue', npcs, groups, quests, items, trainers, stock, archetypes, abilities,
  dynamicIds: ['nb_lvneel_seaking'],
  install,
};
