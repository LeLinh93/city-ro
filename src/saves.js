// Saved cities live in the browser's localStorage: one index plus one entry per city.
import { DEFAULT_THEME, THEMES } from './themes/catalog.js';

const INDEX_KEY = 'citybuilder.cities.v1';
const CITY_KEY = 'citybuilder.city.';
const OLD_SAVE_KEY = 'citybuilder.save.v1'; // the single save from before there was a menu

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // full or unavailable (private mode): the game still works
  }
};

const remove = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

function index() {
  return read(INDEX_KEY) || [];
}

function nextName(list) {
  let n = list.length + 1;
  const names = new Set(list.map((c) => c.name));
  while (names.has(`City ${n}`)) n++;
  return `City ${n}`;
}

// Turn the old single save into the first city of the list.
function migrate() {
  const old = read(OLD_SAVE_KEY);
  if (!old) return;
  const list = index();
  const now = Date.now();
  const city = { id: `c${now.toString(36)}`, name: 'My City', theme: DEFAULT_THEME, created: now, updated: now };
  if (write(CITY_KEY + city.id, old)) {
    list.push(city);
    write(INDEX_KEY, list);
    remove(OLD_SAVE_KEY);
  }
}

export function listCities() {
  migrate();
  return index().sort((a, b) => b.updated - a.updated);
}

export function createCity(theme = DEFAULT_THEME) {
  const list = index();
  const now = Date.now();
  const city = { id: `c${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name: nextName(list), theme, created: now, updated: now };
  list.push(city);
  write(INDEX_KEY, list);
  return city;
}

export function loadCity(id) {
  return read(CITY_KEY + id);
}

export function saveCity(id, data) {
  write(CITY_KEY + id, data);
  updateCity(id, { updated: Date.now() });
}

export function updateCity(id, fields) {
  const list = index();
  const c = list.find((x) => x.id === id);
  if (!c) return;
  Object.assign(c, fields);
  write(INDEX_KEY, list);
}

// ---------- save files ----------

const FILE_APP = 'city-builder';

// Everything about one city, ready to be written to a file.
export function exportCity(id) {
  const city = index().find((c) => c.id === id);
  const data = loadCity(id);
  if (!city || !data) return null;
  const { name, theme, created, updated, thumb } = city;
  return { app: FILE_APP, format: 1, city: { name, theme, created, updated, thumb }, data };
}

// Add a city from a save file's contents (text). Returns the new city, or throws an Error with a message
// for the player.
export function importCity(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a city save.");
  }
  const data = file?.app === FILE_APP ? file.data : file; // also take a bare city
  if (!data || data.v !== 1 || typeof data.seed !== 'number') throw new Error("This file isn't a city save.");
  const info = file.app === FILE_APP ? file.city || {} : {};
  const list = index();
  const names = new Set(list.map((c) => c.name));
  let name = String(info.name || 'Loaded city').slice(0, 40);
  if (names.has(name)) {
    let n = 2;
    while (names.has(`${name} (${n})`)) n++;
    name = `${name} (${n})`;
  }
  const now = Date.now();
  const city = {
    id: `c${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    name,
    theme: THEMES[info.theme] ? info.theme : DEFAULT_THEME,
    created: info.created || now,
    updated: now,
    thumb: typeof info.thumb === 'string' && info.thumb.startsWith('data:image/') ? info.thumb : undefined,
  };
  if (!write(CITY_KEY + city.id, data)) throw new Error('There is no room left to store this city.');
  list.push(city);
  write(INDEX_KEY, list);
  return city;
}

export function deleteCity(id) {
  write(INDEX_KEY, index().filter((c) => c.id !== id));
  remove(CITY_KEY + id);
}
