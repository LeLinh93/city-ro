// Saved cities live in the browser's localStorage: one index plus one entry per city.
import { DEFAULT_THEME } from './themes/catalog.js';

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

export function deleteCity(id) {
  write(INDEX_KEY, index().filter((c) => c.id !== id));
  remove(CITY_KEY + id);
}
