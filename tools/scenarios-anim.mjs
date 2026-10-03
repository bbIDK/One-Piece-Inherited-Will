// Animation review in 3D. A row of fighters, each frozen at a different
// moment of the same move, filmed square-on through a long lens: one picture
// is a whole filmstrip (wind-up, the blow, follow-through, recovery), seen
// from the side, from behind, from the front or three-quarter. Reactions
// (flinches by direction, a parry, a parried attacker reeling, a guard
// broken, launch and get-up, dodges, the block) are filmed the same way, and
// the first-person arms frame by frame. Contact sheets go to shots/.
//
//   node tools/shot.mjs anim-moves --moves=brawler:m1,brawler:heavy,gomu_pistol [--views=side,back] [--n=9] [--tag=before]
//     a move: <style>:m1 (every hit of the chain), <style>:m1.2 (the third), <style>:heavy, or a technique id
//   node tools/shot.mjs anim-react [--views=side,front] [--only=hurt,parry,...]
//   node tools/shot.mjs anim-fp --moves=brawler:m1,black_leg:m1.0,ittoryu:heavy,mera_hiken [--every=2] [--n=10]
//   node tools/shot.mjs anim-pose --js=<file>   (a function body given g, OP, LAB: pose the row yourself)
//   node tools/shot.mjs anim-live --moves=gomu_pistol,gomu_bazooka [--views=side,back,3q] [--every=2] [--n=12] [--fw=400]
//   node tools/shot.mjs anim-dodge [--races=human,skypiean,lunarian,mink,buccaneer,longleg] [--dirs=f,fr,r,br,b] [--views=side,back]
//   node tools/shot.mjs anim-fly [--styles=wings,phoenix,dragon,ride,float,geppo,none] [--views=side,back,3q]
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'shots');

const { FRUITS } = await import('../src/data/fruits.js');
const { STYLES } = await import('../src/data/styles.js');
await import('../src/data/haki.js');
const { getAbility, abilityTotal } = await import('../src/game/abilities.js');

// what each style fights with
const KIT = {
  brawler: {}, black_leg: {}, fishman_karate: {}, rokushiki: {}, okama_kenpo: {}, electro: {}, hasshoken: {}, ryusoken: {},
  ittoryu: { weapon: 'sword', count: 1 }, nitoryu: { weapon: 'sword', count: 2 }, santoryu: { weapon: 'sword', count: 3 },
  sniper: { weapon: 'gun', sling: true }, weather_science: { weapon: 'staff' }, elbaf: { weapon: 'axe' },
};
const VIEWS = { side: 0, back: -Math.PI / 2, front: Math.PI / 2, '3q': -Math.PI / 4, '3qf': Math.PI / 4, left: Math.PI };

/** A move spec → what to set up and how to start it, with its timing. */
function moveInfo(spec) {
  const [a, b] = spec.split(':');
  // (react:<kind> — a reaction from your own eyes: block, parry, parried, guardbreak, hit)
  if (a === 'react') return [{ label: `react ${b}`, react: b, style: 'brawler', kit: {} }];
  if (b !== undefined && STYLES[a]) {
    const st = STYLES[a];
    if (b === 'heavy') {
      const d = getAbility(st.heavyId);
      return [{ label: `${a} heavy`, style: a, kit: KIT[a] || {}, how: 'heavy', w: d.windup ?? 0.1, T: abilityTotal(d), hitDur: d.steps?.[0]?.hit?.duration || 0 }];
    }
    const only = b.startsWith('m1.') ? Number(b.slice(3)) : null;
    return st.m1Ids.map((id, i) => ({ id, i })).filter((x) => only === null || x.i === only).map(({ id, i }) => {
      const d = getAbility(id);
      return { label: `${a} m1.${i} ${d.anim}`, style: a, kit: KIT[a] || {}, how: 'm1', step: i, w: d.windup ?? 0.07, T: abilityTotal(d), hitDur: 0 };
    });
  }
  const d = getAbility(spec);
  if (!d) { console.log('unknown move', spec); return []; }
  const src = d.source || '';
  const fruit = src.startsWith('fruit:') ? src.slice(6) : null;
  const style = src.startsWith('style:') ? src.slice(6) : 'brawler';
  const main = (d.steps || []).find((s) => s.hit || s.proj || s.dash || s.zone) || {};
  const ranged = (d.steps || []).some((s) => s.proj || (s.hit && s.hit.shape === 'line') || s.zone || s.dash || s.teleport);
  return [{ label: `${spec} (${d.anim})`, style, fruit, kit: KIT[style] || {}, how: 'tech', id: spec, w: d.windup ?? 0.1, T: abilityTotal(d), hitDur: main.hit?.duration || 0, night: !!d.requiresNight, haki: d.hakiType || d.requiresHaki, ranged }];
}

/** Moments to film: the wind-up (from rest to the load), the blow, its hold, the follow-through and the way back. */
function timesFor(m, n) {
  const w = m.w, T = Math.max(m.T, w + 0.1), act = m.hitDur > 0.2 ? m.hitDur : 0;
  const pre = n >= 10 ? [0.15, 0.45, 0.72, 0.9] : [0.25, 0.6, 0.88];
  const out = [0, ...pre.map((k) => k * w), w, w + 0.035];
  if (act) out.push(w + act * 0.33, w + act * 0.66);
  const rest = T - (w + act + 0.04);
  for (const k of n >= 10 ? [0.12, 0.35, 0.6, 0.85] : [0.2, 0.5, 0.85]) out.push(w + act + 0.04 + rest * k);
  return out.map((x) => Math.round(x * 1000) / 1000);
}

const waitReady = (page) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });

/** In-page helpers (serialised into the page). */
function installLab() {
  const OP = window.OP, TAU = Math.PI * 2;
  const g = OP.game;
  // the live loop stops: frames are drawn only when the lab draws them
  OP.hold = true;
  window.requestAnimationFrame = () => 0;
  const LAB = {
    row: [], home: null, spacing: 1.7,
    /**
     * An open, flat patch of natural ground (grass, dirt, sand, flowers: no
     * streets, floors or water) from the row to well past the camera behind
     * it. The props on it are hidden (see studio).
     */
    findOpenGround() {
      const w = g.world, p = g.player;
      const NAT = new Set([16, 17, 18, 32]);
      const ok = (x, y) => NAT.has(w.type(x, y)) && !w.isBlocked(x, y) && !w.interiorAt(x, y);
      for (let r = 0; r < 220; r += 3) {
        const n = Math.max(1, Math.round(r / 2));
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU, x = Math.round(p.x + Math.cos(a) * r) + 0.5, y = Math.round(p.y + Math.sin(a) * r) + 0.5;
          let good = true;
          for (let dy = -6; dy <= 24 && good; dy++) for (let dx = -12; dx <= 12 && good; dx++) if (!ok(x + dx, y + dy)) good = false;
          if (!good) continue;
          const h0 = g.view3d.ground(x, y);
          for (let dx = -10; dx <= 10 && good; dx += 2) for (let dy = -3; dy <= 3 && good; dy += 3) if (Math.abs(g.view3d.ground(x + dx, y + dy) - h0) > 0.25) good = false;
          if (good) { LAB.home = { x, y }; return LAB.home; }
        }
      }
      console.log('anim lab: no open ground found');
      LAB.home = { x: p.x, y: p.y };
      return LAB.home;
    },
    /** Nothing standing about: props (trees, houses, crates) aren't drawn, only the grass and flowers. */
    studio() {
      const w = g.world;
      if (w.objects && !w.objects.__lab) {
        const q = w.objects.query.bind(w.objects);
        w.objects.query = (x0, y0, x1, y1, out) => {
          const keep = q(x0, y0, x1, y1).filter((o) => o.kind === 'grass' || o.kind === 'flower');
          if (out) { out.length = 0; out.push(...keep); return out; }
          return keep;
        };
        w.objects.__lab = true;
      }
      g.view3d.scan = null;
    },
    setup() {
      const p = g.player;
      g.settings.view = 'third'; g.settings.autoRes = false;
      g.applySettings?.();
      g.view3d.setActive(true); g.view3d.setMode('third'); g.view3d.setResScale?.(1);
      g.env.clock = 11; g.env.storm = 0; g.env.stormTarget = 0; g.env.weatherTimer = 1e9; g.env.rain = 0; g.env.snow = 0; g.env.fog = 0;
      g.spawner.update = () => {};
      const ui = document.getElementById('ui'); if (ui) ui.style.visibility = 'hidden';
      LAB.studio();
      if (!LAB.home) LAB.findOpenGround();
      console.log('anim lab at', JSON.stringify(LAB.home), 'tile', g.world.type(LAB.home.x, LAB.home.y));
      OP.teleport(LAB.home.x, LAB.home.y + 6);
      p.hidden = true; p.invulnerable = true;
    },
    clear() {
      const p = g.player;
      g.actors = g.actors.filter((a) => a === p);
      LAB.row = [];
      g.combat.hitboxes.length = 0; g.combat.projectiles.length = 0;
      g.fx.reset?.();
      g.areaZones.length = 0;
    },
    /** n fighters in a row (west to east) at the home spot, facing `facing`. */
    spawnRow(n, o = {}) {
      LAB.clear();
      const x0 = LAB.home.x - (n - 1) * LAB.spacing / 2;
      for (let i = 0; i < n; i++) {
        const a = OP.debug.makeNPC({ name: 'F' + i, id: 'animlab' + i, faction: 'pirate', level: 30, hpMul: 50, race: o.race || 'human', style: o.style || 'brawler', look: { seed: 21, frame: 'athletic', hair: 'short', hairColor: '#1e1e1e', skin: '#f1c9a0', topStyle: 'shirt', top: '#d63031', bottomStyle: 'trousers', bottom: '#1e3799', shoeStyle: 'boots', hat: null, coat: null, idle: 'rest', ...(o.look || {}) } }, x0 + i * LAB.spacing, LAB.home.y);
        a.game = g; a.controller = null; a.showName = false; a.hideBar = true;
        g.addActor(a);
        LAB.row.push(a);
      }
      return LAB.row;
    },
    equip(a, o = {}) {
      a.style = o.style || 'brawler';
      const kind = o.weapon || null;
      a.weapon = kind ? { kind, power: 1.2, count: o.count || 1, ids: kind === 'gun' ? (o.sling ? ['slingshot'] : ['flintlock']) : [] } : null;
      a.look = { ...a.look, swords: kind === 'sword' ? (o.count || 1) : 0, weapon: kind };
      a.drawn = !!kind;
      a.fruit = o.fruit || null; a.fruitMastery = o.fruit ? 100 : 0;
      a.masteries = { [a.style]: 100 };
      a.hakiSkill = { armament: 60, observation: 60, conqueror: 60 }; a.haki = 999;
      a.buffs = []; a.status = {}; a.cooldowns = {}; a.armament = !!o.armament;
      a.recalc();
    },
    /** Start a move on `a` and freeze it `t` seconds in. */
    startAt(a, m, t) {
      a.action = null; a.hitstun = 0; a.blocking = false; a.dash = null; a.cooldowns = {}; a.haki = 999; a.state = 'idle';
      let ok;
      if (m.how === 'm1') { a.combo.step = m.step; a.combo.window = 1; ok = a.tryM1(g); }
      else if (m.how === 'heavy') ok = a.tryHeavy(g);
      else ok = a.tryTechnique(m.id, g, null);
      if (!ok || !a.action) { console.log('could not start', m.label); return false; }
      a.action.t = t; a.action.step = 1e3;
      a.kb.x = 0; a.kb.y = 0;
      return true;
    },
    /** Draw one frame of the row as it stands, nothing moving on. */
    draw() {
      g.fx.reset?.();
      // (no grass round the ankles: the feet are what matter)
      if (g.view3d.groundCover) g.view3d.groundCover.group.visible = false;
      for (const a of LAB.row) {
        // (no blending in from the last pose, no easing round to a new facing: each frame stands alone)
        a._blendFrom = null; a._lastP = null; a._mode = undefined;
        if (a.action || a.__combat) a._lastActT = g.env.time;
        const v = g.view3d.actorViews.get(a);
        if (v) {
          v.visF = undefined;
          if (v.model && v.model.lod !== 0) v.model.setLod(0);
          if (v.model && !v.model.__lodPinned) { v.model.__lodPinned = true; v.model.setLod = () => {}; }
        }
      }
      g.render();
    },
    /** The long lens: from the south, looking north at the row, framing its width. */
    frame(width, h = 0.95, tilt = 0.05) {
      const r = g.view3d.rig, cam = r.camera;
      const W = width || LAB.row.length * LAB.spacing + 0.6;
      const fov = 16, aspect = cam.aspect || 16 / 9;
      const hf = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * aspect);
      const D = (W / 2) / Math.tan(hf / 2);
      const gy = g.view3d.ground(LAB.home.x, LAB.home.y);
      r.baseFov = fov; cam.fov = fov; cam.updateProjectionMatrix();
      r.shot = { from: [LAB.home.x, LAB.home.y + D, gy + h + D * tilt], at: [LAB.home.x, LAB.home.y, gy + h] };
    },
  };
  window.LAB = LAB;
  // (the interface the combat code gives the poses — parry, reeling, flinches —
  // derived here from the fields it keeps on the actor, for poses filmed before
  // it lands)
  const proto = Object.getPrototypeOf(g.player);
  let P = proto;
  while (P && !Object.prototype.hasOwnProperty.call(P, 'visualPose')) P = Object.getPrototypeOf(P);
  if (P && !P.__lab) {
    P.__lab = true;
    const orig = P.visualPose;
    P.visualPose = function (env, look, act, aura, alphaBuff) {
      const L = this.__react;
      // (kept on the actor as the combat code keeps them, for when it reads them itself)
      if (L) {
        for (const k of ['parryT', 'parryPerfect', 'parriedT', 'guardBrokenT', 'hitT', 'counterT']) if (L[k] !== undefined) this[k] = L[k];
        if (L.hitT !== undefined) { this.hitDir = (this.facing || 0) + (L.hitDirRel ?? 0); this.hitW = L.hitW ?? 0.5; }
      }
      const pose = orig.call(this, env, look, act, aura, alphaBuff);
      if (L) {
        const now = env.time;
        const age = (k) => now - L[k];
        const unset = (v) => v === undefined || v === Infinity;
        if (unset(pose.parryAge) && L.parryT !== undefined) { pose.parryAge = age('parryT'); pose.parryPerfect = !!L.parryPerfect; }
        if (unset(pose.parriedAge) && L.parriedT !== undefined) pose.parriedAge = age('parriedT');
        if (unset(pose.guardBrokenAge) && L.guardBrokenT !== undefined) pose.guardBrokenAge = age('guardBrokenT');
        if (unset(pose.counterAge) && L.counterT !== undefined) pose.counterAge = age('counterT');
        if (unset(pose.hitAge) && L.hitT !== undefined) { pose.hitAge = age('hitT'); pose.hitDirRel = L.hitDirRel ?? 0; pose.hitW = L.hitW ?? 0.5; }
      }
      return pose;
    };
  }
}

async function boot(page) {
  await page.evaluate(() => localStorage.clear());
  await waitReady(page);
  await page.evaluate(() => window.OP.quickStart('human'));
  await page.evaluate(() => window.OP.step(0.4));
  await page.evaluate(installLab);
  await page.evaluate(() => { window.LAB.setup(); window.OP.step(0.3); });
  // (let the terrain round the new spot load in)
  for (let i = 0; i < 6; i++) await page.evaluate(() => { window.OP.game.update(1 / 30); window.OP.game.render(); });
}

/** Compose captured PNG buffers into one labelled contact sheet. */
async function sheet(page, file, rows, title = '') {
  if (!rows.length) return;
  mkdirSync(outDir, { recursive: true });
  const p2 = await page.context().browser().newPage({ viewport: { width: 800, height: 600 } });
  const html = rows.map((r) => `<figure><img src="data:image/png;base64,${r.buf.toString('base64')}"><figcaption>${r.label}</figcaption></figure>`).join('');
  await p2.setContent(`<html><body style="margin:0;background:#111;color:#eee;font:13px monospace">
    ${title ? `<div style="padding:4px 6px;font-size:15px">${title}</div>` : ''}
    <div style="display:flex;flex-direction:column;gap:3px;width:max-content">${html}</div>
    <style>figure{margin:0}img{display:block}figcaption{padding:1px 4px}</style></body></html>`);
  await p2.waitForTimeout(50);
  const path = join(outDir, file);
  await p2.screenshot({ path, fullPage: true });
  await p2.close();
  console.log(`sheet → ${path}`);
}

/** The strip's picture: the band of the screen the row stands in. */
const stripClip = (page) => page.evaluate(() => ({ x: 0, y: Math.round(innerHeight * 0.18), width: innerWidth, height: Math.round(innerHeight * 0.64) }));

async function filmMove(page, m, views, n, rows) {
  const times = timesFor(m, n);
  for (const view of views) {
    const ok = await page.evaluate(({ m, times, facing }) => {
      const L = window.LAB, g = window.OP.game;
      L.spawnRow(times.length, { style: m.style });
      if (m.night) g.env.clock = 0; else g.env.clock = 11;
      let good = true;
      L.row.forEach((a, i) => {
        L.equip(a, { style: m.style, ...m.kit, fruit: m.fruit });
        a.facing = facing;
        good = L.startAt(a, m, times[i]) && good;
      });
      L.frame();
      // (the views are made on the first draw: once more, now they're all there)
      L.draw(); L.draw();
      return good;
    }, { m, times, facing: VIEWS[view] ?? 0 });
    if (!ok) console.log('(some fighters could not start', m.label + ')');
    const clip = await stripClip(page);
    rows.push({ label: `${m.label} — ${view} — t = ${times.map((t) => t.toFixed(2)).join(' ')}`, buf: await page.screenshot({ clip }) });
  }
}

// ------------------------------------------------------------------ reactions
// Each reaction: how to put a fighter into it, and the moments (seconds after
// it began) to film. `set(a, t)` runs in the page with the reaction t seconds old.
const REACT = {
  // (hitDirRel is the way the blow pushes, from the facing: π struck from the front, +π/2 pushed to the right)
  hurt_front: { label: 'flinch: hit from the front', ts: [0, 0.03, 0.07, 0.12, 0.2, 0.3, 0.45], set: 'hit:3.1416' },
  hurt_back: { label: 'flinch: hit from behind', ts: [0, 0.03, 0.07, 0.12, 0.2, 0.3, 0.45], set: 'hit:0' },
  hurt_left: { label: 'flinch: hit from the left (pushed right)', ts: [0, 0.03, 0.07, 0.12, 0.2, 0.3, 0.45], set: 'hit:1.5708' },
  hurt_right: { label: 'flinch: hit from the right (pushed left)', ts: [0, 0.03, 0.07, 0.12, 0.2, 0.3, 0.45], set: 'hit:-1.5708' },
  hurt_heavy: { label: 'flinch: a heavy blow from the front (no stagger after)', ts: [0, 0.03, 0.07, 0.12, 0.2, 0.3, 0.45], set: 'hitw:3.1416' },
  stagger: { label: 'stagger (hitstun 0.6, no direction)', ts: [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6], set: 'stun' },
  parry: { label: 'parry (fists): the guard snaps across', ts: [0, 0.02, 0.05, 0.09, 0.14, 0.2, 0.3, 0.45], set: 'parry' },
  parry_sword: { label: 'parry (sword): the blade deflects', ts: [0, 0.02, 0.05, 0.09, 0.14, 0.2, 0.3, 0.45], set: 'parry', kit: { style: 'ittoryu', weapon: 'sword', count: 1 } },
  parried: { label: 'parried: the attacker reels, wide open', ts: [0, 0.04, 0.1, 0.18, 0.3, 0.45, 0.65, 0.85], set: 'parried' },
  guard_break: { label: 'guard broken: the stumble', ts: [0, 0.04, 0.1, 0.2, 0.35, 0.55, 0.8, 1.0], set: 'guardbreak' },
  launch: { label: 'knock-back launch', ts: [0, 0.05, 0.1, 0.2, 0.3, 0.45], set: 'launch' },
  knockdown: { label: 'knocked down: the fall and the bounce', ts: [0, 0.05, 0.1, 0.16, 0.22, 0.28, 0.36, 0.45], set: 'knocked' },
  getup: { label: 'get-up', ts: [0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.48], set: 'getup' },
  block: { label: 'block (fresh, then held; armed)', ts: [0, 0.03, 0.07, 0.12, 0.2, 0.5], set: 'block' },
  dodge_fwd: { label: 'dodge forward (roll)', ts: [0, 0.03, 0.06, 0.1, 0.14, 0.18, 0.22], set: 'dodge:1,0' },
  dodge_back: { label: 'dodge back', ts: [0, 0.03, 0.06, 0.1, 0.14, 0.18, 0.22], set: 'dodge:-1,0' },
  dodge_side: { label: 'dodge sideways', ts: [0, 0.03, 0.06, 0.1, 0.14, 0.18, 0.22], set: 'dodge:0,1' },
  counter: { label: 'counter strike landing', ts: [0, 0.03, 0.07, 0.12, 0.2, 0.3], set: 'counter' },
};

async function filmReact(page, key, views, rows) {
  const R = REACT[key];
  for (const view of views) {
    await page.evaluate(({ R, facing }) => {
      const L = window.LAB, g = window.OP.game, now = g.env.time;
      L.spawnRow(R.ts.length);
      L.row.forEach((a, i) => {
        L.equip(a, R.kit || {});
        a.facing = facing;
        a.__combat = true;
        const t = R.ts[i], [kind, arg] = R.set.split(':');
        a.action = null; a.hitstun = 0; a.blocking = false; a.dash = null; a.__react = null; a._getUpT = 0; a.kb.x = 0; a.kb.y = 0; a.state = 'idle';
        if (kind === 'hit' || kind === 'hitw') {
          // a medium blow and the hit stun it leaves (or a heavy one taken on armour, no stun)
          const w = kind === 'hitw' ? 1.1 : 0.6;
          a.__react = { hitT: now - t, hitDirRel: Number(arg), hitW: w };
          a.hitstun = kind === 'hitw' ? 0 : Math.max(0, 0.35 - t);
          a.hitFx = { t0: now - t, w, ang: facing + Number(arg), prev: -9 };
        } else if (kind === 'stun') a.hitstun = Math.max(0, 0.6 - t);
        else if (kind === 'parry') { a.blocking = true; a.blockTime = 0.05 + t; a.__react = { parryT: now - t, parryPerfect: true }; a._blockFlash = now - t; }
        else if (kind === 'parried') { a.hitstun = Math.max(0, 0.9 - t); a.__react = { parriedT: now - t }; }
        else if (kind === 'guardbreak') { a.hitstun = Math.max(0, 1.1 - t); a.__react = { guardBrokenT: now - t }; }
        else if (kind === 'launch') { a.hitstun = 0.5; const k = 14 * Math.exp(-t * 4); a.kb.x = -Math.cos(facing) * k; a.kb.y = -Math.sin(facing) * k; a.__react = { hitT: now - t, hitDirRel: Math.PI, hitW: 1.1 }; }
        else if (kind === 'getup') { a._getUpT = Math.max(0.001, 0.5 - t); a._wasDown = false; }
        else if (kind === 'knocked') { a.state = 'knocked'; a.knockT = t; a.__combat = false; }
        else if (kind === 'block') { a.blocking = true; a.blockTime = t; }
        else if (kind === 'dodge') {
          const [dx, dy] = arg.split(',').map(Number);
          const c = Math.cos(facing), s = Math.sin(facing);
          const wx = dx * c - dy * s, wy = dx * s + dy * c, v = 3.2 / 0.22;
          a.dash = { vx: wx * v, vy: wy * v, t: Math.max(0.001, 0.22 - t), t0: 0.22, dodge: true };
        } else if (kind === 'counter') { a.__react = { counterT: now - t }; }
        // (filmed partway into it: the stagger began with its blow, or with none)
        a._stunWas = a.hitstun > 0; a._stunBlind = kind === 'stun';
      });
      L.frame();
      L.draw(); L.draw();
    }, { R, facing: VIEWS[view] ?? 0 });
    const clip = await stripClip(page);
    rows.push({ label: `${R.label} — ${view} — t = ${R.ts.map((t) => t.toFixed(2)).join(' ')}`, buf: await page.screenshot({ clip }) });
  }
}

// ------------------------------------------------------------------ dodges
// A dash in one direction (from the facing: f forward, b back, r / l to the
// right or left, and the diagonals), by one race: the row is the dash frozen
// at its moments.
const DODGE_DIRS = { f: [1, 0], fr: [0.707, 0.707], r: [0, 1], br: [-0.707, 0.707], b: [-1, 0], bl: [-0.707, -0.707], l: [0, -1], fl: [0.707, -0.707] };
const DODGE_TS = [0, 0.02, 0.045, 0.07, 0.1, 0.13, 0.16, 0.19, 0.215];
async function filmDodge(page, race, dir, views, rows) {
  for (const view of views) {
    await page.evaluate(({ race, d, ts, facing }) => {
      const L = window.LAB;
      L.spawnRow(ts.length, { race });
      L.row.forEach((a, i) => {
        L.equip(a, {});
        a.facing = facing; a.__combat = true;
        const c = Math.cos(facing), s = Math.sin(facing);
        const wx = d[0] * c - d[1] * s, wy = d[0] * s + d[1] * c, v = 3.2 / 0.22;
        a.dash = { vx: wx * v, vy: wy * v, t: Math.max(0.001, 0.22 - ts[i]), t0: 0.22, dodge: true };
      });
      L.frame();
      L.draw(); L.draw();
    }, { race, d: DODGE_DIRS[dir], ts: DODGE_TS, facing: VIEWS[view] ?? 0 });
    const clip = await stripClip(page);
    rows.push({ label: `dodge ${dir} — ${race} — ${view} — t = ${DODGE_TS.map((t) => t.toFixed(2)).join(' ')}`, buf: await page.screenshot({ clip }) });
  }
}

// ------------------------------------------------------------------ flight
// One flight style through its states, a fighter frozen in each: hovering,
// cruising (slow, fast, flat out), climbing, diving, banking either way, the
// take-off and the landing. (game/actor.js flying and flightStyle, the
// velocity, the altitude; render/anim/flight.js flightState keeps the rest
// on the actor: set here as it would be mid-flight.)
const FLY_STATES = [
  { n: 'hover', v: 0, t: 0.3 }, { n: 'hover+', v: 0, t: 0.62 }, { n: 'slow', v: 4 }, { n: 'cruise', v: 9 }, { n: 'flat out', v: 22 },
  { n: 'climb', v: 7, climb: 5 }, { n: 'dive', v: 9, climb: -8 }, { n: 'bank R', v: 10, bank: 0.6 }, { n: 'bank L', v: 10, bank: -0.6 },
  { n: 'strafe R', v: 0, side: 7 }, { n: 'back', v: -5 },
  { n: 'take-off .05', v: 0, up: 0.05, z: 0.05 }, { n: 'take-off .15', v: 0, up: 0.15, z: 0.3 }, { n: 'take-off .3', v: 0, up: 0.3, z: 1.2 },
  { n: 'land .03', down: 0.03 }, { n: 'land .12', down: 0.12 }, { n: 'land .25', down: 0.25 },
];
async function filmFly(page, style, views, rows, race) {
  for (const view of views) {
    await page.evaluate(({ style, S, facing, race }) => {
      const L = window.LAB, g = window.OP.game, now = g.env.time;
      L.spacing = 2.3;
      L.spawnRow(S.length, { race });
      L.row.forEach((a, i) => {
        const st = S[i];
        L.equip(a, {});
        a.facing = facing;
        const c = Math.cos(facing), s = Math.sin(facing);
        const fwd = st.v || 0, side = st.side || 0;
        a.vx = fwd * c - side * s; a.vy = fwd * s + side * c;
        a.moving = Math.hypot(a.vx, a.vy) > 0.4; a.speed = Math.hypot(a.vx, a.vy);
        if (st.down !== undefined) {
          a.flying = false; a.z = 0; a.vx = 0; a.vy = 0; a.moving = false;
          a._fly = { on: false, upT: now - 9, downT: now - st.down, t0: now - 9, h: null, bank: 0, alt: null, climb: 0, last: now, style: style === 'none' ? null : style };
        } else {
          a.flying = true; a.flightStyle = style === 'none' ? undefined : style;
          a.z = st.z ?? 2.2; a.alt = null;
          const up = st.up ?? 9;
          a._fly = { on: true, upT: now - up, downT: now - 9, t0: now - (st.t ?? up), h: Math.atan2(a.vy, a.vx), bank: st.bank || 0, alt: a.z, climb: st.climb || 0, last: now, style: style === 'none' ? null : style };
        }
      });
      L.frame(undefined, 2.4, 0.03);
      L.draw(); L.draw();
      L.spacing = 1.7;
    }, { style, S: FLY_STATES, facing: VIEWS[view] ?? 0, race });
    const clip = await page.evaluate(() => ({ x: 0, y: Math.round(innerHeight * 0.08), width: innerWidth, height: Math.round(innerHeight * 0.84) }));
    rows.push({ label: `flight: ${style}${race ? ' (' + race + ')' : ''} — ${view} — ${FLY_STATES.map((x) => x.n).join(' | ')}`, buf: await page.screenshot({ clip }) });
  }
}

// ------------------------------------------------------------------ first person
async function filmFP(page, m, every, n, rows) {
  const frames = [];
  await page.evaluate((m) => {
    const L = window.LAB, g = window.OP.game, p = g.player;
    L.clear();
    // a sparring dummy a couple of metres off, and your own body back where it was
    p.hidden = false; p.invulnerable = true;
    window.OP.teleport(L.home.x - 1.5, L.home.y);
    L.equip(p, { style: m.style, ...m.kit, fruit: m.fruit });
    p.drawn = !!m.kit.weapon;
    if (m.haki) { p.hakiSkill = { armament: 60, observation: 60, conqueror: 60 }; }
    const d = window.OP.debug.makeNPC({ name: 'Dummy', id: 'animdummy', faction: 'marine', level: 30, hpMul: 400, look: { hair: 'bald', top: '#8d6e63', bottom: '#5d4037' } }, L.home.x + 0.8, L.home.y);
    d.controller = null; d.game = g; d.facing = Math.PI; d.showName = false; d.hideBar = true; g.addActor(d); L.row = [d]; L.dummy = d;
    g.settings.view = 'first'; g.view3d.setMode('first');
    const r = g.view3d.rig;
    r.shot = null; r.baseFov = 75; r.camera.fov = 75; r.camera.updateProjectionMatrix();
    r.yaw = 0; r.pitch = -0.08; p.facing = 0;
    if (m.night) g.env.clock = 0; else g.env.clock = 11;
    for (let i = 0; i < 20; i++) { g.update(1 / 60); }
    g.render();
  }, m);
  // start it, then step frame by frame
  await page.evaluate((m) => {
    const L = window.LAB, g = window.OP.game, p = g.player;
    p.action = null; p.cooldowns = {}; p.haki = 999; p.hitstun = 0; p.__react = null; p._stunWas = false;
    const r = g.view3d.rig; r.yaw = 0; r.pitch = -0.08; p.facing = 0;
    if (m.react) {
      // (the guard is held with the real key; the reaction's clock starts now)
      const now = g.env.time, k = m.react;
      if (k === 'block' || k === 'parry') { window.OP.key('F', true); for (let i = 0; i < (k === 'parry' ? 3 : 1); i++) g.update(1 / 60); }
      if (k === 'parry') p.__react = { parryT: g.env.time, parryPerfect: true };
      else if (k === 'parried') { p.hitstun = 0.9; p.__react = { parriedT: now }; }
      else if (k === 'guardbreak') { p.hitstun = 1.1; p.__react = { guardBrokenT: now }; }
      else if (k === 'hit') { p.hitstun = 0.35; p.__react = { hitT: now, hitDirRel: Math.PI, hitW: 0.8 }; }
      return;
    }
    let ok;
    if (m.how === 'm1') { p.combo.step = m.step; p.combo.window = 1; ok = p.tryM1(g); }
    else if (m.how === 'heavy') ok = p.tryHeavy(g);
    else ok = p.tryTechnique(m.id, g, L.dummy);
    if (!ok) console.log('could not start (first person)', m.label);
  }, m);
  for (let i = 0; i < n; i++) {
    await page.evaluate((every) => { const g = window.OP.game; for (let k = 0; k < every; k++) g.update(1 / 60); g.view3d.rig.yaw = 0; g.view3d.rig.pitch = -0.08; g.render(); }, every);
    frames.push(await page.screenshot({ clip: await page.evaluate(() => ({ x: Math.round(innerWidth * 0.18), y: Math.round(innerHeight * 0.12), width: Math.round(innerWidth * 0.64), height: Math.round(innerHeight * 0.88) })) }));
  }
  rows.push({ label: `${m.label} (first person, every ${every}/60 s)`, frames });
  await page.evaluate(() => { const g = window.OP.game, p = g.player; window.OP.key('F', false); for (let i = 0; i < 40; i++) g.update(1 / 60); p.__react = null; p.hidden = true; g.settings.view = 'third'; g.view3d.setMode('third'); });
}

// ------------------------------------------------------------------ live
// One fighter against a dummy, the game really running (projectiles, a
// Gum-Gum arm stretching after its fist, the effects): through the long
// lens from the side (or from behind the fighter, in front of it, three-
// quarter), a frame every `every` sixtieths of a second.
async function filmLive(page, m, every, n, rows, view = 'side') {
  const frames = [];
  await page.evaluate(({ m, facing }) => {
    const L = window.LAB, g = window.OP.game;
    L.spacing = 1.7;
    L.spawnRow(1, { style: m.style });
    const a = L.row[0];
    L.equip(a, { style: m.style, ...m.kit, fruit: m.fruit });
    const c = Math.cos(facing), s = Math.sin(facing), off = m.ranged ? 3.2 : 0.1;
    a.x = L.home.x - c * 1.8; a.y = L.home.y - s * 1.8; a.facing = facing;
    const d = window.OP.debug.makeNPC({ name: 'Dummy', id: 'animdummy', faction: 'marine', level: 30, hpMul: 400, look: { hair: 'bald', top: '#8d6e63', bottom: '#5d4037' } }, L.home.x + c * off, L.home.y + s * off);
    d.controller = null; d.game = g; d.facing = facing + Math.PI; d.showName = false; d.hideBar = true; d.invulnerable = true; g.addActor(d); L.row.push(d);
    L.liveAt = [[a.x, a.y], [d.x, d.y]];
    if (m.night) g.env.clock = 0; else g.env.clock = 11;
    L.frame(7.5, 1.0, 0.04);
    for (let i = 0; i < 3; i++) { g.update(1 / 60); g.render(); }
    L.startAt(a, m, 0);
    // (at the move's own pace: a foe's wind-up is slowed for you to read in the gentler seas)
    a.action.t = 0; a.action.step = 0; a.action.slow = 1;
    a.__combat = true;
  }, { m, facing: VIEWS[view] ?? 0 });
  for (let i = 0; i < n; i++) {
    await page.evaluate((every) => {
      const g = window.OP.game, L = window.LAB;
      for (let k = 0; k < every; k++) g.update(1 / 60);
      // (the fighter stays where it stands: no drifting out of the frame on a lunge)
      if (!L.liveDrift) L.row.forEach((x, j) => { x.x = L.liveAt[j][0]; x.y = L.liveAt[j][1]; });
      if (g.view3d.groundCover) g.view3d.groundCover.group.visible = false;
      g.render();
    }, every);
    frames.push(await page.screenshot({ clip: await page.evaluate(() => ({ x: Math.round(innerWidth * 0.12), y: Math.round(innerHeight * 0.08), width: Math.round(innerWidth * 0.76), height: Math.round(innerHeight * 0.84) })) }));
  }
  rows.push({ label: `${m.label} (live, ${view}, every ${every}/60 s)`, frames });
}

async function fpSheet(page, file, rows, title, fw = 300) {
  mkdirSync(outDir, { recursive: true });
  const p2 = await page.context().browser().newPage({ viewport: { width: 800, height: 600 } });
  const html = rows.map((r) => `<div style="padding:2px 4px">${r.label}</div><div style="display:flex;gap:2px">${r.frames.map((b) => `<img style="width:${fw}px" src="data:image/png;base64,${b.toString('base64')}">`).join('')}</div>`).join('');
  await p2.setContent(`<html><body style="margin:0;background:#111;color:#eee;font:13px monospace">${title ? `<div style="padding:4px 6px;font-size:15px">${title}</div>` : ''}<div style="width:max-content">${html}</div></body></html>`);
  await p2.waitForTimeout(50);
  const path = join(outDir, file);
  await p2.screenshot({ path, fullPage: true });
  await p2.close();
  console.log(`sheet → ${path}`);
}

export const scenarios = {
  'anim-moves': {
    async run(page, snap, args) {
      await boot(page);
      if (args.spacing) await page.evaluate((s) => { window.LAB.spacing = s; }, Number(args.spacing));
      const specs = String(args.moves || 'brawler:m1,brawler:heavy').split(',');
      const views = String(args.views || 'side').split(',');
      const n = Number(args.n || 9);
      const per = Number(args.per || 8);
      let rows = [], part = 0;
      const tag = args.tag ? '-' + args.tag : '';
      for (const spec of specs) {
        for (const m of moveInfo(spec)) {
          await filmMove(page, m, views, n, rows);
          if (rows.length >= per * views.length) { await sheet(page, `anim-moves${tag}-${++part}.png`, rows, `moves ${tag}`); rows = []; }
        }
      }
      if (rows.length) await sheet(page, `anim-moves${tag}-${++part}.png`, rows, `moves ${tag}`);
    },
  },
  'anim-react': {
    async run(page, snap, args) {
      await boot(page);
      const keys = args.only ? String(args.only).split(',') : Object.keys(REACT);
      const views = String(args.views || 'side').split(',');
      const per = Number(args.per || 4);
      const tag = args.tag ? '-' + args.tag : '';
      let rows = [], part = 0;
      for (const k of keys) {
        if (!REACT[k]) continue;
        await filmReact(page, k, views, rows);
        if (rows.length >= per * views.length) { await sheet(page, `anim-react${tag}-${++part}.png`, rows, `reactions ${tag}`); rows = []; }
      }
      if (rows.length) await sheet(page, `anim-react${tag}-${++part}.png`, rows, `reactions ${tag}`);
    },
  },
  'anim-fp': {
    async run(page, snap, args) {
      await boot(page);
      const specs = String(args.moves || 'brawler:m1').split(',');
      const every = Number(args.every || 2), n = Number(args.n || 10);
      const rows = [];
      for (const spec of specs) for (const m of moveInfo(spec)) await filmFP(page, m, every, n, rows);
      const tag = args.tag ? '-' + args.tag : '';
      await fpSheet(page, `anim-fp${tag}.png`, rows, `first person ${tag}`);
    },
  },
  'anim-live': {
    async run(page, snap, args) {
      await boot(page);
      const specs = String(args.moves || 'gomu_pistol').split(',');
      const views = String(args.views || 'side').split(',');
      const every = Number(args.every || 3), n = Number(args.n || 10);
      const rows = [];
      for (const spec of specs) for (const m of moveInfo(spec)) for (const v of views) await filmLive(page, m, every, n, rows, v);
      const tag = args.tag ? '-' + args.tag : '';
      await fpSheet(page, `anim-live${tag}.png`, rows, `live ${tag}`, Number(args.fw || 300));
    },
  },
  'anim-dodge': {
    async run(page, snap, args) {
      await boot(page);
      const races = String(args.races || 'human').split(',');
      const dirs = String(args.dirs || 'f,fr,r,br,b').split(',');
      const views = String(args.views || 'side').split(',');
      const per = Number(args.per || 6);
      const tag = args.tag ? '-' + args.tag : '';
      let rows = [], part = 0;
      for (const race of races) for (const dir of dirs) {
        await filmDodge(page, race, dir, views, rows);
        if (rows.length >= per) { await sheet(page, `anim-dodge${tag}-${++part}.png`, rows, `dodges ${tag}`); rows = []; }
      }
      if (rows.length) await sheet(page, `anim-dodge${tag}-${++part}.png`, rows, `dodges ${tag}`);
    },
  },
  'anim-fly': {
    async run(page, snap, args) {
      await boot(page);
      const styles = String(args.styles || 'wings,phoenix,dragon,ride,float,geppo,none').split(',');
      const views = String(args.views || 'side').split(',');
      const per = Number(args.per || 4);
      const tag = args.tag ? '-' + args.tag : '';
      let rows = [], part = 0;
      for (const style of styles) {
        // (wings fly on wings: a Lunarian's)
        await filmFly(page, style, views, rows, args.race || (style === 'wings' ? 'lunarian' : 'human'));
        if (rows.length >= per) { await sheet(page, `anim-fly${tag}-${++part}.png`, rows, `flight ${tag}`); rows = []; }
      }
      if (rows.length) await sheet(page, `anim-fly${tag}-${++part}.png`, rows, `flight ${tag}`);
    },
  },
  'anim-pose': {
    async run(page, snap, args) {
      await boot(page);
      const body = readFileSync(String(args.js), 'utf8');
      const out = await page.evaluate((body) => new Function('g', 'OP', 'LAB', body)(window.OP.game, window.OP, window.LAB), body);
      if (out) console.log('pose', JSON.stringify(out));
      // (a body that leaves the view as it should be filmed — first person, say — returns { asIs: true })
      if (!out || !out.asIs) await page.evaluate(() => { window.LAB.frame(); window.LAB.draw(); window.LAB.draw(); });
      await snap('pose');
    },
  },
};
