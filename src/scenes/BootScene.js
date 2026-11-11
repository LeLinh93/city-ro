import Phaser from 'phaser';
import { ART, roadTileName } from '../data/art.js';
import { BUILDINGS } from '../data/buildings.js';
import {
  genGround, genEdge, genRoadCenter, genRoadArm, genTree, genBuilding, genAirportBase,
  genPerson, genCar, genPlane, genPuff, genDust, genShadow,
} from '../art/placeholders.js';

// Every PNG in the project's assets/ folder, found at build time (and live while `npm run dev` runs).
const FILES = import.meta.glob('../../assets/**/*.png', { eager: true, query: '?url', import: 'default' });
const BASE = 'assets/';
const EDGE_PARTS = ['ne', 'se', 'sw', 'nw', 'n', 'e', 's', 'w'];

// Only ask the loader for files that exist; everything else gets placeholder art.
function wrapLoader(L) {
  const url = (path) => FILES[`../../${path}`];
  return {
    image: (key, path) => url(path) && L.image(key, url(path)),
    spritesheet: (key, path, cfg) => url(path) && L.spritesheet(key, url(path), cfg),
  };
}

// Turn a Pix into a Phaser texture, adding numbered frames for sprite sheets.
function addPix(scene, key, pix, frameW = 0, frameH = 0) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, pix.w, pix.h);
  const img = tex.context.createImageData(pix.w, pix.h);
  img.data.set(pix.data);
  tex.context.putImageData(img, 0, 0);
  tex.refresh();
  if (frameW && frameH) {
    let n = 0;
    for (let y = 0; y + frameH <= pix.h; y += frameH) {
      for (let x = 0; x + frameW <= pix.w; x += frameW) tex.add(n++, 0, x, y, frameW, frameH);
    }
  }
  return tex;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    const L = wrapLoader(this.load);
    const v = ART.groundVariants;
    for (let i = 0; i < v; i++) {
      L.image(`grass_${i}`, `${BASE}ground/grass_${i}.png`);
      L.image(`sand_${i}`, `${BASE}ground/sand_${i}.png`);
      L.spritesheet(`water_${i}`, `${BASE}ground/water_${i}.png`, { frameWidth: ART.water.frameW, frameHeight: ART.water.frameH });
    }
    for (const p of EDGE_PARTS) {
      L.image(`edge_grass_${p}`, `${BASE}ground/edge_grass_${p}.png`);
      L.image(`edge_foam_${p}`, `${BASE}ground/edge_foam_${p}.png`);
    }
    L.image('road_center', `${BASE}roads/road_center.png`);
    for (const s of ['ne', 'se', 'sw', 'nw']) L.image(`road_arm_${s}`, `${BASE}roads/road_arm_${s}.png`);
    for (let m = 0; m < 16; m++) L.image(roadTileName(m), `${BASE}roads/${roadTileName(m)}.png`);
    for (let i = 0; i < ART.treeVariants; i++) {
      if (ART.tree.frameW) L.spritesheet(`tree_${i}`, `${BASE}trees/tree_${i}.png`, { frameWidth: ART.tree.frameW, frameHeight: ART.tree.frameH });
      else L.image(`tree_${i}`, `${BASE}trees/tree_${i}.png`);
    }
    for (const def of Object.values(BUILDINGS)) {
      L.image(`b_${def.image}`, `${BASE}buildings/${def.image}.png`);
      L.image(`b_${def.image}_r`, `${BASE}buildings/${def.image}_r.png`);
      if (def.base) {
        L.image(`b_${def.base}`, `${BASE}buildings/${def.base}.png`);
        L.image(`b_${def.base}_r`, `${BASE}buildings/${def.base}_r.png`);
      }
    }
    const sheet = (key, path, f) => L.spritesheet(key, path, { frameWidth: f.frameW, frameHeight: f.frameH });
    for (let i = 0; i < ART.personVariants; i++) sheet(`person_${i}`, `${BASE}people/person_${i}.png`, ART.person);
    for (let i = 0; i < ART.carVariants; i++) sheet(`car_${i}`, `${BASE}vehicles/car_${i}.png`, ART.car);
    sheet('police_car', `${BASE}vehicles/police_car.png`, ART.car);
    for (let i = 0; i < ART.planeVariants; i++) sheet(`plane_${i}`, `${BASE}vehicles/plane_${i}.png`, ART.plane);
    L.image('fx_smoke', `${BASE}fx/smoke.png`);
    L.image('fx_dust', `${BASE}fx/dust.png`);
  }

  create() {
    const has = (k) => this.textures.exists(k);
    const variants = {};

    // Groups: use the player's files if any exist, else placeholders.
    const group = (name, prefix, count, make, defaultCount) => {
      const mine = [];
      for (let i = 0; i < count; i++) if (has(`${prefix}_${i}`)) mine.push(`${prefix}_${i}`);
      if (mine.length) {
        variants[name] = mine;
        return;
      }
      const list = [];
      for (let i = 0; i < defaultCount; i++) {
        const key = `${prefix}_${i}`;
        make(key, i);
        list.push(key);
      }
      variants[name] = list;
    };

    group('grass', 'grass', ART.groundVariants, (k, i) => addPix(this, k, genGround('grass', i)), 3);
    group('sand', 'sand', ART.groundVariants, (k, i) => addPix(this, k, genGround('sand', i)), 3);
    group('water', 'water', ART.groundVariants, (k, i) => addPix(this, k, genGround('water', i, 4), 128, 64), 2);
    group('tree', 'tree', ART.treeVariants, (k, i) => addPix(this, k, genTree(i)), 4);
    group('person', 'person', ART.personVariants, (k, i) => addPix(this, k, genPerson(i), 32, 48), 5);
    group('car', 'car', ART.carVariants, (k, i) => addPix(this, k, genCar(i), 64, 48), 4);
    group('plane', 'plane', ART.planeVariants, (k, i) => addPix(this, k, genPlane(i), 384, 256), 2);

    for (const p of EDGE_PARTS) {
      if (!has(`edge_grass_${p}`)) addPix(this, `edge_grass_${p}`, genEdge('grass', p));
      if (!has(`edge_foam_${p}`)) addPix(this, `edge_foam_${p}`, genEdge('foam', p));
    }
    if (!has('road_center')) addPix(this, 'road_center', genRoadCenter());
    for (const s of ['ne', 'se', 'sw', 'nw']) if (!has(`road_arm_${s}`)) addPix(this, `road_arm_${s}`, genRoadArm(s));
    if (!has('police_car')) addPix(this, 'police_car', genCar(0, true), 64, 48);
    if (!has('fx_smoke')) addPix(this, 'fx_smoke', genPuff());
    if (!has('fx_dust')) addPix(this, 'fx_dust', genDust());
    addPix(this, 'fx_shadow', genShadow());

    for (const def of Object.values(BUILDINGS)) {
      if (!has(`b_${def.image}`)) addPix(this, `b_${def.image}`, genBuilding(def));
      if (def.base && !has(`b_${def.base}`)) addPix(this, `b_${def.base}`, genAirportBase(def));
    }

    // Full road tiles the player provided (optional).
    const roadTiles = [];
    for (let m = 0; m < 16; m++) roadTiles[m] = has(roadTileName(m)) ? roadTileName(m) : null;

    this.registry.set('variants', variants);
    this.registry.set('roadTiles', roadTiles);
    this.scene.start('game');
  }
}
