# Weather Precipitation (Forecast Field) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a precipitation forecast color field to the weather overlay from the Open-Meteo precipitation already in the forecast response, with precipitation in the tap readout. RainViewer real-time radar is deferred to a focused follow-on (user decision: pipeline-first).

**Architecture:** Spec step 6 (forecast-field half). The forecast URL already requests `precipitation`; this plan parses it into the grid (new optional `precipitation` field, mm) and renders it as a smooth canvas color field, the same technique as waves, minus the direction arrows. No new fetch and no marine-style gating: precipitation rides the forecast grid that is already fetched whenever weather is active. The temporary duplication of the canvas-field lifecycle between `waves-overlay` and `precip-overlay` is intentional; the /simplify pass extracts the shared field overlay and pixel builder once both concrete cases exist.

**Tech Stack:** Svelte 5 runes, MapLibre GL JS 5 (canvas source + raster layer), TypeScript, Vitest. Precipitation stored in mm (the hourly total Open-Meteo returns), shown as mm/h at the display edge. The canvas pixel render is verified live; the pixel-array builder is pure and unit-tested.

**Pi build policy:** Lead runs every verification, one heavy command at a time, `NODE_OPTIONS="--max-old-space-size=2048"`. Per task: targeted `npx vitest run <file>` plus the fast pre-commit hook. Full heavy chain at the push checkpoint, which the pre-push hook enforces. American English, no em dashes, Oxford commas, no "&" in text, minimal comments, named re-exports only. Reuse the shared `lerp`, `sampleRamp`, and the established overlay pattern.

---

### Task 1: Parse precipitation into the forecast grid

**Files:**
- Modify: `src/entities/weather/weather-grid.ts`
- Modify: `src/features/weather/weather-client.ts`
- Modify: `src/features/weather/weather-client.test.ts`

- [ ] **Step 1: Extend the failing test.** The `loc` fixture in `weather-client.test.ts` already includes `precipitation: [0, 0.2]`. In the first `fetchForecast` test, add:

```ts
    expect(grid?.precipitation?.[0]?.[0]).toBe(0);
    expect(grid?.precipitation?.[1]?.[0]).toBeCloseTo(0.2, 4);
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/weather-client.test.ts`. Expected: FAIL.

- [ ] **Step 3: Add the field.** In `weather-grid.ts`, add after `pressureMsl`:

```ts
  precipitation?: number[][]; // mm (hourly total)
```

- [ ] **Step 4: Parse it.** In `weather-client.ts`, add `precipitation?: number[];` to `OmLoc.hourly`. In `parse`, add a `precipitation` array and fill it in the cell loop:

```ts
  const precipitation = grid2d(steps, cells);
```

In the inner `t` loop, after the pressure line:

```ts
      const mm = h?.precipitation?.[t];
      if (mm !== undefined) precipitation[t][c] = mm;
```

(`h` is already `locs[c]?.hourly`.) Return it: `return { lats, lons, times, windU, windV, pressureMsl, precipitation };`

- [ ] **Step 5: Run tests green.** Run: `npx vitest run src/features/weather/weather-client.test.ts`. Expected: PASS.

- [ ] **Step 6: Format and commit.**

```bash
/usr/local/bin/biome check --write src/entities/weather/weather-grid.ts src/features/weather/weather-client.ts src/features/weather/weather-client.test.ts
git add src/entities/weather/weather-grid.ts src/features/weather/weather-client.ts src/features/weather/weather-client.test.ts
git commit -m "feat(weather): parse precipitation into the forecast grid"
```

---

### Task 2: Precipitation colormap

**Files:**
- Create: `src/features/weather/precip-colormap.ts`
- Test: `src/features/weather/precip-colormap.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { precipColor } from './precip-colormap';

describe('precipColor', () => {
  it('is transparent when dry and opaque when raining', () => {
    expect(precipColor(0, 'day')[3]).toBeCloseTo(0, 2);
    expect(precipColor(10, 'day')[3]).toBeGreaterThan(0.4);
  });
  it('uses no blue at night-red', () => {
    const [r, , b] = precipColor(10, 'night-red');
    expect(r).toBeGreaterThan(b);
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/precip-colormap.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** (reuse the shared `sampleRamp`; stops in mm/h).

```ts
import { type Rgba, sampleRamp } from './color-ramp';
import type { Theme } from '$shared/ui';

// Precipitation stops in mm/h. Day and dusk use a radar-style ramp (light blue, blue, green, yellow,
// orange, red, violet) rising with intensity; blue is acceptable by day. Night-red: a red band on
// black, brightness rising with rate, no blue. Alpha is capped so the field stays an overlay.
const DAY: Array<[number, Rgba]> = [
  [0, [0.4, 0.7, 0.95, 0.0]],
  [0.2, [0.4, 0.7, 0.95, 0.4]],
  [1, [0.2, 0.5, 0.9, 0.5]],
  [2.5, [0.24, 0.75, 0.45, 0.55]],
  [5, [0.9, 0.85, 0.25, 0.6]],
  [10, [0.94, 0.55, 0.22, 0.65]],
  [20, [0.86, 0.26, 0.22, 0.7]],
  [40, [0.6, 0.2, 0.6, 0.75]],
];
const NIGHT: Array<[number, Rgba]> = [
  [0, [0.3, 0.04, 0.03, 0.0]],
  [1, [0.45, 0.08, 0.06, 0.4]],
  [10, [0.7, 0.15, 0.1, 0.6]],
  [40, [1.0, 0.3, 0.2, 0.75]],
];

export function precipColor(mmPerHour: number, theme: Theme): Rgba {
  return sampleRamp(theme === 'night-red' ? NIGHT : DAY, mmPerHour);
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/precip-colormap.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/precip-colormap.ts src/features/weather/precip-colormap.test.ts
git add src/features/weather/precip-colormap.ts src/features/weather/precip-colormap.test.ts
git commit -m "feat(weather): precipitation colormap"
```

---

### Task 3: Precipitation field pixel builder

**Files:**
- Create: `src/features/weather/precip-field.ts`
- Test: `src/features/weather/precip-field.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import type { WeatherGrid } from '$entities/weather';
import { precipFieldRgba } from './precip-field';

function grid(): WeatherGrid {
  const cells = 4; // 2x2
  return {
    lats: [0, 1],
    lons: [0, 1],
    times: [0],
    windU: [new Array(cells).fill(0)],
    windV: [new Array(cells).fill(0)],
    precipitation: [[10, 10, 0, 0]],
  };
}

const bracket = { lo: 0, hi: 0, frac: 0 };

describe('precipFieldRgba', () => {
  it('builds an RGBA buffer at grid resolution, north up', () => {
    const f = precipFieldRgba(grid(), bracket, 'day');
    expect(f?.width).toBe(2);
    expect(f?.height).toBe(2);
    expect(f?.data.length).toBe(2 * 2 * 4);
    // Canvas row 0 is the northernmost grid row (lats[1]), which is the dry (0 mm) row -> alpha 0.
    expect(f?.data[3]).toBe(0);
    // The southern row (lats[0]) has 10 mm/h -> alpha > 0.
    const southAlpha = f?.data[(1 * 2 + 0) * 4 + 3] ?? 0;
    expect(southAlpha).toBeGreaterThan(0);
  });

  it('is empty without precipitation data', () => {
    const g = grid();
    g.precipitation = undefined;
    expect(precipFieldRgba(g, bracket, 'day')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/precip-field.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** (mirror `wave-field.ts`).

```ts
import type { TimeBracket, WeatherGrid } from '$entities/weather';
import { lerp } from '$shared/lib';
import type { Theme } from '$shared/ui';
import { precipColor } from './precip-colormap';

export interface PrecipField {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// A precipitation RGBA bitmap at grid resolution, blended across the bracketing forecast steps and
// colored by the precipitation colormap. Canvas row 0 is the northernmost grid row. Returns
// undefined when the grid carries no precipitation. MapLibre smooths this with raster-resampling.
export function precipFieldRgba(
  grid: WeatherGrid,
  bracket: TimeBracket,
  theme: Theme,
): PrecipField | undefined {
  const pp = grid.precipitation;
  if (!pp || pp.length === 0) return undefined;
  const cols = grid.lons.length;
  const rows = grid.lats.length;
  const lo = pp[bracket.lo] ?? [];
  const hi = pp[bracket.hi] ?? lo;
  const data = new Uint8ClampedArray(cols * rows * 4);
  for (let py = 0; py < rows; py += 1) {
    const gridRow = rows - 1 - py;
    for (let px = 0; px < cols; px += 1) {
      const i = gridRow * cols + px;
      const [r, g, b, a] = precipColor(lerp(lo[i], hi[i], bracket.frac), theme);
      const o = (py * cols + px) * 4;
      data[o] = r * 255;
      data[o + 1] = g * 255;
      data[o + 2] = b * 255;
      data[o + 3] = a * 255;
    }
  }
  return { data, width: cols, height: rows };
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/precip-field.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/precip-field.ts src/features/weather/precip-field.test.ts
git add src/features/weather/precip-field.ts src/features/weather/precip-field.test.ts
git commit -m "feat(weather): precipitation field pixel builder"
```

---

### Task 4: Precipitation overlay (canvas field)

**Files:**
- Create: `src/features/weather/precip-overlay.ts`
- Test: `src/features/weather/precip-overlay.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { WeatherStore } from '$entities/weather';
import { mapThemePaint, type OverlayContext } from '$shared/map';
import { createFakeMap } from '$shared/testing/fake-map';
import { createPrecipOverlay } from './precip-overlay';

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

function fakeCanvas() {
  return { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
}

function storeWithGrid(): WeatherStore {
  const store = new WeatherStore();
  const cells = 4;
  store.setGrid({
    lats: [0, 1],
    lons: [0, 1],
    times: [1000],
    windU: [new Array(cells).fill(0)],
    windV: [new Array(cells).fill(0)],
    precipitation: [new Array(cells).fill(5)],
  });
  return store;
}

describe('precip overlay', () => {
  it('adds a field source and layer in the weather band', () => {
    const overlay = createPrecipOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(overlay.band).toBe('weather');
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(1);
  });

  it('syncs without throwing', () => {
    const overlay = createPrecipOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(() => overlay.sync(ctxFor(map))).not.toThrow();
  });

  it('removes its layer and source', () => {
    const overlay = createPrecipOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });

  it('recolors for the theme without throwing', () => {
    const overlay = createPrecipOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(() => overlay.applyTheme?.(ctxFor(map), mapThemePaint('night-red'))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/precip-overlay.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** (mirror the field half of `waves-overlay.ts`, no arrow layer).

```ts
import type { CanvasSourceSpecification, RasterLayerSpecification } from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import type { Theme } from '$shared/ui';
import { precipFieldRgba } from './precip-field';

const FIELD_SOURCE = 'binnacle-weather-precip-field';
const FIELD_LAYER = 'binnacle-weather-precip-field-layer';

type Quad = [[number, number], [number, number], [number, number], [number, number]];
type CanvasFactory = () => HTMLCanvasElement;

export interface PrecipOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function defaultCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

const PLACEHOLDER_COORDS: Quad = [
  [0, 0.0001],
  [0.0001, 0.0001],
  [0.0001, 0],
  [0, 0],
];

// The precipitation overlay: a rain-rate color field drawn to a canvas at grid resolution and
// smoothed by the GPU, in the weather band. Off by default. Redrawn only when the grid, the selected
// time, or the theme changes; the source is animated so MapLibre re-reads the canvas after a redraw.
export function createPrecipOverlay(
  store: WeatherStore,
  makeCanvas: CanvasFactory = defaultCanvas,
): PrecipOverlay {
  const canvas = makeCanvas();
  let theme: Theme = 'day';
  let lastGrid: unknown;
  let lastTime = Number.NaN;
  let lastTheme: Theme | undefined;

  function redraw(): void {
    const grid = store.grid;
    const field = grid ? precipFieldRgba(grid, store.bracket, theme) : undefined;
    const context = canvas.getContext('2d');
    if (!field || !context) return;
    canvas.width = field.width;
    canvas.height = field.height;
    const image = context.createImageData(field.width, field.height);
    image.data.set(field.data);
    context.putImageData(image, 0, 0);
  }

  function fieldCoords(): Quad | undefined {
    const grid = store.grid;
    if (!grid || grid.lons.length === 0 || grid.lats.length === 0) return undefined;
    const w = grid.lons[0];
    const e = grid.lons[grid.lons.length - 1];
    const s = grid.lats[0];
    const n = grid.lats[grid.lats.length - 1];
    return [
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ];
  }

  return {
    id: 'weather-precip',
    title: 'Precipitation',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [FIELD_LAYER],
    add(ctx) {
      if (!ctx.map.getSource(FIELD_SOURCE)) {
        const source: CanvasSourceSpecification = {
          type: 'canvas',
          canvas,
          coordinates: PLACEHOLDER_COORDS,
          animate: true,
        };
        ctx.map.addSource(FIELD_SOURCE, source);
      }
      if (!ctx.map.getLayer(FIELD_LAYER)) {
        const layer: RasterLayerSpecification = {
          id: FIELD_LAYER,
          type: 'raster',
          source: FIELD_SOURCE,
          paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
      }
    },
    sync(ctx) {
      const grid = store.grid;
      if (grid === lastGrid && store.selectedTime === lastTime && theme === lastTheme) return;
      lastGrid = grid;
      lastTime = store.selectedTime;
      lastTheme = theme;
      redraw();
      const coords = fieldCoords();
      const fieldSource = ctx.map.getSource(FIELD_SOURCE) as
        | { setCoordinates?(c: Quad): void }
        | undefined;
      if (coords) fieldSource?.setCoordinates?.(coords);
    },
    remove(ctx) {
      if (ctx.map.getLayer(FIELD_LAYER)) ctx.map.removeLayer(FIELD_LAYER);
      if (ctx.map.getSource(FIELD_SOURCE)) ctx.map.removeSource(FIELD_SOURCE);
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(FIELD_LAYER, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(FIELD_LAYER, 'raster-opacity', opacity);
    },
    applyTheme(_ctx, paint) {
      theme = paint.theme;
      lastTheme = undefined; // force a field redraw in the theme's colors on the next sync
    },
  };
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/precip-overlay.test.ts`. Expected: PASS.

- [ ] **Step 5: Format, then type-check** (the canvas/raster types are the risk; catch early): `NODE_OPTIONS="--max-old-space-size=2048" npm run check`. Expected: 0 errors.

- [ ] **Step 6: Commit.**

```bash
git add src/features/weather/precip-overlay.ts src/features/weather/precip-overlay.test.ts
git commit -m "feat(weather): precipitation overlay (canvas field)"
```

---

### Task 5: Add precipitation to the tap readout

**Files:**
- Modify: `src/features/weather/weather-readout.ts`
- Modify: `src/features/weather/weather-readout.test.ts`

- [ ] **Step 1: Extend the failing test.** Add `precipitation: [[2, 2, 2, 2], [2, 2, 2, 2]]` to the `grid` fixture, and in the first case assert `expect(r?.precipitationMm).toBeCloseTo(2, 4);`.

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/weather-readout.test.ts`. Expected: FAIL.

- [ ] **Step 3: Extend the readout.** Add `precipitationMm?: number;` to `WeatherReadout`, and before the return sample it (with the same `nanToUndef`):

```ts
  const precipField = grid.precipitation?.[timeIndex];
  const precipitationMm = precipField ? nanToUndef(bilinearAt(grid, precipField, lon, lat)) : undefined;
  return { speedMs, fromRad, pressurePa, waveHeightM, wavePeriodS, precipitationMm };
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/weather-readout.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/weather-readout.ts src/features/weather/weather-readout.test.ts
git add src/features/weather/weather-readout.ts src/features/weather/weather-readout.test.ts
git commit -m "feat(weather): add precipitation to the tap readout"
```

---

### Task 6: Wire the precipitation overlay and readout

**Files:**
- Modify: `src/features/weather/index.ts`
- Modify: `src/widgets/chart-canvas/ChartCanvas.svelte`
- Modify: `src/app/App.svelte`

- [ ] **Step 1: Export the public API.** In `src/features/weather/index.ts` add `export { createPrecipOverlay } from './precip-overlay';` (keep alphabetical).

- [ ] **Step 2: Register and sync.** In `ChartCanvas.svelte`, add `createPrecipOverlay` to the weather import. Register it right after the waves overlay (so both fields sit at the bottom of the band, precip just above waves), and add `precipOverlay.sync(ctx);` after `wavesOverlay.sync(ctx);` in `tick`:

```ts
    const precipOverlay = createPrecipOverlay(weather);
    await manager.register(precipOverlay);
    if (destroyed) return;
```

- [ ] **Step 3: Readout chip.** In `App.svelte`, after the sea-state span in the `weather-readout` chip, add (precipitation rides the forecast grid, so no new fetch or gating):

```svelte
        {#if weatherReadout.precipitationMm !== undefined && weatherReadout.precipitationMm > 0}
          &middot; rain <b>{fmt(weatherReadout.precipitationMm, 1)}</b> mm/h
        {/if}
```

- [ ] **Step 4: Verify the full gate** (one heavy command at a time):

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check 2>&1 | tee tmp/check.txt | tail -4
NODE_OPTIONS="--max-old-space-size=2048" npm test 2>&1 | tee tmp/test.txt | tail -6
/usr/local/bin/biome ci . 2>&1 | tee tmp/biome.txt | tail -3
NODE_OPTIONS="--max-old-space-size=2048" npm run cruise 2>&1 | tee tmp/cruise.txt | tail -3
NODE_OPTIONS="--max-old-space-size=2048" npm run build 2>&1 | tee tmp/build.txt | tail -4
```

Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add src/features/weather/index.ts src/widgets/chart-canvas/ChartCanvas.svelte src/app/App.svelte
git commit -m "feat(weather): wire the precipitation overlay and readout"
```

---

### Task 7: Docs, simplify, push, live verification, and memory

- [ ] **Step 1: CHANGELOG and README.** Update the Weather entry in `CHANGELOG.md` and the Weather bullet in `README.md` to add precipitation (a forecast rain-rate color field, with rain in the tap readout), and note RainViewer real-time radar is still to come. Drop precipitation from the "follow later" list, leaving cloud, the radar nowcast, and animated wind particles.

- [ ] **Step 2: Run `/simplify`** on the diff. Expect the reviewers to flag the canvas-field lifecycle duplicated between `waves-overlay` and `precip-overlay` and the pixel builder duplicated between `wave-field` and `precip-field`. Extract a shared field overlay (`createFieldOverlay`) and a shared `fieldRgba` pixel builder used by both, refactoring `waves-overlay` to compose them; apply the other findings, skip false positives with reasons.

- [ ] **Step 3: Final gate and push.** The pre-push hook runs the full chain. `git push origin main`.

- [ ] **Step 4: Live-verify** (Playwright, https://boatpi:3443/binnacle/, nssdb CA, no TLS bypass): seed localStorage to enable Precipitation over a region with rain in the forecast; confirm the rain-rate field renders and updates on the time scrub, night-red shows a red field with no blue, and a tap reads the rain rate. Capture day and night screenshots to `tmp/`.

- [ ] **Step 5: Update the project-status memory** to record the precipitation forecast field shipped (commits, test count) and that cloud, the legend/Weather group, the RainViewer radar nowcast, and the WebGL wind particles remain.
