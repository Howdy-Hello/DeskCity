// Panels you can move and resize like any window: drag the title bar to move one, drag the grip in
// its bottom-right corner to make it bigger or smaller (it scales as a whole, so the pixel art stays
// sharp), double-click the title bar to put it back. Where each was left is remembered.
import { registerPanel } from './desktop.js';

const KEY = (name) => `deskcity-panel-${name}`;
let drags = 0;
export const dragging = () => drags > 0; // (keep taking clicks while a panel's being dragged)

// el: the panel's element; w, h: its size in panel pixels; scale: its usual screen points per panel
// pixel; onScale(s): the panel's own scale changed; home(): put it back in its usual place.
export function movable(el, { name, w, h, scale, title = 11, onScale, home }) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY(name))); } catch {}
  const st = { s: saved?.s || scale, x: saved?.x ?? 0, y: saved?.y ?? 0, moved: saved?.x != null };
  let drag = null;
  registerPanel(el);
  const size = () => { el.style.width = `${w * st.s}px`; el.style.height = `${h * st.s}px`; onScale?.(st.s); };
  const put = () => {
    if (!st.moved) return;
    st.x = Math.max(60 - w * st.s, Math.min(innerWidth - 60, st.x)); // (always enough of it left on screen to grab)
    st.y = Math.max(0, Math.min(innerHeight - 24, st.y));
    Object.assign(el.style, { left: `${st.x}px`, top: `${st.y}px`, right: 'auto', transform: 'none' });
  };
  const save = () => { try { localStorage.setItem(KEY(name), JSON.stringify(st.moved ? { x: st.x, y: st.y, s: st.s } : { s: st.s })); } catch {} };
  const at = (e) => [e.offsetX / st.s, e.offsetY / st.s];
  const inGrip = (e) => { const [x, y] = at(e); return x >= w - 8 && y >= h - 8; };
  addEventListener('mousemove', (e) => {
    if (!drag) return;
    if (drag.kind === 'move') { st.x = e.clientX - drag.dx; st.y = e.clientY - drag.dy; put(); return; }
    const grow = (e.clientX - drag.x0 + e.clientY - drag.y0) / (w + h); // diagonal drag, in scale steps
    st.s = Math.max(1, Math.min(6, Math.round((drag.s0 + grow) * 4) / 4));
    size(); put();
  });
  addEventListener('mouseup', () => { if (drag) { drag = null; drags--; save(); } });
  el.addEventListener('dblclick', (e) => { if (at(e)[1] < title) { st.s = scale; st.moved = false; home?.(); size(); save(); } });
  return {
    // From the panel's mousedown (when it didn't hit a button): true if that started a move or a resize.
    grab(e) {
      const r = el.getBoundingClientRect();
      if (inGrip(e)) { Object.assign(st, { x: r.left, y: r.top, moved: true }); drag = { kind: 'size', s0: st.s, x0: e.clientX, y0: e.clientY }; drags++; put(); return true; }
      if (at(e)[1] < title) { Object.assign(st, { x: r.left, y: r.top, moved: true }); drag = { kind: 'move', dx: e.clientX - r.left, dy: e.clientY - r.top }; drags++; put(); return true; }
      return false;
    },
    cursor: (e) => (drag?.kind === 'size' || inGrip(e) ? 'nwse-resize' : 'default'),
    apply() { size(); put(); }, // when the panel opens (the screen may have changed since)
    moved: () => st.moved,
  };
}

// The resize grip: three little diagonal rows of dots in the bottom-right corner.
export function drawGrip(p, w, h, c) {
  for (let d = 1; d <= 3; d++) for (let k = 0; k < d; k++) p.px(w - 3 - 2 * k, h - 3 - 2 * (d - 1 - k), c);
}
