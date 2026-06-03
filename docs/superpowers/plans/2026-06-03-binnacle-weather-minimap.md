# Weather Mini-Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move all weather off the navigation chart into a dedicated, zoom-capped weather mini-map shown in a bottom-center panel toggled by the Forecast button. The nav chart stays clean.

**Decisions (from the user):** replace the on-chart overlays entirely (weather lives only in the mini-map); the mini-map has its own pannable view starting at the chart's area, with a capped max zoom (RainViewer tops out at zoom 7) so the weather can never "break"; presented as a bottom-center panel.

**Architecture:** A new `weather-map` widget owns a second small MapLibre instance (mounted only while the panel is open, so there is at most one extra GL context, freed on close), its own `LayerManager` running the existing weather `OverlayModule`s (the four area fills mutually exclusive), a per-frame tick to sync them, theme recolor, a capped zoom, and the weather fetch driven by ITS OWN bounds. It contains the layer toggles, the time scrubber, the legend, and the tap-for-value readout. The shared `WeatherStore` and the fetch client, colormaps, `time-scrub`, and `weatherLegend` are reused unchanged. `ChartCanvas` and `App` drop all weather wiring.

**Tech Stack:** Svelte 5 runes, MapLibre GL JS 5, TypeScript, Vitest. Reuse `$features/weather` and `$shared/map`. Live-verify in day, dusk, and night-red. American English, no em dashes, Oxford commas, no "&" in text.

**Pi budget:** one heavy command at a time; gate green before each commit; full chain before push. The mini-map map is destroyed on close so two GL contexts never persist.

---

### Task 1: The WeatherMap widget (map, overlays, tick, theme, capped zoom)

**Files:**
- Create: `src/widgets/weather-map/WeatherMap.svelte`
- Create: `src/widgets/weather-map/index.ts`

- [ ] Build a Svelte component that, on mount, creates a MapLibre map in a small container with `maxZoom: 7`, `minZoom: 1`, starting at the passed `initialView`. Mirror `ChartCanvas`'s map setup: `baseStyleUrl()`, `installSentinels`, a `LayerManager` with `exclusive: [WEATHER_FILL_IDS]`, register the six weather overlays (waves, precip, cloud, radar, wind, pressure), capture the base theme, and recolor for the current theme. Run a `requestAnimationFrame` tick that calls `sync(ctx)` on each weather overlay. On destroy, cancel the frame and `map.remove()`.
- [ ] Props: `weather: WeatherStore`, `initialView: MapView`, `theme: Theme`, `onClose: () => void`, and a persisted `savedLayers`/`onLayersChange` for the weather layers, plus `savedView`/`onViewChange` for the panel's own view.
- [ ] Recolor when the `theme` prop changes (an `$effect`).
- [ ] Index re-exports `WeatherMap`.
- [ ] Gate (check, test, build) and commit.

### Task 2: Fetch driven by the mini-map's bounds

- [ ] In WeatherMap, port the debounced fetch from App: on the map's `moveend`/settle and on layer enable, fetch the forecast for the map's bounds (`maxCells: 600, forecastDays: 5`), plus marine when the waves layer is on and radar when the radar layer is on, and write the shared `WeatherStore` (`setGrid`/`mergeMarine`/`setRadar`). Reuse `fetchForecast`, `fetchMarine`, `mergeMarine`, `fetchRadar`, and the `refetchOnEnable` pattern, all keyed off the mini-map's own active layers.
- [ ] Gate and commit.

### Task 3: Panel chrome (layer toggles, scrubber, legend)

- [ ] Lay out the panel: the map fills the panel, with a compact control strip carrying the layer toggles (reuse `LayerToggle` via the mini-map's `LayersView`, fills shown as one-at-a-time), the time scrubber (reuse the `time-scrub` logic), the active-layer legend (reuse `weatherLegend` and the gradient-bar markup), and a close button. Themed for day, dusk, and night-red.
- [ ] Gate and commit.

### Task 4: Tap-for-value readout on the mini-map

- [ ] On a tap on the mini-map, show wind, pressure, sea state, and rain at that point for the selected time (reuse `readoutAt`), as a small readout in the panel, gated to the active layers.
- [ ] Gate and commit.

### Task 5: Wire into App, strip weather from the nav chart

- [ ] App: add `weatherPanelOpen` state; the centered Forecast button in the status strip toggles it; render `<WeatherMap>` when open (pass the shared store, the current `mapView` as `initialView`, the theme, persistence, and `onClose`). Remove the on-chart weather wiring: `scheduleWeather`, the weather fetch effects, `weatherActive`/`wavesActive`/`radarActive`/`weatherLayers`/`weatherFills`/`weatherOverlayLayers`/`weatherLegends`/`layerVisible`, the `weatherReadout` chip, the menu Weather section, and the old `WeatherTimeControl` usage.
- [ ] ChartCanvas: remove the `weather` prop, the six weather overlay imports/registrations/tick syncs, the `exclusive` fill group, and the weather `onMapTap` readout path.
- [ ] Keep the shared `WeatherStore` constructed in App and passed to WeatherMap.
- [ ] Full gate (check, test, biome, cruise, build), all green.
- [ ] Commit.

### Task 6: Persist the weather layers and the panel view

- [ ] Persist the mini-map's weather layer visibility (`binnacle:weather-layers`) and its view (`binnacle:weather-view`) so reopening restores them. Reuse `PersistedValue`.
- [ ] Gate and commit.

### Task 7: Docs, simplify, push, live verification, memory

- [ ] Update CHANGELOG and README: weather is now a dedicated, zoom-capped mini-map panel, not chart overlays.
- [ ] Run `/simplify`; apply findings.
- [ ] Full gate, push.
- [ ] Live-verify (Playwright): the Forecast button opens the panel; the mini-map shows weather; layers toggle (fills one at a time); the scrubber, legend, and tap readout work; zooming the mini-map never shows "zoom not supported"; the nav chart has no weather; all three themes.
- [ ] Update the project-status memory.
