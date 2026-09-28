// 3D characters: race / hair / hat line-ups, third-person close-ups, mid-attack
// frames for several styles, the first-person viewmodel (idle, punches,
// swords, block, guns, Devil Fruit techniques) and a Sea King.
//   node tools/shot.mjs chars3d        (everything)
//   node tools/shot.mjs c3q            (quick: races + a punch)
//   node tools/shot.mjs c3vm           (viewmodel only)
const waitReady = (page, timeout = 180000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

/** Helpers injected into the page. */
function helpers() {
  const OP = window.OP;
  const TAU = Math.PI * 2;
  window.__C3 = {
    npcs: [],
    clear() {
      const g = OP.game;
      g.actors = g.actors.filter((a) => a === g.player);
      this.npcs = [];
      g.bossTarget = null;
    },
    /** A still NPC at (dx, dy) from the player, facing `face` (default: toward the player). */
    spawn(def, dx, dy, face) {
      const g = OP.game, p = g.player;
      const a = OP.debug.makeNPC({ level: 12, faction: 'civilian', ...def }, p.x + dx, p.y + dy);
      a.controller = null;
      a.facing = face ?? Math.atan2(-dy, -dx);
      a.showName = def.showName ?? true;
      if (def.weapon) a.weapon = { kind: def.weapon, power: 1.2, count: def.count || 1, ids: def.ids || [] };
      g.addActor(a);
      this.npcs.push(a);
      return a;
    },
    view(yaw, pitch, mode = 'first', dist) {
      const g = OP.game, v = g.view3d;
      g.settings.view = mode; g.applySettings();
      v.rig.yaw = ((yaw % TAU) + TAU) % TAU; v.rig.pitch = pitch;
      if (dist) v.rig.tp.dist = dist;
    },
    /** A clear sunny spot on Conomi (no trees or houses in the 14 m east of you) at noon. */
    goSunny() {
      const g = OP.game, w = g.world;
      const def = OP.debug.npcDef('arlong');
      const isl = g.surface.islands.find((i) => i.id === def.island);
      const t = isl.towns[0];
      const p = g.player;
      const ok = (x, y) => {
        for (let dx = -3; dx <= 13; dx += 1) for (let dy = -7; dy <= 7; dy += 1) {
          if (w.isLiquid(x + dx, y + dy) || w.isBlocked(x + dx, y + dy) || !p.passable(w, x + dx, y + dy)) return false;
        }
        return w.objects.query(x - 9, y - 12, x + 20, y + 12).filter((o) => !o.hidden && o.kind !== 'flower' && o.kind !== 'grass').length === 0;
      };
      let spot = null;
      for (let r = 0; r < 160 && !spot; r += 3) {
        const n = Math.max(1, Math.round(r / 2));
        for (let k = 0; k < n && !spot; k++) {
          const a = (k / n) * TAU;
          const x = t.plaza.x + Math.cos(a) * r, y = t.plaza.y + Math.sin(a) * r;
          if (ok(x, y)) spot = [x, y];
        }
      }
      if (!spot) spot = [t.plaza.x, t.plaza.y + 1];
      OP.teleport(spot[0], spot[1]);
      g.env.clock = 11.5;
      g.env.rain = 0; g.env.storm = 0; g.env.fog = 0; g.env.snow = 0;
      p.facing = 0;
      if (p.controller) p.controller.aimT = 0;
      return spot;
    },
    perf() {
      const v = OP.game.view3d, i = v.renderer.info;
      return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, actors: OP.game.actors.length, views: v.actorViews.size };
    },
    player() { return OP.game.player; },
  };
}

async function boot(page, race = 'human') {
  await page.evaluate(() => localStorage.clear());
  await waitReady(page);
  await page.evaluate((r) => window.OP.quickStart(r), race);
  await page.evaluate(helpers);
  await step(page, 0.3);
  await page.evaluate(() => { window.__C3.goSunny(); window.__C3.clear(); window.__C3.view(0, -0.12); });
  for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 2); }
}
const settle = async (page, n = 4) => { for (let i = 0; i < n; i++) { await step(page, 0.05); await frames(page, 2); } };

// ------------------------------------------------------------------ line-ups
const RACES = ['human', 'fishman', 'mink', 'skypiean', 'longarm', 'longleg', 'buccaneer', 'three_eye', 'lunarian'];
async function raceLineup(page, snap) {
  await page.evaluate((races) => {
    const C = window.__C3; C.clear();
    races.forEach((r, i) => C.spawn({ name: r, race: r, id: 'lineup_' + r + i }, 5.2, (i - (races.length - 1) / 2) * 1.15));
    C.spawn({ name: 'Mink Rabbit', race: 'mink', id: 'mink_b7', look: { ears: 'long', fur: '#f5f6fa', kind: 'Rabbit', tail: 'fluffy', skin: '#f5f6fa', hairColor: '#f5f6fa', hand: '#f5f6fa' } }, 7.2, -1.8);
    C.spawn({ name: 'Mink Bear', race: 'mink', id: 'mink_c2', look: { ears: 'round', fur: '#6d4c41', kind: 'Bear', muzzle: true, skin: '#6d4c41', hairColor: '#6d4c41', hand: '#6d4c41', furFace: true } }, 7.2, 1.8);
    C.view(0, -0.1);
  }, RACES);
  await settle(page, 6);
  await snap('races');
  await page.evaluate(() => window.__C3.view(0.2, -0.18, 'first'));
  await settle(page, 2);
  await snap('races-right');
}

const HAIRS = ['short', 'spiky', 'long', 'ponytail', 'buzz', 'curly', 'afro', 'topknot', 'mohawk', 'bald', 'bun', 'pompadour'];
const COLS = ['#1e1e1e', '#6b4423', '#f2d16b', '#c0392b', '#2980b9', '#e67e22', '#2d2d2d', '#dfe6e9', '#2ecc71', '#000', '#e84393', '#3b2a1a'];
async function hairLineup(page, snap) {
  await page.evaluate(([hairs, cols]) => {
    const C = window.__C3; C.clear();
    hairs.forEach((h, i) => C.spawn({ name: h, id: 'hair' + i, look: { hair: h, hairColor: cols[i], hat: null, skin: '#f1c9a0', top: ['#d63031', '#0984e3', '#00b894', '#fdcb6e'][i % 4] } }, 4.4 + (i % 2) * 1.6, (Math.floor(i / 2) - 2.5) * 1.05));
    C.view(0, -0.1);
  }, [HAIRS, COLS]);
  await settle(page, 6);
  await snap('hair');
  // from behind: the back of every style
  await page.evaluate(() => { const C = window.__C3; for (const a of C.npcs) a.facing = 0; });
  await settle(page, 3);
  await snap('hair-back');
}

const HATS = [['straw'], ['captain', '#2c2831'], ['tricorne'], ['cowboy'], ['marine'], ['pinkhat'], ['beanie', '#e74c3c'], ['bandana'], ['headband', '#212121'], ['goggles'], ['horns'], ['crown'], ['halo'], ['antlers'], ['tophat']];
async function hatLineup(page, snap) {
  await page.evaluate((hats) => {
    const C = window.__C3; C.clear();
    hats.forEach(([h, c], i) => C.spawn({ name: h, id: 'hat' + i, look: { hat: h, hatColor: c, hair: ['short', 'spiky', 'long', 'curly', 'ponytail'][i % 5], coat: h === 'marine' ? '#fafafa' : h === 'captain' ? '#1a237e' : null, coatText: h === 'marine' ? 'JUSTICE' : null } }, 4.2 + (i % 3) * 1.4, (Math.floor(i / 3) - 2) * 1.1));
    C.view(0, -0.1);
  }, HATS);
  await settle(page, 6);
  await snap('hats');
  await page.evaluate(() => { const C = window.__C3; for (const a of C.npcs) a.facing = 0; });
  await settle(page, 3);
  await snap('hats-back');
}

// ------------------------------------------------------------------ close-ups
async function closeups(page, snap) {
  await page.evaluate(() => {
    const C = window.__C3; C.clear();
    const g = window.OP.game, p = g.player;
    p.look = { ...p.look, hat: 'straw', hair: 'short', hairColor: '#1e1e1e', top: '#d63031', openShirt: true, bottom: '#1e3799', coat: null };
    C.view(0, 0.05, 'third', 2.4);
  });
  await settle(page, 6);
  await page.evaluate(() => { const p = window.OP.game.player; p.controller.aimT = 0; p.facing = Math.PI; });
  await settle(page, 2);
  await snap('tp-face');
  await page.evaluate(() => { const p = window.OP.game.player; p.controller.aimT = 0; p.facing = Math.PI * 0.75; });
  await settle(page, 2);
  await snap('tp-three-quarter');
  await page.evaluate(() => { const g = window.OP.game, p = g.player; p.facing = 0; window.__C3.view(0, 0.1, 'third', 3.2); });
  await settle(page, 2);
  await snap('tp-back');
  // walking and running
  await page.evaluate(() => { window.OP.key('W', true); });
  await step(page, 0.6); await frames(page, 2);
  await snap('tp-walk');
  await page.evaluate(() => { window.OP.key('Shift', true); });
  await step(page, 0.5); await frames(page, 2);
  await snap('tp-run');
  await page.evaluate(() => { window.OP.key('W', false); window.OP.key('Shift', false); });
  await step(page, 0.3);
}

/** Several fighters attacking at once, snapped mid-swing. */
async function attacks(page, snap) {
  await page.evaluate(() => {
    const C = window.__C3; C.clear();
    const g = window.OP.game, p = g.player;
    const defs = [
      { name: 'Brawler', style: 'brawler', look: { hair: 'spiky', hairColor: '#3b2a1a', top: '#d63031' } },
      { name: 'Black Leg', style: 'black_leg', look: { hair: 'short', hairColor: '#f2d16b', top: '#212121', bottom: '#212121' } },
      { name: 'Santoryu', style: 'santoryu', weapon: 'sword', count: 3, look: { hair: 'buzz', hairColor: '#2ecc71', top: '#fafafa', bottom: '#2d3436' } },
      { name: 'Sniper', style: 'sniper', weapon: 'gun', look: { hair: 'curly', hairColor: '#1e1e1e', nose: 'long', top: '#6d4c41' } },
      { name: 'Weather', style: 'weather_science', weapon: 'staff', look: { hair: 'long', hairColor: '#e67e22', top: '#0984e3' } },
      { name: 'Elbaf', style: 'elbaf', weapon: 'axe', bulk: 1.3, look: { hair: 'long', hairColor: '#8d6e63', hat: 'horns', top: '#795548' } },
    ];
    defs.forEach((d, i) => { const a = C.spawn({ ...d, id: 'atk' + i }, 4.6, (i - 2.5) * 1.5, Math.PI / 2 + (i % 2 ? 0.5 : -0.5)); a.masteries = { [d.style]: 50 }; a.stamina = 999; });
    C.view(0, -0.12, 'first');
  });
  await settle(page, 3);
  const swing = async (label, fn, t) => {
    await page.evaluate(fn);
    for (const dt of t) { await step(page, dt); await frames(page, 2); }
    await snap(label);
  };
  await swing('attack-m1', () => { for (const a of window.__C3.npcs) a.tryM1(window.OP.game); }, [0.05, 0.05]);
  await step(page, 0.4);
  await swing('attack-m1b', () => { for (const a of window.__C3.npcs) { a.combo.window = 1; a.combo.step = 1; a.tryM1(window.OP.game); } }, [0.05, 0.04]);
  await step(page, 0.5);
  await swing('attack-heavy', () => { for (const a of window.__C3.npcs) { a.stamina = 999; a.tryHeavy(window.OP.game); } }, [0.05, 0.05, 0.05, 0.05]);
  await step(page, 0.3);
  await swing('attack-heavy-late', () => {}, [0.05, 0.05]);
  await step(page, 1.0);
  // blocking, hurt, knocked down, frozen, dodge
  await page.evaluate(() => {
    const [a, b, c, d, e, f] = window.__C3.npcs;
    const g = window.OP.game;
    a.setBlock(true);
    b.flashT = 0.1; b.hitstun = 0.5;
    c.knockOut(g, null);
    d.addStatus('freeze', 5);
    e.tryDodge(g, 0, 1);
    f.armament = true; f.hakiSkill = { armament: 10 };
  });
  await step(page, 0.12); await frames(page, 2);
  await snap('states');
  await step(page, 0.6); await frames(page, 2);
  await snap('states-late');
}

// ------------------------------------------------------------------ viewmodel
async function viewmodel(page, snap) {
  await page.evaluate(() => {
    const C = window.__C3; C.clear();
    const g = window.OP.game, p = g.player;
    p.style = 'brawler'; p.weapon = null; p.fruit = null; p.stamina = 999;
    C.spawn({ name: 'Training Dummy', id: 'dummy1', look: { hair: 'bald', top: '#8d6e63' } }, 2.2, 0.2);
    C.view(0, -0.05, 'first');
  });
  await settle(page, 3);
  await snap('vm-idle');
  const act = async (label, fn, t) => {
    await page.evaluate(fn);
    for (const dt of t) { await step(page, dt); await frames(page, 2); }
    await snap(label);
    await step(page, 0.8);
  };
  await act('vm-jab', () => { const g = window.OP.game; g.player.tryM1(g); }, [0.05, 0.03]);
  await act('vm-cross', () => { const g = window.OP.game, p = g.player; p.combo.window = 1; p.combo.step = 1; p.tryM1(g); }, [0.05, 0.03]);
  await act('vm-heavy', () => { const g = window.OP.game; g.player.tryHeavy(g); }, [0.05, 0.05, 0.05, 0.05]);
  await page.evaluate(() => { window.OP.key('F', true); });
  await step(page, 0.15); await frames(page, 2);
  await snap('vm-block');
  await page.evaluate(() => { window.OP.key('F', false); });
  await step(page, 0.4);
  // black leg kick
  await page.evaluate(() => { const p = window.OP.game.player; p.style = 'black_leg'; p.masteries = { black_leg: 30 }; });
  await act('vm-kick', () => { const g = window.OP.game, p = g.player; p.combo.window = 0; p.tryM1(g); }, [0.05, 0.04]);
  // three swords
  await page.evaluate(() => { const p = window.OP.game.player; p.style = 'santoryu'; p.weapon = { kind: 'sword', count: 3, power: 1.2, ids: [] }; p.masteries = { santoryu: 30 }; });
  await step(page, 0.3); await frames(page, 2);
  await snap('vm-swords-idle');
  await act('vm-slash', () => { const g = window.OP.game, p = g.player; p.combo.window = 0; p.tryM1(g); }, [0.05, 0.05]);
  await act('vm-slash2', () => { const g = window.OP.game, p = g.player; p.combo.window = 1; p.combo.step = 1; p.tryM1(g); }, [0.04, 0.04]);
  // armament haki
  await page.evaluate(() => { const p = window.OP.game.player; p.style = 'brawler'; p.weapon = null; p.hakiSkill = { armament: 10 }; p.armament = true; p.haki = 999; });
  await act('vm-haki-punch', () => { const g = window.OP.game, p = g.player; p.combo.window = 0; p.tryM1(g); }, [0.05, 0.03]);
  await page.evaluate(() => { const p = window.OP.game.player; p.armament = false; });
  // a gun
  await page.evaluate(() => { const p = window.OP.game.player; p.style = 'sniper'; p.weapon = { kind: 'gun', count: 1, power: 1.2, ids: ['flintlock'] }; p.masteries = { sniper: 30 }; });
  await act('vm-gun', () => { const g = window.OP.game, p = g.player; p.combo.window = 0; p.tryM1(g); }, [0.05, 0.05, 0.03]);
  // Devil Fruits
  await page.evaluate(() => { const p = window.OP.game.player; p.style = 'brawler'; p.weapon = null; p.fruit = 'gomu'; p.fruitMastery = 100; });
  await act('vm-gomu-pistol', () => { const g = window.OP.game, p = g.player; p.tryTechnique('gomu_pistol', g, window.__C3.npcs[0]); }, [0.1, 0.05, 0.05]);
  await page.evaluate(() => { const p = window.OP.game.player; p.fruit = 'mera'; });
  await act('vm-mera', () => { const g = window.OP.game, p = g.player; p.tryTechnique('mera_fire_fist', g, window.__C3.npcs[0]) || p.tryTechnique(g.player.fruitDef.techniques[0].id, g, window.__C3.npcs[0]); }, [0.1, 0.1, 0.05]);
  await page.evaluate(() => { const p = window.OP.game.player; p.fruit = 'hie'; });
  await act('vm-hie', () => { const g = window.OP.game, p = g.player; const t = p.fruitDef.techniques.find((x) => x.anim === 'cast') || p.fruitDef.techniques[0]; p.tryTechnique(t.id, g, window.__C3.npcs[0]); }, [0.12, 0.1]);
}

// ------------------------------------------------------------------ sea king + crowd
async function seaKing(page, snap) {
  const ok = await page.evaluate(() => {
    const g = window.OP.game, p = g.player, w = g.world;
    window.__C3.clear();
    // find open sea a little way off the coast and stand on the shore facing it
    for (let r = 8; r < 60; r += 2) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = w.wx(p.x + Math.cos(a) * r), y = p.y + Math.sin(a) * r;
        if (w.isLiquid(x, y) && w.isLiquid(x + 3, y) && w.isLiquid(x - 3, y) && w.isLiquid(x, y + 3) && w.isLiquid(x, y - 3)) {
          const s = g.sea;
          const before = g.actors.length;
          for (let n = 0; n < 40 && g.actors.length === before; n++) s.spawnSeaKing({ x: x + (Math.random() - 0.5), y }, 0);
          const k2 = g.actors.find((q) => q.look && q.look.race === 'seaking');
          if (!k2) continue;
          k2.x = x; k2.y = y; k2.controller = null; k2.facing = Math.atan2(p.y - y, w.dx(x, p.x));
          k2.damageShown = 3;
          g.view3d.rig.yaw = (Math.atan2(y - p.y, w.dx(p.x, x)) + Math.PI * 2) % (Math.PI * 2);
          g.view3d.rig.pitch = 0.08;
          window.__C3.king = k2;
          return true;
        }
      }
    }
    return false;
  });
  if (!ok) { console.log('no sea found for the Sea King'); return; }
  await settle(page, 6);
  await snap('seaking');
  await page.evaluate(() => { const k = window.__C3.king; k.action = { def: { anim: 'heavy', steps: [], windup: 0.9, recover: 0.6 }, t: 0, step: 0, total: 1.6, mult: 1, angle: k.facing }; });
  await step(page, 0.6); await frames(page, 2);
  await snap('seaking-rear');
  await step(page, 0.4); await frames(page, 2);
  await snap('seaking-bite');
}

async function crowd(page, snap) {
  const n = await page.evaluate(() => {
    const C = window.__C3; C.clear();
    C.goSunny();
    const races = ['human', 'human', 'fishman', 'mink', 'human', 'skypiean', 'longarm', 'human', 'buccaneer', 'human'];
    let k = 0;
    for (let i = 0; i < 30; i++) {
      const row = Math.floor(i / 6), col = i % 6;
      const a = C.spawn({ name: 'Townsfolk ' + i, race: races[i % races.length], id: 'crowd' + i, showName: i % 4 === 0, style: ['brawler', 'black_leg', 'ittoryu'][i % 3], weapon: i % 3 === 2 ? 'sword' : undefined }, 4 + row * 2.2, (col - 2.5) * 1.6);
      a.intent.mx = 0; k++;
      if (i % 5 === 0) a.questMarker = i % 2 ? '?' : '!';
      if (i % 7 === 0) a.damageShown = 3;
    }
    C.view(0, -0.1, 'first');
    return k;
  });
  await settle(page, 6);
  const perf = await page.evaluate(() => window.__C3.perf());
  console.log('perf-crowd', JSON.stringify({ spawned: n, ...perf }));
  await snap('crowd');
  // everyone moves
  await page.evaluate(() => { for (const a of window.__C3.npcs) { a.intent.mx = Math.cos(a.seed) * 0.6; a.intent.my = Math.sin(a.seed) * 0.6; a.facing = Math.atan2(a.intent.my, a.intent.mx); } });
  await step(page, 0.5); await frames(page, 3);
  const perf2 = await page.evaluate(() => {
    const v = window.OP.game.view3d;
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) v.render(window.OP.game);
    return { msPerFrame: (performance.now() - t0) / 10, ...window.__C3.perf() };
  });
  console.log('perf-crowd-moving', JSON.stringify(perf2));
  await snap('crowd-moving');
}

async function vmDebug(page, snap) {
  await page.evaluate(() => { const C = window.__C3; C.clear(); C.spawn({ name: 'Dummy', id: 'dummy1', look: { hair: 'bald' } }, 2.2, 0.2); C.view(0, -0.05, 'first'); });
  await settle(page, 3);
  const dump = () => page.evaluate(() => {
    const v = window.OP.game.view3d, vm = v.vm, m = vm && vm.model;
    if (!m) return 'no vm';
    const cam = v.rig.camera;
    const inv = cam.matrixWorldInverse.elements;
    const tx = (e) => { const x = e[12], y = e[13], z = e[14]; return [inv[0] * x + inv[4] * y + inv[8] * z + inv[12], inv[1] * x + inv[5] * y + inv[9] * z + inv[13], inv[2] * x + inv[6] * y + inv[10] * z + inv[14]].map((q) => +q.toFixed(3)); };
    const out = { visible: vm.root.visible, parent: vm.root.parent && vm.root.parent.type, bodyPos: vm.body.position.toArray().map((q) => +q.toFixed(3)) };
    for (const n of ['uarmR', 'farmR', 'handR', 'handL', 'chest']) { const b = m.bones.find((q) => q.name === n); out[n] = tx(b.matrixWorld.elements); }
    out.meshVisible = m.mesh.visible; out.render = { calls: v.renderer.info.render.calls };
    return out;
  });
  console.log('vm-idle', JSON.stringify(await dump()));
  await snap('dbg-idle');
  await page.evaluate(() => { window.OP.key('F', true); });
  await step(page, 0.15); await frames(page, 2);
  console.log('vm-block', JSON.stringify(await dump()));
  await snap('dbg-block');
  await page.evaluate(() => { window.OP.key('F', false); });
  await step(page, 0.3);
  await page.evaluate(() => { const g = window.OP.game; g.player.tryM1(g); });
  await step(page, 0.1); await frames(page, 2);
  console.log('vm-jab', JSON.stringify(await dump()));
  await snap('dbg-jab');
}

export const scenarios = {
  c3dbg: { async run(page, snap) { await boot(page); await vmDebug(page, snap); } },
  chars3d: {
    async run(page, snap) {
      await boot(page);
      await raceLineup(page, snap);
      await hairLineup(page, snap);
      await hatLineup(page, snap);
      await closeups(page, snap);
      await attacks(page, snap);
      await viewmodel(page, snap);
      await crowd(page, snap);
      await seaKing(page, snap);
    },
  },
  c3q: {
    async run(page, snap) {
      await boot(page);
      await raceLineup(page, snap);
      await closeups(page, snap);
    },
  },
  c3hair: { async run(page, snap) { await boot(page); await hairLineup(page, snap); await hatLineup(page, snap); } },
  // a first-person punch frame by frame (a 60 fps filmstrip): --moves=jab,cross,hook,heavy --n=8
  c3punch: {
    async run(page, snap, args) {
      await boot(page);
      await page.evaluate(() => {
        const C = window.__C3; C.clear();
        const g = window.OP.game, p = g.player;
        p.style = 'brawler'; p.weapon = null; p.fruit = null; p.stamina = 999;
        C.spawn({ name: 'Training Dummy', id: 'dummy1', showName: false, look: { hair: 'bald', top: '#8d6e63' } }, 2.2, 0.2);
        C.view(0, -0.05, 'first');
      });
      await settle(page, 3);
      const moves = String(args.moves || 'jab,cross,hook,heavy').split(','), n = Number(args.n || 8);
      for (const mv of moves) {
        await page.evaluate((mv) => {
          const g = window.OP.game, p = g.player;
          p.combo.window = mv === 'jab' ? 0 : 1; p.combo.step = { jab: 0, cross: 1, hook: 2, uppercut: 3 }[mv] ?? 0;
          if (mv === 'heavy') p.tryHeavy(g); else p.tryM1(g);
        }, mv);
        await page.evaluate(() => { window.OP.hold = true; });
        for (let i = 0; i < n; i++) {
          await page.evaluate(() => { const g = window.OP.game; g.update(1 / 60); g.render(); });
          await snap(`${mv}-${String(i).padStart(2, '0')}`);
        }
        await page.evaluate(() => { window.OP.hold = false; });
        await step(page, 1.2);
      }
    },
  },
  // close-ups of hairstyles, four at a time, from the front, three-quarter and back:
  //   --styles=short,long,...  --fem=1 (women's heads)  --hat=straw
  c3hairclose: {
    async run(page, snap, args) {
      await boot(page);
      const styles = String(args.styles || HAIRS.join(',')).split(',');
      for (let g0 = 0; g0 < styles.length; g0 += 4) {
        const group = styles.slice(g0, g0 + 4);
        await page.evaluate(([group, cols, fem, hat]) => {
          const C = window.__C3; C.clear();
          group.forEach((h, i) => C.spawn({ name: h, id: 'hc' + h + i, showName: false, look: { hair: h, hairColor: cols[i % cols.length], hat: hat || null, fem, skin: '#f1c9a0', top: ['#d63031', '#0984e3', '#00b894', '#fdcb6e'][i % 4] } }, 1.45, (i - (group.length - 1) / 2) * 0.62, Math.PI));
          C.view(0, -0.02);
        }, [group, COLS, !!args.fem, args.hat || null]);
        await settle(page, 6);
        await snap(`${group.join('-')}-front`);
        await page.evaluate(() => { for (const a of window.__C3.npcs) a.facing = Math.PI * 0.72; });
        await settle(page, 3);
        await snap(`${group.join('-')}-side`);
        await page.evaluate(() => { for (const a of window.__C3.npcs) a.facing = 0; });
        await settle(page, 3);
        await snap(`${group.join('-')}-back`);
      }
    },
  },
  // food in the hand, in first and third person: held, then eating (mid-bite)
  //   --items=apple,meat,...  --modes=first,third  --move=5 (metres east, into the open)
  c3held: {
    async run(page, snap, args) {
      await boot(page);
      // (out into the open: a third-person camera can be pulled in by things behind it)
      await page.evaluate((m) => { const p = window.OP.game.player; window.OP.teleport(p.x + m, p.y); }, Number(args.move ?? 5));
      const items = String(args.items || 'apple,meat,rumble_ball').split(',');
      for (const id of items) {
        for (const mode of String(args.modes || 'first,third').split(',')) {
          await page.evaluate(([id, mode]) => {
            const g = window.OP.game, p = g.player;
            window.OP.hold = false;
            window.OP.debug.addItem(g, id, 3, { silent: true });
            p.held = id; p.eating = null;
            window.__C3.view(mode === 'first' ? 0 : Math.PI * 0.94, mode === 'first' ? -0.05 : 0.06, mode, 2.0);
            // (third person: facing the camera — no shift lock turning you to where it looks)
            if (mode === 'third') g.view3d.rig.setShiftLock?.(false);
          }, [id, mode]);
          await settle(page, 5);
          // (third person: turned to face the camera, a little to one side)
          const face = () => page.evaluate(() => {
            const g = window.OP.game, p = g.player, r = g.view3d.rig;
            if (r.mode !== 'third') return;
            if (p.controller) p.controller.aimT = 0;
            // (the camera round in front of the face, a little to one side, snapped there)
            const v = g.view3d.actorViews.get(p);
            const f = v && v.visF !== undefined ? v.visF : p.facing;
            r.yaw = f - 0.35; g.snapCamera?.(); g.render();
          });
          await face();
          await settle(page, 2);
          await face();
          await snap(`${id}-${mode}-held`);
          if (args.sprint && mode === 'first') {
            // sprinting with it in hand: the hand stays steady through the stride (two phases of it)
            await page.evaluate(() => { window.OP.key('W', true); window.OP.key('Shift', true); });
            for (const [i, n] of [[1, 6], [2, 3]]) {
              for (let k = 0; k < n; k++) { await step(page, 0.05); await frames(page, 1); }
              await snap(`${id}-${mode}-sprint${i}`);
            }
            await page.evaluate(() => { window.OP.key('W', false); window.OP.key('Shift', false); });
            await settle(page, 3);
          }
          for (const t of [0.3, 0.9]) {
            await page.evaluate(([id, t]) => {
              const g = window.OP.game, p = g.player;
              const r = g.view3d.rig, v = g.view3d.actorViews.get(p);
              window.OP.hold = true;
              if (r.mode === 'third') {
                // (the camera round to the front-left of the face; it moves as the game steps, and a
                // step ends a scripted bite, so the eating is set after)
                r.yaw = (v && v.visF !== undefined ? v.visF : p.facing) + Math.PI * 0.72;
                for (let i = 0; i < 3; i++) window.OP.step(0.05);
              }
              p.eating = { id, t, dur: 1.25, bites: 0 };
              g.render(); g.render();
            }, [id, t]);
            await snap(`${id}-${mode}-eat${t}`);
          }
          await page.evaluate(() => { window.OP.hold = false; window.OP.game.player.eating = null; });
        }
      }
    },
  },
  // weapons worn on the body, drawn from the hotbar and put away again: the real
  // hotbar keys, snapped part way through the draw
  //   --wpns=fine_katana,flintlock,bo_staff,wado_ichimonji+shusui+sandai_kitetsu  --modes=third,first
  //   --at=0.15,0.3,0.45,0.6  (seconds into the draw)
  c3draw: {
    async run(page, snap, args) {
      await boot(page);
      await page.evaluate((m) => { const p = window.OP.game.player; window.OP.teleport(p.x + m, p.y); }, Number(args.move ?? 5));
      await page.evaluate(() => { const u = document.getElementById('ui'); if (u && !window.__keepHud) u.style.display = 'none'; });
      const sets = String(args.wpns || 'fine_katana,flintlock,bo_staff,wado_ichimonji+shusui+sandai_kitetsu').split(',');
      const at = String(args.at || '0.15,0.3,0.45,0.6').split(',').map(Number);
      const press = (k) => page.evaluate((k) => { window.OP.key(k, true); window.OP.step(1 / 30); window.OP.key(k, false); }, k);
      for (const set of sets) {
        const ids = set.split('+');
        for (const mode of String(args.modes || 'third,first').split(',')) {
          await page.evaluate(([ids, mode]) => {
            const g = window.OP.game, p = g.player, c = g.state.char;
            window.OP.hold = false;
            c.equipped.weapons = []; p.weapon = null; p.drawn = false; p.held = null;
            ids.forEach((id, i) => { window.OP.debug.addItem(g, id, 1, { silent: true }); p.hotbar[i] = 'item:' + id; });
            window.__C3.view(0, -0.05, mode, 2.4);
            g.view3d.rig.setShiftLock?.(false);
          }, [ids, mode]);
          // put them on (each key the first time: on and drawn), then back in the sheath
          for (let i = 0; i < ids.length; i++) await press(String(i + 1));
          await settle(page, 2);
          await press('1');
          await settle(page, 3);
          const place = () => page.evaluate((mode) => {
            const g = window.OP.game, p = g.player, r = g.view3d.rig;
            window.OP.hold = true;
            if (r.mode === 'third') {
              const v = g.view3d.actorViews.get(p);
              r.yaw = (v && v.visF !== undefined ? v.visF : p.facing) + Math.PI * 0.72;
              r.pitch = 0.05;
              for (let i = 0; i < 3; i++) window.OP.step(0.05);
            } else { r.pitch = -0.2; window.OP.step(0.05); }
          }, mode);
          await place();
          await snap(`${set}-${mode}-worn`);
          // draw: snapped along the way, then held ready
          await press('1');
          let t = 1 / 30;
          for (const s of at) {
            if (s > t) await page.evaluate((d) => window.OP.step(d), s - t);
            t = Math.max(t, s);
            await snap(`${set}-${mode}-draw${s}`);
          }
          await page.evaluate(() => window.OP.step(0.6));
          await snap(`${set}-${mode}-ready`);
          // and away again
          await press('1');
          await page.evaluate(() => window.OP.step(0.25));
          await snap(`${set}-${mode}-sheathe0.25`);
          await page.evaluate(() => window.OP.step(0.6));
          await snap(`${set}-${mode}-away`);
          await page.evaluate(() => { window.OP.hold = false; });
        }
      }
    },
  },
  // the Straw Hats lined up like the World Seeker key art (for comparing the look 1:1), and face close-ups
  //   --only=crew,faces
  c3crew: {
    async run(page, snap, args) {
      await boot(page);
      const only = String(args.only || 'crew,town,faces').split(',');
      // (no HUD over the comparison)
      await page.evaluate(() => { const u = document.getElementById('ui'); if (u) u.style.display = 'none'; });
      const CREW = [
        ['Sanji', { idle: 'rest', fem: false, frame: 'slim', eyeShape: 'bold', hair: 'sidefringe', hairColor: '#f2d16b', skin: '#f6d5b8', topStyle: 'jacket', top: '#1c1c22', top2: '#f5f5f5', tie: '#1c1c22', bottomStyle: 'slim', bottom: '#1c1c22', shoeStyle: 'shoes', shoes: '#111111', muscle: 0.4 }, 3.8, -1.55],
        ['Zoro', { idle: 'cross', fem: false, frame: 'athletic', eyeShape: 'sharp', frown: true, mouth: 'flat', openShirt: true, hair: 'crop', hairColor: '#3fae4a', skin: '#e8b98f', topStyle: 'kimono', top: '#2f6b3a', waist: 'sash', waistCol: '#8e1c2a', bottomStyle: 'hakama', bottom: '#27432b', shoeStyle: 'boots', muscle: 0.9 }, 3.5, -0.8],
        ['Luffy', { idle: 'cross', fem: false, frame: 'lean', eyeShape: 'bold', hat: 'straw', hair: 'messy', hairColor: '#141414', skin: '#f3c9a0', topStyle: 'vest', top: '#d12b2b', bottomStyle: 'shorts', bottom: '#2f5fd0', waist: 'sash', waistCol: '#f2c21b', shoeStyle: 'sandals', muscle: 0.75, scarCheek: true, grin: true }, 2.9, 0],
        ['Robin', { idle: 'cross', fem: true, frame: 'slim', eyeShape: 'cool', hair: 'long', hairColor: '#171320', skin: '#dcae8a', topStyle: 'crop', top: '#3b3570', bottomStyle: 'longskirt', bottom: '#d1545a', shoeStyle: 'sandals' }, 3.5, 0.8],
        ['Nami', { idle: 'hips', fem: true, frame: 'curvy', eyeShape: 'bright', hair: 'wavy', hairColor: '#e8742a', skin: '#f6cfae', topStyle: 'bikini', top: '#3c9a52', bottomStyle: 'slim', bottom: '#2b4d8a', shoeStyle: 'sandals' }, 3.4, 1.55],
        ['Franky', { idle: 'hips', fem: false, frame: 'brawny', eyeShape: 'sharp', hair: 'pompadour', hairColor: '#35a0e8', skin: '#e2a67a', topStyle: 'open', top: '#c9362f', bottomStyle: 'shorts', bottom: '#2a5bb8', muscle: 1.2, bulk: 1.35 }, 4.4, 0.3],
        ['Usopp', { idle: 'hips', fem: false, frame: 'lanky', eyeShape: 'bold', noseShape: 'long', nose: 'long', hair: 'curly', hairColor: '#1b1b1b', skin: '#a8714c', hat: 'bandana', hatColor: '#ef6c00', topStyle: 'bare', bottomStyle: 'baggy', bottom: '#e8c75b', waist: 'belt', shoeStyle: 'boots', muscle: 0.45 }, 4.1, 2.25],
      ];
      if (only.includes('crew')) {
        await page.evaluate((crew) => {
          const C = window.__C3; C.clear();
          crew.forEach(([name, look, dx, dy], i) => C.spawn({ name, id: 'crew' + i, showName: false, look: { race: 'human', seed: 3 + i, ...look } }, dx, dy));
          C.view(0, -0.02);
        }, CREW);
        await settle(page, 8);
        await snap('crew');
      }
      if (only.includes('town')) {
        // random townsfolk, pirates and Marines as the game rolls them
        await page.evaluate(() => {
          const C = window.__C3; C.clear();
          const F = ['civilian', 'pirate', 'civilian', 'marine', 'civilian', 'pirate', 'civilian', 'bandit'];
          F.forEach((f, i) => C.spawn({ name: 'Townsfolk ' + i, id: 'townsfolk-' + f + i, faction: f, showName: false }, 3.4 + (i % 2) * 0.5, (i - 3.5) * 0.72));
          C.view(0, -0.03);
        });
        await settle(page, 8);
        await snap('town');
      }
      if (only.includes('faces')) {
        for (const i of String(args.faces || '2,4,1').split(',').map(Number)) {
          await page.evaluate(([crew, i]) => {
            const C = window.__C3; C.clear();
            const [name, look] = crew[i];
            C.spawn({ name, id: 'face' + i, showName: false, look: { race: 'human', seed: 3 + i, ...look } }, 0.8, 0);
            C.view(0, -0.04);
          }, [CREW, i]);
          await settle(page, 6);
          await snap(`face-${CREW[i][0]}`);
          // three-quarter: the face's form (nose, cheekbones, jaw) shows in the shading
          await page.evaluate(() => { const a = window.__C3.npcs[0]; a.facing = Math.PI * 0.78; });
          await settle(page, 3);
          await snap(`face34-${CREW[i][0]}`);
          // (--side: in profile too — the ear, the nose's bridge, the jaw's line)
          if (args.side) {
            await page.evaluate(() => { const a = window.__C3.npcs[0]; a.facing = Math.PI * 0.5; });
            await settle(page, 3);
            await snap(`faceside-${CREW[i][0]}`);
          }
        }
      }
    },
  },
  // ears and profiles: bald and short-haired heads side-on, three-quarter back and front
  // (their look-at switched off, so they don't turn to the camera)
  c3ears: {
    async run(page, snap) {
      await boot(page);
      await page.evaluate(() => { const u = document.getElementById('ui'); if (u) u.style.display = 'none'; window.__C3.goSunny(); });
      const LOOKS = [['bald', { hair: 'bald' }], ['crop', { hair: 'crop', hairColor: '#3fae4a' }], ['buzz', { hair: 'buzz', hairColor: '#3b2a1a' }]];
      const still = () => page.evaluate(() => { const a = window.__C3.npcs[0], v = window.OP.game.view3d.actorViews.get(a); if (v) { v.lookAt = () => 0; v.headYaw = 0; } });
      for (const [name, look] of LOOKS) {
        for (const [view, f] of [['side', Math.PI / 2], ['back34', Math.PI * 0.22], ['front34', Math.PI * 0.72]]) {
          await page.evaluate(([name, look, f]) => {
            const C = window.__C3; C.clear();
            C.spawn({ name, id: 'ear-' + name, showName: false, look: { race: 'human', fem: false, frame: 'average', seed: 5, skin: '#f1c9a0', topStyle: 'tee', top: '#3b6ea5', ...look } }, 1.05, 0, f);
            C.view(0, 0.05);
          }, [name, look, f]);
          await still();
          await settle(page, 4);
          await still();
          await settle(page, 2);
          await snap(`${name}-${view}`);
        }
      }
    },
  },
  // bodies close up: frames and muscles, front, side and back, men and women; --only=men,women  --idle=rest|cross|hips
  c3body: {
    async run(page, snap, args) {
      await boot(page);
      await page.evaluate(() => { const u = document.getElementById('ui'); if (u) u.style.display = 'none'; });
      const idle = String(args.idle || 'rest');
      const SETS = {
        men: [
          ['lean', { fem: false, frame: 'lean', muscle: 0.75, hair: 'messy', hairColor: '#141414', skin: '#f3c9a0', topStyle: 'bare', bottomStyle: 'shorts', bottom: '#2f5fd0', waist: 'sash', waistCol: '#f2c21b', shoeStyle: 'sandals' }],
          ['athletic', { fem: false, frame: 'athletic', muscle: 1.0, hair: 'crop', hairColor: '#3fae4a', skin: '#e8b98f', topStyle: 'bare', bottomStyle: 'trousers', bottom: '#27432b', waist: 'haramaki', waistCol: '#8e1c2a', shoeStyle: 'boots' }],
          ['brawny', { fem: false, frame: 'brawny', muscle: 1.2, hair: 'pompadour', hairColor: '#35a0e8', skin: '#e2a67a', topStyle: 'bare', bottomStyle: 'shorts', bottom: '#2a5bb8', shoeStyle: 'sandals' }],
          ['heavy', { fem: false, frame: 'heavy', muscle: 0.3, hair: 'short', hairColor: '#6b4423', skin: '#f1c9a0', topStyle: 'bare', bottomStyle: 'trousers', bottom: '#5d4037', waist: 'belt', shoeStyle: 'boots' }],
          ['slim', { fem: false, frame: 'slim', muscle: 0.45, hair: 'sidefringe', hairColor: '#f2d16b', skin: '#f6d5b8', topStyle: 'bare', bottomStyle: 'slim', bottom: '#1c1c22', shoeStyle: 'shoes' }],
        ],
        women: [
          ['slim', { fem: true, frame: 'slim', hair: 'long', hairColor: '#171320', skin: '#dcae8a', topStyle: 'bikini', top: '#3b3570', bottomStyle: 'shorts', bottom: '#d1545a', shoeStyle: 'sandals' }],
          ['curvy', { fem: true, frame: 'curvy', hair: 'wavy', hairColor: '#e8742a', skin: '#f6cfae', topStyle: 'bikini', top: '#3c9a52', bottomStyle: 'slim', bottom: '#2b4d8a', shoeStyle: 'sandals' }],
          ['athletic', { fem: true, frame: 'athletic', muscle: 0.6, hair: 'ponytail', hairColor: '#c0392b', skin: '#e0ac7e', topStyle: 'crop', top: '#212121', bottomStyle: 'trousers', bottom: '#455a64', shoeStyle: 'boots' }],
          ['petite', { fem: true, frame: 'petite', hair: 'bob', hairColor: '#e84393', skin: '#fbe3cf', topStyle: 'tank', top: '#fdcb6e', bottomStyle: 'skirt', bottom: '#6c5ce7', shoeStyle: 'shoes' }],
          ['heavy', { fem: true, frame: 'heavy', hair: 'bun', hairColor: '#8e8e8e', skin: '#c68642', topStyle: 'dress', top: '#8e44ad', shoeStyle: 'sandals' }],
        ],
      };
      for (const set of String(args.only || 'men,women').split(',')) {
        const list = SETS[set];
        await page.evaluate(([list, idle]) => {
          const C = window.__C3; C.clear();
          list.forEach(([name, look], i) => C.spawn({ name, id: 'body-' + name + i, showName: false, look: { race: 'human', seed: 11 + i, idle, ...look } }, 2.9, (i - (list.length - 1) / 2) * 0.95));
          C.view(0, -0.07);
        }, [list, idle]);
        await settle(page, 8);
        await snap(`${set}-front`);
        await page.evaluate(() => { for (const a of window.__C3.npcs) a.facing = Math.PI / 2; });
        await settle(page, 3);
        await snap(`${set}-side`);
        await page.evaluate(() => { for (const a of window.__C3.npcs) a.facing = 0; });
        await settle(page, 3);
        await snap(`${set}-back`);
      }
    },
  },
  // hair and clothes in motion: someone walks, runs and stops across the view (from the side)
  //   --looks=dress,coat,longarm,skirt
  c3motion: {
    async run(page, snap, args) {
      await boot(page);
      await page.evaluate(() => { const u = document.getElementById('ui'); if (u) u.style.display = 'none'; });
      const LOOKS = {
        dress: { fem: true, frame: 'curvy', hair: 'long', hairColor: '#e8742a', skin: '#f6cfae', topStyle: 'dress', top: '#d1545a', shoeStyle: 'sandals' },
        coat: { fem: false, frame: 'athletic', hair: 'ponytail', hairColor: '#1b1b1b', skin: '#e8b98f', topStyle: 'shirt', top: '#f5f5f5', coat: '#2c3e70', bottomStyle: 'trousers', bottom: '#2d3436', shoeStyle: 'boots' },
        longarm: { race: 'longarm', arms: 1.8, fem: true, hair: 'wavy', hairColor: '#6c5ce7', skin: '#f1c9a0', topStyle: 'dress', top: '#16a085', shoeStyle: 'sandals' },
        skirt: { fem: true, frame: 'slim', hair: 'twintails', hairColor: '#e84393', skin: '#fbe3cf', topStyle: 'tank', top: '#fdcb6e', bottomStyle: 'skirt', bottom: '#6c5ce7', shoeStyle: 'shoes' },
        longskirt: { fem: true, frame: 'slim', idle: 'cross', hair: 'long', hairColor: '#171320', skin: '#dcae8a', topStyle: 'crop', top: '#3b3570', bottomStyle: 'longskirt', bottom: '#d1545a', shoeStyle: 'sandals' },
      };
      const walk = async (mx, my, sprint, n) => {
        await page.evaluate(([mx, my, sprint]) => { const a = window.__C3.npcs[0]; a.intent.mx = mx; a.intent.my = my; a.intent.sprint = sprint; }, [mx, my, sprint]);
        for (let i = 0; i < n; i++) { await step(page, 0.05); await frames(page, 1); }
        // (the camera follows the mover: the game runs on between the steps too)
        await page.evaluate(() => { const a = window.__C3.npcs[0], p = window.OP.game.player; window.__C3.view(Math.atan2(a.y - p.y, a.x - p.x), -0.06); });
        await frames(page, 1);
      };
      for (const name of String(args.looks || 'dress,coat,longarm').split(',')) {
        await page.evaluate((look) => {
          // (the game runs only as the scenario steps it: a slow screenshot doesn't let the runner run off)
          window.OP.hold = true;
          const C = window.__C3; C.clear();
          C.spawn({ name: 'Mover', id: 'mover', showName: false, look: { race: 'human', seed: 21, idle: 'rest', ...look } }, 3.4, -1.2, Math.PI / 2);
          C.view(0, -0.06);
        }, LOOKS[name]);
        await settle(page, 4);
        await snap(`${name}-stand`);
        await walk(0, 0.45, false, 8);
        await snap(`${name}-walk`);
        await walk(0, 1, true, 5);
        await snap(`${name}-run`);
        await walk(0, 0, false, 3);
        await snap(`${name}-stop`);
        // (--sit: sat down, as on a bench — the knees well forward under a skirt)
        if (args.sit) {
          await page.evaluate(() => { const a = window.__C3.npcs[0]; a.act3d = { pose: 'sit', prop: null, h: 0.45 }; });
          await settle(page, 5);
          await snap(`${name}-sit`);
        }
      }
    },
  },
  // your own body in first person: looking down standing, walking, in a guard; and third person as usual
  //   --arms=1.8 (a long-armed body) --hair=long --hat=hood --top=coat --coat=#553322
  fpbody: {
    async run(page, snap, args) {
      await boot(page);
      await page.evaluate((args) => {
        const p = window.OP.game.player;
        const over = {};
        if (args.arms) over.arms = Number(args.arms);
        if (args.hair) over.hair = args.hair;
        if (args.hat) over.hat = args.hat;
        if (args.top) over.topStyle = args.top;
        if (args.coat) over.coat = args.coat;
        if (Object.keys(over).length) p.look = { ...p.look, ...over };
        window.OP.teleport(p.x + 5, p.y); window.__C3.view(0, -1.15, 'first');
      }, args);
      await settle(page, 6);
      await snap('down-standing');
      await page.evaluate(() => window.__C3.view(0, -0.55, 'first'));
      await settle(page, 3);
      await snap('down-half');
      await page.evaluate(() => { window.__C3.view(0, -1.0, 'first'); window.OP.key('W', true); });
      for (let i = 0; i < 6; i++) { await step(page, 0.06); await frames(page, 1); }
      await snap('down-walking');
      await page.evaluate(() => window.OP.key('W', false));
      await page.evaluate(() => { const g = window.OP.game; g.player.combatT = 5; window.__C3.view(0, -0.9, 'first'); g.player.setBlock(true); });
      await settle(page, 4);
      await snap('down-block');
      await page.evaluate(() => window.OP.game.player.setBlock(false));
      // as far down as you can look, standing — then sprinting (the eyes ride
      // the head as you lean into it), then a heavy blow's lunge (right click)
      // (the game runs only as it's stepped here: a slow screenshot doesn't carry you off)
      await page.evaluate(() => { window.OP.hold = true; window.__C3.view(0, -1.35, 'first'); });
      await settle(page, 4);
      await snap('down-straight');
      await page.evaluate(() => { window.__C3.view(0, -1.1, 'first'); window.OP.key('W', true); window.OP.key('Shift', true); });
      for (const [i, n] of [[1, 12], [2, 3]]) {
        for (let k = 0; k < n; k++) { await step(page, 0.05); await frames(page, 1); }
        await snap(`down-sprint${i}`);
      }
      await page.evaluate(() => { window.OP.key('W', false); window.OP.key('Shift', false); });
      await settle(page, 6);
      await page.evaluate(() => { const g = window.OP.game; window.__C3.view(0, -0.7, 'first'); g.player.tryHeavy(g); });
      for (const [i, n] of [[1, 3], [2, 4]]) {
        for (let k = 0; k < n; k++) { await step(page, 0.05); await frames(page, 1); }
        await snap(`heavy${i}`);
      }
      await page.evaluate(() => { window.OP.hold = false; });
      await settle(page, 6);
      await page.evaluate(() => { const g = window.OP.game; g.player.setBlock(false); window.__C3.view(Math.PI * 0.9, 0.05, 'third', 2.6); g.view3d.rig.setShiftLock?.(false); if (g.player.controller) g.player.controller.aimT = 0; g.player.facing = -0.3; });
      await settle(page, 5);
      await snap('third');
    },
  },
  // first person at a ship's helm and a rowboat's oars: the view from your
  // eyes over the wheel (your hands on it when you look down), looking back
  // past your shoulder, and at the oars looking down into your lap
  fphelm: {
    async run(page, snap) {
      await boot(page);
      await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player, OP = window.OP;
        const isl = w.islands.find((i) => i.id === 'dawn_island');
        let spot = null;
        for (let k = 0; k < 40000 && !spot; k++) {
          const a = k * 2.399, r = isl.radius * (1 + (k % 97) / 60) + 20 + (k % 61);
          const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
          if (w.sd(x, y) < -30) spot = { x, y };
        }
        g.env.windStrength = 0.3; g.env.storm = 0; g.env.clock = 12;
        const s = g.giveShip('caravel', spot.x, spot.y, 'Probe Ship', { heading: 0 });
        const hs = OP.debug.deckSpot(s, 'helm');
        p.x = hs.x; p.y = hs.y; OP.step(0.3);
        p.controller.interaction?.run(); OP.step(0.2);
        window.__fph = { spot, s };
        OP.hold = true;
        window.__C3.view(s.heading, -0.25, 'first');
      });
      await settle(page, 5);
      await snap('helm-ahead');
      await page.evaluate(() => { window.__C3.view(window.__fph.s.heading, -1.1, 'first'); });
      await settle(page, 5);
      await snap('helm-down');
      await page.evaluate(() => { window.__C3.view(window.__fph.s.heading + Math.PI, -1.2, 'first'); });
      await settle(page, 5);
      await snap('helm-back');
      await page.evaluate(() => {
        const g = window.OP.game, p = g.player, OP = window.OP, { spot } = window.__fph;
        OP.hold = false;
        // (off the helm onto her deck, as E does, then over to a rowboat)
        p.controller.interaction?.run(); OP.step(0.1);
        if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
        p.mode = 'foot';
        const b = g.giveShip('dinghy', spot.x + 70, spot.y + 70, 'Probe Boat', { heading: 0 });
        const hs = OP.debug.deckSpot(b, 'helm');
        p.x = hs.x; p.y = hs.y; OP.step(0.3);
        p.controller.interaction?.run(); OP.step(0.2);
        OP.key('W', true); OP.step(0.5); OP.key('W', false); OP.step(1.5);
        OP.hold = true;
        window.__C3.view(b.heading, -1.2, 'first');
      });
      await settle(page, 5);
      await snap('oars-down');
      await page.evaluate(() => { window.OP.hold = false; });
    },
  },
  // every top style on a man and a woman, four at a time, front and
  // three-quarter (--fem=0|1 for one of them, --tops=a,b for some)
  c3tops: {
    async run(page, snap, args) {
      await boot(page);
      await page.evaluate(() => { const u = document.getElementById('ui'); if (u) u.style.display = 'none'; window.__C3.goSunny(); });
      const TOPS = args.tops ? String(args.tops).split(',') : ['tee', 'shirt', 'tank', 'vest', 'open', 'jacket', 'kimono', 'kimono-open', 'striped', 'bare', 'crop', 'bikini', 'dress', 'coat'];
      const sexes = args.fem !== undefined ? [Number(args.fem)] : [0, 1];
      for (const fem of sexes) {
        const tops = TOPS.filter((t) => fem || (t !== 'bikini' && t !== 'crop' && t !== 'dress'));
        for (let i = 0; i < tops.length; i += 4) {
          const set = tops.slice(i, i + 4);
          for (const [view, f] of [['front', Math.PI], ['34', Math.PI * 0.78]]) {
            await page.evaluate(([set, fem, f]) => {
              const C = window.__C3; C.clear();
              set.forEach((t, k) => {
                const open = t === 'kimono-open';
                C.spawn({ name: t, id: 'top-' + t + fem, showName: false, look: { race: 'human', fem: !!fem, frame: fem ? 'average' : 'athletic', seed: 7 + k, idle: 'rest', hair: fem ? 'long' : 'crop', hairColor: '#3b2a1a', skin: '#e8b98f', topStyle: open ? 'kimono' : t, openShirt: open, top: ['#2f6b3a', '#b23a3a', '#3b5ba5', '#c28a2e'][k], bottomStyle: 'slim', bottom: '#2b2b33', muscle: fem ? 0.2 : 0.8 } }, 2.3, (k - 1.5) * 0.62, f);
              });
              C.view(0, -0.02);
              for (const a of C.npcs) { const v = window.OP.game.view3d.actorViews.get(a); if (v) { v.lookAt = () => 0; v.headYaw = 0; } }
            }, [set, fem, f]);
            await settle(page, 5);
            await snap(`${fem ? 'f' : 'm'}-${set.join('+')}-${view}`);
          }
        }
      }
    },
  },
  c3atk: { async run(page, snap) { await boot(page); await attacks(page, snap); } },
  c3vm: { async run(page, snap) { await boot(page); await viewmodel(page, snap); } },
  c3crowd: { async run(page, snap) { await boot(page); await crowd(page, snap); await seaKing(page, snap); } },
};
