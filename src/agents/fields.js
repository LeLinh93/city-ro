// A tractor's trip from its farm: out to a field nearby, up and down its rows, and home again.
// The tractor can drive on roads, on crop squares (the wheat field decoration), and on empty land
// (no building, road, tree or water). It works crop squares when there are some near the farm,
// and otherwise a patch of empty land.
import { SIDES, SIDE_LIST } from '../constants.js';
import { pick } from '../rng.js';

const PATCH = 12; // most squares worked in one trip

// cfg: { radius, crop } from the farm's patrol settings.
// Returns { path: [[i, j], ...], start: { point, square } } or null when there is nothing to work.
export function planFieldTrip(world, b, cfg) {
  const w = world;
  const R = cfg.radius ?? 8;
  const near = (i, j) => i >= b.x - R && i < b.x + b.w + R && j >= b.y - R && j < b.y + b.d + R;
  const isCrop = (i, j) => w.buildingAt(i, j)?.type === cfg.crop;
  const isEmpty = (i, j) => {
    if (!w.inBounds(i, j) || w.isWater(i, j)) return false;
    const k = w.idx(i, j);
    return !w.road[k] && !w.bldg[k] && !w.tree[k];
  };
  const drivable = (i, j) => w.inBounds(i, j) && near(i, j) && (isCrop(i, j) || isEmpty(i, j) || w.isRoad(i, j));

  // where the tractor comes out: squares around the farm it can drive on
  const exits = [];
  for (let j = b.y; j < b.y + b.d; j++) {
    for (let i = b.x; i < b.x + b.w; i++) {
      for (const s of SIDE_LIST) {
        const d = SIDES[s];
        const o = [i + d.dx, j + d.dy];
        if (w.buildingAt(...o) === b || !drivable(...o)) continue;
        exits.push({ square: o, point: { x: i + 0.5 + d.dx * 0.5, y: j + 0.5 + d.dy * 0.5 } });
      }
    }
  }
  if (!exits.length) return null;

  // everything reachable from the farm
  const from = new Map(); // square index -> previous square index (-1 at an exit)
  const queue = [];
  for (const e of exits) {
    const k = w.idx(...e.square);
    if (!from.has(k)) {
      from.set(k, -1);
      queue.push(e.square);
    }
  }
  for (let n = 0; n < queue.length; n++) {
    const [i, j] = queue[n];
    for (const s of SIDE_LIST) {
      const d = SIDES[s];
      const a = i + d.dx;
      const c = j + d.dy;
      if (!drivable(a, c) || from.has(w.idx(a, c))) continue;
      from.set(w.idx(a, c), w.idx(i, j));
      queue.push([a, c]);
    }
  }
  const crops = queue.filter((q) => isCrop(...q));
  const empty = queue.filter((q) => isEmpty(...q));
  const work = crops.length ? isCrop : isEmpty;
  const seed = crops.length ? pick(crops) : empty.length ? pick(empty) : null;
  if (!seed) return null;

  // a patch of workable squares around the seed
  const patch = [seed];
  const inPatch = new Set([w.idx(...seed)]);
  for (let n = 0; n < patch.length && patch.length < PATCH; n++) {
    const [i, j] = patch[n];
    for (const s of SIDE_LIST) {
      const d = SIDES[s];
      const a = i + d.dx;
      const c = j + d.dy;
      const k = w.inBounds(a, c) && w.idx(a, c);
      if (k === false || inPatch.has(k) || !from.has(k) || !work(a, c) || patch.length >= PATCH) continue;
      inPatch.add(k);
      patch.push([a, c]);
    }
  }

  // up and down the rows: by row, every other row the other way
  const rows = new Map();
  for (const q of patch) (rows.get(q[1]) || rows.set(q[1], []).get(q[1])).push(q);
  const order = [];
  [...rows.keys()].sort((a, c) => a - c).forEach((j, n) => {
    const row = rows.get(j).sort((a, c) => a[0] - c[0]);
    order.push(...(n % 2 ? row.reverse() : row));
  });

  // squares from an exit to square k, following the search back
  const toFarm = (k) => {
    const out = [];
    for (let s = k; s !== -1; s = from.get(s)) out.push([s % w.size, (s / w.size) | 0]);
    return out; // starts at k, ends at an exit
  };
  // shortest way between two squares, over drivable squares
  const between = (p, q) => {
    const goal = w.idx(...q);
    const prev = new Map([[w.idx(...p), -1]]);
    const list = [p];
    for (let n = 0; n < list.length; n++) {
      const [i, j] = list[n];
      if (w.idx(i, j) === goal) break;
      for (const s of SIDE_LIST) {
        const d = SIDES[s];
        const a = i + d.dx;
        const c = j + d.dy;
        if (!drivable(a, c) || prev.has(w.idx(a, c))) continue;
        prev.set(w.idx(a, c), w.idx(i, j));
        list.push([a, c]);
      }
    }
    if (!prev.has(goal)) return null;
    const out = [];
    for (let s = goal; s !== -1; s = prev.get(s)) out.push([s % w.size, (s / w.size) | 0]);
    return out.reverse(); // from p to q
  };

  const out = toFarm(w.idx(...order[0])).reverse();
  for (let n = 1; n < order.length; n++) {
    const leg = between(order[n - 1], order[n]);
    if (!leg) break;
    out.push(...leg.slice(1));
  }
  const back = toFarm(w.idx(...out[out.length - 1]));
  out.push(...back.slice(1));
  const end = out[out.length - 1];
  const exitAt = (sq) => exits.find((e) => e.square[0] === sq[0] && e.square[1] === sq[1]);
  return { path: out, start: exitAt(out[0]), end: exitAt(end) };
}
