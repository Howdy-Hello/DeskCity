// The passport: who someone is and how they're doing. Click anyone in town while the town is taking
// clicks (the settings panel, the developer's panel or a passport is open), or OPEN in settings.
//   ID        a live photo, name, age and birthday, home, household, job, what they're doing now,
//             their needs (energy, food, fun, social, hygiene, health) and mood, personality, likes
//   CALENDAR  their plan as a day or a week, like a calendar app: coloured events on an hour grid,
//             a red line for now, this week and next (hover for the details, click a day to open it)
//   TASKS     today's to-do list (ticked off, in progress, missed), their work today (the shift, and
//             what they got done: customers served, dishes made, patients seen...) or their school
//             report, and how they've spent the day so far
//   PEOPLE    their household, friends, coworkers, neighbours and rivals: click one to open theirs
//   DIARY     what they've done today, from waking up to who they argued with
// A yellow arrow bobs over whoever's passport is open. The card it shows is made by life.js.
import { sprite, painter, addGrain, textWidth } from './draw.js';
import { movable, drawGrip } from './panels.js';
import { interact, topPanel } from './desktop.js';
import { iconImage } from './social.js';
import { ANIM, blend, newPose, drawStickman } from './stickman.js';

const PW = 208, PH = 248;
let S = 3; // screen points per panel pixel (smaller on a short screen; the panel can be resized)
let win = null; // moving and resizing it (panels.js)
const C = {
  cover: '#1f3a5f', page: '#f6f0e1', tab: '#e2d6bd', ink: '#2a2a2e', soft: '#8d8478', off: '#bdb3a2', line: '#ddd2bd', hover: '#f1c40f',
  white: '#ffffff', red: '#c0392b', photo: '#cfe0ea', btn: '#e3d7c3', shadow: '#b9ab94', now: '#ea4335', row: '#ede2c8', today: '#1a73e8', grid: '#e8dfcc',
};
// Calendar events: [label, colour, text colour].
const EV = {
  wake: ['GET UP', '#b0bec5', C.ink], shower: ['SHOWER', '#9fc6e7', C.ink], breakfast: ['BREAKFAST', '#f6bf26', C.ink], brunch: ['BRUNCH', '#f6bf26', C.ink],
  lunch: ['LUNCH', '#f6bf26', C.ink], lunchout: ['LUNCH OUT', '#e67c73', C.white], cook: ['COOK DINNER', '#f4511e', C.white], dinner: ['DINNER', '#f6bf26', C.ink],
  eatout: ['DINNER OUT', '#e67c73', C.white], relax: ['FREE TIME', '#cfd8dc', C.ink], evening: ['EVENING IN', '#b39ddb', C.ink], 'play-home': ['PLAY AT HOME', '#f8bbd0', C.ink],
  homework: ['HOMEWORK', '#33b679', C.white], school: ['SCHOOL', '#0b8043', C.white], play: ['PLAY OUTSIDE', '#f06292', C.white], 'school-run': ['SCHOOL RUN', '#7cb342', C.white],
  work: ['WORK', '#4285f4', C.white], shop: ['SHOPPING', '#8e24aa', C.white], outing: ['OUT AND ABOUT', '#f09300', C.white], hobby: ['HOBBY', '#a1887f', C.white],
  run: ['RUN', '#039be5', C.white], gym: ['GYM', '#039be5', C.white], bar: ['PUB', '#795548', C.white], playground: ['PLAYGROUND', '#d81b60', C.white],
  bedtime: ['BEDTIME', '#90a4ae', C.ink], sleep: ['SLEEP', '#dfe4f5', '#7d86a8'],
};
const DUTY = new Set(['work', 'school', 'homework', 'school-run']);
// Time today, by what kind of thing it was (see activity() in life.js).
const TIME = {
  sleep: ['SLEEP', '#7986cb'], work: ['WORK', '#4285f4'], school: ['SCHOOL', '#0b8043'], study: ['HOMEWORK', '#33b679'], eat: ['FOOD', '#f6bf26'],
  fun: ['FUN', '#e67c73'], out: ['OUT', '#f09300'], exercise: ['EXERCISE', '#039be5'], wash: ['WASHING', '#9fc6e7'], chores: ['CHORES', '#8e24aa'],
  travel: ['GETTING ABOUT', '#90a4ae'], rest: ['RESTING', '#cfd8dc'], sick: ['ILL', '#d9534f'], jail: ['IN A CELL', '#616161'], fight: ['FIGHTING', '#c0392b'],
};
const NEEDS = [['ENERGY', 'zzz'], ['FOOD', 'plate'], ['FUN', 'gamepad'], ['SOCIAL', 'person'], ['HYGIENE', 'sparkle'], ['HEALTH', 'heart']];
const TABS = [['id', 'ID'], ['cal', 'CALENDAR'], ['tasks', 'TASKS'], ['people', 'PEOPLE'], ['diary', 'DIARY']];
const hhmm = (h) => { const m = Math.round(((h % 24) + 24) % 24 * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const dur = (m) => (m < 60 ? `${Math.round(m)}M` : `${(m / 60).toFixed(1)}H`);
const cut = (s, w) => { if (textWidth(s) <= w) return s; while (s.length > 1 && textWidth(s + '..') > w) s = s.slice(0, -1); return s + '..'; };
function wrapText(s, w) { // into lines that fit, at spaces
  const out = []; let line = '';
  for (const word of s.split(' ')) { const t = line ? `${line} ${word}` : word; if (textWidth(t) <= w || !line) line = t; else { out.push(line); line = word; } }
  if (line) out.push(line);
  return out;
}

let act = null; // { card(id), person(id), people(), screenX(id) }, from the main loop
export function setPassportActions(a) { act = a; }
let wrap = null, cv = null, pic = null, isOpen = false, sel = null, tab = 'id', calMode = 'day', calDay = null, hover = null, zones = [], shown = '';
let hoverPerson = null, pose = newPose();
export const passportOf = () => (isOpen ? sel : null);
export function setHoverPerson(id) { hoverPerson = id; }
export const hoveredPerson = () => hoverPerson;

function draw() {
  const p = painter(cv), g = p.ctx, card = act?.card(sel);
  zones = [];
  const zone = (id, x, y, w, h, o = {}) => zones.push({ id, x, y, w, h, ...o });
  const button = (id, x, y, w, label, fn, on = false) => {
    p.rect(x, y, w, 11, C.cover);
    p.rect(x + 1, y + 1, w - 2, 9, hover === id ? C.hover : on ? '#9fd5b0' : C.btn);
    p.rect(x + 1, y + 9, w - 2, 1, C.shadow);
    p.text(label, x + Math.round((w - textWidth(label)) / 2), y + 3, C.ink);
    zone(id, x, y, w, 11, { act: fn });
  };
  const icon = (name, x, y) => { const im = name && iconImage(name, 0); if (im) g.drawImage(im, x, y); };
  const heading = (s, y, right) => { p.text(s, 6, y, C.soft); if (right) p.text(right, PW - 6 - textWidth(right), y, C.soft); p.rect(6, y + 6, PW - 12, 1, C.line); };
  const meter = (x, y, w, v, color) => { p.rect(x, y, w, 5, '#cfc3a8'); p.rect(x + 1, y + 1, w - 2, 3, '#efe7d4'); p.rect(x + 1, y + 1, Math.round((w - 2) * Math.max(0, Math.min(1, v))), 3, color); };
  const level = (v) => (v > 0.6 ? '#5cb85c' : v > 0.3 ? '#f0ad4e' : '#d9534f');

  g.clearRect(0, 0, PW, PH);
  p.rect(0, 0, PW, PH, C.cover); p.rect(1, 12, PW - 2, PH - 13, C.page);
  p.text('PASSPORT', 5, 4, C.hover);
  if (card) p.text(`NO ${String(card.id).padStart(5, '0')}`, 42, 4, '#9fb4cc');
  button('prev', PW - 41, 1, 13, '<', () => step(-1));
  button('next', PW - 27, 1, 13, '>', () => step(1));
  button('close', PW - 13, 1, 12, 'X', close);
  // Tabs, like the dividers in a notebook.
  let tx = 4;
  for (const [id, label] of TABS) {
    const w = textWidth(label) + 8, on = tab === id;
    p.rect(tx, 13, w, 11, on ? C.page : hover === `tab-${id}` ? '#efe4ca' : C.tab);
    if (!on) p.rect(tx, 23, w, 1, C.line);
    p.text(label, tx + 4, 16, on ? C.ink : C.soft);
    zone(`tab-${id}`, tx, 13, w, 11, { act: () => { tab = id; } });
    tx += w + 2;
  }
  let foot = 'CLICK ANYONE IN TOWN  ESC TO CLOSE';
  if (!card) {
    const m = 'LOOKING UP THEIR RECORDS';
    p.text(m, Math.round(PW / 2 - textWidth(m) / 2), PH / 2, C.soft);
  } else if (tab === 'id') drawId();
  else if (tab === 'cal') drawCal();
  else if (tab === 'tasks') drawTasks();
  else if (tab === 'people') drawPeople();
  else drawDiary();
  const tip = zones.find((z) => z.id === hover)?.foot;
  if (tip) foot = tip;
  p.text(cut(foot, PW - 8), Math.round(PW / 2 - Math.min(PW - 8, textWidth(foot)) / 2), PH - 8, tip ? C.ink : C.soft);
  drawGrip(p, PW, PH, C.soft ?? '#8d8478');
  addGrain(cv, 0.05);
  pic.style.display = card && tab === 'id' ? 'block' : 'none';
  if (card && tab === 'id') drawPortrait(performance.now() / 1000); // (straight away, not just on the next frame)

  // ---------- ID ----------
  function drawId() {
    p.rect(6, 28, 40, 50, '#9c917e'); // the photo goes in here (see drawPortrait)
    const x = 52, w = PW - x - 6;
    if (textWidth(card.first, 2) <= w) p.text(card.first, x, 29, C.ink, 2); else p.text(card.first, x, 31, C.ink);
    p.text(cut(card.last, w), x, 41, C.ink);
    const ageLine = `AGE ${card.age}  BORN ${card.born}`;
    p.text(ageLine, x, 50, C.soft);
    if (card.bday) { icon('cake', x + textWidth(ageLine) + 3, 49); p.text('TODAY', x + textWidth(ageLine) + 12, 50, C.red); }
    p.text(cut(card.hh, w), x, 58, C.soft);
    p.text(cut(`${card.home}  ${card.homeKind}`, w), x, 66, C.soft);
    p.text(cut(card.at ? `${card.job} AT ${card.at}` : card.job, w), x, 74, C.ink);
    const sub = [card.shift, card.days].filter(Boolean).join('  ') || card.since || '';
    p.text(cut(sub, w), x, 82, C.soft);
    // What they're doing now.
    p.rect(6, 91, PW - 12, 17, '#ece3cf');
    icon(card.nowIcon, 9, 96);
    const lines = wrapText(card.now, PW - 32);
    lines.slice(0, 2).forEach((l, i) => p.text(l, 19, (lines.length > 1 ? 94 : 97) + i * 7, C.ink));
    // Needs and mood.
    heading('HOW THEY ARE DOING', 113);
    NEEDS.forEach(([label, ic], i) => {
      const y = 123 + i * 9, v = card.needs[i];
      icon(ic, 6, y - 1); p.text(label, 16, y, C.soft);
      meter(48, y, 104, v, level(v));
      p.text(card.words[i], PW - 6 - textWidth(card.words[i]), y, v < 0.2 ? C.red : C.ink);
      zone(`need${i}`, 6, y - 1, PW - 12, 8, { foot: `${label}: ${Math.round(v * 100)} OUT OF 100` });
    });
    const y = 123 + 6 * 9, m = card.mood, mid = 48 + 52;
    icon(m > 0.3 ? 'laugh' : m > 0 ? 'smile' : m > -0.3 ? 'annoyed' : 'sad', 6, y - 1); p.text('MOOD', 16, y, C.soft);
    p.rect(48, y, 104, 5, '#cfc3a8'); p.rect(49, y + 1, 102, 3, '#efe7d4'); p.rect(mid, y, 1, 5, C.soft);
    const len = Math.round(Math.abs(m) * 51);
    p.rect(m >= 0 ? mid + 1 : mid - len, y + 1, len, 3, m >= 0 ? '#5cb85c' : '#d9534f');
    const mw = m > 0.45 ? 'GREAT' : m > 0.15 ? 'GOOD' : m > -0.15 ? 'OK' : m > -0.45 ? 'LOW' : 'AWFUL';
    p.text(mw, PW - 6 - textWidth(mw), y, m < -0.45 ? C.red : C.ink);
    // Personality and likes.
    heading('PERSONALITY', 189);
    let cx = 6, cy = 198;
    for (const t of card.traits) {
      const tw = textWidth(t) + 6;
      if (cx + tw > PW - 6) { cx = 6; cy += 9; if (cy > 207) break; }
      p.rect(cx, cy - 2, tw, 8, '#e4d9bf'); p.text(t, cx + 3, cy, C.ink); cx += tw + 2;
    }
    p.text('LIKES', 6, 219, C.soft);
    let lx = 30;
    for (const [name, ic] of card.likes) { icon(ic, lx, 218); p.text(name, lx + 9, 219, C.ink); lx += textWidth(name) + 14; }
    if (card.since && (card.shift || card.days)) p.text(card.since, 6, 229, C.off);
  }

  // ---------- CALENDAR ----------
  function drawCal() {
    const days = card.cal, ti = card.today;
    if (calDay == null) calDay = ti;
    calDay = Math.max(1, Math.min(days.length - 1, calDay));
    const week = calMode === 'week', ws = calDay <= 7 ? 1 : 8; // (days[0] is last Sunday)
    button('mday', 6, 27, 22, 'DAY', () => { calMode = 'day'; }, !week);
    button('mweek', 29, 27, 26, 'WEEK', () => { calMode = 'week'; }, week);
    button('back', 60, 27, 11, '<', () => { calDay = week ? (ws === 8 ? calDay - 7 : calDay) : calDay - 1; });
    button('fwd', 72, 27, 11, '>', () => { calDay = week ? (ws === 1 ? calDay + 7 : calDay) : calDay + 1; });
    const title = week ? `${days[ws][1]} ${days[ws][2]} - ${days[ws + 6][1]} ${days[ws + 6][2]}` : `${days[calDay][0]} ${days[calDay][1]} ${days[calDay][2]}`;
    p.text(title, 87, 30, C.ink);
    button('today', PW - 33, 27, 27, 'TODAY', () => { calDay = ti; }, false);
    const GX = 28, HH = 7, y0 = 54, TW = 62, GW = week ? PW - 6 - GX : TW + 3; // (the day view: a timeline, and the agenda beside it)
    // The hour grid.
    for (let h = 0; h <= 24; h++) p.rect(GX, y0 + h * HH, GW, 1, h % 6 ? C.grid : C.line);
    for (let h = 2; h < 24; h += 2) p.text(`${String(h).padStart(2, '0')}:00`, 6, y0 + h * HH - 2, C.soft);
    // One day's events: its own, plus anything from the night before that ran past midnight.
    const blocksOn = (i) => {
      const out = [];
      for (const [f, t, k] of days[i - 1]?.[3] || []) if (t > 24) out.push([Math.max(0, f - 24), t - 24, k]);
      for (const [f, t, k] of days[i][3]) out.push([f, Math.min(24, t), k]);
      const list = out.filter(([f, t]) => t > f).sort((a, b) => a[0] - b[0]), all = [];
      let at = 0;
      for (const b of list) {
        if (b[0] - at >= 0.5) all.push([at, b[0], 'sleep']);
        const last = all[all.length - 1];
        if (last && last[2] === b[2] && Math.abs(last[1] - b[0]) < 0.02) last[1] = b[1]; else all.push([...b]); // (free time in a few pieces is still free time)
        at = Math.max(at, b[1]);
      }
      if (24 - at >= 0.5) all.push([at, 24, 'sleep']);
      return all;
    };
    const where = (k) => (k === 'work' && card.workAt ? ` AT ${card.workAt}` : k === 'school' && card.at ? ` AT ${card.at}` : '');
    const events = (i, x, w, text) => blocksOn(i).forEach(([f, t, k], n) => {
      const y1 = y0 + Math.round(f * HH) + 1, y2 = y0 + Math.round(t * HH), h = y2 - y1, id = `ev${i}:${n}`;
      if (h < 1) return;
      const [label, fill, ink] = EV[k] || [k.toUpperCase(), '#9e9e9e', C.white], off = i === ti && card.off && DUTY.has(k);
      p.rect(x, y1, w, h, off ? '#d9d2c4' : fill);
      if (k !== 'sleep') p.rect(x, y1, 1, h, 'rgba(0,0,0,0.25)');
      if (hover === id) p.frame(x, y1, w, h, C.ink);
      if (text && h >= 6) {
        const name = off ? card.off : label, time = hhmm(f);
        p.text(cut(name, w - 4), x + 2, y1 + 1, off ? C.red : ink);
        if (h >= 13) p.text(`${time}-${hhmm(t)}`, x + 2, y1 + 8, off ? C.soft : ink);
        else if (textWidth(name) + textWidth(time) + 10 < w) p.text(time, x + w - 2 - textWidth(time), y1 + 1, ink);
      }
      zone(id, x, y1, w, h, { tip: `${days[i][0]} ${hhmm(f)}-${hhmm(t)}  ${off ? card.off : label}${where(k)}`, act: week ? () => { calMode = 'day'; calDay = i; } : null });
    });
    if (week) {
      const cw = Math.floor(GW / 7);
      for (let c = 0; c < 7; c++) {
        const i = ws + c, x = GX + c * cw, isToday = i === ti;
        if (isToday) p.rect(x, y0 + 1, cw, 24 * HH - 1, '#e6eefb');
        const dn = days[i][0];
        p.text(dn, x + Math.round((cw - textWidth(dn)) / 2), 39, isToday ? C.today : C.soft);
        const num = String(days[i][1]), nw = textWidth(num);
        if (isToday) p.rect(x + Math.round((cw - nw) / 2) - 2, 45, nw + 4, 7, C.today);
        p.text(num, x + Math.round((cw - nw) / 2), 46, isToday ? C.white : C.ink);
        zone(`col${i}`, x, 37, cw, 16, { act: () => { calMode = 'day'; calDay = i; }, foot: 'CLICK TO SEE THIS DAY' });
        events(i, x + 1, cw - 2, false);
      }
    } else {
      const d = days[calDay], isToday = calDay === ti, num = String(d[1]);
      p.rect(6, 37, textWidth(num, 2) + 5, 14, isToday ? C.today : '#d8ccb4');
      p.text(num, 9, 39, isToday ? C.white : C.ink, 2);
      const full = { MON: 'MONDAY', TUE: 'TUESDAY', WED: 'WEDNESDAY', THU: 'THURSDAY', FRI: 'FRIDAY', SAT: 'SATURDAY', SUN: 'SUNDAY' }[d[0]];
      p.text(isToday ? `${full}  TODAY` : calDay === ti + 1 ? `${full}  TOMORROW` : calDay === ti - 1 ? `${full}  YESTERDAY` : full, 6 + textWidth(num, 2) + 9, 39, isToday ? C.today : C.ink);
      p.text(isToday && card.off ? card.off : `${d[2]}  ${d[3].length} THINGS PLANNED`, 6 + textWidth(num, 2) + 9, 46, isToday && card.off ? C.red : C.soft);
      events(calDay, GX + 2, TW, true);
      // The agenda: every event with its time (the short ones are too thin to label on the timeline).
      const AX = GX + TW + 8, list = blocksOn(calDay);
      let ay = y0 + 2;
      list.forEach(([f, t, k], n) => {
        if (k === 'sleep' || ay > y0 + 24 * HH - 8) return;
        const id = `ev${calDay}:${n}`, [label, fill] = EV[k] || [k.toUpperCase(), '#9e9e9e'], off = isToday && card.off && DUTY.has(k);
        const now = isToday && card.hour >= f && card.hour < t, past = calDay < ti || (isToday && card.hour >= t);
        if (now || hover === id) p.rect(AX - 2, ay - 2, PW - 4 - AX, 9, now ? '#e6eefb' : C.row);
        p.rect(AX, ay, 5, 5, off ? '#d9d2c4' : fill);
        p.text(hhmm(f), AX + 8, ay, past ? C.off : C.soft);
        p.text(cut(off ? `${label} ${card.off}` : label, PW - 6 - (AX + 31)), AX + 31, ay, off ? C.red : past ? C.soft : C.ink);
        zone(id, AX - 2, ay - 2, PW - 4 - AX, 9, { tip: `${hhmm(f)}-${hhmm(t)}  ${off ? card.off : label}${where(k)}` });
        ay += 9;
      });
    }
    const shownDays = week ? [...Array(7)].map((_, c) => ws + c) : [calDay];
    if (shownDays.includes(ti)) { // now
      const cw = week ? Math.floor(GW / 7) : TW + 3, x = week ? GX + (ti - ws) * cw : GX, y = y0 + Math.round(card.hour * HH);
      p.rect(x, y, cw, 1, C.now); p.rect(x - 1, y - 1, 3, 3, C.now);
    }
    const z = zones.find((q) => q.id === hover && q.tip);
    let line = z?.tip;
    if (!line) {
      if (!week && calDay === ti) {
        const list = blocksOn(ti), cur = list.find(([f, t]) => card.hour >= f && card.hour < t), nxt = list.find(([f]) => f > card.hour);
        line = cur ? `NOW: ${(EV[cur[2]] || [cur[2].toUpperCase()])[0]} UNTIL ${hhmm(cur[1])}${nxt ? `  NEXT: ${(EV[nxt[2]] || [nxt[2].toUpperCase()])[0]}` : ''}` : '';
      } else line = week ? 'CLICK A DAY TO SEE IT IN FULL' : 'HOVER OVER SOMETHING FOR THE DETAILS';
    }
    p.text(cut(line, PW - 12), 6, y0 + 24 * HH + 5, z ? C.ink : C.soft);
  }

  // ---------- TASKS ----------
  function drawTasks() {
    const done = card.tasks.filter((t) => t[1] === 'done').length;
    heading('TO DO TODAY', 28, card.tasks.length ? `${done} OF ${card.tasks.length} DONE` : '');
    let y = 38;
    if (!card.tasks.length) { p.text(card.kid ? 'NOTHING ON: A DAY TO PLAY' : 'NOTHING ON: A DAY OFF', 6, y, C.ink); y += 9; }
    for (const [label, state, prog, time] of card.tasks.slice(0, 7)) {
      p.rect(6, y - 1, 7, 7, C.soft);
      p.rect(7, y, 5, 5, state === 'done' ? '#5cb85c' : state === 'missed' ? '#d9534f' : state === 'now' ? '#f6bf26' : C.page);
      if (state === 'done') { p.px(8, y + 2, C.white); p.px(9, y + 3, C.white); p.px(10, y + 2, C.white); p.px(11, y + 1, C.white); }
      if (state === 'missed') { p.px(8, y + 1, C.white); p.px(10, y + 3, C.white); p.px(9, y + 2, C.white); p.px(10, y + 1, C.white); p.px(8, y + 3, C.white); }
      p.text(cut(label, 100), 17, y, state === 'missed' ? C.soft : C.ink);
      if (state === 'missed') p.rect(17, y + 2, Math.min(100, textWidth(label)), 1, C.soft);
      const right = state === 'now' ? `${Math.round(prog * 100)}%` : state === 'missed' ? 'MISSED' : time;
      if (state === 'now') meter(PW - 62, y, 40, prog, '#4285f4');
      p.text(right, PW - 6 - textWidth(right), y, state === 'missed' ? C.red : C.soft);
      y += 9;
    }
    y += 4;
    if (card.work) { // their work today
      heading('AT WORK', y, card.at || ''); y += 10;
      p.text(cut([card.job, card.shift && `SHIFT ${card.shift}`, card.days].filter(Boolean).join('  '), PW - 12), 6, y, C.ink); y += 9;
      const [hrs, of] = card.work;
      p.text(of ? `${hrs} OF ${of} HOURS DONE` : 'A DAY OFF TODAY', 6, y, C.soft); if (of) meter(PW - 86, y, 80, hrs / of, '#4285f4'); y += 9;
      for (const [label, v] of card.stats) { p.text(label, 12, y, C.soft); p.text(String(v), PW - 6 - textWidth(String(v)), y, C.ink); y += 8; }
    } else if (card.grades) {
      heading('SCHOOL REPORT', y, card.at || ''); y += 10;
      let gx = 6;
      for (const [s, gr] of card.grades) { p.text(s, gx, y, C.soft); p.text(gr, gx + textWidth(s) + 3, y, gr <= 'B' ? '#2e7d32' : gr === 'D' ? C.red : C.ink); gx += textWidth(s) + 12; }
      y += 9;
      const hw = (card.time.find(([k]) => k === 'study') || [0, 0])[1];
      p.text(`HOMEWORK TODAY ${dur(hw)}`, 6, y, C.soft); y += 9;
    } else { heading(card.job, y); y += 10; p.text(card.job === 'RETIRED' ? 'TAKING IT EASY' : 'THE REALTY WILL FIND THEM A JOB', 6, y, C.soft); y += 9; }
    // How the day has gone so far.
    y += 4;
    const total = card.time.reduce((s, [, m]) => s + m, 0);
    heading('HOW THEY SPENT TODAY', y, `${dur(total)} SO FAR`); y += 10;
    if (total < 1) { p.text('KEEPING TRACK FROM NOW ON', 6, y, C.soft); y += 9; }
    else p.rect(6, y, PW - 12, 6, '#e4dac3');
    let bx = 6;
    for (const [k, m] of card.time) { const w = Math.round((m / 1440) * (PW - 12)); p.rect(bx, y, w, 6, (TIME[k] || [, '#999'])[1]); bx += w; }
    y += 10;
    let lx = 6;
    for (const [k, m] of card.time) {
      const [label, color] = TIME[k] || [k.toUpperCase(), '#999'], t = `${label} ${dur(m)}`, w = textWidth(t) + 9;
      if (lx + w > PW - 6) { lx = 6; y += 8; if (y > PH - 22) break; }
      p.rect(lx, y, 5, 5, color); p.text(t, lx + 7, y, C.ink); lx += w + 3;
    }
    if (y < PH - 26) p.text(`TALKED TO PEOPLE ${card.talks} TIME${card.talks === 1 ? '' : 'S'}`, 6, y + 10, C.soft);
  }

  // ---------- PEOPLE ----------
  function drawPeople() {
    let y = 28, section = null;
    for (const [id, name, label, aff, fam, home] of card.rels) {
      const sec = home ? 'HOUSEHOLD' : 'PEOPLE THEY KNOW';
      if (sec !== section) { if (section) y += 3; heading(sec, y, home ? '' : 'GET ON  TALKS'); section = sec; y += 10; }
      if (y > PH - 20) break;
      if (hover === `rel${id}`) p.rect(4, y - 2, PW - 8, 9, C.row);
      const ic = home ? 'house' : label === 'BEST FRIEND' || label === 'FRIEND' ? 'heart' : aff < -0.2 ? 'broken' : 'person';
      icon(ic, 6, y - 1);
      p.text(cut(name, 70), 16, y, C.ink); p.text(cut(label, 48), 89, y, aff < -0.2 ? C.red : C.soft);
      const mid = 160;
      p.rect(140, y + 1, 40, 3, '#e4dac3'); p.rect(mid, y, 1, 5, C.off);
      const len = Math.round(Math.min(1, Math.abs(aff)) * 20);
      p.rect(aff >= 0 ? mid + 1 : mid - len, y + 1, len, 3, aff >= 0 ? '#5cb85c' : '#d9534f');
      if (!home) p.text(String(fam), PW - 6 - textWidth(String(fam)), y, C.soft);
      zone(`rel${id}`, 4, y - 2, PW - 8, 9, { act: () => open(id), foot: `OPEN ${name.split(' ')[0]}'S PASSPORT` });
      y += 9;
    }
    if (card.rels.length <= hhCount()) { p.text('NOBODY ELSE YET: THEY ARE NEW IN TOWN', 6, y + 4, C.soft); }
    function hhCount() { return card.rels.filter((r) => r[5]).length; }
  }

  // ---------- DIARY ----------
  function drawDiary() {
    heading('DIARY', 28, 'NEWEST FIRST');
    let y = 38;
    if (!card.diary.length) p.text('NOTHING WRITTEN YET TODAY', 6, y, C.soft);
    for (const [time, text, ic] of card.diary) {
      const lines = wrapText(text, PW - 44).slice(0, 2);
      if (y + lines.length * 7 > PH - 14) break;
      p.text(time, 6, y, C.soft); icon(ic, 28, y - 1);
      lines.forEach((l, i) => p.text(l, 38, y + i * 7, C.ink));
      y += lines.length * 7 + 3;
    }
  }
}

// The live photo: their pose right now, twice the size.
function drawPortrait(t) {
  const q = act?.person(sel), g = pic.getContext('2d');
  g.clearRect(0, 0, pic.width, pic.height);
  g.fillStyle = C.photo; g.fillRect(0, 0, pic.width, pic.height);
  g.fillStyle = '#bfd3df'; g.fillRect(0, pic.height - 4, pic.width, 4);
  if (!q) return;
  blend(pose, (ANIM[q.anim] || ANIM.stand)(t + (q.seed % 10), q.phase), 0.3);
  const fx = 9, fy = 22, hip = q.hip ? { x: fx + (q.hip.x - q.x), y: fy - (q.y - q.hip.y) } : null;
  g.save(); g.scale(2, 2);
  drawStickman(g, fx, fy, q.dir || 1, pose, hip, '#1e1e22', q.kid ? 0.72 : 1);
  g.restore();
}

const hit = (e) => zones.filter((z) => z.act || z.tip || z.foot).reverse().find((z) => { const x = e.offsetX / S, y = e.offsetY / S; return x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h; });
function create() {
  S = Math.max(2, Math.min(3, Math.floor((innerHeight - 40) / PH)));
  wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed;top:46%;transform:translateY(-50%);width:${PW * S}px;height:${PH * S}px;display:none;z-index:12;filter:drop-shadow(0 6px 0 rgba(0,0,0,0.25))`;
  cv = sprite(PW, PH); cv.style.cssText = `width:${PW * S}px;height:${PH * S}px;image-rendering:pixelated;display:block`;
  pic = sprite(38, 48); pic.style.cssText = `position:absolute;left:${7 * S}px;top:${29 * S}px;width:${38 * S}px;height:${48 * S}px;image-rendering:pixelated;pointer-events:none`;
  wrap.append(cv, pic);
  document.body.appendChild(wrap);
  win = movable(wrap, { name: 'passport', w: PW, h: PH, scale: S, home: () => Object.assign(wrap.style, { top: '46%', transform: 'translateY(-50%)' }), onScale: (s) => {
    S = s; cv.style.width = `${PW * s}px`; cv.style.height = `${PH * s}px`;
    Object.assign(pic.style, { left: `${7 * s}px`, top: `${29 * s}px`, width: `${38 * s}px`, height: `${48 * s}px` });
  } });
  cv.addEventListener('mousemove', (e) => { const id = hit(e)?.id ?? null; cv.style.cursor = zones.find((z) => z.id === id)?.act ? 'pointer' : win.cursor(e); if (id !== hover) { hover = id; draw(); } });
  cv.addEventListener('mouseleave', () => { hover = null; draw(); });
  cv.addEventListener('mousedown', (e) => { e.stopPropagation(); const z = hit(e); if (z?.act) { z.act(); if (isOpen) draw(); } else win.grab(e); });
}

// Open someone's passport (or switch to them, if one's already open).
export function open(id) {
  if (id == null || !act) return;
  if (!cv) create();
  if (id !== sel) { calDay = null; pose = newPose(); }
  sel = id;
  const sx = act.screenX(id); // the panel goes on the other side of the screen from them (unless you've moved it)
  if (sx != null && !win.moved()) { wrap.style.left = sx < 0.5 ? 'auto' : '16px'; wrap.style.right = sx < 0.5 ? '16px' : 'auto'; }
  isOpen = true; wrap.style.display = 'block'; win.apply(); shown = ''; draw();
  interact('passport', true);
}
function close() {
  isOpen = false; hover = null;
  if (wrap) wrap.style.display = 'none';
  interact('passport', false);
}
function step(k) { // the next or previous person in town
  const list = act.people().filter((q) => !q.aboard), i = list.findIndex((q) => q.id === sel);
  if (list.length) open(list[(i + k + list.length) % list.length].id);
}
// Every frame: redraw when the card's been updated (twice a second) or something's changed; the photo every frame.
export function tickPassport(t) {
  if (!isOpen) return;
  const card = act.card(sel);
  if (!card && !act.person(sel)) return close(); // they've moved away
  const key = `${card?.v}|${hover}|${tab}|${calMode}|${calDay}|${sel}`;
  if (key !== shown) { shown = key; draw(); }
  if (tab === 'id') drawPortrait(t);
}
addEventListener('keydown', (e) => { if (isOpen && !e.panelClosed && topPanel() === 'passport' && (e.key === 'Escape' || (e.metaKey && e.key.toLowerCase() === 'w'))) { e.preventDefault(); e.panelClosed = true; close(); } });

// In town: an arrow over whoever's passport is open (under the speech bubbles), and a name over whoever
// the mouse is on (over them: tags = true).
export function drawMarks(ctx, people, t, nameFor, tags) {
  for (const q of people) {
    if (q.headT !== t) continue;
    if (!tags && isOpen && q.id === sel) {
      const x = Math.round(q.headX), y = Math.round(q.headY - 7 + Math.sin(t * 4) * 1.5);
      ctx.fillStyle = '#1e1e22'; ctx.fillRect(x - 3, y - 1, 7, 2); ctx.fillRect(x - 2, y + 1, 5, 1); ctx.fillRect(x - 1, y + 2, 3, 1); ctx.fillRect(x, y + 3, 1, 1);
      ctx.fillStyle = C.hover; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x, y + 2, 1, 1);
    } else if (tags && q.id === hoverPerson && !(isOpen && q.id === sel)) {
      const name = nameFor(q);
      if (!name) continue;
      const w = textWidth(name), x = Math.round(q.headX - w / 2), y = Math.round(q.headY - 10);
      ctx.fillStyle = 'rgba(20,24,32,0.82)'; ctx.fillRect(x - 2, y - 2, w + 4, 9);
      painter(ctx).text(name, x, y, '#ffffff');
    }
  }
}
