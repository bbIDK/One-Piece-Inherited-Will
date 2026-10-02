// Haki — the power of will. Three colours:
//  Armament (Busoshoku): harden body/weapon, strike Logias, later Emission & Ryuo.
//  Observation (Kenbunshoku): sense intent; see attacks coming, auto-evade, Future Sight.
//  Conqueror's (Haoshoku): born in one of millions. Overwhelm the weak-willed.
// Each type has a level 0-100 raised by training with masters and by using it
// against worthy opponents.
import { registerAbilities } from '../game/abilities.js';

export const HAKI = {
  armament: {
    name: 'Armament Haki', jp: 'Busoshoku Haki', icon: '🖤', color: '#212121', key: 'R',
    desc: 'Coat your body in invisible armour. Hits Logia users, hardens your guard. Drains Haki while active.',
    masters: ['Silvers Rayleigh (Sabaody / Rusukaina)', 'The Kuja warriors (Amazon Lily)', 'Hyogoro (Wano — Ryuo)', 'Dracule Mihawk (Kuraigana)'],
  },
  observation: {
    name: 'Observation Haki', jp: 'Kenbunshoku Haki', icon: '👁', color: '#ce93d8', key: 'T',
    desc: 'Hear the voices of all living things. Enemy attacks are telegraphed earlier and you may evade automatically. Called "Mantra" in Skypiea.',
    masters: ['The Priests of Skypiea (Mantra)', 'The Kuja warriors (Amazon Lily)', 'Silvers Rayleigh', 'Charlotte Katakuri (Future Sight)'],
  },
  conqueror: {
    name: "Conqueror's Haki", jp: 'Haoshoku Haki', icon: '👑', color: '#d50000', key: 'G',
    desc: 'The Haki of kings. It cannot be trained into existence — only awakened. Makes the weak-willed faint.',
    masters: ['Only one in several million is born with it. Rayleigh can teach you to control it.'],
  },
};

export const HAKI_ABILITIES = [
  { id: 'haki_emission', name: 'Armament: Emission', icon: '🌑', hakiType: 'armament', anim: 'punch', windup: 0.3, recover: 0.3, cd: 7, cost: { haki: 18 }, desc: 'Launch your Haki beyond your body in a shockwave.', learn: { haki: 'armament', level: 35 },
    steps: [{ proj: { speed: 20, range: 11, radius: 0.6, damage: 28, sprite: 'shockwave', color: '#212121', pierce: true, knockback: 7, stun: 0.5, heavy: true } }] },
  { id: 'haki_ryuo', name: 'Ryuo: Internal Destruction', icon: '💢', hakiType: 'armament', anim: 'heavy', windup: 0.35, recover: 0.35, cd: 10, cost: { haki: 25 }, desc: 'Flow Haki into the enemy and destroy them from within. Ignores guards and armour. (Taught in Wano.)', learn: { haki: 'armament', level: 55 },
    steps: [{ hit: { shape: 'arc', range: 1.7, arc: 1.2, offset: 0.3, damage: 60, knockback: 10, stun: 0.9, heavy: true, unblockable: true, haki: true, trueDamage: true, impactFrame: true } }] },
  { id: 'haki_futuresight', name: 'Future Sight', icon: '🔮', hakiType: 'observation', anim: 'cast', windup: 0.2, recover: 0.1, cd: 30, cost: { haki: 30 }, desc: 'See a few seconds into the future: you evade almost everything for a short time.', learn: { haki: 'observation', level: 65 },
    steps: [{ fx: { ring: 2, color: '#ce93d8' } }, { buff: { id: 'future_sight', name: 'Future Sight', dur: 6, mods: { evade: 0.75 }, aura: 'rgba(206,147,216,0.5)' } }] },
  { id: 'haki_conqueror', name: "Conqueror's Burst", icon: '👑', hakiType: 'conqueror', anim: 'cast', windup: 0.45, recover: 0.3, cd: 25, cost: { haki: 40 }, desc: 'Release your will. Weak foes faint; strong ones flinch.', learn: { haki: 'conqueror', level: 1 },
    steps: [{ conqueror: { range: 9, damage: 10 } }] },
  { id: 'haki_infusion', name: "Conqueror's Infusion", icon: '⚡', hakiType: 'conqueror', anim: 'cast', windup: 0.5, recover: 0.2, cd: 60, cost: { haki: 50 }, desc: 'Coat your attacks in Conqueror\'s Haki. Black lightning crackles with every blow.', learn: { haki: 'conqueror', level: 50 },
    steps: [{ fx: { impact: 0.1, ring: 3, color: '#000000' } }, { buff: { id: 'infusion', name: "Conqueror's Infusion", dur: 15, mods: { damage: 1.6 }, conquerorInfused: true, aura: 'rgba(0,0,0,0.85)', drain: { haki: 2 } } }] },
];

registerAbilities(HAKI_ABILITIES.map((a) => ({ ...a, source: 'haki:' + a.hakiType })), 'haki');
