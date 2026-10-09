// The active moveset: what you have out — your fists, a weapon drawn, your
// Devil Fruit (or one of its forms, or its awakened set) — the skills it puts
// on the skill keys, slot by slot, its M1 chain and heavy blow, and what it
// opens up next; and the Haki group, shown (with keys of its own) while a
// Haki is active.
//
// Slots are positional: skill N of whatever is out is on the Nth skill key
// (keys.js). A style's techniques keep their places whether learned or not (a
// locked one says what opens it), so a key always means the same move of that
// style; a fruit's base set is all yours on eating, and a form or the
// awakened set puts its own moves in the same places (Pistol, Jet Pistol,
// Gigant Pistol, Kong Gun, Dawn Pistol: all on the first key).
//
// Pure: reads the actor (and its character record), changes nothing. Taking a
// moveset out is entries.js; using a skill is the player controller's.
import { STYLES } from '../data/styles.js';
import { FRUITS, AWAKEN_MASTERY, fruitTechMastery } from '../data/fruits.js';
import { HAKI, HAKI_ABILITIES } from '../data/haki.js';
import { TRAINERS } from '../data/trainers.js';
import { getAbility } from './abilities.js';
import { keysOf, keyLabel } from './keys.js';
import { ENTRY } from './hotbar.js';

/** Techniques taken in the air (Space again) rather than on a key: Geppo, Sky Walk — and every power of flight. */
const AIR = new Set(['roku_geppo', 'bleg_skywalk']);
export const isAirSkill = (d) => !!d && (!!d.flight || AIR.has(d.id));

/** The buff that's a form of your fruit just now (Gear Second... or the awakened set: form 'awake'), or null. */
export const formBuff = (p) => (p?.buffs || []).find((b) => b.form) || null;
/** Is your fruit's awakened set out just now? */
export const awakenedOn = (p) => !!(p?.buffs || []).some((b) => b.form === 'awake');

/** Which moveset is out: 'weapon' (drawn), 'fruit' (taken out from the hotbar), or 'fists'. */
export function movesetKind(p) {
  if (p?.drawn && p.weapon) return 'weapon';
  if (p?.fruitOut && p.fruit && FRUITS[p.fruit]) return 'fruit';
  return 'fists';
}

/** Who teaches a technique, for a locked line ("Koshiro, Mihawk"). */
function teachers(id) {
  const names = [];
  for (const t of Object.values(TRAINERS)) if ((t.teaches || []).includes(id) && !names.includes(t.name)) names.push(t.name);
  return names;
}
const hakiName = (type) => HAKI[type]?.name.replace(' Haki', '') || type;
/** Haki mentioned only once one has woken (until then the game keeps quiet about it). */
const hakiKnown = (p) => !!(p?.hakiSkill && (p.hakiSkill.armament || p.hakiSkill.observation || p.hakiSkill.conqueror));
/** Why a technique you have can't be used on its own terms (a Haki it needs), or ''. */
function needs(p, d) {
  if (d?.requiresHaki && !(p.hakiLevel?.(d.requiresHaki) > 0)) return hakiKnown(p) ? `needs ${hakiName(d.requiresHaki)} Haki` : 'needs a power yet to awaken';
  return '';
}

/**
 * The moveset out just now:
 *   { kind, entry, title, sub, color, form (the form's spec, or null), formId,
 *     skills: [{ id, def, locked, why }] (slot order), air: [{ id, def }],
 *     m1: the M1's infusion (fruit) or null, heavy: a technique id or null
 *     (null: the style's own), forms: [{ id, name, entry, open, why }],
 *     next: [{ name, why }] }
 */
export function movesetOf(p) {
  const kind = movesetKind(p);
  const c = p?.char || {};
  const known = new Set(p?.techniques || c.techniques || []);
  const out = { kind, entry: ENTRY.fists, title: '', sub: '', color: '#ffe082', form: null, formId: null, skills: [], air: [], m1: null, heavy: null, forms: [], next: [] };
  if (kind === 'fruit') {
    const f = FRUITS[p.fruit];
    const fb = formBuff(p);
    const form = fb ? (fb.form === 'awake' ? f.awakening : f.forms.find((F) => F.id === fb.form) || null) : null;
    const m = p.fruitMastery || 0;
    out.form = form;
    out.formId = form ? fb.form : null;
    out.entry = !form ? ENTRY.fruit : fb.form === 'awake' ? ENTRY.awake : ENTRY.form(fb.form);
    out.title = form ? form.name : f.en.replace(/,.*$/, '');
    out.sub = `${f.name} · mastery ${Math.floor(m)}`;
    out.color = f.color;
    const base = f.techniques.filter((t) => !t.flight).map((t) => t.id);
    const list = form?.skills || base;
    // (a form's own skills are all there with it; the fruit's own open as its mastery grows)
    const thr = (id) => (form ? 0 : fruitTechMastery(f, f.techniques.find((t) => t.id === id)));
    out.skills = list.map((id) => getAbility(id)).filter(Boolean).map((d) => {
      const locked = !known.has(d.id) && m < thr(d.id);
      return { id: d.id, def: d, locked, why: locked ? `fruit mastery ${thr(d.id)} · fight with it` : needs(p, d) };
    });
    out.air = f.techniques.filter((t) => t.flight).map((t) => ({ id: t.id, def: getAbility(t.id) }));
    out.m1 = { source: 'fruit:' + p.fruit, fruit: p.fruit, ...(f.m1 || {}), ...(form?.m1 || {}) };
    out.heavy = form ? form.heavy || null : f.heavy || null;
    // the forms (on the hotbar once open), and the awakening
    for (const F of f.forms || []) {
      const lack = F.needs && !(p.hakiLevel?.(F.needs) > 0);
      const why = m < F.mastery ? `fruit mastery ${F.mastery}${F.needs ? ` · ${hakiKnown(p) ? hakiName(F.needs) + ' Haki' : 'and a power yet to awaken'}` : ''}` : lack ? `needs ${hakiKnown(p) ? hakiName(F.needs) + ' Haki' : 'a power yet to awaken'}` : '';
      out.forms.push({ id: F.id, name: F.name, short: F.short || F.name, entry: ENTRY.form(F.id), open: m >= F.mastery, why, on: fb?.form === F.id, activate: F.activate });
    }
    const aw = f.awakening;
    if (aw) {
      const ready = !!c.fruitAwakened;
      out.forms.push({ id: 'awake', name: aw.name, short: aw.short || aw.name, entry: ENTRY.awake, open: ready, awakening: true, on: fb?.form === 'awake', activate: aw.activate,
        why: ready ? '' : m < AWAKEN_MASTERY ? `awakening: fruit mastery ${AWAKEN_MASTERY}, then a moment in battle` : 'awakening: ready — a hard fight will bring it out' });
    }
    out.next = out.forms.filter((F) => !F.open).slice(0, 1).map((F) => ({ name: F.name, why: F.why }));
    return out;
  }
  const st = STYLES[p?.style] || STYLES.brawler;
  out.title = kind === 'weapon' ? (st.weapon ? st.name : 'Weapon') : 'Fists';
  out.sub = kind === 'weapon' ? weaponLine(p, c) : st.name;
  out.entry = kind === 'weapon' ? 'item:' + ((c.equipped?.weapons || [])[0] || '') : ENTRY.fists;
  // (a weapon swung with its plainest moves, its style never learned: no techniques of its own yet)
  const learnedStyle = p?.masteries?.[p.style] !== undefined;
  const mast = Math.floor(p?.masteries?.[p.style] || 0);
  if (learnedStyle) out.sub += ` · mastery ${mast}`;
  for (const t of st.techniques || []) {
    const d = getAbility(t.id);
    if (!d) continue;
    const have = known.has(t.id);
    if (AIR.has(t.id)) { if (have) out.air.push({ id: t.id, def: d }); continue; }
    let why = '';
    if (!have) {
      // (a style's techniques come with fighting in it: each opens at its mastery)
      const L = t.learn || {};
      const at = `mastery ${L.mastery || 0}`;
      why = L.innate ? 'born to it' : L.special === 'full_moon' ? `${at} · under a full moon` : `${at} · fight with ${st.name}`;
      if (!learnedStyle) why = st.swords ? `carry ${st.swords} sword${st.swords > 1 ? 's' : ''}` : `learn ${st.name} from a teacher`;
    } else why = needs(p, d);
    out.skills.push({ id: t.id, def: d, locked: !have, why });
  }
  if (kind === 'weapon' && !learnedStyle && st.techniques?.length) out.next.push({ name: st.name, why: 'a teacher teaches the style: its techniques open as you fight with it' });
  return out;
}

function weaponLine(p, c) {
  const w = p.weapon;
  if (!w) return '';
  return w.kind === 'sword' ? (w.count > 1 ? `${w.count} swords` : 'a sword') : w.kind === 'axe' ? 'an axe' : `a ${w.kind}`;
}

/**
 * The Haki group: shown while Armament or Observation is on — and always for a
 * king, whose Conqueror's needs no switching on. { title, color, rows: [{ id,
 * def, locked, why, slot }] } (slot: which Haki key, -1 for a locked row), or
 * null. Conqueror's release first (a king's G, as ever), then the active
 * Haki's techniques, then Conqueror's Infusion.
 */
export function hakiGroupOf(p) {
  if (!p) return null;
  const lvl = (t) => p.hakiLevel?.(t) || 0;
  const known = new Set(p.techniques || []);
  const king = lvl('conqueror') > 0;
  const active = p.armament ? 'armament' : p.observation ? 'observation' : null;
  if (!king && !active) return null;
  const rows = [];
  if (king) rows.push({ id: 'haki_conqueror', def: getAbility('haki_conqueror'), locked: false, why: '' });
  const lockedWhy = (d) => {
    const who = teachers(d.id);
    return `${hakiName(d.learn?.haki || d.hakiType)} ${d.learn?.level || 0}${who.length ? ' · ' + who[0] : ''}`;
  };
  for (const d of HAKI_ABILITIES) {
    if (d.hakiType !== active || d.id === 'haki_conqueror') continue;
    const have = known.has(d.id);
    rows.push({ id: d.id, def: getAbility(d.id) || d, locked: !have, why: have ? '' : lockedWhy(d) });
  }
  if (king) {
    const d = getAbility('haki_infusion');
    if (d) rows.push({ id: d.id, def: d, locked: !known.has(d.id), why: known.has(d.id) ? '' : lockedWhy(d) });
  }
  // (the keys go to what you can use, in order; what's still to learn waits below without one)
  let n = 0;
  for (const r of rows) r.slot = r.locked ? -1 : n++;
  rows.sort((a, b) => (a.slot < 0) - (b.slot < 0) || a.slot - b.slot);
  const type = active || 'conqueror';
  return { title: HAKI[type].name, color: type === 'conqueror' ? '#ef5350' : type === 'armament' ? '#b39ddb' : '#ce93d8', active, rows };
}

/** The keys for a moveset's slots and the Haki group's, from the settings. */
export const skillKeys = (settings) => keysOf(settings);

/**
 * What your M1 and heavy are with what's out: null for your fists or a weapon
 * (the style's own, as ever); with the fruit out, its infusion of your fists'
 * chain (`m1`) and its heavy (or a form's) — your fists' heavy standing in
 * while that cools down.
 */
export function attackSpec(p) {
  if (movesetKind(p) !== 'fruit') return null;
  // (in the sea or held by Seastone the power is gone: plain fists)
  if (p.inWater || p.seastoned) return null;
  const ms = movesetOf(p);
  return { m1: ms.m1, heavy: ms.heavy };
}

/** A technique of your fists' chain (or heavy) with the fruit's power in it: its element, its status, its reach. */
export function infuse(def, m) {
  if (!def || !m) return def;
  const steps = (def.steps || []).map((s) => (s.hit ? {
    ...s,
    hit: { ...s.hit, element: m.element || s.hit.element, status: m.status || s.hit.status, damage: (s.hit.damage || 5) * (m.dmg || 1), range: (s.hit.range || 1.4) * (m.reach || 1) },
  } : s));
  return { ...def, steps, source: m.source || def.source, fruit: m.fruit || def.fruit, infused: true };
}

/**
 * Where a technique sits, in words (for telling you once it's yours): its
 * place in its style's moveset — the key, and when that's out — or the Haki
 * keys, or Space in the air.
 */
export function skillHome(id, settings) {
  const d = getAbility(id);
  if (!d) return '';
  const K = keysOf(settings);
  if (d.hakiType) return d.id === 'haki_conqueror' ? `on ${keyLabel(K.haki[0])}` : `on the Haki keys while ${HAKI[d.hakiType]?.name || 'its Haki'} is on`;
  if (AIR.has(id) || d.flight) return 'on Space, in the air';
  const f = FRUITS[d.fruit];
  if (f) {
    // (its place in the base set, a form's or the awakened set — and the heavy on the right button)
    const sets = [[`the ${f.name}`, f.techniques.filter((t) => !t.flight).map((t) => t.id)], ...(f.forms || []).map((F) => [F.name, F.skills || []]), [`the awakened set`, f.awakening?.skills || []]];
    for (const [nm, list] of sets) {
      const i = list.indexOf(id);
      if (i >= 0) return `${K.skills[i] ? `on ${keyLabel(K.skills[i])}` : `skill ${i + 1}, with no key yet`} with ${nm} out`;
    }
    if ([f.heavy, ...(f.forms || []).map((F) => F.heavy), f.awakening?.heavy].includes(id)) return 'the heavy blow (right mouse button) with it out';
    return 'in Skills (Tab)';
  }
  const st = STYLES[d.style];
  if (!st) return 'in Skills (Tab)';
  const i = (st.techniques || []).filter((t) => !AIR.has(t.id)).findIndex((t) => t.id === id);
  if (i < 0) return 'in Skills (Tab)';
  const key = K.skills[i];
  const when = st.weapon ? `with your ${st.weapon === 'sword' ? 'sword' : st.weapon} drawn` : 'with your fists up';
  return `${key ? `on ${keyLabel(key)}` : `skill ${i + 1}, with no key yet (Settings, Controls)`} ${when}`;
}
