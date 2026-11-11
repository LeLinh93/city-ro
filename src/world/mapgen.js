import { GROUND } from '../constants.js';
import { mulberry32, fbm } from '../rng.js';

// Random island: water around the edge, a beach ring and grass inside.
// (tree / tjx / tjy are kept for old saves but stay empty: trees are now buildings you place.)
export function generateMap(size, seed) {
  const n = size * size;
  const ground = new Uint8Array(n);
  const gvar = new Uint8Array(n);
  const tree = new Uint8Array(n); // 0 = no tree, otherwise variant + 1
  const tjx = new Int8Array(n);
  const tjy = new Int8Array(n);
  const rnd = mulberry32(seed);

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      const nx = ((i + 0.5) / size) * 2 - 1;
      const ny = ((j + 0.5) / size) * 2 - 1;
      const d = Math.max(Math.abs(nx), Math.abs(ny)) * 0.45 + Math.sqrt(nx * nx + ny * ny) * 0.55;
      const e = fbm(i / 20, j / 20, seed, 5);
      let h = e * 0.9 + 0.62 - d * d * 1.35;
      const border = Math.min(i, j, size - 1 - i, size - 1 - j);
      if (border < 3) h = -1;
      ground[k] = h < 0.4 ? GROUND.WATER : h < 0.46 ? GROUND.SAND : GROUND.GRASS;
      gvar[k] = Math.floor(rnd() * 256);
    }
  }

  // Grass never touches water directly: there is always a beach in between.
  const toSand = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      if (ground[j * size + i] !== GROUND.GRASS) continue;
      let wet = false;
      for (let dj = -1; dj <= 1 && !wet; dj++) {
        for (let di = -1; di <= 1; di++) {
          const a = i + di;
          const b = j + dj;
          if (a < 0 || b < 0 || a >= size || b >= size) continue;
          if (ground[b * size + a] === GROUND.WATER) { wet = true; break; }
        }
      }
      if (wet) toSand.push(j * size + i);
    }
  }
  for (const k of toSand) ground[k] = GROUND.SAND;

  return { ground, gvar, tree, tjx, tjy };
}
