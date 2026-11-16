import Phaser from 'phaser';
import { DEPTH } from '../constants.js';
import { toWorld, toGrid } from '../iso.js';
import { rand } from '../rng.js';
import { vehicleSprite, faceVehicle, hasVehicle, vehicleShadow, placeShadow } from './vehicleArt.js';

// Things that fly over a space city (src/themes/space.js) on their own:
//  - fleet: each military port has a battleship that rises from it and flies round the map, keeping to the
//    square's directions (it only has 4 views). Military.js has it fire rockets and send interceptors at monsters.
//  - mine: each mineral mine has a mining drone parked on its pad. Rocks with blue crystals in them float on the
//    lava; the drone flies to one, breaks it up with its laser, takes the crystals home, lands on the pad, unloads
//    them, and goes again. With no lava on the map there are no rocks, and it stays on its pad.

const SHIP_ALT = 230; // px: how high the battleships fly
const SHIP_RISE = 45; // px per second, rising from the port
const SHIP_SPEED = 0.8; // squares per second
const EDGE = 6; // squares: battleships keep this far inside the map

const DRONE_ALT = 120; // px
const DRONE_CLIMB = 70; // px per second
const DRONE_SPEED = 2.4; // squares per second
const MINE_MS = 3200; // the laser breaking a rock up
const UNLOAD_MS = 2400;
const REST = [2500, 6000]; // ms on the pad between trips
const ROCKS = 2; // rocks floating on the lava for each mine (one is being mined, one waits)
const NEAREST = 40; // a new rock floats on one of the this many open lava squares nearest to its mine
const ROCK_EVERY = [3000, 7000]; // ms between new rocks
const CYAN = 0x5fe3ff;

export class Skyships {
  constructor(scene, world, services) {
    this.scene = scene;
    this.world = world;
    this.services = services; // for points of building pictures
    this.ships = []; // battleships: { b, v, shadow, x, y (squares), alt, dir, leg, state }
    this.mines = new Map(); // mine id -> { b, pad, drone, rockAt }
    this.rocks = []; // { i, j, im, mine, taken }
    this.g = scene.add.graphics().setDepth(DEPTH.AIR + 1500);
    this.sparks = scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 250, max: 600 }, speed: { min: 30, max: 140 }, tint: CYAN, blendMode: Phaser.BlendModes.ADD,
      scale: { start: 0.45, end: 0 }, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(DEPTH.AIR + 1501);
    this.makeTextures();
    // a ruined building counts as gone until it is repaired
    world.onBuilding((b) => {
      const f = b.def.fleet;
      if (f && hasVehicle(scene, f.ship)) this.launchShip(b, f.ship);
      if (b.def.mine && hasVehicle(scene, 'miningdrone')) this.addMine(b);
    }, (b) => {
      for (const s of this.ships.filter((s) => s.b === b)) this.removeShip(s);
      const m = this.mines.get(b.id);
      if (m) this.removeMine(m);
    });
  }

  update(time, dt) {
    this.g.clear();
    for (const s of this.ships) this.stepShip(s, time, dt);
    // rocks on squares that are not lava any more are gone
    for (const r of [...this.rocks]) if (!this.world.isWater(r.i, r.j)) this.removeRock(r);
    for (const m of this.mines.values()) {
      if (time > m.rockAt) {
        m.rockAt = time + rand(...ROCK_EVERY);
        if (this.rocks.filter((r) => r.mine === m).length < ROCKS) this.addRock(m);
      }
      this.stepDrone(m, time, dt);
    }
    for (const r of this.rocks) this.drawRock(r, time);
  }

  // ---------- battleships ----------

  launchShip(b, id) {
    const v = vehicleSprite(this.scene, id, null);
    const s = {
      b, v, shadow: vehicleShadow(this.scene, v), x: b.x + b.w / 2, y: b.y + b.d / 2, alt: 20,
      dir: [1, 0], leg: null, state: 'rise', bob: Math.random() * 6,
    };
    v.im.setAlpha(0);
    this.scene.tweens.add({ targets: v.im, alpha: 1, duration: 1200 });
    this.ships.push(s);
  }

  removeShip(s) {
    this.ships = this.ships.filter((o) => o !== s);
    s.gone = true;
    this.scene.tweens.add({
      targets: [s.v.im, s.shadow], alpha: 0, duration: 600,
      onComplete: () => { s.v.im.destroy(); s.shadow.destroy(); },
    });
  }

  // The next stretch: straight along x or y (turning as it goes) to somewhere well inside the map.
  nextLeg(s) {
    const n = this.world.size;
    const along = s.dir[0] !== 0 ? 1 : 0; // turn: go along the other direction this time
    const cur = along === 0 ? s.x : s.y;
    let to = rand(EDGE, n - EDGE);
    if (Math.abs(to - cur) < 8) to = cur + (cur < n / 2 ? 1 : -1) * rand(8, 20);
    to = Math.max(EDGE, Math.min(n - EDGE, to));
    s.leg = { along, to };
    s.dir = along === 0 ? [Math.sign(to - cur) || 1, 0] : [0, Math.sign(to - cur) || 1];
  }

  stepShip(s, time, dt) {
    if (s.state === 'rise') {
      s.alt = Math.min(SHIP_ALT, s.alt + SHIP_RISE * dt);
      if (s.alt >= SHIP_ALT) s.state = 'fly';
    } else {
      if (!s.leg) this.nextLeg(s);
      const key = s.leg.along === 0 ? 'x' : 'y';
      const d = s.leg.to - s[key];
      const step = SHIP_SPEED * dt;
      if (Math.abs(d) <= step) {
        s[key] = s.leg.to;
        s.leg = null;
      } else s[key] += Math.sign(d) * step;
    }
    const p = toWorld(s.x, s.y);
    const bob = Math.sin(time / 900 + s.bob) * 4;
    faceVehicle(s.v, s.dir[0], s.dir[1]);
    s.v.im.setPosition(Math.round(p.x), Math.round(p.y - s.alt + bob)).setDepth(DEPTH.AIR + s.alt);
    placeShadow(s.shadow, s.v, p.x + 10, p.y + 8, 0.16 * s.v.im.alpha, DEPTH.SHADOW, 0.85);
  }

  // ---------- mining ----------

  addMine(b) {
    const cfg = b.def.mine;
    const pad = this.services.picturePoint(b, cfg.px, cfg.py);
    const v = vehicleSprite(this.scene, 'miningdrone', null);
    const drone = {
      v, shadow: vehicleShadow(this.scene, v), x: pad.x, y: pad.y, alt: 0, dir: [0, 1],
      state: 'parked', until: this.scene.time.now + rand(1500, 4000), rock: null, cargo: null,
    };
    const m = { b, pad, drone, rockAt: this.scene.time.now + 500, parkDepth: b.x + b.y + b.w + b.d - 0.45 };
    v.im.setAlpha(0);
    this.scene.tweens.add({ targets: v.im, alpha: 1, duration: 500 });
    this.mines.set(b.id, m);
    this.drawDrone(m, this.scene.time.now);
  }

  removeMine(m) {
    this.mines.delete(m.b.id);
    const d = m.drone;
    const parts = [d.v.im, d.shadow, d.cargo].filter(Boolean);
    this.scene.tweens.add({ targets: parts, alpha: 0, duration: 400, onComplete: () => parts.forEach((p) => p.destroy()) });
    for (const r of this.rocks.filter((r) => r.mine === m)) this.removeRock(r);
  }

  // A new rock on open lava (lava all round it), on one of the free squares nearest to the mine (not next to
  // another rock).
  addRock(m) {
    const w = this.world;
    const cx = m.b.x + m.b.w / 2;
    const cy = m.b.y + m.b.d / 2;
    const open = (i, j) => {
      for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) if (!w.inBounds(i + a, j + c) || !w.isWater(i + a, j + c)) return false;
      return true;
    };
    const list = [];
    for (let j = 1; j < w.size - 1; j++) {
      for (let i = 1; i < w.size - 1; i++) {
        if (!w.isWater(i, j) || !open(i, j)) continue;
        if (this.rocks.some((r) => Math.abs(r.i - i) < 4 && Math.abs(r.j - j) < 4)) continue;
        list.push([Math.hypot(i + 0.5 - cx, j + 0.5 - cy), i, j]);
      }
    }
    if (!list.length) return; // no lava: no rocks
    list.sort((a, b) => a[0] - b[0]);
    const [, i, j] = list[Math.floor(Math.random() * Math.min(NEAREST, list.length))];
    const p = toWorld(i + 0.5, j + 0.5);
    const im = this.scene.add.image(p.x, p.y, 'space_rock_crystal').setOrigin(0.5, 0.75).setDepth(i + j + 1).setAlpha(0);
    this.scene.tweens.add({ targets: im, alpha: 1, duration: 800 });
    this.rocks.push({ i, j, x: p.x, y: p.y, im, mine: m, taken: null, phase: Math.random() * 6, hit: 0 });
  }

  removeRock(r, burst = false) {
    this.rocks = this.rocks.filter((o) => o !== r);
    if (r.taken && r.taken.rock === r) r.taken.rock = null;
    if (burst) {
      this.sparks.emitParticleAt(r.x, r.y - 10, 26);
      r.im.destroy();
    } else this.scene.tweens.add({ targets: r.im, alpha: 0, duration: 500, onComplete: () => r.im.destroy() });
  }

  drawRock(r, time) {
    // floats on the lava, rising and falling a little; shakes while the laser is on it
    const shake = r.hit ? rand(-1.5, 1.5) : 0;
    r.im.setPosition(r.x + shake, r.y + Math.sin(time / 700 + r.phase) * 2.5);
    r.im.setScale(1.5 * (1 - r.hit * 0.35));
  }

  stepDrone(m, time, dt) {
    const d = m.drone;
    const toward = (px, py) => {
      const dx = px - d.x;
      const dy = py - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const g = toGrid(dx, dy);
        d.dir = [g.fx, g.fy];
      }
      const step = DRONE_SPEED * 64 * dt; // about DRONE_SPEED squares a second
      if (dist <= step) {
        d.x = px;
        d.y = py;
        return true;
      }
      d.x += (dx / dist) * step;
      d.y += (dy / dist) * step;
      return false;
    };
    const climbTo = (alt) => {
      const step = DRONE_CLIMB * dt;
      d.alt = Math.abs(alt - d.alt) <= step ? alt : d.alt + Math.sign(alt - d.alt) * step;
      return d.alt === alt;
    };
    switch (d.state) {
      case 'parked': {
        if (time < d.until) break;
        // the nearest rock nobody is after
        let best = null;
        for (const r of this.rocks) {
          if (r.taken) continue;
          if (!best || Math.hypot(r.x - d.x, r.y - d.y) < Math.hypot(best.x - d.x, best.y - d.y)) best = r;
        }
        if (!best) {
          d.until = time + 2000; // no lava, or no rock yet: stays on its pad
          break;
        }
        best.taken = d;
        d.rock = best;
        d.state = 'up';
        break;
      }
      case 'up':
        if (climbTo(DRONE_ALT)) d.state = 'go';
        break;
      case 'go':
        if (!d.rock) {
          d.state = 'back';
          break;
        }
        climbTo(DRONE_ALT);
        if (toward(d.rock.x, d.rock.y + 2)) {
          d.state = 'mine';
          d.until = time + MINE_MS;
        }
        break;
      case 'mine': {
        const r = d.rock;
        if (!r) {
          d.state = 'back';
          break;
        }
        r.hit = 1 - Math.max(0, d.until - time) / MINE_MS;
        // the laser: from under the drone down to the rock
        const fx = d.x;
        const fy = d.y - d.alt + 18;
        const flick = 0.7 + Math.random() * 0.3;
        this.g.lineStyle(6, CYAN, 0.35 * flick);
        this.g.lineBetween(fx, fy, r.x, r.y - 12);
        this.g.lineStyle(2, 0xe6fbff, flick);
        this.g.lineBetween(fx, fy, r.x, r.y - 12);
        if (Math.random() < 0.5) this.sparks.emitParticleAt(r.x + rand(-10, 10), r.y - 12 + rand(-6, 6), 1);
        if (time > d.until) {
          // broken up: the crystals go up into the drone's hold, the rock is gone
          this.removeRock(r, true);
          d.rock = null;
          d.cargo = this.scene.add.image(d.x, fy, 'space_crystal').setOrigin(0.5, 0).setScale(1.3);
          d.state = 'back';
        }
        break;
      }
      case 'back':
        climbTo(DRONE_ALT);
        if (toward(m.pad.x, m.pad.y)) {
          d.state = 'down';
          d.dir = [0, 1];
        }
        break;
      case 'down':
        if (climbTo(0)) {
          d.state = d.cargo ? 'unload' : 'parked';
          d.until = time + (d.cargo ? UNLOAD_MS : rand(...REST));
        }
        break;
      case 'unload':
        if (d.cargo && !d.cargo.unloading) {
          // the crystals go down into the mine
          d.cargo.unloading = true;
          const c = d.cargo;
          this.sparks.emitParticleAt(d.x, d.y, 10);
          this.scene.tweens.add({ targets: c, alpha: 0, scale: 0.3, y: c.y + 14, duration: UNLOAD_MS * 0.8, onComplete: () => c.destroy() });
        }
        if (time > d.until) {
          d.cargo = null;
          d.state = 'parked';
          d.until = time + rand(...REST);
        }
        break;
      default:
    }
    this.drawDrone(m, time);
  }

  drawDrone(m, time) {
    const d = m.drone;
    const flying = d.alt > 2;
    const bob = flying ? Math.sin(time / 280) * 2.5 : 0;
    faceVehicle(d.v, d.dir[0], d.dir[1]);
    d.v.im.setPosition(Math.round(d.x), Math.round(d.y - d.alt + bob));
    d.v.im.setDepth(flying ? DEPTH.AIR + d.alt : m.parkDepth);
    if (d.cargo && !d.cargo.unloading) d.cargo.setPosition(Math.round(d.x), Math.round(d.y - d.alt + bob + 10)).setDepth(d.v.im.depth - 0.01);
    const lift = Math.min(1, d.alt / 300);
    placeShadow(d.shadow, d.v, d.x + 5, d.y + 4, 0.2 * (1 - lift * 0.5) * d.v.im.alpha,
      flying ? DEPTH.SHADOW : m.parkDepth - 0.001, 1 - lift * 0.25);
  }

  // The floating rock with crystals in it, and a handful of loose crystals (the drone's load), drawn once.
  makeTextures() {
    const scene = this.scene;
    if (scene.textures.exists('space_rock_crystal')) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const crystal = (x, y, h, w, lean) => {
      // a long six-sided crystal: light face, dark face, white edge
      g.fillStyle(0x2fb8e6, 1);
      g.fillTriangle(x - w, y, x + lean, y - h, x, y + 2);
      g.fillStyle(0x8ff0ff, 1);
      g.fillTriangle(x, y + 2, x + lean, y - h, x + w, y);
      g.lineStyle(1, 0xe8fdff, 0.9);
      g.lineBetween(x, y + 1, x + lean, y - h);
    };
    // the rock: dark, lumpy, a lighter top, and a ring of glowing lava round its foot
    g.fillStyle(0xffb43a, 0.55);
    g.fillEllipse(36, 44, 66, 18);
    g.fillStyle(0x3b3633, 1);
    g.fillEllipse(36, 40, 56, 20);
    g.fillStyle(0x56504b, 1);
    g.fillPoints([{ x: 10, y: 40 }, { x: 16, y: 26 }, { x: 30, y: 20 }, { x: 46, y: 22 }, { x: 60, y: 32 }, { x: 62, y: 41 }, { x: 36, y: 48 }], true);
    g.fillStyle(0x6e6762, 1);
    g.fillPoints([{ x: 17, y: 30 }, { x: 30, y: 22 }, { x: 45, y: 24 }, { x: 52, y: 31 }, { x: 34, y: 34 }], true);
    crystal(26, 30, 22, 5, -3);
    crystal(37, 28, 30, 6, 1);
    crystal(47, 31, 18, 5, 4);
    crystal(31, 33, 12, 4, -6);
    g.generateTexture('space_rock_crystal', 72, 56);
    g.clear();
    crystal(8, 18, 14, 4, -2);
    crystal(14, 19, 18, 4, 1);
    crystal(20, 18, 12, 4, 3);
    g.generateTexture('space_crystal', 28, 22);
    g.destroy();
  }
}
