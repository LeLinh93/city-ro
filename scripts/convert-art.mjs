// Turns big source art into game-ready pixel art.
//
//   npm run art                 convert the pictures in art-source/ that are new or changed into assets/
//   npm run art -- --all        convert every picture again
//   npm run art -- --preview    also write 4x zoomed copies to art-preview/ for checking
//   npm run art -- --out <dir>  write somewhere else instead of assets/
//   npm run art -- house        only jobs whose output name contains "house" (always converted again)
//
// Three ways to say what to convert:
//  1. Theme buildings: art-source/building-<theme>/<Menu>/<name>-<W>x<D>.png
//     -> assets/building-<theme>/<Menu>/<name>-<W>x<D>.png, scaled so the image is (W+D)*64 px wide.
//     The background must already be transparent; the canvas is kept as it is (no trim).
//  2. By name: art-source/ground/grass_0.webp -> assets/ground/grass_0.png
//     (same folder + name as the game file; any of .png .webp .jpg).
//  3. A job list in art-source/convert.json, e.g. to cut several tiles out of one sheet:
//     { "jobs": [ { "from": "tiles.webp", "crop": [0, 0, 512, 256], "to": "ground/grass_0.png" } ] }
//
// Steps: remove plain background -> trim -> area-average shrink to the exact size
//        -> hard alpha edges -> clip to the footprint / tile diamond -> reduce colours.
// Theme buildings skip the first two steps.
//
// Job options (all optional): crop [x,y,w,h], width, height, footprint [W,D],
//   fuzz (background tolerance %, default 12), alphaCut (0..1, default 0.5),
//   colors (default 64, 0 = keep all), outline (true = darken the outer edge pixels), clip (false = keep everything),
//   trim (false = keep the canvas as it is).
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';

const EXTS = new Set(['.png', '.webp', '.jpg', '.jpeg']);

// ---------- command line ----------

const args = process.argv.slice(2);
let SRC = 'art-source';
let OUT = 'assets';
let preview = false;
let all = false;
const filters = [];
for (let k = 0; k < args.length; k++) {
  if (args[k] === '--out') OUT = args[++k];
  else if (args[k] === '--src') SRC = args[++k];
  else if (args[k] === '--preview') preview = true;
  else if (args[k] === '--all') all = true;
  else filters.push(args[k]);
}

// ---------- what size each game file must be ----------

// building-<theme>/<Menu>/<name>-<W>x<D>.png
export const THEME_FILE = /^building-[^/]+\/[^/]+\/[^/]+-(\d+)x(\d+)\.(png|webp|jpe?g)$/i;

function targetFor(to, job) {
  const theme = to.match(THEME_FILE);
  if (theme) {
    const [W, D] = job.footprint || [Number(theme[1]), Number(theme[2])];
    return { width: (W + D) * 64, trim: false, keepBackground: true, clip: 'footprint', W, D };
  }
  const [folder, file] = to.split('/');
  const name = file.replace(/\.png$/, '');
  if (folder === 'buildings') {
    if (!job.footprint) throw new Error(`${to}: buildings now live in building-<theme>/<Menu>/<name>-<W>x<D>.png`);
    const [W, D] = job.footprint;
    return { width: (W + D) * 64, trim: true, clip: 'footprint', W, D };
  }
  if (folder === 'ground' && /^water_/.test(name)) return { tile: true, frames: 'auto', trim: false, clip: 'diamond' };
  if (folder === 'ground' && /^edge_/.test(name)) return { width: 128, height: 64, trim: false, clip: 'diamond' };
  if (folder === 'ground') return { width: 128, height: 64, trim: true, clip: 'diamond' };
  if (folder === 'roads' && /^road_arm_/.test(name)) return { width: 128, height: 64, trim: false, clip: 'diamond' };
  if (folder === 'roads') return { width: 128, height: 64, trim: true, clip: 'diamond' };
  if (folder === 'trees') return { width: 96, trim: true };
  if (folder === 'people') return { width: 128, height: 96, trim: false };
  if (folder === 'vehicles' && name === 'police_car') return { width: 128, height: 96, trim: false };
  if (folder === 'vehicles' && /^car_/.test(name)) return { width: 64, height: 96, trim: false };
  if (folder === 'vehicles' && /^plane_/.test(name)) return { width: 384, height: 512, trim: false };
  if (folder === 'fx') return { width: 10, trim: true };
  if (!job.width) throw new Error(`${to}: unknown kind of file (add "width" to the job)`);
  return { trim: true };
}

// ---------- pixel helpers (RGBA, 0..255) ----------

const img = (w, h) => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });

function removeBackground(p, fuzzPct) {
  const { w, h, d } = p;
  const at = (x, y) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  if (corners.every((k) => d[k + 3] < 16)) return; // already transparent
  const bg = [0, 1, 2].map((c) => corners.reduce((s, k) => s + d[k + c], 0) / 4);
  const tol = (fuzzPct / 100) * 441.7;
  const dist = (k) => Math.hypot(d[k] - bg[0], d[k + 1] - bg[1], d[k + 2] - bg[2]);
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const i = y * w + x;
    if (seen[i]) return;
    seen[i] = 1;
    if (d[i * 4 + 3] < 16 || dist(i * 4) <= tol) stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  const bgMask = new Uint8Array(w * h);
  while (stack.length) {
    const i = stack.pop();
    bgMask[i] = 1;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  // Also drop the light fringe right next to the background (anti-aliased edge pixels).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bgMask[i]) continue;
      const touches = (x > 0 && bgMask[i - 1]) || (x < w - 1 && bgMask[i + 1]) || (y > 0 && bgMask[i - w]) || (y < h - 1 && bgMask[i + w]);
      if (touches && dist(i * 4) <= tol * 2.2) bgMask[i] = 2;
    }
  }
  for (let i = 0; i < w * h; i++) if (bgMask[i]) d[i * 4 + 3] = 0;
}

function trim(p) {
  const { w, h, d } = p;
  const rows = new Uint32Array(h);
  const cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 0) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  // ignore lonely specks: a row/column needs at least 2 solid pixels
  let x0 = 0;
  let x1 = w - 1;
  let y0 = 0;
  let y1 = h - 1;
  while (x0 < w && cols[x0] < 2) x0++;
  while (x1 > x0 && cols[x1] < 2) x1--;
  while (y0 < h && rows[y0] < 2) y0++;
  while (y1 > y0 && rows[y1] < 2) y1--;
  if (x0 >= w || y0 >= h) throw new Error('image is empty after removing the background (try a lower "fuzz")');
  const out = img(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < out.h; y++) {
    out.d.set(d.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * out.w * 4);
  }
  return out;
}

// Area-average shrink: every source pixel counts, so thin lines survive. Premultiplied alpha, no halos.
function boxResize(p, tw, th) {
  const weights = (n, tn) => {
    const s = n / tn;
    const list = [];
    for (let o = 0; o < tn; o++) {
      const a = o * s;
      const b = (o + 1) * s;
      const ws = [];
      for (let i = Math.floor(a); i < Math.min(n, Math.ceil(b)); i++) {
        const cover = Math.min(b, i + 1) - Math.max(a, i);
        if (cover > 0) ws.push([i, cover]);
      }
      list.push(ws);
    }
    return list;
  };
  const wx = weights(p.w, tw);
  const wy = weights(p.h, th);
  const out = img(tw, th);
  for (let oy = 0; oy < th; oy++) {
    for (let ox = 0; ox < tw; ox++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (const [sy, cy] of wy[oy]) {
        for (const [sx, cx] of wx[ox]) {
          const k = (sy * p.w + sx) * 4;
          const wgt = cx * cy;
          const al = p.d[k + 3] / 255;
          r += p.d[k] * al * wgt;
          g += p.d[k + 1] * al * wgt;
          b += p.d[k + 2] * al * wgt;
          a += al * wgt;
          area += wgt;
        }
      }
      const k = (oy * tw + ox) * 4;
      if (a > 0) {
        out.d[k] = r / a;
        out.d[k + 1] = g / a;
        out.d[k + 2] = b / a;
      }
      out.d[k + 3] = (a / area) * 255;
    }
  }
  return out;
}

function padTop(p, rows) {
  const out = img(p.w, p.h + rows);
  out.d.set(p.d, rows * p.w * 4);
  return out;
}

function hardAlpha(p, cut) {
  for (let i = 3; i < p.d.length; i += 4) p.d[i] = p.d[i] >= cut * 255 ? 255 : 0;
}

// Remove everything below the footprint's front edges, so the base is a clean 2:1 line.
function clipFootprint(p, W) {
  const { w, h, d } = p;
  const tipX = W * 64;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x + 0.5;
      const edge = cx <= tipX ? h - W * 32 + cx / 2 : h - (cx - tipX) / 2;
      if (y + 0.5 > edge + 0.25) d[(y * w + x) * 4 + 3] = 0;
    }
  }
}

// Keep only the 128 x 64 diamond of each tile frame (makes tiles fit together perfectly).
function clipDiamond(p) {
  const { w, h, d } = p;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x % 128) + 0.5 - 64;
      const dy = y + 0.5;
      const u = (dx / 64 + dy / 32) / 2;
      const v = (dy / 32 - dx / 64) / 2;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) d[(y * w + x) * 4 + 3] = 0;
    }
  }
}

// Median-cut colour reduction (no dithering), so pixels form clean flat areas.
function reduceColors(p, n) {
  const pts = [];
  for (let i = 0; i < p.d.length; i += 4) if (p.d[i + 3]) pts.push([p.d[i], p.d[i + 1], p.d[i + 2]]);
  if (!pts.length) return;
  let boxes = [pts];
  while (boxes.length < n) {
    // split the box with the widest colour range
    let best = -1;
    let bestRange = 0;
    let bestCh = 0;
    boxes.forEach((b, k) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const q of b) {
          if (q[c] < lo) lo = q[c];
          if (q[c] > hi) hi = q[c];
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          best = k;
          bestCh = c;
        }
      }
    });
    if (best < 0 || bestRange < 2) break;
    const b = boxes[best].sort((a, z) => a[bestCh] - z[bestCh]);
    const mid = b.length >> 1;
    boxes.splice(best, 1, b.slice(0, mid), b.slice(mid));
  }
  const pal = boxes.map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, q) => s + q[c], 0) / b.length)));
  const cache = new Map();
  for (let i = 0; i < p.d.length; i += 4) {
    if (!p.d[i + 3]) continue;
    const key = (p.d[i] << 16) | (p.d[i + 1] << 8) | p.d[i + 2];
    let c = cache.get(key);
    if (!c) {
      let bd = Infinity;
      for (const q of pal) {
        const dd = (q[0] - p.d[i]) ** 2 * 0.3 + (q[1] - p.d[i + 1]) ** 2 * 0.59 + (q[2] - p.d[i + 2]) ** 2 * 0.11;
        if (dd < bd) {
          bd = dd;
          c = q;
        }
      }
      cache.set(key, c);
    }
    p.d[i] = c[0];
    p.d[i + 1] = c[1];
    p.d[i + 2] = c[2];
  }
}

function outline(p) {
  const { w, h, d } = p;
  const edge = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      if (!d[k + 3]) continue;
      const clear = (xx, yy) => xx < 0 || yy < 0 || xx >= w || yy >= h || !d[(yy * w + xx) * 4 + 3];
      if (clear(x - 1, y) || clear(x + 1, y) || clear(x, y - 1) || clear(x, y + 1)) edge.push(k);
    }
  }
  for (const k of edge) {
    d[k] *= 0.55;
    d[k + 1] *= 0.55;
    d[k + 2] *= 0.6;
  }
}

// Where is the footprint's bottom corner? Warn if the art's shape doesn't match the game's footprint.
function checkFootprint(p, W, D, label) {
  const { w, h, d } = p;
  let sum = 0;
  let n = 0;
  for (let y = h - 1; y >= Math.max(0, h - 3); y--) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3]) {
        sum += x;
        n++;
      }
    }
    if (n) break;
  }
  if (!n) return;
  const seen = sum / n / w;
  const want = W / (W + D);
  if (Math.abs(seen - want) > 0.12) {
    const guessW = Math.max(1, Math.round(seen * (W + D)));
    console.warn(`  ! ${label}: the bottom corner is at ${Math.round(seen * 100)}% of the width, but a ${W}x${D} footprint puts it at ${Math.round(want * 100)}%.`);
    console.warn(`    The art looks like a ${guessW}x${W + D - guessW} building. Fix the size in the file name.`);
  }
}

// ---------- jobs ----------

function collectJobs() {
  const jobs = [];
  const cfgPath = join(SRC, 'convert.json');
  const used = new Set();
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    for (const j of cfg.jobs || []) {
      jobs.push({ ...j, listed: true });
      used.add(j.from.replace(/\\/g, '/'));
    }
  }
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isDirectory()) walk(full);
      else if (EXTS.has(extname(f).toLowerCase())) {
        const rel = relative(SRC, full).replace(/\\/g, '/');
        if (used.has(rel) || !rel.includes('/')) continue; // sheets used by jobs, or loose files in the root
        if (/^building-/i.test(rel) && !THEME_FILE.test(rel)) {
          console.warn(`  ! skipped ${rel}: put it in a menu folder and name it <name>-<W>x<D>, e.g. House/house-1x1.png`);
          continue;
        }
        jobs.push({ from: rel, to: rel.replace(/\.[^.]+$/, '.png') });
      }
    }
  };
  if (existsSync(SRC)) walk(SRC);
  return jobs.filter((j) => !filters.length || filters.some((f) => j.to.includes(f)));
}

async function run(job) {
  const t = targetFor(job.to, job);
  let pipe = sharp(join(SRC, job.from));
  if (job.crop) {
    const [left, top, width, height] = job.crop;
    pipe = pipe.extract({ left, top, width, height });
  }
  const { data, info } = await pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let p = { w: info.width, h: info.height, d: new Uint8ClampedArray(data) };

  if (!t.keepBackground) removeBackground(p, job.fuzz ?? 12);
  if (job.trim ?? t.trim) p = trim(p);

  let tw = job.width ?? t.width;
  let th = job.height ?? t.height;
  if (!th && !t.frames) {
    // Keep the bottom edge where it is. If the shrink is a whole number (e.g. 512 -> 128 is 4x),
    // add transparent rows on top so every game pixel averages exactly 4x4 source pixels.
    const f = p.w / tw;
    if (Math.abs(f - Math.round(f)) < 1e-6 && p.h % Math.round(f)) p = padTop(p, Math.round(f) - (p.h % Math.round(f)));
  }
  if (t.frames === 'auto') {
    const frames = Math.max(1, Math.round(p.w / p.h / 2));
    tw = 128 * frames;
    th = 64;
  }
  th ??= Math.max(1, Math.round((p.h * tw) / p.w));
  const out = boxResize(p, tw, th);
  hardAlpha(out, job.alphaCut ?? 0.5);
  if (t.clip === 'footprint') checkFootprint(out, t.W, t.D, job.to);
  if (job.clip !== false && t.clip === 'footprint') clipFootprint(out, t.W);
  if (job.clip !== false && t.clip === 'diamond') clipDiamond(out);
  if (job.outline) outline(out);
  if ((job.colors ?? 64) > 0) reduceColors(out, job.colors ?? 64);

  const dest = join(OUT, job.to);
  mkdirSync(dirname(dest), { recursive: true });
  const raw = { raw: { width: tw, height: th, channels: 4 } };
  await sharp(Buffer.from(out.d.buffer), raw).png({ compressionLevel: 9 }).toFile(dest);
  if (preview) {
    const pv = join(OUT === 'assets' ? 'art-preview' : `${OUT}-preview`, job.to);
    mkdirSync(dirname(pv), { recursive: true });
    await sharp(dest).resize(tw * 4, th * 4, { kernel: 'nearest' }).toFile(pv);
  }
  console.log(`${job.from}${job.crop ? ` [${job.crop}]` : ''} -> ${dest}  ${tw}x${th}`);
}

// A game file is up to date when it is newer than its source picture (and than convert.json for listed jobs).
const mtime = (f) => (existsSync(f) ? statSync(f).mtimeMs : 0);
const cfgTime = mtime(join(SRC, 'convert.json'));
function upToDate(job) {
  const out = mtime(join(OUT, job.to));
  return out > 0 && out >= mtime(join(SRC, job.from)) && (!job.listed || out >= cfgTime);
}

const found = collectJobs();
if (!found.length) {
  console.log(`Nothing to convert. Put images in ${SRC}/<folder>/<name>.png or list jobs in ${SRC}/convert.json (see ASSETS.md).`);
}
// Pictures named on the command line, --all and --preview always convert; otherwise only new or changed ones.
const jobs = all || preview || filters.length ? found : found.filter((j) => !upToDate(j));
const skipped = found.length - jobs.length;
if (skipped) console.log(`${skipped} picture${skipped === 1 ? ' is' : 's are'} already converted (npm run art -- --all to redo them).`);
if (found.length && !jobs.length) console.log('Nothing new to convert.');
let failed = 0;
for (const job of jobs) {
  try {
    await run(job);
  } catch (e) {
    failed++;
    console.error(`x ${job.from}: ${e.message}`);
  }
}
if (failed) process.exitCode = 1;
