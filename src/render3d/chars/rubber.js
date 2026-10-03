// The Gum-Gum stretch, as the world and the first-person view see it: the
// fist in flight (a stretch projectile, game/combat.js — nothing of its own
// is drawn: the arm IS the blow) and the arm running out to it and snapping
// back (the rubber itself is the rig's: rig.js solveRubber, model.js
// rubberMotion).
import * as THREE from 'three';

// seconds the arm takes to snap home once its fist is spent (hit, or as far as it goes)
export const RETRACT = 0.15;

/**
 * Where a Gum-Gum fist is (in a model's own frame: `toLocal(dx, dy)` turns
 * a world offset from the actor into it), or — once it's spent — the arm
 * snapping back from where it got to: accelerating home, as rubber does.
 * Keeps its state in `F` (one per arm). Returns the share of the way the
 * hand is out to `F.at` (1: all the way; 0: home), or 0 when there's nothing.
 */
export function rubberFist(F, a, ctx, dt, place) {
  const g = ctx.game;
  const pr = g && g.combat && g.combat.projectiles.find((p) => p.stretch === a && !(p.delay > 0));
  if (pr) {
    const w = ctx.world;
    // (the shot is launched half a tile "up" the old flat view's screen from the feet: taken back off)
    const dx = w ? w.dx(a.x, pr.x) : pr.x - a.x, dy = pr.y - (a.y - 0.5);
    place(F.at, dx, dy);
    F.out = true; F.back = 0;
    return 1;
  }
  if (F.out) { F.out = false; F.back = 1e-4; }
  if (F.back > 0) {
    F.back += dt;
    const k = F.back / RETRACT;
    if (k >= 1) { F.back = 0; return 0; }
    // (slow to start, then all at once)
    return 1 - k * k * (0.6 + 0.4 * k);
  }
  return 0;
}

/** A fresh state for rubberFist. */
export const fistState = () => ({ at: new THREE.Vector3(), out: false, back: 0 });
