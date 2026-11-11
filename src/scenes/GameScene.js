import Phaser from 'phaser';
import { BUILDINGS } from '../data/buildings.js';
import { toWorld } from '../iso.js';
import { World } from '../world/World.js';
import { GroundView } from '../world/GroundView.js';
import { BuildingView, Ghost } from '../world/BuildingView.js';
import { Effects } from '../world/Effects.js';
import { Pathfinder } from '../agents/Pathfinder.js';
import { People } from '../agents/People.js';
import { Traffic } from '../agents/Traffic.js';
import { Airports } from '../agents/Airports.js';
import { Controls } from '../input/Controls.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    const world = World.load() || new World((Math.random() * 2 ** 31) | 0);
    this.world = world;
    this.views = new Map();
    this.tool = 'hand';
    this.rot = 0;
    this.lastHover = null;

    this.pf = new Pathfinder(world);
    this.ground = new GroundView(this, world);
    this.fx = new Effects(this);
    this.traffic = new Traffic(this, world, this.pf);
    this.airports = new Airports(this, world);
    this.people = new People(this, world, this.pf);
    this.ghost = new Ghost(this);

    world.on('building-added', (b, silent) => {
      const view = new BuildingView(this, b, !silent);
      this.views.set(b.id, view);
      this.fx.addChimneys(view);
      if (!silent) this.fx.dustFootprint(b);
    });
    world.on('building-removed', (b) => {
      this.views.get(b.id)?.destroy(true);
      this.views.delete(b.id);
      this.fx.removeChimneys(b);
      this.fx.dustFootprint(b);
    });
    world.on('changed', () => this.queueSave());

    for (const [type, x, y, rot] of world.pendingBuildings || []) world.addBuilding(type, x, y, rot, { silent: true });
    world.pendingBuildings = null;

    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    const mid = toWorld(world.size / 2, world.size / 2);
    cam.centerOn(mid.x, mid.y);
    this.controls = new Controls(this);
    this.scale.on('resize', (size) => this.cameras.resize(size.width, size.height));
    this.game.events.emit('city-ready', this);
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.ground.update(time);
    this.fx.update(time);
    this.people.update(time, dt);
    this.traffic.update(time, dt);
    this.airports.update(time, dt);
  }

  // ---------- tools ----------

  setTool(tool) {
    this.tool = tool;
    this.ghost.hide();
    if (this.lastHover) this.toolHover(this.lastHover);
  }

  rotate() {
    this.rot ^= 1;
    if (this.lastHover && BUILDINGS[this.tool]) this.showGhost(this.lastHover);
  }

  toolDown(sq, action) {
    if (this.tool === 'road') {
      action.added = [];
      this.paintRoad(sq, action);
    } else if (this.tool === 'bulldoze') {
      this.bulldoze(sq);
      this.ghost.showSquares([sq], false);
    } else if (BUILDINGS[this.tool]) {
      action.sq = sq;
      this.showGhost(sq);
    }
  }

  toolDrag(sq, action) {
    this.lastHover = sq;
    if (this.tool === 'road') this.paintRoad(sq, action);
    else if (this.tool === 'bulldoze') {
      this.bulldoze(sq);
      this.ghost.showSquares([sq], false);
    } else if (BUILDINGS[this.tool]) {
      action.sq = sq;
      this.showGhost(sq);
    }
  }

  toolUp(sq, action) {
    if (BUILDINGS[this.tool] && action.sq) this.placeBuilding(action.sq);
    if (action.touch) this.ghost.hide();
  }

  toolCancel(action, young) {
    if (action.tool === 'road' && young && action.added) {
      for (const [i, j] of action.added) this.world.removeRoad(i, j);
    }
    this.ghost.hide();
  }

  toolHover(sq) {
    this.lastHover = sq;
    if (BUILDINGS[this.tool]) this.showGhost(sq);
    else if (this.tool === 'road') this.ghost.showSquares([sq], this.world.canPlaceRoad(...sq));
    else if (this.tool === 'bulldoze') this.ghost.showSquares([sq], false);
    else this.ghost.hide();
  }

  paintRoad(sq, action) {
    if (this.world.addRoad(...sq)) {
      action.added.push(sq);
      this.fx.dustSquares([sq]);
    }
    this.ghost.showSquares([sq], true);
  }

  // Alpha of one pixel of a texture (cached per texture).
  alphaAt(key, x, y) {
    this.alphaCache ||= new Map();
    let a = this.alphaCache.get(key);
    if (!a) {
      const src = this.textures.get(key).getSourceImage();
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(src, 0, 0);
      a = { w: c.width, data: ctx.getImageData(0, 0, c.width, c.height).data };
      this.alphaCache.set(key, a);
    }
    return a.data[(y * a.w + x) * 4 + 3] || 0;
  }

  // The building drawn under the finger (so tapping a tall roof works too).
  buildingUnderPointer() {
    const p = this.pointerWorld;
    if (!p) return null;
    let best = null;
    let bestDepth = -Infinity;
    for (const v of this.views.values()) {
      const d = v.hit(p.x, p.y, (k, x, y) => this.alphaAt(k, x, y));
      if (d !== null && d > bestDepth) {
        bestDepth = d;
        best = v.b;
      }
    }
    return best;
  }

  bulldoze([i, j]) {
    const w = this.world;
    const b = this.buildingUnderPointer() || w.buildingAt(i, j);
    if (b) w.removeBuilding(b.id);
    else if (w.removeRoad(i, j)) this.fx.dustSquares([[i, j]]);
    else if (w.inBounds(i, j) && w.clearTree(i, j)) {
      this.fx.dustSquares([[i, j]]);
      w.changed();
    }
  }

  placement(sq) {
    const type = this.tool;
    const a = this.world.anchorFor(type, this.rot, sq[0], sq[1]);
    const f = this.world.footprint(type, this.rot);
    return { type, x: a.x, y: a.y, w: f.w, d: f.d, ok: this.world.canPlaceBuilding(type, a.x, a.y, this.rot) };
  }

  showGhost(sq) {
    const p = this.placement(sq);
    this.ghost.show(p.type, BUILDINGS[p.type], p.x, p.y, this.rot, p.w, p.d, p.ok);
  }

  placeBuilding(sq) {
    const p = this.placement(sq);
    if (p.ok) this.world.addBuilding(p.type, p.x, p.y, this.rot);
    else this.cameras.main.shake(120, 0.002);
  }

  cameraMoved() {}

  // ---------- saving ----------

  queueSave() {
    if (this.saveTimer) this.saveTimer.remove();
    this.saveTimer = this.time.delayedCall(700, () => this.world.save());
  }

  newIsland() {
    World.clearSave();
    window.location.reload();
  }
}
