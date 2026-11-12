// Ruined copies of building pictures, made in code the first time they are needed:
// the top part broken off along a jagged line, the rest blackened with soot, and rubble along the break.

const SOOT = [24, 18, 14];

// Random numbers that are the same every time for the same picture.
function seeded(text) {
  let h = 2166136261;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// key: the building's texture; def: its building settings (w, d, parts).
export function ruinTexture(scene, key, def) {
  const out = `${key}#ruin`;
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
  const orig = new Uint8ClampedArray(d);
  const rnd = seeded(key);
  const at = (x, y) => (y * W + x) * 4;

  // How tall the standing part is: everything above the top corner of the footprint.
  const scale = W / ((def.w + def.d) * 64);
  const ground = (def.w + def.d) * 32 * scale;
  const standing = H - ground;
  const flat = def.parts || standing < 24; // mostly flat pictures (airport, parks) only get burnt

  // The jagged break: a random walk with a few deep notches.
  const cut = new Float32Array(W);
  const base = flat ? -1 : standing * (0.4 + rnd() * 0.25);
  let walk = 0;
  for (let x = 0; x < W; x++) {
    walk += (rnd() - 0.5) * 5;
    walk = Math.max(-14, Math.min(14, walk));
    cut[x] = base + walk;
  }
  if (!flat) {
    for (let n = 0; n < 3; n++) {
      const cx = rnd() * W;
      const depth = 10 + rnd() * 18;
      const half = 6 + rnd() * 14;
      for (let x = Math.max(0, Math.floor(cx - half)); x < Math.min(W, cx + half); x++) {
        cut[x] += depth * (1 - Math.abs(x - cx) / half);
      }
    }
  }

  // Soot streaks running down from the break.
  const streak = new Float32Array(W);
  for (let x = 0; x < W; x++) if (rnd() < 0.12) streak[x] = 10 + rnd() * standing * 0.5;
  for (let x = 1; x < W; x++) if (!streak[x] && streak[x - 1] && rnd() < 0.6) streak[x] = streak[x - 1] * 0.9;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = at(x, y);
      if (!d[k + 3]) continue;
      if (y < cut[x]) {
        d[k + 3] = 0;
        continue;
      }
      const below = y - Math.max(0, cut[x]);
      let burn = 0.22 + 0.55 * Math.max(0, 1 - below / Math.max(30, standing * 0.6));
      if (flat) burn = 0.3 + 0.25 * rnd();
      if (streak[x] && below < streak[x]) burn += 0.3 * (1 - below / streak[x]);
      if (rnd() < 0.05) burn += 0.25; // specks of soot
      burn = Math.min(0.9, burn);
      for (let ch = 0; ch < 3; ch++) d[k + ch] = d[k + ch] * (1 - burn) + SOOT[ch] * burn;
    }
  }

  // Rubble: broken bits on top of the break, in the building's own (darkened) colours.
  const lump = (x0, y0, r) => {
    const sx = Math.min(W - 1, Math.max(0, x0));
    const sy = Math.min(H - 1, Math.max(0, Math.round(y0 - 6)));
    const sk = at(sx, sy);
    const dark = 0.35 + rnd() * 0.4;
    const col = orig[sk + 3] ? [0, 1, 2].map((ch) => orig[sk + ch] * (1 - dark) + SOOT[ch] * dark) : SOOT;
    for (let y = Math.floor(y0 - r); y <= y0; y++) {
      for (let x = Math.floor(x0 - r); x <= x0 + r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (Math.abs(x - x0) + (y0 - y) * 1.4 > r) continue;
        const k = at(x, y);
        d[k] = col[0];
        d[k + 1] = col[1];
        d[k + 2] = col[2];
        d[k + 3] = 255;
      }
    }
  };
  if (!flat) {
    for (let x = 2; x < W - 2; x += 2 + Math.floor(rnd() * 3)) {
      // only where the building continues below the break
      let y = Math.ceil(Math.max(0, cut[x]));
      while (y < H && !d[at(x, y) + 3]) y++;
      if (y >= H || y - cut[x] > 6) continue;
      lump(x, y + 1, 1 + rnd() * 3);
    }
  }

  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(out, c);
  return out;
}
