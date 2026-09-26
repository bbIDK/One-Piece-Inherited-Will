// Title, character creation (race roll → identity → dream), death and
// Inherited Will screens.
import { h, clear } from './dom.js';
import { RACES, RARITY, makeLook, raceLabel, MINK_KINDS, FISHMAN_KINDS } from '../data/races.js';
import { DREAMS, DREAM_IDS } from '../data/dreams.js';
import { TRAITS, PERKS, perkLevel, perkCost, rollBirth } from '../game/lineage.js';
import { drawCharacter } from '../render/character.js';
import { drawJollyRoger } from '../render/ship.js';
import { ITEMS } from '../data/items.js';
import { FRUITS } from '../data/fruits.js';
import { formatBerries } from '../core/math.js';
import { RNG } from '../core/rng.js';

const SEA_NAMES = { east_blue: 'East Blue', north_blue: 'North Blue', west_blue: 'West Blue', south_blue: 'South Blue' };

// ---------------------------------------------------------------- title
export function titleScreen(ui, { legacy, hasSave, saveInfo, onContinue, onNew, onHall, onHelp, onSettings }) {
  const menu = h('div.menu',
    hasSave ? h('button.btn.gold', { on: { click: onContinue } }, `Continue — ${saveInfo}`) : null,
    h('button.btn.red', { on: { click: onNew } }, hasSave ? 'Abandon & Begin Anew' : 'Set Sail'),
    h('button.btn', { on: { click: onHall } }, `Hall of Legends (${legacy.hall.length})`),
    h('button.btn', { on: { click: onHelp } }, 'How to Play'),
    h('button.btn', { on: { click: onSettings } }, 'Settings'),
  );
  const el = h('div.screen',
    h('div.title',
      h('h1', 'Inherited Will'),
      h('h2', 'A One Piece Roguelike'),
      h('p', { style: { margin: '-12px 0 20px', textShadow: '0 1px 3px #000' } }, legacy.generation > 1 ? `Generation ${legacy.generation} · Inherited Will: ${legacy.will}` : 'Your lineage begins here.'),
      menu,
    ),
    h('div.foot', 'Unofficial fan game. ONE PIECE © Eiichiro Oda / Shueisha / Toei Animation. All art in this game is procedurally drawn.'),
  );
  ui.showScreen(el);
}

// --------------------------------------------------------------- creation
export function creationScreen(ui, legacy, { onDone, onBack }) {
  let rerolls = perkLevel(legacy, 'reroll');
  let birth = rollBirth(legacy, Math.floor(Math.random() * 1e9));
  const state = { name: '', look: null, dream: 'king', jr: { skull: 'classic', bones: 'cross', accessory: 'strawhat', color: '#f5f6fa' } };
  const root = h('div.screen');
  ui.showScreen(root);
  let raf = 0;

  const stopAnim = () => cancelAnimationFrame(raf);

  // ---- step 1: the roll
  function stepRoll(spin = true) {
    stopAnim();
    clear(root);
    const race = RACES[birth.race];
    const rar = RARITY[race.rarity];
    const nameEl = h('div.race', { style: { color: rar.color } }, '???');
    const rarEl = h('div.rarity', { style: { color: rar.color } }, '');
    const info = h('div', { style: { opacity: 0, transition: 'opacity .6s' } },
      h('p', { style: { maxWidth: '560px', margin: '6px auto' } }, race.desc),
      h('p', h('b', 'Birthplace: '), race.origin, ' ', h('span.tag', race.spawnSeas.map((s) => SEA_NAMES[s]).join(' / '))),
      h('div', { style: { margin: '10px auto', maxWidth: '600px', textAlign: 'left' } },
        h('h3', 'Racial traits'), ...race.traits.map((t) => h('div', '• ' + t)),
        h('h3', 'Born with'),
        ...birth.traits.map((t) => h('div', h('b', { style: { color: TRAITS[t].rarity === 'legendary' ? '#b8860b' : 'inherit' } }, TRAITS[t].name + ': '), TRAITS[t].desc)),
        h('p.muted', `Lives: ${Math.min(5, race.lives + perkLevel(legacy, 'lives'))} vivre cards`)),
      h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' } },
        h('button.btn.gold', { on: { click: stepIdentity } }, 'Accept my fate'),
        rerolls > 0 ? h('button.btn', { on: { click: () => { rerolls--; birth = rollBirth(legacy, Math.floor(Math.random() * 1e9)); stepRoll(true); } } }, `Flip Fate's Coin (${rerolls} left)`) : null,
        h('button.btn', { on: { click: () => { stopAnim(); onBack(); } } }, 'Back'),
      ),
    );
    const panel = h('div.panel.race-roll', h('h2', legacy.generation > 1 ? `Generation ${legacy.generation} is born…` : 'A child is born…'), nameEl, rarEl, info);
    root.appendChild(panel);
    const ids = Object.keys(RACES);
    let t0 = performance.now();
    const dur = spin ? 1800 : 0;
    const tick = (now) => {
      const k = (now - t0) / Math.max(1, dur);
      if (k < 1) {
        const i = Math.floor(Math.pow(k, 0.5) * 40) % ids.length;
        nameEl.textContent = RACES[ids[i]].name;
        nameEl.style.color = RARITY[RACES[ids[i]].rarity].color;
        raf = requestAnimationFrame(tick);
      } else {
        nameEl.textContent = race.name;
        nameEl.style.color = rar.color;
        rarEl.textContent = rar.label.toUpperCase();
        info.style.opacity = 1;
        ui.game?.audio?.sfx(race.rarity === 'legendary' || race.rarity === 'epic' ? 'fanfare' : 'reveal');
      }
    };
    raf = requestAnimationFrame(tick);
  }

  // ---- step 2: identity & looks & flag
  function stepIdentity() {
    stopAnim();
    clear(root);
    if (!state.look) state.look = makeLook(birth.race, birth.seed);
    if (!state.name) state.name = randomCharName();
    const preview = h('canvas', { width: 260, height: 300, style: { width: '100%', height: '300px' } });
    const flag = h('canvas', { width: 180, height: 130, style: { width: '180px', height: '130px', borderRadius: '8px', background: '#111' } });
    const nameInput = h('input.name', { value: state.name, maxLength: 28, on: { input: (e) => { state.name = e.target.value; } } });
    const L = state.look;
    const race = birth.race;
    const row = (label, ...kids) => h('div', { style: { margin: '6px 0' } }, h('div', { style: { fontWeight: 800, fontSize: '13px' } }, label), ...kids);
    const swatch = (key, colors) => h('div.swatches', ...colors.map((c) => {
      const b = h('button' + (L[key] === c ? '.on' : ''), { style: { background: c }, on: { click: () => { L[key] = c; if (key === 'fur') { L.skin = c; L.hairColor = c; L.hand = c; } stepIdentityRefresh(); } } });
      return b;
    }));
    const opts = (key, values, labels) => h('div.swatches', ...values.map((v, i) => h('button' + (L[key] === v ? '.on' : ''), {
      style: { width: 'auto', borderRadius: '6px', padding: '2px 8px', background: L[key] === v ? '#c0392b' : '#6d4c33', color: '#fff', font: '700 12px Nunito' },
      on: { click: () => { L[key] = v; stepIdentityRefresh(); } },
    }, labels ? labels[i] : v)));
    const jrOpt = (key, values) => h('div.swatches', ...values.map((v) => h('button' + (state.jr[key] === v ? '.on' : ''), {
      style: { width: 'auto', borderRadius: '6px', padding: '2px 8px', background: state.jr[key] === v ? '#c0392b' : '#6d4c33', color: '#fff', font: '700 12px Nunito' },
      on: { click: () => { state.jr[key] = v; stepIdentityRefresh(); } },
    }, v)));
    const left = h('div', h('div.preview', preview), h('p.muted', { style: { textAlign: 'center' } }, raceLabel(L)));
    const right = h('div',
      row('Name', h('div', { style: { display: 'flex', gap: '6px' } }, nameInput, h('button.btn', { on: { click: () => { state.name = randomCharName(); nameInput.value = state.name; } } }, '🎲'))),
      race === 'mink' ? row('Mink', opts('kind', MINK_KINDS.map((k) => k.name))) : null,
      race === 'fishman' ? row('Fish-Man kind', opts('kind', FISHMAN_KINDS.map((k) => k.name))) : null,
      row('Hair', opts('hair', ['short', 'spiky', 'long', 'ponytail', 'buzz', 'curly', 'afro', 'topknot', 'mohawk', 'bald'])),
      race !== 'mink' ? row('Hair colour', swatch('hairColor', ['#1e1e1e', '#3b2a1a', '#6b4423', '#c69c6d', '#f2d16b', '#e67e22', '#c0392b', '#2ecc71', '#2980b9', '#e84393', '#dfe6e9', '#8e44ad'])) : null,
      race === 'human' || race === 'longarm' || race === 'longleg' || race === 'three_eye' || race === 'buccaneer' || race === 'skypiean' ? row('Skin', swatch('skin', ['#f9dcc4', '#f1c9a0', '#e0ac7e', '#c68642', '#a0643a', '#7a4a2a', '#5c3a21'])) : null,
      row('Shirt', swatch('top', ['#d63031', '#0984e3', '#00b894', '#fdcb6e', '#e17055', '#6c5ce7', '#2d3436', '#dfe6e9', '#e84393', '#00cec9', '#a0522d', '#ffffff'])),
      row('Trousers', swatch('bottom', ['#2d3436', '#1e3799', '#3b3b98', '#6d4c41', '#636e72', '#0a3d62', '#b8860b', '#e1b12c'])),
      row('Shirt open', opts('openShirt', [false, true], ['closed', 'open'])),
      h('h3', 'Your Jolly Roger'),
      h('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-start' } }, flag, h('div',
        row('Skull', jrOpt('skull', ['classic', 'grin', 'eyepatch'])),
        row('Crossed', jrOpt('bones', ['cross', 'swords', 'anchor'])),
        row('Hat', jrOpt('accessory', ['none', 'strawhat', 'bandana', 'tricorne', 'horns', 'crown', 'flames', 'halo'])),
      )),
    );
    const panel = h('div.panel.wide', h('h2', 'Who are you?'), h('div.creation-grid', left, right),
      h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' } },
        h('button.btn', { on: { click: () => stepRoll(false) } }, 'Back'),
        h('button.btn.gold', { on: { click: stepDream } }, 'Next: your dream ➜')));
    root.appendChild(panel);
    function stepIdentityRefresh() {
      // apply kind choices
      if (race === 'mink') { const k = MINK_KINDS.find((m) => m.name === L.kind); if (k) Object.assign(L, { ears: k.ears, fur: k.fur, tail: k.tail, muzzle: k.muzzle, skin: k.fur, hairColor: k.fur, hand: k.fur }); }
      if (race === 'fishman') { const k = FISHMAN_KINDS.find((m) => m.name === L.kind); if (k) L.skin = k.skin; }
      stepIdentity();
    }
    // animate preview
    const g = preview.getContext('2d');
    const fg = flag.getContext('2d');
    const t0 = performance.now();
    const tick = (now) => {
      const t = (now - t0) / 1000;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, 260, 300);
      g.setTransform(95, 0, 0, 95, 130, 250);
      const facing = [Math.PI / 2, 0, Math.PI, -Math.PI / 2][Math.floor(t / 2) % 4];
      drawCharacter(g, L, { facing, walk: t * 8, moving: Math.floor(t / 2) % 4 !== 0, time: t, state: 'idle' });
      fg.setTransform(1, 0, 0, 1, 0, 0);
      fg.fillStyle = '#111'; fg.fillRect(0, 0, 180, 130);
      fg.setTransform(110, 0, 0, 110, 90, 70);
      drawJollyRoger(fg, state.jr, 1, '#111');
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  // ---- step 3: dream
  function stepDream() {
    stopAnim();
    clear(root);
    const cards = DREAM_IDS.map((id) => {
      const d = DREAMS[id];
      return h('div.card.dream' + (state.dream === id ? '.on' : ''), { on: { click: () => { state.dream = id; stepDream(); } } },
        h('h4', `${d.icon} ${d.name}`), h('div', d.desc), h('div.meta', { style: { marginTop: '4px' } }, 'Goal: ' + d.goal), h('div.meta', '✦ ' + d.perk));
    });
    const race = RACES[birth.race];
    const panel = h('div.panel.wide',
      h('h2', 'What is your dream?'),
      h('p', 'Everyone who sets out to sea chases something. Your dream shapes your journey and — if you ever reach it — your legend.'),
      h('div.grid2', cards),
      h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' } },
        h('div.muted', `${state.name || 'You'} · ${raceLabel(state.look)} · born in the ${race.spawnSeas.length > 1 ? 'one of the four Blues' : SEA_NAMES[race.spawnSeas[0]]}`),
        h('div', { style: { display: 'flex', gap: '10px' } },
          h('button.btn', { on: { click: stepIdentity } }, 'Back'),
          h('button.btn.red', { style: { fontSize: '18px' }, on: { click: () => { stopAnim(); onDone(birth, { ...state, name: state.name || 'Nameless' }); } } }, 'Set Sail! ⚓'))),
    );
    root.appendChild(panel);
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
  const inv = char.inventory || [];
  for (const it of inv) {
    const d = ITEMS[it.id];
    if (!d || !['hat', 'coat', 'weapon'].includes(d.type)) continue;
    if (!heirloomOptions.find((o) => o.id === it.id)) heirloomOptions.push({ id: it.id, d });
  }
  let chosen = null;
  const list = h('div.list');
  const renderList = () => {
    clear(list);
    if (!heirloomOptions.length) list.appendChild(h('p.muted', 'You owned nothing worth passing down. Your successor starts with only your will.'));
    for (const o of heirloomOptions) {
      list.appendChild(h('div.row-item', { style: { cursor: 'pointer', outline: chosen === o.id ? '3px solid #c0392b' : 'none' }, on: { click: () => { chosen = o.id; renderList(); } } },
        h('span.ico', o.d.icon), h('div.grow', h('b', o.d.name), h('div.sub', o.d.desc || o.d.grade || o.d.type))));
    }
  };
  renderList();
  const poster = wantedPoster(char);
  const el = h('div.screen', h('div.panel.wide',
    h('h2', 'Your journey has ended.'),
    h('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } },
      poster,
      h('div', { style: { flex: 1, minWidth: '280px' } },
        h('p', h('b', char.name), ` — ${raceLabel(char.look)}, generation ${char.generation}.`),
        h('p', cause),
        h('p', `Survived ${char.world?.day || 1} days · ${(char.discovered || []).length} islands discovered · ${(char.bosses || []).length} great foes defeated${char.bounty ? ' · bounty ' + formatBerries(char.bounty) : ''}${char.fruit ? ' · ate the ' + FRUITS[char.fruit].name : ''}.`),
        char.fruit ? h('p.muted', `Somewhere in the world, the ${FRUITS[char.fruit].name} has been reborn inside an ordinary fruit…`) : null,
        h('p', { style: { fontSize: '20px' } }, h('b', `+${will} Inherited Will`)),
        h('h3', 'Pass on an heirloom'),
        h('p.muted', 'Like the straw hat passed from Roger to Shanks to Luffy, choose one item for your successor to inherit.'),
        list,
        h('div', { style: { marginTop: '12px', display: 'flex', justifyContent: 'flex-end' } },
          h('button.btn.gold', { on: { click: () => { if (chosen) legacy.heirloom = { id: chosen, from: char.name }; onNext(); } } }, 'Continue ➜')),
      )),
  ));
  ui.showScreen(el);
}

export function legacyShopScreen(ui, legacy, { onDone, save }) {
  const root = h('div.screen');
  ui.showScreen(root);
  const render = () => {
    clear(root);
    const cards = Object.entries(PERKS).map(([id, p]) => {
      const lvl = perkLevel(legacy, id);
      const cost = perkCost(legacy, id);
      return h('div.card',
        h('h4', `${p.icon} ${p.name}`, h('span.tag', `Lv ${lvl}/${p.costs.length}`)),
        h('div', p.desc),
        h('div', { style: { marginTop: '6px' } }, cost == null ? h('span.muted', 'Mastered') :
          h('button.btn' + (legacy.will >= cost ? '.gold' : ''), { disabled: legacy.will < cost, on: { click: () => { legacy.will -= cost; legacy.perks[id] = lvl + 1; save(); render(); } } }, `Inherit — ${cost} Will`)));
    });
    root.appendChild(h('div.panel.wide',
      h('h2', 'The Inherited Will'),
      h('p', 'Your ancestors\' deeds live on. Spend Inherited Will to shape every generation that follows. ', h('b', `Will: ${legacy.will}`)),
      legacy.heirloom ? h('p', `Heirloom waiting for the next generation: ${ITEMS[legacy.heirloom.id]?.icon} ${ITEMS[legacy.heirloom.id]?.name} (from ${legacy.heirloom.from}).`) : null,
      h('div.grid2', cards),
      h('div', { style: { marginTop: '12px', display: 'flex', justifyContent: 'flex-end' } }, h('button.btn.red', { on: { click: onDone } }, 'Begin the next generation ➜')),
    ));
  };
  render();
}

export function hallScreen(ui, legacy, { onBack }) {
  const rows = legacy.hall.map((e) => h('div.row-item',
    h('span.ico', e.dreamDone ? '⭐' : '☠'),
    h('div.grow', h('b', e.name), ` — ${RACES[e.race]?.name || e.race}, gen ${e.generation}`,
      h('div.sub', `${DREAMS[e.dream]?.name || ''}${e.dreamDone ? ' (fulfilled!)' : ''} · ${e.days} days · ${e.islands} islands · ${e.bosses} great foes${e.bounty ? ' · ' + formatBerries(e.bounty) : ''}`),
      h('div.sub', e.cause)),
    h('span.price', `+${e.will} Will`)));
  ui.showScreen(h('div.screen', h('div.panel.wide',
    h('h2', 'Hall of Legends'),
    rows.length ? h('div.list', rows) : h('p', 'No legends yet. Every legend starts with a single voyage.'),
    h('div', { style: { marginTop: '12px', textAlign: 'right' } }, h('button.btn', { on: { click: onBack } }, 'Back')))));
}

export function helpContent() {
  const k = (key, text) => h('div', h('kbd', key), text);
  return h('div',
    h('h2', 'How to Play'),
    h('p', 'Inherited Will is a roguelike set on the whole Blue Planet of One Piece. You are born in one of the four Blues depending on your race. Reach Reverse Mountain, enter the Grand Line, cross the Red Line and find the One Piece — or chase whatever dream you chose.'),
    h('p', h('b', 'Lives: '), 'You have a few vivre cards. Get knocked down and you can mash SPACE to get back up; if an enemy finishes you, a vivre card burns. Lose them all and your journey ends — your Inherited Will, an heirloom, and your charted islands pass to the next generation.'),
    h('p', h('b', 'Getting stronger: '), 'There is no XP grinding. Weak enemies teach you nothing. Grow by training with masters (dojos, trainers), completing island stories, defeating worthy opponents (breakthroughs), finding Devil Fruits and awakening Haki.'),
    h('h3', 'Controls'),
    h('div.kbd-help',
      k('WASD', 'move / steer ship'), k('Shift', 'sprint (ship: Coup de Burst)'), k('Space', 'dodge (ship: row)'), k('Left click', 'attack combo (ship: cannons)'),
      k('Right click', 'heavy attack'), k('F', 'block — tap just before a hit to PARRY'), k('1-6', 'techniques'), k('R', 'Armament Haki'),
      k('T', 'Observation Haki'), k('G', "Conqueror's Haki"), k('E', 'interact / talk / board / go ashore'), k('Q', 'eat food'),
      k('I / Tab', 'inventory & equipment'), k('C', 'character & stats'), k('K', 'skills & hotbar'), k('J', 'journal'),
      k('M', 'world map'), k('U', 'crew (nakama)'), k('Esc', 'menu'), k('Mouse wheel', 'zoom'), k('H', 'this help')),
    h('h3', 'Sailing'),
    h('p', 'W/S raise and lower the sails; the wind matters. The Calm Belts around the Grand Line have no wind and are full of Sea Kings — the only safe way in is up Reverse Mountain, in the middle of the Red Line where all four Blues meet. In the Grand Line normal compasses fail: you need a Log Pose. Stay on an island until the log sets, then follow the needle.'),
    h('h3', 'Crossing the Red Line'),
    h('p', 'Paradise ends at the Red Line. Pirates cross the way the Straw Hats did: have your ship coated at the Sabaody Archipelago, then dive 10,000 metres to Fish-Man Island and rise into the New World. The Red Ports and their Bondola lifts to Mary Geoise are for the World Government — and those it permits.'),
    h('h3', 'Crew, Marines and the One Piece'),
    h('p', 'Recruit companions you meet (U). Enlist in the Marines at a base if your bounty is clean and climb the ranks — or become a pirate and watch your bounty grow. Poneglyphs can only be read by an archaeologist. Four Road Poneglyphs point the way to Laugh Tale.'),
  );
}

// ---------------------------------------------------------- wanted poster
export function wantedPoster(char) {
  const cv = h('canvas', { width: 240, height: 200 });
  const g = cv.getContext('2d');
  g.fillStyle = '#e8d5a8'; g.fillRect(0, 0, 240, 200);
  g.fillStyle = '#d4bd8a'; for (let i = 0; i < 40; i++) g.fillRect((i * 53) % 240, (i * 37) % 200, 3, 3);
  g.setTransform(110, 0, 0, 110, 120, 235);
  drawCharacter(g, char.look, { facing: Math.PI / 2, moving: false, time: 1, state: 'idle', action: null });
  g.setTransform(1, 0, 0, 1, 0, 0);
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
