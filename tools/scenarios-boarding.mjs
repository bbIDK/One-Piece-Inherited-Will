// Ships by hand: boarding with no prompts (jump across from a deck, coming
// down on hers over her rail, or swim to her ladder and climb it: E at its
// foot), the start rowboat and her oars, and the camera on every ship.
//   node tools/shot.mjs boarding | rowing | shipcams
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
const key = async (page, k, s = 0.05) => { await page.evaluate((k) => window.OP.key(k, true), k); await step(page, s); await page.evaluate((k) => window.OP.key(k, false), k); };

async function openWater(page) {
  return page.evaluate(() => {
    const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
    for (let k = 0; k < 40000; k++) {
      const a = Math.random() * Math.PI * 2, r = isl.radius * (0.9 + Math.random() * 1.2);
      const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
      if (w.sd(x, y) < -30) {
        let ok = true;
        for (let j = -20; j <= 20 && ok; j += 2) for (let i = -20; i <= 20 && ok; i += 2) if (!w.sailable(x + i, y + j)) ok = false;
        if (ok) return { x, y };
      }
    }
    return null;
  });
}

const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const quiet = (page, view = 'third') => page.evaluate((view) => {
  window.OP.quickStart('human');
  const g = window.OP.game;
  g.settings.view = view; g.settings.shiftLock = false; g.applySettings();
  g.env.clock = 11; g.env.storm = 0; g.env.stormTarget = 0; g.env.fog = 0;
  const st = document.createElement('style');
  st.textContent = '.look-hint,.hint,.toast{display:none!important}';
  document.head.appendChild(st);
}, view);

export const scenarios = {
  // The start rowboat: moored alongside the pier with no mast or sail, then
  // rowed — the rower's stroke and the oars in their rowlocks, from the side
  // in third person and over the oars in first person.
  //   node tools/shot.mjs rowing
  rowing: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await quiet(page);
      await step(page, 0.5);
      const boat = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, s = g.ships.find((o) => o.owner === 'player');
        window.__boat = s;
        // on the pier beside her, looking down at her
        const d = window.OP.debug.dims(s), nx = -Math.sin(s.heading), ny = Math.cos(s.heading);
        let side = 0;
        for (const sg of [1, -1]) for (let k = 0.6; k < 3 && !side; k += 0.1) if (g.world.isDock(s.x + nx * sg * k, s.y + ny * sg * k)) side = sg;
        window.OP.teleport(s.x + nx * side * 2.4 - Math.cos(s.heading) * 1.2, s.y + ny * side * 2.4 - Math.sin(s.heading) * 1.2);
        // (looking along the pier, down at her lying alongside)
        g.view3d.rig.yaw = s.heading; g.view3d.rig.pitch = -0.5; g.view3d.rig.tp.dist = 4.2;
        return { type: s.type, name: s.name, masts: d.masts, sail: s.def.sail, oars: !!s.oars, side };
      });
      console.log('start boat', JSON.stringify(boat));
      for (let i = 0; i < 3; i++) { await step(page, 0.05); await frames(page, 1); }
      await snap('moored');
      // aboard at her thwart: E takes the oars, and she's rowed away from the pier
      const at = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, s = window.__boat;
        window.OP.debug.onDeck(s, window.OP.debug.dims(s).row.seatT, 0);
        p.mode = 'foot';
        window.OP.step(0.2);
        const prompt = p.controller.interaction?.label || null;
        window.OP.key('E', true); window.OP.step(1 / 30); window.OP.key('E', false); window.OP.step(1 / 30);
        window.OP.key('W', true);
        for (let i = 0; i < 90 && g.world.sd(s.x, s.y) > -12; i++) window.OP.step(1 / 30);
        return { prompt, mode: p.mode, speed: +s.speed.toFixed(2) };
      });
      console.log('at the oars', JSON.stringify(at));
      // third person from her beam, at a few moments of the stroke
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => { const g = window.OP.game, s = window.__boat, v = g.view3d; v.rig.yaw = s.heading + Math.PI / 2; v.rig.pitch = -0.18; v.rig.tp.dist = 4.2; });
        await step(page, 0.34);
        await frames(page, 2);
        const st = await page.evaluate(() => { const s = window.__boat; return { ph: +s.rowPh.toFixed(2), a: +s.oars[1].a.toFixed(2), b: +s.oars[1].b.toFixed(2), speed: +s.speed.toFixed(2) }; });
        console.log('stroke', JSON.stringify(st));
        await snap('row3p-' + i);
      }
      // from off her bow quarter
      await page.evaluate(() => { const g = window.OP.game, s = window.__boat, v = g.view3d; v.rig.yaw = s.heading + Math.PI * 0.8; v.rig.pitch = -0.25; });
      await step(page, 0.2); await frames(page, 2);
      await snap('row3p-bow');
      // close in on the rower from abeam
      if (args.close) {
        await page.evaluate(() => { const g = window.OP.game, s = window.__boat, v = g.view3d; v.rig.yaw = s.heading + Math.PI / 2; v.rig.pitch = -0.05; v.rig.tp.dist = 2.4; });
        for (let i = 0; i < 3; i++) { await step(page, 0.3); await frames(page, 2); await snap('row3p-close-' + i); }
        await page.evaluate(() => { window.OP.game.view3d.rig.tp.dist = 4.2; });
      }
      // first person: over the oars, hands on the grips
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); });
      for (let i = 0; i < 2; i++) {
        await page.evaluate((pitch) => { const g = window.OP.game, s = window.__boat, v = g.view3d; v.rig.yaw = s.heading; v.rig.pitch = pitch; }, +(args.pitch1p || -0.42));
        await step(page, 0.4); await frames(page, 2);
        await snap('row1p-' + i);
      }
      await page.evaluate(() => { const g = window.OP.game, s = window.__boat, v = g.view3d; v.rig.yaw = s.heading + 1.1; v.rig.pitch = -0.3; });
      await step(page, 0.2); await frames(page, 2);
      await snap('row1p-side');
      await page.evaluate(() => window.OP.key('W', false));
    },
  },
  // Third person on every ship: at the helm (or the oars) of each type under
  // sail, the camera out as far as she's big and never inside her hull or
  // sails; then walking a war galleon's deck with her sails set.
  //   node tools/shot.mjs shipcams [--types=dinghy,sloop,...]
  shipcams: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await quiet(page);
      await step(page, 0.5);
      const spot = await openWater(page);
      console.log('spot', JSON.stringify(spot));
      const types = String(args.types || 'dinghy,sloop,caravel,brigantine,frigate,galleon,adam_brig,marine_warship,carrack,war_galleon,man_o_war,great_galleon,marine_battleship').split(',');
      for (const type of types) {
        const info = await page.evaluate(({ s, type }) => {
          const g = window.OP.game, p = g.player;
          for (const o of g.ships) if (o.name === 'Cam Ship') { o.alive = false; o.captain = null; }
          g.ships = g.ships.filter((o) => o.alive !== false);
          if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
          p.mode = 'foot'; p.onShip = false;
          const ship = g.giveShip(type, s.x, s.y, 'Cam Ship', { heading: 0.3 });
          window.__cam = ship;
          const hs = window.OP.debug.deckSpot(ship, 'helm');
          window.OP.debug.onDeck(ship, 0.5, 0);
          p.x = hs.x; p.y = hs.y;
          window.OP.step(0.1);
          // E at the wheel (or the oars)
          const prompt = p.controller.interaction?.label || null;
          window.OP.key('E', true); window.OP.step(1 / 30); window.OP.key('E', false); window.OP.step(1 / 30);
          g.env.windAngle = ship.heading + 0.4; g.env.windStrength = 0.8;
          if (ship.def.oarsOnly) window.OP.key('W', true); else { ship.sail = 1; ship.sailSet = 1; }
          window.OP.step(0.5);
          const v = g.view3d; v.rig.yaw = ship.heading + 0.5; v.rig.pitch = -0.2; v.rig.tp.dist = 4.2;
          window.OP.step(0.1);
          const cam = v.rig.camera.position;
          const d = Math.hypot(cam.x, cam.z);
          return { type, prompt, mode: p.mode, L: ship.def.length, camDist: +d.toFixed(1), camY: +cam.y.toFixed(1), inHull: g.shipSolidAt(p.x + cam.x, p.y + cam.z, cam.y, true) };
        }, { s: spot, type });
        console.log('helm', JSON.stringify(info));
        await frames(page, 2);
        await snap(`helm3p-${type}`);
        await page.evaluate(() => window.OP.key('W', false));
      }
      // walking a war galleon's deck under set sails: round the mainmast, the camera kept out of the canvas
      const walk = await page.evaluate((s) => {
        const g = window.OP.game, p = g.player;
        for (const o of g.ships) if (o.name === 'Cam Ship') { o.alive = false; o.captain = null; }
        g.ships = g.ships.filter((o) => o.alive !== false);
        p.mode = 'foot'; p.onShip = false;
        const ship = g.giveShip('war_galleon', s.x, s.y, 'Cam Ship', { heading: 0.3 });
        ship.sail = 1; ship.sailSet = 1; g.env.windAngle = ship.heading; g.env.windStrength = 0.6;
        const d = window.OP.debug.dims(ship);
        window.OP.debug.onDeck(ship, 0.5 + (d.mastU[1] - 1.8) / d.L, 1.2);
        window.OP.step(0.3);
        const v = g.view3d; v.rig.yaw = ship.heading + Math.PI; v.rig.pitch = 0.1; v.rig.tp.dist = 6;
        window.OP.step(0.1);
        const cam = v.rig.camera.position;
        return { onDeck: p.deck?.ship?.name || null, camDist: +Math.hypot(cam.x, cam.z).toFixed(2), camInSail: g.shipSolidAt(p.x + cam.x, p.y + cam.z, cam.y, true) };
      }, spot);
      console.log('deck walk', JSON.stringify(walk));
      await frames(page, 2);
      await snap('deck3p-war_galleon');
    },
  },
  // Boarding by hand with the real keys, no prompts. Off the home pier and
  // down into the start rowboat, E at her thwart takes the oars, and she's
  // rowed out past a pirate who leaves a newcomer be. Wanted, a pirate comes
  // after you, and once you stop she heaves to alongside: leave the oars, hop
  // over the boat's side and up her ladder (her rail is out of a jump's reach
  // from a rowboat). Then a running jump from a sloop's deck onto a
  // merchant's, her side a wall to a swimmer and her ladder the way up, a
  // Marine welcomed aboard a Navy ship, and two overlapping hulls parting.
  //   node tools/shot.mjs boarding
  boarding: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await quiet(page);
      await step(page, 0.5);
      // (in the page: frames of the game without drawing them, the view turned
      // to face a way, how high your feet are, what the log said since a time,
      // and a running jump at a ship: W and Shift, Space at your deck's edge)
      await page.evaluate(() => {
        const g = window.OP.game, v3 = g.view3d, rig = v3.rig, OP = window.OP;
        window.__b = {
          frame(n = 1) { for (let i = 0; i < n; i++) { g.update(1 / 30); rig.update(1 / 30, g, (x, y) => v3.ground(x, y)); } },
          look(a, pitch = 0, dist = 0) { rig.yaw = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); rig.pitch = pitch; if (dist) rig.tp.dist = dist; },
          toward: (o) => Math.atan2(o.y - g.player.y, g.world.dx(g.player.x, o.x)),
          feet: () => +g.player.feetH(g).toFixed(2),
          logs: (t0) => g.logLines.filter((l) => l.t >= t0).map((l) => l.text),
          where: () => { const p = g.player; return p.climb ? 'climbing' : p.deck ? p.deck.ship.name : p.inWater ? 'in the sea' : 'in the air'; },
          // run at her until airborne (`until` 'air') or landed on her deck ('deck')
          runAt(target, until, n = 90) {
            const p = g.player, trace = this.trace || (this.trace = []);
            OP.key('W', true); OP.key('Shift', true);
            for (let i = 0; i < n; i++) {
              this.look(this.toward(target));
              // (Space at her rail, held for a charged leap: a tap clears your own rail, not hers as well)
              if (!this.jumped && p.deck && p.deck.ship !== target && p.deck.edge < 0.95) { OP.key('Space', true); this.jumped = 1; this.held = 0; } else if (this.jumped === 1 && ++this.held >= 14) { OP.key('Space', false); this.jumped = 2; }
              this.frame();
              trace.push(`${this.where()} ${this.feet()}`);
              if (until === 'air' && !p.deck && !p.climb && (p.z || 0) > 0.5) return;
              if (until === 'deck' && p.deck?.ship === target && !p.climb && !(p.z > 0.05)) break;
              if (p.inWater) break;
            }
            OP.key('W', false); OP.key('Shift', false);
            this.jumped = 0;
            this.frame(20);
          },
          // to the foot of ship `s`'s nearest ladder (over the side of a boat
          // you're standing in: a hop over her gunwale; then a swim), and E
          // there; `up` frames of the climb after it
          toLadder(s, up = 0) {
            const p = g.player, lad = g.ladderAt(p, 80, s);
            if (!lad) return { ladder: null };
            OP.key('W', true);
            let n = 0;
            for (; n < 900 && !g.ladderAt(p, 1.2, s); n++) {
              this.look(this.toward(lad.foot));
              if (p.deck && p.deck.ship !== s && p.deck.edge < 0.3 && !(p.z > 0.02)) { OP.key('Space', true); this.frame(); OP.key('Space', false); }
              this.frame();
            }
            OP.key('W', false);
            // (then, as a player would, E once the prompt shows — come up from the splash first)
            for (let k = 0; k < 60 && !/^Climb/.test(p.controller.interaction?.label || ''); k++) this.frame();
            const prompt = p.controller.interaction?.label || null;
            OP.key('E', true); this.frame(); OP.key('E', false);
            this.frame(up);
            return { ladder: `${lad.l.s > 0 ? 'starboard' : 'port'} side`, reached: `${(n / 30).toFixed(1)} s`, prompt, now: this.where() };
          },
          // on up it, onto her deck
          climbOn(n = 150) {
            const p = g.player, feet = [];
            let i = 0;
            for (; i < n && (p.climb || !p.deck); i++) { this.frame(); if (i % 5 === 0) feet.push(this.feet()); }
            this.frame(10);
            return { deck: p.deck?.ship?.name || null, climbed: `${(i / 30).toFixed(1)} s`, feet: feet.join(' ') };
          },
        };
      });

      // ---- off the pier and down into the start rowboat
      const moor = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player, B = window.__b;
        const s = g.ships.find((o) => o.owner === 'player');
        window.__boat = s;
        const d = window.OP.debug.dims(s), nx = -Math.sin(s.heading), ny = Math.cos(s.heading);
        let side = 0, px = 0, py = 0;
        for (const sg of [1, -1]) {
          for (let k = 0.5; k < 4 && !side; k += 0.1) {
            const x = s.x + nx * sg * k, y = s.y + ny * sg * k;
            if (w.isDock(x, y)) { side = sg; px = x + nx * sg * 0.6; py = y + ny * sg * 0.6; }
          }
        }
        if (!side) return { side };
        p.x = px; p.y = py; p.z = 0; p.vz = 0; p.mode = 'foot';
        B.frame(10);
        B.look(B.toward(s));
        const feet = [];
        window.OP.key('W', true);
        for (let i = 0; i < 30; i++) { B.frame(); feet.push(B.feet()); if (p.deck?.ship === s && i > 2) window.OP.key('W', false); }
        window.OP.key('W', false);
        B.frame(20);
        B.look(s.heading + 2.2, -0.45, 3.6);
        return { type: s.type, name: s.name, masts: d.masts, oarsOnly: !!s.def.oarsOnly, gapToPier: +(Math.hypot(w.dx(s.x, px), py - s.y) - 0.6 - d.B / 2).toFixed(2), onDeck: p.deck?.ship?.name || null, inWater: p.inWater, feet: feet.join(' ') };
      });
      console.log('down into the start boat', JSON.stringify(moor));
      await frames(page, 2);
      await snap('into-rowboat');

      // ---- E at her thwart takes the oars; row out, and a pirate close by lets a newcomer be
      const out = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player, c = g.state.char, B = window.__b, s = window.__boat;
        s.hull = s.maxHull = 4000; p.d.maxHp = 5000; p.hp = 5000; // (so boat and rower see it through)
        window.OP.debug.onDeck(s, window.OP.debug.dims(s).row.seatT, 0);
        p.mode = 'foot';
        B.frame(5);
        const prompt = p.controller.interaction?.label || null;
        window.OP.key('E', true); B.frame(); window.OP.key('E', false); B.frame();
        B.look(s.heading);
        window.OP.key('W', true);
        let n = 0;
        for (; n < 360 && w.sd(s.x, s.y) > -26; n++) B.frame();
        const speed = +s.speed.toFixed(1);
        window.OP.key('W', false);
        B.frame(60);
        const a = s.heading + Math.PI / 2;
        const pir = g.traffic.spawn({ kind: 'pirate', type: 'sloop', x: w.wx(s.x + Math.cos(a) * 26), y: s.y + Math.sin(a) * 26, heading: a + Math.PI, level: 6 });
        window.__pir = pir;
        window.__t0 = g.time; window.__hull0 = s.hull;
        B.frame(75);
        if (pir) B.look(B.toward(pir), -0.12, 4.2);
        return { prompt, mode: p.mode, rowedOut: `${(n / 30).toFixed(1)} s`, speed, bounty: c.bounty, pirate: pir?.name || null, pirateAt: pir ? +w.distance(pir.x, pir.y, s.x, s.y).toFixed(1) : null };
      });
      console.log('at the oars, a pirate close by', JSON.stringify(out));
      if (!out.pirate) return;
      await frames(page, 2);
      await snap('newcomer-pirate');
      const spared = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player, B = window.__b, s = window.__boat, pir = window.__pir;
        const track = [];
        for (let i = 0; i < 17 * 30; i++) { B.frame(); if (i % 90 === 0) track.push(+w.distance(pir.x, pir.y, s.x, s.y).toFixed(1)); }
        const r = { attacked: !!pir.traffic.warned, hullLost: window.__hull0 - s.hull, hpLost: 5000 - Math.round(p.hp), distance: track, log: B.logs(window.__t0) };
        pir.alive = false; for (const a of pir.traffic.crew || []) a.alive = false;
        B.frame(5);
        return r;
      });
      console.log('the newcomer left be', JSON.stringify(spared));

      // ---- wanted: a Marine comes after you (pirates keep to their own
      // business unless you start it); stop rowing and she heaves to alongside
      const wanted = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player, c = g.state.char, B = window.__b, s = window.__boat;
        // (wanted in any of the Blues: a poster the Marines know on sight)
        c.bounty = 5000000;
        const a = s.heading + Math.PI / 2;
        const pir = g.traffic.spawn({ kind: 'marine', type: 'sloop', x: w.wx(s.x + Math.cos(a) * 30), y: s.y + Math.sin(a) * 30, heading: a + Math.PI, level: 6 });
        if (!pir) return null;
        window.__pir = pir;
        const t0 = g.time, track = [];
        B.look(s.heading);
        window.OP.key('W', true);
        for (let i = 0; i < 12 * 30; i++) { B.frame(); if (i % 60 === 0) track.push(`rowing ${w.distance(pir.x, pir.y, s.x, s.y).toFixed(1)}m her ${pir.speed.toFixed(1)} us ${s.speed.toFixed(1)}`); }
        window.OP.key('W', false);
        // (at the oars you set a pace: S eases it off to a stop)
        window.OP.key('S', true); B.frame(27); window.OP.key('S', false);
        let i = 0;
        for (; i < 30 * 30; i++) { B.frame(); if (i % 60 === 0) track.push(`stopped ${w.distance(pir.x, pir.y, s.x, s.y).toFixed(1)}m her ${pir.speed.toFixed(1)} us ${s.speed.toFixed(1)}${pir.heaveTo ? ' hove to' : ''}`); if (pir.heaveTo && Math.abs(pir.speed) < 0.2 && i > 60) break; }
        B.frame(30);
        B.look(B.toward(pir) + 0.5, -0.25, 4.2);
        return { attacked: !!pir.traffic.warned, heaveTo: !!pir.heaveTo, after: `${(i / 30).toFixed(1)} s`, gapBetweenHulls: +(w.distance(pir.x, pir.y, s.x, s.y) - (pir.def.beam + s.def.beam) / 2).toFixed(2), her: +pir.speed.toFixed(2), hpLost: 5000 - Math.round(p.hp), track, log: B.logs(t0).slice(0, 4) };
      });
      console.log('wanted: chased, then she heaves to alongside', JSON.stringify(wanted));
      if (!wanted) return;
      await frames(page, 2);
      await snap('hove-to-alongside');

      // ---- leave the oars and stand: her rail is out of a jump's reach from a
      // rowboat, so over the boat's side and up her ladder (E at its foot)
      const toPirate = await page.evaluate(() => {
        const g = window.OP.game, B = window.__b, pir = window.__pir;
        window.OP.key('E', true); B.frame(); window.OP.key('E', false); B.frame();
        const r = B.toLadder(pir, 20);
        B.look(pir.heading + (g.player.y > pir.y ? 1 : -1) * 1.9, 0.15, 5.5);
        return r;
      });
      await frames(page, 1);
      await snap('up-the-pirates-ladder');
      const boarded = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, B = window.__b, pir = window.__pir, tr = pir.traffic;
        const r = B.climbOn();
        B.look(pir.heading + 2.4, -0.2, 4.2);
        return { ...r, inWater: p.inWater, raided: !!tr.raided, helmsman: tr.crew?.[0] ? `${tr.crew[0].name} (${tr.crew[0].controller?.kind})` : null, her: +pir.speed.toFixed(2) };
      });
      console.log('boarded the pirate', JSON.stringify({ ...toPirate, ...boarded }));
      await frames(page, 2);
      await snap('boarded-pirate');

      // ---- a running jump from our sloop's deck onto a merchant sloop's, 1.4 m of
      // water between (a taller ship's rail is a charged jump's, her ladder's or
      // a plank's work)
      const spot = await openWater(page);
      console.log('spot', JSON.stringify(spot));
      const across = await page.evaluate((sp) => {
        const g = window.OP.game, p = g.player, B = window.__b, pir = window.__pir;
        pir.alive = false; for (const a of pir.traffic.crew || []) a.alive = false;
        g.state.char.bounty = 0;
        const mine = g.giveShip('sloop', sp.x, sp.y, 'Test Sloop', { heading: 0 });
        const o = g.traffic.spawn({ kind: 'merchant', type: 'sloop', x: sp.x, y: sp.y + 12, heading: 0, level: 6, dest: { x: sp.x + 400, y: sp.y + 12 } });
        o.y = sp.y + (mine.def.beam + o.def.beam) / 2 + 1.4;
        o.traffic.surrender = true;
        window.__mine = mine; window.__o = o;
        // (whatever went before, a clean start: on her deck, aft of the mast, standing)
        if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
        p.climb = null; p.state = 'idle'; p.vx = p.vy = 0; p.vz = 0; p.z = 0;
        window.OP.debug.onDeck(mine, 0.4, 0);
        p.mode = 'foot';
        B.frame(10);
        B.trace = [];
        B.runAt(o, 'air', 40);
        return { gap: +(o.y - mine.y - (mine.def.beam + o.def.beam) / 2).toFixed(2), airborne: B.where() };
      }, spot);
      await frames(page, 1);
      await snap('jump-across');
      const landed = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, B = window.__b, o = window.__o, tr = o.traffic;
        B.runAt(o, 'deck', 40);
        return { deck: p.deck?.ship?.name || null, inWater: p.inWater, raided: !!tr.raided, helmsman: tr.crew?.[0] ? `${tr.crew[0].name} (${tr.crew[0].controller?.kind}${tr.crew[0].stationary ? ', at the wheel' : ''})` : null, trace: B.trace.join(', ') };
      });
      console.log('jumped across', JSON.stringify({ ...across, ...landed }));
      await frames(page, 2);
      await snap('jumped-across');

      // ---- into the sea off her far side: swimming at her side and jumping,
      // you stay in the sea (it's a wall); E at the foot of her ladder climbs it
      const swim = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, B = window.__b, o = window.__o;
        for (const a of o.traffic.crew || []) a.alive = false;
        if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
        p.climb = null; p.state = 'idle'; p.mode = 'foot'; p.vx = p.vy = 0;
        p.x = o.x + 4; p.y = o.y + o.def.beam / 2 + 1.2; p.z = 0; p.vz = 0;
        B.frame(20);
        B.look(-Math.PI / 2, -0.1, 3.4);
        const before = { inWater: p.inWater, feet: B.feet() };
        window.OP.key('W', true); B.frame(12);
        window.OP.key('Space', true); B.frame(); window.OP.key('Space', false);
        B.frame(30);
        window.OP.key('W', false);
        const wall = { now: B.where(), feet: B.feet() };
        return { before, wall, ...B.toLadder(o, 20) };
      });
      await page.evaluate(() => { const o = window.__o; window.__b.look(o.heading - 1.9, 0.15, 5.5); });
      await frames(page, 1);
      await snap('up-her-ladder');
      const climbed = await page.evaluate(() => window.__b.climbOn());
      console.log('her side a wall, her ladder the way up', JSON.stringify({ ...swim, ...climbed }));

      // ---- a Marine climbing aboard a Navy ship (up her ladder) is welcomed, not fought
      const navy = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, c = g.state.char, B = window.__b, s = window.__mine;
        c.faction = 'marine'; c.marineRank = 'Seaman Recruit'; c.bounty = 0;
        const m = g.traffic.spawn({ kind: 'marine', type: 'brigantine', x: s.x - 40, y: s.y, heading: 0, level: 8, dest: { x: s.x + 400, y: s.y } });
        if (!m) return 'no marine ship';
        m.traffic.surrender = true; // (lying still, for the test)
        if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
        p.climb = null; p.state = 'idle'; p.mode = 'foot'; p.vx = p.vy = 0;
        p.x = m.x + 3; p.y = m.y + m.def.beam / 2 + 1.2; p.z = 0; p.vz = 0;
        B.frame(20);
        const t0 = g.time;
        const up = B.toLadder(m);
        const on = B.climbOn();
        B.frame(20);
        m.traffic.surrender = false;
        return { ...up, ...on, raided: !!m.traffic.raided, welcomed: !!m.traffic.welcomed, hostile: (m.traffic.crew || []).filter((x) => x.controller?.kind === 'hostile').length, bounty: c.bounty, log: B.logs(t0) };
      });
      console.log('a Marine aboard a Navy ship', JSON.stringify(navy));

      // ---- two hulls on top of each other part
      const part = await page.evaluate(() => {
        const g = window.OP.game, s = window.__mine;
        const x = s.x - 80, y = s.y;
        const a = g.traffic.spawn({ kind: 'merchant', type: 'caravel', x, y, heading: 0, level: 5, dest: { x: x + 400, y } });
        const b = g.traffic.spawn({ kind: 'merchant', type: 'caravel', x: x + 1, y: y + 0.6, heading: 0.2, level: 5, dest: { x: x + 400, y } });
        if (!a || !b) return 'spawn failed';
        const d0 = g.world.distance(a.x, a.y, b.x, b.y);
        window.__b.frame(120);
        const d1 = g.world.distance(a.x, a.y, b.x, b.y);
        return { d0: +d0.toFixed(2), d1: +d1.toFixed(2), beam: a.def.beam };
      });
      console.log('overlap', JSON.stringify(part));
    },
  },
};
