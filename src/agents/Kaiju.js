import { DEPTH, GROUND } from '../constants.js';
import { toWorld, sideFromDir } from '../iso.js';
import { pick, rand } from '../rng.js';
import { KAIJU, KAIJU_FRAMES as F } from '../data/kaiju.js';
import { assetUrl } from '../scenes/BootScene.js';
import { healthBar } from './Military.js';

// The kaiju: one at a time. It comes out of the sea at a beach (or in from the edge of the map if there is no
// beach) and walks into the city, ruining whatever it steps on. Every few steps it stops and roars, and a thick
// blue beam from its mouth sweeps forward over the ground. Every 20 s a blue ring of energy goes out from it and
// destroys every vehicle close by. The military (Military.js) fights it like the UFO. Like the UFO it doesn't lock
// the build bar, and tapping it shows a 🗑️ button that takes it away.

const HP = 4000;
const SPEED_SQ = 0.55; // squares per second while walking
const FRAME_MS = 160; // per walking frame (12 frames = 2 steps)
const STEP_FRAMES = [0, 6]; // walking frames where a foot comes down
const STOMP = 3; // squares: the block under a foot that is ruined
const ROAR_AFTER = [6, 10]; // steps between roars
const ROAR_MS = 180; // per frame of opening (and closing) its mouth
const BEAM_MS = 2000; // how long the beam lasts
const BEAM_AHEAD = 6; // squares in front of it where the beam first hits
const BEAM_SWEEP = 3; // squares the beam moves forward while it lasts
const BEAM_RUIN = 4;
const BEAM_FIRE = 6;
const PULSE_EVERY = 20000; // ms between energy rings
const PULSE_MS = 900; // how long the ring takes to spread
const PULSE_SIZE = 8; // squares: vehicles in this square round it are destroyed

// grid direction -> [view drawn, mirrored?]
const VIEW = { sw: ['sw', false], se: ['sw', true], ne: ['ne', false], nw: ['ne', true] };
const STEP = { se: [1, 0], sw: [0, 1], nw: [-1, 0], ne: [0, -1] };

export class Kaiju {
  constructor(scene, world, { military, disasters }) {
    this.scene = scene;
    this.world = world;
    this.military = military;
    this.disasters = disasters;
    this.k = null;
    this.spread = { x: 90, y: 110 };
    this.infantry = true; // soldiers come out of the barracks for it (Soldiers.js)
    this.g = scene.add.graphics().setDepth(DEPTH.AIR + 1900);
    this.shadow = scene.add.graphics().setDepth(DEPTH.SHADOW);
    military.add(this);
  }

  get active() {
    return !!this.k && !this.k.leaving;
  }

  // ---------- what the military needs to know (see Military.js) ----------

  get alive() {
    return this.active && this.k.shown;
  }

  ground() {
    return { x: this.k.x, y: this.k.y };
  }

  // its chest
  aim() {
    const k = this.k;
    const [view] = VIEW[k.side];
    const up = (KAIJU.feet[view][1] - KAIJU.mouth[view][1]) * KAIJU.scale;
    return { x: k.im.x, y: k.im.y - up * 0.6 };
  }

  hurt(dmg, time) {
    const k = this.k;
    k.hp -= dmg;
    if (dmg >= 5) k.hitAt = time; // shells, bombs and rockets make it flash (not every bullet)
    if (k.hp <= 0 && !k.leaving) this.leave(true);
  }

  // ---------- coming and going ----------

  // Returns false if there already is one.
  spawn() {
    if (this.k) return false;
    const start = this.startPoint();
    const box = this.disasters.cityBounds();
    const time = this.scene.time.now;
    this.k = {
      x: start.x, y: start.y, side: 'sw', hp: HP, im: null, shown: false, t0: time,
      target: { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }, leg: null,
      state: 'walk', walkT: 0, lastFrame: -1, steps: 0, roarAt: Math.round(rand(...ROAR_AFTER)),
      nextPulse: time + PULSE_EVERY, pulse: null, beam: null, hitAt: -1e9,
    };
    const k = this.k;
    this.loadArt(() => {
      if (this.k !== k || k.leaving) return;
      k.im = this.scene.add.image(0, 0, 'kaiju_sw', F.stand).setAlpha(0);
      k.shown = true;
      k.t0 = this.scene.time.now;
      k.nextPulse = k.t0 + PULSE_EVERY;
      this.scene.events.emit('kaiju', true);
    });
    return true;
  }

  // A beach near the city: it comes out of the water just off it. Without a beach: the edge of the map.
  startPoint() {
    const w = this.world;
    const N = w.size;
    const box = this.disasters.cityBounds();
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const beaches = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        if (w.ground[w.idx(i, j)] !== GROUND.SAND) continue;
        for (const [di, dj] of Object.values(STEP)) {
          if (w.inBounds(i + di, j + dj) && w.ground[w.idx(i + di, j + dj)] === GROUND.WATER) {
            beaches.push({ x: i + 0.5 + di * 2, y: j + 0.5 + dj * 2, d: Math.hypot(i - cx, j - cy) });
            break;
          }
        }
      }
    }
    if (beaches.length) {
      beaches.sort((a, b) => a.d - b.d);
      const p = pick(beaches.slice(0, Math.max(1, Math.ceil(beaches.length * 0.25))));
      return { x: Math.min(N - 1, Math.max(1, p.x)), y: Math.min(N - 1, Math.max(1, p.y)) };
    }
    const along = rand(2, N - 2);
    return pick([{ x: along, y: 1 }, { x: along, y: N - 1 }, { x: 1, y: along }, { x: N - 1, y: along }]);
  }

  // Its pictures are big, so they are only loaded the first time a kaiju comes.
  loadArt(done) {
    const scene = this.scene;
    if (scene.textures.exists('kaiju_sw') && scene.textures.exists('kaiju_ne')) {
      done();
      return;
    }
    const L = scene.load;
    for (const view of ['sw', 'ne']) {
      const url = assetUrl(`assets/disaster/kaiju_${view}.png`);
      if (url && !scene.textures.exists(`kaiju_${view}`)) L.image(`kaiju_${view}`, url);
    }
    L.once('complete', () => {
      for (const view of ['sw', 'ne']) this.makeFrames(view);
      done();
    });
    L.start();
  }

  // Cut the game file into its frames (or, without the file, draw a plain stand-in).
  makeFrames(view) {
    const scene = this.scene;
    const key = `kaiju_${view}`;
    const count = F.roar + F.roarCount;
    const [x0, y0, x1, y1] = KAIJU.box[view];
    let fw = Math.round((x1 - x0) * KAIJU.scale);
    let fh = Math.round((y1 - y0) * KAIJU.scale);
    if (!scene.textures.exists(key)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      const [fx, fy] = this.feetPx(view);
      g.fillStyle(0x3d4a46).fillEllipse(fx, fy - fh * 0.35, fw * 0.45, fh * 0.7);
      g.fillStyle(0x8fe0d0).fillTriangle(fx - 30, fy - fh * 0.7, fx + 30, fy - fh * 0.7, fx, fy - fh * 0.85);
      g.generateTexture(key, fw, fh);
      g.destroy();
      const tex = scene.textures.get(key);
      for (let n = 0; n < count; n++) tex.add(n, 0, 0, 0, fw, fh);
      return;
    }
    const tex = scene.textures.get(key);
    if (tex.has(0)) return;
    const src = tex.getSourceImage();
    fw = src.width / KAIJU.cols;
    fh = src.height / Math.ceil(count / KAIJU.cols);
    for (let n = 0; n < count; n++) tex.add(n, 0, (n % KAIJU.cols) * fw, Math.floor(n / KAIJU.cols) * fh, fw, fh);
  }

  // The ground point under its middle in a frame of this view, in px from the frame's top left.
  feetPx(view) {
    const [x0, y0] = KAIJU.box[view];
    const [fx, fy] = KAIJU.feet[view];
    return [(fx - x0) * KAIJU.scale, (fy - y0) * KAIJU.scale];
  }

  // Was the world point (a tap) on the kaiju itself (not the empty space round it)?
  hit(pt) {
    if (!this.alive || !pt) return false;
    const im = this.k.im;
    const fw = im.frame.width;
    const fh = im.frame.height;
    const left = im.x - im.displayOriginX;
    const top = im.y - im.displayOriginY;
    for (const [ox, oy] of [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16]]) {
      let lx = Math.floor(pt.x + ox - left);
      const ly = Math.floor(pt.y + oy - top);
      if (lx < 0 || ly < 0 || lx >= fw || ly >= fh) continue;
      if (im.flipX) lx = fw - 1 - lx;
      if (this.scene.textures.getPixelAlpha(lx, ly, im.texture.key, im.frame.name) > 0) return true;
    }
    return false;
  }

  // Where the 🗑️ button goes: above its head, in CSS pixels.
  anchor() {
    if (!this.alive) return null;
    const cam = this.scene.cameras.main;
    const z = cam.zoom * this.scene.scale.zoom;
    const k = this.k;
    const [view] = VIEW[k.side];
    const head = k.im.y - (KAIJU.feet[view][1] - KAIJU.mouth[view][1]) * KAIJU.scale - 90;
    return { x: (k.im.x - cam.worldView.x) * z, y: (head - cam.worldView.y) * z };
  }

  remove() {
    if (!this.active) return false;
    this.leave(false);
    return true;
  }

  // It goes: defeated (an explosion, and it sinks away) or taken away.
  leave(defeated) {
    const k = this.k;
    k.leaving = true;
    k.beam = null;
    k.pulse = null;
    const done = () => {
      k.im?.destroy();
      if (this.k === k) this.k = null;
    };
    if (!k.im) done();
    else {
      if (defeated) {
        const a = this.aim();
        this.military.explode(a.x, a.y, 200, 200);
      }
      this.scene.tweens.add({ targets: k.im, alpha: 0, y: k.im.y + (defeated ? 60 : 0), duration: defeated ? 1200 : 700, onComplete: done });
    }
    this.scene.events.emit('kaiju', false, defeated);
  }

  // ---------- every frame ----------

  update(time, dt) {
    this.g.clear();
    this.shadow.clear();
    const k = this.k;
    if (!k?.im) return;
    if (!k.leaving) {
      k.im.setAlpha(Math.min(1, (time - k.t0) / 1200));
      if (k.state === 'walk') this.walk(time, dt);
      else this.roar(time);
      this.pulse(time);
    }
    this.render(time);
  }

  walk(time, dt) {
    const k = this.k;
    if (!k.leg) this.nextLeg();
    const [dx, dy] = STEP[k.side];
    const left = Math.abs(k.leg.x - k.x) + Math.abs(k.leg.y - k.y);
    const step = Math.min(left, SPEED_SQ * dt);
    k.x += dx * step;
    k.y += dy * step;
    if (step >= left) k.leg = null;
    k.walkT += dt * 1000;
    const frame = Math.floor(k.walkT / FRAME_MS) % F.walkCount;
    if (frame !== k.lastFrame) {
      if (STEP_FRAMES.includes(frame)) this.stomp(time);
      k.lastFrame = frame;
    }
    k.frame = F.walk + frame;
    // after a few steps: stop and roar (only once it is on land)
    if (k.steps >= k.roarAt && !this.world.isWater(Math.floor(k.x), Math.floor(k.y))) {
      k.state = 'roar';
      k.roarT = time;
    }
  }

  // The next straight stretch towards where it is going: along one grid line, so it always faces where it walks.
  nextLeg() {
    const k = this.k;
    let dx = k.target.x - k.x;
    let dy = k.target.y - k.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      const b = this.disasters.cityBounds(); // there: somewhere else in the city next
      k.target = { x: rand(b.x0, b.x1), y: rand(b.y0, b.y1) };
      dx = k.target.x - k.x;
      dy = k.target.y - k.y;
    }
    const len = rand(3, 7);
    if (Math.abs(dx) >= Math.abs(dy)) k.leg = { x: k.x + Math.sign(dx) * Math.min(Math.abs(dx), len), y: k.y };
    else k.leg = { x: k.x, y: k.y + Math.sign(dy) * Math.min(Math.abs(dy), len) };
    k.side = sideFromDir(k.leg.x - k.x, k.leg.y - k.y);
  }

  // A foot comes down: the block under it is ruined, and people and cars there are crushed.
  stomp(time) {
    const k = this.k;
    k.steps++;
    if (k.im.alpha < 0.5) return; // still coming out of the water
    const w = this.world;
    const h = STOMP / 2;
    const squares = [];
    for (const b of [...w.buildings.values()]) {
      if (b.x < k.x + h && b.x + b.w > k.x - h && b.y < k.y + h && b.y + b.d > k.y - h) w.ruinBuilding(b);
    }
    this.military.soldiers.killIn(k.x, k.y, h + 0.3);
    for (const t of this.disasters.near(k.x, k.y, h + 0.3)) {
      if (t.kind === 'car' && this.military.killIfTank(t.a, time)) continue;
      this.military.fade(this.disasters.take(t));
    }
    for (let j = Math.floor(k.y - h); j < k.y + h; j++) for (let i = Math.floor(k.x - h); i < k.x + h; i++) squares.push([i, j]);
    this.scene.fx.dustSquares(squares);
    this.scene.cameras.main.shake(120, 0.003, true);
  }

  // Roar: open the mouth, the beam for BEAM_MS sweeping forward, close the mouth, walk on.
  roar(time) {
    const k = this.k;
    const t = time - k.roarT;
    const open = ROAR_MS * F.roarCount;
    if (t < open) {
      k.frame = F.roar + Math.min(F.roarCount - 1, Math.floor(t / ROAR_MS));
      return;
    }
    if (t < open + BEAM_MS) {
      k.frame = F.roar + F.roarCount - 1;
      if (!k.beam) {
        const [dx, dy] = STEP[k.side];
        k.beam = { dx, dy, from: { x: k.x + dx * BEAM_AHEAD, y: k.y + dy * BEAM_AHEAD }, hits: 0 };
        this.scene.cameras.main.shake(BEAM_MS, 0.002, true);
      }
      this.beam(time, (t - open) / BEAM_MS);
      return;
    }
    k.beam = null;
    const c = t - open - BEAM_MS;
    if (c < ROAR_MS * F.roarCount) {
      k.frame = F.roar + F.roarCount - 1 - Math.floor(c / ROAR_MS);
      return;
    }
    k.state = 'walk';
    k.steps = 0;
    k.roarAt = Math.round(rand(...ROAR_AFTER));
  }

  // The mouth, in world px.
  mouth() {
    const k = this.k;
    const [view, flip] = VIEW[k.side];
    const ox = (KAIJU.mouth[view][0] - KAIJU.feet[view][0]) * KAIJU.scale;
    const oy = (KAIJU.mouth[view][1] - KAIJU.feet[view][1]) * KAIJU.scale;
    return { x: k.im.x + (flip ? -ox : ox), y: k.im.y + oy };
  }

  // The beam, `p` (0-1) of the way through: its end moves BEAM_SWEEP squares forward, ruining a block at each
  // square it reaches.
  beam(time, p) {
    const B = this.k.beam;
    const ahead = BEAM_SWEEP * p;
    while (B.hits <= Math.min(BEAM_SWEEP, Math.floor(ahead))) {
      this.military.strike({ x: B.from.x + B.dx * B.hits, y: B.from.y + B.dy * B.hits }, time, BEAM_RUIN, BEAM_FIRE);
      B.hits++;
    }
    const m = this.mouth();
    const hit = toWorld(B.from.x + B.dx * ahead, B.from.y + B.dy * ahead);
    const g = this.g;
    const flicker = 0.85 + 0.15 * Math.sin(time / 30);
    const fade = Math.min(1, p * 8, (1 - p) * 8); // quick on, quick off
    for (const [wd, col, al] of [[80, 0x2d8cff, 0.3], [46, 0x5fd0ff, 0.75], [18, 0xeefaff, 0.95]]) {
      g.lineStyle(wd * flicker * (0.5 + 0.5 * fade), col, al * fade);
      g.lineBetween(m.x, m.y, hit.x, hit.y);
    }
    // a glow at the mouth and a splash where it hits
    g.fillStyle(0x8fe3ff, 0.8 * fade);
    g.fillCircle(m.x, m.y, 26 * flicker);
    g.fillStyle(0x7fdcff, 0.5 * fade);
    g.fillEllipse(hit.x, hit.y, 260 * flicker, 120 * flicker);
    g.fillStyle(0xeefaff, 0.8 * fade);
    g.fillEllipse(hit.x, hit.y, 90 * flicker, 40 * flicker);
  }

  // Every PULSE_EVERY ms: a blue ring from its middle; every vehicle in the PULSE_SIZE square round it is destroyed.
  pulse(time) {
    const k = this.k;
    if (!k.pulse && time >= k.nextPulse) {
      k.pulse = { t0: time };
      k.nextPulse = time + PULSE_EVERY;
      const h = PULSE_SIZE / 2;
      const inBox = (x, y) => Math.abs(x - k.x) <= h && Math.abs(y - k.y) <= h;
      this.military.soldiers.killIn(k.x, k.y, h);
      for (const c of [...this.disasters.traffic.cars]) {
        if (c.leaving || !inBox(c.mover.px, c.mover.py)) continue;
        if (this.military.killIfTank(c, time)) continue;
        this.military.fade(this.disasters.traffic.take(c));
        this.military.sparks.emitParticleAt(toWorld(c.mover.px, c.mover.py).x, toWorld(c.mover.px, c.mover.py).y, 6);
      }
      for (const u of this.military.units(time)) {
        if (!inBox(u.ground.x, u.ground.y)) continue;
        u.kill(); // planes over it (tanks are done above)
        this.military.sparks.emitParticleAt(u.x, u.y, 14);
      }
    }
    if (!k.pulse) return;
    const t = (time - k.pulse.t0) / PULSE_MS;
    if (t >= 1) {
      k.pulse = null;
      return;
    }
    // the ring spreads from its chest down and out over the ground to the edge of the square
    const a = this.aim();
    const ground = toWorld(k.x, k.y);
    const grow = 1 - (1 - t) * (1 - t);
    const cx = a.x + (ground.x - a.x) * grow;
    const cy = a.y + (ground.y - a.y) * grow;
    const rw = 60 + (PULSE_SIZE * 128 - 60) * grow; // 8 squares across, on the ground
    const rh = 60 + (PULSE_SIZE * 64 - 60) * grow;
    const g = this.g;
    const fade = 1 - t;
    g.fillStyle(0x3aa8ff, 0.12 * fade);
    g.fillEllipse(cx, cy, rw, rh);
    g.lineStyle(18 * fade + 2, 0x2d8cff, 0.45 * fade);
    g.strokeEllipse(cx, cy, rw, rh);
    g.lineStyle(6 * fade + 1, 0xdff6ff, 0.95 * fade);
    g.strokeEllipse(cx, cy, rw, rh);
    if (t < 0.3) {
      g.fillStyle(0xbfeeff, 0.8 * (1 - t / 0.3));
      g.fillCircle(a.x, a.y, 50 + 80 * t);
    }
  }

  render(time) {
    const k = this.k;
    const [view, flip] = VIEW[k.side];
    const key = `kaiju_${view}`;
    const im = k.im;
    if (im.texture.key !== key) im.setTexture(key, k.frame ?? F.stand);
    else if (k.frame !== undefined && im.frame.name !== k.frame) im.setFrame(k.frame);
    const [fx, fy] = this.feetPx(view);
    const fw = im.frame.width;
    im.setFlipX(flip).setOrigin((flip ? fw - fx : fx) / fw, fy / im.frame.height);
    if (!k.leaving) {
      const p = toWorld(k.x, k.y);
      im.setPosition(Math.round(p.x), Math.round(p.y));
    }
    im.setDepth(k.x + k.y + 1.5);
    // a red flash when hit
    if (time - k.hitAt < 70) im.setTint(0xffd0c8);
    else im.clearTint();
    // its shadow on the ground
    this.shadow.fillStyle(0x000000, 0.2 * im.alpha);
    this.shadow.fillEllipse(im.x, im.y, 380, 150);
    if (k.leaving) return;
    healthBar(this.g, im.x, this.mouth().y - 60, k.hp, HP);
  }
}
