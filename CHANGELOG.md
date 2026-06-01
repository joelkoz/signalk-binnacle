# Changelog

All notable changes to Binnacle are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- The Signal K worker crashed at load with "Class extends value undefined" because the worker
  graph imported the server-side `@signalk/server-api` package, whose entry re-exports a
  `FullSignalK` class extending Node's `EventEmitter`; bundled into the browser worker with
  `events` externalized, that base class resolved to `undefined`. The worker now mirrors the few
  Signal K wire types it needs locally and no longer imports the package, dropping the worker
  bundle from about 164 KB to about 7 KB and removing the dependency entirely.
- The chart area rendered all blue offshore because the base map was fetched from a CDN
  (`tiles.openfreemap.org`), which is unreachable on a boat with no internet, leaving an empty
  map that showed the page background through it. Binnacle now ships a bundled, offline base
  style that the theme recolors, with Signal K charts layered on top. Bundled vector base tiles
  are a later spec; this removes the CDN dependency in line with the offline-first rule.

### Added

- Lookout (active-safety, first slice): the headless collision data layer behind the upcoming
  danger strip. A pure, test-first closest-point-of-approach module computes CPA and TCPA from the
  own vessel and a target's position and velocity, a persisted-settings helper holds
  user-configurable danger and warning thresholds with sensible defaults, and a collision
  assessment ranks AIS contacts by severity, preferring the server's `navigation.closestApproach`
  when a provider supplies it and falling back to the computed values otherwise. The danger strip,
  chart highlight, audible alarm, and Signal K notification publishing follow in later slices.
- Theming: a design-token system with day, dusk, and night-red palettes, switched by a single
  theme controller that sets `data-theme` on the document and persists the choice. Every surface
  recolors from CSS custom properties, a top-bar toggle cycles the themes, and the map base
  recolors via `setPaintProperty` (keeping tiles and overlays). Night-red is pure red on true
  black with no blue, and a dedicated alarm token stays distinguishable in every palette.
- Identity: self-hosted Inter (UI) and JetBrains Mono (tabular numeric readouts) typography
  bundled for offline use, Lucide icons for the theme toggle and the layers panel, the own-ship
  and AIS symbols recolored per theme so the chart shows no blue on the night-red theme (the own
  ship turns red and AIS a night-safe amber), and the build version shown in the top bar.
- AIS targets: the worker learns the self vessel from the `hello` handshake and routes other
  vessels' deltas into a per-context AIS stream, the store accumulates each target and prunes
  ones that go silent past a six-minute window, an `AisTargets` entity interprets each target
  into display units, and an AIS overlay renders them as GPU symbols in the traffic band that
  rotate with course and skip rebuilding when nothing changed. The app subscribes `vessels.*` at
  a controlled rate, and CPA and TCPA are read from `navigation.closestApproach` when a provider
  supplies them.
- Charts: a generic chart-source adapter turns any Signal K chart resource into MapLibre source
  and layer specs, branching on the chart type (raster tilelayer, WMS, WMTS, and S-57, plus
  vector tileJSON with PMTiles resolved to the `pmtiles://` protocol) and honoring bounds and
  zoom limits. Each chart wraps as a basemap-band overlay on the existing layer manager, the
  charts client discovers them from `/resources/charts` (v2, falling back to v1, degrading to an
  empty list offline), and a layers panel gives each chart a visibility toggle and an opacity
  slider.
- Verify-before-push git hooks (`.githooks/`, installed via `npm run hooks`): a fast format,
  lint, and boundary check before each commit, and the full type-check, test, and build gate
  before each push, so a broken tree cannot be committed or pushed.

### Changed

- Whole-repo cleanup pass: the chart source and layer ids derive from a single `chartSourceId`
  helper, the own-vessel overlay skips its per-frame `setData` when position and heading are
  unchanged, the vessel icon is built once and cached, the connection clears its reconnect timer
  on disconnect, malformed delta frames and chart fetch errors now warn instead of failing
  silently, MapLibre source and layer specs are properly typed (no `as never` casts), the layers
  panel hides the opacity slider for layers that do not support it, the unit converters accept
  `null`, the connection wakes a single shared own-vessel instead of two, and the shared test
  fakes (`FakeWebSocket`, `createFakeMap`) live in `src/shared/testing/` rather than being
  redefined per test. The dependency-cruiser ruleset now covers every Feature-Sliced Design
  layer direction, including the cross-feature public-API boundary.

- The map: a MapLibre GL map with a vector base, rendered in the chart area. A framework-free
  `LayerManager` gives every overlay an independent toggle, opacity, and deterministic z-order
  via sentinel layers and `beforeId`, so a new overlay later is a new file plus one
  registration. The own vessel renders as a GPU symbol layer that rotates with heading (falling
  back to course over ground), updated from the Signal K store each animation frame. Includes
  the PMTiles protocol registration for future offline tiles.

- Real-time data layer: a Web Worker hosts the Signal K WebSocket client, bridged to the main
  thread with Comlink, delivering one batched frame per animation frame. A path-keyed runes
  store of independently reactive cells lets a component bound to one Signal K path avoid
  re-running when an unrelated path changes. Includes delta reconciliation, a per-frame
  last-write-wins batcher, a refcounted subscription registry, full-jitter reconnection with
  resubscribe on open, and an own-vessel entity that converts SI values to display units at the
  edge. The shell shows live connection state and own-vessel SOG and COG.

- Project floor (Phase 1 of the foundation): a Svelte 5, Vite, and TypeScript application
  that builds as a Signal K webapp, serving static files from `public/` at `/binnacle/`.
- Feature-Sliced Design layout (`app`, `views`, `widgets`, `features`, `entities`, and
  `shared`) with module boundaries enforced by dependency-cruiser.
- SI unit-conversion module in `shared`, built test-first, covering meters per second to
  knots, radians to a normalized degree bearing, Kelvin to Celsius, meters to feet, and
  meters to nautical miles.
- Verification toolchain: Biome for lint and format, svelte-check for type-checking, Vitest
  for unit tests, Playwright for an end-to-end smoke test, and a CI workflow running the
  full gate on Node 24.
- Foundation design spec and Phase 1 implementation plan under `docs/superpowers`.
- README, an Apache-2.0 LICENSE, and a Buy Me a Coffee funding link (README badge,
  `.github/FUNDING.yml`, and the `package.json` funding field).
