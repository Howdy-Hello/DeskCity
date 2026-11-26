// Routines: a week of days (Monday to Sunday), everyone's own habits, and each person's plan for
// the day. Nobody runs on the town's clock: they get up when they get up, start work when their
// job starts, eat when their household eats, and go out (or don't) as they like.
//
// A person's habits are fixed for life (from their seed): when they wake, how long they sleep, how
// much they lie in at the weekend, whether they eat breakfast, how sociable they are, whether they
// run or go to the gym, how they walk. A household shares its dinner time and its evenings out, so
// families eat together. Each day is then planned as a list of blocks, e.g.
//   7:05 wake  7:30 breakfast  8:10 work (9-5:30)  17:40 shop  18:45 cook  19:30 dinner  20:10 bar  23:40 bedtime
// Weekdays: work or school, mostly in by eleven, a dinner out or a drink now and then. Weekends:
// lie in, brunch, outings, the playground with the kids, dinner out more often, late nights out.
import { rng } from './draw.js';

export const DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
export const dow = (day) => (((day + 3) % 7) + 7) % 7; // 1 Jan 1970 (day 0) was a Thursday
export const isWeekend = (day) => dow(day) >= 5;

const hash = (...xs) => { let h = 2166136261; for (const x of xs) { h ^= x | 0; h = Math.imul(h, 16777619); } return h >>> 0; };
export const dice = (...xs) => rng(hash(...xs) || 1); // a random sequence fixed by its inputs

// ---------- jobs and shifts ----------
// When each kind of job is worked (hours past 24 run on after midnight). Offices, schools and the
// factory work Monday to Friday; shops, kitchens and pubs are open all week, so their staff take two
// days off in turn; 12-hour shifts (fire and police) are four days on, three off.
export const SHIFTS = {
  office: null, // their own start time, 8.5 hours
  cashier: [[7, 15], [14.5, 22.25]],
  chef: [[10, 16.5], [16, 23.5]],
  waiter: [[10.5, 16.5], [16, 23.25]],
  bartender: [[15.75, 26.25]],
  teacher: [[7.5, 16]],
  worker: [[6, 14], [14, 22]],
  firefighter: [[8, 20], [20, 32]],
  officer: [[7, 19], [19, 31]],
  doctor: [[8, 20], [20, 32]],
  nurse: [[7, 19], [19, 31]],
  security: [[7, 19], [19, 31]],
};
const WEEKDAYS_ONLY = new Set(['office', 'teacher', 'worker']);
const LONG = new Set(['firefighter', 'officer', 'doctor', 'nurse', 'security']);
export const shiftsFor = (role) => (SHIFTS[role] ? SHIFTS[role].length : 1);

// What someone's job is: the role of their work spot ('office', 'cashier', 'chef', ...).
export function roleOf(p, city) {
  const key = p.job ? `${p.job.lot}:${p.job.desk}` : '';
  if (p._roleKey !== key) {
    const s = p.job && city.lots[p.job.lot]?.allSpots('work')[p.job.desk];
    p._roleKey = key; p._role = s ? s.role || 'office' : null;
  }
  return p._role;
}

// ---------- habits ----------
const GAIT = [['stroll', 0.2], ['walk', 0.5], ['brisk', 0.25], ['hurry', 0.05]];
export function traits(p) {
  if (p._tr) return p._tr;
  const r = dice(p.seed, 99), hump = () => (r() + r()) / 2;
  let g = r(), gait = 'walk';
  for (const [name, share] of GAIT) { if (g < share) { gait = name; break; } g -= share; }
  const off = Math.floor(r() * 7), fit = r();
  p._tr = {
    wake: 5.75 + hump() * 2.5,             // weekday alarm: 5:45 to 8:15, most around 7
    sleepLen: 6.75 + hump() * 1.75,        // hours of sleep they need
    lieIn: 0.5 + r() * 2,                  // weekends: up this much later
    breakfast: r() < 0.8,                  // 1 in 5 skip it
    showerAtNight: r() < 0.3,
    social: r() ** 1.3,                    // 0 homebody .. 1 out most nights
    fitness: fit < 0.15 ? 'runner' : fit < 0.28 ? 'gym' : null, // the disciplined few
    exMorning: r() < 0.6, exDays: 3 + Math.floor(r() * 3),
    gait, pace: 0.88 + r() * 0.24,
    officeStart: 7.5 + Math.floor(r() * 10) / 4, // 7:30 to 9:45
    shopDays: 2 + Math.floor(r() * 2),
    honest: r() > 0.07, temper: r() < 0.1, lazy: r() < 0.12, // lazy: ignores the fire alarm
    tolerance: 0.4 + r() * 0.6,            // how much smoke they'll put up with
    daysOff: [off, (off + 3) % 7, (off + 5) % 7],
  };
  if (p.kid) Object.assign(p._tr, { wake: 6.95, sleepLen: 10.25, lieIn: 0.75 + r(), breakfast: true, social: 0, fitness: null, gait: 'kid', showerAtNight: true });
  return p._tr;
}
// Shared by the whole household: when dinner is, how often they eat out, who cooks.
export function homeTraits(hh) {
  const r = dice(hh, 7);
  return { dinner: 17.75 + (r() + r()) * 1.1, outWeekday: 0.04 + r() * 0.12, outWeekend: 0.15 + r() * 0.3, cook: Math.floor(r() * 2), park: 0.35 + r() * 0.4 };
}

// ---------- one person's day ----------
// The shift worked on day d (null on a day off, or with no job).
export function shiftOn(p, d, city) {
  const role = roleOf(p, city);
  if (!role || p.kid) return null;
  const T = traits(p), wd = dow(d);
  if (WEEKDAYS_ONLY.has(role) ? wd >= 5 : T.daysOff.slice(0, LONG.has(role) ? 3 : 2).includes(wd)) return null;
  if (role === 'office') return { from: T.officeStart, to: T.officeStart + 8.5, role };
  const list = SHIFTS[role], [from, to] = list[(p.job.shift || 0) % list.length];
  return { from, to, role };
}

// When someone gets up on day d (before thinking about anything else they're doing).
function wakeOn(p, d, city) {
  const T = traits(p), R = dice(p.seed, d, 1), we = isWeekend(d);
  if (p.kid) return we ? T.wake + T.lieIn : T.wake;
  let wake = we ? T.wake + T.lieIn : T.wake + (R() - 0.5) * 0.3;
  const job = shiftOn(p, d, city), prev = shiftOn(p, d - 1, city);
  if (job && job.from < 20) wake = Math.min(wake, job.from - (T.breakfast ? 1.25 : 0.9));
  if (prev && prev.to > 24) wake = Math.max(wake, prev.to - 24 + T.sleepLen - 0.25); // sleeping off a night shift
  return wake;
}

// The household: everyone who lives in the same home.
const housemates = (p, city) => city.people.filter((q) => q.hh === p.hh);
const schoolOpen = (city, d) => !isWeekend(d) && city.lots.some((b) => b?.type === 'school' && b.ready());

// The day's plan: a list of { from, to, kind, key } blocks, hours past midnight (past 24 is after
// midnight). Between the last block and the next day's first one, they're asleep.
export function dayPlan(p, d, city) {
  const key = `${d}|${p.job ? `${p.job.lot}:${p.job.desk}:${p.job.shift || 0}` : '-'}|${schoolOpen(city, d) ? 1 : 0}|${p.kid ? 1 : 0}`;
  if (p._plan?.key === key) return p._plan.blocks;
  const blocks = buildDay(p, d, city);
  blocks.forEach((b) => { b.key = `${b.kind}@${d}:${b.from.toFixed(2)}`; });
  p._plan = { key, blocks };
  return blocks;
}

function buildDay(p, d, city) {
  const T = traits(p), H = homeTraits(p.hh), R = dice(p.seed, d, 2), HR = dice(p.hh, d, 3), we = isWeekend(d), wd = dow(d);
  const out = [], add = (from, to, kind, extra) => { if (to - from > 0.03) out.push({ from, to, kind, ...extra }); };
  const job = shiftOn(p, d, city), friday = wd === 4;
  const members = housemates(p, city), kids = members.filter((q) => q.kid), adults = members.filter((q) => !q.kid);
  const exDay = T.fitness && dice(p.seed, d, 4)() < T.exDays / 7;
  let t = wakeOn(p, d, city);
  // Bedtime: enough sleep before tomorrow's alarm (later on Friday and Saturday nights).
  let bed = 24 + wakeOn(p, d + 1, city) - T.sleepLen;
  if (p.kid) bed = isWeekend(d + 1) ? 21.25 : 20.5;
  else bed = Math.max(21, Math.min(bed, isWeekend(d + 1) ? 26 : 24.75));

  add(t, t + 0.4, 'wake'); t += 0.4;
  if (exDay && T.fitness === 'runner' && T.exMorning && (!job || job.from - t > 1.7)) { add(t, t + 0.6, 'run'); add(t + 0.6, t + 0.85, 'shower'); t += 0.85; }
  if (T.breakfast || we) { const len = we && !p.kid ? 0.9 : p.kid ? 0.3 : 0.45; add(t, t + len, we && !p.kid ? 'brunch' : 'breakfast'); t += len; }

  // ---- the day ----
  const school = p.kid && schoolOpen(city, d);
  if (school) { // school, then the playground, then homework
    t = Math.max(t, 7.55);
    add(t, 15.1, 'school'); add(15.1, 16.4, 'play'); add(16.4, 17.25, 'homework'); t = 17.25;
  } else if (job && job.from < 20) { // a day (or evening) shift
    const leave = job.from - 0.35;
    // One parent walks the kids to school on the way (whoever starts latest).
    const runner = schoolOpen(city, d) && kids.length && adults.slice().sort((a, b) => (shiftOn(b, d, city)?.from ?? 99) - (shiftOn(a, d, city)?.from ?? 99))[0] === p;
    if (runner && leave > 8.0) { if (t < 7.55) add(t, 7.55, 'relax'); add(Math.max(t, 7.55), 8.0, 'school-run'); t = Math.max(t, 8.0); }
    if (t < leave - 1.5) t = freeTime(add, p, t, leave, R, HR, we, kids, d); // a late start: the morning to themselves
    else if (t < leave) add(t, leave, 'relax');
    add(Math.max(t, leave), job.to, 'work', { shift: job }); t = job.to;
  } else if (job) { // a night shift: the afternoon before it, an early dinner, then off to work
    t = freeTime(add, p, t, 17.5, R, HR, we, kids, d);
    add(t, 18.2, 'cook'); add(18.2, 18.8, 'dinner'); add(18.8, job.from - 0.4, 'relax');
    add(job.from - 0.4, job.to, 'work', { shift: job });
    return out;
  } else if (!p.kid || we || !schoolOpen(city, d)) {
    t = freeTime(add, p, t, 17, R, HR, we, kids, d);
  }
  if (job && job.to > 24) return out; // the bar shift runs past midnight: straight to bed after

  // ---- the evening ----
  let D = H.dinner;
  if (t > D - 0.6) D = t + 0.6;
  const shopDay = !p.kid && dice(p.seed, d, 5)() < T.shopDays / 7;
  if (shopDay && p.shoppedDay !== d && D - t > 1.1 && t < 21) { add(t, t + 0.75, 'shop'); t += 0.75; }
  if (exDay && !T.exMorning && D - t > 1.25) { add(t, t + 1, T.fitness === 'runner' ? 'run' : 'gym'); add(t + 1, t + 1.25, 'shower'); t += 1.25; }
  const eatOut = HR() < (we || friday ? H.outWeekend : H.outWeekday);
  const cooks = adults.length ? adults[H.cook % adults.length] === p : true;
  if (eatOut) { add(t, D - 0.3, 'relax'); add(D - 0.3, D + 1.2, 'eatout'); t = D + 1.2; }
  else {
    if (t < D - 0.7) add(t, D - 0.7, p.kid ? 'play-home' : 'relax');
    add(Math.max(t, D - 0.7), D, cooks ? 'cook' : p.kid ? 'play-home' : 'relax'); add(D, D + 0.6, 'dinner'); t = D + 0.6;
  }
  if (exDay && !T.exMorning && T.fitness === 'gym' && !out.some((b) => b.kind === 'gym') && bed - t > 1.6) { add(t, t + 1, 'gym'); t += 1; }
  // A drink: weekdays now and then, weekends often (sociable people more), home late.
  const barChance = (we || friday ? 0.15 + 0.55 * T.social : 0.02 + 0.2 * T.social) * (kids.length ? 0.6 : 1);
  if (!p.kid && R() < barChance && t < 22) {
    const from = t + 0.2 + R() * 0.6, to = we || friday ? 23.5 + R() * 2.75 : 22.25 + R() * 1.5;
    if (from < to - 0.5) { add(t, from, 'evening'); add(from, to, 'bar'); t = to; bed = Math.max(bed, to + 0.35); }
  }
  if (t < bed - 0.5) add(t, bed - 0.5, 'evening');
  add(Math.max(t, bed - 0.5), bed, 'bedtime');
  return out;
}

// Free hours (a weekend, a day off, no job yet): a couple of things in the morning, lunch, the
// afternoon. On a family's playground day everyone goes together, at the same time.
function freeTime(add, p, t, until, R, HR, we, kids, d) {
  const family = we && (kids.length || p.kid) && HR() < 0.55, park = family ? [14 + Math.floor(HR() * 4) / 4, 15.75] : null;
  const pickOne = () => {
    const k = R();
    if (p.kid) return k < 0.45 ? 'play-home' : k < 0.7 ? 'relax' : 'outing';
    return k < 0.32 ? 'relax' : k < 0.55 ? 'outing' : k < 0.7 && p.shoppedDay !== d ? 'shop' : k < 0.85 ? 'hobby' : 'relax';
  };
  let lunched = false;
  while (t < until - 0.25) {
    if (park && t >= park[0] - 0.05 && t < park[1]) { add(t, park[1], 'playground'); t = park[1]; continue; }
    if (!lunched && t >= 11.9 && t < 14) {
      lunched = true;
      const out = !p.kid && we && R() < 0.2 + 0.4 * traits(p).social;
      add(t, t + (out ? 1.25 : 0.6), out ? 'lunchout' : 'lunch'); t += out ? 1.25 : 0.6; continue;
    }
    let len = 0.75 + Math.floor(R() * 4) * 0.25, end = Math.min(until, t + len);
    if (!lunched && t < 12 && end > 12) end = 12;
    if (park && t < park[0] && end > park[0]) end = park[0];
    const kind = pickOne();
    add(t, end, kind); t = end;
  }
  return t;
}

// The block p is in at hour h of day d ({ kind, key, from, to, shift }), or null (asleep).
// Last night's plan comes first: someone still out at the pub at 1am is still on yesterday.
export function blockAt(p, w) {
  for (const [day, h] of [[w.day - 1, w.hour + 24], [w.day, w.hour]]) {
    const b = dayPlan(p, day, w.city).find((x) => h >= x.from && h < x.to);
    if (b) return b;
  }
  return null;
}
