// Pixel helpers shared by everything that draws. One cell = one screen point.

// Small seeded random generator, so a building always gets the same furniture.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
export const pick = (r, list) => list[Math.floor(r() * list.length)];

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export const shade = (c, k) => `rgb(${hex(c).map((v) => Math.min(255, v * k) | 0).join(',')})`;

export function sprite(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

export function lineCells(x0, y0, x1, y1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  const out = [];
  for (let err = dx + dy; ; ) { // Bresenham
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// 3x5 pixel font for signs and elevator floor numbers.
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', ' ': '000000000000000', ':': '000010000010000', '-': '000000111000000', '+': '000010111010000',
  '<': '001010100010001', '>': '100010001010100', '.': '000000000000010', '=': '000111000111000', '/': '001001010100100',
};
export const textWidth = (s, scale = 1) => (s.length * 4 - 1) * scale;

export function painter(cv) {
  const ctx = cv.getContext('2d');
  const p = {
    ctx,
    rect(x, y, w, h, c) {
      if (w <= 0 || h <= 0) return;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    },
    px: (x, y, c) => p.rect(x, y, 1, 1, c),
    line(x0, y0, x1, y1, c) {
      ctx.fillStyle = c;
      for (const [x, y] of lineCells(x0, y0, x1, y1)) ctx.fillRect(x, y, 1, 1);
    },
    frame(x, y, w, h, c) { p.rect(x, y, w, 1, c); p.rect(x, y + h - 1, w, 1, c); p.rect(x, y, 1, h, c); p.rect(x + w - 1, y, 1, h, c); },
    text(str, x, y, c, s = 1) { // s = size of each font pixel
      [...String(str).toUpperCase()].forEach((ch, i) => {
        const bits = FONT[ch] || FONT[' '];
        for (let k = 0; k < 15; k++) if (bits[k] === '1') p.rect(x + (i * 4 + (k % 3)) * s, y + ((k / 3) | 0) * s, s, s, c);
      });
    },
  };
  return p;
}

// Sandbox-style grain: every pixel keeps a fixed, slightly different shade.
export function addGrain(cv, amount = 0.12) {
  const ctx = cv.getContext('2d');
  const img = ctx.getImageData(0, 0, cv.width, cv.height), d = img.data;
  for (let i = 0, n = 0; i < d.length; i += 4, n++) {
    if (!d[i + 3]) continue;
    const x = n % cv.width, y = (n / cv.width) | 0;
    const s = 1 - amount / 2 + (((((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000) / 1000) * amount;
    d[i] *= s; d[i + 1] *= s; d[i + 2] *= s;
  }
  ctx.putImageData(img, 0, 0);
}
