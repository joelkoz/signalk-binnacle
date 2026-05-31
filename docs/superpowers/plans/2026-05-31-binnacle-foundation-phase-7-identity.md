# Binnacle Foundation, Phase 7: Identity Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give Binnacle its visual identity: self-hosted Inter and JetBrains Mono typography, Lucide chrome icons, an app version surface and polished copy, and theme-aware own-ship and AIS symbols so the chart honors "no blue at night." When done, the helm display reads as a finished instrument: clean sans UI, tabular monospace numbers, recognizable icons, and symbols that turn red on the night-red theme instead of glowing blue.

**Architecture:** Fonts ship as `@fontsource-variable` packages imported in the Vite entry, so they self-host (no CDN, offline-first) and expose two CSS tokens (`--font-ui`, `--font-mono`) applied across the shell. Chrome icons come from `@lucide/svelte` per-icon imports (tree-shaken). The own-ship and AIS sprites become theme-aware: `mapThemePaint(theme)` grows symbol colors, each overlay gains an `applyTheme(ctx, paint)` method that re-rasterizes its icon and swaps it in place with `map.updateImage`, and the existing `recolor` seam in `ChartCanvas` calls it alongside the base recolor. A version constant injected by Vite (`__APP_VERSION__`) surfaces the build in the top bar.

**Tech Stack:** Svelte 5 runes, TypeScript, Vite, `@fontsource-variable/inter` 5.2.8, `@fontsource-variable/jetbrains-mono` 5.2.8, `@lucide/svelte` 1.17.0, the existing `shared/map` rasterIcon and overlay seams, and `maplibre-gl`. Biome, svelte-check, Vitest, Playwright, dependency-cruiser.

**Project rules:** Honors `CLAUDE.md`. American English, no em dashes, Oxford commas, default to no comments. Latest deps. One heavy command at a time on the Pi (`NODE_OPTIONS="--max-old-space-size=2048"`). Lead-driven, never commit or push on red (hooks enforce). Ends with the `/cleanup` skill and a doc gate.

---

## Scope note: S-52 chart symbology is deferred, on purpose

The foundation roadmap listed "S-52 sprite atlas" under the identity pass. A full S-52 symbology atlas (buoys, beacons, lights, depth areas, and the rest of the Presentation Library) symbolizes S-57 and S-101 **vector** chart features. Binnacle renders raster and PMTiles charts, so there are no vector features to symbolize yet. Building the atlas now would be code with nothing to attach to. This phase therefore refines the only sprites that exist (the own-ship and AIS target symbols) and makes them theme-aware, and leaves the full S-52 chart-feature atlas to its own future spec, which will arrive with vector chart rendering. The `rasterIcon` helper in `shared/map` is the seam that atlas will build on. This deferral is recorded in the design spec's "deferred" list and in `CLAUDE.md`.

---

## Module boundary note

All work stays inside existing slices, plus one new dependency surface:
- `src/main.ts`: import the two font packages (the Vite entry is where global CSS side-effect imports belong).
- `src/app.css`: add `--font-ui` and `--font-mono` tokens and apply them.
- `src/shared/map/map-theme.ts`: grow `MapThemePaint` with symbol colors.
- `src/shared/map/types.ts`: add the optional `applyTheme` method to `OverlayModule`.
- `src/features/vessel-layer/vessel-icon.ts`, `vessel-overlay.ts`: parameterize the icon by color; add `applyTheme`.
- `src/features/ais-layer/ais-icon.ts`, `ais-overlay.ts`: same.
- `src/features/theme-toggle/ThemeToggle.svelte`: Lucide icon per theme.
- `src/features/layers-panel/LayersPanel.svelte`: Lucide heading icon.
- `src/widgets/chart-canvas/ChartCanvas.svelte`: call `applyTheme` from the recolor seam.
- `src/app/App.svelte`: version surface in the top bar.
- `vite.config.ts`: inject `__APP_VERSION__`.
- `src/shared/testing/fake-map.ts`: add `updateImage` to the fake.

dependency-cruiser stays green: `@lucide/svelte` and `@fontsource-variable/*` are third-party (allowed anywhere), and every internal import still flows down or stays same-layer.

---

## Symbol color contract (per theme)

Added to `mapThemePaint`. Day and dusk keep blue own-ship and amber AIS (blue is acceptable before full dark). Night-red removes all blue: the own ship turns red, and AIS becomes a dim amber that stays distinct from the red own ship and is night-vision safe (amber has no blue component).

| theme | ownVessel (fill) | ownVesselStroke | aisTarget (stroke) |
|---|---|---|---|
| day | `#1f6fb2` | `#ffffff` | `#e0a020` |
| dusk | `#2c6da3` | `#cfe0ec` | `#d9a441` |
| night-red | `#e0473a` | `#000000` | `#b06a10` |

---

## Task 1: Self-hosted fonts

**Files:** modify `package.json` (deps), `src/main.ts`, `src/app.css`.

- [ ] **Step 1:** Install the variable-font packages at their latest, pinned with a caret:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm install @fontsource-variable/inter@^5.2.8 @fontsource-variable/jetbrains-mono@^5.2.8
```
Expected: both land in `dependencies` (they ship runtime CSS and woff2 the app serves).

- [ ] **Step 2:** Read `src/main.ts`. Add the two side-effect imports at the very top, before the existing `app.css` import, so `@font-face` rules are registered first:
```ts
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
```
Keep the rest of `main.ts` unchanged.

- [ ] **Step 3:** In `src/app.css`, add two font tokens to the `:root` block (they do not change per theme, so they live only in `:root`), right after `color-scheme: dark;`:
```css
  --font-ui: 'Inter Variable', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, 'SFMono-Regular', monospace;
```
Then apply the UI font globally by adding to the `html, body` rule:
```css
html,
body {
  margin: 0;
  padding: 0;
  font-family: var(--font-ui);
}
```

- [ ] **Step 4:** `NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build`. Expected: build succeeds, and the bundle now includes woff2 assets under `public/assets/`. Note the new bundle figures for the doc gate.

- [ ] **Step 5:** Commit `feat(identity): self-host Inter and JetBrains Mono fonts`.

---

## Task 2: Apply the monospace font to numeric readouts

**Files:** modify `src/app/App.svelte`, `src/features/layers-panel/LayersPanel.svelte`.

- [ ] **Step 1:** In `App.svelte`, the numeric readouts (SOG and COG values) must use tabular monospace. The `.readout b` rule already sets `font-variant-numeric: tabular-nums` and `color: var(--text)`. Add the mono family:
```css
.readout b {
  color: var(--text);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 2:** Read `LayersPanel.svelte`. The opacity percentage (if rendered as text) should also be monospace. Find the element showing the percent value and add `font-family: var(--font-mono); font-variant-numeric: tabular-nums;` to its style rule. If no numeric percent text is rendered (opacity is a bare slider), skip this step and note it.

- [ ] **Step 3:** `NODE_OPTIONS="--max-old-space-size=2048" npm run check`. Green. Commit `feat(identity): tabular monospace for numeric readouts`.

---

## Task 3: Lucide chrome icons

**Files:** modify `package.json` (dep), `src/features/theme-toggle/ThemeToggle.svelte`, `src/features/layers-panel/LayersPanel.svelte`.

- [ ] **Step 1:** Install Lucide for Svelte 5:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm install @lucide/svelte@^1.17.0
```
It is a runtime dependency (its components render in the app).

- [ ] **Step 2:** Rewrite `ThemeToggle.svelte` to show a per-theme icon while keeping the accessible label. Use per-icon imports for tree-shaking:
```svelte
<script lang="ts">
import Moon from '@lucide/svelte/icons/moon';
import Sun from '@lucide/svelte/icons/sun';
import Sunset from '@lucide/svelte/icons/sunset';
import type { Component } from 'svelte';
import type { ThemeController } from '$shared/ui';

interface Props {
  controller: ThemeController;
}

const { controller }: Props = $props();

const ICONS: Record<string, Component> = {
  day: Sun,
  dusk: Sunset,
  'night-red': Moon,
};

const LABELS: Record<string, string> = {
  day: 'Day theme',
  dusk: 'Dusk theme',
  'night-red': 'Night theme',
};

const Icon = $derived(ICONS[controller.theme] ?? Sun);
const label = $derived(LABELS[controller.theme] ?? controller.theme);
</script>

<button
  type="button"
  class="theme-toggle"
  aria-label={`Switch theme (currently ${label})`}
  title={label}
  onclick={() => controller.cycle()}
>
  <Icon size={18} aria-hidden="true" />
</button>

<style>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 2rem;
  block-size: 2rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--accent);
  cursor: pointer;
}
.theme-toggle:hover {
  border-color: var(--accent);
}
</style>
```
NOTE: if `@lucide/svelte/icons/<name>` does not resolve (path form changed), fall back to a named barrel import: `import { Sun, Sunset, Moon } from '@lucide/svelte';`. The build in Step 4 confirms which resolves; use that one.

- [ ] **Step 3:** In `LayersPanel.svelte`, add a Layers icon next to the heading. Import it in the script:
```svelte
import Layers from '@lucide/svelte/icons/layers';
```
Wrap the heading so the icon sits inline before the text, for example:
```svelte
<p class="heading"><Layers size={14} aria-hidden="true" /> Layers</p>
```
and add to the `.heading` style rule:
```css
.heading {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  ...
}
```
Keep the existing heading color and spacing properties.

- [ ] **Step 4:** `NODE_OPTIONS="--max-old-space-size=2048" npm run check`, then `NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build`. Both green; confirm the icon import path resolved. Commit `feat(identity): Lucide chrome icons for the theme toggle and layers panel`.

---

## Task 4: Theme-aware symbol colors in the paint helper

**Files:** modify `src/shared/map/map-theme.ts`, `src/shared/map/map-theme.test.ts`.

- [ ] **Step 1: Extend the test.** Add to `map-theme.test.ts`:
```ts
  it('carries symbol colors for each theme', () => {
    for (const theme of ['day', 'dusk', 'night-red'] as const) {
      const paint = mapThemePaint(theme);
      expect(typeof paint.ownVessel).toBe('string');
      expect(typeof paint.ownVesselStroke).toBe('string');
      expect(typeof paint.aisTarget).toBe('string');
    }
  });

  it('night-red uses no blue for the own vessel', () => {
    expect(mapThemePaint('night-red').ownVessel).toBe('#e0473a');
  });
```

- [ ] **Step 2:** Run, expect FAIL (property missing).

- [ ] **Step 3: Implement.** Replace `map-theme.ts` with the extended shape:
```ts
import type { Theme } from '$shared/ui';

export interface MapThemePaint {
  background: string;
  water: string;
  ownVessel: string;
  ownVesselStroke: string;
  aisTarget: string;
}

const PAINT: Record<Theme, MapThemePaint> = {
  day: {
    background: '#aecbe0',
    water: '#a8c9e0',
    ownVessel: '#1f6fb2',
    ownVesselStroke: '#ffffff',
    aisTarget: '#e0a020',
  },
  dusk: {
    background: '#0a151f',
    water: '#10212e',
    ownVessel: '#2c6da3',
    ownVesselStroke: '#cfe0ec',
    aisTarget: '#d9a441',
  },
  'night-red': {
    background: '#000000',
    water: '#140402',
    ownVessel: '#e0473a',
    ownVesselStroke: '#000000',
    aisTarget: '#b06a10',
  },
};

export function mapThemePaint(theme: Theme): MapThemePaint {
  return PAINT[theme];
}
```

- [ ] **Step 4:** Run, expect PASS. `npm run cruise`. Commit `feat(map): symbol colors per theme`.

---

## Task 5: Parameterize the icons by color

**Files:** modify `src/features/vessel-layer/vessel-icon.ts`, `src/features/ais-layer/ais-icon.ts`.

- [ ] **Step 1: Vessel icon takes fill and stroke colors.** Replace `vessel-icon.ts`:
```ts
import { rasterIcon } from '$shared/map';

export interface VesselIconResult {
  image: ImageData;
  pixelRatio: number;
}

const SIZE = 32;

export function createVesselIcon(fill: string, stroke: string): VesselIconResult {
  return rasterIcon({
    size: SIZE,
    draw: (ctx, size) => {
      const half = size / 2;
      ctx.translate(half, half);
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(8, 12);
      ctx.lineTo(0, 7);
      ctx.lineTo(-8, 12);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    },
  });
}
```
NOTE: this also removes the duplicated `fill()`/`stroke()` calls and the stray `ROTATION_ORIGIN` constant from the original (a cleanup the symbol does not need).

- [ ] **Step 2: AIS icon takes a stroke color.** Replace `ais-icon.ts`:
```ts
import { rasterIcon } from '$shared/map';

export interface AisIconResult {
  image: ImageData;
  pixelRatio: number;
}

const SIZE = 28;

export function createAisIcon(stroke: string): AisIconResult {
  return rasterIcon({
    size: SIZE,
    draw: (ctx, size) => {
      const half = size / 2;
      ctx.translate(half, half);
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(7, 10);
      ctx.lineTo(0, 5);
      ctx.lineTo(-7, 10);
      ctx.closePath();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    },
  });
}
```

- [ ] **Step 3:** These break their overlays' call sites (now missing args), fixed in Task 6. Do not run the gate yet; proceed to Task 6, then verify together.

---

## Task 6: applyTheme on the overlays

**Files:** modify `src/shared/map/types.ts`, `src/shared/map/index.ts` (if `MapThemePaint` is not yet exported there it was added in Phase 6 Task 3), `src/features/vessel-layer/vessel-overlay.ts`, `src/features/ais-layer/ais-overlay.ts`, `src/shared/testing/fake-map.ts`, and the two overlay test files.

- [ ] **Step 1: Add the optional method to the interface.** Read `src/shared/map/types.ts`. Import the paint type and add an optional `applyTheme` to `OverlayModule`:
```ts
import type { MapThemePaint } from './map-theme';
```
and inside the `OverlayModule` interface, after `sync`:
```ts
  applyTheme?(ctx: OverlayContext, paint: MapThemePaint): void;
```
Confirm `MapThemePaint` is exported from `src/shared/map/index.ts` (it is, from Phase 6 Task 3).

- [ ] **Step 2: Vessel overlay builds with day colors and re-themes.** Read `vessel-overlay.ts`. Change the icon construction to seed with day colors and store the colors so the symbol exists before the first theme is applied:
  - Replace `const icon = createVesselIcon();` with:
    ```ts
    let icon = createVesselIcon('#1f6fb2', '#ffffff');
    ```
  - Add an `applyTheme` method to the returned object, after `sync`:
    ```ts
    applyTheme(ctx: OverlayContext, paint) {
      const { map } = ctx;
      icon = createVesselIcon(paint.ownVessel, paint.ownVesselStroke);
      if (map.hasImage(ICON_ID)) {
        map.updateImage(ICON_ID, icon.image);
      } else {
        map.addImage(ICON_ID, icon.image, { pixelRatio: icon.pixelRatio });
      }
    },
    ```
  Keep `install` and `sync` unchanged. The `paint` parameter is typed by the `OverlayModule` interface; if the inferred type needs help, annotate `paint: MapThemePaint` and import the type.

- [ ] **Step 3: AIS overlay the same.** Read `ais-overlay.ts`. Replace the icon construction `const icon = createAisIcon();` with:
    ```ts
    let icon = createAisIcon('#e0a020');
    ```
  and add after `sync`:
    ```ts
    applyTheme(ctx: OverlayContext, paint) {
      const { map } = ctx;
      icon = createAisIcon(paint.aisTarget);
      if (map.hasImage(ICON_ID)) {
        map.updateImage(ICON_ID, icon.image);
      } else {
        map.addImage(ICON_ID, icon.image, { pixelRatio: icon.pixelRatio });
      }
    },
    ```
  Use whatever the file's existing icon-image id constant is named (match the file; it is the AIS overlay's `ICON_ID`).

- [ ] **Step 4: Teach the fake map updateImage.** Read `src/shared/testing/fake-map.ts`. Add an `updateImage` method to the fake that records the call, mirroring its `addImage`/`hasImage`. For example, track a `Set<string>` of image ids that `addImage` adds and `hasImage` checks; `updateImage` is a no-op that records the id was updated (a counter or array the tests can assert on):
```ts
  updateImage(id: string, _image: unknown) {
    this.updatedImages.push(id);
  },
```
with a `updatedImages: string[]` field initialized to `[]`. Match the fake's existing object/class style.

- [ ] **Step 5: Test the vessel overlay re-themes.** In `vessel-overlay.test.ts`, add a test that after install, calling `applyTheme(ctx, mapThemePaint('night-red'))` updates the image:
```ts
  it('applyTheme swaps the icon image', () => {
    const map = createFakeMap();
    const ctx = { map, beforeIdFor: () => undefined };
    const overlay = createVesselOverlay(vessel);
    overlay.install(ctx);
    overlay.applyTheme?.(ctx, mapThemePaint('night-red'));
    expect(map.updatedImages).toContain('binnacle:vessel-icon');
  });
```
Import `mapThemePaint` from `$shared/map` and `createFakeMap` from the shared testing module, matching the file's existing imports and `vessel` fixture. If the test file builds `ctx` differently, follow its pattern; the assertion is the point.

- [ ] **Step 6: Same for the AIS overlay** in `ais-overlay.test.ts`, asserting `map.updatedImages` contains the AIS overlay's icon id after `applyTheme(ctx, mapThemePaint('night-red'))`. Follow that file's existing setup (it stubs `ImageData` and builds AIS state).

- [ ] **Step 7:** Run the unit suite: `NODE_OPTIONS="--max-old-space-size=2048" npm test`. Green. `npm run cruise`. Commit `feat(map): theme-aware own-ship and AIS symbols`.

---

## Task 7: Drive applyTheme from the recolor seam

**Files:** modify `src/widgets/chart-canvas/ChartCanvas.svelte`.

- [ ] **Step 1:** Read `ChartCanvas.svelte`. In the `recolor` closure (added in Phase 6), after the base-layer loop, compute the paint once and apply it to the two overlays it already holds (`overlay` for the vessel, `aisOverlay` for AIS). Concretely, the closure already calls `mapThemePaint(theme as Theme)` for `paint`; reuse that `paint` and add after the layer loop, before the closure returns:
```ts
      overlay.applyTheme?.(ctx, paint);
      aisOverlay.applyTheme?.(ctx, paint);
```
`ctx` is the `OverlayContext` already in scope from the load handler. If `recolor` is defined before `overlay`/`aisOverlay` in the source, move the `recolor` definition to after both overlays are registered (they are created earlier in the same `load` handler in Phase 5, so they are in scope).

- [ ] **Step 2:** `NODE_OPTIONS="--max-old-space-size=2048" npm run check`. Green. Commit `feat(map): recolor the vessel and AIS symbols on theme change`.

---

## Task 8: Version surface and copy

**Files:** modify `vite.config.ts`, `src/vite-env.d.ts` (or the project's ambient types file), `src/app/App.svelte`, `index.html`.

- [ ] **Step 1:** Read `vite.config.ts`. Add a `define` injecting the package version (npm sets `npm_package_version` when scripts run; fall back to a literal):
```ts
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
  },
```
Merge into the existing config object; do not drop existing keys (`base`, `plugins`, `test`, etc.).

- [ ] **Step 2:** Declare the global. Read `src/vite-env.d.ts` (create it if absent with the standard `/// <reference types="svelte" />` and Vite client types) and add:
```ts
declare const __APP_VERSION__: string;
```

- [ ] **Step 3:** Surface it in the top bar of `App.svelte`. Render the version next to the brand:
```svelte
  <header class="topbar">
    <span class="brand">Binnacle <span class="version">v{__APP_VERSION__}</span></span>
    <ThemeToggle controller={theme} />
  </header>
```
and style it muted and monospace:
```css
.version {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
  font-weight: 400;
}
```

- [ ] **Step 4:** Read `index.html`. Confirm `<title>Binnacle</title>` and a `<meta name="description">` describing the app exist; if the description meta is missing, add `<meta name="description" content="Binnacle: a next-generation marine chart plotter for Signal K." />`.

- [ ] **Step 5:** `NODE_OPTIONS="--max-old-space-size=2048" npm run check`. Green. Commit `feat(identity): app version surface and metadata copy`.

---

## Task 9: Full local gate

Run each heavy command alone, capture to a file, read it back:
- [ ] `biome ci .`
- [ ] `npm run cruise`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" npm run check`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" npm test`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" npm run test:e2e` (the smoke test asserts the brand "Binnacle" and the status text, which remain; the version span is inside the brand, so a text match on "Binnacle" still passes; adjust the assertion only if it used an exact-equals on the brand).

All green before committing.

---

## Task 10: Cleanup gate and phase close

- [ ] **Step 1:** Run `/cleanup` against the Phase 7 diff (inline lead audit), brief on the style rules (no em dashes, Oxford commas, American English, default no comments). Look specifically for: any remaining hardcoded blue in night contexts, untreed-shaken Lucide barrel imports inflating the bundle, missing aria-labels on icon-only controls, and font tokens not applied where numbers render.
- [ ] **Step 2:** Fix every finding, including nit.
- [ ] **Step 3: Doc gate.** Rebuild first (`NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build`) so any quoted bundle figure is current. Add the Phase 7 CHANGELOG entry (fonts, Lucide icons, theme-aware symbols, version surface). Update the README "Status" and "What is in place" sections: the foundation is complete (typography, iconography, theme-aware symbols), and note the deferred S-52 vector atlas. Update `CLAUDE.md` only if a rule changed (it should not). Update the design spec's deferred list and `.remember/remember.md` plus the `project-status` memory to mark Phase 7 done and the foundation complete.
- [ ] **Step 4:** Re-run the full gate (Task 9). Commit and push (the pre-push hook re-verifies).
- [ ] **Step 5: Exit criteria.** Inter renders the UI and JetBrains Mono renders the numbers (both self-hosted, no network font request); the theme toggle and layers panel show Lucide icons with accessible labels; switching to night-red turns the own ship red and the AIS targets dim amber with no blue anywhere on the chart; the version shows in the top bar; the symbol-color helper and both overlays' `applyTheme` are unit-tested; dependency-cruiser confirms boundaries; and all gates are green.

When all are true, Phase 7 is complete and the Binnacle **foundation is finished**. The next cycle is the first differentiator (the active-safety CoPilot: CPA/TCPA danger strip and alarm UI), which gets its own brainstorm to spec to plan, building on the AIS data and theme/alarm tokens this foundation provides.

---

## Self-review notes

- **Spec coverage:** implements the identity pass: typography (self-hosted Inter and JetBrains Mono, offline-first, with tokens and tabular numerics), iconography (Lucide chrome icons, tree-shaken, accessible), copy and version surface, and theme-aware vessel and AIS symbols that satisfy the "no blue at night" pillar by recoloring through the same seam Phase 6 established. The full S-52 chart-feature atlas is explicitly deferred with a technical justification (no vector chart features to symbolize yet), not silently dropped.
- **Placeholder scan:** every code step shows complete code. The two NOTE blocks (Lucide import-path fallback, optional opacity-percent monospace) describe a verified-at-build-time branch and a conditional, not a placeholder; both resolve deterministically during the gate.
- **Type and name consistency:** `MapThemePaint` (extended, not renamed), `mapThemePaint`, `createVesselIcon(fill, stroke)`, `createAisIcon(stroke)`, `applyTheme(ctx, paint)`, `__APP_VERSION__`, `--font-ui`, and `--font-mono` are used identically across tasks. `ICON_ID` refers to each overlay's own existing constant.
- **Boundary note:** `types.ts` importing `MapThemePaint` from `./map-theme` is intra-`shared/map`, allowed. `@lucide/svelte` and `@fontsource-variable/*` are third-party. No new cross-layer edges.
- **Offline-first:** fonts ship in the tarball (the `@fontsource` woff2 are bundled by Vite into `public/assets`), so a vessel with no internet still renders the brand typography, consistent with the offline-first pillar.
- **Verify before push:** every heavy command runs alone and is read from a file before any commit; the hooks enforce green. One heavy command at a time respects the Pi memory budget.
