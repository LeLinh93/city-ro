// The start screen: a picture, a ＋ button for a new city, and the saved cities.
import { listCities, createCity, deleteCity } from './saves.js';
import { DEFAULT_THEME } from './themes/catalog.js';

// Optional picture for the menu: assets/ui/menu.png (or .jpg / .webp). Without it a text title shows.
const ART = Object.values(import.meta.glob('../assets/ui/menu.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }))[0];

const when = (t) => {
  const d = new Date(t);
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 1 && d.getDate() === new Date().getDate()) return 'Today';
  if (days < 2) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export class Menu {
  constructor(onOpen) {
    this.onOpen = onOpen;
    this.root = document.getElementById('menu');
    this.list = document.getElementById('city-list');
    if (ART) {
      this.root.style.backgroundImage = `url("${ART}")`;
      this.root.classList.add('has-art');
    }
    document.getElementById('new-city').addEventListener('click', () => this.onOpen(createCity(DEFAULT_THEME)));
  }

  show() {
    document.body.classList.add('in-menu');
    this.render();
  }

  hide() {
    document.body.classList.remove('in-menu');
  }

  render() {
    this.list.textContent = '';
    for (const city of listCities()) {
      const card = document.createElement('div');
      card.className = 'city';
      const open = document.createElement('button');
      open.className = 'city-open';
      const pic = document.createElement('div');
      pic.className = 'city-pic';
      if (city.thumb) pic.style.backgroundImage = `url("${city.thumb}")`;
      else pic.textContent = '🏙️';
      const name = document.createElement('div');
      name.className = 'city-name';
      name.textContent = city.name;
      const date = document.createElement('div');
      date.className = 'city-date';
      date.textContent = when(city.updated);
      open.append(pic, name, date);
      open.addEventListener('click', () => this.onOpen(city));
      const del = document.createElement('button');
      del.className = 'city-delete';
      del.setAttribute('aria-label', `Delete ${city.name}`);
      del.textContent = '🗑️';
      del.addEventListener('click', () => {
        if (confirm(`Delete ${city.name}? It can't be brought back.`)) {
          deleteCity(city.id);
          this.render();
        }
      });
      card.append(open, del);
      this.list.appendChild(card);
    }
  }
}
