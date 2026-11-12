// The in-game buttons: build bar, building menus, ✔ ✖ 🔄 while placing, zoom and home.
import { BUILDINGS, MENUS } from './themes/catalog.js';

const HINTS = {
  hand: 'Drag to move around. Tap a building to move it. Pinch with two fingers to zoom.',
  road: 'Drag your finger to draw roads.',
  bulldoze: 'Tap or drag to remove things.',
  menu: 'Tap a building, or drag it up onto the map.',
  plot: 'Pick a ground to paint with.',
  paint: "Tap or drag to paint the ground. Water can't go under roads or buildings.",
  painter: 'Pick one, then tap or drag on the map to put them down.',
  deco: 'Tap or drag on the map to put them down. Tap the menu button again when you are done.',
  disaster: 'Pick a disaster. 🔧 Repair fixes every ruined building afterwards.',
  earthquake: 'Earthquake!',
  tornado: 'A tornado is coming!',
  tsunami: 'Tsunami! A huge wave is coming from the sea.',
  busy: 'Wait until this disaster is over.',
  placing: 'Drag the building to move it, or drag beside it to look around. ✔ builds it, 🔄 turns it, ✖ cancels.',
};

// The ground you can paint with the Plot tool.
const PAINTS = [
  { paint: 'grass', name: 'Grass', texture: 'grass_0' },
  { paint: 'sand', name: 'Sand', texture: 'sand_0' },
  { paint: 'water', name: 'Water', texture: 'water_0' },
  { paint: 'pavement', name: 'Pavement', texture: 'pavement_0' },
];
// The Disaster menu: actions that happen straight away.
const DISASTERS = [
  { action: 'earthquake', name: 'Earthquake', icon: '🏚️' },
  { action: 'tornado', name: 'Tornado', icon: '🌪️' },
  { action: 'tsunami', name: 'Tsunami', icon: '🌊' },
];

const isPaint = (id) => typeof id === 'string' && id.startsWith('paint:');
const isDeco = (id) => typeof id === 'string' && id.startsWith('deco:');

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
    this.painter = false; // the open menu paints (Plot, Decoration) instead of placing one building
    this.drag = null;

    document.getElementById('zoom-in').addEventListener('click', () => this.scene?.controls.zoomStep(1));
    document.getElementById('zoom-out').addEventListener('click', () => this.scene?.controls.zoomStep(-1));
    document.getElementById('home').addEventListener('click', () => onHome());
    this.ok.addEventListener('click', () => {
      if (this.scene?.confirmPlacing()) this.select('hand', false);
    });
    document.getElementById('place-no').addEventListener('click', () => {
      this.scene?.cancelPlacing();
      this.select('hand');
    });
    document.getElementById('place-flip').addEventListener('click', () => this.scene?.flipPlacing());

    // A finger on a menu: swipe sideways to scroll, drag up to carry a building out, tap to pick.
    this.sub.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // let the finger's events go to whatever is under it (the map, once it leaves the menu)
      if (e.target.hasPointerCapture?.(e.pointerId)) e.target.releasePointerCapture(e.pointerId);
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
    scene.events.off('disaster');
    scene.events.on('disaster', (on) => this.lock(on));
    this.bar.classList.remove('locked');
    scene.events.on('picked-up', (type) => {
      this.closeMenu();
      this.highlight(type);
      this.showHint(HINTS.placing);
    });
    this.buildBar();
    this.select('hand');
  }

  detach() {
    this.scene = null;
    this.bar.classList.remove('locked');
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
    this.button('road', '🛣️', 'Road', () => this.toggleTool('road'));
    const plot = PAINTS.map((p) => ({ ...p, url: this.scene.textures.getBase64(p.texture, 0) }));
    this.button('plot', '🖌️', 'Plot', () => this.toggleMenu('plot', plot, true, HINTS.plot));
    for (const m of MENUS) {
      this.button(`menu:${m.name}`, m.icon, m.name,
        () => this.toggleMenu(`menu:${m.name}`, m.items, m.paint, m.paint ? HINTS.painter : HINTS.menu));
    }
    this.button('disaster', '⚡', 'Disaster', () => this.toggleMenu('disaster', DISASTERS, false, HINTS.disaster));
    this.button('repair', '🔧', 'Repair', () => this.repair());
    this.button('bulldoze', '🚜', 'Remove', () => this.toggleTool('bulldoze')); // always the last button
  }

  // A building that waits for ✔ / ✖ when another button is pressed: built if its spot is fine, else dropped
  // (a building that was being moved goes back where it was).
  settle() {
    const s = this.scene;
    if (s?.pending && !s.confirmPlacing(true)) s.cancelPlacing();
  }

  // Road and Remove: pressing the button that is already on goes back to Move.
  toggleTool(id) {
    this.select(this.scene?.tool === id ? 'hand' : id);
  }

  // Pick a tool (hand, road, bulldoze, or a building id) and close any menu.
  select(id, hint = true) {
    this.settle();
    this.closeMenu();
    this.scene?.setTool(id);
    this.highlight(id);
    if (hint && HINTS[id]) this.showHint(HINTS[id]);
    else this.hint.classList.remove('show');
  }

  // Which build bar button a tool belongs to.
  buttonFor(id) {
    if (isPaint(id)) return 'plot';
    const def = BUILDINGS[isDeco(id) ? id.slice(5) : id];
    return def ? `menu:${def.menu}` : id;
  }

  highlight(id) {
    const key = this.buttonFor(id);
    for (const [k, b] of this.buttons) b.classList.toggle('active', k === key || k === this.openMenu);
    for (const item of this.sub.children) {
      const d = item.def;
      item.classList.toggle('active', !!d && (id === `paint:${d.paint}` || id === `deco:${d.id}`));
    }
  }

  // ---------- menus ----------

  // items: building defs, or ground paints ({ paint, name, url }).
  // painter: picking an item starts painting with it and the menu stays open; otherwise it places one building.
  toggleMenu(key, items, painter, hint) {
    if (this.openMenu === key) {
      this.select('hand'); // the open menu's button again: close it and go back to Move
      return;
    }
    this.settle();
    const tool = this.scene?.tool;
    if (BUILDINGS[tool] || this.buttonFor(tool) !== key) this.scene?.setTool('hand'); // keep painting in its own menu
    this.openMenu = key;
    this.painter = !!painter;
    this.sub.textContent = '';
    for (const def of items) {
      const item = document.createElement('button');
      item.className = 'item';
      let pic;
      if (def.icon) {
        pic = document.createElement('span');
        pic.className = 'big';
        pic.textContent = def.icon;
      } else {
        pic = document.createElement('img');
        pic.src = def.url;
        pic.alt = '';
        pic.draggable = false;
      }
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = def.name;
      const size = document.createElement('span');
      size.className = 'size';
      size.textContent = def.paint || def.action ? '' : `${def.w}×${def.d}`;
      item.append(pic, name, size);
      item.def = def;
      this.sub.appendChild(item);
    }
    this.sub.classList.remove('hidden', 'carrying');
    this.sub.scrollLeft = 0;
    this.highlight(this.scene?.tool);
    this.showHint(hint);
  }

  closeMenu() {
    this.openMenu = null;
    this.painter = false;
    this.sub.classList.add('hidden');
    this.sub.classList.remove('carrying');
  }

  // 🔧 Repair: fix every ruined building.
  repair() {
    this.select('hand', false);
    const n = this.scene.disasters.repair();
    this.showHint(n < 0 ? HINTS.busy : n ? `Repaired ${n} building${n === 1 ? '' : 's'}.` : 'Nothing needs repairing.');
  }

  // While a disaster is going on, the build bar can't be used (looking around and zooming still work).
  lock(on) {
    this.bar.classList.toggle('locked', on);
    if (on) this.select('hand', false);
  }

  // Tapped a menu item.
  pick(def) {
    if (def.action) {
      this.select('hand', false);
      this.showHint(this.scene.disasters.start(def.action) ? HINTS[def.action] : HINTS.busy);
      return;
    }
    if (def.paint || this.painter) {
      const id = def.paint ? `paint:${def.paint}` : `deco:${def.id}`;
      this.scene.setTool(id);
      this.highlight(id);
      this.showHint(def.paint ? HINTS.paint : HINTS.deco);
      return;
    }
    this.settle();
    this.closeMenu();
    this.scene.startPlacing(def.id);
    this.highlight(def.id);
    this.showHint(HINTS.placing);
  }

  // A finger that starts on a menu: a tap picks the item, a sideways swipe scrolls the menu,
  // and (in a building menu) a drag upwards carries the building onto the map.
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
      const up = dy < 0 && -dy >= Math.abs(dx) * 0.7;
      if (!d.def || d.def.paint || d.def.action || this.painter || !up) {
        d.scroll = this.sub.scrollLeft + dx; // so the menu doesn't jump by the first few pixels
        this.sub.scrollLeft = d.scroll - dx;
        return;
      }
      d.started = true;
      this.settle();
      this.sub.classList.add('carrying'); // hidden for real when the finger lifts
      this.highlight(d.def.id);
    }
    this.scene.startPlacing(d.def.id, this.scene.squareAtClient(e.clientX, e.clientY));
  }

  dragEnd(e, cancelled = false) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (!this.scene || d.scroll !== null || !d.def) return;
    if (d.started) {
      // the building stays where the finger left it, waiting for ✔ / ✖
      this.closeMenu();
      this.highlight(d.def.id);
      this.showHint(HINTS.placing);
      return;
    }
    if (cancelled || !e.target.closest || !e.target.closest('#submenu')) return; // finger slid off the menu
    this.pick(d.def);
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
