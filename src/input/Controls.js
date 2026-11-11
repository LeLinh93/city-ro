import Phaser from 'phaser';
import { ZOOM_STEPS } from '../constants.js';
import { screenToWorld, scrollFor, toGrid } from '../iso.js';

const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];
const CANCEL_MS = 220; // a second finger this soon after the first means "pinch", not "build"

// Touch:  one finger = use the tool (drag the map with the Move tool),
//         two fingers = pan and pinch-zoom.
// Mouse:  left = use the tool, right/middle drag = pan, wheel = zoom.
export class Controls {
  constructor(scene) {
    this.scene = scene;
    this.cam = scene.cameras.main;
    const input = scene.input;
    input.addPointer(2);
    if (input.mouse) input.mouse.disableContextMenu();
    this.touches = new Map();
    this.gesture = null;
    this.blockTouch = false;
    this.pan = null;
    this.action = null;

    input.on('pointerdown', this.down, this);
    input.on('pointermove', this.move, this);
    input.on('pointerup', this.up, this);
    input.on('pointerupoutside', this.up, this);
    input.on('wheel', (p, over, dx, dy) => this.zoomStep(dy > 0 ? -1 : 1, p.x, p.y));
  }

  squareAt(p) {
    const w = screenToWorld(this.cam, p.x, p.y);
    this.scene.pointerWorld = w;
    const g = toGrid(w.x, w.y);
    return [Math.floor(g.fx), Math.floor(g.fy)];
  }

  down(p) {
    if (p.wasTouch) {
      this.touches.set(p.id, { x: p.x, y: p.y });
      if (this.touches.size >= 2) {
        this.cancelAction();
        this.startGesture();
        return;
      }
      if (this.blockTouch) return;
    } else if (p.rightButtonDown() || p.middleButtonDown()) {
      this.pan = { x: p.x, y: p.y };
      return;
    }
    const tool = this.scene.tool;
    if (tool === 'hand') {
      this.pan = { x: p.x, y: p.y };
      return;
    }
    this.action = { tool, t0: this.scene.time.now, last: null, touch: p.wasTouch, pointer: p.id };
    this.scene.toolDown(this.squareAt(p), this.action);
    this.action.last = this.squareAt(p);
  }

  move(p) {
    if (p.wasTouch && this.touches.has(p.id)) {
      this.touches.set(p.id, { x: p.x, y: p.y });
      if (this.gesture) {
        this.updateGesture();
        return;
      }
    }
    if (this.pan) {
      const z = this.cam.zoom;
      this.cam.scrollX -= (p.x - this.pan.x) / z;
      this.cam.scrollY -= (p.y - this.pan.y) / z;
      this.pan = { x: p.x, y: p.y };
      return;
    }
    const sq = this.squareAt(p);
    if (this.action && this.action.pointer === p.id) {
      const a = this.action;
      let [ti, tj] = sq;
      if (a.tool === 'road') {
        // Roads go in straight lines along the grid. Moving sideways (not diagonally) turns a corner.
        a.anchor ||= a.last;
        const di = ti - a.anchor[0];
        const dj = tj - a.anchor[1];
        if (!a.axis && (di || dj)) {
          a.axis = Math.abs(di) >= Math.abs(dj) ? 'i' : 'j';
          a.mark = a.axis === 'i' ? ti : tj;
        }
        if (!a.axis) return;
        const along = a.axis === 'i' ? ti : tj;
        const perp = a.axis === 'i' ? dj : di;
        if (perp === 0) a.mark = along; // finger is back on the line
        if (Math.abs(perp) >= 2 && Math.abs(perp) > 2 * Math.abs(along - a.mark)) {
          // turn the corner at the current end of the road
          a.anchor = a.axis === 'i' ? [a.last[0], a.anchor[1]] : [a.anchor[0], a.last[1]];
          a.axis = a.axis === 'i' ? 'j' : 'i';
          a.mark = a.axis === 'i' ? ti : tj;
        }
        if (a.axis === 'i') tj = a.anchor[1];
        else ti = a.anchor[0];
      }
      // walk square by square so dragged roads never have gaps
      let [i, j] = a.last;
      let guard = 0;
      while ((i !== ti || j !== tj) && guard++ < 400) {
        if (Math.abs(ti - i) >= Math.abs(tj - j)) i += Math.sign(ti - i);
        else j += Math.sign(tj - j);
        this.scene.toolDrag([i, j], a);
      }
      a.last = [i, j];
    } else if (!p.wasTouch && !p.isDown) {
      this.scene.toolHover(sq);
    }
  }

  up(p) {
    if (p.wasTouch) {
      this.touches.delete(p.id);
      if (this.gesture) {
        if (this.touches.size < 2) {
          this.endGesture();
          this.blockTouch = this.touches.size > 0;
        }
        return;
      }
      if (this.touches.size === 0) this.blockTouch = false;
    }
    this.pan = null;
    if (this.action && this.action.pointer === p.id) {
      this.scene.toolUp(this.squareAt(p), this.action);
      this.action = null;
    }
  }

  cancelAction() {
    this.pan = null;
    if (!this.action) return;
    const young = this.scene.time.now - this.action.t0 < CANCEL_MS;
    this.scene.toolCancel(this.action, young);
    this.action = null;
  }

  // ---------- pinch / zoom ----------

  twoTouches() {
    const [a, b] = [...this.touches.values()];
    return { a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)) };
  }

  startGesture() {
    const t = this.twoTouches();
    this.gesture = { dist: t.dist, zoom: this.cam.zoom, world: screenToWorld(this.cam, t.mid.x, t.mid.y) };
    this.blockTouch = true;
  }

  updateGesture() {
    if (this.touches.size < 2) return;
    const t = this.twoTouches();
    const g = this.gesture;
    const z = Phaser.Math.Clamp(g.zoom * (t.dist / g.dist), MIN_ZOOM, MAX_ZOOM);
    this.setZoomAt(z, g.world, t.mid);
  }

  endGesture() {
    const t = [...this.touches.values()];
    const at = t.length ? t[0] : { x: this.cam.width / 2, y: this.cam.height / 2 };
    this.gesture = null;
    this.snapZoom(at);
  }

  setZoomAt(z, world, screen) {
    this.cam.setZoom(z);
    const s = scrollFor(this.cam, world.x, world.y, screen.x, screen.y, z);
    this.cam.scrollX = s.x;
    this.cam.scrollY = s.y;
  }

  // Ease to the nearest whole-pixel zoom level so pixel art stays sharp.
  snapZoom(at) {
    const z = this.cam.zoom;
    let best = ZOOM_STEPS[0];
    for (const s of ZOOM_STEPS) if (Math.abs(Math.log(s / z)) < Math.abs(Math.log(best / z))) best = s;
    this.animateZoom(best, at);
  }

  zoomStep(dir, sx = this.cam.width / 2, sy = this.cam.height / 2) {
    const z = this.zoomTarget ?? this.cam.zoom;
    let k = ZOOM_STEPS.findIndex((s) => s >= z - 1e-6);
    if (k < 0) k = ZOOM_STEPS.length - 1;
    if (dir > 0) k = ZOOM_STEPS[k] > z + 1e-6 ? k : k + 1;
    else k = k - 1;
    k = Phaser.Math.Clamp(k, 0, ZOOM_STEPS.length - 1);
    this.animateZoom(ZOOM_STEPS[k], { x: sx, y: sy });
  }

  animateZoom(target, at) {
    const from = this.cam.zoom;
    const world = screenToWorld(this.cam, at.x, at.y);
    this.zoomTarget = target;
    if (this.zoomTween) this.zoomTween.stop();
    this.zoomTween = this.scene.tweens.addCounter({
      from: 0, to: 1, duration: 160, ease: 'Quad.Out',
      onUpdate: (tw) => {
        const v = tw.getValue();
        this.setZoomAt(from * Math.pow(target / from, v), world, at);
      },
      onComplete: () => {
        this.setZoomAt(target, world, at);
        this.zoomTarget = null;
        this.scene.cameraMoved();
      },
    });
  }
}
