// Night lights on a building, made in code the first time they are needed: a copy of the building picture
// that is only the light falling on it. Drawn on top of the building with additive blending, so it only ever
// brightens the building and never spills outside its outline. def.lights picks the kind:
//   'wash' (default) : both front walls painted with warm light, brightest at the bottom; the roof stays dark
//   'ground'         : spotlights at the foot of the front walls (one per square), each shining a cone up
//                      (towers and tall landmarks, cages, stands ...)
//   'base'           : those, but only lighting the bottom of it (towers with their own lights higher up)
//   'spots'          : those, plus spotlights at the top of the walls shining down
//   'field'          : the whole picture floodlit in white, brightest in the middle (stadiums)
// A picture with standing parts (def.parts: the airport) gets the front walls of each part washed.
// def.inside lights an open courtyard (the Louvre): { floor: [x, y, w, d], lamps: [[x, y], ...], reach, glow }
// in squares: pools of light round the lamps on the courtyard floor, and glow: { x, y, r } a glass roof lit
// from inside (the pyramid; r in px).

const WARM = [255, 198, 122];
const FLOOD = [228, 236, 255]; // stadium floodlights: cool white
const GOLD = [255, 210, 120]; // a glass roof lit from inside

// key: the building's texture; def: its building settings (w, d).
export function floodTexture(scene, key, def) {
  const out = `${key}#flood`;
  if (scene.textures.exists(out)) return out;

  const src = scene.textures.get(key).getSourceImage();
  const W = src.width;
  const H = src.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;

  // picture pixels per game pixel, how tall the standing part is, and the footprint's front corners
  const sc = W / ((def.w + def.d) * 64);
  const standing = H - (def.w + def.d) * 32 * sc;
  // how far up a light reaches (all the way up for 'ground': towers and tall landmarks)
  // ('base': only the bottom of it, for towers that have their own lights higher up)
  const reachAll = Math.max(32 * sc, def.lights === 'ground' ? standing
    : def.lights === 'base' ? Math.min(standing * 0.3, 160 * sc) : Math.min(standing * 0.95, 300 * sc));
  const tipX = def.w * 64 * sc;
  const spots = [];
  // front-left wall: from the left corner down to the front tip; front-right wall: from the tip up to the right corner
  for (let k = 0; k < def.w; k++) {
    const t = (k + 0.5) / def.w;
    spots.push([tipX * t, H - def.w * 32 * sc * (1 - t)]);
  }
  for (let k = 0; k < def.d; k++) {
    const t = (k + 0.5) / def.d;
    spots.push([tipX + (W - tipX) * t, H - def.d * 32 * sc * t]);
  }

  // the top of the front walls: the outline's top (ignoring thin things like antennas) is the roof's back edge;
  // the front edge is lower by the depth of the roof's diamond at that point
  const solid = (x, y) => y >= 0 && y < H && d[(y * W + x) * 4 + 3] > 0;
  const outlineTop = new Float32Array(W).fill(H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (solid(x, y)) {
    outlineTop[x] = y;
    break;
  }
  const backX = def.d * 64 * sc; // the roof's back corner
  const roofDepth = (x) => {
    const lower = x < tipX ? 0.5 * x : 0.5 * tipX - 0.5 * (x - tipX);
    const upper = x < backX ? -0.5 * x : -0.5 * backX + 0.5 * (x - backX);
    return lower - upper;
  };
  const wallTop = (x) => {
    let top = 0;
    for (let k = Math.max(0, Math.round(x - 5 * sc)); k <= Math.min(W - 1, Math.round(x + 5 * sc)); k++) top = Math.max(top, outlineTop[k]);
    return top + roofDepth(x);
  };

  const light = new Float32Array(W * H);
  const mode = def.lights || 'wash';
  const field = mode === 'field';
  if (def.parts) {
    // the airport: each standing part is a box { x, y, w, d, h } (squares, h in px); wash its two front walls
    const P = (x, y) => [(def.d + x - y) * 64 * sc, H + (x + y - def.w - def.d) * 32 * sc];
    const wall = ([ax, ay], [bx, by], h) => {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx))); x <= Math.min(W - 1, Math.max(ax, bx)); x++) {
        const k = bx === ax ? 0 : (x - ax) / (bx - ax);
        const bottom = Math.min(H - 1, Math.round(ay + (by - ay) * k));
        const top = bottom - h * sc;
        for (let y = Math.max(0, Math.floor(top)); y <= bottom; y++) {
          const edge = Math.min(1, (y - top) / (3 * sc));
          light[y * W + x] = Math.max(light[y * W + x], edge * (0.5 + 0.38 * ((y - top) / (h * sc))));
        }
      }
    };
    for (const p of def.parts) {
      wall(P(p.x, p.y + p.d), P(p.x + p.w, p.y + p.d), p.h); // front-left wall
      wall(P(p.x + p.w, p.y + p.d), P(p.x + p.w, p.y), p.h); // front-right wall
    }
    spots.length = 0;
  } else if (mode === 'wash') {
    // the footprint's front edge: where the walls stand on the ground
    const base = (x) => (x < tipX ? H - def.w * 32 * sc + 0.5 * x : H - 0.5 * (x - tipX));
    for (let x = 0; x < W; x++) {
      const bottom = Math.min(H - 1, base(x) + 2 * sc);
      const top = Math.min(wallTop(x), bottom - 4 * sc);
      const tall = Math.max(1, bottom - top);
      for (let y = Math.max(0, Math.floor(top)); y <= bottom; y++) {
        const edge = Math.min(1, (y - top) / (3 * sc)); // soft line under the roof
        light[y * W + x] = edge * (0.5 + 0.38 * ((y - top) / tall));
      }
    }
    spots.length = 0;
  }
  if (field) {
    // brightest over the middle of the footprint, still well lit at the stands
    const cx = W / 2;
    const cy = H - (def.w + def.d) * 16 * sc;
    const rx = W / 2;
    const ry = (def.w + def.d) * 16 * sc;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
      light[y * W + x] = 0.3 + 0.55 * Math.max(0, 1 - r * r);
    }
    spots.length = 0;
  }
  const tall = mode === 'ground' && standing > 250 * sc;
  if (tall) {
    // a tall landmark: more rows of spotlights higher up (on its ledges), so it is lit to the top
    const mid = H - (def.w + def.d) * 16 * sc;
    for (const frac of [0.3, 0.55, 0.78]) {
      const y = Math.round(mid - frac * standing);
      let x0 = -1;
      let x1 = -1;
      for (let x = 0; x < W; x++) if (solid(x, y)) {
        if (x0 < 0) x0 = x;
        x1 = x;
      }
      if (x0 < 0 || x1 - x0 < 6 * sc) continue;
      const n = x1 - x0 > 60 * sc ? 3 : x1 - x0 > 25 * sc ? 2 : 1;
      for (let k = 0; k < n; k++) spots.push([x0 + ((x1 - x0) * (k + 0.5)) / n, y, standing * 0.32, 0.85]);
    }
  }
  for (const [bx, by, own, gain = 1] of spots) {
    const reach = own || reachAll;
    const top = Math.max(0, Math.floor(by - reach));
    const bottom = Math.min(H - 1, Math.ceil(by + 3 * sc));
    const widest = (7 + reach / sc * 0.42) * sc;
    const x0 = Math.max(0, Math.floor(bx - widest));
    const x1 = Math.min(W - 1, Math.ceil(bx + widest));
    for (let y = top; y <= bottom; y++) {
      const up = by - y; // pixels above the lamp
      const half = (7 + Math.max(0, up) / sc * 0.42) * sc; // the cone widens going up
      const fade = up < 0 ? 1 + up / (3 * sc) : Math.pow(1 - up / reach, tall ? 1.5 : 0.9);
      // brightest right above the lamp (tall landmarks: soft at the foot, so their base plate isn't striped)
      const hot = tall ? Math.min(1, 0.35 + Math.max(0, up) / (40 * sc)) : up >= 0 && up < 10 * sc ? 1.5 - up / (20 * sc) : 1;
      for (let x = x0; x <= x1; x++) {
        const across = Math.abs(x - bx) / half;
        if (across >= 1) continue;
        light[y * W + x] += (1 - across * across) * fade * hot * (tall ? 0.8 : 1.3) * gain;
      }
    }
  }

  // lights at the top of the walls, shining down
  if (mode === 'spots') {
    for (const [bx, by] of spots) {
      const ty = wallTop(bx);
      const wall = by - ty;
      if (wall < 26 * sc) continue; // low or flat: no wall to light from above
      const reachDown = Math.min(wall * 0.55, 150 * sc);
      const x0 = Math.max(0, Math.floor(bx - (5 + reachDown / sc * 0.4) * sc));
      const x1 = Math.min(W - 1, Math.ceil(bx + (5 + reachDown / sc * 0.4) * sc));
      for (let y = Math.max(0, Math.floor(ty - 3 * sc)); y <= Math.min(H - 1, ty + reachDown); y++) {
        const down = y - ty;
        const half = (5 + Math.max(0, down) / sc * 0.4) * sc;
        const fade = down < 0 ? 1 + down / (3 * sc) : Math.pow(1 - down / reachDown, 1.1);
        const hot = down >= 0 && down < 6 * sc ? 1.6 - down / (10 * sc) : 1;
        for (let x = x0; x <= x1; x++) {
          const across = Math.abs(x - bx) / half;
          if (across >= 1) continue;
          light[y * W + x] += (1 - across * across) * fade * hot * 1.1;
        }
      }
    }
  }

  // an open courtyard: pools of light on its floor, and its glass roof glowing (gold) from inside
  const gold = new Uint8Array(W * H);
  if (def.inside) {
    const ins = def.inside;
    const [fx, fy, fw, fd] = ins.floor;
    const reach = ins.reach ?? 1.1;
    const floorish = (k) => d[k + 2] <= d[k] + 4; // pavement, people, walls: not slate roofs or glass
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      if (!d[k + 3]) continue;
      // the point on the ground this pixel shows (true for the courtyard floor)
      const a = x / (64 * sc) - def.d;
      const b = (y - H) / (32 * sc) + def.w + def.d;
      const lx = (a + b) / 2;
      const ly = (b - a) / 2;
      if (lx < fx || lx > fx + fw || ly < fy || ly > fy + fd || !floorish(k)) continue;
      let sum = 0;
      for (const [cx, cy] of ins.lamps || []) {
        const r = Math.hypot(lx - cx, ly - cy) / reach;
        if (r < 1) sum += (1 - r * r) * 0.45;
      }
      light[y * W + x] += Math.min(0.6, sum);
    }
    if (ins.glow) {
      const g = ins.glow;
      const cx = (def.d + g.x - g.y) * 64 * sc;
      const cy = H + (g.x + g.y - def.w - def.d) * 32 * sc - g.r * 0.35 * sc; // the middle of the glass, above the ground
      const rx = g.r * sc;
      const ry = g.r * 0.75 * sc;
      for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(H, cy + ry); y++) {
        for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(W, cx + rx); x++) {
          const k = (y * W + x) * 4;
          const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
          if (!d[k + 3] || r >= 1 || d[k + 2] <= d[k] + 4) continue; // only the (blue) glass
          light[y * W + x] = Math.max(light[y * W + x], 1.1 * (1 - r * r * 0.6));
          gold[y * W + x] = 1;
        }
      }
    }
  }

  for (let i = 0; i < W * H; i++) {
    const k = i * 4;
    const a = d[k + 3];
    const l = Math.min(tall ? 0.95 : 1.4, light[i]);
    if (!a || l <= 0) {
      d[k + 3] = 0;
      continue;
    }
    // lighter walls take more light, so the building's own details show through
    const lum = (0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2]) / 255;
    const f = l * (0.35 + 0.9 * lum);
    const tone = field ? FLOOD : gold[i] ? GOLD : WARM;
    d[k] = Math.min(255, tone[0] * f);
    d[k + 1] = Math.min(255, tone[1] * f);
    d[k + 2] = Math.min(255, tone[2] * f);
    d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(out, c);
  return out;
}

// Points for small lights along a tower: both edges of its outline and its middle every ~40 px of height
// ({ px, py }), and its top ({ px, py, top: true }). In the picture's own pixels; made once per picture.
const towerCache = new Map();
export function towerLightPoints(scene, key, def) {
  if (towerCache.has(key)) return towerCache.get(key);
  const src = scene.textures.get(key).getSourceImage();
  const W = src.width;
  const H = src.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;
  const sc = W / ((def.w + def.d) * 64);
  const row = (y) => {
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 0) {
      if (x0 < 0) x0 = x;
      x1 = x;
    }
    return [x0, x1];
  };
  const solid = (x, y) => d[(y * W + Math.round(x)) * 4 + 3] > 0;
  const pts = [];
  let top = 0;
  while (top < H && row(top)[0] < 0) top++;
  if (top < H) {
    const [a, b] = row(top);
    pts.push({ px: (a + b) / 2, py: top, top: true });
  }
  const ground = H - (def.w + def.d) * 32 * sc; // the footprint's back corner: below that is the base
  for (let y = Math.round(top + 24 * sc); y < ground - 16 * sc; y = Math.round(y + 40 * sc)) {
    const [a, b] = row(y);
    if (a < 0) continue;
    pts.push({ px: a + 1, py: y });
    if (b - a > 6 * sc) pts.push({ px: b - 1, py: y });
    const mid = (a + b) / 2;
    if (b - a > 30 * sc && solid(mid, y)) pts.push({ px: mid, py: y });
  }
  towerCache.set(key, pts);
  return pts;
}
