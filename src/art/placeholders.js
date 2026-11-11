// Code-drawn stand-in art. Each function returns a Pix following the same
// size rules as the real art described in ASSETS.md.
import { Pix, shade, frac, tileUV, pixelToGrid, drawBox } from './raster.js';
import { hash2 } from '../rng.js';

const inTile = (u, v) => u >= 0 && u < 1 && v >= 0 && v < 1;

// ---------- ground ----------

export function genGround(type, variant, frames = 1) {
  const pix = new Pix(128 * frames, 64);
  for (let f = 0; f < frames; f++) {
    for (let py = 0; py < 64; py++) {
      for (let px = 0; px < 128; px++) {
        const [u, v] = tileUV(px, py);
        if (!inTile(u, v)) continue;
        const h = hash2(px, py, variant * 31 + 7);
        let c;
        if (type === 'grass') {
          c = 0x5d9e4b;
          if (h < 0.09) c = 0x4f8a40;
          else if (h > 0.94) c = 0x72b25a;
          if (h > 0.9985) c = variant % 2 ? 0xf4e36b : 0xf2f2f2;
        } else if (type === 'sand') {
          c = 0xe2cf96;
          if (h < 0.1) c = 0xd4be82;
          else if (h > 0.93) c = 0xefe2b4;
        } else {
          c = 0x2f6fb8;
          if (h < 0.12) c = 0x2b66aa;
          // moving wave dashes
          const wave = hash2(Math.floor((px + f * 4 + py * 2) / 6), py, variant + 99);
          if (py % 4 === 1 && wave < 0.12) c = 0x5e98d6;
        }
        pix.set(f * 128 + px, py, c);
      }
    }
  }
  return pix;
}

// Shore overlays. kind: 'grass' (grass fringe over sand) or 'foam' (foam over water).
// part: side ne/se/sw/nw or corner n/e/s/w.
export function genEdge(kind, part) {
  const pix = new Pix(128, 64);
  const main = kind === 'grass' ? 0x5d9e4b : 0xd5ecf4;
  const rim = kind === 'grass' ? 0x467f37 : 0xffffff;
  const alpha = kind === 'grass' ? 255 : 200;
  for (let py = 0; py < 64; py++) {
    for (let px = 0; px < 128; px++) {
      const [u, v] = tileUV(px, py);
      if (!inTile(u, v)) continue;
      let dist; // distance into the tile from the shared edge / corner
      let along;
      switch (part) {
        case 'ne': dist = v; along = u; break;
        case 'se': dist = 1 - u; along = v; break;
        case 'sw': dist = 1 - v; along = u; break;
        case 'nw': dist = u; along = v; break;
        case 'n': dist = Math.hypot(u, v); along = 0; break;
        case 'e': dist = Math.hypot(1 - u, v); along = 0; break;
        case 's': dist = Math.hypot(1 - u, 1 - v); along = 0; break;
        default: dist = Math.hypot(u, 1 - v); along = 0; break; // w
      }
      const t = 0.12 + 0.03 * Math.sin(along * Math.PI * 6) + (part.length === 1 ? 0.02 : 0);
      if (dist < t - 0.025) pix.set(px, py, main, alpha);
      else if (dist < t) pix.set(px, py, rim, alpha);
      else if (kind === 'foam' && dist < t + 0.05 && hash2(px, py, 5) < 0.25) pix.set(px, py, 0xffffff, 140);
    }
  }
  return pix;
}

// ---------- roads ----------

const SIDEWALK = 0.13;
const ASPHALT = 0x45484e;

export function genRoadCenter() {
  const pix = new Pix(128, 64);
  const a = SIDEWALK;
  for (let py = 0; py < 64; py++) {
    for (let px = 0; px < 128; px++) {
      const [u, v] = tileUV(px, py);
      if (!inTile(u, v)) continue;
      const inner = u >= a && u < 1 - a && v >= a && v < 1 - a;
      let c;
      if (inner) {
        c = hash2(px, py, 3) < 0.08 ? 0x4c5056 : ASPHALT;
        const e = Math.min(u - a, 1 - a - u, v - a, 1 - a - v);
        if (e < 0.012) c = 0x8d877c; // curb
      } else {
        c = 0xbab5aa;
        if (frac(u * 8) < 0.04 || frac(v * 8) < 0.04) c = 0xa8a397;
      }
      pix.set(px, py, c);
    }
  }
  return pix;
}

export function genRoadArm(side) {
  const pix = new Pix(128, 64);
  const a = SIDEWALK;
  for (let py = 0; py < 64; py++) {
    for (let px = 0; px < 128; px++) {
      const [u, v] = tileUV(px, py);
      if (!inTile(u, v)) continue;
      // along = distance from the centre towards the side (0..0.5), across = position across the road
      let along;
      let across;
      switch (side) {
        case 'ne': along = 0.5 - v; across = u; break;
        case 'se': along = u - 0.5; across = v; break;
        case 'sw': along = v - 0.5; across = u; break;
        default: along = 0.5 - u; across = v; break; // nw
      }
      if (along < 0) continue;
      const inArm = along >= 0.5 - a && across >= a && across < 1 - a;
      const onLine = Math.abs(across - 0.5) < 0.016 && frac((side === 'ne' || side === 'sw' ? v : u) * 4) < 0.5;
      if (onLine && along > 0.04) pix.set(px, py, 0xf0eee0);
      else if (inArm) pix.set(px, py, hash2(px, py, 3) < 0.08 ? 0x4c5056 : ASPHALT);
    }
  }
  return pix;
}

// ---------- trees ----------

export function genTree(variant) {
  const w = 96;
  const h = 128;
  const pix = new Pix(w, h);
  const cx = w / 2;
  // shadow
  for (let y = h - 12; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / 24;
      const dy = (y + 0.5 - (h - 6)) / 6;
      if (dx * dx + dy * dy < 1) pix.set(x, y, 0x1d3a1a, 70);
    }
  }
  const kind = variant % 4;
  const trunkH = kind === 3 ? 10 : 22;
  pix.rect(cx - 3, h - 6 - trunkH, 6, trunkH, 0x6b4a2f);
  pix.rect(cx + 1, h - 6 - trunkH, 2, trunkH, 0x553a24);
  const greens = [
    [0x3f8a3a, 0x5aa84a, 0x2f6b2c],
    [0x4a9640, 0x6cbc55, 0x356f2e],
    [0x2f6e44, 0x45905a, 0x234f32],
    [0x5c9c3e, 0x7cbf58, 0x44782e],
  ][kind];
  const blob = (bx, by, r) => {
    for (let y = Math.floor(by - r); y <= by + r; y++) {
      for (let x = Math.floor(bx - r); x <= bx + r; x++) {
        const dx = x + 0.5 - bx;
        const dy = y + 0.5 - by;
        const d = Math.hypot(dx, dy) / r;
        if (d > 1) continue;
        const light = (-dx - dy) / r; // light from top-left
        let c = greens[0];
        if (light > 0.35) c = greens[1];
        else if (light < -0.45) c = greens[2];
        if (hash2(x, y, variant) < 0.08) c = light > 0 ? greens[1] : greens[2];
        pix.set(x, y, c);
      }
    }
  };
  if (kind === 2) {
    // pine: stacked layers
    for (let layer = 0; layer < 4; layer++) {
      const top = h - 6 - trunkH - 70 + layer * 16;
      const half = 10 + layer * 6;
      for (let y = top; y < top + 22; y++) {
        const t = (y - top) / 22;
        const hw = half * t + 2;
        for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
          const side = (x - cx) / hw;
          let c = side < -0.2 ? greens[1] : side > 0.45 ? greens[2] : greens[0];
          if (hash2(x, y, 9) < 0.06) c = greens[2];
          pix.set(x, y, c);
        }
      }
    }
  } else if (kind === 3) {
    blob(cx, h - 26, 16);
    blob(cx - 8, h - 32, 10);
  } else {
    const top = h - 6 - trunkH;
    blob(cx, top - 18, 22);
    blob(cx - 14, top - 8, 14);
    blob(cx + 14, top - 6, 14);
    blob(cx - 4, top - 34, 15);
  }
  return pix;
}

// ---------- buildings ----------

function windowPattern(box, marks) {
  const w = box.windows;
  return (face, a, b) => {
    for (const m of marks) {
      if (m.face === face && m.box === box && a >= m.a0 && a < m.a1 && b >= m.z0 && b < m.z1) return m.color(a, b);
    }
    if (face === 'T') return null;
    if (box.stripe && b >= box.stripe.z0 && b < box.stripe.z1) return box.stripe.color;
    if (!w) return null;
    const rel = b - box.z0 - w.start;
    if (rel < 0 || b > box.z1 - 5) return null;
    if (rel % w.floor >= w.h) return null;
    const fa = frac(a * w.per);
    if (fa < 0.28 || fa > 0.72) return null;
    const lit = hash2(Math.floor(a * w.per), Math.floor(rel / w.floor), face === 'L' ? 1 : 2) < (w.lit ?? 0.15);
    return lit ? 0xffe39a : (w.color ?? 0x5d8fb8);
  };
}

function doorMarks(def, body) {
  const marks = [];
  const add = (spot, wide, height, color) => {
    if (!spot) return;
    const lo = wide ? 0.15 : 0.36;
    const hi = wide ? 0.85 : 0.64;
    if (spot.side === 'sw') marks.push({ face: 'L', box: body, a0: spot.x + lo, a1: spot.x + hi, z0: 0, z1: height, color });
    if (spot.side === 'se') marks.push({ face: 'R', box: body, a0: spot.y + lo, a1: spot.y + hi, z0: 0, z1: height, color });
  };
  add(def.door, false, 20, () => 0x5a3a26);
  add(def.garage, true, 28, (a, z) => (Math.floor(z) % 5 === 0 ? 0x3c424a : 0x6a727c));
  return marks;
}

// Image layout shared by the game and the placeholder art.
export function buildingImageLayout(w, d, topPad) {
  return { width: (w + d) * 64, height: (w + d) * 32 + topPad, ox: d * 64, oy: topPad };
}

export function genBuilding(def) {
  const boxes = def.placeholder.boxes;
  const topPad = Math.max(...boxes.map((b) => b.z1)) + 8;
  const L = buildingImageLayout(def.w, def.d, topPad);
  const pix = new Pix(L.width, L.height);
  const body = boxes[0];
  const marks = doorMarks(def, body);
  for (const b of boxes) drawBox(pix, { ...b, pattern: windowPattern(b, marks) }, L.ox, L.oy);
  return pix;
}

// Flat ground image for the airport (runway, taxiway, apron).
export function genAirportBase(def) {
  const A = def.airport;
  const L = buildingImageLayout(def.w, def.d, 0);
  const pix = new Pix(L.width, L.height);
  for (let py = 0; py < L.height; py++) {
    for (let px = 0; px < L.width; px++) {
      const [x, y] = pixelToGrid(px, py, L.ox, L.oy);
      if (x < 0 || y < 0 || x >= def.w || y >= def.d) continue;
      const h = hash2(px, py, 77);
      let c = h < 0.1 ? 0x4f8a40 : 0x5d9e4b; // grass
      const s = def.solid;
      if (y >= A.runway.y0 && y < A.runway.y1) {
        c = h < 0.06 ? 0x44474d : 0x3c3f45;
        if (Math.abs(y - A.runway.centerY) < 0.025 && frac(x * 1.25) < 0.5) c = 0xf4f4f4;
        if (y - A.runway.y0 < 0.06 || A.runway.y1 - y < 0.06) c = 0xf4f4f4;
        if ((x < 0.45 || x > def.w - 0.45) && frac(y * 7) < 0.45 && Math.abs(y - A.runway.centerY) < 0.8) c = 0xf4f4f4;
      } else if (y >= A.taxiway.y0 && y < A.taxiway.y1) {
        c = 0x4a4d52;
        if (Math.abs(y - A.taxiway.centerY) < 0.025) c = 0xf2c230;
      } else if (y >= A.taxiway.y1 && y < A.runway.y0 && A.connectors.some((k) => x >= k.x0 && x < k.x1)) {
        c = 0x4a4d52;
        const k = A.connectors.find((k) => x >= k.x0 && x < k.x1);
        if (Math.abs(x - (k.x0 + k.x1) / 2) < 0.025) c = 0xf2c230;
      } else if (x >= A.apron.x0 && x < A.apron.x1 && y >= A.apron.y0 && y < A.apron.y1) {
        c = 0xa9adb3;
        if (frac(x * 2) < 0.012 || frac(y * 2) < 0.012) c = 0x979ba1;
        for (const sp of A.spots) {
          if (Math.abs(x - sp.x) < 0.02 && y > A.apron.y0 + 0.4) c = 0xf2c230;
          if (Math.abs(y - (A.apron.y0 + 0.4)) < 0.025 && Math.abs(x - sp.x) < 0.35) c = 0xf2c230;
        }
      } else if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.d) {
        c = 0x8f949a;
      }
      pix.set(px, py, c);
    }
  }
  return pix;
}

// ---------- people ----------

const PEOPLE = [
  { shirt: 0xd8443a, pants: 0x2f3a56, skin: 0xf0c8a0, hair: 0x4a2e1e },
  { shirt: 0x3a7bd8, pants: 0x3a3a3a, skin: 0xc68a5e, hair: 0x1e1410 },
  { shirt: 0xf0c040, pants: 0x4a5a7a, skin: 0xf3d2b3, hair: 0xd8b04a },
  { shirt: 0x3faa5a, pants: 0x5a4030, skin: 0x8d5a3a, hair: 0x1a1a1a },
  { shirt: 0xb05ad8, pants: 0x2a2a3a, skin: 0xf0c8a0, hair: 0xa04a2a },
];

export function genPerson(variant) {
  const P = PEOPLE[variant % PEOPLE.length];
  const fw = 32;
  const fh = 48;
  const pix = new Pix(fw * 4, fh * 2);
  for (let row = 0; row < 2; row++) {
    for (let f = 0; f < 4; f++) {
      const ox = f * fw + 16;
      const oy = row * fh;
      const step = f === 1 ? 1 : f === 3 ? -1 : 0;
      // legs (feet on the bottom row)
      pix.rect(ox - 3, oy + 40 + (step > 0 ? -1 : 0), 2, 8 - (step > 0 ? 1 : 0), P.pants);
      pix.rect(ox + 1, oy + 40 + (step < 0 ? -1 : 0), 2, 8 - (step < 0 ? 1 : 0), P.pants);
      // body
      pix.rect(ox - 4, oy + 31, 8, 10, P.shirt);
      pix.rect(ox + 2, oy + 31, 2, 10, shade(P.shirt, -0.25));
      // arms
      pix.rect(ox - 6, oy + 32 + step, 2, 7, P.shirt);
      pix.rect(ox + 4, oy + 32 - step, 2, 7, shade(P.shirt, -0.25));
      pix.set(ox - 6, oy + 39 + step, P.skin);
      pix.set(ox + 5, oy + 39 - step, P.skin);
      // head
      pix.rect(ox - 3, oy + 24, 7, 7, P.skin);
      pix.rect(ox - 3, oy + 23, 7, 2, P.hair);
      if (row === 0) {
        pix.set(ox - 1, oy + 27, 0x222222);
        pix.set(ox + 2, oy + 27, 0x222222);
      } else {
        pix.rect(ox - 3, oy + 25, 7, 4, P.hair); // back of the head
      }
    }
  }
  return pix;
}

// ---------- vehicles ----------

// Boxes are given in a "heading frame": a = along the vehicle (front is +a), c = across.
function headingBoxes(row, list) {
  return list.map((b) => {
    // row 0 faces down-right (+gx); row 1 faces up-right (-gy).
    if (row === 0) return { ...b, x0: b.a0, x1: b.a1, y0: b.c0, y1: b.c1 };
    return { ...b, x0: b.c0, x1: b.c1, y0: -b.a1, y1: -b.a0 };
  });
}

const CAR_COLORS = [0xd8443a, 0x3a7bd8, 0xf0c040, 0x3faa5a];

export function genCar(variant, police = false) {
  const fw = 64;
  const fh = 48;
  const frames = police ? 2 : 1;
  const pix = new Pix(fw * frames, fh * 2);
  const body = police ? 0xf2f2f2 : CAR_COLORS[variant % CAR_COLORS.length];
  for (let row = 0; row < 2; row++) {
    for (let f = 0; f < frames; f++) {
      const sub = new Pix(fw, fh);
      const lights = (face, a, z) => {
        // front lights / tail lights on the end faces
        const frontFace = row === 0 ? 'R' : null;
        const backFace = row === 1 ? 'L' : null;
        const across = row === 0 ? a : a; // gy for R, gx for L
        if (z >= 4 && z < 7 && Math.abs(Math.abs(across) - 0.07) < 0.025) {
          if (face === frontFace) return 0xfff2a0;
          if (face === backFace) return 0xe03030;
        }
        if (police && z < 6 && face !== 'T') return 0x223355;
        return null;
      };
      const list = [
        { a0: -0.21, a1: 0.21, c0: -0.1, c1: 0.1, z0: 2, z1: 10, color: body, pattern: lights },
        { a0: -0.12, a1: 0.07, c0: -0.085, c1: 0.085, z0: 10, z1: 17, color: 0x9fd0ec },
        { a0: -0.1, a1: 0.05, c0: -0.08, c1: 0.08, z0: 17, z1: 18, color: body },
      ];
      if (police) {
        const red = 0xe02828;
        const blue = 0x2850e0;
        list.push({
          a0: -0.04, a1: 0.03, c0: -0.07, c1: 0.07, z0: 18, z1: 21, color: red,
          pattern: (face, a, b) => {
            const c = row === 0 ? (face === 'T' ? b : a) : (face === 'T' ? a : a);
            const left = c < 0;
            return (left !== (f === 1)) ? red : blue;
          },
        });
      }
      for (const b of headingBoxes(row, list)) drawBox(sub, b, 32, 36);
      // wheels
      pix.blit(sub, f * fw, row * fh);
    }
  }
  return pix;
}

const PLANE_COLORS = [
  { body: 0xf4f6f8, tail: 0xd8443a },
  { body: 0xf4f6f8, tail: 0x3a7bd8 },
];

export function genPlane(variant) {
  const fw = 384;
  const fh = 256;
  const C = PLANE_COLORS[variant % PLANE_COLORS.length];
  const pix = new Pix(fw, fh * 2);
  for (let row = 0; row < 2; row++) {
    const sub = new Pix(fw, fh);
    const windows = (face, a, z) => {
      if (face === 'T') return null;
      // passenger windows along the side
      const along = row === 0 ? (face === 'L' ? a : null) : (face === 'R' ? -a : null);
      if (along != null && z >= 26 && z < 30 && frac(along * 9) < 0.45 && along > -0.9 && along < 1.0) return 0x3a5a8a;
      return null;
    };
    const list = [
      { a0: -1.3, a1: 1.3, c0: -0.16, c1: 0.16, z0: 12, z1: 36, color: C.body, pattern: windows },
      { a0: 1.3, a1: 1.5, c0: -0.11, c1: 0.11, z0: 16, z1: 32, color: C.body },
      { a0: 1.3, a1: 1.42, c0: -0.1, c1: 0.1, z0: 28, z1: 32, color: 0x2a3a5a },
      { a0: -0.15, a1: 0.35, c0: -1.1, c1: -0.16, z0: 18, z1: 23, color: shade(C.body, -0.06) },
      { a0: -0.15, a1: 0.35, c0: 0.16, c1: 1.1, z0: 18, z1: 23, color: shade(C.body, -0.06) },
      { a0: -0.05, a1: 0.3, c0: -0.65, c1: -0.45, z0: 8, z1: 18, color: 0xa0a6ae },
      { a0: -0.05, a1: 0.3, c0: 0.45, c1: 0.65, z0: 8, z1: 18, color: 0xa0a6ae },
      { a0: -1.3, a1: -0.95, c0: -0.03, c1: 0.03, z0: 36, z1: 72, color: C.tail },
      { a0: -1.3, a1: -1.05, c0: -0.45, c1: 0.45, z0: 34, z1: 38, color: shade(C.body, -0.06) },
      { a0: 0.6, a1: 0.66, c0: -0.03, c1: 0.03, z0: 0, z1: 12, color: 0x333333 },
      { a0: -0.2, a1: -0.14, c0: -0.25, c1: 0.25, z0: 0, z1: 12, color: 0x333333 },
    ];
    for (const b of headingBoxes(row, list)) drawBox(sub, b, 192, 192);
    pix.blit(sub, 0, row * fh);
  }
  return pix;
}

// ---------- effects ----------

export function genPuff() {
  const pix = new Pix(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const d = Math.hypot(x + 0.5 - 5, y + 0.5 - 5);
      if (d < 4.6) pix.set(x, y, d < 2.5 ? 0xf2f2f2 : 0xd0d0d0);
    }
  }
  return pix;
}

export function genDust() {
  const pix = new Pix(8, 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x + 0.5 - 4, y + 0.5 - 4);
      if (d < 3.6) pix.set(x, y, d < 2 ? 0xd9c49a : 0xb9a47a);
    }
  }
  return pix;
}

export function genShadow(w = 200, h = 70) {
  const pix = new Pix(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2);
      const dy = (y + 0.5 - h / 2) / (h / 2);
      if (dx * dx + dy * dy < 1) pix.set(x, y, 0x000000, 255);
    }
  }
  return pix;
}
