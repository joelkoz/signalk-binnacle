# Weather Cloud Cover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cloud-cover color field to the weather overlay from the Open-Meteo cloud cover already in the forecast response, with cloud cover in the tap readout.

**Architecture:** Spec step 7. Cloud cover is already requested in the forecast URL; this plan parses it into the grid (new optional `cloudCover` field, a 0..1 fraction) and renders it through the shared `createFieldOverlay` and `fieldRgba` primitives extracted during the precipitation step. No new fetch and no gating: cloud rides the forecast grid. With the shared field primitives in place, this layer is a colormap plus two one-line bindings.

**Tech Stack:** Svelte 5 runes, MapLibre GL JS 5 (canvas source + raster layer via the shared field overlay), TypeScript, Vitest. Cloud cover stored as a 0..1 fraction (Open-Meteo returns percent), shown as a percentage at the display edge.

**Pi build policy:** Lead runs every verification, one heavy command at a time, `NODE_OPTIONS="--max-old-space-size=2048"`. Per task: targeted `npx vitest run <file>` plus the fast pre-commit hook. Full heavy chain at the push checkpoint. American English, no em dashes, Oxford commas, no "&" in text, minimal comments, named re-exports only.

---

### Task 1: Parse cloud cover into the forecast grid

**Files:**
- Modify: `src/entities/weather/weather-grid.ts`
- Modify: `src/features/weather/weather-client.ts`
- Modify: `src/features/weather/weather-client.test.ts`

- [ ] **Step 1: Extend the failing test.** The `loc` fixture already includes `cloud_cover: [10, 50]`. In the first `fetchForecast` test, add (Open-Meteo returns percent; the grid stores a 0..1 fraction):

```ts
    expect(grid?.cloudCover?.[0]?.[0]).toBeCloseTo(0.1, 4);
    expect(grid?.cloudCover?.[1]?.[0]).toBeCloseTo(0.5, 4);
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/weather-client.test.ts`. Expected: FAIL.

- [ ] **Step 3: Add the field.** In `weather-grid.ts`, after `precipitation`:

```ts
  cloudCover?: number[][]; // 0..1 fraction
```

- [ ] **Step 4: Parse it.** In `weather-client.ts`, add `cloud_cover?: number[];` to `OmLoc.hourly`. In `parse`, add `const cloudCover = grid2d(steps, cells);`, read it in the cell loop:

```ts
      const cc = h?.cloud_cover?.[t];
      if (cc !== undefined) cloudCover[t][c] = cc / 100;
```

and return it: `return { lats, lons, times, windU, windV, pressureMsl, precipitation, cloudCover };`

- [ ] **Step 5: Run tests green.** Run: `npx vitest run src/features/weather/weather-client.test.ts`. Expected: PASS.

- [ ] **Step 6: Format and commit.**

```bash
/usr/local/bin/biome check --write src/entities/weather/weather-grid.ts src/features/weather/weather-client.ts src/features/weather/weather-client.test.ts
git add src/entities/weather/weather-grid.ts src/features/weather/weather-client.ts src/features/weather/weather-client.test.ts
git commit -m "feat(weather): parse cloud cover into the forecast grid"
```

---

### Task 2: Cloud colormap

**Files:**
- Create: `src/features/weather/cloud-colormap.ts`
- Test: `src/features/weather/cloud-colormap.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { cloudColor } from './cloud-colormap';

describe('cloudColor', () => {
  it('is transparent under clear sky and opaque under overcast', () => {
    expect(cloudColor(0, 'day')[3]).toBeCloseTo(0, 2);
    expect(cloudColor(1, 'day')[3]).toBeGreaterThan(0.3);
  });
  it('uses no blue at night-red', () => {
    const [r, , b] = cloudColor(1, 'night-red');
    expect(r).toBeGreaterThan(b);
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/cloud-colormap.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** (cloud cover is a 0..1 fraction; reuse the shared `sampleRamp`).

```ts
import type { Theme } from '$shared/ui';
import { type Rgba, sampleRamp } from './color-ramp';

// Cloud-cover stops as a 0..1 fraction. Day and dusk dim the chart with translucent neutral gray
// rising with cover, like overcast. Night-red uses a dim warm gray (red over green over blue, no
// blue dominance) so it never glows blue on a night watch. Alpha is capped so the chart reads
// through.
const DAY: Array<[number, Rgba]> = [
  [0, [0.86, 0.88, 0.92, 0.0]],
  [0.25, [0.82, 0.84, 0.88, 0.2]],
  [1, [0.78, 0.8, 0.85, 0.5]],
];
const NIGHT: Array<[number, Rgba]> = [
  [0, [0.32, 0.22, 0.2, 0.0]],
  [1, [0.46, 0.3, 0.26, 0.45]],
];

export function cloudColor(fraction: number, theme: Theme): Rgba {
  return sampleRamp(theme === 'night-red' ? NIGHT : DAY, fraction);
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/cloud-colormap.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/cloud-colormap.ts src/features/weather/cloud-colormap.test.ts
git add src/features/weather/cloud-colormap.ts src/features/weather/cloud-colormap.test.ts
git commit -m "feat(weather): cloud-cover colormap"
```

---

### Task 3: Cloud field and overlay bindings

**Files:**
- Create: `src/features/weather/cloud-field.ts`
- Create: `src/features/weather/cloud-overlay.ts`
- Test: `src/features/weather/cloud-overlay.test.ts`

- [ ] **Step 1: Write the field binding** (`cloud-field.ts`).

```ts
import type { TimeBracket, WeatherGrid } from '$entities/weather';
import type { Theme } from '$shared/ui';
import { cloudColor } from './cloud-colormap';
import { type FieldBitmap, fieldRgba } from './field-rgba';

// The cloud-cover field bitmap: the shared field builder bound to the grid's cloud cover and the
// cloud colormap for the theme.
export function cloudFieldRgba(
  grid: WeatherGrid,
  bracket: TimeBracket,
  theme: Theme,
): FieldBitmap | undefined {
  return fieldRgba(grid, grid.cloudCover, bracket, (v) => cloudColor(v, theme));
}
```

- [ ] **Step 2: Write the overlay binding** (`cloud-overlay.ts`).

```ts
import type { WeatherStore } from '$entities/weather';
import { cloudFieldRgba } from './cloud-field';
import { type CanvasFactory, createFieldOverlay, type FieldOverlay } from './field-overlay';

// The cloud-cover overlay: the shared canvas field overlay bound to the cloud-cover field. Off by
// default, themed, redrawn only on grid, time, or theme change.
export function createCloudOverlay(store: WeatherStore, makeCanvas?: CanvasFactory): FieldOverlay {
  return createFieldOverlay(
    store,
    {
      id: 'weather-cloud',
      title: 'Cloud cover',
      sourceId: 'binnacle-weather-cloud-field',
      layerId: 'binnacle-weather-cloud-field-layer',
      fieldRgba: cloudFieldRgba,
    },
    makeCanvas,
  );
}
```

- [ ] **Step 3: Write the overlay test** (`cloud-overlay.test.ts`).

```ts
import { describe, expect, it } from 'vitest';
import { WeatherStore } from '$entities/weather';
import { mapThemePaint, type OverlayContext } from '$shared/map';
import { createFakeMap } from '$shared/testing/fake-map';
import { createCloudOverlay } from './cloud-overlay';

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
    cloudCover: [new Array(cells).fill(0.8)],
  });
  return store;
}

describe('cloud overlay', () => {
  it('adds a field source and layer in the weather band', () => {
    const overlay = createCloudOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(overlay.band).toBe('weather');
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(1);
  });

  it('syncs without throwing', () => {
    const overlay = createCloudOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(() => overlay.sync(ctxFor(map))).not.toThrow();
  });

  it('removes its layer and source', () => {
    const overlay = createCloudOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });

  it('recolors for the theme without throwing', () => {
    const overlay = createCloudOverlay(storeWithGrid(), fakeCanvas);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(() => overlay.applyTheme?.(ctxFor(map), mapThemePaint('night-red'))).not.toThrow();
  });
});
```

- [ ] **Step 4: Run the test green.** Run: `npx vitest run src/features/weather/cloud-overlay.test.ts`. Expected: PASS.

- [ ] **Step 5: Type-check** (canvas/raster via the shared overlay; quick safety): `NODE_OPTIONS="--max-old-space-size=2048" npm run check`. Expected: 0 errors.

- [ ] **Step 6: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/cloud-field.ts src/features/weather/cloud-overlay.ts src/features/weather/cloud-overlay.test.ts
git add src/features/weather/cloud-field.ts src/features/weather/cloud-overlay.ts src/features/weather/cloud-overlay.test.ts
git commit -m "feat(weather): cloud-cover overlay"
```

---

### Task 4: Add cloud cover to the tap readout

**Files:**
- Modify: `src/features/weather/weather-readout.ts`
- Modify: `src/features/weather/weather-readout.test.ts`

- [ ] **Step 1: Extend the failing test.** Add `cloudCover: [[0.8, 0.8, 0.8, 0.8], [0.8, 0.8, 0.8, 0.8]]` to the `grid` fixture, and in the first case assert `expect(r?.cloudCoverFraction).toBeCloseTo(0.8, 4);`.

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/weather/weather-readout.test.ts`. Expected: FAIL.

- [ ] **Step 3: Extend the readout.** Add `cloudCoverFraction?: number;` to `WeatherReadout`, and before the return:

```ts
  const cloudField = grid.cloudCover?.[timeIndex];
  const cloudCoverFraction = cloudField
    ? nanToUndef(bilinearAt(grid, cloudField, lon, lat))
    : undefined;
  return {
    speedMs,
    fromRad,
    pressurePa,
    waveHeightM,
    wavePeriodS,
    precipitationMm,
    cloudCoverFraction,
  };
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/weather/weather-readout.test.ts`. Expected: PASS.

- [ ] **Step 5: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/weather-readout.ts src/features/weather/weather-readout.test.ts
git add src/features/weather/weather-readout.ts src/features/weather/weather-readout.test.ts
git commit -m "feat(weather): add cloud cover to the tap readout"
```

---

### Task 5: Wire the cloud overlay and readout

**Files:**
- Modify: `src/features/weather/index.ts`
- Modify: `src/widgets/chart-canvas/ChartCanvas.svelte`
- Modify: `src/app/App.svelte`

- [ ] **Step 1: Export the public API.** In `src/features/weather/index.ts` add `export { createCloudOverlay } from './cloud-overlay';` (keep alphabetical).

- [ ] **Step 2: Register and sync.** In `ChartCanvas.svelte`, add `createCloudOverlay` to the weather import. Register it right after the precip overlay (so the three fields sit low in the band, cloud just above precip), and add `cloudOverlay.sync(ctx);` after `precipOverlay.sync(ctx);` in `tick`:

```ts
    const cloudOverlay = createCloudOverlay(weather);
    await manager.register(cloudOverlay);
    if (destroyed) return;
```

- [ ] **Step 3: Readout chip.** In `App.svelte`, after the rain span in the `weather-readout` chip, add (cloud rides the forecast grid, no new fetch):

```svelte
        {#if weatherReadout.cloudCoverFraction !== undefined}
          &middot; cloud <b>{fmt(weatherReadout.cloudCoverFraction * 100, 0)}</b>%
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
git commit -m "feat(weather): wire the cloud-cover overlay and readout"
```

---

### Task 6: Docs, simplify, push, live verification, and memory

- [ ] **Step 1: CHANGELOG and README.** Update the Weather entry in `CHANGELOG.md` and the Weather bullet in `README.md` to add cloud cover (a translucent cloud-cover field, with cloud in the tap readout). The remaining "follow" items are the legend and Weather panel group, the RainViewer radar nowcast, and animated wind particles.

- [ ] **Step 2: Run `/simplify`** on the diff; the cloud field and overlay are already thin bindings of the shared primitives, so expect little. Apply any findings, skip false positives with reasons.

- [ ] **Step 3: Final gate and push.** The pre-push hook runs the full chain. `git push origin main`.

- [ ] **Step 4: Live-verify** (Playwright, https://boatpi:3443/binnacle/, nssdb CA, no TLS bypass): seed localStorage to enable Cloud cover; confirm the translucent cloud field renders and updates on the time scrub, night-red shows a dim warm-gray field with no blue, and a tap reads cloud percent. Capture day and night screenshots to `tmp/`.

- [ ] **Step 5: Update the project-status memory** to record cloud cover shipped (commits, test count) and that the legend/Weather group, the RainViewer radar nowcast, and the WebGL wind particles remain.
