// The developer's panel: open it from the DEV button in the settings panel's title bar.
//   SPEED   pause, or run everything (people, cars, lifts, animations and the clock alike) 2-16x faster
//   VIEW    x-ray (see inside every building), labels (what everyone's doing, over their heads),
//           stats (frame rate and the town's numbers, top left)
//   TIME    jump to the morning, noon, the evening, night, or the next day
//   TOWN    a household moves in now, finish everything being built, build the next thing, +$10M,
//           a factory, everyone rethinks what they're doing (unsticks anyone stuck)
//   EVENTS  a kitchen fire, burnt toast (a false alarm), a shoplifter, a fight, someone ill, an
//           ambulance call, a protest at the factory
//   SOCIAL  two people nearby start a chat, an argument or some gossip; someone takes a phone call
// The view options are remembered and shared by every desktop's window; everything else is done by
// the window that runs the town (the others pass it on).
import { sprite, painter, addGrain, textWidth } from './draw.js';
import { interact } from './desktop.js';

export const dev = { speed: 1, xray: false, labels: false, stats: false };
try { Object.assign(dev, JSON.parse(localStorage.getItem('deskcity-dev')) || {}, { speed: 1 }); } catch {}
const saveDev = () => { try { localStorage.setItem('deskcity-dev', JSON.stringify({ xray: dev.xray, labels: dev.labels, stats: dev.stats })); } catch {} };
addEventListener('storage', (e) => { if (e.key === 'deskcity-dev') try { Object.assign(dev, JSON.parse(e.newValue) || {}); } catch {} });

const PW = 196, PH = 262;
let S = 3; // screen points per panel pixel (smaller on a short screen)
const C = { frame: '#1e2a38', bg: '#e9eef2', title: '#2c3e50', ink: '#1e1e22', soft: '#6b7785', btn: '#d5dde4', on: '#9fd5b0', hover: '#f1c40f', shadow: '#aab4be', line: '#c4ced8', warn: '#e57373', white: '#ffffff' };
let cv = null, isOpen = false, hover = null, buttons = [], shown = '', note = '', noteUntil = 0;
let run = null, info = null, back = null; // run(name, arg) -> message; info() -> numbers; back(): to the settings panel
export function setDevActions(a) { run = a.run; info = a.info; back = a.back; }
const say = (m) => { note = m || 'DONE'; noteUntil = Date.now() + 2500; };

function draw() {
  const p = painter(cv);
  buttons = [];
  const button = (id, x, y, w, label, act, on = false) => {
    p.rect(x, y, w, 11, C.frame);
    p.rect(x + 1, y + 1, w - 2, 9, hover === id ? C.hover : on ? C.on : C.btn);
    p.rect(x + 1, y + 9, w - 2, 1, C.shadow);
    p.text(label, x + Math.round((w - textWidth(label)) / 2), y + 3, C.ink);
    buttons.push({ id, x, y, w, h: 11, act });
  };
  const heading = (s, y) => { p.rect(6, y - 4, PW - 12, 1, C.line); p.text(s, 6, y, C.soft); };
  const row = (y, list) => { // buttons spread across a row: [id, label, act, on]
    const gap = 2, w = Math.floor((PW - 12 - gap * (list.length - 1)) / list.length);
    list.forEach(([id, label, act, on], i) => button(id, 6 + i * (w + gap), y, w, label, act, on));
  };
  p.ctx.clearRect(0, 0, PW, PH);
  p.rect(0, 0, PW, PH, C.frame); p.rect(1, 1, PW - 2, PH - 2, C.bg);
  p.rect(1, 1, PW - 2, 11, C.title); p.text('DEVELOPER', 5, 4, C.white);
  button('back', PW - 44, 1, 31, 'BACK', () => { close(); back?.(); });
  button('close', PW - 13, 1, 12, 'X', close);

  heading('SPEED: EVERYTHING, NOT JUST THE CLOCK', 18);
  row(26, [0, 1, 2, 4, 8, 16].map((k) => [`s${k}`, k ? `X${k}` : 'PAUSE', () => run?.('speed', k), dev.speed === k]));

  heading('VIEW', 44);
  row(52, [['xray', 'X-RAY', () => { dev.xray = !dev.xray; saveDev(); }, dev.xray], ['labels', 'LABELS', () => { dev.labels = !dev.labels; saveDev(); }, dev.labels], ['stats', 'STATS', () => { dev.stats = !dev.stats; saveDev(); }, dev.stats]]);

  heading('TIME: JUMP TO', 70);
  row(78, [['t7', '7:00', () => say(run?.('jump', 7))], ['t12', '12:00', () => say(run?.('jump', 12))], ['t18', '18:00', () => say(run?.('jump', 18))], ['t22', '22:00', () => say(run?.('jump', 22))], ['tday', '+1 DAY', () => say(run?.('jump', 'day'))]]);

  heading('TOWN', 96);
  row(104, [['hh', 'MOVE IN', () => say(run?.('household'))], ['finish', 'FINISH', () => say(run?.('finish'))], ['build', 'BUILD', () => say(run?.('build'))]]);
  row(117, [['cash', '+$10M', () => say(run?.('cash'))], ['factory', 'FACTORY', () => say(run?.('factory'))], ['replan', 'REPLAN ALL', () => say(run?.('replan'))]]);

  heading('EVENTS', 135);
  row(143, [['fire', 'FIRE', () => say(run?.('fire', true))], ['toast', 'BURNT TOAST', () => say(run?.('fire', false))], ['theft', 'THEFT', () => say(run?.('theft'))]]);
  row(156, [['fight', 'FIGHT', () => say(run?.('fight'))], ['ill', 'FLU', () => say(run?.('ill'))], ['hurt', 'AMBULANCE', () => say(run?.('hurt'))], ['protest', 'PROTEST', () => say(run?.('protest'))]]);

  heading('SOCIAL', 174);
  row(182, [['talk', 'CHAT', () => say(run?.('talk', 'chat'))], ['argue', 'ARGUE', () => say(run?.('talk', 'argue'))], ['gossip', 'GOSSIP', () => say(run?.('talk', 'gossip'))], ['phone', 'PHONE', () => say(run?.('talk', 'phone'))]]);

  const n = info?.();
  heading('TOWN NOW', 200);
  if (n) {
    const lines = [
      `${n.people} PEOPLE  ${n.households} HOMES  ${n.kids} KIDS`,
      `${n.jobs} JOBS  ${n.jobless} JOBLESS  ${n.hunting} HUNTING`,
      `${n.vacant} FREE  ${n.moving} MOVING IN  ${n.building} BUILDING`,
      `$${(n.cash / 1e6).toFixed(1)}M OF $${(n.credit / 1e6).toFixed(0)}M  SMOG ${Math.round(n.pollution * 100)}`,
      `${n.fires} FIRES  ${n.crimes} CRIMES  ${n.sick} ILL  ${n.jailed} IN CELLS`,
      `${n.talking} TALKING  ${n.friends} FRIENDSHIPS  MOOD ${n.mood > 0 ? '+' : ''}${n.mood}`,
    ];
    lines.forEach((l, i) => p.text(l, 6, 208 + i * 8, C.ink));
  }
  const msg = Date.now() < noteUntil ? note : 'CHANGES ARE NOT SAVED IN SLOTS';
  p.text(msg, Math.round(PW / 2 - textWidth(msg) / 2), PH - 9, msg === note ? C.ink : C.soft);
  addGrain(cv, 0.05);
  shown = key();
}
const key = () => `${hover}|${JSON.stringify(dev)}|${Date.now() < noteUntil ? note : ''}|${JSON.stringify(info?.())}`;
const hit = (e) => buttons.find((b) => { const x = e.offsetX / S, y = e.offsetY / S; return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; });

function create() {
  S = Math.max(2, Math.min(3, Math.floor((innerHeight - 24) / PH)));
  cv = sprite(PW, PH);
  cv.style.cssText = `position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);width:${PW * S}px;height:${PH * S}px;image-rendering:pixelated;display:none;z-index:11;filter:drop-shadow(0 6px 0 rgba(0,0,0,0.25))`;
  document.body.appendChild(cv);
  cv.addEventListener('mousemove', (e) => { const id = hit(e)?.id ?? null; if (id !== hover) { hover = id; cv.style.cursor = id ? 'pointer' : 'default'; draw(); } });
  cv.addEventListener('mouseleave', () => { hover = null; draw(); });
  cv.addEventListener('mousedown', (e) => { e.stopPropagation(); hit(e)?.act(); if (isOpen) draw(); });
  document.addEventListener('mousedown', () => isOpen && close());
}
export function openDev() {
  if (!cv) create();
  isOpen = true; cv.style.display = 'block'; draw();
  interact('dev', true);
}
function close() {
  isOpen = false; hover = null; cv.style.display = 'none';
  interact('dev', false);
}
export function tickDev() { if (isOpen && key() !== shown) draw(); }
addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) close(); });
