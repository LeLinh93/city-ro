import { DEPTH } from '../constants.js';
import { toWorld } from '../iso.js';
import { pick, rand } from '../rng.js';
import { vehicleSprite, faceVehicle, hasVehicle } from './vehicleArt.js';
import { healthBar } from './Military.js';

// The UFO: one at a time. It hovers over the city, now and then burns a block with a blue laser,
// and the military (Military.js) fights back until its health runs out. It doesn't lock the build bar like the
// other disasters; tapping it shows a 🗑️ button that takes it away.

const HP = 2000;
const ALT = 320; // how high it flies, px
const SPEED_SQ = 0.45; // squares per second
const LASER_EVERY = [6000, 9500]; // ms between laser shots
const LASER_CHARGE = 900; // ms of glowing before the beam
const LASER_BEAM = 700; // ms the beam is on
const BOTTOM = 0.47; // the saucer's bottom lip, below its middle, as a part of the picture's height
const ZAP_EVERY = 20000; // ms between shots of the small side laser, which destroys one tank or plane nearby
const ZAP_RANGE = 1100; // px from the UFO
const ZAP_MS = 400; // how long the small beam shows
// Blue lights at night, on the ring of lights round the bottom of the saucer (px from the middle of the picture).
// They flash together like a plane's blinking light: bright for BLINK_ON ms every BLINK_MS.
const RIM_LIGHTS = [[-334, 94], [-294, 124], [-240, 151], [-165, 173], [-102, 185], [-27, 192],
  [56, 190], [115, 181], [187, 166], [244, 146], [292, 123], [333, 94]];
const BLINK_MS = 1200;
const BLINK_ON = 180;

export class Ufo {
  constructor(scene, world, { military, disasters }) {
    this.scene = scene;
    this.world = world;
    this.military = military;
    this.disasters = disasters;
    this.ufo = null;
    this.spread = { x: 120, y: 30 }; // where shots land round its middle
    this.g = scene.add.graphics().setDepth(DEPTH.AIR + 2000);
    this.shadow = scene.add.graphics().setDepth(DEPTH.SHADOW); // the UFO's shadow, on the ground under everything
    military.add(this);
  }

  get active() {
    return !!this.ufo && !this.ufo.leaving;
  }

  // ---------- what the military needs to know (see Military.js) ----------

  get alive() {
    return this.active;
  }

  ground() {
    return { x: this.ufo.x, y: this.ufo.y };
  }

  aim() {
    return this.screenPos();
  }

  hurt(dmg) {
    const u = this.ufo;
    u.hp -= dmg;
    if (u.hp <= 0 && !u.leaving) this.leave(true);
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

  // The UFO goes: shot down (with an explosion) or taken away.
  leave(exploded) {
    const u = this.ufo;
    u.leaving = true;
    u.laser = null;
    if (exploded) {
      const p = this.screenPos();
      this.military.explode(p.x, p.y);
    }
    this.scene.tweens.add({
      targets: u.im, alpha: 0, duration: exploded ? 500 : 700,
      onComplete: () => {
        u.im.destroy();
        u.lights?.forEach((l) => l.destroy());
        if (this.ufo === u) this.ufo = null;
      },
    });
    this.scene.events.emit('ufo', false, exploded);
  }

  update(time, dt) {
    this.g.clear();
    this.shadow.clear();
    if (this.active) {
      this.moveUfo(time, dt);
      this.laser(time);
      this.zap(time);
    }
    if (this.ufo) this.renderUfo(time);
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
    // its shadow on the ground
    this.shadow.fillStyle(0x000000, 0.18 * u.im.alpha);
    this.shadow.fillEllipse(p.ground.x, p.ground.y, u.im.displayWidth * 0.8, u.im.displayWidth * 0.32);
    if (u.leaving) return;
    const b = u.im.getBounds();
    healthBar(this.g, b.centerX, b.y, u.hp, HP);
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
      // the beam lands: a 4 x 4 block is ruined, and buildings in the 8 x 8 around it catch fire
      L.fired = true;
      this.military.strike(L.at, time);
      this.scene.cameras.main.shake(400, 0.005, true);
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
    const near = this.military.units(time).filter((t) => Math.hypot(t.x - center.x, t.y - center.y) <= ZAP_RANGE);
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
    this.military.sparks.emitParticleAt(t.x, t.y, 22);
    this.military.smoke.emitParticleAt(t.x, t.y, 6);
  }
}
