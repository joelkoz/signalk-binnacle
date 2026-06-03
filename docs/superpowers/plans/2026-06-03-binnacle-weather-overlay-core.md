# Weather Overlay Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the core of the Binnacle weather overlay: a forecast data layer, a bottom-strip time scrubber, and the animated wind hero with a tap-for-value readout. Working software on its own (animated wind with a scrubbable forecast); the other layers follow in separate plans.

**Architecture:** A browser-only data client fetches an Open-Meteo gridded forecast for the viewport into an `entities/weather` runes store. A `features/weather` slice renders wind as a MapLibre WebGL custom layer (particles advected through the u/v field) registered in the reserved `weather` z-band through the existing `LayerManager`, exactly like the depth-charts streaming overlays. A bottom-status-strip button opens a draggable time scrubber that drives the store's selected time; all weather rendering reads that time.

**Tech Stack:** Svelte 5 (runes), Vite, TypeScript, MapLibre GL JS 5 (custom WebGL layer), Vitest, Biome, dependency-cruiser. Data: Open-Meteo forecast and marine APIs (keyless, CORS). No new runtime dependency.

**Scope note:** This plan is spec steps 1 to 3 of `docs/superpowers/specs/2026-06-03-binnacle-weather-overlay-design.md`. Steps 4 to 8 (pressure isobars, waves, precipitation, cloud, legend/polish) are independent overlays on this data layer and get their own plans after this lands.

**Project rules (apply to every task):** SI in the store, convert at the display edge. American English. No em dashes (use a colon, a comma, or two sentences). Oxford commas. No "&" in human-readable text, write "and". Default to no comments, keep only non-obvious why-comments. Feature-Sliced Design: imports flow down, each slice exposes a public API via `index.ts` with named re-exports only. Pi build policy: lead-driven, one heavy verification command at a time, every gate green before a step is done.

**The gate (run after each task that changes code, one command at a time, capture to a file and read it back):**
```
NODE_OPTIONS="--max-old-space-size=2048" npm run check   # svelte-check
/usr/local/bin/biome ci .                                # lint and format
NODE_OPTIONS="--max-old-space-size=2048" npm test        # vitest
NODE_OPTIONS="--max-old-space-size=2048" npm run cruise  # dependency-cruiser
NODE_OPTIONS="--max-old-space-size=2048" npm run build   # production build
```
A task's final commit happens only after the gate is green. The pre-commit hook also runs `biome ci` and `cruise`; the pre-push hook runs the full chain.

---

## File structure

Created in this plan:

- `src/entities/weather/weather-grid.ts` — `WeatherGrid` type, `sampleGrid` (bbox to a capped lat/lon grid), `cellIndex`, `bilinearAt` (sample a variable at a lon/lat for a time index), and `timeBracket` (the two forecast indices and the fraction for a selected time). Pure.
- `src/entities/weather/weather-grid.test.ts`
- `src/entities/weather/weather-store.svelte.ts` — `WeatherStore` (runes): `grid`, `status`, `bbox`, `selectedTime`, derived `timeBracket`, plus `setGrid`, `setStatus`, `setSelectedTime`.
- `src/entities/weather/weather-store.svelte.test.ts`
- `src/entities/weather/index.ts` — public API.
- `src/features/weather/weather-client.ts` — `fetchForecast(bbox, opts, fetchFn)` building and parsing the Open-Meteo forecast request into a `WeatherGrid`, deriving `windU`/`windV` from speed and direction, chunking the grid across requests, failing soft.
- `src/features/weather/weather-client.test.ts`
- `src/features/weather/wind-colormap.ts` — `windColor(speedMs, theme)` ramp and `WIND_STOPS`. Pure.
- `src/features/weather/wind-colormap.test.ts`
- `src/features/weather/wind-particles.ts` — the WebGL particle renderer as a MapLibre custom layer (`createWindParticleLayer`).
- `src/features/weather/wind-overlay.ts` — `createWindOverlay(store)` wrapping the particle layer as an `OverlayModule` in the `weather` band.
- `src/features/weather/weather-readout.ts` — `readoutAt(grid, lon, lat, timeIndex)` returning wind speed and direction (SI) at a point. Pure.
- `src/features/weather/weather-readout.test.ts`
- `src/features/weather/time-scrub.ts` — `clampTime`, `stepTime`, `advancePlay` pure time-scrubber logic.
- `src/features/weather/time-scrub.test.ts`
- `src/features/weather/WeatherTimeControl.svelte` — bottom-strip "Forecast" button and the scrubber window.
- `src/features/weather/index.ts` — public API.

Modified:

- `src/shared/map/map-theme.ts` — add a `theme: Theme` field to `MapThemePaint` so overlays can pick a theme-specific colormap.
- `src/widgets/chart-canvas/ChartCanvas.svelte` — register the wind overlay, add a `weather` store prop, and emit map taps for the readout.
- `src/app/App.svelte` — construct the weather store, fetch on first enable and on debounced view change, mount `WeatherTimeControl` in the status strip, and show the readout.

---

## Task 1: WeatherGrid type and bbox sampling

**Files:**
- Create: `src/entities/weather/weather-grid.ts`
- Test: `src/entities/weather/weather-grid.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/entities/weather/weather-grid.test.ts
import { describe, expect, it } from 'vitest';
import { sampleGrid, cellIndex, type WeatherGrid } from './weather-grid';

describe('sampleGrid', () => {
  it('caps the grid to maxCells and covers the bbox corners', () => {
    const g = sampleGrid({ west: -10, south: 40, east: 10, north: 50 }, 64);
    expect(g.lats.length * g.lons.length).toBeLessThanOrEqual(64);
    expect(g.lons[0]).toBeCloseTo(-10, 6);
    expect(g.lons[g.lons.length - 1]).toBeCloseTo(10, 6);
    expect(g.lats[0]).toBeCloseTo(40, 6);
    expect(g.lats[g.lats.length - 1]).toBeCloseTo(50, 6);
  });

  it('numbers cells row-major from the lat/lon axes', () => {
    const g = sampleGrid({ west: 0, south: 0, east: 3, north: 3 }, 16);
    expect(cellIndex(g, 0, 0)).toBe(0);
    expect(cellIndex(g, 1, 0)).toBe(g.lons.length);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/entities/weather/weather-grid.test.ts`
Expected: FAIL, `sampleGrid` is not defined.

- [ ] **Step 3: Implement minimally**

```ts
// src/entities/weather/weather-grid.ts
export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

// A regular lat/lon forecast grid. Variable arrays are indexed [timeIndex][cellIndex], where
// cellIndex is row-major over (lat, lon). All values are SI. Marine arrays may be undefined.
export interface WeatherGrid {
  lats: number[];
  lons: number[];
  times: number[]; // epoch ms, ascending
  windU: number[][]; // m/s, eastward
  windV: number[][]; // m/s, northward
}

// Sample a bbox into a grid no larger than maxCells, keeping the bbox aspect roughly square so
// neither axis is starved. Inclusive of both corners so the field covers the whole viewport.
export function sampleGrid(bbox: Bbox, maxCells: number): {
  lats: number[];
  lons: number[];
} {
  const w = Math.max(1e-6, bbox.east - bbox.west);
  const h = Math.max(1e-6, bbox.north - bbox.south);
  const aspect = w / h;
  const rows = Math.max(2, Math.round(Math.sqrt(maxCells / aspect)));
  const cols = Math.max(2, Math.floor(maxCells / rows));
  const lons = axis(bbox.west, bbox.east, cols);
  const lats = axis(bbox.south, bbox.north, rows);
  return { lats, lons };
}

function axis(min: number, max: number, n: number): number[] {
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => min + i * step);
}

export function cellIndex(
  grid: { lats: number[]; lons: number[] },
  row: number,
  col: number,
): number {
  return row * grid.lons.length + col;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/entities/weather/weather-grid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/weather/weather-grid.ts src/entities/weather/weather-grid.test.ts
git commit -m "feat(weather): grid type and bbox sampling"
```

## Task 2: bilinear sample and time bracket

**Files:**
- Modify: `src/entities/weather/weather-grid.ts`
- Modify: `src/entities/weather/weather-grid.test.ts`

- [ ] **Step 1: Add the failing tests**

```ts
// append to src/entities/weather/weather-grid.test.ts
import { bilinearAt, timeBracket } from './weather-grid';

const tiny: WeatherGrid = {
  lats: [0, 1],
  lons: [0, 1],
  times: [1000, 4000],
  windU: [
    [0, 2, 0, 2],
    [10, 10, 10, 10],
  ],
  windV: [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
};

describe('bilinearAt', () => {
  it('interpolates a variable inside a cell', () => {
    expect(bilinearAt(tiny, tiny.windU[0], 0.5, 0)).toBeCloseTo(1, 6); // mid lon, bottom row
  });
  it('returns undefined outside the grid', () => {
    expect(bilinearAt(tiny, tiny.windU[0], 5, 5)).toBeUndefined();
  });
});

describe('timeBracket', () => {
  it('returns the two indices and the fraction for a time between steps', () => {
    expect(timeBracket(tiny, 2500)).toEqual({ lo: 0, hi: 1, frac: 0.5 });
  });
  it('clamps before the first and after the last step', () => {
    expect(timeBracket(tiny, 0)).toEqual({ lo: 0, hi: 0, frac: 0 });
    expect(timeBracket(tiny, 9999)).toEqual({ lo: 1, hi: 1, frac: 0 });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/entities/weather/weather-grid.test.ts`
Expected: FAIL, `bilinearAt` is not defined.

- [ ] **Step 3: Implement**

```ts
// append to src/entities/weather/weather-grid.ts

// Bilinearly sample one variable array at a lon/lat. Returns undefined when the point is outside
// the grid so a caller (the readout) can show a blank instead of a wrong value.
export function bilinearAt(
  grid: WeatherGrid,
  values: number[],
  lon: number,
  lat: number,
): number | undefined {
  const cx = frac(grid.lons, lon);
  const cy = frac(grid.lats, lat);
  if (!cx || !cy) return undefined;
  const cols = grid.lons.length;
  const v00 = values[cy.i * cols + cx.i];
  const v10 = values[cy.i * cols + cx.i + 1];
  const v01 = values[(cy.i + 1) * cols + cx.i];
  const v11 = values[(cy.i + 1) * cols + cx.i + 1];
  const top = v00 + (v10 - v00) * cx.f;
  const bot = v01 + (v11 - v01) * cx.f;
  return top + (bot - top) * cy.f;
}

function frac(axisVals: number[], v: number): { i: number; f: number } | undefined {
  if (v < axisVals[0] || v > axisVals[axisVals.length - 1]) return undefined;
  for (let i = 0; i < axisVals.length - 1; i += 1) {
    if (v <= axisVals[i + 1]) {
      const span = axisVals[i + 1] - axisVals[i] || 1;
      return { i, f: (v - axisVals[i]) / span };
    }
  }
  return { i: axisVals.length - 2, f: 1 };
}

export interface TimeBracket {
  lo: number;
  hi: number;
  frac: number;
}

// The two forecast step indices bracketing a selected time and the blend fraction, clamped to the
// ends so scrubbing before or past the forecast shows the nearest step.
export function timeBracket(grid: WeatherGrid, time: number): TimeBracket {
  const t = grid.times;
  if (t.length === 0 || time <= t[0]) return { lo: 0, hi: 0, frac: 0 };
  if (time >= t[t.length - 1]) return { lo: t.length - 1, hi: t.length - 1, frac: 0 };
  for (let i = 0; i < t.length - 1; i += 1) {
    if (time <= t[i + 1]) {
      const span = t[i + 1] - t[i] || 1;
      return { lo: i, hi: i + 1, frac: (time - t[i]) / span };
    }
  }
  return { lo: t.length - 1, hi: t.length - 1, frac: 0 };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/entities/weather/weather-grid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/weather/weather-grid.ts src/entities/weather/weather-grid.test.ts
git commit -m "feat(weather): bilinear sample and time bracket"
```

## Task 3: weather-client forecast fetch and parse

**Files:**
- Create: `src/features/weather/weather-client.ts`
- Test: `src/features/weather/weather-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/weather/weather-client.test.ts
import { describe, expect, it, vi } from 'vitest';
import { fetchForecast } from './weather-client';

function res(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

// Open-Meteo returns one object per location for a multi-location request.
function loc(lat: number, lon: number, speed: number[], dir: number[]): unknown {
  return {
    latitude: lat,
    longitude: lon,
    hourly: {
      time: ['2026-06-03T00:00', '2026-06-03T01:00'],
      wind_speed_10m: speed,
      wind_direction_10m: dir,
      pressure_msl: [101300, 101200],
      precipitation: [0, 0.2],
      cloud_cover: [10, 50],
    },
  };
}

describe('fetchForecast', () => {
  it('parses a 2x2 grid and derives u/v from speed and direction', async () => {
    const body = [
      loc(0, 0, [10, 10], [90, 90]), // from the east, blowing west: u negative
      loc(0, 1, [0, 0], [0, 0]),
      loc(1, 0, [0, 0], [0, 0]),
      loc(1, 1, [0, 0], [0, 0]),
    ];
    const fetchFn = vi.fn(async () => res(body));
    const grid = await fetchForecast(
      { west: 0, south: 0, east: 1, north: 1 },
      { maxCells: 4, forecastDays: 1 },
      fetchFn as unknown as typeof fetch,
    );
    expect(grid?.lats.length).toBe(2);
    expect(grid?.times.length).toBe(2);
    // 10 m/s from 90deg (east) blows toward the west: u = -10, v = ~0.
    expect(grid?.windU[0][0]).toBeCloseTo(-10, 4);
    expect(grid?.windV[0][0]).toBeCloseTo(0, 4);
  });

  it('returns undefined on a fetch failure', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    const grid = await fetchForecast(
      { west: 0, south: 0, east: 1, north: 1 },
      { maxCells: 4, forecastDays: 1 },
      fetchFn as unknown as typeof fetch,
    );
    expect(grid).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/weather-client.test.ts`
Expected: FAIL, `fetchForecast` is not defined.

- [ ] **Step 3: Implement**

```ts
// src/features/weather/weather-client.ts
import { type Bbox, sampleGrid, type WeatherGrid } from '$entities/weather';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
// Open-Meteo accepts many locations per request; keep batches well under its cap.
const MAX_LOCS_PER_REQUEST = 200;
const DEG_TO_RAD = Math.PI / 180;

export interface ForecastOptions {
  maxCells: number;
  forecastDays: number;
}

// Fetch an Open-Meteo gridded forecast for the bbox. Returns a WeatherGrid, or undefined on any
// failure (the caller leaves the last grid in place and retries). Wind is converted to u/v on parse.
export async function fetchForecast(
  bbox: Bbox,
  opts: ForecastOptions,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<WeatherGrid | undefined> {
  const { lats, lons } = sampleGrid(bbox, opts.maxCells);
  const points: Array<{ lat: number; lon: number }> = [];
  for (const lat of lats) for (const lon of lons) points.push({ lat, lon });

  try {
    const chunks = chunk(points, MAX_LOCS_PER_REQUEST);
    const responses = await Promise.all(
      chunks.map((c) => fetchFn(buildUrl(c, opts), { credentials: 'omit' })),
    );
    const locs: OmLoc[] = [];
    for (const r of responses) {
      if (!r.ok) return undefined;
      const body = (await r.json()) as OmLoc | OmLoc[];
      for (const l of Array.isArray(body) ? body : [body]) locs.push(l);
    }
    return parse(locs, lats, lons);
  } catch {
    return undefined;
  }
}

interface OmLoc {
  hourly?: {
    time?: string[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
  };
}

function buildUrl(points: Array<{ lat: number; lon: number }>, opts: ForecastOptions): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    hourly: 'wind_speed_10m,wind_direction_10m,pressure_msl,precipitation,cloud_cover',
    wind_speed_unit: 'ms',
    forecast_days: String(opts.forecastDays),
    timeformat: 'unixtime',
    cell_selection: 'sea',
  });
  return `${FORECAST_URL}?${params}`;
}

function parse(locs: OmLoc[], lats: number[], lons: number[]): WeatherGrid | undefined {
  const first = locs[0]?.hourly;
  if (!first?.time || first.time.length === 0) return undefined;
  const times = first.time.map((t) => Number(t) * 1000);
  const steps = times.length;
  const cells = lats.length * lons.length;
  if (locs.length !== cells) return undefined;
  const windU: number[][] = Array.from({ length: steps }, () => new Array(cells).fill(0));
  const windV: number[][] = Array.from({ length: steps }, () => new Array(cells).fill(0));
  for (let c = 0; c < cells; c += 1) {
    const h = locs[c]?.hourly;
    const spd = h?.wind_speed_10m ?? [];
    const dir = h?.wind_direction_10m ?? [];
    for (let t = 0; t < steps; t += 1) {
      const s = spd[t] ?? 0;
      const d = (dir[t] ?? 0) * DEG_TO_RAD;
      // Meteorological direction is where the wind comes FROM; the vector points the other way.
      windU[t][c] = -s * Math.sin(d);
      windV[t][c] = -s * Math.cos(d);
    }
  }
  return { lats, lons, times, windU, windV };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
```

Note for the implementer: `timeformat=unixtime` makes `hourly.time` numeric seconds, so the test fixture (ISO strings) must change to numbers, or keep ISO and `Number()` yields NaN. Update the test fixture to unix seconds (`time: [1748908800, 1748912400]`) before Step 4.

- [ ] **Step 4: Update the test fixture to unixtime, run, verify it passes**

Edit the `loc` helper's `time` to `[1748908800, 1748912400]`. Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/weather-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/weather/weather-client.ts src/features/weather/weather-client.test.ts
git commit -m "feat(weather): Open-Meteo forecast client with u/v derivation"
```

## Task 4: weather store

**Files:**
- Create: `src/entities/weather/weather-store.svelte.ts`
- Create: `src/entities/weather/weather-store.svelte.test.ts`
- Create: `src/entities/weather/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/entities/weather/weather-store.svelte.test.ts
import { describe, expect, it } from 'vitest';
import { WeatherStore } from './weather-store.svelte';
import type { WeatherGrid } from './weather-grid';

const grid: WeatherGrid = {
  lats: [0, 1],
  lons: [0, 1],
  times: [1000, 4000],
  windU: [[0, 0, 0, 0], [0, 0, 0, 0]],
  windV: [[0, 0, 0, 0], [0, 0, 0, 0]],
};

describe('WeatherStore', () => {
  it('defaults the selected time to the first step when a grid arrives', () => {
    const s = new WeatherStore();
    s.setGrid(grid);
    expect(s.status).toBe('ready');
    expect(s.selectedTime).toBe(1000);
    expect(s.bracket).toEqual({ lo: 0, hi: 0, frac: 0 });
  });

  it('clamps a set selected time into the forecast range via the bracket', () => {
    const s = new WeatherStore();
    s.setGrid(grid);
    s.setSelectedTime(2500);
    expect(s.bracket).toEqual({ lo: 0, hi: 1, frac: 0.5 });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/entities/weather/weather-store.svelte.test.ts`
Expected: FAIL, `WeatherStore` is not defined.

- [ ] **Step 3: Implement**

```ts
// src/entities/weather/weather-store.svelte.ts
import { type TimeBracket, timeBracket, type WeatherGrid } from './weather-grid';
import type { Bbox } from './weather-grid';

export type WeatherStatus = 'idle' | 'loading' | 'ready' | 'error' | 'stale';

export class WeatherStore {
  grid = $state<WeatherGrid | undefined>(undefined);
  status = $state<WeatherStatus>('idle');
  bbox = $state<Bbox | undefined>(undefined);
  selectedTime = $state<number>(0);

  // The two forecast indices and blend fraction for the selected time, recomputed only when the
  // grid or selected time changes. Overlays read this to render the right step.
  bracket = $derived<TimeBracket>(
    this.grid ? timeBracket(this.grid, this.selectedTime) : { lo: 0, hi: 0, frac: 0 },
  );

  setStatus(status: WeatherStatus): void {
    this.status = status;
  }

  setGrid(grid: WeatherGrid): void {
    this.grid = grid;
    this.status = 'ready';
    if (grid.times.length > 0 && (this.selectedTime < grid.times[0] || this.selectedTime > grid.times[grid.times.length - 1])) {
      this.selectedTime = grid.times[0];
    } else if (this.selectedTime === 0 && grid.times.length > 0) {
      this.selectedTime = grid.times[0];
    }
  }

  setSelectedTime(time: number): void {
    this.selectedTime = time;
  }
}
```

- [ ] **Step 4: Create the public API**

```ts
// src/entities/weather/index.ts
export type { Bbox, TimeBracket, WeatherGrid } from './weather-grid';
export { bilinearAt, cellIndex, sampleGrid, timeBracket } from './weather-grid';
export type { WeatherStatus } from './weather-store.svelte';
export { WeatherStore } from './weather-store.svelte';
```

- [ ] **Step 5: Run it, verify it passes**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/entities/weather/weather-store.svelte.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the gate, then commit**

Run the full gate (one command at a time). Then:
```bash
git add src/entities/weather/
git commit -m "feat(weather): forecast store with selected-time bracket"
```

## Task 5: time-scrub logic and the WeatherTimeControl widget

**Files:**
- Create: `src/features/weather/time-scrub.ts`
- Create: `src/features/weather/time-scrub.test.ts`
- Create: `src/features/weather/WeatherTimeControl.svelte`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/weather/time-scrub.test.ts
import { describe, expect, it } from 'vitest';
import { advancePlay, clampTime, stepTime } from './time-scrub';

const range = { start: 1000, end: 5000, stepMs: 1000 };

describe('time-scrub', () => {
  it('clamps to the range', () => {
    expect(clampTime(0, range)).toBe(1000);
    expect(clampTime(9999, range)).toBe(5000);
    expect(clampTime(2500, range)).toBe(2500);
  });
  it('steps by stepMs and clamps at the ends', () => {
    expect(stepTime(2000, +1, range)).toBe(3000);
    expect(stepTime(5000, +1, range)).toBe(5000);
    expect(stepTime(1000, -1, range)).toBe(1000);
  });
  it('advances play and wraps to the start at the end', () => {
    expect(advancePlay(4000, range)).toBe(5000);
    expect(advancePlay(5000, range)).toBe(1000);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/time-scrub.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/features/weather/time-scrub.ts
export interface TimeRange {
  start: number;
  end: number;
  stepMs: number;
}

export function clampTime(t: number, r: TimeRange): number {
  return Math.min(r.end, Math.max(r.start, t));
}

export function stepTime(t: number, dir: 1 | -1, r: TimeRange): number {
  return clampTime(t + dir * r.stepMs, r);
}

// Advance during playback, wrapping back to the start once past the end so the loop repeats.
export function advancePlay(t: number, r: TimeRange): number {
  const next = t + r.stepMs;
  return next > r.end ? r.start : next;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/time-scrub.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the WeatherTimeControl component**

```svelte
<!-- src/features/weather/WeatherTimeControl.svelte -->
<script lang="ts">
import { CloudSun, Pause, Play, X } from '@lucide/svelte';
import type { WeatherStore } from '$entities/weather';
import { advancePlay, clampTime, stepTime, type TimeRange } from './time-scrub';

interface Props {
  store: WeatherStore;
  // Whether any weather layer is on; the button only shows when weather is active.
  active: boolean;
}

const { store, active }: Props = $props();

let open = $state(false);
let playing = $state(false);
let timer: ReturnType<typeof setInterval> | undefined;

const range = $derived<TimeRange | undefined>(
  store.grid && store.grid.times.length > 0
    ? { start: store.grid.times[0], end: store.grid.times[store.grid.times.length - 1], stepMs: 3 * 3600_000 }
    : undefined,
);

const label = $derived(
  store.grid ? new Date(store.selectedTime).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '',
);

function set(t: number): void {
  if (range) store.setSelectedTime(clampTime(t, range));
}

function togglePlay(): void {
  playing = !playing;
  if (timer) clearInterval(timer);
  if (playing && range) {
    timer = setInterval(() => store.setSelectedTime(advancePlay(store.selectedTime, range)), 700);
  }
}

$effect(() => () => {
  if (timer) clearInterval(timer);
});
</script>

{#if active}
  <button type="button" class="forecast-btn" class:on={open} onclick={() => (open = !open)}>
    <CloudSun size={16} aria-hidden="true" /> Forecast
  </button>
{/if}

{#if active && open && range}
  <div class="scrubber" role="group" aria-label="Forecast time">
    <button type="button" class="step" aria-label="Earlier" onclick={() => set(stepTime(store.selectedTime, -1, range))}>&#9664;</button>
    <button type="button" class="step" aria-label={playing ? 'Pause' : 'Play'} onclick={togglePlay}>
      {#if playing}<Pause size={16} aria-hidden="true" />{:else}<Play size={16} aria-hidden="true" />{/if}
    </button>
    <button type="button" class="step" aria-label="Later" onclick={() => set(stepTime(store.selectedTime, 1, range))}>&#9654;</button>
    <input
      class="track"
      type="range"
      min={range.start}
      max={range.end}
      step={range.stepMs}
      value={store.selectedTime}
      aria-label="Forecast time"
      oninput={(e) => set(Number(e.currentTarget.value))}
    >
    <span class="time">{label}</span>
    <button type="button" class="step" aria-label="Close" onclick={() => (open = false)}><X size={16} aria-hidden="true" /></button>
  </div>
{/if}

<style>
.forecast-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-block-size: var(--control-size);
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.forecast-btn.on {
  color: var(--accent);
  border-color: var(--accent);
}
.scrubber {
  position: absolute;
  inset-inline: 0.5rem;
  inset-block-end: calc(var(--control-size) + 0.5rem);
  margin-inline: auto;
  max-inline-size: 32rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.6rem;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
}
.scrubber .track {
  flex: 1;
  accent-color: var(--accent);
}
.scrubber .step {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--control-size);
  min-inline-size: var(--control-size);
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.scrubber .time {
  font-variant-numeric: tabular-nums;
  font-size: var(--text-sm);
  white-space: nowrap;
}
</style>
```

- [ ] **Step 6: Run the gate, then commit**

```bash
git add src/features/weather/time-scrub.ts src/features/weather/time-scrub.test.ts src/features/weather/WeatherTimeControl.svelte
git commit -m "feat(weather): time-scrub logic and the forecast control"
```

## Task 6: wind colormap

**Files:**
- Create: `src/features/weather/wind-colormap.ts`
- Create: `src/features/weather/wind-colormap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/weather/wind-colormap.test.ts
import { describe, expect, it } from 'vitest';
import { windColor } from './wind-colormap';

describe('windColor', () => {
  it('returns an rgba tuple in 0..1 for day', () => {
    const c = windColor(0, 'day');
    expect(c).toHaveLength(4);
    for (const v of c) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
  });
  it('uses a red-band ramp at night (no blue channel dominance)', () => {
    const c = windColor(20, 'night-red');
    expect(c[0]).toBeGreaterThan(c[2]); // red greater than blue
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/wind-colormap.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/features/weather/wind-colormap.ts
import type { Theme } from '$shared/ui';

export type Rgba = [number, number, number, number];

// Speed stops in m/s with a normal (day/dusk) marine wind ramp: teal, green, yellow, orange, red.
const DAY: Array<[number, Rgba]> = [
  [0, [0.16, 0.66, 0.79, 0.0]],
  [3, [0.16, 0.66, 0.79, 0.9]],
  [7, [0.22, 0.77, 0.41, 0.9]],
  [12, [0.9, 0.85, 0.23, 0.9]],
  [18, [0.94, 0.54, 0.23, 0.95]],
  [26, [0.88, 0.28, 0.23, 1.0]],
];
// Night-red: pure red band on black, brightness rising with speed, no blue.
const NIGHT: Array<[number, Rgba]> = [
  [0, [0.35, 0.05, 0.04, 0.0]],
  [7, [0.6, 0.1, 0.08, 0.85]],
  [18, [0.8, 0.18, 0.12, 0.95]],
  [26, [1.0, 0.3, 0.2, 1.0]],
];

export function windColor(speedMs: number, theme: Theme): Rgba {
  const stops = theme === 'night-red' ? NIGHT : DAY;
  if (speedMs <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [s0, c0] = stops[i];
    const [s1, c1] = stops[i + 1];
    if (speedMs <= s1) {
      const f = (speedMs - s0) / (s1 - s0 || 1);
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
```

- [ ] **Step 4: Run it, verify it passes**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/wind-colormap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/weather/wind-colormap.ts src/features/weather/wind-colormap.test.ts
git commit -m "feat(weather): wind speed colormap with night-red ramp"
```

## Task 7: theme name on MapThemePaint

**Files:**
- Modify: `src/shared/map/map-theme.ts`

The wind overlay's `applyTheme` receives a `MapThemePaint` but needs the theme name to pick the colormap. Add it.

- [ ] **Step 1: Add `theme` to the type and the returned paint**

In `src/shared/map/map-theme.ts`, add `theme: Theme;` to the `MapThemePaint` interface, and change `mapThemePaint` to return `{ ...PAINT[theme], theme }`. Import `Theme` from `$shared/ui` if not already imported.

- [ ] **Step 2: Run check and the existing map-theme test**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/map/map-theme.test.ts` and `NODE_OPTIONS="--max-old-space-size=2048" npm run check`
Expected: PASS, 0 type errors. If `map-theme.test.ts` asserts exact paint object equality, update it to include `theme`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/map/map-theme.ts src/shared/map/map-theme.test.ts
git commit -m "feat(map): expose the theme name on MapThemePaint"
```

## Task 8: wind particle WebGL layer and overlay

**Files:**
- Create: `src/features/weather/wind-particles.ts`
- Create: `src/features/weather/wind-overlay.ts`

This is the WebGL hero. It is verified live, not unit-tested (per the spec). The particle technique follows the established webgl-wind approach: a u/v field uploaded as a texture, particle positions held in a texture and advanced each frame in an update pass, then drawn as points colored by speed, with a faded trail. Keep the field in lon/lat normalized space and convert to screen via the MapLibre custom-layer matrix in the draw shader.

- [ ] **Step 1: Implement the particle layer**

```ts
// src/features/weather/wind-particles.ts
import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { Theme } from '$shared/ui';

export interface WindParticleLayer extends CustomLayerInterface {
  setTheme(theme: Theme): void;
  setOpacity(opacity: number): void;
}

// A MapLibre custom WebGL layer that advects particles through the wind u/v field. Reads the store's
// grid and selected-time bracket each frame, blends the two forecast steps into a field texture, and
// draws faded particle trails colored by speed. Theme and opacity are uniforms.
export function createWindParticleLayer(id: string, store: WeatherStore): WindParticleLayer {
  // The implementer fills in the standard webgl-wind buffers, programs, and the update/draw passes.
  // Key responsibilities, all live-verified:
  //  - onAdd(map, gl): compile the update and draw programs, allocate particle-state textures
  //    (RGBA position), a screen framebuffer for trails, and the field texture.
  //  - When store.grid or store.bracket changes, rebuild the field texture by blending
  //    windU[lo]/windV[lo] with windU[hi]/windV[hi] by bracket.frac into an RG (or RGBA) texture
  //    sized lons x lats, plus the min/max u/v for shader denormalization.
  //  - render(gl, matrix): run the update pass (advance positions, respawn a fraction each frame),
  //    then draw the faded previous screen plus the new particles, mapping grid-normalized lon/lat
  //    to clip space with `matrix`.
  //  - setTheme(theme): pick the colormap ramp (reuse windColor stops as a 16-texel ramp texture).
  //  - setOpacity(o): a global alpha uniform on the draw program.
  //  - onRemove(gl): delete programs, buffers, and textures.
  // Reference: the well-known webgl-wind particle method, adapted to a MapLibre custom layer.
  throw new Error('implement the webgl-wind passes; see the step notes');
}
```

- [ ] **Step 2: Implement the OverlayModule wrapper**

```ts
// src/features/weather/wind-overlay.ts
import type { OverlayModule } from '$shared/map';
import type { WeatherStore } from '$entities/weather';
import { createWindParticleLayer, type WindParticleLayer } from './wind-particles';

const LAYER_ID = 'binnacle-weather-wind';

// Wrap the wind particle layer as an overlay in the weather band, off by default, themeable.
export function createWindOverlay(store: WeatherStore): OverlayModule {
  let layer: WindParticleLayer | undefined;
  return {
    id: 'weather-wind',
    title: 'Wind',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [LAYER_ID],
    add(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) return;
      layer = createWindParticleLayer(LAYER_ID, store);
      ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
    },
    remove(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      layer = undefined;
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(_ctx, opacity) {
      layer?.setOpacity(opacity);
    },
    applyTheme(_ctx, paint) {
      layer?.setTheme(paint.theme);
    },
  };
}
```

- [ ] **Step 3: Verify it builds and type-checks**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npm run check`
Expected: 0 errors. The `throw` in `createWindParticleLayer` is a placeholder until the live WebGL work in Step 4; the overlay and types must compile.

- [ ] **Step 4: Implement and live-verify the WebGL passes**

Replace the `throw` with the full webgl-wind update and draw passes. Verify live on the boat (HTTPS) per the project's live-verification memory: enable Wind in the Layers panel, confirm particles flow and color by speed, scrub the time control and confirm the field updates, and switch themes and confirm the night-red ramp. There is no unit test for the GL passes.

- [ ] **Step 5: Run the gate, then commit**

```bash
git add src/features/weather/wind-particles.ts src/features/weather/wind-overlay.ts
git commit -m "feat(weather): animated wind particle overlay"
```

## Task 9: tap-for-value readout

**Files:**
- Create: `src/features/weather/weather-readout.ts`
- Create: `src/features/weather/weather-readout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/weather/weather-readout.test.ts
import { describe, expect, it } from 'vitest';
import { readoutAt } from './weather-readout';
import type { WeatherGrid } from '$entities/weather';

const grid: WeatherGrid = {
  lats: [0, 1],
  lons: [0, 1],
  times: [1000, 4000],
  windU: [[-10, -10, -10, -10], [0, 0, 0, 0]],
  windV: [[0, 0, 0, 0], [0, 0, 0, 0]],
};

describe('readoutAt', () => {
  it('returns SI speed and a from-direction at a point', () => {
    const r = readoutAt(grid, 0.5, 0.5, 0);
    expect(r?.speedMs).toBeCloseTo(10, 4);
    expect(r?.fromRad).toBeCloseTo(Math.PI / 2, 4); // wind toward west is from the east (90deg)
  });
  it('returns undefined outside the grid', () => {
    expect(readoutAt(grid, 9, 9, 0)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/weather-readout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/features/weather/weather-readout.ts
import { bilinearAt, type WeatherGrid } from '$entities/weather';

export interface WindReadout {
  speedMs: number;
  fromRad: number; // meteorological direction the wind comes from, radians
}

export function readoutAt(
  grid: WeatherGrid,
  lon: number,
  lat: number,
  timeIndex: number,
): WindReadout | undefined {
  const u = bilinearAt(grid, grid.windU[timeIndex], lon, lat);
  const v = bilinearAt(grid, grid.windV[timeIndex], lon, lat);
  if (u === undefined || v === undefined) return undefined;
  const speedMs = Math.hypot(u, v);
  // Reverse the vector to the from-direction, normalized to 0..2pi.
  const fromRad = (Math.atan2(-u, -v) + 2 * Math.PI) % (2 * Math.PI);
  return { speedMs, fromRad };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/weather/weather-readout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/weather/weather-readout.ts src/features/weather/weather-readout.test.ts
git commit -m "feat(weather): wind tap-for-value readout"
```

## Task 10: feature public API and app wiring

**Files:**
- Create: `src/features/weather/index.ts`
- Modify: `src/widgets/chart-canvas/ChartCanvas.svelte`
- Modify: `src/app/App.svelte`

- [ ] **Step 1: Create the feature public API**

```ts
// src/features/weather/index.ts
export { fetchForecast, type ForecastOptions } from './weather-client';
export { createWindOverlay } from './wind-overlay';
export { readoutAt, type WindReadout } from './weather-readout';
export { default as WeatherTimeControl } from './WeatherTimeControl.svelte';
```

- [ ] **Step 2: Register the wind overlay in ChartCanvas**

In `src/widgets/chart-canvas/ChartCanvas.svelte`, add a `weather: WeatherStore` prop (import the type from `$entities/weather`), and inside the `load` handler register the wind overlay alongside the other overlays (it must be registered like the AIS, collision, and track overlays):

```ts
import { createWindOverlay } from '$features/weather';
// ... within the load handler, before the vessel overlay:
const windOverlay = createWindOverlay(weather);
await manager.register(windOverlay);
if (destroyed) return;
```

Wind sits in the `weather` band, which is below `routes`, `safety`, `traffic`, and `vessel`, so it renders under the boat and AIS automatically.

- [ ] **Step 3: Wire the store, fetch, and control in App.svelte**

In `src/app/App.svelte`:

```ts
import { WeatherStore } from '$entities/weather';
import { fetchForecast, WeatherTimeControl } from '$features/weather';

const weather = new WeatherStore();

// Fetch a forecast for the current view, debounced, only once a weather layer is on. Triggered
// from onViewChange and when the user first enables Wind. Off by default, so nothing fetches at
// startup. weatherActive is derived from the layers view (true when any weather-band layer is on).
let weatherFetchTimer: ReturnType<typeof setTimeout> | undefined;
function refreshWeather(): void {
  if (!weatherActive || !mapView) return;
  if (weatherFetchTimer) clearTimeout(weatherFetchTimer);
  weatherFetchTimer = setTimeout(async () => {
    weather.setStatus('loading');
    const bbox = bboxFromView(mapView!);
    const grid = await fetchForecast(bbox, { maxCells: 600, forecastDays: 5 });
    if (grid) weather.setGrid(grid);
    else weather.setStatus(weather.grid ? 'stale' : 'error');
  }, 500);
}
```

Pass `{weather}` to `ChartCanvas`. Mount `<WeatherTimeControl store={weather} active={weatherActive} />` in the bottom status strip, centered (the existing `.status-strip` has a `.spacer`; place the control there). Derive `weatherActive` from `layersView` (a weather-band layer is visible). Compute `bboxFromView` from the map view center and zoom, or read `map.getBounds()` via a new command on `MapCommands` (recommended: add `getBounds(): Bbox` to `MapCommands` so the exact viewport is used). Clear `weatherFetchTimer` in `onDestroy`.

- [ ] **Step 4: Run the full gate**

Run each, one at a time, capturing to a file: `npm run check`, `biome ci .`, `npm test`, `npm run cruise`, `npm run build`. All green.

- [ ] **Step 5: Live-verify on the boat**

Per the live-verification memory (HTTPS, minted short-lived token if needed): enable Wind in the Layers panel, confirm the Forecast button appears in the status strip, open the scrubber and drag it, confirm particles animate and shift with time, tap the map and confirm the wind readout, and cycle themes for the night-red ramp.

- [ ] **Step 6: Commit**

```bash
git add src/features/weather/index.ts src/widgets/chart-canvas/ChartCanvas.svelte src/app/App.svelte
git commit -m "feat(weather): wire the wind overlay, forecast fetch, and time control"
```

## Task 11: forecast caching for offline

**Files:**
- Modify: `vite.config.ts` (the vite-plugin-pwa workbox `runtimeCaching`)

- [ ] **Step 1: Add runtime caching for the Open-Meteo hosts**

In the PWA config's `workbox.runtimeCaching`, add a `NetworkFirst` (or `StaleWhileRevalidate`) entry for `api.open-meteo.com` and `marine-api.open-meteo.com`, with a small expiration (a few entries, a few hours), mirroring the existing PMTiles and depth-chart caching entries. This lets a fetched forecast serve from cache when offline.

- [ ] **Step 2: Verify the build emits the service worker**

Run: `NODE_OPTIONS="--max-old-space-size=2048" npm run build`
Expected: build OK, `public/sw.js` regenerated, the new runtime-cache route present in the generated SW.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat(weather): cache the forecast for offline use"
```

## Task 12: docs and release notes

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: Add the CHANGELOG and README entries**

CHANGELOG `[Unreleased]` Added: the animated wind overlay with a scrubbable forecast, browser-only Open-Meteo data, a bottom-strip Forecast control, and tap-for-value wind. README: a weather bullet in the feature list. No "&" in the text.

- [ ] **Step 2: Commit and push to main**

```bash
git add CHANGELOG.md README.md
git commit -m "docs(weather): note the wind overlay and forecast control"
git push origin main
```

---

## Follow-on plans (spec steps 4 to 8)

Each is an independent overlay on this data layer and the time control, planned and built after this core lands. Each adds variables to the `weather-client` parse and `WeatherGrid`, a new `OverlayModule` in the `weather` band, and a legend entry:

- **Pressure isobars:** add `pressure_msl` to the grid; a marching-squares contour module (pure, unit-tested); a GeoJSON line plus labeled symbol overlay.
- **Waves and swell:** add the marine request (`wave_height`, `wave_direction`, `wave_period`) to the client; a canvas-image color-field overlay plus a direction-arrow symbol layer; extend the readout.
- **Precipitation:** a RainViewer raster overlay reusing `createStreamingChartOverlay`, frame timestamps from RainViewer's index, plus an Open-Meteo precip color field for forecast times; the scrubber selects frame or field.
- **Cloud cover:** a cloud-cover color field reusing the field technique.
- **Legend and polish:** a per-active-layer legend in the scrubber window, the Layers-panel "Weather" group ordering, and RainViewer runtime caching.

## Self-review

- **Spec coverage:** data layer (Tasks 1 to 4, 11), time control (Task 5), wind hero particles (Tasks 6 to 8), tap readout (Task 9), wiring and theming (Tasks 7, 10), offline (Task 11). Pressure, waves, precip, cloud, and legend are explicitly deferred to follow-on plans with a concrete outline, matching the spec's "core first" build order.
- **Placeholder scan:** the only non-code step is the WebGL passes in Task 8 Step 4, which is inherently live-verified per the spec, not a TODO; its structure and responsibilities are spelled out.
- **Type consistency:** `WeatherGrid`, `Bbox`, `TimeBracket`, `WeatherStore`, `TimeRange`, `WindReadout`, and `Rgba` names are used consistently across tasks; `windColor(speed, theme)`, `fetchForecast(bbox, opts, fetchFn)`, `readoutAt(grid, lon, lat, timeIndex)`, and `createWindOverlay(store)` signatures match their call sites.
