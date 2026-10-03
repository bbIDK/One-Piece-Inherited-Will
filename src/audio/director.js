// The music director: the one place that decides what music plays. Sixteen
// times a second it looks at the game — where you are (the open sea of which
// Blue, an island, a town, a zone, Reverse Mountain's torrent, under the
// water), the time of day, and whether you're in a fight and how hard it is —
// and moves the music to match, the way a film's score follows the picture:
//
//   * a new place: the piece playing ends on its next bar line, fading over
//     a bar or so, and after a breath the new place's theme begins (arriving
//     somewhere, its music comes soon; between pieces there is quiet, as ever);
//   * night falls: the next piece is the night's version (never a cut);
//   * a fight: the battle theme for this place (its key and colours: see
//     themes.js battleOf) comes in on the next beat with a taiko hit, its
//     layers rising with the fight — more foes, a boss, your health low, blows
//     landing — and when it's over it resolves on a bar line: a closing chord,
//     a fanfare if you won, then quiet and the place's music again.
//
// Places are only believed once they've held a moment (a coastline walked
// along doesn't flip the music back and forth), and the call sites that used
// to pick music themselves now at most drop a hint (hint()).
import { Deck } from './music.js';
import { placeTheme, battleOf, THEMES } from './themes.js';
import { regionAt, REGION_INFO, REGION, RM_X, W } from '../world/constants.js';

// how long a new place must hold before the music follows it (seconds)
const HOLD = { title: 0, under: 0.6, surface: 1.5, rm: 0.3, zone: 0.5, town: 2, isl: 3, sea: 4, holy: 3 };
// battle layers come in as a fight heats up: [stem, intensity at which it's half in]
const LAYERS = [['perc', 0], ['bass', 0.15], ['pad', 0.2], ['arp', 0.3], ['perc2', 0.4], ['lead', 0.5], ['brass', 0.72]];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Director {
  constructor(audio) {
    this.audio = audio;
    this.state = 'calm';
    this.deck = null;
    this.place = null; // the place the music believes in
    this.cand = null; this.candT = 0;
    this.restUntil = 0;
    this.night = false;
    this.fight = { on: false, since: 0, offSince: 0, kos: 0, boss: false, bossDown: false, intensity: 0, heat: 0 };
    this.hints = {};
    this.fading = [];
  }

  get mu() { return this.audio.mu; }
  get now() { return this.audio.E.now(); }

  /** A call site's hint: 'battle' (a boarding, a naval fight) keeps the fight music up for `sec`. */
  hint(kind, sec = 8) { this.hints[kind] = this.now + sec; }
  /** A blow landed, or one taken: the fight's music leans in a little. */
  heat(k = 0.06) { this.fight.heat = Math.min(0.35, this.fight.heat + k); }
  /** A foe beaten in this fight (a boss: the fanfare is bigger). */
  ko(boss = false) { if (this.state === 'battle') { this.fight.kos++; if (boss) this.fight.bossDown = true; } }

  // ------------------------------------------------------------ the world, as data
  /** Where the player is, as plain data for placeTheme (see themes.js). */
  where(game) {
    const p = game?.player;
    if (!p || p.state === 'dead') return { title: true };
    const w = game.world, env = game.env;
    const zone = w.zone === 1 ? 'sky' : w.zone === 2 ? 'undersea' : w.zone === 3 ? 'prison' : 'surface';
    // (night: a little hysteresis either side of dusk)
    const dl = env?.daylight ?? 1;
    if (this.night && dl > 0.42) this.night = false;
    else if (!this.night && dl < 0.3) this.night = true;
    const out = { zone, zoneId: w.id, night: this.night, under: !!p.under };
    // (riding Reverse Mountain's canals: see game/sea.js reverseMountain)
    out.rm = !!game.sea?.rmState;
    const isl = game.currentIsland;
    if (isl) {
      const def = isl.def || isl;
      out.island = { id: def.id || isl.id, def, sea: def.sea };
      // in one of its towns (or close by it)?
      let best = null, bd = 14 * 14;
      for (const t of isl.towns || []) {
        if (t.x0 == null) continue;
        const dx = Math.max(t.x0 - p.x, 0, p.x - t.x1), dy = Math.max(t.y0 - p.y, 0, p.y - t.y1);
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = t; }
      }
      if (best) out.town = { id: best.id, style: best.style };
    }
    if (zone === 'surface') {
      const reg = regionAt(p.x, p.y);
      out.seaId = reg === REGION.CALM_NORTH || reg === REGION.CALM_SOUTH ? 'calm_belt' : REGION_INFO[reg]?.id || 'east_blue';
      // the Red Line at Mary Geoise (the seam of the map), not at Reverse Mountain
      if (reg === REGION.RED_LINE) {
        const x = ((p.x % W) + W) % W;
        out.holyLand = Math.abs(x - RM_X) > W / 4;
        if (!out.holyLand) out.seaId = 'red_line';
      }
    }
    return out;
  }

  /** Which place this is, for the music (night aside: night only changes the next piece). */
  placeKey(w) {
    if (w.title) return 'title';
    if (w.rm) return 'rm';
    if (w.under && w.zone !== 'undersea') return 'under';
    if (w.zone !== 'surface') return `zone:${w.zoneId}:${w.island?.id || ''}`;
    if (w.town && w.island) return `town:${w.island.id}:${w.town.id}`;
    if (w.island) return `isl:${w.island.id}`;
    if (w.holyLand) return 'holy';
    return `sea:${w.seaId}`;
  }

  /** How hard a fight is: { on, intensity 0..1, boss }. */
  combat(game) {
    const p = game?.player, F = this.fight, now = this.now;
    if (!p || p.state === 'dead') return { on: false, intensity: 0, boss: false };
    let n = 0, boss = false, named = false;
    if (game.engaged || game.combatT > 0) {
      for (const a of game.actorsNear(p.x, p.y, 32)) {
        if (a === p || !a.alive || a.state === 'dead' || a.faction === 'player') continue;
        const c = a.controller;
        if (c?.target !== p || (c.state !== 'chase' && c.state !== 'attack')) continue;
        n++;
        if (a.boss) boss = true;
        else if (a.named) named = true;
      }
    }
    const hinted = (this.hints.battle || 0) > now;
    const on = !!game.engaged || (game.combatT > 0 && n > 0) || hinted;
    F.heat = Math.max(0, F.heat - 0.006); // (dies away over a few seconds: update runs 16 times a second)
    let k = 0.35 + 0.14 * Math.max(0, n - 1) + (named ? 0.15 : 0) + F.heat;
    if (p.d && p.hp / p.d.maxHp < 0.3) k += 0.15;
    if (hinted && !n) k = Math.max(k, 0.5);
    if (boss) k = Math.max(k, 0.85);
    return { on, intensity: Math.min(1, k), boss };
  }

  // ------------------------------------------------------------ deciding
  update(game) {
    const mu = this.mu;
    if (!mu) return;
    const now = this.now;
    // the decks on their way out play on under their fade
    this.fading = (this.fading || []).filter((d) => d.schedule(now) && now < d.stopAt);
    const w = this.where(game);
    const pk = this.placeKey(w);
    // a place is believed once it has held (arrivals from the title, or diving, are near instant)
    if (pk !== this.place) {
      if (pk !== this.cand) { this.cand = pk; this.candT = now; }
      const kind = pk.split(':')[0];
      const hold = this.place === 'under' ? HOLD.surface : this.place === null || this.place === 'title' ? 0.3 : HOLD[kind] ?? 2;
      if (now - this.candT >= hold) { this.prevPlace = this.place; this.place = pk; this.cand = null; this.onPlace(w, now, game); }
    } else this.cand = null;
    this.w = w;

    const cb = game?.player ? this.combat(game) : { on: false, intensity: 0, boss: false };
    const F = this.fight;
    const down = game?.player?.state === 'knocked';
    if (cb.on && !down) { if (!F.since) F.since = now; F.offSince = 0; } else { F.since = 0; if (!F.offSince) F.offSince = now; }
    F.intensity += (cb.intensity - F.intensity) * 0.25;

    if (this.state === 'battle') {
      const D = this.deck;
      if (down) {
        // knocked flat: the fight's music drains away (the "knocked" sting plays over the silence)
        if (D) { D.fadeOut(now, 1.5); this.fading.push(D); }
        this.deck = null; this.state = 'calm'; this.restUntil = now + 5;
        return;
      }
      if (!cb.on && now - F.offSince > 2.5) { this.resolve(now); return; }
      if (D) {
        if (cb.boss && !F.boss) F.boss = true;
        // the layers follow the fight, on the bar lines
        const bar = D.nextBar(now, 0.08);
        if (bar !== this.stemBar) { this.stemBar = bar; D.setStems(this.layers(F.intensity, F.boss), bar, Math.min(0.8, D.barDur * 0.5)); }
        D.schedule(now);
      }
      return;
    }
    // into a fight (a beat's grace, unless the blows have already started)
    if (cb.on && !down && (now - F.since > 0.35 || F.heat > 0.05)) { this.engage(w, cb, now); return; }

    // calm: a piece playing, or quiet before the next
    const D = this.deck;
    if (D) {
      if (!D.schedule(now)) {
        // the piece has ended: a while of quiet before the next
        D.fadeOut(now, 4);
        this.deck = null;
        const T = D.T;
        this.restUntil = now + T.rest[0] + Math.random() * (T.rest[1] - T.rest[0]);
      }
      return;
    }
    if (now >= this.restUntil && this.place) this.start(w, now);
  }

  /** The place has changed: end what's playing on a bar line, and have the new place's music come soon. */
  onPlace(w, now, game) {
    const D = this.deck, k = this.place.split(':')[0], from = (this.prevPlace || '').split(':')[0];
    // a death: the music falls away, and the quiet holds a while before the title's piece
    if (k === 'title' && game?.player) {
      if (D) { D.fadeOut(now, 2); this.fading.push(D); }
      this.deck = null; this.state = 'calm'; this.theme = null;
      this.restUntil = now + 8;
      return;
    }
    if (this.state === 'battle') return; // (a fight's music plays on; the new place's comes after it)
    // diving under, or coming up: quicker
    const quick = k === 'under' || from === 'under' || k === 'rm' || from === 'rm' || k === 'title' || from === 'title';
    if (D) {
      const at = quick ? now + 0.05 : D.nextBar(now, 0.1);
      const fade = quick ? 1.2 : Math.min(3, Math.max(1.5, D.barDur * 1.5));
      D.fadeOut(at, fade);
      this.fading.push(D);
      this.deck = null;
      this.restUntil = at + fade * 0.6 + (quick ? 0.4 : 1.2);
    } else {
      // (resting: the new place's music comes soon — that's what arriving sounds like)
      this.restUntil = Math.min(this.restUntil, now + (from === 'title' ? 0.8 : quick ? 0.6 : 2.2));
    }
  }

  /** Begin a calm piece for where we are. */
  start(w, now) {
    const T = placeTheme(w);
    if (!T) return;
    this.deck = new Deck(this.mu, T, { at: now + 0.05, fade: 1.2, loop: !!T.loop });
    this.deck.place = this.place;
    this.theme = T.id;
  }

  /** The intensity's layers: each stem eases in around its threshold (the boss layer only for a boss). */
  layers(k, boss) {
    const out = {};
    for (const [s, th] of LAYERS) out[s] = th <= 0 ? 1 : smooth(th - 0.1, th + 0.06, k);
    out.boss = boss ? smooth(0.55, 0.75, k) : 0;
    return out;
  }

  /** A fight begins: the battle theme on the next beat, a taiko hit and a cymbal swell into it. */
  engage(w, cb, now) {
    const F = this.fight;
    const old = this.deck;
    const place = placeTheme({ ...w, night: false, under: false, rm: false });
    const T = battleOf(place && !place.battle ? place : THEMES.sea, cb.boss);
    const at = old ? old.nextBeat(now, 0.12) : now + 0.12;
    if (old) { old.fadeOut(Math.max(now, at - 0.25), 0.9); this.fading.push(old); }
    F.kos = 0; F.bossDown = false; F.boss = cb.boss; F.intensity = cb.intensity;
    this.deck = new Deck(this.mu, T, { at, fade: 0.15, loop: true, stems: this.layers(cb.intensity, cb.boss) });
    this.deck.place = this.place;
    this.state = 'battle';
    this.theme = T.id;
    this.stemBar = null;
    this.stinger('start', this.deck.t0, this.deck);
  }

  /** The fight is over: resolve on the next bar line — a closing chord, a fanfare if it was won. */
  resolve(now) {
    const D = this.deck, F = this.fight;
    this.state = 'calm';
    this.deck = null;
    this.theme = null;
    if (!D) { this.restUntil = now + 2; return; }
    const at = D.nextBar(now, 0.1);
    D.cadence(at);
    D.fadeOut(at + 0.05, 2.4);
    this.fading.push(D);
    const won = F.kos > 0 || F.bossDown;
    if (won) this.stinger(F.bossDown ? 'victory_boss' : 'victory', at, D);
    this.restUntil = at + (won ? (F.bossDown ? 5 : 3.5) : 2) + 2.5;
  }

  /**
   * A short musical phrase on its own bus, in the deck's key: 'start' (a taiko
   * hit with a cymbal swelling into it), 'victory' (ta-ta-ta-DAAA on brass over
   * a timpani roll), 'victory_boss' (the same, held longer, with strings and a choir).
   */
  stinger(kind, at, D) {
    const mu = this.mu, c = mu.ctx, E = this.audio.E;
    const bus = c.createGain(); bus.gain.value = 2.2; bus.connect(E.music); bus.connect(E.hall);
    const S = D.S, root = S.key + 12, dur = kind === 'victory_boss' ? 3.4 : 2.4;
    if (kind === 'start') {
      // the cymbal swelling up into the downbeat
      const src = c.createBufferSource(); src.buffer = E.white; src.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4500;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, Math.max(c.currentTime, at - 0.55));
      g.gain.linearRampToValueAtTime(0.05, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      src.connect(hp); hp.connect(g); g.connect(bus); src.start(Math.max(c.currentTime, at - 0.55)); src.stop(at + 0.55);
      mu.drum(at, 'taiko', bus, 1.2);
      mu.drum(at, 'crash', bus, 0.8);
    } else {
      // ta-ta-ta-DAAA: up the major chord (a minor key's fight ends in its major — a Picardy third)
      const step = Math.min(0.12, S.eighth * 0.6);
      [0, 4, 7].forEach((iv, i) => mu.inst('brass', at + i * step, step * 0.9, root + iv, 0.045, bus));
      const hold = at + 3 * step;
      for (const iv of [0, 4, 7, 12]) mu.inst('brass', hold, dur - 0.8, root + iv, 0.03, bus);
      for (const iv of [0, 7]) mu.inst('strings', hold, dur - 0.4, root - 12 + iv, 0.03, bus);
      if (kind === 'victory_boss') for (const iv of [0, 4, 7]) mu.inst('choir', hold, dur, root + iv, 0.018, bus);
      for (let i = 0; i < 6; i++) mu.drum(at + i * step * 0.5, 'timp', bus, 0.5 + i * 0.08, root - 24);
      mu.drum(hold, 'timp', bus, 1.2, root - 24);
      mu.drum(hold, 'crash', bus, 1);
    }
    setTimeout(() => { try { bus.disconnect(); } catch { /* gone */ } }, (at - c.currentTime + dur + 5) * 1000);
  }
}
