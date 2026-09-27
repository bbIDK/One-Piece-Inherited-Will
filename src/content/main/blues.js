// Part 1: The Blues. After home, three stops on the way to Reverse Mountain
// get you ready for the Grand Line — a ship that can take it, a crew (or a
// rank, or a reputation) and the last port before the mountain — and then
// the ride itself. Each Blue has its own road; a stop on your home island is
// swapped for a neighbour so you always sail somewhere new.
import './homes.js';
import { chapter, target, T, LOOK, PLANS, PROLOGUES, CHAPTERS, onward, PATHS3 } from './define.js';
import { ISLAND_BY_ID } from '../../data/islands/index.js';
import { regionAt, isGrandLine } from '../../world/constants.js';

/** Somebody's home-island people (the stop reuses them). */
const homeNpc = (island, path) => ({ npc: `mq_home_${island}_${path}` });
const hc = (island, path, where) => ({ npc: `mq_home_${island}_${path}`, where });

// A Grand Line ship for pirates and hunters at the "ship" stops (the Marines get theirs from the Navy).
const shipGift = (name) => (g) => (g.ships.some((s) => s.owner === 'player' && !s.sunk && s.def.grandLine && (s.def.cannons || 0) >= 4) ? {} : { ship: 'caravel', shipName: name });
const navyShip = (g) => (g.ships.some((s) => s.owner === 'player' && !s.sunk && s.def.grandLine) ? {} : { ship: 'sloop', shipName: 'Navy Cutter' });

// the rookie captains racing you to the mountain (every road meets one at the last port)
function rival(id, island, town, name, title, bounty, look, extra = {}) {
  return target({ id, island, name, title, faction: 'pirate', boss: true, hpMul: 0.7, level: 9, bounty, at: { town, dock: true, ox: -2 }, look, style: 'ittoryu', weapon: 'sword', skill: 0.3, breakthrough: 2, ...extra });
}

// ================================================================= EAST BLUE
chapter('eb_syrup', { part: 1, island: 'gecko_islands', role: 'ship' }, {
  pirate: {
    name: 'The Going Merry', lure: 'they say a rich girl up at the mansion has a ship nobody sails',
    summary: 'Merry, the butler of the Kaya estate, built a caravel with a ram\'s head and a big heart. It could be yours — if Syrup Village survives the week.',
    contact: { npc: 'merry', where: 'at the boathouse below Kaya\'s mansion' },
    meet: [
      'A ship? Oh, you\'ve heard about the caravel. I designed her myself — the Going Merry. Miss Kaya meant her for someone brave enough to sail beyond the East Blue.',
      'But I\'m worried. Miss Kaya\'s new butler, Klahador, is... not what he seems. The Usopp boy keeps shouting that pirates are coming. What if, for once, he\'s telling the truth?',
    ],
    tasks: [T.quest('black_cat_plot', 'Find out what the Black Cat Pirates are plotting against Syrup Village — Usopp knows something.', 'usopp')],
    wait: 'Please — talk to the Usopp boy. If there\'s any truth in his stories, Miss Kaya is in danger.',
    done: ['You saved Miss Kaya — and the whole village. She insisted: the Going Merry is yours.', (ctx) => `Treat her well, and she'll carry you anywhere. ${onward(ctx.char, 'Your next stop should be')}`],
    after: 'How is the Going Merry? Keep her caulked, and talk to her on the long nights. Ships listen.',
  },
  marine: {
    name: 'The Captain Who Died Twice', lure: 'the post there suspects a pirate captain the Navy "executed" is alive and well',
    summary: 'Captain Kuro of the Black Cat Pirates was executed three years ago — so says the report. The Syrup Village post has doubts.',
    contact: { ...homeNpc('gecko_islands', 'marine'), where: 'at the Syrup Village Marine post' },
    meet: [
      'You\'re the new recruit? Good — I need someone the locals don\'t know. Three years ago Captain Kuro was "executed" by Captain Morgan of the 153rd. No one ever saw the body.',
      'Now the Kaya estate has a new butler, strangers are camped on the north slope, and a boy is yelling about pirates. Find out what\'s going on. Talk to the boy — Usopp.',
    ],
    tasks: [T.quest('black_cat_plot', 'Find out what the Black Cat Pirates are plotting against Syrup Village — start with Usopp.', 'usopp')],
    wait: 'Kuro of a Hundred Plans didn\'t hide for three years to be caught by accident. Be careful.',
    done: ['Kuro, alive, posing as a butler — for THREE YEARS. The report to headquarters is going to be... interesting. Well done, recruit.', (ctx) => `You've earned more than a pat on the back. ${onward(ctx.char, 'Next, report to')}`],
    after: 'The Kuro report went up the chain. Someone at the 153rd has explaining to do.',
  },
  hunter: {
    name: 'The Sixteen-Million Ghost', lure: 'a sixteen-million-berry pirate is supposed to be dead there... supposed to be',
    summary: 'Kuro of a Hundred Plans was worth sixteen million berries — until he was "executed". Clack the Collector smells money.',
    contact: { ...homeNpc('gecko_islands', 'hunter'), where: 'in the Syrup Village square' },
    meet: [
      'Kuro\'s poster was never cancelled, you know. The Navy says he\'s dead, but the World Government never paid anyone for his head. Sixteen million berries, sitting in a drawer.',
      'And now there\'s a new butler at the Kaya estate who walks like a cat. Talk to the Usopp boy — he\'s been shouting about pirates for weeks.',
    ],
    tasks: [T.quest('black_cat_plot', 'Find out what the Black Cat Pirates are plotting — Usopp knows something.', 'usopp')],
    wait: 'Sixteen million, partner. Sixteen. Million.',
    done: ['HA! Kuro of a Hundred Plans, alive, and now very much in custody. The Marines will be red in the face — and we\'ll be rich.', (ctx) => `Here's your share. ${onward(ctx.char, 'Next stop:')}`],
    after: 'I framed Kuro\'s poster. First one I ever sold twice.',
  },
});

chapter('eb_orange', { part: 1, island: 'organ_islands', role: 'ship' }, {
  pirate: {
    name: 'The Flashy Clown', lure: 'Buggy the Clown has taken the whole town hostage — and left a ship at the pier',
    summary: 'Buggy the Clown has turned Orange Town into his circus. His ship sits at the pier. Hocker thinks you should take both.',
    contact: { ...homeNpc('organ_islands', 'pirate'), where: 'outside the Orange Town inn' },
    meet: ['Buggy\'s crew are camped in the town, and old Mayor Boodle is fit to burst. Go and see him at the clinic.', 'Beat Buggy, and nobody will argue if you sail off in his spare caravel. A pirate ship for a pirate, eh?'],
    tasks: [T.quest('buggy_circus', 'Drive Buggy the Clown\'s circus out of Orange Town (Mayor Boodle).', 'boodle')],
    wait: 'Buggy\'s still in town. Don\'t let the red nose fool you — he can come apart.',
    done: ['Ha! The whole town\'s dancing. And the caravel\'s yours — the Big Top, Buggy called her. Paint over the nose.', (ctx) => onward(ctx.char, 'Now: head for')],
    after: 'The Big Top suits you. Buggy never deserved her.',
    reward: shipGift('Big Top'),
  },
  marine: {
    name: 'The Flashy Clown', lure: 'the Buggy Pirates are holding Orange Town and the post there is outnumbered',
    summary: 'Buggy the Clown holds Orange Town. Lieutenant Mace\'s post is outnumbered ten to one.',
    contact: { ...homeNpc('organ_islands', 'marine'), where: 'at the Orange Town Marine post' },
    meet: ['Buggy the Clown — fifteen million — and his whole crew. I\'ve three men and a broken cannon.', 'Mayor Boodle wants to fight them himself. See him at the clinic before he gets himself killed.'],
    tasks: [T.quest('buggy_circus', 'Break the Buggy Pirates\' hold on Orange Town (Mayor Boodle).', 'boodle')],
    wait: 'Buggy\'s crew are in the town square. Take the officers first — Mohji and Cabaji.',
    done: ['You did it. With one recruit, the Navy took back a town. I\'ll put that in writing.', (ctx) => onward(ctx.char, 'Your orders: report to')],
  },
  hunter: {
    name: 'The Flashy Clown', lure: 'Buggy the Clown is worth fifteen million, and he\'s sitting in Orange Town',
    summary: 'Buggy the Clown: fifteen million. Mohji and Cabaji: a few more. All of them in one town.',
    contact: { ...homeNpc('organ_islands', 'hunter'), where: 'in the Orange Town square' },
    meet: ['Buggy the Clown, fifteen million. Mohji the Beast Tamer and Acrobat Cabaji too. All in one place — it\'s like fishing in a barrel.', 'The mayor at the clinic will want in. Talk to him.'],
    tasks: [T.quest('buggy_circus', 'Bring down the Buggy Pirates in Orange Town (Mayor Boodle).', 'boodle')],
    wait: 'Mind the bits. Buggy comes apart.',
    done: ['Buggy the Clown in chains. My first big sale in years. And his caravel\'s yours, if you want her.', (ctx) => onward(ctx.char, 'Next:')],
    reward: shipGift('Big Top'),
  },
});

chapter('eb_baratie', { part: 1, island: 'baratie', role: 'crew' }, {
  pirate: {
    name: 'The Sea Restaurant', lure: 'there\'s a floating restaurant out there with a cook worth stealing',
    summary: 'The Baratie is a restaurant at sea, run by "Red Leg" Zeff and a kitchen full of fighting cooks. Every crew needs a cook.',
    contact: { npc: 'zeff', where: 'on the deck of the Baratie' },
    meet: ['A pirate looking for a cook, eh? My kitchen isn\'t a recruiting office, brat.', 'But I\'ll tell you what. Don Krieg\'s armada is out there, starving. If he comes here, I\'ll need every hand. Help me, and maybe one of my cooks will want to see the sea.'],
    tasks: [
      T.quest('baratie_krieg', 'Defend the Baratie from Don Krieg\'s armada ("Red Leg" Zeff).', 'zeff'),
      T.crew(1, 'Recruit a crewmate — a cook, a swordsman, anyone who\'d follow you (Patty, Johnny and Yosaku are right here).'),
    ],
    wait: 'Krieg won\'t knock. Keep your eyes on the horizon.',
    done: ['You fought for this restaurant like it was your own. Take care of your crew, brat. Feed them first.', (ctx) => onward(ctx.char, 'If you\'re going to the Grand Line, stop at')],
    after: 'Come back and eat sometime. On the house — once.',
  },
  marine: {
    name: 'The Sea Restaurant', lure: 'Don Krieg\'s armada was sighted near the Baratie',
    summary: 'Don Krieg\'s armada — the biggest fleet in the East Blue — was seen heading for the Baratie. Lieutenant Fullbody is already there, having dinner.',
    contact: { name: 'Lieutenant Fullbody', title: '"Ironfist", 153rd Branch', look: LOOK.officer({ hair: 'short', hairColor: '#5d4037', coat: '#fafafa' }), faction: 'marine', at: { spot: 'baratie_deck', ox: 4 }, where: 'on the deck of the Baratie', level: 14, style: 'brawler' },
    meet: ['A recruit? Good. Stand there and look useful. I am having dinner with a lady.', '...Fine. Don Krieg escaped from the Navy\'s last net, and his men are starving. If they come here, they\'ll take the restaurant. Old Zeff wants help. Go and help him.'],
    tasks: [T.quest('baratie_krieg', 'Defend the Baratie from Don Krieg\'s armada ("Red Leg" Zeff).', 'zeff')],
    wait: 'I would help, but my soup is getting cold.',
    done: ['Don Krieg — defeated! By... a recruit. Hmph. I\'ll mention you in my report. Near the bottom.', (ctx) => onward(ctx.char, 'Next, report to')],
  },
  hunter: {
    name: 'The Sea Restaurant', lure: 'Don Krieg — seventeen million — is starving somewhere near the Baratie',
    summary: 'Johnny and Yosaku are pirate hunters who followed Don Krieg\'s trail to the Baratie. Seventeen million berries is a lot to split two ways. Three ways is fine.',
    contact: { npc: 'johnny', where: 'on the deck of the Baratie' },
    meet: ['Aniki! — no, you\'re not Aniki. But you look like a hunter! Don Krieg — seventeen million — his armada got smashed in the Grand Line and his ship\'s coming this way!', 'Old Zeff\'s going to fight him. We\'re going to help — and split the bounty. You in?'],
    tasks: [T.quest('baratie_krieg', 'Take down Don Krieg when he comes for the Baratie ("Red Leg" Zeff).', 'zeff')],
    wait: 'Krieg\'s coming. I can feel it in my sunglasses.',
    done: ['SEVENTEEN MILLION! Aniki would be proud. Here\'s your share!', (ctx) => onward(ctx.char, 'We heard the next good hunting is at')],
  },
});

chapter('eb_logue', { part: 1, island: 'polestar_islands', role: 'last' }, {
  pirate: {
    name: 'The Town of the Beginning and the End', lure: 'every crew that means it stops at Loguetown before the mountain',
    summary: 'Loguetown: Gol D. Roger was born here, and executed here. Every rookie bound for the Grand Line stops to look at the platform — and the Marines know it.',
    contact: { name: 'Gold-Tooth Sylvie', title: 'Tavern Keeper', look: { hair: 'curly', hairColor: '#ffb300', top: '#6d4c41', bottom: '#3e2723', fem: true }, at: { town: 'loguetown', door: 'bar' }, where: 'outside Gold Roger\'s Last Drink Tavern' },
    meet: ['Another rookie on the way to the mountain. Sit, drink, then go and look at the platform like all the others. Roger laughed up there, you know. Right before the end.', 'But mind: Captain Anchor Dunn is in port too, and he means to be first up Reverse Mountain this season. He sinks rivals. Get a ship that can take the Grand Line and a Log Pose — and don\'t let Dunn sink you.'],
    tasks: [
      T.event('saw_platform', 'Stand before the execution platform in the square, where Gol D. Roger died.'),
      T.defeat('mq_eb_dunn', 'Beat Captain "Anchor" Dunn at the harbour before he sinks you.'),
      T.ship(), T.logPose(),
    ],
    wait: 'Ship, Log Pose, and Dunn out of the way. Then the mountain.',
    done: ['Dunn\'s crew are drinking to your health, now that he\'s in a Marine cell. And look — your first poster is already on the wall.', 'Reverse Mountain is southwest of here. The current runs UP the mountain, rookie. Stay in the middle of the canal, and don\'t look back.'],
    reward: { bounty: 8000000 },
  },
  marine: {
    name: 'The Town of the Beginning and the End', lure: 'the Loguetown base is where the East Blue\'s Marines are sent on to the Grand Line',
    summary: 'Loguetown\'s Marine base watches every crew bound for the Grand Line. Report there for your posting.',
    contact: { name: 'Lieutenant Commander Oswin', title: 'Loguetown Marine Base', look: LOOK.officer({ hair: 'short', hairColor: '#9e9e9e' }), faction: 'marine', at: { town: 'loguetown', building: 'marine_base', guest: true }, where: 'at the Loguetown Marine Base', level: 24, style: 'ittoryu', weapon: 'sword' },
    meet: ['So you\'re the recruit everyone keeps writing about. Headquarters wants you in the Grand Line — G-8, at the foot of Reverse Mountain.', 'Before that: a pirate called Anchor Dunn is in port, and he means to ride the mountain this week. Stop him. And look at the platform in the square — every Marine should know what we are guarding against.'],
    tasks: [
      T.event('saw_platform', 'Stand before the execution platform in the square, where Gol D. Roger died.'),
      T.defeat('mq_eb_dunn', 'Arrest Captain "Anchor" Dunn at the harbour before he sails for the Grand Line.'),
    ],
    wait: 'Dunn is at the harbour. Every hour he is free, he gets a head start.',
    done: ['Dunn is in a cell. Good work — the kind of work that gets noticed.', 'The Navy is lending you a cutter for the crossing. Ride the current over Reverse Mountain and report to G-8 at Navarone. Good luck, Marine.'],
    reward: navyShip,
  },
  hunter: {
    name: 'The Town of the Beginning and the End', lure: 'the Loguetown bounty office pays the best in the East Blue',
    summary: 'Loguetown\'s bounty office pays out for the rookies who try their luck at the Grand Line. There\'s one in port right now.',
    contact: { name: 'Marta the Clerk', title: 'Loguetown Bounty Office', look: { hair: 'ponytail', hairColor: '#5d4037', top: '#eceff1', bottom: '#37474f', fem: true, glasses: true }, at: { town: 'loguetown', door: 'bounty' }, where: 'outside the Loguetown Bounty Office' },
    meet: ['Bounty hunter? Then you\'re in luck. Captain "Anchor" Dunn, six million, is in port and plans to ride Reverse Mountain this week. Catch him before he does.', 'And if you mean to follow the money into the Grand Line, you\'ll need a ship that can take it, and a Log Pose. The platform in the square is worth a look too — it\'s why every pirate comes here.'],
    tasks: [
      T.event('saw_platform', 'Stand before the execution platform in the square, where Gol D. Roger died.'),
      T.defeat('mq_eb_dunn', 'Bring in Captain "Anchor" Dunn (฿6,000,000) at the harbour.'),
      T.ship(), T.logPose(),
    ],
    wait: 'Dunn\'s at the harbour. Don\'t let him reach the mountain.',
    done: ['Six million — the office thanks you. You\'ve outgrown the East Blue.', 'Reverse Mountain is southwest of here. The real money is on the other side of it.'],
  },
});
rival('mq_eb_dunn', 'polestar_islands', 'loguetown', 'Captain "Anchor" Dunn', 'Captain of the Anchor Pirates', 6000000, { hair: 'short', hairColor: '#212121', top: '#263238', bottom: '#37474f', hat: 'tricorne', hatColor: '#212121', beard: true, bulk: 1.2 }, { alert: 'Only one crew rides the mountain this week. Mine.' });

// ================================================================= NORTH BLUE
chapter('nb_lvneel', { part: 1, island: 'lvneel', role: 'ship' }, {
  all: {
    name: 'Noland the Liar', tasks: [T.quest('nb_liar_noland', 'Find out the truth about Noland the Liar (Archivist Pell, Royal Archive).', 'nb_pell')],
  },
  pirate: {
    lure: 'the Royal Dockyard there has a caravel no one will buy, because of a liar\'s curse',
    summary: 'Four hundred years ago Noland the explorer came home to Lvneel with tales of a city of gold, and was hanged as a liar. The dockyard\'s "cursed" caravel is for sale cheap.',
    contact: hc('lvneel', 'pirate', 'outside the Lvneel tavern'),
    meet: ['Every child in Lvneel grows up on Noland the Liar. The Royal Dockyard still has a caravel no one will sail — they say his curse is on her.', 'Find out the truth about Noland, and I\'ll talk the dockyard into letting you have her for nothing. The Archivist, Pell, keeps his log.'],
    wait: 'Pell\'s in the Royal Archive. The truth\'s in there somewhere.',
    done: ['A Sea King, guarding the stand where the Liar was hanged... and a log that swears the city of gold was real. Well! The dockyard says the "cursed" caravel is yours.', (ctx) => onward(ctx.char, 'Next, sail for')],
    reward: shipGift('Noland\'s Promise'),
  },
  marine: {
    lure: 'the King of Lvneel has asked the Navy about a Sea King troubling the coast',
    summary: 'The King of Lvneel has asked the Navy for help. The Sea King that has been sinking fishing boats seems to be connected to an old legend.',
    contact: hc('lvneel', 'marine', 'at the Lvneel Marine post'),
    meet: ['A Sea King has been sinking fishing boats off the Liar\'s Stand. The fishermen say it\'s Noland\'s curse. The King wants the Navy to deal with it.', 'Start at the Royal Archive. Archivist Pell knows more about Noland than anyone alive.'],
    wait: 'Pell first. Then the stand. Then the Sea King.',
    done: ['A Sea King nesting under the stand — and a log that says Noland wasn\'t lying. The King owes you. So does the Navy.', (ctx) => onward(ctx.char, 'Next, report to')],
  },
  hunter: {
    lure: 'the fishermen of Lvneel have a reward out on a Sea King',
    summary: 'The fishermen\'s guild of Lvneel has put a reward on the Sea King sinking their boats. Brekk keeps the book.',
    contact: hc('lvneel', 'hunter', 'outside the Lvneel inn'),
    meet: ['Not every poster has a face on it. The fishermen\'s guild pays for the Sea King off the Liar\'s Stand. Big money, and nobody to split it with.', 'They say it\'s tied up with the Noland story. Start with Pell in the Royal Archive.'],
    wait: 'A Sea King is a big target. Big targets pay big.',
    done: ['The guild paid in full — and threw in a caravel from the Royal Dockyard. Seems a monster-slayer deserves a proper ship.', (ctx) => onward(ctx.char, 'Next:')],
    reward: shipGift('Liar\'s Luck'),
  },
});

chapter('nb_rakesh', { part: 1, island: 'rakesh', role: 'ship' }, {
  all: { name: 'The Pillage of Rakesh', tasks: [T.quest('nb_rakesh_raid', 'Defend Rakesh from the Donquixote raiders (Harbourmaster Brandt).', 'nb_brandt')] },
  pirate: {
    lure: 'the Rakesh Drydock owes favours to anyone who saves the town',
    summary: 'The Donquixote Family is coming to pillage Rakesh again. Save the town and the Drydock will build you a ship.',
    contact: hc('rakesh', 'pirate', 'outside the Rakesh port bar'),
    meet: ['Donquixote ships were sighted off the point. They\'re coming to pillage Rakesh again — a third time.', 'Help the Harbourmaster hold the town, and I\'ll make sure the Drydock gives you the caravel on her slip. Pirate to pirate.'],
    wait: 'The bell\'s about to ring. Go!',
    done: ['Rakesh stands! The Drydock\'s caravel is yours — Brandt signed her over himself.', (ctx) => onward(ctx.char, 'Now sail for')],
    reward: shipGift('Rakesh Rose'),
  },
  marine: {
    lure: 'the Donquixote Family is about to pillage Rakesh again',
    summary: 'Rakesh has been pillaged twice by the Donquixote Family. It won\'t be three times, if the Navy has anything to say about it.',
    contact: hc('rakesh', 'marine', 'at the Rakesh Marine post'),
    meet: ['The Donquixote Family again. Señor Pink and Gladius — Doflamingo\'s own officers.', 'Help Harbourmaster Brandt hold the town. The Navy stands with Rakesh this time.'],
    wait: 'Hold the harbour. They\'ll come for the warehouses first.',
    done: ['Two of Doflamingo\'s officers, beaten by a recruit. The North Blue branch will want to meet you.', (ctx) => onward(ctx.char, 'Report to')],
  },
  hunter: {
    lure: 'two Donquixote officers with fat posters are about to raid Rakesh',
    summary: 'Señor Pink and Gladius of the Donquixote Family — posters with real money on them, coming right to you.',
    contact: hc('rakesh', 'hunter', 'outside the Rakesh inn'),
    meet: ['Señor Pink. Gladius. Doflamingo\'s own. They\'re coming to Rakesh, and the merchant houses have doubled their rewards.', 'Help the Harbourmaster. Get paid twice.'],
    wait: 'Double pay, partner. Double.',
    done: ['Paid twice, as promised. And the Drydock threw in a caravel for the town\'s hero.', (ctx) => onward(ctx.char, 'Next:')],
    reward: shipGift('Double Pay'),
  },
});

chapter('nb_swallow', { part: 1, island: 'swallow_island', role: 'crew' }, {
  all: { name: 'The Flying Undersea Swallow', tasks: [T.quest('nb_bacca', 'Help Rudd stop the Bacca Pirates terrorising Swallow Island (police station).', 'nb_rudd')] },
  pirate: {
    lure: 'a pirate crew terrorising Swallow Island has a captain worth humbling — and the island has people worth recruiting',
    summary: 'The Bacca Pirates are squeezing Swallow Island. Beat them, and maybe someone there will want to sail with you.',
    contact: hc('swallow_island', 'pirate', 'outside the Swallow Town bar'),
    meet: ['The Bacca Pirates think this island is theirs. The police can\'t stop them. Rudd at the station is at his wits\' end.', 'A crew is made of people who\'ve seen you fight for something. Go and fight for Swallow Island — then find someone to sail with.'],
    tasks: [T.quest('nb_bacca', 'Help Rudd stop the Bacca Pirates terrorising Swallow Island (police station).', 'nb_rudd'), T.crew(1, 'Recruit a crewmate — someone who\'s seen what you can do.')],
    wait: 'Bacca first. Then a crew.',
    done: ['Now you look like a captain. A crew behind you — that\'s the thing the Grand Line can\'t take away.', (ctx) => onward(ctx.char, 'Last stop before the mountain:')],
  },
  marine: {
    lure: 'the Swallow Island post is overrun by the Bacca Pirates',
    summary: 'Lieutenant Halvard\'s post can\'t handle the Bacca Pirates alone.',
    contact: hc('swallow_island', 'marine', 'at the Swallow Island Marine post'),
    meet: ['The Bacca Pirates have the island by the throat. The police chief, Rudd, is a good man — help him.', 'Bacca is twenty-six million. Take him, and you\'ll never pay for a drink in this town again.'],
    wait: 'Rudd is at the police station.',
    done: ['Bacca in irons. The whole North Blue branch is talking about you.', (ctx) => onward(ctx.char, 'Report to')],
  },
  hunter: {
    lure: 'Bacca of the Bacca Pirates is worth twenty-six million',
    summary: 'Bacca: twenty-six million berries. Koni, his first mate: a tidy sum on top.',
    contact: hc('swallow_island', 'hunter', 'outside the Swallow Town inn'),
    meet: ['Twenty-six million for Bacca. That\'s a real poster. Rudd at the police station will help you find him.', 'I\'ll take my usual cut. You\'ll take the rest — and a name for yourself.'],
    wait: 'Tracks lead to the old temple. Bacca\'s men go that way.',
    done: ['Twenty-six million. You\'ve outgrown this island, hunter.', (ctx) => onward(ctx.char, 'Next:')],
  },
});

chapter('nb_notice', { part: 1, island: 'notice', role: 'crew' }, {
  all: { name: 'The Notice Cup', tasks: [T.quest('nb_notice_cup', 'Win the Notice Cup at the Longarm Boxing Club (Ulrich).', 'nb_ulrich')] },
  pirate: {
    lure: 'the Notice Cup is the best place in the North Blue to find a fighter for your crew',
    summary: 'The Notice Cup is where the North Blue\'s toughest fists meet. The winner gets a purse; you might get a crewmate.',
    contact: hc('notice', 'pirate', 'outside the Notice bar'),
    meet: ['The Cup\'s on. Otto, the champion, has never been beaten — and he\'s been dreaming of the sea since he was a boy.', 'Beat him, and ask him to sail with you. That\'s how the good crews start.'],
    tasks: [T.quest('nb_notice_cup', 'Win the Notice Cup at the Longarm Boxing Club (Ulrich).', 'nb_ulrich'), T.crew(1, 'Recruit a crewmate — Otto the champion dreams of the sea.')],
    wait: 'The Longarm Boxing Club. Ulrich runs the Cup.',
    done: ['You beat Otto AND took him to sea. Notice will be talking about that for years.', (ctx) => onward(ctx.char, 'Last stop before the mountain:')],
  },
  marine: {
    lure: 'the Notice Cup draws fighters the Navy would like to recruit',
    summary: 'The Navy scouts the Notice Cup for fighters. Lieutenant Garm wants to see what you can do.',
    contact: hc('notice', 'marine', 'at the Notice Marine post'),
    meet: ['The Cup is the best fighting in the North Blue. Enter it. Show the town what a Marine can do.', 'Win, and the recruiters in Deul will know your name.'],
    wait: 'Ulrich at the Longarm Boxing Club takes the entries.',
    done: ['Champion of Notice — and a Marine. I\'ll write to Deul tonight.', (ctx) => onward(ctx.char, 'Report to')],
  },
  hunter: {
    lure: 'the Notice Cup purse is the fattest honest money in the North Blue',
    summary: 'The Notice Cup purse is big, honest money — and every bounty broker in the North Blue watches the winner.',
    contact: hc('notice', 'hunter', 'outside the Notice bank'),
    meet: ['The Cup purse, and the brokers\' attention. Both worth having.', 'Win, and I\'ll have better posters for you.'],
    wait: 'Go and win.',
    done: ['Champion! The brokers in Deul are already asking about you.', (ctx) => onward(ctx.char, 'Next:')],
  },
});

chapter('nb_deul', { part: 1, island: 'deul', role: 'last' }, {
  pirate: {
    name: 'The Last Port of the North', lure: 'Deul is the last big port before the mountain — and a rival crew is racing you there',
    summary: 'Deul, capital of the North, is the last port before Reverse Mountain. Captain Olav "Frost-Beard" means to ride the mountain first — and he sinks anyone who tries to beat him.',
    contact: { name: 'Skarn the Fence', title: 'Harbour Fence', look: { hair: 'long', hairColor: '#9e9e9e', top: '#263238', bottom: '#212121', hat: 'beanie', hatColor: '#37474f', scarEye: true }, at: { town: 'deul_capital', door: 'inn' }, where: 'outside the Eagle Barracks Inn' },
    meet: ['A rookie crew bound for the mountain? Then you\'ve got a problem. Olav Frost-Beard is in the harbour, and he sinks anyone who might beat him up the canal.', 'Deal with Olav. And don\'t even think about the Grand Line without a real ship and a Log Pose.'],
    tasks: [T.defeat('mq_nb_olav', 'Beat Captain Olav "Frost-Beard" at the Deul harbour.'), T.ship(), T.logPose()],
    wait: 'Olav\'s still in port. Ship, Log Pose, Olav.',
    done: ['Frost-Beard, beaten. The Marines will have your face on a poster by morning — congratulations.', 'Reverse Mountain is southeast of here, where the Red Line meets the Grand Line. Stay in the middle of the canal, and don\'t fight the current.'],
    reward: { bounty: 9000000 },
  },
  marine: {
    name: 'The Last Port of the North', lure: 'the North Blue branch in Deul posts its best recruits to the Grand Line',
    summary: 'Lieutenant Hask of the North Blue branch has orders for you — and a pirate to stop first.',
    contact: { npc: 'nb_hask', where: 'at the North Blue Marine Branch, Deul' },
    meet: ['So you\'re the one. Headquarters wants you in the Grand Line — G-8, at Navarone.', 'But first: Olav Frost-Beard is in our harbour, planning to ride the mountain. Arrest him. Then take the cutter we\'re lending you, and go.'],
    tasks: [T.defeat('mq_nb_olav', 'Arrest Captain Olav "Frost-Beard" at the Deul harbour.')],
    wait: 'Olav is at the harbour.',
    done: ['Olav in irons. You\'re ready. The cutter is at the pier.', 'Ride the current over Reverse Mountain and report to G-8. Justice goes with you.'],
    reward: navyShip,
  },
  hunter: {
    name: 'The Last Port of the North', lure: 'the Deul bounty office has a fat poster on a crew in port',
    summary: 'Captain Olav "Frost-Beard": seven million, in port, planning to ride Reverse Mountain.',
    contact: { name: 'Registrar Voll', title: 'Deul Bounty Office', look: { hair: 'short', hairColor: '#eceff1', top: '#37474f', bottom: '#263238', glasses: true }, at: { town: 'deul_capital', door: 'bounty' }, where: 'outside the Deul Bounty Office' },
    meet: ['Olav Frost-Beard. Seven million, and he\'s in our harbour. Catch him before he reaches the mountain.', 'Beyond the mountain the posters get bigger. So do the pirates. Get a ship that can take the Grand Line, and a Log Pose.'],
    tasks: [T.defeat('mq_nb_olav', 'Bring in Captain Olav "Frost-Beard" (฿7,000,000) at the Deul harbour.'), T.ship(), T.logPose()],
    wait: 'Olav\'s at the harbour.',
    done: ['Seven million. The North Blue is too small for you now.', 'Reverse Mountain is southeast of here. The Grand Line pays better — and bites harder.'],
  },
});
rival('mq_nb_olav', 'deul', 'deul_capital', 'Captain Olav "Frost-Beard"', 'Captain of the Frost Pirates', 7000000, { hair: 'long', hairColor: '#e0f7fa', top: '#37474f', bottom: '#263238', hat: 'beanie', hatColor: '#0d47a1', bulk: 1.3 }, { style: 'brawler', weapon: undefined, alert: 'The mountain is MINE this year!' });

// ================================================================= WEST BLUE
chapter('wb_kano', { part: 1, island: 'kano_country', role: 'ship' }, {
  all: { name: 'The Hasshoken Trials', tasks: [T.quest('wb_hasshoken_trials', 'Pass the Hasshoken trials (Don Chinjao, at the Family Hall).', 'wb_chinjao')] },
  pirate: {
    lure: 'Don Chinjao tests anyone who wants to learn how a real fighter hits — and the Happo harbour has ships',
    summary: 'Don Chinjao was a pirate worth a hundred million before Garp flattened his head. Pass his trials, and the Happo Navy\'s drydock will have a ship for you.',
    contact: hc('kano_country', 'pirate', 'outside the Kano noodle house'),
    meet: ['Chinjao\'s trials — the Hasshoken. Pass them, and the Happo drydock will build for you. The Chinjao Family respects strength.', 'Go to the Family Hall. Don\'t mention Garp.'],
    wait: 'The Family Hall. And don\'t mention Garp.',
    done: ['Chinjao nodded at you? He hasn\'t nodded at anyone since Garp. The Happo drydock sent a caravel round.', (ctx) => onward(ctx.char, 'Next, sail for')],
    reward: shipGift('Eight Impacts'),
  },
  marine: {
    lure: 'the Chinjao Family is testing fighters in Kano, and the Navy wants to know who passes',
    summary: 'The Chinjao Family\'s trials draw the West Blue\'s strongest. The Navy wants a Marine to pass them.',
    contact: hc('kano_country', 'marine', 'at the Kano Marine post'),
    meet: ['The Chinjao Family were pirates once. Now they keep order in Kano — their way. Pass their trials, and they\'ll respect the Navy.', 'Don Chinjao is at the Family Hall.'],
    wait: 'The Family Hall.',
    done: ['A Marine passed the Hasshoken trials. Kano will take the Navy seriously now.', (ctx) => onward(ctx.char, 'Report to')],
  },
  hunter: {
    lure: 'the Chinjao Family trains fighters in Kano — the best hunters in the West Blue passed through there',
    summary: 'A bounty hunter who can take a Hasshoken blow can take anything. Two-Coin Fen thinks you should learn.',
    contact: hc('kano_country', 'hunter', 'outside the Kano inn'),
    meet: ['Every hunter who made it big in the West Blue trained in Kano. Pass Chinjao\'s trials.', 'Then the Happo drydock will want to be your friend.'],
    wait: 'Chinjao. The Family Hall.',
    done: ['A Hasshoken graduate! The drydock sent a caravel — hunters who pass the trials get friends in Kano.', (ctx) => onward(ctx.char, 'Next:')],
    reward: shipGift('Two Coins'),
  },
});

chapter('wb_ilisia', { part: 1, island: 'ilisia', role: 'ship' }, {
  all: { name: 'The King Who Saw Dragons Coming', tasks: [T.quest('wb_ilisia_dragon', 'Find out what is troubling the Kingdom of Ilisia (King Lucas at the palace).', 'wb_lucas')] },
  pirate: {
    lure: 'the King of Ilisia is desperate enough to pay pirates, and the harbour has a shipyard',
    summary: 'The King of Ilisia swears dragons are coming. The court whispers of revolution. Somewhere in between is a ship for whoever helps.',
    contact: hc('ilisia', 'pirate', 'outside the Ilisia inn'),
    meet: ['King Lucas is frightened, and frightened kings pay anyone. Even pirates.', 'See him at the palace. Pick a side, if it comes to that — just pick the one that\'s right.'],
    wait: 'The palace. Listen more than you talk.',
    done: ['Whatever side you chose, Ilisia is quiet again. The harbour shipyard has a caravel with your name on the bill — paid.', (ctx) => onward(ctx.char, 'Next, sail for')],
    reward: shipGift('Dragon\'s Eye'),
  },
  marine: {
    lure: 'the Kingdom of Ilisia has asked the Navy for help',
    summary: 'The Kingdom of Ilisia is close to a revolution. The Navy has been asked to keep the peace.',
    contact: hc('ilisia', 'marine', 'at the Ilisia Marine post'),
    meet: ['The King asked for help, and the Navy answered: with you. See him at the palace.', 'Keep the peace. Whatever it takes.'],
    wait: 'The palace.',
    done: ['Ilisia is quiet again. You kept the peace — the Navy\'s job, done well.', (ctx) => onward(ctx.char, 'Report to')],
  },
  hunter: {
    lure: 'the Ilisia court pays well for quiet removals of trouble',
    summary: 'Lady Ansel says the court will pay well to have Ilisia\'s troubles quietly removed.',
    contact: hc('ilisia', 'hunter', 'in the palace square'),
    meet: ['The King is paying for his troubles to go away. See him at the palace.', 'Remove them. Discreetly.'],
    wait: 'Discreetly, darling.',
    done: ['Discreet AND effective. The court sent a caravel, with its thanks.', (ctx) => onward(ctx.char, 'Next:')],
    reward: shipGift('Discretion'),
  },
});

chapter('wb_toroa', { part: 1, island: 'toroa', role: 'crew' }, {
  all: { name: 'A Long Line of Musicians', tasks: [T.quest('wb_toroa_slavers', 'Stop the slavers preying on Toroa\'s musicians (Byron, at the Music Hall).', 'wb_byron')] },
  pirate: {
    lure: 'slavers are snatching Toroa\'s musicians — and a crew needs a musician',
    summary: 'Slavers are snatching Toroa\'s musicians. Byron the fiddler is next on their list — and every crew needs a musician.',
    contact: hc('toroa', 'pirate', 'outside the Toroa bar'),
    meet: ['Slavers. They\'re taking musicians off the street and shipping them to Sabaody. Byron at the Music Hall is trying to stop them alone.', 'Stop them. And a crew without a song is just a boat full of people. Find yourself a crewmate.'],
    tasks: [T.quest('wb_toroa_slavers', 'Stop the slavers preying on Toroa\'s musicians (Byron, at the Music Hall).', 'wb_byron'), T.crew(1, 'Recruit a crewmate — Byron has always wanted to play for a pirate crew.')],
    wait: 'The slavers first. The Music Hall.',
    done: ['A crew, and a song for it. Now you\'re a pirate crew.', (ctx) => onward(ctx.char, 'Last stop before the mountain:')],
  },
  marine: {
    lure: 'slavers are operating out of Toroa',
    summary: 'Slavers are taking people off the streets of Toroa. Lieutenant Corra wants them stopped.',
    contact: hc('toroa', 'marine', 'at the Toroa Marine post'),
    meet: ['Slavers. On the Navy\'s watch. Byron at the Music Hall has been tracking them.', 'Help him. Justice isn\'t only for those with a price on their heads.'],
    wait: 'The Music Hall.',
    done: ['The slavers are finished. The musicians are home. That\'s Justice.', (ctx) => onward(ctx.char, 'Report to')],
  },
  hunter: {
    lure: 'the slavers in Toroa have prices on their heads — and the town has pooled a reward',
    summary: 'The families of Toroa pooled their savings for the slavers\' capture.',
    contact: hc('toroa', 'hunter', 'outside the Toroa inn'),
    meet: ['Slavers. The worst kind. The whole town chipped in.', 'Byron at the Music Hall knows where they are.'],
    wait: 'Byron. The Music Hall.',
    done: ['The families wept. They paid, too. Good work.', (ctx) => onward(ctx.char, 'Next:')],
  },
});

chapter('wb_esperia', { part: 1, island: 'esperia', role: 'crew' }, {
  all: { name: 'The Humming Swordsman', tasks: [T.quest('wb_esperia_convoy', 'Deal with the bandits robbing the instrument convoy (Old Ottavio, Instrument Makers\' Guild).', 'wb_ottavio')] },
  pirate: {
    lure: 'Esperia\'s instrument makers need a protector — and pay in favours',
    summary: 'Bandits are robbing Esperia\'s instrument convoys. Help Old Ottavio, then find a crewmate who can keep up with you.',
    contact: hc('esperia', 'pirate', 'outside the Esperia bar'),
    meet: ['The instrument makers are losing their convoys to bandits. Old Ottavio at the Guild wants them stopped.', 'Help him. Then find a crewmate — the Grand Line is no place to sail alone.'],
    tasks: [T.quest('wb_esperia_convoy', 'Deal with the bandits robbing the instrument convoy (Old Ottavio).', 'wb_ottavio'), T.crew(1, 'Recruit a crewmate — the Grand Line is no place to sail alone.')],
    wait: 'Ottavio first.',
    done: ['A crew, and a town that sings your name. Good.', (ctx) => onward(ctx.char, 'Last stop before the mountain:')],
  },
  marine: {
    lure: 'bandits are robbing the Esperia convoys',
    summary: 'Esperia\'s convoys are being robbed. The Navy protects trade.',
    contact: hc('esperia', 'marine', 'at the Esperia Marine post'),
    meet: ['The convoys. Robbed again. See Old Ottavio at the Guild.', 'The Navy protects trade. Go.'],
    wait: 'Ottavio. The Guild.',
    done: ['The convoys are safe. Well done.', (ctx) => onward(ctx.char, 'Report to')],
  },
  hunter: {
    lure: 'the bandits robbing the Esperia convoys have a price on their leader',
    summary: 'The convoy bandits\' leader has a poster. Rosso the agent wants him.',
    contact: hc('esperia', 'hunter', 'outside the Esperia inn'),
    meet: ['The convoy bandits. Their leader has a poster. See Ottavio at the Guild.', 'Timing, darling.'],
    wait: 'Ottavio. The Guild.',
    done: ['Perfect timing. Here\'s your fee.', (ctx) => onward(ctx.char, 'Next:')],
  },
});

chapter('wb_lascamp', { part: 1, island: 'las_camp', role: 'last' }, {
  pirate: {
    name: 'A Job for the Gang', lure: 'Capone "Gang" Bege is recruiting in Las Camp, and a job for him is a ticket to the Grand Line',
    summary: 'Capone "Gang" Bege runs Las Camp from a fortress of a restaurant. He\'s about to take his Fire Tank Pirates into the Grand Line — and he\'s hiring.',
    contact: hc('las_camp', 'pirate', 'outside the Las Camp inn'),
    meet: ['Bege is heading for the Grand Line, and he wants a job done before he goes. Do it, and every gang in the West Blue will know your name.', 'Get a ship that can take the Grand Line, and a Log Pose. Then see Bege at the Ristorante Castello.'],
    tasks: [T.quest('wb_bege_job', 'Do a job for Capone "Gang" Bege (Ristorante Castello).', 'wb_bege'), T.ship(), T.logPose()],
    wait: 'Bege, a ship, a Log Pose.',
    done: ['Bege says you\'re "family". Coming from him, that\'s a compliment — and a poster.', 'Reverse Mountain is northeast of here. Ride the current up — and don\'t look back.'],
  },
  marine: {
    name: 'The Fire Tank Family', lure: 'the Las Camp police want the Fire Tank Family brought down before it reaches the Grand Line',
    summary: 'Commissioner Gordo has been trying to bring down Capone Bege\'s Fire Tank Family for years. The Navy is finally helping.',
    contact: hc('las_camp', 'marine', 'at the Las Camp Marine post'),
    meet: ['Bege is about to take the Fire Tank Family into the Grand Line. Commissioner Gordo wants him first.', 'Help Gordo. Then take the cutter we\'re lending you and report to G-8, at the foot of Reverse Mountain.'],
    tasks: [T.quest('wb_fire_tank_bust', 'Help Commissioner Gordo bring down the Fire Tank Family (Police Headquarters).', 'wb_gordo')],
    wait: 'Gordo, at Police Headquarters.',
    done: ['The Fire Tank Family, broken. Headquarters wants you in the Grand Line.', 'The cutter is at the pier. Reverse Mountain is northeast. Report to G-8.'],
    reward: navyShip,
  },
  hunter: {
    name: 'The Fire Tank Family', lure: 'the Fire Tank Family\'s posters are the richest in the West Blue',
    summary: 'Vito, Gotti and Capone Bege himself — the Fire Tank Family\'s posters are the richest in the West Blue.',
    contact: hc('las_camp', 'hunter', 'outside the bounty office'),
    meet: ['The boss finally approved it. The Fire Tank Family: every one of them. See Commissioner Gordo at Police Headquarters.', 'And get a ship that can take the Grand Line, and a Log Pose. After this, you won\'t be welcome in Las Camp.'],
    tasks: [T.quest('wb_fire_tank_bust', 'Help Commissioner Gordo bring down the Fire Tank Family (Police Headquarters).', 'wb_gordo'), T.ship(), T.logPose()],
    wait: 'Gordo, a ship, a Log Pose.',
    done: ['The whole Fire Tank Family. The office has never paid out this much.', 'Reverse Mountain is northeast of here. The Grand Line pays better.'],
  },
});

chapter('wb_soja', { part: 1, island: 'soja_island', role: 'last' }, {
  all: { name: 'The Velvet Sable', tasks: [T.defeat('mq_wb_sable', 'Beat Captain "Velvet" Sable at the Soja pier.'), T.ship(), T.logPose()] },
  pirate: {
    lure: 'Soja is the last quiet port before the mountain — though a rival crew is there already',
    summary: 'Captain Velvet Sable is in Soja, and she sinks anyone who might beat her up the mountain.',
    contact: hc('soja_island', 'pirate', 'outside the Soja bar'),
    meet: ['Velvet Sable\'s in port. She\'s sunk three rookie crews this season.', 'Beat her. Get a ship that can take it, and a Log Pose.'],
    wait: 'Sable, a ship, a Log Pose.',
    done: ['Sable\'s beaten, and you\'ve a poster. Welcome to piracy.', 'Reverse Mountain is northeast. Don\'t look back.'],
    reward: { bounty: 9000000 },
  },
  marine: {
    lure: 'a pirate captain who sinks rookie crews is in port at Soja',
    summary: 'Captain Velvet Sable sinks rookie crews on their way to the mountain. Arrest her.',
    contact: hc('soja_island', 'marine', 'at the Soja Marine post'),
    tasks: [T.defeat('mq_wb_sable', 'Arrest Captain "Velvet" Sable at the Soja pier.')],
    meet: ['Velvet Sable. In port. Arrest her.', 'Then take the cutter and report to G-8, beyond the mountain.'],
    wait: 'Sable is at the pier.',
    done: ['Sable in irons. The cutter is yours. Report to G-8.', 'Reverse Mountain is northeast.'],
    reward: navyShip,
  },
  hunter: {
    lure: 'Captain Velvet Sable is worth seven million and sitting in Soja',
    summary: 'Captain Velvet Sable: seven million berries.',
    contact: hc('soja_island', 'hunter', 'outside the Soja bank'),
    meet: ['Sable. Seven million. At the pier.', 'Then a ship, and a Log Pose. The Grand Line waits.'],
    wait: 'Sable, a ship, a Log Pose.',
    done: ['Seven million. The Grand Line is next.', 'Reverse Mountain is northeast.'],
  },
});
rival('mq_wb_sable', 'soja_island', 'soja_village', 'Captain "Velvet" Sable', 'Captain of the Velvet Pirates', 7000000, { hair: 'long', hairColor: '#212121', top: '#4a148c', bottom: '#212121', hat: 'tricorne', hatColor: '#4a148c', fem: true }, { alert: 'Another rookie for the bottom of the sea.' });

// ================================================================= SOUTH BLUE
chapter('sb_karate', { part: 1, island: 'karate_island', role: 'crew' }, {
  all: { name: 'The Karate Island Open', tasks: [T.quest('sb_karate_open', 'Win the Karate Island Open (Grandmaster Ippon\'s dojo; the entry fee is ฿500).', 'sb_ippon', undefined, { manual: true })] },
  pirate: {
    lure: 'the Karate Island Open is where the South Blue\'s fighters show off — good crew material',
    summary: 'The Karate Island Open is on. Win it — and maybe someone you beat will want to sail with you.',
    contact: hc('karate_island', 'pirate', 'outside the Karate Island restaurant'),
    meet: ['The Open. Every dojo on the island sends its best. Win it, and you\'ll have your pick of fighters for a crew.', 'Grandmaster Ippon takes the entries. Five hundred berries.'],
    tasks: [T.quest('sb_karate_open', 'Win the Karate Island Open (Grandmaster Ippon; entry ฿500).', 'sb_ippon', undefined, { manual: true }), T.crew(1, 'Recruit a crewmate — Yaguara fights like a storm and wants to see the sea.')],
    wait: 'The Open first. Then a crew.',
    done: ['Champion AND captain. The dojos will be talking about you for a generation.', (ctx) => onward(ctx.char, 'Next, sail for')],
  },
  marine: {
    lure: 'the Navy scouts the Karate Island Open for recruits — and wants a Marine to win it',
    summary: 'The Navy wants a Marine to win the Open. Lieutenant Kenta is watching.',
    contact: hc('karate_island', 'marine', 'at the Karate Island Marine post'),
    meet: ['A Marine hasn\'t won the Open in twelve years. Change that.', 'Grandmaster Ippon takes entries. Five hundred berries.'],
    wait: 'The Open. Go.',
    done: ['A Marine champion! The recruiters will line up now.', (ctx) => onward(ctx.char, 'Report to')],
  },
  hunter: {
    lure: 'the Karate Island Open purse is the fattest in the South Blue',
    summary: 'The Open\'s purse, and the attention of every broker in the South Blue.',
    contact: hc('karate_island', 'hunter', 'outside the Karate Island inn'),
    meet: ['The purse is big. The attention is bigger. Win it.', 'Grandmaster Ippon takes the entries.'],
    wait: 'Win it.',
    done: ['Champion! Mama Pim is proud.', (ctx) => onward(ctx.char, 'Next:')],
  },
});

chapter('sb_tumi', { part: 1, island: 'tumi', role: 'crew' }, {
  all: {
    name: 'The Tower of Tumi', contact: { npc: 'sb_inti', where: 'at the Rebel Command in Tumi' },
    tasks: [T.quest('sb_tumi_tower', 'Help Inti\'s rebels take back the Tower of Tumi.', 'sb_inti')],
    wait: 'The tower. We go when you\'re ready.',
  },
  pirate: {
    lure: 'the rebels of Tumi need fighters — and fighters make crewmates',
    summary: 'Inti\'s rebels are trying to take back the Tower of Tumi from a bandit lord.',
    meet: ['You\'re a pirate? Good. We need fighters, not saints.', 'Help us take the tower. Some of my people might follow you to sea afterwards.'],
    tasks: [T.quest('sb_tumi_tower', 'Help Inti\'s rebels take back the Tower of Tumi.', 'sb_inti'), T.crew(1, 'Recruit a crewmate.')],
    done: ['The tower is ours. Tumi is free. Go well, captain.', (ctx) => onward(ctx.char, 'Next, sail for')],
  },
  marine: {
    lure: 'a bandit lord holds the Tower of Tumi',
    summary: 'A bandit lord holds the Tower of Tumi, and the rebels are trying to take it back. The Navy should help.',
    meet: ['A Marine? We don\'t usually trust Marines. But the bandit lord in the tower is worse.', 'Help us take it.'],
    done: ['The tower is ours. Maybe the Navy isn\'t so bad.', (ctx) => onward(ctx.char, 'Report to')],
  },
  hunter: {
    lure: 'the bandit lord of Tumi has a poster',
    summary: 'The bandit lord in the Tower of Tumi has a price on his head.',
    meet: ['A hunter? The man in the tower has a poster. We just want him gone.', 'Help us take the tower.'],
    done: ['The tower is ours. Take his poster, hunter — you earned it.', (ctx) => onward(ctx.char, 'Next:')],
  },
});

chapter('sb_kutsukku', { part: 1, island: 'kutsukku_island', role: 'ship' }, {
  all: { name: 'Victoria Punk', tasks: [T.quest('sb_victoria_punk', 'Help Eustass Kid settle things in Victoria Punk (Victoria\'s grave).', 'sb_kid')] },
  pirate: {
    lure: 'a red-haired kid is recruiting in Victoria Punk — and the scrapyard builds ships',
    summary: 'A red-haired boy named Kid runs a gang in Victoria Punk and swears he\'ll be King of the Pirates. The scrapyard slipway builds ships for his friends.',
    contact: hc('kutsukku_island', 'pirate', 'outside the Kutsukku noodle shop'),
    meet: ['Kid\'s gang has a score to settle with the syndicate. Help them, and Rivet at the slipway will build you something that floats.', 'Kid\'s at Victoria\'s grave. Don\'t call him "kid".'],
    wait: 'Kid. Victoria\'s grave.',
    done: ['Kid owes you. So does Rivet — there\'s a caravel on the slipway with your flag on it.', (ctx) => onward(ctx.char, 'Last stop before the mountain:')],
    reward: shipGift('Scrap Queen'),
  },
  marine: {
    lure: 'the gangs of Victoria Punk are at war, and the syndicate behind them has a price',
    summary: 'The gangs of Kutsukku are at war. The syndicate behind them is the real enemy.',
    contact: hc('kutsukku_island', 'marine', 'at the Kutsukku Marine post'),
    meet: ['The syndicate runs Kutsukku. The kid gangs are fighting back. The enemy of my enemy...', 'Find Eustass Kid at Victoria\'s grave. Help him break the syndicate.'],
    wait: 'Victoria\'s grave.',
    done: ['The syndicate\'s broken. The kid gangs will be trouble one day — but not today.', (ctx) => onward(ctx.char, 'Report to')],
  },
  hunter: {
    lure: 'the syndicate bosses in Victoria Punk have posters',
    summary: 'The syndicate bosses of Victoria Punk have posters. Kid\'s gang knows where they are.',
    contact: hc('kutsukku_island', 'hunter', 'outside the Kutsukku inn'),
    meet: ['The syndicate. Every boss has a poster. Eustass Kid\'s gang wants them gone too.', 'He\'s at Victoria\'s grave.'],
    wait: 'Victoria\'s grave.',
    done: ['The syndicate\'s posters, paid. And Rivet sent a caravel from the slipway, for the town\'s hero.', (ctx) => onward(ctx.char, 'Next:')],
    reward: shipGift('Rivet\'s Pride'),
  },
});

chapter('sb_samba', { part: 1, island: 'samba_kingdom', role: 'ship' }, {
  all: {
    name: 'Carnival Night', contact: { npc: 'sb_moqueca', where: 'at the palace of King Moqueca' },
    tasks: [T.quest('sb_samba_carnival', 'Save the carnival from the slavers of Samba (King Moqueca).', 'sb_moqueca')],
    wait: 'The carnival! It must go on!',
  },
  pirate: {
    lure: 'the King of Samba rewards the carnival\'s heroes with ships',
    summary: 'Slavers are hiding in the carnival crowds of Samba. King Moqueca rewards those who save his carnival.',
    meet: ['Slavers! In MY carnival! Find them! Save my dancers!', 'Do it, and a ship from the royal slip is yours.'],
    done: ['The carnival is saved! A ship for the hero — from the royal slip!', (ctx) => onward(ctx.char, 'Last stop before the mountain:')],
    reward: shipGift('Carnaval'),
  },
  marine: {
    lure: 'slavers are hiding in Samba\'s carnival',
    summary: 'Slavers in the carnival crowds. The Navy stops slavers.',
    meet: ['A Marine! Slavers are hiding in my carnival! Find them!', 'Save my dancers!'],
    done: ['The carnival is saved! The Navy has my gratitude!', (ctx) => onward(ctx.char, 'Report to')],
  },
  hunter: {
    lure: 'the slavers in Samba\'s carnival have prices on their heads',
    summary: 'The slavers of Samba have posters — and King Moqueca adds a ship.',
    meet: ['A hunter! The slavers have posters! Take them all!', 'And a ship for the one who saves my carnival!'],
    done: ['The carnival is saved! A ship for the hero!', (ctx) => onward(ctx.char, 'Next:')],
    reward: shipGift('Carnaval'),
  },
});

chapter('sb_briss', { part: 1, island: 'briss_kingdom', role: 'last' }, {
  all: {
    name: 'The St. Briss Shipyard',
    tasks: [T.quest('sb_crab_hand', 'Deal with Crab-Hand Gyro, who has been raiding the St. Briss Shipyard (Master Carvel).', 'sb_carvel'), T.ship(), T.logPose()],
  },
  pirate: {
    lure: 'Briss is the last port before the mountain — and the St. Briss Shipyard is in trouble',
    summary: 'Briss is the last port before Reverse Mountain. Crab-Hand Gyro has been raiding its famous shipyard.',
    contact: hc('briss_kingdom', 'pirate', 'outside the Briss bar'),
    meet: ['Crab-Hand Gyro raids the shipyard every week. Master Carvel would give anything to be rid of him.', 'Deal with Gyro, get a ship that can take the Grand Line and a Log Pose — and you\'re ready.'],
    wait: 'Gyro, a ship, a Log Pose.',
    done: ['Gyro beaten, a ship from Carvel, and a poster with your face. Welcome to piracy.', 'Reverse Mountain is northwest of here. Ride the current — and don\'t look back.'],
    reward: { bounty: 9000000 },
  },
  marine: {
    lure: 'the St. Briss Shipyard is being raided by pirates',
    summary: 'Crab-Hand Gyro is raiding the St. Briss Shipyard. Lieutenant Albrecht wants him stopped before you go.',
    contact: hc('briss_kingdom', 'marine', 'at the Briss Marine post'),
    tasks: [T.quest('sb_crab_hand', 'Deal with Crab-Hand Gyro, who has been raiding the St. Briss Shipyard (Master Carvel).', 'sb_carvel')],
    meet: ['Headquarters wants you in the Grand Line — G-8, at Navarone. But Gyro first: he raids the shipyard every week.', 'Master Carvel will help you find him.'],
    wait: 'Gyro. Master Carvel knows where.',
    done: ['Gyro in irons. Carvel gave you a ship, I hear — the Navy will add its own. Report to G-8.', 'Reverse Mountain is northwest of here.'],
    reward: navyShip,
  },
  hunter: {
    lure: 'Crab-Hand Gyro — sixteen million — is raiding the St. Briss Shipyard',
    summary: 'Crab-Hand Gyro: sixteen million berries.',
    contact: hc('briss_kingdom', 'hunter', 'outside the Briss inn'),
    meet: ['Gyro. Sixteen million. Master Carvel at the shipyard wants him gone.', 'Then a ship and a Log Pose. The Grand Line is next door.'],
    wait: 'Gyro, a ship, a Log Pose.',
    done: ['Sixteen million! The Grand Line is next.', 'Reverse Mountain is northwest of here.'],
  },
});

chapter('sb_centaurea', { part: 1, island: 'centaurea', role: 'last' }, {
  all: { name: 'Mad Maxi', tasks: [T.defeat('mq_sb_maxi', 'Beat Captain "Mad" Maxi at the Centaurea pier.'), T.ship(), T.logPose()] },
  pirate: {
    lure: 'Centaurea is the last port before the mountain — though a rival crew is there already',
    summary: 'Captain Mad Maxi is in Centaurea, and he sinks anyone who might beat him up the mountain.',
    contact: hc('centaurea', 'pirate', 'outside the Centaurea bar'),
    meet: ['Mad Maxi\'s in port. He burns rival ships at anchor.', 'Beat him. And get a real ship and a Log Pose.'],
    wait: 'Maxi, a ship, a Log Pose.',
    done: ['Maxi\'s beaten, and you\'ve a poster. Welcome to piracy.', 'Reverse Mountain is northwest. Don\'t look back.'],
    reward: { bounty: 9000000 },
  },
  marine: {
    lure: 'a pirate who burns rival ships at anchor is in port at Centaurea',
    summary: 'Captain Mad Maxi burns ships at anchor. Arrest him.',
    contact: hc('centaurea', 'marine', 'at the Centaurea Marine post'),
    tasks: [T.defeat('mq_sb_maxi', 'Arrest Captain "Mad" Maxi at the Centaurea pier.')],
    meet: ['Mad Maxi. In port. Arrest him.', 'Then take the cutter and report to G-8, beyond the mountain.'],
    wait: 'Maxi is at the pier.',
    done: ['Maxi in irons. The cutter is yours. Report to G-8.', 'Reverse Mountain is northwest.'],
    reward: navyShip,
  },
  hunter: {
    lure: 'Captain Mad Maxi is worth seven million and sitting in Centaurea',
    summary: 'Captain Mad Maxi: seven million berries.',
    contact: hc('centaurea', 'hunter', 'outside the Centaurea inn'),
    meet: ['Maxi. Seven million. At the pier.', 'Then a ship, and a Log Pose.'],
    wait: 'Maxi, a ship, a Log Pose.',
    done: ['Seven million. The Grand Line is next.', 'Reverse Mountain is northwest.'],
  },
});
rival('mq_sb_maxi', 'centaurea', 'centaurea_town', 'Captain "Mad" Maxi', 'Captain of the Bonfire Pirates', 7000000, { hair: 'mohawk', hairColor: '#ff6f00', top: '#bf360c', bottom: '#212121', goggles: true }, { style: 'brawler', weapon: undefined, alert: 'Everything burns!' });

// ================================================================= REVERSE MOUNTAIN
// the last chapter of every Blue: sail to your Blue's gate in the Red Line and ride the current over
const GATES = { east_blue: 'southwest of Loguetown', north_blue: 'southeast, where the Red Line meets the Grand Line', west_blue: 'northeast, where the Red Line meets the Grand Line', south_blue: 'northwest, where the Red Line meets the Grand Line' };
for (const sea of ['east_blue', 'north_blue', 'west_blue', 'south_blue']) {
  const ride = T.check('ride', `Sail to Reverse Mountain (${GATES[sea]}) and ride the current up and over into the Grand Line.`,
    (c, g) => !!c.flags.enteredGrandLine && g.world === g.surface && isGrandLine(regionAt(g.player.x, g.player.y)),
    { where: (g) => { const m = g.surface.reverseMountain?.mouths?.[sea]; return m ? { x: m.x, y: m.y, place: 'Reverse Mountain' } : null; } });
  chapter(`rm_${sea}`, { part: 1, kind: 'solo', place: 'Reverse Mountain', gate: 'reverse_mountain', sea }, {
    all: {
      name: 'Reverse Mountain', lure: 'where the sea runs uphill',
      summary: 'Where the Red Line meets the Grand Line, the currents of all four Blues run UP a mountain, meet at the summit and pour down into the Grand Line. Once you\'re in, there\'s no way back.',
      tasks: [ride],
    },
  });
}

// ================================================================= the plan
// each Blue's stops, in order; the second choice stands in when the first is your home
const ROADS = {
  east_blue: [['eb_syrup', 'eb_orange'], ['eb_baratie'], ['eb_logue']],
  north_blue: [['nb_lvneel', 'nb_rakesh'], ['nb_swallow', 'nb_notice'], ['nb_deul']],
  west_blue: [['wb_kano', 'wb_ilisia'], ['wb_toroa', 'wb_esperia'], ['wb_lascamp', 'wb_soja']],
  south_blue: [['sb_karate', 'sb_tumi'], ['sb_kutsukku', 'sb_samba'], ['sb_briss', 'sb_centaurea']],
};

/** Part 1 for a character starting at `from` (their home's prologue). */
PLANS[1] = (c, path, from) => {
  const home = from?.kind === 'start' ? from : CHAPTERS.get(PROLOGUES.get(c.main?.home) || '') || null;
  const sea = home?.sea || seaOf(home?.island) || 'east_blue';
  const homeIsl = home?.island;
  const out = [];
  if (home) out.push(home.id);
  for (const opts of ROADS[sea]) {
    const pick = opts.find((id) => CHAPTERS.get(id).island !== homeIsl) || opts[0];
    out.push(pick);
  }
  out.push(`rm_${sea}`);
  return out;
};
const seaOf = (islandId) => ISLAND_BY_ID[islandId]?.sea;

export { ROADS, PATHS3 };
