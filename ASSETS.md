# Art guide

Every image the game uses can be replaced by your own PNG. Put files in `assets/` with the exact names below.
Anything missing keeps its code-drawn placeholder, so you can swap art in one file at a time.

**Fastest way to start:** run `npm run templates`. It writes every placeholder to `templates/` with the right
name and size. Use those as img2img inputs or tracing guides. When a file is finished, copy it into the
matching folder under `assets/`.

## Buildings: one folder per menu

Buildings come in themes. The "city" theme reads every picture in `assets/building-city/`:

```
assets/building-city/
  House/house-1x1.png         -> a "House" button in the build bar, with a 1 x 1 "House" in its menu
  House/apartment-2x1.png
  Shop/cafe-1x1.png
  Transport/airport-10x10.png
```

- **Folder = build bar button.** Icons and order are set in `src/themes/city.js` (`menus`); a new folder
  gets a 📦 icon until you add it there.
- **File name = `<name>-<W>x<D>.png`.** `W` runs down-right on screen and `D` runs down-left. The name shown in
  the game comes from `names` in `src/themes/city.js`, or from the file name.
- **Image width = (W + D) × 64 px, exactly**, any height. The footprint's bottom corner touches the bottom edge,
  and its left and right corners touch the left and right edges. `npm run art` makes this for you (below).
- **🔄 mirrors the picture**, so a 2 × 1 building turned becomes 1 × 2.
- Doors default to the middle of the down-left face. Special cases (the police garage, the airport's runway,
  parking spots and terminals) are in `buildings` in `src/themes/city.js`.

### Making the game files: `npm run art`

Draw big (for example 512 px per 1 × 1 square) with a transparent background, and save it under the same name in
`art-source/`:

```
art-source/building-city/House/house-1x1.png  ->  assets/building-city/House/house-1x1.png (128 px wide)
```

```bash
npm run art
```

```bash
npm run art -- --preview
```

```bash
npm run art -- skyscraper
```

```bash
npm run art -- --all
```

The first converts only pictures that are new or changed since they were last converted, so you can drop new
buildings in and run it again. The second converts everything and also writes 4× zoomed copies to `art-preview/`
for checking. The third converts files whose name contains "skyscraper", even if they were converted before.
The fourth converts everything again (use it after changing the converter itself).

For each building it scales the whole picture to (W + D) × 64 px wide using the size in the file name (a 512 px
wide 1 × 1 picture is shrunk exactly 4 ×, averaging 4 × 4 pixels into one), keeps the bottom edge in place, makes
the edges hard (no half-transparent pixels), cuts off anything below the footprint's front edges, and reduces the
colours to 64. It warns when the picture's shape doesn't match the size in the name.

### Night lights

At night the two front walls of every building (not decorations) are painted with warm light, brightest at the
bottom, while the roof stays dark. This is made in code from the building picture (`src/art/floodlight.js`), so
nothing needs drawing. Other kinds, set with `lights` in `src/themes/city.js`:
`'ground'` = spotlights at the foot of the walls shining up (tall landmarks, cages, stands; a tall one also
gets rows of spotlights higher up so it is lit to the top), `'base'` = those but only lighting the bottom of it (the
towers), `'spots'` = those plus spotlights at the top of the walls shining down, `'field'` = the whole picture
floodlit in white (the stadiums), and `false` = none (Mount Fuji). `blinks: true` puts small white twinkling lights along a tower's body and a blinking red one
on its top (Eiffel Tower, Tokyo Tower, Sky Tree, Shanghai Tower).
Docks have `yard: { every: 2 }`: floodlights on poles every 2 squares over the yard, each with a pool of light.
The airport's terminals and tower (its `parts`) get their front walls lit, and its `yard` puts floodlights at
chosen points in front of the gates (`lamps`, with the light falling `aim` squares away). A part marked
`thin: true` (the control tower) has the ground inside its box (the colour at `apron`, and grass) cut out of its
standing picture, so only the tower itself stands up and gets lit.
An open courtyard can be lit with `inside` (the Louvre): `floor: [x, y, w, d]` is the courtyard in squares,
`lamps` are points with a pool of light `reach` squares wide on its floor, and `glow: { x, y, r }` makes a glass
roof glow gold from inside (the pyramid). These are painted into the building's night picture, so they stay
behind anything standing in front of it.
Lamps are set with `glows`, e.g. the lamp post: `lamppost: { glows: [{ px: 53, py: 18 }, { px: 73, py: 24 }] }`
(pixels of the game picture).

### Other images

The converter also makes ground, road, people and vehicle files: save the big picture as
`art-source/<folder>/<game name>.png` (for example `art-source/ground/sand_0.png`). For those it first removes a
plain background and trims the picture. To cut several pictures out of one sheet, list them in
`art-source/convert.json`:

```json
{ "jobs": [ { "from": "tiles.webp", "crop": [0, 0, 512, 256], "to": "ground/sand_0.png" } ] }
```

Options per job: `fuzz` (background tolerance in %, default 12), `colors` (default 64, 0 = keep all), `outline`
(darken the outer edge), `alphaCut` (0–1, default 0.5), `clip: false` (don't cut along the footprint / tile),
`width` / `height`.

## Menu picture

Put the start screen picture in `assets/ui/menu.png` (or `.jpg` / `.webp`). It fills the screen from the top,
so keep the title near the top; the ＋ button and the city list sit about a third of the way down. Without the
file the menu shows a plain "City Builder" title.

## Rules for every image

- **One square = a 128 × 64 px diamond** (2:1 isometric). Draw 1:1, so one art pixel is one image pixel.
- **Light comes from the top-left.** Top faces are brightest, faces pointing down-left are medium,
  and faces pointing down-right are darkest.
- **Transparent background** (PNG with alpha) for everything except ground tiles' corners, which must also be transparent.
- **Edges of the diamond:** use the classic 2:1 staircase (2 pixels across for every 1 pixel down).
  Ground tiles must fill the diamond exactly so neighbours meet without gaps.
- **AI tip:** generate big, then downscale to the exact size with *nearest neighbour*, reduce the palette
  (e.g. 32–64 colours), and clean up the transparent edge.

Directions used in file names (as seen on screen):
`ne` = up-right, `se` = down-right, `sw` = down-left, `nw` = up-left.
Corners: `n` = top, `e` = right, `s` = bottom, `w` = left.

## Ground (`assets/ground/`)

Grass, sand, water, pavement and roads are drawn by code (grass is plain green with a light texture of specks and blades). You only need these
files if you want to replace that look.

| File | Size | Notes |
|---|---|---|
| `grass_0.png` … `grass_3.png` | 128 × 64 | Variants are mixed randomly. 1–4 files. (Replaces the code-drawn grass.) |
| `sand_0.png` … `sand_3.png` | 128 × 64 | |
| `water_0.png` … `water_3.png` | 128·N × 64 | N animation frames side by side (e.g. 4 frames = 512 × 64). |
| `edge_grass_ne/se/sw/nw.png` | 128 × 64 | Grass spilling onto a sand square from that side. |
| `edge_grass_n/e/s/w.png` | 128 × 64 | Same, for a single corner. |
| `edge_foam_ne/se/sw/nw.png`, `edge_foam_n/e/s/w.png` | 128 × 64 | Foam on a water square next to the beach. |
| `pavement_0.png` … `pavement_3.png` | 128 × 64 | Paving for the Plot tool. |
| `edge_bank_ne/se/sw/nw.png`, `edge_bank_n/e/s/w.png` | 128 × 64 | Grassy bank on a water square next to grass. |
| `edge_quay_ne/se/sw/nw.png`, `edge_quay_n/e/s/w.png` | 128 × 64 | Stone quay on a water square next to pavement. |
| `edge_curb_ne/se/sw/nw.png` | 128 × 64 | Kerb on a pavement square next to grass or sand (sides only). |

## Roads (`assets/roads/`)

Each road square has **two lanes in the middle and a sidewalk along each edge** (about 1/8 of the square wide).
Cars drive on the right; people walk on the sidewalk.

Pick one of two ways:

**Kit (5 files):** the game stacks them to make every shape.
- `road_center.png`: a lone road square with sidewalk on all four edges.
- `road_arm_ne.png`, `road_arm_se.png`, `road_arm_sw.png`, `road_arm_nw.png`: only the strip
  from the middle of the square to that edge, covering that edge's sidewalk with road (plus the centre line).
  Everything else is transparent.

**Full tiles (16 files, best look):** one finished tile per shape, named by the connected sides in the
order `ne, se, sw, nw`:
`road_none`, `road_ne`, `road_se`, `road_sw`, `road_nw`, `road_ne-se`, `road_ne-sw`, `road_ne-nw`,
`road_se-sw`, `road_se-nw`, `road_sw-nw`, `road_ne-se-sw`, `road_ne-se-nw`, `road_ne-sw-nw`,
`road_se-sw-nw`, `road_ne-se-sw-nw`.
Any full tile you provide wins over the kit for that shape.

## People (`assets/people/`)

`person_0.png` … `person_4.png`: a sheet of **32 × 48 px frames**, 4 walking frames across and 2 rows (128 × 96 total).
- Row 1: walking **down-right** (toward the viewer).
- Row 2: walking **up-right** (away from the viewer).
- The game mirrors these for the other two directions.
- Feet touch the bottom row of the frame, centred. A person is about 24–28 px tall.

## Vehicles (`art-source/vehicles/`)

Draw each vehicle as one sheet: **4 views side by side with some empty space between them** on a transparent background, facing
(left to right) **down-left, down-right, up-right, up-left**. Any size; the views are cut out and shrunk.

1. Save it in `art-source/vehicles/`, e.g. `bus-sheet.png`.
2. Add a line for it in `src/data/vehicles.js` with its game width (one square is 128 px wide), e.g.
   `bus: { sheet: 'bus-sheet.png', width: 80 }`.
3. Run `npm run art`. It writes `assets/vehicles/bus.png`.

Changing a width in `src/data/vehicles.js` and running `npm run art` again re-makes the vehicles.

| Sheet | Used for |
|---|---|
| `car-sheet-blue/green/red/white/yellow.png` | Traffic (a random colour for each car). |
| `police-sheet.png`, `ambulance-sheet.png` | Patrols from the police station and the hospital. |
| `firetruck-sheet.png` | Drives to fires from the fire station. |
| `taxi-sheet.png`, `bus-sheet.png`, `mailvan-sheet.png`, `garbagetruck-sheet.png` | From the taxi center, bus stop, post office and recycling plant. |
| `helicopter-sheet-police/fire/hospital.png` | Helicopters on those roofs. |
| `airplane-sheet.png` | Airport planes. |
| `containership-sheet.png`, `cruiseship-sheet.png` | Ships of the container dock and the passenger dock. |
| `tractor-sheet.png` | The farm's tractor (works the wheat fields nearby). |
| `tank-sheet.png`, `militarytruck-sheet.png` | Out on the roads from the military base. |
| `fighterjet-sheet.png`, `bomber-sheet.png`, `militaryhelicopter-sheet.png` | The military airport's two runways and its helipad. |
| `destroyer-sheet.png`, `aircraftcarrier-sheet.png` | Ships of the military dock. |

Without these files the game falls back to simple code-drawn cars and planes.

## Disasters (`art-source/disaster/`)

`volcano-8x8.png`: the volcano, drawn like a building that covers 8 × 8 squares (any size, transparent
background). `npm run art` shrinks it to 1024 px wide. The crater's position in that picture is set in
`src/agents/Disasters.js` (`CRATER`).

## Effects (`assets/fx/`)

`smoke.png` (about 10 × 10) for chimney puffs, and `dust.png` (about 8 × 8) for building and bulldozing dust.

## App icons (`public/icons/`)

`icon-192.png`, `icon-512.png`, and `apple-touch-icon.png` (180 × 180).
