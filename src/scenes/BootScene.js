import Phaser from 'phaser';
import { ART, roadTileName } from '../data/art.js';
import { THEMES, themeCatalog } from '../themes/catalog.js';
import { VEHICLES } from '../data/vehicles.js';
import {
  genGround, genEdge, genShore, genRoadCenter, genRoadArm,
  genPerson, genSoldier, genCar, genPlane, genPuff, genDust, genShadow, genFlame, genDrop,
} from '../art/placeholders.js';

// Every PNG in the project's assets/ folder, found at build time (and live while `npm run dev` runs).
const FILES = import.meta.glob('../../assets/**/*.png', { eager: true, query: '?url', import: 'default' });
const BASE = 'assets/';

// The URL of a file in assets/ (its path from the project folder), or undefined if there is no such file.
// Built files get new names, so pictures loaded later (not at boot) must be looked up here too.
export const assetUrl = (path) => FILES[`../../${path}`];
const EDGE_PARTS = ['ne', 'se', 'sw', 'nw', 'n', 'e', 's', 'w'];

// Only ask the loader for files that exist; everything else gets placeholder art.
function wrapLoader(L) {
  const url = assetUrl;
  return {
    image: (key, path) => url(path) && L.image(key, url(path)),
    spritesheet: (key, path, cfg) => url(path) && L.spritesheet(key, url(path), cfg),
  };
}

// Turn a Pix into a Phaser texture, adding numbered frames for sprite sheets.
export function addPix(scene, key, pix, frameW = 0, frameH = 0) {
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
      L.image(`pavement_${i}`, `${BASE}ground/pavement_${i}.png`);
      L.spritesheet(`water_${i}`, `${BASE}ground/water_${i}.png`, { frameWidth: ART.water.frameW, frameHeight: ART.water.frameH });
    }
    for (const p of EDGE_PARTS) {
      L.image(`edge_grass_${p}`, `${BASE}ground/edge_grass_${p}.png`);
      for (const k of ['foam', 'bank', 'quay']) L.image(`edge_${k}_${p}`, `${BASE}ground/edge_${k}_${p}.png`);
    }
    for (const s of ['ne', 'se', 'sw', 'nw']) L.image(`edge_curb_${s}`, `${BASE}ground/edge_curb_${s}.png`);
    L.image('road_center', `${BASE}roads/road_center.png`);
    for (const s of ['ne', 'se', 'sw', 'nw']) L.image(`road_arm_${s}`, `${BASE}roads/road_arm_${s}.png`);
    for (let m = 0; m < 16; m++) L.image(roadTileName(m), `${BASE}roads/${roadTileName(m)}.png`);
    // Every theme's buildings (assets/building-<theme>/<Menu>/<name>-<W>x<D>.png).
    for (const id of Object.keys(THEMES)) {
      for (const def of Object.values(themeCatalog(id).defs)) this.load.image(def.base || def.image, def.url);
    }
    const sheet = (key, path, f) => L.spritesheet(key, path, { frameWidth: f.frameW, frameHeight: f.frameH });
    for (let i = 0; i < ART.personVariants; i++) sheet(`person_${i}`, `${BASE}people/person_${i}.png`, ART.person);
    for (let i = 0; i < ART.carVariants; i++) sheet(`car_${i}`, `${BASE}vehicles/car_${i}.png`, ART.car);
    sheet('soldier', `${BASE}people/soldier.png`, ART.person);
    sheet('police_car', `${BASE}vehicles/police_car.png`, ART.car);
    // Vehicles cut from the sheets by `npm run art` (4 views side by side, see src/data/vehicles.js).
    for (const id of Object.keys(VEHICLES)) L.image(`veh:${id}`, `${BASE}vehicles/${id}.png`);
    L.image('rocket', `${BASE}vehicles/rocket-1x1.png`); // the rocket pad's rocket (src/agents/Rockets.js)
    for (let i = 0; i < ART.planeVariants; i++) sheet(`plane_${i}`, `${BASE}vehicles/plane_${i}.png`, ART.plane);
    L.image('fx_smoke', `${BASE}fx/smoke.png`);
    L.image('volcano', `${BASE}disaster/volcano-8x8.png`);
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

    // Code-drawn grass: plain green with specks and blades, 4 slightly different squares mixed at random.
    group('grass', 'grass', ART.groundVariants, (k, i) => addPix(this, k, genGround('grass', i)), 4);
    const checker = false; // (grass used to be a light and dark checkerboard)
    group('sand', 'sand', ART.groundVariants, (k, i) => addPix(this, k, genGround('sand', i)), 3);
    group('pavement', 'pavement', ART.groundVariants, (k, i) => addPix(this, k, genGround('pavement', i)), 2);
    group('water', 'water', ART.groundVariants, (k, i) => addPix(this, k, genGround('water', i, 4), 128, 64), 2);
    group('person', 'person', ART.personVariants, (k, i) => addPix(this, k, genPerson(i), 32, 48), 5);
    group('car', 'car', ART.carVariants, (k, i) => addPix(this, k, genCar(i), 64, 48), 4);
    group('plane', 'plane', ART.planeVariants, (k, i) => addPix(this, k, genPlane(i), 384, 256), 2);

    for (const p of EDGE_PARTS) {
      if (!has(`edge_grass_${p}`)) {
        addPix(this, `edge_grass_${p}`, genEdge('grass', p, 0));
        if (checker) addPix(this, `edge_grass_${p}_1`, genEdge('grass', p, 1));
      }
      if (!has(`edge_foam_${p}`)) addPix(this, `edge_foam_${p}`, genEdge('foam', p));
      for (const k of ['bank', 'quay']) if (!has(`edge_${k}_${p}`)) addPix(this, `edge_${k}_${p}`, genShore(k, p));
    }
    for (const s of ['ne', 'se', 'sw', 'nw']) if (!has(`edge_curb_${s}`)) addPix(this, `edge_curb_${s}`, genShore('curb', s));
    if (!has('road_center')) addPix(this, 'road_center', genRoadCenter());
    for (const s of ['ne', 'se', 'sw', 'nw']) if (!has(`road_arm_${s}`)) addPix(this, `road_arm_${s}`, genRoadArm(s));
    if (!has('soldier')) addPix(this, 'soldier', genSoldier(), 32, 48);
    if (!has('police_car')) addPix(this, 'police_car', genCar(0, true), 64, 48);
    if (!has('fx_smoke')) addPix(this, 'fx_smoke', genPuff());
    if (!has('fx_dust')) addPix(this, 'fx_dust', genDust());
    addPix(this, 'fx_shadow', genShadow());
    if (!has('fx_flame')) addPix(this, 'fx_flame', genFlame());
    if (!has('fx_drop')) addPix(this, 'fx_drop', genDrop());

    for (const id of Object.keys(THEMES)) {
      for (const def of Object.values(themeCatalog(id).defs)) if (def.parts) this.cutParts(def);
    }

    // Full road tiles the player provided (optional).
    const roadTiles = [];
    for (let m = 0; m < 16; m++) roadTiles[m] = has(roadTileName(m)) ? roadTileName(m) : null;

    for (const id of Object.keys(VEHICLES)) {
      if (!has(`veh:${id}`)) continue;
      const tex = this.textures.get(`veh:${id}`);
      const src = tex.source[0];
      const fw = Math.floor(src.width / 4);
      for (let k = 0; k < 4; k++) tex.add(k, 0, k * fw, 0, fw, src.height);
    }

    this.registry.set('variants', variants);
    this.registry.set('roadTiles', roadTiles);
    this.registry.set('checkerGrass', checker);
    this.game.events.emit('boot-done');
  }

  // For a mostly flat picture (the airport): keep only the parts that stand up, as a second texture.
  cutParts(def) {
    const src = this.textures.get(def.base).getSourceImage();
    const W = def.w;
    const D = def.d;
    const H = src.height;
    const P = (x, y, z) => [D * 64 + (x - y) * 64, H - (W + D) * 32 + (x + y) * 32 - z];
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    // the ground's colour, for slim parts below (read before the cut)
    // (def.cutColors: more ground colours to cut out, e.g. paint lines and sand, as 0xRRGGBB)
    let grounds = null;
    if (def.apron) {
      const [gx, gy] = P(def.apron[0], def.apron[1], 0).map(Math.round);
      const sample = ctx.getImageData(gx - 4, gy - 4, 9, 9).data;
      grounds = [[0, 1, 2].map((ch) => {
        let sum = 0;
        for (let k = ch; k < sample.length; k += 4) sum += sample[k];
        return sum / 81;
      })];
      for (const c0 of def.cutColors || []) grounds.push([(c0 >> 16) & 255, (c0 >> 8) & 255, c0 & 255]);
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    for (const p of def.parts) {
      const pts = [
        P(p.x, p.y, p.h), P(p.x + p.w, p.y, p.h), P(p.x + p.w, p.y, 0),
        P(p.x + p.w, p.y + p.d, 0), P(p.x, p.y + p.d, 0), P(p.x, p.y + p.d, p.h),
      ];
      ctx.moveTo(...pts[0]);
      for (const q of pts.slice(1)) ctx.lineTo(...q);
      ctx.closePath();
    }
    ctx.fill();
    // A slim part (thin: true, the control tower) takes in some ground around it: cut out the pixels in its box
    // that have the ground's colour (def.apron: a point on the ground) or are grass.
    const thin = def.parts.filter((p) => p.thin);
    if (thin.length && grounds) {
      const img = ctx.getImageData(0, 0, c.width, H);
      const d = img.data;
      for (const p of thin) {
        const box = new Path2D();
        const pts = [P(p.x, p.y, p.h), P(p.x + p.w, p.y, p.h), P(p.x + p.w, p.y, 0), P(p.x + p.w, p.y + p.d, 0),
          P(p.x, p.y + p.d, 0), P(p.x, p.y + p.d, p.h)];
        box.moveTo(...pts[0]);
        for (const q of pts.slice(1)) box.lineTo(...q);
        box.closePath();
        const xs = pts.map((q) => q[0]);
        const ys = pts.map((q) => q[1]);
        for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(H, Math.ceil(Math.max(...ys))); y++) {
          for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(c.width, Math.ceil(Math.max(...xs))); x++) {
            if (!ctx.isPointInPath(box, x + 0.5, y + 0.5)) continue;
            const k = (y * c.width + x) * 4;
            const grass = d[k + 1] > d[k] + 12 && d[k + 1] > d[k + 2] + 6;
            if (grass || grounds.some((g) => Math.hypot(d[k] - g[0], d[k + 1] - g[1], d[k + 2] - g[2]) < 44)) d[k + 3] = 0;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    if (this.textures.exists(def.image)) this.textures.remove(def.image);
    this.textures.addCanvas(def.image, c);
  }
}
