// The game's cursor (style.css: --cur, --cur-ptr) darkens and dips while a
// button's held: html.mdown, set here.
export function installCursor() {
  const root = document.documentElement;
  const down = () => root.classList.add('mdown');
  const up = () => root.classList.remove('mdown');
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('blur', up);
}
