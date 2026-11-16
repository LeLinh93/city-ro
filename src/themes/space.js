// The "space" theme: a city on the moon. Its buildings are the images in
// assets/building-space/<Menu>/<name>-<W>x<D>.png (see city.js for what the settings below mean).
//
// world: how the map itself looks and behaves (see src/themes/catalog.js, themeWorld):
//   look      : 'space' = moon rock instead of grass and sand, lava instead of water, white pavement, neon roads,
//               people in astronaut helmets and a black sky with stars (src/art/space.js)
//   beach     : false = no sand between the land and the lava on a new map
//   dayNight  : false = always day: no clock, no night lights
//   weather   : false = it never rains
//   rail      : false = no railways in the Road menu
//   disasters : the disasters in the Disaster menu that this theme doesn't have
//
// Vehicles: every car on the roads is a space hover car. The police, fire and hospital stations send rovers and
// spaceplanes (like the city's cars and helicopters). Settings that only the space theme has:
//   pads   : landing pads, [{ px, py }] in the picture's own pixels (the middle of each pad), and the ships that
//            land straight down on them, wait a while and take off straight up (src/agents/Airports.js)
//   tank   : the tank it sends against monsters, like the city's military base (src/agents/Military.js)
//   warplanes : the planes the military airport sends against monsters (src/agents/Military.js)
//   turret : a big laser gun; px, py = the end of its barrels in the picture's own pixels (src/agents/Military.js)
//   fleet  : a ship that flies round the map (src/agents/Skyships.js); against monsters it fires rockets and sends
//            its interceptors (src/agents/Military.js)
//   mine   : a mining drone parked on the pad (px, py in the picture's own pixels) flies to rocks with blue crystals
//            floating on the lava, breaks them up, and brings the crystals home (src/agents/Skyships.js)

export const SPACE = {
  id: 'space',
  name: 'Space',

  world: {
    look: 'space',
    beach: false,
    dayNight: false,
    weather: false,
    rail: false,
    noDisasters: ['tsunami'],
  },

  menus: {
    House: { icon: '🏠', people: 3, attract: 1 },
    Shop: { icon: '🏪', people: 1.5, attract: 3 },
    Service: { icon: '🏥', people: 1.5, attract: 2 },
    Production: { icon: '🏭', people: 1.5, attract: 1 },
    Recreation: { icon: '🎡', people: 1.5, attract: 3 },
    Landmark: { icon: '🗼', people: 1, attract: 4 },
    Decoration: { icon: '🌵', people: 0, attract: 0, door: false, paint: true },
    Transport: { icon: '🚀', people: 2, attract: 2 },
  },

  names: {
    holobush: 'Holo bush',
    holotree: 'Holo tree',
    lamppost: 'Lamp post',
    earthhologram: 'Earth hologram',
    tvtower: 'TV tower',
    foodfactory: 'Food factory',
    mineralmine: 'Mineral mine',
    oxygenfactory: 'Oxygen factory',
    waterfactory: 'Water factory',
    baseballstadium: 'Baseball stadium',
    footballstadium: 'Football stadium',
    soccerstadium: 'Soccer stadium',
    zoocage_beast: 'Beast cage',
    zoocage_crystal: 'Crystal cage',
    zoocage_grazer: 'Grazer cage',
    zoocage_jelly: 'Jelly cage',
    zoocage_lizard: 'Lizard cage',
    zoocage_slime: 'Slime cage',
    commandcenter: 'Command center',
    firestation: 'Fire station',
    militaryairport: 'Military airport',
    militaryhangar: 'Military hangar',
    militaryport: 'Military port',
    policestation: 'Police station',
    spaceturret: 'Space turret',
    burgerrestaurant: 'Burger restaurant',
    friedchicken: 'Fried chicken',
    hotdogshop: 'Hot dog shop',
    icecreamshop: 'Ice cream shop',
    noodlerestaurant: 'Noodle restaurant',
    pizzashop: 'Pizza shop',
    souvenirstore: 'Souvenir store',
    spaceairport: 'Space airport',
  },

  buildings: {
    mountain: { lights: false },
    policestation: {
      patrol: { vehicle: 'rover_police', count: 2, rest: [4000, 9000] },
      heli: { vehicle: 'spaceplane_police', pad: { px: 162, py: 143 }, job: 'spotlight', rest: [25000, 50000] },
    },
    hospital: {
      patrol: { vehicle: 'rover_hospital', count: 1, rest: [20000, 45000] },
      heli: { vehicle: 'spaceplane_hospital', pad: { px: 128, py: 154 }, job: 'tour', rest: [30000, 60000] },
    },
    firestation: {
      fire: { vehicle: 'rover_fire', radius: 12, every: [90000, 180000] },
      heli: { vehicle: 'spaceplane_fire', pad: { px: 143, py: 125 }, job: 'fire' },
    },
    spaceairport: {
      // the tower and the terminal stand up (ships on the pads go behind them); the rest is flat (see city.js, airport)
      apron: [8.8, 3.0],
      parts: [
        { x: 7.6, y: 3.9, w: 1.0, d: 1.0, h: 420, thin: true }, // tower
        { x: 6.2, y: 6.5, w: 3.2, d: 2.3, h: 95 }, // terminal
      ],
      pads: { at: [{ px: 643, py: 325 }, { px: 353, py: 467 }, { px: 928, py: 465 }], ships: ['transportship', 'armoredtransport'] },
    },
    militaryairport: {
      pads: { at: [{ px: 645, py: 370 }, { px: 353, py: 497 }, { px: 920, py: 495 }], ships: ['fighter3'] },
      warplanes: ['fighter3'],
    },
    militaryhangar: { patrol: { vehicle: 'space_tank', count: 1, rest: [8000, 18000], speed: 0.7 }, tank: 'space_tank' },
    spaceturret: { turret: { px: 318, py: 196 } },
    militaryport: { fleet: { ship: 'battleship' } },
    mineralmine: { mine: { px: 385, py: 412 } },
  },
};
