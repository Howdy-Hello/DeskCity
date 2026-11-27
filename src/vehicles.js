// Vehicles: pixel sprites drawn from a side profile, and a driver that follows a path of points.
// A vehicle never drives backwards: when its next point is behind it, it stops and turns round
// (seen head-on for a moment), then drives off the other way.
import { sprite, painter, addGrain, shade } from './draw.js';

const GLASS = '#9cc6dc', GLASS_TOP = '#7aa7c0', GLINT = '#e3f3fb', TIRE = '#202024', RIM = '#a3a9b0', HUB = '#e6e6e6';
const TRIM = '#3a3a40', HEADLIGHT = '#fff4b8', TAILLIGHT = '#d63031', INK = '#1e1e22';
const DRIVE = 45, RAMP = 16, ACCEL = 35, BRAKE = 40, TURN = 0.6; // cells/s, cells/s², seconds

// Side profiles, facing right, x counted from the rear bumper, heights in cells above the road.
// Next to a 19-cell stick person: a hatchback is 30 long and 13 high.
//   top: roofline points; sill: lowest body row; belt: bottom edge of the windows; glass: window spans;
//   wheels: wheel centres; seats: where heads show (rear to front, the driver last); seams: door edges;
//   handles; mirror: the wing mirror; cargo: columns painted in the cargo colour (vans and trucks).
export const KINDS = {
  hatch: { len: 30, r: 3, sill: 2, belt: 8, top: [[0, 5], [0.6, 8], [3, 10], [7, 13], [16, 13], [21, 9], [27, 8], [29, 7], [30, 5]],
    glass: [[4, 10], [12, 20]], wheels: [6, 23], seats: [7, 16], seams: [11, 20], handles: [9, 18], mirror: 20, front: 14 },
  suv: { len: 34, r: 3, sill: 3, belt: 9, top: [[0, 6], [0.5, 13], [2, 14], [23, 14], [27, 10], [32, 9], [34, 6]],
    glass: [[2, 7], [9, 15], [17, 24]], wheels: [7, 27], seats: [5, 12, 20], seams: [8, 16, 25], handles: [14, 23], mirror: 25, rack: [3, 21], front: 16 },
  pickup: { len: 40, r: 3, sill: 3, belt: 10, top: [[0, 10], [16, 10], [16.5, 14], [18, 15], [24, 15], [28, 11], [37, 10], [39, 9], [40, 6]],
    glass: [[18, 22], [24, 27]], wheels: [7, 32], seats: [20, 25], seams: [17, 28], handles: [26], mirror: 28, bed: 16, front: 16 },
  movingvan: { len: 50, r: 4, sill: 3, belt: 11, top: [[0, 22], [1, 24], [35, 24], [35.5, 17], [40, 17], [45, 12], [49, 11], [50, 7]],
    glass: [[37, 45]], wheels: [9, 41], seats: [39, 43], seams: [36, 46], handles: [44], mirror: 46, cargo: 35, front: 18, name: 'MOVEZ' },
  van: { len: 44, r: 4, sill: 3, belt: 11, top: [[0, 6], [0.5, 19], [2, 20], [29, 20], [35, 13], [41, 11], [43, 10], [44, 7]],
    glass: [[30, 38]], wheels: [9, 35], seats: [35], seams: [20, 29, 38], handles: [36], mirror: 38, cargo: 29, front: 18 },
  boxtruck: { len: 58, r: 4, sill: 4, belt: 12, top: [[0, 26], [1, 28], [41, 28], [41.5, 19], [48, 19], [52, 13], [57, 12], [58, 8]],
    glass: [[44, 51]], wheels: [9, 19, 49], seats: [49], seams: [43, 52], handles: [50], mirror: 52, cargo: 41, front: 20 },
  // The emergency services: a police car (a sedan with a light bar and POLICE on the doors) and a fire
  // engine (red, a ladder along the roof, lockers down the side, a light bar on the cab).
  police: { len: 32, r: 3, sill: 2, belt: 8, top: [[0, 5], [0.6, 8], [4, 9], [8, 13], [18, 13], [23, 9], [29, 8], [31, 7], [32, 5]],
    glass: [[5, 11], [13, 21]], wheels: [6, 25], seats: [8, 17], seams: [12, 22], handles: [10, 19], mirror: 22, front: 14, lightbar: [11, 17], band: true, name: 'POLICE', label: 16 },
  firetruck: { len: 56, r: 4, sill: 4, belt: 12, top: [[0, 16], [1, 17], [38, 17], [38.5, 20], [48, 20], [52, 13], [55, 12], [56, 8]],
    glass: [[41, 49]], wheels: [9, 21, 46], seats: [41, 46], seams: [39, 50], handles: [48], mirror: 50, cargo: 38, front: 20, ladder: [2, 40], lightbar: [41, 47], lockers: true },
  ambulance: { len: 44, r: 4, sill: 3, belt: 11, top: [[0, 6], [0.5, 20], [2, 21], [29, 21], [35, 13], [41, 11], [43, 10], [44, 7]],
    glass: [[30, 38]], wheels: [9, 35], seats: [33, 36], seams: [20, 29, 38], handles: [36], mirror: 38, cargo: 29, front: 18, lightbar: [3, 9], cross: 14 },
};
for (const S of Object.values(KINDS)) S.height = Math.max(...S.top.map(([, h]) => h)) + (S.ladder ? 2 : 0);

function topAt(S, x) { // roofline height at column centre x
  const t = S.top;
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    const [x0, h0] = t[i - 1], [x1, h1] = t[i];
    if (x <= x1) return h0 + ((h1 - h0) * (x - x0)) / (x1 - x0 || 1);
  }
  return t[t.length - 1][1];
}
const topRow = (S, x) => Math.round(topAt(S, x + 0.5));
const inGlass = (S, x, hh) => hh > S.belt && hh < topRow(S, x) && S.glass.some(([a, b]) => x >= a && x <= b);
const inArch = (S, x, hh) => S.wheels.some((wx) => Math.hypot(x + 0.5 - (wx + 0.5), hh + 0.5 - S.r) < S.r + 1.6);

// colors: { body, cargo?, stripe?, ink? }
function sideSprite(S, colors) {
  const H0 = S.height, cv = sprite(S.len, H0 + 1), p = painter(cv), row = (hh) => H0 - hh;
  for (let x = 0; x < S.len; x++) {
    const top = topRow(S, x), c = S.cargo !== undefined && x < S.cargo ? colors.cargo : colors.body;
    for (let hh = S.sill; hh <= top; hh++) {
      if (inArch(S, x, hh)) {
        if (!inArch(S, x, hh + 1) || hh === S.sill) continue;
        p.px(x, row(hh), '#141418'); // the dark wheel well
        continue;
      }
      let col = c;
      if (inGlass(S, x, hh)) col = hh === top - 1 ? GLASS_TOP : GLASS;
      else if (hh === top) col = shade(c, 1.18);               // light catching the roof
      else if (hh <= S.sill + 1) col = shade(c, 0.74);         // shadowed sills
      else if (hh === S.belt) col = shade(c, 1.08);            // shoulder line under the windows
      p.px(x, row(hh), col);
    }
    if (inArch(S, x, S.sill + 1) && !inArch(S, x, S.sill + 2)) p.px(x, row(S.sill + 2), shade(c, 0.6)); // arch lip
  }
  for (const sx of S.seams) for (let hh = S.sill + 2; hh < S.belt; hh++) if (!inArch(S, sx, hh)) p.px(sx, row(hh), shade(colors.body, 0.72));
  for (const hx of S.handles) p.rect(hx, row(S.belt - 2), 2, 1, shade(colors.body, 1.35));
  if (S.cargo === undefined || S.bed) p.rect(S.mirror, row(S.belt + 1), 2, 1, TRIM);
  else p.rect(S.mirror, row(S.belt + 2), 1, 3, TRIM);
  p.rect(0, row(S.sill + 1), 2, 2, TRIM); p.rect(S.len - 2, row(S.sill + 1), 2, 2, TRIM); // bumpers
  p.rect(0, row(S.belt - 2), 1, 2, TAILLIGHT);
  p.rect(S.len - 1, row(S.belt - 2), 1, 2, HEADLIGHT); p.px(S.len - 2, row(S.belt - 2), HEADLIGHT);
  if (S.rack) for (let x = S.rack[0]; x <= S.rack[1]; x += 2) p.px(x, row(S.height + 0), TRIM);
  if (S.bed) { // pickup bed: the inside of the far wall, and the tailgate
    p.rect(1, row(S.belt), S.bed - 1, 1, shade(colors.body, 0.6)); p.rect(1, row(S.belt - 1), 1, S.belt - S.sill - 2, shade(colors.body, 0.7));
  }
  if (S.band) p.rect(1, row(S.sill), S.len - 2, 1, colors.stripe || '#1f3a93'); // the police band along the doors
  if (S.lockers) for (let x = 3; x < S.cargo - 4; x += 9) { p.rect(x, row(S.belt + 1), 7, 5, shade(colors.body, 0.85)); p.px(x + 5, row(S.belt - 1), '#d5d8dc'); }
  if (S.ladder) { const lh = topRow(S, S.ladder[0] + 1) + 1; p.rect(S.ladder[0], row(lh + 1), S.ladder[1] - S.ladder[0], 1, '#d5d8dc'); for (let x = S.ladder[0]; x <= S.ladder[1]; x += 3) p.px(x, row(lh), '#d5d8dc'); } // the ladder on the roof
  if (S.cross) { const c = S.cross, m = row(S.belt + 4); p.rect(c - 1, m - 3, 3, 7, '#c0392b'); p.rect(c - 3, m - 1, 7, 3, '#c0392b'); } // a red cross on the side
  if (S.cargo !== undefined) {
    if (colors.stripe) p.rect(0, row(S.sill + 4), S.cargo, 2, colors.stripe);
    p.rect(S.cargo, row(topRow(S, S.cargo + 1)), 1, topRow(S, S.cargo + 1) - S.sill, shade(colors.body, 0.7)); // cab / body gap
    p.rect(1, row(S.height - 2), 1, S.height - S.sill - 4, shade(colors.cargo, 0.82)); // rear doors
  }
  addGrain(cv, 0.06);
  return cv;
}

// Seen head-on, for the moment a vehicle turns round.
function frontSprite(S, colors) {
  const w = S.front, cab = S.cargo !== undefined ? topAt(S, S.cargo + 3) : S.height;
  const H0 = S.height, cv = sprite(w, H0 + 1), p = painter(cv), row = (hh) => H0 - hh, c = colors.body;
  if (S.cargo !== undefined && !S.bed) p.rect(0, row(S.height), w, S.height - Math.round(cab) + 1, colors.cargo); // the box behind the cab
  for (let hh = S.sill; hh <= Math.round(cab); hh++) {
    const roof = hh >= Math.round(cab) - 1, inset = hh > S.belt ? 2 : 0;
    p.rect(inset, row(hh), w - inset * 2, 1, roof ? shade(c, 1.18) : hh <= S.sill + 1 ? shade(c, 0.74) : c);
    if (hh > S.belt && !roof) p.rect(inset + 1, row(hh), w - inset * 2 - 2, 1, hh === Math.round(cab) - 2 ? GLASS_TOP : GLASS);
  }
  p.rect(2, row(S.belt - 2), 2, 2, HEADLIGHT); p.rect(w - 4, row(S.belt - 2), 2, 2, HEADLIGHT);
  p.rect(5, row(S.belt - 2), w - 10, 3, TRIM); for (let x = 6; x < w - 5; x += 2) p.px(x, row(S.belt - 3), '#55555c'); // grille
  p.rect(0, row(S.sill), w, 1, TRIM);
  p.rect(0, row(S.sill - 1), 3, S.sill, TIRE); p.rect(w - 3, row(S.sill - 1), 3, S.sill, TIRE);
  addGrain(cv, 0.06);
  return cv;
}

const DISC = (r) => { const out = []; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) out.push([x, y]); return out; };
// A wheel (tyre and rim) of radius r, drawn once and reused: centre at (r, r).
const WHEELS = new Map();
function wheel(r) {
  if (!WHEELS.has(r)) {
    const cv = sprite(2 * r + 1, 2 * r + 1), g = cv.getContext('2d');
    g.fillStyle = TIRE; for (const [a, b] of DISC(r)) g.fillRect(r + a, r + b, 1, 1);
    g.fillStyle = RIM; for (const [a, b] of DISC(r - 2)) g.fillRect(r + a, r + b, 1, 1);
    WHEELS.set(r, cv);
  }
  return WHEELS.get(r);
}
const HEAD_RING = [[-1, -2], [0, -2], [1, -2], [-2, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [2, 1], [-1, 2], [0, 2], [1, 2]];

export class Vehicle {
  // colors: { body, cargo?, stripe?, ink? }; name: lettering on the side (delivery companies)
  constructor(kind, colors, name = null) {
    this.kind = kind; this.S = KINDS[kind]; this.len = this.S.len; this.colors = colors; this.name = name ?? this.S.name ?? null;
    this.side = sideSprite(this.S, colors); this.head = frontSprite(this.S, colors);
    this.x = 0; this.y = 0; this.dir = 1; this.path = []; this.speed = 0; this.turnT = 0; this.slope = 0; this.odo = 0;
    this.riders = [];  // who shows in the windows, driver first: { color }
    this.cargo = 0;    // boxes poking out of a pickup's bed
  }
  go(points) { this.path = points.map((q) => ({ x: q.x, y: q.y })); }
  get moving() { return this.path.length > 0 || this.turnT > 0; }
  rear() { return this.x - this.dir * (this.len / 2); }

  update(dt) {
    if (this.turnT > 0) { // turning round on the spot
      this.turnT -= dt;
      if (this.turnT <= 0) { this.turnT = 0; this.dir = -this.dir; }
      return;
    }
    const q = this.path[0];
    if (!q) { this.speed = 0; this.slope = 0; return; }
    const dx = q.x - this.x, dy = q.y - this.y, d = Math.hypot(dx, dy);
    if (d < 0.3) { this.x = q.x; this.y = q.y; this.path.shift(); if (!this.path.length) this.slope = 0; return; }
    if (Math.abs(dx) > 0.3 && Math.sign(dx) !== this.dir) { this.speed = 0; this.turnT = TURN; this.slope = 0; return; }
    // Brake for the last point, or for one where the road doubles back.
    const next = this.path[1], reverses = next && Math.sign(next.x - q.x) === -Math.sign(dx) && Math.abs(next.x - q.x) > 0.3;
    // Siren on: an emergency run (fire engine, ambulance, police car): over twice as fast, quicker off the mark and harder on the brakes.
    const rush = this.siren === true ? 2.3 : 1;
    const limit = (Math.abs(dy) > 0.3 ? RAMP : DRIVE) * rush, stop = !next || reverses ? Math.max(3, Math.sqrt(2 * BRAKE * rush * d)) : Infinity;
    this.speed = Math.min(limit, this.speed + ACCEL * rush * dt, stop);
    const step = Math.min(d, this.speed * dt);
    this.x += (dx / d) * step; this.y += (dy / d) * step; this.odo += step;
    this.slope = Math.abs(dx) > 0.3 ? dy / dx : 0;
  }

  draw(ctx, t, night = 0) {
    const S = this.S, H0 = S.height, by = Math.round(this.y);
    if (this.turnT > 0) { // head-on, mid-turn
      const x = Math.round(this.x - S.front / 2);
      ctx.drawImage(this.head, x, by - H0);
      const driver = this.riders[0];
      if (driver) this.headAt(ctx, x + Math.round(S.front * 0.66), by - S.belt - 3, by, driver.color, (hh) => hh > S.belt && hh < S.height - 1);
      return;
    }
    const x0 = Math.round(this.x - S.len / 2), len = S.len, k = this.slope;
    const lift = (i) => Math.round(k * (i - len / 2));       // tilt on a ramp, column by column
    const world = (sx) => (this.dir > 0 ? sx : len - 1 - sx); // sprite column -> left-to-right column
    if (k === 0) {
      if (this.dir > 0) ctx.drawImage(this.side, x0, by - H0);
      else { ctx.save(); ctx.translate(x0 + len, 0); ctx.scale(-1, 1); ctx.drawImage(this.side, 0, by - H0); ctx.restore(); }
    } else {
      for (let i = 0; i < len; i++) ctx.drawImage(this.side, world(i), 0, 1, H0 + 1, x0 + i, by - H0 + lift(i), 1, H0 + 1);
    }
    // People inside: heads in the windows, driver at the front.
    const seats = [...S.seats].reverse();
    this.riders.slice(0, seats.length).forEach((r, n) => {
      const sx = seats[n], i = world(sx), top = topRow(S, sx);
      this.headAt(ctx, x0 + i, by - S.belt - 3 + lift(i), by + lift(i), r.color, (hh) => hh > S.belt && hh < top);
    });
    for (const [a] of S.glass) { const i = world(a + 1); ctx.fillStyle = GLINT; ctx.fillRect(x0 + i, by - S.belt - 2 + lift(i), 1, 1); } // a glint on the glass
    if (S.bed && this.cargo) for (let n = 0; n < this.cargo; n++) { // boxes in the pickup bed
      const i = world(3 + n * 5); ctx.fillStyle = n % 2 ? '#c8a06a' : '#b8905a'; ctx.fillRect(x0 + Math.min(i, i - (this.dir > 0 ? 0 : 3)), by - S.belt - 4 + lift(i), 4, 4);
    }
    for (const wx of S.wheels) { // wheels with turning hubs
      const i = world(wx), cx = x0 + i, cy = by - S.r + lift(i);
      ctx.drawImage(wheel(S.r), cx - S.r, cy - S.r);
      const ang = (this.odo / S.r) * this.dir;
      ctx.fillStyle = HUB; ctx.fillRect(cx + Math.round(Math.cos(ang) * (S.r - 2)), cy + Math.round(Math.sin(ang) * (S.r - 2)), 1, 1);
    }
    if (S.lightbar) { // the light bar: flashing while on a call
      const [a, b] = S.lightbar, on = this.siren && Math.floor(t * 6) % 2;
      for (let sx = a; sx <= b; sx++) {
        const i = world(sx), left = sx < (a + b) / 2;
        ctx.fillStyle = !this.siren ? '#7d858c' : (left === !!on) ? (this.kind === 'police' ? '#2e86de' : '#ffffff') : '#e74c3c';
        ctx.fillRect(x0 + i, by - topRow(S, sx) - 1 + lift(i), 1, 1);
      }
      if (this.siren) { ctx.fillStyle = on ? 'rgba(231,76,60,0.25)' : (this.kind === 'police' ? 'rgba(46,134,222,0.25)' : 'rgba(255,255,255,0.2)'); ctx.fillRect(x0 + world(a) - 3, by - topRow(S, a) - 5, b - a + 7, 5); }
    }
    if (this.name && k === 0) { // lettering on the side
      const span = S.label ? S.label * 2 : S.cargo, big = (this.name.length * 4 - 1) * 2 <= span - 6, s = big ? 2 : 1, tw = (this.name.length * 4 - 1) * s, mid = span / 2; // as big as fits
      const lx = this.dir > 0 ? x0 + Math.round(mid - tw / 2) : x0 + len - Math.round(mid + tw / 2);
      painter(ctx).text(this.name, lx, S.label ? by - S.belt + 1 : by - S.height + (big ? 6 : 5), this.colors.ink || '#e67e22', s);
    }
    if (night > 0 && this.moving) { // headlights on the road ahead
      const fx = this.dir > 0 ? x0 + len : x0 - 1, hy = by - S.belt + 2 + lift(this.dir > 0 ? len - 1 : 0);
      for (let n = 0; n < 4; n++) { ctx.fillStyle = `rgba(255,236,170,${(0.22 - n * 0.05) * night})`; ctx.fillRect(this.dir > 0 ? fx + n * 4 : fx - n * 4 - 3, hy - 1 + Math.floor(n / 2), 4, 2 + n); }
    }
  }
  headAt(ctx, cx, cy, base, color, keep) { // a head (and the top of the shoulders) behind the glass
    ctx.fillStyle = color || INK;
    for (const [a, b] of [...HEAD_RING, [-1, 3], [0, 3], [1, 3], [-2, 4], [2, 4]]) if (keep(base - (cy + b))) ctx.fillRect(cx + a, cy + b, 1, 1);
  }
}
