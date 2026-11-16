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
// Vehicles (police patrols, fire trucks, helicopters, the space airport's planes) come later, once their
// pictures are made; until then the city's cars drive on the roads.

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
  },
};
