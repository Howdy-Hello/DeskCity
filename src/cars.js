// Household cars, underground car parks and street parking.
// About half the households own a car (the one they moved in with). They walk most of the time and
// drive now and then. A car parks in the car park under its destination if that has a free space,
// otherwise at the kerb nearby. Apartments, condo towers and office towers have car parks; how many
// levels fit depends on the room under the street (the Dock's height), and the sign by the ramp
// says how many spaces are free, or FULL.
import { Vehicle } from './vehicles.js';
import { painter, lineCells, sprite } from './draw.js';

export const PAINT = ['#c0392b', '#2c3e50', '#7f8c8d', '#ecf0f1', '#2980b9', '#16a085', '#8e44ad', '#d35400', '#1e1e22', '#e2b33c'];
export const OWN_KINDS = ['hatch', 'hatch', 'suv', 'suv', 'pickup'];
const LEVEL_H = 18, RAMP_W = 36, SLOT_W = 44;
const INK = '#1e1e22';

export const hasGarage = (b) => !!b && ((b.type === 'home' && b.tier >= 2) || (b.type === 'office' && b.tier >= 2));

// The car park under lot `lot`, or null. Levels hang below the street: level 0 first, then level 1.
// The ramp runs down from the street at the building's right-hand end; on two levels it switches back.
export function garage(city, lot) {
  const b = city.lots[lot];
  if (!hasGarage(b) || b.build) return null;
  const levels = Math.min(2, Math.floor((city.under - 4) / LEVEL_H));
  if (levels < 1) return null;
  const left = b.x0 + 3, right = b.x0 + b.L.w - 3, rampBottom = right - RAMP_W;
  const per = Math.floor((rampBottom - 3 - left) / SLOT_W);
  if (per < 1) return null;
  const G = city.G;
  return {
    lot, b, G, levels, per, cap: levels * per, left, right, rampTop: right, rampBottom,
    floor: (l) => G + 3 + (l + 1) * LEVEL_H, // feet row on level l
    slotX: (s) => left + 2 + SLOT_W * (s + 0.5),
  };
}
// From the top of the ramp down to level l (and the reverse, back up).
function downRamp(g, level) {
  const pts = [{ x: g.rampTop, y: g.G }, { x: g.rampBottom, y: g.floor(0) }];
  if (level === 1) pts.push({ x: g.rampTop, y: g.floor(1) });
  return pts;
}
const upRamp = (g, level) => downRamp(g, level).reverse();

export const nearestLot = (city, x) => city.lots.reduce((best, _, i) => (Math.abs(city.lotCenter(i) - x) < Math.abs(city.lotCenter(best) - x) ? i : best), 0);

// Where a parked car is: { x, y, dir }, or null if its space no longer exists.
export function parkedAt(city, park) {
  if (park.type === 'garage') {
    const g = garage(city, park.lot);
    if (!g || park.level >= g.levels || park.slot >= g.per) return null;
    return { x: g.slotX(park.slot), y: g.floor(park.level), dir: -1 };
  }
  return { x: city.lotCenter(park.lot) + park.dx, y: city.G, dir: park.dir || 1 };
}

const claims = (city, except) => city.cars.filter((c) => c !== except).map((c) => c.target || c.park).filter(Boolean);
export function freeSlot(city, lot, except) {
  const g = garage(city, lot);
  if (!g) return null;
  const used = claims(city, except).filter((k) => k.type === 'garage' && k.lot === lot);
  for (let level = 0; level < g.levels; level++)
    for (let slot = 0; slot < g.per; slot++) if (!used.some((k) => k.level === level && k.slot === slot)) return { type: 'garage', lot, level, slot };
  return null;
}
export const freeSpaces = (city, lot) => {
  const g = garage(city, lot);
  return g ? g.cap - claims(city, null).filter((k) => k.type === 'garage' && k.lot === lot && k.level < g.levels && k.slot < g.per).length : 0;
};

// A free stretch of kerb near x for a vehicle `len` long: clear of front doors, car park ramps,
// other parked cars (and spaces cars are heading for), and delivery vans.
export function streetSpot(city, nearX, len, except) {
  const blocks = [];
  city.lots.forEach((b, lot) => {
    if (!b) return;
    blocks.push([b.doorX() - 8, b.doorX() + 8]);
    const g = garage(city, lot);
    if (g) blocks.push([g.rampBottom - 6, g.rampTop + 8]);
  });
  for (const c of city.cars) {
    const k = c !== except && (c.target || c.park);
    if (k?.type !== 'street') continue;
    const at = parkedAt(city, k);
    blocks.push([at.x - c.v.len / 2 - 3, at.x + c.v.len / 2 + 3]);
  }
  for (const t of [...city.trucks, ...city.movers]) if (t !== except && t.park != null) blocks.push([t.park - t.v.len / 2 - 3, t.park + t.v.len / 2 + 3]);
  const W = city.width(), half = len / 2;
  // Rather not in front of a building (it would look parked in the front room once the wall
  // fades away): first try gaps and empty plots within a short walk, then anywhere.
  const fronts = city.lots.filter(Boolean).map((b) => [b.x0 - b.L.ox, b.x0 + b.L.w]);
  const clear = (x, list) => !list.some(([a, b]) => x + half > a && x - half < b);
  const ok = (x) => x - half > 4 && x + half < W - 4 && clear(x, blocks);
  for (const [range, strict] of [[120, true], [W, false]]) {
    for (let k = 0; k < range; k++) {
      const x = Math.round(nearX + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2);
      if (ok(x) && (!strict || clear(x, fronts))) return x;
    }
  }
  return Math.round(nearX);
}

// Things at the kerb in front of a building fade with its front wall while it's cut away.
export function fadeAt(city, x0, x1) {
  let a = 1;
  for (const b of city.lots) if (b && x1 > b.x0 && x0 < b.x0 + b.L.w) a = Math.min(a, 1 - 0.7 * b.reveal);
  return a;
}
function kerbPark(city, x, dir) { const lot = nearestLot(city, x); return { type: 'street', lot, dx: x - city.lotCenter(lot), dir }; }

// Where to leave the car when going to lot `lot`: its car park if there's room, else the kerb nearby.
function parkingFor(city, car, lot) {
  const slot = freeSlot(city, lot, car);
  if (slot) return slot;
  const b = city.lots[lot], near = b ? b.doorX() + 26 : city.lotCenter(lot);
  return kerbPark(city, streetSpot(city, near, car.v.len, car), car.v.dir);
}

export function makeCar(city, owner, kind, paint, v = null) {
  const car = { id: city.nextCar++, owner, kind, paint, park: null, target: null, user: null, v: v || new Vehicle(kind, { body: paint }) };
  car.v.riders = []; car.v.cargo = 0;
  city.cars.push(car);
  return car;
}
// The household's car: owned by someone who lives in the same home as p.
export function carOf(city, p) {
  return city.cars.find((c) => {
    const o = c.owner === p.id ? p : city.people.find((q) => q.id === c.owner);
    return o && o.home.lot === p.home.lot && o.home.unit === p.home.unit;
  });
}

// Parked at home: in the car park if there's room, else at the kerb.
export function parkHome(city, car) {
  const o = city.people.find((q) => q.id === car.owner), lot = o ? o.home.lot : nearestLot(city, car.v.x);
  car.target = null; car.user = null; car.v.path = []; car.v.turnT = 0; car.v.riders = [];
  car.park = parkingFor(city, car, lot);
}

// Where to meet the car: next to it at the kerb, or at the top of its car park's ramp.
export function pickupX(city, car) {
  if (car.park?.type === 'garage') { const g = garage(city, car.park.lot); if (g) return g.rampTop; }
  return Math.round(car.v.x);
}
// The walk from the pickup point to the car's door (down the ramp in a car park), and back.
export function walkToCar(city, car) {
  if (car.park?.type !== 'garage') return [{ x: car.v.x, y: city.G }];
  const g = garage(city, car.park.lot);
  return g ? [...downRamp(g, car.park.level).slice(1), { x: g.slotX(car.park.slot) - 6, y: g.floor(car.park.level) }] : [];
}
export function walkFromCar(city, car) {
  if (car.park?.type !== 'garage') return [];
  const g = garage(city, car.park.lot);
  return g ? upRamp(g, car.park.level) : [];
}

// Drive from wherever the car is parked to lot `lot`, with `rider` at the wheel.
export function startTrip(city, car, rider, lot) {
  const v = car.v, from = car.park, pts = [];
  if (from?.type === 'garage') { const g = garage(city, from.lot); if (g) pts.push(...upRamp(g, from.level)); } // out of the bay and up
  car.park = null;
  const to = parkingFor(city, car, lot);
  if (to.type === 'garage') { const g = garage(city, to.lot); pts.push(...downRamp(g, to.level), { x: g.slotX(to.slot), y: g.floor(to.level) }); }
  else pts.push({ x: city.lotCenter(to.lot) + to.dx, y: city.G });
  Object.assign(car, { target: to, user: rider.id });
  v.riders = [{ color: INK }];
  v.go(pts);
}

export function updateCars(city, dt) {
  for (const c of city.cars) {
    if (c.target) {
      c.v.update(dt);
      if (!c.v.moving) { c.park = { ...c.target, dir: c.v.dir }; c.target = null; }
      continue;
    }
    const at = c.park && parkedAt(city, c.park);
    if (!at) { parkHome(city, c); continue; } // its space is gone (rebuilt, or less room under the street)
    Object.assign(c.v, { x: at.x, y: at.y, dir: c.park.type === 'garage' ? -1 : at.dir, slope: 0 });
  }
}

// Households without a car record get one about half the time (towns saved before cars).
export function giveCars(city, chance = 0.55) {
  const seen = new Set();
  for (const p of city.people) {
    const key = `${p.home.lot}:${p.home.unit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (carOf(city, p) || ((p.seed * 2654435761) >>> 0) / 2 ** 32 > chance) continue;
    const h = (Math.imul(p.seed, 2246822519) >>> 0);
    const car = makeCar(city, p.id, OWN_KINDS[h % OWN_KINDS.length], PAINT[(h >>> 8) % PAINT.length]);
    parkHome(city, car);
  }
}

// ---------- drawing ----------
const WALL = '#5d5f66', SLAB = '#8a8c92', SLAB_TOP = '#a3a5aa', EARTH_EDGE = '#3c3d42';
function ramp(p, x0, y0, x1, y1) {
  for (const [x, y] of lineCells(x0, y0 + 1, x1, y1 + 1)) { p.rect(x, y, 1, 3, SLAB); p.px(x, y, SLAB_TOP); }
}

// A car park never changes once built, so each one is drawn once into its own image and reused.
const garageArt = new Map();
export function drawGarages(ctx, city, seen, H, night) {
  city.lots.forEach((b, lot) => {
    const g = garage(city, lot);
    if (!g || !seen(g.left, g.right)) return;
    const bottom = Math.min(H, g.floor(g.levels - 1) + 4), x0 = g.left - 2, key = `${g.left}:${g.right}:${g.G}:${g.levels}:${g.per}:${bottom}`;
    let art = garageArt.get(lot);
    if (art?.key !== key) {
      const cv = sprite(g.right - g.left + 8, bottom - g.G + 2), c2 = cv.getContext('2d');
      c2.translate(-x0, -g.G);
      paintGarage(c2, g, bottom);
      garageArt.set(lot, (art = { key, cv }));
    }
    ctx.drawImage(art.cv, x0, g.G);
  });
}
function paintGarage(ctx, g, bottom) {
  const p = painter(ctx);
  {
    const { left, right, G } = g;
    p.rect(left - 2, G + 1, right - left + 4, bottom - G - 1, EARTH_EDGE); // concrete shell, cut away
    for (let l = 0; l < g.levels; l++) {
      const fy = g.floor(l), ceil = fy - LEVEL_H + 4;
      p.rect(left, ceil, right - left, fy - ceil + 1, WALL);
      p.rect(left, fy - 6, right - left, 1, '#6a6c74'); // painted band along the wall
      p.rect(left, fy + 1, right - left, 2, SLAB); p.rect(left, fy + 1, right - left, 1, SLAB_TOP);
      for (let s = 0; s <= g.per; s++) { // pillars and bay lines
        const x = Math.round(left + 2 + SLOT_W * s);
        p.rect(x - 1, ceil, 2, fy - ceil + 1, '#74767d'); p.rect(x - 1, fy + 1, 2, 1, '#e1b12c');
      }
      for (let s = 0; s < g.per; s++) { // strip lights over each bay
        const x = Math.round(g.slotX(s));
        p.rect(x - 3, ceil, 7, 1, '#fff4c4');
        ctx.fillStyle = 'rgba(255,244,196,0.07)'; ctx.fillRect(x - 10, ceil + 1, 21, fy - ceil);
      }
      p.text(`P${l + 1}`, left + 4, ceil + 3, '#c9cbd1');
    }
    // Ramp openings and slabs.
    for (let x = g.rampBottom; x <= g.rampTop; x++) {
      const y = Math.round(G + ((x - g.rampTop) / (g.rampBottom - g.rampTop)) * (g.floor(0) - G));
      if (y > G + 1) p.rect(x, G + 1, 1, y - G - 1, WALL);
    }
    ramp(p, g.rampTop, G, g.rampBottom, g.floor(0));
    if (g.levels > 1) ramp(p, g.rampBottom, g.floor(0), g.rampTop, g.floor(1));
    for (let x = g.rampBottom + 2; x < g.rampTop; x += 4) p.rect(x, G + 1, 2, 1, (x / 4) % 2 ? '#e1b12c' : INK); // warning stripes at the entrance
  }
}

// The blue P sign on the wall by the ramp: free spaces, or FULL.
export function drawGarageSigns(ctx, city, seen) {
  const p = painter(ctx);
  city.lots.forEach((b, lot) => {
    const g = garage(city, lot);
    if (!g || !seen(g.left, g.right + 10)) return;
    const free = freeSpaces(city, lot), x = g.right - 34, y = g.G - 27; // left of where a FOR RENT sign goes
    p.rect(x, y, 9, 9, '#2e6fd8'); p.frame(x, y, 9, 9, '#ffffff'); p.text('P', x + 3, y + 2, '#ffffff');
    const label = free > 0 ? `${free}` : 'FULL', w = label.length * 4 + 3;
    p.rect(x + 4 - Math.floor(w / 2), y + 10, w, 7, INK);
    p.text(label, x + 6 - Math.floor(w / 2), y + 11, free > 0 ? '#5ee37a' : '#ff5a5a');
  });
}

// layer 'under': cars below the street (in car parks, on ramps); 'street': everything at street level.
export function drawCars(ctx, city, seen, t, night, layer) {
  for (const c of city.cars) {
    const v = c.v, under = v.y > city.G + 1;
    if (under !== (layer === 'under') || !seen(v.x - v.len, v.x + v.len)) continue;
    ctx.globalAlpha = under ? 1 : fadeAt(city, v.x - v.len / 2, v.x + v.len / 2);
    v.draw(ctx, t, night);
    ctx.globalAlpha = 1;
  }
}
