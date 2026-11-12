// The kaiju (a disaster). Its pictures are 3 sheets in art-source/disaster/, each a grid of equal cells:
// 4 views across, facing (left to right) down-left (sw), down-right (se), up-right (ne), up-left (nw),
// and one row per frame. The frames are already lined up with each other inside their cells.
// `npm run art` keeps the sw and ne views (se and nw are their mirror images, so the game flips those),
// shrinks them and writes assets/disaster/kaiju_sw.png and kaiju_ne.png: COLS frames across, in the order
// stand, walk 1-12, roar 1-4.
// This file is read by the game and by scripts/convert-art.mjs, so keep it plain data.

export const KAIJU = {
  sheets: [['kaiju-sheet.png', 1], ['kaiju-walk-sheet.png', 12], ['kaiju-roar-sheet.png', 4]], // [file, rows]
  cell: [1280, 1042], // px of one cell in the sheets
  column: { sw: 0, ne: 2 }, // which column of the sheets each kept view is
  scale: 0.65, // game px per sheet px
  cols: 5, // frames across in the game file
  // In sheet px inside a cell: the part kept (covering every frame), the ground point under the middle of its
  // body, and its mouth when roaring (where the beam comes out).
  box: { sw: [190, 10, 1280, 1032], ne: [70, 10, 1146, 960] },
  feet: { sw: [560, 880], ne: [840, 840] },
  mouth: { sw: [330, 250], ne: [1020, 150] },
};

export const KAIJU_FRAMES = { stand: 0, walk: 1, walkCount: 12, roar: 13, roarCount: 4 };
