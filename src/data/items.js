// Items. `type`: food | medicine | weapon | hat | coat | accessory | key | dial | fruit | treasure | material | pose
// Equipment slots: head (hat), body (coat — coats, cloaks and armour; `armor`
// is damage reduction), weapons (up to three swords, else one), two accessories.
// Weapons: kind sword/gun/staff/axe and a power multiplier (sword grades follow canon:
// Saijo O Wazamono > O Wazamono > Ryo Wazamono > Wazamono > unranked).
import { FRUITS } from './fruits.js';

export const ITEMS = {
  // ---------------------------------------------------------------- food
  meat: { name: 'Meat on the Bone', icon: '🍖', type: 'food', heal: 70, price: 90, desc: 'The universal fuel of every rubber-brained captain.' },
  rice_ball: { name: 'Rice Ball', icon: '🍙', type: 'food', heal: 40, price: 45, desc: 'Simple, salty, filling.' },
  fish_stew: { name: 'Sea Fish Stew', icon: '🍲', type: 'food', heal: 110, price: 180, desc: 'A sailor\'s favourite.' },
  tangerine: { name: 'Bell-mère\'s Tangerine', icon: '🍊', type: 'food', heal: 35, price: 60, desc: 'From the groves of Cocoyasi Village.' },
  fresh_fish: { name: 'Fresh Fish', icon: '🐟', type: 'food', heal: 45, price: 40, desc: 'Caught with your bare hands. Better cooked, but it will do.' },
  tuna: { name: 'Bluefin Tuna', icon: '🐟', type: 'food', heal: 160, price: 420, desc: 'A fat, fast fish from the open sea. A cook would weep with joy.' },
  elephant_tuna: { name: 'Elephant Honmaguro', icon: '🐟', type: 'food', heal: 320, price: 1400, desc: 'A giant tuna with an elephant\'s trunk and ears — the finest eating in the sea. Sanji would kill for one.' },
  sea_king_steak: { name: 'Sea King Steak', icon: '🥩', type: 'food', heal: 400, price: 2500, desc: 'Enough meat to feed a crew for a week.' },
  baratie_course: { name: 'Baratie Full Course', icon: '🍽', type: 'food', heal: 300, price: 1200, buff: { id: 'well_fed', name: 'Well Fed', dur: 180, mods: { damage: 1.1 } }, desc: 'Cooked by "Red Leg" Zeff\'s kitchen. Leaves you Well Fed.' },
  sake: { name: 'Sake', icon: '🍶', type: 'food', heal: 10, price: 120, buff: { id: 'tipsy', name: 'Tipsy', dur: 60, mods: { damage: 1.08, defMul: 1.1 } }, desc: 'Dutch courage.' },
  cola: { name: 'Cola Barrel', icon: '🥤', type: 'material', price: 500, desc: 'Fuel for Coup de Burst and for certain cyborgs.' },
  bandage: { name: 'Bandages', icon: '🩹', type: 'medicine', heal: 55, price: 70, desc: 'Stops the bleeding.', cure: ['bleed'] },
  antidote: { name: 'Antidote', icon: '🧪', type: 'medicine', heal: 20, price: 150, cure: ['poison'], desc: 'Neutralises most poisons.' },
  rumble_ball: { name: 'Rumble Ball', icon: '🟡', type: 'medicine', price: 8000, buff: { id: 'rumble', name: 'Rumble', dur: 180, mods: { damage: 1.2, speedMul: 1.1 } }, desc: 'Chopper\'s invention. Strengthens you for three minutes.' },
  // foraged from trees (E next to a palm or fruit tree)
  coconut: { name: 'Coconut', icon: '', type: 'food', heal: 30, price: 25, desc: 'Crack it open: sweet water and white flesh. Picked from palms.' },
  banana: { name: 'Banana', icon: '', type: 'food', heal: 25, price: 20, desc: 'Quick energy from a jungle tree.' },
  mango: { name: 'Mango', icon: '', type: 'food', heal: 40, price: 35, desc: 'Ripe, juicy and sticky.' },
  apple: { name: 'Apple', icon: '', type: 'food', heal: 25, price: 15, desc: 'Crisp and red.' },
  cherry: { name: 'Cherries', icon: '', type: 'food', heal: 12, price: 10, desc: 'A handful of cherries.' },
  tension_hormone: { name: 'Tension Hormones', icon: '💉', type: 'medicine', heal: 99999, price: 0, costsLife: true, desc: 'Emporio Ivankov\'s miracle: fully restores you right now — at the cost of ten years of lifespan (one life).' },

  // ------------------------------------------------------------- swords
  wooden_sword: { name: 'Wooden Practice Sword', icon: '🪵', type: 'weapon', kind: 'sword', power: 0.75, price: 300, grade: 'Training', desc: 'Every swordsman starts with one.' },
  rusty_katana: { name: 'Rusty Katana', icon: '🗡', type: 'weapon', kind: 'sword', power: 1.0, price: 1500, grade: 'Unranked', desc: 'Nicked and rusted, but it cuts.' },
  cutlass: { name: 'Pirate Cutlass', icon: '🗡', type: 'weapon', kind: 'sword', power: 1.1, price: 3500, grade: 'Unranked' },
  marine_saber: { name: 'Marine Saber', icon: '⚔', type: 'weapon', kind: 'sword', power: 1.15, price: 6000, grade: 'Unranked' },
  fine_katana: { name: 'Fine Katana', icon: '🗡', type: 'weapon', kind: 'sword', power: 1.25, price: 18000, grade: 'Unranked', desc: 'Well-balanced steel from a Loguetown forge.' },
  yubashiri: { name: 'Yubashiri', icon: '🗡', type: 'weapon', kind: 'sword', power: 1.35, price: 100000, grade: 'Wazamono', desc: 'A light, sharp blade sold in Ipponmatsu\'s shop.' },
  sandai_kitetsu: { name: 'Sandai Kitetsu', icon: '🩸', type: 'weapon', kind: 'sword', power: 1.45, price: 0, grade: 'Wazamono (cursed)', cursed: true, desc: 'A cursed blade said to bring doom to its wielders. Throw it into the air and see if fate spares your arm.' },
  shigure: { name: 'Shigure', icon: '🗡', type: 'weapon', kind: 'sword', power: 1.4, price: 250000, grade: 'Wazamono' },
  wado_ichimonji: { name: 'Wado Ichimonji', icon: '🤍', type: 'weapon', kind: 'sword', power: 1.6, price: 0, grade: 'O Wazamono', unique: true, desc: 'The white-hilted sword of Kuina, entrusted by Koshiro of Shimotsuki Village.' },
  shusui: { name: 'Shusui', icon: '🖤', type: 'weapon', kind: 'sword', power: 1.75, price: 0, grade: 'O Wazamono', unique: true, desc: 'The black blade of the legendary samurai Ryuma, won at Thriller Bark.' },
  enma: { name: 'Enma', icon: '🔥', type: 'weapon', kind: 'sword', power: 1.95, price: 0, grade: 'O Wazamono', unique: true, hakiHungry: true, desc: 'The blade that cut Kaido. It draws out its wielder\'s Haki whether they like it or not.' },
  yoru: { name: 'Yoru', icon: '✝', type: 'weapon', kind: 'sword', power: 2.3, price: 0, grade: 'Saijo O Wazamono', unique: true, desc: 'The black blade of Dracule Mihawk, one of the twelve Supreme Grade swords.' },

  // --------------------------------------------------------------- guns
  slingshot: { name: 'Slingshot', icon: '🎯', type: 'weapon', kind: 'gun', power: 0.9, price: 800, desc: 'Lead stars at the ready.' },
  flintlock: { name: 'Flintlock Pistol', icon: '🔫', type: 'weapon', kind: 'gun', power: 1.05, price: 4000 },
  marine_rifle: { name: 'Marine Rifle', icon: '🔫', type: 'weapon', kind: 'gun', power: 1.2, price: 16000 },
  kabuto: { name: 'Kabuto', icon: '🪲', type: 'weapon', kind: 'gun', power: 1.35, price: 0, unique: true, desc: 'A giant slingshot with a Dial built in.' },
  kuro_kabuto: { name: 'Kuro Kabuto', icon: '🪲', type: 'weapon', kind: 'gun', power: 1.6, price: 0, unique: true },
  // ------------------------------------------------------------- staffs
  bo_staff: { name: 'Bo Staff', icon: '🦯', type: 'weapon', kind: 'staff', power: 1.0, price: 2000 },
  clima_tact: { name: 'Clima-Tact', icon: '🌦', type: 'weapon', kind: 'staff', power: 1.2, price: 60000, desc: 'A weather-controlling staff.' },
  sorcery_clima_tact: { name: 'Sorcery Clima-Tact', icon: '⛈', type: 'weapon', kind: 'staff', power: 1.6, price: 0, unique: true, desc: 'Improved with Weatherian science.' },
  // --------------------------------------------------------------- axes
  woodsman_axe: { name: 'Woodsman\'s Axe', icon: '🪓', type: 'weapon', kind: 'axe', power: 1.1, price: 2500 },
  giant_axe: { name: 'Axe of a Giant Warrior', icon: '🪓', type: 'weapon', kind: 'axe', power: 1.6, price: 0, unique: true, desc: 'A gift from the giants of Little Garden. Absurdly heavy.' },
  morgan_axe: { name: 'Axe-Hand', icon: '🪓', type: 'weapon', kind: 'axe', power: 1.3, price: 0, desc: 'Taken from Captain Morgan.' },

  // --------------------------------------------------------- hats / coats
  straw_hat: { name: 'Straw Hat', icon: '👒', type: 'hat', look: { hat: 'straw' }, bonus: { wil: 2 }, price: 500, desc: 'A hat passed down through generations of dreamers. It is said to carry a promise.' },
  bandana: { name: 'Bandana', icon: '🎗', type: 'hat', look: { hat: 'bandana' }, price: 120 },
  tricorne: { name: 'Tricorne', icon: '🎩', type: 'hat', look: { hat: 'tricorne' }, bonus: { wil: 1 }, price: 900 },
  captain_hat: { name: 'Captain\'s Hat', icon: '🎩', type: 'hat', look: { hat: 'captain' }, bonus: { wil: 2 }, price: 4000 },
  cowboy_hat: { name: 'Cowboy Hat', icon: '🤠', type: 'hat', look: { hat: 'cowboy' }, bonus: { agi: 1 }, price: 700 },
  marine_cap: { name: 'Marine Cap', icon: '🧢', type: 'hat', look: { hat: 'marine' }, price: 0 },
  pink_hat: { name: 'Pink Top Hat', icon: '🎀', type: 'hat', look: { hat: 'pinkhat' }, bonus: { vit: 1 }, price: 800 },
  goggles: { name: 'North Blue Goggles', icon: '🥽', type: 'hat', look: { hat: 'goggles' }, bonus: { agi: 1 }, price: 1200, desc: 'A new model from the North Blue. (Usopp bought these in Loguetown.)' },
  headband: { name: 'Black Bandana', icon: '🖤', type: 'hat', look: { hat: 'headband', hatColor: '#212121' }, bonus: { str: 1 }, price: 300, desc: 'Tie it on when you mean business.' },
  traveller_hood: { name: 'Traveller\'s Hood', icon: '', type: 'hat', hood: true, look: { hat: 'hood', hatColor: '#6a5643' }, price: 1800, desc: 'A deep hood that keeps your face in shadow. Marines won\'t know a wanted face unless they get right up close — or you start a fight in it.' },
  black_hood: { name: 'Black Cowl', icon: '', type: 'hat', hood: true, look: { hat: 'hood', hatColor: '#26262b' }, bonus: { agi: 1 }, price: 9000, desc: 'The cowl of a Revolutionary Army field agent. Nobody sees your face.' },
  horned_helm: { name: 'Horned Helm', icon: '⛑', type: 'hat', look: { hat: 'horns' }, bonus: { end: 2 }, price: 0, desc: 'A helm of Elbaf make.' },
  // body armour (the body slot: coats, cloaks and armour)
  padded_vest: { name: 'Padded Vest', icon: '', type: 'coat', armor: 0.04, look: { coat: '#795548' }, bonus: { end: 1 }, price: 1800, desc: 'Quilted canvas that takes the sting out of a cutlass.' },
  leather_jerkin: { name: 'Leather Jerkin', icon: '', type: 'coat', armor: 0.06, look: { coat: '#6d4c33' }, bonus: { agi: 1 }, price: 5500, desc: 'Boiled leather — light enough to dodge in.' },
  chain_shirt: { name: 'Chain Shirt', icon: '', type: 'coat', armor: 0.1, look: { coat: '#90a4ae' }, bonus: { end: 1 }, price: 22000, desc: 'Rings of steel under your shirt. Heavy, but blades slide off.' },
  samurai_armor: { name: 'Samurai Armour', icon: '', type: 'coat', armor: 0.14, look: { coat: '#8e1b16' }, bonus: { end: 2, vit: 1 }, price: 90000, desc: 'Lacquered plates in the style of the Land of Wano.' },
  marine_coat: { name: 'Marine Coat of Justice', icon: '🧥', type: 'coat', look: { coat: '#fafafa', coatText: 'JUSTICE' }, bonus: { end: 1 }, price: 0, desc: 'Worn by Marine officers. "JUSTICE" is stitched on the back.' },
  captain_coat: { name: 'Captain\'s Coat', icon: '🧥', type: 'coat', look: { coat: '#1a237e' }, bonus: { wil: 1 }, price: 12000 },
  red_cloak: { name: 'Red Cloak', icon: '🧣', type: 'coat', look: { coat: '#b71c1c' }, bonus: { vit: 1 }, price: 6000 },

  // ---------------------------------------------------------- accessories (two slots)
  iron_ring: { name: 'Iron Ring', icon: '', type: 'accessory', bonus: { str: 1 }, price: 1500, desc: 'A heavy ring that makes every punch land harder.' },
  shell_bracelet: { name: 'Shell Bracelet', icon: '', type: 'accessory', bonus: { agi: 1 }, price: 900, desc: 'Strung by island children. Light on the wrist.' },
  lucky_charm: { name: 'Lucky Charm', icon: '', type: 'accessory', bonus: { wil: 1 }, price: 800, desc: 'A little wooden charm. Sailors swear by them.' },
  leather_bracers: { name: 'Leather Bracers', icon: '', type: 'accessory', bonus: { end: 1 }, price: 1200, desc: 'For blocking blades with your forearms (not recommended).' },
  haramaki: { name: 'Haramaki', icon: '', type: 'accessory', bonus: { vit: 1, end: 1 }, price: 2400, desc: 'A green belly-warmer. Keeps your insides where they belong.' },
  gold_earrings: { name: 'Three Gold Earrings', icon: '', type: 'accessory', bonus: { agi: 1, wil: 1 }, price: 6000, desc: 'Three small gold drops that clink when you move.' },
  hand_wraps: { name: 'Fighter\'s Hand Wraps', icon: '', type: 'accessory', bonus: { str: 2 }, price: 5000, desc: 'Tight cloth wraps worn by bare-knuckle brawlers.' },
  pearl_necklace: { name: 'Pearl Necklace', icon: '', type: 'accessory', bonus: { vit: 2 }, price: 14000, desc: 'Pearls from the seabed near Fish-Man Island.' },
  red_sash: { name: 'Red Sash', icon: '', type: 'accessory', bonus: { str: 1, wil: 1 }, price: 8000, desc: 'Tied at the waist the way the old Roger Pirates wore theirs.' },
  sea_prism_charm: { name: 'Sea-Glass Charm', icon: '', type: 'accessory', bonus: { end: 2 }, price: 12000, desc: 'Polished sea glass in a brass cage.' },
  marine_medal: { name: 'Medal of Honour', icon: '', type: 'accessory', bonus: { wil: 2, end: 1 }, price: 0, unique: true, desc: 'Awarded by Marine Headquarters for distinguished service.' },
  king_signet: { name: 'Signet of a Fallen King', icon: '', type: 'accessory', bonus: { wil: 3 }, price: 0, unique: true, desc: 'A royal ring from a kingdom erased from the maps.' },

  // ---------------------------------------------------------------- dials
  impact_dial: { name: 'Impact Dial', icon: '🐚', type: 'dial', price: 30000, ability: 'dial_impact', desc: 'Absorbs a blow and releases it. Hurts the user too.' },
  flame_dial: { name: 'Flame Dial', icon: '🔥', type: 'dial', price: 12000, ability: 'dial_flame', desc: 'Stores fire and breathes it out.' },
  breath_dial: { name: 'Breath Dial', icon: '💨', type: 'dial', price: 6000, ability: 'dial_breath', desc: 'Stores wind — boats and gusts.' },
  flash_dial: { name: 'Flash Dial', icon: '💡', type: 'dial', price: 8000, ability: 'dial_flash', desc: 'Blinds everyone nearby.' },
  reject_dial: { name: 'Reject Dial', icon: '💥', type: 'dial', price: 0, ability: 'dial_reject', unique: true, desc: 'Ten times the power of an Impact Dial. Can kill the user.' },

  // -------------------------------------------------------- navigation
  log_pose: { name: 'Log Pose', icon: '🧭', type: 'key', price: 5000, desc: 'The only compass that works in the Grand Line. It locks onto the next island after the log is set.' },
  new_world_log_pose: { name: 'Three-Needle Log Pose', icon: '🧭', type: 'key', price: 60000, desc: 'A Log Pose for the New World: three needles for three islands.' },
  vivre_card: { name: 'Vivre Card', icon: '📃', type: 'key', price: 0, desc: 'A piece of paper made from someone\'s fingernail. It points to them and burns as their life fades.' },
  south_bird: { name: 'South Bird', icon: '🐦', type: 'key', price: 0, desc: 'A bird that always faces south. Needed to find the Knock Up Stream.' },
  adam_wood: { name: 'Adam Wood', icon: '🪵', type: 'material', price: 2000000, desc: 'Timber from the Treasure Tree Adam. Water 7 shipwrights can build a legend with it.' },
  seastone: { name: 'Seastone Chunk', icon: '🪨', type: 'material', price: 40000, desc: 'Stone that emits the same energy as the sea. Devil Fruit users go weak when they touch it.' },
  seastone_cuffs: { name: 'Seastone Handcuffs', icon: '⛓', type: 'key', price: 90000, desc: 'Capture a Devil Fruit user alive.' },
  poneglyph_rubbing: { name: 'Road Poneglyph Rubbing', icon: '🟥', type: 'key', price: 0, stack: true, desc: 'A rubbing of a red Road Poneglyph. Four of them together point to Laugh Tale.' },
  treasure_map: { name: 'Treasure Map', icon: '🗺', type: 'key', price: 0, desc: 'X marks the spot.' },
  den_den_mushi: { name: 'Den Den Mushi', icon: '🐌', type: 'key', price: 3000, desc: 'A transponder snail. Lets you hear the news of the world.' },

  // ------------------------------------------------------------ treasure
  gold_coins: { name: 'Gold Doubloons', icon: '🪙', type: 'treasure', price: 1200, desc: 'Sell them.' },
  jewels: { name: 'Jewels', icon: '💎', type: 'treasure', price: 6000 },
  shark_fin: { name: 'Shark Fin', icon: '🦈', type: 'material', price: 1500, desc: 'Prized by cooks across the Grand Line.' },
  fighting_fish_horn: { name: 'Fighting Fish Horn', icon: '🦴', type: 'material', price: 2200, desc: 'As long as a sword and nearly as sharp. Smiths and shipwrights pay well for them.' },
  shandora_gold: { name: 'Shandora Gold', icon: '🔔', type: 'treasure', price: 80000, desc: 'Gold from the lost city of Shandora.' },
  golden_statue: { name: 'Golden Statue', icon: '🗿', type: 'treasure', price: 25000 },
  pearl: { name: 'Mermaid Pearl', icon: '⚪', type: 'treasure', price: 15000 },
};

// Devil fruits as items
for (const [id, f] of Object.entries(FRUITS)) {
  ITEMS['fruit_' + id] = {
    name: f.name, icon: '🍈', type: 'fruit', fruit: id, price: 0, unique: true,
    desc: `${f.type}. ${f.desc}\n\nEating a Devil Fruit takes away your ability to swim — forever. Eating a second one will kill you.`,
  };
}

export const itemDef = (id) => ITEMS[id];
const FRUIT_VALUE = { common: 150000, uncommon: 300000, rare: 700000, epic: 1500000, legendary: 3000000, mythical: 5000000 };

export function sellPrice(id) {
  const d = ITEMS[id];
  if (!d) return 0;
  if (d.type === 'treasure') return d.price;
  if (d.type === 'fruit') return FRUIT_VALUE[FRUITS[d.fruit]?.rarity] || 200000; // the black market pays for Devil Fruits
  if (d.unique || d.type === 'key') return 0;
  return Math.floor((d.price || 0) * 0.4);
}
