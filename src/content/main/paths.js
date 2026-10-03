// The three roads a life can take through the main story.
export const PATHS = {
  pirate: { id: 'pirate', name: 'Pirate', color: '#b3261e', tagline: 'A flag of your own, a crew to share it, and the whole sea for a road.' },
  marine: { id: 'marine', name: 'Marine', color: '#1565c0', tagline: 'Justice — and the long climb from Seaman Recruit through the ranks of the Navy.' },
  hunter: { id: 'hunter', name: 'Bounty Hunter', color: '#6d4c41', tagline: 'Every pirate has a price. Your name is your fortune.' },
};

/** Not a road at all: sailing your own way, with no main story (see mainStory.js). */
export const OWN_WAY = { id: 'free', name: 'Your Own Way', color: '#00897b', tagline: 'No road but the sea: side quests, trainers, bounties and the whole Blue Planet, at your own pace.' };

export const PART_NAMES = { 1: 'The Blues', 2: 'The Grand Line', 3: 'The New World' };

/** A value given per path ({ pirate, marine, hunter } or { all }) or for everyone. */
export function perPath(v, path) {
  if (v && typeof v === 'object' && !Array.isArray(v) && (v.pirate !== undefined || v.marine !== undefined || v.hunter !== undefined || v.all !== undefined)) return v[path] ?? v.all;
  return v;
}
