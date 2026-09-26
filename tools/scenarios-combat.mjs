// Combat / animation scenarios for tools/shot.mjs. They build a small arena
// (player + training dummy), trigger attacks with a fixed time step and
// compose the captured frames into contact sheets in shots/.
//
//   node tools/shot.mjs combat-m1 --style=santoryu        M1 chain + heavy of one style
//   node tools/shot.mjs combat-styles [--only=a,b]         every style's chain + heavy
//   node tools/shot.mjs combat-fruit --fruit=mera [--tech=mera_entei]
//   node tools/shot.mjs combat-fruits [--only=mera,hie]   every fruit technique
//   node tools/shot.mjs combat-hit                        hit feel: sparks, crit, guard break, parry
//   node tools/shot.mjs combat-move                       dodge, sprint, block, knockdown
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'shots');

const waitReady = (page) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 180000, polling: 250 });

/** In-page helpers (serialised into the page). */
function installLab() {
  const OP = window.OP;
  const lab = {
    arena() {
      const g = OP.game, p = g.player;
      g.env.clock = 12.5;
      for (const a of g.actors) if (a !== p) a.alive = false;
      g.actors = g.actors.filter((a) => a === p);
      g.combat.hitboxes.length = 0; g.combat.projectiles.length = 0;
      g.fx.parts.length = 0; g.fx.shapes.length = 0; g.fx.texts.length = 0;
      if (g.fx.reset) g.fx.reset();
      g.areaZones.length = 0;
      g.spawner.update = () => {};
      p.hp = p.d.maxHp; p.stamina = p.d.maxStamina; p.state = 'idle'; p.action = null; p.hitstun = 0; p.iframes = 0; p.buffs = []; p.status = {}; p.cooldowns = {};
      p.armament = false; p.observation = false; p.blocking = false; p.dash = null; p.kb.x = 0; p.kb.y = 0;
      p.recalc();
      if (lab.home) { p.x = lab.home.x; p.y = lab.home.y; }
      else lab.home = { x: p.x, y: p.y };
      p.facing = 0;
      g.zoomBias = lab.zoom || 1.5;
      g.snapCamera();
      g.fx.trauma = 0; g.fx.hitstop = 0;
    },
    findOpenGround() {
      // walk around the spawn looking for a 12x6 patch of walkable ground
      const g = OP.game, p = g.player, w = g.world;
      const ok = (x, y) => p.canOccupy(w, x, y) && !w.isBlocked(x, y);
      for (let r = 0; r < 60; r += 2) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const cx = p.x + Math.cos(a) * r, cy = p.y + Math.sin(a) * r;
          let good = true;
          for (let dx = -5; dx <= 9 && good; dx += 1) for (let dy = -3; dy <= 3 && good; dy += 1) if (!ok(cx + dx, cy + dy)) good = false;
          if (good) { lab.home = { x: cx, y: cy }; return lab.home; }
        }
      }
      lab.home = { x: p.x, y: p.y };
      return lab.home;
    },
    equip(o = {}) {
      const g = OP.game, p = g.player;
      p.style = o.style || 'brawler';
      const kind = o.weapon || null;
      p.weapon = kind ? { kind, power: 1.2, count: o.count || 1 } : null;
      p.look = { ...p.look, swords: kind === 'sword' ? (o.count || 1) : 0, weapon: kind };
      p.fruit = o.fruit || null;
      p.fruitMastery = o.fruit ? 100 : 0;
      p.masteries = { ...(p.masteries || {}), [p.style]: 100 };
      p.hakiSkill = { armament: 60, observation: 60, conqueror: 60 };
      p.recalc();
      p.haki = 999;
    },
    dummy(dx = 1.6, dy = 0, o = {}) {
      const g = OP.game, p = g.player;
      const { makeNPC } = OP.debug;
      const d = makeNPC({ name: o.name || 'Dummy', faction: 'pirate', level: 20, hpMul: 60, ai: 'idle', look: { top: '#8d6e63', bottom: '#5d4037', hair: 'short', hairColor: '#3e2723', ...(o.look || {}) }, style: o.style || 'brawler', weapon: o.weapon }, p.x + dx, p.y + dy);
      d.game = g; g.addActor(d);
      d.provoked = true; d.facing = Math.atan2(-dy, -dx);
      d.hp = d.d.maxHp;
      if (o.passive !== false) d.controller = null;
      lab.target = d;
      return d;
    },
    aimAt(x, y) {
      const g = OP.game;
      const [sx, sy] = g.renderer.toScreen(g.world, x, y - 0.5);
      OP.input.mouse.x = sx; OP.input.mouse.y = sy;
      const p = g.player;
      p.facing = Math.atan2(y - p.y, g.world.dx(p.x, x));
    },
    refill() {
      const p = OP.game.player;
      p.stamina = p.d.maxStamina; p.haki = 999; p.cooldowns = {}; p.hp = p.d.maxHp;
      if (lab.target) lab.target.hp = lab.target.d.maxHp;
    },
    clip(w = 360, h = 260, dx = 0.8, dy = -0.8) {
      const g = OP.game, p = g.player;
      const [sx, sy] = g.renderer.toScreen(g.world, p.x + dx, p.y + dy);
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
  const c = clip || await page.evaluate(() => window.LAB.clip());
  frames.push({ label, buf: await page.screenshot({ clip: c }) });
}

/** Run an action and capture a frame every `every` seconds for `dur` seconds. */
async function film(page, frames, { start, dur = 0.5, every = 1 / 30, label = '', clip, dt = 1 / 60, maxFrames = 18 }) {
  const c = clip || await page.evaluate(() => window.LAB.clip());
  await page.evaluate(start);
  let t = 0, next = 0, n = 0;
  while (t < dur - 1e-6 && n < maxFrames) {
    if (t >= next - 1e-6) {
      await grab(page, frames, `${label} ${t.toFixed(2)}s`, c);
      next += every; n++;
    }
    await page.evaluate((dt) => window.LAB.tick(dt), dt);
    t += dt;
  }
}

const STYLE_SETUP = {
  brawler: {}, black_leg: {}, fishman_karate: {}, rokushiki: {}, okama_kenpo: {}, electro: {}, hasshoken: {}, ryusoken: {},
  ittoryu: { weapon: 'sword', count: 1 }, nitoryu: { weapon: 'sword', count: 2 }, santoryu: { weapon: 'sword', count: 3 },
  sniper: { weapon: 'gun' }, weather_science: { weapon: 'staff' }, elbaf: { weapon: 'axe' },
};

async function filmStyle(page, style, o = {}) {
  const frames = [];
  const setup = STYLE_SETUP[style] || {};
  const chain = await page.evaluate(({ style, setup }) => {
    const L = window.LAB;
    L.arena(); L.equip({ style, ...setup });
    const ranged = style === 'sniper';
    const d = L.dummy(ranged ? 4.5 : 1.5, 0);
    L.aimAt(d.x, d.y);
    const S = window.OP.game.player.style;
    return { ranged, n: (window.__styles?.[S]?.m1Ids || []).length };
  }, { style, setup });
  void chain;
  const clipW = o.wide ? 520 : 340;
  const clip = await page.evaluate(({ w, wide }) => window.LAB.clip(w, 250, wide ? 2.4 : 0.75, -0.75), { w: clipW, wide: !!o.wide });
  // M1 chain: hold the left button so the combo keeps going
  await film(page, frames, {
    label: 'm1', clip, dur: o.m1Dur || 1.9, every: o.every || 1 / 20, maxFrames: 40,
    start: () => { const L = window.LAB, p = window.OP.game.player; L.refill(); L.aimAt(L.target.x, L.target.y); p.combo.step = 0; p.combo.window = 0; window.OP.input.mouse.down = [true, false, false]; window.OP.input.mouse.pressed = [true, false, false]; },
  });
  await page.evaluate(() => { window.OP.input.mouse.down = [false, false, false]; });
  await sheet(page, `combat-${style}-m1.png`, frames, 8, `${style}: M1 chain`);
  const hv = [];
  await page.evaluate(() => window.LAB.wait(0.6));
  await film(page, hv, {
    label: 'heavy', clip, dur: 0.9, every: 1 / 20, maxFrames: 18,
    start: () => { const L = window.LAB; L.refill(); L.aimAt(L.target.x, L.target.y); window.OP.input.mouse.pressed = [false, false, true]; },
  });
  await sheet(page, `combat-${style}-heavy.png`, hv, 6, `${style}: heavy`);
}

export const scenarios = {
  'combat-m1': {
    async run(page, snap, args) {
      await boot(page);
      const style = args.style || 'brawler';
      await filmStyle(page, style, { wide: style === 'sniper' });
    },
  },
};
