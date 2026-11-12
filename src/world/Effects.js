import { DEPTH } from '../constants.js';
import { toWorld } from '../iso.js';
import { rand } from '../rng.js';

// Chimney smoke and building dust.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.smoke = scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 1800, max: 2600 },
      speedY: { min: -24, max: -12 },
      speedX: { min: -3, max: 9 },
      scale: { start: 0.7, end: 2 },
      alpha: { start: 0.7, end: 0 },
      emitting: false,
    }).setDepth(DEPTH.AIR - 10);
    // big white steam (cooling towers)
    this.steam = scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 2600, max: 3600 },
      speedY: { min: -30, max: -16 },
      speedX: { min: -4, max: 12 },
      scale: { start: 2.2, end: 6 },
      alpha: { start: 0.75, end: 0 },
      tint: 0xffffff,
      emitting: false,
    }).setDepth(DEPTH.AIR - 10);
    this.dust = scene.add.particles(0, 0, 'fx_dust', {
      lifespan: { min: 400, max: 750 },
      speed: { min: 25, max: 80 },
      angle: { min: 190, max: 350 },
      gravityY: 140,
      scale: { start: 1.4, end: 0.4 },
      alpha: { start: 0.9, end: 0 },
      emitting: false,
    }).setDepth(DEPTH.AIR - 9);
    this.chimneys = new Map(); // building id -> [{x, y, next}]
    this.ruins = []; // smoking ruins: [{ x, y, w, until, next }]
  }

  addChimneys(view) {
    const b = view.b;
    // a chimney is given as a pixel of the picture ({ px, py }) or as a building-local point ({ x, y, z });
    // big: true for big white steam
    const list = (b.def.smoke || []).map((s) => {
      const p = s.px !== undefined ? view.picturePoint(s.px, s.py) : view.localToWorld(s.x, s.y, s.z);
      return { x: p.x, y: p.y, big: !!s.big, next: this.scene.time.now + rand(300, 1500) };
    });
    if (list.length) this.chimneys.set(b.id, list);
  }

  removeChimneys(b) {
    this.chimneys.delete(b.id);
  }

  dustSquares(squares) {
    for (const [i, j] of squares) {
      const c = toWorld(i + 0.5, j + 0.5);
      this.dust.explode(5, c.x, c.y + 8);
    }
  }

  dustFootprint(b) {
    const squares = [];
    for (let j = b.y; j < b.y + b.d; j++) {
      for (let i = b.x; i < b.x + b.w; i++) {
        if (i === b.x || j === b.y || i === b.x + b.w - 1 || j === b.y + b.d - 1) squares.push([i, j]);
      }
    }
    this.dustSquares(squares);
  }

  // A building falls down: dust around it, and smoke from the break for a while.
  collapse(b, view) {
    this.dustFootprint(b);
    const tex = view.parts[view.parts.length - 1];
    const top = tex ? tex.y - tex.displayHeight * 0.55 : view.place.tipY - 40;
    const now = this.scene.time.now;
    this.ruins.push({ x: view.place.left + view.place.width / 2, y: top, w: view.place.width * 0.4, until: now + 9000, next: now });
  }

  update(time) {
    this.ruins = this.ruins.filter((r) => time < r.until);
    for (const r of this.ruins) {
      if (time < r.next) continue;
      this.smoke.emitParticleAt(r.x + rand(-r.w / 2, r.w / 2), r.y, 1);
      r.next = time + rand(120, 300);
    }
    for (const list of this.chimneys.values()) {
      for (const c of list) {
        if (time < c.next) continue;
        (c.big ? this.steam : this.smoke).emitParticleAt(c.x + rand(-3, 3), c.y, 1);
        c.next = time + (c.big ? rand(250, 450) : rand(400, 800));
      }
    }
  }
}
