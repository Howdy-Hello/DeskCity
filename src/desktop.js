// Your other app windows (position and size only, front to back), so people can climb onto them,
// plus where the street is and which desktop you're looking at.
const tauri = window.__TAURI__?.core;
// ground: the street level (top of the Dock / taskbar), 0 when unknown.
// space / spaces: which desktop is showing; each one shows the next stretch of the same long street.
export const desktop = { windows: [], fake: false, ground: 0, space: 0, spaces: 1, fullscreen: false };

// The app calls this the moment you switch desktops (no waiting for the next poll).
let pushed = 0;
window.onSpace = (space, spaces, fullscreen) => { pushed = Date.now(); Object.assign(desktop, { space, spaces, fullscreen }); };

if (tauri) {
  const poll = async () => {
    try {
      const s = await tauri.invoke('desktop_state');
      // A poll that was already under way when you switched would bring back the old desktop.
      if (Date.now() - pushed < 1000) { delete s.space; delete s.spaces; delete s.fullscreen; }
      Object.assign(desktop, s);
    } catch { desktop.windows = []; }
    setTimeout(poll, 250);
  };
  poll();
} else if (new URLSearchParams(location.search).has('fakewin')) {
  // Browser testing: pretend there are two windows, one sliding back and forth.
  desktop.fake = true;
  const zoom = Number(new URLSearchParams(location.search).get('zoom')) || 1;
  setInterval(() => {
    const W = innerWidth / zoom, H = innerHeight / zoom;
    desktop.windows = [
      { id: 1, x: W * 0.28 + 40 * Math.sin(Date.now() / 4000), y: H * 0.4, w: W * 0.22, h: H * 0.62 },
      { id: 2, x: W * 0.6, y: H * 0.5, w: W * 0.2, h: H * 0.2 },
    ];
  }, 50);
}

// Where the mouse pointer is (in this window, or null when it's not over it), only while something
// wants to know: the town lets clicks through, so the app is asked about ten times a second. In a
// browser the page simply sees the mouse.
desktop.cursor = null;
let following = false;
export function followCursor(on) {
  if (on === following) return;
  following = on;
  if (!on) { desktop.cursor = null; return; }
  if (!tauri) return;
  const ask = async () => {
    if (!following) return;
    try { const c = await tauri.invoke('cursor'); desktop.cursor = c && { x: c[0], y: c[1] }; } catch { desktop.cursor = null; }
    setTimeout(ask, 100);
  };
  ask();
}
if (!tauri) {
  addEventListener('mousemove', (e) => { if (following) desktop.cursor = { x: e.clientX, y: e.clientY }; });
  document.addEventListener('mouseleave', () => { desktop.cursor = null; });
}

// While any panel is open (settings, the developer's panel, a passport) the town takes clicks and
// keys; when the last one closes it goes back to letting everything through.
const holders = new Set(); // (in the order they were opened: the last is on top)
export function interact(who, on) {
  const was = holders.size > 0;
  holders.delete(who);
  if (on) holders.add(who);
  if (was !== holders.size > 0) { through = null; tauri?.invoke('set_interactive', { on: !was }); }
}
export const interactive = () => holders.size > 0;
export const topPanel = () => [...holders].pop() ?? null; // the panel Esc or Cmd+W closes
// Panels only close by their X, Esc, Cmd+W or the shortcut, so while one's open the town window
// sits above your apps: clicks anywhere but on a panel (or on someone in town) go through to the
// apps underneath. main.js decides each frame, from where the pointer is.
const panels = new Set();
export const registerPanel = (el) => panels.add(el);
export const overPanel = (x, y) => [...panels].some((el) => { if (el.style.display === 'none') return false; const r = el.getBoundingClientRect(); return x >= r.left && x < r.right && y >= r.top && y < r.bottom; });
let through = null;
export function passThrough(on) { if (on === through) return; through = on; tauri?.invoke('set_passthrough', { on }); }
