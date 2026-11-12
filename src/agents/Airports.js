import { DEPTH } from '../constants.js';
import { toWorld } from '../iso.js';
import { pick, rand } from '../rng.js';
import { ART } from '../data/art.js';
import { vehicleSprite, faceVehicle, vehicleShadow, placeShadow } from './vehicleArt.js';

// Planes land, taxi to a parking spot, wait, taxi back and take off.
// Only one plane moves at a time per airport, so they never collide.
export class Airports {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.ports = new Map();
    this.variants = scene.registry.get('variants').plane;
    // a ruined building counts as gone until it is repaired
    world.onBuilding((b) => {
      if (!b.def.airport) return;
      this.ports.set(b.id, { b, A: b.def.airport, planes: [], busy: null, next: scene.time.now + 2500 });
    }, (b) => {
      const port = this.ports.get(b.id);
      if (!port) return;
      for (const p of port.planes) this.remove(p);
      this.ports.delete(b.id);
    });
  }

  update(time, dt) {
    for (const port of this.ports.values()) {
      if (!port.busy && time > port.next) this.schedule(port, time);
      for (const p of port.planes) this.step(port, p, time, dt);
      port.planes = port.planes.filter((p) => !p.gone);
    }
  }

  schedule(port, time) {
    const A = port.A;
    const parked = port.planes.filter((p) => p.state === 'parked');
    const used = new Set(parked.map((p) => p.spot));
    const free = A.spots.map((_, k) => k).filter((k) => !used.has(k));
    const ready = parked.filter((p) => time > p.until);
    if (ready.length && (!free.length || Math.random() < 0.5)) this.depart(port, pick(ready));
    else if (free.length) this.land(port, pick(free));
    else port.next = time + 3000;
  }

  makePlane(port, x, y, alt) {
    const v = vehicleSprite(this.scene, 'airplane', { key: pick(this.variants), origin: ART.planeOrigin });
    const shadow = vehicleShadow(this.scene, v);
    return { port, v, sprite: v.im, shadow, x, y, alt, legs: [], dir: [1, 0] };
  }

  land(port, spot) {
    const A = port.A;
    const s = A.spots[spot];
    const ry = A.runway.centerY;
    const ty = A.taxiway.centerY;
    const p = this.makePlane(port, -16, ry, 300);
    p.spot = spot;
    p.state = 'landing';
    p.legs = [
      { x: A.touchdownX, y: ry, v0: 6, v1: 4.2, alt: 0 },
      { x: A.exitX, y: ry, v0: 4.2, v1: 0.8, alt: 0 },
      { x: A.exitX, y: ty, v0: 0.8, v1: 0.8, alt: 0 },
      { x: s.x, y: ty, v0: 0.9, v1: 0.9, alt: 0 },
      { x: s.x, y: s.y, v0: 0.7, v1: 0.4, alt: 0 },
    ];
    p.sprite.setAlpha(0);
    this.scene.tweens.add({ targets: p.sprite, alpha: 1, duration: 1200 });
    port.planes.push(p);
    port.busy = p;
  }

  depart(port, p) {
    const A = port.A;
    const ry = A.runway.centerY;
    const ty = A.taxiway.centerY;
    p.state = 'departing';
    p.legs = [
      { x: p.x, y: ty, v0: 0.5, v1: 0.8, alt: 0 },
      { x: A.takeoffStartX, y: ty, v0: 0.9, v1: 0.9, alt: 0 },
      { x: A.takeoffStartX, y: ry, v0: 0.8, v1: 0.5, alt: 0 },
      { x: 8, y: ry, v0: 0.4, v1: 5.5, alt: 0 },
      { x: 26, y: ry, v0: 5.5, v1: 8, alt: 340 },
    ];
    port.busy = p;
  }

  step(port, p, time, dt) {
    const leg = p.legs[0];
    if (leg) {
      if (leg.len === undefined) {
        leg.sx = p.x;
        leg.sy = p.y;
        leg.salt = p.alt;
        leg.len = Math.hypot(leg.x - p.x, leg.y - p.y);
        leg.s = 0;
      }
      const t = leg.len ? leg.s / leg.len : 1;
      leg.s += Math.max(0.25, leg.v0 + (leg.v1 - leg.v0) * t) * dt;
      if (leg.len > 0.001) p.dir = [(leg.x - leg.sx) / leg.len, (leg.y - leg.sy) / leg.len];
      if (leg.s >= leg.len) {
        p.x = leg.x;
        p.y = leg.y;
        p.alt = leg.alt;
        p.legs.shift();
        if (!p.legs.length) this.arrive(port, p, time);
      } else {
        const k = leg.s / leg.len;
        p.x = leg.sx + (leg.x - leg.sx) * k;
        p.y = leg.sy + (leg.y - leg.sy) * k;
        p.alt = leg.salt + (leg.alt - leg.salt) * k;
      }
    }
    this.render(port, p, time);
  }

  arrive(port, p, time) {
    port.busy = null;
    if (p.state === 'landing') {
      p.state = 'parked';
      p.until = time + rand(12000, 25000);
      port.next = time + rand(4000, 9000);
    } else {
      port.next = time + rand(5000, 10000);
      this.remove(p);
    }
  }

  render(port, p, time) {
    const b = port.b;
    const mx = b.rot ? b.x + p.y : b.x + p.x;
    const my = b.rot ? b.y + p.x : b.y + p.y;
    const dx = b.rot ? p.dir[1] : p.dir[0];
    const dy = b.rot ? p.dir[0] : p.dir[1];
    const pos = toWorld(mx, my);
    faceVehicle(p.v, dx, dy, time, 400);
    p.sprite.setPosition(Math.round(pos.x), Math.round(pos.y - p.alt));
    p.sprite.setDepth(p.alt > 4 ? DEPTH.AIR + p.alt : mx + my + 1.2);
    // the plane's outline on the ground, a little to the lower right; smaller and fainter as it climbs
    const lift = Math.min(1, p.alt / 350);
    placeShadow(p.shadow, p.v, pos.x + 8 + p.alt * 0.15, pos.y + 6, 0.2 * (1 - lift * 0.7) * p.sprite.alpha, DEPTH.SHADOW, 1 - lift * 0.3);
    if (p.state === 'departing' && p.alt > 200 && !p.fading) {
      p.fading = true;
      this.scene.tweens.add({ targets: p.sprite, alpha: 0, duration: 1500 });
    }
  }

  remove(p) {
    if (p.gone) return;
    p.gone = true;
    this.scene.tweens.add({
      targets: [p.sprite, p.shadow], alpha: 0, duration: 400,
      onComplete: () => {
        p.sprite.destroy();
        p.shadow.destroy();
      },
    });
  }
}
