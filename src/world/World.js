import { MAP_SIZE, GROUND, GROUND_NAMES, SIDES, SIDE_LIST } from '../constants.js';
import { BUILDINGS } from '../themes/catalog.js';
import { generateMap } from './mapgen.js';

// The rotated version of a side: rotation mirrors the building, swapping x and y.
const ROT_SIDE = { ne: 'nw', nw: 'ne', se: 'sw', sw: 'se' };

export class World {
  constructor(seed, size = MAP_SIZE) {
    this.size = size;
    this.seed = seed;
    const m = generateMap(size, seed);
    this.ground = m.ground;
    this.gvar = m.gvar;
    this.tree = m.tree;
    this.tjx = m.tjx;
    this.tjy = m.tjy;
    this.road = new Uint8Array(size * size);
    this.bldg = new Int32Array(size * size); // building id, 0 = none
    this.buildings = new Map();
    this.nextId = 1;
    this.clearedTrees = new Set();
    this.version = 0; // bumps on every change so views know to redraw
    this.roadCount = 0;
    this.listeners = {};
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }

  // For things that only care whether a building is there and working: added(b) when it is built or
  // repaired, removed(b) when it is taken away or ruined.
  onBuilding(added, removed) {
    this.on('building-added', (b, silent) => !b.ruined && added(b, silent));
    this.on('building-repaired', (b) => added(b, true));
    this.on('building-removed', (b, silent) => !b.ruined && removed(b, silent));
    this.on('building-ruined', (b, silent) => removed(b, silent));
  }

  emit(ev, ...args) {
    for (const fn of this.listeners[ev] || []) fn(...args);
  }

  changed() {
    this.version++;
    this.emit('changed');
  }

  idx(i, j) {
    return j * this.size + i;
  }

  inBounds(i, j) {
    return i >= 0 && j >= 0 && i < this.size && j < this.size;
  }

  isWater(i, j) {
    return !this.inBounds(i, j) || this.ground[this.idx(i, j)] === GROUND.WATER;
  }

  isRoad(i, j) {
    return this.inBounds(i, j) && this.road[this.idx(i, j)] === 1;
  }

  buildingAt(i, j) {
    if (!this.inBounds(i, j)) return null;
    const id = this.bldg[this.idx(i, j)];
    return id ? this.buildings.get(id) : null;
  }

  roadMask(i, j) {
    let m = 0;
    for (const s of SIDE_LIST) {
      const d = SIDES[s];
      if (this.isRoad(i + d.dx, j + d.dy)) m |= d.bit;
    }
    return m;
  }

  // ---------- trees ----------

  clearTree(i, j) {
    const k = this.idx(i, j);
    if (!this.tree[k]) return false;
    this.tree[k] = 0;
    this.clearedTrees.add(k);
    return true;
  }

  // ---------- painting the ground ----------

  // Water can't go under roads or buildings; anything else can go anywhere.
  canPaint(i, j, g) {
    if (!this.inBounds(i, j)) return false;
    const k = this.idx(i, j);
    return g !== GROUND.WATER || (!this.road[k] && !this.bldg[k]);
  }

  // quiet: don't announce the change (when painting many squares at once, call changed() after)
  paintGround(i, j, g, { quiet = false } = {}) {
    if (!this.canPaint(i, j, g)) return false;
    const k = this.idx(i, j);
    if (this.ground[k] === g) return false;
    this.ground[k] = g;
    this.painted = true;
    if (!quiet) this.changed();
    return true;
  }

  // ---------- roads ----------

  canPlaceRoad(i, j) {
    if (!this.inBounds(i, j) || this.isWater(i, j)) return false;
    const k = this.idx(i, j);
    return !this.road[k] && !this.bldg[k];
  }

  addRoad(i, j) {
    if (!this.canPlaceRoad(i, j)) return false;
    const k = this.idx(i, j);
    this.clearTree(i, j);
    this.road[k] = 1;
    this.roadCount++;
    this.emit('road-added', i, j);
    this.changed();
    return true;
  }

  removeRoad(i, j) {
    if (!this.isRoad(i, j)) return false;
    this.road[this.idx(i, j)] = 0;
    this.roadCount--;
    this.emit('road-removed', i, j);
    this.changed();
    return true;
  }

  // ---------- buildings ----------

  footprint(type, rot) {
    const def = BUILDINGS[type];
    return rot ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
  }

  // Building-local square/point -> map coordinates.
  toMap(b, lx, ly) {
    return b.rot ? [b.x + ly, b.y + lx] : [b.x + lx, b.y + ly];
  }

  mapSide(side, rot) {
    return rot ? ROT_SIDE[side] : side;
  }

  // Top corner of the footprint so that the tapped square is near its middle.
  anchorFor(type, rot, i, j) {
    const f = this.footprint(type, rot);
    return { x: i - Math.floor((f.w - 1) / 2), y: j - Math.floor((f.d - 1) / 2) };
  }

  canPlaceBuilding(type, x, y, rot) {
    const f = this.footprint(type, rot);
    for (let j = y; j < y + f.d; j++) {
      for (let i = x; i < x + f.w; i++) {
        if (!this.inBounds(i, j) || this.isWater(i, j)) return false;
        const k = this.idx(i, j);
        if (this.road[k] || this.bldg[k]) return false;
      }
    }
    if (BUILDINGS[type].nearWater && !this.waterSides(x, y, f.w, f.d).length) return false;
    return true;
  }

  // Water squares sharing an edge with a footprint, with the side they are on: [{ i, j, side }].
  waterSides(x, y, w, d) {
    const out = [];
    const add = (i, j, side) => {
      if (this.inBounds(i, j) && this.ground[this.idx(i, j)] === GROUND.WATER) out.push({ i, j, side });
    };
    for (let i = x; i < x + w; i++) {
      add(i, y - 1, 'ne');
      add(i, y + d, 'sw');
    }
    for (let j = y; j < y + d; j++) {
      add(x - 1, j, 'nw');
      add(x + w, j, 'se');
    }
    return out;
  }

  addBuilding(type, x, y, rot, { silent = false } = {}) {
    if (!this.canPlaceBuilding(type, x, y, rot)) return null;
    const f = this.footprint(type, rot);
    const b = { id: this.nextId++, type, x, y, rot, w: f.w, d: f.d, def: BUILDINGS[type] };
    for (let j = y; j < y + f.d; j++) {
      for (let i = x; i < x + f.w; i++) {
        this.clearTree(i, j);
        this.bldg[this.idx(i, j)] = b.id;
      }
    }
    this.buildings.set(b.id, b);
    this.emit('building-added', b, silent);
    this.changed();
    return b;
  }

  // silent: no dust or shrink animation (used when a building is picked up to be moved).
  removeBuilding(id, { silent = false } = {}) {
    const b = this.buildings.get(id);
    if (!b) return false;
    for (let j = b.y; j < b.y + b.d; j++) for (let i = b.x; i < b.x + b.w; i++) this.bldg[this.idx(i, j)] = 0;
    this.buildings.delete(id);
    this.emit('building-removed', b, silent);
    this.changed();
    return true;
  }

  // ---------- disasters ----------

  // A ruined building keeps its squares but stops working (no people, cars, helicopters, planes, ships).
  ruinBuilding(b, { silent = false } = {}) {
    if (!b || b.ruined || !this.buildings.has(b.id)) return false;
    b.ruined = true;
    this.emit('building-ruined', b, silent);
    this.changed();
    return true;
  }

  ruinedCount() {
    let n = 0;
    for (const b of this.buildings.values()) if (b.ruined) n++;
    return n;
  }

  repairAll() {
    const list = [...this.buildings.values()].filter((b) => b.ruined);
    for (const b of list) {
      b.ruined = false;
      this.emit('building-repaired', b);
    }
    if (list.length) this.changed();
    return list.length;
  }

  // Door (or garage) of a building in map coordinates.
  // tile: the building square, outside: the square in front of it, point: the doorway itself.
  entrance(b, which = 'door') {
    const spot = b.def[which];
    if (!spot) return null;
    const [ti, tj] = this.toMap(b, spot.x, spot.y);
    const side = this.mapSide(spot.side, b.rot);
    const d = SIDES[side];
    return {
      tile: [ti, tj],
      outside: [ti + d.dx, tj + d.dy],
      side,
      dir: [d.dx, d.dy],
      point: { x: ti + 0.5 + d.dx * 0.5, y: tj + 0.5 + d.dy * 0.5 },
    };
  }

  // Can people walk on this square?
  walkable(i, j) {
    if (!this.inBounds(i, j) || this.isWater(i, j)) return false;
    return !this.bldg[this.idx(i, j)];
  }

  // ---------- save / load ----------

  serialize() {
    const roads = [];
    for (let k = 0; k < this.road.length; k++) if (this.road[k]) roads.push(k);
    return {
      v: 1,
      seed: this.seed,
      // the whole ground as one digit per square, once the player has painted it
      ground: this.painted ? this.ground.join('') : undefined,
      roads,
      trees: [...this.clearedTrees],
      // [type, x, y, rot, w, d, ruined]: the size is kept so a building that got bigger in a new version can be dropped
      buildings: [...this.buildings.values()].map((b) => (b.ruined
        ? [b.type, b.x, b.y, b.rot, b.w, b.d, 1]
        : [b.type, b.x, b.y, b.rot, b.w, b.d])),
    };
  }

  // Rebuild a world from serialize() data. Buildings are added later, once the views exist (see GameScene).
  static fromData(data) {
    if (!data || data.v !== 1) return null;
    const w = new World(data.seed);
    if (typeof data.ground === 'string' && data.ground.length === w.ground.length) {
      for (let k = 0; k < w.ground.length; k++) {
        const g = data.ground.charCodeAt(k) - 48;
        if (g >= 0 && g < GROUND_NAMES.length) w.ground[k] = g;
      }
      w.painted = true;
    }
    for (const k of data.trees || []) {
      w.tree[k] = 0;
      w.clearedTrees.add(k);
    }
    for (const k of data.roads || []) {
      if (!w.road[k]) {
        w.road[k] = 1;
        w.roadCount++;
      }
    }
    w.pendingBuildings = (data.buildings || []).filter((b) => w.stillFits(b));
    return w;
  }

  // Can a saved building [type, x, y, rot, w, d] still be loaded? Not if a new version of the game
  // removed it or made it bigger. (Old saves have no size; those buildings are added if they fit.)
  stillFits([type, , , rot, w, d]) {
    if (!BUILDINGS[type]) return false;
    if (w === undefined || d === undefined) return true;
    const f = this.footprint(type, rot);
    return f.w <= w && f.d <= d;
  }
}
