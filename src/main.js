// DeskCity: a little stick-figure town living on your desktop.
import { City } from './city.js';
import { updatePerson, drawPerson } from './people.js';
import { desktop } from './desktop.js';
import { drawStacks, nightLevel } from './buildings.js';
import { drawGarages, drawGarageSigns, drawCars, fadeAt } from './cars.js';
import { painter, textWidth } from './draw.js';
import { drawSky } from './sky.js';
import { drawStreetBack, drawStreetFront } from './streetscape.js';
import { lightAt, drawShadows } from './sunlight.js';
import { clock, tickSettings, setTownActions, prefs, toggleSettings } from './settings.js';
import { dev, setDevActions, tickDev } from './devpanel.js';
import { newHousehold, assignBeds, hhSize } from './city.js';
import { forcePlan, route, here } from './people.js';
import { theft, hurt } from './incidents.js';
import { send, listen, frame, apply, structureKey } from './sync.js';
import { isWeekend, dow } from './routine.js';
import { drawVenue } from './venues.js';
import { updateSocial, drawBubbles, forceTalk, isFriend, moodOf } from './social.js';
import { updateLife, card as lifeCard, fullName } from './life.js';
import { open as openPassport, setPassportActions, tickPassport, drawMarks, setHoverPerson, passportOf } from './passport.js';
import { interactive } from './desktop.js';
import { drawFireInside, drawFireOutside, drawBay, drawFleet, drawSmoke, drawHaze, startFire } from './incidents.js';

// Browser testing options (they never touch your saved town):
//   ?hour=19     start the day at 7pm        ?speed=600   run the clock 600x faster
//   ?city=40     grow instantly to ~40 people ?fakewin     pretend there are two app windows
//   ?dock=40     leave a Dock-sized strip under the street
//   ?dow=5       start on that day of the week (0 Monday ... 6 Sunday)
const params = new URLSearchParams(location.search);
const TEST = [...params.keys()].length > 0;
if (TEST) {
  const start = new Date(params.has('hour') ? new Date().setHours(Number(params.get('hour')), 0, 0, 0) : Date.now());
  if (params.has('dow')) start.setDate(start.getDate() + ((Number(params.get('dow')) - ((start.getDay() + 6) % 7) + 7) % 7));
  clock.set(+start, Number(params.get('speed')) || 1);
}
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

// Street level: the top of the Dock / taskbar, so buildings stand on the street that runs under it.
// (If the Dock hides itself, or in a browser, leave a strip of street at the bottom.)
const DOCK = Number(params.get('dock')) || 10; // ?dock=40 pretends there's a Dock that tall (room for car parks)
const groundRow = () => (desktop.ground > 0 && desktop.ground < H - 6 ? Math.floor(desktop.ground) - 1 : H - DOCK);
let G = groundRow();
const city = new City(W, G, simNow(), TEST ? null : City.load());
if (params.has('city') && !params.has('follow')) city.fastForward(Number(params.get('city')), simNow());

// ---------- one window per desktop ----------
// Every desktop has its own window, all live at once, each drawing its own stretch of the street.
// The 'main' window is the leader: it runs the town and sends each frame to the others (followers).
// In a browser: ?follow&desk=1 makes a follower tab showing the second stretch of a leader tab.
const tauri = window.__TAURI__?.core;
const label = window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow?.().label ?? null;
const LEADER = !(params.has('follow') || (label && label !== 'main'));
let myDesk = params.has('desk') ? Number(params.get('desk')) : null; // which stretch this window shows
if (tauri) { // which desktop this window sits on (they can be added or reordered at any time)
  const ask = async () => { try { const d = await tauri.invoke('my_desk'); if (d != null) myDesk = d; } catch {} setTimeout(ask, 1500); };
  ask();
}
const deskIndex = () => myDesk ?? desktop.space; // (a plain browser tab follows the pretend desktop)
if (TEST) { // peek(x, y, w, h, k): a magnified live view of part of the screen, for looking closely
  window.peek = (x0, y0, w, h, k = 4) => {
    let o = document.getElementById('peek');
    if (!o) { o = document.createElement('canvas'); o.id = 'peek'; o.style.cssText = 'position:fixed;left:0;top:0;z-index:9;image-rendering:pixelated;outline:2px solid red;background:#fff'; document.body.appendChild(o); }
    o.width = w * k; o.height = h * k;
    const g = o.getContext('2d'), draw = () => { g.imageSmoothingEnabled = false; g.clearRect(0, 0, o.width, o.height); g.drawImage(canvas, x0, y0, w, h, 0, 0, w * k, h * k); window.peekRaf = requestAnimationFrame(draw); };
    cancelAnimationFrame(window.peekRaf); draw();
  };
}
if (TEST) { window.passport = (id) => openPassport(id ?? city.people[0]?.id); window.cardOf = (id) => cardOf(id); }
if (TEST) { window.frameAt = (ms) => loop(ms); window.lastFrame = () => last; window.devRun = (n, a) => devRun(n, a); } // drive frames by hand (when the page is in the background)
if (TEST) { window.city = city; window.world = () => lastW; window.view = () => deskIndex() * W; window.fire = (lot, real = true) => { const b = city.lots[lot], it = b?.L.items.find((i) => i.kind === 'stove' || i.kind === 'grill') || b?.L.items[0]; if (it) startFire(city, lastW, b, it.x, it.f, real); }; } // for poking at in the browser console

addEventListener('resize', () => { fit(); G = groundRow(); city.place(W, G); street = null; });

// The street under the town: sidewalk, kerb, road with lane markings, then earth. Drawn once per size.
let street = null;
function bakeStreet() {
  street = document.createElement('canvas'); street.width = Math.max(1, W); street.height = Math.max(1, H - G); // (never 0: a tiny window would crash drawing it)
  const s = street.getContext('2d'), rect = (y, h, c) => { s.fillStyle = c; s.fillRect(0, y, W, h); };
  rect(1, 3, '#b9b3a8'); rect(1, 1, '#cfc9be'); for (let x = 0; x < W; x += 9) { s.fillStyle = '#a9a398'; s.fillRect(x, 1, 1, 3); }
  rect(4, 1, '#8a857c'); rect(5, H, '#4a4a50');
  s.fillStyle = '#e8d36a'; for (let x = 4; x < W; x += 16) s.fillRect(x, Math.min(9, H - G - 2), 8, 1);
  rect(Math.min(14, H - G), H, '#5b4a3a');
}

// Save slots, loading and resetting, used by the settings panel. The leader does them; a follower's
// panel asks the leader.
const slotKey = (i) => `deskcity-slot-${i}`;
const slot = (i) => { try { return JSON.parse(localStorage.getItem(slotKey(i))); } catch { return null; } };
const actions = {
  slot,
  save(i) {
    try { localStorage.setItem(slotKey(i), JSON.stringify({ town: city.snapshot(), time: clock.now(), speed: clock.speed, people: city.people.length })); return true; } catch { return false; }
  },
  load(i) {
    const s = slot(i);
    if (!s) return false;
    clock.set(s.time, s.speed); // back to the town time and day length it was saved with
    city.replace(s.town, clock.now());
    if (!TEST) city.save();
    return true;
  },
  reset() { city.replace(null, clock.now()); if (!TEST) city.save(); }, // a brand-new town; the clock is left alone
  info: () => ({ name: city.realty.name, cash: Math.round(city.realty.cash / 1e4) * 1e4, free: city.vacant.length, hunting: city.hunters.length, people: city.people.length, full: city.isFull(), dev: devInfo() }),
};
// ---------- the developer's panel (see devpanel.js) ----------
const pickAdult = (ok = () => true) => { const list = city.people.filter((p) => !p.kid && !p.forced && !p.aboard && !p.inCar && p.surface !== 'elev' && p.surface !== 'air' && ok(p)); return list[Math.floor(Math.random() * list.length)]; };
const hhm = (h) => `${h.getHours()}:${String(h.getMinutes()).padStart(2, '0')}`;
function devRun(name, arg) {
  const w = lastW, now = clock.now();
  if (!w) return 'NOT YET';
  switch (name) {
    case 'speed': dev.speed = arg; return arg ? `EVERYTHING X${arg}` : 'PAUSED';
    case 'jump': {
      const d = new Date(now);
      if (arg === 'day') d.setDate(d.getDate() + 1); else { if (d.getHours() >= arg) d.setDate(d.getDate() + 1); d.setHours(arg, 0, 0, 0); }
      clock.set(+d); return `${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]} ${hhm(d)}`;
    }
    case 'household': { // a household that suits a free home signs and drives over now
      for (let k = 0; k < 12; k++) {
        const h = newHousehold(), v = city.vacantUnits().find((u) => assignBeds(u.b, u.unit, h));
        if (v) { city.moves.push({ id: city.nextMove++, b: v.b, unit: v.unit, size: hhSize(h), hh: h, due: now, car: false }); return `${{ single: 'SOMEONE ON THEIR OWN', couple: 'A COUPLE', family: 'A FAMILY', roommates: 'ROOMMATES' }[h.kind]} ON THE WAY`; }
      }
      city.hunters.push({ ...newHousehold(), since: now }); return 'NO FREE HOME: ONE MORE HUNTING';
    }
    case 'finish': { let n = 0; for (const b of city.lots) for (const k of ['build', 'upgrade', 'demolish']) if (b?.[k]) { b[k].end = now; n++; } return n ? `${n} FINISHED` : 'NOTHING BEING BUILT'; }
    case 'build': {
      if (city.lots.some((b) => b && (b.build || b.upgrade || b.demolish))) return 'STILL BUILDING: FINISH FIRST';
      const before = JSON.stringify(city.lots.map((b) => b && [b.type, b.tier, !!b.upgrade]));
      city.planGrowth(now);
      return JSON.stringify(city.lots.map((b) => b && [b.type, b.tier, !!b.upgrade])) !== before || city.lots.some((b) => b?.build || b?.upgrade || b?.demolish) ? 'BUILDING STARTED' : 'NOTHING NEEDED';
    }
    case 'cash': city.realty.cash += 10e6; return '+$10M';
    case 'factory': city.factoryBan = 0; return city.lots.some((b) => b?.type === 'factory') ? 'THERE IS ONE ALREADY' : city.grow('factory', 0, now) ? 'A FACTORY IS GOING UP' : 'NO FREE PLOT';
    case 'replan':
      for (const p of city.people) if (!p.forced && !p.aboard && !p.inCar && p.surface !== 'elev' && p.surface !== 'air' && !p.plan[0]?.path) Object.assign(p, { plan: [], wantKey: null, hip: null, spot: null });
      return 'EVERYONE THINKS AGAIN';
    case 'fire': {
      const homes = city.lots.filter((b) => b?.type === 'home' && b.ready() && !b.fire && b.L.items.some((it) => it.kind === 'stove')), b = homes[Math.floor(Math.random() * homes.length)];
      if (!b) return 'NO KITCHEN';
      const stove = b.L.items.filter((it) => it.kind === 'stove')[Math.floor(Math.random() * b.L.items.filter((it) => it.kind === 'stove').length)];
      startFire(city, w, b, stove.x + 4, stove.f, arg, null); return arg ? 'A PAN ON FIRE' : 'BURNT TOAST';
    }
    case 'theft': {
      const store = city.shops()[0], p = pickAdult((q) => !q.jail);
      if (!store || !p) return 'NO SHOP';
      theft(city, w, p, store); city.crimes[city.crimes.length - 1].reported = true; return 'A SHOPLIFTER';
    }
    case 'fight': { // two people nearby start a fight; someone calls the police
      const a = pickAdult((q) => !q.b), b2 = a && pickAdult((q) => q !== a && Math.abs(q.x - a.x) < 400);
      if (!a || !b2) return 'NOBODY AROUND';
      forcePlan(a, [{ t: 'hold', anim: 'wait', face: b2.x, while: () => b2.plan[0]?.t !== 'fight' }, { t: 'fight', other: b2, secs: 9 }], 'fight');
      forcePlan(b2, [...route(here(b2), null, 0, a.x + 5), { t: 'fight', other: a, secs: 9, reel: true }], 'fight');
      city.crimes.push({ kind: 'fight', culprit: a, b: null, at: now, reported: true, state: 'new' });
      if (Math.random() < 0.5) b2.hurtLater = 3;
      return 'A FIGHT IN THE STREET';
    }
    case 'ill': { const p = pickAdult(), hosp = city.lots.some((b) => b?.type === 'hospital' && b.ready()); if (!p) return 'NOBODY'; p.sick = { kind: 'flu', clinic: hosp, until: now + 2 * 864e5 }; p.wantKey = null; return hosp ? 'FLU: OFF TO THE CLINIC' : 'FLU: OFF TO BED'; }
    case 'hurt': { const p = pickAdult(); if (!p) return 'NOBODY'; if (!city.lots.some((b) => b?.type === 'hospital' && b.ready())) return 'NO HOSPITAL'; hurt(city, w, p, 3); return 'AMBULANCE CALLED'; }
    case 'talk': return forceTalk(city, w, arg);
    case 'protest': {
      const lot = city.lots.findIndex((b) => b?.type === 'factory' && b.ready() && !b.demolish);
      if (lot < 0) return 'NO FACTORY';
      for (const p of city.people) if (!p.kid && p.job?.lot !== lot) p.anger = 0.9;
      city.protest = { lot, day: w.day, from: w.hour, to: w.hour + 1.5 }; return 'PROTEST AT THE FACTORY';
    }
  }
  return '';
}
let devCache = null, devAt = 0;
function devInfo() { // the town's numbers, worked out at most once a second
  if (devCache && performance.now() - devAt < 1000) return devCache;
  devAt = performance.now();
  return (devCache = {
    speed: dev.speed, people: city.people.length, households: new Set(city.people.map((p) => p.hh)).size, kids: city.people.filter((p) => p.kid).length,
    jobs: city.jobSlots().length, jobless: city.people.filter((p) => !p.kid && !p.job).length, hunting: city.hunters.length, vacant: city.vacant.length,
    moving: city.moves.length, building: city.lots.filter((b) => b && (b.build || b.upgrade || b.demolish)).length,
    cash: city.realty.cash, credit: city.creditLimit(), pollution: city.pollution || 0, fires: city.lots.filter((b) => b?.fire).length,
    crimes: city.crimes.length, sick: city.people.filter((p) => p.sick).length, jailed: city.people.filter((p) => p.jail).length,
    talking: city.convos.reduce((k, c) => k + c.members.length, 0), friends: [...city.rels.values()].filter(isFriend).length,
    mood: Math.round(city.people.reduce((k, p) => k + moodOf(p), 0) / Math.max(1, city.people.length) * 100),
  });
}
setDevActions({
  run: (name, arg) => (LEADER ? devRun(name, arg) : (send({ type: 'cmd', name: 'dev', arg: { name, arg } }), name === 'speed' ? ((dev.speed = arg), arg ? `EVERYTHING X${arg}` : 'PAUSED') : 'SENT')),
  info: () => (LEADER ? devInfo() : info?.dev),
  back: () => toggleSettings(),
});

// ---------- passports (see passport.js) ----------
// The town window makes the cards (twice a second at most); other desktops' windows ask for the ones
// they're showing and get them with each frame.
const cards = new Map(), watched = new Map(), cardsIn = {}, asked = {};
function cardOf(id) {
  const c = cards.get(id);
  if (c && performance.now() - c.at < 500) return c.card;
  const p = city.people.find((q) => q.id === id);
  if (!p || !lastW) return null;
  const made = lifeCard(city, lastW, p);
  cards.set(id, { at: performance.now(), card: made });
  return made;
}
const watchedCards = () => { const out = {}; for (const [id, at] of watched) { if (performance.now() - at > 3000) watched.delete(id); else out[id] = cardOf(id); } return out; };
const ask = (id) => { if (!(performance.now() - (asked[id] || 0) < 1000)) { asked[id] = performance.now(); send({ type: 'cmd', name: 'card', arg: id }); } };
const remote = (id) => { ask(id); return cardsIn[id] || null; };
setPassportActions({
  card: (id) => (LEADER ? cardOf(id) : remote(id)),
  person: (id) => city.people.find((q) => q.id === id),
  people: () => city.people,
  screenX: (id) => { const p = city.people.find((q) => q.id === id); return p ? (p.x - deskIndex() * W) / W : null; },
});
const nameFor = (p) => (LEADER ? fullName(p, city) : remote(p.id) && `${cardsIn[p.id].first} ${cardsIn[p.id].last}`);
function openSomeone() { // OPEN in settings: someone on this desktop
  const v = deskIndex() * W, here = city.people.filter((p) => !p.aboard && !p.inCar && p.x > v && p.x < v + W);
  const p = here[Math.floor(Math.random() * here.length)] || city.people[0];
  if (p) openPassport(p.id);
}
actions.passport = openSomeone;
// Click someone in town (only while the town is taking clicks: a panel's open) for their passport.
let paintT = -1;
function personAt(e) {
  const x = e.clientX / ZOOM + deskIndex() * W, y = e.clientY / ZOOM;
  let best = null, bd = 6;
  for (const p of city.people) {
    if (p.headT !== paintT || p.aboard || p.inCar) continue;
    const feet = p.y + (p.b ? 0 : Math.round(p.depth || 0)), d = Math.abs(x - p.headX);
    if (d < bd && y >= p.headY - 3 && y <= feet + 1) { bd = d; best = p; }
  }
  return best;
}
canvas.addEventListener('mousemove', (e) => { const p = personAt(e); setHoverPerson(p?.id ?? null); canvas.style.cursor = p ? 'pointer' : ''; });
canvas.addEventListener('mouseleave', () => setHoverPerson(null));
canvas.addEventListener('mousedown', (e) => { const p = personAt(e); if (p) { e.picked = true; openPassport(p.id); } });

let info = null, frameIn = null, townKey = '', heard = false;
if (LEADER) {
  setTownActions(actions);
  listen((m) => {
    if (m.type === 'hello') townKey = ''; // a follower just started: send it the whole town
    else if (m.type === 'cmd' && ['save', 'load', 'reset'].includes(m.name)) actions[m.name](m.arg);
    else if (m.type === 'cmd' && m.name === 'dev') devRun(m.arg.name, m.arg.arg);
    else if (m.type === 'cmd' && m.name === 'card') watched.set(m.arg, performance.now());
  });
} else {
  setTownActions({ slot, info: () => info, passport: openSomeone, save: (i) => (send({ type: 'cmd', name: 'save', arg: i }), true), load: (i) => (send({ type: 'cmd', name: 'load', arg: i }), !!slot(i)), reset: () => send({ type: 'cmd', name: 'reset' }) });
  listen((m) => {
    if (m.type === 'town') { // the buildings changed: rebuild them, keeping how see-through each one is (or every front wall would flash back for a moment)
      const seeThrough = new Map(city.lots.map((b, i) => b && [`${i}:${b.type}:${b.tier}:${b.seed}`, b.reveal]).filter(Boolean));
      city.replace(m.town, clock.now()); city.place(W, G, Math.max(city.districts, m.districts));
      city.lots.forEach((b, i) => { if (b) b.reveal = seeThrough.get(`${i}:${b.type}:${b.tier}:${b.seed}`) ?? b.reveal; });
    }
    else if (m.type === 'frame') { if (!heard) { heard = true; tauri?.invoke('note', { msg: `following the town (${m.people.length} people), desktop ${myDesk}` }); } frameIn = m; }
  });
  send({ type: 'hello' });
  setTimeout(() => { if (!heard) tauri?.invoke('note', { msg: 'no word from the town after 5 s' }); }, 5000);
}
if (!TEST && LEADER) {
  setInterval(() => city.save(), 30e3);
  addEventListener('beforeunload', () => city.save());
}

let last = performance.now(), lastNow = null, lastW = null, tShift = 0; // tShift: test runs skip ahead
// Developer speed: paused, the clock and every animation stand still; faster, the town runs several
// steps per frame (the clock, people, cars, lifts and animations all together), drawing the last.
function loop(ms) {
  requestAnimationFrame(loop);
  if (ms - last < 1000 / FPS - 2) return;
  frames++;
  if (LEADER && dev.speed === 0) { const gap = ms - last; clock.skew -= gap; tShift -= gap; step(ms, true, false); return; }
  const t0 = performance.now(), gap = Math.min(ms - last, 100); // (each extra step as long as this frame, so it's x speed at any frame rate)
  step(ms);
  if (LEADER && dev.speed > 1) {
    for (let i = 1; i < dev.speed; i++) { clock.skew += gap; step(last + gap, false); }
    tShift += last - ms; last = ms;
  }
  stepMs = stepMs * 0.9 + (performance.now() - t0) * 0.1;
}
let frames = 0, fps = 0, stepMs = 0;
setInterval(() => { fps = frames; frames = 0; }, 1000);
// Speeding up nudges the clock along; fold that into the saved clock now and then so it sticks.
setInterval(() => { if (LEADER && clock.persist && clock.skew) { clock.offset += clock.skew * clock.speed; clock.skew = 0; clock.save(); } }, 2000);
requestAnimationFrame(loop);
if (TEST) { // advance(60): run the town a minute forward right now, even if the page is hidden
  window.advance = (seconds, draw = true) => { const t0 = performance.now(); for (let i = 0; i < seconds * FPS; i++) { clock.skew += 1000 / FPS; step(last + 1000 / FPS, draw || i === seconds * FPS - 1); } const now = performance.now(); tShift += last - now; last = now; clock.skew -= now - t0; }; // (the live loop carries on from here, its clock unbroken)
}

function step(ms, draw = true, sim = true) {
  const dt = Math.min((ms - last) / 1000, 0.1);
  last = ms;

  const g = groundRow();
  city.under = H - g; // room under the street for car parks
  if (g !== G || desktop.spaces > city.districts) { G = g; city.place(W, G, desktop.spaces); street = null; }
  let now = simNow();
  if (!LEADER) { // a follower: take the latest frame from the leader
    if (frameIn) { const t0 = performance.now(); apply(city, frameIn); time('sync', t0); now = frameIn.now; info = frameIn.info; if (frameIn.cards) Object.assign(cardsIn, frameIn.cards); frameIn = null; if (city.districts > city.n / city.perScreen) city.place(W, G, city.districts); }
  }
  const d = new Date(now), active = desktop.space * W; // the desktop you're looking at (your windows are on it)
  const dtTown = lastNow === null ? 0 : Math.max(0, Math.min(now - lastNow, 30 * 60e3)); lastNow = now;
  const w = {
    city, now, t: (ms + tShift) / 1000, dt, dtTown, W, G, view: active, everyone: city.people,
    windows: desktop.fullscreen ? [] : desktop.windows.map((v) => ({ ...v, x: v.x + active })), // into street coordinates
    hour: d.getHours() + d.getMinutes() / 60, light: lightAt(now, W, H),
    day: Math.floor((now - d.getTimezoneOffset() * 60e3) / 864e5),
  };
  w.weekday = !isWeekend(w.day); w.dow = dow(w.day); w.night = nightLevel(w.hour); w.potato = prefs.potato;
  w.hooks = { // drawn by each building, in its own layer (see Building.draw)
    under: (c, b, ww) => { drawVenue(c, b, ww); if (b.L.bay) drawBay(c, b, ww); },
    glow: (c, b, ww) => drawFireInside(c, b, ww, city.people.filter((p) => p.b === b)),
    outside: (c, b, ww) => drawFireOutside(c, b, ww),
  };
  lastW = w;
  let t = performance.now();
  if (LEADER && sim) {
    city.update(w);
    for (const b of city.lots) b?.elevator?.update(dt);
    for (const p of city.people) updatePerson(p, dt, w);
    updateSocial(city, w);
    updateLife(city, w);
  }
  t = time('sim', t);
  const inside = new Map();
  for (const p of city.people) if (p.b) (inside.get(p.b) ?? inside.set(p.b, []).get(p.b)).push(p);

  // Potato mode: only the desktop you're looking at is drawn 30 times a second; the others twice a
  // second (the town carries on at full speed underneath).
  const shown = !tauri || myDesk == null || myDesk === desktop.space, slow = prefs.potato && ++potatoTick % 15 !== 0;
  if (LEADER && draw && !(slow && shown)) { // tell the other desktops' windows (all the time, unless they're all out of sight)
    const key = structureKey(city);
    if (key !== townKey) { townKey = key; send({ type: 'town', town: city.snapshot(), districts: city.districts }); }
    send({ ...frame(city, now, actions.info()), cards: watched.size ? watchedCards() : undefined });
  }
  t = time('sync', t);
  if (!draw || (slow && !shown)) return;
  tickSettings();
  tickDev();
  tickPassport(w.t);
  if (!LEADER && info?.dev) dev.speed = info.dev.speed;
  paint(ctx, { ...w, view: deskIndex() * W }, inside, true);
  time('draw', t);
}
// Where each frame's time goes (shown by the developer panel's stats), smoothed: ms per frame.
let potatoTick = 0;
const prof = { sim: 0, sync: 0, draw: 0 };
function time(part, t0) { const t = performance.now(); prof[part] = prof[part] * 0.95 + (t - t0) * 0.05; return t; }
if (TEST) window.prof = prof;

// Draws the town as seen from w.view onto canvas context c. isLive: also let building fronts fade
// in and out (off for one-off drawings).
function paint(c, w, inside, isLive) {
  const view = w.view;
  c.clearRect(0, 0, W, H);
  if (prefs.sky) drawSky(c, W, H, w.now, w.t); // behind everything else (can be turned off in settings)
  if (!w.potato) drawHaze(c, city, W, G); // a brown haze when the factory's made the air bad
  if (!street) bakeStreet();
  c.drawImage(street, 0, G);
  c.save();
  c.translate(-view, 0);
  const seen = (x0, x1) => x1 > view - 40 && x0 < view + W + 40;
  const night = nightLevel(w.hour);
  if (!w.potato) drawShadows(c, city, seen, w.light, view); // long shadows along the pavement, away from the sun
  drawStreetBack(c, city, G, seen); // trees and parks behind the buildings
  drawGarages(c, city, seen, H, night); // car parks under the big buildings
  drawCars(c, city, seen, w.t, night, 'under');
  for (const b of city.lots) {
    if (!b || !seen(b.x0 - b.L.ox, b.x0 + b.L.w)) continue;
    const here = inside.get(b) ?? [];
    if (isLive) b.reveal += ((here.length || dev.xray ? 1 : 0) - b.reveal) * (dev.xray ? 1 : 0.1); // the outside fades away while someone is in (or always, in x-ray)
    b.draw(c, here, (p) => drawPerson(c, p, w.t), w);
  }
  drawGarageSigns(c, city, seen);
  drawSmoke(c, city, w, seen); // factory chimneys
  for (const b of city.lots) if (b) drawStacks(c, b.boxes.filter((x) => x.outside), b.x0, () => G); // boxes waiting on the kerb
  drawStreetFront(c, city, G, seen, w.hour); // lamp posts, benches, hydrants
  for (const b of new Set(city.vacant.map((v) => v.b))) { // FOR SALE / FOR RENT signs on empty homes
    if (!seen(b.x0, b.x0 + b.L.w)) continue;
    const text = b.L.T.units === 'whole' ? 'SALE' : 'RENT', x = b.x0 + b.L.w - 22;
    c.fillStyle = '#6e4423'; c.fillRect(x + 8, G - 13, 1, 14);
    c.fillStyle = '#c0392b'; c.fillRect(x, G - 20, 19, 8);
    painter(c).text(text, x + 2, G - 19, '#ffffff');
  }
  // People on the pavement, the ones further back first: by the buildings behind the parked cars, the
  // rest (out towards the kerb) in front of them.
  const out = city.people.filter((p) => !p.b && !p.inCar && !p.aboard && seen(p.x - 10, p.x + 10)).sort((a, b) => (a.depth || 0) - (b.depth || 0));
  for (const p of out) if ((p.depth || 0) < 0.5) drawPerson(c, p, w.t);
  drawCars(c, city, seen, w.t, night, 'street'); // parked and moving cars, at the kerb
  for (const p of out) if ((p.depth || 0) >= 0.5) drawPerson(c, p, w.t);
  drawFleet(c, city, { ...w, night }, seen); // the fire engine (out on a call), the police car, the ambulance
  for (const v of [...city.trucks, ...city.movers]) {
    if (!seen(v.v.x - 60, v.v.x + 60)) continue;
    c.globalAlpha = fadeAt(city, v.v.x - v.v.len / 2, v.v.x + v.v.len / 2);
    v.draw(c, w.t, night);
    c.globalAlpha = 1;
  }
  const marks = isLive && (passportOf() != null || interactive() || !tauri); // whose passport is open; who the mouse is on
  if (isLive) paintT = w.t;
  if (marks) drawMarks(c, city.people, w.t, nameFor, false);
  if (prefs.bubbles !== false) drawBubbles(c, city.people, w.t); // speech bubbles, over everything in the town
  if (marks) drawMarks(c, city.people, w.t, nameFor, true);
  if (dev.labels) { // what everyone's doing, over their heads
    const pt = painter(c);
    for (const p of city.people) {
      if (p.aboard || p.inCar || !seen(p.x - 20, p.x + 20)) continue;
      const text = (p.forced || (p.wantKey || p.anim || '').split('@')[0]).replace(/[^a-z0-9:-]/gi, ' ').toUpperCase().slice(0, 12), tw = textWidth(text);
      const x = Math.round(p.x - tw / 2), y = Math.round(p.y + (p.b ? 0 : p.depth || 0) - (p.kid ? 24 : 28));
      c.fillStyle = 'rgba(20,24,32,0.75)'; c.fillRect(x - 1, y - 1, tw + 2, 7);
      pt.text(text, x, y, p.forced ? '#f1c40f' : '#ffffff');
    }
  }
  c.restore();

  if (dev.stats && isLive) { // frame rate and the town's numbers, top left
    const n = LEADER ? devInfo() : info?.dev, pt = painter(c), d = new Date(w.now);
    const lines = [`${fps} FPS  ${stepMs.toFixed(1)} MS A FRAME  X${dev.speed}`, `SIM ${prof.sim.toFixed(1)}  SYNC ${prof.sync.toFixed(1)}  DRAW ${prof.draw.toFixed(1)} MS`, `${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]} ${hhm(d)}`];
    if (n) lines.push(`${n.people} PEOPLE  ${n.households} HOMES  ${n.kids} KIDS`, `${n.jobs} JOBS  ${n.jobless} JOBLESS  ${n.hunting} HUNTING  ${n.vacant} FREE`, `$${(n.cash / 1e6).toFixed(1)}M OF $${(n.credit / 1e6).toFixed(0)}M  SMOG ${Math.round(n.pollution * 100)}`);
    const wd = Math.max(...lines.map((l) => textWidth(l))) + 6;
    c.fillStyle = 'rgba(20,24,32,0.8)'; c.fillRect(4, 4, wd, lines.length * 8 + 4);
    lines.forEach((l, i) => pt.text(l, 7, 7 + i * 8, i ? '#ffffff' : '#9fd5b0'));
  }

  if (isLive && desktop.fake) { // stand-ins for real windows, which would cover the town
    for (const v of [...desktop.windows].reverse()) {
      c.fillStyle = '#f7f7f7'; c.fillRect(v.x, v.y, v.w, v.h);
      c.fillStyle = '#d9d9d9'; c.fillRect(v.x, v.y, v.w, 8);
    }
  }
}
