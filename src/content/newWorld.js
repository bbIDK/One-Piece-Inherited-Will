// New World content pack, first half: Fish-Man Island (zone), the three
// islands the New World Log Pose points to first (Raijin, Risky Red,
// Mystoria), the Marine bases by the Red Line (New Marineford, G-5), Punk
// Hazard, Dressrosa & Green Bit, Applenine, Sphinx, Zou and Totto Land
// (Whole Cake Island, Cacao Island).
//
// The player is never a Straw Hat: they are a rival pirate (or a Marine)
// who arrives in the middle of each canon arc. Every Road Poneglyph here has
// its own quest that grants one `poneglyph_rubbing`.
import './bossMoves.js';
import { spawnNow, findActor, aggro, despawn } from './helpers.js';
import { count } from '../game/inventory.js';
import { makeEnemy } from '../game/npcs.js';
import { makeLook } from '../data/races.js';
import { persist } from '../game/lineage.js';

// ------------------------------------------------------------------ helpers
const stageIs = (g, id, st) => g.quests.stageId(id) === st;
const active = (ctx, id, st) => ctx.game.quests.stageId(id) === st;
const done = (ctx, id) => ctx.game.quests.isDone(id);
const started = (ctx, id) => !!ctx.game.quests.state(id);
const isMarine = (c) => c.faction === 'marine';
const isNight = (g) => g.env.clock >= 18 || g.env.clock < 6;
const beaten = (c, id) => c.bosses.includes(id) || !!c.defeated[id];

/** A named spot on a surface or zone island (null if that world isn't loaded). */
function spotXY(game, islandId, spotId) {
  const isl = (game.surface?.islands || []).find((i) => i.id === islandId) || (game.world?.islands || []).find((i) => i.id === islandId);
  if (!isl) return null;
  return (spotId && isl.spots?.[spotId]) || { x: isl.x, y: isl.y };
}
/** Spawn a registered NPC at a spot, but only while its island is populated (else its `when` spawns it later). */
function spawnAt(game, id, islandId, spotId, ox = 0, oy = 0) {
  if (!game.spawner?.populated?.has(islandId)) return null;
  const s = spotXY(game, islandId, spotId);
  const p = s ? (game.spawner.findFree(s.x + ox, s.y + oy, 5) || { x: s.x + ox, y: s.y + oy }) : undefined;
  return spawnNow(game, id, p);
}
function fightAt(game, id, islandId, spotId, ox, oy) {
  const a = findActor(game, id) || spawnAt(game, id, islandId, spotId, ox, oy);
  if (a) aggro(game, a);
  return a;
}
/** Story mobs that must appear right now (groups only re-spawn when an island repopulates). */
function spawnMob(game, islandId, spotId, list) {
  const pop = game.spawner?.populated?.get(islandId);
  if (!pop) return;
  const s = spotXY(game, islandId, spotId);
  if (!s) return;
  for (const [arch, lvl, over] of list) {
    const p = game.spawner.findFree(s.x, s.y, 6) || s;
    const e = makeEnemy(arch, lvl, p.x, p.y, over || {});
    e.game = game;
    game.addActor(e);
    pop.push(e);
  }
}
/** Logia body for bosses whose fruit isn't in the fruit registry: only Haki, Seastone or a weakness land. */
function logiaBody(color, weakTo = []) {
  return (a, game) => {
    if (a._nwLogia) return;
    a._nwLogia = true;
    const orig = a.takeDamage.bind(a);
    a.takeDamage = (n, att, h, g) => {
      const gg = g || game;
      const el = h?.element || 'physical';
      if (att && !att.armament && !h?.haki && !h?.seastone && !h?.trueDamage && !weakTo.includes(el) && !a.status?.seastone && a.state !== 'knocked') {
        gg.fx.burst(a.x, a.y - 0.7, 8, { color, speed: 3, g: 0, life: 0.35, kind: 'smoke', size: 0.2 });
        gg.fx.text(a.x, a.y - 1.3, 'INTANGIBLE', color, 0.3);
        if (att.isPlayer) gg.hint?.('logia', 'Logia users are intangible. Use Armament Haki, Seastone, or their elemental weakness to hit them.');
        return;
      }
      return orig(n, att, h, g);
    };
  };
}
/** Trebol's Beta Beta body: blows sink into the mucus (half damage) and stick; fire burns straight through. */
function stickyBody(a, game) {
  if (a._nwSticky) return;
  a._nwSticky = true;
  const orig = a.takeDamage.bind(a);
  a.takeDamage = (n, att, h, g) => {
    const gg = g || game;
    if (h?.element !== 'fire' && att && !h?.trueDamage) {
      n *= 0.5;
      if (att.addStatus && !h?.projectile && Math.random() < 0.35) { att.addStatus('root', 0.6); gg.fx.text(att.x, att.y - 1.3, 'STUCK!', '#c5e1a5', 0.3); }
    }
    return orig(n, att, h, g);
  };
}
const shout = (text, color = '#ffffff') => (a, g) => g.fx.text(a.x, a.y - 2.4, text, color, 0.55, { life: 1.6 });
const buffPhase = (buff, text, color) => (a, g) => { a.addBuff(buff); if (text) g.fx.text(a.x, a.y - 2.4, text, color || '#ff5252', 0.55, { life: 1.6 }); };
const hakiOn = (text) => (a, g) => { a.armament = true; a.haki = Math.max(a.haki || 0, a.d?.maxHaki || 100); if (text) g.fx.text(a.x, a.y - 2.4, text, '#212121', 0.5, { life: 1.4 }); };
const foresight = (a) => { a.observation = true; };
const addMoves = (...ids) => (a) => { for (const m of ids) if (!a.controller.moves.includes(m)) a.controller.moves.push(m); };
const both = (...fns) => (a, g) => { for (const f of fns) f(a, g); };
/** Turn a friendly NPC into an opponent (gladiators, duels, Big Mom at her table). */
function provoke(game, id, faction = 'pirate') {
  const a = findActor(game, id);
  if (!a) return null;
  a.faction = faction;
  aggro(game, a);
  return a;
}

// Hobi Hobi no Mi: Sugar's touch turns you into a toy until she is knocked out.
function toyTouch(tgt, att, game) {
  if (!tgt || !tgt.addBuff || tgt.state === 'knocked') return;
  tgt.addBuff({ id: 'nw_toy', name: 'Turned into a Toy', dur: tgt.isPlayer ? 14 : 30, mods: { damage: 0.5, scale: 0.6, defMul: 1.3, speedMul: 1.1 }, aura: 'rgba(255,204,128,0.55)' });
  game.fx.burst(tgt.x, tgt.y - 0.6, 18, { color: ['#ffcc80', '#ffffff', '#f48fb1'], speed: 4, g: 0, life: 0.5, kind: 'star' });
  if (tgt.isPlayer && att && !att._toyBanner) {
    att._toyBanner = true;
    game.ui.banner('YOU\'VE BECOME A TOY!', 'Hobi Hobi no Mi', 'Tin and cloth. Everyone who ever knew you is forgetting your name. Knock Sugar out to break the curse!', 5);
  }
}
function untoyAll(game) {
  for (const a of game.actors) {
    if (!a.buffs?.some((b) => b.id === 'nw_toy')) continue;
    a.buffs = a.buffs.filter((b) => b.id !== 'nw_toy');
    a.recalc?.();
  }
}

// ---------------------------------------------------------------- abilities
const abilities = [
  // ---- Fish-Man Island
  { id: 'nw_hody_yabusame', name: 'Yabusame', anim: 'shoot', windup: 0.45, recover: 0.35, cd: 6, cost: { stamina: 10 }, say: 'Yabusame!',
    steps: [{ proj: { speed: 22, range: 12, radius: 0.25, damage: 9, count: 5, spread: 0.5, sprite: 'waterdrop', element: 'water', knockback: 2, status: { wet: 4 } } }] },
  { id: 'nw_hody_umidaiko', name: 'Umidaiko', anim: 'punch', windup: 0.55, recover: 0.4, cd: 7, cost: { stamina: 12 }, say: 'Umidaiko!',
    steps: [{ hit: { shape: 'line', range: 7, width: 1.6, damage: 20, knockback: 7, stun: 0.6, heavy: true, element: 'water' }, vfx: 'beam', color: '#4fc3f7' }] },
  { id: 'nw_hody_bite', name: 'Great White Bite', anim: 'grab', windup: 0.35, recover: 0.35, cd: 5, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.2, offset: 0.2, damage: 18, knockback: 1, stun: 0.7, status: { bleed: 4 } } }] },
  { id: 'nw_mato_axe', name: 'Mato Mato: Marked Axe', anim: 'shoot', windup: 0.4, recover: 0.3, cd: 3.5, cost: { stamina: 8 }, say: 'Marked!',
    steps: [{ proj: { speed: 13, range: 14, radius: 0.4, damage: 16, homing: 4, sprite: 'iceshard', color: '#b0bec5', slashing: true, knockback: 3 } }] },
  { id: 'nw_mato_barrage', name: 'Mato Mato: Coral Rain', anim: 'cast', windup: 0.6, recover: 0.4, cd: 8, cost: { stamina: 12 },
    steps: [{ proj: { speed: 11, range: 14, radius: 0.35, damage: 9, count: 5, spread: 1.2, homing: 3, sprite: 'orb', color: '#f48fb1' } }] },
  { id: 'nw_mato_noah', name: 'Mato Mato: The Noah', anim: 'cast', windup: 1.4, recover: 0.6, cd: 40, cost: { stamina: 20 }, say: 'Fall, Noah! Crush them all!',
    steps: [{ zone: { range: 4, duration: 1.3, interval: 1.2, damage: 60, color: '#8d6e63', atTarget: true, kind: 'meteor', element: 'explosion' } }] },
  { id: 'nw_dosun_tshot', name: 'T-Shot', anim: 'heavy', windup: 0.5, recover: 0.45, cd: 4, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.4, offset: 0.3, damage: 18, knockback: 8, stun: 0.6, heavy: true, guardBreak: true } }] },
  { id: 'nw_dosun_papara', name: 'Papara Hammer', anim: 'slash', windup: 0.5, recover: 0.4, cd: 7, cost: { stamina: 12 }, say: 'Papara Hammer!',
    steps: [{ hit: { shape: 'circle', range: 2.6, damage: 7, knockback: 3, stun: 0.2, duration: 0.8, interval: 0.2 }, vfx: 'ring' }] },
  { id: 'nw_zeo_flail', name: 'Kamigakure Flail: 66 Kubi', anim: 'shoot', windup: 0.4, recover: 0.35, cd: 6, cost: { stamina: 10 },
    steps: [{ proj: { speed: 16, range: 9, radius: 0.35, damage: 10, sprite: 'string', color: '#90a4ae', stun: 0.6, status: { root: 1.5 } } }] },
  { id: 'nw_zeo_camouflage', name: 'Camouflage', anim: 'cast', windup: 0.2, recover: 0.1, cd: 18, cost: { stamina: 8 },
    steps: [{ buff: { id: 'nw_camo', name: 'Camouflage', dur: 5, mods: { stealth: 1, evade: 0.35 }, alpha: 0.25 } }] },
  { id: 'nw_daruma_cutter', name: 'Hi-Daruma Cutter', anim: 'thrust', windup: 0.35, recover: 0.4, cd: 5, cost: { stamina: 10 },
    steps: [{ dash: { dist: 7, time: 0.3, hit: { damage: 16, knockback: 4, stun: 0.4, element: 'fire', status: { burn: 2 } } } }] },
  { id: 'nw_daruma_otoshi', name: 'Daruma Otoshi', anim: 'cast', windup: 0.7, recover: 0.4, cd: 12, cost: { stamina: 12 }, say: 'Daruma Otoshi!',
    steps: [{ zone: { range: 3, duration: 2.5, interval: 0.5, damage: 3, color: '#8d6e63', atTarget: true, kind: 'field', slow: 0.4, status: { root: 0.5 } } }] },
  { id: 'nw_ikaros_spit', name: 'Ikaros no Tsubasa', anim: 'shoot', windup: 0.3, recover: 0.3, cd: 4, cost: { stamina: 8 },
    steps: [{ proj: { speed: 18, range: 10, radius: 0.25, damage: 8, count: 3, spread: 0.3, sprite: 'waterdrop', color: '#e0e0e0', status: { slowmo: 1.5 } } }] },
  { id: 'nw_ikaros_ink', name: 'Ikasumi Bunshin', anim: 'cast', windup: 0.4, recover: 0.3, cd: 14, cost: { stamina: 10 },
    steps: [{ zone: { range: 3.5, duration: 4, interval: 0.5, damage: 2, color: '#212121', kind: 'dark', slow: 0.5 } }, { buff: { id: 'nw_ink_double', name: 'Ink Double', dur: 4, mods: { evade: 0.3 } } }] },
  { id: 'nw_hyouzou_hasso', name: 'Eight-Sword Whirl', anim: 'slash', windup: 0.45, recover: 0.4, cd: 6, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'circle', range: 2.6, damage: 6, knockback: 1.5, stun: 0.15, slashing: true, duration: 0.7, interval: 0.1, status: { poison: 3 } }, vfx: 'ring', color: '#26c6da' }] },
  { id: 'nw_hyouzou_venom', name: 'Venom Tentacle', anim: 'slash', windup: 0.3, recover: 0.3, cd: 4, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.4, offset: 0.2, damage: 14, knockback: 2, stun: 0.3, slashing: true, element: 'poison', status: { poison: 6 } }, vfx: 'slash', color: '#26c6da' }] },

  // ---- Punk Hazard
  { id: 'nw_gas_robe', name: 'Gas Robe', anim: 'cast', windup: 0.5, recover: 0.4, cd: 9, cost: { stamina: 12 }, say: 'Gas Robe!',
    steps: [{ zone: { range: 3, duration: 4, interval: 0.5, damage: 5, element: 'poison', status: { poison: 3 }, color: '#b39ddb', atTarget: true, kind: 'field' } }] },
  { id: 'nw_gastanet', name: 'Gastanet', anim: 'cast', windup: 0.55, recover: 0.4, cd: 6, cost: { stamina: 12 }, say: 'Gastanet!',
    steps: [{ hit: { shape: 'arc', range: 3.2, arc: 1.4, offset: 0.4, damage: 26, knockback: 9, stun: 0.6, element: 'explosion', heavy: true }, vfx: 'ring', color: '#ffab40' }] },
  { id: 'nw_gastille', name: 'Gastille', anim: 'cast', windup: 0.6, recover: 0.4, cd: 7, cost: { stamina: 12 }, say: 'Gastille!',
    steps: [{ hit: { shape: 'line', range: 11, width: 0.9, damage: 24, knockback: 5, stun: 0.4, element: 'fire', status: { burn: 2 } }, vfx: 'beam', color: '#ce93d8' }] },
  { id: 'nw_karakuni', name: 'Karakuni', anim: 'cast', windup: 0.8, recover: 0.4, cd: 22, cost: { stamina: 14 }, say: 'Karakuni! Not a breath of air for you!',
    steps: [{ zone: { range: 4.5, duration: 3.5, interval: 0.5, damage: 6, element: 'gas', color: '#b2dfdb', kind: 'storm', slow: 0.5, status: { slowmo: 0.8 } } }] },
  { id: 'nw_shinokuni', name: 'Shinokuni', anim: 'cast', windup: 1.0, recover: 0.5, cd: 20, cost: { stamina: 16 }, say: 'SHINOKUNI!',
    steps: [{ zone: { range: 4, duration: 5, interval: 0.5, damage: 8, element: 'poison', status: { poison: 4, slowmo: 0.5 }, color: '#9575cd', atTarget: true, kind: 'field' } }] },
  { id: 'nw_yuki_rabi', name: 'Yuki Rabi', anim: 'cast', windup: 0.4, recover: 0.35, cd: 5, cost: { stamina: 10 }, say: 'Yuki Rabi!',
    steps: [{ proj: { speed: 14, range: 11, radius: 0.35, damage: 8, count: 5, spread: 0.8, sprite: 'star', color: '#ffffff', element: 'ice', status: { chill: 3 } } }] },
  { id: 'nw_kamakura', name: 'Kamakura', anim: 'cast', windup: 0.6, recover: 0.4, cd: 14, cost: { stamina: 12 }, say: 'Kamakura.',
    steps: [{ zone: { range: 1.6, duration: 0.5, interval: 0.4, damage: 10, element: 'ice', status: { freeze: 1.6 }, color: '#e3f2fd', atTarget: true, kind: 'ice' } }] },
  { id: 'nw_fubuki', name: 'Fubuki', anim: 'cast', windup: 0.5, recover: 0.4, cd: 8, cost: { stamina: 12 }, say: 'Fubuki!',
    steps: [{ hit: { shape: 'arc', range: 5, arc: 0.9, offset: 0.3, damage: 10, knockback: 1, stun: 0.2, element: 'snow', status: { chill: 4 }, duration: 0.8, interval: 0.2 }, vfx: 'ring', color: '#ffffff' }] },
  { id: 'nw_tabira_yuki', name: 'Tabira Yuki: Hada Gatana', anim: 'slash', windup: 0.3, recover: 0.3, cd: 4, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.8, offset: 0.2, damage: 18, knockback: 3, stun: 0.3, slashing: true, element: 'ice', status: { chill: 2 } }, vfx: 'slash', color: '#e3f2fd' }] },
  { id: 'nw_smiley_ooze', name: 'SAD Ooze', anim: 'thrust', windup: 0.5, recover: 0.5, cd: 6, cost: { stamina: 10 },
    steps: [{ dash: { dist: 6, time: 0.5, hit: { damage: 12, knockback: 4, stun: 0.4, element: 'poison', status: { poison: 4 } } } }] },
  { id: 'nw_vergo_bamboo', name: 'Bamboo Strike', anim: 'heavy', windup: 0.4, recover: 0.35, cd: 3.5, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.3, offset: 0.3, damage: 20, knockback: 6, stun: 0.5, heavy: true, haki: true } }] },
  { id: 'nw_vergo_demon_bamboo', name: 'Demon Bamboo', anim: 'thrust', windup: 0.6, recover: 0.45, cd: 8, cost: { stamina: 12 }, say: 'Demon Bamboo.',
    steps: [{ hit: { shape: 'line', range: 4.5, width: 1.2, damage: 30, knockback: 8, stun: 0.8, heavy: true, guardBreak: true, haki: true }, vfx: 'beam', color: '#263238' }] },
  { id: 'nw_vergo_haki_fist', name: 'Hardened Fist', anim: 'punch', windup: 0.3, recover: 0.3, cd: 5, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.1, offset: 0.2, damage: 24, knockback: 7, stun: 0.6, guardBreak: true, haki: true } }] },
  { id: 'nw_centaur_charge', name: 'Centaur Charge', anim: 'thrust', windup: 0.4, recover: 0.4, cd: 6, cost: { stamina: 10 },
    steps: [{ dash: { dist: 8, time: 0.35, hit: { damage: 14, knockback: 6, stun: 0.5 } } }] },

  // ---- Raijin / Risky Red
  { id: 'nw_urouge_mallet', name: 'Mad Monk Mallet', anim: 'heavy', windup: 0.5, recover: 0.45, cd: 4, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'arc', range: 2.6, arc: 1.5, offset: 0.3, damage: 24, knockback: 8, stun: 0.6, heavy: true, guardBreak: true } }] },
  { id: 'nw_urouge_quake', name: 'Heavenly Stomp', anim: 'heavy', windup: 0.7, recover: 0.5, cd: 9, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'circle', range: 3.6, damage: 20, knockback: 7, stun: 0.6, heavy: true, shake: 0.4 }, vfx: 'ring', color: '#ffd54f' }] },
  { id: 'nw_hawkins_straw_sword', name: 'Straw Sword', anim: 'slash', windup: 0.3, recover: 0.3, cd: 3, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 2.4, arc: 1.6, offset: 0.2, damage: 18, knockback: 3, stun: 0.3, slashing: true }, vfx: 'slash', color: '#d4a373' }] },
  { id: 'nw_hawkins_nail', name: 'Voodoo Nail', anim: 'shoot', windup: 0.45, recover: 0.35, cd: 7, cost: { stamina: 10 }, say: 'The odds say... this nail finds your heart.',
    steps: [{ proj: { speed: 18, range: 12, radius: 0.3, damage: 10, homing: 2, sprite: 'string', color: '#d4a373', stun: 0.4, status: { bleed: 4, root: 1 } } }] },
  { id: 'nw_hawkins_effigy', name: 'Straw Man', anim: 'cast', windup: 0.3, recover: 0.2, cd: 18, cost: { stamina: 10 }, say: 'Straw Man.',
    steps: [{ buff: { id: 'nw_straw_man', name: 'Straw Effigy', dur: 6, mods: { defMul: 0.4 }, aura: 'rgba(212,163,115,0.7)' } }] },

  // ---- Dressrosa & Green Bit
  { id: 'nw_dofla_tamaito', name: 'Tamaito', anim: 'shoot', windup: 0.25, recover: 0.3, cd: 3, cost: { stamina: 8 }, say: 'Tamaito.',
    steps: [{ proj: { speed: 26, range: 13, radius: 0.2, damage: 10, count: 3, spread: 0.25, sprite: 'string', color: '#f8bbd0', pierce: true } }] },
  { id: 'nw_dofla_fulbright', name: 'Fulbright', anim: 'cast', windup: 0.7, recover: 0.4, cd: 9, cost: { stamina: 12 }, say: 'Fulbright!',
    steps: [{ zone: { range: 2.2, duration: 0.5, interval: 0.45, damage: 28, color: '#f48fb1', atTarget: true, kind: 'cage', element: 'string', status: { bleed: 3 } } }] },
  { id: 'nw_dofla_god_thread', name: 'God Thread', anim: 'cast', windup: 1.2, recover: 0.6, cd: 35, cost: { stamina: 20 }, say: 'Sixteen Holy Bullets... God Thread!',
    steps: [{ proj: { speed: 20, range: 14, radius: 0.35, damage: 16, count: 8, spread: 1.4, sprite: 'string', color: '#ff80ab', pierce: true, heavy: true, knockback: 4 } }] },
  { id: 'nw_dofla_haoshoku', name: "Conqueror's Haki", anim: 'cast', windup: 0.5, recover: 0.4, cd: 25, cost: { stamina: 10 },
    steps: [{ fx: { impact: 0.1, ring: 8, color: '#000000', shake: 0.5 } }, { hit: { shape: 'circle', range: 8, damage: 8, knockback: 3, stun: 0.9, unblockable: true, element: 'haki' }, vfx: 'ring', color: '#212121' }] },
  { id: 'nw_pica_fist', name: 'Stone Titan Fist', anim: 'heavy', windup: 1.0, recover: 0.5, cd: 12, cost: { stamina: 14 },
    steps: [{ zone: { range: 3, duration: 0.4, interval: 0.35, damage: 40, color: '#9e9e9e', atTarget: true, kind: 'meteor' } }] },
  { id: 'nw_pica_spikes', name: 'Stone Spikes', anim: 'slash', windup: 0.6, recover: 0.45, cd: 7, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'line', range: 9, width: 1.4, damage: 24, knockback: 6, stun: 0.6, heavy: true }, vfx: 'beam', color: '#8d6e63' }] },
  { id: 'nw_diamante_flutter', name: 'Hira Hira: Flutter Blades', anim: 'slash', windup: 0.4, recover: 0.35, cd: 5, cost: { stamina: 10 },
    steps: [{ proj: { speed: 18, range: 11, radius: 0.3, damage: 12, count: 3, spread: 0.4, sprite: 'airslash', color: '#cfd8dc', slashing: true } }] },
  { id: 'nw_diamante_cape', name: 'Steel Cape', anim: 'block', windup: 0.2, recover: 0.2, cd: 16, cost: { stamina: 8 },
    steps: [{ buff: { id: 'nw_steel_cape', name: 'Steel Cape', dur: 4, mods: { defMul: 0.35 }, aura: 'rgba(176,190,197,0.8)' } }] },
  { id: 'nw_diamante_blade', name: 'Hero of the Colosseum', anim: 'slash', windup: 0.35, recover: 0.3, cd: 3.5, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 2.8, arc: 1.6, offset: 0.2, damage: 22, knockback: 4, stun: 0.4, slashing: true }, vfx: 'slash' }] },
  { id: 'nw_trebol_beta', name: 'Beta Beta Chain', anim: 'shoot', windup: 0.4, recover: 0.35, cd: 7, cost: { stamina: 10 }, say: 'Nee, nee! Beta Beta Chain!',
    steps: [{ proj: { speed: 14, range: 10, radius: 0.5, damage: 8, sprite: 'poison', color: '#c5e1a5', element: 'swamp', status: { root: 2.2 } } }] },
  { id: 'nw_trebol_lighter', name: 'Beta Beta Lighter', anim: 'cast', windup: 0.7, recover: 0.4, cd: 11, cost: { stamina: 12 },
    steps: [{ zone: { range: 3, duration: 2, interval: 0.4, damage: 12, element: 'fire', status: { burn: 3 }, color: '#ff7043', atTarget: true, kind: 'field' } }] },
  { id: 'nw_hobi_touch', name: 'Hobi Hobi Touch', anim: 'grab', windup: 0.35, recover: 0.35, cd: 7, cost: { stamina: 8 }, say: 'Become a toy!',
    steps: [{ hit: { shape: 'arc', range: 1.5, arc: 1.3, offset: 0.2, damage: 4, stun: 0.3, knockback: 0, unblockable: true, onHit: toyTouch } }] },
  { id: 'nw_hobi_bears', name: 'Little Black Bears', anim: 'cast', windup: 0.5, recover: 0.4, cd: 9, cost: { stamina: 10 },
    steps: [{ proj: { speed: 12, range: 10, radius: 0.3, damage: 6, count: 4, spread: 0.8, homing: 2, sprite: 'orb', color: '#212121', status: { slowmo: 1 } } }] },
  { id: 'nw_pink_swim', name: 'Sui Sui: Swimming Dive', anim: 'thrust', windup: 0.3, recover: 0.4, cd: 5, cost: { stamina: 10 },
    steps: [{ dash: { dist: 8, time: 0.4, iframes: 0.4, hit: { damage: 14, knockback: 5, stun: 0.4 } } }] },
  { id: 'nw_lao_g_palm', name: 'G-Style Kung Fu: G Palm', anim: 'punch', windup: 0.3, recover: 0.3, cd: 3.5, cost: { stamina: 8 }, say: 'G!',
    steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.2, offset: 0.2, damage: 16, knockback: 8, stun: 0.5 } }] },
  { id: 'nw_dellinger_heel', name: 'Fighting Fish Heel', anim: 'kick', windup: 0.25, recover: 0.3, cd: 4, cost: { stamina: 8 },
    steps: [{ dash: { dist: 6, time: 0.25, hit: { damage: 14, knockback: 3, stun: 0.3, status: { bleed: 3 } } } }] },
  { id: 'nw_chinjao_drill', name: 'Hasshoken: Drill Head', anim: 'thrust', windup: 0.5, recover: 0.45, cd: 7, cost: { stamina: 12 }, say: 'Drill Head!',
    steps: [{ dash: { dist: 7, time: 0.35, hit: { damage: 22, knockback: 8, stun: 0.6, heavy: true, guardBreak: true } } }] },
  { id: 'nw_ideo_cannon', name: 'Destruction Cannon', anim: 'punch', windup: 0.55, recover: 0.4, cd: 6, cost: { stamina: 10 }, say: 'Destruction Cannon!',
    steps: [{ proj: { speed: 20, range: 9, radius: 0.6, damage: 22, sprite: 'shockwave', color: '#ffab40', knockback: 9, heavy: true } }] },
  { id: 'nw_bellamy_spring', name: 'Spring Snipe', anim: 'thrust', windup: 0.35, recover: 0.4, cd: 4, cost: { stamina: 8 }, say: 'Spring Snipe!',
    steps: [{ dash: { dist: 9, time: 0.3, hit: { damage: 16, knockback: 6, stun: 0.4 } } }] },

  // ---- Zou
  { id: 'nw_jack_trunk', name: 'Mammoth Trunk Sweep', anim: 'heavy', windup: 0.6, recover: 0.45, cd: 5, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'arc', range: 3.2, arc: 2, offset: 0.3, damage: 28, knockback: 10, stun: 0.7, heavy: true, guardBreak: true } }] },
  { id: 'nw_jack_stomp', name: 'Mammoth Stomp', anim: 'heavy', windup: 0.8, recover: 0.5, cd: 9, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'circle', range: 4, damage: 30, knockback: 8, stun: 0.8, heavy: true, shake: 0.5 }, vfx: 'ring', color: '#8d6e63' }] },
  { id: 'nw_jack_tusks', name: 'Tusk Charge', anim: 'thrust', windup: 0.6, recover: 0.5, cd: 8, cost: { stamina: 12 },
    steps: [{ dash: { dist: 9, time: 0.4, hit: { damage: 32, knockback: 10, stun: 0.9, heavy: true, guardBreak: true } } }] },
  { id: 'nw_sheep_ram', name: 'Ram Horn Charge', anim: 'thrust', windup: 0.4, recover: 0.4, cd: 5, cost: { stamina: 10 },
    steps: [{ dash: { dist: 7, time: 0.3, hit: { damage: 18, knockback: 7, stun: 0.5 } } }] },
  { id: 'nw_gifter_smile', name: 'SMILE Strike', anim: 'punch', windup: 0.35, recover: 0.35, cd: 5, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 2, arc: 1.2, offset: 0.2, damage: 14, knockback: 5, stun: 0.3 } }] },

  // ---- Totto Land
  { id: 'nw_soul_pocus', name: 'Soul Pocus', anim: 'cast', windup: 0.9, recover: 0.5, cd: 22, cost: { stamina: 12 }, say: 'LIFE... OR TREATS?!',
    steps: [{ hit: { shape: 'circle', range: 6, damage: 14, knockback: 1, stun: 1.2, unblockable: true, element: 'dark', status: { despair: 2.5 } }, vfx: 'ring', color: '#7e57c2' }] },
  { id: 'nw_heavenly_fire', name: 'Heavenly Fire', anim: 'shoot', windup: 0.7, recover: 0.45, cd: 8, cost: { stamina: 12 }, say: 'Prometheus!',
    steps: [{ proj: { speed: 13, range: 13, radius: 1.2, damage: 24, size: 2, sprite: 'fireball', element: 'fire', status: { burn: 3 }, explode: { range: 3, damage: 28 } } }] },
  { id: 'nw_raitei', name: 'Raitei', anim: 'cast', windup: 0.8, recover: 0.45, cd: 10, cost: { stamina: 12 }, say: 'Zeus! Raitei!',
    steps: [{ zone: { range: 2.6, duration: 0.8, interval: 0.7, damage: 45, element: 'lightning', status: { shock: 1.5 }, color: '#fff176', atTarget: true, kind: 'thunder' } }] },
  { id: 'nw_ikoku', name: 'Ikoku', anim: 'slash', windup: 1.1, recover: 0.55, cd: 16, cost: { stamina: 16 }, say: 'Napoleon! IKOKU!',
    steps: [{ hit: { shape: 'line', range: 12, width: 2.2, damage: 50, knockback: 10, stun: 0.9, heavy: true, slashing: true, guardBreak: true, shake: 0.6 }, vfx: 'beam', color: '#ffd54f' }] },
  { id: 'nw_maser_ho', name: 'Maser Ho', anim: 'cast', windup: 1.6, recover: 0.7, cd: 40, cost: { stamina: 20 }, say: 'MASER HO!!',
    steps: [{ hit: { shape: 'line', range: 14, width: 3, damage: 70, knockback: 12, stun: 1, heavy: true, element: 'light', shake: 0.8, impactFrame: 0.1 }, vfx: 'beam', color: '#fff59d' }] },
  { id: 'nw_kata_mogura', name: 'Mogura', anim: 'thrust', windup: 0.35, recover: 0.3, cd: 4, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'line', range: 4, width: 1, damage: 22, knockback: 5, stun: 0.5, slashing: true }, vfx: 'beam', color: '#fff8e1' }] },
  { id: 'nw_kata_jellybean', name: 'Jellybean Flick', anim: 'shoot', windup: 0.25, recover: 0.3, cd: 3, cost: { stamina: 6 },
    steps: [{ proj: { speed: 34, range: 16, radius: 0.18, damage: 14, sprite: 'bullet', color: '#ec407a', knockback: 2 } }] },
  { id: 'nw_kata_buto_mochi', name: 'Buto Mochi', anim: 'punch', windup: 0.55, recover: 0.45, cd: 9, cost: { stamina: 12 }, say: 'Buto Mochi!',
    steps: [{ hit: { shape: 'arc', range: 3, arc: 1.2, offset: 0.3, damage: 30, knockback: 11, stun: 0.8, heavy: true, guardBreak: true, haki: true }, vfx: 'ring', color: '#3e2723' }] },
  { id: 'nw_cracker_pretzel', name: 'Pretzel', anim: 'slash', windup: 0.3, recover: 0.3, cd: 3, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 2.6, arc: 1.8, offset: 0.2, damage: 20, knockback: 4, stun: 0.4, slashing: true }, vfx: 'slash', color: '#d7ccc8' }] },
  { id: 'nw_cracker_hard_biscuit', name: 'Hard Biscuit', anim: 'heavy', windup: 0.7, recover: 0.45, cd: 9, cost: { stamina: 12 }, say: 'Hard Biscuit!',
    steps: [{ zone: { range: 2, duration: 0.4, interval: 0.35, damage: 32, color: '#d7ccc8', atTarget: true, kind: 'fists', status: { root: 1.5 } } }] },
  { id: 'nw_cracker_roll', name: 'Double Roll Pretzel', anim: 'slash', windup: 0.5, recover: 0.4, cd: 8, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'circle', range: 2.8, damage: 8, knockback: 2, stun: 0.2, slashing: true, duration: 0.9, interval: 0.15 }, vfx: 'ring', color: '#d7ccc8' }] },
  { id: 'nw_smoothie_wring', name: 'Shibo Shibo: Wring', anim: 'grab', windup: 0.4, recover: 0.35, cd: 6, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.2, offset: 0.2, damage: 18, knockback: 1, stun: 0.6, status: { dry: 4 } } }] },
  { id: 'nw_smoothie_juice', name: 'Juice Blade', anim: 'slash', windup: 0.35, recover: 0.3, cd: 5, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'line', range: 5, width: 1, damage: 20, knockback: 3, stun: 0.3, slashing: true, element: 'water' }, vfx: 'beam', color: '#ffb74d' }] },

  // ---- Sphinx
  { id: 'nw_weevil_bisento', name: 'Bisento Cleave', anim: 'heavy', windup: 0.55, recover: 0.45, cd: 4, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'arc', range: 3.4, arc: 1.8, offset: 0.3, damage: 30, knockback: 9, stun: 0.7, heavy: true, slashing: true } }] },
  { id: 'nw_weevil_sweep', name: 'Bisento Whirl', anim: 'slash', windup: 0.5, recover: 0.4, cd: 8, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'circle', range: 3.6, damage: 10, knockback: 4, stun: 0.2, slashing: true, duration: 0.8, interval: 0.2 }, vfx: 'ring' }] },
  { id: 'nw_weevil_charge', name: 'Whitebeard Jr. Charge', anim: 'thrust', windup: 0.6, recover: 0.5, cd: 9, cost: { stamina: 12 }, say: 'Oyaji\'s treasure is MINE!',
    steps: [{ dash: { dist: 10, time: 0.4, hit: { damage: 30, knockback: 10, stun: 0.8, heavy: true, guardBreak: true } } }] },
];

// ------------------------------------------------------------------- items
const items = {
  nw_raijin_umbrella: { name: 'Raijin Umbrella', icon: '☂', type: 'key', price: 9000, desc: 'A rubber-lined umbrella from Kasa\'s stand on Raijin Island. Carry it and the island\'s lightning slides away from you.' },
  nw_bepo_vivre_card: { name: 'Heart Pirates\' Vivre Card', icon: '📃', type: 'pose', target: 'zou', price: 0, unique: true, desc: 'Trafalgar Law\'s gift. It crawls toward the Heart Pirates, waiting on Zou — the phantom island on an elephant\'s back that no Log Pose can find.' },
  nw_tea_invitation: { name: 'Tea Party Invitation', icon: '💌', type: 'key', price: 0, unique: true, desc: 'An invitation to Big Mom\'s tea party at the Whole Cake Chateau. Refusing one is said to be fatal.' },
  nw_doughnut: { name: 'Totto Land Doughnut', icon: '🍩', type: 'food', heal: 120, stamina: 90, price: 400, desc: 'Charlotte Katakuri\'s favourite. Best eaten in private.' },
  nw_chocolate: { name: 'Chocolat Town Chocolate', icon: '🍫', type: 'food', heal: 80, stamina: 60, price: 250, desc: 'From Cacao Island, where even the fountains flow with chocolate.' },
  nw_chiffon_cake: { name: 'Chiffon Cake', icon: '🍰', type: 'food', heal: 260, stamina: 150, price: 2400, buff: { id: 'well_fed', name: 'Well Fed', dur: 180, mods: { damage: 1.1 } }, desc: 'Baked by Charlotte Chiffon: a cake good enough to calm an Emperor\'s hunger pangs.' },
  nw_healing_dandelion: { name: 'Healing Dandelion', icon: '🌼', type: 'medicine', heal: 600, price: 0, cure: ['bleed', 'poison', 'burn', 'dry'], desc: 'Princess Mansherry\'s Chiyu Chiyu power, stored in a dandelion seed head. Mends any wound at once.' },
};

// ------------------------------------------------------------------- stock
const stock = {
  nw_navy_depot: ['new_world_log_pose', 'den_den_mushi', 'bandage', 'antidote', 'marine_rifle', 'marine_saber', 'seastone_cuffs'],
  nw_raijin_stand: ['nw_raijin_umbrella', 'rice_ball', 'sake', 'bandage'],
  nw_vivre_shop: ['new_world_log_pose', 'den_den_mushi', 'bandage', 'antidote'],
  nw_dressrosa_market: ['meat', 'fish_stew', 'sake', 'bandage', 'antidote', 'red_cloak', 'captain_hat', 'cowboy_hat'],
  nw_tontatta_stall: ['tangerine', 'rice_ball', 'fish_stew', 'bandage'],
  nw_mink_market: ['meat', 'fish_stew', 'bandage', 'antidote', 'sake'],
  nw_totto_sweets: ['nw_doughnut', 'nw_chocolate', 'nw_chiffon_cake', 'sake', 'fish_stew'],
  nw_mermaid_cafe: ['fish_stew', 'sea_king_steak', 'sake', 'pearl'],
};

// ---------------------------------------------------------------- trainers
const trainers = {
  nw_marco: {
    name: 'Marco the Phoenix', where: "Marco's Clinic, Sphinx", styles: {}, teaches: ['haki_futuresight'], train: { vit: 80, end: 75, wil: 75 },
    haki: { observation: 75, armament: 70 }, spar: { level: 82, style: 'black_leg', name: 'Marco', haki: true },
    lines: ['Pops never cared about treasure, yoi. He cared about family.', 'Your Observation is too loud. Listen, don\'t look.'],
  },
  nw_kyros: {
    name: 'Kyros, the Thunder Soldier', where: 'Flower Hill, Dressrosa', styles: { ittoryu: 6000 }, teaches: ['itto_iai', 'itto_pound', 'itto_whirl'],
    train: { str: 80, agi: 72, end: 70 }, haki: { armament: 60 }, spar: { level: 78, style: 'ittoryu', weapon: 'sword', name: 'Kyros', haki: true },
    lines: ['Three thousand bouts in the Colosseum, and not one loss. Your stance, though... that would lose.', 'A sword that protects is heavier than a sword that kills. Carry it anyway.'],
  },
};

// -------------------------------------------------------------- archetypes
const archetypes = {
  nw_centaur: { name: 'Centaur Patrol Guard', faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#5d4037', bottom: '#795548', hat: 'bandana', hatColor: '#3e2723', legs: 1.5 }, skill: 0.3, moves: ['nw_centaur_charge'], barks: ['For the Master!', 'Shurororo — I mean, get \'em!'] },
  nw_gifter: { name: 'Beasts Pirates Gifter', faction: 'pirate', style: 'brawler', look: { top: '#212121', bottom: '#4e342e', hat: 'horns', hatColor: '#3e2723' }, bulk: 1.2, skill: 0.35, hpMul: 1.3, moves: ['brawl_tackle', 'nw_gifter_smile'], barks: ['For Kaido-sama!', 'Where is Raizo?!'] },
  nw_chess_soldier: { name: 'Chess Soldier', faction: 'pirate', style: 'ittoryu', weapon: 'sword', look: { top: '#fafafa', bottom: '#212121', hat: 'crown', hatColor: '#212121' }, skill: 0.35, hpMul: 1.2, barks: ['Intruder in the Queen\'s house!', 'Check!'] },
};

// ------------------------------------------------------------ recurring looks
const TONTATTA = (o) => ({ scale: 0.34, tail: 'fluffy', nose: 'long', ...o });

// -------------------------------------------------------------------- NPCs
const npcs = [
  // ======================================================= FISH-MAN ISLAND
  {
    id: 'nw_neptune', name: 'King Neptune', title: '"Sea God" of the Ryugu Kingdom', island: 'fishman_island', at: { town: 'ryugu_kingdom', building: 'Ryugu Palace' },
    race: 'fishman', level: 72, scale: 1.9, bulk: 1.8,
    look: { hair: 'long', hairColor: '#eceff1', skin: '#e0ac7e', top: '#1565c0', bottom: '#0d47a1', coat: '#1a237e', hat: 'crown', hatColor: '#ffd54f' },
    marker: (c, g) => (!g.quests.state('nw_fmi_coup') ? '!' : stageIs(g, 'nw_fmi_coup', 'report') || stageIs(g, 'nw_otohime', 'report') ? '?' : g.quests.isDone('nw_fmi_coup') && !g.quests.state('nw_otohime') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => done(ctx, 'nw_fmi_coup')
            ? '"The children play at being the \'surface hero\' in Gyoncorde Plaza now, jamon. Otohime would have laughed to see it."'
            : '"Welcome to the Ryugu Kingdom, traveller from the surface, jamon! You came ten thousand metres down through the dark. That takes courage... Forgive an old king his distraction. My kingdom sleeps uneasily these days."',
          choices: [
            { text: 'What troubles your kingdom?', if: () => !started(ctx, 'nw_fmi_coup'), next: 'trouble' },
            { text: 'Hody Jones is finished.', if: () => active(ctx, 'nw_fmi_coup', 'report'), next: 'thanks' },
            { text: 'Tell me about Queen Otohime.', next: 'otohime' },
            { text: 'I have the signatures for Otohime\'s petition.', if: () => active(ctx, 'nw_otohime', 'report'), next: 'sigs' },
            { text: 'Farewell, King Neptune.', end: true },
          ],
        },
        trouble: {
          text: '"Hody Jones and his New Fish-Man Pirates. They hate humans with a hatred they never lived themselves — they inherited it, like an heirloom. My son Fukaboshi keeps vigil at his mother\'s grave in the Sea Forest. He knows more than he tells his father. Will you go to him?"',
          choices: [{ text: 'I\'ll go to the Sea Forest.', do: (c) => c.startQuest('nw_fmi_coup'), end: true }, { text: 'Not now.', end: true }],
        },
        thanks: {
          text: '"You fought for Fish-Man Island as if it were your own home, jamon. Otohime always said the surface would send us friends one day. Take this from the royal treasury: a New World Log Pose. Three needles for three islands. Wise sailors follow the one that shakes least..."',
          onEnter: (c) => c.complete('nw_fmi_coup'),
        },
        otohime: {
          text: '"My wife wanted our people to live in the sunlight, beside humans. She went door to door collecting signatures for a petition to the World Government — even from people who spat at her. Ten years ago she was shot during a speech in Gyoncorde Plaza. They blamed a human..."',
          choices: [
            { text: 'Let me finish collecting her signatures.', if: () => done(ctx, 'nw_fmi_coup') && !started(ctx, 'nw_otohime'), do: (c) => c.startQuest('nw_otohime'), next: 'sig_start' },
            { text: 'I\'m sorry.', next: 'a' },
          ],
        },
        sig_start: { text: '"...You would do that? Then ask those who knew her best: Madam Shyarly at the Mermaid Café, Jinbe at the Karate Dojo, and old Den, who studies the Sea Forest. Their names would have meant the world to her, jamon."' },
        sigs: {
          text: '"(The king turns the pages slowly, his huge hands trembling.) ...Shyarly. Jinbe. Den. And yours. Otohime, do you see? Thank you, friend of the Ryugu Kingdom. When the day comes, we will carry these to the surface ourselves."',
          onEnter: (c) => c.complete('nw_otohime'),
        },
      },
    }),
  },
  {
    id: 'nw_shirahoshi', name: 'Princess Shirahoshi', title: 'The Mermaid Princess', island: 'fishman_island', at: { town: 'ryugu_kingdom', building: 'Hard Shell Tower' },
    race: 'fishman', level: 20, scale: 2.4, ai: 'idle',
    look: { hair: 'long', hairColor: '#f48fb1', skin: '#f9dcc4', top: '#f8bbd0', bottom: '#f48fb1', hat: 'crown', hatColor: '#ffd54f' },
    marker: (c, g) => (!g.quests.state('nw_decken') ? '!' : stageIs(g, 'nw_decken', 'report') ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => done(ctx, 'nw_decken')
            ? '"Mister Decken is really gone? Then I can go outside... to the Sea Forest, to Mother\'s grave! Thank you! I\'m sorry I cried so much."'
            : '(A giant mermaid peeks out from the Hard Shell Tower, sniffling.) "Eek! A-a human! I\'m so sorry! I\'m not supposed to meet anyone. For ten years a man named Vander Decken has thrown axes at me. His power never misses... so Father keeps me in here."',
          choices: [
            { text: 'I\'ll deal with Vander Decken.', if: () => !started(ctx, 'nw_decken'), do: (c) => c.startQuest('nw_decken'), next: 'go' },
            { text: 'He won\'t throw anything at you again.', if: () => active(ctx, 'nw_decken', 'report'), next: 'thanks' },
            { text: 'Do the Sea Kings listen to you?', next: 'poseidon' },
            { text: 'Goodbye, Princess.', end: true },
          ],
        },
        go: { text: '"Th-then please be careful! He waits on Coral Hill with a pile of axes... He says if I won\'t marry him, he\'ll kill me. I don\'t even know him!"' },
        thanks: { text: '"(She sobs with relief, which is a lot of water for a mermaid her size.) Here — these pearls are from my room. Mother gave them to me. I want you to have them!"', onEnter: (c) => c.complete('nw_decken') },
        poseidon: { text: '"The S-Sea Kings? Sometimes I hear them talking to me... and they come when I call. Mother told me never to tell anyone. Please forget I said it!" (A princess who can command Sea Kings. The old legends have a name for that power: Poseidon.)', next: 'a' },
      },
    }),
  },
  {
    id: 'nw_fukaboshi', name: 'Prince Fukaboshi', title: 'First Prince of the Ryugu Kingdom', island: 'sea_forest', at: { dx: -0.2, dy: 0.32 },
    race: 'fishman', level: 62, scale: 1.5, style: 'fishman_karate',
    look: { hair: 'long', hairColor: '#90caf9', skin: '#e0ac7e', top: '#1565c0', bottom: '#0d47a1', coat: '#283593', bulk: 1.4 },
    marker: (c, g) => (stageIs(g, 'nw_fmi_coup', 'truth') ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => active(ctx, 'nw_fmi_coup', 'truth') || active(ctx, 'nw_fmi_coup', 'forest')
            ? '"My father sent you? ...Then you should hear what I have told no one. Kneel with me a moment, before my mother\'s grave."'
            : done(ctx, 'nw_fmi_coup') ? '"Mother wanted children of every race to play together in the sun. Today, a little of that came true."' : '"This is Queen Otohime\'s grave. I come every morning. Please be quiet in the Forest of the Sea."',
          choices: [
            { text: 'I\'m listening.', if: () => active(ctx, 'nw_fmi_coup', 'truth') || active(ctx, 'nw_fmi_coup', 'forest'), next: 'truth' },
            { text: 'What is that giant ship?', next: 'noah' },
            { text: 'Leave him to his vigil.', end: true },
          ],
        },
        truth: {
          text: '"Ten years ago I found the gun that killed my mother. It was not a human who fired it. It was Hody Jones — a fish-man who wanted our hatred of humans to live forever. Today his New Fish-Man Pirates gather in Gyoncorde Plaza to execute my father and take the kingdom."',
          next: 'truth2',
        },
        truth2: {
          text: '"His officers hold the plaza: Dosun, Zeo, Daruma, Ikaros Much, and the swordsman Hyouzou. I must protect Shirahoshi. Will a stranger from the surface fight for a kingdom of fish-men?"',
          choices: [{ text: 'To Gyoncorde Plaza.', do: (c) => { c.stage('nw_fmi_coup', 'officers'); }, end: true }],
        },
        noah: { text: '"The Noah. An ark our royal family has guarded for eight hundred years, waiting for a promised day. Nobody alive knows what the promise was — only that we must keep it."', next: 'a' },
      },
    }),
  },
  {
    id: 'nw_ryuboshi', name: 'Prince Ryuboshi', title: 'Second Prince of the Ryugu Kingdom', island: 'fishman_island', at: { town: 'ryugu_kingdom', plaza: true, ox: -4 },
    race: 'fishman', level: 56, scale: 1.6, style: 'ittoryu', weapon: 'sword', ai: 'idle',
    look: { hair: 'long', hairColor: '#ad1457', skin: '#eceff1', top: '#1565c0', bottom: '#0d47a1', swords: 1 },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (done(ctx, 'nw_fmi_coup')
        ? '"The Neptune Army stands at your service, surface-dweller. Brother Fukaboshi says you are a friend of the kingdom. That is enough for me."'
        : '"(A tall, thin oarfish merman rests a hand on his sword.) I am Ryuboshi, second son of King Neptune. Fish-Man Island is restless. Keep your blade sheathed within the palace walls, human."'),
    } } }),
  },
  {
    id: 'nw_manboshi', name: 'Prince Manboshi', title: 'Third Prince of the Ryugu Kingdom', island: 'fishman_island', at: { town: 'ryugu_kingdom', plaza: true, ox: 4 },
    race: 'fishman', level: 54, scale: 1.5, bulk: 1.6, ai: 'idle',
    look: { hair: 'short', hairColor: '#6d4c41', skin: '#ef9a9a', top: '#1565c0', bottom: '#0d47a1' },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (done(ctx, 'nw_decken')
        ? '"Shirahoshi went outside today! She cried the whole way to the Sea Forest. Happy crying, she says. Is there a difference?"'
        : '"(A round, cheerful opah merman.) I\'m Manboshi! Have you met our little sister? She\'s very shy, and very big, and she cries a lot. Someone keeps throwing axes at her tower. Axes! At a princess!"'),
    } } }),
  },
  {
    id: 'nw_den', name: 'Den', title: 'Coating mechanic & Sea Forest researcher', island: 'sea_forest', at: { dx: 0.3, dy: 0.05 },
    race: 'fishman', level: 18,
    look: { hair: 'bald', skin: '#78909c', top: '#6d4c41', bottom: '#4e342e', goggles: true },
    marker: (c, g) => (stageIs(g, 'nw_otohime', 'signatures') && !c.flags.nw_sig_den ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Don! A visitor in the Sea Forest! Everything that sinks from the surface ends up here, don — shipwrecks, treasure, even a stone older than the World Government. My big brother Tom built ships in Water 7. I coat them, don!"',
          choices: [
            { text: 'Tell me about the stone.', next: 'stone' },
            { text: 'Will you sign Queen Otohime\'s petition?', if: () => active(ctx, 'nw_otohime', 'signatures') && !ctx.flag('nw_sig_den'), next: 'sign' },
            { text: 'Look over my ship (shipwright).', do: (c) => c.open('shipwright', {}) },
            { text: 'Bye, Den.', end: true },
          ],
        },
        stone: { text: '"A Poneglyph, don. Nobody can read it, but the royal family says it\'s an apology — from someone called Joy Boy, to Fish-Man Island. An apology eight hundred years old! What did he do? What did he promise? It keeps me up at night, don."', next: 'a' },
        sign: {
          text: '"Otohime\'s petition? Don! I signed it once already, ten years ago. I\'ll sign it again, twice as big!"',
          onEnter: (c) => { c.setFlag('nw_sig_den'); if (c.flag('nw_sig_shyarly') && c.flag('nw_sig_jinbe')) c.setFlag('nw_sigAll'); },
          next: 'a',
        },
      },
    }),
  },
  {
    id: 'nw_shyarly', name: 'Madam Shyarly', title: 'Proprietor of the Mermaid Café', island: 'fishman_island', at: { town: 'mermaid_cove', building: 'Mermaid Café' },
    race: 'fishman', level: 16,
    look: { hair: 'long', hairColor: '#1a237e', skin: '#f9dcc4', top: '#ce93d8', bottom: '#4a148c' },
    marker: (c, g) => (stageIs(g, 'nw_otohime', 'signatures') && !c.flags.nw_sig_shyarly ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => done(ctx, 'nw_fmi_coup')
            ? '"(Madam Shyarly exhales a long ribbon of pipe smoke.) I smashed my crystal ball after the fighting. Some futures are better left unseen. Sit. The mermaids will bring you something."'
            : '"Welcome to the Mermaid Café. (She studies you through her pipe smoke.) Hm. I stopped telling fortunes... but I\'ve been seeing this island in ruins, over and over. And a stranger from the surface standing in Gyoncorde Plaza. Whether you are the one who ruins it — that, I can\'t see."',
          choices: [
            { text: 'Something to eat and drink.', do: (c) => c.open('shop', { shop: 'nw_mermaid_cafe', building: { name: 'Mermaid Café', role: 'cafe' } }) },
            { text: 'Read my fortune after all. (฿5,000)', if: () => !done(ctx, 'nw_fmi_coup'), do: (c) => (c.pay(5000) ? 'fortune' : 'a') },
            { text: 'Will you sign Queen Otohime\'s petition?', if: () => active(ctx, 'nw_otohime', 'signatures') && !ctx.flag('nw_sig_shyarly'), next: 'sign' },
            { text: 'Tell me about your brother, Arlong.', next: 'arlong' },
            { text: 'Goodbye.', end: true },
          ],
        },
        fortune: {
          text: () => ['"I see... a stone, red as blood, on the back of something that walks. Four of them, and a laughing island at the end. Don\'t look so pleased. Everyone who chases that dies young."', '"I see a woman as tall as a castle, a cake, and your own name written in a ledger of lifespans. Refuse her tea at your peril."', '"Strings. A cage of strings over a country of flowers. And toys that remember they used to be people."', '"Fire and ice on one island, and children who are far too large. Whatever you find there — don\'t eat the candy."'][Math.floor(Math.random() * 4)],
          next: 'a',
        },
        sign: {
          text: '"(She signs with a flourish, then looks away.) Otohime used to come in here and lecture my customers about the surface. I told her she was a fool. ...She was right, and I was the fool."',
          onEnter: (c) => { c.setFlag('nw_sig_shyarly'); if (c.flag('nw_sig_den') && c.flag('nw_sig_jinbe')) c.setFlag('nw_sigAll'); },
          next: 'a',
        },
        arlong: { text: '"My older brother went to the East Blue to build an empire of fish-men and ended up in a Marine prison. He hated humans because men like Hody taught him to. Hatred is a family recipe down here. Some of us stopped cooking it."', next: 'a' },
      },
    }),
  },
  {
    id: 'nw_jinbe', name: 'Jinbe', title: '"Knight of the Sea", Fish-Man Karate master', island: 'fishman_island', at: { town: 'fishman_district', building: 'Fish-Man Karate Dojo' }, trainer: 'jinbe',
    race: 'fishman', level: 84, scale: 1.35, bulk: 1.6, style: 'fishman_karate', haki: { armament: 70, observation: 60 },
    look: { hair: 'long', hairColor: '#212121', skin: '#4a69bd', top: '#e65100', bottom: '#3e2723', belt: '#212121' },
    marker: (c, g) => (stageIs(g, 'nw_otohime', 'signatures') && !c.flags.nw_sig_jinbe ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => done(ctx, 'nw_fmi_coup')
            ? '"You stood between Hody and this island. I am in your debt — and Jinbe pays his debts. The dojo is open to you."'
            : '"I am Jinbe, once of the Sun Pirates. Fish-Man Karate does not strike the body — it strikes the water inside it. ...You have heard about Hody? He is what happens when children are raised on a hatred their elders were ashamed of."',
          choices: [
            { text: 'Teach me Fish-Man Karate.', do: (c) => c.open('trainer', { trainer: 'jinbe' }) },
            { text: 'Tell me about Fisher Tiger.', next: 'tiger' },
            { text: 'Will you sign Queen Otohime\'s petition?', if: () => active(ctx, 'nw_otohime', 'signatures') && !ctx.flag('nw_sig_jinbe'), next: 'sign' },
            { text: 'Farewell, Jinbe.', end: true },
          ],
        },
        tiger: { text: '"Fisher Tiger climbed the Red Line with his bare hands and freed the slaves of Mary Geoise — humans and fish-men alike. He founded the Sun Pirates, and the sun on our backs covers the slave brand. He died refusing a human\'s blood. I have spent my life trying to finish what he could not."', next: 'a' },
        sign: {
          text: '"(Jinbe signs carefully, pressing hard with the brush.) Queen Otohime told us that hatred must end with our generation. I was too proud to listen. I am listening now."',
          onEnter: (c) => { c.setFlag('nw_sig_jinbe'); if (c.flag('nw_sig_den') && c.flag('nw_sig_shyarly')) c.setFlag('nw_sigAll'); },
          next: 'a',
        },
      },
    }),
  },
  {
    id: 'nw_kaisho', name: 'Kaisho', title: 'Fish-Man Karate student', island: 'fishman_island', at: { town: 'fishman_district', plaza: true, ox: -3 },
    race: 'fishman', level: 46, style: 'fishman_karate', moves: ['fmk_uchimizu', 'fmk_arabesque'],
    look: { hair: 'short', hairColor: '#212121', skin: '#f3a683', top: '#fafafa', bottom: '#fafafa', belt: '#212121' },
    recruit: { role: 'fighter', fighter: true, requires: (c, g) => g.quests.isDone('nw_fmi_coup'), pitch: '"Queen Otohime said we should go and see the surface with our own eyes. Take me with you! I\'ll show the New World what Fish-Man Karate can do — for the right reasons this time."' },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => done(ctx, 'nw_fmi_coup')
            ? '"You beat Hody! Half the district was ready to follow him, you know. Now they want to see the surface instead. So do I!"'
            : '"Hody\'s crew says every human is our enemy. But Queen Otohime said hatred is something you have to be taught. ...I don\'t want to be taught it. Is that weakness?"',
          choices: [{ text: 'It\'s courage.', end: true }],
        },
      },
    }),
  },
  // --- the New Fish-Man Pirates (Gyoncorde Plaza, during the coup)
  {
    id: 'nw_dosun', name: 'Dosun', title: 'Officer, New Fish-Man Pirates', island: 'fishman_island', at: { spot: 'gyoncorde_plaza', ox: -5 },
    race: 'fishman', level: 52, named: true, hostile: true, faction: 'pirate', style: 'brawler', weapon: 'mace', bulk: 1.5, skill: 0.35,
    look: { hair: 'long', hairColor: '#f8bbd0', skin: '#90caf9', top: '#37474f', bottom: '#263238' },
    moves: ['nw_dosun_tshot', 'nw_dosun_papara'], alert: 'Humans don\'t belong down here!',
    when: (c, g) => stageIs(g, 'nw_fmi_coup', 'officers') && !c.defeated.nw_dosun,
  },
  {
    id: 'nw_zeo', name: 'Zeo', title: '"Noble of the Fish-Man District"', island: 'fishman_island', at: { spot: 'gyoncorde_plaza', ox: -2 },
    race: 'fishman', level: 52, named: true, hostile: true, faction: 'pirate', style: 'brawler', skill: 0.4,
    look: { hair: 'bald', skin: '#5c6bc0', top: '#3949ab', bottom: '#283593' },
    moves: ['nw_zeo_flail', 'nw_zeo_camouflage'], alert: 'You have stepped into my space.',
    when: (c, g) => stageIs(g, 'nw_fmi_coup', 'officers') && !c.defeated.nw_zeo,
  },
  {
    id: 'nw_daruma', name: 'Daruma', title: 'Officer, New Fish-Man Pirates', island: 'fishman_island', at: { spot: 'gyoncorde_plaza', ox: 2 },
    race: 'fishman', level: 50, named: true, hostile: true, faction: 'pirate', style: 'brawler', scale: 0.8, skill: 0.3,
    look: { hair: 'bald', skin: '#e57373', top: '#6d4c41', bottom: '#4e342e', sharpTeeth: true, grin: true },
    moves: ['nw_daruma_cutter', 'nw_daruma_otoshi'], alert: 'I\'ll chew right through you!',
    when: (c, g) => stageIs(g, 'nw_fmi_coup', 'officers') && !c.defeated.nw_daruma,
  },
  {
    id: 'nw_ikaros', name: 'Ikaros Much', title: 'Officer, New Fish-Man Pirates', island: 'fishman_island', at: { spot: 'gyoncorde_plaza', ox: 5 },
    race: 'fishman', level: 53, named: true, hostile: true, faction: 'pirate', style: 'brawler', scale: 1.5, skill: 0.3,
    look: { hair: 'bald', skin: '#f5f5f5', top: '#b0bec5', bottom: '#78909c' },
    moves: ['nw_ikaros_spit', 'nw_ikaros_ink'], alert: 'Squid ink and spit — that\'s all a human deserves!',
    when: (c, g) => stageIs(g, 'nw_fmi_coup', 'officers') && !c.defeated.nw_ikaros,
  },
  {
    id: 'nw_hyouzou', name: 'Hyouzou', title: 'Mercenary swordsman of Fish-Man Island', island: 'fishman_island', at: { spot: 'gyoncorde_plaza', ox: 0, oy: 3 },
    race: 'fishman', level: 56, named: true, hostile: true, faction: 'pirate', style: 'nitoryu', weapon: 'sword', skill: 0.5,
    look: { hair: 'long', hairColor: '#212121', skin: '#80deea', top: '#004d40', bottom: '#263238', swords: 2 },
    moves: ['nw_hyouzou_hasso', 'nw_hyouzou_venom', 'nito_taka'], alert: 'Hic... I get paid either way.',
    when: (c, g) => stageIs(g, 'nw_fmi_coup', 'officers') && !c.defeated.nw_hyouzou,
  },
  {
    id: 'nw_hody', name: 'Hody Jones', title: 'Captain of the New Fish-Man Pirates', island: 'fishman_island', at: { spot: 'gyoncorde_plaza' },
    race: 'fishman', level: 58, boss: true, hostile: true, hpMul: 1.2, faction: 'pirate', style: 'fishman_karate', bulk: 1.4, skill: 0.5,
    look: { hair: 'spiky', hairColor: '#212121', skin: '#90a4ae', top: '#fafafa', bottom: '#1a237e', fin: true, grin: true, sharpTeeth: true },
    moves: ['nw_hody_yabusame', 'nw_hody_umidaiko', 'nw_hody_bite', 'fmk_uchimizu'], breakthrough: 4,
    alert: 'Humans are inferior beings! Today, Fish-Man Island becomes ours!', barks: ['Jahahahaha!', 'Kneel, human!', 'I am the future of the fish-men!'],
    phases: [
      { at: 0.55, run: buffPhase({ id: 'nw_es', name: 'Energy Steroids', dur: 60, mods: { damage: 1.4, atkSpeed: 1.15 }, aura: 'rgba(66,165,245,0.45)' }, 'ENERGY STEROIDS!', '#42a5f5') },
      { at: 0.22, run: buffPhase({ id: 'nw_es_overdose', name: 'Overdose', dur: 60, mods: { damage: 1.35, scale: 1.3, defMul: 0.85 }, aura: 'rgba(21,101,192,0.6)' }, 'MORE! GIVE ME MORE!', '#1565c0') },
    ],
    when: (c, g) => stageIs(g, 'nw_fmi_coup', 'hody'),
  },
  {
    id: 'nw_decken', name: 'Vander Decken IX', title: 'Captain of the Flying Pirates', island: 'fishman_island', at: { spot: 'coral_hill' },
    race: 'fishman', level: 55, boss: true, hostile: true, hpMul: 1.1, faction: 'pirate', style: 'brawler', skill: 0.4,
    look: { hair: 'long', hairColor: '#212121', skin: '#c8a27c', top: '#6d4c41', bottom: '#3e2723', hat: 'captain', hatColor: '#3e2723', coat: '#4e342e', sharpTeeth: true },
    moves: ['nw_mato_axe', 'nw_mato_barrage'], breakthrough: 3, ranged: true, prefRange: 8,
    alert: 'You are standing between me and my bride! MARKED!', barks: ['She WILL marry me!', 'My aim never misses!'],
    phases: [{ at: 0.4, run: both(addMoves('nw_mato_noah'), (a, g) => g.ui.banner('THE NOAH RISES', 'Mato Mato no Mi', 'Decken lays his marked hand on the ancient ark. It lifts from the seabed...', 4)) }],
    when: (c, g) => stageIs(g, 'nw_decken', 'decken'),
  },

  // ============================================================ NEW MARINEFORD
  {
    id: 'nw_sakazuki', name: 'Fleet Admiral Sakazuki', title: '"Akainu"', island: 'new_marineford', at: { town: 'marine_hq_nw', building: 'Marine Headquarters' },
    level: 118, faction: 'marine', fruit: 'magu', fixedPower: 99999, ai: 'idle', scale: 1.2, bulk: 1.3,
    look: { hair: 'short', hairColor: '#212121', skin: '#c68642', top: '#b71c1c', bottom: '#b71c1c', coat: '#fafafa', coatText: 'JUSTICE', hat: 'marine', hatColor: '#fafafa' },
    marker: (c, g) => (isMarine(c) && !g.quests.state('nw_new_justice') ? '!' : stageIs(g, 'nw_new_justice', 'report') ? '?' : null),
    when: (c) => !(c.bounty > 0 && c.faction !== 'marine'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (isMarine(ctx.char)
            ? '"You\'re one of mine? Then listen. I moved Headquarters into the New World to stare the Emperors in the face. Absolute Justice does not flinch — and it does not forgive."'
            : '"(The Fleet Admiral does not look up.) A civilian, wandering Headquarters. Say what you came to say, then leave."'),
          choices: [
            { text: 'I\'m ready for New World orders.', if: () => isMarine(ctx.char) && !started(ctx, 'nw_new_justice'), next: 'orders' },
            { text: 'Mission accomplished, Fleet Admiral.', if: () => active(ctx, 'nw_new_justice', 'report'), next: 'report' },
            { text: 'Marine business (office).', if: () => isMarine(ctx.char), do: (c) => c.emit('marineOffice', { name: 'Marine Headquarters' }), end: true },
            { text: 'Leave.', end: true },
          ],
        },
        orders: {
          text: '"Report to G-5 by the Red Line. From there: the renegade scientist Caesar Clown is hiding on Punk Hazard — bring him down. And the Warlord Doflamingo... the Government protects him. I do not. If you find his crimes on Dressrosa, end him."',
          choices: [{ text: 'Understood!', do: (c) => c.startQuest('nw_new_justice'), end: true }],
        },
        report: {
          text: '"Caesar Clown, and a Warlord. ...The Gorosei will be furious. Good. The Marines need officers who finish the job. Your merit has been recorded."',
          onEnter: (c) => c.complete('nw_new_justice'),
        },
      },
    }),
  },
  {
    id: 'nw_hq_recruiter', name: 'Recruiting Officer', title: 'Marine Headquarters', island: 'new_marineford', at: { town: 'marine_hq_nw', plaza: true, ox: 3 },
    level: 40, faction: 'marine', look: { hair: 'short', hairColor: '#5d4037', top: '#fafafa', bottom: '#1b4f72', hat: 'marine' },
    when: (c) => !(c.bounty > 0 && c.faction !== 'marine'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Headquarters is on a war footing — the Emperors, the Revolutionaries, the Worst Generation. We need every sword. Even yours."',
          choices: [
            { text: 'Enlist in the Marines.', if: () => ctx.char.faction !== 'marine', do: (c) => c.emit('marineEnlist', 'New Marineford'), end: true },
            { text: 'Marine business.', if: () => ctx.char.faction === 'marine', do: (c) => c.emit('marineOffice', { name: 'Marine Headquarters' }), end: true },
            { text: 'Carry on.', end: true },
          ],
        },
      },
    }),
  },

  // ======================================================================= G-5
  {
    id: 'nw_vergo_g5', name: 'Vice Admiral Vergo', title: 'Commander of Marine Base G-5', island: 'g5_base', at: { town: 'g5_base_town', building: 'G-5 Headquarters' },
    level: 66, faction: 'marine', ai: 'idle',
    look: { hair: 'short', hairColor: '#212121', skin: '#e0ac7e', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE' },
    when: (c, g) => !g.quests.isDone('nw_punk_hazard') && !['vergo', 'report'].includes(g.quests.stageId('nw_punk_hazard')) && !c.bosses.includes('nw_vergo'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"(A stern Vice Admiral with a piece of bamboo stuck to his cheek. Nobody dares tell him.) G-5 does not take orders from Headquarters, and it certainly does not take them from you. Punk Hazard? A restricted Government island. Stay away from it."',
          choices: [
            { text: 'You have something on your face.', next: 'face' },
            { text: 'Marine business.', if: () => isMarine(ctx.char), do: (c) => c.emit('marineOffice', { name: 'G-5 Headquarters' }), end: true },
            { text: 'Leave.', end: true },
          ],
        },
        face: { text: '"...(He removes the bamboo without a flicker of expression and eats it.) Is there anything else?"', next: 'a' },
      },
    }),
  },
  {
    id: 'nw_g5_marine', name: 'G-5 Marine', title: 'Rowdy soldier of G-5', island: 'g5_base', at: { town: 'g5_base_town', plaza: true, ox: -3 },
    level: 38, faction: 'marine', look: { hair: 'mohawk', hairColor: '#fdd835', top: '#fafafa', bottom: '#1b4f72', hat: 'bandana', hatColor: '#fafafa' },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nw_punk_hazard')
            ? '"Vergo... a spy for Doflamingo the whole time? And we called him \'Vergo-san\'! Vice Admiral Smoker\'s in charge now. At least HE yells at us honestly."'
            : '"Oi! You\'re not from HQ, are you? Good. HQ hates us. We\'re G-5, the worst branch in the Navy — we don\'t follow orders, we follow Vergo-san and Vice Admiral Smoker."'),
          choices: [
            { text: 'Enlist here.', if: () => ctx.char.faction !== 'marine' && !(ctx.char.bounty > 0), do: (c) => c.emit('marineEnlist', 'G-5'), end: true },
            { text: 'Marine business.', if: () => isMarine(ctx.char), do: (c) => c.emit('marineOffice', { name: 'G-5 Base' }), end: true },
            { text: 'See you.', end: true },
          ],
        },
      },
    }),
  },

  // ============================================================== RAIJIN ISLAND
  {
    id: 'nw_kasa', name: 'Kasa', title: 'Umbrella seller of Raijin Island', island: 'raijin_island', at: { town: 'raijin_hamlet', building: "Kasa's Umbrella Stand" },
    level: 4, look: { hair: 'bun', hairColor: '#bdbdbd', skin: '#e0ac7e', top: '#795548', bottom: '#5d4037', scale: 0.8 },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"(A tiny, wrinkled old woman in a cloak holds out an umbrella.) Hee hee. Visitor? You\'ll want one of these, dearie. Raijin Island\'s lightning falls like rain — hundreds of bolts an hour. A Raijin umbrella sends them elsewhere. Mostly."',
          choices: [
            { text: 'Show me the umbrellas.', do: (c) => c.open('shop', { shop: 'nw_raijin_stand', building: { name: "Kasa's Umbrella Stand", role: 'shop' } }) },
            { text: 'Who lives on an island like this?', next: 'who' },
            { text: 'Goodbye.', end: true },
          ],
        },
        who: { text: '"Stubborn people, dearie. And pirates fresh from Fish-Man Island, whose Log Pose points here. A big monk with wings came through not long ago. He laughed at the lightning. It hit him eleven times. He laughed harder."', next: 'a' },
      },
    }),
  },
  {
    id: 'nw_urouge', name: 'Urouge', title: '"Mad Monk", Worst Generation', island: 'raijin_island', at: { spot: 'thunder_plain' },
    race: 'skypiean', level: 62, boss: true, hpMul: 1.1, style: 'brawler', bulk: 1.6, scale: 1.3, skill: 0.45, bounty: 108000000, infamy: true, breakthrough: 3,
    look: { hair: 'bald', skin: '#c68642', top: '#212121', bottom: '#3e2723' },
    moves: ['nw_urouge_mallet', 'nw_urouge_quake', 'brawl_tackle'], haki: { armament: 45 },
    alert: 'Fate threw us together under the thunder! Let us see whose luck is stronger!',
    phases: [
      { at: 0.65, run: buffPhase({ id: 'nw_urouge_1', name: 'Power Charge', dur: 90, mods: { damage: 1.25, scale: 1.12 } }, 'Your blows only make me stronger!', '#ffd54f') },
      { at: 0.3, run: buffPhase({ id: 'nw_urouge_2', name: 'Power Charge II', dur: 90, mods: { damage: 1.25, defMul: 0.85, scale: 1.12 } }, 'HAHAHA! MORE!', '#ffd54f') },
    ],
    when: (c) => !c.bosses.includes('nw_urouge'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"(A giant winged monk sits cross-legged in the lightning, grinning.) Welcome, fellow traveller! I am Urouge of the Fallen Monk Pirates. The heavens strike this island a thousand times a day... and still I stand. Tell me — do you believe in fate?"',
          choices: [
            { text: 'I believe in my fists. Fight me.', do: (c) => { c.startQuest('nw_urouge'); provoke(c.game, 'nw_urouge'); }, end: true },
            { text: 'Where are you headed?', next: 'where' },
            { text: 'Not today.', end: true },
          ],
        },
        where: { text: '"Wherever the needle trembles most! A monk from a sky island should see the whole world before he goes back to the clouds. The New World is a fine place to learn humility — or to teach it."', next: 'a' },
      },
    }),
  },

  // =========================================================== RISKY RED ISLAND
  {
    id: 'nw_hawkins', name: 'Basil Hawkins', title: '"Magician", Worst Generation', island: 'risky_red_island', at: { spot: 'hawkins_camp' },
    level: 66, boss: true, hpMul: 1.1, style: 'ittoryu', weapon: 'sword', skill: 0.55, bounty: 320000000, infamy: true, breakthrough: 3,
    look: { hair: 'long', hairColor: '#fff59d', skin: '#fdeee4', top: '#4a148c', bottom: '#311b92', coat: '#5d4037', eyeColor: '#b71c1c', swords: 1 },
    moves: ['nw_hawkins_straw_sword', 'nw_hawkins_nail', 'nw_hawkins_effigy'], haki: { armament: 40, observation: 50 },
    alert: 'The cards said you would come. They also said you would lose.',
    phases: [{ at: 1, run: foresight }],
    when: (c) => !c.bosses.includes('nw_hawkins'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"(A pale man lays tarot cards on a crate without looking at you.) Basil Hawkins. The needle that points to this island shakes harder than any other — did you wonder why? ...Your chance of dying if you draw your weapon now: thirty-one percent. I would not."',
          choices: [
            { text: 'Tell me my fortune.', next: 'fortune' },
            { text: 'I\'ll take those odds.', do: (c) => { c.startQuest('nw_hawkins'); provoke(c.game, 'nw_hawkins'); }, end: true },
            { text: 'Leave him to his cards.', end: true },
          ],
        },
        fortune: {
          text: () => ['"The Tower, reversed. A great house will fall on an island of flowers. You will be standing close enough to feel the dust."', '"Death — which only means change. You will hold a red stone\'s words in your hands before the year ends. Zero percent chance you understand them."', '"The Emperor. An old woman who is also a nation. She will offer you tea. Probability you survive refusing: two percent."'][Math.floor(Math.random() * 3)],
          next: 'a',
        },
      },
    }),
  },

  // ============================================================= MYSTORIA ISLAND
  {
    id: 'nw_vivre_maker', name: 'Vivre Card Craftsman', title: 'Vivre Card Workshop', island: 'mystoria_island', at: { town: 'mystoria_town', building: 'Vivre Card Workshop' },
    level: 6, look: { hair: 'bald', skin: '#f1c9a0', top: '#8d6e63', bottom: '#5d4037', goggles: true },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Somewhere in the New World there\'s a shop that makes Vivre Cards. Congratulations — you found it. A clipping of fingernail, a secret recipe, and the paper crawls toward its owner forever. It burns as their life burns down."',
          choices: [
            { text: 'Browse the shop.', do: (c) => c.open('shop', { shop: 'nw_vivre_shop', building: { name: 'Vivre Card Workshop', role: 'shop' } }) },
            { text: 'Make me a card of my own. (฿20,000)', if: () => !ctx.flag('nw_ownVivre'), do: (c) => (c.pay(20000) ? 'card' : 'a') },
            { text: 'Where can a Log Pose not take me?', next: 'zou' },
            { text: 'Goodbye.', end: true },
          ],
        },
        card: {
          text: '"(He clips your nail, mutters over a vat of pale pulp, and hands you a blank white card.) There. Tear off pieces and give them to your crew — wherever you are, they\'ll find you. Or what\'s left of you."',
          onEnter: (c) => { c.setFlag('nw_ownVivre'); c.give('vivre_card', 1); },
          next: 'a',
        },
        zou: { text: '"Zou, for one. It isn\'t an island at all — it\'s an elephant, walking the sea for a thousand years. No log can hold it. The Minks who live on its back hand out Vivre Cards to their friends. Get one of those, and you\'ll find it."', next: 'a' },
      },
    }),
  },

  // ================================================================ PUNK HAZARD
  {
    id: 'nw_law', name: 'Trafalgar Law', title: '"Surgeon of Death", Warlord of the Sea', island: 'punk_hazard', at: { spot: 'law_camp' },
    level: 78, fruit: 'ope', fruitMastery: 85, style: 'ittoryu', weapon: 'sword', ai: 'idle', haki: { armament: 60, observation: 55 },
    look: { hair: 'short', hairColor: '#212121', skin: '#e0ac7e', top: '#212121', bottom: '#90caf9', coat: '#212121', hat: 'beanie', hatColor: '#fafafa', swords: 1 },
    doctor: { line: '"Sit still. I\'m a doctor. They call me the Surgeon of Death, but I\'ve never lost a patient I wanted to keep."' },
    marker: (c, g) => (stageIs(g, 'nw_punk_hazard', 'law') || stageIs(g, 'nw_punk_hazard', 'report') ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nw_punk_hazard')) return '"Caesar is in a box, Vergo is finished, and Doflamingo will be losing sleep. Next is Dressrosa. Don\'t get in my way there."';
            if (active(ctx, 'nw_punk_hazard', 'report')) return '"You finished Vergo? ...Hah. Then the SAD factory is a crater and Joker\'s supply line is cut."';
            if (active(ctx, 'nw_punk_hazard', 'law')) return '"(A man in a spotted hat sits on a pile of wreckage, an enormous sword across his knees.) You took down Brownbeard\'s centaurs. Loud. I\'ve been watching this island for two years and you ruined my quiet in ten minutes."';
            return '"Trafalgar Law. This island is mine for now. If you\'re here for Caesar, get in line."';
          },
          choices: [
            { text: 'What is going on here?', if: () => active(ctx, 'nw_punk_hazard', 'law'), next: 'offer' },
            { text: 'Vergo is finished.', if: () => active(ctx, 'nw_punk_hazard', 'report'), next: 'report' },
            { text: 'Patch me up, doctor.', do: (c) => c.open('doctor', {}) },
            { text: 'Leave.', end: true },
          ],
        },
        offer: {
          text: () => (isMarine(ctx.char)
            ? '"A Marine. Fine — I don\'t care whose flag you fly. Caesar Clown is making SAD here, the base for Joker\'s artificial Devil Fruits, and he\'s been drugging kidnapped children with candy. Free the children in the Biscuits Room. I\'ll handle the rest."'
            : '"Caesar Clown makes SAD here — the base for Doflamingo\'s artificial Devil Fruits — and he feeds kidnapped children candy laced with drugs. Kidnap Caesar and a chain of dominoes falls, right up to an Emperor. An alliance, then. Start with the children in the Biscuits Room."'),
          choices: [{ text: 'Deal. The Biscuits Room.', do: (c) => { c.setFlag('nw_lawAlliance'); c.stage('nw_punk_hazard', 'children'); }, end: true }],
        },
        report: {
          text: '"Take this. It\'s a Vivre Card — it leads to my crew, waiting on Zou. No Log Pose can find that island. If you ever need a surgeon in the New World... don\'t make it a habit."',
          onEnter: (c) => c.complete('nw_punk_hazard'),
        },
      },
    }),
  },
  {
    id: 'nw_brownbeard', name: 'Brownbeard', title: 'Leader of the Centaur Patrol Unit', island: 'punk_hazard', at: { spot: 'centaur_patrol' },
    level: 52, named: true, hostile: true, faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, bulk: 1.4, skill: 0.35, bounty: 80060000, infamy: true,
    look: { hair: 'curly', hairColor: '#6d4c41', skin: '#e0ac7e', top: '#5d4037', bottom: '#795548', legs: 1.6, hat: 'bandana', hatColor: '#3e2723' },
    moves: ['nw_centaur_charge', 'snipe_explode'], alert: 'Trespassers in the Master\'s land! Centaur Patrol, fire!',
    when: (c, g) => stageIs(g, 'nw_punk_hazard', 'brownbeard') && !c.defeated.nw_brownbeard,
  },
  {
    id: 'nw_mocha', name: 'Mocha', title: 'Kidnapped child', island: 'punk_hazard', at: { town: 'ph_laboratory', building: 'Biscuits Room' },
    level: 8, scale: 1.3, ai: 'idle', look: { hair: 'long', hairColor: '#212121', skin: '#c68642', top: '#ffcc80', bottom: '#8d6e63' },
    marker: (c, g) => (stageIs(g, 'nw_punk_hazard', 'children') ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (active(ctx, 'nw_punk_hazard', 'children')
            ? '"(A giant girl clutches a sack of candy to her chest, shaking.) Don\'t take it! The Master says it\'s medicine, but everyone who eats it gets... strange. I won\'t let the little ones have any more. I won\'t!"'
            : done(ctx, 'nw_punk_hazard') ? '"The G-5 Marines are taking us home! I\'m going to tell everyone about the stranger who wasn\'t scared of the Master."' : '"We\'re not allowed to talk to strangers. The Master says the outside world has a sickness."'),
          choices: [
            { text: 'Throw the candy away. You\'re going home.', if: () => active(ctx, 'nw_punk_hazard', 'children'), next: 'monet' },
            { text: 'Bye, Mocha.', end: true },
          ],
        },
        monet: {
          text: '"(Snow drifts in from nowhere. A woman with wings of snow and the legs of a bird lands in the doorway.) \'Now, now, Mocha. Candy time isn\'t over.\' — Monet, the Master\'s secretary. Her smile does not reach her glasses."',
          onEnter: (c) => c.stage('nw_punk_hazard', 'monet'),
        },
      },
    }),
  },
  {
    id: 'nw_monet', name: 'Monet', title: 'Secretary of Caesar Clown (Yuki Yuki no Mi)', island: 'punk_hazard', at: { spot: 'lab_gate' },
    level: 58, boss: true, hostile: true, hpMul: 1.0, faction: 'pirate', style: 'brawler', skill: 0.5, breakthrough: 3,
    look: { hair: 'long', hairColor: '#81c784', skin: '#f9dcc4', top: '#fafafa', bottom: '#4caf50', goggles: true, wings: 'sky', legs: 1.2 },
    moves: ['nw_yuki_rabi', 'nw_kamakura', 'nw_fubuki', 'nw_tabira_yuki'],
    alert: 'You won\'t leave. Nobody leaves Punk Hazard.', barks: ['Snow never stops.', 'Your body is going numb, isn\'t it?'],
    phases: [
      { at: 1, run: logiaBody('#e3f2fd', ['fire', 'magma']) },
      { at: 0.3, run: buffPhase({ id: 'nw_mannen_yuki', name: 'Mannen Yuki', dur: 60, mods: { damage: 1.3, scale: 1.4 }, aura: 'rgba(227,242,253,0.6)' }, 'Mannen Yuki!', '#e3f2fd') },
    ],
    when: (c, g) => stageIs(g, 'nw_punk_hazard', 'monet'),
  },
  {
    id: 'nw_smiley', name: 'Smiley', title: 'Living SAD slime (Sara Sara no Mi, Model: Axolotl)', island: 'punk_hazard', at: { spot: 'sad_room', ox: 5 },
    level: 54, named: true, hostile: true, faction: 'pirate', style: 'brawler', scale: 1.9, bulk: 1.9, skill: 0.1, hpMul: 1.6,
    look: { hair: 'bald', skin: '#8bc34a', top: '#7cb342', bottom: '#558b2f', grin: true },
    moves: ['nw_smiley_ooze', 'nw_gas_robe'], alert: '(The poison slime turns its huge grinning face toward you.)', barks: ['(blub)', '(gurgle)'],
    when: (c, g) => stageIs(g, 'nw_punk_hazard', 'caesar') && !c.defeated.nw_smiley,
  },
  {
    id: 'nw_caesar', name: 'Caesar Clown', title: '"Master", scientist of weapons of mass destruction', island: 'punk_hazard', at: { town: 'ph_laboratory', building: 'Research Building R-66' },
    level: 64, boss: true, hostile: true, hpMul: 1.2, faction: 'pirate', style: 'brawler', skill: 0.4, bounty: 300000000, infamy: true, breakthrough: 4, ranged: true, prefRange: 6,
    look: { hair: 'long', hairColor: '#4a148c', skin: '#f1c9a0', top: '#6a1b9a', bottom: '#4a148c', coat: '#eceff1', hat: 'horns', hatColor: '#eceff1' },
    moves: ['nw_gas_robe', 'nw_gastanet', 'nw_gastille', 'nw_karakuni'],
    alert: 'Shurororo! A lab rat that walks in on its own! How convenient!', barks: ['Shurororo!', 'I am a GENIUS!', 'Breathe deep!'],
    phases: [
      { at: 1, run: logiaBody('#ce93d8', ['fire']) },
      { at: 0.4, run: both(buffPhase({ id: 'nw_shinokuni_form', name: 'Shinokuni Form', dur: 90, mods: { scale: 1.45, damage: 1.2 }, aura: 'rgba(149,117,205,0.5)' }, 'Behold — SHINOKUNI!', '#b39ddb'), addMoves('nw_shinokuni')) },
    ],
    when: (c, g) => stageIs(g, 'nw_punk_hazard', 'caesar'),
  },
  {
    id: 'nw_vergo', name: 'Vergo', title: '"Demon Bamboo", Donquixote Family officer', island: 'punk_hazard', at: { spot: 'sad_room' },
    level: 66, boss: true, hostile: true, hpMul: 1.2, faction: 'pirate', style: 'brawler', weapon: 'staff', skill: 0.6, breakthrough: 4, armament: true,
    haki: { armament: 72, observation: 40 },
    look: { hair: 'short', hairColor: '#212121', skin: '#e0ac7e', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE' },
    moves: ['nw_vergo_bamboo', 'nw_vergo_demon_bamboo', 'nw_vergo_haki_fist'],
    alert: 'You have seen too much. Young Master\'s business is not for your eyes.', barks: ['Show some respect. It\'s "Vergo-san".', 'Your Haki is thin.'],
    phases: [{ at: 0.55, run: hakiOn('Armament!') }, { at: 0.25, run: hakiOn() }],
    when: (c, g) => stageIs(g, 'nw_punk_hazard', 'vergo'),
  },
  {
    id: 'nw_smoker_ph', name: 'Vice Admiral Smoker', title: 'G-5 (currently in the wrong body)', island: 'punk_hazard', at: { spot: 'g5_camp' },
    level: 80, faction: 'marine', fruit: 'moku', ai: 'idle',
    look: { hair: 'short', hairColor: '#212121', skin: '#f9dcc4', top: '#e1bee7', bottom: '#1565c0', coat: '#fafafa', coatText: 'JUSTICE', goggles: true },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nw_punk_hazard')
            ? '"G-5 is taking the children home. And Vergo... I served under a traitor and never smelled it. Don\'t say a word."'
            : '"(Tashigi\'s body, Smoker\'s scowl, two cigars jammed between her lips.) Don\'t. Look. At me. Trafalgar swapped our hearts. I\'m Smoker. That idiot in my body is Tashigi. If you\'re after Caesar, move fast — this whole island is a gas bomb."'),
          choices: [
            { text: 'How did it happen?', next: 'swap' },
            { text: 'Marine business.', if: () => isMarine(ctx.char), do: (c) => c.emit('marineOffice', { name: 'G-5 field camp' }), end: true },
            { text: 'Good luck, Vice Admiral.', end: true },
          ],
        },
        swap: { text: '"His \'Room\'. One wave of that sword and your heart is in someone else\'s chest. When this is over I\'m putting him in Seastone. Personally."', next: 'a' },
      },
    }),
  },
  {
    id: 'nw_tashigi_ph', name: 'Captain Tashigi', title: 'G-5 (currently in Smoker\'s body)', island: 'punk_hazard', at: { spot: 'g5_camp', ox: 2.5 },
    level: 44, faction: 'marine', style: 'ittoryu', weapon: 'sword', ai: 'idle',
    look: { hair: 'short', hairColor: '#eceff1', skin: '#e0ac7e', top: '#37474f', bottom: '#263238', coat: '#fafafa', coatText: 'JUSTICE', swords: 1 },
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"(Smoker\'s huge body sits hugging its knees.) Please stop staring... I keep reaching for my glasses and poking myself in the eye. Vice Admiral Smoker is VERY angry. He\'s using my body to be angry. It\'s very confusing."' } } }),
  },

  // ================================================================== DRESSROSA
  {
    id: 'nw_gatz', name: 'Gatz', title: 'Announcer of the Corrida Colosseum', island: 'dressrosa', at: { town: 'acacia', building: 'Corrida Colosseum' },
    level: 12, look: { hair: 'pompadour', hairColor: '#212121', skin: '#e0ac7e', top: '#fafafa', bottom: '#212121', goggles: true },
    marker: (c, g) => (!g.quests.state('nw_corrida') ? '!' : stageIs(g, 'nw_corrida', 'prize') ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nw_corrida')
            ? '"LADIES AND GENTLEMEN! The champion walks among us! Autographs cost extra!"'
            : '"LADIES AND GENTLEMEN!! Welcome to the Corrida Colosseum, where blood and glory flow! Today\'s prize, donated by our beloved King Doflamingo himself: the Mera Mera no Mi — Fire Fist Ace\'s very own Devil Fruit!! Fighters, sign up! Fake names welcome!"'),
          choices: [
            { text: 'Sign me up.', if: () => !started(ctx, 'nw_corrida'), next: 'signup' },
            { text: 'I want my prize.', if: () => active(ctx, 'nw_corrida', 'prize'), next: 'prize' },
            { text: 'Tell me about the gladiators.', next: 'glad' },
            { text: 'Goodbye.', end: true },
          ],
        },
        signup: {
          text: '"A new challenger! The rules are simple: there are no rules! Your block is a battle royale — beat three gladiators and you reach the final against the Hero of the Colosseum himself, DIAMANTE! Your block\'s fighters are waiting in the arena outside. Good luck — you\'ll need it!"',
          choices: [{ text: 'Into the arena!', do: (c) => c.startQuest('nw_corrida'), end: true }],
        },
        glad: { text: '"The gladiators are prisoners and debtors, fighting for their freedom! Rebecca, the Undefeated Woman, who has never hurt an opponent. Masked Ricky, the old man in the iron helmet. And in the old days, Kyros — three thousand wins and no losses. Nobody even remembers him now. Funny, that."', next: 'a' },
        prize: {
          text: () => (ctx.char.fruit
            ? '"THE CHAMPION!! Here is your Mera Mera no Mi! ...Er, champion? You already ate a Devil Fruit, didn\'t you? A second one will kill you. Keep it, sell your soul for it, give it to a friend — just don\'t eat it on my stage!"'
            : '"THE CHAMPIOOOON!! As promised — the Mera Mera no Mi, the Flame-Flame Fruit, the fire of Portgas D. Ace! Eat it, and fire itself answers to you!"'),
          onEnter: (c) => c.complete('nw_corrida'),
        },
      },
    }),
  },
  // Colosseum gladiators: friendly outside the ring, turned on you during your block.
  {
    id: 'nw_bellamy', name: 'Bellamy', title: '"The Hyena", gladiator', island: 'dressrosa', at: { spot: 'colosseum_arena', ox: -6 },
    level: 55, named: true, style: 'brawler', skill: 0.4, bounty: 55000000,
    look: { hair: 'short', hairColor: '#fdd835', skin: '#f1c9a0', top: '#212121', bottom: '#5d4037', grin: true },
    moves: ['nw_bellamy_spring', 'brawl_tackle'],
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (ctx.char.defeated.nw_bellamy ? '"...Tch. I used to laugh at people who chased dreams. Doflamingo was the only dream I had. Leave me alone."' : '"Heh! A rookie in the Colosseum? Doflamingo-sama is watching. I\'ll show him I\'m worthy of the Family — by stomping you!"'),
      choices: [{ text: 'Let\'s settle it in the arena!', if: () => active(ctx, 'nw_corrida', 'block') && !ctx.char.defeated.nw_bellamy, do: (c) => provoke(c.game, 'nw_bellamy', 'rival'), end: true }, { text: 'Later.', end: true }] } } }),
  },
  {
    id: 'nw_ideo', name: 'Ideo', title: '"Destruction Cannon", boxer', island: 'dressrosa', at: { spot: 'colosseum_arena', ox: -2 },
    race: 'longarm', level: 58, named: true, style: 'brawler', skill: 0.45,
    look: { hair: 'short', hairColor: '#212121', skin: '#e0ac7e', top: '#fafafa', bottom: '#b71c1c' },
    moves: ['nw_ideo_cannon', 'brawl_knee'],
    recruit: { role: 'fighter', fighter: true, requires: (c, g) => g.quests.isDone('nw_corrida'), pitch: '"You took the whole Colosseum! XXX-rank boxer Ideo, at your service. My fists are yours — point them at something worth destroying!"' },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (done(ctx, 'nw_corrida') ? '"The champion! I trained my whole life for a punch like yours. I want to see the rest of the New World — and you\'re going there, right?"' : '"XXX Gym Martial Arts Alliance, \'Destruction Cannon\' Ideo! I came for the Mera Mera no Mi. You too? Then one of us goes home with a broken jaw."'),
      choices: [{ text: 'Let\'s settle it in the arena!', if: () => active(ctx, 'nw_corrida', 'block') && !ctx.char.defeated.nw_ideo, do: (c) => provoke(c.game, 'nw_ideo', 'rival'), end: true }, { text: 'Later.', end: true }] } } }),
  },
  {
    id: 'nw_hajrudin', name: 'Hajrudin', title: 'Captain of the New Giant Warrior Pirates', island: 'dressrosa', at: { spot: 'colosseum_arena', ox: 2 },
    level: 60, named: true, style: 'elbaf', weapon: 'axe', scale: 2.4, bulk: 1.6, skill: 0.35, hpMul: 1.5,
    look: { hair: 'long', hairColor: '#795548', skin: '#e0ac7e', top: '#5d4037', bottom: '#3e2723', hat: 'horns', hatColor: '#9e9e9e' },
    moves: ['elbaf_hakoku'],
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (ctx.char.defeated.nw_hajrudin ? '"GEGYAGYA! You fought like a warrior of Elbaf, little one. The giants will hear of this."' : '"I am Hajrudin! The New Giant Warrior Pirates will be the pride of Elbaf again! Face me with honour, tiny warrior!"'),
      choices: [{ text: 'Let\'s settle it in the arena!', if: () => active(ctx, 'nw_corrida', 'block') && !ctx.char.defeated.nw_hajrudin, do: (c) => provoke(c.game, 'nw_hajrudin', 'rival'), end: true }, { text: 'Later.', end: true }] } } }),
  },
  {
    id: 'nw_chinjao', name: 'Don Chinjao', title: '"Chinjao the Drill", Happo Navy', island: 'dressrosa', at: { spot: 'colosseum_arena', ox: 6 },
    level: 66, named: true, style: 'hasshoken', scale: 1.8, bulk: 1.4, skill: 0.5, bounty: 542000000, haki: { armament: 50 },
    look: { hair: 'bald', skin: '#f1c9a0', top: '#b71c1c', bottom: '#4e342e' },
    moves: ['nw_chinjao_drill', 'hassho_bushin'],
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (ctx.char.defeated.nw_chinjao ? '"Hmph! Twenty years ago Garp broke my head. Today, you. My grandson Sai leads the Happo Navy now... perhaps that is best."' : '"Chinjao the Drill, twelfth leader of the Happo Navy! I came for a Devil Fruit — and for anyone with Garp\'s smell on them. Do you know Garp?!"'),
      choices: [{ text: 'Let\'s settle it in the arena!', if: () => active(ctx, 'nw_corrida', 'block') && !ctx.char.defeated.nw_chinjao, do: (c) => provoke(c.game, 'nw_chinjao', 'rival'), end: true }, { text: 'Later.', end: true }] } } }),
  },
  {
    id: 'nw_diamante', name: 'Diamante', title: '"Hero of the Colosseum", Donquixote Family officer', island: 'dressrosa', at: { spot: 'colosseum_arena' },
    level: 72, boss: true, hostile: true, hpMul: 1.2, faction: 'pirate', style: 'ittoryu', weapon: 'sword', scale: 1.5, skill: 0.55, bounty: 99000000, infamy: true, breakthrough: 4,
    haki: { armament: 55 }, look: { hair: 'long', hairColor: '#212121', skin: '#e0ac7e', top: '#212121', bottom: '#212121', coat: '#b71c1c', legs: 1.6, swords: 1 },
    moves: ['nw_diamante_flutter', 'nw_diamante_cape', 'nw_diamante_blade'],
    alert: 'Uhahahaha! The crowd came to see a hero win. Guess who the hero is?', barks: ['Uhahahaha!', 'Flutter, my cape!'],
    phases: [{ at: 0.5, run: hakiOn('Uhahaha! Now I\'m serious!') }],
    when: (c, g) => stageIs(g, 'nw_corrida', 'final') || stageIs(g, 'nw_birdcage', 'officers'),
  },
  {
    id: 'nw_rebecca', name: 'Rebecca', title: '"The Undefeated Woman", gladiator', island: 'dressrosa', at: { town: 'acacia', plaza: true, ox: -4 },
    level: 40, style: 'ittoryu', weapon: 'sword', look: { hair: 'long', hairColor: '#f48fb1', skin: '#f9dcc4', top: '#bdbdbd', bottom: '#9e9e9e', swords: 1 },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (ctx.flag('nw_toysFreed')
        ? '"Father... Kyros is my father. I remember everything now — every night he stood guard outside my window, a tin soldier on one leg. And I had forgotten him."'
        : '"I never hurt my opponents. I just push them out of the ring. ...The only one who ever cared about me is a little toy soldier with one leg. Isn\'t that silly? I don\'t even know where he came from."'),
    } } }),
  },
  {
    id: 'nw_cavendish', name: 'Cavendish', title: '"Cavendish of the White Horse", Pirate Prince', island: 'dressrosa', at: { town: 'acacia', plaza: true, ox: 4 },
    level: 70, style: 'ittoryu', weapon: 'sword', ai: 'idle', bounty: 280000000,
    look: { hair: 'long', hairColor: '#fdd835', skin: '#fdeee4', top: '#fafafa', bottom: '#fafafa', coat: '#1565c0', swords: 1 },
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"(He flips his golden hair.) Cavendish of the White Horse. Yes, THAT Cavendish. My fans were everything, until the \'Worst Generation\' stole the headlines. I entered this tournament to take back the spotlight. ...Why is nobody looking at me?"' } } }),
  },
  {
    id: 'nw_bartolomeo', name: 'Bartolomeo', title: '"The Cannibal", Barto Club captain', island: 'dressrosa', at: { town: 'acacia', plaza: true, ox: 7 },
    level: 64, fruit: 'bari', ai: 'idle', bounty: 150000000,
    look: { hair: 'mohawk', hairColor: '#66bb6a', skin: '#f1c9a0', top: '#fafafa', bottom: '#1565c0', coat: '#212121', grin: true, sharpTeeth: true },
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Oi. OI. You\'re blocking my view of the entrance. Luffy-senpai might walk through it any second! Straw Hat Luffy is my HERO, get it?! ...Barrier! Nothing gets through my Barrier. Except tears. Tears get through."' } } }),
  },
  {
    id: 'nw_riku', name: 'Ricky', title: 'Masked gladiator (King Riku Dold III)', island: 'dressrosa', at: { town: 'acacia', building: 'Colosseum Tavern' },
    level: 48, style: 'ittoryu', weapon: 'sword', look: { hair: 'short', hairColor: '#bdbdbd', skin: '#f1c9a0', top: '#8d6e63', bottom: '#5d4037', hat: 'goggles', hatColor: '#78909c', swords: 1 },
    marker: (c, g) => (stageIs(g, 'nw_birdcage', 'report') ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nw_birdcage')) return '"(He has taken off the iron helmet.) The people want me back on the throne. I told them I am too old, and too ashamed. They did not listen. They never listened to me — that is why I loved them."';
            if (active(ctx, 'nw_birdcage', 'report')) return '"(The old gladiator lifts his iron helmet. Beneath it is the face of Riku Dold III, the king everyone swore was a monster.) The strings are gone. My people are free. And you... you did what I could not do in ten years."';
            return '"(An old man in an iron helmet nurses a cup of water.) Ten years ago the king of this country burned his own people\'s towns. Or so they say. Strings, stranger. Look for the strings. That is all an old gladiator will tell you."';
          },
          choices: [{ text: 'Dressrosa is yours again, King Riku.', if: () => active(ctx, 'nw_birdcage', 'report'), next: 'thanks' }, { text: 'Goodbye.', end: true }],
        },
        thanks: { text: '"Dressrosa will remember this. Not the way it forgot Kyros — truly remember. Whatever you need in this country, ask. You are family here now."', onEnter: (c) => c.complete('nw_birdcage') },
      },
    }),
  },
  {
    id: 'nw_viola', name: 'Violet', title: 'Dancer (Princess Viola)', island: 'dressrosa', at: { town: 'primula', building: 'Café Bar La Baltad' },
    level: 38, look: { hair: 'long', hairColor: '#212121', skin: '#f1c9a0', top: '#e91e63', bottom: '#880e4f' },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (done(ctx, 'nw_birdcage')
        ? '"My name is Viola. My father is King Riku. For ten years I danced for the man who stole our country, to keep my family alive. Now I can use my own name again."'
        : '"(A flamenco dancer watches the door with unusual eyes.) I can see a great distance, stranger — through walls, into hearts. Yours isn\'t the heart of a Donquixote. So I will tell you: the Toy House hides a door. Remember it."'),
    } } }),
  },
  {
    id: 'nw_fujitora', name: 'Admiral Fujitora', title: 'Issho, Admiral of the Marines', island: 'dressrosa', at: { town: 'acacia', building: 'Colosseum Tavern', ox: 3 },
    level: 112, faction: 'marine', fruit: 'zushi', fixedPower: 99999, ai: 'idle',
    look: { hair: 'short', hairColor: '#212121', skin: '#c68642', top: '#6a1b9a', bottom: '#4a148c', coat: '#fafafa', coatText: 'JUSTICE', scarEye: true },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"(A blind swordsman rolls dice in a cup.) I closed my eyes on the world long ago, to stop seeing the ugly things men do. Yet the Warlord system still smells from here. ...Care for a roll? Odd or even. Ten thousand berries."',
          choices: [
            { text: 'Odd. (Bet ฿10,000)', do: (c) => (c.pay(10000) ? (Math.random() < 0.5 ? 'win' : 'lose') : 'a') },
            { text: 'Even. (Bet ฿10,000)', do: (c) => (c.pay(10000) ? (Math.random() < 0.5 ? 'win' : 'lose') : 'a') },
            { text: 'Leave the Admiral to his dice.', end: true },
          ],
        },
        win: { text: '"(He lifts the cup and feels the dice with his fingers.) ...Hm. Heaven smiles on you today. Take it." (You win ฿20,000.)', onEnter: (c) => c.earn(20000, 'dice with an Admiral'), next: 'a' },
        lose: { text: '"(He lifts the cup, touches the dice, and chuckles.) Not your day, friend. Luck is like gravity — it pulls everything down eventually."', next: 'a' },
      },
    }),
  },
  {
    id: 'nw_sabo', name: 'Sabo', title: 'Chief of Staff of the Revolutionary Army', island: 'dressrosa', at: { town: 'acacia', plaza: true, ox: -7 }, trainer: 'revolutionary',
    level: 88, faction: 'revolutionary', style: 'ryusoken', ai: 'idle', haki: { armament: 70, observation: 60 },
    look: { hair: 'curly', hairColor: '#fdd835', skin: '#f9dcc4', top: '#fafafa', bottom: '#1565c0', coat: '#1565c0', hat: 'captain', hatColor: '#212121', scarEye: true },
    when: (c) => !!c.flags.nw_corridaDone,
    dialogue: () => ({
      start: 'a',
      nodes: {
        a: {
          text: '"(A man in a top hat with a burn scar over one eye tips his hat.) You won my brother\'s fruit fair and square. I came here to keep it out of the wrong hands... I suppose it found the right ones. I\'m Sabo. The Revolutionary Army could use someone like you."',
          choices: [{ text: 'Teach me the Dragon Claw.', do: (c) => c.open('trainer', { trainer: 'revolutionary' }) }, { text: 'Goodbye.', end: true }],
        },
      },
    }),
  },
  {
    id: 'nw_doflamingo_king', name: 'Donquixote Doflamingo', title: 'King of Dressrosa, Warlord of the Sea', island: 'dressrosa', at: { town: 'royal_palace_dr', plaza: true, ox: 2 },
    level: 92, fruit: 'ito', ai: 'idle', scale: 1.25,
    look: { hair: 'short', hairColor: '#fdd835', skin: '#f1c9a0', top: '#fafafa', bottom: '#ffb74d', coat: '#f48fb1', goggles: true, grin: true },
    when: (c, g) => !g.quests.state('nw_birdcage'),
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (isMarine(ctx.char)
        ? '"Fufufufu! A Marine in my palace. Relax — I\'m a Warlord. The Government and I are the best of friends. Go and enjoy the Colosseum."'
        : '"Fufufufufu! A pirate walking into my palace like they own it. I like that. Dressrosa is a country of love, passion and toys. Enjoy it... and don\'t go poking at things that aren\'t yours."'),
    } } }),
  },
  // --- Operation SOP
  {
    id: 'nw_wicca', name: 'Wicca', title: 'Tontatta Kingdom Scouting Unit', island: 'dressrosa', at: { town: 'acacia', building: 'Acacia Market', ox: 2 },
    level: 44, style: 'brawler', skill: 0.4, moves: ['brawl_tackle', 'brawl_knee'],
    look: TONTATTA({ hair: 'short', hairColor: '#81d4fa', skin: '#f9dcc4', top: '#1565c0', bottom: '#1565c0', hat: 'beanie', hatColor: '#1565c0' }),
    marker: (c, g) => (!g.quests.state('nw_sop') ? '!' : null),
    recruit: { role: 'fighter', fighter: true, requires: (c, g) => g.quests.isDone('nw_sop'), pitch: '"You freed the princess and all our friends! The Tontatta Kingdom owes you ten thousand favours. The scouts drew lots — I won! Or lost! I\'m coming with you either way!"' },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nw_sop')
            ? '"(The tiny woman beams up at you.) The princess is safe! And the toys remember who they are! Humans are liars... except you. You\'re an exception. A big, clumsy exception!"'
            : '"(A tiny woman with a fluffy tail is halfway into your bag.) Eek! You can SEE me?! I-I\'m a fairy! Fairies take offerings! ...Wait. You\'re not one of Doflamingo\'s. You look strong. Are you strong? We need someone strong."'),
          choices: [
            { text: 'What do you need?', if: () => !started(ctx, 'nw_sop'), next: 'sop' },
            { text: 'Bye, Wicca.', end: true },
          ],
        },
        sop: {
          text: '"The Donquixote Family kidnapped our princess and five hundred of our people to work in their underground factory! The Tonta Corps is planning an operation. Come to Green Bit — cross the iron bridge north of Dressrosa. Watch out for the Fighting Fish!"',
          choices: [{ text: 'Lead the way.', do: (c) => c.startQuest('nw_sop'), end: true }, { text: 'Not now.', end: true }],
        },
      },
    }),
  },
  {
    id: 'nw_toy_soldier', name: 'One-Legged Toy Soldier', title: 'Thunder Soldier', island: 'dressrosa', at: { spot: 'flower_hill' },
    level: 60, style: 'ittoryu', weapon: 'sword', scale: 0.6, skill: 0.6,
    look: { hair: 'short', hairColor: '#212121', skin: '#ffcc80', top: '#b71c1c', bottom: '#212121', hat: 'captain', hatColor: '#212121', swords: 1 },
    marker: (c, g) => (stageIs(g, 'nw_sop', 'soldier') ? '?' : null),
    when: (c) => !c.flags.nw_toysFreed,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (active(ctx, 'nw_sop', 'soldier')
            ? '"(A tin soldier balancing on one leg salutes you with a toy sword.) Leo sent you? Then listen well. Every toy in Dressrosa was once a person. Sugar of the Donquixote Family touched them, and the world forgot they ever existed."'
            : '"(A one-legged toy soldier stands guard over the Colosseum, silent.) ...Move along, friend. A toy has nothing to say."'),
          choices: [{ text: 'Go on.', if: () => active(ctx, 'nw_sop', 'soldier'), next: 'plan' }, { text: 'Leave.', end: true }],
        },
        plan: {
          text: '"Operation SOP — Sugar Ottamage Panic. Knock Sugar out and her curse breaks. Every toy becomes human again, every memory returns. She hides in the Toy House at the foot of the King\'s Plateau. Beware her touch — one tap and you become a toy yourself."',
          choices: [{ text: 'To the Toy House.', do: (c) => c.stage('nw_sop', 'sugar'), end: true }],
        },
      },
    }),
  },
  {
    id: 'nw_kyros', name: 'Kyros', title: '"Thunder Soldier", legend of the Colosseum', island: 'dressrosa', at: { spot: 'flower_hill' }, trainer: 'nw_kyros',
    level: 82, style: 'ittoryu', weapon: 'sword', bulk: 1.4, haki: { armament: 60 },
    look: { hair: 'short', hairColor: '#212121', skin: '#e0ac7e', top: '#fafafa', bottom: '#212121', scarEye: true, swords: 1 },
    when: (c) => !!c.flags.nw_toysFreed,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"(A broad-shouldered man on one leg — flesh, now, not tin.) Ten years a toy. My daughter did not know my face. Now she does. I am Kyros. If you want to learn how a gladiator fights with one leg and no fear, I will teach you."',
          choices: [{ text: 'Train with Kyros.', do: (c) => c.open('trainer', { trainer: 'nw_kyros' }) }, { text: 'Goodbye, Kyros.', end: true }],
        },
      },
    }),
  },
  {
    id: 'nw_sugar', name: 'Sugar', title: 'Donquixote Family officer (Hobi Hobi no Mi)', island: 'dressrosa', at: { spot: 'toy_house' },
    level: 60, boss: true, hostile: true, hpMul: 0.6, faction: 'pirate', style: 'brawler', scale: 0.75, skill: 0.55, breakthrough: 3,
    look: { hair: 'short', hairColor: '#212121', skin: '#fdeee4', top: '#6a1b9a', bottom: '#4a148c' },
    moves: ['nw_hobi_touch', 'nw_hobi_bears'],
    alert: 'Another one who wants to be forgotten? I can do that. Just hold still.', barks: ['Toys don\'t talk back.', '(She pops another grape into her mouth.)'],
    when: (c, g) => stageIs(g, 'nw_sop', 'sugar'),
  },
  {
    id: 'nw_leo', name: 'Leo', title: 'Leader of the Tonta Corps', island: 'green_bit', at: { town: 'tontatta_kingdom', plaza: true, ox: 2 },
    level: 50, style: 'brawler', skill: 0.5,
    look: TONTATTA({ hair: 'spiky', hairColor: '#fdd835', skin: '#f9dcc4', top: '#fafafa', bottom: '#6d4c41', hat: 'bandana', hatColor: '#43a047' }),
    marker: (c, g) => (stageIs(g, 'nw_sop', 'leo') || stageIs(g, 'nw_sop', 'report') ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nw_sop')) return '"Princess Mansherry is home! Our people are home! The Tontatta Kingdom will never forget you — we\'re going to sew your face on a flag! Wait, is that weird? We\'re doing it anyway!"';
            if (active(ctx, 'nw_sop', 'report')) return '"The factory is RUBBLE?! And Sugar is out cold? AAAAH! Everyone! Everyone, the operation succeeded!"';
            if (active(ctx, 'nw_sop', 'leo')) return '"Wicca brought a human?! ...Hm. You don\'t smell like Doflamingo. The Tonta Corps has been planning Operation SOP with a hero from Dressrosa — a one-legged toy soldier. He\'s on Flower Hill. Go and meet him!"';
            return '"I\'m Leo of the Tonta Corps! Humans are liars — that\'s what the Donquixote Family taught us. But Wicca says you\'re different."';
          },
          choices: [
            { text: 'I\'ll find the toy soldier.', if: () => active(ctx, 'nw_sop', 'leo'), do: (c) => c.stage('nw_sop', 'soldier'), end: true },
            { text: 'It\'s done, Leo.', if: () => active(ctx, 'nw_sop', 'report'), do: (c) => c.complete('nw_sop'), end: true },
            { text: 'Goodbye, Leo.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'nw_gancho', name: 'King Gancho', title: 'King of the Tontatta Kingdom', island: 'green_bit', at: { town: 'tontatta_kingdom', building: "King Gancho's Hall" },
    level: 30, look: TONTATTA({ hair: 'bald', skin: '#f9dcc4', top: '#6d4c41', bottom: '#4e342e', hat: 'crown', hatColor: '#ffd54f' }),
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (done(ctx, 'nw_sop')
        ? '"My daughter is home. Our people are home. Eight hundred years ago, the Tontatta Kingdom swore loyalty to the Riku family — and we forgot why we trusted humans. Thank you for reminding an old dwarf."'
        : '"A human in the Tontatta Kingdom... It has been a long time. Ten years ago Doflamingo tricked us into believing the Riku family betrayed us. We believed him. Five hundred of my people paid for it."'),
    } } }),
  },
  {
    id: 'nw_mansherry', name: 'Princess Mansherry', title: 'Tontatta princess (Chiyu Chiyu no Mi)', island: 'green_bit', at: { town: 'tontatta_kingdom', building: "Mansherry's Healing Room" },
    level: 20, look: TONTATTA({ scale: 0.3, hair: 'long', hairColor: '#ffcc80', skin: '#f9dcc4', top: '#f8bbd0', bottom: '#f48fb1', hat: 'crown', hatColor: '#ffd54f' }),
    doctor: { line: '"Hold still, please. My tears heal anything — but don\'t make me cry on purpose, it\'s rude."' },
    when: (c) => !!c.flags.nw_toysFreed,
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"They kept me in a cage and told my people I was ill. Now I\'m home. If you\'re hurt, come to me — I can heal anyone except the Donquixote Family."', choices: [{ text: 'Heal me.', do: (c) => c.open('doctor', {}) }, { text: 'Thank you, Princess.', end: true }] } } }),
  },
  // --- The Birdcage
  {
    id: 'nw_pica', name: 'Pica', title: 'Donquixote Family officer (Ishi Ishi no Mi)', island: 'dressrosa', at: { spot: 'palace_top', ox: -6, oy: 4 },
    level: 74, boss: true, hostile: true, hpMul: 1.3, faction: 'pirate', style: 'ittoryu', weapon: 'sword', scale: 1.6, bulk: 1.4, skill: 0.45, bounty: 99000000, infamy: true, breakthrough: 4,
    haki: { armament: 60 }, look: { hair: 'mohawk', hairColor: '#212121', skin: '#e0ac7e', top: '#1565c0', bottom: '#0d47a1', swords: 1 },
    moves: ['nw_pica_fist', 'nw_pica_spikes'], alert: '(His voice is shockingly high.) Don\'t you DARE laugh.', barks: ['Stone is eternal!', '...Are you laughing?'],
    phases: [{ at: 0.5, run: buffPhase({ id: 'nw_stone_body', name: 'Stone Body', dur: 30, mods: { defMul: 0.6 }, aura: 'rgba(158,158,158,0.6)' }, 'Ishi Ishi!', '#bdbdbd') }],
    when: (c, g) => stageIs(g, 'nw_birdcage', 'officers'),
  },
  {
    id: 'nw_trebol', name: 'Trebol', title: 'Donquixote Family officer (Beta Beta no Mi)', island: 'dressrosa', at: { spot: 'toy_house', ox: 4 },
    level: 72, boss: true, hostile: true, hpMul: 1.2, faction: 'pirate', style: 'brawler', weapon: 'staff', skill: 0.45, bounty: 99000000, infamy: true, breakthrough: 4,
    look: { hair: 'long', hairColor: '#bdbdbd', skin: '#e0ac7e', top: '#1b5e20', bottom: '#2e7d32', nose: 'long' },
    moves: ['nw_trebol_beta', 'nw_trebol_lighter'], alert: 'Nee, nee! You\'re in Doffy\'s way! Behehehehe!', barks: ['Behehehehe!', 'Nee, nee, sticky, isn\'t it?'],
    phases: [{ at: 1, run: stickyBody }],
    when: (c, g) => stageIs(g, 'nw_birdcage', 'officers'),
  },
  {
    id: 'nw_senor_pink', name: 'Señor Pink', title: 'Donquixote Family (Sui Sui no Mi)', island: 'dressrosa', at: { spot: 'birdcage_edge', ox: -4 },
    level: 64, named: true, hostile: true, faction: 'pirate', style: 'brawler', bulk: 1.3, skill: 0.45, bounty: 58000000, infamy: true,
    look: { hair: 'short', hairColor: '#212121', skin: '#e0ac7e', top: '#f48fb1', bottom: '#f48fb1', hat: 'beanie', hatColor: '#f8bbd0' },
    moves: ['nw_pink_swim', 'brawl_headbutt'], alert: 'A hard-boiled man never runs.',
    when: (c, g) => stageIs(g, 'nw_birdcage', 'officers') && !c.defeated.nw_senor_pink,
  },
  {
    id: 'nw_lao_g', name: 'Lao G', title: 'Donquixote Family elite', island: 'dressrosa', at: { spot: 'birdcage_edge', ox: 4 },
    level: 66, named: true, hostile: true, faction: 'pirate', style: 'brawler', scale: 0.9, skill: 0.55, bounty: 61000000, infamy: true,
    look: { hair: 'bald', skin: '#f1c9a0', top: '#ffcc80', bottom: '#ef6c00', hat: 'headband', hatColor: '#fafafa' },
    moves: ['nw_lao_g_palm', 'brawl_knee'], alert: 'G! The G stands for... G!',
    when: (c, g) => stageIs(g, 'nw_birdcage', 'officers') && !c.defeated.nw_lao_g,
  },
  {
    id: 'nw_dellinger', name: 'Dellinger', title: 'Donquixote Family (half fighting fish)', island: 'dressrosa', at: { spot: 'birdcage_edge', oy: 4 },
    race: 'fishman', level: 62, named: true, hostile: true, faction: 'pirate', style: 'black_leg', skill: 0.5, bounty: 15000000, infamy: true,
    look: { hair: 'short', hairColor: '#212121', skin: '#ffe0b2', top: '#fafafa', bottom: '#212121', hat: 'horns', hatColor: '#fafafa' },
    moves: ['nw_dellinger_heel', 'bleg_party'], alert: 'Kya-ha! Young Master said I could play!',
    when: (c, g) => stageIs(g, 'nw_birdcage', 'officers') && !c.defeated.nw_dellinger,
  },
  {
    id: 'nw_doflamingo', name: 'Donquixote Doflamingo', title: '"Heavenly Yaksha", King of Dressrosa', island: 'dressrosa', at: { spot: 'palace_top' },
    level: 92, boss: true, hostile: true, hpMul: 1.4, faction: 'pirate', fruit: 'ito', fruitMastery: 90, style: 'black_leg', scale: 1.25, skill: 0.65,
    bounty: 340000000, infamy: true, breakthrough: 5, haki: { armament: 80, observation: 70, conqueror: 60 },
    look: { hair: 'short', hairColor: '#fdd835', skin: '#f1c9a0', top: '#fafafa', bottom: '#ffb74d', coat: '#f48fb1', goggles: true, grin: true },
    moves: ['ito_overheat', 'ito_parasite', 'ito_fivecolor', 'nw_dofla_tamaito', 'nw_dofla_fulbright', 'bleg_party'],
    alert: 'Fufufufu! Justice will prevail, you say? Of course it will! Whoever wins... is justice!', barks: ['Fufufufu!', 'You\'re all my puppets.', 'Kneel!'],
    phases: [
      { at: 1, run: foresight },
      { at: 0.7, run: both(hakiOn('Fufufu... let\'s get serious.'), addMoves('nw_dofla_haoshoku')) },
      { at: 0.4, run: both(buffPhase({ id: 'nw_dofla_awaken', name: 'Awakening', dur: 90, mods: { damage: 1.3, atkSpeed: 1.2 }, aura: 'rgba(244,143,177,0.55)' }, 'AWAKENING!', '#f48fb1'), addMoves('nw_dofla_god_thread', 'ito_birdcage')) },
    ],
    when: (c, g) => stageIs(g, 'nw_birdcage', 'doflamingo'),
  },

  // ================================================================= APPLENINE
  {
    id: 'nw_applenine_elder', name: 'Cider-Maker Nonna', title: 'Elder of Applenine Village', island: 'applenine_island', at: { town: 'applenine_village', plaza: true, ox: 2 },
    level: 5, look: { hair: 'bun', hairColor: '#eceff1', skin: '#f9dcc4', top: '#b71c1c', bottom: '#5d4037', hat: 'beanie', hatColor: '#c62828' },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (done(ctx, 'nw_birdcage')
        ? '"The Den Den Mushi says Doflamingo has fallen! Dressrosa\'s broadcasts reach us here, you know — we\'re one of its three neighbours. Have some hot cider. Everyone gets hot cider today."'
        : '"Welcome to Applenine! Mind the Colossal Apple — it\'s older than the village, and nobody has ever managed to take a bite. Our snails pick up Dressrosa\'s broadcasts. Lately it\'s all Colosseum, Colosseum, Colosseum."'),
      choices: [{ text: 'A hot cider, please.', do: (c) => c.open('shop', { shop: 'tavern', building: { name: 'Hot Cider Tavern', role: 'tavern' } }) }, { text: 'Goodbye.', end: true }],
    } } }),
  },

  // ==================================================================== SPHINX
  {
    id: 'nw_marco', name: 'Marco', title: '"Marco the Phoenix", doctor of Sphinx', island: 'sphinx', at: { town: 'sphinx_village', building: "Marco's Clinic" }, trainer: 'nw_marco',
    level: 90, fruit: 'tori_phoenix', fruitMastery: 90, style: 'black_leg', ai: 'idle', haki: { armament: 70, observation: 75 },
    look: { hair: 'spiky', hairColor: '#fdd835', skin: '#f1c9a0', top: '#7e57c2', bottom: '#1565c0', openShirt: true },
    doctor: { line: '"Sit down, yoi. I was the Whitebeard Pirates\' doctor for a long time. I\'ve patched up worse than you."' },
    marker: (c, g) => (!g.quests.state('nw_sphinx') ? '!' : stageIs(g, 'nw_sphinx', 'report') ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nw_sphinx')
            ? '"Weevil won\'t be back soon, yoi. Pops left this island no treasure — he spent every berry he ever stole keeping it alive. That IS the inheritance."'
            : '"This is Sphinx, Pops\' home island. The Government abandoned it; Whitebeard never did. I\'m just the village doctor now, yoi. ...And lately, the one who chases off the fools looking for Whitebeard\'s \'fortune\'."'),
          choices: [
            { text: 'Fools?', if: () => !started(ctx, 'nw_sphinx'), next: 'weevil' },
            { text: 'Weevil is beaten.', if: () => active(ctx, 'nw_sphinx', 'report'), next: 'thanks' },
            { text: 'Treat my wounds.', do: (c) => c.open('doctor', {}) },
            { text: 'Train me in Haki.', do: (c) => c.open('trainer', { trainer: 'nw_marco' }) },
            { text: 'Goodbye, Marco.', end: true },
          ],
        },
        weevil: {
          text: '"Edward Weevil — calls himself Whitebeard\'s son, and his mother backs him up. They\'ve been tearing through Pops\' old territories claiming his \'inheritance\'. Now they\'re digging up the ruins of the old town on our shore. I can\'t leave the village unguarded, yoi."',
          choices: [{ text: 'I\'ll handle Weevil.', do: (c) => c.startQuest('nw_sphinx'), end: true }, { text: 'Not my fight.', end: true }],
        },
        thanks: { text: '"You stood up for a dead man\'s home island. Pops would have called you his kid for that, yoi. The clinic\'s always open to you — and so are my lessons."', onEnter: (c) => c.complete('nw_sphinx') },
      },
    }),
  },
  {
    id: 'nw_weevil', name: 'Edward Weevil', title: '"Whitebeard Jr.", Warlord of the Sea', island: 'sphinx', at: { spot: 'old_town_ruins' },
    level: 86, boss: true, hostile: true, hpMul: 1.4, faction: 'pirate', style: 'brawler', weapon: 'staff', scale: 1.5, bulk: 1.6, skill: 0.4,
    bounty: 480000000, infamy: true, breakthrough: 4, haki: { armament: 65 },
    look: { hair: 'short', hairColor: '#fdd835', skin: '#e0ac7e', top: '#fafafa', bottom: '#3e2723', coat: '#5d4037' },
    moves: ['nw_weevil_bisento', 'nw_weevil_sweep', 'nw_weevil_charge'],
    alert: 'Mama says Oyaji\'s treasure is mine! Get out of my way!', barks: ['Mama!', 'Oyaji\'s inheritance!', 'I\'m the strongest son!'],
    phases: [{ at: 0.5, run: hakiOn() }, { at: 0.3, run: buffPhase({ id: 'nw_weevil_rage', name: 'Tantrum', dur: 60, mods: { damage: 1.35, atkSpeed: 1.15 } }, 'MAMAAA!', '#ff5252') }],
    when: (c, g) => stageIs(g, 'nw_sphinx', 'weevil'),
  },
  {
    id: 'nw_stussy', name: 'Buckingham Stussy', title: 'Weevil\'s mother', island: 'sphinx', at: { spot: 'old_town_ruins', ox: 4 },
    level: 30, ai: 'idle', look: { hair: 'bun', hairColor: '#eceff1', skin: '#f1c9a0', top: '#6d4c41', bottom: '#3e2723', bulk: 1.2 },
    when: (c, g) => stageIs(g, 'nw_sphinx', 'weevil'),
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Outta the way, you! My Weevil is Whitebeard\'s real son — I should know! Newgate\'s fortune belongs to his flesh and blood, not to some bird doctor and a village of beggars!"' } } }),
  },

  // ======================================================================= ZOU
  {
    id: 'nw_wanda', name: 'Wanda', title: 'Kingsbird of the Mokomo Dukedom', island: 'zou', at: { town: 'kurau_city', plaza: true, ox: -3 },
    race: 'mink', level: 50, style: 'electro', skill: 0.5,
    look: { ears: 'pointy', fur: '#eceff1', skin: '#eceff1', hairColor: '#212121', hand: '#eceff1', tail: 'fluffy', muzzle: true, furFace: true, hair: 'long', top: '#ce93d8', bottom: '#6a1b9a' },
    marker: (c, g) => (stageIs(g, 'nw_zou_jack', 'wanda') ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => {
            if (done(ctx, 'nw_zou_jack')) return '"Garchu! You are a friend of the Minks now. On Zou, that means something. Try not to make the Duke and the Master fight over who gets to thank you."';
            if (active(ctx, 'nw_zou_jack', 'wanda')) return '"(A dog mink in battered armour lowers her sword.) A stranger... not one of Kaido\'s. Forgive me. For five days the Beasts Pirates attacked Zou looking for a man named Raizo. Jack the Drought gassed the whole city with poison. We never told him anything."';
            return '"Garchu! Welcome to the Mokomo Dukedom, on the back of Zunesha."';
          },
          choices: [
            { text: 'How can I help?', if: () => active(ctx, 'nw_zou_jack', 'wanda'), next: 'help' },
            { text: 'What does "Garchu" mean?', next: 'garchu' },
            { text: 'Goodbye, Wanda.', end: true },
          ],
        },
        help: {
          text: '"Jack left some of his Gifters behind. They are hunting survivors in the Whale Forest — their leader is Sheepshead. And Doctor Miyagi has run out of antidote for the gassed. If you are willing... Garchu."',
          choices: [{ text: 'I\'ll start with Sheepshead.', do: (c) => c.stage('nw_zou_jack', 'sheepshead'), end: true }],
        },
        garchu: { text: '"It is a Mink greeting! You press your cheek to a friend\'s cheek and pass a little Electro between you. It stings. That is how you know it is sincere. (She demonstrates. It stings.)"', next: 'a' },
      },
    }),
  },
  {
    id: 'nw_carrot', name: 'Carrot', title: 'Kingsbird of the Mokomo Dukedom', island: 'zou', at: { town: 'kurau_city', plaza: true, ox: 3 },
    race: 'mink', level: 44, style: 'electro',
    look: { ears: 'long', fur: '#fafafa', skin: '#fafafa', hairColor: '#fff59d', hand: '#fafafa', tail: 'fluffy', furFace: true, hair: 'short', top: '#ffb74d', bottom: '#ef6c00' },
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Garchu! You came all the way up Zunesha\'s legs? It takes ages! I want to go to sea someday and see the whole world. Everyone says I\'m too young. I\'m FIFTEEN!"' } } }),
  },
  {
    id: 'nw_miyagi', name: 'Doctor Miyagi', title: 'Physician of Kurau City', island: 'zou', at: { town: 'kurau_city', building: 'Kurau City Infirmary' },
    race: 'mink', level: 22,
    look: { ears: 'pointy', fur: '#d7ccc8', skin: '#d7ccc8', hairColor: '#eceff1', hand: '#d7ccc8', furFace: true, hair: 'bald', top: '#fafafa', bottom: '#90a4ae', goggles: true },
    doctor: { line: '"Hold still — you\'re not a gas victim, are you? No? Then this will be quick."' },
    marker: (c, g) => (stageIs(g, 'nw_zou_jack', 'antidote') ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (active(ctx, 'nw_zou_jack', 'antidote')
            ? '"Koro gas... Caesar Clown\'s poison. Jack used it on all of us. The strongest are recovering, but the children and the elderly need antidote, and I have none left. Three doses would save a whole ward."'
            : '"Welcome to the infirmary. Zou has had a hard month — but Minks are tough. We heal."'),
          choices: [
            { text: 'Here are three Antidotes.', if: () => active(ctx, 'nw_zou_jack', 'antidote') && ctx.has('antidote', 3), next: 'give' },
            { text: 'Treat me.', do: (c) => c.open('doctor', {}) },
            { text: 'Goodbye.', end: true },
          ],
        },
        give: {
          text: '"(He grabs them with trembling hands.) Bless you! ...(A roar shakes the whole city. The ground itself — Zunesha — groans.) That voice... Jack! He came back to finish us! He\'s at the Front Gate!"',
          onEnter: (c) => { c.take('antidote', 3); c.stage('nw_zou_jack', 'jack'); },
        },
      },
    }),
  },
  {
    id: 'nw_inuarashi', name: 'Duke Inuarashi', title: '"Ruler of Day" of the Mokomo Dukedom', island: 'zou', at: { town: 'kurau_city', building: "Duke Inuarashi's Hall" }, trainer: 'zou_minks',
    race: 'mink', level: 84, style: 'electro', weapon: 'sword', haki: { armament: 65, observation: 60 },
    look: { ears: 'pointy', fur: '#fafafa', skin: '#fafafa', hairColor: '#fafafa', hand: '#fafafa', tail: 'fluffy', muzzle: true, furFace: true, hair: 'long', top: '#1565c0', bottom: '#0d47a1', swords: 1 },
    marker: (c, g) => ((stageIs(g, 'nw_zou_jack', 'report') || (stageIs(g, 'nw_zou_poneglyph', 'blessings') && !c.flags.nw_blessDay)) && !isNight(g) ? '?' : g.quests.isDone('nw_zou_jack') && !g.quests.state('nw_zou_poneglyph') && !isNight(g) ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (isNight(ctx.game)
            ? '"(The Duke is asleep. By law, the Ruler of Day sleeps from six in the evening. Wanda glares at you from the doorway.) Come back in the morning."'
            : done(ctx, 'nw_zou_jack') ? '"Garchu, friend of Zou. I am Inuarashi, Duke of the Mokomo Dukedom. I owe you the lives of my people."' : '"(A great white dog mink, bandaged from head to paw.) I am Inuarashi. Forgive my state — Jack\'s gas nearly finished me. If you can help Wanda, the Dukedom will remember it."'),
          choices: [
            { text: 'Wait for dawn.', if: () => isNight(ctx.game), do: (c) => { if (c.game.env.clock >= 18) c.game.env.day += 1; c.game.env.clock = 6.5; c.log('You doze in the Mokomo Inn until Zunesha\'s back turns gold with morning.', '#b0bec5'); }, next: 'a' },
            { text: 'Jack the Drought is beaten.', if: () => !isNight(ctx.game) && active(ctx, 'nw_zou_jack', 'report'), next: 'report' },
            { text: 'I seek the stone in the Whale.', if: () => !isNight(ctx.game) && done(ctx, 'nw_zou_jack') && !started(ctx, 'nw_zou_poneglyph'), next: 'stone' },
            { text: 'Give me your blessing, Duke.', if: () => !isNight(ctx.game) && active(ctx, 'nw_zou_poneglyph', 'blessings') && !ctx.flag('nw_blessDay'), next: 'bless' },
            { text: 'Train with the Musketeers.', if: () => !isNight(ctx.game), do: (c) => c.open('trainer', { trainer: 'zou_minks' }) },
            { text: 'Leave.', end: true },
          ],
        },
        report: { text: '"Zunesha itself crushed Jack\'s fleet as he fled — you did the rest. The Mokomo Dukedom will not forget. You are a friend of the Minks, now and forever. Garchu!"', onEnter: (c) => c.complete('nw_zou_jack') },
        stone: {
          text: '"The Road Poneglyph. The Minks guard it for the Kouzuki clan of Wano — no outsider may see it without the word of BOTH rulers. And Nekomamushi and I... have not spoken in twenty years. You will have to ask him yourself. At night."',
          choices: [{ text: 'Then I\'ll earn both your trust.', do: (c) => c.startQuest('nw_zou_poneglyph'), next: 'bless' }],
        },
        bless: {
          text: '"You saved my people. That is enough for me. You have the blessing of the Ruler of Day." (Inuarashi presses his cheek to yours. Garchu. It stings.)',
          onEnter: (c) => { c.setFlag('nw_blessDay'); if (c.flag('nw_blessNight')) c.setFlag('nw_zouTrust'); },
        },
      },
    }),
  },
  {
    id: 'nw_nekomamushi', name: 'Master Nekomamushi', title: '"Ruler of Night", Guardians of the Whale Forest', island: 'zou', at: { spot: 'the_whale' }, trainer: 'zou_minks',
    race: 'mink', level: 84, style: 'electro', haki: { armament: 65, observation: 60 }, bulk: 1.4,
    look: { ears: 'pointy', fur: '#f4a460', skin: '#f4a460', hairColor: '#ff8a65', hand: '#f4a460', tail: 'thin', furFace: true, hair: 'curly', top: '#5d4037', bottom: '#3e2723' },
    marker: (c, g) => ((stageIs(g, 'nw_zou_jack', 'report') || (stageIs(g, 'nw_zou_poneglyph', 'blessings') && !c.flags.nw_blessNight)) && isNight(g) ? '?' : g.quests.isDone('nw_zou_jack') && !g.quests.state('nw_zou_poneglyph') && isNight(g) ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (!isNight(ctx.game)
            ? '"(The Master of the Whale Forest is curled up in the roots of the Whale, snoring. The Ruler of Night sleeps until six in the evening.) Zzz... goronyanya... zzz..."'
            : '"GORONYANYA! I am Nekomamushi, Ruler of Night! You look like someone who fights well. Hmph — anyone Wanda vouches for is welcome in the Whale Forest."'),
          choices: [
            { text: 'Wait for nightfall.', if: () => !isNight(ctx.game), do: (c) => { c.game.env.clock = 18.5; c.log('You sit among the Guardians until the sun goes down behind Zunesha\'s head.', '#b0bec5'); }, next: 'a' },
            { text: 'Jack the Drought is beaten.', if: () => isNight(ctx.game) && active(ctx, 'nw_zou_jack', 'report'), next: 'report' },
            { text: 'I seek the stone in the Whale.', if: () => isNight(ctx.game) && done(ctx, 'nw_zou_jack') && !started(ctx, 'nw_zou_poneglyph'), next: 'stone' },
            { text: 'Give me your blessing, Master.', if: () => isNight(ctx.game) && active(ctx, 'nw_zou_poneglyph', 'blessings') && !ctx.flag('nw_blessNight'), next: 'bless' },
            { text: 'Train with the Guardians.', if: () => isNight(ctx.game), do: (c) => c.open('trainer', { trainer: 'zou_minks' }) },
            { text: 'Leave.', end: true },
          ],
        },
        report: { text: '"GORONYANYA! Jack is beaten?! Then I will throw a feast for three days! Friend of the Minks — the Whale Forest is yours to walk!"', onEnter: (c) => c.complete('nw_zou_jack') },
        stone: {
          text: '"The stone is for the friends of the Kouzuki clan... and for friends of Zou. The Pirate King himself once came to see it with my word. But that dog Inuarashi must agree too. Ask him by daylight. Goronyanya."',
          choices: [{ text: 'Then I\'ll earn both your trust.', do: (c) => c.startQuest('nw_zou_poneglyph'), next: 'bless' }],
        },
        bless: {
          text: '"You bled for Zou. That is trust enough for the Ruler of Night! GORONYANYA!" (Nekomamushi presses his cheek to yours with far too much Electro.)',
          onEnter: (c) => { c.setFlag('nw_blessNight'); if (c.flag('nw_blessDay')) c.setFlag('nw_zouTrust'); },
        },
      },
    }),
  },
  {
    id: 'nw_pedro', name: 'Pedro', title: '"Pedro of the Treetops", captain of the Guardians', island: 'zou', at: { spot: 'whale_forest' },
    race: 'mink', level: 76, style: 'electro', weapon: 'sword', ai: 'idle', haki: { observation: 60 },
    look: { ears: 'round', fur: '#e1b12c', skin: '#e1b12c', hairColor: '#e1b12c', hand: '#e1b12c', tail: 'thin', furFace: true, hair: 'short', top: '#3e2723', bottom: '#212121', scarEye: true, swords: 1 },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (done(ctx, 'nw_zou_poneglyph')
        ? '"You have seen the stone. Few outsiders ever have. Remember: its words are only one quarter of the road. The other three lie with an Emperor, with the Kaido who burned Wano, and at the bottom of the sea."'
        : '"I lost an eye to Big Mom\'s soul, searching Totto Land for Poneglyphs. The Minks guard one of the four red stones — in the Whale behind me. Earn the trust of both our rulers, and you may see it."'),
    } } }),
  },
  {
    id: 'nw_raizo', name: 'Raizo', title: '"Raizo of the Mist", ninja of Wano', island: 'zou', at: { spot: 'zou_poneglyph', ox: 2 },
    level: 70, style: 'brawler', ai: 'idle',
    look: { hair: 'spiky', hairColor: '#212121', skin: '#e0ac7e', top: '#37474f', bottom: '#263238', bulk: 1.3, hat: 'headband', hatColor: '#212121' },
    when: (c, g) => g.quests.isDone('nw_zou_jack'),
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Nin-nin. Jack tortured the Minks for five days, and not one of them gave me up. I owe them my life... Kouzuki Oden-sama once stood before this very stone with the Pirate King. Treat it with respect, outsider."' } } }),
  },
  {
    id: 'nw_roddy', name: 'Roddy', title: 'Guardian of the Whale Forest', island: 'zou', at: { spot: 'whale_forest', ox: 3 },
    race: 'mink', level: 58, style: 'electro', skill: 0.45, moves: ['elec_garchu'], bulk: 1.3,
    look: { ears: 'round', fur: '#6d4c41', skin: '#6d4c41', hairColor: '#3e2723', hand: '#6d4c41', muzzle: true, furFace: true, hair: 'short', top: '#3e2723', bottom: '#212121', hat: 'horns', hatColor: '#eceff1' },
    recruit: { role: 'fighter', fighter: true, requires: (c, g) => g.quests.isDone('nw_zou_jack'), pitch: '"A Guardian protects what matters. Zou is safe now — and you look like you walk straight into trouble. Somebody has to guard YOU. Garchu!"' },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: {
      text: () => (done(ctx, 'nw_zou_jack') ? '"You fought like a Mink! The Guardians talk about nothing else."' : '"Grrr... Stranger, the Whale Forest is closed. The Beasts Pirates are still out there. Unless you mean to hunt them — then welcome."'),
    } } }),
  },
  {
    id: 'nw_sheepshead', name: 'Sheepshead', title: 'Shinuchi of the Beasts Pirates Gifters', island: 'zou', at: { spot: 'whale_forest', ox: -4 },
    level: 56, named: true, hostile: true, faction: 'pirate', style: 'brawler', bulk: 1.3, skill: 0.4,
    look: { hair: 'curly', hairColor: '#fafafa', skin: '#e0ac7e', top: '#212121', bottom: '#212121', hat: 'horns', hatColor: '#212121', goggles: true },
    moves: ['nw_sheep_ram', 'brawl_headbutt'], alert: 'More prey for the Beasts Pirates! Tell me where Raizo is!',
    when: (c, g) => stageIs(g, 'nw_zou_jack', 'sheepshead') && !c.defeated.nw_sheepshead,
  },
  {
    id: 'nw_jack', name: 'Jack', title: '"Jack the Drought", Beasts Pirates', island: 'zou', at: { spot: 'front_gate' },
    level: 84, boss: true, hostile: true, hpMul: 1.5, faction: 'pirate', style: 'brawler', weapon: 'sword', scale: 1.7, bulk: 1.7, skill: 0.4,
    bounty: 1000000000, infamy: true, breakthrough: 5, haki: { armament: 60 },
    look: { hair: 'long', hairColor: '#212121', skin: '#c68642', top: '#3e2723', bottom: '#212121', hat: 'horns', hatColor: '#eceff1' },
    moves: ['nw_jack_trunk', 'nw_jack_stomp', 'nw_jack_tusks'],
    alert: 'Where is Raizo? I\'ll sink this whole elephant to find him.', barks: ['Drought...', 'Kaido-san\'s orders.'],
    phases: [
      { at: 0.55, run: both(buffPhase({ id: 'nw_mammoth', name: 'Mammoth Form', dur: 90, mods: { scale: 1.35, damage: 1.3, defMul: 0.8 }, aura: 'rgba(121,85,72,0.5)' }, 'ZOU ZOU NO MI — MAMMOTH!', '#8d6e63'), hakiOn()) },
      { at: 0.2, run: (a, g) => { g.ui.banner('ZUNESHA', 'The elephant has heard', 'The whole island lurches. Somewhere below, Zunesha\'s trunk comes crashing down on Jack\'s fleet.', 4); g.fx.shake(1); a.hp -= Math.round(a.d.maxHp * 0.08); } },
    ],
    when: (c, g) => stageIs(g, 'nw_zou_jack', 'jack'),
  },
  {
    id: 'nw_bariete', name: 'Bariete', title: 'Gatekeeper of the Mokomo Dukedom', island: 'zou', at: { spot: 'front_gate', ox: 3 },
    race: 'mink', level: 40, style: 'electro',
    look: { ears: 'round', fur: '#8d6e63', skin: '#8d6e63', hairColor: '#5d4037', hand: '#8d6e63', tail: 'thin', furFace: true, hair: 'short', top: '#795548', bottom: '#4e342e' },
    when: (c, g) => !stageIs(g, 'nw_zou_jack', 'jack'),
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Garchu! You climbed all of Zunesha\'s leg?! Welcome to the Mokomo Dukedom! (The iron gate behind the monkey mink hangs off its hinges, ripped away by something enormous.) ...Don\'t mind the gate."' } } }),
  },

  // ======================================================== WHOLE CAKE ISLAND
  {
    id: 'nw_big_mom', name: 'Charlotte Linlin', title: '"Big Mom", Emperor of the Sea, Queen of Totto Land', island: 'whole_cake_island', at: { town: 'sweet_city', building: 'Whole Cake Chateau' },
    level: 110, boss: true, hpMul: 1.6, style: 'brawler', weapon: 'sword', scale: 2, bulk: 1.8, skill: 0.55,
    bounty: 4388000000, infamy: true, breakthrough: 6, haki: { armament: 90, observation: 70, conqueror: 85 },
    look: { hair: 'curly', hairColor: '#f06292', skin: '#f9dcc4', top: '#f48fb1', bottom: '#f8bbd0', coat: '#b71c1c', hat: 'tricorne', hatColor: '#212121', grin: true },
    moves: ['nw_soul_pocus', 'nw_heavenly_fire', 'nw_raitei', 'nw_ikoku'],
    alert: 'Mamamamama! You want to fight ME, at my own tea table?!', barks: ['Mamamamama!', 'LIFE OR TREATS?!', 'CROQUEMBOUCHE!'],
    phases: [
      { at: 1, run: both(hakiOn(), (a) => a.addBuff({ id: 'nw_iron_balloon', name: 'Iron Balloon Skin', dur: 9999, mods: { defMul: 0.85 } })) },
      { at: 0.5, run: both(hakiOn('Prometheus! Zeus! Napoleon!'), buffPhase({ id: 'nw_bm_rage', name: 'Mama\'s Rage', dur: 120, mods: { damage: 1.2, atkSpeed: 1.15 } })) },
      { at: 0.25, run: both(addMoves('nw_maser_ho'), shout('MASER HO!!', '#fff59d')) },
    ],
    when: (c) => !c.bosses.includes('nw_big_mom'),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (ctx.char.lives > 1
            ? '"MAMAMAMAMA! A guest at my table! Every race of the world sits together in Totto Land, and every one of them pays me a little of their life each month. Sit, sit! Have some cake. Now... LIFE, OR TREATS?"'
            : '"Mamamama... You look like you haven\'t got many years left to spare, little one. Sit and eat. Don\'t bore me."'),
          choices: [
            { text: 'Wager years of my life for a rubbing of your Road Poneglyph.', if: () => !done(ctx, 'nw_wci_poneglyph') && !started(ctx, 'nw_big_mom'), next: 'wager' },
            { text: 'I\'ve come to take you down, Big Mom.', if: () => !started(ctx, 'nw_big_mom'), next: 'fight' },
            { text: 'Treats! Definitely treats.', end: true },
          ],
        },
        wager: {
          text: '"MAMAMA! A gambler! I like gamblers. One roll of Mama\'s dice: win, and I\'ll let you copy my red stone — you\'ll never reach Laugh Tale anyway. Lose, and Soul Pocus takes ten years of your life. Well?"',
          choices: [
            { text: 'Roll the dice. (Risk a life)', if: () => ctx.char.lives > 1, do: (c) => (Math.random() < 0.45 + Math.min(0.2, (c.char.attrs.wil || 0) / 400) ? 'won' : 'lost') },
            { text: 'I don\'t have the years to spare.', end: true },
          ],
        },
        won: {
          text: '"(The dice clatter to a stop. The whole table goes silent.) ...MAMAMAMAMA! Fair is fair! Perospero, fetch paper and ink! Take your precious rubbing, and get off my island before I change my mind!"',
          onEnter: (c) => { if (!c.quest('nw_wci_poneglyph')) c.startQuest('nw_wci_poneglyph'); c.complete('nw_wci_poneglyph'); },
        },
        lost: {
          text: '"(The dice clatter to a stop. Big Mom\'s grin splits her face.) LIFE OR TREATS?! (Her hand passes through your chest and pulls out something warm. Ten years of your life flicker in her fingers, then vanish into her mouth.) Mamamama! Come back and try again, little one!"',
          onEnter: (c) => { c.char.lives = Math.max(1, (c.char.lives || 1) - 1); c.log('Soul Pocus: Big Mom took ten years of your lifespan (−1 life).', '#ff8a80'); c.save(); },
        },
        fight: {
          text: '"(The chateau goes quiet. Somewhere, a teacup breaks.) ...Mama... Mamama... MAMAMAMAMAMA! Children, don\'t interfere. Mama is going to play."',
          choices: [{ text: 'Fight the Emperor.', do: (c) => { c.startQuest('nw_big_mom'); provoke(c.game, 'nw_big_mom'); }, end: true }, { text: '...On second thought, treats.', end: true }],
        },
      },
    }),
  },
  {
    id: 'nw_bege', name: 'Capone "Gang" Bege', title: 'Captain of the Fire Tank Pirates', island: 'whole_cake_island', at: { town: 'fire_tank_hideout', building: 'Fire Tank Pirates Hideout' },
    level: 74, style: 'sniper', weapon: 'gun', ai: 'idle', bounty: 350000000,
    look: { hair: 'short', hairColor: '#212121', skin: '#f1c9a0', top: '#212121', bottom: '#212121', hat: 'cowboy', hatColor: '#212121' },
    marker: (c, g) => (stageIs(g, 'nw_tea_party', 'bege') ? '?' : g.quests.isDone('nw_tea_party') && !g.quests.state('nw_wci_poneglyph') ? '!' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nw_tea_party')
            ? '"(Bege lights a cigar.) Mama survived. Mama always survives. But you walked out of her tea party alive. In this business, that\'s a reference letter."'
            : '"(A small man in a pinstripe suit, surrounded by giant bodyguards.) Capone Bege. You cut through Cracker\'s biscuits? Then you\'re either useful or dead, and you don\'t look dead."'),
          choices: [
            { text: 'What\'s your plan?', if: () => active(ctx, 'nw_tea_party', 'bege'), next: 'plan' },
            { text: 'How do I get into the Room of Treasure?', if: () => !started(ctx, 'nw_wci_poneglyph'), next: 'treasure' },
            { text: 'Goodbye.', end: true },
          ],
        },
        plan: {
          text: '"The wedding tea party. Mama\'s one weakness is a photograph of Mother Carmel, the woman who raised her. Break that photo and she screams — a scream that drops half her own children. In that moment, my men put a bullet in an Emperor. You just need to be at the party. Here\'s your invitation."',
          choices: [{ text: 'I\'ll be there.', do: (c) => { c.give('nw_tea_invitation', 1); c.stage('nw_tea_party', 'party'); }, end: true }],
        },
        treasure: {
          text: '"Mama\'s Room of Treasure, behind the chateau — where she keeps her Road Poneglyph. Every mirror in Totto Land connects to Brûlée\'s Mirro-World. Grab Brûlée in the Seducing Woods and she\'ll walk you in. Or be stupid: gamble your lifespan at Mama\'s table. She loves that."',
          choices: [{ text: 'I\'ll find a way in.', do: (c) => c.startQuest('nw_wci_poneglyph'), end: true }, { text: 'Not yet.', end: true }],
        },
      },
    }),
  },
  {
    id: 'nw_brulee', name: 'Charlotte Brûlée', title: 'Mistress of the Mirro-World', island: 'whole_cake_island', at: { spot: 'brulee_house' },
    level: 55, style: 'brawler', skill: 0.3, named: true,
    look: { hair: 'long', hairColor: '#ce93d8', skin: '#f1c9a0', top: '#4a148c', bottom: '#311b92', nose: 'long', scarEye: true },
    moves: ['brawl_tackle'],
    when: (c) => !c.flags.nw_treasureAccess,
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: '"Wiwwiwwiwwi! A lost little lamb in the Seducing Woods! The trees will never let you out, dearie. Why not come inside Brûlée\'s house? The mirrors are... lovely this time of year."',
          choices: [
            { text: 'Grab her! (Fight Brûlée)', if: () => active(ctx, 'nw_wci_poneglyph', 'way_in'), do: (c) => provoke(c.game, 'nw_brulee'), end: true },
            { text: 'Back away slowly.', end: true },
          ],
        },
      },
    }),
  },
  {
    id: 'nw_cracker', name: 'Charlotte Cracker', title: '"Thousand Arms", Sweet Commander', island: 'whole_cake_island', at: { spot: 'seducing_woods' },
    level: 72, boss: true, hostile: true, hpMul: 1.4, faction: 'pirate', style: 'ittoryu', weapon: 'sword', scale: 1.3, bulk: 1.3, skill: 0.5,
    bounty: 860000000, infamy: true, breakthrough: 4, haki: { armament: 65 },
    look: { hair: 'long', hairColor: '#9c27b0', skin: '#f1c9a0', top: '#d7ccc8', bottom: '#8d6e63', swords: 1 },
    moves: ['nw_cracker_pretzel', 'nw_cracker_hard_biscuit', 'nw_cracker_roll'],
    alert: 'Nobody enters Totto Land without Mama\'s permission. My biscuit army will crush you!', barks: ['Biscuits never tire!', 'Pretzel!'],
    phases: [
      { at: 0.65, run: (a, g) => biscuitSoldiers(a, g, 2) },
      { at: 0.35, run: both((a, g) => biscuitSoldiers(a, g, 2), hakiOn('Hard Biscuit armour!')) },
    ],
    when: (c, g) => stageIs(g, 'nw_tea_party', 'cracker'),
  },
  {
    id: 'nw_smoothie', name: 'Charlotte Smoothie', title: 'Sweet Commander, Minister of Juice', island: 'whole_cake_island', at: { spot: 'room_of_treasure', ox: 4 },
    level: 76, boss: true, hostile: true, hpMul: 1.3, faction: 'pirate', style: 'ittoryu', weapon: 'sword', scale: 1.6, skill: 0.55,
    bounty: 932000000, infamy: true, breakthrough: 4, haki: { armament: 60 },
    look: { hair: 'long', hairColor: '#eceff1', skin: '#f1c9a0', top: '#e1f5fe', bottom: '#90a4ae', legs: 1.5, swords: 1 },
    moves: ['nw_smoothie_wring', 'nw_smoothie_juice'],
    alert: 'A thief in Mama\'s Room of Treasure. I\'ll wring you dry.', barks: ['Every drop.', 'Mama will want a drink of you.'],
    when: (c, g) => stageIs(g, 'nw_wci_poneglyph', 'rubbing'),
  },
  {
    id: 'nw_katakuri', name: 'Charlotte Katakuri', title: 'Sweet Commander, Minister of Flour', island: 'cacao_island', at: { spot: 'mirror_world' },
    level: 80, boss: true, hostile: true, hpMul: 1.5, faction: 'pirate', fruit: 'mochi', fruitMastery: 85, style: 'brawler', weapon: 'staff', scale: 1.6, bulk: 1.3, skill: 0.7,
    bounty: 1057000000, infamy: true, breakthrough: 5, haki: { armament: 80, observation: 90 },
    look: { hair: 'spiky', hairColor: '#880e4f', skin: '#f1c9a0', top: '#4a148c', bottom: '#311b92', coat: '#3e2723' },
    moves: ['mochi_tsuki', 'mochi_zangiri', 'mochi_chikara', 'nw_kata_mogura', 'nw_kata_jellybean', 'haki_futuresight'],
    alert: 'I saw you coming. I see what you will do next, too.', barks: ['I have already seen this.', 'Stop wasting my merienda.', 'Mogura!'],
    phases: [
      { at: 1, run: foresight },
      { at: 0.6, run: both(hakiOn('Buto Mochi...'), addMoves('nw_kata_buto_mochi')) },
      { at: 0.3, run: both(hakiOn(), buffPhase({ id: 'nw_kata_awaken', name: 'Awakened Mochi', dur: 90, mods: { damage: 1.25, atkSpeed: 1.2 }, aura: 'rgba(255,248,225,0.6)' }, 'Awakening.', '#fff8e1')) },
    ],
    when: (c, g) => stageIs(g, 'nw_tea_party', 'katakuri'),
  },
  {
    id: 'nw_pudding', name: 'Charlotte Pudding', title: 'Owner of Caramel, Chocolat Town', island: 'cacao_island', at: { town: 'chocolat_town', building: 'Caramel' },
    race: 'three_eye', level: 30,
    look: { hair: 'long', hairColor: '#795548', skin: '#f9dcc4', top: '#f8bbd0', bottom: '#f48fb1' },
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (done(ctx, 'nw_tea_party')
            ? '"(Pudding covers her forehead and blushes.) ...Someone told me my third eye was beautiful. Nobody ever said that before. Don\'t tell Mama."'
            : '"Welcome to Caramel! I\'m Pudding. I\'m getting married at the chateau soon — Mama arranged it with the Vinsmoke family. Isn\'t it wonderful? (Her smile is perfect. Too perfect.)"'),
          choices: [
            { text: 'Something sweet, please.', do: (c) => c.open('shop', { shop: 'nw_totto_sweets', building: { name: 'Caramel', role: 'cafe' } }) },
            { text: 'Can your third eye read Poneglyphs?', next: 'eye' },
            { text: 'Congratulations. Goodbye.', end: true },
          ],
        },
        eye: { text: '"(For a moment her face goes cold.) Mama says that when the Three-Eye Tribe\'s eye awakens, it can read the ancient script. Mine never did. It\'s just... an eye. People used to call me a monster for it. Would you like a chocolate?"', next: 'a' },
      },
    }),
  },
  {
    id: 'nw_chiffon', name: 'Charlotte Chiffon', title: 'Wife of Capone Bege', island: 'cacao_island', at: { town: 'chocolat_town', building: 'Sweets Factory' },
    level: 26, look: { hair: 'long', hairColor: '#f48fb1', skin: '#f9dcc4', top: '#fafafa', bottom: '#f8bbd0' },
    marker: (c, g) => (stageIs(g, 'nw_tea_party', 'report') ? '?' : null),
    dialogue: (ctx) => ({
      start: 'a',
      nodes: {
        a: {
          text: () => (active(ctx, 'nw_tea_party', 'report')
            ? '"You beat KATAKURI?! Nobody has ever... (Chiffon wipes flour off her face.) Then we can get out! Mama\'s hunger pang is coming — the cake is almost ready, and a full Mama is a calm Mama. Take some for the road!"'
            : done(ctx, 'nw_tea_party') ? '"My twin sister Lola ran from Mama\'s wedding and Mama took it out on me for years. Baking this cake felt like getting even. A little."' : '"I\'m Chiffon, Bege\'s wife. If you\'re looking for trouble in Totto Land, you\'ll find it. If you\'re looking for cake, you\'ve come to the right factory."'),
          choices: [
            { text: 'The way is clear.', if: () => active(ctx, 'nw_tea_party', 'report'), do: (c) => c.complete('nw_tea_party'), end: true },
            { text: 'Buy cake.', do: (c) => c.open('shop', { shop: 'nw_totto_sweets', building: { name: 'Sweets Factory', role: 'shop' } }) },
            { text: 'Goodbye.', end: true },
          ],
        },
      },
    }),
  },
];

// Cracker's Biscuit Soldiers (hollow warriors of biscuit).
function biscuitSoldiers(a, g, n) {
  g.fx.text(a.x, a.y - 2.4, 'Biscuit Soldiers!', '#d7ccc8', 0.5, { life: 1.4 });
  const list = g.spawner?.populated?.get('whole_cake_island');
  for (let k = 0; k < n; k++) {
    const p = g.spawner?.findFree(a.x + (k ? 2 : -2), a.y + 1.5, 4) || { x: a.x + (k ? 2 : -2), y: a.y + 1.5 };
    const e = makeEnemy('brute', 60, p.x, p.y, { name: 'Biscuit Soldier', faction: 'pirate', look: { top: '#d7ccc8', bottom: '#bcaaa4', skin: '#d7ccc8', hat: 'horns', hatColor: '#a1887f' }, hpMul: 0.7 });
    e.game = g;
    g.addActor(e);
    if (list) list.push(e);
    e.aggroPlayer = true;
  }
}

// ------------------------------------------------------------------ groups
const groups = [
  { island: 'fishman_island', spot: 'gyoncorde_plaza', radius: 8, enemies: [['fishman_thug', 48, { name: 'New Fish-Man Pirate' }], ['fishman_thug', 48, { name: 'New Fish-Man Pirate' }], ['fishman_thug', 50, { name: 'New Fish-Man Pirate' }]],
    when: (c, g) => stageIs(g, 'nw_fmi_coup', 'officers') || stageIs(g, 'nw_fmi_coup', 'hody') },
  { island: 'punk_hazard', spot: 'centaur_patrol', radius: 7, enemies: [['nw_centaur', 50], ['nw_centaur', 50], ['nw_centaur', 52]],
    when: (c, g) => stageIs(g, 'nw_punk_hazard', 'brownbeard') },
  { island: 'dressrosa', spot: 'palace_top', radius: 7, enemies: [['pirate', 60, { name: 'Donquixote Pirate' }], ['pirate_gunner', 60, { name: 'Donquixote Gunner' }], ['pirate', 62, { name: 'Donquixote Pirate' }]],
    when: (c, g) => stageIs(g, 'nw_birdcage', 'officers') || stageIs(g, 'nw_birdcage', 'doflamingo') },
  { island: 'zou', spot: 'front_gate', radius: 7, enemies: [['nw_gifter', 56], ['nw_gifter', 56], ['nw_gifter', 58]],
    when: (c, g) => stageIs(g, 'nw_zou_jack', 'jack') },
  { island: 'whole_cake_island', spot: 'room_of_treasure', radius: 6, enemies: [['nw_chess_soldier', 64], ['nw_chess_soldier', 64], ['nw_chess_soldier', 66]],
    when: (c, g) => stageIs(g, 'nw_wci_poneglyph', 'rubbing') },
  { island: 'whole_cake_island', spot: 'tea_party_garden', radius: 7, enemies: [['nw_chess_soldier', 64], ['pirate', 64, { name: 'Big Mom Pirate' }], ['pirate_gunner', 64, { name: 'Big Mom Gunner' }]],
    when: (c, g) => stageIs(g, 'nw_tea_party', 'escape') },
  { island: 'new_marineford', spot: 'hq_gate', radius: 8, enemies: [['marine_officer', 72, { name: 'HQ Officer' }], ['marine_officer', 72, { name: 'HQ Officer' }], ['marine_rifle', 68, { name: 'HQ Rifleman' }], ['marine_rifle', 68, { name: 'HQ Rifleman' }]],
    when: (c) => c.bounty > 0 && c.faction !== 'marine' },
];

// ------------------------------------------------------------------ quests
const OFFICERS_FMI = ['nw_dosun', 'nw_zeo', 'nw_daruma', 'nw_ikaros', 'nw_hyouzou'];
const OFFICERS_DOFFY = ['nw_pica', 'nw_trebol', 'nw_diamante', 'nw_senor_pink', 'nw_lao_g', 'nw_dellinger'];
const GLADIATORS = ['nw_bellamy', 'nw_ideo', 'nw_hajrudin', 'nw_chinjao'];

const quests = [
  // ---------------------------------------------------------- Fish-Man Island
  {
    id: 'nw_fmi_coup', name: 'The Fish-Man Island Coup', island: 'fishman_island', kind: 'story',
    summary: 'Hody Jones and the New Fish-Man Pirates plan to seize the Ryugu Kingdom.',
    stages: [
      { id: 'forest', desc: 'Queen Otohime\'s grave lies in the Sea Forest, south-west of Fish-Man Island. Find Prince Fukaboshi there.', goal: { type: 'reach', island: 'sea_forest' } },
      { id: 'truth', desc: 'Talk to Prince Fukaboshi at his mother\'s grave.' },
      { id: 'officers', desc: 'Hody\'s officers hold Gyoncorde Plaza. Defeat three of them: Dosun, Zeo, Daruma, Ikaros Much or Hyouzou.', goal: { type: 'defeat', any: OFFICERS_FMI, count: 3 },
        onStart: (ctx, g) => {
          OFFICERS_FMI.forEach((id, k) => spawnAt(g, id, 'fishman_island', 'gyoncorde_plaza', (k - 2) * 3, k % 2 ? 2 : -1));
          spawnMob(g, 'fishman_island', 'gyoncorde_plaza', [['fishman_thug', 48, { name: 'New Fish-Man Pirate' }], ['fishman_thug', 48, { name: 'New Fish-Man Pirate' }], ['fishman_thug', 50, { name: 'New Fish-Man Pirate' }]]);
        } },
      { id: 'hody', desc: 'Hody Jones swallows his Energy Steroids. Defeat him in Gyoncorde Plaza!', goal: { type: 'defeat', npc: 'nw_hody' },
        onStart: (ctx, g) => { fightAt(g, 'nw_hody', 'fishman_island', 'gyoncorde_plaza'); g.ui.banner('HODY JONES', 'Captain of the New Fish-Man Pirates', '"Humans are inferior beings. Today Fish-Man Island is reborn — in hatred!"', 4); } },
      { id: 'report', desc: 'Return to King Neptune at the Ryugu Palace.' },
    ],
    rewards: { berries: 200000, points: 2, items: [['new_world_log_pose', 1]], liberate: 'Ryugu Kingdom', flag: 'nw_fmiSaved' },
  },
  {
    id: 'nw_decken', name: 'The Flying Dutchman\'s Curse', island: 'fishman_island', kind: 'side',
    summary: 'For ten years Vander Decken IX has thrown axes at Princess Shirahoshi. His aim never misses.',
    stages: [
      { id: 'decken', desc: 'Vander Decken IX lurks on Coral Hill with his marked axes. Defeat him.', goal: { type: 'defeat', npc: 'nw_decken' },
        onStart: (ctx, g) => fightAt(g, 'nw_decken', 'fishman_island', 'coral_hill') },
      { id: 'report', desc: 'Tell Princess Shirahoshi in the Hard Shell Tower that she is safe.' },
    ],
    rewards: { berries: 120000, points: 1, items: [['pearl', 3]] },
  },
  {
    id: 'nw_otohime', name: 'Otohime\'s Signatures', island: 'fishman_island', kind: 'side',
    summary: 'Finish the late Queen Otohime\'s petition for Fish-Man Island to live on the surface.',
    stages: [
      { id: 'signatures', desc: 'Collect signatures from Madam Shyarly (Mermaid Café), Jinbe (Fish-Man Karate Dojo) and Den (Sea Forest).', goal: { type: 'flag', flag: 'nw_sigAll' } },
      { id: 'report', desc: 'Bring the signatures to King Neptune.' },
    ],
    rewards: { berries: 60000, points: 1, attrs: { wil: 1 }, flag: 'nw_otohimeDream' },
  },

  // ------------------------------------------------------------ Punk Hazard
  {
    id: 'nw_punk_hazard', name: 'Punk Hazard: The Poisoned Island', island: 'punk_hazard', kind: 'story',
    summary: 'A garbled SOS from a forbidden island of fire and ice: "It\'s cold... samurai... help..."',
    stages: [
      { id: 'sos', desc: 'Follow the distress call into Punk Hazard\'s frozen half.', goal: { type: 'reach', island: 'punk_hazard', spot: 'centaur_patrol', r: 12 } },
      { id: 'brownbeard', desc: 'Brownbeard\'s Centaur Patrol guards the snowfields. Defeat Brownbeard.', goal: { type: 'defeat', npc: 'nw_brownbeard' },
        onStart: (ctx, g) => { fightAt(g, 'nw_brownbeard', 'punk_hazard', 'centaur_patrol'); spawnMob(g, 'punk_hazard', 'centaur_patrol', [['nw_centaur', 50], ['nw_centaur', 50], ['nw_centaur', 52]]); } },
      { id: 'law', desc: 'A man in a spotted hat has been watching. Talk to Trafalgar Law at his camp in the frozen half.' },
      { id: 'children', desc: 'Find the kidnapped children in the Biscuits Room of Caesar\'s Laboratory.' },
      { id: 'monet', desc: 'Monet, Caesar\'s snow-winged secretary, guards the children. Defeat her — she is a Logia: use Haki or fire.', goal: { type: 'defeat', npc: 'nw_monet' },
        onStart: (ctx, g) => fightAt(g, 'nw_monet', 'punk_hazard', 'lab_gate') },
      { id: 'caesar', desc: 'Caesar Clown has released his gas! Defeat the "Master" in Research Building R-66 — Haki or fire will reach his gas body.', goal: { type: 'defeat', npc: 'nw_caesar' },
        onStart: (ctx, g) => { fightAt(g, 'nw_caesar', 'punk_hazard', 'lab_gate', 0, -4); spawnAt(g, 'nw_smiley', 'punk_hazard', 'sad_room', 5); g.ui.banner('CAESAR CLOWN', 'Master of Punk Hazard', '"Shurororo! You want the children? Then breathe in my masterpiece!"', 4); } },
      { id: 'vergo', desc: 'Vice Admiral Vergo of G-5 is Doflamingo\'s spy! Stop him in the SAD production room.', goal: { type: 'defeat', npc: 'nw_vergo' },
        onStart: (ctx, g) => { fightAt(g, 'nw_vergo', 'punk_hazard', 'sad_room'); g.ui.banner('"DEMON BAMBOO" VERGO', 'Donquixote Family', 'The Vice Admiral of G-5 has been working for Joker all along.', 4); } },
      { id: 'report', desc: 'Report to Trafalgar Law at his camp.' },
    ],
    rewards: { berries: 250000, points: 2, items: [['nw_bepo_vivre_card', 1]], flag: 'nw_punkHazardDone' },
  },

  // --------------------------------------------------------- Marine orders
  {
    id: 'nw_new_justice', name: 'Justice in the New World', island: 'new_marineford', kind: 'story',
    summary: 'Fleet Admiral Sakazuki\'s orders: bring down Caesar Clown and the Warlord Doflamingo.',
    stages: [
      { id: 'g5', desc: 'Report to Marine Base G-5 near the Red Line.', goal: { type: 'reach', island: 'g5_base' } },
      { id: 'caesar', desc: 'Bring down the fugitive scientist Caesar Clown on Punk Hazard.', goal: { type: 'flag', flag: 'nw_down_nw_caesar' } },
      { id: 'doflamingo', desc: 'Expose and defeat the Warlord Donquixote Doflamingo on Dressrosa.', goal: { type: 'flag', flag: 'nw_down_nw_doflamingo' } },
      { id: 'report', desc: 'Report to Fleet Admiral Sakazuki at New Marineford.' },
    ],
    rewards: { berries: 400000, points: 2, flag: 'nw_newJusticeDone' },
    onComplete: (ctx) => { const c = ctx.char; if (c && c.faction === 'marine') { c.merit = (c.merit || 0) + 2500; ctx.log('+2500 merit — commendation from the Fleet Admiral.', '#90caf9'); } },
  },

  // -------------------------------------------------- the first three needles
  {
    id: 'nw_urouge', name: 'The Mad Monk of Raijin', island: 'raijin_island', kind: 'side',
    summary: 'Urouge of the Fallen Monk Pirates wants to test his fate against yours under the lightning.',
    stages: [{ id: 'duel', desc: 'Defeat the Mad Monk Urouge on the Scorched Plain. Every blow you land makes him stronger — finish it fast.', goal: { type: 'defeat', npc: 'nw_urouge' } }],
    rewards: { berries: 80000, points: 1 },
  },
  {
    id: 'nw_hawkins', name: 'The Magician\'s Odds', island: 'risky_red_island', kind: 'side',
    summary: 'Basil Hawkins has read your death in his cards. Prove the odds wrong.',
    stages: [{ id: 'duel', desc: 'Defeat Basil Hawkins at his camp. His straw effigies take hits for him — watch for the Straw Man.', goal: { type: 'defeat', npc: 'nw_hawkins' } }],
    rewards: { berries: 120000, points: 1 },
  },

  // --------------------------------------------------------------- Dressrosa
  {
    id: 'nw_corrida', name: 'The Corrida Colosseum', island: 'dressrosa', kind: 'story',
    summary: 'A tournament in Acacia. The prize: the Mera Mera no Mi, Fire Fist Ace\'s Devil Fruit.',
    stages: [
      { id: 'block', desc: 'Win your block: defeat three gladiators outside the Corrida Colosseum (Bellamy, Ideo, Hajrudin or Don Chinjao).', goal: { type: 'defeat', any: GLADIATORS, count: 3 },
        onStart: (ctx, g) => { for (const id of GLADIATORS) provoke(g, id, 'rival'); g.ui.banner('BLOCK BATTLE ROYALE', 'Corrida Colosseum', '"The rules are simple: there are no rules!"', 4); } },
      { id: 'final', desc: 'The final bout: defeat Diamante, Hero of the Colosseum.', goal: { type: 'defeat', npc: 'nw_diamante' },
        onStart: (ctx, g) => { fightAt(g, 'nw_diamante', 'dressrosa', 'colosseum_arena'); g.ui.banner('THE FINAL', 'Corrida Colosseum', '"And now — the Hero of the Colosseum himself... DIAMANTEEEE!!"', 4); } },
      { id: 'prize', desc: 'Claim your prize from Gatz at the Corrida Colosseum.' },
    ],
    rewards: { berries: 250000, points: 2, flag: 'nw_corridaDone' },
    onComplete: (ctx, g) => {
      const c = ctx.char;
      c.flags.nw_corridaDone = true;
      if (g.spawner?.populated?.has('dressrosa')) spawnNow(g, 'nw_sabo');
      const taken = c.world?.fruitsTaken || [];
      if (!taken.includes('mera')) {
        c.world.fruitsTaken = [...taken, 'mera'];
        ctx.give('fruit_mera', 1);
      } else {
        ctx.give('jewels', 3);
        g.log('The Mera Mera no Mi\'s box is empty... In the chaos, a masked man in a top hat got to it first. The Colosseum pays you in jewels instead.', '#ffcc80');
      }
    },
  },
  {
    id: 'nw_sop', name: 'Operation SOP', island: 'dressrosa', kind: 'story',
    summary: 'The Tontatta dwarves and a one-legged toy soldier plan to break Sugar\'s curse over Dressrosa.',
    stages: [
      { id: 'green_bit', desc: 'Cross the iron bridge north of Dressrosa to Green Bit, home of the hidden Tontatta Kingdom.', goal: { type: 'reach', island: 'green_bit' } },
      { id: 'leo', desc: 'Speak with Leo of the Tonta Corps in the Tontatta Kingdom.' },
      { id: 'soldier', desc: 'Meet the one-legged Toy Soldier on Flower Hill in Dressrosa.' },
      { id: 'sugar', desc: 'Operation SOP — Sugar Ottamage Panic: knock out Sugar at the Toy House before her touch turns you into a toy!', goal: { type: 'defeat', npc: 'nw_sugar' },
        onStart: (ctx, g) => fightAt(g, 'nw_sugar', 'dressrosa', 'toy_house') },
      { id: 'factory', desc: 'The toys are people again! Now wreck the SMILE Factory entrance beneath the Corrida Colosseum.', goal: { type: 'reach', island: 'dressrosa', spot: 'smile_factory', r: 4 },
        onComplete: (ctx, g) => { g.fx?.shake?.(1); g.audio?.sfx('explosion'); g.ui.banner('THE SMILE FACTORY FALLS', 'Dressrosa', 'Five hundred dwarves pour out of the underground harbour, cheering. Somewhere on the King\'s Plateau, someone stops laughing.', 5); } },
      { id: 'report', desc: 'Return to Leo in the Tontatta Kingdom on Green Bit.' },
    ],
    rewards: { berries: 200000, points: 2, items: [['nw_healing_dandelion', 2]], liberate: 'Tontatta Kingdom', flag: 'nw_sopDone' },
    onComplete: (ctx, g) => { g.quests.start('nw_birdcage'); },
  },
  {
    id: 'nw_birdcage', name: 'The Birdcage', island: 'dressrosa', kind: 'story',
    summary: 'Unmasked, Doflamingo has trapped all of Dressrosa inside a cage of cutting strings.',
    stages: [
      { id: 'officers', desc: 'The Birdcage is closing! Defeat two of Doflamingo\'s executives (Pica, Trebol, Diamante, Señor Pink, Lao G, Dellinger).', goal: { type: 'defeat', any: OFFICERS_DOFFY, count: 2 },
        onStart: (ctx, g) => {
          g.ui.banner('BIRDCAGE', 'Donquixote Doflamingo', 'Strings rise from the palace and close over Dressrosa like a cage. Nobody gets out — and the cage is shrinking.', 6);
          despawn(g, 'nw_doflamingo_king');
          spawnMob(g, 'dressrosa', 'palace_top', [['pirate', 60, { name: 'Donquixote Pirate' }], ['pirate_gunner', 60, { name: 'Donquixote Gunner' }], ['pirate', 62, { name: 'Donquixote Pirate' }]]);
          spawnAt(g, 'nw_pica', 'dressrosa', 'palace_top', -6, 4); spawnAt(g, 'nw_trebol', 'dressrosa', 'toy_house', 4); spawnAt(g, 'nw_diamante', 'dressrosa', 'colosseum_arena');
          spawnAt(g, 'nw_senor_pink', 'dressrosa', 'birdcage_edge', -4); spawnAt(g, 'nw_lao_g', 'dressrosa', 'birdcage_edge', 4); spawnAt(g, 'nw_dellinger', 'dressrosa', 'birdcage_edge', 0, 4);
        } },
      { id: 'doflamingo', desc: 'Climb the King\'s Plateau and defeat Donquixote Doflamingo at the Royal Palace.', goal: { type: 'defeat', npc: 'nw_doflamingo' },
        onStart: (ctx, g) => { fightAt(g, 'nw_doflamingo', 'dressrosa', 'palace_top'); g.ui.banner('DONQUIXOTE DOFLAMINGO', '"Heavenly Yaksha"', '"Fufufufu! Justice will prevail? Of course it will. Whoever wins is justice!"', 5); } },
      { id: 'report', desc: 'Find the old gladiator "Ricky" in the Colosseum Tavern in Acacia.' },
    ],
    rewards: { berries: 600000, points: 3, liberate: 'Dressrosa', flag: 'nw_dressrosaFree' },
  },

  // ------------------------------------------------------------------ Sphinx
  {
    id: 'nw_sphinx', name: 'Whitebeard\'s Inheritance', island: 'sphinx', kind: 'side',
    summary: 'Edward Weevil and his mother are tearing up Whitebeard\'s home island for a fortune that doesn\'t exist.',
    stages: [
      { id: 'weevil', desc: 'Stop Edward Weevil at the ruins of the old town on Sphinx\'s shore.', goal: { type: 'defeat', npc: 'nw_weevil' },
        onStart: (ctx, g) => { fightAt(g, 'nw_weevil', 'sphinx', 'old_town_ruins'); spawnAt(g, 'nw_stussy', 'sphinx', 'old_town_ruins', 4); } },
      { id: 'report', desc: 'Return to Marco at his clinic in the hidden village.' },
    ],
    rewards: { berries: 250000, points: 2, flag: 'nw_sphinxSafe' },
  },

  // --------------------------------------------------------------------- Zou
  {
    id: 'nw_zou_jack', name: 'Jack the Drought', island: 'zou', kind: 'story',
    summary: 'Jack of the Beasts Pirates gassed the Minks of Zou searching for a ninja named Raizo.',
    stages: [
      { id: 'wanda', desc: 'Kurau City is in ruins. Find out what happened — talk to Wanda in the city square.' },
      { id: 'sheepshead', desc: 'Beasts Pirates stragglers are hunting minks in the Whale Forest. Defeat their leader, Sheepshead.', goal: { type: 'defeat', npc: 'nw_sheepshead' },
        onStart: (ctx, g) => fightAt(g, 'nw_sheepshead', 'zou', 'whale_forest', -4) },
      { id: 'antidote', desc: 'Bring 3 Antidotes to Doctor Miyagi at the Kurau City Infirmary for the gassed minks.' },
      { id: 'jack', desc: 'Jack the Drought has come back to finish Zou! Stop him at the Front Gate.', goal: { type: 'defeat', npc: 'nw_jack' },
        onStart: (ctx, g) => { fightAt(g, 'nw_jack', 'zou', 'front_gate'); spawnMob(g, 'zou', 'front_gate', [['nw_gifter', 56], ['nw_gifter', 56], ['nw_gifter', 58]]); despawn(g, 'nw_bariete'); g.ui.banner('JACK THE DROUGHT', 'Beasts Pirates — ฿1,000,000,000', '"I\'ll kill the elephant itself if I have to."', 5); } },
      { id: 'report', desc: 'Report to the rulers: Duke Inuarashi (by day, in his hall) or Master Nekomamushi (by night, in the Whale).' },
    ],
    rewards: { berries: 300000, points: 2, liberate: 'Kurau City', flag: 'nw_zouSaved' },
  },
  {
    id: 'nw_zou_poneglyph', name: 'The Minks\' Trust', island: 'zou', kind: 'story',
    summary: 'The Minks guard a Road Poneglyph in the Whale for the Kouzuki clan. Only friends of both rulers may see it.',
    stages: [
      { id: 'blessings', desc: 'Earn the blessing of both rulers: Duke Inuarashi (by day, in Kurau City) and Master Nekomamushi (by night, in the Whale).', goal: { type: 'flag', flag: 'nw_zouTrust' } },
      { id: 'rubbing', desc: 'Enter the secret room in the Whale\'s tail and take a rubbing of the red Road Poneglyph.', goal: { type: 'event', event: 'nw_rub_road_zou' } },
    ],
    rewards: { items: [['poneglyph_rubbing', 1]], points: 1, attrs: { wil: 1 }, flag: 'nw_rubbingZou' },
  },

  // ------------------------------------------------------------- Totto Land
  {
    id: 'nw_tea_party', name: 'Big Mom\'s Tea Party', island: 'whole_cake_island', kind: 'story',
    summary: 'A wedding tea party at the Whole Cake Chateau — and a plot to kill an Emperor in the middle of it.',
    stages: [
      { id: 'woods', desc: 'Cross the Seducing Woods in the south-west of Whole Cake Island toward Sweet City.', goal: { type: 'reach', island: 'whole_cake_island', spot: 'seducing_woods', r: 10 } },
      { id: 'cracker', desc: 'Charlotte Cracker, the Biscuit Knight, blocks the path. Break through his biscuit army!', goal: { type: 'defeat', npc: 'nw_cracker' },
        onStart: (ctx, g) => { fightAt(g, 'nw_cracker', 'whole_cake_island', 'seducing_woods'); g.ui.banner('CHARLOTTE CRACKER', 'Sweet Commander — ฿860,000,000', 'An army of biscuit knights marches out of the trees.', 4); } },
      { id: 'bege', desc: 'Meet Capone "Gang" Bege at the Fire Tank Pirates\' hideout on the north-west coast.' },
      { id: 'party', desc: 'Attend Big Mom\'s tea party in the gardens behind the Whole Cake Chateau.', goal: { type: 'reach', island: 'whole_cake_island', spot: 'tea_party_garden', r: 6 },
        onComplete: (ctx, g) => { mamaScream(g); spawnMob(g, 'whole_cake_island', 'tea_party_garden', [['nw_chess_soldier', 64], ['pirate', 64, { name: 'Big Mom Pirate' }], ['pirate_gunner', 64, { name: 'Big Mom Gunner' }]]); } },
      { id: 'escape', desc: 'Mama\'s scream shattered the party! Escape to Cacao Island, south-west of Whole Cake Island.', goal: { type: 'reach', island: 'cacao_island' } },
      { id: 'katakuri', desc: 'Charlotte Katakuri was waiting in the Mirro-World by the great mirror. Defeat the strongest Sweet Commander.', goal: { type: 'defeat', npc: 'nw_katakuri' },
        onStart: (ctx, g) => { fightAt(g, 'nw_katakuri', 'cacao_island', 'mirror_world'); g.ui.banner('CHARLOTTE KATAKURI', 'Sweet Commander — ฿1,057,000,000', '"I have already seen how this ends."', 5); } },
      { id: 'report', desc: 'Tell Chiffon at the Sweets Factory in Chocolat Town that the way is clear.' },
    ],
    rewards: { berries: 800000, points: 3, items: [['nw_chiffon_cake', 3]], flag: 'nw_teaPartyDone' },
  },
  {
    id: 'nw_wci_poneglyph', name: 'The Room of Treasure', island: 'whole_cake_island', kind: 'story',
    summary: 'Big Mom keeps a Road Poneglyph in her Room of Treasure behind the Whole Cake Chateau.',
    stages: [
      { id: 'way_in', desc: 'Find a way into the Room of Treasure: capture Brûlée at her house in the Seducing Woods (Mirro-World), or win Big Mom\'s "Life or Treats" wager in the chateau.', goal: { type: 'flag', flag: 'nw_treasureAccess' } },
      { id: 'rubbing', desc: 'Step out of Brûlée\'s mirror into the Room of Treasure behind the chateau and take a rubbing of the Road Poneglyph.', goal: { type: 'event', event: 'nw_rub_road_wci' },
        onStart: (ctx, g) => { g.ui.banner('THE MIRRO-WORLD', 'Totto Land', 'Brûlée\'s mirror spits you out behind the Whole Cake Chateau. Guards everywhere — and a red stone.', 4); spawnAt(g, 'nw_smoothie', 'whole_cake_island', 'room_of_treasure', 4); spawnMob(g, 'whole_cake_island', 'room_of_treasure', [['nw_chess_soldier', 64], ['nw_chess_soldier', 64], ['nw_chess_soldier', 66]]); } },
    ],
    rewards: { items: [['poneglyph_rubbing', 1]], points: 1, flag: 'nw_rubbingWci' },
  },
  {
    id: 'nw_big_mom', name: 'Life or Treats', island: 'whole_cake_island', kind: 'side',
    summary: 'You challenged an Emperor at her own tea table.',
    stages: [{ id: 'fight', desc: 'Defeat Big Mom. Nobody ever has.', goal: { type: 'defeat', npc: 'nw_big_mom' } }],
    rewards: { berries: 2000000, points: 4, flag: 'nw_bigMomDown' },
  },
];

// The tea party goes wrong: Mother Carmel's photograph breaks and Big Mom screams.
function mamaScream(g) {
  const p = g.player;
  g.ui.banner('MAMA\'S SCREAM', 'Whole Cake Chateau', 'A portrait of Mother Carmel shatters on the floor. Big Mom\'s scream flattens the garden — her own children fall clutching their ears. RUN!', 6);
  g.fx?.shake?.(1.2);
  g.audio?.sfx('explosion');
  if (p) { p.stagger?.(1.4); p.hp = Math.max(1, Math.round(p.hp - (p.d?.maxHp || 100) * 0.15)); }
}

// ------------------------------------------------------------------ install
function install(game) {
  const char = () => game.state?.char;

  // Arriving at an arc island starts its story.
  game.on('enterIsland', (isl) => {
    const c = char();
    if (!c || !isl) return;
    if (isl.id === 'punk_hazard' && !game.quests.state('nw_punk_hazard')) {
      game.quests.start('nw_punk_hazard');
      game.ui.banner('PUNK HAZARD', 'Forbidden Government island', 'Fire on one side, ice on the other. The Den Den Mushi crackles: "It\'s cold... samurai... they\'re killing us..."', 6);
    }
    if (isl.id === 'zou' && !game.quests.state('nw_zou_jack')) {
      game.quests.start('nw_zou_jack');
      game.ui.banner('ZOU', 'The Mokomo Dukedom', 'You climb the elephant\'s leg for hours. At the top: a city of Minks in ruins, and the smell of poison gas.', 6);
    }
    if ((isl.id === 'whole_cake_island' || isl.id === 'cacao_island') && !game.quests.state('nw_tea_party')) {
      game.quests.start('nw_tea_party');
      game.ui.banner('TOTTO LAND', 'Big Mom\'s nation', 'Every building is made of sweets. Everyone is invited to the Queen\'s wedding tea party. Everyone.', 6);
    }
  });

  // Rising from Fish-Man Island: the New World Log Pose points to three islands.
  game.on('leaveZone', (id) => {
    const c = char();
    if (id !== 'fishman_island' || !c) return;
    if (!count(c, 'log_pose') && !count(c, 'new_world_log_pose')) return;
    const opts = ['raijin_island', 'risky_red_island', 'mystoria_island'];
    const fresh = opts.filter((o) => !c.discovered?.includes(o));
    c.logPose.target = (fresh.length ? fresh : opts)[Math.floor(Math.random() * (fresh.length || opts.length))];
    c.logPose.last = 'fishman_island';
    c.logPose.eternal = null;
    game.ui.toast('THE NEW WORLD', 'Three needles tremble: Raijin, Risky Red, Mystoria. One shakes hard.', '#81d4fa');
  });

  // Knockouts: remember who fell (for cross-quest goals) and script the fallout.
  game.on('knockout', (a, att) => {
    const c = char();
    if (!c || !a?.npcId || !a.npcId.startsWith('nw_')) return;
    if (att && (att.isPlayer || att.faction === 'player')) c.flags['nw_down_' + a.npcId] = true;
    if (a.npcId === 'nw_sugar') {
      c.flags.nw_toysFreed = true;
      untoyAll(game);
      despawn(game, 'nw_toy_soldier');
      spawnAt(game, 'nw_kyros', 'dressrosa', 'flower_hill');
      game.ui.banner('THE CURSE BREAKS', 'Operation SOP', 'All over Dressrosa, toys become people again — and everyone suddenly remembers the husbands, daughters and friends they had forgotten.', 6);
    }
    if (a.npcId === 'nw_brulee' && game.quests.stageId('nw_wci_poneglyph') === 'way_in') {
      c.flags.nw_treasureAccess = true;
      game.log('Brûlée, pinned: "Wiww— fine! FINE! I\'ll open a mirror to the chateau! Just let go!"', '#ce93d8');
    }
    if (a.npcId === 'nw_smiley') {
      game.log('Smiley bursts — and becomes a rolling cloud of Shinokuni gas! Get clear!', '#b39ddb');
      game.addZone?.({ owner: null, x: a.x, y: a.y, r: 3.5, t: 5, interval: 0.6, damage: 12, element: 'poison', status: { poison: 3 }, color: '#9575cd', kind: 'field' });
    }
    if (a.npcId === 'nw_doflamingo') game.ui.banner('THE BIRDCAGE FALLS', 'Dressrosa', 'The strings go slack and drift down over the city like snow. Dressrosa is free.', 6);
    if (a.npcId === 'nw_big_mom' && att?.isPlayer) game.ui.banner('AN EMPEROR FALLS', 'Totto Land', 'Charlotte Linlin, Big Mom, lies in the frosting. The whole New World will hear of this by morning.', 7);
  });

  // Road Poneglyph rubbings: use the stone (or stand at it) during the quest stage.
  const rub = (poneglyph) => {
    const qid = poneglyph === 'road_zou' ? 'nw_zou_poneglyph' : poneglyph === 'road_wci' ? 'nw_wci_poneglyph' : null;
    if (!qid || game.quests.stageId(qid) !== 'rubbing') return;
    game.log('You press paper against the red stone and rub it with ink until every character of the ancient script is copied.', '#ffcc80');
    game.emit('questEvent', 'nw_rub_' + poneglyph);
  };
  game.on('useObject', (o) => { if (o?.kind === 'poneglyph' && o.poneglyph) rub(o.poneglyph); });
  game.on('poneglyphRead', (id) => rub(id));

  // Periodic effects: Raijin lightning, the Birdcage, Zou's eruption rain, rubbing fallback.
  let boltT = 4, cageT = 3, rainDay = -1, rainHalf = -1, rubT = 1;
  game.on('tick', (dt) => {
    const c = char(), p = game.player;
    if (!c || !p || game.paused) return;
    const isl = game.currentIsland;
    if (game.world !== game.surface || !isl) return;
    // Raijin Island: lightning falls like rain (Kasa's umbrella turns it aside)
    if (isl.id === 'raijin_island' && (boltT -= dt) <= 0) {
      boltT = 3 + Math.random() * 4;
      const safe = count(c, 'nw_raijin_umbrella') > 0;
      const ang = Math.random() * Math.PI * 2, d = safe ? 3 + Math.random() * 4 : Math.random() * 3.5;
      const x = game.world.wx(p.x + Math.cos(ang) * d), y = p.y + Math.sin(ang) * d;
      game.fx.telegraph?.(x, y, 'circle', { r: 1.4, life: 0.9, color: 'rgba(255,241,118,1)' });
      setTimeout(() => {
        if (game.currentIsland?.id !== 'raijin_island' || !game.player) return;
        game.fx.bolt?.(x, y - 10, x, y, '#fff176', 0.3, 0.12);
        game.fx.ring?.(x, y, 0.2, 1.6, '#fff176', 0.3, 0.2);
        game.env.lightning = Math.max(game.env.lightning || 0, 0.6);
        game.audio?.sfx('thunder_small');
        const pl = game.player;
        if (pl.state === 'idle' && game.world.distance(pl.x, pl.y, x, y) < 1.5) {
          pl.takeDamage(Math.round(pl.d.maxHp * 0.12), null, { element: 'lightning' }, game);
          pl.addStatus('shock', 1.2);
          game.hint('raijin', 'Raijin Island\'s lightning never stops. Kasa, the old woman in the hamlet, sells umbrellas that turn the bolts aside.');
        }
      }, 900);
    }
    // Dressrosa: the Birdcage cuts anyone near its edge while it stands
    if (isl.id === 'dressrosa' && (game.quests.stageId('nw_birdcage') === 'officers' || game.quests.stageId('nw_birdcage') === 'doflamingo') && (cageT -= dt) <= 0) {
      cageT = 3;
      const hw = isl.def.w / 2, hh = isl.def.h / 2;
      const rx = game.world.dx(isl.x, p.x) / hw, ry = (p.y - isl.y) / hh;
      if (rx * rx + ry * ry > 0.72 && p.state === 'idle') {
        p.takeDamage(Math.round(p.d.maxHp * 0.06), null, { element: 'string', slashing: true }, game);
        game.fx.text(p.x, p.y - 1.8, 'BIRDCAGE', '#f48fb1', 0.4);
        game.hint('birdcage', 'The Birdcage\'s strings cut anything near the edge of Dressrosa. Head inland — to the King\'s Plateau.');
      }
    }
    // Zou: twice a day Zunesha sprays sea water over its back
    if (isl.id === 'zou') {
      const half = game.env.clock >= 12 ? 1 : 0;
      if ((game.env.day !== rainDay || half !== rainHalf) && Math.abs(game.env.clock % 12 - 7) < 0.05) {
        rainDay = game.env.day; rainHalf = half;
        game.ui.banner('ERUPTION RAIN', 'Zou', 'Zunesha raises its trunk and a flood of sea water crashes down over its back. Minks everywhere dive for shelter — fish rain from the sky.', 4);
        game.env.storm = Math.max(game.env.storm || 0, 0.6);
      }
    }
    // Rubbing fallback: standing right at the stone during the stage also works
    if ((rubT -= dt) <= 0) {
      rubT = 0.5;
      if (isl.id === 'zou' && game.quests.stageId('nw_zou_poneglyph') === 'rubbing') {
        const s = isl.spots?.zou_poneglyph;
        if (s && game.world.distance(p.x, p.y, s.x, s.y) < 1.6) rub('road_zou');
      }
      if (isl.id === 'whole_cake_island' && game.quests.stageId('nw_wci_poneglyph') === 'rubbing') {
        const s = isl.spots?.room_of_treasure;
        if (s && game.world.distance(p.x, p.y, s.x, s.y) < 1.6) rub('road_wci');
      }
    }
  });

  // Townsfolk: tiny Tontatta dwarves on Green Bit, fish-men and merfolk under the sea.
  game.spawner.addBuilder((ctx) => {
    const id = ctx.island?.id;
    if (id !== 'green_bit' && id !== 'fishman_island') return;
    const prev = ctx.onTownsfolk;
    ctx.onTownsfolk = (a, town) => {
      if (prev) prev(a, town);
      if (id === 'green_bit') {
        a.look = { ...a.look, scale: 0.34, tail: 'fluffy', nose: 'long' };
      } else if (Math.random() < 0.8) {
        a.look = makeLook('fishman', Math.floor(Math.random() * 1e9), { top: a.look.top, bottom: a.look.bottom });
        a.race = 'fishman';
      }
    };
  });

  game.on('questDone', (id) => { if (id === 'nw_wci_poneglyph' || id === 'nw_zou_poneglyph') persist(game); });
}

export default {
  id: 'newWorld',
  npcs, groups, quests, items, trainers, stock, archetypes, abilities, install,
  dynamicIds: [],
};
