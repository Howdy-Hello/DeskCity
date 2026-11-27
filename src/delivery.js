// Furniture deliveries and moving in.
// A delivery van or box truck drives in from the end of the street, parks at the kerb by the
// building, and the driver carries each flat-pack to the front door (cottages, houses) or the
// lobby's parcel shelf (apartments, condos). Then it drives on and out of town.
// A household moving in arrives in its own car (hatchback, SUV, pickup) or a rented MOVEZ van
// with its driver, parks, gets out and unloads onto the kerb. Their own car stays: it's theirs now.
import { ANIM, newPose, blend, drawStickman } from './stickman.js';
import { FLATPACK, BOX } from './furniture.js';
import { drawBox } from './buildings.js';
import { Vehicle } from './vehicles.js';
import { streetSpot, PAINT } from './cars.js';

const WALK = 16; // cells per second
const UNIFORM = '#1e3a5f', INK = '#1e1e22';
// Made-up delivery companies: cab colour, cargo body, stripe, lettering.
const COMPANIES = [
  { name: 'BOXGO', body: '#f4f4f4', stripe: '#e67e22', ink: '#e67e22', cab: '#3b82c4' },
  { name: 'FLATPAK', body: '#f5d33d', stripe: '#2c3e50', ink: '#2c3e50', cab: '#2c3e50' },
  { name: 'SWIFT', body: '#2e86de', stripe: '#ffffff', ink: '#ffffff', cab: '#1f5f9e' },
  { name: 'HOMEHAUL', body: '#27ae60', stripe: '#f4f4f4', ink: '#ffffff', cab: '#1e8449' },
  { name: 'PARCELO', body: '#8e44ad', stripe: '#f1c40f', ink: '#f1c40f', cab: '#6c3483' },
];

// Drives in from the end of the street it's facing, to a free bit of kerb near `nearX`.
function arriveFrom(city, v, nearX, self) {
  const W = city.width();
  v.dir = Math.random() < 0.5 ? 1 : -1;
  v.x = v.dir > 0 ? -v.len : W + v.len; v.y = city.G;
  const park = streetSpot(city, nearX - v.dir * (v.len / 2 + 6), v.len, self);
  v.go([{ x: park, y: city.G }]);
  return park;
}
const driveOff = (city, v) => v.go([{ x: v.dir > 0 ? city.width() + v.len * 2 : -v.len * 2, y: city.G }]); // on, the way it faces

export class Truck {
  constructor(order, city) {
    const b = order.b, co = COMPANIES[Math.floor(Math.random() * COMPANIES.length)];
    this.order = order; this.city = city;
    this.v = new Vehicle(order.items.length > 4 ? 'boxtruck' : 'van', { body: co.cab, cargo: co.body, stripe: co.stripe, ink: co.ink }, co.name);
    this.v.riders = [{ color: UNIFORM }];
    this.park = null;
    this.park = arriveFrom(city, this.v, b.doorX(), this);
    this.state = 'drive';
    this.queue = [...order.items]; // items still in the back
    this.driver = { x: 0, y: city.G, dir: 1, pose: newPose(), phase: 0, box: null, target: 0 };
    this.done = false;
  }

  update(dt) {
    const v = this.v, d = this.driver, b = this.order.b, city = this.city;
    if (this.state !== 'unload') {
      v.update(dt);
      if (v.moving) return;
      if (this.state === 'leave') { this.done = true; return; }
      this.state = 'unload'; v.riders = []; d.x = v.rear(); d.y = city.G; d.step = 'fetch';
    }
    // Unloading: take a box from the back, carry it to the drop spot, come back for the next.
    if (d.step === 'fetch') {
      if (!this.queue.length) { this.state = 'leave'; v.riders = [{ color: UNIFORM }]; this.park = null; driveOff(city, v); return; }
      const item = this.queue.shift(), spot = b.dropSpot();
      d.box = { item, size: FLATPACK[b.L.items[item].kind][0] };
      d.spot = spot; d.lx = b.boxSlot(spot.outside, spot.f, spot.near);
      d.target = b.x0 + d.lx + 5; d.step = 'carry';
    }
    const goal = d.step === 'carry' ? d.target : v.rear(), dx = goal - d.x;
    d.dir = Math.sign(dx) || d.dir;
    d.x += Math.sign(dx) * Math.min(Math.abs(dx), WALK * dt); d.phase += dt * 8; // (about 2 steps a second, carrying)
    if (Math.abs(dx) < 0.5) {
      if (d.step === 'carry') {
        b.boxes.push(b.placeBox({ ...d.box, claimed: null }, d.spot.outside, d.spot.f, d.lx));
        d.box = null; d.step = 'return';
      } else d.step = 'fetch';
    }
  }

  draw(ctx, t, night) {
    this.v.draw(ctx, t, night);
    if (this.state !== 'unload') return;
    const d = this.driver, walking = Math.abs((d.step === 'carry' ? d.target : this.v.rear()) - d.x) > 0.5;
    blend(d.pose, walking ? ANIM.walk(t, d.phase) : ANIM.stand(t), 0.3);
    if (d.box) { d.pose.sL = d.pose.sR = 1.3; d.pose.eL = d.pose.eR = 0.7; }
    drawStickman(ctx, d.x, d.y, d.dir, d.pose, null, UNIFORM);
    if (d.box) drawBox(ctx, d.dir > 0 ? d.x + 1 : d.x - 1 - BOX[d.box.size][0], d.y - 8, d.box.size);
  }
}

// ---------- moving in ----------
export class Mover {
  constructor(move, city) {
    this.move = move; this.city = city;
    this.kind = move.size >= 3 ? (Math.random() < 0.5 ? 'movingvan' : 'pickup') : move.size === 2 ? (Math.random() < 0.6 ? 'suv' : 'pickup') : (Math.random() < 0.7 ? 'hatch' : 'suv');
    this.paint = PAINT[Math.floor(Math.random() * PAINT.length)];
    const van = this.kind === 'movingvan';
    this.v = new Vehicle(this.kind, van ? { body: '#e67e22', cargo: '#f4f4f4', stripe: '#e67e22', ink: '#e67e22' } : { body: this.paint });
    // Who's inside: the MOVEZ driver (a rental comes with one), then the family.
    this.v.riders = [...(van ? [{ color: '#c0571a' }] : []), ...Array.from({ length: move.size }, () => ({ color: INK }))];
    this.v.cargo = this.kind === 'pickup' ? 3 : 0;
    this.park = null;
    this.park = arriveFrom(city, this.v, move.b.doorX(), this);
    this.state = 'drive'; this.wait = 0; this.done = false; this.keep = false;
  }
  rear() { return this.v.rear(); }
  update(dt, onPark, now, city) {
    const v = this.v;
    if (this.state === 'wait') { // parked: wait until everything is off the kerb (or two hours at most: they can fetch the rest later)
      this.wait += dt; this.since ??= now;
      const lot = city.lots.indexOf(this.move.b), home = city.people.some((p) => p.home.lot === lot && p.home.unit === this.move.unit);
      const left = this.move.b.boxes.some((x) => x.mover === this.move.id && !x.carried && !x.opened);
      if ((left && home && now - this.since < 2 * 3600e3) || this.wait < 3) return;
      if (this.kind === 'movingvan') { this.state = 'leave'; v.riders = [{ color: '#c0571a' }]; this.park = null; driveOff(this.city, v); }
      else { this.keep = true; this.done = true; } // the family's own car: it stays, parked
      return;
    }
    v.update(dt);
    if (v.moving) return;
    if (this.state === 'leave') { this.done = true; return; }
    this.state = 'wait'; v.riders = v.riders.slice(0, this.kind === 'movingvan' ? 1 : 0); v.cargo = 0; onPark();
  }
  draw(ctx, t, night) { this.v.draw(ctx, t, night); }
}
