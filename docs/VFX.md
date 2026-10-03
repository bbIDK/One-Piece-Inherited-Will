# VFX style bible and spec

How combat effects look in this game, and the technical rules they are built
to (and, in section 10, the sky and the weather). Every effect in the 3D view is drawn by one layer, `src/render3d/vfx/`,
from the state the fx engine keeps (`game.fx.shapes`, `game.fx.parts`, the
combat projectiles). Gameplay code says *what* happens (`fx.add('impact', …)`,
`fx.burst(…)`, `fx.ring(…)`); this layer decides how it looks. If an effect
here breaks one of the rules below, it is the effect that is wrong.

## 1. The look in one paragraph

One Piece in motion: **bold silhouettes, flat colour, hard edges, a white-hot
heart**. Every effect is cel-shaded: two or three flat tones separated by hard
bands (not soft photographic gradients), a bright core, a saturated body, a
darker or inked rim. Shapes are graphic and readable from across a fight:
spiky impact stars, crisp crescents, jagged lightning, round billowing smoke,
faceted ice. Effects pop in almost instantly and decay slowly. Glow exists, but
only as a soft halo *behind* a hard shape, never as the shape itself.

## 2. Anatomy of an effect

| Part | What it is | How it is drawn |
|---|---|---|
| **Core** | the hottest part: the heart of a flame, the middle of a beam, the centre of an impact star | the element's core colour (usually white or pale gold) multiplied 1.7–2.4× (HDR, so the bloom on 'high' catches it); mostly additive |
| **Body** | the element's colour, flat | the colour as given (×1.0–1.15); half covering, half additive |
| **Rim** | the edge: darker and warmer for fire, paler for ice, purple for darkness | a hard band (smoothstep about 0.05 wide) at the shape's edge |
| **Ink** | a dark outline on impact stars, cracks, solids | near-black (0.07, 0.04, 0.05), never additive; solids get the world's ink pass because they write depth |
| **Halo** | a soft glow behind the shape | a GLOW sprite at 1.2–2.2× the shape's size, alpha ≤ 0.55, drawn *before* the hard shape |

Blending is premultiplied with an **additive weight `w`** per fragment:
`w = 0` covers (smoke, ink, darkness, solids), `w = 1` adds light (cores,
sparks, glints). Light colours add; **black never adds** — anything dark
(darkness, Haki's black lightning, black shockwaves and rings, dark sparks) is
forced to `w = 0` and inked on.

## 3. Shape language and colour by element

Colours come from the element table in `src/render/combatfx.js` (`ELEM`); the
layer adds the cores and rims. Hex values are the body colours.

| Element | Body | Core | Shape language | Never |
|---|---|---|---|---|
| Physical (fists, kicks) | cream `#fff3e0`, white | white | inked spiky impact star, shock ring flung across the line of the blow, 5–10 speed lines, dust kicked off the ground | glowing blobs |
| Slashing (swords) | `#e3f2fd` (Santoryu `#e8f5e9`, oni `#ff1744`) | white | crisp crescent smear, solid body fraying at its inner edge, a hot leading edge line, a thin cut line, sparks | soft wide trails |
| Fire (Mera) | `#ff7043` | gold `#fff3c4` | cel flame tongues in three hard bands (red rim, orange body, gold heart), embers rising, scorch with cooling embers; big fire is a ball rolling in gentle bumps with a crown of tongues round its edge (Entei is a sun, gold heart) | white-out, smooth gradients |
| Magma (Magu) | `#ff5722` | `#ffab40` | dark rock crust with glowing cracks, red-orange fire, black smoke | clean bright fire |
| Lightning (Goro) | `#fff176` | white | jagged strands zig-zagging in 3D with forks, a small flash where they strike, crackle round the body; Sango is a serpent of light; El Thor is a storm cloud high above (wide, dark, roiling, lit from inside), a bundle of jagged bolts out of it, a shock ring over the ground and a scorched crater | straight lines, blobs, columns of white light |
| Light (Pika) | `#fff59d` | white | beams as tubes with energy streaming down them, star glints, a flare where they leave | smoke |
| Ice (Hie) | `#b3e5fc` | white glint | faceted crystals: deep-blue shadows, pale sunlit facets, cyan rim, one hard glint; frost decals, frost mist, tumbling shards; Pheasant Beak is a bird of ice feathers | additive glowing ice |
| Darkness (Yami) | `#311b92`, `#7e57c2` | none | voids: near black, the fraying edge lit purple; the Black Hole is a black pool with a ragged bright fringe and darkness welling up | additive purple, matte purple balls |
| Quake (Gura) | `#e0f7fa` | white | cracked air (glass lines hanging in space), white rings and shock bubbles, ground cracks heaving up rocks | — |
| Sand (Suna) | `#e1c16e` | `#fff3c4` | funnels of wound streaks, grains, sand spikes, two-tone dust | glow |
| Water, fish-man | `#4fc3f7` | white highlight | drops as streaks, glossy shells, ripples | — |
| String (Ito) | `#f8bbd0` | white | taut thin threads fanning out; Overheat is a red-hot rope of three twisting strands shedding embers | thick glow |
| Haki | black `#1a1a1a`; Conqueror's in the king's own colour (`game/haki.js`: crimson `#ff1a3c` most often, violet, gold, azure, amber, rose, emerald, white, cyan; the Emperors' from their NPC definitions) | that colour | Conqueror's: black lightning inked with a heart of the king's colour (a bolt's `core`), black and coloured rings, cracked ground, the impact frame; a clash: the two colours' strands meeting and a rift of black lightning up into a band of dark cloud (`clash`). Armament is the body's own (`chars/haki.js`, `mats.js`): lacquered black spreading up from the fingertips, a ripple at its edge, a hard glint, a rim in the character's sheen; Ryou a black shockwave out of the far side. Observation: a sonar ring in the senser's pale tint, hostile wills glowing through walls (`senseMaterial`) | additive black, a flat black coat |
| Ope (Room) | `#81d4fa` | ice-blue rim and lines `#e1f5fe` | a translucent pale-blue dome where it was cast, a thin bright rim at its skin and base, lines over it, a faint square grid on its floor, a scan ring sweeping out | following the caster |
| Smoke, gas, dust, storm clouds | as given (storm `#37474f`, underside `#263238`) | — | round billows, two tones lit from the sun's side, fraying away as they thin; storm clouds wide and flat, high up | flat discs, boulders hanging low |
| Gomu (rubber) | white lines, cream `#fff3e0` | white | the arm is the character's own (its rig); the effect is speed lines whipping along the stretched arm, and where it lands a DON: an inked star with a white-hot heart, a rubbery wobbling shock ring, speed lines rushing in on the line of the punch | a fist or arm drawn by the effect |

## 4. Timing: fast attack, slow decay

| Phase | Rule |
|---|---|
| Attack | 0–25 % of life (impacts 0.03–0.06 s), ease-out, may overshoot; impact stars and flares reach full size in the first 20–25 % |
| Hold | at most to 30 % of life |
| Decay | the rest: alpha falls *and* the shape erodes (noise threshold rising with age `k`), never a plain linear fade of a static image |
| Rings, shockwaves | radius eases out (`1 − (1 − k)²`); thickness thins to 40 % |
| Areas (zones, domes) | grow in over 0.3–0.35 s, then hold; fade over their last 0.35 s |
| Explosions | the fireball swells over the first 35 % then boils away rising; the shock bubble races out over the first 45 % |

Hit-stop, slow motion, screen shake, impact frames and focus lines are the
combat code's (`fx.stop`, `fx.slowmo`, `fx.impactFrame`, `fx.focus`): effects
must not try to fake them.

## 5. Texture, noise and erosion

- **No per-effect textures.** One shared 128² tiling noise texture: R, G, B are
  value-noise octaves at rising frequencies (lattices 4/8/16, 8/16/32,
  16/32/64), A is cellular (6×6 jittered points). Everything is drawn by the
  fragment shader from its kind.
- **Erosion:** shapes are cut by a threshold on `distance-field + noise`; the
  threshold rises with age (`k^1.5` for smoke, linear for fire), so effects
  tear apart as they die. Solids crumble with a noise dissolve.
- **Bands:** cel bands are `smoothstep` pairs about 0.05–0.07 wide. Two or
  three bands, never more.
- **Scroll:** noise scrolls along the effect's own flow — up a flame, down a
  beam (fast: 3.5 units/s), back along a trail, round a funnel.
- **Fog** is the world's own (computed per vertex, the same formulas as
  `render3d/fog.js`); additive parts fade out in fog rather than greying.

## 6. Camera rules

| Rule | First person | Third person |
|---|---|---|
| Near fade (by distance from the eye, not depth) | gone within 0.75 m, full at 1.3 m | 0.25 m → 0.8 m |
| Flash cap: a glow, glint or impact star's half-size at most × its distance | 0.45 | 0.9 |
| Hit flashes pulled toward the camera (keeping their size on screen) so a body in between doesn't hide them | 0.6 m (never into the near fade) | 2.6 m |
| Screen-filling sprites and balls give up their HDR and most of their added light | yes | yes |
| Your own shots | swell to full size and fade in between 0.6 m and 2 m from the eye; your own beams start up to 1.4 m out | — |
| Effects centred on your own body (flares, impact stars, cracked air, claw rakes, air rings, Room cubes) | skipped: the screen extras (edge flash, aura, swing smear) stand in | drawn |

## 7. Technical spec and budgets

| Batch | What | Cap | Draw calls |
|---|---|---|---|
| sprites | instanced camera-facing quads: every particle and the billboard parts of shapes (17 kinds) | 1400 | 1 |
| ribbons | polylines widened on the GPU (8 kinds: glow, line, tube, crack, speed, fire, smoke, thin) | 16384 vertices, 64 points a ribbon | 1 |
| surfaces | CPU-built triangles: smears, bands, walls, ground decals, telegraphs, zones, barriers | 24000 vertices | 1 |
| shells | instanced spheres (bubble, fire, dome, dark, orb, water, goo) | 160 | 1 |
| tubes | instanced open cylinders (beam, pillar, funnel, fire, dark) | 96 | 1 |
| solids | opaque lit instanced meshes: crystals, shards, rocks, fists | 640 / 640 / 320 / 96 | 4 |
| ghosts | afterimages: skinned copies of the 3D bodies | 28 | 1 each |

- **9 draw calls** for everything (batches hide while empty), plus one per
  live afterimage. No THREE lights: lit things (smoke, solids, goo) use the
  sun direction and colours from shared uniforms.
- **Zero allocation per frame:** preallocated typed arrays, partial buffer
  uploads (`updateRanges`, reused range objects), per-shape records from a
  pool, colours parsed once and cached, scratch vectors at module level, no
  closures made per frame. A new effect follows the same rules.
- **Overdraw:** no more than two or three full-screen layers at once. Thin
  ribbons over wide sprites; halos small and faint; the flash cap and the
  taming above keep a point-blank blast from covering the screen.
- **Shaders compile in the warm-up** (`Renderer3D.warmUp`): the batches are
  shown for the compile even when empty, and an afterimage of the player is
  made for it, so the first big technique or dash doesn't stall.
- **Quality tiers:** 'high' has the bloom (it catches the HDR cores) and the
  ink pass. 'low' has neither (cores clamp to white) and the layer also drops
  shockwave walls, air-ring bubbles, frost decals and crack debris, and halves
  shard particles.
- **Failure is contained:** a shape type whose drawing throws is switched off
  (and logged once) and falls back to the 2D overlay; the rest carry on.
- **Measured** (third person, an open field, the game stepped at a fixed
  1/60 s under a steady storm of impacts, sparks, dust, rings, smears, beams,
  lightning, fire, smoke, shards, ice spikes, a Room and projectiles; JS time
  per frame for all the effects, the 3D layer on against the same build with
  it switched off so the 2D overlay draws everything as before):

  | Storm | Shapes / particles | Effects JS, 3D layer | Effects JS, 2D overlay | Draw calls |
  |---|---|---|---|---|
  | light | 13 / 115 | 1.09 ms (layer 1.02 + overlay 0.07) | 1.52 ms | 354 vs 336 |
  | heavy (×4) | 48 / 460 | 1.47 ms (layer 1.40 + overlay 0.06) | 5.74 ms | 332 vs 367 |

  In a busy town with no fighting the layer costs 0.05 ms a frame. (GPU time
  under the headless software renderer isn't comparable with a real GPU;
  compare draw calls and JS time.)

## 8. What stays 2D

The 2D overlay (`src/render/fx3d.js`) keeps the floating damage numbers, sound
words and callouts, and the first-person screen extras (swing smear, edge aura,
hit-side flash, focus lines). It also still draws any shape the 3D layer
doesn't claim, and everything in the top-down 2D view.

## 9. Adding or changing an effect

1. Say *what* in game code with an existing shape type and options; add a new
   shape type only for a new *form*. Its handler goes in
   `src/render3d/vfx/shapes.js` (`SHAPES.<type> = { draw(v, s, k, a) }`).
2. Build it from the batches above; pick colours from the element table,
   core white or pale gold, rim per section 3.
3. Follow the timing rules (attack ≤ 25 %, erode on the way out).
4. No allocations in `draw`; respect `v.low`; dark colours never add.
5. Look at it in both views, at several moments: `node tools/shot.mjs
   combat-3d --mode=first|third [--ids=…]` and `combat-parry`.

## 10. Sky and weather

The sky, the light, the sea and the weather's effects are one system, driven
by the weather in `game/env.js` (which is the place's: `game/weather.js`).
The sky is drawn by `render3d/sky3d.js`, the rain, snow, ash, blown sand and
lightning by `precip3d.js`, the mists by `mist3d.js` and `fog.js`, the sea by
`water3d.js`.

### The look

Anime skies, not photographs: a clean blue gradient; fair-weather cumulus cut
crisp out of the shared noise and cel-shaded in three flat tones (sunlit white
tops, blue-lavender shade, a flat darker base), a silver lining toward the
sun; and weather that takes the whole sky over. References: the One Piece
anime's Grand Line skies (big white cumulus over a deep blue sea; slate storm
masses with jagged white lightning; Wano's red skies; Egghead's clean, pale,
shadowless light); The Wind Waker (cel bands, a sky that turns grey-purple in
a storm); Sea of Thieves (storms you see coming as a dark mass on the horizon,
rain hanging under it, the sea darkening and rising inside it, lightning
animated as a leader then a stroke; distant clouds alpha-cut crisp, nearer
ones softer — SIGGRAPH 2018 "The Technical Art of Sea of Thieves"); Breath of
the Wild (the world split into areas tied to climates, each with its own odds
for every kind of weather; rain turns to snow where it's cold; rainy skies
cast almost no shadow); Genshin Impact (hard-edged, vector-clean shapes over
soft gradients).

### Layers, back to front (one pass over the sky's own pixels)

| Layer | When | How |
|---|---|---|
| Gradient | always | zenith to horizon, by time of day; greyed by the overcast (soft grey in rain, slate in a storm), browned low by dust, whitened by snow, deeper blue in the heat |
| Sun | by day | a hard disc and glow; under cloud the disc goes and a broad pale glow is left; dust reddens and dims it |
| Stars | at night, clear | three layers on a sphere turning round the pole (many faint, some brighter, a few bright and HDR), each a 1–2 pixel point sized by the pixel's footprint, gently twinkling (more near the horizon), tinted blue-white to warm; fading at dusk, behind cloud and in overcast, and near the moon |
| Milky Way | at night, clear | a soft clumpy band round a great circle with a dark rift, more stars in it |
| Moon | at night | a disc lit in its phase (`env.moonPhase`: full every eighth day), the dark side faint with earthshine, darker seas, a halo; its light dims with the phase |
| Aurora | the New World's and the poles' nights | green-to-violet curtains low in the north |
| Horizon banks | always | distant cloud banks: flat bases, lumpy tops, melting into the haze |
| Cumulonimbus | a storm (and before it arrives) | a dark tower on the horizon upwind (`env.front`, `env.frontAngle`) spreading into an anvil, lit from inside by its lightning; it rises first, the deck then spreads across the sky from its side, and its body stays in sight under the deck until the storm is overhead |
| Cumulus | fair to cloudy | the fair-weather layer, cover from `env.cloud`, drifting on the wind (a frame at a time: a change of wind never makes them jump) |
| Deck | overcast | a soft grey sheet in the rain with faint billows; in a storm one dark mass — heavy billows cel-shaded in slate (storm `#37474f`, underside `#263238`), dark bodies with their tops rimmed in what light there is, an even dark between them |
| Scud | a storm | low, ragged, dark fragments racing under the deck |
| Rain shafts | rain far off, under a storm's tower | grey curtains hanging to the sea |
| Lightning | a storm, dry lightning | the bolt's direction and strength (`env.strike`, `env.lightning`) light the clouds from inside, those toward it most |

Above the clouds (the sky islands) a sea of cloud lies below the horizon and
only cirrus overhead. Under the sea and in the prison there's no weather.

### Weather and the rest of the world

- **Light**: under cloud the sun dims (×(1 − 0.72 × overcast)) and its
  shadows fade away (shadow intensity to 0.15); the hemisphere light rises a
  little so it's grey, not black. `env.ambient` darkens with the storm, cloud,
  fog, dust and ash, and takes an odd sky's colour.
- **Grading** (on 'high'): flatter and cooler under cloud (saturation down to
  −14 %, −8 % more in a storm), richer in the heat.
- **Sea**: under a grey sky it turns a dark grey-green, slate in a storm;
  caustics and the sun's glitter go; rougher in rain. In the Calm Belt it goes
  glassy: the swell all but gone (×0.15), the ripples ×0.2, a mirror for the sky.
- **Fog**: closes in with the storm, rain, snow and dust.
- **Lightning**: a few strokes flickering in quick succession (`env.pulses`);
  mostly flashes in the cloud, now and then a fork to the sea — a jagged main
  channel (midpoint displacement) and branches dying in the air, a white-hot
  HDR core and a violet-blue glow, the leader running down in 0.07 s before
  the stroke flashes. A near strike lights the world (the ambient), a far one
  only its clouds. The thunder's delay and dullness come from the distance.
- **Precipitation**: rain (drizzle to downpour, slanted by the wind), snow
  (a whiteout in a blizzard), ash (the snow's flakes, grey), and sand blowing
  along the ground in streaks on a desert wind.

### Mists

The weather's mists are in the world, never laid over the screen, and come
and go with it (`env.mistDust`, `env.mistSnow`, `env.mistRain`; spray from the
storm and wind at sea):

| Mist | Colour | Thickness at the ground | Thins with height | Cards |
|---|---|---|---|---|
| Desert dust (dust, sandstorm) | warm ochre | 0.04 /m | 0.03 /m | wide, low, streaky, fast on the wind; sand streaks along the ground; the whole sky veiled ochre, the light warmed |
| Snow fog (snow, blizzard) | white-blue | 0.034 /m | 0.045 /m | round puffs blowing |
| Rain mist (heavy rain, storms) | grey | 0.012 /m | 0.045 /m | tall veils, slow |
| Sea spray (a storm at sea) | white | 0.02 /m | 0.35 /m | low and quick, only over the water |

Two parts: a second layer in the fog (`fog.js` `fogMist`), integrated along
each ray like the haze — thinning with height above its floor, never thicker
below it — and broken into banks drifting with the wind (two taps of the
sky's noise where the ray ends); and soft cards of mist drifting along the
ground round you (up to 40, one draw call, faded near the eye and far off).
The layer's floor is the low ground round you (the lowest of 16 points
30–70 m out, looked for a few times a second, eased): it lies on the
snowfields and in the valleys and climbs the cliffs from there, so under
the Drum Rockies the snow fog reads up their faces, and from the top of
Drum Rock you look down on it lying over the land. None indoors, below
decks or under the sea. An island's own permanent snow (Drum's
`weather.snow`) falls from its own grey sky: the env brings the clouds.

### Regional weather (`game/weather.js`)

Each sea and each charted island has a climate: the odds of each kind of
weather, how long it lasts, how hard it comes. Near a charted island (230 m
past its coast, let go at 300 m) its own climate takes over; the little
uncharted islets keep the sea's. Crossing between mild climates keeps the
weather; anything else rolls the new place's at once, and every field still
eases over (clouds in ~14 s, out in ~22 s; rain and snow follow the clouds
and stop before they clear; storms in ~9 s; a storm's tower shows on the
horizon first).

| Climate | Weather | Lasts |
|---|---|---|
| East Blue | mild: mostly clear and fair, cloudy days, the odd shower or squall, rarely a storm | 2–4 min |
| North Blue | greyer: cloud, rain, fog, flurries | 2–4 min |
| West / South Blue | fair; the South warmer, with squalls and sun-showers | 2–4 min |
| Paradise | erratic: any weather after any other — sudden storms and squalls, sun-showers, snow from a clear sky (and the Grand Line's tricks: the wind swinging round, rogue waves) | 25–80 s |
| New World | extreme: violent storms most of all, a red sky at noon, dry lightning under violet cloud, the aurora by night | 20–65 s |
| Calm Belt | dead calm: no wind at all, no waves, a glassy sea | — |
| Winter island | snow, flurries, blizzards, grey days, a clear cold one now and then | |
| Summer island | hot and clear, tropical squalls | |
| Desert island | heat, blowing dust, sandstorms; never rain | |
| Spring / autumn | fair and mild / grey and wet, foggy | |
| Volcanic | ashfall, smoky grey | |
| Gloom (Thriller Bark…) | fog and overcast | |
| Sky island | above the clouds: always clear | |

`env` keeps the fields the rest of the game reads (`rain`, `snow`, `storm`,
`stormTarget`, `fog`, `windStrength`, `windAngle`, `lightning`, `ambient`,
`clock`…) and adds `weather` (the kind), `forecast` (its name), `climate`,
`island`, `cloud`, `dust`, `heat`, `ash`, `calm`, `odd` + `tint`, `aurora`,
`front` + `frontAngle`, `strike`, and the mists. Anything that wants a storm
still raises `stormTarget` and gets clouds, rain and lightning with it; a test
or a multiplayer guest pins the weather with `weatherTimer = 1e9` (the guest
takes the host's kind). `env.setWeather(kind, { now, hold })` sets it outright
(creative mode: `weather <kind>`).

### Budgets

PERF_TABLE

'low' quality: the sky's LOW define leaves out the scud, rain shafts, the
tower's fine detail, the Milky Way, the aurora and two of the three star
layers, and lights the deck's billows flat; the mist's layer is unbroken and
it has 40 % of the cards; rain, snow and sand have half the drops.

Look at it with `node tools/shot.mjs skyweather` (each kind of weather from
Foosha's pier, a lightning strike, a storm coming up, the night sky and the
moon, Drum in snow and Alabasta in dust; `--looks=kind@clock:view,…` for any
other, `--quality=low` for the plain sky) and `weather`; the rules are tested
in `tests/weather.test.mjs`.

## 11. Forms, Haki and the screen

Transformations and the big Haki moments follow the anime's own looks rather
than a generic glow. A power-up aura (the lathe shell in `chars/fx.js` Aura)
is for powers that really glow; a form that doesn't gets `fpTint` on its buff
instead (it still tints the edges of your own view in first person) and its
look on the body: `src/render3d/chars/forms.js`.

| What | How it reads |
|---|---|
| Gear Second | skin flushed pink (the buff's look), a steady pour of thin steam off shoulders, arms, back and legs (`combatfx.js bodyFx`), the Enies Lobby crouch |
| Gear Third | every punch thrown on a fist blown up like a balloon (`formRig` → `o.infR / o.infL`), in Armament's black once the user has it |
| Gear Fourth (Boundman) | a huge round muscular upper body (`bulk 1.85, muscle 1.2`), arms and legs coated, the coat licking out over shoulders and chest in tongues of flame (`uFlame`, `uTorso` in `chars/mats.js`), hair on end, a collar of steam pouring back off the shoulders (`Collar` 'steam'), the bounce (`anims.js gear4Bounce`) |
| Gear Fifth | white hair, clothes, a purple sash, red eyes; a fat ring of cel-shaded cloud round the neck (`Collar` 'cloud'), wisps off the hair |
| Doppelman | the owner's own shape (`npcs.js shadowLook`), drawn flat black with a dim violet edge and no face (`uShadow`), rising out of the ground and sinking back (`shadowRise`), dark wisps and afterimages; the owner casts no shadow while it's out |
| Future Sight | a red outline round the seer (`uRimFx`); each vision: the foe flickering in ahead of themselves in the seer's tint, scanlined and torn (`ghosts.js` uGlitch), a star where it lands, and the view drained of colour a blink (`fx.visionFlash`) |
| Conqueror's | a dark dome of will blasting out to its reach, its edge burning in the king's colour (`SHAPES.haoshoku`, shell `VK.HAKI`), black lightning with that colour glowing round it (two passes: halo, then the black strand) crackling on round the body, the ground cracked; a two-tone impact frame in black and that colour, the air rippling out from them (`fx.screenShock`) and the edges of the view closing in dark (`fx.pressure`) |
| Gatling | real rubber arms from both shoulders, fists on their ends, two fainter copies trailing each (the blur of a dozen arms); giant for Elephant and Dawn, Armament-black for Kong Organ |

The whole-view effects live in the post pass (`render3d/post.js`:
`uShock`, `uPress`, `uVision`, the impact frame); the page-wide CSS impact
filter is only the fallback with no post pass.

Look at them with `node tools/shot.mjs haki-3d`, `combat-3d --ids=…` and the
form looks in third person close up.
