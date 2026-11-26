// Sunlight and moonlight, aimed from where the sun (or moon) actually is on the screen (see sky.js):
// every window gets its own angle, and the light moves as the sun crosses the sky.
//   - Side windows (in the end walls): slanted shafts across the room, long and golden when the sun
//     is low, short and steep at midday.
//   - Back windows: a shaft from the window down to the floor, landing as a bright patch.
//   - Front windows (the wall that's cut away): a window-shaped patch of light on the back wall.
//   - Each shaft lights a patch of floor and anyone in it, with dust drifting in it.
//   - A building between a window and the sun shades it. Drawn curtains stop the light (a warm glow
//     comes through the fabric).
//   - Moonlight does the same, faint and blue, as bright as the moon's phase allows.
// Outside, the wall facing the sun catches the light, sunrise and sunset wash everything warm,
// and buildings cast long shadows along the pavement, away from the sun.
import { sunAt, moonAt, sunElevation, moonBrightness } from './sky.js';

const WALL = 2;
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
const hourOf = (now) => { const d = new Date(now); return d.getHours() + d.getMinutes() / 60; };

// The light right now: { kind, sx, sy (where its source is drawn on a W x H screen), k (strength),
// rgb, low (0..1: how low the sun is) }, or null when it's dark.
export function lightAt(now, W, H) {
  const el = sunElevation(hourOf(now));
  if (el > 0) {
    const [sx, sy] = sunAt(now, W, H);
    return { kind: 'sun', sx, sy, k: Math.min(1, el / 6), low: 1 - Math.min(1, el / 25), rgb: mix([255, 150, 60], [255, 226, 150], Math.min(1, el / 35)) };
  }
  const bright = moonBrightness(now);
  if (-el < 4 || bright < 0.15) return null;
  const [sx, sy] = moonAt(now, W, H);
  return { kind: 'moon', sx, sy, k: Math.min(1, -el / 10) * bright * 0.55, low: 0, rgb: [170, 195, 255] };
}

// Which way the light travels to reach (x, y): a unit vector, always heading a little downward.
function towards(src, x, y) {
  let dx = x - src.x, dy = Math.max(y - src.y, Math.abs(x - src.x) * 0.06);
  const n = Math.hypot(dx, dy) || 1;
  return { dx: dx / n, dy: dy / n };
}
// Is (x, y) cut off from the light by another building?
function shadedAt(city, self, src, x, y) {
  for (const o of city.lots) {
    if (!o || o === self || o.build) continue;
    const l = o.x0, r = o.x0 + o.L.w, top = o.G - (o.L.H - 1);
    if ((src.x < l && x < l) || (src.x > r && x > r)) continue; // not between the two
    for (const ex of [Math.max(l, Math.min(src.x, x)), Math.min(r, Math.max(src.x, x))]) {
      const k = (ex - x) / (src.x - x || 1e-6), yy = y + (src.y - y) * k; // the line's height there
      if (k >= 0 && k <= 1 && yy >= top) return true;
    }
  }
  return false;
}

// The shafts and patches only change when the sun moves a cell, its strength changes, a curtain is
// drawn or a neighbour is built, so they're drawn once into an image per building and reused; only
// the dust drifting in them is drawn every frame.
const beamCache = new WeakMap();
export function drawBeams(ctx, b, w, light) {
  if (!light) return;
  const L = b.L, s = light.k * (light.kind === 'sun' ? 1 : 0.6);
  const srcX = Math.round(w.view + light.sx), srcY = Math.round(light.sy);
  w.shadeKey ??= w.city.lots.map((o) => (o ? `${o.x0}:${o.L.H}:${o.build ? 1 : 0}` : '')).join('|');
  const shut = L.rooms.filter((r) => b.curtains.get(r)).map((r) => r.id).join(',');
  const key = `${srcX}|${srcY}|${light.kind}|${Math.round(s * 200)}|${light.rgb}|${shut}|${b.x0}|${b.G}|${w.shadeKey}`;
  let c = beamCache.get(b);
  const ox = b.x0 - L.ox, oy = b.G - L.H;
  if (c?.key !== key) {
    const cv = c?.cv && c.cv.width === L.w + L.ox && c.cv.height === L.H + 3 ? c.cv : document.createElement('canvas');
    cv.width = L.w + L.ox; cv.height = L.H + 3;
    const g = cv.getContext('2d'), dusts = [];
    g.clearRect(0, 0, cv.width, cv.height); g.translate(-ox, -oy);
    paintBeams(g, b, w, light, { x: srcX, y: srcY }, s, dusts);
    beamCache.set(b, (c = { key, cv, dusts }));
  }
  ctx.drawImage(c.cv, ox, oy);
  // a few motes drifting in each shaft
  const t = w.t;
  for (const { pts, a, room } of c.dusts) {
    ctx.fillStyle = rgba([255, 255, 240], a * s);
    for (let i = 0; i < 5; i++) {
      const u = (i * 0.37 + t * 0.02 * (1 + (i % 3))) % 1, v = (i * 0.61 + Math.sin(t * 0.3 + i) * 0.1 + 1) % 1;
      const [ax, ay] = pts[0], [bx, by] = pts[1], [cx, cy] = pts[2];
      const x = Math.round(ax + (bx - ax) * v + (cx - bx) * u), y = Math.round(ay + (by - ay) * v + (cy - by) * u);
      if (x >= room[0] && x < room[0] + room[1] && y >= room[2] - 27 && y <= room[2]) ctx.fillRect(x, y, 1, 1); // (inside the room)
    }
  }
}
function paintBeams(ctx, b, w, light, src, s, dusts) {
  const L = b.L;
  let clipped = null;
  const clipRoom = (x, wdt, y) => { ctx.save(); ctx.beginPath(); ctx.rect(x, y - 27, wdt, 28); ctx.clip(); clipped = [x, wdt, y]; };
  const floorPatch = (x0, x1, y, a) => { ctx.fillStyle = rgba(light.rgb, a * s); ctx.fillRect(Math.round(Math.min(x0, x1)), y - 1, Math.max(1, Math.round(Math.abs(x1 - x0))), 2); };
  const dust = (pts, a) => dusts.push({ pts, a, room: clipped });
  const shut = (r) => r && b.curtainsShut(r);
  const glowThrough = (x, y0, wdt, h) => { ctx.fillStyle = rgba(light.rgb, 0.28 * s); ctx.fillRect(x, y0, wdt, h); };

  // Side windows: a shaft across the room.
  for (const sw of L.sideWindows || []) {
    const y = b.feetY(sw.f), ex = b.x0 + (sw.side < 0 ? WALL : sw.x), yt = y - 20, yb = y - 10;
    if ((src.x - ex) * sw.side <= 0 || shadedAt(w.city, b, src, ex, (yt + yb) / 2)) continue; // the sun's on the other side, or blocked
    const room = L.rooms.find((r) => r.f === sw.f && r.x === sw.area.x);
    if (shut(room)) { glowThrough(sw.side < 0 ? ex : ex - 3, yt - 1, 3, yb - yt + 2); continue; }
    const d = towards(src, ex, (yt + yb) / 2), reach = (yy) => ex + (d.dx / d.dy) * (y - yy);
    clipRoom(b.x0 + sw.area.x, sw.area.w, y);
    ctx.fillStyle = rgba(light.rgb, 0.36 * s);
    ctx.beginPath(); ctx.moveTo(ex, yt); ctx.lineTo(ex, yb); ctx.lineTo(reach(yb), y + 1); ctx.lineTo(reach(yt), y + 1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(light.rgb, 0.35 * s); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ex, yt + 0.5); ctx.lineTo(reach(yt), y + 0.5); ctx.moveTo(ex, yb + 0.5); ctx.lineTo(reach(yb), y + 0.5); ctx.stroke();
    floorPatch(reach(yb), reach(yt), y, 0.55);
    dust([[ex, yt], [ex, yb], [reach(yb), y]], 0.55);
    ctx.restore();
  }

  for (const r of L.rooms) {
    if (r.outdoor || b.type === 'shop') continue;
    const y = b.feetY(r.f), rx = b.x0 + r.x;
    // Back windows: a shaft down to the floor.
    // (A glass office's whole back wall is window.)
    const win = L.glass ? { kind: 'glass' } : L.details.find((dd) => (dd.kind === 'window' || dd.kind === 'smallwindow') && dd.f === r.f && dd.x >= r.x && dd.x < r.x + r.w);
    if (win) {
      const [x0, x1, yt, yb] = win.kind === 'glass' ? [rx + 1, rx + r.w - 1, y - 26, y - 5] : [b.x0 + win.x, b.x0 + win.x + (win.kind === 'window' ? 10 : 6), y + win.top, y + win.top + (win.kind === 'window' ? 10 : 6)];
      const size = x1 - x0;
      if (!shadedAt(w.city, b, src, (x0 + x1) / 2, (yt + yb) / 2)) {
        if (shut(r)) glowThrough(x0, yt, size, size);
        else {
          const d = towards(src, (x0 + x1) / 2, (yt + yb) / 2), k = (y - yb) / d.dy, ox = d.dx * k, oy = d.dy * k;
          const frosted = win.kind === 'smallwindow' ? 0.5 : win.kind === 'glass' ? 0.6 : 1;
          clipRoom(rx, r.w, y);
          ctx.fillStyle = rgba(light.rgb, 0.3 * frosted * s);
          ctx.beginPath();
          const pts = d.dx >= 0
            ? [[x0, yt], [x1, yt], [x1 + ox, yt + oy], [x1 + ox, yb + oy], [x0 + ox, yb + oy], [x0, yb]]
            : [[x0, yt], [x1, yt], [x1, yb], [x1 + ox, yb + oy], [x0 + ox, yb + oy], [x0 + ox, yt + oy]];
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill();
          floorPatch(x0 + ox, x1 + ox, y, 0.6 * frosted);
          dust([[x0, yt], [x1, yt], [x1 + ox, yt + oy]], 0.45 * frosted);
          ctx.restore();
        }
      }
    }
    // Front windows (in the wall that's cut away): a patch of light on the back wall, and the floor.
    if (r.w < 16) continue;
    const glass = L.T.facade === 'glass';
    const [fx, fy, fw, fh] = glass ? [rx + 1, y - 25, r.w - 2, 24] : [b.x0 + Math.round(r.x + r.w / 2 - 5), y - 20, 10, 10];
    if (shut(r) || shadedAt(w.city, b, src, fx + fw / 2, fy + fh / 2)) continue;
    const d = towards(src, fx + fw / 2, fy + fh / 2), depth = 9, px = fx + d.dx * depth, py = fy + d.dy * depth;
    clipRoom(rx, r.w, y);
    ctx.fillStyle = rgba(light.rgb, (glass ? 0.14 : 0.24) * s); ctx.fillRect(Math.round(px), Math.round(py), fw, fh);
    if (py + fh > y - 2) floorPatch(px, px + fw, y, glass ? 0.2 : 0.35);
    ctx.restore();
  }
}

// Outside: the sunny side wall, the shaded one, and a warm wash when the sun is low.
export function drawFacadeLight(ctx, b, light, alpha, view) {
  if (!light || light.kind !== 'sun' || alpha <= 0.02) return;
  const L = b.L, top = b.G - (L.H - 1), x = b.x0, h = L.H - L.roofH, left = view + light.sx < x + L.w / 2;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgba([255, 236, 190], 0.35 * light.k); ctx.fillRect(left ? x : x + L.w - 2, top + L.roofH, 2, h);
  ctx.fillStyle = `rgba(10,14,40,${0.14 * light.k})`; ctx.fillRect(left ? x + L.w - 2 : x, top + L.roofH, 2, h);
  if (light.low > 0) { ctx.fillStyle = rgba([255, 150, 70], 0.13 * light.low * light.k); ctx.fillRect(x - L.ox, top, L.w + L.ox, L.H); }
  ctx.globalAlpha = 1;
}

// Long shadows along the pavement, away from the sun (from each building's roof edge).
export function drawShadows(ctx, city, seen, light, view) {
  if (!light || light.kind !== 'sun') return;
  const G = city.G, src = { x: view + light.sx, y: light.sy };
  for (const b of city.lots) {
    if (!b) continue;
    const top = b.G - (b.L.H - 1), right = src.x < b.x0 + b.L.w / 2, edge = right ? b.x0 + b.L.w : b.x0;
    const d = towards(src, edge, top), len = Math.min(480, Math.round(((G - top) * Math.abs(d.dx)) / d.dy)), dir = right ? 1 : -1;
    if (len < 2 || !seen(Math.min(edge, edge + dir * len), Math.max(edge, edge + dir * len))) continue;
    for (let k = 0; k < len; k += 6) {
      ctx.fillStyle = `rgba(15,18,40,${0.2 * light.k * (1 - k / len)})`;
      ctx.fillRect(dir > 0 ? edge + k : edge - k - 6, G + 1, 6, 4);
    }
  }
}
