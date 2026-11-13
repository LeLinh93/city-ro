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
    Production: { icon: '🏭', people: 1.5, attract: 1 },
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
    cattlefarm: 'Cattle farm',
    wheatfield: 'Wheat field',
    militarybase: 'Military base',
    militaryairport: 'Military airport',
    militarydock: 'Military dock',
    militarycommand: 'Military command',
    missilesilo: 'Missile silo',
    townhall: 'Town hall',
    basketballcourt: 'Basketball court',
    futurelab: 'Future lab',
    nasa: 'Space center',
    rocketpad: 'Rocket pad',
    carshowroom: 'Car showroom',
    noodleshop: 'Noodle shop',
    carpark: 'Car park',
  },

  // Extra settings for single buildings, by file name (without the size).
  // Squares are counted from the building's top corner: x runs down-right, y runs down-left.
  // door / garage: { x, y, side } where side is ne, se, sw or nw. The default door is in the
  // middle of the front-left (sw) face.
  //
  // Vehicles (pictures in src/data/vehicles.js):
  // patrol    : cars that leave the garage (or the door), drive around and come back.
  //             count = how many at once, rest = [min, max] ms at home between trips, speed = faster/slower.
  //             vehicles = several kinds instead of one (a random one each trip); fields = see farm below.
  // heli      : helicopter parked on the roof (ground: true = on a pad on the ground). pad = the middle of the H in the picture's own pixels;
  //             job = 'spotlight' (shines a light on a building), 'tour' (short flight) or 'fire' (puts out fires).
  // fire      : now and then a building within `radius` squares catches fire; the station sends its
  //             helicopter and its truck (`vehicle`). every = [min, max] ms between fires.
  // nearWater : can only be built touching water.   dock: the ship that sails from here.
  //
  // Night (see src/world/DayNight.js):
  // lights    : how the building is lit at night (src/art/floodlight.js). Default: its front walls painted with
  //             warm light. 'ground' = spotlights shining up from the foot of the walls (tall landmarks,
  //             things without walls), 'base' = those but only lighting the bottom (towers),
  //             'spots' = those plus spotlights shining down from the top of the walls,
  //             'field' = the whole thing floodlit in white (stadiums), false = none
  // blinks    : true = small white lights twinkling at night along a tower, and a red one blinking on its top
  // yard      : floodlights on poles over a flat yard at night, { every: squares apart (2), pole: lamp height px (44) },
  //             or at chosen points: { lamps: [[x, y], ...], aim: [dx, dy] (where the light falls), size: squares }
  // glows     : lamps, [{ px, py, r, color }] in the picture's own pixels (r = size of the glow, default 16)
  // beacons   : blinking lights, [{ px, py, r, color }] in the picture's own pixels (red, r 8 by default)
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
    busstop: { patrol: { vehicle: 'bus', count: 1, rest: [6000, 14000], speed: 0.8 }, lights: 'ground' },
    postoffice: { patrol: { vehicle: 'mailvan', count: 2, rest: [8000, 20000] } },
    recycleplant: { patrol: { vehicle: 'garbagetruck', count: 2, rest: [10000, 25000], speed: 0.75 } },
    // chimneys: { px, py } = the top of the chimney in the picture's own pixels
    factory: { smoke: [{ px: 96, py: 63 }, { px: 163, py: 43 }] },
    nuclearreactor: { smoke: [{ px: 110, py: 74, big: true }] },
    // fields: a tractor that works the wheat fields (or else empty land) within `radius` squares,
    //         row by row, and drives home. With nothing to work nearby it drives around on the roads.
    farm: {
      patrol: { vehicle: 'tractor', count: 1, rest: [6000, 14000], speed: 0.45, fields: { radius: 8, crop: 'wheatfield' } },
    },
    // vehicles: several kinds take turns going out
    militarybase: { patrol: { vehicles: ['tank', 'militarytruck'], count: 2, rest: [6000, 15000], speed: 0.7 } },
    // Fighter jets use the short runway on the left, bombers the long inner runway, and the helicopter
    // parks on the H (ground: true = a pad on the ground, not a roof).
    // lanes: one per runway, each with its own planes. Only one plane of the airport moves at a time (they share
    // the taxiway). Points are squares from the building's top corner.
    //   landing : [touchdown, exit] along the runway   taxiIn : from the exit towards the spots
    //   spots   : parking spots, via = points on the way to the spot (and back)
    //   taxiOut : from the spots to the runway         takeoff : [start, lift off]; it climbs away beyond
    militaryairport: {
      lights: false, // no floodlit walls at night, only the blinking lights on the radar mast
      beacons: [{ px: 559, py: 274 }, { px: 596, py: 297 }, { px: 575, py: 325, color: 0xfff4dc, r: 6 }],
      // the apron shows between the hangars and around the tower, so its colour is cut out of every part
      apron: [6.0, 5.0],
      parts: [
        { x: 2.75, y: 6.5, w: 2.65, d: 0.9, h: 66, thin: true }, // hangar on the left
        { x: 5.4, y: 6.0, w: 1.0, d: 1.0, h: 150, thin: true }, // tower
        { x: 6.5, y: 6.5, w: 2.8, d: 0.9, h: 80, thin: true }, // hangar on the right
      ],
      heli: { vehicle: 'heli_military', pad: { px: 455, py: 475 }, ground: true, job: 'tour', rest: [20000, 40000] },
      lanes: [
        {
          plane: 'fighterjet',
          landing: [[0.65, 4.2], [0.65, 8.3]],
          taxiIn: [[1.6, 8.3], [1.6, 3.45]],
          spots: [{ x: 3.0, y: 4.4, via: [[3.0, 3.45]] }, { x: 4.2, y: 4.4, via: [[4.2, 3.45]] }],
          taxiOut: [[1.6, 3.45], [1.6, 5.0]],
          takeoff: [[0.65, 5.0], [0.65, 8.5]],
        },
        {
          plane: 'bomber',
          landing: [[1.0, 2.5], [9.1, 2.5]],
          taxiIn: [[9.1, 3.45]],
          spots: [{ x: 6.0, y: 4.5, via: [[6.0, 3.45]] }, { x: 8.3, y: 4.5, via: [[8.3, 3.45]] }],
          taxiOut: [[2.5, 3.45]],
          takeoff: [[2.5, 2.5], [8.0, 2.5]],
        },
      ],
    },
    // ships: several ships take turns at the berth and sail around the sea
    militarydock: { nearWater: true, dock: { ships: ['destroyer', 'aircraftcarrier'] }, lights: false },
    dockpassenger: { nearWater: true, dock: { ship: 'cruiseship' }, yard: { every: 2 } },
    dockshipment: { nearWater: true, dock: { ship: 'containership' }, yard: { every: 2 } },
    // the courtyard lit at night, and the glass pyramid glowing (squares; see src/art/floodlight.js)
    louvre: {
      inside: {
        floor: [1.0, 0.45, 3.1, 2.3],
        lamps: [[1.5, 0.9], [3.6, 0.9], [1.5, 2.3], [3.6, 2.3], [2.55, 0.75], [2.55, 2.45]],
        reach: 1.0,
        glow: { x: 2.54, y: 1.59, r: 52 },
      },
    },
    // rocket: a rocket stands on the pad (px, py = the middle of the ring, in the picture's own pixels), launches
    //         straight up into space and a new one is put on the pad after rest = [min, max] ms (src/agents/Rockets.js)
    rocketpad: { rocket: { px: 198, py: 142, rest: [25000, 45000] }, lights: false, beacons: [{ px: 287, py: 7 }] },
    antenna: { beacons: [{ px: 64, py: 3 }] },
    lantern: { glows: [{ px: 69, py: 33, color: 0xff6a3a }] },
    basketballcourt: { lights: 'field' },
    observatory: { lights: 'ground' },
    lamppost: { glows: [{ px: 53, py: 18 }, { px: 73, py: 24 }] },
    fujimountain: { lights: false },
    meijishrine: { lights: 'ground' },
    eiffeltower: { lights: 'base', blinks: true },
    empirestate: { lights: 'ground' },
    notredame: { lights: 'ground' },
    arcdetriomphe: { lights: 'ground' },
    brandenburgertor: { lights: 'ground' },
    tokyotower: { lights: 'base', blinks: true },
    skytree: { lights: 'base', blinks: true },
    shanghaitower: { lights: 'base', blinks: true },
    statueofliberty: { lights: 'ground' },
    colosseum: { lights: 'ground' },
    yankeesstadium: { lights: 'field' },
    baseballstadium: { lights: 'field' },
    footballstadium: { lights: 'field' },
    soccerstadium: { lights: 'field' },
    rollercoaster: { lights: 'ground' },
    ferriswheel: { lights: 'ground' },
    carousel: { lights: 'ground' },
    circustent: { lights: 'ground' },
    alligatorcage: { lights: 'ground' },
    giraffecage: { lights: 'ground' },
    gorillacage: { lights: 'ground' },
    lioncage: { lights: 'ground' },
    pandacage: { lights: 'ground' },
    sealenclosure: { lights: 'ground' },
    balloonstand: { lights: 'ground' },
    cottoncandystand: { lights: 'ground' },
    hotdogstand: { lights: 'ground' },
    parkinglot: { lights: 'ground' },
    airport: {
      door: { x: 9, y: 7, side: 'se' },
      // apron floodlights in front of the terminals, lighting where the planes park
      yard: { lamps: [[1.4, 5.9], [4.45, 5.9], [7.25, 5.6], [9.7, 5.6]], aim: [0, -1.2], size: 2.8 },
      apron: [5.9, 5.6], // a point on the apron (its colour is cut out of the tower's box, see parts)
      // Parts of the picture that stand up from the ground (terminals, tower), as boxes:
      // x, y, w, d in squares, h in pixels. Planes can go behind these; everything else is flat.
      parts: [
        { x: 2.6, y: 6.7, w: 2.8, d: 0.75, h: 58 },
        { x: 5.65, y: 6.75, w: 0.5, d: 0.5, h: 125, thin: true }, // thin: only the tower, not the ground in its box
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
