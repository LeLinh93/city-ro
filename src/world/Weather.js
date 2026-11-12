import Phaser from 'phaser';
import { rand } from '../rng.js';

// Random weather. For now: rain. Now and then it rains for a minute or two: rain streaks fall over the screen
// with little splashes, the city turns a little grey, and fires go out by themselves (src/agents/Services.js).
const CLEAR_S = [180, 360]; // seconds of dry weather between showers
const FIRST_S = [90, 200]; // seconds before the first shower of a visit
const RAIN_S = [60, 120]; // how long a shower lasts
const FADE_S = 5; // seconds for the rain to start or stop
const DROPS = 340; // streaks on screen at full rain
const GREY = 0xa6b0c2; // the colour the world is tinted with in full rain
const DEPTH = 150000; // over everything on the map (the building being placed stays on top)

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.kind = 'clear';
    this.amount = 0; // 0 = dry, 1 = full rain
    this.next = rand(...FIRST_S);
    this.until = 0;
    this.clock = 0; // seconds
    this.draw = scene.add.graphics().setDepth(DEPTH);
    this.draw.glow = true; // not tinted by the time of day (see DayNight.paint); its colour is set here
    this.drops = [];
    this.splashes = [];
  }

  get raining() {
    return this.kind === 'rain' && this.amount > 0.3;
  }

  // Start or stop the rain now (for testing, or a weather button later).
  rain(on = true) {
    if (on) {
      this.kind = 'rain';
      this.until = this.clock + rand(...RAIN_S);
    } else {
      this.kind = 'clear';
      this.next = this.clock + rand(...CLEAR_S);
    }
    this.scene.events.emit('weather', this.kind);
  }

  update(time, dt) {
    this.clock += dt;
    if (this.kind === 'clear' && this.clock > this.next) this.rain(true);
    else if (this.kind === 'rain' && this.clock > this.until) this.rain(false);
    const target = this.kind === 'rain' ? 1 : 0;
    this.amount = Phaser.Math.Clamp(this.amount + Math.sign(target - this.amount) * (dt / FADE_S), 0, 1);
    const night = this.scene.dayNight;
    if (night) night.setWeatherTint(this.amount < 0.01 ? 0xffffff : mix(0xffffff, GREY, this.amount));
    this.render(dt);
  }

  // Streaks in screen space, drawn where the camera looks, so they look the same at every zoom.
  render(dt) {
    const g = this.draw;
    g.clear();
    const want = Math.round(DROPS * this.amount);
    if (!want && !this.drops.length && !this.splashes.length) return;
    const cam = this.scene.cameras.main;
    const z = cam.zoom;
    const view = cam.worldView;
    const sw = cam.width;
    const sh = cam.height;
    while (this.drops.length < want) this.drops.push(this.newDrop(sw, sh, true));
    if (this.drops.length > want) this.drops.length = want;

    // the rain is a bit darker at night
    const light = this.scene.dayNight?.level ?? 0;
    const alpha = 0.6 - 0.2 * light;
    g.lineStyle(1.6 / z, 0xe2ecf8, alpha);
    g.beginPath();
    for (let k = 0; k < this.drops.length; k++) {
      const d = this.drops[k];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y >= d.end) {
        if (Math.random() < 0.5) this.splashes.push({ x: d.x, y: d.end, t: 0 });
        this.drops[k] = this.newDrop(sw, sh, false);
        continue;
      }
      const x0 = view.x + d.x / z;
      const y0 = view.y + d.y / z;
      g.moveTo(x0, y0);
      g.lineTo(x0 - (d.vx * d.len) / z, y0 - (d.vy * d.len) / z);
    }
    g.strokePath();
    // splashes: little rings on the ground that grow and fade
    for (const s of this.splashes) {
      s.t += dt;
      const k = s.t / 0.25;
      g.lineStyle(1 / z, 0xd8e4f2, alpha * (1 - k));
      g.strokeEllipse(view.x + s.x / z, view.y + s.y / z, (4 + 8 * k) / z, (2 + 4 * k) / z);
    }
    this.splashes = this.splashes.filter((s) => s.t < 0.25);
  }

  // A raindrop falling slanted from above the screen (or anywhere on it, when the rain starts) to a random spot.
  newDrop(sw, sh, anywhere) {
    const vy = rand(900, 1300);
    const vx = vy * -0.18;
    const end = rand(0, sh);
    const fall = rand(0.25, 0.7) * vy;
    const y = anywhere ? end - rand(0, fall) : end - fall;
    return { x: rand(0, sw + 100) - vx * ((end - y) / vy), y, vx, vy, end, len: rand(0.04, 0.075) };
  }

  destroy() {
    this.draw.destroy();
  }
}

function mix(a, b, k) {
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
