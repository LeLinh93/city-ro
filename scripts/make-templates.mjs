// Writes every placeholder image to templates/ with the exact file name and size the game expects.
// Use them as guides (or img2img inputs) for your own art, then put finished files in assets/.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePNG } from '../src/art/raster.js';
import {
  genGround, genEdge, genRoadCenter, genRoadArm, genTree, genBuilding, genAirportBase,
  genPerson, genCar, genPlane, genPuff, genDust,
} from '../src/art/placeholders.js';
import { BUILDINGS } from '../src/data/buildings.js';

const out = (path, pix) => {
  const dir = path.split('/').slice(0, -1).join('/');
  mkdirSync(`templates/${dir}`, { recursive: true });
  writeFileSync(`templates/${path}`, encodePNG(pix, deflateSync));
  console.log(`templates/${path}  ${pix.w}x${pix.h}`);
};

for (let i = 0; i < 2; i++) {
  out(`ground/grass_${i}.png`, genGround('grass', i));
  out(`ground/sand_${i}.png`, genGround('sand', i));
  out(`ground/water_${i}.png`, genGround('water', i, 4));
}
for (const p of ['ne', 'se', 'sw', 'nw', 'n', 'e', 's', 'w']) {
  out(`ground/edge_grass_${p}.png`, genEdge('grass', p));
  out(`ground/edge_foam_${p}.png`, genEdge('foam', p));
}
out('roads/road_center.png', genRoadCenter());
for (const s of ['ne', 'se', 'sw', 'nw']) out(`roads/road_arm_${s}.png`, genRoadArm(s));
for (let i = 0; i < 4; i++) out(`trees/tree_${i}.png`, genTree(i));
for (const def of Object.values(BUILDINGS)) {
  out(`buildings/${def.image}.png`, genBuilding(def));
  if (def.base) out(`buildings/${def.base}.png`, genAirportBase(def));
}
for (let i = 0; i < 2; i++) out(`people/person_${i}.png`, genPerson(i));
out('vehicles/car_0.png', genCar(0));
out('vehicles/police_car.png', genCar(0, true));
out('vehicles/plane_0.png', genPlane(0));
out('fx/smoke.png', genPuff());
out('fx/dust.png', genDust());
