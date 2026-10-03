// Another player in the voyage, as this game sees them: who they are (their
// hello and their look), the states coming in (smoothed: interp.js), and the
// stand-ins drawn for them — a character, posed as they are, and the ship
// they sail. The stand-ins are only drawn (render3d/index.js draws them with
// everyone else): they're in no list the game's own systems go through, so
// nobody here fights them, talks to them, steers round their ship or boards
// her, and nothing of theirs is simulated (their own game does that).
import { Actor } from '../game/actor.js';
import { Ship } from '../game/ship.js';
import { getAbility, abilityTotal } from '../game/abilities.js';
import { SHIPS } from '../data/ships.js';
import { RACES } from '../data/races.js';
import { gaitCadence } from '../render/anims.js';
import { stationSpot } from '../render3d/chars/pose.js';
import { SnapBuffer } from './interp.js';
import { BIT } from './protocol.js';

const TAU = Math.PI * 2;
/** The colour the other players' names are written in over their heads (and in the chat). */
export const MATE_COLOR = '#8fe9f5';
const CLIMBING = {}; // (hauling themselves up: the pose only asks whether they are)

export class Remote {
  constructor(id, voyage) {
    this.id = id;
    this.voyage = voyage;
    this.name = ''; // (till they say: a guest has no pirate before choosing one)
    this.role = 'guest';
    this.play = false; // in the world (not still choosing a character)
    this.buf = new SnapBuffer({ width: voyage.game.surface?.width || 0 });
    this.info = null; // their look (protocol.js readLook)
    this.actor = null;
    this.shipInfo = null;
    this.ship = null;
    this.now = null; // the state drawn this frame
    this.visible = false;
    this.actN = -1; this.dodgeN = -1; this.lastHs = 0;
    this.joinedAt = Date.now();
  }

  /** What to call them: their pirate's name, once they've chosen one. */
  get label() { return this.name || (this.role === 'host' ? 'The host' : 'A new arrival'); }

  hello(h) {
    this.role = h.role;
    if (h.name) this.name = h.name;
    this.play = h.play;
    this.slot = h.slot; this.prof = h.prof; this.v = h.v; this.sig = h.sig; this.since = h.since;
  }

  /** Their look changed (or came for the first time): the character drawn for them follows. */
  setLook(L) {
    this.info = L;
    this.name = L.name;
    const a = this.actor || (this.actor = makeActor(L));
    a.name = L.name;
    // (a new look object: the 3D view sees it and builds the model afresh)
    a.look = { ...L.look, race: L.look.race || L.race };
    a.race = RACES[L.race] ? L.race : 'human';
    a.flameLit = a.race === 'lunarian';
    a.weapon = L.weapon;
    a.fruit = L.fruit;
    a.gills = L.gills;
    a.style = L.style;
    a.buffs = L.buffs.map((b) => ({ ...b, mods: b.scale ? { scale: b.scale } : undefined, t: 1e9 }));
  }

  /** The ship they're with: built afresh when it's another one (or another type), kept when it's the same. */
  setShip(S) {
    if (!S.id || !SHIPS[S.type]) { this.shipInfo = null; this.ship = null; return; }
    const same = this.ship && this.shipInfo?.id === S.id && this.shipInfo.type === S.type && String(this.shipInfo.upgrades) === String(S.upgrades);
    this.shipInfo = S;
    if (same) {
      // (her name, flag or coating changed: the 3D view sees a new flag or coat and rebuilds her)
      Object.assign(this.ship, { name: S.name, jr: S.jr, coated: S.coated, faction: S.faction });
      return;
    }
    const s = new Ship({ type: S.type, x: 0, y: 0, heading: 0, owner: 'remote', faction: S.faction === 'marine' ? 'marine' : 'player', name: S.name, jr: S.jr, upgrades: S.upgrades, coated: S.coated });
    s.netRemote = true;
    s.uid = S.id;
    s.anchored = false;
    this.ship = s;
  }

  push(s, now) {
    if (this.buf.push(s, now)) this.play = true;
  }

  /** They've left the world (back at the title, their lineage ended…): nothing to draw till they're back. */
  gone() {
    this.play = false;
    this.visible = false;
    this.buf.reset();
    this.now = null;
    this.actN = -1; this.dodgeN = -1;
    if (this.actor) { this.actor.action = null; this.actor.dash = null; }
  }

  /** This frame: where they are and what they're doing, onto the stand-ins. `world`: our world's key ('' at the surface, else the zone). */
  update(game, now, dt, world) {
    const s = this.play && this.info ? this.buf.sample(now) : null;
    this.now = s;
    this.visible = !!s && s.w === world && !!this.actor;
    if (!this.visible) return;
    const a = this.actor, w = game.world;
    // their ship first (whoever's aboard stands on her as she's drawn)
    const sh = this.ship && s.si === this.shipInfo?.id && s.sx !== undefined ? this.ship : null;
    this.shipShown = sh;
    if (sh) {
      sh.x = w.wx(s.sx); sh.y = s.sy; sh.heading = s.sh; sh.speed = s.ss; sh.sailSet = s.sl;
      sh.lvl = s.lv || 0; sh.pitch = s.pi || 0; sh.rowL = Math.round(s.rl || 0); sh.rowR = Math.round(s.rr || 0);
      sh.captain = s.b & BIT.helm ? a : null;
      if (sh.oars) sh.updateOars(Math.min(0.1, dt));
    }
    poseActor(a, s, dt, sh, w);
    this.cues(game, a, s, dt);
  }

  /** Their techniques and dodges as they start (with the sound, and the shout): drawn as they do them. */
  cues(game, a, s, dt) {
    if (s.aid && s.an !== this.actN) {
      this.actN = s.an;
      const def0 = getAbility(s.aid);
      if (def0) {
        const def = s.am ? { ...def0, m1Chain: true } : def0;
        const rate = def.noSpeedup ? 1 : s.ar || 1;
        a.action = { def, t: (s.at || 0) + (s.lag || 0) * rate, step: 0, angle: a.facing, rate, end: abilityTotal(def), net: true };
        game.audio?.sfx(def.sfxStart || 'whoosh', a);
        if (def.say && game.fx && (s.at || 0) < 0.3) game.fx.text(a.x, a.y - 2.1, def.say, '#ffffff', 0.34, { life: 1.2 });
      }
    } else if (!s.aid && a.action) a.action = null;
    const act = a.action;
    if (act) {
      act.t += dt * act.rate;
      // (kept in step with theirs, should this game have stalled a moment)
      if (s.aid && s.an === this.actN) { const want = (s.at || 0) + (s.lag || 0) * act.rate; if (Math.abs(want - act.t) > 0.15) act.t = want; }
      if (act.t >= act.end) a.action = null;
    }
    if (s.gn && s.gn !== this.dodgeN) {
      this.dodgeN = s.gn;
      const left = 0.22 - (s.gt || 0) - (s.lag || 0);
      if (left > 0.02) {
        a.dash = { vx: s.gvx, vy: s.gvy, t: left, t0: 0.22, dodge: true };
        game.audio?.sfx('dodge', a);
        game.fx?.burst(a.x, a.y, 6, { angle: Math.atan2(-s.gvy, -s.gvx), spread: 1.6, color: ['#d7ccc8', '#bcaaa4', '#efebe9'], speed: 2.4, z: 0.08, vz: 0.6, g: 1.2, life: 0.5, kind: 'dust', size: 0.2, grow: 0.45 });
      }
    }
    if (a.dash) { a.dash.t -= dt; if (a.dash.t <= 0) a.dash = null; }
    // (a blow landing on them over there: the flash of it here)
    const hs = s.hs || 0;
    if (hs > this.lastHs + 0.05) a.flashT = 0.12;
    this.lastHs = hs;
    if (a.flashT > 0) a.flashT = Math.max(0, a.flashT - dt);
  }

  dispose() { this.actor = null; this.ship = null; }
}

function makeActor(L) {
  const a = new Actor({ name: L.name, look: { ...L.look }, race: RACES[L.race] ? L.race : 'human' });
  a.netRemote = true;
  a.showName = true;
  a.nameColor = MATE_COLOR;
  a.faction = 'neutral';
  a.persistent = true;
  return a;
}

/** Their state onto the character drawn for them: place, motion, what they're doing, and where on their ship. */
function poseActor(a, s, dt, ship, w) {
  const B = s.b, sc = a.look?.scale || 1;
  a.x = w.wx(s.x); a.y = s.y; a.z = s.z || 0; a.facing = s.f;
  a.vx = s.vx || 0; a.vy = s.vy || 0; a.vz = s.vz || 0; a.speed = s.sp || 0;
  a.moving = !!(B & BIT.moving);
  a.intent.sprint = !!(B & BIT.sprint);
  a.intent.mz = s.mz || 0;
  a.inWater = !!(B & BIT.water); a.under = !!(B & BIT.under); a.sinking = !!(B & BIT.sinking);
  a.depth = s.d || 0; a.wading = s.wd || 0;
  a.flying = !!(B & BIT.flying);
  a.blocking = !!(B & BIT.block);
  a.blockTime = a.blocking ? (a.blockTime || 0) + dt : 0;
  a.drawn = !!(B & BIT.drawn);
  a.armament = !!(B & BIT.armament);
  a.conquerorInfused = !!(B & BIT.conqueror);
  const st = B & BIT.dead ? 'dead' : B & BIT.knocked ? 'knocked' : 'idle';
  a.knockT = st === 'knocked' ? (a.state === 'knocked' ? (a.knockT || 0) + dt : 0) : 0;
  a.state = st;
  a.hitstun = s.hs || 0;
  a.charging = s.c || 0;
  a.climb = B & BIT.climb ? CLIMBING : null;
  a.airT = a.z > 0.3 ? 0.1 : 0;
  if (s.st) a.style = s.st;
  a.roofed = !!(B & BIT.roofed) && s.g !== undefined;
  a.lastG = a.roofed ? s.g : null;
  // (the stride keeps pace with the ground they cover, as their own does: no skating feet)
  if (a.moving && !a.inWater) a.walk += dt * TAU * gaitCadence(a.speed / sc, a.intent.sprint);
  else if (a.moving) a.walk += dt * TAU * 1.2;
  // at their helm (or their oars): where the work is, riding with her
  if (ship && B & BIT.helm) {
    const stn = { kind: ship.def.oarsOnly ? 'row' : 'helm', ship }, spot = stationSpot(stn), c = Math.cos(ship.heading), sn = Math.sin(ship.heading);
    a.mode = 'sail'; a.ship = ship;
    a.x = w.wx(ship.x + c * spot.u); a.y = ship.y + sn * spot.u;
    a.deck = { ship, u: spot.u, v: 0, h: spot.floor };
    a.facing = ship.heading; a.moving = false; a.z = 0;
    return;
  }
  a.mode = 'foot'; a.ship = null;
  // standing aboard her: on her deck where they are on it, as she's drawn here
  if (ship && s.du !== undefined) {
    const c = Math.cos(ship.heading), sn = Math.sin(ship.heading);
    a.x = w.wx(ship.x + s.du * c - s.dv * sn); a.y = ship.y + s.du * sn + s.dv * c;
    a.deck = { ship, u: s.du, v: s.dv, h: s.dh };
  } else a.deck = null;
}
