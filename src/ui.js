// The in-game buttons: build bar, building menus, ✔ ✖ 🔄 while placing, zoom and home.
import { BUILDINGS, MENUS } from './themes/catalog.js';

const HINTS = {
  hand: 'Drag to move around. Tap a building to move it. Pinch with two fingers to zoom.',
  road: 'Drag your finger to draw roads.',
  bulldoze: 'Tap or drag to remove things.',
  menu: 'Tap a building, or drag it onto the map.',
  plot: 'Pick a ground to paint with.',
  paint: "Tap or drag to paint the ground. Water can't go under roads or buildings.",
  placing: 'Drag the building to move it, or drag beside it to look around. ✔ builds it, 🔄 turns it, ✖ cancels.',
};

// The ground you can paint with the Plot tool.
const PAINTS = [
  { paint: 'grass', name: 'Grass', texture: 'grass_0' },
  { paint: 'sand', name: 'Sand', texture: 'sand_0' },
  { paint: 'water', name: 'Water', texture: 'water_0' },
  { paint: 'pavement', name: 'Pavement', texture: 'pavement_0' },
];
const isPaint = (id) => typeof id === 'string' && id.startsWith('paint:');

const DRAG_START = 12; // px a finger must move before a menu item is dragged instead of tapped

export class UI {
  constructor(onHome) {
    this.scene = null;
    this.bar = document.getElementById('toolbar');
    this.sub = document.getElementById('submenu');
    this.hint = document.getElementById('hint');
    this.place = document.getElementById('place');
    this.ok = document.getElementById('place-ok');
    this.buttons = new Map();
    this.openMenu = null;
    this.drag = null;

    document.getElementById('zoom-in').addEventListener('click', () => this.scene?.controls.zoomStep(1));
    document.getElementById('zoom-out').addEventListener('click', () => this.scene?.controls.zoomStep(-1));
    document.getElementById('home').addEventListener('click', () => onHome());
    this.ok.addEventListener('click', () => {
      if (this.scene?.confirmPlacing()) this.select('hand', false);
    });
    document.getElementById('place-no').addEventListener('click', () => this.select('hand'));
    document.getElementById('place-flip').addEventListener('click', () => this.scene?.flipPlacing());

    // A finger on the building menu: swipe sideways to scroll, drag up to carry a building out, tap to place it.
    this.sub.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const def = e.target.closest?.('.item')?.def || null;
      this.drag = { def, x0: e.clientX, y0: e.clientY, id: e.pointerId, started: false, scroll: null };
    });
    this.sub.addEventListener('wheel', (e) => {
      this.sub.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('pointermove', (e) => this.dragMove(e));
    window.addEventListener('pointerup', (e) => this.dragEnd(e));
    window.addEventListener('pointercancel', (e) => this.dragEnd(e, true));

    const tick = () => {
      this.updatePlace();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  attach(scene) {
    this.scene = scene;
    scene.events.off('picked-up'); // the scene object is reused for every city
    scene.events.on('picked-up', (type) => {
      this.highlight(type);
      this.showHint(HINTS.placing);
    });
    this.buildBar();
    this.select('hand');
  }

  detach() {
    this.scene = null;
    this.closeMenu();
    this.place.classList.add('hidden');
  }

  showHint(text) {
    this.hint.textContent = text;
    this.hint.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hint.classList.remove('show'), 3500);
  }

  button(id, icon, label, onClick) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.innerHTML = `<span class="icon">${icon}</span><span class="label"></span>`;
    b.querySelector('.label').textContent = label;
    b.addEventListener('click', onClick);
    this.bar.appendChild(b);
    this.buttons.set(id, b);
  }

  buildBar() {
    this.bar.textContent = '';
    this.buttons.clear();
    this.button('hand', '✋', 'Move', () => this.select('hand'));
    this.button('road', '🛣️', 'Road', () => this.select('road'));
    const plot = PAINTS.map((p) => ({ ...p, url: this.scene.textures.getBase64(p.texture, 0) }));
    this.button('plot', '🖌️', 'Plot', () => this.toggleMenu('plot', plot, HINTS.plot));
    for (const m of MENUS) this.button(`menu:${m.name}`, m.icon, m.name, () => this.toggleMenu(`menu:${m.name}`, m.items, HINTS.menu));
    this.button('bulldoze', '🚜', 'Remove', () => this.select('bulldoze'));
  }

  // Pick a tool (hand, road, bulldoze, 'paint:<ground>' or a building id).
  select(id, hint = true) {
    this.closeMenu();
    this.scene?.setTool(id);
    this.highlight(id);
    const text = HINTS[id] || (isPaint(id) && HINTS.paint);
    if (hint && text) this.showHint(text);
    else this.hint.classList.remove('show');
  }

  highlight(id) {
    const def = BUILDINGS[id];
    const key = def ? `menu:${def.menu}` : isPaint(id) ? 'plot' : id;
    for (const [k, b] of this.buttons) b.classList.toggle('active', k === key || k === this.openMenu);
  }

  // ---------- building and ground menus ----------

  // items: building defs, or ground paints ({ paint, name, url }).
  toggleMenu(key, items, hint) {
    if (this.openMenu === key) {
      this.closeMenu();
      this.highlight(this.scene?.tool);
      return;
    }
    this.openMenu = key;
    this.sub.textContent = '';
    for (const def of items) {
      const item = document.createElement('button');
      item.className = 'item';
      const pic = document.createElement('img');
      pic.src = def.url;
      pic.alt = '';
      pic.draggable = false;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = def.name;
      const size = document.createElement('span');
      size.className = 'size';
      size.textContent = def.paint ? '' : `${def.w}×${def.d}`;
      if (def.paint && this.scene?.tool === `paint:${def.paint}`) item.classList.add('active');
      item.append(pic, name, size);
      item.def = def;
      this.sub.appendChild(item);
    }
    this.sub.classList.remove('hidden');
    this.sub.scrollLeft = 0;
    this.highlight(this.scene?.tool);
    this.showHint(hint);
  }

  closeMenu() {
    this.openMenu = null;
    this.sub.classList.add('hidden');
  }

  // A finger that starts on the building menu: a tap places the building in the middle of the screen,
  // a sideways swipe scrolls the menu, and a drag upwards carries the building onto the map.
  dragMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id || !this.scene) return;
    if (d.scroll !== null) {
      this.sub.scrollLeft = d.scroll - (e.clientX - d.x0);
      return;
    }
    if (!d.started) {
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (Math.hypot(dx, dy) < DRAG_START) return;
      if (!d.def || d.def.paint || Math.abs(dx) > Math.abs(dy)) {
        d.scroll = this.sub.scrollLeft + dx; // so the menu doesn't jump by the first few pixels
        this.sub.scrollLeft = d.scroll - dx;
        return;
      }
      d.started = true;
      this.closeMenu();
      this.highlight(d.def.id);
    }
    this.scene.startPlacing(d.def.id, this.scene.squareAtClient(e.clientX, e.clientY));
  }

  dragEnd(e, cancelled = false) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (!this.scene || cancelled || d.scroll !== null || !d.def) return;
    if (!d.started) {
      if (!e.target.closest || !e.target.closest('#submenu')) return; // finger slid off the menu
      if (d.def.paint) {
        this.select(`paint:${d.def.paint}`);
        return;
      }
      this.closeMenu();
      this.scene.startPlacing(d.def.id);
    }
    this.highlight(d.def.id);
    this.showHint(HINTS.placing);
  }

  // ---------- ✔ ✖ 🔄 above the building being placed ----------

  updatePlace() {
    const a = this.scene?.placingAnchor();
    if (!a || this.drag?.started) {
      this.place.classList.add('hidden');
      return;
    }
    this.place.classList.remove('hidden');
    this.ok.classList.toggle('disabled', !a.ok);
    const w = this.place.offsetWidth;
    const h = this.place.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let y = a.y - h - 10;
    y = Math.max(76, Math.min(y, a.bottom - h - 10, vh - 200 - h));
    const x = Math.max(8, Math.min(a.x - w / 2, vw - w - 8));
    this.place.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
}
