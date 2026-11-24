// The stick figure: a little jointed skeleton (hips, knees, shoulders, elbows, head)
// drawn pixel by pixel. Animations are target poses; the figure blends toward them smoothly.
import { lineCells } from './draw.js';

const THIGH = 3, SHIN = 4, TORSO = 6, UPPER = 3, FORE = 3, HEAD = 2;
export const HEIGHT = THIGH + SHIN + TORSO + 1 + HEAD * 2 + 1; // ≈ 19 cells, a little under door height

// Angles in radians from straight down; positive = toward the way the figure faces.
// t = thigh, k = knee bend, s = shoulder, e = elbow bend, hx/hy = head offset, rot = whole-body tilt.
const BASE = { lean: 0, tL: 0.12, kL: 0, tR: -0.12, kR: 0, sL: 0.15, eL: 0.15, sR: -0.15, eR: 0.15, hx: 0, hy: 0, rot: 0 };
export const newPose = () => ({ ...BASE });

export function blend(pose, target, k) {
  for (const key in BASE) pose[key] += ((target[key] ?? BASE[key]) - pose[key]) * k;
}

const { sin, cos, max, PI } = Math;
const pos = (v) => max(0, v);
const SIT = { lean: -0.05, tL: PI / 2, kL: PI / 2, tR: PI / 2 - 0.12, kR: PI / 2 - 0.12, sL: 0.5, eL: 0.8, sR: 0.45, eR: 0.9 };

// Each animation: (t seconds, ph walk phase) -> target pose.
export const ANIM = {
  stand: (t) => ({ lean: 0.02 * sin(t * 1.7), sL: 0.12 + 0.03 * sin(t * 1.7), sR: -0.12 - 0.03 * sin(t * 1.7) }),
  walk: (t, ph) => ({
    lean: 0.1,
    tL: 0.5 * sin(ph), kL: 0.1 + 0.9 * pos(cos(ph)),
    tR: -0.5 * sin(ph), kR: 0.1 + 0.9 * pos(-cos(ph)),
    sL: -0.45 * sin(ph), eL: 0.3 + 0.4 * pos(-sin(ph)),
    sR: 0.45 * sin(ph), eR: 0.3 + 0.4 * pos(sin(ph)),
  }),
  stairs: (t, ph) => ({ ...ANIM.walk(t, ph), lean: 0.25, kL: 0.3 + 1.2 * pos(cos(ph)), kR: 0.3 + 1.2 * pos(-cos(ph)) }),
  wait: (t) => ({ sL: 0.9, eL: 2.1, sR: 0.8, eR: 2.1, kR: 0.35 * pos(sin(t * 7)), tR: -0.12 + 0.15 * pos(sin(t * 7)) }), // arms crossed, tapping a foot

  // Little idle fidgets, mixed in at random while standing around.
  stretch: (t) => ({ lean: -0.08, sL: PI - 0.3, eL: 0.1, sR: PI + 0.3, eR: 0.1, hy: -0.5 }),
  scratch: (t) => ({ sR: 2.5, eR: 2.3 + 0.25 * sin(t * 14), hx: 0.5 }),
  look: (t) => ({ hx: 1.2 * sin(t * 1.3) }),
  watch: (t) => ({ sL: 1.25, eL: 1.7, hy: 1, hx: 0.6 }),

  sit: () => SIT,
  type: (t) => ({ ...SIT, lean: 0.12, sL: 1.15 + 0.08 * sin(t * 15), eL: 0.45, sR: 1.15 + 0.08 * sin(t * 15 + 2), eR: 0.45, hy: 0.3 }),
  eat: (t) => { const k = (sin(t * 2.2) + 1) / 2; return { ...SIT, lean: 0.1, sL: 1.0, eL: 0.6, sR: 0.8 + 1.3 * k, eR: 0.6 + 1.9 * k }; },
  tv: (t) => ({ ...SIT, lean: -0.22, sL: 0.35, eL: 1.1, sR: 0.3, eR: 1.2, hx: 0.3 * sin(t * 0.4) }),
  toilet: (t) => ({ ...SIT, lean: 0.3, sL: 0.9, eL: 1.7, sR: 0.95, eR: 1.6, hy: 0.6 }),
  bath: (t) => ({ ...SIT, tL: 1.45, kL: 0.4, tR: 1.35, kR: 0.5, lean: -0.35, sL: 2.6 + 0.2 * sin(t * 3), eL: 1.5, sR: 0.3, eR: 0.3 }),
  talkSit: (t) => ({ ...SIT, sR: 0.9 + 0.35 * sin(t * 3), eR: 1.0 + 0.4 * sin(t * 3.7), hx: 0.4 * sin(t * 2) }),

  cook: (t) => ({ lean: 0.08, sL: 1.0, eL: 0.5, sR: 1.0 + 0.25 * sin(t * 4), eR: 0.6 + 0.3 * cos(t * 4) }),
  dishes: (t) => ({ lean: 0.18, sL: 0.95 + 0.12 * sin(t * 9), eL: 0.4, sR: 0.95 + 0.12 * sin(t * 9 + 1.5), eR: 0.4, hy: 0.5 }),
  fridge: (t) => ({ lean: 0.1, sL: 1.4, eL: 0.2, sR: 0.6, eR: 0.8, hy: 0.4 }),
  wash: (t) => ({ lean: 0.2, sL: 0.85 + 0.1 * sin(t * 10), eL: 0.5, sR: 0.85 + 0.1 * sin(t * 10 + 2), eR: 0.5, hy: 0.6 }),
  shower: (t) => ({ sL: PI - 0.6 + 0.25 * sin(t * 6), eL: 1.5, sR: PI - 0.7 + 0.25 * sin(t * 6 + 1.3), eR: 1.4, hy: -0.4 }),
  coffee: (t) => { const k = (sin(t * 0.9) + 1) / 2; return { sR: 0.6 + 1.5 * k, eR: 0.8 + 1.6 * k, sL: 0.2, eL: 0.3, hx: 0.3 }; },
  browse: (t) => (sin(t * 1.2) > 0
    ? { sR: 2.3, eR: 0.2, hy: -0.6, sL: 0.2 }
    : { lean: 0.55, tL: 0.35, kL: 0.7, tR: 0.3, kR: 0.7, sR: 0.8, eR: 0.1, sL: 0.5, eL: 0.2, hy: 0.4 }),
  pay: (t) => ({ sR: 1.35 + 0.1 * sin(t * 3), eR: 0.15, sL: 0.2, eL: 0.4 }),

  climb: (t, ph) => ({
    tL: 0.9 + 0.5 * sin(ph), kL: 1.7, tR: 0.9 - 0.5 * sin(ph), kR: 1.7,
    sL: PI - 0.25 + 0.35 * sin(ph + PI), eL: 0.4, sR: PI - 0.25 + 0.35 * sin(ph), eR: 0.4,
  }),
  edge: (t) => ({ ...SIT, kL: PI / 2 + 0.35 * sin(t * 2.5), kR: PI / 2 - 0.12 + 0.35 * sin(t * 2.5 + 1.6), sL: -0.4, eL: 0.2, sR: -0.3, eR: 0.2, lean: 0.05 }), // sitting on a ledge, legs swinging
  fall: (t) => ({
    lean: -0.1, tL: 0.5 + 0.4 * sin(t * 15), kL: 1.0, tR: 0.2 + 0.4 * sin(t * 15 + 2), kR: 1.2,
    sL: 2.6 + 0.5 * sin(t * 17), eL: 0.6, sR: 2.2 + 0.5 * sin(t * 17 + 1), eR: 0.6,
  }),
  land: () => ({ lean: 0.35, tL: 1.3, kL: 2.2, tR: 1.1, kR: 2.0, sL: 0.9, eL: 0.2, sR: 0.7, eR: 0.2 }),
  // moving in: lifting a box, kneeling to put furniture together
  lift: () => ({ lean: 0.9, tL: 0.6, kL: 1.1, tR: 0.4, kR: 1.0, sL: 0.3, eL: 0.2, sR: 0.2, eR: 0.2, hy: 0.6 }),
  assemble: (t) => ({ lean: 0.45, tL: 1.6, kL: 2.7, tR: 0.5, kR: 1.6, sL: 0.9, eL: 0.4, sR: 1.1 + 0.6 * Math.max(0, sin(t * 9)), eR: 1.2, hy: 0.4 }), // hammering
  floorEat: (t) => { const k = (sin(t * 2.2) + 1) / 2; return { lean: 0.1, tL: 1.5, kL: 2.8, tR: 1.4, kR: 2.7, sL: 0.9, eL: 0.6, sR: 0.8 + 1.3 * k, eR: 0.6 + 1.9 * k }; },
  phone: (t) => ({ lean: 0.15, tL: 1.5, kL: 2.8, tR: 1.4, kR: 2.7, sL: 1.2, eL: 1.6, sR: 1.1, eR: 1.7 + 0.05 * sin(t * 6), hy: 0.6 }),
  // hobbies
  run: (t) => ({ ...ANIM.walk(t, t * 15), lean: 0.2 }),
  bench: (t) => { const k = (sin(t * 2) + 1) / 2; return { rot: -PI / 2, tL: 1.2, kL: 1.5, tR: 1.1, kR: 1.4, sL: PI / 2, eL: 1.4 * k, sR: PI / 2, eR: 1.4 * k }; },
  water: (t) => ({ lean: 0.5, tL: 0.6, kL: 1.0, tR: 0.3, kR: 0.8, sR: 1.2 + 0.15 * sin(t * 3), eR: 0.3, sL: 0.6, eL: 0.6, hy: 0.4 }),
  sleep: (t) => ({ rot: -PI / 2, tL: 0.25, kL: 0.5, tR: 0.15, kR: 0.4, sL: 0.25, eL: 0.4, sR: 0.1, eR: 0.3, lean: 0.03 * sin(t * 1.1) }),
};

function ring(ctx, cx, cy, r) {
  for (let x = r, y = 0, err = 1 - r; x >= y; ) { // midpoint circle
    for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) ctx.fillRect(cx + a, cy + b, 1, 1);
    y++;
    if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
  }
}

/**
 * Draws a figure with its feet at (x, y), facing dir (1 = right, -1 = left).
 * hip: optional fixed hip position (sitting, lying, climbing); otherwise the lower foot touches y.
 * Returns the head's position.
 */
export function drawStickman(ctx, x, y, dir, pose, hip, color = '#1e1e22') {
  const leg = (t, k) => { const kx = sin(t) * THIGH, ky = cos(t) * THIGH; return [kx, ky, kx + sin(t - k) * SHIN, ky + cos(t - k) * SHIN]; };
  const L = leg(pose.tL, pose.kL), R = leg(pose.tR, pose.kR);
  const l = pose.lean;
  const nx = sin(l) * TORSO, ny = -cos(l) * TORSO; // neck
  const sx = sin(l) * (TORSO - 1), sy = -cos(l) * (TORSO - 1); // shoulders
  const arm = (s, e) => { const ex = sx + sin(s) * UPPER, ey = sy + cos(s) * UPPER; return [ex, ey, ex + sin(s + e) * FORE, ey + cos(s + e) * FORE]; };
  const A = arm(pose.sL, pose.eL), B = arm(pose.sR, pose.eR);
  const head = [nx + sin(l) * (1 + HEAD) + pose.hx, ny - cos(l) * (1 + HEAD) + pose.hy];

  const cr = cos(pose.rot), sr = sin(pose.rot);
  const turn = (px, py) => [px * cr - py * sr, px * sr + py * cr];
  const hx = hip ? hip.x : x;
  const hy = hip ? hip.y : y - max(turn(L[2], L[3])[1], turn(R[2], R[3])[1]);
  const at = (px, py) => { const [a, b] = turn(px, py); return [hx + dir * a, hy + b]; };

  ctx.fillStyle = color;
  const bones = [[0, 0, L[0], L[1]], [L[0], L[1], L[2], L[3]], [0, 0, R[0], R[1]], [R[0], R[1], R[2], R[3]], [0, 0, nx, ny],
    [sx, sy, A[0], A[1]], [A[0], A[1], A[2], A[3]], [sx, sy, B[0], B[1]], [B[0], B[1], B[2], B[3]]];
  for (const [a, b, c, d] of bones) {
    const [x0, y0] = at(a, b), [x1, y1] = at(c, d);
    for (const [cx, cy] of lineCells(x0, y0, x1, y1)) ctx.fillRect(cx, cy, 1, 1);
  }
  const [cx, cy] = at(head[0], head[1]);
  ring(ctx, Math.round(cx), Math.round(cy), HEAD);
  return { x: cx, y: cy };
}
