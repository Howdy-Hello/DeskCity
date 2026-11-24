// Furniture deliveries: a truck drives in from the edge of the screen, parks by the building, and
// the driver carries each flat-pack box to the front door (cottages, houses) or the lobby's parcel
// shelf (apartments, condos). Then the truck drives off.
import { ANIM, newPose, blend, drawStickman } from './stickman.js';
import { FLATPACK } from './furniture.js';
import { drawBox } from './buildings.js';

const DRIVE = 45, WALK = 16, LEN = 30; // cells per second; truck length

export class Truck {
  constructor(order, W, G) {
    const b = order.b;
    this.order = order; this.G = G;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.x = this.dir > 0 ? -LEN : W + LEN;           // truck centre
    this.park = b.doorX() - this.dir * (LEN / 2 + 6);  // stops just before the door
    this.state = 'drive';
    this.queue = [...order.items];                     // items still in the back
    this.driver = { x: 0, y: G, dir: this.dir, pose: newPose(), phase: 0, anim: 'stand', box: null, target: 0 };
    this.done = false;
  }
  rear() { return this.x - this.dir * (LEN / 2 - 1); }

  update(dt, W) {
    const d = this.driver, b = this.order.b;
    if (this.state === 'drive' || this.state === 'leave') {
      const goal = this.state === 'drive' ? this.park : this.dir > 0 ? W + LEN * 2 : -LEN * 2;
      const dx = goal - this.x;
      this.x += Math.sign(dx) * Math.min(Math.abs(dx), DRIVE * dt);
      if (Math.abs(dx) < 0.5) {
        if (this.state === 'leave') { this.done = true; return; }
        this.state = 'unload'; d.x = this.rear(); d.step = 'fetch';
      }
      return;
    }
    // unloading: take a box from the back, carry it to the drop spot, come back
    if (d.step === 'fetch') {
      if (!this.queue.length) { this.state = 'leave'; return; }
      const item = this.queue.shift();
      d.box = { item, size: FLATPACK[b.L.items[item].kind][0] };
      const spot = b.boxSpot(b.boxes.length);
      d.target = b.x0 + spot.lx + 2; d.spot = spot; d.step = 'carry';
    }
    const goal = d.step === 'carry' ? d.target : this.rear(), dx = goal - d.x;
    d.dir = Math.sign(dx) || d.dir;
    d.x += Math.sign(dx) * Math.min(Math.abs(dx), WALK * dt); d.phase += dt * 9; d.anim = 'walk';
    if (Math.abs(dx) < 0.5) {
      if (d.step === 'carry') {
        b.boxes.push({ ...d.box, outside: d.spot.outside, f: 0, lx: d.spot.lx, claimed: null, carried: false });
        d.box = null; d.step = 'return';
      } else d.step = 'fetch';
    }
  }

  draw(ctx, t) {
    const x0 = Math.round(this.x - LEN / 2), y = this.G;
    const r = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(this.dir > 0 ? x0 + dx : x0 + LEN - dx - w, y + dy, w, h); };
    r(0, -15, 20, 13, '#f4f4f4'); r(0, -15, 20, 1, '#d0d0d0'); r(0, -8, 20, 2, '#e67e22'); // cargo box with a stripe
    r(7, -13, 5, 4, '#c8a06a'); r(9, -13, 1, 4, '#9b7a4a');                              // a parcel logo
    r(20, -11, 9, 9, '#3b82c4'); r(24, -10, 4, 3, '#bfe3f5'); r(29, -5, 1, 2, '#f1c40f');  // cab, window, headlight
    r(0, -3, 30, 1, '#555555');
    const spin = Math.floor(this.x / 2) % 2;
    for (const wx of [4, 22]) { r(wx, -2, 4, 3, '#1e1e22'); r(wx + 1 + spin, -1, 1, 1, '#9a9a9a'); }
    if (this.state === 'unload') { // the driver
      const d = this.driver;
      blend(d.pose, ANIM.walk(t, d.phase), 0.3);
      if (d.box) { d.pose.sL = d.pose.sR = 1.3; d.pose.eL = d.pose.eR = 0.7; }
      drawStickman(ctx, d.x, d.y, d.dir, d.pose, null, '#1e3a5f');
      if (d.box) drawBox(ctx, d.x + d.dir * 3 - 3, d.y - 8, d.box.size);
    }
  }
}
