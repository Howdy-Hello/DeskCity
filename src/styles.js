// Building designs: the different looks each size of building comes in, outside and in.
// A building's design is picked when it's built (city.js picks one that suits the plot's zone and
// differs from its neighbours) and kept in its room plan (plan.style), so it always looks the same.
// Buildings from before designs existed have none and keep their original look (see buildings.js).
import { pick, shade, rng, textWidth } from './draw.js';
import { ROOMS } from './furniture.js';

export const hexMix = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
const hn = (a, b) => ((Math.imul(a + 1013, 73856093) ^ Math.imul(b + 7, 19349663)) >>> 0) % 100; // fixed noise

// Brick in a running bond: courses 3 cells tall (2 of brick, 1 of mortar), bricks 6 long, each
// course offset by half a brick; the mortar is a soft mix of the two colours so it reads as texture
// rather than a grid, and each brick is a shade lighter or darker than its neighbours.
export function brickWall(p, x0, y0, w, h, brick, mortar) {
  p.rect(x0, y0, w, h, hexMix(brick, mortar, 0.45));
  for (let row = 0, y = y0; y < y0 + h; row++, y += 3) {
    for (let x = x0 - (row % 2 ? 3 : 0); x < x0 + w; x += 6) {
      const n = ((Math.imul(x + 1013, 73856093) ^ Math.imul(row + 7, 19349663)) >>> 0) % 100, a = Math.max(x, x0), b = Math.min(x + 5, x0 + w);
      if (b > a) p.rect(a, y + 1, b - a, Math.min(2, y0 + h - y - 1), shade(brick, 0.9 + n / 500 + (n % 7 === 0 ? -0.06 : 0)));
    }
  }
}
// Rough-cut stone: courses 3 cells tall of blocks 4-8 long.
function stones(p, x0, y0, w, h, c) {
  p.rect(x0, y0, w, h, shade(c, 1.18));
  for (let row = 0, y = y0; y < y0 + h; row++, y += 3) {
    for (let x = x0 - (row % 2) * 3, k = 0; x < x0 + w; k++) {
      const n = hn(k * 7 + row * 31, row), len = 4 + (n % 5), a = Math.max(x, x0), b = Math.min(x + len - 1, x0 + w);
      if (b > a) p.rect(a, y, b - a, Math.min(2, y0 + h - y), shade(c, 0.86 + n / 350));
      x += len;
    }
  }
}

// ---------- the catalogue ----------
// STYLES[type][tier]: the designs for that size of building. The first is the original design.
// Fields override the size's own (TYPES in buildings.js): w (width), n (floors), flats (homes on
// the floors above the lobby), roof, facade, balconies, glass (a glass curtain wall: windows are
// whole floors). Plus: win (window style), door, zones (where it may go up; anywhere if left out),
// inside (the interior look), name.
export const STYLES = {
  home: [
    [{ id: 'cottage', name: 'Cottage' },
      { id: 'bungalow', name: 'Bungalow', w: 188, roof: 'hip', facade: 'bungalow', win: 'wide', door: 'porch', zones: ['suburb', 'midtown'], inside: 'retro' },
      { id: 'modern', name: 'Modern House', w: 172, roof: 'slab', facade: 'timber', win: 'wide', door: 'modern', inside: 'minimal' },
      { id: 'cabin', name: 'Cabin', w: 160, roof: 'steep', facade: 'logs', win: 'small', door: 'plank', zones: ['suburb'], inside: 'cabin' }],
    [{ id: 'house', name: 'House' },
      { id: 'georgian', name: 'Townhouse', w: 180, roof: 'hip', facade: 'georgian', win: 'sash', door: 'georgian', inside: 'heritage' },
      { id: 'tudor', name: 'Tudor House', w: 176, roof: 'steep', facade: 'tudor', win: 'lattice', door: 'arch', zones: ['suburb', 'midtown'], inside: 'tudor' },
      { id: 'modern2', name: 'Modern House', w: 184, roof: 'slab', facade: 'timber', win: 'wide', door: 'modern', inside: 'minimal' }],
    [{ id: 'apartments', name: 'Apartments' },
      { id: 'walkup', name: 'Walk-up', n: 3, flats: 2, roof: 'parapet', facade: 'escape', win: 'sash', door: 'stoop', balconies: 0, inside: 'heritage' },
      { id: 'riviera', name: 'Riviera', n: 6, flats: 5, roof: 'terracotta', facade: 'render', win: 'arched', balconies: 0.85, door: 'arch', zones: ['downtown', 'midtown'], inside: 'med' },
      { id: 'deco', name: 'Mansion Block', n: 6, flats: 5, roof: 'crown', facade: 'deco', win: 'tall', balconies: 0, door: 'deco', zones: ['downtown', 'midtown'], inside: 'deco' }],
    [{ id: 'condo', name: 'Condo Tower' },
      { id: 'glasscondo', name: 'Glass Condos', n: 12, flats: 11, roof: 'slab', facade: 'slabs', glass: true, balconies: 0.9, door: 'glass', zones: ['downtown'], inside: 'glassy' },
      { id: 'brickcondo', name: 'Brick Tower', n: 10, flats: 9, roof: 'crown', facade: 'brickrise', win: 'tall', balconies: 0.3, door: 'deco', inside: 'loft' }],
    [{ id: 'tower', name: 'Residential Tower' },
      { id: 'finstower', name: 'Fin Tower', n: 13, flats: 12, roof: 'spire', facade: 'fins', glass: true, balconies: 0, door: 'glass', zones: ['downtown'], inside: 'glassy' },
      { id: 'stripetower', name: 'Banded Tower', n: 14, flats: 13, roof: 'cornice', facade: 'stripes', win: 'band', balconies: 0.6, door: 'glass', inside: 'minimal' }],
  ],
  office: [
    [{ id: 'small', name: 'Small Office' },
      { id: 'studio', name: 'Studio', w: 164, roof: 'parapet', facade: 'studio', win: 'wide', door: 'glass', inside: 'creative' },
      { id: 'pavilion', name: 'Pavilion', w: 168, roof: 'slab', facade: 'timber', win: 'band', door: 'glass', inside: 'minimal' }],
    [{ id: 'office', name: 'Office' },
      { id: 'loft', name: 'Warehouse Lofts', w: 188, roof: 'parapet', facade: 'loft', win: 'steel', door: 'glass', inside: 'loft' },
      { id: 'glassbox', name: 'Glass Office', roof: 'slab', facade: 'slabs', glass: true, door: 'glass', inside: 'glassy' }],
    [{ id: 'glass', name: 'Office Tower' },
      { id: 'stone', name: 'Stone Tower', n: 11, roof: 'cornice', facade: 'limestone', win: 'band', door: 'glass', inside: 'classic' },
      { id: 'dark', name: 'Black Tower', n: 13, roof: 'spire', facade: 'fins', glass: true, door: 'glass', zones: ['downtown'], inside: 'exec' }],
  ],
};
export function styleOf(type, tier, id) { return id ? STYLES[type]?.[tier]?.find((s) => s.id === id) || null : null; }

// ---------- windows ----------
// Where each room's windows are (local x, top relative to the floor row, w, h): drawn on the outside
// and lit at night (buildings.js). Buildings without a design keep the original 10x10 in the middle.
export function windowRects(L, room) {
  const mid = room.x + room.w / 2, S = L.S;
  if (L.glass) return [[room.x + 1, -25, room.w - 2, 24]];
  const kind = (S && !(room.f === 0 && ROOMS[room.kind].venue) && !ROOMS[room.kind].noWindow && S.win) || 'classic';
  switch (kind) {
    case 'small': return [[Math.round(mid - 4), -19, 8, 8]];
    case 'wide': { const w = Math.min(22, room.w - 10); return [[Math.round(mid - w / 2), -21, w, 11]]; }
    case 'sash': return room.w >= 40 ? [[Math.round(mid - 10), -22, 7, 14], [Math.round(mid + 3), -22, 7, 14]] : [[Math.round(mid - 3), -22, 7, 14]];
    case 'lattice': return [[Math.round(mid - 5), -21, 10, 11]];
    case 'arched': return [[Math.round(mid - 5), -22, 10, 13]];
    case 'steel': { const w = Math.min(20, room.w - 10); return [[Math.round(mid - w / 2), -23, w, 15]]; }
    case 'tall': return room.w >= 44 ? [[Math.round(mid - 11), -23, 8, 16], [Math.round(mid + 3), -23, 8, 16]] : [[Math.round(mid - 4), -23, 8, 16]];
    case 'band': return [[room.x + 3, -20, room.w - 6, 9]];
    default: return [[Math.round(mid - 5), -20, 10, 10]];
  }
}

const CURTAINS = ['#c0504d', '#4f81bd', '#7aa63f', '#e8833a', '#8064a2'];
const GLASS = '#8fb8cf', SHINE = '#b5d6e6';
const WIN = {
  classic(p, x, t, w, h, P, c) { p.rect(x - 1, t - 1, w + 2, h + 2, P.frame); p.rect(x, t, w, h, GLASS); p.rect(x, t, w, 3, SHINE); p.rect(x + 5, t, 1, h, P.frame); p.rect(x - 2, t + h, w + 4, 1, shade(P.frame, 0.8)); p.rect(x, t, 2, 7, c); p.rect(x + w - 2, t, 2, 7, c); },
  small(p, x, t, w, h, P) { p.rect(x - 1, t - 1, w + 2, h + 2, P.frame); p.rect(x, t, w, h, GLASS); p.rect(x, t, w, 2, SHINE); p.rect(x + w / 2, t, 1, h, P.frame); p.rect(x, t + h / 2, w, 1, P.frame); },
  wide(p, x, t, w, h, P, c) {
    p.rect(x - 1, t - 1, w + 2, h + 2, P.frame); p.rect(x, t, w, h, GLASS); p.rect(x, t, w, 3, SHINE);
    for (const k of [Math.round(w / 3), Math.round((2 * w) / 3)]) p.rect(x + k, t, 1, h, P.frame);
    p.rect(x - 2, t + h + 1, w + 4, 1, shade(P.frame, 0.8)); p.rect(x, t, 2, 6, c); p.rect(x + w - 2, t, 2, 6, c);
  },
  sash(p, x, t, w, h, P, c) { p.rect(x - 1, t - 1, w + 2, h + 2, P.frame); p.rect(x, t, w, h, GLASS); p.rect(x, t, w, 2, SHINE); p.rect(x, t + 6, w, 1, P.frame); p.rect(x + 3, t, 1, h, P.frame); p.rect(x - 1, t + h + 1, w + 2, 1, shade(P.frame, 0.8)); p.rect(x, t, 1, 6, c); p.rect(x + w - 1, t, 1, 6, c); if (P.shutter) { p.rect(x - 4, t - 1, 3, h + 2, P.shutter); p.rect(x + w + 1, t - 1, 3, h + 2, P.shutter); } },
  lattice(p, x, t, w, h, P) { p.rect(x - 1, t - 1, w + 2, h + 2, P.frame); p.rect(x, t, w, h, '#a9c6d1'); for (let k = 2; k < w; k += 3) p.rect(x + k, t, 1, h, P.frame); for (let k = 2; k < h; k += 3) p.rect(x, t + k, w, 1, P.frame); p.rect(x - 2, t + h + 1, w + 4, 1, shade(P.frame, 0.8)); },
  arched(p, x, t, w, h, P, c) {
    p.rect(x - 1, t + 1, w + 2, h, P.frame); p.rect(x + 1, t - 1, w - 2, 2, P.frame); // the arch
    p.rect(x, t + 2, w, h - 2, GLASS); p.rect(x + 2, t, w - 4, 2, SHINE); p.rect(x + w / 2, t, 1, h, P.frame);
    p.rect(x, t + 2, 2, 6, c); p.rect(x + w - 2, t + 2, 2, 6, c);
    if (P.shutter) for (const sx of [x - 4, x + w + 1]) { p.rect(sx, t + 1, 3, h, P.shutter); for (let k = t + 2; k < t + h; k += 2) p.rect(sx, k, 3, 1, shade(P.shutter, 0.75)); }
    p.rect(x - 2, t + h + 1, w + 4, 1, shade(P.frame, 0.8));
  },
  steel(p, x, t, w, h, P) { p.rect(x - 1, t - 1, w + 2, h + 2, P.frame); p.rect(x, t, w, h, '#9cbfcf'); p.rect(x, t, w, 3, SHINE); for (let k = 4; k < w; k += 5) p.rect(x + k, t, 1, h, P.frame); for (let k = 5; k < h; k += 5) p.rect(x, t + k, w, 1, P.frame); p.rect(x - 2, t + h + 1, w + 4, 1, '#cfc6b8'); },
  tall(p, x, t, w, h, P, c) { p.rect(x - 1, t - 1, w + 2, h + 2, P.frame); p.rect(x, t, w, h, GLASS); p.rect(x, t, w, 3, SHINE); p.rect(x, t + 5, w, 1, P.frame); p.rect(x, t + 5, 1, h - 5, c); p.rect(x + w - 1, t + 5, 1, h - 5, c); if (P.spandrel) p.rect(x - 1, t + h + 1, w + 2, 3, P.spandrel); },
  band(p, x, t, w, h, P) { p.rect(x - 1, t - 1, w + 2, h + 2, P.frame); p.rect(x, t, w, h, GLASS); p.rect(x, t, w, 2, SHINE); for (let k = 7; k < w; k += 8) p.rect(x + k, t, 1, h, P.frame); },
};

// ---------- doors ----------
const DOORS = {
  plain(p, d, gy, P) { p.rect(d - 4, gy - 20, 9, 21, P.door); p.frame(d - 4, gy - 20, 9, 21, P.frame); p.px(d + 2, gy - 9, '#f1c40f'); },
  porch(p, d, gy, P) { // a porch roof on two posts, and a light
    DOORS.plain(p, d, gy, P);
    p.rect(d - 7, gy - 25, 30, 2, P.roof); p.rect(d - 7, gy - 23, 30, 1, shade(P.roof, 0.7));
    p.rect(d + 7, gy - 22, 2, 23, P.trim); p.rect(d + 20, gy - 22, 2, 23, P.trim); p.rect(d - 7, gy, 30, 1, shade(P.trim, 0.8));
    p.rect(d + 9, gy - 8, 11, 1, P.trim); for (let k = d + 10; k < d + 20; k += 2) p.rect(k, gy - 7, 1, 7, P.trim); // a little railing
    p.rect(d + 6, gy - 17, 1, 2, '#f1c40f');
  },
  modern(p, d, gy, P) { // a tall dark door, a strip of glass beside it, a slab canopy
    p.rect(d - 4, gy - 22, 9, 23, '#2f3337'); p.rect(d + 5, gy - 22, 3, 23, GLASS); p.rect(d + 2, gy - 12, 1, 4, '#c9cdd1');
    p.rect(d - 8, gy - 24, 20, 2, '#3d3f42'); p.rect(d - 2, gy - 23, 1, 1, '#fff3c4');
  },
  plank(p, d, gy, P) { p.rect(d - 4, gy - 19, 9, 20, '#6e4423'); for (let k = d - 2; k < d + 5; k += 2) p.rect(k, gy - 19, 1, 20, '#5a361b'); p.rect(d - 4, gy - 14, 9, 1, '#3d2611'); p.rect(d - 4, gy - 6, 9, 1, '#3d2611'); p.rect(d + 7, gy - 16, 2, 3, '#f5b041'); p.rect(d + 7, gy - 17, 2, 1, '#2b2b2e'); },
  georgian(p, d, gy, P) { // pillars, a fanlight over the door and a little pediment
    p.rect(d - 9, gy - 26, 19, 27, '#efe9de'); p.rect(d - 4, gy - 20, 9, 21, P.door); p.px(d + 2, gy - 9, '#d4ac0d');
    p.rect(d - 3, gy - 24, 7, 3, GLASS); p.rect(d - 2, gy - 25, 5, 1, GLASS); for (const k of [-2, 0, 2]) p.px(d + k, gy - 23, '#efe9de');
    p.rect(d - 8, gy - 22, 2, 23, '#ffffff'); p.rect(d + 7, gy - 22, 2, 23, '#ffffff');
    p.rect(d - 10, gy - 27, 21, 1, shade('#efe9de', 0.8)); p.line(d - 10, gy - 28, d, gy - 32, '#efe9de'); p.line(d + 10, gy - 28, d, gy - 32, '#efe9de');
  },
  arch(p, d, gy, P) { p.rect(d - 5, gy - 19, 11, 20, P.frame); p.rect(d - 3, gy - 21, 7, 2, P.frame); p.rect(d - 4, gy - 18, 9, 19, '#6e4423'); p.rect(d - 2, gy - 20, 5, 2, '#6e4423'); p.rect(d, gy - 20, 1, 21, '#4a2c14'); p.px(d + 2, gy - 9, '#d4ac0d'); p.rect(d + 8, gy - 17, 2, 3, '#f5b041'); },
  stoop(p, d, gy, P) { // steps up to the door, with railings, under a little canopy
    DOORS.plain(p, d, gy, { ...P, door: P.door || '#2c3e50' });
    p.rect(d - 7, gy - 23, 15, 2, P.iron || '#2b2b2e');
    p.rect(d - 7, gy - 1, 15, 2, '#b8b0a4'); p.rect(d - 9, gy + 0, 19, 1, '#a39a8e');
    p.rect(d - 8, gy - 7, 1, 8, '#2b2b2e'); p.rect(d + 8, gy - 7, 1, 8, '#2b2b2e');
  },
  deco(p, d, gy, P) { p.rect(d - 6, gy - 22, 13, 23, '#c9a227'); p.rect(d - 5, gy - 21, 11, 22, '#2b2f33'); p.rect(d - 4, gy - 20, 4, 21, GLASS); p.rect(d + 1, gy - 20, 4, 21, GLASS); p.rect(d - 9, gy - 25, 19, 2, '#2b2f33'); p.rect(d - 9, gy - 23, 19, 1, '#c9a227'); },
  glass(p, d, gy, P) { p.rect(d - 6, gy - 20, 13, 21, '#bfe0ef'); p.frame(d - 6, gy - 20, 13, 21, P.frame === '#f5f2ec' ? '#3d4f61' : P.frame); p.rect(d, gy - 20, 1, 21, P.frame === '#f5f2ec' ? '#3d4f61' : P.frame); p.rect(d - 9, gy - 23, 19, 2, '#3d4f61'); },
};

// ---------- the outsides ----------
// pal(r) picks the colours (fixed by the building's seed, so the roof and the inside can use them
// too); wall paints the walls; after (optional) adds what goes in front of the windows.
const BRICKS = [{ brick: '#b5543b', mortar: '#d8c4b0' }, { brick: '#9c4a35', mortar: '#d9cbb8' }, { brick: '#c9a27a', mortar: '#efe2cc' }, { brick: '#8a5a44', mortar: '#cdbba6' }, { brick: '#8d8f94', mortar: '#d5d6d8' }];
const SHINGLES = ['#8e3b2f', '#4d5b6a', '#6b4a3a', '#3f6b4f', '#5b3f66', '#3b4a5a', '#7a5c3a'];
const floorLines = (p, L, c, h = 1) => { for (let f = 1; f < L.n; f++) p.rect(0, L.feet(f) + 1, L.w, h, c); };
const sides = (p, L, c, w = 2) => { p.rect(0, L.roofH, w, L.H - L.roofH, c); p.rect(L.w - w, L.roofH, w, L.H - L.roofH, c); };
const FACADES = {
  bungalow: {
    pal: (r) => ({ wall: pick(r, ['#e8d9b5', '#d9e4ea', '#efd5c3', '#dfe6cf', '#f1e7d0', '#e6dcea']), stone: pick(r, ['#9a8f84', '#a39182', '#8c8f94']), trim: '#f5f2ec', frame: '#f5f2ec', door: pick(r, ['#7a4a2a', '#b03a2e', '#1f3a5f', '#2c5f2d', '#d4a017']), roof: pick(r, ['#6b4a3a', '#4d5b6a', '#7a5c3a', '#3f4a3f']) }),
    wall(p, L, P) {
      p.rect(0, L.roofH, L.w, L.H - L.roofH, P.wall);
      for (let y = L.roofH + 2; y < L.H; y += 3) p.rect(0, y, L.w, 1, shade(P.wall, 0.9)); // lap siding
      stones(p, 0, L.H - 9, L.w, 9, P.stone); // a stone base
      sides(p, L, P.trim);
    },
  },
  timber: {
    pal: (r) => ({ wall: pick(r, ['#f2f1ec', '#e9eaea', '#ece6dc', '#dcdfe1']), wood: pick(r, ['#9a6b43', '#b0703c', '#6e5440', '#3b3430']), frame: '#2f3337', trim: '#2f3337', side: r() < 0.5 ? -1 : 1, roof: '#3d3f42', door: '#2f3337' }),
    wall(p, L, P) { // white render with one side clad in vertical timber slats
      const top = L.roofH, h = L.H - top, cw = Math.round(L.w * 0.38), cx = P.side < 0 ? 0 : L.w - cw;
      p.rect(0, top, L.w, h, P.wall);
      p.rect(cx, top, cw, h, P.wood);
      for (let x = cx + 2; x < cx + cw; x += 3) p.rect(x, top, 1, h, shade(P.wood, 0.78));
      p.rect(cx === 0 ? cw : cx - 1, top, 1, h, shade(P.wall, 0.82));
      floorLines(p, L, shade(P.wall, 0.86));
    },
  },
  logs: {
    pal: (r) => ({ wood: pick(r, ['#8b5a2b', '#7a4e26', '#9c6b3d', '#86603f']), frame: '#f0e6d2', trim: '#5b3a1e', door: '#6e4423', roof: pick(r, ['#3f4a3f', '#4d4038', '#6b3a2e']) }),
    wall(p, L, P) { // stacked logs, their ends crossing at the corners
      for (let y = L.roofH, k = 0; y < L.H; y += 4, k++) {
        p.rect(0, y, L.w, 3, shade(P.wood, k % 2 ? 0.94 : 1.04)); p.rect(0, y + 3, L.w, 1, shade(P.wood, 0.6));
        for (const x of [0, L.w - 3]) { p.rect(x, y, 3, 3, shade(P.wood, 1.32)); p.px(x + 1, y + 1, shade(P.wood, 0.9)); }
      }
    },
  },
  georgian: {
    pal: (r) => ({ ...pick(r, BRICKS.slice(0, 4)), frame: '#f5f2ec', trim: '#f5f2ec', door: pick(r, ['#1f3a5f', '#2c2c2c', '#7b2d26', '#2c5f2d']), roof: pick(r, ['#4d5b6a', '#3b4a5a', '#5b5b5b']), shutter: r() < 0.3 ? pick(r, ['#2c2c2c', '#1f3a5f']) : null }),
    wall(p, L, P) { // brick, white stone quoins at the corners, a string course at each floor, a plinth
      brickWall(p, 0, L.roofH, L.w, L.H - L.roofH, P.brick, P.mortar);
      for (let y = L.roofH, k = 0; y < L.H - 3; y += 3, k++) { const q = k % 2 ? 4 : 7; p.rect(0, y, q, 2, '#efe9de'); p.rect(L.w - q, y, q, 2, '#efe9de'); }
      floorLines(p, L, '#efe9de', 2);
      p.rect(0, L.H - 3, L.w, 3, '#cfc6b8');
    },
  },
  tudor: {
    pal: (r) => ({ render: pick(r, ['#efe6d2', '#f2ead9', '#ebe3cf']), beam: pick(r, ['#3b2a1c', '#4a3322', '#2e2420']), ...pick(r, BRICKS.slice(0, 2)), frame: '#3b2a1c', trim: '#3b2a1c', door: '#6e4423', roof: pick(r, ['#4a3a32', '#5b4636', '#3b3b3b']) }),
    wall(p, L, P) { // brick downstairs; upstairs white render between dark oak timbers
      p.rect(0, L.roofH, L.w, L.H - L.roofH, P.render);
      brickWall(p, 0, L.feet(0) - 27, L.w, 28, P.brick, P.mortar);
      for (let f = 1; f < L.n; f++) {
        const y = L.feet(f), y0 = y - 27;
        p.rect(0, y + 1, L.w, 2, P.beam); p.rect(0, y0 - 1, L.w, 2, P.beam);
        for (let x = 0; x < L.w; x += 22) {
          const px = Math.min(x, L.w - 2); p.rect(px, y0, 2, 28, P.beam);
          if (x + 22 < L.w) { p.line(px + 2, y - 1, px + 8, y - 7, P.beam); p.line(px + 20, y - 1, px + 14, y - 7, P.beam); } // knee braces
        }
        p.rect(L.w - 2, y0, 2, 28, P.beam);
      }
    },
  },
  render: {
    pal: (r) => ({ wall: pick(r, ['#f2d3b3', '#cfe3d4', '#f3e2a9', '#ecc9c4', '#d8e2ee', '#f4e6d2']), frame: '#f5f2ec', shutter: pick(r, ['#2c6e8f', '#3f7d4f', '#8a5a2b', '#5b6f8a']), trim: '#f5f2ec', door: '#6e4423' }),
    wall(p, L, P) { // warm render, a darker ground floor, pale bands at the floors
      p.rect(0, L.roofH, L.w, L.H - L.roofH, P.wall);
      p.rect(0, L.H - 30, L.w, 30, shade(P.wall, 0.88));
      floorLines(p, L, shade(P.wall, 1.07), 2);
      sides(p, L, shade(P.wall, 0.93));
    },
  },
  deco: {
    pal: (r) => ({ wall: pick(r, ['#e9dfc9', '#dfe7e4', '#efd9c3', '#e6e0ef']), spandrel: pick(r, ['#2f6f6a', '#b08d3c', '#7a3b52', '#2d4a7a']), frame: '#2b2f33', door: '#2b2f33' }),
    wall(p, L, P) { // pale stone with fluted pilasters, a black granite ground floor with a gold line
      p.rect(0, L.roofH, L.w, L.H - L.roofH, P.wall);
      for (let x = 6; x < L.w - 4; x += 16) { p.rect(x, L.roofH, 2, L.H - L.roofH, shade(P.wall, 0.86)); p.rect(x + 2, L.roofH, 1, L.H - L.roofH, shade(P.wall, 1.05)); }
      p.rect(0, L.H - 30, L.w, 30, '#2b2f33'); p.rect(0, L.H - 31, L.w, 1, '#c9a227');
      for (let x = 4; x < L.w; x += 12) p.rect(x, L.H - 28, 1, 26, '#3a3f45');
    },
  },
  escape: {
    pal: (r) => ({ ...pick(r, BRICKS), frame: '#f5f2ec', iron: '#2b2b2e', door: pick(r, ['#2c3e50', '#5b2c2c', '#2c5f2d']), side: r() < 0.5 }),
    wall(p, L, P) { // brick walk-up: a stone lintel band at each floor
      brickWall(p, 0, L.roofH, L.w, L.H - L.roofH, P.brick, P.mortar);
      floorLines(p, L, '#d9cfc0', 2);
    },
    after(p, L, P) { // the fire escape: a landing on every floor, stairs between them, a drop ladder
      const x0 = P.side ? 6 : (L.stairs ? L.stairs.x - 34 : L.w - 34), w = 26;
      for (let f = 1; f < L.n; f++) {
        const y = L.feet(f);
        p.rect(x0, y + 1, w, 1, P.iron); p.rect(x0, y - 7, w, 1, P.iron);
        for (let k = x0; k <= x0 + w; k += 3) p.rect(k, y - 6, 1, 7, P.iron);
        if (f < L.n - 1) { p.line(x0 + w - 3, y, x0 + 6, y - 29, P.iron); p.line(x0 + w - 2, y, x0 + 7, y - 29, P.iron); }
      }
      const y1 = L.feet(1);
      p.rect(x0 + 2, y1 + 2, 1, 12, P.iron); p.rect(x0 + 6, y1 + 2, 1, 12, P.iron);
      for (let y = y1 + 4; y < y1 + 14; y += 3) p.rect(x0 + 2, y, 5, 1, P.iron);
    },
  },
  brickrise: {
    pal: (r) => ({ ...pick(r, BRICKS), frame: '#2b2f33', spandrel: null, door: '#2b2f33' }),
    wall(p, L, P) { // a brick tower: stone bands every floor, a stone base
      brickWall(p, 0, L.roofH, L.w, L.H - L.roofH, P.brick, P.mortar);
      floorLines(p, L, '#d9cfc0', 2);
      p.rect(0, L.H - 30, L.w, 30, '#b8b0a4'); for (let y = L.H - 27; y < L.H; y += 4) p.rect(0, y, L.w, 1, '#a39a8e');
      sides(p, L, shade(P.brick, 0.8), 3);
    },
  },
  slabs: {
    pal: (r) => ({ glass: pick(r, ['#9fc3d6', '#8fb5c9', '#a7c7c2', '#a9b9cf']), slab: pick(r, ['#f2f2ef', '#e8e6e1', '#d9dcdf']), frame: '#3d4f61', door: '#2f3337' }),
    wall(p, L, P) { // floor-to-ceiling glass between white floor slabs
      p.rect(0, L.roofH, L.w, L.H - L.roofH, P.glass);
      for (let x = 0; x < L.w; x += 12) p.rect(x, L.roofH, 1, L.H - L.roofH, shade(P.glass, 0.8));
      for (let f = 0; f < L.n; f++) p.rect(0, L.feet(f) - 26, L.w, 3, shade(P.glass, 1.14));
      for (let f = 1; f < L.n; f++) { const y = L.feet(f); p.rect(0, y + 1, L.w, 3, P.slab); p.rect(0, y + 4, L.w, 1, shade(P.slab, 0.72)); }
      sides(p, L, P.slab, 3);
    },
  },
  fins: {
    pal: (r, L) => (L.T.units // flats: lighter, warmer glass; offices: near-black
      ? { glass: pick(r, ['#4b6a78', '#56705f', '#6a5f55', '#4f5f7a']), fin: pick(r, ['#e8e2d6', '#c9a96e', '#d0d6dc']), frame: '#2b3440', door: '#2b3440' }
      : { glass: pick(r, ['#2b3440', '#24303a', '#2f3a33', '#3a3530']), fin: pick(r, ['#b08d57', '#aab4bd', '#c9a96e']), frame: '#1b2028', door: '#1b2028' }),
    wall(p, L, P) { // dark glass behind slim metal fins
      p.rect(0, L.roofH, L.w, L.H - L.roofH, P.glass);
      for (let f = 0; f < L.n; f++) { const y = L.feet(f); p.rect(0, y - 26, L.w, 2, shade(P.glass, 1.6)); p.rect(0, y + 1, L.w, 2, shade(P.glass, 0.7)); }
      for (let x = 3; x < L.w; x += 6) p.rect(x, L.roofH, 1, L.H - L.roofH, P.fin);
      sides(p, L, P.fin, 2);
    },
  },
  stripes: {
    pal: (r) => ({ wall: pick(r, ['#ecebe6', '#e9ecef', '#efe7dc']), band: pick(r, ['#c0504d', '#2e6f9e', '#d18f2f', '#3d7a5a', '#5d5d66']), frame: '#4a4f55', door: '#2f3337' }),
    wall(p, L, P) { // white with a coloured band under every floor's ribbon of windows
      p.rect(0, L.roofH, L.w, L.H - L.roofH, P.wall);
      for (let f = 0; f < L.n; f++) { const y = L.feet(f); p.rect(0, y - 8, L.w, 7, P.band); p.rect(0, y - 1, L.w, 2, shade(P.wall, 0.84)); }
    },
  },
  limestone: {
    pal: (r) => ({ stone: pick(r, ['#e3d9c3', '#d9d4c8', '#e6dccb']), base: pick(r, ['#7d7873', '#6f6a66', '#8a7f74']), frame: '#3d4148', door: '#3d4148' }),
    wall(p, L, P) { // limestone courses, deep stone spandrels, a two-storey granite base
      p.rect(0, L.roofH, L.w, L.H - L.roofH, P.stone);
      for (let y = L.roofH + 3; y < L.H; y += 4) p.rect(0, y, L.w, 1, shade(P.stone, 0.94));
      for (let f = 0; f < L.n; f++) { const y = L.feet(f); p.rect(0, y - 9, L.w, 9, shade(P.stone, 0.9)); p.rect(0, y + 1, L.w, 1, shade(P.stone, 0.8)); }
      const base = Math.min(L.n, 2) * 30;
      p.rect(0, L.H - base, L.w, base, P.base); for (let y = L.H - base + 4; y < L.H; y += 5) p.rect(0, y, L.w, 1, shade(P.base, 0.85));
      sides(p, L, shade(P.stone, 0.88), 4);
    },
  },
  loft: {
    pal: (r) => ({ brick: pick(r, ['#8e3b2a', '#7a3324', '#9c4a35']), mortar: '#c9b8a6', frame: '#2b2b2e', door: '#2b2b2e' }),
    wall(p, L, P) { brickWall(p, 0, L.roofH, L.w, L.H - L.roofH, P.brick, P.mortar); floorLines(p, L, shade(P.brick, 0.7), 2); },
    after(p, L, P) { // an old painted sign high on the wall, faded
      const name = L.companies?.[0]?.name || 'WORKS', sw = textWidth(name) * 2, sx = Math.round(L.w / 2 - sw / 2);
      p.text(name, sx, L.roofH + 2, 'rgba(242,236,224,0.55)', 2);
    },
  },
  studio: {
    pal: (r) => ({ ...pick(r, BRICKS), awning: pick(r, ['#2e8b57', '#d9534f', '#2c6fb3', '#e6a23c']), frame: '#2b2b2e', door: '#2b2b2e' }),
    wall(p, L, P) { brickWall(p, 0, L.roofH, L.w, L.H - L.roofH, P.brick, P.mortar); },
    after(p, L, P) { // a striped awning over each window
      for (const [id, rects] of L.wins) {
        if (L.rooms[id].f !== 0) continue;
        for (const [x, t, w] of rects) { const y = L.feet(0) + t - 5; for (let k = -2, i = 0; k < w + 2; k += 3, i++) p.rect(x + k, y, Math.min(3, w + 2 - k), 3, i % 2 ? '#ffffff' : P.awning); p.rect(x - 2, y + 3, w + 4, 1, shade(P.awning, 0.7)); }
      }
    },
  },
};
export function palette(L, seed) { return FACADES[L.T.facade]?.pal(rng(seed ^ 0x9e3779b9), L) || null; }

// Walls, windows and door of a building with a design (buildings.js draws its shop front, balconies and roof).
export function paintFacade(p, L, r) {
  const F = FACADES[L.T.facade], P = L.pal;
  F.wall(p, L, P, r);
  const curtain = pick(r, CURTAINS), kind = L.S.win || 'classic';
  if (!L.glass) {
    for (const room of L.rooms) {
      if (room.outdoor || room.w < 16 || ROOMS[room.kind].noWindow || (room.f === 0 && ROOMS[room.kind].venue)) continue;
      for (const [x, t, w, h] of L.wins.get(room.id) || []) WIN[kind](p, x, L.feet(room.f) + t, w, h, P, curtain);
    }
    if (L.stairs) for (let f = 0; f < L.n; f++) { const y = L.feet(f); p.rect(L.stairs.x + 8, y - 23, 7, 14, P.frame); p.rect(L.stairs.x + 9, y - 22, 5, 12, GLASS); }
  }
  F.after?.(p, L, P, r);
}
export function paintDoor(p, L, gy) { (DOORS[L.S.door] || DOORS.plain)(p, L.door, gy, { frame: '#e8e2d6', door: '#3d4f61', trim: '#f5f2ec', roof: '#4d5b6a', ...L.pal }); }

// ---------- roofs ----------
export const ROOFS_H = { hip: 14, steep: 22, slab: 4, parapet: 7, terracotta: 9, crown: 22, cornice: 9, spire: 34 };
export function paintRoof(p, L, r) {
  const { w, roofH } = L, P = L.pal || {}, kind = L.T.roof, face = P.wall || P.stone || P.brick || P.slab || P.glass || '#cfc6b8';
  if (kind === 'hip') { // a hipped roof: sloping on all four sides, so a short ridge
    const sh = P.roof || pick(r, SHINGLES);
    for (let i = 0; i < roofH + 1; i++) { const half = Math.round(w * 0.22 + w * 0.28 * ((i + 1) / (roofH + 1))); p.rect(w / 2 - half, i, half * 2, 1, (i >> 1) % 2 ? sh : shade(sh, 1.12)); }
    p.rect(Math.round(w * 0.28), 0, Math.round(w * 0.44), 1, shade(sh, 0.7));
    if (r() < 0.6) { const cx = Math.round(w * (r() < 0.5 ? 0.3 : 0.64)); p.rect(cx, -0, 6, 5, '#9c4a35'); p.rect(cx - 1, 0, 8, 1, '#6f6f6f'); }
  } else if (kind === 'slab') { // a thin flat roof that overhangs a little; maybe solar panels
    p.rect(0, roofH - 4, w, 2, '#3d3f42'); p.rect(0, roofH - 2, w, 2, '#e8e6e1');
    if (r() < 0.45) for (let k = 0; k < 3; k++) { p.rect(Math.round(w * 0.5) + k * 9, roofH - 7, 8, 3, '#2c3e66'); p.rect(Math.round(w * 0.5) + k * 9, roofH - 7, 8, 1, '#5d7bb3'); }
  } else if (kind === 'parapet') { // a parapet wall with a stone coping and dentils; chimney pots behind
    for (const cx of [Math.round(w * 0.18), Math.round(w * 0.76)]) { p.rect(cx, 0, 7, 4, P.brick || face); p.rect(cx + 1, 0, 2, 1, '#9c4a35'); p.rect(cx + 4, 0, 2, 1, '#9c4a35'); }
    p.rect(0, roofH - 5, w, 5, P.brick ? shade(P.brick, 0.95) : face); p.rect(0, roofH - 6, w, 2, '#e6ddd0'); for (let x = 1; x < w; x += 3) p.px(x, roofH - 3, '#cfc6b8');
  } else if (kind === 'terracotta') { // a low terracotta tile roof
    const tile = '#c4643c';
    for (let i = 0; i < roofH + 1; i++) { const half = Math.round((w / 2 + 2) * ((i + 4) / (roofH + 4))); p.rect(w / 2 - half, i, half * 2, 1, i % 2 ? tile : shade(tile, 1.1)); for (let x = Math.round(w / 2 - half) + (i % 2) * 2; x < w / 2 + half; x += 4) p.px(x, i, shade(tile, 0.75)); }
    p.rect(w / 2 - 8, 0, 16, 1, shade(tile, 0.7));
  } else if (kind === 'crown' || kind === 'spire') { // art deco setbacks, a flagpole or a needle with a light
    const steps = kind === 'crown' ? [[0, 7], [12, 7], [28, 6]] : [[0, 8], [14, 8]];
    let y = roofH;
    for (const [inset, h] of steps) { y -= h; p.rect(inset, y, w - 2 * inset, h, shade(face, 0.95)); p.rect(inset, y, w - 2 * inset, 1, shade(face, 1.1)); p.rect(inset, y + h - 1, w - 2 * inset, 1, shade(face, 0.8)); if (P.fin || P.spandrel) p.rect(inset, y + 2, w - 2 * inset, 1, P.fin || P.spandrel); }
    p.rect(Math.round(w / 2), 0, 1, y, '#6f767d'); p.px(Math.round(w / 2), 0, kind === 'spire' ? '#e74c3c' : '#c9a227');
  } else if (kind === 'cornice') { // a heavy stone cornice; the lift's machine room behind it
    p.rect(Math.round(w * 0.6), 0, Math.round(w * 0.24), roofH - 3, '#a7adb3'); p.rect(Math.round(w * 0.6), 0, Math.round(w * 0.24), 1, '#6f767d');
    p.rect(0, roofH - 4, w, 4, shade(face, 0.92)); p.rect(0, roofH - 5, w, 1, shade(face, 1.08)); for (let x = 1; x < w; x += 3) p.px(x, roofH - 2, shade(face, 0.75));
  }
  if (L.hq && L.companies?.[0]) { // the headquarters puts its name on the roof
    const name = L.companies[0].name, sw = textWidth(name) + 6, sx = Math.round(w / 2 - sw / 2), y = Math.max(0, roofH - 12);
    p.rect(sx, y, sw, 8, '#1f2a44'); p.text(name, sx + 3, y + 2, L.companies[0].color);
  }
}

// ---------- the insides ----------
// Each design has an interior look: paint for its rooms (each room picks one), a finish per kind of
// room, the floor, and the ceiling lights. Only living and working rooms take the look; shops,
// cafes, washrooms and lobbies keep their own. Homes without a design get a little variety too.
const LIVING = new Set(['bedroom', 'kitchen', 'living', 'study', 'gym']), WORKING = new Set(['desks', 'boss', 'hr', 'meeting', 'common', 'lounge', 'reception']);
export const INSIDE = {
  home: { paints: { bedroom: ['#e9e0f0', '#e3ecf3', '#f2e6dc', '#e6efe0'], kitchen: ['#f4ecd6', '#e8f0ec', '#f6e2d6'], living: ['#e2edd9', '#efe4d6', '#e1e6f0', '#f0e9c9'], study: ['#e8e4d8', '#dfe6ee'], gym: ['#e3e6ea'] }, finish: { bedroom: ['paint', 'paint', 'stripes', 'dots'], living: ['paint', 'paint', 'wainscot', 'stripes'], kitchen: ['paint', 'tiles'], '*': ['paint'] } },
  retro: { paints: ['#e8cf8a', '#cfd8a0', '#efb98a', '#d9c3a5', '#bfd3c1'], finish: { living: ['panel'], bedroom: ['dots', 'stripes'], kitchen: ['tiles'], '*': ['paint'] }, floor: '#8a5a32', wood: '#9a6b43', lamp: 'globe' },
  minimal: { paints: ['#f3f3f0', '#eceeef', '#efece6'], accent: ['#2f5d62', '#c06c4a', '#33415c', '#8a9a5b'], finish: { living: ['accent'], kitchen: ['concrete', 'paint'], '*': ['paint'] }, floor: '#c9a77a', lamp: 'track' },
  cabin: { paints: ['#b98250', '#a8743f'], finish: { '*': ['logs'] }, floor: '#7a5230', lamp: 'bulb' },
  heritage: { paints: ['#d8dcc7', '#e8e0cc', '#c9d3d6', '#e6d3d0', '#d6cfe0'], finish: { living: ['wainscot', 'stripes'], bedroom: ['stripes', 'wainscot', 'paint'], '*': ['wainscot', 'paint'] }, floor: '#6b4a2f', lamp: { living: 'chandelier', '*': 'pendant' } },
  tudor: { paints: ['#efe6d2', '#f2ead9'], finish: { '*': ['beams'] }, floor: '#5e4026', beam: '#3b2a1c', lamp: 'pendant' },
  med: { paints: ['#f6f1e7', '#f3e5d0', '#e7f0ea', '#f4e9c8'], finish: { kitchen: ['tiles'], '*': ['paint'] }, floor: '#c47a52', lamp: 'globe' },
  deco: { paints: ['#a9c7bb', '#dcc597', '#c1b2d1', '#e6d5bb'], gold: '#b8902f', finish: { living: ['deco'], '*': ['deco', 'paint'] }, floor: '#4a3424', lamp: { living: 'chandelier', '*': 'globe' } },
  loft: { paints: ['#b5543b', '#a0503a', '#9c5b43'], finish: { kitchen: ['brick', 'concrete'], '*': ['brick'] }, floor: '#8f8f8c', lamp: 'bulb' },
  glassy: { paints: ['#f4f5f6', '#eaeef1', '#f1efea'], accent: ['#3a6ea5', '#d88c4a', '#5b8c6e'], finish: { living: ['accent', 'paint'], '*': ['paint'] }, floor: '#d8d2c6', lamp: 'track' },
  creative: { paints: ['#f3f0e8', '#eeeeea'], accent: ['#f2b33d', '#e4572e', '#29a19c', '#7b61ff'], finish: { desks: ['accent'], common: ['accent'], '*': ['paint', 'concrete'] }, floor: '#c9a77a', lamp: 'bulb' },
  classic: { paints: ['#e9e1d0', '#e4ddd0', '#dfe2e6'], finish: { boss: ['panel'], meeting: ['panel'], '*': ['wainscot'] }, floor: '#4b5a6b', wood: '#6b4226', lamp: { boss: 'chandelier', meeting: 'pendant', '*': 'strip' } },
  exec: { paints: ['#e8e6e1', '#dedfe2'], accent: ['#1f2a44', '#3b3b3b', '#5a3e2b'], finish: { boss: ['panel'], meeting: ['accent'], reception: ['concrete'], '*': ['paint'] }, floor: '#3e4550', wood: '#3b2a20', lamp: 'track' },
};
const opt = (v, kind) => (Array.isArray(v) || typeof v !== 'object' || v === null ? v : v[kind] ?? v['*']);
// The look of one room, or null to keep the room's own colours.
export function roomLook(L, room) {
  const look = INSIDE[L.S?.inside || (L.T.units ? 'home' : '')];
  if (!look || !(LIVING.has(room.kind) || WORKING.has(room.kind))) return null;
  const r = rng((L.seed ^ (room.id * 2654435761)) >>> 0), paints = opt(look.paints, room.kind);
  if (!paints) return null;
  return { wall: pick(r, paints), finish: pick(r, opt(look.finish, room.kind) || ['paint']), accent: look.accent && pick(r, look.accent), floor: look.floor, lamp: opt(look.lamp, room.kind), wood: look.wood || '#8a5a32', beam: look.beam || '#3b2a1c', gold: look.gold || '#b8902f' };
}
// The back wall of a room with a look (the room spans y-27..y on the inside).
export function paintRoomWall(p, room, y, look) {
  const { x, w } = room, top = y - 27, c = look.wall;
  switch (look.finish) {
    case 'stripes': p.rect(x, top, w, 28, c); for (let k = x + 2; k < x + w; k += 4) p.rect(k, top, 1, 27, shade(c, 0.93)); break;
    case 'dots': p.rect(x, top, w, 28, c); for (let yy = top + 2, i = 0; yy < y - 2; yy += 4, i++) for (let k = x + 2 + (i % 2) * 2; k < x + w - 1; k += 4) p.px(k, yy, shade(c, 0.88)); break;
    case 'wainscot': p.rect(x, top, w, 28, c); p.rect(x, y - 10, w, 10, '#f1ede4'); for (let k = x + 3; k < x + w; k += 6) p.rect(k, y - 8, 1, 6, '#ddd6c8'); p.rect(x, y - 11, w, 1, shade('#f1ede4', 0.8)); break;
    case 'panel': p.rect(x, top, w, 28, look.wood); for (let k = x + 4; k < x + w; k += 5) p.rect(k, top, 1, 27, shade(look.wood, 0.82)); p.rect(x, top + 3, w, 1, shade(look.wood, 0.7)); break;
    case 'brick': brickWall(p, x, top, w, 28, c, '#d8c4b0'); break;
    case 'concrete': p.rect(x, top, w, 28, '#c9c9c4'); for (let yy = top + 5; yy < y - 2; yy += 9) for (let k = x + 4; k < x + w - 2; k += 10) p.px(k, yy, '#a3a39d'); p.rect(x, top + 13, w, 1, '#bdbdb7'); break;
    case 'beams': p.rect(x, top, w, 28, c); p.rect(x, top, w, 2, look.beam); for (let k = x; k < x + w; k += 18) p.rect(k, top, 2, 28, look.beam); p.rect(x + w - 2, top, 2, 28, look.beam); p.rect(x, y - 12, w, 1, look.beam); break;
    case 'logs': for (let yy = top; yy <= y; yy += 4) { p.rect(x, yy, w, 3, c); p.rect(x, yy + 3, w, 1, shade(c, 0.65)); } break;
    case 'accent': { p.rect(x, top, w, 28, c); const aw = Math.round(w * 0.4); p.rect(x + w - aw, top, aw, 28, look.accent || c); break; }
    case 'deco': p.rect(x, top, w, 28, c); p.rect(x, top + 2, w, 1, look.gold); p.rect(x, y - 10, w, 1, look.gold); for (let k = x + 4; k < x + w - 2; k += 8) { p.rect(k, top + 3, 1, 17, shade(c, 0.88)); p.px(k - 1, top + 4, look.gold); p.px(k + 1, top + 4, look.gold); } break;
    case 'tiles': p.rect(x, top, w, 28, c); for (let k = y - 25; k < y; k += 4) p.rect(x, k, w, 1, shade(c, 0.94)); for (let k = x + 3; k < x + w; k += 4) p.rect(k, y - 13, 1, 13, shade(c, 0.94)); break;
    default: p.rect(x, top, w, 28, c);
  }
}
// Ceiling lights. True if it drew one (otherwise the room keeps its usual light).
export function paintLamp(p, room, y, look) {
  const mid = Math.round(room.x + room.w / 2), top = y - 27;
  switch (look.lamp) {
    case 'bulb': for (const k of room.w > 50 ? [mid - 12, mid + 12] : [mid]) { p.rect(k, top, 1, 5, '#2b2b2e'); p.rect(k - 1, top + 5, 3, 2, '#ffe9a8'); } return true;
    case 'track': p.rect(mid - 9, top, 19, 1, '#3d3f42'); for (const k of [-8, 0, 8]) { p.rect(mid + k, top + 1, 2, 2, '#3d3f42'); p.px(mid + k, top + 3, '#fff3c4'); } return true;
    case 'globe': p.rect(mid, top, 1, 3, '#555'); p.rect(mid - 2, top + 3, 5, 3, '#fbf6e6'); p.rect(mid - 1, top + 6, 3, 1, '#fbf6e6'); return true;
    case 'chandelier': p.rect(mid, top, 1, 3, '#c9a227'); p.rect(mid - 4, top + 3, 9, 1, '#c9a227'); for (const k of [-4, -2, 0, 2, 4]) p.rect(mid + k, top + 4, 1, 2, '#fff3c4'); return true;
    case 'strip': p.rect(mid - 5, top, 11, 1, '#fbfbe8'); return true;
    case 'pendant': p.rect(mid, top, 1, 2, '#555'); p.rect(mid - 2, top + 2, 5, 2, '#f1d38a'); return true;
    default: return false;
  }
}
