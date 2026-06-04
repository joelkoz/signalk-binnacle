# Changelog

All notable changes to Binnacle are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Weather. A dedicated weather mini-map, opened by the Forecast button centered in the status strip,
  keeps the navigation chart clean and the weather within its data resolution. The mini-map is capped
  at zoom 7 (RainViewer's real radar resolution) and panned independently of the chart, so weather can
  never be zoomed past what the data supports: no "zoom not supported" tiles, no pretending a coarse
  grid has street-level detail. In the panel you toggle Wind, Pressure, Waves, Precipitation, Cloud
  cover, or Rain radar, scrub the coming days with a time slider, read a per-layer color-ramp legend,
  and tap anywhere for the wind, pressure, sea state, and rain at that point and time. Wind draws as
  speed-colored arrows, mean-sea-level pressure as labeled isobar contours (marching squares, 4 hPa),
  significant wave height, precipitation, and cloud cover as smooth color fields, and precipitation
  radar as an animated RainViewer loop. The four area fills (waves, precipitation, cloud, and radar)
  are mutually exclusive, one at a time, so they never stack into mud; wind arrows and pressure
  isobars stay freely combinable on top. A "Here" panel shows the current conditions, a short
  forecast, and any gale or storm warnings for the vessel's own position.
- Weather data prefers a configured Signal K weather provider (for example AccuWeather) for point
  data: the tap readout and the "Here" conditions and warnings come from the provider when one is
  set, and fall back automatically to the free, browser-only sources when none is configured. Area
  data is always free, because no provider exposes gridded fields through Signal K: the atmospheric
  grid and the marine wave field come from Open-Meteo, and radar from RainViewer, with no key and no
  server plugin. Results are cached by viewport in memory so panning reuses a recent fetch, and the
  Open-Meteo responses, the RainViewer frame index, and the radar tiles are cached by the service
  worker for offline use. Layers beyond wind and waves are off on first open, themed for day, dusk,
  and night-red (a deep, low-brightness red on black at night, no blue; the radar raster is
  desaturated and dimmed).
- Wind draws as an animated WebGL particle field, the glanceable signature layer: thousands of
  particles stream through the forecast wind with fading trails, colored by speed (the day ramp, and
  a pure red-on-black ramp at night). It is a custom MapLibre layer running a GPU particle simulation
  over the forecast u/v, projected so pan and zoom only reproject the particles and the trails reset
  cleanly on a move. It falls back to the speed-colored arrow layer when WebGL is unavailable, and
  the animation runs only while the Wind layer is on.

- Approving Binnacle's Signal K access is now self-explanatory and recognizable. The request uses a
  named client id (`binnacle-<short>`) instead of a bare UUID, so it is easy to spot in the Signal K
  access-requests list, and the "Requesting access" banner shows that id plus a one-click "Approve in
  Signal K" shortcut that opens the admin access-requests page. A legacy bare-UUID client id is
  upgraded to the named form on load, keeping any existing token.

- Follow boat: a "Follow boat" item in the menu locks the chart to the vessel, recentering on each
  new position fix at your current zoom. It centers immediately when turned on, and a manual pan of
  the chart releases the lock (a scroll-zoom keeps it). It is off by default and does not persist
  across reloads. The one-shot "Center on boat" remains for a quick recenter that also zooms in when
  you are zoomed far out.

- A Layers panel and drag-to-reorder for every layer. The old inline "Layers" submenu is now a
  "Layers and charts" launcher that opens a left-docked slide-over listing every layer top of the map
  first, grouped into "Charts and Depth" and "Overlays" with the own vessel and active alarms pinned on
  top. Each row toggles, sets opacity, and drags (by pointer or keyboard) to restack the z-order, and
  the order persists across visits. The panel docks opposite the note detail so both can be open at
  once, and it themes for day, dusk, and night-red.

- Streaming depth charts. Four free hosted bathymetry and chart sources toggle on from the Charts
  and Depth section, off by default and cached as you pan: GEBCO global bathymetry, EMODnet (Europe), the
  NOAA ENC chart (US), and NOAA BlueTopo (US). They are reference overlays, not certified for
  navigation. A raster source cannot be recolored, so at night it is desaturated and dimmed (no blue,
  low brightness) rather than left full-color.

- Import your own charts. Add a PMTiles archive by URL or by dropping a file into a themed drop zone;
  Binnacle reads its name, bounds, zoom, and whether it is vector or raster, lists it under Charts
  and Depth as a normal reorderable layer, and stores an uploaded file in the browser for offline use. A
  per-chart detail view renames it, shows its metadata, and deletes it (stating the storage freed).
  Both vector and raster PMTiles render; full S-52 styling of converted ENC depth features is a later
  spec.

- Note detail panel: tapping a point of interest now opens a slide-in side panel with native,
  structured detail instead of a plain-text popup that bounced you to an external viewer. Binnacle
  consumes Crow's Nest's presentation-neutral `properties.crowsNest` sections from
  `/resources/notes/{id}`, rendering each item by kind (measures with units, availability badges,
  rating stars, flag toggles, links, and notes), and falls back cleanly to the plain-text
  description for any other notes provider or schema version. The marker icon now uses the
  explicit POI type when present, the structured values render as text with scheme-checked links
  (no HTML injection), and the panel is themed for day, dusk, and night-red and becomes a bottom
  sheet on a narrow screen.

- Tracks: Binnacle now records and shows where you have been. The active track is drawn behind the
  boat as you move, colored by speed (dark for slow, bright for fast) or a single solid color, and a
  break in the line marks a GPS dropout or a gap between sessions. The whole voyage is kept in the
  browser (IndexedDB) and reappears after a refresh. A "Tracks" submenu in the menu pauses and
  resumes recording, shows live voyage stats (distance, duration, and average and maximum speed),
  saves the current track to the Signal K server (`/resources/tracks` as GeoJSON), clears it, and
  toggles the color mode. Saved tracks list with show or hide on the chart, delete, and a GeoJSON
  export you can download. Track speeds are stored in SI (m/s) and converted to knots only at the
  display edge; the track layer is a normal layer, so it toggles and fades from the Layers submenu.

- Lookout collision thresholds are now editable (differentiator step 6). A "Collision thresholds"
  submenu in the menu sets the danger and warning CPA (nautical miles) and TCPA (minutes); changes
  apply live to the assessment and persist across visits, with a reset to defaults. Values are stored
  in SI and edited at the display edge in nm and minutes.

- Lookout publishes its collision alert to Signal K (differentiator step 5). When the assessment
  crosses a threshold, Binnacle writes `notifications.navigation.collision` over the streaming API
  (state alarm for danger, warn for warning, with the appropriate method) so other Signal K clients
  and devices share the alarm; it clears to normal when the risk passes. It is published only when
  the state or worst contact changes, not on every per-second tick.

- Lookout now sounds an audible collision alarm (differentiator step 4). When an AIS contact
  crosses the danger CPA/TCPA threshold, a repeating two-beep tone plays, synthesized with the Web
  Audio API so nothing is downloaded. Acknowledging the contact on the danger strip silences it, and
  a new or more severe contact re-arms it; a "Mute alarm" toggle in the menu turns sound off entirely
  and persists. The audio primes on your first interaction with the page (browsers block sound until
  a gesture). Warnings stay visual only.

- An app menu in the top bar gives app-wide options a home. It stays a single button until
  opened, then drops a themed popout, and closes on selection, Escape, or a click outside; the
  trigger is a labeled disclosure (aria-haspopup, aria-expanded, aria-controls). The menu is generic:
  it renders whatever action items it is given plus optional collapsible submenus, so adding an
  option is one `MenuItem` (or one `MenuSubmenu`) in the app shell, never a change to the menu
  itself. It hosts a "Center on boat" action that flies the map to the vessel and a "Layers"
  submenu.

- Binnacle now remembers your session across a page refresh. The map reopens at the last center and
  zoom, and each layer's visibility and opacity are restored, alongside the theme that was already
  persisted. The view is saved to local storage after panning settles (one write per gesture, not
  per frame), layer changes are saved as they happen, and a corrupt or out-of-range saved view is
  ignored in favor of the default world view.

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

- Whole-repo cleanup pass (six expert audit lanes, weather-weighted), no behavior change. One shared
  `emptyFeatureCollection` in `$shared/map` replaces the per-overlay copies (vessel, track, ais,
  notes, and weather), a shared `headingDegrees` helper folds the vessel and AIS heading fallback,
  the weather mini-map's viewport cache is now bounded, the wind overlay reports both its candidate
  layer ids so a rare WebGL fallback still restacks, the notes cluster click no longer double-fires,
  the radar opacity is one constant, and dead surface was removed (the unused `cellIndex` export, the
  unused weather `type` field and `weatherCacheKey` export, and a pass-through wrapper).

- Points of interest cluster later and say what they hold. Markers now uncluster from zoom 12 (up
  from 14), so the zoom you usually navigate at shows individual POIs instead of group circles, while
  the wider view (zoom 9 to 11) still clusters so it does not turn into a mash of overlapping pins. A
  cluster no longer reads as a generic purple circle: it shows the colored icon of its most important
  member (a red hazard disc if it holds any hazard, the amber navaid disc otherwise the point-of-
  interest disc), inside a ring that marks it as a group, with a count badge. Clicking a cluster still
  zooms it apart.

- Tidied the Signal K auth flow internals, with no behavior change. The focus and cross-tab
  storage listeners now live inside `AuthController` (like `OnlineStatus` owns its own listeners)
  instead of the app shell parsing the stored auth JSON itself, a single in-flight guard stops a
  duplicate access-request poll when a tab return fires focus and visibilitychange together, and
  the own-vessel and AIS subscriptions are issued in one call.

- Cleanup pass over the depth-charts work (audit, cross-verify, fix). The two IndexedDB stores now
  share one open-and-transaction helper; the unused PMTiles store list and total-size methods were
  dropped; byte-size formatting moved to a shared `formatBytes`; and a few small dead guards, a
  redundant array copy, and duplicated layer-id lists were tidied.

- Whole-repo cleanup pass (audit, cross-verify, fix). The collision assessment is memoized with
  `$derived`, so the O(targets) CPA loop runs once per real change instead of several times per
  frame (it was recomputed on every animation frame by the overlay and twice per alarm tick). CPA
  and TCPA display formatting is centralized in `shared/lib` (`formatCpaNm`, `formatTcpaMin`). The
  Signal K socket gates every handler on still being the current socket, so a superseded socket
  cannot inject a delta or schedule a second reconnect. POI classification is case-insensitive, the
  notes overlay skips per-frame work when the map is idle, the layers view updates one item in place
  instead of rebuilding the list on every slider tick, the menu submenu is tied to its content with
  `aria-controls`, and the empty-spec chart overlay no longer installs a dangling listener. Renamed
  `radiansToDegrees` to `radiansToBearing` (it normalizes to 0..360), exported `SELF_CONTEXT`, and
  added `nauticalMilesToMeters`. No behavior change beyond the perf and robustness fixes.

- Second whole-repo cleanup pass (audit, cross-verify, fix). The vessel, AIS, and collision
  entities now expose speed and course in SI (m/s and radians); knots and compass-bearing
  conversion moved to the display edge (the status strip, the vessel and AIS overlays, and a shared
  `formatKnots`), removing a knots-to-m/s and degrees-to-radians round-trip in the collision math.
  The worker hands the AIS batch to the main thread as a nested `Map` across the Comlink boundary,
  dropping a per-frame object rebuild on each side. The collision overlay dirty-checks the
  assessment by reference instead of building a per-frame signature string. Gap-splitting for track
  simplification and export is one shared `splitAtGaps` helper, the theme and settings localStorage
  writes are guarded against quota and private-mode failures, the menu-icon, connection-phase, and
  theme label maps are typed to their unions, and dead code (an unused `metersToNauticalMiles`
  export, a `LatLon` re-export, the entry-module default export, and a redundant callback wrapper)
  was removed.

- The layers controls (per-layer visibility and opacity) moved off the chart into the app menu.
  They were a panel floating over the top-left of the map; they now live in a collapsible "Layers"
  submenu inside the menu, so the chart is unobstructed and the controls share one place with other
  app options. Each layer's visibility and opacity still persist across refreshes.

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

### Fixed

- The weather mini-map no longer freezes blank when Rain radar is on. The RainViewer raster source
  starts with no frame URL (real frames arrive later), and MapLibre loads tiles for a layer in the
  style regardless of its visibility, so an empty tiles array crashed its tile-URL builder and then
  the raster render program, freezing the panel. The source now seeds a transparent placeholder tile
  so tile loading always succeeds, and the layer stays hidden until a real frame is applied so it is
  never drawn empty. Real frames replace the placeholder as before.

- Weather is gentler on the free data sources and correct over fresh water. The atmospheric forecast
  no longer forces Open-Meteo's sea cell selection, which picked wrong or missing cells over inland
  and freshwater areas such as the Great Lakes; sea selection now applies only to the marine wave
  request. A failed grid fetch backs off for a minute instead of retrying on every pan, the per-load
  grid is sampled to fewer points so a load fits a single request, and the viewport cache is capped.
  The "Here" conditions panel keys its lookups on a position rounded to about 110 meters, so GPS
  jitter no longer refetches (and no longer spams a Signal K weather provider with point requests) on
  every fix.

- The Forecast button is no longer clipped at the bottom of the status strip, and wind readouts show
  one decimal place (matching waves), even at zero.

- Signal K access approval now connects on its own. Previously, after you approved Binnacle in the
  Signal K UI and returned to the tab, it kept polling a stale request and only a second tab would
  connect. Binnacle now rechecks the pending request the moment the tab regains focus (background
  tabs throttle the poll timer), re-requests a fresh one if the old request expired, connects the
  stream reactively the instant access is granted (no reload), and adopts a token approved in another
  tab via the storage event. The old one-shot blocking connect that required a reload or a second tab
  is gone.

- A raster chart layer now follows the night-red theme (desaturated and dimmed) instead of staying
  full-saturation and full-brightness, matching the streaming depth layers.

- The track and PMTiles stores no longer lose records when IndexedDB degrades mid-session: every
  write is mirrored to the in-memory fallback, so data written before the failure survives.

- Switching the theme from night-red or dusk back to day no longer leaves the base map broken. The
  day restore brings the water and land fills back to their real colors and clears the dark label
  halo from street names. `fill-pattern` is a paint property in MapLibre, not a layout one, so the
  day-restore snapshot had silently dropped every fill layer, and the label halo was reset only when
  the source style already defined one.

- In the day theme, an unchecked layer checkbox no longer renders as a solid black square. The day
  theme declared a dark `color-scheme` despite being a light theme, so native controls rendered in
  dark mode; day now uses a light `color-scheme`, and checkboxes follow the theme accent (no blue at
  night).

- The base map now recolors fully for the theme. Previously only the background and water were
  themed, so over land at higher zoom the OpenFreeMap roads stayed white and the parks and landcover
  green even in night-red, breaking the pure-red-on-black contract. Every base layer is now recolored
  from its source layer (water, landcover, landuse, transportation, building, boundary, and text
  labels) per theme, fill patterns are cleared so the flat themed color shows, and label text gets a
  background-colored halo. Day and dusk gain a calmer palette consistent with the app; night-red is
  red-on-black across the whole map.

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
