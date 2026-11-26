// The city: lots along the bottom of the screen, who lives and works where, how it grows, saving.
import { Building, TYPES, LOT_W } from './buildings.js';
import { makePerson } from './people.js';
import { Truck, Mover } from './delivery.js';
import { FLATPACK } from './furniture.js';
import { makeCar, parkHome, updateCars, giveCars, nearestLot } from './cars.js';
import { updateIncidents } from './incidents.js';
import { tickVenues } from './venues.js';
import { shiftsFor } from './routine.js';
import { saveRels, loadRels } from './social.js';

const HOUR = 3600e3;
const SAVE_KEY = 'deskcity-save-v1';

// The real estate company. It builds what it expects to sell or rent, and earns from it:
// cottages and houses are sold, flats, office desks and shops are rented out by the day.
export const REALTY = {
  name: 'SUNRISE HOMES',
  startCash: 2.5e6,
  credit: 15e6,              // what the bank will lend it
  hunterEvery: 1.5 * HOUR,   // a household starts looking for a home in town about this often
  maxHunters: 8,
  cost: { home: [120e3, 300e3, 900e3, 2.4e6, 3.6e6], office: [200e3, 700e3, 2.8e6], shop: [150e3, 500e3],
    restaurant: [320e3], bar: [260e3], school: [900e3], fire: [750e3], police: [700e3], hospital: [1.6e6], factory: [1.4e6] },
  saleMarkup: 1.35,          // cottages, houses and condo flats sell for (their share of) cost x 1.35
  lendOnValue: 0.6,          // the bank also lends up to 60% of what its buildings cost
  public: new Set(['school', 'fire', 'police', 'hospital']), // paid for by the town, not the company
  rent: { home: 300, condo: 80, office: 120, shop: 1500, restaurant: 1200, bar: 900, factory: 2500 }, // per occupied flat / desk / shop, per day (condo: the service charge on a flat that's been sold)
};

// Households. Roughly: 28% live alone, 27% are couples, 33% are families (2 parents, or now and then
// one, with 1 or 2 children), 12% share as roommates (2 or 3). A couple shares a double bed; everyone
// else needs a bed of their own, so a family needs a home with a child's room.
export function newHousehold(r = Math.random) {
  const k = r();
  if (k < 0.28) return { kind: 'single', adults: 1, kids: 0 };
  if (k < 0.55) return { kind: 'couple', adults: 2, kids: 0 };
  if (k < 0.88) return { kind: 'family', adults: r() < 0.15 ? 1 : 2, kids: r() < 0.6 ? 1 : 2 };
  return { kind: 'roommates', adults: r() < 0.7 ? 2 : 3, kids: 0 };
}
export const hhSize = (h) => h.adults + h.kids;
// Which bed each member gets in this home (indexes into its sleep spots; adults first, then the
// children), or null if it doesn't suit them.
export function assignBeds(b, unit, h) {
  const spots = b.allSpots('sleep', unit), items = [...new Set(spots.map((s) => s.item))];
  const bedsOf = (it) => spots.flatMap((s, i) => (s.item === it ? [i] : []));
  const doubles = items.filter((it) => bedsOf(it).length >= 2), singles = items.filter((it) => bedsOf(it).length === 1);
  const free = [...items], out = [];
  const take = (pref) => { const it = pref.find((i) => free.includes(i)); if (it) free.splice(free.indexOf(it), 1); return it; };
  if (h.kind === 'couple' || (h.kind === 'family' && h.adults === 2)) { const d = take(doubles); if (!d) return null; out.push(...bedsOf(d).slice(0, 2)); }
  else for (let k = 0; k < h.adults; k++) { const it = take(h.kind === 'roommates' ? [...singles, ...doubles] : [...doubles, ...singles]); if (it === undefined) return null; out.push(bedsOf(it)[0]); }
  for (let k = 0; k < h.kids; k++) { const it = take([...singles, ...doubles]); if (it === undefined) return null; out.push(bedsOf(it)[0]); }
  return out;
}

// Next time within opening hours [from, to) at or after t (tomorrow if it's too late today).
function daytime(t, from, to) {
  const d = new Date(t);
  if (d.getHours() >= to) { d.setDate(d.getDate() + 1); d.setHours(from, 0, 0, 0); return +d + Math.random() * 2 * HOUR; }
  if (d.getHours() < from) { d.setHours(from, 0, 0, 0); return +d + Math.random() * 2 * HOUR; }
  return +d;
}
const deliverBy = (now) => daytime(now + (10 + Math.random() * 20) * 60e3, 7, 22); // furniture truck
const moveBy = (now) => daytime(now + (0.5 + Math.random() * 1.5) * HOUR, 8, 19);  // moving car after signing

// How the town grows. Tweak these to taste.
export const GROWTH = {
  buildPerFloor: 0.5 * HOUR, // construction time per storey (one building site at a time)
  homeTier: (pop) => (pop < 6 ? 0 : pop < 15 ? 1 : pop < 34 ? 2 : pop < 70 ? 3 : 4), // cottage, house, apartments, condo tower, residential tower
  officeTier: (pop) => (pop < 8 ? 0 : pop < 26 ? 1 : 2),                // small office, office, office tower
  shopTier: (pop) => (pop < 25 ? 0 : 1),                                // corner store, supermarket
  shopCount: (pop) => (pop < 45 ? 1 : 2),
  // When the town gets each of the rest (by how many people live here), in this order of priority.
  // A factory only if the town is the kind that wants one, and jobs are short.
  civic: [['restaurant', 10], ['school', 12], ['fire', 16], ['bar', 14], ['hospital', 20], ['police', 22]],
  factory: { pop: 14, jobless: 3 },
};

const randInt = () => (Math.random() * 2 ** 31) | 0;

export class City {
  // The town is one long street. Each desktop (Space) shows the next screen-wide stretch of it,
  // `perScreen` plots at a time; a narrower screen just moves plots onto the next desktop.
  constructor(W, G, now, saved) {
    this.W = W; this.G = G; this.districts = 1;
    this.under = 40; // rows between the street and the bottom of the screen (room for car parks)
    this.perScreen = Math.max(3, Math.floor(W / LOT_W));
    this.n = this.perScreen;
    this.replace(saved, now);
  }
  width() { return this.districts * this.W; } // the whole street
  lotCenter(i) { // where plot i sits along the street
    const screen = Math.floor(i / this.perScreen), slot = i % this.perScreen;
    return screen * this.W + (this.W - this.perScreen * LOT_W) / 2 + LOT_W * (slot + 0.5);
  }

  // Start over from a saved town, or found a brand-new one when there is none.
  replace(saved, now) {
    this.lots = Array(this.n).fill(null);
    this.people = [];
    this.nextId = 1;
    this.orders = []; // furniture orders waiting for a truck: { b, lot, unit, items, due, truck }
    this.trucks = [];
    this.realty = { name: REALTY.name, cash: REALTY.startCash };
    this.hunters = []; // households looking for a home in town: { size }
    this.moves = [];   // households that have signed for a home: { id, b, unit, size, due, car }
    this.movers = [];  // their cars on the road
    this.vacant = [];
    this.nextMove = 1; this.lastDay = null;
    this.cars = []; this.nextCar = 1; // households' own cars
    this.fleet = { fire: null, police: null, ambulance: null }; // the emergency services' vehicles
    this.crimes = []; this.patients = [];
    this.rels = new Map(); this.convos = []; // who knows whom, and who's talking right now (social.js)
    this.pollution = 0; this.protests = 0; this.protest = null; this.factoryBan = 0;
    this.factoryMind = Math.random() < 0.6; // whether this town would ever build a factory
    if (saved) this.restore(saved, now); else this.found(now);
    this.place(this.W, this.G);
    for (const p of this.people) if (p.b === undefined) this.putHome(p);
    for (const c of this.cars) if (!c.park) parkHome(this, c);
    if (saved && !saved.cars) giveCars(this); // a town from before cars: about half the households have one
  }

  // The first desktop fills up first, from the middle of the screen outwards, then the next one.
  order() {
    const ps = this.perScreen, key = (i) => Math.floor(i / ps) * 1000 + Math.abs((i % ps) - (ps - 1) / 2);
    return [...this.lots.keys()].sort((a, b) => key(a) - key(b));
  }
  shops() { return this.lots.filter((b) => b?.ready() && !b.demolish && !b.alarm && b.L.rooms.some((r) => r.kind === 'store')); } // shops, and mini-marts under flats

  found(now) {
    const c = Math.floor((this.perScreen - 1) / 2);
    this.lots[c] = new Building('home', 0, randInt());
    this.lots[c + 1] = new Building('office', 0, randInt());
    this.lots[c - 1] = new Building('shop', 0, randInt());
    this.realty.cash -= REALTY.cost.home[0] + REALTY.cost.office[0] + REALTY.cost.shop[0];
    this.nextHunter = now + REALTY.hunterEvery;
    this.moves.push({ id: this.nextMove++, b: this.lots[c], unit: 0, size: 2, hh: { kind: 'couple', adults: 2, kids: 0 }, due: now, car: false }); // the first couple drives in
  }

  place(W, G, districts = this.districts) {
    // The street moved up or down (the Dock was resized): everything on it moves with it.
    const dG = this.G ? G - this.G : 0;
    if (dG) {
      for (const p of this.people) if (!p.b) { p.y += dG; if (p.hip) p.hip.y += dG; }
      for (const v of [...this.trucks.map((t) => t.v), ...this.movers.map((m) => m.v), ...this.cars.map((c) => c.v), ...Object.values(this.fleet).filter(Boolean).map((f) => f.v)]) {
        v.y += dG; for (const q of v.path) q.y += dG;
      }
      for (const t of this.trucks) t.driver.y += dG;
    }
    this.W = W; this.G = G;
    this.perScreen = Math.max(3, Math.floor(W / LOT_W));
    this.districts = Math.max(districts, Math.ceil(this.lots.length / this.perScreen)); // never lose plots
    this.n = this.perScreen * this.districts;
    while (this.lots.length < this.n) this.lots.push(null);
    const margin = (W - this.perScreen * LOT_W) / 2;
    let moved = false;
    this.lots.forEach((b, i) => {
      if (!b) return;
      const x0 = b.x0, g0 = b.G, screen = Math.floor(i / this.perScreen), slot = i % this.perScreen;
      b.place(screen * W + margin + LOT_W * (slot + 0.5), G);
      if (!g0 || (x0 === b.x0 && g0 === G)) return;
      moved = true;
      for (const p of this.people) if (p.b === b) { p.x += b.x0 - x0; p.y += G - g0; }
    });
    // Routes were planned for the old positions: plan again.
    if (moved) for (const p of this.people) if (!['air', 'climb', 'elev'].includes(p.surface)) { p.plan = []; p.wantKey = null; p.hip = null; }
  }

  // ---------- homes and jobs ----------
  slots(type, act) { // every bed / desk in finished buildings: { lot, unit, index }
    const out = [];
    this.lots.forEach((b, lot) => {
      if (b?.type !== type || !b.ready()) return;
      const count = new Map();
      for (const s of b.allSpots(act)) { // beds still in their boxes count too
        const key = act === 'sleep' ? s.unit : 0, k = count.get(key) || 0;
        count.set(key, k + 1);
        out.push({ lot, unit: s.unit, index: k });
      }
    });
    return out;
  }
  freeBed() {
    const taken = new Set(this.people.map((p) => `${p.home.lot}:${p.home.unit}:${p.home.bed}`));
    const s = this.slots('home', 'sleep').find((s) => !taken.has(`${s.lot}:${s.unit}:${s.index}`));
    return s && { lot: s.lot, unit: s.unit, bed: s.index };
  }
  // Every job in town: each work spot (desk, till, grill, bar, classroom, machine, station), once per shift.
  jobSlots() {
    const out = [];
    this.lots.forEach((b, lot) => {
      if (!b?.ready() || b.demolish) return;
      b.allSpots('work').forEach((s, desk) => { for (let shift = 0; shift < shiftsFor(s.role || 'office'); shift++) out.push({ lot, desk, shift }); });
    });
    return out;
  }
  // A free job, spreading people out: every workplace (and each of its shifts) gets someone before any
  // gets a second, so the shop has a cashier and the station a crew before the office fills up.
  freeDesk() {
    const taken = new Set(), staff = new Map();
    for (const p of this.people) if (p.job) {
      taken.add(`${p.job.lot}:${p.job.desk}:${p.job.shift || 0}`);
      const k = `${p.job.lot}:${p.job.shift || 0}`; staff.set(k, (staff.get(k) || 0) + 1);
    }
    let best = null, fewest = Infinity;
    for (const s of this.jobSlots()) {
      if (taken.has(`${s.lot}:${s.desk}:${s.shift}`)) continue;
      const n = staff.get(`${s.lot}:${s.shift}`) || 0;
      if (n < fewest) { best = s; fewest = n; }
    }
    return best;
  }

  // A household moves into a home: one person per bed it was given (adults first, then children).
  moveIn(lot, unit, h, beds) {
    const hh = this.nextId, out = [];
    beds.forEach((bed, i) => {
      const kid = i >= h.adults;
      const p = makePerson({ id: this.nextId++, seed: randInt() % 100000, jitter: (Math.random() - 0.5) * 0.6, home: { lot, unit, bed }, job: kid ? null : this.freeDesk(), hh, kid });
      this.people.push(p); out.push(p);
    });
    return out;
  }
  // ---------- furniture deliveries ----------
  // A household moving into an unfurnished home orders its flat-packs. The truck comes 10-30 minutes
  // later during delivery hours (7am-10pm), otherwise first thing the next morning.
  orderFurniture(b, unit, now) {
    if (!b || b.ordered.has(unit)) return;
    // Whatever the household didn't bring with them.
    const items = b.L.items.map((it, i) => [it, i]).filter(([it]) => it.flatpack && !it.ready && !it.coming && b.L.rooms[it.room].unit === unit).map(([, i]) => i);
    b.ordered.add(unit);
    if (!items.length) return;
    this.orders.push({ b, unit, items, due: deliverBy(now), truck: false });
  }
  updateDeliveries(w) {
    this.orders = this.orders.filter((o) => this.lots.includes(o.b)); // building replaced: order cancelled
    for (const o of this.orders) if (!o.truck && w.now >= o.due) { o.truck = true; this.trucks.push(new Truck(o, this)); }
    for (const t of this.trucks) t.update(w.dt);
    for (const t of this.trucks.filter((t) => t.done)) this.orders = this.orders.filter((o) => o !== t.order);
    this.trucks = this.trucks.filter((t) => !t.done && this.lots.includes(t.order.b));
  }

  putHome(p) {
    const b = this.lots[p.home.lot];
    Object.assign(p, { b, f: 0, x: b.doorX() + 6, y: b.feetY(0), surface: 'floor', plan: [], wantKey: null });
  }

  // ---------- growth ----------
  update(w) {
    const now = w.now;
    this.lots.forEach((b, i) => {
      if (b?.build && now >= b.build.end) b.build = null;
      if (b?.upgrade && now >= b.upgrade.end) this.finishUpgrade(i, now);
    });
    this.updateDeliveries(w);
    this.updateRealty(w);
    updateCars(this, w.dt);
    for (const p of this.people) if (!p.job && !p.kid) p.job = this.freeDesk();
    tickVenues(this, w);
    updateIncidents(this, w);
    this.lots.forEach((b, i) => { if (b?.demolish && now >= b.demolish.end) { this.lots[i] = null; this.place(this.W, this.G); } }); // pulled down: a pocket park now
    if (!this.lots.some((b) => b && (b.build || b.upgrade || b.demolish))) this.planGrowth(now);
  }

  // ---------- the real estate company and people moving in ----------
  updateRealty(w) {
    const now = w.now;
    if (now >= this.nextHunter) {
      this.nextHunter = now + REALTY.hunterEvery * (0.5 + Math.random());
      if (this.hunters.length < REALTY.maxHunters) this.hunters.push({ ...newHousehold(), since: now });
    }
    this.hunters = this.hunters.filter((h) => !h.since || now - h.since < 2 * 24 * HOUR); // nothing suitable after two days: they look elsewhere
    // Only a whole empty home is up for grabs, and only one that suits them (a bed each, a double for
    // a couple). A household signs for it and moves in a few hours later, by daylight.
    this.vacant = this.vacantUnits();
    for (const v of this.vacant) {
      const k = this.hunters.findIndex((h) => assignBeds(v.b, v.unit, h));
      if (k < 0) continue;
      const [h] = this.hunters.splice(k, 1);
      this.moves.push({ id: this.nextMove++, b: v.b, unit: v.unit, size: hhSize(h), hh: h, due: moveBy(now), car: false });
    }
    this.moves = this.moves.filter((m) => this.lots.includes(m.b));
    for (const m of this.moves) if (!m.car && now >= m.due && m.b.ready()) { m.car = true; this.movers.push(new Mover(m, this)); }
    for (const c of this.movers) c.update(w.dt, () => this.arrive(c, now), now, this);
    for (const c of this.movers) if (c.done) this.moves = this.moves.filter((m) => m !== c.move);
    for (const c of this.movers) if (c.done && c.keep && c.owner) { // their own car stays where they parked it
      const v = c.v, lot = nearestLot(this, v.x), car = makeCar(this, c.owner, c.kind, c.paint, v);
      car.park = { type: 'street', lot, dx: v.x - this.lotCenter(lot), dir: v.dir };
    }
    this.movers = this.movers.filter((c) => !c.done && this.lots.includes(c.move.b));
    if (w.day !== this.lastDay) { if (this.lastDay !== null) this.realty.cash += this.dailyRent(); this.lastDay = w.day; }
  }

  vacantUnits() { // finished homes with nobody living there and nobody moving in
    const out = [];
    this.lots.forEach((b, lot) => {
      if (b?.type !== 'home' || !b.ready() || b.upgrade || b.demolish) return; // nothing is let in a building about to be rebuilt
      const units = new Map();
      for (const s of b.allSpots('sleep')) units.set(s.unit, (units.get(s.unit) || 0) + 1);
      for (const [unit, beds] of units) {
        if (this.people.some((p) => p.home.lot === lot && p.home.unit === unit) || this.moves.some((m) => m.b === b && m.unit === unit)) continue;
        out.push({ b, lot, unit, beds });
      }
    });
    return out;
  }

  // The car has parked: the household gets out and puts their things on the kerb. They bring
  // some of their own furniture; whatever they don't have gets ordered for delivery.
  arrive(car, now) {
    const m = car.move, b = m.b, L = b.L, lot = this.lots.indexOf(b), v = car.v;
    const rooms = L.rooms.filter((r) => r.unit === m.unit), bedroom = rooms.find((r) => r.kind === 'bedroom') || rooms[0];
    if (!bedroom || b.demolish) { this.moves = this.moves.filter((x) => x !== m); this.hunters.push(m.hh || newHousehold()); return; } // the flat's gone (rebuilt meanwhile): back to house hunting
    const near = v.rear() - b.x0 - (v.dir > 0 ? 19 : -8); // stacked on the kerb behind the car, clear of its tailgate
    const kerb = (box) => b.boxes.push(b.placeBox({ ...box, mover: m.id, own: true, claimed: null }, true, 0, Math.floor(near / 11) * 11 + (v.dir > 0 ? 0 : 11), -v.dir));
    L.items.forEach((it, i) => {
      if (!it.flatpack || it.ready || L.rooms[it.room].unit !== m.unit || Math.random() > 0.55) return;
      it.coming = true;
      kerb({ item: i, size: FLATPACK[it.kind][0] });
    });
    for (let n = 0; n < 2 + m.size; n++) kerb({ item: null, room: bedroom.id, size: n % 2 ? 'm' : 's' }); // moving boxes
    const h = m.hh || { kind: m.size === 1 ? 'single' : 'couple', adults: Math.min(2, m.size), kids: Math.max(0, m.size - 2) };
    const beds = assignBeds(b, m.unit, h) || Array.from({ length: m.size }, (_, i) => i);
    this.moveIn(lot, m.unit, h, beds).forEach((p, i) => {
      Object.assign(p, { x: v.x + v.dir * (v.len / 2 - 12) - v.dir * i * 5, y: this.G, surface: 'ground', newcomer: true, dir: v.dir });
      if (i === 0) car.owner = p.id; // the car is theirs
    });
    if (TYPES.home[b.tier].units === 'whole') this.realty.cash += REALTY.cost.home[b.tier] * REALTY.saleMarkup; // sold!
    else if (TYPES.home[b.tier].sold) this.realty.cash += (REALTY.cost.home[b.tier] / new Set(b.allSpots('sleep').map((sp) => sp.unit)).size) * REALTY.saleMarkup; // a condo flat, sold
    this.orderFurniture(b, m.unit, now);
  }

  dailyRent() {
    let sum = 0;
    this.lots.forEach((b, lot) => {
      if (!b?.ready()) return;
      if (b.type === 'home' && TYPES.home[b.tier].units === 'floor') sum += (TYPES.home[b.tier].sold ? REALTY.rent.condo : REALTY.rent.home) * new Set(this.people.filter((p) => p.home.lot === lot).map((p) => p.home.unit)).size;
      if (b.type === 'office') sum += REALTY.rent.office * this.people.filter((p) => p.job?.lot === lot).length;
      if (b.type === 'shop') sum += REALTY.rent.shop;
      if (REALTY.rent[b.type] && !['home', 'office', 'shop'].includes(b.type) && !b.demolish) sum += REALTY.rent[b.type];
    });
    return sum;
  }

  // What to build next: offices when people lack jobs, homes when house hunters can't find one.
  planGrowth(now) {
    const pop = this.people.length, adults = this.people.filter((p) => !p.kid).length, jobs = this.jobSlots().length;
    const jobless = this.people.filter((p) => !p.job && !p.kid).length, hunting = this.hunters.length;
    const has = (type) => this.lots.some((b) => b?.type === type);
    if (jobless > 2 || jobs < adults - 2) {
      const F = GROWTH.factory, free = this.lots.some((b) => !b);
      if (this.factoryMind && !has('factory') && now > this.factoryBan && pop >= F.pop && jobless >= F.jobless && free && this.grow('factory', 0, now)) return;
      if (this.grow('office', GROWTH.officeTier(pop), now)) return;
      // (no room for more offices: carry on with everything else)
    }
    // Restaurants, the school, the stations, the pub, the hospital get the next free plot when the town's
    // big enough for them (homes can always grow upwards instead).
    for (const [type, at, extra] of GROWTH.civic) {
      if (pop < at || has(type) || (extra && !extra(this))) continue;
      if (type === 'restaurant' && this.lots.some((b) => b?.L.rooms.some((r) => r.kind === 'cafe' || r.kind === 'diner')) && pop < 30) continue; // a cafe will do for now
      if (type === 'bar' && this.lots.some((b) => b?.L.rooms.some((r) => r.kind === 'pub'))) continue;
      if (this.lots.some((b) => !b)) { if (this.grow(type, 0, now)) return; continue; }
      if (this.buyOut(now)) return; // no free plot: buy out a small house to make room
    }
    // New homes leave enough plots free for the town buildings still to come; until then homes grow upwards.
    const coming = GROWTH.civic.filter(([type, at]) => !has(type) && pop >= at - 12).length, free = this.lots.filter((b) => !b).length; // (soon to be needed)
    const suits = this.vacant.some((v) => this.hunters.some((h) => assignBeds(v.b, v.unit, h))); // (a family needs a child's room)
    if (hunting && !suits && (this.grow('home', GROWTH.homeTier(pop + hunting * 2), now, false, free <= coming) || this.redevelop(now))) return;
    const shops = this.lots.filter((b) => b?.type === 'shop');
    if (shops.some((b) => b.tier < GROWTH.shopTier(pop))) return this.grow('shop', GROWTH.shopTier(pop), now, true);
    if (shops.length < GROWTH.shopCount(pop)) return this.grow('shop', GROWTH.shopTier(pop), now);
  }

  // People want homes, there's nowhere left to build one, and every home is as tall as it can be: buy
  // a building the town can spare (a second shop; an office, when there are plenty of jobs without
  // it) and pull it down to build homes there. True if it did.
  redevelop(now) {
    const homes = this.lots.filter((b) => b?.type === 'home');
    if (this.lots.some((b) => !b) || homes.some((b) => b.tier < this.maxTier('home')) || this.lots.some((b) => b?.demolish)) return false;
    const adults = this.people.filter((p) => !p.kid).length, jobs = this.jobSlots().length;
    const shops = this.lots.filter((b) => b?.type === 'shop' && !b.build).sort((a, c) => a.tier - c.tier);
    const offices = this.lots.filter((b) => b?.type === 'office' && !b.build).sort((a, c) => a.tier - c.tier);
    let pick = shops.length > 1 ? shops[0] : null;
    if (!pick && offices.length > 1) { const o = offices[0], desks = o.allSpots('work').length; if (jobs - desks >= adults + 4) pick = o; }
    if (!pick) return false;
    const lot = this.lots.indexOf(pick);
    for (const p of this.people) if (p.job?.lot === lot) { p.job = null; p.wantKey = null; } // they'll find work elsewhere
    pick.demolish = { start: now, end: now + 2 * HOUR, banner: 'SOLD' };
    return true;
  }

  // Every plot's taken but the town needs a school (or a station...): the realty buys a cottage or a
  // house whose household can move straight into a home elsewhere that suits them, moves them, and
  // pulls the house down. True if it did.
  buyOut(now) {
    const vacant = this.vacantUnits();
    const lots = this.lots.map((b, i) => [b, i]).filter(([b]) => b?.type === 'home' && b.tier <= 1 && b.ready() && !b.upgrade && !b.demolish)
      .sort(([a, i], [c, k]) => a.tier - c.tier || this.people.filter((p) => p.home.lot === i).length - this.people.filter((p) => p.home.lot === k).length);
    for (const [b, i] of lots) {
      const homes = new Map();
      for (const p of this.people.filter((q) => q.home.lot === i)) (homes.get(p.hh) ?? homes.set(p.hh, []).get(p.hh)).push(p);
      const free = vacant.filter((v) => v.lot !== i), plan = [];
      for (const members of homes.values()) {
        members.sort((a, c) => (a.kid ? 1 : 0) - (c.kid ? 1 : 0));
        const h = { kind: members.length === 1 ? 'single' : members.some((q) => q.kid) ? 'family' : 'couple', adults: members.filter((q) => !q.kid).length, kids: members.filter((q) => q.kid).length };
        if (h.kind === 'couple' && h.adults > 2) h.kind = 'roommates';
        const k = free.findIndex((v) => assignBeds(v.b, v.unit, h));
        if (k < 0) break;
        const [v] = free.splice(k, 1);
        plan.push([members, v, assignBeds(v.b, v.unit, h)]);
      }
      if (plan.length < homes.size) continue;
      for (const [members, v, beds] of plan) {
        members.forEach((p, k) => Object.assign(p, { home: { lot: v.lot, unit: v.unit, bed: beds[k] }, wantKey: null, newcomer: true }));
        this.orderFurniture(v.b, v.unit, now);
      }
      for (const m of this.moves.filter((m) => m.b === b)) { this.moves = this.moves.filter((x) => x !== m); this.hunters.push(m.hh || newHousehold()); }
      b.demolish = { start: now, end: now + 2 * HOUR, banner: 'SOLD' };
      return true;
    }
    return false;
  }

  // Upgrade the smallest building of this type if it's below the wanted size, else build on an
  // empty lot. When every lot is taken, the town builds upward: the smallest one gets a size bigger.
  // Nowhere left to grow on these desktops: every plot built on, every home as tall as it can be.
  isFull() { return !this.lots.some((b) => !b || b.build || b.upgrade || b.demolish || (b.type === 'home' && b.tier < this.maxTier('home'))) && this.hunters.length > 0 && !this.vacant.length; }
  // How much the bank will lend: the credit line, plus part of what the company's buildings cost.
  creditLimit() {
    let value = 0;
    for (const b of this.lots) if (b && !REALTY.public.has(b.type) && REALTY.cost[b.type]) value += REALTY.cost[b.type][b.tier] || 0;
    return REALTY.credit + REALTY.lendOnValue * value;
  }
  // The tallest size of this type that fits on the screen (a tower can't poke out of the top).
  maxTier(type) {
    let t = TYPES[type].length - 1;
    while (t > 0 && (TYPES[type][t].n ?? 1) * 30 + 26 > this.G - 16) t--;
    return t;
  }
  // Build or rebuild something. True if it did.
  grow(type, tier, now, upgradeOnly = false, noNewLot = false) {
    const max = this.maxTier(type);
    tier = Math.min(tier, max);
    const mine = this.lots.filter((b) => b?.type === type).sort((a, b) => a.tier - b.tier);
    const lot = noNewLot && mine.some((b) => b.tier < max) ? undefined : this.order().find((i) => !this.lots[i]);
    let up = mine.find((b) => b.tier < tier), to = tier;
    if (!up && lot === undefined && !upgradeOnly) { up = mine.find((b) => b.tier < max); to = up && up.tier + 1; }
    // The first office tower is the city's headquarters: one company owns the whole building.
    const hq = type === 'office' && (up ? to : tier) === TYPES.office.length - 1 && !this.lots.some((b) => b?.hq || b?.upgrade?.next.hq);
    const cost = REALTY.public.has(type) ? 0 : REALTY.cost[type][up ? to : tier]; // (the town pays for schools, stations and the hospital)
    if (!(up || (!upgradeOnly && lot !== undefined)) || this.realty.cash - cost < -this.creditLimit()) return false; // nothing to do, or can't afford it
    this.realty.cash -= cost;
    if (up) {
      // Layouts are random, so try a few and keep one with at least as many beds / desks as before.
      const act = type === 'home' ? 'sleep' : 'work', had = up.allSpots(act).length;
      let next = new Building(type, to, randInt(), { hq });
      for (let k = 0; k < 8 && next.allSpots(act).length <= had; k++) next = new Building(type, to, randInt(), { hq });
      up.upgrade = { next, start: now, end: now + next.L.n * GROWTH.buildPerFloor };
      this.place(this.W, this.G);
      return true;
    }
    if (upgradeOnly || lot === undefined) return false; // nothing left to build
    const b = new Building(type, tier, randInt(), { hq });
    b.build = { start: now, end: now + b.L.n * GROWTH.buildPerFloor };
    this.lots[lot] = b;
    this.place(this.W, this.G);
    return true;
  }

  finishUpgrade(i, now) {
    const old = this.lots[i], next = old.upgrade.next;
    this.lots[i] = next;
    this.place(this.W, this.G);
    // Every household that lived here gets a home that suits it in the new building (or elsewhere).
    const homes = new Map();
    for (const p of this.people.filter((q) => q.home.lot === i)) (homes.get(p.hh) ?? homes.set(p.hh, []).get(p.hh)).push(p);
    const used = new Set();
    for (const members of homes.values()) {
      members.sort((a, c) => (a.kid ? 1 : 0) - (c.kid ? 1 : 0));
      const h = { kind: members.length === 1 ? 'single' : members.some((q) => q.kid) ? 'family' : 'couple', adults: members.filter((q) => !q.kid).length, kids: members.filter((q) => q.kid).length };
      if (h.kind === 'couple' && h.adults > 2) h.kind = 'roommates';
      const units = [...new Set(next.allSpots('sleep').map((sp) => sp.unit))].filter((u) => !used.has(u));
      const unit = units.find((u) => assignBeds(next, u, h)) ?? units.find((u) => next.allSpots('sleep', u).length >= members.length);
      if (unit === undefined) { for (const p of members) p.home = this.freeBed() || p.home; continue; } // no room: find beds elsewhere
      used.add(unit);
      const beds = assignBeds(next, unit, h) || members.map((_, k) => k);
      members.forEach((p, k) => { p.home = { lot: i, unit, bed: beds[k] }; });
    }
    const desks = next.allSpots('work').length;
    this.people.filter((p) => p.job?.lot === i).forEach((p, k) => { p.job = k < desks && old.type === 'office' ? { lot: i, desk: k, shift: 0 } : p.job.desk < desks ? p.job : null; });
    for (const p of this.people) {
      if (p.b === old) Object.assign(p, { b: next, f: 0, x: next.doorX() + 6, y: next.feetY(0), surface: 'floor', plan: [], wantKey: null, hip: null, spot: null });
      else if (p.surface !== 'elev' && p.plan.some((s) => s.b === old)) { p.plan = []; p.wantKey = null; }
      if (p.home.lot === i) p.carry = null; // boxes from the old building are gone
    }
    for (const p of this.people) if (p.home.lot === i) this.orderFurniture(next, p.home.unit, now); // new place, new furniture
    // Households that had signed for a flat here move into the new building instead, if their flat still exists.
    for (const m of this.moves.filter((m) => m.b === old)) {
      const beds = next.allSpots('sleep', m.unit).length, taken = this.people.some((p) => p.home.lot === i && p.home.unit === m.unit);
      if (beds >= m.size && !taken) m.b = next;
      else { this.moves = this.moves.filter((x) => x !== m); this.hunters.push({ size: m.size }); }
    }
    for (const c of this.movers) if (c.move.b === old) c.move.b = next;
  }

  // ---------- saving ----------
  snapshot() {
    const lots = this.lots.map((b) => b && {
      type: b.type, tier: b.tier, seed: b.seed, build: b.build, hq: b.hq, plan: b.L.plan, demolish: b.demolish, // the room plan, so layouts never change on load
      upgrade: b.upgrade && { tier: b.upgrade.next.tier, seed: b.upgrade.next.seed, hq: b.upgrade.next.hq, plan: b.upgrade.next.L.plan, start: b.upgrade.start, end: b.upgrade.end },
      furnish: { // which flat-packs are built, half-built, or still in boxes
        ready: b.L.items.flatMap((it, i) => (it.flatpack && it.ready ? [i] : [])),
        progress: b.L.items.flatMap((it, i) => (it.flatpack && !it.ready && it.progress ? [[i, it.progress]] : [])),
        boxes: b.boxes.map(({ item, room, size, outside, f, lx, opened, own, progress }) => ({ item, room, size, outside, f, lx, opened, own, progress })),
        ordered: [...b.ordered],
      },
    });
    const orders = this.orders.map((o) => ({ lot: this.lots.indexOf(o.b), unit: o.unit, items: o.items, due: o.due }));
    const moves = this.moves.map((m) => ({ lot: this.lots.indexOf(m.b), unit: m.unit, size: m.size, hh: m.hh, due: m.due }));
    const realty = { cash: this.realty.cash, hunters: this.hunters, moves, nextHunter: this.nextHunter, lastDay: this.lastDay };
    const people = this.people.map((p) => ({ id: p.id, seed: p.seed, jitter: p.jitter, home: p.home, job: p.job, newcomer: p.newcomer, hh: p.hh, kid: p.kid || undefined, jail: p.jail || undefined, anger: p.anger ? Math.round(p.anger * 100) / 100 : undefined, sick: p.sick && !p.sick.ambulance ? p.sick : undefined, shoppedDay: p.shoppedDay, mood: p.mood !== undefined ? Math.round(p.mood * 100) / 100 : undefined }));
    const town = { pollution: this.pollution, protests: this.protests, protest: this.protest, factoryBan: this.factoryBan, factoryMind: this.factoryMind };
    const cars = this.cars.map((c) => ({ owner: c.owner, kind: c.kind, paint: c.paint, park: c.park })); // a car out driving is saved as parked at home
    return { lots, people, orders, realty, cars, town, social: saveRels(this), nextId: this.nextId };
  }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.snapshot())); } catch {} }
  static load() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
  }
  restore(s, now) {
    while (this.lots.length < s.lots.length) this.lots.push(null); // every saved plot comes back
    this.n = this.lots.length;
    const map = (lot) => (lot >= 0 && lot < this.n ? lot : null);
    s.lots.forEach((d, i) => {
      const at = map(i);
      if (!d || at === null) return;
      // Towns saved before deliveries existed come back fully furnished.
      const b = new Building(d.type, d.tier, d.seed, { hq: d.hq, furnished: !d.furnish, plan: d.plan });
      b.build = d.build; b.demolish = d.demolish || null;
      if (d.upgrade) b.upgrade = { next: new Building(d.type, d.upgrade.tier, d.upgrade.seed, { hq: d.upgrade.hq, plan: d.upgrade.plan }), start: d.upgrade.start, end: d.upgrade.end };
      if (d.furnish) {
        const n = b.L.lobbyRenumbered ? b.L.renumber : (i) => i; // saved before the new lobbies: everything after a lobby moved along
        for (const i of d.furnish.ready) if (b.L.items[n(i)]) b.L.items[n(i)].ready = true;
        for (const [i, prog] of d.furnish.progress) if (b.L.items[n(i)]) b.L.items[n(i)].progress = prog;
        b.boxes = [];
        for (const x0 of d.furnish.boxes) { // re-stacked neatly (older saves could leave them in uneven piles)
          const x = x0.item != null ? { ...x0, item: n(x0.item) } : x0;
          if (x.item != null && !b.L.items[x.item]) continue;
          const box = { ...x, claimed: null, carried: false };
          b.boxes.push(x.opened ? box : b.placeBox(box, !!x.outside, x.f || 0, x.lx));
        }
        b.ordered = new Set(d.furnish.ordered);
        b.rebake();
      }
      this.lots[at] = b;
    });
    // (Saves from before quicker deliveries could have trucks and cars booked for tomorrow: bring them forward.)
    for (const o of s.orders || []) { const b = this.lots[map(o.lot)]; if (b) this.orders.push({ ...o, items: b.L.lobbyRenumbered ? o.items.map(b.L.renumber) : o.items, due: Math.min(o.due, deliverBy(now)), b, truck: false }); }
    for (const d of s.people) {
      const home = map(d.home.lot);
      if (home === null || !this.lots[home]) continue;
      // Layouts can change between versions: drop a bed or desk that no longer exists.
      if (this.lots[home].allSpots('sleep', d.home.unit).length <= d.home.bed) continue;
      let job = d.job && map(d.job.lot) !== null ? { lot: map(d.job.lot), desk: d.job.desk, shift: d.job.shift || 0 } : null;
      if (job && !(this.lots[job.lot]?.allSpots('work').length > job.desk)) job = null;
      const p = makePerson({ ...d, home: { ...d.home, lot: home }, job });
      p.newcomer = !!d.newcomer; p.shoppedDay = d.shoppedDay ?? -1; if (d.mood !== undefined) p.mood = d.mood;
      p.b = undefined;
      this.people.push(p);
    }
    // Towns from before households: whoever shares a home is one household; in a home of three or
    // more with a couple in the double bed, whoever has a single bed is their child.
    const groups = new Map();
    for (const p of this.people) if (s.people.find((d) => d.id === p.id)?.hh === undefined) { const k = `${p.home.lot}:${p.home.unit}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(p); }
    for (const g of groups.values()) {
      const hh = Math.min(...g.map((p) => p.id));
      for (const p of g) p.hh = hh;
      if (g.length < 3) continue;
      const b = this.lots[g[0].home.lot], spots = b.allSpots('sleep', g[0].home.unit);
      if (!g.some((p) => FLATPACK[spots[p.home.bed]?.item.kind] && spots[p.home.bed].item.kind === 'bed2')) continue;
      for (const p of g) if (spots[p.home.bed]?.item.kind === 'bed') { p.kid = true; p.job = null; }
    }
    loadRels(this, s.social);
    if (s.town) Object.assign(this, { pollution: s.town.pollution || 0, protests: s.town.protests || 0, protest: s.town.protest || null, factoryBan: s.town.factoryBan || 0, factoryMind: s.town.factoryMind ?? this.factoryMind });
    if (s.realty) {
      Object.assign(this.realty, { cash: s.realty.cash });
      this.hunters = (s.realty.hunters || []).map((h) => (h.kind ? h : h.size === 1 ? { kind: 'single', adults: 1, kids: 0 } : { kind: 'couple', adults: 2, kids: Math.max(0, h.size - 2) }));
      this.lastDay = s.realty.lastDay ?? null;
      for (const m of s.realty.moves || []) if (this.lots[m.lot]) this.moves.push({ ...m, due: Math.min(m.due, moveBy(now)), id: this.nextMove++, b: this.lots[m.lot], car: false });
    }
    for (const c of s.cars || []) {
      if (!this.people.some((p) => p.id === c.owner)) continue;
      const car = makeCar(this, c.owner, c.kind, c.paint);
      if (c.park && (c.park.lot ?? -1) >= 0 && c.park.lot < this.n) car.park = c.park;
    }
    this.nextHunter = Math.max(s.realty?.nextHunter || 0, now);
    this.nextId = s.nextId || this.people.length + 1;
  }

  // Testing aid: grow instantly to about `pop` people.
  fastForward(pop, now) {
    const cash = this.realty.cash;
    this.realty.cash = 1e12; this.moves = [];
    for (let guard = 0; guard < 500 && this.people.length < pop; guard++) {
      this.hunters = [newHousehold()]; this.vacant = this.vacantUnits();
      this.planGrowth(now);
      this.lots.forEach((b, i) => { if (b?.build) b.build = null; if (b?.upgrade) this.finishUpgrade(i, now); });
      for (const v of this.vacantUnits()) { // a suitable household moves straight in
        let h = null, beds = null;
        for (let k = 0; k < 6 && !beds; k++) { h = newHousehold(); beds = assignBeds(v.b, v.unit, h); }
        if (!beds) continue;
        for (const p of this.moveIn(v.lot, v.unit, h, beds)) p.b = undefined;
        this.orderFurniture(v.b, v.unit, now);
        break;
      }
      for (const p of this.people) if (!p.job && !p.kid) p.job = this.freeDesk();
    }
    for (const p of this.people) this.putHome(p);
    // A grown test town is already furnished.
    for (const b of this.lots) if (b) { for (const it of b.L.items) it.ready = true; b.rebake(); }
    giveCars(this);
    this.orders = []; this.hunters = []; this.realty.cash = cash;
  }
}
