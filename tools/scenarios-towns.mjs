// Towns, looked at: a whole town from the air, its streets at eye level, and
// its people over a minute of the day — who's stuck walking into a wall, who
// is standing inside something, who's on a doorstep's steps, how bunched up
// they are.
//   node tools/shot.mjs townwatch [--island=lvneel] [--town=lvneel_town] [--secs=60] [--clock=11]
//   node tools/shot.mjs towntour --islands=dawn_island,lvneel,...   (the air view of each town)
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

async function boot(page) {
  await page.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
  await page.evaluate(() => {
    window.OP.quickStart('human');
    const g = window.OP.game;
    g.settings.view = 'first'; g.applySettings();
    g.env.storm = 0; g.env.stormTarget = 0; g.env.fog = 0; g.env.rain = 0;
    document.querySelector('.look-hint')?.remove();
    g.player.invulnerable = true;
  });
  await step(page, 0.5);
}

/** Up in the air south of the town (or where told), looking down at it. */
async function airView(page, { island, town, back = 1.1, height = 0.55, pitch = -0.62 }) {
  return page.evaluate(({ island, town, back, height, pitch }) => {
    const g = window.OP.game, w = g.world, p = g.player;
    const isl = w.islands.find((i) => i.id === island);
    if (!isl) return { err: 'no island ' + island };
    const t = (town && isl.towns.find((x) => x.id === town)) || isl.towns[0];
    const cx = t ? t.plaza.x : isl.x, cy = t ? t.plaza.y : isl.y;
    const span = t ? Math.max(t.w, t.h) : isl.radius;
    p.flying = true;
    p.x = cx; p.y = cy + span * back;
    const gh = g.view3d?.ground ? g.view3d.ground(cx, cy) : 2;
    p.alt = gh + span * height + 8; p.z = p.alt - (g.view3d?.ground ? g.view3d.ground(p.x, p.y) : 0);
    const rig = g.view3d?.rig;
    if (rig) { rig.yaw = -Math.PI / 2; rig.pitch = pitch; }
    g.snapCamera?.();
    return { town: t?.id, w: t?.w, h: t?.h, buildings: t?.buildings.length };
  }, { island, town, back, height, pitch });
}

export const scenarios = {
  townwatch: {
    async run(page, snap, args) {
      const island = String(args.island || 'lvneel'), town = args.town ? String(args.town) : null;
      await boot(page);
      // into the town's square at the busy hour
      const where = await page.evaluate(({ island, town, clock }) => {
        const g = window.OP.game, w = g.world, p = g.player;
        g.env.clock = clock;
        const isl = w.islands.find((i) => i.id === island);
        const t = (town && isl.towns.find((x) => x.id === town)) || isl.towns[0];
        p.x = t.plaza.x + 3; p.y = t.plaza.y + 4;
        g.snapCamera?.();
        return { town: t.id, w: t.w, h: t.h, buildings: t.buildings.length };
      }, { island, town, clock: Number(args.clock || 11) });
      console.log('town', JSON.stringify(where));
      await step(page, 3);
      // watch the people for a while
      const secs = Number(args.secs || 60);
      const stats = await page.evaluate((secs) => {
        const g = window.OP.game, w = g.world, p = g.player;
        const folk = () => g.actors.filter((a) => a.alive && a !== p && a.town && w.distance(a.x, a.y, p.x, p.y) < 70);
        const last = new Map(), stuckFor = new Map();
        const out = { samples: 0, people: 0, stuck: 0, stuckLong: new Set(), inside: 0, onSteps: 0, crowded: 0, byKind: {} };
        const kinds = {};
        const dt = 0.25;
        for (let t = 0; t < secs; t += dt) {
          window.OP.step(dt);
          const list = folk();
          out.samples++;
          out.people = Math.max(out.people, list.length);
          for (const a of list) {
            const k = a.activity?.kind || 'none';
            kinds[k] = (kinds[k] || 0) + 1;
            const trying = Math.hypot(a.intent?.mx || 0, a.intent?.my || 0) > 0.1;
            const l = last.get(a);
            const moved = l ? Math.hypot(w.dx(l.x, a.x), a.y - l.y) : 1;
            if (trying && moved < 0.03) { stuckFor.set(a, (stuckFor.get(a) || 0) + dt); out.stuck++; } else stuckFor.set(a, 0);
            if ((stuckFor.get(a) || 0) > 1.5) out.stuckLong.add(a);
            last.set(a, { x: a.x, y: a.y });
            const room = w.interiorAt?.(a.x, a.y);
            if (!room && (w.isBlocked(a.x, a.y) || w.hitsProp(a.x, a.y, 0.12))) out.inside++;
            const f = w.floorRec?.(a.x, a.y);
            if (f && f.steps !== undefined) out.onSteps++;
            // (bunched up: three or more others within a metre and a half)
            let n = 0;
            for (const b of list) if (b !== a && Math.hypot(w.dx(a.x, b.x), b.y - a.y) < 1.5) n++;
            if (n >= 3) out.crowded++;
          }
        }
        const stuckList = [...out.stuckLong].slice(0, 12).map((a) => ({ name: a.name, x: +a.x.toFixed(1), y: +a.y.toFixed(1), act: a.activity?.kind, phase: a.activity?.phase, dest: a.activity?.dest ? { x: +a.activity.dest.x.toFixed(1), y: +a.activity.dest.y.toFixed(1) } : null }));
        return { secs, samples: out.samples, maxPeople: out.people, stuckSamples: out.stuck, stuckLong: out.stuckLong.size, stuckList, insideSamples: out.inside, onStepsSamples: out.onSteps, crowdedSamples: out.crowded, activities: kinds };
      }, secs);
      console.log('people', JSON.stringify(stats, null, 1));
      // street level, then the air
      await page.evaluate(() => { const rig = window.OP.game.view3d?.rig; if (rig) { rig.yaw = -Math.PI / 2; rig.pitch = -0.08; } });
      await step(page, 0.4);
      await snap(`${island}-street`);
      const air = await airView(page, { island, town });
      console.log('air', JSON.stringify(air));
      await step(page, 1.5);
      await snap(`${island}-air`);
    },
  },

  towntour: {
    async run(page, snap, args) {
      await boot(page);
      await page.evaluate(() => { const g = window.OP.game; g.env.clock = 12; });
      const list = String(args.islands || 'dawn_island').split(',');
      for (const id of list) {
        const [island, town] = id.split(':');
        const air = await airView(page, { island, town, back: Number(args.back || 1.1), height: Number(args.height || 0.55) });
        console.log(island, JSON.stringify(air));
        if (air.err) continue;
        await step(page, 2.5);
        await snap(`${island}${town ? '-' + town : ''}`);
      }
    },
  },
};
