# Binnacle Weather Overlay: Design

Date: 2026-06-03
Status: approved

## Overview

The weather overlay is the first half of the "weather and routing" differentiator. It draws marine
forecast data over the chart: animated wind, pressure isobars, waves and swell, precipitation radar,
and cloud cover, with current conditions and a scrubbable forecast. Routing is a separate, later
spec; it will consume the forecast data this spec produces, so the two stay decoupled.

The map z-order already reserves a `weather` band (and a `routes` band), so weather layers slot in
without touching the core. Every weather layer is a self-contained overlay registered through the
existing `LayerManager`, so it gets a toggle and an opacity slider in the Layers panel for free, and
adding or removing a layer never touches the map widget.

## Goals

- Show wind, pressure, waves, precipitation, and cloud cover over the chart, themed for day, dusk,
  and night-red.
- Current conditions by default, with a draggable time slider that scrubs through the forecast.
- A custom WebGL particle field for wind: the glanceable, Windy-like signature layer.
- Tap a point to read exact wind speed and direction, pressure, and wave height at the selected time.
- Browser-only: no server plugin, no API key, free data sources, consistent with the OpenFreeMap
  base map and the depth-charts streaming overlays already in the app.
- Caches for offline so a fetched forecast survives a dropout, and degrades cleanly when offline.

## Non-goals (deferred)

- Routing of any kind (its own spec).
- GRIB ingestion or a companion weather service.
- High-resolution regional models (the browser-only Open-Meteo grid is coarser than raw GFS).
- Animated precipitation loops beyond what RainViewer frames provide.

## Locked decisions

- Layers: wind (animated particles, hero), pressure isobars, waves and swell, precipitation radar,
  and cloud cover.
- Wind data and most fields: Open-Meteo browser-only gridded JSON. Precipitation nowcast: RainViewer
  free tiles. Waves: Open-Meteo marine API.
- Time: current plus scrubbable forecast.
- Control: a centered "Forecast" button in the bottom status strip opens a draggable time-scrubber
  and legend window; it closes back to just the button. Layer on/off and opacity stay in the Layers
  panel under a "Weather" group.
- Wind rendering: a custom MapLibre WebGL layer (not deck.gl) for bundle leanness and full theme
  control.
- Units SI internally, converted at the display edge.

## Architecture (Feature-Sliced)

### entities/weather

The forecast store, placed in `entities` so a future routing feature can read it without a
feature-to-feature import.

- `WeatherGrid`: the parsed forecast. A regular lat/lon grid (bounds, rows, cols), an array of
  forecast timestamps, and per-variable arrays indexed by `[timeIndex][cellIndex]`: `windU`, `windV`
  (m/s, derived from speed and direction), `pressureMsl` (Pa), `precipitation` (mm), `cloudCover`
  (fraction), and from the marine grid `waveHeight` (m), `waveDirection` (rad), `wavePeriod` (s).
  Marine variables are absent over land cells.
- `WeatherStore` (runes): the current `WeatherGrid | undefined`, a `loading`/`error`/`stale` status,
  the requested bbox and forecast range, and `selectedTime` (the scrubber position) with a derived
  `selectedIndex`/interpolation fraction between the two bracketing forecast steps. Exposes SI
  values; display conversion happens at the edge.

### features/weather

Public API via `index.ts`, named re-exports only.

- `weather-client.ts`: pure-ish data client with an injected `fetch` (like the auth and charts
  clients). Builds the Open-Meteo forecast request and the marine request for a bbox sampled to a
  grid, parses the responses into a `WeatherGrid`, and reports errors without throwing. Knows the
  source endpoints and units; converts wind speed and direction to `windU`/`windV` on parse.
- Overlay modules, each an `OverlayModule` in the `weather` band, each with `applyTheme`,
  `setVisible`, and `setOpacity`, all reading `WeatherStore.selectedTime`:
  - `wind-overlay`: a MapLibre custom (WebGL) layer that advects particles through the u/v field
    (the field uploaded as a texture, bilinearly sampled in the shader), fading trails, colored by
    speed via a wind colormap. Opacity and theme are shader uniforms. Added before the `weather`
    sentinel so it sits in band.
  - `pressure-overlay`: isobar contours computed from `pressureMsl` by marching-squares at a fixed
    interval (default 4 hPa), rendered as a GeoJSON line layer plus a labeled symbol layer.
  - `waves-overlay`: a wave-height color field rendered through a canvas image source for smoothness,
    plus a sparse direction-arrow symbol layer; period shows in the tap readout.
  - `precip-overlay`: RainViewer raster tiles (reusing the depth-charts streaming-overlay machinery)
    for frames within RainViewer's range; for forecast times beyond it, an Open-Meteo precipitation
    color field. The scrubber time selects the frame or the field.
  - `cloud-overlay`: a cloud-cover color field (translucent), same field technique as waves.
- `WeatherTimeControl.svelte`: the bottom-status-strip "Forecast" button and the scrubber window
  (slider, play and step, the current-time label, and the active-layer legend). Drives
  `WeatherStore.selectedTime`. Pure step, clamp, and play-advance logic is testable in isolation.
- A tap-for-value readout: on map tap with weather active, show wind speed and direction, pressure,
  and wave height at the tapped cell for the selected time.

### Wiring

- The map widget registers the five weather overlays with the `LayerManager` like the other
  overlays; they appear in the Layers panel "Weather" group, off by default.
- The app shell mounts `WeatherTimeControl` in the bottom status strip and owns the
  `entities/weather` store, fetching on first enable and refetching (debounced) on pan and zoom.

## Data sources

- Open-Meteo forecast: `https://api.open-meteo.com/v1/forecast` with comma-separated `latitude` and
  `longitude` lists (one batched request for the grid), `hourly=wind_speed_10m,wind_direction_10m,
  pressure_msl,precipitation,cloud_cover`, `wind_speed_unit=ms`, and `forecast_days` (default 5).
  Chunk the grid into multiple requests if the per-request location cap is exceeded.
- Open-Meteo marine: `https://marine-api.open-meteo.com/v1/marine` with the same grid and
  `hourly=wave_height,wave_direction,wave_period`.
- RainViewer: `https://api.rainviewer.com/public/weather-maps.json` for the available frame
  timestamps (past plus nowcast), then the radar tile template it returns. No key, CORS-OK.

All three are free, keyless, and CORS-enabled, matching the app's existing online-tile exception for
the base map and depth charts. The "no CDN for code" rule still holds; this is data, not code.

## Theming

Each overlay implements `applyTheme`. Day and dusk use a standard wind/value colormap; night-red
uses a red-band-safe ramp (no blue, low brightness) for the particle and field colors and a red
isobar line, and desaturates and dims the RainViewer raster the way depth charts already do. The
legend reflects the active layer's colormap for the current theme.

## Performance and offline (Pi budget)

- Off by default; nothing fetches or renders until a weather layer is enabled, so startup is
  unaffected.
- The viewport bbox is sampled to a capped grid (target around 30 by 20 cells) so one or a few
  batched requests cover it; refetch is debounced on pan and zoom (one fetch per settle, like the
  map-view persistence).
- The particle count and animation are capped for Pi-class GPUs; rendering runs on the existing
  animation frame, and weather overlays follow the same `shouldRefresh` change-detection as the
  other overlays so an idle map does no per-frame work beyond the particle animation itself.
- Forecast responses and RainViewer tiles cache through the service-worker runtime cache (the same
  mechanism as the PMTiles and depth-chart caching), so a fetched forecast persists for offline use.

## Error handling

- A failed Open-Meteo or marine fetch sets `WeatherStore.error`, leaves the last grid in place if
  there is one, and retries on the next pan or a manual retry. Requests are debounced and cached so a
  transient failure does not hammer the service or trip its fair-use limit.
- Missing marine data over land or lakes simply yields empty wave cells, not an error.
- Offline with no cached forecast leaves the enabled layer empty with a quiet "weather unavailable"
  note; with a cached forecast, it shows the cached data marked stale.

## Testing

- `weather-client`: request building for a bbox and time range, response parsing into a `WeatherGrid`
  (including speed and direction to u/v), grid chunking, and error and empty handling, with an
  injected `fetch`.
- Pure transforms: speed and direction to u/v, the marching-squares contour, the colormap functions,
  time interpolation between forecast steps, and bbox-to-grid sampling.
- Each overlay's `OverlayModule` contract (add, remove, setVisible, setOpacity, applyTheme) against
  the existing fake-map.
- `WeatherTimeControl` step, clamp, and play-advance logic as pure functions.
- WebGL particle rendering is verified live, not unit-tested.

## Build order

The spec covers the whole overlay; the implementation plan sequences it, each step gated per the
project build policy.

1. Data layer: `entities/weather` store and `weather-client` (Open-Meteo forecast and marine), the
   `WeatherGrid` type, bbox sampling, the time model, and caching. No UI.
2. Time control: the bottom-row "Forecast" button, the scrubber window, and the selected-time state.
3. Wind hero: the WebGL particle layer from u/v, the colormap, theming, Layers-panel registration,
   and the tap-for-value readout.
4. Pressure isobars (marching-squares contours and labels).
5. Waves and swell (color field plus direction arrows).
6. Precipitation (RainViewer radar nowcast plus the forecast precip field).
7. Cloud cover field.
8. Legend, the Layers-panel "Weather" group, offline caching, and polish.

Steps 1 through 3 are the core shippable increment; 4 through 7 add the remaining layers; 8 finishes.

## Risks and open items

- Open-Meteo per-request location limits may force grid chunking; the client must handle multiple
  requests and partial failures.
- The custom WebGL particle layer is the riskiest build; deck.gl's particle layer is the fallback if
  the hand-rolled layer proves unmaintainable, accepting the bundle cost.
- Open-Meteo fair-use limits constrain refetch frequency; debounce and cache are required, not
  optional.
- RainViewer covers a limited forecast horizon (nowcast), so the precip layer switches to the
  Open-Meteo field for later forecast times; the handoff must be seamless on the scrubber.
