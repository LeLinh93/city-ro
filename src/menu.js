// The start screen: a picture, a ＋ button for a new city, and the saved cities.
import { listCities, createCity, deleteCity, exportCity, importCity } from './saves.js';
import { DEFAULT_THEME } from './themes/catalog.js';

// Optional picture for the menu: assets/ui/menu.png (or .jpg / .webp). Without it a text title shows.
const ART = Object.values(import.meta.glob('../assets/ui/menu.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }))[0];

// Give the player a file: on the iPad home-screen app through the share sheet ("Save to Files"),
// elsewhere as a normal download.
async function giveFile(name, text) {
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.standalone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return; // the player closed the share sheet
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// characters that file names can't have
const fileName = (name) => `${name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'city'}.city.json`;

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
    // 📂: add a city from a save file on this device
    const input = document.getElementById('load-file');
    document.getElementById('load-city').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        const city = importCity(await file.text());
        this.render();
        alert(`${city.name} was added.`);
      } catch (e) {
        alert(e.message || "This file couldn't be loaded.");
      }
    });
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
      const save = document.createElement('button');
      save.className = 'city-export';
      save.setAttribute('aria-label', `Save ${city.name} to a file`);
      save.textContent = '⬇️';
      save.addEventListener('click', () => {
        const data = exportCity(city.id);
        if (data) giveFile(fileName(city.name), JSON.stringify(data));
      });
      card.append(open, save, del);
      this.list.appendChild(card);
    }
  }
}
