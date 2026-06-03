# Weather Waves and Swell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a wave-height color field (smooth, via a canvas image source) plus sparse wave-direction arrows to the weather overlay, fed by the Open-Meteo marine API merged into the same forecast grid, with wave height and period in the tap-for-value readout.

**Architecture:** Spec step 5 of `docs/superpowers/specs/2026-06-03-binnacle-weather-overlay-design.md`. The marine API is a second Open-Meteo endpoint fetched for the same sampled grid and merged into the existing `WeatherGrid` (new optional `waveHeight`, `waveDirection`, `wavePeriod` fields). The field renders through a MapLibre canvas source drawn at grid resolution and GPU-smoothed with `raster-resampling: linear` (cheap, redrawn only on grid or time change, like the wind and pressure overlays); direction arrows render as a GeoJSON line layer. Both live in the reserved `weather` z-band as one `OverlayModule`.

**Tech Stack:** Svelte 5 runes, MapLibre GL JS 5 (canvas source + raster layer + line layer), TypeScript, Vitest. Wave height in meters (SI), direction stored in radians (converted from the API's degrees), period in seconds. The canvas pixel render is verified live, not unit-tested (the pixel-array builder is pure and unit-tested).

**Pi build policy:** Lead runs every verification, one heavy command at a time, `NODE_OPTIONS="--max-old-space-size=2048"`. Per task: targeted `npx vitest run <file>` plus the fast pre-commit hook (`biome ci .`, `npm run cruise`). Full heavy chain runs once at the push checkpoint, which the pre-push hook also enforces. American English, no em dashes, Oxford commas, no "&" in text, minimal comments, named re-exports only. Reuse the shared `lerp` and the established overlay pattern.

---

### Task 1: Marine fetch and grid wave fields

**Files:**
- Modify: `src/entities/weather/weather-grid.ts` (add wave fields)
- Modify: `src/features/weather/weather-client.ts` (`fetchMarine`, `mergeMarine`)
- Modify: `src/features/weather/weather-client.test.ts`

- [ ] **Step 1: Write the failing test.** Append to `weather-client.test.ts`:

```ts
import { fetchMarine, mergeMarine } from './weather-client';

function marineLoc(height: number[], dir: number[], period: number[]): unknown {
  return {
    hourly: {
      time: [1748908800, 1748912400],
      wave_height: height,
      wave_direction: dir,
      wave_period: period,
    },
  };
}

describe('fetchMarine', () => {
  it('parses wave height, direction (to radians), and period for the grid', async () => {
    const body = [
      marineLoc([1.5, 2], [90, 90], [7, 8]),
      marineLoc([0, 0], [0, 0], [0, 0]),
      marineLoc([0, 0], [0, 0], [0, 0]),
      marineLoc([0, 0], [0, 0], [0, 0]),
    ];
    const fetchFn = vi.fn(async () => res(body));
    const marine = await fetchMarine(
      { west: 0, south: 0, east: 1, north: 1 },
      { maxCells: 4, forecastDays: 1 },
      fetchFn as unknown as typeof fetch,
    );
    expect(marine?.waveHeight[0][0]).toBeCloseTo(1.5, 4);
    expect(marine?.waveDirection[0][0]).toBeCloseTo(Math.PI / 2, 4);
    expect(marine?.wavePeriod[0][0]).toBeCloseTo(7, 4);
  });

  it('returns undefined on failure', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(
      await fetchMarine(
        { west: 0, south: 0, east: 1, north: 1 },
        { maxCells: 4, forecastDays: 1 },
        fetchFn as unknown as typeof fetch,
      ),
    ).toBeUndefined();
  });
});

describe('mergeMarine', () => {
  it('attaches the marine fields to the grid', () => {
    const grid = {
      lats: [0, 1],
      lons: [0, 1],
      times: [1000, 4000],
      windU: [new Array(4).fill(0), new Array(4).fill(0)],
      windV: [new Array(4).fill(0), new Array(4).fill(0)],
    };
    const marine = {
      waveHeight: [new Array(4).fill(2), new Array(4).fill(2)],
      waveDirection: [new Array(4).fill(0), new Array(4).fill(0)],
      wavePeriod: [new Array(4).fill(6), new Array(4).fill(6)],
    };
    const merged = mergeMarine(grid, marine);
    expect(merged.waveHeight?.[0][0]).toBe(2);
    expect(merged.windU).toBe(grid.windU);
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/weather-client.test.ts`. Expected: FAIL (`fetchMarine`/`mergeMarine` not exported).

- [ ] **Step 3: Add wave fields to the grid.** In `weather-grid.ts`, extend `WeatherGrid` after `pressureMsl`:

```ts
  waveHeight?: number[][]; // m, absent over land
  waveDirection?: number[][]; // radians, direction the waves come from
  wavePeriod?: number[][]; // s
```

- [ ] **Step 4: Implement `fetchMarine` and `mergeMarine`.** In `weather-client.ts` add the endpoint constant near `FORECAST_URL`:

```ts
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
```

Add an interface and the functions (reuse the existing `sampleGrid`, `chunk`, and point order):

```ts
export interface MarineFields {
  waveHeight: number[][];
  waveDirection: number[][];
  wavePeriod: number[][];
}

interface MarineLoc {
  hourly?: {
    time?: number[];
    wave_height?: number[];
    wave_direction?: number[];
    wave_period?: number[];
  };
}

// Fetch Open-Meteo marine wave data for the same sampled grid as the forecast. Best-effort: returns
// undefined on any failure so waves degrade without affecting wind or pressure. Direction is
// converted from degrees to radians on parse; height stays in meters, period in seconds (SI).
export async function fetchMarine(
  bbox: Bbox,
  opts: ForecastOptions,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<MarineFields | undefined> {
  const { lats, lons } = sampleGrid(bbox, opts.maxCells);
  const points: Array<{ lat: number; lon: number }> = [];
  for (const lat of lats) for (const lon of lons) points.push({ lat, lon });

  try {
    const chunks = chunk(points, MAX_LOCS_PER_REQUEST);
    const responses = await Promise.all(
      chunks.map((c) => fetchFn(buildMarineUrl(c, opts), { credentials: 'omit' })),
    );
    const locs: MarineLoc[] = [];
    for (const r of responses) {
      if (!r.ok) return undefined;
      const body = (await r.json()) as MarineLoc | MarineLoc[];
      for (const l of Array.isArray(body) ? body : [body]) locs.push(l);
    }
    return parseMarine(locs, lats.length * lons.length);
  } catch {
    return undefined;
  }
}

function buildMarineUrl(points: Array<{ lat: number; lon: number }>, opts: ForecastOptions): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    hourly: 'wave_height,wave_direction,wave_period',
    forecast_days: String(opts.forecastDays),
    timeformat: 'unixtime',
    cell_selection: 'sea',
  });
  return `${MARINE_URL}?${params}`;
}

function parseMarine(locs: MarineLoc[], cells: number): MarineFields | undefined {
  const first = locs[0]?.hourly;
  if (!first?.time || first.time.length === 0) return undefined;
  if (locs.length !== cells) return undefined;
  const steps = first.time.length;
  const height = grid2d(steps, cells);
  const direction = grid2d(steps, cells);
  const period = grid2d(steps, cells);
  for (let c = 0; c < cells; c += 1) {
    const h = locs[c]?.hourly;
    const wh = h?.wave_height ?? [];
    const wd = h?.wave_direction ?? [];
    const wp = h?.wave_period ?? [];
    for (let t = 0; t < steps; t += 1) {
      height[t][c] = wh[t] ?? Number.NaN;
      const d = wd[t];
      direction[t][c] = d === undefined ? Number.NaN : d * DEG_TO_RAD;
      period[t][c] = wp[t] ?? Number.NaN;
    }
  }
  return { waveHeight: height, waveDirection: direction, wavePeriod: period };
}

function grid2d(steps: number, cells: number): number[][] {
  return Array.from({ length: steps }, () => new Array(cells).fill(Number.NaN));
}

// Attach marine fields to a forecast grid. The marine fetch uses the same sampled grid and forecast
// horizon, so the cell and step indices align positionally with the wind and pressure arrays.
export function mergeMarine(grid: WeatherGrid, marine: MarineFields): WeatherGrid {
  return {
    ...grid,
    waveHeight: marine.waveHeight,
    waveDirection: marine.waveDirection,
    wavePeriod: marine.wavePeriod,
  };
}
```

- [ ] **Step 5: Run tests green.** Run: `npx vitest run src/features/weather/weather-client.test.ts`. Expected: PASS.

- [ ] **Step 6: Format and commit.**

```bash
/usr/local/bin/biome check --write src/entities/weather/weather-grid.ts src/features/weather/weather-client.ts src/features/weather/weather-client.test.ts
git add src/entities/weather/weather-grid.ts src/features/weather/weather-client.ts src/features/weather/weather-client.test.ts
git commit -m "feat(weather): fetch and merge Open-Meteo marine wave data"
```

---

### Task 2: Wave colormap

**Files:**
- Create: `src/features/weather/wave-colormap.ts`
- Test: `src/features/weather/wave-colormap.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { waveArrowColor, waveColor } from './wave-colormap';

describe('waveColor', () => {
  it('is transparent at calm and opaque at height', () => {
    expect(waveColor(0, 'day')[3]).toBeCloseTo(0, 2);
    expect(waveColor(5, 'day')[3]).toBeGreaterThan(0.4);
  });
  it('uses no blue at night-red', () => {
    const [r, , b] = waveColor(4, 'night-red');
    expect(r).toBeGreaterThan(b);
  });
});

describe('waveArrowColor', () => {
  it('returns a color per theme', () => {
    expect(waveArrowColor('day')).toMatch(/^#|rgb/);
    expect(waveArrowColor('night-red')).toMatch(/rgb/);
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/wave-colormap.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** (Mirror `wind-colormap.ts`'s ramp shape; height stops in meters.)

```ts
import type { Rgba } from './wind-colormap';
import type { Theme } from '$shared/ui';

// Wave-height stops in meters. Day and dusk: a translucent calm-to-heavy ramp (teal, green, yellow,
// orange, red, magenta) so the base map reads through. Night-red: a red band on black, brightness
// rising with height, no blue. Alpha is capped so the field stays an overlay, not a fill.
const DAY: Array<[number, Rgba]> = [
  [0, [0.2, 0.6, 0.75, 0.0]],
  [0.5, [0.2, 0.6, 0.75, 0.45]],
  [1.5, [0.24, 0.75, 0.45, 0.5]],
  [2.5, [0.9, 0.85, 0.25, 0.55]],
  [4, [0.94, 0.55, 0.22, 0.6]],
  [6, [0.86, 0.26, 0.22, 0.62]],
  [9, [0.7, 0.2, 0.5, 0.65]],
];
const NIGHT: Array<[number, Rgba]> = [
  [0, [0.3, 0.04, 0.03, 0.0]],
  [1.5, [0.5, 0.08, 0.06, 0.45]],
  [4, [0.75, 0.16, 0.11, 0.55]],
  [9, [1.0, 0.3, 0.2, 0.65]],
];

const ARROW: Record<Theme, string> = {
  day: 'rgba(20, 35, 50, 0.85)',
  dusk: 'rgba(210, 220, 235, 0.85)',
  'night-red': 'rgba(200, 50, 35, 0.9)',
};

export function waveColor(heightM: number, theme: Theme): Rgba {
  const stops = theme === 'night-red' ? NIGHT : DAY;
  if (Number.isNaN(heightM) || heightM <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [h0, c0] = stops[i];
    const [h1, c1] = stops[i + 1];
    if (heightM <= h1) {
      const f = (heightM - h0) / (h1 - h0 || 1);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
        c0[3] + (c1[3] - c0[3]) * f,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

export function waveArrowColor(theme: Theme): string {
  return ARROW[theme];
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/wave-colormap.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/wave-colormap.ts src/features/weather/wave-colormap.test.ts
git add src/features/weather/wave-colormap.ts src/features/weather/wave-colormap.test.ts
git commit -m "feat(weather): wave-height colormap"
```

---

### Task 3: Wave-height field pixel builder

**Files:**
- Create: `src/features/weather/wave-field.ts`
- Test: `src/features/weather/wave-field.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import type { WeatherGrid } from '$entities/weather';
import { waveFieldRgba } from './wave-field';

function grid(): WeatherGrid {
  const cells = 4; // 2x2
  return {
    lats: [0, 1],
    lons: [0, 1],
    times: [0],
    windU: [new Array(cells).fill(0)],
    windV: [new Array(cells).fill(0)],
    waveHeight: [[5, 5, Number.NaN, Number.NaN]],
  };
}

const bracket = { lo: 0, hi: 0, frac: 0 };

describe('waveFieldRgba', () => {
  it('builds an RGBA buffer at grid resolution, north up', () => {
    const f = waveFieldRgba(grid(), bracket, 'day');
    expect(f.width).toBe(2);
    expect(f.height).toBe(2);
    expect(f.data.length).toBe(2 * 2 * 4);
    // Row 0 of the canvas is the northernmost grid row (lats[1]), which is the NaN row -> alpha 0.
    expect(f.data[3]).toBe(0);
    // The southern row (lats[0]) has height 5 -> alpha > 0.
    const southAlpha = f.data[(1 * 2 + 0) * 4 + 3];
    expect(southAlpha).toBeGreaterThan(0);
  });

  it('is empty without wave data', () => {
    const g = grid();
    g.waveHeight = undefined;
    expect(waveFieldRgba(g, bracket, 'day')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/wave-field.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

```ts
import type { TimeBracket, WeatherGrid } from '$entities/weather';
import { lerp } from '$shared/lib';
import type { Theme } from '$shared/ui';
import { waveColor } from './wave-colormap';

export interface WaveField {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// A wave-height RGBA bitmap at grid resolution, blended across the bracketing forecast steps and
// colored by the wave colormap. Canvas row 0 is the northernmost grid row (the grid stores lats
// south to north, the canvas draws top to bottom). NaN cells (land) are transparent. Returns
// undefined when the grid carries no wave data. MapLibre smooths this with raster-resampling.
export function waveFieldRgba(
  grid: WeatherGrid,
  bracket: TimeBracket,
  theme: Theme,
): WaveField | undefined {
  const wh = grid.waveHeight;
  if (!wh || wh.length === 0) return undefined;
  const cols = grid.lons.length;
  const rows = grid.lats.length;
  const lo = wh[bracket.lo] ?? [];
  const hi = wh[bracket.hi] ?? lo;
  const data = new Uint8ClampedArray(cols * rows * 4);
  for (let py = 0; py < rows; py += 1) {
    const gridRow = rows - 1 - py; // flip: canvas top is north
    for (let px = 0; px < cols; px += 1) {
      const i = gridRow * cols + px;
      const [r, g, b, a] = waveColor(lerp(lo[i], hi[i], bracket.frac), theme);
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

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/wave-field.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/wave-field.ts src/features/weather/wave-field.test.ts
git add src/features/weather/wave-field.ts src/features/weather/wave-field.test.ts
git commit -m "feat(weather): wave-height field pixel builder"
```

---

### Task 4: Wave direction arrows

**Files:**
- Create: `src/features/weather/wave-arrows.ts`
- Test: `src/features/weather/wave-arrows.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import type { WeatherGrid } from '$entities/weather';
import { waveArrowFeatures } from './wave-arrows';

function grid(): WeatherGrid {
  const cells = 16; // 4x4 so the stride keeps at least one arrow
  return {
    lats: [0, 1, 2, 3],
    lons: [0, 1, 2, 3],
    times: [0],
    windU: [new Array(cells).fill(0)],
    windV: [new Array(cells).fill(0)],
    waveHeight: [new Array(cells).fill(2)],
    waveDirection: [new Array(cells).fill(0)], // from north -> travels south
    wavePeriod: [new Array(cells).fill(6)],
  };
}

const bracket = { lo: 0, hi: 0, frac: 0 };

describe('waveArrowFeatures', () => {
  it('emits sparse arrows tagged with height', () => {
    const fc = waveArrowFeatures(grid(), bracket);
    expect(fc.features.length).toBeGreaterThan(0);
    expect(fc.features.length).toBeLessThan(16);
    expect(fc.features[0].properties?.height).toBe(2);
  });

  it('is empty without wave data', () => {
    const g = grid();
    g.waveDirection = undefined;
    expect(waveArrowFeatures(g, bracket).features).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/wave-arrows.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** (Sparse, every `STRIDE`-th cell; arrow points the way the waves travel, the reverse of the from-direction, like the wind arrows.)

```ts
import type { TimeBracket, WeatherGrid } from '$entities/weather';
import { lerp } from '$shared/lib';

const STRIDE = 2; // draw every other cell in each axis so the field is not littered with arrows
const ARROW_FRACTION = 0.5;

// One arrow per strided grid cell pointing the way the waves travel (the reverse of the
// meteorological from-direction), tagged with wave height for coloring. Direction is blended across
// the bracketing steps. Empty when the grid carries no wave direction.
export function waveArrowFeatures(grid: WeatherGrid, bracket: TimeBracket): GeoJSON.FeatureCollection {
  const dirField = grid.waveDirection;
  const hField = grid.waveHeight;
  if (!dirField || !hField) return { type: 'FeatureCollection', features: [] };
  const cols = grid.lons.length;
  const dLon = cols > 1 ? Math.abs(grid.lons[1] - grid.lons[0]) : 1;
  const dLat = grid.lats.length > 1 ? Math.abs(grid.lats[1] - grid.lats[0]) : 1;
  const len = Math.min(dLon, dLat) * ARROW_FRACTION;
  const dLo = dirField[bracket.lo] ?? [];
  const dHi = dirField[bracket.hi] ?? dLo;
  const hLo = hField[bracket.lo] ?? [];
  const hHi = hField[bracket.hi] ?? hLo;
  const features: GeoJSON.Feature[] = [];
  for (let r = 0; r < grid.lats.length; r += STRIDE) {
    for (let c = 0; c < cols; c += STRIDE) {
      const i = r * cols + c;
      const dir = lerp(dLo[i], dHi[i], bracket.frac);
      const height = lerp(hLo[i], hHi[i], bracket.frac);
      if (Number.isNaN(dir) || Number.isNaN(height)) continue;
      // Travel vector: reverse of the from-direction, the same convention as the wind arrows.
      const u = -Math.sin(dir);
      const v = -Math.cos(dir);
      const lon = grid.lons[c];
      const lat = grid.lats[r];
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [lon, lat],
            [lon + u * len, lat + v * len],
          ],
        },
        properties: { height },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/wave-arrows.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/wave-arrows.ts src/features/weather/wave-arrows.test.ts
git add src/features/weather/wave-arrows.ts src/features/weather/wave-arrows.test.ts
git commit -m "feat(weather): wave direction arrows"
```

---

### Task 5: Waves overlay (canvas field plus arrows)

**Files:**
- Create: `src/features/weather/waves-overlay.ts`
- Test: `src/features/weather/waves-overlay.test.ts`

- [ ] **Step 1: Write the failing test.** (Injects a fake canvas factory so the contract test runs in the node environment.)

```ts
import { describe, expect, it } from 'vitest';
import { WeatherStore } from '$entities/weather';
import { mapThemePaint, type OverlayContext } from '$shared/map';
import { createFakeMap } from '$shared/testing/fake-map';
import { createWavesOverlay } from './waves-overlay';

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
    waveHeight: [new Array(cells).fill(2)],
    waveDirection: [new Array(cells).fill(0)],
    wavePeriod: [new Array(cells).fill(6)],
  });
  return store;
}

describe('waves overlay', () => {
  it('adds a field source and layer and an arrow source and layer in the weather band', () => {
    const overlay = createWavesOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(overlay.band).toBe('weather');
    expect(map.sources.size).toBe(2);
    expect(map.layers.size).toBe(2);
  });

  it('syncs the arrow features from the grid', () => {
    const overlay = createWavesOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.sync(ctxFor(map));
    const arrowSource = map.sources.get('binnacle-weather-waves-arrows');
    const fc = arrowSource?.data as GeoJSON.FeatureCollection;
    expect(fc.features.length).toBeGreaterThan(0);
  });

  it('removes its layers and sources', () => {
    const overlay = createWavesOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });

  it('recolors for the theme without throwing', () => {
    const overlay = createWavesOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(() => overlay.applyTheme?.(ctxFor(map), mapThemePaint('night-red'))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/waves-overlay.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

```ts
import type {
  CanvasSourceSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
  RasterLayerSpecification,
} from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import type { Theme } from '$shared/ui';
import { waveArrowFeatures } from './wave-arrows';
import { waveArrowColor } from './wave-colormap';
import { waveFieldRgba } from './wave-field';

const FIELD_SOURCE = 'binnacle-weather-waves-field';
const ARROW_SOURCE = 'binnacle-weather-waves-arrows';
const FIELD_LAYER = 'binnacle-weather-waves-field-layer';
const ARROW_LAYER = 'binnacle-weather-waves-arrow-layer';

type CanvasFactory = () => HTMLCanvasElement;

export interface WavesOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function defaultCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

// A degenerate default extent; replaced with the grid bbox on the first sync that has data.
const PLACEHOLDER_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [
  [0, 0.0001],
  [0.0001, 0.0001],
  [0.0001, 0],
  [0, 0],
];

// The waves overlay: a wave-height color field drawn to a canvas at grid resolution and smoothed by
// the GPU (raster-resampling linear), plus a sparse direction-arrow line layer, both in the weather
// band. Off by default. The canvas is redrawn only when the grid, the selected time, or the theme
// changes; MapLibre re-reads the small canvas each frame (animate true), which is cheap.
export function createWavesOverlay(
  store: WeatherStore,
  makeCanvas: CanvasFactory = defaultCanvas,
): WavesOverlay {
  const canvas = makeCanvas();
  let theme: Theme = 'day';
  let lastGrid: unknown;
  let lastTime = Number.NaN;
  let lastTheme: Theme | undefined;

  function redraw(): boolean {
    const grid = store.grid;
    const field = grid ? waveFieldRgba(grid, store.bracket, theme) : undefined;
    const context = canvas.getContext('2d');
    if (!field || !context) return false;
    canvas.width = field.width;
    canvas.height = field.height;
    context.putImageData(new ImageData(field.data, field.width, field.height), 0, 0);
    return true;
  }

  function fieldCoords(): typeof PLACEHOLDER_COORDS | undefined {
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
    id: 'weather-waves',
    title: 'Waves',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [FIELD_LAYER, ARROW_LAYER],
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
      if (!ctx.map.getSource(ARROW_SOURCE)) {
        const source: GeoJSONSourceSpecification = { type: 'geojson', data: emptyCollection() };
        ctx.map.addSource(ARROW_SOURCE, source);
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
      if (!ctx.map.getLayer(ARROW_LAYER)) {
        const layer: LineLayerSpecification = {
          id: ARROW_LAYER,
          type: 'line',
          source: ARROW_SOURCE,
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': waveArrowColor('day'), 'line-width': 1.5, 'line-opacity': 1 },
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
        | { setCoordinates?(c: typeof PLACEHOLDER_COORDS): void }
        | undefined;
      if (coords) fieldSource?.setCoordinates?.(coords);
      const arrowSource = ctx.map.getSource(ARROW_SOURCE) as
        | { setData(d: unknown): void }
        | undefined;
      arrowSource?.setData(grid ? waveArrowFeatures(grid, store.bracket) : emptyCollection());
    },
    remove(ctx) {
      if (ctx.map.getLayer(ARROW_LAYER)) ctx.map.removeLayer(ARROW_LAYER);
      if (ctx.map.getLayer(FIELD_LAYER)) ctx.map.removeLayer(FIELD_LAYER);
      if (ctx.map.getSource(ARROW_SOURCE)) ctx.map.removeSource(ARROW_SOURCE);
      if (ctx.map.getSource(FIELD_SOURCE)) ctx.map.removeSource(FIELD_SOURCE);
    },
    setVisible(ctx, visible) {
      const v = visible ? 'visible' : 'none';
      ctx.map.setLayoutProperty(FIELD_LAYER, 'visibility', v);
      ctx.map.setLayoutProperty(ARROW_LAYER, 'visibility', v);
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(FIELD_LAYER, 'raster-opacity', opacity);
      ctx.map.setPaintProperty(ARROW_LAYER, 'line-opacity', opacity);
    },
    applyTheme(ctx, paint) {
      theme = paint.theme;
      lastTheme = undefined; // force a redraw of the field in the theme's colors on the next sync
      ctx.map.setPaintProperty(ARROW_LAYER, 'line-color', waveArrowColor(paint.theme));
    },
  };
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/waves-overlay.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/waves-overlay.ts src/features/weather/waves-overlay.test.ts
git add src/features/weather/waves-overlay.ts src/features/weather/waves-overlay.test.ts
git commit -m "feat(weather): waves overlay with a smooth height field and arrows"
```

---

### Task 6: Add wave height and period to the tap readout

**Files:**
- Modify: `src/features/weather/weather-readout.ts`
- Modify: `src/features/weather/weather-readout.test.ts`

- [ ] **Step 1: Extend the failing test.** Add wave fields to the `grid` fixture in `weather-readout.test.ts`:

```ts
  waveHeight: [
    [1.8, 1.8, 1.8, 1.8],
    [1.8, 1.8, 1.8, 1.8],
  ],
  wavePeriod: [
    [7, 7, 7, 7],
    [7, 7, 7, 7],
  ],
```

And in the first case assert:

```ts
    expect(r?.waveHeightM).toBeCloseTo(1.8, 4);
    expect(r?.wavePeriodS).toBeCloseTo(7, 4);
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/weather-readout.test.ts`. Expected: FAIL.

- [ ] **Step 3: Extend the readout.** In `weather-readout.ts`, add to `WeatherReadout`:

```ts
  waveHeightM?: number; // present only when the grid carries waves
  wavePeriodS?: number;
```

And before the return, sample them:

```ts
  const waveField = grid.waveHeight?.[timeIndex];
  const waveHeightM = waveField ? bilinearAt(grid, waveField, lon, lat) : undefined;
  const periodField = grid.wavePeriod?.[timeIndex];
  const wavePeriodS = periodField ? bilinearAt(grid, periodField, lon, lat) : undefined;
  return { speedMs, fromRad, pressurePa, waveHeightM, wavePeriodS };
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/weather-readout.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/weather-readout.ts src/features/weather/weather-readout.test.ts
git add src/features/weather/weather-readout.ts src/features/weather/weather-readout.test.ts
git commit -m "feat(weather): add wave height and period to the tap readout"
```

---

### Task 7: Wire the waves overlay, the marine fetch, and the readout

**Files:**
- Modify: `src/features/weather/index.ts`
- Modify: `src/widgets/chart-canvas/ChartCanvas.svelte`
- Modify: `src/app/App.svelte`

- [ ] **Step 1: Export the public API.** In `src/features/weather/index.ts` add (keep alphabetical, named only):

```ts
export { fetchMarine, mergeMarine } from './weather-client';
export { createWavesOverlay } from './waves-overlay';
```

(`fetchForecast` and `type ForecastOptions` already export from `./weather-client`; add `fetchMarine` and `mergeMarine` to that same export or a new line.)

- [ ] **Step 2: Register and sync in the map widget.** In `ChartCanvas.svelte`, change the weather import to include `createWavesOverlay`. Register waves BEFORE wind so the field sits at the bottom of the weather band (background), with the wind arrows and isobars above it:

```ts
    const wavesOverlay = createWavesOverlay(weather);
    await manager.register(wavesOverlay);
    if (destroyed) return;

    const windOverlay = createWindOverlay(weather);
```

In `tick`, add `wavesOverlay.sync(ctx);` before `windOverlay.sync(ctx);`.

- [ ] **Step 3: Fetch marine and merge in the app.** In `App.svelte`:
  - Import `fetchMarine` and `mergeMarine` from `$features/weather`.
  - In `scheduleWeather`, fetch the forecast and marine in parallel and merge:

```ts
    const [grid, marine] = await Promise.all([
      fetchForecast(bounds, { maxCells: 600, forecastDays: 5 }),
      fetchMarine(bounds, { maxCells: 600, forecastDays: 5 }),
    ]);
    if (grid) weather.setGrid(marine ? mergeMarine(grid, marine) : grid);
    else weather.setStatus(weather.grid ? 'stale' : 'error');
```

  (Replace the existing single `fetchForecast` call and its `if (grid)` block.)

- [ ] **Step 4: Show waves in the readout chip.** In `App.svelte`, in the `weather-readout` chip after the pressure span, add:

```svelte
        {#if weatherReadout.waveHeightM !== undefined && !Number.isNaN(weatherReadout.waveHeightM)}
          &middot; sea <b>{fmt(weatherReadout.waveHeightM, 1)}</b> m{#if weatherReadout.wavePeriodS !== undefined && !Number.isNaN(weatherReadout.wavePeriodS)}
            / <b>{fmt(weatherReadout.wavePeriodS, 0)}</b> s{/if}
        {/if}
```

- [ ] **Step 5: Verify the full gate** (one heavy command at a time, capture and read each):

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check 2>&1 | tee tmp/check.txt | tail -4
NODE_OPTIONS="--max-old-space-size=2048" npm test 2>&1 | tee tmp/test.txt | tail -6
/usr/local/bin/biome ci . 2>&1 | tee tmp/biome.txt | tail -3
NODE_OPTIONS="--max-old-space-size=2048" npm run cruise 2>&1 | tee tmp/cruise.txt | tail -3
NODE_OPTIONS="--max-old-space-size=2048" npm run build 2>&1 | tee tmp/build.txt | tail -4
```

Expected: all green.

- [ ] **Step 6: Commit.**

```bash
git add src/features/weather/index.ts src/widgets/chart-canvas/ChartCanvas.svelte src/app/App.svelte
git commit -m "feat(weather): wire the waves overlay, marine fetch, and readout"
```

---

### Task 8: Docs, simplify, push, live verification, and memory

- [ ] **Step 1: CHANGELOG and README.** Update the Weather entry in `CHANGELOG.md` ([Unreleased]) and the Weather bullet in `README.md` to add waves (a smooth wave-height field plus direction arrows from the Open-Meteo marine API, with height and period in the tap readout); drop waves from the "follow later" list, leaving precipitation, cloud, and animated wind particles.

- [ ] **Step 2: Run `/simplify`** on the diff (`git diff <prev>..HEAD`); apply findings, skip false positives with reasons.

- [ ] **Step 3: Final gate and push.** The pre-push hook runs the full chain. `git push origin main`.

- [ ] **Step 4: Live-verify** (Playwright, https://boatpi:3443/binnacle/, nssdb CA, no TLS bypass): seed localStorage to enable Waves over the North Atlantic; confirm the smooth wave-height field renders with direction arrows, the field updates on time scrub, night-red shows a red field and arrows with no blue, and a tap reads sea height and period. Capture day and night screenshots to `tmp/`.

- [ ] **Step 5: Update the project-status memory** to record the waves layer shipped (commits, test count) and that precipitation, cloud, the legend/Weather group, and the WebGL wind particles remain.
