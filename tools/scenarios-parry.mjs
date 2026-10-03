// The guard, filmed: a foe's jab and its yellow glint, a parry on the cue,
// the reel and the counter; a perfect parry; a guard-breaking blow's red
// glint and the guard it smashes; the same blow slipped by a perfect dodge;
// breaking free of a flurry. On open ground on Dawn Island (the Blues: the
// gentlest sea, every cue at its plainest), through the real controller (F
// and Q pressed as a player would), a frame per moment, on one sheet.
//
//   node tools/shot.mjs combat-parry [--mode=third|first]
//     → shots/combat-parry-<mode>.png (+ each frame: combat-parry-<mode>-NN.png)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'shots');

async function sheet(page, file, frames, cols, title) {
  mkdirSync(outDir, { recursive: true });
  const p2 = await page.context().browser().newPage({ viewport: { width: 800, height: 600 } });
  const cells = frames.map((f) => `<figure><img src="data:image/png;base64,${f.buf.toString('base64')}"><figcaption>${f.label}</figcaption></figure>`).join('');
  await p2.setContent(`<html><body style="margin:0;background:#111;color:#eee;font:13px monospace"><div style="padding:4px 6px;font-size:15px">${title}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},auto);gap:3px;width:max-content">${cells}</div>
    <style>figure{margin:0}img{display:block;width:640px}figcaption{padding:1px 4px}</style></body></html>`);
  await p2.waitForTimeout(80);
  const path = join(outDir, file);
  await p2.screenshot({ path, fullPage: true });
  await p2.close();
  console.log(`sheet → ${path}`);
}

/** In-page set-up (serialised into the page): the arena, a foe, the camera, stepping helpers. */
function install(mode) {
  const OP = window.OP, g = OP.game, p = g.player, w = g.world;
  globalThis.CHARART_NOCACHE = true;
  // (the live loop stops: frames only advance through LAB.run / LAB.until)
  window.requestAnimationFrame = () => 0;
  g.spawner.update = () => {};
  const env = g.env;
  env.clock = 12.5; env.storm = 0; env.stormTarget = 0; env.weatherTimer = 1e9; env.rain = 0; env.snow = 0; env.fog = 0;
  // the most open patch of grass near Dawn Island's town
  const dawn = g.surface.islands.find((i) => i.id === 'dawn_island');
  const good = new Set([16, 17, 18, 19, 32, 47]);
  const ok = (x, y) => good.has(w.type(x, y)) && w.walkable(x, y) && !w.hitsProp(x, y, 0.6);
  const st = dawn.towns[0].plaza;
  let best = null, bestN = 0;
  for (let x = -60; x <= 60; x += 2) for (let y = -60; y <= 60; y += 2) {
    const cx = Math.round(st.x + x), cy = Math.round(st.y + y);
    let n = 0;
    for (let dx = -6; dx <= 6; dx++) for (let dy = -4; dy <= 4; dy++) if (ok(cx + dx, cy + dy)) n++;
    if (n > bestN) { bestN = n; best = { x: cx + 0.5, y: cy + 0.5 }; }
  }
  const L = window.LAB = { home: best, mode };
  L.reset = () => {
    for (const a of g.actors) if (a !== p) a.alive = false;
    g.actors = g.actors.filter((a) => a === p);
    g.combat.hitboxes.length = 0; g.combat.projectiles.length = 0;
    g.fx.reset();
    p.hp = p.d.maxHp; p.state = 'idle'; p.action = null; p.hitstun = 0; p.iframes = 0; p.status = {}; p.cooldowns = {}; p.dodgeCd = 0;
    p.blocking = false; p.dash = null; p.kb.x = 0; p.kb.y = 0; p.guardCd = 0; p.counterOn = null; p.counterLeft = 0;
    p.x = L.home.x; p.y = L.home.y; p.facing = 0;
    g.slowmo = 1; g.fx.hitstop = 0;
    for (const k of ['F', 'Q']) OP.key(k, false);
  };
  /** A foe a step east, squared up to you (its moves are started by hand: no AI). */
  L.foe = (o = {}) => {
    const def = { name: o.name || 'Bandit', faction: 'bandit', level: o.level || 6, hpMul: 6, style: 'brawler', look: { top: '#6d4c41', hat: 'bandana', hatColor: '#8d6e63' }, id: 'lab_' + (o.name || 'bandit') };
    const a = OP.debug.makeNPC(def, p.x + 1.5, p.y);
    a.game = g; g.addActor(a);
    a.provoked = true; a.facing = Math.PI; a.cooldowns = {};
    a.controller = { target: p, update() {}, onHurt() {} };
    L.target = a;
    return a;
  };
  if (g.settings) g.settings.view = mode;
  g.view3d.setMode(mode); g.view3d.setActive(true);
  /** Face the foe and look at them: a little from the side and above in third person, straight on in first. */
  L.look = () => {
    const d = L.target;
    if (!d) return;
    const a = Math.atan2(d.y - p.y, w.dx(p.x, d.x));
    p.facing = a;
    const v = g.view3d;
    v.rig.yaw = (a + (mode === 'first' ? 0 : 0.45) + Math.PI * 2) % (Math.PI * 2); v.rig.pitch = mode === 'first' ? 0 : -0.18;
    OP.input.mouse.x = window.innerWidth / 2; OP.input.mouse.y = window.innerHeight / 2;
  };
  L.run = (n) => { for (let i = 0; i < n; i++) g.update(1 / 60); g.render(); };
  /** Step frames (drawing only at the end) until `cond()` holds. */
  L.until = (cond, max = 600) => { let i = 0; for (; i < max && !cond(); i++) g.update(1 / 60); g.render(); return i; };
  /** Game seconds until the foe's blow lands. */
  L.left = () => { const a = L.target.action; if (!a || a.hitAt === undefined) return null; return Math.max(0, a.hitAt - a.t) * (a.t < a.hitAt ? a.slow : 1) / L.target.atkSpeed(); };
  L.reset();
  for (let i = 0; i < 8; i++) L.run(4);
}

export const scenarios = {
  'combat-parry': {
    async run(page, snap, args) {
      const mode = args.mode === 'first' ? 'first' : 'third';
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => window.OP.quickStart('human'));
      await page.evaluate(() => window.OP.step(0.5));
      await page.evaluate(install, mode);
      const frames = [];
      // (a moment waited for that never came is said so, on the frame and in the log)
      let missed = '';
      // (drawn once more just before each frame is taken: under SwiftShader a
      // frame drawn after a long gap can come back with an older overlay)
      const shot = async (label) => {
        await page.evaluate(() => window.OP.game.render());
        frames.push({ label: label + missed, buf: await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 }, scale: 'css', timeout: 180000 }) });
        console.log('frame', label + missed);
        missed = '';
      };
      const until = async (src, max = 600) => {
        const n = await page.evaluate(({ src, max }) => window.LAB.until(new Function('L', 'g', 'p', `return (${src})`).bind(null, window.LAB, window.OP.game, window.OP.game.player), max), { src, max });
        if (n >= max) { missed = ` [MISSED: ${src}]`; console.log(`[warning] never came: ${src}`); }
        return n;
      };
      const run = (n) => page.evaluate((n) => window.LAB.run(n), n);
      const key = (k, down) => page.evaluate(({ k, down }) => window.OP.key(k, down), { k, down });
      const jab = () => page.evaluate(() => { const L = window.LAB; L.reset(); L.foe(); L.look(); L.run(30); L.target.combo.step = 0; L.target.combo.window = 0; L.target.tryM1(window.OP.game); });
      const mace = () => page.evaluate(() => { const L = window.LAB, g = window.OP.game; L.reset(); const f = L.foe({ name: 'Alvida' }); L.look(); L.run(30); f.tryTechnique('alvida_mace', g, g.player); });
      // a jab: its glint (the first of a life comes in slow motion, with the hint), a parry on the cue, the reel, a counter
      await jab();
      await until('L.target.action && L.target.action.cued');
      await run(3);
      await shot('yellow glint (the first: slow motion + hint)');
      await until('L.left() !== null && L.left() <= 0.1');
      await key('F', true);
      await until('p.parryT > -Infinity', 60);
      await shot('PARRY (F 0.1 s before the blow)');
      await run(8);
      await shot('the foe reels; the counter is on');
      // (F let go, the guard comes down on the next frame; then the heavy, as
      // the controller's buffer would start it)
      await key('F', false);
      await page.evaluate(() => { const g = window.OP.game, L = window.LAB; L.run(1); L.look(); g.player.tryHeavy(g); });
      await until('p.counterT > -Infinity', 90);
      await run(2);
      await shot('COUNTER (a heavy while they reel)');
      await run(14);
      await shot('after the counter');
      // a perfect parry
      await jab();
      await until('L.left() !== null && L.left() <= 0.04');
      await key('F', true);
      await until('p.parryPerfect && p.parryT > g.env.time - 0.1', 60);
      await run(1);
      await shot('PERFECT PARRY (F 0.04 s before)');
      await run(12);
      await shot('perfect: a beat of slow motion');
      await key('F', false);
      // a guard-breaking blow: the red glint, a guard held anyway, smashed
      await mace();
      await key('F', true);
      await until('L.target.action && L.target.action.cued');
      await run(3);
      await shot('red glint: a guard-breaking blow');
      await until('p.guardBrokenT > -Infinity', 240);
      await run(2);
      await shot('GUARD BREAK (it was blocked)');
      await run(14);
      await shot('guard broken, staggered');
      await key('F', false);
      // the same blow slipped at the last instant
      await mace();
      await until('L.left() !== null && L.left() <= 0.06');
      await page.evaluate(() => { const g = window.OP.game; g.player.tryDodge(g, 0, 1); });
      await until('p.counterOn === L.target', 40);
      await run(2);
      await shot('PERFECT DODGE (Q 0.06 s before)');
      // a flurry: shaken free after three blows in the Blues
      await page.evaluate(() => { const L = window.LAB; L.reset(); L.foe(); L.look(); L.run(20); });
      let free = false;
      for (let k = 0; k < 6 && !free; k++) {
        await page.evaluate(() => { const g = window.OP.game, f = window.LAB.target; g.combat.applyHit(f, g.player, { owner: f, x: f.x, y: f.y - 0.4, shape: 'arc', range: 2, arc: 1.8, angle: Math.PI, damage: 6, knockback: 1, stun: 0.6 }); });
        await run(8);
        free = await page.evaluate(() => window.OP.game.player.iframes > 0.2);
      }
      if (!free) { missed = ' [MISSED: never shaken free]'; console.log('[warning] never shaken free of the flurry'); }
      await shot('BREAK FREE after a flurry');
      await sheet(page, `combat-parry-${mode}.png`, frames, 2, `The guard (${mode} view): parry, counter, perfect parry, guard break, perfect dodge, breaking free`);
      frames.forEach((f, i) => writeFileSync(join(outDir, `combat-parry-${mode}-${String(i + 1).padStart(2, '0')}.png`), f.buf));
      void snap;
    },
  },
};
