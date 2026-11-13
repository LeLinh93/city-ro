import { DEPTH, SPEED as CAR_SPEED } from '../constants.js';
import { toWorld, facingFor } from '../iso.js';
import { rand } from '../rng.js';

// Soldiers: while there are zombies or a kaiju (not for the UFO), every barrack sends out up to 5 soldiers in a
// military truck. It drives (along roads and over open land, like a tank) to about DROP squares from the nearest
// zombie or the kaiju, lets them out there and drives home. A barrack with no road next to it sends them on
// foot. They run at the nearest zombie (or the kaiju) and, once it is 2 squares away or closer, fire their rifles:
// 10 shots a second, 0.1 damage each (a zombie has 1 HP). Every 10 s a barrack sends new ones for those who died.
// Zombies turn soldiers they catch into zombies (Zombies.js); the kaiju's stomp, beam and energy ring kill them
// (killIn). When the fight is over they walk home. Their picture is assets/people/soldier.png (a sheet like a
// person's), or a code-drawn one.

const PER_BARRACK = 5;
const CHECK_MS = 10000; // a barrack sends new soldiers for those who died this often
const RANGE = 2; // squares: how close the target must be to shoot
const FIRE_MS = 100; // 10 shots a second
const DMG = 0.1;
const SPEED = 0.7; // squares per second (people walk at 0.55)
const ROUTE_MS = 1500; // a new route towards the target this often
const TRACER_MS = 45;
const DROP = 4; // squares from the target where the truck lets the soldiers out
const HOP_MS = 250; // between soldiers getting out of the truck

export class Soldiers {
  constructor(scene, world, military) {
    this.scene = scene;
    this.world = world;
    this.military = military;
    this.list = [];
    this.barracks = new Map(); // barrack id -> { next: time it checks again }
    this.tracers = [];
    this.trucks = new Map(); // barrack id -> { car, load (soldiers in it), path (its way out), unloaded }
    this.g = scene.add.graphics().setDepth(DEPTH.AIR + 1);
    this.g.glow = true; // muzzle flashes are not darkened at night
  }

  // The monsters soldiers fight (they have `infantry`: the zombies and the kaiju).
  foes() {
    return this.military.live().filter((f) => f.infantry);
  }

  update(time, dt) {
    this.g.clear();
    const foes = this.foes();
    if (foes.length) this.muster(time, foes);
    else this.barracks.clear(); // next time they come out straight away
    this.updateTrucks(foes);
    let n = 0;
    for (const s of this.list) {
      if (s.dead) {
        s.deadT += dt;
        const a = 1 - s.deadT / 0.4;
        if (a <= 0) {
          s.im.destroy();
          continue;
        }
        s.im.setAlpha(a);
        this.list[n++] = s;
        continue;
      }
      this.list[n++] = s;
      if (s.age < 0.4) {
        s.age += dt;
        s.im.setAlpha(Math.min(1, s.age / 0.4));
      }
      if (foes.length) {
        if (s.home) s.route = []; // going home, but there are new monsters: back to the fight
        s.home = false;
        this.fight(s, foes, time, dt);
      } else this.goHome(s, time, dt);
      this.draw(s);
    }
    this.list.length = n;
    this.drawTracers(time);
  }

  // Every barrack sends soldiers for the ones it is missing, every CHECK_MS.
  muster(time, foes = this.foes()) {
    for (const b of this.world.buildings.values()) {
      if (b.type !== 'barrack' || b.ruined) continue;
      let st = this.barracks.get(b.id);
      if (!st) this.barracks.set(b.id, (st = { next: time + rand(300, 1500) }));
      if (time < st.next) continue;
      st.next = time + CHECK_MS;
      const truck = this.trucks.get(b.id);
      if (truck && !truck.car.gone && !truck.unloaded) continue; // the last ones are still on their way
      const need = PER_BARRACK - this.list.filter((s) => !s.dead && s.from === b.id).length;
      if (need <= 0 || this.sendTruck(b, need, foes)) continue;
      // no road for a truck: on foot, one after another out of the door
      const out = this.exits(b);
      for (let k = 0; k < need && out.length; k++) {
        this.scene.time.delayedCall(k * 350, () => {
          if (this.foes().length && this.world.buildings.has(b.id) && !b.ruined) this.add(b.id, ...center(out[k % out.length]));
        });
      }
    }
  }

  // Squares next to the building a soldier can stand on, the door first.
  exits(b) {
    const w = this.world;
    const out = [];
    const door = w.entrance(b);
    if (door && this.open(...door.outside)) out.push(door.outside);
    for (let i = b.x - 1; i <= b.x + b.w; i++) {
      for (let j = b.y - 1; j <= b.y + b.d; j++) {
        const edge = i === b.x - 1 || i === b.x + b.w || j === b.y - 1 || j === b.y + b.d;
        if (edge && this.open(i, j)) out.push([i, j]);
      }
    }
    return out;
  }

  // Can a soldier walk on this square? (not water, not a building that is standing; decorations are fine)
  open(i, j) {
    const w = this.world;
    if (!w.inBounds(i, j) || w.isWater(i, j)) return false;
    const b = w.buildingAt(i, j);
    return !b || b.ruined || b.def.menu === 'Decoration';
  }

  add(from, x, y) {
    const im = this.scene.add.image(0, 0, 'soldier', 0).setOrigin(0.5, 1).setAlpha(0);
    const tex = this.scene.textures.get('soldier');
    const s = {
      soldier: true, im, from, mover: { px: x, py: y }, dir: [0, 1], walked: 0, age: 0,
      perRow: Math.max(1, Math.floor((tex.frameTotal - 1) / 2)), route: [], repath: 0, nextShot: 0,
      ox: rand(-0.25, 0.25), oy: rand(-0.25, 0.25), dead: false, deadT: 0, leaving: false, home: false, firing: false,
    };
    this.list.push(s);
    this.draw(s);
    return s;
  }

  // A soldier gone: shot down by the kaiju (or bitten: then the zombie takes its place, Zombies.js).
  kill(s, fade = true) {
    if (s.dead) return;
    s.dead = true;
    s.leaving = true;
    if (!fade) {
      s.im.destroy();
      s.deadT = 1;
    }
  }

  // Bitten by a zombie: it becomes one.
  convert(s) {
    this.kill(s, false);
  }

  // The kaiju's stomp, beam or ring: every soldier within `h` squares (a square box) of (x, y) dies.
  killIn(x, y, h) {
    for (const s of this.list) {
      if (s.dead || Math.abs(s.mover.px - x) > h || Math.abs(s.mover.py - y) > h) continue;
      this.kill(s);
      const p = toWorld(s.mover.px, s.mover.py);
      this.military.sparks.emitParticleAt(p.x, p.y - 12, 6);
    }
  }

  // ---------- the trucks ----------

  // A truck with `n` soldiers drives out of barrack b towards the nearest monster. False if it can't (no road).
  sendTruck(b, n, foes) {
    const car = this.military.traffic.leave('truck', b, 'militarytruck', CAR_SPEED.police * 0.9);
    if (!car) return false;
    car.mode = 'offroad'; // its own way, not the traffic's; it stops at the end of it (see Traffic.update)
    const cx = b.x + b.w / 2;
    const cy = b.y + b.d / 2;
    const g = nearestPoint(foes, cx, cy);
    const path = (g && this.military.tankRoute(car.cur, g.x, g.y, DROP)) || [car.cur];
    for (const [i, j] of path.slice(1)) car.mover.push(i + 0.5, j + 0.5, this.world.isRoad(i, j));
    this.trucks.set(b.id, { car, from: b.id, load: n, path, unloaded: false });
    return true;
  }

  // A truck at the end of its way lets its soldiers out, then drives home the way it came and goes in.
  // With nobody left to fight it goes home with them still in it. A truck destroyed (by the kaiju) takes its
  // soldiers with it.
  updateTrucks(foes) {
    for (const [id, tr] of this.trucks) {
      const car = tr.car;
      if (car.gone || car.leaving) {
        this.trucks.delete(id);
        continue;
      }
      if (tr.unloaded) continue;
      const there = car.mode === 'wait';
      if (!there && foes.length) continue;
      tr.unloaded = true;
      if (foes.length) {
        const m = car.mover;
        const spot = [m.px, m.py];
        for (let k = 0; k < tr.load; k++) {
          this.scene.time.delayedCall(k * HOP_MS, () => {
            if (this.foes().length && !car.gone) this.add(tr.from, spot[0] + rand(-0.3, 0.3), spot[1] + rand(-0.3, 0.3));
          });
        }
      }
      // home: back along its way, then in through the barrack's door (Traffic despawns it there)
      this.scene.time.delayedCall(foes.length ? tr.load * HOP_MS + 300 : 0, () => {
        if (car.gone || car.leaving) return;
        const m = car.mover;
        m.queue.length = 0;
        const back = tr.path.slice(0, -1).reverse();
        for (const [i, j] of back) m.push(i + 0.5, j + 0.5, this.world.isRoad(i, j));
        if (car.home) m.push(car.home.point.x, car.home.point.y, false);
        m.done = false;
        car.mode = 'enter';
      });
    }
  }

  // ---------- fighting ----------

  fight(s, foes, time, dt) {
    const m = s.mover;
    // the nearest monster, and the nearest point of it (a crowd's nearest zombie)
    let foe = null;
    let g = null;
    let bd = Infinity;
    for (const f of foes) {
      const p = f.closest ? f.closest(m.px, m.py) : f.ground();
      const d = Math.hypot(p.x - m.px, p.y - m.py);
      if (d < bd) {
        bd = d;
        foe = f;
        g = p;
      }
    }
    s.firing = false;
    if (bd <= RANGE) {
      this.shoot(s, foe, g, time);
      return;
    }
    if (time > s.repath || !s.route.length) {
      s.repath = time + ROUTE_MS;
      s.route = this.route(m, (i, j) => Math.hypot(i + 0.5 - g.x, j + 0.5 - g.y) <= RANGE * 0.8) || [];
    }
    if (!this.follow(s, dt)) {
      // no way round: straight at it, as far as it can
      const d = bd || 1;
      this.stepTo(s, m.px + ((g.x - m.px) / d) * 2, m.py + ((g.y - m.py) / d) * 2, dt);
    }
  }

  shoot(s, foe, g, time) {
    const m = s.mover;
    s.dir = [g.x - m.px || 0.01, g.y - m.py];
    s.firing = true;
    if (s.nextShot < time - 200) s.nextShot = time;
    while (s.nextShot <= time) {
      s.nextShot += FIRE_MS;
      let to;
      if (foe.nearZombie) {
        const z = foe.nearZombie(m.px, m.py, RANGE + 0.3);
        if (!z) return;
        foe.hurt(DMG, time, 'rifle', { z, gx: z.x, gy: z.y });
        const p = toWorld(z.x, z.y);
        to = { x: p.x + rand(-3, 3), y: p.y - rand(8, 18) };
      } else {
        foe.hurt(DMG, time);
        const a = foe.aim();
        to = { x: a.x + rand(-30, 30), y: a.y + rand(-30, 30) };
      }
      const p = toWorld(m.px, m.py);
      const right = s.im.flipX ? -1 : 1;
      this.tracers.push({ x0: p.x + 9 * right, y0: p.y - 12, x1: to.x, y1: to.y, t0: time });
    }
  }

  drawTracers(time) {
    const g = this.g;
    this.tracers = this.tracers.filter((t) => {
      const k = (time - t.t0) / TRACER_MS;
      if (k >= 1) return false;
      g.lineStyle(1.5, 0xffe27a, 0.9 * (1 - k));
      g.lineBetween(t.x0 + (t.x1 - t.x0) * k * 0.5, t.y0 + (t.y1 - t.y0) * k * 0.5, t.x1, t.y1);
      g.fillStyle(0xfff3b0, 1 - k);
      g.fillCircle(t.x0, t.y0, 2.5);
      return true;
    });
  }

  // ---------- walking ----------

  // Home to the barrack when the fight is over, then in through the door (gone).
  goHome(s, time, dt) {
    s.home = true;
    s.firing = false;
    const b = this.world.buildings.get(s.from);
    const m = s.mover;
    if (!b || b.ruined) {
      this.kill(s);
      return;
    }
    const near = (i, j) => i >= b.x - 1 && i <= b.x + b.w && j >= b.y - 1 && j <= b.y + b.d;
    if (near(Math.floor(m.px), Math.floor(m.py))) {
      this.kill(s);
      return;
    }
    if (time > s.repath || !s.route.length) {
      s.repath = time + ROUTE_MS * 2;
      s.route = this.route(m, near) || [];
      if (!s.route.length) this.kill(s); // can't get home: just goes
    }
    this.follow(s, dt);
  }

  // Squares from where the soldier is to the first square `goal(i, j)` says yes to, over open squares
  // (shortest first). Null if there is none.
  route(m, goal) {
    const w = this.world;
    const N = w.size;
    const i0 = Math.floor(m.px);
    const j0 = Math.floor(m.py);
    if (!w.inBounds(i0, j0)) return null;
    const start = w.idx(i0, j0);
    const prev = new Map([[start, -1]]);
    const list = [start];
    let found = -1;
    for (let n = 0; n < list.length && n < 12000; n++) {
      const k = list[n];
      const i = k % N;
      const j = (k / N) | 0;
      if (goal(i, j)) {
        found = k;
        break;
      }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di;
        const b = j + dj;
        if (!this.open(a, b) || prev.has(w.idx(a, b))) continue;
        prev.set(w.idx(a, b), k);
        list.push(w.idx(a, b));
      }
    }
    if (found < 0) return null;
    const out = [];
    for (let k = found; k !== start && k !== -1; k = prev.get(k)) out.push([k % N, (k / N) | 0]);
    return out.reverse();
  }

  // Along the route. False when there is no route.
  follow(s, dt) {
    if (!s.route.length) return false;
    const [i, j] = s.route[0];
    if (this.stepTo(s, i + 0.5 + s.ox, j + 0.5 + s.oy, dt)) s.route.shift();
    return true;
  }

  // A step towards (x, y); true when there.
  stepTo(s, x, y, dt) {
    const m = s.mover;
    const dx = x - m.px;
    const dy = y - m.py;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) return true;
    const step = Math.min(d, SPEED * dt);
    const nx = m.px + (dx / d) * step;
    const ny = m.py + (dy / d) * step;
    if (!this.open(Math.floor(nx), Math.floor(ny)) && this.open(Math.floor(m.px), Math.floor(m.py))) return true; // blocked
    m.px = nx;
    m.py = ny;
    s.dir = [dx, dy];
    s.walked += step;
    return step >= d;
  }

  draw(s) {
    const m = s.mover;
    const p = toWorld(m.px, m.py);
    const f = facingFor(s.dir[0], s.dir[1]);
    const frame = f.row * s.perRow + (s.firing ? 0 : Math.floor(s.walked * 6) % s.perRow);
    s.im.setPosition(Math.round(p.x), Math.round(p.y)).setFlipX(f.flip).setDepth(m.px + m.py);
    if (s.im.frame.name !== frame) s.im.setFrame(frame);
  }
}

const center = ([i, j]) => [i + 0.5, j + 0.5];

// The point of the monsters nearest to the square (x, y) (a crowd's nearest zombie), or null.
function nearestPoint(foes, x, y) {
  let best = null;
  let bd = Infinity;
  for (const f of foes) {
    const p = f.closest ? f.closest(x, y) : f.ground();
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
