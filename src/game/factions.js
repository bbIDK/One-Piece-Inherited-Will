// The Marines and the bounty business.
//  * Enlist at a Marine base (clean record only) and climb the canon ranks
//    with merit from capturing notorious pirates and from missions.
//    Officers get ships, Rokushiki training, a salary — and deserting makes
//    you the most wanted traitor in the sea.
//  * Bounty offices post the most-wanted list. Anyone who is not a pirate can
//    turn in the bounties of pirates they defeat (the bounty hunter's life).
import { addItem, earn, equip, count } from './inventory.js';
import { persist } from './lineage.js';
import { threatFactor } from './stats.js';
import { formatBerries } from '../core/math.js';
import { allNpcDefs } from './npcs.js';
import { openTrainer } from '../ui/panels.js';
import { wantedPoster } from '../ui/screens.js';
import { h } from '../ui/dom.js';
import { regionAt, REGION_INFO, isGrandLine } from '../world/constants.js';

export const MARINE_RANKS = [
  { name: 'Seaman Recruit', merit: 0 },
  { name: 'Seaman Apprentice', merit: 40 },
  { name: 'Seaman First Class', merit: 100 },
  { name: 'Petty Officer', merit: 200 },
  { name: 'Chief Petty Officer', merit: 350 },
  { name: 'Master Chief Petty Officer', merit: 550 },
  { name: 'Warrant Officer', merit: 800 },
  { name: 'Ensign', merit: 1100, perk: 'Command of a Marine sloop.' },
  { name: 'Lieutenant Junior Grade', merit: 1500 },
  { name: 'Lieutenant', merit: 2000, perk: 'Rokushiki instruction at any Marine base.' },
  { name: 'Lieutenant Commander', merit: 2700 },
  { name: 'Commander', merit: 3500 },
  { name: 'Captain', merit: 4500, perk: 'A Marine brig, and Bondola passage across the Red Line.', req: (c) => (c.flags.enteredGrandLine ? null : 'Serve in the Grand Line first.') },
  { name: 'Commodore', merit: 6000, perk: 'The coat of Justice.', req: (c) => (c.haki.armament > 0 ? null : 'Awaken Armament Haki.') },
  { name: 'Rear Admiral', merit: 8000 },
  { name: 'Vice Admiral', merit: 11000, perk: 'A Marine battleship.', req: (c) => (c.haki.armament >= 30 && c.haki.observation > 0 ? null : 'Armament Haki 30 and Observation Haki.') },
  { name: 'Admiral', merit: 16000, req: (c) => ((c.bosses || []).length >= 25 ? null : 'Defeat 25 great foes.') },
  { name: 'Fleet Admiral', merit: 25000 },
];
export const rankIndex = (name) => MARINE_RANKS.findIndex((r) => r.name === name);

const CRIMINALS = new Set(['pirate', 'bandit', 'baroque', 'zombie', 'rival']);

export function installFactions(game) {
  game.marines = {
    rank: () => game.state?.char?.marineRank || null,
    rankIndex: () => rankIndex(game.state?.char?.marineRank),
    isMarine: () => game.state?.char?.faction === 'marine',
  };
  game.on('marineEnlist', (where) => enlist(game, where));
  game.on('marineOffice', (building, island) => office(game, building, island));
  game.on('bountyBoard', (building, island) => bountyOffice(game, building, island));
  game.on('knockout', (a, att) => onKnockout(game, a, att));
  game.on('shipSunk', (s) => {
    const c = game.state?.char;
    if (!c || c.faction !== 'marine' || s.faction !== 'pirate' || !s.lastHitBy?.isPlayer) return;
    const merit = 6 + Math.round((s.level || 5) / 2);
    c.merit = (c.merit || 0) + merit;
    game.log(`Pirate ship sunk: +${merit} merit (${Math.floor(c.merit)})`, '#90caf9');
  });
  game.on('enterRegion', (reg) => { const c = game.state?.char; if (c && isGrandLine(reg)) c.flags.enteredGrandLine = true; });
}

function enlist(game, where) {
  const c = game.state.char;
  if (c.faction === 'marine') { game.log('You are already a Marine.', '#b0bec5'); return; }
  if (c.bounty > 0 || c.flags.deserter) {
    game.dialogue.open(null, { start: 'a', nodes: { a: { speaker: 'Recruiting Officer', text: `"${c.flags.deserter ? 'A deserter wants back in? Guards!' : `Enlist? With a ${formatBerries(c.bounty)} bounty on your head? Get out before I arrest you.`}"` } } });
    return;
  }
  game.dialogue.open(null, { start: 'a', nodes: {
    a: { speaker: 'Recruiting Officer', text: '"You want to join the Marines? The pay is modest and the work is dangerous. You\'ll swear to uphold Absolute Justice and hunt pirates wherever they sail. Once you sign, there\'s no going back to piracy — not without a price on your head."',
      choices: [{ text: 'I swear it. Sign me up.', next: 'b' }, { text: 'Not yet.', end: true }] },
    b: { speaker: 'Recruiting Officer', text: `"Welcome to the Marines, Seaman Recruit ${c.name}! Here's your cap. Report to any Marine base for missions and pay. Capture pirates — the more notorious, the better."`,
      onEnter: () => {
        c.faction = 'marine'; c.marineRank = MARINE_RANKS[0].name; c.merit = 0; c.marinePayDay = game.env.day; c.enlistedAt = where;
        addItem(game, 'marine_cap', 1, { silent: true });
        if (!c.equipped.hat) equip(game, 'marine_cap');
        game.ui.toast('ENLISTED', 'Seaman Recruit of the Marines', '#64b5f6');
        game.emit('marineRankChanged', c.marineRank);
        persist(game);
      } },
  } });
}

function nextRank(c) {
  const i = rankIndex(c.marineRank);
  return i >= 0 && i < MARINE_RANKS.length - 1 ? MARINE_RANKS[i + 1] : null;
}

function promote(game) {
  const c = game.state.char;
  const n = nextRank(c);
  if (!n || c.merit < n.merit) return null;
  const why = n.req ? n.req(c) : null;
  if (why) return why;
  c.marineRank = n.name;
  game.ui.toast('PROMOTED!', n.name, '#64b5f6');
  game.log(`Promoted to ${n.name}.${n.perk ? ' ' + n.perk : ''}`, '#90caf9');
  const i = rankIndex(n.name);
  const dock = game.currentIsland?.docks?.[0];
  const pos = dock ? dock.moor : { x: game.player.x, y: game.player.y + 5 };
  if (n.name === 'Ensign') game.giveShip('sloop', pos.x, pos.y, 'Marine Cutter');
  if (n.name === 'Captain') game.giveShip('brigantine', pos.x, pos.y, 'Marine Brig');
  if (n.name === 'Vice Admiral') game.giveShip('marine_warship', pos.x, pos.y, 'Marine Battleship');
  if (n.name === 'Commodore') { addItem(game, 'marine_coat', 1); equip(game, 'marine_coat'); }
  if (i >= rankIndex('Captain')) c.flags.bondolaPass = true;
  game.progression.breakthrough(1, `Promotion to ${n.name}`);
  game.emit('marineRankChanged', n.name);
  game.progression.checkDream();
  persist(game);
  return null;
}

function missionTarget(game) {
  // the most notorious undefeated pirate in this sea
  const c = game.state.char;
  const here = REGION_INFO[regionAt(game.player.x, game.player.y)]?.id;
  const cands = allNpcDefs().filter((d) => d.bounty && (d.boss || d.named) && d.faction !== 'marine' && !c.bosses.includes(d.id) && !c.defeated[d.id]).map((d) => {
    const isl = game.surface.islands.find((i) => i.id === d.island);
    return { d, isl, sea: isl?.def?.sea };
  }).filter((x) => x.isl && (x.sea === here || (here === 'calm_belt' && x.sea === 'paradise')));
  cands.sort((a, b) => a.d.bounty - b.d.bounty);
  return cands[0] || null;
}

function office(game, building, island) {
  const c = game.state.char;
  if (c.faction !== 'marine') {
    game.dialogue.open(null, { start: 'a', nodes: { a: { speaker: building?.name || 'Marine Base', text: c.bounty > 0 ? '"Halt! This is a Marine base — and you\'re on our wanted list!"' : '"This is a Marine base. Here to enlist? Or to report a pirate sighting?"',
      choices: [
        { text: 'I want to enlist.', if: () => !c.bounty, do: () => { game.dialogue.close(); enlist(game, island?.name); } },
        { text: 'Turn in bounties.', if: () => (c.claims || []).length > 0 && !c.bounty, do: () => { game.dialogue.close(); bountyOffice(game, building, island); } },
        { text: 'Leave.', end: true },
      ] } } });
    return;
  }
  const n = nextRank(c);
  const days = Math.max(0, game.env.day - (c.marinePayDay || game.env.day));
  const idx = rankIndex(c.marineRank);
  const pay = days * (300 + idx * 450);
  const target = missionTarget(game);
  const mission = c.marineMission;
  game.dialogue.open(null, { start: 'a', nodes: {
    a: {
      speaker: building?.name || 'Marine Base',
      text: () => `"${c.marineRank} ${c.name}! Merit: ${Math.floor(c.merit)}${n ? ` / ${n.merit} for ${n.name}` : ''}."${mission ? ` Current orders: capture ${mission.name}.` : ''}`,
      choices: [
        { text: `Collect pay (${formatBerries(pay)})`, if: () => pay > 0, do: () => { earn(game, pay, 'Marine salary'); c.marinePayDay = game.env.day; }, next: 'a' },
        { text: n ? `Request promotion to ${n.name}` : 'Request promotion', if: () => !!n && c.merit >= n.merit, do: () => { const why = promote(game); if (why) game.log(`Promotion denied: ${why}`, '#ff8a80'); }, next: 'a' },
        { text: () => `Orders: capture ${target?.d.name} (${formatBerries(target?.d.bounty || 0)}) on ${target?.isl.name}`, if: () => !!target && !mission, do: () => { c.marineMission = { id: target.d.id, name: target.d.name, island: target.isl.name, merit: meritFor(target.d) }; game.log(`New orders: capture ${target.d.name} at ${target.isl.name}.`, '#90caf9'); }, next: 'a' },
        { text: 'Rokushiki training', if: () => idx >= rankIndex('Lieutenant'), do: () => { game.dialogue.close(); openTrainer(game, 'marine_instructor', 'Marine Instructor'); } },
        { text: 'Resign from the Marines', do: () => {}, next: 'resign' },
        { text: 'Dismissed.', end: true },
      ],
    },
    resign: { speaker: building?.name || 'Marine Base', text: '"Resign? You may hand in your cap. You\'ll lose your rank — but at least you won\'t be hunted."', choices: [
      { text: 'Hand in the cap.', do: () => { c.faction = 'civilian'; c.flags.formerMarine = c.marineRank; c.marineRank = null; c.marineMission = null; game.log('You resign from the Marines.', '#b0bec5'); persist(game); }, end: true },
      { text: 'Never mind.', next: 'a' },
    ] },
  } });
}

function meritFor(d) {
  const b = d.bounty || d.bountyValue || 0;
  return Math.round(Math.max(20, Math.sqrt(b / 1000)) * (d.boss ? 1.2 : 0.8));
}

function onKnockout(game, a, att) {
  const c = game.state?.char;
  const p = game.player;
  const byCrew = att && !att.isPlayer && (att.crewId || att.summonedBy?.isPlayer);
  if (byCrew) {
    // merit and bounty claims count for the crew's work — desertion only for your own blows
    if (a.faction === 'marine' || a.faction === 'cp') return;
    att = p;
  }
  if (!c || !att || !att.isPlayer || a.isPlayer || a.faction === 'player') return;
  // a Marine who strikes down Marines is a deserter
  if (c.faction === 'marine' && (a.faction === 'marine' || a.faction === 'cp') && !a.spar) {
    c.flags.deserter = true;
    c.flags.formerMarine = c.marineRank;
    c.faction = 'pirate';
    c.marineRank = null;
    c.marineMission = null;
    game.ui.toast('DESERTER!', 'You struck down a fellow Marine. The Navy will hunt you.', '#ff5252');
    game.progression.addBounty(Math.max(30000000, (a.bountyValue || 0) + 20000000), 'Marine deserter');
    return;
  }
  if (!CRIMINALS.has(a.faction)) return;
  const tf = threatFactor(a.power(), p.power());
  const bounty = a.bountyValue || a.def?.bounty || 0;
  if (c.faction === 'marine') {
    let merit = 0;
    if (a.boss || a.named) merit = meritFor({ bounty, boss: a.boss });
    else if (tf > 0.2) merit = 1 + Math.round(tf * 3);
    if (c.marineMission && a.npcId === c.marineMission.id) {
      merit += c.marineMission.merit;
      game.ui.toast('ORDERS COMPLETE', `${a.name} captured`, '#64b5f6');
      c.marineMission = null;
    }
    if (merit > 0) {
      c.merit = (c.merit || 0) + merit;
      game.log(`+${merit} merit (${Math.floor(c.merit)})`, '#90caf9');
      const n = nextRank(c);
      if (n && c.merit >= n.merit) game.hint('promote', 'You have enough merit for a promotion. Report to any Marine base.');
    }
  } else if (c.faction !== 'pirate' && bounty > 0 && (a.boss || a.named)) {
    // bounty hunting: the reward can be claimed at any Marine base or bounty office
    c.claims = c.claims || [];
    c.claims.push({ name: a.name, amount: bounty });
    game.log(`${a.name} is worth ${formatBerries(bounty)} to the Marines. Turn them in at a Marine base or bounty office.`, '#ffe082');
  }
}

function bountyOffice(game, building, island) {
  const c = game.state.char;
  const body = h('div');
  game.ui.openPanel(body, { wide: true });
  body.append(h('h2', building?.name || 'Bounty Office'));
  const claims = c.claims || [];
  if (claims.length && c.faction !== 'pirate' && !c.bounty) {
    const total = claims.reduce((s, x) => s + x.amount, 0);
    // the Marines pay bounty hunters a cut of the posted bounty
    const payout = Math.round(total * (c.faction === 'marine' ? 0.1 : 0.3));
    body.append(h('p', `Bounties to claim: ${claims.map((x) => `${x.name} (${formatBerries(x.amount)})`).join(', ')}`),
      h('button.btn.gold', { on: { click: (e) => { earn(game, payout, 'bounties'); c.claims = []; e.target.disabled = true; e.target.textContent = 'Paid!'; persist(game); } } }, `Collect ${formatBerries(payout)}${c.faction === 'marine' ? ' (Marines only receive a commendation bonus)' : ''}`));
  }
  if (c.bounty > 0) body.append(h('h3', 'Your poster'), wantedPoster(c));
  const wanted = allNpcDefs().filter((d) => d.bounty && d.infamy && !c.bosses.includes(d.id) && !c.defeated[d.id]).sort((a, b) => b.bounty - a.bounty).slice(0, 12);
  body.append(h('h3', 'Most Wanted'));
  const list = h('div.list');
  for (const d of wanted) {
    const isl = game.surface.islands.find((i) => i.id === d.island);
    const known = c.discovered.includes(d.island);
    list.appendChild(h('div.row-item', h('span.ico', '☠'), h('div.grow', h('b', d.name), h('div.sub', `${d.title || ''}${known && isl ? ' · last seen: ' + isl.name : ''}`)), h('span.price', formatBerries(d.bounty))));
  }
  body.appendChild(list);
  if (c.faction === 'pirate') body.append(h('p.muted', 'The clerk eyes you nervously and keeps one hand near the Den Den Mushi.'));
  void count;
}
