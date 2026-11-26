// The sun and the moon. They travel round a loop that hugs the screen just outside its edges, so
// only a little of each disc peeks in. DeskCity keeps Beijing time in midsummer: the sun rises on
// the left at about 4:51, is highest (73 degrees up) at about 12:16, sets on the right at about
// 19:41, then passes behind the street at night. The moon is always opposite the sun and shows its
// real phase for the date. Dusk and dawn follow the sun's real height (see nightLevel).
import { sprite, painter, addGrain } from './draw.js';

const SUN_R = 20, MOON_R = 15;
const PEEK = 0.35;  // how much of each disc shows at most (0.5 = half)

// ---------- where the sun is: Beijing (39.9 N, 116.4 E), on Beijing time (UTC+8), at midsummer ----------
const D = Math.PI / 180, LAT = 39.9 * D, DEC = 23.44 * D;
const NOON = 12 + 16 / 60; // solar noon: Beijing is 3.6 degrees west of the UTC+8 meridian (14 min), plus ~2 min equation of time
const HALF_DAY = Math.acos(-Math.tan(LAT) * Math.tan(DEC)) / D / 15; // hours from sunrise to noon (~7.4)
// The sun's height above the horizon, in degrees, at a given clock hour.
export function sunElevation(hour) {
  const H = (hour - NOON) * 15 * D;
  return Math.asin(Math.sin(LAT) * Math.sin(DEC) + Math.cos(LAT) * Math.cos(DEC) * Math.cos(H)) / D;
}
// How dark it is: 0 in daylight, 1 at night, through dawn and dusk (sun from 3 degrees up to 6 below).
export function nightLevel(hour) { return Math.max(0, Math.min(1, (3 - sunElevation(hour)) / 9)); }
// Where on its loop the sun is: 0 rising on the left, PI/2 overhead at noon, PI setting on the right,
// then round behind the street through the night.
function sunAngle(hour) {
  const rise = NOON - HALF_DAY, set = NOON + HALF_DAY, h = ((hour - rise) % 24 + 24) % 24;
  return h <= 2 * HALF_DAY ? (Math.PI * h) / (2 * HALF_DAY) : Math.PI + (Math.PI * (h - 2 * HALF_DAY)) / (24 - 2 * HALF_DAY);
}
const hourOf = (now) => { const d = new Date(now); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
const SQUARE = 8;   // loop shape: 2 = a plain ellipse, higher = hugs the screen's edges more
const SYNODIC = 29.530588853 * 864e5, NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // a known new moon

function fillDisc(p, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) { const h = Math.round(Math.sqrt(r * r - y * y)); p.rect(cx - h, cy + y, h * 2 + 1, 1, c); }
}

// Two frames of the sun, so the rays shimmer.
const sun = [0, 1].map((frame) => {
  const R = SUN_R + 9, cv = sprite(R * 2 + 1, R * 2 + 1), p = painter(cv);
  fillDisc(p, R, R, SUN_R + 4, 'rgba(255,216,74,0.18)'); // glow
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, long = (k + frame) % 2 === 0, r0 = SUN_R + 2, r1 = SUN_R + (long ? 8 : 5);
    p.line(R + Math.cos(a) * r0, R + Math.sin(a) * r0, R + Math.cos(a) * r1, R + Math.sin(a) * r1, '#ffc63a');
  }
  fillDisc(p, R, R, SUN_R, '#f5a623');
  fillDisc(p, R, R, SUN_R - 2, '#ffd84a');
  fillDisc(p, R - 4, R - 4, SUN_R - 9, '#ffe98a');
  addGrain(cv, 0.08);
  return cv;
});

let moon = null, moonPhase = -1;
function drawMoon(phase) { // phase 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter
  const R = MOON_R + 2, cv = sprite(R * 2 + 1, R * 2 + 1), p = painter(cv);
  fillDisc(p, R, R, MOON_R + 2, 'rgba(220,225,255,0.12)'); // soft glow
  fillDisc(p, R, R, MOON_R, '#e9e7df');
  for (const [dx, dy, r] of [[-5, -4, 3], [4, 3, 4], [-2, 7, 2], [7, -6, 1], [-8, 3, 1]]) fillDisc(p, R + dx, R + dy, r, '#d3cfc3'); // craters
  const lit = Math.cos(phase * Math.PI * 2);
  for (let y = -MOON_R; y <= MOON_R; y++) { // the shadowed part, faintly lit by earthshine
    const h = Math.sqrt(MOON_R * MOON_R - y * y), edge = h * lit;
    const [a, b] = phase < 0.5 ? [-h, edge] : [-edge, h]; // waxing: lit on the right; waning: on the left
    const x0 = Math.floor(a), x1 = Math.ceil(b); // round outwards so no lit specks are left on the rim
    if (x1 > x0) p.rect(R + x0, R + y, x1 - x0 + 1, 1, 'rgba(28,35,64,0.82)');
  }
  addGrain(cv, 0.08);
  return cv;
}

// How bright the moon is tonight: 0 at new moon, 1 at full.
export function moonBrightness(now) {
  const phase = (((now - NEW_MOON) % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
  return (1 - Math.cos(phase * Math.PI * 2)) / 2;
}

// A point on the loop round the screen; t = 0 left, PI/2 top, PI right, 3PI/2 bottom.
function onLoop(t, W, H, r) {
  const a = W / 2 + r * (1 - PEEK), b = H / 2 + r * (1 - PEEK), k = 2 / SQUARE;
  const c = Math.cos(t), s = Math.sin(t);
  return [W / 2 - a * Math.sign(c) * Math.abs(c) ** k, H / 2 - b * Math.sign(s) * Math.abs(s) ** k];
}

// Where the sun and the moon are drawn on a W x H screen right now (their centres).
export const sunAt = (now, W, H) => onLoop(sunAngle(hourOf(now)), W, H, SUN_R);
export const moonAt = (now, W, H) => onLoop(sunAngle(hourOf(now)) + Math.PI, W, H, MOON_R);

export function drawSky(ctx, W, H, now, t) {
  const angle = sunAngle(hourOf(now));
  const phase = (((now - NEW_MOON) % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
  if (Math.abs(phase - moonPhase) > 0.01) { moon = drawMoon(phase); moonPhase = phase; }
  const [sx, sy] = onLoop(angle, W, H, SUN_R), img = sun[Math.floor(t * 2) % 2];
  ctx.drawImage(img, Math.round(sx - img.width / 2), Math.round(sy - img.height / 2));
  const [mx, my] = onLoop(angle + Math.PI, W, H, MOON_R);
  ctx.drawImage(moon, Math.round(mx - moon.width / 2), Math.round(my - moon.height / 2));
}
