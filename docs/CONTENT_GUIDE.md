# Content guide — islands, NPCs, quests

This is how the game's world content is written. Islands are **data** and are
turned into tiles by the island generator. People, bosses, quests and story
events are **content packs**. Everything is plain ES modules. There is no
TypeScript and no framework.

The reference implementation is the East Blue:

- `src/data/islands/eastBlue.js`: island data.
- `src/content/eastBlue.js`: content pack.

Read both before you write anything.

## 0. Files and ownership

| Region | Island data | Content pack |
|---|---|---|
| East Blue | `src/data/islands/eastBlue.js` (`EAST_BLUE`) | `src/content/eastBlue.js` |
| North Blue | `src/data/islands/northBlue.js` (`NORTH_BLUE`) | `src/content/northBlue.js` |
| West Blue | `src/data/islands/westBlue.js` (`WEST_BLUE`) | `src/content/westBlue.js` |
| South Blue | `src/data/islands/southBlue.js` (`SOUTH_BLUE`) | `src/content/southBlue.js` |
| Paradise, first half (Reverse Mountain → Jaya / Skypiea / Long Ring Long Land) | `src/data/islands/paradise1.js` (`PARADISE_1`) | `src/content/paradise1.js` |
| Paradise, second half (Water 7 → Sabaody) + Calm Belt | `src/data/islands/paradise2.js` (`PARADISE_2`) | `src/content/paradise2.js` |
| New World, first half (Fish-Man Island → Punk Hazard, Dressrosa, Zou, Whole Cake…) x 90..1000 | `src/data/islands/newWorld.js` (`NEW_WORLD`) | `src/content/newWorld.js` |
| New World, second half (Wano, Egghead, Elbaf, Hachinosu… Laugh Tale) x 1000..1880 | `src/data/islands/newWorld2.js` (`NEW_WORLD_2`) | `src/content/newWorld2.js` |
| Zones (Skypiea, Fish-Man Island, Impel Down) | `src/data/zones/index.js` (engine-owned) | the NPCs go in the pack of the matching sea |

All of these are already imported by `src/data/islands/index.js` and
`src/content/index.js`, so you only ever edit your own two files.

**Never edit shared engine files**, such as `items.js`, `trainers.js`,
`npcs.js` or `game.js`. Content packs can add registry entries themselves;
see §6. If you need an engine feature, list it in your final report.

## 1. The world and where islands may go

The world is 4096 × 2048 tiles and wraps east↔west. One tile is roughly one
person wide.

```
x →      0 ........................ 2048 ........................ 4096 (= 0)
y=0      polar ice (y < 66 is off-limits)
         NORTH BLUE  (x 90..1850, y 66..700)   | EAST BLUE  (x 2250..4000, y 66..700)
752      ───────────── Calm Belt (y 752..824) ─────────────
824      NEW WORLD   (x 90..1880, y 830..1218) | PARADISE   (x 2215..4000, y 830..1218)
1224     ───────────── Calm Belt (y 1224..1296) ───────────
         WEST BLUE   (x 90..1850, y 1350..1980) | SOUTH BLUE (x 2250..4000, y 1350..1980)
y=2048   polar ice (y > 1982 is off-limits)
```

**Red Line.** Two vertical walls of rock, each about 92 tiles wide. One is
centred on x = 2048; the other is on the seam at x = 0 ≡ 4096.

**Reverse Mountain.** The massif around (2048, 1024) covers x 1890..2206 and
y 634..1414, with its margin included. Its canal mouths open into each Blue at
(2198, 706) for the East Blue, (1898, 706) for the North Blue, (1898, 1342)
for the West Blue and (2198, 1342) for the South Blue. Its exit into Paradise
is at (2198, 1024), where the Twin Cape lighthouse should stand.

**Mary Geoise.** It sits on the seam at y ≈ 1024. The Red Ports sit at
x ≈ 4054 (Paradise side) and x ≈ 42 (New World side). Keep every island more
than 60 tiles away from them.

**Paradise.** It runs west → east from Reverse Mountain (x 2200) towards
Sabaody and Mary Geoise (x ≈ 4000).

**New World.** It runs west → east from the New World side of Mary Geoise
(x ≈ 100) to Laugh Tale, which lies just before Reverse Mountain
(x ≈ 1800).

Use the canon route order along the x axis.

### Placement rules

The validator enforces all of these:

- An island's `sea` must match the region its centre lies in. Use one of
  `east_blue`, `north_blue`, `west_blue`, `south_blue`, `paradise`,
  `new_world` or `calm_belt`.
- Keep at least a **24-tile gap** between the bounding boxes of any two
  islands, measured across all seas.
- No part of an island may come within 22 tiles of the Red Line band or the
  Reverse Mountain box.
- **Sizes.** An islet is 30–50 tiles across and a normal island 80–160.
  Large countries, such as Alabasta, Dressrosa, Wano or Whole Cake Island,
  are 200–320 wide. The largest reach 380 × 260. Give 1–4 towns to each
  island that matters.
- Existing East Blue islands are listed in `src/data/islands/eastBlue.js`.
  Look at the other seas' files before placing near a border.

## 2. Island definition

```js
{
  id: 'whisky_peak', name: 'Cactus Island', sea: 'paradise',
  x: 2420, y: 980, w: 120, h: 90,         // centre + size in tiles
  climate: 'temperate',                   // temperate spring tropical jungle winter desert autumn volcanic
                                          // sakura candy gloom sky undersea rocky mangrove marsh prehistoric
  rough: 0.25,                            // coast noise, 0..0.45
  blobs: [[0,0,0.8,0.8],[0.5,-0.4,0.4,0.4]], // land blobs: [dx, dy, rx, ry] (relative, see below)
  archipelago: true,                      // keep separate land bits (else only the largest survives)
  ring: 0.45,                             // lagoon hole in the middle (atolls, Sabaody's ring)
  ground: T.X, beach: T.X,                // override the climate's tiles (import { T } from '../../world/tiles.js')
  mountains: [{ name: 'Cactus rock', dx: 0.1, dy: -0.2, r: 0.25, h: 0.9 }],
  areas: [{ name: 'Graveyard', tile: T.GRAVEL, dx: 0.3, dy: 0.2, rx: 0.2, ry: 0.15 }],
  lakes: [{ dx: 0, dy: 0, rx: 0.1, ry: 0.1, tile: T.POND }],   // tile may be T.LAVA, T.ACID…
  rivers: [{ points: [[0,-0.3],[0.1,0.2],[0.2,0.9]], width: 3 }],
  paint: [{ op: 'path'|'rect'|'circle'|'ring'|'blob'|'grid', ... }], // see islandgen.js paintOp
  trees: ['palm','oak'], treeDensity: 0.05, forestTrees: [...],
  towns: [ ...see §3 ],
  docks: [{ dx: 0, dy: 0.6, dir: 's', len: 6, name: 'Harbour' }], // optional; default = one per town (town.dockDir)
  landmarks: [{ kind: 'lighthouse', dx: -0.6, dy: 0.4, name: 'Twin Cape Lighthouse', spot: 'lighthouse' }],
  spots: [{ id: 'duel_ground', dx: 0.2, dy: -0.3 }],
  logNext: ['little_garden'], logTime: 1, // Grand Line only (§5)
  danger: 3,                              // 1 (East Blue) … 10 (Laugh Tale); flavour + encounter tuning
  tagline: 'The town that welcomes pirates… a little too warmly.',  // banner text on arrival
  music: 'town',                          // title sea grandline battle town night
}
```

- **Relative coordinates.** A `dx`, `dy`, `r`, `rx` or `ry` whose absolute
  value is at most 1.5 is a fraction of the island's half-extent. So `dx: 1`
  is the east edge and `dy: -1` is the north edge. Larger values are raw
  tiles.
- **Tile ids.** `T.GRASS SAND DIRT FOREST JUNGLE SNOW ICE DESERT ROCK MOUNTAIN
  CLIFF STONE COBBLE PLANK FARM FLOWERS SAKURA CANDY ISLAND_CLOUD CORAL
  MANGROVE ASH MUD MARBLE WALL GOLD BONE RAIL BRIDGE GRAVEL LAWN CAKE SEAFLOOR
  CARPET TATAMI STEEL`.
  - Liquids: `T.SEA RIVER CANAL POND LAVA ACID CLOUD_SEA`.
  - Not walkable: `MOUNTAIN CLIFF RED_ROCK WALL SNOWROCK`. Do not paint these
    where people must walk.
- **Landmark `kind` values that have sprites:** `lighthouse`, `windmill`,
  `tent`, `campfire`, `statue`, `torii`, `grave`, `chest`, `cannon`, `bench`,
  `dummy`, `boat`, `bell`, `pillar`, `bubble`, `sign`, `arch`, `ruins`,
  `bones`, `anchor`, `fence`, `well`, `fountain`, `flagpole`, `stall`,
  `platform`, `barrel`, `crate`, `haystack`, `lamp`, `lantern`, `mooring`,
  `building` and `poneglyph`.
  - A `building` landmark stands alone outside towns. It takes `role`,
    `name`, `npc`, `fw`, `fd`, `hgt`, `wall`, `roof`, `roofType` and `style`.
  - `poneglyph` takes `poneglyph: '<id>'`, `name`, and `road: true` for Road
    Poneglyphs.
  - A landmark with `spot: 'x'` also defines spot `x` just in front of it.
- **Spots** are named positions for NPCs, enemy groups, quests and events.
  They may sit offshore; use that for sea events.

### Special ids the engine looks for

Use these exact names:

- Jaya: spot `knock_up_stream`, offshore about 30–50 tiles south of the
  island. The Knock Up Stream to Skypiea.
- Sabaody: a shipwright building that offers ship coating, and spot
  `fishman_dive` in the sea just west of the Red Line, around x 3990–4000.
- Impel Down, a surface island in the southern Calm Belt: its dock is the
  prison gate.
- Laugh Tale: island id `laugh_tale` with `hidden: true`. It is shrouded
  until four Road Poneglyph rubbings are collected.

## 3. Towns

```js
towns: [{
  id: 'nanohana', name: 'Nanohana', dx: -0.4, dy: 0.2, w: 60, h: 40,   // tiles (or fractions ≤1.5)
  style: 'desert',       // village town port city desert snow wano sky candy fishman marine noble
                         // spooky future tribal chinese mink giant ruins
  walls: true, dockDir: 's'|'n'|'e'|'w'|'ne'|'nw'|'se'|'sw', plaza: 'fountain'|'well'|'statue'|'flagpole'|'platform'|false, plazaR: 5,
  houses: 6,             // plain houses besides the named buildings. Leave it out and the town fills
                         // its outline (a few dozen to a few hundred); give a number and the outline is
                         // shrunk to fit what's built (grown until every named building has a lot)
  buildings: [
    { role: 'inn', name: 'Oasis Inn' },
    { role: 'shop', name: 'Spice Bazaar' },                // general store
    { role: 'shop', name: 'Navigator Supplies', shop: 'navigator_grand' },  // explicit stock id
    { role: 'weapons', name: 'Blade Smith' },
    { role: 'bar', name: 'Spiders Café', npc: 'paula' },   // npc: the owner stands at the door; entering talks to them
    { role: 'dojo', name: 'Okama Dojo', trainer: 'bon_clay' },
    { role: 'palace', name: 'Alubarna Palace', w: 14, d: 7, hgt: 5 },  // explicit footprint
  ],
}]
```

- **Roles:** `inn` (rest and respawn point), `shop`, `market`, `weapons`,
  `bar`, `tavern`, `restaurant`, `cafe`, `doctor`, `shipwright`, `dojo`,
  `trainer`, `marine_base`, `bounty`, `library` (first read gives +1
  Willpower plus lore), `palace`, `hall`, `church`, `bank`, `house`.
- **Sizes.** Buildings are 4–9 wide and 3–6 deep; `palace` is 12 × 8. A town
  needs about w × h ≥ 2.2 × the sum of (building width × (depth + 3)). The
  validator reports buildings that could not be placed, so make the town
  bigger rather than losing buildings. Typical towns are 30–70 × 22–50.
- **Owners.** A building's `npc` must match an NPC in your pack whose
  `at: { town, building }` points at it.

## 4. Region flavour and design rules

**Not a bandit beater.** The game must not become grinding mobs.

- Enemy groups are few, small and meaningful. They belong to a story, as a
  pirate crew or a garrison. Most islands have **no** random enemy groups.
- Progress comes from beating **named** foes and bosses. Every boss grants a
  breakthrough. Progress also comes from **trainers**, **quests** and
  **discoveries**.
- Every notable island should have:
  - a few named NPCs with real dialogue (canon characters where they
    exist),
  - ideally one quest chain following its canon arc, told from the point of
    view of *another pirate or Marine* arriving at that moment. The player is
    NOT a Straw Hat. Canon Straw Hats may appear as cameos, rivals or
    helpers, but keep that light;
  - services (inn, shop, doctor, shipwright) where that makes sense.
- **Canon accuracy matters.**
  - Use real names, titles, epithets, fruits, techniques and places.
  - Research anything you are unsure of on the One Piece Wiki, using the
    MediaWiki API through curl (WebFetch is blocked):

    ```
    curl -s "https://onepiece.fandom.com/api.php?action=query&prop=revisions&rvprop=content&format=json&formatversion=2&rvslots=main&redirects=1&titles=Whisky_Peak" \
      | python3 -c "import sys,json;print(json.load(sys.stdin)['query']['pages'][0]['revisions'][0]['slots']['main']['content'][:6000])"
    ```

  - Useful titles include `Grand_Line`, `New_World`, `Paradise`,
    `North_Blue`, `West_Blue`, `South_Blue`, `East_Blue`, `Calm_Belt`,
    `Log_Pose` and `Road_Poneglyph`, plus each island's page.
- **Boss difficulty climbs by sea.**

  | Sea | Boss level |
  |---|---|
  | East Blue | 6–17 |
  | North, West and South Blue | 8–22 |
  | Paradise, first half | 18–40 |
  | Paradise, second half | 35–60 |
  | New World | 55–100 |
  | Yonko and Admirals | 90–120 |

  The player is born with attributes around 5–8. Grand Line rookies are
  around 20–40 and New World veterans around 60–100.
- **Bounties** (`bounty` on a pirate boss plus `infamy: true`) use canon
  numbers where known. Marines and Cipher Pol agents raise the player's
  bounty when defeated: that is automatic, from their faction.

## 5. The Grand Line: Log Pose

Every Paradise and New World island that is a real stop needs `logNext`. This
is the list of island ids the needle can point to next. It also needs
`logTime`, the time to set the log: 1 means 45 seconds standing on the
island.

The first stop after Reverse Mountain is **Twin Cape**, near (2240, 1024). It
branches into the canon **seven routes**, of which Whisky Peak is one. The
routes merge again, with canon stops in canon order.

For a canon log that "takes a year", such as Little Garden's, set
`logTime: 999` and give the player an **Eternal Pose** item from a quest. An
item with `type: 'pose', target: '<island id>'` points at that island.

## 6. Content pack

```js
import { spawnNow, findActor, aggro, seaBoss, despawn, lines } from './helpers.js';
export default {
  id: 'paradise1',
  npcs: [ ...NPC defs ],
  groups: [ ...enemy groups ],
  quests: [ ...quests ],
  items: { eternal_pose_alabasta: { name: 'Eternal Pose (Alabasta)', icon: '🧭', type: 'pose', target: 'alabasta', price: 0, desc: '…' } },
  trainers: { bon_clay_2: { ... } },         // same format as src/data/trainers.js
  stock: { alabasta_bazaar: ['meat','sake','...'] }, // shop stock lists (item ids)
  archetypes: { baroque_millions: { name: 'Billions Agent', faction: 'baroque', style: 'sniper', weapon: 'gun', look: {...}, skill: 0.3 } },
  abilities: [ ...boss techniques, same format as src/content/bossMoves.js ],
  dynamicIds: ['laboon'],                    // npc ids spawned only by install() code (for the validator)
  install(game) { /* event hooks, see §10 */ },
};
```

Registry ids are global, so prefix anything that might collide.

## 7. NPC definition

```js
{
  id: 'crocus', name: 'Crocus', title: 'Keeper of the Twin Cape Lighthouse',
  island: 'twin_cape',
  at: { town: 'x', building: 'Name or role' } | { spot: 'lighthouse', ox: 2 } | { town: 'x', plaza: true, ox: -3 } | { dx: 0.2, dy: -0.1 },
  look: { hair, hairColor, skin, top, bottom, hat, hatColor, coat, coatText, scarEye, goggles, nose, bulk, scale, swords, fin, ears, fur, tail, muzzle, furFace, grin, sharpTeeth, eyeColor, belt, hand },
  race: 'human'|'fishman'|'mink'|'skypiean'|'longarm'|'longleg'|'buccaneer'|'three_eye'|'lunarian',
  level: 12,                 // attribute level (see §4 difficulty)
  faction: 'civilian'|'pirate'|'marine'|'bandit'|'baroque'|'cp'|'beast'|'rival'|'zombie'|'revolutionary',
  style: 'brawler'|'ittoryu'|'nitoryu'|'santoryu'|'black_leg'|'fishman_karate'|'rokushiki'|'sniper'|'okama_kenpo'|'electro'|'hasshoken'|'weather_science'|'elbaf'|'ryusoken',
  weapon: 'sword'|'gun'|'staff'|'axe',
  fruit: 'hana', fruitMastery: 60,  // see src/data/fruits.js ids
  moves: ['bara_cannon', ...],      // ability ids (style, fruit, haki, bossMoves or your pack's abilities)
  haki: { armament: 40, observation: 30, conqueror: 0 },
  hostile: true,             // attacks the player on sight (bosses/villains)
  boss: true, hpMul: 1.2,    // boss: big HP bar, breakthrough on defeat
  named: true,               // named mini-boss (gives a breakthrough if strong enough)
  bounty: 30000000, infamy: true,   // defeating raises the player's bounty (pirates)
  breakthrough: 3,           // attribute points on defeat (bosses)
  lethal: false,             // Marines usually capture instead of kill
  skill: 0.5,                // AI defence skill 0..1
  ranged: true, prefRange: 6,
  alert: 'Line shouted on aggro', barks: ['random lines in combat'],
  phases: [{ at: 0.5, run: (actor, game) => { actor.addBuff({ id: 'rage', name: 'Rage', dur: 60, mods: { damage: 1.3 } }); } }],
  trainer: 'bon_clay',       // makes c.open('trainer', { trainer }) default to this trainer
  doctor: { line: '"..."' }, // makes them a doctor (c.open('doctor', {}))
  ai: 'idle'|'guard'|'wander'|'hostile',
  when: (char, game) => bool,           // spawn condition (re-checked each time the island populates)
  marker: (char, game) => '!'|'?'|null, // quest marker over their head
  recruit: { role: 'cook', fighter: false, cost: 0, requires: (char, game) => bool, pitch: '"Take me with you!"' },
  dialogue: (ctx) => ({ start: 'a', nodes: { ... } }),
  respawn: false, once: false,
}
```

- **Defaults.** A boss is not respawned once beaten; it is recorded in
  `char.bosses`. Anything defeated is counted in `char.defeated[id]`.
- **Placement.** It resolves in this order: `at.spot`, then a building in
  the town, then the plaza, then any building whose `npc` is this id, then a
  landmark with `npc`, then `at.dx`/`at.dy`, then the island centre.
- **Look colours** are hex strings.
- **Hat and hair values.**
  - `hat`: `straw`, `bandana`, `tricorne`, `captain`, `cowboy`, `marine`,
    `pinkhat`, `goggles`, `headband`, `horns`, `beanie`, `crown`, `halo`
    (Skypieans get wings automatically).
  - `hair`: `short`, `messy` (Luffy-style), `spiky`, `sidefringe` (swept
    over one eye), `slick` (slicked back), `pompadour`, `long`, `wavy`,
    `bob`, `ponytail`, `twintails`, `braid`, `bun`, `topknot`, `curly`,
    `afro`, `mohawk`, `buzz`, `bald`.
- **Fight-only villains** need no dialogue, just `hostile: true`.
- **Crew recruits.** `recruit` makes them an offer: once they'd sail with
  you, a yellow ! goes over them and their conversation opens with it
  (Welcome aboard / Tell me about yourself first / Not this time), worded
  for the player's road ("Join my crew!", "Serve under my command!",
  "Partner up with me!", "Sail with me!"). A refusal is remembered and they
  can be asked again. The roles are `fighter`, `swordsman`, `navigator`, `cook`,
  `doctor`, `shipwright`, `sniper`, `musician`, `archaeologist` and
  `helmsman`.
  - Prefer canon minor characters who plausibly would join, for example
    Johnny and Yosaku.
  - You can also invent new aspiring pirates who belong on that island.
  - Never make a main Straw Hat, a Yonko, an Admiral or a Warlord
    recruitable.

## 8. Dialogue

Here `ctx` is the dialogue context:

```js
dialogue: (ctx) => ({
  start: 'a',
  nodes: {
    a: {
      text: () => ctx.quest('q') ? '...' : '...',          // string or function
      choices: [
        { text: 'Tell me more.', if: () => !ctx.quest('q'), next: 'more' },
        { text: 'I\'ll help.', do: (c) => c.startQuest('q'), end: true },
        { text: 'Shop', do: (c) => c.open('shop', { shop: 'alabasta_bazaar', building: { name: 'Bazaar', role: 'shop' } }) },
        { text: 'Bye.', end: true },
      ],
    },
    more: { text: '...', next: 'a', onEnter: (c) => { ... } },
  },
}),
```

`ctx` provides:

- Game state: `game`, `char`, `player`, `npc`.
- Flags: `flag(k)` and `setFlag(k, v = true)`.
- Items and money: `has(item, n)`, `give(item, n)`, `take(item, n)`,
  `pay(n)` (returns a boolean), `earn(n, why)` and `berries()`.
- Quests: `quest(id)` returns the state or null, plus `startQuest(id)`,
  `stage(id, stageId)` and `complete(id)`.
- Utilities: `log(text, color)`, `save()`, `emit(ev, ...args)` and
  `progression`.
- Services: `open(kind, arg)`, where `kind` is one of:
  - `shop` or `market`, with `{ shop: stockIdOrArray, building }`;
  - `inn`;
  - `doctor`;
  - `shipwright`;
  - `trainer`, with `{ trainer }`;
  - `bounty`;
  - `marine_base`;
  - `library`.

Useful shortcuts:

- `ctx.game.quests.stageId(id)` is the current stage id, or null.
- `ctx.game.quests.isDone(id)`.
- `ctx.char.bosses.includes(npcId)` and `ctx.char.defeated[npcId]`.

Text is typed out on screen, so keep each node under about 320 characters.
Use `"quotes"` for speech and `(parentheses)` for narration.

## 9. Quests

```js
{
  id: 'alabasta_rebellion', name: 'The Alabasta Civil War', island: 'alabasta', kind: 'story'|'side',
  summary: 'One line for the journal.',
  stages: [
    { id: 'meet', desc: 'Find Vivi\'s contact in Nanohana.', goal: { type: 'flag', flag: 'metKohza' } },
    { id: 'rainbase', desc: 'Infiltrate Rain Dinners in Rainbase.', goal: { type: 'reach', island: 'alabasta', spot: 'rain_dinners', r: 5 } },
    { id: 'croc', desc: 'Defeat Sir Crocodile.', goal: { type: 'defeat', npc: 'crocodile' }, onStart: (ctx, game) => aggro(game, spawnNow(game, 'crocodile')) },
    { id: 'officers', desc: 'Defeat the Officer Agents.', goal: { type: 'defeat', any: ['mr1','mr2','mr3'], count: 3 } },
    { id: 'report', desc: 'Talk to Cobra.' },          // no goal: advanced by dialogue (ctx.complete / ctx.stage)
  ],
  rewards: { berries: 50000, items: [['eternal_pose_alabasta', 1]], points: 2, bounty: 0, attrs: { wil: 1 },
             mastery: { black_leg: 3 }, haki: { observation: 5 }, liberate: 'Alubarna', flag: 'alabastaSaved' },
  onComplete: (ctx, game) => { ... },
}
```

**Goal types.**

- `defeat`: `{ npc }`, or `{ any: [...], count }`.
- `reach`: `{ island }` to arrive at the island, or `{ island, spot, r }` to
  stand near a spot.
- `item`: `{ item, n }`.
- `flag`: `{ flag }`, which completes when `char.flags[flag]` is truthy.
- `event`: `{ event }`, which completes on
  `game.emit('questEvent', name)`.
- `reachXY`: `{ x, y, r }`.
- `quest`: `{ quest }` (another quest done), optionally `alt(c, game)` for
  "or this, if that quest can't be had any more".
- `weapon`, `ship` (`{ grandLine, cannons }`), `crew` (`{ n }`), `faction`
  (`{ faction }`: `pirate` counts a founded crew), `bounty` (`{ n }`).
- `counter`: `{ event, n, label }`, which counts `questEvent`s ("pick fruit
  3/10"), shown on the tracker.
- `check`: `{ fn(char, game) }`, for anything that can be read off the
  character or the world, polled twice a second.
- `days`: `{ n }` days since the stage began.

A stage can also carry `npc` (the person the tracker and map point at) and
`where(game)` → `{ x, y, place }` (anywhere else to point at). A `defeat`
stage whose foes you've already beaten, and who will never appear again,
completes by itself.

**Advancing stages.** A stage with no goal is advanced by dialogue. The usual
last stage is `report`: "talk to the quest giver", whose dialogue calls
`c.complete(id)`.

**Starting quests.** Something must call `startQuest(id)`, usually a
dialogue choice, or `game.quests.start(id)` in `install()`. The validator
warns about quests that nothing starts.

**Rewards.** `points` are breakthrough attribute points; 1–3 for story
quests. `liberate` adds a town to the "liberation" dream counter.

**Kinds.** `kind: 'main'` is the main story (below): one chapter at a time.
The story itself is optional (a player can choose to sail their own way, or
set a road aside and take it up again). Any other quest can be abandoned
from the Quests menu and taken up again from its giver.

### The main story

The main story's chapters are data in `src/content/main/`; `mainStory.js`
turns them into quests (`mq:<chapter>:<road>`) and people. A chapter is one
island, told three ways:

```js
chapter('gl_drum', { part: 2, island: 'drum_island' }, {
  all: { name: 'Hiriluk\'s Cherry Blossoms', contact: { npc: 'p1_dalton', where: 'at his house in Bighorn' },
         tasks: [T.quest('p1_drum_kingdom', 'Help Drum Island stand up to King Wapol\'s return.', 'p1_dalton')] },
  pirate: { lure: 'a snowbound kingdom with no king…', summary: '…', meet: ['…', '…'], done: ['…', (ctx) => onward(ctx.char)] },
  marine: { … },
});
```

- `kind`: `'start'` (the prologue on a home island, begun by taking a road),
  `'stop'` (sail there, find the contact, do the tasks, report back) or
  `'solo'` (no contact).
- `contact`: a new person (`{ name, title, look, at, … }`) or one already in
  the world (`{ npc: 'kaya' }`). The story adds itself to their
  conversation.
- `tasks`: ordinary stages; `T.flag()`, `T.offer(npc, desc)` (a crewmate's
  offer: a yes or a no both complete it — the story never forces a recruit),
  `T.ship()`, `T.logPose()`, `T.quest(id, desc, giver, stageId, { alt, autoStart })`,
  `T.defeat(npc, desc)`, `T.talk(npc, desc, lines)`, `T.check(id, desc, fn)`…
- `target({...})` defines someone to hunt, who only appears while a chapter
  needs them.
- `lure` is how the previous contact describes this stop; `onward(char)`
  writes "I've set the needle for <next stop> — <its lure>".
- `PLANS[part](char, road, from, game)` decides which chapters a character
  goes through (Part 1 from their home; Part 2 from the road the Log Pose
  picks at Twin Cape; Part 3 per road).

`node tools/storycheck.mjs` checks every chapter, road, contact and target.

## 10. `install(game)` hooks

Use these for scripted events:

```js
install(game) {
  game.on('enterIsland', (isl) => { ... });          // arrived at an island (surface or zone)
  game.on('tick', (dt) => { ... });                 // every frame; throttle yourself
  game.on('knockout', (actor, attacker) => { ... }); // any actor knocked out
  game.on('bossDefeated', (actor) => { ... });
  game.on('questDone', (id) => { ... });
  game.on('talked', (npcId) => { ... });
  game.on('enterZone', (zoneId) => { ... });  game.on('leaveZone', (zoneId) => { ... });
  game.on('poneglyphRead', (id) => { ... });  game.on('crewJoined', (npcId) => { ... });
  game.on('logSet', (islandId) => { ... });   game.on('characterStart', ({ char, isNew }) => { ... });
  game.spawner.addBuilder(({ island, game, spawner, list, rng }) => { ... }); // add objects/actors when an island populates
}
```

**Game API.**

- UI and log:
  - `game.ui.toast(title, text, color)`;
  - `game.ui.banner(title, subtitle, text, seconds)`;
  - `game.log(text, color)`.
- State: `game.state.char`, `game.player` and `game.currentIsland`.
- Islands:
  - `game.surface.islands` lists island records: `{ id, name, x, y, towns,
    docks: [{ moor }], spots, def }`;
  - `game.world` is the current world, either the surface or a zone.
- Quests: `game.quests.start`, `setStage`, `complete` and `stageId`.
- Progression:
  - `awakenHaki(type, level, how)`;
  - `addHaki(type, amt)`;
  - `breakthrough(points, why)`;
  - `raiseAttr(key, n)`;
  - `addBounty(n, why)`;
  - `addStyleMastery(style, n)`.
- Other actions:
  - `game.giveShip(type, x, y, name)`, where `type` is one of `dinghy`,
    `sloop`, `caravel`, `brigantine`, `frigate`, `galleon`, `adam_brig`,
    `marine_warship`;
  - `game.fx`, `game.env` and `game.audio?.sfx(name)`.
- Helpers from `./helpers.js`:
  - `spawnNow(game, npcId, pos?)` spawns a registered NPC now;
  - `findActor(game, npcId)`;
  - `aggro(game, actor)` makes it attack and shows the boss bar;
  - `despawn(game, npcId)`;
  - `seaBoss(game, { id, name, title, level, hpMul, color, breakthrough }, x, y)`
    spawns a Sea King boss.

Guard everything: `game.state?.char` can be null on the title screen.

## 11. Existing registries

Reuse these rather than duplicating them.

- **Styles and their moves:** see `src/data/styles.js`.
- **Fruits and their moves:** see `src/data/fruits.js`.
- **Haki:** `haki_emission`, `haki_ryuo`, `haki_futuresight`,
  `haki_conqueror`, `haki_infusion`.
- **Boss moves:** see `src/content/bossMoves.js`.
- **Items:** see `src/data/items.js`.
- **Trainers:** see `src/data/trainers.js`. Many Grand Line masters are
  already defined, such as `bon_clay`, `ivankov`, `rayleigh`, `mihawk`,
  `jinbe`, `franky`, `kuja` and `hyogoro`. Place those NPCs with
  `trainer: '<id>'`.
- **Enemy archetypes for groups:** `bandit`, `pirate`, `pirate_gunner`,
  `marine`, `marine_rifle`, `marine_officer`, `swordsman`, `brute`,
  `fishman_thug`, `baroque`, `cp`, `zombie`, `beast`, `tiger`, `dinosaur`,
  `gorilla`, `pacifista`.
- **Shop stock ids:** `general`, `tavern`, `weapons_blue`, `weapons_grand`,
  `weapons_new`, `outfitter`, `navigator`, `navigator_grand`, `skypiea`,
  `fishman`, `loguetown_swords`, `black_market`.

Enemy group format:

```js
{ island, spot | dx/dy, radius, level, enemies: [['pirate', 30, { name, look, moves, hpMul }], ...], when: (char, game) => bool, leash }
```

## 12. Checking your work

```
node tools/validate.mjs        # full: generates the world (~5 s) and cross-checks everything
node tools/validate.mjs --pack=paradise1   # only report your pack's NPC/quest problems (islands are always checked)
```

- Fix every **ERROR**; warnings are advisory.
- The validator runs `when`, `marker` and every dialogue node's
  `text`/`if`/`next` against a mock state. A crash there means your code
  crashes in game.
- Also run `node --check` or `npx esbuild <file> --bundle --platform=node --outfile=/dev/null`
  on your files for syntax.
- Do not run `node tools/build.mjs` or the browser harness; the integrator
  does that.

## 13. Engine features added during content passes

- **NPC placement per quest stage.** `at` may be a function:
  `at: (char, game) => (game.quests.stageId('q') === 'x' ? { spot: 'a' } : { town: 't', building: 'B' })`.
- **Untouchable cameos.** `invulnerable: true` means the NPC can't be hit.
- **Duelists get back up.** `recover: 8` makes the NPC stand up again 8 s
  after being knocked out, at half HP and no longer hostile.
  `recoverLine: '"Good fight!"'` sets what they say.
- **Readable landmarks.** Give any landmark `lore: 'text'` (or a function
  `(char, game) => text`). It becomes examinable, and `loreLabel` sets the
  prompt. With `loreEvent: 'name'`, examining it fires
  `questEvent('name')`.
- **Landmark buildings have doors.** A `kind: 'building'` landmark with a
  `role` gets a door automatically, so `npc`/`role` services work like town
  buildings.
- **Immediate spawns.** Both helpers live in `helpers.js`:
  - `refreshIsland(game, islandId)` re-runs the island's population now, for
    example in a quest stage's `onStart`;
  - `spawnGroup(game, { island, spot | dx/dy | x/y, radius, enemies: [...], aggro: true })`
    spawns a group immediately.
- **Summons.** An ability step `{ summon: { archetype, level, count, name, look, moves, duration } }`
  calls allies. They share the caster's side and vanish after `duration` s
  or when the caster falls.
- **Bells.** Ringing a `bell` landmark fires `questEvent('rang_bell')`, then
  `questEvent('rang_bell:<bell|spot|slug-of-name>')`, then the event
  `bellRung(o)`.
- **Dock names.** A dock built for a town (`dockDir`) is named after that
  town.
- **Bouts and duels.** `duel: true` on an NPC: they never finish you off, and losing to them costs nothing.
- **Waiting.** Quest goal `{ type: 'days', n }` completes n in-game days after the stage started.
- **Local weather.** Island def `weather: { storm: 0..1, snow: 0..1 }` gives an island its own permanent weather.
