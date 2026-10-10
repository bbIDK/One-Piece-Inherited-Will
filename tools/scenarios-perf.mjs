// Frame-time profile in a few busy places: a town by day and at night, a
// harbour, a big walled town, at sea on a big ship among others, and down on
// a reef. For each: frames per second (in the headless SwiftShader renderer,
// so compare runs with each other rather than with a real GPU), where the JS
// time goes (window.OP.prof), and what the renderer drew.
const waitReady = (page, timeout = 240000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

/** Frames until the view has nothing left to stream in (terrain, models, far towns), at most max. */
const settle = (page, max = 1500) => page.evaluate((max) => new Promise((r) => {
  const v = window.OP.game.view3d;
  let k = 0, calm = 0;
  const f = () => {
    const busy = v.terrain.missing || (v.propQueue && v.propQueue.length) || (v.farQueue && v.farQueue.length) || v.buildingsFar?.busy;
    calm = busy ? 0 : calm + 1;
    if (++k >= max || calm >= 8) return r(k);
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}), max);

async function measure(page, label, n = 60) {
  await frames(page, 45); // let the streaming settle
  const res = await page.evaluate(async (n) => {
    const P = window.OP.prof;
    P.reset(); P.PROF.on = true;
    const t0 = performance.now();
    await new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const wall = performance.now() - t0;
    P.PROF.on = false;
    const F = Math.max(1, P.PROF.frames);
    const parts = Object.entries(P.PROF.t).map(([k, v]) => [k, +(v / F).toFixed(2)]).sort((a, b) => b[1] - a[1]);
    const v = window.OP.game.view3d, info = v.renderer.info;
    let objs = 0, meshes = 0;
    v.scene.traverse((o) => { objs++; if (o.isMesh && o.visible) meshes++; });
    return {
      fps: +(n / (wall / 1000)).toFixed(1), frameMs: +(wall / n).toFixed(1), simFrames: F,
      calls: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, tex: info.memory.textures, progs: info.programs?.length,
      objs, meshes, actors: window.OP.game.actors.length, posed: v.posedN, near: v.nearN,
      parts: parts.slice(0, 24),
    };
  }, n);
  console.log(`== ${label}: ${res.fps} fps (${res.frameMs} ms/frame) · ${res.calls} calls · ${res.tris} tris · ${res.geos} geos · ${res.tex} tex · ${res.progs} programs · ${res.objs} objects (${res.meshes} meshes) · ${res.actors} actors (${res.near} near, ${res.posed} posed)`);
  console.log('   ' + res.parts.map(([k, v]) => `${k} ${v}`).join(' | '));
  return res;
}

// With --cpu, a sampling CPU profile (Chrome DevTools protocol) of the run:
// the functions that take the most time, on their own and with their callees.
async function cpuProfile(page, fn) {
  const client = await page.context().newCDPSession(page);
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 250 });
  await client.send('Profiler.start');
  const res = await fn();
  const { profile } = await client.send('Profiler.stop');
  const dt = (profile.endTime - profile.startTime) / 1000 / Math.max(1, profile.samples.length); // ms per sample
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const name = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  const self = {}, incl = {};
  const walk = (n, stack) => {
    const k = name(n);
    self[k] = (self[k] || 0) + n.hitCount;
    let sub = n.hitCount;
    const st = new Set(stack); st.add(k);
    for (const c of n.children || []) sub += walk(byId.get(c), st);
    if (!stack.has(k)) incl[k] = (incl[k] || 0) + sub;
    return sub;
  };
  walk(profile.nodes[0], new Set());
  const top = (t, n) => Object.entries(t).filter(([k]) => !/^\((root|program|idle|garbage collector)\)/.test(k) || true).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v * dt).toFixed(0).padStart(6)} ms  ${k}`);
  console.log('-- cpu self:\n' + top(self, 28).join('\n'));
  console.log('-- cpu inclusive:\n' + top(incl, 40).join('\n'));
  return res;
}

// Moves the player (or their ship) a fixed step every frame for n frames while
// PROF traces each frame; returns the per-frame JS breakdowns.
async function traced(page, n, move) {
  return page.evaluate(async ({ n, move }) => {
    const OP = window.OP, g = OP.game, P = OP.prof;
    const step = new Function('g', 'OP', 'k', move);
    P.PROF.trace = []; P.reset(); P.PROF.on = true;
    // (and which shader programs get compiled on the way: each one is a stall)
    const progs = g.view3d.renderer.info.programs;
    let np = progs.length;
    const compiled = [];
    await new Promise((res) => { let k = 0; const f = () => {
      if (progs.length > np) { compiled.push(k + ': ' + progs.slice(np).map((q) => q.name + '#' + q.cacheKey.length).join(', ')); np = progs.length; }
      step(g, OP, k); if (++k >= n) return res(); requestAnimationFrame(f); }; requestAnimationFrame(f); });
    P.PROF.on = false;
    const tr = P.PROF.trace; P.PROF.trace = null;
    return { frames: tr, compiled };
  }, { n, move });
}

function report(label, res) {
  const tr = res.frames;
  const tot = tr.map((f) => (f.sim || 0) + (f.render || 0));
  const sorted = [...tot].sort((a, b) => a - b);
  const pc = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(1);
  console.log(`== ${label}: ${tr.length} frames · JS ms/frame p50 ${pc(0.5)} · p90 ${pc(0.9)} · p99 ${pc(0.99)} · max ${pc(1)} · frames over 8 ms: ${tot.filter((t) => t > 8).length}, over 16 ms: ${tot.filter((t) => t > 16).length}`);
  const worst = tot.map((t, i) => [t, i]).sort((a, b) => b[0] - a[0]).slice(0, 10);
  for (const [t, i] of worst) {
    const parts = Object.entries(tr[i]).filter(([k]) => k !== 'sim' && k !== 'render').sort((a, b) => b[1] - a[1]).slice(0, 6);
    console.log(`   #${i} ${t.toFixed(1)} ms: ` + parts.map(([k, v]) => `${k.slice(0, 40)} ${v.toFixed(1)}`).join(' | '));
  }
  // where the time goes over the whole run
  const sum = {};
  for (const f of tr) for (const [k, v] of Object.entries(f)) sum[k] = (sum[k] || 0) + v;
  if (res.compiled.length) console.log('   shaders compiled (frame: programs): ' + res.compiled.join(' || '));
  console.log('   totals: ' + Object.entries(sum).filter(([k]) => k !== 'sim' && k !== 'render').sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k.slice(0, 32)} ${(v / tr.length).toFixed(2)}`).join(' | '));
}

export const scenarios = {
  // Hitches: the JS time of every frame while running through a town and out
  // into the country (--route=run), and while sailing a big ship past islands
  // (--route=sail). Run small (--w=320 --h=180): only JS time is measured.
  hitch: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 11; g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      const n = Number(args.frames || 300);
      const routes = String(args.route || 'run,sail').split(',');
      if (routes.includes('run')) {
        // from the end of Foosha's pier, inland through the village and beyond
        await page.evaluate(() => {
          const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island'), d = isl.docks[0];
          window.OP.teleport(d.end.x + 0.5, d.end.y + 0.5);
          const a = Math.atan2(isl.y - d.end.y, w.dx(d.end.x, isl.x));
          window.__route = { x: d.end.x + 0.5, y: d.end.y + 0.5, dx: Math.cos(a), dy: Math.sin(a) };
          g.view3d.rig.yaw = a; g.view3d.rig.pitch = -0.05;
        });
        await frames(page, 30);
        const go = () => traced(page, n, `const r = window.__route, p = g.player, s = 0.25 * k; p.x = g.world.wx(r.x + r.dx * s); p.y = r.y + r.dy * s; p.z = 0; g.view3d.rig.yaw = Math.atan2(r.dy, r.dx);`);
        const tr = args.cpu ? await cpuProfile(page, go) : await go();
        report('run (0.25 m/frame)', tr);
        if (args.snap) await snap('run');
      }
      if (routes.includes('sail')) {
        await page.evaluate(() => {
          const g = window.OP.game, w = g.world;
          // open water some way off an island, heading past it
          const isl = w.islands.find((i) => i.id === 'shells_town') || w.islands[3];
          let spot = null;
          for (let k = 0; k < 4000 && !spot; k++) {
            const a = Math.random() * Math.PI * 2, r = isl.radius + 140;
            const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
            if (w.sd(x, y) < -30) spot = { x, y, a };
          }
          const h = spot.a + Math.PI + 0.35; // towards the island, a little to one side
          const s = g.giveShip('war_galleon', spot.x, spot.y, 'Hitch Galleon', { heading: h });
          const p = g.player;
          p.deck = null; p.x = s.x; p.y = s.y; p.mode = 'sail'; p.ship = s; p.onShip = true; s.captain = p; s.sail = 1;
          window.__route = { s, x: s.x, y: s.y, dx: Math.cos(h), dy: Math.sin(h) };
        });
        await frames(page, 30);
        const go = () => traced(page, n, `const r = window.__route, s = r.s, d = 0.6 * k; s.x = g.world.wx(r.x + r.dx * d); s.y = r.y + r.dy * d; s.vx = 0; s.vy = 0;`);
        const tr = args.cpu ? await cpuProfile(page, go) : await go();
        report('sail (0.6 m/frame)', tr);
        if (args.snap) await snap('sail');
      }
    },
  },
  perf: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 11; g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      const only = args.spots ? String(args.spots).split(',') : null;
      const want = (k) => !only || only.includes(k);
      const out = {};
      // a town square by day
      const town = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        const t = isl.towns[0];
        window.OP.teleport(t.plaza.x + 3, t.plaza.y + 4);
        g.view3d.rig.yaw = 3.9; g.view3d.rig.pitch = -0.1;
        return { x: t.plaza.x, y: t.plaza.y };
      });
      if (want('town')) { out.town = await measure(page, 'town (day)'); if (args.snap) await snap('town'); }
      if (want('night')) {
        await page.evaluate(() => { window.OP.game.env.clock = 21.5; });
        out.night = await measure(page, 'town (night)');
        if (args.snap) await snap('night');
        await page.evaluate(() => { window.OP.game.env.clock = 11; });
      }
      // the harbour
      if (want('harbour')) {
        await page.evaluate(() => {
          const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island'), d = isl.docks[0];
          window.OP.teleport(d.end.x + 0.5 - d.dirX * 2, d.end.y + 0.5 - d.dirY * 2);
          g.view3d.rig.yaw = Math.atan2(-d.dirY, -d.dirX); g.view3d.rig.pitch = -0.05;
        });
        out.harbour = await measure(page, 'harbour');
        if (args.snap) await snap('harbour');
      }
      // Lvneel, a big walled town (a few hundred houses), from its main square
      if (want('bigtown')) {
        await page.evaluate(() => {
          const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'lvneel');
          const t = isl.towns.find((q) => q.id === 'lvneel_town') || isl.towns[0];
          window.OP.teleport(t.plaza.x + 2.5, t.plaza.y + 3.5);
          g.view3d.rig.yaw = -Math.PI / 2 + 0.3; g.view3d.rig.pitch = -0.06;
        });
        await settle(page);
        out.bigtown = await measure(page, 'big town (Lvneel)');
        if (args.snap) await snap('bigtown');
      }
      // at sea at the helm of a war galleon, other ships about
      if (want('sea')) {
        await page.evaluate(() => {
          const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
          let spot = null;
          for (const need of [-40, -30, -24]) for (let k = 0; k < 20000 && !spot; k++) {
            const a = Math.random() * Math.PI * 2, r = isl.radius * (1.1 + Math.random()) + 30;
            const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
            if (w.sd(x, y) < need) spot = { x, y, a };
          }
          const s = g.giveShip('war_galleon', spot.x, spot.y, 'Perf Galleon', { heading: spot.a + Math.PI / 2 });
          window.OP.teleport(s.x, s.y + 12);
          const hs = window.OP.debug.deckSpot(s, 'helm');
          window.OP.debug.onDeck(s, 0.2, 0);
          g.player.deck.ship.aboard?.delete(g.player); g.player.deck = null;
          g.player.x = s.x; g.player.y = s.y;
          const it = { run: null };
          // take the helm
          g.player.mode = 'sail'; g.player.ship = s; g.player.onShip = true; s.captain = g.player;
          s.sail = 1;
          for (const [k, t] of [['pirate', 'war_galleon'], ['merchant', 'carrack'], ['marine', 'marine_battleship']]) {
            const a = Math.random() * Math.PI * 2;
            g.traffic.spawn({ kind: k, type: t, x: w.wx(s.x + Math.cos(a) * 70), y: s.y + Math.sin(a) * 70, heading: a, level: 8, dest: { x: s.x, y: s.y } });
          }
          void hs; void it;
        });
        out.sea = await measure(page, 'sea (big ship, traffic)');
        if (args.snap) await snap('sea');
      }
      // down on a reef
      if (want('reef')) {
        await page.evaluate(() => {
          const g = window.OP.game, w = g.world, p = g.player;
          if (p.ship) { p.ship.captain = null; p.mode = 'foot'; p.onShip = false; p.ship = null; }
          const isls = w.islands.filter((i) => [1, 4].includes(w.climate(i.x, i.y)) && i.radius > 20);
          let spot = null;
          for (const isl of isls.slice(0, 30)) {
            for (let k = 0; k < 400 && !spot; k++) {
              const a = Math.random() * Math.PI * 2, r = isl.radius * (1 + Math.random() * 0.6);
              const x = isl.x + Math.cos(a) * r, y = isl.y + Math.sin(a) * r;
              if (w.type(x, y) === 0 && g.seaDepth(x, y) > 5 && g.seaDepth(x, y) < 12) spot = { x, y };
            }
            if (spot) break;
          }
          window.OP.teleport(spot.x, spot.y);
          p.depth = 3; p.under = true; p.oxygen = 999;
          g.view3d.rig.pitch = -0.2;
        });
        out.reef = await measure(page, 'reef (under water)');
        if (args.snap) await snap('reef');
      }
      console.log('summary', JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { fps: v.fps, calls: v.calls, tris: v.tris }]))));
    },
  },
  // How far the view reaches (Settings → Render distance): Lvneel, a big
  // walled town, from its main square, from 130 m and 250 m off on foot, from
  // the air, and from a ship out at sea. At each spot everything is let
  // stream in first (and how many frames that took is shown), then the frame
  // rate, draw calls and triangles are measured and a shot taken.
  //   --rd=<chunks> the render distance (default: the game's own)
  //   --spots=square,edge,far,air,sea   --n=<frames measured>   --settle=<max frames>
  //   --clean (no HUD in the shots)   --night (at 21:30 instead of 11:00)
  viewdist: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(([rd, clean]) => {
        const OP = window.OP, g = OP.game;
        OP.quickStart('human');
        g.settings.view = 'first';
        if (rd) g.settings.renderDist = rd;
        g.applySettings();
        document.querySelector('.look-hint')?.remove();
        if (clean) document.getElementById('ui').style.visibility = 'hidden';
        // the spots: out from the square across the land (to the south if it can), then out to sea
        const w = g.world, isl = w.islands.find((i) => i.id === 'lvneel');
        const t = isl.towns.find((q) => q.id === 'lvneel_town') || isl.towns[0];
        const P = t.plaza;
        const land = (x, y) => w.sd(x, y) > 2 && !w.isBlocked(x, y);
        let best = null;
        for (const a of [Math.PI / 2, Math.PI / 2 - 0.4, Math.PI / 2 + 0.4, 0, Math.PI, -Math.PI / 2]) {
          const at = (d) => ({ x: w.wx(P.x + Math.cos(a) * d), y: P.y + Math.sin(a) * d });
          let far = 0;
          for (let d = 100; d < 600; d += 2) { const q = at(d); if (land(q.x, q.y)) far = d; else if (w.sd(q.x, q.y) < -14) break; }
          if (!best || far > best.far) best = { a, far, at };
          if (far >= 250) break;
        }
        const near = (d) => { for (let e = d; e > 20; e -= 2) { const q = best.at(e); if (land(q.x, q.y)) return q; } return best.at(d); };
        let sea = null;
        for (let d = best.far + 20; d < 1200 && !sea; d += 4) { const q = best.at(d); if (w.sd(q.x, q.y) < -16 && d > 420) sea = q; }
        window.__vd = { P, edge: near(130), far: near(Math.min(250, best.far)), sea };
      }, [args.rd ? Number(args.rd) : 0, !!args.clean]);
      const only = args.spots ? String(args.spots).split(',') : null;
      const want = (k) => !only || only.includes(k);
      const n = Number(args.n || 40), max = Number(args.settle || 1500);
      const out = {};
      const at = async (key, label, setup) => {
        if (!want(key)) return;
        await page.evaluate(setup);
        await page.evaluate((night) => { const e = window.OP.game.env; e.clock = night ? 21.5 : 11; e.storm = 0; e.fog = 0; e.rain = 0; e.snow = 0; }, !!args.night);
        const k = await settle(page, max);
        const info = await page.evaluate(() => {
          const v = window.OP.game.view3d, g = window.OP.game;
          let models = 0;
          for (const [o, m] of v.built) if (m && o.kind === 'building') models++;
          return { dist: +g.world.distance(g.player.x, g.player.y, window.__vd.P.x, window.__vd.P.y).toFixed(0), reach: v.terrain.extent, fog: [Math.round(v.sky.fog.near), Math.round(v.sky.fog.far)], chunks: v.terrain.live.size, models, stats: v.viewStats?.() || null };
        });
        console.log(`-- ${label}: settled in ${k} frames · ${info.dist} m from the square · land drawn to ${info.reach} m · fog ${info.fog[0]}–${info.fog[1]} m · ${info.chunks} terrain chunks · ${info.models} building models${info.stats ? ' · ' + JSON.stringify(info.stats) : ''}`);
        out[key] = await measure(page, label, n);
        if (args.snap) await snap(key);
      };
      // (turn to face the square from q)
      const look = 'g.view3d.rig.yaw = Math.atan2(window.__vd.P.y - q.y, g.world.dx(q.x, window.__vd.P.x));';
      await at('square', 'the square', new Function(`const g = window.OP.game, P = window.__vd.P; window.OP.teleport(P.x + 2.5, P.y + 3.5); g.view3d.rig.yaw = -Math.PI / 2 + 0.3; g.view3d.rig.pitch = -0.02;`));
      await at('edge', '130 m off', new Function(`const g = window.OP.game, q = window.__vd.edge; window.OP.teleport(q.x, q.y); ${look} g.view3d.rig.pitch = 0.02;`));
      await at('far', '250 m off', new Function(`const g = window.OP.game, q = window.__vd.far; window.OP.teleport(q.x, q.y); ${look} g.view3d.rig.pitch = 0.02;`));
      await at('air', 'from the air', new Function(`const q = window.__vd.far, g = window.OP.game, p = g.player; window.OP.teleport(q.x, q.y); g.creative.set(true, true); if (!p.flying) g.creative.fly(); p.alt = Math.max(0, g.view3d.ground(q.x, q.y)) + 40; ${look} g.view3d.rig.pitch = -0.14;`));
      await at('sea', 'at sea', new Function(`
        const g = window.OP.game, p = g.player, q = window.__vd.sea;
        if (p.flying) g.creative.land(); g.creative.set(false, true);
        const P = window.__vd.P, h = Math.atan2(P.y - q.y, g.world.dx(q.x, P.x));
        const s = g.giveShip('war_galleon', q.x, q.y, 'View Galleon', { heading: h + 0.5 });
        window.OP.teleport(s.x, s.y); p.deck = null; p.mode = 'sail'; p.ship = s; p.onShip = true; s.captain = p; s.sail = 0;
        g.view3d.rig.yaw = h; g.view3d.rig.pitch = 0.02;`));
      console.log('summary', JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { fps: v.fps, ms: v.frameMs, calls: v.calls, tris: v.tris }]))));
    },
  },
};
