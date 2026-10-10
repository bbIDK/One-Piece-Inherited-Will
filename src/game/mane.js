// The Mane Mane no Mi (Bon Clay's): touch a face with your right hand and it's
// yours to wear — the whole person, face, build, hair and clothes — until you
// touch your own face again (the left hand) and you're yourself once more.
//
// Every blow of yours that lands touches a face: it's kept (the last few,
// newest first). Mimicry puts on the face of whoever's within reach — or, with
// nobody there, the last one you touched — and takes it off again when you're
// wearing one. In another's face nobody knows you: Marines walk past a wanted
// pirate wearing a Marine's face (wanted.js) until you strike one of them.
// Memoir Strike wears a face for the length of the kick; the Montage runs
// through every face you have, too fast to follow.

const KEEP = 8;
// (faces the fruit can't wear: no face to copy, or no body like yours)
const NO_FACE = /^(seaking|beast_|dummy)/;

/** A copy of `a`'s look to wear: its own, not its buffs' (no Gear Second steam on the copy). */
function faceOf(a) {
  const L = a?.look;
  if (!L || NO_FACE.test(L.race || '') || a.isDummy) return null;
  const look = JSON.parse(JSON.stringify(L));
  // (a giant's face, not a giant's height: the body's size stays near your own)
  look.scale = Math.min(1.15, Math.max(0.85, look.scale || 1));
  delete look.backFlame; delete look.shadow;
  return { id: a.id ?? a.name, name: a.name || 'a stranger', faction: a.faction, look };
}

/** A blow of `att`'s landed on `tgt`: if `att` has the Mane Mane, that face is touched and kept. */
export function touchFace(att, tgt, game) {
  if (att?.fruit !== 'mane' || !tgt || tgt === att) return;
  const f = faceOf(tgt);
  if (!f) return;
  const list = (att.maneFaces || []).filter((x) => x.id !== f.id);
  const fresh = list.length === (att.maneFaces || []).length;
  att.maneFaces = [f, ...list].slice(0, KEEP);
  if (fresh && att.isPlayer) game?.log?.(`Your right hand touches ${f.name}'s face — Mane Mane: it's yours to wear (Mimicry).`, '#f48fb1');
}

const wearing = (a) => a.buffs.find((b) => b.id === 'disguise');

/** Someone within reach in front of `a` with a face to take, or null. */
function within(a, game, r = 2.4) {
  let best = null, bd = r;
  for (const o of game.actorsNear?.(a.x, a.y, r + 1) || []) {
    if (o === a || !o.alive || o.state === 'dead' || !faceOf(o)) continue;
    const d = game.world.distance(a.x, a.y, o.x, o.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function wear(a, f, game, dur = 300) {
  const b = a.addBuff({ id: 'disguise', name: `Mimicry: ${f.name}`, dur, disguise: true, maneOf: f.faction, mods: { stealth: 0.5 }, look: f.look });
  game.fx?.burst?.(a.x, a.y, 14, { kind: 'smoke', color: ['#fce4ec', '#ffffff', '#f8bbd0'], speed: 1.6, z: 1.1, vz: 0.6, g: -0.4, life: 0.6, size: 0.35 });
  game.audio?.sfx('whoosh', a);
  return b;
}

/** A Mane Mane step (data/fruits.js): 'mimic', 'memoir' or 'montage'. */
export function maneStep(a, kind, game) {
  if (kind === 'mimic') {
    const on = wearing(a);
    if (on) {
      // (the left hand to your own face: yourself again)
      a.buffs = a.buffs.filter((b) => b !== on); a.recalc();
      game.fx?.burst?.(a.x, a.y, 10, { kind: 'smoke', color: ['#fce4ec', '#ffffff'], speed: 1.4, z: 1.1, vz: 0.5, g: -0.4, life: 0.5, size: 0.3 });
      if (a.isPlayer) game.log('Your left hand to your own face: you\'re yourself again.', '#f48fb1');
      return;
    }
    const o = within(a, game);
    if (o) touchFace(a, o, game);
    const f = o ? faceOf(o) : a.maneFaces?.[0];
    if (!f) { if (a.isPlayer) game.log('No face to copy: touch someone\'s face first — land a blow on them, or stand right beside them.', '#ffab91'); return; }
    wear(a, f, game);
    if (a.isPlayer) game.log(`Mane Mane: you are ${f.name}${f.faction === 'marine' ? ' — the Marines will take you for one of their own' : ''}. Mimicry again to be yourself.`, '#f48fb1');
    return;
  }
  const faces = a.maneFaces || [];
  if (!faces.length) return;
  if (kind === 'memoir') {
    // (a face the foe knows — the last you touched — worn for the kick, then back)
    if (!wearing(a)) a.addBuff({ id: 'mane_memoir', name: 'Memoir', dur: 0.9, look: faces[0].look });
  } else if (kind === 'montage') {
    a.addBuff({ id: 'mane_montage', name: 'Montage', dur: 1.4, look: faces[0].look, montage: 0 });
  }
}

/** Each frame: the Montage flicks through every face you've touched. */
export function maneTick(a, dt) {
  const b = a.buffs.find((x) => x.id === 'mane_montage');
  if (!b || !a.maneFaces?.length) return;
  b.montage += dt;
  const i = Math.floor(b.montage / 0.16) % a.maneFaces.length;
  if (b.look !== a.maneFaces[i].look) b.look = a.maneFaces[i].look;
}
