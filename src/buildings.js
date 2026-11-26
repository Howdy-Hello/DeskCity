// Buildings: what each type looks like at each size, how its floors are split into rooms,
// and how it is drawn in three layers:
//   1. exterior  - the outside walls, windows, door and roof (fades away while someone is inside)
//   2. interior  - rooms, floors, stairs, elevator shaft and furniture
//   3. details   - things on the walls, doorways, ceiling lamps, elevator doors and floor numbers
import { sprite, painter, addGrain, rng, pick, shade, textWidth, lineCells } from './draw.js';
import { drawScreen, TV_CHANNELS, PC_APPS } from './screens.js';
import { FURNITURE, ROOMS, FLATPACK, BOX, furnish, decorate, drawPiece, drawDetail } from './furniture.js';
import { drawBeams, drawFacadeLight } from './sunlight.js';
import { nightLevel } from './sky.js';
import { styleOf, windowRects, palette, paintFacade, paintDoor, paintRoof, ROOFS_H, roomLook, paintRoomWall, paintLamp, brickWall } from './styles.js';

export const FLOOR_H = 30; // one storey; a stick person is ~19 cells tall
export const LOT_W = 200;  // width of each building plot along the bottom of the screen
const WALL = 2;
const CORE_W = { stairs: 28, elevator: 16 };
const MIN_W = {
  bedroom: 32, kitchen: 37, living: 36, washroom: 30, study: 30, greenhouse: 32, gym: 34, balcony: 22,
  lobby: 30, desks: 60, boss: 40, hr: 34, common: 36, lounge: 36, meeting: 34, reception: 34, store: 60,
  diner: 70, restkitchen: 46, cafe: 56, pub: 64, classroom: 56, playground: 34, firebay: 66, bunks: 30, firelounge: 44,
  policefront: 40, cells: 40, precinct: 56, factoryfloor: 120, fitness: 60, er: 80, ward: 50,
};
// Rooms shared by everyone in the building (no household's): lobbies, the condo gym, and the shop,
// cafe or pub on the ground floor of a mixed-use block.
const SHARED = new Set(['lobby', 'fitness', 'store', 'cafe', 'pub', 'diner', 'restkitchen']);
export const isVenue = (r) => !!ROOMS[r.kind]?.venue;
const ROOF_H = { pitched: 18, flat: 5, tower: 14, sawtooth: 26, ...ROOFS_H };
const times = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const baseKind = (name) => name.split(':')[0];
const widthOf = (rooms) => rooms.reduce((s, n) => s + MIN_W[baseKind(n)], 0) + (rooms.length - 1) * WALL;
function shuffle(r, list) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; }

// ---------- homes: every household gets the essentials, then whatever extras fit ----------
// A second bedroom is a child's room (bed, homework desk, toy box) or a plain single for a roommate.
const EXTRAS = [['bedroom:spare', 0.6], ['living', 0.85], ['study', 0.35], ['gym', 0.07], ['greenhouse', 0.06]]; // (a family needs the child's room more than a living room)
function household(r, space, essentials, { extras = EXTRAS } = {}) {
  const rooms = [...essentials];
  for (let [name, chance] of extras) {
    if (name === 'bedroom:spare') name = r() < 0.55 ? 'bedroom:kids' : 'bedroom:single';
    if (r() < chance && widthOf([...rooms, name]) <= space) rooms.push(name);
  }
  return shuffle(r, rooms);
}
// Balconies hang off the outside wall. About 40% of renters call one a must-have, so ~40% of
// apartment and condo buildings have them, and then every flat in the building gets one.
const BALCONY_W = 20;

// ---------- offices: shared by several companies ----------
const SYLLABLES = ['NO', 'VA', 'ZEN', 'PIX', 'LU', 'MI', 'QUA', 'RO', 'SY', 'TEK', 'ARC', 'ION', 'VOX', 'BIT', 'KO', 'RA', 'FLO', 'NEX'];
const BRAND_COLORS = ['#2e86de', '#e67e22', '#27ae60', '#8e44ad', '#c0392b', '#16a085', '#d35400', '#2c3e50'];
function companyName(r) { let n = ''; while (n.length < 4) n += SYLLABLES[Math.floor(r() * SYLLABLES.length)]; return n.slice(0, 6); }

// A tower: lobby on the ground floor, ONE common floor (cafeteria + lounge) somewhere in the middle,
// shared washrooms on every third floor, and the rest split between 2-4 tenant companies (or one,
// for the city's headquarters). Each company has its own boss, HR and meeting rooms on its top floor,
// and a meeting room for roughly every 10-20 people (WeWork / Density planning ratios).
function officeTower(r, n, hq) {
  const common = 2 + Math.floor(r() * (n - 4));
  const floors = [['reception', 'washroom:office']], owner = [null];
  const rest = times(n - 1, (i) => i + 1).filter((f) => f !== common);
  const count = hq ? 1 : 2 + Math.floor(r() * 3);
  const sizes = times(count, () => 2);
  for (let k = rest.length - 2 * count; k > 0; k--) sizes[Math.floor(r() * count)]++;
  const companies = [];
  let at = 0;
  sizes.forEach((size, c) => {
    const mine = rest.slice(at, at + size); at += size;
    companies.push({ name: companyName(r), color: BRAND_COLORS[Math.floor(r() * BRAND_COLORS.length)], floors: mine });
    mine.forEach((f, i) => {
      const top = i === mine.length - 1;
      const loo = f % 3 === 1 ? ['washroom:office'] : [];
      floors[f] = top ? ['boss', 'hr', 'meeting', ...loo] : loo.length ? ['desks', ...loo] : r() < 0.45 ? ['desks', 'meeting'] : ['desks'];
      owner[f] = c;
    });
  });
  floors[common] = ['common', 'lounge']; owner[common] = null;
  return { floors, owner, companies };
}

// Mixed use: about half of new apartment and condo blocks put a shop, a cafe or a pub on the ground
// floor, with its own door, beside the residents' lobby.
function groundFloor(r) {
  if (r() >= 0.5) return ['lobby'];
  return [pick(r, ['store', 'cafe', 'cafe', 'pub']), 'lobby'];
}

// The catalogue. Each type grows through these tiers as the population grows.
// floors(r, space, opts) returns the room lists bottom to top; space = width available for rooms.
// units: 'whole' = one household per building, 'floor' = one household per floor.
export const TYPES = {
  home: [
    { name: 'Cottage', w: 164, roof: 'pitched', facade: 'siding', units: 'whole',
      floors: (r, sp) => [household(r, sp, ['kitchen', 'bedroom', 'washroom'], { extras: [['living', 0.7], ['study', 0.3], ['greenhouse', 0.06]] })] },
    { name: 'House', w: 176, roof: 'pitched', facade: 'siding', units: 'whole', n: 2, core: ['stairs'],
      floors: (r, sp) => [household(r, sp, ['kitchen'], { extras: [['living', 0.95], ['study', 0.3], ['gym', 0.07], ['greenhouse', 0.08]] }),
        household(r, sp, ['bedroom', 'washroom'], { extras: [['bedroom:spare', 0.65], ['study', 0.3], ['gym', 0.05]] })] },
    // (T.flats: how many floors of flats over the lobby; a design can change it, see styles.js.)
    { name: 'Apartments', w: 176, roof: 'flat', facade: 'brick', units: 'floor', n: 5, core: ['stairs'], balconies: 0.4,
      floors: (r, sp, o, T) => [groundFloor(r), ...times(T.flats ?? 4, () => household(r, sp, ['bedroom', 'kitchen', 'washroom']))] },
    { name: 'Condo Tower', w: 176, roof: 'tower', facade: 'panel', units: 'floor', sold: true, n: 11, core: ['elevator'], balconies: 0.4,
      floors: (r, sp, o, T) => { // about 4 in 10 give the floor above the lobby over to a gym for the residents
        const fl = [groundFloor(r), ...times(T.flats ?? 10, () => household(r, sp, ['bedroom', 'kitchen', 'washroom']))];
        if (r() < 0.4) fl[1] = ['fitness'];
        return fl;
      } },
    // The biggest town's homes: 15 floors of condos over a lobby, a gym floor, only where the screen is tall enough.
    { name: 'Residential Tower', w: 184, roof: 'tower', facade: 'panel', units: 'floor', sold: true, n: 16, core: ['elevator'], balconies: 0.5,
      floors: (r, sp, o, T) => { const fl = [groundFloor(r), ...times(T.flats ?? 15, () => household(r, sp, ['bedroom', 'kitchen', 'washroom']))]; fl[1] = ['fitness']; return fl; } },
  ],
  office: [
    { name: 'Small Office', w: 160, roof: 'flat', facade: 'stucco', companies: 1, floors: () => [['common', 'desks', 'washroom:office']] },
    { name: 'Office', w: 184, roof: 'flat', facade: 'stucco', core: ['stairs'], companies: 1, n: 3,
      floors: () => [['reception', 'common', 'washroom:office'], ['desks', 'meeting'], ['boss', 'hr', 'desks']] },
    { name: 'Office Tower', w: 192, roof: 'tower', facade: 'glass', core: ['elevator'], n: 12, floors: (r, sp, opts, T) => officeTower(r, T.n, opts.hq) },
  ],
  // Chapter 2. Each of these comes in one size.
  restaurant: [{ name: 'Restaurant', w: 184, roof: 'flat', facade: 'shop', signs: ['NOODLES', 'DUMPLINGS', 'HOTPOT', 'BISTRO', 'GRILL', 'PIZZA', 'TACOS', 'SUSHI', 'DINER'], floors: () => [['diner', 'restkitchen', 'washroom']] }],
  bar: [{ name: 'Pub', w: 150, roof: 'flat', facade: 'pub', signs: ['PUB', 'TAVERN', 'THE OWL', 'THE FOX', 'BAR'], floors: () => [['pub', 'washroom']] }],
  school: [{ name: 'School', w: 152, roof: 'flat', facade: 'school', core: ['stairs'], playground: 44, floors: () => [['classroom', 'washroom'], ['classroom', 'classroom']] }],
  fire: [{ name: 'Fire Station', w: 176, roof: 'flat', facade: 'firehouse', core: ['stairs'], floors: () => [['firebay', 'washroom'], ['firelounge', 'bunks']] }],
  police: [{ name: 'Police Station', w: 168, roof: 'flat', facade: 'police', core: ['stairs'], floors: () => [['policefront', 'cells'], ['precinct', 'washroom:office']] }],
  hospital: [{ name: 'Hospital', w: 184, roof: 'flat', facade: 'hospital', core: ['elevator'], floors: () => [['er', 'washroom'], ['ward', 'ward'], ['ward', 'ward']] }],
  factory: [{ name: 'Factory', w: 192, roof: 'sawtooth', facade: 'factory', floors: () => [['factoryfloor', 'washroom:office']] }],
  shop: [
    { name: 'Corner Store', w: 112, roof: 'flat', facade: 'shop', sign: 'SHOP', floors: () => [['store']] },
    { name: 'Supermarket', w: 192, roof: 'flat', facade: 'shop', sign: 'MARKET', floors: () => [['store']] },
  ],
};

// ---------- layout: rooms, furniture, details and spots ----------
// opts.plan: a saved room plan to rebuild exactly (so code changes never reshuffle an existing town).
// The size's own settings with its design's on top (opts.style, or the saved plan's).
export function typeOf(type, tier, style) { const S = styleOf(type, tier, style); return S?.facade ? { ...TYPES[type][tier], ...S, name: S.name } : TYPES[type][tier]; }
// How tall it stands, in cells, with its roof.
export const heightOf = (type, tier, style) => { const T = typeOf(type, tier, style); return (T.n ?? 1) * FLOOR_H + ROOF_H[T.roof]; };

export function layout(type, tier, seed, opts = {}) {
  const design = opts.plan ? opts.plan.style : opts.style, T = typeOf(type, tier, design), S = T === TYPES[type][tier] ? null : T;
  const r = rng(seed), rf = rng(seed ^ 0x5bd1e995); // r: the plan; rf: furniture
  const core = T.core || [];
  const coreW = core.reduce((s, k) => s + CORE_W[k], 0);
  const inner = T.w - 2 * WALL - (coreW ? coreW + WALL : 0);
  let plan = opts.plan ? JSON.parse(JSON.stringify(opts.plan)) : T.floors(r, inner, opts, T);
  if (Array.isArray(plan)) plan = { floors: plan, owner: [], companies: T.companies ? [{ name: companyName(r), color: BRAND_COLORS[Math.floor(r() * BRAND_COLORS.length)], floors: plan.map((_, f) => f) }] : [] };
  if (design && !opts.plan) plan.style = design;
  if (T.companies && !opts.plan) plan.owner = plan.floors.map(() => 0);
  // Office washrooms go at the far end of the floor from the stairs / lift (on the ground floor,
  // just past the entrance room). Applied to saved plans too, so existing offices get it.
  if (type === 'office') plan.floors = plan.floors.map((list, f) => {
    const loos = list.filter((n) => n.startsWith('washroom')), rest = list.filter((n) => !n.startsWith('washroom'));
    return f === 0 ? [...rest.slice(0, 1), ...loos, ...rest.slice(1)] : [...loos, ...rest];
  });
  if (plan.ox === undefined) plan.ox = T.playground || (T.balconies && r() < T.balconies ? BALCONY_W : 0); // room for balconies (or a playground) left of the walls
  if (plan.sign === undefined && T.signs) plan.sign = pick(r, T.signs);
  const n = plan.floors.length, roofH = ROOF_H[T.roof], H = n * FLOOR_H + roofH;
  const ox = plan.ox;
  const L = { T, S, seed, plan, w: T.w, ox, n, H, roofH, feet: (f) => H - 1 - f * FLOOR_H, rooms: [], items: [], details: [], spots: [], door: WALL + 7, companies: plan.companies, hq: !!opts.hq, sign: plan.sign || T.sign };

  // Older saves recorded their furniture by its position in the list; the lobbies now have different
  // furniture, so note how everything after each lobby moved (applied on loading, see city.js).
  let lobbyDetails = null;
  const oldShift = [];
  L.renumber = (i) => { let k = i; for (const [at, by] of oldShift) if (i >= at) k += by; return k; };
  L.lobbyRenumbered = !!opts.plan && !plan.lobbyV;
  plan.lobbyV = 2;
  plan.floors.forEach((list, f) => {
    const mins = list.map((name) => MIN_W[baseKind(name)]);
    const total = mins.reduce((a, b) => a + b, 0), avail = inner - (list.length - 1) * WALL;
    let x = WALL;
    list.forEach((name, i) => {
      const [kind, variant] = name.split(':');
      const w = i < list.length - 1 ? Math.floor((mins[i] / total) * avail) : WALL + inner - x;
      const unit = SHARED.has(kind) ? null : T.units === 'whole' ? 0 : T.units === 'floor' ? f : null;
      const room = { kind, variant, f, x, w, unit, id: L.rooms.length, company: plan.owner[f] ?? null, outdoor: !!ROOMS[kind].outdoor };
      L.rooms.push(room);
      let items = furnish(room, rf);
      if (kind === 'lobby' && !variant) { // the new lobbies (furnished from their own random numbers, so nothing else changes)
        const old = items.length, rl = rng(seed ^ 0x10bb1e5 ^ (f * 977 + i));
        decorate(room, items, rf); // (keeps the furniture random numbers in step with older versions)
        room.variant = core.includes('elevator') ? 'condo' : 'apt';
        items = furnish(room, rl);
        lobbyDetails = decorate(room, items, rl);
        oldShift.push([L.items.length - oldShift.reduce((a, [, by]) => a + by, 0) + old, items.length - old]); // [where it starts in the old list, by how much]
      }
      for (const it of items) {
        it.f = f; it.room = room.id;
        it.flatpack = type === 'home' && !!FLATPACK[it.kind]; // arrives in a box and must be assembled
        L.items.push(it);
        if (it.kind === 'tv') room.tv = it;
        for (const s of FURNITURE[it.kind].spots) L.spots.push({ ...s, x: it.x + s.dx, f, unit, room: room.id, item: it, company: room.company });
      }
      for (const d of lobbyDetails || decorate(room, items, rf)) { d.f = f; L.details.push(d); }
      lobbyDetails = null;
      x += w + WALL;
    });
    if (T.playground && f === 0) { // a school's playground, fenced in beside the building
      const room = { kind: 'playground', f, x: -ox, w: ox, unit: null, id: L.rooms.length, company: null, outdoor: true };
      L.rooms.push(room);
      for (const it of furnish(room, rf)) {
        Object.assign(it, { f, room: room.id, flatpack: false });
        L.items.push(it);
        for (const s of FURNITURE[it.kind].spots) L.spots.push({ ...s, x: it.x + s.dx, f, unit: null, room: room.id, item: it, company: null });
      }
    }
    if (ox && f > 0 && !T.playground) { // this floor's balcony, outside the left wall
      const room = { kind: 'balcony', f, x: -ox, w: ox, unit: f, id: L.rooms.length, company: null, outdoor: true };
      L.rooms.push(room);
      for (const it of furnish(room, rf)) {
        Object.assign(it, { f, room: room.id, flatpack: true });
        L.items.push(it);
        for (const s of FURNITURE[it.kind].spots) L.spots.push({ ...s, x: it.x + s.dx, f, unit: f, room: room.id, item: it, company: null });
      }
    }
    // Company name plaque on each floor a company rents.
    const c = plan.owner[f];
    if (c !== null && c !== undefined && plan.companies[c]) L.details.push({ kind: 'brand', x: WALL + 3, top: -27, f, text: plan.companies[c].name, color: plan.companies[c].color });
  });
  // The lobby directory: which company is on which floors.
  const lobby = L.rooms.find((rm) => rm.kind === 'reception');
  if (lobby && L.companies.length > 1) {
    L.details = L.details.filter((d) => !(d.f === 0 && d.kind === 'logo'));
    L.details.push({ kind: 'directory', x: lobby.x + 3, top: -27, f: 0, lines: L.companies.map((c) => `${c.floors[0]} ${c.name}`) }); // first floor + name
  }

  // A mixed-use block: the shop keeps the door on the left; the residents get their own door into the lobby.
  L.entrances = [L.door];
  const shopFront = type === 'home' && L.rooms.find((rm) => rm.f === 0 && isVenue(rm));
  if (shopFront) { const lobbyRoom = L.rooms.find((rm) => rm.f === 0 && rm.kind === 'lobby'); if (lobbyRoom) { L.door = lobbyRoom.x + 7; L.entrances = [L.door, WALL + 7]; L.shopFront = shopFront.id; } }
  L.glass = T.facade === 'glass' || !!T.glass;
  L.bay = L.rooms.find((rm) => rm.kind === 'firebay') || null;
  L.pal = S ? palette(L, seed) : null;

  let cx = T.w - WALL - coreW;
  if (core.includes('stairs')) { L.stairs = { x: cx, w: CORE_W.stairs }; cx += CORE_W.stairs; }
  if (core.includes('elevator')) L.elevator = { x: cx, w: CORE_W.elevator };

  // Doors in every doorway. The one into the stairwell / lift is the household's front door.
  L.doors = [];
  const style = type === 'home' ? 'wood' : 'glass';
  for (const room of L.rooms) if (!room.outdoor && room.x > WALL) L.doors.push({ f: room.f, x: room.x - WALL, style, open: 0, target: 0 });
  for (const room of L.rooms) if (room.outdoor) L.doors.push({ f: room.f, x: 0, style: 'glass', open: 0, target: 0 }); // balcony door in the outside wall
  if (coreW) for (let f = 0; f < n; f++) L.doors.push({ f, x: T.w - WALL - coreW - WALL, style: type === 'home' && f > 0 ? 'front' : style, open: 0, target: 0 });

  // Windows in the side walls, on every floor: into the end rooms and the stairwell (not a lift
  // shaft, and not where a balcony door already is). Shops have their shop front instead.
  L.sideWindows = [];
  if (type !== 'shop' && type !== 'restaurant') for (let f = 0; f < n; f++) {
    if (f === 0 && L.bay) continue; // the fire engine drives out through there
    const left = L.rooms.find((rm) => rm.f === f && rm.x === WALL && !rm.outdoor);
    if (left && !L.doors.some((d) => d.f === f && d.x === 0)) L.sideWindows.push({ f, side: -1, x: 0, area: { x: left.x, w: left.w } });
    const rx = T.w - WALL;
    if (L.elevator && L.elevator.x + L.elevator.w === rx) continue;
    if (L.stairs && L.stairs.x + L.stairs.w === rx) { L.sideWindows.push({ f, side: 1, x: rx, area: { x: L.stairs.x, w: L.stairs.w } }); continue; }
    const right = L.rooms.find((rm) => rm.f === f && rm.x + rm.w === rx && !rm.outdoor);
    if (right) L.sideWindows.push({ f, side: 1, x: rx, area: { x: right.x, w: right.w } });
  }
  // Each room's windows (lit at night, and drawn outside on buildings with a design).
  L.wins = new Map();
  for (const room of L.rooms) if (!room.outdoor && T.facade !== 'shop' && (L.glass || room.w >= 16)) L.wins.set(room.id, windowRects(L, room));
  return L;
}

// ---------- layer 2 + 3: the cut-away inside ----------
const STRUCT = '#cfc6b8', SLAB = '#8d8478', STAIR_BG = '#ddd6c9', SHAFT = '#4a4d52';

function bakeInterior(L, seed) {
  const cv = sprite(L.w + L.ox, L.H), p = painter(cv), r = rng(seed);
  p.ctx.translate(L.ox, 0); // balconies sit at negative x, left of the building
  const { w, H, roofH, n, feet } = L;
  p.rect(0, roofH, w, H - roofH, STRUCT);
  p.rect(0, roofH, WALL, H - roofH, shade(STRUCT, 0.85)); // outer walls
  p.rect(w - WALL, roofH, WALL, H - roofH, shade(STRUCT, 0.85));

  for (let f = 0; f < n; f++) {
    const y = feet(f);
    if (f > 0) p.rect(0, y + 1, w, 2, SLAB);
    for (const room of L.rooms.filter((rm) => rm.f === f)) {
      const R = ROOMS[room.kind], look = roomLook(L, room); // (the building's design decides its rooms' walls, floors and lights)
      if (room.outdoor) { openAir(p, room, y); continue; }
      if (look) paintRoomWall(p, room, y, look);
      else p.rect(room.x, y - 27, room.w, 28, R.wall);
      if (R.tiles) for (let k = y - 25; k < y; k += 4) p.rect(room.x, k, room.w, 1, shade(R.wall, 0.94));
      if (L.glass) glassWall(p, room, y);
      p.rect(room.x, y - 1, room.w, 2, look?.finish === 'panel' ? shade(look.wood, 0.7) : shade(look && look.finish !== 'brick' && look.finish !== 'concrete' ? look.wall : R.wall, 0.8)); // skirting board
      if (f > 0) p.rect(room.x, y + 1, room.w, 1, look?.floor || R.floor);
      if (room.x > WALL) doorway(p, room.x - WALL, y); // layer 3: doorway into the room on the left
      // ceiling lamp
      const mid = Math.round(room.x + room.w / 2);
      if (look && paintLamp(p, room, y, look)) continue;
      if (['desks', 'meeting', 'common', 'store', 'reception', 'hr', 'lounge', 'classroom', 'restkitchen', 'firebay', 'precinct', 'policefront', 'cells', 'factoryfloor', 'fitness', 'er', 'ward'].includes(room.kind)) p.rect(mid - 5, y - 27, 11, 1, '#fbfbe8');
      else if (room.kind === 'lobby' && room.variant === 'condo') { // a chandelier
        p.rect(mid, y - 27, 1, 3, '#c9a227'); p.rect(mid - 4, y - 24, 9, 1, '#c9a227');
        for (const k of [-4, -2, 0, 2, 4]) { p.rect(mid + k, y - 23, 1, 2, '#fff3c4'); }
      } else if (room.kind === 'lobby') for (const k of [room.x + Math.round(room.w / 3), room.x + Math.round(room.w * 2 / 3)]) { p.rect(k, y - 27, 1, 3, '#555'); p.rect(k - 2, y - 24, 5, 2, '#f1d38a'); } // pendant lamps
      else if (room.kind === 'pub' || room.kind === 'diner' || room.kind === 'cafe') for (let k = room.x + 8; k < room.x + room.w - 4; k += 16) { p.rect(k, y - 27, 1, 4, '#555'); p.rect(k - 1, y - 23, 3, 2, '#f5b041'); } // pendant lamps
      else { p.rect(mid, y - 27, 1, 2, '#555'); p.rect(mid - 2, y - 25, 5, 2, '#f1d38a'); }
    }
  }
  if (L.stairs) drawStairs(p, L);
  if (L.elevator) drawShaft(p, L);
  for (const sw of L.sideWindows) { // glass in the side walls
    const y = feet(sw.f);
    p.rect(sw.x, y - 21, WALL, 1, '#7d756b'); p.rect(sw.x, y - 20, WALL, 11, '#a9d6ea'); p.rect(sw.x, y - 15, WALL, 1, '#cfe7f2'); p.rect(sw.x, y - 9, WALL, 1, '#7d756b');
  }
  for (const d of L.details) if (!(L.glass && d.kind === 'window')) drawDetail(p, d, feet(d.f)); // glass offices: the whole back wall is window
  for (const it of L.items) if (it.ready !== false) drawPiece(p, it, feet(it.f)); // flat-packs appear once assembled
  drawRoof(p, L, r);
  addGrain(cv);
  return cv;
}

// Glass offices: from inside, the back wall is the same curtain wall as outside, floor-to-ceiling glass
// with mullions on the same 8-cell grid, a spandrel at the top and a sill at desk height.
function glassWall(p, room, y) {
  p.rect(room.x, y - 26, room.w, 22, '#cfe4ee');
  p.rect(room.x, y - 26, room.w, 4, '#b4d2e1'); // the reflective band, as outside
  for (let x = room.x; x < room.x + room.w; x++) if (x % 8 === 0) p.rect(x, y - 26, 1, 22, '#6f8494');
  p.rect(room.x, y - 27, room.w, 1, '#4d6b85'); p.rect(room.x, y - 4, room.w, 1, '#8d9aa5');
}

// A balcony: a slab sticking out of the outside wall, a bracket under it, a railing round it,
// and a glass door into the flat. Open to the sky (the desktop shows through).
function openAir(p, room, y) {
  const x = room.x, w = room.w;
  if (room.kind === 'playground') { // soft green ground and a low picket fence
    p.rect(x, y + 1, w, 2, '#6aa84f'); p.rect(x, y + 1, w, 1, '#8fce6f');
    p.rect(x, y - 5, w, 1, '#f5f2ec'); for (let k = x; k < x + w; k += 3) p.rect(k, y - 6, 1, 7, '#f5f2ec');
    p.rect(0, y - 22, WALL, 23, '#8c939a'); p.rect(0, y - 21, WALL, 21, '#bfe3f5');
    return;
  }
  p.rect(x, y + 1, w, 2, '#9a9a9a'); p.rect(x, y + 1, w, 1, '#b5b5b5');
  p.line(x + w - 1, y + 7, x + w - 8, y + 3, '#7d756b'); // bracket
  p.rect(x, y - 8, w, 1, '#6f767d'); p.rect(x, y - 8, 1, 9, '#6f767d');
  for (let k = x + 3; k < x + w; k += 3) p.rect(k, y - 7, 1, 8, '#8c939a');
  p.rect(0, y - 22, WALL, 23, '#8c939a'); p.rect(0, y - 21, WALL, 21, '#bfe3f5'); // glass door frame
}

export function drawBox(ctx, x, y, size, opened = false) { // a cardboard box, standing on row y
  const [w, h] = BOX[size];
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = '#9b7a4a'; ctx.fillRect(x, y - h + 1, w, h);
  ctx.fillStyle = '#c8a06a'; ctx.fillRect(x, y - h + 1, w - 1, h - 1);
  if (opened) { // flaps folded out to the sides
    ctx.fillStyle = '#b8905a'; ctx.fillRect(x - 2, y - h - 1, 2, 1); ctx.fillRect(x - 1, y - h, 1, 1); ctx.fillRect(x + w, y - h - 1, 2, 1); ctx.fillRect(x + w, y - h, 1, 1);
    ctx.fillStyle = '#5a4428'; ctx.fillRect(x + 1, y - h + 1, w - 2, 1); // the dark inside
  } else { ctx.fillStyle = '#e8d5a8'; ctx.fillRect(x + Math.floor(w / 2) - 1, y - h + 1, 2, h - 1); } // packing tape
}

// Boxes waiting to be carried stand in neat stacks: one stack every STACK cells, at most 3 high,
// biggest at the bottom, each centred on the one below.
const STACK = 11, STACK_MAX = 3, SIZE_ORDER = { l: 0, m: 1, s: 2 };
export function drawStacks(ctx, boxes, X, feetY) {
  const stacks = new Map();
  for (const b of boxes) {
    if (b.carried || b.opened) continue;
    const key = `${b.outside ? 1 : 0}:${b.f}:${b.lx}`;
    (stacks.get(key) ?? stacks.set(key, []).get(key)).push(b);
  }
  for (const list of stacks.values()) {
    list.sort((a, c) => SIZE_ORDER[a.size] - SIZE_ORDER[c.size]);
    let y = feetY(list[0]);
    for (const b of list) {
      const [w, h] = BOX[b.size];
      drawBox(ctx, X + b.lx + Math.floor((STACK - 1 - w) / 2), y, b.size);
      y -= h;
    }
  }
}

// What putting something together looks like at each stage of the job (progress 0..1).
// Flat-packs: cut the tape, lay out the parts, read the instructions, screw (and hammer) them
// together, stand the piece up, fold the cardboard. Own furniture: unwrap, push into place, adjust.
// Moving boxes: open, take things out and put them away, fold the box flat.
// Your own furniture is set down a little way off (unwrapped there), then pushed along the floor into
// its place. How far it is from its place (in cells; 0 once it's there) and which way it's pushed.
export function pushOffset(L, it, prog) {
  const room = L.rooms[it.room], spaceL = it.x - room.x - 6, spaceR = room.x + room.w - (it.x + it.w) - 6;
  const side = spaceL >= spaceR ? 1 : -1, D = Math.max(0, Math.min(14, Math.max(spaceL, spaceR)));
  const k = prog < 0.3 ? 1 : prog < 0.8 ? 1 - (prog - 0.3) / 0.5 : 0;
  return { dx: -side * Math.round(D * k), side };
}
export function buildStage(hasItem, own, prog) {
  if (!hasItem) return prog < 0.12 ? 'open' : prog < 0.9 ? 'unpackBox' : 'fold';
  if (own) return prog < 0.3 ? 'unwrap' : prog < 0.8 ? 'push' : 'adjust';
  return prog < 0.08 ? 'open' : prog < 0.2 ? 'layout' : prog < 0.32 ? 'read' : prog < 0.8 ? 'screw' : prog < 0.92 ? 'raise' : 'fold';
}

function doorway(p, x, y) {
  p.rect(x, y - 21, WALL, 22, '#e6dece');
  p.rect(x, y - 22, WALL, 1, '#6e4423');
}

// Stairs: a switchback stairwell. Between two floors there are two gentle flights (5 steps of
// 4 wide x 3 high): up to the right to a half landing, then back up to the left.
const STAIR_WALL = '#e6dfd2', CONCRETE = '#8e8577', TREAD = '#c9a77c', NOSE = '#7a5a3a', RAIL = '#6e4423';
export function stairPath(L, f, up) { // points (local x, local feet row) from floor f to f+1, or back down
  const x = L.stairs.x, y = L.feet(f);
  const pts = [[x + 4, y], [x + 24, y - 15], [x + 26, y - 15], [x + 24, y - 15], [x + 4, y - 30]];
  return up ? pts : pts.reverse();
}

function flight(p, x0, y0, dir) { // 5 solid steps rising 15 rows over 20 columns, from (x0, y0)
  for (let c = 0; c < 20; c++) {
    const top = Math.round(y0 + 1 - (15 * (4 * Math.floor(c / 4) + 2)) / 20); // step surface
    const under = Math.round(y0 + 4 - (15 * c) / 20); // the flight's sloped underside
    const x = dir > 0 ? x0 + c : x0 - 1 - c;
    p.rect(x, top, 1, Math.max(1, under - top + 1), CONCRETE);
    p.px(x, top, c % 4 === (dir > 0 ? 0 : 3) ? NOSE : TREAD); // step surface with a darker nosing
  }
  p.line(x0, y0 - 7, x0 + dir * 20, y0 - 22, RAIL); // handrail
  p.rect(x0, y0 - 7, 1, 8, RAIL); p.rect(x0 + dir * 20, y0 - 22, 1, 8, RAIL);
}

function drawStairs(p, L) {
  const { x, w } = L.stairs, { n, feet } = L, topY = feet(n - 1) - 27;
  p.rect(x, topY, w, feet(0) - topY + 1, STAIR_WALL); // one continuous stairwell, no floors cutting across
  for (let f = 0; f < n; f++) {
    const y = feet(f);
    p.rect(x, y - 27, w, 1, shade(STAIR_WALL, 0.93));
    if (f > 0) { p.rect(x, y + 1, 5, 2, CONCRETE); p.rect(x, y + 1, 5, 1, TREAD); } // floor landing
    doorway(p, x - WALL, y);
  }
  for (let f = 0; f < n - 1; f++) {
    const y = feet(f);
    flight(p, x + 4, y, 1);
    p.rect(x + 24, y - 14, 4, 1, TREAD); p.rect(x + 24, y - 13, 4, 2, CONCRETE); // half landing
    flight(p, x + 24, y - 15, -1);
  }
  const ty = feet(n - 1); // guard rail around the stair opening on the top floor
  p.rect(x + 5, ty - 7, w - 5, 1, RAIL);
  for (let k = x + 6; k < x + w; k += 3) p.rect(k, ty - 6, 1, 7, RAIL);
}

function drawShaft(p, L) {
  const { x } = L.elevator, { n, feet, roofH, H } = L;
  p.rect(x, roofH + 2, 16, H - roofH - 2, SHAFT);
  p.rect(x, roofH + 2, 1, H - roofH - 2, '#6d7177'); p.rect(x + 15, roofH + 2, 1, H - roofH - 2, '#6d7177');
  for (let f = 0; f < n; f++) {
    const y = feet(f), label = f === 0 ? 'G' : String(f);
    if (x > WALL) doorway(p, x - WALL, y);
    p.frame(x, y - 22, 16, 23, '#8c939a');
    p.rect(x + 1, y - 27, 14, 5, '#2b2b2b');
    p.text(label, x + 8 - textWidth(label) / 2, y - 27, '#ff9f43'); // floor number
    if (f > 0) p.rect(x, y + 1, 16, 1, '#8c939a');
  }
}

// ---------- layer 1: the outside ----------
// Outside looks. Each building picks its colours and extras from its own seed, so neighbours differ
// but a building always looks the same. (Buildings with a design are drawn by styles.js.)
const FACADE = {
  siding(p, L, r) {
    const c = pick(r, ['#e9d8b4', '#cfe0e8', '#e8c9b9', '#d6e3c3', '#f0e6d0', '#c9d3e6', '#f2d7a6', '#dcc7e0', '#e0e0d8']);
    p.rect(0, L.roofH, L.w, L.H - L.roofH, c);
    if (r() < 0.6) for (let y = L.roofH + 2; y < L.H; y += 3) p.rect(0, y, L.w, 1, shade(c, 0.9)); // lap siding
    else for (let x = 3; x < L.w; x += 5) p.rect(x, L.roofH, 1, L.H - L.roofH, shade(c, 0.9));  // board and batten
    const trim = pick(r, ['#f5f2ec', '#5b4636', '#3d4f61']);
    p.rect(0, L.roofH, 2, L.H - L.roofH, trim); p.rect(L.w - 2, L.roofH, 2, L.H - L.roofH, trim); // corner boards
  },
  brick(p, L, r) {
    const [c, m] = pick(r, [['#b5543b', '#d8c4b0'], ['#8a5a44', '#cdbba6'], ['#c9a27a', '#efe2cc'], ['#8d8f94', '#d5d6d8'], ['#d9c9a8', '#f3ead8']]);
    brickWall(p, 0, L.roofH, L.w, L.H - L.roofH, c, m);
    for (let f = 1; f < L.n; f++) { p.rect(0, L.feet(f) + 1, L.w, 2, shade(m, 0.92)); p.rect(0, L.feet(f) + 3, L.w, 1, shade(c, 0.7)); } // a stone band at each floor, with its shadow
    p.rect(0, L.roofH, 2, L.H - L.roofH, shade(c, 0.85)); p.rect(L.w - 2, L.roofH, 2, L.H - L.roofH, shade(c, 0.85)); // the corners
  },
  stucco(p, L, r) {
    const c = pick(r, ['#e3d7c3', '#d7dde3', '#e8d0c0', '#d8e3d0']);
    p.rect(0, L.roofH, L.w, L.H - L.roofH, c);
    for (let f = 1; f < L.n; f++) p.rect(0, L.feet(f) + 1, L.w, 2, shade(c, 0.85));
  },
  panel(p, L, r) {
    const [c, band] = pick(r, [['#eceae4', '#9aa0a6'], ['#e2e6ea', '#5d6d7e'], ['#efe4d2', '#a1887f'], ['#e8eee8', '#6b8f71']]);
    p.rect(0, L.roofH, L.w, L.H - L.roofH, c);
    for (let f = 1; f < L.n; f++) { p.rect(0, L.feet(f) + 1, L.w, 2, band); p.rect(4, L.feet(f) - 6, L.w - 8, 1, shade(band, 0.8)); }
  },
  glass(p, L, r) {
    const [c, m] = pick(r, [['#7fa6c4', '#4d6b85'], ['#6f8fa8', '#2f3e4d'], ['#8fb5b0', '#3e6660']]);
    p.rect(0, L.roofH, L.w, L.H - L.roofH, c);
    for (let x = 0; x < L.w; x += 8) p.rect(x, L.roofH, 1, L.H - L.roofH, m);
    for (let f = 0; f < L.n; f++) { p.rect(0, L.feet(f) - 27, L.w, 1, m); p.rect(2, L.feet(f) - 24, L.w - 4, 3, shade(c, 1.2)); }
  },
  shop(p, L, r) { p.rect(0, L.roofH, L.w, L.H - L.roofH, pick(r, ['#e4ddd0', '#d8e4e0', '#efe0c8'])); },
};

function bakeExterior(L, seed) {
  const cv = sprite(L.w + L.ox, L.H), p = painter(cv), r = rng(seed + 7), T = L.T;
  p.ctx.translate(L.ox, 0);
  if (L.S) { // a building with a design: walls, windows and door from styles.js
    paintFacade(p, L, r);
    for (const room of L.rooms) if (room.outdoor) openAir(p, room, L.feet(room.f));
    if (L.shopFront != null) storefront(p, L.rooms[L.shopFront], L.feet(0), r);
    paintDoor(p, L, L.feet(0));
    drawRoof(p, L, rng(seed));
    addGrain(cv);
    return cv;
  }
  FACADE[T.facade]?.(p, L, r);
  const curtain = pick(r, ['#c0504d', '#4f81bd', '#7aa63f', '#e8833a', '#8064a2']);
  const frame = pick(r, ['#f5f2ec', '#f5f2ec', '#3d4f61', '#6e4423']);
  const shutters = T.facade === 'siding' && r() < 0.45 && pick(r, ['#2c5f2d', '#1f3a5f', '#7b2d26', '#3d3d3d', '#6b8e9e']);
  const flowers = T.facade !== 'stucco' && r() < 0.35;

  if (T.facade !== 'glass' && !EXTRA_FACADE[T.facade]) {
    for (const room of L.rooms) {
      if (T.facade === 'shop' || room.w < 16 || room.outdoor || ROOMS[room.kind].noWindow || (room.f === 0 && isVenue(room))) continue;
      const y = L.feet(room.f), x = Math.round(room.x + room.w / 2 - 5);
      if (T.facade === 'brick') { p.rect(x - 2, y - 23, 14, 2, '#d9cfc0'); p.rect(x + 4, y - 24, 3, 3, '#e6ddd0'); p.rect(x - 2, y - 21, 14, 1, 'rgba(0,0,0,0.15)'); } // a stone lintel with a keystone
      p.rect(x - 1, y - 21, 12, 12, frame); p.rect(x, y - 20, 10, 10, '#8fb8cf'); p.rect(x, y - 20, 10, 3, '#b5d6e6');
      p.rect(x + 5, y - 20, 1, 10, frame); p.rect(x - 2, y - 9, 14, 1, shade(frame, 0.8));
      p.rect(x, y - 20, 2, 7, curtain); p.rect(x + 8, y - 20, 2, 7, curtain);
      if (shutters) { p.rect(x - 5, y - 21, 3, 12, shutters); p.rect(x + 12, y - 21, 3, 12, shutters); }
      if (flowers) { // a window box of flowers
        p.rect(x - 1, y - 8, 12, 2, '#8b5a2b');
        for (let k = 0; k < 12; k += 2) p.px(x - 1 + k, y - 9, pick(r, ['#e74c3c', '#f1c40f', '#ff7eb6', '#ffffff', '#9b59b6']));
      }
    }
    if (L.stairs) for (let f = 0; f < L.n; f++) p.rect(L.stairs.x + 9, L.feet(f) - 22, 5, 12, '#8fb8cf');
  }

  for (const room of L.rooms) if (room.outdoor) openAir(p, room, L.feet(room.f));
  const gy = L.feet(0), d = L.door;
  const front = L.shopFront != null && L.rooms[L.shopFront];
  if (front) storefront(p, front, gy, r); // the shop, cafe or pub at the bottom of a block of flats
  if (EXTRA_FACADE[T.facade]) EXTRA_FACADE[T.facade](p, L, r, gy, d);
  else if (T.facade === 'shop') {
    p.rect(d + 6, gy - 17, L.w - d - 10, 15, '#bfe0ef'); p.rect(d + 6, gy - 17, L.w - d - 10, 1, '#555');
    for (let x = d + 10; x < L.w - 6; x += 9) p.line(x, gy - 15, x + 4, gy - 11, '#e8f5fb'); // reflections
    const stripe = L.T.signs ? pick(r, ['#2e8b57', '#d9534f', '#2c6fb3', '#e67e22']) : '#d9534f';
    for (let x = 0; x < L.w; x += 4) p.rect(x, gy - 22, 4, 4, (x / 4) % 2 ? '#ffffff' : stripe); // awning
    const sign = L.sign, sw = textWidth(sign) + 6, sx = Math.round(L.w / 2 - sw / 2);
    p.rect(sx, gy - 28, sw, 7, '#2c3e50'); p.text(sign, sx + 3, gy - 27, '#f1c40f');
    p.rect(d - 4, gy - 18, 9, 19, '#bfe0ef'); p.frame(d - 4, gy - 18, 9, 19, '#555');
  } else if (front) {
    // (the residents' door, into the lobby, is drawn below)
    const door = pick(r, ['#3d4f61', '#2c3e50', '#5b2c2c']);
    p.rect(d - 4, gy - 20, 9, 21, door); p.frame(d - 4, gy - 20, 9, 21, '#e8e2d6'); p.px(d + 2, gy - 9, '#f1c40f');
    p.rect(d - 7, gy - 23, 15, 2, pick(r, ['#2c3e50', '#7b2d26', '#2c5f2d']));
  } else if (T.facade === 'glass' || T.facade === 'stucco') {
    p.rect(d - 5, gy - 20, 11, 21, '#bfe0ef'); p.frame(d - 5, gy - 20, 11, 21, '#3d4f61'); p.rect(d, gy - 20, 1, 21, '#3d4f61');
    p.rect(d - 7, gy - 22, 15, 2, '#3d4f61');
  } else {
    const door = T.facade === 'brick' ? pick(r, ['#3d4f61', '#2c3e50', '#5b2c2c']) : pick(r, ['#7a4a2a', '#b03a2e', '#1f3a5f', '#2c5f2d', '#d4a017', '#5b4636']);
    p.rect(d - 4, gy - 20, 9, 21, door); p.frame(d - 4, gy - 20, 9, 21, frame === '#f5f2ec' ? '#f5f2ec' : '#e8e2d6');
    p.px(d + 2, gy - 9, '#f1c40f');
    if (T.facade === 'brick') p.rect(d - 7, gy - 23, 15, 2, pick(r, ['#2c3e50', '#7b2d26', '#2c5f2d'])); // entrance canopy
    else if (r() < 0.4) { // a little porch roof over the door
      const c = pick(r, ['#8e3b2f', '#4d5b6a', '#6b4a3a']);
      p.rect(d - 8, gy - 24, 17, 2, c); p.rect(d - 7, gy - 22, 1, 22, '#f5f2ec'); p.rect(d + 7, gy - 22, 1, 22, '#f5f2ec');
    } else p.rect(d + 6, gy - 17, 1, 2, '#f1c40f'); // porch light
  }
  drawRoof(p, L, rng(seed));
  addGrain(cv);
  return cv;
}

// A shop front on the ground floor of a block of flats: a glass window, an awning and a sign, with its own door.
function storefront(p, room, gy, r) {
  const R = ROOMS[room.kind], x0 = room.x + 1, w = room.w - 2;
  const [sign, bg, ink, stripe] = room.kind === 'store' ? ['MART', '#2c3e50', '#f1c40f', '#d9534f'] : room.kind === 'pub' ? ['BAR', '#3b2416', '#f5b041', '#5b3a29'] : ['CAFE', '#4a2c1d', '#f5e6c8', '#2e8b57'];
  p.rect(x0, gy - 29, w, 30, room.kind === 'pub' ? '#4a2a18' : shade(R.wall, 0.92));
  p.rect(x0 + 12, gy - 18, w - 14, 16, '#bfe0ef'); p.rect(x0 + 12, gy - 18, w - 14, 1, '#555');
  for (let x = x0 + 16; x < x0 + w - 4; x += 9) p.line(x, gy - 16, x + 4, gy - 12, '#e8f5fb');
  p.rect(x0 + 1, gy - 19, 10, 20, '#bfe0ef'); p.frame(x0 + 1, gy - 19, 10, 20, '#555'); // its door
  for (let x = x0; x < x0 + w; x += 4) p.rect(x, gy - 23, Math.min(4, x0 + w - x), 3, (x / 4) % 2 ? '#ffffff' : stripe);
  const sw = textWidth(sign) + 6, sx = Math.round(x0 + w / 2 - sw / 2);
  p.rect(sx, gy - 30, sw, 7, bg); p.text(sign, sx + 3, gy - 29, ink);
}

// Outsides for the Chapter 2 buildings.
const EXTRA_FACADE = {
  pub(p, L, r, gy, d) { // dark wood, small-paned windows, a hanging sign
    const wood = pick(r, ['#3b2416', '#2c3e2e', '#4a1c1c']);
    p.rect(0, L.roofH, L.w, L.H - L.roofH, wood);
    for (let x = 0; x < L.w; x += 6) p.rect(x, L.roofH, 1, L.H - L.roofH, shade(wood, 0.8));
    for (let x = d + 10; x + 20 < L.w; x += 26) { p.rect(x, gy - 19, 20, 12, '#f5cba7'); for (let k = 0; k < 20; k += 5) p.rect(x + k, gy - 19, 1, 12, '#3b2416'); p.rect(x, gy - 14, 20, 1, '#3b2416'); }
    p.rect(d - 4, gy - 20, 9, 21, '#6e2c00'); p.frame(d - 4, gy - 20, 9, 21, '#d4ac0d'); p.px(d + 2, gy - 9, '#d4ac0d');
    const sign = L.sign, sw = textWidth(sign) + 6, sx = Math.round(L.w / 2 - sw / 2);
    p.rect(sx, gy - 29, sw, 7, '#1e1e22'); p.frame(sx, gy - 29, sw, 7, '#d4ac0d'); p.text(sign, sx + 3, gy - 28, '#f5b041');
  },
  school(p, L, r, gy, d) { // red brick, big classroom windows, the school's name over the door
    FACADE.brick(p, L, rng(L.T.w));
    for (const room of L.rooms) {
      if (room.outdoor || room.kind !== 'classroom') continue;
      const y = L.feet(room.f);
      for (let x = room.x + 6; x + 10 < room.x + room.w; x += 14) { p.rect(x - 1, y - 21, 12, 13, '#f5f2ec'); p.rect(x, y - 20, 10, 11, '#8fb8cf'); p.rect(x, y - 15, 10, 1, '#f5f2ec'); }
    }
    p.rect(d - 5, gy - 20, 11, 21, '#2e86c1'); p.frame(d - 5, gy - 20, 11, 21, '#f5f2ec'); p.rect(d, gy - 20, 1, 21, '#f5f2ec');
    const sx = d + 10; p.rect(sx, gy - 29, textWidth('SCHOOL') + 6, 7, '#f5f2ec'); p.text('SCHOOL', sx + 3, gy - 28, '#c0392b');
    p.rect(L.w - 34, L.roofH - 1, 8, 2, '#7d756b'); p.rect(L.w - 32, L.roofH - 6, 4, 5, '#d4ac0d'); // the bell
  },
  firehouse(p, L, r, gy) { // red brick, a big roll-up door over the engine bay, FIRE in gold
    const c = '#a93226';
    brickWall(p, 0, L.roofH, L.w, L.H - L.roofH, c, '#d5c4b5');
    for (let f = 1; f < L.n; f++) p.rect(0, L.feet(f) + 1, L.w, 2, '#f5f2ec');
    const bay = L.bay;
    if (bay) { p.rect(bay.x + 3, gy - 23, bay.w - 6, 24, '#f5f2ec'); for (let y = gy - 21; y <= gy; y += 3) p.rect(bay.x + 5, y, bay.w - 10, 2, '#d5d8dc'); p.rect(bay.x + 5, gy - 22, bay.w - 10, 1, '#7d858c'); }
    for (const room of L.rooms) if (room.f > 0) { const y = L.feet(room.f), x = Math.round(room.x + room.w / 2 - 5); p.rect(x - 1, y - 21, 12, 12, '#f5f2ec'); p.rect(x, y - 20, 10, 10, '#8fb8cf'); p.rect(x + 5, y - 20, 1, 10, '#f5f2ec'); }
    const tw = textWidth('FIRE STATION') + 6, sx = Math.round((bay ? bay.x + bay.w / 2 : L.w / 2) - tw / 2);
    p.rect(sx, gy - 31, tw, 7, '#f5f2ec'); p.frame(sx, gy - 31, tw, 7, '#7b241c'); p.text('FIRE STATION', sx + 3, gy - 30, '#c0392b');
    const dx = bay ? bay.x + bay.w + 6 : L.door; p.rect(dx, gy - 20, 9, 21, '#5b2c2c'); p.frame(dx, gy - 20, 9, 21, '#f5f2ec'); // the crew's door
  },
  police(p, L, r, gy, d) { // pale stone, a blue lamp, POLICE over the door
    FACADE.stucco(p, L, rng(L.T.w + 3));
    for (const room of L.rooms) { if (room.kind === 'cells') continue; const y = L.feet(room.f), x = Math.round(room.x + room.w / 2 - 5); p.rect(x - 1, y - 21, 12, 12, '#2c3e50'); p.rect(x, y - 20, 10, 10, '#8fb8cf'); p.rect(x + 5, y - 20, 1, 10, '#2c3e50'); }
    const cells = L.rooms.find((rm) => rm.kind === 'cells');
    if (cells) for (let x = cells.x + 8; x + 6 < cells.x + cells.w; x += 18) { p.rect(x, gy - 22, 6, 4, '#2c3e50'); for (let k = 1; k < 6; k += 2) p.rect(x + k, gy - 22, 1, 4, '#7d858c'); } // barred slits
    p.rect(d - 5, gy - 20, 11, 21, '#1f3a5f'); p.frame(d - 5, gy - 20, 11, 21, '#d5d8dc'); p.rect(d, gy - 20, 1, 21, '#d5d8dc');
    p.rect(d - 1, gy - 26, 3, 4, '#2e86de'); p.rect(d - 2, gy - 22, 5, 1, '#1e1e22'); // the blue lamp
    const sx = d + 9; p.rect(sx, gy - 29, textWidth('POLICE') + 6, 7, '#1f3a5f'); p.text('POLICE', sx + 3, gy - 28, '#ffffff');
  },
  hospital(p, L, r, gy, d) { // white panels, a band of windows on every floor, a red cross, HOSPITAL over the entrance
    p.rect(0, L.roofH, L.w, L.H - L.roofH, '#eef2f4');
    for (let f = 0; f < L.n; f++) { const y = L.feet(f); p.rect(0, y + 1, L.w, 2, '#5dade2'); if (f > 0) for (let x = 6; x + 10 < L.w - (L.elevator ? 18 : 0); x += 14) { p.rect(x, y - 20, 10, 10, '#8fb8cf'); p.rect(x, y - 20, 10, 3, '#b5d6e6'); } }
    p.rect(d - 6, gy - 20, 13, 21, '#bfe0ef'); p.frame(d - 6, gy - 20, 13, 21, '#5d6d7e'); p.rect(d, gy - 20, 1, 21, '#5d6d7e'); // sliding doors
    p.rect(d - 9, gy - 23, 19, 2, '#c0392b');
    const sx = d + 12; p.rect(sx, gy - 20, textWidth('HOSPITAL') + 6, 7, '#ffffff'); p.frame(sx, gy - 20, textWidth('HOSPITAL') + 6, 7, '#c0392b'); p.text('HOSPITAL', sx + 3, gy - 19, '#c0392b');
    const cx = L.w - (L.elevator ? 30 : 14); p.rect(cx, L.roofH + 3, 10, 10, '#ffffff'); p.rect(cx + 4, L.roofH + 4, 2, 8, '#c0392b'); p.rect(cx + 1, L.roofH + 7, 8, 2, '#c0392b');
  },
  factory(p, L, r, gy, d) { // corrugated metal, a strip of high windows, a loading door
    const c = pick(r, ['#8a9a8b', '#9aa3ad', '#a89f8e']);
    p.rect(0, L.roofH, L.w, L.H - L.roofH, c);
    for (let x = 0; x < L.w; x += 2) p.rect(x, L.roofH, 1, L.H - L.roofH, shade(c, 0.9));
    p.rect(2, gy - 26, L.w - 4, 5, '#6e7f8d'); for (let x = 4; x < L.w - 4; x += 8) p.rect(x, gy - 25, 6, 3, '#9cc3d5');
    p.rect(L.w - 46, gy - 18, 30, 19, '#5d6d7e'); for (let y = gy - 16; y <= gy; y += 3) p.rect(L.w - 44, y, 26, 1, '#4a5866'); // loading door
    for (let k = 0; k < 30; k += 4) p.rect(L.w - 46 + k, gy - 19, 2, 1, '#f1c40f');
    p.rect(d - 4, gy - 20, 9, 21, '#34495e'); p.frame(d - 4, gy - 20, 9, 21, '#f1c40f');
    const name = L.companies?.[0]?.name || 'WORKS', sx = d + 10; p.rect(sx, gy - 19, textWidth(name) + 6, 7, '#2c3e50'); p.text(name, sx + 3, gy - 18, '#f1c40f');
  },
};

function drawRoof(p, L, r) {
  const { w, roofH } = L, kind = L.T.roof;
  if (ROOFS_H[kind] && kind !== 'steep') return paintRoof(p, L, r); // the designs' roofs (a steep roof is a taller pitched one)
  if (kind === 'sawtooth') { // a factory's sawtooth roof and two tall chimneys
    const base = roofH - 1;
    for (let x = 0; x < w; x++) { const k = x % 24, h = Math.round(k < 18 ? (k / 18) * 8 : 8 - ((k - 18) / 6) * 8); p.rect(x, base - h, 1, h + 1, k < 18 ? '#7d858c' : '#bcd6e3'); }
    p.rect(0, base - 1, w, 2, '#5d6d7e');
    for (const cx of [Math.round(w * 0.22), Math.round(w * 0.62)]) {
      p.rect(cx, 0, 7, base, '#8e4a3a'); p.rect(cx, 0, 7, 1, '#5b2c22');
      for (const y of [3, 6]) p.rect(cx, y, 7, 1, '#f5f2ec'); // red and white bands
      p.rect(cx + 7, 4, 1, base - 4, '#6b3a2e');
    }
    return;
  }
  if (kind === 'pitched' || kind === 'steep') {
    const shingle = L.pal?.roof || pick(r, ['#8e3b2f', '#4d5b6a', '#6b4a3a', '#3f6b4f', '#5b3f66', '#3b4a5a', '#7a5c3a']);
    const cx = Math.round(w * (r() < 0.5 ? 0.28 : 0.68)); // chimney on the left or the right
    p.rect(cx, 3, 6, roofH, pick(r, ['#9c4a35', '#7d756b', '#b0705a'])); p.rect(cx - 1, 2, 8, 2, '#6f6f6f');
    for (let i = 0; i < roofH + 2; i++) {
      const half = Math.round((w / 2) * ((i + 2) / (roofH + 2)));
      p.rect(w / 2 - half, i, half * 2, 1, (i >> 1) % 2 ? shingle : shade(shingle, 1.12));
    }
    p.rect(w / 2 - 3, 0, 6, 1, shade(shingle, 0.7)); // ridge cap
    if (r() < 0.35) { // a dormer window
      const dx = Math.round(w / 2 + (cx < w / 2 ? 10 : -22));
      p.rect(dx, 7, 12, 9, shade(shingle, 0.85)); p.rect(dx + 3, 10, 6, 5, '#bfe3f5'); p.rect(dx - 1, 6, 14, 1, shade(shingle, 0.7));
    }
  } else {
    p.rect(0, roofH - 2, w, 4, '#7d756b'); p.rect(0, roofH - 2, w, 1, '#a39a8e');
    if (kind === 'flat') {
      const extra = r();
      if (extra < 0.3) for (let k = 0; k < 3; k++) { p.rect(Math.round(w * 0.45) + k * 9, roofH - 5, 8, 3, '#2c3e66'); p.rect(Math.round(w * 0.45) + k * 9, roofH - 5, 8, 1, '#5d7bb3'); } // solar panels
      else if (extra < 0.55) for (let k = 0; k < 4; k++) { p.rect(Math.round(w * 0.5) + k * 7, roofH - 4, 5, 2, '#8b5a2b'); p.rect(Math.round(w * 0.5) + k * 7, roofH - 6, 5, 2, '#4f9a4a'); } // roof garden
      p.rect(Math.round(w * 0.2), roofH - 5, 8, 3, '#a7adb3'); p.rect(Math.round(w * 0.2) + 2, roofH - 4, 4, 1, '#6f767d');
    }
    else {
      p.rect(Math.round(w * 0.2), roofH - 11, 12, 9, '#8b5a2b'); p.rect(Math.round(w * 0.2) - 1, roofH - 12, 14, 1, '#5e3b1c'); // water tank
      p.rect(Math.round(w * 0.7), 0, 1, roofH - 2, '#6f767d'); p.px(Math.round(w * 0.7), 0, '#e74c3c'); // antenna
      if (L.hq && L.companies[0]) { // the headquarters puts its name on the roof
        const name = L.companies[0].name, sw = textWidth(name) + 6, sx = Math.round(w / 2 - sw / 2);
        p.rect(sx, roofH - 11, sw, 8, '#1f2a44'); p.text(name, sx + 3, roofH - 9, L.companies[0].color);
        p.rect(sx + 2, roofH - 3, 1, 1, '#6f767d'); p.rect(sx + sw - 3, roofH - 3, 1, 1, '#6f767d');
      }
    }
  }
}

// ---------- the elevator ----------
// One car per building. People press the call button on their floor; the car serves stops
// in the direction it is already moving (like a real lift), opens its doors, waits, closes.
export class Elevator {
  constructor(floors = 11) { this.pos = 0; this.dir = 0; this.stops = new Set(); this.state = 'idle'; this.door = 0; this.timer = 0; this.speed = 1.6 + 0.1 * Math.max(0, floors - 5); } // (taller towers have faster lifts)
  call(f) { this.stops.add(f); }
  openAt(f) { return this.state === 'open' && this.pos === f; }
  hold() { if (this.state === 'open') this.timer = Math.max(this.timer, 0.8); }
  update(dt) {
    switch (this.state) {
      case 'idle':
        if (this.stops.has(this.pos)) { this.stops.delete(this.pos); this.state = 'opening'; }
        else if (this.stops.size) this.state = 'moving';
        return;
      case 'moving': {
        const all = [...this.stops];
        if (!all.length) { this.state = 'idle'; return; }
        const ahead = all.filter((f) => Math.sign(f - this.pos) === this.dir);
        const target = (ahead.length ? ahead : all).reduce((a, b) => (Math.abs(b - this.pos) < Math.abs(a - this.pos) ? b : a));
        this.dir = Math.sign(target - this.pos);
        const step = this.speed * dt; // floors per second
        if (Math.abs(target - this.pos) <= step) { this.pos = target; this.stops.delete(target); this.state = 'opening'; }
        else this.pos += this.dir * step;
        return;
      }
      case 'opening': if ((this.door += dt * 2.5) >= 1) { this.door = 1; this.state = 'open'; this.timer = 1.6; } return;
      case 'open': if ((this.timer -= dt) <= 0) this.state = 'closing'; return;
      case 'closing': if ((this.door -= dt * 2.5) <= 0) { this.door = 0; this.state = 'idle'; } return;
    }
  }
}

// ---------- a building on a lot ----------
export class Building {
  // opts.furnished: flat-packs already assembled (older saved towns). opts.hq: the city's headquarters.
  constructor(type, tier, seed, opts = {}) {
    Object.assign(this, { type, tier, seed, hq: !!opts.hq });
    this.L = layout(type, tier, seed, opts);
    // Shared areas (lobbies, hallways) belong to no household, so the developer furnishes them.
    for (const it of this.L.items) { it.ready = !it.flatpack || !!opts.furnished || this.L.rooms[it.room]?.unit == null; it.progress = 0; }
    this.boxes = [];          // delivered flat-packs: { item, size, outside, f, lx, claimed, carried }
    this.ordered = new Set(); // households that have ordered their furniture
    this.interior = bakeInterior(this.L, seed);
    this.exterior = bakeExterior(this.L, seed);
    this.elevator = this.L.elevator ? new Elevator(this.L.n) : null;
    this.reveal = 0;
    this.build = null;   // { start, end } while under construction
    this.upgrade = null; // { next, start, end } while being rebuilt bigger
    this.x0 = 0; this.G = 0;
    this.light = new Map(); // rooms: is the light switched on?
    this.floorOn = [];      // offices: is each floor's lighting on?
    this.curtains = new Map(); // home rooms: are the curtains drawn?
    this.orders = [];          // restaurants and bars: { p, item: 'meal' | 'drink', state, ready, waiter }
    this.fire = null;          // { room, x, size, smoke, real } while something's burning (see incidents.js)
    this.alarm = 0;            // the fire alarm's ringing (since when)
    this.scorch = null;        // { room, until }: black marks on the wall after a fire
    this.demolish = null;      // { start, end } while being pulled down
    this.engineHome = false;   // a fire station's engine is parked in its bay
  }
  // The street doors: the main one, and a shop's own door on a mixed-use block.
  entrances() { return this.L.entrances.map((x) => this.x0 + x); }
  place(cx, G) { this.x0 = Math.round(cx - this.L.w / 2); this.G = G; this.upgrade?.next.place(cx, G); }
  ready() { return !this.build; }
  feetY(f) { return this.G - f * FLOOR_H; }
  doorX(near) { // the main door, or whichever door is nearest to street position `near`
    if (near === undefined || this.L.entrances.length < 2) return this.x0 + this.L.door;
    return this.entrances().reduce((a, c) => (Math.abs(c - near) < Math.abs(a - near) ? c : a));
  }
  // Where someone heading for (floor f, street x) in here goes in and out: the door nearest the room
  // on the ground floor, or nearest the stairs / lift for upstairs.
  doorFor(f, x) { return this.doorX(f > 0 ? (this.L.elevator ? this.elevX() : this.L.stairs ? this.stairX() : x) : x); }
  // Is this room (a shop, restaurant, pub) open for business now? hour: 0-24.
  isOpen(r, hour) { const o = ROOMS[r.kind].open; return !!o && ((hour >= o[0] && hour < o[1]) || hour + 24 < o[1]); }
  elevX() { return this.x0 + this.L.elevator.x + 8; }
  stairX() { return this.x0 + this.L.stairs.x + 4; } // where every flight starts and ends
  stairPath(f, up) { return stairPath(this.L, f, up).map(([x, y]) => [this.x0 + x, this.G - (this.L.H - 1) + y]); }
  roomAt(f, x) { return this.L.rooms.find((r) => r.f === f && x >= this.x0 + r.x && x < this.x0 + r.x + r.w); }
  spots(act, unit) { return this.L.spots.filter((s) => s.act === act && s.item?.ready !== false && (unit === undefined || s.unit === unit)); }
  allSpots(act, unit) { return this.L.spots.filter((s) => s.act === act && (unit === undefined || s.unit === unit)); } // assembled or not
  rebake() { this.interior = bakeInterior(this.L, this.seed); }
  // Where deliveries are left: by the lobby's parcel shelf, or outside the front door.
  dropSpot() {
    const shelf = this.L.items.find((it) => it.kind === 'parcelshelf' || it.kind === 'lockers');
    return shelf ? { outside: false, f: 0, near: shelf.x } : { outside: true, f: 0, near: this.L.door + 10 };
  }
  // The nearest stack (a slot on the STACK grid) near `near` that still has room for a box.
  // away: grow new stacks only in that direction (1 or -1), e.g. away from a parked car.
  boxSlot(outside, f, near, except = null, away = 0) {
    const base = Math.round(near / STACK) * STACK;
    const count = (lx) => this.boxes.filter((x) => x !== except && !x.carried && !x.opened && !!x.outside === outside && x.f === f && x.lx === lx).length;
    for (const k of away ? [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => n * away) : [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
      const lx = base + k * STACK;
      if (!outside && (lx < 2 || lx > this.L.w - STACK - 2)) continue;
      if (count(lx) < STACK_MAX) return lx;
    }
    return base;
  }
  placeBox(box, outside, f, near, away = 0) {
    Object.assign(box, { outside, f, carried: false });
    box.lx = this.boxSlot(outside, f, near, box, away);
    return box;
  }
  progress(now, job) { return Math.min(1, Math.max(0, (now - job.start) / (job.end - job.start))); }

  draw(ctx, people, drawPerson, w) {
    const { now, t } = w, L = this.L, top = this.G - (L.H - 1), site = this.build || this.demolish;
    const rows = this.build ? Math.floor(L.H * this.progress(now, this.build)) : this.demolish ? Math.ceil(L.H * (1 - this.progress(now, this.demolish))) : L.H, sy = L.H - rows;
    if (rows > 0) {
      // Nobody inside, so the front wall covers it all: skip drawing the inside (except the balconies or
      // playground beside the walls, which the front doesn't cover).
      const covered = !site && this.reveal < 0.004 && !people.length;
      if (covered) { this.easeDoors(); if (L.ox) ctx.drawImage(this.interior, 0, sy, L.ox, rows, this.x0 - L.ox, top + sy, L.ox, rows); }
      else ctx.drawImage(this.interior, 0, sy, L.w + L.ox, rows, this.x0 - L.ox, top + sy, L.w + L.ox, rows);
      if (!site && !covered) {
        this.drawLive(ctx, people, t, new Date(now));
        w.hooks?.under?.(ctx, this, w); // plates on tables, the fire engine in its bay
        if (this.elevator) this.drawElevator(ctx, people, drawPerson);
        // Staff behind a counter first, then the counter in front of them, then everyone else.
        const back = people.filter((p) => p.spot?.behind && p.spot.item && p.surface !== 'elev');
        for (const p of back) drawPerson(p);
        for (const it of new Set(back.map((p) => p.spot.item))) {
          drawPiece(painter(ctx), { ...it, x: this.x0 + it.x }, this.feetY(it.f));
          const sc = FURNITURE[it.kind].screen; // (and anything always on its screen: the security cameras, a screensaver)
          if (sc?.always) drawScreen(ctx, sc.app, this.x0 + it.x + sc.dx, this.feetY(it.f) + sc.dy, sc.w, sc.h, t, it.seed % 97);
        }
        for (const p of people) if (p.surface !== 'elev' && !back.includes(p)) drawPerson(p);
        this.drawOver(ctx, people, t);
        this.drawLights(ctx, people, w);
        if (!w.potato) drawBeams(ctx, this, w, w.light); // sun (or moon) shining in through the side windows
        w.hooks?.glow?.(ctx, this, w); // flames, smoke, water: not darkened by the night
      }
      const a = site ? 1 : 1 - this.reveal;
      if (a > 0.02) {
        ctx.globalAlpha = a;
        ctx.drawImage(this.exterior, 0, sy, L.w + L.ox, rows, this.x0 - L.ox, top + sy, L.w + L.ox, rows);
        const n = nightLevel(w.hour), from = Math.max(sy, L.roofH);
        if (n > 0) { ctx.fillStyle = `rgba(10,16,40,${0.4 * n})`; ctx.fillRect(this.x0, top + from, L.w, L.H - from); }
        ctx.globalAlpha = 1;
      }
      if (!site) this.drawWindowLight(ctx, people, w, a);
      if (!site && !w.potato) drawFacadeLight(ctx, this, w.light, a, w.view);
      if (!site) w.hooks?.outside?.(ctx, this, w); // smoke from the windows, the alarm light
    }
    if (this.build) scaffold(ctx, this.x0, L.w, top, this.G, this.progress(now, this.build));
    if (this.demolish) scaffold(ctx, this.x0, L.w, top, this.G, 1 - this.progress(now, this.demolish), this.demolish.banner || 'CLOSED');
    if (this.upgrade) { const u = this.upgrade.next; scaffold(ctx, u.x0, u.L.w, u.G - (u.L.H - 1), u.G, this.progress(now, this.upgrade)); }
  }

  // Doors swing towards where they were last pushed.
  easeDoors() {
    for (const d of this.L.doors) {
      d.open += ((d.target ?? 0) - d.open) * 0.22;
      if (Math.abs(d.target - d.open) < 0.01) d.open = d.target ?? 0;
    }
  }

  // Layer 3, live: screens, clocks, and appliances people are using.
  drawLive(ctx, people, t, date) {
    const X = this.x0, px = (x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    drawStacks(ctx, this.boxes.filter((b) => !b.outside), X, (b) => this.feetY(b.f)); // boxes waiting in the lobby or a room
    for (const b of this.boxes) { // a moving box being unpacked
      if (!b.opened || b.carried || b.item != null) continue;
      const stage = buildStage(false, false, b.progress || 0), y = this.feetY(b.f);
      if (stage === 'fold') { px(X + b.lx - 1, y, '#c8a06a', 8, 1); px(X + b.lx, y - 1, '#b8905a', 6, 1); } // folded flat
      else drawBox(ctx, X + b.lx, y, b.size, stage !== 'open');
    }
    // Doors swing to where someone last pushed them, open or shut. (Drawn a colour at a time:
    // frames, then faces, then handles; changing colour is the slow part.)
    this.easeDoors();
    for (const style in DOOR) {
      const [face, edge] = DOOR[style], mine = this.L.doors.filter((d) => d.style === style);
      if (!mine.length) continue;
      ctx.fillStyle = edge; for (const d of mine) ctx.fillRect(X + d.x, this.feetY(d.f) - 21, Math.round(2 + 5 * d.open), 22); // closed: seen edge-on; open: swung out
      ctx.fillStyle = face; for (const d of mine) { const w = Math.round(2 + 5 * d.open); if (w > 2) ctx.fillRect(X + d.x + 1, this.feetY(d.f) - 20, w - 2, 20); }
      ctx.fillStyle = style === 'glass' ? '#6f767d' : '#f1c40f'; for (const d of mine) { const w = Math.round(2 + 5 * d.open); if (w >= 4) ctx.fillRect(X + d.x + w - 2, this.feetY(d.f) - 10, 1, 1); } // handles
    }
    for (const r of this.L.rooms) { // drawn curtains, over the window
      if (!this.curtainsShut(r)) continue;
      const d = (r.windowDetail ??= this.L.details.find((d) => d.kind === 'window' && d.f === r.f && d.x >= r.x && d.x < r.x + r.w) || null);
      if (!d) continue;
      const y = this.feetY(r.f) - 21;
      px(X + d.x - 1, y, d.color, 12, 11);
      for (let k = 1; k < 12; k += 3) px(X + d.x - 1 + k, y, shade(d.color, 0.8), 1, 11); // folds
    }
    // Light switches: the toggle is up when the light is on. (Plates first, then toggles.)
    const switchRooms = (this.switchRooms ??= this.L.rooms.filter((r) => !(r.outdoor || SHARED.has(r.kind) || r.kind === 'reception' || (this.type === 'office' && r.kind === 'washroom') || (this.type !== 'home' && this.type !== 'office'))));
    ctx.fillStyle = '#f3f1ec';
    for (const r of switchRooms) for (const sx of (r.switches ??= roomSwitches(this.L, r))) ctx.fillRect(X + sx, this.feetY(r.f) - 14, 2, 3);
    ctx.fillStyle = '#7d7d7d';
    for (const r of switchRooms) { const on = this.lightOn(r), y = this.feetY(r.f); for (const sx of r.switches) ctx.fillRect(X + sx + (on ? 0 : 1), y - (on ? 14 : 12), 1, 1); }
    this.L.items.forEach((it, i) => { // furniture being put together, stage by stage
      if (it.ready || !it.progress) return;
      const box = this.boxes.find((b) => b.item === i && b.opened), own = !!box?.own, prog = it.progress;
      const stage = buildStage(true, own, prog), y = this.feetY(it.f), bx = X + it.x + it.w + 1;
      const h = FURNITURE[it.kind].h + 12;
      // How much of the piece stands: flat-packs grow while being screwed together; own furniture is already whole.
      const built = own ? 1 : stage === 'screw' ? (prog - 0.32) / 0.48 : ['raise', 'fold'].includes(stage) ? 1 : 0;
      const ix = X + it.x + (own ? pushOffset(this.L, it, prog).dx : 0); // own furniture slides into place as it's pushed
      if (built > 0) {
        const shown = Math.ceil(h * built);
        ctx.save(); ctx.globalAlpha = own ? 1 : stage === 'fold' ? 0.8 : 0.55; ctx.beginPath(); ctx.rect(ix - 3, y - shown + 1, it.w + 6, shown); ctx.clip();
        drawPiece(painter(ctx), { ...it, x: ix }, y);
        ctx.restore();
      }
      if (own && stage === 'unwrap') { // still in its moving blanket and plastic wrap
        const left = 1 - prog / 0.3;
        ctx.fillStyle = 'rgba(214,226,232,0.75)'; ctx.fillRect(ix - 1, y - Math.ceil(h * left) + 1, it.w + 2, Math.ceil(h * left));
        ctx.fillStyle = 'rgba(160,178,190,0.8)'; for (let k = y - 2; k > y - h * left; k -= 4) ctx.fillRect(ix - 1, k, it.w + 2, 1);
      }
      if (own && stage === 'push') { px(ix + (pushOffset(this.L, it, prog).side > 0 ? -2 : it.w + 1), y, '#b9b2a6', 1, 1); px(ix + (pushOffset(this.L, it, prog).side > 0 ? -4 : it.w + 3), y, '#cdc6ba', 1, 1); } // scuffs on the floor behind it
      if (own) return;
      // The flat-pack's box and its parts on the floor.
      const parts = stage === 'layout' ? Math.ceil(((prog - 0.08) / 0.12) * 5) : stage === 'read' ? 5 : stage === 'screw' ? Math.ceil(5 * (1 - built)) : 0;
      for (let k = 0; k < parts; k++) { px(X + it.x + 1 + k * 3, y - (k % 2), k % 3 ? '#b07d4a' : '#d9c3a0', 3, 1); px(X + it.x + 1 + k * 3, y - 1 - (k % 2), '#8d6238'); }
      if (stage === 'fold') { px(bx - 1, y, '#c8a06a', 8, 1); px(bx, y - 1, '#b8905a', 6, 1); } // cardboard folded flat
      else drawBox(ctx, bx, y, FLATPACK[it.kind][0], stage !== 'open');
      if (stage === 'read') px(X + it.x + it.w - 4, y, '#f3f1ec', 4, 1); // the instructions, open on the floor
    });
    for (const it of this.L.items) {
      const sc = FURNITURE[it.kind].screen;
      if (!sc) continue;
      let app = sc.always ? sc.app : null;
      if (it.kind === 'tv') {
        const viewer = people.find((p) => p.spot?.room === it.room && ['sofa', 'armchair', 'couch'].includes(p.spot.item?.kind));
        if (viewer) app = TV_CHANNELS[(viewer.seed + Math.floor(t / 120)) % TV_CHANNELS.length]; // flicks channel now and then
      } else {
        const user = people.find((p) => p.spot?.item === it && p.anim === 'type');
        if (user) app = user.spot.act === 'game' ? 'game' : sc.app || PC_APPS[it.seed % PC_APPS.length];
      }
      if (app) drawScreen(ctx, app, X + it.x + sc.dx, this.feetY(it.f) + sc.dy, sc.w, sc.h, t, it.seed % 97);
    }
    // Factory machines run while someone's working them: the belt carries boxes along, the press stamps.
    for (const it of this.L.items) {
      if (it.kind !== 'conveyor' && it.kind !== 'press') continue;
      const busy = people.some((p) => p.spot?.item === it), ix = X + it.x, iy = this.feetY(it.f);
      if (it.kind === 'conveyor') {
        const off = busy ? (t * 6) % 10 : 3;
        for (let k = off; k < it.w - 3; k += 10) { px(ix + k, iy - 11, '#c8a06a', 4, 3); px(ix + k + 1, iy - 11, '#e8d5a8', 1, 3); }
      } else {
        const down = busy ? Math.max(0, Math.sin(t * 4)) * 9 : 0;
        px(ix + 3, iy - 18, '#7d858c', 4, 6 + Math.round(down)); px(ix + 2, iy - 12 + Math.round(down), '#34495e', 6, 2);
      }
    }
    if (this.scorch && date.getTime() < this.scorch.until) { // black marks where the fire was
      const r = this.L.rooms[this.scorch.room], y = this.feetY(r.f);
      ctx.fillStyle = 'rgba(30,24,20,0.55)'; ctx.fillRect(X + this.scorch.x - 6, y - 26, 13, 6); ctx.fillRect(X + this.scorch.x - 4, y - 20, 9, 8);
    }
    const hrs = date.getHours() % 12 + date.getMinutes() / 60, mins = date.getMinutes() + date.getSeconds() / 60;
    for (const d of this.L.details) {
      if (d.kind !== 'clock') continue;
      const cx = X + d.x + 3, cy = this.feetY(d.f) + d.top + 3;
      const hand = (turns, len, c) => { ctx.fillStyle = c; for (const [x, y] of lineCells(cx, cy, cx + Math.sin(turns * 2 * Math.PI) * len, cy - Math.cos(turns * 2 * Math.PI) * len)) ctx.fillRect(x, y, 1, 1); };
      hand(mins / 60, 2.4, '#222222'); hand(hrs / 12, 1.6, '#c0392b');
    }
    for (const p of people) {
      const it = p.spot?.item;
      if (!it) continue;
      const ix = X + it.x, iy = this.feetY(it.f), blink = Math.floor(t * 8) % 2;
      if (p.anim === 'cook') { // flames and steam
        px(ix + 3, iy - 8, blink ? '#ff6a00' : '#ffd200'); px(ix + 5, iy - 8, blink ? '#ffd200' : '#ff6a00');
        for (let j = 0; j < 3; j++) { const k = (t * 3 + j / 3) % 1; ctx.globalAlpha = 1 - k; px(ix + 3 + j, iy - 12 - k * 6, '#e8e8e8'); }
        ctx.globalAlpha = 1;
      } else if (p.anim === 'fridge' && it.kind === 'fridge') { // door open, light on
        px(ix + 1, iy - 16, '#fff6c8', 6, 15); px(ix, iy - 11, '#a7adb3', 8, 1);
        px(ix + 2, iy - 14, '#e74c3c', 2, 2); px(ix + 5, iy - 15, '#2ecc71', 1, 3); px(ix + 2, iy - 9, '#f1c40f', 3, 2);
        px(ix + 8, iy - 17, '#f3f1ec', 2, 18);
      } else if (p.anim === 'shower' && it.kind === 'shower') {
        for (let j = 0; j < 6; j++) px(ix + 1 + (j % 3), iy - 19 + ((t * 24 + j * 4) % 19), '#7fc8ff');
      } else if (p.anim === 'wash' && it.kind === 'sink') {
        px(ix + 4, iy - 8, '#7fc8ff', 1, 1 + blink);
      } else if (p.anim === 'dishes') {
        px(ix + 7, iy - 10, '#7fc8ff', 1, 2); if (blink) px(ix + 4, iy - 9, '#ffffff');
      } else if (p.anim === 'coffee' && it.kind === 'coffee') {
        for (let j = 0; j < 2; j++) { const k = (t * 1.5 + j / 2) % 1; ctx.globalAlpha = 1 - k; px(ix + 2 + j, iy - 14 - k * 5, '#e8e8e8'); }
        ctx.globalAlpha = 1;
      } else if (p.anim === 'coffee' && it.kind === 'watercooler') {
        px(ix + 1 + blink, iy - 7 - ((t * 6) % 5), '#ffffff');
      }
    }
  }

  // Things in front of people: bath water over the bather.
  drawOver(ctx, people, t) {
    for (const p of people) {
      if (p.anim !== 'bath' || !p.spot?.item) continue;
      const it = p.spot.item, ix = this.x0 + it.x, iy = this.feetY(it.f);
      ctx.fillStyle = '#9fd5f5'; ctx.fillRect(ix + 1, iy - 5, 14, 3);
      ctx.fillStyle = '#ffffff'; for (let j = 0; j < 4; j++) ctx.fillRect(ix + 2 + ((j * 4 + Math.floor(t * 2)) % 13), iy - 6, 1, 1);
    }
  }

  // ---------- lights ----------
  // Every room has a switch on the wall beside each way in, and people flip them by hand (see
  // people.js): on when they come in to stay a while after dark, off when they go (or not: some
  // forget, some plan to come back). Offices: the first one onto a floor switches it on and the
  // last one off it switches it off; washrooms have motion sensors.
  lightOn(r) {
    if (this.type === 'office' && r.kind !== 'washroom' && r.kind !== 'reception') return !!this.floorOn[r.f];
    return !!this.light.get(r);
  }
  setLight(r, on) {
    if (this.type === 'office' && r.kind !== 'washroom' && r.kind !== 'reception') this.floorOn[r.f] = on;
    else this.light.set(r, on);
  }
  isLit(r, people, w) {
    const h = w.hour, here = () => people.some((p) => p.f === r.f && this.roomAt(p.f, p.x) === r);
    if (this.alarm && Math.floor(w.t * 3) % 2) return true; // the alarm strobes
    if (r.kind === 'lobby') return true; // lobbies are lit day and night
    if (r.kind === 'reception') return h >= 6 || h < 1 || people.some((p) => p.f === r.f); // office receptions until late
    if (this.type === 'shop') return h >= 7 && h < 22;
    if (ROOMS[r.kind].open) return this.isOpen(r, h) || here(); // shops, restaurants, pubs: while open (and while the staff are still in)
    if (['school', 'factory'].includes(this.type)) return here() || (this.type === 'school' ? h >= 7.5 && h < 16.5 : h >= 6 && h < 22) && w.weekday;
    if (this.type === 'fire' || this.type === 'police' || this.type === 'hospital') return r.kind === 'bunks' ? here() && !people.some((p) => p.anim === 'sleep' && this.roomAt(p.f, p.x) === r) : true; // staffed day and night
    if (r.kind === 'fitness') return here();
    if (this.type === 'office' && r.kind === 'washroom') return people.some((p) => this.roomAt(p.f, p.x) === r); // motion sensor
    if (this.lightOn(r)) return true;
    // Some homes keep the bathroom light on overnight as a night light.
    return this.type === 'home' && r.kind === 'washroom' && hashRoom(this.seed, r.unit ?? 0, 0) < 0.15 && (h >= 22 || h < 6.5);
  }
  // Curtains: homes only (offices have blinds left as they are; bathrooms have frosted glass).
  hasCurtains(r) { return this.type === 'home' && !r.outdoor && r.kind !== 'washroom' && !SHARED.has(r.kind) && !!this.windowOf(r); }
  curtainsShut(r) { return !!this.curtains.get(r); }
  setCurtains(r, shut) { this.curtains.set(r, shut); }
  // The room's window on the back wall (local x of its middle), or null.
  windowOf(r) {
    const d = this.L.details.find((d) => d.kind === 'window' && d.f === r.f && d.x >= r.x && d.x < r.x + r.w);
    return d ? d.x + 5 : null;
  }

  // The open share (0..1) of the doorway in the wall at local x on floor f (no door: always open).
  doorwayOpen(f, x) {
    const d = this.L.doors.find((d) => d.f === f && Math.abs(d.x - x) <= 1);
    return d ? d.open : 1;
  }

  // After dark: lit rooms glow warm, dark ones go dark, and light spills a little way into a dark
  // room through an open doorway. Walls and doors are shaded with the rooms beside them.
  // Stairwells and lift shafts stay lit.
  drawLights(ctx, people, w) {
    const n = nightLevel(w.hour);
    // Indoors is a little dimmer than outdoors in the day (more with the curtains drawn), so a
    // sunbeam shows; at night, rooms without a light on go dark.
    const L = this.L, SPILL = 16, dim = (r) => 0.5 * n + (1 - n) * (0.1 + (this.curtainsShut(r) ? 0.12 : 0));
    const floors = (L.floorRooms ??= Array.from({ length: L.n }, (_, f) => L.rooms.filter((r) => r.f === f && !r.outdoor).sort((a, b) => a.x - b.x)));
    const dark = (this.darkCols ??= new Float32Array(L.w + 1)); // local column -> darkness (lit rooms: 0; -1: not set, the floor's darkest)
    for (let f = 0; f < L.n; f++) {
      const rooms = floors[f];
      if (!rooms.length) continue;
      const lit = rooms.map((r) => this.isLit(r, people, w));
      // A lamp instead of the big light: lit, but dimmer. The TV on in a dark room: a blue flicker.
      const dimmed = rooms.map((r, i) => lit[i] && this.light.get(r) === 'dim');
      const telly = rooms.map((r, i) => !lit[i] && r.tv && people.some((p) => p.spot?.room === r.id && p.anim === 'tv'));
      let DARK = 0;
      for (const r of rooms) DARK = Math.max(DARK, dim(r));
      const y = this.feetY(f) - 27, x0 = rooms[0].x, x1 = rooms[rooms.length - 1].x + rooms[rooms.length - 1].w;
      dark.fill(-1, Math.max(0, x0 - WALL), x1);
      const at = (c) => (dark[c] < 0 || c < 0 ? DARK : dark[c]);
      rooms.forEach((r, i) => {
        const D = dim(r);
        const openL = i > 0 && lit[i - 1] ? this.doorwayOpen(f, r.x - WALL) : 0, openR = i < rooms.length - 1 && lit[i + 1] ? this.doorwayOpen(f, r.x + r.w) : 0;
        for (let c = r.x; c < r.x + r.w; c++) {
          if (dimmed[i]) { dark[c] = 0.3 * n; continue; }
          if (lit[i]) { dark[c] = 0; continue; }
          let k = 0; // light coming in through the doorways at either end
          if (openL) k = Math.max(k, openL * Math.max(0, 1 - (c - r.x) / SPILL));
          if (openR) k = Math.max(k, openR * Math.max(0, 1 - (r.x + r.w - 1 - c) / SPILL));
          dark[c] = D * (1 - 0.75 * k) * (telly[i] ? 0.72 : 1);
        }
        if (i > 0) { const v = Math.min(at(r.x - WALL - 1), at(r.x)); for (let c = r.x - WALL; c < r.x; c++) dark[c] = v; } // the wall (and door) between
      });
      rooms.forEach((r, i) => {
        if (dimmed[i] && n > 0) { ctx.fillStyle = `rgba(255,170,90,${0.1 * n})`; ctx.fillRect(this.x0 + r.x, y, r.w, 28); } // warm lamplight
        if (telly[i] && n > 0) { ctx.fillStyle = `rgba(120,160,255,${(0.07 + 0.04 * Math.sin(w.t * 7) * Math.sin(w.t * 2.3)) * n})`; ctx.fillRect(this.x0 + r.x, y, r.w, 28); }
      });
      for (let c = x0; c < x1; ) { // runs of equal darkness
        const a = at(c); let e = c + 1;
        while (e < x1 && Math.abs(at(e) - a) < 0.004) e++;
        if (a === 0 && n <= 0) { c = e; continue; }
        ctx.fillStyle = a === 0 ? `rgba(255,210,120,${0.12 * n})` : `rgba(10,16,40,${a})`;
        ctx.fillRect(this.x0 + c, y, e - c, 28);
        c = e;
      }
    }
  }

  // From outside at night: lit rooms glow in their windows and light the pavement below.
  drawWindowLight(ctx, people, w, alpha) {
    const n = nightLevel(w.hour);
    if (alpha <= 0.02) return;
    const L = this.L, glass = L.glass;
    for (const r of L.rooms) {
      const rects = L.wins.get(r.id);
      if (!rects) continue;
      const lit = this.isLit(r, people, w), y = this.feetY(r.f), shut = this.curtainsShut(r);
      for (const [lx, t, ww, hh] of rects) {
        const x = this.x0 + lx, top = y + t;
        ctx.globalAlpha = alpha;
        if (shut && !glass) { // curtains drawn: the fabric shows, glowing softly if the light's on behind it
          const cloth = this.L.details.find((d) => d.kind === 'window' && d.f === r.f && d.x >= r.x && d.x < r.x + r.w)?.color || '#c0504d';
          ctx.fillStyle = cloth; ctx.fillRect(x, top, ww, hh);
          ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = x + 2; k < x + ww; k += 3) ctx.fillRect(k, top, 1, hh); // folds
          if (n > 0) ctx.fillStyle = lit ? `rgba(255,200,110,${0.35 * n})` : `rgba(8,12,30,${0.45 * n})`, ctx.fillRect(x, top, ww, hh);
          ctx.globalAlpha = 1;
          continue;
        }
        if (n <= 0) { ctx.globalAlpha = 1; continue; }
        const dim = lit && this.light.get(r) === 'dim' ? 0.55 : 1;
        if (!lit && r.tv && people.some((p) => p.spot?.room === r.id && p.anim === 'tv')) { // the TV flickering in a dark window
          ctx.fillStyle = `rgba(110,150,255,${(0.35 + 0.15 * Math.sin(w.t * 7)) * n})`; ctx.fillRect(x, top, ww, hh); ctx.globalAlpha = 1; continue;
        }
        if (lit) {
          ctx.globalAlpha = alpha * dim;
          ctx.fillStyle = `rgba(255,214,130,${0.85 * n})`; ctx.fillRect(x, top, ww, hh);
          if (!w.potato) { // glow round the window
            ctx.fillStyle = `rgba(255,200,110,${0.2 * n})`; ctx.fillRect(x - 2, top - 2, ww + 4, hh + 4);
            ctx.fillStyle = `rgba(255,200,110,${0.08 * n})`; ctx.fillRect(x - 5, top - 5, ww + 10, hh + 10);
          }
          if (r.f === 0) { ctx.fillStyle = `rgba(255,205,120,${0.16 * n})`; ctx.fillRect(x - 4, this.G + 1, ww + 8, 3); } // light on the pavement
        } else { ctx.fillStyle = `rgba(8,12,30,${0.45 * n})`; ctx.fillRect(x, top, ww, hh); }
        ctx.globalAlpha = 1;
      }
    }
  }

  drawElevator(ctx, people, drawPerson) {
    const e = this.elevator, ex = this.x0 + this.L.elevator.x, cy = Math.round(this.feetY(e.pos));
    ctx.fillStyle = '#6b5a3c'; ctx.fillRect(ex + 1, cy - 23, 14, 24);
    ctx.fillStyle = '#d8c49a'; ctx.fillRect(ex + 2, cy - 22, 12, 22);
    ctx.fillStyle = '#fff6c8'; ctx.fillRect(ex + 5, cy - 22, 6, 1);
    for (const p of people) if (p.surface === 'elev') drawPerson(p);
    // Sliding doors on every floor (drawn a colour at a time: changing colour is the slow part).
    const n = this.L.n, here = Math.round(e.pos), pws = [];
    for (let f = 0; f < n; f++) pws.push(Math.round(7 * (1 - (e.pos === f ? e.door : 0))));
    ctx.fillStyle = '#3a3a3a'; for (let f = 0; f < n; f++) if (f !== here) ctx.fillRect(ex + 13, this.feetY(f) - 26, 1, 1); // car-is-here lights
    ctx.fillStyle = '#ff9f43'; if (here >= 0 && here < n) ctx.fillRect(ex + 13, this.feetY(here) - 26, 1, 1);
    if (e.state === 'moving') { // up / down arrows
      ctx.fillStyle = '#2ecc71';
      const arrow = e.dir > 0 ? [[1, 0], [0, 1], [2, 1]] : [[0, 0], [2, 0], [1, 1]];
      for (let f = 0; f < n; f++) for (const [a, b] of arrow) ctx.fillRect(ex + 1 + a, this.feetY(f) - 26 + b, 1, 1);
    }
    ctx.fillStyle = '#a9b1b8';
    for (let f = 0; f < n; f++) { const y = this.feetY(f), pw = pws[f]; ctx.fillRect(ex + 1, y - 21, pw, 22); ctx.fillRect(ex + 15 - pw, y - 21, pw, 22); }
    ctx.fillStyle = '#7d858c';
    for (let f = 0; f < n; f++) { const y = this.feetY(f), pw = pws[f]; if (pw) { ctx.fillRect(ex + pw, y - 21, 1, 22); ctx.fillRect(ex + 15 - pw, y - 21, 1, 22); } }
  }
}

// Light-switch habits, from surveys: 90% of US households have someone who forgets lights; kitchens
// (49%) and bathrooms (28%) are left on most; 38% leave a light on because they plan to come back,
// 29% just forget; about 8% sleep with a light on.
// How people treat the lights at home. Most keep the rooms they're living in lit all evening and
// switch everything off at bedtime ("cosy"); some switch off every time they leave a room ("saver");
// some just forget. offRoom: leaving a room; offLeaving: going out or to bed; round: the last one up
// goes round switching off whatever's still on; sleepLit: falls asleep with it on.
const LIGHT_HABITS = [
  { share: 0.55, style: 'cosy', offRoom: 0.2, offLeaving: 0.85, round: 0.9, sleepLit: 0.04, closeDoor: 0.6, curtain: 0.8 },
  { share: 0.27, style: 'saver', offRoom: 0.93, offLeaving: 0.98, round: 0.98, sleepLit: 0.02, closeDoor: 0.8, curtain: 0.9 },
  { share: 0.18, style: 'forgetful', offRoom: 0.25, offLeaving: 0.5, round: 0.45, sleepLit: 0.25, closeDoor: 0.2, curtain: 0.45 },
];
const KID_HABIT = { style: 'kid', offRoom: 0.1, offLeaving: 0.3, round: 0, sleepLit: 0.3, closeDoor: 0.3, curtain: 0.3 };
const ROOM_LEFT_ON = { kitchen: 0.75, washroom: 0.85 }; // these get left on more often
// Cosy people still switch off a room they're done with for the evening; the living room and
// kitchen stay lit until bedtime.
const COSY_OFF = { washroom: 0.7, bedroom: 0.5, study: 0.6, gym: 0.7, greenhouse: 0.7 };
function habit(p) {
  if (p.kid) return KID_HABIT;
  let k = (p.seed % 100) / 100;
  for (const h of LIGHT_HABITS) { if (k < h.share) return h; k -= h.share; }
  return LIGHT_HABITS[1];
}
const hashRoom = (a, b, c) => ((Math.imul(a ^ (b * 7919), 2654435761) ^ Math.imul(c + 13, 40503)) >>> 0) / 4294967296;

// Where a room's light switches are (local x): just inside each way in, a hand's reach from the
// doorway (or from the front door, on the ground floor of a house).
export function roomSwitches(L, r) {
  const out = [], ways = L.doors.filter((d) => d.f === r.f && d.x !== 0).map((d) => d.x);
  if (r.f === 0) ways.push(L.door);
  for (const x of ways) {
    if (x === r.x - WALL) out.push(r.x + 2);
    else if (x === r.x + r.w) out.push(r.x + r.w - 4);
    else if (x > r.x && x < r.x + r.w - 6) out.push(x + 5);
  }
  return out.length ? [...new Set(out)] : [r.x + 2];
}
export { habit, ROOM_LEFT_ON, COSY_OFF };

const DOOR = { wood: ['#b07a4a', '#6e4423'], front: ['#7a4a2a', '#3e2614'], glass: ['#d6e8f2', '#8c939a'] }; // [face, frame]

export { nightLevel }; // (from sky.js: 0 in the day, 1 at night, following the sun's real height)

export const DEVELOPER = { name: 'SUNRISE HOMES' }; // the real estate company's banner on building sites

function scaffold(ctx, x0, w, top, G, k, banner = null) {
  const h = Math.max(4, Math.round((G - top + 1) * k)), y0 = G - h + 1;
  ctx.fillStyle = '#b07a3c';
  for (let x = x0 - 3; x <= x0 + w + 2; x += 12) ctx.fillRect(x, y0, 1, h);
  ctx.fillStyle = '#8a5a2b';
  for (let y = G - 10; y >= y0; y -= 10) ctx.fillRect(x0 - 4, y, w + 8, 1);
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(x0 - 4, y0, w + 8, 1);
  const name = banner || DEVELOPER.name, tw = textWidth(name) + 4; // the developer's banner on the fence
  ctx.fillStyle = '#f39c12'; ctx.fillRect(x0 + 4, G - 11, tw, 7);
  painter(ctx).text(name, x0 + 6, G - 10, '#2c3e50');
}
