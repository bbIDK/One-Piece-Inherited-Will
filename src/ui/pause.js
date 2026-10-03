// What stops the world. Only the pause screen does (the Esc menu, and what
// is opened from it: settings, how to play) — and a conversation, and the
// full-screen moments the session pauses for on its own (a life lost, the
// end of a lineage). The other menus (inventory, character, skills, journal,
// crew, quests, a shop…) and the chart don't: behind them the world goes on
// — the ship sails her course, the day turns, people go about their
// business — while the character takes no orders meant for the menu (see
// UI.blocksInput: no walking, steering or swinging while one is open; at the
// helm she holds her course).

/** Should the world be stopped for what's open on the screen? (`ui`: its panel stack and conversation.) */
export function pausesWorld(ui) {
  return (ui.stack || []).some((e) => e.pause) || !!ui.dialogueEl;
}

/**
 * Stop or restart the world to match the menus that are open (as one opens
 * or closes; a full screen sets its own pause as it comes up — session.js).
 */
export function syncPause(ui) {
  const g = ui.game;
  if (!g) return;
  g.paused = pausesWorld(ui);
}
