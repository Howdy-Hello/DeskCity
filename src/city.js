// The city: lots along the bottom of the screen, who lives and works where, how it grows, saving.
import { Building, TYPES, LOT_W } from './buildings.js';
import { makePerson } from './people.js';

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
    this.addPerson(true);
    this.addPerson(true);
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
      for (const s of b.spots(act)) {
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

  addPerson(initial) {
    const home = this.freeBed();
    if (!home) return;
    const p = makePerson({ id: this.nextId++, seed: randInt() % 100000, jitter: (Math.random() - 0.5) * 0.6, home, job: this.freeDesk() });
    this.people.push(p);
    if (initial) p.b = undefined; // placed at home once the lots have positions
    else { p.x = Math.random() < 0.5 ? -6 : this.W + 6; p.y = this.G; } // walks in from the edge of the screen
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
      if (b?.upgrade && now >= b.upgrade.end) this.finishUpgrade(i);
    });
    if (now >= this.nextArrival) { this.nextArrival = now + GROWTH.arrivalEvery; this.addPerson(false); }
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
    if (up) {
      const next = new Building(type, to, randInt());
      up.upgrade = { next, start: now, end: now + next.L.n * GROWTH.buildPerFloor };
      this.place(this.W, this.G);
      return;
    }
    if (upgradeOnly || lot === undefined) return; // nothing left to build
    const b = new Building(type, tier, randInt());
    b.build = { start: now, end: now + b.L.n * GROWTH.buildPerFloor };
    this.lots[lot] = b;
    this.place(this.W, this.G);
  }

  finishUpgrade(i) {
    const old = this.lots[i], next = old.upgrade.next;
    this.lots[i] = next;
    this.place(this.W, this.G);
    // Everyone who lived or worked here gets a bed / desk in the new building.
    const beds = this.slots('home', 'sleep').filter((s) => s.lot === i);
    this.people.filter((p) => p.home.lot === i).forEach((p, k) => { const s = beds[k]; if (s) p.home = { lot: i, unit: s.unit, bed: s.index }; });
    this.people.filter((p) => p.job?.lot === i).forEach((p, k) => { p.job = { lot: i, desk: k }; });
    for (const p of this.people) {
      if (p.b === old) Object.assign(p, { b: next, f: 0, x: next.doorX() + 6, y: next.feetY(0), surface: 'floor', plan: [], wantKey: null, hip: null, spot: null });
      else if (p.plan.some((s) => s.b === old)) { p.plan = []; p.wantKey = null; }
    }
  }

  // ---------- saving ----------
  snapshot() {
    const lots = this.lots.map((b) => b && {
      type: b.type, tier: b.tier, seed: b.seed, build: b.build,
      upgrade: b.upgrade && { tier: b.upgrade.next.tier, seed: b.upgrade.next.seed, start: b.upgrade.start, end: b.upgrade.end },
    });
    const people = this.people.map((p) => ({ id: p.id, seed: p.seed, jitter: p.jitter, home: p.home, job: p.job }));
    return { lots, people, nextArrival: this.nextArrival, nextId: this.nextId };
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
      const b = new Building(d.type, d.tier, d.seed);
      b.build = d.build;
      if (d.upgrade) b.upgrade = { next: new Building(d.type, d.upgrade.tier, d.upgrade.seed), start: d.upgrade.start, end: d.upgrade.end };
      this.lots[at] = b;
    });
    for (const d of s.people) {
      const home = map(d.home.lot);
      if (home === null || !this.lots[home]) continue;
      const job = d.job && map(d.job.lot) !== null ? { lot: map(d.job.lot), desk: d.job.desk } : null;
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
      this.lots.forEach((b, i) => { if (b?.build) b.build = null; if (b?.upgrade) this.finishUpgrade(i); });
      this.addPerson(true);
      for (const p of this.people) if (!p.job) p.job = this.freeDesk();
    }
    for (const p of this.people) this.putHome(p);
  }
}
