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
  // paint   : true = pick one and tap or drag to put them down straight away, like the Plot tool
  menus: {
    House: { icon: '🏠', people: 3, attract: 1 },
    Shop: { icon: '🏪', people: 1.5, attract: 3 },
    Service: { icon: '🏥', people: 1.5, attract: 2 },
    Factory: { icon: '🏭', people: 1.5, attract: 1 },
    Landmark: { icon: '🗼', people: 1, attract: 4 },
    Decoration: { icon: '🌳', people: 0, attract: 0, door: false, paint: true },
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
    taxicenter: 'Taxi center',
    busstop: 'Bus stop',
    postoffice: 'Post office',
    recycleplant: 'Recycling plant',
    nuclearreactor: 'Nuclear plant',
  },

  // Extra settings for single buildings, by file name (without the size).
  // Squares are counted from the building's top corner: x runs down-right, y runs down-left.
  // door / garage: { x, y, side } where side is ne, se, sw or nw. The default door is in the
  // middle of the front-left (sw) face.
  //
  // Vehicles (pictures in src/data/vehicles.js):
  // patrol    : cars that leave the garage (or the door), drive around and come back.
  //             count = how many at once, rest = [min, max] ms at home between trips, speed = faster/slower.
  // heli      : helicopter parked on the roof. pad = the middle of the H in the picture's own pixels;
  //             job = 'spotlight' (shines a light on a building), 'tour' (short flight) or 'fire' (puts out fires).
  // fire      : now and then a building within `radius` squares catches fire; the station sends its
  //             helicopter and its truck (`vehicle`). every = [min, max] ms between fires.
  // nearWater : can only be built touching water.   dock: the ship that sails from here.
  buildings: {
    police: {
      garage: { x: 1, y: 1, side: 'se' },
      patrol: { vehicle: 'police', count: 2, rest: [4000, 9000] },
      heli: { vehicle: 'heli_police', pad: { px: 122, py: 32 }, job: 'spotlight', rest: [25000, 50000] },
    },
    hospital: {
      patrol: { vehicle: 'ambulance', count: 1, rest: [20000, 45000] },
      heli: { vehicle: 'heli_hospital', pad: { px: 122, py: 32 }, job: 'tour', rest: [30000, 60000] },
    },
    firestation: {
      garage: { x: 0, y: 1, side: 'sw' },
      fire: { vehicle: 'firetruck', radius: 12, every: [90000, 180000] },
      heli: { vehicle: 'heli_fire', pad: { px: 124, py: 51 }, job: 'fire' },
    },
    taxicenter: { patrol: { vehicle: 'taxi', count: 3, rest: [3000, 8000], speed: 1.1 } },
    busstop: { patrol: { vehicle: 'bus', count: 1, rest: [6000, 14000], speed: 0.8 } },
    postoffice: { patrol: { vehicle: 'mailvan', count: 2, rest: [8000, 20000] } },
    recycleplant: { patrol: { vehicle: 'garbagetruck', count: 2, rest: [10000, 25000], speed: 0.75 } },
    // chimneys: { px, py } = the top of the chimney in the picture's own pixels
    factory: { smoke: [{ px: 96, py: 63 }, { px: 163, py: 43 }] },
    nuclearreactor: { smoke: [{ px: 110, py: 74, big: true }] },
    dockpassenger: { nearWater: true, dock: { ship: 'cruiseship' } },
    dockshipment: { nearWater: true, dock: { ship: 'containership' } },
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
        spots: [{ x: 3.0, y: 4.2 }, { x: 5.9, y: 4.2 }, { x: 8.6, y: 4.2 }], // far enough out that the terminals don't hide the noses
        touchdownX: 0.8,
        exitX: 8.8,
        takeoffStartX: 2.4,
      },
    },
  },
};
