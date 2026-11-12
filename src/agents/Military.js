import { DEPTH, SPEED } from '../constants.js';
import { toWorld, toGrid } from '../iso.js';
import { pick, rand } from '../rng.js';
import { vehicleSprite, faceVehicle, hasVehicle, vehicleShadow, placeShadow } from './vehicleArt.js';

// The military fights the monsters (the UFO, the kaiju): tanks from the military bases, planes and the
// helicopter from the military airport (and a jet from each aircraft carrier), rockets from the missile silos
// and the warships. Every unit picks its own target when there is more than one monster.
//
// A monster (`foe`) has:
//   alive          it is there and can be shot
//   ground()       the point under its middle, in squares {x, y}
//   aim()          where shots go, in world px {x, y}
//   spread         how far round that point shots land, px {x, y}
//   hurt(dmg, t)   a hit

const RUIN_SIZE = 4; // squares: a beam's impact ruins the buildings in this square ...
const FIRE_SIZE = 8; // ... and sets fire to those in this one
const FIRE_BURN_OUT = 75000; // ms: a fire nobody puts out by then ruins its building
const BLAST_MS = 550; // how long a rocket's explosion on a monster lasts
const NEW_TANK = 8000; // ms before a military base sends a new tank after one is destroyed
const ALT = 320; // how high the planes fly, px

// damage of each kind of shot, and how fast it flies (px per second)
const SHOTS = {
  bullet: { dmg: 1, speed: 950 },
  shell: { dmg: 5, speed: 650 }, // a tank's shot
  bomb: { dmg: 5, speed: 0, accel: 700 }, // falls, faster and faster
  rocket: { dmg: 10, speed: 520, boost: 600 }, // flies up first for `boost` ms, then towards the monster
};

const TANK_RANGE = 9; // squares from the point under the monster
const TANK_RELOAD = 5000;
const SILO_RELOAD = 30000;
const SHIP_RELOAD = 20000;
const SHIP_SALVO = 5; // rockets a destroyer or carrier fires at a time
const SHIP_TYPES = ['destroyer', 'aircraftcarrier'];
const CARRIER_DECK = 22; // px from the carrier's waterline up to its flight deck
const SORTIE_REST = 20000; // ms a plane or helicopter waits at home between attacks
// salvo: what it fires on each attack, in order: [kind, how many, ms between them]
const PLANES = {
  fighterjet: { speed: 380, alt: ALT, salvo: [['bullet', 20, 90], ['rocket', 2, 350]] }, // a strafing run
  heli_military: { speed: 190, alt: ALT - 70, salvo: [['rocket', 4, 700]] }, // hovers beside it
  bomber: { speed: 210, alt: ALT + 190, salvo: [['bomb', 5, 260]] }, // drops bombs on it from above
};
const salvoSize = (c) => c.salvo.reduce((n, [, k]) => n + k, 0);

export class Military {
  constructor(scene, world, { services, traffic, ships, disasters }) {
    this.scene = scene;
    this.world = world;
    this.services = services;
    this.traffic = traffic;
    this.ships = ships;
    this.disasters = disasters;
    this.foes = []; // every kind of monster; see `alive`
    this.shots = [];
    this.blasts = []; // rocket explosions, being drawn
    this.tanks = new Map(); // military base id -> { car, next, reload, repath }
    this.sorties = new Map(); // `${airport id}:${plane}` or a carrier -> sortie
    this.reload = new Map(); // silo id or ship -> time it can fire again
    this.engaged = false;
    this.g = scene.add.graphics().setDepth(DEPTH.AIR + 2000);
    this.sparks = scene.add.particles(0, 0, 'fx_flame', {
      lifespan: { min: 300, max: 700 }, speed: { min: 40, max: 180 }, gravityY: 120,
      scale: { start: 1.6, end: 0.2 }, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(DEPTH.AIR + 2001);
    this.smoke = scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 600, max: 1200 }, speed: { min: 5, max: 25 }, tint: 0xd8d8d8,
      scale: { start: 1, end: 3 }, alpha: { start: 0.6, end: 0 }, emitting: false,
    }).setDepth(DEPTH.AIR + 1999);
  }

  add(foe) {
    this.foes.push(foe);
  }

  live() {
    return this.foes.filter((f) => f.alive);
  }

  // The monster closest to the square (x, y), or null.
  nearest(x, y) {
    let best = null;
    let bd = Infinity;
    for (const f of this.live()) {
      const g = f.ground();
      const d = Math.hypot(g.x - x, g.y - y);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  update(time, dt) {
    this.g.clear();
    const on = this.live().length > 0;
    if (on) this.defend(time);
    else if (this.engaged) this.standDown();
    this.engaged = on;
    this.stepSorties(time, dt);
    this.stepShots(time, dt);
    this.drawBlasts(time);
    this.drawFlashes(time);
  }

  // Every monster is gone: everybody goes home.
  standDown() {
    this.shots = [];
    for (const t of this.tanks.values()) if (t.car && !t.car.gone) this.traffic.recall(t.car);
    this.tanks.clear();
    this.reload.clear();
    for (const s of this.sorties.values()) if (s.state !== 'rest') s.state = 'back';
  }

  // ---------- what the monsters do to the city ----------

  // A beam lands at square `at`: buildings in a `ruin` x `ruin` square round it are ruined (people and cars there
  // are killed), and those in a `fire` x `fire` square catch fire.
  strike(at, time, ruin = RUIN_SIZE, fire = FIRE_SIZE) {
    const d = this.disasters;
    const w = this.world;
    const inside = (b, h) => b.x < at.x + h && b.x + b.w > at.x - h && b.y < at.y + h && b.y + b.d > at.y - h;
    for (const b of [...w.buildings.values()]) if (inside(b, ruin / 2)) w.ruinBuilding(b);
    for (const t of d.near(at.x, at.y, ruin / 2 + 0.3)) this.fade(d.take(t));
    for (const b of w.buildings.values()) if (!b.ruined && inside(b, fire / 2)) this.services.ignite(b, time, FIRE_BURN_OUT);
    const p = toWorld(at.x, at.y);
    this.sparks.emitParticleAt(p.x, p.y, 30);
    for (let k = 0; k < 10; k++) this.smoke.emitParticleAt(p.x + rand(-90, 90), p.y + rand(-40, 20), 1);
  }

  fade(sprite, ms = 300) {
    if (sprite) this.scene.tweens.add({ targets: sprite, alpha: 0, duration: ms, onComplete: () => sprite.destroy() });
  }

  // Tanks out of their base and planes in the air, each as { x, y (world px), ground: {x, y} squares, kill() }.
  units(time) {
    const out = [];
    for (const t of this.tanks.values()) {
      const car = t.car;
      if (!car || car.gone || car.leaving) continue;
      const q = toWorld(car.mover.px, car.mover.py);
      out.push({ x: q.x, y: q.y - 12, ground: { x: car.mover.px, y: car.mover.py }, kill: () => this.killTank(t, time) });
    }
    for (const s of this.sorties.values()) {
      if (s.state === 'rest' || !s.v) continue;
      const g = toGrid(s.x, s.y);
      out.push({ x: s.x, y: s.y - s.alt, ground: { x: g.fx, y: g.fy }, kill: () => this.killPlane(s, time) });
    }
    return out;
  }

  // A tank destroyed: its base sends a new one a little later.
  killTank(t, time) {
    this.fade(this.traffic.take(t.car), 400);
    t.car = null;
    t.next = time + NEW_TANK;
  }

  // A plane or helicopter destroyed: another one goes out with the next wave.
  killPlane(s, time) {
    const { v, shadow } = s;
    this.scene.tweens.add({ targets: [v.im, shadow], alpha: 0, duration: 300, onComplete: () => { v.im.destroy(); shadow.destroy(); } });
    s.v = null;
    s.state = 'rest';
    s.until = time + SORTIE_REST;
  }

  // Is this car one of the tanks out fighting? Then it is destroyed like one (and its base sends another).
  killIfTank(car, time) {
    for (const t of this.tanks.values()) {
      if (t.car === car) {
        this.killTank(t, time);
        return true;
      }
    }
    return false;
  }

  // ---------- the military fights back ----------

  defend(time) {
    const w = this.world;
    const live = (b) => w.buildings.has(b.id) && !b.ruined;
    for (const b of w.buildings.values()) {
      if (b.ruined) continue;
      if (b.type === 'militarybase') this.tank(b, time);
      else if (b.type === 'missilesilo') {
        if (time < (this.reload.get(b.id) ?? -Infinity)) continue;
        if (!this.reload.has(b.id)) {
          this.reload.set(b.id, time + rand(1500, 4000)); // the first one goes soon
          continue;
        }
        const c = this.services.center(b);
        this.fire('rocket', { x: c.x, y: c.top + 30 }, time, this.nearest(b.x + b.w / 2, b.y + b.d / 2));
        this.reload.set(b.id, time + SILO_RELOAD);
      } else if (b.type === 'militaryairport') {
        for (const plane of Object.keys(PLANES)) {
          const key = `${b.id}:${plane}`;
          if (!this.sorties.has(key) && hasVehicle(this.scene, plane)) this.sorties.set(key, this.newSortie(b, plane, time));
        }
      }
    }
    // ships of the fleet
    const ships = new Set();
    for (const dock of this.ships.docks.values()) {
      for (const slot of dock.slots) {
        const s = slot.ship;
        if (!s || !SHIP_TYPES.includes(slot.id)) continue;
        ships.add(s);
        // a carrier also sends its fighter jet, like the airport's
        if (slot.id === 'aircraftcarrier' && !this.sorties.has(s) && hasVehicle(this.scene, 'fighterjet')) {
          this.sorties.set(s, this.newSortie(dock.b, 'fighterjet', time, s));
        }
        if (!this.reload.has(s)) {
          this.reload.set(s, time + rand(2000, 6000));
          continue;
        }
        if (time < this.reload.get(s)) continue;
        // a salvo: SHIP_SALVO rockets one after another, from along the deck
        const foe = this.nearest(s.x, s.y);
        for (let k = 0; k < SHIP_SALVO; k++) {
          this.scene.time.delayedCall(k * 180, () => {
            if (!foe?.alive || !s.v.im.active) return; // the monster or the ship is gone
            const p = toWorld(s.x, s.y);
            this.fire('rocket', { x: p.x + rand(-50, 50), y: p.y - 50 + rand(-10, 10) }, this.scene.time.now, foe);
          });
        }
        this.reload.set(s, time + SHIP_RELOAD);
      }
    }
    // planes of an airport that is gone don't go out again (and a carrier's jet doesn't once the carrier is gone)
    for (const s of this.sorties.values()) if (s.ship ? !ships.has(s.ship) : !live(s.b)) s.dead = true;
  }

  // One tank per military base drives along the roads towards the nearest monster and shoots when it is close enough.
  tank(b, time) {
    let t = this.tanks.get(b.id);
    if (!t) {
      t = { car: null, next: time + rand(500, 2500), reload: 0, repath: 0 };
      this.tanks.set(b.id, t);
    }
    if (!t.car || t.car.gone || t.car.leaving) {
      if (time < t.next) return;
      t.car = this.traffic.leave('tank', b, 'tank', SPEED.police * 0.75);
      t.next = time + 15000; // if it can't come out (no road) or is lost, try again later
      if (!t.car) return;
      t.car.mode = 'respond';
      t.car.path = [];
      t.repath = 0;
    }
    const car = t.car;
    const m = car.mover;
    const foe = this.nearest(m.px, m.py);
    if (!foe) return;
    const g = foe.ground();
    const dist = Math.hypot(m.px - g.x, m.py - g.y);
    // every few seconds (once it has reached the end of its last route): a new route towards the monster
    if (time > t.repath && (car.mode === 'wait' || !m.queue.length)) {
      t.repath = time + 3000;
      if (dist > TANK_RANGE * 0.6) {
        const from = [Math.floor(m.px), Math.floor(m.py)];
        const path = this.tankRoute(from, g.x, g.y);
        if (path && path.length > 1) {
          m.queue.length = 0;
          for (const [i, j] of path.slice(1)) m.push(i + 0.5, j + 0.5, this.world.isRoad(i, j));
          car.cur = path[path.length - 1];
          car.mode = 'offroad';
          m.done = false;
        }
      }
    }
    if (dist <= TANK_RANGE && time > t.reload) {
      const p = toWorld(m.px, m.py);
      this.fire('shell', { x: p.x, y: p.y - 14 }, time, foe);
      t.reload = time + TANK_RELOAD;
    }
  }

  // A tank's route from square `from` to within range of the point (x, y): over roads and open land
  // (not through buildings or water), shortest first. Null if it can't get there.
  tankRoute(from, x, y) {
    const w = this.world;
    const ok = (i, j) => w.inBounds(i, j) && !w.isWater(i, j) && !w.bldg[w.idx(i, j)];
    const near = (i, j) => Math.hypot(i + 0.5 - x, j + 0.5 - y) <= TANK_RANGE * 0.6;
    const start = w.idx(...from);
    const prev = new Map([[start, -1]]);
    const list = [from];
    let goal = -1;
    for (let n = 0; n < list.length && n < 20000; n++) {
      const [i, j] = list[n];
      if (near(i, j)) {
        goal = w.idx(i, j);
        break;
      }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di;
        const b = j + dj;
        if (!ok(a, b) || prev.has(w.idx(a, b))) continue;
        prev.set(w.idx(a, b), w.idx(i, j));
        list.push([a, b]);
      }
    }
    if (goal < 0) return null;
    const out = [];
    for (let k = goal; k !== -1; k = prev.get(k)) out.push([k % w.size, (k / w.size) | 0]);
    return out.reverse();
  }

  // ---------- planes and helicopters from the military airport (and carriers) ----------

  // `ship`: the carrier the plane flies from, instead of the airport `b`.
  newSortie(b, plane, time, ship = null) {
    return { b, ship, plane, cfg: PLANES[plane], state: 'rest', until: time + rand(1000, 5000), v: null };
  }

  // Where a plane of this airport (or carrier) takes off and lands, in world px.
  home(s) {
    if (s.ship) {
      const p = toWorld(s.ship.x, s.ship.y);
      return { x: p.x, y: p.y - CARRIER_DECK };
    }
    const b = s.b;
    const local = (lx, ly) => (b.rot ? toWorld(b.x + ly, b.y + lx) : toWorld(b.x + lx, b.y + ly));
    if (s.plane === 'heli_military' && b.def.heli) {
      const pad = this.services.picturePoint(b, b.def.heli.pad.px, b.def.heli.pad.py);
      return { x: pad.x, y: pad.y };
    }
    const lane = (b.def.lanes || []).find((L) => L.plane === s.plane);
    return lane ? local(...lane.takeoff[0]) : toWorld(b.x + b.w / 2, b.y + b.d / 2);
  }

  launch(s, time) {
    const home = this.home(s);
    const v = vehicleSprite(this.scene, s.plane, null);
    Object.assign(s, {
      v, shadow: vehicleShadow(this.scene, v), x: home.x, y: home.y, alt: 0, home, state: 'out',
      fired: 0, nextShot: 0, pass: null, dir: [1, 0], foe: pick(this.live()), // each plane picks its own target
    });
    v.im.setAlpha(0);
    this.scene.tweens.add({ targets: v.im, alpha: 1, duration: 500 });
  }

  stepSorties(time, dt) {
    for (const [key, s] of this.sorties) {
      if (s.state === 'rest') {
        // at home: goes out again after its rest, while there is still a monster
        if (s.dead || !this.engaged) this.sorties.delete(key);
        else if (time > s.until) this.launch(s, time);
        continue;
      }
      this.stepPlane(s, time, dt);
    }
  }

  stepPlane(s, time, dt) {
    const c = s.cfg;
    const toward = (pt, speed) => {
      const dx = pt.x - s.x;
      const dy = pt.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        const g = toGrid(dx, dy);
        s.dir = [g.fx, g.fy];
      }
      if (d <= speed * dt) {
        s.x = pt.x;
        s.y = pt.y;
        return true;
      }
      s.x += (dx / d) * speed * dt;
      s.y += (dy / d) * speed * dt;
      return false;
    };
    const climb = (alt, rate) => {
      const step = rate * dt;
      s.alt = Math.abs(alt - s.alt) <= step ? alt : s.alt + Math.sign(alt - s.alt) * step;
    };
    const done = () => s.fired >= salvoSize(c);
    const shoot = () => {
      if (done() || time < s.nextShot) return;
      // which part of the salvo the next shot belongs to
      let n = s.fired;
      const [kind, , every] = c.salvo.find(([, k]) => (n -= k) < 0);
      s.fired++;
      s.nextShot = time + every;
      this.fire(kind, { x: s.x, y: s.y - s.alt + (kind === 'bomb' ? 14 : 0) }, time, s.foe, { air: true });
    };
    if (s.state === 'out' && !s.foe?.alive) {
      // its target is gone: another one, or home
      s.foe = pick(this.live()) || null;
      s.pass = null;
      if (!s.foe) s.state = 'back';
    }
    if (s.state === 'out') {
      const fg = s.foe.ground();
      const ground = toWorld(fg.x, fg.y);
      climb(c.alt, 160);
      if (s.plane === 'heli_military') {
        // hovers beside it and fires its rockets
        const spot = { x: ground.x - 380, y: ground.y + 60 };
        if (toward(spot, c.speed)) {
          s.dir = [1, -1];
          shoot();
          if (done() && time > s.nextShot) s.state = 'back';
        }
      } else {
        // flies at it (the bomber over it), firing / dropping on the way, and on past it
        if (!s.pass) {
          const d = Math.hypot(ground.x - s.x, ground.y - s.y);
          if (d < (s.plane === 'bomber' ? 260 : 760)) {
            const ux = (ground.x - s.x) / d;
            const uy = (ground.y - s.y) / d;
            s.pass = { x: ground.x + ux * 900, y: ground.y + uy * 900 };
          }
          toward(ground, c.speed);
        } else if (toward(s.pass, c.speed) && done()) s.state = 'back';
        else if (s.pass && !done() && Math.hypot(s.pass.x - s.x, s.pass.y - s.y) < 1) {
          // not finished yet at the end of the run: keep going the same way a little longer
          s.pass = { x: s.x + (s.x - ground.x) * 0.3, y: s.y + (s.y - ground.y) * 0.3 };
        }
        if (s.pass) shoot();
      }
    } else if (s.state === 'back') {
      // home, coming down near the end (a carrier keeps sailing, so follow it)
      if (s.ship) s.home = this.home(s);
      const d = Math.hypot(s.home.x - s.x, s.home.y - s.y);
      climb(d < 500 ? 0 : c.alt, 130);
      if (toward(s.home, c.speed) && s.alt <= 0) {
        // landed: gone into the hangar until the next attack
        s.state = 'rest';
        s.until = time + SORTIE_REST;
        const { v, shadow } = s;
        this.scene.tweens.add({ targets: [v.im, shadow], alpha: 0, duration: 500, onComplete: () => { v.im.destroy(); shadow.destroy(); } });
        s.v = null;
        return;
      }
    }
    // draw
    faceVehicle(s.v, s.dir[0], s.dir[1]);
    s.v.im.setPosition(Math.round(s.x), Math.round(s.y - s.alt)).setDepth(DEPTH.AIR + s.alt);
    const lift = Math.min(1, s.alt / 350);
    placeShadow(s.shadow, s.v, s.x + 8, s.y + 6, 0.2 * (1 - lift * 0.6) * s.v.im.alpha, DEPTH.SHADOW, 1 - lift * 0.3);
  }

  // ---------- shots ----------

  fire(kind, from, time, foe, { air = false } = {}) {
    if (!foe) return;
    const S = SHOTS[kind];
    const sp = foe.spread;
    this.shots.push({
      kind, foe, x: from.x, y: from.y, speed: S.speed, t0: time, boost: air ? 0 : S.boost || 0, trail: [],
      jitter: { x: rand(-sp.x, sp.x), y: rand(-sp.y, sp.y) },
    });
  }

  stepShots(time, dt) {
    const g = this.g;
    this.shots = this.shots.filter((s) => {
      if (!s.foe.alive) return false; // its target is gone
      const S = SHOTS[s.kind];
      const p = s.foe.aim();
      const tx = p.x + s.jitter.x;
      const ty = p.y + s.jitter.y;
      if (S.accel) s.speed += S.accel * dt;
      let dx = tx - s.x;
      let dy = ty - s.y;
      if (time - s.t0 < s.boost) {
        dx = 0;
        dy = -1; // straight up out of the silo or ship first
      }
      const d = Math.hypot(dx, dy);
      const step = s.speed * dt;
      if (time - s.t0 >= s.boost && d <= Math.max(step, 18)) {
        // hit
        if (s.kind === 'rocket') this.rocketBlast(tx, ty, time);
        else {
          this.sparks.emitParticleAt(tx, ty, s.kind === 'bullet' ? 2 : 10);
          if (s.kind !== 'bullet') this.smoke.emitParticleAt(tx, ty, 2);
        }
        s.foe.hurt(S.dmg, time);
        return false;
      }
      s.x += (dx / d) * step;
      s.y += (dy / d) * step;
      s.trail.push([s.x, s.y]);
      if (s.trail.length > 6) s.trail.shift();
      if (s.kind === 'rocket' && Math.random() < 0.6) this.smoke.emitParticleAt(s.x, s.y, 1);
      this.drawShot(g, s, dx / d, dy / d);
      return time - s.t0 < 12000;
    });
  }

  drawShot(g, s, ux, uy) {
    if (s.kind === 'bullet') {
      g.lineStyle(2, 0xffe27a, 1);
      g.lineBetween(s.x - ux * 14, s.y - uy * 14, s.x, s.y);
    } else if (s.kind === 'shell') {
      g.fillStyle(0xffa64d, 0.5);
      g.fillCircle(s.x, s.y, 7);
      g.fillStyle(0xfff0c0, 1);
      g.fillCircle(s.x, s.y, 3.5);
    } else if (s.kind === 'bomb') {
      g.fillStyle(0x2f3336, 1);
      g.fillEllipse(s.x, s.y, 9, 16);
    } else {
      // rocket: a white body with a flame behind it
      g.fillStyle(0xff8a2a, 0.9);
      g.fillCircle(s.x - ux * 12, s.y - uy * 12, 5);
      g.lineStyle(5, 0xf2f2f2, 1);
      g.lineBetween(s.x - ux * 12, s.y - uy * 12, s.x + ux * 4, s.y + uy * 4);
    }
  }

  // A rocket hitting a monster: a fireball, a shock ring, lots of sparks and smoke, and a small shake.
  rocketBlast(x, y, time) {
    this.blasts.push({ x, y, t0: time });
    this.sparks.emitParticleAt(x, y, 50);
    for (let k = 0; k < 10; k++) this.smoke.emitParticleAt(x + rand(-45, 45), y + rand(-30, 20), 1);
    this.scene.cameras.main.shake(140, 0.0025, true);
  }

  drawBlasts(time) {
    const g = this.g;
    this.blasts = this.blasts.filter((b) => {
      const t = (time - b.t0) / BLAST_MS;
      if (t >= 1) return false;
      const grow = 1 - (1 - t) * (1 - t); // fast at first, then slower
      const fade = 1 - t;
      // shock ring racing outwards
      g.lineStyle(6 * fade + 1, 0xfff1c8, 0.8 * fade);
      g.strokeEllipse(b.x, b.y, 50 + 300 * grow, 25 + 150 * grow);
      // the fireball: dark orange outside, yellow, then a white-hot middle that goes first
      g.fillStyle(0xff5a1a, 0.75 * fade);
      g.fillCircle(b.x, b.y, 28 + 84 * grow);
      g.fillStyle(0xffb030, 0.9 * fade);
      g.fillCircle(b.x, b.y, 20 + 58 * grow);
      g.fillStyle(0xfff6d8, Math.max(0, 1 - t * 2.2));
      g.fillCircle(b.x, b.y, 12 + 34 * grow);
      return true;
    });
  }

  // A monster's death: a big flash, sparks and smoke all over it, and a hard shake.
  explode(x, y, w = 260, h = 80) {
    const scene = this.scene;
    scene.cameras.main.shake(900, 0.012, true);
    this.flashes ||= [];
    this.flashes.push({ x, y, t0: scene.time.now });
    for (let k = 0; k < 14; k++) {
      scene.time.delayedCall(k * 70, () => {
        this.sparks.emitParticleAt(x + rand(-w, w), y + rand(-h, h), 14);
        this.smoke.emitParticleAt(x + rand(-w * 0.85, w * 0.85), y + rand(-h * 0.75, h * 0.75), 4);
      });
    }
  }

  drawFlashes(time) {
    if (!this.flashes?.length) return;
    const g = this.g;
    this.flashes = this.flashes.filter((f) => {
      const t = (time - f.t0) / 1200;
      if (t >= 1) return false;
      g.fillStyle(0xfff3c4, 0.9 * (1 - t));
      g.fillCircle(f.x, f.y, 120 + 380 * t);
      g.fillStyle(0xff8a2a, 0.7 * (1 - t));
      g.fillCircle(f.x, f.y, 80 + 220 * t);
      return true;
    });
  }
}

// The health bar above a monster.
export function healthBar(g, cx, top, hp, max) {
  const w = 220;
  const x0 = cx - w / 2;
  const y0 = top - 22;
  g.fillStyle(0x000000, 0.55);
  g.fillRect(x0 - 3, y0 - 3, w + 6, 16);
  g.fillStyle(0xff3b30, 1);
  g.fillRect(x0, y0, w, 10);
  g.fillStyle(0x34c759, 1);
  g.fillRect(x0, y0, w * Math.max(0, hp / max), 10);
}
