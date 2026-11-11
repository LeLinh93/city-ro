# Art guide

Every image the game uses can be replaced by your own PNG. Put files in `assets/` with the exact names below.
Anything missing keeps its code-drawn placeholder, so you can swap art in one file at a time.

**Fastest way to start:** run `npm run templates`. It writes every placeholder to `templates/` with the right
name and size. Use those as img2img inputs or tracing guides. When a file is finished, copy it into the
matching folder under `assets/`.

## Converting big AI images: `npm run art`

You can keep your art big and let the converter make the game files. For each image it:
1. removes the plain background (flood fill from the edges),
2. trims to the object,
3. shrinks it to the exact game size by averaging pixels (thin lines survive),
4. makes edges hard (no half-transparent pixels, no white halo),
5. cuts buildings along their footprint's front edges and tiles to the exact diamond,
6. reduces the colours (64 by default, no dithering).

**One image per file:** save it as `art-source/<folder>/<game name>.<png|webp|jpg>`. For example,
`art-source/buildings/house.webp` becomes `assets/buildings/house.png` (128 px wide).

**Several buildings in one sheet:** list them in `art-source/convert.json`. `crop` is `[x, y, width, height]`
in the source image, with a little white space around the building:

```json
{
  "jobs": [
    { "from": "shops.webp", "crop": [0, 60, 512, 470], "to": "buildings/house.png" },
    { "from": "shops.webp", "crop": [0, 530, 512, 494], "to": "buildings/longhouse.png", "outline": true }
  ]
}
```

Commands:

```bash
npm run art
```

```bash
npm run art -- --preview
```

```bash
npm run art -- house
```

The first converts everything. The second also writes 4× zoomed copies to `art-preview/` for checking.
The third only converts outputs whose name contains "house".

Options per job: `fuzz` (background tolerance in %, default 12: raise it if a white fringe stays,
lower it if light parts of the building disappear), `colors` (default 64), `outline` (darken the outer
edge), `alphaCut` (0–1, default 0.5), `clip: false` (don't cut along the footprint), `footprint: [W, D]`,
`width` / `height`.

The converter warns when a building's shape doesn't match its footprint in `src/data/buildings.js`.
For example, a building whose long side runs down-left would be 1 × 2, not 2 × 1.

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

| File | Size | Notes |
|---|---|---|
| `grass_0.png` … `grass_3.png` | 128 × 64 | Variants are mixed randomly. 1–4 files. |
| `sand_0.png` … `sand_3.png` | 128 × 64 | |
| `water_0.png` … `water_3.png` | 128·N × 64 | N animation frames side by side (e.g. 4 frames = 512 × 64). |
| `edge_grass_ne/se/sw/nw.png` | 128 × 64 | Grass spilling onto a sand square from that side. |
| `edge_grass_n/e/s/w.png` | 128 × 64 | Same, for a single corner. |
| `edge_foam_ne/se/sw/nw.png`, `edge_foam_n/e/s/w.png` | 128 × 64 | Foam on a water square next to the beach. |

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

## Trees (`assets/trees/`)

`tree_0.png` … `tree_5.png`: about 64–128 px wide, any height. The **bottom-centre pixel** is where the tree
touches the ground. To make trees sway, draw the frames side by side and set `tree.frameW` / `tree.frameH`
in `src/data/art.js`.

## Buildings (`assets/buildings/`)

For a building that covers **W × D squares**:

- **Image width = (W + D) × 64 px, exactly.**
- Any height. The **bottom corner of the footprint touches the bottom edge** of the image, and the left
  and right corners touch the left and right edges.
- `W` runs down-right on screen and `D` runs down-left.

| Building | File | Footprint | Width | Placeholder height |
|---|---|---|---|---|
| House | `house.png` | 1 × 1 | 128 | 132 |
| Long house | `longhouse.png` | 2 × 1 (long side down-right) | 192 | 160 |
| Skyscraper | `skyscraper.png` | 4 × 4 | 512 | 744 |
| Police | `police.png` | 4 × 4 | 512 | 356 |
| Airport (buildings) | `airport.png` | 10 × 10 | 1280 | 826 |
| Airport (ground) | `airport_base.png` | 10 × 10 | 1280 | 640 (flat) |

**Rotation.** By default a rotated building is the same picture mirrored. Add `<name>_r.png`
(for example `longhouse_r.png`) to give the rotated version its own art. Draw it for the rotated footprint (D × W).

**Doors, garages, chimneys.** People walk into the door square, police cars use the garage, and smoke
comes out of chimneys. These positions live in `src/data/buildings.js` in squares (x, y) and height in
pixels (z). If your art puts the door somewhere else, change the numbers there. Current placeholders:

- House: door on the down-left face; chimney at x 0.33, y 0.33, top 62 px up.
- Long house: door on the long down-left face, second square; chimney at x 0.38, y 0.5, top 58 px up
  (move or delete the `smoke` entry if your building has no chimney).
- Skyscraper and police: door on the down-left face, second square from the left. Police garage is on the
  down-right face, third square.
- Airport (squares counted in the airport's own 10 × 10 grid; x runs down-right, y runs down-left):
  runway on rows y 8–9 (the front-left edge), taxiway centred on y 7, apron x 2.6–10 and y 3–6.5,
  plane parking spots at (3.9, 4.6), (6.3, 4.6), (8.7, 4.6), terminal on x 3–9, y 0–2, door on the
  down-right face at square (9, 1). The easiest way to match it is to paint over `templates/buildings/airport_base.png`.

## People (`assets/people/`)

`person_0.png` … `person_4.png`: a sheet of **32 × 48 px frames**, 4 walking frames across and 2 rows (128 × 96 total).
- Row 1: walking **down-right** (toward the viewer).
- Row 2: walking **up-right** (away from the viewer).
- The game mirrors these for the other two directions.
- Feet touch the bottom row of the frame, centred. A person is about 24–28 px tall.

## Vehicles (`assets/vehicles/`)

Frames across are animation frames, and 2 rows are the facings (row 1 down-right, row 2 up-right). The
point under the middle of the vehicle sits at **75 % down, centred** in each frame.

| File | Frame | Sheet | Notes |
|---|---|---|---|
| `car_0.png` … `car_3.png` | 64 × 48 | 64 × 96 | 1 frame per row (or more for animation). |
| `police_car.png` | 64 × 48 | 128 × 96 | 2 frames per row: light bar red/blue, then blue/red. |
| `plane_0.png`, `plane_1.png` | 384 × 256 | 384 × 512 | Ground point at (192, 192). The game draws the shadow. |

## Effects (`assets/fx/`)

`smoke.png` (about 10 × 10) for chimney puffs, and `dust.png` (about 8 × 8) for building and bulldozing dust.

## App icons (`public/icons/`)

`icon-192.png`, `icon-512.png`, and `apple-touch-icon.png` (180 × 180).
