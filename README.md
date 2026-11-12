# Little City

A small isometric city builder for iPad, made with Phaser 3 and Vite and installed as a home-screen web app (PWA).
It doesn't need the App Store or a Mac.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 on this PC. To try it on the iPad, use the same Wi-Fi network and open
`http://<this-PC's-IP>:5173` in Safari. Vite prints the address as "Network". Windows may ask to allow Node through the firewall.

## Put it on the iPad

The home-screen app works offline only when served over **HTTPS**, so host the built files somewhere free:

```bash
npm run build
```

Upload the `dist/` folder to GitHub Pages, Netlify (drag the folder onto app.netlify.com/drop) or Cloudflare Pages.
Then, on the iPad, open the address in Safari, tap **Share**, then **Add to Home Screen**. It launches full screen
with its own icon. After you upload a new build, the app updates itself the next time it opens.

## How to play

The game opens on the menu: tap **＋** for a new city, or tap a saved city to keep building. 🗑️ deletes a city.
In a city, 🏠 (top right) saves and goes back to the menu.

| Button | What it does |
|---|---|
| ✋ Move | Drag to look around. Two fingers pinch to zoom (works with every tool). |
| 🛣️ Road | Drag to draw roads. They go straight along the grid; move sideways to turn a corner. Tap Road again to go back to Move. |
| 🖌️ Plot | Pick grass, sand, water or pavement, then tap or drag to paint the ground. Water can't go under roads or buildings. |
| 🏠 🏪 🏥 🗼 ✈️ … | Opens that group's buildings in one row (swipe sideways for more). Tap one (it appears in the middle) or drag it up onto the map. |
| 🌳 Decoration | Works like Plot: pick one, then tap or drag on the map to put them down. The menu stays open until you tap 🌳 again. |
| 🚜 Remove | Tap or drag over roads and buildings. Tap Remove again to go back to Move. |

Tapping the button of the menu that is open closes it and goes back to ✋ Move. The Plot menu also stays open
while you paint.

While a building waits to be built, drag it around (green = OK, red = blocked). Dragging beside it moves the
map, and pinching still zooms. Then:
✔ builds it, ✖ cancels, 🔄 turns it (mirrors the picture, so a 2×1 building becomes 1×2).
Both go back to ✋ Move. Pressing another button instead builds it when its spot is OK (green) and drops it
when it is not (a building you were moving goes back). With ✋ Move, tap a building to pick it up and move or turn it the same way
(✖ puts it back where it was).

Buildings don't need roads. You can build on grass and sand, but not on water. Cities save themselves in the
browser a moment after every change, once a minute, and when you leave the city or the app.

What moves on its own:
- People walk out of doors, use sidewalks (or cut across grass), and walk into other buildings.
- Cars drive on the right-hand lane of every road and queue behind each other.
- Police cars and the ambulance leave their building, patrol, and come home. This needs a road touching
  the garage side (police, fire station) or the door (hospital).
- Helicopters on the police station, hospital and fire station roofs take off now and then. The police
  helicopter shines a light on a building; the hospital helicopter makes a short flight.
- Every few minutes a building near a fire station catches fire. The fire helicopter sprays water on it and
  the fire truck drives there (if a road connects them). Nothing burns down.
- Planes land, taxi to a gate, wait, and take off again.
- Docks can only be built touching water. Each sends its ship (container ship or cruise ship) out to sea
  and back.

## Your own art

See [ASSETS.md](ASSETS.md). In short: one square is 128 × 64 px. Buildings come from folders: put big pictures in
`art-source/building-city/<Menu>/<name>-<W>x<D>.png`, run `npm run art`, and reload. Every folder becomes a button
in the build bar.

## Code map

| File | What's in it |
|---|---|
| `src/themes/city.js` | The city theme: menu icons, building names, doors, garages, helicopters, fires, docks, airport layout. |
| `src/themes/catalog.js` | Turns the `assets/building-<theme>/` folders into the building list. |
| `src/menu.js`, `src/saves.js` | Start menu and saved cities. |
| `src/ui.js` | Build bar, building menus, ✔ ✖ 🔄 buttons. |
| `src/data/art.js` | Art file counts and sprite-sheet frame sizes. |
| `src/constants.js` | Square size, map size, zoom levels, speeds, lane offsets. |
| `src/world/` | Map generation, world state, ground and road drawing, building drawing, effects. |
| `src/agents/` | People, cars, patrols, fire trucks, helicopters and fires, planes, ships, path finding. |
| `src/input/Controls.js` | Touch and mouse: tools, pan, pinch-zoom. |
| `src/art/` | Pixel rasterizer and the code-drawn art (grass, sand, water, roads, people, cars, planes). |
