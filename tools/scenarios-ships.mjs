// The big ships: each One Piece-scale class seen from the water and from its
// own decks, and a walk up the stairs to the quarterdeck.
const waitReady = (page, timeout = 240000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

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
  //   --types=sloop,caravel,...  --views=side,deck,gun,cabin,captain,forecastle,hold,down  --view=first|third
  shipinside: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(({ clock, view }) => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = view; g.settings.shiftLock = false; g.applySettings(); g.env.clock = clock; g.env.storm = 0; g.env.fog = 0; g.env.rain = 0; document.querySelector('.look-hint')?.remove(); }, { clock: +(args.clock || 10.5), view: args.view || 'first' });
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
          for (const o of g.ships) if (o.name === 'Test Ship') o.alive = false;
          g.ships = g.ships.filter((o) => o.alive !== false);
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
            const g = window.OP.game, s = window.__ship;
            const at = kind === 'hold' ? 0.72 : kind === 'forecastle' ? 0.2 : 0.9;
            const r = window.OP.debug.inRoom(s, kind, at, kind === 'hold' ? -0.5 : 0.35);
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
          await snap(`${type}-down`);
          await page.evaluate(() => { const g = window.OP.game, s = window.__ship; g.view3d.rig.yaw = s.heading; window.OP.key('W', true); });
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
};
