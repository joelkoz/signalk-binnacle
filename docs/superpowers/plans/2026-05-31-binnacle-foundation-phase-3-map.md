# Binnacle Foundation, Phase 3: The Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a MapLibre GL map with a vector base, an extensible layer-manager that gives every overlay an independent toggle, opacity, and deterministic z-order, and the own vessel drawn as a GPU symbol layer that rotates with heading. Prove it end to end: the map fills the chart area, the base map renders, and the vessel marker tracks live Signal K position and heading.

**Architecture:** A thin imperative wrapper owns the raw MapLibre instance (created in `onMount`, destroyed in `onDestroy`, kept entirely out of Svelte reactivity). A framework-free `LayerManager` holds an ordered registry of `OverlayModule` units and is the only thing that mutates the map for overlays. Deterministic banding comes from invisible sentinel layers installed at load, with overlays inserted via `beforeId`. Each overlay implements its own `setVisible`, `setOpacity`, `add`, and `remove`, so a new overlay later is a new file plus one registration, never core surgery. The own vessel is an `OverlayModule` backed by a GeoJSON source updated imperatively from the Signal K store, drawn as a `symbol` layer with data-driven `icon-rotate`. This realizes design spec section 6.6.

**Why no svelte-maplibre-gl:** `svelte-maplibre-gl` 2.0.1 (MIERUNE) is mature and does peer our stack (`maplibre-gl >=6.0.0-0 || ^5.19.0`, `svelte >=5.0.0`), so this is a deliberate architectural choice, not a knock on the library. The design's layer model is inherently imperative: overlays are discovered at runtime (charts from the Signal K resources API, AIS targets from the stream) and need deterministic z-order across an unknown set, which is cleaner as an explicit registry than as reactive component trees whose mount order must be policed. Depending only on raw `maplibre-gl` keeps full control of that registry and a smaller surface. The declarative wrapper can be revisited later for static UI controls, without disturbing the LayerManager.

**Tech Stack:** Svelte 5 runes, TypeScript, `maplibre-gl` 5.24.0 (the current stable; 6.0.0 is not released, only a `6.0.0-11` prerelease), `pmtiles` 4.4.1 for the PMTiles protocol, the existing `shared/signalk` store and `entities/vessel`. Biome, svelte-check, Vitest, Playwright, and dependency-cruiser as before.

**Project rules:** Honors `CLAUDE.md`. American English, no em dashes, Oxford commas, default to no comments. Lint and format with Biome (system binary), type-check with `svelte-check --tsconfig ./tsconfig.app.json`. One heavy verification process at a time on the Pi. This whole phase is one major step, so it ends with the `/cleanup` skill and a fix-everything-including-nit pass.

**Build discipline (hard lesson from Phases 1 and 2):** the lead does NOT integrate or commit until an explicit file-existence check confirms every expected file is on disk AND every gate is green. Agent spawns can fail silently (lock contention) or hang; verify each lane's file landed before running gates, and write any missing lane from this plan. Never commit or push on red.

---

## Module boundary note

New code lands in:

- `src/shared/map/` : the generic map infrastructure (the MapLibre wrapper helpers, the `LayerManager`, the `OverlayModule` and z-band types, sentinel installation, and the PMTiles protocol registration). Feature-agnostic, imports only `shared`.
- `src/features/vessel-layer/` : the own-vessel overlay module (a `features` slice, because it composes the `entities/vessel` view and the `shared/map` manager). Imports `entities` and `shared` only.
- `src/widgets/chart-canvas/` : the Svelte component that hosts the map element, instantiates the wrapper and manager on mount, and registers overlays. A `widgets` slice; imports `features`, `entities`, and `shared`.
- `src/app/App.svelte` : renders `ChartCanvas` in the chart area.

dependency-cruiser must stay green: imports flow down only.

---

## File structure created in this phase

- `src/shared/map/types.ts` : `ZBand`, the `Z_ORDER` array, `OverlayContext`, and the `OverlayModule` interface.
- `src/shared/map/sentinels.ts` : install the per-band sentinel layers and resolve `beforeId`.
- `src/shared/map/sentinels.test.ts` : sentinel install and beforeId tests (mocked map).
- `src/shared/map/layer-manager.ts` : the `LayerManager` (register, unregister, toggle, setOpacity, and reattachAll).
- `src/shared/map/layer-manager.test.ts` : manager tests (mocked map).
- `src/shared/map/pmtiles.ts` : register the PMTiles protocol with MapLibre once.
- `src/shared/map/base-style.ts` : build the vector base style object (OpenFreeMap or a PMTiles base).
- `src/shared/map/index.ts` : the slice public API.
- `src/features/vessel-layer/vessel-overlay.ts` : the own-vessel `OverlayModule` (GeoJSON source plus symbol layer, `setData` on store change).
- `src/features/vessel-layer/vessel-overlay.test.ts` : overlay tests (mocked map and a fake store).
- `src/features/vessel-layer/vessel-icon.ts` : the vessel triangle icon as an ImageData or SDF, registered via `map.addImage`.
- `src/features/vessel-layer/index.ts` : the slice public API.
- `src/widgets/chart-canvas/ChartCanvas.svelte` : the map host component.
- `src/widgets/chart-canvas/index.ts` : the slice public API.
- `src/app/App.svelte` : render `ChartCanvas`.
- `vite.config.ts` : ensure `maplibre-gl` is optimized and its worker is handled (Vite handles this; note any `optimizeDeps` need here).
- `package.json` : add `maplibre-gl` and `pmtiles`; add the `maplibre-gl` CSS import.

---

## Task 1: Add MapLibre and PMTiles, decide the major version

**Files:**
- Modify: `package.json` (lead only)
- Modify: `src/app.css` (import MapLibre CSS)

- [ ] **Step 1: Confirm the maplibre-gl version at install time**

`maplibre-gl` 5.24.0 is the current stable; 6.0.0 is not published (only a `6.0.0-11` prerelease as of this writing). Pin `^5.24.0`. The lead re-confirms before installing, in case a stable 6.0.0 has shipped since:
```bash
npm view maplibre-gl dist-tags --json
```
If a stable 6.x has shipped and is at least 30 days old, the lead may take it instead and record the reason in the commit body; otherwise stay on 5.24.0. Do not install a prerelease.

- [ ] **Step 2: Install**

```bash
cd /home/dietpi/src/signalk-binnacle
NODE_OPTIONS="--max-old-space-size=2048" npm install maplibre-gl pmtiles
```
Expected: install succeeds, `npm audit --omit=dev` reports 0 vulnerabilities. (`maplibre-gl` ships its own types, so no `@types` package is needed. `pmtiles` ships types too.)

- [ ] **Step 3: Import the MapLibre stylesheet**

MapLibre needs its CSS for controls and the canvas sizing. Add to the top of `src/app.css`:
```css
@import 'maplibre-gl/dist/maplibre-gl.css';
```

- [ ] **Step 4: Verify the build still passes**

```bash
NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build
```
Expected: clean build. MapLibre is large, so confirm it is code-split or acceptably sized; note the bundle figure for the doc gate.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/app.css
git commit -m "build: add maplibre-gl and pmtiles for the map"
```

---

## Task 2: The overlay types and z-bands

**Files:**
- Create: `src/shared/map/types.ts`

- [ ] **Step 1: Write the types**

Create `src/shared/map/types.ts`:
```ts
import type { Map as MapLibreMap } from 'maplibre-gl';

export type ZBand =
  | 'basemap'
  | 'bathymetry'
  | 'weather'
  | 'routes'
  | 'safety'
  | 'traffic'
  | 'vessel'
  | 'overlay-top';

export const Z_ORDER: readonly ZBand[] = [
  'basemap',
  'bathymetry',
  'weather',
  'routes',
  'safety',
  'traffic',
  'vessel',
  'overlay-top',
] as const;

export interface OverlayContext {
  map: MapLibreMap;
  beforeIdFor(band: ZBand): string | undefined;
}

export interface OverlayModule {
  readonly id: string;
  readonly title: string;
  readonly band: ZBand;
  readonly supportsOpacity: boolean;
  add(ctx: OverlayContext): void | Promise<void>;
  remove(ctx: OverlayContext): void;
  setVisible(ctx: OverlayContext, visible: boolean): void;
  setOpacity?(ctx: OverlayContext, opacity: number): void;
  reattach?(ctx: OverlayContext): void | Promise<void>;
}
```

- [ ] **Step 2: Type-check and commit**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
git add src/shared/map/types.ts
git commit -m "feat(map): overlay module and z-band types"
```

---

## Task 3: Sentinel layers and beforeId resolution

**Files:**
- Create: `src/shared/map/sentinels.ts`
- Test: `src/shared/map/sentinels.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/map/sentinels.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { beforeIdFor, installSentinels, sentinelId } from './sentinels';
import { Z_ORDER } from './types';

function fakeMap() {
  const layers = new Set<string>();
  return {
    layers,
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addLayer: (layer: { id: string }) => layers.add(layer.id),
  };
}

describe('sentinels', () => {
  it('installs one sentinel per z-band', () => {
    const map = fakeMap();
    installSentinels(map as never);
    for (const band of Z_ORDER) {
      expect(map.getLayer(sentinelId(band))).toBeTruthy();
    }
  });

  it('is idempotent', () => {
    const map = fakeMap();
    const spy = vi.spyOn(map, 'addLayer');
    installSentinels(map as never);
    installSentinels(map as never);
    expect(spy).toHaveBeenCalledTimes(Z_ORDER.length);
  });

  it('beforeIdFor returns the next band sentinel', () => {
    expect(beforeIdFor('traffic')).toBe(sentinelId('vessel'));
  });

  it('beforeIdFor returns undefined for the top band', () => {
    expect(beforeIdFor('overlay-top')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/map/sentinels.test.ts
```
Expected: FAIL, cannot resolve `./sentinels`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/map/sentinels.ts`:
```ts
import type { Map as MapLibreMap } from 'maplibre-gl';
import { type ZBand, Z_ORDER } from './types';

export function sentinelId(band: ZBand): string {
  return `__z__${band}`;
}

export function installSentinels(map: MapLibreMap): void {
  for (const band of Z_ORDER) {
    const id = sentinelId(band);
    if (!map.getLayer(id)) {
      map.addLayer({ id, type: 'background', layout: { visibility: 'none' } });
    }
  }
}

export function beforeIdFor(band: ZBand): string | undefined {
  const next = Z_ORDER[Z_ORDER.indexOf(band) + 1];
  return next ? sentinelId(next) : undefined;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/map/sentinels.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/map/sentinels.ts src/shared/map/sentinels.test.ts
git commit -m "feat(map): sentinel z-band layers and beforeId resolution"
```

---

## Task 4: The LayerManager

**Files:**
- Create: `src/shared/map/layer-manager.ts`
- Test: `src/shared/map/layer-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/map/layer-manager.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LayerManager } from './layer-manager';
import type { OverlayContext, OverlayModule } from './types';

function fakeCtx(): OverlayContext {
  return {
    map: {} as never,
    beforeIdFor: () => undefined,
  };
}

function fakeOverlay(id: string): OverlayModule & { events: string[] } {
  const events: string[] = [];
  return {
    id,
    title: id,
    band: 'traffic',
    supportsOpacity: true,
    events,
    add: () => {
      events.push('add');
    },
    remove: () => {
      events.push('remove');
    },
    setVisible: (_ctx, visible) => {
      events.push(`visible:${visible}`);
    },
    setOpacity: (_ctx, opacity) => {
      events.push(`opacity:${opacity}`);
    },
  };
}

describe('LayerManager', () => {
  it('adds an overlay on register and applies default state', async () => {
    const overlay = fakeOverlay('ais');
    const manager = new LayerManager(fakeCtx());
    await manager.register(overlay);
    expect(overlay.events).toContain('add');
    expect(overlay.events).toContain('visible:true');
    expect(overlay.events).toContain('opacity:1');
  });

  it('toggle drives setVisible', async () => {
    const overlay = fakeOverlay('ais');
    const manager = new LayerManager(fakeCtx());
    await manager.register(overlay);
    manager.toggle('ais', false);
    expect(overlay.events.at(-1)).toBe('visible:false');
  });

  it('setOpacity drives setOpacity', async () => {
    const overlay = fakeOverlay('ais');
    const manager = new LayerManager(fakeCtx());
    await manager.register(overlay);
    manager.setOpacity('ais', 0.4);
    expect(overlay.events.at(-1)).toBe('opacity:0.4');
  });

  it('unregister removes the overlay', async () => {
    const overlay = fakeOverlay('ais');
    const manager = new LayerManager(fakeCtx());
    await manager.register(overlay);
    manager.unregister('ais');
    expect(overlay.events.at(-1)).toBe('remove');
  });

  it('rejects a duplicate id', async () => {
    const manager = new LayerManager(fakeCtx());
    await manager.register(fakeOverlay('ais'));
    await expect(manager.register(fakeOverlay('ais'))).rejects.toThrow();
  });

  it('reattachAll re-adds and restores state', async () => {
    const overlay = fakeOverlay('ais');
    const manager = new LayerManager(fakeCtx());
    await manager.register(overlay);
    manager.setOpacity('ais', 0.5);
    overlay.events.length = 0;
    await manager.reattachAll();
    expect(overlay.events).toContain('add');
    expect(overlay.events).toContain('opacity:0.5');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/map/layer-manager.test.ts
```
Expected: FAIL, cannot resolve `./layer-manager`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/map/layer-manager.ts`:
```ts
import type { OverlayContext, OverlayModule } from './types';

interface OverlayState {
  visible: boolean;
  opacity: number;
}

export class LayerManager {
  #ctx: OverlayContext;
  #modules = new Map<string, OverlayModule>();
  #state = new Map<string, OverlayState>();

  constructor(ctx: OverlayContext) {
    this.#ctx = ctx;
  }

  async register(module: OverlayModule): Promise<void> {
    if (this.#modules.has(module.id)) {
      throw new Error(`duplicate overlay id: ${module.id}`);
    }
    this.#modules.set(module.id, module);
    const state = this.#state.get(module.id) ?? { visible: true, opacity: 1 };
    this.#state.set(module.id, state);
    await module.add(this.#ctx);
    module.setVisible(this.#ctx, state.visible);
    module.setOpacity?.(this.#ctx, state.opacity);
  }

  unregister(id: string): void {
    const module = this.#modules.get(id);
    if (!module) return;
    module.remove(this.#ctx);
    this.#modules.delete(id);
  }

  toggle(id: string, visible: boolean): void {
    const module = this.#modules.get(id);
    const state = this.#state.get(id);
    if (!module || !state) return;
    state.visible = visible;
    module.setVisible(this.#ctx, visible);
  }

  setOpacity(id: string, opacity: number): void {
    const module = this.#modules.get(id);
    const state = this.#state.get(id);
    if (!module || !state) return;
    state.opacity = opacity;
    module.setOpacity?.(this.#ctx, opacity);
  }

  async reattachAll(): Promise<void> {
    for (const [id, module] of this.#modules) {
      const state = this.#state.get(id) ?? { visible: true, opacity: 1 };
      await (module.reattach ?? module.add).call(module, this.#ctx);
      module.setVisible(this.#ctx, state.visible);
      module.setOpacity?.(this.#ctx, state.opacity);
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/map/layer-manager.test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/map/layer-manager.ts src/shared/map/layer-manager.test.ts
git commit -m "feat(map): the layer manager with toggle, opacity, and reattach"
```

---

## Task 5: PMTiles protocol and the base style

**Files:**
- Create: `src/shared/map/pmtiles.ts`
- Create: `src/shared/map/base-style.ts`

- [ ] **Step 1: Register the PMTiles protocol**

Create `src/shared/map/pmtiles.ts`:
```ts
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

let registered = false;

export function registerPmtilesProtocol(): void {
  if (registered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  registered = true;
}
```

- [ ] **Step 2: Provide the base style**

The foundation connects live, so use a hosted vector base (OpenFreeMap) by default; the offline spec will swap in a bundled PMTiles base later behind the same function. Create `src/shared/map/base-style.ts`:
```ts
import type { StyleSpecification } from 'maplibre-gl';

const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export function baseStyleUrl(): string {
  return OPENFREEMAP_STYLE_URL;
}

export function emptyStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#0a1c28' },
      },
    ],
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  };
}
```

(`emptyStyle` is the offline-safe fallback used by tests and by the no-network case; `baseStyleUrl` is the online default. The Phase 6 theming work and the offline spec will extend this.)

- [ ] **Step 3: Type-check and commit**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
git add src/shared/map/pmtiles.ts src/shared/map/base-style.ts
git commit -m "feat(map): pmtiles protocol and the base style"
```

---

## Task 6: The map slice public API

**Files:**
- Create: `src/shared/map/index.ts`
- Remove: `src/shared/map/.gitkeep`

- [ ] **Step 1: Write the public API**

Create `src/shared/map/index.ts` (named re-exports only):
```ts
export { LayerManager } from './layer-manager';
export { beforeIdFor, installSentinels, sentinelId } from './sentinels';
export { registerPmtilesProtocol } from './pmtiles';
export { baseStyleUrl, emptyStyle } from './base-style';
export { Z_ORDER } from './types';
export type { OverlayContext, OverlayModule, ZBand } from './types';
```

- [ ] **Step 2: Remove the placeholder, cruise, and commit**

```bash
git rm src/shared/map/.gitkeep
NODE_OPTIONS="--max-old-space-size=2048" npm run check
npm run cruise
git add src/shared/map/index.ts
git commit -m "feat(map): slice public API"
```

---

## Task 7: The own-vessel overlay

**Files:**
- Create: `src/features/vessel-layer/vessel-icon.ts`
- Create: `src/features/vessel-layer/vessel-overlay.ts`
- Test: `src/features/vessel-layer/vessel-overlay.test.ts`
- Create: `src/features/vessel-layer/index.ts`

- [ ] **Step 1: Write the vessel icon helper**

Create `src/features/vessel-layer/vessel-icon.ts`:
```ts
export const VESSEL_ICON_ID = 'binnacle-vessel';
const SIZE = 32;

// A filled triangle pointing up (north at 0 rotation), drawn into ImageData so
// it can be registered with map.addImage and rotated by icon-rotate.
export function vesselIconImage(): ImageData {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const cx = SIZE / 2;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const t = y / SIZE;
      const halfWidth = (t * SIZE) / 2.4;
      const inside = y > 3 && Math.abs(x - cx) <= halfWidth;
      if (inside) {
        const i = (y * SIZE + x) * 4;
        data[i] = 0x7f;
        data[i + 1] = 0xb7;
        data[i + 2] = 0xe6;
        data[i + 3] = 0xff;
      }
    }
  }
  return new ImageData(data, SIZE, SIZE);
}
```

(This is a placeholder mariner triangle. Phase 6 replaces it with the S-52-derived sprite; the overlay code does not change, only the icon source.)

- [ ] **Step 2: Write the failing test**

Create `src/features/vessel-layer/vessel-overlay.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { SignalKStore } from '$shared/signalk';
import type { OverlayContext } from '$shared/map';
import { OwnVessel } from '$entities/vessel';
import { createVesselOverlay } from './vessel-overlay';

function fakeMap() {
  const sources = new Map<string, { setData: (d: unknown) => void; data: unknown }>();
  const layers = new Set<string>();
  const images = new Set<string>();
  return {
    sources,
    layers,
    images,
    hasImage: (id: string) => images.has(id),
    addImage: (id: string) => images.add(id),
    addSource: (id: string, spec: { data: unknown }) => {
      sources.set(id, {
        data: spec.data,
        setData(d: unknown) {
          this.data = d;
        },
      });
    },
    getSource: (id: string) => sources.get(id),
    addLayer: (layer: { id: string }) => layers.add(layer.id),
    removeLayer: (id: string) => layers.delete(id),
    removeSource: (id: string) => sources.delete(id),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
  };
}

function ctxFor(map: ReturnType<typeof fakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

describe('vessel overlay', () => {
  it('adds an image, a source, and a symbol layer', async () => {
    const store = new SignalKStore();
    const overlay = createVesselOverlay(new OwnVessel(store), store);
    const map = fakeMap();
    await overlay.add(ctxFor(map));
    expect(map.images.size).toBe(1);
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(1);
  });

  it('updates the source position from the store', async () => {
    const store = new SignalKStore();
    const overlay = createVesselOverlay(new OwnVessel(store), store);
    const map = fakeMap();
    await overlay.add(ctxFor(map));
    store.applyFrame({
      self: { 'navigation.position': { latitude: 36.8, longitude: -121.7 } } as never,
      connection: { phase: 'open', attempt: 0, since: 0 },
      epoch: 1,
    });
    overlay.sync(ctxFor(map));
    const source = [...map.sources.values()][0];
    const fc = source.data as { features: Array<{ geometry: { coordinates: number[] } }> };
    expect(fc.features[0].geometry.coordinates).toEqual([-121.7, 36.8]);
  });

  it('remove deletes the layer and source', async () => {
    const store = new SignalKStore();
    const overlay = createVesselOverlay(new OwnVessel(store), store);
    const map = fakeMap();
    await overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/vessel-layer/vessel-overlay.test.ts
```
Expected: FAIL, cannot resolve `./vessel-overlay`.

- [ ] **Step 4: Write the implementation**

Create `src/features/vessel-layer/vessel-overlay.ts`:
```ts
import type { OverlayContext, OverlayModule } from '$shared/map';
import type { SignalKStore } from '$shared/signalk';
import type { OwnVessel } from '$entities/vessel';
import { VESSEL_ICON_ID, vesselIconImage } from './vessel-icon';

const SOURCE_ID = 'binnacle-own-vessel';
const LAYER_ID = 'binnacle-own-vessel-symbol';

interface VesselOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function emptyCollection() {
  return { type: 'FeatureCollection', features: [] as unknown[] };
}

export function createVesselOverlay(vessel: OwnVessel, _store: SignalKStore): VesselOverlay {
  function featureCollection() {
    const position = vessel.position;
    if (!position) return emptyCollection();
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [position.longitude, position.latitude] },
          properties: { heading: vessel.headingDegrees ?? vessel.cogDegrees ?? 0 },
        },
      ],
    };
  }

  return {
    id: 'own-vessel',
    title: 'Own vessel',
    band: 'vessel',
    supportsOpacity: true,
    add(ctx) {
      if (!ctx.map.hasImage(VESSEL_ICON_ID)) {
        ctx.map.addImage(VESSEL_ICON_ID, vesselIconImage());
      }
      ctx.map.addSource(SOURCE_ID, { type: 'geojson', data: featureCollection() } as never);
      ctx.map.addLayer(
        {
          id: LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'icon-image': VESSEL_ICON_ID,
            'icon-rotate': ['get', 'heading'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        } as never,
        ctx.beforeIdFor('vessel'),
      );
    },
    sync(ctx) {
      const source = ctx.map.getSource(SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
      source?.setData?.(featureCollection());
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LAYER_ID, 'icon-opacity', opacity);
    },
    remove(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
  };
}
```

(The `getLayer`/`getSource` guards in `remove` use the real MapLibre methods; the test's fake map provides `getSource` and `removeLayer`/`removeSource`. Add `getLayer` to the fake if the guard needs it; the test asserts the post-state, so make the fake return truthy for known ids.)

- [ ] **Step 5: Reconcile the test fake with the implementation**

The `remove` method calls `ctx.map.getLayer(LAYER_ID)`. Add `getLayer` to the test's `fakeMap` so it returns truthy when the layer exists:
```ts
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
```
Add that line inside the `fakeMap` return object in `vessel-overlay.test.ts`.

- [ ] **Step 6: Run to verify it passes**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/vessel-layer/vessel-overlay.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 7: Write the public API and clean up**

Create `src/features/vessel-layer/index.ts`:
```ts
export { createVesselOverlay } from './vessel-overlay';
export { VESSEL_ICON_ID } from './vessel-icon';
```
Remove the placeholder:
```bash
git rm src/features/.gitkeep
```

- [ ] **Step 8: Cruise and commit**

```bash
npm run cruise
git add src/features/vessel-layer
git commit -m "feat(vessel-layer): own-vessel symbol overlay with heading rotation"
```

---

## Task 8: The chart-canvas widget

**Files:**
- Create: `src/widgets/chart-canvas/ChartCanvas.svelte`
- Create: `src/widgets/chart-canvas/index.ts`
- Remove: `src/widgets/.gitkeep`

- [ ] **Step 1: Write the map host component**

Create `src/widgets/chart-canvas/ChartCanvas.svelte`:
```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import {
    baseStyleUrl,
    beforeIdFor,
    installSentinels,
    LayerManager,
    registerPmtilesProtocol,
    type OverlayContext,
  } from '$shared/map';
  import type { SignalKStore } from '$shared/signalk';
  import { OwnVessel } from '$entities/vessel';
  import { createVesselOverlay } from '$features/vessel-layer';

  interface Props {
    store: SignalKStore;
  }

  const { store }: Props = $props();

  let container: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  let manager: LayerManager | undefined;
  let vesselOverlay: ReturnType<typeof createVesselOverlay> | undefined;
  let frame = 0;

  registerPmtilesProtocol();

  onMount(() => {
    map = new maplibregl.Map({
      container,
      style: baseStyleUrl(),
      center: [0, 30],
      zoom: 2,
      attributionControl: { compact: true },
    });

    map.on('load', async () => {
      if (!map) return;
      installSentinels(map);
      const ctx: OverlayContext = { map, beforeIdFor };
      manager = new LayerManager(ctx);
      const vessel = new OwnVessel(store);
      vesselOverlay = createVesselOverlay(vessel, store);
      await manager.register(vesselOverlay);

      const tick = () => {
        if (vesselOverlay && map) vesselOverlay.sync({ map, beforeIdFor });
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
  });

  onDestroy(() => {
    if (frame) cancelAnimationFrame(frame);
    map?.remove();
  });
</script>

<div class="chart-canvas" bind:this={container}></div>

<style>
  .chart-canvas {
    inline-size: 100%;
    block-size: 100%;
  }
</style>
```

(The vessel overlay syncs on each animation frame, reading the fine-grained store cells through `OwnVessel`. This keeps the map's update loop off Svelte reactivity, per the design. Later phases can drive `sync` from a store subscription instead of a raw rAF loop if profiling favors it.)

- [ ] **Step 2: Write the public API and remove the placeholder**

Create `src/widgets/chart-canvas/index.ts`:
```ts
export { default as ChartCanvas } from './ChartCanvas.svelte';
```
```bash
git rm src/widgets/.gitkeep
```

- [ ] **Step 3: Type-check, cruise, and commit**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
npm run cruise
git add src/widgets/chart-canvas
git commit -m "feat(chart-canvas): MapLibre host widget wiring the layer manager"
```

---

## Task 9: Render the map in the shell

**Files:**
- Modify: `src/app/App.svelte`
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1: Render ChartCanvas in the chart area**

Edit `src/app/App.svelte` so the chart-host section renders the map. Replace the chart-host section and import the widget:
```svelte
  import { ChartCanvas } from '$widgets/chart-canvas';
```
and replace the `<section class="chart-host">...</section>` body with:
```svelte
  <section class="chart-host" aria-label="Chart">
    <ChartCanvas {store} />
  </section>
```
Keep the existing store, vessel, client, connection wiring, and the status strip. Remove the `place-items: center` from `.chart-host` so the map fills it; set `.chart-host { position: relative; }`.

- [ ] **Step 2: Keep the e2e smoke robust**

The map needs WebGL, which headless Chromium in the Playwright preview may not fully provide, so the smoke test must not depend on tiles rendering. Keep asserting the stable chrome (brand, a connection status, and SOG), which already passes. Confirm `e2e/smoke.spec.ts` still asserts only those. If the map container throws in headless mode, guard the map creation so a WebGL failure does not break the shell:

In `ChartCanvas.svelte`, wrap the `new maplibregl.Map(...)` in a try/catch that logs and leaves the container empty on failure, so the shell still renders. (A real WebGL context on the helm display works; the guard only protects the headless smoke and old hardware.)

- [ ] **Step 3: Type-check, build, and run e2e (one at a time)**

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build
NODE_OPTIONS="--max-old-space-size=2048" npm run test:e2e
```
Expected: all green. Note the bundle size for the doc gate (MapLibre is large).

- [ ] **Step 4: Commit**

```bash
git add src/app/App.svelte e2e/smoke.spec.ts
git commit -m "feat(app): render the chart canvas in the shell"
```

---

## Task 10: Full local gate (one heavy command at a time)

- [ ] **Step 1: Biome** : `biome ci .` (no errors).
- [ ] **Step 2: dependency-cruiser** : `npm run cruise` (no violations; shared/map imports only shared, features/vessel-layer imports entities and shared, widgets/chart-canvas imports features, entities, and shared).
- [ ] **Step 3: Type-check** : `NODE_OPTIONS="--max-old-space-size=2048" npm run check` (0 errors, 0 warnings).
- [ ] **Step 4: Unit tests** : `NODE_OPTIONS="--max-old-space-size=2048" npm test` (sentinels, layer-manager, and vessel-overlay suites pass alongside the existing data-layer suites).
- [ ] **Step 5: Build** : `NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build` (clean; record the bundle size).
- [ ] **Step 6: e2e** : `NODE_OPTIONS="--max-old-space-size=2048" npm run test:e2e` (1 passed).

---

## Task 11: Cleanup gate and phase close

- [ ] **Step 1: Run the `/cleanup` skill** against the Phase 3 diff (brief agents on the style rules). For a small surface, an inline lead audit is acceptable per the cleanup skill's own sub-500-LOC rule.
- [ ] **Step 2: Fix every finding**, including low and nit.
- [ ] **Step 3: Doc gate.** Add the Phase 3 CHANGELOG entry. Update the README status (the map now renders with a vector base and a live own-vessel marker). Rebuild before quoting any bundle size, since MapLibre changes it materially. Confirm CLAUDE.md still matches.
- [ ] **Step 4: Re-run the full local gate** (Task 10) and confirm green.
- [ ] **Step 5: Commit, then push.**
- [ ] **Step 6: Confirm exit criteria.** The map fills the chart area and renders the base, the LayerManager and sentinels and vessel overlay are unit-tested, dependency-cruiser confirms the new slices' boundaries, and the own vessel renders and tracks live position and heading against a running Signal K server.

When all are true, Phase 3 is complete and Phase 4 (charts: the ChartSourceAdapter and the layer-control UI) can begin.

---

## Self-review notes

- **Spec coverage:** implements design spec section 6.6 (the map and layer architecture): the thin imperative wrapper, the LayerManager with sentinel z-bands and `beforeId` ordering, per-layer toggle and opacity, theme-survivable `reattachAll`, the PMTiles protocol, and own-vessel as a symbol layer with data-driven `icon-rotate` (heading, falling back to COG). The generic ChartSourceAdapter and the toggle/opacity/reorder UI are Phase 4; AIS is Phase 5; theming is Phase 6.
- **Deviation from the spec, recorded:** the spec named svelte-maplibre-gl as the wrapper. This plan uses raw maplibre-gl 5.24.0 with a thin imperative wrapper instead. The reason is architectural, not library maturity: svelte-maplibre-gl 2.0.1 is mature, but the layer model here is imperative and runtime-discovered, which a thin wrapper plus an explicit LayerManager serves better than reactive component trees. Smaller, more controllable surface, same LayerManager design. Update CLAUDE.md's map line in the doc gate to reflect this.
- **Placeholder scan:** none. Every step has concrete file contents and commands.
- **Type and name consistency:** `OverlayModule`, `OverlayContext`, `ZBand`, `Z_ORDER`, `sentinelId`, `beforeIdFor`, `LayerManager`, `createVesselOverlay`, and `VESSEL_ICON_ID` are used identically across tasks. The vessel overlay's source and layer ids are defined once and reused in `add`, `sync`, `setVisible`, `setOpacity`, and `remove`.
- **Build discipline:** the lead verifies every lane file exists before gates and never commits on red, per the Phases 1 and 2 lesson.
- **Pi memory:** every heavy command runs alone.
