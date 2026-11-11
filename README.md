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

| Tool | What it does |
|---|---|
| ✋ Move | Drag to look around. Two fingers pinch to zoom (works with every tool). |
| 🛣️ Road | Drag to draw roads. They go straight along the grid; move sideways to turn a corner. |
| 🏠 🏡 🏙️ 🚓 ✈️ | Drag to choose a spot (green = OK, red = blocked), then lift your finger to build. 🔄 turns it. |
| 🚜 Remove | Tap or drag over roads, buildings or trees. |
| 🏝️ | Start a new random island. |

Buildings don't need roads. Trees are cleared automatically when you build. You can build on grass and sand,
but not on water. The city saves itself in the browser.

What moves on its own:
- People walk out of doors, use sidewalks (or cut across grass), and walk into other buildings.
- Cars drive on the right-hand lane of every road and queue behind each other.
- Police cars leave the station garage, patrol, and come home. This needs a road touching the garage side.
- Planes land, taxi to a gate, wait, and take off again.

## Your own art

See [ASSETS.md](ASSETS.md). In short: one square is 128 × 64 px, and `npm run templates` exports every placeholder
with the exact file name and size. Put finished PNGs in `assets/` and reload.

## Code map

| File | What's in it |
|---|---|
| `src/data/buildings.js` | Every building: size, door, garage, chimney, airport layout, placeholder shape. |
| `src/data/art.js` | Art file counts and sprite-sheet frame sizes. |
| `src/constants.js` | Square size, map size, zoom levels, speeds, lane offsets. |
| `src/world/` | Map generation, world state and saving, ground/road/tree drawing, building drawing, effects. |
| `src/agents/` | People, cars and police, planes, path finding. |
| `src/input/Controls.js` | Touch and mouse: tools, pan, pinch-zoom. |
| `src/art/` | Pixel rasterizer and the placeholder art. |
