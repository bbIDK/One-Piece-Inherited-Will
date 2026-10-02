// The creative panel (F1, or the pause menu, in creative mode): Devil Fruits
// handed out and eaten the usual ways (from the hand, holding the right
// button, and from the Inventory) and their power taken away again; items and
// berries; a race changed, the model built afresh (seen in third person, and
// your own body in first) and the body's gifts with it; Haki and attributes;
// foes, a boss, a ship and a Sea King called up, and seen to fight and sail;
// a trip to another island, the hour and the weather; and the panel in a
// small window.
//
//   node tools/shot.mjs creative [--parts=menu,fruits,items,character,races,spawn,world,small]
//
// (Clicks go straight to the page's buttons, and the game is stepped inside
// the page: drawn in software, every frame the browser waits for is slow.)
const waitReady = (page, timeout = 240000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
// (the game takes in a key on its next update: one, without drawing a frame)
const update = (page) => page.evaluate(() => window.OP.game.update(1 / 30));
const t0 = Date.now();
const log = (what, v) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${what}`, JSON.stringify(v));
// click the first `sel` whose text is `text` (or holds it, or matches /it/), inside the first `within.sel` holding `within.has`
const click = (page, sel, text = null, within = null) => page.evaluate(([sel, text, within]) => {
  const root = within ? [...document.querySelectorAll(within.sel)].find((e) => e.textContent.includes(within.has)) : document;
  if (!root) throw new Error(`no ${within.sel} with "${within.has}"`);
  const re = text && text.startsWith('/') ? new RegExp(text.slice(1, -1)) : null;
  const el = [...root.querySelectorAll(sel)].find((e) => !text || (re ? re.test(e.textContent.trim()) : e.textContent.trim() === text || e.textContent.includes(text)));
  if (!el) throw new Error(`no ${sel} "${text}"`);
  el.click();
}, [sel, text, within]);
const key = async (page, k) => { await page.keyboard.press(k); await update(page); };
const tab = (page, name) => click(page, '.cr-tabs button', name);
const note = (page) => page.evaluate(() => document.querySelector('.cr-note')?.textContent || null);
const fill = (page, sel, v) => page.evaluate(([sel, v]) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
// a slider moved and let go, as by hand
const slide = (page, name, v) => page.evaluate(([name, v]) => { const s = [...document.querySelectorAll('.cr-slider')].find((e) => e.textContent.startsWith(name)); const i = s.querySelector('input'); i.value = v; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); }, [name, v]);
const snapNow = async (page, snap, name) => { await frames(page); await snap(name); };

export const scenarios = {
  creative: {
    async run(page, snap, args) {
      const want = (k) => !args.parts || String(args.parts).split(',').includes(k);
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);

      // ---- creative mode on from the pause menu: the panel's button beside it, and F1
      if (want('menu')) {
        await key(page, 'Escape');
        await click(page, '.menu-btn', '/^Creative mode/');
        await click(page, '.panel.ask .btn.gold');
        await key(page, 'Escape');
        log('menu', await page.evaluate(() => [...document.querySelectorAll('.menu-btn')].map((b) => b.textContent)));
        await snapNow(page, snap, 'menu');
        await click(page, '.menu-btn', 'Creative panel');
        log('from the menu', await page.evaluate(() => ({ top: window.OP.ui.stack.at(-1)?.id, paused: window.OP.game.paused })));
        await key(page, 'F1');
        log('F1 closes', await page.evaluate(() => ({ open: window.OP.ui.stack.length, paused: window.OP.game.paused })));
        await key(page, 'F1');
        log('F1 opens', await page.evaluate(() => ({ top: window.OP.ui.stack.at(-1)?.id, paused: window.OP.game.paused, blocks: window.OP.ui.blocksInput(), focus: document.activeElement?.className })));
        await key(page, 'Escape');
      } else await page.evaluate(() => window.OP.game.creative.set(true, true));

      // ---- Devil Fruits: two given (by clicking, and by searching), eaten from the hand and from the bag
      if (want('fruits')) {
        await key(page, 'F1');
        await tab(page, 'Devil Fruits');
        await snapNow(page, snap, 'fruits');
        await click(page, '.cr-card .btn', 'Give', { sel: '.cr-card', has: 'Gomu Gomu no Mi' });
        await fill(page, 'input.cr-search', 'flame');
        const shown = await page.evaluate(() => [...document.querySelectorAll('.cr-card b')].map((b) => b.textContent));
        await click(page, '.cr-card .btn', 'Give', { sel: '.cr-card', has: 'Mera Mera no Mi' });
        await fill(page, 'input.cr-search', '');
        log('given', await page.evaluate(() => { const c = window.OP.game.state.char; return { bag: c.inventory.filter((i) => i.id.startsWith('fruit_')).map((i) => i.id), note: document.querySelector('.cr-note').textContent }; }));
        log('search "flame" shows', shown);
        await snapNow(page, snap, 'fruits-given');
        // (Esc in the search box closes the panel too)
        await page.focus('input.cr-search');
        await key(page, 'Escape');
        log('Esc closes', await page.evaluate(() => window.OP.ui.stack.length));
        // the Gomu Gomu no Mi from the hand: on the hotbar, its key, the right button held down
        await key(page, 'Tab');
        await click(page, '.inv-tile[title^="Gomu Gomu"]');
        await click(page, '.det-actions .btn', 'Put on hotbar');
        await click(page, '.hotbar > .slot.empty:not(.toggle)');
        const slot = await page.evaluate(() => window.OP.game.state.char.hotbar.indexOf('item:fruit_gomu'));
        await key(page, 'Escape');
        await page.evaluate(() => { window.OP.hold = true; });
        const hand = String((slot + 1) % 10);
        await page.keyboard.down(hand);
        await update(page);
        await page.keyboard.up(hand);
        await update(page);
        log('eaten from the hand', await page.evaluate(() => {
          const g = window.OP.game, p = g.player, c = g.state.char, input = window.OP.input;
          const held = p.held;
          input.mouse.down[2] = true;
          for (let i = 0; i < 24; i++) g.update(1 / 30);
          const halfway = { eating: p.eating ? +p.eating.t.toFixed(2) : null, fruit: c.fruit };
          for (let i = 0; i < 42; i++) g.update(1 / 30);
          input.mouse.down[2] = false;
          g.update(1 / 30);
          return { slot: c.hotbar.indexOf('item:fruit_gomu'), held, halfway, fruit: c.fruit, p: p.fruit, techniques: c.techniques, inBag: c.inventory.some((i) => i.id === 'fruit_gomu') };
        }));
        await page.evaluate(() => { window.OP.hold = false; });
        // its mastery; then the power taken away again, and the Mera Mera no Mi eaten from the Inventory
        await key(page, 'F1');
        await tab(page, 'Devil Fruits');
        await fill(page, '.cr-yours input[type=range]', '60');
        log('mastery 60', await page.evaluate(() => ({ m: window.OP.game.state.char.fruitMastery, t: window.OP.game.state.char.techniques, label: document.querySelector('.cr-yours .sub:last-child')?.textContent })));
        await snapNow(page, snap, 'fruit-power');
        await click(page, '.cr-yours .btn', 'Remove its power');
        log('removed', await page.evaluate(() => ({ fruit: window.OP.game.state.char.fruit, p: window.OP.game.player.fruit, t: window.OP.game.state.char.techniques, hotbar: window.OP.game.state.char.hotbar.filter(Boolean), note: document.querySelector('.cr-note').textContent })));
        await key(page, 'Escape');
        await key(page, 'Tab');
        await click(page, '.inv-tile[title^="Mera Mera"]');
        await click(page, '.det-actions .btn', 'Eat…');
        await click(page, '.btn', 'Eat it');
        log('eaten from the inventory', await page.evaluate(() => ({ fruit: window.OP.game.state.char.fruit, p: window.OP.game.player.fruit })));
        await key(page, 'Escape');
      }

      // ---- items: weapons, a count, berries
      if (want('items')) {
        await key(page, 'F1');
        await tab(page, 'Items');
        await click(page, '.cr-chip', '/^Weapons/');
        await click(page, '.cr-chip', '/^10$/');
        await click(page, '.cr-item .btn', null, { sel: '.cr-item', has: 'Pirate Cutlass' });
        await click(page, '.cr-chip', '/^1$/');
        await click(page, '.cr-item .btn', null, { sel: '.cr-item', has: 'Yubashiri' });
        await click(page, '.cr-money .btn', '+฿1,000,000');
        log('items', await page.evaluate(() => { const c = window.OP.game.state.char; return { cutlass: c.inventory.filter((i) => i.id === 'cutlass').length, yubashiri: c.inventory.filter((i) => i.id === 'yubashiri').length, berries: c.berries, note: document.querySelector('.cr-note').textContent, rows: document.querySelectorAll('.cr-item').length }; }));
        await snapNow(page, snap, 'items');
        await key(page, 'Escape');
      }

      // ---- character: race, Haki, attributes, bounty
      if (want('character')) {
        await key(page, 'F1');
        await tab(page, 'Character');
        const before = await page.evaluate(() => { const p = window.OP.game.player; window.__look = p.look; return { jump: p.jumpStats(), hp: p.d.maxHp }; });
        await click(page, '.cr-chip', 'Mink');
        log('mink', { before: before.jump, ...await page.evaluate(() => { const p = window.OP.game.player, c = window.OP.game.state.char; return { race: c.race, pRace: p.race, jump: p.jumpStats(), kind: c.look.kind, newLook: p.look !== window.__look, techs: c.techniques, body: document.querySelector('.cr-body')?.textContent, note: document.querySelector('.cr-note').textContent }; }) });
        await slide(page, 'Armament', 60);
        await slide(page, 'Observation', 70);
        await click(page, '.cr-chip', '/^80$/');
        await click(page, '.cr-sec .btn', '฿30,000,000');
        log('haki, level, bounty', await page.evaluate(() => { const c = window.OP.game.state.char, p = window.OP.game.player; return { haki: c.haki, attrs: c.attrs, doriki: p.power(), spirit: p.haki, maxSpirit: p.d.maxHaki, t: c.techniques.filter((t) => t.startsWith('haki')), bounty: c.bounty, faction: c.faction, derived: document.querySelector('.derived')?.textContent }; }));
        await snapNow(page, snap, 'character-mink');
        await key(page, 'Escape');
      }

      // ---- the model in third person for several races (and your own body, in first)
      if (want('races')) {
        await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); g.view3d.rig.setShiftLock?.(false); });
        const face = async (race) => {
          log(race, await page.evaluate((race) => {
            const g = window.OP.game, p = g.player, rig = g.view3d.rig;
            g.creative.setRace(race);
            g.ui.cache.tpHintT = -1; // (the "hold the right mouse button" hint: not over the model)
            rig.tp.dist = 3;
            if (p.controller) p.controller.aimT = 0;
            p.facing = 1.1;
            for (let i = 0; i < 20; i++) g.update(1 / 30);
            // (the camera round in front, a little to one side: it looks back at the face)
            rig.yaw = p.facing + Math.PI - 0.45; rig.pitch = 0.04;
            g.snapCamera?.();
            return { race: p.race, look: p.look.race, kind: p.look.kind || null, jump: p.jumpStats().v, gills: p.gills, swim: p.canSwimRace, breath: p.maxOxygen, reach: p.reach, scale: p.look.scale, hp: p.d.maxHp, lives: g.state.char.maxLives, wings: p.look.wings || null, flame: p.flameLit };
          }, race));
          await step(page, 0.05);
          await page.evaluate(() => { const g = window.OP.game, p = g.player; g.view3d.rig.yaw = p.facing + Math.PI - 0.45; });
          await snapNow(page, snap, '3p-' + race);
        };
        for (const race of ['mink', 'fishman', 'buccaneer', 'lunarian', 'longarm', 'skypiean']) await face(race);
        // a charged jump: how high it goes, by race
        log('charged jump (m)', await page.evaluate(() => {
          const g = window.OP.game, p = g.player, OP = window.OP;
          const jump = (race) => {
            g.creative.setRace(race);
            for (let i = 0; i < 30; i++) g.update(1 / 30);
            OP.key('Space', true);
            for (let i = 0; i < 30; i++) g.update(1 / 30);
            OP.key('Space', false);
            let top = 0;
            for (let i = 0; i < 60; i++) { g.update(1 / 30); top = Math.max(top, p.z || 0); }
            return +top.toFixed(2);
          };
          OP.hold = true;
          const out = { longleg: jump('longleg'), mink: jump('mink'), human: jump('human') };
          OP.hold = false;
          return out;
        }));
        // first person as a Fish-Man, looking down at yourself
        await page.evaluate(() => { const g = window.OP.game; g.creative.setRace('fishman'); g.settings.view = 'first'; g.applySettings(); g.view3d.rig.pitch = -0.95; });
        await step(page, 0.3);
        await page.evaluate(() => { window.OP.game.view3d.rig.pitch = -0.95; });
        await snapNow(page, snap, 'fp-fishman');
      }

      // ---- spawn: foes, a boss, a ship, a Sea King, a school of fish — and they fight, she sails
      if (want('spawn')) {
        log('at the pier', await page.evaluate(() => {
          const g = window.OP.game, p = g.player, isl = g.currentIsland || g.world.nearestIsland(p.x, p.y, 200);
          const d = isl?.docks?.[0];
          if (d) window.OP.teleport(d.land.x, d.land.y);
          if (d) p.facing = Math.atan2(d.end.y - d.land.y, g.world.dx(d.land.x, d.end.x));
          return { island: isl?.name, dock: d ? [Math.round(d.land.x), Math.round(d.land.y)] : null };
        }));
        await step(page, 0.3);
        await key(page, 'F1');
        await tab(page, 'Spawn');
        await click(page, '.cr-chip', 'Foes');
        await click(page, '.cr-chip', '/^3$/');
        await click(page, '.cr-foe', 'Mountain Bandit');
        log('foes', await note(page));
        await snapNow(page, snap, 'spawn-foes');
        await click(page, '.cr-chip', 'Bosses');
        await fill(page, 'input.cr-search', 'arlong');
        await click(page, '.cr-item .btn', 'Fight', { sel: '.cr-item', has: 'Arlong the Saw' });
        log('boss', await note(page));
        await snapNow(page, snap, 'spawn-boss');
        await click(page, '.cr-chip', 'Ships');
        await click(page, '.cr-chip', '/^Pirate$/');
        await click(page, '.cr-chip', '/^Caravel$/');
        await click(page, '.btn', 'Call up a pirate caravel');
        log('ship', await note(page));
        await click(page, '.cr-chip', 'Sea life');
        await click(page, '.cr-item .btn', null, { sel: '.cr-item', has: 'A monster of the Calm Belt' });
        log('sea king', await note(page));
        await click(page, '.cr-item .btn', null, { sel: '.cr-item', has: 'Bright reef fish' });
        log('reef fish', await note(page));
        await snapNow(page, snap, 'spawn-sea');
        await key(page, 'Escape');
        log('after 3 s', await page.evaluate(() => {
          const g = window.OP.game, p = g.player, sp = [...g.creative.spawned];
          const ship = sp.find((s) => s.def?.length);
          const at0 = ship ? [ship.x, ship.y] : null;
          window.OP.hold = true;
          for (let i = 0; i < 90; i++) g.update(1 / 30);
          window.OP.hold = false;
          const foes = sp.filter((a) => a.controller && !a.def?.length && !a.seaCreature && a.name !== 'Sea King');
          return {
            foes: foes.map((a) => ({ name: a.name, boss: a.boss, npcId: a.npcId, alive: a.alive, ai: a.controller.state, onYou: a.controller.target === p, d: +g.world.distance(a.x, a.y, p.x, p.y).toFixed(1) })),
            bossBar: g.bossTarget?.name || null,
            ship: ship && { name: ship.name, type: ship.type, kind: ship.traffic?.kind, moved: +g.world.distance(at0[0], at0[1], ship.x, ship.y).toFixed(1), crew: ship.traffic?.crew?.length ?? null, sail: ship.sail, speed: +ship.speed.toFixed(2), d: +g.world.distance(ship.x, ship.y, p.x, p.y).toFixed(0) },
            seaKing: sp.filter((a) => a.name === 'Sea King').map((a) => ({ alive: a.alive, d: +g.world.distance(a.x, a.y, p.x, p.y).toFixed(1) })),
            schools: g.seaLife.schools.length,
          };
        }));
        await snapNow(page, snap, 'spawned');
        await page.evaluate(() => { const g = window.OP.game, ship = [...g.creative.spawned].find((s) => s.def?.length); if (ship) { g.view3d.rig.yaw = Math.atan2(ship.y - g.player.y, g.world.dx(g.player.x, ship.x)); g.view3d.rig.pitch = -0.05; } });
        await step(page, 0.05);
        await snapNow(page, snap, 'the-ship');
        // beating the boss's stand-in: no great foe beaten, no bounty — the real Arlong still waits in his park
        log('the boss beaten', await page.evaluate(() => {
          const g = window.OP.game, p = g.player, c = g.state.char, a = [...g.creative.spawned].find((x) => x.name === 'Arlong the Saw');
          const bounty = c.bounty || 0;
          a.takeDamage(a.hp + 1, p, {}, g);
          return { state: a.state, bosses: c.bosses, defeated: c.defeated, bountyGained: (c.bounty || 0) - bounty, bossBar: g.bossTarget?.name || null };
        }));
        log('cleared', await page.evaluate(() => window.OP.game.creative.clearSpawned()));
      }

      // ---- world: another island, the hour, a storm
      if (want('world')) {
        await key(page, 'F1');
        await tab(page, 'World');
        await click(page, '.cr-chip', 'Storm');
        await click(page, '.btn', 'Midnight');
        await fill(page, 'input.cr-search', 'logue');
        log('world', await page.evaluate(() => ({ rows: [...document.querySelectorAll('.cr-list .cr-item b')].map((b) => b.textContent), clock: window.OP.game.env.clockString(), storm: window.OP.game.env.storm })));
        await snapNow(page, snap, 'world');
        await click(page, '.cr-item .btn', 'Go', { sel: '.cr-item', has: 'Loguetown' });
        await step(page, 1);
        log('travelled', await page.evaluate(() => { const g = window.OP.game; return { island: g.currentIsland?.name, open: g.ui.stack.length, clock: g.env.clockString(), storm: +g.env.storm.toFixed(2) }; }));
        await snapNow(page, snap, 'loguetown-night');
      }

      // ---- a small window (a phone held sideways)
      if (want('small')) {
        await page.setViewportSize({ width: 844, height: 390 });
        await key(page, 'F1');
        for (const [t, name] of [['Devil Fruits', 'small-fruits'], ['Character', 'small-character'], ['Spawn', 'small-spawn'], ['World', 'small-world']]) {
          await tab(page, t);
          await snapNow(page, snap, name);
        }
        log('small', await page.evaluate(() => { const p = document.querySelector('.panel.cr-wrap').getBoundingClientRect(), m = document.querySelector('.cr-main'); return { panel: [Math.round(p.left), Math.round(p.top), Math.round(p.width), Math.round(p.height)], main: [m.clientHeight, m.scrollHeight], overflowX: document.documentElement.scrollWidth > innerWidth || m.scrollWidth > m.clientWidth }; }));
      }
    },
  },
};
