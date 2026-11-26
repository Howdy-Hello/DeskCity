// Every desktop has its own window, all live at once. One of them (the leader) runs the town; the
// others (followers) just draw their own stretch of it. Each frame the leader sends what moves
// (people, cars, lights, doors, boxes, lifts) over a BroadcastChannel; whenever the buildings
// themselves change it sends the whole town (the save format), which followers rebuild from.
import { makePerson } from './people.js';
import { Vehicle } from './vehicles.js';
import { Truck, Mover } from './delivery.js';
import { newPose } from './stickman.js';
import { bubbleNow } from './social.js';

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('deskcity') : null;
export const send = (msg) => channel?.postMessage(msg);
export const listen = (fn) => channel?.addEventListener('message', (e) => fn(e.data));

// What changes the buildings themselves (the follower rebuilds when this changes).
export function structureKey(city) {
  return city.lots.map((b) => (b ? `${b.type}${b.tier}:${b.seed}:${b.build ? 1 : 0}${b.demolish ? 'd' : ''}:${b.upgrade?.next.seed ?? ''}:${b.L.items.filter((it) => it.ready).length}` : '-')).join('|') + `#${city.lots.length}`;
}

// ---------- leader: one frame ----------
function spotIndex(p) { // which of the building's spots (sleeping on the floor beside the bed counts as the bed's)
  if (!p.spot || !p.b) return -2;
  const spots = p.b.L.spots, i = spots.indexOf(p.spot);
  return i >= 0 || !p.spot.item ? i : spots.findIndex((s) => s.item === p.spot.item && s.act === p.spot.act);
}
const vehicleState = (v) => [v.kind, v.colors, v.name, v.x, v.y, v.dir, v.turnT, v.slope, v.odo, v.riders.map((r) => r.color), v.cargo, v.siren || false];
export function frame(city, now, info) {
  const lotOf = (b) => (b ? city.lots.indexOf(b) : -1);
  return {
    type: 'frame', now, districts: city.districts, info,
    people: city.people.map((p) => [
      p.id, p.seed, p.x, p.y, lotOf(p.b), p.f, p.dir, p.anim, p.phase, p.hip ? [p.hip.x, p.hip.y] : null,
      spotIndex(p), p.spot?.floor ? 1 : 0, p.carry?.size ?? null, p.tool, p.inCar || p.aboard ? 1 : 0, p.surface,
      p.kid ? 1 : 0, Math.round((p.depth || 0) * 10) / 10, p.sign || null, p.bag ? 1 : 0, p.sick ? 1 : 0,
      p.bubble ? [p.bubble.id, p.bubble.style, p.bubble.tokens, Math.round((bubbleNow() - p.bubble.t0) * 100) / 100, Math.round(p.bubble.dur * 10) / 10] : null,
    ]),
    cars: city.cars.map((c) => [c.id, c.kind, c.paint, c.park, c.target, c.owner, vehicleState(c.v)]),
    trucks: city.trucks.map((t) => [vehicleState(t.v), t.state, { ...t.driver, pose: undefined }, t.park]),
    movers: city.movers.map((m) => [vehicleState(m.v), m.park]),
    fleet: Object.values(city.fleet).filter(Boolean).map((f) => [f.kind, vehicleState(f.v), f.state, lotOf(f.b)]),
    pollution: city.pollution,
    vacant: [...new Set(city.vacant.map((v) => lotOf(v.b)))],
    lots: city.lots.map((b) => b && {
      boxes: b.boxes.map(({ item, room, size, outside, f, lx, opened, own, progress, carried }) => ({ item, room, size, outside, f, lx, opened, own, progress, carried })),
      progress: b.L.items.flatMap((it, i) => (it.progress ? [[i, it.progress]] : [])),
      light: b.L.rooms.flatMap((r) => (b.light.get(r) ? [r.id] : [])), dim: b.L.rooms.flatMap((r) => (b.light.get(r) === 'dim' ? [r.id] : [])), floorOn: b.floorOn,
      curtains: b.L.rooms.flatMap((r) => (b.curtains.get(r) ? [r.id] : [])),
      doors: b.L.doors.map((d) => [d.open, d.target]),
      elev: b.elevator && [b.elevator.pos, b.elevator.door, b.elevator.state, b.elevator.dir],
      orders: b.orders.map((o) => [o.p, o.item, o.state, b.L.spots.indexOf(o.seat)]),
      fire: b.fire && { ...b.fire }, alarm: b.alarm, scorch: b.scorch,
    }),
  };
}

// ---------- follower: apply a frame ----------
const fleet = new Map(); // vehicles we've built, by key, so their sprites aren't redrawn every frame
const poses = new Map(); // delivery drivers' poses
function vehicle(key, s) {
  const [kind, colors, name, x, y, dir, turnT, slope, odo, riders, cargo, siren] = s;
  let v = fleet.get(key);
  const same = v && v.kind === kind && ['body', 'cargo', 'stripe', 'ink'].every((k) => v.colors[k] === colors[k]);
  if (!same) { v = new Vehicle(kind, colors, name); fleet.set(key, v); }
  Object.assign(v, { x, y, dir, turnT, slope, odo, cargo, siren, riders: riders.map((color) => ({ color })) });
  v.path = turnT > 0 ? [{ x, y }] : []; // only "moving" matters for drawing (headlights)
  return v;
}

export function apply(city, m) {
  city.districts = Math.max(city.districts, m.districts);
  const lots = city.lots, byId = new Map(city.people.map((p) => [p.id, p]));
  city.people = m.people.map(([id, seed, x, y, lot, f, dir, anim, phase, hip, spot, floor, carry, tool, inCar, surface, kid, depth, sign, bag, sick, bubble]) => {
    const p = byId.get(id) ?? makePerson({ id, seed, jitter: 0, home: { lot: 0, unit: 0, bed: 0 }, kid });
    const b = lot >= 0 ? lots[lot] : null;
    Object.assign(p, { x, y, b, f, dir, anim, phase, tool, surface, inCar: inCar ? true : null, kid: !!kid, depth, sign, bag: !!bag, sick: sick ? {} : null });
    p.hip = hip ? { x: hip[0], y: hip[1] } : null;
    const s = spot >= 0 && b ? b.L.spots[spot] : null;
    p.spot = s ? (floor ? { ...s, floor: true } : s) : spot === -1 ? { floor: !!floor, item: null } : null;
    p.carry = carry ? { size: carry } : null;
    if (!bubble) p.bubble = null; // (the leader's clock isn't ours: keep the bubble's age, not its start)
    else if (p.bubble?.id !== bubble[0]) p.bubble = { id: bubble[0], style: bubble[1], tokens: bubble[2], t0: performance.now() / 1e3 - bubble[3], dur: bubble[4] };
    return p;
  });
  city.cars = m.cars.map(([id, kind, paint, park, target, owner, v]) => ({ id, kind, paint, park, target, owner, user: null, v: vehicle(`c${id}`, v) }));
  city.trucks = m.trucks.map(([v, state, driver, park], i) => Object.assign(Object.create(Truck.prototype), {
    v: vehicle(`t${i}`, v), state, park, driver: { ...driver, pose: poses.get(i) ?? poses.set(i, newPose()).get(i) }, // the driver's pose blends on here
  }));
  city.movers = m.movers.map(([v, park], i) => Object.assign(Object.create(Mover.prototype), { v: vehicle(`m${i}`, v), park }));
  city.vacant = m.vacant.filter((i) => lots[i]).map((i) => ({ b: lots[i] }));
  city.pollution = m.pollution || 0;
  city.fleet = { fire: null, police: null, ambulance: null };
  for (const [kind, v, state, lot] of m.fleet || []) city.fleet[kind] = { kind, v: vehicle(`f${kind}`, v), state, b: lots[lot] };
  m.lots.forEach((d, i) => {
    const b = lots[i];
    if (!b || !d) return;
    b.boxes = d.boxes;
    for (const it of b.progressed || b.L.items) it.progress = 0; // (only the pieces that were being put together last time)
    b.progressed = [];
    for (const [k, prog] of d.progress) if (b.L.items[k]) { b.L.items[k].progress = prog; b.progressed.push(b.L.items[k]); }
    b.light = new Map(d.light.map((id) => [b.L.rooms[id], (d.dim || []).includes(id) ? 'dim' : true]).filter(([r]) => r));
    b.floorOn = d.floorOn;
    b.curtains = new Map((d.curtains || []).map((id) => [b.L.rooms[id], true]).filter(([r]) => r));
    d.doors.forEach(([open, target], k) => { const door = b.L.doors[k]; if (door) { door.open = open; door.target = target; } });
    if (d.elev && b.elevator) [b.elevator.pos, b.elevator.door, b.elevator.state, b.elevator.dir] = d.elev;
    b.orders = (d.orders || []).map(([p, item, state, seat]) => ({ p, item, state, seat: b.L.spots[seat] })).filter((o) => o.seat);
    b.fire = d.fire || null; b.alarm = d.alarm || 0; b.scorch = d.scorch || null;
  });
}
