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
//   node tools/shot.mjs combat-3d [--mode=first|third] [--ids=a,b]   the same effects in the 3D view
//        (third person: --side=<radians> turns the camera off the line to the target, --dist=<m> brings it nearer;
//         --cam=<around>,<dist>,<height>[,<ahead>] sets it down beside the player instead; --times=a,b,c films techniques then)
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
  // heads drawn live: each new cached head bitmap costs seconds to rasterise under SwiftShader
  globalThis.CHARART_NOCACHE = true;
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
      p.hp = p.d.maxHp; p.state = 'idle'; p.action = null; p.hitstun = 0; p.iframes = 0; p.buffs = []; p.status = {}; p.cooldowns = {};
      p.armament = false; p.observation = false; p.blocking = false; p.dash = null; p.kb.x = 0; p.kb.y = 0; p.conquerorInfused = false;
      p.recalc();
      if (!lab.home) lab.findOpenGround();
      p.x = lab.home.x; p.y = lab.home.y;
      p.facing = 0;
      // the lab films the classic top-down view (unless --view3d asks otherwise)
      if (g.view3d && !lab.view3d) { if (g.settings) g.settings.view = 'classic'; g.view3d.setActive(false); }
      lab.studio();
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
      const good = new Set([16, 17, 18, 19, 32, 47]);
      const ok = (x, y) => good.has(w.type(x, y)) && w.walkable(x, y);
      const starts = [];
      const dawn = g.surface && g.surface.islands && g.surface.islands.find((i) => i.id === 'dawn_island');
      if (dawn && dawn.towns && dawn.towns[0] && dawn.towns[0].plaza) starts.push(dawn.towns[0].plaza);
      starts.push({ x: p.x, y: p.y });
      for (const st of starts) {
        let best = null, bestN = 0;
        for (let x = -70; x <= 70; x += 2) {
          for (let y = -70; y <= 70; y += 2) {
            const cx = Math.round(st.x + x), cy = Math.round(st.y + y);
            let n = 0;
            for (let dx = -8; dx <= 10; dx++) for (let dy = -4; dy <= 4; dy++) if (ok(cx + dx, cy + dy)) n++;
            if (n > bestN) { bestN = n; best = { x: cx + 0.5, y: cy + 0.5 }; }
          }
        }
        if (best && bestN >= 19 * 9 * 0.95) { lab.home = best; return best; }
      }
      lab.home = { x: p.x, y: p.y };
      return lab.home;
    },
    /** Studio mode: no props drawn (trees, houses...), clear skies. */
    studio() {
      const g = OP.game, w = g.world;
      if (w.objects && !w.objects.__lab) {
        const q = w.objects.query.bind(w.objects);
        w.objects.query = (x0, y0, x1, y1, out) => (lab.props ? q(x0, y0, x1, y1, out) : out || []);
        w.objects.__lab = true;
      }
      const env = g.env;
      env.storm = 0; env.stormTarget = 0; env.weatherTimer = 1e9; env.rain = 0; env.snow = 0; env.fog = 0;
      const ui = document.getElementById('ui');
      if (ui && !lab.hud) ui.style.visibility = 'hidden';
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
      a.hp = a.d.maxHp;
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
      p.haki = 999; p.cooldowns = {}; p.hp = p.d.maxHp;
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
  await page.evaluate(() => window.OP.step(0)); // show the freshly set-up scene
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
      if (args.post) console.log('post', JSON.stringify(await page.evaluate((src) => new Function('OP', 'LAB', src)(window.OP, window.LAB), String(args.post))));
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
          g.player.hidden = true; g.player.invulnerable = true; g.player.y += 8;
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
          label: `${race} jab`, clip, times: [0.065],
          start: () => { const L = window.LAB, g = window.OP.game; for (const f of L.fighters) { f.combo.step = 0; f.combo.window = 0; f.tryM1(g); } },
        });
        await page.evaluate(() => { const L = window.LAB; for (let i = 0; i < 30; i++) L.tick(1 / 60); });
        await filmAt(page, frames, {
          label: `${race} cross`, clip, times: [0.065],
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
        { name: 'guard break', o: { block: true }, start: () => { const g = window.OP.game, p = g.player, d = window.LAB.target; p.tryHeavy(g); }, times: [0.32, 0.36, 0.45, 0.6] },
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
  'combat-3d': {
    // effects projected through the 3D camera: M1 chain, heavy, a few techniques
    async run(page, snap, args) {
      await boot(page);
      const mode = args.mode === 'third' ? 'third' : 'first';
      const side = mode === 'third' ? Number(args.side || 0) : 0, dist = Number(args.dist || 0);
      await page.evaluate(({ mode, side, dist, cam }) => {
        const L = window.LAB, g = window.OP.game;
        L.view3d = true;
        L.arena();
        if (g.settings) g.settings.view = mode;
        g.view3d.setMode(mode); g.view3d.setActive(true);
        if (dist) g.view3d.rig.tp.dist = dist;
        // (a camera turned off the line to the target — or set down beside the
        // player — still has them aim at it: a move tracks the aim through its
        // wind-up, and the aim is where the middle of the view meets the world)
        if (side || cam) {
          const toWorld = g.renderer.toWorld.bind(g.renderer);
          g.renderer.toWorld = (w, x, y) => (L.target && L.target.alive !== false ? [L.target.x, L.target.y - 0.5] : toWorld(w, x, y));
        }
        // updates only between captures: a 3D frame costs a lot under SwiftShader
        L.run = (n) => { for (let i = 0; i < n; i++) g.update(1 / 60); g.render(); };
        L.look = () => {
          const p = g.player, d = L.target, v = g.view3d;
          const a = Math.atan2(d.y - p.y, g.world.dx(p.x, d.x));
          v.rig.yaw = (a + side + Math.PI * 2) % (Math.PI * 2); v.rig.pitch = mode === 'first' ? -0.12 : -0.05;
          p.facing = a;
          window.OP.input.mouse.x = window.innerWidth / 2; window.OP.input.mouse.y = window.innerHeight / 2;
        };
        for (let i = 0; i < 6; i++) L.run(4);
      }, { mode, side, dist, cam: !!args.cam });
      const clip = { x: 0, y: 0, width: 1280, height: 720 };
      // --cam=<around>,<dist>,<height>[,<ahead>]: a camera set down beside the
      // player, looking at a point <ahead> m in front of them (1.5)
      // (around: radians off the way they face; π/2 is square side-on)
      const cam = args.cam ? String(args.cam).split(',').map(Number) : null;
      const place = () => page.evaluate((cam) => {
        if (!cam) return;
        const g = window.OP.game, p = g.player, rig = g.view3d.rig;
        const gh = g.view3d.ground ? g.view3d.ground(p.x, p.y) : 0;
        const a = p.facing + cam[0], d = cam[1], h = cam[2];
        // (looking at a point a little ahead of them, where the blow goes)
        const ahead = cam[3] ?? 1.5, ax = p.x + Math.cos(p.facing) * ahead, ay = p.y + Math.sin(p.facing) * ahead;
        rig.shot = { from: [ax + Math.cos(a) * d, ay + Math.sin(a) * d, gh + h], at: [ax, ay, gh + 1.3] };
      }, cam);
      const film = async (frames, label, setup, start, times) => {
        await page.evaluate(setup);
        await page.evaluate(() => { window.LAB.look(); window.LAB.run(1); });
        await place();
        await page.evaluate(start);
        let t = 0;
        for (const at of times) {
          const n = Math.max(0, Math.round((at - t) * 60));
          await page.evaluate((n) => window.LAB.run(n), n);
          t += n / 60;
          if (args.verbose) {
            console.log(label, t.toFixed(2), JSON.stringify(await page.evaluate(() => {
              const g = window.OP.game, p = g.player, v = g.view3d.actorViews && g.view3d.actorViews.get(p), rig = v && v.model && v.model.rig;
              const d = window.LAB.target, q = g.combat.projectiles.find((q) => q.stretch === p);
              return { proj: q ? [+q.x.toFixed(2), +q.y.toFixed(2), +(g.view3d.projY ? g.view3d.projY(q) : 0).toFixed(2)] : 0, me: [+p.x.toFixed(2), +p.y.toFixed(2), +p.facing.toFixed(2)], tgt: d ? [+d.x.toFixed(2), +d.y.toFixed(2), Math.round(d.hp)] : null, rub: rig ? [rig.rubOn[0], +(rig.rubLen[0] || 0).toFixed(2)] : null, act: p.action && p.action.def && p.action.def.id };
            })));
          }
          frames.push({ label: `${label} ${t.toFixed(2)}s`, buf: await page.screenshot({ clip, scale: 'css' }) });
        }
      };
      const frames = [];
      const brawler = () => { const L = window.LAB; L.arena(); L.equip({ style: 'brawler' }); L.dummy(1.9, 0, { hpMul: 400 }); };
      const m1 = () => { const g = window.OP.game, p = g.player; p.combo.step = 0; p.combo.window = 0; window.OP.input.mouse.down = [true, false, false]; window.OP.input.mouse.pressed = [true, false, false]; };
      await film(frames, 'm1', brawler, m1, [0.05, 0.08, 0.3, 0.55, 0.62, 0.95, 1.05]);
      await page.evaluate(() => { window.OP.input.mouse.down = [false, false, false]; });
      await film(frames, 'heavy', brawler, () => { const g = window.OP.game; g.player.tryHeavy(g); }, [0.3, 0.36, 0.5]);
      const swords = () => { const L = window.LAB; L.arena(); L.equip({ style: 'santoryu', weapon: 'sword', count: 3 }); L.dummy(1.9, 0, { hpMul: 400 }); };
      await film(frames, 'santoryu m1', swords, m1, [0.08, 0.14, 0.4]);
      await page.evaluate(() => { window.OP.input.mouse.down = [false, false, false]; });
      await sheet(page, `combat-3d-${mode}-basics.png`, frames, 3, `3D (${mode}): brawler M1s, heavy, Santoryu`);
      // techniques, filmed from a few steps back so area effects fit the view
      const ids = String(args.ids || 'mera_hiken,gomu_pistol,gura_kaishin,goro_elthor,ope_room,pika_yasakani,hie_ageand,suna_sables').split(',');
      const tf = [];
      for (const id of ids) {
        const info = techInfo(id);
        if (!info) { console.log('unknown technique', id); continue; }
        const src = (await import('../src/game/abilities.js')).getAbility(id).source || '';
        const fruit = src.startsWith('fruit:') ? src.slice(6) : null;
        const w = info.w;
        await film(tf, id, `(() => { const L = window.LAB; L.arena(); L.equip({ fruit: ${JSON.stringify(fruit)}, style: 'brawler' }); L.dummy(${info.ranged ? 5 : 2.2}, 0, { hpMul: 400 }); })()`,
          `(() => { const L = window.LAB, g = window.OP.game; L.refill(); if (!g.player.tryTechnique(${JSON.stringify(id)}, g, L.target)) console.log('technique refused ${id}'); })()`,
          (args.times ? String(args.times).split(',').map(Number) : [w * 0.6, w + 0.05, w + 0.2, w + 0.45]).map((x) => Math.round(x * 60) / 60));
      }
      await sheet(page, `combat-3d-${mode}-techs.png`, tf, 4, `3D (${mode}): techniques`);
    },
  },
};

// (the lab, for the other combat films: scenarios-haki.mjs)
export { installLab, boot, sheet };
