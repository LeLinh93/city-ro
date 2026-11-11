import { HW, HH, SIDES } from './constants.js';

// Continuous grid coordinates: square (i, j) covers [i, i+1) x [j, j+1),
// so its centre is (i + 0.5, j + 0.5). The point (0, 0) is the top corner of square (0, 0).
export function toWorld(fx, fy) {
  return { x: (fx - fy) * HW, y: (fx + fy) * HH };
}

export function toGrid(x, y) {
  return { fx: (x / HW + y / HH) / 2, fy: (y / HH - x / HW) / 2 };
}

// Phaser cameras zoom around their centre (origin 0.5).
export function screenToWorld(cam, sx, sy) {
  const z = cam.zoom;
  return {
    x: cam.scrollX + cam.width / 2 + (sx - cam.width / 2) / z,
    y: cam.scrollY + cam.height / 2 + (sy - cam.height / 2) / z,
  };
}

// Scroll values that put world point (wx, wy) under screen point (sx, sy) at zoom z.
export function scrollFor(cam, wx, wy, sx, sy, z) {
  return {
    x: wx - cam.width / 2 - (sx - cam.width / 2) / z,
    y: wy - cam.height / 2 - (sy - cam.height / 2) / z,
  };
}

export function viewRect(cam) {
  const z = cam.zoom;
  const w = cam.width / z;
  const h = cam.height / z;
  return { x: cam.scrollX + cam.width / 2 - w / 2, y: cam.scrollY + cam.height / 2 - h / 2, w, h };
}

export function sideFromDir(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'se' : 'nw';
  return dy >= 0 ? 'sw' : 'ne';
}

// Sprites are drawn facing down-right (row 0) and up-right (row 1);
// the other two directions are mirrored.
export function facingFor(dx, dy) {
  const side = sideFromDir(dx, dy);
  switch (side) {
    case 'se': return { row: 0, flip: false };
    case 'sw': return { row: 0, flip: true };
    case 'ne': return { row: 1, flip: false };
    default: return { row: 1, flip: true }; // nw
  }
}

export function sideDelta(side) {
  return SIDES[side];
}
