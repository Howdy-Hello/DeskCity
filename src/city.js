// The city: lots along the bottom of the screen, who lives and works where, how it grows, saving.
import { Building, TYPES, LOT_W } from './buildings.js';
import { makePerson } from './people.js';
import { Truck } from './delivery.js';

const HOUR = 3600e3;
const SAVE_KEY = 'deskcity-save-v1';

// How the town grows. Tweak these to taste.
export const GROWTH = {
  arrivalEvery: 1 * HOUR,    // a newcomer moves in this often, while there is a free bed
  buildPerFloor: 0.5 * HOUR, // construction time per storey (one building site at a time)
  homeTier: (pop) => (pop < 6 ? 0 : pop < 15 ? 1 : pop < 34 ? 2 : 3),   // cottage, house, apartments, condo tower
  officeTier: (pop) => (pop < 8 ? 0 : pop < 26 ? 1 : 2),                // small office, office, office tower
  shopTier: (pop) => (pop < 25 ? 0 : 1),                                // corner store, supermarket
  shopCount: (pop) => (pop < 45 ? 1 : 2),
};

const randInt = () => (Math.random() * 2 ** 31) | 0;

export class City {
  constructor(W, G, now, saved) {
    this.n = Math.max(3, Math.floor(W / LOT_W));
    this.W = W; this.G = G;
    this.replace(saved, now);
  }

  // Start over from a saved town, or found a brand-new one when there is none.
  replace(saved, now) {
    this.lots = Array(this.n).fill(null);
    this.people = [];
    this.nextId = 1;
    this.orders = []; // furniture orders waiting for a truck: { b, lot, unit, items, due, truck }
    this.trucks = [];
    if (saved) this.restore(saved, now); else this.found(now);
    this.place(this.W, this.G);
    for (const p of this.people) if (p.b === undefined) this.putHome(p);
  }

  // Lots nearest the middle of the screen fill up first.
  order() { return [...this.lots.keys()].sort((a, b) => Math.abs(a - (this.n - 1) / 2) - Math.abs(b - (this.n - 1) / 2)); }
  shops() { return this.lots.filter((b) => b?.type === 'shop' && b.ready()); }

  found(now) {
    const c = Math.floor((this.n - 1) / 2);
    this.lots[c] = new Building('home', 0, randInt());
    this.lots[c + 1] = new Building('office', 0, randInt());
    this.lots[c - 1] = new Building('shop', 0, randInt());
    this.nextArrival = now + GROWTH.arrivalEvery;
    this.addPerson(true, now);
    this.addPerson(true, now);
  }

  place(W, G) {
    // A wider screen gets more lots, added evenly on both sides.
    const n = Math.max(3, Math.floor(W / LOT_W));
    if (n > this.n) {
      const shift = Math.floor((n - this.n) / 2);
      this.lots = [...Array(shift).fill(null), ...this.lots, ...Array(n - this.n - shift).fill(null)];
      for (const p of this.people) { p.home.lot += shift; if (p.job) p.job.lot += shift; }
      this.n = n;
    }
    const margin = (W - this.n * LOT_W) / 2;
    let moved = false;
    this.W = W; this.G = G;
    this.lots.forEach((b, i) => {
      if (!b) return;
      const x0 = b.x0, g0 = b.G;
      b.place(margin + LOT_W * (i + 0.5), G);
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
  freeDesk() {
    const taken = new Set(this.people.filter((p) => p.job).map((p) => `${p.job.lot}:${p.job.desk}`));
    const s = this.slots('office', 'work').find((s) => !taken.has(`${s.lot}:${s.index}`));
    return s ? { lot: s.lot, desk: s.index } : null;
  }

  addPerson(initial, now) {
    const home = this.freeBed();
    if (!home) return;
    this.orderFurniture(this.lots[home.lot], home.unit, now);
    const p = makePerson({ id: this.nextId++, seed: randInt() % 100000, jitter: (Math.random() - 0.5) * 0.6, home, job: this.freeDesk() });
    this.people.push(p);
    if (initial) p.b = undefined; // placed at home once the lots have positions
    else { p.x = Math.random() < 0.5 ? -6 : this.W + 6; p.y = this.G; } // walks in from the edge of the screen
  }
  // ---------- furniture deliveries ----------
  // A household moving into an unfurnished home orders its flat-packs. The truck comes 1-3 hours
  // later during delivery hours (8am-8pm), otherwise the next morning.
  orderFurniture(b, unit, now) {
    if (!b || b.ordered.has(unit)) return;
    const items = b.L.items.map((it, i) => [it, i]).filter(([it]) => it.flatpack && !it.ready && b.L.rooms[it.room].unit === unit).map(([, i]) => i);
    b.ordered.add(unit);
    if (!items.length) return;
    let due = new Date(now + (1 + Math.random() * 2) * HOUR);
    if (due.getHours() >= 20) { due.setDate(due.getDate() + 1); due.setHours(9, 0, 0, 0); due = new Date(+due + Math.random() * 3 * HOUR); }
    else if (due.getHours() < 8) { due.setHours(8, 0, 0, 0); due = new Date(+due + Math.random() * 2 * HOUR); }
    this.orders.push({ b, unit, items, due: +due, truck: false });
  }
  updateDeliveries(w) {
    this.orders = this.orders.filter((o) => this.lots.includes(o.b)); // building replaced: order cancelled
    for (const o of this.orders) if (!o.truck && w.now >= o.due) { o.truck = true; this.trucks.push(new Truck(o, this.W, this.G)); }
    for (const t of this.trucks) t.update(w.dt, this.W);
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
    if (now >= this.nextArrival) { this.nextArrival = now + GROWTH.arrivalEvery; this.addPerson(false, now); }
    this.updateDeliveries(w);
    for (const p of this.people) if (!p.job) p.job = this.freeDesk();
    if (!this.lots.some((b) => b && (b.build || b.upgrade))) this.planGrowth(now);
  }

  planGrowth(now) {
    const pop = this.people.length, desks = this.slots('office', 'work').length;
    if (desks < pop - 2) return this.grow('office', GROWTH.officeTier(pop), now);
    if (this.slots('home', 'sleep').length - pop < 1) return this.grow('home', GROWTH.homeTier(pop + 1), now);
    if (desks < pop) return this.grow('office', GROWTH.officeTier(pop), now);
    const shops = this.lots.filter((b) => b?.type === 'shop');
    if (shops.some((b) => b.tier < GROWTH.shopTier(pop))) return this.grow('shop', GROWTH.shopTier(pop), now, true);
    if (shops.length < GROWTH.shopCount(pop)) return this.grow('shop', GROWTH.shopTier(pop), now);
  }

  // Upgrade the smallest building of this type if it's below the wanted size, else build on an
  // empty lot. When every lot is taken, the town builds upward: the smallest one gets a size bigger.
  grow(type, tier, now, upgradeOnly = false) {
    const max = TYPES[type].length - 1;
    tier = Math.min(tier, max);
    const mine = this.lots.filter((b) => b?.type === type).sort((a, b) => a.tier - b.tier);
    const lot = this.order().find((i) => !this.lots[i]);
    let up = mine.find((b) => b.tier < tier), to = tier;
    if (!up && lot === undefined && !upgradeOnly) { up = mine.find((b) => b.tier < max); to = up && up.tier + 1; }
    // The first office tower is the city's headquarters: one company owns the whole building.
    const hq = type === 'office' && (up ? to : tier) === TYPES.office.length - 1 && !this.lots.some((b) => b?.hq || b?.upgrade?.next.hq);
    if (up) {
      // Layouts are random, so try a few and keep one with at least as many beds / desks as before.
      const act = type === 'home' ? 'sleep' : 'work', had = up.allSpots(act).length;
      let next = new Building(type, to, randInt(), { hq });
      for (let k = 0; k < 8 && next.allSpots(act).length <= had; k++) next = new Building(type, to, randInt(), { hq });
      up.upgrade = { next, start: now, end: now + next.L.n * GROWTH.buildPerFloor };
      this.place(this.W, this.G);
      return;
    }
    if (upgradeOnly || lot === undefined) return; // nothing left to build
    const b = new Building(type, tier, randInt(), { hq });
    b.build = { start: now, end: now + b.L.n * GROWTH.buildPerFloor };
    this.lots[lot] = b;
    this.place(this.W, this.G);
  }

  finishUpgrade(i, now) {
    const old = this.lots[i], next = old.upgrade.next;
    this.lots[i] = next;
    this.place(this.W, this.G);
    // Everyone who lived or worked here gets a bed / desk in the new building.
    const beds = this.slots('home', 'sleep').filter((s) => s.lot === i);
    this.people.filter((p) => p.home.lot === i).forEach((p, k) => {
      const s = beds[k];
      if (s) p.home = { lot: i, unit: s.unit, bed: s.index };
      else p.home = this.freeBed() || p.home; // no room in the new building: find a bed elsewhere
    });
    this.people.filter((p) => p.job?.lot === i).forEach((p, k) => { p.job = { lot: i, desk: k }; });
    for (const p of this.people) {
      if (p.b === old) Object.assign(p, { b: next, f: 0, x: next.doorX() + 6, y: next.feetY(0), surface: 'floor', plan: [], wantKey: null, hip: null, spot: null });
      else if (p.plan.some((s) => s.b === old)) { p.plan = []; p.wantKey = null; }
      if (p.home.lot === i) p.carry = null; // boxes from the old building are gone
    }
    for (const p of this.people) if (p.home.lot === i) this.orderFurniture(next, p.home.unit, now); // new place, new furniture
  }

  // ---------- saving ----------
  snapshot() {
    const lots = this.lots.map((b) => b && {
      type: b.type, tier: b.tier, seed: b.seed, build: b.build, hq: b.hq,
      upgrade: b.upgrade && { tier: b.upgrade.next.tier, seed: b.upgrade.next.seed, hq: b.upgrade.next.hq, start: b.upgrade.start, end: b.upgrade.end },
      furnish: { // which flat-packs are built, half-built, or still in boxes
        ready: b.L.items.flatMap((it, i) => (it.flatpack && it.ready ? [i] : [])),
        progress: b.L.items.flatMap((it, i) => (it.flatpack && !it.ready && it.progress ? [[i, it.progress]] : [])),
        boxes: b.boxes.map(({ item, size, outside, f, lx, opened }) => ({ item, size, outside, f, lx, opened })),
        ordered: [...b.ordered],
      },
    });
    const orders = this.orders.map((o) => ({ lot: this.lots.indexOf(o.b), unit: o.unit, items: o.items, due: o.due }));
    const people = this.people.map((p) => ({ id: p.id, seed: p.seed, jitter: p.jitter, home: p.home, job: p.job }));
    return { lots, people, orders, nextArrival: this.nextArrival, nextId: this.nextId };
  }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.snapshot())); } catch {} }
  static load() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
  }
  restore(s, now) {
    const shift = Math.floor((this.n - s.lots.length) / 2); // a different screen width keeps the town centred
    const map = (lot) => (lot + shift >= 0 && lot + shift < this.n ? lot + shift : null);
    s.lots.forEach((d, i) => {
      const at = map(i);
      if (!d || at === null) return;
      // Towns saved before deliveries existed come back fully furnished.
      const b = new Building(d.type, d.tier, d.seed, { hq: d.hq, furnished: !d.furnish });
      b.build = d.build;
      if (d.upgrade) b.upgrade = { next: new Building(d.type, d.upgrade.tier, d.upgrade.seed, { hq: d.upgrade.hq }), start: d.upgrade.start, end: d.upgrade.end };
      if (d.furnish) {
        for (const i of d.furnish.ready) if (b.L.items[i]) b.L.items[i].ready = true;
        for (const [i, prog] of d.furnish.progress) if (b.L.items[i]) b.L.items[i].progress = prog;
        b.boxes = d.furnish.boxes.filter((x) => b.L.items[x.item]).map((x) => ({ ...x, claimed: null, carried: false }));
        b.ordered = new Set(d.furnish.ordered);
        b.rebake();
      }
      this.lots[at] = b;
    });
    for (const o of s.orders || []) { const b = this.lots[map(o.lot)]; if (b) this.orders.push({ ...o, b, truck: false }); }
    for (const d of s.people) {
      const home = map(d.home.lot);
      if (home === null || !this.lots[home]) continue;
      // Layouts can change between versions: drop a bed or desk that no longer exists.
      if (this.lots[home].allSpots('sleep', d.home.unit).length <= d.home.bed) continue;
      let job = d.job && map(d.job.lot) !== null ? { lot: map(d.job.lot), desk: d.job.desk } : null;
      if (job && !(this.lots[job.lot]?.allSpots('work').length > job.desk)) job = null;
      const p = makePerson({ ...d, home: { ...d.home, lot: home }, job });
      p.b = undefined;
      this.people.push(p);
    }
    this.nextArrival = Math.max(s.nextArrival || 0, now);
    this.nextId = s.nextId || this.people.length + 1;
  }

  // Testing aid: grow instantly to about `pop` people.
  fastForward(pop, now) {
    for (let guard = 0; guard < 500 && this.people.length < pop; guard++) {
      this.planGrowth(now);
      this.lots.forEach((b, i) => { if (b?.build) b.build = null; if (b?.upgrade) this.finishUpgrade(i, now); });
      this.addPerson(true, now);
      for (const p of this.people) if (!p.job) p.job = this.freeDesk();
    }
    for (const p of this.people) this.putHome(p);
    // A grown test town is already furnished.
    for (const b of this.lots) if (b) { for (const it of b.L.items) it.ready = true; b.rebake(); }
    this.orders = [];
  }
}
