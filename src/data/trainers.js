// Trainers: masters who teach fighting styles, techniques, attribute training
// and Haki. Sparring with a master is how mastery grows without grinding:
// a real duel against someone stronger, once a day.
//   styles:   styles they can teach (cost)
//   teaches:  technique ids they can teach (their learn requirements apply)
//   train:    attribute caps they can train you up to
//   haki:     { type: cap } Haki they can awaken / raise
//   spar:     their sparring opponent (level scales the duel)
export const TRAINERS = {
  // ---------------------------------------------------------- East Blue
  koshiro: {
    name: 'Koshiro', where: 'Isshin Dojo, Shimotsuki Village', styles: { ittoryu: 1500, nitoryu: 8000 },
    teaches: ['itto_iai', 'itto_pound', 'itto_whirl', 'nito_taka', 'nito_nigiri'], train: { str: 25, agi: 25 }, spar: { level: 14, style: 'ittoryu', weapon: 'sword', name: 'Koshiro' },
    lines: ['A sword is not a tool for killing. It is a promise.', 'Again. Your feet are lying to your blade.'],
  },
  zeff: {
    name: '"Red Leg" Zeff', where: 'the Baratie', styles: { black_leg: 3000 },
    teaches: ['bleg_party', 'bleg_antimanner', 'bleg_concasse'], train: { agi: 30, end: 28 }, spar: { level: 18, style: 'black_leg', name: 'Zeff' },
    lines: ['A cook\'s hands are his life. Fight with your legs.', 'Kicks are ten times stronger than punches, brat.'],
  },
  dojo_generic: {
    name: 'Dojo Master', where: 'a town dojo', styles: {}, teaches: ['brawl_tackle', 'brawl_knee', 'brawl_headbutt'], train: { str: 20, end: 20, vit: 20 }, spar: { level: 9, style: 'brawler', name: 'Senior Student' },
    lines: ['Hit the post a thousand times. Then a thousand more.'],
  },
  gunsmith: {
    name: 'Gunsmith', where: 'the range', styles: { sniper: 2500 }, teaches: ['snipe_explode', 'snipe_tabasco', 'snipe_firebird'], train: { agi: 22, wil: 18 }, spar: { level: 10, style: 'sniper', weapon: 'gun', name: 'Range Master' },
    lines: ['Breathe out. Squeeze, don\'t pull.'],
  },
  marine_instructor: {
    name: 'Marine Instructor', where: 'a Marine base', styles: { rokushiki: 20000 }, teaches: ['roku_soru', 'roku_geppo', 'roku_tekkai', 'roku_rankyaku'], train: { str: 30, end: 30, vit: 30 }, spar: { level: 16, style: 'rokushiki', name: 'Drill Sergeant' },
    marineOnly: true, lines: ['Justice needs strong legs. Soru! Again!'],
  },
  // ---------------------------------------------------------- other Blues
  chinjao_master: {
    name: 'Chinjao Family Elder', where: 'Kano Country (West Blue)', styles: { hasshoken: 12000 }, teaches: ['hassho_bushin', 'hassho_drill'], train: { str: 35, end: 30 }, spar: { level: 22, style: 'hasshoken', name: 'Hasshoken Disciple' },
    lines: ['The Hasshoken vibrates through armour. Your guard is meaningless.'],
  },
  karate_master: {
    name: 'Karate Island Grandmaster', where: 'Karate Island (South Blue)', styles: {}, teaches: ['brawl_tackle', 'brawl_knee', 'brawl_headbutt'], train: { str: 35, agi: 30, end: 35 }, spar: { level: 20, style: 'brawler', name: 'Black Belt' },
    lines: ['Boxing, karate, it is all the same: the one who gets up wins.'],
  },
  torino_elder: {
    name: 'Torino Elder', where: 'Torino Kingdom (South Blue)', styles: { electro: 0 }, teaches: ['elec_garchu'], train: { agi: 30, vit: 30 }, spar: { level: 15, style: 'electro', name: 'Mink Hunter' },
    lines: ['The giant birds of Torino fear only lightning.'],
  },
  // --------------------------------------------------------- Grand Line
  bon_clay: {
    name: 'Bon Clay (Mr. 2)', where: 'Nanohana, Alabasta', styles: { okama_kenpo: 15000 }, teaches: ['okama_pirouette', 'okama_swan_dash'], train: { agi: 40, end: 35 }, spar: { level: 26, style: 'okama_kenpo', name: 'Bon Clay' },
    lines: ['The way of the okama is the way of friendship!', 'Un, deux, trois!'],
  },
  ivankov: {
    name: 'Emporio Ivankov', where: 'Momoiro Island, Kamabakka Kingdom', styles: { okama_kenpo: 20000 }, teaches: ['okama_hell_wink', 'bleg_diable', 'bleg_skywalk'], train: { vit: 55, end: 50 }, spar: { level: 45, style: 'okama_kenpo', name: 'Newkama Warrior' },
    lines: ['Hee-haw! You want to become a man? Or a woman? Or stronger?!', 'Hell Memories training! 100 recipes a day!'],
  },
  skypiea_priest: {
    name: 'Priest of Upper Yard', where: 'Skypiea', styles: {}, teaches: [], train: { wil: 45 }, haki: { observation: 40 }, spar: { level: 30, style: 'brawler', name: 'Priest Satori' },
    lines: ['This is Mantra. We hear the voices of all living things.'],
  },
  weatheria_scholar: {
    name: 'Weatheria Scholar', where: 'Weatheria', styles: { weather_science: 30000 }, teaches: ['clima_thunderbolt', 'clima_cyclone', 'clima_mirage', 'clima_zeus'], train: { wil: 45 }, spar: { level: 28, style: 'weather_science', weapon: 'staff', name: 'Weather Scientist' },
    lines: ['Weather is science, not magic. Although the difference is small.'],
  },
  franky: {
    name: 'Franky', where: 'Franky House, Water 7', styles: {}, teaches: [], train: { str: 45, end: 45 }, spar: { level: 32, style: 'brawler', name: 'Franky Family Brawler' }, shipwright: true,
    lines: ['SUUUPER! You want a ship that can sail to the end of the world? Bring me Adam wood!'],
  },
  galley_la: {
    name: 'Galley-La Foreman', where: 'Water 7', styles: {}, teaches: [], train: { str: 40, end: 40 }, spar: { level: 30, style: 'brawler', name: 'Shipwright' }, shipwright: true,
    lines: ['A ship is a living thing. Treat her right.'],
  },
  rayleigh: {
    name: 'Silvers Rayleigh', where: "Shakky's Rip-off Bar, Sabaody", styles: {}, teaches: ['haki_emission', 'haki_futuresight', 'haki_infusion'], train: { wil: 70, str: 60 }, haki: { armament: 65, observation: 65, conqueror: 60 }, spar: { level: 60, style: 'ittoryu', weapon: 'sword', name: 'Silvers Rayleigh', haki: true },
    lines: ['Haki is the power of doubt-free conviction.', 'Take it easy. Nobody learns this in a day.'],
  },
  kuja: {
    name: 'Kuja Warrior Marguerite', where: 'Amazon Lily', styles: {}, teaches: [], train: { agi: 55, wil: 55 }, haki: { armament: 40, observation: 45 }, spar: { level: 38, style: 'sniper', weapon: 'gun', name: 'Kuja Archer', haki: true },
    lines: ['Every Kuja warrior uses Haki. How do people from outside even survive?'],
  },
  mihawk: {
    name: 'Dracule Mihawk', where: 'Kuraigana Island', styles: { santoryu: 0 }, teaches: ['santo_onigiri', 'santo_108', 'santo_sanzen'], train: { str: 75, agi: 70 }, haki: { armament: 60 }, spar: { level: 70, style: 'ittoryu', weapon: 'sword', name: 'Humandrill', haki: true },
    requires: { mastery: { ittoryu: 30 } },
    lines: ['Humiliating yourself to learn from your enemy... for your dream. That is true strength.'],
  },
  jinbe: {
    name: 'Jinbe', where: 'Fish-Man Island', styles: { fishman_karate: 25000 }, teaches: ['fmk_uchimizu', 'fmk_arabesque', 'fmk_5000', 'fmk_vagabond'], train: { str: 60, end: 60 }, spar: { level: 55, style: 'fishman_karate', name: 'Fish-Man Karate Master' },
    lines: ['Fish-Man Karate controls the water inside all things.'],
  },
  hyogoro: {
    name: 'Hyogoro the Flower', where: 'Udon, Wano Country', styles: {}, teaches: ['haki_ryuo'], train: { str: 70, wil: 70 }, haki: { armament: 80 }, spar: { level: 72, style: 'brawler', name: 'Udon Prisoner', haki: true },
    lines: ['Ryuo is not "coating". Let your Haki flow — let it destroy from within.'],
  },
  kozuki_samurai: {
    name: 'Kozuki Retainer', where: 'Flower Capital, Wano', styles: { nitoryu: 20000, ittoryu: 5000 }, teaches: ['nito_taka', 'nito_nigiri', 'santo_asura'], train: { str: 75, agi: 75 }, spar: { level: 70, style: 'nitoryu', weapon: 'sword', name: 'Samurai', haki: true },
    lines: ['Oden-sama\'s two-sword style could cut even the Emperor\'s scales.'],
  },
  elbaf_warrior: {
    name: 'Giant Warrior', where: 'Elbaf (or Little Garden)', styles: { elbaf: 30000 }, teaches: ['elbaf_hakoku'], train: { str: 80, vit: 80, end: 70 }, spar: { level: 60, style: 'elbaf', weapon: 'axe', name: 'Giant Warrior' },
    lines: ['GEGYAGYAGYA! Show us the pride of a warrior!'],
  },
  zou_minks: {
    name: 'Nekomamushi / Inuarashi\'s Guard', where: 'Zou', styles: { electro: 0 }, teaches: ['elec_garchu', 'elec_sulong'], train: { agi: 75, str: 65 }, spar: { level: 58, style: 'electro', name: 'Musketeer', haki: true },
    lines: ['Garchu! Every Mink is a warrior.'],
  },
  revolutionary: {
    name: 'Revolutionary Officer', where: 'Baltigo / Momoiro Island', styles: { ryusoken: 40000 }, teaches: ['ryu_claw', 'ryu_hiken'], train: { str: 65, agi: 60 }, spar: { level: 52, style: 'ryusoken', name: 'Revolutionary Soldier', haki: true },
    lines: ['Freedom is not given. It is taken back.'],
  },
  cp_defector: {
    name: 'Ex-CP9 Agent', where: 'Water 7 back alleys', styles: { rokushiki: 60000 }, teaches: ['roku_soru', 'roku_geppo', 'roku_tekkai', 'roku_rankyaku', 'roku_kamie', 'roku_rokuogan'], train: { str: 55, agi: 60 }, spar: { level: 50, style: 'rokushiki', name: 'Former Agent' },
    lines: ['Doriki is just a number. Six powers, one body.'],
  },
};
