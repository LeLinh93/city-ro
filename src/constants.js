// Core sizes. One grid square is a 128 x 64 px isometric diamond.
export const TILE_W = 128;
export const TILE_H = 64;
export const HW = TILE_W / 2; // 64
export const HH = TILE_H / 2; // 32

export const MAP_SIZE = 100;

// Whole-number zoom levels keep pixel art crisp (0.25 / 0.5 are the overview levels).
export const ZOOM_STEPS = [0.25, 0.5, 1, 2, 3];

// Draw order. Objects that stand on the map (trees, buildings, people, cars)
// use depth = gridX + gridY of their base, which is between 0 and ~200.
export const DEPTH = {
  GROUND: -100000,
  EDGE: -99990,
  ROAD: -99980,
  ROAD_ARM: -99979,
  BASE: -99970, // flat building parts, e.g. the airport runway
  SHADOW: -99960,
  OUTLINE: -99950,
  AIR: 100000, // flying planes, smoke
  GHOST: 200000,
};

export const GROUND = { WATER: 0, SAND: 1, GRASS: 2 };
export const GROUND_NAMES = ['water', 'sand', 'grass'];

// Sides of a square, named by where they point on screen.
// ne = up-right, se = down-right, sw = down-left, nw = up-left.
export const SIDES = {
  ne: { dx: 0, dy: -1, bit: 1 },
  se: { dx: 1, dy: 0, bit: 2 },
  sw: { dx: 0, dy: 1, bit: 4 },
  nw: { dx: -1, dy: 0, bit: 8 },
};
export const SIDE_LIST = ['ne', 'se', 'sw', 'nw'];

export const SPEED = {
  person: 0.55, // squares per second
  car: 1.5,
  police: 1.8,
};

// Lateral offsets from the road centre line, in squares. Right-hand traffic.
export const LANE_OFFSET = 0.17;
export const SIDEWALK_OFFSET = 0.43;
