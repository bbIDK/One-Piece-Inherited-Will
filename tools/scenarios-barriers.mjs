// Invisible barriers: walk out from points all over a town (and its edges,
// its beach and pier) in every direction, the way the player moves (their
// own canOccupy), and wherever you're stopped look along the way you were
// going for anything drawn there (a ray against the 3D scene: the ground,
// buildings, props, ships). A stop with nothing drawn in front of it is an
// invisible barrier; each is reported with what stopped you (a solid tile
// and the object it belongs to, a collider and its owner, a tile you can't
// walk on, a ledge).
//
//   node tools/shot.mjs barrierhunt [--islands=a,b,c] [--step=2] [--margin=14] [--snap]
//
// Prints one line per island and the stops found, grouped by cause.
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

async function boot(page) {
  await page.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
  await page.evaluate(() => {
    window.OP.quickStart('human');
    const g = window.OP.game;
    g.settings.view = 'first'; g.applySettings();
    g.env.storm = 0; g.env.stormTarget = 0; g.env.fog = 0; g.env.rain = 0; g.env.clock = 11;
    document.querySelector('.look-hint')?.remove();
    g.player.invulnerable = true;
  });
  await step(page, 0.5);
}

/** Draw (stream in) everything around the player: terrain, props, far buildings. */
async function settleWorld(page, max = 14) {
  return page.evaluate((max) => {
    const g = window.OP.game, v = g.view3d;
    if (!v) return null;
    v.terrain.budget = 1e9; v.propBudget = 1e9;
    let n = 0;
    for (; n < max; n++) {
      g.render();
      let dirty = 0;
      for (const c of v.buildingsFar.cells.values()) if (c.dirty) dirty++;
      // (a few frames at least: cells near and far trade places a few a frame)
      if (n >= 3 && !v.terrain.missing && !v.propQueue?.length && !v.farQueue?.length && !dirty) break;
    }
    v.terrain.budget = 4; v.propBudget = undefined;
    return n + 1;
  }, max);
}

/** In the page: probe the ground within `half` of (cx, cy) (see the file comment). */
function probe({ cx, cy, half, stepT, rect, dbg }) {
  const OP = window.OP, g = OP.game, w = g.world, p = g.player, v = g.view3d, THREE = OP.THREE;
  const scene = v.scene;
  scene.updateMatrixWorld(true);
  // what can be seen standing in the way: the ground, the props (buildings among
  // them) and ships — not grass, sea life, far-off stand-ins or people
  const targets = scene.children.filter((o) => o.visible && (o.name === 'terrain' || o.name === 'props' || String(o.name).startsWith('ship:')));
  const things = targets.filter((o) => o.name !== 'terrain');
  const ray = new THREE.Raycaster();
  const O = new THREE.Vector3(), D = new THREE.Vector3();
  // (anything drawn within `far` of you on the side you were going: straight
  // on or sliding along it, at the ankle, knee, hip or chest)
  const seen = (x, y, ca, sa, far) => {
    const gh = v.ground(x, y), a0 = Math.atan2(sa, ca);
    for (const h of [0.12, 0.3, 0.45, 0.6, 0.9, 1.2, 1.5]) {
      for (let da = -1.6; da <= 1.601; da += 0.1) {
        O.set(w.dx(v.ox, x), gh + h, y - v.oy);
        D.set(Math.cos(a0 + da), 0, Math.sin(a0 + da));
        ray.set(O, D); ray.near = 0; ray.far = far;
        const hits = ray.intersectObjects(targets, true);
        for (const hit of hits) {
          // (a mesh hidden, or faded right out, isn't there to see)
          let o = hit.object, vis = true;
          while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
          const m = hit.object.material;
          if (vis && !(m && m.transparent && m.opacity < 0.2)) return hit.object.name || hit.object.parent?.name || 'mesh';
        }
      }
    }
    // (the ground rising up in front of you is seen too)
    const g0 = v.ground(x, y), g1 = v.ground(x + ca * far, y + sa * far);
    if (g1 - g0 > 0.35) return 'slope';
    // (and down a steep slope, what stands out of it below your feet: looking
    // down at it — the ground itself you walk on)
    for (const h of [0.3, 0.9, 1.5]) {
      for (const pitch of [0.35, 0.7, 1.05]) {
        for (let da = -1.2; da <= 1.201; da += 0.2) {
          O.set(w.dx(v.ox, x), gh + h, y - v.oy);
          D.set(Math.cos(a0 + da) * Math.cos(pitch), -Math.sin(pitch), Math.sin(a0 + da) * Math.cos(pitch));
          ray.set(O, D); ray.near = 0; ray.far = (far + 0.3) / Math.cos(pitch);
          for (const hit of ray.intersectObjects(things, true)) {
            let o = hit.object, vis = true;
            while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
            if (vis) return hit.object.name || 'mesh';
          }
        }
      }
    }
    return null;
  };
  // the tile-stamped object a solid tile belongs to
  const owner = (x, y) => {
    for (const o of w.objects.near(x + 0.5, y + 0.5, 16)) {
      if (!o.block || o.soft) continue;
      const w0 = o.fw || 1, d0 = o.fd || 1;
      const a = OP.debug.bw(o, -w0 / 2, -d0), b = OP.debug.bw(o, w0 / 2, 0);
      const x0 = Math.floor(Math.min(a.x, b.x) + 0.001), x1 = Math.ceil(Math.max(a.x, b.x) - 0.001), y0 = Math.floor(Math.min(a.y, b.y) + 0.001), y1 = Math.ceil(Math.max(a.y, b.y) - 0.001);
      if (x >= x0 && x < x1 && y >= y0 && y < y1) return o;
    }
    return null;
  };
  // the collider a circle at (x, y) runs into
  const collider = (x, y, r) => {
    for (let cy2 = Math.floor((y - r) / 4); cy2 <= Math.floor((y + r) / 4); cy2++) {
      for (let cx2 = Math.floor((x - r) / 4); cx2 <= Math.floor((x + r) / 4); cx2++) {
        for (const c of w.colliders.get(w.colKey(cx2, cy2)) || []) {
          const dx = w.dx(c.x, x), dy = y - c.y;
          if (c.r !== undefined) { const rr = c.r + r; if (dx * dx + dy * dy < rr * rr) return c; }
          else { const qx = Math.max(Math.abs(dx) - c.hw, 0), qy = Math.max(Math.abs(dy) - c.hd, 0); if (qx * qx + qy * qy < r * r) return c; }
        }
      }
    }
    return null;
  };
  const name = (o) => (o ? `${o.kind}${o.style ? ':' + o.style : ''}${o.role ? '/' + o.role : ''}${o.name ? ' "' + o.name + '"' : ''}` : '?');
  const cause = (bx, by) => {
    const L = p.ledgeAt(g, bx, by);
    if (L) return { why: 'ledge', what: `${w.type(bx, by)} top ${L.top.toFixed(2)} feet ${p.feetH(g).toFixed(2)}${L.ship ? ' ship' : ''}` };
    const r = p.r, e = r * 0.85;
    for (const [ox, oy] of [[-e, -e], [e, -e], [-e, e], [e, e], [-r, 0], [r, 0], [0, -r], [0, r]]) {
      const x = bx + ox, y = by + oy;
      if (p.passable(w, x, y)) continue;
      if (w.solid(x, y)) { const o = owner(Math.floor(x), Math.floor(y)); return { why: 'solid', what: o ? name(o) : 'stray solid tile', o }; }
      return { why: 'tile', what: `type ${w.type(x, y)}${w.isLiquid(x, y) ? ' (water)' : ''}` };
    }
    const c = collider(bx, by, r * 0.9);
    if (c) return { why: 'collider', what: `${c.wall ? (c.door ? 'door ' : 'wall ') : ''}${name(c.o)}${c.r !== undefined ? ' r' + c.r.toFixed(2) : ' box ' + c.hw.toFixed(2) + 'x' + c.hd.toFixed(2)}`, o: c.o };
    return { why: '?', what: '' };
  };
  const save = { x: p.x, y: p.y, z: p.z, vz: p.vz, deck: p.deck, inWater: p.inWater, wading: p.wading, flying: p.flying };
  p.flying = false; p.deck = null; p.inWater = false; p.wading = 0; p.z = 0; p.vz = 0;
  const out = { points: 0, stops: 0, invisible: [] };
  const cells = new Set();
  const N = 12;
  for (let y = cy - half; y <= cy + half; y += stepT) {
    for (let x = cx - half; x <= cx + half; x += stepT) {
      if (rect && (x < rect.x0 || x > rect.x1 || y < rect.y0 || y > rect.y1)) continue;
      p.x = x; p.y = y;
      if (w.isLiquid(x, y) || !p.canOccupy(w, x, y) || w.interiorAt(x, y)) continue;
      out.points++;
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        p.x = x; p.y = y;
        let fx = x, fy = y, d = 0, stopped = false;
        while (d < stepT * 1.2) {
          const nx = fx + ca * 0.05, ny = fy + sa * 0.05;
          if (!p.canOccupy(w, nx, ny)) { stopped = true; break; }
          fx = nx; fy = ny; p.x = fx; p.y = fy; d += 0.05;
          // (into the sea is swimming, not a barrier: stop looking there)
          if (w.isLiquid(fx, fy)) break;
        }
        if (!stopped) continue;
        out.stops++;
        const bx = fx + ca * 0.05, by = fy + sa * 0.05;
        // (a room's furniture is drawn once you're in: walking in at the door isn't a look inside)
        if (w.interiorAt(bx, by)) continue;
        const c = cause(bx, by);
        if (c.why === 'tile' && /water/.test(c.what)) continue;
        const vis = seen(fx, fy, ca, sa, p.r + 0.3);
        if (vis) continue;
        if (dbg && out.invisible.length < 4) {
          // (what a longer ray would have hit, for checking the probe itself)
          const gh = v.ground(fx, fy); O.set(w.dx(v.ox, fx), gh + 0.45, fy - v.oy); D.set(ca, 0, sa); ray.set(O, D); ray.far = 3;
          out.dbg = (out.dbg || []).concat([{ at: [fx, fy], r: p.r, hits: ray.intersectObjects(scene.children, true).slice(0, 4).map((h) => `${h.distance.toFixed(2)} ${h.object.name}<${h.object.parent?.name}>`) }]);
        }
        const key = `${Math.round(bx * 2)},${Math.round(by * 2)}`;
        if (cells.has(key)) continue;
        cells.add(key);
        out.invisible.push({ x: +bx.toFixed(2), y: +by.toFixed(2), a: +(a).toFixed(2), why: c.why, what: c.what, ground: +v.ground(fx, fy).toFixed(2), tile: w.type(bx, by) });
      }
    }
  }
  Object.assign(p, save);
  return out;
}

export const scenarios = {
  barrierhunt: {
    async run(page, snap, args) {
      await boot(page);
      const islands = String(args.islands || 'dawn_island,shells_town,gecko_islands,conomi_islands,loguetown,sorbet_kingdom').split(',');
      const stepT = Number(args.step || 2), margin = Number(args.margin || 14), patch = 44;
      const all = [];
      for (const id of islands) {
        const towns = await page.evaluate((id) => {
          const w = window.OP.game.world, isl = w.islands.find((i) => i.id === id);
          return isl ? isl.towns.map((t) => ({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, plaza: t.plaza })) : null;
        }, id);
        if (!towns) { console.log(`${id}: no such island`); continue; }
        for (const t of towns) {
          const rect = { x0: t.x - margin, y0: t.y - margin, x1: t.x + t.w + margin, y1: t.y + t.h + margin };
          const res = { island: id, town: t.id, points: 0, stops: 0, invisible: [] };
          // (in patches: everything within reach of one spot is streamed in)
          for (let py = rect.y0 + patch / 2; py < rect.y1 + patch / 2; py += patch) {
            for (let px = rect.x0 + patch / 2; px < rect.x1 + patch / 2; px += patch) {
              await page.evaluate(([x, y]) => { const g = window.OP.game, p = g.player; p.x = x; p.y = y; p.flying = true; p.alt = (g.view3d.ground(x, y) || 0) + 2; g.snapCamera?.(); }, [px, py]);
              await settleWorld(page);
              const r = await page.evaluate(probe, { cx: px, cy: py, half: patch / 2, stepT, rect, dbg: !!args.dbg });
              if (r.dbg) console.log('dbg', JSON.stringify(r.dbg));
              res.points += r.points; res.stops += r.stops; res.invisible.push(...r.invisible);
            }
          }
          all.push(res);
          const by = {};
          for (const s of res.invisible) { const k = `${s.why}: ${s.what.replace(/ top [\d.-]+ feet [\d.-]+/, '')}`; (by[k] ||= []).push(`${Math.round(s.x)},${Math.round(s.y)}`); }
          console.log(`${id}/${t.id}: ${res.points} spots, ${res.stops} stops, ${res.invisible.length} with nothing in the way`);
          for (const [k, at] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) console.log(`   ${String(at.length).padStart(4)}  ${k}   @ ${at.slice(0, 6).join(' ')}`);
          if (args.snap && res.invisible.length) {
            const s = res.invisible[0];
            await page.evaluate((s) => { const g = window.OP.game, p = g.player; p.flying = false; p.x = s.x - Math.cos(s.a) * 1.2; p.y = s.y - Math.sin(s.a) * 1.2; p.facing = s.a; g.settings.view = 'third'; g.applySettings(); const rig = g.view3d.rig; rig.yaw = s.a; rig.pitch = -0.25; g.snapCamera?.(); }, s);
            await settleWorld(page);
            await step(page, 0.2);
            await snap(`${id}-${t.id}`);
            await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); });
          }
        }
      }
      console.log('barrierhunt', JSON.stringify(all.map((r) => ({ island: r.island, town: r.town, points: r.points, stops: r.stops, invisible: r.invisible.slice(0, 60) }))));
    },
  },
};
