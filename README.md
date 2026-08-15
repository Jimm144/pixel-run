# PIXEL RUN

PIXEL RUN is a fast-paced, browser-based endless runner and 2D platformer built with TypeScript, React, Vite, and HTML5 Canvas.

- **Play in your browser**: [https://jimm144.github.io/pixel-run/](https://jimm144.github.io/pixel-run/)
- **Play on itch.io**: [https://jimm144.itch.io/pixel-run](https://jimm144.itch.io/pixel-run)

---

## Screenshots

![NEON JUNGLE](public/screenshots/jungle.png)
![SCORCHED DESERT](public/screenshots/desert.png)
![FROZEN TUNDRA](public/screenshots/tundra.png)
![NEON CITY](public/screenshots/city.png)

---

## Gameplay

The player runs automatically across procedural terrain. Jump, double jump, boost, and dive-slam through four distinct biomes: **Neon Jungle**, **Scorched Desert**, **Frozen Tundra**, and **Neon City**.

- **Enemy Interactions**: Stomp ground enemies from above or outmaneuver airborne flyers.
- **Dive-Slam**: Perform mid-air downward slams to crush rooted hazards and break ground traps.
- **Score Multiplier & Combos**: Chaining stomps, coins, gems, and power-up pickups builds a multiplier up to **x10**.
- **Power-Ups**:
  - **Shield**: Absorbs one fatal hit or hazard.
  - **Jump Shoes**: Supercharges jump height.
  - **Triple Jump**: Grants a third mid-air leap.
  - **Propeller Hat**: Provides extended floatation and air stall.
- **Local Persistence**: High scores, run statistics, volumes, and daily quest progression are saved automatically in `localStorage`.

---

## Dynamic Day / Night Cycle & Moon Phases

The sky dynamically transitions across a continuous day/night curve with celestial movements and subtle foreground ambient lighting:

- **Daytime**: The sun illuminates the landscape with biome-tailored atmospheric halos.
- **Nighttime**: Sky darkens into midnight gradients, stars twinkle in the upper atmosphere, and the moon rises.
- **5 Progressive Moon Phases**:
  1. **Full Moon** (100% illuminated)
  2. **Waning Gibbous** (~75% illuminated)
  3. **Half Moon** (50% illuminated)
  4. **Waning Crescent** (~25% illuminated)
  5. **Blood Eclipse**: A cosmic crimson eclipse with fiery corona flares and deep eclipsed shadow.

---

## Biomes

Four procedurally generated biomes alternate with smooth crossfading transitions:

1. **Neon Jungle**: Dense rainforest banyan canopies, palms, spore mushrooms, and tropical frogs.
2. **Scorched Desert**: Saguaro cacti, desert ruins, ancient pyramids, and skittering scarabs.
3. **Frozen Tundra**: Snow-capped pines, alpine firs, ice crystals, and frosty drones.
4. **Neon City**: Cyberpunk skyscrapers, glowing interior window grids, and drone flyers.

---

## Controls

### Keyboard
- **Jump**: `SPACE`, `W`, `UP`, `Z`, or `K` (Press twice for Double Jump, hold for higher leaps)
- **Dive-Slam**: `S`, `DOWN`, or `J` (Mid-air slam)
- **Boost**: `D` or `RIGHT`
- **Pause**: `P` or `ESC`

### Touch / Mobile
- **Tap**: Jump / Double Jump
- **Hold**: Higher Jump
- **DIVE Button**: Dive-Slam
- **Pause Button**: Pause / Resume

---

## Daily Quests

Four daily quests generate automatically based on the local calendar date:

- **Tiers**: Easy (40%), Medium (34%), Hard (20%), Special (5%), Impossible (1%)
- **Objectives**: Distance goals, score thresholds, combo milestones, power-up collections, enemy stomps, clean runs (zero kills/pickups), and eclipse survivals.

---

## Technical Highlights & Optimizations

- **Pure Canvas Rendering**: 100% procedural pixel art drawn on a single HTML5 canvas with zero image assets.
- **Web Audio API Synth**: 4-channel chiptune synthesizer generating melodies, basslines, drums, and SFX in real time.
- **Zero-Dependency Core**: Lightweight architecture resulting in a single self-contained HTML build (`~357 kB`).
- **High-Performance Game Loop**:
  - Pre-parsed $O(1)$ integer RGB color caching (`HEX_CACHE`).
  - $O(N)$ in-place linear two-pointer entity compaction.
  - Deterministic offscreen platform caching.
  - Batched particle state updates and star matrix transforms.

---

## Development

### Prerequisites
Requires [Node.js](https://nodejs.org/).

### Setup & Run
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
```

Generates a single self-contained `dist/index.html` file using `vite-plugin-singlefile`.

---

## License

GPL-3.0. See [`LICENSE`](LICENSE).
