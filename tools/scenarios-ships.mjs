// The big ships: each One Piece-scale class seen from the water and from its
// own decks, and a walk up the stairs to the quarterdeck.
const waitReady = (page, timeout = 240000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
// (a conversation's words type out a few letters a frame: skip to its choices, as a click does)
const choicesUp = async (page) => {
  await page.locator('.dialogue').waitFor({ timeout: 60000 });
  await page.evaluate(() => { const a = window.OP.game.dialogue.active; if (a && a.typing < a.full.length) window.OP.game.dialogue.advance(); });
  await page.locator('.dialogue .choices button').first().waitFor({ timeout: 30000 });
};
// (the loading screen stays up until the title's backdrop is drawn)
const bootGone = (page) => page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('hidden') || b.classList.contains('done'); }, null, { timeout: 240000, polling: 250 }).then(() => page.waitForTimeout(900));

export const scenarios = {
  bigships: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate((clock) => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = clock; g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); }, +(args.clock || 10.5));
      // open water off Dawn Island
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (const need of [-40, -32, -26]) {
          for (let k = 0; k < 30000; k++) {
            const a = Math.random() * Math.PI * 2, r = isl.radius * (1 + Math.random() * 1.5) + 20 + Math.random() * 60;
            const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
            if (w.sd(x, y) < need) return { x, y, a, sd: +w.sd(x, y).toFixed(1) };
          }
        }
      });
      console.log('spot', JSON.stringify(spot));
      const types = String(args.types || 'carrack,war_galleon,man_o_war,great_galleon,marine_battleship').split(',');
      const views = String(args.views || 'side,bow,deck,fwd,quarter').split(',');
      for (const type of types) {
        const info = await page.evaluate(({ s, type }) => {
          const g = window.OP.game, p = g.player;
          for (const o of g.ships) if (o.name === 'Test Ship') o.alive = false;
          g.ships = g.ships.filter((o) => o.alive !== false);
          const ship = g.giveShip(type, s.x, s.y, 'Test Ship', { heading: 0.4 });
          window.__ship = ship;
          const d = window.OP.debug.dims(ship);
          return { type, L: d.L, B: d.B, deckY: +d.deckY.toFixed(2), yq: +d.yq.toFixed(2), yp: +(d.yp || 0).toFixed(2), yf: +d.yf.toFixed(2), stairs: d.stairs.length, fits: ship.fits(g.world, ship.x, ship.y, ship.heading) };
        }, { s: spot, type });
        console.log('ship', JSON.stringify(info));
        const look = async (name, fn) => {
          await page.evaluate(fn);
          for (let i = 0; i < 4; i++) { await step(page, 0.05); await frames(page, 1); }
          await snap(`${type}-${name}`);
        };
        if (views.includes('side')) await look('side', () => {
          const g = window.OP.game, p = g.player, s = window.__ship, d = window.OP.debug.dims(s);
          const side = s.heading + Math.PI / 2, R = d.L * 0.75 + 10;
          if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
          window.OP.teleport(s.x + Math.cos(side) * R - Math.cos(s.heading) * d.L * 0.1, s.y + Math.sin(side) * R - Math.sin(s.heading) * d.L * 0.1);
          p.z = 0;
          g.view3d.rig.yaw = side + Math.PI; g.view3d.rig.pitch = 0.12;
        });
        if (views.includes('sails')) await look('sails', () => {
          const g = window.OP.game, p = g.player, s = window.__ship, d = window.OP.debug.dims(s);
          // under full sail, seen from off her quarter
          s.sail = 1; s.sailSet = 1; g.env.windAngle = s.heading + 0.3; g.env.windStrength = 1;
          const a = s.heading + Math.PI * 0.62, R = d.L * 0.95 + 12;
          if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
          window.OP.teleport(s.x + Math.cos(a) * R, s.y + Math.sin(a) * R);
          p.z = 0;
          g.view3d.rig.yaw = a + Math.PI; g.view3d.rig.pitch = 0.2;
        });
        if (views.includes('bow')) await look('bow', () => {
          const g = window.OP.game, p = g.player, s = window.__ship, d = window.OP.debug.dims(s);
          const a = s.heading + 0.75, R = d.L * 0.7 + 8;
          window.OP.teleport(s.x + Math.cos(a) * R, s.y + Math.sin(a) * R);
          g.view3d.rig.yaw = a + Math.PI - 0.12; g.view3d.rig.pitch = 0.16;
        });
        await page.evaluate(() => { const s = window.__ship; s.sail = 0; s.sailSet = 0; s.speed = 0; });
        if (views.includes('deck')) await look('deck', () => {
          const g = window.OP.game, s = window.__ship;
          const d = window.OP.debug.dims(s);
          window.OP.debug.onDeck(s, d.hatchT + 0.8 / d.L, 0);
          g.view3d.rig.yaw = s.heading + Math.PI; g.view3d.rig.pitch = 0.08;
        });
        if (views.includes('fwd')) await look('fwd', () => {
          const g = window.OP.game, s = window.__ship;
          window.OP.debug.onDeck(s, 0.4, 0.8);
          g.view3d.rig.yaw = s.heading; g.view3d.rig.pitch = 0.1;
        });
        if (views.includes('quarter')) await look('quarter', () => {
          const g = window.OP.game, s = window.__ship, d = window.OP.debug.dims(s);
          window.OP.debug.onDeck(s, d.tq - 0.05, -0.6);
          g.view3d.rig.yaw = s.heading + 0.25; g.view3d.rig.pitch = -0.1;
        });
        if (views.includes('first')) {
          await look('first-helm', () => {
            const g = window.OP.game, s = window.__ship, d = window.OP.debug.dims(s);
            g.settings.view = 'first'; g.applySettings();
            window.OP.debug.onDeck(s, (d.helmX + d.L / 2) / d.L, 0);
            g.view3d.rig.yaw = s.heading; g.view3d.rig.pitch = -0.1;
          });
          await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); });
        }
        // walking: up the starboard stairs to the quarterdeck, and into the cabin front (blocked)
        if (args.walk !== 'no') {
          const walk = await page.evaluate(async () => {
            const g = window.OP.game, p = g.player, s = window.__ship, d = window.OP.debug.dims(s);
            const st = d.stairs.find((x) => x.la === 'quarter' && x.s > 0);
            const out = {};
            // at the foot of the flight, facing aft
            window.OP.debug.onDeck(s, st.tb + 0.6 / d.L, (st.va + st.vb) / 2);
            out.start = { h: +p.deck.h.toFixed(2), lvl: typeof p.deck.lvl === 'string' ? p.deck.lvl : 'stair' };
            return out;
          });
          await page.evaluate(() => { const g = window.OP.game, s = window.__ship; g.view3d.rig.yaw = s.heading + Math.PI; g.view3d.rig.pitch = 0; window.OP.key('W', true); });
          for (let i = 0; i < 30; i++) { await step(page, 0.1); }
          await page.evaluate(() => window.OP.key('W', false));
          await step(page, 0.3);
          const up = await page.evaluate(() => { const p = window.OP.game.player; return { h: +(p.deck?.h ?? -1).toFixed(2), z: +(p.z || 0).toFixed(2), lvl: p.deck ? (typeof p.deck.lvl === 'string' ? p.deck.lvl : 'stair') : 'off', t: +(p.deck?.t ?? 0).toFixed(3) }; });
          await frames(page, 2);
          await snap(`${type}-climbed`);
          // straight at the cabin front from the middle of the main deck
          await page.evaluate(() => { const g = window.OP.game, s = window.__ship, d = window.OP.debug.dims(s); window.OP.debug.onDeck(s, d.tq + 1.5 / d.L, 0); g.view3d.rig.yaw = s.heading + Math.PI; window.OP.key('W', true); });
          for (let i = 0; i < 25; i++) await step(page, 0.1);
          await page.evaluate(() => window.OP.key('W', false));
          const wall = await page.evaluate(() => { const p = window.OP.game.player; return { h: +(p.deck?.h ?? -1).toFixed(2), lvl: p.deck ? (typeof p.deck.lvl === 'string' ? p.deck.lvl : 'stair') : 'off', t: +(p.deck?.t ?? 0).toFixed(3) }; });
          // off the forecastle's edge: a drop to the main deck
          await page.evaluate(() => { const g = window.OP.game, s = window.__ship, d = window.OP.debug.dims(s); window.OP.debug.onDeck(s, d.tf + 1.0 / d.L, 0); g.view3d.rig.yaw = s.heading + Math.PI; window.OP.key('W', true); });
          let maxZ = 0;
          for (let i = 0; i < 20; i++) { await step(page, 0.1); maxZ = Math.max(maxZ, await page.evaluate(() => window.OP.game.player.z || 0)); }
          await page.evaluate(() => window.OP.key('W', false));
          await step(page, 0.5);
          const drop = await page.evaluate(() => { const p = window.OP.game.player; return { h: +(p.deck?.h ?? -1).toFixed(2), z: +(p.z || 0).toFixed(2), lvl: p.deck ? (typeof p.deck.lvl === 'string' ? p.deck.lvl : 'stair') : 'off' }; });
          // the helm
          const helm = await page.evaluate(() => { const g = window.OP.game, s = window.__ship, p = g.player; const hs = window.OP.debug.deckSpot(s, 'helm'); window.OP.debug.onDeck(s, 0.5, 0); p.x = hs.x; p.y = hs.y; p.updateDeck(g); return g.player.controller?.interaction?.label || null; });
          await step(page, 0.2);
          const label = await page.evaluate(() => window.OP.game.player.controller?.interaction?.label || null);
          console.log('walk', type, JSON.stringify({ up, wall, drop, maxZ: +maxZ.toFixed(2), helm: label || helm }));
        }
      }
      const perf = await page.evaluate(() => { const v = window.OP.game.view3d, i = v.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
      console.log('perf', JSON.stringify(perf));
    },
  },
  // inside the ships: the cabin, the forecastle and the hold, a deck gun up close,
  // and a walk from the main deck down the companionway into the hold and back
  //   --types=sloop,caravel,...  --views=side,deck,gun,cabin,captain,forecastle,hold,down  --view=first|third  [--storm=0..1]
  shipinside: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      // (the weather held: clear, or --storm=0..1 to see it rain)
      await page.evaluate(({ clock, view, storm }) => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = view; g.settings.shiftLock = false; g.applySettings(); g.env.clock = clock; g.env.storm = g.env.stormTarget = storm; g.env.weatherTimer = 1e9; g.env.fog = 0; g.env.rain = 0; document.querySelector('.look-hint')?.remove(); }, { clock: +(args.clock || 10.5), view: args.view || 'first', storm: +(args.storm || 0) });
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (const need of [-40, -32, -26]) {
          for (let k = 0; k < 30000; k++) {
            const a = Math.random() * Math.PI * 2, r = isl.radius * (1 + Math.random() * 1.5) + 20 + Math.random() * 60;
            const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
            if (w.sd(x, y) < need) return { x, y };
          }
        }
        return null;
      });
      const types = String(args.types || 'sloop,caravel,brigantine,frigate,galleon,adam_brig,marine_warship,carrack,war_galleon,man_o_war,great_galleon,marine_battleship').split(',');
      const views = String(args.views || 'side,deck,gun,cabin,hold').split(',');
      for (const type of types) {
        const info = await page.evaluate(({ s, type }) => {
          const g = window.OP.game;
          // (nobody else about: a passing ship given her berth would lie across her)
          for (const o of g.ships) o.alive = false;
          g.ships = [];
          if (g.traffic) { g.traffic.ships = []; g.traffic.t = 1e9; }
          const ship = g.giveShip(type, s.x, s.y, 'Test Ship', { heading: 0.4 });
          ship.anchored = true; ship.speed = 0; ship.sail = 0; ship.sailSet = 0;
          window.__ship = ship;
          const d = window.OP.debug.dims(ship);
          return { type, L: d.L, B: d.B, rooms: d.rooms.map((r) => r.kind), guns: d.guns.length, low: d.lowGuns.length };
        }, { s: spot, type });
        console.log('ship', JSON.stringify(info));
        const look = async (name, fn, arg) => {
          const r = await page.evaluate(fn, arg);
          for (let i = 0; i < 5; i++) { await step(page, 0.05); await frames(page, 1); }
          if (r) console.log(name, JSON.stringify(r));
          await snap(`${type}-${name}`);
        };
        if (views.includes('side')) await look('side', () => {
          const g = window.OP.game, p = g.player, s = window.__ship, d = window.OP.debug.dims(s);
          g.settings.view = 'third'; g.applySettings();
          const side = s.heading + Math.PI / 2 + 0.35, R = d.L * 0.8 + 8;
          if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
          window.OP.teleport(s.x + Math.cos(side) * R, s.y + Math.sin(side) * R);
          p.z = 0;
          g.view3d.rig.yaw = side + Math.PI; g.view3d.rig.pitch = 0.16;
        });
        await page.evaluate((v) => { const g = window.OP.game; g.settings.view = v; g.applySettings(); }, args.view || 'first');
        if (views.includes('deck')) await look('deck', () => {
          const g = window.OP.game, s = window.__ship, d = window.OP.debug.dims(s);
          window.OP.debug.onDeck(s, Math.min(0.9, d.comp.t1 + 1.6 / d.L), 0.3);
          g.view3d.rig.yaw = s.heading + Math.PI; g.view3d.rig.pitch = 0.02;
        });
        if (views.includes('gun')) await look('gun', () => {
          const g = window.OP.game, s = window.__ship, d = window.OP.debug.dims(s);
          const gn = d.guns.find((x) => x.s > 0);
          if (!gn) return { none: true };
          window.OP.debug.onDeck(s, gn.t - 1.4 / d.L, 0);
          g.view3d.rig.yaw = s.heading + 0.9; g.view3d.rig.pitch = -0.35;
          return null;
        });
        if (views.includes('helm')) await look('helm', () => {
          const g = window.OP.game, s = window.__ship, d = window.OP.debug.dims(s);
          window.OP.debug.onDeck(s, (d.wheelU + 1.3 + d.L / 2) / d.L, 0.5);
          window.OP.game.player.deck = window.OP.game.deckAt(window.OP.game.player.x, window.OP.game.player.y, 0, d.yq, s) || window.OP.game.player.deck;
          window.OP.game.player.deck.ship = s;
          g.view3d.rig.yaw = s.heading + Math.PI; g.view3d.rig.pitch = -0.3;
        });
        for (const kind of ['cabin', 'captain', 'forecastle', 'hold']) {
          if (!views.includes(kind)) continue;
          await look(kind, (kind) => {
            const g = window.OP.game, s = window.__ship, d = window.OP.debug.dims(s), room = d.rooms.find((x) => x.kind === kind);
            // (just inside the door, looking in: from the middle, a mast through the room would fill the view)
            const at = kind === 'hold' ? 0.72 : kind === 'forecastle' ? 0.2 : 0.9;
            const r = window.OP.debug.inRoom(s, kind, at, kind === 'hold' ? -(d.mastR + 0.9) : room?.doors?.[0]?.v ?? 0.35);
            g.view3d.rig.yaw = s.heading + (kind === 'forecastle' || kind === 'hold' ? (kind === 'hold' ? Math.PI : 0) : Math.PI); g.view3d.rig.pitch = -0.08;
            return r;
          }, kind);
        }
        if (views.includes('down')) {
          // from the main deck, forward of the hatch, walk aft and down into the hold; then turn round and climb out
          const r0 = await page.evaluate(() => { const g = window.OP.game, s = window.__ship, d = window.OP.debug.dims(s); window.OP.debug.onDeck(s, d.comp.t1 + 1.0 / d.L, 0); g.view3d.rig.yaw = s.heading + Math.PI; g.view3d.rig.pitch = -0.3; window.OP.key('W', true); return { t: +(d.comp.t0).toFixed(3) + '-' + (+d.comp.t1.toFixed(3)), ladder: !!d.comp.ladder }; });
          for (let i = 0; i < 24; i++) await step(page, 0.1);
          await page.evaluate(() => window.OP.key('W', false));
          await step(page, 0.3);
          const r1 = await page.evaluate(() => { const p = window.OP.game.player; return { h: +(p.deck?.h ?? -9).toFixed(2), z: +(p.z || 0).toFixed(2), lvl: p.deck ? (typeof p.deck.lvl === 'string' ? p.deck.lvl : 'stair') : 'off', t: +(p.deck?.t ?? 0).toFixed(3) }; });
          // (walking on aft, off the foot of the ladder, you fetch up against the mainmast: back
          // to the landing, at the ladder's foot, and look up it)
          await page.evaluate(() => { const g = window.OP.game, s = window.__ship, d = window.OP.debug.dims(s), r = d.rooms.find((x) => x.kind === 'hold'); window.OP.debug.inRoom(s, 'hold', (d.comp.t0 - 0.8 / d.L - r.t0) / (r.t1 - r.t0), 0); g.view3d.rig.yaw = s.heading; g.view3d.rig.pitch = 0.3; });
          for (let i = 0; i < 5; i++) { await step(page, 0.05); await frames(page, 1); }
          await snap(`${type}-down`);
          // and climb out
          await page.evaluate(() => { const g = window.OP.game, s = window.__ship; g.view3d.rig.yaw = s.heading; g.view3d.rig.pitch = 0; window.OP.key('W', true); });
          for (let i = 0; i < 30; i++) await step(page, 0.1);
          await page.evaluate(() => window.OP.key('W', false));
          await step(page, 0.3);
          const r2 = await page.evaluate(() => { const p = window.OP.game.player; return { h: +(p.deck?.h ?? -9).toFixed(2), lvl: p.deck ? (typeof p.deck.lvl === 'string' ? p.deck.lvl : 'stair') : 'off', t: +(p.deck?.t ?? 0).toFixed(3) }; });
          // and into the cabin through its door
          const r3a = await page.evaluate(() => { const g = window.OP.game, s = window.__ship, d = window.OP.debug.dims(s); const dr = d.rooms[0].doors[0]; window.OP.debug.onDeck(s, d.tq + 1.2 / d.L, dr.v); g.view3d.rig.yaw = s.heading + Math.PI; window.OP.key('W', true); return null; });
          for (let i = 0; i < 16; i++) await step(page, 0.1);
          await page.evaluate(() => window.OP.key('W', false));
          const r3 = await page.evaluate(() => { const p = window.OP.game.player; return { h: +(p.deck?.h ?? -9).toFixed(2), lvl: p.deck ? (typeof p.deck.lvl === 'string' ? p.deck.lvl : 'stair') : 'off', t: +(p.deck?.t ?? 0).toFixed(3) }; });
          await snap(`${type}-incabin`);
          console.log('walk', type, JSON.stringify({ r0, down: r1, up: r2, cabin: r3 }), void r3a);
        }
      }
    },
  },
  // The rooms cut away above head height and seen from straight overhead, the
  // bow to the right, starboard down: where every piece of furniture stands
  // and which way it faces (and the main deck, the same way, cut just above
  // the rail: the masts and the hatch).
  //   node tools/shot.mjs shipplan [--types=caravel,...] [--rooms=cabin,captain,forecastle,hold,deck] [--cut=metres over the floor]
  shipplan: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'first'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 12; g.env.storm = g.env.stormTarget = 0; g.env.weatherTimer = 1e9; g.env.fog = 0; g.env.rain = 0; document.querySelector('.look-hint')?.remove(); });
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (const need of [-40, -32, -26]) {
          for (let k = 0; k < 30000; k++) {
            const a = Math.random() * Math.PI * 2, r = isl.radius * (1 + Math.random() * 1.5) + 20 + Math.random() * 60;
            const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
            if (w.sd(x, y) < need) return { x, y };
          }
        }
        return null;
      });
      const types = String(args.types || 'sloop,caravel,brigantine,frigate,galleon,adam_brig,marine_warship,carrack,war_galleon,man_o_war,great_galleon,marine_battleship').split(',');
      const rooms = String(args.rooms || 'cabin,captain,forecastle,hold,deck').split(',');
      for (const type of types) {
        await page.evaluate(({ s, type }) => {
          const g = window.OP.game;
          // (nobody else about: no traffic sailing through the cut)
          for (const o of g.ships) o.alive = false;
          g.ships = [];
          if (g.traffic) { g.traffic.ships = []; g.traffic.t = 1e9; }
          const ship = g.giveShip(type, s.x, s.y, 'Test Ship', { heading: 0 });
          ship.anchored = true; ship.speed = 0; ship.sail = 0; ship.sailSet = 0;
          window.__ship = ship;
          window.OP.debug.onDeck(ship, 0.5, 0);
        }, { s: spot, type });
        for (let i = 0; i < 4; i++) { await step(page, 0.05); await frames(page, 1); }
        for (const kind of rooms) {
          const r = await page.evaluate(({ kind, cut }) => {
            const OP = window.OP, g = OP.game, v3 = g.view3d, THREE = OP.THREE, s = window.__ship, d = OP.debug.dims(s);
            const room = kind === 'deck' ? { kind, t0: d.tq, t1: d.fore ? d.tf : 0.97, floor: d.deckY } : d.rooms.find((x) => x.kind === kind);
            if (!room) return null;
            const sv = v3.shipViews.get(s);
            if (!sv) return { error: 'no ship view' };
            // (her insides shown, nothing casting shadows over them, no sails)
            sv.root.traverse((o) => { o.castShadow = false; });
            for (const sl of sv.sails) sl.mesh.visible = false;
            const u0 = -d.L / 2 + room.t0 * d.L, u1 = -d.L / 2 + room.t1 * d.L, W = d.B + 1;
            const aspect = innerWidth / innerHeight, half = Math.max((u1 - u0 + 1.2) / aspect, W) / 2;
            const cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 60);
            const cx = sv.root.position.x + (u0 + u1) / 2, cz = sv.root.position.z;
            cam.position.set(cx, room.floor + 20, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, room.floor, cz);
            cam.updateProjectionMatrix(); cam.updateMatrixWorld();
            // (just under the beams overhead: the hammocks and the lanterns on the walls are there to see)
            const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), sv.root.position.y + room.floor + (kind === 'deck' ? 1.4 : cut || Math.min(room.ceil - room.floor - 0.08, 2.3)));
            window.__plan = { cam, plane };
            if (!v3.__draw) v3.__draw = v3.draw;
            v3.draw = () => {
              // (level: her roll and pitch would tilt the decks through the cut)
              sv.root.rotation.set(0, -s.heading, 0, 'YXZ'); sv.root.updateMatrixWorld(true);
              if (sv.inside) sv.inside.visible = true;
              v3.renderer.clippingPlanes = [window.__plan.plane];
              v3.renderer.render(v3.scene, window.__plan.cam);
              v3.renderer.clippingPlanes = [];
            };
            return { kind, u: [+u0.toFixed(1), +u1.toFixed(1)], floor: +room.floor.toFixed(2), items: d.furniture.filter((f) => f.room === kind).map((f) => f.kind).join(',') };
          }, { kind, cut: +(args.cut || 0) });
          if (!r) continue;
          for (let i = 0; i < 2; i++) { await step(page, 0.02); await frames(page, 1); }
          console.log('plan', type, JSON.stringify(r));
          await snap(`${type}-${kind}`);
        }
        await page.evaluate(() => { const v3 = window.OP.game.view3d; if (v3.__draw) { v3.draw = v3.__draw; delete v3.__draw; } });
      }
    },
  },
  // A look round aboard: stand at t along (0 stern → 1 bow), v across, on a
  // deck (or in a room), and look yaw (radians off the bow) and pitch.
  //   node tools/shot.mjs shiplook --type=great_galleon --at=0.72,2,0,-0.1[;0.3,0,3.1,0] [--room=hold] [--view=first|third] [--clock=10.5] [--storm=0..1]
  shiplook: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      // (the weather held: clear, or --storm=0..1 to see it rain)
      await page.evaluate(({ clock, view, storm }) => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = view; g.settings.shiftLock = false; g.applySettings(); g.env.clock = clock; g.env.storm = g.env.stormTarget = storm; g.env.weatherTimer = 1e9; g.env.fog = 0; g.env.rain = 0; document.querySelector('.look-hint')?.remove(); }, { clock: +(args.clock || 10.5), view: args.view || 'first', storm: +(args.storm || 0) });
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (const need of [-40, -32, -26]) for (let k = 0; k < 30000; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius * (1 + Math.random() * 1.5) + 20 + Math.random() * 60;
          const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
          if (w.sd(x, y) < need) return { x, y };
        }
        return null;
      });
      await page.evaluate(({ s, type }) => {
        const g = window.OP.game;
        for (const o of g.ships) o.alive = false;
        g.ships = [];
        if (g.traffic) { g.traffic.ships = []; g.traffic.t = 1e9; }
        const ship = g.giveShip(type, s.x, s.y, 'Test Ship', { heading: 0.4 });
        ship.anchored = true; ship.speed = 0; ship.sail = 0; ship.sailSet = 0;
        window.__ship = ship;
      }, { s: spot, type: args.type || 'caravel' });
      for (const [i, at] of String(args.at || '0.5,0,0,0').split(';').entries()) {
        const [t, v, yaw, pitch] = at.split(',').map(Number);
        const r = await page.evaluate(({ t, v, yaw, pitch, room }) => {
          const g = window.OP.game, s = window.__ship, p = g.player;
          if (room) {
            const d = window.OP.debug.dims(s), rm = d.rooms.find((x) => x.kind === room);
            window.OP.debug.onDeck(s, t, v);
            const dk = g.deckAt(p.x, p.y, 0, rm.floor, s);
            if (dk) { p.deck = dk; dk.ship = s; }
            p.z = 0;
          } else window.OP.debug.onDeck(s, t, v);
          g.view3d.rig.yaw = s.heading + (yaw || 0); g.view3d.rig.pitch = pitch || 0;
          return { h: +(p.deck?.h ?? -1).toFixed(2), lvl: p.deck ? (typeof p.deck.lvl === 'string' ? p.deck.lvl : 'stair') : 'off', solid: +(p.deck?.solid || 0).toFixed(2) };
        }, { t, v, yaw, pitch, room: args.room || null });
        for (let k = 0; k < 5; k++) { await step(page, 0.05); await frames(page, 1); }
        console.log('look', i, JSON.stringify({ t, v, yaw, pitch, ...r }));
        await snap(`${args.type || 'caravel'}-${i}`);
      }
    },
  },
  // Onto a big ship from the pier she's berthed at: from the planks of the
  // pier head alongside her waist, a run and a jump across to her side, up
  // over her rail and down on her main deck.
  //   node tools/shot.mjs pierboard [--types=caravel,great_galleon] [--island=dawn_island] [--charge=0..1]
  pierboard: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 10.5; g.env.storm = g.env.stormTarget = 0; g.env.weatherTimer = 1e9; g.env.fog = 0; g.env.rain = 0; document.querySelector('.look-hint')?.remove(); });
      for (const type of String(args.types || 'caravel,great_galleon').split(',')) {
        const info = await page.evaluate(({ type, island }) => {
          const g = window.OP.game, w = g.world, p = g.player, isl = w.islands.find((i) => i.id === island), dock = isl.docks[0];
          if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
          for (const o of g.ships) if (o.name === 'Pier Test') o.alive = false;
          g.ships = g.ships.filter((o) => o.alive !== false);
          const s = g.giveShip(type, dock.moor.x, dock.moor.y, 'Pier Test');
          s.anchored = true; s.speed = 0; s.sail = 0;
          window.__ship = s;
          // where the pier head lies along her, and on which side
          const d = window.OP.debug.dims(s), c = Math.cos(s.heading), sn = Math.sin(s.heading);
          const ex = w.dx(s.x, dock.end.x + 0.5), ey = dock.end.y + 0.5 - s.y, u = ex * c + ey * sn, side = Math.sign(-ex * sn + ey * c) || 1;
          const t = (u + d.L / 2) / d.L;
          // from her side there, out across the water to the planks
          const edge = window.OP.debug.deckToWorld(s, t, side * (d.B / 2));
          const ox = -sn * side, oy = c * side;
          let k = 0;
          while (k < 8 && !w.isDock(edge.x + ox * k, edge.y + oy * k)) k += 0.1;
          // (a stride or two back from the edge of the planks)
          window.OP.teleport(edge.x + ox * (k + 1.2), edge.y + oy * (k + 1.2));
          g.view3d.rig.yaw = Math.atan2(-oy, -ox); g.view3d.rig.pitch = 0.1;
          return { type, t: +t.toFixed(3), alongside: d.fore && t > d.tf ? 'forecastle' : d.stairs.find((x) => x.la === 'quarter')?.tb < t ? 'waist' : 'quarterdeck', gap: +(k).toFixed(1), rail: +(d.deckY + d.bulH).toFixed(2), onPier: w.isDock(p.x, p.y) };
        }, { type, island: args.island || 'dawn_island' });
        for (let i = 0; i < 4; i++) { await step(page, 0.05); await frames(page, 1); }
        await snap(`${type}-pier`);
        // a stride and a jump (a plain one: tap Space; --charge=0..1 to hold it)
        await page.evaluate(() => window.OP.key('W', true));
        for (let i = 0; i < 2; i++) await step(page, 0.05);
        const jumped = await page.evaluate((k) => { const g = window.OP.game; return g.player.tryJump(g, k); }, +(args.charge || 0));
        let aboard = null;
        for (let i = 0; i < 30 && !aboard; i++) {
          await step(page, 0.1);
          aboard = await page.evaluate(() => { const p = window.OP.game.player; return p.deck?.ship === window.__ship && !p.climb ? { lvl: typeof p.deck.lvl === 'string' ? p.deck.lvl : 'stair', h: +p.deck.h.toFixed(2) } : null; });
        }
        await page.evaluate(() => window.OP.key('W', false));
        await step(page, 0.3);
        const end = await page.evaluate(() => { const p = window.OP.game.player; return { deck: p.deck ? (typeof p.deck.lvl === 'string' ? p.deck.lvl : 'stair') : null, water: !!p.inWater }; });
        console.log('pierboard', JSON.stringify({ ...info, jumped, aboard, end }));
        await frames(page, 2);
        await snap(`${type}-aboard`);
      }
    },
  },
  // a broadside: the balls arc out of the ports and splash down (--types=frigate,sloop)
  broadside: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 10.5; g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (const need of [-40, -32, -26]) for (let k = 0; k < 30000; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius * (1 + Math.random() * 1.5) + 20 + Math.random() * 60;
          const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
          if (w.sd(x, y) < need) return { x, y };
        }
        return null;
      });
      for (const type of String(args.types || 'frigate,sloop').split(',')) {
        await page.evaluate(({ s, type }) => {
          const g = window.OP.game;
          for (const o of g.ships) if (o.name === 'Test Ship') o.alive = false;
          g.ships = g.ships.filter((o) => o.alive !== false);
          const ship = g.giveShip(type, s.x, s.y, 'Test Ship', { heading: 0.4 });
          ship.anchored = true;
          window.__ship = ship;
          const d = window.OP.debug.dims(ship), p = g.player;
          // watching from off her bow, her starboard broadside toward the camera's right
          if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
          const a = ship.heading + 0.5, R = d.L * 0.9 + 10;
          window.OP.teleport(ship.x + Math.cos(a) * R, ship.y + Math.sin(a) * R);
          g.view3d.rig.yaw = a + Math.PI + 0.35; g.view3d.rig.pitch = 0.12;
        }, { s: spot, type });
        for (let i = 0; i < 6; i++) { await step(page, 0.05); await frames(page, 1); }
        const r = await page.evaluate(() => { const g = window.OP.game, s = window.__ship; const side = s.heading + Math.PI / 2; const ok = s.fireBroadside(g, s.x + Math.cos(side) * 12, s.y + Math.sin(side) * 12, g.player); return { ok, shot: s.shot, cap: s.shotCap }; });
        console.log('fire', type, JSON.stringify(r));
        await page.evaluate(() => { window.OP.hold = true; });
        for (let i = 0; i < 4; i++) {
          await page.evaluate(() => { const g = window.OP.game; for (let k = 0; k < 5; k++) g.update(1 / 30); g.render(); });
          await snap(`${type}-fire${i}`);
        }
        await page.evaluate(() => { window.OP.hold = false; });
        await step(page, 1.5);
      }
    },
  },
  // a raid on a big pirate ship: the crew come up the stairs after you on the quarterdeck
  bigraid: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 11; g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (const need of [-40, -32, -26]) {
          for (let k = 0; k < 30000; k++) {
            const a = Math.random() * Math.PI * 2, r = isl.radius * (1 + Math.random() * 1.5) + 20 + Math.random() * 60;
            const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
            if (w.sd(x, y) < need) return { x, y };
          }
        }
      });
      const made = await page.evaluate(({ s, type }) => {
        const g = window.OP.game, p = g.player, T = g.traffic;
        const o = T.spawn({ kind: 'pirate', type, x: s.x, y: s.y, heading: 0, level: 6, dest: { x: s.x + 400, y: s.y } });
        window.__ship = o;
        const d = window.OP.debug.dims(o);
        // up on the quarterdeck, by the wheel
        window.OP.debug.onDeck(o, d.tq - 2.5 / d.L, 0.6);
        p.hp = p.d.maxHp = 99999;
        return { type: o.type, L: d.L, crew: (o.traffic.crew || []).length };
      }, { s: spot, type: args.type || 'war_galleon' });
      console.log('made', JSON.stringify(made));
      const levels = () => page.evaluate(() => {
        const g = window.OP.game, o = window.__ship;
        const out = {};
        for (const a of o.traffic.crew || []) {
          if (!a.alive) continue;
          const k = !a.deck ? 'off' : typeof a.deck.lvl === 'string' ? a.deck.lvl : 'stair';
          out[k] = (out[k] || 0) + 1;
        }
        return { lv: out, raided: o.traffic.raided, player: g.player.deck ? (typeof g.player.deck.lvl === 'string' ? g.player.deck.lvl : 'stair') : 'off' };
      });
      console.log('t0', JSON.stringify(await levels()));
      for (let k = 1; k <= 6; k++) {
        for (let i = 0; i < 20; i++) await step(page, 0.1);
        console.log('t' + (k * 2), JSON.stringify(await levels()));
        if (k === 3) {
          await page.evaluate(() => { const g = window.OP.game, o = window.__ship; g.view3d.rig.yaw = o.heading; g.view3d.rig.pitch = -0.35; });
          await frames(page, 3);
          await snap('fight');
        }
      }
      const hp = await page.evaluate(() => Math.round(window.OP.game.player.hp));
      console.log('player hp', hp);
    },
  },
  // buy-and-sail: a big ship berthed at Foosha's pier, boarded from it and sailed out
  bigsail: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 10.5; g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      const info = await page.evaluate((type) => {
        const g = window.OP.game, w = g.world, p = g.player;
        const isl = w.islands.find((i) => i.id === (window.__isl || 'dawn_island'));
        const dock = isl.docks[0];
        const s = g.giveShip(type, dock.moor.x, dock.moor.y, 'Big Test');
        window.__ship = s; window.__dock = dock;
        return { dock: { end: dock.end, dir: [dock.dirX, dock.dirY], moor: dock.moor }, ship: { x: +s.x.toFixed(1), y: +s.y.toFixed(1), h: +s.heading.toFixed(2), fits: s.fits(w, s.x, s.y, s.heading) }, gap: +w.distance(s.x, s.y, dock.end.x, dock.end.y).toFixed(1) };
      }, args.type || 'war_galleon');
      console.log('berth', JSON.stringify(info));
      // on the pier head, looking at her
      await page.evaluate(() => {
        const g = window.OP.game, p = g.player, s = window.__ship, dk = window.__dock;
        window.OP.teleport(dk.end.x + 0.5 - dk.dirX * 1.5, dk.end.y + 0.5 - dk.dirY * 1.5);
        g.view3d.rig.yaw = Math.atan2(s.y - p.y, g.world.dx(p.x, s.x)); g.view3d.rig.pitch = 0.18;
      });
      for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('berthed');
      const label = await page.evaluate(() => window.OP.game.player.controller?.interaction?.label || null);
      console.log('prompt on the pier:', label);
      await page.evaluate(() => { window.OP.key('E', true); }); await step(page, 0.05); await page.evaluate(() => { window.OP.key('E', false); }); await step(page, 0.2);
      const boarded = await page.evaluate(() => { const g = window.OP.game; return { mode: g.player.mode, ship: g.player.ship?.name }; });
      console.log('boarded', JSON.stringify(boarded));
      await page.evaluate(() => { const g = window.OP.game; g.env.windAngle = window.__ship.heading; g.env.windStrength = 1; window.OP.key('W', true); });
      const track = [];
      for (let i = 0; i < 16; i++) { await step(page, 0.5); track.push(await page.evaluate(() => { const s = window.__ship; return [+s.x.toFixed(1), +s.y.toFixed(1), +s.speed.toFixed(1)]; })); }
      await page.evaluate(() => window.OP.key('W', false));
      console.log('sailing', JSON.stringify(track.filter((_, i) => i % 3 === 0)));
      await frames(page, 3);
      await snap('helm');
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); });
      await step(page, 0.1); await frames(page, 3);
      await snap('helm-first');
      const perf = await page.evaluate(() => { const v = window.OP.game.view3d, i = v.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
      console.log('perf', JSON.stringify(perf));
    },
  },

  // The shipwright on the starter pier: E to talk (Spawn ship, Buy ships,
  // Goodbye), your ships, the ships for sale, a sloop bought and launched at
  // the pier (the rowboat into the yard), then the sloop sent off out to sea
  // and brought round again. Esc closes the menu.
  //   node tools/shot.mjs shipwright
  shipwright: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); g.env.clock = 10.5; g.env.storm = 0; g.env.fog = 0; g.env.rain = 0; document.querySelector('.look-hint')?.remove(); });
      for (let i = 0; i < 6; i++) await step(page, 0.1);
      const info = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, c = g.state.char;
        const isl = w.islandAt(c.spawn.x, c.spawn.y) || w.nearestIsland(c.spawn.x, c.spawn.y, 200);
        const dock = isl.docks[0];
        const sw = g.actors.find((a) => a.shipwright?.dock === dock);
        window.__dock = dock; window.__sw = sw;
        const boat = g.ships.find((s) => s.owner === 'player');
        const all = g.actors.filter((a) => a.shipwright).map((a) => ({ n: a.name, pier: w.isDock(a.x, a.y), water: w.isLiquid(a.x, a.y) }));
        return { island: isl.name, docks: isl.docks.length, dock: dock.name, sw: sw && { name: sw.name, title: sw.title, x: +sw.x.toFixed(2), y: +sw.y.toFixed(2), onPier: w.isDock(sw.x, sw.y), water: w.isLiquid(sw.x, sw.y), prop: w.hitsProp(sw.x, sw.y, 0.3), talk: !!sw.talk, look: [sw.look.topStyle, sw.look.hat, sw.look.waist, sw.look.shoeStyle] }, shipwrightsHere: all, boat: boat && { name: boat.name, pier: boat.uid && g.state.char.fleet.some((f) => f.uid === boat.uid) }, fleet: c.fleet.map((f) => f.name) };
      });
      console.log('pier', JSON.stringify(info));
      const settle = async (n = 6) => { for (let i = 0; i < n; i++) { await step(page, 0.05); await frames(page, 1); } };
      // 1. walking out along the pier: the shipwright on the head's shoulder, the rowboat alongside the other
      await page.evaluate(() => {
        const g = window.OP.game, dk = window.__dock, sw = window.__sw;
        window.OP.teleport(dk.end.x + 0.5 - dk.dirX * 7, dk.end.y + 0.5 - dk.dirY * 7);
        const p = g.player, hx = dk.end.x + 0.5 - dk.dirX, hy = dk.end.y + 0.5 - dk.dirY;
        g.view3d.rig.yaw = Math.atan2((hy + sw.y) / 2 - p.y, g.world.dx(p.x, (hx + sw.x) / 2)); g.view3d.rig.pitch = -0.12;
      });
      await settle();
      await snap('pier');
      // 2. up to him: the prompt (the crosshair on him)
      const near = await page.evaluate(() => {
        const g = window.OP.game, dk = window.__dock, sw = window.__sw, w = g.world;
        // (on the walkway, a couple of steps from him, looking at him)
        const ex = dk.end.x + 0.5, ey = dk.end.y + 0.5, t = w.dx(ex, sw.x) * dk.dirX + (sw.y - ey) * dk.dirY;
        const ax = ex + dk.dirX * t, ay = ey + dk.dirY * t, d = Math.hypot(w.dx(ax, sw.x), sw.y - ay);
        window.OP.teleport(sw.x - w.dx(ax, sw.x) / d * 2, sw.y - (sw.y - ay) / d * 2);
        const p = g.player;
        g.view3d.rig.yaw = Math.atan2(sw.y - p.y, w.dx(p.x, sw.x)); g.view3d.rig.pitch = -0.1;
        return { d: +w.distance(p.x, p.y, sw.x, sw.y).toFixed(2), onPier: w.isDock(p.x, p.y) };
      });
      await settle();
      const prompt = await page.evaluate(() => window.OP.game.player.controller?.interaction?.label || null);
      console.log('near him', JSON.stringify(near), 'prompt:', prompt);
      await snap('talk-prompt');
      // 3. E: the conversation, three choices
      await page.evaluate(() => { window.OP.key('E', true); }); await step(page, 0.05); await page.evaluate(() => { window.OP.key('E', false); });
      await choicesUp(page);
      await frames(page, 4);
      const choices = await page.evaluate(() => [...document.querySelectorAll('.dialogue .choices button')].map((b) => b.textContent));
      console.log('choices', JSON.stringify(choices));
      await snap('dialogue');
      // 4. Spawn ship: the ships you own
      await page.locator('.dialogue .choices button', { hasText: 'Spawn ship' }).click();
      await frames(page, 4);
      const spawnList = await page.evaluate(() => [...document.querySelectorAll('.shipwright .row-item')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
      console.log('spawn menu', JSON.stringify(spawnList));
      await snap('spawn-menu');
      // 5. Buy ships: with 20,000 berries a sloop is in reach, the rest greyed out
      await page.evaluate(() => { window.OP.game.state.char.berries = 20000; });
      await page.locator('.shipwright .tabs button', { hasText: 'Buy ships' }).click();
      await frames(page, 4);
      const buyList = await page.evaluate(() => [...document.querySelectorAll('.shipwright .row-item')].map((r) => ({ t: r.innerText.replace(/\s+/g, ' ').trim().slice(0, 150), dim: r.classList.contains('cant'), off: r.querySelector('button').disabled })));
      console.log('buy menu', JSON.stringify(buyList, null, 1));
      await snap('buy-menu');
      // 6. buy the sloop: name her, and she's launched at this pier
      await page.locator('.shipwright .row-item', { hasText: 'Sloop' }).locator('button').click();
      await page.locator('#ask-input').waitFor({ timeout: 10000 });
      await page.fill('#ask-input', 'Sea Sparrow');
      await page.locator('.ask .btn.gold').click();
      await frames(page, 3);
      await step(page, 0.2);
      const bought = await page.evaluate(() => {
        const g = window.OP.game, c = g.state.char, w = g.world, dk = window.__dock;
        const mine = g.ships.filter((s) => s.owner === 'player' && s.alive !== false);
        return { berries: c.berries, panelOpen: !!document.querySelector('.shipwright'), fleet: c.fleet.map((f) => `${f.name} (${f.type})`), afloat: mine.map((s) => ({ n: s.name, atThisPier: w.distance(s.x, s.y, dk.end.x + 0.5, dk.end.y + 0.5) < s.def.length * 0.6 + 10 })), active: c.fleet.find((f) => f.uid === c.activeShip)?.name };
      });
      console.log('bought', JSON.stringify(bought));
      // 7. she's berthed at the pier (seen from the pier head, third person)
      await page.evaluate(() => {
        const g = window.OP.game, dk = window.__dock, s = g.ships.find((x) => x.owner === 'player' && x.alive !== false);
        g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings();
        window.OP.teleport(dk.end.x + 0.5 - dk.dirX * 4, dk.end.y + 0.5 - dk.dirY * 4);
        const p = g.player;
        g.view3d.rig.yaw = Math.atan2(s.y - p.y, g.world.dx(p.x, s.x)) - 0.35; g.view3d.rig.pitch = -0.2; g.view3d.rig.tp.dist = 6;
      });
      await settle(8);
      await snap('bought-berthed');
      // 8. she's sent off out to sea; the shipwright brings her round again (only one of her afloat)
      const away = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, dk = window.__dock, s = g.ships.find((x) => x.owner === 'player' && x.alive !== false);
        for (let r = 60; r < 260; r += 10) {
          for (let a = 0; a < Math.PI * 2; a += 0.25) {
            const x = w.wx(dk.end.x + Math.cos(a) * r), y = dk.end.y + Math.sin(a) * r;
            if (w.sd(x, y) < -12 && s.fits(w, x, y, a)) { s.x = x; s.y = y; s.heading = a; return { r, name: s.name, uid: s.uid }; }
          }
        }
        return null;
      });
      console.log('sent away', JSON.stringify(away));
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); g.emit('talk', window.__sw); });
      await choicesUp(page);
      await page.locator('.dialogue .choices button', { hasText: 'Spawn ship' }).click();
      await frames(page, 4);
      const spawnList2 = await page.evaluate(() => [...document.querySelectorAll('.shipwright .row-item')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
      console.log('spawn menu, later', JSON.stringify(spawnList2));
      await snap('spawn-menu-2');
      await page.locator('.shipwright .row-item', { hasText: 'Sea Sparrow' }).locator('button').click();
      await frames(page, 3);
      await step(page, 0.3);
      const back = await page.evaluate((uid) => {
        const g = window.OP.game, w = g.world, dk = window.__dock, c = g.state.char;
        const copies = g.ships.filter((s) => s.uid === uid && s.alive !== false);
        const s = copies[0];
        return { copies: copies.length, atThisPier: !!s && w.distance(s.x, s.y, dk.end.x + 0.5, dk.end.y + 0.5) < s.def.length * 0.6 + 10, fits: !!s && s.fits(w, s.x, s.y, s.heading), fleet: c.fleet.length, active: c.activeShip === uid, playerShip: g.player.ship === s };
      }, away?.uid);
      console.log('brought round', JSON.stringify(back));
      // 9. Esc closes a menu (and hands the mouse back to the view)
      await page.evaluate(() => { window.OP.debug.openShipwright(window.OP.game, { dock: window.__dock, island: window.__dock && window.OP.game.world.islandAt(window.__sw.x, window.__sw.y), npc: window.__sw, tab: 'buy' }); });
      await frames(page, 2);
      const openBefore = await page.evaluate(() => ({ panel: !!document.querySelector('.shipwright'), blocks: window.OP.ui.blocksInput() }));
      await page.keyboard.press('Escape');
      await frames(page, 4);
      const openAfter = await page.evaluate(() => ({ panel: !!document.querySelector('.shipwright'), blocks: window.OP.ui.blocksInput(), paused: window.OP.game.paused }));
      console.log('esc', JSON.stringify({ openBefore, openAfter }));
      await page.evaluate(() => {
        const g = window.OP.game, dk = window.__dock, s = g.ships.find((x) => x.owner === 'player' && x.alive !== false);
        g.settings.view = 'third'; g.applySettings();
        window.OP.teleport(dk.end.x + 0.5 - dk.dirX * 4, dk.end.y + 0.5 - dk.dirY * 4);
        const p = g.player;
        g.view3d.rig.yaw = Math.atan2(s.y - p.y, g.world.dx(p.x, s.x)) + 0.3; g.view3d.rig.pitch = -0.22; g.view3d.rig.tp.dist = 6;
      });
      await settle(8);
      await snap('brought-round');
    },
  },

  // Your ships can't break (SHIPS_UNBREAKABLE): a broadside of cannonballs,
  // a monstrous blow, a storm and a crash into the rocks leave her hull
  // whole, while a pirate ship still sinks. No screenshots but the helm.
  //   node tools/shot.mjs unbreakable [--shot=no]
  unbreakable: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 10.5; g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      await step(page, 0.5);
      // your caravel out in open water, you at her helm, and a pirate brigantine abeam of her
      const setup = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player, c = g.state.char;
        const isl = w.nearestIsland(p.x, p.y, 300);
        let spot = null;
        for (let k = 0; k < 40000 && !spot; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius + 40 + Math.random() * 80;
          const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
          if (w.sd(x, y) < -30) spot = { x: w.wx(x), y };
        }
        const mine = g.giveShip('caravel', spot.x, spot.y, 'Test Caravel', { heading: 0 });
        p.mode = 'sail'; p.ship = mine; p.onShip = true; mine.captain = p; p.x = mine.x; p.y = mine.y;
        const foe = g.traffic.spawn({ kind: 'pirate', type: 'brigantine', x: w.wx(mine.x), y: mine.y - 11, heading: 0, level: 30 });
        foe.provoked = true;
        window.__mine = mine; window.__foe = foe;
        return { spot, mine: { hull: mine.hull, max: mine.maxHull, unbreakable: mine.unbreakable }, foe: foe && { hull: foe.hull, max: foe.maxHull, unbreakable: foe.unbreakable }, inFleet: !!c.fleet?.some((f) => f.uid === mine.uid) };
      });
      console.log('setup', JSON.stringify(setup));
      // count every blow that lands on her
      await page.evaluate(() => { const s = window.__mine, dmg = s.damage.bind(s); window.__hits = { n: 0, total: 0 }; s.damage = (n, a, i) => { window.__hits.n++; window.__hits.total += n; return dmg(n, a, i); }; });
      // the pirate's broadsides, at point-blank range
      for (let k = 0; k < 8; k++) {
        await page.evaluate(() => { const g = window.OP.game, s = window.__mine, f = window.__foe; f.cannonCd = 0; f.shot = f.shotCap; f.fireBroadside(g, s.x, s.y, { name: f.name, faction: 'pirate', isShip: true, power: () => 300 }); });
        await step(page, 1.2);
      }
      const fired = await page.evaluate(() => { const s = window.__mine; return { hits: window.__hits, hull: s.hull, max: s.maxHull, sunk: s.sunk, alive: s.alive !== false }; });
      console.log('after 8 broadsides', JSON.stringify(fired));
      if (args.shot !== 'no') { await frames(page, 3); await snap('under-fire'); }
      // a blow to sink a man-o'-war, a storm, and a crash into the rocks
      const blow = await page.evaluate(() => { const s = window.__mine; s.damage(1e6, window.__foe, {}); return { hull: s.hull, sunk: s.sunk }; });
      await page.evaluate(() => { window.OP.game.env.storm = 1; });
      await step(page, 15);
      const storm = await page.evaluate(() => { const g = window.OP.game, s = window.__mine; g.env.storm = 0; return { hull: s.hull, sunk: s.sunk }; });
      const crash = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, s = window.__mine, p = g.player;
        // (heading straight for the nearest coast, flat out)
        const isl = w.nearestIsland(s.x, s.y, 400);
        let best = null;
        for (let a = 0; a < Math.PI * 2; a += 0.05) {
          for (let r = 4; r < 140; r += 1) {
            const x = w.wx(s.x + Math.cos(a) * r), y = s.y + Math.sin(a) * r;
            if (!w.isLiquid(x, y)) { if (!best || r < best.r) best = { a, r }; break; }
          }
        }
        if (!best) return null;
        // (brought in close, bow on)
        const r0 = Math.max(0, best.r - s.def.length * 0.5 - 4);
        s.x = w.wx(s.x + Math.cos(best.a) * r0); s.y += Math.sin(best.a) * r0; s.heading = best.a; s.speed = 14;
        p.x = s.x; p.y = s.y;
        window.__hitsBefore = window.__hits.n;
        return { isl: isl?.name, dist: best.r };
      });
      for (let i = 0; i < 12; i++) { await page.evaluate(() => { window.__mine.speed = Math.max(window.__mine.speed, 12); }); await step(page, 0.1); }
      const afterCrash = await page.evaluate(() => { const s = window.__mine; return { hull: s.hull, sunk: s.sunk, crashed: window.__hits.n > window.__hitsBefore }; });
      // everyone else's ships still sink
      const foe = await page.evaluate(() => { const f = window.__foe; f.damage(1e6, window.OP.game.player, {}); return { sunk: f.sunk, hull: f.hull }; });
      // (and a Navy escort sailing with you is as sound as your own)
      const escort = await page.evaluate(() => { const g = window.OP.game, s = window.__mine; const e = g.addShip({ type: 'brigantine', x: g.world.wx(s.x + 30), y: s.y + 30, owner: 'marine', faction: 'marine', name: 'Escort Test' }); e.escortOf = 'player'; e.damage(1e6, null, {}); const r = { hull: e.hull, max: e.maxHull, sunk: e.sunk }; e.alive = false; return r; });
      const hud = await page.evaluate(() => document.querySelector('.shiphud .bar.hull span')?.textContent || null);
      console.log('unbreakable', JSON.stringify({ blow, storm, crash: afterCrash, foe, escort, hud }));
      const ok = fired.hull === fired.max && !fired.sunk && fired.hits.n > 0 && !blow.sunk && blow.hull === fired.max && !storm.sunk && storm.hull === fired.max && !afterCrash.sunk && afterCrash.hull === fired.max && foe.sunk && !escort.sunk && escort.hull === escort.max;
      console.log(ok ? 'UNBREAKABLE: OK' : 'UNBREAKABLE: FAILED');
      if (!ok) throw new Error('a ship of yours took damage (or a pirate did not)');
    },
  },

  // Owned ships in the save: a bought one and a laid-up one survive a reload,
  // and an old save (no fleet, two ships afloat) gets them as owned ships.
  //   node tools/shot.mjs fleetsave
  fleetsave: {
    async run(page) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.6);
      const before = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, c = g.state.char;
        const isl = w.islandAt(c.spawn.x, c.spawn.y) || w.nearestIsland(c.spawn.x, c.spawn.y, 200);
        const r = window.OP.debug.launchShip(g, { type: 'sloop', name: 'Save Sloop' }, isl.docks[0]);
        window.OP.game.emit('shipBought', 'sloop');
        return { launched: r.ship?.name, laidUp: r.laidUp, fleet: c.fleet.map((f) => f.name), afloat: g.ships.filter((s) => s.owner === 'player' && s.alive !== false).map((s) => s.name) };
      });
      console.log('before', JSON.stringify(before));
      // save (the pause menu's Save game), and back from the title
      const saved = await page.evaluate(() => { const g = window.OP.game; window.OP.ui.openMenu(); const btn = [...document.querySelectorAll('.menu-btn')].find((b) => /Save game/.test(b.textContent)); btn?.click(); window.OP.ui.closeAll(); const s = JSON.parse(localStorage.getItem('op-inherited-will:slot1:char:v1') || 'null'); return { fleet: (s?.fleet || []).map((f) => f.name), ships: (s?.ships || []).map((x) => x.name) }; });
      console.log('saved', JSON.stringify(saved));
      await page.reload();
      await waitReady(page);
      await bootGone(page);
      await page.getByRole('button', { name: 'Continue', exact: true }).first().click();
      await frames(page, 3);
      await step(page, 0.6);
      const after = await page.evaluate(() => { const g = window.OP.game, c = g.state.char; return { fleet: c.fleet.map((f) => f.name), afloat: g.ships.filter((s) => s.owner === 'player' && s.alive !== false).map((s) => s.name) }; });
      console.log('after reload', JSON.stringify(after));
      // an old save: no fleet, two ships afloat (one without a uid)
      await page.evaluate(() => {
        const k = 'op-inherited-will:slot1:char:v1', s = JSON.parse(localStorage.getItem(k));
        delete s.fleet;
        const one = s.ships[0];
        s.ships = [{ ...one }, { ...one, uid: undefined, type: 'caravel', name: 'Old Caravel', x: one.x + 1, y: one.y + 30 }];
        localStorage.setItem(k, JSON.stringify(s));
        window.onbeforeunload = null;
      });
      await page.evaluate(() => { window.OP.game.player = null; }); // (don't save over it on the way out)
      await page.reload();
      await waitReady(page);
      await bootGone(page);
      await page.getByRole('button', { name: 'Continue', exact: true }).first().click();
      await frames(page, 3);
      await step(page, 0.6);
      const migrated = await page.evaluate(() => { const g = window.OP.game, c = g.state.char; return { fleet: c.fleet.map((f) => `${f.name} (${f.type}) ${f.uid ? 'uid' : 'NO UID'}`), afloat: g.ships.filter((s) => s.owner === 'player' && s.alive !== false).map((s) => s.name), sameUids: g.ships.filter((s) => s.owner === 'player').every((s) => c.fleet.some((f) => f.uid === s.uid)) }; });
      console.log('old save', JSON.stringify(migrated));
      const ok = saved.fleet.length === 2 && after.fleet.length === 2 && after.afloat.length === 1 && migrated.fleet.length === 2 && migrated.sameUids;
      console.log(ok ? 'FLEETSAVE: OK' : 'FLEETSAVE: FAILED');
      if (!ok) throw new Error('owned ships did not survive the save');
    },
  },
};
