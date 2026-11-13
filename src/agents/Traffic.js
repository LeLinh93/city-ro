import { SPEED, LANE_OFFSET, SIDES, SIDE_LIST } from '../constants.js';
import { toWorld } from '../iso.js';
import { pick, rand } from '../rng.js';
import { ART } from '../data/art.js';
import { Mover } from './Mover.js';
import { planFieldTrip } from './fields.js';
import { CARS } from '../data/vehicles.js';
import { vehicleSprite, faceVehicle, hasVehicle } from './vehicleArt.js';

const MAX_CARS = 30;
const FUEL_CHANCE = 0.35; // how often a car driving past a gas station pulls in
const FUEL_MS = [3500, 7000]; // how long it stays at the pump

// Cars wander the road network on the right-hand lane.
// Patrol cars (police, ambulance) leave their building, drive around, and come back.
// Fire trucks are sent to a burning building, wait there, and drive back (see Services).
// Cars driving past a gas station now and then pull in, stop at a pump and drive on.
export class Traffic {
  constructor(scene, world, pathfinder) {
    this.scene = scene;
    this.world = world;
    this.pf = pathfinder;
    this.cars = [];
    this.stations = new Map();
    this.fuel = new Map(); // gas stations: building id -> { b, used: [car or null per pump spot] }
    this.spawnTimer = 0;
    this.variants = scene.registry.get('variants').car; // code-drawn stand-ins
    this.carIds = CARS.filter((id) => hasVehicle(scene, id));
    // a ruined building counts as gone until it is repaired
    world.onBuilding((b) => {
      if (b.def.fuel) this.fuel.set(b.id, { b, used: b.def.fuel.spots.map(() => null) });
    }, (b) => {
      this.fuel.delete(b.id);
      for (const c of this.cars) if (c.fuel?.st.b === b) this.despawn(c);
    });
    world.onBuilding((b) => {
      const p = b.def.patrol;
      if (!p) return;
      const now = scene.time.now;
      const slots = [];
      for (let k = 0; k < (p.count || 1); k++) slots.push({ car: null, next: now + 1500 + k * 6000 });
      this.stations.set(b.id, { b, p, slots });
    }, (b) => {
      this.stations.delete(b.id);
      for (const c of this.cars) if (c.station === b.id) this.despawn(c);
    });
  }

  carTarget() {
    return Math.min(MAX_CARS, Math.floor(this.world.roadCount / 6));
  }

  update(time, dt) {
    const civ = this.cars.filter((c) => c.kind === 'civ' && !c.leaving);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.4;
      const want = this.carTarget();
      if (civ.length < want) this.spawnCivilian();
      else if (civ.length > want) this.despawn(civ[0]);
    }

    for (const st of this.stations.values()) {
      for (const slot of st.slots) {
        if (!slot.car && time > slot.next) {
          if (!this.spawnPatrol(st, slot)) slot.next = time + 3000;
        }
      }
    }

    for (const c of this.cars) {
      if (c.leaving || c.mode === 'wait') continue;
      if (c.mode === 'fueling') {
        if (time > c.until) this.fuelOut(c);
        continue;
      }
      if (this.blocked(c, dt)) continue;
      c.mover.step(dt);
      if (c.mover.done) {
        // a fire truck at the fire, or a tank at the end of its route (see Ufo.js): stays until called back
        if (c.mode === 'arrived' || c.mode === 'offroad') c.mode = 'wait';
        else if (c.mode === 'fuel') {
          // at the pump
          c.mode = 'fueling';
          c.until = time + rand(...FUEL_MS);
          c.mover.done = false;
        }
        else this.despawn(c);
      }
    }
    for (const c of this.cars) this.render(c, time);
    this.cars = this.cars.filter((c) => !c.gone);
  }

  // Simple queueing: wait if another car is just ahead in the same lane.
  blocked(c, dt) {
    const m = c.mover;
    for (const o of this.cars) {
      if (o === c || o.leaving) continue;
      const dx = o.mover.px - m.px;
      const dy = o.mover.py - m.py;
      const along = dx * m.dir[0] + dy * m.dir[1];
      const side = Math.abs(-dx * m.dir[1] + dy * m.dir[0]);
      // long vehicles (buses, trucks) keep more room
      if (along > 0.05 && along < (c.len + o.len) / 2 + 0.1 && side < 0.14) {
        c.wait = (c.wait || 0) + dt;
        if (c.wait < 1.2) return true;
      }
    }
    c.wait = 0;
    return false;
  }

  // id: vehicle picture (src/data/vehicles.js); fallbackKey: code-drawn stand-in if that picture is missing.
  makeCar(kind, id, fallbackKey, x, y, onRoad, speed) {
    const v = vehicleSprite(this.scene, id, { key: fallbackKey, origin: ART.vehicleOrigin });
    v.im.setAlpha(0);
    this.scene.tweens.add({ targets: v.im, alpha: 1, duration: 300 });
    // about how long the vehicle is, in squares (a picture (L + W) x 64 px wide, W about 0.3)
    const car = { kind, v, sprite: v.im, len: Math.max(0.5, v.im.width / 64 - 0.3) };
    car.mover = new Mover(x, y, { speed, lane: LANE_OFFSET, onRoad, onNeed: () => this.next(car) });
    this.cars.push(car);
    return car;
  }

  spawnCivilian() {
    const w = this.world;
    for (let tries = 0; tries < 20; tries++) {
      const k = Math.floor(Math.random() * w.road.length);
      if (!w.road[k]) continue;
      const i = k % w.size;
      const j = (k / w.size) | 0;
      if (!w.roadMask(i, j)) continue;
      const id = this.carIds.length ? pick(this.carIds) : null;
      const car = this.makeCar('civ', id, pick(this.variants), i + 0.5, j + 0.5, true, SPEED.car * rand(0.85, 1.15));
      car.cur = [i, j];
      car.heading = null;
      return;
    }
  }

  // Where a building's vehicles come and go: its garage, or else its door.
  // If no road touches it there, any side of the building that touches a road will do (the one nearest the door).
  home(b) {
    const w = this.world;
    const e = w.entrance(b, b.def.garage ? 'garage' : 'door');
    if (e && w.isRoad(...e.outside)) return e;
    let best = null;
    let bestD = Infinity;
    for (let j = b.y; j < b.y + b.d; j++) {
      for (let i = b.x; i < b.x + b.w; i++) {
        for (const s of SIDE_LIST) {
          const d = SIDES[s];
          const o = [i + d.dx, j + d.dy];
          if (w.buildingAt(...o) === b || !w.isRoad(...o)) continue;
          const dist = e ? Math.hypot(o[0] - e.outside[0], o[1] - e.outside[1]) : 0;
          if (dist >= bestD) continue;
          bestD = dist;
          best = { tile: [i, j], outside: o, side: s, dir: [d.dx, d.dy], point: { x: i + 0.5 + d.dx * 0.5, y: j + 0.5 + d.dy * 0.5 } };
        }
      }
    }
    if (best) return best;
    // no road touches it: the nearest road within a few squares, where vehicles appear and disappear
    const R = 6;
    for (let j = b.y - R; j < b.y + b.d + R; j++) {
      for (let i = b.x - R; i < b.x + b.w + R; i++) {
        if (!w.isRoad(i, j)) continue;
        const dx = Math.max(b.x - i, 0, i - (b.x + b.w - 1));
        const dy = Math.max(b.y - j, 0, j - (b.y + b.d - 1));
        const dist = Math.hypot(dx, dy);
        if (dist >= bestD) continue;
        bestD = dist;
        best = { tile: [i, j], outside: [i, j], side: null, dir: null, point: { x: i + 0.5, y: j + 0.5 } };
      }
    }
    return best || e;
  }

  // A vehicle drives out of building b onto the road in front of it.
  leave(kind, b, id, speed) {
    const g = this.home(b);
    if (!g || !this.world.isRoad(...g.outside)) return null;
    const car = this.makeCar(kind, id, 'police_car', g.point.x, g.point.y, false, speed);
    car.station = b.id;
    car.home = g;
    car.mover.push(g.outside[0] + 0.5, g.outside[1] + 0.5, true);
    car.cur = g.outside;
    car.heading = g.dir;
    return car;
  }

  spawnPatrol(st, slot) {
    const id = st.p.vehicles ? pick(st.p.vehicles) : st.p.vehicle;
    const speed = SPEED.police * (st.p.speed || 1);
    if (st.p.fields && this.spawnFieldTrip(st, slot, id, speed)) return true;
    const car = this.leave('service', st.b, id, speed);
    if (!car) return false;
    car.slot = st.slots.indexOf(slot);
    car.mode = 'patrol';
    car.steps = 0;
    car.patrolLen = Math.floor(rand(15, 35));
    slot.car = car;
    return true;
  }

  // A farm's tractor: out to a field nearby, up and down its rows, and home (see fields.js).
  // Returns false when there is nothing to work, so the tractor drives on the roads instead.
  spawnFieldTrip(st, slot, id, speed) {
    const trip = planFieldTrip(this.world, st.b, st.p.fields);
    if (!trip) return false;
    const { start, end, path } = trip;
    const car = this.makeCar('service', id, 'police_car', start.point.x, start.point.y, false, speed);
    car.station = st.b.id;
    car.slot = st.slots.indexOf(slot);
    car.mode = 'field';
    car.field = true;
    for (const [i, j] of path) car.mover.push(i + 0.5, j + 0.5, this.world.isRoad(i, j));
    car.mover.push(end.point.x, end.point.y, false);
    car.cur = path[path.length - 1];
    slot.car = car;
    return true;
  }

  // Send a vehicle from building `from` to the road next to building `to`. Returns the car, or null if
  // no road connects them. The car waits there until recall(car).
  dispatch(from, to, id) {
    const w = this.world;
    const goal = new Set(); // road squares around the target
    for (let j = to.y - 1; j <= to.y + to.d; j++) {
      for (let i = to.x - 1; i <= to.x + to.w; i++) {
        const edge = i === to.x - 1 || i === to.x + to.w || j === to.y - 1 || j === to.y + to.d;
        if (edge && w.isRoad(i, j)) goal.add(w.idx(i, j));
      }
    }
    const g = this.home(from);
    if (!goal.size || !g || !w.isRoad(...g.outside)) return null;
    const path = this.pf.roadPathTo(g.outside, (k) => goal.has(k));
    if (!path) return null;
    const car = this.leave('truck', from, id, SPEED.police * 1.15);
    car.mode = 'respond';
    car.path = path.slice(1);
    car.steps = 0;
    car.patrolLen = 10;
    return car;
  }

  recall(car) {
    if (car.leaving || car.gone) return;
    car.mode = 'return';
    car.path = null;
    car.mover.done = false;
  }

  // Called when a car reaches the middle of a square: decide where to go next.
  next(car) {
    const w = this.world;
    if (car.mode === 'fuelOut') this.fuelDone(car);
    const [i, j] = car.cur;
    if (car.mode === 'fuel' || car.mode === 'enter' || car.mode === 'field' || car.mode === 'offroad') return false;
    if (!w.isRoad(i, j)) return false;
    if (car.kind === 'civ' && !car.mode && this.fuel.size && this.fuelIn(car, i, j)) return true;

    if (car.mode === 'respond') {
      if (car.path?.length && w.isRoad(...car.path[0])) {
        this.go(car, car.path.shift());
        return true;
      }
      car.mode = 'arrived';
      return false;
    }

    if (car.kind !== 'civ' && car.mode === 'return') {
      const home = car.home.outside;
      if (i === home[0] && j === home[1]) {
        car.mode = 'enter';
        car.mover.push(car.home.point.x, car.home.point.y, false);
        return true;
      }
      if (!car.path || !car.path.length || !w.isRoad(...car.path[0])) {
        car.path = this.pf.roadPath([i, j], home);
        if (car.path) car.path.shift();
      }
      if (car.path && car.path.length) {
        this.go(car, car.path.shift());
        return true;
      }
      car.mode = 'patrol'; // cannot get home right now; keep driving and try again later
      car.steps = 0;
    }

    const options = [];
    let back = null;
    for (const s of SIDE_LIST) {
      const d = SIDES[s];
      if (!w.isRoad(i + d.dx, j + d.dy)) continue;
      if (car.heading && d.dx === -car.heading[0] && d.dy === -car.heading[1]) back = [i + d.dx, j + d.dy];
      else options.push([i + d.dx, j + d.dy]);
    }
    let nxt = null;
    if (options.length) {
      const straight = car.heading && options.find(([a, b]) => a - i === car.heading[0] && b - j === car.heading[1]);
      nxt = straight && Math.random() < 0.55 ? straight : pick(options);
    } else nxt = back;
    if (!nxt) return false;
    if (car.kind !== 'civ' && ++car.steps > car.patrolLen) car.mode = 'return';
    this.go(car, nxt);
    return true;
  }

  // ---------- gas stations ----------

  // A car on the road square in front of a gas station: now and then it pulls in to a free pump.
  fuelIn(car, i, j) {
    if (car.fuelled && this.scene.time.now - car.fuelled < 60000) return false; // it just filled up
    for (const st of this.fuel.values()) {
      const g = this.home(st.b);
      if (!g || g.outside[0] !== i || g.outside[1] !== j) continue;
      const k = st.used.indexOf(null);
      if (k < 0 || Math.random() > FUEL_CHANCE) return false;
      const b = st.b;
      const [sx, sy] = b.def.fuel.spots[k];
      // pictures of turned buildings are mirrored, and so are their squares
      const spot = b.rot ? { x: b.x + sy, y: b.y + sx } : { x: b.x + sx, y: b.y + sy };
      st.used[k] = car;
      car.fuel = { st, k, g };
      car.mode = 'fuel';
      car.mover.push(g.point.x, g.point.y, false);
      car.mover.push(spot.x, spot.y, false);
      return true;
    }
    return false;
  }

  // Filled up: back out to the road it came from.
  fuelOut(car) {
    const { g } = car.fuel;
    car.mode = 'fuelOut';
    car.mover.push(g.point.x, g.point.y, false);
    car.mover.push(g.outside[0] + 0.5, g.outside[1] + 0.5, true);
  }

  // Back on the road: the pump is free again and it drives on, away from the station.
  fuelDone(car) {
    const { st, k, g } = car.fuel;
    if (st.used[k] === car) st.used[k] = null;
    car.fuel = null;
    car.mode = undefined;
    car.fuelled = this.scene.time.now;
    car.cur = g.outside;
    car.heading = g.dir;
  }

  go(car, [a, b]) {
    const [i, j] = car.cur;
    car.heading = [a - i, b - j];
    car.cur = [a, b];
    car.mover.push(a + 0.5, b + 0.5, true);
  }

  render(car, time) {
    const m = car.mover;
    const pos = toWorld(m.px, m.py);
    faceVehicle(car.v, m.dir[0], m.dir[1], time);
    let depth = car.field ? this.fieldDepth(car, m.px, m.py) : m.px + m.py + 0.05;
    // in a gas station: in front of the station's own picture, behind anything built in front of it
    const fb = car.fuel?.st.b;
    if (fb && this.world.buildingAt(Math.floor(m.px), Math.floor(m.py)) === fb) depth = fb.x + fb.y + fb.w + fb.d - 0.45;
    car.sprite.setPosition(Math.round(pos.x), Math.round(pos.y)).setDepth(depth);
  }

  // A tractor is drawn on top of every crop square it overlaps (the ones in front of it too),
  // but still behind any other building in front of it.
  fieldDepth(car, x, y) {
    const w = this.world;
    const crop = this.stations.get(car.station)?.p.fields?.crop;
    const i = Math.floor(x);
    const j = Math.floor(y);
    let top = x + y + 0.55;
    let cap = Infinity;
    for (let b = j - 1; b <= j + 1; b++) {
      for (let a = i - 1; a <= i + 1; a++) {
        const o = w.buildingAt(a, b);
        if (!o) continue;
        const d = a + b + 1.49; // the depth that square of a building is drawn at
        if (o.type === crop) top = Math.max(top, d + 0.01);
        else if (a + b > i + j) cap = Math.min(cap, d - 0.01);
      }
    }
    return Math.min(top, Math.max(cap, x + y + 0.55));
  }

  // Hand a car over to something else (a tornado, a wave): it leaves the traffic without fading out.
  take(c) {
    if (c.leaving) return null;
    c.leaving = true;
    if (c.fuel?.st.used[c.fuel.k] === c) c.fuel.st.used[c.fuel.k] = null;
    c.gone = true;
    const st = c.slot !== undefined && this.stations.get(c.station);
    if (st && st.slots[c.slot]?.car === c) {
      st.slots[c.slot].car = null;
      st.slots[c.slot].next = this.scene.time.now + rand(...(st.p.rest || [4000, 9000]));
    }
    return c.sprite;
  }

  despawn(c) {
    if (c.leaving) return;
    c.leaving = true;
    if (c.fuel?.st.used[c.fuel.k] === c) c.fuel.st.used[c.fuel.k] = null;
    const st = c.slot !== undefined && this.stations.get(c.station);
    if (st && st.slots[c.slot]?.car === c) {
      st.slots[c.slot].car = null;
      st.slots[c.slot].next = this.scene.time.now + rand(...(st.p.rest || [4000, 9000]));
    }
    this.scene.tweens.add({
      targets: c.sprite, alpha: 0, duration: 300,
      onComplete: () => {
        c.sprite.destroy();
        c.gone = true;
      },
    });
  }
}
