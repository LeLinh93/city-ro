// Code-drawn art for the space theme (src/themes/space.js): moon rock, lava, white pavement, neon roads and
// people in astronaut helmets. Same sizes and frame layouts as the city's art in placeholders.js.
import { Pix, shade, frac, tileUV } from './raster.js';
import { hash2 } from '../rng.js';
import { genPerson } from './placeholders.js';

// Ground squares reach about a pixel past their edges, so no gap is left between them for the stars to show through.
const BLEED = 0.02;
const inTile = (u, v) => u >= -BLEED && u < 1 + BLEED && v >= -BLEED && v < 1 + BLEED;
const inSquare = (u, v) => u >= 0 && u < 1 && v >= 0 && v < 1;

export const SPACE_COLORS = {
  rock: 0x7f7f7e, // the moon rock in the space buildings' pictures
  rockDark: 0x707070,
  rockLight: 0x8e8e8d,
  crater: 0x6a6a6a,
  craterRim: 0x9a9a99,
  lava: 0xe2541c,
  lavaDark: 0x8a2410,
  lavaCrust: 0x4a1a10,
  lavaHot: 0xffb43a,
  lavaWhite: 0xffe39a,
  pave: 0xe3e6ea, // white paving, like the plots of the space buildings
  paveLight: 0xedf0f3,
  paveDark: 0xd6dade,
  paveJoint: 0xbfc4cb,
  asphalt: 0x2a2e38,
  curb: 0x8c94a3,
  curbLine: 0x5b6271,
  neon: 0x4fd8ff,
  neonCore: 0xd8f8ff,
};

// Moon rock: grey with specks and small craters. Craters stay inside the square, so squares always fit together.
export function genMoonRock(variant) {
  const C = SPACE_COLORS;
  const pix = new Pix(128, 64);
  const seed = variant * 53 + 11;
  // 0 to 2 craters per square, [u, v, radius] (in square units)
  const craters = [];
  const n = Math.floor(hash2(variant, 1, 77) * 3);
  for (let k = 0; k < n; k++) {
    const r = 0.06 + hash2(variant, k, 78) * 0.07;
    craters.push([r + 0.08 + hash2(variant, k, 79) * (0.84 - 2 * r), r + 0.08 + hash2(variant, k, 80) * (0.84 - 2 * r), r]);
  }
  for (let py = 0; py < 64; py++) {
    for (let px = 0; px < 128; px++) {
      const [u, v] = tileUV(px, py);
      if (!inTile(u, v)) continue;
      const h = hash2(px, py, seed);
      let c = h < 0.08 ? C.rockDark : h > 0.94 ? C.rockLight : C.rock;
      for (const [cu, cv, r] of craters) {
        const d = Math.hypot(u - cu, v - cv) / r;
        if (d < 0.75) c = (u - cu) + (v - cv) < 0 ? C.crater : shade(C.crater, 0.08); // the hollow, shaded on one side
        else if (d < 1) c = (u - cu) + (v - cv) > 0 ? C.craterRim : C.rock; // the lit rim
      }
      pix.set(px, py, c);
    }
  }
  return pix;
}

// Lava, like the city's water: glowing orange with a few dark crusts, and bright streaks that drift along,
// in `frames` frames side by side. Crusts stay inside the square, so squares always fit together.
export function genLava(variant, frames = 6) {
  const C = SPACE_COLORS;
  const pix = new Pix(128 * frames, 64);
  const crusts = [];
  const n = 1 + Math.floor(hash2(variant, 1, 61) * 2);
  for (let k = 0; k < n; k++) {
    const r = 0.07 + hash2(variant, k, 62) * 0.06;
    crusts.push([r + 0.1 + hash2(variant, k, 63) * (0.8 - 2 * r), r + 0.1 + hash2(variant, k, 64) * (0.8 - 2 * r), r]);
  }
  for (let f = 0; f < frames; f++) {
    for (let py = 0; py < 64; py++) {
      for (let px = 0; px < 128; px++) {
        const [u, v] = tileUV(px, py);
        if (!inTile(u, v)) continue;
        const h = hash2(px, py, variant * 17 + 3);
        let c = h < 0.12 ? C.lavaDark : h > 0.96 ? C.lavaHot : C.lava;
        // drifting bright streaks (like the water's wave dashes)
        const flow = hash2(Math.floor((px + f * 3 + py * 2) / 7), py, variant + 41);
        if (py % 5 === 2 && flow < 0.14) c = flow < 0.04 ? C.lavaWhite : C.lavaHot;
        // dark crust plates with a hot rim, glowing a little brighter and darker as the frames go
        for (const [cu, cv, r] of crusts) {
          const d = Math.hypot((u - cu) * 1.3, v - cv) / r;
          if (d < 0.8) c = hash2(px, py, 9) < 0.15 ? 0x5e2414 : C.lavaCrust;
          else if (d < 1) c = f % 3 === 0 ? C.lavaWhite : C.lavaHot;
        }
        pix.set(f * 128 + px, py, c);
      }
    }
  }
  return pix;
}

// White paving in 4 x 4 slabs (joints on the top two sides of each square only, so they line up).
export function genWhitePavement(variant) {
  const C = SPACE_COLORS;
  const pix = new Pix(128, 64);
  for (let py = 0; py < 64; py++) {
    for (let px = 0; px < 128; px++) {
      const [u, v] = tileUV(px, py);
      if (!inTile(u, v)) continue;
      const su = u * 4;
      const sv = v * 4;
      const slab = hash2(Math.floor(su), Math.floor(sv), variant + 31);
      let c = slab < 0.3 ? C.paveDark : slab > 0.75 ? C.paveLight : C.pave;
      if (frac(su) < 0.045 || frac(sv) < 0.045) c = C.paveJoint;
      else if (hash2(px, py, variant * 7 + 5) < 0.03) c = C.paveDark;
      pix.set(px, py, c);
    }
  }
  return pix;
}

// ---------- neon roads ----------
// Dark road with metal curbs; a glowing blue strip down the middle instead of the white dashes, and blue
// lights on the curbs. Like the city's roads: a centre piece plus one arm for each neighbouring road.
const CURB = 0.075;
const STRIP = 0.016; // half the width of the neon strip
const GLOW = 0.05; // how far its glow reaches

// a blue light on the curb: bright middle, soft glow round it
function dot(pix, cu, cv, u, v, px, py) {
  const d = Math.hypot((u - cu) * 2, v - cv); // squares are twice as wide as tall on screen
  if (d < 0.03) pix.set(px, py, SPACE_COLORS.neonCore);
  else if (d < 0.065) pix.set(px, py, SPACE_COLORS.neon, Math.round(230 * (1 - (d - 0.03) / 0.035)));
}

export function genNeonRoadCenter() {
  const C = SPACE_COLORS;
  const pix = new Pix(128, 64);
  const a = CURB;
  for (let py = 0; py < 64; py++) {
    for (let px = 0; px < 128; px++) {
      const [u, v] = tileUV(px, py);
      if (!inSquare(u, v)) continue;
      const e = Math.min(u - a, 1 - a - u, v - a, 1 - a - v);
      pix.set(px, py, e >= 0.012 ? C.asphalt : e >= 0 ? C.curbLine : C.curb);
      // lights on the curbs, two on each side (an arm on that side covers them)
      if (e < 0) {
        for (const p of [0.25, 0.75]) {
          dot(pix, p, a / 2, u, v, px, py);
          dot(pix, p, 1 - a / 2, u, v, px, py);
          dot(pix, a / 2, p, u, v, px, py);
          dot(pix, 1 - a / 2, p, u, v, px, py);
        }
      }
      // where the strips meet in the middle
      const m = Math.hypot(u - 0.5, v - 0.5);
      if (m < STRIP * 1.4) pix.set(px, py, C.neonCore);
      else if (m < STRIP * 1.4 + GLOW * 0.6) pix.set(px, py, C.neon, 120);
    }
  }
  return pix;
}

export function genNeonRoadArm(side) {
  const C = SPACE_COLORS;
  const pix = new Pix(128, 64);
  const a = CURB;
  for (let py = 0; py < 64; py++) {
    for (let px = 0; px < 128; px++) {
      const [u, v] = tileUV(px, py);
      if (!inSquare(u, v)) continue;
      let along;
      let across;
      switch (side) {
        case 'ne': along = 0.5 - v; across = u; break;
        case 'se': along = u - 0.5; across = v; break;
        case 'sw': along = v - 0.5; across = u; break;
        default: along = 0.5 - u; across = v; break; // nw
      }
      if (along < 0) continue;
      const off = Math.abs(across - 0.5);
      const road = along >= 0.5 - a - 0.012 && across >= a && across < 1 - a;
      if (road) pix.set(px, py, C.asphalt);
      // the neon strip, from the middle of the square to its side, with a glow on the road either side
      if (off < STRIP) pix.set(px, py, C.neonCore);
      else if (off < STRIP + 0.008) pix.set(px, py, C.neon);
      else if (off < STRIP + GLOW) pix.set(px, py, C.neon, Math.round(110 * (1 - (off - STRIP) / GLOW)));
    }
  }
  return pix;
}

// ---------- people ----------

// A person in a round glass astronaut helmet (the same walking frames as genPerson).
export function genAstronaut(variant) {
  const pix = genPerson(variant);
  const fw = 32;
  const fh = 48;
  for (let row = 0; row < 2; row++) {
    for (let f = 0; f < 4; f++) {
      const cx = f * fw + 16.5;
      const cy = row * fh + 27;
      for (let y = Math.floor(cy - 7); y <= cy + 6; y++) {
        for (let x = Math.floor(cx - 7); x <= cx + 7; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > 6.3) continue;
          if (d > 5.3) pix.set(x, y, 0xe8eef4); // the white rim
          else pix.set(x, y, 0xbfe6fb, 110); // tinted glass over the face
        }
      }
      // a shine on the glass, and the collar ring
      pix.set(cx - 3, cy - 3, 0xffffff);
      pix.set(cx - 2, cy - 4, 0xffffff);
      pix.rect(Math.floor(cx) - 4, row * fh + 32, 9, 1, 0xc9d2dc);
    }
  }
  return pix;
}

// ---------- the sky ----------

// A square of night sky with `count` stars, to be tiled behind the map (CSS background, see style.css).
// count < 200: only the stars, on a see-through background (a layer that twinkles over the other).
export function starSky(size = 512, seed = 1, count = 260) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (count >= 200) {
    g.fillStyle = '#05060d';
    g.fillRect(0, 0, size, size);
  }
  for (let k = 0; k < count; k++) {
    const x = hash2(k, 1, 901 + seed * 10) * size;
    const y = hash2(k, 2, 902 + seed * 10) * size;
    const b = hash2(k, 3, 903 + seed * 10);
    const r = b > 0.97 ? 1.6 : b > 0.85 ? 1.1 : 0.7;
    g.fillStyle = b > 0.93 ? '#cfe3ff' : b > 0.88 ? '#ffe9c4' : '#ffffff';
    g.globalAlpha = 0.35 + 0.65 * hash2(k, 4, 904);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return c.toDataURL('image/png');
}

// The picture on the Space card of the new-city choice (menu.js): a grey moon with craters among stars.
export function moonPicture(w = 320, h = 208) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#070a18';
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 60; k++) {
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.3 + 0.7 * hash2(k, 4, 41);
    g.fillRect(hash2(k, 1, 41) * w, hash2(k, 2, 41) * h, hash2(k, 3, 41) > 0.85 ? 2 : 1, hash2(k, 3, 41) > 0.85 ? 2 : 1);
  }
  g.globalAlpha = 1;
  const r = h * 0.38;
  const cx = w / 2;
  const cy = h / 2;
  // a soft glow, then the moon lit from the top left
  const glow = g.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.35);
  glow.addColorStop(0, 'rgba(220,226,240,0.35)');
  glow.addColorStop(1, 'rgba(220,226,240,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  const body = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  body.addColorStop(0, '#e9e9e6');
  body.addColorStop(0.6, '#b9b9b5');
  body.addColorStop(1, '#7c7c79');
  g.fillStyle = body;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.clip();
  for (const [x, y, s] of [[-0.35, -0.2, 0.22], [0.25, -0.38, 0.14], [0.3, 0.2, 0.26], [-0.2, 0.42, 0.13], [-0.55, 0.25, 0.1], [0.6, -0.05, 0.09]]) {
    g.fillStyle = 'rgba(90,90,88,0.55)';
    g.beginPath();
    g.arc(cx + x * r, cy + y * r, s * r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(245,245,240,0.6)';
    g.lineWidth = Math.max(1, s * r * 0.18);
    g.beginPath();
    g.arc(cx + x * r, cy + y * r, s * r, 0.1 * Math.PI, 0.9 * Math.PI);
    g.stroke();
  }
  g.restore();
  return c.toDataURL('image/png');
}
