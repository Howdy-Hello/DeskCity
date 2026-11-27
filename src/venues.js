// Restaurants, cafes and pubs: finding a table, ordering, cooking, serving, eating and drinking.
//
// A customer sits down and waits for a waiter, who comes over and writes the order on a pad. The
// order goes to the kitchen, where a chef cooks it (flames on the grill); the plate waits on the
// pass under the heat lamp until a waiter carries it over. Eating takes 25-40 minutes; about a
// third leave some and take it home in a bag (it goes in the fridge). They pay at the till on the
// way out. At the pub, the bartender serves the bar stools straight over the counter (shaking or
// pouring each drink) and walks drinks out to the tables; people drink, chat, and order another
// round, 2 to 5 of them, before heading home.
// Nobody waits forever: with no waiter on, people order at the counter; with no chef, the food is
// slower; with nobody to carry it, they fetch it themselves.
import { ROOMS } from './furniture.js';
import { dice } from './routine.js';

const MIN = 60e3;
const SEAT = { food: 'dine', bar: 'drink' };
const COOK = { meal: [7, 13], drink: [1, 2] }; // minutes to make
const TOP = { dinetable: 7, longtable: 7, pubtable: 9, barcounter: 10, cafecounter: 8 }; // table-top height

const venueOf = (r) => ROOMS[r.kind]?.venue;
export const onShift = (b, role, everyone) => everyone.filter((q) => q.b === b && q.plan[0]?.t === 'staff' && q.plan[0].role === role && q.plan[0].here);

// A table (or bar stool) somewhere open: the household's table if someone's already at one, else the
// nearest free table with room for the party, else any free seat. Returns { b, spot, kind } or null.
export function findSeat(city, p, kind, hour, party, taken, everyone) {
  const mine = everyone.map((q) => q !== p && q.hh === p.hh && q.plan.find((s) => s.t === 'meal' && s.kind === kind)).find(Boolean);
  if (mine) { const free = mine.b.spots(SEAT[kind]).filter((s) => s.item === mine.spot.item && !taken(p, s)); if (free.length) return { b: mine.b, spot: free[0], kind }; }
  let best = null;
  for (const b of city.lots) {
    if (!b?.ready() || b.demolish || b.alarm) continue;
    const open = b.L.rooms.filter((r) => venueOf(r) === kind && b.isOpen(r, hour)).map((r) => r.id);
    if (!open.length) continue;
    const seats = b.spots(SEAT[kind]).filter((s) => open.includes(s.room) && !taken(p, s));
    const byTable = new Map();
    for (const s of seats) (byTable.get(s.item) ?? byTable.set(s.item, []).get(s.item)).push(s);
    for (const list of byTable.values()) {
      const fits = list.length >= Math.min(party, kind === 'bar' ? 1 : party), d = Math.abs(b.x0 + list[0].x - p.x) + (fits ? 0 : 5000);
      if (!best || d < best.d) best = { b, spot: list[p.seed % list.length], kind, d };
    }
  }
  return best;
}

function order(b, p, s, w) {
  b.orders = b.orders.filter((o) => o.p !== p.id);
  b.orders.push({ p: p.id, item: s.kind === 'bar' ? 'drink' : 'meal', state: 'waiting', at: w.now, readyAt: 0, server: null, seat: s.spot });
}
export function leaveVenue(p, city) { for (const b of city.lots) if (b?.orders.length) b.orders = b.orders.filter((o) => o.p !== p.id); }

// Customer: sit, order, wait, eat or drink (another round at the pub), then go and pay.
// Returns true when they're done here.
export function mealStep(p, s, w) {
  const b = s.b;
  if (!s.sat) {
    s.sat = true; s.rounds = 0; s.maxRounds = s.kind === 'bar' ? 2 + Math.floor(dice(p.seed, w.day, 11)() * 4) : 1;
    p.spot = s.spot; p.dir = s.spot.dir; p.hip = { x: p.x, y: p.y - s.spot.hip };
    order(b, p, s, w);
  }
  const o = b.orders.find((x) => x.p === p.id);
  const chatty = w.everyone.some((q) => q !== p && q.spot?.item === s.spot.item);
  if (!o) return true;
  if (o.state !== 'served') { p.anim = chatty ? 'talkSit' : 'sit'; return false; }
  if (!s.until) s.until = w.now + (s.kind === 'bar' ? 18 + Math.random() * 20 : 25 + Math.random() * 15) * MIN;
  p.anim = s.kind === 'bar' ? (chatty && Math.floor(w.t / 6 + p.seed) % 3 === 0 ? 'talkSit' : 'drink') : 'eat';
  if (w.now < s.until) return false;
  s.until = 0;
  if (s.kind === 'bar' && ++s.rounds < s.maxRounds) { order(b, p, s, w); p.drinks = (p.drinks || 0) + 1; return false; } // another round
  b.orders = b.orders.filter((x) => x !== o);
  if (s.kind === 'food' && !(b.dirty ||= []).includes(s.spot.item)) b.dirty.push(s.spot.item); // plates left for the waiter to clear
  if (s.kind === 'food' && Math.random() < 0.33) p.bag = true; // leftovers, boxed up to take home
  if (s.kind === 'bar') p.drinks = (p.drinks || 0) + 1;
  p.hip = null; p.spot = null;
  return true;
}

// Things that happen with time, whoever's around: the kitchen finishes cooking, and nobody's left
// waiting for ever when there's no one on to serve them.
export function tickVenues(city, w) {
  for (const b of city.lots) {
    if (!b?.orders.length) continue;
    const chefs = onShift(b, 'chef', w.everyone).length, servers = onShift(b, 'waiter', w.everyone).length + onShift(b, 'bartender', w.everyone).length;
    b.orders = b.orders.filter((o) => w.everyone.some((q) => q.id === o.p && q.plan.some((s) => s.t === 'meal' && s.b === b)));
    for (const o of b.orders) {
      const [lo, hi] = COOK[o.item], mins = lo + ((o.p * 7) % 10) / 10 * (hi - lo);
      if (o.state === 'waiting' && (!servers || o.item === 'meal' ? w.now - o.at > (servers ? 4 : 1.5) * MIN : false)) o.state = 'ordered'; // order at the counter
      if (o.state === 'ordered' && !o.readyAt && (!chefs && o.item === 'meal' || !servers && o.item === 'drink') && w.now - o.at > MIN) o.readyAt = w.now + mins * 1.5 * MIN;
      if (o.state === 'ordered' && o.readyAt && w.now >= o.readyAt) { o.state = 'ready'; o.readyTime = w.now; }
      if (o.state === 'ready' && !o.server && (!servers || w.now - o.readyTime > 6 * MIN)) o.state = 'served'; // fetched it themselves
    }
  }
}

// ---------- staff at work ----------
// Everyone at work has a post (behind the till, at the grill, at their desk...) and a handful of
// small chores that fill the quiet moments: a cashier restocks shelves, sweeps, straightens the
// produce, counts the till; a waiter wipes tables, polishes cutlery, clears plates, checks on diners;
// a chef chops, gets things from the fridge, washes up, tastes; a bartender polishes glasses, wipes
// the bar, restocks the back shelf, chats to the regulars; a teacher teaches, writes on the board,
// helps a child at their desk, reads to the class, and marks at their desk when the room's empty; a
// doctor sees patients on the exam bed and does ward rounds; nurses work the desk and check drips;
// police work their desks, the files and the coffee machine; firefighters watch TV, eat, polish the
// engine and check their kit (and sleep in the bunks on night shift); factory workers run their
// machines, carry crates and check the line; a security guard watches the cameras, greets residents
// and walks the lobby. Something that needs doing (a customer at the till, an order up, a patient
// on the bed) comes first. Everything here runs in real seconds. Staff at a counter stand behind it.
//
// A task: walk to x (on floor f, if not this one), then do anim (or a list of anims in turn, beat
// seconds each) there for dur seconds. spot: take that spot (sit, stand behind its counter); tool:
// in hand while working; carry: in hand while walking there; face/dir: which way to look; then: run
// when done; next: the task after this one; valid: give up if this turns false.
const rand = (list) => list[Math.floor(Math.random() * list.length)];
const between = (a, b) => a + Math.random() * (b - a);
function runTask(p, s, t, dt, w, h) {
  const b = p.b;
  if (t.valid && !t.valid()) return true;
  if (t.f !== undefined && t.f !== p.f) { p.spot = null; p.hip = null; p.plan.unshift(...h.route({ b, f: p.f, x: p.x }, b, t.f, t.x)); return false; }
  if (!t.t0) {
    if (!h.walk(p, t.x, dt, w)) { p.tool = t.carry || null; p.spot = null; p.hip = null; return false; }
    t.t0 = w.t;
    if (t.spot) { p.spot = t.spot; p.hip = t.spot.hip ? { x: p.x, y: p.y - t.spot.hip } : null; }
  }
  if (t.face !== undefined) p.dir = Math.sign(t.face - p.x) || p.dir;
  else if (t.dir) p.dir = t.dir;
  const anims = [].concat(t.anim || 'stand');
  p.anim = anims[Math.floor((w.t - t.t0) / (t.beat || 1.6)) % anims.length];
  p.tool = t.tool || null;
  if (w.t - t.t0 < t.dur) return false;
  p.hip = null; if (!t.keep) p.spot = null;
  if (p.life && anims.some((a) => a !== 'stand')) for (const a of new Set(anims)) p.life.done[a] = (p.life.done[a] || 0) + 1; // today's work, for the passport
  t.then?.();
  return true;
}
const itemsIn = (b, kinds, room) => b.L.items.filter((it) => kinds.includes(it.kind) && (room == null || it.room === room));
const mid = (b, it) => b.x0 + it.x + Math.round(it.w / 2);
const someoneAt = (w, p, spot) => w.everyone.some((q) => q !== p && q.spot === spot);
const roomOf = (b, s) => b.L.rooms[s.room];

// At your post (behind the counter, at the machine, in your chair).
const atPost = (b, s, anim, dur, extra = {}) => ({ x: b.x0 + s.spot.x, spot: s.spot, dir: s.spot.dir, anim, dur, keep: true, ...extra });

// Serving: an order to take, a plate or a drink to carry over, a bill at the till, a table to clear.
function serving(p, s, b, w, bar) {
  const mine = (o) => (bar ? o.item === 'drink' : o.item === 'meal');
  const seatX = (o) => b.x0 + o.seat.x + o.seat.dir * 4;
  const claim = (o) => { o.server = p.id; return () => b.orders.includes(o); };
  if (bar) { // the bar: stool orders go straight to the bartender, who makes every drink
    for (const o of b.orders) if (o.state === 'waiting' && o.seat.item === s.spot.item) o.state = 'ordered';
    const make = b.orders.find((o) => o.item === 'drink' && o.state === 'ordered' && !o.server);
    if (make) {
      const valid = claim(make), style = Math.random() < 0.4 ? 'shake' : 'pour';
      const atBar = make.seat.item === s.spot.item;
      return atPost(b, s, style === 'shake' ? ['shake', 'shake', 'pour'] : ['pour', 'pour', 'place'], 2.6, { tool: 'glass', valid, beat: 0.9,
        then: () => { make.state = 'ready'; make.readyTime = w.now; make.server = null; },
        next: atBar ? atPost(b, s, 'place', 0.7, { tool: 'glass', valid, face: b.x0 + make.seat.x, then: () => { make.state = 'served'; } }) : null });
    }
  }
  const ready = b.orders.find((o) => mine(o) && o.state === 'ready' && !o.server && !(bar && o.seat.item === s.spot.item));
  if (ready) {
    const valid = claim(ready), pass = itemsIn(b, ['pass', 'barcounter', 'cafecounter'])[0], tool = ready.item === 'drink' ? 'glass' : 'plate';
    const deliver = { x: seatX(ready), face: b.x0 + ready.seat.x, anim: 'place', dur: 0.6, carry: tool, tool, valid, then: () => { ready.state = 'served'; } };
    return pass && !bar ? { x: mid(b, pass), anim: 'reach', dur: 0.5, dir: 1, valid, next: deliver } : { ...atPost(b, s, 'reach', 0.4), keep: false, valid, next: deliver };
  }
  const take = b.orders.find((o) => mine(o) && o.state === 'waiting' && !o.server && w.now - o.at > 0.3 * MIN);
  if (take) { const valid = claim(take); return { x: seatX(take), face: b.x0 + take.seat.x, anim: ['write', 'write', 'talk'], beat: 0.7, dur: 1.8, tool: 'pad', valid, then: () => { take.state = 'ordered'; take.server = null; } }; }
  // Someone waiting to pay at the till: go and ring it up.
  for (const till of b.spots('servetill')) {
    const payer = w.everyone.find((q) => q.b === b && (q.spot?.item === till.item && q.spot.act === 'pay' || (q.plan[0]?.t === 'queue' && q.plan[0].spot.item === till.item && Math.abs(q.x - b.x0 - till.x) < 12)));
    if (payer && !someoneAt(w, p, till)) return { x: b.x0 + till.x, spot: till, dir: till.dir, anim: ['scan', 'pay'], beat: 1, dur: 2 };
  }
  // A table people have just left: clear the plates, then wipe it.
  const dirty = !bar && b.dirty?.find((it) => !w.everyone.some((q) => q.spot?.item === it));
  if (dirty) {
    b.dirty = b.dirty.filter((x) => x !== dirty);
    const pass = itemsIn(b, ['pass'])[0];
    return { x: mid(b, dirty), face: mid(b, dirty), anim: 'reach', dur: 0.8, next: { x: mid(b, dirty) + 2, anim: 'wipe', tool: 'cloth', dur: 2.5,
      next: pass ? { x: mid(b, pass), anim: 'place', dir: 1, carry: 'plate', dur: 0.6 } : null } };
  }
  return null;
}

const ROLES = {
  cashier: {
    urgent(p, s, b, w) { // someone at the till, or next in line: back behind it and scan
      const pay = b.spots('pay').find((sp) => sp.item === s.spot.item);
      const waiting = pay && w.everyone.some((q) => q !== p && (q.spot === pay || (q.plan[0]?.t === 'queue' && q.plan[0].spot === pay)));
      return waiting && atPost(b, s, ['scan', 'scan', 'count'], 1.5, { beat: 0.75 });
    },
    next(p, s, b, w) {
      const room = s.spot.room, k = Math.random();
      if (k < 0.45) return atPost(b, s, ['stand', 'count', 'stand', 'attend'], between(4, 8));
      if (k < 0.7) { const shelf = rand(itemsIn(b, ['shelves', 'pharmacy', 'fridgecase'], room)); if (shelf) return { x: mid(b, shelf) - 4, dir: 1, carry: 'box', tool: 'box', anim: ['reachHigh', 'place', 'crouch', 'place'], dur: between(5, 8) }; }
      if (k < 0.85) { const r = roomOf(b, s.spot); return { x: b.x0 + r.x + 6 + Math.random() * (r.w - 12), anim: 'sweep', tool: 'broom', carry: 'broom', dur: between(4, 7) }; }
      const tidy = rand(itemsIn(b, ['produce', 'baskets'], room)); if (tidy) return { x: mid(b, tidy) - 3, dir: 1, anim: ['reach', 'place'], dur: 3 };
      return atPost(b, s, 'attend', 3);
    },
  },
  waiter: {
    urgent: (p, s, b, w) => serving(p, s, b, w, false),
    next(p, s, b, w) {
      const k = Math.random(), tables = itemsIn(b, ['dinetable', 'longtable']), free = tables.filter((it) => !w.everyone.some((q) => q.spot?.item === it));
      const diner = w.everyone.find((q) => q.b === b && q.plan[0]?.t === 'meal' && b.orders.some((o) => o.p === q.id && o.state === 'served'));
      if (k < 0.3) return atPost(b, s, ['attend', 'stand', 'attend', 'look'], between(4, 7), { keep: false });
      if (k < 0.55 && free.length) { const t = rand(free); return { x: mid(b, t), anim: 'wipe', tool: 'cloth', dur: between(2.5, 4) }; }
      if (k < 0.75 && diner) return { x: diner.x + diner.dir * 7, face: diner.x, anim: ['attend', 'talk'], beat: 1.2, dur: 2.5 }; // "is everything all right?"
      return atPost(b, s, 'polish', between(3, 5), { tool: 'cloth', keep: false }); // polishing cutlery at the pass
    },
  },
  bartender: {
    urgent: (p, s, b, w) => serving(p, s, b, w, true),
    next(p, s, b, w) {
      const k = Math.random(), regular = w.everyone.find((q) => q.spot?.item === s.spot.item && q.spot.act === 'drink');
      if (k < 0.3) return atPost(b, s, 'polish', between(4, 7), { tool: 'glass' });
      if (k < 0.5) return atPost(b, s, 'wipe', between(3, 5), { tool: 'cloth' });
      if (k < 0.65) return { x: b.x0 + s.spot.item.x + 27, dir: 1, anim: ['reachHigh', 'place'], dur: 3 }; // restocking the back shelf
      if (regular) return atPost(b, s, ['talk', 'attend', 'talk'], between(4, 7), { face: regular.x });
      return atPost(b, s, ['attend', 'stand'], between(3, 6));
    },
  },
  chef: {
    urgent(p, s, b, w) { // orders on: get cooking
      const todo = b.orders.filter((o) => o.item === 'meal' && o.state === 'ordered');
      if (!todo.length) return null;
      for (const o of todo) if (!o.readyAt) { const [lo, hi] = COOK.meal; o.readyAt = w.now + (lo + Math.random() * (hi - lo)) * MIN; }
      const cafe = s.spot.item.kind === 'cafecounter';
      if (cafe) return atPost(b, s, ['pour', 'pour', 'place'], 3, { tool: 'glass', beat: 1 });
      if (s.spot.item.kind === 'grill') return atPost(b, s, ['cook', 'cook', 'toss'], 3, { beat: 1 });
      return Math.random() < 0.7 ? atPost(b, s, 'chop', 3) : (() => { const f = itemsIn(b, ['fridge'], s.spot.room)[0]; return f ? { x: b.x0 + f.x + 4, spot: b.spots('fridge').find((sp) => sp.item === f) || null, dir: 1, anim: 'fridge', dur: 1.5 } : atPost(b, s, 'chop', 3); })();
    },
    next(p, s, b, w) {
      const k = Math.random(), room = s.spot.room;
      if (s.spot.item.kind === 'cafecounter') return k < 0.4 ? atPost(b, s, 'polish', between(3, 5), { tool: 'glass' }) : k < 0.7 ? atPost(b, s, 'wipe', 3, { tool: 'cloth' }) : atPost(b, s, ['pour', 'attend'], 4);
      if (k < 0.35) return atPost(b, s, s.spot.item.kind === 'grill' ? ['wipe', 'taste'] : 'chop', between(3, 6), { tool: s.spot.item.kind === 'grill' ? 'cloth' : null });
      const fridge = itemsIn(b, ['fridge'], room)[0], sink = b.spots('dishes').find((sp) => sp.room === room);
      if (k < 0.55 && fridge) return { x: b.x0 + fridge.x + 4, spot: b.spots('fridge').find((sp) => sp.item === fridge) || null, dir: 1, anim: 'fridge', dur: 2 };
      if (k < 0.8 && sink) return { x: b.x0 + sink.x, spot: sink, dir: sink.dir, anim: 'dishes', dur: between(4, 7) };
      return atPost(b, s, ['attend', 'taste'], 3);
    },
  },
  teacher: {
    urgent(p, s, b, w) { // break: watch the playground from its doorway
      const yard = b.L.rooms.find((r) => r.kind === 'playground'), h1 = w.hour;
      const recess = yard && ((h1 >= 10 && h1 < 10.33) || (h1 >= 12.25 && h1 < 12.9)) && roomOf(b, s.spot).f === 0;
      return recess && { x: b.x0 + 4, dir: -1, anim: ['watch', 'look'], beat: 3, dur: 6 };
    },
    next(p, s, b, w) {
      const room = s.spot.room, kids = w.everyone.filter((q) => q.kid && q.spot?.room === room && q.spot.act === 'learn' && q.b === b);
      const board = b.L.details.find((d) => d.kind === 'chalkboard' && d.f === roomOf(b, s.spot).f && d.x >= roomOf(b, s.spot).x && d.x < roomOf(b, s.spot).x + roomOf(b, s.spot).w);
      const bx = board ? b.x0 + board.x + 9 : b.x0 + s.spot.x, classX = kids.length ? kids.reduce((a, q) => a + q.x, 0) / kids.length : bx + 20;
      if (!kids.length) { // nobody in: marking at the desk, or tidying the shelves
        const seat = b.spots('mark').find((sp) => sp.item === s.spot.item);
        if (seat && Math.random() < 0.75) return { x: b.x0 + seat.x, spot: seat, dir: seat.dir, anim: ['mark', 'mark', 'read'], tool: 'pad', dur: between(8, 14) };
        const shelf = itemsIn(b, ['bookshelf'], room)[0];
        return shelf ? { x: mid(b, shelf) - 4, dir: 1, anim: ['reachHigh', 'place'], dur: 3 } : { x: bx, face: bx + 20, anim: 'writeBoard', tool: 'chalk', dur: 4 };
      }
      const k = Math.random();
      if (k < 0.35) return { x: bx, face: classX, anim: ['teach', 'teach', 'talk'], beat: 2, dur: between(5, 8) };
      if (k < 0.6) return { x: bx - 2, face: bx + 6, anim: 'writeBoard', tool: 'chalk', dur: between(4, 6) };
      if (k < 0.85) { const kid = rand(kids); return { x: kid.x + kid.dir * 6, face: kid.x, anim: ['helpKid', 'talk'], beat: 1.5, dur: between(3, 5) }; }
      return { x: bx + 4, face: classX, anim: 'readAloud', tool: 'book', dur: between(5, 8) };
    },
  },
  doctor: {
    urgent(p, s, b, w) { // a patient on the exam bed
      const exam = b.spots('exam').find((sp) => sp.item === s.spot.item);
      return exam && someoneAt(w, p, exam) && atPost(b, s, ['examine', 'examine', 'write', 'talk'], 3, { tool: 'pad', beat: 1.5 });
    },
    next(p, s, b, w) {
      const k = Math.random(), patients = w.everyone.filter((q) => q.b === b && q.spot?.act === 'patient');
      if (patients.length && k < 0.6) { const q = rand(patients); return { f: q.f, x: q.x + 9, face: q.x, anim: ['examine', 'write', 'talk'], beat: 1.8, tool: 'pad', dur: between(6, 10) }; } // ward rounds
      const desk = itemsIn(b, ['nursedesk'])[0];
      if (desk && k < 0.8) return { f: desk.f, x: b.x0 + desk.x - 3, dir: 1, anim: ['write', 'talk', 'write'], tool: 'pad', dur: between(4, 7) };
      const bed = rand(itemsIn(b, ['hospbed']));
      return bed ? { f: bed.f, x: mid(b, bed), anim: ['look', 'write'], tool: 'pad', dur: 3 } : atPost(b, s, 'write', 3, { tool: 'pad', keep: false });
    },
  },
  nurse: {
    next(p, s, b, w) {
      const k = Math.random(), f = roomOf(b, s.spot).f;
      const beds = itemsIn(b, ['hospbed']).filter((it) => it.f === f), patients = w.everyone.filter((q) => q.b === b && q.f === f && q.spot?.act === 'patient');
      if (k < 0.4) return atPost(b, s, ['deskwork', 'write', 'deskwork'], between(5, 9), { tool: s.spot.item.kind === 'medcart' ? 'pad' : null });
      if (beds.length && k < 0.65) { const bed = rand(beds); return { x: b.x0 + bed.x - 2, dir: -1, anim: ['reachHigh', 'adjust'], dur: 3 }; } // checking the drip
      if (patients.length && k < 0.85) { const q = rand(patients); return { x: q.x + 9, face: q.x, anim: ['talk', 'examine', 'write'], beat: 1.5, tool: 'pad', dur: 5 }; }
      const waiting = w.everyone.find((q) => q.b === b && q.f === f && q.spot?.act === 'waitroom');
      if (waiting) return { x: waiting.x + 7, face: waiting.x, anim: ['talk', 'write'], tool: 'pad', dur: 3 };
      const cart = itemsIn(b, ['medcart']).find((it) => it.f === f);
      return cart ? { x: mid(b, cart) + 4, dir: -1, anim: ['reach', 'place'], dur: 3 } : atPost(b, s, 'attend', 3);
    },
  },
  officer: {
    next(p, s, b, w) {
      const k = Math.random(), f = roomOf(b, s.spot).f;
      if (k < 0.55) return atPost(b, s, s.spot.behind ? ['stand', 'write', 'attend'] : ['type', 'type', 'call'], between(6, 12), { tool: s.spot.behind ? 'pad' : null });
      const files = itemsIn(b, ['filing']).find((it) => it.f === f), coffee = itemsIn(b, ['coffee']).find((it) => it.f === f);
      if (k < 0.75 && files) return { x: b.x0 + files.x - 2, dir: 1, anim: ['reach', 'read'], tool: 'pad', dur: 4 };
      if (k < 0.9 && coffee) return { x: b.x0 + coffee.x + 3, spot: b.spots('coffee').find((sp) => sp.item === coffee) || null, dir: 1, anim: 'coffee', dur: 4 };
      const window_ = roomOf(b, s.spot); return { x: b.x0 + window_.x + window_.w / 2, dir: 1, anim: ['look', 'watch'], dur: 3 };
    },
  },
  firefighter: {
    next(p, s, b, w) {
      const k = Math.random(), h1 = w.hour;
      if (h1 >= 23 || h1 < 6.5) { const bunk = b.spots('nap').find((sp) => !someoneAt(w, p, sp)); if (bunk) return { f: bunk.f, x: b.x0 + bunk.x, spot: bunk, dir: 1, anim: 'sleep', dur: 60 }; } // night shift: sleep when you can
      if (k < 0.45) return atPost(b, s, s.spot.anim || 'tv', between(8, 15));
      const engine = w.city.fleet?.fire, bay = b.L.bay;
      if (k < 0.65 && bay && engine?.state === 'home') return { f: 0, x: b.x0 + bay.x + 10 + Math.random() * (bay.w - 20), dir: Math.random() < 0.5 ? 1 : -1, anim: ['wipe', 'polish'], tool: 'cloth', dur: between(5, 8) }; // polishing the engine
      const rack = itemsIn(b, ['gearrack'])[0];
      if (k < 0.8 && rack) return { f: rack.f, x: mid(b, rack), dir: 1, anim: ['reachHigh', 'adjust'], dur: 4 };
      const coffee = itemsIn(b, ['coffee'])[0];
      return k < 0.9 && coffee ? { f: coffee.f, x: b.x0 + coffee.x + 3, spot: b.spots('coffee').find((sp) => sp.item === coffee) || null, dir: 1, anim: 'coffee', dur: 4 } : { x: b.x0 + s.spot.x + 8, anim: 'stretchFloor', dur: 4 };
    },
  },
  worker: {
    next(p, s, b, w) {
      const k = Math.random(), kind = s.spot.item.kind;
      if (k < 0.6) return atPost(b, s, kind === 'press' ? ['operate', 'operate', 'look'] : kind === 'workbench' ? ['screwStand', 'hammerStand', 'screwStand'] : ['reach', 'place'], between(6, 10),
        { tool: kind === 'workbench' ? rand(['screwdriver', 'hammer']) : kind === 'conveyor' ? 'box' : null, beat: kind === 'conveyor' ? 1 : 2 });
      const crates = rand(itemsIn(b, ['crates'])), line = itemsIn(b, ['conveyor'])[0];
      if (k < 0.85 && crates && line) return { x: mid(b, crates), anim: ['crouch', 'rise'], beat: 0.5, dur: 1, next: { x: mid(b, line), carry: 'box', anim: 'place', dur: 0.8, dir: 1 } }; // fetch a crate for the line
      return { x: line ? mid(b, line) + 10 : b.x0 + s.spot.x, dir: -1, anim: ['look', 'write'], tool: 'pad', dur: 4 }; // checking the line
    },
  },
  security: {
    urgent(p, s, b, w) { // someone coming in or going out: a nod and a wave
      const door = b.doorX();
      const q = w.everyone.find((q) => q !== p && q.b === b && q.f === 0 && q.v > 0 && Math.abs(q.x - door) < 10 && (q.greeted || 0) < w.t - 20);
      if (!q) return null;
      q.greeted = w.t;
      return { x: p.x, face: q.x, anim: ['wave', 'nod'], beat: 0.7, dur: 1.4 };
    },
    next(p, s, b, w) {
      const k = Math.random(), lobby = roomOf(b, s.spot);
      if (k < 0.6) return atPost(b, s, ['monitor', 'monitor', 'deskwork', 'monitor'], between(8, 14), { beat: 3 });
      if (k < 0.8) return { x: b.doorX() + 4, dir: -1, anim: ['look', 'attend'], beat: 2, dur: 4 }; // a look out of the front door
      const lift = b.L.elevator ? b.elevX() - 6 : b.x0 + lobby.x + lobby.w - 6, box = itemsIn(b, ['parcelshelf'], lobby.id)[0];
      return k < 0.9 || !box ? { x: lift, dir: 1, anim: ['look', 'attend'], beat: 2, dur: 3 } : { x: mid(b, box), dir: 1, anim: ['reach', 'place'], dur: 3 }; // tidying the parcels
    },
  },
  post: { next: (p, s, b) => atPost(b, s, s.spot.anim || 'type', 8) },
};

export function staffStep(p, s, dt, w, h) {
  const b = p.b;
  if (!b) return;
  s.here = true;
  const R = ROLES[s.role] || ROLES.post;
  if (!s.task?.urgent) { const u = R.urgent?.(p, s, b, w); if (u) s.task = { ...u, urgent: true }; }
  if (!s.task) s.task = R.next(p, s, b, w) || atPost(b, s, 'stand', 3);
  if (s.task.spot && !s.task.t0 && w.everyone.some((q) => q !== p && q.spot === s.task.spot)) // (shift change: someone's still at the post) stand alongside
    s.task = { ...s.task, spot: null, x: s.task.x - (s.task.dir || 1) * 6 };
  if (runTask(p, s, s.task, dt, w, h)) s.task = s.task.next ? { ...s.task.next, urgent: s.task.urgent } : null;
}

// Plates on the tables, drinks on the bar, and plates waiting on the pass.
export function drawVenue(ctx, b, w) {
  const px = (x, y, c, ww = 1, hh = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), ww, hh); };
  for (const it of b.dirty || []) { const y = b.feetY(it.f) - (TOP[it.kind] ?? 7) - 1, x = b.x0 + it.x + Math.round(it.w / 2) - 2; px(x, y, '#e8e8e8', 3, 1); px(x + 1, y - 1, '#b08060'); px(x + 3, y, '#d0d0d0', 2, 1); } // empty plates left behind
  if (!b.orders.length) return;
  const pass = b.L.items.filter((it) => it.kind === 'pass' || it.kind === 'barcounter');
  let k = 0;
  for (const o of b.orders) {
    const it = o.seat.item, y = b.feetY(it.f);
    if (o.state === 'served') {
      const x = b.x0 + o.seat.x + o.seat.dir * 3 - (o.seat.dir < 0 ? 2 : 0), top = y - (TOP[it.kind] ?? 7) - 1;
      if (o.item === 'meal') { px(x, top, '#ffffff', 3, 1); px(x + 1, top - 1, ['#e67e22', '#27ae60', '#c0392b', '#f1c40f'][o.p % 4]); }
      else { px(x, top - 2, '#d4ac0d', 1, 3); px(x, top - 3, '#fdfefe'); }
    } else if (o.state === 'ready' && pass.length) {
      const at = pass[0], top = b.feetY(at.f) - (at.kind === 'pass' ? 10 : 11);
      if (o.item === 'meal') { px(b.x0 + at.x + 1 + (k % 4) * 3, top, '#ffffff', 2, 1); px(b.x0 + at.x + 2 + (k % 4) * 3, top - 1, '#e67e22'); }
      else { px(b.x0 + at.x + 12 + (k % 3) * 2, top, '#d4ac0d', 1, 2); }
      k++;
    }
  }
}
