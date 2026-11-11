// Tiny pixel rasterizer used to draw placeholder art (works in the browser and in Node).

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.z = null;
  }

  set(x, y, c, a = 255) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const k = (y * this.w + x) * 4;
    if (a >= 255) {
      this.data[k] = (c >> 16) & 255;
      this.data[k + 1] = (c >> 8) & 255;
      this.data[k + 2] = c & 255;
      this.data[k + 3] = 255;
      return;
    }
    // alpha-over blend
    const sa = a / 255;
    const da = this.data[k + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    const mix = (s, d) => (s * sa + d * da * (1 - sa)) / oa;
    this.data[k] = mix((c >> 16) & 255, this.data[k]);
    this.data[k + 1] = mix((c >> 8) & 255, this.data[k + 1]);
    this.data[k + 2] = mix(c & 255, this.data[k + 2]);
    this.data[k + 3] = oa * 255;
  }

  rect(x, y, w, h, c, a = 255) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, a);
  }

  // Copy another Pix into this one at (ox, oy).
  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const k = (y * src.w + x) * 4;
        const a = src.data[k + 3];
        if (!a) continue;
        const c = (src.data[k] << 16) | (src.data[k + 1] << 8) | src.data[k + 2];
        this.set(ox + x, oy + y, c, a);
      }
    }
  }
}

export function shade(c, f) {
  let r = (c >> 16) & 255;
  let g = (c >> 8) & 255;
  let b = c & 255;
  if (f >= 0) {
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  } else {
    r *= 1 + f;
    g *= 1 + f;
    b *= 1 + f;
  }
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export const frac = (v) => v - Math.floor(v);

// Grid position (u, v in 0..1) of a pixel inside a 128 x 64 tile image.
export function tileUV(px, py) {
  const dx = px + 0.5 - 64;
  const dy = py + 0.5;
  return [(dx / 64 + dy / 32) / 2, (dy / 32 - dx / 64) / 2];
}

// Grid position of a pixel for an image whose grid origin (0,0,z=0) sits at (ox, oy).
export function pixelToGrid(px, py, ox, oy) {
  const sx = px + 0.5 - ox;
  const sy = py + 0.5 - oy;
  return [(sx / 64 + sy / 32) / 2, (sy / 32 - sx / 64) / 2];
}

// Draw an isometric box. Grid origin (0,0,0) is at pixel (ox, oy).
// box: { x0, y0, x1, y1, z0, z1, color, pattern?(face, a, b) => color|null, outline? }
// Faces: 'T' top (a = gx, b = gy), 'L' down-left face (a = gx, b = z), 'R' down-right face (a = gy, b = z).
// Uses a depth buffer so boxes can be drawn in any order.
export function drawBox(pix, box, ox, oy) {
  if (!pix.z) pix.z = new Float32Array(pix.w * pix.h).fill(-1e9);
  const { x0, y0, x1, y1, z0, z1, color } = box;
  const top = shade(color, 0.14);
  const left = color;
  const right = shade(color, -0.24);
  const outline = box.outline === false ? null : shade(color, -0.5);
  const minX = Math.floor(ox + (x0 - y1) * 64) - 1;
  const maxX = Math.ceil(ox + (x1 - y0) * 64) + 1;
  const minY = Math.floor(oy + (x0 + y0) * 32 - z1) - 1;
  const maxY = Math.ceil(oy + (x1 + y1) * 32 - z0) + 1;
  for (let py = minY; py <= maxY; py++) {
    if (py < 0 || py >= pix.h) continue;
    for (let px = minX; px <= maxX; px++) {
      if (px < 0 || px >= pix.w) continue;
      const sx = px + 0.5 - ox;
      const sy = py + 0.5 - oy;
      let col = null;
      let depth = 0;
      // top face
      const s2 = sy + z1;
      const tgx = (sx / 64 + s2 / 32) / 2;
      const tgy = (s2 / 32 - sx / 64) / 2;
      if (tgx >= x0 && tgx < x1 && tgy >= y0 && tgy < y1) {
        col = top;
        if (box.pattern) col = box.pattern('T', tgx, tgy) ?? col;
        const e = Math.min(tgx - x0, x1 - tgx, tgy - y0, y1 - tgy);
        if (outline && e < 0.012) col = outline;
        depth = tgx + tgy + z1 / 32;
      } else {
        // down-left face at gy = y1
        const lgx = sx / 64 + y1;
        const lz = (lgx + y1) * 32 - sy;
        if (lgx >= x0 && lgx < x1 && lz >= z0 && lz < z1) {
          col = left;
          if (box.pattern) col = box.pattern('L', lgx, lz) ?? col;
          if (outline && ((lgx - x0) * 64 < 1 || (z1 - lz) < 1)) col = outline;
          depth = lgx + y1 + lz / 32;
        } else {
          // down-right face at gx = x1
          const rgy = x1 - sx / 64;
          const rz = (x1 + rgy) * 32 - sy;
          if (rgy >= y0 && rgy < y1 && rz >= z0 && rz < z1) {
            col = right;
            if (box.pattern) {
              const p = box.pattern('R', rgy, rz);
              if (p != null) col = shade(p, -0.18);
            }
            if (outline && ((rgy - y0) * 64 < 1 || (z1 - rz) < 1)) col = outline;
            depth = x1 + rgy + rz / 32;
          }
        }
      }
      if (col == null) continue;
      const zi = py * pix.w + px;
      if (depth < pix.z[zi]) continue;
      pix.z[zi] = depth;
      pix.set(px, py, col);
    }
  }
}

// Minimal PNG encoder for Node scripts (icons). Needs zlib.deflateSync.
export function encodePNG(pix, deflateSync) {
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, data.length);
    const td = new Uint8Array(4 + data.length);
    td.set([...type].map((ch) => ch.charCodeAt(0)), 0);
    td.set(data, 4);
    const c = new Uint8Array(4);
    new DataView(c.buffer).setUint32(0, crc(td));
    return [len, td, c];
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, pix.w);
  dv.setUint32(4, pix.h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array((pix.w * 4 + 1) * pix.h);
  for (let y = 0; y < pix.h; y++) {
    raw[y * (pix.w * 4 + 1)] = 0;
    raw.set(pix.data.subarray(y * pix.w * 4, (y + 1) * pix.w * 4), y * (pix.w * 4 + 1) + 1);
  }
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', new Uint8Array(deflateSync(raw))),
    ...chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
