// The stick figure: a little jointed skeleton (hips, knees, shoulders, elbows, head)
// drawn pixel by pixel. Animations are target poses; the figure blends toward them smoothly.

const THIGH0 = 3, SHIN0 = 4, TORSO0 = 6, UPPER0 = 3, FORE0 = 3, HEAD = 2;
export const HEIGHT = THIGH0 + SHIN0 + TORSO0 + 1 + HEAD * 2 + 1; // ≈ 19 cells, a little under door height

// Angles in radians from straight down; positive = toward the way the figure faces.
// t = thigh, k = knee bend, s = shoulder, e = elbow bend, hx/hy = head offset, rot = whole-body tilt.
const BASE = { lean: 0, tL: 0.12, kL: 0, tR: -0.12, kR: 0, sL: 0.15, eL: 0.15, sR: -0.15, eR: 0.15, hx: 0, hy: 0, rot: 0, up: 0 }; // up: whole body lifted (a jog's bounce)
export const newPose = () => ({ ...BASE });

export function blend(pose, target, k) {
  for (const key in BASE) pose[key] += ((target[key] ?? BASE[key]) - pose[key]) * k;
}

const { sin, cos, max, PI } = Math;
const pos = (v) => max(0, v);
const KNEEL = { lean: 0.35, tL: 1.6, kL: 2.7, tR: 0.5, kR: 1.6 }; // one knee down
const SIT = { lean: -0.05, tL: PI / 2, kL: PI / 2, tR: PI / 2 - 0.12, kR: PI / 2 - 0.12, sL: 0.5, eL: 0.8, sR: 0.45, eR: 0.9 };

// Each animation: (t seconds, ph walk phase) -> target pose.
export const ANIM = {
  stand: (t) => ({ lean: 0.02 * sin(t * 1.7), sL: 0.12 + 0.03 * sin(t * 1.7), sR: -0.12 - 0.03 * sin(t * 1.7) }),
  // Walking: each arm swings with the opposite leg, close to the body, the elbow easing a little as
  // it comes forward; the knee bends as the leg swings through.
  walk: (t, ph) => ({
    lean: 0.07,
    tL: 0.45 * sin(ph), kL: 0.08 + 0.8 * pos(cos(ph)),
    tR: -0.45 * sin(ph), kR: 0.08 + 0.8 * pos(-cos(ph)),
    sL: -0.32 * sin(ph), eL: 0.15 + 0.3 * pos(-sin(ph)),
    sR: 0.32 * sin(ph), eR: 0.15 + 0.3 * pos(sin(ph)),
  }),
  // Gaits: everyone walks their own way. A stroll is short steps and loose arms, a brisk walk leans in
  // and pumps bent arms, a jog bounces off the ground with the elbows held at a right angle, a sprint
  // drives the knees and arms hard. Kids bob along.
  stroll: (t, ph) => ({
    lean: 0.03, tL: 0.28 * sin(ph), kL: 0.06 + 0.45 * pos(cos(ph)), tR: -0.28 * sin(ph), kR: 0.06 + 0.45 * pos(-cos(ph)),
    sL: -0.15 * sin(ph), eL: 0.15, sR: 0.15 * sin(ph), eR: 0.15, hy: 0.1,
  }),
  brisk: (t, ph) => ({
    lean: 0.12, tL: 0.55 * sin(ph), kL: 0.1 + 0.9 * pos(cos(ph)), tR: -0.55 * sin(ph), kR: 0.1 + 0.9 * pos(-cos(ph)),
    sL: -0.55 * sin(ph), eL: 1.15 + 0.25 * pos(-sin(ph)), sR: 0.55 * sin(ph), eR: 1.15 + 0.25 * pos(sin(ph)),
  }),
  jog: (t, ph) => ({
    lean: 0.18, tL: 0.12 + 0.6 * sin(ph), kL: 0.35 + 1.3 * pos(cos(ph)), tR: 0.12 - 0.6 * sin(ph), kR: 0.35 + 1.3 * pos(-cos(ph)),
    sL: -0.6 * sin(ph), eL: 1.45, sR: 0.6 * sin(ph), eR: 1.45, up: 1.0 * Math.abs(sin(ph)),
  }),
  sprint: (t, ph) => ({
    lean: 0.3, tL: 0.2 + 0.85 * sin(ph), kL: 0.4 + 1.9 * pos(cos(ph)), tR: 0.2 - 0.85 * sin(ph), kR: 0.4 + 1.9 * pos(-cos(ph)),
    sL: -0.95 * sin(ph), eL: 1.5, sR: 0.95 * sin(ph), eR: 1.5, up: 1.3 * Math.abs(sin(ph)),
  }),
  kidwalk: (t, ph) => ({ ...ANIM.walk(t, ph), lean: 0.04, sL: -0.45 * sin(ph), eL: 0.2, sR: 0.45 * sin(ph), eR: 0.2, up: 0.5 * Math.abs(sin(ph)) }),
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
  // Hands on the house: a light switch at shoulder height, a door handle at hip height.
  flip: () => ({ lean: 0.05, sR: 1.75, eR: 0.15, sL: 0.2, eL: 0.3, hx: 0.3 }),
  openDoor: () => ({ lean: 0.12, sR: 1.35, eR: 0.25, sL: 0.15, eL: 0.3 }),
  pull: (t) => ({ lean: 0.05, sR: 2.3 + 0.35 * Math.sin(t * 5), eR: 0.4, sL: 2.1 - 0.35 * Math.sin(t * 5), eL: 0.5, hy: -0.3 }), // reaching up, sweeping curtains across
  // Moving in. Boxes: squat down to one, stand back up holding it.
  crouch: () => ({ lean: 0.7, tL: 1.05, kL: 2.0, tR: 0.85, kR: 1.8, sL: 0.55, eL: 0.35, sR: 0.45, eR: 0.35, hy: 0.5 }),
  rise: () => ({ lean: 0.3, tL: 0.45, kL: 0.8, tR: 0.3, kR: 0.7, sL: 1.2, eL: 0.6, sR: 1.2, eR: 0.6, hy: 0.2 }),
  // Putting a flat-pack together, stage by stage (kneeling on one knee for most of it).
  cutTape: (t) => ({ ...KNEEL, lean: 0.55, sL: 0.8, eL: 0.8, sR: 0.95 + 0.35 * sin(t * 5), eR: 0.8, hy: 0.6 }),
  reach: (t) => ({ lean: 0.85, tL: 0.5, kL: 0.9, tR: 0.3, kR: 0.7, sL: 0.3 + 0.1 * sin(t * 3), eL: 0.2, sR: 0.25, eR: 0.1, hy: 0.7 }), // bent over, into the box
  place: (t) => ({ lean: 0.1, sL: 1.35, eL: 0.4, sR: 1.45, eR: 0.3 + 0.1 * sin(t * 3) }),             // holding a part out, putting it down
  read: (t) => ({ ...KNEEL, lean: 0.2, sL: 1.0, eL: 1.4, sR: 1.05, eR: 1.35, hy: 0.8, hx: 0.3 * sin(t * 0.7) }),
  screw: (t) => ({ ...KNEEL, lean: 0.5, sL: 0.9, eL: 0.5, sR: 1.0, eR: 0.8 + 0.25 * sin(t * 14), hy: 0.5 }), // twisting a screwdriver
  hammer: (t) => ({ ...KNEEL, lean: 0.45, sL: 0.9, eL: 0.4, sR: 1.1 + 0.6 * Math.max(0, sin(t * 9)), eR: 1.2, hy: 0.4 }),
  raise: (t) => ({ lean: -0.05, tL: 0.2, kL: 0.3, tR: -0.2, kR: 0.2, sL: 2.2, eL: 0.6 + 0.2 * sin(t * 3), sR: 2.3, eR: 0.5 + 0.2 * sin(t * 3) }), // standing the piece up
  fold: (t) => ({ lean: 0.75, tL: 0.6, kL: 1.1, tR: 0.4, kR: 0.9, sL: 0.6 + 0.3 * sin(t * 4), eL: 0.9, sR: 0.6 + 0.3 * sin(t * 4 + PI), eR: 0.9, hy: 0.6 }),
  // Your own furniture: pull the wrapping off, push it into place, step back and look.
  unwrap: (t) => ({ lean: 0.25, sL: 1.3 + 0.5 * sin(t * 3), eL: 0.3, sR: 1.5 - 0.5 * sin(t * 3), eR: 0.6 }),
  push: (t, ph) => ({ lean: 0.5, tL: 0.15 + 0.45 * sin(ph), kL: 0.3 + 0.6 * pos(cos(ph)), tR: 0.15 - 0.45 * sin(ph), kR: 0.3 + 0.6 * pos(-cos(ph)), sL: 1.4, eL: 0.25, sR: 1.45, eR: 0.2 }), // leaning in, stepping as it moves
  adjust: (t) => ({ lean: -0.05, sR: 2.4, eR: 2.2, sL: 0.9, eL: 1.6, hx: 0.5 * sin(t), hy: -0.2 }), // hand on chin, considering
  assemble: (t) => ANIM.hammer(t),
  floorEat: (t) => { const k = (sin(t * 2.2) + 1) / 2; return { lean: 0.1, tL: 1.5, kL: 2.8, tR: 1.4, kR: 2.7, sL: 0.9, eL: 0.6, sR: 0.8 + 1.3 * k, eR: 0.6 + 1.9 * k }; },
  phone: (t) => ({ lean: 0.15, tL: 1.5, kL: 2.8, tR: 1.4, kR: 2.7, sL: 1.2, eL: 1.6, sR: 1.1, eR: 1.7 + 0.05 * sin(t * 6), hy: 0.6 }),
  // hobbies
  run: (t) => ({ ...ANIM.walk(t, t * 15), lean: 0.2 }),
  bench: (t) => { const k = (sin(t * 2) + 1) / 2; return { rot: -PI / 2, tL: 1.2, kL: 1.5, tR: 1.1, kR: 1.4, sL: PI / 2, eL: 1.4 * k, sR: PI / 2, eR: 1.4 * k }; },
  water: (t) => ({ lean: 0.5, tL: 0.6, kL: 1.0, tR: 0.3, kR: 0.8, sR: 1.2 + 0.15 * sin(t * 3), eR: 0.3, sL: 0.6, eL: 0.6, hy: 0.4 }),
  // Work. Shop tills, kitchens, bars, classrooms, factory lines.
  scan: (t) => ({ lean: 0.1, sR: 1.3 + 0.35 * sin(t * 6), eR: 0.3, sL: 1.1, eL: 0.5, hy: 0.4 }),        // passing things over the scanner
  chop: (t) => ({ lean: 0.15, sR: 1.1 + 0.25 * sin(t * 13), eR: 0.6, sL: 1.0, eL: 0.6, hy: 0.6 }),
  shake: (t) => ({ sR: 2.2 + 0.35 * sin(t * 18), eR: 1.3, sL: 2.1 + 0.35 * sin(t * 18), eL: 1.4, hy: -0.2 }), // a cocktail shaker over the shoulder
  pour: (t) => ({ lean: 0.08, sR: 1.45, eR: 0.5 + 0.2 * sin(t * 2), sL: 1.2, eL: 0.6, hy: 0.4 }),
  write: (t) => ({ sL: 1.1, eL: 1.6, sR: 1.0, eR: 1.45 + 0.2 * sin(t * 11), hy: 0.6 }),                // jotting an order on a pad
  wipe: (t) => ({ lean: 0.35, sR: 1.2 + 0.35 * sin(t * 5), eR: 0.3, sL: 0.9, eL: 0.4, hy: 0.5 }),
  teach: (t) => ({ sR: 2.0 + 0.2 * sin(t * 1.5), eR: 0.2, sL: 0.6, eL: 0.9, hx: 0.6 * sin(t * 0.8) }), // pointing at the board
  learn: (t) => ({ ...SIT, lean: 0.25, sR: 1.1 + 0.1 * sin(t * 8), eR: 0.9, sL: 1.0, eL: 0.8, hy: 0.5 }),
  handUp: () => ({ ...SIT, sR: PI - 0.15, eR: 0.1, sL: 0.9, eL: 0.8 }),
  examine: (t) => ({ lean: 0.2, sR: 1.4 + 0.1 * sin(t * 2), eR: 0.3, sL: 0.9, eL: 1.2, hy: 0.5, hx: 0.3 * sin(t) }), // a stethoscope to the patient's chest
  operate: (t) => ({ lean: 0.12, sR: 1.2 + 0.4 * pos(sin(t * 3)), eR: 0.5, sL: 1.2 + 0.4 * pos(-sin(t * 3)), eL: 0.5 }), // pulling levers
  drink: (t) => { const k = pos(sin(t * 0.8)) ** 3; return { ...SIT, sL: 0.6, eL: 0.9, sR: 0.8 + 1.4 * k, eR: 0.9 + 1.5 * k, hy: -0.3 * k }; },
  cheers: (t) => ({ ...SIT, sR: 2.3, eR: 0.6, sL: 0.6, eL: 0.9 }),
  attend: (t) => ({ sL: 0.35, eL: 1.5, sR: 0.3, eR: 1.6, hx: 0.3 * sin(t * 0.6) }),                    // hands together in front, ready
  talk: (t) => ({ sR: 0.9 + 0.35 * sin(t * 3), eR: 1.0 + 0.4 * sin(t * 3.7), sL: 0.3, eL: 0.6, hx: 0.4 * sin(t * 2) }),
  nod: (t) => ({ sL: 0.3, eL: 1.5, sR: 0.3, eR: 1.6, hy: 0.5 * pos(sin(t * 6)) }),
  count: (t) => ({ lean: 0.15, sR: 1.15 + 0.12 * sin(t * 9), eR: 0.6, sL: 1.1, eL: 0.7, hy: 0.6 }),        // counting the till
  deskwork: (t) => ({ lean: 0.18, sR: 1.05 + 0.06 * sin(t * 13), eR: 0.6, sL: 1.05 + 0.06 * sin(t * 13 + 2), eL: 0.6, hy: 0.5 }),
  monitor: (t) => ({ lean: 0.1, sR: 2.4, eR: 2.3, sL: 1.0, eL: 1.2, hy: 0.2, hx: 0.4 * sin(t * 0.4) }), // hand on chin, watching the screens
  polish: (t) => ({ lean: 0.1, sL: 1.25, eL: 0.9, sR: 1.3 + 0.2 * sin(t * 8), eR: 1.0 + 0.3 * cos(t * 8), hy: 0.4 }), // rubbing a glass with a cloth
  sweep: (t) => ({ lean: 0.2, sR: 0.9 + 0.45 * sin(t * 4), eR: 0.4, sL: 0.7 + 0.45 * sin(t * 4), eL: 0.5, tL: 0.25, tR: -0.2 }),
  reachHigh: (t) => ({ lean: -0.05, sR: PI - 0.5 + 0.1 * sin(t * 4), eR: 0.3, sL: 0.4, eL: 0.4, hy: -0.4 }),
  toss: (t) => ({ lean: 0.1, sR: 1.2 + 0.5 * pos(sin(t * 5)), eR: 0.6, sL: 1.0, eL: 0.5 }),            // tossing the pan
  taste: (t) => ({ sR: 2.0 + 0.3 * pos(sin(t * 2)), eR: 2.3, sL: 0.9, eL: 0.6, hy: -0.2 }),
  writeBoard: (t) => ({ sR: PI - 0.7 + 0.15 * sin(t * 6), eR: 0.4 + 0.2 * cos(t * 6), sL: 0.2, eL: 0.3, hy: -0.3 }),
  helpKid: (t) => ({ lean: 0.55, tL: 0.25, kL: 0.4, sR: 1.1 + 0.15 * sin(t * 2), eR: 0.4, sL: 0.6, eL: 0.6, hy: 0.6 }),
  readAloud: (t) => ({ sL: 1.1, eL: 1.3, sR: 1.05, eR: 1.4, hy: 0.6 + 0.2 * sin(t * 0.7), hx: 0.3 * sin(t * 1.3) }),
  mark: (t) => ({ ...SIT, lean: 0.25, sR: 1.05 + 0.08 * sin(t * 9), eR: 0.8, sL: 1.0, eL: 0.9, hy: 0.7 }),
  screwStand: (t) => ({ lean: 0.2, sL: 1.1, eL: 0.6, sR: 1.2, eR: 0.7 + 0.25 * sin(t * 14), hy: 0.5 }),
  hammerStand: (t) => ({ lean: 0.2, sL: 1.1, eL: 0.6, sR: 1.3 + 0.6 * pos(sin(t * 9)), eR: 1.2, hy: 0.4 }),
  // Trouble. Fights, arrests, alarms, protests.
  punch: (t) => { const j = sin(t * 9) > 0.4; return { lean: 0.2, tL: 0.35, kL: 0.3, tR: -0.35, kR: 0.2, sR: j ? 1.55 : 1.0, eR: j ? 0.05 : 2.0, sL: 1.1, eL: 1.9 }; },
  reel: (t) => ({ lean: -0.3 + 0.1 * sin(t * 7), tL: 0.3, tR: -0.4, sL: 1.6, eL: 0.4, sR: 0.9, eR: 1.8, hx: -0.8 }),
  handsup: () => ({ sL: PI - 0.15, eL: 0.05, sR: PI + 0.1, eR: 0.05, hy: -0.2 }),
  cuffed: (t, ph) => ({ ...ANIM.walk(t, ph), sL: -0.45, eL: 0.7, sR: -0.5, eR: 0.7, lean: 0.12, hy: 0.5 }),
  call: () => ({ sR: 2.55, eR: 2.75, sL: 0.5, eL: 1.1, hx: 0.2 }),                                      // phone to the ear
  spray: (t) => ({ lean: 0.22, tL: 0.4, kL: 0.4, tR: -0.35, kR: 0.2, sR: 1.45 + 0.08 * sin(t * 7), eR: 0.2, sL: 1.25, eL: 0.4 }),
  protest: (t) => ({ sR: PI - 0.25 + 0.25 * sin(t * 4), eR: 0.15, sL: PI - 0.35 + 0.25 * sin(t * 4), eL: 0.2, up: 0.8 * pos(sin(t * 4)), hy: -0.3 }),
  chant: (t) => ({ sR: sin(t * 5) > 0 ? PI - 0.2 : 1.6, eR: sin(t * 5) > 0 ? 0.3 : 1.9, sL: 0.3, eL: 0.4, hx: 0.3 * sin(t * 5) }),
  wave: (t) => ({ sR: PI - 0.4, eR: 0.5 + 0.5 * sin(t * 9), sL: 0.2, eL: 0.3 }),
  // Talking: laughing (shoulders shaking, head back), pointing, hands on hips, a yawn, a shrug, a facepalm.
  laugh: (t) => ({ lean: -0.12 + 0.06 * sin(t * 16), sL: 0.9, eL: 1.9, sR: 0.85, eR: 2.0, hy: -0.4 + 0.3 * sin(t * 16), up: 0.3 * pos(sin(t * 16)) }),
  laughSit: (t) => ({ ...SIT, lean: -0.15 + 0.08 * sin(t * 16), sL: 0.9, eL: 1.9, sR: 0.85, eR: 2.0, hy: -0.3 + 0.3 * sin(t * 16) }),
  callSit: () => ({ ...SIT, sR: 2.55, eR: 2.75, hx: 0.2 }),
  point: (t) => ({ lean: 0.12, sR: 1.5 + 0.15 * sin(t * 7), eR: 0.1, sL: 0.6, eL: 1.8, hx: 0.3 }),
  hips: (t) => ({ lean: -0.05, sL: 0.7, eL: 2.3, sR: 0.65, eR: 2.3, hx: 0.3 * sin(t * 1.5) }),
  yawn: (t) => { const k = pos(sin(t * 0.9)); return { sR: 0.3 + 2.0 * k, eR: 0.3 + 2.3 * k, sL: 0.2, eL: 0.3, hy: -0.5 * k }; },
  shrug: (t) => ({ sL: 0.7, eL: 1.7, sR: 0.7, eR: 1.7, hy: 0.4 * pos(sin(t * 3)), up: 0.2 * pos(sin(t * 3)) }),
  facepalm: () => ({ lean: 0.15, sR: 2.4, eR: 2.6, sL: 0.3, eL: 0.4, hy: 0.6 }),
  // Play and exercise.
  swing: (t) => ({ ...SIT, tL: PI / 2 + 0.55 * sin(t * 2.4), kL: 0.4 + 0.6 * pos(-sin(t * 2.4)), tR: PI / 2 + 0.45 * sin(t * 2.4), kR: 0.5 + 0.6 * pos(-sin(t * 2.4)), sL: PI - 0.3, eL: 0.2, sR: PI - 0.35, eR: 0.25, lean: -0.15 * sin(t * 2.4) }),
  slideDown: () => ({ ...SIT, tL: PI / 2 - 0.2, kL: 0.2, tR: PI / 2 - 0.3, kR: 0.2, lean: -0.35, sL: 2.4, eL: 0.2, sR: 2.5, eR: 0.2 }),
  dig: (t) => ({ ...KNEEL, lean: 0.6, sR: 0.9 + 0.4 * sin(t * 6), eR: 0.4, sL: 0.8, eL: 0.6, hy: 0.6 }),
  bike: (t) => ({ ...SIT, lean: 0.35, tL: PI / 2 - 0.2 + 0.45 * sin(t * 7), kL: PI / 2 + 0.5 * cos(t * 7), tR: PI / 2 - 0.2 - 0.45 * sin(t * 7), kR: PI / 2 - 0.5 * cos(t * 7), sL: 1.25, eL: 0.3, sR: 1.2, eR: 0.3 }),
  lift: (t) => { const k = pos(sin(t * 2)); return { sL: 0.4 + 2.2 * k, eL: 1.6 - 1.4 * k, sR: 0.4 + 2.2 * k, eR: 1.6 - 1.4 * k, kL: 0.3 * (1 - k), kR: 0.3 * (1 - k) }; }, // dumbbells overhead
  stretchFloor: (t) => ({ lean: 1.1 + 0.15 * sin(t * 1.2), tL: 0.1, kL: 0, tR: -0.1, kR: 0, sL: 0.1, eL: 0, sR: 0.05, eR: 0, hy: 0.4 }),
  jail: (t) => ({ ...SIT, lean: 0.3, sL: 0.6, eL: 1.4, sR: 0.6, eR: 1.5, hy: 0.9 + 0.1 * sin(t * 0.5) }), // head down on the cell bench
  sleep: (t) => ({ rot: -PI / 2, tL: 0.25, kL: 0.5, tR: 0.15, kR: 0.4, sL: 0.25, eL: 0.4, sR: 0.1, eR: 0.3, lean: 0.03 * sin(t * 1.1) }),
};

// A one-cell line (the same cells as lineCells in draw.js, without building a list of them).
function plot(ctx, x0, y0, x1, y1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  for (let err = dx + dy; ;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
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
export function drawStickman(ctx, x, y, dir, pose, hip, color = '#1e1e22', size = 1) {
  // size: 1 for grown-ups; kids are smaller (about 15 cells), with the same size head.
  const THIGH = THIGH0 * size, SHIN = SHIN0 * size, TORSO = TORSO0 * size, UPPER = UPPER0 * size, FORE = FORE0 * size;
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
  const hy = (hip ? hip.y : y - max(turn(L[2], L[3])[1], turn(R[2], R[3])[1])) - (pose.up || 0);
  const at = (px, py) => { const [a, b] = turn(px, py); return [hx + dir * a, hy + b]; };

  // The far arm and leg (the ones on the other side of the body) are drawn first and paler, so you
  // can see which limb is which as they swing past each other.
  const far = [[0, 0, R[0], R[1]], [R[0], R[1], R[2], R[3]], [sx, sy, B[0], B[1]], [B[0], B[1], B[2], B[3]]];
  const near = [[0, 0, L[0], L[1]], [L[0], L[1], L[2], L[3]], [0, 0, nx, ny], [sx, sy, A[0], A[1]], [A[0], A[1], A[2], A[3]]];
  ctx.fillStyle = color;
  const alpha = ctx.globalAlpha;
  for (const [list, k] of [[far, 0.45], [near, 1]]) {
    ctx.globalAlpha = alpha * k;
    for (const [a, b, c, d] of list) {
      const [x0, y0] = at(a, b), [x1, y1] = at(c, d);
      plot(ctx, x0, y0, x1, y1);
    }
  }
  ctx.globalAlpha = alpha;
  const [cx, cy] = at(head[0], head[1]);
  ring(ctx, Math.round(cx), Math.round(cy), HEAD);
  return { x: cx, y: cy, hands: [[...at(A[0], A[1]), ...at(A[2], A[3])], [...at(B[0], B[1]), ...at(B[2], B[3])]] }; // [elbow x, y, hand x, y] per arm
}
