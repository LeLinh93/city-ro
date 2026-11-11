// Builds each theme's building list from the files in assets/building-<theme>/<Menu>/<name>-<W>x<D>.png.
import { CITY } from './city.js';

export const THEMES = { city: CITY };
export const DEFAULT_THEME = 'city';

const FILES = import.meta.glob('../../assets/building-*/**/*.png', { eager: true, query: '?url', import: 'default' });
const FILE_RE = /assets\/building-([^/]+)\/([^/]+)\/([^/]+?)-(\d+)x(\d+)\.png$/i;

// The buildings of the theme in use, by id. Filled by useTheme().
export const BUILDINGS = {};
// The build bar menus of the theme in use: [{ name, icon, items: [def, ...] }].
export const MENUS = [];

const prettyName = (s) => {
  const t = s.replace(/[_-]+/g, ' ').replace(/([a-z])(\d)/gi, '$1 $2').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const cache = {};

export function themeCatalog(themeId) {
  if (cache[themeId]) return cache[themeId];
  const theme = THEMES[themeId];
  const defs = {};
  const menus = new Map();
  const order = Object.keys(theme.menus);
  const files = Object.keys(FILES).sort();
  for (const path of files) {
    const m = path.match(FILE_RE);
    if (!m || m[1].toLowerCase() !== themeId) continue;
    const [, , menu, file, sw, sd] = m;
    const key = file.toLowerCase();
    const id = defs[key] ? `${menu.toLowerCase()}-${key}` : key;
    const w = Number(sw);
    const d = Number(sd);
    const mcfg = theme.menus[menu] || { icon: '📦', people: 1, attract: 1 };
    const extra = theme.buildings[key] || {};
    const image = `${themeId}:${id}`;
    const def = {
      id,
      name: theme.names[key] || prettyName(file),
      menu,
      w,
      d,
      url: FILES[path],
      image,
      door: mcfg.door === false ? null : { x: Math.floor((w - 1) / 2), y: d - 1, side: 'sw' },
      people: (mcfg.people ?? 1) * Math.sqrt(w * d),
      attract: mcfg.attract ?? 1,
      ...extra,
    };
    if (extra.parts) {
      // Flat picture underneath, standing parts cut out and sorted with people and planes.
      def.base = image;
      def.image = `${image}#parts`;
      def.solid = extra.parts.map((p) => {
        const x = Math.floor(p.x);
        const y = Math.floor(p.y);
        return { x, y, w: Math.ceil(p.x + p.w) - x, d: Math.ceil(p.y + p.d) - y };
      });
    }
    defs[id] = def;
    if (!menus.has(menu)) menus.set(menu, { name: menu, icon: mcfg.icon || '📦', items: [] });
    menus.get(menu).items.push(def);
  }
  const rank = (n) => (order.includes(n) ? order.indexOf(n) : order.length);
  const list = [...menus.values()].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  for (const m of list) m.items.sort((a, b) => a.w * a.d - b.w * b.d || a.name.localeCompare(b.name));
  cache[themeId] = { defs, menus: list };
  return cache[themeId];
}

export function useTheme(themeId) {
  const c = themeCatalog(THEMES[themeId] ? themeId : DEFAULT_THEME);
  for (const k of Object.keys(BUILDINGS)) delete BUILDINGS[k];
  Object.assign(BUILDINGS, c.defs);
  MENUS.length = 0;
  MENUS.push(...c.menus);
}
