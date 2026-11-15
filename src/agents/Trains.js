import { SIDES, SIDE_LIST } from '../constants.js';
import { toWorld } from '../iso.js';
import { pick, rand } from '../rng.js';
import { vehicleSprite, faceVehicle, hasVehicle } from './vehicleArt.js';

// Trains on the railways (World.rail). A train station (`train` in src/themes/city.js) touching the rails sends
// trains of its own kind (us, eu, jp) onto that network: an engine and two wagons. They drive along the rails,
// stop at every station they pass (people get off and on) and drive on. At the end of a line a train disappears
// and comes back at the start of the line; on a loop it just keeps going round.
// How many trains a network gets depends on how long it is (not on how many stations it has), and each kind of
// station on it gets its own kind of train if the network is long enough for them all.
// Where a railway crosses a road, barriers come down while a train goes past and the cars wait (see Traffic).
// Disasters take train cars like any other vehicle (see Disasters.near): the rest of that train stops, fades away
// after a moment and a new train comes back at the start of the line.

const TOP_SPEED = 2.2; // squares per second
const ACCEL = 0.8; // squares per second²
const BRAKE = 1.1;
const DWELL = [3500, 5500]; // ms at a station
const GAP = 0.06; // squares between two cars of a train
const LOOK = 7; // squares of track a train plans ahead
const STUCK_MS = 8000; // a train held up this long by another one disappears and comes back at the start
const FADE_MS = 600;
const PER_TRAIN = 30; // one more train for every this many squares of rail ...
const ROOM = 11; // ... but at least this many squares of rail for every train
const MIN_RAIL = 5; // shorter networks get no train
const CLOSE_AHEAD = 3.2; // squares before a train reaches a crossing that its barriers come down
const CLOSE_BEHIND = 0.4; // and squares after its last wagon has left that they go up again
const GATE_MS = 700; // ms for a barrier to come down or go up
const WRECK_MS = 2500; // ms what is left of a train hit by a disaster stands there before it fades away

const PORT = { ne: [0.5, 0], se: [1, 0.5], sw: [0.5, 1], nw: [0, 0.5] };
const OPP = { ne: 'sw', sw: 'ne', se: 'nw', nw: 'se' };

export class Trains {
  constructor(scene, world, { people }) {
    this.scene = scene;
    this.world = world;
    this.people = people;
    this.trains = [];
    this.stations = new Map(); // id -> building
    this.nets = []; // [{ id, tiles: [k], ends: [k], kinds: [...] }]
    this.netOf = new Int32Array(world.size * world.size).fill(-1);
    this.stops = new Map(); // rail square -> the station it touches
    this.closed = new Set(); // crossing squares whose barriers are down (or coming down)
    this.gates = new Map(); // crossing square -> { i, j, down, arms: [graphics] }
    this.dirty = true;
    this.manageTimer = 0;
    const touch = () => { this.dirty = true; };
    for (const ev of ['rail-added', 'rail-removed', 'road-added', 'road-removed']) world.on(ev, touch);
    world.onBuilding((b) => {
      if (!b.def.train) return;
      this.stations.set(b.id, b);
      this.dirty = true;
    }, (b) => {
      if (!this.stations.delete(b.id)) return;
      this.dirty = true;
    });
  }

  // ---------- the rail networks ----------

  rebuild() {
    this.dirty = false;
    const w = this.world;
    const N = w.size;
    this.netOf.fill(-1);
    this.nets = [];
    for (let k = 0; k < w.rail.length; k++) {
      if (!w.rail[k] || this.netOf[k] >= 0) continue;
      const net = { id: this.nets.length, tiles: [], ends: [], kinds: [] };
      const queue = [k];
      this.netOf[k] = net.id;
      for (let q = 0; q < queue.length; q++) {
        const c = queue[q];
        const i = c % N;
        const j = (c / N) | 0;
        net.tiles.push(c);
        let n = 0;
        for (const s of SIDE_LIST) {
          const d = SIDES[s];
          if (!w.isRail(i + d.dx, j + d.dy)) continue;
          n++;
          const nk = w.idx(i + d.dx, j + d.dy);
          if (this.netOf[nk] < 0) {
            this.netOf[nk] = net.id;
            queue.push(nk);
          }
        }
        if (n <= 1) net.ends.push(c);
      }
      net.ends.sort((a, b) => a - b); // the line starts at the same end every time
      this.nets.push(net);
    }
    // the rail squares touching each station, and the kinds of train each network gets
    this.stops.clear();
    for (const b of this.stations.values()) {
      for (let j = b.y - 1; j <= b.y + b.d; j++) {
        for (let i = b.x - 1; i <= b.x + b.w; i++) {
          const side = (i === b.x - 1 || i === b.x + b.w) !== (j === b.y - 1 || j === b.y + b.d); // not the corners
          if (!side || !w.isRail(i, j)) continue;
          const k = w.idx(i, j);
          if (!this.stops.has(k)) this.stops.set(k, b);
          const net = this.nets[this.netOf[k]];
          if (!net.kinds.includes(b.def.train)) net.kinds.push(b.def.train);
        }
      }
    }
    for (const net of this.nets) net.kinds = net.kinds.filter((kind) => hasVehicle(this.scene, `train_${kind}_engine`));
    // trains whose rails are gone go away; the others plan their way again from just ahead of them
    for (const t of this.trains) {
      if (t.state === 'hidden' || t.state === 'gone') continue;
      if (!this.replan(t)) this.remove(t);
    }
    this.rebuildGates();
    this.manage();
  }

  // How many trains a network should have, and of which kinds: [kind, ...].
  wanted(net) {
    const len = net.tiles.length;
    if (!net.kinds.length || len < MIN_RAIL) return [];
    const n = Math.min(Math.max(1, Math.floor(len / ROOM)), Math.max(net.kinds.length, 1 + Math.floor(len / PER_TRAIN)));
    const out = [];
    for (let k = 0; k < n; k++) out.push(net.kinds[k % net.kinds.length]);
    return out;
  }

  // Add or take away trains so each network has what it should (one new train at a time per network).
  manage() {
    for (const net of this.nets) {
      const want = this.wanted(net);
      const have = this.trains.filter((t) => t.net === net.id && t.state !== 'gone');
      for (const kind of new Set([...want, ...have.map((t) => t.kind)])) {
        const mine = have.filter((t) => t.kind === kind);
        const n = want.filter((x) => x === kind).length;
        // the extra ones go, hidden ones first
        mine.sort((a, b) => (b.state === 'hidden') - (a.state === 'hidden'));
        for (let m = n; m < mine.length; m++) this.remove(mine[m]);
        if (mine.length < n) this.spawn(net, kind);
      }
    }
    for (const t of this.trains) {
      if (t.state !== 'gone' && (t.net < 0 || !this.nets[t.net])) this.remove(t);
    }
  }

  // ---------- a train ----------

  // An engine and two wagons of the kind's pictures.
  makeCars(kind) {
    return ['engine', 'wagon', 'wagon'].map((part) => {
      const id = `train_${kind}_${part}`;
      const v = vehicleSprite(this.scene, id, { key: 'police_car', origin: { x: 0.5, y: 0.5 } });
      v.im.setAlpha(0);
      return { v, len: Math.max(0.6, v.im.width / 64 - 0.3) };
    });
  }

  spawn(net, kind) {
    const cars = this.makeCars(kind);
    const len = cars.reduce((a, c) => a + c.len, 0) + GAP * (cars.length - 1);
    const t = { kind, net: net.id, cars, len, state: 'hidden', alpha: 0, v: 0, stuck: 0 };
    this.trains.push(t);
    this.place(t);
    return t;
  }

  // Put a hidden train at the start of its line (or anywhere free on a loop). False if there is no room right now.
  place(t) {
    const net = this.nets[t.net];
    if (!net) return false;
    const w = this.world;
    const N = w.size;
    const free = (k) => {
      const x = (k % N) + 0.5;
      const y = ((k / N) | 0) + 0.5;
      return this.trains.every((o) => o === t || o.state === 'hidden' || o.state === 'gone'
        || o.cars.every((c) => !c.at || Math.hypot(c.at.x - x, c.at.y - y) > t.len + 1.5));
    };
    let start = -1;
    if (net.ends.length) {
      if (free(net.ends[0])) start = net.ends[0];
    } else {
      for (let tries = 0; tries < 12 && start < 0; tries++) {
        const k = pick(net.tiles);
        if (free(k)) start = k;
      }
    }
    if (start < 0) return false;
    const i = start % N;
    const j = (start / N) | 0;
    const outs = SIDE_LIST.filter((s) => w.isRail(i + SIDES[s].dx, j + SIDES[s].dy));
    const out = outs.length ? pick(outs) : 'se';
    t.tiles = [{ i, j, k: start, inSide: OPP[out], s0: 0, s1: null, first: out }];
    t.pts = [{ x: i + PORT[OPP[out]][0], y: j + PORT[OPP[out]][1], s: 0 }];
    t.stops = [];
    t.endS = null;
    t.s = 0;
    t.v = 0;
    t.stuck = 0;
    this.extend(t, t.len + LOOK);
    t.s = Math.min(t.len, t.endS ?? Infinity); // the whole train on the rails, its last wagon at the start
    t.stops = t.stops.filter((st) => st.s > t.s);
    t.state = 'run';
    t.alpha = 0;
    t.fadeIn = true;
    this.render(t, this.scene.time.now); // so the next train placed knows this one is here
    return true;
  }

  // Lay out more of the train's way ahead until `upTo` (distance along its way).
  extend(t, upTo) {
    const w = this.world;
    let guard = 0;
    while (t.endS === null && t.pts[t.pts.length - 1].s < upTo && guard++ < 64) {
      const T = t.tiles[t.tiles.length - 1];
      const opts = SIDE_LIST.filter((s) => s !== T.inSide && w.isRail(T.i + SIDES[s].dx, T.j + SIDES[s].dy));
      let out = null;
      if (T.first && opts.includes(T.first)) out = T.first;
      else if (opts.length) {
        const straight = opts.find((s) => s === OPP[T.inSide]);
        out = straight && Math.random() < 0.6 ? straight : pick(opts);
      }
      this.lay(t, T, out);
      if (!out) {
        t.endS = T.s1; // the end of the line
        break;
      }
      const d = SIDES[out];
      t.tiles.push({ i: T.i + d.dx, j: T.j + d.dy, k: w.idx(T.i + d.dx, T.j + d.dy), inSide: OPP[out], s0: T.s1, s1: null });
    }
  }

  // The points of the way through square T, from the side it comes in to side `out` (null: the end of the line,
  // straight on to the edge). A bend is a quarter circle round the corner, like the rails are drawn.
  lay(t, T, out) {
    const a = T.inSide;
    const b = out || OPP[a];
    const push = (u, v) => {
      const last = t.pts[t.pts.length - 1];
      const x = T.i + u;
      const y = T.j + v;
      t.pts.push({ x, y, s: last.s + Math.hypot(x - last.x, y - last.y) });
    };
    if (b === OPP[a]) {
      push(0.5, 0.5);
      T.mid = t.pts[t.pts.length - 1].s;
      push(...PORT[b]);
    } else {
      const pa = PORT[a];
      const pb = PORT[b];
      const c = [pa[0] === 0.5 ? pb[0] : pa[0], pa[1] === 0.5 ? pb[1] : pa[1]];
      const a0 = Math.atan2(pa[1] - c[1], pa[0] - c[0]);
      let da = Math.atan2(pb[1] - c[1], pb[0] - c[0]) - a0;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      for (let n = 1; n <= 6; n++) {
        const ang = a0 + (da * n) / 6;
        push(c[0] + 0.5 * Math.cos(ang), c[1] + 0.5 * Math.sin(ang));
        if (n === 3) T.mid = t.pts[t.pts.length - 1].s;
      }
    }
    T.s1 = t.pts[t.pts.length - 1].s;
    // a station beside this square (and not beside the one before): stop with the middle of the train by it
    const st = this.stops.get(T.k);
    const prev = t.tiles[t.tiles.indexOf(T) - 1];
    if (st && (!prev || this.stops.get(prev.k) !== st)) {
      const d = out && SIDES[out];
      const nextK = d && this.world.idx(T.i + d.dx, T.j + d.dy);
      const centre = d && this.stops.get(nextK) === st ? T.s1 : T.mid;
      const s = centre + t.len / 2;
      if (s > t.s + 0.05) t.stops.push({ s, b: st, centre });
    }
  }

  // After the rails changed: keep the way up to just ahead of the train and plan the rest again.
  // False if rails under the train (or just in front of it) are gone.
  replan(t) {
    const w = this.world;
    const tail = t.s - t.len;
    let m = t.tiles.findIndex((T) => T.s0 > t.s + 0.5);
    if (m < 0) m = t.tiles.length - 1;
    for (let n = 0; n <= m; n++) {
      const T = t.tiles[n];
      if ((T.s1 === null || T.s1 >= tail) && !w.isRail(T.i, T.j)) return false;
    }
    const T = t.tiles[m];
    if (T.s1 === null && t.endS === null) {
      // nothing laid past here yet: only the station stops need checking
      t.net = this.netOf[T.k];
      return t.net >= 0;
    }
    if (T.s0 < t.s - 1e-6 && m === t.tiles.length - 1 && t.endS !== null) {
      // the train is already on its last square: let it run to the end
      t.net = this.netOf[T.k];
      return t.net >= 0;
    }
    t.tiles.length = m + 1;
    T.s1 = null;
    T.mid = null;
    T.first = null;
    t.pts = t.pts.filter((p) => p.s <= T.s0 + 1e-6);
    t.stops = t.stops.filter((st) => st.centre <= T.s0 + 1e-6);
    t.endS = null;
    t.net = this.netOf[T.k];
    return t.net >= 0;
  }

  // Point and direction of the way at distance s.
  pointAt(t, s) {
    const p = t.pts;
    let lo = 0;
    let hi = p.length - 1;
    if (s <= p[0].s) return { x: p[0].x, y: p[0].y };
    if (s >= p[hi].s) return { x: p[hi].x, y: p[hi].y };
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (p[mid].s <= s) lo = mid;
      else hi = mid;
    }
    const a = p[lo];
    const b = p[hi];
    const k = (s - a.s) / (b.s - a.s || 1);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  remove(t) {
    if (t.state === 'gone') return;
    t.state = 'gone';
    for (const c of t.cars) {
      if (c.taken) continue; // a disaster has it
      this.scene.tweens.add({ targets: c.v.im, alpha: 0, duration: 300, onComplete: () => c.v.im.destroy() });
    }
  }

  // ---------- every frame ----------

  update(time, dt) {
    if (this.dirty) this.rebuild();
    this.manageTimer -= dt;
    if (this.manageTimer <= 0) {
      this.manageTimer = 1;
      this.manage();
      for (const t of this.trains) if (t.state === 'hidden') this.place(t);
    }
    for (const t of this.trains) this.step(t, time, dt);
    this.trains = this.trains.filter((t) => t.state !== 'gone');
    this.updateGates(time, dt);
  }

  // Where another train is in the way: the distance along t's way it must stop before (Infinity if none).
  blockedAt(t) {
    let limit = Infinity;
    const ahead = t.tiles.filter((T) => T.s0 > t.s - 0.2 && T.s0 < t.s + LOOK);
    if (!ahead.length) return limit;
    for (const o of this.trains) {
      if (o === t || o.net !== t.net || o.state === 'hidden' || o.state === 'gone' || !o.tiles) continue;
      const tail = o.s - o.len;
      const used = new Set();
      for (const T of o.tiles) if ((T.s1 === null || T.s1 > tail) && T.s0 < o.s + 0.8) used.add(T.k);
      for (const T of ahead) {
        if (T.s0 <= t.s) continue;
        if (used.has(T.k)) {
          limit = Math.min(limit, T.s0 - 0.35);
          break;
        }
      }
    }
    return limit;
  }

  step(t, time, dt) {
    if (t.state === 'hidden' || t.state === 'gone') return;
    if (t.state === 'fade') {
      // leaving: at the end of the line, or given up waiting for another train
      t.alpha -= dt * 1000 / FADE_MS;
      t.s += t.v * dt;
      if (t.alpha <= 0) {
        t.alpha = 0;
        t.state = 'hidden';
        for (const c of t.cars) c.at = null;
        if (t.cars.some((c) => c.taken)) {
          // what was left of a wreck: a whole new train comes back
          for (const c of t.cars) if (!c.taken) c.v.im.destroy();
          t.cars = this.makeCars(t.kind);
        }
        this.place(t);
      }
      this.render(t, time);
      return;
    }
    if (t.fadeIn) {
      t.alpha = Math.min(1, t.alpha + dt * 1000 / FADE_MS);
      if (t.alpha >= 1) t.fadeIn = false;
    }
    if (t.state === 'wreck') {
      if (time > t.until) t.state = 'fade';
      this.render(t, time);
      return;
    }
    if (t.state === 'dwell') {
      if (time > t.until) t.state = 'run';
      this.render(t, time);
      return;
    }
    this.extend(t, t.s + LOOK);
    // how far it may go: the next station, the end of the line, or another train in the way
    let target = Infinity;
    const stop = t.stops[0];
    if (stop) target = stop.s;
    if (t.endS !== null) target = Math.min(target, t.endS + 0.4);
    const block = this.blockedAt(t);
    target = Math.min(target, block);
    t.target = target;
    const room = target - t.s;
    const vmax = room === Infinity ? TOP_SPEED : Math.sqrt(Math.max(0, 2 * BRAKE * Math.max(0, room - 0.02)));
    t.v = Math.min(t.v + ACCEL * dt, TOP_SPEED, vmax);
    if (room < 0.02) t.v = 0;
    t.s += Math.min(t.v * dt, Math.max(0, room));
    if (stop && t.s >= stop.s - 0.03) {
      t.stops.shift();
      t.v = 0;
      t.state = 'dwell';
      t.until = time + rand(...DWELL);
      this.passengers(t, stop.b);
    } else if (t.endS !== null && t.s >= t.endS - 0.1) {
      t.state = 'fade'; // gone at the end of the line, back at the start
      t.v = Math.min(t.v, 0.8);
    } else if (block < Infinity && t.v < 0.05) {
      t.stuck += dt * 1000;
      if (t.stuck > STUCK_MS) t.state = 'fade';
    } else t.stuck = 0;
    this.trim(t);
    this.render(t, time);
  }

  // Forget the way behind the last wagon.
  trim(t) {
    const tail = t.s - t.len - 1;
    if (t.pts.length > 200) {
      const n = t.pts.findIndex((p) => p.s > tail);
      if (n > 1) t.pts.splice(0, n - 1);
    }
    if (t.tiles.length > 40) {
      const n = t.tiles.findIndex((T) => T.s1 === null || T.s1 > tail);
      if (n > 1) t.tiles.splice(0, n - 1);
    }
  }

  render(t, time) {
    let back = t.s;
    for (const c of t.cars) {
      if (c.taken) {
        back -= c.len + GAP;
        continue;
      }
      const mid = back - c.len / 2;
      const p = this.pointAt(t, mid);
      const f = this.pointAt(t, mid + c.len / 2);
      const r = this.pointAt(t, mid - c.len / 2);
      c.at = p;
      if (Math.hypot(f.x - r.x, f.y - r.y) > 1e-3) faceVehicle(c.v, f.x - r.x, f.y - r.y, time);
      const pos = toWorld(p.x, p.y);
      c.v.im.setPosition(Math.round(pos.x), Math.round(pos.y)).setDepth(p.x + p.y + 0.3).setAlpha(t.alpha);
      back -= c.len + GAP;
    }
  }

  // ---------- disasters ----------

  // Every train car on the map: [{ t, c, x, y }] (grid coordinates of its middle).
  carsOnMap() {
    const out = [];
    for (const t of this.trains) {
      if (t.state === 'hidden' || t.state === 'gone') continue;
      for (const c of t.cars) if (!c.taken && c.at && t.alpha > 0.3) out.push({ t, c, x: c.at.x, y: c.at.y });
    }
    return out;
  }

  // A disaster takes one car (it gets the picture to carry off). The rest of the train stops where it is.
  takeCar(t, c) {
    if (c.taken || t.state === 'gone' || t.state === 'hidden') return null;
    c.taken = true;
    c.at = null;
    if (t.state !== 'fade') {
      t.state = 'wreck';
      t.v = 0;
      t.until = this.scene.time.now + WRECK_MS;
    }
    if (t.cars.every((x) => x.taken)) {
      // nothing left: a new one comes back at the start
      t.state = 'hidden';
      t.alpha = 0;
      t.cars = this.makeCars(t.kind);
    }
    return c.v.im;
  }

  // People get off into the station and others come out to get on.
  passengers(t, b) {
    const mid = this.pointAt(t, t.s - t.len / 2);
    // the nearest point of the station's edge
    const edge = { x: Math.min(Math.max(mid.x, b.x + 0.2), b.x + b.w - 0.2), y: Math.min(Math.max(mid.y, b.y + 0.2), b.y + b.d - 0.2) };
    if (mid.x < b.x) edge.x = b.x;
    else if (mid.x > b.x + b.w) edge.x = b.x + b.w;
    if (mid.y < b.y) edge.y = b.y;
    else if (mid.y > b.y + b.d) edge.y = b.y + b.d;
    const off = 2 + Math.floor(Math.random() * 3);
    const on = 2 + Math.floor(Math.random() * 3);
    for (let n = 0; n < off + on; n++) {
      const along = this.pointAt(t, t.s - t.len * (0.15 + 0.7 * Math.random()));
      const door = { x: edge.x + rand(-0.4, 0.4), y: edge.y + rand(-0.4, 0.4) };
      door.x = Math.min(Math.max(door.x, b.x - 0.05), b.x + b.w + 0.05);
      door.y = Math.min(Math.max(door.y, b.y - 0.05), b.y + b.d + 0.05);
      const points = n < off ? [along, door] : [door, along];
      this.scene.time.delayedCall(250 + n * 380, () => this.people.walkLine(points));
    }
  }

  // ---------- level crossings ----------

  rebuildGates() {
    const w = this.world;
    const keep = new Map();
    for (const net of this.nets) {
      for (const k of net.tiles) {
        if (!w.road[k]) continue;
        const old = this.gates.get(k);
        const i = k % w.size;
        const j = (k / w.size) | 0;
        // a barrier on every side a road comes in from (not the sides the rails go out)
        const sides = SIDE_LIST.filter((s) => w.isRoad(i + SIDES[s].dx, j + SIDES[s].dy) && !w.isRail(i + SIDES[s].dx, j + SIDES[s].dy));
        if (old) {
          this.gates.delete(k);
          old.arms.forEach((g) => g.destroy());
        }
        const arms = sides.map(() => this.scene.add.graphics());
        keep.set(k, { i, j, sides, arms, down: old?.down || 0 });
      }
    }
    for (const g of this.gates.values()) g.arms.forEach((a) => a.destroy());
    this.gates = keep;
  }

  updateGates(time, dt) {
    this.closed.clear();
    for (const t of this.trains) {
      if (t.state === 'hidden' || t.state === 'gone' || !t.tiles) continue;
      const tail = t.s - t.len - CLOSE_BEHIND;
      // not past where it is going to stop (a station before the crossing): the cars can go until it leaves
      const leaving = t.state === 'dwell' ? t.until - time < 1200 : t.state === 'run';
      const reach = leaving ? Math.min(t.s + CLOSE_AHEAD, t.state === 'run' ? t.target ?? Infinity : Infinity) : t.s;
      for (const T of t.tiles) {
        if (T.s0 > reach) break;
        if ((T.s1 === null || T.s1 > tail) && this.gates.has(T.k)) this.closed.add(T.k);
      }
    }
    const step = (dt * 1000) / GATE_MS;
    for (const [k, g] of this.gates) {
      const shut = this.closed.has(k);
      g.down = Math.max(0, Math.min(1, g.down + (shut ? step : -step)));
      g.sides.forEach((s, n) => this.drawGate(g.arms[n], g, s, shut, time));
    }
  }

  // One barrier: a post at the right-hand side of the road coming in from side s, and a red and white arm
  // across the lane that swings down (down = 1) when a train comes.
  drawGate(gr, g, s, shut, time) {
    const d = SIDES[s];
    const right = [d.dy, -d.dx]; // the right-hand side for a car coming in from side s
    const cx = g.i + 0.5 + d.dx * 0.42;
    const cy = g.j + 0.5 + d.dy * 0.42;
    const post = { x: cx + right[0] * 0.44, y: cy + right[1] * 0.44 };
    const end = { x: cx - right[0] * 0.04, y: cy - right[1] * 0.04 };
    const P = toWorld(post.x, post.y);
    const E = toWorld(end.x, end.y);
    const H = 15; // height of the arm's pivot
    const bx = P.x;
    const by = P.y - H;
    const L = Math.hypot(E.x - P.x, E.y - P.y);
    // swing from straight up (open) to lying along the road (shut)
    const ang0 = -Math.PI / 2;
    const ang1 = Math.atan2(E.y - P.y, E.x - P.x);
    let da = ang1 - ang0;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    const k = g.down * g.down * (3 - 2 * g.down);
    const ang = ang0 + da * k;
    gr.clear();
    gr.setDepth(post.x + post.y + 0.02);
    // the post
    gr.fillStyle(0x2c2f35, 1);
    gr.fillRect(bx - 1.5, by - 1, 3, H + 1);
    gr.fillStyle(0x15171a, 0.35);
    gr.fillEllipse(bx, P.y, 7, 3);
    // the arm: red and white stripes
    const n = 6;
    for (let m = 0; m < n; m++) {
      const a0 = (m / n) * L;
      const a1 = ((m + 1) / n) * L;
      gr.lineStyle(2.5, m % 2 ? 0xffffff : 0xd8262c, 1);
      gr.lineBetween(bx + Math.cos(ang) * a0, by + Math.sin(ang) * a0, bx + Math.cos(ang) * a1, by + Math.sin(ang) * a1);
    }
    // a red light blinking on the post while a train is coming
    if (shut && Math.floor(time / 400) % 2) {
      gr.fillStyle(0xff2a1a, 1);
      gr.fillCircle(bx, by + 4, 2);
      gr.fillStyle(0xff5a3a, 0.35);
      gr.fillCircle(bx, by + 4, 5);
    }
  }

  // Is the crossing at square k shut for cars?
  isClosed(k) {
    return this.closed.has(k);
  }
}
