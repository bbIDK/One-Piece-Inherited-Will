// South Blue content pack: the canon stories of the southern sea, each told
// from the point of view of a newcomer who arrives at that moment.
//
//  Baterilla ........ the Marines hunt the Pirate King's unborn child (Rouge)
//  Karate Island .... the Karate Island Open (young Foxy, Jerry the champion)
//  Torino Kingdom ... natives vs. the giant Goayu birds; the Mink traders
//  Sorbet Kingdom ... Bekori returns; Kuma's Solo Revolution; the "Tyrant"
//  Briss Kingdom .... the lost St. Briss; Crab-Hand Gyro
//  Centaurea ........ the Revolutionary South Army takes the Royal Fortress
//  Kutsukku Island .. Victoria's murder unites Kid, Killer, Heat and Wire
//  Tumi, Evil Black Drum, Samba, Taya, Roshwan, Vespa: side stories & cameos
import './bossMoves.js';
import { spawnNow, findActor, aggro, despawn } from './helpers.js';
import { makeEnemy } from '../game/npcs.js';
import { bw } from '../world/bframe.js';
import { persist } from '../game/lineage.js';

// ------------------------------------------------------------------ helpers
const stageOf = (g, id) => g.quests?.stageId(id) ?? null;
const active = (ctx, id, stage) => ctx.game.quests.stageId(id) === stage;
const done = (ctx, id) => ctx.game.quests.isDone(id);
const started = (ctx, id) => !!ctx.quest(id);
const isMarine = (c) => c?.faction === 'marine';
const islandRec = (g, id) => g.surface?.islands?.find((i) => i.id === id) || null;
const spotOf = (g, islandId, spot) => islandRec(g, islandId)?.spots?.[spot] || null;
const populated = (g, islandId) => !!g.spawner?.populated?.has(islandId);
const healPlayer = (c, frac = 1) => { const p = c.player; if (p?.d) p.hp = Math.max(p.hp, Math.round(p.d.maxHp * frac)); };

/** Spawn a squad of archetype enemies at a spot right now (only if the island is populated). */
function squad(g, islandId, spotId, enemies, radius = 4) {
  const s = spotOf(g, islandId, spotId);
  const list = g.spawner?.populated?.get(islandId);
  if (!s || !list) return [];
  const out = [];
  for (const [arch, lvl, over] of enemies) {
    const p = g.spawner.findFree(s.x, s.y, radius) || { x: s.x, y: s.y };
    const a = makeEnemy(arch, lvl, p.x, p.y, over || {});
    a.game = g;
    g.addActor(a);
    list.push(a);
    out.push(a);
  }
  return out;
}

/** Bring a registered NPC to a spot (spawning it if needed) and make it fight. */
function fightAt(g, id, islandId, spotId, ox = 0) {
  if (!populated(g, islandId)) return null; // its `when` spawns it on arrival
  const s = spotId ? spotOf(g, islandId, spotId) : null;
  let a = findActor(g, id);
  if (!a) a = spawnNow(g, id, s ? { x: s.x + ox, y: s.y } : undefined);
  if (!a) return null;
  if (s) {
    const p = g.spawner.findFree(s.x + ox, s.y, 3) || { x: s.x + ox, y: s.y };
    a.x = p.x; a.y = p.y;
    if (a.controller) a.controller.home = { x: a.x, y: a.y };
  }
  aggro(g, a);
  return a;
}

/** onStart for a "defeat the boss" stage: skip ahead if the boss is already beaten. */
function bossStage(questId, npcId, islandId, spotId, extra) {
  return (ctx, g) => {
    const c = g.state?.char;
    if (c?.bosses?.includes(npcId)) { setTimeout(() => g.quests.next(questId), 0); return; }
    fightAt(g, npcId, islandId, spotId);
    extra?.(ctx, g);
  };
}

// ------------------------------------------------ the Karate Island Open
// Each round's opponent waits in his corner of the Tournament Ring. Step up
// into the ring and the bell rings. Knock him down and he leaves the ring and
// the next one climbs in; get knocked down yourself (or stay out of the ring
// for a count of five) and the bout is lost: no life is lost in the ring, but
// your run in the Open is over — enter again with the Grandmaster.
const OPEN = 'sb_karate_open';
const ROUNDS = {
  r1: ['sb_foxy', 'ROUND ONE', "A young boxer with a fox's grin bounces on his toes in the ring. The crowd is already booing him."],
  r2: ['sb_yaguara', 'ROUND TWO', 'Yaguara the Mink bows in his corner, fists crackling with Electro. "Garchu!"'],
  final: ['sb_jerry', 'THE FINAL', 'Jerry, the boxing champion, ducks under the ropes — and keeps ducking. He is very, very tall.'],
};
const ringOf = (g) => islandRec(g, 'karate_island')?.landmarks?.find((l) => l.spot === 'karate_ring') || null;
/** The ring, for a round's waypoint (the bout is there, whoever's in it yet). */
const ringPin = (g) => { const r = ringOf(g); return r ? { x: r.x, y: r.y, place: 'the Tournament Ring' } : null; };
const onRing = (g, a, ring) => { const f = g.world.floorRec?.(a.x, a.y); return !!f && !!ring && f.o === ring; };

/** Put this round's opponent in his corner of the ring, waiting for you. */
function ringWait(g, stage, announce = true) {
  const R = ROUNDS[stage];
  const ring = ringOf(g);
  if (!R || !ring || !populated(g, 'karate_island') || g.quests.stageId(OPEN) !== stage) return null;
  const s = ring.s || 1;
  const corner = { x: ring.x, y: ring.y - 1.5 * s };
  const a = findActor(g, R[0]) || spawnNow(g, R[0], corner);
  if (!a) return null;
  a.x = corner.x; a.y = corner.y; a.vx = a.vy = 0; a.kb.x = a.kb.y = 0;
  a.hp = a.d.maxHp; a.state = 'idle';
  a.provoked = false; a.aggroPlayer = false; a.stationary = true;
  a.faceHome = Math.PI / 2; a.facing = Math.PI / 2; // facing the steps
  a.spar = 'karate_open'; // a bout: nobody finishes anybody off
  if (a.controller) { a.controller.kind = 'idle'; a.controller.target = null; a.controller.state = 'idle'; a.controller.home = { ...corner }; }
  if (g.bossTarget === a) g.bossTarget = null;
  g.karateBout = { npc: R[0], stage, a, started: false, out: 0, readyAt: g.time + 1.2 };
  if (announce) g.ui.banner(R[1], 'Karate Island Open', R[2] + ' Step into the ring when you are ready.', 5);
  return a;
}

/** The bell: the bout begins. */
function ringBell(g) {
  const B = g.karateBout, a = B.a;
  B.started = true;
  g.ui.banner(ROUNDS[B.stage][1], 'Karate Island Open', 'Ding ding ding — FIGHT!', 2.5);
  g.audio?.sfx('fanfare');
  aggro(g, a);
  a.spar = 'karate_open';
  if (a.controller) { a.controller.leash = 0; a.controller.pursuit = 0; a.controller.patience = 999; }
}

/** Lost the bout (knocked down, or counted out): out of the Open. */
function loseBout(g, why) {
  const B = g.karateBout;
  if (!B) return;
  g.karateBout = null;
  const p = g.player, c = g.state?.char;
  if (p && p.state === 'knocked') {
    // no life is lost in the ring
    g.lives.k = null;
    p.state = 'idle'; p.hitstun = 0; p.iframes = 2;
    p.hp = Math.max(p.hp, Math.round(p.d.maxHp * 0.35));
  }
  const a = B.a;
  if (a?.alive) {
    a.provoked = false; a.aggroPlayer = false;
    if (a.controller) { a.controller.kind = 'idle'; a.controller.target = null; a.controller.state = 'idle'; }
    g.fx.text(a.x, a.y - 2.2, a.npcId === 'sb_foxy' ? 'Fe-fe-fe! Foxy wins!' : 'Better luck next year!', '#fff', 0.34, { life: 2 });
    setTimeout(() => { a.alive = false; }, 2200);
  }
  if (g.bossTarget === a) g.bossTarget = null;
  if (c?.quests?.[OPEN] && !c.quests[OPEN].done) delete c.quests[OPEN];
  g.ui.banner('DEFEAT', 'Karate Island Open', `${why} Your run in the Open is over — enter again with Grandmaster Ippon at the Grand Karate Dojo.`, 6);
  g.log('Out of the Karate Island Open. Talk to Grandmaster Ippon to enter again.', '#ff8a80');
  g.emit('questReset', OPEN);
  persist(g);
}

/** Replace a building / landmark by rubble (runtime only; re-applied on every visit). */
function ruin(g, islandId, match, pieces) {
  const isl = islandRec(g, islandId);
  const W = g.surface;
  if (!isl || !W?.objects) return null;
  let obj = null;
  for (const t of isl.towns || []) { obj = (t.buildings || []).find(match); if (obj) break; }
  if (!obj) obj = (isl.landmarks || []).find((l) => l.kind && match(l));
  if (!obj || obj._sbRuined) return null;
  obj._sbRuined = true;
  try { W.objects.remove(obj); } catch (e) { return null; }
  for (const [dx, dy, kind] of pieces) W.objects.add({ kind: kind || 'ruins', x: obj.x + dx, y: obj.y + dy, block: true, v: 0 });
  return obj;
}
const ruinPalace = (g) => ruin(g, 'sorbet_kingdom', (b) => b.role === 'palace' && b.name === 'Sorbet Royal Palace',
  [[-4, -1], [-1, -3, 'pillar'], [2, -1], [4, -4], [0, -6, 'ruins'], [3, -2, 'pillar']]);
const ruinTower = (g) => ruin(g, 'tumi', (o) => o.kind === 'tower', [[-1, 0], [1, -1], [0, -2, 'pillar']]);

/** Kuma's Ursus Shock, as seen by a bystander. */
function pawBlast(g, x, y, big = true) {
  if (!g.fx) return;
  g.fx.shake(big ? 1.1 : 0.6);
  g.fx.impactFrame(big ? 0.18 : 0.1);
  g.fx.flash = big ? 0.6 : 0.3;
  g.fx.ring(x, y, 0.5, big ? 16 : 9, '#ffffff', 0.9, 0.5);
  g.fx.ring(x, y, 0.3, big ? 10 : 6, '#b2ebf2', 0.7, 0.3);
  g.fx.burst(x, y - 1, big ? 60 : 30, { color: ['#ffffff', '#e0f7fa', '#b2ebf2'], speed: 10, vz: 6, g: 6, life: 1.2, kind: 'smoke', size: 0.5 });
  g.audio?.sfx('explosion');
}

// --------------------------------------------------------------- abilities
const abilities = [
  // Karate Island
  { id: 'sb_foxy_counter', name: 'Counter Fox Blow', anim: 'punch', windup: 0.35, recover: 0.35, cd: 6, cost: { stamina: 10 }, say: 'Counter Fox Blow!',
    steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.1, offset: 0.2, damage: 15, knockback: 3, stun: 0.7, status: { bleed: 3 } }, vfx: 'slash', color: '#b0bec5' }] },
  { id: 'sb_jerry_flicker', name: 'Jerry Aurora Flicker Jab', anim: 'punch', windup: 0.3, recover: 0.35, cd: 6, cost: { stamina: 12 }, say: 'Jerry Aurora Flicker Jab!',
    steps: [{ hit: { shape: 'arc', range: 2.6, arc: 1.2, offset: 0.3, damage: 4, knockback: 0.8, stun: 0.12, duration: 0.8, interval: 0.08 }, vfx: 'fist' }] },
  { id: 'sb_jerry_screw', name: 'Screw Drop Kick', anim: 'kick', windup: 0.4, recover: 0.45, cd: 8, cost: { stamina: 12 }, say: 'Screw Drop Kick!',
    steps: [{ dash: { dist: 6, time: 0.3, iframes: 0.15, hit: { damage: 19, knockback: 7, stun: 0.6, heavy: true } } }] },
  // Torino Kingdom — the Masukeredomo Goayu Bird
  { id: 'sb_goayu_dive', name: 'Goa Dive', anim: 'thrust', windup: 0.6, recover: 0.5, cd: 7, cost: { stamina: 10 }, say: 'GOAAAA!',
    steps: [{ dash: { dist: 9, time: 0.35, iframes: 0.25, hit: { damage: 19, knockback: 8, stun: 0.6, heavy: true } } }] },
  { id: 'sb_goayu_gale', name: 'Wing Gale', anim: 'cast', windup: 0.5, recover: 0.4, cd: 8, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 4, arc: 1.6, offset: 0.3, damage: 7, knockback: 12, stun: 0.4 }, vfx: 'ring', color: '#e0f7fa' }] },
  { id: 'sb_goayu_feathers', name: 'Feather Volley', anim: 'shoot', windup: 0.45, recover: 0.35, cd: 6, cost: { stamina: 8 },
    steps: [{ proj: { speed: 15, range: 11, radius: 0.3, damage: 7, count: 5, spread: 0.6, sprite: 'petal', color: '#8d6e63', knockback: 2 } }] },
  // Sorbet Kingdom
  { id: 'sb_bekori_volley', name: 'Royal Volley', anim: 'shoot', windup: 0.5, recover: 0.4, cd: 6, cost: { stamina: 8 }, say: 'Guards! FIRE!',
    steps: [{ proj: { speed: 18, range: 12, radius: 0.25, damage: 8, count: 4, spread: 0.5, sprite: 'bullet', knockback: 2 } }] },
  { id: 'sb_halberd_sweep', name: 'Halberd Sweep', anim: 'slash', windup: 0.45, recover: 0.4, cd: 5, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'arc', range: 2.8, arc: 2.4, offset: 0.2, damage: 16, knockback: 5, stun: 0.4, slashing: true }, vfx: 'slash' }] },
  { id: 'sb_halberd_thrust', name: 'Halberd Thrust', anim: 'thrust', windup: 0.4, recover: 0.4, cd: 4, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'line', range: 3.4, width: 0.9, damage: 18, knockback: 6, stun: 0.5, slashing: true }, vfx: 'beam', color: '#f8bbd0' }] },
  // Briss Kingdom
  { id: 'sb_gyro_claw', name: 'Crab-Claw Crush', anim: 'grab', windup: 0.4, recover: 0.45, cd: 5, cost: { stamina: 10 }, say: 'Snip snip!',
    steps: [{ hit: { shape: 'arc', range: 1.7, arc: 1.2, offset: 0.2, damage: 20, knockback: 2, stun: 1.0, guardBreak: true, status: { bleed: 2 } }, vfx: 'slash', color: '#ff7043' }] },
  // Kutsukku Island
  { id: 'sb_kid_scrap', name: 'Scrap Storm', anim: 'cast', windup: 0.5, recover: 0.4, cd: 7, cost: { stamina: 10 },
    steps: [{ proj: { speed: 16, range: 10, radius: 0.3, damage: 7, count: 5, spread: 0.8, sprite: 'iceshard', color: '#90a4ae', knockback: 3 } }] },
  { id: 'sb_killer_punisher', name: 'Punisher', anim: 'slash', windup: 0.4, recover: 0.4, cd: 6, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'circle', range: 2.2, damage: 5, knockback: 2, stun: 0.2, slashing: true, duration: 0.6, interval: 0.1, status: { bleed: 2 } }, vfx: 'ring', color: '#cfd8dc' }] },
  { id: 'sb_cleaver_chop', name: "Butcher's Cleaver", anim: 'heavy', windup: 0.55, recover: 0.5, cd: 5, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'arc', range: 2.0, arc: 1.4, offset: 0.2, damage: 20, knockback: 6, stun: 0.6, heavy: true, slashing: true, guardBreak: true, status: { bleed: 3 } }, vfx: 'slash' }] },
  { id: 'sb_buckshot', name: 'Buckshot', anim: 'shoot', windup: 0.45, recover: 0.4, cd: 5, cost: { stamina: 8 },
    steps: [{ proj: { speed: 20, range: 8, radius: 0.22, damage: 6, count: 6, spread: 0.7, sprite: 'bullet', knockback: 2 } }] },
  // Centaurea
  { id: 'sb_suleiman_behead', name: "Beheader's Arc", anim: 'slash', windup: 0.5, recover: 0.45, cd: 6, cost: { stamina: 12 }, say: 'Kubi-hane!',
    steps: [{ hit: { shape: 'line', range: 4, width: 1.2, damage: 26, knockback: 5, stun: 0.5, slashing: true, heavy: true, guardBreak: true }, vfx: 'beam', color: '#ffe082' }] },
  { id: 'sb_cyanus_lance', name: 'Cornflower Lance', anim: 'thrust', windup: 0.45, recover: 0.45, cd: 7, cost: { stamina: 12 }, say: 'For the crown!',
    steps: [
      { dash: { dist: 7, time: 0.3, iframes: 0.2, hit: { damage: 22, knockback: 6, stun: 0.5, slashing: true } } },
      { at: 0.8, proj: { speed: 13, range: 9, radius: 0.35, damage: 6, count: 5, spread: 0.9, sprite: 'petal', color: '#3f51b5' } },
    ] },
  // Evil Black Drum Kingdom
  { id: 'sb_wapol_munch', name: 'Munch-Munch Bite', anim: 'grab', windup: 0.5, recover: 0.5, cd: 5, cost: { stamina: 10 }, say: 'Baku Baku!',
    steps: [{ hit: { shape: 'arc', range: 1.9, arc: 1.3, offset: 0.2, damage: 24, knockback: 3, stun: 0.9, heavy: true, guardBreak: true }, vfx: 'slash', color: '#b0bec5' }] },
  { id: 'sb_wapol_bero', name: 'Bero Cannon', anim: 'shoot', windup: 0.7, recover: 0.45, cd: 8, cost: { stamina: 10 }, say: 'Bero Cannon!',
    steps: [{ proj: { speed: 11, range: 12, radius: 0.5, damage: 10, sprite: 'cannonball', size: 1.5, explode: { range: 2.4, damage: 24 } } }] },
  // Samba Kingdom
  { id: 'sb_slaver_net', name: "Slaver's Net", anim: 'shoot', windup: 0.45, recover: 0.4, cd: 9, cost: { stamina: 8 },
    steps: [{ proj: { speed: 13, range: 9, radius: 0.6, damage: 4, sprite: 'string', color: '#bcaaa4', status: { root: 1.8 } } }] },
];

// -------------------------------------------------------------------- items
const items = {
  sb_hibiscus_tea: { name: "Pimienta's Hibiscus Tea", icon: '🌺', type: 'key', price: 0, desc: 'Brewed by Baterilla\'s midwife for the woman on the hill. Soothing for expectant mothers.' },
  sb_rouge_hibiscus: { name: "Rouge's Hibiscus", icon: '🌺', type: 'key', price: 0, unique: true, desc: 'The pink hibiscus Portgas D. Rouge wore in her hair. You swore that the name of her son would never leave Baterilla.' },
  sb_champion_headband: { name: "Champion's Headband", icon: '🥋', type: 'hat', look: { hat: 'headband', hatColor: '#fbc02d' }, bonus: { str: 2, end: 1 }, price: 0, unique: true, desc: 'Awarded to the winner of the Karate Island Open. "The one who gets up wins."' },
  sb_torino_herb: { name: 'Great Tree Herbs', icon: '🌿', type: 'material', price: 300, desc: 'Medicinal leaves from the roots of the Great Tree of Torino.' },
  sb_torino_salve: { name: 'Torino Herbal Salve', icon: '🫙', type: 'medicine', heal: 160, price: 450, cure: ['bleed', 'poison', 'burn'], desc: 'A native remedy from the Torino Kingdom\'s library of healing. Closes wounds and draws out poison.' },
  sb_goayu_feather: { name: 'Goayu Feather', icon: '🪶', type: 'treasure', price: 4000, desc: 'A flight feather as long as a man, shed by the lord of the Great Tree.' },
  sb_st_briss_log: { name: 'Departure Log of the St. Briss', icon: '📜', type: 'key', price: 0, unique: true, desc: 'A copy from the Royal Archives of Briss: "Two hundred and ten years ago, the exploration ship St. Briss set sail for the Grand Line..."' },
  sb_tar_coating: { name: 'Tar Tooth Coating', icon: '🦷', type: 'medicine', heal: 5, price: 250, buff: { id: 'sb_tar_teeth', name: 'Tar-Coated Teeth', dur: 300, mods: { defMul: 0.95 } }, desc: 'The old South Blue custom: a coat of tar keeps your teeth for a lifetime. Grit them and take the hit.' },
  sb_conney_pizza: { name: "Conney's Giant Pizza", icon: '🍕', type: 'food', heal: 260, stamina: 140, price: 900, desc: 'Baked by the Queen Dowager of Sorbet. As big as a cart wheel.' },
  sb_strawberry_sherbet: { name: 'Strawberry Sherbet', icon: '🍧', type: 'food', heal: 30, stamina: 100, price: 90, desc: 'The pride of the Sorbet Kingdom — and Queen Dowager Conney\'s favourite.' },
  sb_scrap_flintlock: { name: "Kid's Scrap Flintlock", icon: '🔫', type: 'weapon', kind: 'gun', power: 1.3, price: 0, unique: true, desc: 'Built from Grinder Family scrap by a red-haired boy from Kutsukku Island. "Don\'t die before I beat you."' },
  sb_curry_udon: { name: 'Curry Udon', icon: '🍜', type: 'food', heal: 95, stamina: 55, price: 160, desc: 'Thick noodles in spicy curry broth. Mind your shirt.' },
  sb_moqueca_stew: { name: 'Moqueca Stew', icon: '🍲', type: 'food', heal: 150, stamina: 90, price: 260, buff: { id: 'sb_samba', name: 'Samba Rhythm', dur: 120, mods: { speedMul: 1.08 } }, desc: 'Fish, coconut milk and palm oil — the heartbeat of the Samba Kingdom.' },
  sb_roshwan_fur: { name: 'Roshwan Fur Coat', icon: '🧥', type: 'coat', look: { coat: '#8d6e63' }, bonus: { end: 1, vit: 1 }, price: 7500, desc: 'A heavy fur coat stitched with two clinking tankards, the crest of Roshwan.' },
  sb_wapometal: { name: 'Wapometal Ingot', icon: '🔩', type: 'treasure', price: 22000, desc: 'Shape-memory steel from Wapol\'s Baku Baku Factory. Scientists pay a fortune for it.' },
  sb_liberation_armband: { name: 'South Army Armband', icon: '🎗', type: 'hat', look: { hat: 'bandana', hatColor: '#b71c1c' }, bonus: { wil: 1, agi: 1 }, price: 0, unique: true, desc: 'Given by the Revolutionary Army\'s South Army to those who fought for Centaurea.' },
};

const stock = {
  sb_karate_gear: ['headband', 'bandage', 'meat', 'rice_ball', 'wooden_sword', 'rusty_katana', 'bo_staff'],
  sb_mink_trade: ['sb_torino_salve', 'meat', 'fish_stew', 'wooden_sword', 'rusty_katana', 'bandana', 'goggles', 'den_den_mushi'],
  sb_torino_medicine: ['sb_torino_salve', 'bandage', 'antidote'],
  sb_sherbet: ['sb_strawberry_sherbet', 'sb_conney_pizza', 'rice_ball'],
  sb_fish: ['fish_stew', 'meat', 'rice_ball'],
  sb_dentist: ['sb_tar_coating', 'bandage', 'antidote'],
  sb_udon: ['sb_curry_udon', 'rice_ball', 'sake'],
  sb_samba_food: ['sb_moqueca_stew', 'fish_stew', 'sake', 'tangerine'],
  sb_furs: ['sb_roshwan_fur', 'red_cloak', 'captain_hat', 'sake'],
};

const trainers = {
  sb_south_army: {
    name: 'Lindbergh (Revolutionary South Army)', where: 'Revolutionary Camp, Centaurea', styles: { sniper: 5000 }, teaches: ['snipe_explode', 'snipe_tabasco', 'snipe_firebird'],
    train: { agi: 38, wil: 32 }, spar: { level: 24, style: 'sniper', weapon: 'gun', name: 'South Army Sharpshooter' },
    lines: ['Aim for the weapon, not the man. Freedom needs fewer corpses.', 'Not bad. The Cool Shooter would have done it faster, but not bad.'],
  },
};

const archetypes = {
  sb_royal_soldier: { name: 'Sorbet Royal Army Soldier', faction: 'bandit', style: 'ittoryu', weapon: 'sword', look: { top: '#f8bbd0', bottom: '#fafafa', hat: 'captain', hatColor: '#f06292' }, skill: 0.2, barks: ['For King Bekori!', 'Clear out the deadweight!'] },
  sb_grinder_thug: { name: 'Grinder Family Thug', faction: 'bandit', style: 'brawler', look: { top: '#212121', bottom: '#212121', hat: 'cowboy', hatColor: '#212121' }, skill: 0.2, moves: ['brawl_tackle'], barks: ['The Grinders own this street!', 'Beat it, punk!'] },
  sb_crown_mercenary: { name: 'Crown Mercenary', faction: 'rival', style: 'ittoryu', weapon: 'sword', look: { top: '#37474f', bottom: '#263238', hat: 'tricorne', hatColor: '#263238' }, skill: 0.3, barks: ['Paid in full. Die quietly.'] },
  sb_loyalist: { name: 'Tumi Loyalist', faction: 'bandit', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#33691e', bottom: '#1b5e20', hat: 'captain', hatColor: '#33691e' }, skill: 0.2, barks: ['Long live the regime!'] },
  sb_snow_wolf: { name: 'Snow Wolf', faction: 'beast', style: 'brawler', beast: 'wolf', look: { skin: '#eceff1', fur: '#eceff1', hairColor: '#eceff1', top: '#eceff1', bottom: '#cfd8dc', ears: 'pointy', tail: 'fluffy', muzzle: true, furFace: true, hair: 'bald' }, skill: 0.1, hpMul: 1.2 },
};

// ------------------------------------------------------------------- looks
const MINK_JAGUAR = { ears: 'round', fur: '#e1b12c', tail: 'thin', skin: '#e1b12c', hairColor: '#e1b12c', hand: '#e1b12c', furFace: true, kind: 'Jaguar' };
const MINK_WOLF = { ears: 'pointy', fur: '#9e9e9e', tail: 'fluffy', muzzle: true, skin: '#9e9e9e', hairColor: '#eceff1', hand: '#9e9e9e', furFace: true, kind: 'Wolf' };
const MINK_CAT = { ears: 'pointy', fur: '#f0932b', tail: 'thin', skin: '#f0932b', hairColor: '#fafafa', hand: '#f0932b', kind: 'Cat' };
const MINK_CREAM_CAT = { ears: 'pointy', fur: '#fff3e0', tail: 'thin', skin: '#fff3e0', hairColor: '#4db6ac', hand: '#fff3e0', kind: 'Cat' };
const TORINO_NATIVE = { hair: 'curly', hairColor: '#212121', top: '#a0643a', bottom: '#7cb342', skin: '#a0643a', bulk: 1.3, scale: 0.75 };

// --------------------------------------------------------------------- NPCs
const npcs = [
  // ================================================================ BATERILLA
  {
    id: 'sb_rouge', name: 'Portgas D. Rouge', title: 'A woman watching the sea', island: 'baterilla', at: { spot: 'rouge_bench' }, ai: 'idle',
    look: { hair: 'long', hairColor: '#f4a261', top: '#90caf9', bottom: '#90caf9', skin: '#f9dcc4', eyeColor: '#6d4c41' }, level: 3,
    when: (c, g) => !g.quests.isDone('sb_rouge_secret') && stageOf(g, 'sb_rouge_secret') !== 'garp',
    marker: (c, g) => {
      const s = stageOf(g, 'sb_rouge_secret');
      if (s === 'visit' || s === 'birth') return '?';
      if (s === 'wait' && g.env.day >= (c.flags.sbRougeDay || 0) + 2) return '?';
      return null;
    },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('sb_rouge_secret');
            if (s === 'visit') return '"Pimienta sent you? ...Then you know." (She rests a hand on her belly.) "The Marines say the Pirate King left a child on this island, and they are searching every house. They are right about one thing — he isn\'t born yet."';
            if (s === 'patrol') return '"I can hear their boots on the path. I don\'t need you to fight for me. I need you to fight for him."';
            if (s === 'hound') return '"That agent has Pimienta\'s ledger, doesn\'t he? If he reads it properly, he\'ll know exactly which door to knock on."';
            if (s === 'wait') return '"Pimienta says I\'ve carried him nineteen months. Babies come when they come... and mine will come when it\'s safe." (She laughs softly.) "Come back in a few days."';
            if (s === 'birth') return '(Rouge is pale, gripping the bench. It is time.)';
            return '(A young woman with strawberry-blonde hair and a pink hibiscus sits on the bench, watching the sea.) "...A traveller? The sea is calm today. He always said the sea was the only thing he never managed to beat."';
          },
          choices: [
            { text: 'Pimienta sent hibiscus tea.', if: () => active(ctx, 'sb_rouge_secret', 'visit') && ctx.has('sb_hibiscus_tea'), do: (c) => { c.take('sb_hibiscus_tea', 1); c.stage('sb_rouge_secret', 'patrol'); }, next: 'tea' },
            { text: 'Pimienta sent me.', if: () => active(ctx, 'sb_rouge_secret', 'visit') && !ctx.has('sb_hibiscus_tea'), do: (c) => { c.stage('sb_rouge_secret', 'patrol'); }, next: 'path' },
            { text: 'Who is "he"?', if: () => started(ctx, 'sb_rouge_secret') && !done(ctx, 'sb_rouge_secret'), next: 'roger' },
            { text: 'It\'s been days. How are you?', if: () => active(ctx, 'sb_rouge_secret', 'wait') && ctx.game.env.day >= (ctx.char.flags.sbRougeDay || 0) + 2, do: (c) => { c.stage('sb_rouge_secret', 'birth'); }, next: 'labor' },
            { text: 'Stay with her.', if: () => active(ctx, 'sb_rouge_secret', 'birth'), next: 'labor' },
            { text: 'Enjoy the sea.', end: true },
          ],
        },
        roger: { text: '"You know his name. Everyone on this sea knows it. Gol D. Roger." (She looks away.) "He came here again and again. Here he wasn\'t a Pirate King — just a man in love. They executed him in Loguetown, and now they want his child too."', next: 'a' },
        tea: { text: '"Hibiscus tea... she remembered." (Below the hill, white coats move from house to house.) "They\'re coming up the path. Please — don\'t let them reach the cottage."' },
        path: { text: '(Below the hill, white coats move from house to house.) "They\'re coming up the path. Please — don\'t let them reach the cottage."' },
        labor: { text: '(Rouge grips your arm. Twenty months of sheer will, and it is finally time.) "No time for Pimienta... Stay with me. Please."', next: 'born' },
        born: { text: '(A cry breaks the dawn. Rouge holds a tiny, freckled boy.) "He said... if it\'s a boy, Ace. If it\'s a girl, Ann." (She smiles.) "Gol D. Ace. You were worth every single day."', next: 'farewell' },
        farewell: { text: '(Her smile doesn\'t fade, even as her strength does.) "A man in a Marine coat will come for him. Roger trusted him... so I will too." (Portgas D. Rouge closes her eyes, still smiling.)', onEnter: (c) => { if (active(c, 'sb_rouge_secret', 'birth')) c.stage('sb_rouge_secret', 'garp'); } },
      },
    }),
  },
  {
    id: 'sb_pimienta', name: 'Midwife Pimienta', title: "Baterilla's midwife", island: 'baterilla', at: { town: 'baterilla_town', building: "Midwife's House" },
    look: { hair: 'bun', hairColor: '#9e9e9e', top: '#a1887f', bottom: '#6d4c41', skin: '#c68642' }, level: 3,
    doctor: { line: '"Sit, sit. I\'ve delivered half this island — I can patch up the other half."' },
    marker: (c, g) => (!g.quests.state('sb_rouge_secret') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'sb_rouge_secret')) return '"The hill is quiet now. I leave a hibiscus on a certain grave every week. We never say her name out loud. Not ever."';
            if (started(ctx, 'sb_rouge_secret')) return '"How is she? Keep her secret, whatever it costs you."';
            return '"Mind your step, traveller — Marines are searching every house on Baterilla. Expectant mothers, newborns... They say the Pirate King left a child here. Some of the women they took to the camp never came back."';
          },
          choices: [
            { text: 'Is someone in danger?', if: () => !started(ctx, 'sb_rouge_secret'), next: 'secret' },
            { text: 'Treat my wounds.', do: (c) => c.open('doctor', {}) },
            { text: 'Goodbye.', end: true },
          ],
        },
        secret: {
          text: '(She lowers her voice.) "The woman on the hill, Rouge. She has carried her child for nineteen months. Nineteen! Holding him in by will alone until the Marines give up. Take her this hibiscus tea — and watch the path."',
          choices: [
            { text: 'I\'ll protect her.', do: (c) => { c.startQuest('sb_rouge_secret'); c.give('sb_hibiscus_tea', 1); }, end: true },
            { text: 'This isn\'t my business.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_gablin', name: 'Lieutenant Gablin', title: 'Marine search patrol', island: 'baterilla', at: { spot: 'cottage_path' }, faction: 'marine', named: true, lethal: false,
    look: { hair: 'short', hairColor: '#5d4037', top: '#fafafa', bottom: '#1b4f72', hat: 'marine', skin: '#f1c9a0' }, level: 8, style: 'ittoryu', weapon: 'sword', moves: ['itto_iai'], skill: 0.3,
    alert: 'Obstructing a Marine search! You\'re under arrest!',
    when: (c, g) => stageOf(g, 'sb_rouge_secret') === 'patrol',
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Halt! By order of Marine Headquarters, every woman on this island is to be examined. Especially the one in that cottage — nobody\'s seen her leave in months."',
          choices: [
            { text: '"Lieutenant, I searched that cottage myself. Empty."', if: () => isMarine(ctx.char), do: (c) => { c.setFlag('sbGablinFooled'); c.stage('sb_rouge_secret', 'hound'); }, next: 'fooled' },
            { text: 'Nobody is going up this hill. (Fight — you will be wanted.)', if: () => !isMarine(ctx.char), do: (c) => aggro(c.game, findActor(c.game, 'sb_gablin')), end: true },
            { text: 'Step aside.', end: true },
          ],
        },
        fooled: { text: '"Hmph. Good work, sailor. Then we comb the east beach." (The patrol marches back down the hill. You breathe again.)' },
      },
    }),
  },
  {
    id: 'sb_pointer', name: 'Agent Pointer', title: 'Cipher Pol investigator', island: 'baterilla', at: { town: 'baterilla_camp', building: 'Search Command Post' },
    faction: 'cp', boss: true, hpMul: 1.0, level: 11, style: 'rokushiki', moves: ['roku_soru', 'roku_rankyaku', 'roku_tekkai'], skill: 0.5, breakthrough: 3,
    look: { hair: 'short', hairColor: '#212121', top: '#212121', bottom: '#212121', skin: '#e0ac7e', nose: 'long' },
    alert: 'Obstructing a World Government investigation. That is a death sentence.', barks: ['Soru!', 'I can smell a lie.'],
    when: (c, g) => stageOf(g, 'sb_rouge_secret') === 'hound' && !c.bosses.includes('sb_pointer'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Cipher Pol. Don\'t salute, I\'m not here." (He taps a stolen ledger.) "The midwife\'s birth records. \'Nineteen months pregnant — the hill cottage.\' Either the Pirate King\'s woman, or a medical miracle. Either way, I report it tonight."',
          choices: [
            { text: 'You\'re not leaving this island with that ledger.', if: () => !isMarine(ctx.char), do: (c) => aggro(c.game, findActor(c.game, 'sb_pointer')), end: true },
            { text: '"Vice Admiral Garp claimed this island. Hand me the ledger."', if: () => isMarine(ctx.char), next: 'garp' },
            { text: 'Leave him.', end: true },
          ],
        },
        garp: { text: '"...Garp? That lunatic?" (He weighs the ledger, then drops it at your feet.) "Tch. I don\'t get paid enough to argue with the Fist. Burn it, file it, eat it. I was never here."', onEnter: (c) => { if (active(c, 'sb_rouge_secret', 'hound')) c.stage('sb_rouge_secret', 'wait'); } },
      },
    }),
  },
  {
    id: 'sb_garp', name: 'Monkey D. Garp', title: 'Vice Admiral, "Hero of the Marines"', island: 'baterilla', at: { spot: 'rouge_bench', ox: 1 }, faction: 'marine', ai: 'idle',
    look: { hair: 'short', hairColor: '#5d4037', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE', skin: '#e0ac7e', bulk: 1.4 }, bulk: 1.3, level: 100, fixedPower: 99999,
    when: (c, g) => stageOf(g, 'sb_rouge_secret') === 'garp',
    marker: (c, g) => (stageOf(g, 'sb_rouge_secret') === 'garp' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '(A huge Marine kneels by the bench and lifts the baby in enormous, careful hands.) "...Roger, you idiot. You made me promise." (He looks up at you.) "You protected her. Why?"',
          choices: [
            { text: 'Because it was right.', next: 'b' },
            { text: 'Because she asked me to.', next: 'b' },
          ],
        },
        b: {
          text: '"Hmph. Then you understand more than half my soldiers." (He wraps the boy in his coat.) "This child\'s name never leaves this island. Not his father\'s. Not hers. Swear it."',
          choices: [{ text: 'I swear it.', do: (c) => { if (active(c, 'sb_rouge_secret', 'garp')) c.complete('sb_rouge_secret'); }, next: 'c' }],
        },
        c: { text: '"Good. I\'ll raise him somewhere the Government never looks. Gwahahaha!" (He falls quiet.) "...Portgas D. Rouge. What a woman." (Vice Admiral Garp walks down to the harbour, the baby asleep against his chest.)' },
      },
    }),
  },

  // ============================================================ KARATE ISLAND
  {
    id: 'sb_ippon', name: 'Grandmaster Ippon', title: 'Karate Island Grandmaster', island: 'karate_island', at: { town: 'karate_dojo_town', building: 'Grand Karate Dojo' }, trainer: 'karate_master',
    look: { hair: 'bald', top: '#fafafa', bottom: '#fafafa', belt: '#212121', skin: '#e0ac7e', bulk: 1.1 }, level: 26, style: 'brawler', moves: ['brawl_knee', 'brawl_headbutt'],
    marker: (c, g) => (!g.quests.state('sb_karate_open') ? '!' : stageOf(g, 'sb_karate_open') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'sb_karate_open')) return '"Champion. Don\'t let it go to your head. The one who gets up wins — and there is always a next fight."';
            if (started(ctx, 'sb_karate_open')) return '"The Open is under way! The Tournament Ring is east of Dojo Town. Go, go!"';
            return '"Welcome to Karate Island, where every fist in the South Blue comes to be humbled. Boxing, karate, it is all the same: the one who gets up wins. The Karate Island Open begins today. Will you enter?"';
          },
          choices: [
            { text: 'Train with the Grandmaster.', do: (c) => c.open('trainer', { trainer: 'karate_master' }) },
            { text: 'Enter the Open (฿500).', if: () => !started(ctx, 'sb_karate_open'), do: (c) => (c.pay(500) ? (c.startQuest('sb_karate_open'), 'entered') : 'a') },
            { text: 'I won the final!', if: () => active(ctx, 'sb_karate_open', 'report'), do: (c) => c.complete('sb_karate_open'), next: 'champ' },
            { text: 'Tell me about Jerry, the champion.', next: 'jerry' },
            { text: 'Goodbye.', end: true },
          ],
        },
        entered: { text: '"Your first opponent is a cocky young boxer with a fox\'s grin. Watch his gloves — something about that boy smells of cheating. To the ring!"' },
        jerry: { text: '"Jerry. Tall as a mast, arms like harpoons, and he calls himself the boxing champion of the South Blue. He\'s not wrong. But he kicks when the referee blinks. Men in suits from the World Government come to watch him fight."', next: 'a' },
        champ: { text: '"Ha! You knocked down the champion! Take the headband of the Karate Island Open — and remember what it means: the one who gets up wins."' },
      },
    }),
  },
  {
    id: 'sb_foxy', name: 'Foxy', title: 'Up-and-coming professional boxer', island: 'karate_island', at: { spot: 'karate_ring' }, hostile: true, named: true, lethal: false, faction: 'rival',
    look: { hair: 'spiky', hairColor: '#212121', top: '#eceff1', bottom: '#ffb74d', skin: '#f1c9a0', nose: 'long', grin: true, hand: '#c62828' }, level: 9, style: 'brawler', moves: ['sb_foxy_counter', 'brawl_tackle'], skill: 0.3,
    alert: 'Fe-fe-fe! Nobody beats Foxy in the ring!', barks: ['Fe-fe-fe!', 'Did the ref see that? No? Good!'],
    when: (c, g) => stageOf(g, 'sb_karate_open') === 'r1',
  },
  {
    id: 'sb_yaguara', name: 'Yaguara', title: 'Mink karateka', island: 'karate_island', at: { town: 'karate_dojo_town', plaza: true, ox: 3 }, race: 'mink', lethal: false, named: true,
    look: { ...MINK_JAGUAR, top: '#fafafa', bottom: '#fafafa', belt: '#212121' }, level: 11, style: 'electro', moves: ['elec_discharge', 'elec_garchu', 'brawl_knee'], skill: 0.45,
    alert: 'Garchu! Show me your karate!',
    recruit: { role: 'fighter', requires: (c, g) => g.quests.isDone('sb_karate_open'), pitch: '"You beat me fair — and then you beat the champion. A Mink follows the one who is stronger. Garchu! I\'ll fight at your side, captain."' },
    marker: (c, g) => (stageOf(g, 'sb_karate_open') === 'r2' ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const mink = ctx.char.race === 'mink' ? ' (He sniffs.) "A fellow Mink! Garchu, sibling!"' : '';
            if (active(ctx, 'sb_karate_open', 'r2')) return '"So you got past the fox. I am Yaguara, of the Mink Tribe! I crossed half the sea to learn human karate. Let\'s see if you\'re worth the journey — to the ring!"' + mink;
            if (done(ctx, 'sb_karate_open')) return '"The champion\'s headband suits you. My Electro is sharper for losing to you."' + mink;
            return '"Garchu! I am Yaguara. Human karate has no Electro — but it has patience. That is what I came to learn."' + mink;
          },
          choices: [
            { text: 'To the ring!', if: () => active(ctx, 'sb_karate_open', 'r2'), do: (c) => ringWait(c.game, 'r2'), end: true },
            { text: 'Garchu!', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_jerry', name: 'Jerry', title: 'Boxing champion of Karate Island', island: 'karate_island', at: { town: 'karate_dojo_town', building: 'Karate Island Boxing Gym' },
    boss: true, hpMul: 1.1, lethal: false, faction: 'rival', level: 14, style: 'brawler', moves: ['sb_jerry_flicker', 'sb_jerry_screw', 'brawl_knee'], skill: 0.45, breakthrough: 3,
    look: { hair: 'short', hairColor: '#eceff1', top: '#1565c0', bottom: '#0d47a1', skin: '#f1c9a0', hand: '#c62828', legs: 1.4, scale: 1.25 }, scale: 1.25,
    alert: 'Nobody out-boxes Jerry of Karate Island!', barks: ['Jerry Aurora Flicker Jab!', 'A kick? Never happened.'],
    when: (c) => !c.bosses.includes('sb_jerry'),
    marker: (c, g) => (stageOf(g, 'sb_karate_open') === 'final' ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (active(ctx, 'sb_karate_open', 'final')
            ? '"So you\'re the rookie everyone\'s talking about. I\'m Jerry — boxing champion of Karate Island. The final is ours. Try to stay standing past the first round."'
            : '"Autograph? The name\'s Jerry. Boxing champion. Some fellows in suits keep asking me to join something called \'Cipher Pol\'. Ha! Maybe after I retire undefeated."'),
          choices: [
            { text: 'Let\'s settle it in the ring.', if: () => active(ctx, 'sb_karate_open', 'final'), do: (c) => ringWait(c.game, 'final'), end: true },
            { text: 'Good luck, champ.', end: true },
          ],
        },
      },
    }),
  },

  // =========================================================== TORINO KINGDOM
  {
    id: 'sb_shanba', name: 'Shanba', title: 'Native of the Torino Kingdom', island: 'torino_kingdom', at: { town: 'torino_village', building: 'Torino Library of Healing' },
    look: { ...TORINO_NATIVE, goggles: true }, scale: 0.75, level: 6,
    marker: (c, g) => (!g.quests.state('sb_goayu_birds') ? '!' : stageOf(g, 'sb_jewel_sickness') === 'ask' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'sb_goayu_birds')
            ? '"Ooga! The herb-hero! The medicine you brought back will last us a whole season. The library is always open to you."'
            : '"Ooga! A stranger from the sea! You look very edib— I mean, welcome! Welcome to the Torino Kingdom." (He adjusts a pair of reading glasses.) "Don\'t let the grass skirts fool you. Our library is the finest in the South Blue."'),
          choices: [
            { text: 'The birds in the Great Tree... do they rule this island?', if: () => !started(ctx, 'sb_goayu_birds'), next: 'birds' },
            { text: 'Kuma asked me about "Sapphire Scales".', if: () => active(ctx, 'sb_jewel_sickness', 'ask'), next: 'jewel' },
            { text: 'Read in the library.', do: (c) => c.open('library', { building: { name: 'Torino Library of Healing', role: 'library' } }) },
            { text: 'Buy medicine.', do: (c) => c.open('shop', { shop: 'sb_torino_medicine', building: { name: 'Torino Library of Healing', role: 'shop' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
        birds: {
          text: '"The Masukeredomo Goayu Birds nest in the Great Tree. Its leaves make the best medicine in the world — but the birds treat the tree as their kingdom, and us as their servants. Every harvest, someone is carried off. We need three baskets of herbs from the roots... and someone brave."',
          choices: [
            { text: 'I\'ll gather the herbs.', do: (c) => c.startQuest('sb_goayu_birds'), end: true },
            { text: 'Not today.', end: true },
          ],
        },
        jewel: {
          text: '"Sapphire Scales. Stones growing from the skin, worse in sunlight... worse even in moonlight." (He closes a heavy tome.) "We searched every book. No cure. Only a genius of science could teach a body to forget such a sickness. They say one works in the Grand Line — Vegapunk."',
          onEnter: (c) => { if (active(c, 'sb_jewel_sickness', 'ask')) c.stage('sb_jewel_sickness', 'report'); },
        },
      },
    }),
  },
  {
    id: 'sb_lobo', name: 'Elder Lobo', title: 'Elder of the Mink traders', island: 'torino_kingdom', at: { town: 'torino_village', building: "Mink Elders' Longhouse" }, trainer: 'torino_elder', race: 'mink',
    look: { ...MINK_WOLF, top: '#5d4037', bottom: '#3e2723' }, level: 30, style: 'electro', moves: ['elec_garchu', 'elec_discharge'],
    marker: (c, g) => (stageOf(g, 'sb_goayu_birds') === 'truce' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (ctx.char.race === 'mink'
            ? '"Garchu, young one. You were born here, among the traders. Our grandparents followed the scent of rare medicine from a homeland we do not name to outsiders... and never went back. The giant birds of Torino fear only lightning. Learn to throw it."'
            : '"Garchu, sea-traveller. We Minks came to trade furs for medicine three generations ago, and stayed. The natives are clever, the birds are proud, and we keep the peace with lightning. The giant birds of Torino fear only lightning."'),
          choices: [
            { text: 'Train Electro with the elder.', do: (c) => c.open('trainer', { trainer: 'torino_elder' }) },
            { text: 'The Great Goayu is beaten.', if: () => active(ctx, 'sb_goayu_birds', 'truce'), do: (c) => c.complete('sb_goayu_birds'), next: 'peace' },
            { text: 'Garchu!', end: true },
          ],
        },
        peace: { text: '"You struck the lord of the tree down and let it fly home? Good. A proud bird remembers mercy longer than a wound. They will keep to the canopy... for a while. Nothing on Torino stays settled forever." (He presses a jar of salve into your hands.)' },
      },
    }),
  },
  {
    id: 'sb_calico', name: 'Calico', title: 'Mink trader and chart-maker', island: 'torino_kingdom', at: { town: 'torino_village', building: 'Mink Trading Post' }, race: 'mink',
    look: { ...MINK_CAT, top: '#00897b', bottom: '#4e342e' }, level: 7, style: 'electro',
    recruit: { role: 'navigator', requires: (c, g) => g.quests.isDone('sb_goayu_birds'), pitch: '"My whiskers smell a storm three islands away, and my grandmother charted half the South Blue. You helped Torino — so I\'ll help you. Where are we sailing, captain?"' },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Welcome to the Mink Trading Post! Furs, salves, charts of the South Blue. We Minks pay in lightning-dried fish; you can pay in berries." (Her tail flicks.)',
          choices: [
            { text: 'Browse.', do: (c) => c.open('shop', { shop: 'sb_mink_trade', building: { name: 'Mink Trading Post', role: 'shop' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_great_goayu', name: 'Great Goayu', title: 'Masukeredomo Goayu Bird — lord of the Great Tree', island: 'torino_kingdom', at: { spot: 'goayu_nest' }, hostile: true, boss: true, hpMul: 1.3,
    faction: 'beast', level: 13, style: 'brawler', moves: ['sb_goayu_dive', 'sb_goayu_gale', 'sb_goayu_feathers'], skill: 0.35, breakthrough: 3,
    look: { wings: 'sky', skin: '#795548', top: '#6d4c41', bottom: '#5d4037', hair: 'mohawk', hairColor: '#d84315', nose: 'long', eyeColor: '#fbc02d', furFace: true, fur: '#6d4c41' }, bulk: 1.5, scale: 1.9,
    alert: 'GOAAAAA!', barks: ['GOA!', 'GOA GOA!'],
    when: (c, g) => stageOf(g, 'sb_goayu_birds') === 'chief' && !c.bosses.includes('sb_great_goayu'),
  },
  {
    id: 'sb_chopper', name: 'Tony Tony Chopper', title: 'A "tanuki" in the Great Tree', island: 'torino_kingdom', at: { spot: 'great_tree', ox: 2 }, ai: 'idle',
    look: { ears: 'round', fur: '#8d6e63', skin: '#8d6e63', hairColor: '#8d6e63', hand: '#8d6e63', muzzle: true, hat: 'pinkhat', hatColor: '#f48fb1', top: '#8d6e63', bottom: '#4e342e', nose: 'red', hair: 'bald' }, scale: 0.6, level: 20,
    doctor: { line: '"Hold still! I\'m a doctor!"' },
    when: (c) => (c.discovered || []).some((id) => String(id).includes('sabaody')),
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: '"I\'m not a tanuki! I\'m a REINDEER!" (The little doctor calms down.) "...A huge man with paws sent me flying here from Sabaody. I\'m going to read every book in the Torino library. I have to get stronger — for my crew."',
          choices: [
            { text: 'Can you patch me up?', do: (c) => c.open('doctor', {}) },
            { text: 'Good luck, doctor.', end: true },
          ],
        },
      },
    }),
  },

  // =========================================================== SORBET KINGDOM
  {
    id: 'sb_kuma', name: 'Bartholomew Kuma', title: 'Pastor of the south church', island: 'sorbet_kingdom', at: { town: 'sorbet_church', building: "Kuma's Church" }, race: 'buccaneer',
    look: { hair: 'curly', hairColor: '#3e2723', hat: 'beanie', hatColor: '#f5f5f5', top: '#263238', bottom: '#1a237e', skin: '#a0643a' }, bulk: 1.5, scale: 1.9, level: 60, lethal: false,
    fruit: 'nikyu', fruitMastery: 80, moves: ['nikyu_paw', 'nikyu_repel', 'kuma_paw_npc'], skill: 0.6,
    when: (c, g) => !['fleet', 'report'].includes(stageOf(g, 'sb_solo_revolution')) && !g.quests.isDone('sb_solo_revolution'),
    marker: (c, g) => {
      if (stageOf(g, 'sb_solo_revolution') === 'warn') return '?';
      if (stageOf(g, 'sb_jewel_sickness') === 'report') return '?';
      if (c.flags.sbMetBonney && !g.quests.state('sb_jewel_sickness')) return '!';
      return null;
    },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('sb_solo_revolution');
            if (s === 'castle' || s === 'bekori') return '(Kuma kneels in prayer, gloves off, his Bible closed on his knees.) "Go. I will be right behind you."';
            if (s === 'crown') return '"They want to make me king. I don\'t know how to be a king. I know how to be a pastor. Bulldog can do the ruling... I only ask that nobody in Sorbet ever burns again."';
            if (ctx.char.race === 'buccaneer' && !ctx.flag('sbKumaBuccaneer')) { ctx.setFlag('sbKumaBuccaneer'); return '(The giant pastor looks at you for a long moment.) "...You have the build of my father\'s people. Be careful in Sorbet. The World Government watches the hospital for children like us."'; }
            return '"Welcome to the church. I am Kuma, the pastor here." (An old farmer kneels; Kuma presses a padded palm to the man\'s back. The man straightens, his pain gone — and Kuma winces.) "It is only pain. I can carry it."';
          },
          choices: [
            { text: 'Bekori\'s men are burning the Elderly Village!', if: () => active(ctx, 'sb_solo_revolution', 'warn'), next: 'warn' },
            { text: 'Take my pain too.', do: (c) => { healPlayer(c, 1); c.log('Kuma presses his paw to your shoulder. Every ache vanishes... and the pastor quietly winces.', '#b3e5fc'); }, next: 'pain' },
            { text: 'Is someone else here?', if: () => !ctx.flag('sbMetBonney'), next: 'bonney' },
            { text: 'Bonney\'s skin... those blue stones.', if: () => ctx.flag('sbMetBonney') && !started(ctx, 'sb_jewel_sickness'), next: 'jewel' },
            { text: 'Torino\'s library has no cure...', if: () => active(ctx, 'sb_jewel_sickness', 'report'), do: (c) => c.complete('sb_jewel_sickness'), next: 'jewel_done' },
            { text: 'Tell me about Nika.', next: 'nika' },
            { text: 'Goodbye.', end: true },
          ],
        },
        pain: { text: '"There. Go in peace." (He flexes his gloved hand as if something heavy had settled into it.)', next: 'a' },
        warn: {
          text: '(Wounded villagers lie on the pews. Kuma listens, hands trembling.) "He came back — sixteen years after the Freedom Fighters drove him out, and this time with fire." (He pulls off his gloves.) "I am a pacifist by nature. But enough. Go to Castle Town and clear the way. I will follow."',
          onEnter: (c) => { if (active(c, 'sb_solo_revolution', 'warn')) c.stage('sb_solo_revolution', 'castle'); },
        },
        bonney: { speaker: 'Jewelry Bonney', text: '"Papa says the stones on my face are jewelry! That\'s why I\'m Jewelry Bonney!" (A little pink-haired girl peeks from behind the altar, a blue gem glinting on her cheek.) "Wanna see a trick? Hmmm..."', next: 'trick' },
        trick: {
          speaker: 'Jewelry Bonney', text: '(She points at you and squints.) "Ta-da! Now you\'re an old grandpa!" (For a moment your joints creak and your back bends... then it passes.) "Hehe! Papa says I\'m not allowed to do that to guests."',
          onEnter: (c) => { c.setFlag('sbMetBonney'); try { c.player?.addBuff?.({ id: 'sb_toshi', name: 'Aged (Bonney\'s prank)', dur: 15, mods: { speedMul: 0.85 } }); } catch (e) { /* cosmetic */ } },
          next: 'a',
        },
        jewel: {
          text: '"The stones on her skin are the same ones that took her mother, Ginny. Sapphire Scales, one doctor called it. Sunlight makes it worse." (His voice breaks.) "The Torino Kingdom has the greatest medical library in the South Blue. Would you ask them for me? I cannot leave her."',
          choices: [
            { text: 'I\'ll go to Torino.', do: (c) => c.startQuest('sb_jewel_sickness'), end: true },
            { text: 'I\'m sorry.', next: 'a' },
          ],
        },
        jewel_done: { text: '"...No cure." (Kuma is silent for a long time.) "Then I will find the man who can make one, whatever he asks of me." (He takes your hand in his enormous glove.) "Thank you for trying, friend."' },
        nika: { text: '"When I was a slave, my father told me about Nika — the warrior of liberation, who brings laughter to people in chains. He said Nika would come for us." (His feet begin to tap.) "The Rhythm of Liberation! Don, don, don-don!"', next: 'a' },
      },
    }),
  },
  {
    id: 'sb_bulldog', name: 'Bulldog', title: 'Former king of Sorbet', island: 'sorbet_kingdom', at: { town: 'sorbet_town', plaza: true, ox: -3 },
    look: { hair: 'short', hairColor: '#bdbdbd', hat: 'beanie', hatColor: '#fafafa', top: '#1e88e5', bottom: '#37474f', skin: '#f1c9a0' }, bulk: 1.1, level: 8,
    marker: (c, g) => {
      const s = stageOf(g, 'sb_solo_revolution');
      if (s === 'crown' || s === 'report') return '?';
      if (stageOf(g, 'sb_jewel_sickness') === 'report' && (s === 'fleet' || g.quests.isDone('sb_solo_revolution'))) return '?';
      return null;
    },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('sb_solo_revolution');
            if (s === 'castle' || s === 'bekori') return '"You\'re with the pastor? Bekori has shut himself in the palace with his Royal Army. Sixteen years ago the Freedom Fighters chased him out... and the fool came back with torches."';
            if (s === 'crown') return '"The palace is rubble and Bekori is gone — blown clean over the horizon by one paw!" (Outside, the crowd chants a name.) "The people want Kuma as their king. He\'s a pastor, not a politician... so I\'ll carry the paperwork. Heh. Some old kings never retire."';
            if (s === 'fleet') return '"Go! The landing party is on the southern beach!"';
            if (s === 'report') return '(Bulldog stands on the harbour wall, looking out to sea.)';
            if (done(ctx, 'sb_solo_revolution')) return '"The newspapers call Kuma a tyrant now. A TYRANT! The Government prints whatever Bekori paid for. Don\'t you believe a word of it."';
            return '"I was king of Sorbet once, a long time ago. Now I\'m just an old man who reads the newspapers very carefully."';
          },
          choices: [
            { text: 'Long live King Kuma.', if: () => active(ctx, 'sb_solo_revolution', 'crown'), do: (c) => c.stage('sb_solo_revolution', 'fleet'), next: 'fleet' },
            { text: 'Where is Kuma?', if: () => active(ctx, 'sb_solo_revolution', 'report'), do: (c) => c.complete('sb_solo_revolution'), next: 'gone' },
            { text: 'Kuma asked me about Bonney\'s sickness...', if: () => active(ctx, 'sb_jewel_sickness', 'report') && !['warn', 'castle', 'bekori', 'crown'].includes(ctx.game.quests.stageId('sb_solo_revolution')) && !findActor(ctx.game, 'sb_kuma'), do: (c) => c.complete('sb_jewel_sickness'), next: 'jewel' },
            { text: 'Goodbye.', end: true },
          ],
        },
        fleet: { text: '(Days pass. Then a messenger bursts in.) "Three Marine warships off the southern coast — and Bekori on the flagship, waving a World Government writ against \'the Tyrant Kuma\'!" (Bulldog grips your arm.) "Kuma has gone to meet them alone. Their landing party is heading for the southern beach. Go!"' },
        gone: { text: '"He left before sunrise. Said that as long as he stayed, Bekori and the Government would keep coming back." (Bulldog looks at the sea.) "He left me the kingdom... and his daughter. I\'m too old for both. But I\'ll manage. Thank you, friend. Sorbet won\'t forget."' },
        jewel: { text: '"No cure in Torino, eh?" (He sighs.) "Kuma has gone to sea looking for a doctor who can save her. If anyone can find one, it\'s him. I\'ll tell Bonney you tried."' },
      },
    }),
  },
  {
    id: 'sb_conney', name: 'Conney', title: 'Queen Dowager of Sorbet', island: 'sorbet_kingdom', at: { town: 'sorbet_town', building: "Conney's Sherbet Parlor" },
    look: { hair: 'bun', hairColor: '#eeeeee', top: '#ad1457', bottom: '#ad1457', coat: '#d7ccc8', hat: 'beanie', hatColor: '#4e342e', skin: '#f9dcc4' }, scale: 0.6, level: 3,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"A customer! Strawberry sherbet is the best thing in this kingdom, and I will fight anyone who says otherwise. Or perhaps a pizza? I make them THIS big." (She spreads her tiny arms as wide as they go.)',
          choices: [
            { text: 'Buy.', do: (c) => c.open('shop', { shop: 'sb_sherbet', building: { name: "Conney's Sherbet Parlor", role: 'shop' } }) },
            { text: 'Goodbye, your majesty.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_gyogyo', name: 'Gyogyo', title: 'Fishmonger of Castle Town', island: 'sorbet_kingdom', at: { town: 'sorbet_town', building: "Gyogyo's Fish Stall" },
    look: { hair: 'short', hairColor: '#4e342e', top: '#fafafa', bottom: '#5d4037', hat: 'cowboy', hatColor: '#8d6e63', skin: '#f1c9a0' }, bulk: 1.4, level: 10,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Fresh fish! Caught this morning by yours truly — Gyogyo, the greatest fishmonger in Sorbet!" (He leans in.) "You a friend of Kuma\'s? When they locked him up years ago, I started a riot in the square. I\'d do it again."',
          choices: [
            { text: 'Buy fish.', do: (c) => c.open('shop', { shop: 'sb_fish', building: { name: "Gyogyo's Fish Stall", role: 'market' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_granny_nougat', name: 'Granny Nougat', title: 'Elder of the Elderly Village', island: 'sorbet_kingdom', at: { town: 'sorbet_elder_village', building: 'Village Meeting Hall' },
    look: { hair: 'bun', hairColor: '#e0e0e0', top: '#6d4c41', bottom: '#8d6e63', skin: '#e0ac7e' }, scale: 0.85, level: 2,
    marker: (c, g) => (!g.quests.state('sb_solo_revolution') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('sb_solo_revolution');
            if (done(ctx, 'sb_solo_revolution')) return '"King Kuma has gone to sea, and the papers call him a tyrant. Ha! We know who carried us out of the fire."';
            if (s === 'fire') return '"They\'re here! Torches — the house by the well is already burning! Please!"';
            if (s) return '"The pastor walked into the flames for us. Into the flames! Then he went to the palace... and now there is no palace."';
            return '"King Bekori has come back! Sixteen years after the Freedom Fighters chased him out. Last night his soldiers painted red marks on our doors — the houses of the old and the poor. \'Deadweight,\' he calls us. He says a king in the east burned a whole slum and got medals for it."';
          },
          choices: [
            { text: 'I\'ll stop them.', if: () => !started(ctx, 'sb_solo_revolution'), do: (c) => c.startQuest('sb_solo_revolution'), end: true },
            { text: 'Stay safe, granny.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_gelato', name: 'Sergeant Gelato', title: 'Sorbet Royal Army torch squad', island: 'sorbet_kingdom', at: { town: 'sorbet_elder_village', plaza: true, ox: 2 }, hostile: true, named: true,
    faction: 'bandit', level: 8, style: 'ittoryu', weapon: 'sword', moves: ['itto_iai'], skill: 0.25,
    look: { hair: 'short', hairColor: '#5d4037', top: '#f8bbd0', bottom: '#fafafa', hat: 'captain', hatColor: '#ec407a' },
    alert: 'Orders from the king! Burn out the deadweight!',
    when: (c, g) => stageOf(g, 'sb_solo_revolution') === 'fire',
  },
  {
    id: 'sb_sundae', name: 'Commander Sundae', title: 'Commander of the Sorbet Royal Army', island: 'sorbet_kingdom', at: { town: 'sorbet_town', plaza: true, ox: 4 }, hostile: true, named: true,
    faction: 'bandit', level: 12, style: 'brawler', weapon: 'axe', moves: ['sb_halberd_sweep', 'sb_halberd_thrust'], skill: 0.35,
    look: { hair: 'short', hairColor: '#212121', top: '#f48fb1', bottom: '#fafafa', coat: '#fce4ec', hat: 'captain', hatColor: '#ec407a', skin: '#e0ac7e' }, bulk: 1.3,
    alert: 'The Royal Army of Sorbet does not negotiate with rabble!', barks: ['Hold the gate!', 'For the Heavenly Tribute!'],
    when: (c, g) => stageOf(g, 'sb_solo_revolution') === 'castle',
  },
  {
    id: 'sb_bekori', name: 'King Bekori', title: 'King of Sorbet', island: 'sorbet_kingdom', at: { town: 'sorbet_town', building: 'Sorbet Royal Palace' }, hostile: true, boss: true, hpMul: 1.2,
    faction: 'bandit', level: 11, style: 'sniper', weapon: 'gun', moves: ['sb_bekori_volley', 'snipe_explode'], ranged: true, prefRange: 7, skill: 0.35, breakthrough: 3,
    look: { hair: 'long', hairColor: '#d7ccc8', hat: 'crown', hatColor: '#fdd835', top: '#263238', bottom: '#263238', coat: '#4a148c', skin: '#f1c9a0', nose: 'red' }, bulk: 1.4,
    alert: '"A wise king must sometimes steel his heart and enact cruel reforms!"', barks: ['Guards! GUARDS!', 'Do you know what the Heavenly Tribute costs?!'],
    when: (c, g) => stageOf(g, 'sb_solo_revolution') === 'bekori' && !c.bosses.includes('sb_bekori'),
  },
  {
    id: 'sb_hawser', name: 'Commodore Hawser', title: 'Marine fleet escorting Bekori', island: 'sorbet_kingdom', at: { spot: 'sorbet_south_beach' }, faction: 'marine', boss: true, hpMul: 1.25, lethal: false,
    level: 18, style: 'rokushiki', moves: ['roku_soru', 'roku_rankyaku', 'roku_tekkai'], skill: 0.5, breakthrough: 3,
    look: { hair: 'short', hairColor: '#795548', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE', hat: 'marine', skin: '#e0ac7e' }, bulk: 1.2,
    alert: 'Resisting the World Government?! You\'ll hang beside the tyrant!', barks: ['Rankyaku!', 'By order of the World Government!'],
    when: (c, g) => stageOf(g, 'sb_solo_revolution') === 'fleet' && !c.bosses.includes('sb_hawser'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"By order of the World Government, King Bekori is restored and the tyrant Bartholomew Kuma is to be arrested. Stand aside, civilian." (Out at sea, a lone boat is heading straight for the warships. A giant man stands at its prow.)',
          choices: [
            { text: 'Kuma saved this country. Turn your boats around. (Fight)', if: () => !isMarine(ctx.char), do: (c) => aggro(c.game, findActor(c.game, 'sb_hawser')), end: true },
            { text: '"Commodore... the tyrant story is a lie. I won\'t fight for Bekori."', if: () => isMarine(ctx.char), next: 'stand' },
            { text: 'Say nothing.', end: true },
          ],
        },
        stand: { text: '"...Then stand aside, and pray the pastor is merciful." (Behind him, the flagship folds like paper under a giant padded palm.)', onEnter: (c) => { if (active(c, 'sb_solo_revolution', 'fleet')) c.stage('sb_solo_revolution', 'report'); } },
      },
    }),
  },
  {
    id: 'sb_nurse_mint', name: 'Nurse Mint', title: 'Castle Town Hospital', island: 'sorbet_kingdom', at: { town: 'sorbet_town', building: 'Castle Town Hospital' },
    look: { hair: 'ponytail', hairColor: '#a5d6a7', top: '#fafafa', bottom: '#fafafa', hat: 'bandana', hatColor: '#fafafa', skin: '#f9dcc4' }, level: 3,
    doctor: { line: '"Let\'s have a look. Hold still."' },
    marker: (c, g) => (!g.quests.state('sb_hospital_ledger') ? '!' : stageOf(g, 'sb_hospital_ledger') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'sb_hospital_ledger')) return '"The ledger is ash. Let them count the waves instead."';
            if (active(ctx, 'sb_hospital_ledger', 'agent')) return '"He\'s in the records room right now, copying names. Please..."';
            const bucc = ctx.char.race === 'buccaneer' ? ' (She stares at you.) "...You\'re one of them. Be careful."' : '';
            return '(She pulls you aside.) "Men in black suits copy our birth records every month. They only want babies born too big — Buccaneer babies. Nearly forty years ago they took a whole family that way: the Clapps, who ran the church."' + bucc;
          },
          choices: [
            { text: 'I\'ll deal with the agent.', if: () => !started(ctx, 'sb_hospital_ledger'), do: (c) => c.startQuest('sb_hospital_ledger'), end: true },
            { text: 'The agent is gone. Burn the ledger.', if: () => active(ctx, 'sb_hospital_ledger', 'report'), do: (c) => c.complete('sb_hospital_ledger'), next: 'burn' },
            { text: 'Treat my wounds.', do: (c) => c.open('doctor', {}) },
            { text: 'Goodbye.', end: true },
          ],
        },
        burn: { text: '(Nurse Mint feeds the ledger to the stove, page by page.) "Every baby in this book gets to grow up as nobody in particular. That\'s the best gift a hospital can give."' },
      },
    }),
  },
  {
    id: 'sb_quill', name: 'Agent Quill', title: 'Cipher Pol records agent', island: 'sorbet_kingdom', at: { town: 'sorbet_town', building: 'Castle Town Hospital', ox: 2.5 }, faction: 'cp', named: true,
    level: 12, style: 'rokushiki', moves: ['roku_soru', 'roku_rankyaku'], skill: 0.45,
    look: { hair: 'short', hairColor: '#9e9e9e', top: '#212121', bottom: '#212121', skin: '#f1c9a0', goggles: true },
    alert: 'Interfering with a World Government census. Noted.',
    when: (c, g) => stageOf(g, 'sb_hospital_ledger') === 'agent',
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Cipher Pol business. Move along." (He is copying names into a notebook: birth weight, height, the father\'s build.) "Just counting babies. The World Government likes to know who is born... and how big."',
          choices: [
            { text: 'Drop the notebook. (Fight — you will be wanted.)', if: () => !isMarine(ctx.char), do: (c) => aggro(c.game, findActor(c.game, 'sb_quill')), end: true },
            { text: '"Marine inspection. These records go to the branch office."', if: () => isMarine(ctx.char), next: 'marine' },
            { text: 'Walk away.', end: true },
          ],
        },
        marine: { text: '"The branch? Hmph. Take the dusty things, then. Nobody\'s found a Buccaneer here in forty years anyway." (He hands over the ledger and his notebook, and leaves.)', onEnter: (c) => { if (active(c, 'sb_hospital_ledger', 'agent')) c.stage('sb_hospital_ledger', 'report'); } },
      },
    }),
  },

  // ============================================================ BRISS KINGDOM
  {
    id: 'sb_briony', name: 'Archivist Briony', title: 'Royal Archives of Briss', island: 'briss_kingdom', at: { town: 'briss_town', building: 'Royal Archives of Briss' },
    look: { hair: 'bun', hairColor: '#5d4037', top: '#3949ab', bottom: '#283593', skin: '#f1c9a0' }, level: 3,
    marker: (c, g) => (!g.quests.state('sb_st_briss') ? '!' : stageOf(g, 'sb_st_briss') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'sb_st_briss')
            ? '"The St. Briss reached the sky. The SKY! I have rewritten the last page of her log a hundred times."'
            : '"Welcome to the Royal Archives of Briss." (She smiles; her teeth are coated black with tar, in the old South Blue fashion.) "The teeth? Tar keeps them strong for a lifetime. Our ancestors swore by it."'),
          choices: [
            { text: 'Read in the archives.', do: (c) => c.open('library', { building: { name: 'Royal Archives of Briss', role: 'library' } }) },
            { text: 'Tell me about the St. Briss.', if: () => !started(ctx, 'sb_st_briss'), next: 'ship' },
            { text: 'The St. Briss fell from the sky near Jaya.', if: () => active(ctx, 'sb_st_briss', 'report'), do: (c) => c.complete('sb_st_briss'), next: 'sky' },
            { text: 'Goodbye.', end: true },
          ],
        },
        ship: {
          text: '"Two hundred and ten years ago the exploration ship St. Briss sailed from this harbour for the Grand Line — our crest on her sails, a dragon on her prow. She never came back." (She opens a crumbling logbook.) "Sailors swear wrecks sometimes fall from the sky near an island called Jaya. Nonsense, surely..."',
          choices: [
            { text: 'I\'ll find out what happened to her.', do: (c) => { c.startQuest('sb_st_briss'); c.give('sb_st_briss_log', 1); }, end: true },
            { text: 'A sad story.', next: 'a' },
          ],
        },
        sky: { text: '"Fell from the SKY?! Then they found an island above the clouds..." (She clutches the log to her chest.) "And the tar on their teeth kept them smiling for two hundred years. Oh, our ancestors would laugh." (She presses a purse of old royal gold into your hands.)' },
      },
    }),
  },
  {
    id: 'sb_carvel', name: 'Master Carvel', title: 'Head shipwright, St. Briss Shipyard', island: 'briss_kingdom', at: { town: 'briss_town', building: 'St. Briss Shipyard' },
    look: { hair: 'short', hairColor: '#9e9e9e', top: '#6d4c41', bottom: '#3e2723', hat: 'bandana', hatColor: '#795548', skin: '#e0ac7e' }, bulk: 1.2, level: 8,
    marker: (c, g) => (!g.quests.state('sb_crab_hand') ? '!' : stageOf(g, 'sb_crab_hand') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (active(ctx, 'sb_crab_hand', 'raid')) return '"Crab-Hand Gyro and his crew are down by the St. Briss Memorial. They want my best sloop — free — or they burn the yard."';
            if (done(ctx, 'sb_crab_hand')) return '"The St. Briss II treating you well? She\'s no exploration ship, but she\'ll get you up Reverse Mountain."';
            return '"The St. Briss was built on this very slipway, two hundred years ago. Every shipwright in Briss still learns her lines." (He pats a half-finished hull.) "Reverse Mountain is north-west of here. Want your ship ready for it?"';
          },
          choices: [
            { text: 'Shipyard.', do: (c) => c.open('shipwright', {}) },
            { text: 'Trouble in the harbour?', if: () => !started(ctx, 'sb_crab_hand'), next: 'gyro' },
            { text: 'Gyro won\'t bother you again.', if: () => active(ctx, 'sb_crab_hand', 'report'), do: (c) => c.complete('sb_crab_hand'), next: 'ship' },
            { text: 'Goodbye.', end: true },
          ],
        },
        gyro: {
          text: '"Crab-Hand Gyro. A South Blue pirate with a steel crab claw for a hand. Says he\'ll be king of the New World, and my sloop is his tribute." (He spits.) "If someone ran him off, I\'d give that someone the sloop instead."',
          choices: [
            { text: 'I\'ll run him off.', do: (c) => c.startQuest('sb_crab_hand'), end: true },
            { text: 'Not my fight.', end: true },
          ],
        },
        ship: { text: '"Ha! Then she\'s yours. I\'ve moored her at the port. Name her the St. Briss II — and bring her back in one piece."' },
      },
    }),
  },
  {
    id: 'sb_sextant_sal', name: 'Sextant Sal', title: 'Navigator Supplies', island: 'briss_kingdom', at: { town: 'briss_town', building: 'Navigator Supplies (Log Poses!)' },
    look: { hair: 'long', hairColor: '#bdbdbd', top: '#1565c0', bottom: '#37474f', hat: 'tricorne', skin: '#f1c9a0' }, level: 3,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Heading for the Grand Line? You\'ll need a Log Pose — a compass spins like a top past Reverse Mountain. The mountain rises north-west of Briss, where the four seas meet. Ride the current up the canal, and pray."',
          choices: [
            { text: 'Browse.', do: (c) => c.open('shop', { shop: 'navigator', building: { name: 'Navigator Supplies', role: 'shop' } }) },
            { text: 'Thanks.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_dr_pitch', name: 'Dr. Pitch', title: 'Tar-tooth dentist (and surgeon)', island: 'briss_kingdom', at: { town: 'briss_town', building: 'Tar-Tooth Dentistry' },
    look: { hair: 'curly', hairColor: '#212121', top: '#fafafa', bottom: '#455a64', skin: '#e0ac7e', goggles: true }, level: 4,
    doctor: { line: '"Open wide— oh, it\'s the rest of you that\'s broken. Very well."' },
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Open wide! A good coat of tar and your teeth will outlive you — ask any skeleton from the old days." (He waves a steaming brush.)',
          choices: [
            { text: 'Coat my teeth (shop).', do: (c) => c.open('shop', { shop: 'sb_dentist', building: { name: 'Tar-Tooth Dentistry', role: 'shop' } }) },
            { text: 'Treat my wounds.', do: (c) => c.open('doctor', {}) },
            { text: 'No thanks.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_gyro', name: 'Crab-Hand Gyro', title: 'Captain of the Gyro Pirates', island: 'briss_kingdom', at: { spot: 'briss_pier' }, hostile: true, boss: true, hpMul: 1.2,
    faction: 'pirate', level: 15, style: 'ittoryu', weapon: 'sword', moves: ['sb_gyro_claw', 'itto_iai'], skill: 0.4, bounty: 16000000, infamy: true, breakthrough: 3,
    look: { hair: 'short', hairColor: '#3e2723', hat: 'tricorne', hatColor: '#212121', top: '#212121', coat: '#81d4fa', bottom: '#7e57c2', skin: '#f1c9a0', hand: '#ff7043', swords: 1 },
    alert: 'I\'m Crab-Hand Gyro! I\'ll be king of the New World — starting with your sloop!', barks: ['Snip snip!', 'The New World is waiting for me!'],
    when: (c, g) => stageOf(g, 'sb_crab_hand') === 'raid' && !c.bosses.includes('sb_gyro'),
  },

  // ================================================================ CENTAUREA
  {
    id: 'sb_gambo', name: 'Gambo', title: 'Deputy Commander, Revolutionary South Army', island: 'centaurea', at: { town: 'centaurea_town', building: 'The Cornflower Tavern' }, faction: 'revolutionary',
    look: { hair: 'short', hairColor: '#ffe0b2', hat: 'cowboy', hatColor: '#6d4c41', top: '#ffffff', bottom: '#5d4037', skin: '#f9dcc4' }, bulk: 1.5, level: 30,
    marker: (c, g) => (!g.quests.state('sb_centaurea') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (started(ctx, 'sb_centaurea')
            ? '"The camp is east, past the cornflower fields. Commander Lindbergh is expecting you."'
            : '(A round, egg-shaped man with a crescent moustache keeps his back to the wall.) "You\'re not Royal Guard. Good. Name\'s Gambo. Let\'s say I work for people who think Centaurea\'s crown has sold enough of its own citizens to slavers."'),
          choices: [
            { text: 'Who do you work for?', if: () => !started(ctx, 'sb_centaurea'), next: 'ra' },
            { text: 'Goodbye.', end: true },
          ],
        },
        ra: {
          text: '"The Revolutionary Army. South Army. Keep your voice down." (He slides a map across the table.) "We\'ve fought the crown for this island a long time. Soon we break the Royal Fortress, and we could use someone the guards don\'t know. Interested?"',
          choices: [
            { text: 'Count me in.', do: (c) => c.startQuest('sb_centaurea'), end: true },
            { text: 'I\'m no revolutionary.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_lindbergh', name: 'Lindbergh', title: 'Commander of the Revolutionary South Army', island: 'centaurea', at: { town: 'centaurea_camp', building: 'South Army Field HQ' }, race: 'mink', faction: 'revolutionary',
    look: { ...MINK_CREAM_CAT, top: '#5d4037', bottom: '#3e2723', goggles: true }, scale: 0.7, level: 45, style: 'sniper', weapon: 'gun', trainer: 'sb_south_army',
    marker: (c, g) => (['camp', 'report'].includes(stageOf(g, 'sb_centaurea')) ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('sb_centaurea');
            let t;
            if (s === 'camp') t = '(A small cream-furred cat Mink with a jetpack looks up from a blueprint.) "Lindbergh, South Army commander. The Royal Fortress is the crown\'s last stronghold, and a mercenary holds its gate: Suleiman the Beheader. Break the gate."';
            else if (s === 'gate' || s === 'marshal') t = '"The gate first, then Marshal Cyanus himself. We\'ll handle the garrison."';
            else if (done(ctx, 'sb_centaurea')) t = '"Another country falls. The papers will call it a revolution. The people will call it Tuesday." (He grins.) "Want to learn to shoot like a revolutionary?"';
            else t = '"The South Army doesn\'t recruit strangers off the street. Talk to Gambo in the city first."';
            if (ctx.char.race === 'mink') t += ' "...A Mink, this far from home? Garchu."';
            else if (isMarine(ctx.char) && s) t += ' "A Marine, helping us? We never met."';
            return t;
          },
          choices: [
            { text: 'Consider the gate broken.', if: () => active(ctx, 'sb_centaurea', 'camp'), do: (c) => c.stage('sb_centaurea', 'gate'), end: true },
            { text: 'Marshal Cyanus has fallen.', if: () => active(ctx, 'sb_centaurea', 'report'), do: (c) => c.complete('sb_centaurea'), next: 'fall' },
            { text: 'Train with Lindbergh.', if: () => done(ctx, 'sb_centaurea'), do: (c) => c.open('trainer', { trainer: 'sb_south_army' }) },
            { text: 'Goodbye.', end: true },
          ],
        },
        fall: { text: '"Then Centaurea is free. By tomorrow the World Government will announce that \'another country has fallen\'. Let them." (He salutes, paw to brow.) "The South Army won\'t forget you. Wear this — any revolutionary will know you."' },
      },
    }),
  },
  {
    id: 'sb_aster', name: 'Medic Aster', title: 'Field Hospital, South Army', island: 'centaurea', at: { town: 'centaurea_camp', building: 'Field Hospital' }, faction: 'revolutionary',
    look: { hair: 'ponytail', hairColor: '#7e57c2', top: '#fafafa', bottom: '#455a64', hat: 'bandana', hatColor: '#c62828', skin: '#e0ac7e' }, level: 9,
    doctor: { line: '"If you can walk in, you\'re not my priority. Sit down anyway."' },
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Field Hospital. We patch up rebels, royal guards and farmers alike — a wound doesn\'t care which flag you fly."',
          choices: [
            { text: 'Treat my wounds.', do: (c) => c.open('doctor', {}) },
            { text: 'Goodbye.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_suleiman', name: 'Suleiman the Beheader', title: 'War criminal and mercenary', island: 'centaurea', at: { spot: 'fort_gate' }, hostile: true, boss: true, hpMul: 1.3,
    faction: 'rival', level: 19, style: 'ittoryu', weapon: 'sword', moves: ['sb_suleiman_behead', 'itto_iai', 'itto_whirl'], skill: 0.55, bounty: 67000000, breakthrough: 3,
    look: { hair: 'long', hairColor: '#fff176', hat: 'captain', hatColor: '#212121', coat: '#212121', top: '#311b92', bottom: '#757575', skin: '#f1c9a0', scarEye: true, eyeColor: '#b39ddb', swords: 1 },
    alert: 'Exiled by my own country after Dias. Now I fight for whoever pays — tonight, the crown.', barks: ['Your head, please.', 'Nothing personal.'],
    when: (c, g) => stageOf(g, 'sb_centaurea') === 'gate' && !c.bosses.includes('sb_suleiman'),
  },
  {
    id: 'sb_cyanus', name: 'Marshal Cyanus', title: 'Marshal of the Royal Guard of Centaurea', island: 'centaurea', at: { town: 'centaurea_fort', building: 'Royal Guard Headquarters' }, hostile: true, boss: true, hpMul: 1.5,
    faction: 'rival', level: 22, style: 'ittoryu', weapon: 'sword', moves: ['sb_cyanus_lance', 'itto_pound', 'itto_whirl'], skill: 0.6, breakthrough: 4,
    look: { hair: 'short', hairColor: '#eceff1', top: '#283593', bottom: '#1a237e', coat: '#3949ab', hat: 'captain', hatColor: '#1a237e', skin: '#f1c9a0', scarEye: true, swords: 1 }, bulk: 1.3,
    alert: 'The crown bows to the World Government, and I bow to the crown. Rebels bow to no one — so rebels die.', barks: ['For the crown!', 'Centaurea is not yours!'],
    phases: [{ at: 0.5, run: (a, g) => { g.fx.text(a.x, a.y - 2.4, 'THE CROWN\'S LAST STAND!', '#7986cb', 0.5); a.addBuff({ id: 'sb_cyanus_rage', name: 'Last Stand', dur: 60, mods: { damage: 1.3, atkSpeed: 1.15 } }); } }],
    when: (c, g) => stageOf(g, 'sb_centaurea') === 'marshal' && !c.bosses.includes('sb_cyanus'),
  },

  // ========================================================== KUTSUKKU ISLAND
  {
    id: 'sb_kid', name: 'Eustass Kid', title: 'Gang boss of South Town', island: 'kutsukku_island', at: { spot: 'victoria_grave', ox: 1 }, lethal: false,
    look: { hair: 'spiky', hairColor: '#c62828', top: '#212121', bottom: '#5d4037', goggles: true, skin: '#f9dcc4' }, level: 17, style: 'brawler', moves: ['sb_kid_scrap', 'brawl_headbutt'], skill: 0.5,
    marker: (c, g) => (!g.quests.state('sb_victoria_punk') ? '!' : stageOf(g, 'sb_victoria_punk') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('sb_victoria_punk');
            if (done(ctx, 'sb_victoria_punk')) return '"When we meet on the Grand Line, don\'t get in my way. Next time, we\'re enemies. ...But I won\'t forget this."';
            if (s === 'test') return '"You want in? Killer decides who\'s worth anything. He\'s at the Masked Tavern in North Town. And don\'t laugh at his laugh."';
            if (s === 'heat' || s === 'wire') return '"Heat and Wire won\'t listen to me — we\'ve been fighting over the same streets since we were brats. Maybe they\'ll listen to an outsider who beat Killer."';
            if (s === 'syndicate') return '"Four towns. One gang. Tonight we tear the Grinder mansion down to the last bolt."';
            if (s === 'report') return '(Kid stands at the grave. Behind him, Killer, Heat and Wire are waiting.)';
            return '(A red-haired teenager with goggles stands at a fresh grave, knuckles bleeding.) "What are you looking at? ...She\'s dead. Victoria. The Grinder Family killed her." (He doesn\'t turn around.) "They run this whole island. I\'m going to take them apart. Bolt by bolt."';
          },
          choices: [
            { text: 'Let me help.', if: () => !started(ctx, 'sb_victoria_punk'), do: (c) => c.startQuest('sb_victoria_punk'), end: true },
            { text: 'The Grinder Family is finished.', if: () => active(ctx, 'sb_victoria_punk', 'report'), do: (c) => c.complete('sb_victoria_punk'), next: 'punk' },
            { text: 'Goodbye.', end: true },
          ],
        },
        punk: { text: '"Then nothing keeps us on this rock." (He looks at the grave.) "We\'re building a ship from the scrap of their mansion. Four gangs, one crew. We\'ll call her the Victoria Punk." (He tosses you a pistol.) "Built it myself. Don\'t die before I beat you."' },
      },
    }),
  },
  {
    id: 'sb_killer', name: 'Killer', title: 'Gang boss of North Town', island: 'kutsukku_island', at: { town: 'kutsukku_north', building: 'The Masked Tavern' }, lethal: false, named: true, duel: true,
    look: { hair: 'long', hairColor: '#fff59d', top: '#fafafa', bottom: '#1565c0', skin: '#f1c9a0', hat: 'goggles', hatColor: '#90a4ae', swords: 2 }, level: 13, style: 'nitoryu', weapon: 'sword', moves: ['sb_killer_punisher', 'nito_taka'], skill: 0.5,
    alert: '...', barks: ['...', 'Fassh— ...no.'],
    marker: (c, g) => (stageOf(g, 'sb_victoria_punk') === 'test' ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (active(ctx, 'sb_victoria_punk', 'test')) return '(A masked blond youth sharpens two scythe blades.) "Kid sent you." (His voice is muffled.) "Kid trusts too fast. Show me you won\'t die in the first minute."';
            if (ctx.char.defeated?.sb_killer) return '"You fight well. Fassha— ...Don\'t. Don\'t say anything about the laugh."';
            return '(The masked youth ignores you.)';
          },
          choices: [
            { text: 'Fight me.', if: () => active(ctx, 'sb_victoria_punk', 'test'), do: (c) => aggro(c.game, findActor(c.game, 'sb_killer')), end: true },
            { text: 'Leave.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_heat', name: 'Heat', title: 'Gang boss of East Town', island: 'kutsukku_island', at: { town: 'kutsukku_east', building: 'The Furnace' },
    look: { hair: 'long', hairColor: '#1565c0', top: '#fafafa', bottom: '#1a237e', skin: '#b0bec5' }, level: 12, style: 'brawler', moves: ['cabaji_fire'],
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            const s = ctx.game.quests.stageId('sb_victoria_punk');
            if (s === 'heat') return '"Kid sent an errand boy?" (A pale youth breathes out a lick of flame.) "The Grinders\' cleaver-man, Mazza, is torching my street right now. Stop him, and maybe I\'ll listen to Kid for once."';
            if (s && s !== 'test') return '"You stopped Mazza. East Town is in. Tell Kid he owes me."';
            return '(The pale youth breathes a smoke ring of real fire and says nothing.)';
          },
          choices: [{ text: 'Leave.', end: true }],
        },
      },
    }),
  },
  {
    id: 'sb_wire', name: 'Wire', title: 'Gang boss of West Town', island: 'kutsukku_island', at: { town: 'kutsukku_west', building: 'Trident Pier Tavern' },
    look: { hair: 'long', hairColor: '#4e342e', top: '#212121', bottom: '#212121', skin: '#e0ac7e' }, scale: 1.2, level: 12,
    marker: (c, g) => (stageOf(g, 'sb_victoria_punk') === 'wire' ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (active(ctx, 'sb_victoria_punk', 'wire')
            ? '(A lanky youth with a red trident listens without blinking.) "Killer lost a fight? And Heat\'s street is still standing?" (He stands.) "...Fine. Tell Kid: West Town is in."'
            : '(A lanky youth with a red trident watches the sea.)'),
          choices: [
            { text: '"For Victoria."', if: () => active(ctx, 'sb_victoria_punk', 'wire'), do: (c) => c.stage('sb_victoria_punk', 'syndicate'), end: true },
            { text: 'Leave.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_mazza', name: '"Cleaver" Mazza', title: 'Enforcer of the Grinder Family', island: 'kutsukku_island', at: { town: 'kutsukku_east', plaza: true, ox: 2 }, hostile: true, named: true,
    faction: 'bandit', level: 14, style: 'brawler', weapon: 'axe', moves: ['sb_cleaver_chop', 'brawl_tackle'], skill: 0.35,
    look: { hair: 'buzz', hairColor: '#212121', top: '#4e342e', bottom: '#212121', hat: 'bandana', hatColor: '#212121', skin: '#e0ac7e' }, bulk: 1.4,
    alert: 'The Grinder Family owns this street. And now I own you.',
    when: (c, g) => stageOf(g, 'sb_victoria_punk') === 'heat',
  },
  {
    id: 'sb_don_grinder', name: 'Don Grinder', title: 'Head of the Grinder Family', island: 'kutsukku_island', at: { spot: 'grinder_mansion' }, hostile: true, boss: true, hpMul: 1.4,
    faction: 'bandit', level: 18, style: 'sniper', weapon: 'gun', moves: ['sb_buckshot', 'snipe_explode', 'brawl_tackle'], ranged: true, prefRange: 5, skill: 0.45, breakthrough: 3,
    look: { hair: 'pompadour', hairColor: '#212121', top: '#fafafa', bottom: '#212121', coat: '#212121', skin: '#e0ac7e' }, bulk: 1.5,
    alert: 'Kids. Kids with toys. The World Government doesn\'t even come to Kutsukku — nobody\'s coming to save you.', barks: ['Grind \'em up!', 'I own this island!'],
    phases: [{ at: 0.4, run: (a, g) => { g.fx.text(a.x, a.y - 2.4, 'NOBODY TOUCHES THE DON!', '#ff8a65', 0.45); a.addBuff({ id: 'sb_don_rage', name: 'Fury', dur: 45, mods: { damage: 1.3 } }); } }],
    when: (c, g) => stageOf(g, 'sb_victoria_punk') === 'syndicate' && !c.bosses.includes('sb_don_grinder'),
  },
  {
    id: 'sb_udon_man', name: 'Old Katsuo', title: 'Curry Udon Stand', island: 'kutsukku_island', at: { town: 'kutsukku_town', building: 'Curry Udon Stand' },
    look: { hair: 'bald', top: '#fafafa', bottom: '#5d4037', hat: 'headband', hatColor: '#fafafa', skin: '#e0ac7e' }, level: 2,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Curry udon, hot and spicy! ...Victoria used to eat here with those two troublemakers, Kid and Killer. Once she spilled broth all over herself and they laughed — so she beat them both black and blue!" (He wipes his eyes.) "They never eat curry udon anymore."',
          choices: [
            { text: 'A bowl, please.', do: (c) => c.open('shop', { shop: 'sb_udon', building: { name: 'Curry Udon Stand', role: 'restaurant' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_rivet', name: 'Rivet', title: 'Scrapyard shipwright', island: 'kutsukku_island', at: { town: 'kutsukku_town', building: 'Scrapyard Slipway' },
    look: { hair: 'spiky', hairColor: '#ff7043', top: '#8d6e63', bottom: '#455a64', goggles: true, skin: '#f1c9a0' }, scale: 0.85, level: 5,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Need repairs? I learned from Kid — he can build anything out of junk. I once saw him make a tin man that walked!"',
          choices: [
            { text: 'Shipyard.', do: (c) => c.open('shipwright', {}) },
            { text: 'Goodbye.', end: true },
          ],
        },
      },
    }),
  },

  // ===================================================================== TUMI
  {
    id: 'sb_inti', name: 'Inti', title: 'Leader of the rebels of Tumi', island: 'tumi', at: { town: 'tumi_town', building: 'Rebel Command' }, faction: 'revolutionary',
    look: { hair: 'long', hairColor: '#212121', top: '#c62828', bottom: '#5d4037', hat: 'headband', hatColor: '#fdd835', skin: '#a0643a' }, level: 10,
    marker: (c, g) => (!g.quests.state('sb_tumi_tower') ? '!' : stageOf(g, 'sb_tumi_tower') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'sb_tumi_tower')
            ? '"You saw him too, didn\'t you? The giant with the paws. Out of thin air — one hand raised — and the tower was simply gone." (He laughs, still shaking.) "Tumi is free."'
            : '"Three years of civil war. Three years!" (A rebel in a sun-yellow headband slams the map table.) "We begged the Revolutionary Army for help. They\'re busy with refugees from some burnt slum in the East Blue. So it\'s us — against General Huaca and his tower."'),
          choices: [
            { text: 'I\'ll take the tower.', if: () => !started(ctx, 'sb_tumi_tower'), do: (c) => c.startQuest('sb_tumi_tower'), end: true },
            { text: 'General Huaca is beaten.', if: () => active(ctx, 'sb_tumi_tower', 'report'), next: 'kuma' },
            { text: 'Goodbye.', end: true },
          ],
        },
        kuma: {
          text: '(The ground shudders. On the ridge stands a giant man with a Bible in one hand, raising a padded palm toward the tower.) "Who—?!" (The air folds. The Loyalist Tower bursts into dust.) "...A revolutionary. It has to be. TUMI IS FREE!"',
          onEnter: (c) => {
            if (!active(c, 'sb_tumi_tower', 'report')) return;
            c.setFlag('sbTowerRuined');
            const t = ruinTower(c.game);
            if (t) pawBlast(c.game, t.x, t.y - 2, false);
            c.complete('sb_tumi_tower');
          },
        },
      },
    }),
  },
  {
    // (the chapter on Tumi promises that some of Inti's people might follow you to sea)
    id: 'sb_killa', name: 'Killa', title: 'Rebel sharpshooter of Tumi', island: 'tumi', at: { town: 'tumi_town', door: 'Rebel Command', ox: -1.8 }, faction: 'revolutionary',
    look: { hair: 'long', hairColor: '#212121', skin: '#a1693f', top: '#bf360c', bottom: '#4e342e', coat: '#6d4c41', hat: 'bandana', hatColor: '#f9a825', fem: true }, level: 9, style: 'sniper', weapon: 'gun',
    recruit: { role: 'sniper', requires: (c, g) => g.quests.isDone('sb_tumi_tower'), pitch: '"The tower is ours, and Inti doesn\'t need another rifle now. You do. I can hit a gull on the wing from the top of the Sun Gate. Let me prove it on the Grand Line, captain."' },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'sb_tumi_tower')
            ? '"Huaca is finished. For the first time in three years I slept a whole night." (She checks the sights of her rifle anyway.) "Old habits."'
            : '"Three years I\'ve been shooting at that tower. Huaca\'s men shoot back from behind stone; we shoot back from behind laundry." (She spits.) "If Inti would only let us rush it."'),
          choices: [{ text: 'Goodbye.', end: true }],
        },
      },
    }),
  },
  {
    id: 'sb_huaca', name: 'General Huaca', title: 'Commander of the loyalist army of Tumi', island: 'tumi', at: { spot: 'tumi_tower' }, hostile: true, boss: true, hpMul: 1.25,
    faction: 'bandit', level: 16, style: 'ittoryu', weapon: 'sword', moves: ['itto_iai', 'itto_pound', 'sb_halberd_sweep'], skill: 0.45, breakthrough: 3,
    look: { hair: 'short', hairColor: '#212121', top: '#33691e', bottom: '#1b5e20', coat: '#827717', hat: 'captain', hatColor: '#33691e', skin: '#a0643a', swords: 1 }, bulk: 1.3,
    alert: 'The rebels send an outsider? Tumi\'s army will bury you under this tower!',
    when: (c, g) => stageOf(g, 'sb_tumi_tower') === 'tower' && !c.bosses.includes('sb_huaca'),
  },

  // ================================================= EVIL BLACK DRUM KINGDOM
  {
    id: 'sb_wapol', name: '"Tin-Plate" Wapol', title: 'King of the Evil Black Drum Kingdom', island: 'evil_black_drum', at: { town: 'black_drum_town', building: 'Evil Black Drum Castle' }, boss: true, hpMul: 1.4,
    faction: 'bandit', level: 16, style: 'brawler', moves: ['sb_wapol_munch', 'sb_wapol_bero'], skill: 0.35, breakthrough: 3,
    look: { hair: 'short', hairColor: '#212121', hat: 'crown', hatColor: '#b0bec5', top: '#fafafa', bottom: '#1a237e', coat: '#212121', skin: '#fbe9e7', grin: true, sharpTeeth: true }, bulk: 1.6,
    alert: 'Mahahaha! I\'ll eat you, and then I\'ll eat your ship!', barks: ['Baku Baku!', 'Mahahaha!', 'Do you know how rich I am?!'],
    when: (c) => !c.bosses.includes('sb_wapol'),
    marker: (c, g) => (stageOf(g, 'sb_tin_plate') === 'fight' ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Mahahaha! Kneel, peasant! I am Wapol — king of the Evil Black Drum Kingdom and president of the Wapol Konzern! The World Nobles themselves gave me this kingdom, because I am RICH!" (Behind him, Queen Kinderella files her nails and Hakowan wags his box-shaped head.)',
          choices: [
            { text: 'Your workers want their wages. (Fight)', if: () => active(ctx, 'sb_tin_plate', 'fight'), do: (c) => aggro(c.game, findActor(c.game, 'sb_wapol')), end: true },
            { text: 'Goodbye, your majesty.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_tinker_pim', name: 'Tinker Pim', title: 'Worker at the Baku Baku Factory', island: 'evil_black_drum', at: { town: 'black_drum_town', building: 'Baku Baku Factory' },
    look: { hair: 'ponytail', hairColor: '#ff8a65', top: '#78909c', bottom: '#455a64', hat: 'bandana', hatColor: '#455a64', skin: '#f9dcc4' }, level: 3,
    marker: (c, g) => (!g.quests.state('sb_tin_plate') ? '!' : stageOf(g, 'sb_tin_plate') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'sb_tin_plate')
            ? '"The king paid us! In full! He cried the whole time. Best day of my life."'
            : '"Welcome to the Baku Baku Factory, where King Wapol eats scrap and spits out toys! ...And we sort the scrap, fourteen hours a day, for a spoonful of soup." (She shows blistered hands.) "Last week he ate the clock tower because it chimed during his nap."'),
          choices: [
            { text: 'I\'ll have a word with the king.', if: () => !started(ctx, 'sb_tin_plate'), do: (c) => c.startQuest('sb_tin_plate'), end: true },
            { text: 'The king has been taught a lesson.', if: () => active(ctx, 'sb_tin_plate', 'report'), do: (c) => c.complete('sb_tin_plate'), next: 'thanks' },
            { text: 'Goodbye.', end: true },
          ],
        },
        thanks: { text: '"You beat the Tin-Plate King?!" (The whole factory cheers.) "Here — a bar of Wapometal. He\'ll never notice. He eats them by the dozen."' },
      },
    }),
  },

  // ============================================================ SAMBA KINGDOM
  {
    id: 'sb_moqueca', name: 'King Moqueca', title: 'King of the Samba Kingdom', island: 'samba_kingdom', at: { town: 'samba_town', building: 'Palace of King Moqueca' },
    look: { hair: 'short', hairColor: '#212121', hat: 'crown', hatColor: '#43a047', top: '#fafafa', bottom: '#f9a825', coat: '#e53935', skin: '#c68642' }, bulk: 1.4, scale: 0.85, level: 5,
    marker: (c, g) => (!g.quests.state('sb_samba_carnival') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'sb_samba_carnival')) return '"Pascia is dancing again and the drums are louder than ever! You must stay for the next carnival!"';
            if (started(ctx, 'sb_samba_carnival')) return '"The drummers saw a boat with nets slip toward a cove on the east coast. Hurry!"';
            return '"Welcome, welcome to the Samba Kingdom! Tonight is carnival! Drums till dawn!" (The short, round king shimmies; the palm-tree feathers on his hat bounce.) "...Well. It was supposed to be."';
          },
          choices: [
            { text: 'Something wrong, your majesty?', if: () => !started(ctx, 'sb_samba_carnival'), next: 'lost' },
            { text: 'Goodbye.', end: true },
          ],
        },
        lost: {
          text: '"Pascia, the finest dancer in the South Blue — gone from the stage! Slavers, they say. They sell dancers to nobles at some auction in the Grand Line." (He has stopped dancing.) "Please. Find her."',
          choices: [
            { text: 'I\'ll bring her back.', do: (c) => c.startQuest('sb_samba_carnival'), end: true },
            { text: 'I can\'t.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_pascia', name: 'Pascia', title: 'Dancer of the Samba Kingdom', island: 'samba_kingdom', at: { spot: 'carnival_stage' },
    look: { hair: 'long', hairColor: '#212121', top: '#e91e63', bottom: '#fdd835', skin: '#a0643a' }, level: 5,
    when: (c, g) => stageOf(g, 'sb_samba_carnival') === 'report' || g.quests.isDone('sb_samba_carnival'),
    marker: (c, g) => (stageOf(g, 'sb_samba_carnival') === 'report' ? '?' : null),
    recruit: { role: 'musician', requires: (c, g) => g.quests.isDone('sb_samba_carnival'), pitch: '"The Grand Line has auctions for girls like me... and ships that sail right past them. I\'d rather be on the ship. Nobody tires when I\'m drumming — I\'ll keep your crew on its feet!"' },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (active(ctx, 'sb_samba_carnival', 'report')
            ? '"You came for me... thank you!" (She is still shaking.) "The slavers said I\'d fetch a fortune in the Grand Line. \'Sabaody\', they kept saying." (She smiles.) "Tell the king I\'m dancing tonight!"'
            : '"Stay for the carnival! Samba is the heartbeat of the South Blue!"'),
          choices: [
            { text: 'You\'re safe now. Go dance.', if: () => active(ctx, 'sb_samba_carnival', 'report'), do: (c) => c.complete('sb_samba_carnival'), end: true },
            { text: 'Dance well, Pascia.', if: () => !active(ctx, 'sb_samba_carnival', 'report'), end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_bakalao', name: '"Net-Hand" Bakalao', title: 'Slaver captain', island: 'samba_kingdom', at: { spot: 'slaver_cove' }, hostile: true, boss: true, hpMul: 1.0,
    faction: 'pirate', level: 12, style: 'brawler', moves: ['sb_slaver_net', 'brawl_tackle', 'brawl_headbutt'], skill: 0.35, bounty: 9000000, infamy: true, breakthrough: 2,
    look: { hair: 'bald', top: '#37474f', bottom: '#263238', hat: 'bandana', hatColor: '#455a64', skin: '#e0ac7e', scarEye: true }, bulk: 1.3,
    alert: 'Merchandise doesn\'t talk back. Neither will you, once you\'re in a net.', barks: ['Into the net!', 'You\'d fetch a good price too.'],
    when: (c, g) => stageOf(g, 'sb_samba_carnival') === 'fight' && !c.bosses.includes('sb_bakalao'),
  },

  // ============================================================= TAYA KINGDOM
  {
    id: 'sb_aramaki', name: 'Officer Aramaki', title: 'Taya Police', island: 'taya_kingdom', at: { town: 'taya_town', building: 'Taya Police Station' }, ai: 'idle',
    look: { hair: 'long', hairColor: '#2e7d32', top: '#1565c0', bottom: '#0d47a1', hat: 'captain', hatColor: '#0d47a1', skin: '#e0ac7e' }, scale: 1.4, bulk: 1.2, level: 90, fixedPower: 99999,
    marker: (c, g) => (!g.quests.state('sb_taya_bounty') ? '!' : stageOf(g, 'sb_taya_bounty') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'sb_taya_bounty')
            ? '"Word is the World Government wants to \'draft\' me. Me! I\'m a simple country cop." (He yawns enormously.) "Guess I\'d better not get arrested before then, eh?"'
            : '(An enormous green-haired policeman lounges behind the desk, boots on the table.) "Officer Aramaki, Taya Police. Bounty hunter? Pirate? Tourist? ...Don\'t care, as long as you don\'t make paperwork."'),
          choices: [
            { text: 'Any work for a bounty hunter?', if: () => !started(ctx, 'sb_taya_bounty'), next: 'job' },
            { text: 'Burl is caught.', if: () => active(ctx, 'sb_taya_bounty', 'report'), do: (c) => c.complete('sb_taya_bounty'), next: 'paid' },
            { text: 'Bounty board.', do: (c) => c.open('bounty', { building: { name: 'Taya Police Station', role: 'bounty' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
        job: {
          text: '"There\'s a bandit in the deep forest. \'Rootcutter\' Burl. Robs the lumber carts, fells the trees nobody\'s allowed to fell." (He stretches.) "I\'d go myself, but the forest and I... we get along a little too well. Bring him in."',
          choices: [
            { text: 'I\'ll bring him in.', do: (c) => c.startQuest('sb_taya_bounty'), end: true },
            { text: 'Not now.', end: true },
          ],
        },
        paid: { text: '"You caught Burl? Huh. Saves me a walk." (He tosses you a pouch without getting up.)' },
      },
    }),
  },
  {
    id: 'sb_burl', name: '"Rootcutter" Burl', title: 'Forest bandit', island: 'taya_kingdom', at: { spot: 'bandit_camp' }, hostile: true, named: true,
    faction: 'bandit', level: 10, style: 'brawler', weapon: 'axe', moves: ['sb_cleaver_chop', 'brawl_tackle'], skill: 0.3, bounty: 3000000,
    look: { hair: 'curly', hairColor: '#6d4c41', top: '#558b2f', bottom: '#3e2723', hat: 'bandana', hatColor: '#33691e', skin: '#e0ac7e' }, bulk: 1.3,
    alert: 'Timber! That\'s you falling, by the way.',
    when: (c, g) => stageOf(g, 'sb_taya_bounty') === 'hunt',
  },

  // ========================================================== ROSHWAN KINGDOM
  {
    id: 'sb_beer_vi', name: 'King Beer VI', title: 'King of the Roshwan Kingdom', island: 'roshwan_kingdom', at: { town: 'roshwan_town', building: 'Palace of the Tankards' },
    look: { hair: 'short', hairColor: '#212121', hat: 'horns', hatColor: '#212121', top: '#b71c1c', bottom: '#b71c1c', coat: '#1565c0', skin: '#f1c9a0' }, bulk: 1.2, level: 6,
    marker: (c, g) => (!g.quests.state('sb_matryo') ? '!' : stageOf(g, 'sb_matryo') === 'report' ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'sb_matryo')) return '"All four of my princesses, nested safe at home! Roshwan is in your debt. Cheers!" (Two tankards clink.)';
            if (started(ctx, 'sb_matryo')) return '"My littlest, Matryosoka, ran toward the ice caves east of the city to see the snow wolves. Before nightfall, please!"';
            return '"Cheers! Welcome to the Roshwan Kingdom, traveller! I am Beer the Sixth." (He raises a tankard.) "My daughters are the Matryo Princesses — each one smaller than the last, and each one more trouble."';
          },
          choices: [
            { text: 'Your majesty looks worried.', if: () => !started(ctx, 'sb_matryo'), next: 'lost' },
            { text: 'Princess Matryosoka is safe.', if: () => active(ctx, 'sb_matryo', 'report'), do: (c) => c.complete('sb_matryo'), next: 'a' },
            { text: 'Goodbye.', end: true },
          ],
        },
        lost: {
          text: '"Matryosaka, Matryosuka, Matryoseka... and the smallest, Matryosoka, is missing! She was talking about the fluffy snow wolves in the ice caves all week." (He puts down his tankard.) "Please find her."',
          choices: [
            { text: 'I\'ll find her.', do: (c) => c.startQuest('sb_matryo'), end: true },
            { text: 'Sorry, I can\'t.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_matryo_sisters', name: 'The Matryo Princesses', title: 'Matryosaka, Matryosuka & Matryoseka', island: 'roshwan_kingdom', at: { town: 'roshwan_town', building: 'Palace of the Tankards', ox: 3 },
    look: { hair: 'short', hairColor: '#fff176', hat: 'bandana', hatColor: '#c62828', top: '#fafafa', bottom: '#e53935', skin: '#ffe0e0' }, bulk: 1.5, scale: 0.9, level: 2,
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"We are the Matryo Princesses!" (Three round princesses in red headscarves speak in perfect unison, from the largest to the smallest.) "Our littlest sister is always running off. She fits through gaps we can\'t!"' } } }),
  },
  {
    id: 'sb_matryosoka', name: 'Princess Matryosoka', title: 'The smallest Matryo Princess', island: 'roshwan_kingdom', at: { spot: 'frozen_cave', ox: 2 },
    look: { hair: 'short', hairColor: '#fff176', hat: 'bandana', hatColor: '#c62828', top: '#fafafa', bottom: '#e53935', skin: '#ffe0e0' }, bulk: 1.4, scale: 0.55, level: 1,
    when: (c, g) => ['search', 'wolves', 'report'].includes(stageOf(g, 'sb_matryo')),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (active(ctx, 'sb_matryo', 'report')
            ? '"Brrr! The wolves were so fluffy until they tried to eat me. Take me home, please! ...And don\'t tell my big sisters I cried."'
            : '"H-help! The fluffy wolves aren\'t friendly at all!"'),
        },
      },
    }),
  },
  {
    id: 'sb_snow_wolf_alpha', name: 'Snow Wolf Alpha', title: 'Leader of the ice-cave pack', island: 'roshwan_kingdom', at: { spot: 'frozen_cave' }, hostile: true, named: true,
    faction: 'beast', level: 10, style: 'brawler', moves: ['brawl_tackle', 'kuro_claws'], skill: 0.3, hpMul: 1.4,
    look: { skin: '#eceff1', fur: '#eceff1', hairColor: '#eceff1', top: '#eceff1', bottom: '#cfd8dc', ears: 'pointy', tail: 'fluffy', muzzle: true, furFace: true, hair: 'bald' }, bulk: 1.3,
    alert: 'AWOOOOO!',
    when: (c, g) => stageOf(g, 'sb_matryo') === 'wolves',
  },

  // ============================================================ VESPA KINGDOM
  {
    id: 'sb_vespa_recruiter', name: 'Recruiting Officer Lampo', title: 'Marine Recruitment Office, Vespa', island: 'vespa_kingdom', at: { town: 'vespa_town', building: 'Marine Recruitment Office' }, faction: 'marine',
    look: { hair: 'short', hairColor: '#795548', top: '#fafafa', bottom: '#1b4f72', hat: 'marine', skin: '#f1c9a0' }, level: 12,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"The Marines are always looking for recruits from Vespa. The most famous one? A lazy beanpole who napped under every tree in the kingdom — Kuzan. They say he wears an Admiral\'s coat now. Makes you think, doesn\'t it?"',
          choices: [
            { text: 'Enlist in the Marines.', if: () => !isMarine(ctx.char), do: (c) => c.emit('marineEnlist', 'Vespa'), end: true },
            { text: 'Marine business.', if: () => isMarine(ctx.char), do: (c) => c.emit('marineOffice', { name: 'Vespa Recruitment Office' }), end: true },
            { text: 'Marine drills.', if: () => isMarine(ctx.char), do: (c) => c.open('trainer', { trainer: 'marine_instructor' }) },
            { text: 'Goodbye.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'sb_nonna_pina', name: 'Nonna Pina', title: 'Vespa\'s oldest resident', island: 'vespa_kingdom', at: { spot: 'lazy_bench' }, ai: 'idle',
    look: { hair: 'bun', hairColor: '#eeeeee', top: '#6a1b9a', bottom: '#4a148c', skin: '#f1c9a0' }, scale: 0.85, level: 1,
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"This bench? A tall boy used to sleep here with a mask over his eyes, every afternoon. Kuzan, his name was. Lazy as a cat — but when the fishing boat caught fire, he was in the water before anyone else." (She smiles.) "Justice doesn\'t have to hurry, he used to say."' } } }),
  },
];

// ----------------------------------------------------------- enemy groups
const groups = [
  { island: 'baterilla', spot: 'cottage_path', radius: 4, enemies: [['marine', 7, { name: 'Search Patrol Marine' }], ['marine_rifle', 7, { name: 'Search Patrol Rifleman' }]],
    when: (c, g) => stageOf(g, 'sb_rouge_secret') === 'patrol' && c.faction !== 'marine' },
  { island: 'sorbet_kingdom', spot: 'elder_square', radius: 5, enemies: [['sb_royal_soldier', 7, { name: 'Torch-bearing Soldier' }], ['sb_royal_soldier', 7, { name: 'Torch-bearing Soldier' }]],
    when: (c, g) => stageOf(g, 'sb_solo_revolution') === 'fire' },
  { island: 'sorbet_kingdom', spot: 'castle_square', radius: 6, enemies: [['sb_royal_soldier', 9], ['sb_royal_soldier', 9], ['pirate_gunner', 9, { name: 'Royal Musketeer', faction: 'bandit', look: { top: '#f8bbd0', hat: 'captain', hatColor: '#f06292' } }]],
    when: (c, g) => ['castle', 'bekori'].includes(stageOf(g, 'sb_solo_revolution')) },
  { island: 'sorbet_kingdom', spot: 'sorbet_south_beach', radius: 5, enemies: [['marine', 12, { name: 'Landing Party Marine' }], ['marine_rifle', 12, { name: 'Landing Party Rifleman' }], ['marine', 12, { name: 'Landing Party Marine' }]],
    when: (c, g) => stageOf(g, 'sb_solo_revolution') === 'fleet' && c.faction !== 'marine' },
  { island: 'briss_kingdom', spot: 'briss_pier', radius: 5, enemies: [['pirate', 11, { name: 'Gyro Pirate' }], ['pirate', 11, { name: 'Gyro Pirate' }], ['pirate_gunner', 11, { name: 'Gyro Pirate Gunner' }]],
    when: (c, g) => stageOf(g, 'sb_crab_hand') === 'raid' },
  { island: 'centaurea', spot: 'fort_gate', radius: 5, enemies: [['sb_crown_mercenary', 15], ['sb_crown_mercenary', 15], ['marine_rifle', 15, { name: 'Royal Guard Rifleman', faction: 'rival', lethal: true, look: { top: '#283593', bottom: '#1a237e', hat: 'captain', hatColor: '#1a237e' } }]],
    when: (c, g) => stageOf(g, 'sb_centaurea') === 'gate' },
  { island: 'centaurea', spot: 'fort_square', radius: 5, enemies: [['sb_crown_mercenary', 17, { name: 'Royal Guard' }], ['sb_crown_mercenary', 17, { name: 'Royal Guard' }]],
    when: (c, g) => stageOf(g, 'sb_centaurea') === 'marshal' },
  { island: 'kutsukku_island', spot: 'east_square', radius: 5, enemies: [['sb_grinder_thug', 11], ['sb_grinder_thug', 11]],
    when: (c, g) => stageOf(g, 'sb_victoria_punk') === 'heat' },
  { island: 'kutsukku_island', spot: 'grinder_mansion', radius: 6, enemies: [['sb_grinder_thug', 13], ['pirate_gunner', 13, { name: 'Grinder Gunman', faction: 'bandit' }], ['sb_grinder_thug', 13]],
    when: (c, g) => stageOf(g, 'sb_victoria_punk') === 'syndicate' },
  { island: 'tumi', spot: 'tumi_tower', radius: 5, enemies: [['sb_loyalist', 12], ['sb_loyalist', 12]],
    when: (c, g) => stageOf(g, 'sb_tumi_tower') === 'tower' },
  { island: 'samba_kingdom', spot: 'slaver_cove', radius: 5, enemies: [['pirate', 9, { name: 'Slaver' }], ['pirate_gunner', 9, { name: 'Slaver Gunner' }]],
    when: (c, g) => stageOf(g, 'sb_samba_carnival') === 'fight' },
  { island: 'taya_kingdom', spot: 'bandit_camp', radius: 5, enemies: [['bandit', 8, { name: 'Rootcutter Bandit' }], ['bandit', 8, { name: 'Rootcutter Bandit' }]],
    when: (c, g) => stageOf(g, 'sb_taya_bounty') === 'hunt' },
  { island: 'roshwan_kingdom', spot: 'frozen_cave', radius: 5, enemies: [['sb_snow_wolf', 8], ['sb_snow_wolf', 8]],
    when: (c, g) => stageOf(g, 'sb_matryo') === 'wolves' },
];
// the squads spawned right away when their stage starts on a populated island
const SQUAD = (islandId, spot) => groups.find((gr) => gr.island === islandId && gr.spot === spot);
const spawnSquad = (g, islandId, spot) => { const gr = SQUAD(islandId, spot); if (gr && (!gr.when || gr.when(g.state?.char, g))) squad(g, islandId, spot, gr.enemies, gr.radius); };

// --------------------------------------------------------------------- quests
const quests = [
  {
    id: 'sb_rouge_secret', name: 'The Woman Who Waited', island: 'baterilla', kind: 'story',
    summary: 'The Marines are searching Baterilla for the Pirate King\'s unborn child. A woman on the hill has a secret.',
    stages: [
      { id: 'visit', desc: 'Bring Pimienta\'s hibiscus tea to the woman on the hill, north-east of Baterilla Village.', npc: 'sb_rouge' },
      { id: 'patrol', desc: 'A Marine search patrol is coming up the cottage path. Stop Lieutenant Gablin.', goal: { type: 'defeat', npc: 'sb_gablin' },
        onStart: (ctx, g) => { if (isMarine(g.state?.char)) { spawnNow(g, 'sb_gablin'); return; } fightAt(g, 'sb_gablin', 'baterilla', 'cottage_path'); spawnSquad(g, 'baterilla', 'cottage_path'); } },
      { id: 'hound', desc: 'A Cipher Pol agent has the midwife\'s birth ledger. Deal with him at the Marine Search Camp.', goal: { type: 'defeat', npc: 'sb_pointer' },
        onStart: (ctx, g) => { if (g.state?.char?.bosses?.includes('sb_pointer')) { setTimeout(() => g.quests.next('sb_rouge_secret'), 0); return; } if (populated(g, 'baterilla')) spawnNow(g, 'sb_pointer'); } },
      { id: 'wait', desc: 'Rouge must hold on until the searchers give up. Let a few days pass (rest at the inn), then visit her.', npc: 'sb_rouge',
        onStart: (ctx, g) => { const c = g.state?.char; if (c) c.flags.sbRougeDay = g.env.day; } },
      { id: 'birth', desc: 'Stay with Rouge.', npc: 'sb_rouge' },
      { id: 'garp', desc: 'Talk to the Marine who came for the child.', npc: 'sb_garp',
        onStart: (ctx, g) => { setTimeout(() => { despawn(g, 'sb_rouge'); if (populated(g, 'baterilla')) spawnNow(g, 'sb_garp'); }, 60); } },
    ],
    rewards: { berries: 12000, points: 2, attrs: { wil: 1 }, items: [['sb_rouge_hibiscus', 1]] },
    onComplete: (ctx, g) => { g.log('You keep your word. For twenty years, nobody will learn that the Pirate King had a son.', '#ffe082'); },
  },
  {
    id: 'sb_karate_open', name: 'The Karate Island Open', island: 'karate_island', kind: 'story',
    summary: 'Fighters from all over the South Blue gather on Karate Island to be humbled.',
    stages: [
      { id: 'r1', desc: 'Round one: Foxy, the fox-grinned boxer, waits in the Tournament Ring east of Dojo Town. Step into the ring and knock him down — get knocked down and you are out of the Open.', pinAt: ringPin, goal: { type: 'defeat', npc: 'sb_foxy' },
        onStart: (ctx, g) => { ringWait(g, 'r1'); } },
      { id: 'r2', desc: 'Round two: Yaguara, the Mink karateka, climbs into the ring. Knock him down.', pinAt: ringPin, goal: { type: 'defeat', npc: 'sb_yaguara' },
        onStart: (ctx, g) => { setTimeout(() => ringWait(g, 'r2'), 2600); } },
      { id: 'final', desc: 'The final: Jerry, the boxing champion, climbs into the ring. Knock him down.', pinAt: ringPin, goal: { type: 'defeat', npc: 'sb_jerry' },
        onStart: (ctx, g) => { setTimeout(() => ringWait(g, 'final'), 2600); } },
      { id: 'report', desc: 'Return to Grandmaster Ippon at the Grand Karate Dojo.' },
    ],
    rewards: { berries: 8000, points: 2, items: [['sb_champion_headband', 1]], mastery: { brawler: 5 } },
  },
  {
    id: 'sb_goayu_birds', name: 'Kingdom of the Giant Birds', island: 'torino_kingdom', kind: 'story',
    summary: 'On "Treasure Island", the natives need medicine from the Great Tree — the realm of the giant Goayu birds.',
    stages: [
      { id: 'herbs', desc: 'Collect 3 bundles of Great Tree herbs from the baskets among its roots.', goal: { type: 'item', item: 'sb_torino_herb', n: 3 } },
      { id: 'chief', desc: 'The Great Goayu swoops down from the canopy! Defeat it near its nest in the Great Tree.', goal: { type: 'defeat', npc: 'sb_great_goayu' },
        onStart: bossStage('sb_goayu_birds', 'sb_great_goayu', 'torino_kingdom', 'goayu_nest', (ctx, g) => { if (populated(g, 'torino_kingdom')) g.ui.banner('GOAAAA!', 'Masukeredomo Goayu Bird', 'A shadow the size of a sail falls across the roots. The lord of the Great Tree wants its herbs back.', 4); }) },
      { id: 'truce', desc: 'Tell Elder Lobo at the Mink Elders\' Longhouse in Torino Village.' },
    ],
    rewards: { berries: 6000, points: 2, attrs: { agi: 1 }, items: [['sb_torino_salve', 3], ['sb_goayu_feather', 1]] },
  },
  {
    id: 'sb_jewel_sickness', name: 'The Jewel Sickness', island: 'sorbet_kingdom', kind: 'side',
    summary: 'Pastor Kuma\'s little girl has blue stones growing from her skin. He asks you to consult the famous library of the Torino Kingdom.',
    stages: [
      { id: 'ask', desc: 'Ask Shanba at the Torino Library of Healing (Torino Kingdom) about "Sapphire Scales".', island: 'torino_kingdom' },
      { id: 'report', desc: 'Bring the answer back to Kuma\'s Church in the Sorbet Kingdom (or to Bulldog if Kuma is gone).', island: 'sorbet_kingdom' },
    ],
    rewards: { berries: 5000, points: 1, attrs: { wil: 1 } },
  },
  {
    id: 'sb_solo_revolution', name: 'The Solo Revolution', island: 'sorbet_kingdom', kind: 'story',
    summary: 'Sixteen years after the Freedom Fighters chased him out, King Bekori has come back to burn the "deadweight" of Sorbet.',
    stages: [
      { id: 'fire', desc: 'Bekori\'s soldiers are torching the Elderly Village. Defeat Sergeant Gelato.', goal: { type: 'defeat', npc: 'sb_gelato' },
        onStart: (ctx, g) => {
          if (!fightAt(g, 'sb_gelato', 'sorbet_kingdom', 'elder_square', 2)) return;
          spawnSquad(g, 'sorbet_kingdom', 'elder_square');
          g.ui.banner('The Elderly Village Burns', 'Sorbet Kingdom', 'Soldiers in pink uniforms carry torches from door to door — every door marked in red.', 5);
        } },
      { id: 'warn', desc: 'Warn the pastor at Kuma\'s Church, in the south-east of the island.' },
      { id: 'castle', desc: 'March on Castle Town in the north. Defeat Commander Sundae of the Royal Army.', goal: { type: 'defeat', npc: 'sb_sundae' },
        onStart: (ctx, g) => { fightAt(g, 'sb_sundae', 'sorbet_kingdom', 'castle_square', 3); spawnSquad(g, 'sorbet_kingdom', 'castle_square'); } },
      { id: 'bekori', desc: 'Storm the Sorbet Royal Palace and face King Bekori.', goal: { type: 'defeat', npc: 'sb_bekori' },
        onStart: bossStage('sb_solo_revolution', 'sb_bekori', 'sorbet_kingdom', null, (ctx, g) => { if (populated(g, 'sorbet_kingdom')) g.ui.banner('King Bekori', 'King of Sorbet', '"A wise king must sometimes steel his heart..." — the palace doors swing open.', 4); }) },
      { id: 'crown', desc: 'Talk to Bulldog, the old king, in Castle Town.',
        onStart: (ctx, g) => {
          const c = g.state?.char;
          if (c) c.flags.sbPalaceRuined = true;
          const b = ruinPalace(g);
          if (b) pawBlast(g, b.x, b.y - 3, true);
          g.ui.banner('URSUS SHOCK', 'Bartholomew Kuma', 'A giant shadow steps through the gate and raises one padded palm. The air folds... and the royal palace of Sorbet is gone. Bekori is blown clean over the horizon.', 6);
        } },
      { id: 'fleet', desc: 'Bekori is back with a Marine fleet. Hold the southern beach against the landing party led by Commodore Hawser.', goal: { type: 'defeat', npc: 'sb_hawser' },
        onStart: (ctx, g) => {
          const c = g.state?.char;
          despawn(g, 'sb_kuma');
          if (c?.bosses?.includes('sb_hawser')) { setTimeout(() => g.quests.next('sb_solo_revolution'), 0); return; }
          if (!populated(g, 'sorbet_kingdom')) return;
          if (!isMarine(c)) { fightAt(g, 'sb_hawser', 'sorbet_kingdom', 'sorbet_south_beach'); spawnSquad(g, 'sorbet_kingdom', 'sorbet_south_beach'); } else spawnNow(g, 'sb_hawser');
        } },
      { id: 'report', desc: 'Return to Bulldog in Castle Town.',
        onStart: (ctx, g) => { g.ui.banner('THE TYRANT OF SORBET', 'World Economic Journal', 'Three Marine warships sink off Sorbet. Bekori is never seen again. By morning, the World Government has put a price on the head of "Tyrant" Kuma.', 6); } },
    ],
    rewards: { berries: 25000, points: 3, liberate: 'Castle Town', attrs: { vit: 1 } },
    onComplete: (ctx, g) => { g.log('Sorbet is free — and the world will remember its pastor as a tyrant. The World Government writes the history books.', '#ffe082'); },
  },
  {
    id: 'sb_hospital_ledger', name: 'The Hospital Ledger', island: 'sorbet_kingdom', kind: 'side',
    summary: 'World Government agents comb Castle Town Hospital\'s birth records for Buccaneer babies.',
    stages: [
      { id: 'agent', desc: 'Stop the Cipher Pol agent copying the hospital\'s birth records (outside Castle Town Hospital).', goal: { type: 'defeat', npc: 'sb_quill' },
        onStart: (ctx, g) => { if (populated(g, 'sorbet_kingdom')) spawnNow(g, 'sb_quill'); } },
      { id: 'report', desc: 'Tell Nurse Mint.' },
    ],
    rewards: { berries: 6000, points: 1, attrs: { end: 1 } },
    onComplete: (ctx, g) => {
      const c = g.state?.char;
      if (c?.race === 'buccaneer') { g.progression.raiseAttr('vit', 1); g.log('Your own name was in that ledger. Now it is ash. (+1 VIT)', '#b3e5fc'); }
    },
  },
  {
    id: 'sb_st_briss', name: 'The Voyage of the St. Briss', island: 'briss_kingdom', kind: 'side',
    summary: 'Two hundred and ten years ago the exploration ship St. Briss left Briss for the Grand Line and never came home.',
    stages: [
      { id: 'sky', desc: 'Sail into the Grand Line and ask about the St. Briss at Jaya, where sailors say wrecks fall out of the sky.', goal: { type: 'flag', flag: 'sbStBrissFound' }, island: 'jaya', at: { dock: true } },
      { id: 'report', desc: 'Return to Archivist Briony at the Royal Archives of Briss.', island: 'briss_kingdom' },
    ],
    rewards: { berries: 30000, points: 2, items: [['gold_coins', 5]] },
  },
  {
    id: 'sb_crab_hand', name: 'Crab-Hand Gyro', island: 'briss_kingdom', kind: 'side',
    summary: 'The Gyro Pirates are extorting the St. Briss Shipyard for a ship to the Grand Line.',
    stages: [
      { id: 'raid', desc: 'Defeat Crab-Hand Gyro by the Memorial of the St. Briss, on the south-west waterfront.', goal: { type: 'defeat', npc: 'sb_gyro' },
        onStart: bossStage('sb_crab_hand', 'sb_gyro', 'briss_kingdom', 'briss_pier', (ctx, g) => spawnSquad(g, 'briss_kingdom', 'briss_pier')) },
      { id: 'report', desc: 'Tell Master Carvel at the St. Briss Shipyard.' },
    ],
    rewards: { berries: 9000, points: 1 },
    onComplete: (ctx, g) => {
      const isl = islandRec(g, 'briss_kingdom');
      const dock = isl?.docks?.[0];
      if (dock) { g.giveShip('sloop', dock.moor.x, dock.moor.y, 'St. Briss II'); g.ui.toast('A NEW SHIP!', 'Master Carvel gives you a sloop — the St. Briss II!', '#ffe082'); }
    },
  },
  {
    id: 'sb_centaurea', name: 'Another Country Falls', island: 'centaurea', kind: 'story',
    summary: 'The Revolutionary Army has long fought the crown of Centaurea for this island. Now it is time to take the Royal Fortress.',
    stages: [
      { id: 'camp', desc: 'Report to Commander Lindbergh at the Revolutionary Camp in eastern Centaurea.' },
      { id: 'gate', desc: 'Break the Fortress Gate: defeat Suleiman the Beheader.', goal: { type: 'defeat', npc: 'sb_suleiman' },
        onStart: bossStage('sb_centaurea', 'sb_suleiman', 'centaurea', 'fort_gate', (ctx, g) => { spawnSquad(g, 'centaurea', 'fort_gate'); if (populated(g, 'centaurea')) g.ui.banner('Suleiman the Beheader', 'War criminal, exiled after the Sea Battle of Dias', 'A blond swordsman with a scar across his face steps out of the gate\'s shadow.', 4); }) },
      { id: 'marshal', desc: 'Storm the Royal Guard Headquarters inside the fortress and defeat Marshal Cyanus.', goal: { type: 'defeat', npc: 'sb_cyanus' },
        onStart: bossStage('sb_centaurea', 'sb_cyanus', 'centaurea', null, (ctx, g) => spawnSquad(g, 'centaurea', 'fort_square')) },
      { id: 'report', desc: 'Return to Commander Lindbergh at the Revolutionary Camp.' },
    ],
    rewards: { berries: 30000, points: 3, liberate: 'Centaurea City', items: [['sb_liberation_armband', 1]] },
    onComplete: (ctx, g) => { if (!isMarine(g.state?.char)) g.progression.addBounty(12000000, 'Fought alongside the Revolutionary Army'); },
  },
  {
    id: 'sb_victoria_punk', name: 'Victoria Punk', island: 'kutsukku_island', kind: 'story',
    summary: 'On lawless Kutsukku Island four teenage gang bosses rule four towns. When the Grinder Family murders a girl named Victoria, one of them decides to unite them all.',
    stages: [
      { id: 'test', desc: 'Prove yourself to Killer at the Masked Tavern in North Town.', goal: { type: 'defeat', npc: 'sb_killer' } },
      { id: 'heat', desc: 'Help Heat in East Town: defeat the Grinder Family\'s enforcer, "Cleaver" Mazza.', goal: { type: 'defeat', npc: 'sb_mazza' },
        onStart: (ctx, g) => { fightAt(g, 'sb_mazza', 'kutsukku_island', 'east_square', 2); spawnSquad(g, 'kutsukku_island', 'east_square'); } },
      { id: 'wire', desc: 'Win over Wire at the Trident Pier Tavern in West Town.' },
      { id: 'syndicate', desc: 'Storm the Grinder Family Mansion in the heart of the island and defeat Don Grinder.', goal: { type: 'defeat', npc: 'sb_don_grinder' },
        onStart: bossStage('sb_victoria_punk', 'sb_don_grinder', 'kutsukku_island', 'grinder_mansion', (ctx, g) => { spawnSquad(g, 'kutsukku_island', 'grinder_mansion'); if (populated(g, 'kutsukku_island')) g.ui.banner('Four Towns, One Gang', 'Kutsukku Island', 'Kid, Killer, Heat and Wire storm the gates. The Grinder Family\'s men pour out to meet them — and the Don is waiting for you.', 5); }) },
      { id: 'report', desc: 'Return to Kid at Victoria\'s grave, west of South Town.', npc: 'sb_kid' },
    ],
    rewards: { berries: 15000, points: 2, items: [['sb_scrap_flintlock', 1]] },
  },
  {
    id: 'sb_tumi_tower', name: 'The Tower of Tumi', island: 'tumi', kind: 'side',
    summary: 'Three years into Tumi\'s civil war, the rebels are losing — and the Revolutionary Army\'s reinforcements are far away.',
    stages: [
      { id: 'tower', desc: 'Defeat General Huaca at the Loyalist Tower.', goal: { type: 'defeat', npc: 'sb_huaca' },
        onStart: bossStage('sb_tumi_tower', 'sb_huaca', 'tumi', 'tumi_tower', (ctx, g) => spawnSquad(g, 'tumi', 'tumi_tower')) },
      { id: 'report', desc: 'Report to Inti at Rebel Command in Tumi Old Town.' },
    ],
    rewards: { berries: 12000, points: 1, liberate: 'Tumi Old Town' },
  },
  {
    id: 'sb_tin_plate', name: 'The Tin-Plate King', island: 'evil_black_drum', kind: 'side',
    summary: 'Wapol, the deposed king of Drum, has bought himself a new kingdom in the South Blue — and is eating it one building at a time.',
    stages: [
      { id: 'fight', desc: 'Confront Wapol at the Evil Black Drum Castle.', goal: { type: 'defeat', npc: 'sb_wapol' },
        onStart: (ctx, g) => { if (g.state?.char?.bosses?.includes('sb_wapol')) setTimeout(() => g.quests.next('sb_tin_plate'), 0); } },
      { id: 'report', desc: 'Tell Tinker Pim at the Baku Baku Factory.' },
    ],
    rewards: { berries: 15000, points: 1, items: [['sb_wapometal', 1]], liberate: 'Wapol Castle Town' },
  },
  {
    id: 'sb_samba_carnival', name: 'Carnival Night', island: 'samba_kingdom', kind: 'side',
    summary: 'In the middle of the carnival, slavers snatched the Samba Kingdom\'s finest dancer.',
    stages: [
      { id: 'find', desc: 'Find the slavers\' boat in a cove on the east coast.', goal: { type: 'reach', island: 'samba_kingdom', spot: 'slaver_cove', r: 8 } },
      { id: 'fight', desc: 'Defeat "Net-Hand" Bakalao and free the captives.', goal: { type: 'defeat', npc: 'sb_bakalao' },
        onStart: bossStage('sb_samba_carnival', 'sb_bakalao', 'samba_kingdom', 'slaver_cove', (ctx, g) => spawnSquad(g, 'samba_kingdom', 'slaver_cove')) },
      { id: 'report', desc: 'Find Pascia at the Carnival Stage in Samba Royal City.', npc: 'sb_pascia', onStart: (ctx, g) => spawnNow(g, 'sb_pascia') },
    ],
    rewards: { berries: 10000, points: 1, items: [['jewels', 1]] },
  },
  {
    id: 'sb_taya_bounty', name: 'The Rootcutter', island: 'taya_kingdom', kind: 'side',
    summary: 'Officer Aramaki of the Taya Police has a bounty he can\'t be bothered to collect.',
    stages: [
      { id: 'hunt', desc: 'Catch "Rootcutter" Burl at his camp in the deep Taya forest.', goal: { type: 'defeat', npc: 'sb_burl' },
        onStart: (ctx, g) => { fightAt(g, 'sb_burl', 'taya_kingdom', 'bandit_camp', 1); spawnSquad(g, 'taya_kingdom', 'bandit_camp'); } },
      { id: 'report', desc: 'Report to Officer Aramaki at the Taya Police Station.' },
    ],
    rewards: { berries: 7000, points: 1 },
  },
  {
    id: 'sb_matryo', name: 'The Smallest Princess', island: 'roshwan_kingdom', kind: 'side',
    summary: 'The youngest of Roshwan\'s nesting-doll princesses has wandered off toward the ice caves.',
    stages: [
      { id: 'search', desc: 'Search the ice cave east of Roshwan Royal City.', goal: { type: 'reach', island: 'roshwan_kingdom', spot: 'frozen_cave', r: 7 },
        onStart: (ctx, g) => { if (populated(g, 'roshwan_kingdom')) spawnNow(g, 'sb_matryosoka'); } },
      { id: 'wolves', desc: 'Drive off the snow wolves circling Princess Matryosoka.', goal: { type: 'defeat', npc: 'sb_snow_wolf_alpha' },
        onStart: (ctx, g) => { fightAt(g, 'sb_snow_wolf_alpha', 'roshwan_kingdom', 'frozen_cave', -2); spawnSquad(g, 'roshwan_kingdom', 'frozen_cave'); } },
      { id: 'report', desc: 'Bring the good news to King Beer VI at the Palace of the Tankards.' },
    ],
    rewards: { berries: 8000, points: 1, items: [['sb_roshwan_fur', 1]] },
  },
];

// --------------------------------------------------------------------- install
function install(game) {
  // Foxy's foul: the steel fox-trap in his glove (canon: his licence was revoked
  // for bringing a weapon into the ring).
  game.on('knockout', (a) => {
    const B = game.karateBout;
    if (!B || !B.started) return;
    if (a === B.a) {
      // he's down: off he goes, and the next one climbs in (the quest moves on)
      B.started = false;
      game.karateBout = null;
      if (game.bossTarget === a) game.bossTarget = null;
      setTimeout(() => { if (a.state === 'knocked') a.alive = false; }, 2400);
      if (B.stage !== 'final') game.ui.banner('K.O.!', 'Karate Island Open', 'The crowd roars! Stay in the ring — your next opponent is on his way.', 3);
    } else if (a.isPlayer) loseBout(game, 'Knocked down — the bout is lost.');
  });
  game.on('tick', (dt) => {
    const B = game.karateBout, p = game.player;
    if (!B || !p || !game.state?.char) return;
    if (!B.a.alive || game.quests.stageId(OPEN) !== B.stage) { if (!B.started) game.karateBout = null; return; }
    const ring = ringOf(game);
    if (!B.started) {
      // (waiting in his corner, facing the steps)
      B.a.facing = Math.PI / 2;
      if (p.state === 'idle' && game.time > B.readyAt && onRing(game, p, ring)) ringBell(game);
      return;
    }
    // out of the ring mid-bout: a count of five and it's lost
    if (p.state === 'idle' && !onRing(game, p, ring)) {
      const was = Math.floor(B.out);
      B.out += dt;
      if (Math.floor(B.out) !== was && B.out < 5) game.fx.text(p.x, p.y - 2.2, String(Math.floor(B.out)) + '...', '#ffeb3b', 0.4, { life: 0.9 });
      if (B.out >= 5) loseBout(game, 'Counted out of the ring.');
    } else B.out = 0;
  });
  // arriving on the island mid-Open: this round's opponent is in the ring
  game.spawner.addBuilder(({ island, game: g }) => {
    if (island.id !== 'karate_island') return;
    const st = g.quests.stageId(OPEN);
    if (ROUNDS[st]) setTimeout(() => ringWait(g, st, false), 600);
  });
  game.on('characterStart', () => { game.karateBout = null; });

  game.on('knockout', (a) => {
    if (!game.state?.char || a?.npcId !== 'sb_foxy') return;
    game.ui.banner('FOUL!', 'Karate Island Open', 'The referee pulls a steel fox-trap out of Foxy\'s glove. His boxing licence is revoked — for life.', 5);
    game.log('Foxy: "Fe-fe-fe... you haven\'t seen the last of me! I\'ll win a crew one game at a time!"', '#ffcc80');
  });

  game.on('enterIsland', (isl) => {
    const c = game.state?.char;
    if (!c || !isl) return;
    // The St. Briss fell out of the sky near Jaya.
    if ((isl.id === 'jaya' || /^jaya$/i.test(isl.name || '')) && game.quests.stageId('sb_st_briss') === 'sky' && !c.flags.sbStBrissFound) {
      c.flags.sbStBrissFound = true;
      game.ui.banner('A Ship From the Sky', 'Jaya', 'Fishermen tell of a wreck that fell out of the clouds: a three-master with a dragon on her prow, crewed by skeletons with tar-black teeth. The St. Briss reached the sky.', 7);
    }
    if (isl.id === 'kutsukku_island' && !c.flags.sbKutsukkuSeen) {
      c.flags.sbKutsukkuSeen = true;
      game.ui.banner('Kutsukku Island', 'Unaffiliated with the World Government', 'No Marines. No king. Four towns, four gangs — and the Grinder Family over all of them.', 5);
    }
  });

  // atmosphere: the Elderly Village burning, Kuma sinking the Marine fleet offshore
  let fxT = 0, blastT = 0;
  game.on('tick', (dt) => {
    const c = game.state?.char;
    if (!c || game.world !== game.surface || !game.player) return;
    if ((fxT -= dt) > 0) return;
    fxT = 0.35;
    const s = game.quests.stageId('sb_solo_revolution');
    if (s !== 'fire' && s !== 'fleet') return;
    const p = game.player;
    if (s === 'fire') {
      const sq = spotOf(game, 'sorbet_kingdom', 'elder_square');
      const town = islandRec(game, 'sorbet_kingdom')?.towns?.find((t) => t.id === 'sorbet_elder_village');
      if (!sq || !town || game.world.distance(p.x, p.y, sq.x, sq.y) > 45) return;
      const houses = town.buildings.filter((b) => b.role === 'house').slice(0, 4);
      for (const b of houses) { const c = bw(b, (Math.random() - 0.5) * (b.fw || 4), -(b.fd || 3) / 2); game.fx.burst(c.x, c.y, 4, { color: ['#ff7043', '#ffca28', '#6d4c41'], speed: 1.5, vz: 4, g: -1, life: 0.9, kind: 'fire', size: 0.25 }); }
    } else {
      const sq = spotOf(game, 'sorbet_kingdom', 'sorbet_south_beach');
      if (!sq || game.world.distance(p.x, p.y, sq.x, sq.y) > 60) return;
      if ((blastT -= 0.35) > 0) return;
      blastT = 5 + Math.random() * 4;
      pawBlast(game, sq.x + (Math.random() - 0.5) * 24, sq.y + 28 + Math.random() * 10, false);
    }
  });

  // canon destruction persists (the world is regenerated every session)
  game.spawner.addBuilder(({ island, game: g }) => {
    const c = g.state?.char;
    if (!c) return;
    if (island.id === 'sorbet_kingdom' && c.flags.sbPalaceRuined) ruinPalace(g);
    if (island.id === 'tumi' && c.flags.sbTowerRuined) ruinTower(g);
  });
}

export default {
  id: 'southBlue', npcs, groups, quests, items, trainers, stock, archetypes, abilities, install,
  dynamicIds: [],
};
