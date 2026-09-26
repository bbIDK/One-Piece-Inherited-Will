// The living world: the News Coo's morning paper, the Grand Line's absurd
// weather, and fog banks such as the Florian Triangle.
import { regionAt, REGION_INFO, isGrandLine, REGION } from '../world/constants.js';
import { formatBerries } from '../core/math.js';
import { RNG } from '../core/rng.js';
import { allNpcDefs } from './npcs.js';

const HEADLINES = [
  'World Economy News: the Revolutionary Army topples another kingdom in the West Blue. Dragon remains at large.',
  'Marine Headquarters: Fleet Admiral reaffirms "Absolute Justice" after a string of pirate attacks in Paradise.',
  'A Warlord of the Sea has been seen sailing openly into the Grand Line. The Government declines to comment.',
  'Weather scientists of Weatheria announce a new forecasting method. Nobody in the Grand Line believes them.',
  'Sea Kings sighted outside the Calm Belt! Fishermen of the South Blue urged to stay in port.',
  'Galley-La Company launches a new ship. Mayor Iceburg: "A ship is a promise to the sea."',
  'Rumours of a Devil Fruit auction in the New World. The Marines are "monitoring the situation".',
  'Bounty hunters report record catches in the East Blue. Rookie pirates are advised to set sail anyway.',
  'The Celestial Dragons visit the Sabaody Archipelago. Citizens reminded to kneel.',
  'Cipher Pol denies the existence of a ninth unit. Again.',
  'A giant whale was seen headbutting the Red Line near the Twin Cape. Lighthouse keeper: "He\'s waiting for someone."',
  'The Emperors of the Sea divide the New World between them. Three kingdoms change their flags in a single week.',
  'Newspaper columnist wonders: does the One Piece really exist? Readers from Loguetown write in: "YES."',
  'A sky island merchant sells "Dials" in Jaya. Customers report that the shells "talk back".',
  'Weekly tip from the Marines: if you see a straw hat, report it.',
];

export function installWorld(game) {
  // ---------------------------------------------------------- the morning paper
  game.onNewDay = (day) => {
    const c = game.state?.char;
    if (!c) return;
    game.emit('newDay', day);
    const rng = new RNG(c.runSeed + ':news:' + day);
    const lines = [];
    if (c.bounty && c.flags.lastPaperBounty !== c.bounty) {
      lines.push(`WANTED: "${c.name}" — ${formatBerries(c.bounty)}. The Marines urge caution.`);
      c.flags.lastPaperBounty = c.bounty;
    }
    const lastBoss = (c.bosses || [])[c.bosses.length - 1];
    if (lastBoss && c.flags.lastPaperBoss !== lastBoss) {
      const def = allNpcDefs().find((d) => d.id === lastBoss);
      if (def) lines.push(`${def.name} defeated! Witnesses name ${c.name} as the one responsible.`);
      c.flags.lastPaperBoss = lastBoss;
    }
    if (c.faction === 'marine' && c.marineRank) lines.push(`Marine ${c.marineRank} ${c.name} commended for service.`);
    lines.push(rng.pick(HEADLINES));
    game.log(`A News Coo drops the morning paper: ${lines.join(' · ')}`, '#e0e0e0');
  };

  // ---------------------------------------------------------- Grand Line weather
  game.onGrandLineWeather = () => {
    const p = game.player, env = game.env;
    if (!p || game.world !== game.surface || p.mode !== 'sail') return;
    const r = Math.random();
    if (r < 0.3) {
      env.windTarget = env.windAngle + Math.PI;
      game.log('The wind swings round without warning — the Grand Line changes its mind.', '#90caf9');
    } else if (r < 0.55) {
      env.freakSnow = 60;
      game.log('Snow falls out of a clear summer sky. This sea makes no sense.', '#e3f2fd');
    } else if (r < 0.8) {
      const s = p.ship;
      const waveA = Math.random() * Math.PI * 2;
      game.ui.banner('ROGUE WAVE!', '', 'A wall of water rises out of nowhere — turn your bow into it!', 3);
      setTimeout(() => {
        if (!s || s.sunk || p.ship !== s) return;
        const diff = Math.abs(Math.atan2(Math.sin(s.heading - waveA), Math.cos(s.heading - waveA)));
        const facing = diff < 0.8 || diff > Math.PI - 0.8;
        game.fx.shake(0.8);
        if (!facing) { s.damage(18 + Math.random() * 20, null, { weather: true }); game.log('The wave slams into your hull broadside!', '#ff8a80'); }
        else game.log('Your bow cuts through the wave. Well steered!', '#a5d6a7');
      }, 3500);
    } else {
      env.stormTarget = 0; env.storm *= 0.3;
      game.log('The storm vanishes as suddenly as it came. Blue sky.', '#90caf9');
    }
  };
  game.on('tick', (dt) => {
    const env = game.env;
    if (env.freakSnow > 0) { env.freakSnow -= dt; env.snow = Math.max(env.snow, 0.6); }
    // no storms above the clouds or under the sea
    if (game.world !== game.surface) { env.stormTarget = 0; env.storm = Math.min(env.storm, 0.1); }
    // islands with their own permanent weather (Evil Black Drum, Punk Hazard…)
    const wx = game.currentIsland?.def?.weather;
    if (wx) {
      if (wx.storm) env.stormTarget = Math.max(env.stormTarget, wx.storm);
      if (wx.snow) env.snow = Math.max(env.snow, wx.snow);
    }
  });

  // ---------------------------------------------------------- fog banks
  game.on('characterStart', () => {
    game.fogRegions = [];
    for (const isl of game.surface.islands) {
      const d = isl.def;
      if (!d || !d.name) continue;
      if (d.fog) game.fogRegions.push({ x: isl.x, y: isl.y, r: d.fog.r ?? isl.radius + 80, density: d.fog.density ?? 0.7 });
      else if (d.climate === 'gloom') game.fogRegions.push({ x: isl.x, y: isl.y, r: isl.radius + 90, density: 0.75 });
    }
  });

  // ---------------------------------------------------------- sea names
  game.seaName = (x, y) => REGION_INFO[regionAt(x, y)]?.name;
  void isGrandLine; void REGION;
}
