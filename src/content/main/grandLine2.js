// Part 2, the wider Grand Line: the stops on the roads through the islands
// between the old rows (data/islands/grandLine3.js). Each is told once for
// everyone, with a few words changed for pirates, Marines and hunters. The
// roads that use them are in grandLine.js (GL_ROADS); every pirate road still
// ends at Sabaody.
//
// The new roads each follow a thread:
//  * the Dragon's Wake (from Warship Island): the Marines' hunt for a
//    thousand-year dragon's secret, the films' islands, and the Pirates Expo;
//  * the Dead End (from Hannabal): the deadliest race on the Grand Line, run
//    from island to island all the way to Sabaody;
//  * the Lantern Road (from Saltpetre Isle): Blackbeard's trail, north along
//    the Calm Belt, from where Ace fell at Banaro to the gates of Marineford.
import { chapter, target, T, onward } from './define.js';

/** "…<lead> <next stop>." in each road's own words. */
const LEAD = { pirate: 'Your log has set for', marine: 'Your orders now point to', hunter: 'The next big poster is on' };
const next = (ctx) => onward(ctx.char, LEAD[ctx.char?.main?.path] || LEAD.pirate);
/** A line said differently on each road ({ pirate, marine, hunter, all }). */
const per = (o) => (ctx) => o[ctx.char?.main?.path] ?? o.all ?? o.pirate;

/**
 * A stop: sail there, find the contact, beat the villain they need beaten.
 * s.boss is the target's NPC def (island and town filled in); s.boss2 an
 * optional lieutenant to beat first.
 */
function stop(id, island, s) {
  const town = `${island}_town`;
  const bosses = [s.boss2, s.boss].filter(Boolean).map((b) => target({ island, faction: 'pirate', boss: true, at: { town, dock: true, ox: 3 }, ...b }));
  const descs = [s.task2, s.task].filter(Boolean);
  chapter(id, { part: 2, island, place: s.place }, {
    all: {
      name: s.name, lure: s.lure, summary: s.summary,
      contact: { at: { town, plaza: true, ox: 4 }, where: s.where, ...s.contact },
      meet: s.meet.map((l) => (typeof l === 'string' ? l : per(l))),
      tasks: bosses.map((b, i) => T.defeat(b, descs[i] || 'Beat them.')),
      wait: s.wait,
      done: [...(s.done || []).map((l) => (typeof l === 'string' ? l : per(l))), next],
      after: s.after,
    },
  });
}

// ================================================================= THE DRAGON'S WAKE
stop('gl_warship', 'warship_island', {
  name: 'The Thousand-Year Dragon', lure: 'a girl on Warship Island who can hear animals is being hunted by the Marines',
  summary: 'Apis, a girl who ate the Whisper-Whisper Fruit, ran from a Marine ship with a secret: a thousand-year dragon, and the Lost Island where its kind went to die. A rogue Marine captain wants that secret badly.',
  contact: { name: 'Apis', title: 'Girl of Warship Island', look: { hair: 'ponytail', hairColor: '#4e342e', top: '#ef9a9a', bottom: '#5d4037' } },
  where: 'in Warship Village',
  meet: [
    { pirate: 'You\'re pirates? Good — pirates don\'t take orders from Captain Nelson Royale.', marine: 'A Marine... Please, not all Marines are like Nelson Royale. Prove it.', hunter: 'A bounty hunter? Captain Nelson Royale\'s a Marine, not a pirate — but nobody else will stop him.' },
    'Ryuuji is a dragon, a thousand years old, and he\'s dying. Nelson Royale wants the secret of his long life. His men are in the village right now.',
  ],
  boss2: { id: 'mq_gl2_eric', name: 'Eric the Whirlwind', title: 'Royale\'s Hired Blade', faction: 'bandit', level: 23, hpMul: 0.8, bounty: 0, look: { hair: 'long', hairColor: '#90a4ae', top: '#455a64', bottom: '#263238' }, style: 'ittoryu', skill: 0.35, alert: 'Kama-Kama! The wind cuts!' },
  task2: 'Drive off Eric the Whirlwind, Royale\'s hired blade.',
  boss: { id: 'mq_gl2_royale', name: 'Captain Nelson Royale', title: 'Rogue Marine Captain', faction: 'rival', level: 25, hpMul: 1.1, bounty: 0, look: { hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#1b4f72', hat: 'marine', coat: '#fafafa', bulk: 1.3 }, style: 'brawler', skill: 0.4, alert: 'That dragon\'s secret belongs to me!' },
  task: 'Defeat Captain Nelson Royale before he takes the dragon\'s secret.',
  wait: 'Royale\'s men came in by the docks. Please hurry.',
  done: ['Ryuuji can rest now. He wanted to see the Lost Island one last time — and he did. Thank you.'],
  after: 'When the wind is right, I can still hear Ryuuji singing.',
});

stop('gl_clockwork', 'clockwork_island', {
  name: 'The Clockwork Fortress', lure: 'a fortress that strikes the hour sits on top of Clockwork Island, full of stolen treasure',
  summary: 'The Trump Siblings rule Clockwork Island from the fortress in its clock tower, and steal from every ship that docks. Their latest prize is a ship\'s whole crew.',
  contact: { name: 'Borodo', title: 'Ex-Pirate Treasure Hunter', look: { hair: 'bald', top: '#795548', bottom: '#3e2723', bulk: 1.4 } },
  where: 'at the Gearwork Harbour square',
  meet: ['The Trump Siblings took my crew\'s treasure and my crew with it. They\'re locked in the clock\'s gears up there.', 'Bear King, their captain, wears a crown of clockwork. Climb the tower and knock it off his head.'],
  boss: { id: 'mq_gl2_bear_king', name: 'Bear King', title: 'Captain of the Trump Siblings', level: 27, hpMul: 1.2, bounty: 52000000, look: { hair: 'spiky', hairColor: '#212121', top: '#b71c1c', bottom: '#212121', hat: 'captain', bulk: 1.5 }, style: 'brawler', skill: 0.4, alert: 'Trump card! I always hold it!' },
  task: 'Take down Bear King, captain of the Trump Siblings (฿52,000,000).',
  wait: 'The Clock Fortress is up the crag. Listen for the hour.',
  done: ['My crew\'s free, and the clock\'s stopped for good. Never liked the ticking.'],
});

stop('gl_crown', 'crown_island', {
  name: 'The Antler Crown', lure: 'the animals of Crown Island need a king — and a hunter has stolen the crown',
  summary: 'Crown Island\'s strange animals choose their king by his antlers. A poacher named Count Butler has taken the crown and the antlers both, and is drinking a potion to become king himself.',
  contact: { name: 'Mobambi', title: 'Young Deer of Crown Island', look: { hair: 'short', hairColor: '#8d6e63', top: '#a1887f', bottom: '#6d4c41' } },
  where: 'at the Animal Kingdom',
  meet: ['The crown\'s been stolen! Count Butler took it — and the King\'s antlers too.', 'He\'s mixing a potion to make himself an animal and our king. Stop him, please — the whole island is hiding.'],
  boss: { id: 'mq_gl2_butler', name: 'Count Butler', title: 'Poacher Lord', level: 29, hpMul: 1.25, bounty: 66000000, look: { hair: 'short', hairColor: '#9e9e9e', top: '#4a148c', bottom: '#212121', hat: 'tophat', coat: '#311b92' }, style: 'brawler', skill: 0.4, alert: 'A crown fit for a beast!' },
  task: 'Take the Antler Crown back from Count Butler.',
  wait: 'The Count is in the Antler Throne. Mind the traps.',
  done: ['The crown is back where it belongs. The animals have chosen a new king — a good one.'],
});

stop('gl_omatsuri', 'omatsuri_island', {
  name: 'The Baron\'s Trials', lure: 'Omatsuri Island promises every crew a holiday — and some never leave',
  summary: 'Baron Omatsuri runs the island\'s "trials" for visiting crews. Crews who fail are scattered, or worse. A flower on the hill seems to whisper to him.',
  contact: { name: 'Muchigoro', title: 'Island Hostess', look: { hair: 'long', hairColor: '#f8bbd0', top: '#f06292', bottom: '#4a148c' } },
  where: 'at the Festival Resort',
  meet: ['Welcome, welcome! Join the Baron\'s Trials — prizes for everyone!', '...Psst. Don\'t. Crews who win too many trials vanish. The Baron talks to that flower on the hill all night. Please — put a stop to it.'],
  boss: { id: 'mq_gl2_omatsuri', name: 'Baron Omatsuri', title: 'Master of the Trials', level: 31, hpMul: 1.3, bounty: 80000000, look: { hair: 'curly', hairColor: '#ff7043', top: '#ffffff', bottom: '#d32f2f', hat: 'tophat', hatColor: '#d32f2f' }, style: 'sniper', skill: 0.45, alert: 'The trials aren\'t over!' },
  task: 'Win the last trial: beat Baron Omatsuri.',
  wait: 'The Baron\'s trials are in the great hall.',
  done: ['The flower\'s cut, and the Baron is just a sad old man now. He lost his crew once, too.'],
});

stop('gl_delta', 'delta_island', {
  name: 'The Pirates Expo', lure: 'the Pirates Festival is on at Delta Island — every crew on the sea, chasing one treasure',
  summary: 'Buena Festa has thrown the Pirates Expo on Delta Island: a treasure hunt for Roger\'s lost treasure. The whole thing is a trap — Festa wants every crew in one place, and so does the Navy.',
  contact: { name: 'Ann', title: 'Lost Girl at the Expo', look: { hair: 'short', hairColor: '#212121', top: '#424242', bottom: '#212121', hat: 'hood' } },
  where: 'at the Expo grounds',
  meet: ['You came for the treasure? So did everyone. It\'s a bomb. Festa wants a war, and the Marines want everyone in one cage.', { pirate: 'Stop Festa before he lights it, and you\'ll sail out of here with your crew — the Marines can\'t catch what isn\'t trapped.', marine: 'If you\'re a real Marine, stop Festa\'s bomb. The Navy\'s trap doesn\'t care who\'s standing on the island.', hunter: 'Festa\'s poster is old, but it\'s real. Bring him down, and you\'ll have saved half the pirates you\'d have hunted — and their bounties for later.' }],
  boss: { id: 'mq_gl2_festa', name: 'Buena Festa', title: 'The Festival Man', level: 37, hpMul: 1.5, bounty: 160000000, look: { hair: 'afro', hairColor: '#ff5722', top: '#ffeb3b', bottom: '#212121', hat: 'tophat', bulk: 1.4 }, style: 'brawler', skill: 0.5, alert: 'Let\'s make this festival unforgettable!' },
  task: 'Stop Buena Festa (฿160,000,000) before the Expo blows.',
  wait: 'Festa is in the Expo Hall. The fuse is short.',
  done: ['The bomb\'s out, the Expo\'s over, and somewhere Festa is still laughing about it. Sabaody is close now.'],
});

// ================================================================= THE DEAD END
stop('gl_hannabal', 'hannabal', {
  name: 'The Dead End Race', lure: 'the deadliest race on the Grand Line starts from Hannabal — and the prize is a fortune',
  summary: 'The Dead End race runs from Hannabal to the end of Paradise, anything goes. The organiser, a smuggler called Gasparde, uses it to find the toughest crews — and sink them.',
  contact: { name: 'Shuraiya', title: 'Bounty Hunter with a Grudge', look: { hair: 'long', hairColor: '#3e2723', top: '#212121', bottom: '#4e342e', hat: 'cowboy', hatColor: '#212121' } },
  where: 'at the Dead End Saloon',
  meet: ['You\'re in the race? Then watch Gasparde\'s men. He signs up the strong crews and sends his thugs to sink them before the finish.', 'His first mate runs the starting line. Teach him some manners, and Gasparde will notice you.'],
  boss: { id: 'mq_gl2_needles', name: 'Needles', title: 'Gasparde\'s First Mate', level: 23, hpMul: 0.9, bounty: 24000000, look: { hair: 'mohawk', hairColor: '#4caf50', top: '#212121', bottom: '#424242' }, style: 'brawler', skill: 0.35, alert: 'Nobody wins Gasparde\'s race!' },
  task: 'Beat Needles at the Dead End starting line.',
  wait: 'Needles runs the starting line on the docks.',
  done: ['Gasparde\'s noticed you now. He\'ll be at the finish. So will I.'],
});

stop('gl_kettle', 'kettle_island', {
  name: 'The Volcano Forge', lure: 'the forges of Kettle Island make blades worth stopping for — if the race lets you',
  summary: 'Kettle Island\'s smiths forge with the volcano\'s heat. A gang of race wreckers has taken the forge to arm Gasparde\'s fleet.',
  contact: { name: 'Old Sootbeard', title: 'Master Smith', look: { hair: 'bald', top: '#5d4037', bottom: '#3e2723', bulk: 1.5 } },
  where: 'at the Kettle Forge',
  meet: ['Gasparde\'s wreckers have my forge. They\'re making harpoons for his ships — harpoons for YOUR ship.', 'Their boss is Cinder Kate. Throw her out, and I\'ll put an edge on anything you own.'],
  boss: { id: 'mq_gl2_cinder', name: 'Cinder Kate', title: 'Wrecker Boss', level: 25, hpMul: 1, bounty: 41000000, look: { hair: 'ponytail', hairColor: '#ff5722', top: '#3e2723', bottom: '#212121' }, style: 'brawler', skill: 0.4, alert: 'This forge burns for Gasparde!' },
  task: 'Throw Cinder Kate out of the Kettle Forge.',
  wait: 'The forge is up by the boiling spring. Hot work.',
  done: ['My forge is mine again. Next time you\'re by, bring me something worth sharpening.'],
});

stop('gl_mirage', 'mirage_atoll', {
  name: 'The Town That Isn\'t There', lure: 'sailors on Mirage Atoll see a city across the lagoon that isn\'t there — and ships disappear chasing it',
  summary: 'The mirage on Mirage Atoll lures ships onto the reef. This year, someone is helping it along with lanterns — and looting the wrecks.',
  contact: { name: 'Sabiha', title: 'Lagoon Pilot', look: { hair: 'long', hairColor: '#212121', top: '#ffe082', bottom: '#8d6e63', hat: 'turban' } },
  where: 'in Shimmer',
  meet: ['Every night, lights on the far shore — "the city". The ships steer for it, and the reef takes them.', 'It\'s the Sand Rats, wreckers working for Gasparde. Their boss hides in the ruins on the far side.'],
  boss: { id: 'mq_gl2_sandrat', name: 'Sandrat Sully', title: 'Wrecker of the Atoll', level: 27, hpMul: 1.1, bounty: 49000000, look: { hair: 'buzz', hairColor: '#d7ccc8', top: '#a1887f', bottom: '#6d4c41', hat: 'bandana' }, style: 'sniper', skill: 0.4, alert: 'You followed the lights, didn\'t you?' },
  task: 'Put out the false lights: beat Sandrat Sully in the ruins.',
  wait: 'The ruins are across the lagoon. Watch the reef.',
  done: ['No lights tonight. Just the mirage, and the mirage never sank anyone on its own.'],
});

stop('gl_driftwood', 'driftwood_republic', {
  name: 'The Parliament of Wrecks', lure: 'the Driftwood Republic is voting on whether to sell itself to a pirate',
  summary: 'The Driftwood Republic is a city built of wrecks, run by a parliament that never agrees. A pirate called Admiral Plank has bought enough votes to make himself President-for-life.',
  contact: { name: 'Speaker Hulla', title: 'Speaker of the Parliament', look: { hair: 'curly', hairColor: '#bdbdbd', top: '#1565c0', bottom: '#212121' } },
  where: 'outside the Parliament of Wrecks',
  meet: ['Order! Order! ...Nobody listens. Admiral Plank — not a real admiral — has bought half the parliament.', 'Tomorrow he\'s President-for-life. Unless somebody shows the Republic he\'s just a pirate with a hat.'],
  boss: { id: 'mq_gl2_plank', name: '"Admiral" Plank', title: 'Would-Be President', level: 30, hpMul: 1.2, bounty: 72000000, look: { hair: 'short', hairColor: '#795548', top: '#283593', bottom: '#212121', hat: 'tricorne', coat: '#1a237e' }, style: 'ittoryu', skill: 0.45, alert: 'I have the votes!' },
  task: 'Unseat "Admiral" Plank (฿72,000,000).',
  wait: 'Plank holds court on the docks.',
  done: ['The vote\'s tomorrow, and for once we all agree: no Plank. Come back for the party.'],
});

stop('gl_asuka', 'asuka_island', {
  name: 'The Cursed Sword', lure: 'Asuka Island\'s shrine holds the cursed sword Shichiseiken — and a swordsman has come to take it',
  summary: 'Saga, a swordsman of Asuka Island, has drawn the cursed sword Shichiseiken. The sword is eating him alive, and the seven stars are lining up.',
  contact: { name: 'Maya', title: 'Shrine Maiden', look: { hair: 'long', hairColor: '#212121', top: '#ffffff', bottom: '#c62828' } },
  where: 'at the Hall of the Seven Stars',
  meet: ['Saga drew the Shichiseiken. He was the kindest man on the island. Now the sword speaks through him.', 'When the seven stars line up tonight, it will be too late. Beat him — break the sword\'s grip on him.'],
  boss: { id: 'mq_gl2_saga', name: 'Saga', title: 'Bearer of the Shichiseiken', level: 32, hpMul: 1.3, bounty: 0, faction: 'rival', look: { hair: 'long', hairColor: '#cfd8dc', top: '#37474f', bottom: '#212121' }, style: 'ittoryu', skill: 0.55, alert: 'The sword... wants... blood!' },
  task: 'Free Saga from the cursed sword: beat him at the shrine.',
  wait: 'Saga is at the shrine on the hill. The stars are rising.',
  done: ['The sword is sealed again, and Saga is himself. He\'ll never touch a blade again — he says.'],
});

stop('gl_whistle', 'whistle_rock', {
  name: 'The Singing Rock', lure: 'the wind bell on Whistle Rock has been stolen, and ships are going blind in the fog',
  summary: 'Whistle Rock sings in the wind, and ships steer by it through the fog. Someone has plugged the holes and stolen the Wind Bell — and the reefs are filling with wrecks.',
  contact: { name: 'Keeper Fennel', title: 'Bell-Keeper', look: { hair: 'long', hairColor: '#eeeeee', top: '#90a4ae', bottom: '#455a64' } },
  where: 'in Hollow Holm',
  meet: ['Without the Wind Bell, the rock is silent, and the fog is full of reefs.', 'It was Gasparde\'s men again — they want the race through here blind. Their captain\'s camped at the bell tower.'],
  boss: { id: 'mq_gl2_mute', name: 'Mute Morrow', title: 'Gasparde\'s Captain', level: 33, hpMul: 1.25, bounty: 88000000, look: { hair: 'buzz', hairColor: '#424242', top: '#263238', bottom: '#212121', hat: 'hood' }, style: 'rokushiki', skill: 0.45, alert: '...' },
  task: 'Get the Wind Bell back from Mute Morrow.',
  wait: 'The bell tower is at the top of the rock.',
  done: ['Hear that? The rock is singing again. Ships will find their way tonight.'],
});

stop('gl_hammerhead', 'hammerhead_island', {
  name: 'The Finish Line', lure: 'the Dead End race finishes at Hammerhead Island — and Gasparde is waiting',
  summary: 'The Dead End race ends at the breakers\' yard on Hammerhead Island. Gasparde, the ex-Marine who runs it, means to sink the winners and keep the prize.',
  contact: { name: 'Shuraiya', title: 'Bounty Hunter with a Grudge', look: { hair: 'long', hairColor: '#3e2723', top: '#212121', bottom: '#4e342e', hat: 'cowboy', hatColor: '#212121' }, key: 'shuraiya' },
  where: 'at Breaker\'s Yard',
  meet: ['You made it. So did Gasparde. He killed my family, years ago, and he\'s laughing on that dock.', 'He ate the Candy-Candy Fruit — he melts like syrup. Hit him hard enough, though, and he\'ll set.'],
  boss: { id: 'mq_gl2_gasparde', name: 'Gasparde', title: 'Former Marine Captain', level: 38, hpMul: 1.55, bounty: 198000000, look: { hair: 'short', hairColor: '#4e342e', top: '#212121', bottom: '#212121', coat: '#37474f', bulk: 1.3, scarEye: true }, style: 'brawler', skill: 0.5, alert: 'The race ends here — for you.' },
  task: 'Win the Dead End: beat Gasparde (฿198,000,000) at the finish.',
  wait: 'Gasparde is on the breakers\' dock.',
  done: ['It\'s over. The prize is yours. I\'ll take the quiet.', 'Sabaody is just past here. The race is done — but the Grand Line isn\'t.'],
});

// ================================================================= THE LANTERN ROAD
stop('gl_saltpetre', 'saltpetre_isle', {
  name: 'Fireworks and Gunpowder', lure: 'the fireworks makers of Saltpetre Isle are selling powder to a crew with a black flag',
  summary: 'Saltpetre Isle makes the Grand Line\'s fireworks — and its gunpowder. A crew flying a strange black flag has bought every barrel, and won\'t pay.',
  contact: { name: 'Pop Gunsmoke', title: 'Firework Master', look: { hair: 'afro', hairColor: '#9e9e9e', top: '#e65100', bottom: '#3e2723' } },
  where: 'at the Firework Works',
  meet: ['Black flag, three skulls on it, and a captain who laughs "zehahaha" — no, he wasn\'t here himself. His bosun was.', 'The bosun\'s still here, loading MY powder onto THEIR ship. Stop him, and I\'ll tell you where they were going.'],
  boss: { id: 'mq_gl2_bosun', name: 'Bosun Grit', title: 'Bosun of a Black-Flag Crew', level: 23, hpMul: 0.9, bounty: 26000000, look: { hair: 'buzz', hairColor: '#212121', top: '#212121', bottom: '#424242', bulk: 1.4 }, style: 'brawler', skill: 0.35, alert: 'The Captain wants that powder!' },
  task: 'Stop Bosun Grit taking the powder.',
  wait: 'Grit is loading barrels at the docks.',
  done: ['They were heading north, along the Calm Belt. Following someone, the bosun said. A man with a fire for a fist.'],
});

stop('gl_bellwether', 'bellwether_island', {
  name: 'Wolves of Bellwether', lure: 'the shepherds of Bellwether Island are losing their sheep — and their sons — to wolves on two legs',
  summary: 'Bellwether Island\'s giant sheep are being stolen by a gang of rustlers who wear wolf skins. They have taken the shepherds\' sons too, to mind the stolen flocks.',
  contact: { name: 'Granny Hogget', title: 'Head Shepherd', look: { hair: 'ponytail', hairColor: '#eeeeee', top: '#8d6e63', bottom: '#5d4037' } },
  where: 'in Bellwether',
  meet: ['The Wolf Pack took my grandson with the flock. They hide in the hills past the windmill.', 'Their leader calls himself Fang. Bring my boy home.'],
  boss: { id: 'mq_gl2_fang', name: 'Fang', title: 'Leader of the Wolf Pack', level: 26, hpMul: 1, bounty: 45000000, look: { hair: 'long', hairColor: '#757575', top: '#616161', bottom: '#424242', hat: 'hood', hatColor: '#757575' }, style: 'brawler', skill: 0.4, alert: 'Awoooo!' },
  task: 'Beat Fang and bring the shepherds\' sons home.',
  wait: 'The Wolf Pack is in the hills. Follow the bleating.',
  done: ['My boy is home. He says the Pack were selling wool to a ship with a black flag. Everyone\'s selling to that ship.'],
});

stop('gl_lanternfish', 'lanternfish_cove', {
  name: 'The Dark Half of the Year', lure: 'Lanternfish Cove is dark half the year, and someone is stealing its light',
  summary: 'In Lanternfish Cove the only light comes from glowing fish, sold in jars. A pirate called the Candle has netted the whole bay and is selling the town its own light back.',
  contact: { name: 'Wick', title: 'Lamplighter', look: { hair: 'short', hairColor: '#ffca28', top: '#263238', bottom: '#37474f' } },
  where: 'in Glimmerdock',
  meet: ['The Candle\'s nets are across the whole bay. No fish, no light. People are falling off the piers in the dark.', 'He keeps the jars on his ship at the end of the long pier. Cut the nets — and cut him down.'],
  boss: { id: 'mq_gl2_candle', name: 'The Candle', title: 'Light Thief', level: 28, hpMul: 1.1, bounty: 58000000, look: { hair: 'spiky', hairColor: '#ffeb3b', top: '#212121', bottom: '#212121', bulk: 0.9 }, style: 'sniper', skill: 0.45, alert: 'Want some light? It\'ll cost you.' },
  task: 'Free the lanternfish: beat the Candle.',
  wait: 'The Candle\'s ship is at the end of the long pier.',
  done: ['Look at the bay — it\'s glowing again! The Candle said he was paid to keep the cove dark for a ship passing north. A black flag.'],
});

stop('gl_banaro', 'banaro_island', {
  name: 'Where the Fire Went Out', lure: 'Banaro Island is half burnt black — and the people who did it are still there',
  summary: 'Banaro Island is where Fire Fist Ace caught up with Blackbeard, and lost. The town is half ash. A few of Blackbeard\'s hangers-on stayed to pick it clean.',
  contact: { name: 'Mama Cinza', title: 'Last Bar Owner', look: { hair: 'curly', hairColor: '#9e9e9e', top: '#5d4037', bottom: '#3e2723' } },
  where: 'at the Last Bar',
  meet: ['Fire and darkness, that night. The darkness won. Ace was taken to the Marines alive.', { pirate: 'Blackbeard\'s gone, but his leftovers are robbing what\'s left of us. You\'re a pirate — show them what a real one looks like.', marine: 'The Navy took Ace and left us the ashes. The least you can do is take Blackbeard\'s leftovers too.', hunter: 'Blackbeard\'s leftovers have bounties. Small ones. Take them anyway — for us.' }],
  boss: { id: 'mq_gl2_ashjaw', name: 'Ashjaw Bronn', title: 'Blackbeard Hanger-on', level: 31, hpMul: 1.25, bounty: 74000000, look: { hair: 'long', hairColor: '#212121', top: '#212121', bottom: '#3e2723', bulk: 1.5, scarEye: true }, style: 'brawler', skill: 0.45, alert: 'Zehahaha — that\'s how the Captain laughs. I\'m practising.' },
  task: 'Drive Ashjaw Bronn (฿74,000,000) out of Banaro.',
  wait: 'Ashjaw\'s lot are picking through the scorched quarter.',
  done: ['Banaro will rebuild. Ace would\'ve liked that.'],
});

stop('gl_tumbleweed', 'tumbleweed_island', {
  name: 'One Sheriff Too Many', lure: 'Tumbleweed Island has more bounty hunters than pirates — and a sheriff who sells the posters',
  summary: 'Dustwater has one street, one saloon and one sheriff, who rigs the island\'s bounty board: he forges posters on honest folk and splits the reward with his deputies.',
  contact: { name: 'Clem', title: 'Saloon Pianist', look: { hair: 'short', hairColor: '#795548', top: '#fff3e0', bottom: '#4e342e', hat: 'cowboy' } },
  where: 'at the Dry Gulch',
  meet: ['See that board? Half those faces never robbed nobody. Sheriff Drawl draws the posters himself.', { pirate: 'He\'ll have one of you up there by morning. Get him first.', marine: 'The Navy pays those posters. You\'re paying a crook. Arrest him.', hunter: 'Every fake poster makes a real hunter look like a crook. Bring him in.' }],
  boss: { id: 'mq_gl2_drawl', name: 'Sheriff Drawl', title: 'Crooked Lawman', level: 33, hpMul: 1.25, bounty: 90000000, look: { hair: 'short', hairColor: '#d7ccc8', top: '#5d4037', bottom: '#3e2723', hat: 'cowboy', hatColor: '#3e2723' }, style: 'sniper', skill: 0.5, alert: 'Draw!' },
  task: 'Take Sheriff Drawl\'s badge.',
  wait: 'Drawl sits outside the Sheriff\'s Office all day.',
  done: ['The board\'s cleaned up. Only real pirates on it now — and a few of them sailed north this week, flying black.'],
});

stop('gl_mecha', 'mecha_island', {
  name: 'The Golden Crown', lure: 'Karakuri Castle on Mecha Island is full of clockwork soldiers, and its lord is hunting the Golden Crown',
  summary: 'Lord Ratchet of Mecha Island has an army of clockwork soldiers and a legend: the treasure of the Golden Crown, buried under the island. He\'s digging it up with the islanders\' hands.',
  contact: { name: 'Granny Mechanic', title: 'Old Toymaker', look: { hair: 'ponytail', hairColor: '#e0e0e0', top: '#6d4c41', bottom: '#3e2723' } },
  where: 'in Karakuri Town',
  meet: ['My son Ratchet built every soldier in that castle. Now he thinks the Golden Crown will make his mother proud.', 'The "treasure" will sink the whole island. Stop him, but... please don\'t break him.'],
  boss: { id: 'mq_gl2_ratchet', name: 'Lord Ratchet', title: 'Master of Karakuri Castle', level: 35, hpMul: 1.4, bounty: 112000000, look: { hair: 'spiky', hairColor: '#ffb300', top: '#ffd54f', bottom: '#5d4037', hat: 'captain', hatColor: '#ffb300' }, style: 'brawler', skill: 0.45, alert: 'My soldiers never tire!' },
  task: 'Stop Lord Ratchet (฿112,000,000) before he digs up the Golden Crown.',
  wait: 'Ratchet is in Karakuri Castle, up the crag.',
  done: ['The island is still here. Ratchet is grounded. Forever.'],
});

stop('gl_mistletoe', 'mistletoe_island', {
  name: 'The Night Before', lure: 'on Mistletoe Island it\'s always the night before a holiday — and someone wants to keep it that way',
  summary: 'Mistletoe Island never gets to its holiday morning. A woman with a Devil Fruit froze the island\'s calendar, and its people are too happy to notice they\'ve been prisoners for years.',
  contact: { name: 'Little Tinsel', title: 'Girl Who Remembers', look: { hair: 'ponytail', hairColor: '#d32f2f', top: '#2e7d32', bottom: '#c62828', hat: 'beanie' } },
  where: 'in Hollyhearth',
  meet: ['It\'s been the night before for six years. Everyone else forgets every morning. I don\'t.', 'Madame Evergreen lives in the Snow Saint\'s house. She said holidays are better waited for. Make it morning, please.'],
  boss: { id: 'mq_gl2_evergreen', name: 'Madame Evergreen', title: 'Keeper of the Night Before', level: 37, hpMul: 1.45, bounty: 140000000, look: { hair: 'long', hairColor: '#e8f5e9', top: '#1b5e20', bottom: '#ffffff', coat: '#2e7d32' }, style: 'sniper', skill: 0.5, alert: 'Not yet. Never yet.' },
  task: 'Wake Mistletoe Island: beat Madame Evergreen.',
  wait: 'She\'s by the Snow Saint, on the hill.',
  done: ['IT\'S MORNING! It\'s actually morning! ...Is this what presents are?', 'Marineford is south of here. The black flag passed the island last week — going the same way.'],
});
