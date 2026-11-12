import { DEPTH, GROUND } from '../constants.js';
import { toWorld } from '../iso.js';
import { pick, rand } from '../rng.js';

// Earthquake, tornado and tsunami. Only one at a time. Ruined buildings stay ruined until Repair.
export class Disasters {
  constructor(scene, world, { people, traffic }) {
    this.scene = scene;
    this.world = world;
    this.people = people;
    this.traffic = traffic;
    this.current = null;
    this.cracks = scene.add.graphics().setDepth(DEPTH.ROAD_ARM + 0.5); // above roads, under everything standing
    this.draw = scene.add.graphics().setDepth(DEPTH.AIR - 3);
  }

  get busy() {
    return !!this.current;
  }

  start(kind) {
    if (this.current) return false;
    const make = { earthquake: Earthquake, tornado: Tornado, tsunami: Tsunami }[kind];
    if (!make) return false;
    this.current = new make(this);
    this.scene.events.emit('disaster', true);
    return true;
  }

  // Fix every ruined building and close the cracks.
  repair() {
    if (this.current) return -1;
    this.cracks.clear();
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

  // People and cars within r squares of (x, y).
  near(x, y, r) {
    const out = [];
    for (const p of this.people.list) if (!p.leaving && Math.hypot(p.mover.px - x, p.mover.py - y) < r) out.push({ kind: 'person', a: p });
    for (const c of this.traffic.cars) if (!c.leaving && Math.hypot(c.mover.px - x, c.mover.py - y) < r) out.push({ kind: 'car', a: c });
    return out;
  }

  take(t) {
    return t.kind === 'person' ? this.people.take(t.a) : this.traffic.take(t.a);
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
    const box = d.cityBounds();
    this.box = box;

    // a third to a half of the buildings fall down at random moments during the quake
    const list = [...d.world.buildings.values()].filter((b) => !b.ruined && b.def.menu !== 'Decoration');
    const n = Math.round(list.length * rand(1 / 3, 1 / 2));
    this.falls = [];
    for (let k = 0; k < n && list.length; k++) {
      const b = list.splice(Math.floor(Math.random() * list.length), 1)[0];
      this.falls.push({ b, at: this.t0 + rand(800, QUAKE_MS - 1200) });
    }

    // cracks open one after another
    const area = (box.x1 - box.x0) * (box.y1 - box.y0);
    const count = Math.max(5, Math.min(18, Math.round(area / 40)));
    this.cracks = [];
    for (let k = 0; k < count; k++) {
      this.cracks.push({ at: this.t0 + rand(300, QUAKE_MS - 1500), lines: crackLines(rand(box.x0, box.x1), rand(box.y0, box.y1)) });
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
    for (const c of this.cracks) {
      if (!c.done && time > c.at) {
        c.done = true;
        drawCrack(this.d.cracks, c.lines);
      }
    }
    return t > QUAKE_MS;
  }
}

// A jagged crack with a few branches, starting at square (x, y): a list of world-pixel polylines.
function crackLines(x, y) {
  const lines = [];
  const grow = (px, py, angle, len, depth) => {
    const pts = [[px, py]];
    let a = angle;
    for (let s = 0; s < len; s++) {
      a += rand(-0.6, 0.6);
      const step = rand(8, 15);
      px += Math.cos(a) * step;
      py += Math.sin(a) * step * 0.55; // flatter on the ground
      pts.push([px, py]);
      if (depth < 2 && Math.random() < 0.15) grow(px, py, a + pick([-1, 1]) * rand(0.6, 1.2), Math.floor(len * 0.5), depth + 1);
    }
    lines.push({ pts, width: depth ? 1.5 : 3 });
  };
  const p = toWorld(x, y);
  const angle = rand(0, Math.PI * 2);
  const len = Math.floor(rand(6, 14));
  grow(p.x, p.y, angle, len, 0);
  grow(p.x, p.y, angle + Math.PI, Math.floor(len * 0.7), 0);
  return lines;
}

function drawCrack(g, lines) {
  for (const { pts, width } of lines) {
    g.lineStyle(width + 1.5, 0x8a6a4a, 0.55);
    g.strokePoints(pts.map(([x, y]) => ({ x, y: y + 1 })));
    g.lineStyle(width, 0x2b1d14, 0.95);
    g.strokePoints(pts.map(([x, y]) => ({ x, y })));
  }
}

// ---------- tornado ----------

const TWISTER_SPEED = 1.7; // squares per second
const TWISTER_STAY = 15000; // ms it wanders around the city
const TWISTER_R = 1.1; // squares: buildings this close are ruined
const SUCK_R = 1.8; // squares: people and cars this close are sucked up

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

  render(time) {
    const g = this.d.draw;
    g.clear();
    const p = toWorld(this.x, this.y);
    const al = this.alpha;
    const t = time / 1000;
    // dust swirling at the bottom
    g.fillStyle(0x9b8a70, 0.35 * al);
    g.fillEllipse(p.x, p.y, 90 + Math.sin(t * 5) * 6, 30);
    // the funnel: stacked rings, wider at the top, swaying
    const rings = 18;
    for (let k = 0; k < rings; k++) {
      const h = k * 11;
      const r = 7 + k * k * 0.22 + k * 1.2;
      const sway = Math.sin(t * 2.2 + k * 0.35) * k * 0.9;
      const shade = k % 2 ? 0x8d929b : 0xa3a8b0;
      g.fillStyle(shade, (0.72 - k * 0.012) * al);
      g.fillEllipse(p.x + sway, p.y - h, r * 2, Math.max(6, r * 0.55));
    }
    // bits of debris flying around
    g.fillStyle(0x4a4038, 0.9 * al);
    for (let i = 0; i < 26; i++) {
      const h = (i * 53) % 190;
      const k = h / 11;
      const r = 7 + k * k * 0.22 + k * 1.2 + 6;
      const ang = t * (5 - h / 80) + i * 2.4;
      const sway = Math.sin(t * 2.2 + k * 0.35) * k * 0.9;
      g.fillRect(p.x + sway + Math.cos(ang) * r, p.y - h + Math.sin(ang) * r * 0.28, 3, 2);
    }

    // people and cars spiral up into the funnel and are gone
    this.carried = this.carried.filter((c) => {
      const k = Math.min(1, (time - c.t0) / 1400);
      const ang = c.a + k * 14;
      const r = 26 * (1 - k * 0.5) + 6;
      c.sprite.setPosition(p.x + Math.cos(ang) * r, p.y - k * 170 + Math.sin(ang) * r * 0.3)
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
const WAVE_H = 70; // height of the wave out at sea, px
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
    this.render();
    return this.alpha <= 0;
  }

  render() {
    const g = this.d.draw;
    g.clear();
    const s = this.side;
    const N = this.d.world.size;
    const P = (along, l) => {
      const [x, y] = s.axis === 'x' ? [along, l] : [l, along];
      return toWorld(x, y);
    };
    const al = this.alpha;
    // flooded water behind the wave
    g.fillStyle(0x3f8fd8, 0.38 * al);
    for (let l = 0; l < N; l++) {
      const lane = this.lanes[l];
      const pts = [P(lane.start, l), P(lane.start, l + 1), P(lane.front, l + 1), P(lane.front, l)];
      g.fillPoints(pts, true);
    }
    if (this.state !== 'run') return;
    // the wall of water, leaning forward, with foam on top
    for (let l = 0; l < N; l++) {
      const lane = this.lanes[l];
      if (lane.done) continue;
      const h = this.height(lane);
      if (h < 2) continue;
      const a = P(lane.front, l);
      const b = P(lane.front, l + 1);
      const lean = s.dir * 0.25;
      const ta = P(lane.front + lean, l);
      const tb = P(lane.front + lean, l + 1);
      g.fillStyle(0x2a6fc0, 0.9);
      g.fillPoints([a, b, { x: tb.x, y: tb.y - h }, { x: ta.x, y: ta.y - h }], true);
      g.fillStyle(0xe6f6ff, 0.95);
      const foam = Math.max(3, h * 0.25);
      g.fillPoints([{ x: ta.x, y: ta.y - h + foam }, { x: tb.x, y: tb.y - h + foam }, { x: tb.x, y: tb.y - h }, { x: ta.x, y: ta.y - h }], true);
    }
  }
}
