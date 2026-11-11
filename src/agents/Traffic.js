import { SPEED, LANE_OFFSET, SIDES, SIDE_LIST } from '../constants.js';
import { toWorld, facingFor } from '../iso.js';
import { pick, rand } from '../rng.js';
import { ART } from '../data/art.js';
import { Mover } from './Mover.js';

const MAX_CARS = 30;

// Cars wander the road network on the right-hand lane.
// Police cars leave their station's garage, patrol, and drive back home.
export class Traffic {
  constructor(scene, world, pathfinder) {
    this.scene = scene;
    this.world = world;
    this.pf = pathfinder;
    this.cars = [];
    this.stations = new Map();
    this.spawnTimer = 0;
    this.variants = scene.registry.get('variants').car;
    world.on('building-added', (b) => {
      if (!b.def.garage) return;
      const now = scene.time.now;
      const slots = [];
      for (let k = 0; k < (b.def.vehicles || 1); k++) slots.push({ car: null, next: now + 1500 + k * 6000 });
      this.stations.set(b.id, { b, slots });
    });
    world.on('building-removed', (b) => {
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
          if (!this.spawnPolice(st, slot)) slot.next = time + 3000;
        }
      }
    }

    for (const c of this.cars) {
      if (c.leaving) continue;
      if (this.blocked(c, dt)) continue;
      c.mover.step(dt);
      if (c.mover.done) {
        if (c.kind === 'police' && c.mode === 'enter') {
          const st = this.stations.get(c.station);
          if (st) {
            st.slots[c.slot].car = null;
            st.slots[c.slot].next = time + rand(4000, 9000);
          }
        }
        this.despawn(c);
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
      if (along > 0.05 && along < 0.5 && side < 0.14) {
        c.wait = (c.wait || 0) + dt;
        if (c.wait < 1.2) return true;
      }
    }
    c.wait = 0;
    return false;
  }

  makeCar(kind, key, x, y, onRoad, speed) {
    const sprite = this.scene.add.image(0, 0, key, 0).setOrigin(ART.vehicleOrigin.x, ART.vehicleOrigin.y).setAlpha(0);
    this.scene.tweens.add({ targets: sprite, alpha: 1, duration: 300 });
    const tex = this.scene.textures.get(key);
    const car = { kind, sprite, perRow: Math.max(1, Math.floor((tex.frameTotal - 1) / 2)) };
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
      const car = this.makeCar('civ', pick(this.variants), i + 0.5, j + 0.5, true, SPEED.car * rand(0.85, 1.15));
      car.cur = [i, j];
      car.heading = null;
      return;
    }
  }

  spawnPolice(st, slot) {
    const g = this.world.entrance(st.b, 'garage');
    if (!g || !this.world.isRoad(...g.outside)) return false;
    const car = this.makeCar('police', 'police_car', g.point.x, g.point.y, false, SPEED.police);
    car.station = st.b.id;
    car.slot = st.slots.indexOf(slot);
    car.home = g;
    car.mode = 'patrol';
    car.steps = 0;
    car.patrolLen = Math.floor(rand(15, 35));
    car.mover.push(g.outside[0] + 0.5, g.outside[1] + 0.5, true);
    car.cur = g.outside;
    car.heading = g.dir;
    slot.car = car;
    return true;
  }

  // Called when a car reaches the middle of a square: decide where to go next.
  next(car) {
    const w = this.world;
    const [i, j] = car.cur;
    if (car.mode === 'enter') return false;
    if (!w.isRoad(i, j)) return false;

    if (car.kind === 'police' && car.mode === 'return') {
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
    if (car.kind === 'police' && ++car.steps > car.patrolLen) car.mode = 'return';
    this.go(car, nxt);
    return true;
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
    const f = facingFor(m.dir[0], m.dir[1]);
    const frame = f.row * car.perRow + (Math.floor(time / 220) % car.perRow);
    car.sprite.setPosition(Math.round(pos.x), Math.round(pos.y)).setDepth(m.px + m.py + 0.05).setFlipX(f.flip);
    if (car.sprite.frame.name !== frame) car.sprite.setFrame(frame);
  }

  despawn(c) {
    if (c.leaving) return;
    c.leaving = true;
    if (c.kind === 'police') {
      const st = this.stations.get(c.station);
      if (st && st.slots[c.slot]?.car === c) {
        st.slots[c.slot].car = null;
        st.slots[c.slot].next = this.scene.time.now + rand(4000, 9000);
      }
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
