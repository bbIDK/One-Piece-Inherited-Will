let nextId = 1;

export class Entity {
  constructor(o = {}) {
    this.id = nextId++;
    this.x = o.x ?? 0;
    this.y = o.y ?? 0;
    this.vx = 0;
    this.vy = 0;
    this.r = o.r ?? 0.3;
    this.alive = true;
    this.kind = o.kind || 'entity';
    this.faction = o.faction || 'neutral';
    this.world = o.world || null;
  }
  update() {}
  remove() { this.alive = false; }
}

// Factions and who they fight. "player" also covers the player's crew.
export const HOSTILITY = {
  player: new Set(['pirate', 'bandit', 'beast', 'seaking', 'baroque', 'cp', 'marine_hostile', 'zombie', 'rival']),
  marine: new Set(['pirate', 'bandit', 'baroque', 'zombie', 'revolutionary']),
  pirate: new Set(['player', 'marine', 'civilian_target', 'rival']),
  bandit: new Set(['player', 'civilian_target']),
  beast: new Set(['player', 'civilian', 'marine', 'pirate', 'bandit']),
  seaking: new Set(['player', 'marine', 'pirate']),
  baroque: new Set(['player', 'marine']),
  cp: new Set(['player']),
  zombie: new Set(['player', 'marine']),
  rival: new Set(['player', 'pirate']),
  civilian: new Set(),
  neutral: new Set(),
};

export function hostile(a, b) {
  if (!a || !b || a === b) return false;
  if (a.faction === 'player' && b.aggroPlayer) return true;
  if (b.faction === 'player' && a.aggroPlayer) return true;
  const fa = HOSTILITY[a.faction], fb = HOSTILITY[b.faction];
  return (fa && fa.has(b.faction)) || (fb && fb.has(a.faction)) || false;
}
