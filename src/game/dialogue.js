// Branching dialogue. A tree is { start, nodes: { id: node } } or a function
// (ctx) => tree. Nodes: { text, speaker?, choices?: [{ text, if?, do?, next?, end? }], next?, onEnter? }
// Text / next / if / do may be functions of the dialogue context.
import { h, clear } from '../ui/dom.js';
import { addItem, removeItem, count, pay, earn } from './inventory.js';
import { persist } from './lineage.js';

export class Dialogue {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.trees = {}; // registered named trees
    // fns (tree, npc, ctx) → tree: add to anyone's conversation (the main story uses this)
    this.decorators = [];
    game.ui.dialogueKeys = (inp) => this.keys(inp);
    game.ui.onDialogueEscape = () => this.close();
  }

  register(id, tree) { this.trees[id] = tree; }

  ctx(npc) {
    const g = this.game;
    const char = g.state.char;
    const self = this;
    return {
      game: g, npc, char, player: g.player,
      flag: (k) => char.flags[k],
      setFlag: (k, v = true) => { char.flags[k] = v; },
      has: (id, n = 1) => count(char, id) >= n,
      give: (id, n = 1) => addItem(g, id, n),
      take: (id, n = 1) => removeItem(g, id, n),
      pay: (n) => { const ok = pay(g, n); if (!ok) g.log('Not enough berries.', '#ff8a80'); return ok; },
      earn: (n, why) => earn(g, n, why),
      berries: () => char.berries,
      quest: (id) => g.quests?.state(id),
      startQuest: (id) => g.quests?.start(id),
      stage: (id, st) => g.quests?.setStage(id, st),
      complete: (id) => g.quests?.complete(id),
      log: (t, c) => g.log(t, c),
      open: (kind, arg) => { self.close(); g.emit('openService', kind, arg, npc); },
      goto: (node) => self.show(node),
      save: () => persist(g),
      emit: (...a) => g.emit(...a),
      progression: g.progression,
    };
  }

  open(npc, treeOrId, start) {
    let tree = typeof treeOrId === 'string' ? this.trees[treeOrId] : treeOrId;
    if (!tree) return;
    const ctx = this.ctx(npc);
    if (typeof tree === 'function') tree = tree(ctx);
    if (!tree) return;
    if (npc?.def?.recruit && this.game.crew) tree = this.game.crew.decorate(tree, npc);
    for (const dec of this.decorators) tree = dec(tree, npc, ctx) || tree;
    this.active = { npc, tree, ctx, node: null, typing: 0, full: '' };
    this.game.paused = true;
    if (npc && this.game.player) {
      // face each other
      const p = this.game.player;
      npc.facing = Math.atan2(p.y - npc.y, this.game.world.dx(npc.x, p.x));
      p.facing = npc.facing + Math.PI;
    }
    this.show(start || tree.start || 'start');
  }

  show(id) {
    const a = this.active;
    if (!a) return;
    if (id === null || id === undefined || id === 'end') { this.close(); return; }
    const node = a.tree.nodes[id];
    if (!node) { this.close(); return; }
    a.node = node;
    a.nodeId = id;
    if (node.onEnter) node.onEnter(a.ctx);
    if (!this.active) return; // onEnter may close
    if (node.redirect) { const r = typeof node.redirect === 'function' ? node.redirect(a.ctx) : node.redirect; if (r) { this.show(r); return; } }
    const text = typeof node.text === 'function' ? node.text(a.ctx) : node.text || '';
    a.full = text;
    a.typing = 0;
    const choices = (node.choices || []).filter((c) => !c.if || c.if(a.ctx)).map((c) => ({ ...c, label: typeof c.text === 'function' ? c.text(a.ctx) : c.text }));
    a.choices = choices;
    this.render();
  }

  render() {
    const a = this.active;
    const ui = this.game.ui;
    if (ui.dialogueEl) ui.dialogueEl.remove();
    const speaker = a.node.speaker ?? (a.npc ? a.npc.name : '');
    const title = a.node.speaker ? '' : a.npc?.title || '';
    const textEl = h('div.text');
    const choicesEl = h('div.choices');
    const el = h('div.dialogue', speaker ? h('div.who', speaker, title ? h('small', title) : null) : null, textEl, choicesEl, h('div.cont', a.choices.length ? '' : 'SPACE / click to continue'));
    el.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'BUTTON') this.advance(); });
    ui.dialogueEl = el;
    ui.root.appendChild(el);
    a.textEl = textEl;
    a.choicesEl = choicesEl;
    this.typeTick();
  }

  typeTick() {
    const a = this.active;
    if (!a) return;
    a.typing = Math.min(a.full.length, a.typing + 3);
    a.textEl.textContent = a.full.slice(0, a.typing);
    if (a.typing < a.full.length) { a.raf = requestAnimationFrame(() => this.typeTick()); return; }
    this.showChoices();
  }

  showChoices() {
    const a = this.active;
    clear(a.choicesEl);
    a.choices.forEach((c, i) => {
      a.choicesEl.appendChild(h('button', { on: { click: () => this.choose(i) } }, h('span.n', `${i + 1}.`), c.label));
    });
  }

  advance() {
    const a = this.active;
    if (!a) return;
    if (a.typing < a.full.length) { cancelAnimationFrame(a.raf); a.typing = a.full.length; a.textEl.textContent = a.full; this.showChoices(); return; }
    if (a.choices.length) return;
    const n = a.node.next;
    const next = typeof n === 'function' ? n(a.ctx) : n;
    if (next) this.show(next); else this.close();
  }

  choose(i) {
    const a = this.active;
    if (!a) return;
    const c = a.choices[i];
    if (!c) return;
    let next = c.next;
    if (c.do) { const r = c.do(a.ctx); if (typeof r === 'string') next = r; }
    if (!this.active) return;
    if (typeof next === 'function') next = next(a.ctx);
    if (c.end || !next) { this.close(); return; }
    this.show(next);
  }

  keys(inp) {
    const a = this.active;
    if (!a) return;
    if (inp.wasPressed('Space') || inp.wasPressed('Enter') || inp.wasPressed('E')) { inp.consume('Space'); inp.consume('E'); this.advance(); return; }
    for (let i = 0; i < 9; i++) if (inp.wasPressed(String(i + 1))) { this.choose(i); return; }
  }

  close() {
    const a = this.active;
    const ui = this.game.ui;
    if (a) cancelAnimationFrame(a.raf);
    this.active = null;
    if (ui.dialogueEl) { ui.dialogueEl.remove(); ui.dialogueEl = null; }
    if (!ui.stack.length && !ui.screenEl && !ui.mapOpen) this.game.paused = false;
    if (a?.tree?.onClose) a.tree.onClose(a.ctx);
  }
}

/** Quick one-screen line (with an optional follow-up). */
export function say(text, next) { return { start: 'a', nodes: { a: { text, next } } }; }
