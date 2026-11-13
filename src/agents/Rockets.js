import Phaser from 'phaser';
import { DEPTH } from '../constants.js';
import { rand } from '../rng.js';

// Rocket pads (a building with `rocket` in the theme): a rocket stands on the pad, fires its engines
// in a cloud of smoke, climbs straight up faster and faster until it is gone into space, and after a
// while a new rocket is put on the pad.

const APPEAR_MS = 1500; // a new rocket fades in on the pad
const READY = [9000, 16000]; // ms it stands on the pad before the engines start
const IGNITE_MS = 2200; // engines on, still held down: flames and smoke building up
const ACCEL = 140; // px per second², straight up
const GONE = 2600; // px above the pad: it is out in space
const FADE = 900; // px before GONE where it starts to fade out
const TO_AIR = 160; // px above the pad: from here on it is drawn over everything
const SMOKE_UNTIL = 500; // px above the pad: the ground cloud keeps growing until here

export class Rockets {
  constructor(scene, world) {
    this.scene = scene;
    this.pads = new Map();
    this.g = scene.add.graphics();
    const smoke = (cfg) => {
      const e = scene.add.particles(0, 0, 'fx_smoke', { emitting: false, tint: 0xf2f0ec, ...cfg }).setDepth(DEPTH.AIR - 5);
      e.nightBase = 0xf2f0ec; // darker at night (src/world/DayNight.js)
      return e;
    };
    // the cloud that rolls out over the ground round the pad
    this.cloud = smoke({
      lifespan: { min: 3000, max: 5000 }, speedX: { min: -170, max: 170 }, speedY: { min: -30, max: 30 },
      scale: { start: 3, end: 9 }, alpha: { start: 0.85, end: 0 },
    });
    // the trail it leaves in the sky
    this.trail = smoke({
      lifespan: { min: 2200, max: 3600 }, speedX: { min: -14, max: 14 }, speedY: { min: 10, max: 40 },
      scale: { start: 2.2, end: 7 }, alpha: { start: 0.8, end: 0 },
    });
    // sparks of fire blown out under the engines
    this.fire = scene.add.particles(0, 0, 'fx_flame', {
      lifespan: { min: 180, max: 380 }, speedX: { min: -70, max: 70 }, speedY: { min: 160, max: 340 },
      scale: { start: 2.2, end: 0.4 }, alpha: { start: 1, end: 0 }, blendMode: Phaser.BlendModes.ADD, emitting: false,
    });
    // fire that hits the pad and splashes out sideways, while the rocket is still on (or just over) it
    this.splash = scene.add.particles(0, 0, 'fx_flame', {
      lifespan: { min: 200, max: 420 }, speedX: { min: -220, max: 220 }, speedY: { min: -40, max: 20 },
      scale: { start: 2.4, end: 0.5 }, alpha: { start: 1, end: 0 }, blendMode: Phaser.BlendModes.ADD, emitting: false,
    });
    world.onBuilding((b) => {
      if (b.def.rocket) this.pads.set(b.id, { b, rocket: null, next: scene.time.now + rand(1500, 4000) });
    }, (b) => {
      const pad = this.pads.get(b.id);
      if (pad?.rocket) this.drop(pad.rocket);
      this.pads.delete(b.id);
    });
  }

  // Where the rocket stands: the middle of the pad's ring, in world px (the building's picture has to be up).
  spot(b) {
    const view = this.scene.views?.get(b.id);
    if (!view) return null;
    const r = b.def.rocket;
    return view.picturePoint(r.px, r.py);
  }

  spawn(pad, time) {
    const at = this.spot(pad.b);
    if (!at || !this.scene.textures.exists('rocket')) {
      pad.next = time + 3000;
      return;
    }
    const b = pad.b;
    // in front of the pad's own picture, behind anything built in front of it
    const depth = b.x + b.y + b.w + b.d - 0.4;
    const im = this.scene.add.image(at.x, at.y, 'rocket').setOrigin(0.5, 1).setDepth(depth).setAlpha(0);
    const glow = this.scene.add.image(at.x, at.y, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7a28).setAlpha(0);
    pad.rocket = { im, glow, at, depth, state: 'ready', t0: time, until: time + rand(...READY), rise: 0, v: 0 };
  }

  drop(r) {
    r.im.destroy();
    r.glow.destroy();
  }

  update(time, dt) {
    this.g.clear();
    for (const pad of this.pads.values()) {
      if (!pad.rocket) {
        if (time > pad.next) this.spawn(pad, time);
        continue;
      }
      this.step(pad, pad.rocket, time, dt);
    }
  }

  step(pad, r, time, dt) {
    if (r.state === 'ready') {
      r.im.setAlpha(Math.min(1, (time - r.t0) / APPEAR_MS));
      if (time > r.until) {
        r.state = 'ignite';
        r.t0 = time;
      }
      return;
    }
    let power;
    if (r.state === 'ignite') {
      // the engines come up to full power; the rocket shakes on the pad
      const k = Math.min(1, (time - r.t0) / IGNITE_MS);
      power = 0.25 + 0.75 * k;
      r.im.x = r.at.x + (Math.random() < 0.5 ? -1 : 1) * (k > 0.4 ? 1 : 0);
      this.billow(r, 1 + Math.round(3 * k));
      if (k >= 1) {
        r.state = 'launch';
        r.im.x = r.at.x;
        if (this.onScreen(r.at)) this.scene.cameras.main.shake(2600, 0.004);
      }
    } else {
      // lift off: faster and faster, straight up
      power = 1;
      r.v += ACCEL * dt;
      r.rise += r.v * dt;
      if (r.rise < SMOKE_UNTIL) this.billow(r, 4);
      if (r.rise > TO_AIR) r.im.setDepth(DEPTH.AIR + 1);
      r.im.y = r.at.y - r.rise;
      r.im.setAlpha(Phaser.Math.Clamp((GONE - r.rise) / FADE, 0, 1));
      if (r.rise > GONE) {
        this.drop(r);
        pad.rocket = null;
        pad.next = time + rand(...(pad.b.def.rocket.rest || [25000, 45000]));
        return;
      }
    }
    this.thruster(r, power);
  }

  // The engine flame under the rocket: a long, flickering cone of white, yellow and orange fire with a glow round it.
  thruster(r, power) {
    // the fire shows through its own smoke cloud
    const top = Math.max(r.im.depth, DEPTH.AIR - 4);
    const g = this.g.setDepth(top + 0.001);
    const x = r.im.x;
    const y = r.im.y - 4; // the nozzles, just above the bottom of the picture
    const fade = r.im.alpha;
    const flick = 0.85 + Math.random() * 0.3;
    // on the pad the flame can't go further down than the ground: it splashes out sideways instead
    const ground = r.rise + 10;
    const len = Math.min((r.state === 'launch' ? 150 : 70) * power * flick, ground + 18);
    const w = 22 * (0.7 + 0.3 * power);
    const cone = (wd, l, col, al) => {
      g.fillStyle(col, al * fade);
      g.fillTriangle(x - wd / 2, y, x + wd / 2, y, x, y + l);
      g.fillEllipse(x, y + 2, wd, wd * 0.6);
    };
    cone(w * 2.4, len * 1.2, 0xff4a12, 0.3);
    cone(w * 1.6, len, 0xff7a1e, 0.8);
    cone(w * 1.1, len * 0.72, 0xffc23a, 0.95);
    cone(w * 0.7, len * 0.48, 0xfff07a, 1);
    cone(w * 0.4, len * 0.26, 0xffffff, 1);
    // a bright shock glow at the nozzle and a light all round, strong even by day
    r.glow.setPosition(x, y + len * 0.3).setDepth(top + 0.002)
      .setScale((1 + 0.6 * power) * flick, (1.4 + 1.2 * power) * flick).setAlpha((0.5 + 0.4 * power) * fade);
    // fire blown out under the engines, and the smoke trail once it is in the air
    this.fire.setDepth(top + 0.003);
    if (ground < 70) {
      this.splash.setDepth(top + 0.003);
      this.splash.emitParticleAt(x + rand(-6, 6), r.at.y + rand(-4, 2), Math.round(5 * power));
    } else this.fire.emitParticleAt(x + rand(-5, 5), y + len * 0.45, Math.round(5 * power));
    if (r.state === 'launch' && r.rise > 40 && Math.random() < 0.9) this.trail.emitParticleAt(x + rand(-5, 5), y + len * 0.9, 1);
  }

  // Thick smoke rolling out over the ground from under the rocket.
  billow(r, n) {
    for (let k = 0; k < n; k++) this.cloud.emitParticleAt(r.at.x + rand(-26, 26), r.at.y + rand(-14, 6), 1);
  }

  onScreen(p) {
    const v = this.scene.cameras.main.worldView;
    return p.x > v.x - 200 && p.x < v.right + 200 && p.y > v.y - 200 && p.y < v.bottom + 400;
  }
}
