# Weather RainViewer Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time precipitation radar layer from RainViewer's free tiles (deferred from spec step 6) as its own "Rain radar" weather layer: the latest radar frame, themed, off by default, fetched when enabled.

**Architecture:** A small client fetches `weather-maps.json` (host plus timestamped frames); the latest frame's tile template feeds a raster `OverlayModule` in the `weather` band, reusing the depth-charts streaming-raster pattern (raster source, raster layer, night-red desaturate and dim). The frames live on the existing `WeatherStore`; the app fetches radar when the layer is on, mirroring the marine-fetch gating. The layer is distinct from the Open-Meteo forecast precipitation field (observed radar vs forecast), and it is automatically grouped into the Layers-panel Weather group and the Weather menu section because both derive from `band === 'weather'`. The animated frame loop and forecast-field handoff on the scrubber are documented follow-ons.

**Tech Stack:** Svelte 5 runes, MapLibre GL JS 5 (raster source, `RasterTileSource.setTiles` for frame updates), TypeScript, Vitest. RainViewer tile URL: `{host}{path}/{size}/{z}/{x}/{y}/{color}/{options}.png` (size 256, color 2 universal blue, options `1_1` smooth and snow). Times stored in ms.

**Pi build policy:** Lead runs every verification, one heavy command at a time, `NODE_OPTIONS="--max-old-space-size=2048"`. Per task: targeted `npx vitest run <file>` plus the fast pre-commit hook. Full heavy chain at the push checkpoint. American English, no em dashes, Oxford commas, no "&" in text, minimal comments, named re-exports only.

---

### Task 1: RainViewer client and radar state

**Files:**
- Modify: `src/entities/weather/weather-grid.ts` (add `RadarFrame`, `RadarData`)
- Modify: `src/entities/weather/weather-store.svelte.ts` (radar state + `setRadar`)
- Modify: `src/entities/weather/index.ts` (export the types)
- Create: `src/features/weather/rainviewer-client.ts`
- Test: `src/features/weather/rainviewer-client.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchRadar } from './rainviewer-client';

function res(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

const maps = {
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [
      { time: 1780508400, path: '/v2/radar/aaa' },
      { time: 1780509000, path: '/v2/radar/bbb' },
    ],
    nowcast: [{ time: 1780509600, path: '/v2/radar/ccc' }],
  },
};

describe('fetchRadar', () => {
  it('parses host and frames (past then nowcast), times in ms', async () => {
    const fetchFn = vi.fn(async () => res(maps));
    const radar = await fetchRadar(fetchFn as unknown as typeof fetch);
    expect(radar?.host).toBe('https://tilecache.rainviewer.com');
    expect(radar?.frames).toHaveLength(3);
    expect(radar?.frames[0]).toEqual({ time: 1780508400000, path: '/v2/radar/aaa' });
    expect(radar?.frames[2].path).toBe('/v2/radar/ccc');
  });

  it('returns undefined on failure', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await fetchRadar(fetchFn as unknown as typeof fetch)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/rainviewer-client.test.ts`. Expected: FAIL.

- [ ] **Step 3: Add the types** in `weather-grid.ts` (after `WeatherGrid`):

```ts
export interface RadarFrame {
  time: number; // epoch ms
  path: string;
}

export interface RadarData {
  host: string;
  frames: RadarFrame[]; // ascending by time
}
```

- [ ] **Step 4: Add radar state** to `WeatherStore` in `weather-store.svelte.ts`:

Import `RadarData`. Add `radar = $state<RadarData | undefined>(undefined);` and:

```ts
  setRadar(radar: RadarData): void {
    this.radar = radar;
  }
```

- [ ] **Step 5: Export the types** in `src/entities/weather/index.ts`: add `RadarData` and `RadarFrame` to the existing `weather-grid` type re-export.

- [ ] **Step 6: Implement the client.**

```ts
import type { RadarData } from '$entities/weather';

const MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';

interface RainViewerMaps {
  host?: string;
  radar?: {
    past?: Array<{ time: number; path: string }>;
    nowcast?: Array<{ time: number; path: string }>;
  };
}

// Fetch the RainViewer radar frame index (past plus nowcast). Best-effort: returns undefined on any
// failure so the radar layer degrades quietly. Times are converted to ms; frames are ascending.
export async function fetchRadar(
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<RadarData | undefined> {
  try {
    const response = await fetchFn(MAPS_URL, { credentials: 'omit' });
    if (!response.ok) return undefined;
    const body = (await response.json()) as RainViewerMaps;
    if (!body.host || !body.radar) return undefined;
    const raw = [...(body.radar.past ?? []), ...(body.radar.nowcast ?? [])];
    const frames = raw
      .map((f) => ({ time: f.time * 1000, path: f.path }))
      .sort((a, b) => a.time - b.time);
    if (frames.length === 0) return undefined;
    return { host: body.host, frames };
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 7: Run tests green.** Run: `npx vitest run src/features/weather/rainviewer-client.test.ts src/entities/weather`. Expected: PASS.

- [ ] **Step 8: Format and commit.**

```bash
/usr/local/bin/biome check --write src/entities/weather/weather-grid.ts src/entities/weather/weather-store.svelte.ts src/entities/weather/index.ts src/features/weather/rainviewer-client.ts src/features/weather/rainviewer-client.test.ts
git add src/entities/weather/weather-grid.ts src/entities/weather/weather-store.svelte.ts src/entities/weather/index.ts src/features/weather/rainviewer-client.ts src/features/weather/rainviewer-client.test.ts
git commit -m "feat(weather): fetch the RainViewer radar frame index"
```

---

### Task 2: Radar frame helpers

**Files:**
- Create: `src/features/weather/radar-frames.ts`
- Test: `src/features/weather/radar-frames.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import type { RadarFrame } from '$entities/weather';
import { frameTiles, latestFrame } from './radar-frames';

const frames: RadarFrame[] = [
  { time: 1000, path: '/v2/radar/a' },
  { time: 3000, path: '/v2/radar/b' },
  { time: 2000, path: '/v2/radar/c' },
];

describe('latestFrame', () => {
  it('returns the frame with the greatest time', () => {
    expect(latestFrame(frames)?.path).toBe('/v2/radar/b');
  });
  it('returns undefined for no frames', () => {
    expect(latestFrame([])).toBeUndefined();
  });
});

describe('frameTiles', () => {
  it('builds a RainViewer tile template', () => {
    const url = frameTiles('https://tilecache.rainviewer.com', frames[0]);
    expect(url).toBe('https://tilecache.rainviewer.com/v2/radar/a/256/{z}/{x}/{y}/2/1_1.png');
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/radar-frames.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

```ts
import type { RadarFrame } from '$entities/weather';

const TILE_SIZE = 256;
const COLOR_SCHEME = 2; // RainViewer "universal blue" intensity palette
const OPTIONS = '1_1'; // smoothed, with snow

// The most recent frame (the current radar), or undefined when there are none.
export function latestFrame(frames: RadarFrame[]): RadarFrame | undefined {
  let best: RadarFrame | undefined;
  for (const frame of frames) {
    if (!best || frame.time > best.time) best = frame;
  }
  return best;
}

// The MapLibre raster tile template for a RainViewer frame.
export function frameTiles(host: string, frame: RadarFrame): string {
  return `${host}${frame.path}/${TILE_SIZE}/{z}/{x}/{y}/${COLOR_SCHEME}/${OPTIONS}.png`;
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/radar-frames.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/radar-frames.ts src/features/weather/radar-frames.test.ts
git add src/features/weather/radar-frames.ts src/features/weather/radar-frames.test.ts
git commit -m "feat(weather): radar frame helpers"
```

---

### Task 3: Radar overlay

**Files:**
- Modify: `src/shared/testing/fake-map.ts` (add `setTiles` to the fake source)
- Create: `src/features/weather/radar-overlay.ts`
- Test: `src/features/weather/radar-overlay.test.ts`

- [ ] **Step 1: Add `setTiles` to the fake-map source.** In the `sources` map value type add `setTiles: (tiles: unknown) => void;`, and in `addSource` add `setTiles: vi.fn(),` to the stored object.

- [ ] **Step 2: Write the failing overlay test.**

```ts
import { describe, expect, it } from 'vitest';
import { WeatherStore } from '$entities/weather';
import { mapThemePaint, type OverlayContext } from '$shared/map';
import { createFakeMap } from '$shared/testing/fake-map';
import { createRadarOverlay } from './radar-overlay';

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

function storeWithRadar(): WeatherStore {
  const store = new WeatherStore();
  store.setRadar({
    host: 'https://tilecache.rainviewer.com',
    frames: [
      { time: 1000, path: '/v2/radar/a' },
      { time: 2000, path: '/v2/radar/b' },
    ],
  });
  return store;
}

describe('radar overlay', () => {
  it('adds a raster source and layer in the weather band', () => {
    const overlay = createRadarOverlay(storeWithRadar());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(overlay.band).toBe('weather');
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(1);
  });

  it('points the source at the latest frame on sync', () => {
    const overlay = createRadarOverlay(storeWithRadar());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    const source = [...map.sources.values()][0] as { setTiles: ReturnType<typeof vi.fn> };
    overlay.sync(ctxFor(map));
    expect(source.setTiles).toHaveBeenCalledWith([
      'https://tilecache.rainviewer.com/v2/radar/b/256/{z}/{x}/{y}/2/1_1.png',
    ]);
  });

  it('removes its layer and source', () => {
    const overlay = createRadarOverlay(storeWithRadar());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });

  it('recolors for the theme without throwing', () => {
    const overlay = createRadarOverlay(storeWithRadar());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(() => overlay.applyTheme?.(ctxFor(map), mapThemePaint('night-red'))).not.toThrow();
  });
});
```

Add `import { vi } from 'vitest';` to the test imports.

- [ ] **Step 3: Run it, expect failure.** Run: `npx vitest run src/features/weather/radar-overlay.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement.** (Raster overlay; latest frame; themed like the depth-charts raster.)

```ts
import type { RasterLayerSpecification, RasterSourceSpecification } from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import { frameTiles, latestFrame } from './radar-frames';

const SOURCE_ID = 'binnacle-weather-radar';
const LAYER_ID = 'binnacle-weather-radar-layer';

export interface RadarOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// RainViewer real-time precipitation radar as a themed raster overlay in the weather band. Off by
// default. Shows the latest frame; it re-points the source at the newest frame whenever the store's
// radar data changes. Night-red desaturates and dims the raster (it cannot be recolored), the same
// treatment the depth-charts rasters use.
export function createRadarOverlay(store: WeatherStore): RadarOverlay {
  let lastRadar: unknown;

  return {
    id: 'weather-radar',
    title: 'Rain radar',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [LAYER_ID],
    add(ctx) {
      if (!ctx.map.getSource(SOURCE_ID)) {
        const spec: RasterSourceSpecification = {
          type: 'raster',
          tiles: [],
          tileSize: 256,
          attribution: 'RainViewer',
        };
        ctx.map.addSource(SOURCE_ID, spec);
      }
      if (!ctx.map.getLayer(LAYER_ID)) {
        const layer: RasterLayerSpecification = {
          id: LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: { 'raster-opacity': 0.8 },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
      }
    },
    sync(ctx) {
      if (store.radar === lastRadar) return;
      lastRadar = store.radar;
      const radar = store.radar;
      const frame = radar ? latestFrame(radar.frames) : undefined;
      if (!radar || !frame) return;
      const source = ctx.map.getSource(SOURCE_ID) as { setTiles(t: string[]): void } | undefined;
      source?.setTiles([frameTiles(radar.host, frame)]);
    },
    remove(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
    },
    applyTheme(ctx, paint) {
      ctx.map.setPaintProperty(LAYER_ID, 'raster-saturation', paint.rasterSaturation);
      ctx.map.setPaintProperty(LAYER_ID, 'raster-brightness-max', paint.rasterBrightnessMax);
    },
  };
}
```

- [ ] **Step 5: Run tests green.** Run: `npx vitest run src/features/weather/radar-overlay.test.ts`. Expected: PASS.

- [ ] **Step 6: Type-check** (raster types): `NODE_OPTIONS="--max-old-space-size=2048" npm run check`. Expected: 0 errors.

- [ ] **Step 7: Format and commit.**

```bash
/usr/local/bin/biome check --write src/shared/testing/fake-map.ts src/features/weather/radar-overlay.ts src/features/weather/radar-overlay.test.ts
git add src/shared/testing/fake-map.ts src/features/weather/radar-overlay.ts src/features/weather/radar-overlay.test.ts
git commit -m "feat(weather): RainViewer radar overlay"
```

---

### Task 4: Radar legend entry

**Files:**
- Modify: `src/features/weather/legend.ts`
- Modify: `src/features/weather/legend.test.ts`

- [ ] **Step 1: Extend the failing test.** Add a case:

```ts
  it('builds an intensity legend for the radar', () => {
    const legend = weatherLegend('weather-radar', 'day');
    expect(legend?.title).toMatch(/radar/i);
    expect(legend?.swatches.length).toBeGreaterThan(1);
  });
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/legend.test.ts`. Expected: FAIL.

- [ ] **Step 3: Add the radar case** in `weatherLegend`'s switch (RainViewer's palette is fixed and not theme-dependent, so the swatches are approximate fixed colors with light, moderate, and heavy labels):

```ts
    case 'weather-radar':
      return {
        id: layerId,
        title: 'Rain radar',
        swatches: [
          { color: 'rgb(120, 160, 230)', label: 'light' },
          { color: 'rgb(60, 170, 90)', label: 'moderate' },
          { color: 'rgb(230, 200, 60)', label: 'heavy' },
          { color: 'rgb(220, 70, 60)', label: 'intense' },
        ],
      };
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/legend.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/legend.ts src/features/weather/legend.test.ts
git add src/features/weather/legend.ts src/features/weather/legend.test.ts
git commit -m "feat(weather): radar legend entry"
```

---

### Task 5: Wire the radar overlay and fetch

**Files:**
- Modify: `src/features/weather/index.ts`
- Modify: `src/widgets/chart-canvas/ChartCanvas.svelte`
- Modify: `src/app/App.svelte`

- [ ] **Step 1: Export the public API.** In `src/features/weather/index.ts` add `export { fetchRadar } from './rainviewer-client';` and `export { createRadarOverlay } from './radar-overlay';` (keep alphabetical).

- [ ] **Step 2: Register and sync.** In `ChartCanvas.svelte`, add `createRadarOverlay` to the weather import. Register it after the cloud overlay (so it sits low in the weather band with the other fields, below the wind arrows and isobars), and add `radarOverlay.sync(ctx);` after `cloudOverlay.sync(ctx);` in `tick`:

```ts
    const radarOverlay = createRadarOverlay(weather);
    await manager.register(radarOverlay);
    if (destroyed) return;
```

- [ ] **Step 3: Fetch radar when its layer is on.** In `App.svelte`:
  - Import `fetchRadar` from `$features/weather`.
  - Add a `radarActive` derived: `const radarActive = $derived(weatherLayers.some((i) => i.id === 'weather-radar' && i.visible));`
  - In `scheduleWeather`, fetch radar in parallel when active and set it:

```ts
    const [grid, marine, radar] = await Promise.all([
      fetchForecast(bounds, opts),
      wavesActive ? fetchMarine(bounds, opts) : Promise.resolve(undefined),
      radarActive ? fetchRadar() : Promise.resolve(undefined),
    ]);
    if (grid) weather.setGrid(marine ? mergeMarine(grid, marine) : grid);
    else weather.setStatus(weather.grid ? 'stale' : 'error');
    if (radar) weather.setRadar(radar);
```

  - Add a one-shot refetch effect mirroring the waves one, so enabling the radar layer fetches it without waiting for a pan:

```ts
let radarRequested = false;
$effect(() => {
  if (radarActive && !radarRequested) {
    radarRequested = true;
    scheduleWeather();
  } else if (!radarActive) {
    radarRequested = false;
  }
});
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
git commit -m "feat(weather): wire the RainViewer radar overlay and fetch"
```

---

### Task 6: Docs, simplify, push, live verification, and memory

- [ ] **Step 1: CHANGELOG and README.** Add the RainViewer real-time radar layer to the Weather entries; note the animated radar loop and the scrubber handoff to the forecast field as the remaining radar follow-ons, leaving animated wind particles as the other weather follow-on.

- [ ] **Step 2: Run `/simplify`** on the diff; apply findings, skip false positives with reasons.

- [ ] **Step 3: Final gate and push.** The pre-push hook runs the full chain. `git push origin main`.

- [ ] **Step 4: Live-verify** (Playwright, https://boatpi:3443/binnacle/, nssdb CA, no TLS bypass): seed localStorage to enable `weather-radar` over a region with rain; confirm the radar raster renders, the weather-maps.json and at least one tilecache request fire, night-red desaturates and dims it, and the Layers panel and menu show the Rain radar layer. Capture day and night screenshots to `tmp/`.

- [ ] **Step 5: Update the project-status memory** to record the RainViewer radar layer shipped (latest frame; loop and scrubber handoff deferred), leaving the animated wind particles as the last weather follow-on.
