# Weather Legend and Layers-Panel Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the weather overlay (spec step 8): give the weather layers their own "Weather" group in the Layers panel, and show a themed legend for the active weather layers in the Forecast scrubber window. Offline caching is already in place (the Open-Meteo NetworkFirst runtime cache covers forecast and marine).

**Architecture:** The panel grouping is a one-function change (extract a pure `layerGroup(band)` and add a "Weather" case). The legend is a pure builder (`weatherLegend(layerId, theme)`) that reads the existing per-layer color functions at representative values, rendered in `WeatherTimeControl`'s expanded window. The app computes the active weather layers' legends reactively from the layer list and the current theme and passes them down.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest. Reuse the existing colormap functions (`windColor`, `waveColor`, `precipColor`, `cloudColor`, `isobarColors`), the shared `Rgba`, and `metersPerSecondToKnots`. Legend swatches render the colormap hue at full opacity for visibility.

**Pi build policy:** Lead runs every verification, one heavy command at a time, `NODE_OPTIONS="--max-old-space-size=2048"`. Per task: targeted `npx vitest run <file>` plus the fast pre-commit hook. Full heavy chain at the push checkpoint. American English, no em dashes, Oxford commas, no "&" in text, minimal comments, named re-exports only.

---

### Task 1: Layers-panel "Weather" group

**Files:**
- Create: `src/features/layers-panel/layer-group.ts`
- Test: `src/features/layers-panel/layer-group.test.ts`
- Modify: `src/features/layers-panel/LayersPanel.svelte`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { layerGroup } from './layer-group';

describe('layerGroup', () => {
  it('groups base and bathymetry as charts, weather on its own, the rest as overlays', () => {
    expect(layerGroup('basemap')).toBe('Charts and Depth');
    expect(layerGroup('bathymetry')).toBe('Charts and Depth');
    expect(layerGroup('weather')).toBe('Weather');
    expect(layerGroup('traffic')).toBe('Overlays');
    expect(layerGroup('vessel')).toBe('Overlays');
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx vitest run src/features/layers-panel/layer-group.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

```ts
import type { ZBand } from '$shared/map';

// The Layers-panel section a layer falls under, by z-band: charts and depth at the base, the weather
// field and overlay layers under their own group, and everything else under overlays.
export function layerGroup(band: ZBand): string {
  if (band === 'basemap' || band === 'bathymetry') return 'Charts and Depth';
  if (band === 'weather') return 'Weather';
  return 'Overlays';
}
```

- [ ] **Step 4: Run tests green.** Run: `npx vitest run src/features/layers-panel/layer-group.test.ts`. Expected: PASS.

- [ ] **Step 5: Use it in the panel.** In `LayersPanel.svelte`, import `layerGroup` and replace `categoryOf`:

```ts
import { layerGroup } from './layer-group';
```

Replace the `categoryOf` function body so it delegates:

```ts
function categoryOf(item: LayerListItem): string {
  return layerGroup(item.band);
}
```

- [ ] **Step 6: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/layers-panel/layer-group.ts src/features/layers-panel/layer-group.test.ts src/features/layers-panel/LayersPanel.svelte
git add src/features/layers-panel/layer-group.ts src/features/layers-panel/layer-group.test.ts src/features/layers-panel/LayersPanel.svelte
git commit -m "feat(layers): give the weather layers their own panel group"
```

---

### Task 2: An rgba-to-css helper and the legend builder

**Files:**
- Modify: `src/features/weather/color-ramp.ts` (add `rgbaCss`)
- Modify: `src/features/weather/wind-colormap.ts` (use `rgbaCss`)
- Create: `src/features/weather/legend.ts`
- Test: `src/features/weather/legend.test.ts`

- [ ] **Step 1: Add `rgbaCss` to color-ramp.ts** (after `sampleRamp`):

```ts
export function rgbaCss([r, g, b, a]: Rgba): string {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(2)})`;
}
```

- [ ] **Step 2: Dedup wind-colormap's private `rgbaString`.** In `wind-colormap.ts`, import `rgbaCss` from `./color-ramp` and delete the private `rgbaString`, replacing its single use in `windColorExpression` with `rgbaCss`.

- [ ] **Step 3: Write the failing legend test.**

```ts
import { describe, expect, it } from 'vitest';
import { weatherLegend } from './legend';

describe('weatherLegend', () => {
  it('builds a wind speed ramp in knots', () => {
    const legend = weatherLegend('weather-wind', 'day');
    expect(legend?.title).toMatch(/wind/i);
    expect(legend?.swatches.length).toBeGreaterThan(2);
    expect(legend?.swatches[0].color).toMatch(/rgba?\(/);
  });

  it('builds a single isobar swatch for pressure', () => {
    const legend = weatherLegend('weather-pressure', 'day');
    expect(legend?.swatches).toHaveLength(1);
  });

  it('builds ramps for waves, precipitation, and cloud', () => {
    for (const id of ['weather-waves', 'weather-precip', 'weather-cloud']) {
      expect(weatherLegend(id, 'day')?.swatches.length).toBeGreaterThan(2);
    }
  });

  it('returns undefined for an unknown layer', () => {
    expect(weatherLegend('weather-unknown', 'day')).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run it, expect failure.** Run: `npx vitest run src/features/weather/legend.test.ts`. Expected: FAIL.

- [ ] **Step 5: Implement the legend builder.**

```ts
import { metersPerSecondToKnots } from '$shared/lib';
import type { Theme } from '$shared/ui';
import { cloudColor } from './cloud-colormap';
import { type Rgba, rgbaCss } from './color-ramp';
import { precipColor } from './precip-colormap';
import { isobarColors } from './pressure-colors';
import { waveColor } from './wave-colormap';
import { windColor } from './wind-colormap';

export interface LegendSwatch {
  color: string;
  label: string;
}

export interface WeatherLegend {
  id: string;
  title: string;
  swatches: LegendSwatch[];
}

const WIND_STOPS = [0, 5, 10, 15, 20, 26]; // m/s
const WAVE_STOPS = [0.5, 1, 2, 4, 6, 9]; // m
const PRECIP_STOPS = [0.2, 1, 2.5, 10, 25]; // mm/h
const CLOUD_STOPS = [0.25, 0.5, 0.75, 1]; // fraction

// Render a colormap stop opaque so the legend swatch is visible even where the field itself is
// translucent or fully transparent at the low end.
function opaque([r, g, b]: Rgba): string {
  return rgbaCss([r, g, b, 1]);
}

function ramp(
  stops: number[],
  color: (value: number) => Rgba,
  label: (value: number) => string,
): LegendSwatch[] {
  return stops.map((value) => ({ color: opaque(color(value)), label: label(value) }));
}

// The legend for a weather layer: a color ramp for the field and arrow layers, or a single line
// swatch for the isobars, with value labels at the display unit. Returns undefined for an unknown
// layer id.
export function weatherLegend(layerId: string, theme: Theme): WeatherLegend | undefined {
  switch (layerId) {
    case 'weather-wind':
      return {
        id: layerId,
        title: 'Wind (kn)',
        swatches: ramp(
          WIND_STOPS,
          (s) => windColor(s, theme),
          (s) => String(Math.round(metersPerSecondToKnots(s) ?? 0)),
        ),
      };
    case 'weather-pressure':
      return {
        id: layerId,
        title: 'Pressure',
        swatches: [{ color: isobarColors(theme).line, label: 'isobars, 4 hPa' }],
      };
    case 'weather-waves':
      return {
        id: layerId,
        title: 'Waves (m)',
        swatches: ramp(
          WAVE_STOPS,
          (h) => waveColor(h, theme),
          (h) => String(h),
        ),
      };
    case 'weather-precip':
      return {
        id: layerId,
        title: 'Rain (mm/h)',
        swatches: ramp(
          PRECIP_STOPS,
          (p) => precipColor(p, theme),
          (p) => String(p),
        ),
      };
    case 'weather-cloud':
      return {
        id: layerId,
        title: 'Cloud (%)',
        swatches: ramp(
          CLOUD_STOPS,
          (c) => cloudColor(c, theme),
          (c) => String(Math.round(c * 100)),
        ),
      };
    default:
      return undefined;
  }
}
```

- [ ] **Step 6: Run tests green.** Run: `npx vitest run src/features/weather/legend.test.ts src/features/weather/wind-colormap.test.ts`. Expected: PASS.

- [ ] **Step 7: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/color-ramp.ts src/features/weather/wind-colormap.ts src/features/weather/legend.ts src/features/weather/legend.test.ts
git add src/features/weather/color-ramp.ts src/features/weather/wind-colormap.ts src/features/weather/legend.ts src/features/weather/legend.test.ts
git commit -m "feat(weather): weather legend builder and a shared rgba-to-css helper"
```

---

### Task 3: Render the legend in the scrubber window

**Files:**
- Modify: `src/features/weather/WeatherTimeControl.svelte`

- [ ] **Step 1: Add a `legends` prop.** In `WeatherTimeControl.svelte`, import the type and extend Props:

```ts
import type { WeatherLegend } from './legend';
```

```ts
interface Props {
  store: WeatherStore;
  // Whether any weather layer is on; the button only shows when weather is active.
  active: boolean;
  // Legends for the active weather layers, shown in the expanded window.
  legends: WeatherLegend[];
}

const { store, active, legends }: Props = $props();
```

- [ ] **Step 2: Render the legend.** Inside the `{#if active && expanded && range}` block, after the `.scrubber` div, add a legend panel (still inside the same `{#if}`), or restructure to a wrapper. Place a legends section beneath the scrubber:

```svelte
{#if active && expanded && legends.length > 0}
  <div class="legend" role="group" aria-label="Weather legend">
    {#each legends as legend (legend.id)}
      <div class="legend-row">
        <span class="legend-title">{legend.title}</span>
        <span class="legend-swatches">
          {#each legend.swatches as swatch (swatch.label)}
            <span class="legend-swatch">
              <span class="legend-chip" style="background:{swatch.color}"></span>
              {swatch.label}
            </span>
          {/each}
        </span>
      </div>
    {/each}
  </div>
{/if}
```

Add styles: `.legend` fixed above the scrubber (e.g. `inset-block-end: 5.4rem`), same surface and width as `.scrubber`; `.legend-row` a flex row with a title and wrapping swatches; `.legend-chip` a small inline-block color square; tabular, small text. Mirror the `.scrubber` container styling (surface-overlay, border, radius, shadow, max-inline-size 32rem, centered).

- [ ] **Step 3: Format and commit.**

```bash
/usr/local/bin/biome check --write src/features/weather/WeatherTimeControl.svelte
git add src/features/weather/WeatherTimeControl.svelte
git commit -m "feat(weather): show the active-layer legend in the scrubber window"
```

---

### Task 4: Wire the active-layer legends from the app

**Files:**
- Modify: `src/features/weather/index.ts`
- Modify: `src/app/App.svelte`

- [ ] **Step 1: Export the legend.** In `src/features/weather/index.ts` add `export { type WeatherLegend, weatherLegend } from './legend';` (keep alphabetical).

- [ ] **Step 2: Compute the active legends in the app.** In `App.svelte`, import `weatherLegend` and `type WeatherLegend`. After `wavesActive`, derive the active weather layer ids and their legends for the current theme:

```ts
const weatherLegends = $derived<WeatherLegend[]>(
  (layersView?.items ?? [])
    .filter((i) => i.band === 'weather' && i.visible)
    .map((i) => weatherLegend(i.id, theme.theme))
    .filter((l): l is WeatherLegend => l !== undefined),
);
```

- [ ] **Step 3: Pass it to the control.** Update the `WeatherTimeControl` usage:

```svelte
<WeatherTimeControl store={weather} active={weatherActive} legends={weatherLegends} />
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
git add src/features/weather/index.ts src/app/App.svelte
git commit -m "feat(weather): wire the active-layer legends into the forecast control"
```

---

### Task 5: Docs, simplify, push, live verification, and memory

- [ ] **Step 1: CHANGELOG and README.** Update the Weather entry in `CHANGELOG.md` and the Weather bullet in `README.md`: the weather layers now have their own Layers-panel group, and the Forecast window shows a themed legend for the active layers. The remaining "follow" items are the RainViewer real-time radar nowcast and animated wind particles.

- [ ] **Step 2: Run `/simplify`** on the diff; apply findings, skip false positives with reasons.

- [ ] **Step 3: Final gate and push.** The pre-push hook runs the full chain. `git push origin main`.

- [ ] **Step 4: Live-verify** (Playwright, https://boatpi:3443/binnacle/, nssdb CA, no TLS bypass): open the Layers panel and confirm a "Weather" group header over the weather layers; enable two weather layers, open the Forecast window, and confirm the legend shows a ramp per active layer; switch to night-red and confirm the legend recolors with no blue. Capture screenshots to `tmp/`.

- [ ] **Step 5: Update the project-status memory** to record the legend and Weather panel group shipped (step 8 done), leaving the RainViewer radar nowcast and the WebGL wind particles as the remaining weather follow-ons.
