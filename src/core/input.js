// Keyboard + mouse state with per-frame "pressed/released" edges.

export class Input {
  constructor(target) {
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { x: 0, y: 0, down: [false, false, false], pressed: [false, false, false], released: [false, false, false], wheel: 0 };
    this.enabled = true;
    this.captureKeys = true;
    this.typing = false; // when a text field has focus
    const kd = (e) => {
      if (this.isTyping(e)) return;
      const k = normKey(e);
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      if (this.captureKeys && ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote'].includes(k)) e.preventDefault();
    };
    const ku = (e) => {
      const k = normKey(e);
      this.down.delete(k);
      this.released.add(k);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.down = [false, false, false]; });
    target.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    target.addEventListener('mousedown', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.mouse.down[e.button] = true;
      this.mouse.pressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      this.mouse.down[e.button] = false;
      this.mouse.released[e.button] = true;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  isTyping(e) {
    const el = e.target;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  isDown(k) { return this.enabled && this.down.has(k); }
  wasPressed(k) { return this.enabled && this.pressed.has(k); }
  wasReleased(k) { return this.released.has(k); }
  mouseDown(b = 0) { return this.enabled && this.mouse.down[b]; }
  mousePressed(b = 0) { return this.enabled && this.mouse.pressed[b]; }

  /** Consume an edge so no other system reacts to it this frame. */
  consume(k) { this.pressed.delete(k); }
  consumeMouse(b = 0) { this.mouse.pressed[b] = false; }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.pressed = [false, false, false];
    this.mouse.released = [false, false, false];
    this.mouse.wheel = 0;
  }

  /** Simulate input (used by the automated play-test harness). */
  simKey(k, down) {
    if (down) { if (!this.down.has(k)) this.pressed.add(k); this.down.add(k); }
    else { this.down.delete(k); this.released.add(k); }
  }
}

function normKey(e) {
  // Use physical codes so WASD works on any layout; normalise digits.
  if (e.code && e.code.startsWith('Key')) return e.code.slice(3);
  if (e.code && e.code.startsWith('Digit')) return e.code.slice(5);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') return 'Shift';
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') return 'Control';
  if (e.code === 'AltLeft' || e.code === 'AltRight') return 'Alt';
  return e.code || e.key;
}
