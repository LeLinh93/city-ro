import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UI } from './ui.js';
import { Menu } from './menu.js';
import { useTheme } from './themes/catalog.js';
import { updateCity } from './saves.js';
import './style.css';

// Render at the screen's real pixel density so 1 art pixel = 1 screen pixel at zoom 1.
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
const size = () => ({
  w: Math.max(64, Math.round(window.innerWidth * dpr())),
  h: Math.max(64, Math.round(window.innerHeight * dpr())),
});

const s = size();
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#2b62a6',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    width: s.w,
    height: s.h,
    zoom: 1 / dpr(),
  },
  input: { activePointers: 3 },
  scene: [BootScene, GameScene],
});

let leaving = false;

const menu = new Menu((city) => {
  useTheme(city.theme);
  menu.hide();
  game.scene.start('game', { city });
});

// Back to the menu: save, take a small picture of the city for the list, then stop the city.
const ui = new UI(() => {
  const scene = game.scene.getScene('game');
  if (leaving || !scene || !scene.sys.isActive()) return;
  leaving = true;
  scene.cancelPlacing();
  scene.saveNow();
  game.renderer.snapshot((img) => {
    try {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = Math.round((320 * img.height) / img.width);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      updateCity(scene.city.id, { thumb: c.toDataURL('image/jpeg', 0.7) });
    } catch {
      // no picture then
    }
    ui.detach();
    game.scene.stop('game');
    menu.show();
    leaving = false;
  }, 'image/jpeg', 0.8);
});

game.events.once('boot-done', () => menu.show());
game.events.on('city-ready', (scene) => ui.attach(scene));

// Save when the app goes to the background or closes (iPad home button, switching apps).
const saveIfOpen = () => {
  const scene = game.scene.getScene('game');
  if (scene?.sys.isActive()) scene.saveNow();
};
document.addEventListener('visibilitychange', () => document.hidden && saveIfOpen());
window.addEventListener('pagehide', saveIfOpen);

const resize = () => {
  const n = size();
  game.scale.resize(n.w, n.h);
  game.scale.setZoom(1 / dpr());
};
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// Stop iPad Safari from zooming or scrolling the page itself (the city list may scroll).
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest?.('#city-list')) e.preventDefault();
}, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

// Handy for debugging in the browser console.
window.game = game;
