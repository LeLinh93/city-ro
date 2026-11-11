// Building definitions. Edit this file when you add or change buildings.
//
// Coordinates are in squares, relative to the building's own top corner, before rotation:
//   x runs down-right on screen (w squares), y runs down-left on screen (d squares).
//   z is height in pixels above the ground.
//
// image     : file name in public/assets/buildings/ (without .png). Optional <image>_r.png = rotated art.
// base      : optional flat ground image drawn under everything (e.g. the airport runway).
// solid     : part of the footprint that is tall (used for front/behind sorting). Default: whole footprint.
// door      : square + side people walk in and out of. side is ne, se, sw or nw.
// garage    : square + side vehicles drive in and out of.
// smoke     : chimney tops (x, y in squares, z in px).
// people    : how many people come out per minute.
// attract   : how popular it is as a destination.
// placeholder: the stand-in art drawn by code until your image exists.

export const BUILDINGS = {
  house: {
    name: 'House',
    icon: '🏠',
    w: 1,
    d: 1,
    image: 'house',
    door: { x: 0, y: 0, side: 'sw' },
    smoke: [{ x: 0.33, y: 0.33, z: 62 }],
    people: 3,
    attract: 1,
    placeholder: {
      boxes: [
        { x0: 0.12, y0: 0.12, x1: 0.88, y1: 0.88, z0: 0, z1: 38, color: 0xe8d8b0, windows: { per: 3, floor: 18, h: 9, start: 12 } },
        { x0: 0.06, y0: 0.06, x1: 0.94, y1: 0.94, z0: 38, z1: 46, color: 0xc0503a },
        { x0: 0.26, y0: 0.26, x1: 0.4, y1: 0.4, z0: 46, z1: 60, color: 0x8a5a44 },
      ],
    },
  },

  longhouse: {
    name: 'Long house',
    icon: '🏡',
    w: 2, // long side runs down-right
    d: 1,
    image: 'longhouse',
    door: { x: 1, y: 0, side: 'sw' },
    smoke: [{ x: 0.38, y: 0.5, z: 58 }],
    people: 4,
    attract: 1,
    placeholder: {
      boxes: [
        { x0: 0.1, y0: 0.1, x1: 1.9, y1: 0.9, z0: 0, z1: 34, color: 0xb8d0e0, windows: { per: 3, floor: 18, h: 9, start: 10 } },
        { x0: 0.04, y0: 0.04, x1: 1.96, y1: 0.96, z0: 34, z1: 42, color: 0x4a6a9a },
        { x0: 0.3, y0: 0.42, x1: 0.46, y1: 0.58, z0: 42, z1: 56, color: 0x8a5a44 },
      ],
    },
  },

  skyscraper: {
    name: 'Skyscraper',
    icon: '🏙️',
    w: 4,
    d: 4,
    image: 'skyscraper',
    door: { x: 1, y: 3, side: 'sw' },
    people: 12,
    attract: 3,
    placeholder: {
      boxes: [
        { x0: 0.2, y0: 0.2, x1: 3.8, y1: 3.8, z0: 0, z1: 34, color: 0x9aa4b0, windows: { per: 4, floor: 34, h: 16, start: 6 } },
        { x0: 0.6, y0: 0.6, x1: 3.4, y1: 3.4, z0: 34, z1: 400, color: 0x6a8fb0, windows: { per: 5, floor: 16, h: 9, start: 40, lit: 0.25 } },
        { x0: 1.2, y0: 1.2, x1: 2.8, y1: 2.8, z0: 400, z1: 428, color: 0x50606e },
        { x0: 1.92, y0: 1.92, x1: 2.08, y1: 2.08, z0: 428, z1: 480, color: 0xd0d0d0 },
      ],
    },
  },

  police: {
    name: 'Police',
    icon: '🚓',
    w: 4,
    d: 4,
    image: 'police',
    door: { x: 1, y: 3, side: 'sw' },
    garage: { x: 3, y: 2, side: 'se' },
    vehicles: 2,
    people: 3,
    attract: 1,
    placeholder: {
      boxes: [
        {
          x0: 0.15, y0: 0.15, x1: 3.85, y1: 3.85, z0: 0, z1: 70, color: 0xdfe6ee,
          windows: { per: 4, floor: 22, h: 10, start: 26 },
          stripe: { z0: 52, z1: 57, color: 0x2d4f9e },
        },
        { x0: 0.1, y0: 0.1, x1: 3.9, y1: 3.9, z0: 70, z1: 78, color: 0x2d4f9e },
        { x0: 1.6, y0: 1.6, x1: 2.4, y1: 2.4, z0: 78, z1: 92, color: 0x2d4f9e },
      ],
    },
  },

  airport: {
    name: 'Airport',
    icon: '✈️',
    w: 10,
    d: 10,
    image: 'airport',
    base: 'airport_base',
    solid: { x: 3, y: 0, w: 7, d: 3 },
    door: { x: 9, y: 1, side: 'se' },
    people: 10,
    attract: 3,
    // Everything planes need, in the airport's own squares (before rotation).
    airport: {
      runway: { y0: 8, y1: 10, centerY: 9 },
      taxiway: { y0: 6.5, y1: 7.5, centerY: 7 },
      connectors: [{ x0: 0, x1: 1 }, { x0: 6, x1: 7 }],
      apron: { x0: 2.6, y0: 3, x1: 10, y1: 6.5 },
      spots: [{ x: 3.9, y: 4.6 }, { x: 6.3, y: 4.6 }, { x: 8.7, y: 4.6 }],
      touchdownX: 0.8,
      exitX: 6.5,
      takeoffStartX: 0.5,
    },
    placeholder: {
      boxes: [
        {
          x0: 3.1, y0: 0.15, x1: 9.95, y1: 2.9, z0: 0, z1: 48, color: 0xd8dde3,
          windows: { per: 3, floor: 48, h: 26, start: 12, color: 0x6fb7e8 },
        },
        { x0: 3.05, y0: 0.1, x1: 9.98, y1: 2.95, z0: 48, z1: 54, color: 0x8a96a3 },
        { x0: 3.4, y0: 0.4, x1: 3.9, y1: 0.9, z0: 54, z1: 150, color: 0xc9ced4 },
        { x0: 3.25, y0: 0.25, x1: 4.05, y1: 1.05, z0: 150, z1: 172, color: 0x6fb7e8 },
        { x0: 3.2, y0: 0.2, x1: 4.1, y1: 1.1, z0: 172, z1: 178, color: 0x50606e },
      ],
    },
  },
};

// Order of buttons in the toolbar.
export const BUILDING_ORDER = ['house', 'longhouse', 'skyscraper', 'police', 'airport'];
