// The great mysteries: Poneglyphs, the Road to Laugh Tale, the Bondola to
// Mary Geoise and the legend of the All Blue.
import { count, addItem } from './inventory.js';
import { persist } from './lineage.js';
import { MARY_GEOISE } from '../world/worldgen.js';
import { findShore } from './interact.js';
import { W, EQ, chart, csize } from '../world/constants.js';

const LORE = {
  alabasta: 'The text speaks of an ancient weapon — Pluton — and of the place where it sleeps. No wonder a certain Warlord wanted it read.',
  shandora: 'It tells of another ancient weapon, Poseidon. And beside the ancient script, scratched in ordinary letters: "I came here and will lead this text to the very end of the world. — Pirate Gol D. Roger."',
  apology: 'An apology from a man named Joy Boy to Poseidon: he could not keep his promise to bring Fish-Man Island up into the sunlight.',
  ohara: 'Scorched, but unbroken: the stone the scholars of Ohara died to read. It speaks of a great kingdom that existed during the Void Century.',
  laugh_tale: 'The last Poneglyph. It tells the true history of the Void Century — of a great kingdom, of Joy Boy, of a promise made eight hundred years ago. You finally understand why Gol D. Roger laughed.',
};
const ROAD_TEXT = 'A red Road Poneglyph. Its text names a place — one of four points that, joined together on a chart, mark the location of the final island.';
const DEFAULT_TEXT = 'It records a fragment of the Void Century — the hundred years the World Government erased from history.';

export function installLegends(game) {
  const canRead = () => {
    const c = game.state.char;
    return !!(game.crewMods?.poneglyphs || c.flags.canReadPoneglyphs || (c.race === 'three_eye' && (c.haki.observation || 0) >= 20));
  };
  game.canReadPoneglyphs = canRead;

  game.interactions.onObject('poneglyph', (o) => {
    const c = game.state.char;
    const id = o.poneglyph || `${Math.round(o.x)}_${Math.round(o.y)}`;
    const readable = canRead();
    const seen = (c.flags.poneglyphsSeen = c.flags.poneglyphsSeen || []);
    if (!seen.includes(id)) seen.push(id);
    let text;
    if (!readable) {
      text = `(A perfect cube of indestructible stone, covered in an ancient script.${o.road ? ' It is red.' : ''} You can't read a single word. An archaeologist could — though the World Government executes anyone who tries.)`;
    } else {
      const read = (c.flags.poneglyphsReadIds = c.flags.poneglyphsReadIds || []);
      const first = !read.includes(id);
      if (first) {
        read.push(id);
        c.flags.poneglyphsRead = read.length;
        game.progression.raiseAttr('wil', 1);
        game.emit('poneglyphRead', id);
        game.progression.checkDream();
      }
      text = `${o.road ? ROAD_TEXT : LORE[id] || DEFAULT_TEXT}${first ? ` (+1 Willpower · Poneglyphs read: ${read.length})` : ''}`;
    }
    if (o.road && o.giveRubbing && !c.flags['rubbing_' + id]) {
      c.flags['rubbing_' + id] = true;
      addItem(game, 'poneglyph_rubbing', 1);
      text += ' You press paper against the stone and take a rubbing.';
    }
    game.dialogue.open(null, { start: 'a', nodes: { a: { speaker: o.name || (o.road ? 'Road Poneglyph' : 'Poneglyph'), text } } });
    persist(game);
  });

  game.interactions.onObject('bell', (o) => {
    game.audio?.sfx('bell');
    game.fx.ring(o.x, o.y - 2, 0.5, 14, '#ffd54f', 1.2, 0.15);
    game.log(`The ${o.name || 'bell'} rings out across the ${game.world === game.surface ? 'sea' : 'clouds'}.`, '#ffe082');
    game.emit('questEvent', 'rang_bell', o);
    const bid = o.bell || o.spot || (o.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (bid) game.emit('questEvent', `rang_bell:${bid}`, o);
    game.emit('bellRung', o);
  });

  // ------------------------------------------------------ Laugh Tale
  const laughTale = () => game.surface.islands.find((i) => i.def?.hidden);
  let warnT = 0;
  game.on('tick', (dt) => {
    const c = game.state?.char, p = game.player;
    if (!c || !p || game.world !== game.surface) return;
    const lt = laughTale();
    if (!lt || c.flags.laughTaleRevealed) return;
    const d = game.world.distance(p.x, p.y, lt.x, lt.y);
    const R = lt.radius + 70;
    if (d < R) {
      // an eternal storm drives every ship away from the last island
      game.env.storm = Math.max(game.env.storm, 0.9 * (1 - d / R) + 0.3);
      const ang = Math.atan2(p.y - lt.y, game.world.dx(lt.x, p.x));
      const push = 9 * (1 - d / R) + 2;
      const s = p.mode === 'sail' ? p.ship : null;
      if (s) {
        s.x = game.world.wx(s.x + Math.cos(ang) * push * dt); s.y += Math.sin(ang) * push * dt;
        if (!s.fits(game.world, s.x, s.y, s.heading)) s.unstick(game.world);
      } else { p.x = game.world.wx(p.x + Math.cos(ang) * push * dt); p.y += Math.sin(ang) * push * dt; }
      if ((warnT -= dt) <= 0) {
        warnT = 12;
        game.log('A storm that never ends and currents that turn back on themselves: the sea itself refuses to let you pass. Without the four Road Poneglyphs, no one can reach the final island.', '#ce93d8');
      }
    }
  });
  let revealed = false;
  game.on('tick', () => {
    const c = game.state?.char;
    if (!c) { revealed = false; return; }
    if (c.flags.laughTaleRevealed && !revealed) {
      revealed = true;
      const lt = laughTale();
      if (lt && !c.flags.laughTaleAnnounced) {
        c.flags.laughTaleAnnounced = true;
        game.surface.reveal(lt.x, lt.y, lt.radius + 20);
        game.renderer.terrain.updateFog(game.surface.fog);
        game.ui.toast('THE ROAD IS OPEN', 'The four Road Poneglyphs point to the final island: Laugh Tale.', '#ffd54f');
      }
    }
  });
  game.on('characterStart', () => { revealed = false; });

  // --------------------------------------------------------- Bondola
  game.interactions.onObject('bondola', (o) => {
    const c = game.state.char;
    const allowed = c.flags.bondolaPass || count(c, 'wg_permit') > 0 || c.flags.celestialGuest;
    const MG = MARY_GEOISE;
    const up = o.port === 'paradise' || o.port === 'newworld';
    if (!allowed) {
      game.dialogue.open(null, { start: 'a', nodes: { a: { speaker: 'World Government Guard', text: c.bounty > 0
        ? '"A PIRATE at the Red Port?! Seize them!" (Pirates cross the Red Line the hard way: coat your ship at Sabaody and dive to Fish-Man Island.)'
        : '"The Bondola is reserved for the World Government, Marine officers of Captain rank and above, and guests of the Holy Land. Move along."' } } });
      if (c.bounty > 0) game.emit('redPortAlarm', o);
      return;
    }
    const go = (x, y, msg) => {
      game.ui.fade(true);
      setTimeout(() => {
        const s = findShore(game.world, x, y, 8) || { x, y };
        game.player.x = s.x; game.player.y = s.y;
        game.snapCamera();
        game.ui.fade(false);
        if (msg) game.ui.banner(msg[0], msg[1], msg[2], 5);
        persist(game);
      }, 800);
    };
    const moveShipTo = (port) => {
      const mine = game.ships.filter((s) => s.owner === 'player' && !s.sunk && game.world.distance(s.x, s.y, game.player.x, game.player.y) < 80);
      const s = mine[0];
      if (!s) return false;
      s.x = port.moor.x; s.y = port.moor.y; s.speed = 0;
      if (!s.fits(game.world, s.x, s.y, s.heading)) s.unstick(game.world);
      return true;
    };
    if (up) {
      const here = o.port === 'paradise' ? MG.portParadise : MG.portNewWorld;
      const other = o.port === 'paradise' ? MG.portNewWorld : MG.portParadise;
      game.dialogue.open(null, { start: 'a', nodes: { a: { speaker: 'Bondola Operator', text: '"Destination?"', choices: [
        { text: 'Up to Mary Geoise, the Holy Land.', do: () => go(o.port === 'paradise' ? W - csize(16) : csize(16), EQ + 3, ['MARY GEOISE', 'The Holy Land', 'Keep your eyes down. The Celestial Dragons do not like to be looked at.']), end: true },
        { text: 'Carry my ship over the Red Line.', do: () => {
          if (!moveShipTo(other)) { game.log('You have no ship in this harbour.', '#ff8a80'); return; }
          go(other.bondola.x - other.dir * 3, other.bondola.y + 3, ['THE RED LINE', other === MG.portNewWorld ? 'New World' : 'Paradise', 'Your ship is hauled over the Red Line on the Bondola.']);
          void here;
        }, end: true },
        { text: 'Never mind.', end: true },
      ] } } });
    } else {
      const port = o.port === 'down_paradise' ? MG.portParadise : MG.portNewWorld;
      go(port.bondola.x - port.dir * 3, port.bondola.y + 3, null);
    }
  });

  // ------------------------------------------------------ All Blue
  // A legend every cook knows: a sea where the fish of all four Blues swim
  // together. It lies somewhere past the Calm Belt in the New World — and
  // only a cook's instinct can find it.
  game.on('tick', () => {
    const c = game.state?.char, p = game.player;
    if (!c || !p || c.flags.allBlue || game.world !== game.surface || p.mode !== 'sail') return;
    if (!(game.crew?.hasRole('cook') || c.masteries?.black_leg !== undefined)) return;
    const ab = allBluePoint(c);
    if (game.world.distance(p.x, p.y, ab.x, ab.y) < 26) {
      c.flags.allBlue = true;
      game.ui.banner('ALL BLUE', 'The miracle sea', 'Fish from the East, West, North and South Blue swim together beneath your hull. The legend was true.', 8);
      game.progression.checkDream();
      addItem(game, 'sea_king_steak', 3);
      persist(game);
    } else if (game.world.distance(p.x, p.y, ab.x, ab.y) < 120 && !c.flags.allBlueHint) {
      c.flags.allBlueHint = true;
      game.log('The fish around your ship… these are East Blue sea bream, North Blue salmon… all in one place? The All Blue must be close.', '#80deea');
    }
  });
}

/** The All Blue's position differs for every lineage (seeded). */
export function allBluePoint(c) {
  const r = ((c.runSeed || 1) % 1000) / 1000;
  return { x: chart(260 + r * 1400), y: chart(880 + ((c.runSeed || 7) % 7) * 45) };
}
