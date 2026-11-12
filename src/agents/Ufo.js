import { DEPTH, SPEED } from '../constants.js';
import { toWorld, toGrid } from '../iso.js';
import { pick, rand } from '../rng.js';
import { vehicleSprite, faceVehicle, hasVehicle, vehicleShadow, placeShadow } from './vehicleArt.js';

// The UFO: one at a time. It hovers over the city, now and then burns a block with a blue laser,
// and the military fights back until its health runs out. It doesn't lock the build bar like the
// other disasters; tapping it shows a 🗑️ button that takes it away.

const HP = 1000;
const ALT = 320; // how high it flies, px
const SPEED_SQ = 0.45; // squares per second
const LASER_EVERY = [6000, 9500]; // ms between laser shots
const LASER_CHARGE = 900; // ms of glowing before the beam
const LASER_BEAM = 700; // ms the beam is on
const BOTTOM = 0.47; // the saucer's bottom lip, below its middle, as a part of the picture's height
const ZAP_EVERY = 20000; // ms between shots of the small side laser, which destroys one tank or plane nearby
const ZAP_RANGE = 1100; // px from the UFO
const ZAP_MS = 400; // how long the small beam shows
const BLAST_MS = 550; // how long a rocket's explosion on the UFO lasts
const NEW_TANK = 8000; // ms before a military base sends a new tank after one is destroyed
// Blue lights at night, on the ring of lights round the bottom of the saucer (px from the middle of the picture).
// They flash together like a plane's blinking light: bright for BLINK_ON ms every BLINK_MS.
const RIM_LIGHTS = [[-334, 94], [-294, 124], [-240, 151], [-165, 173], [-102, 185], [-27, 192],
  [56, 190], [115, 181], [187, 166], [244, 146], [292, 123], [333, 94]];
const BLINK_MS = 1200;
const BLINK_ON = 180;
const RUIN_SIZE = 4; // squares: buildings in this square around the impact are ruined
const FIRE_SIZE = 8; // squares: buildings in this square around it catch fire
const FIRE_BURN_OUT = 75000; // ms: a fire nobody puts out by then ruins its building

// damage of each kind of shot, and how fast it flies (px per second)
const SHOTS = {
  bullet: { dmg: 1, speed: 950 },
  shell: { dmg: 5, speed: 650 }, // a tank's shot
  bomb: { dmg: 5, speed: 0, accel: 700 }, // falls, faster and faster
  rocket: { dmg: 10, speed: 520, boost: 600 }, // flies up first for `boost` ms, then towards the UFO
};

// The military's answer, per building type.
const TANK_RANGE = 9; // squares from the point under the UFO
const TANK_RELOAD = 5000;
const SILO_RELOAD = 30000;
const SHIP_RELOAD = 20000;
const SHIP_SALVO = 5; // rockets a destroyer or carrier fires at a time
const SHIP_TYPES = ['destroyer', 'aircraftcarrier'];
const CARRIER_DECK = 22; // px from the carrier's waterline up to its flight deck
const SORTIE_REST = 20000; // ms a plane or helicopter waits at the airport between attacks
// salvo: what it fires on each attack, in order: [kind, how many, ms between them]
const PLANES = {
  fighterjet: { speed: 380, alt: ALT, salvo: [['bullet', 20, 90], ['rocket', 2, 350]] }, // a strafing run
  heli_military: { speed: 190, alt: ALT - 70, salvo: [['rocket', 4, 700]] }, // hovers beside it
  bomber: { speed: 210, alt: ALT + 190, salvo: [['bomb', 5, 260]] }, // drops bombs on it from above
};
const salvoSize = (c) => c.salvo.reduce((n, [, k]) => n + k, 0);

export class Ufo {
  constructor(scene, world, { services, traffic, ships, disasters }) {
    this.scene = scene;
    this.world = world;
    this.services = services;
    this.traffic = traffic;
    this.ships = ships;
    this.disasters = disasters;
    this.ufo = null;
    this.shots = [];
    this.blasts = []; // rocket explosions on the UFO, being drawn
    this.tanks = new Map(); // military base id -> { car, next, reload, repath }
    this.sorties = new Map(); // `${airport id}:${plane}` -> sortie
    this.reload = new Map(); // silo id or ship -> time it can fire again
    this.g = scene.add.graphics().setDepth(DEPTH.AIR + 2000);
    this.shadow = scene.add.graphics().setDepth(DEPTH.SHADOW); // the UFO's shadow, on the ground under everything
    this.sparks = scene.add.particles(0, 0, 'fx_flame', {
      lifespan: { min: 300, max: 700 }, speed: { min: 40, max: 180 }, gravityY: 120,
      scale: { start: 1.6, end: 0.2 }, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(DEPTH.AIR + 2001);
    this.smoke = scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 600, max: 1200 }, speed: { min: 5, max: 25 }, tint: 0xd8d8d8,
      scale: { start: 1, end: 3 }, alpha: { start: 0.6, end: 0 }, emitting: false,
    }).setDepth(DEPTH.AIR + 1999);
  }

  get active() {
    return !!this.ufo && !this.ufo.leaving;
  }

  // ---------- the UFO ----------

  // Comes down over the middle of the city. Returns false if there already is one.
  spawn() {
    if (this.ufo) return false;
    const box = this.disasters.cityBounds();
    const x = (box.x0 + box.x1) / 2;
    const y = (box.y0 + box.y1) / 2;
    const scene = this.scene;
    let im;
    let v = null;
    if (hasVehicle(scene, 'ufo')) {
      v = vehicleSprite(scene, 'ufo', null);
      im = v.im;
    } else {
      // no picture: a plain saucer
      if (!scene.textures.exists('ufo_plain')) {
        const g = scene.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0x9aa3ad).fillEllipse(200, 70, 400, 90);
        g.fillStyle(0x3ee0c8).fillEllipse(200, 40, 140, 70);
        g.generateTexture('ufo_plain', 400, 120);
        g.destroy();
      }
      im = scene.add.image(0, 0, 'ufo_plain');
    }
    im.setAlpha(0);
    this.ufo = {
      im, v, x, y, alt: ALT + 300, hp: HP, dir: [1, 0], target: null,
      nextLaser: scene.time.now + 4000, laser: null, t0: scene.time.now,
      nextZap: scene.time.now + ZAP_EVERY, zap: null,
    };
    this.pickTarget();
    scene.events.emit('ufo', true);
    return true;
  }

  pickTarget() {
    const b = this.disasters.cityBounds();
    this.ufo.target = { x: rand(b.x0, b.x1), y: rand(b.y0, b.y1) };
  }

  // Where the UFO is drawn (its middle), in world px.
  screenPos() {
    const u = this.ufo;
    const p = toWorld(u.x, u.y);
    return { x: p.x, y: p.y - u.alt, ground: p };
  }

  // Was the world point (a tap) on the UFO?
  hit(pt) {
    if (!this.active || !pt) return false;
    const b = this.ufo.im.getBounds();
    return pt.x > b.x + b.width * 0.08 && pt.x < b.right - b.width * 0.08 && pt.y > b.y + b.height * 0.15 && pt.y < b.bottom - b.height * 0.1;
  }

  // Where the 🗑️ button goes: above the UFO, in CSS pixels.
  anchor() {
    if (!this.active) return null;
    const cam = this.scene.cameras.main;
    const k = cam.zoom * this.scene.scale.zoom;
    const b = this.ufo.im.getBounds();
    return { x: (b.centerX - cam.worldView.x) * k, y: (b.y - cam.worldView.y) * k };
  }

  // 🗑️: it just goes away.
  remove() {
    if (!this.active) return false;
    this.leave(false);
    return true;
  }

  // The UFO goes: shot down (with an explosion) or taken away. Everybody goes home.
  leave(exploded) {
    const u = this.ufo;
    u.leaving = true;
    u.laser = null;
    const scene = this.scene;
    if (exploded) {
      const p = this.screenPos();
      scene.cameras.main.shake(900, 0.012, true);
      this.flash = { x: p.x, y: p.y, t0: scene.time.now };
      for (let k = 0; k < 14; k++) {
        scene.time.delayedCall(k * 70, () => {
          this.sparks.emitParticleAt(p.x + rand(-260, 260), p.y + rand(-80, 80), 14);
          this.smoke.emitParticleAt(p.x + rand(-220, 220), p.y + rand(-60, 60), 4);
        });
      }
    }
    scene.tweens.add({
      targets: u.im, alpha: 0, duration: exploded ? 500 : 700,
      onComplete: () => {
        u.im.destroy();
        u.lights?.forEach((l) => l.destroy());
        if (this.ufo === u) this.ufo = null;
      },
    });
    this.shots = [];
    for (const t of this.tanks.values()) if (t.car && !t.car.gone) this.traffic.recall(t.car);
    this.tanks.clear();
    this.reload.clear();
    for (const s of this.sorties.values()) if (s.state !== 'rest') s.state = 'back';
    scene.events.emit('ufo', false);
  }

  update(time, dt) {
    const g = this.g;
    g.clear();
    this.shadow.clear();
    if (this.ufo && !this.ufo.leaving) {
      this.moveUfo(time, dt);
      this.laser(time);
      this.defend(time);
      this.zap(time);
    }
    if (this.ufo) this.renderUfo(time);
    this.stepSorties(time, dt);
    this.stepShots(time, dt);
    this.drawBlasts(time);
    this.drawFlash(time);
  }

  moveUfo(time, dt) {
    const u = this.ufo;
    // comes down from high up, fading in
    u.alt = Math.max(ALT, u.alt - 160 * dt);
    u.im.setAlpha(Math.min(1, (time - u.t0) / 1500));
    if (u.laser) return; // holds still while it fires
    const dx = u.target.x - u.x;
    const dy = u.target.y - u.y;
    const d = Math.hypot(dx, dy);
    const step = SPEED_SQ * dt;
    if (d <= step) this.pickTarget();
    else {
      u.x += (dx / d) * step;
      u.y += (dy / d) * step;
      u.dir = [dx / d, dy / d];
    }
  }

  // At night: blue lights round the rim that flash together, like a plane's blinking light (see DayNight.js).
  rimLights(u, time) {
    const night = this.scene.dayNight;
    if (!night) return;
    u.lights ||= RIM_LIGHTS.map(() => night.glowImage(0, 0, 'fx_glow').setTint(0x3aa8ff).setBlendMode('ADD').setScale(30 / 32));
    const blink = time % BLINK_MS < BLINK_ON ? 1 : 0.12;
    u.lights.forEach((im, k) => {
      const [px, py] = RIM_LIGHTS[k];
      im.setVisible(night.level > 0).setPosition(u.im.x + px, u.im.y + py)
        .setAlpha(night.level * blink * u.im.alpha).setDepth(DEPTH.AIR + u.alt + 1);
    });
  }

  renderUfo(time) {
    const u = this.ufo;
    const p = this.screenPos();
    const bob = (u.bob = Math.sin(time / 500) * 6);
    if (u.v) faceVehicle(u.v, u.dir[0], u.dir[1]);
    u.im.setPosition(Math.round(p.x), Math.round(p.y + bob)).setDepth(DEPTH.AIR + u.alt);
    this.rimLights(u, time);
    const g = this.g;
    // its shadow on the ground
    this.shadow.fillStyle(0x000000, 0.18 * u.im.alpha);
    this.shadow.fillEllipse(p.ground.x, p.ground.y, u.im.displayWidth * 0.8, u.im.displayWidth * 0.32);
    if (u.leaving) return;
    // health bar above it
    const b = u.im.getBounds();
    const w = 220;
    const x0 = b.centerX - w / 2;
    const y0 = b.y - 22;
    g.fillStyle(0x000000, 0.55);
    g.fillRect(x0 - 3, y0 - 3, w + 6, 16);
    g.fillStyle(0xff3b30, 1);
    g.fillRect(x0, y0, w, 10);
    g.fillStyle(0x34c759, 1);
    g.fillRect(x0, y0, w * Math.max(0, u.hp / HP), 10);
  }

  // ---------- the laser ----------

  laser(time) {
    const u = this.ufo;
    if (!u.laser) {
      if (time < u.nextLaser || u.alt > ALT + 1) return;
      // straight down: it hits the ground right under it
      u.laser = { at: { x: u.x, y: u.y }, t0: time, fired: false };
      return;
    }
    const L = u.laser;
    const t = time - L.t0;
    const p = this.screenPos();
    const from = { x: p.x, y: p.y + (u.bob || 0) + u.im.displayHeight * BOTTOM }; // the underside of the saucer
    const g = this.g;
    if (t < LASER_CHARGE) {
      // charging: a growing blue glow under the UFO
      const k = t / LASER_CHARGE;
      g.fillStyle(0x4fc3ff, 0.35 + 0.4 * k);
      g.fillEllipse(from.x, from.y, 40 + 80 * k, 16 + 30 * k);
      g.fillStyle(0xe6f8ff, 0.9);
      g.fillEllipse(from.x, from.y, 14 + 34 * k, 6 + 12 * k);
      return;
    }
    if (!L.fired) {
      L.fired = true;
      this.blast(L.at, time);
    }
    const k = (t - LASER_CHARGE) / LASER_BEAM;
    if (k >= 1) {
      u.laser = null;
      u.nextLaser = time + rand(...LASER_EVERY);
      return;
    }
    const hit = toWorld(L.at.x, L.at.y);
    const fade = 1 - k * k;
    // a thick beam: wide soft glow, bright blue, white core
    for (const [wd, col, al] of [[90, 0x2d8cff, 0.3], [52, 0x5fd0ff, 0.7], [22, 0xeefaff, 0.95]]) {
      g.lineStyle(wd * (0.6 + 0.4 * fade), col, al * fade);
      g.lineBetween(from.x, from.y, hit.x, hit.y);
    }
    g.fillStyle(0x7fdcff, 0.5 * fade);
    g.fillEllipse(hit.x, hit.y, 300 * (0.6 + k), 130 * (0.6 + k));
  }

  // The beam lands: a 4 x 4 block is ruined, and buildings in the 8 x 8 around it catch fire.
  blast(at, time) {
    const d = this.disasters;
    const w = this.world;
    const inside = (b, h) => b.x < at.x + h && b.x + b.w > at.x - h && b.y < at.y + h && b.y + b.d > at.y - h;
    for (const b of [...w.buildings.values()]) if (inside(b, RUIN_SIZE / 2)) w.ruinBuilding(b);
    for (const t of d.near(at.x, at.y, RUIN_SIZE / 2 + 0.3)) {
      const sprite = d.take(t);
      if (sprite) this.scene.tweens.add({ targets: sprite, alpha: 0, duration: 300, onComplete: () => sprite.destroy() });
    }
    for (const b of w.buildings.values()) if (!b.ruined && inside(b, FIRE_SIZE / 2)) this.services.ignite(b, time, FIRE_BURN_OUT);
    const p = toWorld(at.x, at.y);
    this.sparks.emitParticleAt(p.x, p.y, 30);
    for (let k = 0; k < 10; k++) this.smoke.emitParticleAt(p.x + rand(-90, 90), p.y + rand(-40, 20), 1);
    this.scene.cameras.main.shake(400, 0.005, true);
  }

  // ---------- the small side laser: every 20 s it destroys one tank or plane nearby ----------

  zap(time) {
    const u = this.ufo;
    const p = this.screenPos();
    const center = { x: p.x, y: p.y + (u.bob || 0) };
    // draw the beam of the last shot for a moment
    if (u.zap) {
      const k = (time - u.zap.t0) / ZAP_MS;
      if (k >= 1) u.zap = null;
      else {
        const { from, to } = u.zap;
        for (const [wd, col, al] of [[12, 0x2d8cff, 0.35], [5, 0x8fe3ff, 0.9], [2, 0xffffff, 1]]) {
          this.g.lineStyle(wd, col, al * (1 - k));
          this.g.lineBetween(from.x, from.y, to.x, to.y);
        }
      }
    }
    if (time < u.nextZap) return;
    // what is in range: tanks out of their base, and planes in the air
    const targets = [];
    for (const t of this.tanks.values()) {
      const car = t.car;
      if (!car || car.gone || car.leaving) continue;
      const q = toWorld(car.mover.px, car.mover.py);
      targets.push({ x: q.x, y: q.y - 12, kill: () => this.killTank(t, time) });
    }
    for (const s of this.sorties.values()) {
      if (s.state === 'rest' || !s.v) continue;
      targets.push({ x: s.x, y: s.y - s.alt, kill: () => this.killPlane(s, time) });
    }
    const near = targets.filter((t) => Math.hypot(t.x - center.x, t.y - center.y) <= ZAP_RANGE);
    if (!near.length) {
      u.nextZap = time + 1000; // nothing close: look again soon
      return;
    }
    const t = pick(near);
    // from the rim on the side facing the target
    const side = t.x < center.x ? -1 : 1;
    const from = { x: center.x + side * u.im.displayWidth * 0.4, y: center.y + u.im.displayHeight * 0.05 };
    u.zap = { from, to: { x: t.x, y: t.y }, t0: time };
    u.nextZap = time + ZAP_EVERY;
    t.kill();
    this.sparks.emitParticleAt(t.x, t.y, 22);
    this.smoke.emitParticleAt(t.x, t.y, 6);
  }

  // A tank destroyed: its base sends a new one a little later.
  killTank(t, time) {
    const sprite = this.traffic.take(t.car);
    if (sprite) this.scene.tweens.add({ targets: sprite, alpha: 0, duration: 400, onComplete: () => sprite.destroy() });
    t.car = null;
    t.next = time + NEW_TANK;
  }

  // A plane or helicopter destroyed: the airport sends another one with the next wave.
  killPlane(s, time) {
    const { v, shadow } = s;
    this.scene.tweens.add({ targets: [v.im, shadow], alpha: 0, duration: 300, onComplete: () => { v.im.destroy(); shadow.destroy(); } });
    s.v = null;
    s.state = 'rest';
    s.until = time + SORTIE_REST;
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
        this.fire('rocket', { x: c.x, y: c.top + 30 }, time);
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
        for (let k = 0; k < SHIP_SALVO; k++) {
          this.scene.time.delayedCall(k * 180, () => {
            if (!this.active || !s.v.im.active) return; // the UFO or the ship is gone
            const p = toWorld(s.x, s.y);
            this.fire('rocket', { x: p.x + rand(-50, 50), y: p.y - 50 + rand(-10, 10) }, this.scene.time.now);
          });
        }
        this.reload.set(s, time + SHIP_RELOAD);
      }
    }
    // planes of an airport that is gone don't go out again
    // (and a carrier's jet doesn't once the carrier is gone)
    for (const s of this.sorties.values()) if (s.ship ? !ships.has(s.ship) : !live(s.b)) s.dead = true;
  }

  // One tank per military base drives along the roads towards the UFO and shoots when it is close enough.
  tank(b, time) {
    const u = this.ufo;
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
    const dist = Math.hypot(m.px - u.x, m.py - u.y);
    // every few seconds (once it has reached the end of its last route): a new route towards the UFO
    if (time > t.repath && (car.mode === 'wait' || !m.queue.length)) {
      t.repath = time + 3000;
      if (dist > TANK_RANGE * 0.6) {
        const from = [Math.floor(m.px), Math.floor(m.py)];
        const path = this.tankRoute(from, u.x, u.y);
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
      this.fire('shell', { x: p.x, y: p.y - 14 }, time);
      t.reload = time + TANK_RELOAD;
    }
  }

  // A tank's route from square `from` to within range of the UFO at (x, y): over roads and open land
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

  // ---------- planes and helicopters from the military airport ----------

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
      fired: 0, nextShot: 0, pass: null, dir: [1, 0],
    });
    v.im.setAlpha(0);
    this.scene.tweens.add({ targets: v.im, alpha: 1, duration: 500 });
  }

  stepSorties(time, dt) {
    for (const [key, s] of this.sorties) {
      if (s.state === 'rest') {
        // at home: goes out again after its rest, while the UFO is still there
        if (s.dead || !this.active) this.sorties.delete(key);
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
      this.fire(kind, { x: s.x, y: s.y - s.alt + (kind === 'bomb' ? 14 : 0) }, time, { air: true });
    };
    if (!this.active && s.state !== 'back') s.state = 'back';
    const ground = this.active ? this.screenPos().ground : null;
    if (s.state === 'out') {
      climb(c.alt, 160);
      if (s.plane === 'heli_military') {
        // hovers beside the UFO and fires its rockets
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

  fire(kind, from, time, { air = false } = {}) {
    const S = SHOTS[kind];
    this.shots.push({ kind, x: from.x, y: from.y, speed: S.speed, t0: time, boost: air ? 0 : S.boost || 0, trail: [], jitter: { x: rand(-120, 120), y: rand(-30, 30) } });
  }

  stepShots(time, dt) {
    if (!this.active) {
      this.shots = [];
      return;
    }
    const u = this.ufo;
    const p = this.screenPos();
    const g = this.g;
    this.shots = this.shots.filter((s) => {
      const S = SHOTS[s.kind];
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
        u.hp -= S.dmg;
        if (s.kind === 'rocket') this.rocketBlast(tx, ty, time);
        else {
          this.sparks.emitParticleAt(tx, ty, s.kind === 'bullet' ? 2 : 10);
          if (s.kind !== 'bullet') this.smoke.emitParticleAt(tx, ty, 2);
        }
        if (u.hp <= 0 && !u.leaving) this.leave(true);
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

  // The big flash when the UFO is shot down.
  // A rocket hitting the UFO: a fireball, a shock ring, lots of sparks and smoke, and a small shake.
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

  drawFlash(time) {
    const f = this.flash;
    if (!f) return;
    const t = (time - f.t0) / 1200;
    if (t >= 1) {
      this.flash = null;
      return;
    }
    const g = this.g;
    g.fillStyle(0xfff3c4, 0.9 * (1 - t));
    g.fillCircle(f.x, f.y, 120 + 380 * t);
    g.fillStyle(0xff8a2a, 0.7 * (1 - t));
    g.fillCircle(f.x, f.y, 80 + 220 * t);
  }
}
