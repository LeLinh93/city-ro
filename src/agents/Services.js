import Phaser from 'phaser';
import { DEPTH } from '../constants.js';
import { toWorld, toGrid } from '../iso.js';
import { pick, rand } from '../rng.js';
import { footprintPlacement } from '../world/BuildingView.js';
import { vehicleSprite, faceVehicle, hasVehicle, vehicleShadow, placeShadow } from './vehicleArt.js';

const FLY = 220; // helicopter speed, world px per second
const CLIMB = 70; // px per second up or down
const CRUISE = 150; // flying height above the ground, px
const JET_G = 320; // gravity of the fire truck's water, px/s²

const RAIN_OUT = 6000; // ms: in the rain a fire goes out by itself this long after it starts

// Helicopters on the roofs of police, hospital and fire stations, and the fires the fire station puts out.
export class Services {
  constructor(scene, world, traffic) {
    this.scene = scene;
    this.world = world;
    this.traffic = traffic;
    this.helis = new Map(); // building id -> helicopter
    this.stations = new Map(); // fire station id -> { b, next }
    this.fires = new Map(); // burning building id -> fire
    this.light = scene.add.graphics().setDepth(DEPTH.AIR - 2);
    this.drops = scene.add.particles(0, 0, 'fx_drop', {
      lifespan: { min: 500, max: 800 }, speedY: { min: 60, max: 120 }, speedX: { min: -25, max: 25 },
      gravityY: 380, alpha: { start: 1, end: 0.3 }, emitting: false,
    }).setDepth(DEPTH.AIR - 1);
    // the fire truck's water jet: an arc aimed at the fire (jetV is set before each spray)
    this.jetV = { x: 0, y: 0 };
    this.jet = scene.add.particles(0, 0, 'fx_drop', {
      lifespan: 600, gravityY: JET_G, alpha: { start: 1, end: 0.5 },
      speedX: { onEmit: () => this.jetV.x + rand(-12, 12) },
      speedY: { onEmit: () => this.jetV.y + rand(-12, 12) },
      emitting: false,
    }).setDepth(DEPTH.AIR - 1);

    // a ruined building counts as gone until it is repaired
    world.onBuilding((b) => {
      const h = b.def.heli;
      if (h && hasVehicle(scene, h.vehicle)) this.addHeli(b, h);
      if (b.def.fire) this.stations.set(b.id, { b, next: scene.time.now + rand(...b.def.fire.every) });
    }, (b) => {
      const h = this.helis.get(b.id);
      if (h) this.removeHeli(h);
      this.helis.delete(b.id);
      this.stations.delete(b.id);
      for (const f of [...this.fires.values()]) {
        if (f.b === b) this.endFire(f, true);
        else if (f.heli?.b === b) f.heli = null; // its helicopter is gone: another one may come
      }
    });
  }

  // ---------- where things are on screen ----------

  // A pixel of a building's picture, in world pixels (pictures of turned buildings are mirrored).
  picturePoint(b, px, py) {
    const place = footprintPlacement(b.x, b.y, b.w, b.d);
    const tex = this.scene.textures.get(b.def.base || b.def.image).source[0];
    const scale = place.width / tex.width;
    return {
      x: place.left + (b.rot ? tex.width - px : px) * scale,
      y: place.tipY - tex.height * scale + py * scale,
    };
  }

  // Middle of the footprint on the ground, and how tall the picture is.
  center(b) {
    const c = toWorld(b.x + b.w / 2, b.y + b.d / 2);
    const place = footprintPlacement(b.x, b.y, b.w, b.d);
    const tex = this.scene.textures.get(b.def.base || b.def.image).source[0];
    return { x: c.x, y: c.y, top: place.tipY - tex.height * (place.width / tex.width) };
  }

  near(b, radius, ok) {
    const out = [];
    const cx = b.x + b.w / 2;
    const cy = b.y + b.d / 2;
    for (const o of this.world.buildings.values()) {
      if (o === b || o.ruined || !ok(o)) continue;
      if (Math.hypot(o.x + o.w / 2 - cx, o.y + o.d / 2 - cy) <= radius) out.push(o);
    }
    return out;
  }

  // ---------- helicopters ----------

  addHeli(b, cfg) {
    const pad = this.picturePoint(b, cfg.pad.px, cfg.pad.py);
    const c = this.center(b);
    const v = vehicleSprite(this.scene, cfg.vehicle, null);
    const shadow = vehicleShadow(this.scene, v);
    const h = {
      b, cfg, v, shadow,
      home: { x: pad.x, y: c.y }, // ground point under the pad
      roof: c.y - pad.y, // height of the pad
      x: pad.x, y: c.y, alt: c.y - pad.y,
      dir: [0, 1], state: 'parked', until: this.scene.time.now + rand(...(cfg.rest || [20000, 40000])),
    };
    this.helis.set(b.id, h);
    this.renderHeli(h, this.scene.time.now);
  }

  removeHeli(h) {
    this.scene.tweens.add({
      targets: [h.v.im, h.shadow], alpha: 0, duration: 300,
      onComplete: () => {
        h.v.im.destroy();
        h.shadow.destroy();
      },
    });
  }

  // Take off and fly to world point `to` (ground), hover at `alt`.
  sendHeli(h, to, alt, hoverMs, job) {
    h.target = to;
    h.cruise = Math.max(CRUISE, alt);
    h.hoverMs = hoverMs;
    h.job = job;
    h.state = h.state === 'parked' || h.state === 'down' ? 'up' : 'go'; // already flying: straight there
  }

  startTrip(h) {
    const { b, cfg } = h;
    if (cfg.job === 'spotlight') {
      const list = this.near(b, 15, (o) => o.def.menu !== 'Decoration');
      if (list.length) {
        const t = pick(list);
        const c = this.center(t);
        const side = Math.random() < 0.5 ? -1 : 1;
        this.sendHeli(h, { x: c.x + side * 150, y: c.y - 40 }, c.y - c.top + 60, rand(5000, 8000), { light: t });
        return;
      }
    }
    // a short flight around
    const a = Math.random() * Math.PI * 2;
    const r = rand(500, 1100);
    this.sendHeli(h, { x: h.home.x + Math.cos(a) * r, y: h.home.y + Math.sin(a) * r * 0.5 }, CRUISE, rand(2000, 4000), {});
  }

  stepHeli(h, time, dt) {
    const toward = (p, speed) => {
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        const g = toGrid(dx, dy);
        h.dir = [g.fx, g.fy];
      }
      if (d <= speed * dt) {
        h.x = p.x;
        h.y = p.y;
        return true;
      }
      h.x += (dx / d) * speed * dt;
      h.y += (dy / d) * speed * dt;
      return false;
    };
    const climbTo = (alt) => {
      const step = CLIMB * dt;
      h.alt = Math.abs(alt - h.alt) <= step ? alt : h.alt + Math.sign(alt - h.alt) * step;
      return h.alt === alt;
    };
    switch (h.state) {
      case 'parked':
        if (h.cfg.job !== 'fire' && time > h.until) this.startTrip(h);
        break;
      case 'up':
        if (climbTo(Math.min(h.cruise, h.roof + 50))) h.state = 'go';
        break;
      case 'go':
        climbTo(h.cruise);
        if (toward(h.target, FLY) && Math.abs(h.alt - h.cruise) < 1) {
          h.state = 'hover';
          h.until = time + h.hoverMs;
        }
        break;
      case 'hover':
        climbTo(h.cruise);
        if (!h.job?.fire && time > h.until) h.state = 'home';
        break;
      case 'home':
        climbTo(Math.max(CRUISE, h.roof + 50));
        if (toward(h.home, FLY)) {
          h.state = 'down';
          h.dir = [0, 1]; // always lands facing down-left, like when it was first parked
        }
        break;
      case 'down':
        if (climbTo(h.roof)) {
          h.state = 'parked';
          h.job = null;
          h.until = time + rand(...(h.cfg.rest || [20000, 40000]));
        }
        break;
      default:
    }
    this.renderHeli(h, time);
  }

  renderHeli(h, time) {
    const flying = h.state !== 'parked';
    const bob = flying && h.alt > h.roof + 4 ? Math.sin(time / 260) * 3 : 0;
    faceVehicle(h.v, h.dir[0], h.dir[1]);
    h.v.im.setPosition(Math.round(h.x), Math.round(h.y - h.alt + bob));
    const b = h.b;
    h.v.im.setDepth(flying ? DEPTH.AIR + h.alt : b.x + b.y + b.w + b.d - 0.45);
    // shadow: on the roof under a parked helicopter, on the ground under a flying one
    const lift = Math.min(1, h.alt / 300);
    if (flying) placeShadow(h.shadow, h.v, h.x + 6, h.y + 4, 0.2 * (1 - lift * 0.5), DEPTH.SHADOW, 1 - lift * 0.25);
    else placeShadow(h.shadow, h.v, h.v.im.x + 5, h.v.im.y + 3, 0.2, h.v.im.depth - 0.001);
  }

  // ---------- fires ----------

  // Now and then a building near a fire station catches fire by itself.
  startFire(st, time) {
    const { b } = st;
    const busy = this.helis.get(b.id);
    if (busy && busy.state !== 'parked') return false;
    const list = this.near(b, b.def.fire.radius, (o) => !o.def.fire && o.def.menu !== 'Decoration' && !this.fires.has(o.id));
    if (!list.length) return false;
    this.ignite(pick(list), time);
    return true;
  }

  // Set building t on fire. burnOut (ms): if nobody has put it out by then, the building is ruined.
  // Without burnOut a fire nobody comes to just goes out after a while.
  ignite(t, time, burnOut = null) {
    if (this.fires.has(t.id) || t.ruined) return null;
    const c = this.center(t);
    const place = footprintPlacement(t.x, t.y, t.w, t.d);
    const h = c.y - c.top;
    const zone = { x: place.left + place.width * 0.25, y: c.top + h * 0.1, w: place.width * 0.5, h: h * 0.45 };
    const flames = this.scene.add.particles(0, 0, 'fx_flame', {
      lifespan: { min: 450, max: 800 }, speedY: { min: -70, max: -35 }, speedX: { min: -8, max: 8 },
      scale: { start: 1.6, end: 0.3 }, alpha: { start: 1, end: 0 }, frequency: 45, quantity: 2,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(zone.x, zone.y, zone.w, zone.h) },
    }).setDepth(DEPTH.AIR - 5);
    const smoke = this.scene.add.particles(0, 0, 'fx_smoke', {
      lifespan: { min: 1600, max: 2400 }, speedY: { min: -40, max: -20 }, speedX: { min: -6, max: 12 },
      scale: { start: 1.2, end: 3.5 }, alpha: { start: 0.55, end: 0 }, tint: 0x555555, frequency: 160,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(zone.x, zone.y - 10, zone.w, zone.h * 0.5) },
    }).setDepth(DEPTH.AIR - 6);
    const fire = { b: t, flames, smoke, health: 1, c, top: h, started: time, burnOut, heli: null, truck: null, truckAt: 0 };
    this.fires.set(t.id, fire);
    this.dispatch(time);
    return fire;
  }

  // Send fire fighters to fires that have none: the nearest free fire helicopter (one fire each), and a
  // truck from the nearest fire station that has one to spare (two out at a time per station).
  dispatch(time) {
    const dist = (b, f) => Math.hypot(b.x + b.w / 2 - (f.b.x + f.b.w / 2), b.y + b.d / 2 - (f.b.y + f.b.d / 2));
    for (const f of this.fires.values()) {
      if (!f.heli) {
        let best = null;
        for (const h of this.helis.values()) {
          if (h.cfg.job !== 'fire' || !['parked', 'home', 'down'].includes(h.state) || h.job?.fire) continue;
          if (!best || dist(h.b, f) < dist(best.b, f)) best = h;
        }
        if (best) {
          this.sendHeli(best, { x: f.c.x, y: f.c.y }, f.top + 70, 0, { fire: f });
          f.heli = best;
        }
      }
      if ((!f.truck || f.truck.gone) && time >= f.truckAt) {
        f.truck = null;
        f.truckAt = time + 6000; // if no truck can come now, try again in a while
        const stations = [...this.stations.values()].sort((a, b) => dist(a.b, f) - dist(b.b, f));
        for (const st of stations) {
          const out = this.traffic.cars.filter((c) => c.kind === 'truck' && c.station === st.b.id && !c.gone).length;
          if (out >= 2) continue;
          const car = this.traffic.dispatch(st.b, f.b, st.b.def.fire.vehicle);
          if (car) {
            f.truck = car;
            break;
          }
        }
      }
    }
  }

  stepFire(f, time, dt) {
    const heli = f.heli;
    if (heli && heli.state === 'hover' && heli.job?.fire === f) {
      // the helicopter alone needs 16 s (4 s for a disaster's fires, so the city is saved in time)
      f.health -= dt / (f.burnOut !== null ? 4 : 16);
      this.drops.emitParticleAt(heli.x + rand(-10, 10), heli.y - heli.alt + 12, 3);
    }
    const truck = f.truck;
    if (truck && truck.mode === 'wait' && !truck.gone) {
      f.health -= dt / (f.burnOut !== null ? 2.4 : 10); // together with the truck about 6 s (1.5 s for a disaster's fires)
      // aim so the water lands on the building half way up, 0.55 s after leaving the hose
      const p = toWorld(truck.mover.px, truck.mover.py);
      const T = 0.55;
      const dx = f.c.x - p.x;
      const dy = f.c.y - f.top * 0.5 - (p.y - 16);
      this.jetV.x = dx / T;
      this.jetV.y = dy / T - 0.5 * JET_G * T;
      this.jet.emitParticleAt(p.x, p.y - 16, 2);
    }
    if (f.burnOut !== null) {
      // left burning too long: the building is ruined (which also ends the fire)
      if (time - f.started > f.burnOut && f.health > 0) this.world.ruinBuilding(f.b);
    } else if (!heli && !truck && time - f.started > 15000) {
      f.health = 0; // nobody can come: it burns out by itself
    }
    if (f.health <= 0) this.endFire(f);
  }

  endFire(f, now = false) {
    if (f.done) return;
    f.done = true;
    this.fires.delete(f.b.id);
    f.flames.stop();
    this.scene.time.delayedCall(now ? 0 : 2500, () => f.smoke.stop());
    this.scene.time.delayedCall(5000, () => {
      f.flames.destroy();
      f.smoke.destroy();
    });
    const heli = f.heli;
    if (heli && heli.job?.fire === f) {
      heli.job = null;
      if (heli.state !== 'parked' && heli.state !== 'down') heli.state = 'home'; // may be sent to the next fire
    }
    if (f.truck && !f.truck.gone) this.traffic.recall(f.truck);
  }

  // Put out every fire at once (Repair).
  extinguishAll() {
    for (const f of [...this.fires.values()]) this.endFire(f, true);
  }

  // ---------- every frame ----------

  update(time, dt) {
    // no fires of their own while a disaster is going on or its fires are still burning
    const calm = !this.scene.disasters?.busy && ![...this.fires.values()].some((f) => f.burnOut !== null);
    for (const st of this.stations.values()) {
      if (!calm) st.next = Math.max(st.next, time + 20000);
      else if (time > st.next) {
        const ok = this.startFire(st, time);
        st.next = time + (ok ? rand(...st.b.def.fire.every) : 20000);
      }
    }
    // in the rain every fire goes out by itself RAIN_OUT ms after it started (or after the rain started)
    if (this.scene.weather?.raining) {
      for (const f of [...this.fires.values()]) {
        f.rainFrom ??= time;
        if (time - f.rainFrom >= RAIN_OUT) this.endFire(f);
      }
    } else for (const f of this.fires.values()) f.rainFrom = null;
    if (this.fires.size) this.dispatch(time);
    for (const f of [...this.fires.values()]) this.stepFire(f, time, dt);
    for (const h of this.helis.values()) this.stepHeli(h, time, dt);
    this.drawLights(time);
  }

  // Police helicopters shine a light on the building they look at.
  drawLights(time) {
    const g = this.light;
    g.clear();
    for (const h of this.helis.values()) {
      const t = h.job?.light;
      if (h.state !== 'hover' || !t || !this.world.buildings.has(t.id)) continue;
      const c = this.center(t);
      const tx = c.x + Math.sin(time / 700) * 18;
      const ty = c.y - (c.y - c.top) * 0.4;
      const sx = h.x;
      const sy = h.y - h.alt + 8;
      const rx = 34;
      const ry = 17;
      g.fillStyle(0xfff3b0, 0.22);
      g.fillTriangle(sx - 3, sy, tx - rx, ty, tx + rx, ty);
      g.fillStyle(0xfff6c8, 0.35);
      g.fillEllipse(tx, ty, rx * 2, ry * 2);
    }
  }
}
