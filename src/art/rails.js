// Railway squares, drawn by code: a bed of gravel a little more than half a square wide down the middle of the
// square, wooden sleepers across it and two steel rails on top. A bend between two sides that meet in a corner is a
// quarter circle round that corner. On a level crossing there is no gravel: the rails sit in a concrete deck.
import { Pix, tileUV } from './raster.js';
import { hash2 } from '../rng.js';

const BED = 0.29; // half the width of the gravel bed, in squares (so the bed is 0.58 wide)
const TIE = 0.21; // half the length of a sleeper
const GAUGE = 0.1; // the rails are this far either side of the middle
const RAIL = 0.022; // half the width of a rail
const TIE_EVERY = 0.2; // a sleeper every 0.2 squares
const TIE_W = 0.075;

// Where each side's track meets the edge of the square (u runs down-right, v down-left).
const PORT = { ne: [0.5, 0], se: [1, 0.5], sw: [0.5, 1], nw: [0, 0.5] };
const BIT = { ne: 1, se: 2, sw: 4, nw: 8 };
const OPP = { ne: 'sw', sw: 'ne', se: 'nw', nw: 'se' };
const SIDES = ['ne', 'se', 'sw', 'nw'];

// The pieces of track in a square with neighbours `mask`: straights [{ a, b }] and quarter circles [{ c }] round corner c.
export function railPieces(mask) {
  const on = SIDES.filter((s) => mask & BIT[s]);
  const lines = [];
  const arcs = [];
  if (on.length === 0) lines.push(['nw', 'se']); // a lone square: a short straight
  else if (on.length === 1) lines.push([on[0], OPP[on[0]]]); // the end of a line runs straight on to the edge
  else {
    for (const s of on) {
      if (on.includes(OPP[s])) {
        if (s === 'ne' || s === 'se') lines.push([s, OPP[s]]);
      } else {
        // no straight on from here: bend to each side next to it
        for (const t of on) if (t !== s && t !== OPP[s]) arcs.push([s, t]);
      }
    }
  }
  // the corner two neighbouring sides meet in
  const corner = (s, t) => [PORT[s][0] === 0.5 ? PORT[t][0] : PORT[s][0], PORT[s][1] === 0.5 ? PORT[t][1] : PORT[s][1]];
  const seen = new Set();
  const bends = [];
  for (const [s, t] of arcs) {
    const key = [s, t].sort().join();
    if (seen.has(key)) continue;
    seen.add(key);
    bends.push({ c: corner(s, t) });
  }
  return { lines: lines.map(([s, t]) => ({ a: PORT[s], b: PORT[t] })), bends };
}

// Offset across the track (d) and distance along it (t) of point (u, v) for each piece.
function pieceCoords(pieces, u, v, out) {
  out.length = 0;
  for (const { a, b } of pieces.lines) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = (u - a[0]) * dx + (v - a[1]) * dy;
    const d = -(u - a[0]) * dy + (v - a[1]) * dx;
    out.push([d, t]);
  }
  for (const { c } of pieces.bends) {
    const r = Math.hypot(u - c[0], v - c[1]);
    out.push([r - 0.5, Math.atan2(v - c[1], u - c[0]) * 0.5]);
  }
  return out;
}

const mod = (a, n) => ((a % n) + n) % n;

export function genRail(mask, crossing = false) {
  const pix = new Pix(128, 64);
  const pieces = railPieces(mask);
  const co = [];
  for (let py = 0; py < 64; py++) {
    for (let px = 0; px < 128; px++) {
      const [u, v] = tileUV(px, py);
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      let bed = Infinity;
      let tie = false;
      let rail = 0; // 0 none, 1 rail top, 2 its shaded side
      let gap = Infinity; // how far from the nearest rail
      for (const [d, t] of pieceCoords(pieces, u, v, co)) {
        const ad = Math.abs(d);
        bed = Math.min(bed, ad);
        if (ad < TIE && mod(t, TIE_EVERY) < TIE_W) tie = true;
        const r = Math.abs(ad - GAUGE);
        gap = Math.min(gap, r);
        if (r < RAIL) rail = Math.max(rail, 1);
        else if (r < RAIL + 0.016 && ad > GAUGE) rail = Math.max(rail, 2);
      }
      if (bed >= BED) continue;
      const h = hash2(px, py, 91);
      if (crossing) {
        // a concrete deck the cars drive over, with a dark groove along each rail
        if (gap < RAIL) pix.set(px, py, 0xdfe3e8);
        else if (gap < RAIL + 0.02) pix.set(px, py, 0x2a2c30);
        else if (bed < GAUGE + 0.08) pix.set(px, py, h < 0.5 ? 0x8f8e89 : 0x898883);
        continue;
      }
      if (rail === 1) pix.set(px, py, 0xd2d6dc);
      else if (rail === 2) pix.set(px, py, 0x4a4c52);
      else if (tie) pix.set(px, py, h < 0.3 ? 0x5a4130 : 0x6b4e38);
      else {
        // gravel: speckled grey, darker at the edges of the bed
        const edge = bed > BED - 0.05;
        const c = edge ? (h < 0.5 ? 0x6e6a64 : 0x77736c) : h < 0.25 ? 0x8d8880 : h < 0.6 ? 0x9a958c : h < 0.85 ? 0xa7a297 : 0x7f7a72;
        pix.set(px, py, c);
      }
    }
  }
  return pix;
}
