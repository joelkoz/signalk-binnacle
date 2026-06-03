# Weather UX Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Apply the mariner UX review: mutually-exclusive area fills with sensible default opacity, a night-red palette pass, radar overzoom polish, a Weather-menu restructure (fills vs overlays), and a cleaner legend.

**Architecture:** The fill exclusion and default opacity are enforced in the generic `LayerManager` (the wiring passes the weather fill group, like `pinned`), so both the Layers panel and the menu get it. The legend moves from discrete chips to a continuous gradient bar built from the colormap stops. Palette changes are colormap-only and verified live in all three themes.

**Tech Stack:** Svelte 5 runes, MapLibre, TypeScript, Vitest. Live verification via Playwright over https://boatpi:3443/binnacle/ in day, dusk, and night-red. American English, no em dashes, Oxford commas, no "&" in text.

**Pi build policy:** one heavy command at a time, gate green before each commit, full chain before push.

---

### Task 1: Default opacity and mutually-exclusive groups in the LayerManager

- Add `readonly defaultOpacity?: number` to `OverlayModule` (`src/shared/map/types.ts`).
- In `LayerManager.register`, the no-saved-state fallback opacity becomes `module.defaultOpacity ?? 1`.
- Add a `exclusive?: string[][]` option to `LayerManager`. In `toggle(id, true)`, set every other id in the same exclusive group invisible (state + `setVisible(false)`), then persist once.
- `LayersView.toggle` refreshes the item list after a toggle (exclusion can change several rows).
- Tests in `layer-manager.test.ts`: defaultOpacity applied on register; toggling one member of an exclusive group hides the others.

### Task 2: Field overlay default opacity and the fill exclusion group

- `createFieldOverlay` accepts `defaultOpacity` and sets it on the module; waves 0.7, precip 0.7, cloud 0.5. `radar-overlay` sets `defaultOpacity` 0.85.
- `ChartCanvas` passes `exclusive: [['weather-waves', 'weather-precip', 'weather-cloud', 'weather-radar']]` to the LayerManager.
- Live-verify: enabling one fill turns the others off; defaults look right in all themes.

### Task 3: Weather menu restructure (fills vs overlays)

- In `App.svelte`, split the Weather submenu into a "Map fill (one at a time)" group (waves, precip, cloud, radar) and an "Overlays" group (wind, pressure), with a small sub-label each. Still uses `LayerToggle`; exclusion is enforced by the manager.

### Task 4: Legend redesign (continuous gradient)

- `legend.ts` exposes, per layer, a CSS `linear-gradient` built from the colormap stops plus low and high labels and a unit, instead of discrete swatches (keep a discrete fallback for pressure isobars and radar).
- `WeatherTimeControl` renders a compact gradient bar with end labels; tidy spacing and type.
- Live-verify day, dusk, night-red.

### Task 5: Night-red palette pass

- Pull the NIGHT top stops in `wind-colormap`, `wave-colormap`, `precip-colormap`, `cloud-colormap` down in luminance and toward pure deep red (less green and blue), so the brightest night pixel is low. Keep day and dusk. Verify weather reds do not read as buoyage red; verify live in night-red.

### Task 6: Radar overzoom hint

- Show a short "radar to ~zoom 11" note in the legend (or near the radar entry) when the radar layer is on, so the overzoom blur reads as a resolution limit, not an error.

### Task 7: Docs, simplify, push, live verification, memory

- Update CHANGELOG and README. Run /simplify. Full gate, push. Live-verify all three themes. Update project-status memory.
