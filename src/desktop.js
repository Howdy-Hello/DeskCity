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
