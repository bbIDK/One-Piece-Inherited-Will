// Procedural audio: every sound effect is synthesised with WebAudio, and the
// music is composed on the fly — calm pieces with quiet between them, a
// fight's music that builds with the fight (no recorded assets).
//
//   engine.js    the mixer: buses, rooms, the voice limit, the underwater muffle
//   synth.js     a voice's building blocks (noise, tones, rings, creaks, bubbles…)
//   motifs.js    the sounds things are made of (a flame, ice forming, a rubber snap)
//   sfx.js       every effect by name, and each technique's own start
//   steps.js     footsteps by what's underfoot
//   music.js     the composer, the instruments, a deck with its stems
//   themes.js    each place's music (and its fight's, and its night's)
//   director.js  decides what music plays, and when it changes
//   ambience.js  the beds and the random spots of the world's ambience
//   foley.js     watches the game and plays what's due (oars, strokes, sails…)
//
// docs/AUDIO.md describes the palette and the rules of the mix.
import { Engine } from './engine.js';
import { SFX, techStart, FLAVOUR } from './sfx.js';
import { footstep } from './steps.js';
import { Music } from './music.js';
import { Director } from './director.js';
import { Ambience } from './ambience.js';
import { Foley } from './foley.js';
import { hasRyou } from '../game/haki.js';

// blows that land on someone (the target is `at`; what hit them is worked out from it)
const HITS = { punch: 1, punch_heavy: 1, slash_hit: 1, slash_heavy: 1, fire: 1, magma: 1, ice: 1, snow: 1, lightning: 1, water: 1, swamp: 1, poison: 1, gas: 1, smoke: 1, sand: 1, light: 1, dark: 1, quake: 1, string: 1, explosion: 1, haki: 1 };
// Haki's own sounds, played in the voice of whoever's Haki it is (game/haki.js)
const HAKI_VOICED = new Set(['haki', 'haki_obs', 'haki_off', 'haki_out', 'foresight', 'conqueror', 'conqueror_rise', 'conqueror_clash']);
// footsteps' level among the rest (a step should sit some 15–20 dB under a punch, not 30)
const STEP = 3.8;
// the moves done with the legs
const KICKS = /kick|bl_snap|bl_round|knee|mouton|jete|arabesque|pirouette|rankyaku|concasse/;

/** What a technique is swung with (as game/abilities.js weaponKindOf reckons it). */
function weaponOf(actor, def) {
  if (def.weapon) return def.weapon;
  const src = def.source || '';
  if (!src.startsWith('style')) return 'fists';
  const st = def.style || src.slice(6) || actor.style || '';
  if (/ittoryu|nitoryu|santoryu/.test(st)) return actor.hasWeapon?.('sword') ? 'sword' : 'fists';
  if (st === 'sniper') return 'gun';
  if (st === 'weather_science') return 'staff';
  if (st === 'elbaf') return 'axe';
  if (st === 'black_leg' || st === 'okama_kenpo') return 'legs';
  return 'fists';
}

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.E = null;
    this.last = {};
    this.lastDrawn = false;
    this.foot = 1;
    const unlock = () => { this.init(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.listenUi();
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    this.build();
    this.scheduler = setInterval(() => this.schedule(), 60);
    // Keep the sound going: the browser can suspend (or "interrupt") the
    // context on its own — another tab or app taking the audio device, the
    // output changing, the page hidden and shown again — and nothing here
    // would wake it but the next effect played, so the music and the beds
    // fell silent till then. Wake it as soon as it stops, when the page comes
    // back, and on any key or click.
    const wake = () => { if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed' && !document.hidden) this.ctx.resume?.().catch?.(() => {}); };
    this.ctx.onstatechange = () => { if (this.ctx.state !== 'running') setTimeout(wake, 250); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
    this.wake = wake;
  }

  /** Make the mixer and everything that plays through it (once the context exists). */
  build() {
    const low = !!window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches;
    this.E = new Engine(this.ctx, { low });
    this.mu = new Music(this.E);
    this.director = new Director(this);
    this.amb = new Ambience(this);
    this.foley = new Foley(this);
    if (this.game) this.foley.attach(this.game);
    this.E.setVolumes(this.settings.volume, this.settings.music, 0);
    this.clock = this.E.now();
  }

  apply(s) {
    this.settings = s;
    if (!this.E) return;
    this.E.setVolumes(s.volume, s.music);
  }

  /** The game whose state the music and the foley follow. */
  attach(game) {
    this.game = game;
    if (this.foley) this.foley.attach(game);
  }

  ready() { return !!this.ctx && this.ctx.state === 'running'; }

  /** Which way the listener faces (the camera, or the player): for left and right. */
  yaw() {
    const v = this.game?.view3d;
    if (v?.active !== false && v?.rig && typeof v.rig.yaw === 'number') return v.rig.yaw;
    return this.game?.player?.facing || 0;
  }

  /** What's playing (the director's theme), for the debug overlay and old callers. */
  get theme() { return this.director?.theme || null; }

  /**
   * The music is the director's to choose now; a call site can still drop a
   * hint ('battle': a boarding, say — the fight's music comes up at once).
   */
  music(theme) { if (theme === 'battle') this.hint('battle', 10); }
  hint(kind, sec) { this.director?.hint(kind, sec); }

  schedule() {
    if (!this.ready()) {
      // (stopped: try to wake it, now and then)
      const t = performance.now();
      if (this.ctx && t - (this.wokeAt || 0) > 1000) { this.wokeAt = t; this.wake?.(); }
      // (and when it runs again, the clock carries on from now: no catching up)
      this.clock = null;
      return;
    }
    const now = this.E.now(), dt = Math.min(0.5, Math.max(0, now - (this.clock ?? now)));
    this.clock = now;
    // (is the audio thread keeping up? its clock falls behind the wall clock
    // when it can't render in time — the crackle, then the silence. While it
    // lags, the mix sheds load: engine.js strain)
    const wall = performance.now() / 1000;
    if (this.wall0 == null || wall - this.wall0 > 3) { this.wall0 = wall; this.aud0 = now; }
    else if (wall - this.wall0 >= 1) {
      const rate = (now - this.aud0) / (wall - this.wall0);
      if (rate < 0.94 && !document.hidden) this.E.strainUntil = now + 6;
      this.wall0 = wall; this.aud0 = now;
    }
    // (and keep the mix itself alive: engine.js heal)
    this.healT = (this.healT || 0) + dt;
    if (this.healT >= 0.25) { try { if (this.E.heal(this.healT)) console.warn('audio: the mix stalled and was rebuilt'); } catch { /* never mind */ } this.healT = 0; }
    try {
      this.director.update(this.game);
      this.foley.menus();
      this.ambT = (this.ambT || 0) + dt;
      if (this.ambT >= 0.24) { this.foley.ambience(this.ambT, this.director.w || { title: true }); this.ambT = 0; }
    } catch (e) {
      // (the audio must never take the game down with it)
      if (!this.warned) { this.warned = true; console.warn('audio', e); }
    }
  }

  // ---------------------------------------------------------------- effects
  /**
   * Where a sound is, as heard: { vol, pan, lp (air absorption), far 0..1 },
   * or null out of earshot. `at`: an actor, a ship or a point { x, y }.
   */
  place(at, range = 70) {
    if (!at || !this.ear) return { vol: 1, pan: 0, lp: 0, far: 0 };
    const e = this.ear();
    if (!e || at === e) return { vol: 1, pan: 0, lp: 0, far: 0 };
    const dx = this.dxOf ? this.dxOf(e.x, at.x) : at.x - e.x, dy = at.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d > range) return null;
    const rel = Math.atan2(dy, dx) - this.yaw();
    return {
      vol: 1 / (1 + Math.max(0, d - 4) / 10),
      // (near sounds sit nearly in the middle: a blow a metre to your right isn't all in one ear)
      pan: Math.sin(rel) * 0.8 * Math.min(1, d / 6),
      lp: d > 12 ? Math.max(1500, 16000 * Math.exp(-(d - 12) / 30)) : 0,
      far: Math.min(1, d / 50),
    };
  }

  /**
   * Play an effect. `at`: where it happens ({ x, y }, an actor, a ship); a hit
   * across the harbour is quieter (and duller, and further to one side) than
   * one in your face, and one out of earshot silent. `k`: extra say about it.
   */
  sfx(name, at = null, k0 = null) {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') { this.ctx.resume?.(); return; }
    try { this.play(name, at, k0); } catch (e) { if (!this.warned) { this.warned = true; console.warn('sfx', name, e); } }
  }

  play(name, at, k0) {
    const g = this.game, p = g?.player;
    const k = { ...(k0 || {}) };
    let key = name;
    // a technique begun: its own sound (see sfx.js techStart), timed to its first blow
    if (name === 'whoosh' && at?.action?.def && at.action.t === 0) return this.tech(at);
    let def = SFX[name];
    if (HITS[name] && at && g) this.hitContext(at, k, name);
    if (name === 'haki' && k.hit) { key = 'haki_hit'; def = { ...def, kind: 'hit' }; }
    if (HAKI_VOICED.has(name) && k.voice === undefined) k.voice = at?.hakiSig?.voice ?? 0.5;
    if (name === 'block' && at) { k.sword = !!(at.hasWeapon?.('sword') && at.drawn !== false); k.armament = !!at.armament; }
    if (name === 'parry' && at) k.perfect = !!at.parryPerfect;
    if ((name === 'jump' || name === 'jump_big' || name === 'land_heavy' || name === 'ko' || name === 'dodge') && at && at === p) k.surf = this.foley?.surf();
    if (name === 'door' && /chest/i.test(p?.controller?.interaction?.label || '')) k.chest = true;
    // (a fruit picked off a tree: its own rustle and snap comes with the 'foraged' event — see foley.js — not a buckle's clink)
    if (name === 'equip' && /^Pick (?!up)/.test(p?.controller?.interaction?.label || '')) return;
    // (into the water: how hard it was hit, for the size of the splash)
    if ((name === 'splash' || name === 'splash_big') && at && at.vz < -1 && k.v === undefined) k.v = -at.vz;
    if (name === 'equip' && p && !!p.drawn !== this.lastDrawn) {
      // (the weapon drawn or put away)
      const kind = p.weapon?.kind;
      k.draw = !p.drawn ? (kind === 'sword' ? 'sheathe' : null) : kind === 'sword' ? 'sword' : kind === 'gun' ? 'gun' : null;
      this.lastDrawn = !!p.drawn;
    }
    if (name === 'cannon' && at && at.owner && at.owner !== 'player' && this.place(at, 90)) this.hint('battle', 12);
    if (name === 'step' && at?.climb?.ladder) k.creak = Math.random() < 0.3;
    if (!def) def = { prio: 3, cd: 0.02, play: (v) => v.noise(0, 0.05, { freq: 1500, gain: 0.05 }) };
    const t = this.E.now();
    const cd = def.cd ?? 0.02;
    // (a sound on one side — an oar, a foot — keeps its own time: the two oars' catches land together)
    const cdKey = k.side ? key + ':' + k.side : key;
    if (this.last[cdKey] && t - this.last[cdKey] < cd) return;
    const pl = def.bus === 'ui' ? { vol: 1, pan: 0, lp: 0, far: 0 } : this.place(at);
    if (!pl) return;
    this.last[cdKey] = t;
    // (yours — your own doing, or a blow of your fight — or someone else's: theirs sit under yours)
    // (a foe's own swing isn't yours, even one you've hit before: only a blow of yours landing on them now is)
    const mine = !at || at === p || at.isPlayer || at.captain === p || at === p?.ship || (!!HITS[name] && ((at.lastHitBy === p && at.lastHitT === g?.time) || (!!p?.action && pl.vol > 0.9)));
    const prio = (def.prio ?? 5) + (mine ? 2 : 0) - Math.round(pl.far * 3);
    const v = this.E.open(key, {
      bus: def.bus || (mine ? 'sfx' : 'npc'), vol: pl.vol * (k.vol ?? 1), pan: pl.pan + (k.pan || 0), lp: pl.lp,
      send: (def.send || 0) + pl.far * 0.2, drive: def.drive || 0, prio, max: def.max ?? 4, kind: def.kind || 'foley',
    });
    if (!v) return;
    v.pj = 0.97 + Math.random() * 0.06;
    k.rr = this.E.variant(key, def.variants || 1);
    def.play(v, k);
    if (k.fruit && FLAVOUR[k.fruit]) FLAVOUR[k.fruit](v, k);
    v.end += v.tail || 0;
    // the side-chain: a blow of your fight (or a big moment near you) dips the beds, the others and the music under it
    const near = Math.min(1, pl.vol * 1.3);
    if (mine && def.kind === 'hit') this.E.sidechain((def.side ?? 0.3 + 0.35 * Math.min(1.2, k.w ?? 0.5)) * near, def.hold ?? 0.12);
    else if (def.side) this.E.sidechain(def.side * near * (mine ? 1 : 0.6), def.hold ?? 0.12);
    if (def.duck) this.E.duck(def.duck * near);
  }

  /** What landed the blow on `at`, and how: its weight, a kick, Haki, a counter, the Devil Fruit behind it. */
  hitContext(at, k, name) {
    const g = this.game;
    const now = g.env ? g.env.time : g.time;
    if (at.hitT === now && at.hitW != null) k.w = at.hitW;
    if (name === 'haki') k.hit = true;
    const att = at.lastHitT === g.time ? at.lastHitBy : null;
    if (!att) return;
    k.armament = !!att.armament;
    // (the striker's Haki voice on an armed blow; Ryou's push through the body)
    if (att.hakiSig) k.voice = att.hakiSig.voice;
    k.ryou = hasRyou(att);
    k.counter = att.counterT === now;
    const def = att.action?.def;
    k.kick = KICKS.test(def?.anim || '') || att.style === 'black_leg' || att.style === 'okama_kenpo';
    if (def?.fruit) k.fruit = def.fruit;
  }

  /** A technique's start (an actor's move just begun): its wind-up, and its release on the first blow. */
  tech(actor) {
    const a = actor.action, def = a.def;
    const t = this.E.now();
    const key = 'tech:' + (def.fruit || def.style || def.anim || 'x');
    // (one at a time per actor and move: a flurry doesn't stack the same wind-up on itself)
    if (actor._techT && t - actor._techT < 0.04) return;
    actor._techT = t;
    const pl = this.place(actor);
    if (!pl) return;
    const p = this.game?.player;
    // when the first blow lands: its step's time, slowed for a foe's readable wind-up (see abilities.js)
    const i = (def.steps || []).findIndex((s) => s.hit || s.proj || s.zone || s.dash?.hit);
    const s = i >= 0 ? def.steps[i] : null;
    const at = s?.at ?? def.windup ?? 0;
    const speed = def.noSpeedup ? 1 : actor.atkSpeed?.() || 1;
    const rel = (at / speed) * (a.slow || 1);
    const mine = actor === p;
    const v = this.E.open(key, { bus: mine ? 'sfx' : 'npc', kind: 'tech', vol: pl.vol, pan: pl.pan, lp: pl.lp, send: 0.08 + pl.far * 0.2, prio: (def.fruit ? 6 : 5) + (mine ? 2 : 0) - Math.round(pl.far * 3), max: 3 });
    if (!v) return;
    v.pj = 0.97 + Math.random() * 0.06;
    const gun = /sling/i.test(actor.weapon?.name || '') ? 'slingshot' : null;
    try { techStart(v, def, { rel, weapon: weaponOf(actor, def), gun, heavy: /heavy/.test(def.id || ''), voice: actor.hakiSig?.voice }); } catch (e) { if (!this.warned) { this.warned = true; console.warn('tech sound', def.id, e); } }
    v.end += v.tail || 0;
    // (your own ability: the beds make room from its wind-up through its release)
    if (mine && (def.fruit || def.cost || /heavy/.test(def.id || ''))) this.E.sidechain(def.fruit ? 0.55 : 0.4, Math.min(1.5, rel + 0.15));
  }

  /**
   * A footstep on `surface` — grass, sand, dirt, gravel, mud, stone, wood,
   * snow, ice, soft (a rug, tatami, cloud) or metal — `loud` 0..1 (a stroll
   * to a sprint): the heel and the roll of the foot, each sounding of what it
   * lands on, left and right a little different (see steps.js).
   */
  step(surface, loud = 0.6, at = null) {
    if (!this.ready()) return;
    try { this.foot1(surface, loud, at); } catch (e) { if (!this.warned) { this.warned = true; console.warn('step', e); } }
  }

  foot1(surface, loud, at) {
    const pl = this.place(at, 16);
    if (!pl) return;
    const p = this.game?.player;
    this.foot = -this.foot;
    const hard = surface === 'wood' || surface === 'stone' || surface === 'metal' || surface === 'ice';
    // (sneaking, the feet are put down softly)
    const hush = !at && p?.crouch ? 0.35 : 1;
    const v = this.E.open('step', { kind: 'move', vol: pl.vol * (0.75 + 0.45 * loud) * STEP * hush, pan: pl.pan + this.foot * 0.06, lp: pl.lp, send: hard ? 0.05 : 0.015, prio: 4, max: 3 });
    if (!v) return;
    v.pj = 0.98 + Math.random() * 0.04;
    footstep(v, surface, loud, { foot: this.foot, deck: !!p?.deck, wet: this.foley?.wet() || 0 });
  }

  // ---------------------------------------------------------------- menus
  /** Buttons tick when the pointer comes onto them and click when pressed (wherever they are on the page). */
  listenUi() {
    if (typeof document === 'undefined') return;
    const sel = 'button, .btn, [role="button"]';
    document.addEventListener('pointerover', (e) => {
      const b = e.target?.closest?.(sel);
      if (b && b !== this.hoverEl && !b.disabled) { this.hoverEl = b; this.sfx('ui_hover'); }
      else if (!b) this.hoverEl = null;
    }, true);
    document.addEventListener('click', (e) => { const b = e.target?.closest?.(sel); if (b && !b.disabled) this.sfx('ui_click'); }, true);
  }
}
