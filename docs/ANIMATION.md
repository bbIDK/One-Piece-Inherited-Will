# Animation: the house style

Every move in the game — a jab, a dash, a Gum-Gum Bazooka, a Lunarian taking
wing — should look as if one animator made it. This page is that animator's
rule book: what weight looks like, what clean looks like, and where in the
code each rule lives. Read it before adding or changing a clip.

## 1. Weight and physics

- **Anticipation, scaled to weight and mass.** A big blow is loaded first: a
  beat the other way, then the coil (weight back, fist cocked), then the
  strike. How much of the wind-up goes on loading is the blow's weight class
  (`WEIGHT.loadAt`, below); a heavier body (`massOf`: a Buccaneer, a brawny
  frame, Gear Fourth's bulk) loads later, holds longer and settles deeper; a
  light one (a Mink) is snappier. A follow-up in a chain
  has no anticipation of its own — the last blow's recovery was it.
- **The hips lead, the head follows.** Within a pose the hips start a blow
  24 ms ahead of the rest and the head trails 32 ms behind (`samplePose`
  LEAD / LAG), so a blow drives through the body instead of every joint
  arriving on the same frame.
- **The contact frame is the hit frame.** The strike lands exactly at the
  ability's `windup`; the striking limb smears out past its length for a
  frame or two (`sm`, 0.04–0.16) and is drawn back in during the hold.
- **Hold, follow through, settle.** The contact pose is held (35–110 ms by
  weight, × √mass; hit-stop freezes it longer); the trunk carries on past the
  blow (6–15 % of the swing); the hips drop into the knees (12–40 mm × mass)
  on the way back to the stance.
- **Centre of mass over the feet.** A straight blow steps the lead foot in
  (`BODY.lunge`); a kick leans the body back against the leg; a big release
  plants the feet wide (`BODY.planted`). Nothing reaches out past its base
  without a foot going with it.
- **Feet don't slide.** The stride's cadence is matched to the ground speed
  (`gaitCadence`), planted feet sweep back exactly as fast as the body goes,
  and a blow thrown on the move keeps the walking legs (`walkLegs`).
- **Momentum carries.** Blends between moves are short and eased (below);
  channels the next pose doesn't drive (wings, bank, squash, a swollen arm)
  fade out rather than snap; a rubber arm snaps back accelerating, with a
  twang where it turns.
- **In the air.** Flight pitches the body by its speed (upright to hover,
  flat out at 9 m/s), banks it into turns (turn rate × speed), stands it up
  to climb and tips it past flat to dive; it takes off from a crouch and a
  spring and lands into the knees. A jump draws the knees up going up and
  reaches for the ground coming down.

## 2. Style and cleanliness

- **One line of action** through the key pose: lean, twist and the striking
  limb in one curve. Exaggerate it the way the anime does — the wind-ups are
  long, the reach is long, Gum-Gum arms are longer still.
- **Read from the camera.** Most of the game is seen from behind the player
  or in first person: blows swing out to the side of the body where they show
  (`zF` / `zB`), blades sweep in diagonals (`SWEEP`), and first-person hands
  stay in view (section 3.6). Check every move from the side, from behind and
  three-quarter.
- **Fast in, hold, ease out.** The strike travels most of its way in the
  first frames (`snap` easing) and eases into the held contact pose; the way
  back eases out of the hold (`inout`).
- **Key poses match the anime** for the signatures: Hiken's fist pulled back
  in its fire, Kaishin's punch at the air that stops dead and shudders, El
  Thor's arm raised to the sky, Ice Age's palm slapped to the ground, ROOM's
  raised hand, the second sun held up and hurled, Gear Second's low crouch with
  a hand by the ground, Gear Fourth bouncing like a ball, Gear Third's thumb
  blown into until the arm swells, Bazooka's two palms on stretched arms.
- **Faces carry the effort:** `grit` through a load, `shout` on the release,
  `fierce` in between, `shock` when beaten aside, `glare` for Conqueror's,
  `hurt` when struck.
- **No jitter, no pops.** The only shaking is deliberate: a tremble while a
  big move charges (`jitter`) and the shudder of a blow that stops dead
  (`shake`). Every change of state is blended.

## 3. The technical framework

### 3.1 Where things live

| file | what |
|---|---|
| `src/render/anims.js` | the clip table (`CLIPS`), the strike builder, which clip a technique plays (`actionClip`), sampling (`samplePose`), the rest pose and its layers (`restPose`), `poseExtras` (what the pose needs to know about the actor) |
| `src/render/anim/timing.js` | `EASE`, envelopes (`sm01`, `bump`, `envelope`, `ring`), `WEIGHT`, `weightOf`, `massOf` |
| `src/render/anim/poses.js` | `STAND`, `GUARD`, the stances, `HAND` (named hand spots), `BODY` (partial poses: lunge, sitBack, crouch, kneel, planted, tall), `pose(...)` |
| `src/render/anim/keys.js` | the key model: `lerpVal`, `lerpPose`, `finalize`, `seg` |
| `src/render/anim/react.js` | block, parry, parried, guard broken, stagger, flinch, counter, Armament hardening, get-up, launch |
| `src/render/anim/move.js` | stride and weapon carry, everyday poses, swimming, the jump, the charged crouch, the dodge (dash) |
| `src/render/anim/flight.js` | flight poses by style, take-off and landing, `flightState` |
| `src/render3d/chars/rig.js` | the pose P → the skeleton (two-bone IK, the trunk's twist, smears, rubber chains) |
| `src/render3d/chars/model.js` | the posed model: wings, bank, squash, Gear Third's swelling, the rubber's motion between frames |
| `src/render3d/chars/rubber.js` | the Gum-Gum fist in flight and the snap back |
| `src/render3d/chars/viewmodel.js` | first person, from the same pose |

### 3.2 The pose

A pose `P` is a bag of numbers in the 2D rig's units (an arm is 0.43 long, a
leg 0.49), side view, facing right: `b` hips [forward, down], `l` lean, `r`
whole-body pitch, `z` height, `sp` spin, `ht` head tilt, `hF` / `hB` hand
targets (lead / rear: [x, y] or {a, r}), `eF` / `eB` elbows, `fF` / `fB`
feet, `wF` / `wB` blades, `hand` / `handB` shapes, `face`; for the 3D rig
`tw` / `hp` chest and pelvis turn, `ls` side bend, `hy` / `hr` head turn and
roll, `zF` / `zB` / `zfF` / `zfB` hands and feet out to their side, `wt`
blade roll, `sm…` smears, `stretch` (rubber arms) and `stretchL` (rubber
legs), `ws` / `wg` / `wf` wings (spread, beat, swept back), `bk` bank, `sq`
squash, `inF` / `inB` an arm swollen (Gear Third). The full list heads
`anims.js`.

### 3.3 A clip

A clip is a list of keys `{ t, p, e }` — at time t the body is in pose p
(only what changes from the key before), arrived at along easing e. Strikes
are built by `strike(w, T, o)` from a few poses (`o.load`, `o.hit`, and
optionally `antic`, `coil`, `hold`, `follow`, `end`), spaced by the weight
class:

| weight | loadAt (of the wind-up) | anticipation | hold | follow-through peak | carry | settle |
|---|---|---|---|---|---|---|
| light (a chain's opening blows) | 58 % | — | 35 ms | 35 % of recovery | 6 % | 12 mm |
| medium (a chain's last blow, most techniques) | 64 % | yes | 50 ms | 40 % | 10 % | 20 mm |
| heavy (M2s, heavy and guard-breaking blows) | 68 % | yes | 75 ms | 42 % | 13 % | 30 mm |
| massive (impact frames, the biggest signatures) | 72 % | yes | 110 ms | 45 % | 15 % | 40 mm |

The class comes from the clip (`CLIP_WEIGHT`) and the move's data
(`weightOf`: a heavy blow is at least heavy, an impact frame massive); a
chain's blows are timed by where they come in it. Mass moves `loadAt` 6 %
later per unit over 1, scales the hold by √mass and the settle by mass. An
anticipation (`antic`) or follow-through (`follow`) the clip doesn't give is
made from the move itself: the load reversed at a fifth of its size, the
swing carried on. Signature moves give their own.

Technique timing comes from the data (`windup`, `active`, `recover`); a clip
fits itself into it and never changes it.

### 3.4 Layers and blends

The rest pose is built in layers, each over the last: the stance (or a
Gear's) → idle bob or fighter's bounce → flight, or the stride → an everyday
activity → Gear Fourth's bounce → a charged jump's crouch → a jump →
swimming → the block → Armament hardening → a parry → parried, guard broken,
staggered and the flinch → a counter → the dodge → getting up → a launch.
While a clip plays, the clip has the body, the legs keep walking (or hang as
the flight has them), and a blow taken flinches on top at 45 %.

Blends: a new move eases in from the last pose over min(60 ms, 0.45 ×
wind-up); a change of state over 120 ms; a stagger 50 ms; settling into a
seat or the water 450 ms (`game/actor.js visualPose`). The blend is
smoothstepped (`chars/pose.js`). Take-off (0.5 s) and landing (0.4 s) run on
the flight's own clocks; the dodge across its dash (0.22 s: push 0–16 %,
travel, brake from 60 %).

### 3.5 The 3D rig

The rig solves each limb by two-bone IK toward its target, turns the chest
and the pelvis by the reach plus `tw` / `hp`, overreaches a smeared limb and
rolls the whole body by `r`, `sideRoll` (a dash leaning into its slide) and
`bk` (flight, about the hips).

**Rubber limbs.** Every body has a chain of twelve bones down each forearm
and shin (`bones.js RUB`), sitting where the forearm has them at rest. When
a limb is sent past its length (`stretch` / `stretchL`, or a reach target
such as a Gum-Gum fist in flight), the upper bone keeps its length and aims
at the target and the bare part runs out to it along a cubic curve
(`rig.js solveRubber`): girth, hand and sleeve stay as built (a long sleeve
stays at the elbow and the bare arm comes out of the cuff). The model keeps
the rubber's motion (`model.js rubberMotion`): a ripple running out along it
as it stretches and back as it comes home, a twang where it turns, slack on
the way back. A fist in flight (the stretch projectile) is followed at
shoulder height and, once spent, snaps home in 0.15 s (`rubber.js`).

### 3.6 First person

The view samples the very same pose (`actorPose`) and changes only what an
eye would: straight blows end big just right of and below the crosshair
(`fpStrike`), weapons are swung low with the blade sweeping the view
(`fpSwing`), the trunk's turn and lean barely reach the arms, a dash's lean
and hop are toned down, and a Gum-Gum arm reaches down the middle of the
view to its fist. New poses need no first-person version unless a hand would
leave the view or come up past the eyes.

## 4. Adding a move

1. Pick its weight class (or let the data decide) and a clip name.
2. Write the load and the hit from the library (`HAND`, `BODY`, `pose(...)`)
   — the key pose first, the anime frame you want held; then the load as the
   strongest opposite of it.
3. `name: (w, T, c) => ({ keys: strike(w, T, S(c, { load, hit, ... })) })`;
   add it to `LIMB` (which limb lands it) and `SWEEP` (a cut's direction) if
   needed, and to `TECH_CLIP` for a technique whose data says only 'punch' or
   'cast'.
4. Film it: `node tools/shot.mjs anim-moves --moves=<id>` (frozen moments,
   `--views=side,back,3q`), `anim-live --moves=<id> --views=3q` (the game
   running: projectiles, rubber arms), `anim-fp --moves=<id>` (first person),
   `anim-dodge`, `anim-fly`, `anim-react`. Judge it from the side, from
   behind and in first person at several moments; check the chain it sits in.
