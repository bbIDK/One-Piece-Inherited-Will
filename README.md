# One Piece: Inherited Will

*Inherited Will* is a fan-made, browser-based roguelike set on the whole Blue
Planet of **One Piece**. It works like Rogue Lineage: you have a handful of
lives, death is permanent, and your will passes on to the next generation.

> "Inherited Will, the Swell of the Ages, and the Dreams of the People. As long as people continue to pursue the meaning of Freedom, these things will never cease!" — Gol D. Roger

## Playing

**To play:**

- Open **`dist/onepiece.html`** in a modern browser (Chrome, Edge or
  Firefox with WebGL2). It is one self-contained file.
- Or run `npm install && npm run build && npm run serve` and open
  <http://localhost:8080>.

The game saves itself to `localStorage` and cannot be reloaded to undo a death.

### Controls

| Key | On foot | At sea |
|---|---|---|
| WASD | move | W/S sails, A/D steer |
| Shift | sprint | Coup de Burst (some ships) |
| Space | dodge (i-frames) | row (works without wind) |
| Left / right click | combo / heavy attack | broadside toward the mouse |
| F | block — tap just before a hit to **parry** | |
| 1–6 | techniques (styles, Devil Fruit, dials) | |
| R / T / G | Armament / Observation / Conqueror's Haki | |
| E | talk, enter, board, go ashore, examine | dive, knock-up, go ashore |
| Q | eat | |
| I, C, K, J, U, M | inventory, character, skills, journal, **crew**, world map | |
| H / Esc | help / menu | |

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

**Lineage (roguelike).**

- **Race** is rolled with rarities: Human, Fish-Man, Mink, Skypiean, Longarm,
  Longleg, Buccaneer, Three-Eye or Lunarian. Race decides which Blue and
  which town you are born in.
- **Traits** include the hidden **Will of D.** and **King's Disposition**.
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

**No grinding.**

- Weak enemies teach nothing. You grow by:
  - sparring with and training under **masters** (once per day),
  - fighting opponents who are a real threat,
  - **breakthroughs** from defeating named foes and bosses,
  - island story quests,
  - Devil Fruit mastery,
  - Haki.
- **Doriki** measures your power.

**Combat.**

- Fighting styles with canon techniques: brawling, One/Two/Three Sword Style,
  Black Leg, Fish-Man Karate, Rokushiki, sniping, Okama Kenpo, Electro,
  Hasshoken, Weather Science, Elbaf, and Dragon Claw.
- About 32 **Devil Fruits** (Paramecia, Zoan, Logia), with canon rules:
  - Logia intangibility unless you use Haki, seastone or their weakness;
  - rubber versus lightning;
  - fruit users can't swim;
  - a second fruit kills you.
- Haki: Armament (with Emission and Ryuo), Observation (with Future Sight)
  and Conqueror's (with Infusion).
- Parry, guard breaks, i-frame dodges, finishers and anime impact frames.

**The sea.**

- Ships range from a rowboat to an Adam-wood brig. There is wind, Grand Line
  weather that changes its mind, and rogue waves.
- **Log Pose** navigation: stay on an island until the log sets, and use
  Eternal Poses.
- The **Calm Belt** is full of Sea Kings. **Reverse Mountain** carries you
  into the Grand Line.
- Marine patrols, pirate ships, merchants and flotsam.
- A News Coo delivers the morning paper.

**Zones.**

- **Skypiea**, reached by the Knock Up Stream off Jaya.
- **Fish-Man Island**, reached by coating your ship at Sabaody and diving
  10,000 m to cross the Red Line.
- **Impel Down**, a prison break.
- **Mary Geoise**, reached by the Bondola if you are a Marine officer or hold
  a (forged) permit.

**Factions and life.**

- **Crew**: recruit nakama in the world (navigator, cook, doctor,
  shipwright, sniper, musician, archaeologist, helmsman, fighters). Each
  gives a passive bonus, and fighters follow you on land.
- **Marines**: enlist with a clean record, then climb from Seaman Recruit to
  Fleet Admiral. Merit, missions, salary, Rokushiki and warships come with
  the ranks. Desertion costs you.
- **Bounties**: wanted posters, a most-wanted board and bounty hunting.
- **Poneglyphs**: only an archaeologist can read them. The four **Road
  Poneglyphs** reveal the way to **Laugh Tale**.
- **Dreams**: King of the Pirates, World's Greatest Swordsman, All Blue,
  Admiral, the True History, the World Map, Liberation, and the Strongest
  Warrior.

## The world, sea by sea

There are 111 charted islands, 549 named NPCs and 118 quests, plus three
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
node tools/shot.mjs <scenario>   # headless Chromium play-tests with screenshots (boot, create, play, zones, systems, quest, resume, look)
```

**Engine.** Plain ES modules bundled by esbuild.

- WebGL2 terrain shader: one texel per tile plus a signed-distance coastline.
- Canvas2D for props, characters, ships and effects.
- DOM for the UI.

**Code layout.**

- `src/world/`: world generation (Red Line, Reverse Mountain, islands,
  towns, zones).
- `src/game/`: gameplay systems (combat, abilities, AI, lives, progression,
  quests, sea, zones, crew, factions, legends).
- `src/data/`: races, styles, fruits, items, ships, trainers, and island data
  per sea.
- `src/content/`: NPCs, bosses, quests and events per sea. See
  [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) for how to write content.

## Disclaimer

This is an unofficial, non-commercial fan project. *One Piece* and all of its
characters, places and names belong to Eiichiro Oda, Shueisha and Toei
Animation. Every graphic and sound in this game is generated procedurally in
code; no official assets are used.
