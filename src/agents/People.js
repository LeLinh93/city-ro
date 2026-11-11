import { SPEED, SIDEWALK_OFFSET } from '../constants.js';
import { toWorld, facingFor } from '../iso.js';
import { pick } from '../rng.js';
import { Mover } from './Mover.js';

const MAX_PEOPLE = 160;

// People walk out of a door, along sidewalks (or across grass), and into another door.
export class People {
  constructor(scene, world, pathfinder) {
    this.scene = scene;
    this.world = world;
    this.pf = pathfinder;
    this.list = [];
    this.timer = 0;
    this.variants = scene.registry.get('variants').person;
  }

  update(time, dt) {
    this.timer += dt;
    if (this.timer > 1) {
      this.timer -= 1;
      this.spawnTick();
    }
    for (let n = this.list.length - 1; n >= 0; n--) {
      const p = this.list[n];
      p.mover.step(dt);
      this.render(p);
      if (p.mover.done && !p.leaving) this.leave(p, n);
    }
  }

  spawnTick() {
    if (this.list.length >= MAX_PEOPLE) return;
    for (const b of this.world.buildings.values()) {
      const rate = b.def.people || 0;
      if (Math.random() < rate / 60) this.spawn(b);
    }
  }

  canUse(b) {
    const e = this.world.entrance(b);
    return e && this.world.walkable(...e.outside) ? e : null;
  }

  pickTarget(from) {
    const cands = [];
    let total = 0;
    for (const b of this.world.buildings.values()) {
      if (b === from || !b.def.door) continue;
      if (Math.abs(b.x - from.x) + Math.abs(b.y - from.y) > 45) continue;
      total += b.def.attract || 1;
      cands.push(b);
    }
    let r = Math.random() * total;
    for (const b of cands) {
      r -= b.def.attract || 1;
      if (r <= 0) return b;
    }
    return null;
  }

  spawn(b) {
    const w = this.world;
    const from = this.canUse(b);
    if (!from) return;
    let to = null;
    let path = null;
    const target = this.pickTarget(b);
    if (target) {
      to = this.canUse(target);
      if (to) path = this.pf.walkPath(from.outside, to.outside);
    }
    if (!path) {
      // nowhere to go: take a little walk and come back home
      const [oi, oj] = from.outside;
      for (let tries = 0; tries < 6 && !path; tries++) {
        const t = [oi + Math.round((Math.random() - 0.5) * 12), oj + Math.round((Math.random() - 0.5) * 12)];
        if (!w.walkable(...t)) continue;
        const there = this.pf.walkPath(from.outside, t, 2500);
        if (there) path = there.concat(there.slice(0, -1).reverse());
      }
      to = from;
    }
    if (!path) return;

    const mover = new Mover(from.point.x, from.point.y, { speed: SPEED.person * (0.85 + Math.random() * 0.3), lane: SIDEWALK_OFFSET });
    for (const [i, j] of path) mover.push(i + 0.5, j + 0.5, w.isRoad(i, j));
    mover.push(to.point.x, to.point.y, false);
    const key = pick(this.variants);
    const tex = this.scene.textures.get(key);
    const perRow = Math.max(1, Math.floor((tex.frameTotal - 1) / 2));
    const sprite = this.scene.add.image(0, 0, key, 0).setOrigin(0.5, 1).setAlpha(0);
    this.scene.tweens.add({ targets: sprite, alpha: 1, duration: 300 });
    const p = { sprite, mover, perRow };
    this.list.push(p);
    this.render(p);
  }

  render(p) {
    const m = p.mover;
    const pos = toWorld(m.px, m.py);
    const f = facingFor(m.dir[0], m.dir[1]);
    const frame = f.row * p.perRow + (Math.floor(m.dist * 7) % p.perRow);
    p.sprite.setPosition(Math.round(pos.x), Math.round(pos.y)).setDepth(m.px + m.py).setFlipX(f.flip);
    if (p.sprite.frame.name !== frame) p.sprite.setFrame(frame);
  }

  leave(p, n) {
    p.leaving = true;
    this.scene.tweens.add({
      targets: p.sprite, alpha: 0, scaleX: 0.6, scaleY: 0.6, duration: 260,
      onComplete: () => {
        p.sprite.destroy();
        const k = this.list.indexOf(p);
        if (k >= 0) this.list.splice(k, 1);
      },
    });
  }
}
