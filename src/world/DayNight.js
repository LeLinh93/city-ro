import Phaser from 'phaser';
import { DEPTH } from '../constants.js';
import { VEHICLES } from '../data/vehicles.js';
import { rand } from '../rng.js';

// Day and night. The clock runs from 0 to 24 hours; a whole day takes DAY_S seconds.
// At night everything on the map is tinted dark blue (a tint costs nothing to draw) and the lights come on:
// spotlights shining up the buildings (src/art/floodlight.js), lamps (def.glows), and the lights of cars,
// helicopters, planes and ships. Lights are never tinted.
export const DAY_S = 360;
const FAST = 8; // hours per second when skipping to the chosen time (Always day / Always night)
const MODES = ['auto', 'day', 'night'];
const MODE_KEY = 'citybuilder.daynight';
const NIGHT = 0x5c6ab4;

// Colour of the world through the day: [hour, tint].
const SKY = [
  [0, NIGHT], [4, NIGHT], [5, 0xe9b2c8], [6.3, 0xffffff],
  [19.5, 0xffffff], [20.8, 0xf4aa78], [22, NIGHT], [24, NIGHT],
];
// How much the lights are on: [hour, 0..1].
const LIGHT = [[0, 1], [4.6, 1], [5.8, 0], [19.9, 0], [21.5, 1], [24, 1]];

const lerp = (a, b, k) => a + (b - a) * k;
function curve(list, h, mix) {
  for (let n = 1; n < list.length; n++) {
    if (h <= list[n][0]) {
      const [h0, v0] = list[n - 1];
      const [h1, v1] = list[n];
      return mix(v0, v1, (h - h0) / (h1 - h0));
    }
  }
  return list[list.length - 1][1];
}
function mixColor(a, b, k) {
  const ch = (c, s) => {
    const v = Math.round(lerp((c >> s) & 255, (b >> s) & 255, k));
    return v >= 254 ? 255 : v & 0xfe; // even steps: fewer repaints
  };
  return (ch(a, 16) << 16) | (ch(a, 8) << 8) | ch(a, 0);
}
function mulColor(a, b) {
  const ch = (s) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// Soft round glow, flat ellipse (light on the ground) and a cone (car headlights), drawn once.
function makeTextures(scene) {
  const T = scene.textures;
  const make = (key, w, h, draw) => {
    if (T.exists(key)) return;
    const t = T.createCanvas(key, w, h);
    draw(t.context);
    t.refresh();
    t.setFilter(Phaser.Textures.FilterMode.LINEAR);
  };
  const radial = (c, x, y, r, stops) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
    return g;
  };
  make('fx_glow', 64, 64, (c) => {
    c.fillStyle = radial(c, 32, 32, 32, [[0, 1], [0.18, 0.85], [0.45, 0.25], [1, 0]]);
    c.fillRect(0, 0, 64, 64);
  });
  make('fx_pool', 128, 64, (c) => {
    c.scale(1, 0.5);
    c.fillStyle = radial(c, 64, 64, 64, [[0, 0.9], [0.5, 0.45], [1, 0]]);
    c.fillRect(0, 0, 128, 128);
  });
  make('fx_beam', 64, 32, (c) => {
    const g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 13);
    c.lineTo(64, 2);
    c.lineTo(64, 30);
    c.lineTo(0, 19);
    c.closePath();
    c.fill();
  });
}

const WARM = 0xffd68a;

export class DayNight {
  constructor(scene, hour) {
    this.scene = scene;
    this.hour = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 9;
    let mode = 'auto';
    try {
      mode = localStorage.getItem(MODE_KEY) || 'auto';
    } catch {
      // private browsing: always start on auto
    }
    this.mode = MODES.includes(mode) ? mode : 'auto';
    this.tint = 0xffffff;
    this.weatherTint = 0xffffff;
    this.level = -1;
    this.lights = new Set(); // { im, onAt, max }: building spotlights and lamps
    this.blinkers = new Set(); // the lights that blink
    this.twinklers = new Set(); // the lights that twinkle
    this.blinkOn = 1;
    this.vehicles = new Set(); // { v, kind, size, ims }
    this.emitters = new Set(); // particle emitters with a nightBase colour (smoke, foam)
    this.shownQuarter = -1;
    makeTextures(scene);
    // everything put on the map gets the colour of the time of day
    this.onAdded = (o) => this.paint(o);
    scene.sys.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded);
    scene.events.once('shutdown', () => scene.sys.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded));
  }

  // ---------- the clock ----------

  setMode(mode) {
    this.mode = MODES.includes(mode) ? mode : 'auto';
    try {
      localStorage.setItem(MODE_KEY, this.mode);
    } catch {
      // not saved: fine
    }
    this.scene.events.emit('clock', this.hour, this.mode);
  }

  nextMode() {
    this.setMode(MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]);
    return this.mode;
  }

  // The weather's colour on top of the time of day's (src/world/Weather.js).
  setWeatherTint(c) {
    this.weatherTint = c;
  }

  isNight() {
    return this.level > 0.5;
  }

  update(time, dt) {
    if (this.mode === 'auto') {
      this.hour = (this.hour + (dt * 24) / DAY_S) % 24;
    } else {
      // skip forward to noon or midnight, and stay there
      const target = this.mode === 'day' ? 12 : 0;
      const gap = (target - this.hour + 24) % 24;
      if (gap > 0.001 && gap < 23.999) this.hour = (this.hour + Math.min(gap, dt * FAST)) % 24;
    }
    const quarter = Math.floor(this.hour * 4);
    if (quarter !== this.shownQuarter) {
      this.shownQuarter = quarter;
      this.scene.events.emit('clock', this.hour, this.mode);
    }

    let tint = curve(SKY, this.hour, mixColor);
    if (this.weatherTint !== 0xffffff) tint = mixColor(mulColor(tint, this.weatherTint), 0, 0); // greyer in the rain
    if (tint !== this.tint) {
      this.tint = tint;
      for (const o of this.scene.children.list) this.paint(o);
      for (const e of this.emitters) {
        if (e.active) e.particleTint = mulColor(e.nightBase, tint);
        else this.emitters.delete(e);
      }
    }
    const level = Math.round(curve(LIGHT, this.hour, lerp) * 100) / 100;
    if (level !== this.level) {
      this.level = level;
      for (const l of this.lights) this.showLight(l);
    }
    // tower lights blink all together
    const blinkOn = time % 1400 < 260 ? 1 : 0.1;
    if (blinkOn !== this.blinkOn) {
      this.blinkOn = blinkOn;
      for (const l of this.blinkers) {
        if (!l.im.active) this.blinkers.delete(l);
        else if (l.a > 0) l.im.setAlpha(l.a * l.max * blinkOn);
      }
    }
    if (this.level > 0) {
      for (const l of this.twinklers) {
        if (!l.im.active) this.twinklers.delete(l);
        else if (l.a > 0) l.im.setAlpha(l.a * l.max * (0.65 + 0.35 * Math.sin(time * 0.003 + l.phase)));
      }
    }
    this.updateVehicles(time);
  }

  // ---------- tint ----------

  paint(o) {
    if (o.nightBase !== undefined) {
      this.emitters.add(o);
      o.particleTint = mulColor(o.nightBase, this.tint);
      return;
    }
    if (o.glow || !o.setTint || o.tintFill || o.depth >= DEPTH.GHOST) return;
    if (this.tint === 0xffffff) {
      if (o.isTinted) o.clearTint();
    } else o.setTint(this.tint);
  }

  // A light that is not tinted and shows only at night.
  glowImage(x, y, key, frame) {
    const im = this.scene.add.image(x, y, key, frame);
    im.glow = true;
    im.clearTint();
    return im.setVisible(false);
  }

  // ---------- building lights ----------

  // Lights come on one building after another in the evening: onAt is the light level (0..1) at which they do.
  // blink: true = blinks (red light on top of a tower), 'twinkle' = slowly brighter and dimmer (tower lights).
  addLight(im, { onAt = rand(0, 0.6), max = 1, blink = false } = {}) {
    const l = { im, onAt, max, blink, a: 0, phase: rand(0, Math.PI * 2) };
    this.lights.add(l);
    if (blink === 'twinkle') this.twinklers.add(l);
    else if (blink) this.blinkers.add(l);
    this.showLight(l);
    return l;
  }

  forget(list) {
    for (const l of list) {
      this.lights.delete(l);
      this.blinkers.delete(l);
      this.twinklers.delete(l);
    }
  }

  showLight(l) {
    if (!l.im.active) {
      this.lights.delete(l);
      return;
    }
    const a = Phaser.Math.Clamp((this.level - l.onAt) / 0.3, 0, 1);
    l.a = a;
    l.im.setVisible(a > 0).setAlpha(a * l.max * (l.blink === true ? this.blinkOn : 1));
  }

  // ---------- vehicle lights ----------

  addVehicle(v, id) {
    if (id === 'ufo') return; // glows by itself
    const kind = /^heli|^airplane|^fighterjet|^bomber/.test(id) ? 'air' : /ship$|^destroyer|carrier$/.test(id) ? 'ship' : 'car';
    this.vehicles.add({ v, kind, size: VEHICLES[id]?.width ?? 50, ims: null, shown: false });
  }

  makeVehicleLights(e) {
    const add = (key, tint, blend = Phaser.BlendModes.ADD) => this.glowImage(0, 0, key).setTint(tint).setBlendMode(blend);
    // the beam is held by its narrow end, so it starts at the front of the car and only shines forward
    if (e.kind === 'car') return [add('fx_beam', 0xfff2c4).setOrigin(0, 0.5), add('fx_glow', 0xff2a1a), add('fx_glow', 0xff2a1a)];
    if (e.kind === 'air') return [add('fx_glow', 0xff3020), add('fx_glow', 0xffffff)];
    return [add('fx_glow', WARM), add('fx_glow', 0xff3020)];
  }

  updateVehicles(time) {
    const on = this.level > 0;
    for (const e of this.vehicles) {
      const im = e.v.im;
      if (!im.active) {
        e.ims?.forEach((l) => l.destroy());
        this.vehicles.delete(e);
        continue;
      }
      const show = on && im.visible && im.alpha > 0.05;
      if (!show) {
        if (e.shown) e.ims.forEach((l) => l.setVisible(false));
        e.shown = false;
        continue;
      }
      e.ims ||= this.makeVehicleLights(e);
      e.shown = true;
      const a = this.level * im.alpha;
      const s = e.size * (im.scaleX || 1);
      const [dx, dy] = e.v.dir || [1, 0];
      let ux = dx - dy;
      let uy = (dx + dy) / 2;
      const len = Math.hypot(ux, uy) || 1;
      ux /= len;
      uy /= len;
      const [l0, l1, l2] = e.ims;
      if (e.kind === 'car') {
        // headlight beam on the road ahead, two red tail lights
        l0.setPosition(im.x + ux * s * 0.28, im.y + uy * s * 0.28).setRotation(Math.atan2(uy, ux))
          .setScale((s * 1.1) / 64, (s * 0.7) / 32).setDepth(im.depth - 0.01).setAlpha(0.5 * a).setVisible(true);
        const bx = im.x - ux * s * 0.36;
        const by = im.y - uy * s * 0.36 - s * 0.1;
        const side = s * 0.1;
        for (const [l, k] of [[l1, 1], [l2, -1]]) {
          l.setPosition(bx - uy * side * k, by + ux * side * k * 0.5).setScale(s * 0.004).setDepth(im.depth + 0.01)
            .setAlpha(0.9 * a).setVisible(true);
        }
      } else if (e.kind === 'air') {
        // a blinking red light and a steady white one
        const blink = time % 1200 < 180 ? 1 : 0.12;
        l0.setPosition(im.x, im.y - s * 0.08).setScale(s * 0.006).setDepth(im.depth + 0.01).setAlpha(a * blink).setVisible(true);
        l1.setPosition(im.x - ux * s * 0.4, im.y - uy * s * 0.4 - s * 0.05).setScale(s * 0.003)
          .setDepth(im.depth + 0.01).setAlpha(a * 0.8).setVisible(true);
      } else {
        // a ship: warm cabin lights and a red light on the mast
        const blink = time % 1600 < 300 ? 1 : 0.3;
        l0.setPosition(im.x, im.y - s * 0.06).setScale(s * 0.009).setDepth(im.depth + 0.01).setAlpha(0.7 * a).setVisible(true);
        l1.setPosition(im.x + ux * s * 0.1, im.y - s * 0.16).setScale(s * 0.003).setDepth(im.depth + 0.01)
          .setAlpha(a * blink).setVisible(true);
      }
    }
  }
}
