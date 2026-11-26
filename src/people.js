// People: daily routines, getting around (doors, stairs, elevators), and climbing on your windows.
import { ANIM, newPose, blend, drawStickman } from './stickman.js';
import { FLATPACK, UNPACK_ORDER, BOX } from './furniture.js';
import { drawBox, buildStage, pushOffset, roomSwitches, habit, ROOM_LEFT_ON, COSY_OFF, nightLevel } from './buildings.js';
import { carOf, pickupX, walkToCar, walkFromCar, startTrip, freeSlot } from './cars.js';
import { blockAt, traits, dice, roleOf } from './routine.js';
import { findSeat, mealStep, staffStep, leaveVenue } from './venues.js';
import { cooking, spray, theft, protestOn, stayPlan, hurt } from './incidents.js';
import { ROOMS } from './furniture.js';
import { painter } from './draw.js';
import { talkPose } from './social.js';

const WALK = 14, STAIRS = 10, CLIMB = 9, GRAVITY = 300; // cells per second (and per second²)
const MIN = 60e3; // one minute of town time, in ms
const IDLE = ['stretch', 'scratch', 'look', 'watch'];

const ACT_ANIM = {
  sleep: 'sleep', eat: 'eat', lunch: 'eat', cook: 'cook', fridge: 'fridge', dishes: 'dishes', tv: 'tv',
  toilet: 'toilet', wash: 'wash', shower: 'shower', bath: 'bath', work: 'type', coffee: 'coffee', meet: 'talkSit',
  browse: 'browse', pay: 'pay', rest: 'sit', dress: 'look', print: 'wait', front: 'stand',
  game: 'type', homework: 'type', garden: 'water', exercise: 'run', balcony: 'sit',
  learn: 'learn', play: 'dig', dine: 'eat', drink: 'drink', jail: 'jail', patient: 'sleep', exam: 'sit', waitroom: 'sit', nap: 'sleep',
};
// If a home or office has no spot for an activity, try these instead.
const FALLBACK = { eat: ['eat', 'tv', 'rest'], lunch: ['lunch', 'eat', 'coffee'], shower: ['shower', 'bath', 'wash'], tv: ['tv', 'rest', 'eat'], dishes: ['dishes', 'wash'], play: ['play', 'tv'], homework: ['homework', 'eat', 'tv'] };

// d.hh: the household (people who live together); d.kid: a child.
export function makePerson(d) {
  return {
    id: d.id, seed: d.seed, jitter: d.jitter, home: d.home, job: d.job ?? null, hh: d.hh ?? d.id, kid: !!d.kid,
    jail: d.jail || 0, anger: d.anger || 0, sick: d.sick || null, lane: d.seed % 3, depth: 0, v: 0,
    x: 0, y: 0, b: null, f: 0, surface: 'ground', dir: 1, vx: 0, vy: 0, win: null, winX: 0, side: 0,
    pose: newPose(), phase: d.seed % 7, anim: 'stand', hip: null, spot: null,
    plan: [], wantKey: null, fidget: 'look', fidgetEnd: 0, shoppedDay: -1, landEnd: 0, carry: null, inCar: null, tool: null,
  };
}

// ---------- what someone wants to be doing right now ----------
// acts: 'act' lasts until the next part of the day; [act, minutes] lasts that long.
// Boxes or half-built furniture waiting for this person's household?
// Which household a box belongs to: furniture goes to its room; moving boxes to the bedroom.
const boxUnit = (L, x) => L.rooms[x.item != null ? L.items[x.item].room : x.room].unit;
function unpacking(p, home) {
  if (!home) return false;
  return !!p.carry || home.boxes.some((x) => boxUnit(home.L, x) === p.home.unit && !x.carried);
}

// What someone wants to be doing right now: { key, at, acts }. Mostly it's whatever their day plan
// says (routine.js); a few things come first: a cell, a hospital bed, a cold, moving day, a protest.
// acts: 'act' lasts until the next part of the day; [act, minutes] lasts that long.
const OUT_KINDS = new Set(['work', 'school', 'school-run', 'shop', 'outing', 'bar', 'eatout', 'lunchout', 'run', 'gym', 'playground', 'play', 'hobby']);
function want(p, w) {
  const city = w.city, h = w.hour, home = city.lots[p.home.lot], unit = p.home.unit, T = traits(p);
  const has = (act) => home?.spots(act, unit).length > 0;
  if (p.jail) { if (w.now < p.jail) return { key: 'jail', at: 'jail' }; p.jail = 0; }
  if (p.sick && w.now >= p.sick.until) p.sick = null;
  if (p.sick?.ward && !p.sick.ambulance && city.lots.some((b) => b?.type === 'hospital' && b.ready())) return { key: 'ward', at: 'ward' };
  const blk = blockAt(p, w);
  p.blockKey = blk?.key ?? null; p.rush = false;
  if (!blk) return { key: 'sleep', at: 'home', acts: ['sleep'] };
  let kind = blk.key === p.doneKey ? (h < 17 ? 'relax' : 'evening') : blk.kind; // been and come back: the rest of it at home
  const key = blk.key + (kind !== blk.kind ? '+home' : '');
  if (kind === 'sleep') return { key: 'sleep', at: 'home', acts: ['sleep'] };
  const boxes = unpacking(p, home);
  // Moving day: stay home until the furniture truck has been too, then build it all.
  const truck = p.newcomer && city.orders.some((o) => o.b === home && o.unit === unit);
  if (p.newcomer && !boxes && !truck) p.newcomer = false;
  if (p.newcomer && h < 22.5 && kind !== 'bedtime' && kind !== 'wake' && !p.kid) return boxes ? { key: 'unpack', at: 'unpack' } : { key: 'await-truck', at: 'home', acts: ['tv'] };
  // Feeling ill: a cold keeps you home in bed (or on the sofa); with the flu, off to the clinic first.
  if (p.sick) {
    if (p.sick.clinic && !p.sick.seen && h >= 8 && h < 18) return { key: 'clinic', at: 'clinic' };
    if (OUT_KINDS.has(kind)) return { key: `sick:${key}`, at: 'home', acts: [kind === 'work' || kind === 'school' ? 'sleep' : 'tv'] };
  }
  const fac = protestOn(city, w);
  if (fac && (p.anger || 0) > 0.55 && !p.kid && !['work', 'school', 'bedtime', 'wake'].includes(kind)) return { key: `protest:${city.protest.day}`, at: 'protest', b: fac };
  // The household's car is at the kerb but there's a free space in the car park under home: move it in.
  const car = carOf(city, p);
  if (car && !p.kid && car.owner === p.id && car.user == null && car.park?.type === 'street' && home && Math.abs(pickupX(city, car) - home.doorX()) < CAR_WALK && freeSlot(city, p.home.lot, car) && h >= 7.5 && h < 22.5 && ['relax', 'evening', 'hobby'].includes(kind)) return { key: 'park-car', at: 'park-car' };
  if (boxes && !p.kid && ['relax', 'evening', 'hobby', 'outing'].includes(kind) && h < 22.5) return { key: 'unpack', at: 'unpack' }; // new furniture to put together
  const at = (where, acts) => ({ key, at: where, acts });
  switch (kind) {
    case 'wake': return at('home', p.kid ? [['toilet', 3], 'wash'] : [['toilet', 4], ...(T.showerAtNight ? [] : [['shower', 8]]), 'wash']);
    case 'shower': return at('home', [['shower', 8], 'wash']);
    case 'breakfast': return at('home', [['fridge', 1], 'eat']);
    case 'brunch': return at('home', [['fridge', 2], ['cook', 15], 'eat']);
    case 'lunch': return at('home', [['fridge', 1], 'eat']);
    case 'cook': return at('home', [['fridge', 1], 'cook']);
    case 'dinner': return at('home', ['eat']);
    case 'relax': case 'play-home': return at('home', [p.kid && has('play') && (kind === 'play-home' || p.seed % 2) ? 'play' : 'tv']);
    case 'homework': return at('home', ['homework']);
    case 'hobby': case 'evening': {
      if (p.kid) return at('home', [has('play') && (p.seed + w.day) % 3 === 0 ? 'play' : 'tv']);
      const hobby = ['game', 'balcony', 'garden', 'exercise'][(p.seed + w.day) % 6];
      if (hobby && has(hobby) && !(hobby === 'exercise' && h > 21)) return { key: `${key}:${hobby}`, at: 'home', acts: [hobby] };
      return at('home', ['tv']);
    }
    case 'bedtime': return at('home', p.kid ? [['toilet', 2], ['shower', 6], 'wash'] : [['dishes', 5], ...(T.showerAtNight ? [['shower', 8]] : []), 'wash']);
    case 'work': {
      const work = p.job && city.lots[p.job.lot];
      if (!work?.ready()) return at('home', ['tv']);
      const S = blk.shift.from, rel = h - S, roll = (p.seed + w.day * 7) % 10;
      if (h > S - 0.05 && p.b !== work) p.rush = true; // late: hurry
      if (roleOf(p, city) !== 'office') return { key, at: 'work', acts: ['work'] };
      // Working from home: ~1 day in 4 for people with a home office (US average is 1-1.5 days a week).
      if (has('homework') && (p.seed + w.day * 3) % 4 === 0) return rel >= 3.75 && rel < 4.6 ? { key: `${key}:lunch`, at: 'home', acts: [['fridge', 1], 'eat'] } : { key: `${key}:wfh`, at: 'home', acts: ['homework'] };
      if (rel >= 3.75 && rel < 4.75) return { key: `${key}:lunch`, at: 'work', acts: [['coffee', 3], 'lunch'] };
      if ((rel >= 1.5 && rel < 2.25 && roll < 3) || (rel >= 5.5 && rel < 6.25 && roll >= 7)) return { key: `${key}:meet${rel < 4}`, at: 'work', acts: ['meet'] };
      if (rel >= 2.5 && rel < 2.75 && roll % 3 === 0) return { key: `${key}:loo`, at: 'work', acts: [['toilet', 5], ['wash', 2], 'work'] };
      if (rel >= 6.5 && rel < 6.9 && roll < 5) return { key: `${key}:break`, at: 'work', acts: [['coffee', 5], 'rest'] };
      return { key: `${key}:desk`, at: 'work', acts: ['work'] };
    }
    case 'school': {
      if (h > 7.95) p.rush = true;
      const recess = (h >= 10 && h < 10.33) || (h >= 12.25 && h < 12.9);
      return { key: `${key}:${recess ? `recess${h < 11}` : `class${h < 11 ? 1 : h < 12.25 ? 2 : 3}`}`, at: recess ? 'playground' : 'school' };
    }
    case 'play': return { key, at: 'playground' };
    case 'school-run': return { key, at: 'school-run' };
    case 'playground': return { key, at: 'playground' };
    case 'shop': return p.shoppedDay === w.day || !city.shops().length ? at('home', ['tv']) : { key, at: 'shop' };
    case 'outing': return { key, at: 'out' };
    case 'run': return { key, at: 'run' };
    case 'gym': return { key, at: 'gym' };
    case 'eatout': case 'lunchout': return { key, at: 'eatout', late: h > blk.from + 0.5 };
    case 'bar': return { key, at: 'bar' };
  }
  return at('home', ['tv']);
}

// ---------- route planning ----------
export const here = (p) => ({ b: p.b, f: p.f, x: p.x });

function vertical(b, from, to) {
  if (from === to) return [];
  if (b.elevator) return [{ t: 'walk', x: b.elevX() }, { t: 'elev', to }];
  const s = [];
  for (let f = from; f !== to; f += Math.sign(to - from)) {
    const up = to > from, flight = up ? f : f - 1;
    s.push({ t: 'walk', x: b.stairX() }, { t: 'stairs', to: up ? f + 1 : f - 1, flight, up });
  }
  return s;
}

// Steps from `from` ({b, f}) to x on floor f of building b (b = null: outside on the street).
// (A mixed-use block has two street doors: the shop's, and the residents' by the lobby. People use
// whichever is nearer to where they're going.)
export function route(from, b, f, x) {
  const s = [];
  if (from.b && from.b !== b) { const d = from.b.doorFor(from.f, from.x ?? x); s.push(...vertical(from.b, from.f, 0), { t: 'walk', x: d }, { t: 'exit' }); }
  if (b && from.b !== b) { const d = b.doorFor(f, x); s.push({ t: 'walk', x: d, door: true }, { t: 'enter', b }, ...vertical(b, 0, f)); }
  else if (b) s.push(...vertical(b, from.f, f));
  s.push({ t: 'walk', x });
  return s;
}

// Usually on foot. Now and then by car (3 in 10 trips to work, half the shopping trips, if too far to stroll), if the
// household's car is parked where this trip starts and nobody else has it. A car left somewhere
// else always gets driven home.
const CAR_WALK = 260; // how far from the car still counts as "it's parked here"
function maybeDrive(p, w, from, b, purpose) {
  const city = w.city, car = !p.kid && carOf(city, p);
  if (!car || car.user != null || car.target || !car.park || !b || from.b === b) return null;
  const dest = city.lots.indexOf(b), home = city.lots[p.home.lot], at = pickupX(city, car);
  const near = (x) => Math.abs(at - x) < CAR_WALK;
  if (!near(from.b ? from.b.doorX() : p.x) || dest < 0) return null; // the car isn't parked where this trip starts
  if (dest === p.home.lot) return home && !near(home.doorX()) ? car : null; // left somewhere else: drive it home
  if (Math.abs(b.doorX() - p.x) < 240) return null;
  return (p.seed * 31 + w.day * 17 + purpose.length * 7) % 10 < (purpose === 'shop' ? 5 : 3) ? car : null; // half the shopping trips, 3 in 10 to work
}
function go(p, w, from, b, f, x, purpose) {
  const car = maybeDrive(p, w, from, b, purpose);
  if (!car) return route(from, b, f, x);
  return [...route(from, null, 0, pickupX(w.city, car)), { t: 'drive', car, dest: w.city.lots.indexOf(b) }, ...route({ b: null, f: 0 }, b, f, x)];
}
function parkCarPlan(p, w) {
  const city = w.city, car = carOf(city, p), home = city.lots[p.home.lot];
  if (!car || !home) return wander(p, w);
  return [...route(here(p), null, 0, pickupX(city, car)), { t: 'drive', car, dest: p.home.lot }, ...route({ b: null, f: 0 }, home, 0, home.doorX() + 6)];
}

// A spot nobody else is using or heading for (two people never share one seat, toilet or shower),
// trying the fallbacks in turn; null if every one is taken.
let everyone = [];
const claimed = (p, s) => everyone.some((q) => q !== p && (q.spot === s || q.plan.some((st) => st.spot === s)));
function pickSpot(p, b, act, unit) {
  for (const a of FALLBACK[act] || [act]) {
    const free = b.spots(a, unit).filter((s) => !claimed(p, s));
    if (free.length) return free[p.seed % free.length];
  }
  return null;
}
// Things you queue for when they're in use: wait nearby for your turn.
const TURN = new Set(['toilet', 'shower', 'bath', 'wash', 'fridge', 'cook', 'dishes', 'coffee', 'print', 'dress']);
const anySpot = (b, act, unit) => (FALLBACK[act] || [act]).map((a) => b.spots(a, unit)[0]).find(Boolean);

// Your own bed; on the floor beside it if it hasn't been put together yet.
function sleepSpot(b, unit, bed) {
  const s = b.allSpots('sleep', unit)[bed];
  return s && (s.item.ready ? s : { ...s, hip: 1, floor: true });
}
// No table, sofa or desk (or they're all taken): sit on the floor, in a clear bit of floor between
// the furniture that nobody else is sitting in, in the living room, a bedroom (a child's own room
// first), the study, or the kitchen.
function floorSpot(p, b, unit, act) {
  const kinds = p.kid ? ['bedroom', 'living', 'kitchen'] : ['living', 'bedroom', 'study', 'kitchen'];
  const taken = everyone.filter((q) => q !== p).map((q) => (q.spot?.floor ? q.spot : q.plan.find((st) => st.spot?.floor)?.spot)).filter(Boolean);
  const rooms = kinds.flatMap((k) => b.L.rooms.filter((r) => r.unit === unit && r.kind === k).sort((a, c) => (p.kid ? (c.variant === 'kids') - (a.variant === 'kids') : 0)));
  for (const room of rooms) {
    const items = b.L.items.filter((it) => it.room === room.id).sort((a, c) => a.x - c.x), gaps = [];
    let x = room.x + 3;
    for (const it of items) { if (it.x - x >= 7) gaps.push(Math.round((x + it.x) / 2)); x = Math.max(x, it.x + it.w + 1); }
    if (room.x + room.w - 3 - x >= 7) gaps.push(Math.round((x + room.x + room.w - 3) / 2));
    for (const gx of gaps) {
      if (taken.some((s) => s.room === room.id && Math.abs(s.x - gx) < 6)) continue;
      return { act, x: gx, f: room.f, hip: 2, dir: gx < room.x + room.w / 2 ? 1 : -1, room: room.id, unit, item: null, floor: true, anim: act === 'eat' ? 'floorEat' : 'phone' };
    }
  }
  return null;
}

function activityPlan(p, wn, w) {
  const b = w.city.lots[wn.at === 'home' ? p.home.lot : p.job.lot];
  if (!b?.ready()) return wander(p, w);
  const unit = wn.at === 'home' ? p.home.unit : undefined;
  const steps = [];
  let from = here(p);
  for (const a of wn.acts) {
    const [act, mins] = Array.isArray(a) ? a : [a, 0];
    let s = act === 'sleep' ? sleepSpot(b, unit, p.home.bed) : act === 'work' ? b.allSpots('work')[p.job.desk] : pickSpot(p, b, act, unit);
    if (!s && wn.at === 'home' && ['eat', 'tv', 'homework', 'game', 'play'].includes(act)) s = floorSpot(p, b, unit, act);
    if (!s && wn.at === 'work' && (act === 'lunch' || act === 'rest') && p.job) { const desk = b.allSpots('work')[p.job.desk]; if (desk) s = { ...desk, act, anim: act === 'lunch' ? 'eat' : 'sit' }; } // no free seat: lunch at your desk
    if (!s && TURN.has(act)) { // in use: go near it and wait your turn
      const any = anySpot(b, act, unit);
      if (any) {
        const near = b.x0 + any.x - any.dir * 9;
        steps.push(...(steps.length ? route(from, b, any.f, near) : go(p, w, from, b, any.f, near, wn.at)), { t: 'turn', act, unit, mins, b });
        from = { b, f: any.f };
        continue;
      }
    }
    if (!s) continue;
    const leg = steps.length ? route(from, b, s.f, b.x0 + s.x) : go(p, w, from, b, s.f, b.x0 + s.x, wn.at); // the first leg may be a drive
    if (act === 'work' && s.role && s.role !== 'office') steps.push(...leg, { t: 'staff', spot: s, role: s.role }); // shop, kitchen, bar, school, station...
    else steps.push(...leg, { t: 'do', spot: s, act, mins });
    from = { b, f: s.f };
  }
  return steps.length ? steps : wander(p, w);
}

// Fetch the next box (beds first), carry it to its room, and put it together.
function unpackPlan(p, w) {
  const b = w.city.lots[p.home.lot], L = b.L;
  const order = (x) => (x.item == null ? 99 : UNPACK_ORDER.indexOf(L.items[x.item].kind)); // furniture first, then moving boxes
  const box = p.carry || b.boxes
    .filter((x) => boxUnit(L, x) === p.home.unit && !x.carried && (x.claimed == null || x.claimed === p.id))
    .sort((a, c) => (c.opened ? 1 : 0) - (a.opened ? 1 : 0) || order(a) - order(c))[0];
  if (!box) return [{ t: 'do', anim: 'stand', mins: 3 }]; // someone else is on it
  box.claimed = p.id;
  const it = L.items[box.item], room = L.rooms[box.room], steps = [];
  // Kneel by a flat-pack; stand at the end of your own furniture to push it into place.
  const to = it ? { f: it.f, x: b.x0 + it.x + (box.own ? -3 : Math.round(it.w / 2)) } : { f: room.f, x: b.x0 + room.x + Math.round(room.w / 2) };
  let from = here(p);
  if (!p.carry && !box.opened) {
    steps.push(...route(from, box.outside ? null : b, box.f, b.x0 + box.lx + 5), { t: 'pickup', box });
    from = { b: box.outside ? null : b, f: box.f };
  }
  steps.push(...route(from, b, to.f, to.x), { t: 'assemble', box });
  return steps;
}

// Shopping: browse a few aisles, then queue for the till (one at a time, the rest in a line behind)
// and pay. Now and then someone pockets something and runs for it instead (see incidents.js).
function shopping(p, w) {
  const shops = w.city.shops();
  if (!shops.length) return wander(p, w);
  const b = shops.reduce((a, c) => (Math.abs(c.doorX() - p.x) < Math.abs(a.doorX() - p.x) ? c : a));
  const inStore = (s) => b.L.rooms[s.room]?.kind === 'store';
  const browse = b.spots('browse').filter(inStore), pay = b.spots('pay').filter(inStore), steps = [];
  let from = here(p);
  for (let i = 0; i < 2 + (p.seed % 2) && browse.length; i++) {
    const open = browse.filter((sp) => !claimed(p, sp)), s = (open.length ? open : browse)[(p.seed + i * 3 + w.day) % (open.length || browse.length)]; // an aisle nobody else is in
    steps.push(...(i ? route(from, b, 0, b.x0 + s.x) : go(p, w, from, b, 0, b.x0 + s.x, 'shop')), { t: 'do', spot: s, mins: 3 + i });
    from = { b, f: 0 };
  }
  if (!traits(p).honest && dice(p.seed, w.day, 13)() < 0.3) { // pocket something and leg it
    steps.push({ t: 'steal', b }, ...route(from, null, 0, b.doorX()), { t: 'walk', x: Math.max(8, Math.min(w.city.width() - 8, b.doorX() + (p.seed % 2 ? 140 : -140))), gait: 'sprint' }, { t: 'shopped' });
    return steps;
  }
  if (pay.length) { const s = pay[p.seed % pay.length]; steps.push(...route(from, b, 0, b.x0 + s.x), { t: 'queue', spot: s, b }, { t: 'do', spot: s, mins: 2 }); }
  steps.push({ t: 'shopped' });
  return steps;
}

// ---------- out and about: meals, the pub, school, play, exercise, protest, the clinic ----------
// A table at a restaurant or cafe (the household sits together), or a stool or table at a pub. With
// nowhere open, dinner's at home after all.
function mealPlan(p, w, kind, wn) {
  const party = kind === 'food' ? Math.max(1, everyone.filter((q) => q.hh === p.hh && q.blockKey === p.blockKey).length) : 1;
  const seat = findSeat(w.city, p, kind, w.hour, party, claimed, everyone);
  if (!seat) return activityPlan(p, { at: 'home', acts: kind === 'bar' ? ['tv'] : wn.late ? ['eat'] : [['fridge', 1], ['cook', 20], 'eat'] }, w);
  const b = seat.b, steps = go(p, w, here(p), b, seat.spot.f, b.x0 + seat.spot.x, 'eat');
  steps.push({ t: 'meal', b, spot: seat.spot, kind });
  const till = kind === 'food' && b.spots('pay').find((s) => ROOMS[b.L.rooms[s.room].kind].venue === 'food');
  if (till) steps.push(...route({ b, f: seat.spot.f }, b, till.f, b.x0 + till.x), { t: 'queue', spot: till, b }, { t: 'do', spot: till, act: 'pay', mins: 1 });
  steps.push({ t: 'finish' }); // then home
  return steps;
}
const schoolOf = (city) => city.lots.find((b) => b?.type === 'school' && b.ready() && !b.demolish);
function schoolPlan(p, w) { // to your desk in a classroom (the same one every day if it's free)
  const b = schoolOf(w.city);
  if (!b) return activityPlan(p, { at: 'home', acts: ['homework'] }, w);
  const desks = b.spots('learn'), s = desks.find((d, i) => i === p.id % desks.length && !claimed(p, d)) || desks.find((d) => !claimed(p, d)) || desks[0];
  if (!s) return wander(p, w);
  return [...go(p, w, here(p), b, s.f, b.x0 + s.x, 'school'), { t: 'do', spot: s, act: 'learn', mins: 0 }];
}
// The school playground: kids go from swing to slide to sandbox; grown-ups lean on the fence and watch.
function playPlan(p, w) {
  const b = schoolOf(w.city), yard = b?.L.rooms.find((r) => r.kind === 'playground');
  if (!yard) return p.kid ? activityPlan(p, { at: 'home', acts: ['play'] }, w) : explore(p, w);
  if (!p.kid) return [...route(here(p), b, 0, b.x0 + yard.x + 4 + (p.seed % 8)), { t: 'hold', anim: p.seed % 2 ? 'watch' : 'look', face: b.x0 + yard.x + yard.w, while: () => true }];
  const toys = b.spots('play'), steps = [];
  let from = here(p);
  for (let i = 0; i < 3 && toys.length; i++) {
    const s = toys[(p.seed + i + Math.floor(w.t / 60)) % toys.length];
    if (claimed(p, s) && s.anim !== 'slide') continue;
    steps.push(...route(from, b, s.f, b.x0 + s.x), s.anim === 'slide' ? { t: 'slide', item: s.item, b, n: 2 } : { t: 'do', spot: s, act: 'play', mins: 4 + (p.seed % 5) });
    from = { b, f: s.f };
  }
  if (!steps.length) steps.push(...route(from, b, 0, b.x0 + yard.x + 6), { t: 'walk', x: b.x0 + yard.x + yard.w - 6, gait: 'sprint' }, { t: 'walk', x: b.x0 + yard.x + 6, gait: 'sprint' }); // tag!
  return steps;
}
function schoolRun(p, w) { // walk the kids to the gate, wave them in
  const b = schoolOf(w.city);
  if (!b) return activityPlan(p, { at: 'home', acts: ['tv'] }, w);
  return [...route(here(p), null, 0, b.doorX() - 10), { t: 'hold', anim: 'wave', face: b.doorX(), secs: 4 }, { t: 'hold', anim: 'stand', face: b.doorX(), while: () => true }];
}
function runPlan(p, w) { // a jog along the street and back, then a stretch
  const W = w.city.width(), home = w.city.lots[p.home.lot], start = home ? home.doorX() : p.x, r = dice(p.seed, w.day, 17);
  const far = Math.max(10, Math.min(W - 10, start + (r() < 0.5 ? -1 : 1) * (200 + r() * 400)));
  return [...route(here(p), null, 0, start), { t: 'walk', x: far, gait: 'jog' }, { t: 'walk', x: start + 6, gait: 'jog' }, { t: 'hold', anim: 'stretch', secs: 5 }, { t: 'hold', anim: 'stretchFloor', secs: 5 }];
}
function gymPlan(p, w) { // the condo's gym (or the home gym): a few machines in turn
  const b = w.city.lots[p.home.lot];
  const kit = b ? [...b.spots('exercise', null), ...b.spots('exercise', p.home.unit)] : [];
  if (!kit.length) return runPlan(p, w);
  const steps = [];
  let from = here(p);
  for (let i = 0; i < 3; i++) {
    const s = kit.filter((k) => !claimed(p, k))[(p.seed + i) % Math.max(1, kit.length)] || kit[i % kit.length];
    steps.push(...(i ? route(from, b, s.f, b.x0 + s.x) : go(p, w, from, b, s.f, b.x0 + s.x, 'gym')), { t: 'do', spot: s, act: 'exercise', mins: 10 + (p.seed % 8) });
    from = { b, f: s.f };
  }
  return steps;
}
const SIGNS = ['NO', 'AIR', 'STOP', 'SMOG'];
function protestPlan(p, w, fac) { // outside the factory gates with a placard
  const x = fac.x0 + 14 + ((p.seed * 13) % Math.max(1, fac.L.w - 28));
  p.sign = SIGNS[p.seed % SIGNS.length];
  return [...route(here(p), null, 0, x), { t: 'hold', anim: (w2) => (Math.floor(w2.t / 3 + p.seed) % 2 ? 'protest' : 'chant'), tool: 'sign', face: fac.x0 + fac.L.w / 2, while: () => true }];
}
function clinicPlan(p, w) { // a chair in the waiting room until the doctor's free, then the exam bed
  const b = w.city.lots.find((x) => x?.type === 'hospital' && x.ready());
  const exam = b?.spots('exam')[0], chair = b && (b.spots('waitroom').find((s) => !claimed(p, s)) || b.spots('waitroom')[0]);
  if (!exam || !chair) { if (p.sick) p.sick.clinic = false; return activityPlan(p, { at: 'home', acts: ['sleep'] }, w); }
  const t0 = w.now;
  return [...go(p, w, here(p), b, chair.f, b.x0 + chair.x, 'clinic'), { t: 'hold', spot: chair, anim: 'sit', while: (w2) => everyone.some((q) => q !== p && q.spot === exam) && w2.now - t0 < 90 * MIN },
    ...route({ b, f: chair.f }, b, exam.f, b.x0 + exam.x), { t: 'do', spot: exam, act: 'exam', mins: 8 }, { t: 'seen' }];
}

// Something more pressing than the day plan (the fire alarm, being arrested, the crew called out):
// drop everything and do this. When the steps run out, back to normal.
export function forcePlan(p, steps, tag) {
  if (p.surface === 'elev' && p.b) { p.f = Math.round(p.b.elevator.pos); p.y = p.b.feetY(p.f); p.surface = 'floor'; }
  const s0 = p.plan[0];
  if (s0?.t === 'stairs' && s0.path && p.b) { p.f = s0.to; p.y = p.b.feetY(s0.to); }
  if (p.surface === 'window' || p.surface === 'climb') fall(p);
  if (p.carry && p.cityRef) putDown(p, { city: p.cityRef });
  leaveVenue(p, p.cityRef || { lots: [] });
  Object.assign(p, { plan: steps, forced: tag, wantKey: `forced:${tag}`, hip: null, spot: null, tool: null });
}
// The fire alarm's ringing where you're going: wait outside with everyone else.
function waitOutside(p, w, b) {
  const gx = p.seed % 2 ? b.x0 - b.L.ox - 10 - (p.seed % 30) : b.x0 + b.L.w + 10 + (p.seed % 30);
  return [...route(here(p), null, 0, gx), { t: 'hold', anim: 'look', face: b.x0 + b.L.w / 2, while: () => !!b.alarm }];
}

function wander(p, w) {
  const steps = p.b ? route(here(p), null, 0, p.b.doorX()) : [];
  return [...steps, { t: 'walk', x: Math.max(8, Math.min(w.city.width() - 8, p.x + (Math.random() - 0.5) * 160)) }, { t: 'do', anim: 'stand', mins: 4 }];
}

// ---------- your windows: climbing, standing on top, jumping off ----------
const inside = (v, x, y) => x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h;

// Window sides that reach down near the ground, so someone can climb them.
function climbable(w) {
  const out = [];
  w.windows.forEach((win, i) => {
    if (win.y + win.h < w.G - 24 || win.y < 40) return;
    for (const side of [-1, 1]) {
      const x = Math.round(side < 0 ? win.x - 2 : win.x + win.w + 1);
      if (x < w.view + 4 || x > w.view + w.W - 4) continue;
      if (w.windows.some((v, j) => j !== i && inside(v, x, w.G - 2))) continue; // another window is in the way
      out.push({ id: win.id, side, x });
    }
  });
  return out;
}

function explore(p, w) {
  if (p.surface === 'window') {
    const r = (k) => ((p.seed * 7 + k * 13 + w.day) % 100) / 100;
    return [
      { t: 'walk', frac: 0.1 + 0.8 * r(1) }, { t: 'do', anim: 'edge', hip: 0, mins: 8 + 10 * r(2) },
      { t: 'walk', frac: 0.1 + 0.8 * r(3) }, { t: 'do', anim: 'stand', mins: 4 },
      { t: 'walk', frac: r(4) < 0.5 ? -0.05 : 1.05 }, { t: 'jump' },
    ];
  }
  const out = p.b ? route(here(p), null, 0, p.b.doorX()) : [];
  const spots = climbable(w).filter((c) => Math.abs(c.x - p.x) < w.W).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)); // windows on this desktop only
  const c = spots[(p.seed + w.day) % Math.min(2, spots.length || 1)];
  if (!c) return wander(p, w);
  return [...out, { t: 'walk', x: c.x }, { t: 'climb', win: c.id, side: c.side, x: c.x }];
}

function offWindow(p, w) {
  const win = w.windows.find((v) => v.id === p.win);
  const left = !win || p.x - win.x < win.w / 2;
  return [{ t: 'walk', frac: left ? -0.05 : 1.05 }, { t: 'jump' }];
}

function fall(p) {
  Object.assign(p, { surface: 'air', vx: 0, vy: 0, plan: [], hip: null, spot: null, win: null, b: null });
}

// Where someone falling from y0 to y1 at x lands: the ground, or the top of a window.
function landing(w, x, y0, y1) {
  let best = y1 >= w.G ? { y: w.G } : null;
  w.windows.forEach((win, i) => {
    const sy = win.y - 1;
    if (x < win.x || x > win.x + win.w || sy <= y0 || sy > y1 || sy < 25) return;
    if (w.windows.slice(0, i).some((v) => inside(v, x, sy))) return; // that bit of edge is under another window
    if (!best || sy < best.y) best = { y: sy, win };
  });
  return best;
}

function physics(p, dt, w) {
  if (p.surface === 'window' || p.surface === 'climb') {
    const win = w.windows.find((v) => v.id === p.win);
    if (!win) return fall(p);
    if (p.surface === 'window') { // ride along when the window moves
      p.x += win.x - p.winX; p.winX = win.x; p.y = win.y - 1;
      if (p.x < win.x - 1 || p.x > win.x + win.w + 1) fall(p);
    } else if (Math.abs((p.side < 0 ? win.x - 2 : win.x + win.w + 1) - p.x) > 3) fall(p);
  }
  if (p.surface === 'air') {
    const y0 = p.y;
    p.vy = Math.min(p.vy + GRAVITY * dt, 500);
    p.y += p.vy * dt; p.x += p.vx * dt;
    const land = landing(w, p.x, y0, p.y);
    if (land) {
      Object.assign(p, { y: land.y, surface: land.win ? 'window' : 'ground', win: land.win?.id ?? null, winX: land.win?.x ?? 0, vx: 0, vy: 0, landEnd: w.t + 0.4, wantKey: null });
    }
  }
}

// ---------- walking: everyone at their own pace ----------
// [speed in cells/s, animation, stride (cells per radian of the walk cycle)]. A stroll is slow, short
// steps; a brisk walk leans in; hurried people jog; kids bob along. Each person's pace varies a little
// on top, so nobody moves in step with anyone else.
// (Stride: cells travelled per radian of the cycle, from each gait's leg swing, so feet keep pace with the ground: a walk is about 2 steps a second, a jog about 2.6, a sprint about 3.)
const GAITS = { stroll: [9, 'stroll', 1.25], walk: [13, 'walk', 2.0], brisk: [16.5, 'brisk', 2.3], hurry: [21, 'jog', 2.5], jog: [21, 'jog', 2.5], sprint: [30, 'sprint', 3.2], kid: [11.5, 'kidwalk', 1.45] };
const CREW = new Set(['crew', 'police', 'ambulance', 'evac']);
function gaitOf(p, w, override) {
  const T = traits(p);
  if (p.cuffed) return [10, 'cuffed', 1.8];
  if (p.carry) return [11, 'walk', 1.8];
  let g = override || T.gait;
  if (!override) {
    if (p.sick) g = 'stroll';
    if (p.rush && !p.b) g = p.kid ? 'sprint' : 'jog';
    if (CREW.has(p.forced)) g = p.forced === 'evac' ? (T.gait === 'stroll' ? 'walk' : 'brisk') : 'jog';
    if (p.forced === 'patient') g = 'stroll';
    if (p.kid && p.escort) { // walked to school: keep up with the grown-up
      const q = everyone.find((o) => o.id === p.escort);
      if (q && !q.b && !p.b && Math.abs(q.x - p.x) < 40 && q.v > 0) return [q.v * (Math.abs(q.x - p.x) > 6 ? 1.15 : 1), 'kidwalk', 1.45];
    }
  }
  let [v, anim, stride] = GAITS[g] || GAITS.walk;
  if (p.b && v > 17 && !CREW.has(p.forced) && !override) [v, anim, stride] = GAITS.brisk; // no running indoors
  return [v * (override ? 0.95 + (p.seed % 10) / 100 : T.pace), anim, stride];
}
// Don't walk into the back of someone: indoors, slow to their pace; outside, step into another bit
// of the pavement (three lanes, nearer or further from the kerb) and overtake.
function follow(p, v) {
  let limit = v;
  for (const q of everyone) {
    if (q === p || q.b !== p.b || q.f !== p.f || q.inCar || q.aboard || q.surface !== p.surface || !(q.v > 0.5) || q.dir !== p.dir) continue;
    const ahead = (q.x - p.x) * p.dir;
    if (ahead <= 0 || ahead > 7) continue;
    if (!p.b) {
      if (q.lane !== p.lane || q.v >= v) continue;
      const free = [0, 1, 2].filter((l) => l !== q.lane && !everyone.some((o) => o !== p && !o.b && o.lane === l && Math.abs(o.x - p.x) < 7));
      if (free.length) p.lane = free[p.seed % free.length];
      else if (q.v < limit) limit = q.v;
      continue;
    }
    if (q.v < limit) limit = Math.max(2, q.v * (ahead < 3.5 ? 0.6 : 1));
  }
  return limit;
}
// One frame of walking toward x. True once there.
function walkTo(p, x, dt, w, gait, near = 0.6) {
  const dx = x - p.x;
  if (Math.abs(dx) < near) { if (near < 1) p.x = x; return true; }
  p.dir = Math.sign(dx);
  const [v0, anim, stride] = gaitOf(p, w, gait), v = follow(p, v0);
  p.x += p.dir * Math.min(Math.abs(dx), v * dt);
  p.phase += dt * v / stride; p.anim = anim; p.v = v;
  return false;
}

// ---------- the step runner ----------
const done = (p) => p.plan.shift();
const STAFF_HELP = { walk: (q, x, dt, w) => walkTo(q, x, dt, w), route: (from, b, f, x) => route(from, b, f, x) };

// ---------- doors and light switches, by hand ----------
// The next shut door just ahead of p on the way to x (on this floor), if any.
function doorAhead(p, x) {
  const b = p.b, dir = Math.sign(x - p.x);
  if (!b || p.surface !== 'floor' || !dir) return null;
  for (const d of b.L.doors) {
    if (d.f !== p.f || d.target) continue;
    const cx = b.x0 + d.x + 1, ahead = (cx - p.x) * dir;
    if (ahead > 0 && ahead <= 3 && (x - cx) * dir > 0) return d;
  }
  return null;
}
// Walked through a doorway a few steps back: shut the door behind you, or leave it open. Front
// doors are always shut, a bathroom door nearly always, a bedroom door at bedtime mostly; the rest
// depends on the person (and nobody shuts a door in someone's face).
function shouldClose(p, d) {
  const b = p.b, cx = b.x0 + d.x + 1;
  if (everyone.some((q) => q !== p && q.b === b && q.f === d.f && Math.abs(q.x - cx) < 10)) return false;
  const into = b.roomAt(p.f, p.x);
  let k = habit(p).closeDoor * (b.type === 'office' ? 0.7 : 1);
  if (d.style === 'front') k = 0.97;
  else if (into?.kind === 'washroom') k = 0.95;
  else if (p.plan.some((s) => s.act === 'sleep')) k = 0.85;
  return Math.random() < k;
}
const awakeIn = (p, b, r) => everyone.some((q) => q !== p && q.b === b && q.f === r.f && b.roomAt(q.f, q.x) === r && q.anim !== 'sleep');
const asleepIn = (p, b, r) => everyone.some((q) => q !== p && q.b === b && q.f === r.f && b.roomAt(q.f, q.x) === r && q.anim === 'sleep');
// Is p heading somewhere in room r to do something (not just passing through)?
function staying(p, r) {
  if (p.plan.some((s) => s.t === 'do' && s.spot?.room === r.id && s.spot.f === r.f)) return true;
  const [a, b] = p.plan;
  return a?.t === 'walk' && a.x !== undefined && p.b.roomAt(p.f, a.x) === r && ['do', 'assemble', 'pickup', 'switch'].includes(b?.t);
}
const flip = (p, room, on) => p.plan.unshift({ t: 'switch', room, on });
const pull = (p, room, shut) => p.plan.unshift({ t: 'curtain', room, shut });
// Curtains: most people draw them once the light's on after dark (some never bother), close the
// bedroom's for the night, and open them again in the morning.
const CURTAIN_HABIT = [0.9, 0.75, 0.45]; // careful, average, forgetful
const curtainHabit = (p) => habit(p).curtain;

// Coming into a room: after dark, switch the light on if you're staying (and nobody's asleep in
// there). Offices: the first one onto a floor puts its lights on, day or night.
function enteredRoom(p, w, b, r) {
  if (r.outdoor || r.kind === 'lobby' || r.kind === 'reception') return;
  if (b.type === 'office') { if (r.kind !== 'washroom' && !b.lightOn(r)) flip(p, r, true); return; }
  if (b.type !== 'home') return;
  const night = nightLevel(w.hour);
  if (night < 0.1 && w.hour >= 6 && w.hour < 20 && b.curtainsShut(r) && !asleepIn(p, b, r) && Math.random() < 0.8) { pull(p, r, false); return; } // morning: open up
  if (b.lightOn(r) || night < 0.25) return;
  if (staying(p, r) && !asleepIn(p, b, r)) {
    if (b.hasCurtains(r) && !b.curtainsShut(r) && Math.random() < curtainHabit(p)) pull(p, r, true);
    flip(p, r, true); // the light first, then the curtains
    return;
  }
  // Just passing through: coming in the front door after dark (the light by the door goes on), or a
  // cosy household lighting up the living room and kitchen for the evening.
  const style = habit(p).style, inDoor = p.enteredAt > w.t - 3;
  if (!asleepIn(p, b, r) && ((inDoor && style !== 'saver' && Math.random() < 0.7) || (style === 'cosy' && ['living', 'kitchen'].includes(r.kind) && Math.random() < 0.35))) flip(p, r, true);
}
// Lights still on in the home (on floor f, or all floors), except where someone's still up: a list
// of steps to go round and switch them off (each with chance k).
function lightsRound(p, b, k, f = null, skip = null) {
  const steps = [];
  let from = here(p);
  for (const r of b.L.rooms) {
    if (r.unit !== p.home.unit || r === skip || !b.lightOn(r) || (f !== null && r.f !== f) || awakeIn(p, b, r) || Math.random() > k) continue;
    if (r.f !== from.f) steps.push(...route(from, b, r.f, b.x0 + roomSwitches(b.L, r)[0] + 1));
    steps.push({ t: 'switch', room: r, on: false });
    from = { b, f: r.f };
  }
  return { steps, from };
}
const othersUp = (p, b) => everyone.some((q) => q !== p && q.hh === p.hh && q.b === b && !q.kid && q.anim !== 'sleep' && !(q.plan[0]?.t === 'do' && q.plan[0].act === 'sleep'));
// Leaving a room: switch it off, or not. Going out: most do. Coming straight back (the plan
// returns here): most leave it on. Otherwise it depends on the person; kitchens and bathrooms get
// left on most often.
// Offices: the last one off a floor switches it off.
function leftRoom(p, w, b, r, to) {
  if (r.outdoor || r.kind === 'lobby' || r.kind === 'reception') return;
  if (!b.lightOn(r)) { if (b.type === 'home' && b.curtainsShut(r) && nightLevel(w.hour) < 0.5 && w.hour >= 6 && w.hour < 12 && !asleepIn(p, b, r) && !awakeIn(p, b, r) && Math.random() < 0.6) pull(p, r, false); return; }
  if (b.type === 'office') {
    if (to || r.kind === 'washroom') return; // still on this floor
    if (!everyone.some((q) => q !== p && q.b === b && q.f === r.f && q.surface === 'floor')) flip(p, r, false);
    return;
  }
  if (b.type !== 'home' || awakeIn(p, b, r)) return;
  if (b.curtainsShut(r) && nightLevel(w.hour) < 0.5 && w.hour >= 6 && w.hour < 12 && !asleepIn(p, b, r) && Math.random() < 0.6) pull(p, r, false); // up and about: let the day in
  const h = habit(p), back = p.plan.some((s) => s.t === 'do' && s.spot?.room === r.id && s.spot.f === r.f);
  const bed = p.wantKey === 'sleep' || p.wantKey?.startsWith('bedtime');
  const k = bed || p.plan.some((s) => s.t === 'exit') ? h.offLeaving // going out, or getting ready for bed
    : back ? 0.1 // coming straight back
    : h.style === 'cosy' && nightLevel(w.hour) >= 0.25 ? COSY_OFF[r.kind] ?? 0.06 // the evening: the lights stay on where life's happening
    : h.offRoom * (ROOM_LEFT_ON[r.kind] ?? 1);
  if (Math.random() < k) flip(p, r, false);
}
// Called every frame: notice when p walks from one room into another.
function rooms(p, w) {
  const b = p.b, r = b && p.surface === 'floor' ? b.roomAt(p.f, p.x) : null;
  const busy = ['switch', 'door', 'curtain'].includes(p.plan[0]?.t); // stepping back to a switch doesn't count
  if (r === p.room && b === p.roomB) {
    // Sitting here while it got dark: get up and put the light on.
    const s0 = p.plan[0]; // (settled into something: not going to bed, and not watching a film in the dark on purpose)
    const settled = ((s0?.t === 'do' && s0.started && s0.act !== 'sleep' && !s0.movie) || s0?.t === 'assemble') && p.anim !== 'sleep';
    if (r && !busy && settled && b.type === 'home' && !r.outdoor && r.kind !== 'lobby' && !b.lightOn(r) && nightLevel(w.hour) >= 0.25
      && w.t > (p.darkCheck ?? 0) && !asleepIn(p, b, r)) {
      p.darkCheck = w.t + 20; // look up again in a while
      if (Math.random() < 0.9) {
        const s0 = p.plan[0]; delete s0.started; p.hip = null; p.spot = null;
        p.plan.unshift({ t: 'switch', room: r, on: true }, ...(b.hasCurtains(r) && !b.curtainsShut(r) && Math.random() < curtainHabit(p) ? [{ t: 'curtain', room: r, shut: true }] : []), { t: 'walk', x: p.x });
      }
    }
    return;
  }
  if (!busy && p.room && p.roomB === b && b) leftRoom(p, w, b, p.room, r);
  p.room = r; p.roomB = b;
  if (!busy && r) enteredRoom(p, w, b, r);
}

// Walk along a list of points (down a car park ramp, say). True while still walking.
function followPath(p, s, dt, w) {
  const [v, anim, stride] = gaitOf(p, w);
  let move = v * dt;
  while (move > 0 && s.i < s.path.length) {
    const { x: tx, y: ty } = s.path[s.i], dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.01) p.dir = Math.sign(dx);
    if (d <= move) { p.x = tx; p.y = ty; s.i++; move -= d; } else { p.x += (dx / d) * move; p.y += (dy / d) * move; move = 0; }
  }
  p.phase += dt * v / stride; p.anim = anim; p.v = v;
  return s.i < s.path.length;
}

// Putting something together, one small move at a time: go to a spot, then do something there for
// a moment (or until the stage changes). Moves for each stage of the job:
//   open:   kneel by the box and cut the tape
//   layout: lean into the box for a part, carry it over, put it down by the piece
//   read:   kneel by the piece with the instructions
//   screw:  kneel at one point along the piece and screw, now and then hammer, then move along
//   raise:  stand a tall piece up (lift a low one and turn it over)
//   fold:   flatten the empty box
//   own furniture: pull the wrapping off from either end, push it into place, step back and look
//   moving box: open it, take things out one at a time and put each away somewhere in the room
const TALL = new Set(['wardrobe', 'bookshelf', 'dresser', 'treadmill']);
function nextMove(p, s, stage, k) {
  const { boxX, itemL, itemR, roomL, roomR, tall } = k, r = Math.random;
  const clamp = (x) => Math.max(roomL + 2, Math.min(roomR - 2, x));
  const beside = (xc) => { const side = p.x <= xc ? -1 : 1, x = clamp(xc + side * 5); return Math.abs(x - xc) < 3 ? clamp(xc - side * 5) : x; };
  const along = () => clamp(itemL + 2 + r() * Math.max(1, itemR - itemL - 4));
  const n = s.cycle++;
  switch (stage) {
    case 'open': return { at: beside(boxX), anim: 'cutTape', tool: 'knife', face: boxX, dur: 99 };
    case 'layout': return n % 2 === 0 ? { at: beside(boxX), anim: 'reach', face: boxX, dur: 0.8 }
      : { at: along(), anim: 'crouch', carry: 'plank', face: (itemL + itemR) / 2, dur: 0.6 };
    case 'read': return { at: beside((itemL + itemR) / 2), anim: 'read', tool: 'paper', face: (itemL + itemR) / 2, dur: 99 };
    case 'screw': { const at = n % 2 === 0 ? along() : p.x; return n % 2 === 0 ? { at, anim: 'screw', tool: 'screwdriver', face: (itemL + itemR) / 2, dur: 3 + r() * 3 } : { at, anim: 'hammer', tool: 'hammer', face: (itemL + itemR) / 2, dur: 1.2 + r() }; }
    case 'raise': return tall ? { at: beside((itemL + itemR) / 2), anim: 'raise', face: (itemL + itemR) / 2, dur: 99 }
      : { at: p.x, anim: n % 2 ? 'rise' : 'crouch', face: (itemL + itemR) / 2, dur: 0.7 };
    case 'fold': return { at: beside(boxX), anim: 'fold', face: boxX, dur: 99 };
    case 'unwrap': return { at: clamp(n % 2 ? itemR + 3 : itemL - 3), anim: 'unwrap', face: (itemL + itemR) / 2, dur: 1.6 };
    case 'push': return { at: clamp(itemL - 3), anim: 'push', face: itemR, dur: 99 };
    case 'adjust': return n % 2 === 0 ? { at: clamp(itemL - 9), anim: 'adjust', face: itemR, dur: 2.5 } : { at: clamp(itemL - 3), anim: 'push', face: itemR, dur: 1 };
    case 'unpackBox': return n % 2 === 0 ? { at: beside(boxX), anim: 'reach', face: boxX, dur: 0.9 }
      : { at: clamp(roomL + 3 + r() * (roomR - roomL - 6)), anim: 'place', carry: 'thing', tool: 'thing', face: null, dur: 0.7 };
  }
  return { at: p.x, anim: 'stand', dur: 99 };
}

function run(p, dt, w) {
  const s = p.plan[0];
  if (!s) {
    p.anim = 'stand';
    return;
  }
  if (p.holdUntil > w.t) { p.anim = 'stand'; return; } // stepping out of a lift, one at a time
  switch (s.t) {
    case 'walk': {
      let x = s.x;
      if (s.frac !== undefined) { const win = w.windows.find((v) => v.id === p.win); if (!win) return done(p); x = win.x + s.frac * win.w; }
      const dx = x - p.x;
      if (p.crossed) { // a few steps past a door: shut it behind you, or not
        const d = p.crossed, past = Math.abs(p.x - (p.b?.x0 ?? 0) - d.x - 1);
        if (!p.b || d.f !== p.f || past > 6) p.crossed = null;
        else if (past >= 3) {
          p.crossed = null;
          if (d.target && shouldClose(p, d)) { p.plan.unshift({ t: 'door', d, open: false }); return; }
        }
      }
      const shut = doorAhead(p, x);
      if (shut) { p.plan.unshift({ t: 'door', d: shut, open: true }); return; }
      if (Math.abs(dx) < 0.6) { p.x = x; return done(p); }
      const was = p.x;
      walkTo(p, x, dt, w, s.gait);
      if (p.b && p.surface === 'floor') for (const d of p.b.L.doors) { // walked through a doorway?
        const cx = p.b.x0 + d.x + 1;
        if (d.f === p.f && (was - cx) * (p.x - cx) < 0) p.crossed = d;
      }
      return;
    }
    case 'door': { // reach for the handle; the door swings open (or shut)
      if (!p.b) return done(p);
      s.t0 ??= w.t;
      p.dir = Math.sign(p.b.x0 + s.d.x + 1 - p.x) || p.dir; p.anim = 'openDoor';
      if (w.t - s.t0 > 0.35) { s.d.target = s.open ? 1 : 0; return done(p); }
      return;
    }
    case 'curtain': { // walk to the window and pull the curtains across (or open)
      const b = p.b, wx = b && b.windowOf(s.room);
      if (wx == null) return done(p);
      s.x ??= b.x0 + wx + (p.x < b.x0 + wx ? -4 : 4);
      const dx = s.x - p.x;
      if (Math.abs(dx) > 1) { walkTo(p, s.x, dt, w); return; }
      p.dir = Math.sign(b.x0 + wx - p.x) || p.dir; p.anim = 'pull'; s.t0 ??= w.t;
      if (w.t - s.t0 > 0.6) { b.setCurtains(s.room, s.shut); return done(p); }
      return;
    }
    case 'switch': { // walk up to the switch by the door and flip it
      const b = p.b;
      if (!b) return done(p);
      if (s.x === undefined) s.x = roomSwitches(b.L, s.room).map((x) => b.x0 + x + 1).reduce((a, c) => (Math.abs(c - p.x) < Math.abs(a - p.x) ? c : a));
      const dx = s.x - p.x;
      if (Math.abs(dx) > 2) { walkTo(p, s.x - Math.sign(dx) * 2, dt, w); return; }
      p.dir = Math.sign(dx) || p.dir; p.anim = 'flip'; s.t0 ??= w.t;
      if (w.t - s.t0 > 0.3) { b.setLight(s.room, s.on); return done(p); }
      return;
    }
    case 'stairs': { // follow the flight up to the half landing, turn, and take the next flight
      if (!s.path) { s.path = p.b.stairPath(s.flight, s.up); s.i = 0; }
      let move = STAIRS * dt;
      while (move > 0 && s.i < s.path.length - 1) {
        const [tx, ty] = s.path[s.i + 1], dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.01) p.dir = Math.sign(dx);
        if (d <= move) { p.x = tx; p.y = ty; s.i++; move -= d; } else { p.x += (dx / d) * move; p.y += (dy / d) * move; move = 0; }
      }
      p.phase += dt * 7; p.anim = 'stairs'; // one tread per step
      if (s.i >= s.path.length - 1) { p.f = s.to; done(p); }
      return;
    }
    case 'elev': {
      const e = p.b.elevator;
      if (!s.state) { s.state = 'call'; e.call(p.f); }
      if (s.state === 'call') {
        p.anim = 'wait';
        if (e.openAt(p.f)) s.state = 'board'; else e.call(p.f);
      }
      if (s.state === 'board') {
        if (!e.openAt(p.f)) { s.state = 'call'; return; }
        e.hold();
        const dx = p.b.elevX() - p.x;
        if (Math.abs(dx) > 0.6) { walkTo(p, p.b.elevX(), dt, w); return; }
        s.state = 'ride'; p.surface = 'elev'; e.call(s.to);
        const riders = everyone.filter((q) => q !== p && q.b === p.b && q.surface === 'elev').length;
        s.slot = [0, -4, 4, -2, 2, -5, 5][riders % 7]; // spread out in the car
      }
      if (s.state === 'ride') {
        p.y = p.b.feetY(e.pos); p.anim = 'stand'; p.dir = s.slot < 0 ? 1 : -1; p.x = p.b.elevX() + s.slot;
        if (e.openAt(s.to)) { p.f = s.to; p.y = p.b.feetY(s.to); p.surface = 'floor'; e.hold(); p.holdUntil = w.t + ((p.id * 7) % 6) * 0.18; done(p); }
        else if (e.state === 'idle' && e.pos !== s.to) e.call(s.to);
      }
      return;
    }
    case 'exit': { // out of the front door: whoever leaves a home last puts the light out by the door (mostly)
      const b = p.b, r = b?.roomAt(p.f, p.x);
      if (!s.checked && r) { s.checked = true; const n = p.plan.length; leftRoom(p, w, b, r, null); if (p.plan.length > n) return; }
      p.b = null; p.f = 0; p.surface = 'ground'; p.y = w.G; p.crossed = null; return done(p);
    }
    case 'enter': p.b = s.b; p.f = 0; p.surface = 'floor'; p.y = s.b.feetY(0); p.depth = 0; p.enteredAt = w.t; if (s.b.type === 'school') p.escort = null; return done(p);
    case 'shopped': p.shoppedDay = w.day; return done(p);
    case 'pickup': { // crouch, take hold of the box, stand up with it (in real seconds, at any clock speed)
      if (!s.started) { s.started = true; s.t0 = w.t; }
      const k = w.t - s.t0;
      if (k >= 0.35 && !p.carry) { s.box.carried = true; p.carry = s.box; }
      p.anim = k < 0.35 ? 'crouch' : 'rise';
      if (k >= 0.75) done(p);
      return;
    }
    case 'assemble': { // progress follows the town clock; how it looks follows the stage of the job
      // Own furniture just needs setting up (4 min), a moving box unpacking (3 min); flat-packs take their full time.
      const home = w.city.lots[p.home.lot], it = home.L.items[s.box.item], box = s.box;
      const mins = it ? (box.own ? 4 : FLATPACK[it.kind][1]) : 3;
      if (!s.placed) { // set the box down first
        s.ts ??= w.t; p.anim = 'crouch'; p.tool = null;
        if (w.t - s.ts < 0.4) return;
        s.placed = true; s.base = (it ? it.progress : box.progress) || 0; s.t0 = w.now;
        Object.assign(box, { carried: false, opened: true, outside: false, f: p.f, lx: Math.round(it ? it.x + it.w + 1 : p.x - home.x0 + (p.dir > 0 ? 3 : -10)) });
        p.carry = null;
      }
      const prog = Math.min(1, s.base + (w.now - s.t0) / (mins * MIN));
      if (it) it.progress = prog; else box.progress = prog;
      const stage = buildStage(!!it, !!box.own, prog);
      if (stage !== s.stage) { s.stage = stage; s.cycle = 0; s.move = null; }
      const push = it && box.own ? pushOffset(home.L, it, prog) : { dx: 0, side: 1 };
      if (stage === 'push' && push.dx) { // leaning into it, walking it along the floor into its place
        const x = push.side > 0 ? home.x0 + it.x + push.dx - 3 : home.x0 + it.x + it.w + push.dx + 3;
        if (!s.pushing) { if (walkTo(p, x, dt, w)) s.pushing = true; p.tool = null; }
        else { if (Math.abs(x - p.x) > 0.01) p.phase += dt * 6; p.x = x; p.dir = push.side; p.anim = 'push'; }
        if (prog >= 1) { home.boxes = home.boxes.filter((x2) => x2 !== box); it.ready = true; it.progress = 0; home.rebake(); done(p); }
        return;
      }
      if (!s.move || (s.until && w.t >= s.until && s.move.dur < 99)) { // next move (once this one's done)
        const room = home.roomAt(p.f, p.x) || home.roomAt(p.f, home.x0 + box.lx);
        const boxX = home.x0 + box.lx + BOX[box.size][0] / 2;
        s.move = nextMove(p, s, stage, {
          boxX, itemL: it ? home.x0 + it.x + push.dx : boxX - 3, itemR: it ? home.x0 + it.x + it.w + push.dx : boxX + 3,
          roomL: room ? home.x0 + room.x : p.x - 20, roomR: room ? home.x0 + room.x + room.w : p.x + 20, tall: it && TALL.has(it.kind),
        });
        s.until = 0;
      }
      const m = s.move, dx = m.at - p.x;
      if (Math.abs(dx) > 0.6 && !s.until) { // walking over, carrying a part (or a thing to put away)
        walkTo(p, m.at, dt, w); p.tool = m.carry || null;
      } else {
        if (!s.until) s.until = w.t + m.dur;
        p.anim = m.anim; p.tool = m.tool || null;
        if (m.face != null) p.dir = Math.sign(m.face - p.x) || p.dir;
      }
      if (prog >= 1) {
        home.boxes = home.boxes.filter((x) => x !== box);
        p.tool = null;
        if (it) { it.ready = true; it.progress = 0; home.rebake(); }
        done(p);
      }
      return;
    }
    case 'drive': { // walk to the car, drive, park, walk on from where it's parked
      const city = w.city, car = s.car;
      if (!s.phase) {
        if (car.user != null || car.target || !car.park || Math.abs(pickupX(city, car) - p.x) > 40) return done(p); // the car's gone: walk instead
        car.user = p.id; s.phase = 'board'; s.path = walkToCar(city, car); s.i = 0;
      }
      if (s.phase === 'board' || s.phase === 'alight') {
        if (followPath(p, s, dt, w)) return;
        if (s.phase === 'alight') { car.user = null; p.surface = 'ground'; return done(p); }
        s.phase = 'ride'; p.inCar = car; startTrip(city, car, p, s.dest);
        return;
      }
      p.x = car.v.x; p.y = car.v.y; p.anim = 'stand';
      if (!car.target) { // parked: out of the car
        p.inCar = null; car.v.riders = [];
        p.x = car.v.x + car.v.dir * 4; p.y = car.v.y; p.surface = 'ground';
        s.phase = 'alight'; s.path = walkFromCar(city, car); s.i = 0;
      }
      return;
    }
    case 'staff': staffStep(p, s, dt, w, STAFF_HELP); return;
    case 'chat': { // stopped for a chat: face them, and stay until it's over
      const c = s.convo;
      if (!c || c.ended || !c.members.includes(p)) return done(p);
      const other = c.members.find((q) => q !== p);
      if (other && Math.abs(other.x - p.x) > 0.5) p.dir = Math.sign(other.x - p.x);
      if (other && Math.abs(other.x - p.x) < 4) { walkTo(p, p.x + (p.x >= other.x ? 1 : -1) * 2, dt, w); return; } // not nose to nose
      p.anim = 'stand';
      return;
    }
    case 'turn': { // waiting for the bathroom (or the fridge...): go when it's free
      const spot = pickSpot(p, s.b, s.act, s.unit);
      if (!spot) { p.anim = 'wait'; return; }
      done(p);
      p.plan.unshift(...route({ b: s.b, f: p.f, x: p.x }, s.b, spot.f, s.b.x0 + spot.x), { t: 'do', spot, act: s.act, mins: s.mins });
      return;
    }
    case 'meal': if (mealStep(p, s, w)) done(p); return;
    case 'finish': p.doneKey = p.blockKey; return done(p);
    case 'seen': if (p.sick) p.sick.seen = true; return done(p);
    case 'queue': { // wait your turn at the till, in a line behind whoever's first
      s.t0 ??= w.t;
      const ahead = everyone.filter((q) => q !== p && ((q.spot === s.spot) || (q.plan[0]?.t === 'queue' && q.plan[0].spot === s.spot && q.plan[0].t0 < s.t0))).length;
      const x = s.b.x0 + s.spot.x - s.spot.dir * 6 * ahead;
      if (!walkTo(p, x, dt, w)) return;
      p.dir = s.spot.dir; p.anim = ahead ? 'wait' : 'stand';
      if (!ahead) done(p);
      return;
    }
    case 'steal': { // reach for something, pocket it, and go
      s.t0 ??= w.t; p.anim = 'reach'; p.tool = 'thing';
      if (w.t - s.t0 < 0.7) return;
      p.tool = null; theft(w.city, w, p, s.b); p.rush = true;
      return done(p);
    }
    case 'hold': { // stay put (doing something) until told otherwise
      if (!s.t0) {
        s.t0 = w.t;
        if (s.spot) { p.spot = s.spot; p.dir = s.spot.dir; p.hip = s.spot.hip ? { x: p.x, y: p.y - s.spot.hip } : null; }
      }
      if (s.face !== undefined && !s.spot && Math.abs(s.face - p.x) > 1) p.dir = Math.sign(s.face - p.x);
      p.anim = typeof s.anim === 'function' ? s.anim(w) : s.anim || 'stand';
      if (s.tool) p.tool = s.tool;
      if (s.secs ? w.t - s.t0 >= s.secs : s.while ? !s.while(w) : false) { p.hip = null; p.spot = null; p.tool = null; done(p); }
      return;
    }
    case 'board': { // into the fire engine, police car or ambulance (if it's still waiting for us)
      if (!s.v.boarding?.has(p.id)) return done(p);
      if (!walkTo(p, s.v.x - s.v.dir * 6, dt, w, null, 3)) return;
      Object.assign(p, { aboard: s.v, b: null, surface: 'ground', plan: [{ t: 'ride' }], hip: null, spot: null, tool: null });
      return;
    }
    case 'ride': if (p.aboard) { p.x = p.aboard.x; p.y = p.aboard.y; p.anim = 'stand'; } else done(p); return;
    case 'spray': { // the hose (or an extinguisher) on the fire
      const fire = s.b.fire;
      s.t0 ??= w.t;
      if (!fire || fire.outAt || w.t - s.t0 > s.secs) { p.tool = null; return done(p); }
      p.dir = Math.sign(s.b.x0 + fire.x - p.x) || p.dir; p.anim = 'spray'; p.tool = s.tool;
      if (spray(s.b, dt, s.tool, w.now)) { p.tool = null; done(p); }
      return;
    }
    case 'fight': { // trading punches
      s.t0 ??= w.t;
      p.dir = Math.sign(s.other.x - p.x) || p.dir;
      p.anim = (Math.floor((w.t - s.t0) * 1.4) + (s.reel ? 1 : 0)) % 2 ? 'punch' : 'reel';
      if (w.t - s.t0 > s.secs) done(p);
      return;
    }
    case 'slide': { // up the ladder, down the slide, again
      const it = s.item, x0 = s.b.x0 + it.x, y = s.b.feetY(it.f);
      if (!s.path) { s.path = [{ x: x0 + 3, y, a: 'kidwalk' }, { x: x0 + 3, y: y - 16, a: 'climb' }, { x: x0 + 6, y: y - 16, a: 'kidwalk' }, { x: x0 + 17, y, a: 'slideDown' }]; s.i = 0; }
      if (s.i === 0) { // one at a time on the ladder: queue at the bottom
        s.t0 ??= w.t;
        const ahead = everyone.filter((o) => o !== p && o.plan[0]?.t === 'slide' && o.plan[0].item === it && (o.plan[0].i > 0 || (o.plan[0].i === 0 && o.plan[0].t0 < s.t0))).length;
        if (ahead) { if (walkTo(p, x0 + 3 - 6 * ahead, dt, w)) { p.anim = 'stand'; p.dir = 1; } return; }
      }
      const q = s.path[s.i], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), v = q.a === 'slideDown' ? 26 : q.a === 'climb' ? 8 : 11;
      if (Math.abs(dx) > 0.1) p.dir = Math.sign(dx);
      if (d <= v * dt) { p.x = q.x; p.y = q.y; if (++s.i >= s.path.length) { s.i = 0; if (--s.n <= 0) { p.y = y; return done(p); } } }
      else { p.x += (dx / d) * v * dt; p.y += (dy / d) * v * dt; }
      p.anim = q.a; p.phase += dt * 8;
      return;
    }
    case 'climb': {
      const win = w.windows.find((v) => v.id === s.win);
      if (!win) return done(p);
      if (p.surface !== 'climb') Object.assign(p, { surface: 'climb', win: win.id, side: s.side, dir: -s.side, x: s.x });
      p.y -= CLIMB * dt; p.phase += dt * 6; p.anim = 'climb';
      p.hip = { x: p.x - p.dir, y: p.y - 7 };
      if (p.y - 7 <= win.y) { // over the top
        Object.assign(p, { surface: 'window', x: s.side < 0 ? win.x + 3 : win.x + win.w - 3, y: win.y - 1, winX: win.x, hip: null });
        done(p);
      }
      return;
    }
    case 'jump':
      if (p.surface === 'window') { fall(p); p.vy = -55; p.vx = p.dir * 18; }
      return done(p);
    case 'do': {
      if (!s.started && s.act === 'sleep' && !s.round && p.b) { // the last one up goes round the home switching off whatever's still on (a child's room too, once they're asleep)
        s.round = true;
        const r = p.b.roomAt(p.f, p.x);
        if (!p.kid && p.b === w.city.lots[p.home.lot] && !othersUp(p, p.b) && nightLevel(w.hour) >= 0.25) {
          const round = lightsRound(p, p.b, habit(p).round, null, r);
          if (round.steps.length) { p.plan.unshift(...round.steps, ...route(round.from, p.b, p.f, p.x)); return; }
        }
      }
      if (!s.started && s.act === 'sleep' && !s.dark && p.b) { // then their own light out before lying down (most people)
        s.dark = true;
        const r = p.b.roomAt(p.f, p.x);
        const pre = [];
        if (r && p.b.hasCurtains(r) && !p.b.curtainsShut(r) && Math.random() < 0.9) pre.push({ t: 'curtain', room: r, shut: true }); // curtains closed for the night
        if (r && p.b.lightOn(r) && !awakeIn(p, p.b, r) && Math.random() > habit(p).sleepLit) pre.push({ t: 'switch', room: r, on: false });
        if (pre.length) { p.plan.unshift(...pre, { t: 'walk', x: p.x }); return; }
      }
      if (s.act === 'tv' && !s.mood && p.b?.type === 'home' && w.hour >= 21.25 && nightLevel(w.hour) >= 0.5 && habit(p).style === 'cosy') {
        s.mood = true; // late evening: the big light off, a lamp on instead (or film night: watch in the dark)
        const r = p.b.roomAt(p.f, p.x), x = s.spot ? p.b.x0 + s.spot.x : p.x;
        const lamp = r && ['living', 'bedroom', 'study'].includes(r.kind), k = Math.random(); // (a living room or bedroom has a side lamp)
        const choice = lamp && k < 0.3 ? 'dim' : r?.tv && k >= 0.3 && k < 0.42 ? 'film' : null; // a lamp needs a lamp; a film needs a TV
        if (choice && p.b.light.get(r) === true && !everyone.some((q) => q !== p && q.b === p.b && p.b.roomAt(q.f, q.x) === r && q.anim !== 'tv')) {
          s.movie = choice === 'film'; s.started = false; p.hip = null; p.spot = null; // up off the sofa, and back
          p.plan.unshift({ t: 'switch', room: r, on: choice === 'dim' ? 'dim' : false }, { t: 'walk', x }); return;
        }
      }
      if (!s.started) {
        s.started = true;
        s.until = s.mins ? w.now + s.mins * MIN : 0;
        if (s.act === 'cook' && p.b) cooking(w.city, w, p, p.b, s.spot); // now and then it burns...
        if (s.act === 'fridge') p.bag = false; // leftovers from dinner out go in the fridge
        if (s.spot) { p.spot = s.spot; p.dir = s.spot.dir; }
        const hip = s.spot ? s.spot.hip : s.hip;
        p.hip = hip !== undefined ? { x: p.x, y: p.y - hip } : null;
      }
      p.anim = s.spot ? s.spot.anim || ACT_ANIM[s.act || s.spot.act] : s.anim; // eating on the sofa still looks like eating
      if (p.hip && p.surface === 'window') { p.hip.x = p.x; p.hip.y = p.y; } // sitting on a moving window
      if (s.until && w.now >= s.until) { p.hip = null; p.spot = null; done(p); }
      return;
    }
  }
}

// Plans changed while carrying a box: set it down right here, and let go of any claimed boxes.
function putDown(p, w) {
  const home = w.city.lots[p.home.lot];
  if (!home) return;
  for (const x of home.boxes) if (x.claimed === p.id && !x.carried) x.claimed = null;
  const box = p.carry;
  if (!box) return;
  box.claimed = null;
  home.placeBox(box, p.b !== home, p.b === home ? p.f : 0, p.x - home.x0 - 5); // onto the nearest stack with room
  p.carry = null;
}

function think(p, w) {
  if (p.inCar && p.plan[0]?.t !== 'drive') { // plans were wiped mid-drive: out of the car
    const c = p.inCar; p.inCar = null; c.v.riders = []; if (c.user === p.id) c.user = null;
    Object.assign(p, { x: c.v.x, y: w.G, surface: 'ground' });
  }
  if (p.plan[0]?.t === 'drive' && p.plan[0].phase) return; // finish the drive first
  if (!p.b && !p.inCar && p.y > w.G + 0.5 && p.surface === 'ground' && !p.plan.length) p.y = w.G; // back up from a car park
  if (p.surface === 'elev' && !p.plan.length) { // plans were wiped mid-ride: step out at the nearest floor
    p.f = Math.round(p.b.elevator.pos); p.y = p.b.feetY(p.f); p.surface = 'floor';
  }
  if (p.aboard) return; // riding in the fire engine, police car or ambulance
  if (p.surface === 'air' || p.surface === 'climb' || p.surface === 'elev' || w.t < p.landEnd) return;
  if (p.plan[0]?.t === 'stairs' && p.plan[0].path) return; // finish the flight first
  if (p.forced) { // drop everything until this is done
    if (p.plan.length) return;
    p.forced = null; p.wantKey = null; p.cuffed = false;
    if (p.hurtLater) { hurt(w.city, w, p, p.hurtLater); p.hurtLater = 0; return; }
  }
  if (p.sick?.ambulance) return; // waiting for the ambulance
  const wn = want(p, w);
  if (wn.key === p.wantKey && p.plan.length) return;
  p.wantKey = wn.key; p.hip = null; p.spot = null; p.tool = null; p.escort = null;
  putDown(p, w);
  leaveVenue(p, w.city);
  const city = w.city, at = wn.at;
  if (p.surface === 'window' && at !== 'out') p.plan = offWindow(p, w);
  else if (at === 'out') p.plan = explore(p, w);
  else if (at === 'shop') p.plan = shopping(p, w);
  else if (at === 'unpack') p.plan = unpackPlan(p, w);
  else if (at === 'park-car') p.plan = parkCarPlan(p, w);
  else if (at === 'eatout') p.plan = mealPlan(p, w, 'food', wn);
  else if (at === 'bar') p.plan = mealPlan(p, w, 'bar', wn);
  else if (at === 'school') {
    p.plan = schoolPlan(p, w);
    const parent = everyone.find((q) => q.hh === p.hh && !q.kid && blockAt(q, w)?.kind === 'school-run');
    p.escort = parent && !p.b?.type?.includes('school') ? parent.id : null;
  }
  else if (at === 'playground') p.plan = playPlan(p, w);
  else if (at === 'school-run') p.plan = schoolRun(p, w);
  else if (at === 'run') p.plan = runPlan(p, w);
  else if (at === 'gym') p.plan = gymPlan(p, w);
  else if (at === 'protest') p.plan = protestPlan(p, w, wn.b);
  else if (at === 'clinic') p.plan = clinicPlan(p, w);
  else if (at === 'ward') p.plan = stayPlan(city, p, 'hospital', 'patient', () => p.sick?.until || 0) || activityPlan(p, { at: 'home', acts: ['sleep'] }, w);
  else if (at === 'jail') { p.plan = stayPlan(city, p, 'police', 'jail', () => p.jail) || []; if (!p.plan.length) p.jail = 0; }
  else p.plan = activityPlan(p, wn, w);
  if (p.rush && wn.at === 'work' && p.plan.length) p.rush = true;
  // Going out after dark, last one out: switch off what's on (on this floor) on the way. Some leave a
  // lamp on in the living room so the place doesn't look empty.
  const home = city.lots[p.home.lot];
  if (p.b === home && home && p.plan.some((st) => st.t === 'exit') && nightLevel(w.hour) >= 0.25 && !p.kid && !everyone.some((q) => q !== p && q.hh === p.hh && q.b === home)) {
    const { steps } = lightsRound(p, home, habit(p).offLeaving, p.f, home.roomAt(p.f, p.x));
    const living = home.L.rooms.find((r) => r.unit === p.home.unit && r.kind === 'living');
    if (living && habit(p).style === 'cosy' && Math.random() < 0.2) { const i = steps.findIndex((st) => st.room === living); if (i >= 0) steps[i] = { ...steps[i], on: 'dim' }; }
    p.plan.unshift(...steps);
  }
  // The fire alarm's going off where we're headed: wait outside with everyone else.
  const enter = p.plan.find((st) => st.t === 'enter');
  if (enter?.b.alarm) p.plan = waitOutside(p, w, enter.b);
}

// Personal space: someone standing around steps aside from anyone right on top of them.
const STILL = new Set(['stand', 'wait', ...IDLE]);
const SEATED_TALK = new Set(['sit', 'eat', 'tv', 'drink', 'cheers', 'talkSit', 'lunch', 'coffee']);
function makeRoom(p, dt, w) {
  if (!STILL.has(p.anim) || p.hip || p.inCar || p.surface === 'elev' || p.surface === 'window') return;
  const near = everyone.find((q) => q !== p && !q.inCar && !q.aboard && q.b === p.b && q.f === p.f && Math.abs(q.y - p.y) < 3 && Math.abs(q.x - p.x) < 5 && (p.b || Math.abs((q.depth || 0) - (p.depth || 0)) < 1));
  if (!near) return;
  const away = Math.sign(p.x - near.x) || (p.id > near.id ? 1 : -1);
  let x = p.x + away * 6 * dt;
  if (p.b) { const r = p.b.roomAt(p.f, p.x); if (r) x = Math.max(p.b.x0 + r.x + 3, Math.min(p.b.x0 + r.x + r.w - 3, x)); }
  if (x === p.x) return;
  p.x = x; p.dir = away; p.phase += dt * 6; p.anim = p.kid ? 'kidwalk' : 'walk';
}

export function updatePerson(p, dt, w) {
  everyone = w.city.people; w.everyone = everyone; p.cityRef = w.city; p.v = 0;
  physics(p, dt, w);
  think(p, w);
  if (p.surface === 'air') p.anim = 'fall';
  else if (w.t < p.landEnd) p.anim = 'land';
  else run(p, dt, w);
  if (!TOOL_STEPS.has(p.plan[0]?.t)) p.tool = null; // tools only while they're being used
  if (p.convo && !(p.v > 0)) { // talking: hands going, laughing, nodding, arms crossed...
    const pose = talkPose(p);
    if (pose && (STILL.has(p.anim) || p.hip && SEATED_TALK.has(p.anim))) p.anim = pose;
    const other = p.convo.members.find((q) => q !== p);
    if (other && !p.spot && !p.hip && Math.abs(other.x - p.x) > 1 && p.plan[0]?.t !== 'staff') p.dir = Math.sign(other.x - p.x); // turn to face them
  }
  makeRoom(p, dt, w);
  // Outside, people keep to their own bit of the pavement (and step into the doorway to go in).
  const next = p.plan[0], toDoor = next?.door && Math.abs(next.x - p.x) < 14;
  const lane = !p.b && p.surface === 'ground' && Math.abs(p.y - w.G) < 0.5 && !toDoor && !p.aboard ? p.lane : 0;
  p.depth += (lane - p.depth) * Math.min(1, dt * 5);
  rooms(p, w);
  if (p.anim === 'stand') { // fidget now and then
    if (w.t > p.fidgetEnd + 5 + (p.seed % 9)) { p.fidget = IDLE[(p.seed + Math.floor(w.t)) % IDLE.length]; p.fidgetEnd = w.t + 2.2; }
    if (w.t < p.fidgetEnd) p.anim = p.fidget;
  }
}

const TOOL_STEPS = new Set(['assemble', 'staff', 'hold', 'spray', 'steal']);
const Z = [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]];

// A tool in the front hand, held along the forearm.
function drawTool(ctx, tool, hands, sign) {
  const [ex, ey, hx, hy] = hands[1], len = Math.hypot(hx - ex, hy - ey) || 1, ux = (hx - ex) / len, uy = (hy - ey) / len;
  const dot = (k, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(hx + ux * k), Math.round(hy + uy * k), 1, 1); };
  if (tool === 'screwdriver') { dot(0, '#e1b12c'); dot(1, '#9aa0a6'); dot(2, '#9aa0a6'); }
  else if (tool === 'knife') { dot(1, '#cfd3d6'); dot(2, '#cfd3d6'); }
  else if (tool === 'hammer') { // handle, then the head across its end
    dot(1, '#8b5a2b'); dot(2, '#8b5a2b'); dot(3, '#8b5a2b');
    ctx.fillStyle = '#4a4a50';
    for (const k of [-1, 0, 1]) ctx.fillRect(Math.round(hx + ux * 3 - uy * k), Math.round(hy + uy * 3 + ux * k), 1, 1);
  } else if (tool === 'plank') { // a flat-pack panel, held level in both hands
    const [, , lx, ly] = hands[0], y = Math.round((ly + hy) / 2), x0 = Math.round(Math.min(lx, hx)) - 3;
    ctx.fillStyle = '#d9c3a0'; ctx.fillRect(x0, y - 1, Math.round(Math.abs(hx - lx)) + 7, 1);
    ctx.fillStyle = '#b07d4a'; ctx.fillRect(x0, y, Math.round(Math.abs(hx - lx)) + 7, 1);
  } else if (tool === 'thing') { // something out of a moving box: a book, a mug, a lamp...
    ctx.fillStyle = ['#c0392b', '#2980b9', '#f1c40f', '#27ae60', '#ecf0f1'][Math.abs(Math.round(hx * 7 + hy)) % 5];
    ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 2, 2, 2);
  } else if (tool === 'plate' || tool === 'glass') { // carried at shoulder height, on the flat of the hand
    ctx.fillStyle = tool === 'plate' ? '#ffffff' : '#d4ac0d'; ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, tool === 'plate' ? 4 : 1, tool === 'plate' ? 1 : 2);
    if (tool === 'plate') { ctx.fillStyle = '#e67e22'; ctx.fillRect(Math.round(hx), Math.round(hy) - 2, 2, 1); }
  } else if (tool === 'box') { // a small carton, held in front
    ctx.fillStyle = '#c8a06a'; ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 3, 4, 3); ctx.fillStyle = '#9b7a4a'; ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 4, 1);
  } else if (tool === 'broom') { // handle down past the hand, bristles on the floor
    for (let k = -3; k <= 6; k++) dot(k, '#8b5a2b');
    ctx.fillStyle = '#d4ac0d'; ctx.fillRect(Math.round(hx + ux * 7) - 1, Math.round(hy + uy * 7), 3, 1);
  } else if (tool === 'cloth') { ctx.fillStyle = '#5dade2'; ctx.fillRect(Math.round(hx) - 1, Math.round(hy), 2, 2); }
  else if (tool === 'chalk') dot(1, '#ffffff');
  else if (tool === 'book') { ctx.fillStyle = '#c0392b'; ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 2, 3, 3); ctx.fillStyle = '#f3f1ec'; ctx.fillRect(Math.round(hx), Math.round(hy) - 2, 1, 3); }
  else if (tool === 'pad') { ctx.fillStyle = '#f3f1ec'; ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 2, 2, 3); }
  else if (tool === 'hose') { dot(1, '#c9a227'); dot(2, '#c9a227'); dot(3, '#9aa0a6'); }
  else if (tool === 'extinguisher') { ctx.fillStyle = '#c0392b'; ctx.fillRect(Math.round(hx) - 1, Math.round(hy), 2, 4); dot(1, '#2a2a2e'); }
  else if (tool === 'sign') { // a placard on a stick, held up high
    const sx = Math.round(hx), sy = Math.round(hy);
    ctx.fillStyle = '#8b5a2b'; ctx.fillRect(sx, sy - 6, 1, 7);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 7, sy - 13, 15, 8); ctx.fillStyle = '#c0392b'; ctx.fillRect(sx - 7, sy - 13, 15, 1);
    painter(ctx).text(sign || 'NO', sx - Math.round(((sign || 'NO').length * 4 - 1) / 2), sy - 11, '#1e1e22');
  } else if (tool === 'paper') { // the instructions, held open in both hands
    const [, , lx, ly] = hands[0];
    ctx.fillStyle = '#f3f1ec'; ctx.fillRect(Math.round(Math.min(lx, hx)) - 1, Math.round(Math.min(ly, hy)) - 2, Math.round(Math.abs(hx - lx)) + 3, 3);
    ctx.fillStyle = '#9aa0a6'; ctx.fillRect(Math.round(Math.min(lx, hx)), Math.round(Math.min(ly, hy)) - 1, Math.round(Math.abs(hx - lx)) + 1, 1);
  }
}
export function drawPerson(ctx, p, t) {
  if (p.aboard) return; // in a vehicle: they show in its windows
  const target = { ...(ANIM[p.anim] || ANIM.stand)(t + (p.seed % 10), p.phase) };
  if (p.carry && p.anim !== 'crouch') Object.assign(target, { sL: 1.3, eL: 0.7, sR: 1.3, eR: 0.7 }); // both arms round the box
  else if ((p.tool === 'plank' || p.tool === 'thing') && p.anim === 'walk') Object.assign(target, { sL: 1.2, eL: 0.6, sR: 1.25, eR: 0.55 }); // holding it out in front
  else if ((p.tool === 'plate' || p.tool === 'glass') && !p.hip) Object.assign(target, { sR: 1.55, eR: 1.1 }); // carrying it out to a table
  else if (p.tool === 'sign') Object.assign(target, { sR: Math.PI - 0.2, eR: 0.1 });
  if (p.bag && !p.hip && !p.carry) Object.assign(target, { sL: 0.1, eL: 0.1 }); // a takeaway bag in the other hand
  blend(p.pose, target, 0.3);
  const y = p.y + (p.b ? 0 : Math.round(p.depth || 0)); // further from the buildings, nearer the kerb
  let hip = p.hip;
  if (hip && p.anim === 'swing') { // swinging to and fro, on ropes from the frame
    hip = { x: hip.x + Math.sin((t + (p.seed % 10)) * 2.4) * 3, y: hip.y };
    ctx.fillStyle = '#7d6b5a'; ctx.fillRect(Math.round(hip.x) - 1, Math.round(p.y - 19), 1, Math.round(hip.y - p.y + 19)); ctx.fillRect(Math.round(hip.x) + 2, Math.round(p.y - 19), 1, Math.round(hip.y - p.y + 19));
    ctx.fillStyle = '#d35400'; ctx.fillRect(Math.round(hip.x) - 2, Math.round(hip.y) + 1, 6, 1);
  }
  const head = drawStickman(ctx, p.x, y, p.dir, p.pose, hip, '#1e1e22', p.kid ? 0.72 : 1);
  p.headX = head.x; p.headY = head.y - 2; p.headT = t; // where a speech bubble goes
  if (p.carry) { // held in front, kept inside the walls (stairwells run along the outside wall)
    const w = BOX[p.carry.size][0];
    let x = p.dir > 0 ? p.x + 1 : p.x - 1 - w;
    if (p.b) x = Math.max(p.b.x0 + 2, Math.min(p.b.x0 + p.b.L.w - 2 - w, x));
    drawBox(ctx, x, Math.round(y - (p.anim === 'rise' ? 5 : 8)), p.carry.size);
  }
  if (p.tool) drawTool(ctx, p.tool, head.hands, p.sign);
  if (p.bag && !p.hip && !p.carry) { const [, , hx, hy] = head.hands[0]; ctx.fillStyle = '#f5f5f5'; ctx.fillRect(Math.round(hx) - 1, Math.round(hy), 3, 3); ctx.fillStyle = '#c0392b'; ctx.fillRect(Math.round(hx), Math.round(hy) + 1, 1, 1); }
  if (p.sick && !p.hip && p.kid !== undefined && Math.floor(t * 0.5 + p.seed) % 9 === 0) { ctx.fillStyle = '#9fd5f5'; ctx.fillRect(Math.round(head.x + p.dir * 2), Math.round(head.y + 2), 1, 1); } // a sniffle
  if (p.anim === 'sleep' && hip) {
    ctx.fillStyle = p.spot?.item?.color || '#4f81bd';
    if (!p.spot?.floor) ctx.fillRect(Math.round(hip.x - 5), Math.round(hip.y - 1), 12, 3); // blanket
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.35 + i / 3 + p.seed * 0.1) % 1;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = '#5b8def';
      for (const [a, b] of Z) ctx.fillRect(Math.round(head.x + 3 + k * 6) + a, Math.round(head.y - 6 - k * 12) + b, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}
