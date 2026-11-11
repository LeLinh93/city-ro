// Draws the app icons into public/icons/ (replace them with your own art any time).
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Pix, drawBox, encodePNG } from '../src/art/raster.js';

function icon(size) {
  // draw at 256 and scale with nearest neighbour for crisp pixels
  const base = new Pix(256, 256);
  base.rect(0, 0, 256, 256, 0x7cc6f2);
  base.rect(0, 150, 256, 106, 0x2f6fb8);
  const ox = 128;
  const oy = 70;
  const s = 1.25; // grid scale inside the icon
  const box = (x0, y0, x1, y1, z0, z1, color) =>
    drawBox(base, { x0: x0 * s, y0: y0 * s, x1: x1 * s, y1: y1 * s, z0, z1, color }, ox, oy);
  box(0, 0, 1.6, 1.6, 0, 8, 0x5d9e4b);
  box(0.2, 0.25, 0.75, 0.8, 8, 60, 0xe8d8b0);
  box(0.15, 0.2, 0.8, 0.85, 60, 68, 0xc0503a);
  box(0.95, 0.2, 1.4, 0.65, 8, 110, 0x6a8fb0);
  box(0.95, 0.95, 1.35, 1.35, 8, 40, 0x3f8a3a);
  const out = new Pix(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x * 256) / size);
      const sy = Math.floor((y * 256) / size);
      const k = (sy * 256 + sx) * 4;
      out.set(x, y, (base.data[k] << 16) | (base.data[k + 1] << 8) | base.data[k + 2]);
    }
  }
  return out;
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) {
  writeFileSync(`public/icons/${name}.png`, encodePNG(icon(size), deflateSync));
  console.log(`public/icons/${name}.png`);
}
