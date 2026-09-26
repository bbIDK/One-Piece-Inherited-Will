// Combat / animation scenarios for tools/shot.mjs. They build a small arena
// on open dry ground, freeze the real-time loop, trigger attacks with a fixed
// time step and compose the captured frames into contact sheets in shots/.
//
//   node tools/shot.mjs combat-races                      mid-punch frames for every race (side/front/back)
//   node tools/shot.mjs combat-m1 --style=santoryu        M1 chain + heavy of one style
//   node tools/shot.mjs combat-styles [--only=a,b]         every style's chain + heavy
//   node tools/shot.mjs combat-fruit --fruit=mera [--tech=mera_entei]
//   node tools/shot.mjs combat-fruits [--only=mera,hie]   every fruit's techniques (one sheet per fruit)
//   node tools/shot.mjs combat-tech --ids=a,b,c           any techniques by id (styles, fruits, haki)
//   node tools/shot.mjs combat-hit                        hit feel: sparks, crit, heavy, block, guard break, parry
//   node tools/shot.mjs combat-move                       dodge, sprint, block, knockdown & get-up
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'shots');

// game data straight from the sources (technique timings and fruit lists)
const { FRUITS } = await import('../src/data/fruits.js');
await import('../src/data/styles.js');
await import('../src/data/haki.js');
const { getAbility } = await import('../src/game/abilities.js');
const techInfo = (id) => {
  const def = getAbility(id);
  if (!def) return null;
  const steps = def.steps || [];
  const ranged = steps.some((s) => s.proj || (s.hit && s.hit.shape === 'line') || s.zone || s.teleport || s.dash);
  return { ranged, w: def.windup ?? 0.1, night: !!def.requiresNight };
};

const waitReady = (page) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 180000, polling: 250 });

/** In-page helpers (serialised into the page). */
function installLab() {
  const OP = window.OP;
  const lab = {
    home: null,
    zoom: 1.5,
    arena() {
      const g = OP.game, p = g.player;
      g.env.clock = 12.5;
      for (const a of g.actors) if (a !== p) a.alive = false;
      g.actors = g.actors.filter((a) => a === p);
      g.combat.hitboxes.length = 0; g.combat.projectiles.length = 0;
      if (g.fx.reset) g.fx.reset(); else { g.fx.parts.length = 0; g.fx.shapes.length = 0; g.fx.texts.length = 0; }
      g.areaZones.length = 0;
      g.spawner.update = () => {};
      p.hidden = false;
      p.hp = p.d.maxHp; p.stamina = p.d.maxStamina; p.state = 'idle'; p.action = null; p.hitstun = 0; p.iframes = 0; p.buffs = []; p.status = {}; p.cooldowns = {};
      p.armament = false; p.observation = false; p.blocking = false; p.dash = null; p.kb.x = 0; p.kb.y = 0; p.conquerorInfused = false;
      p.recalc();
      if (!lab.home) lab.findOpenGround();
      p.x = lab.home.x; p.y = lab.home.y;
      p.facing = 0;
      g.zoomBias = lab.zoom;
      g.snapCamera();
      // the lab frames shots itself: the camera stays where center() puts it
      g.updateCamera = () => {};
      g.fx.trauma = 0; g.fx.hitstop = 0; g.slowmo = 1;
    },
    findOpenGround() {
      // an open, dry patch (no water, no props): first around Dawn Island's
      // grasslands (East Blue), else around the spawn
      const g = OP.game, p = g.player, w = g.world;
      const good = new Set([16, 17, 18, 32, 47]);
      const ok = (x, y) => good.has(w.type(x, y)) && w.walkable(x, y);
      const starts = [];
      const dawn = g.surface && g.surface.islands && g.surface.islands.find((i) => i.id === 'dawn_island');
      if (dawn && dawn.towns && dawn.towns[0] && dawn.towns[0].plaza) starts.push(dawn.towns[0].plaza);
      starts.push({ x: p.x, y: p.y });
      for (const st of starts) {
        for (let r = 6; r < 160; r += 3) {
          for (let k = 0; k < 32; k++) {
            const a = (k / 28) * Math.PI * 2;
            const cx = Math.round(st.x + Math.cos(a) * r), cy = Math.round(st.y + Math.sin(a) * r);
            let fine = true;
            for (let dx = -8; dx <= 10 && fine; dx += 1) for (let dy = -4; dy <= 4 && fine; dy += 1) if (!ok(cx + dx, cy + dy)) fine = false;
            // nothing standing in front of (or right behind) the fighters; buildings reach far up
            if (fine && w.objects) { const near = w.objects.query(cx - 10, cy - 2, cx + 12, cy + 16); if (near.some((o) => o.kind === 'building' || o.y > cy - 2)) fine = false; }
            if (fine) { lab.home = { x: cx + 0.5, y: cy + 0.5 }; return lab.home; }
          }
        }
      }
      lab.home = { x: p.x, y: p.y };
      return lab.home;
    },
    equip(o = {}) {
      const g = OP.game, p = g.player;
      p.style = o.style || 'brawler';
      const kind = o.weapon || null;
      const ids = kind === 'gun' ? (o.sling ? ['slingshot'] : ['flintlock']) : [];
      p.weapon = kind ? { kind, power: 1.2, count: o.count || 1, ids } : null;
      p.look = { ...p.look, swords: kind === 'sword' ? (o.count || 1) : 0, weapon: kind };
      p.fruit = o.fruit || null;
      p.fruitMastery = o.fruit ? 100 : 0;
      p.masteries = { ...(p.masteries || {}), [p.style]: 100 };
      p.hakiSkill = { armament: 60, observation: 60, conqueror: 60 };
      p.recalc();
      p.haki = 999;
    },
    spawn(o = {}, dx = 0, dy = 0) {
      const g = OP.game, p = lab.home;
      const { makeNPC } = OP.debug;
      const def = { name: o.name || 'Fighter', faction: o.faction || 'pirate', level: o.level || 30, hpMul: o.hpMul ?? 40, race: o.race || 'human', style: o.style || 'brawler', weapon: o.weapon, fruit: o.fruit, look: o.look || {}, id: 'lab_' + (o.race || 'h') + '_' + (o.seed || 0) };
      const a = makeNPC(def, p.x + dx, p.y + dy);
      a.game = g; g.addActor(a);
      a.controller = null; a.provoked = true;
      a.facing = o.facing ?? 0;
      a.hp = a.d.maxHp; a.stamina = a.d.maxStamina;
      a.hakiSkill = { armament: 60, observation: 60, conqueror: 60 }; a.haki = 999;
      a.masteries = { [a.style]: 100 };
      if (o.weapon === 'sword') a.weapon = { kind: 'sword', power: 1.2, count: o.count || 1 };
      if (o.weapon === 'gun' && o.sling) a.weapon.ids = ['slingshot'];
      a.recalc();
      return a;
    },
    dummy(dx = 1.6, dy = 0, o = {}) {
      const d = lab.spawn({ name: o.name || 'Dummy', faction: 'marine', look: { top: '#8d6e63', bottom: '#5d4037', hair: 'short', hairColor: '#3e2723', ...(o.look || {}) }, style: o.style || 'brawler', weapon: o.weapon, hpMul: o.hpMul ?? 60 }, dx, dy);
      d.facing = Math.atan2(-dy, -dx);
      lab.target = d;
      return d;
    },
    aimAt(x, y, who) {
      const g = OP.game;
      const [sx, sy] = g.renderer.toScreen(g.world, x, y - 0.5);
      OP.input.mouse.x = sx; OP.input.mouse.y = sy;
      const p = who || g.player;
      p.facing = Math.atan2(y - p.y, g.world.dx(p.x, x));
    },
    refill(who) {
      const p = who || OP.game.player;
      p.stamina = p.d.maxStamina; p.haki = 999; p.cooldowns = {}; p.hp = p.d.maxHp;
      if (lab.target) { lab.target.hp = lab.target.d.maxHp; lab.target.state = 'idle'; }
    },
    center(dx = 0, dy = 0) {
      const g = OP.game, cam = g.renderer.cam;
      cam.x = g.world.wx(lab.home.x + dx); cam.y = lab.home.y + dy;
    },
    clip(w = 360, h = 260, dx = 0.8, dy = -0.8) {
      const g = OP.game;
      const [sx, sy] = g.renderer.toScreen(g.world, lab.home.x + dx, lab.home.y + dy);
      return { x: Math.max(0, Math.round(sx - w / 2)), y: Math.max(0, Math.round(sy - h / 2)), width: w, height: h };
    },
    tick(dt = 1 / 60) { OP.step(dt, dt); },
    wait(s) { OP.step(s, 1 / 60); },
  };
  window.LAB = lab;
  // stop the real-time main loop: frames only advance through LAB.tick / OP.step
  window.requestAnimationFrame = () => 0;
}

async function boot(page, race = 'human') {
  await page.evaluate(() => localStorage.clear());
  await waitReady(page);
  await page.evaluate((race) => window.OP.quickStart(race), race);
  await page.evaluate(() => window.OP.step(0.5));
  await page.evaluate(installLab);
  await page.evaluate(() => { window.LAB.findOpenGround(); window.LAB.arena(); });
  await page.evaluate(() => window.OP.step(0.2));
}

/** Compose captured PNG buffers into one labelled contact sheet. */
async function sheet(page, file, frames, cols = 6, title = '') {
  if (!frames.length) return;
  mkdirSync(outDir, { recursive: true });
  const p2 = await page.context().browser().newPage({ viewport: { width: 800, height: 600 } });
  const cells = frames.map((f) => `<figure><img src="data:image/png;base64,${f.buf.toString('base64')}"><figcaption>${f.label}</figcaption></figure>`).join('');
  await p2.setContent(`<html><body style="margin:0;background:#111;color:#eee;font:12px monospace">
    ${title ? `<div style="padding:4px 6px;font-size:14px">${title}</div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(${cols},auto);gap:2px;width:max-content">${cells}</div>
    <style>figure{margin:0}img{display:block}figcaption{padding:1px 4px}</style></body></html>`);
  await p2.waitForTimeout(50);
  const path = join(outDir, file);
  await p2.screenshot({ path, fullPage: true });
  await p2.close();
  console.log(`sheet → ${path}`);
}

async function grab(page, frames, label, clip) {
  frames.push({ label, buf: await page.screenshot({ clip }) });
}

/**
 * Run `start` in the page, then capture frames at the given times (seconds
 * after the start) while stepping the game at 60 fps.
 */
async function filmAt(page, frames, { start, times, label = '', clip, arg }) {
  await page.evaluate(start, arg);
  let t = 0;
  for (const at of times) {
    const n = Math.max(0, Math.round((at - t) * 60));
    if (n) await page.evaluate((n) => { for (let i = 0; i < n; i++) window.LAB.tick(1 / 60); }, n);
    t += n / 60;
    await grab(page, frames, `${label} ${t.toFixed(2)}s`, clip);
  }
}

const STYLE_SETUP = {
  brawler: {}, black_leg: {}, fishman_karate: {}, rokushiki: {}, okama_kenpo: {}, electro: {}, hasshoken: {}, ryusoken: {},
  ittoryu: { weapon: 'sword', count: 1 }, nitoryu: { weapon: 'sword', count: 2 }, santoryu: { weapon: 'sword', count: 3 },
  sniper: { weapon: 'gun', sling: true }, weather_science: { weapon: 'staff' }, elbaf: { weapon: 'axe' },
};

async function filmStyle(page, style, o = {}) {
  const setup = STYLE_SETUP[style] || {};
  const info = await page.evaluate(({ style, setup }) => {
    const L = window.LAB;
    L.arena(); L.equip({ style, ...setup });
    const ranged = style === 'sniper';
    const d = L.dummy(ranged ? 4.2 : 1.45, 0);
    L.aimAt(d.x, d.y);
    L.center(ranged ? 2 : 0.7, -0.6);
    const S = window.OP.game.player.style;
    const st = window.OP.game.player.constructor && window.OP.debug;
    void st;
    return { ranged, style: S };
  }, { style, setup });
  const clip = await page.evaluate(({ wide }) => window.LAB.clip(wide ? 560 : 360, 250, wide ? 2 : 0.7, -0.65), { wide: info.ranged });
  // M1 chain: hold the left button so the combo keeps going
  const m1 = [];
  const times = [];
  for (let t = 0; t < (o.m1Dur || 1.6); t += o.every || 1 / 15) times.push(t);
  await filmAt(page, m1, {
    label: 'm1', clip, times,
    start: () => { const L = window.LAB, p = window.OP.game.player; L.refill(); L.aimAt(L.target.x, L.target.y); p.combo.step = 0; p.combo.window = 0; window.OP.input.mouse.down = [true, false, false]; window.OP.input.mouse.pressed = [true, false, false]; },
  });
  await page.evaluate(() => { window.OP.input.mouse.down = [false, false, false]; window.LAB.wait(0.8); });
  await sheet(page, `combat-${style}-m1.png`, m1, 8, `${style}: M1 chain (hold LMB)`);
  const hv = [];
  await page.evaluate(() => { const L = window.LAB; L.arena(); L.target.x = L.home.x + (L.target.x - L.home.x); });
  await page.evaluate(({ style, setup }) => { const L = window.LAB; L.equip({ style, ...setup }); const ranged = style === 'sniper'; const d = L.dummy(ranged ? 4.2 : 1.45, 0); L.aimAt(d.x, d.y); L.center(ranged ? 2 : 0.7, -0.6); }, { style, setup });
  await filmAt(page, hv, {
    label: 'heavy', clip, times: [0, 0.08, 0.16, 0.24, 0.3, 0.36, 0.42, 0.5, 0.6, 0.72, 0.86, 1.0],
    start: () => { const L = window.LAB; L.refill(); L.aimAt(L.target.x, L.target.y); window.OP.input.mouse.pressed = [false, false, true]; },
  });
  await sheet(page, `combat-${style}-heavy.png`, hv, 6, `${style}: heavy (RMB)`);
}

/** Film techniques by id on the player (fruit or style), one row per technique. */
async function filmTechs(page, file, title, ids, setup) {
  const frames = [];
  for (const id of ids) {
    const info = techInfo(id);
    if (!info) { console.log('unknown technique', id); continue; }
    await page.evaluate(({ setup, info }) => {
      const L = window.LAB, g = window.OP.game;
      L.arena(); L.equip(setup);
      const d = L.dummy(info.ranged ? 4 : 1.6, 0, { hpMul: 400 });
      L.aimAt(d.x, d.y);
      L.center(info.ranged ? 2 : 0.8, -0.8);
      if (info.night) g.env.clock = 0;
    }, { setup, info });
    const clip = await page.evaluate(({ wide }) => window.LAB.clip(wide ? 620 : 420, 300, wide ? 2.2 : 0.8, -0.95), { wide: info.ranged });
    const w = info.w;
    const times = [Math.max(0, w * 0.55), w + 0.02, w + 0.1, w + 0.22, w + 0.4, w + 0.65].map((x) => Math.round(x * 60) / 60);
    await filmAt(page, frames, {
      label: id, clip, times, arg: id,
      start: (id) => { const L = window.LAB, g = window.OP.game, p = g.player; L.refill(); L.aimAt(L.target.x, L.target.y); const ok = p.tryTechnique(id, g, L.target); if (!ok) console.log('technique refused', id); },
    });
  }
  await sheet(page, file, frames, 6, title);
}

export const scenarios = {
  'combat-probe': {
    // debugging aid: node tools/shot.mjs combat-probe --js="return OP.game.player.x"
    async run(page, snap, args) {
      await boot(page);
      const out = await page.evaluate((src) => { const OP = window.OP; void OP; return new Function('OP', 'LAB', src)(window.OP, window.LAB); }, String(args.js || 'return LAB.home'));
      console.log('probe', JSON.stringify(out));
      await snap('probe');
    },
  },
  'combat-races': {
    async run(page, snap, args) {
      await boot(page);
      const races = (args.only ? String(args.only).split(',') : ['human', 'fishman', 'mink', 'skypiean', 'longarm', 'longleg', 'buccaneer', 'three_eye', 'lunarian']);
      const frames = [];
      for (const race of races) {
        await page.evaluate((race) => {
          const L = window.LAB, g = window.OP.game;
          L.arena();
          g.player.hidden = true;
          // three fighters: facing right (side), down (front) and up (back), each with a sparring dummy
          L.fighters = [
            L.spawn({ race, seed: 1, facing: 0 }, -3, 0),
            L.spawn({ race, seed: 2, facing: Math.PI / 2 }, 0.6, -1.2),
            L.spawn({ race, seed: 3, facing: -Math.PI / 2 }, 3.6, 0.8),
          ];
          L.dummy(-1.4, 0); L.dummy(0.6, 0.3); L.dummy(3.6, -0.7);
          L.center(0.3, -0.5);
        }, race);
        const clip = await page.evaluate(() => window.LAB.clip(760, 300, 0.3, -0.8));
        // jab then cross: capture the strike frame of each
        await filmAt(page, frames, {
          label: `${race} jab`, clip, times: [0.07],
          start: () => { const L = window.LAB, g = window.OP.game; for (const f of L.fighters) { f.combo.step = 0; f.combo.window = 0; f.tryM1(g); } },
        });
        await page.evaluate(() => { const L = window.LAB; for (let i = 0; i < 30; i++) L.tick(1 / 60); });
        await filmAt(page, frames, {
          label: `${race} cross`, clip, times: [0.08],
          start: () => { const L = window.LAB, g = window.OP.game; for (const f of L.fighters) f.tryM1(g); },
        });
      }
      await sheet(page, 'combat-races.png', frames, 2, 'Every race mid-punch (side / front / back views)');
    },
  },
  'combat-m1': {
    async run(page, snap, args) {
      await boot(page);
      await filmStyle(page, args.style || 'brawler');
    },
  },
  'combat-styles': {
    async run(page, snap, args) {
      await boot(page);
      const list = args.only ? String(args.only).split(',') : Object.keys(STYLE_SETUP);
      for (const s of list) await filmStyle(page, s, { m1Dur: 1.4, every: 1 / 12 });
    },
  },
  'combat-fruit': {
    async run(page, snap, args) {
      await boot(page);
      const fruit = args.fruit || 'mera';
      const ids = args.tech ? String(args.tech).split(',') : (FRUITS[fruit]?.techniques || []).map((t) => t.id);
      await filmTechs(page, `combat-fruit-${fruit}.png`, `${fruit} techniques`, ids, { style: 'brawler', fruit });
    },
  },
  'combat-fruits': {
    async run(page, snap, args) {
      await boot(page);
      const list = args.only ? String(args.only).split(',') : Object.keys(FRUITS);
      for (const fruit of list) {
        const ids = (FRUITS[fruit]?.techniques || []).map((t) => t.id);
        await filmTechs(page, `combat-fruit-${fruit}.png`, `${fruit} techniques`, ids, { style: 'brawler', fruit });
      }
    },
  },
  'combat-tech': {
    async run(page, snap, args) {
      await boot(page);
      const ids = String(args.ids || 'brawl_tackle').split(',');
      const style = args.style || 'brawler';
      await filmTechs(page, `combat-tech-${args.name || ids[0]}.png`, `techniques: ${ids.join(', ')}`, ids, { style, ...(STYLE_SETUP[style] || {}), fruit: args.fruit || null });
    },
  },
  'combat-hit': {
    async run(page, snap) {
      await boot(page);
      const frames = [];
      const clip = await page.evaluate(() => { const L = window.LAB; L.arena(); L.equip({ style: 'brawler' }); L.dummy(1.45, 0); L.center(0.7, -0.6); return L.clip(380, 260, 0.7, -0.75); });
      const setupDummy = (o) => page.evaluate((o) => { const L = window.LAB; L.arena(); L.equip({ style: o.style || 'brawler', ...(o.setup || {}) }); const d = L.dummy(1.45, 0, { style: o.dstyle || 'brawler' }); L.aimAt(d.x, d.y); L.center(0.7, -0.6); if (o.block) { d.setBlock(true); d.blockTime = o.fresh ? 0.05 : 1; d.facing = Math.PI; } if (o.crit) window.OP.game.player.critChance = 1; }, o);
      // 1) a normal jab, 2) a finisher, 3) a crit, 4) heavy, 5) blocked, 6) guard break, 7) parry
      const cases = [
        { name: 'jab', o: {}, start: () => { const g = window.OP.game, p = g.player; p.combo.step = 0; p.combo.window = 0; p.tryM1(g); }, times: [0.07, 0.1, 0.15, 0.25] },
        { name: 'crit', o: { crit: true }, start: () => { const g = window.OP.game, p = g.player; p.combo.step = 0; p.combo.window = 0; p.tryM1(g); }, times: [0.07, 0.1, 0.15, 0.3] },
        { name: 'heavy', o: {}, start: () => { const g = window.OP.game, p = g.player; p.tryHeavy(g); }, times: [0.2, 0.32, 0.36, 0.45, 0.6] },
        { name: 'blocked', o: { block: true }, start: () => { const g = window.OP.game, p = g.player; p.combo.step = 0; p.combo.window = 0; p.tryM1(g); }, times: [0.07, 0.1, 0.18] },
        { name: 'guard break', o: { block: true }, start: () => { const g = window.OP.game, p = g.player, d = window.LAB.target; d.stamina = 1; p.tryHeavy(g); }, times: [0.32, 0.36, 0.45, 0.6] },
        { name: 'parry', o: { block: true, fresh: true }, start: () => { const g = window.OP.game, p = g.player; p.combo.step = 0; p.combo.window = 0; p.tryM1(g); }, times: [0.07, 0.1, 0.2, 0.35] },
      ];
      for (const c of cases) {
        await setupDummy(c.o);
        await filmAt(page, frames, { label: c.name, clip, times: c.times, start: c.start });
      }
      await sheet(page, 'combat-hit.png', frames, 5, 'Hit feel: jab, crit, heavy, blocked, guard break, parry');
      // combo numbers: a full chain into a heavy
      const combo = [];
      await setupDummy({});
      await filmAt(page, combo, {
        label: 'combo', clip, times: [0.1, 0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.5],
        start: () => { const g = window.OP.game, p = g.player; p.combo.step = 0; p.combo.window = 0; window.OP.input.mouse.down = [true, false, false]; window.OP.input.mouse.pressed = [true, false, false]; },
      });
      await page.evaluate(() => { window.OP.input.mouse.down = [false, false, false]; });
      await sheet(page, 'combat-combo.png', combo, 8, 'Combo: rapid hits merge into one damage number');
    },
  },
  'combat-move': {
    async run(page, snap) {
      await boot(page);
      const frames = [];
      const clip = await page.evaluate(() => { const L = window.LAB; L.arena(); L.equip({ style: 'brawler' }); L.center(0.8, -0.6); return L.clip(460, 260, 0.8, -0.7); });
      // dodge
      await filmAt(page, frames, {
        label: 'dodge', clip, times: [0.03, 0.08, 0.13, 0.18, 0.24, 0.32],
        start: () => { const g = window.OP.game, p = g.player; p.facing = 0; p.dodgeCd = 0; p.tryDodge(g, 1, 0); },
      });
      // sprint
      await page.evaluate(() => { const L = window.LAB; L.arena(); L.equip({ style: 'brawler' }); const p = window.OP.game.player; p.x -= 2; L.center(0.8, -0.6); });
      await filmAt(page, frames, {
        label: 'sprint', clip, times: [0.2, 0.3, 0.4, 0.5],
        start: () => { window.OP.key('D', true); window.OP.key('Shift', true); },
      });
      await page.evaluate(() => { window.OP.key('D', false); window.OP.key('Shift', false); });
      // block (fresh = parry window, then held)
      await page.evaluate(() => { const L = window.LAB; L.arena(); L.equip({ style: 'brawler' }); L.center(0.8, -0.6); });
      await filmAt(page, frames, {
        label: 'block', clip, times: [0.05, 0.3],
        start: () => { const p = window.OP.game.player; p.facing = 0; window.OP.key('F', true); },
      });
      await page.evaluate(() => { window.OP.key('F', false); });
      // knockdown & get-up
      await page.evaluate(() => { const L = window.LAB; L.arena(); L.equip({ style: 'brawler' }); const d = L.dummy(1.45, 0); L.center(0.8, -0.6); window.LAB.victim = d; });
      await filmAt(page, frames, {
        label: 'knockdown', clip, times: [0.05, 0.15, 0.3, 0.5, 0.9],
        start: () => { const g = window.OP.game, d = window.LAB.victim; d.knock(5, 0); d.hp = 0; d.knockOut(g, g.player); },
      });
      await filmAt(page, frames, {
        label: 'get-up', clip, times: [0.05, 0.15, 0.25, 0.4, 0.6],
        start: () => { const d = window.LAB.victim; d.state = 'idle'; d.hp = d.d.maxHp * 0.5; },
      });
      await sheet(page, 'combat-move.png', frames, 6, 'Movement: dodge, sprint, block, knockdown, get-up');
    },
  },
};
