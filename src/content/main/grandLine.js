// Part 2: The Grand Line (Paradise). Down the torrent from Reverse Mountain to
// the Twin Cape lighthouse, where Crocus tells you what the Log Pose will do:
// lock onto one of the islands off the cape, and set your road. Every road is its own
// adventure. Pirate roads all end at the Sabaody Archipelago, the doorway to
// the New World; the Marines' at Marineford, Navy Headquarters; the hunters'
// at Enies Lobby, where the World Government's court pays out the greatest
// bounties of all. You can't sail on past the island your story is on (see
// mainStory.js): the Grand Line's currents turn you round without its log.
import { chapter, target, T, LOOK, PLANS, CHAPTERS, onward } from './define.js';
import { RNG } from '../../core/rng.js';
import { count } from '../../game/inventory.js';

const beaten = (id) => (c) => (c.bosses || []).includes(id) || !!c.defeated?.[id];

// ================================================================= TWIN CAPE
chapter('gl_twin_cape', { part: 2, island: 'twin_cape', opensStory: true, noLog: false }, {
  all: {
    name: 'The Whale Who Waits',
    contact: { npc: 'p1_crocus', where: 'at the Twin Cape lighthouse' },
    pitch: [
      'You came down the mountain alive. Hmph. Most don\'t. I\'m Crocus, keeper of this lighthouse — and of the whale at the foot of it.',
      'What brings you to the Grand Line? Answer honestly. The sea knows when you lie.',
    ],
    tasks: [T.quest('p1_laboon_promise', 'Hear the story of Laboon, the whale who waits, and make him a promise (Crocus).', 'p1_crocus')],
    wait: 'Laboon is waiting. He\'s always waiting.',
    // (to someone who'd rather sail their own way: see mainStory.js)
    free: 'Then sail your own way. The Grand Line doesn\'t care why you came — only whether you can live through it. Laboon and I will be here.',
    done: [
      'Laboon hasn\'t rammed the Red Line since you left. A promise is a powerful thing.',
      'Listen well. Every island here has its own magnetism, and the Log Pose follows it. From this cape, ten roads lead into the Grand Line. Your needle will choose one of them.',
      (ctx) => `${onward(ctx.char, 'There — the log has set. It points to')} Wherever it takes you, your story is there. Don't sail past it: without its log, the Grand Line will only turn you round.`,
    ],
    after: 'Keep your promise to Laboon. He\'ll wait for you. He\'s good at that.',
  },
  pirate: {
    summary: 'At the foot of Reverse Mountain an old man keeps a lighthouse, and a whale the size of an island rams the Red Line, waiting for a crew that never came back.',
    meet: ['A pirate. Of course. Fifty years ago another pirate crew came down that mountain with a baby whale. They told him to wait. He\'s still waiting.', 'Talk to me about Laboon, and I\'ll tell you how the Grand Line works. You\'ll need both.'],
    accept: 'I\'m a pirate. I\'m going to the end of the Grand Line.',
  },
  marine: {
    summary: 'At the foot of Reverse Mountain, the lighthouse keeper Crocus has seen every crew — and every Marine — come down the torrent.',
    meet: ['A Marine. G-8 is north of here, on Navarone — they\'ll want you. But first, since you\'re here, listen to an old man about his whale.', 'Laboon has been waiting fifty years for a pirate crew. Maybe a Marine can give him something to hope for.'],
    accept: 'I\'m a Marine, reporting to the Grand Line.',
  },
  hunter: {
    summary: 'At the foot of Reverse Mountain, the lighthouse keeper Crocus has watched every crew come down the torrent — and every hunter chasing them.',
    meet: ['A bounty hunter. The Grand Line\'s posters are bigger than the ones back home. So are the pirates. Most hunters I see come down that mountain never go up anything again.', 'Hear me out about Laboon first. Then I\'ll tell you how to survive.'],
    accept: 'I hunt pirates. I\'m here for the big posters.',
  },
});

// ================================================================= THE SEVEN ROADS (first islands)
chapter('gl_cactus', { part: 2, island: 'cactus_island', place: 'Whisky Peak (Cactus Island)' }, {
  pirate: {
    name: 'Welcome to Whisky Peak', lure: 'a town of cheering people who welcome every pirate crew — suspiciously warmly',
    summary: 'Whisky Peak welcomes every pirate crew with a party. The mayor, Igaram, is very friendly. A little too friendly.',
    contact: { npc: 'p1_igaram', where: 'at the Whisky Peak Saloon' }, noReport: true,
    meet: ['Welcome, welcome, brave pirates! Whisky Peak loves pirates! Songs, sake, a party in your honour — ahem — ma-ma-maa~!', 'Please, rest here tonight. We insist. We REALLY insist.'],
    tasks: [T.quest('p1_whisky_peak', 'Enjoy Whisky Peak\'s "welcome" — and survive the night (Mayor Igaram).', 'p1_igaram')],
    wait: 'Ma-ma-maa~! Enjoy the party!',
  },
  hunter: {
    name: 'The Town of Bounty Hunters', lure: 'a town of "bounty hunters" who welcome pirates with parties — and knives',
    summary: 'Whisky Peak is a town of bounty hunters pretending to be friends to pirates. Real hunters have a word for that kind of work.',
    contact: { name: 'Old Deacon', title: 'Retired Bounty Hunter', look: { hair: 'long', hairColor: '#bdbdbd', top: '#4e342e', bottom: '#3e2723', hat: 'cowboy', hatColor: '#3e2723' }, at: { town: 'whisky_peak', plaza: true, ox: 4 }, where: 'in the Whisky Peak square' },
    meet: ['You\'re a real hunter? Then keep your voice down. This whole town is a front — Baroque Works. They drug pirate crews at parties and sell them to the Marines.', 'Gives honest hunters a bad name. Go to the party at the saloon. Stay sober. See what they\'re really up to.'],
    tasks: [T.quest('p1_whisky_peak', 'Go to Whisky Peak\'s party — stay sober and find out who\'s really behind the town (Mayor Igaram).', 'p1_igaram')],
    wait: 'The saloon. Watch your drink.',
    done: ['Baroque Works, pretending to be hunters — and you took them apart. Honest hunters owe you.', (ctx) => onward(ctx.char, 'The Baroque trail leads to')],
  },
});

chapter('gl_kenzan', { part: 2, island: 'kenzan_island', place: 'Tehna Gehna (Kenzan Island)' }, {
  pirate: {
    name: 'The Whirlpool Lord', lure: 'the swordsmiths of Kenzan Island are being eaten by their own sea',
    summary: 'Kenzan Island\'s whirlpool has a lord — a Sea King that drags boats down. Old Tenaga, a retired swordsmith, can\'t get his supplies in.',
    contact: { npc: 'p1_tenaga', where: 'at his house in Tehna Gehna' },
    meet: ['A pirate ship made it through the whirlpool? Then you\'re strong, or lucky, or both.', 'The Whirlpool Lord has sunk every supply boat for a month. Kill it, and I\'ll forge you something worth carrying into the Grand Line.'],
    tasks: [T.quest('p1_kenzan_whirlpool', 'Hunt the Whirlpool Lord (Old Tenaga).', 'p1_tenaga')],
    wait: 'The whirlpool is west of the village.',
    done: ['The Whirlpool Lord, gone! Boats are coming in already.', (ctx) => onward(ctx.char, 'Your log has set for')],
  },
});

chapter('gl_foolshout', { part: 2, island: 'foolshout_island' }, {
  pirate: {
    name: 'The Sun Pirates\' Flag', lure: 'a mother on Foolshout Island is waiting for a flag that was lost at sea',
    summary: 'On Foolshout Island, a mother waits for word of her daughter — a girl who was rescued by the Sun Pirates, Fish-Men who sailed under a flag like a burn.',
    contact: { npc: 'p1_koala_mother', where: 'at her home in Foolshout Village' },
    meet: ['My daughter was a slave, once. Fish-Man pirates brought her home — the Sun Pirates. They left their flag on the anchorage when they sailed.', 'It blew into the sea in a storm. Would you find it? It\'s all I have of the people who saved her.'],
    tasks: [T.quest('p1_foolshout_sun', 'Find the Sun Pirates\' flag at the old anchorage (Koala\'s mother).', 'p1_koala_mother')],
    wait: 'The old anchorage, on the south shore.',
    done: ['Their flag. Thank you. A pirate brought my daughter home once. Now a pirate brings me this.', (ctx) => onward(ctx.char, 'Your log has set for')],
  },
});

chapter('gl_ruluka', { part: 2, island: 'ruluka_island' }, {
  pirate: {
    name: 'The Rainbow Mist', lure: 'an old man on Ruluka Island has spent his life studying a mist that eats ships',
    summary: 'The Rainbow Mist swallows ships and spits them out decades later. Henzo, the old scientist of Ruluka, has studied it all his life — and a pirate called Wetton wants to use it.',
    contact: { npc: 'p1_henzo', where: 'at his workshop in Ruluka' },
    meet: ['The Rainbow Mist is not a legend. It\'s a door. And Wetton the pirate wants to sell tickets through it.', 'Stop him, and I\'ll share what I know about the sea beyond the mist.'],
    tasks: [T.quest('p1_ruluka_rainbow', 'Stop the pirate Wetton from exploiting the Rainbow Mist (Henzo).', 'p1_henzo')],
    wait: 'Wetton\'s camp is on the far shore.',
    done: ['Wetton is finished, and Ruluka is free. Fifty years of research — and a pirate saves it.', (ctx) => onward(ctx.char, 'Your log has set for')],
  },
});

chapter('gl_vira', { part: 2, island: 'vira' }, {
  pirate: {
    name: 'Noland\'s Departure', lure: 'the archives of Vira hold a page of Noland the Liar\'s log',
    summary: 'Noland the explorer stopped at Vira on his way to the city of gold. Looters are digging up the ruins where his log was hidden.',
    contact: { npc: 'p1_vira_archivist', where: 'at the Vira Harbour Archives' },
    meet: ['Noland the Liar passed through Vira four hundred years ago. We think he hid a page of his log in the ruins.', 'Looters are digging there now. Stop them before they burn what they can\'t sell.'],
    tasks: [T.quest('p1_vira_logbook', 'Stop the looters in the ruins of Vira (Archivist Soleil).', 'p1_vira_archivist')],
    wait: 'The ruins, north of town.',
    done: ['Noland\'s page — safe! Show it to anyone who calls him a liar.', (ctx) => onward(ctx.char, 'Your log has set for')],
  },
});

chapter('gl_navarone', { part: 2, island: 'navarone', place: 'G-8 (Navarone)' }, {
  marine: {
    name: 'G-8', lure: 'G-8, the Navy fortress at the foot of Reverse Mountain, is waiting for your report',
    summary: 'G-8, the Navy\'s fortress on Navarone, watches every crew that comes down Reverse Mountain. Commodore Jonathan runs it — and he has orders for you.',
    contact: { npc: 'p1_jonathan', where: 'at G-8 Headquarters, Navarone' },
    meet: ['Ah — the recruit from the Blues. Welcome to G-8. The rookies coming down that mountain get stranger every year, and we\'re the first thing they meet.', 'You\'ve orders from Headquarters. You\'ll follow the log along one of the routes and help the branches along the way. But first, a Marine of G-8 keeps his eyes open: patrol the base and report back. There are always pirates hiding on Navarone.'],
    tasks: [T.defeat('mq_gl_g8_stowaway', 'Catch the pirate stowaway hiding on Navarone.')],
    wait: 'The stowaway is somewhere on the island. Check the docks.',
    done: ['Ha! A stowaway, caught by a recruit on her first day at G-8. Good.', (ctx) => `Here are your orders. ${onward(ctx.char, 'Follow your log to')} And Marine — the Grand Line doesn't care about rank. Stay alive.`],
    after: 'Remember what you learned at G-8. Eyes open, always.',
  },
});
target({ id: 'mq_gl_g8_stowaway', island: 'navarone', name: '"Rat-Tail" Pomm', title: 'Pirate Stowaway', faction: 'pirate', boss: true, hpMul: 0.8, level: 22, bounty: 12000000,
  at: { town: 'g8_base', dock: true, ox: 3 }, look: { hair: 'spiky', hairColor: '#795548', top: '#5d4037', bottom: '#3e2723', hat: 'bandana', hatColor: '#795548' }, style: 'brawler', skill: 0.35, alert: 'Nobody finds Pomm! ...Except you, apparently.' });

chapter('gl_kyuka', { part: 2, island: 'kyuka_island' }, {
  hunter: {
    name: 'The Resort Robber', lure: 'the resort on Kyuka Island has a pirate problem — and rich guests who pay to be rid of it',
    summary: 'Kyuka Island is where the Grand Line\'s rich go to relax. A pirate called Glutton Gaspard has been robbing the guests, and the hotel is offering a fortune.',
    contact: { npc: 'p1_kyuka_manager', where: 'at the Hotel Kyuka' },
    meet: ['You\'re a bounty hunter? Oh, thank goodness. Glutton Gaspard — thirty-eight million — robs our guests every week and eats everything in the kitchens.', 'The guests have added to his bounty. Please, bring him in. He lounges by the resort pier between raids, bold as brass.'],
    tasks: [T.defeat('mq_gl_gaspard', 'Hunt down Glutton Gaspard (฿38,000,000) by the Kyuka resort pier.')],
    wait: 'Gaspard is down by the resort pier.',
    done: ['Gaspard, in chains! Our guests will be so relieved — and generous.', (ctx) => onward(ctx.char, 'The next fat poster I\'ve heard of is on')],
  },
});
target({ id: 'mq_gl_gaspard', island: 'kyuka_island', name: 'Glutton Gaspard', title: 'Captain of the Buffet Pirates', faction: 'pirate', boss: true, hpMul: 1, level: 24, bounty: 38000000,
  at: { town: 'kyuka_resort', dock: true, ox: -3 }, look: { hair: 'curly', hairColor: '#ff7043', top: '#fdd835', bottom: '#5d4037', bulk: 1.6 }, style: 'brawler', skill: 0.35, alert: 'You look delicious!' });

// ================================================================= THE MIDDLE OF THE ROADS
chapter('gl_little_garden', { part: 2, island: 'little_garden' }, {
  all: {
    name: 'The Hundred-Year Duel',
    contact: { npc: 'p1_dorry', where: 'at his camp in the jungle' },
    tasks: [T.quest('p1_little_garden', 'Help the giants of Little Garden — and find out who\'s been interfering with their duel (Dorry).', 'p1_dorry')],
    wait: 'Gegyagyagya! Go on, little one. The jungle is waiting.',
  },
  pirate: {
    lure: 'two giants have been duelling there for a hundred years',
    summary: 'On Little Garden, a prehistoric jungle, two giants have fought a duel for a hundred years. Someone has started cheating.',
    meet: ['Gegyagyagya! A little pirate! I am Dorry of the Giant Warrior Pirates. Brogy and I have fought for a hundred years, and neither of us remembers why.', 'But someone is meddling in our duel. Baroque Works, the little people call them. Find them for me.'],
    done: ['Baroque Works, beaten, and the duel is honest again! You\'ll make a fine warrior of Elbaf someday, little one.', (ctx) => onward(ctx.char, 'Your log has set for')],
  },
  marine: {
    lure: 'Baroque Works agents are operating on Little Garden',
    summary: 'Baroque Works — a secret criminal organisation — is operating on Little Garden, where two giants have duelled for a hundred years.',
    meet: ['Gegyagyagya! A Marine, here? The Navy never comes to Little Garden.', 'Well, you\'ve come at a good time. Someone is meddling in our duel. Baroque Works, they call themselves. Arrest them all!'],
    done: ['Baroque Works, in chains! Our duel is honest again. The Navy is good for something after all!', (ctx) => onward(ctx.char, 'Your orders now point to')],
  },
});

chapter('gl_drum', { part: 2, island: 'drum_island' }, {
  all: {
    name: 'Hiriluk\'s Cherry Blossoms',
    contact: { npc: 'p1_dalton', where: 'at his house in Bighorn' },
    tasks: [T.quest('p1_drum_kingdom', 'Help Drum Island stand up to King Wapol\'s return (Dalton, Bighorn).', 'p1_dalton')],
    wait: 'The castle is at the top of the Drum Rockies. Dress warmly.',
  },
  pirate: {
    lure: 'a snowbound kingdom with no king and one doctor, who lives on a mountaintop',
    summary: 'Drum Island\'s king ran away when pirates came. Now he\'s back — and the people want him gone for good.',
    meet: ['Pirates? Here? The last pirates who came here were Blackbeard\'s, and our king ran away from them.', 'Now Wapol is back to take his throne. The people won\'t have him — but we can\'t fight him alone. Help us.'],
    done: ['Wapol is gone for good. Drum is free. The doctors on the mountain want to thank you.', (ctx) => onward(ctx.char, 'Your log has set for')],
  },
  marine: {
    lure: 'the deposed king of Drum is trying to take his throne back by force',
    summary: 'King Wapol abandoned his people when pirates came. Now he\'s back with an army of thugs.',
    meet: ['A Marine! Wapol is back, and he\'s not asking permission to be king again.', 'The World Government gave him his crown. Maybe the Navy can take it away.'],
    done: ['Wapol, beaten. The people will choose their own leader now. Thank the Navy for us.', (ctx) => onward(ctx.char, 'Your orders now point to')],
  },
  hunter: {
    lure: 'King Wapol has a bounty on his head now that he\'s turned pirate',
    summary: 'King Wapol turned pirate when he lost his throne. Now there\'s a price on his tin head.',
    meet: ['A hunter. Wapol and his men have prices on their heads now that they\'re pirates.', 'Help us, and the reward is yours.'],
    done: ['Wapol, beaten, and his poster paid. Drum is free.', (ctx) => onward(ctx.char, 'The next big poster is on')],
  },
});

chapter('gl_alabasta', { part: 2, island: 'alabasta' }, {
  all: {
    name: 'Operation Utopia',
    contact: { npc: 'p1_vivi', where: 'in Nanohana' }, noReport: true,
    tasks: [T.quest('p1_alabasta', 'Stop Baroque Works from destroying the Kingdom of Alabasta (Princess Vivi).', 'p1_vivi', undefined, { autoStart: true })],
    wait: 'Please — Alabasta is running out of time.',
  },
  pirate: {
    lure: 'a desert kingdom on the edge of civil war, and a princess who needs help',
    summary: 'Alabasta is on the edge of civil war. Rain hasn\'t fallen in the capital for three years — except at Rainbase, where Sir Crocodile, a Warlord of the Sea, lives in his casino.',
    meet: ['You came. I\'m Vivi, princess of Alabasta. My country is tearing itself apart — the rebels think my father stole the rain.', 'It\'s Baroque Works. It\'s Crocodile. Please — help me stop him before the rebellion reaches the capital.'],
  },
  marine: {
    lure: 'a Warlord of the Sea is suspected of plotting to take a kingdom',
    summary: 'A Warlord of the Sea, Sir Crocodile, is suspected of plotting to take Alabasta. Captain Smoker is already in Nanohana. So is the princess.',
    meet: ['A Marine? Good. Captain Smoker doesn\'t believe me either — not yet.', 'Crocodile is Mr. 0, the head of Baroque Works. He\'s drying up my country to steal it. Please help me prove it.'],
  },
  hunter: {
    lure: 'Baroque Works\' officers have fat posters — and they\'re all in Alabasta',
    summary: 'Every Baroque Works officer has a poster. Every one of them is in Alabasta.',
    meet: ['You hunt pirates? Then hunt these. Baroque Works — Mr. 1, Mr. 2, all of them. And Crocodile.', 'The Navy made him a Warlord. His true bounty would be enormous. Help me, and I\'ll see you\'re paid.'],
  },
});

chapter('gl_jaya', { part: 2, island: 'jaya', place: 'Mock Town (Jaya)' }, {
  all: {
    name: 'The Hyena of Mock Town',
    contact: { npc: 'p1_cricket', where: 'at his house on the far side of Jaya' },
    tasks: [T.quest('p1_mock_town', 'Take on Bellamy the Hyena in Mock Town.', 'p1_bellamy', undefined, { alt: beaten('p1_bellamy') })],
    wait: 'Bellamy drinks in Mock Town. Everybody knows where.',
  },
  pirate: {
    lure: 'Mock Town, where pirates laugh at dreamers — and one old man still dreams of a city of gold',
    summary: 'In Mock Town, pirates laugh at anyone who still dreams. Old Montblanc Cricket dives for a city of gold every day. Bellamy the Hyena laughs loudest.',
    meet: ['You came to see the famous fool of Jaya? Hah. I dive for the city of gold my ancestor, Noland, saw. They call him a liar. They call me a fool.', 'Bellamy the Hyena runs Mock Town. He\'ll laugh at your dream too. Don\'t let him.'],
    done: ['You beat Bellamy?! Hahaha! The city of gold — the sky — maybe it\'s all real after all.', (ctx) => onward(ctx.char, 'Your log has set for')],
  },
  hunter: {
    lure: 'Bellamy the Hyena — fifty-five million — drinks in Mock Town',
    summary: 'Bellamy the Hyena: fifty-five million berries.',
    meet: ['A hunter? Bellamy\'s fifty-five million, and he never stops laughing. Take that smile off his face.', 'He\'s in Mock Town. Everybody knows.'],
    done: ['Bellamy, beaten! Hahaha! He won\'t laugh at anyone for a while.', (ctx) => onward(ctx.char, 'Your next lead points to')],
  },
});

chapter('gl_long_ring', { part: 2, island: 'long_ring_long_land' }, {
  all: {
    name: 'The Davy Back Fight',
    contact: { name: 'Tonjit', title: 'Nomad of Long Ring Long Land', look: { hair: 'long', hairColor: '#eceff1', top: '#8d6e63', bottom: '#5d4037', hat: 'straw', hatColor: '#d7ccc8', scale: 1.3 }, at: { town: 'foxy_camp', plaza: true, ox: -5 }, where: 'at the Foxy camp' },
    tasks: [T.quest('p1_davy_back_fight', 'Beat the Foxy Pirates at the Davy Back Fight.', 'p1_foxy', undefined, { alt: beaten('p1_foxy') })],
    wait: 'Foxy\'s games are rigged. Win anyway.',
  },
  pirate: {
    lure: 'an island of long things, and a pirate who steals crews with a game',
    summary: 'Foxy the Silver Fox steals crewmates in the Davy Back Fight — a pirate game where the loser loses their people.',
    meet: ['I was up my stilts for ten years, waiting for the tide. When I came down, Foxy had taken half my village\'s young people in his games.', 'He\'ll challenge you to a Davy Back Fight. Don\'t lose your crew to him.'],
    done: ['You beat Foxy at his own game! Shelly and I thank you.', (ctx) => onward(ctx.char, 'Your log has set for')],
  },
  hunter: {
    lure: 'Foxy the Silver Fox is worth twenty-four million, and he loves games',
    summary: 'Foxy the Silver Fox: twenty-four million berries, and a sore loser.',
    meet: ['A hunter? Foxy\'s poster is twenty-four million. He\'ll challenge you to a game — they always do.', 'Win, and take his poster to the court.'],
    done: ['Foxy, beaten! The Silver Fox won\'t steal any more crews.', (ctx) => onward(ctx.char, 'Your next lead points to')],
  },
});

chapter('gl_water7', { part: 2, island: 'water_7' }, {
  pirate: {
    name: 'The City of Water', lure: 'the greatest shipwrights in the world build ships in a city on the water',
    summary: 'Water 7 is the city of shipwrights, home of Galley-La. Something is wrong: someone tried to kill the mayor, Iceburg.',
    contact: { npc: 'p2_paulie', where: 'at Galley-La Dock 1' },
    meet: ['A pirate at Galley-La? We fix pirate ships too. For a price.', 'But not today. Someone broke into the Mayor\'s mansion last night. Iceburg says it\'s nothing. I don\'t believe him.'],
    tasks: [T.quest('p2_cp9_conspiracy', 'Find out who is trying to kill Mayor Iceburg (Paulie, Galley-La Dock 1).', 'p2_paulie')],
    wait: 'Keep your eyes on the masked ones.',
    done: ['CP9. The World Government\'s own assassins, working at Galley-La for five years. I\'ll never trust anyone again. Except you.', (ctx) => onward(ctx.char, 'Your log has set for')],
  },
});

chapter('gl_spa', { part: 2, island: 'spa_island' }, {
  pirate: {
    name: 'The Silver Fox on Holiday', lure: 'a spa island where the guests are being robbed by a vacationing pirate',
    summary: 'Spa Island is a resort of hot springs. Foxy the Silver Fox is on holiday — and robbing the other guests.',
    contact: { npc: 'p2_spa_manager', where: 'at the Spa Island Hot Springs' },
    meet: ['A pirate — please, not another. Foxy the Silver Fox is here "on holiday", and he steals the guests\' belongings.', 'Get rid of him, and you can soak for free for the rest of your life.'],
    tasks: [T.quest('p2_spa_foxy', 'Get rid of Foxy the Silver Fox (Doran, Spa Island Hot Springs).', 'p2_spa_manager', undefined, { alt: beaten('p2_foxy') })],
    wait: 'Foxy is by the big pool.',
    done: ['Peace at last. Soak, please — you\'ve earned it.', (ctx) => onward(ctx.char, 'Your log has set for')],
  },
});

chapter('gl_thriller', { part: 2, island: 'thriller_bark', kind: 'solo' }, {
  all: {
    name: 'The Shadow Thief of Thriller Bark',
    tasks: [T.quest('p2_thriller_bark', 'Survive Thriller Bark, the ghost ship in the Florian Triangle, and free the people whose shadows were stolen.', undefined)],
  },
  pirate: {
    lure: 'a ghost ship the size of an island drifts in the Florian Triangle',
    summary: 'In the Florian Triangle, where ships vanish in the mist, drifts Thriller Bark — a ship the size of an island, and the lair of Gecko Moria, a Warlord who steals shadows.',
  },
  marine: {
    lure: 'ships are vanishing in the Florian Triangle, and a Warlord\'s ghost ship is to blame',
    summary: 'Ships are vanishing in the Florian Triangle. Headquarters suspects Gecko Moria — a Warlord of the Sea — of abusing his privileges.',
  },
});

// ================================================================= WHERE THE ROADS END
chapter('gl_sabaody', { part: 2, island: 'sabaody' }, {
  pirate: {
    name: 'The Sabaody Archipelago', lure: 'every pirate road in Paradise ends at Sabaody, where ships are coated to sail under the Red Line',
    summary: 'Every road in Paradise ends here: the Sabaody Archipelago, a forest of mangroves in the shadow of the Red Line. To reach the New World, ships are coated and sail UNDER it — ten thousand metres down, by way of Fish-Man Island.',
    contact: { npc: 'p2_hatchan', where: 'at Takoyaki Hachi, Grove 41' },
    meet: ['Nyuu~! A pirate crew made it all the way through Paradise! Welcome to Sabaody! Have some takoyaki!', 'You\'ll want your ship coated for Fish-Man Island. But be careful — there are slavers here, and the World Nobles do as they please. Nyuu... a friend of mine is in trouble. Could you help?'],
    tasks: [
      T.quest('p2_sabaody_auction', 'Help Hatchan — a friend of his has been taken to the Human Auctioning House.', 'p2_hatchan'),
      T.check('coated', 'Get your ship coated for the voyage under the Red Line (the Coating Mechanic at Grove 50).', (c) => !!c.flags.p2_shipCoated, { npc: 'p2_coater' }),
    ],
    wait: 'Nyuu~! The coating takes a while. The auction house is in Grove 1.',
    done: ['You did it! Nyuu~! Everyone is safe, and your ship is coated.', 'Fish-Man Island is ten thousand metres down, under the Red Line. After that — the New World. Nyuu... be careful out there.'],
    reward: { bounty: 30000000 },
  },
  marine: {
    name: 'The Sabaody Archipelago', lure: 'the Navy is gathering at Sabaody, next door to Headquarters',
    summary: 'The Sabaody Archipelago, next door to Marine Headquarters, is full of rookie pirates — and slavers, and World Nobles who do as they please.',
    contact: { name: 'Commodore Brannew', title: 'Marine Headquarters Staff', look: LOOK.officer({ hair: 'short', hairColor: '#212121', glasses: true }), faction: 'marine', at: { town: 'sabaody_grove41', plaza: true, ox: 6 }, where: 'in Grove 41', level: 40, style: 'rokushiki' },
    meet: ['So you\'re the officer G-8 keeps writing about. Headquarters has summoned you — but first, Sabaody. A slave auction is being held in Grove 1 today.', 'A World Noble will be there. Our orders are to keep the peace — whatever happens. Go and see what the Fish-Man at the takoyaki stall in Grove 41 is so upset about.'],
    tasks: [T.quest('p2_sabaody_auction', 'Keep the peace at Sabaody — see what Hatchan at the takoyaki stall is upset about.', 'p2_hatchan')],
    wait: 'Keep the peace. Whatever happens.',
    done: ['You kept the peace, and people went home alive. Not every Marine can say that about Sabaody.', (ctx) => `Headquarters is expecting you. ${onward(ctx.char, 'Report to')}`],
  },
});

chapter('gl_marineford', { part: 2, island: 'marineford' }, {
  marine: {
    name: 'The Summit War of Marineford', lure: 'Fleet Admiral Sengoku has summoned you to Marine Headquarters',
    summary: 'Marineford, Marine Headquarters. Fleet Admiral Sengoku has summoned every officer in Paradise. A war is coming — the greatest the sea has seen in twenty years.',
    contact: { npc: 'p2_sengoku', where: 'at Marine Headquarters' },
    meet: ['So you are the one from the Blues. I have read your reports. Good work.', 'Whitebeard\'s allies are coming for the prisoner. Every Marine in Paradise stands in the plaza today. Stand with us — and survive. That is an order.'],
    tasks: [T.quest('p2_summit_war', 'Stand with the Navy in the Summit War of Marineford (Fleet Admiral Sengoku).', 'p2_sengoku')],
    wait: 'To the plaza. Hold the line.',
    done: [
      'You survived. Many did not. The world changed today, and you were there.',
      'Headquarters is moving to the New World. You\'re going with it. Your papers are good for the Bondola — it will carry your ship over the Red Line at the Red Port. Report to Fleet Admiral Sakazuki at New Marineford.',
    ],
    reward: { flag: 'bondolaPass', merit: 400 },
    onDone: (g) => { g.state.char.flags.bondolaPass = true; },
  },
});

chapter('gl_enies', { part: 2, island: 'enies_lobby' }, {
  hunter: {
    name: 'The Judicial Island', lure: 'every hunter\'s road in Paradise ends at Enies Lobby, where the court pays for the greatest bounties',
    summary: 'Enies Lobby, the World Government\'s judicial island, where the greatest criminals are sentenced — and the greatest bounties paid. Today, one of them has broken loose.',
    contact: { name: 'Clerk Pomeroy', title: 'Bounty Court of Enies Lobby', look: { hair: 'short', hairColor: '#eceff1', top: '#212121', bottom: '#212121', glasses: true, coat: '#37474f' }, at: { town: 'enies_main', plaza: true, ox: -5 }, where: 'in the main plaza of Enies Lobby' },
    meet: ['You have come to claim bounties at the court? Your record is... impressive. But you arrive on a bad day.', 'Captain "Lockjaw" Grimm — one hundred and twenty million — broke his chains on the way to the courthouse. He is loose on the island. Bring him down, and the court will pay the full bounty — and grant you a permit that few hunters ever hold.'],
    tasks: [T.defeat('mq_gl_grimm', 'Bring down "Lockjaw" Grimm (฿120,000,000), loose on Enies Lobby.')],
    wait: 'Grimm is still loose. The guards won\'t go near him.',
    done: [
      'One hundred and twenty million berries. The court has not paid a bounty that size to a hunter in years.',
      'And this — a World Government travel permit. It will get your ship onto the Bondola at the Red Port, over the Red Line and into the New World. The greatest posters are there. So are the monsters.',
    ],
    reward: (g) => ({ items: count(g.state.char, 'court_permit') ? [] : [['court_permit', 1]], berries: 60000, flag: 'bondolaPass' }),
  },
});
target({ id: 'mq_gl_grimm', island: 'enies_lobby', name: 'Captain "Lockjaw" Grimm', title: 'Escaped Prisoner', faction: 'pirate', boss: true, hpMul: 1.2, level: 38, bounty: 120000000,
  at: { town: 'enies_main', dock: true, ox: 3 }, look: { hair: 'buzz', hairColor: '#212121', top: '#616161', bottom: '#424242', bulk: 1.5, scarEye: true }, style: 'brawler', skill: 0.45, alert: 'No cell holds Lockjaw Grimm!' });

// ================================================================= the roads
export const GL_ROADS = {
  // (the wider Grand Line's stops are in grandLine2.js; the first three
  // pirate roads there each follow a thread of their own)
  pirate: [
    { id: 'cactus', chain: ['gl_cactus', 'gl_little_garden', 'gl_drum', 'gl_alabasta', 'gl_driftwood', 'gl_delta', 'gl_sabaody'] },
    { id: 'kenzan', chain: ['gl_kenzan', 'gl_little_garden', 'gl_jaya', 'gl_lanternfish', 'gl_water7', 'gl_mecha', 'gl_sabaody'] },
    { id: 'foolshout', chain: ['gl_foolshout', 'gl_drum', 'gl_omatsuri', 'gl_spa', 'gl_thriller', 'gl_hammerhead', 'gl_sabaody'] },
    { id: 'ruluka', chain: ['gl_ruluka', 'gl_jaya', 'gl_long_ring', 'gl_banaro', 'gl_water7', 'gl_whistle', 'gl_sabaody'] },
    { id: 'vira', chain: ['gl_vira', 'gl_drum', 'gl_alabasta', 'gl_asuka', 'gl_thriller', 'gl_sabaody'] },
    { id: 'warship', chain: ['gl_warship', 'gl_clockwork', 'gl_crown', 'gl_omatsuri', 'gl_driftwood', 'gl_delta', 'gl_sabaody'] },
    { id: 'dead_end', chain: ['gl_hannabal', 'gl_kettle', 'gl_mirage', 'gl_asuka', 'gl_whistle', 'gl_hammerhead', 'gl_sabaody'] },
    { id: 'lanterns', chain: ['gl_saltpetre', 'gl_bellwether', 'gl_lanternfish', 'gl_banaro', 'gl_tumbleweed', 'gl_mecha', 'gl_mistletoe', 'gl_sabaody'] },
  ],
  marine: [
    { id: 'g8_south', chain: ['gl_navarone', 'gl_drum', 'gl_alabasta', 'gl_asuka', 'gl_sabaody', 'gl_marineford'] },
    { id: 'g8_north', chain: ['gl_navarone', 'gl_little_garden', 'gl_mecha', 'gl_thriller', 'gl_sabaody', 'gl_marineford'] },
    { id: 'g8_warship', chain: ['gl_navarone', 'gl_warship', 'gl_clockwork', 'gl_crown', 'gl_delta', 'gl_sabaody', 'gl_marineford'] },
    { id: 'g8_lanterns', chain: ['gl_navarone', 'gl_saltpetre', 'gl_bellwether', 'gl_banaro', 'gl_tumbleweed', 'gl_mistletoe', 'gl_sabaody', 'gl_marineford'] },
  ],
  hunter: [
    { id: 'kyuka', chain: ['gl_kyuka', 'gl_jaya', 'gl_long_ring', 'gl_tumbleweed', 'gl_enies'] },
    { id: 'whisky', chain: ['gl_cactus', 'gl_drum', 'gl_alabasta', 'gl_driftwood', 'gl_enies'] },
    { id: 'dead_end', chain: ['gl_hannabal', 'gl_kettle', 'gl_mirage', 'gl_asuka', 'gl_whistle', 'gl_enies'] },
    { id: 'lanterns', chain: ['gl_saltpetre', 'gl_lanternfish', 'gl_banaro', 'gl_tumbleweed', 'gl_mecha', 'gl_enies'] },
  ],
};

/** Part 2: the Log Pose picks one of the roads out of Twin Cape (the same one for the same life). */
PLANS[2] = (c, path) => {
  const roads = GL_ROADS[path] || GL_ROADS.pirate;
  const keep = c.main?.route && roads.find((r) => r.id === c.main.route);
  const road = keep || new RNG(`${c.runSeed}:road:${path}`).pick(roads);
  if (c.main) c.main.route = road.id;
  else c.mainRoute = road.id;
  const done = new Set((c.main?.done || []).map((q) => q.split(':')[1]));
  return ['gl_twin_cape', ...road.chain].filter((id) => CHAPTERS.has(id) && !(done.has(id) && id !== 'gl_twin_cape'));
};
