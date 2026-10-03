# VFX style bible and spec

How combat effects look in this game, and the technical rules they are built
to. Every effect in the 3D view is drawn by one layer, `src/render3d/vfx/`,
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
| Haki | black `#1a1a1a`, red `#d50000` | red `#ff1744` | black lightning inked with a red heart, dark rings, red crackle | additive black |
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
