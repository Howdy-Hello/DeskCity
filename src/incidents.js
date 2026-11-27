// Things going wrong, and the town dealing with them.
//
// Fires. Cooking goes wrong now and then: usually it's only burnt food and smoke (the alarm goes off
// anyway), sometimes a real pan fire. When the alarm rings, everyone in the building is expected to
// get out and wait on the pavement, watching, until it stops; a lazy few (about 1 in 8) don't
// bother and carry on with what they were doing. Whoever was cooking may grab the extinguisher
// first. If the town has a fire station, the crew on duty run to the engine, which comes out of its
// bay with its lights going, parks outside, and the crew go in with a hose, put it out (or check it
// was nothing), reset the alarm and drive back. With no fire station, the sprinklers deal with it.
// A real fire leaves black marks on the wall for a couple of days.
//
// Crime. Some people (about 1 in 14) are tempted to shoplift: they pocket something and run out
// without paying. A cashier who sees it phones the police. At the pub, someone with a temper and a
// few drinks in them can start a fight; the bartender calls it in. The officer on duty drives over,
// fetches the culprit out, cuffs them, takes them back to the station and puts them in a cell for a
// few hours. With no police station (or nobody on duty), they get away with it.
//
// Pollution. A working factory puts smoke out of its chimneys and the air gets worse (a brown haze
// over the sky). People who live near it and don't work there get fed up, faster if they mind smoke
// more. When enough of them have had enough, they protest outside the factory with placards (after
// work on a weekday, the afternoon at weekends). After the third protest the town closes the factory
// and pulls it down; nobody will build another for a couple of weeks.
import { Vehicle } from './vehicles.js';
import { route, forcePlan, here } from './people.js';
import { roleOf, traits, dice, isWeekend } from './routine.js';

const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
const onDuty = (city, b, role) => city.people.filter((q) => q.b === b && q.plan[0]?.t === 'staff' && q.plan[0].role === role && q.plan[0].here && !q.forced);
const station = (city, type) => city.lots.find((b) => b?.type === type && b.ready() && !b.demolish) || null;

// ---------- the fire engine and the police car ----------
function homeOf(f) {
  const b = f.b;
  if (f.kind === 'fire') return { x: b.x0 + b.L.bay.x + Math.round(b.L.bay.w / 2), dir: -1 };
  return { x: b.x0 + b.L.w + 4 - f.v.len / 2, dir: -1 }; // at the kerb by the station
}
function vehicle(city, kind) {
  const b = station(city, kind === 'ambulance' ? 'hospital' : kind);
  let f = city.fleet[kind];
  if (!b || (kind === 'fire' && !b.L.bay)) { if (f && f.state === 'home') city.fleet[kind] = null; return city.fleet[kind]; }
  if (!f || (f.b !== b && f.state === 'home')) {
    const v = kind === 'fire' ? new Vehicle('firetruck', { body: '#c0392b', cargo: '#c0392b', stripe: '#f5f2ec' })
      : kind === 'police' ? new Vehicle('police', { body: '#f5f5f5', stripe: '#1f3a93', ink: '#1f3a93' })
      : new Vehicle('ambulance', { body: '#f5f5f5', cargo: '#f5f5f5', stripe: '#c0392b' });
    f = city.fleet[kind] = { kind, v, b, state: 'home', crew: [], job: null };
  }
  if (f.state === 'home') { const h = homeOf(f); Object.assign(f.v, { x: h.x, y: city.G, dir: h.dir, siren: false }); f.v.path = []; b.engineHome = kind === 'fire'; }
  return f;
}
const aboard = (p, v) => p.aboard === v;
function alight(p, x, y, b = null, f = 0) {
  Object.assign(p, { aboard: null, x, y, b, f, surface: b ? 'floor' : 'ground', plan: [], forced: null, wantKey: null, hip: null, spot: null });
  if (p.v0) p.v0 = null;
}
const toVehicle = (p, v) => [...route(here(p), null, 0, v.x), { t: 'board', v }];

// ---------- fires ----------
export function startFire(city, w, b, x, f, real, who = null) {
  if (b.fire || b.build || b.demolish) return;
  const room = b.roomAt(f, b.x0 + x) || b.L.rooms.find((r) => r.f === f);
  b.fire = { room: room.id, f, x, size: real ? 0.12 + Math.random() * 0.2 : 0, smoke: 0.05, real, start: w.now, outAt: 0 };
  b.alarm = w.now;
  evacuate(city, w, b, who);
  const engine = vehicle(city, 'fire');
  if (engine && engine.state === 'home') dispatchEngine(city, w, engine, b);
}
// Cooking: about 1 meal in 80 burns (smoke, the alarm goes off), about 1 in 250 catches fire.
export function cooking(city, w, p, b, spot) {
  if (b.type !== 'home' || b.fire) return;
  const k = Math.random();
  if (k < 0.004) startFire(city, w, b, spot.x, spot.f, true, p);
  else if (k < 0.0165) startFire(city, w, b, spot.x, spot.f, false, p);
}
// Who's going to the pavement: everyone inside except the lazy, the crew, and anyone in a cell.
function evacuate(city, w, b, who) {
  const fire = b.fire;
  for (const p of city.people) {
    if (p.b !== b || p.forced || p.aboard || p.jail) continue;
    if (traits(p).lazy && !p.kid) continue; // can't be bothered
    const side = p.seed % 2 ? -1 : 1, gx = side < 0 ? b.x0 - b.L.ox - 8 - (p.seed % 36) : b.x0 + b.L.w + 8 + (p.seed % 36);
    const out = [...route(here(p), null, 0, gx, { exit: true }), { t: 'hold', anim: p.seed % 3 ? 'look' : 'wait', face: b.x0 + b.L.w / 2, while: () => !!b.alarm }]; // (down the emergency stair, where there is one)
    if (p === who && fire.real && Math.random() < 0.2) p.hurtLater = 2; // a burnt hand
    if (p === who && fire.real && Math.random() < 0.6) { // grab the extinguisher first
      const fx = b.x0 + fire.x, dir = p.x < fx ? 1 : -1;
      forcePlan(p, [...route(here(p), b, fire.f, fx - dir * 7), { t: 'spray', b, tool: 'extinguisher', secs: 4 + Math.random() * 3 }, ...route({ b, f: fire.f }, null, 0, gx, { exit: true }), out[out.length - 1]], 'evac');
    } else forcePlan(p, out, 'evac');
  }
}
// The crew run to the engine (sliding down the pole from upstairs), climb aboard, and off they go.
function dispatchEngine(city, w, f, target) {
  const crew = onDuty(city, f.b, 'firefighter').slice(0, 3);
  if (!crew.length) return;
  Object.assign(f, { state: 'muster', job: target, crew, t0: w.t });
  f.b.engineHome = true; f.v.boarding = new Set(crew.map((p) => p.id));
  for (const p of crew) forcePlan(p, [...route(here(p), f.b, 0, f.v.x + (crew.indexOf(p) - 1) * 6), { t: 'board', v: f.v }], 'crew');
}
function updateEngine(city, w) {
  const f = !city.fleet.fire || city.fleet.fire.state === 'home' ? vehicle(city, 'fire') : city.fleet.fire;
  if (!f) return;
  const v = f.v, G = city.G, target = f.job;
  if (f.state === 'home') { // any alarm still ringing that nobody's answered?
    const call = city.lots.find((b) => b?.alarm && b.fire && !b.fire.outAt);
    if (call) dispatchEngine(city, w, f, call);
    return;
  }
  v.update(w.dt);
  if (f.state === 'muster') {
    f.crew = f.crew.filter((p) => city.people.includes(p));
    if (!f.crew.every((p) => aboard(p, v)) && w.t - f.t0 < 25) return;
    f.crew = f.crew.filter((p) => aboard(p, v));
    if (!f.crew.length || !city.lots.includes(target)) { f.state = 'home'; return; }
    f.b.engineHome = false; v.siren = true; f.state = 'out'; v.boarding = null;
    v.riders = f.crew.map(() => ({ color: '#1e1e22' }));
    v.go([{ x: f.b.x0 - f.b.L.ox - v.len, y: G }, { x: target.x0 + target.L.w / 2, y: G }]);
  } else if (f.state === 'out' && !v.moving) {
    f.state = 'fight'; v.riders = []; v.boarding = new Set(f.crew.map((p) => p.id));
    const fire = target.fire;
    f.crew.forEach((p, k) => {
      alight(p, v.x - v.dir * (8 + k * 5), G);
      const fx = target.x0 + (fire ? fire.x : target.L.door + 10), dir = p.x < fx ? 1 : -1;
      const steps = fire ? [...route({ b: null, f: 0 }, target, fire.f, fx - dir * (8 + k * 4)), { t: 'spray', b: target, tool: 'hose', secs: 99 }, { t: 'hold', anim: 'look', secs: 2 }, ...route({ b: target, f: fire.f }, null, 0, v.x - v.dir * 6 + k * 4)]
        : route({ b: null, f: 0 }, null, 0, v.x - v.dir * 6 + k * 4);
      forcePlan(p, [...steps, { t: 'board', v }], 'crew');
    });
  } else if (f.state === 'fight') {
    if (target.fire && !target.fire.outAt) return;
    target.alarm = 0; // all clear
    f.crew = f.crew.filter((p) => city.people.includes(p));
    if (!f.crew.every((p) => aboard(p, v)) && w.now - target.fire?.outAt < 20 * MIN) return;
    f.crew = f.crew.filter((p) => aboard(p, v)); v.boarding = null; // (anyone left behind walks back)
    v.siren = false; f.state = 'return'; v.riders = f.crew.filter((p) => aboard(p, v)).map(() => ({ color: '#1e1e22' }));
    const h = homeOf(f);
    v.go([{ x: f.b.x0 - f.b.L.ox - v.len, y: G }, { x: h.x, y: G }]);
  } else if (f.state === 'return' && !v.moving) {
    f.crew.forEach((p, k) => { if (aboard(p, v)) alight(p, v.x + (k - 1) * 6, f.b.feetY(0), f.b, 0); });
    f.crew = []; f.state = 'home'; f.job = null; f.b.engineHome = true;
  }
}
function updateFires(city, w) {
  const dm = w.dtTown / MIN; // town minutes this frame
  for (const b of city.lots) {
    const fire = b?.fire;
    if (!fire) continue;
    if (!city.lots.includes(b)) { b.fire = null; continue; }
    const station_ = city.fleet.fire;
    if (fire.real && !fire.outAt) {
      fire.size = Math.min(1, fire.size + dm * 0.012);
      fire.smoke = Math.min(1, fire.smoke + dm * 0.15);
      if (!station_ && w.now - fire.start > 18 * MIN) fire.size -= dm * 0.2; // the sprinklers
      if (fire.size <= 0) { fire.size = 0; fire.outAt = w.now; b.scorch = { room: fire.room, x: fire.x, until: w.now + 2 * DAY }; }
    } else if (!fire.real && !fire.outAt) {
      fire.smoke = Math.min(0.35, fire.smoke + dm * 0.2);
      if (w.now - fire.start > 3 * MIN && !city.fleet.fire?.crew.length) fire.outAt = w.now; // the smoke clears on its own
    } else fire.smoke = Math.max(0, fire.smoke - dm * 0.05);
    // No crew coming: the alarm stops once it's all over.
    if (fire.outAt && b.alarm && !(city.fleet.fire && city.fleet.fire.job === b && city.fleet.fire.state !== 'home') && w.now - fire.outAt > (fire.real ? 8 : 6) * MIN) b.alarm = 0;
    if (fire.outAt && fire.smoke <= 0 && !b.alarm) b.fire = null;
  }
}
// Spraying (the hose or an extinguisher) puts the fire out bit by bit. Called from people.js.
export function spray(b, dt, tool, now) {
  const fire = b.fire;
  if (!fire || fire.outAt) return true;
  fire.size -= dt * (tool === 'hose' ? 0.08 : 0.04);
  if (!fire.real) { fire.outAt = now; return false; } // nothing to put out: just check it over
  if (fire.size > 0) return false;
  fire.size = 0; fire.outAt = now; b.scorch = { room: fire.room, x: fire.x, until: now + 2 * DAY };
  return true;
}

// ---------- crime ----------
export function theft(city, w, p, store) {
  const cashier = onDuty(city, store, 'cashier')[0];
  city.crimes.push({ kind: 'theft', culprit: p, b: store, at: w.now, reported: !!cashier, state: 'new' });
  if (cashier) forcePlan(cashier, [{ t: 'hold', anim: 'call', secs: 3.5, face: p.x }], 'call');
}
// Pub fights: now and then, between a hothead with a few drinks in them and whoever's next to them.
function brawls(city, w) {
  if (w.t < (city.nextBrawl || 0)) return;
  city.nextBrawl = w.t + 20;
  for (const b of city.lots) {
    if (!b || !b.L.rooms.some((r) => r.kind === 'pub')) continue;
    const here_ = city.people.filter((q) => q.b === b && q.plan[0]?.t === 'meal' && q.plan[0].kind === 'bar' && !q.forced);
    const hot = here_.find((q) => traits(q).temper && (q.drinks || 0) >= 2);
    if (!hot || Math.random() > 0.25) continue;
    const other = here_.filter((q) => q !== hot).sort((a, c) => Math.abs(a.x - hot.x) - Math.abs(c.x - hot.x))[0];
    if (!other) continue;
    const mid = (hot.x + other.x) / 2, side = hot.x <= other.x ? -1 : 1;
    forcePlan(hot, [{ t: 'walk', x: mid + side * 3 }, { t: 'fight', other, secs: 9 }, ...route({ b, f: hot.f }, null, 0, b.doorX() + side * 30)], 'fight');
    forcePlan(other, [{ t: 'walk', x: mid - side * 3 }, { t: 'fight', other: hot, secs: 9, reel: true }], 'fight');
    hot.doneKey = hot.blockKey; other.doneKey = other.blockKey; // the night out's over
    const barkeep = onDuty(city, b, 'bartender')[0];
    if (barkeep) forcePlan(barkeep, [{ t: 'hold', anim: 'call', secs: 3.5, face: mid }], 'call');
    city.crimes.push({ kind: 'fight', culprit: hot, b, at: w.now, reported: true, state: 'new' });
    if (Math.random() < 0.4) other.hurtLater = 3 + Math.random() * 4; // hours in hospital, once the fight's over
  }
}
// The police: drive to wherever the culprit is, fetch them out, cuff them, bring them in.
function updatePolice(city, w) {
  const f = vehicle(city, 'police');
  city.crimes = city.crimes.filter((c) => city.people.includes(c.culprit) && w.now - c.at < 6 * HOUR && c.state !== 'done');
  if (!f) return;
  const v = f.v, G = city.G, c = f.job, cul = c?.culprit;
  v.update(w.dt);
  if (f.state === 'home') {
    const next = city.crimes.find((x) => x.reported && x.state === 'new');
    const cop = next && onDuty(city, f.b, 'officer')[0];
    if (!cop) return;
    Object.assign(f, { state: 'muster', job: next, crew: [cop], t0: w.t });
    next.state = 'police'; v.boarding = new Set([cop.id]);
    forcePlan(cop, toVehicle(cop, v), 'police');
    return;
  }
  const cop = f.crew[0];
  if (!cop || !city.people.includes(cop) || (c && !city.people.includes(cul))) { // called off
    if (cop && aboard(cop, v)) alight(cop, v.x, G);
    if (c) c.state = 'done';
    f.state = 'back'; f.crew = []; v.siren = false; v.go([{ x: homeOf(f).x, y: G }]); return;
  }
  if (f.state === 'muster' && aboard(cop, v)) {
    if (cul.inCar) return; // wait till they're out of their car
    f.state = 'out'; v.siren = true; v.riders = [{ color: '#1f3a93' }]; v.boarding = null;
    const at = cul.b ? cul.b.doorFor(cul.f, cul.x) : cul.x;
    f.dest = at; v.go([{ x: at + 14, y: G }]);
  } else if (f.state === 'out' && !v.moving) {
    f.state = 'fetch'; v.riders = []; v.siren = 'parked';
    alight(cop, v.x - v.dir * 10, G);
    const meet = f.dest;
    forcePlan(cop, [{ t: 'walk', x: meet + 6 }, { t: 'hold', anim: 'stand', face: meet, while: () => f.state === 'fetch' }], 'police');
    forcePlan(cul, [...route(here(cul), null, 0, meet), { t: 'hold', anim: 'handsup', face: meet + 6, while: () => f.state === 'fetch' }], 'arrest');
    f.t0 = w.t;
  } else if (f.state === 'fetch') {
    const ready = cul.plan[0]?.t === 'hold' && cop.plan[0]?.t === 'hold' && Math.abs(cul.x - cop.x) < 9;
    if (!ready) { if (w.t - f.t0 > 60) { c.state = 'done'; f.state = 'giveup'; } return; }
    if (!f.cuffT) f.cuffT = w.t;
    if (w.t - f.cuffT < 2) return;
    f.cuffT = 0; f.state = 'escort'; cul.cuffed = true; v.boarding = new Set([cop.id, cul.id]);
    forcePlan(cop, toVehicle(cop, v), 'police');
    forcePlan(cul, toVehicle(cul, v), 'arrest');
  } else if (f.state === 'giveup') {
    if (cul.plan[0]?.t === 'hold') { cul.plan = []; cul.forced = null; }
    if (!aboard(cop, v)) { v.boarding = new Set([cop.id]); if (cop.plan[0]?.t === 'hold' || !cop.plan.length) forcePlan(cop, toVehicle(cop, v), 'police'); return; }
    f.state = 'back'; v.siren = false; v.riders = [{ color: '#1f3a93' }]; v.go([{ x: homeOf(f).x, y: G }]);
  } else if (f.state === 'escort' && aboard(cop, v) && aboard(cul, v)) {
    f.state = 'back'; v.boarding = null; v.siren = false; v.riders = [{ color: '#1f3a93' }, { color: '#1e1e22' }]; v.go([{ x: homeOf(f).x, y: G }]);
  } else if (f.state === 'back' && !v.moving) {
    v.riders = [];
    if (aboard(cop, v)) alight(cop, v.x - 6, G);
    if (aboard(cul, v)) { // booked into a cell for a few hours
      alight(cul, v.x - 12, G); cul.cuffed = false;
      cul.jail = w.now + (2 + dice(cul.seed, w.day, 9)() * 3) * HOUR;
      c.state = 'done';
    }
    f.state = 'home'; f.crew = []; f.job = null;
  }
}
// Somebody in a cell: walk them in and sit them on the bench until they're let out.
// Somebody in a cell (or a hospital bed): walk them there and keep them there until they're let out.
export function stayPlan(city, p, type, act, until) {
  const b = station(city, type), list = b ? b.spots(act) : [];
  const spot = list.find((s) => !city.people.some((q) => q !== p && q.spot === s)) || list[0];
  if (!spot) return null;
  return [...route(here(p), b, spot.f, b.x0 + spot.x), { t: 'hold', spot, anim: spot.anim, while: (w) => w.now < until() }];
}

// ---------- the hospital ----------
// People fall ill now and then (about 1 in 60 a day, children a bit more): mostly a cold, and they
// stay home in bed, off work or school; with the flu they go to the hospital's clinic, wait to be
// seen, see the doctor and go home to rest; now and then it's serious and they're kept in a ward bed
// for a day or two. Someone hurt in a fight (or a fire) gets the ambulance: a nurse drives over with
// the lights on, helps them in, and they're kept in for a few hours.
export function fallIll(city, w) {
  if (w.day === city.illDay) return;
  city.illDay = w.day;
  const hospital = station(city, 'hospital');
  for (const p of city.people) {
    const r = dice(p.seed, w.day, 21);
    if (p.sick && w.now < p.sick.until) continue;
    p.sick = null;
    if (r() > (p.kid ? 0.022 : 0.016)) continue;
    const k = r();
    p.sick = k < 0.62 ? { kind: 'cold', until: w.now + (1 + Math.floor(r() * 2)) * DAY }
      : k < 0.94 || !hospital ? { kind: 'flu', clinic: !!hospital, until: w.now + 2 * DAY }
      : { kind: 'serious', until: w.now + (1 + r()) * DAY, ward: true };
  }
}
export function hurt(city, w, p, hours) { // call an ambulance for p
  if (!station(city, 'hospital')) return;
  p.sick = { kind: 'hurt', until: w.now + hours * HOUR, ambulance: true, ward: true };
  city.patients.push(p);
}
function updateAmbulance(city, w) {
  const f = vehicle(city, 'ambulance');
  city.patients = city.patients.filter((p) => city.people.includes(p) && p.sick?.ambulance);
  if (!f) return;
  const v = f.v, G = city.G, pat = f.job;
  v.update(w.dt);
  if (f.state === 'home') {
    const next = city.patients.find((p) => !p.inCar && !p.aboard && p.surface !== 'elev');
    const nurse = next && (onDuty(city, f.b, 'nurse')[0] || onDuty(city, f.b, 'doctor')[0]);
    if (!nurse) return;
    Object.assign(f, { state: 'muster', job: next, crew: [nurse], t0: w.t }); v.boarding = new Set([nurse.id]);
    forcePlan(nurse, toVehicle(nurse, v), 'ambulance');
    return;
  }
  const nurse = f.crew[0];
  if (!nurse || !city.people.includes(nurse) || (pat && !city.people.includes(pat))) { if (nurse && aboard(nurse, v)) alight(nurse, v.x, G); f.state = 'back'; v.siren = false; v.go([{ x: homeOf(f).x, y: G }]); f.crew = []; f.job = null; return; }
  if (f.state === 'muster' && aboard(nurse, v)) {
    f.state = 'out'; v.siren = true; v.riders = [{ color: '#1e1e22' }]; v.boarding = null;
    f.dest = pat.b ? pat.b.doorFor(pat.f, pat.x) : pat.x; v.go([{ x: f.dest + 16, y: G }]);
  } else if (f.state === 'out' && !v.moving) {
    f.state = 'fetch'; v.riders = []; v.siren = 'parked'; f.t0 = w.t;
    alight(nurse, v.x - v.dir * 10, G);
    forcePlan(nurse, [{ t: 'walk', x: f.dest + 5 }, { t: 'hold', anim: 'stand', face: f.dest, while: () => f.state === 'fetch' }], 'ambulance');
    forcePlan(pat, [...route(here(pat), null, 0, f.dest), { t: 'hold', anim: 'reel', face: f.dest + 5, while: () => f.state === 'fetch' }], 'patient');
  } else if (f.state === 'fetch') {
    if (!(pat.plan[0]?.t === 'hold' && nurse.plan[0]?.t === 'hold') && w.t - f.t0 < 60) return;
    f.state = 'load'; v.boarding = new Set([nurse.id, pat.id]);
    forcePlan(nurse, toVehicle(nurse, v), 'ambulance'); forcePlan(pat, toVehicle(pat, v), 'patient');
  } else if (f.state === 'load' && aboard(nurse, v) && aboard(pat, v)) {
    f.state = 'back'; v.siren = true; v.boarding = null; v.riders = [{ color: '#1e1e22' }, { color: '#1e1e22' }]; v.go([{ x: homeOf(f).x, y: G }]);
  } else if (f.state === 'back' && !v.moving) {
    v.riders = []; v.siren = false;
    if (aboard(nurse, v)) alight(nurse, v.x - 6, G);
    if (pat && aboard(pat, v)) { alight(pat, v.x - 12, G); pat.sick.ambulance = false; }
    f.state = 'home'; f.crew = []; f.job = null;
  }
}

// ---------- pollution and protest ----------
function pollution(city, w) {
  const fac = station(city, 'factory'), dh = w.dtTown / HOUR;
  const working = fac ? onDuty(city, fac, 'worker').length : 0;
  city.pollution = Math.max(0, Math.min(1, (city.pollution || 0) * Math.exp(-dh / 36) + dh * 0.035 * working / 4));
  if (w.day !== city.angerDay) { // once a day: how fed up is everyone?
    city.angerDay = w.day;
    for (const p of city.people) {
      if (p.kid) continue;
      const home = city.lots[p.home.lot], near = fac && home ? 1 - Math.min(1, Math.abs(home.x0 - fac.x0) / (2.5 * city.W)) : 0;
      const theirs = fac && p.job?.lot === city.lots.indexOf(fac) ? 0.3 : 1;
      p.anger = Math.max(0, Math.min(1, (p.anger || 0) + city.pollution * (0.3 + 0.7 * near) * theirs * 0.7 / traits(p).tolerance - 0.08));
    }
  }
  if (!fac) { city.protest = null; return; }
  const adults = city.people.filter((p) => !p.kid), angry = adults.filter((p) => p.anger > 0.55);
  if (!city.protest && angry.length >= 3 && angry.length >= 0.3 * adults.length) {
    const day = w.hour < 15 ? w.day : w.day + 1, we = isWeekend(day);
    city.protest = { lot: city.lots.indexOf(fac), day, from: we ? 13.5 : 17.75, to: we ? 15.5 : 19.5 };
  }
  const pr = city.protest;
  if (pr && (w.day > pr.day || (w.day === pr.day && w.hour >= pr.to))) {
    city.protest = null; city.protests = (city.protests || 0) + 1;
    if (city.protests >= 3) { // enough: the factory closes and comes down
      fac.demolish = { start: w.now, end: w.now + 3 * HOUR };
      const lot = city.lots.indexOf(fac);
      for (const p of city.people) if (p.job?.lot === lot) { p.job = null; p.wantKey = null; }
      city.factoryBan = w.now + 14 * DAY; city.protests = 0;
      for (const p of city.people) p.anger = (p.anger || 0) * 0.3;
    }
  }
}
export const protestOn = (city, w) => { const pr = city.protest; return pr && w.day === pr.day && w.hour >= pr.from && w.hour < pr.to ? city.lots[pr.lot] : null; };

export function updateIncidents(city, w) {
  for (const p of city.people) { // nobody stays shut in a parked emergency vehicle
    const f = p.aboard && Object.values(city.fleet).find((x) => x?.v === p.aboard);
    if (p.aboard && (!f || f.state === 'home')) alight(p, p.aboard.x - 8, city.G);
  }
  updateFires(city, w);
  updateEngine(city, w);
  brawls(city, w);
  updatePolice(city, w);
  fallIll(city, w);
  updateAmbulance(city, w);
  pollution(city, w);
}

// ---------- drawing ----------
const px = (ctx, x, y, c, ww = 1, hh = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), ww, hh); };
// Inside, not darkened by the night: flames, smoke under the ceiling, the alarm light, water.
export function drawFireInside(ctx, b, w, people) {
  const fire = b.fire, t = w.t;
  if (fire) {
    const r = b.L.rooms[fire.room], y = b.feetY(fire.f), x = b.x0 + fire.x;
    if (fire.size > 0) for (let i = -Math.round(3 + fire.size * 7); i <= Math.round(3 + fire.size * 7); i++) {
      const h = Math.max(1, Math.round((2 + fire.size * 12) * (1 - Math.abs(i) / (4 + fire.size * 8)) * (0.6 + 0.4 * Math.sin(t * 13 + i * 1.7))));
      for (let k = 0; k < h; k++) px(ctx, x + i, y - 8 - k, k > h * 0.66 ? '#ffe066' : k > h * 0.33 ? '#ff9f1a' : '#e8410c');
    }
    if (fire.smoke > 0) {
      ctx.fillStyle = `rgba(70,70,74,${0.6 * fire.smoke})`; ctx.fillRect(b.x0 + r.x, y - 27, r.w, Math.round(2 + fire.smoke * 12));
      ctx.fillStyle = `rgba(90,90,96,${0.3 * fire.smoke})`; ctx.fillRect(b.x0 + r.x, y - 27 + Math.round(2 + fire.smoke * 12), r.w, 3);
    }
  }
  if (b.alarm) for (const r of b.L.rooms) if (!r.outdoor && Math.floor(t * 3) % 2) px(ctx, b.x0 + r.x + r.w - 5, b.feetY(r.f) - 26, '#ff2d2d', 2, 2);
  for (const p of people) { // water from the hose (or foam from an extinguisher)
    if (p.anim !== 'spray' || !fire) continue;
    const hx = p.x + p.dir * 6, hy = p.y - 11, fx = b.x0 + fire.x, fy = b.feetY(fire.f) - 9;
    for (let k = 0; k < 10; k++) {
      const u = ((k / 10) + t * 2) % 1, x = hx + (fx - hx) * u, y = hy + (fy - hy) * u - Math.sin(u * Math.PI) * 4;
      px(ctx, x, y, p.tool === 'hose' ? '#7fc8ff' : '#f5f5f5');
    }
  }
}
// Outside: smoke out of the windows and the roof, and the red light over the door while it rings.
export function drawFireOutside(ctx, b, w) {
  const fire = b.fire, t = w.t, top = b.G - (b.L.H - 1);
  if (fire && fire.smoke > 0.15) for (let k = 0; k < 10; k++) {
    const u = (t * 0.2 + k / 10) % 1, x = b.x0 + fire.x + Math.sin(t + k * 2) * 4 + u * 12, y = b.feetY(fire.f) - 22 - u * (40 + (b.feetY(fire.f) - top));
    ctx.fillStyle = `rgba(80,80,84,${0.5 * fire.smoke * (1 - u)})`; ctx.fillRect(Math.round(x - 2 - u * 3), Math.round(y), Math.round(4 + u * 6), Math.round(3 + u * 4));
  }
  if (b.alarm) { const on = Math.floor(t * 3) % 2, dx = b.doorX() + 6, y = b.G - 24; px(ctx, dx, y, on ? '#ff2d2d' : '#7a1f1f', 3, 2); if (on) { ctx.fillStyle = 'rgba(255,45,45,0.25)'; ctx.fillRect(dx - 3, y - 3, 9, 8); } }
}
// The fire engine, parked in its bay (inside the station).
export function drawBay(ctx, b, w) {
  const f = w.city.fleet?.fire;
  if (f && f.b === b && (f.state === 'home' || f.state === 'muster')) f.v.draw(ctx, w.t, 0);
}
// The fire engine on a call and the police car, on the road.
export function drawFleet(ctx, city, w, seen) {
  for (const f of [city.fleet.fire, city.fleet.police, city.fleet.ambulance]) {
    if (!f || (f.kind === 'fire' && (f.state === 'home' || f.state === 'muster')) || !seen(f.v.x - 40, f.v.x + 40)) continue;
    f.v.draw(ctx, w.t, w.night);
  }
}
// Chimney smoke while the factory's working, and a brown haze over the sky when the air's bad.
export function drawSmoke(ctx, city, w, seen) {
  for (const b of city.lots) {
    if (b?.type !== 'factory' || b.build || b.demolish || !seen(b.x0 - 60, b.x0 + b.L.w + 60)) continue;
    const working = city.people.some((q) => q.b === b && q.plan[0]?.t === 'staff' && q.plan[0].role === 'worker');
    if (!working) continue;
    const top = b.G - (b.L.H - 1), dark = 0.35 + 0.4 * (city.pollution || 0);
    for (const cx of [Math.round(b.L.w * 0.22), Math.round(b.L.w * 0.62)]) for (let k = 0; k < 9; k++) {
      const u = (w.t * 0.12 + k / 9 + cx * 0.01) % 1, x = b.x0 + cx + 3 + u * 26 + Math.sin(w.t * 0.7 + k) * 2, y = top - u * 60, s = Math.round(3 + u * 9);
      ctx.fillStyle = `rgba(${110 - 40 * dark},${105 - 40 * dark},${100 - 40 * dark},${(1 - u) * 0.55})`; ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    }
  }
}
export function drawHaze(ctx, city, W, H) {
  const p = city.pollution || 0;
  if (p < 0.05) return;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(120,96,60,${0.22 * p})`); g.addColorStop(1, `rgba(120,96,60,${0.05 * p})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
