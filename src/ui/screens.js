// Title (three lineage slots), character creation (birth roll → identity),
// death and Inherited Will screens.
import { h, clear, add } from './dom.js';
import { RACES, RARITY, makeLook, raceLabel, MINK_KINDS, FISHMAN_KINDS } from '../data/races.js';
import { outfitOf } from '../render3d/chars/body.js';
import { EYES_M, EYES_F, EYE_NAMES, eyeShapeOf } from '../render3d/chars/face.js';
import { headParams, FACE_SHAPES, CHINS, NOSES } from '../render3d/chars/build.js';
import { FRAME, FRAMES_M, FRAMES_F, FRAME_NAMES, frameId } from '../render3d/chars/bones.js';
import { LEGENDS } from '../data/dreams.js';
import { TRAITS, PERKS, perkLevel, perkCost, rollBirth, dChance, nameWithD } from '../game/lineage.js';
import { ITEMS } from '../data/items.js';
import { FRUITS } from '../data/fruits.js';
import { formatBerries } from '../core/math.js';
import { RNG } from '../core/rng.js';
import { itemImg, uiImg } from './icon.js';
import { createPreview, renderPortrait } from './preview3d.js';

/** What each race's height looks like (height isn't customisable: it's in the blood). */
const HEIGHT_NOTE = {
  human: 'Humans stand at an ordinary height.',
  buccaneer: 'Buccaneers stand head and shoulders above everyone.',
  longarm: 'Longarms are ordinary in height, with an extra joint in each arm.',
  longleg: 'Longlegs tower on their long legs.',
  fishman: 'Fish-Men are tall and broad.',
  mink: 'Minks are about as tall as humans.',
  skypiean: 'Skypieans are human-sized, with small wings.',
  three_eye: 'The Three-Eye Tribe are human-sized.',
  lunarian: 'Lunarians are tall, with black wings.',
};

/** Keep the parts of a look that follow from others in step (build → bulk, kinds → colours). */
function applyLook(L, race) {
  const base = race === 'buccaneer' ? 1.25 : race === 'fishman' ? 1.1 : 1;
  L.bulk = +(base * (0.84 + (L.build ?? 0.5) * 0.36)).toFixed(3);
  if (race === 'mink') { const k = MINK_KINDS.find((m) => m.name === L.kind); if (k) Object.assign(L, { ears: k.ears, fur: k.fur, tail: k.tail, muzzle: k.muzzle, skin: k.fur, hairColor: k.fur, hand: k.fur }); }
  if (race === 'fishman') { const k = FISHMAN_KINDS.find((m) => m.name === L.kind); if (k) L.skin = k.skin; }
}

const SEA_NAMES = { east_blue: 'East Blue', north_blue: 'North Blue', west_blue: 'West Blue', south_blue: 'South Blue' };
const pct = (x) => `${Math.round(x * 1000) / 10}%`;

/** A small still portrait of a character look (rendered with the 3D model). */
export function portrait(look, w = 96, hgt = 110, bg = null) {
  const cv = h('canvas.portrait', { width: w * 2, height: hgt * 2, style: { width: w + 'px', height: hgt + 'px' } });
  const g = cv.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w * 2, hgt * 2); }
  if (look) {
    const img = renderPortrait(look, { w, h: hgt, view: w < 64 ? 'bust' : 'full' });
    if (img) g.drawImage(img, 0, 0, w * 2, hgt * 2);
  }
  return cv;
}

// ---------------------------------------------------------------- title
export function titleScreen(ui, { slots, onPlay, onNew, onDelete, onHall, onWill, onHelp, onSettings }) {
  const cards = slots.map((s) => slotCard(s, { onPlay, onNew, onDelete, onHall, onWill }));
  const el = h('div.screen.title-screen',
    h('div.title',
      h('h1', 'Inherited Will'),
      h('h2', 'A One Piece Roguelike'),
      h('div.slots', cards),
      h('div.title-links',
        h('button.btn', { on: { click: onHelp } }, uiImg('help', 18), 'How to Play'),
        h('button.btn', { on: { click: onSettings } }, uiImg('settings', 18), 'Settings')),
    ),
    h('div.foot', 'Unofficial fan game. ONE PIECE © Eiichiro Oda / Shueisha / Toei Animation. All art in this game is procedurally drawn.'),
  );
  ui.showScreen(el);
}

function slotCard(info, { onPlay, onNew, onDelete, onHall, onWill }) {
  const { slot, char, legacy } = info;
  const head = h('div.slot-head', h('span', `Lineage ${slot}`),
    !info.empty ? h('button.link', { title: 'Delete this lineage for good', on: { click: () => onDelete(slot) } }, 'Delete') : null);
  if (info.empty) {
    return h('div.slot-card.empty', head,
      h('div.slot-empty', h('div.big', 'Empty'), h('p', 'A new bloodline, waiting to be born.')),
      h('div.slot-actions', h('button.btn.red', { on: { click: () => onNew(slot) } }, 'Begin a Lineage')));
  }
  const gen = legacy?.generation || char?.generation || 1;
  const will = legacy?.will || 0;
  const meta = h('div.slot-meta',
    h('span', `Generation ${gen}`),
    h('span', { title: 'Inherited Will — spend it on your bloodline' }, uiImg('reputation', 14), ` ${will} Will`));
  if (char) {
    const race = RACES[char.race];
    const faction = char.faction === 'marine' ? `Marine ${char.marineRank || 'Recruit'}` : char.crewName ? `Captain of the ${char.crewName}` : char.faction === 'pirate' ? 'Pirate' : 'Wanderer';
    const saved = char.lastSaved ? new Date(char.lastSaved) : null;
    return h('div.slot-card', head,
      h('div.slot-body',
        portrait(char.look, 84, 96),
        h('div.slot-info',
          h('div.nm', char.name),
          h('div.sub', `${race?.name || char.race} · ${faction}`),
          h('div.sub', `Day ${char.world?.day || 1} · ${char.lives}/${char.maxLives} lives${char.bounty ? ' · ' + formatBerries(char.bounty) : ''}`),
          saved ? h('div.sub.faint', `Saved ${saved.toLocaleDateString()} ${saved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`) : null)),
      meta,
      h('div.slot-actions',
        h('button.btn.gold', { on: { click: () => onPlay(slot) } }, 'Continue'),
        h('button.btn', { on: { click: () => onWill(slot) } }, 'Will'),
        h('button.btn', { on: { click: () => onHall(slot) } }, `Hall (${legacy?.hall?.length || 0})`),
        h('button.btn.red.small', { title: 'Abandon this character and start a new one in this lineage', on: { click: () => onNew(slot) } }, 'Abandon')));
  }
  const last = legacy?.hall?.[0];
  return h('div.slot-card', head,
    h('div.slot-body',
      last ? portrait(last.look, 84, 96) : null,
      h('div.slot-info',
        h('div.nm', last ? `${last.name}` : 'The next generation'),
        h('div.sub', last ? `Fell on day ${last.days}. Their will lives on.` : 'Ready to be born.'))),
    meta,
    h('div.slot-actions',
      h('button.btn.red', { on: { click: () => onNew(slot) } }, `Begin Generation ${gen}`),
      h('button.btn', { on: { click: () => onWill(slot) } }, 'Will'),
      h('button.btn', { on: { click: () => onHall(slot) } }, `Hall (${legacy?.hall?.length || 0})`)));
}

// --------------------------------------------------------------- creation
export function creationScreen(ui, legacy, { onDone, onBack }) {
  let rerolls = perkLevel(legacy, 'reroll');
  let birth = rollBirth(legacy, Math.floor(Math.random() * 1e9));
  if (ui.game?.debugBirth) birth = { ...birth, ...ui.game.debugBirth }; // test harness only
  const state = { name: '', look: null };
  const root = h('div.screen');
  ui.showScreen(root);
  let raf = 0;
  let timers = [];
  let previewCleanup = null;
  const stopAnim = () => { cancelAnimationFrame(raf); for (const t of timers) clearTimeout(t); timers = []; previewCleanup?.(); previewCleanup = null; };
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const hasD = () => birth.traits.includes('will_of_d');

  // ---- step 1: the roll
  function stepRoll(spin = true) {
    stopAnim();
    clear(root);
    state.look = null;
    const race = RACES[birth.race];
    const rar = RARITY[race.rarity];
    const shown = birth.traits.filter((t) => TRAITS[t] && !TRAITS[t].hidden && t !== 'will_of_d');
    const nameEl = h('div.race', { style: { color: rar.color } }, '???');
    const rarEl = h('div.rarity', { style: { color: rar.color } }, '');
    const dEl = h('div.d-reveal');
    const info = h('div.roll-info', { style: { opacity: 0 } },
      h('p', { style: { maxWidth: '560px', margin: '6px auto' } }, race.desc),
      h('p', h('b', 'Birthplace: '), race.origin, ' ', h('span.tag', race.spawnSeas.map((s) => SEA_NAMES[s]).join(' / '))),
      h('div.roll-cols',
        h('div', h('h3', 'Racial traits'), ...race.traits.map((t) => h('div.li', t))),
        h('div', h('h3', 'Born with'),
          ...shown.map((t) => h('div.li', h('b', TRAITS[t].name + ': '), TRAITS[t].desc)),
          h('div.li.muted', `${Math.min(5, race.lives + perkLevel(legacy, 'lives'))} lives (vivre cards)`))),
    );
    const btns = h('div.roll-btns', { style: { opacity: 0 } },
      h('button.btn.gold', { on: { click: stepIdentity } }, 'Accept my fate'),
      rerolls > 0 ? h('button.btn', { on: { click: () => { rerolls--; birth = rollBirth(legacy, Math.floor(Math.random() * 1e9)); stepRoll(true); } } }, `Flip Fate's Coin (${rerolls} left)`) : null,
      h('button.btn', { on: { click: () => { stopAnim(); onBack(); } } }, 'Back'));
    const willLine = h('div.will-line', uiImg('reputation', 16), ` Your lineage's Inherited Will: ${legacy.will}` + (legacy.generation > 1 ? ` · generation ${legacy.generation}` : ''));
    const panel = h('div.panel.race-roll', h('h2', legacy.generation > 1 ? `Generation ${legacy.generation} is born…` : 'A child is born…'), nameEl, rarEl, dEl, info, btns, willLine);
    root.appendChild(panel);
    const ids = Object.keys(RACES);
    const t0 = performance.now();
    const dur = spin ? 1800 : 0;
    const reveal = () => {
      nameEl.textContent = race.name;
      nameEl.style.color = rar.color;
      rarEl.textContent = rar.label.toUpperCase();
      info.style.opacity = 1;
      ui.game?.audio?.sfx(race.rarity === 'legendary' || race.rarity === 'epic' ? 'fanfare' : 'reveal');
      // the D.: a second, separate roll of fate
      clear(dEl);
      const chance = dChance(legacy);
      if (hasD()) {
        dEl.append(h('div.d-stamp', 'D.'), h('div.d-title', 'THE WILL OF D.'),
          h('p', 'A hidden initial runs in your blood. Those who carry it laugh in the face of death — and the powers of the world fear the name. (', pct(chance), ' of births)'));
        dEl.classList.remove('miss');
        dEl.classList.add('hit');
        later(spin ? 900 : 0, () => { dEl.classList.add('show'); ui.game?.audio?.sfx('fanfare'); btns.style.opacity = 1; });
      } else {
        dEl.append(h('p.muted', `No "D." in your name this time — only ${pct(chance)} of births carry the Will of D.`));
        dEl.classList.add('miss', 'show');
        btns.style.opacity = 1;
      }
    };
    const tick = (now) => {
      // (a frame's timestamp can be slightly earlier than t0)
      const k = Math.max(0, (now - t0) / Math.max(1, dur));
      if (k < 1) {
        const i = Math.floor(Math.pow(k, 0.5) * 40) % ids.length;
        nameEl.textContent = RACES[ids[i]].name;
        nameEl.style.color = RARITY[RACES[ids[i]].rarity].color;
        raf = requestAnimationFrame(tick);
      } else reveal();
    };
    raf = requestAnimationFrame(tick);
  }

  // ---- step 2: identity & looks
  function stepIdentity() {
    stopAnim();
    clear(root);
    if (!state.look) { state.look = makeLook(birth.race, birth.seed); state.look.build = 0.5; }
    if (!state.name) state.name = randomCharName();
    const L = state.look;
    const race = birth.race;
    const finalName = h('div.final-name');
    const updateName = () => {
      clear(finalName);
      const n = (state.name || '').trim() || 'Nameless';
      finalName.append(h('span.muted', 'You will be known as '), h('b', hasD() ? nameWithD(n) : n));
    };
    const nameInput = h('input.name', { value: state.name, maxLength: 24, spellcheck: false, on: { input: (e) => { state.name = e.target.value; updateName(); } } });
    updateName();
    const row = (label, ...kids) => h('div.opt-row', h('div.opt-label', label), ...kids);
    const swatch = (key, colors) => h('div.swatches', ...colors.map((c) => h('button' + (L[key] === c ? '.on' : ''), { title: c, style: { background: c }, on: { click: () => { L[key] = c; changed(); } } })));
    const chips = (current, values, labels, set) => h('div.swatches', ...values.map((v, i) => h('button.chip' + (current === v ? '.on' : ''), { on: { click: () => { set(v); changed(); } } }, labels ? labels[i] : v)));
    const opts = (key, values, labels) => chips(L[key], values, labels, (v) => { L[key] = v; });

    // the live 3D preview (drag to turn)
    const previewBox = h('div.preview3d');
    const left = h('div', previewBox,
      h('p.muted', { style: { textAlign: 'center', margin: '6px 0 0' } }, raceLabel(L)),
      h('p.muted', { style: { textAlign: 'center', margin: '2px 0 0', fontSize: '12px' } }, HEIGHT_NOTE[race] || 'Your height comes from your race.'));
    const tabsEl = h('div.tabs.look-tabs');
    const optsEl = h('div.look-opts');
    const genderEl = h('div');
    const renderGender = () => {
      clear(genderEl);
      genderEl.appendChild(row('You are', chips(L.fem ? 'f' : 'm', ['m', 'f'], ['Male', 'Female'], (v) => setGender(v === 'f'))));
    };
    const setGender = (fem) => {
      L.fem = fem;
      // clothes and eyes that only suit the other build are swapped for ones that suit this one
      if (!fem && ['dress', 'crop', 'bikini'].includes(L.topStyle)) L.topStyle = 'tee';
      if (!fem && ['skirt', 'longskirt'].includes(L.bottomStyle)) L.bottomStyle = 'trousers';
      if (L.eyeShape !== 'fish') L.eyeShape = eyeShapeOf({ ...L, eyeShape: L.eyeShape });
      if (fem && L.bust === undefined) L.bust = 1;
      renderGender();
    };
    renderGender();
    const right = h('div',
      row('Name', h('div', { style: { display: 'flex', gap: '6px' } }, nameInput, h('button.btn', { on: { click: () => { state.name = randomCharName(); nameInput.value = state.name; updateName(); } } }, 'Random'))),
      finalName, genderEl, tabsEl, optsEl,
      h('p.muted', { style: { marginTop: '12px' } }, 'No destiny is chosen for you. Pirate, Marine, adventurer, bounty hunter or none of these — the sea is free, and what you become is up to you. You can found your own pirate crew and raise your Jolly Roger later, from the Crew menu.'),
    );
    const born = RACES[birth.race];
    const panel = h('div.panel.wide', h('h2', 'Who are you?'), h('div.creation-grid', left, right),
      h('div.creation-foot',
        h('div.muted', `${raceLabel(L)} · born in ${born.spawnSeas.length > 1 ? 'one of the four Blues' : 'the ' + SEA_NAMES[born.spawnSeas[0]]}`),
        h('div', { style: { display: 'flex', gap: '10px' } },
          h('button.btn', { on: { click: () => stepRoll(false) } }, 'Back'),
          h('button.btn.red.big', { on: { click: () => { stopAnim(); onDone(birth, { name: (state.name || '').trim() || 'Nameless', look: state.look }); } } }, 'Set Sail'))));
    root.appendChild(panel);
    applyLook(L, race);
    let preview = null;
    try { preview = createPreview(previewBox, L, { game: ui.game }); } catch (e) { console.warn('3D preview unavailable', e); }
    previewCleanup = () => { preview?.dispose(); preview = null; };

    const TABS = [['face', 'Face'], ['hair', 'Hair'], ['body', 'Body'], ['clothes', 'Clothes']];
    const renderTabs = () => {
      clear(tabsEl);
      for (const [id, name] of TABS) tabsEl.appendChild(h('button' + (state.tab === id ? '.on' : ''), { on: { click: () => { state.tab = id; renderTabs(); renderOpts(); } } }, name));
    };
    const skinnable = ['human', 'longarm', 'longleg', 'three_eye', 'buccaneer', 'skypiean', 'lunarian'].includes(race);
    const renderOpts = () => {
      clear(optsEl);
      const tab = state.tab;
      preview?.setFraming?.(tab === 'face' || tab === 'hair' ? 'face' : 'full');
      if (tab === 'face') {
        add(optsEl,
          row('Eyes', (() => {
            const set = [...(L.fem ? EYES_F : EYES_M), ...(race === 'fishman' ? ['fish'] : [])];
            return chips(eyeShapeOf(L), set, set.map((e) => EYE_NAMES[e]), (v) => { L.eyeShape = v; });
          })()),
          row('Eye colour', swatch('eyeColor', ['#222222', '#3b2a1a', '#6d4c41', '#1e3799', '#0984e3', '#00a8a8', '#27ae60', '#6c5ce7', '#8e44ad', '#c0392b', '#e1b12c', '#b2bec3'])),
          row('Look', chips(L.frown ? 'stern' : 'easy', ['easy', 'stern'], ['Easy-going', 'Stern'], (v) => { L.frown = v === 'stern'; })),
          row('Mouth', chips(L.grin ? 'grin' : L.mouth || 'smile', ['smile', 'flat', 'grin'], ['Smile', 'Calm', 'Big grin'], (v) => { L.grin = v === 'grin'; L.mouth = v === 'grin' ? undefined : v; })),
          row('Face shape', chips(headParams(L).shape, FACE_SHAPES, ['Oval', 'Round', 'Square', 'Long', 'Heart'], (v) => { L.faceShape = v; })),
          row('Jaw', chips(L.jaw ?? 0.5, [0.25, 0.5, 0.75, 1], ['Narrow', 'Medium', 'Wide', 'Very wide'], (v) => { L.jaw = v; })),
          row('Chin', chips(headParams(L).chin, CHINS, ['Pointed', 'Round', 'Strong'], (v) => { L.chin = v; })),
          race !== 'mink' && race !== 'fishman' ? row('Nose', chips(headParams(L).nose, NOSES, ['Small', 'Normal', 'Big', 'Button', 'Hooked', 'Long', 'Red ball'], (v) => { L.noseShape = v; L.nose = v === 'long' ? 'long' : v === 'red' ? 'red' : undefined; })) : null,
          row('Cheekbones', chips(L.cheek ?? 0.5, [0, 0.5, 1], ['Soft', 'Defined', 'High'], (v) => { L.cheek = v; })),
          row('Brow', chips(headParams(L).brow, [0, 0.5, 1], ['Smooth', 'Medium', 'Heavy'], (v) => { L.brow = v; })),
          row('Teeth', chips(L.sharpTeeth ? 'sharp' : 'normal', ['normal', 'sharp'], ['Normal', 'Sharp'], (v) => { L.sharpTeeth = v === 'sharp'; })),
          row('Scar', chips(L.scarEye ? 'eye' : L.scarCheek ? 'cheek' : 'none', ['none', 'eye', 'cheek'], ['None', 'Across the eye', 'Under the eye'], (v) => { L.scarEye = v === 'eye'; L.scarCheek = v === 'cheek'; })),
        );
      } else if (tab === 'hair') {
        add(optsEl,
          row('Style', opts('hair', ['short', 'messy', 'spiky', 'crop', 'sidefringe', 'slick', 'pompadour', 'long', 'wavy', 'bob', 'ponytail', 'twintails', 'braid', 'bun', 'buzz', 'curly', 'afro', 'topknot', 'mohawk', 'bald'], ['Short', 'Messy', 'Spiky', 'Crop', 'Swept fringe', 'Slicked back', 'Pompadour', 'Long', 'Wavy', 'Bob', 'Ponytail', 'Twin tails', 'Braid', 'Bun', 'Buzz', 'Curly', 'Afro', 'Topknot', 'Mohawk', 'Bald'])),
          race !== 'mink' ? row('Colour', swatch('hairColor', ['#1e1e1e', '#3b2a1a', '#6b4423', '#c69c6d', '#f2d16b', '#e67e22', '#c0392b', '#e84393', '#8e44ad', '#2980b9', '#2ecc71', '#dfe6e9'])) : h('p.muted', 'Minks grow fur of their kind.'),
        );
      } else if (tab === 'body') {
        const build = h('input.build-slider', { type: 'range', min: 0, max: 1, step: 0.05, value: L.build ?? 0.5, on: { input: (e) => { L.build = Number(e.target.value); applyLook(L, race); preview?.setLook(L); } } });
        const mus = L.muscle ?? 0.5;
        add(optsEl,
          // (a frame brings the muscle it usually carries; Muscle can change it after)
          row('Frame', (() => {
            const set = L.fem ? FRAMES_F : FRAMES_M;
            return chips(frameId(L), set, set.map((f) => FRAME_NAMES[f]), (v) => { L.frame = v; L.muscle = FRAME[v].mus ?? 0.55; });
          })()),
          row('Build', h('div.build-row', h('span.muted', 'Thin'), build, h('span.muted', 'Wide'))),
          row('Muscle', chips(mus < 0.35 ? 0.2 : mus < 0.75 ? 0.55 : 1, [0.2, 0.55, 1], ['Lean', 'Toned', 'Muscular'], (v) => { L.muscle = v; })),
          L.fem ? row('Figure', chips((L.bust ?? 1) < 0.9 ? 0.8 : (L.bust ?? 1) < 1.15 ? 1 : 1.3, [0.8, 1, 1.3], ['Slim', 'Average', 'Curvy'], (v) => { L.bust = v; })) : null,
          h('p.muted', { style: { margin: '0 0 8px', fontSize: '12px' } }, 'Your height is set by your race. ' + (HEIGHT_NOTE[race] || '')),
          skinnable ? row('Skin', swatch('skin', ['#fbe3cf', '#f9dcc4', '#f1c9a0', '#e0ac7e', '#c68642', '#a0643a', '#7a4a2a', '#5c3a21'])) : null,
          race === 'mink' ? row('Mink', opts('kind', MINK_KINDS.map((k) => k.name))) : null,
          race === 'fishman' ? row('Fish-Man kind', opts('kind', FISHMAN_KINDS.map((k) => k.name))) : null,
        );
      } else {
        const o = outfitOf(L);
        const TOPS = [['tee', 'Tee'], ['shirt', 'Shirt'], ['tank', 'Tank top'], ['vest', 'Open vest'], ['open', 'Open shirt'], ['striped', 'Sailor stripes'], ['jacket', 'Suit jacket'], ['kimono', 'Kimono'], ['coat', 'Long coat'], ['bare', L.fem ? 'Chest wrap' : 'Bare-chested']];
        if (L.fem) TOPS.push(['crop', 'Crop top'], ['bikini', 'Bikini top'], ['dress', 'Dress']);
        const BOTS = [['trousers', 'Trousers'], ['shorts', 'Shorts'], ['capri', 'Rolled-up'], ['baggy', 'Baggy'], ['slim', 'Slim'], ['hakama', 'Hakama']];
        if (L.fem) BOTS.push(['skirt', 'Skirt'], ['longskirt', 'Long skirt']);
        const setTop = (v) => { L.topStyle = v; L.openShirt = undefined; L.noSleeves = undefined; if (v === 'coat' && !L.coat) L.coat = '#5d4037'; if (v !== 'coat' && L.coat && !L.keepCoat) L.coat = undefined; };
        const COLS = ['#d63031', '#0984e3', '#00b894', '#fdcb6e', '#e17055', '#6c5ce7', '#2d3436', '#dfe6e9', '#e84393', '#00cec9', '#a0522d', '#ffffff'];
        // (a woman's open vest or shirt has a bikini top under it: its colour)
        const under = L.fem && (o.top === 'vest' || o.top === 'open');
        const two = under || ['striped', 'jacket', 'kimono', 'coat'].includes(o.top);
        add(optsEl,
          row('Top', chips(o.top, TOPS.map((t) => t[0]), TOPS.map((t) => t[1]), setTop)),
          o.top !== 'bare' ? row(o.top === 'coat' ? 'Coat colour' : 'Colour', o.top === 'coat' ? swatch('coat', ['#5d4037', '#37474f', '#1b5e20', '#4a148c', '#b71c1c', '#fafafa', '#212121', '#0d47a1']) : swatch('top', COLS)) : null,
          two ? row(o.top === 'striped' ? 'Stripes' : o.top === 'kimono' ? 'Collar' : under ? 'Top under' : 'Shirt under', swatch('top2', ['#f5f5f5', '#fff8e1', '#90caf9', '#212121', '#c62828', '#fce4ec', '#ffd54f'])) : null,
          row('Bottoms', chips(o.skirt && !L.fem ? 'trousers' : o.bottom, BOTS.map((t) => t[0]), BOTS.map((t) => t[1]), (v) => { L.bottomStyle = v; })),
          row('Colour', swatch('bottom', ['#2d3436', '#1e3799', '#1e63b8', '#3b3b98', '#6d4c41', '#636e72', '#0a3d62', '#b8860b', '#e1b12c', '#f5f6fa'])),
          row('Waist', chips(o.waist, ['belt', 'sash', 'haramaki', 'obi', 'none'], ['Belt', 'Sash', 'Belly wrap', 'Obi', 'Nothing'], (v) => { L.waist = v; })),
          o.waist !== 'none' ? row(o.waist === 'belt' ? 'Belt' : 'Wrap colour', o.waist === 'belt' ? swatch('belt', ['#3b2a1a', '#212121', '#6d4c41', '#8d6e4a', '#c62828']) : swatch('waistCol', ['#f4c430', '#c62828', '#1e88e5', '#2e7d32', '#6a1b9a', '#ef6c00', '#fafafa', '#212121'])) : null,
          row('Footwear', chips(o.shoes, ['boots', 'shoes', 'sandals', 'geta', 'bare'], ['Boots', 'Shoes', 'Sandals', 'Geta', 'Barefoot'], (v) => { L.shoeStyle = v; L.sandals = undefined; })),
          o.shoes !== 'bare' ? row('Colour', swatch('shoes', ['#3b2a1a', '#2d3436', '#8d6e4a', '#c8a878', '#c0392b', '#f5f6fa'])) : null,
        );
      }
    };
    function changed() {
      applyLook(L, race);
      preview?.setLook(L);
      renderOpts();
    }
    if (!state.tab) state.tab = 'face';
    renderTabs();
    renderOpts();
  }

  stepRoll(true);
}

// ------------------------------------------------------------- death
export function lifeLostScreen(ui, { cause, lives, onContinue }) {
  const cards = [];
  for (let i = 0; i < lives + 1; i++) cards.push(h('div.vivre' + (i === lives ? '.burning' : ''), { style: { width: '36px', height: '48px' } }));
  const el = h('div.screen', h('div.panel', { style: { textAlign: 'center', width: 'min(560px, 92vw)' } },
    h('h2', 'A vivre card burns…'),
    h('div.lives', { style: { justifyContent: 'center', margin: '14px 0' } }, cards),
    h('p', cause),
    h('p', h('b', lives === 1 ? 'You have ONE life left. The next death is the end of this journey.' : `${lives} lives remain.`)),
    h('button.btn.gold', { on: { click: onContinue } }, 'Rise again'),
  ));
  ui.showScreen(el);
}

// ------------------------------------------------------------- wipe & legacy
export function lineageEndScreen(ui, { char, cause, will, legacy, onNext }) {
  const heirloomOptions = [];
  for (const it of char.inventory || []) {
    const d = ITEMS[it.id];
    if (!d || !['hat', 'coat', 'weapon', 'accessory'].includes(d.type)) continue;
    if (!heirloomOptions.find((o) => o.id === it.id)) heirloomOptions.push({ id: it.id, d });
  }
  let chosen = null;
  const list = h('div.list');
  const renderList = () => {
    clear(list);
    if (!heirloomOptions.length) list.appendChild(h('p.muted', 'You owned nothing worth passing down. Your successor starts with only your will.'));
    for (const o of heirloomOptions) {
      list.appendChild(h('div.row-item' + (chosen === o.id ? '.picked' : ''), { style: { cursor: 'pointer' }, on: { click: () => { chosen = o.id; renderList(); } } },
        itemImg(o.id, 30, '.ico'), h('div.grow', h('b', o.d.name), h('div.sub', o.d.desc || o.d.grade || o.d.type))));
    }
  };
  renderList();
  const legends = (char.legends || []).map((id) => LEGENDS[id]).filter(Boolean);
  const el = h('div.screen', h('div.panel.wide',
    h('h2', 'Your journey has ended.'),
    h('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } },
      wantedPoster(char),
      h('div', { style: { flex: 1, minWidth: '280px' } },
        h('p', h('b', char.name), ` — ${raceLabel(char.look)}, generation ${char.generation}.`),
        h('p', cause),
        h('p', `Survived ${char.world?.day || 1} days · ${(char.discovered || []).length} islands discovered · ${(char.bosses || []).length} great foes defeated${char.bounty ? ' · bounty ' + formatBerries(char.bounty) : ''}${char.fruit ? ' · ate the ' + FRUITS[char.fruit].name : ''}.`),
        legends.length ? h('p', h('b', 'Legends: '), legends.map((l) => l.name).join(', ')) : null,
        char.fruit ? h('p.muted', `Somewhere in the world, the ${FRUITS[char.fruit].name} has been reborn inside an ordinary fruit…`) : null,
        h('p', { style: { fontSize: '20px' } }, h('b', `+${will} Inherited Will`)),
        h('h3', 'Pass on an heirloom'),
        h('p.muted', 'Like the straw hat passed from Roger to Shanks to Luffy, choose one item for your successor to inherit.'),
        list,
        h('div', { style: { marginTop: '12px', display: 'flex', justifyContent: 'flex-end' } },
          h('button.btn.gold', { on: { click: () => { if (chosen) legacy.heirloom = { id: chosen, from: char.name }; onNext(); } } }, 'Continue')),
      )),
  ));
  ui.showScreen(el);
}

export function legacyShopScreen(ui, legacy, { onDone, save, doneLabel = 'Begin the next generation' }) {
  const root = h('div.screen');
  ui.showScreen(root);
  const render = () => {
    clear(root);
    const cards = Object.entries(PERKS).map(([id, p]) => {
      const lvl = perkLevel(legacy, id);
      const cost = perkCost(legacy, id);
      return h('div.card.perk',
        h('h4', uiImg(p.icon, 22), ' ', p.name, h('span.tag', `Lv ${lvl}/${p.costs.length}`)),
        h('div', p.desc),
        h('div', { style: { marginTop: '6px' } }, cost == null ? h('span.muted', 'Mastered') :
          h('button.btn' + (legacy.will >= cost ? '.gold' : ''), { disabled: legacy.will < cost, on: { click: () => { legacy.will -= cost; legacy.perks[id] = lvl + 1; save(); render(); } } }, `Inherit — ${cost} Will`)));
    });
    root.appendChild(h('div.panel.wide',
      h('h2', 'The Inherited Will'),
      h('p', 'Your ancestors\' deeds live on. Every life earns Inherited Will — for the islands it charted, the foes it bested, the days it survived and the legends it wrote. Spend it to shape every generation that follows. ', h('b', `Will: ${legacy.will}`)),
      legacy.heirloom ? h('p', 'Heirloom waiting for the next generation: ', itemImg(legacy.heirloom.id, 20), ` ${ITEMS[legacy.heirloom.id]?.name} (from ${legacy.heirloom.from}).`) : null,
      h('div.grid2', cards),
      h('div', { style: { marginTop: '12px', display: 'flex', justifyContent: 'flex-end' } }, h('button.btn.red', { on: { click: onDone } }, doneLabel)),
    ));
  };
  render();
}

export function hallScreen(ui, legacy, { onBack }) {
  const rows = (legacy.hall || []).map((e) => {
    const legends = (e.legends || []).map((id) => LEGENDS[id]?.name).filter(Boolean);
    const role = e.marineRank ? `Marine ${e.marineRank}` : e.crewName ? `captain of the ${e.crewName}` : e.faction === 'pirate' ? 'pirate' : 'wanderer';
    return h('div.row-item',
      e.look ? portrait(e.look, 40, 46) : uiImg('bounty', 30),
      h('div.grow', h('b', e.name), ` — ${RACES[e.race]?.name || e.race}, ${role}, generation ${e.generation}`,
        h('div.sub', `${e.days} days · ${e.islands} islands · ${e.bosses} great foes${e.bounty ? ' · ' + formatBerries(e.bounty) : ''}`),
        legends.length ? h('div.sub', { style: { color: '#7a4a06', fontWeight: 800 } }, 'Legends: ' + legends.join(', ')) : null,
        h('div.sub', e.cause)),
      h('span.price', `+${e.will} Will`));
  });
  ui.showScreen(h('div.screen', h('div.panel.wide',
    h('h2', 'Hall of Legends'),
    rows.length ? h('div.list', rows) : h('p', 'No legends yet. Every legend starts with a single voyage.'),
    h('div', { style: { marginTop: '12px', textAlign: 'right' } }, h('button.btn', { on: { click: onBack } }, 'Back')))));
}

/** How to Play. Pass the character so powers you haven't discovered stay secret. */
export function helpContent(char) {
  const haki = !!(char && (char.haki?.armament || char.haki?.observation || char.haki?.conqueror));
  const k = (key, text) => h('div', h('kbd', key), text);
  return h('div',
    h('h2', 'How to Play'),
    h('p', 'Inherited Will is a roguelike set on the whole Blue Planet of One Piece. You are born in one of the four Blues depending on your race. Nobody tells you what to become: sail where you like, climb Reverse Mountain into the Grand Line, cross the Red Line, join the Marines, become a pirate, hunt treasure — or all of it.'),
    h('p', h('b', 'Lives: '), 'You have a few vivre cards. Get knocked down and you can mash SPACE to get back up; if an enemy finishes you, a vivre card burns. Lose them all and your journey ends — your Inherited Will, an heirloom, and your charted islands pass to the next generation.'),
    h('p', h('b', 'Getting stronger: '), 'There are no points to spend. Your body grows by use: landing blows builds Strength, dodging and parrying builds Agility, blocking builds Endurance, taking punishment builds Vitality, and refusing to stay down builds Willpower. Every weapon type has its own mastery that rises the more you fight with it — and deals more damage as it does. Worthy opponents teach you far more than weak ones; masters and trainers can push you further, and beating a great foe brings a breakthrough.'),
    haki ? h('p', h('b', 'Haki: '), 'Your spirit has awakened. Haki grows as you use it in battle and with a master\'s training.') : h('p.muted', 'Some say that those who push their body and spirit far enough awaken something more…'),
    h('h3', 'Controls'),
    h('div.kbd-help',
      k('Mouse', 'look around (click the game to capture the mouse, Esc frees it)'), k('V', 'first person / third person'),
      k('WASD', 'move where you look / steer ship'), k('Space', 'jump; at a pier, a bank or a ship\'s side, climb up (ship: row)'), k('Shift', 'hold to sprint (ship: Coup de Burst); tap in first person to dodge'), k('Ctrl', 'third person: shift lock (the character faces where you look)'), k('Q', 'dash / dodge — it comes back after a moment (the Q slot left of the hotbar fills up again)'), k('Right mouse', 'heavy attack; hold and drag to turn the camera in third person without shift lock'), k('Left click', 'attack combo (ship: cannons)'),
      k('Right click', 'heavy attack'), k('F', 'block — tap just before a hit to PARRY; a heavy blow (the red glint) smashes a guard aside, so dodge those'), k('1-9, 0', 'hotbar (techniques & items); food goes in your hand — hold the right mouse button to eat it'),
      haki ? k('R / T', 'Armament / Observation Haki (once awakened)') : null,
      haki && char.haki?.conqueror ? k('G', "Conqueror's Haki") : null,
      k('E', 'interact / talk / pick fruit / take the helm or the oars / search a knocked-out foe'),
      k('C / Space (swimming)', 'dive / swim up — or look down and swim'),
      k('Tab / I', 'inventory & equipment'), k('C', 'character'), k('K', 'skills & hotbar'), k('J', 'journal'),
      k('U', 'crew'), k('M', 'world map'), k('Esc', 'pause menu'), k('Mouse wheel', 'camera distance (third person)'), k('H', 'this help'),
      char?.creative ? k('F1', 'the creative panel (creative mode): Devil Fruits, items, races, Haki, foes, ships, the world') : null),
    h('p.muted', 'The buttons on the right of the screen open the same menus. Open the Inventory or Skills menu and drag techniques, food, Devil Fruits and weapons straight onto your hotbar at the bottom of the screen (a weapon you wear hangs at your hip or on your back: its key draws it, and again sheathes it); drag hotbar slots to rearrange them, right-click one to clear it.'),
    h('p', h('b', 'On a phone or tablet: '), 'your left thumb moves (push the stick all the way to run; at sea it steers and sets the sails) and your right thumb drags to look around. The round buttons jump, attack, heavy attack, dodge and block; tap Use or the prompt to talk and interact, and tap a hotbar slot to use a technique. The strip at the top opens the menus, the world map and the camera view. Play with the phone held sideways.'),
    h('h3', 'Reputation'),
    h('p', 'People remember what you do. Helping islands, finishing quests and defeating pirates raises your reputation. Crimes — robbing shops and houses, picking pockets, attacking townsfolk, Marines or merchant ships — put a bounty on your head instead, and bounties grow the way they do in One Piece: a few hundred thousand berries for a petty thief in the East Blue, millions on the Grand Line, far more in the New World. Anyone with a bounty is a pirate in the eyes of the world. With a good reputation and no bounty you can enlist at a Marine base and climb the ranks — all the way to commanding fleets. A Marine who breaks the law loses standing, and is thrown out when nobody trusts them any more.'),
    h('h3', 'Sailing'),
    h('p', 'A rowboat has no mast or sail: sit at her oars (E at the seat) and set a pace: W quickens it and she keeps rowing at it, S eases it off to a stop (and, pressed again, backs water), and A/D pull one oar to turn her — no wind needed, though the currents still carry you. Anything bigger sails: W/S raise and lower the sails; the wind matters. The Calm Belts around the Grand Line have no wind and are full of Sea Kings — the only safe way in is up Reverse Mountain, in the middle of the Red Line where all four Blues meet. In the Grand Line normal compasses fail: you need a Log Pose. Stay on an island until the log sets, then follow the needle.'),
    h('h3', 'The sea'),
    h('p', 'Swim anywhere. Dive with C (or look down and swim) to explore the reefs, kelp forests and the dark deep water in the middle of the ocean; the bubbles under your health show how long you can hold your breath — come up for air before they pop. Grab fish with an attack as they swim past, prise giant clams open for pearls, and watch out past the reef: Sea Cows hunt swimmers in the Blues, and horned Fighting Fish in the Grand Line. Fish-Men swim fast and breathe water. Devil Fruit users cannot swim at all: they thrash for a few seconds (the bubbles count them down), then the sea drags them under, and they come out of it weak — keep a crewmate close to haul you out, or grab a line thrown from your ship.'),
    h('h3', 'Ships, raids and being wanted'),
    h('p', 'Other ships sail the seas: merchantmen and fishing boats, Marine patrols (who come after you once you\'re wanted), and pirates, who keep to their own business — unless you fire on them or board them. Stop, and a ship that\'s after you comes alongside and heaves to. Fire on a merchant and she may heave to. To board and raid a ship, leave your helm and jump across onto her deck — over her rail, coming down on her deck from above: her side is a wall to anyone below it (a rowboat\'s low side you jump over from the water). Beat the crew on her deck, go down the hatch amidships and plunder the treasure chest in her hold (her cannonballs come across to your ship too), and take what\'s in it (a raided ship isn\'t yours to sail away: new ships come from the shipwrights). At your own wheel, E leaves the helm so you can walk your deck — under sail she sails on, holding her course, till you take the wheel again to steer or lower the sails (her bulwark is a low wall: jump over it for a swim, or onto the pier she\'s tied up at). Ships come in every size, from your first rowboat to sloops, caravels, galleons and One Piece-scale men-o\'-war and Yonko flagships — and every one with a sail is a ship you can live on: walk her decks, climb the stairs to the quarterdeck, go in through the door under it to the captain\'s cabin (a table with the chart, a bunk, the sea chest), into the crew\'s forecastle on the bigger ones, and down the hatch amidships to the hold, where the cargo and the treasure chest are (on the big ships, a gun deck with cannons at every port). Her guns fire cannonballs, one a gun, and they run out: the count is by your wheel, and a shipwright restocks you. Your crew stand their stations on deck while you steer. Your own ships can\'t break. Every pier has a shipwright: talk to them (E) to bring any ship you own round to that pier, or to buy a new one. Raiding or stealing from anyone but pirates is piracy, and your bounty grows. A small bounty goes unnoticed, but once your poster is worth something the Marines know your face on sight — a hood hides it, until you fight or steal in it.'),
    h('h3', 'Crossing the Red Line'),
    h('p', 'Paradise ends at the Red Line. Pirates cross the way the Straw Hats did: have your ship coated at the Sabaody Archipelago, then dive 10,000 metres to Fish-Man Island and rise into the New World. The Red Ports and their Bondola lifts to Mary Geoise are for the World Government — and those it permits.'),
    h('h3', 'Crew and the One Piece'),
    h('p', 'Found your own pirate crew and design your Jolly Roger from the Crew menu (U); it flies from your ship\'s sails. Recruit companions you meet along the way. Poneglyphs can only be read by an archaeologist. Four Road Poneglyphs point the way to Laugh Tale. Pick fruit and coconuts from trees when you are hungry.'),
  );
}

// ---------------------------------------------------------- wanted poster
export function wantedPoster(char) {
  const cv = h('canvas', { width: 240, height: 200 });
  const g = cv.getContext('2d');
  g.fillStyle = '#e8d5a8'; g.fillRect(0, 0, 240, 200);
  g.fillStyle = '#d4bd8a'; for (let i = 0; i < 40; i++) g.fillRect((i * 53) % 240, (i * 37) % 200, 3, 3);
  const img = char.look ? renderPortrait(char.look, { w: 240, h: 200, view: 'bust' }) : null;
  if (img) g.drawImage(img, 0, 0, 240, 200);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#d9c28f'; g.fillRect(0, 0, 240, 200);
  g.globalCompositeOperation = 'source-over';
  const bounty = char.bounty ? formatBerries(char.bounty).replace('฿', '฿ ') + '-' : '฿ 0-';
  return h('div.poster', h('div.w', 'WANTED'), cv, h('div.doa', 'DEAD OR ALIVE'), h('div.nm', char.name), h('div.amt', bounty), h('div.mar', 'MARINE'));
}

// ------------------------------------------------------------ names
const FIRST = ['Kaito', 'Rin', 'Jiro', 'Marlo', 'Sen', 'Tobias', 'Yuki', 'Bram', 'Ines', 'Kaji', 'Rook', 'Kazuma', 'Mira', 'Otto', 'Sabrina', 'Goro', 'Hana', 'Leon', 'Pip', 'Ramon', 'Tess', 'Umi', 'Vito', 'Zola', 'Enzo', 'Akira', 'Nell', 'Cruz', 'Ivo', 'Juno'];
const LAST = ['Stormwell', 'Kurogane', 'Blackwater', 'Hayate', 'Marrow', 'Goldtooth', 'Saltbane', 'Tempest', 'Ironside', 'Raiden', 'Nagare', 'Crowe', 'Seabright', 'Kaminari', 'Wolfe', 'Tidebreaker', 'Hoshi', 'Gunnar', 'Vasquez', 'Umibozu'];
export function randomCharName() {
  const r = new RNG(Math.floor(Math.random() * 1e9));
  return `${r.pick(FIRST)} ${r.pick(LAST)}`;
}
