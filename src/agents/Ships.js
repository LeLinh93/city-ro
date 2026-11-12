import { DEPTH, GROUND } from '../constants.js';
import { toWorld } from '../iso.js';
import { pick, rand } from '../rng.js';
import { vehicleSprite, faceVehicle, hasVehicle } from './vehicleArt.js';

const SPEED = 0.8; // squares per second
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const OPEN = 2; // a square is open sea when every square within this distance is water
const AXIS = { ne: [1, 0], sw: [1, 0], nw: [0, 1], se: [0, 1] };

// Each dock has one ship. It waits at the dock, sails out to a far spot on open water, waits, and sails back.
// Ships keep to open water where they can and turn as little as possible (they only have 4 views).
export class Ships {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.docks = new Map();
    // foam left behind a moving ship: it stays where it was dropped, spreads out and fades
    this.foam = scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 2400, max: 3400 }, speed: { min: 0, max: 5 },
      scaleX: { start: 0.9, end: 3.4 }, scaleY: { start: 0.45, end: 1.7 },
      alpha: { start: 0.8, end: 0 }, tint: 0xffffff, emitting: false,
    }).setDepth(DEPTH.SHADOW + 1);
    // a ruined building counts as gone until it is repaired
    world.onBuilding((b) => {
      if (b.def.dock && hasVehicle(scene, b.def.dock.ship)) this.docks.set(b.id, { b, ship: null, next: scene.time.now + 1500 });
    }, (b) => {
      const d = this.docks.get(b.id);
      if (d?.ship) this.remove(d.ship);
      this.docks.delete(b.id);
    });
  }

  update(time, dt) {
    for (const d of this.docks.values()) {
      if (!d.ship) {
        if (time > d.next) this.spawn(d, time);
        continue;
      }
      this.step(d, d.ship, time, dt);
    }
  }

  // Where the ship parks: alongside the longest stretch of water next to the dock.
  berth(b) {
    const sides = {};
    for (const s of this.world.waterSides(b.x, b.y, b.w, b.d)) (sides[s.side] ||= []).push(s);
    let best = null;
    for (const [side, list] of Object.entries(sides)) {
      const along = (s) => (side === 'ne' || side === 'sw' ? s.i : s.j);
      list.sort((a, c) => along(a) - along(c));
      let run = [list[0]];
      for (let k = 1; k <= list.length; k++) {
        if (k < list.length && along(list[k]) === along(list[k - 1]) + 1) {
          run.push(list[k]);
          continue;
        }
        if (!best || run.length > best.run.length) best = { side, run };
        run = [list[k]];
      }
    }
    if (!best) return null;
    const { side, run } = best;
    const mid = (run.reduce((s, q) => s + (side === 'ne' || side === 'sw' ? q.i : q.j), 0) / run.length) + 0.5;
    const out = 0.9;
    const pt = {
      ne: [mid, b.y - out], sw: [mid, b.y + b.d + out], nw: [b.x - out, mid], se: [b.x + b.w + out, mid],
    }[side];
    return { x: pt[0], y: pt[1], dir: AXIS[side], square: [Math.floor(pt[0]), Math.floor(pt[1])] };
  }

  spawn(d, time) {
    const berth = this.berth(d.b);
    if (!berth) {
      d.next = time + 5000;
      return;
    }
    const v = vehicleSprite(this.scene, d.b.def.dock.ship, null);
    v.im.setAlpha(0);
    this.scene.tweens.add({ targets: v.im, alpha: 1, duration: 1200 });
    d.ship = { v, x: berth.x, y: berth.y, dir: berth.dir, berth, state: 'docked', until: time + rand(6000, 12000), legs: [] };
    this.render(d.ship);
  }

  step(d, s, time, dt) {
    if (s.state === 'docked' || s.state === 'away') {
      if (time > s.until) {
        if (s.state === 'docked') {
          s.berth = this.berth(d.b) || s.berth;
          const route = this.route(s.berth);
          if (!route) {
            s.until = time + 15000; // no open water to go to right now
          } else {
            s.back = [...route].reverse().concat([[s.berth.x, s.berth.y]]);
            s.legs = route;
            s.state = 'out';
          }
        } else {
          s.legs = s.back;
          s.state = 'back';
        }
      }
    } else {
      let move = SPEED * dt;
      while (move > 0 && s.legs.length) {
        const [tx, ty] = s.legs[0];
        const dx = tx - s.x;
        const dy = ty - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-6) s.dir = [dx / dist, dy / dist];
        if (dist <= move) {
          s.x = tx;
          s.y = ty;
          move -= dist;
          s.legs.shift();
        } else {
          s.x += (dx / dist) * move;
          s.y += (dy / dist) * move;
          move = 0;
        }
      }
      this.wake(s, time);
      if (!s.legs.length) {
        if (s.state === 'out') {
          s.state = 'away';
          s.until = time + rand(3000, 7000);
        } else {
          s.state = 'docked';
          s.dir = s.berth.dir;
          s.until = time + rand(15000, 30000);
        }
      }
    }
    this.render(s);
  }

  // Foam at the back of the ship, a little to each side, so the trail widens behind it.
  wake(s, time) {
    if (time < (s.nextFoam || 0)) return;
    s.nextFoam = time + 70;
    const half = Math.max(0.5, (s.v.im.frame.width / 64 - 1) / 2); // half the ship's length, in squares
    const bx = s.x - s.dir[0] * half;
    const by = s.y - s.dir[1] * half;
    for (const side of [-0.22, 0.22]) {
      const p = toWorld(bx - s.dir[1] * side, by + s.dir[0] * side);
      this.foam.emitParticleAt(p.x, p.y, 1);
    }
  }

  render(s) {
    const p = toWorld(s.x, s.y);
    faceVehicle(s.v, s.dir[0], s.dir[1]);
    s.v.im.setPosition(Math.round(p.x), Math.round(p.y)).setDepth(s.x + s.y + 0.3);
  }

  // A trip from the berth to a far spot on open water, as a list of corner points.
  route(berth) {
    const w = this.world;
    const N = w.size;
    const water = (i, j) => w.inBounds(i, j) && w.ground[w.idx(i, j)] === GROUND.WATER;
    if (!water(...berth.square)) return null;
    const open = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let ok = true;
        for (let b = j - OPEN; b <= j + OPEN && ok; b++) for (let a = i - OPEN; a <= i + OPEN; a++) if (!water(a, b)) { ok = false; break; }
        open[j * N + i] = ok ? 1 : 0;
      }
    }

    // Cheapest way to every water square: steps cost more near the shore, turns cost extra.
    const cost = new Float32Array(N * N * 4).fill(Infinity);
    const came = new Int32Array(N * N * 4).fill(-1);
    const heap = [];
    const push = (s, c) => {
      heap.push([c, s]);
      let n = heap.length - 1;
      while (n > 0) {
        const p = (n - 1) >> 1;
        if (heap[p][0] <= heap[n][0]) break;
        [heap[p], heap[n]] = [heap[n], heap[p]];
        n = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let n = 0;
        for (;;) {
          const l = n * 2 + 1;
          const r = l + 1;
          let m = n;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === n) break;
          [heap[m], heap[n]] = [heap[n], heap[m]];
          n = m;
        }
      }
      return top;
    };
    const k0 = berth.square[1] * N + berth.square[0];
    for (let dir = 0; dir < 4; dir++) {
      cost[k0 * 4 + dir] = 0;
      push(k0 * 4 + dir, 0);
    }
    const best = new Float32Array(N * N).fill(Infinity);
    while (heap.length) {
      const [c, s] = pop();
      if (c > cost[s]) continue;
      const k = s >> 2;
      const dir = s & 3;
      if (c < best[k]) best[k] = c;
      const i = k % N;
      const j = (k / N) | 0;
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((dir + 2) & 3)) continue;
        const a = i + DIRS[nd][0];
        const b = j + DIRS[nd][1];
        if (!water(a, b)) continue;
        const nk = b * N + a;
        const nc = c + 1 + (open[nk] ? 0 : 4) + (nd === dir ? 0 : 3);
        const ns = nk * 4 + nd;
        if (nc < cost[ns]) {
          cost[ns] = nc;
          came[ns] = s;
          push(ns, nc);
        }
      }
    }

    // Pick somewhere far out on open water (or the farthest water there is, for a small lake).
    const far = [];
    let farthest = -1;
    for (let k = 0; k < N * N; k++) {
      if (!Number.isFinite(best[k]) || k === k0) continue;
      if (open[k] && best[k] >= 25 && best[k] <= 80) far.push(k);
      if (farthest < 0 || (open[k] && !open[farthest]) || (open[k] === open[farthest] && best[k] > best[farthest])) farthest = k;
    }
    const goal = far.length ? pick(far) : farthest;
    if (goal < 0 || best[goal] < 4) return null;
    let s = -1;
    for (let dir = 0; dir < 4; dir++) if (s < 0 || cost[goal * 4 + dir] < cost[s]) s = goal * 4 + dir;

    const squares = [];
    for (; s >= 0; s = came[s]) squares.push(s >> 2);
    squares.reverse();
    // keep only the corners
    const pts = [];
    for (let n = 0; n < squares.length; n++) {
      const k = squares[n];
      const prev = squares[n - 1];
      const nxt = squares[n + 1];
      if (n > 0 && nxt !== undefined && nxt - k === k - prev) continue;
      pts.push([(k % N) + 0.5, ((k / N) | 0) + 0.5]);
    }
    return pts;
  }

  remove(s) {
    this.scene.tweens.add({ targets: s.v.im, alpha: 0, duration: 400, onComplete: () => s.v.im.destroy() });
  }
}
