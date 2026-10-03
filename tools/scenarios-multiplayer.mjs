// Multiplayer: two pages of the one browser on a voyage together, over the
// local transport (?net=local, a BroadcastChannel: a sandbox may not reach
// the public relays). Page A makes a pirate, goes back to the title and hosts
// a voyage from the Multiplayer tab; page B makes another and joins with the
// code from A's lobby. Then: each sees the other (name, look), B walks and A
// sees B glide along the same path a moment later (no jumps), chat both ways,
// B sails and A sees B's ship (and B at her helm), A's clock and weather
// reach B, B leaves and rejoins with the remembered code, a code nobody hosts
// is reported as such, and the host leaving ends the voyage for B.
//
//   node tools/shot.mjs mp [--page=shots/xmp/index.html] [--upto=menu|avatars|chat|ship|env|leave]
//
// (Screenshots of A come out as mp-A-NN-*.png, of B as mp-B-NN-*.png, in shots/.)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const waitReady = (pg) => pg.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 300000, polling: 250 });
const frames = (pg, n = 3) => pg.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = (pg, fn, arg, timeout = 60000) => pg.waitForFunction(fn, arg, { timeout, polling: 100 });
const STAGES = ['menu', 'avatars', 'chat', 'ship', 'env', 'leave'];

/** A pirate in lineage `slot`, saved, and back at the title. */
async function makePirate(pg, slot, race, name) {
  await pg.evaluate(({ slot, race, name }) => {
    window.OP.quickStart(race, { slot, name });
    window.OP.debug.persist();
    window.OP.voyage.toTitle();
  }, { slot, race, name });
  await pg.waitForSelector('.mode-tabs', { timeout: 60000 });
}

/** Quiet, fast settings for a software-rendered page: the low preset, third person, no hints. */
const quiet = (pg) => pg.evaluate(() => {
  const g = window.OP.game;
  g.settings.quality = 'low'; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings();
  const st = document.createElement('style');
  st.textContent = '.look-hint,.hint{display:none!important}';
  document.head.appendChild(st);
});

export const scenarios = {
  mp: {
    query: '?debug=1&net=local',
    async run(page, _snap, args) {
      const upto = STAGES.indexOf(args.upto || 'leave');
      const at = (s) => STAGES.indexOf(s) <= upto;
      const errors = [];
      const t0 = Date.now();
      const say = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
      const vp = { width: Number(args.w || 960), height: Number(args.h || 540) };
      // (two pages that talk must share a browser context: the harness's own page sits this one out)
      const url = page.url(), browser = page.context().browser();
      await page.close();
      const ctx = await browser.newContext({ viewport: vp });
      const pageA = await ctx.newPage(), pageB = await ctx.newPage();
      const shots = { A: 0, B: 0 };
      for (const [tag, pg] of [['A', pageA], ['B', pageB]]) {
        pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${tag} ${m.type()}] ${m.text()}`); if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
        pg.on('pageerror', (e) => { console.log(`[${tag} pageerror] ${e.stack || e.message}`); errors.push(`${tag}: ${e.message}`); });
      }
      const shot = async (tag, pg, label) => { const file = join(root, 'shots', `mp-${tag}-${String(++shots[tag]).padStart(2, '0')}-${label}.png`); await pg.screenshot({ path: file, timeout: 180000 }); console.log(`shot → ${file}`); };
      const snap = (label) => shot('A', pageA, label), snapB = (label) => shot('B', pageB, label);
      await pageA.goto(url);
      await pageB.goto(url);
      await Promise.all([waitReady(pageA), waitReady(pageB)]);
      say('both pages ready');
      await quiet(pageA); await quiet(pageB);
      // the same world in both: every island where it is, and the towns, trees and props round Dawn Island
      const world = (pg) => pg.evaluate(() => {
        const w = window.OP.world;
        let h = 2166136261;
        const add = (s) => { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; };
        for (const i of w.islands) add(`${i.id}:${i.x.toFixed(2)}:${i.y.toFixed(2)}:${(i.radius || 0).toFixed(2)};`);
        const d = w.islands.find((i) => i.id === 'dawn_island');
        const objs = w.objects.query(d.x - 400, d.y - 400, d.x + 400, d.y + 400);
        for (const o of objs) add(`${o.kind}:${o.x.toFixed(2)}:${o.y.toFixed(2)};`);
        return { islands: w.islands.length, objectsNearDawn: objs.length, hash: h.toString(36) };
      });
      const wA = await world(pageA), wB = await world(pageB);
      console.log('world A', JSON.stringify(wA), 'world B', JSON.stringify(wB), wA.hash === wB.hash ? 'SAME' : 'DIFFERENT');

      // ---------------------------------------------------------------- menu
      await makePirate(pageA, 1, 'human', 'Rin Stormwell');
      await makePirate(pageB, 2, 'mink', 'Kaito Kurogane');
      say('pirates made; both at the title');
      // (singleplayer is untouched: no voyage, the slots as ever)
      console.log('before', JSON.stringify(await pageA.evaluate(() => ({ net: window.OP.net, slots: document.querySelectorAll('.slot-card').length }))));
      await pageA.click('.mode-tabs button:has-text("Multiplayer")');
      await frames(pageA, 2);
      await snap('title-multiplayer');
      await pageA.click('.vy-slot:has-text("Rin Stormwell") button:has-text("Host")');
      await pageA.waitForSelector('.vy-lobby .code-letters', { timeout: 30000 });
      const code = await pageA.evaluate(() => window.OP.net.code);
      await until(pageA, () => window.OP.net?.status === 'open');
      say('hosting with code', code);
      await pageB.click('.mode-tabs button:has-text("Multiplayer")');
      // (typed the way people do: lower case, with a dash)
      await pageB.fill('.code-in', `${code.slice(0, 3).toLowerCase()}-${code.slice(3)}`);
      await pageB.click('.code-row button:has-text("Join")');
      await pageB.waitForSelector('.vy-lobby h2:has-text("Aboard")', { timeout: 30000 });
      say('B is aboard; picking a pirate');
      const pick = await pageB.evaluate(() => ({
        title: document.querySelector('.vy-lobby h2').textContent,
        head: document.querySelector('.vy-lobby p.muted').textContent,
        busy1: document.querySelector('button[data-slot="1"]')?.disabled,
        btn2: document.querySelector('button[data-slot="2"]')?.textContent,
      }));
      console.log('join pick', JSON.stringify(pick));
      await until(pageA, () => document.querySelectorAll('.vy-mate').length === 2);
      await frames(pageA, 2);
      await snap('lobby-with-guest');
      await snapB('join-pick');
      if (!at('avatars')) return finish();

      // ---------------------------------------------------------------- avatars
      await pageA.click('.vy-lobby button:has-text("Set sail")');
      await pageB.click('button[data-slot="2"]');
      await Promise.all([until(pageA, () => !!window.OP.game.player, null, 120000), until(pageB, () => !!window.OP.game.player, null, 120000)]);
      await until(pageA, () => window.OP.net?.avatars.length === 1, null, 30000);
      await until(pageB, () => window.OP.net?.avatars.length === 1, null, 30000);
      say('both in the world, each drawing the other');
      // B comes over to A (a few metres east of them, on their ground)
      const posA = await pageA.evaluate(() => ({ x: window.OP.game.player.x, y: window.OP.game.player.y, isl: window.OP.game.currentIsland?.name }));
      const spot = await pageB.evaluate(({ x, y }) => {
        const w = window.OP.world;
        for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2.5, 2.5], [-2.5, -2.5], [4, 1], [-4, -1]]) {
          if (w.walkable(x + dx, y + dy) && !w.isBlocked(x + dx, y + dy)) { window.OP.teleport(x + dx, y + dy); return { x: x + dx, y: y + dy }; }
        }
        window.OP.teleport(x + 2, y);
        return { x: x + 2, y };
      }, posA);
      console.log('A at', JSON.stringify(posA), 'B to', JSON.stringify(spot));
      // (a leap across the world: drawn there once the state from after it comes round, never slid there)
      await until(pageA, ({ x, y }) => { const a = window.OP.net.avatars[0]; return a && Math.hypot(a.x - x, a.y - y) < 0.5; }, spot, 60000);
      const seen = await pageA.evaluate(() => {
        const a = window.OP.net.avatars[0], r = [...window.OP.net.remotes.values()][0];
        return { name: a.name, race: a.look.race, kind: a.look.kind, x: +a.x.toFixed(2), y: +a.y.toFixed(2), delay: Math.round(r.buf.delay), offset: Math.round(r.buf.offset), drawn: window.OP.view3d.actorViews.has(a), label: a.showName };
      });
      const real = await pageB.evaluate(() => ({ x: +window.OP.game.player.x.toFixed(2), y: +window.OP.game.player.y.toFixed(2), look: window.OP.game.player.look.kind }));
      const back = await pageB.evaluate(() => { const a = window.OP.net.avatars[0]; return { name: a.name, race: a.look.race, drawn: window.OP.view3d.actorViews.has(a) }; });
      console.log('A sees B', JSON.stringify(seen), 'B really', JSON.stringify(real), '| B sees A', JSON.stringify(back));
      // A looks at B; B looks at A
      const face = (pg, dist = 5) => pg.evaluate((dist) => {
        const g = window.OP.game, p = g.player, a = window.OP.net.avatars[0], v = window.OP.view3d;
        const yaw = Math.atan2(a.y - p.y, g.world.dx(p.x, a.x));
        v.rig.yaw = yaw - 0.5; v.rig.pitch = -0.18; if (v.rig.tp) v.rig.tp.dist = dist;
        p.facing = yaw;
      }, dist);
      await face(pageA); await face(pageB);
      await frames(pageA, 3); await frames(pageB, 3);
      await snap('A-sees-B');
      await snapB('B-sees-A');

      // B walks east for 5 s and stops. A notes where it draws B every frame it draws (and, at 60 Hz,
      // where the smoothing has B — what a quicker machine would draw); B notes where it really is.
      // (Small pages while measuring: drawing in software is slow, and the frames would be few.)
      const small = { width: 320, height: 180 };
      await pageA.setViewportSize(small); await pageB.setViewportSize(small);
      await frames(pageA, 2); await frames(pageB, 2);
      await pageA.evaluate(() => {
        const r = [...window.OP.net.remotes.values()][0];
        window.__trail = []; window.__smooth = []; window.__stop = false;
        (function f() { const a = window.OP.net?.avatars[0]; if (a) window.__trail.push([performance.timeOrigin + performance.now(), a.x, a.y]); if (!window.__stop) requestAnimationFrame(f); })();
        const t = setInterval(() => { if (window.__stop) { clearInterval(t); return; } const s = r.buf.sample(performance.now()); if (s) window.__smooth.push([performance.timeOrigin + performance.now(), s.x, s.y]); }, 16);
      });
      await pageB.evaluate(() => { window.__trail = []; window.__stop = false; (function f() { const p = window.OP.game.player; window.__trail.push([performance.timeOrigin + performance.now(), p.x, p.y]); if (!window.__stop) requestAnimationFrame(f); })(); window.OP.view3d.rig.yaw = 0; window.OP.key('W', true); });
      await sleep(5000);
      await pageB.evaluate(() => window.OP.key('W', false));
      await sleep(2500);
      const trailA = await pageA.evaluate(() => { window.__stop = true; return window.__trail; });
      const smoothA = await pageA.evaluate(() => window.__smooth);
      const trailB = await pageB.evaluate(() => { window.__stop = true; return window.__trail; });
      const rateA = (trailA.length - 1) / ((trailA[trailA.length - 1][0] - trailA[0][0]) / 1000), rateB = (trailB.length - 1) / ((trailB[trailB.length - 1][0] - trailB[0][0]) / 1000);
      console.log(`frames a second while measuring: A ${rateA.toFixed(1)}, B ${rateB.toFixed(1)}`);
      console.log('motion as drawn', JSON.stringify(compareTrails(trailA, trailB)));
      console.log('motion at 60 Hz', JSON.stringify(compareTrails(smoothA, trailB)));
      const net = await pageA.evaluate(() => { const r = [...window.OP.net.remotes.values()][0]; return { delay: Math.round(r.buf.delay), gaps: r.buf.gaps }; });
      console.log('smoothing on A', JSON.stringify(net));
      await pageA.setViewportSize(vp); await pageB.setViewportSize(vp);
      await face(pageA);
      await frames(pageA, 2);
      await snap('A-after-walk');
      // B swings away (a combo, then a heavy blow) for a couple of seconds: A sees each move begin
      await pageA.evaluate(() => { window.__acts = []; window.__stop = false; (function f() { const a = window.OP.net?.avatars[0]; const id = a?.action?.def.id; if (id && window.__acts[window.__acts.length - 1] !== id) window.__acts.push(id); if (!window.__stop) requestAnimationFrame(f); })(); });
      await pageB.evaluate(() => {
        const g = window.OP.game, p = g.player, a = window.OP.net.avatars[0];
        p.facing = Math.atan2(a.y - p.y, g.world.dx(p.x, a.x)) + 0.6;
        window.__swings = [];
        let n = 0;
        const t = setInterval(() => {
          if (++n === 16) p.tryHeavy(g); else if (n < 16) p.tryM1(g);
          const id = p.action?.def.id;
          if (id && window.__swings[window.__swings.length - 1] !== id) window.__swings.push(id);
          if (n > 22) { clearInterval(t); window.__swingsDone = true; }
        }, 110);
      });
      await until(pageA, () => !!window.OP.net.avatars[0]?.action, null, 30000);
      await face(pageA, 3);
      await snap('A-sees-B-swing');
      await until(pageB, () => window.__swingsDone && !window.OP.game.player.action, null, 120000);
      await sleep(1500);
      const swings = await pageB.evaluate(() => window.__swings);
      const seenActs = await pageA.evaluate(() => { window.__stop = true; return window.__acts; });
      console.log('B swung', JSON.stringify(swings), '| A saw', JSON.stringify(seenActs));
      // B wanders off across the island; the voyage list (P) says where everyone is, and Go to them brings B back to A
      const away = await pageB.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player;
        for (let r = 40; r < 120; r += 5) {
          for (let k = 0; k < 16; k++) {
            const a = k / 16 * Math.PI * 2, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
            if (w.walkable(x, y) && !w.isBlocked(x, y) && !w.isLiquid(x, y)) { window.OP.teleport(x, y); return { x: +x.toFixed(1), y: +y.toFixed(1), r }; }
          }
        }
        return null;
      });
      await until(pageA, ({ x, y }) => { const a = window.OP.net.avatars[0]; return a && Math.hypot(a.x - x, a.y - y) < 1; }, away, 60000);
      await pageA.keyboard.press('KeyP');
      await pageA.waitForSelector('.vy-list .vy-row', { timeout: 30000 });
      await frames(pageA, 2);
      const listA = await pageA.evaluate(() => [...document.querySelectorAll('.vy-list .vy-row')].map((r) => r.textContent));
      console.log('A\'s voyage list', JSON.stringify(listA));
      await snap('voyage-list');
      await pageA.keyboard.press('Escape');
      await pageB.keyboard.press('KeyP');
      await pageB.waitForSelector('.vy-list .vy-row button:has-text("Go to them")', { timeout: 30000 });
      await pageB.click('.vy-list .vy-row button:has-text("Go to them")');
      await pageB.click('.panel.ask .btn.gold');
      await until(pageB, () => { const p = window.OP.game.player, a = window.OP.net.avatars[0]; return a && window.OP.world.distance(p.x, p.y, a.x, a.y) < 4; }, null, 60000);
      const met = await pageB.evaluate(() => { const p = window.OP.game.player, a = window.OP.net.avatars[0]; return { apart: +window.OP.world.distance(p.x, p.y, a.x, a.y).toFixed(2), log: [...document.querySelectorAll('.log div')].map((d) => d.textContent).slice(-1) }; });
      console.log('B went to A from', away?.r, 'm away:', JSON.stringify(met));
      if (!at('chat')) return finish();

      // ---------------------------------------------------------------- chat
      const chat = async (pg, text) => {
        await pg.keyboard.press('Enter');
        await pg.waitForFunction(() => document.activeElement?.classList.contains('chat-in'), null, { timeout: 30000 });
        await pg.keyboard.type(text, { delay: 5 });
        await pg.keyboard.press('Enter');
      };
      await chat(pageA, 'Ahoy, Kaito! Over here.');
      await until(pageB, () => [...document.querySelectorAll('.log div')].some((d) => d.textContent.includes('Rin Stormwell: Ahoy, Kaito!')), null, 20000);
      await chat(pageB, 'Coming, captain!');
      await until(pageA, () => [...document.querySelectorAll('.log div')].some((d) => d.textContent.includes('Kaito Kurogane: Coming, captain!')), null, 20000);
      say('chat both ways');
      // (the chat box open on A, with the lines so far)
      await pageA.keyboard.press('Enter');
      await pageA.waitForFunction(() => document.activeElement?.classList.contains('chat-in'), null, { timeout: 30000 });
      await pageA.keyboard.type('Escape cancels this one', { delay: 5 });
      await frames(pageA, 2);
      await snap('chat-open');
      await pageA.keyboard.press('Escape');
      const after = await pageA.evaluate(() => ({ open: !!window.OP.ui.chatOpen, log: [...document.querySelectorAll('.log div')].map((d) => d.textContent) }));
      const logB = await pageB.evaluate(() => [...document.querySelectorAll('.log div')].map((d) => d.textContent));
      console.log('after Esc', JSON.stringify(after), 'B log', JSON.stringify(logB));
      await frames(pageB, 2);
      await snapB('chat-received');
      if (!at('ship')) return finish();

      // ---------------------------------------------------------------- ship
      const ship = await pageB.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player;
        // open water near here, clear all round
        for (let r = 20; r < 400; r += 6) {
          for (let k = 0; k < 24; k++) {
            const a = k / 24 * Math.PI * 2, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
            let ok = w.sd(x, y) < -14;
            for (let j = -14; j <= 14 && ok; j += 4) for (let i = -14; i <= 14 && ok; i += 4) if (!w.sailable(x + i, y + j)) ok = false;
            if (!ok) continue;
            const s = g.giveShip('sloop', x, y, 'Sea Sparrow', { heading: a });
            window.OP.voyage.board(s);
            window.OP.teleport(s.x, s.y);
            s.sail = 1;
            return { x: +x.toFixed(1), y: +y.toFixed(1), r, type: s.type, name: s.name };
          }
        }
        return null;
      });
      console.log('B at the helm of', JSON.stringify(ship));
      await until(pageA, () => window.OP.net.ships.length === 1 && window.OP.net.avatars[0]?.mode === 'sail', null, 60000);
      // under sail for a few seconds: where A draws her against where she is (small pages while measuring)
      await pageA.setViewportSize(small); await pageB.setViewportSize(small);
      await pageA.evaluate(() => { window.__ship = []; window.__stop = false; (function f() { const s = window.OP.net?.ships[0]; if (s) window.__ship.push([performance.timeOrigin + performance.now(), s.x, s.y]); if (!window.__stop) requestAnimationFrame(f); })(); });
      await pageB.evaluate(() => { window.__ship = []; window.__stop = false; (function f() { const s = window.OP.game.player.ship; if (s) window.__ship.push([performance.timeOrigin + performance.now(), s.x, s.y]); if (!window.__stop) requestAnimationFrame(f); })(); });
      await sleep(5000);
      const shipA = await pageA.evaluate(() => { window.__stop = true; return window.__ship; });
      const shipB = await pageB.evaluate(() => { window.__stop = true; return window.__ship; });
      console.log('ship as drawn', JSON.stringify(compareTrails(shipA, shipB)));
      await pageA.setViewportSize(vp); await pageB.setViewportSize(vp);
      const shipSeen = await pageA.evaluate(() => {
        const n = window.OP.net, s = n.ships[0], a = n.avatars[0];
        return s ? { type: s.type, name: s.name, x: +s.x.toFixed(1), y: +s.y.toFixed(1), heading: +s.heading.toFixed(2), sail: +(s.sailSet || 0).toFixed(2), speed: +(s.speed || 0).toFixed(2), drawn: [...window.OP.view3d.shipViews.keys()].includes(s), helmsman: a?.mode, onDeck: !!a?.deck, atX: +a.x.toFixed(1), atY: +a.y.toFixed(1) } : null;
      });
      const shipReal = await pageB.evaluate(() => { const s = window.OP.game.player.ship; return { x: +s.x.toFixed(1), y: +s.y.toFixed(1), heading: +s.heading.toFixed(2), sail: +s.sailSet.toFixed(2), speed: +s.speed.toFixed(2) }; });
      console.log('A sees B\'s ship', JSON.stringify(shipSeen), 'really', JSON.stringify(shipReal));
      // A goes down to the water's edge to look out at her (from in town, the houses are in the way)
      const shore = await pageA.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player, s = window.OP.net.ships[0], v = window.OP.view3d;
        if (!s) return null;
        const dx = w.dx(s.x, p.x), dy = p.y - s.y, L = Math.hypot(dx, dy);
        for (let d = 8; d < L; d += 0.5) {
          const x = s.x + dx / L * d, y = s.y + dy / L * d;
          if (w.walkable(x, y) && !w.isBlocked(x, y) && w.walkable(x + dx / L * 2, y + dy / L * 2)) {
            window.OP.teleport(x + dx / L * 2, y + dy / L * 2);
            break;
          }
        }
        v.rig.yaw = Math.atan2(s.y - p.y, w.dx(p.x, s.x)) - 0.25; v.rig.pitch = -0.05; if (v.rig.tp) v.rig.tp.dist = 5;
        return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), toShip: +w.distance(p.x, p.y, s.x, s.y).toFixed(1) };
      });
      console.log('A on the shore', JSON.stringify(shore));
      await sleep(1500);
      await pageA.evaluate(() => {
        const g = window.OP.game, p = g.player, s = window.OP.net.ships[0], v = window.OP.view3d;
        if (s) v.rig.yaw = Math.atan2(s.y - p.y, g.world.dx(p.x, s.x)) - 0.25;
      });
      await frames(pageA, 3);
      await snap('A-sees-B-ship');
      await frames(pageB, 2);
      await snapB('B-at-helm');
      if (!at('env')) return finish();

      // ---------------------------------------------------------------- env
      await pageA.evaluate(() => { const e = window.OP.env; e.clock = 19.4; e.stormTarget = 0.85; e.forecast = 'Storm'; e.windTarget = 2.2; });
      await until(pageB, () => { const e = window.OP.env; return Math.abs(e.clock - 19.4) < 0.2 && e.stormTarget === 0.85 && e.forecast === 'Storm'; }, null, 30000);
      await sleep(4000); // (a few seconds on: the guest's clock keeps step with the host's)
      const envA = await pageA.evaluate(() => { const e = window.OP.env; return { day: e.day, clock: +e.clock.toFixed(3), st: e.stormTarget, wt: e.windTarget, fc: e.forecast }; });
      const envB = await pageB.evaluate(() => { const e = window.OP.env; return { day: e.day, clock: +e.clock.toFixed(3), st: e.stormTarget, wt: e.windTarget, fc: e.forecast, timer: e.weatherTimer }; });
      console.log('clock and weather: host', JSON.stringify(envA), 'guest', JSON.stringify(envB));
      await frames(pageB, 2);
      await snapB('B-evening-storm');
      if (!at('leave')) return finish();

      // ---------------------------------------------------------------- leaving, rejoining, a code nobody hosts, the host leaving
      await pageB.evaluate(() => window.OP.voyage.toTitle());
      await until(pageA, () => window.OP.net?.avatars.length === 0 && window.OP.net.remotes.size === 0, null, 20000);
      const leftLog = await pageA.evaluate(() => [...document.querySelectorAll('.log div')].map((d) => d.textContent).filter((t) => /left the voyage/.test(t)));
      say('B left; A says', JSON.stringify(leftLog));
      await pageB.click('.mode-tabs button:has-text("Multiplayer")');
      await pageB.waitForSelector('.vy-rec button:has-text("Rejoin")', { timeout: 20000 });
      await frames(pageB, 2);
      await snapB('title-rejoin');
      await pageB.click('.vy-rec button:has-text("Rejoin")');
      await pageB.waitForSelector('button[data-slot="2"]', { timeout: 30000 });
      await pageB.click('button[data-slot="2"]');
      await until(pageA, () => window.OP.net?.avatars.length === 1, null, 60000);
      say('B rejoined with the remembered code; A draws B again');
      // a code nobody hosts (B, from the title)
      await pageB.evaluate(() => window.OP.voyage.toTitle());
      await pageB.click('.mode-tabs button:has-text("Multiplayer")');
      await pageB.fill('.code-in', 'ZZZZZY');
      await pageB.click('.code-row button:has-text("Join")');
      await pageB.waitForSelector('.vy-lobby h2:has-text("No voyage")', { timeout: 30000 });
      await frames(pageB, 2);
      await snapB('code-not-found');
      // back in with B, then the host ends it
      await pageB.click('.vy-lobby button:has-text("Back")');
      await pageB.click('.mode-tabs button:has-text("Multiplayer")');
      await pageB.click('.vy-rec button:has-text("Rejoin")');
      await pageB.waitForSelector('button[data-slot="2"]', { timeout: 30000 });
      await pageB.click('button[data-slot="2"]');
      await until(pageB, () => !!window.OP.game.player && window.OP.net?.status === 'joined', null, 60000);
      await until(pageA, () => window.OP.net?.avatars.length === 1, null, 60000);
      // (what B shows the moment the voyage ends: noted then, as the toast fades in a couple of seconds)
      await pageB.evaluate(() => window.OP.net.on('failed', (e) => { window.__ended = { code: e.code, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent) }; }));
      await pageA.evaluate(() => window.OP.voyage.toTitle());
      await until(pageB, () => !window.OP.net, null, 20000);
      const hostLeft = await pageB.evaluate(() => ({ ended: window.__ended, log: [...document.querySelectorAll('.log div')].map((d) => d.textContent).slice(-1), net: window.OP.net, playing: !!window.OP.game.player }));
      console.log('host left: B', JSON.stringify(hostLeft));
      await frames(pageB, 2);
      await snapB('host-left');
      return finish();

      function finish() {
        say('done');
        if (errors.length) throw new Error('page B errors: ' + errors.join(' | '));
      }
    },
  },
};

// The real line (trystero over the public Nostr relays), from one page: hosting
// shows whether the relays answer (where they can't be reached — a sandbox, a
// firewall — the lobby says so, and so does looking for a voyage; the browser
// then logs each failed relay connection as an error of its own, which the
// harness counts).
//   node tools/shot.mjs mprelays [--page=shots/xmp/index.html]
scenarios.mprelays = {
  async run(page, snap) {
    await waitReady(page);
    await quiet(page);
    await makePirate(page, 1, 'human', 'Rin Stormwell');
    await page.click('.mode-tabs button:has-text("Multiplayer")');
    await page.click('.vy-slot:has-text("Rin Stormwell") button:has-text("Host")');
    await page.waitForSelector('.vy-lobby .code-letters', { timeout: 30000 });
    const t0 = Date.now();
    await page.waitForFunction(() => window.OP.net && (window.OP.net.status === 'open' || window.OP.net.relayWarned), null, { timeout: 60000, polling: 250 });
    const host = await page.evaluate(() => ({ kind: window.OP.net.kind, status: window.OP.net.status, relays: window.OP.net.relays, line: document.querySelector('.vy-status')?.textContent }));
    console.log(`hosting over ${host.kind} after ${((Date.now() - t0) / 1000).toFixed(1)} s:`, JSON.stringify(host));
    await snap('host-relays');
    await page.click('.vy-lobby button:has-text("Back")');
    await page.click('.mode-tabs button:has-text("Multiplayer")');
    await page.fill('.code-in', 'QWERTY');
    await page.click('.code-row button:has-text("Join")');
    await page.waitForTimeout(3000);
    await snap('join-looking');
    await page.waitForFunction(() => { const t = document.querySelector('.vy-lobby h2')?.textContent; return t && t !== 'Joining a voyage'; }, null, { timeout: 90000, polling: 250 });
    console.log('joining:', JSON.stringify(await page.evaluate(() => ({ title: document.querySelector('.vy-lobby h2').textContent, text: document.querySelector('.vy-lobby p')?.textContent }))));
    await snap('join-result');
  },
};

/**
 * How closely A's drawing of B follows B's real path: the delay that fits
 * best, the error at that delay (mean and worst), the largest step A drew
 * in one frame against B's own, and whether A's drawing ever went backwards
 * along the way B walked.
 */
function compareTrails(A, B) {
  if (A.length < 5 || B.length < 5) return { error: 'too few samples', a: A.length, b: B.length };
  const at = (t) => {
    if (t <= B[0][0]) return B[0];
    for (let i = 1; i < B.length; i++) if (B[i][0] >= t) { const a = B[i - 1], b = B[i], k = (t - a[0]) / (b[0] - a[0] || 1); return [t, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
    return B[B.length - 1];
  };
  let best = null;
  for (let D = 0; D <= 900; D += 10) {
    let sum = 0, max = 0, n = 0;
    for (const s of A) {
      const b = at(s[0] - D);
      const e = Math.hypot(s[1] - b[1], s[2] - b[2]);
      sum += e; max = Math.max(max, e); n++;
    }
    if (!best || sum / n < best.mean) best = { delay: D, mean: sum / n, max };
  }
  const dir = [B[B.length - 1][1] - B[0][1], B[B.length - 1][2] - B[0][2]], L = Math.hypot(...dir) || 1;
  let back = 0, stepA = 0, stepB = 0, dtA = 0;
  for (let i = 1; i < A.length; i++) {
    const along = ((A[i][1] - A[i - 1][1]) * dir[0] + (A[i][2] - A[i - 1][2]) * dir[1]) / L;
    if (along < -0.005) back++;
    stepA = Math.max(stepA, Math.hypot(A[i][1] - A[i - 1][1], A[i][2] - A[i - 1][2]));
    dtA = Math.max(dtA, A[i][0] - A[i - 1][0]);
  }
  for (let i = 1; i < B.length; i++) stepB = Math.max(stepB, Math.hypot(B[i][1] - B[i - 1][1], B[i][2] - B[i - 1][2]));
  const endA = A[A.length - 1], endB = B[B.length - 1];
  return {
    framesA: A.length, framesB: B.length, walked: +L.toFixed(2),
    bestDelayMs: best.delay, meanErr: +best.mean.toFixed(3), maxErr: +best.max.toFixed(3),
    biggestStepA: +stepA.toFixed(3), biggestStepB: +stepB.toFixed(3), longestFrameA: Math.round(dtA), backwardSteps: back,
    endGap: +Math.hypot(endA[1] - endB[1], endA[2] - endB[2]).toFixed(3),
  };
}
