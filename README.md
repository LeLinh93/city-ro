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
⬇️ on a city saves it to a file (on the iPad home-screen app the share sheet opens: pick "Save to Files"),
and 📂 next to ＋ loads a city from a file on the device as a new city. Use them to keep a copy or to move a
city to another device, since cities are otherwise stored only in this browser. The file has no picture of
the city: a city loaded from a file shows 🏙️ in the menu until it is opened and closed again.
In a city, 🏠 (top right) saves and goes back to the menu. The city's name shows under the clock; tap it to
give the city a new name.

The clock at the top left shows the time of day. A whole day takes 6 minutes: about 3½ minutes of day, a
short orange evening, 1½ minutes of night and a pink morning. At night the city turns dark blue, building walls
light up in warm yellow one after another, tall landmarks get spotlights from the ground, towers twinkle
with small white lights and a blinking red one on top, the stadiums, the docks' yards and the airport are floodlit, lamp posts shine on the ground, cars drive with headlights and red tail lights,
and helicopters, planes and ships blink. Tap the clock to switch between **Auto** (day and night go round),
**🔒 Day** (always day) and **🔒 Night** (always night). The time is saved with the city; the setting is the
same for every city.

Weather: every few minutes it may start to rain for 1 to 2 minutes (the first shower comes 1½ to 3½ minutes
after opening a city). Rain falls over the screen, the city turns a little grey and 🌧️ shows next to the clock.
In the rain every fire goes out by itself 6 seconds after it starts (fires already burning get 6 seconds from
when the rain starts), disasters' fires too.

| Button | What it does |
|---|---|
| ✋ Move | Drag to look around. Two fingers pinch to zoom (works with every tool). |
| 🔳 Select | Drag a box: every building touching it is picked up. Drag the group somewhere else (red = doesn't fit), then ✔ puts them all down or ✖ puts them back. Groups don't turn. |
| 🛣️ Road | Drag to draw roads. They go straight along the grid; move sideways to turn a corner. Tap Road again to go back to Move. |
| 🖌️ Plot | Pick grass, sand, water or pavement, then tap or drag to paint the ground. Water can't go under roads or buildings. |
| 🏠 🏪 🏥 🗼 ✈️ … | Opens that group's buildings in one row (swipe sideways for more). Tap one (it appears in the middle) or drag it onto the map: drag up, drag out of the menu in any direction, or hold it a moment and then drag. |
| 🌳 Decoration | Works like Plot: pick one, then tap or drag on the map to put them down. The menu stays open until you tap 🌳 again. |
| ⚡ Disaster | 🏚️ Earthquake, 🌪️ Tornado, 🌊 Tsunami, ☄️ Meteor or 🌋 Volcano. While it lasts, the build bar is locked and buildings can't be picked up (looking around and zooming still work); the red ⏹ Stop disaster button at the top middle ends it straight away. |
| 🔧 Repair | Fixes every ruined building and puts out every fire. |
| 🚜 Remove | Tap or drag over roads and buildings. Only the squares a building stands on count, so a tall building is not removed by touching its roof. Tap Remove again to go back to Move. |

Tapping the button of the menu that is open closes it and goes back to ✋ Move. The Plot menu also stays open
while you paint. Plot and Decoration start with two modes: 🖌️ Brush (tap or drag, square by square) and
🔲 Area (drag a rectangle; it is filled when you let go, and decorations only go on free spots).

While a building waits to be built, drag it around (green = OK, red = blocked). Dragging beside it moves the
map, pinching still zooms, and a quick tap on the ground beside it builds it where it is if that spot is OK
(green), or else cancels it like ✖. Then:
✔ builds it, ✖ cancels, 🔄 turns it (mirrors the picture, so a 2×1 building becomes 1×2).
Both go back to ✋ Move. Pressing another button instead builds it when its spot is OK (green) and drops it
when it is not (a building you were moving goes back). With ✋ Move, tap a building to pick it up and move or turn it the same way
(✖ puts it back where it was, 🗑️ removes it). 🗑️ also shows for a group picked up with 🔳 Select.

Buildings don't need roads. You can build on grass and sand, but not on water. Cities save themselves in the
browser a moment after every change, once a minute, and when you leave the city or the app.

Disasters (one at a time):
- 🏚️ Earthquake: the screen shakes and a third to a half of the buildings fall in.
- 🌪️ Tornado: comes in from outside the city, wanders around it for a while, ruins every building it touches
  and sucks up people and cars, then leaves.
- 🌊 Tsunami: one huge wave from the side with the most sea. It ruins buildings in its way and gets smaller
  over land, stopping after about 30 squares.
- ☄️ Meteor: tap where it should hit. A giant meteor crashes down and ruins everything in the 15 × 15 squares
  around that spot; buildings in the 25 × 25 squares around it catch fire. Fire stations send their
  helicopters (one fire each) and trucks (two per station, if a road leads there). A disaster's fires go out
  faster (4 s with a helicopter, 1.5 s with a truck as well), but a building left burning for 75 s is ruined.
  While a disaster or its fires are going on, fire stations don't start fires of their own.
- 🌋 Volcano: tap where it should come up. A volcano (art-source/disaster/volcano-8x8.png) pushes up over
  whatever is there, the ground shakes, smoke pours out and fire balls fly out for about 13 seconds. Every
  building in the 25 × 25 squares around it is hit by a fire ball and catches fire (fire stations come, as
  for the meteor). Then the volcano sinks back into the ground.

🧟 Zombies (in the Disaster menu, but they don't lock the build bar): each tap brings up to 1000 green zombies
out of the ground in the middle of the city, never more than 1000 on the map. They shuffle to the nearest
building and break it: each zombie next to it takes 1 HP a second, and a building has 20 HP for every square
it covers (1×1 = 20, 2×2 = 80), so it is ruined at 0. Decorations are left alone. People they catch turn into
zombies, and they go after tanks close by (a tank has 20 HP). Every zombie dies from one hit. The army fights
them: a bullet kills one zombie, a tank shell everything in a 1×1 square, a rocket 2×2 and a bomb 3×3.
Tap a zombie and then 🗑️ to take them all away. (`src/agents/Zombies.js`)

🪖 Soldiers: while there are zombies or a kaiju (not the UFO), every barrack sends out 5 soldiers in a military
truck. It drives (along roads and over open land, like a tank) to about 4 squares from the nearest zombie or the
kaiju, lets them out and drives home; if the kaiju destroys the truck on the way, the soldiers in it are lost. A
barrack with no road near it sends them on foot. Soldiers run at the nearest zombie (or the kaiju) and shoot
once it is 2 squares away: 10 shots a second, 0.1 damage each.
Zombies turn soldiers they catch into zombies; the kaiju's stomp, beam and energy ring kill them. Every 10 s a
barrack sends a truck with new ones for those who died, 5 out at a time. When the fight is over they walk home. Their picture
is `assets/people/soldier.png` (a sheet like a person's: 4 frames, 2 rows); without it a code-drawn soldier is
used. (`src/agents/Soldiers.js`)

A ruined building keeps its place but stops working (no people, patrols, helicopters, planes, ships or fires)
until 🔧 Repair. Ruins can't be moved, but 🚜 Remove clears them.

What moves on its own:
- People walk out of doors, use sidewalks (or cut across grass), and walk into other buildings.
- Cars drive on the right-hand lane of every road and queue behind each other.
- Police cars, the ambulance, taxis (taxi center), the bus (bus stop), mail vans (post office) and garbage
  trucks (recycling plant) leave their building, drive around, and come home. They come out of the garage
  (police, fire station) or door when a road is there, else any side touching a road; with no road touching
  the building they appear on the nearest road within 6 squares.
- The factory's chimneys smoke and the nuclear plant's cooling tower lets off steam.
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
| `src/world/` | Map generation, world state, ground and road drawing, building drawing, effects, day and night (`DayNight.js`), weather (`Weather.js`). |
| `src/agents/` | People, cars, patrols, fire trucks, helicopters and fires, planes, ships, disasters, path finding. |
| `src/input/Controls.js` | Touch and mouse: tools, pan, pinch-zoom. |
| `src/art/` | Pixel rasterizer and the code-drawn art (grass, sand, water, roads, people, cars, planes, ruined buildings). |
