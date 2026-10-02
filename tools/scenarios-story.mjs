// The main story, played: a new character finds the three people on their
// home island, takes a road, does the first job, reports back and sails on;
// then the rest of the story is fast-forwarded chapter by chapter to check
// every hand-over (parts, roads, the Log Pose, road changes, the Grand
// Line's currents).
//   node tools/shot.mjs story [--path=pirate|marine|hunter] [--seed=12345]
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

// helpers that run in the page
const HELPERS = `
  window.__st = {
    g: () => window.OP.game,
    c: () => window.OP.game.state.char,
    /** talk to someone, taking choices whose text matches the patterns in order (else the last choice) */
    talk(a, picks = []) {
      const g = this.g();
      g.dialogue.open(a, a.def.dialogue);
      const said = [];
      for (let n = 0; n < 80 && g.dialogue.active; n++) {
        const d = g.dialogue.active;
        d.typing = d.full.length;
        if (!said.length || said[said.length - 1] !== d.full) said.push(d.full);
        if (d.choices.length) {
          const want = picks.shift();
          let i = want ? d.choices.findIndex((ch) => new RegExp(want, 'i').test(ch.label)) : -1;
          if (i < 0) i = d.choices.length - 1;
          said.push('> ' + d.choices[i].label);
          g.dialogue.choose(i);
        } else g.dialogue.advance();
      }
      return said;
    },
    actor(id) { return this.g().actors.find((a) => a.alive && a.npcId === id) || null; },
    main() { const c = this.c(); const q = this.g().quests.main(); return { path: c.main?.path, part: c.main?.part, at: c.main?.at, chain: c.main?.chain, route: c.main?.route, quest: q?.id || null, stage: q ? this.g().quests.stageId(q.id) : null, log: c.logPose?.target || null }; },
  };
`;

export const scenarios = {
  story: {
    async run(page, snap, args) {
      const path = String(args.path || 'pirate');
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate((seed) => { window.OP.quickStart('human', { seed }); const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); g.env.clock = 11; g.env.storm = 0; g.env.stormTarget = 0; document.querySelector('.look-hint')?.remove(); }, Number(args.seed || 12345));
      await page.evaluate(HELPERS);
      await step(page, 2);
      const start = await page.evaluate(() => {
        const g = window.OP.game, c = g.state.char, S = window.__st;
        const home = g.currentIsland?.id || null;
        const givers = g.actors.filter((a) => a.alive && /^mq_home_/.test(a.npcId || '')).map((a) => ({ id: a.npcId, name: a.name, marker: a.questMarker, d: Math.round(g.world.distance(a.x, a.y, g.player.x, g.player.y)) }));
        const pins = (g.storyPins?.() || []).filter((p) => p.main).map((p) => p.label);
        return { home, spawn: c.spawn?.name, intro: c.mainIntro, givers, pins, track: document.querySelector('.qtrack')?.innerText || null, main: S.main() };
      });
      console.log('start', JSON.stringify(start, null, 1));
      await snap('story-01-home');
      // ---- take the road
      const giver = start.givers.find((x) => x.id.endsWith('_' + path));
      if (!giver) { console.log('NO GIVER for', path); return; }
      const took = await page.evaluate(({ id }) => {
        const S = window.__st;
        const a = S.actor(id);
        const said = S.talk(a, ['other roads', 'take the road|pirate|marine|hunt']);
        return { said, main: S.main(), marker: a.questMarker };
      }, giver);
      console.log('took', JSON.stringify(took, null, 1));
      await step(page, 1);
      await snap('story-02-road');
      // ---- the first job
      const job = await page.evaluate(async ({ path, id }) => {
        const g = window.OP.game, c = g.state.char, S = window.__st, dbg = window.OP.debug;
        const out = [];
        if (path === 'pirate') {
          dbg.addItem(g, 'cutlass', 1);
          window.OP.step(1);
          out.push(S.main().stage);
          c.crewName = 'Test Pirates'; c.jr = { skull: 'classic', bones: 'cross', accessory: 'none', color: '#fff', name: 'Test Pirates' }; c.faction = 'pirate'; g.emit('crewFounded', c.crewName);
          window.OP.step(1);
          out.push(S.main().stage);
        } else {
          const vid = `mq_v_${g.currentIsland?.id}`;
          window.OP.step(1);
          const v = S.actor(vid);
          out.push({ villain: v ? { name: v.name, d: Math.round(g.world.distance(v.x, v.y, g.player.x, g.player.y)), hostile: v.aggroPlayer } : null });
          if (v) { v.hp = 0; v.state = 'knocked'; g.emit('knockout', v, g.player); }
          window.OP.step(1);
          out.push(S.main().stage);
        }
        const a = S.actor(id);
        out.push({ markerBeforeReport: a?.questMarker });
        const said = S.talk(a, []);
        window.OP.step(3.5);
        return { out, said, main: S.main(), faction: c.faction, rank: c.marineRank || null, logPose: !!(c.inventory || []).find((i) => i.id === 'log_pose'), claims: c.claims || [] };
      }, { path, id: giver.id });
      console.log('job', JSON.stringify(job, null, 1));
      await snap('story-03-next');
      // ---- the tracker, the Quests menu and the map
      const ui = await page.evaluate(() => {
        const g = window.OP.game;
        g.ui.sideAction?.('quests');
        const panel = document.querySelector('.quests')?.innerText || null;
        const track = document.querySelector('.qtrack')?.innerText || null;
        const m = g.quests.marker(g.quests.main()?.id);
        return { panel, track, marker: m && { place: m.place, label: m.label } };
      });
      console.log('ui', JSON.stringify(ui, null, 1));
      await snap('story-04-quests-menu');
      await page.evaluate(() => { window.OP.game.ui.closeAll?.(); document.querySelectorAll('.panel .close, .x').forEach((b) => b.click?.()); window.OP.game.openMap?.(); });
      await step(page, 0.3);
      await snap('story-05-map');
      await page.evaluate(() => { const g = window.OP.game; g.closeMap?.(); g.ui.closeMap?.(); });
      // ---- fast-forward the rest of the story
      const ff = await page.evaluate(() => {
        const g = window.OP.game, c = g.state.char, S = window.__st;
        const seen = [];
        for (let n = 0; n < 40; n++) {
          const m = c.main;
          if (!m || m.finished) break;
          const q = g.quests.main();
          if (!q) { window.OP.step(6); continue; }
          const st = g.quests.stageId(q.id);
          seen.push(`${m.part}.${m.at + 1} ${q.def.chapterId} [${q.def.stages.map((x) => x.id).join(',')}] log→${c.logPose?.target || '-'}`);
          g.quests.complete(q.id);
          window.OP.step(6);
          void st;
        }
        return { seen, main: S.main(), finished: !!c.main?.finished, done: c.main?.done?.length, flags: { bondola: !!c.flags.bondolaPass } };
      });
      console.log('fast-forward', JSON.stringify(ff, null, 1));
    },
  },

  // the Grand Line won't let you sail past the island your story is on: you
  // make no way on past it (rowing east, her head's turned back), but lying
  // still there, nothing drifts you anywhere
  storydrift: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); g.env.clock = 11; g.env.storm = 0; g.env.stormTarget = 0; });
      await page.evaluate(HELPERS);
      await step(page, 1);
      const r = await page.evaluate(() => {
        const g = window.OP.game, c = g.state.char, S = window.__st;
        // a pirate on the cactus road, heading for Whisky Peak
        c.faction = 'pirate'; c.crewName = 'Drift Pirates';
        c.flags.enteredGrandLine = true;
        c.main = { path: 'pirate', part: 2, chain: ['gl_twin_cape', 'gl_cactus', 'gl_little_garden', 'gl_drum', 'gl_alabasta', 'gl_sabaody'], at: 1, done: ['mq:gl_twin_cape:pirate'], skipped: [], route: 'cactus', sworn: false };
        g.quests.start('mq:gl_cactus:pirate');
        window.OP.step(0.6);
        const isl = g.surface.islands.find((i) => i.id === 'cactus_island');
        const s = g.ships.find((x) => x.owner === 'player');
        // put the ship well past it, out in Paradise, heading east
        const px = isl.x + 1500, py = isl.y + 40;
        s.x = px; s.y = py; s.heading = 0; s.speed = 8; s.sailSet = 1;
        g.player.x = px; g.player.y = py; g.player.mode = 'sail'; g.player.ship = s;
        const cur = g.currentAt(px, py, s);
        const before = { x: Math.round(s.x), cur: { x: +cur.x.toFixed(2), y: +cur.y.toFixed(2) } };
        window.OP.key('W', true); window.OP.step(6); window.OP.key('W', false);
        const rowedEast = { x: Math.round(s.x), heading: +s.heading.toFixed(2) };
        window.OP.step(3);
        const x0 = s.x; window.OP.step(6);
        const log = c.logPose.target;
        return { before, rowedEast, lyingStill: +(s.x - x0).toFixed(2), log, hold: g.storyLogHold(isl), main: S.main() };
      });
      console.log('drift', JSON.stringify(r, null, 1));
      await snap('storydrift');
    },
  },

  // a Marine who deserts, a hunter who raises a flag: the story follows the new road
  storyswitch: {
    async run(page) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); });
      await page.evaluate(HELPERS);
      await step(page, 2);
      const r = await page.evaluate(() => {
        const g = window.OP.game, c = g.state.char, S = window.__st;
        const home = g.currentIsland.id;
        g.story.begin(`home_${home}`, 'marine');
        const a0 = S.main();
        // sworn in by the prologue
        g.quests.complete(g.quests.main().id);
        window.OP.step(4);
        const a1 = { ...S.main(), faction: c.faction };
        // desert: strike a Marine
        const m = window.OP.debug.makeNPC({ id: 'x_test_marine', name: 'Test Marine', faction: 'marine', level: 2 }, g.player.x + 2, g.player.y);
        m.game = g; g.addActor(m);
        g.emit('knockout', m, g.player);
        window.OP.step(2);
        const a2 = { ...S.main(), faction: c.faction, deserter: !!c.flags.deserter };
        return { a0, a1, a2 };
      });
      console.log('switch', JSON.stringify(r, null, 1));
    },
  },
};
