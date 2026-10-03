// Menus don't stop the world: only the pause screen does (and a
// conversation). Opening the inventory or the chart while sailing, the ship
// sails on; the Esc menu — and settings or how-to-play opened from it — waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pausesWorld, syncPause } from '../src/ui/pause.js';

const ui = (stack = [], extra = {}) => ({ game: { paused: false }, stack, dialogueEl: null, screenEl: null, mapOpen: false, ...extra });

test('the menus and the chart leave the world running', () => {
  for (const id of ['inventory', 'character', 'skills', 'journal', 'crew', 'quests', 'shop', 'help']) {
    const u = ui([{ id }]);
    syncPause(u);
    assert.equal(u.game.paused, false, id);
  }
  const map = ui([], { mapOpen: true });
  syncPause(map);
  assert.equal(map.game.paused, false, 'the chart');
});

test('the pause screen stops it, and what is opened from it', () => {
  for (const id of ['menu', 'settings', 'help']) {
    const u = ui([{ id, pause: true }]);
    syncPause(u);
    assert.equal(u.game.paused, true, id);
  }
  // (a menu over the pause screen doesn't start the world again)
  const u = ui([{ id: 'menu', pause: true }, { id: 'inventory' }]);
  syncPause(u);
  assert.equal(u.game.paused, true);
});

test('closing the last pausing panel starts the world again; a conversation keeps it stopped', () => {
  const u = ui([{ id: 'menu', pause: true }]);
  syncPause(u);
  u.stack = [];
  syncPause(u);
  assert.equal(u.game.paused, false);
  const talk = ui([{ id: 'inventory' }], { dialogueEl: {} });
  assert.equal(pausesWorld(talk), true);
});
