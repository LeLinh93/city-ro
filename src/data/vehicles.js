// Vehicle pictures. Each one is a sheet in art-source/vehicles/ with 4 views side by side (with empty space between),
// facing (left to right): down-left (sw), down-right (se), up-right (ne), up-left (nw).
// `npm run art` cuts the views out, shrinks them, and writes assets/vehicles/<id>.png: 4 frames of equal size
// with the point under the middle of the vehicle exactly in the middle of each frame.
//
// width  : width in game pixels of the widest view (one map square is 128 px wide)
// ground : where the vehicle touches the ground, as a part of the view's width measured up from its bottom
//          (0.25 suits cars and ships), or 'center' for the middle of the picture (planes)
// anchor : instead of ground, the point under the middle of the body in each view, as [x, y] parts of the
//          view's width and height from its top left (for helicopters, whose tail and rotor make the
//          picture lopsided)
// This file is read by the game and by scripts/convert-art.mjs, so keep it plain data.

export const VIEWS = ['sw', 'se', 'ne', 'nw'];

// Helicopters: a little above the middle of the skids, under the cabin.
const HELI = [[0.44, 0.77], [0.56, 0.77], [0.76, 0.64], [0.24, 0.64]];

export const VEHICLES = {
  car_blue: { sheet: 'car-sheet-blue.png', width: 50 },
  car_green: { sheet: 'car-sheet-green.png', width: 50 },
  car_red: { sheet: 'car-sheet-red.png', width: 50 },
  car_white: { sheet: 'car-sheet-white.png', width: 50 },
  car_yellow: { sheet: 'car-sheet-yellow.png', width: 50 },
  police: { sheet: 'police-sheet.png', width: 50 },
  ambulance: { sheet: 'ambulance-sheet.png', width: 65 },
  firetruck: { sheet: 'firetruck-sheet.png', width: 79 },
  taxi: { sheet: 'taxi-sheet.png', width: 50 },
  mailvan: { sheet: 'mailvan-sheet.png', width: 60 },
  garbagetruck: { sheet: 'garbagetruck-sheet.png', width: 72 },
  bus: { sheet: 'bus-sheet.png', width: 88 },
  heli_police: { sheet: 'helicopter-sheet-police.png', width: 96, anchor: HELI },
  heli_fire: { sheet: 'helicopter-sheet-fire.png', width: 96, anchor: HELI },
  heli_hospital: { sheet: 'helicopter-sheet-hospital.png', width: 96, anchor: HELI },
  airplane: { sheet: 'airplane-sheet.png', width: 200, ground: 'center' },
  containership: { sheet: 'containership-sheet.png', width: 352 },
  cruiseship: { sheet: 'cruiseship-sheet.png', width: 320 },
  // farm and military
  tractor: { sheet: 'tractor-sheet.png', width: 52 },
  tank: { sheet: 'tank-sheet.png', width: 66 },
  militarytruck: { sheet: 'militarytruck-sheet.png', width: 68 },
  heli_military: { sheet: 'militaryhelicopter-sheet.png', width: 96, anchor: HELI },
  fighterjet: { sheet: 'fighterjet-sheet.png', width: 130, ground: 'center' },
  bomber: { sheet: 'bomber-sheet.png', width: 240, ground: 'center' },
  destroyer: { sheet: 'destroyer-sheet.png', width: 320 },
  aircraftcarrier: { sheet: 'aircraftcarrier-sheet.png', width: 440 },
  // the UFO (a disaster): 6 squares wide
  ufo: { sheet: 'disaster/mothership-sheet.png', width: 768, ground: 'center' },
};

// Random traffic picks from these.
export const CARS = ['car_blue', 'car_green', 'car_red', 'car_white', 'car_yellow'];
