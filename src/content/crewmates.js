// The second crewmate of each Blue: someone at the last port before
// Reverse Mountain who'd sail with you. On the main story they ask once the
// port's trouble is dealt with (see main/blues.js); without the story — or
// on another road — they're there all the same, and ask anyone who comes by
// with a ship that can take the Grand Line. Who you are changes what they
// ask for: a place in a pirate's crew, a post under a Marine's command, a
// hunter's partnership, or just a berth on a ship that's going somewhere.
// Turned down, they stay put, and can be asked again. (Offers: game/crew.js.)
//
//   East Blue  — Loguetown: Isla Mercator, navigator
//   North Blue — Deul: Dr. Ingrid Falk, doctor
//   West Blue  — Las Camp: Fiora Vespa, sniper (she follows you ashore)
//                Soja: Tavo "Reef-Runner" Corrales, helmsman
//   South Blue — Briss: Augie "Adze" Tarbell, shipwright
//                Centaurea: Delphine Larkspur, navigator
import { npcDef } from '../game/npcs.js';
import { questDef } from '../game/quests.js';
import { ownsShip } from '../game/fleet.js';

const ROADS = ['pirate', 'marine', 'hunter'];
/**
 * They'd come: the story's chapter there has come to their offer (or is
 * behind you) — so turned down, they can still be asked before you report
 * back — or you've a ship that can take the Grand Line.
 */
const ready = (id, chId) => (c, g) => ROADS.some((p) => {
  const q = `mq:${chId}:${p}`, s = g.quests.state(q), d = questDef(q);
  if (s?.done) return true;
  const k = d ? d.stages.findIndex((x) => x.offer === id) : -1;
  return !!s && k >= 0 && s.stage >= k;
}) || ownsShip(g, (d) => d.grandLine);
/** What you said to their offer ('yes' | 'no' | null). */
const said = (ctx, id) => ctx.char.crewOffers?.[id]?.said || null;
/** Would they come now, if asked? */
const would = (ctx, id) => { try { return !!ctx.game.crew?.canRecruit?.(npcDef(id)); } catch { return false; } };

/** Their talk when they've no offer to make: before (with the word on what it'd take), or after you turned them down. */
function talk(id, o) {
  return (ctx) => ({
    start: 'a',
    nodes: {
      a: {
        text: () => (said(ctx, id) === 'no' ? o.after : would(ctx, id) ? o.ready || o.before : `${o.before} ${o.hint}`),
        choices: [{ text: 'Who are you?', next: 'who' }, { text: 'Goodbye.', end: true }],
      },
      who: { text: o.intro, next: 'a' },
    },
  });
}

// ================================================================ EAST BLUE
const ISLA_INTRO = '"My father was a navigator. He went over Reverse Mountain eleven years ago with a crew that thought a Log Pose was a decoration. They never came back." (She taps the cracked Log Pose on her wrist.) "I\'ve charted every current from here to the mountain since. I won\'t make his mistakes."';
const isla = {
  id: 'eb_isla', name: 'Isla Mercator', title: 'Navigator\'s apprentice', island: 'polestar_islands',
  at: { town: 'loguetown', door: 'Navigator Supplies (Log Poses!)', ox: -1.8 }, level: 8,
  look: { hair: 'bob', hairColor: '#c0582b', skin: '#f3cfae', top: '#fff3e0', bottom: '#1e3799', coat: '#6d4c41', goggles: true, fem: true },
  barks: ['"Stay away from my charts!"', '"Left! No — your OTHER left!"'],
  recruit: {
    role: 'navigator', fighter: false, requires: ready('eb_isla', 'eb_logue'),
    intro: ISLA_INTRO,
    pitch: {
      pirate: '"You\'re going over the mountain — you\'ve the look. And you\'ll need someone who can read a Log Pose without crying. Take me as your navigator. I steer us there, you fight whatever\'s waiting."',
      marine: '"A Marine bound for G-8? Put me aboard as your navigator. I\'ll take the oath if that\'s what it costs — the Navy\'s charts of the Grand Line are the best there are, and I want to read them."',
      hunter: '"Hunting pirates over the mountain? Then you need someone who can follow them. I read currents the way you read posters. Navigation for a share — call it a partnership."',
      free: '"You\'ve a ship that can take the Grand Line, and you\'re going whether anyone tells you to or not. So am I. Take me as your navigator — I\'ve waited eleven years for a ship worth trusting."',
    },
    again: '"Asking me now? ...My bag\'s been packed since the day you said no. Let\'s go."',
    declined: '"Fine. The sea isn\'t going anywhere, and neither am I — not yet. I\'ll be at the Old Navigator\'s, if you change your mind."',
    aboard: ['"Wind\'s backing west. Keep her steady — I\'ll tell you when."', '"The needle doesn\'t lie. People do. The needle doesn\'t."', '"I can smell rain a day out. Tomorrow we\'ll want the sails reefed."', '"Father would have liked this ship."'],
  },
  dialogue: talk('eb_isla', {
    before: '(A young woman with ink on her fingers is arguing with the shop\'s barometer.) "Every rookie who comes through Loguetown wants a Log Pose. Half of them hold it upside down."',
    hint: '"Come back with a ship that can survive the Grand Line, and maybe we\'ll talk about who reads it for you."',
    after: '"Still here. Still waiting for a ship worth trusting. ...Yours would do, you know."',
    intro: ISLA_INTRO,
  }),
};

// ================================================================ NORTH BLUE
const INGRID_INTRO = '"I trained under a doctor from Flevance, before the White City burned. He said amber lead poisoning wasn\'t catching. The World Government said it was, and that was that." (She snaps her bag shut.) "Five years I\'ve stitched the King\'s soldiers since. I want to learn medicine from people who don\'t lie about it."';
const ingrid = {
  id: 'nb_ingrid', name: 'Dr. Ingrid Falk', title: 'Army surgeon of Deul', island: 'deul',
  at: { town: 'deul_capital', door: 'Army Hospital', ox: -1.8 }, level: 9,
  look: { hair: 'bun', hairColor: '#e8d5a3', skin: '#f6dcc8', top: '#eceff1', bottom: '#37474f', coat: '#fafafa', glasses: true, fem: true },
  barks: ['"That\'s going to need stitches — his, not yours."', '"Don\'t make me come over there!"'],
  recruit: {
    role: 'doctor', fighter: false, requires: ready('nb_ingrid', 'nb_deul'),
    intro: INGRID_INTRO,
    pitch: {
      pirate: '"You\'re going over the mountain with no ship\'s doctor? Then you\'ll die of something stupid. Take me along — I\'ll keep you breathing, and I won\'t ask what you did to need it."',
      marine: '"The Navy needs ship\'s surgeons more than the King needs another parade medic. Put me on your ship, officer. I\'ll take the oath — and keep your people alive long enough to keep theirs."',
      hunter: '"Hunters bring men in half dead and expect a doctor to keep them breathing till the court pays. Partner with me: you bring them in, I keep them — and you — alive. We split the money."',
      free: '"You\'ve a ship that can take the Grand Line and nobody to sew you up when it bites. Take me along. I want to see Drum Island\'s doctors before I\'m too old to learn from them."',
    },
    again: '"You\'re back. Good — I was getting bored of sprained ankles. My bag\'s ready."',
    declined: '"Your funeral. Literally, possibly. ...I\'ll be at the Army Hospital when you come to your senses."',
    aboard: ['"Hold still when you get hurt. It makes my job easier."', '"Eat something green this week. Doctor\'s orders."', '"Sea air, salt pork and fistfights. I\'ve worked in worse hospitals."'],
  },
  dialogue: talk('nb_ingrid', {
    before: '(A tall woman in a stained surgeon\'s coat is scrubbing her hands at the hospital door.) "If you\'re not bleeding, you\'re in the wrong queue. Soldiers first, by the King\'s order."',
    hint: '"...You\'re a sailor? If you ever get a ship that\'s going over the mountain, come and find me. I\'m done with parades."',
    after: '"Still in one piece, I see. Pity — I was hoping for an excuse to come along."',
    intro: INGRID_INTRO,
  }),
};

// ================================================================ WEST BLUE
const FIORA_INTRO = '"My father makes the best rifles in Las Camp, and every one of them ends up in some family\'s hands. I shot the cigarette out of Monster Gun Vito\'s mouth at forty paces, to prove I could do better than them." (She shrugs.) "Now I can\'t walk down my own street. Funny how that works."';
const fiora = {
  id: 'wb_fiora', name: 'Fiora Vespa', title: 'Sharpshooter of Gunsmith Row', island: 'las_camp',
  at: { town: 'las_camp_town', door: 'Gunsmith Row', ox: -1.8 }, level: 10, style: 'sniper', weapon: 'gun', ranged: true, skill: 0.4,
  look: { hair: 'ponytail', hairColor: '#3e2723', skin: '#e8c09a', top: '#eceff1', bottom: '#263238', coat: '#4e342e', hat: 'cap', hatColor: '#3e2723', fem: true },
  alert: 'Wrong street, friend.',
  barks: ['"Bang. You\'re done."', '"Hold still — I hate wasting shot."', '"Too slow!"'],
  recruit: {
    role: 'sniper', fighter: true, requires: ready('wb_fiora', 'wb_lascamp'),
    intro: FIORA_INTRO,
    pitch: {
      pirate: '"You\'re getting out of the West Blue. So am I. Take me along — I don\'t miss, I don\'t drink on watch, and I don\'t take orders from anyone in a pinstripe suit. You I\'d listen to."',
      marine: '"In this city the police take the families\' money and the families take the police\'s. You\'re the only honest badge I\'ve seen in years. Sign me on, officer — put a rifle in my hands that isn\'t for sale."',
      hunter: '"You hunt the people who make my street dangerous. I can hit them from a rooftop before they know you\'re there. Partners — your posters, my bullets, half each."',
      free: '"You\'ve got a ship that can take the Grand Line and no family behind you. Neither have I, any more. Let me ride along — I\'ll pay my way with this." (She pats the rifle.)',
    },
    again: '"Took you long enough. I\'ve cleaned this rifle every day, waiting."',
    declined: '"Suit yourself. I\'ll be on Gunsmith Row, keeping my head down. Not too far down."',
    aboard: ['"I can see a gull on that mast from here. Just saying."', '"Powder\'s dry, shot\'s stacked. Ready when you are."', '"Nobody on this ship wears a pinstripe. I like that."'],
  },
  dialogue: talk('wb_fiora', {
    before: '(A young woman in a flat cap sits on a crate by Gunsmith Row, a long rifle across her knees.) "Looking for a gun? Father makes them. Looking for someone who can shoot one? That\'s me — but I\'m not for hire. Not to the families."',
    hint: '"Get yourself a ship that\'s leaving the West Blue for good, and we\'ll talk."',
    after: '"Still not wearing a pinstripe? Good. The offer\'s still open, if you are."',
    intro: FIORA_INTRO,
  }),
};

const TAVO_INTRO = '"Five years I ran Don Mamba\'s boats through the reefs at night — gamblers out, money in, no lights. I won my freedom at his own table." (He grins.) "The blind fellow who guards the place told me which dice were loaded. Don\'t ask me how he knew."';
const tavo = {
  id: 'wb_tavo', name: 'Tavo "Reef-Runner" Corrales', title: 'Pilot of Soja\'s reefs', island: 'soja_island',
  at: { town: 'soja_village', door: 'Snake Eyes Inn', ox: -1.8 }, level: 9,
  look: { hair: 'short', hairColor: '#4e342e', skin: '#a1704f', top: '#fafafa', bottom: '#795548', hat: 'straw', hatColor: '#d7ccc8', openShirt: true, bulk: 1.05 },
  barks: ['"Hard to port!"', '"Hold on to something!"'],
  recruit: {
    role: 'helmsman', fighter: false, requires: ready('wb_tavo', 'wb_soja'),
    intro: TAVO_INTRO,
    pitch: {
      pirate: '"You\'ve got a ship and a flag. What you haven\'t got is anyone who can thread her through a reef in the dark. I can steer anything that floats. Take me, captain — I\'m tired of steering for gangsters."',
      marine: '"A Navy ship needs a steady hand at the wheel. I\'ve never sworn an oath in my life — but I\'d swear one to get off this island honestly. Put me at your helm, officer."',
      hunter: '"The pirates you chase always run for the shallows. I know every shallow from here to the mountain. Partners? I steer, you hunt, we split the purse."',
      free: '"You\'ve a ship that\'ll take the Grand Line. I\'ve got hands that can steer her through anything. Seems a fair trade — let me take the wheel when you need it."',
    },
    again: '"Changed your mind? Good — I already said goodbye to everyone. Twice."',
    declined: '"No harm done. I\'ll be at the Snake Eyes Inn, losing at cards on purpose so nobody remembers I used to win."',
    aboard: ['"She answers the wheel like a dream, captain."', '"Reef off the starboard bow — kidding. Mostly."', '"Give me a current and I\'ll ride it."'],
  },
  dialogue: talk('wb_tavo', {
    before: '(A sun-browned man in a straw hat is whittling at the inn door.) "New face. Lost money at the Twin Snakes yet? Don\'t. The dice are loaded — I should know, I used to row the men who loaded them."',
    hint: '"If you ever get a ship worth steering — one that can take the Grand Line — come and find me."',
    after: '"Still sailing without a proper helmsman? Brave. The offer stands."',
    intro: TAVO_INTRO,
  }),
};

// ================================================================ SOUTH BLUE
const AUGIE_INTRO = '"Master Carvel says I\'m the best young hand on the slipway and the worst at sitting still." (He spins an adze in his fingers.) "In the Grand Line there\'s a city where they build ships on the water — Water 7. Galley-La. I want to see those docks before I\'m old."';
const augie = {
  id: 'sb_augie', name: 'Augie "Adze" Tarbell', title: 'Apprentice shipwright, St. Briss Shipyard', island: 'briss_kingdom',
  at: { town: 'briss_town', door: 'St. Briss Shipyard', ox: -1.8 }, level: 8,
  look: { hair: 'messy', hairColor: '#e65100', skin: '#f6d2b4', top: '#90a4ae', bottom: '#5d4037', goggles: true, bulk: 1.1 },
  barks: ['"Not the hull! NOT THE HULL!"', '"I\'ll nail you to the deck!"'],
  recruit: {
    role: 'shipwright', fighter: false, requires: ready('sb_augie', 'sb_briss'),
    intro: AUGIE_INTRO,
    pitch: {
      pirate: '"Your ship\'s going over a mountain and into seas that eat hulls. You\'ll want a shipwright aboard — someone to patch her while she sails. Take me! I\'ll keep her afloat. That\'s a promise."',
      marine: '"Navy ships get shot at more than anyone\'s. You\'ll want a shipwright aboard. I\'ll sign whatever the Navy wants signed — just put me on a ship that\'s going to the Grand Line."',
      hunter: '"Hunters chase pirates into places that wreck ships. You need a shipwright, partner. Take me — I\'ll fix what they break, and you can pay me in Water 7."',
      free: '"You\'ve a Grand Line ship! Can I — would you — take me along? I\'ll keep her afloat, I swear it. Carvel says I\'m ready. Well. He says I\'m ready-ish."',
    },
    again: '"You came back for me?! Hold on — I\'ll get my tools. All of them. Give me a minute. Or ten."',
    declined: '"Oh. ...Right. Of course. I\'ll be at the shipyard, building someone else\'s ship. If you ever need yours fixed, you know where I am."',
    aboard: ['"She creaks a bit at the stern. Nothing I can\'t fix."', '"Treat her well and she\'ll carry you anywhere. Carvel says that. So do I."', '"One day I\'ll build a ship that sails over the Red Line. Don\'t laugh."'],
  },
  dialogue: talk('sb_augie', {
    before: '(A ginger-haired boy with tar to the elbows is caulking a hull at the shipyard gate.) "Careful, the pitch is hot! ...You a captain? Look at this seam. LOOK at it. Best seam in the South Blue, that is."',
    hint: '"If you ever get a ship that can take the Grand Line, I\'d — never mind. Carvel needs me here. Probably."',
    after: '"Your hull holding up? ...You know where I am, if it isn\'t."',
    intro: AUGIE_INTRO,
  }),
};

const DELPHINE_INTRO = '"I drew maps for the Royal Army. Every road, every ford, every village." (She folds her hands.) "Then I saw what they used the maps for. I burned my last one and walked out. Nobody asks where the army\'s cartographer went. Nobody would, here."';
const delphine = {
  id: 'sb_delphine', name: 'Delphine Larkspur', title: 'Cartographer (retired, quietly)', island: 'centaurea',
  at: { town: 'centaurea_town', door: 'Blue Bloom Inn', ox: -1.8 }, level: 8,
  look: { hair: 'braid', hairColor: '#cfd8dc', skin: '#e0ac7e', top: '#3f6fd8', bottom: '#37474f', coat: '#455a64', fem: true },
  barks: ['"Not one step closer."', '"I know every road out of here — and you\'re not on any of them."'],
  recruit: {
    role: 'navigator', fighter: false, requires: ready('sb_delphine', 'sb_centaurea'),
    intro: DELPHINE_INTRO,
    pitch: {
      pirate: '"You\'re leaving the South Blue for a sea nobody can map. That\'s the first good idea I\'ve heard in a year. Take me as your navigator — I\'d like my charts to lead somewhere that isn\'t a fire."',
      marine: '"I deserted one army. I know how that sounds to a Marine. But the Navy swears to protect people, not burn them — hold to that, and I\'ll navigate for you. I\'ll answer to you, not to a marshal."',
      hunter: '"You hunt the men who make war pay. Suleiman, the deserters on the coast road — I drew the roads they ride. Partners: I\'ll find them, you bring them in."',
      free: '"You\'ve a ship that can take the Grand Line, and no flag on it I\'d have to answer to. That\'s all I want. Take me as your navigator — I\'ll chart you places nobody\'s burned."',
    },
    again: '"You came back. ...Thank you. I didn\'t think anyone would ask twice."',
    declined: '"I understand. A deserter is a risk. I\'ll be at the Blue Bloom Inn, under a name that isn\'t mine."',
    aboard: ['"I\'m charting this coast as we go. Nobody\'s going to burn it."', '"The currents run north here. The army\'s charts had it wrong. Mine don\'t."', '"Wind\'s fair. For once, so is everything else."'],
  },
  dialogue: talk('sb_delphine', {
    before: '(A quiet woman in a cornflower-blue coat sits by the inn window, drawing the harbour from memory.) "...Sorry. I draw when I\'m nervous. People here think I\'m a schoolteacher. It\'s easier for everyone."',
    hint: '"If you ever have a ship that can leave the Blues behind for good, I\'d like to be on it. That\'s all."',
    after: '"Still sailing? Good. I still draw your ship sometimes, when she\'s in the harbour."',
    intro: DELPHINE_INTRO,
  }),
};

export default {
  id: 'crewmates',
  npcs: [isla, ingrid, fiora, tavo, augie, delphine],
};
