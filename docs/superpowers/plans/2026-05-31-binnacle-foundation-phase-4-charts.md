# Binnacle Foundation, Phase 4: Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover the charts a Signal K server exposes, render any of them on the map through a generic adapter, and give the user a layer-control panel to toggle each chart, set its opacity, and reorder it. Prove it end to end: a server-configured chart appears on the map and is controllable from the panel, layered cleanly over the vector base.

**Architecture:** A pure `ChartSourceAdapter` turns a Signal K chart resource into MapLibre source and layer specs, branching on the chart `type` (tilelayer, WMS, WMTS, tileJSON, and mapstyleJSON). A `ChartOverlay` wraps each chart as an `OverlayModule` in the `basemap` z-band, so charts plug into the existing `LayerManager` and inherit toggle, opacity, and reorder for free. A small `charts-client` fetches and normalizes `/resources/charts` (v2, falling back to v1). A `layers-panel` widget renders the manager's registered overlays with a toggle, an opacity slider, and drag-to-reorder, driven by a runes-backed view of layer state. This realizes design spec sections 5 (charts) and the layer-control model.

**Tech Stack:** Svelte 5 runes, TypeScript, the existing `shared/map` LayerManager and `shared/signalk` client, `maplibre-gl` 5.24, `pmtiles` 4.4. Biome, svelte-check, Vitest, Playwright, and dependency-cruiser as before.

**Project rules:** Honors `CLAUDE.md`. American English, no em dashes, Oxford commas, default to no comments. Biome lint and format, type-check with `svelte-check --tsconfig ./tsconfig.app.json`, one heavy verification at a time on the Pi. This whole phase is one major step, ending with the `/cleanup` skill and a fix-everything-including-nit pass.

**Build discipline (standing lesson from Phases 1 to 3):** lead-driven, written directly from this plan (more reliable than agent teams on this Pi). The lead does NOT commit until an explicit file-existence check confirms every file is on disk AND every gate is green. Never claim green in a commit before verifying. Push only after the full local gate passes.

---

## Module boundary note

- `src/shared/map/` gains the `ChartSourceAdapter` and `ChartOverlay` (generic map infrastructure, imports only `shared`).
- `src/features/charts/` holds the charts client (fetch and normalize `/resources/charts`) and the chart registration glue (a `features` slice; imports `shared`).
- `src/features/layers-panel/` holds the layer-control UI and its runes view of layer state (a `features` slice; imports `shared`).
- `src/widgets/chart-canvas/` registers discovered charts with the manager on load.
- `src/app/App.svelte` renders the layers panel over the chart.

dependency-cruiser stays green: imports flow down only, no feature-to-feature imports.

---

## File structure created in this phase

- `src/shared/map/chart-types.ts` : the `SignalKChart` resource type and `MapSourceType`.
- `src/shared/map/chart-adapter.ts` : `chartToSpecs(chart, serverBase)` returning `{ sources, layers, opacityProperty }`.
- `src/shared/map/chart-adapter.test.ts` : adapter tests (one fixture per chart type).
- `src/shared/map/chart-overlay.ts` : `createChartOverlay(chart, serverBase)` as an `OverlayModule`.
- `src/shared/map/chart-overlay.test.ts` : overlay tests (mocked map).
- `src/features/charts/charts-client.ts` : fetch and normalize `/resources/charts` (v2, fall back to v1).
- `src/features/charts/charts-client.test.ts` : client tests (mocked fetch).
- `src/features/charts/index.ts` : the slice public API.
- `src/features/layers-panel/layers-view.svelte.ts` : a runes view of registered layers (id, title, visible, opacity, order).
- `src/features/layers-panel/layers-view.svelte.test.ts` : view tests.
- `src/features/layers-panel/LayersPanel.svelte` : the toggle, opacity, and reorder UI.
- `src/features/layers-panel/index.ts` : the slice public API.
- `src/shared/map/layer-manager.ts` : add `move(id, beforeId)` and a `layers()` snapshot accessor for the panel.
- `src/widgets/chart-canvas/ChartCanvas.svelte` : discover and register charts on load; expose the manager.
- `src/app/App.svelte` : render `LayersPanel`.

---

## Task 1: The chart resource type

**Files:**
- Create: `src/shared/map/chart-types.ts`

- [ ] **Step 1: Write the type**

Create `src/shared/map/chart-types.ts`:
```ts
export type MapSourceType =
  | 'tilelayer'
  | 'WMS'
  | 'WMTS'
  | 'tileJSON'
  | 'mapstyleJSON'
  | 'S-57';

export interface SignalKChart {
  identifier: string;
  name: string;
  description?: string;
  type: MapSourceType;
  scale?: number;
  bounds?: [number, number, number, number];
  minzoom?: number;
  maxzoom?: number;
  format?: string;
  url?: string;
  tilemapUrl?: string;
  layers?: string[];
}
```

- [ ] **Step 2: Type-check and commit**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
git add src/shared/map/chart-types.ts
git commit -m "feat(charts): the Signal K chart resource type"
```

---

## Task 2: The chart-source adapter (test-first)

**Files:**
- Create: `src/shared/map/chart-adapter.ts`
- Test: `src/shared/map/chart-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/map/chart-adapter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { chartToSpecs } from './chart-adapter';
import type { SignalKChart } from './chart-types';

const base = 'http://pi.local';

describe('chartToSpecs', () => {
  it('builds a raster source and layer for a tilelayer', () => {
    const chart: SignalKChart = {
      identifier: 'noaa',
      name: 'NOAA',
      type: 'tilelayer',
      minzoom: 0,
      maxzoom: 16,
      tilemapUrl: '/signalk/chart-tiles/noaa/{z}/{x}/{y}',
      bounds: [-180, -85, 180, 85],
    };
    const { sources, layers, opacityProperty } = chartToSpecs(chart, base);
    const sourceId = Object.keys(sources)[0];
    expect(sources[sourceId].type).toBe('raster');
    expect((sources[sourceId] as { tiles: string[] }).tiles[0]).toBe(
      'http://pi.local/signalk/chart-tiles/noaa/{z}/{x}/{y}',
    );
    expect(layers[0].type).toBe('raster');
    expect(opacityProperty).toBe('raster-opacity');
  });

  it('builds a vector source for a tileJSON chart', () => {
    const chart: SignalKChart = {
      identifier: 'enc',
      name: 'ENC',
      type: 'tileJSON',
      url: 'http://pi.local/signalk/enc/tilejson.json',
    };
    const { sources } = chartToSpecs(chart, base);
    const sourceId = Object.keys(sources)[0];
    expect(sources[sourceId].type).toBe('vector');
    expect((sources[sourceId] as { url: string }).url).toBe(
      'http://pi.local/signalk/enc/tilejson.json',
    );
  });

  it('resolves a pmtiles url to the pmtiles protocol', () => {
    const chart: SignalKChart = {
      identifier: 'region',
      name: 'Region',
      type: 'tileJSON',
      url: '/signalk/pmtiles/region.pmtiles',
    };
    const { sources } = chartToSpecs(chart, base);
    const sourceId = Object.keys(sources)[0];
    expect((sources[sourceId] as { url: string }).url).toBe(
      'pmtiles://http://pi.local/signalk/pmtiles/region.pmtiles',
    );
  });

  it('builds a raster source for a WMS chart', () => {
    const chart: SignalKChart = {
      identifier: 'wms',
      name: 'WMS',
      type: 'WMS',
      tilemapUrl: '/signalk/wms/{bbox-epsg-3857}',
    };
    const { sources, layers } = chartToSpecs(chart, base);
    const sourceId = Object.keys(sources)[0];
    expect(sources[sourceId].type).toBe('raster');
    expect(layers[0].type).toBe('raster');
  });

  it('passes through an absolute tile url unchanged', () => {
    const chart: SignalKChart = {
      identifier: 'osm',
      name: 'OSM',
      type: 'tilelayer',
      url: 'https://tile.example/{z}/{x}/{y}.png',
    };
    const { sources } = chartToSpecs(chart, base);
    const sourceId = Object.keys(sources)[0];
    expect((sources[sourceId] as { tiles: string[] }).tiles[0]).toBe(
      'https://tile.example/{z}/{x}/{y}.png',
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/map/chart-adapter.test.ts
```
Expected: FAIL, cannot resolve `./chart-adapter`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/map/chart-adapter.ts`:
```ts
import type { SourceSpecification } from 'maplibre-gl';
import type { SignalKChart } from './chart-types';

export interface ChartSpecs {
  sources: Record<string, SourceSpecification>;
  layers: Array<{ id: string; type: string; source: string }>;
  opacityProperty: string;
}

function absolute(url: string, base: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function tileTemplate(chart: SignalKChart, base: string): string {
  const template = chart.tilemapUrl ?? chart.url ?? '';
  return absolute(template, base);
}

function rasterSpecs(chart: SignalKChart, base: string): ChartSpecs {
  const sourceId = `chart-${chart.identifier}`;
  const layerId = `${sourceId}-layer`;
  const source: SourceSpecification = {
    type: 'raster',
    tiles: [tileTemplate(chart, base)],
    tileSize: 256,
    ...(chart.minzoom !== undefined ? { minzoom: chart.minzoom } : {}),
    ...(chart.maxzoom !== undefined ? { maxzoom: chart.maxzoom } : {}),
    ...(chart.bounds ? { bounds: chart.bounds } : {}),
  } as SourceSpecification;
  return {
    sources: { [sourceId]: source },
    layers: [{ id: layerId, type: 'raster', source: sourceId }],
    opacityProperty: 'raster-opacity',
  };
}

function vectorSpecs(chart: SignalKChart, base: string): ChartSpecs {
  const sourceId = `chart-${chart.identifier}`;
  const raw = chart.url ?? chart.tilemapUrl ?? '';
  const resolved = absolute(raw, base);
  const url = resolved.endsWith('.pmtiles') ? `pmtiles://${resolved}` : resolved;
  const source = { type: 'vector', url } as SourceSpecification;
  return {
    sources: { [sourceId]: source },
    layers: [],
    opacityProperty: 'fill-opacity',
  };
}

export function chartToSpecs(chart: SignalKChart, serverBase: string): ChartSpecs {
  switch (chart.type) {
    case 'tileJSON':
      return vectorSpecs(chart, serverBase);
    case 'tilelayer':
    case 'WMS':
    case 'WMTS':
    case 'S-57':
      return rasterSpecs(chart, serverBase);
    default:
      return rasterSpecs(chart, serverBase);
  }
}
```

(The `mapstyleJSON` case and full vector layer styling are deferred to the ENC styling work; `tileJSON` here yields the source so a follow-up can add styled vector layers. The foundation proves raster charts plus the vector source plumbing.)

- [ ] **Step 4: Run to verify it passes**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/map/chart-adapter.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/map/chart-adapter.ts src/shared/map/chart-adapter.test.ts
git commit -m "feat(charts): the chart-source adapter"
```

---

## Task 3: The chart overlay

**Files:**
- Create: `src/shared/map/chart-overlay.ts`
- Test: `src/shared/map/chart-overlay.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/map/chart-overlay.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createChartOverlay } from './chart-overlay';
import type { OverlayContext } from './types';

function fakeMap() {
  const sources = new Set<string>();
  const layers = new Set<string>();
  return {
    sources,
    layers,
    addSource: (id: string) => sources.add(id),
    addLayer: (layer: { id: string }) => layers.add(layer.id),
    getSource: (id: string) => (sources.has(id) ? {} : undefined),
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    removeLayer: (id: string) => layers.delete(id),
    removeSource: (id: string) => sources.delete(id),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
  };
}

function ctxFor(map: ReturnType<typeof fakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

describe('chart overlay', () => {
  it('adds the chart source and layer in the basemap band', () => {
    const overlay = createChartOverlay(
      { identifier: 'noaa', name: 'NOAA', type: 'tilelayer', tilemapUrl: '/t/{z}/{x}/{y}' },
      'http://pi.local',
    );
    const map = fakeMap();
    overlay.add(ctxFor(map));
    expect(overlay.band).toBe('basemap');
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(1);
  });

  it('remove deletes the layer and source', () => {
    const overlay = createChartOverlay(
      { identifier: 'noaa', name: 'NOAA', type: 'tilelayer', tilemapUrl: '/t/{z}/{x}/{y}' },
      'http://pi.local',
    );
    const map = fakeMap();
    overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });

  it('setOpacity uses the adapter opacity property', () => {
    const overlay = createChartOverlay(
      { identifier: 'noaa', name: 'NOAA', type: 'tilelayer', tilemapUrl: '/t/{z}/{x}/{y}' },
      'http://pi.local',
    );
    const map = fakeMap();
    overlay.add(ctxFor(map));
    overlay.setOpacity?.(ctxFor(map), 0.4);
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      expect.stringContaining('chart-noaa'),
      'raster-opacity',
      0.4,
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/map/chart-overlay.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Create `src/shared/map/chart-overlay.ts`:
```ts
import { chartToSpecs } from './chart-adapter';
import type { SignalKChart } from './chart-types';
import type { OverlayContext, OverlayModule } from './types';

export function createChartOverlay(chart: SignalKChart, serverBase: string): OverlayModule {
  const specs = chartToSpecs(chart, serverBase);
  const sourceIds = Object.keys(specs.sources);
  const layerIds = specs.layers.map((layer) => layer.id);

  return {
    id: `chart-${chart.identifier}`,
    title: chart.name,
    band: 'basemap',
    supportsOpacity: true,
    add(ctx) {
      for (const sourceId of sourceIds) {
        if (!ctx.map.getSource(sourceId)) {
          ctx.map.addSource(sourceId, specs.sources[sourceId]);
        }
      }
      for (const layer of specs.layers) {
        if (!ctx.map.getLayer(layer.id)) {
          ctx.map.addLayer(layer as never, ctx.beforeIdFor('basemap'));
        }
      }
    },
    remove(ctx) {
      for (const layerId of layerIds) {
        if (ctx.map.getLayer(layerId)) ctx.map.removeLayer(layerId);
      }
      for (const sourceId of sourceIds) {
        if (ctx.map.getSource(sourceId)) ctx.map.removeSource(sourceId);
      }
    },
    setVisible(ctx, visible) {
      for (const layerId of layerIds) {
        ctx.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    },
    setOpacity(ctx, opacity) {
      for (const layerId of layerIds) {
        ctx.map.setPaintProperty(layerId, specs.opacityProperty, opacity);
      }
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/map/chart-overlay.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Export from the map slice and commit**

Add to `src/shared/map/index.ts`:
```ts
export { chartToSpecs } from './chart-adapter';
export { createChartOverlay } from './chart-overlay';
export type { MapSourceType, SignalKChart } from './chart-types';
```
Then:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
git add src/shared/map/chart-overlay.ts src/shared/map/chart-overlay.test.ts src/shared/map/index.ts
git commit -m "feat(charts): chart overlay wrapping the adapter in the basemap band"
```

---

## Task 4: The charts client

**Files:**
- Create: `src/features/charts/charts-client.ts`
- Test: `src/features/charts/charts-client.test.ts`
- Create: `src/features/charts/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/charts/charts-client.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCharts } from './charts-client';

afterEach(() => vi.restoreAllMocks());

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

describe('fetchCharts', () => {
  it('normalizes the v2 charts map to an array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        jsonResponse({
          noaa: { identifier: 'noaa', name: 'NOAA', type: 'tilelayer' },
          enc: { identifier: 'enc', name: 'ENC', type: 'tileJSON' },
        }),
      ),
    );
    const charts = await fetchCharts('http://pi.local');
    expect(charts).toHaveLength(2);
    expect(charts.map((c) => c.identifier).sort()).toEqual(['enc', 'noaa']);
  });

  it('falls back to v1 when v2 returns 404', async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(jsonResponse({}, false, 404))
      .mockReturnValueOnce(jsonResponse({ noaa: { identifier: 'noaa', name: 'NOAA', type: 'tilelayer' } }));
    vi.stubGlobal('fetch', fetchMock);
    const charts = await fetchCharts('http://pi.local');
    expect(charts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array when both endpoints fail', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({}, false, 500)));
    const charts = await fetchCharts('http://pi.local');
    expect(charts).toEqual([]);
  });

  it('tolerates a fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const charts = await fetchCharts('http://pi.local');
    expect(charts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/charts/charts-client.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Create `src/features/charts/charts-client.ts`:
```ts
import type { SignalKChart } from '$shared/map';

const V2 = '/signalk/v2/api/resources/charts';
const V1 = '/signalk/v1/api/resources/charts';

async function tryFetch(url: string): Promise<SignalKChart[] | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const body = (await response.json()) as Record<string, SignalKChart>;
    return Object.values(body);
  } catch {
    return undefined;
  }
}

export async function fetchCharts(serverBase: string): Promise<SignalKChart[]> {
  const v2 = await tryFetch(`${serverBase}${V2}`);
  if (v2) return v2;
  const v1 = await tryFetch(`${serverBase}${V1}`);
  return v1 ?? [];
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/charts/charts-client.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Public API and commit**

Create `src/features/charts/index.ts`:
```ts
export { fetchCharts } from './charts-client';
```
Then:
```bash
npm run cruise
git add src/features/charts
git commit -m "feat(charts): the charts resource client with v2 to v1 fallback"
```

---

## Task 5: LayerManager move and snapshot

**Files:**
- Modify: `src/shared/map/layer-manager.ts`
- Modify: `src/shared/map/layer-manager.test.ts`

- [ ] **Step 1: Add a failing test for the snapshot and move**

Append to `src/shared/map/layer-manager.test.ts` inside the describe block:
```ts
  it('layers() returns a snapshot of registered overlays in order', async () => {
    const manager = new LayerManager(fakeCtx());
    await manager.register(fakeOverlay('a'));
    await manager.register(fakeOverlay('b'));
    expect(manager.layers().map((l) => l.id)).toEqual(['a', 'b']);
    expect(manager.layers()[0]).toMatchObject({ visible: true, opacity: 1 });
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/map/layer-manager.test.ts
```
Expected: FAIL on the new test (`layers` is not a function).

- [ ] **Step 3: Add the snapshot accessor**

In `src/shared/map/layer-manager.ts`, add a public method. The snapshot returns id, title, band, visible, and opacity in registration order:
```ts
  layers(): Array<{ id: string; title: string; visible: boolean; opacity: number }> {
    return [...this.#modules.values()].map((module) => {
      const state = this.#state.get(module.id) ?? { visible: true, opacity: 1 };
      return { id: module.id, title: module.title, visible: state.visible, opacity: state.opacity };
    });
  }
```

- [ ] **Step 4: Run to verify it passes**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/map/layer-manager.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/map/layer-manager.ts src/shared/map/layer-manager.test.ts
git commit -m "feat(map): layer-manager snapshot accessor for the panel"
```

---

## Task 6: The layers-panel view and UI

**Files:**
- Create: `src/features/layers-panel/layers-view.svelte.ts`
- Test: `src/features/layers-panel/layers-view.svelte.test.ts`
- Create: `src/features/layers-panel/LayersPanel.svelte`
- Create: `src/features/layers-panel/index.ts`

- [ ] **Step 1: Write the failing view test**

Create `src/features/layers-panel/layers-view.svelte.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LayerManager } from '$shared/map';
import type { OverlayContext, OverlayModule } from '$shared/map';
import { LayersView } from './layers-view.svelte';

function fakeCtx(): OverlayContext {
  return { map: {} as never, beforeIdFor: () => undefined };
}

function fakeOverlay(id: string): OverlayModule {
  return {
    id,
    title: id.toUpperCase(),
    band: 'basemap',
    supportsOpacity: true,
    add: () => {},
    remove: () => {},
    setVisible: () => {},
    setOpacity: () => {},
  };
}

describe('LayersView', () => {
  it('reflects the manager snapshot', async () => {
    const manager = new LayerManager(fakeCtx());
    await manager.register(fakeOverlay('noaa'));
    const view = new LayersView(manager);
    view.refresh();
    expect(view.items.map((i) => i.title)).toEqual(['NOAA']);
  });

  it('toggle delegates to the manager and refreshes', async () => {
    const manager = new LayerManager(fakeCtx());
    await manager.register(fakeOverlay('noaa'));
    const view = new LayersView(manager);
    view.refresh();
    view.toggle('noaa', false);
    expect(view.items[0].visible).toBe(false);
  });

  it('setOpacity delegates and refreshes', async () => {
    const manager = new LayerManager(fakeCtx());
    await manager.register(fakeOverlay('noaa'));
    const view = new LayersView(manager);
    view.refresh();
    view.setOpacity('noaa', 0.3);
    expect(view.items[0].opacity).toBe(0.3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run --project unit-svelte src/features/layers-panel/layers-view.svelte.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write the view**

Create `src/features/layers-panel/layers-view.svelte.ts`:
```ts
import type { LayerManager } from '$shared/map';

interface LayerItem {
  id: string;
  title: string;
  visible: boolean;
  opacity: number;
}

export class LayersView {
  items = $state<LayerItem[]>([]);

  #manager: LayerManager;

  constructor(manager: LayerManager) {
    this.#manager = manager;
  }

  refresh(): void {
    this.items = this.#manager.layers();
  }

  toggle(id: string, visible: boolean): void {
    this.#manager.toggle(id, visible);
    this.refresh();
  }

  setOpacity(id: string, opacity: number): void {
    this.#manager.setOpacity(id, opacity);
    this.refresh();
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run --project unit-svelte src/features/layers-panel/layers-view.svelte.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the panel component**

Create `src/features/layers-panel/LayersPanel.svelte`:
```svelte
<script lang="ts">
  import type { LayersView } from './layers-view.svelte';

  interface Props {
    view: LayersView;
  }

  const { view }: Props = $props();
</script>

<aside class="layers-panel" aria-label="Layers">
  <h2 class="heading">Layers</h2>
  {#if view.items.length === 0}
    <p class="empty">No charts configured</p>
  {/if}
  <ul class="list">
    {#each view.items as item (item.id)}
      <li class="row">
        <label class="toggle">
          <input
            type="checkbox"
            checked={item.visible}
            onchange={(e) => view.toggle(item.id, e.currentTarget.checked)}
          />
          <span class="title">{item.title}</span>
        </label>
        <input
          class="opacity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={item.opacity}
          aria-label={`${item.title} opacity`}
          oninput={(e) => view.setOpacity(item.id, Number(e.currentTarget.value))}
        />
      </li>
    {/each}
  </ul>
</aside>

<style>
.layers-panel {
  position: absolute;
  inset-block-start: 0.75rem;
  inset-inline-start: 0.75rem;
  inline-size: 14rem;
  padding: 0.75rem;
  background: rgba(6, 9, 13, 0.85);
  border: 1px solid #243140;
  border-radius: 0.5rem;
  color: #e7edf3;
  font-family: system-ui, sans-serif;
}
.heading {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6f8aa3;
}
.empty {
  margin: 0;
  font-size: 0.8rem;
  color: #6f8aa3;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.opacity {
  inline-size: 100%;
  margin-block-start: 0.25rem;
}
</style>
```

(Drag-to-reorder is deferred to a focused follow-up; the panel ships toggle and opacity now, which is the core of the layer-control model. The `move` method and a drag handle are a clean later addition against the same view.)

- [ ] **Step 6: Public API and commit**

Create `src/features/layers-panel/index.ts`:
```ts
export { LayersView } from './layers-view.svelte';
export { default as LayersPanel } from './LayersPanel.svelte';
```
Then:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
npm run cruise
git add src/features/layers-panel
git commit -m "feat(layers-panel): toggle and opacity layer control"
```

---

## Task 7: Wire chart discovery and the panel into the canvas and shell

**Files:**
- Modify: `src/widgets/chart-canvas/ChartCanvas.svelte`
- Modify: `src/app/App.svelte`

- [ ] **Step 1: Discover and register charts on map load**

In `ChartCanvas.svelte`, after registering the vessel overlay, fetch charts and register each as a chart overlay, then expose the manager and a `LayersView` to the parent via a callback prop or a bindable. Concretely, add a prop `onReady?: (view: LayersView) => void` and call it after charts register:
```ts
  import { createChartOverlay } from '$shared/map';
  import { fetchCharts } from '$features/charts';
  import { LayersView } from '$features/layers-panel';
```
Inside the `load` handler, after the vessel overlay is registered:
```ts
  const serverBase = `${location.protocol}//${location.host}`;
  const charts = await fetchCharts(serverBase);
  for (const chart of charts) {
    await manager.register(createChartOverlay(chart, serverBase));
  }
  const view = new LayersView(manager);
  view.refresh();
  onReady?.(view);
```
Add `onReady` to the `Props` interface as `onReady?: (view: LayersView) => void` and destructure it.

- [ ] **Step 2: Render the panel in the shell**

In `App.svelte`, hold a `LayersView | undefined` in a `$state`, pass `onReady={(v) => (layersView = v)}` to `ChartCanvas`, and render `{#if layersView}<LayersPanel view={layersView} />{/if}` inside the `.chart-host` section (which is `position: relative`, so the panel's absolute positioning anchors to it). Import `LayersPanel` and the `LayersView` type from `$features/layers-panel`.

- [ ] **Step 3: Type-check, build, e2e (one at a time)**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build
NODE_OPTIONS="--max-old-space-size=2048" npm run test:e2e
```
Expected: all green. The e2e smoke still asserts only the stable chrome, which holds (the panel shows "No charts configured" when the preview has no server).

- [ ] **Step 4: Commit**

```bash
git add src/widgets/chart-canvas/ChartCanvas.svelte src/app/App.svelte
git commit -m "feat(app): discover charts and render the layers panel"
```

---

## Task 8: Full local gate (one heavy command at a time)

- [ ] **Step 1: Biome** : `biome ci .`
- [ ] **Step 2: Cruise** : `npm run cruise` (shared/map self-contained, features/charts and features/layers-panel import only shared, widgets imports features, entities, and shared).
- [ ] **Step 3: Type-check** : `NODE_OPTIONS="--max-old-space-size=2048" npm run check`
- [ ] **Step 4: Tests** : `NODE_OPTIONS="--max-old-space-size=2048" npm test`
- [ ] **Step 5: Build** : `NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build`
- [ ] **Step 6: e2e** : `NODE_OPTIONS="--max-old-space-size=2048" npm run test:e2e`

Confirm every one is green before committing the phase close.

---

## Task 9: Cleanup gate and phase close

- [ ] **Step 1: Run `/cleanup`** against the Phase 4 diff (inline lead audit acceptable for this surface), briefing on the style rules.
- [ ] **Step 2: Fix every finding**, including low and nit.
- [ ] **Step 3: Doc gate.** Add the Phase 4 CHANGELOG entry. Update the README status (charts discovered from the server now render and are controllable). Confirm CLAUDE.md still matches.
- [ ] **Step 4: Re-run the full local gate** (Task 8) and confirm green.
- [ ] **Step 5: Commit, then push.**
- [ ] **Step 6: Confirm exit criteria.** A server-configured chart renders on the map, the layers panel toggles and fades it, the adapter and overlay and client are unit-tested, and dependency-cruiser confirms the new slices' boundaries.

When all are true, Phase 4 is complete and Phase 5 (AIS targets and CPA/TCPA) can begin.

---

## Self-review notes

- **Spec coverage:** implements the charts layer of the design (the generic ChartSourceAdapter over `/resources/charts`, branching on chart `type`, honoring bounds and zoom, with PMTiles resolved to the `pmtiles://` protocol) and the layer-control model (per-layer toggle and opacity through the existing LayerManager). The full S-52 ENC vector styling and drag-to-reorder are explicitly deferred to focused follow-ups; the foundation proves raster charts plus the vector-source plumbing and the control surface.
- **Deferred, recorded:** `mapstyleJSON` full-style merge, S-57 vector layer styling, and drag-to-reorder. Each is a clean later addition against the adapter and the `move` accessor, with no core change.
- **Placeholder scan:** none. Every step has concrete file contents and commands.
- **Type and name consistency:** `SignalKChart`, `chartToSpecs`, `ChartSpecs`, `createChartOverlay`, `fetchCharts`, `LayersView`, and `LayersPanel` are used identically across tasks. Chart source and layer ids are derived once as `chart-${identifier}` and reused.
- **Build discipline:** lead-driven, verify-before-commit, never push on red, per the Phases 1 to 3 lesson.
- **Pi memory:** every heavy command runs alone.
