import { toWorld, facingFor } from '../iso.js';
import { pick, rand } from '../rng.js';

// Zombies: a horde of green zombies comes out of the ground in the middle of the city. They shuffle to the
// nearest building and break it (each zombie takes 1 HP a second; a building has 20 HP per square it covers,
// and is ruined at 0), and they turn the people they catch into zombies. Every zombie dies from one hit:
// the military (Military.js) fights them with bullets (one zombie), tank shells (a 1 x 1 square),
// rockets (2 x 2) and bombs (3 x 3). Like the UFO and the kaiju they don't lock the build bar, and tapping
// a zombie shows a 🗑️ button that takes them all away.
//
// For speed with a thousand of them: they all follow one map of the city (`dist`: how many squares each
// square is from the nearest building, made again when buildings change), instead of each finding its own way.

const MAX = 1000; // zombies on the map at most
const WAVE = 1000; // zombies that come out with one tap of the button
const RISE_S = 3.5; // seconds for a wave to come out of the ground
const RISE_ONE = 0.6; // seconds for one zombie to climb out
const SPEED = 0.28; // squares per second (people walk at 0.55)
const CHASE_SPEED = 0.42;
const SEE = 3; // squares: a zombie this close to a person goes after them
const BITE = 0.3; // squares: close enough to catch them
const TANK_REACH = 0.55; // squares: close enough to hit a tank (a tank has 20 HP, see Military.js)
const HP_PER_SQUARE = 20;
const HIT_EVERY = 1; // seconds between a zombie's hits on a building
const FIELD_EVERY = 500; // ms: the map of the city is made again at most this often
const DIE_S = 0.45; // seconds to fade away when killed
const GREEN = 0x9be37f; // the zombies' colour (the people's pictures, tinted)
const FAR = 0xffff; // a square no building can be reached from
// how big a square each kind of shot hits (squares, half its width); 0 = only the zombie it was aimed at
const AREA = { bullet: 0, shell: 0.5, rocket: 1, bomb: 1.5 };
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Zombies {
  constructor(scene, world, { people, military, disasters }) {
    this.scene = scene;
    this.world = world;
    this.people = people;
    this.military = military;
    this.disasters = disasters;
    this.list = [];
    this.nLive = 0; // zombies in the list that are not dying
    this.queue = 0; // zombies still to come out of the ground
    this.spots = []; // where they come out
    this.riseRate = 0;
    this.riseAcc = 0;
    this.damage = new Map(); // building id -> HP lost
    this.tapped = null; // the zombie the 🗑️ button is over
    this.hot = { x: 0, y: 0 }; // the most crowded spot, where planes fly to
    this.nextHot = 0;
    this.spread = { x: 6, y: 4 };
    this.infantry = true; // soldiers come out of the barracks for them (Soldiers.js)
    const N = world.size;
    this.dist = new Uint16Array(N * N).fill(FAR);
    this.walk = new Uint8Array(N * N);
    this.targetAt = new Array(N * N).fill(null); // the building next to a square that is 0 from one
    this.count = new Uint16Array(N * N); // zombies on each square (made every frame)
    this.fieldVersion = 0;
    this.dirty = true;
    this.nextField = 0;
    const changed = () => (this.dirty = true);
    for (const ev of ['building-added', 'building-removed', 'building-ruined', 'building-repaired']) world.on(ev, changed);
    world.on('building-removed', (b) => this.damage.delete(b.id));
    world.on('building-repaired', (b) => this.damage.delete(b.id));
    this.variants = scene.registry.get('variants').person;
    military.add(this);
  }

  // ---------- what the military needs to know (see Military.js) ----------

  get alive() {
    return this.living > 0;
  }

  get living() {
    return this.nLive;
  }

  // the most crowded spot (planes and the helicopter fly there)
  ground() {
    return this.hot;
  }

  aim() {
    const p = toWorld(this.hot.x, this.hot.y);
    return { x: p.x, y: p.y - 12 };
  }

  // the zombie nearest to the square (x, y) (where tanks drive to)
  closest(x, y) {
    let best = null;
    let bd = Infinity;
    for (const z of this.list) {
      if (z.dead) continue;
      const d = (z.x - x) ** 2 + (z.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best ? { x: best.x, y: best.y } : this.hot;
  }

  // The zombie nearest to the square (x, y) within r squares, or null (what a soldier shoots at).
  nearZombie(x, y, r) {
    let best = null;
    let bd = r * r;
    for (const z of this.list) {
      if (z.dead) continue;
      const d = (z.x - x) ** 2 + (z.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best;
  }

  // Where a shot goes: a zombie (for a bullet, any one; for the others, one in a crowd). The mark follows
  // the zombie while the shot flies, and stays where it was if the zombie dies first.
  mark(kind) {
    const live = this.list.filter((z) => !z.dead);
    if (!live.length) return null;
    let z = pick(live);
    const h = AREA[kind] ?? 0;
    if (h > 0) {
      let best = -1;
      for (let k = 0; k < 16; k++) {
        const c = pick(live);
        const n = this.crowd(c.x, c.y, Math.ceil(h));
        if (n > best) {
          best = n;
          z = c;
        }
      }
    }
    const m = {
      z, gx: z.x, gy: z.y,
      pos() {
        if (!m.z.dead) {
          m.gx = m.z.x;
          m.gy = m.z.y;
        }
        const p = toWorld(m.gx, m.gy);
        return { x: p.x, y: p.y - 12 };
      },
    };
    return m;
  }

  // A shot lands on its mark: every zombie in its square dies (a bullet: just the one it was aimed at;
  // a soldier's rifle: 0.1 off that one's 1 HP).
  hurt(dmg, time, kind, mark) {
    if (!mark) return;
    if (kind === 'rifle') {
      mark.z.hp -= dmg;
      if (mark.z.hp <= 1e-6) this.kill(mark.z);
      return;
    }
    const h = AREA[kind] ?? 0;
    if (h === 0) {
      if (!mark.z.dead) this.kill(mark.z);
      return;
    }
    for (const z of this.list) {
      if (!z.dead && Math.abs(z.x - mark.gx) <= h && Math.abs(z.y - mark.gy) <= h) this.kill(z);
    }
  }

  // zombies in the (2r + 1) x (2r + 1) squares round (x, y), as counted this frame
  crowd(x, y, r) {
    const w = this.world;
    const i0 = Math.floor(x);
    const j0 = Math.floor(y);
    let n = 0;
    for (let j = j0 - r; j <= j0 + r; j++) {
      for (let i = i0 - r; i <= i0 + r; i++) if (w.inBounds(i, j)) n += this.count[w.idx(i, j)];
    }
    return n;
  }

  // ---------- coming and going ----------

  // A wave comes out of the ground in the middle of the city. Returns how many are coming (0: there are already
  // as many as there can be).
  spawn() {
    const room = MAX - this.living - this.queue;
    const n = Math.min(WAVE, room);
    if (n <= 0) return 0;
    const box = this.disasters.cityBounds();
    this.spots = this.openSquares((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 160);
    if (!this.spots.length) return 0;
    const first = this.queue === 0 && !this.alive;
    this.queue += n;
    this.riseRate = this.queue / RISE_S;
    if (first) this.scene.events.emit('zombies', true);
    return n;
  }

  // Up to `max` squares a zombie can stand on, nearest to (x, y) first.
  openSquares(x, y, max) {
    const w = this.world;
    this.buildField();
    let start = null;
    for (let r = 0; r < w.size && !start; r++) {
      for (let j = Math.floor(y) - r; j <= Math.floor(y) + r && !start; j++) {
        for (let i = Math.floor(x) - r; i <= Math.floor(x) + r; i++) {
          if (w.inBounds(i, j) && this.walk[w.idx(i, j)]) {
            start = [i, j];
            break;
          }
        }
      }
    }
    if (!start) return [];
    const seen = new Set([w.idx(...start)]);
    const out = [start];
    for (let n = 0; n < out.length && out.length < max; n++) {
      const [i, j] = out[n];
      for (const [di, dj] of N8.slice(0, 4)) {
        const a = i + di;
        const b = j + dj;
        if (!w.inBounds(a, b) || seen.has(w.idx(a, b)) || !this.walk[w.idx(a, b)]) continue;
        seen.add(w.idx(a, b));
        out.push([a, b]);
      }
    }
    return out;
  }

  add(x, y, rising = true) {
    const key = pick(this.variants);
    const tex = this.scene.textures.get(key);
    const im = this.scene.add.image(0, 0, key, 0).setOrigin(0.5, 1);
    im.baseTint = GREEN; // green, and darker at night (DayNight.paint)
    this.scene.dayNight?.paint(im) ?? im.setTint(GREEN);
    const z = {
      im, x, y, perRow: Math.max(1, Math.floor((tex.frameTotal - 1) / 2)),
      ox: rand(-0.32, 0.32), oy: rand(-0.32, 0.32), // where in each square it walks, so they don't walk in lines
      wx: x, wy: y, fv: -1, dir: [0, 1], walked: rand(0, 10), age: rising ? 0 : RISE_ONE,
      look: rand(0, 1), chase: null, hitIn: rand(0, HIT_EVERY), attacking: null, dead: false, deadT: 0,
      speed: SPEED * rand(0.8, 1.2), wob: rand(0, 6.3), depth: null, hp: 1,
    };
    this.list.push(z);
    this.nLive++;
    return z;
  }

  kill(z) {
    if (z.dead) return;
    z.dead = true;
    z.deadT = 0;
    this.nLive--;
    if (this.tapped === z) this.tapped = null;
  }

  // Was the world point (a tap) on a zombie? Remembers it, for the 🗑️ button.
  hit(pt) {
    if (!pt || !this.alive) return false;
    let best = null;
    let bd = 26;
    for (const z of this.list) {
      if (z.dead) continue;
      const d = Math.hypot(z.im.x - pt.x, z.im.y - 20 - pt.y);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    this.tapped = best;
    return !!best;
  }

  // Where the 🗑️ button goes: above the tapped zombie, in CSS pixels.
  anchor() {
    if (!this.alive) return null;
    if (!this.tapped || this.tapped.dead) this.tapped = this.list.find((z) => !z.dead);
    const cam = this.scene.cameras.main;
    const k = cam.zoom * this.scene.scale.zoom;
    const im = this.tapped.im;
    return { x: (im.x - cam.worldView.x) * k, y: (im.y - im.displayHeight - cam.worldView.y) * k };
  }

  // 🗑️: they all go away.
  remove() {
    if (!this.alive && !this.queue) return false;
    this.queue = 0;
    for (const z of this.list) this.kill(z);
    this.wasAlive = false;
    this.scene.events.emit('zombies', false, false);
    return true;
  }

  // ---------- the map they walk by ----------

  // Every square gets how many steps it is from the nearest building still standing (not decorations);
  // squares next to a building are 0, and remember which building that is.
  buildField() {
    const w = this.world;
    const N = w.size;
    const walk = this.walk;
    const dist = this.dist;
    const targetAt = this.targetAt;
    dist.fill(FAR);
    targetAt.fill(null);
    for (let k = 0; k < N * N; k++) {
      const b = w.bldg[k] ? w.buildings.get(w.bldg[k]) : null;
      walk[k] = w.ground[k] !== 0 && (!b || b.ruined || b.def.menu === 'Decoration') ? 1 : 0;
    }
    const queue = new Int32Array(N * N);
    let tail = 0;
    for (const b of w.buildings.values()) {
      if (b.ruined || b.def.menu === 'Decoration') continue;
      const around = (i, j) => {
        if (!w.inBounds(i, j)) return;
        const k = w.idx(i, j);
        if (!walk[k] || dist[k] === 0) return;
        dist[k] = 0;
        targetAt[k] = b;
        queue[tail++] = k;
      };
      for (let i = b.x; i < b.x + b.w; i++) {
        around(i, b.y - 1);
        around(i, b.y + b.d);
      }
      for (let j = b.y; j < b.y + b.d; j++) {
        around(b.x - 1, j);
        around(b.x + b.w, j);
      }
    }
    for (let head = 0; head < tail; head++) {
      const k = queue[head];
      const i = k % N;
      const j = (k / N) | 0;
      const d = dist[k] + 1;
      for (let n = 0; n < 4; n++) {
        const a = i + N8[n][0];
        const b = j + N8[n][1];
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const q = b * N + a;
        if (!walk[q] || dist[q] <= d) continue;
        dist[q] = d;
        queue[tail++] = q;
      }
    }
    this.dirty = false;
    this.fieldVersion++;
  }

  // The next point for a zombie on its way to a building: the middle of the neighbouring square that is closest
  // to one (diagonally only if both squares beside that step are open), plus its own spot in that square.
  nextStep(z) {
    const w = this.world;
    const i = Math.floor(z.x);
    const j = Math.floor(z.y);
    const here = w.inBounds(i, j) ? this.dist[w.idx(i, j)] : FAR;
    z.attacking = null;
    if (here === 0) {
      const b = this.targetAt[w.idx(i, j)];
      if (b && !b.ruined) {
        // next to a building: walk up to it and hit it
        z.attacking = b;
        const cx = Math.max(b.x, Math.min(b.x + b.w, i + 0.5));
        const cy = Math.max(b.y, Math.min(b.y + b.d, j + 0.5));
        z.wx = i + 0.5 + Math.sign(cx - (i + 0.5)) * 0.32 + z.ox * 0.3;
        z.wy = j + 0.5 + Math.sign(cy - (j + 0.5)) * 0.32 + z.oy * 0.3;
        return;
      }
    }
    let best = null;
    let bd = here;
    for (const [di, dj] of N8) {
      const a = i + di;
      const b = j + dj;
      if (!w.inBounds(a, b)) continue;
      const k = w.idx(a, b);
      if (!this.walk[k]) continue;
      if (di && dj && (!this.walk[w.idx(i + di, j)] || !this.walk[w.idx(i, j + dj)])) continue;
      const d = this.dist[k] + (di && dj ? 0.4 : 0);
      if (d < bd) {
        bd = d;
        best = [a, b];
      }
    }
    if (!best) {
      // nowhere to go (no buildings left, or shut in): wander about
      const open = N8.slice(0, 4).map(([di, dj]) => [i + di, j + dj])
        .filter(([a, b]) => w.inBounds(a, b) && this.walk[w.idx(a, b)]);
      best = open.length ? pick(open) : [i, j];
    }
    z.wx = best[0] + 0.5 + z.ox;
    z.wy = best[1] + 0.5 + z.oy;
  }

  // ---------- every frame ----------

  update(time, dt) {
    if (!this.list.length && !this.queue) return;
    if (this.dirty && time > this.nextField) {
      this.buildField();
      this.nextField = time + FIELD_EVERY;
    }
    this.rise(dt);
    const w = this.world;
    // count zombies per square (for picking crowds), and find people near them
    this.count.fill(0);
    for (const z of this.list) if (!z.dead && w.inBounds(Math.floor(z.x), Math.floor(z.y))) this.count[w.idx(Math.floor(z.x), Math.floor(z.y))]++;
    const people = this.peopleGrid();
    const full = this.living >= MAX;
    const tanks = this.military.tanksOut();
    if (time > this.nextHot) this.findHot(time);

    let n = 0;
    const list = this.list;
    for (let k = 0; k < list.length; k++) {
      const z = list[k];
      if (z.dead) {
        z.deadT += dt;
        const a = 1 - z.deadT / DIE_S;
        if (a <= 0) {
          z.im.destroy();
          continue;
        }
        z.im.setAlpha(a).setScale(1, 0.4 + 0.6 * a);
        list[n++] = z;
        continue;
      }
      list[n++] = z;
      if (z.age < RISE_ONE) {
        // climbing out of the ground
        z.age += dt;
        const t = Math.min(1, z.age / RISE_ONE);
        z.im.setAlpha(t).setScale(1, 0.25 + 0.75 * t);
      }
      z.lunging = false;
      this.think(z, time, dt, people, full, tanks);
      this.draw(z, time);
    }
    list.length = n;
    // the last one shot: the army won
    if (!this.nLive && !this.queue && this.wasAlive) this.scene.events.emit('zombies', false, true);
    this.wasAlive = this.nLive > 0 || this.queue > 0;
  }

  rise(dt) {
    if (!this.queue) return;
    this.riseAcc += this.riseRate * dt;
    while (this.riseAcc >= 1 && this.queue > 0) {
      this.riseAcc -= 1;
      this.queue--;
      if (this.nLive >= MAX) continue; // people bitten meanwhile took the room
      // the middle first, spreading out
      const s = this.spots[Math.floor(Math.random() ** 1.6 * this.spots.length)];
      this.add(s[0] + rand(0.1, 0.9), s[1] + rand(0.1, 0.9));
    }
    if (!this.queue) this.riseAcc = 0;
  }

  // People and soldiers by 4 x 4 block, so each zombie only looks at the ones near it.
  peopleGrid() {
    const grid = new Map();
    for (const p of [...this.people.list, ...this.military.soldiers.list]) {
      if (p.leaving) continue;
      const key = Math.floor(p.mover.px / 4) * 1000 + Math.floor(p.mover.py / 4);
      (grid.get(key) || grid.set(key, []).get(key)).push(p);
    }
    return grid;
  }

  nearPerson(z, grid) {
    const bx = Math.floor(z.x / 4);
    const by = Math.floor(z.y / 4);
    let best = null;
    let bd = SEE;
    for (let a = bx - 1; a <= bx + 1; a++) {
      for (let b = by - 1; b <= by + 1; b++) {
        for (const p of grid.get(a * 1000 + b) || []) {
          const d = Math.hypot(p.mover.px - z.x, p.mover.py - z.y);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
      }
    }
    return best;
  }

  think(z, time, dt, people, full, tanks) {
    const w = this.world;
    // now and then: a tank or anybody to go after?
    z.look -= dt;
    if (z.look <= 0) {
      z.look = rand(0.5, 0.9);
      if (!z.tank) z.tank = this.nearTank(z, tanks);
      if (!z.tank && !z.chase && !full) z.chase = this.nearPerson(z, people);
    }
    if (z.tank && this.chaseTank(z, time, dt, tanks)) return;
    if (z.chase) {
      const p = z.chase;
      if (p.leaving || full || (!p.soldier && !this.people.list.includes(p))) z.chase = null;
      else {
        const dx = p.mover.px - z.x;
        const dy = p.mover.py - z.y;
        const d = Math.hypot(dx, dy);
        if (d <= BITE) {
          this.bite(z, p);
          z.chase = null;
          return;
        }
        if (d > SEE * 1.6) {
          z.chase = null; // got away
        } else {
          const step = Math.min(d, CHASE_SPEED * dt);
          const nx = z.x + (dx / d) * step;
          const ny = z.y + (dy / d) * step;
          if (w.inBounds(Math.floor(nx), Math.floor(ny)) && this.walk[w.idx(Math.floor(nx), Math.floor(ny))]) {
            this.moveTo(z, nx, ny, dx / d, dy / d, step);
            z.fv = -1; // find the way again when the chase is over
            return;
          }
          z.chase = null; // a building or water in the way
          z.look = 2;
        }
      }
    }
    // on the way to a building, or hitting one
    const dx = z.wx - z.x;
    const dy = z.wy - z.y;
    const d = Math.hypot(dx, dy);
    if (z.fv !== this.fieldVersion || (d < 0.04 && !z.attacking)) {
      z.fv = this.fieldVersion;
      this.nextStep(z);
    }
    if (z.attacking) {
      if (z.attacking.ruined || !w.buildings.has(z.attacking.id)) {
        z.attacking = null;
        z.fv = -1;
        return;
      }
      if (d > 0.02) this.moveTo(z, ...this.stepToward(z, dt));
      else {
        // face the building
        const b = z.attacking;
        const fx = Math.max(b.x, Math.min(b.x + b.w, z.x)) - z.x;
        const fy = Math.max(b.y, Math.min(b.y + b.d, z.y)) - z.y;
        if (fx || fy) z.dir = [fx, fy];
      }
      z.hitIn -= dt;
      if (z.hitIn <= 0) {
        z.hitIn += HIT_EVERY;
        z.hitT = time;
        this.hitBuilding(z.attacking);
      }
      return;
    }
    if (d > 0.001) this.moveTo(z, ...this.stepToward(z, dt));
  }

  nearTank(z, tanks) {
    let best = null;
    let bd = SEE;
    for (const t of tanks) {
      const d = Math.hypot(t.x - z.x, t.y - z.y);
      if (d < bd) {
        bd = d;
        best = t.tank;
      }
    }
    return best;
  }

  // Going after a tank, and hitting it once close (1 HP a second). False when the tank is gone or got away.
  chaseTank(z, time, dt, tanks) {
    const t = tanks.find((u) => u.tank === z.tank);
    if (!t) {
      z.tank = null;
      return false;
    }
    const dx = t.x - z.x;
    const dy = t.y - z.y;
    const d = Math.hypot(dx, dy);
    if (d > SEE * 1.6) {
      z.tank = null;
      return false;
    }
    z.fv = -1;
    z.attacking = null;
    if (d > TANK_REACH) {
      const step = Math.min(d - TANK_REACH, CHASE_SPEED * dt);
      const nx = z.x + (dx / d) * step;
      const ny = z.y + (dy / d) * step;
      const w = this.world;
      if (!w.inBounds(Math.floor(nx), Math.floor(ny)) || !this.walk[w.idx(Math.floor(nx), Math.floor(ny))]) {
        z.tank = null;
        return false;
      }
      this.moveTo(z, nx, ny, dx / d, dy / d, step);
      return true;
    }
    z.dir = [dx || 1, dy];
    z.hitIn -= dt;
    if (z.hitIn <= 0) {
      z.hitIn += HIT_EVERY;
      z.hitT = time;
      this.military.hurtTank(z.tank, 1, time);
    }
    z.lunging = true;
    return true;
  }

  stepToward(z, dt) {
    const dx = z.wx - z.x;
    const dy = z.wy - z.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, z.speed * dt);
    return [z.x + (dx / d) * step, z.y + (dy / d) * step, dx / d, dy / d, step];
  }

  moveTo(z, x, y, ux, uy, step) {
    z.x = x;
    z.y = y;
    z.dir = [ux, uy];
    z.walked += step;
  }

  hitBuilding(b) {
    const hp = HP_PER_SQUARE * b.w * b.d;
    const lost = (this.damage.get(b.id) || 0) + 1;
    if (lost >= hp) {
      this.damage.delete(b.id);
      this.world.ruinBuilding(b);
    } else this.damage.set(b.id, lost);
  }

  // A person or soldier caught: they turn into a zombie where they stand.
  bite(z, p) {
    if (this.nLive >= MAX) return; // no room for another one
    if (p.soldier) {
      this.military.soldiers.convert(p);
      this.add(p.mover.px, p.mover.py, false);
      return;
    }
    const sprite = this.people.take(p);
    if (!sprite) return;
    sprite.destroy();
    this.add(p.mover.px, p.mover.py, false);
  }

  // The most crowded spot, from a few zombies picked at random.
  findHot(time) {
    this.nextHot = time + 1000;
    const live = this.list.filter((z) => !z.dead);
    let best = -1;
    for (let k = 0; k < Math.min(30, live.length); k++) {
      const z = pick(live);
      const n = this.crowd(z.x, z.y, 2);
      if (n > best) {
        best = n;
        this.hot = { x: z.x, y: z.y };
      }
    }
  }

  draw(z, time) {
    const p = toWorld(z.x, z.y);
    const f = facingFor(z.dir[0], z.dir[1]);
    // a slow, stiff walk; hitting a building: lunging at it
    let frame;
    let lean = Math.sin(time * 0.004 + z.wob) * 0.06;
    if (z.attacking || z.lunging) {
      const since = (time - (z.hitT || 0)) / 1000;
      frame = f.row * z.perRow + (since < 0.25 ? 1 % z.perRow : 0);
      lean += (since < 0.25 ? 0.18 : 0.05) * (f.flip ? -1 : 1) * (f.row ? -1 : 1);
    } else frame = f.row * z.perRow + (Math.floor(z.walked * 5) % z.perRow);
    const im = z.im;
    im.setPosition(Math.round(p.x), Math.round(p.y)).setFlipX(f.flip).setRotation(lean);
    if (im.frame.name !== frame) im.setFrame(frame);
    const depth = Math.round((z.x + z.y) * 20) / 20;
    if (depth !== z.depth) {
      z.depth = depth;
      im.setDepth(depth);
    }
  }
}
