# Weather Pressure Isobars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mean-sea-level pressure isobar overlay (marching-squares contours with hPa labels) to the weather layer, themed for day, dusk, and night-red, registered in the Layers panel, and surfaced in the tap-for-value readout.

**Architecture:** This is spec step 4 of `docs/superpowers/specs/2026-06-03-binnacle-weather-overlay-design.md`. The forecast client already requests `pressure_msl`; this plan parses it into the grid, derives isobar contours as a pure transform, and renders them as a themeable `OverlayModule` in the reserved `weather` z-band, exactly like the wind line overlay. The tap readout generalizes from wind-only to a multi-variable weather readout. The Layers-panel "Weather" group remains spec step 8.

**Tech Stack:** Svelte 5 runes, MapLibre GL JS 5 (GeoJSON line + symbol layers), TypeScript, Vitest. Open-Meteo `pressure_msl` (hPa) stored as Pa; contour levels computed in hPa for readable labels. SI in the store, hPa only at the display edge.

**Pi build policy:** Lead runs every verification, one heavy command at a time, `NODE_OPTIONS="--max-old-space-size=2048"`. Per task: targeted `npx vitest run <file>` plus the fast pre-commit hook (`biome ci .`, `npm run cruise`). Full heavy chain (`npm run check`, `npm test`, `npm run build`) runs once at the push checkpoint, which the pre-push hook also enforces. American English, no em dashes, Oxford commas, no "&" in text, minimal comments, named re-exports only.

---

### Task 1: Parse mean-sea-level pressure into the forecast grid

**Files:**
- Modify: `src/entities/weather/weather-grid.ts` (add `pressureMsl?` to `WeatherGrid`)
- Modify: `src/features/weather/weather-client.ts` (parse `pressure_msl` hPa to Pa)
- Modify: `src/features/weather/weather-client.test.ts`
- Modify: `src/shared/lib/units.ts` and `src/shared/lib/index.ts` (`pascalsToHectopascals`)

- [ ] **Step 1: Extend the failing client test.** In `weather-client.test.ts`, add `pressure_msl` to the hourly fixture for each location and assert the parsed grid carries Pa. Add to the existing happy-path location objects an `pressure_msl: [1013, 1014]` style array (hPa), then after parsing assert `grid.pressureMsl?.[0]?.[0]` is `101300` (Pa) and `grid.pressureMsl?.[1]?.[0]` is `101400`.

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/weather-client.test.ts`. Expected: FAIL (`pressureMsl` undefined).

- [ ] **Step 3: Add the optional field.** In `weather-grid.ts`, add to `WeatherGrid` after `windV`:

```ts
  // Supplementary fields, present only when fetched; absent (undefined) for a wind-only grid or
  // over cells the provider omits. All SI: pressure in Pa.
  pressureMsl?: number[][]; // Pa
```

- [ ] **Step 4: Parse pressure in the client.** In `weather-client.ts`, add `pressure_msl?: number[];` to `OmLoc.hourly`. Add a constant `const PA_PER_HPA = 100;` near `DEG_TO_RAD`. In `parse`, after building `windU`/`windV`, build pressure:

```ts
  const pressureMsl: number[][] = Array.from({ length: steps }, () => new Array(cells).fill(Number.NaN));
  for (let c = 0; c < cells; c += 1) {
    const p = locs[c]?.hourly?.pressure_msl ?? [];
    for (let t = 0; t < steps; t += 1) {
      const hpa = p[t];
      if (hpa !== undefined) pressureMsl[t][c] = hpa * PA_PER_HPA;
    }
  }
  return { lats, lons, times, windU, windV, pressureMsl };
```

- [ ] **Step 5: Add the display-edge converter.** In `units.ts`:

```ts
export function pascalsToHectopascals(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value / 100;
}
```

Export `pascalsToHectopascals` from `src/shared/lib/index.ts` (insert alphabetically in the `./units` block, after `radiansToBearing`).

- [ ] **Step 6: Run tests green.** Run: `npx vitest run src/features/weather/weather-client.test.ts src/shared/lib`. Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/entities/weather/weather-grid.ts src/features/weather/weather-client.ts src/features/weather/weather-client.test.ts src/shared/lib/units.ts src/shared/lib/index.ts
git commit -m "feat(weather): parse mean-sea-level pressure into the forecast grid"
```

---

### Task 2: Isobar contours from the pressure field (marching squares)

**Files:**
- Create: `src/features/weather/pressure-isobars.ts`
- Test: `src/features/weather/pressure-isobars.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import type { WeatherGrid } from '$entities/weather';
import { isobarFeatures } from './pressure-isobars';

// Pressure rises linearly with longitude (constant across latitude), in Pa.
function rampGrid(): WeatherGrid {
  const lons = [0, 1, 2, 3, 4];
  const lats = [0, 1, 2];
  const hpa = [1006.5, 1009.5, 1012.5, 1015.5, 1018.5];
  const cells = lats.length * lons.length;
  const row = new Array(cells).fill(0);
  const pressure = new Array(cells);
  for (let r = 0; r < lats.length; r += 1)
    for (let c = 0; c < lons.length; c += 1) pressure[r * lons.length + c] = hpa[c] * 100;
  return { lats, lons, times: [0], windU: [row], windV: [row], pressureMsl: [pressure] };
}

const bracket = { lo: 0, hi: 0, frac: 0 };

describe('isobarFeatures', () => {
  it('contours the field at the hPa interval', () => {
    const { lines, labels } = isobarFeatures(rampGrid(), bracket, 4);
    // Levels 1008, 1012, 1016 each cross both cell rows -> 2 segments each.
    expect(lines.features).toHaveLength(6);
    const levels = [...new Set(lines.features.map((f) => f.properties?.pressureHpa))].sort(
      (a, b) => a - b,
    );
    expect(levels).toEqual([1008, 1012, 1016]);
    for (const f of lines.features) {
      expect(f.geometry.type).toBe('LineString');
      expect((f.geometry as GeoJSON.LineString).coordinates).toHaveLength(2);
    }
    expect(labels.features.length).toBeGreaterThan(0);
    for (const f of labels.features) expect((f.properties?.pressureHpa as number) % 4).toBe(0);
  });

  it('is empty without pressure data', () => {
    const g = rampGrid();
    g.pressureMsl = undefined;
    expect(isobarFeatures(g, bracket, 4).lines.features).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/pressure-isobars.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement marching squares.**

```ts
import type { TimeBracket, WeatherGrid } from '$entities/weather';

const PA_PER_HPA = 100;
const DEFAULT_INTERVAL_HPA = 4;
const LABEL_STRIDE = 6; // place a label every Nth segment of each level so labels stay sparse

type Pt = [number, number];

export interface Isobars {
  lines: GeoJSON.FeatureCollection;
  labels: GeoJSON.FeatureCollection;
}

// Edge crossings of the unit cell, named for the four sides. Each case lists the side pairs that a
// contour segment connects. 5 and 10 are saddles, resolved with a fixed (non-averaged) split.
const CASES: number[][][] = [
  [], [['d', 'a']], [['a', 'b']], [['d', 'b']], [['b', 'c']], [['d', 'a'], ['b', 'c']],
  [['a', 'c']], [['d', 'c']], [['c', 'd']], [['c', 'a']], [['a', 'b'], ['c', 'd']], [['c', 'b']],
  [['d', 'b']], [['a', 'b']], [['d', 'a']], [],
];

// Isobars of mean-sea-level pressure at a fixed hPa interval, blended across the two bracketing
// forecast steps. Lines carry pressureHpa for labeling; pressure is stored in Pa, contoured in hPa.
export function isobarFeatures(
  grid: WeatherGrid,
  bracket: TimeBracket,
  intervalHpa = DEFAULT_INTERVAL_HPA,
): Isobars {
  const lines: GeoJSON.Feature[] = [];
  const labels: GeoJSON.Feature[] = [];
  const p = grid.pressureMsl;
  if (!p || p.length === 0) return collections(lines, labels);

  const cols = grid.lons.length;
  const rows = grid.lats.length;
  const lo = p[bracket.lo] ?? [];
  const hi = p[bracket.hi] ?? lo;
  const field = (i: number) => (lo[i] + (hi[i] - lo[i]) * bracket.frac) / PA_PER_HPA;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < cols * rows; i += 1) {
    const v = field(i);
    if (Number.isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return collections(lines, labels);

  const perLevel = new Map<number, number>();
  for (let L = Math.ceil(min / intervalHpa) * intervalHpa; L <= max; L += intervalHpa) {
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < cols - 1; c += 1) {
        const vbl = field(r * cols + c);
        const vbr = field(r * cols + c + 1);
        const vtr = field((r + 1) * cols + c + 1);
        const vtl = field((r + 1) * cols + c);
        if (Number.isNaN(vbl) || Number.isNaN(vbr) || Number.isNaN(vtr) || Number.isNaN(vtl)) continue;
        const idx =
          (vbl >= L ? 1 : 0) | (vbr >= L ? 2 : 0) | (vtr >= L ? 4 : 0) | (vtl >= L ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const lon0 = grid.lons[c];
        const lon1 = grid.lons[c + 1];
        const lat0 = grid.lats[r];
        const lat1 = grid.lats[r + 1];
        const edge = (side: string): Pt => {
          switch (side) {
            case 'a': return [lerp(lon0, lon1, t(vbl, vbr, L)), lat0];
            case 'b': return [lon1, lerp(lat0, lat1, t(vbr, vtr, L))];
            case 'c': return [lerp(lon1, lon0, t(vtr, vtl, L)), lat1];
            default: return [lon0, lerp(lat1, lat0, t(vtl, vbl, L))];
          }
        };
        for (const [e1, e2] of CASES[idx]) {
          const a = edge(e1);
          const b = edge(e2);
          lines.push(lineFeature(a, b, L));
          const n = perLevel.get(L) ?? 0;
          if (n % LABEL_STRIDE === 0)
            labels.push(pointFeature([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L));
          perLevel.set(L, n + 1);
        }
      }
    }
  }
  return collections(lines, labels);
}

function t(va: number, vb: number, L: number): number {
  const d = vb - va;
  return d === 0 ? 0.5 : (L - va) / d;
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

function lineFeature(a: Pt, b: Pt, pressureHpa: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [a, b] },
    properties: { pressureHpa },
  };
}

function pointFeature(at: Pt, pressureHpa: number): GeoJSON.Feature {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: at }, properties: { pressureHpa } };
}

function collections(lines: GeoJSON.Feature[], labels: GeoJSON.Feature[]): Isobars {
  return {
    lines: { type: 'FeatureCollection', features: lines },
    labels: { type: 'FeatureCollection', features: labels },
  };
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/pressure-isobars.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/features/weather/pressure-isobars.ts src/features/weather/pressure-isobars.test.ts
git commit -m "feat(weather): isobar contours from the pressure field (marching squares)"
```

---

### Task 3: Themed isobar colors

**Files:**
- Create: `src/features/weather/pressure-colors.ts`
- Test: `src/features/weather/pressure-colors.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { isobarColors } from './pressure-colors';

describe('isobarColors', () => {
  it('returns a line, label, and halo color per theme', () => {
    const day = isobarColors('day');
    expect(day.line).toMatch(/^#|rgb/);
    expect(day.label).toBeTruthy();
    expect(day.halo).toBeTruthy();
  });

  it('uses no blue at night-red', () => {
    const { line } = isobarColors('night-red');
    const [r, , b] = parseRgb(line);
    expect(r).toBeGreaterThan(b);
  });
});

function parseRgb(s: string): [number, number, number] {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0, 0, 0];
  const [r, g, b] = m[1].split(',').map((v) => Number.parseFloat(v));
  return [r, g, b];
}
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/pressure-colors.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement.**

```ts
import type { Theme } from '$shared/ui';

export interface IsobarColors {
  line: string;
  label: string;
  halo: string;
}

// Isobars are a single line color per theme (not a ramp). Day and dusk use a muted slate so the
// lines read over land and water without competing with the wind colors. Night-red is pure red on
// black: no blue, low brightness, with a dark halo so labels stay legible.
const COLORS: Record<Theme, IsobarColors> = {
  day: { line: 'rgba(70, 90, 110, 0.85)', label: 'rgba(40, 55, 70, 1)', halo: 'rgba(255, 255, 255, 0.9)' },
  dusk: { line: 'rgba(150, 165, 185, 0.8)', label: 'rgba(205, 215, 230, 1)', halo: 'rgba(10, 14, 22, 0.9)' },
  'night-red': { line: 'rgba(150, 30, 22, 0.85)', label: 'rgba(190, 40, 28, 1)', halo: 'rgba(0, 0, 0, 0.95)' },
};

export function isobarColors(theme: Theme): IsobarColors {
  return COLORS[theme];
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/pressure-colors.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/features/weather/pressure-colors.ts src/features/weather/pressure-colors.test.ts
git commit -m "feat(weather): themed isobar colors"
```

---

### Task 4: Pressure isobar overlay module

**Files:**
- Create: `src/features/weather/pressure-overlay.ts`
- Test: `src/features/weather/pressure-overlay.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { WeatherStore } from '$entities/weather';
import { mapThemePaint, type OverlayContext } from '$shared/map';
import { createFakeMap } from '$shared/testing/fake-map';
import { createPressureOverlay } from './pressure-overlay';

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

function storeWithGrid(): WeatherStore {
  const store = new WeatherStore();
  const cells = 9; // 3x3
  const pressure = new Array(cells).fill(0).map((_, i) => (1008 + (i % 3) * 4) * 100);
  store.setGrid({
    lats: [0, 1, 2],
    lons: [0, 1, 2],
    times: [1000],
    windU: [new Array(cells).fill(0)],
    windV: [new Array(cells).fill(0)],
    pressureMsl: [pressure],
  });
  return store;
}

describe('pressure overlay', () => {
  it('adds a line and a label layer in the weather band', () => {
    const overlay = createPressureOverlay(storeWithGrid());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(overlay.band).toBe('weather');
    expect(map.sources.size).toBe(2);
    expect(map.layers.size).toBe(2);
  });

  it('syncs isobar features from the grid', () => {
    const overlay = createPressureOverlay(storeWithGrid());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.sync(ctxFor(map));
    const fc = [...map.sources.values()][0].data as GeoJSON.FeatureCollection;
    expect(fc.features.length).toBeGreaterThan(0);
  });

  it('removes its layers and sources', () => {
    const overlay = createPressureOverlay(storeWithGrid());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });

  it('recolors for the theme without throwing', () => {
    const overlay = createPressureOverlay(storeWithGrid());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(() => overlay.applyTheme?.(ctxFor(map), mapThemePaint('night-red'))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/pressure-overlay.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement the overlay** (mirrors `wind-overlay.ts`).

```ts
import type {
  GeoJSONSourceSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import { isobarColors } from './pressure-colors';
import { isobarFeatures } from './pressure-isobars';

const LINE_SOURCE = 'binnacle-weather-pressure';
const LABEL_SOURCE = 'binnacle-weather-pressure-labels';
const LINE_LAYER = 'binnacle-weather-pressure-line';
const LABEL_LAYER = 'binnacle-weather-pressure-label';

export interface PressureOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

// Mean-sea-level pressure isobars in the weather band: a line layer of marching-squares contours
// and a sparse label layer of hPa values. Off by default. Rebuilds only when the grid or the
// selected time changes, like the wind overlay.
export function createPressureOverlay(store: WeatherStore): PressureOverlay {
  let lastGrid: unknown;
  let lastTime = Number.NaN;

  return {
    id: 'weather-pressure',
    title: 'Pressure',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [LINE_LAYER, LABEL_LAYER],
    add(ctx) {
      const colors = isobarColors('day');
      if (!ctx.map.getSource(LINE_SOURCE)) {
        const source: GeoJSONSourceSpecification = { type: 'geojson', data: emptyCollection() };
        ctx.map.addSource(LINE_SOURCE, source);
      }
      if (!ctx.map.getSource(LABEL_SOURCE)) {
        const source: GeoJSONSourceSpecification = { type: 'geojson', data: emptyCollection() };
        ctx.map.addSource(LABEL_SOURCE, source);
      }
      if (!ctx.map.getLayer(LINE_LAYER)) {
        const layer: LineLayerSpecification = {
          id: LINE_LAYER,
          type: 'line',
          source: LINE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': colors.line, 'line-width': 1.2, 'line-opacity': 1 },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
      }
      if (!ctx.map.getLayer(LABEL_LAYER)) {
        const layer: SymbolLayerSpecification = {
          id: LABEL_LAYER,
          type: 'symbol',
          source: LABEL_SOURCE,
          layout: {
            'text-field': ['to-string', ['get', 'pressureHpa']],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
            'symbol-placement': 'point',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': colors.label,
            'text-halo-color': colors.halo,
            'text-halo-width': 1.4,
            'text-opacity': 1,
          },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
      }
    },
    sync(ctx) {
      const grid = store.grid;
      if (grid === lastGrid && store.selectedTime === lastTime) return;
      lastGrid = grid;
      lastTime = store.selectedTime;
      const lineSource = ctx.map.getSource(LINE_SOURCE) as { setData(d: unknown): void } | undefined;
      const labelSource = ctx.map.getSource(LABEL_SOURCE) as { setData(d: unknown): void } | undefined;
      if (!grid) {
        lineSource?.setData(emptyCollection());
        labelSource?.setData(emptyCollection());
        return;
      }
      const { lines, labels } = isobarFeatures(grid, store.bracket);
      lineSource?.setData(lines);
      labelSource?.setData(labels);
    },
    remove(ctx) {
      if (ctx.map.getLayer(LABEL_LAYER)) ctx.map.removeLayer(LABEL_LAYER);
      if (ctx.map.getLayer(LINE_LAYER)) ctx.map.removeLayer(LINE_LAYER);
      if (ctx.map.getSource(LABEL_SOURCE)) ctx.map.removeSource(LABEL_SOURCE);
      if (ctx.map.getSource(LINE_SOURCE)) ctx.map.removeSource(LINE_SOURCE);
    },
    setVisible(ctx, visible) {
      const v = visible ? 'visible' : 'none';
      ctx.map.setLayoutProperty(LINE_LAYER, 'visibility', v);
      ctx.map.setLayoutProperty(LABEL_LAYER, 'visibility', v);
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-opacity', opacity);
    },
    applyTheme(ctx, paint) {
      const colors = isobarColors(paint.theme);
      ctx.map.setPaintProperty(LINE_LAYER, 'line-color', colors.line);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-color', colors.label);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-halo-color', colors.halo);
    },
  };
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/pressure-overlay.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/features/weather/pressure-overlay.ts src/features/weather/pressure-overlay.test.ts
git commit -m "feat(weather): pressure isobar overlay"
```

---

### Task 5: Generalize the tap readout to include pressure

**Files:**
- Modify: `src/features/weather/weather-readout.ts` (rename `WindReadout` to `WeatherReadout`, add `pressurePa`)
- Modify: `src/features/weather/weather-readout.test.ts`

- [ ] **Step 1: Extend the failing test.** In `weather-readout.test.ts`, add `pressureMsl: [[101300, 101300, 101300, 101300], [101300, 101300, 101300, 101300]]` to the `grid` fixture, change the import type name to `WeatherReadout` is not needed in the test, and add an assertion in the first case: `expect(r?.pressurePa).toBeCloseTo(101300, 0);`.

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/weather-readout.test.ts`. Expected: FAIL (`pressurePa` undefined).

- [ ] **Step 3: Generalize the readout.** Rewrite `weather-readout.ts`:

```ts
import { bilinearAt, type WeatherGrid } from '$entities/weather';

export interface WeatherReadout {
  speedMs: number;
  fromRad: number; // meteorological direction the wind comes from, radians, 0..2pi
  pressurePa?: number; // present only when the grid carries pressure
}

// Wind speed, from-direction, and (when present) pressure at a lon/lat for a forecast step, sampled
// from the grid. Returns undefined when the point is outside the grid. Values are SI; the display
// converts at its edge.
export function readoutAt(
  grid: WeatherGrid,
  lon: number,
  lat: number,
  timeIndex: number,
): WeatherReadout | undefined {
  const u = bilinearAt(grid, grid.windU[timeIndex], lon, lat);
  const v = bilinearAt(grid, grid.windV[timeIndex], lon, lat);
  if (u === undefined || v === undefined) return undefined;
  const speedMs = Math.hypot(u, v);
  const fromRad = (Math.atan2(-u, -v) + 2 * Math.PI) % (2 * Math.PI);
  const pressureField = grid.pressureMsl?.[timeIndex];
  const pressurePa = pressureField ? bilinearAt(grid, pressureField, lon, lat) : undefined;
  return { speedMs, fromRad, pressurePa };
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/weather-readout.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/features/weather/weather-readout.ts src/features/weather/weather-readout.test.ts
git commit -m "feat(weather): add pressure to the tap readout"
```

---

### Task 6: Wire the pressure overlay and the pressure readout into the app

**Files:**
- Modify: `src/features/weather/index.ts`
- Modify: `src/widgets/chart-canvas/ChartCanvas.svelte`
- Modify: `src/app/App.svelte`

- [ ] **Step 1: Export the new public API.** In `src/features/weather/index.ts`, change `type WindReadout` to `type WeatherReadout` and add the overlay export:

```ts
export { default as WeatherTimeControl } from './WeatherTimeControl.svelte';
export { type ForecastOptions, fetchForecast } from './weather-client';
export { readoutAt, type WeatherReadout } from './weather-readout';
export { createPressureOverlay } from './pressure-overlay';
export { createWindOverlay } from './wind-overlay';
```

- [ ] **Step 2: Register and sync the overlay in the map widget.** In `ChartCanvas.svelte`, change the import on line 17 to `import { createPressureOverlay, createWindOverlay } from '$features/weather';`. After the wind overlay registration block (around line 169), add:

```ts
    const pressureOverlay = createPressureOverlay(weather);
    await manager.register(pressureOverlay);
    if (destroyed) return;
```

In the `tick` function, after `windOverlay.sync(ctx);` add `pressureOverlay.sync(ctx);`.

- [ ] **Step 3: Update the readout type and chip in App.** In `App.svelte`:
  - Change the import (line 39) `type WindReadout` to `type WeatherReadout`.
  - Add `pascalsToHectopascals` to the existing `$shared/lib` import.
  - Rename the state `windReadout` to `weatherReadout` (declaration around line 157, the `onMapTap` assignments, the cleanup, and the chip block). Keep the chip element class `wind-readout`.
  - In the chip (around lines 501-506), append a pressure span when present:

```svelte
    {#if weatherReadout}
      <div class="wind-readout" role="status" aria-live="polite">
        Wind <b>{fmt(metersPerSecondToKnots(weatherReadout.speedMs), 0)}</b> kn from
        <b>{fmt(radiansToBearing(weatherReadout.fromRad), 0)}</b>&deg;
        {#if weatherReadout.pressurePa !== undefined}
          &middot; <b>{fmt(pascalsToHectopascals(weatherReadout.pressurePa), 0)}</b> hPa
        {/if}
      </div>
    {/if}
```

- [ ] **Step 4: Verify the full gate** (one heavy command at a time). Run each and read the captured result:

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check 2>&1 | tee tmp/check.txt | tail -5
NODE_OPTIONS="--max-old-space-size=2048" npm test 2>&1 | tee tmp/test.txt | tail -8
/usr/local/bin/biome ci . 2>&1 | tee tmp/biome.txt | tail -5
NODE_OPTIONS="--max-old-space-size=2048" npm run cruise 2>&1 | tee tmp/cruise.txt | tail -5
NODE_OPTIONS="--max-old-space-size=2048" npm run build 2>&1 | tee tmp/build.txt | tail -5
```

Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add src/features/weather/index.ts src/widgets/chart-canvas/ChartCanvas.svelte src/app/App.svelte
git commit -m "feat(weather): wire the pressure overlay and the pressure readout"
```

---

### Task 7: Docs, live verification, and push

**Files:**
- Modify: `CHANGELOG.md`, `README.md`
- Modify: memory `project-status.md`

- [ ] **Step 1: CHANGELOG.** Add a dated entry under a new version/Unreleased section noting the pressure isobar overlay (marching-squares contours with hPa labels, themed, in the Layers panel, and pressure in the tap readout). Match the existing entry style and anchor convention.

- [ ] **Step 2: README.** Update the Weather bullet in the Status section to mention pressure isobars alongside the wind overlay; update the "follow" sentence so it lists the remaining layers (waves, precipitation, cloud, and animated wind particles).

- [ ] **Step 3: Run `/simplify` on the diff** per the project policy; apply findings, skip false positives.

- [ ] **Step 4: Final gate, then push.** The pre-push hook runs `biome ci`, `cruise`, `check`, `test`, and `build`. Push to main:

```bash
git push origin main
```

- [ ] **Step 5: Live-verify on the boat** (Playwright over https://boatpi:3443/binnacle/): enable the Pressure layer, confirm isobars render with hPa labels, scrub the Forecast time and confirm contours update, switch to night-red and confirm red isobars with no blue, and tap a point to confirm the readout shows pressure in hPa.

- [ ] **Step 6: Update the project-status memory** to record the pressure isobar layer shipped (commits, test count) and that waves, precipitation, cloud, and particles remain.
