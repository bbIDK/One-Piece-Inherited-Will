// Part 1, chapter 1: home. On every island the Blues' young set out from,
// three people can set you on your road:
//   * an old sea dog who knows what a pirate needs (a flag of their own —
//     and a word on fighting whichever way suits you),
//   * the officer of the island's Marine post, who'll swear you in once
//     you've proved yourself on the local troublemaker,
//   * a bounty broker with a first poster — the same troublemaker.
// Whoever you go with sends you off with a Log Pose set for your first stop.
import { chapter, target, T, LOOK, onward } from './define.js';
import { count } from '../../game/inventory.js';
import { enlistNow } from '../../game/factions.js';
import { formatBerries } from '../../core/math.js';
import { ISLAND_BY_ID } from '../../data/islands/index.js';
import { allNpcDefs } from '../../game/npcs.js';
import { TRAINERS } from '../../data/trainers.js';

// a Log Pose for the road (unless you've one already)
const logPose = (g) => (count(g.state.char, 'log_pose') ? {} : { items: [['log_pose', 1]] });
const firstName = (c) => String(c.name || '').split(' ')[0];

const blades = (name) => ({ text: 'Show me those old blades.', do: (c) => c.open('shop', { shop: 'weapons_blue', building: { name: `${name}'s old blades`, role: 'weapons', shop: 'weapons_blue' } }) });

/**
 * What the old sea dog tells a new pirate about fighting: nobody has to
 * carry a sword — fists, feet, a blade or a gun all win fights — and where
 * on this island to get one or learn one (the town's weapon shop, and a
 * trainer who lives here). Worked out when it's said: the island's people
 * are all known by then.
 */
function fightTip(island, town) {
  return () => {
    const isl = ISLAND_BY_ID[island];
    const t = (isl?.towns || []).find((x) => x.id === town) || isl?.towns?.[0];
    const shop = (t?.buildings || []).find((b) => b.role === 'weapons')?.name;
    const teacher = allNpcDefs().find((d) => d.island === island && d.trainer && TRAINERS[d.trainer]);
    // (who they are and where, without the bracketed asides: "Kano Country (West Blue)" is Kano Country here)
    const plain = (s) => String(s || '').replace(/\s*\([^)]*\)/g, '').replace(/^"[^"]*"\s*/, '').trim();
    const where = teacher && plain(TRAINERS[teacher.trainer].where);
    const shopName = shop && !/\s|'/.test(shop) ? `The ${shop}` : shop;
    const buy = shop ? `${shopName} will sell you a weapon if you want one, and I've a few old blades in the back if you've the berries.` : 'I\'ve a few old blades in the back if you want steel — no shame in a pair of good fists, though.';
    const learn = teacher ? ` ${plain(teacher.name)}${where ? ` — ${where} —` : ''} will teach you a thing or two, if you'd rather learn than buy.` : ' Trainers and dojos all over the Blues will teach you a style, if you go looking.';
    return `${buy}${learn}`;
  };
}
const posters = { text: 'Show me the posters.', do: (c) => c.open('bounty', {}) };
const navy = (post) => ({ text: 'Marine business.', if: (c) => c.char.faction === 'marine', do: (c) => c.emit('marineOffice', { name: post, role: 'marine_base' }), end: true });

/**
 * One home island.
 *   o.town: the town (name), o.villain: the troublemaker (NPC def bits + `crime`, `where`),
 *   o.pirate / o.marine / o.hunter: { name, title, look, at, where, pitch: [2 lines], post (Marine post name), … }
 */
function home(island, sea, o) {
  const V = o.villain;
  const vid = target({
    id: `mq_v_${island}`, island, name: V.name, title: V.title, faction: V.faction || 'pirate', race: V.race,
    boss: true, hpMul: V.hpMul ?? 0.45, level: V.level ?? 4, style: V.style || 'brawler', weapon: V.weapon, ranged: V.ranged,
    look: V.look, bounty: V.bounty, at: V.at, alert: V.alert, defeatLine: V.defeat, skill: 0.18, breakthrough: 1, leash: 22,
  });
  const P = o.pirate, M = o.marine, H = o.hunter;
  const vname = V.name.replace(/^"[^"]*"\s*/, '');
  const bounty = formatBerries(V.bounty);
  const she = !!V.look?.fem;
  const he = she ? 'she' : 'he', He = she ? 'She' : 'He', him = she ? 'her' : 'him';
  const kind = V.faction === 'pirate' || !V.faction ? 'pirate' : V.faction === 'rival' ? 'swordsman' : 'crook';
  chapter(`home_${island}`, { part: 1, island, kind: 'start', sea, town: o.town }, {
    pirate: {
      name: P.chapter || 'A Flag of Your Own',
      summary: `Every pirate crew starts with a name and a flag. ${P.name} in ${o.townName} will see you off once yours is flying.`,
      contact: { name: P.name, title: P.title, look: P.look, race: P.race, at: P.at, where: P.where, level: 12, choices: [blades(P.name)] },
      pitch: P.pitch,
      accept: 'I\'m going to be a pirate.',
      meet: [
        P.first || 'Ha! Then listen close. Fight however suits you — fists, feet, a blade or a pistol. The sea doesn\'t care which, so long as you\'re the one standing.',
        fightTip(island, o.town),
        'But a pirate without a flag is just a sailor who\'s lost his job. Give your crew a name and raise a Jolly Roger of your own. (Crew menu — U.)',
      ],
      tasks: [T.flag()],
      // (saved before the blade was let go: the steps this chapter had then — see quests.js reconcile)
      was: ['weapon', 'flag', 'report'],
      wait: P.wait || 'A flag, captain. Name your crew and raise your Jolly Roger — until then you\'re just a sailor with a boat.',
      done: [
        (ctx) => `${P.done || 'Now THAT is a Jolly Roger.'} The ${ctx.char.crewName || 'new crew'}... I'll remember that name. So will the Marines, soon enough.`,
        (ctx) => `Here — my old Log Pose. ${onward(ctx.char)} A crew needs more than one pirate, and your little boat won't last a day in the Grand Line. Get stronger on the way.`,
      ],
      after: P.after || ((ctx) => `Off with you, Captain ${firstName(ctx.char)}! The sea doesn't wait for anyone.`),
      idle: P.idle || 'Already on your way somewhere, are you? Good. The sea rewards those who don\'t look back.',
      reward: logPose,
    },
    marine: {
      name: M.chapter || 'Seaman Recruit',
      summary: `${M.name} of the ${M.post} will swear you into the Navy — once you've brought in ${vname}, who has been ${V.crime}.`,
      contact: { name: M.name, title: M.post, look: M.look || LOOK.officer(), race: M.race, faction: 'marine', at: M.at, where: M.where, level: 16, style: 'ittoryu', weapon: 'sword', choices: [navy(M.post)] },
      pitch: M.pitch,
      accept: 'I want to join the Marines.',
      meet: [
        M.first || `Words are cheap. Show me what you're made of. There's a ${kind} called ${V.name} — ${bounty} on ${she ? 'her' : 'his'} head — who has been ${V.crime}.`,
        `Bring ${vname} in ${V.where}. Knock ${him} down, and I'll see to the cuffs. Do that, and I'll swear you in myself.`,
      ],
      tasks: [T.defeat(vid, `Bring in ${V.name} ${V.where}.`)],
      wait: M.wait || `${vname} is still out there ${V.where}. The people of ${o.townName} are waiting, recruit.`,
      done: [
        M.done || `Hah! That'll teach him. You've a knack for this — and a sense of Justice, I think.`,
        'Raise your right hand. Do you swear to uphold Justice and protect the people of the seas, wherever the Navy sends you? ...Good. Welcome to the Marines, Seaman Recruit.',
        (ctx) => `Here's your cap, and a Navy-issue Log Pose. ${onward(ctx.char, 'Your first orders: report to')}`,
      ],
      onReport: (g) => { const c = g.state.char; c.claims = (c.claims || []).filter((x) => x.name !== V.name); enlistNow(g, o.townName); },
      onDone: (g) => enlistNow(g, o.townName), // (however the chapter ends: enlistNow does nothing twice)
      after: M.after || ((ctx) => `Stand up straight, ${ctx.char.marineRank || 'Seaman'}! You carry the Navy's name now.`),
      idle: M.idle || 'Carry on, citizen. The Navy keeps watch.',
      reward: logPose,
    },
    hunter: {
      name: H.chapter || 'The First Poster',
      summary: `${H.name} deals in bounties in ${o.townName}. Their first poster for you: ${V.name}, ${bounty}.`,
      contact: { name: H.name, title: H.title || 'Bounty Broker', look: H.look, race: H.race, at: H.at, where: H.where, level: 12, choices: [posters] },
      pitch: H.pitch,
      accept: 'I\'ll hunt pirates for a living.',
      meet: [
        H.first || `Everyone starts with a small one. Here: ${V.name}, ${bounty}. ${He}'s been ${V.crime}.`,
        `Last seen ${V.where}. Knock ${him} down — the dead can't stand trial, so keep it clean — and I'll handle the paperwork with the Marines.`,
      ],
      tasks: [T.defeat(vid, `Hunt down ${V.name} (${bounty}) ${V.where}.`)],
      wait: H.wait || `${vname} is still out there ${V.where}. Money doesn't walk up to you, partner.`,
      done: [
        H.done || `Ha! Look at ${him}. The Marines will be delighted — and so will I. Here's your cut, and the poster to frame.`,
        (ctx) => `And here — a Log Pose, for the road. ${onward(ctx.char, 'Word is the big money is at')}`,
      ],
      // (the broker takes him to the Marines: the claim is theirs now)
      onReport: (g) => { const c = g.state.char; c.claims = (c.claims || []).filter((x) => x.name !== V.name); c.flags.bountyHunter = true; },
      after: H.after || 'Bring me more posters\' worth, partner. There are always more.',
      idle: H.idle || 'Every face on these posters is somebody\'s payday. Could be yours, one day.',
      reward: (g) => ({ ...logPose(g), berries: Math.round(V.bounty * 0.004) * 10 }),
    },
  });
}

const PIER = (town) => ({ town, dock: true, ox: 1.5 });

// ================================================================ EAST BLUE
home('dawn_island', 'east_blue', {
  town: 'foosha', townName: 'Foosha Village',
  villain: { name: '"Mad Dog" Brannigan', title: 'Pirate of the Gray Terminal', bounty: 1200000, crime: 'shaking down the fishermen for their catch', where: 'at Foosha\'s pier', at: PIER('foosha'),
    look: { hair: 'spiky', hairColor: '#4e342e', top: '#5d4037', bottom: '#3e2723', hat: 'bandana', hatColor: '#b71c1c', scarEye: true }, style: 'brawler', alert: 'Another brat from the village? Go home to your mama!', defeat: 'Arf... not the face...' },
  pirate: { name: 'Old Gyoru', title: 'Retired Buccaneer', at: { town: 'foosha', door: 'bar' }, where: 'outside Party\'s Bar',
    look: { hair: 'bald', skin: '#e0ac7e', top: '#795548', bottom: '#3e2723', hat: 'bandana', hatColor: '#263238', scarEye: true, bulk: 1.15 },
    pitch: ['Red-Hair Shanks drank in that bar, you know. The day he sailed, a boy from this village swore he\'d be King of the Pirates. Everyone laughed.', 'You\'ve got that same look in your eye. Want to hear what it takes?'] },
  marine: { name: 'Lieutenant Kessel', post: 'Goa Marine Garrison', at: { town: 'goa', building: 'marine_base' }, where: 'at the Goa Marine Garrison, over the hill',
    look: LOOK.officer({ hair: 'short', hairColor: '#212121' }),
    pitch: ['The Goa Kingdom\'s garrison keeps the peace from these walls to the Gray Terminal — or tries to. We\'re short of hands, and shorter of honest ones.', 'You look sturdy enough. Ever thought of serving Justice?'] },
  hunter: { name: 'Sly Mahon', at: { town: 'foosha', plaza: true, ox: -4 }, where: 'by the well in Foosha',
    look: { hair: 'long', hairColor: '#212121', top: '#37474f', bottom: '#263238', hat: 'cowboy', hatColor: '#3e2723' },
    pitch: ['Every pirate who sails out of the East Blue gets a price on his head sooner or later. Somebody has to collect it.', 'I sell posters and buy captives. Interested in making your money off scoundrels?'] },
});

home('shells_island', 'east_blue', {
  town: 'shells_town', townName: 'Shells Town',
  villain: { name: '"Knuckles" Gorrin', title: 'Market Thug', bounty: 900000, crime: 'robbing the market stalls while the Marines look the other way', where: 'down by the Shells Town pier', at: PIER('shells_town'), faction: 'bandit',
    look: { hair: 'buzz', hairColor: '#3e2723', top: '#8d6e63', bottom: '#4e342e', bulk: 1.3 }, alert: 'Captain Morgan don\'t care what I take. Why should you?' },
  pirate: { name: 'Salty Pell', title: 'Old Fisherman', at: { town: 'shells_town', door: 'inn' }, where: 'outside the Seagull Inn',
    look: { hair: 'short', hairColor: '#cfd8dc', top: '#1565c0', bottom: '#455a64', hat: 'beanie', hatColor: '#b0bec5' },
    pitch: ['Axe-Hand Morgan\'s Marines have this whole town under their boot. A man who thinks HE is Justice.', 'Makes a body want to fly a different flag, doesn\'t it? A free one.'] },
  marine: { name: 'Lieutenant Ripper', post: 'Marine Base 153rd Branch', at: { town: 'marine_153', building: 'marine_base', guest: true }, where: 'at Marine Base 153, up the hill',
    look: LOOK.officer({ hair: 'short', hairColor: '#212121' }),
    pitch: ['Captain Morgan runs this base with an iron fist... and not every Marine here is proud of it.', 'The Navy is more than one bad captain. Sign up — and help me prove it.'] },
  hunter: { name: 'Tobbs the Tally', at: { town: 'shells_town', door: 'restaurant' }, where: 'outside Rika\'s restaurant',
    look: { hair: 'curly', hairColor: '#6d4c41', top: '#607d8b', bottom: '#37474f', hat: 'cap', hatColor: '#263238' },
    pitch: ['They say a pirate hunter called Roronoa Zoro is tied up in the Marine yard. That\'s what happens when you hunt for free.', 'I make sure hunters get PAID. Want in?'] },
});

home('shimotsuki', 'east_blue', {
  town: 'shimotsuki_village', townName: 'Shimotsuki Village',
  villain: { name: '"Rust-Blade" Kazan', title: 'Masterless Ronin', bounty: 1000000, crime: 'challenging the dojo\'s students and stealing their swords', where: 'by the village pier', at: PIER('shimotsuki_village'), faction: 'rival', style: 'ittoryu', weapon: 'sword',
    look: { hair: 'topknot', hairColor: '#212121', top: '#455a64', bottom: '#263238' }, alert: 'Another sword for my collection!' },
  pirate: { name: 'Genba the One-Eyed', title: 'Retired Pirate', at: { town: 'shimotsuki_village', plaza: true, ox: 3 }, where: 'in the village square',
    look: { hair: 'long', hairColor: '#9e9e9e', top: '#5d4037', bottom: '#3e2723', scarEye: true },
    pitch: ['This village breeds swordsmen. Koushirou\'s dojo turned out a girl who could beat any man — and a green-haired boy who swore he\'d be the greatest in the world.', 'The sea\'s where swordsmen go to become legends. Pirates, too.'] },
  marine: { name: 'Ensign Mikoto', post: 'Shimotsuki Marine Post', at: { town: 'shimotsuki_village', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'ponytail', hairColor: '#1a237e', fem: true }),
    pitch: ['A village of swords needs someone to keep those swords pointed the right way.', 'Join the Navy. Your blade would serve Justice instead of your pride.'] },
  hunter: { name: 'Wandering Shiro', at: { town: 'shimotsuki_village', door: 'shop' }, where: 'outside the village shop',
    look: { hair: 'spiky', hairColor: '#eceff1', top: '#263238', bottom: '#212121', hat: 'straw', hatColor: '#d7ccc8' },
    pitch: ['Swordsmen who lose their way become ronin. Ronin become posters.', 'I pay for the ones who\'ve lost their way. Care to find them for me?'] },
});

home('organ_islands', 'east_blue', {
  town: 'orange_town', townName: 'Orange Town',
  villain: { name: '"Pinwheel" Poko', title: 'Buggy Pirates Straggler', bounty: 800000, crime: 'looting the houses Buggy\'s crew emptied', where: 'down at Orange Town\'s pier', at: PIER('orange_town'), style: 'ittoryu', weapon: 'sword',
    look: { hair: 'curly', hairColor: '#e53935', top: '#fdd835', bottom: '#1e88e5', hat: 'bandana', hatColor: '#e53935' }, alert: 'Flashy entrance, eh? Captain Buggy would be proud of me!' },
  pirate: { name: 'Hocker the Drifter', title: 'Wandering Pirate', at: { town: 'orange_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'short', hairColor: '#795548', top: '#2e7d32', bottom: '#4e342e', hat: 'tricorne', hatColor: '#3e2723' },
    pitch: ['Buggy the Clown turned this town into his circus. That\'s one kind of pirate.', 'There\'s another kind — the kind who\'d tell Buggy to his painted face to get out. Which kind are you?'] },
  marine: { name: 'Lieutenant Mace', post: 'Orange Town Marine Post', at: { town: 'orange_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'buzz', hairColor: '#5d4037' }),
    pitch: ['The Buggy Pirates chased half this town into the hills while the Navy was busy elsewhere. I got here too late.', 'Never again. Help me hold this post.'] },
  hunter: { name: 'Mikka the Tallier', at: { town: 'orange_town', plaza: true, ox: -4 }, where: 'in the town square',
    look: { hair: 'ponytail', hairColor: '#ff7043', top: '#8d6e63', bottom: '#5d4037', fem: true },
    pitch: ['Buggy the Clown: fifteen million berries. Every one of his crew has a price too — cheaper, but they add up.', 'Start small. Everybody does.'] },
});

home('gecko_islands', 'east_blue', {
  town: 'syrup_village', townName: 'Syrup Village',
  villain: { name: '"Sham-Cat" Rudo', title: 'Black Cat Pirates Straggler', bounty: 700000, crime: 'sneaking into houses at night — he says his old captain is coming back', where: 'by Syrup Village\'s pier', at: PIER('syrup_village'), style: 'brawler',
    look: { hair: 'spiky', hairColor: '#212121', top: '#212121', bottom: '#37474f', hat: 'bandana', hatColor: '#212121' }, alert: 'The Captain\'s plan can\'t fail! Nyaa!' },
  pirate: { name: 'Old Man Gatz', title: 'Retired Whaler', at: { town: 'syrup_village', door: 'bar' }, where: 'outside the village bar',
    look: { hair: 'bald', skin: '#d7a47a', top: '#eceff1', bottom: '#546e7a', bulk: 1.2 },
    pitch: ['There\'s a boy in this village who shouts "Pirates are coming!" every morning. One day, they really did.', 'Some folk run from pirates. Some become them. You\'ve the look of the second kind.'] },
  marine: { name: 'Lieutenant Bridget', post: 'Syrup Village Marine Post', at: { town: 'syrup_village', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'long', hairColor: '#ffb300', fem: true }),
    pitch: ['Captain Kuro of the Black Cat Pirates was executed three years ago. Or so the reports say.', 'The Navy could use sharp eyes in a quiet place like this. Enlist.'] },
  hunter: { name: 'Clack the Collector', at: { town: 'syrup_village', plaza: true, ox: 4 }, where: 'in the village square',
    look: { hair: 'short', hairColor: '#424242', top: '#6d4c41', bottom: '#3e2723', hat: 'cowboy', hatColor: '#5d4037' },
    pitch: ['Kuro of a Hundred Plans was worth sixteen million — before he "died". Posters don\'t die, though. Not till someone collects.', 'Want to learn the trade?'] },
});

home('conomi_islands', 'east_blue', {
  town: 'cocoyasi', townName: 'Cocoyasi Village',
  villain: { name: '"Chew-Lip" Kobbe', title: 'Arlong\'s Tribute Collector', bounty: 1500000, race: 'fishman', crime: 'collecting Arlong\'s "tribute" with his fists', where: 'at Cocoyasi\'s pier', at: PIER('cocoyasi'), style: 'fishman_karate',
    look: { skin: '#5d9cec', top: '#fafafa', bottom: '#1565c0', fin: true, gills: true, sharpTeeth: true }, hpMul: 0.5, alert: 'Tribute day, humans! Shahaha!' },
  pirate: { name: 'Captain Bellows', title: 'Retired Pirate', at: { town: 'cocoyasi', plaza: true, ox: -4 }, where: 'in Cocoyasi\'s square',
    look: { hair: 'long', hairColor: '#bdbdbd', top: '#1e88e5', bottom: '#263238', hat: 'captain', hatColor: '#212121', bulk: 1.1 },
    pitch: ['Arlong\'s Fish-Men squeeze every village on these islands for tribute. Eight years now.', 'A pirate who\'d stand up to a pirate like that... now there\'s someone I\'d drink to.'] },
  marine: { name: 'Ensign Tolles', post: 'Marine Branch 16', at: { town: 'marine_16', building: 'marine_base', guest: true }, where: 'at Marine Branch 16',
    look: LOOK.officer({ hair: 'short', hairColor: '#6d4c41' }),
    pitch: ['Captain Nezumi says Arlong\'s Fish-Men are "no business of the Navy". I say he\'s taking their money.', 'I can\'t prove it alone. Join up — quietly — and help me.'] },
  hunter: { name: 'Pearl-Eye Suzu', at: { town: 'cocoyasi', plaza: true, ox: 4 }, where: 'in Cocoyasi\'s square',
    look: { hair: 'ponytail', hairColor: '#26a69a', top: '#fff176', bottom: '#5d4037', fem: true },
    pitch: ['Saw-Tooth Arlong: twenty million berries. Nobody on this island dares touch that poster.', 'His collectors, though? Cheaper — and nobody here would mourn them.'] },
});

home('satsuruzo', 'east_blue', {
  town: 'satsuruzo_town', townName: 'Satsuruzo Town',
  villain: { name: '"Pickaxe" Dorren', title: 'Claim-Jumper', bounty: 600000, crime: 'robbing the miners on payday', where: 'down by the town pier', at: PIER('satsuruzo_town'), faction: 'bandit', style: 'brawler',
    look: { hair: 'mohawk', hairColor: '#212121', top: '#6d4c41', bottom: '#4e342e', bulk: 1.25 }, alert: 'Payday\'s MY day!' },
  pirate: { name: 'Mutt the Sailmaker', title: 'Old Sailmaker', at: { town: 'satsuruzo_town', plaza: true, ox: 3 }, where: 'in the town square',
    look: { hair: 'curly', hairColor: '#9e9e9e', top: '#fff8e1', bottom: '#6d4c41' },
    pitch: ['I\'ve stitched sails for merchants, fishermen and three pirate crews. Guess which paid the best.', 'A good sail wants a good flag on it. Thinking of making one?'] },
  marine: { name: 'Lieutenant Varga', post: 'Satsuruzo Marine Base', at: { town: 'satsuruzo_town', building: 'marine_base' }, where: 'at the Marine base',
    look: LOOK.officer({ hair: 'short', hairColor: '#37474f' }),
    pitch: ['The mines bring money, and money brings thieves. My base can\'t be everywhere.', 'Put on the cap and help me be everywhere.'] },
  hunter: { name: 'Broker Linne', at: { town: 'satsuruzo_town', door: 'shop' }, where: 'outside the town shop',
    look: { hair: 'long', hairColor: '#5d4037', top: '#26a69a', bottom: '#37474f', fem: true },
    pitch: ['Miners dig for gold. I dig for posters. Guess which pays better per hour.', 'Care to try a shovel of your own?'] },
});

home('oykot', 'east_blue', {
  town: 'oykot_castle_town', townName: 'Oykot Castle Town',
  villain: { name: '"The Grey Baron"', title: 'Pirate Swindler', bounty: 1300000, crime: 'selling "royal pardons" to scared townsfolk', where: 'at the castle town\'s pier', at: PIER('oykot_castle_town'), style: 'ittoryu', weapon: 'sword',
    look: { hair: 'long', hairColor: '#bdbdbd', top: '#616161', bottom: '#212121', hat: 'tophat', hatColor: '#424242' }, alert: 'Your pardon has expired, I\'m afraid.' },
  pirate: { name: 'Hiccup Joe', title: 'Drunken Navigator', at: { town: 'oykot_castle_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'spiky', hairColor: '#ff8f00', top: '#c62828', bottom: '#263238', hat: 'bandana', hatColor: '#fdd835' },
    pitch: ['Hic! I\'ve charted every current between here and Loguetown. Drunk. Every one.', 'You look like someone who needs a chart and a reason. I\'ve got one of those.'] },
  marine: { name: 'Lieutenant Aldous', post: 'Oykot Marine Post', at: { town: 'oykot_castle_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#8d6e63' }),
    pitch: ['The King of Oykot wants his castle town safe. The Navy wants recruits. I want both.', 'You could help all three of us.'] },
  hunter: { name: 'Madame Sels', at: { town: 'oykot_castle_town', plaza: true, ox: -4 }, where: 'in the castle square',
    look: { hair: 'curly', hairColor: '#4a148c', top: '#6a1b9a', bottom: '#212121', fem: true },
    pitch: ['Nobles pay for peace and quiet. Pirates disturb it. I arrange the difference — for a fee.', 'Fancy earning some of it?'] },
});

// ================================================================ NORTH BLUE
home('lvneel', 'north_blue', {
  town: 'lvneel_town', townName: 'Lvneel',
  villain: { name: '"Cold-Nose" Hagen', title: 'Smuggler', bounty: 1100000, crime: 'running stolen furs past the harbour-master', where: 'at Lvneel\'s pier', at: PIER('lvneel_town'), style: 'ittoryu', weapon: 'sword',
    look: { hair: 'short', hairColor: '#eceff1', top: '#37474f', bottom: '#263238', hat: 'beanie', hatColor: '#263238' }, alert: 'Nobody saw anything. Especially not you.' },
  pirate: { name: 'Old Rolf', title: 'Storyteller', at: { town: 'lvneel_town', door: 'tavern' }, where: 'outside the tavern',
    look: { hair: 'long', hairColor: '#e0e0e0', top: '#4e342e', bottom: '#3e2723', bulk: 1.1 },
    pitch: ['Noland the Liar sailed from this harbour and came back with stories of a city of gold. They hanged him for it.', 'I\'ve always thought the sea owes that man an apology. Maybe you\'re the one to collect it.'] },
  marine: { name: 'Lieutenant Isolde', post: 'Lvneel Marine Post', at: { town: 'lvneel_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'long', hairColor: '#fff176', fem: true }),
    pitch: ['The North Blue is cold and the smugglers are colder. The kingdom asked the Navy for help.', 'I asked the Navy for recruits. They sent me you, I think.'] },
  hunter: { name: 'Brekk the Tally-Man', at: { town: 'lvneel_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'buzz', hairColor: '#795548', top: '#5d4037', bottom: '#3e2723', hat: 'beanie', hatColor: '#6d4c41', bulk: 1.2 },
    pitch: ['Every smuggler on this coast has a number next to his name. I keep the book.', 'Want me to write YOUR name next to one of theirs?'] },
});

home('notice', 'north_blue', {
  town: 'notice_town', townName: 'Notice',
  villain: { name: '"Ringer" Maks', title: 'Crooked Prizefighter', bounty: 700000, crime: 'beating townsfolk for their purses after his rigged bouts', where: 'at Notice\'s pier', at: PIER('notice_town'), faction: 'bandit', style: 'brawler',
    look: { hair: 'buzz', hairColor: '#212121', top: '#b71c1c', bottom: '#212121', bulk: 1.3, openShirt: true }, alert: 'Round one, pal!' },
  pirate: { name: 'Nell the Deckhand', title: 'Former Pirate', at: { town: 'notice_town', door: 'bar' }, where: 'outside the bar',
    look: { hair: 'ponytail', hairColor: '#d84315', top: '#37474f', bottom: '#212121', fem: true },
    pitch: ['Notice builds fighters. The ring here has broken better noses than yours.', 'But a ring\'s got ropes. The sea hasn\'t. Ever thought of a bigger ring?'] },
  marine: { name: 'Lieutenant Garm', post: 'Notice Marine Post', at: { town: 'notice_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#212121', bulk: 1.15 }),
    pitch: ['This town\'s full of people who can throw a punch. Few of them know where to aim it.', 'The Navy will teach you where. Interested?'] },
  hunter: { name: 'Posey Quill', at: { town: 'notice_town', door: 'bank' }, where: 'outside the bank',
    look: { hair: 'short', hairColor: '#212121', top: '#546e7a', bottom: '#37474f', hat: 'cap', hatColor: '#263238', fem: true },
    pitch: ['The bank pays me to find the people who rob it. The Marines pay me to find the rest.', 'I need legs. Yours look fine.'] },
});

home('spider_miles', 'north_blue', {
  town: 'spider_miles_port', townName: 'Spider Miles',
  villain: { name: '"Rat-King" Scorch', title: 'Junkyard Pirate', bounty: 1400000, crime: 'burning out the scrap-pickers who won\'t pay him', where: 'at the port pier', at: PIER('spider_miles_port'), style: 'brawler',
    look: { hair: 'afro', hairColor: '#424242', top: '#3e2723', bottom: '#212121', scarEye: true }, alert: 'This dump is MINE!' },
  pirate: { name: 'Crooked Vess', title: 'Scrap-Pirate', at: { town: 'spider_miles_port', door: 'bar' }, where: 'outside the port bar',
    look: { hair: 'spiky', hairColor: '#9e9e9e', top: '#455a64', bottom: '#263238', goggles: true },
    pitch: ['A young man with a pink feather coat built himself a family out of this junkyard. Now half the North Blue fears the name Donquixote.', 'Everyone starts in the dirt. What matters is which flag you raise out of it.'] },
  marine: { name: 'Lieutenant Oskar', post: 'Spider Miles Marine Post', at: { town: 'spider_miles_port', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#3e2723' }),
    pitch: ['The only Marine post in a town that hates Marines. I asked for this posting. Nobody else would take it.', 'If you\'ve the stomach for it, so could you.'] },
  hunter: { name: 'Magpie Rett', at: { town: 'spider_miles_port', door: 'market' }, where: 'outside the market',
    look: { hair: 'long', hairColor: '#212121', top: '#212121', bottom: '#37474f', hat: 'hood', hatColor: '#212121' },
    pitch: ['Spider Miles is a junkyard of wanted men. Best hunting ground in the North Blue — if you\'re not afraid of rust.', 'Well? Are you?'] },
});

home('swallow_island', 'north_blue', {
  town: 'swallow_town', townName: 'Swallow Island',
  villain: { name: '"Wolfskin" Grell', title: 'Poacher', bounty: 900000, crime: 'poaching the island\'s bears and threatening anyone who objects', where: 'at the town pier', at: PIER('swallow_town'), faction: 'bandit', style: 'brawler',
    look: { hair: 'long', hairColor: '#8d6e63', top: '#9e9e9e', bottom: '#5d4037', hat: 'hood', hatColor: '#9e9e9e', bulk: 1.2 }, alert: 'Your pelt\'ll do nicely.' },
  pirate: { name: 'Old Birgit', title: 'Ferry Captain', at: { town: 'swallow_town', door: 'bar' }, where: 'outside the bar',
    look: { hair: 'long', hairColor: '#eeeeee', top: '#1565c0', bottom: '#263238', hat: 'beanie', hatColor: '#e53935', fem: true },
    pitch: ['A surgeon boy lives up the hill with a talking bear. Says he\'ll sail one day with a crew of his own.', 'This island makes dreamers. Are you one?'] },
  marine: { name: 'Lieutenant Halvard', post: 'Swallow Island Marine Post', at: { town: 'swallow_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#e0e0e0', bulk: 1.1 }),
    pitch: ['Snow, bears and boredom. That\'s this post. And now a poacher who thinks the law stops at the treeline.', 'Help me prove it doesn\'t, and I\'ll put in a word for you.'] },
  hunter: { name: 'Fox-Eyed Tamsin', at: { town: 'swallow_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'ponytail', hairColor: '#ff7043', top: '#5d4037', bottom: '#3e2723', hat: 'beanie', hatColor: '#6d4c41', fem: true },
    pitch: ['Out here you hunt or you starve. I just prefer my prey with a price tag.', 'Want to learn? I\'ll teach you the tracks.'] },
});

home('rakesh', 'north_blue', {
  town: 'rakesh_port', townName: 'Rakesh',
  villain: { name: '"Harpoon" Vigg', title: 'Wrecker', bounty: 1000000, crime: 'luring merchant ships onto the rocks with false lights', where: 'at the Rakesh pier', at: PIER('rakesh_port'), style: 'ittoryu', weapon: 'sword',
    look: { hair: 'short', hairColor: '#4e342e', top: '#263238', bottom: '#37474f', hat: 'tricorne', hatColor: '#212121' }, alert: 'Another ship for the rocks!' },
  pirate: { name: 'Bosun Harrow', title: 'Old Bosun', at: { town: 'rakesh_port', door: 'bar' }, where: 'outside the port bar',
    look: { hair: 'bald', skin: '#e0ac7e', top: '#3949ab', bottom: '#263238', bulk: 1.25 },
    pitch: ['Rakesh has been pillaged twice in my lifetime. Both times by pirates. Both times I swore I\'d become one, just to get even.', 'Never did. You look like you might.'] },
  marine: { name: 'Lieutenant Sabine', post: 'Rakesh Marine Post', at: { town: 'rakesh_port', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#212121', fem: true }),
    pitch: ['Three ships wrecked this month. Someone\'s lighting false beacons on the point.', 'I need someone quick and honest. You\'ll do, if you\'re both.'] },
  hunter: { name: 'Greaves', at: { town: 'rakesh_port', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'long', hairColor: '#616161', top: '#4e342e', bottom: '#212121', hat: 'cowboy', hatColor: '#212121' },
    pitch: ['Merchant houses pay better than the Marines for the men who sink their ships.', 'Double pay, if you\'re quick. Interested?'] },
});

home('flevance', 'north_blue', {
  town: 'whiteland_town', townName: 'the White City',
  villain: { name: '"Ash-Hand" Corvin', title: 'Grave Robber', bounty: 800000, crime: 'digging up the graves of Flevance for Amber Lead', where: 'at the old pier', at: PIER('whiteland_town'), faction: 'bandit', style: 'brawler',
    look: { hair: 'short', hairColor: '#eeeeee', top: '#616161', bottom: '#424242', hat: 'hood', hatColor: '#757575' }, alert: 'The dead don\'t need their riches.' },
  pirate: { name: 'Konrad\'s Brother', title: 'Survivor of Flevance', at: { town: 'whiteland_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'short', hairColor: '#fafafa', top: '#eceff1', bottom: '#90a4ae' },
    pitch: ['The World Government called this city a plague and burned it. The only ones who survived were the ones who ran.', 'Pirates run from the Government too. Some of us never stopped.'] },
  marine: { name: 'Lieutenant Weiss', post: 'Flevance Quarantine Post', at: { town: 'whiteland_town', building: 'marine_base' }, where: 'at the quarantine post',
    look: LOOK.officer({ hair: 'long', hairColor: '#fafafa' }),
    pitch: ['I was posted here to keep people out. I stay to keep the dead in peace.', 'The Navy made mistakes here. Help me make it right — one grave at a time.'] },
  hunter: { name: 'Pale Oda', at: { town: 'whiteland_town', door: 'church' }, where: 'outside the church',
    look: { hair: 'long', hairColor: '#212121', top: '#212121', bottom: '#212121', fem: true },
    pitch: ['Grave robbers dig here every winter. The families left behind pay me to stop them.', 'I pay whoever does the stopping.'] },
});

// ================================================================ WEST BLUE
home('kano_country', 'west_blue', {
  town: 'kano_town', townName: 'Kano Country',
  villain: { name: '"Iron-Belly" Wu', title: 'Hasshoken Dropout', bounty: 1000000, crime: 'extorting the noodle stalls with stolen Hasshoken moves', where: 'at Kano\'s pier', at: PIER('kano_town'), faction: 'bandit', style: 'brawler',
    look: { hair: 'topknot', hairColor: '#212121', top: '#c62828', bottom: '#212121', bulk: 1.35, openShirt: true }, alert: 'Eight Impacts! Well — three.' },
  pirate: { name: 'Grandpa Luo', title: 'Retired Pirate', at: { town: 'kano_town', door: 'restaurant' }, where: 'outside the noodle house',
    look: { hair: 'bald', skin: '#e8c4a0', top: '#ffb300', bottom: '#5d4037', bulk: 1.1 },
    pitch: ['Old Chinjao up in the dojo was a pirate once — a hundred million on his drill head. Then a man called Garp flattened it.', 'The sea humbles everyone. That\'s why it\'s worth sailing. Well?'] },
  marine: { name: 'Lieutenant Mei', post: 'Kano Marine Post', at: { town: 'kano_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'ponytail', hairColor: '#212121', fem: true }),
    pitch: ['Kano is proud and old and very good at fighting. The Navy mostly keeps out of its way.', 'But not all its fighters are honourable. I need one who is.'] },
  hunter: { name: 'Two-Coin Fen', at: { town: 'kano_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'short', hairColor: '#212121', top: '#2e7d32', bottom: '#212121', hat: 'straw', hatColor: '#d7ccc8' },
    pitch: ['Kano\'s a country of fighters. Some fight for honour. Some fight for coin. I pay the second kind.', 'Which kind are you?'] },
});

home('ilisia', 'west_blue', {
  town: 'ilisia_town', townName: 'Ilisia',
  villain: { name: '"Silver-Tongue" Pell', title: 'Con-Man Pirate', bounty: 1200000, crime: 'selling fake treasure maps to the King\'s guards', where: 'at the Ilisia pier', at: PIER('ilisia_town'), style: 'ittoryu', weapon: 'sword',
    look: { hair: 'long', hairColor: '#cfd8dc', top: '#7b1fa2', bottom: '#212121', hat: 'tricorne', hatColor: '#4a148c' }, alert: 'Let\'s talk this over, friend... no?' },
  pirate: { name: 'Maren the Sail', title: 'Old Sailor', at: { town: 'ilisia_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'curly', hairColor: '#8d6e63', top: '#eceff1', bottom: '#455a64', fem: true },
    pitch: ['The King of Ilisia says dragons are coming. Nobody believes him. I\'ve seen stranger things at sea.', 'You want to see them too, don\'t you? I can tell.'] },
  marine: { name: 'Lieutenant Dorsey', post: 'Ilisia Marine Post', at: { town: 'ilisia_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#795548' }),
    pitch: ['A frightened king, a restless court, and pirates circling like gulls. This post needs steady hands.', 'Yours look steady. Join up.'] },
  hunter: { name: 'Lady Ansel', at: { town: 'ilisia_town', plaza: true, ox: -4 }, where: 'in the palace square',
    look: { hair: 'long', hairColor: '#ffd54f', top: '#1565c0', bottom: '#263238', fem: true },
    pitch: ['The court pays handsomely for quiet removals of pirate trouble. Discreetly.', 'Can you be discreet?'] },
});

home('toroa', 'west_blue', {
  town: 'toroa_town', townName: 'Toroa',
  villain: { name: '"Cage-Man" Brisco', title: 'Slaver\'s Thug', bounty: 1500000, crime: 'snatching musicians off the street to sell at Sabaody', where: 'at Toroa\'s pier', at: PIER('toroa_town'), style: 'brawler',
    look: { hair: 'buzz', hairColor: '#212121', top: '#424242', bottom: '#212121', bulk: 1.4 }, alert: 'You\'ll fetch a fine price too.' },
  pirate: { name: 'Fiddler Moss', title: 'Travelling Musician', at: { town: 'toroa_town', door: 'bar' }, where: 'outside the bar',
    look: { hair: 'afro', hairColor: '#3e2723', top: '#ffb300', bottom: '#4e342e', hat: 'tophat', hatColor: '#212121' },
    pitch: ['Toroa\'s a town of songs, and every good pirate crew needs a song. Yohohoho — that\'s how the old one goes.', 'Write a new one. Start a crew.'] },
  marine: { name: 'Lieutenant Corra', post: 'Toroa Marine Post', at: { town: 'toroa_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'ponytail', hairColor: '#6d4c41', fem: true }),
    pitch: ['People are disappearing. Musicians, mostly. Slavers pay well for talent at Sabaody.', 'The Navy should be stopping it. Help me make it.'] },
  hunter: { name: 'Keel Barrow', at: { town: 'toroa_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'short', hairColor: '#5d4037', top: '#37474f', bottom: '#263238', hat: 'cowboy', hatColor: '#3e2723' },
    pitch: ['A slaver\'s thug is worth more than you\'d think. The families here pooled their savings.', 'Want to earn them?'] },
});

home('las_camp', 'west_blue', {
  town: 'las_camp_town', townName: 'Las Camp',
  villain: { name: '"Dice" Donnie', title: 'Fire Tank Errand Boy', bounty: 900000, crime: 'collecting "protection" money for a family that never asked him to', where: 'at the Las Camp pier', at: PIER('las_camp_town'), style: 'sniper', weapon: 'gun', ranged: true,
    look: { hair: 'short', hairColor: '#212121', top: '#212121', bottom: '#212121', hat: 'tophat', hatColor: '#212121' }, alert: 'The Family sends its regards!' },
  pirate: { name: 'Old Salvatore', title: 'Retired Pirate', at: { town: 'las_camp_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'short', hairColor: '#e0e0e0', top: '#fafafa', bottom: '#212121', hat: 'tophat', hatColor: '#424242' },
    pitch: ['This city belongs to the gangs. Capone Bege runs his like a fortress. Even the mafia fears a pirate with a good crew.', 'Build one. Then no gang owns you.'] },
  marine: { name: 'Lieutenant Moretti', post: 'Las Camp Marine Post', at: { town: 'las_camp_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#212121' }),
    pitch: ['In Las Camp the mafia pays the police and the police pay the mafia. The Navy is the only honest badge left.', 'I could use another.'] },
  hunter: { name: 'Gordo\'s Clerk', title: 'Bounty Office Clerk', at: { town: 'las_camp_town', door: 'bounty' }, where: 'outside the bounty office',
    look: { hair: 'short', hairColor: '#5d4037', top: '#fafafa', bottom: '#37474f', glasses: true },
    pitch: ['The boss says we\'re short of hunters with nerve. Most quit after the first gang shows up at their door.', 'You look like you wouldn\'t.'] },
});

home('soja_island', 'west_blue', {
  town: 'soja_village', townName: 'Soja',
  villain: { name: '"Rum-Runner" Kest', title: 'Smuggler Captain', bounty: 800000, crime: 'running poisoned rum into the village bar', where: 'at the Soja pier', at: PIER('soja_village'), style: 'ittoryu', weapon: 'sword',
    look: { hair: 'spiky', hairColor: '#6d4c41', top: '#795548', bottom: '#3e2723', hat: 'bandana', hatColor: '#795548' }, alert: 'Have a drink on me — a sword, I mean!' },
  pirate: { name: 'Lefty Brum', title: 'One-Armed Pirate', at: { town: 'soja_village', door: 'bar' }, where: 'outside the bar',
    look: { hair: 'long', hairColor: '#212121', top: '#2e7d32', bottom: '#263238', hat: 'tricorne', hatColor: '#1b5e20' },
    pitch: ['Lost the arm to a Sea King off the Calm Belt. Worth it — I saw the Grand Line.', 'Most people never do. You could.'] },
  marine: { name: 'Lieutenant Pike', post: 'Soja Marine Post', at: { town: 'soja_village', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'buzz', hairColor: '#8d6e63' }),
    pitch: ['Someone\'s selling poisoned rum. Two fishermen dead already.', 'I need a recruit who can move fast. You?'] },
  hunter: { name: 'Widow Ennis', at: { town: 'soja_village', door: 'bank' }, where: 'outside the bank',
    look: { hair: 'long', hairColor: '#212121', top: '#212121', bottom: '#263238', fem: true },
    pitch: ['My husband drank that rum. The village took up a collection for whoever brings in the man who sold it.', 'Will it be you?'] },
});

home('esperia', 'west_blue', {
  town: 'esperia_town', townName: 'Esperia',
  villain: { name: '"Scarlet Fang" Oriel', title: 'Duelist Pirate', bounty: 1100000, crime: 'challenging the town\'s musicians to duels — and taking their instruments', where: 'at Esperia\'s pier', at: PIER('esperia_town'), style: 'ittoryu', weapon: 'sword',
    look: { hair: 'long', hairColor: '#c62828', top: '#212121', bottom: '#b71c1c', fem: true }, alert: 'En garde, darling!' },
  pirate: { name: 'Ottavio\'s Cousin', title: 'Idle Sailor', at: { town: 'esperia_town', door: 'bar' }, where: 'outside the bar',
    look: { hair: 'curly', hairColor: '#3e2723', top: '#ff7043', bottom: '#263238' },
    pitch: ['Esperia sings every night. Opera, ballads, drinking songs. The best songs are always about pirates.', 'Want to be in one?'] },
  marine: { name: 'Lieutenant Vale', post: 'Esperia Marine Post', at: { town: 'esperia_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#3e2723' }),
    pitch: ['A quiet town of singers. A duelist has decided to make it her stage.', 'Help me close the show, recruit.'] },
  hunter: { name: 'Rosso the Agent', at: { town: 'esperia_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'short', hairColor: '#212121', top: '#880e4f', bottom: '#212121', hat: 'tophat', hatColor: '#212121' },
    pitch: ['I manage singers — and I manage bounties. Both are about timing.', 'Your timing looks good. Care to audition?'] },
});

home('asshina', 'west_blue', {
  town: 'asshina_town', townName: 'Asshina',
  villain: { name: '"Stilt" Ranulf', title: 'Colosseum Cheat', bounty: 1000000, crime: 'drugging the fighters he bets against', where: 'at the Asshina pier', at: PIER('asshina_town'), style: 'brawler',
    look: { hair: 'spiky', hairColor: '#4e342e', top: '#8d6e63', bottom: '#5d4037' }, alert: 'Long legs, long reach, short fuse!' },
  pirate: { name: 'Stork-Leg Abe', title: 'Old Brawler', at: { town: 'asshina_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'short', hairColor: '#9e9e9e', top: '#1565c0', bottom: '#263238' },
    pitch: ['On Asshina every child learns to kick before they learn to walk. And every one dreams of the sea beyond the colosseum walls.', 'I did too, once. You still can.'] },
  marine: { name: 'Lieutenant Heron', post: 'Asshina Marine Post', at: { town: 'asshina_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#212121' }),
    pitch: ['The colosseum makes champions. Some go on to the Navy. Most go on to prison.', 'Pick the right one.'] },
  hunter: { name: 'Quick-Step Lira', at: { town: 'asshina_town', door: 'hall' }, where: 'outside the colosseum hall',
    look: { hair: 'ponytail', hairColor: '#ffb300', top: '#212121', bottom: '#b71c1c', fem: true },
    pitch: ['I scout fighters for the colosseum — and for bounty work. The second pays better.', 'Let\'s see how you move.'] },
});

home('ohara', 'west_blue', {
  town: 'ohara_camp', townName: 'Ohara',
  villain: { name: '"Bookburner" Vane', title: 'Scavenger', bounty: 900000, crime: 'digging through the ruins of the Tree of Knowledge to sell forbidden pages', where: 'at the Ohara pier', at: PIER('ohara_camp'), faction: 'bandit', style: 'brawler',
    look: { hair: 'short', hairColor: '#795548', top: '#616161', bottom: '#424242', goggles: true }, alert: 'These pages will fetch a fortune!' },
  pirate: { name: 'Clover\'s Student', title: 'Last Scholar of Ohara', at: { town: 'ohara_camp', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'long', hairColor: '#eeeeee', top: '#5d4037', bottom: '#3e2723', glasses: true },
    pitch: ['The World Government burned this island because its scholars read the Poneglyphs. Only the pirates dare seek the true history now.', 'If you sail, sail toward the truth.'] },
  marine: { name: 'Lieutenant Saul', post: 'Ohara Watch Post', at: { town: 'ohara_camp', building: 'marine_base' }, where: 'at the watch post',
    look: LOOK.officer({ hair: 'short', hairColor: '#9e9e9e' }),
    pitch: ['I watch over what\'s left of Ohara. Some days I think I\'m guarding it; some days I think I\'m guarding the world from it.', 'The Navy needs people who can live with that. Can you?'] },
  hunter: { name: 'Fennick', at: { town: 'ohara_camp', door: 'shop' }, where: 'outside the camp shop',
    look: { hair: 'short', hairColor: '#212121', top: '#455a64', bottom: '#263238', hat: 'cap', hatColor: '#37474f' },
    pitch: ['The Government pays for anyone caught selling pages from Ohara. Pays well, and asks no questions.', 'I ask even fewer. Interested?'] },
});

// ================================================================ SOUTH BLUE
home('baterilla', 'south_blue', {
  town: 'baterilla_town', townName: 'Baterilla',
  villain: { name: '"Hound" Degas', title: 'Bounty Poacher', bounty: 1000000, crime: 'threatening the villagers and asking about a woman named Rouge', where: 'at the Baterilla pier', at: PIER('baterilla_town'), style: 'sniper', weapon: 'gun', ranged: true,
    look: { hair: 'short', hairColor: '#212121', top: '#3e2723', bottom: '#212121', hat: 'cowboy', hatColor: '#212121' }, alert: 'Tell me where the woman is!' },
  pirate: { name: 'Old Joaquín', title: 'Fisherman', at: { town: 'baterilla_town', door: 'bar' }, where: 'outside the bar',
    look: { hair: 'short', hairColor: '#9e9e9e', top: '#fafafa', bottom: '#1565c0', hat: 'straw', hatColor: '#d7ccc8' },
    pitch: ['They say the Pirate King himself had a sweetheart on this island. The Marines turned it upside down looking for his child.', 'His blood or not — the sea belongs to whoever has the nerve. Have you?'] },
  marine: { name: 'Lieutenant Castell', post: 'Baterilla Marine Camp', at: { town: 'baterilla_camp', building: 'marine_base' }, where: 'at the Marine camp outside town',
    look: LOOK.officer({ hair: 'short', hairColor: '#4e342e' }),
    pitch: ['The camp was built to hunt a pregnant woman. I\'m not proud of that order. I\'d rather we protected this village for once.', 'Join, and help me do it.'] },
  hunter: { name: 'Santa the Ledger', at: { town: 'baterilla_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'long', hairColor: '#ff7043', top: '#fff8e1', bottom: '#5d4037', fem: true },
    pitch: ['A poacher\'s been harassing the village. He\'s got a poster of his own, as it happens.', 'Hunt the hunter. Poetic, isn\'t it?'] },
});

home('karate_island', 'south_blue', {
  town: 'karate_dojo_town', townName: 'Karate Island',
  villain: { name: '"Broken-Belt" Jiro', title: 'Disgraced Fighter', bounty: 900000, crime: 'beating up students from the dojos he was thrown out of', where: 'at the island pier', at: PIER('karate_dojo_town'), faction: 'bandit', style: 'brawler',
    look: { hair: 'buzz', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa', belt: '#212121', bulk: 1.2 }, alert: 'I\'ll break YOUR belt!' },
  pirate: { name: 'Sensei Umeko', title: 'Retired Pirate Brawler', at: { town: 'karate_dojo_town', door: 'restaurant' }, where: 'outside the restaurant',
    look: { hair: 'ponytail', hairColor: '#eeeeee', top: '#c62828', bottom: '#212121', fem: true },
    pitch: ['I learned to fight in these dojos and learned to use it at sea. Twenty years, three crews, one broken nose.', 'The dojos teach discipline. The sea teaches everything else. Coming?'] },
  marine: { name: 'Lieutenant Kenta', post: 'Karate Island Marine Post', at: { town: 'karate_dojo_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#212121', bulk: 1.15 }),
    pitch: ['This island trains the best unarmed fighters in the South Blue. The Navy recruits a lot of them.', 'Show me your fists, then.'] },
  hunter: { name: 'Mama Pim', at: { town: 'karate_dojo_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'curly', hairColor: '#8d6e63', top: '#ffb300', bottom: '#5d4037', fem: true, bulk: 1.2 },
    pitch: ['Fighters come here to learn. The ones who get thrown out come back to take revenge — and they\'ve got prices on their heads.', 'I pay by the head. Fair?'] },
});

home('sorbet_kingdom', 'south_blue', {
  town: 'sorbet_town', townName: 'Sorbet Kingdom',
  villain: { name: '"Tax-Man" Gourd', title: 'The King\'s Old Collector', bounty: 1200000, crime: 'still collecting the old king\'s taxes — for himself', where: 'at the Sorbet pier', at: PIER('sorbet_town'), faction: 'bandit', style: 'brawler',
    look: { hair: 'bald', skin: '#e0ac7e', top: '#6a1b9a', bottom: '#4a148c', bulk: 1.4 }, alert: 'Pay up, peasant!' },
  pirate: { name: 'Nettle the Bosun', title: 'Former Pirate', at: { town: 'sorbet_town', door: 'bar' }, where: 'outside the bar',
    look: { hair: 'spiky', hairColor: '#ff8f00', top: '#37474f', bottom: '#212121', scarEye: true },
    pitch: ['A kind giant of a priest rose up here and threw out the tyrant king. People still pray for him.', 'Some rise up with prayers. Some with a flag. Your turn.'] },
  marine: { name: 'Lieutenant Anya', post: 'Sorbet Marine Post', at: { town: 'sorbet_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'long', hairColor: '#d7ccc8', fem: true }),
    pitch: ['The old king\'s men haven\'t all given up his ways. One still "collects taxes".', 'Help me end it properly — with the law.'] },
  hunter: { name: 'Coin-Counter Pasha', at: { town: 'sorbet_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'short', hairColor: '#212121', top: '#fdd835', bottom: '#5d4037', hat: 'turban', hatColor: '#fafafa' },
    pitch: ['The new government put a price on the old king\'s thugs. Nice price, too.', 'Help me spend it.'] },
});

home('briss_kingdom', 'south_blue', {
  town: 'briss_town', townName: 'Briss Kingdom',
  villain: { name: '"Crab-Claw" Mott', title: 'Dockside Pirate', bounty: 1000000, crime: 'stealing navigation charts from the kingdom\'s explorers', where: 'at the Briss pier', at: PIER('briss_town'), style: 'brawler',
    look: { hair: 'spiky', hairColor: '#d84315', top: '#e64a19', bottom: '#3e2723', bulk: 1.25 }, alert: 'Snip snip!' },
  pirate: { name: 'Captain Mildred', title: 'Retired Explorer', at: { town: 'briss_town', door: 'bar' }, where: 'outside the bar',
    look: { hair: 'curly', hairColor: '#eeeeee', top: '#1e88e5', bottom: '#263238', hat: 'captain', hatColor: '#0d47a1', fem: true },
    pitch: ['Briss sent the St. Briss out to find the sky itself. Explorers, pirates — at sea, what\'s the difference?', 'A flag, mostly. Want one?'] },
  marine: { name: 'Lieutenant Albrecht', post: 'Briss Marine Post', at: { town: 'briss_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#5d4037' }),
    pitch: ['Briss is the last port before Reverse Mountain for half the South Blue. Every rookie pirate passes through.', 'Every rookie Marine should too. Sign on.'] },
  hunter: { name: 'Sal\'s Nephew', at: { town: 'briss_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'short', hairColor: '#212121', top: '#26a69a', bottom: '#37474f', hat: 'cap', hatColor: '#004d40' },
    pitch: ['Uncle Sal sells sextants. I sell pirates — to the Marines.', 'Better margins. Want in?'] },
});

home('centaurea', 'south_blue', {
  town: 'centaurea_town', townName: 'Centaurea',
  villain: { name: '"Deserter" Hask', title: 'Rogue Soldier', bounty: 1300000, crime: 'looting refugee carts on the coast road', where: 'at the Centaurea pier', at: PIER('centaurea_town'), faction: 'bandit', style: 'ittoryu', weapon: 'sword',
    look: { hair: 'buzz', hairColor: '#3e2723', top: '#558b2f', bottom: '#33691e' }, alert: 'The war\'s over. Now I take what I want.' },
  pirate: { name: 'Gambo\'s Brother', title: 'Smuggler', at: { town: 'centaurea_town', door: 'bar' }, where: 'outside the bar',
    look: { hair: 'long', hairColor: '#4e342e', top: '#455a64', bottom: '#263238', hat: 'bandana', hatColor: '#455a64' },
    pitch: ['This country is falling apart. Revolutionaries in the hills, the army in the forts, and the World Government counting the pieces.', 'Out at sea, nobody rules you. Fancy it?'] },
  marine: { name: 'Lieutenant Linden', post: 'Centaurea Marine Post', at: { town: 'centaurea_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#212121' }),
    pitch: ['A war\'s ending here. Deserters are turning bandit on every road.', 'The Navy can\'t fix a country. It can protect the people on the road. Help me.'] },
  hunter: { name: 'Thorn', at: { town: 'centaurea_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'long', hairColor: '#212121', top: '#212121', bottom: '#4e342e', fem: true },
    pitch: ['War makes posters. Lots of them. Everyone with a grudge has put a price on someone.', 'I sort the honest ones from the rest. Want the honest ones?'] },
});

home('kutsukku_island', 'south_blue', {
  town: 'kutsukku_town', townName: 'Kutsukku',
  villain: { name: '"Rivet-Head" Brann', title: 'Gang Enforcer', bounty: 1100000, crime: 'smashing up the workshops that won\'t pay his gang', where: 'at the Kutsukku pier', at: PIER('kutsukku_town'), faction: 'bandit', style: 'brawler',
    look: { hair: 'mohawk', hairColor: '#e53935', top: '#212121', bottom: '#424242', goggles: true, bulk: 1.2 }, alert: 'Victoria Punk rules!' },
  pirate: { name: 'Sparks Dolan', title: 'Mechanic', at: { town: 'kutsukku_town', door: 'restaurant' }, where: 'outside the noodle shop',
    look: { hair: 'spiky', hairColor: '#ffb300', top: '#546e7a', bottom: '#263238', goggles: true },
    pitch: ['A red-haired kid runs the gangs in Victoria Punk. Says he\'ll be King of the Pirates. Half this town believes him.', 'Nobody believes in you yet. Fix that.'] },
  marine: { name: 'Lieutenant Ferra', post: 'Kutsukku Marine Post', at: { town: 'kutsukku_town', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#212121', fem: true }),
    pitch: ['The gangs of Kutsukku make pirates look polite. One of them\'s leaning on the workshops.', 'Help me lean back.'] },
  hunter: { name: 'Bolt', at: { town: 'kutsukku_town', door: 'inn' }, where: 'outside the inn',
    look: { hair: 'buzz', hairColor: '#212121', top: '#bf360c', bottom: '#212121', goggles: true },
    pitch: ['Every gang in Victoria Punk has a price list. I\'ve got all of them.', 'Pick a name. Let\'s start small.'] },
});

home('torino_kingdom', 'south_blue', {
  town: 'torino_village', townName: 'Torino Kingdom',
  villain: { name: '"Feather-Thief" Crag', title: 'Egg Poacher', bounty: 800000, crime: 'stealing the giant birds\' eggs to sell to collectors', where: 'at the village pier', at: PIER('torino_village'), faction: 'bandit', style: 'ittoryu', weapon: 'sword',
    look: { hair: 'long', hairColor: '#795548', top: '#8d6e63', bottom: '#4e342e', hat: 'cowboy', hatColor: '#6d4c41' }, alert: 'Those eggs are worth a fortune!' },
  pirate: { name: 'Pappug the Parrot-Keeper', title: 'Retired Pirate', at: { town: 'torino_village', door: 'inn' }, where: 'outside the inn', race: 'mink',
    look: { hat: 'tricorne', hatColor: '#212121', top: '#2e7d32', bottom: '#4e342e' },
    pitch: ['The birds here are big enough to ride. The sea is bigger. I sailed it for thirty years.', 'Garchu! Go and see it for yourself.'] },
  marine: { name: 'Lieutenant Rook', post: 'Torino Marine Post', at: { town: 'torino_village', building: 'marine_base' }, where: 'at the Marine post',
    look: LOOK.officer({ hair: 'short', hairColor: '#3e2723' }),
    pitch: ['The Navy keeps a post here to protect the birds from poachers. It\'s the strangest posting in the South Blue.', 'And I need help. Poachers again.'] },
  hunter: { name: 'Tally-Bird Nia', at: { town: 'torino_village', door: 'library' }, where: 'outside the library', race: 'mink',
    look: { top: '#fdd835', bottom: '#5d4037', fem: true },
    pitch: ['The collectors who buy stolen eggs put up bounties on each other. Funny people.', 'The poachers are funnier. They\'ve got posters too.'] },
});
