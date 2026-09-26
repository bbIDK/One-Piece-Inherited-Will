// 3D world-object scenarios: first-person views of places full of props
// (forests, towns in every style, docks, landmarks) and ship close-ups.
//   node tools/shot.mjs props3d            the full tour
//   node tools/shot.mjs ships3d            ship close-ups (every hull type)
//   node tools/shot.mjs p3d-look --at=foosha [--kind=windmill] [--yaw=0] [--clock=10]
//   node tools/shot.mjs p3d-explore        print island / town / landmark coordinates
const waitReady = (page, timeout = 180000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

/** Boot into first person with a clean screen and the debug helpers installed. */
async function boot(page, race = 'human') {
  await page.evaluate(() => localStorage.clear());
  await waitReady(page);
  await page.evaluate((race) => window.OP.quickStart(race), race);
  await step(page, 0.5);
  await page.evaluate(() => {
    const g = window.OP.game;
    const w = () => g.world;
    const H = {
      isl: (id) => g.surface.islands.find((i) => i.id === id),
      /** objects of a kind near a point, nearest first */
      near: (kind, x, y, r = 120) => w().objects.near(x, y, r, (o) => (!kind || o.kind === kind || o.sub === kind)).sort((a, b) => w().dist2(x, y, a.x, a.y) - w().dist2(x, y, b.x, b.y)),
      /** stand `dist` metres from (x, y) in direction `ang` and look at it */
      standAt: (x, y, dist = 6, ang = Math.PI / 2, pitch = 0, h = 1.6) => {
        const p = g.player;
        p.mode = 'foot'; p.onShip = false;
        const px = w().wx(x + Math.cos(ang) * dist), py = y + Math.sin(ang) * dist;
        window.OP.teleport(px, py);
        const v = g.view3d;
        v.rig.yaw = (Math.atan2(y - py, w().dx(px, x)) + Math.PI * 2) % (Math.PI * 2);
        const gh = v.ground(x, y) - v.ground(px, py);
        v.rig.pitch = pitch !== null ? pitch : Math.atan2(h + gh - 1.6, dist);
        return { x: px, y: py };
      },
      clean: () => { for (const el of document.body.children) if (el.id !== 'game') el.style.visibility = 'hidden'; },
      perf: () => { const v = g.view3d, i = v.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, props: v.built.size }; },
    };
    window.P3D = H;
    g.env.stormTarget = 0; g.env.storm = 0; g.env.weatherTimer = 9999;
    H.clean();
  });
}

/** Let terrain and props stream in around the camera. */
async function settle(page, n = 10) {
  for (let i = 0; i < n; i++) { await step(page, 0.1); await frames(page, 2); }
}

/** Freeze the world so the shot is stable: no NPCs walking into the frame. */
async function still(page) {
  await page.evaluate(() => { const g = window.OP.game; g.actors = g.actors.filter((a) => a === g.player); });
}

async function view(page, snap, label, fn, arg, { clock = 10.5, n = 10, perf = false } = {}) {
  const info = await page.evaluate(({ fn, arg, clock }) => {
    const g = window.OP.game;
    g.env.clock = clock;
    // eslint-disable-next-line no-new-func
    return new Function('P3D', 'g', 'arg', fn)(window.P3D, g, arg);
  }, { fn: fn.toString().replace(/^[^{]*\{/, '').replace(/\}\s*$/, ''), arg, clock });
  await settle(page, n);
  if (info) console.log(label, JSON.stringify(info));
  const file = await snap(label);
  if (perf) console.log('perf', label, JSON.stringify(await page.evaluate(() => window.P3D.perf())));
  return file;
}

/** Spawn one ship of each type in open water near (x, y); returns their ids. */
async function spawnFleet(page, x, y, types) {
  return page.evaluate(({ x, y, types }) => {
    const g = window.OP.game;
    const out = [];
    types.forEach((t, i) => {
      const s = g.giveShip(t, x + (i % 4) * 16, y + Math.floor(i / 4) * 16, t);
      s.heading = 0.35 + i * 0.5;
      s.sail = 1; s.sailSet = 1; s.anchored = true;
      if (t === 'caravel' || t === 'adam_brig' || t === 'sloop') s.jr = { skull: 'classic', bones: 'cross', accessory: 'strawhat' };
      if (t === 'brigantine' || t === 'galleon') { s.jr = { skull: 'grin', bones: 'swords', accessory: 'bandana' }; s.faction = 'pirate'; s.owner = 'npc'; }
      out.push({ t, x: Math.round(s.x), y: Math.round(s.y), i: g.ships.indexOf(s) });
    });
    return out;
  }, { x, y, types });
}

export const scenarios = {
  // every hull type up close, then the view from the helm of three of them
  ships3d: {
    async run(page, snap) {
      await boot(page);
      await page.evaluate(() => { const g = window.OP.game; for (const s of g.ships) s.x = -9999; });
      const fleet = await spawnFleet(page, 3745, 382, ['dinghy', 'sloop', 'caravel', 'brigantine', 'frigate', 'galleon', 'adam_brig', 'marine_warship']);
      console.log('fleet', JSON.stringify(fleet));
      await still(page);
      for (const f of fleet) {
        await view(page, snap, 'ship-' + f.t, () => {
          const s = g.ships[arg.i];
          const L = s.def.length;
          const a = s.heading + Math.PI / 2 + 0.55;
          const p = g.player;
          p.mode = 'swim';
          P3D.standAt(s.x, s.y, L * 1.25 + 3, a, -0.02);
          p.state = 'idle';
          g.view3d.rig.roll = 0;
          return { t: s.type, heading: s.heading };
        }, f, { n: 6 });
      }
      // from the helm (first person): the rig turns see-through
      for (const t of ['dinghy', 'caravel', 'galleon', 'adam_brig']) {
        const f = fleet.find((q) => q.t === t);
        await view(page, snap, 'helm-' + t, () => {
          const s = g.ships[arg.i];
          const p = g.player;
          p.mode = 'sail'; p.ship = s; p.onShip = true; s.captain = p; p.x = s.x; p.y = s.y; p.state = 'idle';
          g.view3d.rig.yaw = s.heading; g.view3d.rig.pitch = -0.12; g.view3d.rig.roll = 0;
          return { t: s.type };
        }, f, { n: 6, perf: true });
        await page.evaluate(() => { const g = window.OP.game, p = g.player; if (p.ship) p.ship.captain = null; p.mode = 'foot'; p.ship = null; p.onShip = false; });
      }
    },
  },

  'p3d-explore': {
    async run(page) {
      await boot(page);
      const ids = ['dawn_island', 'goa', 'alabasta', 'wano', 'sabaody', 'twin_cape', 'loguetown', 'water_7', 'skypiea', 'syrup_village', 'shells_town', 'cocoyasi', 'drum', 'jaya', 'whole_cake_island', 'dressrosa', 'marineford', 'enies_lobby'];
      const out = await page.evaluate((ids) => {
        const g = window.OP.game, w = g.world;
        const res = {};
        for (const isl of w.islands) {
          if (!ids.includes(isl.id) && !(isl.name && ids.some((i) => isl.id.startsWith(i)))) continue;
          const bb = isl.bbox;
          const objs = w.objects.query(bb.x0, bb.y0, bb.x1, bb.y1).filter((o) => o.x >= bb.x0 && o.x <= bb.x1 && o.y >= bb.y0 && o.y <= bb.y1);
          const kinds = {};
          for (const o of objs) { const k = o.kind + (o.sub ? ':' + o.sub : '') + (o.style ? ':' + o.style : ''); kinds[k] = (kinds[k] || 0) + 1; }
          res[isl.id] = {
            x: Math.round(isl.x), y: Math.round(isl.y), r: Math.round(isl.radius),
            towns: isl.towns.map((t) => ({ id: t.id, style: t.style, plaza: [Math.round(t.plaza.x), Math.round(t.plaza.y)], n: t.buildings.length })),
            docks: isl.docks.map((d) => [Math.round(d.x), Math.round(d.y)]),
            landmarks: isl.landmarks.filter((l) => l.kind).map((l) => [l.kind, l.name || '', Math.round(l.x), Math.round(l.y)]),
            kinds,
          };
        }
        const els = w.objects.query(0, 0, w.width, w.height).filter((o) => o.kind === 'elevator').map((o) => [Math.round(o.x), Math.round(o.y), o.port]);
        return { res, els, rm: w.reverseMountain, zones: Object.keys(g.zones || {}) };
      }, ids);
      console.log(JSON.stringify(out, null, 1));
    },
  },

  // a quick look for iterating: --at=<island id> [--town=0] [--kind=windmill] [--dist=8] [--ang=1.57] [--yaw=] [--pitch=] [--clock=10]
  'p3d-look': {
    async run(page, snap, args) {
      await boot(page);
      const info = await page.evaluate((a) => {
        const g = window.OP.game, P = window.P3D;
        g.env.clock = Number(a.clock ?? 10.5);
        let x = Number(a.x), y = Number(a.y);
        if (a.at) {
          const isl = P.isl(a.at);
          const t = isl.towns[Number(a.town || 0)];
          x = t ? t.plaza.x : isl.x; y = t ? t.plaza.y + 2 : isl.y;
        }
        if (a.kind) {
          const o = P.near(a.kind, x, y, Number(a.r || 200))[Number(a.nth || 0)];
          if (!o) return { error: 'no ' + a.kind };
          P.standAt(o.x, o.y, Number(a.dist || 8), Number(a.ang ?? Math.PI / 2), a.pitch !== undefined ? Number(a.pitch) : null, Number(a.h || 1.6));
          return { kind: o.kind, x: o.x, y: o.y, sub: o.sub, name: o.name };
        }
        window.OP.teleport(x, y);
        g.view3d.rig.yaw = Number(a.yaw || 0);
        g.view3d.rig.pitch = Number(a.pitch || -0.05);
        return { x, y };
      }, args);
      console.log('look', JSON.stringify(info));
      await still(page);
      await settle(page, 12);
      await snap(args.label || 'look');
      console.log('perf', JSON.stringify(await page.evaluate(() => window.P3D.perf())));
      if (args.turn) {
        for (let k = 1; k < 4; k++) {
          await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.yaw = (v.rig.yaw + Math.PI / 2) % (Math.PI * 2); });
          await settle(page, 3);
          await snap((args.label || 'look') + '-' + k);
          console.log('perf', JSON.stringify(await page.evaluate(() => window.P3D.perf())));
        }
      }
    },
  },
};

export { boot, settle, still, view, step, frames };
