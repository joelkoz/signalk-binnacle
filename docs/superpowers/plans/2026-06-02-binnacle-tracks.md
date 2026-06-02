# Tracks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the own-vessel breadcrumb, draw it behind the boat colored by speed, persist it across a refresh, and let the navigator save and manage voyages as Signal K tracks.

**Architecture:** A main-thread `TrackRecorder` (entities/track) appends points from `OwnVessel.position` on a time-plus-distance policy with gap breaks, holding the active track in a runes store mirrored to IndexedDB (shared/storage). A `track`-band overlay (features/track-layer) renders per-segment LineStrings colored by SOG (or solid), display-simplified with Douglas-Peucker and theme-aware. A saved-track client and a Tracks submenu (features/tracks) handle save to `/resources/tracks`, the saved-track list, and GeoJSON export. App wires it together.

**Tech Stack:** Svelte 5 runes, TypeScript, MapLibre GL JS 5, Vitest, Biome, dependency-cruiser, IndexedDB, the Signal K resources API.

**Conventions (hard):** No em dashes (colon, comma, or two sentences). Oxford commas. American English. Default to no comments, keep only non-obvious why. SI in the store (position is decimal degrees, SOG is m/s), convert at the display edge via `shared/lib`. Each slice exposes `index.ts` (named re-exports only). Imports flow down app to widgets to features to entities to shared. After each task: `/usr/local/bin/biome ci .`, `npm run cruise`, `npm run check`, `npm test`, `npm run build`, one heavy command at a time (Pi memory), all green, then commit.

---

## File structure

Create:
- `src/shared/storage/track-store.ts` — IndexedDB-backed append store for track points, node-guarded with an in-memory fallback.
- `src/shared/storage/track-store.test.ts`
- `src/shared/storage/index.ts`
- `src/shared/nav/distance.ts` — `haversineMeters`.
- `src/shared/nav/distance.test.ts`
- `src/entities/track/track-types.ts` — `TrackPoint`.
- `src/entities/track/recorder.svelte.ts` — `TrackRecorder` (runes store + record policy + stats).
- `src/entities/track/recorder.svelte.test.ts`
- `src/entities/track/index.ts`
- `src/features/track-layer/simplify.ts` — Douglas-Peucker.
- `src/features/track-layer/simplify.test.ts`
- `src/features/track-layer/track-geojson.ts` — per-segment FeatureCollection build.
- `src/features/track-layer/track-geojson.test.ts`
- `src/features/track-layer/track-overlay.ts` — the `track`-band OverlayModule.
- `src/features/track-layer/track-overlay.test.ts`
- `src/features/track-layer/index.ts`
- `src/features/tracks/tracks-client.ts` — `/resources/tracks` fetch, save, delete.
- `src/features/tracks/tracks-client.test.ts`
- `src/features/tracks/track-export.ts` — GeoJSON build + browser download.
- `src/features/tracks/track-export.test.ts`
- `src/features/tracks/TracksPanel.svelte` — the Tracks submenu content.
- `src/features/tracks/SpeedLegend.svelte` — the speed-color legend.
- `src/features/tracks/index.ts`

Modify:
- `src/shared/settings/persisted.svelte.ts` — add `TrackSettings`, `DEFAULT_TRACK_SETTINGS`, `createTrackSettings`; export in `index.ts`.
- `src/shared/nav/index.ts` — export `haversineMeters`.
- `src/shared/map/types.ts` — add `'track'` to `ZBand` and `Z_ORDER` (after `'bathymetry'`).
- `src/shared/map/map-theme.ts` — add `trackSlow`, `trackMid`, `trackFast`, `trackSolid` to `MapThemePaint` and all three themes.
- `src/app/App.svelte` — recorder, overlay registration, Tracks submenu, saved-track state, legend, settings.
- `CHANGELOG.md`, `README.md` — in the final task.

---

## Task 1: storage, settings, z-band, paint keys

**Files:** Create `src/shared/storage/track-store.ts`, `track-store.test.ts`, `index.ts`, `src/shared/nav/distance.ts`, `distance.test.ts`. Modify `src/shared/nav/index.ts`, `src/shared/settings/persisted.svelte.ts`, `src/shared/settings/index.ts`, `src/shared/map/types.ts`, `src/shared/map/map-theme.ts`.

- [ ] **Step 1: `haversineMeters` test (failing).** In `distance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { haversineMeters } from './distance';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(36.8, -121.7, 36.8, -121.7)).toBe(0);
  });
  it('measures a known short hop within 1 percent', () => {
    // 0.001 deg latitude is about 111.32 m
    expect(haversineMeters(0, 0, 0.001, 0)).toBeCloseTo(111.32, 0);
  });
});
```

- [ ] **Step 2: run it, expect fail** (`npx vitest run src/shared/nav/distance.test.ts`).
- [ ] **Step 3: implement `distance.ts`:**

```ts
const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
```

Add to `src/shared/nav/index.ts`: `export { haversineMeters } from './distance';`.

- [ ] **Step 4: run it, expect pass.**

- [ ] **Step 5: `track-store` test (failing).** The store is an append log of points, IndexedDB-backed in the browser, in-memory in node. In `track-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTrackStore } from './track-store';
import type { TrackPoint } from '$entities/track';

const p = (t: number): TrackPoint => ({ lat: 36.8, lon: -121.7, t, sog: 1 });

describe('createTrackStore (in-memory fallback when no indexedDB)', () => {
  it('appends, reads all, and clears', async () => {
    const store = createTrackStore();
    await store.append(p(1));
    await store.append(p(2));
    expect((await store.all()).map((x) => x.t)).toEqual([1, 2]);
    await store.clear();
    expect(await store.all()).toEqual([]);
  });
  it('replace swaps the whole log', async () => {
    const store = createTrackStore();
    await store.append(p(1));
    await store.replace([p(5), p(6)]);
    expect((await store.all()).map((x) => x.t)).toEqual([5, 6]);
  });
});
```

- [ ] **Step 6: run it, expect fail.**

- [ ] **Step 7: implement `track-store.ts`.** Node-guard on `indexedDB`; otherwise an in-memory array. `TrackPoint` is imported as a type from entities (type-only import is allowed across the boundary for a shared type; if dependency-cruiser objects, inline the minimal `{lat,lon,t,sog,gap?}` shape locally instead). Use a single object store `points` with an autoincrement key.

```ts
import type { TrackPoint } from '$entities/track';

export interface TrackStore {
  all(): Promise<TrackPoint[]>;
  append(point: TrackPoint): Promise<void>;
  replace(points: TrackPoint[]): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'binnacle';
const STORE = 'track-points';

function memoryStore(): TrackStore {
  let points: TrackPoint[] = [];
  return {
    all: async () => points.slice(),
    append: async (point) => {
      points.push(point);
    },
    replace: async (next) => {
      points = next.slice();
    },
    clear: async () => {
      points = [];
    },
  };
}

export function createTrackStore(factory: IDBFactory | undefined = globalThis.indexedDB): TrackStore {
  if (!factory) return memoryStore();
  // Open lazily; every call shares one open promise.
  let dbPromise: Promise<IDBDatabase> | undefined;
  const db = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = factory.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(STORE, { autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  };
  const tx = async <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
    const conn = await db();
    return new Promise<T>((resolve, reject) => {
      const t = conn.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  };
  return {
    all: () => tx<TrackPoint[]>('readonly', (s) => s.getAll()),
    append: async (point) => {
      await tx('readwrite', (s) => s.add(point));
    },
    replace: async (next) => {
      const conn = await db();
      await new Promise<void>((resolve, reject) => {
        const t = conn.transaction(STORE, 'readwrite');
        const s = t.objectStore(STORE);
        s.clear();
        for (const point of next) s.add(point);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    },
    clear: async () => {
      await tx('readwrite', (s) => s.clear());
    },
  };
}
```

`src/shared/storage/index.ts`: `export type { TrackStore } from './track-store'; export { createTrackStore } from './track-store';`.

- [ ] **Step 8: run it, expect pass** (node path uses the in-memory fallback because `globalThis.indexedDB` is undefined).

- [ ] **Step 9: track settings.** In `persisted.svelte.ts`, after the `MapView` block:

```ts
export interface TrackSettings {
  intervalSeconds: number;
  minMeters: number;
  colorMode: 'speed' | 'solid';
}

export const DEFAULT_TRACK_SETTINGS: TrackSettings = {
  intervalSeconds: 10,
  minMeters: 10,
  colorMode: 'speed',
};

export function createTrackSettings(storage?: StorageLike): PersistedValue<TrackSettings> {
  return new PersistedValue('binnacle:track-settings', DEFAULT_TRACK_SETTINGS, storage);
}
```

Export `TrackSettings`, `DEFAULT_TRACK_SETTINGS`, `createTrackSettings` from `src/shared/settings/index.ts`.

- [ ] **Step 10: z-band.** In `src/shared/map/types.ts`, add `'track'` to `ZBand` and to `Z_ORDER`, positioned right after `'bathymetry'` (so the trail draws over charts and bathymetry, under weather, routes, safety, traffic, and the vessel).

- [ ] **Step 11: paint keys.** In `map-theme.ts`, add to `MapThemePaint`: `trackSlow: string; trackMid: string; trackFast: string; trackSolid: string;`. Values per theme:
  - day: `trackSlow '#1a3a5a'`, `trackMid '#2c6da3'`, `trackFast '#6fb1e0'`, `trackSolid '#1f6fb2'`.
  - dusk: `trackSlow '#22455f'`, `trackMid '#3f87bf'`, `trackFast '#84c0ea'`, `trackSolid '#4f9fd8'`.
  - night-red: `trackSlow '#3a0c08'`, `trackMid '#9a3020'`, `trackFast '#ff6a5a'`, `trackSolid '#9a3020'`.

- [ ] **Step 12: gate.** Run, one at a time: `/usr/local/bin/biome ci .`, `npm run cruise`, `npm run check`, `npm test`, `npm run build`. All green.

- [ ] **Step 13: commit.**

```bash
git add src/shared/storage src/shared/nav src/shared/settings src/shared/map/types.ts src/shared/map/map-theme.ts
git commit -m "feat(tracks): storage, settings, track z-band, and speed-ramp paint" --author="Nearl Crews <23341701+NearlCrews@users.noreply.github.com>"
```

---

## Task 2: entities/track (recorder, store, stats, persistence)

**Files:** Create `track-types.ts`, `recorder.svelte.ts`, `recorder.svelte.test.ts`, `index.ts`.

`TrackPoint` (track-types.ts):

```ts
export interface TrackPoint {
  lat: number;
  lon: number;
  t: number; // epoch ms
  sog: number; // m/s (SI)
  gap?: boolean; // true when a break precedes this point (no segment drawn from the previous)
}
```

The recorder exposes a pure policy so it is testable without runes:

```ts
export interface RecordDecision {
  append: boolean;
  gap: boolean;
}
const GAP_MS = 5 * 60 * 1000;

export function decideRecord(
  last: TrackPoint | undefined,
  lat: number,
  lon: number,
  now: number,
  settings: TrackSettings,
): RecordDecision {
  if (!last) return { append: true, gap: false };
  const dt = now - last.t;
  if (dt > GAP_MS) return { append: true, gap: true };
  const moved = haversineMeters(last.lat, last.lon, lat, lon);
  if (dt >= settings.intervalSeconds * 1000 && moved >= settings.minMeters) {
    return { append: true, gap: false };
  }
  return { append: false, gap: false };
}
```

Stats:

```ts
export interface TrackStats {
  distanceMeters: number;
  durationSeconds: number;
  avgSog: number;
  maxSog: number;
}
export function computeStats(points: readonly TrackPoint[]): TrackStats { /* sum haversine over non-gap consecutive pairs; duration = last.t - first.t; avg = distance/duration; max = max sog */ }
```

`TrackRecorder` (recorder.svelte.ts): `points = $state<TrackPoint[]>([])`, `paused = $state(false)`, `stats = $derived(computeStats(this.points))`. Constructor takes `(settings: PersistedValue<TrackSettings>, store: TrackStore)` and kicks off `restore()` (await store.all into points). `consider(lat, lon, sog)`: if paused, mark that the next point should gap and return; else `decideRecord(last, lat, lon, Date.now(), settings.value)`; on append, push `{lat, lon, t, sog, gap: gap || resumeGap}` to points and `store.append(point)`. `pause()`, `resume()` (set a `#resumeGap` flag so the next point starts a segment). `clear()`: `points = []; store.clear()`. `replaceForSave()`/`reset()`: clears after a save.

- [ ] **Step 1: policy test (failing).** Cases: no last -> append no gap; within interval/under min -> no append; past interval and past min -> append; dt over GAP_MS -> append with gap; paused path. Run, expect fail.
- [ ] **Step 2: implement `decideRecord`, `computeStats`. Run, expect pass.**
- [ ] **Step 3: recorder store test.** With a fresh in-memory `createTrackStore()` and a stubbed `PersistedValue` (or `createTrackSettings(fakeStorage)`), call `consider` repeatedly with controlled positions and assert `points` and `stats`. Stub `Date.now` is unavailable in the worker note but this is main-thread; in the test inject time by exposing an internal `consider(lat,lon,sog,now?)` with `now = Date.now()` default. Run, expect fail.
- [ ] **Step 4: implement `TrackRecorder`. Run, expect pass.** Reactivity note: `points` is `$state`; pushing a point mutates the reactive array (deep reactivity), and `stats` is `$derived`, so consumers update.
- [ ] **Step 5: index.ts** exports `TrackRecorder`, `decideRecord`, `computeStats`, type `TrackPoint`, `TrackStats`.
- [ ] **Step 6: gate (all five, one at a time). Commit.**

```bash
git add src/entities/track
git commit -m "feat(tracks): TrackRecorder with record policy, stats, and persistence" --author="Nearl Crews <23341701+NearlCrews@users.noreply.github.com>"
```

---

## Task 3: features/track-layer (per-segment overlay, color, simplify, theming)

**Files:** Create `simplify.ts`, `simplify.test.ts`, `track-geojson.ts`, `track-geojson.test.ts`, `track-overlay.ts`, `track-overlay.test.ts`, `index.ts`.

`simplify.ts`: `douglasPeucker(points: TrackPoint[], toleranceDeg: number): TrackPoint[]`, standard recursive DP on lat/lon, preserving the first and last point and any point flagged `gap` (a gap point is always a kept anchor so segments do not merge across breaks). Test: a near-collinear run collapses to its endpoints; a `gap` point is never dropped.

`track-geojson.ts`:

```ts
export function trackSegments(points: readonly TrackPoint[]): GeoJSON.FeatureCollection {
  // For i in 1..n-1, emit a 2-point LineString [points[i-1], points[i]] with
  // properties { sog: points[i].sog } ONLY when points[i].gap is not true.
}
```

Test: 3 continuous points -> 2 segments; a middle point with `gap:true` -> 1 segment (the break is skipped); sog property carried.

`track-overlay.ts`: `createTrackOverlay(recorder: TrackRecorder, settings: PersistedValue<TrackSettings>): OverlayModule` in band `'track'`. Follow the existing overlay shape (see `collision-overlay.ts` and `notes-overlay.ts`). Two sources: `binnacle-track-active` and `binnacle-track-saved`. Line layers `binnacle-track-active-line`, `binnacle-track-saved-line`. The active line color expression:

```ts
function lineColor(paint: MapThemePaint, mode: 'speed' | 'solid'): unknown {
  if (mode === 'solid') return paint.trackSolid;
  // sog in m/s: ~0 slow, 2.5 (about 5 kn) mid, 5+ (about 10 kn) fast
  return ['interpolate', ['linear'], ['get', 'sog'], 0, paint.trackSlow, 2.5, paint.trackMid, 5, paint.trackFast];
}
```

`sync(ctx)`: dirty-check on `recorder.points.length`, the last point's `t`, and `settings.value.colorMode`; when changed, simplify the active points (a display tolerance, e.g. about 1e-4 deg) and `setData` the active source from `trackSegments`. `setSavedTracks(ctx, collections)`: set the saved source data (segments tagged per track, solid). `applyTheme`: reset `line-color` for both layers (active uses the current color mode, saved solid distinct colors via a per-feature color property set at build time, or a single solid token). `setVisible`/`setOpacity`/`remove` guard every call.

- [ ] **Step 1-2: simplify test + impl.**
- [ ] **Step 3-4: track-geojson test + impl.**
- [ ] **Step 5-6: overlay test (add creates a source and a layer in the `track` band; remove tears down; applyTheme calls setPaintProperty) + impl**, using `createFakeMap`.
- [ ] **Step 7: index.ts** exports `createTrackOverlay`.
- [ ] **Step 8: gate. Commit.**

```bash
git add src/features/track-layer
git commit -m "feat(tracks): track overlay with speed coloring, simplification, theming" --author="Nearl Crews <23341701+NearlCrews@users.noreply.github.com>"
```

---

## Task 4: features/tracks (saved client, export, Tracks submenu, legend)

**Files:** Create `tracks-client.ts`, `tracks-client.test.ts`, `track-export.ts`, `track-export.test.ts`, `TracksPanel.svelte`, `SpeedLegend.svelte`, `index.ts`.

`tracks-client.ts`:

```ts
export interface SavedTrack {
  id: string;
  name: string;
  points: TrackPoint[][]; // one array per segment
}
export async function fetchSavedTracks(base: string, token?: string): Promise<SavedTrack[]>; // GET v2 then v1; guard keyed-object shape; parse GeoJSON MultiLineString
export async function saveTrack(base: string, token: string | undefined, id: string, name: string, points: readonly TrackPoint[]): Promise<boolean>; // PUT /signalk/v2/api/resources/tracks/{id} with GeoJSON Feature(MultiLineString); returns ok
export async function deleteTrack(base: string, token: string | undefined, id: string): Promise<boolean>; // DELETE
```

Build the save body from `trackSegments`-style grouping: split `points` into segments at `gap` boundaries, each segment a coordinate array `[lon, lat]`, geometry `MultiLineString`, properties `{ name, source: 'binnacle', distance, timespan }`. Test the save body shape, the fetch parse (keyed object with a MultiLineString), and error paths (non-ok returns false, throw returns false/[]).

`track-export.ts`: `toGeoJsonString(name, points): string` (a Feature with MultiLineString); `downloadGeoJson(name, points): void` (node-guarded: build a Blob, an object URL, an anchor click). Test `toGeoJsonString` only.

`TracksPanel.svelte`: props `{ recorder, settings, saved, onSave, onDelete, onToggleSaved, onExport }`. Renders Pause/Resume (from `recorder.paused`), Save (prompts a name; calls `onSave(name)`), Clear (calls `recorder.clear()`), a color-mode toggle (writes `settings`), the voyage stats from `recorder.stats` (convert SOG to knots and meters to nm at the edge via `shared/lib` `formatCpaNm`/`metersPerSecondToKnots`), and the saved-track list with show/hide/delete and an Export button. Match the existing panel styling (see `ThresholdsPanel.svelte`).

`SpeedLegend.svelte`: a small gradient bar with slow/fast labels (knots), themed from the track paint tokens; rendered by App only when `settings.colorMode === 'speed'`.

- [ ] **Step 1-2: tracks-client test + impl.**
- [ ] **Step 3-4: track-export test + impl.**
- [ ] **Step 5: TracksPanel.svelte + SpeedLegend.svelte** (no component unit test, matching the repo; verified live in Task 5).
- [ ] **Step 6: index.ts** exports `fetchSavedTracks`, `saveTrack`, `deleteTrack`, `SavedTrack`, `toGeoJsonString`, `downloadGeoJson`, `TracksPanel`, `SpeedLegend`.
- [ ] **Step 7: gate. Commit.**

```bash
git add src/features/tracks
git commit -m "feat(tracks): saved-track client, export, Tracks submenu, speed legend" --author="Nearl Crews <23341701+NearlCrews@users.noreply.github.com>"
```

---

## Task 5: App wiring, Layers toggle, docs, live verification

**Files:** Modify `src/app/App.svelte`, `src/widgets/chart-canvas/ChartCanvas.svelte` (register the overlay), `CHANGELOG.md`, `README.md`.

- [ ] **Step 1: construct.** In App: `const trackSettings = createTrackSettings(); const trackStore = createTrackStore(); const recorder = new TrackRecorder(trackSettings, trackStore);` plus `let savedTracks = $state<SavedTrack[]>([])` and a `shownSaved = $state<Set<string>>(new Set())`.
- [ ] **Step 2: record.** `$effect(() => { const p = vessel.position; if (p) recorder.consider(p.latitude, p.longitude, vessel.sogMps ?? 0); });` (add a `sogMps` getter to OwnVessel if absent, returning the raw SI `navigation.speedOverGround`; do NOT reuse `sogKnots`, the store value is m/s). The effect reads `vessel.position` reactively (about 1 Hz).
- [ ] **Step 3: register the overlay.** In ChartCanvas, create and register `createTrackOverlay(recorder, trackSettings)` in the load handler before the vessel overlay so the trail sits under the boat; expose a `setSavedTracks` path (pass saved tracks via a prop or a command, mirroring `onCommandsReady`). Wire `overlay.sync(ctx)` into the rAF tick alongside the others.
- [ ] **Step 4: Tracks submenu.** In App, add a `<MenuSubmenu label="Tracks" icon={Spline}>` (lucide `Spline` or `Route`) containing `<TracksPanel ... />`, wired to `saveTrack`/`deleteTrack`/`fetchSavedTracks` and `recorder`. Render `<SpeedLegend>` near the chart when `trackSettings.value.colorMode === 'speed'`. Fetch saved tracks on mount (after auth).
- [ ] **Step 5: gate** (all five, one at a time, NODE_OPTIONS backstop).
- [ ] **Step 6: live verification.** Rebuild, deploy, on `https://boatpi:3443/binnacle/`: confirm a trail draws and grows behind the boat colored by speed, a forced gap breaks the line, the Tracks submenu shows stats, Save creates a `/resources/tracks` entry that reappears in the list and on reload, and the active track persists across a refresh. Use the temp `__map` hook pattern and remove it before the final build. Mint a short-lived read/write token from the server secret for verification and clear it after.
- [ ] **Step 7: docs.** CHANGELOG Unreleased "Added" entry for tracks; README feature bullet. Then commit.

```bash
git add src/app/App.svelte src/widgets/chart-canvas CHANGELOG.md README.md
git commit -m "feat(tracks): wire the recorder, overlay, and Tracks menu into the app" --author="Nearl Crews <23341701+NearlCrews@users.noreply.github.com>"
```

---

## Self-review notes

- Spec coverage: storage (T1), settings (T1), z-band and paint (T1), recorder and persistence (T2), per-segment speed/solid render and simplify and theming (T3), saved client and save and list and delete and export (T4), Tracks submenu and legend and stats (T4 plus T5 wiring), App wiring and Layers toggle and live verify (T5). Gap-break handling: `gap` flag set in T2, honored in T3 `trackSegments` and `douglasPeucker`, and in T4 save grouping.
- The active overlay reads `recorder.points` and `settings.colorMode`; the Layers toggle and opacity come free because the overlay registers with the `LayerManager` (its `layers()` lists it).
- SI discipline: `TrackPoint.sog` is m/s, the color interpolation is over m/s, and only the stats readout and the legend convert to knots, at the display edge.
- OwnVessel currently exposes `sogKnots` (converted). Task 5 adds a raw `sogMps` getter so the recorder stores SI; do not feed knots into the SI field.
