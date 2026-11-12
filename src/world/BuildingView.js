import { DEPTH, HW } from '../constants.js';
import { toWorld } from '../iso.js';
import { ruinTexture } from '../art/ruin.js';

// Which texture to use and whether to mirror it. Turning a building mirrors its picture.
// A ruined building uses a ruined copy of its picture.
export function buildingTexture(scene, def, rot, which = 'image', ruined = false) {
  const key = def[which];
  if (!key) return null;
  return { key: ruined ? ruinTexture(scene, key, def) : key, flip: !!rot };
}

// Screen placement of a footprint: the image's bottom edge touches the
// footprint's bottom corner, and its left edge touches the footprint's left corner.
export function footprintPlacement(x, y, w, d) {
  const tip = toWorld(x + w, y + d);
  return { tipX: tip.x, tipY: tip.y, left: tip.x - w * HW, width: (w + d) * HW };
}

// Front-most square in each 64 px column of the footprint decides that column's draw order.
// (def.solid: optional list of rectangles that stand up; default the whole footprint.)
function columnDepths(b, place) {
  const rects = (b.def.solid || [{ x: 0, y: 0, w: b.def.w, d: b.def.d }]).map((s) => (b.rot
    ? { x: b.x + s.y, y: b.y + s.x, w: s.d, d: s.w }
    : { x: b.x + s.x, y: b.y + s.y, w: s.w, d: s.d }));
  const n = b.w + b.d;
  const out = [];
  for (let c = 0; c < n; c++) {
    const c0 = place.left + c * HW;
    const c1 = c0 + HW;
    let best = null;
    for (const rect of rects) for (let j = rect.y; j < rect.y + rect.d; j++) {
      for (let i = rect.x; i < rect.x + rect.w; i++) {
        const t0 = (i - j - 1) * HW;
        const t1 = (i - j + 1) * HW;
        if (t0 < c1 && t1 > c0) {
          const sum = i + j + 1;
          if (best === null || sum > best) best = sum;
        }
      }
    }
    out.push(best === null ? null : best + 0.49);
  }
  return out;
}

export class BuildingView {
  constructor(scene, b, animate) {
    this.scene = scene;
    this.b = b;
    this.parts = [];
    const def = b.def;
    const place = footprintPlacement(b.x, b.y, b.w, b.d);
    this.place = place;

    const baseTex = buildingTexture(scene, def, b.rot, 'base', b.ruined);
    if (baseTex) {
      const tex = scene.textures.get(baseTex.key);
      const scale = place.width / tex.source[0].width;
      const im = scene.add.image(place.tipX, place.tipY, baseTex.key, '__BASE')
        .setOrigin(b.w / (b.w + b.d), 1).setFlipX(baseTex.flip).setScale(scale).setDepth(DEPTH.BASE);
      this.parts.push(im);
    }

    const main = buildingTexture(scene, def, b.rot, 'image', b.ruined);
    const tex = scene.textures.get(main.key);
    const srcW = tex.source[0].width;
    const srcH = tex.source[0].height;
    const n = b.w + b.d;
    const colW = srcW / n;
    const scale = place.width / srcW;
    if (Math.abs(scale - 1) > 0.001 && !BuildingView.warned?.[main.key]) {
      (BuildingView.warned ||= {})[main.key] = true;
      console.warn(`${main.key}.png should be ${place.width}px wide (it is ${srcW}px); scaling it.`);
    }
    const depths = columnDepths(b, place);
    for (let c = 0; c < n; c++) {
      if (depths[c] === null) continue;
      const srcCol = main.flip ? n - 1 - c : c;
      const frame = `col${n}_${srcCol}`;
      if (!tex.has(frame)) tex.add(frame, 0, Math.round(srcCol * colW), 0, Math.round(colW), srcH);
      const im = scene.add.image(place.left + c * HW, place.tipY, main.key, frame)
        .setOrigin(0, 1).setFlipX(main.flip).setScale(scale).setDepth(depths[c]);
      this.parts.push(im);
    }

    if (animate) {
      this.parts.forEach((im, k) => {
        const sy = im.scaleY;
        im.scaleY = 0;
        scene.tweens.add({ targets: im, scaleY: sy, duration: 420, delay: k * 12, ease: 'Back.Out' });
      });
    }
  }

  // If world point (wx, wy) touches a non-transparent pixel of this building, return its depth.
  hit(wx, wy, alphaAt) {
    let best = null;
    for (const im of this.parts) {
      if (!im.active || im.depth < 0) continue;
      const s = im.scaleX;
      const fw = im.frame.cutWidth;
      const fh = im.frame.cutHeight;
      const left = im.x - im.originX * fw * s;
      const top = im.y - im.originY * fh * s;
      let lx = Math.floor((wx - left) / s);
      const ly = Math.floor((wy - top) / s);
      if (lx < 0 || ly < 0 || lx >= fw || ly >= fh) continue;
      if (im.flipX) lx = fw - 1 - lx;
      if (alphaAt(im.texture.key, im.frame.cutX + lx, im.frame.cutY + ly) > 40 && (best === null || im.depth > best)) best = im.depth;
    }
    return best;
  }

  // World position of a pixel of the building's picture (pictures of turned buildings are mirrored).
  picturePoint(px, py) {
    const def = this.b.def;
    const tex = this.scene.textures.get(def.base || def.image).source[0];
    const scale = this.place.width / tex.width;
    return {
      x: this.place.left + (this.b.rot ? tex.width - px : px) * scale,
      y: this.place.tipY - tex.height * scale + py * scale,
    };
  }

  // World position of a building-local point (squares) at height z (px).
  localToWorld(lx, ly, z = 0) {
    const b = this.b;
    const p = b.rot ? toWorld(b.x + ly, b.y + lx) : toWorld(b.x + lx, b.y + ly);
    return { x: p.x, y: p.y - z };
  }

  destroy(animate) {
    if (!animate) {
      this.parts.forEach((p) => p.destroy());
      return;
    }
    this.parts.forEach((im) => {
      this.scene.tweens.add({
        targets: im, scaleY: 0, alpha: 0, duration: 260, ease: 'Quad.In',
        onComplete: () => im.destroy(),
      });
    });
  }
}

// Semi-transparent preview that follows your finger while placing.
export class Ghost {
  constructor(scene) {
    this.scene = scene;
    this.base = scene.add.image(0, 0, '__DEFAULT').setVisible(false).setDepth(DEPTH.GHOST).setAlpha(0.75);
    this.main = scene.add.image(0, 0, '__DEFAULT').setVisible(false).setDepth(DEPTH.GHOST + 1).setAlpha(0.75);
    this.outline = scene.add.graphics().setDepth(DEPTH.OUTLINE);
  }

  show(type, def, x, y, rot, w, d, ok) {
    const place = footprintPlacement(x, y, w, d);
    const tint = ok ? 0xb8ffb8 : 0xff7070;
    const set = (im, which) => {
      const t = buildingTexture(this.scene, def, rot, which);
      if (!t) {
        im.setVisible(false);
        return;
      }
      const src = this.scene.textures.get(t.key).source[0];
      im.setTexture(t.key, '__BASE').setVisible(true).setFlipX(t.flip).setOrigin(w / (w + d), 1)
        .setScale(place.width / src.width).setPosition(place.tipX, place.tipY).setTint(tint);
    };
    set(this.base, 'base');
    set(this.main, 'image');
    this.drawOutline(x, y, w, d, ok);
  }

  // Is world point (wx, wy) on the waiting building's picture?
  hit(wx, wy, alphaAt) {
    for (const im of [this.main, this.base]) {
      if (!im.visible) continue;
      const s = im.scaleX;
      const fw = im.frame.cutWidth;
      const fh = im.frame.cutHeight;
      let lx = Math.floor((wx - (im.x - im.originX * fw * s)) / s);
      const ly = Math.floor((wy - (im.y - im.originY * fh * s)) / s);
      if (lx < 0 || ly < 0 || lx >= fw || ly >= fh) continue;
      if (im.flipX) lx = fw - 1 - lx;
      if (alphaAt(im.texture.key, lx, ly) > 40) return true;
    }
    return false;
  }

  showSquares(squares, ok) {
    this.base.setVisible(false);
    this.main.setVisible(false);
    this.outline.clear();
    for (const [i, j] of squares) this.diamond(i, j, 1, 1, ok);
  }

  drawOutline(x, y, w, d, ok) {
    this.outline.clear();
    this.diamond(x, y, w, d, ok);
  }

  diamond(x, y, w, d, ok) {
    const g = this.outline;
    const p = [toWorld(x, y), toWorld(x + w, y), toWorld(x + w, y + d), toWorld(x, y + d)];
    g.fillStyle(ok ? 0x6dff6d : 0xff4d4d, 0.28);
    g.lineStyle(2, ok ? 0x6dff6d : 0xff4d4d, 0.9);
    g.beginPath();
    g.moveTo(p[0].x, p[0].y);
    for (let k = 1; k < 4; k++) g.lineTo(p[k].x, p[k].y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  hide() {
    this.base.setVisible(false);
    this.main.setVisible(false);
    this.outline.clear();
  }
}
