# Changelog

All notable changes to Binnacle are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Profiles: named bundles of your settings (theme, which layers are on, their opacity and order, the
  weather layers, the collision thresholds, the track and planning settings, and the alarm mutes) that
  you save, switch between, rename, delete, and set a default for. A switcher pill in the top bar shows
  the active profile and opens a Profiles panel; applying a profile updates the chart live, and tweaking
  a setting marks the profile as edited so you can save the change or discard it by switching away.
  Three starter profiles (Coastal day, Night passage, and At anchor) seed on first run. Profiles are
  stored locally, and when you are logged in to a secured SignalK server they also sync through the
  server's applicationData store so they follow you across devices. The sync degrades cleanly: an
  unsecured server, or a login that cannot use the applicationData store, keeps profiles local, and a
  login that can read the store but not write it stops after one rejected write rather than retrying on
  every edit, so it never floods the console. You can also export a profile to a JSON file and import
  profiles from one, to back them up or share them between boats.

- Course planning on the chart. Long-press (touch) or right-click (desktop) a point and choose "Go to
  here" to navigate straight to it via the Course API, with the destination shown on the nav strip.
- Route interchange via GPX. Export any saved route to a GPX file other plotters, MFDs, and
  Freeboard-SK read, and import routes from a GPX file back into Binnacle, closing the round trip.
- Passage planning in the route editor. A persisted plan speed turns the leg table into a passage
  plan, showing the cumulative time to reach each waypoint and a whole-route Time alongside the
  distance, plus a per-leg distance and bearing table that updates live as waypoints are dragged.
- Track-to-route workflows. Save the current track as a reusable route, reverse a saved route for the
  return leg, navigate home by retracing the current track, and skip the active route's waypoint
  forward or back from the nav strip. The nav strip also shows the whole-route distance and arrival
  time when a multi-leg route is active.
- A minimize control on the Routes panel. On a phone the panel is a bottom sheet that covers the chart,
  so a chevron in the header collapses it to just the header bar while it stays open, freeing the chart
  to tap waypoints into a route. The control only appears at phone widths.

### Changed

- The Layers panel now leads with "My routes and tracks" above "Traffic and live data". The panel
  order is kept aligned with the map stack so drag-to-reorder lands coherently, so this also raises
  the routes and track layers above AIS and the reference overlays on the chart; the own vessel and
  the collision rings stay pinned on top.
- The Tracks panel now renders saved tracks as the same elevated cards as the Routes panel, each
  showing the track's distance and duration, and the current-track stats line was tightened to a
  label, value, and unit grid that removes the trailing whitespace and aligns the values in a column.
- At night-red, the base map's pre-colored sprite icons (road and transit shields, aerodrome marks)
  are now hidden along with the POI dots, so the chart stays pure red on black with no stray blue,
  green, or white icons. The text labels stay visible.
- The route line, the note selection ring, and the AIS target triangles gained a dark casing or halo,
  so they keep their bright color but no longer sit low-contrast against the light day water. The
  casing is invisible on the dark dusk and night-red maps, where the bright shape reads on its own.

### Internal

- A /simplify pass over the last day's changes: each new overlay slice (seamarks, protected areas,
  boundaries, ocean conditions) now exposes a band-owning factory, so the chart widget no longer
  hardcodes which map band each draws into (matching the depth-charts sibling). Deduplicated the
  chart zoom-range expression and the tides upcoming-events computation, moved the station-distance
  formatter into the tides display module, and tidied a handful of comments.
- A /simplify pass over the plotter and UI changes: the saved-item card list moved to one global
  `.saved` system in `app.css` consumed by both panels, a shared `downloadBlob` helper backs the
  track and route exporters, the GPX escape and unescape pair moved to one `xml-entities` module, the
  distance-over-speed time uses the shared `etaSeconds` everywhere, the meters-per-degree constant is
  shared from `$shared/nav`, the nav-strip `RouteProgress` type has one definition, the plan-speed
  field uses the shared `.input`, and the whole-route distance derives from the leg table so the total
  and the per-leg numbers cannot drift.
- A /simplify pass over the contrast work: the route, selection-ring, and AIS dark contrast aids share
  one `DARK_SCRIM` constant and an `rgbaCss` helper in `$shared/map` instead of three drifting literals,
  and the SlideOver minimize takes one `{ collapsed, onToggle }` object so the state and its toggle are
  always supplied together.
- A /simplify pass over the profiles feature: the active-card accent edge-bar and "Active" badge moved
  to the one global `.saved` system in `app.css` consumed by the Routes, Tracks, and Profiles panels, a
  shared `pickTextFile` helper in `$shared/ui` backs both the route GPX import and the profile JSON
  import instead of two hidden-input handlers, the profile importer validates the theme against the
  shared `THEMES` list, and the default profile now auto-applies on a fresh device that has a default
  but no active profile. The server sync also stops pushing after one rejected write, so a read-only
  token attaches for reads but does not fire a doomed write on every later edit.

## [0.2.1] - 2026-06-09

### Fixed

- Points of interest (Crow's Nest and ActiveCaptain) no longer flicker. A slow or rate-limited
  provider response made the markers vanish and reappear, because a failed fetch was treated as
  "no POIs" and cleared them. A failed fetch now keeps the markers on screen, and the overlay
  caches fetched sets by area, so panning back, panning a little, or zooming in reuses a recent
  fetch instead of re-hitting the network.
- Active marine warnings (gale, storm, and small-craft advisories) no longer flicker off the
  conditions panel when a weather-provider request transiently fails: the last warnings are kept
  until a real update replaces them.
- An active route's guidance (the nav strip, arrival circle, and auto-advance) no longer freezes on
  stale values after a stream reconnect. The v2 course data is re-hydrated on reconnect, since
  resubscribing cannot redeliver it under subscribe=none, and the route list is refreshed too.
- Server charts no longer blank on a transient failure at map load: the fetch now distinguishes a
  failed request from a reachable server with no charts, matching routes and points of interest.
- Imported-chart storage is reclaimed at startup: a PMTiles blob left behind by a failed save or a
  delete that ran while storage was degraded is now swept once its descriptor is gone, so orphaned
  blobs cannot accumulate on disk.
- The Points-of-interest layer no longer fetches from the provider or re-clusters while it is toggled
  off: a hidden layer now does no network or rendering work until it is shown again.
- Silenced a stream of "styleimagemissing" console warnings: the base map style references a few
  sprite icons and landuse patterns its published sprite does not contain, so a transparent
  placeholder is supplied for each. The map is unaffected; the console stays clean.

### Internal

- Bounded two more caches to a fixed size: the note-detail memo, and the persistent weather-grid
  store (now matching its in-memory tier).
- A whole-codebase cleanup pass (six-lane audit): deduplicated the local-date computation shared by
  the tides fetch window and its session-cache key, sourced the vessel and AIS default colors from
  the day theme token, dropped over-broad slice exports, reset the stream reconnect backoff on an
  explicit disconnect, and tidied several comments, an accessibility region, and a redundant live
  region. No user-facing behavior change beyond the fixes above.

## [0.2.0] - 2026-06-08

### Added

- A Tides panel (US waters), opened from the app menu, showing the nearest NOAA tide station's next
  high and low with heights in meters and feet, a 48-hour tide curve with a "now" marker, and the
  nearest tidal-current station's next flood or ebb with its rate and set. The nearest tide and
  current stations are also markable on the chart from the Layers panel. It degrades to a clear
  message outside US coverage, and the data is cached for the session.
- New built-in chart overlays, all free, key-free, and verified against the live services. Each
  starts hidden, toggles from the Layers panel, and carries its source attribution:
  - OpenSeaMap seamarks: a global overlay of navigation aids (buoys, beacons, lights, and harbors).
  - Marine protected areas: EMODnet protected areas with Natura 2000 nested under them (EU), and the
    NOAA MPA Inventory (US).
  - Maritime boundaries: the inter-country jurisdiction lines and the territorial sea (12 nm), so you
    can see when a passage crosses into another country's waters.
  - Ocean conditions: NASA GIBS sea-surface temperature and sea ice concentration (global, daily),
    which appear in a new Ocean conditions section of the Layers panel and default to translucent.
- A review step when importing a chart: after the file or URL is read, you can rename it and check
  its type, zoom range, and size before saving, instead of it saving immediately.
- URL-based imported charts now register on the Signal K server as a chart resource, so other
  devices on the same server discover them, and deleting the chart removes the server resource too.
  The chart stays manageable locally (a synced chart is shown once, not twice). File-based imports
  stay on the importing device, since a stock server cannot host the file bytes.

### Changed

- The Layers panel is reorganized into collapsible categories (Traffic and live data, Navigation
  aids, Areas and boundaries, My routes and tracks, Ocean conditions, and Charts and depth), each
  with a row count, so a long flat list reads as a few sections. The two most-used categories open by
  default and the rest collapse to cut clutter; each category remembers whether you left it open or
  closed. Per-layer toggles, opacity, the facet-group cards, and drag-to-reorder are unchanged.
- A better default chart order: the US NOAA ENC nautical chart leads, then US BlueTopo bathymetry,
  then EMODnet (Europe), then GEBCO (global), so the most detailed free coverage is on top. You can
  still drag any layer to reorder it.
- Cleaner, consistent layer names: sentence case throughout, plural for collection layers (Track is
  now Tracks), and a unified "source, type, region" format for the single-layer bathymetry overlays
  (for example "GEBCO bathymetry (global)"). The weather "Cloud cover" layer is now "Cloud" to match
  the other single-word weather layers.
- A denser, more consistent app menu and Layers panel: list rows use a compact row size while action
  buttons keep the larger touch target, the opacity sliders sit in shorter rows, and the gaps are
  snapped to one spacing scale, so more layers and menu items fit without scrolling.
- Three depth sources now present as labeled groups in the Layers panel, each with a base facet and a
  nested survey-quality facet: "NOAA ENC (US)" (Base chart, Data quality (ZOC)), "EMODnet (Europe)"
  (Bathymetry, Quality index), and "BlueTopo (US)" (Bathymetry, Uncertainty). The quality facets show
  how reliable each cell is: ZOC zones for the ENC, EMODnet's combined quality index, and BlueTopo's
  per-cell vertical uncertainty. Within a group the facet toggles are aligned in one column, a single
  drag handle and opacity slider serve the whole group, and the quality facet only enables while the
  base facet is on (turning the base off hides it). A generic sub-layer grouping mechanism backs this,
  so any future multi-facet chart can group its facets the same way.

### Fixed

- Deleting a user-imported chart now actually removes it. The layer row, the map overlay, and the
  stored descriptor were all left in place because the delete handler read the chart id after the
  panel had already cleared its selection, so the removal threw and never ran.
- A chart imported while a dark theme (dusk or night-red) is active now takes the theme immediately,
  instead of staying in day colors until the next theme change. Overlays registered after the first
  recolor are now themed at registration.
- The nearest tide and tidal-current readings no longer briefly go stale around local midnight: the
  session cache now rolls over on the same local day the NOAA forecast window uses, rather than on
  the UTC day.

### Internal

- A whole-codebase cleanup pass: named the shared millisecond constants once (MINUTE_MS, HOUR_MS,
  DAY_MS), added a placeholder-aware nautical-miles readout, deduplicated the base-theme style
  lookups, removed a dead weather-provider field and an empty re-export shim, tightened the
  storage and chart-adapter export surface, and aligned the route and wave overlay label font and
  arrow color with the other overlays. No user-facing behavior change beyond the fixes above.

## [0.1.3] - 2026-06-08

### Added

- A fully keyboard-navigable app menu: arrow keys move between items, Home and End jump to the ends,
  and it follows the WAI-ARIA menu pattern with grouped sections (Navigation and Alarms), roving
  focus, and announced toggle states.
- Reduced-motion support: when the system prefers reduced motion, the chart's center-on-boat,
  fly-to, and fit-to-bounds camera moves jump instantly instead of animating.
- An opt-in NOAA ENC data-quality overlay. The NOAA ENC chart is now one clean chart layer plus a
  separate, default-hidden "data quality" layer carrying the Zones of Confidence (CATZOC) ratings,
  so the chart no longer always paints the data-quality triangles and overscale patterns on top.
- One-tap alarm muting from the danger strip, a muted-alarm badge in the top bar, and a spoken
  collision summary written to a live region for assistive technology.
- Motion and depth across the interface: the slide-over panels, the app menu, and the weather panel
  now reveal with a short reduced-motion-aware transition, the theme toggle animates its icon on each
  cycle, and the panels and menu carry a layered shadow. A more confident day palette and a larger
  instrument-readout type tier make the hero numbers (SOG, the nav metrics, the conditions) dominate
  their labels.

### Changed

- Bearings are now labeled true (123 degrees T) on the COG, BTW, and wind readouts, time-to-go shows
  hours and minutes past an hour (2h 05m) instead of a bare minute count, and the collision strip and
  its spoken summary are graded danger versus caution by the worst contact rather than always
  sounding full danger.
- The design system was consolidated from a six-lens UI review: one shared lit-toggle, input, slider,
  and button-row vocabulary replaces the per-component copies, the danger and nav strips now stack
  instead of overlapping so course guidance survives a close-quarters contact, and the danger strip
  stays above the weather panel so Mute and Acknowledge are always reachable.

- The app menu is redesigned. Tracks, Routes, and Layers are now edge-docked slide-over panels
  promoted from inline accordions, each with a back-to-menu button so you can move between panels
  without reopening the menu, and the menu groups its items under section headers.
- Center, Follow, and Forecast now sit together in the bottom status strip as three matching labeled
  pill buttons, in that order. Follow and Forecast show a clear lit on-state, kept dim enough for
  night-red.
- A whole-codebase cleanup pass with no change to behavior beyond the fixes below: the Signal K
  frame pipeline hands the per-frame value map straight to the store instead of rebuilding it each
  frame, the active-route readouts compute each leg's geometry once per change rather than several
  times per render, the Layers drag measures row positions once at drag start instead of on every
  pointer move, and duplicated formatting, geometry, WMS, and map-image helpers were consolidated.

### Fixed

- The bottom status strip no longer overlaps or wraps unevenly on a phone. It stacks into a clean
  layout: the live readouts above, and the Center, Follow, and Forecast controls on one row below.
- The Tracks panel's statistics now align in a single value column.
- The collision danger strip no longer double-announces to screen readers. The app keeps a single
  concise spoken summary of the danger, and the on-screen contact list is now a silent visual
  landmark, so assistive technology reads the danger once instead of twice.
- The animated wind field now honors the system reduced-motion preference, falling back to the static
  wind arrows instead of running a continuous particle animation.
- The active-route strip no longer re-reads its whole readout line to a screen reader every second;
  only the destination name announces, when a waypoint advances.
- On a phone the note detail and a leading panel no longer overlap as stacked bottom sheets (they are
  mutually exclusive at narrow widths), the brand drops its version string so the top-bar controls
  keep room, and the weather "Here" conditions open as a full-width sheet rather than covering the
  small map.
- Form inputs theme their placeholder text, the day caution color is darker for contrast and is
  clearly distinct from the alarm red, and the Forecast control exposes its dialog to assistive tech.

## [0.1.2] - 2026-06-05

### Fixed

- Importing a chart now flies the map to the chart's bounds, so a PMTiles archive (by file or URL)
  is immediately visible instead of staying off-screen when it covers a different area than the
  current view. Previously the chart was added to the Layers panel but the map did not move, so it
  looked like nothing happened. (A new fitBounds map command, fired only on a user import, never on
  the charts restored at startup.)

### Changed

- The layer-toggle checkbox no longer shrinks when a layer name is long: it stays square (the name
  ellipsizes instead).

## [0.1.1] - 2026-06-05

### Changed

- App Store polish, reviewed against the Signal K AppStore publishing doc. The appIcon is now
  256x256 (the previous 72x72 was below the documented 128x128 minimum). The README is scannable,
  since the server's Webapps view renders it: the screenshots gallery that showed as raw HTML there
  is removed (the screenshots stay in `signalk.screenshots` for the App Store detail page), and the
  duplicate feature inventory is collapsed into one concise list. The title is now "WebGL chart
  plotter for Signal K" across the README, the PWA manifest, and the repository description.

## [0.1.0] - 2026-06-05

### Added

- Routes: plan a passage and follow it. Open Routes from the menu, draw a route on the chart (tap to
  add waypoints, drag a point to move it, tap a midpoint to insert one), and watch the leg count and
  total distance update live as you draw. Save it to the Signal K server (`/resources/routes` as a
  GeoJSON LineString), and it syncs to every device and lists with show or hide, edit, activate, and
  delete. Activating a route hands it to the Signal K v2 Course API, and a nav strip shows the active
  waypoint, cross-track error with a steer-left or steer-right side, distance and bearing to the
  waypoint, velocity made good, and time to go, with an arrival alarm at the arrival circle. The
  guidance prefers the server's course calculations and computes them on the client when the
  course-provider plugin is absent (a "computing locally" badge says when), the same graceful
  degrade as the collision CPA. A failed save keeps the route under edit so nothing is lost, and the
  on-chart editing line is themed for day, dusk, and night-red. Route editing uses Terra Draw.

- The weather forecast is cached in IndexedDB, so it survives a reload and a return to a recent view
  reuses it instead of re-fetching. Unlike the service-worker cache, which browsers expose only in a
  secure context, IndexedDB works over plain HTTP, so this is the offline-leaning weather cache for
  the many users without SSL. Each grid is stored with a one-hour expiry, expiries are kept apart from
  the grids so pruning never loads them, and the store degrades to memory and never throws when
  IndexedDB is unavailable. Verified over https: after a reload, opening the forecast served the grid
  from IndexedDB with zero Open-Meteo requests.

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

- A final whole-codebase cleanup (six audit lanes) before the 0.1.0 release, no feature change. The
  panel, button, icon, label, and instrument-strip styling moved into shared `app.css` utilities
  (`.icon-btn` with accent and danger modifiers, `.btn-ghost`, `.btn-pill`, a shared bottom-strip
  metrics row, a `.caps-label` for the uppercase section labels, and a 4px-based `--space-*` spacing
  scale for the common padding, gap, and margin values): the Routes panel now renders the same
  slide-over shell as the Layers and note panels instead of having the app shell hand-roll its dock
  chrome, every panel header reads the shared `.panel-title`, and the row-action icon buttons and
  ghost buttons stop being re-declared per component. The Signal K
  resource clients (routes, charts, tracks, and course) now share one `fetchKeyedResource` plus
  `putResource` and `deleteResource` instead of three copies of the v2-then-v1 fetch and five copies
  of the PUT and DELETE wrapper; the three IndexedDB stores share one `openIdbDatabase` opener and one
  `degradeToMemory` policy; the weather grid blends through the shared `lerp`; user-chart ids and the
  save-name prompt use shared helpers; the store iterates own keys with `Object.entries`; the
  longitude-delta normalize is total over any input; and the unused `routeLegs` was removed.

- The Signal K webapp manifest is complete for the App Store and the 0.1.0 release: five screenshots
  (the chart with AIS, route planning, charts and depth, an anchorage point-of-interest detail, and
  the weather mini-map) and a "Works well with" list (Crow's Nest for the points of interest Binnacle
  renders, signalk-ssl for the HTTPS its offline cache needs, and signalk-virtual-weather-sensors as a
  weather provider it reads). A cross-platform webapp CI builds, tests, and packs on Linux, macOS, and
  Windows on Node 22 and 24, and a release publishes to npm with a provenance attestation.

- A five-lens UI review (design tokens, layout, typography, accessibility, and SignalK marine HMI)
  brought the whole interface to one standard. New tokens defined for all three themes (a large
  radius, a shared hover and press timing, a caution-tier warning color, and an alarm tint) replace
  the values components used to hand-code. Panel titles are consistent headings, the numeric readouts
  share the mono instrument font, the bottom-strip titles match the panel title scale, and the
  night-red border is deepened so panels stay separated where the shadow is dropped. The on-chart
  route editing color now reads the one map-theme source instead of a duplicated table. The four
  slide-over and overlay panels share one dismiss behavior (Escape closes the topmost, and focus
  returns to the control that opened it).

- Routing cleanup pass (four expert audit lanes: geodesy and the route domain, course guidance and
  the resource clients, the overlay, editor, and chart wiring, and the routing UI and app wiring), no
  feature change. The Earth-radius constant and the antimeridian longitude-delta normalize are now
  shared by the rhumb-line geometry and the collision CPA projection instead of duplicated, a
  `steerSide` helper centralizes the port-versus-starboard cross-track convention, a `clientId` helper
  folds the two copies of the secure-context id fallback, and the route distance no longer allocates a
  leg array just to sum it. Stopping an active course now clears every course cell, where before it
  left the previous point, the active route, and the arrival circle stale, and the seeding and
  clearing of those cells moved onto the course entity that owns them. Dead route-editor methods and a
  redundant overlay visibility flag were removed. Tests went from 412 to 415.

- The weather mini-map opens centered on the navigation chart's current view, so the forecast is for
  the area you are looking at, rather than reopening at its own last position. The zoom is still capped
  to the mini-map's maximum so weather never zooms past its data resolution.

- Second whole-repo cleanup pass (six expert audit lanes: weather, the Signal K data layer, map and
  charts, notes and tracks, safety and chrome, and app and build infrastructure), no feature change.
  The wind particle field caches its GPU uniform and attribute locations once at setup instead of
  re-querying them every frame, the layer manager applies the stacking order once per batch when the
  chart and overlays first load rather than restacking after each of a dozen-plus registrations, and
  shared helpers fold repeated logic: a `DEG_TO_RAD` constant for hot numeric loops, an `HOUR_MS`
  constant, an `applyRasterTheme` for the night-red raster treatment shared by the chart, depth, and
  radar layers, an `asKeyedObject` guard shared by the chart, note, track, and weather resource
  clients, a `toLonLat` mapper for the track coordinate builders, and one `RAIN_VISIBLE_MM_H`
  threshold. Dead Signal K path constants were removed.

- A new app build now surfaces an Update control instead of silently reloading. The progressive web
  app uses prompt registration rather than auto-update, so a fresh build never reloads the chart out
  from under you mid-passage; the Update control lets the navigator choose when to apply it.

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

- The active-route Stop button and the collision-alarm Acknowledge button on the bottom strips were
  inert. When both strips moved to the shared `.bottom-strip` class, the app shell's `pointer-events`
  override still targeted their old `.nav-strip` and `.danger-strip` selectors, so each slot's
  `pointer-events: none` reached the button. The override now targets `.bottom-strip`, restoring both
  safety-critical actions.

- Night-red contract violations the UI review found are corrected: the AIS target was orange (it is
  now in the red band, with a test guarding it), and the rain-radar legend showed literal blue and
  green chips at night (now a red intensity ramp). The collision warning severity and an empty track's
  stats are no longer misleading (a distinct warning color in the danger strip and the thresholds, and
  a placeholder instead of a zero), and the weather panel no longer renders with square corners
  because a referenced radius token was undefined.

- Accessibility fixes from the UI review: the slide-over panels close on Escape and restore focus, the
  layer visibility checkboxes and the threshold inputs have explicit names, the note-detail and
  weather conditions async states announce as status or alert, the add-chart URL field is labeled, the
  chart rename commits on Enter, the layer-reorder handle advertises its arrow-key shortcut, and the
  menu popout uses dvh so a long menu stays reachable on a phone.

- Saving a route now works. The Signal K server validates the standard route resource, and two
  things failed that validation silently: an unnamed waypoint wrote an empty metadata entry the
  schema rejects (every entry must carry a name), and over plain HTTP the route id fell back to a
  non-UUID string that the resources API refuses for standard types. Routes now omit per-waypoint
  metadata when no waypoint is named (and name the gaps by position otherwise), and route and track
  ids are always real v4 UUIDs, generated from `crypto.getRandomValues` where `crypto.randomUUID` is
  unavailable. Verified end to end against the server: a drawn, unnamed route now saves, lists, and
  survives a reload.

- The on-chart route editing line is easier to see and the Routes controls read as actions. The
  editing line was a blue that blended into the water; it now uses the bright selection accent (amber
  by day, a light red at night) and a heavier stroke, and the New route and Save buttons are filled
  with the accent instead of flat gray. Each saved route now sits in its own elevated card: the name
  is a title on its own line, a mono distance and waypoint-count readout sits beneath it in the same
  instrument style as the navigation strip, the actions form a clean cluster with the delete pushed to
  the trailing edge, and the active route is marked with an accent edge bar, an accent tint, and an
  "Active" pill so the live route is obvious at a glance in every theme.

- In the menu, Routes now sits above Layers and charts.

- A vector chart that declares a coverage extent now honors it. The raster chart paths already passed
  the declared `bounds` to MapLibre, but the vector path dropped it, so a regional vector chart
  requested and 404'd tiles across the whole world instead of only within its coverage. The vector
  source now carries `bounds` the same way the raster sources do.

- A provider-supplied collision contact is now gated the same as a locally computed one at the exact
  instant of closest approach. The provider branch treated a TCPA of zero (closest approach right now)
  as a live danger while the computed branch treated the same geometry as no longer closing; both now
  require a positive TCPA, so the two CPA sources agree and a just-passed contact cannot flicker as a
  danger from one source but not the other.

- Weather values now read consistently to one decimal. The legend low and high labels and the wave
  period readout previously mixed bare integers ("0", "9") with decimals ("0.0", "0.5"); wind, waves,
  precipitation, and cloud now all show one decimal place ("X.X"). Bearing, pressure, and temperature
  stay whole numbers, as those units are conventionally integers.

- Weather caching now fits the data. Forecasts are cached for an hour rather than 30 minutes (Open-Meteo
  model runs are hours apart, and the time slider already shows the right hour from the cached 5-day
  window), roughly halving request volume. When only the marine (waves) endpoint fails, commonly an
  Open-Meteo 429 on its separate host, the forecast grid (wind and pressure) is still shown but is not
  cached and the loader backs off, so panning no longer re-hits the rate-limited endpoint on every move.

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
