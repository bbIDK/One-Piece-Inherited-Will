// West Blue content pack: Ohara's ashes, the Chinjao Family's trials, the
// mafia wars of the Five Families, the sunken legend of God Valley, and the
// lost Land of Instrument Makers.
//
// The player is never a Straw Hat. They arrive at the West Blue around the time
// a certain rubber boy sets sail in the East Blue: the Ohara Incident was 20
// years ago, the God Valley Incident 36, the fall of Esperia 60.
import './bossMoves.js';
import { spawnNow, findActor, aggro, seaBoss, despawn } from './helpers.js';
import { makeEnemy } from '../game/npcs.js';

const active = (ctx, id, stage) => ctx.game.quests.stageId(id) === stage;
const done = (ctx, id) => ctx.game.quests.isDone(id);
const stg = (g, id) => g.quests.stageId(id);
const mk = (g, id, startable, reportStage) => (!g.quests.state(id) ? (startable ? '!' : null) : g.quests.stageId(id) === reportStage ? '?' : null);

/** Spawn archetype enemies right now around (x, y), registered with the current island. */
function spawnGroupAt(game, x, y, enemies, radius = 4) {
  const out = [];
  const list = game.currentIsland ? game.spawner.populated.get(game.currentIsland.id) : null;
  for (const [arch, lvl, over] of enemies) {
    const p = game.spawner.findFree(x, y, radius) || { x, y };
    const a = makeEnemy(arch, lvl, p.x, p.y, over || {});
    a.game = game;
    game.addActor(a);
    if (list) list.push(a);
    out.push(a);
  }
  return out;
}
/** Spawn a group at an island spot if that island is loaded. */
function spawnAtSpot(game, islandId, spotId, enemies, radius) {
  if (!game.spawner.populated.has(islandId)) return [];
  const isl = game.surface.islands.find((i) => i.id === islandId);
  const s = isl?.spots?.[spotId];
  return s ? spawnGroupAt(game, s.x, s.y, enemies, radius) : [];
}
function spawnAndAggro(game, id) {
  const a = findActor(game, id) || spawnNow(game, id);
  if (a) aggro(game, a);
  return a;
}

// ------------------------------------------------------------------ NPCs
const npcs = [
  // ================================================================ OHARA
  {
    id: 'wb_alfalfa', name: 'Professor Alfalfa', title: "Elder of the Scholars' Camp", island: 'ohara', at: { town: 'ohara_camp', building: "Professor Alfalfa's Hut" },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#5d4037', bottom: '#4e342e', coat: '#33691e', hairColor: '#eceff1' }, level: 12, trainer: 'wb_ohara_elder',
    marker: (c, g) => mk(g, 'wb_ohara_primer', true, 'report'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'wb_ohara_primer')) return '"You can read them now. The scholars of Ohara died so that one more pair of eyes could. Use them well — and never, ever tell the Government who taught you."';
            if (active(ctx, 'wb_ohara_primer', 'report')) return '"You read it. I can see it on your face — the same look the Professor had. Sit, sit. Tell me what the stone said."';
            if (active(ctx, 'wb_ohara_primer', 'watchers')) return '"Cipher Pol! They must have followed the smoke of our cooking fires. The primer is almost finished — keep them away from the tents!"';
            return '"An island that is on no map, and yet here you stand. ...I was Professor Clover\'s student. I was lecturing abroad the week the Buster Call came. Twenty years I have lived with that."';
          },
          choices: [
            { text: 'What are you studying here?', if: () => !ctx.quest('wb_ohara_primer'), next: 'secret' },
            { text: 'The stone speaks of a great kingdom.', if: () => active(ctx, 'wb_ohara_primer', 'report'), next: 'done' },
            { text: 'Teach me to listen (training).', do: (c) => c.open('trainer', { trainer: 'wb_ohara_elder' }) },
            { text: 'What was Professor Clover like?', next: 'clover' },
            { text: 'Farewell, Professor.', end: true },
          ],
        },
        secret: { text: '"The Government forbids one thing above all others: reading the Poneglyphs. Professor Clover could. So could the others. When the Tree burned, they threw the books into the lake — and a few months later giants came and hauled every book away. But pages tear loose. Pages drift."', next: 'secret2' },
        secret2: {
          text: '"Give me three good pages of the Professor\'s notes — one from the Lake of Books, one from inside the husk of the Tree, and the one that old vulture Kanezenny fished up on Passage Island to the northeast — and I can rebuild his primer. Will you help an old man finish his teacher\'s work?"',
          choices: [{ text: 'I\'ll find the pages.', do: (c) => c.startQuest('wb_ohara_primer'), end: true }, { text: 'Reading them is a death sentence. No.', end: true }],
        },
        clover: { text: '"Hair like a three-leaf clover and a laugh you could hear across the lake. In his youth he was arrested by the Marines more times than anyone could count. At the end he stood before the Five Elders and began to tell them what the Void Century really was. They shot him before he could finish."', next: 'a' },
        done: { text: '"A great kingdom... yes. That was as far as the Professor got. Keep the primer hidden. And if you ever find the stones the Professor never saw — read them for him."', onEnter: (c) => c.complete('wb_ohara_primer') },
      },
    }),
  },
  {
    id: 'wb_sorrel', name: 'Sorrel', title: 'Apprentice archaeologist', island: 'ohara', at: { town: 'ohara_camp', building: 'The Reading Tent' }, race: 'three_eye',
    look: { hair: 'ponytail', hairColor: '#8d6e63', top: '#ffcc80', bottom: '#5d4037', skin: '#f9dcc4' }, level: 7,
    recruit: {
      role: 'archaeologist', fighter: false, requires: (c, g) => g.quests.isDone('wb_ohara_primer'),
      pitch: '"The Professor says a scholar who never leaves the library only knows half of history. The other half is out there, carved in stone. Take me with you — I can read what you can\'t, and I can copy what you can."',
    },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => ctx.game.quests.isDone('wb_ohara_primer')
            ? '"You helped finish the primer! Do you know what that means? Somewhere out there are stones nobody has read for eight hundred years."'
            : '"(The girl\'s third eye blinks at you, a moment after the other two.) Sorry — it does that. The Professor says the Three-Eye Tribe can learn to hear the Voice of All Things. So far all I hear is the kettle."',
          choices: [{ text: 'What is this camp?', next: 'camp' }, { text: 'See you, Sorrel.', end: true }],
        },
        camp: { text: '"Scholars who were away when Ohara burned, and their children, and people like me who had nowhere else to go. We keep the memorial, we fish the lake, and we hide whenever a Marine ship passes. The Government says nobody lives here. So officially, I don\'t exist!"', next: 'a' },
      },
    }),
  },
  {
    id: 'wb_marigold', name: 'Marigold', title: 'Keeper of the Memorial', island: 'ohara', at: { spot: 'memorial' },
    look: { hair: 'bun', hairColor: '#9e9e9e', top: '#7986cb', bottom: '#3949ab', skin: '#e0ac7e' }, level: 4,
    marker: (c, g) => mk(g, 'wb_ohara_echoes', true, 'report'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'wb_ohara_echoes')) return '"Now you know what happened here. That is all the dead ever ask of the living: that someone knows."';
            if (active(ctx, 'wb_ohara_echoes', 'report')) return '"You walked the whole island. ...Then you\'ve seen it. Twenty years ago it took one afternoon."';
            return '"I sold fish in Ohara\'s market when I was a girl. I was out at sea the day the smoke went up. This memorial? A tall scientist with a strange head built it, some months after. And a man in a hooded cloak stood here for a long time, then left without a word."';
          },
          choices: [
            { text: 'Tell me what happened here.', if: () => !ctx.quest('wb_ohara_echoes'), next: 'ask' },
            { text: 'I\'ve walked the island.', if: () => active(ctx, 'wb_ohara_echoes', 'report'), do: (c) => c.complete('wb_ohara_echoes'), next: 'a' },
            { text: 'Goodbye.', end: true },
          ],
        },
        ask: {
          text: '"Don\'t take it from me. Walk it. Start at the west beach, where a giant washed ashore. Then the husk of the Tree, the Lake of Books, the wreck on the south shore — and the north-east beach, where the ice began. Then come back and tell me you understand."',
          choices: [{ text: 'I\'ll walk it.', do: (c) => c.startQuest('wb_ohara_echoes'), end: true }, { text: 'Some other time.', end: true }],
        },
      },
    }),
  },
  {
    id: 'wb_wanze', name: 'Wanze', title: 'CP7 agent, Ramen Kenpo master', island: 'ohara', at: { spot: 'camp_edge' }, hostile: true, boss: true, hpMul: 1.0,
    look: { hair: 'afro', hairColor: '#fafafa', skin: '#f1c9a0', top: '#212121', bottom: '#212121', belt: '#c62828', goggles: true, grin: true }, level: 13, faction: 'cp',
    style: 'brawler', moves: ['wb_ramen_beam', 'wb_fire_skate', 'wb_ramen_suit', 'wb_poison_knife'], lethal: false, skill: 0.45, breakthrough: 3, reward: 8000,
    alert: 'Hwahaha! Ramen Kenpo! The Government ordered noodles — and YOU are the delivery!',
    barks: ['Ramen Beam!', 'Alloy flour — hard as steel!', 'The World Government never forgets an address!'],
    phases: [{ at: 0.45, run: (a, g) => { g.fx.text(a.x, a.y - 2.4, "MEN'S FORMAL SUIT!", '#fff59d', 0.5); a.addBuff({ id: 'wb_ramen_rage', name: 'Ramen Armour', dur: 30, mods: { defMul: 0.75, damage: 1.2 } }); } }],
    when: (c, g) => g.quests.stageId('wb_ohara_primer') === 'watchers',
  },

  // ======================================================== PASSAGE ISLAND
  {
    id: 'wb_kanezenny', name: 'Kanezenny', title: 'Farmer of Passage Island', island: 'passage_isle', at: { town: 'wb_passage_port', building: "Kanezenny's Farmhouse" },
    look: { hair: 'ponytail', hairColor: '#9e9e9e', skin: '#e0ac7e', top: '#9575cd', bottom: '#7e57c2', coat: '#6d4c41', nose: 'long' }, level: 4,
    marker: (c, g) => (g.quests.stageId('wb_ohara_primer') === 'pages' && !c.flags.wbPageKanezenny ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Hmph. Another one sniffing around for Ohara? Twenty years ago I took in a little girl from that island. Fed her, worked her, treated her like my own! And when I did my duty and called the Government, their agents never paid me one single berry. Seventy-nine million, and not a berry!"',
          choices: [
            { text: 'I\'m looking for a page from Ohara.', if: () => active(ctx, 'wb_ohara_primer', 'pages') && !ctx.flag('wbPageKanezenny'), next: 'page' },
            { text: 'What happened to the girl?', next: 'girl' },
            { text: 'Goodbye.', end: true },
          ],
        },
        girl: { text: '"Ran off in the night, the ungrateful brat! The Marines had already spotted her on the ferry — that\'s how they knew she\'d survived. Eight years old and wanted like a pirate captain. Serves her right for being born on Ohara."', next: 'a' },
        page: {
          text: '"The burnt paper? Washed up in my potato field. The Government men pay good money for anything from Ohara — to burn it. So it\'s worth something to you, too. Fifteen thousand berries."',
          choices: [
            { text: 'Pay ฿15,000.', do: (c) => { if (!c.pay(15000)) return 'poor'; c.give('wb_ohara_page', 1); c.setFlag('wbPageKanezenny'); return 'got'; } },
            { text: 'Trade her a jewel instead.', if: () => ctx.has('jewels'), do: (c) => { c.take('jewels', 1); c.give('wb_ohara_page', 1); c.setFlag('wbPageKanezenny'); return 'got'; } },
            { text: '(Stare her down.) "The Government will never pay you. Give me the page."', if: () => (ctx.char.attrs.wil || 0) >= 10, next: 'scared' },
            { text: 'Too expensive.', end: true },
          ],
        },
        poor: { text: '"No money, no page. Go dig in the mud like I did."', next: 'a' },
        got: { text: '"Pleasure doing business. ...That girl used to look at me the way you do. Right before she ran."' },
        scared: { text: '"Eek! Fine! Take the cursed thing! Nothing from Ohara ever brought anyone anything but trouble!" (She throws the page at your feet.)', onEnter: (c) => { c.give('wb_ohara_page', 1); c.setFlag('wbPageKanezenny'); } },
      },
    }),
  },
  {
    id: 'wb_ferryman', name: 'Old Ferryman', title: "Ferryman's Rest", island: 'passage_isle', at: { town: 'wb_passage_port', building: "Ferryman's Rest" },
    look: { hair: 'short', hairColor: '#bdbdbd', top: '#455a64', bottom: '#37474f', hat: 'captain', hatColor: '#37474f', skin: '#c68642' }, level: 3,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"I\'ve run the ferry off this island for thirty years. Twenty years ago I had a passenger — a little girl, alone, with eyes older than mine. Two days later the Marines came asking about her. I told them nothing. They found out anyway."',
          choices: [
            { text: 'Where is Ohara? It\'s on no chart.', next: 'where' },
            { text: 'Something to drink.', do: (c) => c.open('shop', { shop: 'tavern', building: { name: "Ferryman's Rest", role: 'bar' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
        where: {
          text: '"No, it isn\'t. The Government made sure. But the current doesn\'t read their charts. Sail south-west from here, a little over a day. You\'ll smell it before you see it — the ash is still in the soil." (He marks your chart.)',
          onEnter: (c) => {
            const g = c.game;
            const isl = g.surface?.islands?.find((i) => i.id === 'ohara');
            if (isl && g.surface.reveal) { g.surface.reveal(isl.x, isl.y, isl.radius + 10); g.renderer?.terrain?.updateFog?.(g.surface.fog); c.log('The ferryman marks Ohara on your chart (M).', '#ffe082'); }
          },
          next: 'a',
        },
      },
    }),
  },

  // ============================================================ GOD VALLEY
  {
    id: 'wb_coyote', name: 'Old Coyote', title: 'Last Rabbit of God Valley', island: 'god_valley', at: { spot: 'coyote_camp' },
    look: { hair: 'long', hairColor: '#bdbdbd', skin: '#a0643a', top: '#795548', bottom: '#5d4037', hat: 'cowboy', hatColor: '#8d6e63', scarEye: true }, level: 10,
    marker: (c, g) => mk(g, 'wb_god_valley', true, 'report'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'wb_god_valley')) return '"Proof. Real proof, in my hands. Let the Government say there never was a God Valley. I\'ll be here saying otherwise until the sea takes me too."';
            if (active(ctx, 'wb_god_valley', 'report')) return '"The beast in the ravine is dead? And you have them — the tag, the horn, the flag... Let me hold them. Just for a minute."';
            return '"Heh. You found the island that doesn\'t exist. Sit. Thirty-six years ago I was nine, and I lived down in the canyon town. Then the Celestial Dragons came for their game — the Native Hunting Competition. They painted a target on my back and called me a Rabbit."';
          },
          choices: [
            { text: 'What happened then?', if: () => !ctx.quest('wb_god_valley'), next: 'story' },
            { text: 'Here are your proofs.', if: () => active(ctx, 'wb_god_valley', 'report'), next: 'give' },
            { text: 'Goodbye, old man.', end: true },
          ],
        },
        story: { text: '"They gave us one hour to hide. Then the Nobles hunted us for points. ...Then pirates came — the Rocks Pirates — and a man named Roger, and a Marine named Garp, fighting side by side. The mountains broke. The ground broke. And God Valley went into the sea. The Government says there never was an island here."', next: 'ask' },
        ask: {
          text: '"I\'ve come back every year to bury what the sea gives back. Before I die I want proof: my sister\'s Rabbit tag from the old hunting grounds, a Noble\'s golden hunting horn from the drowned canyon town, and a scrap of Rocks\' flag from the wreck on the east shore."',
          choices: [{ text: 'I\'ll find your proof.', do: (c) => c.startQuest('wb_god_valley'), end: true }, { text: 'Let the dead rest.', end: true }],
        },
        give: {
          text: '"(His hands shake as he turns the Rabbit tag over.) Her name is still scratched on the back. ...Take this. The Nobles left more gold on this rock than they ever took home. None of it ever did me any good."',
          onEnter: (c) => { c.take('wb_rabbit_tag', 1); c.take('wb_noble_horn', 1); c.take('wb_rocks_flag', 1); c.complete('wb_god_valley'); },
        },
      },
    }),
  },

  // =============================================================== ESPERIA
  {
    id: 'wb_ottavio', name: 'Old Ottavio', title: 'Luthier of Cello Port', island: 'esperia', at: { town: 'esperia_town', building: "Instrument Makers' Guild" },
    look: { hair: 'short', hairColor: '#eceff1', skin: '#f1c9a0', top: '#8d6e63', bottom: '#4e342e', coat: '#a1887f' }, level: 3,
    marker: (c, g) => mk(g, 'wb_esperia_convoy', true, 'report'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'wb_esperia_convoy')) return '"The harp is safe, and the Moulons are gone. For the first time in sixty years someone fought for Esperia\'s music. The captain would have hummed a song about you."';
            if (active(ctx, 'wb_esperia_convoy', 'report')) return '"Don Moulon\'s son, beaten! In the Opera House, of all places — history does love to rhyme."';
            return '"Welcome to Cello Port. Sixty years ago every violin, cello and harp in the four seas carried an Esperian maker\'s mark. I was a boy when the mist came. I still remember the captain of the Battle Convoy, humming while he fought."';
          },
          choices: [
            { text: 'Tell me about the captain.', next: 'brook' },
            { text: 'What happened to Esperia?', next: 'fall' },
            { text: 'Something wrong in town?', if: () => !ctx.quest('wb_esperia_convoy'), next: 'moulon' },
            { text: 'The Moulon Family is finished.', if: () => active(ctx, 'wb_esperia_convoy', 'report'), do: (c) => c.complete('wb_esperia_convoy'), next: 'a' },
            { text: 'Browse the guild\'s wares.', do: (c) => c.open('shop', { shop: 'general', building: { name: "Instrument Makers' Guild", role: 'shop' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
        brook: { text: '"Tall as a mast, thin as a bow, with an afro like a thundercloud. He grew up in the trash dump with the stray dogs until the prince took him in. He could cut a man down and finish the melody before the man fell. Then he went to sea. Some songs don\'t end, they say."', next: 'a' },
        fall: { text: '"A mist sat on the island for six months. The instruments rotted, the sickness took hundreds — even Queen Candelle. We couldn\'t pay the Heavenly Tribute, so the Government demanded a thousand slaves instead. King Reuven refused. Then came the war, and then... nothing."', next: 'a' },
        moulon: {
          text: '"The Moulon Family. Seventy years ago their Don tried to carry off Queen Candelle from the Opera House — the captain sent them all running. Now old Moulon\'s son is back with his gunmen, stripping the Opera House ruins to sell our instruments to collectors. The last Esperian concert harp is still in there."',
          choices: [{ text: 'I\'ll run them off.', do: (c) => c.startQuest('wb_esperia_convoy'), end: true }, { text: 'Not my fight.', end: true }],
        },
      },
    }),
  },
  {
    // (the chapter in Esperia promises a crewmate who can keep up with you once the convoy is safe)
    id: 'wb_chiara', name: 'Chiara', title: 'Violinist of Cello Port', island: 'esperia', at: { town: 'esperia_town', door: "Instrument Makers' Guild", ox: -1.8 },
    look: { hair: 'long', hairColor: '#4e342e', skin: '#e0ac7e', top: '#7b1fa2', bottom: '#263238', coat: '#311b92', fem: true, swords: 1 }, level: 8, style: 'ittoryu', weapon: 'sword',
    recruit: {
      role: 'musician', requires: (c, g) => g.quests.isDone('wb_esperia_convoy'),
      intro: `"Chiara, granddaughter of Ottavio of the Instrument Makers' Guild. Violin first, rapier second — Grandfather says it should be the other way round, but he's never heard me play."`,
      pitch: {
        pirate: `"Grandfather says the captain of the Battle Convoy hummed while he fought, and finished his song with the last gunman down. I've been practising both since I was six. ...Take me to sea. I'll keep your crew on its feet — and your enemies busy."`,
        marine: `"A Marine who protects convoys — Grandfather would approve. Take me aboard your ship. I'll play your crew through every watch and fight beside them when the music stops. I'll even learn the salute."`,
        hunter: `"You hunt the people who rob convoys like ours. Take me along, partner — I'll keep your spirits up and your enemies busy. Grandfather says I'm a terrible influence on bandits."`,
        free: `"Grandfather says the captain of the Battle Convoy hummed while he fought, and finished his song with the last gunman down. I've been practising both since I was six. ...Take me to sea."`,
      },
      again: `"You came back! Wait — let me get my violin. And my other violin. And Grandfather's blessing. ...Two out of three."`,
      declined: `"Oh. Well — Cello Port is lovely in the spring. I'll be by the Guild, practising. Louder than before."`,
      aboard: [`(A few bars of something fast drift across the deck.)`, `"A ship without a song is just wood on water."`, `"Grandfather would hate this tune. That's why I love it."`],
    },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'wb_esperia_convoy')
            ? `"The Moulon Family ran from the Opera House — Grandfather is still laughing about it." (She tucks her violin under her chin and plays three bars of something fast.) "Cello Port is lovely. It's also very, very small."`
            : `"Old Ottavio is my grandfather. He won't say it, but the Moulon Family are bleeding the Guild dry — they took the Opera House's instruments too." (She rests a hand on the rapier at her hip.) "If I were a little older, I'd go in there myself."`),
          choices: [{ text: 'Goodbye.', end: true }],
        },
      },
    }),
  },
  {
    id: 'wb_moulon_jr', name: 'Don Moulon II', title: 'Boss of the Moulon Family', island: 'esperia', at: { spot: 'opera_house' }, hostile: true, boss: true, hpMul: 0.9,
    look: { hair: 'short', hairColor: '#212121', skin: '#e0ac7e', top: '#4a148c', bottom: '#212121', coat: '#212121', hat: 'cowboy', hatColor: '#212121', bulk: 1.2 }, level: 10,
    faction: 'bandit', style: 'sniper', weapon: 'gun', ranged: true, prefRange: 5, moves: ['wb_violin_case', 'snipe_explode'], skill: 0.35, breakthrough: 2, reward: 5000,
    alert: 'My father wanted the Queen. I only want her harp. Is that so much to ask?',
    barks: ['The Moulon Family finishes what it starts!', 'Music is money, friend.'],
    when: (c, g) => g.quests.stageId('wb_esperia_convoy') === 'opera',
  },

  // ================================================================= KANO
  {
    id: 'wb_chinjao', name: 'Don Chinjao', title: 'Retired 12th Leader of the Happo Navy', island: 'kano_country', at: { town: 'kano_town', building: 'Chinjao Family Hall' },
    look: { hair: 'bald', skin: '#e0ac7e', top: '#a5d6a7', bottom: '#c9a227', hairColor: '#fafafa' }, bulk: 1.6, scale: 1.6, level: 60, trainer: 'chinjao_master', ai: 'idle',
    marker: (c, g) => mk(g, 'wb_hasshoken_trials', true, 'report'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'wb_hasshoken_trials')) return '"Hiyahoho! My grandsons tell me you rang the Bell of the Eight Impacts. The Hasshoken lives in your bones now. Come — show an old man your fist."';
            if (active(ctx, 'wb_hasshoken_trials', 'report')) return '"Boo on his back, the Bell ringing across the spires, and Sai beaten in his own hall... Hiyahoho! Kneel."';
            return '"Hiyahoho. A traveller in the hall of the Chinjao Family. You are looking at my head, aren\'t you? Everyone does. Once it was a drill that could split the Ice Continent. Then Garp — MONKEY D. GARP — punched it flat. I have not forgotten."';
          },
          choices: [
            { text: 'Teach me the Hasshoken.', do: (c) => c.open('trainer', { trainer: 'chinjao_master' }) },
            { text: 'How do I prove myself to the Chinjao Family?', if: () => !ctx.quest('wb_hasshoken_trials'), next: 'trial' },
            { text: 'I have passed the three trials.', if: () => active(ctx, 'wb_hasshoken_trials', 'report'), next: 'master' },
            { text: 'Tell me about Garp.', next: 'garp' },
            { text: 'Farewell, Don.', end: true },
          ],
        },
        trial: {
          text: '"The Hasshoken is not sold to tourists. Three trials. Beat my grandson Boo at the training ground among the spires. Ring the Bell of the Eight Impacts with your bare hands. Then face Sai, thirteenth leader of the Happo Navy, in a spar at his headquarters."',
          choices: [{ text: 'I accept the trials.', do: (c) => c.startQuest('wb_hasshoken_trials'), end: true }, { text: 'Maybe later.', end: true }],
        },
        garp: { text: '"Garp and I fought for years — my head against his fist. He destroyed eight mountains training for our last battle. One punch, and my head, my pride, and the treasure I sealed under the Ice Continent were all lost. Five hundred and forty-two million berries on my head, and one punch. If that man ever has grandchildren, they had better never sail into my waters. Hiyahoho."', next: 'a' },
        master: { text: '"Then kneel. From today, the Chinjao Family will call you a student of the Eight Impacts. The mantle is Happo Navy green — wear it where the Marines can see."', onEnter: (c) => c.complete('wb_hasshoken_trials') },
      },
    }),
  },
  {
    id: 'wb_boo', name: 'Boo', title: 'Lieutenant of the Happo Navy', island: 'kano_country', at: { spot: 'trial_ground' },
    look: { hair: 'ponytail', hairColor: '#ff9800', skin: '#f1c9a0', top: '#33691e', bottom: '#4a148c', coat: '#33691e' }, level: 12, faction: 'rival', named: true, lethal: false,
    style: 'hasshoken', moves: ['wb_boo_elbow', 'hassho_bushin'], skill: 0.4,
    alert: 'You wanted a trial? Here it comes!',
    marker: (c, g) => (g.quests.stageId('wb_hasshoken_trials') === 'boo' ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => ctx.char.defeated.wb_boo ? '"Heh... your punches rattle. Good. Now go ring the Bell up between the spires — if your arms still work."' : '"Oi. You want to learn the Hasshoken? Then you go through me first. The trial ground is right here, and I\'ve been waiting all morning."',
          choices: [
            { text: 'Let\'s fight, Boo.', if: () => active(ctx, 'wb_hasshoken_trials', 'boo'), do: (c) => aggro(c.game, findActor(c.game, 'wb_boo')), end: true },
            { text: 'Later.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'wb_sai', name: 'Sai', title: '13th Leader of the Happo Navy', island: 'kano_country', at: { town: 'wb_happo_harbor', building: 'Happo Navy Headquarters' },
    look: { hair: 'spiky', hairColor: '#6d4c41', skin: '#f1c9a0', top: '#2e7d32', coat: '#2e7d32', bottom: '#1565c0' }, level: 18, trainer: 'wb_sai',
    marker: (c, g) => (g.quests.stageId('wb_hasshoken_trials') === 'sai' ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => active(ctx, 'wb_hasshoken_trials', 'sai')
            ? '"Kakakaka! So you rang the Bell. Grandfather sent you? No need! There\'s no need for— ...fine. FINE! Spar with me, then. Choose "Spar" when you\'re ready."'
            : '"Kakakaka! A visitor at the Happo Navy\'s headquarters. A thousand sailors, eight ships, and the Happosai with her tiger\'s head. Want to learn a real kick? The Hasshoken lives in the heel, not the fist."',
          choices: [
            { text: 'Train / spar with Sai', do: (c) => c.open('trainer', { trainer: 'wb_sai' }) },
            { text: 'I hear you\'re engaged...', next: 'uho' },
            { text: 'Goodbye.', end: true },
          ],
        },
        uho: { text: '"Uholisia of the Niho Navy?! It\'s an ARRANGED marriage! Grandfather arranged it! An alliance between navies! There is no need for you to bring it up! NO NEED AT ALL!"', next: 'a' },
      },
    }),
  },
  {
    id: 'wb_ramen', name: 'King Ramen', title: 'King of Kano Country', island: 'kano_country', at: { town: 'kano_town', building: 'Palace of King Ramen' },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#2e7d32', bottom: '#1b5e20', hat: 'crown', hatColor: '#212121' }, level: 9,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Welcome to the Country of Flowers. Our enemies across the sea are suddenly armed with guns far beyond their means — somebody in the Grand Line sells war to anyone who pays. One day I will send the Chinjao Family to find out who."',
          choices: [{ text: 'What of the Levely?', next: 'lev' }, { text: 'Farewell, Your Majesty.', end: true }],
        },
        lev: { text: '"Every four years fifty kings gather at Mary Geoise and pretend to be friends. Kano is small. So we make big friends and bigger enemies. Such is politics."', next: 'a' },
      },
    }),
  },
  {
    id: 'wb_uholisia', name: 'Uholisia', title: 'Daughter of the Niho Navy\'s leader', island: 'kano_country', at: { town: 'wb_happo_harbor', plaza: true, ox: 3 },
    look: { hair: 'curly', hairColor: '#fff176', skin: '#f1c9a0', top: '#42a5f5', bottom: '#f48fb1', bulk: 1.5 }, bulk: 1.5, scale: 1.3, level: 16,
    dialogue: () => ({
      start: 'a',
      nodes: { a: { text: '"My father, Chichilisia, and Don Chinjao have arranged for me to marry Sai. An alliance of navies! A woman must think of her nation. ...If that boy ever tries to break it off, I will personally rearrange his face."' } },
    }),
  },

  // ================================================================ TOROA
  {
    id: 'wb_byron', name: 'Byron', title: 'Musician of Toroa', island: 'toroa', at: { town: 'toroa_town', building: 'Toroa Music Hall' },
    look: { hair: 'long', hairColor: '#f2d16b', skin: '#f1c9a0', top: '#c62828', coat: '#263238', bottom: '#6d4c41', scarEye: true }, level: 9,
    marker: (c, g) => mk(g, 'wb_toroa_slavers', true, 'report'),
    recruit: {
      role: 'musician', fighter: false, requires: (c, g) => g.quests.isDone('wb_toroa_slavers'),
      intro: '"Byron, of the musicians of Toroa — my family has played in this hall for longer than anyone remembers. I can make any string sing, and I make a red wine that makes grown sailors weep."',
      pitch: {
        pirate: '"Toroa is too small for the songs I want to write. If you\'re sailing for the Grand Line, you\'ll need someone to play while the storms try to drown you. I\'m your musician — and I\'m bringing the wine."',
        marine: '"The Navy has marching bands. Dreadful things. Let me show your ship\'s company what music is for — I\'ll play them through every storm the Grand Line throws at you, officer. And I\'m bringing the wine."',
        hunter: '"Hunting pirates sounds like a fine song. Let me write it as it happens — I\'ll play, you hunt, and every tavern from here to the Grand Line will know your name. Partners? I\'m bringing the wine."',
        free: '"Toroa is too small for the songs I want to write. If you\'re sailing for the Grand Line, you\'ll need someone to play while the storms try to drown you. I\'m your musician — and I\'m bringing the wine."',
      },
      again: '"You\'re back! I knew it. I\'d already written the verse where you come back."',
      declined: '"Ah well. A song without its ending is still a song. You know where the Music Hall is."',
      aboard: ['(A fiddle strikes up somewhere below deck.)', '"Wine\'s breathing, captain. So am I, thanks to you."', '"Every storm has a rhythm. You just have to find it."'],
    },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'wb_toroa_slavers')) return '"You saved my neck — and my fiddle. I owe you a song. I owe you a whole album."';
            if (active(ctx, 'wb_toroa_slavers', 'report')) return '"They\'re gone? The men with the nets? ...I thought I\'d be singing in a cage at Sabaody by next month."';
            return '"I come from a long line of musicians — my family has played in this hall for longer than anyone remembers. I can make any string sing, and I make a red wine that makes grown sailors weep. But I want to play where the Grand Line storms can hear me."';
          },
          choices: [
            { text: 'Strangers are asking about you.', if: () => !ctx.quest('wb_toroa_slavers'), next: 'warn' },
            { text: 'The slave hunters are beaten.', if: () => active(ctx, 'wb_toroa_slavers', 'report'), do: (c) => c.complete('wb_toroa_slavers'), next: 'a' },
            { text: 'Buy a bottle.', do: (c) => c.open('shop', { shop: 'wb_toroa_cellar', building: { name: 'The Cellar', role: 'bar' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
        warn: {
          text: '"Men with nets and very clean hands, yes. They asked what I play, how old I am, where my family comes from. One of them wrote it all down like a price list. They camp at the old cove past the vineyards, north-east of town."',
          choices: [{ text: 'I\'ll deal with them.', do: (c) => c.startQuest('wb_toroa_slavers'), end: true }, { text: 'Be careful.', end: true }],
        },
      },
    }),
  },
  {
    id: 'wb_gaff', name: 'Gaff the Net-Caster', title: 'Slave hunter for the Sabaody human shops', island: 'toroa', at: { spot: 'vineyard_cove' }, hostile: true, boss: true, hpMul: 0.8,
    look: { hair: 'short', hairColor: '#424242', skin: '#e0ac7e', top: '#5d4037', bottom: '#3e2723', hat: 'tricorne', hatColor: '#3e2723', hand: '#90a4ae' }, level: 9,
    faction: 'bandit', style: 'sniper', weapon: 'gun', ranged: true, prefRange: 5, moves: ['wb_slaver_net', 'snipe_explode'], skill: 0.3, breakthrough: 2, reward: 6000,
    alert: '"A musician from a long line of musicians" — they pay double at Sabaody for a pedigree!',
    barks: ['Don\'t bruise the merchandise!', 'A fighter goes for seven hundred thousand. What are YOU worth?'],
    when: (c, g) => g.quests.stageId('wb_toroa_slavers') === 'slavers',
  },

  // ================================================================= SOJA
  {
    id: 'wb_issho', name: 'Issho', title: 'Blind bodyguard of the Twin Snakes', island: 'soja_island', at: { town: 'soja_village', building: 'Twin Snakes Gambling House', ox: 2.6 },
    look: { hair: 'short', hairColor: '#212121', skin: '#c68642', top: '#9575cd', bottom: '#512da8', scarEye: true }, level: 100, fixedPower: 99999, ai: 'idle',
    marker: (c, g) => (g.quests.stageId('wb_bege_job') === 'issho' && c.inventory.some((i) => i.id === 'wb_loaded_dice') ? '?' : null),
    when: (c) => !c.flags.wbIsshoLeft,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"...Hm? A new face. Forgive me — I can\'t see it. I lost every coin I owned at the tables in there, so now I stand at this door until the house says my debt is paid. The dice are an honest teacher... usually."',
          choices: [
            { text: 'Play chō-han with him (฿1,000).', next: 'dice' },
            { text: 'The house\'s dice are loaded.', if: () => active(ctx, 'wb_bege_job', 'issho') && ctx.has('wb_loaded_dice'), next: 'truth' },
            { text: 'Why do you stay?', next: 'why' },
            { text: 'Goodbye.', end: true },
          ],
        },
        dice: {
          text: '"(He rattles two dice in a cup and slaps it on the step.) Chō — even. Han — odd. Call it."',
          choices: [
            { text: 'Chō! (even)', do: (c) => rollDice(c, true) },
            { text: 'Han! (odd)', do: (c) => rollDice(c, false) },
            { text: 'I\'ll pass.', next: 'a' },
          ],
        },
        win: { text: () => `(${ctx.char.flags.wbLastRoll || 'The dice'}.) "Heh heh. Fortune smiles on you today, friend." (+฿2,000)`, next: 'dice' },
        lose: { text: () => `(${ctx.char.flags.wbLastRoll || 'The dice'}.) "Ah... the dice don't care what we want. That's what I like about them."`, next: 'dice' },
        broke: { text: '"Heh. Your purse sounds lighter than my cane. Another time."', next: 'a' },
        why: { text: '"A debt is a debt, even to a crooked house. ...Men from the World Government came asking about me last week. They said someone with my talents shouldn\'t waste them guarding gamblers. I told them I would think about it. Heh heh."', next: 'a' },
        truth: {
          text: '(Issho rolls the dice on the step. Six. Six. Six. Six.) "...The sound was always a little heavy. So the house cheated me from the first night. Then I owe them nothing." (He rises and takes up his cane.) "Thank you, friend. Whatever happens in there tonight — I won\'t be in the room."',
          onEnter: (c) => { c.setFlag('wbIsshoLeft'); c.log('Issho walks down toward the harbour, tapping his cane. (He is no longer guarding the Twin Snakes.)', '#b39ddb'); },
        },
      },
    }),
  },
  {
    id: 'wb_mamba', name: 'Don Mamba', title: 'Boss of the Twin Snakes Family', island: 'soja_island', at: { town: 'soja_village', building: 'Twin Snakes Gambling House' }, boss: true, hpMul: 1.15,
    look: { hair: 'short', hairColor: '#1b5e20', skin: '#e0ac7e', top: '#1b5e20', bottom: '#212121', coat: '#212121', hat: 'cowboy', hatColor: '#2e7d32', grin: true, sharpTeeth: true }, level: 15,
    faction: 'bandit', style: 'ittoryu', weapon: 'sword', moves: ['wb_twin_fangs', 'wb_snake_eyes', 'itto_iai'], skill: 0.45, breakthrough: 3, reward: 15000,
    alert: 'The house always wins. ALWAYS.',
    barks: ['Snake eyes!', 'Double or nothing, friend!'],
    when: (c) => !c.bosses.includes('wb_mamba'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Welcome to the Twin Snakes, friend. The house is fair, the drinks are cold, and my bodyguard is blind but never misses. One of the Five Families of the West, at your service. Care to lose some money?"',
          choices: [
            { text: 'A drink.', do: (c) => c.open('shop', { shop: 'tavern', building: { name: 'Twin Snakes Gambling House', role: 'bar' } }) },
            { text: 'Your bodyguard is gone, Mamba.', if: () => active(ctx, 'wb_bege_job', 'mamba'), do: (c) => aggro(c.game, findActor(c.game, 'wb_mamba')), end: true },
            { text: 'Goodbye.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'wb_croupier', name: 'Croupier Adder', title: 'Dealer of the Twin Snakes', island: 'soja_island', at: { spot: 'back_alley' }, named: true,
    look: { hair: 'short', hairColor: '#212121', skin: '#f1c9a0', top: '#fafafa', bottom: '#212121', coat: '#1b5e20' }, level: 8, faction: 'bandit', style: 'brawler', moves: ['brawl_knee'], skill: 0.3,
    marker: (c, g) => (g.quests.stageId('wb_bege_job') === 'dice' ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Tables open at dusk. I\'m on my break. Scram."',
          choices: [
            { text: 'Hand over the house dice.', if: () => active(ctx, 'wb_bege_job', 'dice'), do: (c) => aggro(c.game, findActor(c.game, 'wb_croupier')), end: true },
            { text: 'Sorry to bother you.', end: true },
          ],
        },
      },
    }),
  },

  // ============================================================= LAS CAMP
  {
    id: 'wb_bege', name: 'Capone "Gang" Bege', title: 'Boss of the Fire Tank Family', island: 'las_camp', at: { town: 'las_camp_town', building: 'Ristorante Castello' },
    look: { hair: 'short', hairColor: '#212121', skin: '#f1c9a0', top: '#37474f', bottom: '#37474f', coat: '#263238', hat: 'cowboy', hatColor: '#263238', nose: 'long' }, scale: 0.95, level: 21,
    boss: true, hpMul: 1.4, faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, prefRange: 6, moves: ['wb_castle_cannons', 'wb_garrison_volley', 'wb_tommy_gun'],
    skill: 0.55, breakthrough: 4, reward: 30000,
    alert: 'You have already lost... in sheer military force.',
    barks: ['Manners!', 'Castle Human — open the gates!', 'I only want the head. And the treasure.'],
    phases: [{ at: 0.5, run: (a, g) => {
      g.fx.text(a.x, a.y - 2.4, 'SHIRO SHIRO: GARRISON!', '#ffcc80', 0.5);
      a.addBuff({ id: 'wb_fortress', name: 'Fortress Body', dur: 40, mods: { defMul: 0.7 } });
      spawnGroupAt(g, a.x, a.y, [['wb_fire_tank', 12, { name: 'Fire Tank Soldier' }], ['wb_fire_tank', 12, { name: 'Fire Tank Soldier' }]], 3);
      g.log('Tiny soldiers pour out of the drawbridge on Bege\'s chest — and grow to full size!', '#ffcc80');
    } }],
    when: (c) => !c.bosses.includes('wb_bege') && !c.flags.wbBegeSailed,
    marker: (c, g) => (g.quests.stageId('wb_bege_job') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (active(ctx, 'wb_fire_tank_bust', 'bege')) return '"You\'ve been talking to Gordo. And you walked into my restaurant with mud on your boots. Two mistakes."';
            if (active(ctx, 'wb_bege_job', 'report')) return '"(Bege dabs his mouth with a napkin.) The Twin Snakes are hissing at each other already. I heard it from here."';
            return '"(Capone Bege dabs his mouth with a napkin.) Sit. Don\'t talk while I eat. ...Good. You have manners. In this sea there are Five Families. I don\'t want their turf. I want to watch them eat each other. It\'s the only entertainment left on land."';
          },
          choices: [
            { text: 'Got any work?', if: () => !ctx.quest('wb_bege_job') && !ctx.quest('wb_fire_tank_bust'), next: 'job' },
            { text: 'Don Mamba is finished.', if: () => active(ctx, 'wb_bege_job', 'report'), next: 'paid' },
            { text: 'Your family is done, Bege.', if: () => active(ctx, 'wb_fire_tank_bust', 'bege'), do: (c) => aggro(c.game, findActor(c.game, 'wb_bege')), end: true },
            { text: 'Excuse me.', end: true },
          ],
        },
        job: {
          text: '"Don Mamba runs the Twin Snakes on Soja Island, north of here. His blind bodyguard has cut down every man I sent. So: find out why a man like that guards a snake like Mamba, and make sure he is not in the room when it happens. Then Mamba\'s head is yours to take."',
          choices: [{ text: 'Consider it done.', do: (c) => c.startQuest('wb_bege_job'), end: true }, { text: 'I don\'t work for gangsters.', end: true }],
        },
        paid: {
          text: '"Mamba\'s head, Mamba\'s treasure — and now the Twin Snakes will bite each other to death over what\'s left. Beautiful. (He stands and puts on his coat.) ...And I\'m already bored. The Grand Line has captains with bigger heads. Vito! Gotti! We are going to sea."',
          onEnter: (c) => c.complete('wb_bege_job'),
        },
      },
      onClose: (c) => { if (c.flag('wbBegeSailed')) despawn(c.game, 'wb_bege'); },
    }),
  },
  {
    id: 'wb_vito', name: '"Monster Gun" Vito', title: 'Advisor of the Fire Tank Family', island: 'las_camp', at: { town: 'las_camp_town', building: 'Fire Tank Social Club' },
    look: { hair: 'short', hairColor: '#212121', skin: '#ffe0b2', top: '#ad1457', bottom: '#ad1457', coat: '#212121', grin: true }, scale: 1.2, level: 15,
    boss: true, hpMul: 1.1, faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, prefRange: 6, moves: ['wb_monster_guns', 'snipe_explode'], skill: 0.5, breakthrough: 3, reward: 8000,
    alert: 'The boss says you have no manners. I say you have no future.',
    barks: ['Two guns, no misses.', 'Bang. You\'re family now — dead family.'],
    when: (c) => !c.bosses.includes('wb_vito') && !c.flags.wbBegeSailed,
    marker: (c, g) => (g.quests.stageId('wb_fire_tank_bust') === 'vito' ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"(A tall man with a long, curling tongue and two enormous revolvers smiles at you.) The Social Club is for family. You family? ...No? Then have one drink on the house, and leave the way you came."',
          choices: [
            { text: 'One drink, then.', do: (c) => c.open('shop', { shop: 'tavern', building: { name: 'Fire Tank Social Club', role: 'bar' } }) },
            { text: 'Your family is finished, Vito.', if: () => active(ctx, 'wb_fire_tank_bust', 'vito'), do: (c) => aggro(c.game, findActor(c.game, 'wb_vito')), end: true },
            { text: 'I\'ll leave.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'wb_gotti', name: '"Hit Man" Gotti', title: 'Assassin of the Fire Tank Family', island: 'las_camp', at: { town: 'las_camp_town', plaza: true, ox: 4 },
    look: { hair: 'mohawk', hairColor: '#b39ddb', skin: '#e0ac7e', top: '#fafafa', bottom: '#212121', coat: '#2e7d32', belt: '#c62828' }, bulk: 1.5, scale: 1.45, level: 17,
    boss: true, hpMul: 1.3, faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, prefRange: 5, moves: ['wb_hitman_gatling', 'brawl_tackle'], skill: 0.45, breakthrough: 3, reward: 8000,
    alert: '...',
    barks: ['...', 'Boss said no witnesses.'],
    when: (c) => !c.bosses.includes('wb_gotti') && !c.flags.wbBegeSailed,
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"..." (A giant in a white suit and a green cape watches you without blinking. The Fire Tank crest is stamped on his shoulder plate.)' } } }),
  },
  {
    id: 'wb_gordo', name: 'Commissioner Gordo', title: 'Las Camp Police', island: 'las_camp', at: { town: 'las_camp_town', building: 'Police Headquarters' },
    look: { hair: 'short', hairColor: '#795548', skin: '#e0ac7e', top: '#1a237e', bottom: '#1a237e', hat: 'captain', hatColor: '#1a237e' }, bulk: 1.3, level: 10,
    marker: (c, g) => (!g.quests.state('wb_fire_tank_bust') && !g.quests.state('wb_bege_job') && !c.flags.wbBegeSailed ? '!' : g.quests.stageId('wb_fire_tank_bust') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => done(ctx, 'wb_fire_tank_bust')
            ? '"Capone Bege, behind bars — or at least flat on his back. The other families are already fighting over the scraps, but that\'s tomorrow\'s problem. Today, Las Camp owes you."'
            : '"Commissioner Gordo, Las Camp police. Half my men are on the Families\' payroll and the other half are scared of them. The Fire Tank Family is the worst: Bege has already taken the heads of three bosses."',
          choices: [
            { text: 'Bounty office.', do: (c) => c.open('bounty', {}) },
            { text: 'I\'ll take down the Fire Tank Family.', if: () => !ctx.quest('wb_fire_tank_bust') && !ctx.quest('wb_bege_job') && !ctx.flag('wbBegeSailed'), next: 'bust' },
            { text: 'The Fire Tank Family is finished.', if: () => active(ctx, 'wb_fire_tank_bust', 'report'), do: (c) => c.complete('wb_fire_tank_bust'), next: 'a' },
            { text: 'Tell me about the Demon Sheriff.', next: 'laffitte' },
            { text: 'Goodbye.', end: true },
          ],
        },
        bust: {
          text: '"You\'re serious. ...Start with Vito at the Social Club — he\'s the brains. Then Gotti, the giant who stands in the plaza. Then Bege himself, at his restaurant. Careful: that little man has an army inside him. I mean that literally."',
          choices: [{ text: 'I\'ll do it.', do: (c) => c.startQuest('wb_fire_tank_bust'), end: true }, { text: 'On second thought...', end: true }],
        },
        laffitte: { text: '"Laffitte. Tall, pale, a smile like a knife. He used to dance on a man\'s hands until they broke — for jaywalking. Even we couldn\'t stomach him, so we ran him out of the West Blue. Last I heard he went to the Grand Line. God help whoever hires him."', next: 'a' },
      },
    }),
  },
  {
    id: 'wb_raccoon', name: '"Pretended Sleep" Raccoon', title: 'Captain of the Raccoon Pirates', island: 'las_camp', at: { spot: 'raider_landing' }, hostile: true, boss: true, hpMul: 1.25,
    look: { hair: 'short', hairColor: '#795548', skin: '#e0ac7e', top: '#5d4037', bottom: '#3e2723', hat: 'tricorne', hatColor: '#4e342e', goggles: true }, level: 17,
    faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, prefRange: 5, moves: ['wb_possum_shot', 'snipe_explode', 'snipe_tabasco'], skill: 0.45,
    bounty: 75000000, infamy: true, breakthrough: 3,
    alert: 'Las Camp pays its taxes to ME now!',
    barks: ['Heh heh heh...', 'You call that a hit?'],
    phases: [{ at: 0.3, run: (a, g) => {
      g.fx.text(a.x, a.y - 2.2, '(He collapses... Zzz...)', '#b0bec5', 0.45);
      a.addBuff({ id: 'wb_playing_dead', name: 'Playing Dead', dur: 3.5, mods: { defMul: 0.08, speedMul: 0.02 } });
      a.addBuff({ id: 'wb_sneak', name: 'Sneak Attack', dur: 25, mods: { damage: 1.4, atkSpeed: 1.2 } });
      g.log('Raccoon crumples to the sand... and his finger is still on the trigger.', '#ffab91');
    } }],
    when: (c, g) => g.quests.stageId('wb_raccoon_raids') === 'raccoon',
  },

  // ====================================================== MARINE 80th BRANCH
  {
    id: 'wb_burdock', name: 'Captain Burdock', title: 'Commander of the Marine 80th Branch', island: 'marine_80th', at: { town: 'wb_marine_80th', building: '80th Branch HQ' },
    look: { hair: 'short', hairColor: '#5d4037', skin: '#e0ac7e', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE', hat: 'marine' }, level: 16, faction: 'marine',
    marker: (c, g) => mk(g, 'wb_raccoon_raids', !(c.bounty > 0 && c.faction !== 'marine'), 'report'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (ctx.char.bounty > 0 && ctx.char.faction !== 'marine') return '"A wanted pirate strolls into a Marine base and asks for a chat? You\'ve got nerve. I\'ll give you to the count of ten before my garrison remembers its job."';
            return done(ctx, 'wb_raccoon_raids')
              ? '"Raccoon in irons. Las Camp\'s fishermen will sleep tonight. If you ever tire of freelance justice, the 80th Branch has a desk for you."'
              : '"Captain Burdock, 80th Branch. Every rookie in the West Blue sails past my watchtower on the way to Reverse Mountain. Most of them are fools. Some of them are the Raccoon Pirates."';
          },
          choices: [
            { text: 'Enlist in the Marines.', if: () => ctx.char.faction !== 'marine', do: (c) => c.emit('marineEnlist', '80th Branch'), end: true },
            { text: 'Marine business.', if: () => ctx.char.faction === 'marine', do: (c) => c.emit('marineOffice', { name: '80th Branch HQ', role: 'marine_base' }), end: true },
            { text: 'The Raccoon Pirates?', if: () => !ctx.quest('wb_raccoon_raids') && !(ctx.char.bounty > 0 && ctx.char.faction !== 'marine'), next: 'raccoon' },
            { text: 'Raccoon is finished.', if: () => active(ctx, 'wb_raccoon_raids', 'report'), do: (c) => c.complete('wb_raccoon_raids'), next: 'a' },
            { text: 'Carry on, Captain.', end: true },
          ],
        },
        raccoon: {
          text: '"\'Pretended Sleep\' Raccoon. Seventy-five million berries. He raids Las Camp\'s south-east shore, and when you finally knock him down, he plays dead — then shoots you in the back. Break his raiding party and bring him down. The reward is yours, Marine or not."',
          choices: [{ text: 'I\'ll bring him in.', do: (c) => c.startQuest('wb_raccoon_raids'), end: true }, { text: 'Not today.', end: true }],
        },
      },
    }),
  },
  {
    id: 'wb_drill_instructor', name: 'Drill Sergeant Kelp', title: '80th Branch Drill Yard', island: 'marine_80th', at: { town: 'wb_marine_80th', building: 'Drill Yard' },
    look: { hair: 'buzz', hairColor: '#212121', skin: '#a0643a', top: '#fafafa', bottom: '#1b4f72', hat: 'marine' }, level: 14, faction: 'marine', trainer: 'marine_instructor',
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => ctx.char.faction === 'marine' ? '"On your feet, recruit! Justice needs strong legs! Soru! Again!"' : '"Civilians don\'t train in my yard. Enlist with the Captain first — then I\'ll make you cry."',
          choices: [{ text: 'Train', if: () => ctx.char.faction === 'marine', do: (c) => c.open('trainer', { trainer: 'marine_instructor' }) }, { text: 'Leave', end: true }],
        },
      },
    }),
  },

  // ================================================================ ILISIA
  {
    id: 'wb_lucas', name: 'King Thalassa Lucas', title: 'King of the Ilisia Kingdom', island: 'ilisia', at: { town: 'ilisia_town', building: 'Ilisia Palace' },
    look: { hair: 'short', hairColor: '#f2d16b', skin: '#f1c9a0', top: '#90caf9', bottom: '#90caf9', coat: '#e3f2fd', hat: 'crown', hatColor: '#ffd54f' }, level: 9,
    marker: (c, g) => mk(g, 'wb_ilisia_dragon', true, 'crown_report'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (active(ctx, 'wb_ilisia_dragon', 'crown_report')) return '"(The king puffs on his cigar.) So the cell is broken and the mink is in chains. Good. Dragon will send others. He always will. But today, Ilisia remains loyal — and so, it seems, do you."';
            if (done(ctx, 'wb_ilisia_dragon')) return ctx.flag('wbIlisiaRev') ? '"The refugees vanished from my harbour, and my Guard captain came back limping. I am not a fool. ...Leave my kingdom before I decide to be one."' : '"Ilisia does not forget its friends."';
            return '"(The king takes the cigar from his mouth.) Eight years ago I stood before the Levely and showed the kings of the world a photograph of a man named Monkey D. Dragon. I told them he would be a thorn in the Government\'s side within six years. They laughed. Nobody laughs now."';
          },
          choices: [
            { text: 'Is Ilisia in trouble?', if: () => !ctx.quest('wb_ilisia_dragon'), next: 'pamph' },
            { text: 'The revolutionary cell is broken.', if: () => active(ctx, 'wb_ilisia_dragon', 'crown_report'), do: (c) => { c.setFlag('wbIlisiaCrown'); c.complete('wb_ilisia_dragon'); }, next: 'a' },
            { text: 'Farewell, Your Majesty.', end: true },
          ],
        },
        pamph: {
          text: '"Pamphlets. \'The world is not what they tell you.\' They appear in my harbour every morning. Somewhere in Ilisia Harbor, Dragon\'s people are hiding — and hiding someone. Find them. Captain Gallardo of my Royal Guard will handle the rest."',
          choices: [{ text: 'I\'ll find them.', do: (c) => c.startQuest('wb_ilisia_dragon'), end: true }, { text: 'Politics isn\'t my business.', end: true }],
        },
      },
    }),
  },
  {
    id: 'wb_gallardo', name: 'Captain Gallardo', title: 'Captain of the Ilisia Royal Guard', island: 'ilisia', at: { town: 'ilisia_town', building: 'Royal Guard Barracks' },
    look: { hair: 'short', hairColor: '#3e2723', skin: '#e0ac7e', top: '#1565c0', bottom: '#fafafa', coat: '#0d47a1', hat: 'captain', hatColor: '#0d47a1', swords: 1 }, level: 15,
    when: (c, g) => g.quests.stageId('wb_ilisia_dragon') !== 'rev_fight',
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Captain Gallardo, Royal Guard. If you have business with the Crown, state it. If you have pamphlets, burn them."',
          choices: [
            { text: 'The revolutionaries hide in the smugglers\' cove.', if: () => active(ctx, 'wb_ilisia_dragon', 'choice'), next: 'turn' },
            { text: 'Nothing, Captain.', end: true },
          ],
        },
        turn: {
          text: '"The east cove! And a Revolutionary officer with them? The King will want him alive — or at least quiet. My men will seal the harbour. You go in first and take him down."',
          onEnter: (c) => { c.setFlag('wbIlisiaCrownPath'); c.stage('wb_ilisia_dragon', 'crown_fight'); },
        },
      },
    }),
  },
  {
    id: 'wb_gallardo_raid', name: 'Captain Gallardo', title: 'Captain of the Ilisia Royal Guard', island: 'ilisia', at: { spot: 'smugglers_cove' }, hostile: true, boss: true, hpMul: 1.1,
    look: { hair: 'short', hairColor: '#3e2723', skin: '#e0ac7e', top: '#1565c0', bottom: '#fafafa', coat: '#0d47a1', hat: 'captain', hatColor: '#0d47a1', swords: 1 }, level: 15,
    faction: 'rival', style: 'ittoryu', weapon: 'sword', moves: ['itto_iai', 'itto_whirl', 'itto_pound'], skill: 0.5, lethal: false, breakthrough: 3, reward: 6000,
    alert: 'In the name of King Lucas — every traitor in this cove is under arrest!',
    barks: ['For the Crown!', 'Ilisia is loyal!'],
    when: (c, g) => g.quests.stageId('wb_ilisia_dragon') === 'rev_fight',
  },
  {
    id: 'wb_refugee', name: 'Hanna', title: 'Refugee', island: 'ilisia', at: { town: 'wb_ilisia_harbor', building: 'Warehouse No. 8' },
    look: { hair: 'long', hairColor: '#6d4c41', skin: '#c68642', top: '#8d6e63', bottom: '#5d4037' }, level: 2,
    marker: (c, g) => (g.quests.stageId('wb_ilisia_dragon') === 'investigate' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => ctx.game.quests.isDone('wb_ilisia_dragon') ? '"(The warehouse is empty but for a child\'s shoe.)"' : '"(A woman steps between you and a pile of crates. Behind them, children are hiding.) Please. We\'re not criminals. Our kingdom couldn\'t pay the Heavenly Tribute... so the Government said they would take people instead."',
          choices: [
            { text: 'Who is helping you?', if: () => !ctx.game.quests.isDone('wb_ilisia_dragon'), next: 'who' },
            { text: 'I won\'t tell anyone.', end: true },
          ],
        },
        who: {
          text: '"A mink — a cow mink with a very long neck. He says he\'s from the Revolutionary Army\'s West Army. He hides boats in the smugglers\' cove on the east shore and takes a few of us out every night. Please don\'t tell the Guard."',
          onEnter: (c) => { if (!c.quest('wb_ilisia_dragon')) c.startQuest('wb_ilisia_dragon'); c.setFlag('wbIlisiaFound'); },
        },
      },
    }),
  },
  {
    id: 'wb_ushiano', name: 'Ushiano', title: 'Deputy Commander of the Revolutionary West Army', island: 'ilisia', at: { spot: 'smugglers_cove' }, race: 'mink', boss: true, hpMul: 1.25,
    look: { ears: 'round', fur: '#fafafa', skin: '#fafafa', hairColor: '#fafafa', hand: '#fafafa', muzzle: true, tail: 'thin', furFace: true, hair: 'bald', hat: 'horns', goggles: true, top: '#8d6e63', bottom: '#37474f' }, scale: 1.2, level: 19,
    faction: 'revolutionary', style: 'electro', moves: ['wb_horn_charge', 'elec_discharge', 'elec_garchu'], skill: 0.55, breakthrough: 4, lethal: false, reward: 10000,
    alert: 'You. King\'s dog. Then — fight.',
    barks: ['Freedom. Not for sale.', 'Revolution. Not word. Promise.'],
    when: (c, g) => !c.bosses.includes('wb_ushiano') && !g.quests.isDone('wb_ilisia_dragon'),
    marker: (c, g) => (g.quests.stageId('wb_ilisia_dragon') === 'rev_report' || g.quests.stageId('wb_ilisia_dragon') === 'choice' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (active(ctx, 'wb_ilisia_dragon', 'rev_report')) return '"Guard captain — down. Boats — gone. People — free." (Something like a smile crosses the long face.) "You. Good. Revolutionary Army — remembers."';
            if (active(ctx, 'wb_ilisia_dragon', 'crown_fight')) return '"You. Smell of palace. ...So. Choice made."';
            return '"(A cattle mink with a very long neck and an aviator\'s helmet looks you over.) You. Not Guard. Good. Revolutionary Army — West Army. These people — Tribute. Slaves. Not while I stand. You help? Or you tell King?"';
          },
          choices: [
            { text: 'I\'ll help you get them out.', if: () => !active(ctx, 'wb_ilisia_dragon', 'crown_fight') && !active(ctx, 'wb_ilisia_dragon', 'rev_report') && !active(ctx, 'wb_ilisia_dragon', 'rev_fight'), next: 'help' },
            { text: 'The King sends his regards.', if: () => active(ctx, 'wb_ilisia_dragon', 'crown_fight'), do: (c) => aggro(c.game, findActor(c.game, 'wb_ushiano')), end: true },
            { text: 'The way is clear. Go.', if: () => active(ctx, 'wb_ilisia_dragon', 'rev_report'), do: (c) => { c.setFlag('wbIlisiaRev'); c.complete('wb_ilisia_dragon'); }, end: true },
            { text: 'Leave.', end: true },
          ],
        },
        help: {
          text: '"Good. Last boats — tonight. But Guard knows. Captain Gallardo — coming. You hold him. I load boats." (He hurries toward the water.)',
          onEnter: (c) => { if (!c.quest('wb_ilisia_dragon')) c.startQuest('wb_ilisia_dragon'); c.setFlag('wbIlisiaFound'); c.stage('wb_ilisia_dragon', 'rev_fight'); },
        },
      },
    }),
  },

  // ============================================================= BALLYWOOD
  {
    id: 'wb_ham_burger', name: 'King Ham Burger', title: 'King of the Ballywood Kingdom', island: 'ballywood', at: { town: 'wb_ballywood_city', building: 'Palace of King Ham Burger' },
    look: { hair: 'short', hairColor: '#212121', skin: '#f1c9a0', top: '#212121', bottom: '#212121', hat: 'pinkhat', hatColor: '#1a237e' }, level: 8,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Welcome to Ballywood, where every waiter is an actor between roles. I am a slow man, traveller. I walk slowly — but I have never once turned around. One day I shall chair the Levely itself, and the kings of the world will learn patience."',
          choices: [{ text: 'Tell me about Victoria Cindry.', next: 'c' }, { text: 'Farewell, Your Majesty.', end: true }],
        },
        c: { text: '"The finest actress the West Blue ever produced — born a noble, and never once acted like one. She fell from the stage ten years ago. The whole kingdom wore black for a month. Madame Bernadette at the Grand Theater has never recovered."', next: 'a' },
      },
    }),
  },
  {
    id: 'wb_bernadette', name: 'Madame Bernadette', title: 'Stage manager of the Grand Theater', island: 'ballywood', at: { town: 'wb_ballywood_city', building: 'Ballywood Grand Theater' },
    look: { hair: 'bun', hairColor: '#b0bec5', skin: '#f9dcc4', top: '#6a1b9a', bottom: '#4a148c' }, level: 3,
    marker: (c, g) => mk(g, 'wb_ballywood_star', true, 'report'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'wb_ballywood_star')) return '"The Florian Triangle... If she is out there, I hope she is dancing. I hope she hates every minute of whatever that man made her into."';
            if (active(ctx, 'wb_ballywood_star', 'report')) return '"Well? You\'ve been to the cemetery and to that dreadful clinic. Tell me. I can take it. I was her stage manager for eleven years."';
            return '"Ten years ago, on this very stage, Victoria Cindry fell and never got up. The whole West Blue wept. And now the groundskeeper tells me her grave has been EMPTY for years — he was too frightened to say. Who steals a dead actress?"';
          },
          choices: [
            { text: 'I\'ll find out.', if: () => !ctx.quest('wb_ballywood_star'), do: (c) => c.startQuest('wb_ballywood_star'), end: true },
            { text: 'Hogback took her. He wrote "She will perform again."', if: () => active(ctx, 'wb_ballywood_star', 'report'), next: 'truth' },
            { text: 'Goodbye.', end: true },
          ],
        },
        truth: {
          text: '"Doctor Hogback? The genius surgeon? He sent her roses every night — she was engaged, she turned him down... and he vanished the same year she died. \'She will perform again.\' ...Take this playbill. She signed it for me on opening night. I cannot look at it anymore."',
          onEnter: (c) => c.complete('wb_ballywood_star'),
        },
      },
    }),
  },

  // =============================================================== ASSHINA
  {
    id: 'wb_colosseum_master', name: 'Master Marabou', title: 'Master of the Colosseum of the Long Stride', island: 'asshina', at: { town: 'asshina_town', building: 'Colosseum of the Long Stride' },
    look: { hair: 'bald', skin: '#e0ac7e', top: '#ffb300', bottom: '#5d4037', coat: '#6d4c41' }, level: 12,
    marker: (c, g) => mk(g, 'wb_asshina_colosseum', true, 'report'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'wb_asshina_colosseum')) return '"Champion! The sand still remembers your footprints. Come back whenever you want the crowd to scream your name."';
            if (active(ctx, 'wb_asshina_colosseum', 'report')) return '"SECRETARYBIRD SERENA IS DOWN! A new champion of the Long Stride! Come here, come here — the crowd wants to see your legs!"';
            return '"Welcome to the Asshina Gainone Kingdom, where we have kicked for a thousand years! In my Colosseum, anyone may fight: kicker, brawler — even a boxer from Notice, if he is brave enough to be booed. Four bouts to the championship!"';
          },
          choices: [
            { text: 'Sign me up.', if: () => !ctx.quest('wb_asshina_colosseum'), do: (c) => c.startQuest('wb_asshina_colosseum'), end: true },
            { text: 'Claim the championship.', if: () => active(ctx, 'wb_asshina_colosseum', 'report'), do: (c) => c.complete('wb_asshina_colosseum'), next: 'a' },
            { text: 'Why do the kickers and the boxers fight?', next: 'feud' },
            { text: 'Goodbye.', end: true },
          ],
        },
        feud: { text: '"Asshina kicks, Notice punches — more than a thousand years of feud, and nobody remembers how it started! ...Ha! Truly, it keeps the ticket sales up."', next: 'a' },
      },
    }),
  },
  {
    id: 'wb_stride_master', name: 'Stride Master Rhea', title: 'Stride Dojo', island: 'asshina', at: { town: 'asshina_town', building: 'Stride Dojo' }, trainer: 'wb_asshina_kicks',
    look: { hair: 'ponytail', hairColor: '#212121', skin: '#a0643a', top: '#fafafa', bottom: '#212121', belt: '#212121' }, level: 18,
    dialogue: () => ({
      start: 'a',
      nodes: { a: { text: '"A leg is a whip. The hip is the handle. Most humans kick like they are closing a door. Let me teach you to kick like you are opening one — with the whole house behind it."', choices: [{ text: 'Train at the Stride Dojo.', do: (c) => c.open('trainer', { trainer: 'wb_asshina_kicks' }) }, { text: 'Leave.', end: true }] } },
    }),
  },
  {
    id: 'wb_glad_stork', name: '"Stork Kick" Stavros', title: 'Gladiator', island: 'asshina', at: { spot: 'arena_sands' }, named: true, lethal: false,
    look: { hair: 'short', hairColor: '#fafafa', skin: '#f1c9a0', top: '#fafafa', bottom: '#212121' }, level: 7, faction: 'rival', style: 'brawler', moves: ['wb_whip_kick'], skill: 0.25,
    alert: 'First bout! The stork strikes!',
    when: (c, g) => !g.quests.isDone('wb_asshina_colosseum'),
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: () => ctx.char.defeated.wb_glad_stork ? '"Ow. Ow ow ow. Good kick. Next bout is Kira — she doesn\'t lose."' : '"I\'m the first bout! Everybody starts with me. Most people also end with me."', choices: [{ text: 'Fight!', if: () => active(ctx, 'wb_asshina_colosseum', 'stork'), do: (c) => aggro(c.game, findActor(c.game, 'wb_glad_stork')), end: true }, { text: 'Later.', end: true }] } } }),
  },
  {
    id: 'wb_glad_crane', name: '"Crane Stance" Kira', title: 'Gladiator', island: 'asshina', at: { spot: 'arena_sands' }, named: true, lethal: false,
    look: { hair: 'long', hairColor: '#e53935', skin: '#e0ac7e', top: '#fafafa', bottom: '#e53935' }, level: 9, faction: 'rival', style: 'brawler', moves: ['wb_whip_kick', 'brawl_knee'], skill: 0.35,
    alert: 'Stand on one leg, strike with the other!',
    recruit: {
      role: 'fighter', fighter: true, requires: (c, g) => g.quests.isDone('wb_asshina_colosseum'),
      pitch: '"You beat Serena. SERENA. I\'ve been kicking sand in this arena for six years waiting for someone worth following out of it. The Grand Line has fighters I\'ve never even heard of — take me with you!"',
    },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => ctx.game.quests.isDone('wb_asshina_colosseum') ? '"The champion! Every kid in town is practising your stance now."' : ctx.char.defeated.wb_glad_crane ? '"Tch. You got under my guard. Heron Blade Hector is next — watch his heels, they\'re sharpened."' : '"Crane Stance: one leg rooted, one leg free. You look like you use both of yours for walking. Cute."',
      choices: [{ text: 'Fight!', if: () => active(ctx, 'wb_asshina_colosseum', 'crane'), do: (c) => aggro(c.game, findActor(c.game, 'wb_glad_crane')), end: true }, { text: 'Later.', end: true }],
    } } }),
  },
  {
    id: 'wb_glad_heron', name: '"Heron Blade" Hector', title: 'Gladiator', island: 'asshina', at: { spot: 'arena_sands' }, named: true, lethal: false,
    look: { hair: 'spiky', hairColor: '#90a4ae', skin: '#c68642', top: '#37474f', bottom: '#90a4ae' }, level: 11, faction: 'rival', style: 'brawler', moves: ['wb_whip_kick', 'wb_stilt_stomp', 'brawl_tackle'], skill: 0.4,
    alert: 'My heels are sharper than your sword!',
    when: (c, g) => !g.quests.isDone('wb_asshina_colosseum'),
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: () => ctx.char.defeated.wb_glad_heron ? '"...The champion will not be as polite as me."' : '"Blades strapped to the heels. The Colosseum allows it. Do you?"', choices: [{ text: 'Fight!', if: () => active(ctx, 'wb_asshina_colosseum', 'heron'), do: (c) => aggro(c.game, findActor(c.game, 'wb_glad_heron')), end: true }, { text: 'Later.', end: true }] } } }),
  },
  {
    id: 'wb_serena', name: '"Secretarybird" Serena', title: 'Champion of the Colosseum', island: 'asshina', at: { spot: 'arena_sands' }, boss: true, hpMul: 1.0, lethal: false,
    look: { hair: 'spiky', hairColor: '#212121', skin: '#f1c9a0', top: '#eceff1', bottom: '#212121', hat: 'headband', hatColor: '#ffb300' }, level: 13, faction: 'rival',
    style: 'brawler', moves: ['wb_secretary_kick', 'wb_whip_kick', 'wb_stilt_stomp'], skill: 0.5, breakthrough: 3, reward: 6000,
    alert: 'The secretarybird kicks snakes to death. You look like a snake.',
    barks: ['Stomp!', 'Faster!'],
    when: (c, g) => !c.bosses.includes('wb_serena'),
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: '"Champion of the Long Stride, three years running. I kick snakes to death for breakfast. Or so the posters say. Win three bouts and I\'ll show you whether it\'s true."', choices: [{ text: 'Fight!', if: () => active(ctx, 'wb_asshina_colosseum', 'serena'), do: (c) => aggro(c.game, findActor(c.game, 'wb_serena')), end: true }, { text: 'Later.', end: true }] } } }),
  },
];

/** Issho's chō-han: two dice, even or odd. */
function rollDice(c, callEven) {
  if (!c.pay(1000)) return 'broke';
  const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6);
  const even = (a + b) % 2 === 0;
  c.char.flags.wbLastRoll = `${a} and ${b} — ${even ? 'chō' : 'han'}`;
  if (even === callEven) { c.earn(2000, 'chō-han'); return 'win'; }
  return 'lose';
}

// --------------------------------------------------------- enemy groups
const groups = [
  { island: 'ohara', spot: 'camp_edge', radius: 5, enemies: [['cp', 9, { name: 'CP7 Agent', lethal: false }], ['cp', 9, { name: 'CP7 Agent', lethal: false }]], when: (c, g) => g.quests.stageId('wb_ohara_primer') === 'watchers' },
  { island: 'esperia', spot: 'opera_house', radius: 5, enemies: [['wb_mafioso', 7, { name: 'Moulon Family Gunman' }], ['wb_mafioso', 7, { name: 'Moulon Family Gunman' }], ['wb_mafioso', 8, { name: 'Moulon Family Enforcer', hpMul: 1.3 }]], when: (c, g) => g.quests.stageId('wb_esperia_convoy') === 'opera' },
  { island: 'toroa', spot: 'vineyard_cove', radius: 5, enemies: [['wb_slaver', 6], ['wb_slaver', 6]], when: (c, g) => g.quests.stageId('wb_toroa_slavers') === 'slavers' },
  { island: 'las_camp', spot: 'raider_landing', radius: 6, enemies: [['wb_raccoon_pirate', 9, { id: 'wb_raccoon_pirate' }], ['wb_raccoon_pirate', 9, { id: 'wb_raccoon_pirate' }], ['wb_raccoon_gunner', 10, { id: 'wb_raccoon_pirate' }]], when: (c, g) => g.quests.stageId('wb_raccoon_raids') === 'crew' },
  { island: 'las_camp', spot: 'raider_landing', radius: 6, enemies: [['wb_raccoon_pirate', 10], ['wb_raccoon_gunner', 10]], when: (c, g) => g.quests.stageId('wb_raccoon_raids') === 'raccoon' },
  { island: 'soja_island', town: 'soja_village', dx: -0.06, dy: -0.02, radius: 6, enemies: [['wb_mafioso', 10, { name: 'Twin Snakes Enforcer' }], ['wb_mafioso', 10, { name: 'Twin Snakes Enforcer' }]], when: (c, g) => g.quests.stageId('wb_bege_job') === 'mamba' },
  { island: 'marine_80th', dx: -0.04, dy: 0.06, radius: 7, enemies: [['marine', 12, { name: '80th Branch Marine' }], ['marine', 12, { name: '80th Branch Marine' }], ['marine_rifle', 12, { name: '80th Branch Rifleman' }]], when: (c) => c.bounty > 0 && c.faction !== 'marine' },
  { island: 'ilisia', spot: 'smugglers_cove', radius: 6, enemies: [['wb_royal_guard', 11], ['wb_royal_guard', 11], ['wb_royal_guard', 12, { name: 'Royal Guard Sergeant', hpMul: 1.3 }]], when: (c, g) => g.quests.stageId('wb_ilisia_dragon') === 'rev_fight' },
];

// -------------------------------------------------------------- quests
const quests = [
  {
    id: 'wb_ohara_echoes', name: 'Echoes of the Buster Call', island: 'ohara', kind: 'story',
    summary: 'Twenty years ago a Buster Call erased Ohara. Walk the island and learn what happened in a single afternoon.',
    stages: [
      { id: 'saul', desc: 'Walk to Ohara\'s west beach, where a shipwrecked giant once washed ashore.', goal: { type: 'reach', island: 'ohara', spot: 'saul_beach', r: 6 },
        onComplete: (ctx, g) => g.ui.banner('The Giant on the Beach', 'Ohara, twenty years ago', 'A Marine Vice Admiral who refused an order drifted ashore here. A little girl brought him bread for four days, and he taught her to laugh: "Dereshishishi!"', 7) },
      { id: 'tree', desc: 'Stand before the husk of the Tree of Knowledge.', goal: { type: 'reach', island: 'ohara', spot: 'tree_husk', r: 7 },
        onComplete: (ctx, g) => g.ui.banner('The Tree of Knowledge', 'Five thousand years old', 'Cipher Pol found the Poneglyph the scholars studied in secret. Professor Clover spoke to the Five Elders themselves — and was shot before he could finish. Then the Buster Call: ten battleships, five Vice Admirals.', 8) },
      { id: 'lake', desc: 'Go to the Lake of Books, north-east of the Tree.', goal: { type: 'reach', island: 'ohara', spot: 'book_lake', r: 6 },
        onComplete: (ctx, g) => g.ui.banner('The Lake of Books', '', 'While the Tree burned, the scholars threw book after book into the lake instead of running for the ships. They saved enough books to fill the whole lake.', 7) },
      { id: 'wreck', desc: 'Find the wreck of the evacuation ship on the south-east shore.', goal: { type: 'reach', island: 'ohara', spot: 'evac_wreck', r: 7 },
        onComplete: (ctx, g) => g.ui.banner('The Evacuation Ship', '', 'The townsfolk were promised safe passage. A Vice Admiral ordered the ship sunk anyway — in case a single scholar had hidden aboard.', 7) },
      { id: 'ice', desc: 'Walk to the north-east beach where the ice path began.', goal: { type: 'reach', island: 'ohara', spot: 'ice_beach', r: 6 },
        onComplete: (ctx, g) => g.ui.banner('The Ice Path', '', 'The giant was frozen where he stood. Then the same Vice Admiral froze a road across the sea, put the girl in a boat, and let her go. She was eight. She was the only one who left Ohara alive.', 8) },
      { id: 'report', desc: 'Return to Marigold at the memorial.' },
    ],
    rewards: { points: 1, attrs: { wil: 1 }, berries: 2000, flag: 'wbOharaEchoes' },
  },
  {
    id: 'wb_ohara_primer', name: 'The Scholars\' Secret', island: 'ohara', kind: 'story',
    summary: 'Professor Alfalfa can rebuild Professor Clover\'s primer of the ancient script — if you find three pages of his notes.',
    stages: [
      { id: 'pages', island: 'ohara', desc: 'Find three waterlogged pages of Clover\'s notes: at the Lake of Books, inside the husk of the Tree of Knowledge, and from Kanezenny on Passage Island (north-east of Ohara).', goal: { type: 'item', item: 'wb_ohara_page', n: 3 } },
      { id: 'watchers', desc: 'Cipher Pol has found the scholars\' camp! Defeat the CP7 agent Wanze on Ohara.', goal: { type: 'defeat', npc: 'wb_wanze' },
        onStart: (ctx, g) => {
          g.ui.banner('Cipher Pol', 'The World Government\'s shadow', 'An island that does not exist has visitors. A man on roller skates is shouting about noodles.', 5);
          if (g.spawner.populated.has('ohara')) {
            spawnAndAggro(g, 'wb_wanze');
            spawnAtSpot(g, 'ohara', 'camp_edge', [['cp', 9, { name: 'CP7 Agent', lethal: false }], ['cp', 9, { name: 'CP7 Agent', lethal: false }]], 5);
          }
        } },
      { id: 'read', desc: 'With Clover\'s primer, read the Poneglyph of Ohara in the ruins east of the Tree.', goal: { type: 'event', event: 'wb_read_ohara' },
        onStart: (ctx, g) => {
          ctx.setFlag('canReadPoneglyphs');
          ctx.give('wb_clover_primer', 1);
          g.ui.banner('Clover\'s Primer', 'The ancient script', 'Professor Alfalfa works all night. By dawn you can sound out the first line. Reading this is a crime punishable by death.', 6);
          if ((ctx.char.flags.poneglyphsReadIds || []).includes('ohara')) g.log('(You have read the Poneglyph of Ohara before — read it again with the primer.)', '#b39ddb');
        } },
      { id: 'report', desc: 'Tell Professor Alfalfa what the stone says.' },
    ],
    rewards: { points: 2, attrs: { wil: 2 }, berries: 5000, flag: 'wbOharaPrimer' },
    onComplete: (ctx) => { ctx.setFlag('canReadPoneglyphs'); ctx.log('You can read Poneglyphs. Every historical stone you read brings you closer to the true history — and to the World Government\'s attention.', '#ce93d8'); },
  },
  {
    id: 'wb_god_valley', name: 'The Island That Never Was', island: 'god_valley', kind: 'story',
    summary: 'Old Coyote survived the Native Hunting Competition on God Valley thirty-six years ago. He wants proof that it happened.',
    stages: [
      { id: 'relics', desc: 'Search God Valley\'s remains: the Nobles\' hunting grounds (west), the drowned canyon town (east) and the Rocks longboat wreck (east shore).', goal: { type: 'flag', flag: 'wbGvRelics' },
        // (the nearest of the three still to search)
        where: (g) => {
          const isl = g.world === g.surface ? g.surface.islands.find((i) => i.id === 'god_valley') : null, c = g.state.char, p = g.player;
          let best = null, bd = Infinity;
          for (const [spot, , flag, title] of GV_RELICS) {
            const s = isl?.spots?.[spot];
            if (!s || c.flags[flag]) continue;
            const d = g.world.distance(p.x, p.y, s.x, s.y);
            if (d < bd) { bd = d; best = { x: s.x, y: s.y, place: GV_PLACES[spot] || title }; }
          }
          return best;
        } },
      { id: 'serpent', desc: 'Something nests in the drowned ravine. Sail out north of God Valley and slay it.', goal: { type: 'defeat', npc: 'wb_valley_king' },
        where: (g) => { const s = g.surface.islands.find((i) => i.id === 'god_valley')?.spots?.valley_deep; return s && g.world === g.surface ? { x: s.x, y: s.y, place: 'The drowned ravine' } : null; },
        onStart: (ctx, g) => g.ui.banner('The Drowned Ravine', 'God Valley', 'The water north of the island is black and very deep. Something down there is circling.', 5) },
      { id: 'report', desc: 'Bring the three proofs to Old Coyote.' },
    ],
    rewards: { points: 2, berries: 12000, items: [['golden_statue', 1]] },
  },
  {
    id: 'wb_hasshoken_trials', name: 'The Hasshoken Trials', island: 'kano_country', kind: 'story',
    summary: 'Don Chinjao will accept a student of the Eight Impacts Fist only after three trials.',
    stages: [
      { id: 'boo', desc: 'Defeat Boo, lieutenant of the Happo Navy, at the training ground among the rock spires (north-east Kano).', goal: { type: 'defeat', npc: 'wb_boo' } },
      { id: 'bell', desc: 'Climb among the spires and strike the Bell of the Eight Impacts.', goal: { type: 'event', event: 'wb_kano_bell' } },
      { id: 'sai', desc: 'Beat Sai, 13th leader of the Happo Navy, in a spar at the Happo Navy Headquarters (talk to him → Train → Spar).', goal: { type: 'event', event: 'wb_beat_sai' } },
      { id: 'report', desc: 'Return to Don Chinjao at the Chinjao Family Hall in the Royal Capital.' },
    ],
    rewards: { points: 2, berries: 6000, items: [['wb_happo_mantle', 1]] },
    onComplete: (ctx, g) => {
      const knew = ctx.char.masteries.hasshoken !== undefined;
      if (!knew) ctx.char.masteries.hasshoken = 0;
      g.progression.addStyleMastery('hasshoken', 5);
      if (!knew) g.log('Don Chinjao teaches you the basics of the Hasshoken. Switch to it in Skills (Tab).', '#90caf9');
    },
  },
  {
    id: 'wb_esperia_convoy', name: 'The Humming Swordsman', island: 'esperia', kind: 'side',
    summary: 'The Moulon Family is looting the ruins of Esperia\'s Opera House, where the Battle Convoy once drove them off.',
    stages: [
      { id: 'opera', desc: 'Drive Don Moulon II and his gunmen out of the ruined Opera House on Theater Street.', goal: { type: 'defeat', npc: 'wb_moulon_jr' },
        onStart: (ctx, g) => {
          if (!g.spawner.populated.has('esperia')) return;
          spawnNow(g, 'wb_moulon_jr');
          spawnAtSpot(g, 'esperia', 'opera_house', [['wb_mafioso', 7, { name: 'Moulon Family Gunman' }], ['wb_mafioso', 7, { name: 'Moulon Family Gunman' }], ['wb_mafioso', 8, { name: 'Moulon Family Enforcer', hpMul: 1.3 }]], 5);
        } },
      { id: 'report', desc: 'Tell Old Ottavio in Cello Port.' },
    ],
    rewards: { points: 1, berries: 6000, items: [['wb_esperian_violin', 1]] },
  },
  {
    id: 'wb_toroa_slavers', name: 'A Long Line of Musicians', island: 'toroa', kind: 'side',
    summary: 'Slave hunters working for the human shops of Sabaody want Byron of Toroa.',
    stages: [
      { id: 'slavers', desc: 'Drive off the slave hunters camped at the cove past Toroa\'s vineyards (north-east).', goal: { type: 'defeat', npc: 'wb_gaff' },
        onStart: (ctx, g) => {
          if (!g.spawner.populated.has('toroa')) return;
          spawnNow(g, 'wb_gaff');
          spawnAtSpot(g, 'toroa', 'vineyard_cove', [['wb_slaver', 6], ['wb_slaver', 6]], 5);
        } },
      { id: 'report', desc: 'Tell Byron at the Toroa Music Hall that he is safe.' },
    ],
    rewards: { points: 1, berries: 5000, items: [['wb_toroa_red', 3]] },
  },
  {
    id: 'wb_bege_job', name: 'A Job for the Gang', island: 'las_camp', kind: 'story',
    summary: 'Capone "Gang" Bege wants the head of Don Mamba of the Twin Snakes — one more of the Five Families of the West.',
    stages: [
      { id: 'scout', island: 'soja_island', desc: 'Go to the Twin Snakes Gambling House in Soja Village (Soja Island, north of Las Camp) and talk to the blind bodyguard.', goal: { type: 'flag', flag: 'wbIsshoTalked' }, npc: 'wb_issho' },
      { id: 'dice', island: 'soja_island', desc: 'The bodyguard is working off a gambling debt. Take the house dice from the croupier who smokes in Soja\'s back alley.', goal: { type: 'defeat', npc: 'wb_croupier' },
        onComplete: (ctx) => { ctx.give('wb_loaded_dice', 1); ctx.log('The croupier drops a pair of dice. They are heavier on one side.', '#ffe082'); } },
      { id: 'issho', island: 'soja_island', desc: 'Show the loaded dice to Issho, the blind bodyguard.', goal: { type: 'flag', flag: 'wbIsshoLeft' } },
      { id: 'mamba', island: 'soja_island', desc: 'The bodyguard is gone. Take down Don Mamba in the Twin Snakes Gambling House.', goal: { type: 'defeat', npc: 'wb_mamba' },
        onStart: (ctx, g) => {
          const m = findActor(g, 'wb_mamba');
          if (!m) return;
          aggro(g, m);
          spawnGroupAt(g, m.x, m.y + 2, [['wb_mafioso', 10, { name: 'Twin Snakes Enforcer' }], ['wb_mafioso', 10, { name: 'Twin Snakes Enforcer' }]], 4);
          g.ui.banner('The Twin Snakes', 'Soja Island', 'Fire Tank gunmen kick in the doors of the gambling house. Don Mamba reaches for his canes.', 4);
        } },
      { id: 'report', desc: 'Return to Capone Bege at the Ristorante Castello in Las Camp.' },
    ],
    rewards: { points: 2, berries: 40000, items: [['wb_gangster_hat', 1]], bounty: 8000000 },
    onComplete: (ctx, g) => {
      ctx.setFlag('wbBegeSailed');
      despawn(g, 'wb_vito'); despawn(g, 'wb_gotti');
      g.ui.banner('The Fire Tank Pirates', 'West Blue', 'Capone Bege\'s family boards the Nostra Castello and sails for Reverse Mountain. The mafia don is a pirate now.', 6);
    },
  },
  {
    id: 'wb_fire_tank_bust', name: 'The Fire Tank Family', island: 'las_camp', kind: 'story',
    summary: 'Commissioner Gordo wants the Fire Tank Family taken down before Capone Bege swallows the last of the Five Families.',
    stages: [
      { id: 'vito', desc: 'Take down "Monster Gun" Vito at the Fire Tank Social Club.', goal: { type: 'defeat', npc: 'wb_vito' } },
      { id: 'gotti', desc: 'Take down "Hit Man" Gotti, the giant bodyguard in the Las Camp plaza.', goal: { type: 'defeat', npc: 'wb_gotti' } },
      { id: 'bege', desc: 'Capone "Gang" Bege is waiting at the Ristorante Castello. Finish it.', goal: { type: 'defeat', npc: 'wb_bege' },
        onStart: (ctx, g) => g.ui.banner('Capone "Gang" Bege', 'Boss of the Fire Tank Family', 'A short man in a pinstripe suit dabs his mouth with a napkin. Behind his eyes, a whole army is waiting.', 5) },
      { id: 'report', desc: 'Report to Commissioner Gordo at the Police Headquarters.' },
    ],
    rewards: { points: 3, berries: 30000, liberate: 'Las Camp', items: [['wb_pinstripe_coat', 1]] },
    onComplete: (ctx) => ctx.setFlag('wbFireTankFallen'),
  },
  {
    id: 'wb_raccoon_raids', name: 'Pretended Sleep', island: 'las_camp', kind: 'side',
    summary: 'The Raccoon Pirates raid Las Camp\'s south-east shore. Their captain plays dead when he is losing.',
    stages: [
      { id: 'crew', desc: 'Break the Raccoon Pirates\' raiding party on Las Camp\'s south-east shore.', goal: { type: 'defeat', any: ['wb_raccoon_pirate'], count: 3 }, at: { spot: 'raider_landing', place: 'The raiders\' landing' } },
      { id: 'raccoon', desc: 'Defeat "Pretended Sleep" Raccoon. When he goes down, keep hitting — he\'s faking.', goal: { type: 'defeat', npc: 'wb_raccoon' },
        onStart: (ctx, g) => { if (g.spawner.populated.has('las_camp')) spawnAndAggro(g, 'wb_raccoon'); g.ui.banner('"Pretended Sleep" Raccoon', 'Bounty ฿75,000,000', 'A pirate who has survived every fight by losing it convincingly.', 5); } },
      { id: 'report', island: 'marine_80th', desc: 'Report to Captain Burdock at the Marine 80th Branch (north of Soja Island).' },
    ],
    rewards: { points: 2, berries: 25000 },
  },
  {
    id: 'wb_ilisia_dragon', name: 'The King Who Saw Dragon Coming', island: 'ilisia', kind: 'story',
    summary: 'Revolutionary pamphlets flood Ilisia Harbor. King Thalassa Lucas wants the cell found; refugees want to be forgotten.',
    stages: [
      { id: 'investigate', desc: 'Find who is behind the pamphlets — search the warehouses of Ilisia Harbor.', goal: { type: 'flag', flag: 'wbIlisiaFound' }, npc: 'wb_refugee' },
      { id: 'choice', desc: 'Choose: tell Captain Gallardo of the Royal Guard (Royal Capital), or help the Revolutionary at the smugglers\' cove (east shore).' },
      { id: 'crown_fight', desc: 'Defeat Ushiano of the Revolutionary Army at the smugglers\' cove (east shore).', goal: { type: 'defeat', npc: 'wb_ushiano' } },
      { id: 'crown_report', desc: 'Report to King Thalassa Lucas at Ilisia Palace.' },
      { id: 'rev_fight', desc: 'The Royal Guard has found the cove! Hold them off and defeat Captain Gallardo.', goal: { type: 'defeat', npc: 'wb_gallardo_raid' },
        onStart: (ctx, g) => {
          if (g.spawner.populated.has('ilisia')) {
            spawnAndAggro(g, 'wb_gallardo_raid');
            spawnAtSpot(g, 'ilisia', 'smugglers_cove', [['wb_royal_guard', 11], ['wb_royal_guard', 11], ['wb_royal_guard', 12, { name: 'Royal Guard Sergeant', hpMul: 1.3 }]], 6);
          }
        } },
      { id: 'rev_report', desc: 'Tell Ushiano the way is clear.' },
    ],
    rewards: { points: 2, berries: 15000 },
    onComplete: (ctx, g) => {
      if (ctx.char.flags.wbIlisiaRev) { ctx.give('red_cloak', 1); g.log('The last boat slips out of the cove. The Revolutionary Army will remember your name.', '#ef9a9a'); }
      else { ctx.give('captain_coat', 1); ctx.earn(20000, 'the Crown of Ilisia'); g.log('King Lucas names you a Friend of Ilisia.', '#90caf9'); }
    },
  },
  {
    id: 'wb_ballywood_star', name: 'The Vanished Star', island: 'ballywood', kind: 'side',
    summary: 'The grave of Victoria Cindry, the West Blue\'s greatest actress, is empty.',
    stages: [
      { id: 'grave', desc: 'Examine Victoria Cindry\'s grave in the Cemetery of the Stars (west of Ballywood).', goal: { type: 'reach', island: 'ballywood', spot: 'cindry_grave', r: 3 },
        onComplete: (ctx, g) => g.log('The coffin is empty. In the dirt lies a surgeon\'s scalpel engraved with a single letter: H.', '#b0bec5') },
      { id: 'clinic', desc: 'Search the boarded-up clinic of Dr. Hogback, the genius surgeon who vanished the year Cindry died (east of the city).', goal: { type: 'event', event: 'wb_searched_clinic' } },
      { id: 'report', desc: 'Tell Madame Bernadette at the Grand Theater.' },
    ],
    rewards: { points: 1, berries: 4000, items: [['wb_cindry_poster', 1]] },
    onComplete: (ctx, g) => {
      for (const id of ['thriller_bark', 'florian_triangle']) {
        const isl = g.surface?.islands?.find((i) => i.id === id);
        if (isl) { g.surface.reveal(isl.x, isl.y, isl.radius + 10); g.renderer?.terrain?.updateFog?.(g.surface.fog); g.log(`Hogback's chart marks ${isl.name} on your map.`, '#ce93d8'); }
      }
    },
  },
  {
    id: 'wb_asshina_colosseum', name: 'The Colosseum of the Long Stride', island: 'asshina', kind: 'side',
    summary: 'Four bouts on the sands of Asshina to become champion of its colosseum.',
    stages: [
      { id: 'stork', desc: 'First bout: defeat "Stork Kick" Stavros on the arena sands (north-east of Asshina).', goal: { type: 'defeat', npc: 'wb_glad_stork' } },
      { id: 'crane', desc: 'Second bout: defeat "Crane Stance" Kira.', goal: { type: 'defeat', npc: 'wb_glad_crane' } },
      { id: 'heron', desc: 'Third bout: defeat "Heron Blade" Hector.', goal: { type: 'defeat', npc: 'wb_glad_heron' } },
      { id: 'serena', desc: 'Championship: defeat "Secretarybird" Serena.', goal: { type: 'defeat', npc: 'wb_serena' },
        onStart: (ctx, g) => g.ui.banner('Championship Bout', 'Colosseum of the Long Stride', '"SECRETARYBIRD SERENA!" The crowd stamps its feet until the stands shake.', 4) },
      { id: 'report', desc: 'Claim the championship from Master Marabou at the Colosseum.' },
    ],
    rewards: { points: 1, berries: 12000, items: [['wb_champion_band', 1]], flag: 'wbAsshinaChampion' },
  },
];

// ------------------------------------------------------------- registries
const items = {
  wb_ohara_page: { name: 'Waterlogged Page', icon: '📄', type: 'key', stack: true, price: 0, desc: 'A page of Professor Clover\'s notes, rescued from the ruins of Ohara. The ink has run, but the strange script is still legible.' },
  wb_clover_primer: { name: 'Clover\'s Primer', icon: '📘', type: 'key', price: 0, unique: true, desc: 'Professor Alfalfa\'s reconstruction of Professor Clover\'s notes: the key to the ancient script of the Poneglyphs. Owning it is a crime punishable by death.' },
  wb_loaded_dice: { name: 'Loaded Dice', icon: '🎲', type: 'key', price: 0, desc: 'The Twin Snakes Gambling House\'s dice. Weighted to roll six. Always six.' },
  wb_rabbit_tag: { name: 'Rabbit Tag', icon: '🎯', type: 'key', price: 0, desc: 'A tin tag stamped with a target: the mark the World Nobles put on the "Rabbits" of God Valley\'s Native Hunting Competition. A girl\'s name is scratched on the back.' },
  wb_noble_horn: { name: 'Celestial Hunting Horn', icon: '📯', type: 'key', price: 0, desc: 'A gold hunting horn engraved with the crest of the Celestial Dragons. It sounded the start of the hunt on God Valley.' },
  wb_rocks_flag: { name: 'Scrap of the Rocks Pirates\' Flag', icon: '🏴', type: 'key', price: 0, desc: 'Sun-bleached black cloth from the crew that nearly toppled the world thirty-six years ago.' },
  wb_esperian_violin: { name: 'Esperian Violin', icon: '🎻', type: 'treasure', price: 30000, desc: 'Made in Esperia, the Land of Instrument Makers, before the mist. Collectors pay a fortune for one.' },
  wb_toroa_red: { name: 'Toroa Red', icon: '🍷', type: 'food', heal: 25, price: 260, buff: { id: 'toroa_red', name: 'Toroa Red', dur: 90, mods: { damage: 1.06, atkSpeed: 1.06 } }, desc: 'The Byron family vintage. Musicians swear it keeps time for them.' },
  wb_kano_buns: { name: 'Eight Treasures Buns', icon: '🥟', type: 'food', heal: 90, price: 150, desc: 'Steamed buns from Kano Country with eight different fillings. A Happo Navy ration.' },
  wb_happo_mantle: { name: 'Happo Navy Mantle', icon: '🧥', type: 'coat', look: { coat: '#2e7d32' }, bonus: { str: 1, end: 1 }, price: 0, unique: true, desc: 'The green mantle of the Happo Navy, given to those who pass the Chinjao Family\'s trials.' },
  wb_gangster_hat: { name: 'Gangster\'s Fedora', icon: '🎩', type: 'hat', look: { hat: 'cowboy', hatColor: '#263238' }, bonus: { wil: 1 }, price: 2400, desc: 'The hat of the Five Families of the West. Wear it and waiters stand up straighter.' },
  wb_pinstripe_coat: { name: 'Pinstripe Coat', icon: '🧥', type: 'coat', look: { coat: '#37474f' }, bonus: { agi: 1 }, price: 5200, desc: 'Tailored in Las Camp. The lining has a pocket shaped exactly like a pistol.' },
  wb_champion_band: { name: 'Champion\'s Headband', icon: '🏅', type: 'hat', look: { hat: 'headband', hatColor: '#ffb300' }, bonus: { agi: 2 }, price: 0, unique: true, desc: 'Worn by the champions of the Colosseum of the Long Stride in the Asshina Gainone Kingdom.' },
  wb_cindry_poster: { name: 'Signed Playbill of Victoria Cindry', icon: '🖼', type: 'treasure', price: 18000, desc: 'A playbill of the West Blue\'s greatest actress, signed on opening night. Collectors would kill for it.' },
};

const trainers = {
  wb_ohara_elder: {
    name: 'Professor Alfalfa', where: 'Scholars\' Camp, Ohara (West Blue)', styles: {}, teaches: [], train: { wil: 28 }, haki: { observation: 20 },
    spar: { level: 9, style: 'brawler', name: 'Camp Guardian' },
    lines: ['History is the voice of people who can no longer speak. Learn to listen.', 'Close your eyes. What do you hear? Now listen again.'],
  },
  wb_sai: {
    name: 'Sai, 13th Leader of the Happo Navy', where: 'Happo Navy Harbor, Kano Country (West Blue)', styles: {}, teaches: ['hassho_bushin', 'wb_bujaogen', 'hassho_drill'], train: { str: 32, agi: 30, end: 28 },
    spar: { level: 17, style: 'hasshoken', name: 'Sai' },
    lines: ['Kakakaka! There is no need to hold back! NO NEED!', 'Again! The vibration starts in the heel!'],
  },
  wb_asshina_kicks: {
    name: 'Stride Master Rhea', where: 'Stride Dojo, Asshina Gainone Kingdom (West Blue)', styles: {}, teaches: ['wb_whip_kick', 'brawl_knee', 'brawl_tackle'], train: { agi: 26, str: 22, end: 20 },
    spar: { level: 11, style: 'brawler', name: 'Asshina Kickboxer' },
    lines: ['A leg is a whip. The hip is the handle.', 'Again — and point your toes this time!'],
  },
};

const stock = {
  wb_ohara_stores: ['rice_ball', 'fish_stew', 'bandage', 'antidote', 'sake', 'wooden_sword', 'rusty_katana', 'den_den_mushi'],
  wb_kano_market: ['wb_kano_buns', 'meat', 'rice_ball', 'fish_stew', 'bandage', 'antidote', 'sake', 'den_den_mushi'],
  wb_toroa_cellar: ['wb_toroa_red', 'sake', 'meat', 'fish_stew', 'rice_ball'],
  wb_las_camp_tailor: ['wb_gangster_hat', 'wb_pinstripe_coat', 'captain_hat', 'tricorne', 'cowboy_hat', 'captain_coat'],
};

const archetypes = {
  wb_mafioso: { name: 'Family Gunman', faction: 'bandit', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#37474f', bottom: '#263238', coat: '#212121', hat: 'cowboy', hatColor: '#212121' }, skill: 0.3, barks: ['The Family sends its regards.', 'Nothing personal.'] },
  wb_fire_tank: { name: 'Fire Tank Soldier', faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#4a148c', bottom: '#212121', hat: 'cowboy', hatColor: '#212121' }, skill: 0.35, barks: ['For the Gang!', 'Volley — fire!'] },
  wb_slaver: { name: 'Slave Hunter', faction: 'bandit', style: 'brawler', look: { top: '#5d4037', bottom: '#3e2723', hat: 'bandana', hatColor: '#424242' }, skill: 0.2, moves: ['brawl_tackle'], barks: ['Don\'t bruise the merchandise!', 'Nets out!'] },
  wb_royal_guard: { name: 'Ilisia Royal Guard', faction: 'rival', style: 'ittoryu', weapon: 'sword', lethal: false, look: { top: '#1565c0', bottom: '#fafafa', hat: 'captain', hatColor: '#0d47a1' }, skill: 0.35, barks: ['In the name of King Lucas!', 'Surrender the traitors!'] },
  wb_raccoon_pirate: { name: 'Raccoon Pirate', faction: 'pirate', style: 'ittoryu', weapon: 'sword', look: { top: '#6d4c41', hat: 'bandana', hatColor: '#795548' }, skill: 0.25, barks: ['Grab what you can!', 'The captain\'s asleep? Good!'] },
  wb_raccoon_gunner: { name: 'Raccoon Pirate Gunner', faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#5d4037', hat: 'tricorne', hatColor: '#4e342e' }, skill: 0.2 },
};

// Boss and gladiator techniques (and two learnable ones: Whip Kick, Bujaogen).
const abilities = [
  // Wanze (CP7) — Ramen Kenpo
  { id: 'wb_ramen_beam', name: 'Ramen Beam', anim: 'shoot', windup: 0.45, recover: 0.35, cd: 4, say: 'Ramen Beam!',
    steps: [{ proj: { speed: 18, range: 10, radius: 0.28, damage: 8, count: 3, spread: 0.3, sprite: 'string', color: '#fff59d', knockback: 2, stun: 0.3 } }] },
  { id: 'wb_fire_skate', name: 'Men-Kiri: Fire Skate', anim: 'kick', windup: 0.5, recover: 0.4, cd: 7, say: 'Fire Skate!',
    steps: [{ dash: { dist: 6, time: 0.28, trail: '#ff7043', hit: { damage: 14, knockback: 5, stun: 0.4, element: 'fire', status: { burn: 2 } } } }] },
  { id: 'wb_ramen_suit', name: 'Men\'s Formal Suit', anim: 'cast', windup: 0.5, recover: 0.3, cd: 20, say: 'Men\'s Formal Suit!',
    steps: [{ buff: { id: 'wb_ramen_suit', name: 'Ramen Suit', dur: 10, mods: { defMul: 0.7, damage: 1.15 }, aura: 'rgba(255,245,157,0.6)' } }] },
  { id: 'wb_poison_knife', name: 'Poisoned Kitchen Knife', anim: 'shoot', windup: 0.3, recover: 0.3, cd: 6,
    steps: [{ proj: { speed: 20, range: 10, radius: 0.25, damage: 9, sprite: 'iceshard', color: '#cfd8dc', slashing: true, status: { poison: 3 } } }] },
  // Capone Bege — Shiro Shiro no Mi (castle human)
  { id: 'wb_castle_cannons', name: 'Castle Cannons', anim: 'shoot', windup: 0.7, recover: 0.45, cd: 7, say: 'Open the gun ports!',
    steps: [{ proj: { speed: 13, range: 12, radius: 0.4, damage: 10, count: 3, spread: 0.5, sprite: 'cannonball', size: 1.2, explode: { range: 1.8, damage: 16 } } }] },
  { id: 'wb_garrison_volley', name: 'Fire Tank Volley', anim: 'cast', windup: 0.8, recover: 0.4, cd: 12, say: 'Garrison — volley fire!',
    steps: [{ zone: { range: 3, duration: 1.6, interval: 0.2, damage: 5, color: '#ffcc80', atTarget: true, kind: 'field' } }] },
  { id: 'wb_tommy_gun', name: 'Tommy Gun', anim: 'shoot', windup: 0.35, recover: 0.3, cd: 5,
    steps: [0, 0.1, 0.2, 0.3, 0.4].map((t) => ({ at: 0.35 + t, proj: { speed: 24, range: 12, radius: 0.2, damage: 5, sprite: 'bullet', color: '#ffcc80', jitter: 0.15 } })) },
  // Fire Tank officers
  { id: 'wb_monster_guns', name: 'Monster Guns', anim: 'shoot', windup: 0.4, recover: 0.35, cd: 4, say: 'Bang, bang.',
    steps: [{ proj: { speed: 26, range: 13, radius: 0.3, damage: 14, count: 2, spread: 0.18, sprite: 'bullet', size: 1.4, knockback: 4, stun: 0.3 } }] },
  { id: 'wb_hitman_gatling', name: 'Hit Man\'s Machine Gun', anim: 'shoot', windup: 0.6, recover: 0.45, cd: 7,
    steps: [0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.48, 0.56].map((t) => ({ at: 0.6 + t, proj: { speed: 24, range: 11, radius: 0.22, damage: 5, sprite: 'bullet', jitter: 0.3 } })) },
  // Five Families bosses
  { id: 'wb_twin_fangs', name: 'Twin Fangs', anim: 'slash', windup: 0.3, recover: 0.35, cd: 4,
    steps: [0, 0.15].map((t, i) => ({ at: 0.3 + t, angleOffset: i ? 0.3 : -0.3, hit: { shape: 'arc', range: 2.0, arc: 1.2, offset: 0.2, damage: 9, knockback: 2, stun: 0.25, slashing: true, status: { poison: 2 } }, vfx: 'slash', color: '#66bb6a' })) },
  { id: 'wb_snake_eyes', name: 'Snake Eyes', anim: 'shoot', windup: 0.5, recover: 0.4, cd: 8, say: 'Snake eyes!',
    steps: [{ proj: { speed: 12, range: 9, radius: 0.3, damage: 6, count: 2, spread: 0.4, sprite: 'bomb', explode: { range: 1.8, damage: 14 } } }] },
  { id: 'wb_violin_case', name: 'Violin-Case Tommy Gun', anim: 'shoot', windup: 0.45, recover: 0.35, cd: 6, say: 'Let\'s have some music!',
    steps: [0, 0.1, 0.2, 0.3].map((t) => ({ at: 0.45 + t, proj: { speed: 22, range: 11, radius: 0.2, damage: 5, sprite: 'bullet', jitter: 0.2 } })) },
  // Slave hunter, Raccoon, Ushiano, Boo
  { id: 'wb_slaver_net', name: 'Net Cast', anim: 'shoot', windup: 0.5, recover: 0.4, cd: 9, say: 'Net!',
    steps: [{ proj: { speed: 12, range: 8, radius: 0.8, damage: 3, sprite: 'string', color: '#bcaaa4', size: 2, stun: 1.6, knockback: 0 } }] },
  { id: 'wb_possum_shot', name: 'Possum Shot', anim: 'shoot', windup: 0.25, recover: 0.3, cd: 5, say: 'Fooled you!',
    steps: [{ proj: { speed: 30, range: 12, radius: 0.28, damage: 20, sprite: 'bullet', size: 1.3, knockback: 5, stun: 0.5 } }] },
  { id: 'wb_horn_charge', name: 'Horn Charge', anim: 'thrust', windup: 0.45, recover: 0.45, cd: 7,
    steps: [{ dash: { dist: 8, time: 0.3, iframes: 0.15, hit: { damage: 22, knockback: 8, stun: 0.6, heavy: true, guardBreak: true } } }] },
  { id: 'wb_boo_elbow', name: 'Hasshoken Elbow', anim: 'punch', windup: 0.3, recover: 0.35, cd: 4,
    steps: [{ hit: { shape: 'arc', range: 1.7, arc: 1.2, offset: 0.2, damage: 16, knockback: 5, stun: 0.5, unblockable: true }, vfx: 'ring', color: '#80cbc4' }] },
  // Asshina kicks
  { id: 'wb_stilt_stomp', name: 'Stilt Stomp', anim: 'kick', windup: 0.45, recover: 0.4, cd: 6,
    steps: [{ hit: { shape: 'circle', range: 2.3, damage: 13, knockback: 5, stun: 0.45, heavy: true }, vfx: 'ring', color: '#d7ccc8' }] },
  { id: 'wb_secretary_kick', name: 'Secretarybird Stamp', anim: 'kick', windup: 0.35, recover: 0.4, cd: 6, say: 'Stomp stomp stomp!',
    steps: [{ hit: { shape: 'arc', range: 2.3, arc: 1.3, offset: 0.3, damage: 5, knockback: 1.5, stun: 0.2, duration: 0.6, interval: 0.1 }, vfx: 'fist', color: '#ffe0b2' }] },
  { id: 'wb_whip_kick', name: 'Whip Kick', icon: '🦵', style: 'brawler', anim: 'kick', windup: 0.18, recover: 0.3, cd: 5,
    desc: 'The Asshina kickers\' signature: a long, lashing kick that hits everything in a wide arc.',
    steps: [{ hit: { shape: 'arc', range: 2.4, arc: 2.2, offset: 0.2, damage: 16, knockback: 4, stun: 0.35 }, vfx: 'slash', color: '#ffe0b2' }], learn: { mastery: 8, price: 4000 } },
  { id: 'wb_bujaogen', name: 'Bujaogen', icon: '🦶', style: 'hasshoken', anim: 'kick', windup: 0.3, recover: 0.35, cd: 8, say: 'Bujaogen!',
    desc: 'Martial Leg Heel: a kick that drives the Hasshoken\'s vibration straight through any guard. Sai\'s favourite.',
    steps: [{ hit: { shape: 'arc', range: 2.0, arc: 1.2, offset: 0.3, damage: 30, knockback: 7, stun: 0.6, unblockable: true, heavy: true }, vfx: 'ring', color: '#80cbc4' }], learn: { mastery: 20, price: 22000 } },
];

// Relics hidden in God Valley's ruins: [spot, item, flag, banner title, text]
const GV_PLACES = { hunting_lodge: 'The Nobles\' hunting grounds', canyon_town: 'The drowned canyon town', rocks_wreck: 'The Rocks longboat wreck' };
const GV_RELICS = [
  ['hunting_lodge', 'wb_rabbit_tag', 'wbGvTag', 'The Hunting Grounds', 'Rusted cages, and a tin tag stamped with a target. "Rabbits" had one hour to hide before the Celestial Dragons began to score points.'],
  ['canyon_town', 'wb_noble_horn', 'wbGvHorn', 'The Drowned Canyon Town', 'False-fronted houses half-buried in gravel. Wedged in a doorway: a gold horn with the crest of the Celestial Dragons.'],
  ['rocks_wreck', 'wb_rocks_flag', 'wbGvFlag', 'The Rocks Pirates', 'The longboat of the crew that came to God Valley for a treasure and a war. A scrap of black flag is still nailed to the mast.'],
];

// Sparring partners who get back up after a friendly (non-lethal) duel.
const DUELISTS = ['wb_boo', 'wb_glad_stork', 'wb_glad_crane', 'wb_glad_heron'];

// Stage-gated foes who attack when you walk up to them.
const PROXIMITY_AGGRO = [
  ['wb_hasshoken_trials', 'boo', 'wb_boo', 6],
  ['wb_bege_job', 'dice', 'wb_croupier', 6],
  ['wb_bege_job', 'mamba', 'wb_mamba', 8],
  ['wb_fire_tank_bust', 'vito', 'wb_vito', 6],
  ['wb_fire_tank_bust', 'gotti', 'wb_gotti', 10],
  ['wb_fire_tank_bust', 'bege', 'wb_bege', 8],
  ['wb_ilisia_dragon', 'crown_fight', 'wb_ushiano', 9],
  ['wb_asshina_colosseum', 'stork', 'wb_glad_stork', 7],
  ['wb_asshina_colosseum', 'crane', 'wb_glad_crane', 7],
  ['wb_asshina_colosseum', 'heron', 'wb_glad_heron', 7],
  ['wb_asshina_colosseum', 'serena', 'wb_serena', 7],
];

// -------------------------------------------------------------- install
function install(game) {
  const say = (speaker, text) => game.dialogue?.open(null, { start: 'a', nodes: { a: { speaker, text } } });

  // --- interactive ruins -------------------------------------------------
  const onObj = (id, fn) => game.interactions?.onObject?.(id, fn);
  onObj('wb_tree_husk', () => {
    const c = game.state?.char;
    if (!c) return;
    if (stg(game, 'wb_ohara_primer') === 'pages' && !c.flags.wbPageHusk) {
      c.flags.wbPageHusk = true;
      game.quests.ctx().give('wb_ohara_page', 1);
      say('Husk of the Tree of Knowledge', '(Inside the hollow trunk the air still smells of smoke. Under a fallen shelf, pressed flat and dry, you find a page covered in Professor Clover\'s handwriting — and lines of the ancient script.)');
      return;
    }
    const first = !c.flags.wbHuskRead;
    if (first) { c.flags.wbHuskRead = true; game.progression.raiseAttr('wil', 1); }
    say('Husk of the Tree of Knowledge', `${first ? '(+1 Willpower) ' : ''}(A library grown inside a tree five thousand years old — the oldest structure in the world. Charred shelves spiral up into the dark. On the floor lies a smashed model of the Blue Planet, with six moons still on their wires.)`);
  });
  onObj('wb_harp', () => {
    say('Ruins of Esperia Palace', '(The frame of a harp as tall as a lighthouse still stands among the rubble, its strings long gone. Sixty years ago the Government demanded a thousand of Esperia\'s people in place of the Heavenly Tribute. King Reuven refused. This is what refusing cost.)');
  });
  onObj('wb_opera', () => {
    const looting = stg(game, 'wb_esperia_convoy') === 'opera';
    say('Opera House (ruins)', looting
      ? '(Crates of instruments are stacked by the stage, stamped with the crest of the Moulon Family. Somebody has been busy.)'
      : '(Seventy years ago the Moulon Family attacked this Opera House to carry off Queen Candelle. The captain of the Battle Convoy cut down every gunman — and finished his song. The velvet seats are rotten now. The acoustics are still perfect.)');
  });
  onObj('wb_hogback_clinic', () => {
    if (stg(game, 'wb_ballywood_star') === 'clinic') {
      say('Dr. Hogback\'s clinic', '(Dust. Surgical tools. A wall covered with posters of Victoria Cindry — dozens of them. The last line in the ledger: "She will perform again. The man in the Florian Triangle has promised. — H." Beneath it, a chart of the Florian Triangle with a route marked in red.)');
      game.emit('questEvent', 'wb_searched_clinic');
      return;
    }
    say('Dr. Hogback\'s clinic', '(The boarded-up clinic of the "genius surgeon" Hogback. Patients once queued around the block. He vanished ten years ago, and the medical world is still arguing about why.)');
  });

  // --- Poneglyph of Ohara (fires even when it was read before) -----------
  game.on('useObject', (o) => {
    if (o?.use === 'poneglyph' && o.poneglyph === 'ohara' && game.canReadPoneglyphs?.()) game.emit('questEvent', 'wb_read_ohara');
  });

  // --- the Bell of the Eight Impacts (Kano) -------------------------------
  game.on('questEvent', (name, o) => {
    if (name !== 'rang_bell' || o?.name !== 'Bell of the Eight Impacts') return;
    if (stg(game, 'wb_hasshoken_trials') === 'bell') {
      game.ui.banner('The Bell of the Eight Impacts', 'Kano Country', 'Your bare fist sends the bell\'s voice rolling out between the spires. Down at the harbour, a thousand Happo Navy sailors look up.', 5);
      game.emit('questEvent', 'wb_kano_bell');
    }
  });

  // --- Sai's spar ---------------------------------------------------------
  game.on('knockout', (a) => {
    if (a?.spar === 'wb_sai' && stg(game, 'wb_hasshoken_trials') === 'sai') game.emit('questEvent', 'wb_beat_sai');
  });

  // --- talking to Issho while scouting ------------------------------------
  game.on('talked', (id) => {
    const c = game.state?.char;
    if (c && id === 'wb_issho' && stg(game, 'wb_bege_job') === 'scout') c.flags.wbIsshoTalked = true;
  });

  // --- Issho leaves the gambling house -----------------------------------
  game.on('questStage', (id, stage) => {
    if (id === 'wb_bege_job' && stage === 'mamba') setTimeout(() => despawn(game, 'wb_issho'), 1200);
  });

  // --- birthplace intros ---------------------------------------------------
  game.on('characterStart', ({ char, isNew }) => {
    if (!isNew || !char) return;
    if (char.race === 'three_eye') game.log('You were born among the scholars hiding in the ruins of Ohara. Professor Alfalfa says your third eye may one day hear the Voice of All Things. (Train Observation Haki to 20 to read Poneglyphs.)', '#ce93d8');
  });

  // --- spot-based events, sea boss, proximity duels ------------------------
  let t = 0;
  game.on('tick', (dt) => {
    if ((t -= dt) > 0) return;
    t = 0.5;
    const c = game.state?.char, p = game.player;
    if (!c || !p || game.world !== game.surface) return;
    const W = game.world;
    const isl = game.currentIsland;
    const near = (spot, r) => { const s = isl?.spots?.[spot]; return !!s && W.distance(p.x, p.y, s.x, s.y) < r; };

    // Ohara: the page caught in the reeds of the Lake of Books
    if (isl?.id === 'ohara' && stg(game, 'wb_ohara_primer') === 'pages' && !c.flags.wbPageLake && near('book_lake', 5)) {
      c.flags.wbPageLake = true;
      game.quests.ctx().give('wb_ohara_page', 1);
      game.log('You wade into the shallows of the Lake of Books. Caught in the reeds: a single page the giants missed.', '#b39ddb');
    }

    // God Valley: Coyote's three proofs
    if (isl?.id === 'god_valley' && stg(game, 'wb_god_valley') === 'relics') {
      for (const [spot, item, flag, title, text] of GV_RELICS) {
        if (c.flags[flag] || !near(spot, 5)) continue;
        c.flags[flag] = true;
        game.quests.ctx().give(item, 1);
        game.ui.banner(title, 'God Valley', text, 5);
      }
      if (c.flags.wbGvTag && c.flags.wbGvHorn && c.flags.wbGvFlag) c.flags.wbGvRelics = true;
    }

    // God Valley: the Sea King of the drowned ravine
    if (stg(game, 'wb_god_valley') === 'serpent' && !findActor(game, 'wb_valley_king')) {
      const gv = game.surface.islands.find((i) => i.id === 'god_valley');
      const s = gv?.spots?.valley_deep;
      if (s && W.distance(p.x, p.y, s.x, s.y) < 30 && W.isLiquid(s.x, s.y)) {
        seaBoss(game, { id: 'wb_valley_king', name: 'Sea King of the Drowned Ravine', title: 'Guardian of God Valley\'s grave', level: 20, hpMul: 3.4, color: '#4e342e', breakthrough: 3 }, s.x, s.y);
        game.ui.banner('SEA KING', 'The Drowned Ravine', 'Something the size of a church rises from where God Valley used to be.', 4);
      }
    }

    // friendly duelists shake it off and stand up again
    for (const id of DUELISTS) {
      const a = game.actors.find((x) => x.alive && x.npcId === id && x.state === 'knocked');
      if (!a || (a.knockT || 0) < 6) continue;
      a.state = 'idle';
      a.hp = Math.round(a.d.maxHp * 0.6);
      a.provoked = false; a.aggroPlayer = false; a.stationary = true;
      if (a.controller) { a.controller.kind = 'guard'; a.controller.target = null; a.controller.state = 'idle'; }
      if (game.bossTarget === a) game.bossTarget = null;
      game.fx.text(a.x, a.y - 2.1, 'Heh... good fight.', '#ffe082', 0.35);
    }

    // stage-gated duels: walk up and they come for you
    for (const [q, st, id, r] of PROXIMITY_AGGRO) {
      if (stg(game, q) !== st) continue;
      const a = findActor(game, id);
      if (a && !a.provoked && a.state === 'idle' && W.distance(p.x, p.y, a.x, a.y) < r) aggro(game, a);
    }
  });
}

// where the events that finish quest steps happen (for their waypoints)
const places = {
  wb_kano_bell: { island: 'kano_country', landmark: 'Bell of the Eight Impacts' },
  wb_searched_clinic: { island: 'ballywood', spot: 'hogback_clinic', place: 'Dr. Hogback\'s clinic' },
};

export default {
  id: 'westBlue', npcs, groups, quests, places, items, trainers, stock, archetypes, abilities, install,
  dynamicIds: ['wb_valley_king', 'wb_raccoon_pirate'],
};
