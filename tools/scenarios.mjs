// Scenarios for tools/shot.mjs. Each gets (page, snap, args).

const waitReady = (page, timeout = 180000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

export const scenarios = {
  boot: {
    async run(page, snap) {
      await waitReady(page);
      await frames(page, 5);
      await snap('title');
    },
  },
  create: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await frames(page, 3);
      await snap('slots');
      await page.getByText('Begin a Lineage').first().click();
      await page.waitForTimeout(3200);
      await snap('roll');
      await page.getByText('Accept my fate').click();
      await frames(page, 3);
      await snap('identity');
      await page.getByRole('button', { name: 'Set Sail', exact: true }).click();
      await frames(page, 5);
      await step(page, 1);
      await snap('spawned');
      const info = await page.evaluate(() => ({ name: window.OP.game.state.char.name, race: window.OP.game.state.char.race, spawn: window.OP.game.state.char.spawn }));
      console.log('spawn', JSON.stringify(info));
    },
  },
  play: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate((race) => window.OP.quickStart(race), args.race || 'human');
      await step(page, 1);
      await snap('spawn');
      await page.evaluate(() => { window.OP.key('D', true); });
      await step(page, 1.2);
      await page.evaluate(() => { window.OP.key('D', false); });
      await step(page, 0.3);
      await snap('walked');
      await page.keyboard.press('KeyI');
      await frames(page, 3);
      await snap('inventory');
      await page.keyboard.press('Escape');
      await page.keyboard.press('KeyC');
      await frames(page, 3);
      await snap('character');
      await page.keyboard.press('Escape');
      await page.keyboard.press('KeyM');
      await frames(page, 4);
      await snap('map');
      await page.keyboard.press('KeyM');
      const shipInfo = await page.evaluate(() => { const g = window.OP.game; const s = g.ships[0]; return s ? { x: s.x, y: s.y, type: s.type } : null; });
      console.log('ship', JSON.stringify(shipInfo));
      if (shipInfo) {
        await page.evaluate(({ x, y }) => { window.OP.teleport(x, y - 2); }, shipInfo);
        await step(page, 0.3);
        await page.evaluate(() => { const i = window.OP.game.player.controller.interaction; if (i) i.run(); });
        await page.evaluate(() => { window.OP.key('W', true); });
        await step(page, 4);
        await page.evaluate(() => { window.OP.key('W', false); });
        await snap('sailing');
      }
    },
  },
  zones: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      for (const z of ['skypiea', 'fishman_island', 'impel_down']) {
        const info = await page.evaluate((z) => { const g = window.OP.game; g.enterZoneById(z); return { world: g.world.id, x: g.player.x, y: g.player.y, islands: g.world.islands.map((i) => i.id) }; }, z);
        console.log('zone', JSON.stringify(info));
        await step(page, 1.5);
        await snap(z);
        const back = await page.evaluate(() => { const g = window.OP.game; g.leaveZone(false); return { world: g.world.id, x: Math.round(g.player.x), y: Math.round(g.player.y) }; });
        console.log('back', JSON.stringify(back));
        await step(page, 0.5);
      }
      await snap('surface-again');
    },
  },
  look: {
    // look at a place: --zone=fishman_island --island=fishman_island (or --x --y on the surface)
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.3);
      const info = await page.evaluate((a) => {
        const g = window.OP.game;
        if (a.zone) g.enterZoneById(a.zone);
        const w = g.world;
        let x = Number(a.x), y = Number(a.y);
        if (a.island) { const i = w.islands.find((k) => k.id === a.island); if (i) { const t = i.towns[0]; x = t ? t.plaza.x : i.x; y = t ? t.plaza.y + 2 : i.y; } }
        if (a.town) { for (const i of w.islands) { const t = i.towns.find((k) => k.id === a.town); if (t) { x = t.plaza.x; y = t.plaza.y + 2; } } }
        if (a.spot) { for (const i of w.islands) { const sp = i.spots[a.spot]; if (sp) { x = sp.x; y = sp.y; } } }
        if (!isNaN(x)) window.OP.teleport(x, y);
        if (a.clock) g.env.clock = Number(a.clock);
        return { world: w.id, x: g.player.x, y: g.player.y };
      }, args);
      console.log('look', JSON.stringify(info));
      await step(page, Number(args.t || 2));
      if (args.zoom) await page.evaluate((z) => { window.OP.game.zoomBias = Number(z); }, args.zoom);
      await step(page, 1);
      await snap(args.label || 'look');
    },
  },
  systems: {
    // crew recruit, marine enlistment, bounty office, bondola to Mary Geoise
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      // --- crew: Johnny on the Baratie
      const crew = await page.evaluate(() => {
        const g = window.OP.game; const c = g.state.char;
        const isl = g.surface.islands.find((i) => i.id === 'baratie');
        window.OP.teleport(isl.spots.baratie_deck.x, isl.spots.baratie_deck.y);
        g.spawner.update(1); g.spawner.t = 0; g.spawner.update(1);
        c.flags.yosakuCured = true;
        const j = g.actors.find((a) => a.npcId === 'johnny');
        if (!j) return 'no johnny';
        g.emit('talk', j);
        const labels = g.dialogue.active.choices.map((x) => x.label);
        g.dialogue.choose(0); // join my crew
        g.dialogue.choose(0); // welcome aboard
        return { labels, crew: c.crew.map((m) => m.id), followers: [...g.crew.followers.keys()] };
      });
      console.log('crew', JSON.stringify(crew));
      await step(page, 2);
      await snap('crew');
      // --- marines
      const marine = await page.evaluate(() => {
        const g = window.OP.game; const c = g.state.char;
        g.emit('marineEnlist', 'test');
        g.dialogue.choose(0); g.dialogue.advance && g.dialogue.close();
        return { faction: c.faction, rank: c.marineRank, hat: c.equipped.hat };
      });
      console.log('marine', JSON.stringify(marine));
      await page.evaluate(() => { const g = window.OP.game; g.state.char.merit = 50; g.emit('marineOffice', { name: 'Test Base' }, null); });
      await frames(page, 30);
      await snap('marine-office');
      await page.evaluate(() => { const g = window.OP.game; g.dialogue.close(); g.emit('bountyBoard', { name: 'Bounty Office' }, null); });
      await frames(page, 10);
      await snap('bounty-office');
      await page.evaluate(() => window.OP.game.ui.closeAll());
      // --- bondola
      const bond = await page.evaluate(() => {
        const g = window.OP.game; const c = g.state.char;
        c.flags.bondolaPass = true;
        const MG = g.world.maryGeoise; const b = MG.portParadise.bondola;
        window.OP.teleport(b.x - 3, b.y + 3);
        const o = g.world.objects.near(b.x, b.y + 1, 3).find((x) => x.use === 'bondola');
        if (!o) return 'no bondola object';
        g.emit('useObject', o);
        g.dialogue.choose(0);
        return 'ok';
      });
      console.log('bondola', bond);
      await page.waitForTimeout(1500);
      await step(page, 2);
      const pos = await page.evaluate(() => { const g = window.OP.game; return { x: g.player.x, y: g.player.y, isl: g.currentIsland?.id }; });
      console.log('mary geoise', JSON.stringify(pos));
      await snap('mary-geoise');
    },
  },
  resume: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      const before = await page.evaluate(() => { const g = window.OP.game; g.enterZoneById('skypiea'); return { world: g.world.id, x: g.player.x, y: g.player.y }; });
      console.log('before', JSON.stringify(before));
      await step(page, 1);
      await page.reload();
      await waitReady(page);
      await frames(page, 5);
      await snap('title-slots');
      await page.getByRole('button', { name: 'Continue', exact: true }).first().click();
      await frames(page, 5);
      await step(page, 1);
      const after = await page.evaluate(() => { const g = window.OP.game; return { world: g.world.id, x: g.player.x, y: g.player.y, ships: g.ships.length }; });
      console.log('after', JSON.stringify(after));
      await snap('resumed');
    },
  },
  quest: {
    // Makino → Lord of the Coast → straw hat
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      const r1 = await page.evaluate(() => {
        const g = window.OP.game;
        const isl = g.surface.islands.find((i) => i.id === 'dawn_island');
        const t = isl.towns.find((x) => x.id === 'foosha');
        window.OP.teleport(t.plaza.x, t.plaza.y + 2);
        g.spawner.t = 0; g.spawner.update(1);
        const m = g.actors.find((a) => a.npcId === 'makino');
        if (!m) return 'no makino';
        const marker1 = m.questMarker;
        window.OP.teleport(m.x, m.y + 1.2);
        g.emit('talk', m);
        const labels = g.dialogue.active.choices.map((x) => x.label);
        g.dialogue.choose(0); // tell me about the lord of the coast
        g.dialogue.choose(0); // I'll deal with it
        return { marker1, labels, quest: g.quests.stageId('lord_of_the_coast') };
      });
      console.log('talk', JSON.stringify(r1));
      await step(page, 1);
      const r2 = await page.evaluate(() => {
        const g = window.OP.game;
        const isl = g.surface.islands.find((i) => i.id === 'dawn_island');
        const dock = isl.docks[0];
        const s = g.ships.find((x) => x.owner === 'player');
        s.x = dock.moor.x; s.y = dock.moor.y + 8;
        window.OP.teleport(s.x, s.y);
        const it = g.player.controller; // board
        g.player.mode = 'foot';
        return { ship: s.name };
      });
      const dbg = await page.evaluate(() => {
        const g = window.OP.game; const s = g.ships.find((x) => x.owner === 'player');
        window.OP.teleport(s.x, s.y - 1);
        const isl = g.surface.islands.find((i) => i.id === 'dawn_island');
        const dock = isl.docks[0];
        const tx = dock.moor.x, ty = dock.moor.y + 16;
        return { stage: g.quests.stageId('lord_of_the_coast'), dist: g.world.distance(g.player.x, g.player.y, tx, ty), liquid: g.world.isLiquid(tx, ty), surface: g.world === g.surface, moor: dock.moor };
      });
      console.log('dbg', JSON.stringify(dbg));
      await step(page, 2);
      const r3 = await page.evaluate(() => {
        const g = window.OP.game;
        const k = g.actors.find((a) => a.npcId === 'lord_of_the_coast');
        if (!k) return { king: null, mode: g.player.mode };
        const hp = k.hp;
        k.takeDamage(99999, g.player, { element: 'physical' }, g);
        return { king: k.name, hp, mode: g.player.mode };
      });
      console.log('seaking', JSON.stringify(r3));
      await step(page, 2);
      await snap('seaking');
      const r4 = await page.evaluate(() => {
        const g = window.OP.game;
        const st = g.quests.stageId('lord_of_the_coast');
        const isl = g.surface.islands.find((i) => i.id === 'dawn_island');
        const t = isl.towns.find((x) => x.id === 'foosha');
        g.player.mode = 'foot'; g.player.onShip = false; if (g.player.ship) g.player.ship.captain = null;
        window.OP.teleport(t.plaza.x, t.plaza.y + 2);
        g.spawner.t = 0; g.spawner.update(1);
        const m = g.actors.find((a) => a.npcId === 'makino');
        const marker = m && m.def.marker(g.state.char, g);
        g.emit('talk', m);
        const labels = g.dialogue.active.choices.map((x) => x.label);
        const i = labels.findIndex((l) => /killed/.test(l));
        g.dialogue.choose(i);
        return { st, marker, labels, done: g.quests.isDone('lord_of_the_coast'), hat: g.state.char.inventory.some((x) => x.id === 'straw_hat') };
      });
      console.log('report', JSON.stringify(r4));
      await frames(page, 20);
      await snap('reward');
    },
  },
  fight: {
    // a boss fight: --boss=arlong (npc id) — the boss attacks, the player swings back
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      const info = await page.evaluate((id) => {
        const g = window.OP.game;
        const { npcDef, makeNPC } = window.OP.debug;
        const def = npcDef(id);
        const isl = g.surface.islands.find((i) => i.id === def.island);
        const t = isl.towns[0];
        window.OP.teleport(t.plaza.x, t.plaza.y + 2);
        const a = makeNPC({ ...def, when: undefined }, g.player.x + 3, g.player.y);
        g.addActor(a);
        a.provoked = true; a.aggroPlayer = true; a.controller.target = g.player; a.controller.state = 'chase'; g.bossTarget = a;
        return { boss: a.name, hp: a.hp, php: g.player.hp, power: Math.round(a.power()), ppower: Math.round(g.player.power()) };
      }, args.boss || 'arlong');
      console.log('fight', JSON.stringify(info));
      for (let k = 0; k < 8; k++) {
        await page.evaluate(() => { const g = window.OP.game; const b = g.bossTarget; if (b) g.player.facing = Math.atan2(b.y - g.player.y, g.world.dx(g.player.x, b.x)); window.OP.input.mouse.pressed = [true, false, false]; window.OP.input.mouse.down = [true, false, false]; });
        await step(page, 0.6);
        await page.evaluate(() => { window.OP.input.mouse.down = [false, false, false]; });
        await step(page, 0.4);
        if (k === 3) await snap('mid');
      }
      const end = await page.evaluate(() => { const g = window.OP.game; const b = g.bossTarget; return { bossHp: b && Math.round(b.hp), playerHp: Math.round(g.player.hp), state: g.player.state, lives: g.state.char.lives }; });
      console.log('after', JSON.stringify(end));
      await snap('end');
    },
  },
  tour: {
    // visit every named island (or --islands=a,b), populate it, talk to everyone with dialogue
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.3);
      const ids = await page.evaluate((only) => {
        const g = window.OP.game;
        const list = g.surface.islands.filter((i) => i.name && !i.def.islet).map((i) => i.id);
        return only ? list.filter((id) => only.split(',').includes(id)) : list;
      }, args.islands || null);
      const zones = args.zones === undefined ? ['skypiea', 'fishman_island', 'impel_down'] : String(args.zones).split(',').filter(Boolean);
      let problems = 0;
      const visit = async (id, zone) => {
        const r = await page.evaluate(({ id, zone }) => {
          const g = window.OP.game;
          const errs = [];
          const w = g.world;
          const isl = w.islands.find((i) => i.id === id);
          if (!isl) return { id, err: 'missing' };
          const t = isl.towns[0];
          const p = t ? { x: t.plaza.x, y: t.plaza.y + 2 } : isl.docks[0] ? isl.docks[0].land : { x: isl.x, y: isl.y };
          g.player.mode = 'foot'; g.player.onShip = false; g.player.ship = null;
          window.OP.teleport(p.x, p.y);
          g.player.state = 'idle'; g.player.hp = g.player.d.maxHp; g.player.iframes = 99;
          g.spawner.t = 0; g.spawner.update(1);
          const talkers = g.actors.filter((a) => a.def && a.def.dialogue && a.def.island === id);
          for (const a of talkers) {
            try {
              g.emit('talk', a);
              const d = g.dialogue.active;
              if (d) {
                for (let k = 0; k < 6 && g.dialogue.active; k++) {
                  const ch = g.dialogue.active.choices || [];
                  const safe = ch.findIndex((c) => c.end && !c.do);
                  if (safe >= 0) g.dialogue.choose(safe);
                  else if (ch.length) g.dialogue.close();
                  else g.dialogue.advance(), g.dialogue.advance();
                }
                g.dialogue.close();
              }
            } catch (e) { errs.push(`${a.npcId}: ${e.message}`); }
          }
          g.ui.closeAll();
          return { id, npcs: g.actors.filter((a) => a.npcId && a.alive).length, talkers: talkers.length, errs };
        }, { id, zone });
        await step(page, 0.4);
        if (r.err || r.errs?.length) { problems++; console.log('PROBLEM', JSON.stringify(r)); }
        else console.log('ok', id, `npcs=${r.npcs} talked=${r.talkers}`);
        if (args.shots) await snap(id);
      };
      for (const id of ids) await visit(id);
      for (const z of zones) {
        const zi = await page.evaluate((z) => { const g = window.OP.game; g.enterZoneById(z); return g.world.islands.map((i) => i.id); }, z);
        for (const id of zi) await visit(id, z);
        await page.evaluate(() => window.OP.game.leaveZone(true));
      }
      console.log(`tour: ${ids.length} islands, ${problems} problem(s)`);
      if (problems) throw new Error(`${problems} island(s) had problems`);
    },
  },
  spawns: {
    // every race is born where it should be
    async run(page) {
      await waitReady(page);
      const races = await page.evaluate(() => Object.keys(window.OP.game && window.OP.RACES || {}));
      void races;
      const out = await page.evaluate(() => {
        const res = [];
        for (const race of ['human', 'fishman', 'mink', 'skypiean', 'longarm', 'longleg', 'buccaneer', 'three_eye', 'lunarian']) {
          for (const seed of [1, 2, 3]) {
            localStorage.clear();
            window.OP.quickStart(race, { seed: seed * 7919 });
            const c = window.OP.game.state.char;
            res.push(`${race}#${seed}: ${c.spawn.name} (${c.spawn.sea})`);
          }
        }
        return res;
      });
      for (const l of out) console.log(l);
    },
  },
  worldmap: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.surface.fog.fill(255); g.renderer.terrain.updateFog(g.surface.fog); for (const i of g.surface.islands) if (i.name) g.state.char.discovered.push(i.id); });
      await step(page, 0.3);
      await page.keyboard.press('KeyM');
      await frames(page, 4);
      await page.evaluate(() => { const g = window.OP.game; if (g.renderMap) g.renderMap(); });
      await frames(page, 2);
      await snap('map');
    },
  },
  ask: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      await page.reload();
      await waitReady(page);
      await frames(page, 3);
      await page.getByRole('button', { name: 'Abandon', exact: true }).first().click();
      await frames(page, 3);
      await snap('abandon-ask');
      await page.getByText('Keep them').click();
      await frames(page, 3);
      const still = await page.evaluate(() => !!localStorage.getItem('op-inherited-will:slot1:char:v1'));
      console.log('save kept', still);
    },
  },
  finale: {
    // the road to Laugh Tale: barrier → reveal → treasure → dream
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.3);
      const r1 = await page.evaluate(() => {
        const g = window.OP.game; const c = g.state.char;
        const lt = g.surface.islands.find((i) => i.id === 'laugh_tale');
        // barrier: swim near it without the flag
        g.player.mode = 'foot';
        window.OP.teleport(lt.x - 60, lt.y);
        return { lt: [lt.x, lt.y], hidden: !!lt.def.hidden };
      });
      await step(page, 3);
      const r2 = await page.evaluate(() => { const g = window.OP.game; const lt = g.surface.islands.find((i) => i.id === 'laugh_tale'); return { pushedTo: Math.round(g.world.distance(g.player.x, g.player.y, lt.x, lt.y)) }; });
      console.log('barrier', JSON.stringify({ ...r1, ...r2 }));
      const r3 = await page.evaluate(() => {
        const g = window.OP.game; const c = g.state.char;
        g.quests.start('laugh_tale_voyage');
        for (let k = 0; k < 4; k++) window.OP.debug.addItem(g, 'poneglyph_rubbing', 1);
        c.flags.laughTaleRevealed = true;
        const lt = g.surface.islands.find((i) => i.id === 'laugh_tale');
        const sp = lt.spots.one_piece;
        window.OP.teleport(lt.x, lt.y);
        return { stage: g.quests.stageId('laugh_tale_voyage'), spot: sp };
      });
      console.log('reveal', JSON.stringify(r3));
      await step(page, 2);
      await page.evaluate(() => { const g = window.OP.game; const lt = g.surface.islands.find((i) => i.id === 'laugh_tale'); const sp = lt.spots.one_piece; window.OP.teleport(sp.x, sp.y); });
      await step(page, 1.5);
      await snap('finale');
      const r4 = await page.evaluate(() => {
        const g = window.OP.game;
        for (let k = 0; k < 12 && g.dialogue.active; k++) { const ch = g.dialogue.active.choices || []; if (ch.length) g.dialogue.choose(0); else { g.dialogue.advance(); g.dialogue.advance(); } }
        const c = g.state.char;
        return { stage: g.quests.stageId('laugh_tale_voyage'), done: g.quests.isDone('laugh_tale_voyage'), laughTale: !!c.flags.laughTale, legend: (c.legends || []).includes('king') };
      });
      console.log('end', JSON.stringify(r4));
      await step(page, 6);
      await snap('after');
      const r5 = await page.evaluate(() => { const g = window.OP.game; return { rival: !!g.actors.find((a) => /teach/.test(a.npcId || '') && a.alive), quest: g.quests.stageId('final_rival') }; });
      console.log('rival', JSON.stringify(r5));
    },
  },
};
