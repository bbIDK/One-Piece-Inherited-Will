// The Log Pose slot: the pose in it is the needle you follow (your Log Pose,
// where its log is set, or an Eternal Pose, at its own island); you choose
// where the Log Pose points among the islands it can (the story's next, the
// last log's needles, and in the Blues the islands you've charted in that
// sea); each choice is announced with a banner; and older saves come in with
// the slot filled.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { installSea } = await import('../src/game/sea.js');
const { addItem, equip, unequipSlot, useItem } = await import('../src/game/inventory.js');
const { upgradeChar } = await import('../src/game/lineage.js');
const { ITEMS } = await import('../src/data/items.js');

// (an Eternal Pose of this test's own, set to one of its islands)
ITEMS.lp_test_eternal = { name: 'Eternal Pose (Far Rock)', type: 'pose', target: 'far_rock', price: 0, desc: '' };

const isle = (id, name, x, y, logNext) => ({ id, name, x, y, radius: 60, def: { logNext, logTime: 1 }, towns: [], docks: [] });
// Paradise, just past the Twin Cape: a log that can lock onto three islands
const cape = isle('cape', 'The Cape', 13608, 6150, ['isle_a', 'isle_b', 'isle_c']);
const islands = [
  cape, isle('isle_a', 'Isle A', 14400, 5600), isle('isle_b', 'Isle B', 14600, 6200), isle('isle_c', 'Isle C', 14500, 6800),
  isle('far_rock', 'Far Rock', 16000, 6400),
  // the East Blue, and one island in the North Blue
  isle('eb_home', 'Home', 22740, 1800), isle('eb_goat', 'Goat Island', 21750, 2640), isle('eb_shells', 'Shells', 20700, 1590),
  isle('nb_downs', 'Downs', 1140, 1020),
];
const world = { id: 'surface', islands, distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay), dx: (a, b) => b - a, type: () => 0, reveal() {} };

function setup({ at = cape, inventory = [], discovered = [] } = {}) {
  const handlers = {}, banners = [];
  // (persist does nothing for a character marked dead: there's nothing to save here)
  const char = { dead: true, runSeed: 7, inventory, equipped: { weapons: [], hat: null, coat: null, accessories: [], pose: null }, logPose: { target: null, last: null, progress: 0 }, discovered: [...discovered], flags: {}, hotbar: [] };
  const g = {
    on: (ev, fn) => (handlers[ev] ||= []).push(fn),
    emit: (ev, ...a) => { for (const fn of handlers[ev] || []) fn(...a); },
    surface: world, world, state: { char }, time: 0, currentIsland: at,
    player: { x: at.x, y: at.y, mode: 'foot' },
    ui: { banner: (title, sub, text) => banners.push({ title, sub, text }), toast() {} },
    log() {}, hint() {}, ships: [], actors: [],
  };
  installSea(g);
  return { g, char, banners };
}

test('your first Log Pose goes into the slot, and its needle shows', () => {
  const { g, char } = setup();
  assert.equal(g.logPoseInfo(), null, 'no pose: no needle');
  addItem(g, 'log_pose', 1, { silent: true });
  assert.equal(char.equipped.pose, 'log_pose');
  assert.ok(g.logPoseInfo(), 'a needle');
  // out of the slot (still in the bag): no needle to follow
  unequipSlot(g, 'pose');
  assert.equal(g.logPoseInfo(), null);
  equip(g, 'log_pose');
  assert.equal(char.equipped.pose, 'log_pose');
});

test('the log sets, and you choose which of its islands the needle points to', () => {
  const { g, char, banners } = setup({ inventory: [{ id: 'log_pose', qty: 1 }] });
  char.equipped.pose = 'log_pose';
  g.sea.updateLog(50); // (a log time of 1 is 45 s on the island)
  const lp = char.logPose;
  assert.equal(lp.last, 'cape');
  assert.ok(['isle_a', 'isle_b', 'isle_c'].includes(lp.target), `set to one of them (${lp.target})`);
  assert.equal(banners.at(-1)?.sub, 'LOG SET', 'a banner says so');
  const opts = g.logPoseOptions();
  assert.deepEqual(opts.map((o) => o.id).sort(), ['isle_a', 'isle_b', 'isle_c']);
  assert.ok(opts.every((o) => o.why === 'needle'));
  // choose another
  const other = ['isle_a', 'isle_b', 'isle_c'].find((id) => id !== lp.target);
  assert.ok(g.setLogCourse(other));
  assert.equal(lp.target, other);
  assert.equal(g.logPoseTarget()?.id, other);
  assert.ok(lp.own, 'your own course now');
  assert.equal(banners.at(-1)?.title, 'An uncharted island', 'not charted yet: no name');
  assert.match(banners.at(-1)?.text, /The needle points (north|south|east|west)/);
  // an island it can't lock onto can't be chosen
  assert.equal(g.setLogCourse('eb_home'), false);
  assert.equal(lp.target, other);
});

test('the story\'s island comes first, and choosing it hands the needle back to the story', () => {
  const { g, char } = setup({ inventory: [{ id: 'log_pose', qty: 1 }], discovered: ['isle_b'] });
  char.equipped.pose = 'log_pose';
  g.storyLogIsland = () => 'isle_b';
  char.logPose.last = 'cape';
  const opts = g.logPoseOptions();
  assert.equal(opts[0].id, 'isle_b');
  assert.equal(opts[0].why, 'story');
  assert.ok(opts[0].known);
  g.setLogCourse('isle_c');
  assert.equal(char.logPose.own, 'isle_b', 'turned away from the story\'s island');
  g.setLogCourse('isle_b');
  assert.equal(char.logPose.own, null, 'back on the story\'s road');
});

test('an Eternal Pose in the slot points to its island; there, your Log Pose comes back out', () => {
  const { g, char, banners } = setup({ inventory: [{ id: 'log_pose', qty: 1 }] });
  char.equipped.pose = 'log_pose';
  char.logPose.target = 'isle_a';
  addItem(g, 'lp_test_eternal', 1, { silent: true });
  assert.equal(char.equipped.pose, 'log_pose', 'a pose you pick up doesn\'t push out the one you follow');
  useItem(g, 'lp_test_eternal'); // ("Follow its needle")
  assert.equal(char.equipped.pose, 'lp_test_eternal');
  assert.equal(g.logPoseTarget()?.id, 'far_rock');
  assert.equal(banners.at(-1)?.sub, 'ETERNAL POSE');
  assert.equal(banners.at(-1)?.title, 'Far Rock', 'an Eternal Pose names its island');
  assert.deepEqual(g.logPoseOptions(), [], 'an Eternal Pose can\'t be set elsewhere');
  assert.equal(char.logPose.target, 'isle_a', 'the log in your bag is where it was');
  g.emit('enterIsland', islands.find((i) => i.id === 'far_rock'));
  assert.equal(char.equipped.pose, 'log_pose');
  assert.equal(g.logPoseTarget()?.id, 'isle_a');
});

test('in the Blues the needle can be set to any island you\'ve charted in that sea', () => {
  const home = islands.find((i) => i.id === 'eb_home');
  const { g, char } = setup({ at: home, inventory: [{ id: 'log_pose', qty: 1 }], discovered: ['eb_home', 'eb_goat', 'eb_shells', 'nb_downs'] });
  char.equipped.pose = 'log_pose';
  const ids = g.logPoseOptions().map((o) => o.id);
  assert.deepEqual(ids, ['eb_goat', 'eb_shells'], 'the nearest first; not the one you\'re on, nor another sea\'s');
  assert.ok(g.setLogCourse('eb_shells'));
  assert.equal(g.logPoseTarget()?.id, 'eb_shells');
  assert.ok(g.logPoseInfo().label === 'Shells', 'charted: the needle names it');
});

test('older saves: the Eternal Pose you were following, else your Log Pose, is in the slot', () => {
  const a = upgradeChar({ inventory: [{ id: 'log_pose', qty: 1 }, { id: 'eternal_pose_alabasta', qty: 1 }], equipped: { weapons: [], hat: null, coat: null }, logPose: { target: 'alabasta', eternal: 'eternal_pose_alabasta' }, attrs: {} });
  assert.equal(a.equipped.pose, 'eternal_pose_alabasta');
  assert.equal(a.logPose.eternal, undefined);
  const b = upgradeChar({ inventory: [{ id: 'new_world_log_pose', qty: 1 }], equipped: { weapons: [], hat: null, coat: null }, logPose: { target: null }, attrs: {} });
  assert.equal(b.equipped.pose, 'new_world_log_pose');
  const c = upgradeChar({ inventory: [], equipped: { weapons: [], hat: null, coat: null }, logPose: {}, attrs: {} });
  assert.equal(c.equipped.pose, null);
});
