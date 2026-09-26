// Plug-in points for the 3D view. Other modules register 3D builders here;
// anything without one falls back to an upright sprite of its 2D art.
//
//  registerPropBuilder(kind, (o, ctx) => THREE.Object3D | null)
//    A static world object (tree, rock, building, lamp…). `o` is the object
//    record from world.objects; place the model with its origin at the
//    object's foot point (o.x, o.y) — the renderer positions and grounds it.
//    Return null to fall back to the sprite for that particular object.
//
//  registerActorView((actor, ctx) => view)      view: { root, update(actor, env, ctx), dispose(), stale?() }
//  registerShipView((ship, ctx) => view)        same shape; update(ship, env, rx, rz, windAngle)
//  registerViewmodel((ctx) => vm)               first-person arms: { root, update(player, env, ctx), dispose() }
//  registerFrameHook((env, ctx, dt) => void)    called once per rendered frame (animated props, effects)
//
// A built prop may set `userData.update(o, env, ctx)`: it is called every
// frame while the prop is in range.
// ctx = { THREE, camera, scene, ground(x, y), terrain(x, y), world, game, yaw, mode }
export const PROP_BUILDERS = new Map();
export const VIEWS = { actor: null, ship: null, viewmodel: null };

export function registerPropBuilder(kind, fn) { PROP_BUILDERS.set(kind, fn); }
export function registerActorView(fn) { VIEWS.actor = fn; }
export function registerShipView(fn) { VIEWS.ship = fn; }
export function registerViewmodel(fn) { VIEWS.viewmodel = fn; }
export const FRAME_HOOKS = [];
export function registerFrameHook(fn) { FRAME_HOOKS.push(fn); }
