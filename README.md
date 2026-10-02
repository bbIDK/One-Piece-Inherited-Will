# One Piece: Inherited Will

*Inherited Will* is a fan-made, browser-based roguelike set on the whole Blue
Planet of **One Piece**. It works like Rogue Lineage: you have a handful of
lives, death is permanent, and your will passes on to the next generation.

> "Inherited Will, the Swell of the Ages, and the Dreams of the People. As long as people continue to pursue the meaning of Freedom, these things will never cease!" — Gol D. Roger

## Playing

**To play:**

- Play online at **<https://bbidk.github.io/One-Piece-Inherited-Will/>** (GitHub Pages,
  served straight from this branch, so every push updates it). To switch it
  on, once: the repository's Settings → Pages → Build and deployment → Source
  "Deploy from a branch" → branch `claude/one-piece-roguelike-game-9l776l`,
  folder `/ (root)` → Save. (The `.nojekyll` file makes Pages serve the
  files as they are.)
- Or open **`dist/onepiece.html`** in a modern browser (Chrome, Edge or
  Firefox with WebGL2). It is one self-contained file.
- Or run `npm install && npm run build && npm run serve` and open
  <http://localhost:8080>.

There are **three save slots** (lineages) on the title screen. The game saves
itself to `localStorage` every minute, at every milestone and when you close
the page, and there is a **Save game** button in the pause menu. A save cannot
be reloaded to undo a death.

### The view

The game plays in **first person** by default: the world is 3D (three.js),
with terrain, sea, sky, towns and ships built from the same map the
simulation uses. Click the game to capture the mouse and look around (Esc
frees it). **V** switches between first and third person (the mouse wheel
sets the third-person distance). In first person your own body is there:
look down and you see your chest, your legs and your feet walking, and your
shadow is whole. Shadows have clean, smooth edges: the sun's shadow map is
fine close to you (a texel every centimetre and a half, out to 16 m),
coarser farther off (out to 64 m, fading away over the last stretch, so a
far house's shadow comes and goes gently rather than at a line), and holds
still on the world as you move, so edges neither stair-step nor crawl.
People stand in the shade too: step into a house's shadow and you, the
weapon in your hand and your arms in first person darken with the street
(never with your own shadow: an arm or a hat brim doesn't blotch the figure;
indoors, where rooms are lit without the sun's shadows, nor does the roof).
The sun keeps to the daylight, setting low and golden as the evening sky
darkens; the moonlight comes up only once it's dark (and goes before dawn),
so shadows never swing round at sunset.
Settings has mouse sensitivity, invert-Y,
field of view, view bobbing, a fast graphics mode, a **render distance**
(in 32 m chunks, like Minecraft's: 4 to 24, 12 by default; at sea you see
half as far again, and a haze closes in at the edge), and (on by default) a
slightly lower resolution whenever drawing can't keep up, so the game stays
smooth on weaker graphics chips. Buildings beyond about 100 m are drawn as
simple blocks merged per 32 m of ground, so whole towns stay in view cheaply.

**Phones and tablets** get touch controls (hold the device sideways):

- a stick for the left thumb (push it all the way to run; at sea it steers and
  sets the sails);
- drag anywhere on the right to look around;
- round buttons to jump, attack, heavy attack, dodge, block, use and heal
  (fire and row at sea);
- a strip at the top for the menus, the world map and the camera view.

### Controls

| Key | On foot | At sea |
|---|---|---|
| Mouse | look around | look around |
| V | first person / third person | |
| WASD | move where you look | W/S sails, A/D steer (at a rowboat's oars: W/S set the rowing pace, which she keeps, A/D turn) |
| Space | jump (hold to charge it); at a pier, a bank or a ship's side, climb up; jump at a house and catch its eave to haul yourself onto the roof | row (works without wind) |
| Shift | hold to sprint, for as long as you like; tap to dodge (i-frames) | Coup de Burst (some ships) |
| Left / right click | combo / heavy attack | broadside toward where you aim |
| X | draw your weapon, or put it back in its sheath. Sheathed, a click is a punch (your fist style); drawn, it's the weapon's moves, listed with their keys at the bottom right (the skills you've learned for it; greyed while they cool down). At the helm or the oars it's always sheathed | |
| Q | dodge (i-frames); it comes back after a moment — the Q slot left of the hotbar fills up again | |
| F | block — tap just before a hit to **parry**. A heavy blow (the red glint) smashes a guard aside, and you can't block again until the F slot fills | |
| 1–9, 0 | hotbar: techniques, food and weapons (a weapon's key draws it from its sheath into your stance, and again puts it back; food goes in your hand: hold the right mouse button to eat it, in bites; a punch or a dodge puts it away) | |
| R / T / G | Haki, once it has awakened | |
| E | talk, enter, take the helm or the oars, pick fruit, examine | dive, knock-up, go ashore, leave the helm (under sail she sails on, holding her course, while you walk the deck) |
| Tab/I, C, K, J, U, L | inventory, character, skills, journal, crew, quests | |
| M | world map | |
| − / + | zoom the minimap out / in (it's the world map's chart, round you, gliding under you as you go, with its icons: inns, shops, doctors, harbours, your quests, the Log Pose's island) | |
| H / Esc | help / pause menu | |

The same menus are on the **sidebar** under the minimap. Press a menu's key
again (or Esc) to close it. Drag techniques, food and weapons onto the hotbar (a
weapon's key draws it, or sheathes it again), and drag hotbar slots to
rearrange them.

## What's in it

**The world.**

- The canon layout is wrapped around a sphere:
  - the four Blues sit in their quadrants;
  - the Grand Line runs between the two Calm Belts;
  - the Red Line forms a ring;
  - Reverse Mountain, where the four Blues' currents climb and meet, sits in
    the centre;
  - Mary Geoise and the Red Ports sit on the far side.
- Islands, towns, landmarks and people are generated from canon data, from
  Foosha Village to Laugh Tale.
- What stops you is what you see. Town walls stand on the ground they're
  built on. A market stall, a beached boat or a ruined wall collides along
  its length, turned the way it's drawn. A tree's trunk is as thick as its
  kind: a lollipop's stick, a bamboo clump, a jungle giant's roots. A
  boulder on a hillside lies along the slope. A house on an upper town over
  a lower quay stands on a tall stone base rather than sunk into the hill.
  Every town is walked in every direction to check (`barrierhunt`, below).
- **Up on the roofs.** A building's roof is as solid as it's drawn: land on
  it from a high enough jump, or jump at the house, keep going for it, and
  catch the eave (within reach of your hands, arms up) to haul yourself up.
  Up there you walk its slopes and ridge, step across to the next roof, and
  a chimney or a taller house is a wall. Walk off the edge and you drop to
  the street. A plain human reaches a one-storey house with a running,
  charged jump; Minks, Longlegs and other high jumpers get onto taller ones.
  Jumping under an eave, your head stops at it. A gateway's posts are solid
  (a torii's two, a gate's stone pillars, an arch's legs) and you walk
  between them. A Wano house's veranda is a step up, not something you walk
  through.
- **Bridges** join the land at the height of the land. Most islands stand
  high over the sea, so a bridge across a river, a canal or a channel between
  two parts of an island spans it high over the water, sloping from one bank
  to the other when they differ. The bank it lands on is built up to meet it,
  on a stone pier, with its pilings reaching down to the bed. A high deck has
  a wooden handrail (jump it to dive off), and you can swim or wade under it.
  Dressrosa's iron bridge runs all the way to Green Bit.

**The main story.**

- Every island the Blues' young set out from has three people who can start
  your story, each marked with an orange **!**: an old sea dog (the
  **Pirate** road), the officer at the island's Marine post (the **Marine**
  road) and a bounty broker (the **Bounty Hunter** road). You can walk only
  one. The first job is simple: a blade and a Jolly Roger, or the local
  troublemaker brought in.
- **Part 1, The Blues.** Whoever sets you on your road hands you a Log Pose set
  for your first stop. Three stops in your Blue get you ready for the Grand
  Line: a ship that can take it, a crew or a rank, and the last port before
  the mountain. Part 1 ends when you ride **Reverse Mountain**.
- **Part 2, The Grand Line.** At Twin Cape, Crocus explains the seven roads.
  Your Log Pose picks one, and every road is its own adventure:
  - five pirate roads end at the Sabaody Archipelago;
  - two Navy roads run from G-8 to Marineford;
  - two hunter roads end at Enies Lobby, where the court pays the greatest
    bounties.
  You can't sail on past the island your story is on. Without its log, the
  Grand Line's currents turn you round.
- **Part 3, The New World**: Fish-Man Island and on to Laugh Tale for pirates,
  New Marineford and Blackbeard's fortress for the Navy and the hunters.
- **How it works:**
  - One chapter at a time, and the main story can't be abandoned. Side
    quests can be.
  - Return to whoever gave you a chapter for pay that grows as the story goes
    on.
  - If your road changes, the story follows you: a Marine who deserts turns
    pirate, a hunter who raises a flag becomes a captain.
- **Quests menu (L)** lists the chapter under way and the story so far, plus
  side quests you can track or give up. An on-screen **tracker** on the right
  shows the next step and how far away it is. When the story's step is to
  see another quest through (the Black Cat's Plot), its card shows that
  quest's step instead of listing it twice.
- **The world map (M)** is a chart of the planet; zoom in on an island
  you've been to (or sailed close by) and it's charted in detail: the
  coast inked, the shallows with their depth lines, the land shaded and
  contoured, every tree where it stands, the streets and the roofs of the
  towns, and, closer still, the inns, shops, taverns, doctors and harbours.
  You're an arrow the way you face; a scale bar and a compass rose go with
  it. It marks your quests, the story's next stop and the quest givers on
  the islands you know.
- **Quest markers** stand over the world where the main story's objective
  and the side quests on the tracker are (above the head of whoever you're
  to see), or ride a ring round the middle of the screen with an arrow when
  they're out of view. The main story's are a gold diamond with a red star
  and a side quest's a sky-blue diamond with a "!", the same on the
  compass, the chart and over the world.
- **A boss's health bar** shows while you're in the fight with them and close
  by. It goes once they're beaten, when you get well away, or when you go
  down and wake up somewhere else.
- **Waypoints** point at where a step is done (the bell to ring among the
  spires, the platform in the square, the chest still holding the herbs),
  at the harbour of an island to sail to, at the shipwright for a ship, at
  the shop that sells what you need (in that sea) and at someone who'd join
  your crew, or else at whoever the step is about: the foe to beat or the
  person to see (a step that says "Return to Makino" points at Makino)
  where they stand, or — not about yet — where they'll be on the island
  they live on, which needn't be the quest's (Katakuri on Cacao Island, Leo
  on Green Bit). A Sea King's waypoint is out on the water where it
  surfaces. A step in Skypiea or on Fish-Man Island points at the way
  there (the Knock Up Stream, the dive point) until you're in it, and at
  the way out once you are.

**Lineage (roguelike).**

- **Race** is rolled with rarities: Human, Fish-Man, Mink, Skypiean, Longarm,
  Longleg, Buccaneer, Three-Eye or Lunarian. Race decides which Blue and
  which town you are born in. Nobody is born in a town held by a crew who
  fight on sight (Fish-Men are born in Cocoyasi, not inside Arlong Park).
  A save that started there wakes in Cocoyasi instead. Buggy's crew in
  Orange Town lord it over the town but leave a newcomer be, until someone
  lays a hand on one of them.
- **Traits** are rolled at birth. About one birth in twenty carries the
  **Will of D.**: a hidden "D." in your name, revealed with a flourish at
  birth. **King's Disposition** (Conqueror's Haki) is far rarer and stays
  secret until the day it awakens.
- You have a few **vivre cards** (lives). When you are knocked down, mash
  SPACE to get back up. If you are finished off, a card burns. Wanted pirates
  are arrested by the Marines instead of killed; notorious ones go to
  **Impel Down**.
- When the lineage ends, you earn **Inherited Will**:
  - perks for the next generation,
  - an heirloom,
  - charted islands,
  - reincarnated Devil Fruits,
  - a place in the Hall of Legends.

**Growing by doing (no stat points).**

- Attributes rise by themselves from what you do against opponents worth
  fighting:
  - landing blows builds Strength (Agility with guns);
  - dodging and parrying builds Agility;
  - blocking builds Endurance;
  - taking punishment builds Vitality;
  - getting back up builds Willpower.
- **Weapon mastery**: fists, legs, swords, guns, staffs and axes each have
  their own mastery. It rises the more you use them and adds damage.
- **Breakthroughs** from great victories push your body in the directions
  you have been training. Masters and sparring push further.
- Weak enemies teach nothing.
- **Haki is never mentioned until it awakens.** Armament can stir at random
  in a hard fight once you are strong enough (it becomes certain past a
  point). Observation comes the same way to those who have learned to read
  attacks.
- **Doriki** measures your power.

**Combat.**

- Fighting styles with canon techniques: brawling, One/Two/Three Sword Style,
  Black Leg, Fish-Man Karate, Rokushiki, sniping, Okama Kenpo, Electro,
  Hasshoken, Weather Science, Elbaf, and Dragon Claw. A weapon in your hand
  is what you fight with: pick up a cutlass as a brawler and you swing it
  with the sword's plain moves (or a sword style you've learned).
- **Foes take turns**: in the four Blues only one of a gang attacks you at a
  time (two in Paradise, three in the New World; bosses always may). The
  rest circle and wait, and whoever you hit goes next. Nobody runs off when
  nearly beaten, and pirates at home in a village leave you alone until you
  break in or strike one of them.
- About 32 **Devil Fruits** (Paramecia, Zoan, Logia), with canon rules:
  - Logia intangibility unless you use Haki, seastone or their weakness;
  - rubber versus lightning;
  - fruit users can't swim: they thrash for a few seconds (longer with
    Endurance; the breath bubbles count them down), then the sea drags them
    under;
  - you can eat only one. Collect others to sell to the black market (or
    keep them).
- Haki: Armament (with Emission and Ryuo), Observation (with Future Sight)
  and Conqueror's (with Infusion).
- Parry, guard breaks, i-frame dodges, finishers and anime impact frames.
- **No stamina.** Nothing you do drains a bar; everything is paced by
  cooldowns:
  - sprint and swim as long as you like;
  - a dodge comes back after a moment (sooner with Agility, and a quarter
    sooner with Quick Feet);
  - every technique has its own cooldown (a Musician in the crew brings
    them back 10% sooner);
  - a heavy blow smashes a raised guard aside: staggered, you can't block
    again for a moment. Endurance shortens that, and lets less of an
    ordinary blow through your guard;
  - Gear Second leaves you spent for a few seconds when it wears off.
  - Everyone else sprints in bursts and eases off between them, so you can
    win a chase by keeping going.
- **Footsteps** sound like what you walk on, in time with your feet: a soft
  crush on grass, a gritty shuffle on sand, a crisp tap on stone and
  paving, a hollow knock on decks, piers and floorboards, a squeaky crunch
  in snow, a squelch in mud (louder when you sprint). Running leaves no
  trail of dust puffs behind you.

**The sea.**

- Ships range from a rowboat (you row her: no mast, no sail) to an Adam-wood
  brig. There is wind, Grand Line weather that changes its mind, and rogue
  waves.
- Boarding is done by hand: jump onto a deck from a pier or from your own
  deck, or swim to a ship and climb her side. Every deck can be walked, and
  everyone aboard rides her gentle roll and pitch with her, feet on the
  planks (on a big ship the ends rise and fall a good way), and shoes rest on
  a floor or a deck rather than sinking into it.
- Ships are on One Piece's scale: every one but the rowboat is at least
  twice the size it first was, from a 24 m sloop and the 28 m Going Merry
  class to a 90 m great galleon (a Yonko flagship) and a 78 m Marine
  battleship. Reverse Mountain's canals, its summit pool and its stone gates
  are built wide and tall enough for the greatest of them.
- Every ship with a sail is built to live on, Sea of Thieves style:
  - stairs up to the quarterdeck and the wheel (just the one);
  - a door under it into the captain's cabin (chart table, bunk, sea chest);
  - the crew's forecastle on the bigger hulls;
  - a hatch amidships (a ladder, or a companionway of stairs on the big
    ships) down to the hold, with cargo, lanterns and the treasure chest
    (on the big ships it is also the gun deck, with a cannon at every port).
- Cannons are iron barrels on wheeled carriages. A broadside fires one
  cannonball from each gun on that side, arcing out of its port. Balls run
  out: shipwrights restock them, and plundering a hold carries a ship's shot
  across to yours.
- **Your ships can't break** (for now): no hull damage and no sinking, from
  anything. NPC ships still take damage and sink.
- Your ships are saved where they lie, and so are you aboard them: quit on
  her deck, in a cabin or down in the hold, and that's where you are when
  you come back. Turn in for the night in a bunk or a hammock aboard one of
  your ships (free, unlike an inn) and she's where you wake if you fall,
  wherever she's sailed to since (while she's afloat).
- Other ships come and go **out of sight**: they sail in out of the haze from
  beyond your render distance, and leave the same way, never appearing or
  vanishing in front of you. A ship's news ("a Marine patrol has spotted
  you!") comes when she's seen; your Marine escorts join you from over the
  horizon under a press of sail.
- **A shipwright on every pier.** Press E to talk to them:
  - **Spawn ship** lists every ship you own and where she is, and brings the
    one you choose round to this pier, ready to board. Only one copy of each
    ship is ever afloat.
  - **Buy ships** is how you get new ones. It shows each ship's size, masts,
    hull, speed, cannons and shot, crew, hold and price.
  - **Goodbye** ends the conversation.
  Stealing a raided ship by taking her wheel is gone (plundering her hold
  still works). Ships the story gives you join your fleet.
- **Log Pose** navigation: stay on an island until the log sets, and use
  Eternal Poses.
  - **The Log Pose slot** (Inventory, under your weapons) holds the pose you
    follow: your Log Pose, an Eternal Pose or a Vivre Card. Its needle is
    the dial by the minimap, and where it points is marked on the compass,
    the chart, the minimap (on its rim when it's farther) and over the sea.
    Your first Log Pose goes straight into it.
  - **Choose where it points**: click your Log Pose in its slot. You can set
    it to the island your story goes on to, to any island the last log can
    lock onto (seven at Twin Cape; three needles out of Fish-Man Island), or,
    in the Blues, where a compass and a chart are enough, to any island
    you've charted in that sea. A banner names the island (if you've been
    there), which way it lies and how far. Turned off the story's road, the
    log sets wherever you land until you choose the story's island again.
  - An Eternal Pose put in the slot points to its island from anywhere. Once
    you're there, your Log Pose goes back in the slot.
- The **Calm Belt** is full of Sea Kings.
- **Reverse Mountain**:
  - the currents of all four Blues run through stone gates in the Red Line,
    along gorges and **up** the mountain;
  - they meet in a pool on the snowy summit, then pour down into the Grand
    Line past Laboon, the whale who waits;
  - the current does the sailing and only runs one way, so steer for the
    middle of the canal.
- **Swimming** is the breaststroke, as it's taught: out of the glide the
  hands press out wide, sweep down and in under the chest while the head and
  shoulders come up for a breath, meet under the chin and shoot forward just
  under the surface as the heels come up; then the frog kick whips the feet
  out and back together and the body lunges long into the glide. Only the
  head (and the shoulders at each breath) shows above the water; treading
  water you hang upright, in to the shoulders. Swimmers ride the swell — the
  same waves the sea is drawn with — so a crest never washes over a face,
  and they leave a faint V of foam behind, not a string of rings. Coming up
  from a dive, the head breaks the surface with a ring and a few drops, and
  setting off, stopping or surfacing never jolts the body up or down. A
  diver's bubbles rise and burst at the surface.
- The world is big: you can't see the next island from the last one.
- Marine patrols, pirate ships, merchants and flotsam. Pirates keep to
  their own business at sea: they fight only when you fire on them or board
  them. Marines give chase once you're wanted (in the Blues, not much faster
  than a small boat), and a ship that's after you heaves to alongside when
  you stop, so you can board her.
- A News Coo delivers the morning paper.

**Zones.**

- **Skypiea**, reached by the Knock Up Stream off Jaya.
- **Fish-Man Island**, reached by coating your ship at Sabaody and diving
  10,000 m to cross the Red Line.
- **Impel Down**, a prison break.
- **Mary Geoise**, reached by the Bondola if you are a Marine officer or hold
  a (forged) permit. The Holy Land stands on top of the Red Line, level with
  its plateau, and from its edge you can walk out across the top of the
  wall as far as it goes. The Red Line's sheer faces can't be walked up from
  a beach or a Red Port's quay.

**Factions and life.**

- **No chosen destiny.** Character creation has no goal and no crew. You
  decide what to become.
- **The One Piece look.** Characters are drawn in the anime-game style of
  World Seeker: big dark eyes, bold brows, clumped hair, strong builds. The
  creator sets eyes, an easy-going or stern look, mouth, face, nose, a scar
  (across or under the eye), hairstyle (Luffy's messy mop to Zoro's crop),
  frame, build, muscle and clothes, an open kimono among them. People standing
  about fold their arms or put their hands on their hips.
  - **Frames**: lean, athletic, slim, brawny, heavy, lanky, stocky (and
    curvy or petite for women). A frame sets height, leg length, shoulders,
    arms, waist and belly, and the muscle it usually carries. Townsfolk,
    pirates and Marines each roll one that suits their work.
  - Heads are built to read as real heads from every side. In profile the
    brow, nose, lips and chin stand out and the eye is a wedge set back
    from the nose. The eye sits above the nose: level with its bridge, with
    the tip coming out below the lower lid. The jaw turns up at its angle
    under the ear, and the skull ends at the nape above a neck as thick as
    a real one, rising to meet it (not a ball on a stick). A high sun lights
    the whole face; it doesn't leave a dark band across the cheeks.
  - Pecs, abs, deltoids, biceps and calves are modelled and inked, and the
    faces are lit in 3D. Long hair and coat tails swing as you move. Skirts
    and dresses hang from panels round the waist that swing out to clear the
    legs (a long one bends again at the knee), so no knee or shin comes
    through the cloth walking, running or sitting.
  - Open shirts, vests, kimonos and coats lie down onto the chest along the
    opening, a kimono's collar running clean down the V. An untucked shirt
    hangs over the hips. A woman's open top has a bikini top under it, as
    Nami's and Robin's do (its colour is "Top under" in the creator), and
    "Chest wrap" is her bare-chested choice.
  - **Weapons are worn**: an equipped sword hangs at the left hip, a pistol
    in its holster, a staff or an axe across the back. Its hotbar key draws
    it (the hand goes to the hilt and pulls it out along the sheath into
    your stance) and puts it back again.
  - In first person the view rides your head: lean into a sprint or lunge
    into a heavy blow and your eyes go with it (never through a wall). Your
    arms hang from your eyes, so a lunge doesn't carry them out ahead of
    you a second time. A weapon's swing is seen the way your eyes would see
    it: wound up at your side (the arm never folds back past your head),
    the blade sweeping across the view, a heavy chop raised over your
    shoulder and brought down through the middle; with one blade the other
    hand stays down out of the way. A pistol is held low on the right, as in
    any shooter; a staff or an axe is swung in both hands, the other hand on
    the shaft (a staff gripped near its end, so its far half never swings
    back into your face), letting go to drop out of the way while a heavy
    blow is drawn back over the shoulder.
  - **Running with a weapon**: it's carried, not swung about like an empty
    arm. Held in its stance, it rocks and dips with each step (in first
    person too, in time with your feet). At a sprint a sword trails low
    behind you, two swords both (the swordsman's run), a gun is held low,
    and a staff or an axe is carried across the body; in first person the
    blade dips down out of your way.
    Look down and you bow your head, as anyone does: you see your chest,
    arms, legs and feet, never your own head, hair or hat, and never into
    yourself. At the helm you look out over the wheel with your hands on
    its spokes, and at the oars down into your lap with your hands on the
    grips. Your head turns as far as a neck turns to where you look; look
    further back over your shoulder than that and your body is left out of
    the view.
- **People at home.** A door opens for whoever is on their way through it
  (you, someone heading home or coming out) and swings shut a moment after
  they're through, not for everyone who walks past the house. Kick a door in
  and the people inside keep clear of you: to the far side of the room, or
  out of the door once you aren't between them and it. Nobody runs on the
  spot into a wall (arms and knees through it): pressed against one, you
  stand still, and people look the way they're really going. A house kept by
  someone very tall (Kuma's church, Jerry's boxing gym) is built taller to
  fit them, doorway and ceiling and all.
- **Reputation** (from Villain to Hero of the Seas):
  - Crimes lower it: stealing from shops, breaking into houses, picking
    pockets, beating townsfolk, sinking merchants. At **Outlaw (-25)** the
    world treats you as a pirate.
  - Good deeds raise it: quests, freeing islands, defeating pirates.
- **Your own pirate crew**: found it from the Crew menu. Name it and design
  your **Jolly Roger**. The flag flies from the sails of every ship you own.
  (Before you found a crew your ships fly no colours.)
- **Crew**: recruit nakama in the world (navigator, cook, doctor,
  shipwright, sniper, musician, archaeologist, helmsman, fighters). Each
  gives a passive bonus, and fighters follow you on land.
- **Marines**:
  - Enlist with reputation 25+ and a clean record, then climb from Seaman
    Recruit to Fleet Admiral. Each promotion needs merit **and** a better
    reputation.
  - Salary, missions, Rokushiki and warships come with the ranks.
  - From Lieutenant, Marines follow you on land. From Captain, **escort
    ships** sail in formation with your flagship and engage pirates. A Vice
    Admiral commands a fleet of three.
  - Desertion costs you.
- **Equipment**: head, body armour, up to three swords and two accessory
  slots (rings, earrings, sashes, charms…). Armour reduces damage. A weapon
  in hand is what you fight with: without a style for it you swing it with
  its plainest moves.
- **Foraging**: pick coconuts, bananas, mangoes, apples and cherries from
  trees. They grow back in two days.
- **Bounties**: wanted posters, a most-wanted board and bounty hunting.
- **Poneglyphs**: only an archaeologist can read them. The four **Road
  Poneglyphs** reveal the way to **Laugh Tale**.
- **Legends**: great feats the world remembers. They are never chosen, only
  achieved: King of the Pirates, World's Greatest Swordsman, Admiral, Fleet
  Admiral, the All Blue, Map of the World, Brave Warrior of the Sea, the True
  History, Liberator and Emperor of the Sea. Each adds to your Inherited
  Will.

## The world, sea by sea

There are 111 charted islands, 686 named NPCs and 118 side quests, and a main
story of 85 chapters told 206 ways across the three roads, plus three
zones and Mary Geoise. Every arc is told from the point of view of *your*
pirate, Marine or wanderer. The Straw Hats appear as cameos and never as the
player.

**East Blue**
- Foosha Village and the Lord of the Coast, and the Gray Terminal.
- Alvida and Koby; Captain Morgan and the pirate hunter.
- Koshiro and Kuina's promise; Buggy's circus; Gaimon.
- Kuro's plot, which rewards the caravel Going Merry.
- The Baratie, Don Krieg and a visit from Mihawk.
- Arlong Park.
- Loguetown, with Roger's execution platform and Smoker.

**North Blue**
- Lvneel and Noland's legend.
- Flevance, the White Town, and its Amber Lead.
- Spider Miles, the young Donquixote Family and Law's past.
- Minion Island and the Ope Ope no Mi.
- Swallow Island, where the Heart Pirates form.
- The Germa Kingdom.

**West Blue**
- Ohara's scholars, who teach you to read Poneglyphs.
- God Valley's remnants.
- Kano Country's Hasshoken trials.
- Capone Bege's Fire Tank Family in Las Camp.
- Ilisia, and the Asshina colosseum of the Longleg tribe.

**South Blue**
- Baterilla and Portgas D. Rouge.
- The Karate Island tournament and Torino Kingdom's giant birds.
- Sorbet Kingdom, with Kuma the pastor-king and the Tyrant story.
- Briss and the St. Briss.
- Kid's gang on Kutsukku, and Centaurea's revolution.

**Paradise, first half**
- Twin Cape and Laboon, then the seven routes.
- Whisky Peak and Little Garden's hundred-year duel.
- Drum Island's cherry blossoms.
- The Alabasta civil war and Crocodile.
- Jaya and the Knock Up Stream to **Skypiea**, where Enel waits.
- The Davy Back Fight.

**Paradise, second half and the Calm Belt**
- Water 7, CP9 and the Enies Lobby raid.
- Thriller Bark and Moria's shadow theft.
- Sabaody: Rayleigh's Haki, the auction and ship coating.
- The Summit War at Marineford.
- The **Impel Down** breakout.
- Amazon Lily, Kuraigana (Mihawk), Momoiro and Rusukaina.

**New World, first half**
- **Fish-Man Island**, with Hody and Decken.
- Punk Hazard; Dressrosa, with the Corrida Colosseum and the Birdcage.
- Green Bit and Zou (Road Poneglyph).
- Whole Cake Island, with the tea party and a Road Poneglyph.

**New World, second half**
- Wano, Onigashima and Kaido (Road Poneglyph).
- Egghead and Elbaph.
- Blackbeard's Hachinosu.
- Lodestar, then **Laugh Tale** and the One Piece.

## Development

```
npm install
npm run build        # bundles src/ → dist/game.js and dist/onepiece.html
npm run serve        # http://localhost:8080
npm test             # content validator: generates the world and cross-checks every island/NPC/quest/dialogue
node tools/validate.mjs [--fast] [--pack=<id>]
node tools/shot.mjs <scenario>   # headless Chromium play-tests with screenshots (boot, create, play, zones, systems, quest, resume, look, menus, marines, dreveal, fight…)
node tools/shot.mjs perf         # frame cost in a town (day and night), a harbour, at sea and on a reef
node tools/shot.mjs hitch --w=320 --h=180 [--cpu]   # per-frame JS time running through a town and sailing past an island: the worst frames, shaders compiled on the way
node tools/storycheck.mjs        # the main story: every chapter, road, contact and target resolves
node tools/townaudit.mjs [--all] # every town (built-on share, empty paving, crowd), landmark (floating, sunk, in water, trees through it), overlap, and the walk from each town to its pier
node tools/townaudit.mjs --barriers | --rock      # what blocks whole tiles; unwalkable rock drawn gently enough to look walkable
node tools/shot.mjs barrierhunt [--islands=a,b,c] [--snap] --w=320 --h=180   # invisible barriers: walk out from all over each town every way and flag each stop with nothing drawn in front of it (and what stopped you)
node tools/shot.mjs townwatch [--island=lvneel]   # a town's people over a minute (stuck, inside things, on steps, bunched up), street and air shots
node tools/shot.mjs towntour --islands=a,b,c      # each town photographed from the air
node tools/shot.mjs viewdist [--rd=<chunks>]      # the render distance: a big town from its square, 130 m and 250 m off, the air and the sea
node tools/shot.mjs c3hairclose [--styles=a,b] [--fem=1] [--hat=straw]   # hairstyles close up: front, side and back, four at a time
node tools/shot.mjs c3crew [--only=crew,town,faces] [--side]   # the Straw Hats lined up like the World Seeker key art, random townsfolk, face close-ups
node tools/shot.mjs c3body [--only=men,women]   # frames and muscles, front, side and back
node tools/shot.mjs c3ears                      # ears and profiles, side-on and three-quarter
node tools/shot.mjs c3profile [--only=man,woman,…] [--views=side,34,front]   # heads held still up close in town: profiles and three-quarters
node tools/heads3d-sheet.mjs [--only=…|--hairs=…|--fhairs=…|--races=…] [--views=front,34,side,back] [--light=noon] [--lod=2|1]   # heads from every side on a stage, in seconds (no game boot)
node tools/shot.mjs c3tops [--fem=0|1] [--tops=a,b]   # every top style on a man and a woman, front and three-quarter
node tools/shot.mjs fpbody                      # first person: looking down standing, walking, sprinting, in a heavy blow's lunge
node tools/shot.mjs fphelm                      # first person at a caravel's helm (ahead, down at the wheel, back) and a rowboat's oars
node tools/shot.mjs c3motion [--looks=longskirt,dress,skirt,coat,longarm] [--sit]   # clothes and hair moving: standing, walking, running, stopping (and sat down)
node tools/shot.mjs c3draw [--wpns=fine_katana,flintlock,bo_staff] [--modes=third,first]   # weapons worn, drawn from the hotbar and sheathed, part way through
node tools/shot.mjs fpweapons [--wpns=rusty_katana,flintlock] [--skip=run,atk] [--pitches=-0.08,-0.75]   # first person per weapon: ready, running, sprinting, a combo and a heavy, frame by frame
node tools/shot.mjs c3carry [--wpns=sword,sword2,gun,staff,axe]   # third person: a weapon carried at a run and a sprint
node tools/zfight.mjs [--island=<id>] [--kinds=building] [--per=3]   # z-fighting: every object in the world built as the game does; faces in one plane, facing the same way and overlapping, that can be seen (grouped by cause)
node tools/zfight.mjs --ships [--part=hull|inside] | --inspect=<object id>   # the same over every ship class; one object's worst pairs with their triangles
node tools/shot.mjs probeshots --js=<file>        # several camera views in one run (the file returns [{ x, y, yaw, pitch }])
node tools/shot.mjs story [--path=pirate|marine|hunter]   # plays the story's start, then fast-forwards through all three parts
node tools/shot.mjs storydrift | storyswitch               # the Grand Line's currents; the story following a change of road
node tools/shot.mjs rmride       # rides Reverse Mountain from the East Blue gate to the Grand Line
```

In the page, `window.OP.prof` is a frame profiler: set `OP.prof.PROF.on = true`
and `OP.prof.PROF.t` fills with milliseconds per section (sim, render, each
frame hook, each built prop kind…); `OP.prof.PROF.trace = []` records every
frame separately.

**Engine.** Plain ES modules bundled by esbuild.

- WebGL2 terrain shader: one texel per tile plus a signed-distance coastline.
- Canvas2D for props, characters, ships and effects.
- DOM for the UI.

**Code layout.**

- `src/world/`: world generation (Red Line, Reverse Mountain, islands,
  towns, zones).
- `src/game/`: gameplay systems (combat, abilities, AI, lives, progression,
  reputation, foraging, quests, sea, zones, crew, factions, legends, saving).
- `src/ui/`: HUD and sidebar, menus (inventory, character, skills, journal,
  crew), title and creation screens. `src/render/icons.js` draws every icon.
- `src/data/`: races, styles, fruits, items, ships, trainers, and island data
  per sea.
- `src/content/`: NPCs, bosses, quests and events per sea. See
  [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) for how to write content.
- `src/content/mainStory.js` and `src/content/main/`: the main story. The
  chapters are data (`homes.js`, `blues.js`, `grandLine.js`, `newWorld.js`,
  built with `define.js`), and `mainStory.js` turns them into quests and
  people.

## Disclaimer

This is an unofficial, non-commercial fan project. *One Piece* and all of its
characters, places and names belong to Eiichiro Oda, Shueisha and Toei
Animation. Every graphic and sound in this game is generated procedurally in
code; no official assets are used.
