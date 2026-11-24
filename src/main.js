// DeskCity: a little stick-figure town living on your desktop.
import { City } from './city.js';
import { updatePerson, drawPerson } from './people.js';
import { desktop } from './desktop.js';
import { clock, tickSettings, setTownActions } from './settings.js';

// Browser testing options (they never touch your saved town):
//   ?hour=19     start the day at 7pm        ?speed=600   run the clock 600x faster
//   ?city=40     grow instantly to ~40 people ?fakewin     pretend there are two app windows
const params = new URLSearchParams(location.search);
const TEST = [...params.keys()].length > 0;
if (TEST) clock.set(params.has('hour') ? new Date().setHours(Number(params.get('hour')), 0, 0, 0) : Date.now(), Number(params.get('speed')) || 1);
else clock.load(); // your town time and day length, as set in the settings panel
const simNow = () => clock.now();
const FPS = 30;

const ZOOM = Number(params.get('zoom')) || 1; // ?zoom=3 makes every pixel cell 3x bigger
const canvas = document.getElementById('town');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
const fit = () => {
  W = Math.floor(innerWidth / ZOOM); H = Math.floor(innerHeight / ZOOM);
  canvas.width = W; canvas.height = H;
};
fit();

const city = new City(W, H - 1, simNow(), TEST ? null : City.load());
if (params.has('city')) city.fastForward(Number(params.get('city')), simNow());
if (TEST) window.city = city; // for poking at in the browser console

addEventListener('resize', () => { fit(); city.place(W, H - 1); });

// Save slots, loading and resetting, used by the settings panel.
const slotKey = (i) => `deskcity-slot-${i}`;
setTownActions({
  slot(i) { try { return JSON.parse(localStorage.getItem(slotKey(i))); } catch { return null; } },
  save(i) {
    try { localStorage.setItem(slotKey(i), JSON.stringify({ town: city.snapshot(), time: clock.now(), speed: clock.speed, people: city.people.length })); return true; } catch { return false; }
  },
  load(i) {
    const s = this.slot(i);
    if (!s) return false;
    clock.set(s.time, s.speed); // back to the town time and day length it was saved with
    city.replace(s.town, clock.now());
    if (!TEST) city.save();
    return true;
  },
  reset() { city.replace(null, clock.now()); if (!TEST) city.save(); }, // a brand-new town; the clock is left alone
});
if (!TEST) {
  setInterval(() => city.save(), 30e3);
  addEventListener('beforeunload', () => city.save());
}

let last = performance.now();
function loop(ms) {
  requestAnimationFrame(loop);
  if (ms - last >= 1000 / FPS - 2) step(ms);
}
requestAnimationFrame(loop);
if (TEST) { // advance(60): run the town a minute forward right now, even if the page is hidden
  window.advance = (seconds, draw = true) => { for (let i = 0; i < seconds * FPS; i++) { clock.skew += 1000 / FPS; step(last + 1000 / FPS, draw || i === seconds * FPS - 1); } };
}

function step(ms, draw = true) {
  const dt = Math.min((ms - last) / 1000, 0.1);
  last = ms;

  const now = simNow(), d = new Date(now);
  const w = {
    city, now, t: ms / 1000, W, G: H - 1, windows: desktop.windows,
    hour: d.getHours() + d.getMinutes() / 60,
    day: Math.floor((now - d.getTimezoneOffset() * 60e3) / 864e5),
  };
  city.update(w);
  for (const b of city.lots) b?.elevator?.update(dt);
  for (const p of city.people) updatePerson(p, dt, w);
  const inside = new Map();
  for (const p of city.people) if (p.b) (inside.get(p.b) ?? inside.set(p.b, []).get(p.b)).push(p);
  for (const b of city.lots) b?.updateLights(inside.get(b) ?? [], w);

  if (!draw) return;
  tickSettings();
  ctx.clearRect(0, 0, W, H);
  for (const b of city.lots) {
    if (!b) continue;
    const here = inside.get(b) ?? [];
    b.reveal += ((here.length ? 1 : 0) - b.reveal) * 0.1; // the outside fades away while someone is in
    b.draw(ctx, here, (p) => drawPerson(ctx, p, w.t), w);
  }
  for (const p of city.people) if (!p.b) drawPerson(ctx, p, w.t);

  if (desktop.fake) { // stand-ins for real windows, which would cover the town
    for (const v of [...desktop.windows].reverse()) {
      ctx.fillStyle = '#f7f7f7'; ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.fillStyle = '#d9d9d9'; ctx.fillRect(v.x, v.y, v.w, 8);
    }
  }
}
