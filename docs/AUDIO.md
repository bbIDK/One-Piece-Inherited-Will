# Audio: the sound of Inherited Will

Almost everything you hear is synthesised in the browser with WebAudio. The
exception is a small set of short CC0 recordings (`assets/sfx`, credited in
`assets/sfx/CREDITS.md`: a pane of glass shattering, an earthquake's rumble, a
flame's roar, ice cracking, an electric crackle, a heavy punch's thud...)
layered *under* the synthesised effects where a recording sells what
synthesis can't. The references below (the One Piece anime, the Pirate
Warriors / World Seeker / Odyssey / Burning Blood games, foley and
procedural-audio practice) informed the *design*; nothing is sampled from them.

**Recorded layers.** `tools/sfx-embed.mjs` (run by `tools/build.mjs`) packs
`assets/sfx/*.mp3` into `src/audio/samples.data.js` as base64, so a single-file
build or a host that serves only the script still has them. `samples.js`
decodes them in the background when the sound first comes on (the fights'
ones first) and trims the decoder's lead-in; `Voice.sample(dt, name, {gain,
rate, offset, dur, fade, attack, lp, hp})` plays one through the voice's own
chain (so its bus, drive, room and volume settings apply). `fire_1`, `fire_2`…
are variants asked for as `fire`. A layer that isn't decoded yet (or never
is) is simply left out: every effect still plays, synthesised alone.

Code: `src/audio/` — `engine.js` (the mixer), `synth.js` (a voice's building
blocks), `motifs.js` (what things are made of), `sfx.js` (every effect),
`steps.js` (footsteps), `music.js` (composer, instruments, decks),
`themes.js` (each place's music), `director.js` (what music plays),
`ambience.js` (beds and spots), `foley.js` (the game-watching foley),
`samples.js` (the recorded layers), `audio.js` (the facade the game calls).
Checks: `tools/scenarios-audio.mjs`.

## 1. What One Piece sounds like (research takeaways)

* **Anime impacts are brighter and longer than real ones.** A real blow is a
  dull thud; the stylised one is a hard crack with a ringing or booming tail.
  Layering a ringing tail is the single change that makes a hit read as anime
  (KVR sound-design forum on the "chiiinnng"; Pro Sound Effects' stylised
  anime clashes). Blade clashes are real steel layered, pitched up, chorused,
  with a touch of pre-delayed reverb.
* **Every impact has three parts** — transient (the attack you hear land),
  body (the weight), tail (space and debris) — and a fight hit is several
  layers at once: the movement whoosh, the contact transient, a low body, skin
  or cloth detail, debris (game-audio impact guides).
* **The manga's sound words are the brief**: DON / DOGA / BAKI (a punch),
  DOGOOON / DOKAAN (a heavy blow, an explosion), ZAN / ZUBA (a cut), KIIN
  (steel on steel), GOGOGO (menace, a quake), GORO GORO (thunder), PAKIN (ice
  cracking), PIKA (light), ZUZUZU (darkness), JUU (sizzling), MOKU (smoke).
  `render/combatfx.js` already letters them on screen; the sounds match.
* **Devil Fruits** sound like what they are: Gomu Gomu is a rubber stretch and
  a snap (the "Gomu Gomu no..." build-up, then the BOYOING); Whitebeard's Gura
  Gura *cracks the air like glass* before the shock wave and the boom; Enel's
  Goro Goro buzzes and rumbles; Conqueror's Haki is a deep boom with black
  lightning crackling ("Bzzt" plus rumble, as the manga draws it); Law's ROOM
  is a dome humming outwards and Shambles a quick "shwip" and pop; Kizaru's
  light whines up and fires.
* **Procedural audio** (Andy Farnell, *Designing Sound*): model the process,
  not the recording, and drive it from game state. Rain is many tiny bubble
  pops over filtered noise; wind is noise through a wandering band-pass;
  thunder is a few cracks then a rolling low rumble with echoes, its delay
  after the flash telling you how far it was; a creak is stick-slip friction
  (an uneven click train) ringing through the wood's resonances (Farnell's
  door: a bank at 62–790 Hz); a water drop or bubble is a short sine rising in
  pitch (the Minnaert resonance, van den Doel).
* **Rowing** is the oarlock's squeak, the blade's plunk at the catch, the swirl
  through the drive, drips as it lifts out, a knock as it swings forward.
* **Swimming** is the churn of a stroke, the froth of a kick, the hush of the
  glide; under water everything goes muffled and low.
* **Adaptive music**: vertical layering (stems faded in and out with
  intensity) for the fight, horizontal re-sequencing (a new piece, entered on
  a musical boundary) between places, stingers for moments (a win).
* **The One Piece score** (Kohei Tanaka, Shiro Hamaguchi) is brassy and
  string-hot for action, folk-coloured for places; the game's own calm,
  Minecraft-like pieces are the players' favourite, so the new music is
  composed by the same composer, in the same style, as their siblings.

## 2. The sonic palette

### Fight
| Sound | Transient | Body | Tail / colour |
|---|---|---|---|
| Punch (DON) | high-passed skin snap 3 kHz | slap 1.2–1.9 kHz, a woody knock 430→210 Hz, sine thump 175→46 Hz | soft-clipped; weight (`hitW`) lowers and lengthens it |
| Kick (DOKA) | same snap, less slap | thump 130→40 Hz, pink low whump | — |
| Heavy (DOGOOON) | 2.6 kHz crack | slap, knock, thump 120→30, second boom 45 ms later | debris crackle, room echo, music ducks |
| Haki-coated | iron "GAKIN": inharmonic ring ~650 Hz | — | crackle |
| Counter | extra crack + sub | — | — |
| Cut (ZAN) | 6.5 kHz click | band-passed swish 5.2→2.2 kHz, thump | detuned pair of blade rings (the chorus on steel) |
| Heavy cut (ZUBAAAN) | air tear 1.8→7 kHz | deep cut, sub | long ring |
| Parry (KIIN) | 5 kHz click, clash knock | inharmonic ring ~1.3 kHz + FM shimmer √2 | ~1 s; perfect: brighter, longer, a sub "whomp" for the slow-motion |
| Block | arm: leather slap 620 Hz + knock; blade: short ring 900 Hz | thump | Haki: clank |
| Guard break (BAKIN) | crack | shards (crackle 3.5 kHz, tinkles) | falling saw for the stagger |
| Dodge | — | cloth flutter whoosh 0.7→3 kHz | foot scuff |
| Swing | by weapon: fists short, sword thin and bright, legs full and low, heavy/axe slow and big, staff a hollow whirr; guns: crack, bang, smoke and an echo; slingshot: snap and whistle |

### Techniques
A technique's sound starts with its wind-up and fires its release at the
moment its first blow lands (the step's time, slowed as the game slows a
foe's readable wind-up). Fruits: Gomu stretch → snap (Gatling: a volley,
Gear Second: heartbeat pump and steam, Gear Fourth: bounce and Haki, Gear
Fifth: the Drums of Liberation), Gura trembling air and a groaning ground →
a hairline crack, then the sky shattering (a white snap, recorded glass
breaking, shards raining), a recorded sub-boom and the earthquake rolling on
with rock breaking in it (the Tsunami adds an aftershock), Ope ROOM
hum / Shambles shwip-pop / Amputate's long cut, Bara pops, Bomu fuse hiss,
Hana petal slaps and a chime, Ito twang, Mochi squelch, Horo ghostly wail,
Kage bats, Doku hiss and bubbles, Noro slowing whine, Bari glassy FM, Suke
reverse shimmer, Supa steel, Nikyu paw "pon" (Ursus Shock: air sucked in,
then the pop), Zushi gravity drone and a falling meteor's whistle, Zoans a
growl or roar, the Phoenix blue fire and a chime, Seiryu a dragon's roar,
Mera ignition and roar (Entei swelling), Hie freezing hiss and crackle, Goro
static gathering then VARI, Suna sand rasp, Moku puffs, Pika charge whine
and PYUN, Magu bubbling then a lava roar, Yami suction. Styles: Soru, Geppo,
Rankyaku, Tekkai, Diable Jambe, Uchimizu, Vagabond Drill, the Electro and
Clima-Tact moves, Okama spins, Asura. A fruit's blows also carry its touch
(`FLAVOUR`: Gomu's boing, Mochi's squelch, Supa's ring...).

### Haki
Every character's Haki has a voice (`game/haki.js` hakiSignature `voice`,
0..1, from their seed): the same sounds pitched and coloured their own way —
related, never identical. Armament hardening: a low "vrrmm" swelling as the
coat spreads (a growl opening up over a sub), then, as it sets at 0.27 s, the
KSHING — a click, a bright swipe, a struck-iron clank and a dense chorused
ringing tail; armed blows carry a harder iron "GAKIN" in the striker's voice,
Ryou a hollow "dwoom" through the body. Observation: a soft heartbeat, a
sonar breath and a high crystalline TING with a long shimmering tail; its
foresight a whoosh played backwards onto a ting. Conqueror's: the pressure
gathering through the wind-up, then the deep rolling DOOON (a crack, a huge
sub falling away under a growling body, thunder), the wind rushing out and
black lightning crackling; two kings clashing, a sustained thunderous grind
(two growls beating, a roar of the deep, arcs the whole while) and a last
boom. Haki spent: a dull clank going flat, a fizzle.
`node tools/shot.mjs sfx --only=haki@,haki_obs@,conqueror@ --tag=haki`
renders each in three voices.

### Elements (what a blow is made of)
fire (ignition, fluttering roar, embers), magma (heavy roar, thick bubbles,
sizzle), ice (crack, "pakiki" crackle thinning out, crystal ring), lightning
(crack, a buzz jumping 70–800 Hz every 10 ms, hiss, rumble), quake (glass
crack, DOGOON, shaking sub), light (click, rising whine, shimmer), dark
(inward swell, sub, grit), water (splash, bubbles, drops), sand (rasp and
grains), poison (acid hiss, bubbles, a sick wobble), smoke, gas, string,
explosion (crack, boom, blast, debris and its echo).

### Moving about
Footsteps: heel then rolled toe on grass, sand, dirt, gravel, mud, stone,
wood (a deck booms and creaks now and then), snow (a squeak), ice, soft and
metal; left and right a touch apart; a sole drag at a run; wet feet squelch
for a while after a swim. Jump: a push-off on what's underfoot and a rustle
of clothes (not a ping); charged leap heavier with dust; landings by surface
(the game's own `playerLand`, and the small hops it doesn't announce).
Ladders rung by rung; a scramble up a ledge. Water: splash in, a big one,
leaping out (a bloop and drips), wading, the breaststroke's pull and kick in
time with the arms you see, a breath at the top, treading, a Devil Fruit
user's thrashing, diving under (a gloop; the whole mix muffles to ~620 Hz)
and breaking the surface, the gasp after too long down, the last bubbles.

### Ship
Oars: catch (plunk and gulp), drive (swirl, oarlock squeak), release (swish,
drips, the oar knocking in its lock) on the boat's own stroke phase
(`ship.rowPh`), each oar on its side. Sails raised (canvas unfurling, flaps,
halyard squeal) and struck; anchor let go (windlass, chain, splash) and
weighed; the wheel's spoke clicks as she turns; hull groans (stick-slip at
120–520 Hz), rigging, waves slapping her; beds of the hull through the water
(by speed) and the wind in the sails (fluttering when luffing). Cannon: crack,
boom, blast and its echo off the water; a crash into rock: timber crunch,
splinters, a groan, spray.

### World, menus, milestones
Doors (latch and stick-slip hinge; a chest's lid instead when it's a chest),
knocks, coins, treasure, eating, gear (a sword's "shing" drawn, the guard's
click sheathed), maps and pages; menu hover tick, click, panel open/close;
quest taken (scroll and horn), updated (chime), done (arpeggio and shimmer);
a technique learnt; a bounty raised (DON and the poster); the Log Pose
setting; a heartbeat when a fight has you on your last legs.

### Ambience
Beds: ocean swell and wash, wind (and its howl in a storm), rain, Reverse
Mountain's torrent, the deep, a town's murmur, cicadas, crickets, leaves,
fire, the sky, the hull, the sails — each noise through filters wandering
on slow oscillators. Spots: gulls (Blues and Paradise coasts by day),
songbirds and jungle birds, owls and frogs at night, voices, laughter, an
anvil and a dog in town, a Sea King's moan in the Calm Belt, whale song
(Twin Cape, Fish-Man Island), drips and chains (Impel Down), embers, rain
patter, surf breaking on the shore every 6–11 s when you're near the water.

## 3. Mixing rules

* **Buses**: effects, ambience, music, menus. Effects, ambience and music
  pass through the underwater muffle; menus never do. Ambience has a shelter
  filter (indoors or below decks the outside goes dull, the room rings more).
* **Volumes**: the settings' sound-effects volume drives effects, ambience
  and menus; the music volume the music (ramped, never jumped).
* **Voice limit**: 26 effects, 10 ambience, 6 menu voices (phones 16/6/4);
  each sound has a priority (+2 when it involves the player, −3 far off) and
  a per-sound overlap limit; when full, the least important, quietest voice
  is faded out in 12 ms, or the newcomer isn't played.
* **Cooldowns** per sound (a flurry doesn't stack the same hit on itself).
* **Distance**: level 1/(1 + (d − 4)/10), silent beyond 70 m (footsteps 16 m);
  panned by the bearing from the camera (near sounds kept near the middle);
  air absorption (a low-pass from 16 kHz falling with distance past 12 m);
  more room echo the further off.
* **Variation**: every voice's pitches jittered ±3 %, round-robin variants
  (never the same twice running), layers with random timing and level.
* **Ducking**: heavy blows, explosions, cannon, guard breaks, parries and
  fanfares dip the music for a moment.
* **No clicks**: every envelope starts and ends at silence; stolen voices fade;
  decks fade in and out; beds ramp; layers can't be scheduled before their
  voice starts.
* **Headroom**: impacts are driven into a soft clipper for grit (as before);
  a soft clipper at the end of the chain (straight to 0.7, rounded to 0.98)
  catches a pile-up instead of hard clipping.
* **Never in the way**: no sound before the first click or key (the browser's
  rule); all game-facing handlers are guarded — the audio can't break a frame.

## 4. The music system

* **Composer** (unchanged): a theme's key, mode, tempo, feel and chords; a
  two-bar motif stated, answered, varied and brought back; a piece of 12–48
  bars, then quiet before the next (the calm, Minecraft-like pacing).
* **Themes**: the seven originals exactly (title, the East Blue sea, town,
  night, the Grand Line, underwater, battle) and their siblings for every sea
  (North/West/South Blue, the New World, the Calm Belt, the Polar sea, the
  Red Line and Mary Geoise, Reverse Mountain), the zones (Skypiea, Shandia,
  Fish-Man Island, Impel Down, Newkama Land) and the notable islands and towns
  (Foosha, the Marine bases, Wano and Shimotsuki, Orange Town and Buggy's
  circus, Syrup Village, the Baratie's jazz, Cocoyasi, Arlong Park, Loguetown,
  Whiskey Peak (and its night), Little Garden, Drum, Alabasta, Mock Town,
  Water 7, Enies Lobby, Thriller Bark, Sabaody, Marineford, Amazon Lily,
  Kuraigana, Dressrosa, Totland, Zou, Elbaph, Green Bit, Onigashima,
  Hachinosu, Egghead and Punk Hazard, Germa, Flevance, Ohara, Kano...). Any
  other island takes its sea's instruments, coloured by its climate (snow:
  celesta and harp; desert: shakuhachi, oud, the hijaz mode; sakura: koto
  and the in-scale...) and its towns' style, turned a step by its name.
* **Instruments** (all synthesised, in the original style): piano, pluck,
  music box, pad, flute, accordion; and marimba, steel pan, harp, celesta,
  koto, guitar, oud, upright bass, bell, mandolin, whistle, shakuhachi,
  fiddle, erhu, horn, brass, organ, calliope, sax, synth, strings, choir.
* **Decks and stems**: a piece plays on a deck with stems — pad, bass, arp,
  lead, percussion, more percussion, brass stabs, a boss layer.
* **The director** (`director.js`) decides, 16 times a second:
  * places are believed after holding a moment (a town 2 s, an island 3 s,
    the open sea 4 s; diving 0.6 s; from the title at once);
  * a new place fades the piece out from its next bar line over ~1.5 bars and
    starts the new place's theme after a breath (resting, an arrival's music
    comes within ~2 s);
  * night (with hysteresis at dusk) only changes the next piece;
  * a fight (foes chasing or attacking you, a boarding hint, hostile cannon
    fire) brings in `battleOf(place)` on the next beat: the original battle
    music in the place's key, mode and colours (the East Blue's is the
    original), a boss variant faster and heavier; a taiko hit and a cymbal
    swell lead in;
  * intensity (foes, a named foe, a boss, low health, blows landing) brings
    the stems in on bar lines: percussion always, bass 0.15, pad 0.2, arp
    0.3, snare and toms 0.4, lead 0.5, brass 0.72, the boss layer (choir,
    timpani rolls) for a boss;
  * the fight over (2.5 s with nobody after you): a closing chord on the next
    bar line, the deck fading, a fanfare (ta-ta-ta-DAAA on brass, timpani, a
    major chord even in a minor key; longer with strings and choir for a boss)
    if you won, then quiet and the place's music again;
  * knocked down: the fight music drains away under the "knocked" sting;
    death: the music falls away and the quiet holds before the title's piece.

## 5. Checking it (no speakers)

`node tools/shot.mjs sfx` renders every effect, technique and footstep three
times through an OfflineAudioContext and reports peak, RMS, crest, duration,
attack, A-weighted centroid and bands, loudness and how much repeats vary,
with a spectrogram sheet (`shots/audio/`). `compare` puts the old audio.js
beside the new; `music` and `director` render themes and a scripted voyage;
`ambience` each bed and spot; `game-audio` a real game build with sound on.
