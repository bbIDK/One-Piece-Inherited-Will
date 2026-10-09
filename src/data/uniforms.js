// Marine uniforms: what you wear at each rank (One Piece's Navy, roughly).
//  * Seamen: the white sailor's uniform — white top, blue neckerchief,
//    white cap ("MARINE").
//  * Petty officers: the same, with navy trousers.
//  * Warrant and junior officers: a white shirt and tie under a navy jacket.
//  * Commanders and up: a dark suit.
//  * Captains and up: the white coat of Justice over the shoulders.
// Worn over your own clothes while you serve (the Marine panel can take it
// off); a hat or a coat you equip yourself still wins.

const SEAMAN = { topStyle: 'shirt', top: '#f5f6fa', bottom: '#f5f6fa', tie: '#1f5fa8', waist: 'belt', belt: '#2d3436', shoeStyle: 'boots', shoes: '#2d3436', hat: 'marine' };
const PETTY = { ...SEAMAN, bottom: '#1b2f4e', tie: '#163d7a' };
const JUNIOR = { topStyle: 'jacket', top: '#1b2f4e', top2: '#f5f6fa', tie: '#163d7a', bottom: '#1b2f4e', waist: 'belt', belt: '#141a22', shoeStyle: 'shoes', shoes: '#141414', hat: 'marine' };
const SENIOR = { ...JUNIOR, top: '#22252b', bottom: '#22252b', tie: '#7f1d1d', hat: null };
const JUSTICE = { coat: '#fafafa', coatText: 'JUSTICE' };

const TIERS = [
  [['Seaman Recruit', 'Seaman Apprentice', 'Seaman First Class'], SEAMAN, 'Sailor\'s whites'],
  [['Petty Officer', 'Chief Petty Officer', 'Master Chief Petty Officer'], PETTY, 'Petty officer\'s whites'],
  [['Warrant Officer', 'Ensign', 'Lieutenant Junior Grade', 'Lieutenant', 'Lieutenant Commander'], JUNIOR, 'Officer\'s navy jacket'],
  [['Commander'], SENIOR, 'Commander\'s suit'],
  [['Captain', 'Commodore', 'Rear Admiral', 'Vice Admiral', 'Admiral', 'Fleet Admiral'], { ...SENIOR, ...JUSTICE }, 'Suit and the coat of Justice'],
];

/** The uniform for a Marine rank: { look, name } (null for no rank). */
export function marineUniform(rank) {
  if (!rank) return null;
  const t = TIERS.find(([names]) => names.includes(rank)) || TIERS[0];
  const look = { ...t[1] };
  if (look.hat === null) delete look.hat;
  return { look, name: t[2] };
}
