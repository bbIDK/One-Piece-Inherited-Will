// Multiplayer: two pages of the one browser on a voyage together, over the
// local transport (?net=local, a BroadcastChannel: a sandbox may not reach
// the public relays). Page A makes a pirate, goes back to the title and hosts
// a voyage from the Multiplayer tab; page B makes another and joins with the
// code from A's lobby. Then: each sees the other (name, look), B walks and A
// sees B glide along the same path a moment later (no jumps), chat both ways,
// B sails and A sees B's ship (and B at her helm), A's clock and weather
// reach B, B leaves and rejoins with the remembered code, a code nobody hosts
// is reported as such, and the host leaving ends the voyage for B (in the
// world, and again while B is making a new pirate, who carries on alone).
//
//   node tools/shot.mjs mp [--page=shots/xmp/index.html] [--upto=menu|avatars|chat|ship|env|leave]
//
// (Screenshots of A come out as mp-A-NN-*.png, of B as mp-B-NN-*.png, in shots/.)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRelay } from './nostr-relay.mjs';

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
      // (noted as A's game starts drawing it, however few frames a second it manages)
      await pageA.evaluate(() => {
        window.__acts = [];
        const r = [...window.OP.net.remotes.values()][0], cues = r.cues;
        r.cues = function (game, a, s, dt) { const n = this.actN; cues.call(this, game, a, s, dt); if (this.actN !== n && s.aid) window.__acts.push(s.aid); };
      });
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
      await until(pageA, () => window.__acts.length > 0, null, 90000);
      await face(pageA, 3);
      await snap('A-sees-B-swing');
      await until(pageB, () => window.__swingsDone && !window.OP.game.player.action, null, 120000);
      await sleep(1500);
      const swings = await pageB.evaluate(() => window.__swings);
      const seenActs = await pageA.evaluate(() => window.__acts);
      console.log('B swung', JSON.stringify(swings), '| A drew', seenActs.length, 'moves begin:', JSON.stringify(seenActs.filter((id, i) => id !== seenActs[i - 1])));
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
      // (B opens it with the Voyage button on the sidebar, which is lit while it's open)
      await pageB.click('.sidebar .vy-side');
      await pageB.waitForSelector('.vy-list .vy-row button:has-text("Go to them")', { timeout: 30000 });
      console.log('B\'s Voyage button', JSON.stringify(await pageB.evaluate(() => { const b = document.querySelector('.sidebar .vy-side'); return { text: b.textContent, lit: b.classList.contains('on'), title: b.title }; })));
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
      // the host leaving while B makes a new pirate: said over the making, which carries on
      await pageA.click('.mode-tabs button:has-text("Multiplayer")');
      await pageA.click('.vy-slot:has-text("Rin Stormwell") button:has-text("Host")');
      await until(pageA, () => window.OP.net?.status === 'open');
      await pageB.evaluate(() => window.OP.voyage.toTitle());
      await pageB.click('.mode-tabs button:has-text("Multiplayer")');
      await pageB.click('.vy-rec button:has-text("Rejoin")');
      await pageB.waitForSelector('button[data-slot="3"]', { timeout: 30000 });
      await pageB.click('button[data-slot="3"]');
      await pageB.waitForSelector('.race-roll', { timeout: 30000 });
      await pageB.evaluate(() => window.OP.net.on('failed', (e) => { window.__ended = { code: e.code, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent) }; }));
      await pageA.evaluate(() => window.OP.voyage.toTitle());
      await until(pageB, () => !window.OP.net, null, 20000);
      const making = await pageB.evaluate(() => ({ ended: window.__ended, making: !!document.querySelector('.screen .race-roll'), lobby: !!document.querySelector('.vy-lobby'), net: window.OP.net, playing: !!window.OP.game.player }));
      console.log('host left while B makes a pirate:', JSON.stringify(making));
      await snapB('host-left-while-making');
      return finish();

      function finish() {
        say('done');
        if (errors.length) throw new Error('page B errors: ' + errors.join(' | '));
      }
    },
  },
};

// Aboard a friend's ship: two pages on a voyage, as in mp (?net=local). A
// takes the helm of a sloop lying in open water off Dawn Island; B swims to
// her ladder and climbs it (E at its foot), and walks her deck. A raises her
// sails and turns her: B rides her just where B stands — on the ship as B's
// game draws her — and A's game draws B there, on A's own ship (both pages
// note where on her deck B is, every frame they draw). Then A lowers her
// sails, B dives off her rail into the sea and climbs back up her ladder, and
// A leaves the voyage with B on her deck: she's gone from B's world, and B is
// set down in the water where B stood.
//   node tools/shot.mjs mpaboard [--page=shots/net/index.html]
// (Screenshots of A come out as mpaboard-A-NN-*.png, of B as mpaboard-B-NN-*.png, in shots/.)
scenarios.mpaboard = {
  query: '?debug=1&net=local',
  async run(page, _snap, args) {
    const errors = [], fails = [];
    const t0 = Date.now();
    const say = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
    const check = (ok, what) => { if (!ok) fails.push(what); console.log(ok ? 'ok  ' : 'FAIL', what); };
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
    const shot = async (tag, pg, label) => { const file = join(root, 'shots', `mpaboard-${tag}-${String(++shots[tag]).padStart(2, '0')}-${label}.png`); await pg.screenshot({ path: file, timeout: 180000 }); console.log(`shot → ${file}`); };
    await pageA.goto(url);
    await pageB.goto(url);
    await Promise.all([waitReady(pageA), waitReady(pageB)]);
    await quiet(pageA); await quiet(pageB);
    await makePirate(pageA, 1, 'human', 'Rin Stormwell');
    await makePirate(pageB, 2, 'mink', 'Kaito Kurogane');
    // A hosts; B joins with the code; both set sail into the world (a page drawing its title
    // in software can be busy for a while: each is clicked once it's drawing frames again)
    // (small pages meanwhile: their titles drawn in software are slow, and a guest only looks for the host a few seconds)
    const click = async (pg, sel) => { await frames(pg, 2); await pg.click(sel, { timeout: 180000 }); };
    const small = { width: 320, height: 180 };
    await pageA.setViewportSize(small); await pageB.setViewportSize(small);
    await click(pageA, '.mode-tabs button:has-text("Multiplayer")');
    await click(pageA, '.vy-slot:has-text("Rin Stormwell") button:has-text("Host")');
    await until(pageA, () => window.OP.net?.status === 'open');
    const code = await pageA.evaluate(() => window.OP.net.code);
    for (let tries = 1; ; tries++) {
      await click(pageB, '.mode-tabs button:has-text("Multiplayer")');
      await pageB.fill('.code-in', code, { timeout: 180000 });
      await click(pageB, '.code-row button:has-text("Join")');
      await pageB.waitForFunction(() => { const t = document.querySelector('.vy-lobby h2')?.textContent || ''; return /Aboard/.test(t) || (t && !/Joining/.test(t)); }, null, { timeout: 120000, polling: 250 });
      const h2 = await pageB.evaluate(() => document.querySelector('.vy-lobby h2').textContent);
      if (/Aboard/.test(h2)) break;
      say(`B's join (try ${tries}): "${h2}"`);
      if (tries >= 4) throw new Error('B could not join: ' + h2);
      await click(pageB, '.vy-lobby button:has-text("Back")');
    }
    await until(pageA, () => document.querySelectorAll('.vy-mate').length === 2, null, 120000);
    await click(pageA, '.vy-lobby button:has-text("Set sail")');
    await click(pageB, 'button[data-slot="2"]');
    await Promise.all([until(pageA, () => !!window.OP.game.player, null, 120000), until(pageB, () => !!window.OP.game.player, null, 120000)]);
    await until(pageA, () => window.OP.net?.avatars.length === 1, null, 60000);
    await until(pageB, () => window.OP.net?.avatars.length === 1, null, 60000);
    say('both in the world, on voyage', code);
    // (the pages stay small while things happen — two drawn in software manage a frame or two a
    // second, and each frame is at most 0.05 s of the game — and grow for each screenshot)
    const snapAt = async (tag, pg, label, setup) => {
      await pg.setViewportSize(vp);
      if (setup) await setup();
      await frames(pg, 2);
      await shot(tag, pg, label);
      await pg.setViewportSize(small);
    };

    // ---- A at the helm of a sloop in open water off Dawn Island, her sails furled (a clear midday, a fair breeze)
    const ship = await pageA.evaluate(() => {
      const g = window.OP.game, w = g.world, p = g.player, e = g.env;
      e.clock = 12; e.storm = 0; e.stormTarget = 0; e.fog = 0; e.forecast = 'Clear'; e.windStrength = Math.max(1, e.windStrength || 0);
      for (let r = 30; r < 500; r += 6) {
        for (let k = 0; k < 24; k++) {
          const a = k / 24 * Math.PI * 2, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
          let ok = w.sd(x, y) < -24;
          for (let j = -28; j <= 28 && ok; j += 4) for (let i = -28; i <= 28 && ok; i += 4) if (!w.sailable(x + i, y + j)) ok = false;
          if (!ok) continue;
          const s = g.giveShip('sloop', x, y, 'Going Merry', { heading: a });
          window.OP.voyage.board(s);
          window.OP.teleport(s.x, s.y);
          s.sail = 0; s.anchored = true;
          window.__ship = s;
          return { type: s.type, name: s.name, uid: s.uid, x: +s.x.toFixed(1), y: +s.y.toFixed(1), heading: +s.heading.toFixed(2), sd: +w.sd(x, y).toFixed(1) };
        }
      }
      return null;
    });
    say('A at the helm of', JSON.stringify(ship));
    if (!ship) throw new Error('no open water for her');
    await until(pageB, () => window.OP.net.ships.length === 1 && window.OP.net.avatars[0]?.mode === 'sail', null, 120000);
    const seenB = await pageB.evaluate(() => { const s = window.OP.net.ships[0]; return { uid: s.uid, name: s.name, owner: s.netOwner, x: +s.x.toFixed(1), y: +s.y.toFixed(1) }; });
    say('B draws her:', JSON.stringify(seenB));

    // ---- B swims to the foot of her ladder, and climbs it (E there, as anyone would)
    const toLadder = () => pageB.evaluate(() => {
      const g = window.OP.game, p = g.player, s = window.OP.net.ships[0], d = window.OP.debug.dims(s), v3 = g.view3d;
      // (into the sea off her side — wherever B is — then to the foot of her nearest ladder)
      if (!p.inWater) {
        const off = window.OP.debug.deckToWorld(s, d.ladders[0].t, d.ladders[0].s * (d.B / 2 + 2.5));
        p.deck?.ship?.aboard?.delete(p); p.deck = null; p.z = 0; p.vz = 0;
        window.OP.teleport(off.x, off.y);
      }
      const lad = g.ladderAt(p, 12, s);
      if (!lad) return null;
      window.OP.teleport(lad.foot.x, lad.foot.y);
      v3.rig.yaw = Math.atan2(s.y - p.y, g.world.dx(p.x, s.x)) + 0.9; v3.rig.pitch = -0.08; v3.rig.tp.dist = 4.2;
      return { side: lad.l.s > 0 ? 'starboard' : 'port', foot: [+lad.foot.x.toFixed(1), +lad.foot.y.toFixed(1)] };
    });
    const climb = async (label) => {
      const at = await toLadder();
      await until(pageB, () => /^Climb the ladder/.test(window.OP.game.player.controller.interaction?.label || ''), null, 120000);
      const prompt = await pageB.evaluate(() => window.OP.game.player.controller.interaction.label);
      await pageB.evaluate(() => window.OP.key('E', true));
      await until(pageB, () => !!window.OP.game.player.climb, null, 120000);
      await pageB.evaluate(() => window.OP.key('E', false));
      say(`B at her ladder (${at?.side}): "${prompt}" — climbing`);
      if (label) { await until(pageB, () => { const p = window.OP.game.player; return !p.climb || p.climb.t > p.climb.T * 0.4; }, null, 120000); await snapAt('B', pageB, label); }
      await until(pageB, () => { const p = window.OP.game.player; return !p.climb && p.deck?.ship === window.OP.net.ships[0]; }, null, 300000);
      return prompt;
    };
    const prompt = await climb('climbing-her-ladder');
    check(/the Going Merry/.test(prompt), `the prompt names her: "${prompt}"`);
    // on her deck: B walks a few steps along it, toward her bow
    const t0Deck = await pageB.evaluate(() => { const g = window.OP.game, s = window.OP.net.ships[0], r = g.view3d.rig; r.yaw = s.heading; r.pitch = -0.12; window.OP.key('W', true); return g.player.deck.t; });
    await until(pageB, (t0) => { const p = window.OP.game.player; return !p.deck || Math.abs(p.deck.t - t0) * p.deck.ship.def.length > 1.5; }, t0Deck, 180000).catch(() => {});
    await pageB.evaluate(() => window.OP.key('W', false));
    await frames(pageB, 3);
    const onDeck = await pageB.evaluate((t0) => {
      const g = window.OP.game, p = g.player, s = window.OP.net.ships[0];
      return { aboard: p.deck?.ship === s, walked: +(Math.abs((p.deck?.t ?? t0) - t0) * s.def.length).toFixed(2), lvl: typeof p.deck?.lvl === 'string' ? p.deck.lvl : 'stairs', t: +(p.deck?.t ?? -1).toFixed(2), v: +(p.deck?.v ?? 0).toFixed(2), inWater: p.inWater, inHerList: !!s.aboard?.has(p) };
    }, t0Deck);
    say('B on her deck:', JSON.stringify(onDeck));
    check(onDeck.aboard && onDeck.inHerList && !onDeck.inWater && onDeck.walked > 1, 'B climbed aboard her and walked her deck');
    // (B looking along her deck; A, at her helm, looking out over it at B)
    const lookAtB = () => pageA.evaluate(() => {
      const g = window.OP.game, s = window.__ship, a = window.OP.net.avatars[0], r = g.view3d.rig;
      r.yaw = Math.atan2(a.y - s.y, g.world.dx(s.x, a.x)); r.pitch = -0.32; r.tp.dist = 1.3;
    });
    const lookB = (turn) => pageB.evaluate((turn) => { const g = window.OP.game, s = window.OP.net.ships[0], r = g.view3d.rig; r.yaw = s.heading + turn; r.pitch = -0.16; r.tp.dist = 4.6; }, turn);
    await until(pageA, () => window.OP.net.avatars[0]?.deck?.ship === window.__ship, null, 120000);
    await snapAt('A', pageA, 'A-sees-B-on-her-deck', lookAtB);
    await snapAt('B', pageB, 'B-on-her-deck', () => lookB(0.5));

    // ---- A sets her sails and turns her; both pages note where B is on her deck, every frame drawn
    await pageB.evaluate(() => {
      window.__ride = []; window.__stopRide = false;
      (function f() {
        const g = window.OP.game, p = g.player, s = window.OP.net?.ships[0];
        if (s && p) { const dx = g.world.dx(s.x, p.x), dy = p.y - s.y, c = Math.cos(s.heading), sn = Math.sin(s.heading); window.__ride.push([performance.now(), dx * c + dy * sn, -dx * sn + dy * c, p.deck?.ship === s ? 1 : 0, s.x, s.y, s.heading, p.x, p.y]); }
        if (!window.__stopRide) requestAnimationFrame(f);
      })();
    });
    await pageA.evaluate(() => {
      window.__ride = []; window.__stopRide = false;
      (function f() {
        const g = window.OP.game, s = window.__ship, a = window.OP.net?.avatars[0];
        if (s && a) { const dx = g.world.dx(s.x, a.x), dy = a.y - s.y, c = Math.cos(s.heading), sn = Math.sin(s.heading); window.__ride.push([performance.now(), dx * c + dy * sn, -dx * sn + dy * c, a.deck?.ship === s ? 1 : 0, s.x, s.y, s.heading]); }
        if (!window.__stopRide) requestAnimationFrame(f);
      })();
    });
    // (her sails set all at once, as W at the helm sets them over a second of the game; and D to turn her)
    const from = await pageA.evaluate(() => { const s = window.__ship; s.sail = 1; s.sailSet = 1; s.anchored = false; s.speed = Math.max(s.speed, 5); window.OP.key('D', true); return { x: s.x, y: s.y, h: s.heading }; });
    await until(pageA, (f) => Math.abs(window.__ship.heading - f.h) > 0.3, from, 300000);
    await snapAt('A', pageA, 'A-sails-B-aboard', lookAtB);
    await snapAt('B', pageB, 'B-rides-her', () => lookB(0.35));
    await until(pageA, (f) => Math.abs(window.__ship.heading - f.h) > 0.7, from, 300000);
    await pageA.evaluate(() => window.OP.key('D', false));
    await until(pageA, (f) => window.OP.game.world.distance(window.__ship.x, window.__ship.y, f.x, f.y) > 20, from, 300000);
    await sleep(1500);
    const rideB = await pageB.evaluate(() => { window.__stopRide = true; return window.__ride; });
    const rideA = await pageA.evaluate(() => { window.__stopRide = true; return window.__ride; });
    const sum = (R) => {
      const on = R.filter((r) => r[3]);
      if (on.length < 3) return { frames: R.length, aboard: on.length };
      let du = 0, dv = 0, path = 0, step = 0;
      const u0 = on[0][1], v0 = on[0][2];
      for (let i = 0; i < on.length; i++) {
        du = Math.max(du, Math.abs(on[i][1] - u0)); dv = Math.max(dv, Math.abs(on[i][2] - v0));
        if (i) {
          const sx = on[i][4] - on[i - 1][4], sy = on[i][5] - on[i - 1][5], d = Math.hypot(sx, sy);
          path += d; step = Math.max(step, d);
        }
      }
      const secs = (R[R.length - 1][0] - R[0][0]) / 1000;
      return { frames: R.length, aboard: on.length, fps: +(R.length / secs).toFixed(1), sailed: +path.toFixed(1), turned: +(on[on.length - 1][6] - on[0][6]).toFixed(2), biggestStep: +step.toFixed(3), slidAlong: +du.toFixed(4), slidAcross: +dv.toFixed(4) };
    };
    const sB = sum(rideB), sA = sum(rideA);
    console.log('B riding her, as B\'s game draws her:', JSON.stringify(sB));
    console.log('B on her, as A\'s game draws them:', JSON.stringify(sA));
    check(sB.aboard === sB.frames && sB.sailed > 10 && Math.abs(sB.turned) > 0.5, `B aboard every frame B drew while she sailed ${sB.sailed} m and turned ${sB.turned} rad`);
    check(sB.slidAlong < 1e-3 && sB.slidAcross < 1e-3, `B stays just where B stood on her (slid ${sB.slidAlong} m along, ${sB.slidAcross} m across)`);
    check(sA.aboard >= sA.frames * 0.95 && sA.slidAlong < 0.05 && sA.slidAcross < 0.05, `A draws B on A's own ship, just where B stands (${sA.aboard}/${sA.frames} frames; ${sA.slidAlong}, ${sA.slidAcross} m)`);

    // ---- A lowers her sails and she loses way; B dives off her rail into the sea, and climbs back up her ladder
    await pageA.evaluate(() => { window.__ship.sail = 0; });
    await until(pageA, () => Math.abs(window.__ship.speed) < 0.6, null, 300000);
    const dive = await pageB.evaluate(() => {
      const g = window.OP.game, p = g.player, s = window.OP.net.ships[0], sg = p.deck.v >= 0 ? 1 : -1;
      // (out over her side, the side B stands nearer)
      g.view3d.rig.yaw = s.heading + sg * Math.PI / 2;
      window.OP.key('W', true);
      return { side: sg > 0 ? 'starboard' : 'port', t: +p.deck.t.toFixed(2) };
    });
    await until(pageB, () => { const p = window.OP.game.player; return !p.deck || p.deck.edge < 0.45; }, null, 180000).catch(() => {});
    await pageB.evaluate(() => window.OP.key('Space', true));
    await until(pageB, () => (window.OP.game.player.charging || 0) > 0.1 || !window.OP.game.player.deck, null, 60000).catch(() => {});
    await pageB.evaluate(() => window.OP.key('Space', false));
    await until(pageB, () => window.OP.game.player.inWater, null, 180000).catch(() => {});
    await pageB.evaluate(() => window.OP.key('W', false));
    const wet = await pageB.evaluate(() => { const g = window.OP.game, p = g.player, s = window.OP.net.ships[0]; return { inWater: p.inWater, deck: !!p.deck, apart: +g.world.distance(p.x, p.y, s.x, s.y).toFixed(1), inHull: !!g.hullAt(p.x, p.y) }; });
    say('B over her rail', dive.side, '→', JSON.stringify(wet));
    check(wet.inWater && !wet.deck && !wet.inHull, 'B dived off her rail into the sea (clear of her hull)');
    await snapAt('B', pageB, 'B-in-the-sea-beside-her', () => pageB.evaluate(() => { const g = window.OP.game, p = g.player, s = window.OP.net.ships[0], r = g.view3d.rig; r.yaw = Math.atan2(s.y - p.y, g.world.dx(p.x, s.x)) + 0.5; r.pitch = -0.05; }));
    await climb(null);
    check(await pageB.evaluate(() => window.OP.game.player.deck?.ship === window.OP.net.ships[0]), 'and back up her ladder');

    // ---- A leaves the voyage with B on her deck: she's gone from B's world, and B's set down where B stood
    const before = await pageB.evaluate(() => { const p = window.OP.game.player; return { x: p.x, y: p.y }; });
    await pageA.evaluate(() => window.OP.voyage.toTitle());
    await until(pageB, () => !window.OP.game.player.deck && !window.OP.net, null, 120000);
    await until(pageB, () => window.OP.game.player.inWater, null, 180000).catch(() => {});
    const after = await pageB.evaluate((b) => {
      const g = window.OP.game, p = g.player;
      return { moved: +g.world.distance(p.x, p.y, b.x, b.y).toFixed(2), inWater: p.inWater, deck: !!p.deck, inHull: !!g.hullAt(p.x, p.y), z: +(p.z || 0).toFixed(2), log: g.logLines.slice(-3).map((l) => l.text) };
    }, before);
    say('A left: B', JSON.stringify(after));
    check(!after.deck && after.inWater && after.moved < 1 && !after.inHull, 'B set down in the water where B stood when she was gone');
    await snapAt('B', pageB, 'B-set-down-A-left', () => pageB.evaluate(() => { const r = window.OP.game.view3d.rig; r.pitch = -0.2; }));
    say('done');
    if (errors.length || fails.length) throw new Error([...fails.map((f) => 'failed: ' + f), ...errors].join(' | '));
  },
};

// The real line, end to end, on this machine: trystero meeting through a
// Nostr relay of our own (tools/nostr-relay.mjs, named with ?relay=) and then
// talking over WebRTC data channels between two pages — the same code as over
// the internet, only the relay nearer. A hosts, B joins with the code, both
// sail, each draws the other, a line of chat each way, then B leaves.
// (The relay counts what passes through it: only the meeting does; the
// states, the chat and the rest go page to page.)
//   node tools/shot.mjs mprtc [--page=shots/xmp/index.html]
scenarios.mprtc = {
  async run(page, _snap, args) {
    const errors = [];
    const t0 = Date.now();
    const say = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
    const relay = await startRelay(0);
    say('relay on port', relay.port);
    const url = page.url().replace(/\?.*$/, '') + `?debug=1&relay=ws://127.0.0.1:${relay.port}`, browser = page.context().browser();
    await page.close();
    const ctx = await browser.newContext({ viewport: { width: Number(args.w || 640), height: Number(args.h || 360) } });
    const pageA = await ctx.newPage(), pageB = await ctx.newPage();
    const shots = { A: 0, B: 0 };
    for (const [tag, pg] of [['A', pageA], ['B', pageB]]) {
      pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${tag} ${m.type()}] ${m.text()}`); if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
      pg.on('pageerror', (e) => { console.log(`[${tag} pageerror] ${e.stack || e.message}`); errors.push(`${tag}: ${e.message}`); });
    }
    const shot = async (tag, pg, label) => { const file = join(root, 'shots', `mprtc-${tag}-${String(++shots[tag]).padStart(2, '0')}-${label}.png`); await pg.screenshot({ path: file, timeout: 180000 }); console.log(`shot → ${file}`); };
    try {
      await pageA.goto(url);
      await pageB.goto(url);
      await Promise.all([waitReady(pageA), waitReady(pageB)]);
      await quiet(pageA); await quiet(pageB);
      await makePirate(pageA, 1, 'human', 'Rin Stormwell');
      await makePirate(pageB, 2, 'mink', 'Kaito Kurogane');
      say('pirates made; A hosts');
      await pageA.click('.mode-tabs button:has-text("Multiplayer")');
      await pageA.click('.vy-slot:has-text("Rin Stormwell") button:has-text("Host")');
      await until(pageA, () => window.OP.net?.status === 'open', null, 60000);
      // (every message A's game takes in, by kind: what came page to page)
      await pageA.evaluate(() => { const v = window.OP.net, take = v.receive; window.__kinds = {}; v.receive = function (m, from) { const k = m?.k || '?'; window.__kinds[k] = (window.__kinds[k] || 0) + 1; return take.call(this, m, from); }; });
      const lobby = await pageA.evaluate(() => ({ kind: window.OP.net.kind, code: window.OP.net.code, relays: window.OP.net.relays, line: document.querySelector('.vy-status')?.textContent }));
      say('hosting:', JSON.stringify(lobby));
      await frames(pageA, 2);
      await shot('A', pageA, 'lobby-open');
      const tJoin = Date.now();
      await pageB.click('.mode-tabs button:has-text("Multiplayer")');
      await pageB.fill('.code-in', lobby.code);
      await pageB.click('.code-row button:has-text("Join")');
      // (how the search goes, every few seconds, till B is aboard or gives up)
      for (let i = 0; ; i++) {
        const b = await pageB.evaluate(() => { const v = window.OP.net; return { status: v?.status, error: v?.error?.code, relays: v?.relays, peers: v?.tr?.peers().length, screen: document.querySelector('.vy-lobby h2')?.textContent }; });
        const a = await pageA.evaluate(() => ({ peers: window.OP.net?.tr?.peers().length, crew: window.OP.net?.remotes.size }));
        say('B', JSON.stringify(b), '| A', JSON.stringify(a), '| relay', JSON.stringify(relay.stats));
        if (/Aboard/.test(b.screen || '')) break;
        if (b.status === 'failed' || i > 40) throw new Error('B could not join: ' + JSON.stringify(b));
        await sleep(3000);
      }
      say(`B found the voyage and was welcomed in ${((Date.now() - tJoin) / 1000).toFixed(1)} s`);
      await until(pageA, () => document.querySelectorAll('.vy-mate').length === 2, null, 30000);
      await frames(pageA, 2);
      await shot('A', pageA, 'lobby-with-guest');
      await pageA.click('.vy-lobby button:has-text("Set sail")');
      await pageB.click('button[data-slot="2"]');
      await Promise.all([until(pageA, () => !!window.OP.game.player, null, 120000), until(pageB, () => !!window.OP.game.player, null, 120000)]);
      await until(pageA, () => window.OP.net?.avatars.length === 1, null, 60000);
      await until(pageB, () => window.OP.net?.avatars.length === 1, null, 60000);
      say('both in the world, each drawing the other');
      const posA = await pageA.evaluate(() => ({ x: window.OP.game.player.x, y: window.OP.game.player.y }));
      const spot = await pageB.evaluate(({ x, y }) => {
        const w = window.OP.world;
        for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2.5, 2.5], [-2.5, -2.5]]) if (w.walkable(x + dx, y + dy) && !w.isBlocked(x + dx, y + dy)) { window.OP.teleport(x + dx, y + dy); return { x: x + dx, y: y + dy }; }
        window.OP.teleport(x + 2, y);
        return { x: x + 2, y };
      }, posA);
      await until(pageA, ({ x, y }) => { const a = window.OP.net.avatars[0]; return a && Math.hypot(a.x - x, a.y - y) < 0.5; }, spot, 60000);
      // A looks at B
      await pageA.evaluate(() => {
        const g = window.OP.game, p = g.player, a = window.OP.net.avatars[0], v = window.OP.view3d;
        const yaw = Math.atan2(a.y - p.y, g.world.dx(p.x, a.x));
        v.rig.yaw = yaw - 0.5; v.rig.pitch = -0.18; if (v.rig.tp) v.rig.tp.dist = 5;
        p.facing = yaw;
      });
      // B walks a few steps (states flowing), then a line of chat each way
      await pageB.evaluate(() => { window.OP.view3d.rig.yaw = 0; window.OP.key('W', true); });
      await sleep(3000);
      await pageB.evaluate(() => window.OP.key('W', false));
      await pageB.evaluate(() => window.OP.net.say('Can you see me? This came straight from my browser.'));
      await pageA.evaluate(() => window.OP.net.say('Clear as day — welcome aboard!'));
      await until(pageA, () => [...document.querySelectorAll('.log div')].some((d) => /straight from my browser/.test(d.textContent)), null, 30000);
      await until(pageB, () => [...document.querySelectorAll('.log div')].some((d) => /welcome aboard/.test(d.textContent)), null, 30000);
      await frames(pageA, 3);
      await shot('A', pageA, 'A-sees-B');
      const seen = await pageA.evaluate(() => {
        const a = window.OP.net.avatars[0], r = [...window.OP.net.remotes.values()][0];
        return { name: a.name, race: a.look.race, drawn: window.OP.view3d.actorViews.has(a), delayMs: Math.round(r.buf.delay), gapsMs: r.buf.gaps.slice(-8), log: [...document.querySelectorAll('.log div')].map((d) => d.textContent).slice(-2) };
      });
      say('A sees B over WebRTC:', JSON.stringify(seen));
      const kinds = await pageA.evaluate(() => window.__kinds);
      const line = await pageA.evaluate(() => { const pc = window.OP.net.tr.peers(); return { peers: pc.length }; });
      say('messages A took in from B, by kind:', JSON.stringify(kinds), '| peers', JSON.stringify(line), '| through the relay:', JSON.stringify(relay.stats));
      // B leaves the voyage; A hears of it
      await pageB.evaluate(() => window.OP.voyage.toTitle());
      await until(pageA, () => window.OP.net?.avatars.length === 0 && window.OP.net.remotes.size === 0, null, 30000);
      const left = await pageA.evaluate(() => [...document.querySelectorAll('.log div')].map((d) => d.textContent).filter((t) => /left the voyage/.test(t)));
      say('B left; A says', JSON.stringify(left));
    } finally {
      relay.close();
    }
    say('done');
    if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
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
