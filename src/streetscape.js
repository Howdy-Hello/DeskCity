// The streetscape: trees, bushes, flower beds, benches and hydrants in the gaps between buildings,
// lamp posts along the sidewalk (lit after dark), and a little pocket park on every empty plot.
// Everything is seeded by its position, so the street looks the same every time.
import { sprite, painter, addGrain, rng, pick } from './draw.js';
import { nightLevel } from './buildings.js';

const GREENS = [['#4f9a4a', '#2f6b33', '#7cc46a'], ['#3f8f5a', '#245c39', '#6fbf7f'], ['#6aa84f', '#3d7a2e', '#9ad27a']];

// Each prop is drawn once into a small image, standing on its bottom row, centred on x.
const PROPS = {
  tree: (p, r) => { // a round leafy tree
    const big = r() < 0.5, w = big ? 26 : 20, h = big ? 40 : 32, [c, dark, light] = pick(r, GREENS);
    p.rect(w / 2 - 1, h - 12, 3, 12, '#6e4423'); p.rect(w / 2 + 1, h - 12, 1, 12, '#5a3820');
    const blob = (x, y, rad, col) => { for (let dy = -rad; dy <= rad; dy++) { const hw = Math.round(Math.sqrt(rad * rad - dy * dy)); p.rect(x - hw, y + dy, hw * 2 + 1, 1, col); } };
    const cy = h - 12 - (big ? 12 : 9), R = big ? 11 : 8;
    blob(w / 2, cy + 3, R, dark); blob(w / 2 - R / 2, cy + 1, R - 3, c); blob(w / 2 + R / 2, cy + 2, R - 3, c); blob(w / 2, cy - 2, R - 2, c);
    blob(w / 2 - 2, cy - 4, Math.max(2, R - 6), light);
    return [w, h];
  },
  pine: (p, r) => {
    const w = 18, h = 38, [c, dark] = pick(r, GREENS);
    p.rect(w / 2 - 1, h - 6, 3, 6, '#6e4423');
    for (let t = 0; t < 3; t++) {
      const top = 2 + t * 9, bottom = top + 14;
      for (let y = top; y < bottom; y++) { const hw = Math.round(((y - top) / 14) * (5 + t * 2)); p.rect(w / 2 - hw, y, hw * 2 + 1, 1, y % 3 ? c : dark); }
    }
    return [w, h];
  },
  bush: (p, r) => {
    const w = 14, h = 8, [c, dark, light] = pick(r, GREENS);
    p.rect(1, 2, 12, 6, c); p.rect(0, 4, 14, 4, c); p.rect(1, 6, 12, 2, dark); p.rect(3, 2, 4, 1, light);
    if (r() < 0.5) for (let k = 0; k < 4; k++) p.px(2 + Math.floor(r() * 10), 2 + Math.floor(r() * 4), pick(r, ['#e74c3c', '#f1c40f', '#ff7eb6', '#ffffff']));
    return [w, h];
  },
  flowers: (p, r) => {
    const w = 16, h = 5;
    p.rect(0, 3, 16, 2, '#6e4a2e'); p.rect(0, 2, 16, 1, '#8b5a2b');
    for (let x = 1; x < 15; x += 2) { p.px(x, 1, '#3d7a2e'); p.px(x, 0, pick(r, ['#e74c3c', '#f1c40f', '#ff7eb6', '#9b59b6', '#ffffff'])); }
    return [w, h];
  },
  bench: (p) => {
    p.rect(0, 4, 12, 1, '#8b5a2b'); p.rect(0, 1, 12, 1, '#8b5a2b'); p.rect(0, 1, 1, 4, '#3d3d3d'); p.rect(11, 1, 1, 4, '#3d3d3d');
    p.rect(1, 5, 1, 2, '#3d3d3d'); p.rect(10, 5, 1, 2, '#3d3d3d');
    return [12, 7];
  },
  hydrant: (p) => {
    p.rect(1, 1, 3, 6, '#c0392b'); p.rect(0, 2, 5, 1, '#c0392b'); p.rect(1, 0, 3, 1, '#922b21'); p.rect(0, 6, 5, 1, '#7d7d7d');
    return [5, 7];
  },
  lamp: (p) => {
    p.rect(2, 4, 1, 26, '#3d3d3d'); p.rect(2, 3, 6, 1, '#3d3d3d'); p.rect(6, 3, 4, 2, '#555555'); p.px(7, 5, '#fff3b0'); p.px(8, 5, '#fff3b0');
    p.rect(1, 29, 3, 1, '#2a2a2a');
    return [10, 30];
  },
};

const cache = new Map();
function image(kind, seed) {
  const key = `${kind}:${seed % 7}`;
  if (!cache.has(key)) {
    const cv = sprite(30, 42), p = painter(cv), [w, h] = PROPS[kind](p, rng(seed % 7 + 11 * kind.length));
    const out = sprite(w, h); out.getContext('2d').drawImage(cv, 0, 0);
    addGrain(out, 0.08);
    cache.set(key, out);
  }
  return cache.get(key);
}

// Where everything goes, worked out again only when the buildings or the screen change.
let layout = { key: '', back: [], front: [] };
function plan(city) {
  const key = city.lots.map((b, i) => (b ? `${b.x0}:${b.L.w}:${b.L.ox}` : `e${i}`)).join('|') + `|${city.W}|${city.districts}`;
  if (key === layout.key) return layout;
  const back = [], front = [], put = (list, kind, x, seed) => list.push({ kind, x: Math.round(x), seed });
  // pocket parks on empty plots
  city.lots.forEach((b, i) => {
    if (b) return;
    const cx = city.lotCenter(i), r = rng(i * 97 + 13);
    put(back, r() < 0.4 ? 'pine' : 'tree', cx - 62, i * 3 + 1); put(back, 'tree', cx - 22, i * 3 + 2);
    put(back, r() < 0.5 ? 'pine' : 'tree', cx + 44, i * 3 + 3); put(back, 'bush', cx - 42, i + 4); put(back, 'bush', cx + 66, i + 5);
    put(back, 'flowers', cx + 14, i + 6); put(front, 'bench', cx + 4, i); put(front, 'lamp', cx - 80, i);
  });
  // in the gaps between neighbouring buildings: a tree or bush, and a lamp post on every other one
  const spans = city.lots.filter(Boolean).map((b) => [b.x0 - b.L.ox, b.x0 + b.L.w]).sort((a, c) => a[0] - c[0]);
  for (let k = 0; k + 1 < spans.length; k++) {
    const left = spans[k][1], gap = spans[k + 1][0] - left, mid = left + gap / 2, r = rng(Math.round(mid));
    if (gap >= 14) put(back, r() < 0.3 ? 'pine' : 'tree', mid, Math.round(mid));
    else if (gap >= 6) put(back, 'bush', mid, Math.round(mid));
    if (gap >= 18 && k % 2 === 0) put(front, "lamp", left + 4, k);
    else if (gap >= 18 && k % 4 === 1) put(front, 'hydrant', left + 5, k);
  }
  layout = { key, back, front };
  return layout;
}

function drawList(ctx, list, G, seen) {
  for (const it of list) {
    const img = image(it.kind, it.seed);
    if (seen(it.x - img.width, it.x + img.width)) ctx.drawImage(img, it.x - Math.floor(img.width / 2), G - img.height + 1);
  }
}

// Behind the buildings: trees, bushes, flower beds.
export function drawStreetBack(ctx, city, G, seen) { drawList(ctx, plan(city).back, G, seen); }

// In front: lamp posts (glowing after dark), benches, hydrants.
export function drawStreetFront(ctx, city, G, seen, hour) {
  const { front } = plan(city);
  drawList(ctx, front, G, seen);
  const n = nightLevel(hour);
  if (n <= 0) return;
  for (const it of front) {
    if (it.kind !== 'lamp' || !seen(it.x - 20, it.x + 20)) continue;
    const hx = it.x + 3, hy = G - 23;
    ctx.fillStyle = `rgba(255,214,120,${0.35 * n})`; ctx.fillRect(hx - 3, hy - 2, 7, 5);       // glow round the bulb
    ctx.fillStyle = `rgba(255,214,120,${0.3 * n})`;                                              // a pool of light on the pavement
    ctx.fillRect(hx - 10, G + 1, 21, 3); ctx.fillRect(hx - 6, G, 13, 1);
  }
}
