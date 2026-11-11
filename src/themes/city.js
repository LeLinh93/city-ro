// The "city" theme. Its buildings are the images in assets/building-city/<Menu>/<name>-<W>x<D>.png:
// every folder becomes a button in the build bar, every image a building in that button's menu.
// This file only adds what a picture can't say: icons, nicer names, doors, and special behaviour.

export const CITY = {
  id: 'city',
  name: 'City',

  // Build bar buttons, in this order. Folders not listed here come after, with a 📦 icon.
  // people  : how many people walk out per minute (multiplied by the square root of the area)
  // attract : how popular the building is as a place to walk to (0 = nobody walks there)
  // door    : false = nobody goes in or out (decorations)
  menus: {
    House: { icon: '🏠', people: 3, attract: 1 },
    Shop: { icon: '🏪', people: 1.5, attract: 3 },
    Service: { icon: '🏥', people: 1.5, attract: 2 },
    Factory: { icon: '🏭', people: 1.5, attract: 1 },
    Landmark: { icon: '🗼', people: 1, attract: 4 },
    Decoration: { icon: '🌳', people: 0, attract: 0, door: false },
    Transport: { icon: '✈️', people: 2, attract: 2 },
  },

  // Names shown under the pictures. Anything not listed is made from the file name.
  names: {
    parkbench: 'Park bench',
    parkfountain: 'Fountain',
    parkgazebo: 'Gazebo',
    parkstatue: 'Statue',
    tree1: 'Oak tree',
    tree2: 'Pine tree',
    tree3: 'Cherry tree',
    eiffeltower: 'Eiffel Tower',
    shanghaitower: 'Shanghai Tower',
    skytree: 'Sky Tree',
    tokyotower: 'Tokyo Tower',
    firestation: 'Fire station',
    highschool: 'High school',
    clothesstore: 'Clothes store',
  },

  // Extra settings for single buildings, by file name (without the size).
  // Squares are counted from the building's top corner: x runs down-right, y runs down-left.
  // door / garage: { x, y, side } where side is ne, se, sw or nw. The default door is in the
  // middle of the front-left (sw) face.
  buildings: {
    police: {
      garage: { x: 1, y: 1, side: 'se' }, // police cars drive in and out here
      vehicles: 2,
    },
    airport: {
      door: { x: 9, y: 7, side: 'se' },
      // Parts of the picture that stand up from the ground (terminals, tower), as boxes:
      // x, y, w, d in squares, h in pixels. Planes can go behind these; everything else is flat.
      parts: [
        { x: 2.6, y: 6.7, w: 2.8, d: 0.75, h: 58 },
        { x: 5.65, y: 6.75, w: 0.5, d: 0.5, h: 125 },
        { x: 6.5, y: 6.45, w: 2.95, d: 0.95, h: 50 },
      ],
      // Where planes go (squares). They land along the runway towards +x, leave it at exitX,
      // taxi along the taxiway to a parking spot, and later take off from takeoffStartX.
      airport: {
        runway: { centerY: 2.65 },
        taxiway: { centerY: 3.25 },
        spots: [{ x: 3.0, y: 4.9 }, { x: 5.9, y: 4.9 }, { x: 8.6, y: 4.9 }],
        touchdownX: 0.8,
        exitX: 8.8,
        takeoffStartX: 2.4,
      },
    },
  },
};
