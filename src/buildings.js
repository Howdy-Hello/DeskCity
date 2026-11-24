// Buildings: what each type looks like at each size, how its floors are split into rooms,
// and how it is drawn in three layers:
//   1. exterior  - the outside walls, windows, door and roof (fades away while someone is inside)
//   2. interior  - rooms, floors, stairs, elevator shaft and furniture
//   3. details   - things on the walls, doorways, ceiling lamps, elevator doors and floor numbers
import { sprite, painter, addGrain, rng, pick, shade, textWidth, lineCells } from './draw.js';
import { drawScreen, TV_CHANNELS, PC_APPS } from './screens.js';
import { FURNITURE, ROOMS, FLATPACK, BOX, furnish, decorate, drawPiece, drawDetail } from './furniture.js';

export const FLOOR_H = 30; // one storey; a stick person is ~19 cells tall
export const LOT_W = 200;  // width of each building plot along the bottom of the screen
const WALL = 2;
const CORE_W = { stairs: 28, elevator: 16 };
const MIN_W = {
  bedroom: 32, kitchen: 37, living: 36, washroom: 30, study: 30, greenhouse: 32, gym: 34, balcony: 22,
  lobby: 30, desks: 60, boss: 40, hr: 34, common: 36, lounge: 36, meeting: 34, reception: 34, store: 60,
};
const ROOF_H = { pitched: 18, flat: 5, tower: 14 };
const times = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const baseKind = (name) => name.split(':')[0];
const widthOf = (rooms) => rooms.reduce((s, n) => s + MIN_W[baseKind(n)], 0) + (rooms.length - 1) * WALL;
function shuffle(r, list) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; }

// ---------- homes: every household gets the essentials, then whatever extras fit ----------
const EXTRAS = [['living', 0.85], ['study', 0.35], ['bedroom:single', 0.3], ['gym', 0.07], ['greenhouse', 0.06]];
function household(r, space, essentials, { balcony = false, extras = EXTRAS } = {}) {
  const rooms = [...essentials];
  // Balconies: about 40% of renters say private outdoor space is a must; give it to ~40% of flats.
  const hasBalcony = balcony && r() < 0.4 && widthOf([...rooms, 'balcony']) <= space;
  if (hasBalcony) rooms.push('balcony');
  for (const [name, chance] of extras) if (r() < chance && widthOf([...rooms, name]) <= space) rooms.push(name);
  const inside = shuffle(r, rooms.filter((n) => n !== 'balcony'));
  return hasBalcony ? ['balcony', ...inside] : inside; // the balcony sits against the outside wall
}

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

// The catalogue. Each type grows through these tiers as the population grows.
// floors(r, space, opts) returns the room lists bottom to top; space = width available for rooms.
// units: 'whole' = one household per building, 'floor' = one household per floor.
export const TYPES = {
  home: [
    { name: 'Cottage', w: 164, roof: 'pitched', facade: 'siding', units: 'whole',
      floors: (r, sp) => [household(r, sp, ['kitchen', 'bedroom', 'washroom'], { extras: [['living', 0.7], ['study', 0.3], ['greenhouse', 0.06]] })] },
    { name: 'House', w: 176, roof: 'pitched', facade: 'siding', units: 'whole', core: ['stairs'],
      floors: (r, sp) => [household(r, sp, ['kitchen'], { extras: [['living', 0.95], ['study', 0.3], ['gym', 0.07], ['greenhouse', 0.08]] }),
        household(r, sp, ['bedroom', 'washroom'], { extras: [['bedroom:single', 0.65], ['study', 0.3], ['gym', 0.05]] })] },
    { name: 'Apartments', w: 192, roof: 'flat', facade: 'brick', units: 'floor', core: ['stairs'],
      floors: (r, sp) => [['lobby'], ...times(4, () => household(r, sp, ['bedroom', 'kitchen', 'washroom'], { balcony: true }))] },
    { name: 'Condo Tower', w: 192, roof: 'tower', facade: 'panel', units: 'floor', core: ['elevator'],
      floors: (r, sp) => [['lobby'], ...times(10, () => household(r, sp, ['bedroom', 'kitchen', 'washroom'], { balcony: true }))] },
  ],
  office: [
    { name: 'Small Office', w: 160, roof: 'flat', facade: 'stucco', companies: 1, floors: () => [['common', 'desks', 'washroom:office']] },
    { name: 'Office', w: 184, roof: 'flat', facade: 'stucco', core: ['stairs'], companies: 1,
      floors: () => [['reception', 'common', 'washroom:office'], ['desks', 'meeting'], ['boss', 'hr', 'desks']] },
    { name: 'Office Tower', w: 192, roof: 'tower', facade: 'glass', core: ['elevator'], floors: (r, sp, opts) => officeTower(r, 12, opts.hq) },
  ],
  shop: [
    { name: 'Corner Store', w: 112, roof: 'flat', facade: 'shop', sign: 'SHOP', floors: () => [['store']] },
    { name: 'Supermarket', w: 192, roof: 'flat', facade: 'shop', sign: 'MARKET', floors: () => [['store']] },
  ],
};

// ---------- layout: rooms, furniture, details and spots ----------
export function layout(type, tier, seed, opts = {}) {
  const T = TYPES[type][tier], r = rng(seed);
  const core = T.core || [];
  const coreW = core.reduce((s, k) => s + CORE_W[k], 0);
  const inner = T.w - 2 * WALL - (coreW ? coreW + WALL : 0);
  let plan = T.floors(r, inner, opts);
  if (Array.isArray(plan)) plan = { floors: plan, owner: [], companies: T.companies ? [{ name: companyName(r), color: BRAND_COLORS[Math.floor(r() * BRAND_COLORS.length)], floors: plan.map((_, f) => f) }] : [] };
  if (T.companies) plan.owner = plan.floors.map(() => 0);
  const n = plan.floors.length, roofH = ROOF_H[T.roof], H = n * FLOOR_H + roofH;
  const L = { T, w: T.w, n, H, roofH, feet: (f) => H - 1 - f * FLOOR_H, rooms: [], items: [], details: [], spots: [], door: WALL + 7, companies: plan.companies, hq: !!opts.hq };

  plan.floors.forEach((list, f) => {
    const mins = list.map((name) => MIN_W[baseKind(name)]);
    const total = mins.reduce((a, b) => a + b, 0), avail = inner - (list.length - 1) * WALL;
    let x = WALL;
    list.forEach((name, i) => {
      const [kind, variant] = name.split(':');
      const w = i < list.length - 1 ? Math.floor((mins[i] / total) * avail) : WALL + inner - x;
      const unit = T.units === 'whole' ? 0 : T.units === 'floor' && kind !== 'lobby' ? f : null;
      const room = { kind, variant, f, x, w, unit, id: L.rooms.length, company: plan.owner[f] ?? null, outdoor: !!ROOMS[kind].outdoor };
      L.rooms.push(room);
      const items = furnish(room, r);
      for (const it of items) {
        it.f = f; it.room = room.id;
        it.flatpack = type === 'home' && !!FLATPACK[it.kind]; // arrives in a box and must be assembled
        L.items.push(it);
        if (it.kind === 'tv') room.tv = it;
        for (const s of FURNITURE[it.kind].spots) L.spots.push({ ...s, x: it.x + s.dx, f, unit, room: room.id, item: it, company: room.company });
      }
      for (const d of decorate(room, items, r)) { d.f = f; L.details.push(d); }
      x += w + WALL;
    });
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

  let cx = T.w - WALL - coreW;
  if (core.includes('stairs')) { L.stairs = { x: cx, w: CORE_W.stairs }; cx += CORE_W.stairs; }
  if (core.includes('elevator')) L.elevator = { x: cx, w: CORE_W.elevator };

  // Doors in every doorway. The one into the stairwell / lift is the household's front door.
  L.doors = [];
  const style = type === 'home' ? 'wood' : 'glass';
  for (const room of L.rooms) if (room.x > WALL && !L.rooms[room.id - 1]?.outdoor) L.doors.push({ f: room.f, x: room.x - WALL, style, open: 0 });
  if (coreW) for (let f = 0; f < n; f++) L.doors.push({ f, x: T.w - WALL - coreW - WALL, style: type === 'home' && f > 0 ? 'front' : style, open: 0 });
  return L;
}

// ---------- layer 2 + 3: the cut-away inside ----------
const STRUCT = '#cfc6b8', SLAB = '#8d8478', STAIR_BG = '#ddd6c9', SHAFT = '#4a4d52';

function bakeInterior(L, seed) {
  const cv = sprite(L.w, L.H), p = painter(cv), r = rng(seed);
  const { w, H, roofH, n, feet } = L;
  p.rect(0, roofH, w, H - roofH, STRUCT);
  p.rect(0, roofH, WALL, H - roofH, shade(STRUCT, 0.85)); // outer walls
  p.rect(w - WALL, roofH, WALL, H - roofH, shade(STRUCT, 0.85));

  for (let f = 0; f < n; f++) {
    const y = feet(f);
    if (f > 0) p.rect(0, y + 1, w, 2, SLAB);
    for (const room of L.rooms.filter((rm) => rm.f === f)) {
      const R = ROOMS[room.kind];
      if (room.outdoor) { openAir(p, room, y, f); continue; }
      p.rect(room.x, y - 27, room.w, 28, R.wall);
      if (R.tiles) for (let k = y - 25; k < y; k += 4) p.rect(room.x, k, room.w, 1, shade(R.wall, 0.94));
      p.rect(room.x, y - 1, room.w, 2, shade(R.wall, 0.8)); // skirting board
      if (f > 0) p.rect(room.x, y + 1, room.w, 1, R.floor);
      if (room.x > WALL) { // layer 3: doorway into the room on the left (a glass door onto a balcony)
        if (L.rooms[room.id - 1]?.outdoor) { p.rect(room.x - WALL, y - 21, WALL, 22, '#bfe3f5'); p.rect(room.x - WALL, y - 22, WALL, 1, '#8c939a'); }
        else doorway(p, room.x - WALL, y);
      }
      // ceiling lamp
      const mid = Math.round(room.x + room.w / 2);
      if (['desks', 'meeting', 'common', 'store', 'reception', 'hr', 'lounge'].includes(room.kind)) p.rect(mid - 5, y - 27, 11, 1, '#fbfbe8');
      else { p.rect(mid, y - 27, 1, 2, '#555'); p.rect(mid - 2, y - 25, 5, 2, '#f1d38a'); }
    }
  }
  if (L.stairs) drawStairs(p, L);
  if (L.elevator) drawShaft(p, L);
  for (const d of L.details) drawDetail(p, d, feet(d.f));
  for (const it of L.items) if (it.ready !== false) drawPiece(p, it, feet(it.f)); // flat-packs appear once assembled
  drawRoof(p, L, r);
  addGrain(cv);
  return cv;
}

// A balcony: open to the sky (the desktop shows through), with a floor and a railing.
function openAir(p, room, y, f) {
  const right = room.x + room.w;
  p.ctx.clearRect(0, y - 27, right, 28);
  if (f > 0) { p.rect(0, y + 1, right, 2, '#9a9a9a'); p.rect(0, y + 1, right, 1, '#b5b5b5'); }
  p.rect(0, y - 8, right, 1, '#6f767d');
  for (let k = 0; k < right; k += 3) p.rect(k, y - 7, 1, 8, '#8c939a');
}

export function drawBox(ctx, x, y, size, opened = false) { // a cardboard flat-pack, standing on row y
  const [w, h] = BOX[size];
  ctx.fillStyle = '#9b7a4a'; ctx.fillRect(Math.round(x), y - h + 1, w, h);
  ctx.fillStyle = '#c8a06a'; ctx.fillRect(Math.round(x), y - h + 1, w - 1, h - 1);
  ctx.fillStyle = opened ? '#9b7a4a' : '#e8d5a8'; ctx.fillRect(Math.round(x + w / 2) - 1, y - h + 1, 2, opened ? 1 : h - 1);
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
const FACADE = {
  siding(p, L, r) {
    const c = pick(r, ['#e9d8b4', '#cfe0e8', '#e8c9b9', '#d6e3c3', '#f0e6d0']);
    p.rect(0, L.roofH, L.w, L.H - L.roofH, c);
    for (let y = L.roofH + 2; y < L.H; y += 3) p.rect(0, y, L.w, 1, shade(c, 0.9));
  },
  brick(p, L) {
    p.rect(0, L.roofH, L.w, L.H - L.roofH, '#b5543b');
    for (let y = L.roofH; y < L.H; y += 3) {
      p.rect(0, y, L.w, 1, '#d8c4b0');
      for (let x = (y / 3) % 2 ? 0 : 3; x < L.w; x += 6) p.rect(x, y + 1, 1, 2, '#d8c4b0');
    }
  },
  stucco(p, L) {
    p.rect(0, L.roofH, L.w, L.H - L.roofH, '#e3d7c3');
    for (let f = 1; f < L.n; f++) p.rect(0, L.feet(f) + 1, L.w, 2, '#c9bba3');
  },
  panel(p, L) {
    p.rect(0, L.roofH, L.w, L.H - L.roofH, '#eceae4');
    for (let f = 1; f < L.n; f++) { p.rect(0, L.feet(f) + 1, L.w, 2, '#9aa0a6'); p.rect(4, L.feet(f) - 6, L.w - 8, 1, '#6f767d'); } // balconies
  },
  glass(p, L) {
    p.rect(0, L.roofH, L.w, L.H - L.roofH, '#7fa6c4');
    for (let x = 0; x < L.w; x += 8) p.rect(x, L.roofH, 1, L.H - L.roofH, '#4d6b85');
    for (let f = 0; f < L.n; f++) { p.rect(0, L.feet(f) - 27, L.w, 1, '#4d6b85'); p.rect(2, L.feet(f) - 24, L.w - 4, 3, '#a9c7dd'); }
  },
  shop(p, L) { p.rect(0, L.roofH, L.w, L.H - L.roofH, '#e4ddd0'); },
};

function bakeExterior(L, seed) {
  const cv = sprite(L.w, L.H), p = painter(cv), r = rng(seed + 7), T = L.T;
  FACADE[T.facade](p, L, r);
  const curtain = pick(r, ['#c0504d', '#4f81bd', '#7aa63f', '#e8833a', '#8064a2']);

  if (T.facade !== 'glass') {
    for (const room of L.rooms) {
      if (T.facade === 'shop' || room.w < 16 || room.outdoor) continue;
      const y = L.feet(room.f), x = Math.round(room.x + room.w / 2 - 5);
      p.rect(x - 1, y - 21, 12, 12, '#f5f2ec'); p.rect(x, y - 20, 10, 10, '#8fb8cf'); p.rect(x, y - 20, 10, 3, '#b5d6e6');
      p.rect(x + 5, y - 20, 1, 10, '#f5f2ec'); p.rect(x - 2, y - 9, 14, 1, shade('#f5f2ec', 0.8));
      p.rect(x, y - 20, 2, 7, curtain); p.rect(x + 8, y - 20, 2, 7, curtain);
    }
    if (L.stairs) for (let f = 0; f < L.n; f++) p.rect(L.stairs.x + 9, L.feet(f) - 22, 5, 12, '#8fb8cf');
  }

  for (const room of L.rooms) if (room.outdoor) openAir(p, room, L.feet(room.f), room.f);
  const gy = L.feet(0), d = L.door;
  if (T.facade === 'shop') {
    p.rect(d + 6, gy - 17, L.w - d - 10, 15, '#bfe0ef'); p.rect(d + 6, gy - 17, L.w - d - 10, 1, '#555');
    for (let x = d + 10; x < L.w - 6; x += 9) p.line(x, gy - 15, x + 4, gy - 11, '#e8f5fb'); // reflections
    for (let x = 0; x < L.w; x += 4) p.rect(x, gy - 22, 4, 4, (x / 4) % 2 ? '#ffffff' : '#d9534f'); // awning
    const sign = T.sign, sw = textWidth(sign) + 6, sx = Math.round(L.w / 2 - sw / 2);
    p.rect(sx, gy - 28, sw, 7, '#2c3e50'); p.text(sign, sx + 3, gy - 27, '#f1c40f');
    p.rect(d - 4, gy - 18, 9, 19, '#bfe0ef'); p.frame(d - 4, gy - 18, 9, 19, '#555');
  } else if (T.facade === 'glass' || T.facade === 'stucco') {
    p.rect(d - 5, gy - 20, 11, 21, '#bfe0ef'); p.frame(d - 5, gy - 20, 11, 21, '#3d4f61'); p.rect(d, gy - 20, 1, 21, '#3d4f61');
    p.rect(d - 7, gy - 22, 15, 2, '#3d4f61');
  } else {
    p.rect(d - 4, gy - 20, 9, 21, T.facade === 'brick' ? '#3d4f61' : '#7a4a2a'); p.frame(d - 4, gy - 20, 9, 21, '#f5f2ec');
    p.px(d + 2, gy - 9, '#f1c40f');
    if (T.facade === 'brick') p.rect(d - 7, gy - 23, 15, 2, '#2c3e50'); // entrance canopy
    else p.rect(d + 6, gy - 17, 1, 2, '#f1c40f'); // porch light
  }
  drawRoof(p, L, rng(seed));
  addGrain(cv);
  return cv;
}

function drawRoof(p, L, r) {
  const { w, roofH } = L, kind = L.T.roof;
  if (kind === 'pitched') {
    const shingle = pick(r, ['#8e3b2f', '#4d5b6a', '#6b4a3a', '#3f6b4f']);
    p.rect(Math.round(w * 0.68), 3, 6, roofH, '#9c4a35'); p.rect(Math.round(w * 0.68) - 1, 2, 8, 2, '#6f6f6f'); // chimney
    for (let i = 0; i < roofH + 2; i++) {
      const half = Math.round((w / 2) * ((i + 2) / (roofH + 2)));
      p.rect(w / 2 - half, i, half * 2, 1, (i >> 1) % 2 ? shingle : shade(shingle, 1.12));
    }
  } else {
    p.rect(0, roofH - 2, w, 4, '#7d756b'); p.rect(0, roofH - 2, w, 1, '#a39a8e');
    if (kind === 'flat') { p.rect(Math.round(w * 0.2), roofH - 5, 8, 3, '#a7adb3'); p.rect(Math.round(w * 0.2) + 2, roofH - 4, 4, 1, '#6f767d'); }
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
  constructor() { this.pos = 0; this.dir = 0; this.stops = new Set(); this.state = 'idle'; this.door = 0; this.timer = 0; }
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
        const step = 1.6 * dt; // floors per second
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
    for (const it of this.L.items) { it.ready = !it.flatpack || !!opts.furnished; it.progress = 0; }
    this.boxes = [];          // delivered flat-packs: { item, size, outside, f, lx, claimed, carried }
    this.ordered = new Set(); // households that have ordered their furniture
    this.interior = bakeInterior(this.L, seed);
    this.exterior = bakeExterior(this.L, seed);
    this.elevator = this.L.elevator ? new Elevator() : null;
    this.reveal = 0;
    this.build = null;   // { start, end } while under construction
    this.upgrade = null; // { next, start, end } while being rebuilt bigger
    this.x0 = 0; this.G = 0;
    this.light = new Map(); // home rooms: is the light switched on?
    this.occ = new Map();   // who was in each room last frame
  }
  place(cx, G) { this.x0 = Math.round(cx - this.L.w / 2); this.G = G; this.upgrade?.next.place(cx, G); }
  ready() { return !this.build; }
  feetY(f) { return this.G - f * FLOOR_H; }
  doorX() { return this.x0 + this.L.door; }
  elevX() { return this.x0 + this.L.elevator.x + 8; }
  stairX() { return this.x0 + this.L.stairs.x + 4; } // where every flight starts and ends
  stairPath(f, up) { return stairPath(this.L, f, up).map(([x, y]) => [this.x0 + x, this.G - (this.L.H - 1) + y]); }
  roomAt(f, x) { return this.L.rooms.find((r) => r.f === f && x >= this.x0 + r.x && x < this.x0 + r.x + r.w); }
  spots(act, unit) { return this.L.spots.filter((s) => s.act === act && s.item?.ready !== false && (unit === undefined || s.unit === unit)); }
  allSpots(act, unit) { return this.L.spots.filter((s) => s.act === act && (unit === undefined || s.unit === unit)); } // assembled or not
  rebake() { this.interior = bakeInterior(this.L, this.seed); }
  boxSpot(k) { // where the k-th delivered box goes: outside the front door, or the lobby's parcel shelf
    const shelf = this.L.items.find((it) => it.kind === 'parcelshelf');
    return shelf ? { outside: false, f: 0, lx: shelf.x + 1 + (k % 3) * 5 } : { outside: true, f: 0, lx: this.L.door + 7 + (k % 4) * 6 };
  }
  progress(now, job) { return Math.min(1, Math.max(0, (now - job.start) / (job.end - job.start))); }

  draw(ctx, people, drawPerson, w) {
    const { now, t } = w, L = this.L, top = this.G - (L.H - 1);
    const rows = this.build ? Math.floor(L.H * this.progress(now, this.build)) : L.H, sy = L.H - rows;
    if (rows > 0) {
      ctx.drawImage(this.interior, 0, sy, L.w, rows, this.x0, top + sy, L.w, rows);
      if (!this.build) {
        this.drawLive(ctx, people, t, new Date(now));
        if (this.elevator) this.drawElevator(ctx, people, drawPerson);
        for (const p of people) if (p.surface !== 'elev') drawPerson(p);
        this.drawOver(ctx, people, t);
        this.drawLights(ctx, people, w);
      }
      const a = this.build ? 1 : 1 - this.reveal;
      if (a > 0.02) {
        ctx.globalAlpha = a;
        ctx.drawImage(this.exterior, 0, sy, L.w, rows, this.x0, top + sy, L.w, rows);
        const n = nightLevel(w.hour), from = Math.max(sy, L.roofH);
        if (n > 0) { ctx.fillStyle = `rgba(10,16,40,${0.4 * n})`; ctx.fillRect(this.x0, top + from, L.w, L.H - from); }
        ctx.globalAlpha = 1;
      }
    }
    if (this.build) scaffold(ctx, this.x0, L.w, top, this.G, this.progress(now, this.build));
    if (this.upgrade) { const u = this.upgrade.next; scaffold(ctx, u.x0, u.L.w, u.G - (u.L.H - 1), u.G, this.progress(now, this.upgrade)); }
  }

  // Layer 3, live: screens, clocks, and appliances people are using.
  drawLive(ctx, people, t, date) {
    const X = this.x0, px = (x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    const stacked = new Map();
    for (const b of this.boxes) { // flat-packs waiting in the lobby or in a room
      if (b.outside || b.carried) continue;
      const key = `${b.f}:${b.lx}`, k = stacked.get(key) || 0; stacked.set(key, k + 1);
      drawBox(ctx, X + b.lx, this.feetY(b.f) - k * BOX[b.size][1], b.size, b.opened);
    }
    for (const d of this.L.doors) { // doors swing open as someone comes near, then close
      const cx = X + d.x + 1, near = people.some((p) => p.f === d.f && Math.abs(p.x - cx) < 6 && p.surface !== 'elev');
      d.open += ((near ? 1 : 0) - d.open) * 0.25;
      const y = this.feetY(d.f), w = Math.round(6 - 5 * d.open), x = X + d.x - 2;
      const [face, edge] = DOOR[d.style];
      px(x, y - 21, edge, w, 22); if (w > 2) px(x + 1, y - 20, face, w - 2, 20);
      if (w >= 4) px(x + w - 2, y - 10, d.style === 'glass' ? '#6f767d' : '#f1c40f'); // handle
    }
    for (const it of this.L.items) { // furniture being assembled: a ghost that fills in from the floor up
      if (it.ready || !it.progress) continue;
      const y = this.feetY(it.f), h = FURNITURE[it.kind].h + 12, shown = Math.ceil(h * it.progress);
      ctx.save(); ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.rect(X + it.x - 3, y - shown + 1, it.w + 6, shown); ctx.clip();
      drawPiece(painter(ctx), { ...it, x: X + it.x }, y);
      ctx.restore();
      ctx.fillStyle = '#c8a06a'; ctx.fillRect(X + it.x + it.w + 1, y, 6, 1); ctx.fillRect(X + it.x + it.w + 2, y - 1, 1, 1); // flattened box and a plank
    }
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
      if (p.anim !== 'bath') continue;
      const it = p.spot.item, ix = this.x0 + it.x, iy = this.feetY(it.f);
      ctx.fillStyle = '#9fd5f5'; ctx.fillRect(ix + 1, iy - 5, 14, 3);
      ctx.fillStyle = '#ffffff'; for (let j = 0; j < 4; j++) ctx.fillRect(ix + 2 + ((j * 4 + Math.floor(t * 2)) % 13), iy - 6, 1, 1);
    }
  }

  // ---------- lights ----------
  // Homes remember each switch. People switch a light on when they come into a dark room to do
  // something (rarely when just passing through), and whether they switch it off when they leave
  // depends on their habits. See LIGHT_HABITS below.
  updateLights(people, w) {
    if (this.type !== 'home') return;
    const dark = nightLevel(w.hour) > 0.3, now = new Map();
    for (const p of people) { const r = this.roomAt(p.f, p.x); if (r) (now.get(r) ?? now.set(r, []).get(r)).push(p); }
    for (const r of this.L.rooms) {
      if (r.kind === 'lobby' || r.outdoor) continue;
      const was = this.occ.get(r) ?? [], here = now.get(r) ?? [];
      for (const p of here) {
        // Heading here to do something (not just passing through)?
        const staying = p.anim !== 'sleep' && (p.spot?.room === r.id || p.plan.some((s) => s.t === 'do' && s.spot?.room === r.id && s.spot.f === p.f));
        if (dark && !this.light.get(r) && (!was.includes(p) || staying) && !p.switched?.has(r)) {
          (p.switched ??= new Set()).add(r); // one decision per visit
          if (Math.random() < (staying ? 0.97 : 0.2)) this.light.set(r, true);
        }
        if (p.anim === 'sleep' && !p.sleptWith?.has(r)) { // going to sleep: most switch off, a few don't
          (p.sleptWith ??= new Set()).add(r);
          const awake = here.some((q) => q.anim !== 'sleep');
          if (!awake && Math.random() > habit(p).sleepLit) this.light.set(r, false);
        }
        if (p.anim !== 'sleep') p.sleptWith?.delete(r);
      }
      for (const p of was) if (!here.includes(p)) p.switched?.delete(r);
      if (!here.length && was.length && this.light.get(r)) { // the last one out
        const p = was[was.length - 1], leavingHome = p.b !== this, h = habit(p);
        const off = (leavingHome ? h.offLeaving : h.offRoom) * (ROOM_LEFT_ON[r.kind] ?? 1);
        if (Math.random() < off) this.light.set(r, false);
      }
      this.occ.set(r, here);
    }
  }

  isLit(r, people, w) {
    const h = w.hour, occupied = people.some((p) => p.anim !== 'sleep' && this.roomAt(p.f, p.x) === r);
    if (r.kind === 'lobby' || r.kind === 'reception') return true; // lobbies are always lit
    if (this.type === 'shop') return h >= 7 && h < 22;
    if (this.type === 'office') {
      if (r.kind === 'washroom') return occupied; // motion sensor
      const roll = hashRoom(this.seed, r.id, w.day);
      return occupied || (h >= 7.5 && h < 19) || (h >= 19 && h < 22 && roll < 0.6) || roll < 0.2; // cleaners, then some left on all night
    }
    if (this.light.get(r)) return true;
    // Some homes keep the bathroom light on overnight as a night light.
    return r.kind === 'washroom' && hashRoom(this.seed, r.unit ?? 0, 0) < 0.15 && (h >= 22 || h < 6.5);
  }

  // After dark, lit rooms glow warm and the rest go dark. Stairwells and lift shafts stay lit.
  drawLights(ctx, people, w) {
    const n = nightLevel(w.hour);
    if (n <= 0) return;
    for (const r of this.L.rooms) {
      if (r.outdoor) continue;
      ctx.fillStyle = this.isLit(r, people, w) ? `rgba(255,210,120,${0.12 * n})` : `rgba(10,16,40,${0.5 * n})`;
      ctx.fillRect(this.x0 + r.x, this.feetY(r.f) - 27, r.w, 28);
    }
  }


  drawElevator(ctx, people, drawPerson) {
    const e = this.elevator, ex = this.x0 + this.L.elevator.x, cy = Math.round(this.feetY(e.pos));
    ctx.fillStyle = '#6b5a3c'; ctx.fillRect(ex + 1, cy - 23, 14, 24);
    ctx.fillStyle = '#d8c49a'; ctx.fillRect(ex + 2, cy - 22, 12, 22);
    ctx.fillStyle = '#fff6c8'; ctx.fillRect(ex + 5, cy - 22, 6, 1);
    for (const p of people) if (p.surface === 'elev') drawPerson(p);
    for (let f = 0; f < this.L.n; f++) { // sliding doors on every floor
      const open = e.pos === f ? e.door : 0, y = this.feetY(f), pw = Math.round(7 * (1 - open));
      ctx.fillStyle = Math.round(e.pos) === f ? '#ff9f43' : '#3a3a3a'; ctx.fillRect(ex + 13, y - 26, 1, 1); // car-is-here light
      if (e.state === 'moving') { // up / down arrow
        ctx.fillStyle = '#2ecc71';
        for (const [a, b] of e.dir > 0 ? [[1, 0], [0, 1], [2, 1]] : [[0, 0], [2, 0], [1, 1]]) ctx.fillRect(ex + 1 + a, y - 26 + b, 1, 1);
      }
      ctx.fillStyle = '#a9b1b8';
      ctx.fillRect(ex + 1, y - 21, pw, 22); ctx.fillRect(ex + 15 - pw, y - 21, pw, 22);
      ctx.fillStyle = '#7d858c';
      if (pw) { ctx.fillRect(ex + pw, y - 21, 1, 22); ctx.fillRect(ex + 15 - pw, y - 21, 1, 22); }
    }
  }
}

// Light-switch habits, from surveys: 90% of US households have someone who forgets lights; kitchens
// (49%) and bathrooms (28%) are left on most; 38% leave a light on because they plan to come back,
// 29% just forget; about 8% sleep with a light on.
const LIGHT_HABITS = [
  { share: 0.45, offRoom: 0.92, offLeaving: 0.98, sleepLit: 0.03 }, // careful
  { share: 0.40, offRoom: 0.65, offLeaving: 0.88, sleepLit: 0.08 }, // average
  { share: 0.15, offRoom: 0.3, offLeaving: 0.6, sleepLit: 0.25 },   // forgetful
];
const ROOM_LEFT_ON = { kitchen: 0.75, washroom: 0.85 }; // these get left on more often
function habit(p) {
  let k = (p.seed % 100) / 100;
  for (const h of LIGHT_HABITS) { if (k < h.share) return h; k -= h.share; }
  return LIGHT_HABITS[1];
}
const hashRoom = (a, b, c) => ((Math.imul(a ^ (b * 7919), 2654435761) ^ Math.imul(c + 13, 40503)) >>> 0) / 4294967296;

const DOOR = { wood: ['#b07a4a', '#6e4423'], front: ['#7a4a2a', '#3e2614'], glass: ['#d6e8f2', '#8c939a'] }; // [face, frame]

// 0 in the day, 1 at night, fading in from 6:30pm and out by 7am.
function nightLevel(h) { return h < 6 ? 1 : h < 7 ? 7 - h : h < 18.5 ? 0 : h < 20 ? (h - 18.5) / 1.5 : 1; }

function scaffold(ctx, x0, w, top, G, k) {
  const h = Math.max(4, Math.round((G - top + 1) * k)), y0 = G - h + 1;
  ctx.fillStyle = '#b07a3c';
  for (let x = x0 - 3; x <= x0 + w + 2; x += 12) ctx.fillRect(x, y0, 1, h);
  ctx.fillStyle = '#8a5a2b';
  for (let y = G - 10; y >= y0; y -= 10) ctx.fillRect(x0 - 4, y, w + 8, 1);
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(x0 - 4, y0, w + 8, 1);
}
