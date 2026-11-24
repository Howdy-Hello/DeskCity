// The town clock (adjustable time and day length) and the pixel-art settings panel.
// Open and close the panel with Control+Option+D (Ctrl+Alt+D on Windows), the tray menu or the Dock icon.
import { sprite, painter, addGrain, textWidth } from './draw.js';

const KEY = 'deskcity-clock-v1';
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
const S = 3;               // screen points per panel pixel
const PW = 156, PH = 176;  // panel size in pixels
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

  p.text('TOWN TIME', 6, 18, C.soft);
  const d = new Date(clock.now());
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
  p.text('SAVED TOWNS', 6, 102, C.soft);
  for (let i = 1; i <= 3; i++) {
    const y = 98 + i * 13, slot = town?.slot(i);
    p.text(`SLOT ${i}`, 6, y + 3, C.ink);
    if (slot) {
      const t = new Date(slot.time);
      p.text(`${slot.people} PPL ${pad(t.getHours())}:${pad(t.getMinutes())}`, 34, y + 3, C.soft);
    } else p.text('EMPTY', 34, y + 3, C.off);
    button(`save${i}`, PW - 50, y, 23, 'SAVE', town && (() => say(town.save(i) ? `SAVED TO SLOT ${i}` : 'COULD NOT SAVE')));
    button(`load${i}`, PW - 26, y, 20, 'LOAD', slot && (() => { town.load(i); say(`LOADED SLOT ${i}`); }));
  }
  const armed = Date.now() < resetArmed;
  button('reset', Math.round(PW / 2 - 44), 153, 88, armed ? 'CLICK AGAIN TO RESET' : 'START A NEW TOWN', town && (() => {
    if (armed) { town.reset(); resetArmed = 0; say('NEW TOWN STARTED'); } else resetArmed = Date.now() + 3000;
  }), armed ? C.danger : C.btn);

  const msg = Date.now() < noteUntil ? note : `${KEYS} OR ESC TO CLOSE`;
  center(msg, PH - 8, msg === note ? C.ink : C.soft);
  addGrain(cv, 0.07);
  shown = `${d.getHours()}:${d.getMinutes()}|${hover}|${m}|${msg}|${armed}`;
}

const hit = (e) => buttons.find((b) => { const x = e.offsetX / S, y = e.offsetY / S; return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; });

function create() {
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
  if (`${d.getHours()}:${d.getMinutes()}|${hover}|${dayMinutes()}|${msg}|${Date.now() < resetArmed}` !== shown) draw();
}

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isOpen) close();
  if (!tauri && e.ctrlKey && e.altKey && e.code === 'KeyD') toggleSettings(); // in a browser (the app uses a global shortcut)
});
