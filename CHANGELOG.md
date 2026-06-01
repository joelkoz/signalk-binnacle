# Changelog

All notable changes to Binnacle are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Points-of-interest markers now use per-category icons and a rich detail popup. Each note is sorted
  into a category (anchorage, marina, fuel, services, inlet, boat ramp, bridge, hazard, navaid,
  structure, or a generic point of interest), matched from the provider's skIcon against the live
  Crow's Nest / ActiveCaptain vocabulary with a keyword fallback for unfamiliar variants, so
  navigation lights and channel buoys read as navaids, creek inlets as inlets, and boat ramps and
  bridges as themselves instead of plain pins. Each category draws as a themed disc with a glyph:
  Lucide glyphs (anchor, sailboat, fuel pump, wrench, waves, landmark, triangle-alert, map-pin) per
  the spec's chosen app icon family, plus custom slipway and bridge marks. Hazards take the alarm hue,
  navaids the caution hue, the rest the POI hue; all recolor with the theme (night-red stays in the
  red band).
  Clicking a marker opens a themed popup with the name, category, any description and source
  attribution, and an http(s)-only link to the provider's detail page, and the selected marker gets a
  highlight ring.

- Navaids now render type-specific symbols instead of one generic marker. The note name is parsed
  into a kind (lighthouse, light, buoy, daybeacon, or generic) and, for buoys and daybeacons, a
  lateral side from the aid's number using the US IALA-B convention (even = red, starboard hand;
  odd = green, port hand). Lights draw as a magenta flare, lighthouses as a lantern-topped tower,
  starboard marks as a red cone or triangle, port marks as a green cylinder or square, so a channel
  reads at a glance. The side is carried by shape as well as color, so it survives night-red (where
  red and green collapse to two red shades). This infers symbols from the note text; full S-52
  symbology keyed off S-57 ENC attributes (shape, color, category) remains the later vector-chart
  spec, since notes carry no such attributes.

- Points-of-interest markers cluster at lower zoom and split apart as you zoom in, so a busy harbor
  shows a single counted disc instead of a stack of overlapping markers; clicking a cluster zooms to
  expand it. Marker size scales gently with zoom.

- Points-of-interest overlay: Binnacle now renders Signal K `notes` resources on the map, so POI
  providers like signalk-crows-nest (Active Captain, OpenSeaMap, NOAA, USCG light list) show up.
  The overlay fetches notes scoped to the current viewport (`?bbox=...`, no `provider` so every
  notes provider merges, which is how Freeboard-SK retrieves them), refetched as the map moves and
  gated below zoom 9. POIs draw as themed dots with names at zoom 12 and up, and toggle from the
  layers panel. Earlier nothing showed because Binnacle had no consumer for `notes` resources; the
  data was being served correctly all along.

- Lookout collision chart highlight (differentiator step 3): dangerous AIS contacts now get a graded
  ring on the chart in the safety z-band, danger and warning colored from the theme (day, dusk, and
  night-red, which keeps both in the red band with danger brighter). The overlay is dirty-checked
  against the assessment so it only rebuilds when a contact's id, severity, or position changes, is
  theme-aware through the layer manager's applyTheme broadcast, and toggles from the layers panel.

### Changed

- The own-vessel marker is now a boat hull instead of a flat triangle. It is drawn with the 2D
  canvas (filled hull, darker outline, sharp bow, flat transom) at 2x for retina crispness, rotates
  to `headingTrue` (falling back to `courseOverGroundTrue`), and recolors with the theme (blue by
  day, red at night). The pointed bow makes the heading unambiguous. The symbol-overlay factory
  gained an optional `pixelRatio` so an icon can be drawn at 2x.

- A tiled chart now hands off to the base map when you zoom past its native detail. Each chart's
  draw layers are capped one zoom level beyond the source's native maximum (read from the loaded
  tile metadata, so it is archive-agnostic), so zooming in past the chart's scale reveals the sharp
  base map instead of a blocky overzoomed chart. The chart stays authoritative within its own zoom
  range and aligned with the base beyond it.

- The collision danger strip's Acknowledge control now works: acknowledging suppresses the current
  worst contact, and a new or more severe contact automatically re-arms the alert. The full
  mute/alarm lifecycle remains a later Lookout step.

- Whole-repo cleanup pass: a chart now themes its own draw layers through an `applyTheme` broadcast
  from the layer manager, so the widget no longer reaches into chart layers by id (the source-layer
  to color mapping lives in one place); the vessel and AIS overlays are built from a shared
  `createSymbolOverlay` factory instead of duplicated scaffolding; the vector draw order and per
  source-layer styling are a single ordered list; a `mapstyleJSON` chart is a clean no-op pending
  the style pipeline rather than a broken source; AIS target views are memoized by version so
  own-vessel motion no longer rebuilds the list; the AIS staleness scan is throttled off the
  per-frame path; the subscription registry gained a refcounted `remove` and the worker routes
  unsubscribe through it so a dropped path is not resurrected on reconnect; `PersistedValue` reports
  `fromStorage` by key presence rather than a value compare; coordinate formatting and the
  AIS-target field extractors were de-duplicated; the connecting state is a shared
  `INITIAL_CONNECTION_STATE`; dead code was removed (`PathCell.receivedAt`, the unused `worst`
  getter, the `kelvinToCelsius` and `metersToFeet` helpers, identity arithmetic in the icons, and
  several unreachable null-guards); and the danger strip shows a "+N more" cue instead of silently
  truncating the contact list.

### Fixed

- A vector (PMTiles) chart could drop tiles to blank gaps at low-to-mid zoom (around z9) on some
  GPUs, even though the tiles fetched fine (HTTP 206) and decoded correctly. The cause was render
  load: the archive ships `landuse` un-simplified from low zoom, so a single z9 tile can carry
  roughly 1700 polygons that are invisible at that scale but heavy to draw over the full base map,
  which a weaker or high-DPI GPU silently fails to render. The chart now holds `landuse` until z12,
  where it is actually legible, cutting the low-zoom chart draw load sharply. Each chart layer's
  minzoom is preserved through the max-zoom cap.

- A vector (PMTiles) chart could show blank gaps over a real network. The archive is read
  uncached (`cache: 'no-store'`, to dodge a Chrome disk-cache write failure), so each chart tile
  depends on a live HTTP range read; a transient drop or a server hiccup under a burst of reads (a
  zoom that pulls in new tiles) blanked that tile until a later zoom re-requested it. The PMTiles
  source now retries a failed or 5xx range read (short backoff, up to two tries) while still
  honoring a caller abort, so a transient failure no longer leaves a hole.

- AIS targets disappeared from the chart after about six minutes of page uptime. The worker stamped
  each frame's epoch with 0 (`requestAnimationFrame` is absent in the worker, so the batcher's
  fallback passed 0) while the overlay pruned staleness against `performance.now()`, so pruning
  tracked uptime, not real staleness. The worker now stamps a wall clock (`Date.now`) and the
  overlay prunes with the same clock.
- The AIS change counter bumped on every worker frame, not only on AIS changes, because the worker
  always emits an `ais` object (empty when only the own vessel moved). It now bumps only when a
  context actually updates, so the AIS overlay and the collision assessment no longer rebuild every
  frame.
- The stored-token auth probe now omits credentials, so a live session cookie cannot mask a stale
  token and leave the WebSocket streaming nothing.

- Vector charts (MVT/PMTiles) rendered nothing on the map. A vector tile source paints nothing on
  its own: MapLibre needs a draw layer per source-layer, and the chart adapter both routed these
  charts to a raster source and, on the vector path, emitted no draw layers. The adapter now routes
  any chart marked `mvt`/`pbf`, typed `tileJSON`/`mapstyleJSON`, or ending in `.pmtiles` to a vector
  source and generates themed fill and line draw layers per source-layer. It covers the two dominant
  vector base-map schemas (Protomaps and OpenMapTiles) and, because Signal K's charts API often
  returns an empty layer list for an archive, falls back to the full known set when none are
  declared; MapLibre silently ignores a draw layer whose source-layer is absent. The chart layers
  recolor with the day, dusk, and night-red themes, and per-layer opacity now uses the correct paint
  property for fill, line, and raster layers.

- PMTiles vector charts failed to render with `ERR_CACHE_WRITE_FAILURE`: a large archive served
  with a weak ETag over range requests makes Chrome fail the HTTP disk-cache write, which rejects
  the whole fetch and blanks the chart. Binnacle now registers each PMTiles archive with a source
  that fetches ranges with `cache: 'no-store'`, bypassing the browser cache for these reads. Durable
  offline caching of these archives is a later spec.

- Collision assessment no longer raises a false alarm on an opening or already-passed AIS target:
  the provider closest-approach path now drops a contact whose time to closest approach is negative
  (the closest approach is in the past), matching the computed path's behavior.
- Closest-point-of-approach math now normalizes the longitude difference, so a vessel pair
  straddling the antimeridian computes a real short range instead of a bogus near-360-degree offset.
- The AIS change counter is now reactive state, so a future reactive consumer is notified rather
  than only the per-frame poll, removing a latent reactivity trap.

- Own-vessel readouts (SOG and COG) stayed blank while live data flowed. The store creates a
  path cell lazily on first access; the first access was the shell's reactive readout, so a
  brand-new `$state` source was created during the effect's tracking pass and never subscribed,
  and later updates did not re-render. `OwnVessel` now creates its cells at construction, before
  the readout runs, so the reactive read tracks an existing cell.
- The auth probe could mistake a secured server for an unsecured one. It checked a REST path that
  a browser session cookie satisfies, so it concluded "unsecured" and connected the WebSocket
  stream without a token, which the cookie does not authenticate, leaving no live data. The probe
  now checks a stored token first and runs the anonymous check with credentials omitted, so a
  cookie cannot mask the need for a token.
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

### Security

- The points-of-interest popup's "View details" link now follows only `http:` and `https:` URLs.
  A note's link comes from a resource provider Binnacle does not control, so a `javascript:` or
  `data:` URL would otherwise execute when clicked; non-http schemes and unparseable URLs are now
  dropped.

### Added

- Lookout danger strip: collision danger now surfaces on screen. A strip floats at the bottom of
  the chart listing the most dangerous AIS contacts with their closest point of approach in nautical
  miles and time to closest approach in minutes, color-graded by severity, with an acknowledge
  control and a "computing locally" note when the values are the client-side fallback rather than a
  Signal K provider. The strip is absent when nothing is dangerous, so a calm night watch stays dark,
  and it updates as traffic moves. This is the first on-screen slice of the active-safety Lookout
  feature; the chart highlight, audible alarm, notifications, and thresholds panel follow.
- Offline and PWA caching: Binnacle is now an installable progressive web app. A service worker
  precaches the app shell, runtime-caches the OpenFreeMap base map and the Signal K PMTiles charts
  cache-first (range-request aware) as they are viewed, and never caches the live Signal K stream or
  REST API, so anywhere the navigator has looked renders offline while live data stays fresh. The
  top bar offers an update when a new build is published, and the status strip shows an offline
  indicator. Service workers require a secure context, so this activates when the Signal K server is
  served over HTTPS; over plain HTTP the app degrades cleanly to online-only with no errors.
- The status strip shows the map's center latitude and longitude and the zoom level, updating as
  the chart is panned and zoomed, formatted at the display edge with hemisphere suffixes.
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
