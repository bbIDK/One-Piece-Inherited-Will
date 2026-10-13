// Side quests out in the country of the grown islands of the four Blues
// (world/islandgen.js placeCountry; the people there: game/country.js):
// the farmer and the woodcutters have jobs for you, and someone in town has a
// letter for the farm. Each island has its own set, by what's out there —
//   Trouble on the Road   the farmer: drive off the bandits at their camp
//   The Woodcutters' Supper  the woodcutters: three cuts of meat for the pot
//   Grandfather's Chest   the farmer (or the woodcutters): what's left in the old ruins
//   Lanterns for the Dead the woodcutters (or the farmer): light the graveyard's lantern
//   A Letter for the Farm someone in town: carry a letter out to the farmer
import { ALL_ISLANDS, GROW } from '../data/islands/index.js';
import { addItem, count, removeItem } from '../game/inventory.js';

const ISLES = ALL_ISLANDS.filter((d) => GROW[d.sea] > 1 && !d.noCountry);
const KINDS = { farm: 'Farmstead', camp: 'Camp', ruins: 'Old Ruins', graves: 'Graveyard', wood: 'Woodcutters\' Camp' };

/** An island's country site of a kind ({ name, folk, x, y, i }), or null. */
function siteOf(g, islandId, kind) {
  const isl = (g.surface || g.world)?.islands?.find((i) => i.id === islandId);
  const list = isl?.country || [];
  const i = list.findIndex((s) => s.name === KINDS[kind]);
  return i < 0 ? null : { ...list[i], i };
}
const at = (kind, place) => (islandId) => (g) => { const s = siteOf(g, islandId, kind); return s && g.world === g.surface ? { x: s.x, y: s.y, place } : null; };
const danger = (d) => d.danger || 1;

const quests = [];
for (const d of ISLES) {
  const id = d.id, k = danger(d);
  quests.push(
    { id: `cq_bandits_${id}`, name: 'Trouble on the Road', island: id, kind: 'side', summary: `Bandits camped out in the wilds of ${d.name} keep raiding the farm.`,
      stages: [
        { id: 'clear', desc: 'Drive off the bandits at their camp in the wilds.', goal: { type: 'event', event: `camp_cleared_${id}` }, where: at('camp', 'Bandit camp')(id) },
        { id: 'report', desc: 'Tell the farmer the road is safe.', where: at('farm', 'Farmstead')(id) },
      ],
      rewards: { berries: 900 + k * 700, items: [['meat', 2]] } },
    { id: `cq_supper_${id}`, name: 'The Woodcutters\' Supper', island: id, kind: 'side', summary: 'The woodcutters have worked through the day with nothing for the pot.',
      stages: [
        { id: 'meat', desc: 'Bring three cuts of Meat on the Bone (a town\'s tavern or market sells them).', goal: { type: 'item', item: 'meat', n: 3 } },
        { id: 'bring', desc: 'Take the meat to the woodcutters\' camp.', where: at('wood', 'Woodcutters\' camp')(id) },
      ],
      rewards: { berries: 500 + k * 300, items: [['bandage', 2]] } },
    { id: `cq_ruins_${id}`, name: 'Grandfather\'s Chest', island: id, kind: 'side', summary: 'Someone\'s grandfather hid a chest in the old ruins out in the country, and never went back for it.',
      stages: [
        { id: 'find', desc: 'Find the chest in the old ruins and open it.', goal: { type: 'check', fn: (c, g) => { const s = siteOf(g, id, 'ruins'); const key = s && `chest_country_${id}_${s.i}`; return !!key && !!(c.world?.chests?.[key] || c.world?.containers?.[key]); } }, where: at('ruins', 'Old ruins')(id) },
        { id: 'report', desc: 'Tell whoever asked you what you found.' },
      ],
      rewards: { berries: 400 + k * 250 } },
    { id: `cq_graves_${id}`, name: 'Lanterns for the Dead', island: id, kind: 'side', summary: 'Nobody\'s lit the lantern at the old graveyard since the bandits came.',
      stages: [
        { id: 'light', desc: 'Go to the graveyard and light its lantern (stand by it a moment).', goal: { type: 'check', fn: (c, g) => { const s = siteOf(g, id, 'graves'), p = g.player; return !!s && !!p && g.world === g.surface && g.world.distance(p.x, p.y, s.x, s.y) < 7; } }, where: at('graves', 'Graveyard')(id),
          onComplete: (ctx, g) => g.log('You light the lantern among the graves. The flame steadies in the wind.', '#ffe082') },
        { id: 'report', desc: 'Tell whoever asked you that it\'s lit.' },
      ],
      rewards: { berries: 300 + k * 200, reputation: 2 } },
    { id: `cq_letter_${id}`, name: 'A Letter for the Farm', island: id, kind: 'side', summary: 'A letter from town for the farmer out in the country.',
      stages: [{ id: 'deliver', desc: 'Carry the letter out to the farmer at the farmstead.', where: at('farm', 'Farmstead')(id) }],
      rewards: { berries: 250 + k * 150 } },
  );
}

/** What each of them asks of you, in order: the first one there's a site for and you haven't done. */
const OFFERS = {
  farmer: ['bandits', 'ruins', 'graves'],
  woodcutters: ['supper', 'graves', 'ruins'],
};
const NEEDS = { bandits: 'camp', supper: 'wood', ruins: 'ruins', graves: 'graves', letter: 'farm' };
const ASK = {
  bandits: '"Bandits. They\'ve a camp out in the wilds, and every week they come down and take what they like — grain, the hens, the cart. I can\'t fight them. Could you?"',
  supper: '"We\'ve been felling since dawn and there\'s nothing in the pot. Bring us three good cuts of meat and we\'ll make it worth your while."',
  ruins: '"My grandfather always said he\'d left a chest in the old ruins out here — never went back for it. If you find it, whatever\'s in it is yours. I\'d just like to know he wasn\'t spinning tales."',
  graves: '"Nobody\'s lit the lantern at the old graveyard since the bandits came. My folks are buried there. Would you light it for them?"',
};
const DONE = {
  bandits: '"Gone? The whole lot of them? ...Then we can work the field again without looking over our shoulders. Here — it isn\'t much, but take it, and some of the meat we\'d been hiding from them."',
  supper: '"Now THAT\'S a supper! Sit, sit — no? Then take these, for the road. A woodcutter\'s always got bandages."',
  ruins: '"So it was real! Grandfather, you old dog... Keep what you found. Here\'s something for the walk, too."',
  graves: '"Lit? ...Thank you. They\'d have liked you."',
};

function install(game) {
  // (a camp's bandits: when the last of them is down, the camp is cleared)
  game.on('knockout', (a) => {
    if (!a.camp) return;
    const left = game.actors.some((b) => b !== a && b.camp === a.camp && b.alive && b.state !== 'knocked' && b.state !== 'dead');
    if (!left) { game.emit('questEvent', `camp_cleared_${a.camp}`); game.log('The bandit camp is cleared.', '#a5d6a7'); }
  });
  const Q = game.quests;
  // the farmer and the woodcutters (game/country.js tags them)
  game.countryTalk = (a) => {
    const T = a.talk, isl = T.island, folk = T.folk;
    const has = (q) => !!siteOf(game, isl, NEEDS[q]);
    const qid = (q) => `cq_${q}_${isl}`;
    const choices = [];
    // (the letter from town, for the farmer)
    if (folk === 'farmer' && Q.stageId(qid('letter')) === 'deliver') choices.push({ text: 'I\'ve a letter for you, from town.', quest: true, next: 'letter' });
    for (const q of OFFERS[folk] || []) {
      if (!has(q)) continue;
      const st = Q.stageId(qid(q));
      if (st === 'report' || (q === 'supper' && st === 'bring')) choices.push({ text: q === 'supper' ? 'Here\'s your meat.' : 'It\'s done.', quest: true, next: 'done_' + q, if: () => q !== 'supper' || count(game.state.char, 'meat') >= 3 });
    }
    const offer = (OFFERS[folk] || []).find((q) => has(q) && !Q.state(qid(q)));
    if (offer) choices.push({ text: 'Need a hand with anything?', quest: true, next: 'ask_' + offer });
    choices.push({ text: 'Good day to you.', end: true });
    const nodes = {
      a: { text: folk === 'farmer' ? '"Out here it\'s the field, the weather, and the road to town. Not much else."' : '"Mind the axes. We\'re felling for the shipwrights in town."', choices },
      letter: { text: '"A letter? For me? ...From my daughter in town! Thank you, truly — here, for your trouble."', onEnter: () => Q.complete(qid('letter')) },
    };
    for (const q of Object.keys(ASK)) {
      nodes['ask_' + q] = { text: ASK[q], choices: [{ text: 'I\'ll do it.', quest: true, do: () => { Q.start(qid(q)); }, end: true }, { text: 'Not now.', end: true }] };
      nodes['done_' + q] = { text: DONE[q], onEnter: () => { if (q === 'supper') removeItem(game, 'meat', 3); Q.complete(qid(q)); } };
    }
    game.dialogue.open(a, { start: 'a', nodes });
  };
  // someone in town with a letter for the farm (a choice added to the townsfolk's talk)
  game.countryLetter = (a, isl) => {
    if (!isl || !siteOf(game, isl.id, 'farm')) return null;
    const id = `cq_letter_${isl.id}`;
    if (Q.state(id)) return null;
    // (one in five people in town has one)
    if ((a.talk?.seed || 0) % 5) return null;
    return { text: 'Anything I can do for you?', quest: true, next: 'cq_letter' };
  };
  game.countryLetterNode = (isl) => ({ text: '"Would you? My father works the farm out in the country, and the post never goes that far. Take him this letter — he\'ll see you right."', choices: [{ text: 'I\'ll take it.', quest: true, do: () => { Q.start(`cq_letter_${isl.id}`); addItem(game, 'letter_farm', 1); }, end: true }, { text: 'Not today.', end: true }] });
  game.on('questDone', (qid) => { if (qid.startsWith('cq_letter_')) removeItem(game, 'letter_farm', 1); });
}

const items = {
  letter_farm: { name: 'Letter for the Farm', icon: '', type: 'key', price: 0, desc: 'A folded letter, addressed to the farmer out in the country.' },
};

export default { id: 'country_quests', quests, items, install };
