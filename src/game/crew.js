// Crew: companions recruited from the world. A recruitable NPC carries
// `recruit: { role, fighter?, cost?, requires?(char, game), pitch?, accept? }`
// on its definition; the "Join my crew" choice is added to its dialogue
// automatically. Roles give passive bonuses; fighters follow you on land.
export const CREW_ROLES = {
  fighter: { name: 'Combatant', icon: '⚔', desc: 'Fights beside you on land.' },
  swordsman: { name: 'Swordsman', icon: '🗡', desc: 'Fights beside you on land with a blade.' },
  navigator: { name: 'Navigator', icon: '🧭', desc: 'Log Pose sets twice as fast, storms are announced early, +10% sailing speed.' },
  cook: { name: 'Cook', icon: '🍳', desc: 'Food heals 50% more; stamina regenerates at sea.' },
  doctor: { name: 'Doctor', icon: '🩺', desc: 'Patches you up after every battle (heals 30% when combat ends).' },
  shipwright: { name: 'Shipwright', icon: '🔨', desc: 'Repairs your ship slowly while sailing.' },
  sniper: { name: 'Sniper', icon: '🎯', desc: 'Cannons deal 30% more damage.' },
  musician: { name: 'Musician', icon: '🎻', desc: 'Stamina regenerates 25% faster.' },
  archaeologist: { name: 'Archaeologist', icon: '📜', desc: 'Can read Poneglyphs.' },
  helmsman: { name: 'Helmsman', icon: '⎈', desc: 'Your ship turns 25% faster.' },
};
