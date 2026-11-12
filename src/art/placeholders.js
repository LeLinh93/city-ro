// Code-drawn stand-in art. Each function returns a Pix following the same
// size rules as the real art described in ASSETS.md.
import { Pix, shade, frac, tileUV, drawBox } from './raster.js';
import { hash2 } from '../rng.js';

const inTile = (u, v) => u >= 0 && u < 1 && v >= 0 && v < 1;

// ---------- ground ----------

// Colours of the code-drawn ground and roads (bright, flat, like the city art).
export const COLORS = {
  grass: [0x7bc657, 0x7bc657], // plain grass (with grassColor's texture on top)
  grassDark: 0x6cb64b,
  grassLight: 0x8bd368,
  grassBlade: 0x5da43f,
  grassRim: 0x62ab45,
  sand: 0xf1dfa4,
  water: 0x45a3e0,
  foam: 0xe4f5fc,
  asphalt: 0x47494e,
  curb: 0xc8ccd1,
  curbLine: 0x8d949b,
  dash: 0xf5f5f0,
  pavement: 0xb4b5b7, // the grey paving around the city buildings
  paveLight: 0xbabbbd,
  paveDark: 0xafb0b2,
  paveJoint: 0xa2a3a6,
};

// Textured grass: the plain colour with specks and little blades of grass, different for every variant.
// Specks and blades never cross a square's edge, so neighbouring squares always fit together.
export function grassColor(px, py, variant) {
  const seed = variant * 131 + 17;
  // a blade of grass in some 6 x 5 cells: three pixels tall, dark at the root, light at the tip
  const cx = Math.floor(px / 6);
  const cy = Math.floor(py / 5);
  if (hash2(cx, cy, seed) < 0.45) {
    const bx = cx * 6 + 1 + Math.floor(hash2(cx, cy, seed + 1) * 4);
    const by = cy * 5 + 3;
    if (px === bx && py <= by && py >= by - 2) return py === by - 2 ? COLORS.grassLight : COLORS.grassBlade;
  }
  const h = hash2(px, py, seed + 2);
  if (h < 0.06) return COLORS.grassDark;
  if (h > 0.95) return COLORS.grassLight;
  return COLORS.grass[0];
}

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
          c = grassColor(px, py, variant);
        } else if (type === 'pavement') {
          // 4 x 4 paving slabs; each square draws the joints on its top two sides only, so they line up
          const su = u * 4;
          const sv = v * 4;
          const slab = hash2(Math.floor(su), Math.floor(sv), variant + 17);
          c = slab < 0.3 ? COLORS.paveDark : slab > 0.75 ? COLORS.paveLight : COLORS.pavement;
          if (frac(su) < 0.045 || frac(sv) < 0.045) c = COLORS.paveJoint;
          else if (h < 0.04) c = COLORS.paveDark;
        } else if (type === 'sand') {
          c = COLORS.sand;
          if (h < 0.07) c = 0xe5d091;
          else if (h > 0.95) c = 0xf8eecb;
        } else {
          c = COLORS.water;
          if (h < 0.1) c = 0x3f9bd8;
          // moving wave dashes
          const wave = hash2(Math.floor((px + f * 4 + py * 2) / 6), py, variant + 99);
          if (py % 4 === 1 && wave < 0.12) c = 0x82c6f0;
        }
        pix.set(f * 128 + px, py, c);
      }
    }
  }
  return pix;
}

// Shore overlays. kind: 'grass' (grass fringe over sand) or 'foam' (foam over water).
// part: side ne/se/sw/nw or corner n/e/s/w. variant: which grass texture.
export function genEdge(kind, part, variant = 0) {
  const pix = new Pix(128, 64);
  const main = kind === 'grass' ? COLORS.grass[variant % 2] : COLORS.foam;
  const rim = kind === 'grass' ? COLORS.grassRim : 0xffffff;
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
      if (dist < t - 0.025) pix.set(px, py, kind === 'grass' ? grassColor(px, py, variant) : main, alpha);
      else if (dist < t) pix.set(px, py, rim, alpha);
      else if (kind === 'foam' && dist < t + 0.05 && hash2(px, py, 5) < 0.25) pix.set(px, py, 0xffffff, 140);
    }
  }
  return pix;
}

// Distance from the shared side or corner into the square (0..1), and the position along that side.
function edgeDist(part, u, v) {
  switch (part) {
    case 'ne': return [v, u];
    case 'se': return [1 - u, v];
    case 'sw': return [1 - v, u];
    case 'nw': return [u, v];
    case 'n': return [Math.hypot(u, v), 0];
    case 'e': return [Math.hypot(1 - u, v), 0];
    case 's': return [Math.hypot(1 - u, 1 - v), 0];
    default: return [Math.hypot(u, 1 - v), 0]; // w
  }
}

// Bands of colour, from the shared edge inwards: [up to this distance, colour, alpha].
const SHORES = {
  // on a water square next to grass: grass lip, earth bank, foam
  bank: { wobble: 0.012, bands: [[0.03, 0x62ab45], [0.075, 0x9a7048], [0.105, 0x7a5636], [0.135, 0xe4f5fc, 220]], spray: true },
  // on a water square next to pavement: stone edge, quay wall, foam
  quay: { wobble: 0, bands: [[0.035, 0xd2d3d5], [0.047, 0x9a9ca0], [0.1, 0x8a8c91], [0.115, 0x6f7176], [0.14, 0xe4f5fc, 210]], spray: true },
  // on a pavement square next to grass or sand: a light kerb
  curb: { wobble: 0, bands: [[0.03, 0xd6d7d9], [0.042, 0x9a9ca0]], spray: false },
};

export const SHORE_KINDS = Object.keys(SHORES);

export function genShore(kind, part) {
  return genShores([[kind, part]]);
}

// All the shore edges of one square in a single picture: parts is a list of [kind, part].
// Each pixel takes its stripes from the nearest edge, so where two edges meet in a corner
// the stripes join up instead of one edge painting over the other.
export function genShores(parts) {
  const pix = new Pix(128, 64);
  for (let py = 0; py < 64; py++) {
    for (let px = 0; px < 128; px++) {
      const [u, v] = tileUV(px, py);
      if (!inTile(u, v)) continue;
      let best = null;
      let bestD = Infinity;
      let spray = false;
      for (const [kind, part] of parts) {
        const S = SHORES[kind];
        const [dist, along] = edgeDist(part, u, v);
        const d = dist - S.wobble * Math.sin(along * Math.PI * 6) - (part.length === 1 ? 0.01 : 0);
        const last = S.bands[S.bands.length - 1][0];
        if (d < last && d < bestD) {
          bestD = d;
          best = S;
        } else if (S.spray && d < last + 0.05) spray = true;
      }
      if (best) {
        const band = best.bands.find((b) => bestD < b[0]);
        pix.set(px, py, band[1], band[2] ?? 255);
      } else if (spray && hash2(px, py, 5) < 0.25) pix.set(px, py, 0xffffff, 140);
    }
  }
  return pix;
}

// ---------- roads ----------

// Asphalt with a light grey curb along the edges and a white dashed centre line.
// A road square is the centre piece plus one "arm" for each neighbouring road.
const CURB = 0.075;

export function genRoadCenter() {
  const pix = new Pix(128, 64);
  const a = CURB;
  for (let py = 0; py < 64; py++) {
    for (let px = 0; px < 128; px++) {
      const [u, v] = tileUV(px, py);
      if (!inTile(u, v)) continue;
      const e = Math.min(u - a, 1 - a - u, v - a, 1 - a - v);
      pix.set(px, py, e >= 0.012 ? COLORS.asphalt : e >= 0 ? COLORS.curbLine : COLORS.curb);
    }
  }
  return pix;
}

export function genRoadArm(side) {
  const pix = new Pix(128, 64);
  const a = CURB;
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
      const dash = Math.abs(across - 0.5) < 0.022 && along >= 0.1 && along < 0.4;
      if (dash) pix.set(px, py, COLORS.dash);
      else if (along >= 0.5 - a - 0.012 && across >= a && across < 1 - a) pix.set(px, py, COLORS.asphalt);
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

// A small flame (fires) and a water drop (fire fighting).
export function genFlame() {
  const pix = new Pix(10, 14);
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 10; x++) {
      const dx = (x + 0.5 - 5) / 5;
      const t = (y + 0.5) / 14; // 0 = tip, 1 = base
      const half = Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62) * (t > 0.8 ? 1 - (t - 0.8) * 1.6 : 1);
      if (Math.abs(dx) > half) continue;
      const inner = Math.abs(dx) < half * 0.5 && t > 0.45;
      pix.set(x, y, inner ? 0xfff27a : t < 0.35 ? 0xf5541c : 0xff9d2b);
    }
  }
  return pix;
}

export function genDrop() {
  const pix = new Pix(3, 4);
  pix.rect(1, 0, 1, 1, 0xbfe8ff);
  pix.rect(0, 1, 3, 2, 0x6cc4f2);
  pix.rect(1, 3, 1, 1, 0x4aa8e0);
  return pix;
}
