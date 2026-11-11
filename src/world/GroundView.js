import { DEPTH, GROUND, GROUND_NAMES, HW, HH, SIDES, SIDE_LIST } from '../constants.js';
import { toGrid, viewRect } from '../iso.js';

// Draws only the squares that are on screen (ground, shore edges, roads),
// reusing a pool of images. A 100 x 100 map would otherwise be ~15,000 images.
const CORNERS = [
  { name: 'n', di: -1, dj: -1, a: 'nw', b: 'ne' },
  { name: 'e', di: 1, dj: -1, a: 'ne', b: 'se' },
  { name: 's', di: 1, dj: 1, a: 'se', b: 'sw' },
  { name: 'w', di: -1, dj: 1, a: 'sw', b: 'nw' },
];

export class GroundView {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.pool = [];
    this.used = 0;
    this.water = [];
    this.waterFrame = 0;
    this.last = '';
    this.lastVersion = -1;
    this.roadAnims = new Map(); // square index -> start time
    const reg = scene.registry;
    this.variants = reg.get('variants');
    this.roadTiles = reg.get('roadTiles');
    this.waterFrames = this.variants.water.map((k) => Math.max(1, scene.textures.get(k).frameTotal - 1));
    this.checker = reg.get('checkerGrass');
    world.on('road-added', (i, j) => this.roadAnims.set(world.idx(i, j), scene.time.now));
  }

  img(key, frame) {
    let im = this.pool[this.used];
    if (!im) {
      im = this.scene.add.image(0, 0, key, frame);
      this.pool.push(im);
    } else {
      im.setTexture(key, frame);
      im.setVisible(true).setAlpha(1).setFlipX(false).setOrigin(0.5, 0.5);
    }
    this.used++;
    return im;
  }

  // Grass fringe matching the checkerboard colour of the grass square it comes from.
  edgeKey(kind, part, dark) {
    return kind === 'grass' && dark && this.checker ? `edge_grass_${part}_1` : `edge_${kind}_${part}`;
  }

  rank(i, j) {
    const w = this.world;
    if (!w.inBounds(i, j)) return 0;
    return w.ground[w.idx(i, j)];
  }

  update(time) {
    const cam = this.scene.cameras.main;
    // animate water without a full redraw
    const wf = Math.floor(time / 280);
    if (wf !== this.waterFrame) {
      this.waterFrame = wf;
      for (const { im, n } of this.water) im.setFrame(wf % n);
    }

    let animating = false;
    for (const [k, t0] of this.roadAnims) {
      if (time - t0 > 260) this.roadAnims.delete(k);
      else animating = true;
    }
    const key = `${cam.scrollX | 0},${cam.scrollY | 0},${cam.zoom},${cam.width},${cam.height}`;
    if (key === this.last && this.world.version === this.lastVersion && !animating && !this.hadAnim) return;
    this.hadAnim = animating;
    this.last = key;
    this.lastVersion = this.world.version;
    this.redraw(cam, time);
  }

  redraw(cam, time) {
    const w = this.world;
    const N = w.size;
    const v = viewRect(cam);
    const L = v.x - HW * 2;
    const R = v.x + v.w + HW * 2;
    const T = v.y - HH * 4;
    const B = v.y + v.h + HH * 2;
    const pts = [toGrid(L, T), toGrid(R, T), toGrid(L, B), toGrid(R, B)];
    const i0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.fx))));
    const i1 = Math.min(N - 1, Math.ceil(Math.max(...pts.map((p) => p.fx))));
    const j0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.fy))));
    const j1 = Math.min(N - 1, Math.ceil(Math.max(...pts.map((p) => p.fy))));

    this.used = 0;
    this.water.length = 0;
    const V = this.variants;

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = (i - j) * HW;
        const cy = (i + j + 1) * HH;
        if (cx < L || cx > R || cy < T || cy > B) continue;
        const k = j * N + i;
        const g = w.ground[k];
        {
          // ground
          const list = V[GROUND_NAMES[g]];
          const gi = g === GROUND.GRASS && this.checker ? (i + j) & 1 : w.gvar[k] % list.length;
          const base = this.img(list[gi], g === GROUND.WATER ? this.waterFrame % this.waterFrames[gi] : undefined);
          base.setPosition(cx, cy).setDepth(DEPTH.GROUND);
          if (g === GROUND.WATER) this.water.push({ im: base, n: this.waterFrames[gi] });

          // shore edges on the lower of two neighbouring ground types
          if (g !== GROUND.GRASS) {
            const kind = g === GROUND.SAND ? 'grass' : 'foam';
            const higher = {};
            for (const s of SIDE_LIST) {
              const d = SIDES[s];
              higher[s] = this.rank(i + d.dx, j + d.dy) > g;
              if (higher[s]) this.img(this.edgeKey(kind, s, (i + j + 1) & 1)).setPosition(cx, cy).setDepth(DEPTH.EDGE);
            }
            for (const c of CORNERS) {
              if (!higher[c.a] && !higher[c.b] && this.rank(i + c.di, j + c.dj) > g) {
                this.img(this.edgeKey(kind, c.name, (i + j) & 1)).setPosition(cx, cy).setDepth(DEPTH.EDGE);
              }
            }
          }

          // roads
          if (w.road[k]) {
            const t0 = this.roadAnims.get(k);
            let dy = 0;
            let alpha = 1;
            if (t0 !== undefined) {
              const p = Math.min(1, (time - t0) / 260);
              dy = -(1 - p) * (1 - p) * 14;
              alpha = 0.4 + 0.6 * p;
            }
            const mask = w.roadMask(i, j);
            const full = this.roadTiles[mask];
            if (full) {
              this.img(full).setPosition(cx, cy + dy).setDepth(DEPTH.ROAD).setAlpha(alpha);
            } else {
              this.img('road_center').setPosition(cx, cy + dy).setDepth(DEPTH.ROAD).setAlpha(alpha);
              for (const s of SIDE_LIST) {
                if (mask & SIDES[s].bit) {
                  this.img(`road_arm_${s}`).setPosition(cx, cy + dy).setDepth(DEPTH.ROAD_ARM).setAlpha(alpha);
                }
              }
            }
          }
        }
      }
    }
    for (let n = this.used; n < this.pool.length; n++) this.pool[n].setVisible(false);
  }
}
