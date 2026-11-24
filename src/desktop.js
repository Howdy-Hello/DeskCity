// Your other app windows (position and size only, front to back), so people can climb onto them.
const tauri = window.__TAURI__?.core;
export const desktop = { windows: [], fake: false };

if (tauri) {
  const poll = async () => {
    try { desktop.windows = await tauri.invoke('desktop_windows'); } catch { desktop.windows = []; }
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
