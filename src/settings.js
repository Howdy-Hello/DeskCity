// The town clock (adjustable time and day length) and the pixel-art settings panel.
// Open and close the panel with Control+Option+D (Ctrl+Alt+D on Windows), the tray menu or the Dock icon.
import { sprite, painter, addGrain, textWidth } from './draw.js';
import { DAY_NAMES } from './routine.js';
import { openDev } from './devpanel.js';

const KEY = 'deskcity-clock-v1';

// Display preferences, remembered between launches.
export const prefs = { sky: true, potato: false, bubbles: true }; // sky: show the sun and moon; potato: low CPU and GPU (see main.js); bubbles: people's speech bubbles
try { Object.assign(prefs, JSON.parse(localStorage.getItem('deskcity-prefs')) || {}); } catch {}
const savePrefs = () => { try { localStorage.setItem('deskcity-prefs', JSON.stringify(prefs)); } catch {} };
// Another desktop's window changed the clock or a preference: pick it up here too.
addEventListener('storage', (e) => {
  if (e.key === 'deskcity-prefs') { try { Object.assign(prefs, JSON.parse(e.newValue) || {}); } catch {} }
  if (e.key === KEY && clock.persist) clock.load(); // (test pages keep their own clock)
});
const MIN = 60e3;

// ---------- the clock ----------
// Town time = real time × speed + offset. Changing the speed keeps the current town time.
export const clock = {
  speed: 1, offset: 0, skew: 0, persist: false,
  real() { return Date.now() + this.skew; },
  now() { return this.real() * this.speed + this.offset; },
  set(now, speed = this.speed) { this.speed = speed; this.offset = now - this.real() * speed; this.save(); },
  save() { if (this.persist) try { localStorage.setItem(KEY, JSON.stringify({ speed: this.speed, offset: this.offset })); } catch {} },
  load() {
    this.persist = true;
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) Object.assign(this, { speed: s.speed, offset: s.offset }); } catch {}
  },
};

// How long one town day lasts, in real minutes (shortest first).
export const DAY_LENGTHS = [60, 120, 180, 360, 720, 1440];
const dayMinutes = () => 1440 / clock.speed;
function changeDay(step) {
  const i = DAY_LENGTHS.reduce((best, m, k) => (Math.abs(m - dayMinutes()) < Math.abs(DAY_LENGTHS[best] - dayMinutes()) ? k : best), 0);
  const next = DAY_LENGTHS[Math.max(0, Math.min(DAY_LENGTHS.length - 1, i + step))];
  clock.set(clock.now(), 1440 / next);
}

// ---------- the panel ----------
let S = 3;                 // screen points per panel pixel (smaller on a short screen)
const PW = 156, PH = 255;  // panel size in pixels
const C = { danger: '#e57373', off: '#cfc6b8', frame: '#2c3e50', bg: '#f4ecd6', title: '#3b5b7a', ink: '#2a2a2e', soft: '#8d8478', btn: '#e3d7c3', shadow: '#b9ab94', hover: '#f1c40f', white: '#ffffff', line: '#d8ccb6' };
const tauri = window.__TAURI__?.core;
const KEYS = /Mac/.test(navigator.userAgent) ? 'CTRL+OPT+D' : 'CTRL+ALT+D';

let cv = null, isOpen = false, hover = null, buttons = [], shown = '';
let town = null;               // save / load / reset, provided by the main loop
let note = '', noteUntil = 0;  // a short message, e.g. SAVED
let resetArmed = 0;            // reset needs a second click within 3 seconds
export function setTownActions(actions) { town = actions; }
const say = (msg) => { note = msg; noteUntil = Date.now() + 2500; };
const pad = (n) => String(n).padStart(2, '0');
// e.g. 2.31M or 850K, with a dollar sign
const money = (c) => `${c < 0 ? '-' : ''}$${Math.abs(c) >= 1e6 ? (Math.abs(c) / 1e6).toFixed(2) + 'M' : Math.round(Math.abs(c) / 1e3) + 'K'}`;
const lengthLabel = (m) => (m >= 60 ? `${m / 60} HOUR${m > 60 ? 'S' : ''}` : `${m} MIN`);

function draw() {
  const p = painter(cv);
  const center = (s, y, c, sc = 1) => p.text(s, Math.round(PW / 2 - textWidth(s, sc) / 2), y, c, sc);
  const button = (id, x, y, w, label, act, fill = C.btn) => {
    p.rect(x, y, w, 11, act ? C.frame : C.soft);
    p.rect(x + 1, y + 1, w - 2, 9, !act ? C.off : hover === id ? C.hover : fill);
    p.rect(x + 1, y + 9, w - 2, 1, C.shadow);
    p.text(label, x + Math.round((w - textWidth(label)) / 2), y + 3, act ? C.ink : C.soft);
    if (act) buttons.push({ id, x, y, w, h: 11, act });
  };
  buttons = [];
  p.ctx.clearRect(0, 0, PW, PH);
  p.rect(0, 0, PW, PH, C.frame);
  p.rect(1, 1, PW - 2, PH - 2, C.bg);
  p.rect(1, 1, PW - 2, 11, C.title);
  p.text('DESKCITY SETTINGS', 5, 4, C.white);
  button('close', PW - 13, 1, 12, 'X', close);
  button('dev', PW - 33, 1, 19, 'DEV', () => { close(); openDev(); }); // the developer's panel

  p.text('TOWN TIME', 6, 18, C.soft);
  const d = new Date(clock.now()), dayName = DAY_NAMES[(d.getDay() + 6) % 7];
  p.text(dayName, PW - 6 - textWidth(dayName), 18, [5, 6].includes((d.getDay() + 6) % 7) ? '#c0392b' : C.ink); // the day of the week (weekends in red)
  center(`${pad(d.getHours())}:${pad(d.getMinutes())}`, 28, C.ink, 2);
  button('-1h', 6, 27, 17, '-1H', () => clock.set(clock.now() - 60 * MIN));
  button('-10m', 25, 27, 21, '-10M', () => clock.set(clock.now() - 10 * MIN));
  button('+10m', PW - 46, 27, 21, '+10M', () => clock.set(clock.now() + 10 * MIN));
  button('+1h', PW - 23, 27, 17, '+1H', () => clock.set(clock.now() + 60 * MIN));
  button('real', Math.round(PW / 2 - 36), 43, 72, 'MATCH REAL CLOCK', () => clock.set(clock.real()));

  p.rect(6, 59, PW - 12, 1, C.line);
  p.text('LENGTH OF A DAY', 6, 64, C.soft);
  button('shorter', 6, 73, 11, '-', () => changeDay(-1));
  button('longer', PW - 17, 73, 11, '+', () => changeDay(1));
  const m = dayMinutes();
  center(lengthLabel(Math.round(m)), 74, C.ink, 1);
  center(m === 1440 ? 'SAME AS REAL TIME' : `1 TOWN HOUR = ${+(m / 24).toFixed(1)} MIN`, 87, C.soft);

  p.rect(6, 97, PW - 12, 1, C.line);
  p.text('SUN AND MOON', 6, 103, C.soft);
  button('sky', PW - 30, 100, 24, prefs.sky ? 'ON' : 'OFF', () => { prefs.sky = !prefs.sky; savePrefs(); }, prefs.sky ? '#9fd5b0' : C.btn);
  p.text('POTATO MODE', 6, 116, C.soft); p.text('LOW CPU', 58, 116, C.off);
  button('potato', PW - 30, 113, 24, prefs.potato ? 'ON' : 'OFF', () => { prefs.potato = !prefs.potato; savePrefs(); }, prefs.potato ? '#9fd5b0' : C.btn);
  p.text('SPEECH BUBBLES', 6, 129, C.soft);
  button('bubbles', PW - 30, 126, 24, prefs.bubbles ? 'ON' : 'OFF', () => { prefs.bubbles = !prefs.bubbles; savePrefs(); }, prefs.bubbles ? '#9fd5b0' : C.btn);

  p.rect(6, 142, PW - 12, 1, C.line);
  p.text('SAVED TOWNS', 6, 147, C.soft);
  for (let i = 1; i <= 3; i++) {
    const y = 143 + i * 13, slot = town?.slot(i);
    p.text(`SLOT ${i}`, 6, y + 3, C.ink);
    if (slot) {
      const t = new Date(slot.time);
      p.text(`${slot.people} PPL ${pad(t.getHours())}:${pad(t.getMinutes())}`, 34, y + 3, C.soft);
    } else p.text('EMPTY', 34, y + 3, C.off);
    button(`save${i}`, PW - 50, y, 23, 'SAVE', town && (() => say(town.save(i) ? `SAVED TO SLOT ${i}` : 'COULD NOT SAVE')));
    button(`load${i}`, PW - 26, y, 20, 'LOAD', slot && (() => { town.load(i); say(`LOADED SLOT ${i}`); }));
  }
  const armed = Date.now() < resetArmed;
  button('reset', Math.round(PW / 2 - 44), 196, 88, armed ? 'CLICK AGAIN TO RESET' : 'START A NEW TOWN', town && (() => {
    if (armed) { town.reset(); resetArmed = 0; say('NEW TOWN STARTED'); } else resetArmed = Date.now() + 3000;
  }), armed ? C.danger : C.btn);

  const info = town?.info?.();
  if (info) { // the real estate company
    p.rect(6, 211, PW - 12, 1, C.line);
    const cash = money(info.cash);
    p.text(info.name, 6, 216, C.soft); p.text(cash, PW - 6 - textWidth(cash), 216, info.cash < 0 ? '#c0392b' : C.ink);
    p.text(`${info.free} FREE HOMES  ${info.hunting} HUNTING  ${info.people} LIVE HERE`, 6, 225, C.soft);
    if (info.full) p.text('TOWN FULL: ADD A DESKTOP TO GROW', 6, 233, '#c0392b'); // every plot built up as far as it goes
  }
  const msg = Date.now() < noteUntil ? note : `${KEYS} OR ESC TO CLOSE`;
  center(msg, PH - 8, msg === note ? C.ink : C.soft);
  addGrain(cv, 0.07);
  shown = `${d.getHours()}:${d.getMinutes()}|${hover}|${m}|${msg}|${armed}|${JSON.stringify(info)}|${prefs.sky}|${prefs.potato}|${prefs.bubbles}`;
}

const hit = (e) => buttons.find((b) => { const x = e.offsetX / S, y = e.offsetY / S; return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; });

function create() {
  S = Math.max(2, Math.min(3, Math.floor((innerHeight - 24) / PH)));
  cv = sprite(PW, PH);
  cv.style.cssText = `position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);width:${PW * S}px;height:${PH * S}px;image-rendering:pixelated;display:none;z-index:10;filter:drop-shadow(0 6px 0 rgba(0,0,0,0.25))`;
  document.body.appendChild(cv);
  cv.addEventListener('mousemove', (e) => { const id = hit(e)?.id ?? null; if (id !== hover) { hover = id; cv.style.cursor = id ? 'pointer' : 'default'; draw(); } });
  cv.addEventListener('mouseleave', () => { hover = null; draw(); });
  cv.addEventListener('mousedown', (e) => { e.stopPropagation(); hit(e)?.act(); if (isOpen) draw(); });
  document.addEventListener('mousedown', () => isOpen && close()); // click anywhere else to close
}

function open() {
  if (!cv) create();
  isOpen = true;
  cv.style.display = 'block';
  draw();
  tauri?.invoke('set_interactive', { on: true });
}
function close() {
  isOpen = false;
  hover = null;
  cv.style.display = 'none';
  tauri?.invoke('set_interactive', { on: false });
}

export function toggleSettings() { isOpen ? close() : open(); }
window.toggleSettings = toggleSettings; // the app calls this when the shortcut is pressed

// Keeps the clock display current while the panel is open.
export function tickSettings() {
  if (!isOpen) return;
  const d = new Date(clock.now());
  const msg = Date.now() < noteUntil ? note : `${KEYS} OR ESC TO CLOSE`;
  if (`${d.getHours()}:${d.getMinutes()}|${hover}|${dayMinutes()}|${msg}|${Date.now() < resetArmed}|${JSON.stringify(town?.info?.())}|${prefs.sky}|${prefs.potato}|${prefs.bubbles}` !== shown) draw();
}

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isOpen) close();
  if (!tauri && e.ctrlKey && e.altKey && e.code === 'KeyD') toggleSettings(); // in a browser (the app uses a global shortcut)
});
