import { GROUND } from '../constants.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// A* for people (prefers sidewalks, can cut across grass and sand)
// and breadth-first search for vehicles (roads only).
export class Pathfinder {
  constructor(world) {
    this.w = world;
    const n = world.size * world.size;
    this.g = new Float32Array(n);
    this.came = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.stamp = 0;
    this.heapK = new Int32Array(n * 4);
    this.heapF = new Float32Array(n * 4);
  }

  cost(k) {
    const w = this.w;
    if (w.road[k]) return 1;
    let c = w.ground[k] === GROUND.SAND ? 2.4 : 2.2;
    if (w.tree[k]) c += 1;
    return c;
  }

  walkPath(start, goal, maxNodes = 9000) {
    const w = this.w;
    const N = w.size;
    if (!w.walkable(...start) || !w.walkable(...goal)) return null;
    const s = this.stamp = (this.stamp + 1) >>> 0;
    const sk = start[1] * N + start[0];
    const gk = goal[1] * N + goal[0];
    let size = 0;
    const push = (k, f) => {
      let i = size++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.heapF[p] <= f) break;
        this.heapF[i] = this.heapF[p];
        this.heapK[i] = this.heapK[p];
        i = p;
      }
      this.heapF[i] = f;
      this.heapK[i] = k;
    };
    const pop = () => {
      const top = this.heapK[0];
      const lastF = this.heapF[--size];
      const lastK = this.heapK[size];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= size) break;
        if (c + 1 < size && this.heapF[c + 1] < this.heapF[c]) c++;
        if (this.heapF[c] >= lastF) break;
        this.heapF[i] = this.heapF[c];
        this.heapK[i] = this.heapK[c];
        i = c;
      }
      this.heapF[i] = lastF;
      this.heapK[i] = lastK;
      return top;
    };
    const h = (i, j) => Math.abs(i - goal[0]) + Math.abs(j - goal[1]);
    this.g[sk] = 0;
    this.seen[sk] = s;
    this.came[sk] = -1;
    push(sk, h(start[0], start[1]));
    let expanded = 0;
    while (size > 0 && size < this.heapK.length - 4) {
      const k = pop();
      if (this.closed[k] === s) continue;
      this.closed[k] = s;
      if (k === gk) return this.trace(gk);
      if (++expanded > maxNodes) return null;
      const i = k % N;
      const j = (k / N) | 0;
      for (const [dx, dy] of DIRS) {
        const a = i + dx;
        const b = j + dy;
        if (!w.walkable(a, b)) continue;
        const nk = b * N + a;
        if (this.closed[nk] === s) continue;
        const ng = this.g[k] + this.cost(nk);
        if (this.seen[nk] !== s || ng < this.g[nk]) {
          this.seen[nk] = s;
          this.g[nk] = ng;
          this.came[nk] = k;
          push(nk, ng + h(a, b));
        }
      }
    }
    return null;
  }

  roadPath(start, goal, maxNodes = 12000) {
    if (!this.w.isRoad(...goal)) return null;
    const gk = goal[1] * this.w.size + goal[0];
    return this.roadPathTo(start, (k) => k === gk, maxNodes);
  }

  // Shortest road path from start to the nearest road square k where isGoal(k) is true.
  roadPathTo(start, isGoal, maxNodes = 12000) {
    const w = this.w;
    const N = w.size;
    if (!w.isRoad(...start)) return null;
    const s = this.stamp = (this.stamp + 1) >>> 0;
    const sk = start[1] * N + start[0];
    const queue = [sk];
    this.seen[sk] = s;
    this.came[sk] = -1;
    for (let q = 0; q < queue.length && q < maxNodes; q++) {
      const k = queue[q];
      if (isGoal(k)) return this.trace(k);
      const i = k % N;
      const j = (k / N) | 0;
      for (const [dx, dy] of DIRS) {
        const a = i + dx;
        const b = j + dy;
        if (!w.isRoad(a, b)) continue;
        const nk = b * N + a;
        if (this.seen[nk] === s) continue;
        this.seen[nk] = s;
        this.came[nk] = k;
        queue.push(nk);
      }
    }
    return null;
  }

  trace(k) {
    const N = this.w.size;
    const out = [];
    while (k !== -1) {
      out.push([k % N, (k / N) | 0]);
      k = this.came[k];
    }
    return out.reverse();
  }
}
