// Moves something along a queue of points (grid coordinates).
// On roads it keeps to the right of the direction of travel: a lane for cars,
// the sidewalk for people. The sideways offset eases in and out so turns look smooth.
export class Mover {
  constructor(x, y, { speed, lane, onRoad = false, onNeed = null }) {
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.lane = lane;
    this.onNeed = onNeed;
    this.queue = [];
    this.ox = 0;
    this.oy = 0;
    this.dir = [1, 0];
    this.dist = 0;
    this.done = false;
    this.lastRoad = onRoad;
  }

  push(x, y, road) {
    this.queue.push({ x, y, road });
  }

  get px() {
    return this.x + this.ox;
  }

  get py() {
    return this.y + this.oy;
  }

  step(dt) {
    if (this.done) return;
    let move = this.speed * dt;
    this.dist += move;
    let guard = 0;
    while (move > 1e-6 && guard++ < 16) {
      if (!this.queue.length) {
        if (!this.onNeed || !this.onNeed(this)) {
          this.done = true;
          break;
        }
        if (!this.queue.length) {
          this.done = true;
          break;
        }
      }
      const t = this.queue[0];
      const dx = t.x - this.x;
      const dy = t.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) this.dir = [dx / d, dy / d];
      if (d <= move) {
        this.x = t.x;
        this.y = t.y;
        move -= d;
        this.lastRoad = t.road;
        this.queue.shift();
      } else {
        this.x += (dx / d) * move;
        this.y += (dy / d) * move;
        move = 0;
      }
    }
    const next = this.queue[0];
    const off = this.lastRoad && next && next.road ? this.lane : 0;
    const tx = -this.dir[1] * off;
    const ty = this.dir[0] * off;
    const k = 1 - Math.exp(-dt * 7);
    this.ox += (tx - this.ox) * k;
    this.oy += (ty - this.oy) * k;
  }
}
