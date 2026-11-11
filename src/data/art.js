// Art files the game looks for in public/assets/. Any file that is missing
// is replaced by code-drawn placeholder art, so you can add files one by one.
// See ASSETS.md for sizes and drawing rules.

export const ART = {
  // How many numbered variants to look for (grass_0.png ... grass_3.png).
  // If you provide at least one file in a group, only your files are used.
  groundVariants: 4,
  personVariants: 5,
  carVariants: 4,
  planeVariants: 2,

  // Frame sizes for sprite sheets (columns = animation frames, rows = facings).
  water: { frameW: 128, frameH: 64 }, // water_N.png: frames side by side
  person: { frameW: 32, frameH: 48 },
  car: { frameW: 64, frameH: 48 },
  plane: { frameW: 384, frameH: 256 },

  // Where the ground point sits inside a vehicle frame (0..1).
  vehicleOrigin: { x: 0.5, y: 0.75 },
  planeOrigin: { x: 0.5, y: 0.75 },
};

export const ROAD_SIDES_ORDER = ['ne', 'se', 'sw', 'nw'];

// File name of a full road tile for a set of connected sides (bit mask).
export function roadTileName(mask) {
  if (mask === 0) return 'road_none';
  const parts = ROAD_SIDES_ORDER.filter((s, i) => mask & (1 << i));
  return 'road_' + parts.join('-');
}
