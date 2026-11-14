import { DEPTH, GROUND } from '../constants.js';
import { toWorld } from '../iso.js';
import { footprintPlacement } from '../world/BuildingView.js';
import { pick, rand } from '../rng.js';

// Earthquake, tornado, tsunami, meteor, volcano and black hole. Only one at a time. Ruined buildings stay ruined until Repair.
export class Disasters {
  constructor(scene, world, { people, traffic, services }) {
    this.scene = scene;
    this.world = world;
    this.people = people;
    this.traffic = traffic;
    this.services = services;
    this.current = null;
    this.draw = scene.add.graphics().setDepth(DEPTH.AIR - 3);
  }

  get busy() {
    return !!this.current;
  }

  // The meteor and the volcano wait for a tap on the map: returns true if the tap was used for it.
  tap(sq) {
    if (!this.current?.aiming) return false;
    this.current.aim(sq[0] + 0.5, sq[1] + 0.5);
    return true;
  }

  start(kind) {
    if (this.current) return false;
    const make = { earthquake: Earthquake, tornado: Tornado, tsunami: Tsunami, meteor: Meteor, volcano: Volcano, blackhole: BlackHole }[kind];
    if (!make) return false;
    this.current = new make(this);
    this.scene.events.emit('disaster', true);
    return true;
  }

  // End the disaster right now. What it already broke stays broken.
  stop() {
    if (!this.current) return false;
    this.current.stop?.();
    this.current = null;
    this.draw.clear();
    this.scene.events.emit('disaster', false);
    return true;
  }

  // Fix every ruined building and put out every fire.
  repair() {
    if (this.current) return -1;
    this.services.extinguishAll();
    return this.world.repairAll();
  }

  update(time, dt) {
    if (this.current && this.current.update(time, dt)) {
      this.current = null;
      this.draw.clear();
      this.scene.events.emit('disaster', false);
    }
  }

  // ---------- shared helpers ----------

  // The part of the map with buildings and roads (in squares), or the middle of the map if it's empty.
  cityBounds() {
    const w = this.world;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const add = (x, y, x2 = x + 1, y2 = y + 1) => {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x2);
      y1 = Math.max(y1, y2);
    };
    for (const b of w.buildings.values()) add(b.x, b.y, b.x + b.w, b.y + b.d);
    for (let k = 0; k < w.road.length; k++) if (w.road[k]) add(k % w.size, (k / w.size) | 0);
    if (x0 === Infinity) {
      const m = w.size / 2;
      return { x0: m - 10, y0: m - 10, x1: m + 10, y1: m + 10 };
    }
    return { x0, y0, x1, y1 };
  }

  // People, cars, zombies and soldiers within r squares of (x, y): in a circle, or with square = true in the
  // square 2r x 2r round it.
  near(x, y, r, square = false) {
    const inside = square ? (px, py) => Math.abs(px - x) < r && Math.abs(py - y) < r : (px, py) => Math.hypot(px - x, py - y) < r;
    const out = [];
    for (const p of this.people.list) if (!p.leaving && inside(p.mover.px, p.mover.py)) out.push({ kind: 'person', a: p });
    for (const c of this.traffic.cars) if (!c.leaving && inside(c.mover.px, c.mover.py)) out.push({ kind: 'car', a: c });
    for (const z of this.zombies?.list || []) if (!z.dead && inside(z.x, z.y)) out.push({ kind: 'zombie', a: z });
    for (const s of this.military?.soldiers.list || []) if (!s.dead && inside(s.mover.px, s.mover.py)) out.push({ kind: 'soldier', a: s });
    return out;
  }

  // Takes it out of its list and hands back its picture (or null), for the disaster to carry off.
  take(t) {
    if (t.kind === 'person') return this.people.take(t.a);
    if (t.kind === 'zombie') return this.zombies.take(t.a);
    if (t.kind === 'soldier') return this.military.soldiers.take(t.a);
    this.military?.lostCar(t.a);
    return this.traffic.take(t.a);
  }

  // Buildings whose footprint is within r squares of (x, y).
  buildingsNear(x, y, r) {
    const out = [];
    for (const b of this.world.buildings.values()) {
      const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
      const dy = Math.max(b.y - y, 0, y - (b.y + b.d));
      if (Math.hypot(dx, dy) <= r) out.push(b);
    }
    return out;
  }
}

// ---------- earthquake ----------

const QUAKE_MS = 7500;

class Earthquake {
  constructor(d) {
    this.d = d;
    const scene = d.scene;
    this.t0 = scene.time.now;
    this.nextShake = 0;

    // a third to a half of the buildings fall down at random moments during the quake
    const list = [...d.world.buildings.values()].filter((b) => !b.ruined && b.def.menu !== 'Decoration');
    const n = Math.round(list.length * rand(1 / 3, 1 / 2));
    this.falls = [];
    for (let k = 0; k < n && list.length; k++) {
      const b = list.splice(Math.floor(Math.random() * list.length), 1)[0];
      this.falls.push({ b, at: this.t0 + rand(800, QUAKE_MS - 1200) });
    }
  }

  update(time) {
    const t = time - this.t0;
    const cam = this.d.scene.cameras.main;
    if (t < QUAKE_MS && time > this.nextShake) {
      // stronger in the middle of the quake
      const k = Math.sin(Math.PI * Math.min(1, t / QUAKE_MS));
      cam.shake(320, 0.0015 + 0.0045 * k, true);
      this.nextShake = time + 300;
    }
    for (const f of this.falls) {
      if (!f.done && time > f.at) {
        f.done = true;
        this.d.world.ruinBuilding(f.b);
      }
    }
    return t > QUAKE_MS;
  }

  stop() {
    this.d.scene.cameras.main.shakeEffect.reset();
  }
}

// ---------- tornado ----------

const TWISTER_SPEED = 1.7; // squares per second
const TWISTER_STAY = 15000; // ms it wanders around the city
const TWISTER_R = 1.1; // squares: buildings this close are ruined
const SUCK_R = 1.8; // squares: people and cars this close are sucked up
const TWISTER_SIZE = 4.5; // how big it looks (it only damages within TWISTER_R)

class Tornado {
  constructor(d) {
    this.d = d;
    const box = d.cityBounds();
    this.box = box;
    const N = d.world.size;
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    // come in from a random direction, from well outside the city
    const a = rand(0, Math.PI * 2);
    const far = Math.max(box.x1 - box.x0, box.y1 - box.y0) / 2 + 14;
    this.x = Math.max(1, Math.min(N - 1, cx + Math.cos(a) * far));
    this.y = Math.max(1, Math.min(N - 1, cy + Math.sin(a) * far));
    this.target = { x: cx, y: cy };
    this.state = 'in';
    this.t0 = d.scene.time.now;
    this.alpha = 0;
    this.carried = [];
  }

  update(time, dt) {
    const d = this.d;
    const N = d.world.size;
    // move
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = TWISTER_SPEED * dt;
    if (dist <= step) {
      this.x = this.target.x;
      this.y = this.target.y;
      if (this.state === 'in') {
        this.state = 'stay';
        this.until = time + TWISTER_STAY;
      }
      if (this.state === 'stay') {
        if (time > this.until) {
          this.state = 'out';
          const a = rand(0, Math.PI * 2);
          const far = Math.max(this.box.x1 - this.box.x0, this.box.y1 - this.box.y0) / 2 + 14;
          this.target = { x: Math.max(1, Math.min(N - 1, this.x + Math.cos(a) * far)), y: Math.max(1, Math.min(N - 1, this.y + Math.sin(a) * far)) };
        } else {
          const b = this.box;
          this.target = { x: rand(b.x0 - 1, b.x1 + 1), y: rand(b.y0 - 1, b.y1 + 1) };
        }
      } else if (this.state === 'out') {
        this.state = 'fade';
      }
    } else {
      // a little wobble so the path isn't a straight line
      const wob = Math.sin(time / 400) * 0.6;
      this.x += (dx / dist) * step + (-dy / dist) * wob * dt;
      this.y += (dy / dist) * step + (dx / dist) * wob * dt;
    }
    this.alpha = this.state === 'fade' ? Math.max(0, this.alpha - dt / 1.5) : Math.min(1, this.alpha + dt / 1.2);

    // damage
    if (this.alpha > 0.6) {
      for (const b of d.buildingsNear(this.x, this.y, TWISTER_R)) d.world.ruinBuilding(b);
      for (const t of d.near(this.x, this.y, SUCK_R)) {
        const sprite = d.take(t);
        if (sprite) this.carried.push({ sprite, t0: time, a: rand(0, Math.PI * 2) });
      }
    }

    this.render(time);
    return this.state === 'fade' && this.alpha <= 0 && !this.carried.length;
  }

  stop() {
    for (const c of this.carried) c.sprite.destroy();
    this.carried = [];
  }

  render(time) {
    const g = this.d.draw;
    g.clear();
    const p = toWorld(this.x, this.y);
    const al = this.alpha;
    const t = time / 1000;
    const S = TWISTER_SIZE;
    const H = 200 * S; // funnel height, px
    const RINGS = 44;
    // radius at height f (0 = ground, 1 = top): narrow at the bottom, opening wide at the top
    const radius = (f) => (7 + f * 17 * 1.2 + (f * 17) ** 2 * 0.22) * S;
    const sway = (f) => Math.sin(t * 1.6 + f * 6) * f * 16 * S;
    // dust swirling at the bottom
    g.fillStyle(0x9b8a70, 0.35 * al);
    g.fillEllipse(p.x, p.y, (90 + Math.sin(t * 5) * 6) * S, 30 * S);
    // the funnel: stacked rings, swaying
    for (let k = 0; k < RINGS; k++) {
      const f = k / (RINGS - 1);
      const r = radius(f);
      const shade = k % 2 ? 0x8d929b : 0xa3a8b0;
      g.fillStyle(shade, (0.72 - f * 0.2) * al);
      g.fillEllipse(p.x + sway(f), p.y - f * H, r * 2, Math.max(6, r * 0.55));
    }
    // bits of debris flying around
    g.fillStyle(0x4a4038, 0.9 * al);
    for (let i = 0; i < 70; i++) {
      const f = ((i * 53) % 97) / 97;
      const r = radius(f) + 6 * S;
      const ang = t * (5 - f * 2.5) + i * 2.4;
      g.fillRect(p.x + sway(f) + Math.cos(ang) * r, p.y - f * H + Math.sin(ang) * r * 0.28, 2 * S, 1.5 * S);
    }

    // people and cars spiral up into the funnel and are gone
    this.carried = this.carried.filter((c) => {
      const k = Math.min(1, (time - c.t0) / 2200);
      const ang = c.a + k * 14;
      const r = radius(k * 0.8) * (1 - k * 0.3);
      c.sprite.setPosition(p.x + sway(k * 0.8) + Math.cos(ang) * r, p.y - k * 0.8 * H + Math.sin(ang) * r * 0.3)
        .setDepth(DEPTH.AIR - 2).setAlpha(1 - k * k).setScale(1 - k * 0.5).setAngle(k * 720);
      if (k >= 1) {
        c.sprite.destroy();
        return false;
      }
      return true;
    });
  }
}

// ---------- tsunami ----------

const WAVE_SPEED = 3.6; // squares per second
const WAVE_H = 210; // height of the wave out at sea, px
const WAVE_BACK = 2.6; // squares from the crest down to the water behind it (how thick the wave looks)
const WAVE_LEAN = 0.55; // squares the crest leans out over its front
const INLAND = 30; // squares it can travel over land, getting smaller every square

class Tsunami {
  constructor(d) {
    this.d = d;
    const w = d.world;
    const N = w.size;
    // the side with the most sea along its edge (the wave comes from beyond the map if there is none)
    const sides = [
      { axis: 'x', dir: 1 }, { axis: 'x', dir: -1 }, { axis: 'y', dir: 1 }, { axis: 'y', dir: -1 },
    ].map((s) => {
      let water = 0;
      for (let l = 0; l < N; l++) for (let a = 0; a < 6; a++) if (this.ground(s, s.dir > 0 ? a : N - 1 - a, l) === GROUND.WATER) water++;
      return { ...s, water: water + Math.random() * N };
    });
    sides.sort((a, b) => b.water - a.water);
    this.side = sides[0];
    const start = this.side.dir > 0 ? -2 : N + 2;
    this.lanes = [];
    for (let l = 0; l < N; l++) this.lanes.push({ front: start, start, land: 0, done: false, last: null });
    this.state = 'run';
    this.alpha = 1;
    // spray blown off the crest, drifting back over the wave
    const ahead = toWorld(...this.sq(this.side, this.side.dir, 0));
    const zero = toWorld(0, 0);
    this.ahead = { x: (ahead.x - zero.x) / 72, y: (ahead.y - zero.y) / 72 }; // screen direction the wave moves in
    this.spray = d.scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 900, max: 1600 }, tint: 0xffffff,
      speedX: { onEmit: () => -this.ahead.x * rand(40, 90) + rand(-25, 25) },
      speedY: { onEmit: () => -this.ahead.y * rand(40, 90) - rand(40, 110) },
      gravityY: 70, scale: { start: 1.4, end: 4 }, alpha: { start: 0.85, end: 0 }, emitting: false,
    }).setDepth(DEPTH.AIR - 2);
  }

  // Square at distance `along` the wave's way, in lane `l`, as map coordinates.
  sq(s, along, l) {
    return s.axis === 'x' ? [along, l] : [l, along];
  }

  ground(s, along, l) {
    const w = this.d.world;
    const [i, j] = this.sq(s, along, l);
    return w.inBounds(i, j) ? w.ground[w.idx(i, j)] : GROUND.WATER;
  }

  height(lane) {
    return WAVE_H * Math.max(0, 1 - lane.land / INLAND);
  }

  update(time, dt) {
    const d = this.d;
    const w = d.world;
    const s = this.side;
    const N = w.size;
    if (this.state === 'run') {
      let running = 0;
      for (let l = 0; l < N; l++) {
        const lane = this.lanes[l];
        if (lane.done) continue;
        running++;
        lane.front += s.dir * WAVE_SPEED * dt;
        const along = Math.floor(s.dir > 0 ? lane.front : lane.front - 1e-6);
        if (along === lane.last) continue;
        lane.last = along;
        if (along < 0 || along >= N) {
          if ((s.dir > 0 && along >= N) || (s.dir < 0 && along < 0)) lane.done = true;
          continue;
        }
        if (this.ground(s, along, l) !== GROUND.WATER) lane.land++;
        if (lane.land >= INLAND) {
          lane.done = true;
          continue;
        }
        const [i, j] = this.sq(s, along, l);
        if (this.height(lane) > 6) {
          d.world.ruinBuilding(w.buildingAt(i, j));
          for (const t of d.near(i + 0.5, j + 0.5, 0.8)) {
            const sprite = d.take(t);
            if (sprite) d.scene.tweens.add({ targets: sprite, alpha: 0, y: sprite.y + 20, duration: 700, onComplete: () => sprite.destroy() });
          }
        }
      }
      if (!running) this.state = 'recede';
    } else {
      this.alpha -= dt / 2.5;
    }
    this.render(time);
    if (this.alpha > 0) return false;
    this.spray.destroy();
    return true;
  }

  stop() {
    this.spray.destroy();
  }

  render(time) {
    const g = this.d.draw;
    g.clear();
    const s = this.side;
    const N = this.d.world.size;
    const P = (along, l) => {
      const [x, y] = s.axis === 'x' ? [along, l] : [l, along];
      return toWorld(x, y);
    };
    const up = (q, h) => ({ x: q.x, y: q.y - h });
    const al = this.alpha;
    const t = time / 1000;
    const lanes = this.lanes;

    // flooded water behind the wave
    g.fillStyle(0x3f8fd8, 0.38 * al);
    for (let l = 0; l < N; l++) {
      const lane = lanes[l];
      g.fillPoints([P(lane.start, l), P(lane.start, l + 1), P(lane.front, l + 1), P(lane.front, l)], true);
    }

    // the tail: rows of foam left behind the wave, fading out
    for (let k = 1; k <= 6; k++) {
      g.lineStyle(k < 3 ? 3 : 2, 0xf2fbff, 0.6 * (1 - k / 7) * al);
      for (let l = 0; l < N; l++) {
        const lane = lanes[l];
        const back = lane.front - s.dir * (WAVE_BACK + k * 1.1 + 0.4 * Math.sin(t * 2 + l * 0.7 + k));
        if ((back - lane.start) * s.dir < 0) continue;
        const a = P(back + 0.15 * Math.sin(l * 1.3 + k), l);
        const b = P(back + 0.15 * Math.sin((l + 1) * 1.3 + k), l + 1);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    if (this.state !== 'run') return;

    // the wave: a long slope at the back, a steep face at the front leaning forward, foam on the crest.
    // Whatever is nearer the viewer is drawn last.
    const towardViewer = this.ahead.y > 0;
    const slope = (l, lane, h) => {
      const c1 = up(P(lane.front + s.dir * WAVE_LEAN, l), h);
      const c2 = up(P(lane.front + s.dir * WAVE_LEAN, l + 1), h);
      const b1 = P(lane.front - s.dir * WAVE_BACK, l);
      const b2 = P(lane.front - s.dir * WAVE_BACK, l + 1);
      g.fillStyle(0x3d8ad8, 0.92);
      g.fillPoints([b1, b2, c2, c1], true);
      // a lighter band just behind the crest
      const m1 = up(P(lane.front - s.dir * WAVE_BACK * 0.35, l), h * 0.62);
      const m2 = up(P(lane.front - s.dir * WAVE_BACK * 0.35, l + 1), h * 0.62);
      g.fillStyle(0x62a8ec, 0.9);
      g.fillPoints([m1, m2, c2, c1], true);
    };
    const face = (l, lane, h) => {
      const a = P(lane.front, l);
      const b = P(lane.front, l + 1);
      const c1 = up(P(lane.front + s.dir * WAVE_LEAN, l), h);
      const c2 = up(P(lane.front + s.dir * WAVE_LEAN, l + 1), h);
      const mid1 = { x: (a.x + c1.x) / 2, y: (a.y + c1.y) / 2 };
      const mid2 = { x: (b.x + c2.x) / 2, y: (b.y + c2.y) / 2 };
      g.fillStyle(0x16508f, 0.95);
      g.fillPoints([a, b, mid2, mid1], true);
      g.fillStyle(0x2468b4, 0.95);
      g.fillPoints([mid1, mid2, c2, c1], true);
    };
    const live = [];
    for (let l = 0; l < N; l++) {
      const lane = lanes[l];
      const h = lane.done ? 0 : this.height(lane);
      if (h >= 3) live.push([l, lane, h]);
    }
    for (const [l, lane, h] of live) (towardViewer ? slope : face)(l, lane, h);
    for (const [l, lane, h] of live) (towardViewer ? face : slope)(l, lane, h);

    // foam on the crest: a white band with lumps that bubble, and spray blowing off it
    for (const [l, lane, h] of live) {
      const c1 = up(P(lane.front + s.dir * WAVE_LEAN, l), h);
      const c2 = up(P(lane.front + s.dir * WAVE_LEAN, l + 1), h);
      const band = Math.max(4, h * 0.09);
      g.fillStyle(0xf4fbff, 0.97);
      g.fillPoints([c1, c2, { x: c2.x, y: c2.y + band }, { x: c1.x, y: c1.y + band }], true);
      for (let k = 0; k < 2; k++) {
        const f = (k + 0.5) / 2;
        const r = Math.max(2.5, h * 0.045) * (0.8 + 0.4 * Math.sin(t * 6 + l * 1.7 + k * 2));
        g.fillCircle(c1.x + (c2.x - c1.x) * f, c1.y + (c2.y - c1.y) * f - r * 0.4, r);
      }
      if (Math.random() < 0.12 * Math.min(1, h / 60)) this.spray.emitParticleAt(c1.x + rand(-8, 8), c1.y, 1);
    }
  }
}

// ---------- meteor ----------

const FALL_MS = 1700; // from the sky to the ground
const METEOR_R = 75; // size of the rock, px
const RUIN_SIZE = 15; // squares: everything in this square around the impact is ruined
const FIRE_SIZE = 25; // squares: buildings in this square around the impact catch fire
const FIRE_BURN_OUT = 75000; // ms: a fire nobody puts out by then ruins its building

class Meteor {
  constructor(d) {
    this.d = d;
    this.state = 'aim';
    this.smoke = d.scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 900, max: 1600 }, speed: { min: 5, max: 25 }, tint: 0x3a3330,
      scale: { start: 3, end: 7 }, alpha: { start: 0.7, end: 0 }, emitting: false,
    }).setDepth(DEPTH.AIR - 4);
  }

  get aiming() {
    return this.state === 'aim';
  }

  // Where it will hit, in squares. It comes in from high up on the right.
  aim(x, y) {
    this.x = x;
    this.y = y;
    this.hit = toWorld(x, y);
    this.from = { x: this.hit.x + 1100, y: this.hit.y - 1700 };
    this.state = 'fall';
    this.t0 = this.d.scene.time.now;
  }

  update(time) {
    if (this.state === 'aim') return false;
    const t = (time - this.t0) / FALL_MS;
    if (this.state === 'fall' && t >= 1) this.impact(time);
    this.render(time);
    if (this.state === 'after' && time - this.t1 > 1600) {
      this.smoke.destroy();
      return true;
    }
    return false;
  }

  impact(time) {
    const d = this.d;
    const w = d.world;
    this.state = 'after';
    this.t1 = time;
    d.scene.cameras.main.shake(1300, 0.018, true);
    // everything in the 15 x 15 square is ruined; people, vehicles, zombies and soldiers there are gone
    const half = RUIN_SIZE / 2;
    const inside = (b, h) => b.x < this.x + h && b.x + b.w > this.x - h && b.y < this.y + h && b.y + b.d > this.y - h;
    for (const b of [...w.buildings.values()]) if (inside(b, half)) w.ruinBuilding(b);
    for (const t of d.near(this.x, this.y, half, true)) {
      const sprite = d.take(t);
      if (sprite) d.scene.tweens.add({ targets: sprite, alpha: 0, duration: 300, onComplete: () => sprite.destroy() });
    }
    // buildings in the 25 x 25 square around it catch fire
    for (const b of w.buildings.values()) if (!b.ruined && inside(b, FIRE_SIZE / 2)) d.services.ignite(b, time, FIRE_BURN_OUT);
    // dust and smoke over the whole hit area
    for (let k = 0; k < 40; k++) {
      const p = toWorld(this.x + rand(-half, half), this.y + rand(-half, half));
      this.smoke.emitParticleAt(p.x, p.y - 20, 1);
    }
  }

  stop() {
    this.smoke.destroy();
  }

  render(time) {
    const g = this.d.draw;
    g.clear();
    const hit = this.hit;
    if (this.state === 'fall') {
      const t = Math.min(1, (time - this.t0) / FALL_MS);
      const k = t * t; // speeding up
      const x = this.from.x + (hit.x - this.from.x) * k;
      const y = this.from.y + (hit.y - this.from.y) * k;
      const dx = hit.x - this.from.x;
      const dy = hit.y - this.from.y;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      // its shadow on the ground, getting darker as it comes closer
      g.fillStyle(0x000000, 0.12 + 0.3 * t);
      g.fillEllipse(hit.x, hit.y, METEOR_R * (1 + t) * 2.2, METEOR_R * (1 + t) * 0.9);
      // the burning tail
      const tail = 420 + 300 * t;
      const tx = x - ux * tail;
      const ty = y - uy * tail;
      for (const [r, col, al] of [[1.5, 0xff6a18, 0.45], [1.05, 0xffa33a, 0.6], [0.6, 0xffe08a, 0.75]]) {
        g.fillStyle(col, al);
        g.fillTriangle(x - uy * METEOR_R * r, y + ux * METEOR_R * r, x + uy * METEOR_R * r, y - ux * METEOR_R * r, tx, ty);
      }
      // glow and rock
      g.fillStyle(0xff8a2a, 0.5);
      g.fillCircle(x, y, METEOR_R * 1.45);
      g.fillStyle(0x4f3627, 1);
      g.fillCircle(x, y, METEOR_R);
      g.fillStyle(0x6e4d38, 1);
      g.fillCircle(x - METEOR_R * 0.25, y - METEOR_R * 0.25, METEOR_R * 0.55);
      g.fillStyle(0x3a281d, 1);
      g.fillCircle(x + METEOR_R * 0.3, y + METEOR_R * 0.15, METEOR_R * 0.2);
      g.fillCircle(x - METEOR_R * 0.35, y + METEOR_R * 0.35, METEOR_R * 0.13);
      g.fillStyle(0xffc060, 0.9); // glowing front edge
      g.fillCircle(x + ux * METEOR_R * 0.55, y + uy * METEOR_R * 0.55, METEOR_R * 0.35);
      if (Math.random() < 0.7) this.smoke.emitParticleAt(x - ux * METEOR_R, y - uy * METEOR_R, 1);
      return;
    }
    // the impact: a flash and a ring of dust racing outwards
    const t = Math.min(1, (time - this.t1) / 1600);
    const flashR = 900 * Math.min(1, t * 3);
    g.fillStyle(0xfff3c4, 0.85 * Math.max(0, 1 - t * 2.2));
    g.fillEllipse(hit.x, hit.y, flashR * 2, flashR);
    const ringR = (RUIN_SIZE / 2) * 64 * 1.5 * t;
    g.lineStyle(26 * (1 - t) + 2, 0xd8c7a8, 0.8 * (1 - t));
    g.strokeEllipse(hit.x, hit.y, ringR * 2, ringR);
    g.fillStyle(0xff7a1a, 0.6 * (1 - t));
    g.fillEllipse(hit.x, hit.y, 260 * (1 - t * 0.5), 120 * (1 - t * 0.5));
  }
}

// ---------- volcano ----------

const RISE_MS = 1800; // the volcano pushes up out of the ground
const ERUPT_MS = 13000; // fire balls and smoke
const SINK_MS = 2200; // then it sinks back into the ground
const VOLCANO_FIRE = 25; // squares: buildings in this square around it catch fire (hit by fire balls)
const VOLCANO_SIZE = 8; // squares the picture covers (assets/disaster/volcano-8x8.png)
const CRATER = { px: 510, py: 142 }; // the crater in the picture's own pixels

class Volcano {
  constructor(d) {
    this.d = d;
    this.state = 'aim';
    this.balls = [];
    const scene = d.scene;
    this.plume = scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 2500, max: 4000 }, speedY: { min: -110, max: -60 }, speedX: { min: -30, max: 30 },
      scale: { start: 4, end: 12 }, alpha: { start: 0.8, end: 0 }, tint: 0x3b3431, emitting: false,
    }).setDepth(DEPTH.AIR - 4);
    this.sparks = scene.add.particles(0, 0, 'fx_flame', {
      lifespan: { min: 300, max: 600 }, speed: { min: 40, max: 140 }, angle: { min: 200, max: 340 },
      gravityY: 250, scale: { start: 1.8, end: 0.3 }, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(DEPTH.AIR - 2);
  }

  get aiming() {
    return this.state === 'aim';
  }

  aim(x, y) {
    const d = this.d;
    const scene = d.scene;
    const time = scene.time.now;
    this.x = x;
    this.y = y;
    const half = VOLCANO_SIZE / 2;
    const place = footprintPlacement(x - half, y - half, VOLCANO_SIZE, VOLCANO_SIZE);
    if (scene.textures.exists('volcano')) {
      const tex = scene.textures.get('volcano').source[0];
      const scale = place.width / tex.width;
      // drawn over the buildings and roads under it while it is there
      this.im = scene.add.image(place.left, place.tipY, 'volcano').setOrigin(0, 1).setScale(scale, 0)
        .setDepth(DEPTH.AIR - 7);
      this.crater = { x: place.left + CRATER.px * scale, y: place.tipY - (tex.height - CRATER.py) * scale };
      this.scale = scale;
    } else {
      const c = toWorld(x, y);
      this.crater = { x: c.x, y: c.y - 300 };
    }
    this.state = 'rise';
    this.t0 = time;

    // every building in the 25 x 25 square around it is hit by a fire ball some time during the eruption
    const w = d.world;
    const h = VOLCANO_FIRE / 2;
    for (const b of w.buildings.values()) {
      if (b.ruined || b.def.menu === 'Decoration') continue;
      if (b.x >= x + h || b.x + b.w <= x - h || b.y >= y + h || b.y + b.d <= y - h) continue;
      this.launch(time + RISE_MS + rand(300, ERUPT_MS - 3000), b.x + b.w / 2, b.y + b.d / 2, b);
    }
    // and plenty more that just land somewhere around it
    for (let k = 0; k < 45; k++) {
      this.launch(time + RISE_MS + rand(0, ERUPT_MS - 2500), x + rand(-h, h), y + rand(-h, h), null);
    }
  }

  // A fire ball leaving the crater at time `at`, landing on square point (lx, ly) (setting `target` on fire).
  launch(at, lx, ly, target) {
    const land = toWorld(lx, ly);
    this.balls.push({ at, land, target, flight: rand(1300, 2300), arc: rand(260, 520), r: rand(6, 11), trail: [] });
  }

  update(time) {
    const d = this.d;
    if (this.state === 'aim') return false;
    const t = time - this.t0;
    if (this.state === 'rise') {
      if (this.im) this.im.setScale(this.scale, this.scale * Math.min(1, t / RISE_MS));
      if (time > (this.nextShake || 0)) {
        d.scene.cameras.main.shake(320, 0.003, true);
        this.nextShake = time + 300;
      }
      if (t >= RISE_MS) this.state = 'erupt';
    } else if (this.state === 'erupt') {
      if (time > this.nextShake) {
        d.scene.cameras.main.shake(320, 0.003 + 0.003 * Math.random(), true);
        this.nextShake = time + 300;
      }
      this.plume.emitParticleAt(this.crater.x + rand(-14, 14), this.crater.y - 10, 2);
      if (Math.random() < 0.5) this.sparks.emitParticleAt(this.crater.x + rand(-20, 20), this.crater.y, 2);
      if (t >= RISE_MS + ERUPT_MS) {
        this.state = 'sink';
        this.t1 = time;
      }
    } else if (this.state === 'sink') {
      const k = Math.min(1, (time - this.t1) / SINK_MS);
      if (this.im) this.im.setScale(this.scale, this.scale * (1 - k)).setAlpha(1 - k * 0.5);
      if (k >= 1 && !this.balls.length) {
        this.stop();
        return true;
      }
    }
    this.render(time);
    return false;
  }

  render(time) {
    const g = this.d.draw;
    g.clear();
    const c = this.crater;
    this.balls = this.balls.filter((b) => {
      if (time < b.at) return true;
      const k = (time - b.at) / b.flight;
      if (k >= 1) {
        // landing: a burst of sparks, and the building it hit catches fire
        this.sparks.emitParticleAt(b.land.x, b.land.y, 10);
        if (b.target) this.d.services.ignite(b.target, time, FIRE_BURN_OUT);
        return false;
      }
      const x = c.x + (b.land.x - c.x) * k;
      const y = c.y + (b.land.y - c.y) * k - b.arc * 4 * k * (1 - k);
      b.trail.push([x, y]);
      if (b.trail.length > 7) b.trail.shift();
      b.trail.forEach(([tx, ty], n) => {
        g.fillStyle(0xff7a1a, 0.15 + 0.08 * n);
        g.fillCircle(tx, ty, b.r * (0.4 + n * 0.08));
      });
      g.fillStyle(0xff8a2a, 0.55);
      g.fillCircle(x, y, b.r * 1.7);
      g.fillStyle(0xffd060, 1);
      g.fillCircle(x, y, b.r);
      g.fillStyle(0xfff4c0, 1);
      g.fillCircle(x - b.r * 0.25, y - b.r * 0.25, b.r * 0.45);
      return true;
    });
  }

  stop() {
    this.im?.destroy();
    this.plume.destroy();
    this.sparks.destroy();
    this.balls = [];
  }
}

// ---------- black hole ----------

const HOLE_GROW_MS = 22000; // it grows, and its reach with it
const HOLE_HOLD_MS = 4000; // full size
const HOLE_CLOSE_MS = 1800; // it shrinks to nothing and is gone
const HOLE_LOOK = [0.5, 6]; // squares wide it looks: from small to 6 x 6
const HOLE_REACH = [1, 30]; // squares: it destroys everything in this square round it, from 1 x 1 to 30 x 30
const HOLE_LIFT = 0.45; // its middle floats this part of its size above the ground
const PULL_MS = [1100, 1900]; // how long a building's bits, a person or a car take to fall in

// A black hole opens over the middle of the city. It grows to 6 x 6 squares while everything in a square
// round it, from 1 x 1 out to 30 x 30, is ruined, and people, vehicles, zombies and soldiers there are
// pulled in and gone. Then it closes.
class BlackHole {
  constructor(d) {
    this.d = d;
    const box = d.cityBounds();
    this.x = (box.x0 + box.x1) / 2;
    this.y = (box.y0 + box.y1) / 2;
    this.t0 = d.scene.time.now;
    this.carried = []; // pictures being pulled in
    this.bits = []; // bits of ruined buildings being pulled in
    this.nextCheck = 0;
    this.nextShake = 0;
    this.look = 0;
    this.front = d.scene.add.graphics().setDepth(DEPTH.AIR - 2); // its black middle and the front of its disk
  }

  update(time) {
    const d = this.d;
    const t = time - this.t0;
    const grow = Math.min(1, t / HOLE_GROW_MS);
    const closing = t > HOLE_GROW_MS + HOLE_HOLD_MS;
    const shut = closing ? Math.min(1, (t - HOLE_GROW_MS - HOLE_HOLD_MS) / HOLE_CLOSE_MS) : 0;
    // it opens fast and grows slower and slower
    this.look = (HOLE_LOOK[0] + (HOLE_LOOK[1] - HOLE_LOOK[0]) * (1 - (1 - grow) ** 2)) * (1 - shut * shut) * Math.min(1, t / 600);
    if (!closing && time > this.nextCheck) {
      this.nextCheck = time + 100;
      this.pull(time, (HOLE_REACH[0] + (HOLE_REACH[1] - HOLE_REACH[0]) * grow) / 2);
    }
    if (!closing && time > this.nextShake) {
      d.scene.cameras.main.shake(420, 0.0015 + 0.004 * grow, true);
      this.nextShake = time + 400;
    }
    this.render(time);
    const done = shut >= 1 && !this.carried.length && !this.bits.length;
    if (done) this.front.destroy();
    return done;
  }

  // Everything within h squares (a square box) of its middle is ruined or pulled in.
  pull(time, h) {
    const d = this.d;
    const w = d.world;
    for (const b of [...w.buildings.values()]) {
      if (b.ruined || b.x >= this.x + h || b.x + b.w <= this.x - h || b.y >= this.y + h || b.y + b.d <= this.y - h) continue;
      w.ruinBuilding(b);
      // bits of it fly off into the hole
      const n = Math.min(24, 4 + b.w * b.d * 2);
      for (let k = 0; k < n; k++) {
        const p = toWorld(b.x + rand(0, b.w), b.y + rand(0, b.d));
        this.bits.push(this.falling(p.x, p.y - rand(0, 60), time, { size: rand(2, 6), col: pick([0x6b5a4c, 0x8f8578, 0x4a3f38, 0xb0a597]) }));
      }
    }
    for (const t of d.near(this.x, this.y, h, true)) {
      const sprite = d.take(t);
      if (sprite) this.carried.push(this.falling(sprite.x, sprite.y, time, { sprite }));
    }
  }

  // Something at (x, y) px starting to fall in: it circles round the hole faster and faster as it goes in.
  falling(x, y, time, extra) {
    const c = this.middle();
    const dx = x - c.x;
    const dy = (y - c.y) * 2; // the disk lies flat-ish, like the ground
    return { t0: time, ms: rand(...PULL_MS), r0: Math.max(10, Math.hypot(dx, dy)), a0: Math.atan2(dy, dx), spin: rand(4, 7), ...extra };
  }

  // Where its middle is, in world px.
  middle() {
    const p = toWorld(this.x, this.y);
    return { x: p.x, y: p.y - this.look * 64 * HOLE_LIFT * 2 };
  }

  // Where a falling thing is now: { x, y, k (0 at the start, 1 inside) }.
  place(f, time) {
    const k = Math.min(1, (time - f.t0) / f.ms);
    const c = this.middle();
    const r = f.r0 * (1 - k) ** 1.6;
    const a = f.a0 + f.spin * k * k;
    return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * 0.5, k };
  }

  stop() {
    for (const c of this.carried) c.sprite.destroy();
    this.carried = [];
    this.bits = [];
    this.front.destroy();
  }

  render(time) {
    const g = this.d.draw;
    const f = this.front;
    g.clear();
    f.clear();
    const tt = time / 1000;
    const ground = toWorld(this.x, this.y);
    const c = this.middle();
    const R = this.look * 64; // its size, px (6 squares: 384 px from its middle to its edge)
    if (R > 0) {
      // a purple shade on the ground under it
      g.fillStyle(0x1a0630, 0.35);
      g.fillEllipse(ground.x, ground.y, R * 2.6, R * 1.3);
      // a dark purple glow round it, pulsing a little
      const pulse = 1 + Math.sin(tt * 3) * 0.04;
      for (let k = 6; k >= 1; k--) {
        g.fillStyle(k > 3 ? 0x3d0f6e : 0x5b1a99, 0.07 + (6 - k) * 0.035);
        g.fillCircle(c.x, c.y, R * (0.8 + k * 0.13) * pulse);
      }
    }
    // the bits of buildings falling in (behind its black middle, so they vanish into it)
    this.bits = this.bits.filter((b) => {
      const p = this.place(b, time);
      g.fillStyle(b.col, 1 - p.k * 0.5);
      const s = b.size * (1 - p.k * 0.7);
      g.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      return p.k < 1;
    });
    // people, cars, zombies and soldiers falling in, spinning and shrinking
    this.carried = this.carried.filter((cr) => {
      const p = this.place(cr, time);
      cr.sprite.setPosition(p.x, p.y).setDepth(DEPTH.AIR - 2.5).setScale(1 - p.k * 0.8).setAngle(p.k * p.k * 900).setAlpha(1 - p.k ** 4);
      if (p.k >= 1) {
        cr.sprite.destroy();
        return false;
      }
      return true;
    });
    if (R <= 0) return;
    // the glowing disk swirling round it, tilted: its far half behind the black middle, its near half in front
    const disk = (front) => {
      const layer = front ? f : g;
      for (let i = 0; i < 140; i++) {
        const band = ((i * 37) % 100) / 100;
        const a = tt * (2.6 - band * 1.4) + i * 2.399;
        if ((Math.sin(a) >= 0) !== front) continue;
        const rr = R * (0.85 + band * 0.75);
        layer.fillStyle(band < 0.3 ? 0xe0b0ff : band < 0.65 ? 0xa64dff : 0x6a22c0, 0.85 - band * 0.5);
        layer.fillCircle(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr * 0.28, Math.max(1, R * (0.03 - band * 0.015)));
      }
    };
    disk(false);
    // the black middle with its dark purple rim
    f.fillStyle(0x4a1585, 0.95);
    f.fillCircle(c.x, c.y, R * 0.8);
    f.fillStyle(0x8a3ad8, 0.9);
    f.fillCircle(c.x, c.y, R * 0.76);
    f.fillStyle(0x07020c, 1);
    f.fillCircle(c.x, c.y, R * 0.72);
    disk(true);
  }
}
