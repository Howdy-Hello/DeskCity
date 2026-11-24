// Layer 2 (furniture) and layer 3 (wall details) for every room type. Edit freely!
// Every piece is drawn from rectangles, sized to a ~22-cell-tall stick person.
// draw(p, x, y, it): x = left edge, y = floor row (where feet stand); pieces grow upward.
// spots: where people use the piece. dx from the left edge, dir 1 = facing right,
//        hip = rows above the floor when sitting or lying.
import { rng, pick, shade } from './draw.js';

// Home furniture that arrives flat-packed: box size and assembly time in minutes (from IKEA
// assembly-service data: beds 1-2.5 h, wardrobes 1-5 h, bookcases under 1 h, small pieces ~40 min).
// Everything else (kitchen appliances, toilets, sinks, showers, office and shop fittings) is built in.
export const FLATPACK = {
  bed: ['l', 100], bed2: ['l', 130], wardrobe: ['l', 150], dresser: ['m', 60], nightstand: ['s', 25], bookshelf: ['m', 50],
  sofa: ['l', 15], armchair: ['m', 10], tv: ['m', 20], table: ['m', 40], lamp: ['s', 15], plant: ['s', 5],
  pcdesk: ['m', 60], laptopdesk: ['s', 30], planter: ['m', 30], seedlings: ['m', 25], treadmill: ['l', 45], weightbench: ['m', 35], bistro: ['s', 15],
};
export const BOX = { s: [5, 4], m: [7, 6], l: [10, 7] };
// Which flat-pack to open first.
export const UNPACK_ORDER = ['bed2', 'bed', 'table', 'sofa', 'tv', 'armchair', 'nightstand', 'pcdesk', 'laptopdesk', 'wardrobe', 'dresser', 'bookshelf', 'lamp', 'bistro', 'planter', 'seedlings', 'treadmill', 'weightbench', 'plant'];

const C = {
  wood: '#a0693a', woodDark: '#6e4423', woodLight: '#c99a62',
  white: '#f3f1ec', offwhite: '#dcd6cb', metal: '#a7adb3', metalDark: '#6f767d',
  black: '#2a2a2e', screen: '#1d2733', glass: '#a9d6ea', ceramic: '#fafafa',
  plant: '#4f9a4a', plantDark: '#2f6b33', pot: '#b5653a', lamp: '#f1d38a',
};
export const FABRIC = ['#c0504d', '#4f81bd', '#7aa63f', '#8064a2', '#e8833a', '#3fa2b8', '#d4a017', '#b55d8e'];
const BRIGHT = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#e67e22', '#9b59b6', '#ecf0f1', '#1abc9c'];

const books = (p, x, y, w, r) => { for (let i = 0; i < w; i++) if (r() > 0.2) p.rect(x + i, y - 1 - (r() * 2 | 0), 1, 3, pick(r, BRIGHT)); };
const chair = (p, x, y, flip, col = C.woodDark) => { // seat 4 wide, back on the outside
  p.rect(flip ? x + 3 : x, y - 9, 1, 10, col);
  p.rect(x, y - 4, 4, 1, col);
  p.rect(flip ? x : x + 3, y - 3, 1, 4, col);
};
const officeChair = (p, x, y, flip) => {
  p.rect(x, y, 5, 1, C.black); p.rect(x + 2, y - 3, 1, 3, C.black);
  p.rect(x, y - 4, 5, 1, C.black); p.rect(flip ? x + 4 : x, y - 10, 1, 7, C.black);
};

export const FURNITURE = {
  // ---------- bedroom ----------
  bed: {
    w: 24, h: 9, spots: [{ act: 'sleep', dx: 14, hip: 6, lie: true, dir: 1 }],
    draw(p, x, y, it) {
      p.rect(x, y - 8, 2, 9, C.woodDark); p.rect(x + 22, y - 5, 2, 6, C.woodDark);
      p.rect(x + 2, y - 3, 20, 2, C.wood); p.rect(x + 3, y - 1, 1, 2, C.woodDark); p.rect(x + 20, y - 1, 1, 2, C.woodDark);
      p.rect(x + 2, y - 5, 20, 2, C.white); p.rect(x + 2, y - 7, 6, 2, C.ceramic);
      p.rect(x + 9, y - 6, 13, 2, it.color); p.rect(x + 9, y - 6, 13, 1, shade(it.color, 1.15));
    },
  },
  nightstand: {
    w: 5, h: 10, spots: [],
    draw(p, x, y) {
      p.rect(x, y - 5, 5, 6, C.wood); p.rect(x, y - 3, 5, 1, C.woodDark); p.px(x + 2, y - 4, C.lamp);
      p.rect(x + 2, y - 7, 1, 2, C.metalDark); p.rect(x + 1, y - 9, 3, 2, C.lamp);
    },
  },
  wardrobe: {
    w: 10, h: 20, spots: [{ act: 'dress', dx: 5, dir: 1 }],
    draw(p, x, y) {
      p.rect(x, y - 19, 10, 19, C.wood); p.rect(x, y - 19, 10, 1, C.woodDark); p.rect(x + 5, y - 18, 1, 18, C.woodDark);
      p.px(x + 3, y - 10, C.lamp); p.px(x + 7, y - 10, C.lamp); p.px(x + 1, y, C.woodDark); p.px(x + 8, y, C.woodDark);
    },
  },
  dresser: {
    w: 9, h: 11, spots: [],
    draw(p, x, y, it) {
      p.rect(x, y - 8, 9, 9, C.woodLight); p.rect(x, y - 6, 9, 1, C.wood); p.rect(x, y - 3, 9, 1, C.wood);
      p.px(x + 4, y - 7, C.woodDark); p.px(x + 4, y - 4, C.woodDark); p.px(x + 4, y - 1, C.woodDark);
      p.rect(x + 6, y - 10, 2, 2, it.color); // a little vase
    },
  },
  plant: {
    w: 5, h: 10, spots: [],
    draw(p, x, y) {
      p.rect(x + 1, y - 3, 3, 4, C.pot);
      p.rect(x + 2, y - 9, 1, 6, C.plantDark); p.rect(x, y - 7, 2, 2, C.plant);
      p.rect(x + 3, y - 8, 2, 2, C.plant); p.rect(x + 1, y - 5, 3, 2, C.plant); p.px(x + 2, y - 10, C.plant);
    },
  },

  // ---------- kitchen ----------
  fridge: {
    w: 8, h: 18, spots: [{ act: 'fridge', dx: 4, dir: 1 }],
    draw(p, x, y) {
      p.rect(x, y - 17, 8, 18, C.white); p.frame(x, y - 17, 8, 18, C.offwhite); p.rect(x, y - 11, 8, 1, C.metal);
      p.rect(x + 6, y - 15, 1, 3, C.metalDark); p.rect(x + 6, y - 9, 1, 4, C.metalDark);
    },
  },
  counter: {
    w: 12, h: 20, spots: [{ act: 'dishes', dx: 5, dir: 1 }],
    draw(p, x, y) {
      p.rect(x, y - 7, 12, 8, C.woodLight); p.rect(x + 6, y - 6, 1, 7, C.wood); p.px(x + 4, y - 5, C.woodDark); p.px(x + 8, y - 5, C.woodDark);
      p.rect(x, y - 8, 12, 1, '#555'); p.rect(x + 3, y - 8, 5, 1, C.metal);
      p.rect(x + 5, y - 11, 1, 3, C.metalDark); p.rect(x + 5, y - 11, 3, 1, C.metalDark);
      p.rect(x, y - 21, 12, 5, C.woodLight); p.rect(x + 6, y - 21, 1, 5, C.wood); p.rect(x, y - 17, 12, 1, C.wood); // wall cabinets
    },
  },
  stove: {
    w: 9, h: 22, spots: [{ act: 'cook', dx: 4, dir: 1 }],
    draw(p, x, y) {
      p.rect(x, y - 8, 9, 9, C.white); p.rect(x + 1, y - 5, 7, 4, C.black); p.rect(x + 1, y - 6, 7, 1, C.metal);
      p.rect(x, y - 8, 9, 1, C.metalDark); p.px(x + 2, y - 7, '#c33'); p.px(x + 6, y - 7, '#c33');
      p.rect(x + 2, y - 11, 5, 3, C.metalDark); p.rect(x + 7, y - 10, 2, 1, C.black); // pot
      p.rect(x + 1, y - 21, 7, 3, C.metal); p.rect(x + 3, y - 24, 3, 3, C.metal); // hood
    },
  },
  table: {
    w: 18, h: 10, spots: [{ act: 'eat', dx: 2, hip: 5, dir: 1 }, { act: 'eat', dx: 15, hip: 5, dir: -1 }],
    draw(p, x, y, it) {
      chair(p, x, y, false); chair(p, x + 14, y, true);
      p.rect(x + 4, y - 7, 10, 1, C.wood); p.rect(x + 5, y - 6, 1, 7, C.woodDark); p.rect(x + 12, y - 6, 1, 7, C.woodDark);
      p.rect(x + 6, y - 8, 2, 1, C.ceramic); p.rect(x + 10, y - 8, 2, 1, C.ceramic); p.px(x + 9, y - 9, it.color);
    },
  },

  // ---------- living room ----------
  sofa: {
    w: 16, h: 9, spots: [{ act: 'tv', dx: 6, hip: 6, dir: 1 }, { act: 'tv', dx: 10, hip: 6, dir: 1 }],
    draw(p, x, y, it) {
      const dark = shade(it.color, 0.8);
      p.rect(x, y - 4, 16, 4, it.color); p.rect(x, y - 9, 3, 9, dark); p.rect(x + 13, y - 6, 3, 6, dark);
      p.rect(x + 3, y - 5, 10, 1, shade(it.color, 1.15)); p.px(x + 1, y, C.woodDark); p.px(x + 14, y, C.woodDark);
    },
  },
  armchair: {
    w: 8, h: 9, spots: [{ act: 'tv', dx: 4, hip: 6, dir: 1 }],
    draw(p, x, y, it) {
      const dark = shade(it.color, 0.75);
      p.rect(x, y - 4, 8, 4, it.color); p.rect(x, y - 9, 2, 9, dark); p.rect(x + 6, y - 6, 2, 6, dark); p.px(x + 1, y, C.woodDark);
    },
  },
  tv: {
    w: 14, h: 15, spots: [], screen: { dx: 1, dy: -14, w: 12, h: 7 },
    draw(p, x, y) {
      p.rect(x, y - 4, 14, 5, C.woodDark); p.rect(x + 1, y - 3, 5, 3, C.wood); p.rect(x + 8, y - 3, 5, 3, C.wood);
      p.rect(x + 6, y - 6, 2, 2, C.black); p.rect(x, y - 15, 14, 9, C.black); p.rect(x + 1, y - 14, 12, 7, C.screen);
    },
  },
  bookshelf: {
    w: 9, h: 18, spots: [],
    draw(p, x, y, it, r) {
      p.rect(x, y - 17, 9, 18, C.woodDark); p.rect(x + 1, y - 16, 7, 16, C.wood);
      for (let s = y - 13; s <= y; s += 4) { p.rect(x + 1, s, 7, 1, C.woodDark); books(p, x + 1, s - 1, 7, r); }
    },
  },
  lamp: {
    w: 3, h: 16, spots: [],
    draw(p, x, y) { p.rect(x, y, 3, 1, C.metalDark); p.rect(x + 1, y - 13, 1, 13, C.metalDark); p.rect(x, y - 15, 3, 2, C.lamp); },
  },

  // ---------- washroom ----------
  toilet: {
    w: 6, h: 9, spots: [{ act: 'toilet', dx: 3, hip: 5, dir: 1 }],
    draw(p, x, y) {
      p.rect(x, y - 8, 2, 5, C.ceramic); p.frame(x, y - 8, 2, 5, C.offwhite);
      p.rect(x, y - 4, 6, 2, C.ceramic); p.rect(x + 1, y - 2, 3, 3, C.ceramic); p.rect(x + 2, y - 4, 4, 1, C.offwhite);
    },
  },
  sink: {
    w: 7, h: 10, spots: [{ act: 'wash', dx: 3, dir: 1 }],
    draw(p, x, y) {
      p.rect(x, y - 5, 7, 6, C.woodLight); p.rect(x + 3, y - 4, 1, 5, C.wood);
      p.rect(x, y - 6, 7, 1, C.ceramic); p.rect(x + 1, y - 7, 5, 1, C.ceramic); p.rect(x + 3, y - 9, 1, 2, C.metalDark); p.px(x + 4, y - 9, C.metalDark);
    },
  },
  shower: {
    w: 9, h: 24, spots: [{ act: 'shower', dx: 4, dir: 1 }],
    draw(p, x, y) {
      p.rect(x, y - 23, 9, 23, '#cfe8f0'); for (let k = y - 21; k < y; k += 4) p.rect(x, k, 9, 1, '#b9dbe6');
      p.rect(x, y, 9, 1, C.offwhite); p.rect(x + 1, y - 23, 1, 4, C.metalDark); p.rect(x + 1, y - 20, 3, 1, C.metalDark);
      p.rect(x + 8, y - 20, 1, 20, '#8fbfd2');
    },
  },
  bathtub: {
    w: 16, h: 9, spots: [{ act: 'bath', dx: 8, hip: 3, dir: 1 }, { act: 'shower', dx: 10, dir: 1 }],
    draw(p, x, y) {
      p.rect(x, y - 6, 16, 5, C.ceramic); p.rect(x, y - 6, 16, 1, C.offwhite); p.px(x + 1, y, C.metalDark); p.px(x + 14, y, C.metalDark);
      p.rect(x + 1, y - 9, 1, 3, C.metalDark); p.px(x + 2, y - 9, C.metalDark);
    },
  },

  // ---------- lobby ----------
  bench: {
    w: 12, h: 8, spots: [{ act: 'rest', dx: 3, hip: 5, dir: 1 }, { act: 'rest', dx: 8, hip: 5, dir: 1 }],
    draw(p, x, y) {
      p.rect(x, y - 4, 12, 1, C.wood); p.rect(x, y - 8, 1, 5, C.woodDark); p.rect(x, y - 7, 12, 1, C.wood);
      p.rect(x + 1, y - 3, 1, 4, C.metalDark); p.rect(x + 10, y - 3, 1, 4, C.metalDark);
    },
  },

  // ---------- office ----------
  desk: {
    w: 18, h: 13, spots: [{ act: 'work', dx: 2, hip: 5, dir: 1 }], screen: { dx: 9, dy: -12, w: 7, h: 4 },
    draw(p, x, y) {
      officeChair(p, x, y, false);
      p.rect(x + 5, y - 7, 13, 1, '#d9d3c7'); p.rect(x + 6, y - 6, 1, 7, C.metal); p.rect(x + 13, y - 6, 4, 7, '#cfc8bb');
      p.rect(x + 14, y - 4, 2, 1, C.metalDark); p.rect(x + 8, y - 13, 9, 6, C.black); p.rect(x + 9, y - 12, 7, 4, C.screen); p.rect(x + 5, y - 8, 3, 1, '#888');
    },
  },
  bossdesk: {
    w: 28, h: 13, spots: [{ act: 'work', dx: 3, hip: 6, dir: 1, boss: true }, { act: 'meet', dx: 25, hip: 5, dir: -1 }], screen: { dx: 10, dy: -13, w: 6, h: 4, app: 'stocks' },
    draw(p, x, y) {
      p.rect(x, y - 13, 2, 9, '#5a2e1a'); p.rect(x, y - 5, 6, 2, '#6b3a22'); p.rect(x + 2, y - 3, 1, 3, C.black); p.rect(x, y, 6, 1, C.black);
      p.rect(x + 6, y - 8, 16, 2, C.woodDark); p.rect(x + 7, y - 6, 14, 7, C.wood); p.rect(x + 9, y - 4, 10, 1, C.woodDark);
      p.rect(x + 9, y - 14, 8, 6, C.black); p.rect(x + 10, y - 13, 6, 4, C.screen);
      p.rect(x + 19, y - 11, 1, 3, C.lamp); p.rect(x + 18, y - 12, 3, 1, '#2e7d4f');
      chair(p, x + 23, y, true, '#6b3a22');
    },
  },
  filing: {
    w: 5, h: 11, spots: [],
    draw(p, x, y) { p.rect(x, y - 10, 5, 11, C.metal); for (let k = y - 7; k < y; k += 3) p.rect(x, k, 5, 1, C.metalDark); p.rect(x + 2, y - 9, 1, 1, C.black); },
  },
  printer: {
    w: 7, h: 11, spots: [{ act: 'print', dx: 3, dir: 1 }],
    draw(p, x, y) { p.rect(x, y - 5, 7, 6, C.metalDark); p.rect(x, y - 9, 7, 4, '#dddddd'); p.rect(x + 1, y - 10, 5, 1, C.white); p.px(x + 5, y - 7, '#2ecc71'); },
  },
  watercooler: {
    w: 4, h: 13, spots: [{ act: 'coffee', dx: 2, dir: 1 }],
    draw(p, x, y) { p.rect(x, y - 7, 4, 8, C.white); p.rect(x, y - 12, 4, 5, '#8ccbf0'); p.px(x + 1, y - 5, '#3498db'); p.px(x + 2, y - 5, '#e74c3c'); },
  },
  coffee: {
    w: 12, h: 13, spots: [{ act: 'coffee', dx: 3, dir: 1 }],
    draw(p, x, y) {
      p.rect(x, y - 7, 12, 8, '#7d8a96'); p.rect(x, y - 8, 12, 1, '#555');
      p.rect(x + 1, y - 13, 4, 5, C.black); p.px(x + 2, y - 9, C.white);
      p.rect(x + 6, y - 12, 6, 4, C.white); p.rect(x + 7, y - 11, 3, 2, C.black);
    },
  },
  vending: {
    w: 9, h: 20, spots: [{ act: 'coffee', dx: 4, dir: 1 }],
    draw(p, x, y, it, r) {
      p.rect(x, y - 19, 9, 20, '#c0392b'); p.rect(x + 1, y - 17, 5, 12, '#d6eef8');
      for (let k = y - 16; k < y - 5; k += 3) for (let i = 0; i < 4; i++) p.px(x + 1 + i + (i > 1), k, pick(r, BRIGHT));
      p.rect(x + 7, y - 16, 1, 5, C.black); p.rect(x + 1, y - 3, 5, 2, C.black);
    },
  },
  officetable: {
    w: 18, h: 10, spots: [{ act: 'lunch', dx: 2, hip: 5, dir: 1 }, { act: 'lunch', dx: 15, hip: 5, dir: -1 }],
    draw(p, x, y) {
      chair(p, x, y, false, C.metalDark); chair(p, x + 14, y, true, C.metalDark);
      p.rect(x + 4, y - 7, 10, 1, C.white); p.rect(x + 8, y - 6, 2, 7, C.metal); p.rect(x + 6, y, 6, 1, C.metal);
    },
  },
  conference: {
    w: 26, h: 11, spots: [{ act: 'meet', dx: 2, hip: 5, dir: 1 }, { act: 'meet', dx: 23, hip: 5, dir: -1 }],
    draw(p, x, y) {
      officeChair(p, x, y, false); officeChair(p, x + 21, y, true);
      p.rect(x + 5, y - 7, 16, 2, C.woodDark); p.rect(x + 8, y - 5, 2, 6, C.metalDark); p.rect(x + 16, y - 5, 2, 6, C.metalDark);
      p.rect(x + 9, y - 9, 4, 2, C.metal); p.rect(x + 15, y - 8, 2, 1, C.white);
    },
  },
  reception: {
    w: 16, h: 14, spots: [{ act: 'front', dx: 8, dir: -1 }], screen: { dx: 10, dy: -13, w: 5, h: 3, app: 'saver', always: true },
    draw(p, x, y, it) {
      p.rect(x, y - 8, 16, 9, '#e6e1d6'); p.rect(x - 1, y - 9, 18, 1, C.woodDark); p.rect(x + 2, y - 5, 12, 2, it.color);
      p.rect(x + 9, y - 14, 7, 5, C.black); p.rect(x + 10, y - 13, 5, 3, C.screen);
    },
  },
  couch: {
    w: 14, h: 9, spots: [{ act: 'rest', dx: 5, hip: 6, dir: 1 }, { act: 'rest', dx: 9, hip: 6, dir: 1 }],
    draw(p, x, y) { p.rect(x, y - 4, 14, 4, '#7f8c8d'); p.rect(x, y - 9, 3, 9, '#5f6b6c'); p.rect(x + 11, y - 6, 3, 6, '#5f6b6c'); },
  },

  // ---------- home office ----------
  pcdesk: {
    w: 20, h: 14, spots: [{ act: 'game', dx: 2, hip: 5, dir: 1 }, { act: 'homework', dx: 2, hip: 5, dir: 1 }], screen: { dx: 9, dy: -12, w: 7, h: 4 },
    draw(p, x, y, it) {
      p.rect(x, y - 11, 2, 8, it.color); p.rect(x, y - 11, 2, 1, C.black); p.rect(x, y - 4, 5, 1, C.black); p.rect(x + 2, y - 3, 1, 3, C.black); p.rect(x, y, 5, 1, C.black); // gaming chair
      p.rect(x + 6, y - 7, 14, 1, '#3a3a3a'); p.rect(x + 7, y - 6, 1, 7, '#3a3a3a');
      p.rect(x + 17, y - 6, 3, 7, '#1f1f24'); p.px(x + 18, y - 5, '#ff4fd8'); p.px(x + 18, y - 3, '#4fd8ff'); // PC tower with RGB
      p.rect(x + 8, y - 13, 9, 6, C.black); p.rect(x + 9, y - 12, 7, 4, C.screen);
      p.rect(x + 9, y - 8, 4, 1, '#555'); p.px(x + 14, y - 8, '#ff4fd8');
    },
  },
  laptopdesk: {
    w: 16, h: 12, spots: [{ act: 'game', dx: 2, hip: 5, dir: 1 }, { act: 'homework', dx: 2, hip: 5, dir: 1 }], screen: { dx: 10, dy: -11, w: 3, h: 2 },
    draw(p, x, y, it) {
      chair(p, x, y, false);
      p.rect(x + 5, y - 7, 11, 1, C.wood); p.rect(x + 6, y - 6, 1, 7, C.woodDark); p.rect(x + 14, y - 6, 1, 7, C.woodDark);
      p.rect(x + 8, y - 8, 6, 1, '#9a9a9a'); p.rect(x + 9, y - 12, 5, 4, '#555'); p.rect(x + 10, y - 11, 3, 2, C.screen);
      p.rect(x + 14, y - 9, 1, 1, it.color); // a mug
    },
  },

  // ---------- greenhouse ----------
  planter: {
    w: 14, h: 9, spots: [{ act: 'garden', dx: 7, dir: 1 }],
    draw(p, x, y, it, r) {
      p.rect(x, y - 4, 14, 5, C.wood); p.rect(x, y - 4, 14, 1, '#5b3a1e'); p.rect(x, y - 2, 14, 1, C.woodDark);
      for (let i = 1; i < 13; i += 2) {
        const h = 1 + (r() * 3 | 0);
        p.rect(x + i, y - 4 - h, 1, h, C.plantDark); p.px(x + i, y - 5 - h, pick(r, [C.plant, '#e74c3c', '#f39c12', C.plant]));
      }
    },
  },
  seedlings: {
    w: 10, h: 14, spots: [{ act: 'garden', dx: 5, dir: 1 }],
    draw(p, x, y, it, r) {
      p.rect(x, y - 13, 1, 14, C.metalDark); p.rect(x + 9, y - 13, 1, 14, C.metalDark);
      for (let s = y - 13; s <= y; s += 5) { p.rect(x, s, 10, 1, C.metal); if (s < y) for (let i = 1; i < 9; i += 2) { p.px(x + i, s + 3, C.pot); p.px(x + i, s + 2, r() > 0.3 ? C.plant : C.plantDark); } }
    },
  },

  // ---------- home gym ----------
  treadmill: {
    w: 18, h: 12, spots: [{ act: 'exercise', dx: 7, dir: 1, anim: 'run' }],
    draw(p, x, y) {
      p.rect(x, y - 2, 16, 3, '#333'); p.rect(x + 1, y - 2, 14, 1, '#555');
      p.rect(x + 15, y - 11, 2, 10, C.metalDark); p.rect(x + 12, y - 12, 6, 2, C.black); p.px(x + 14, y - 12, '#2ecc71');
      p.rect(x + 10, y - 9, 6, 1, C.metal);
    },
  },
  weightbench: {
    w: 14, h: 11, spots: [{ act: 'exercise', dx: 6, hip: 6, lie: true, dir: 1, anim: 'bench' }],
    draw(p, x, y) {
      p.rect(x + 1, y - 5, 11, 2, '#a93226'); p.rect(x + 2, y - 3, 1, 4, C.metalDark); p.rect(x + 10, y - 3, 1, 4, C.metalDark);
      p.rect(x + 1, y - 10, 1, 5, C.metalDark); p.rect(x + 12, y - 10, 1, 5, C.metalDark);
      p.rect(x - 1, y - 11, 16, 1, C.metal); p.rect(x - 1, y - 12, 2, 3, C.black); p.rect(x + 13, y - 12, 2, 3, C.black); // barbell
    },
  },

  // ---------- balcony ----------
  bistro: {
    w: 13, h: 10, spots: [{ act: 'balcony', dx: 2, hip: 5, dir: 1 }, { act: 'balcony', dx: 11, hip: 5, dir: -1 }],
    draw(p, x, y, it) {
      chair(p, x, y, false, C.metalDark); chair(p, x + 9, y, true, C.metalDark);
      p.rect(x + 5, y - 6, 4, 1, C.metal); p.rect(x + 6, y - 5, 1, 6, C.metalDark); p.px(x + 7, y - 7, it.color);
    },
  },

  // ---------- lobby: the delivery area ----------
  parcelshelf: {
    w: 16, h: 14, spots: [],
    draw(p, x, y) {
      p.rect(x - 1, y, 18, 1, '#f1c40f'); for (let k = x; k < x + 16; k += 4) p.rect(k, y, 2, 1, '#2a2a2e'); // floor marking
      p.rect(x, y - 11, 1, 11, C.metalDark); p.rect(x + 15, y - 11, 1, 11, C.metalDark);
      p.rect(x, y - 11, 16, 1, C.metal); p.rect(x, y - 6, 16, 1, C.metal);
      p.rect(x + 5, y - 14, 6, 3, '#c8a06a'); p.rect(x + 7, y - 14, 1, 3, '#9b7a4a'); // a parcel on top as a sign
    },
  },

  // ---------- office HR ----------
  hrdesk: {
    w: 24, h: 13, spots: [{ act: 'work', dx: 2, hip: 5, dir: 1 }, { act: 'meet', dx: 21, hip: 5, dir: -1 }], screen: { dx: 9, dy: -12, w: 6, h: 4 },
    draw(p, x, y, it) {
      officeChair(p, x, y, false);
      p.rect(x + 6, y - 7, 12, 1, C.woodLight); p.rect(x + 7, y - 6, 10, 7, C.wood); p.rect(x + 9, y - 4, 6, 1, C.woodDark);
      p.rect(x + 8, y - 13, 8, 6, C.black); p.rect(x + 9, y - 12, 6, 4, C.screen); p.rect(x + 16, y - 9, 2, 2, it.color);
      chair(p, x + 20, y, true, C.metalDark);
    },
  },

  // ---------- shop ----------
  shelves: {
    w: 14, h: 16, spots: [{ act: 'browse', dx: 7, dir: 1 }],
    draw(p, x, y, it, r) {
      p.rect(x, y - 15, 1, 16, C.metalDark); p.rect(x + 13, y - 15, 1, 16, C.metalDark);
      for (let s = y - 15; s <= y; s += 4) {
        p.rect(x, s, 14, 1, C.metal);
        if (s < y) for (let i = 1; i < 13; i += 2) if (r() > 0.15) p.rect(x + i, s + 1 + (r() > 0.5), 2, 3 - (r() > 0.5), pick(r, BRIGHT));
      }
    },
  },
  fridgecase: {
    w: 12, h: 20, spots: [{ act: 'browse', dx: 6, dir: 1 }],
    draw(p, x, y, it, r) {
      p.rect(x, y - 19, 12, 20, C.metal); p.rect(x + 1, y - 18, 10, 16, '#dff3fb'); p.rect(x + 6, y - 18, 1, 16, C.metal);
      for (let s = y - 17; s < y - 2; s += 4) for (let i = 1; i < 11; i++) if (i !== 6) p.rect(x + i, s, 1, 3, pick(r, BRIGHT));
    },
  },
  produce: {
    w: 14, h: 8, spots: [{ act: 'browse', dx: 7, dir: 1 }],
    draw(p, x, y, it, r) {
      p.rect(x, y - 3, 14, 4, C.woodLight); p.rect(x, y - 6, 14, 3, C.wood);
      for (let i = 0; i < 14; i++) { p.px(x + i, y - 7, pick(r, ['#e74c3c', '#f39c12', '#27ae60', '#f1c40f'])); if (r() > 0.4) p.px(x + i, y - 8, pick(r, ['#e74c3c', '#27ae60'])); }
    },
  },
  checkout: {
    w: 16, h: 12, spots: [{ act: 'pay', dx: 5, dir: 1 }],
    draw(p, x, y) {
      p.rect(x, y - 7, 16, 8, '#6d7b8a'); p.rect(x + 1, y - 8, 10, 1, C.black);
      p.rect(x + 11, y - 12, 5, 4, '#333'); p.rect(x + 12, y - 11, 3, 1, '#7CFC00'); p.rect(x + 3, y - 10, 3, 2, '#f5deb3');
    },
  },
  baskets: {
    w: 5, h: 5, spots: [],
    draw(p, x, y) { for (let k = 0; k < 3; k++) p.rect(x, y - 1 - k * 2, 5, 2, k % 2 ? '#c0392b' : '#e74c3c'); },
  },
};

// ---------- layer 3: wall details ----------
// draw(p, x, y, d, r): (x, y) = top-left.
export const DETAILS = {
  window: {
    w: 10, h: 11,
    draw(p, x, y, d) {
      p.rect(x, y, 10, 10, C.white); p.rect(x + 1, y + 1, 8, 8, '#bfe3f5'); p.rect(x + 1, y + 1, 8, 3, '#d8effa');
      p.rect(x + 5, y + 1, 1, 8, C.white); p.rect(x + 1, y + 5, 8, 1, C.white); p.rect(x - 1, y + 10, 12, 1, C.offwhite);
      p.rect(x - 1, y - 1, 2, 10, d.color); p.rect(x + 9, y - 1, 2, 10, d.color); p.rect(x - 1, y - 1, 12, 1, C.woodDark);
    },
  },
  smallwindow: { w: 6, h: 6, draw(p, x, y) { p.rect(x, y, 6, 6, C.white); p.rect(x + 1, y + 1, 4, 4, '#bfe3f5'); } },
  picture: {
    w: 7, h: 6,
    draw(p, x, y, d, r) {
      p.rect(x, y, 7, 6, C.woodDark); p.rect(x + 1, y + 1, 5, 2, pick(r, ['#87ceeb', '#f4a460', '#dda0dd']));
      p.rect(x + 1, y + 3, 5, 2, pick(r, ['#6b8e23', '#2e8b57', '#4682b4'])); p.px(x + 4, y + 2, '#ffd700');
    },
  },
  clock: {
    w: 7, h: 7, live: true, // the hands follow the town clock
    draw(p, x, y) {
      p.rect(x + 2, y, 3, 7, C.black); p.rect(x, y + 2, 7, 3, C.black); p.rect(x + 1, y + 1, 5, 5, C.black);
      p.rect(x + 2, y + 1, 3, 5, C.white); p.rect(x + 1, y + 2, 5, 3, C.white);
      p.px(x + 3, y + 1, '#999'); p.px(x + 5, y + 3, '#999'); p.px(x + 3, y + 5, '#999'); p.px(x + 1, y + 3, '#999');
    },
  },
  shelf: { w: 10, h: 4, draw(p, x, y, d, r) { p.rect(x, y + 3, 10, 1, C.woodDark); books(p, x + 1, y + 3, 6, r); p.rect(x + 8, y + 1, 1, 2, C.plant); } },
  towel: { w: 5, h: 6, draw(p, x, y, d) { p.rect(x, y, 5, 1, C.metalDark); p.rect(x + 1, y + 1, 3, 5, d.color); } },
  mirror: { w: 5, h: 6, draw(p, x, y) { p.rect(x, y, 5, 6, C.metal); p.rect(x + 1, y + 1, 3, 4, '#e6f4fa'); p.px(x + 1, y + 1, C.white); } },
  whiteboard: {
    w: 14, h: 8,
    draw(p, x, y, d, r) {
      p.rect(x, y, 14, 8, C.metal); p.rect(x + 1, y + 1, 12, 6, C.white);
      for (let k = 0; k < 3; k++) p.rect(x + 2, y + 2 + k * 2, 3 + (r() * 8 | 0), 1, pick(r, ['#2c3e50', '#c0392b', '#2980b9']));
    },
  },
  screen: { w: 12, h: 8, draw(p, x, y) { p.rect(x, y, 12, 7, C.black); p.rect(x + 1, y + 1, 10, 5, '#3d6e9e'); p.rect(x + 2, y + 2, 4, 3, '#f1c40f'); } },
  certificate: { w: 11, h: 5, draw(p, x, y) { for (const dx of [0, 6]) { p.rect(x + dx, y, 5, 5, C.woodDark); p.rect(x + dx + 1, y + 1, 3, 3, '#fdf6e3'); } } },
  poster: { w: 6, h: 8, draw(p, x, y, d) { p.rect(x, y, 6, 8, d.color); p.rect(x + 1, y + 1, 4, 3, C.white); p.rect(x + 1, y + 5, 4, 1, C.white); } },
  logo: { w: 10, h: 6, draw(p, x, y, d) { p.rect(x, y, 10, 6, C.black); p.rect(x + 2, y + 1, 6, 4, d.color); p.rect(x + 4, y + 2, 2, 2, C.white); } },
  mailboxes: {
    w: 12, h: 8,
    draw(p, x, y) { p.rect(x, y, 12, 8, C.metalDark); for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) p.rect(x + 1 + i * 3, y + 1 + k * 4, 2, 3, C.metal); },
  },
  brand: { // a company's name plaque
    w: 20, h: 7,
    draw(p, x, y, d) { const w = d.text.length * 4 + 3; p.rect(x, y, w, 7, d.color); p.rect(x, y + 6, w, 1, shade(d.color, 0.7)); p.text(d.text, x + 2, y + 1, C.white); },
  },
  directory: { // which company is on which floor
    w: 26, h: 20,
    draw(p, x, y, d) { // two columns, so it stays above the reception desk
      const col = Math.max(...d.lines.map((l) => l.length)) * 4 + 3, rows = Math.ceil(d.lines.length / 2);
      p.rect(x, y, col * 2 + 2, rows * 6 + 2, '#2c3e50');
      d.lines.forEach((l, i) => p.text(l, x + 2 + Math.floor(i / rows) * col, y + 2 + (i % rows) * 6, '#f1c40f'));
    },
  },
  sale: { w: 15, h: 7, draw(p, x, y) { p.rect(x, y, 15, 7, '#e74c3c'); p.text('SALE', x, y + 1, C.white); } },
  open: { w: 15, h: 7, draw(p, x, y) { p.rect(x, y, 15, 7, '#27ae60'); p.text('OPEN', x, y + 1, C.white); } },
};

// ---------- rooms ----------
// items: [piece, priority] in left-to-right order; the most important pieces are placed first,
// the rest only if they fit. decor: wall details for the spaces beside the window.
const WOOD = '#9a6b43', TILE = '#b8bec4', CARPET = '#7c8595';
const rep = (n, kind, from) => Array.from({ length: n }, (_, i) => [kind, from + i]);

export const ROOMS = {
  bedroom: { wall: '#e9e0f0', floor: WOOD, items: (v) => [['wardrobe', 4], [v === 'single' ? 'bed' : 'bed2', 1], ['nightstand', 2], ['dresser', 5], ['plant', 6]], decor: ['picture', 'clock'] },
  kitchen: { wall: '#f4ecd6', floor: TILE, items: () => [['fridge', 1], ['counter', 3], ['stove', 1], ['table', 2], ['plant', 7]], decor: ['clock', 'shelf'] },
  living: { wall: '#e2edd9', floor: WOOD, items: () => [['lamp', 5], ['sofa', 1], ['armchair', 4], ['tv', 2], ['bookshelf', 3], ['plant', 6]], decor: ['picture', 'shelf'] },
  washroom: { wall: '#d6edf2', floor: TILE, tiles: true, items: (v, w) => (v === 'office'
    ? [['toilet', 1], ['sink', 1], ['toilet', 3], ['sink', 4]]
    : [['toilet', 1], ['sink', 1], [w >= 40 ? 'bathtub' : 'shower', 2]]), decor: ['towel'] },
  lobby: { wall: '#efe5d5', floor: TILE, items: () => [['parcelshelf', 1], ['plant', 4], ['bench', 2], ['plant', 3]], decor: ['mailboxes', 'picture'] },
  study: { wall: '#e8e4d8', floor: WOOD, items: (v, w, r) => [['plant', 4], [r() < 0.6 ? 'pcdesk' : 'laptopdesk', 1], ['bookshelf', 2], ['lamp', 5]], decor: ['poster', 'shelf'] },
  greenhouse: { wall: '#dcefd6', floor: TILE, tiles: true, items: () => [['planter', 1], ['seedlings', 2], ['planter', 3], ['plant', 4], ['plant', 5]], decor: ['shelf'] },
  gym: { wall: '#e3e6ea', floor: CARPET, items: () => [['treadmill', 1], ['weightbench', 2], ['plant', 4]], decor: ['mirror', 'poster'] },
  balcony: { wall: null, floor: '#9a9a9a', outdoor: true, noWindow: true, items: () => [['plant', 3], ['bistro', 1], ['plant', 2]], decor: [] },
  hr: { wall: '#e6e2ea', floor: CARPET, items: () => [['filing', 3], ['hrdesk', 1], ['plant', 4], ['filing', 5]], decor: ['certificate', 'poster'] },
  lounge: { wall: '#e9e1d4', floor: CARPET, items: () => [['plant', 4], ['couch', 1], ['armchair', 3], ['tv', 2]], decor: ['picture', 'clock'] },
  desks: { wall: '#e5e9ef', floor: CARPET, items: () => [['filing', 9], ...rep(8, 'desk', 1), ['printer', 10], ['plant', 11]], decor: ['whiteboard', 'clock'] },
  boss: { wall: '#eadcc6', floor: WOOD, items: () => [['bookshelf', 2], ['bossdesk', 1], ['plant', 3]], decor: ['certificate', 'picture'] },
  common: { wall: '#f3e5d2', floor: TILE, items: () => [['fridge', 3], ['coffee', 1], ['officetable', 2], ['watercooler', 4], ['vending', 5]], decor: ['poster', 'clock'] },
  meeting: { wall: '#e3e7f0', floor: CARPET, items: () => [['plant', 3], ['conference', 1], ['plant', 4]], decor: ['whiteboard', 'screen'] },
  reception: { wall: '#ece3d3', floor: TILE, items: () => [['reception', 1], ['couch', 2], ['plant', 3]], decor: ['logo', 'clock'] },
  store: {
    wall: '#f5f2ea', floor: TILE, noWindow: true,
    items: () => [['baskets', 12], ['checkout', 1], ['shelves', 2], ['produce', 5], ['shelves', 4], ['shelves', 6], ['shelves', 8], ['shelves', 10], ['fridgecase', 3], ['fridgecase', 9]],
    decor: ['sale', 'open'],
  },
};
FURNITURE.bed2 = { ...FURNITURE.bed, spots: [...FURNITURE.bed.spots, { act: 'sleep', dx: 15, hip: 7, lie: true, dir: 1 }] };

// Picks and places furniture for one room. Returns pieces with absolute x (within the building).
export function furnish(room, r) {
  const cands = ROOMS[room.kind].items(room.variant, room.w, r).map(([kind, prio], order) => ({ kind, prio, order }));
  const chosen = [];
  let used = 4; // 2-cell margin on each side
  for (const c of [...cands].sort((a, b) => a.prio - b.prio)) {
    const w = FURNITURE[c.kind].w + (chosen.length ? 2 : 0);
    if (used + w <= room.w) { chosen.push(c); used += w; }
  }
  chosen.sort((a, b) => a.order - b.order);
  const gap = (room.w - used) / (chosen.length + 1);
  let x = room.x + 2 + gap;
  return chosen.map((c) => {
    const def = FURNITURE[c.kind];
    const it = { kind: c.kind, x: Math.round(x), w: def.w, color: pick(r, FABRIC), seed: (r() * 1e9) | 0 };
    x += def.w + 2 + gap;
    return it;
  });
}

// Wall details: a window in the middle, decorations either side, a mirror over each sink.
export function decorate(room, items, r) {
  const rule = ROOMS[room.kind], out = [];
  const add = (kind, x, top) => out.push({ kind, x: Math.round(x), top, color: pick(r, FABRIC) });
  const mid = room.x + room.w / 2;
  let left = room.x + 2, right = room.x + room.w - 2, winL = mid, winR = mid;
  if (!rule.noWindow) {
    const kind = room.kind === 'washroom' ? 'smallwindow' : 'window';
    const w = DETAILS[kind].w;
    if (room.w >= w + 8) { add(kind, mid - w / 2, -20); winL = mid - w / 2 - 2; winR = mid + w / 2 + 2; }
  }
  [[left, winL], [winR, right]].forEach(([a, b], i) => {
    if (!rule.decor.length) return;
    const kind = rule.decor[i % rule.decor.length], w = DETAILS[kind].w;
    if (b - a >= w + 2) add(kind, (a + b) / 2 - w / 2, -19);
  });
  for (const it of items) if (it.kind === 'sink') add('mirror', it.x + 1, -18);
  return out;
}

export function drawPiece(p, it, y) { FURNITURE[it.kind].draw(p, it.x, y, it, rng(it.seed)); }
export function drawDetail(p, d, y) { DETAILS[d.kind].draw(p, d.x, y + d.top, d, rng(d.x * 31 + y)); }
