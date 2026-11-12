import Phaser from 'phaser';
import { BUILDINGS } from '../themes/catalog.js';
import { toWorld, toGrid } from '../iso.js';
import { World } from '../world/World.js';
import { GroundView } from '../world/GroundView.js';
import { BuildingView, Ghost, footprintPlacement } from '../world/BuildingView.js';
import { Effects } from '../world/Effects.js';
import { Pathfinder } from '../agents/Pathfinder.js';
import { People } from '../agents/People.js';
import { Traffic } from '../agents/Traffic.js';
import { Airports } from '../agents/Airports.js';
import { Ships } from '../agents/Ships.js';
import { Services } from '../agents/Services.js';
import { Disasters } from '../agents/Disasters.js';
import { Controls } from '../input/Controls.js';
import { loadCity, saveCity } from '../saves.js';
import { GROUND } from '../constants.js';

// Ground number for a paint tool id like 'paint:water', or null for other tools.
// Building id for a decoration tool like 'deco:tree1', or null for other tools.
const decoType = (tool) => (typeof tool === 'string' && tool.startsWith('deco:') && BUILDINGS[tool.slice(5)] ? tool.slice(5) : null);
const paintGround = (tool) => (typeof tool === 'string' && tool.startsWith('paint:') ? GROUND[tool.slice(6).toUpperCase()] ?? null : null);

// One city. Started with { city } (an entry from saves.js) and stopped when going back to the menu.
export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.city = data.city;
  }

  create() {
    const world = World.fromData(loadCity(this.city.id)) || new World((Math.random() * 2 ** 31) | 0);
    this.world = world;
    this.views = new Map();
    this.tool = 'hand';
    this.rot = 0;
    this.paintMode = 'brush'; // Plot and Decoration: 'brush' (square by square) or 'area' (drag a rectangle)
    this.pending = null; // building waiting for ✔ / ✖: { type, x, y, moving? }
    this.lastHover = null;
    this.saveTimer = null;
    this.alphaCache = null;

    this.pf = new Pathfinder(world);
    this.ground = new GroundView(this, world);
    this.fx = new Effects(this);
    this.traffic = new Traffic(this, world, this.pf);
    this.airports = new Airports(this, world);
    this.ships = new Ships(this, world);
    this.services = new Services(this, world, this.traffic);
    this.people = new People(this, world, this.pf);
    this.disasters = new Disasters(this, world, { people: this.people, traffic: this.traffic, services: this.services });
    this.ghost = new Ghost(this);

    world.on('building-added', (b, silent) => {
      const view = new BuildingView(this, b, !silent);
      this.views.set(b.id, view);
      this.fx.addChimneys(view);
      if (!silent) this.fx.dustFootprint(b);
    });
    world.on('building-removed', (b, silent) => {
      this.views.get(b.id)?.destroy(!silent);
      this.views.delete(b.id);
      this.fx.removeChimneys(b);
      if (!silent) this.fx.dustFootprint(b);
    });
    // A ruined or repaired building gets its picture swapped.
    const redraw = (b) => {
      this.views.get(b.id)?.destroy(false);
      this.fx.removeChimneys(b);
      const view = new BuildingView(this, b, false);
      this.views.set(b.id, view);
      if (!b.ruined) this.fx.addChimneys(view);
      return view;
    };
    world.on('building-ruined', (b, silent) => {
      const view = redraw(b);
      if (!silent) this.fx.collapse(b, view);
    });
    world.on('building-repaired', (b) => {
      redraw(b);
      this.fx.dustFootprint(b);
    });
    // Auto save: shortly after every change, plus once a minute just in case.
    world.on('changed', () => this.queueSave());
    this.time.addEvent({ delay: 60000, loop: true, callback: () => this.saveNow() });

    for (const [type, x, y, rot, , , ruined] of world.pendingBuildings || []) {
      const b = world.addBuilding(type, x, y, rot, { silent: true });
      if (b && ruined) world.ruinBuilding(b, { silent: true });
    }
    world.pendingBuildings = null;
    if (!loadCity(this.city.id)) this.saveNow(); // a brand new city is saved right away

    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    const mid = toWorld(world.size / 2, world.size / 2);
    cam.centerOn(mid.x, mid.y);
    this.controls = new Controls(this);
    const onResize = (size) => this.cameras.resize(size.width, size.height);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      if (this.saveTimer) this.saveTimer.remove();
    });
    this.game.events.emit('city-ready', this);
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.ground.update(time);
    this.fx.update(time);
    this.people.update(time, dt);
    this.traffic.update(time, dt);
    this.airports.update(time, dt);
    this.ships.update(time, dt);
    this.services.update(time, dt);
    this.disasters.update(time, dt);
  }

  // ---------- tools ----------

  setTool(tool) {
    this.cancelPlacing();
    this.tool = tool;
    if (this.lastHover) this.toolHover(this.lastHover);
  }

  toolDown(sq, action) {
    if (this.tool === 'road') {
      action.added = [];
      this.paintRoad(sq, action);
    } else if (this.tool === 'bulldoze') {
      this.bulldoze(sq);
      this.ghost.showSquares([sq], false);
    } else if ((paintGround(this.tool) !== null || decoType(this.tool)) && this.paintMode === 'area') {
      action.area = { from: sq, to: sq };
      this.showArea(action.area);
    } else if (paintGround(this.tool) !== null) {
      action.painted = [];
      this.paint(sq, action);
    } else if (decoType(this.tool)) {
      action.placed = [];
      this.decorate(sq, action);
    } else if (BUILDINGS[this.tool]) {
      this.grabPending(sq, action);
    }
  }

  toolDrag(sq, action) {
    this.lastHover = sq;
    if (this.tool === 'road') this.paintRoad(sq, action);
    else if (this.tool === 'bulldoze') {
      this.bulldoze(sq);
      this.ghost.showSquares([sq], false);
    } else if (action.area) {
      action.area.to = sq;
      this.showArea(action.area);
    } else if (action.painted) {
      this.paint(sq, action);
    } else if (action.placed) {
      this.decorate(sq, action);
    } else if (BUILDINGS[this.tool] && action.grab) {
      this.movePending(sq[0] - action.grab[0], sq[1] - action.grab[1]);
    }
  }

  toolUp(sq, action) {
    if (action.area) {
      this.fillArea(action.area);
      this.ghost.hide();
      return;
    }
    if (action.touch && !BUILDINGS[this.tool]) this.ghost.hide();
  }

  // ---------- area mode: a rectangle of squares, filled when the finger lifts ----------

  rect({ from, to }) {
    const x0 = Math.max(0, Math.min(from[0], to[0]));
    const y0 = Math.max(0, Math.min(from[1], to[1]));
    const x1 = Math.min(this.world.size - 1, Math.max(from[0], to[0]));
    const y1 = Math.min(this.world.size - 1, Math.max(from[1], to[1]));
    return { x0, y0, x1, y1 };
  }

  showArea(area) {
    const r = this.rect(area);
    this.ghost.hide();
    this.ghost.drawOutline(r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1, true);
  }

  fillArea(area) {
    const r = this.rect(area);
    const w = this.world;
    const g = paintGround(this.tool);
    if (g !== null) {
      let any = false;
      for (let j = r.y0; j <= r.y1; j++) for (let i = r.x0; i <= r.x1; i++) any = w.paintGround(i, j, g, { quiet: true }) || any;
      if (any) w.changed();
      return;
    }
    // decorations: put one on every free spot, keeping inside the rectangle
    const type = decoType(this.tool);
    if (!type) return;
    const def = BUILDINGS[type];
    for (let j = r.y0; j <= r.y1; j++) {
      for (let i = r.x0; i <= r.x1; i++) {
        const rot = def.w === def.d && Math.random() < 0.5 ? 1 : 0;
        const f = w.footprint(type, rot);
        if (i + f.w - 1 > r.x1 || j + f.d - 1 > r.y1) continue;
        if (w.canPlaceBuilding(type, i, j, rot)) w.addBuilding(type, i, j, rot);
      }
    }
  }

  toolCancel(action, young) {
    if (action.tool === 'road' && young && action.added) {
      for (const [i, j] of action.added) this.world.removeRoad(i, j);
    }
    if (young && action.painted) {
      for (const [i, j, g] of action.painted.reverse()) this.world.paintGround(i, j, g);
    }
    if (young && action.placed) {
      for (const id of action.placed) this.world.removeBuilding(id, { silent: true });
    }
    if (action.from && this.pending) this.movePending(...action.from);
    else if (!this.pending) this.ghost.hide();
  }

  toolHover(sq) {
    this.lastHover = sq;
    if (BUILDINGS[this.tool]) return; // the waiting building stays where it is
    if (this.tool === 'road') this.ghost.showSquares([sq], this.world.canPlaceRoad(...sq));
    else if (this.tool === 'bulldoze') this.ghost.showSquares([sq], false);
    else if (paintGround(this.tool) !== null) this.ghost.showSquares([sq], this.world.canPaint(...sq, paintGround(this.tool)));
    else if (decoType(this.tool)) {
      const type = decoType(this.tool);
      const a = this.world.anchorFor(type, 0, ...sq);
      const f = this.world.footprint(type, 0);
      this.ghost.show(type, BUILDINGS[type], a.x, a.y, 0, f.w, f.d, this.world.canPlaceBuilding(type, a.x, a.y, 0));
    } else this.ghost.hide();
  }

  // Decoration tool ('deco:tree1', ...): put one down on the square, straight away, wherever it fits.
  // Square ones are mirrored at random so rows of trees don't look copied.
  decorate(sq, action) {
    const type = decoType(this.tool);
    const def = BUILDINGS[type];
    const rot = def.w === def.d && Math.random() < 0.5 ? 1 : 0;
    const a = this.world.anchorFor(type, rot, ...sq);
    const b = this.world.addBuilding(type, a.x, a.y, rot);
    if (b) action.placed.push(b.id);
    const f = this.world.footprint(type, rot);
    this.ghost.hide();
    this.ghost.drawOutline(a.x, a.y, f.w, f.d, !!b || this.world.buildingAt(...sq)?.type === type);
  }

  // Paint tool ('paint:water', 'paint:sand', ...): change the ground of one square.
  paint(sq, action) {
    const g = paintGround(this.tool);
    const w = this.world;
    const ok = w.canPaint(...sq, g);
    if (ok) {
      const old = w.ground[w.idx(...sq)];
      if (w.paintGround(...sq, g)) action.painted.push([...sq, old]);
    }
    this.ghost.showSquares([sq], ok);
  }

  paintRoad(sq, action) {
    if (this.world.addRoad(...sq)) {
      action.added.push(sq);
      this.fx.dustSquares([sq]);
    }
    this.ghost.showSquares([sq], true);
  }

  // ---------- placing a building: drag it around, then ✔ build, ✖ cancel, 🔄 flip ----------

  // A quick tap with the Move tool: pick up the building under the finger to move it.
  handTap(sq) {
    if (this.disasters.tap(sq)) return; // aiming the meteor
    if (this.tool !== 'hand' || this.pending) return;
    const b = this.buildingUnderPointer() || this.world.buildingAt(...sq);
    if (!b || b.ruined || this.disasters.busy) return; // ruins can be repaired or removed, not moved
    this.world.removeBuilding(b.id, { silent: true });
    this.tool = b.type;
    this.rot = b.rot;
    this.pending = { type: b.type, moving: { x: b.x, y: b.y, rot: b.rot } };
    this.movePending(b.x, b.y);
    this.events.emit('picked-up', b.type);
  }

  // Start placing a building with its middle on square sq (default: the middle of the screen).
  startPlacing(type, sq = this.screenSquare()) {
    this.cancelMove(); // a building that was being moved goes back where it was
    this.tool = type;
    const a = this.world.anchorFor(type, this.rot, sq[0], sq[1]);
    this.pending = { type };
    this.movePending(a.x, a.y);
  }

  // Is the world point on the waiting building (its picture, or its squares with a little extra room)?
  onPending(w) {
    const p = this.pending;
    if (!p || !w) return false;
    const g = toGrid(w.x, w.y);
    const m = 0.5;
    if (g.fx >= p.x - m && g.fx <= p.x + p.w + m && g.fy >= p.y - m && g.fy <= p.y + p.d + m) return true;
    return this.ghost.hit(w.x, w.y, (k, x, y) => this.alphaAt(k, x, y));
  }

  // Finger down on the waiting building: it follows the finger from where it was grabbed.
  grabPending(sq, action) {
    if (!this.pending) this.startPlacing(this.tool, sq);
    const p = this.pending;
    action.from = [p.x, p.y];
    action.grab = [sq[0] - p.x, sq[1] - p.y];
  }

  movePending(x, y) {
    const p = this.pending;
    if (!p) return;
    p.x = x;
    p.y = y;
    const f = this.world.footprint(p.type, this.rot);
    p.w = f.w;
    p.d = f.d;
    p.ok = this.world.canPlaceBuilding(p.type, x, y, this.rot);
    this.ghost.show(p.type, BUILDINGS[p.type], x, y, this.rot, f.w, f.d, p.ok);
  }

  // Mirror the building. A 2x1 building becomes 1x2; it stays centred where it was.
  flipPlacing() {
    const p = this.pending;
    this.rot ^= 1;
    if (!p) return;
    const mid = [p.x + Math.floor((p.w - 1) / 2), p.y + Math.floor((p.d - 1) / 2)];
    const a = this.world.anchorFor(p.type, this.rot, mid[0], mid[1]);
    this.movePending(a.x, a.y);
  }

  // quiet: no shake when the spot is blocked (used when another button interrupts placing)
  confirmPlacing(quiet = false) {
    const p = this.pending;
    if (!p) return false;
    if (!p.ok) {
      if (!quiet) this.cameras.main.shake(120, 0.002);
      return false;
    }
    this.world.addBuilding(p.type, p.x, p.y, this.rot);
    this.pending = null;
    this.ghost.hide();
    return true;
  }

  // ✖: a new building just disappears; a building that was being moved goes back where it was.
  cancelPlacing() {
    const m = this.pending?.moving;
    if (m) {
      this.rot = m.rot;
      this.world.addBuilding(this.pending.type, m.x, m.y, m.rot, { silent: true });
    }
    this.pending = null;
    this.ghost.hide();
  }

  // Anything that interrupts a move (opening a menu, picking another building) puts the building back
  // where it was and goes back to the Move tool. A new building that isn't built yet is left alone.
  // Returns true if a building was put back.
  cancelMove() {
    if (!this.pending?.moving) return false;
    this.cancelPlacing();
    this.tool = 'hand';
    return true;
  }

  // Where the ✔ ✖ ⇆ buttons go: above the waiting building, in CSS pixels.
  placingAnchor() {
    const p = this.pending;
    if (!p) return null;
    const cam = this.cameras.main;
    const place = footprintPlacement(p.x, p.y, p.w, p.d);
    const tex = this.textures.get(BUILDINGS[p.type].base || BUILDINGS[p.type].image).source[0];
    const top = place.tipY - tex.height * (place.width / tex.width);
    const k = cam.zoom * this.scale.zoom;
    return {
      x: (place.left + place.width / 2 - cam.worldView.x) * k,
      y: (top - cam.worldView.y) * k,
      bottom: (place.tipY - cam.worldView.y) * k,
      ok: p.ok,
    };
  }

  screenSquare() {
    const cam = this.cameras.main;
    const c = cam.getWorldPoint(cam.width / 2, cam.height / 2);
    const g = toGrid(c.x, c.y);
    return [Math.floor(g.fx), Math.floor(g.fy)];
  }

  // Map square under a point of the page (CSS pixels), e.g. a finger dragging a building in from the menu.
  squareAtClient(clientX, clientY) {
    const rect = this.game.canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) / this.scale.zoom;
    const sy = (clientY - rect.top) / this.scale.zoom;
    const c = this.cameras.main.getWorldPoint(sx, sy);
    const g = toGrid(c.x, c.y);
    return [Math.floor(g.fx), Math.floor(g.fy)];
  }

  // ---------- removing ----------

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
  }

  cameraMoved() {}

  // ---------- saving ----------

  queueSave() {
    if (this.saveTimer) this.saveTimer.remove();
    this.saveTimer = this.time.delayedCall(700, () => this.saveNow());
  }

  saveNow() {
    if (this.saveTimer) this.saveTimer.remove();
    this.saveTimer = null;
    const data = this.world.serialize();
    // a building that is being moved is saved where it was
    const m = this.pending?.moving;
    if (m) {
      const f = this.world.footprint(this.pending.type, m.rot);
      data.buildings.push([this.pending.type, m.x, m.y, m.rot, f.w, f.d]);
    }
    saveCity(this.city.id, data);
  }
}
