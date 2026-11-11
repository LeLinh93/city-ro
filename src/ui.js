import { BUILDINGS, BUILDING_ORDER } from './data/buildings.js';

const TOOLS = [
  { id: 'hand', icon: '✋', label: 'Move' },
  { id: 'road', icon: '🛣️', label: 'Road' },
  ...BUILDING_ORDER.map((id) => ({ id, icon: BUILDINGS[id].icon, label: BUILDINGS[id].name })),
  { id: 'bulldoze', icon: '🚜', label: 'Remove' },
];

const HINTS = {
  hand: 'Drag to move around. Pinch with two fingers to zoom.',
  road: 'Drag your finger to draw roads.',
  bulldoze: 'Tap or drag to remove things.',
  building: 'Drag to choose a spot, lift your finger to build. 🔄 turns it.',
};

export function createUI(scene, controls) {
  const bar = document.getElementById('toolbar');
  const hint = document.getElementById('hint');
  const rotate = document.getElementById('rotate');
  const buttons = new Map();

  let hintTimer = null;
  const showHint = (text) => {
    hint.textContent = text;
    hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('show'), 3500);
  };

  const select = (id) => {
    scene.setTool(id);
    for (const [k, b] of buttons) b.classList.toggle('active', k === id);
    const isBuilding = !!BUILDINGS[id];
    rotate.classList.toggle('hidden', !isBuilding);
    showHint(isBuilding ? HINTS.building : HINTS[id]);
  };

  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.innerHTML = `<span class="icon">${t.icon}</span><span class="label">${t.label}</span>`;
    b.addEventListener('click', () => select(t.id));
    bar.appendChild(b);
    buttons.set(t.id, b);
  }

  rotate.addEventListener('click', () => scene.rotate());
  document.getElementById('zoom-in').addEventListener('click', () => controls.zoomStep(1));
  document.getElementById('zoom-out').addEventListener('click', () => controls.zoomStep(-1));
  document.getElementById('new-island').addEventListener('click', () => {
    if (confirm('Make a brand new island? Your city will be cleared.')) scene.newIsland();
  });

  select('hand');
}
