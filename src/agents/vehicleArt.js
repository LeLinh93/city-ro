// Sprites for vehicles. A vehicle drawn from a sheet (src/data/vehicles.js) has one frame per direction,
// with the ground point in the middle. Without its picture, the old code-drawn stand-in is used instead
// (two rows of frames, mirrored for the other two directions).
import { VIEWS } from '../data/vehicles.js';
import { sideFromDir, facingFor } from '../iso.js';

export const hasVehicle = (scene, id) => scene.textures.exists(`veh:${id}`);

// fallback: { key, origin: {x, y} } of the stand-in sprite sheet.
export function vehicleSprite(scene, id, fallback) {
  let v;
  if (hasVehicle(scene, id)) {
    v = { im: scene.add.image(0, 0, `veh:${id}`, 0).setOrigin(0.5, 0.5), four: true, perRow: 1 };
  } else {
    const tex = scene.textures.get(fallback.key);
    const im = scene.add.image(0, 0, fallback.key, 0).setOrigin(fallback.origin.x, fallback.origin.y);
    v = { im, four: false, perRow: Math.max(1, Math.floor((tex.frameTotal - 1) / 2)) };
  }
  scene.dayNight?.addVehicle(v, id); // headlights at night
  return v;
}

// Turn the sprite to face grid direction (dx, dy).
export function faceVehicle(v, dx, dy, time = 0, frameMs = 220) {
  v.dir = [dx, dy];
  let frame;
  if (v.four) {
    frame = VIEWS.indexOf(sideFromDir(dx, dy));
    v.im.setFlipX(false);
  } else {
    const f = facingFor(dx, dy);
    frame = f.row * v.perRow + (Math.floor(time / frameMs) % v.perRow);
    v.im.setFlipX(f.flip);
  }
  if (v.im.frame.name !== frame) v.im.setFrame(frame);
}

// A shadow: a dark copy of the vehicle's own outline.
export function vehicleShadow(scene, v) {
  return scene.add.image(0, 0, v.im.texture.key, v.im.frame.name)
    .setOrigin(v.im.originX, v.im.originY).setTintFill(0x000000).setAlpha(0);
}

export function placeShadow(shadow, v, x, y, alpha, depth, scale = 1) {
  if (shadow.frame.name !== v.im.frame.name) shadow.setFrame(v.im.frame.name);
  shadow.setFlipX(v.im.flipX).setPosition(Math.round(x), Math.round(y)).setAlpha(alpha).setDepth(depth).setScale(scale);
}
