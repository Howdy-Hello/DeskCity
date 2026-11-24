// People: daily routines, getting around (doors, stairs, elevators), and climbing on your windows.
import { ANIM, newPose, blend, drawStickman } from './stickman.js';

const WALK = 14, STAIRS = 10, CLIMB = 9, GRAVITY = 300; // cells per second (and per second²)
const MIN = 60e3; // one minute of town time, in ms
const IDLE = ['stretch', 'scratch', 'look', 'watch'];

const ACT_ANIM = {
  sleep: 'sleep', eat: 'eat', lunch: 'eat', cook: 'cook', fridge: 'fridge', dishes: 'dishes', tv: 'tv',
  toilet: 'toilet', wash: 'wash', shower: 'shower', bath: 'bath', work: 'type', coffee: 'coffee', meet: 'talkSit',
  browse: 'browse', pay: 'pay', rest: 'sit', dress: 'look', print: 'wait', front: 'stand',
};
// If a home or office has no spot for an activity, try these instead.
const FALLBACK = { eat: ['eat', 'tv', 'rest'], lunch: ['lunch', 'eat', 'coffee'], shower: ['shower', 'bath', 'wash'], tv: ['tv', 'rest', 'eat'], dishes: ['dishes', 'wash'] };

export function makePerson(d) {
  return {
    id: d.id, seed: d.seed, jitter: d.jitter, home: d.home, job: d.job ?? null,
    x: 0, y: 0, b: null, f: 0, surface: 'ground', dir: 1, vx: 0, vy: 0, win: null, winX: 0, side: 0,
    pose: newPose(), phase: d.seed % 7, anim: 'stand', hip: null, spot: null,
    plan: [], wantKey: null, fidget: 'look', fidgetEnd: 0, shoppedDay: -1, landEnd: 0,
  };
}

// ---------- what someone wants to be doing right now ----------
// acts: 'act' lasts until the next part of the day; [act, minutes] lasts that long.
function want(p, w) {
  const h = (w.hour - p.jitter + 24) % 24, roll = (p.seed + w.day * 7) % 10;
  const work = p.job && w.city.lots[p.job.lot];
  if (h < 6.75 || h >= 23) return { key: 'sleep', at: 'home', acts: ['sleep'] };
  if (h < 7.25) return { key: 'wake', at: 'home', acts: [['toilet', 4], ['shower', 8], 'wash'] };
  if (h < 8) return { key: 'breakfast', at: 'home', acts: [['fridge', 1], 'eat'] };
  if (h < 17) {
    if (work?.ready()) {
      if (h >= 12 && h < 13) return { key: 'lunch', at: 'work', acts: [['coffee', 3], 'lunch'] };
      if (h >= 15 && h < 15.3 && roll < 5) return { key: 'break', at: 'work', acts: ['coffee'] };
      return { key: 'work', at: 'work', acts: ['work'] };
    }
    return roll < 4 ? { key: 'explore', at: 'out' } : { key: 'relax', at: 'home', acts: ['tv'] };
  }
  if (h < 18 && roll < 3 && p.shoppedDay !== w.day && w.city.shops().length) return { key: 'shop', at: 'shop' };
  if (h < 18.5) return { key: 'cook', at: 'home', acts: [['fridge', 1], 'cook'] };
  if (h < 19.25) return { key: 'dinner', at: 'home', acts: ['eat'] };
  if (h < 21 && roll >= 6) return { key: 'explore', at: 'out' };
  if (h < 22.5) return { key: 'evening', at: 'home', acts: ['tv'] };
  return { key: 'bedtime', at: 'home', acts: [['dishes', 5], 'wash'] };
}

// ---------- route planning ----------
const here = (p) => ({ b: p.b, f: p.f });

function vertical(b, from, to) {
  if (from === to) return [];
  if (b.elevator) return [{ t: 'walk', x: b.elevX() }, { t: 'elev', to }];
  const s = [];
  for (let f = from; f !== to; f += Math.sign(to - from)) {
    const up = to > from, flight = up ? f : f - 1;
    s.push({ t: 'walk', x: b.stairX() }, { t: 'stairs', to: up ? f + 1 : f - 1, flight, up });
  }
  return s;
}

// Steps from `from` ({b, f}) to x on floor f of building b (b = null: outside on the street).
function route(from, b, f, x) {
  const s = [];
  if (from.b && from.b !== b) s.push(...vertical(from.b, from.f, 0), { t: 'walk', x: from.b.doorX() }, { t: 'exit' });
  if (b && from.b !== b) s.push({ t: 'walk', x: b.doorX() }, { t: 'enter', b }, ...vertical(b, 0, f));
  else if (b) s.push(...vertical(b, from.f, f));
  s.push({ t: 'walk', x });
  return s;
}

function pickSpot(p, b, act, unit) {
  for (const a of FALLBACK[act] || [act]) {
    const list = b.spots(a, unit);
    if (list.length) return list[p.seed % list.length];
  }
  return null;
}

function activityPlan(p, wn, w) {
  const b = w.city.lots[wn.at === 'home' ? p.home.lot : p.job.lot];
  if (!b?.ready()) return wander(p, w);
  const unit = wn.at === 'home' ? p.home.unit : undefined;
  const steps = [];
  let from = here(p);
  for (const a of wn.acts) {
    const [act, mins] = Array.isArray(a) ? a : [a, 0];
    const s = act === 'sleep' ? b.spots('sleep', unit)[p.home.bed] : act === 'work' ? b.spots('work')[p.job.desk] : pickSpot(p, b, act, unit);
    if (!s) continue;
    steps.push(...route(from, b, s.f, b.x0 + s.x), { t: 'do', spot: s, act, mins });
    from = { b, f: s.f };
  }
  return steps.length ? steps : wander(p, w);
}

function shopping(p, w) {
  const shops = w.city.shops();
  if (!shops.length) return wander(p, w);
  const b = shops.reduce((a, c) => (Math.abs(c.doorX() - p.x) < Math.abs(a.doorX() - p.x) ? c : a));
  const browse = b.spots('browse'), pay = b.spots('pay'), steps = [];
  let from = here(p);
  for (let i = 0; i < 2 + (p.seed % 2) && browse.length; i++) {
    const s = browse[(p.seed + i * 3 + w.day) % browse.length];
    steps.push(...route(from, b, 0, b.x0 + s.x), { t: 'do', spot: s, mins: 3 + i });
    from = { b, f: 0 };
  }
  if (pay.length) { const s = pay[p.seed % pay.length]; steps.push(...route(from, b, 0, b.x0 + s.x), { t: 'do', spot: s, mins: 2 }); }
  steps.push({ t: 'shopped' });
  return steps;
}

function wander(p, w) {
  const steps = p.b ? route(here(p), null, 0, p.b.doorX()) : [];
  return [...steps, { t: 'walk', x: Math.max(8, Math.min(w.W - 8, p.x + (Math.random() - 0.5) * 160)) }, { t: 'do', anim: 'stand', mins: 4 }];
}

// ---------- your windows: climbing, standing on top, jumping off ----------
const inside = (v, x, y) => x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h;

// Window sides that reach down near the ground, so someone can climb them.
function climbable(w) {
  const out = [];
  w.windows.forEach((win, i) => {
    if (win.y + win.h < w.G - 24 || win.y < 40) return;
    for (const side of [-1, 1]) {
      const x = Math.round(side < 0 ? win.x - 2 : win.x + win.w + 1);
      if (x < 4 || x > w.W - 4) continue;
      if (w.windows.some((v, j) => j !== i && inside(v, x, w.G - 2))) continue; // another window is in the way
      out.push({ id: win.id, side, x });
    }
  });
  return out;
}

function explore(p, w) {
  if (p.surface === 'window') {
    const r = (k) => ((p.seed * 7 + k * 13 + w.day) % 100) / 100;
    return [
      { t: 'walk', frac: 0.1 + 0.8 * r(1) }, { t: 'do', anim: 'edge', hip: 0, mins: 8 + 10 * r(2) },
      { t: 'walk', frac: 0.1 + 0.8 * r(3) }, { t: 'do', anim: 'stand', mins: 4 },
      { t: 'walk', frac: r(4) < 0.5 ? -0.05 : 1.05 }, { t: 'jump' },
    ];
  }
  const out = p.b ? route(here(p), null, 0, p.b.doorX()) : [];
  const spots = climbable(w).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
  const c = spots[(p.seed + w.day) % Math.min(2, spots.length || 1)];
  if (!c) return wander(p, w);
  return [...out, { t: 'walk', x: c.x }, { t: 'climb', win: c.id, side: c.side, x: c.x }];
}

function offWindow(p, w) {
  const win = w.windows.find((v) => v.id === p.win);
  const left = !win || p.x - win.x < win.w / 2;
  return [{ t: 'walk', frac: left ? -0.05 : 1.05 }, { t: 'jump' }];
}

function fall(p) {
  Object.assign(p, { surface: 'air', vx: 0, vy: 0, plan: [], hip: null, spot: null, win: null, b: null });
}

// Where someone falling from y0 to y1 at x lands: the ground, or the top of a window.
function landing(w, x, y0, y1) {
  let best = y1 >= w.G ? { y: w.G } : null;
  w.windows.forEach((win, i) => {
    const sy = win.y - 1;
    if (x < win.x || x > win.x + win.w || sy <= y0 || sy > y1 || sy < 25) return;
    if (w.windows.slice(0, i).some((v) => inside(v, x, sy))) return; // that bit of edge is under another window
    if (!best || sy < best.y) best = { y: sy, win };
  });
  return best;
}

function physics(p, dt, w) {
  if (p.surface === 'window' || p.surface === 'climb') {
    const win = w.windows.find((v) => v.id === p.win);
    if (!win) return fall(p);
    if (p.surface === 'window') { // ride along when the window moves
      p.x += win.x - p.winX; p.winX = win.x; p.y = win.y - 1;
      if (p.x < win.x - 1 || p.x > win.x + win.w + 1) fall(p);
    } else if (Math.abs((p.side < 0 ? win.x - 2 : win.x + win.w + 1) - p.x) > 3) fall(p);
  }
  if (p.surface === 'air') {
    const y0 = p.y;
    p.vy = Math.min(p.vy + GRAVITY * dt, 500);
    p.y += p.vy * dt; p.x += p.vx * dt;
    const land = landing(w, p.x, y0, p.y);
    if (land) {
      Object.assign(p, { y: land.y, surface: land.win ? 'window' : 'ground', win: land.win?.id ?? null, winX: land.win?.x ?? 0, vx: 0, vy: 0, landEnd: w.t + 0.4, wantKey: null });
    }
  }
}

// ---------- the step runner ----------
const done = (p) => p.plan.shift();

function run(p, dt, w) {
  const s = p.plan[0];
  if (!s) {
    p.anim = 'stand';
    return;
  }
  switch (s.t) {
    case 'walk': {
      let x = s.x;
      if (s.frac !== undefined) { const win = w.windows.find((v) => v.id === p.win); if (!win) return done(p); x = win.x + s.frac * win.w; }
      const dx = x - p.x;
      if (Math.abs(dx) < 0.6) { p.x = x; return done(p); }
      p.dir = Math.sign(dx);
      p.x += p.dir * Math.min(Math.abs(dx), WALK * dt);
      p.phase += dt * 9;
      p.anim = 'walk';
      return;
    }
    case 'stairs': { // follow the flight up to the half landing, turn, and take the next flight
      if (!s.path) { s.path = p.b.stairPath(s.flight, s.up); s.i = 0; }
      let move = STAIRS * dt;
      while (move > 0 && s.i < s.path.length - 1) {
        const [tx, ty] = s.path[s.i + 1], dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.01) p.dir = Math.sign(dx);
        if (d <= move) { p.x = tx; p.y = ty; s.i++; move -= d; } else { p.x += (dx / d) * move; p.y += (dy / d) * move; move = 0; }
      }
      p.phase += dt * 9; p.anim = 'stairs';
      if (s.i >= s.path.length - 1) { p.f = s.to; done(p); }
      return;
    }
    case 'elev': {
      const e = p.b.elevator;
      if (!s.state) { s.state = 'call'; e.call(p.f); }
      if (s.state === 'call') {
        p.anim = 'wait';
        if (e.openAt(p.f)) s.state = 'board'; else e.call(p.f);
      }
      if (s.state === 'board') {
        if (!e.openAt(p.f)) { s.state = 'call'; return; }
        e.hold();
        const dx = p.b.elevX() - p.x;
        if (Math.abs(dx) > 0.6) { p.dir = Math.sign(dx); p.x += p.dir * Math.min(Math.abs(dx), WALK * dt); p.phase += dt * 9; p.anim = 'walk'; return; }
        s.state = 'ride'; p.surface = 'elev'; e.call(s.to);
      }
      if (s.state === 'ride') {
        p.y = p.b.feetY(e.pos); p.anim = 'stand'; p.dir = 1;
        if (e.openAt(s.to)) { p.f = s.to; p.y = p.b.feetY(s.to); p.surface = 'floor'; e.hold(); done(p); }
        else if (e.state === 'idle' && e.pos !== s.to) e.call(s.to);
      }
      return;
    }
    case 'exit': p.b = null; p.f = 0; p.surface = 'ground'; p.y = w.G; return done(p);
    case 'enter': p.b = s.b; p.f = 0; p.surface = 'floor'; p.y = s.b.feetY(0); return done(p);
    case 'shopped': p.shoppedDay = w.day; return done(p);
    case 'climb': {
      const win = w.windows.find((v) => v.id === s.win);
      if (!win) return done(p);
      if (p.surface !== 'climb') Object.assign(p, { surface: 'climb', win: win.id, side: s.side, dir: -s.side, x: s.x });
      p.y -= CLIMB * dt; p.phase += dt * 6; p.anim = 'climb';
      p.hip = { x: p.x - p.dir, y: p.y - 7 };
      if (p.y - 7 <= win.y) { // over the top
        Object.assign(p, { surface: 'window', x: s.side < 0 ? win.x + 3 : win.x + win.w - 3, y: win.y - 1, winX: win.x, hip: null });
        done(p);
      }
      return;
    }
    case 'jump':
      if (p.surface === 'window') { fall(p); p.vy = -55; p.vx = p.dir * 18; }
      return done(p);
    case 'do': {
      if (!s.started) {
        s.started = true;
        s.until = s.mins ? w.now + s.mins * MIN : 0;
        if (s.spot) { p.spot = s.spot; p.dir = s.spot.dir; }
        const hip = s.spot ? s.spot.hip : s.hip;
        p.hip = hip !== undefined ? { x: p.x, y: p.y - hip } : null;
      }
      p.anim = s.spot ? ACT_ANIM[s.act || s.spot.act] : s.anim; // eating on the sofa still looks like eating
      if (p.hip && p.surface === 'window') { p.hip.x = p.x; p.hip.y = p.y; } // sitting on a moving window
      if (s.until && w.now >= s.until) { p.hip = null; p.spot = null; done(p); }
      return;
    }
  }
}

function think(p, w) {
  if (p.surface === 'air' || p.surface === 'climb' || p.surface === 'elev' || w.t < p.landEnd) return;
  if (p.plan[0]?.t === 'stairs' && p.plan[0].path) return; // finish the flight first
  const wn = want(p, w);
  if (wn.key === p.wantKey && p.plan.length) return;
  p.wantKey = wn.key; p.hip = null; p.spot = null;
  if (p.surface === 'window' && wn.at !== 'out') p.plan = offWindow(p, w);
  else if (wn.at === 'out') p.plan = explore(p, w);
  else if (wn.at === 'shop') p.plan = shopping(p, w);
  else p.plan = activityPlan(p, wn, w);
}

export function updatePerson(p, dt, w) {
  physics(p, dt, w);
  think(p, w);
  if (p.surface === 'air') p.anim = 'fall';
  else if (w.t < p.landEnd) p.anim = 'land';
  else run(p, dt, w);
  if (p.anim === 'stand') { // fidget now and then
    if (w.t > p.fidgetEnd + 5 + (p.seed % 9)) { p.fidget = IDLE[(p.seed + Math.floor(w.t)) % IDLE.length]; p.fidgetEnd = w.t + 2.2; }
    if (w.t < p.fidgetEnd) p.anim = p.fidget;
  }
}

const Z = [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]];
export function drawPerson(ctx, p, t) {
  blend(p.pose, (ANIM[p.anim] || ANIM.stand)(t + (p.seed % 10), p.phase), 0.3);
  const head = drawStickman(ctx, p.x, p.y, p.dir, p.pose, p.hip);
  if (p.anim === 'sleep' && p.hip) {
    ctx.fillStyle = p.spot?.item.color || '#4f81bd';
    ctx.fillRect(Math.round(p.hip.x - 5), Math.round(p.hip.y - 1), 12, 3); // blanket
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.35 + i / 3 + p.seed * 0.1) % 1;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = '#5b8def';
      for (const [a, b] of Z) ctx.fillRect(Math.round(head.x + 3 + k * 6) + a, Math.round(head.y - 6 - k * 12) + b, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}
