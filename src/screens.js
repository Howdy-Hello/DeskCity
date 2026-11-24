// What's on screen: TV channels and office computer apps, redrawn every frame into a little
// rectangle of pixels. Edit or add programmes here.
//   TV:      news (studio, anchor, BREAKING band, scrolling ticker, LIVE light)
//            stream (a streaming app: browse the rows, then a movie plays)
//   Office:  sheet, code, chart, mail, call
//   Other:   saver (bouncing logo), stocks

const hash = (a, b = 0) => ((Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 40503)) >>> 0) / 4294967296;
const POSTER = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#c0392b', '#f1c40f'];
const CODE = ['#569cd6', '#ce9178', '#9cdcfe', '#6a9955', '#c586c0', '#dcdcaa'];

export const TV_CHANNELS = ['news', 'stream'];
export const PC_APPS = ['sheet', 'code', 'chart', 'mail', 'call'];
// Home computers: 'game' while gaming, an office app while working from home.

const PROGRAMMES = {
  news(r, w, h, t) {
    r(0, 0, w, h, '#2f5fb3');
    for (let k = 0; k < w; k += 5) r(k, 0, 2, h - 2, '#3567bd'); // studio light streaks
    r(1, 1, 5, 4, '#f4f4f4'); r(2, 2, 3, 2, '#1f3f86'); r(3, 2, 1, 1, '#6fa0f0'); r(2, 3, 1, 1, '#6fa0f0'); // globe graphic
    const ax = w - 4; // the anchor
    r(ax, 1, 2, 1, '#5a3a1e'); r(ax, 2, 2, 1, '#f2c79e');
    r(ax - 1, 3, 4, h - 5, '#26324a'); r(ax, 3, 1, 1, '#ffffff'); r(ax + 1, 3, 1, 1, '#c0392b');
    r(0, h - 2, 4, 1, '#c0392b'); r(4, h - 2, w - 4, 1, '#f4f4f4'); // BREAKING NEWS band
    for (let k = 5; k < w - 1; k += 3) r(k, h - 2, 2, 1, '#2c3e50');
    r(0, h - 1, w, 1, '#14254d'); // ticker
    const shift = Math.floor(t * 5);
    for (let k = -4; k < w + 4; k += 4) r(((k - shift) % (w + 4) + w + 4) % (w + 4) - 2, h - 1, 2, 1, '#cfd8e8');
    if (Math.floor(t * 1.5) % 2) r(w - 1, 0, 1, 1, '#ff3b30'); // LIVE
  },

  stream(r, w, h, t, seed) {
    const cycle = (t + seed * 13) % 70;
    if (cycle < 14) { // browsing: hero banner and rows of posters, a highlight moving along
      r(0, 0, w, h, '#141414');
      r(0, 0, 2, 1, '#e50914');
      const hero = POSTER[Math.floor(t / 14 + seed) % POSTER.length];
      r(0, 1, w, 3, hero); r(0, 3, w, 1, '#000000'); r(1, 2, 4, 1, '#ffffff'); r(1, 3, 2, 1, '#e50914');
      const sel = Math.floor(cycle / 1.2) % 4, scroll = Math.floor(cycle / 5);
      for (let i = 0; i < 5; i++) {
        const x = 1 + i * 3;
        if (x + 2 > w) break;
        r(x, h - 3, 2, 2, POSTER[(i + scroll + seed) % POSTER.length]);
        if (i === sel) { r(x - 1, h - 3, 1, 2, '#ffffff'); r(x + 2, h - 3, 1, 2, '#ffffff'); }
      }
      return;
    }
    // the movie: three scenes with cuts, letterboxed
    const m = cycle - 14, scene = Math.floor(m / 18) % 3, k = (m % 18) / 18;
    if (scene === 0) { // sunset drive
      r(0, 0, w, h, '#ff9a3c'); r(0, 1, w, 2, '#ff6f61'); r(0, 1, w, 1, '#c94b7c');
      r(Math.round(w * 0.7), Math.round(2 + k * 2), 2, 1, '#ffe08a');
      for (let x = 0; x < w; x++) r(x, h - 3 + (((x + 2) % 5) < 2 ? -1 : 0), 1, 3, '#3d2252');
      r(Math.round(-2 + k * (w + 4)), h - 3, 2, 1, '#111111'); r(Math.round(-1 + k * (w + 4)), h - 3, 1, 1, '#ffd200');
    } else if (scene === 1) { // night city
      r(0, 0, w, h, '#0d1b3e');
      for (let s = 0; s < 4; s++) if (hash(s, Math.floor(t * 2)) > 0.4) r(Math.floor(hash(s) * w), 1, 1, 1, '#ffffff');
      for (let x = 0; x < w; x += 3) {
        const bh = 2 + Math.floor(hash(x, seed) * (h - 3));
        r(x, h - bh, 2, bh, '#1f2a44');
        if (hash(x, Math.floor(t)) > 0.5) r(x, h - bh + 1, 1, 1, '#ffd36b');
      }
    } else { // sea and a boat
      r(0, 0, w, h, '#8fd3ff'); r(0, h - 3, w, 3, '#1f6fb2');
      for (let x = 0; x < w; x++) if ((x + Math.floor(t * 3)) % 4 === 0) r(x, h - 3, 1, 1, '#d6f0ff');
      const bx = Math.round(k * w);
      r(bx, h - 4, 3, 1, '#8b5a2b'); r(bx + 1, h - 6, 1, 2, '#ffffff');
    }
    r(0, 0, w, 1, '#000000'); r(0, h - 1, w, 1, '#000000'); // letterbox
  },

  sheet(r, w, h, t, seed) {
    r(0, 0, w, h, '#ffffff'); r(0, 0, w, 1, '#217346');
    for (let x = 2; x < w; x += 3) r(x, 1, 1, h - 1, '#d9d9d9');
    const n = Math.floor(t * 2);
    for (let y = 1; y < h; y++) for (let x = 0; x < w; x += 3) if (hash(x * 7 + y, seed + Math.floor(n / 6)) > 0.35) r(x, y, 2, 1, '#555555');
    r((n % 3) * 3, 1 + (Math.floor(n / 3) % (h - 1)), 2, 1, '#9fd5b0'); // the selected cell
  },

  code(r, w, h, t, seed) {
    r(0, 0, w, h, '#1e1e1e');
    const top = Math.floor(t * 1.2);
    for (let y = 0; y < h; y++) {
      const line = top + y, indent = Math.floor(hash(line, seed) * 3), len = 1 + Math.floor(hash(line, seed + 1) * (w - indent - 1));
      r(indent, y, len, 1, CODE[Math.floor(hash(line, seed + 2) * CODE.length)]);
    }
    if (Math.floor(t * 2) % 2) r(w - 1, h - 1, 1, 1, '#ffffff'); // cursor
  },

  chart(r, w, h, t, seed) {
    r(0, 0, w, h, '#ffffff'); r(0, h - 1, w, 1, '#888888');
    for (let x = 0; x < w; x += 2) {
      const v = 1 + Math.floor((Math.sin(x * 0.9 + t * 0.6 + seed) * 0.5 + 0.5) * (h - 2));
      r(x, h - 1 - v, 1, v, x % 4 ? '#4f81bd' : '#f39c12');
    }
  },

  mail(r, w, h, t, seed) {
    r(0, 0, w, h, '#ffffff'); r(0, 0, 1, h, '#0078d4');
    const fresh = Math.floor(t / 4);
    for (let y = 0; y < h; y++) {
      const unread = hash(fresh + y, seed) > 0.6;
      r(2, y, 2 + Math.floor(hash(fresh - y, seed) * (w - 4)), 1, unread ? '#222222' : '#b0b0b0');
      if (unread) r(1, y, 1, 1, '#4fa3ff');
    }
  },

  call(r, w, h, t) {
    r(0, 0, w, h, '#202124');
    const tw = Math.floor(w / 2), th = Math.floor(h / 2), talking = Math.floor(t / 3) % 4;
    for (let i = 0; i < 4; i++) {
      const x = (i % 2) * tw, y = Math.floor(i / 2) * th;
      r(x, y, tw - 1 || 1, th - 1 || 1, '#3c4043');
      r(x + Math.floor(tw / 2) - 1, y + th - 2, 1, 1, ['#f2c79e', '#c68642', '#8d5524', '#e0ac69'][i]);
      if (i === talking) r(x, y, tw - 1 || 1, 1, '#34a853');
    }
  },

  game(r, w, h, t, seed) { // a little platformer: running hero, coins, an enemy
    r(0, 0, w, h, '#5c94fc'); r(0, h - 1, w, 1, '#c84c0c');
    const scroll = Math.floor(t * 4);
    for (let x = 0; x < w; x++) if ((x + scroll) % 7 === 0) r(x, 1, 2, 1, '#ffffff');      // clouds
    for (let x = 0; x < w; x++) if ((x + scroll) % 5 === 2) r(x, h - 3, 1, 1, '#f8d838');  // coins
    if ((Math.floor(t * 4) + seed) % 9 < 6) r(w - 1 - ((scroll + seed) % w), h - 2, 1, 1, '#9c4a00'); // enemy
    r(1, h - 2 - (Math.sin(t * 5) > 0.6 ? 1 : 0), 1, 1, '#e40058');                       // hero, hopping
  },

  stocks(r, w, h, t, seed) {
    r(0, 0, w, h, '#0b1622');
    let y = h - 2;
    for (let x = 0; x < w; x++) {
      y = Math.max(0, Math.min(h - 1, y + (hash(x + Math.floor(t), seed) > 0.45 ? -1 : 1)));
      r(x, y, 1, 1, '#2ecc71');
    }
  },

  saver(r, w, h, t, seed) {
    r(0, 0, w, h, '#000000');
    const bx = Math.abs(((t * 1.3 + seed) % (2 * (w - 2))) - (w - 2)), by = Math.abs(((t * 0.9) % (2 * (h - 1))) - (h - 1));
    r(Math.round(bx), Math.round(by), 2, 1, POSTER[Math.floor(t / 3) % POSTER.length]);
  },
};

export function drawScreen(ctx, kind, x, y, w, h, t, seed = 0) {
  const r = (a, b, rw, rh, c) => { // clipped to the screen
    const x0 = Math.max(0, a), y0 = Math.max(0, b), x1 = Math.min(w, a + rw), y1 = Math.min(h, b + rh);
    if (x1 > x0 && y1 > y0) { ctx.fillStyle = c; ctx.fillRect(x + x0, y + y0, x1 - x0, y1 - y0); }
  };
  PROGRAMMES[kind](r, w, h, t, seed);
}
