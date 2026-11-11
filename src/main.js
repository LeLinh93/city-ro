import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import { createUI } from './ui.js';
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

game.events.on('city-ready', (scene) => createUI(scene, scene.controls));

const resize = () => {
  const n = size();
  game.scale.resize(n.w, n.h);
  game.scale.setZoom(1 / dpr());
};
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// Stop iPad Safari from zooming or scrolling the page itself.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

// Handy for debugging in the browser console.
window.game = game;
