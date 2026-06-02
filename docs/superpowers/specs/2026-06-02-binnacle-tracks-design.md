# Binnacle Differentiator: Tracks ("Where You've Been") Design

Status: approved. A differentiator spec after the completed foundation, auth, offline/PWA, and
Lookout. It follows the foundation design (`2026-05-31-binnacle-foundation-design.md`) and the
project rules in `CLAUDE.md`: Feature-Sliced Design with machine-enforced boundaries, modularity as
a drop-in rule, SI units in the store, offline-first, 100% Signal K conformance, and
night-watch-first theming.

## 1. Purpose

Show where the boat has been. Binnacle records the own-vessel position into a breadcrumb track,
draws it behind the boat colored by speed, persists it across a refresh, and lets the navigator save
a voyage to the Signal K server and manage saved tracks. It improves on the dedicated-plotter norm
(Garmin, Navionics, Raymarine, OpenCPN, Aqua Map, Freeboard) in four ways: speed-graded color with a
night-red-safe ramp, gap-aware rendering so a GPS dropout never draws a false straight line across
the chart, display simplification so a long voyage stays light, and persistence of the live trail
across a reload (the prior fork only handled server-saved tracks and lost the live trail on reload).

The feature is a self-contained module dropped in against the foundation's stable interfaces (the
`OwnVessel` entity, the `LayerManager`, the theme tokens, the menu framework, and the persisted
settings), never surgery on the core.

## 2. Decisions locked in this brainstorm

1. **Scope: live active track plus saved-track management.** A whole-voyage active track recorded
   on the client, plus save-to-server, a saved-track list (show, hide, delete), and multi-track
   rendering. GeoJSON export of the current track is folded in (the geometry already exists).
2. **Coloring: by speed over ground, with a solid toggle.** The track line is colored by SOG as a
   gradient with a small legend. Night-red uses a dark-to-bright red ramp, never a rainbow, to
   preserve dark adaptation. A toggle switches to a solid theme color; saved tracks render solid in
   distinct colors.
3. **Active-track lifecycle: whole voyage.** The active track accumulates the whole trip and
   persists across a refresh. Save names it to `/resources/tracks` and resets the active track;
   Clear discards it. The displayed line is simplified (Douglas-Peucker) so a long track stays
   light; the raw points stay in storage.
4. **Source: client-side recording.** No live trail is served by the Signal K server here
   (`/resources/tracks` is empty, there is no `self/track` endpoint), so Binnacle records the trail
   from the `navigation.position` stream it already consumes.
5. **Storage: IndexedDB for the active track.** A long voyage exceeds localStorage's practical
   budget, so the active track lives in IndexedDB. Settings (recording interval, min-distance, color
   mode) stay in the existing `PersistedValue` (localStorage). Saved tracks live on the Signal K
   server.

## 3. Architecture (Feature-Sliced)

Imports flow strictly downward, each slice exposes a public API via `index.ts`.

- `entities/track` (new). The domain. `TrackRecorder` watches `OwnVessel.position` and appends
  points on the recording policy; it owns the in-memory active-track state (a runes store) and reads
  and writes the active track through the storage port. Sits beside `vessel`, `collision`, and `ais`.
- `shared/storage` (new). A minimal IndexedDB wrapper (`openStore`, `get`, `put`), the only new
  infra. Node-guarded so it is inert in tests, with an injected seam like `PersistedValue`. Used by
  `entities/track` to persist the active track.
- `shared/settings`. Add `createTrackSettings` (a `PersistedValue<TrackSettings>`): recording
  interval seconds, min-distance meters, and color mode (`speed` or `solid`).
- `shared/map`. Add a `track` z-band to `ZBand` and `Z_ORDER`, placed above `bathymetry` and below
  `weather` so the trail draws over charts but under weather, routes, safety, traffic, and the
  vessel. Add `track`-band paint keys to `MapThemePaint` (a speed ramp and a solid track color).
- `features/track-layer` (new). The MapLibre overlay (an `OverlayModule` in the `track` band) that
  renders the active track and any shown saved tracks as per-segment line features, recolors via
  `applyTheme`, and toggles and dims through the `LayerManager`.
- `features/tracks` (new). The saved-track client (`/resources/tracks` fetch and save), GeoJSON
  build and export, and the Tracks controls panel (a `MenuSubmenu`).
- `app/App.svelte`. Wires the recorder, registers the track overlay, renders the Tracks submenu, and
  holds the track settings and saved-track list state.

## 4. Data model

A recorded point is `{ lat: number; lon: number; t: number; sog: number }`: decimal degrees (the
SI exception for position), an epoch milliseconds timestamp, and speed over ground in m/s (SI). A
break between two points (a gap) is represented by a sentinel so the renderer does not draw a
segment across it.

The active track is an ordered list of points held in a runes store and mirrored to IndexedDB. The
store exposes the points, the running stats (distance meters, duration seconds, average and maximum
SOG), and a paused flag.

## 5. Recording

`TrackRecorder` runs on the main thread, driven by an `$effect` on `OwnVessel.position` (which
updates about once per second from the existing subscription). It appends a point only when both the
time since the last point is at least the interval (default 10 s) and the distance moved is at least
the min-distance (default 10 m). The min-distance doubles as a min-move threshold, so the track does
not pile up points at anchor. If the time since the last fix exceeds a gap threshold (default 5
minutes) or the jump is implausibly large, the next point starts a new segment (a break), so a GPS
dropout or a reconnect does not draw a straight line across the chart. Recording can be paused and
resumed; while paused, no points are appended and the next resumed point starts a break.

Each appended point is written to IndexedDB. On load, the recorder restores the active track from
IndexedDB so the trail survives a refresh.

## 6. Rendering

The track overlay builds **per-segment LineString features**: each consecutive pair of points that
is not separated by a break becomes a two-point feature carrying a `sog` property. A MapLibre line
layer colors them with a data-driven `line-color` interpolated over `sog` (speed mode) or a constant
(solid mode). Per-segment features are chosen over a single `line-gradient` because they map cleanly
to per-point speed, make the solid toggle trivial, and make gaps natural (a break simply emits no
segment). The displayed point set is simplified with Douglas-Peucker to a bounded segment budget so
a long voyage stays light; the raw points remain in storage and in any saved or exported track.

The speed ramp and the solid color are theme tokens, recolored through the overlay's `applyTheme`.
Night-red uses a dark-to-bright red ramp so the brightest pixel stays low and no blue or green
appears. A small speed legend is shown when speed mode is active. Saved tracks render with the same
per-segment machinery in solid distinct colors (their stored geometry carries no per-point speed).

## 7. Saved tracks

Saved tracks are Signal K `/resources/tracks` resources (GeoJSON). The client fetches them with
`GET /signalk/v2/api/resources/tracks` (falling back to v1), branching on the keyed-object response
the resources API returns. Save writes the active track as a named track with
`PUT /signalk/v2/api/resources/tracks/{uuid}`, a GeoJSON `Feature` with a `MultiLineString` geometry
(one line per segment) and properties for the name, the distance, the timestamps, and the source
(`binnacle`). On a successful save, the active track resets and a new one begins. The saved-track
list (show, hide, delete via `DELETE`) lives in the Tracks submenu; shown saved tracks render in the
track band. Delete and save guard on auth and degrade cleanly when the resources provider rejects
the write. Export writes the current active track as a GeoJSON file via a client-side download.

## 8. Controls and UI

A **Tracks** `MenuSubmenu` (reusing the menu framework and the `MenuSubmenu` component) holds:
Pause and Resume recording, Save voyage, Clear, a speed-or-solid color toggle, the current-voyage
stats (distance, duration, average and maximum SOG), an Export action, and the saved-track list with
per-track show, hide, and delete. The active track is also a layer toggle and opacity slider in the
Layers submenu, like the other overlays. The speed legend renders near the chart edge when speed
mode is on.

## 9. Persistence and settings

The active track persists in IndexedDB and is restored on load. `TrackSettings` (recording interval,
min-distance, color mode) persist in `localStorage` through `PersistedValue`. Saved tracks live on
the Signal K server. Nothing about tracks is cached by the service worker beyond the app shell.

## 10. Signal K conformance

Tracks consume the existing `navigation.position` subscription, no new high-rate subscription is
added. Saved tracks use the standard `/resources/tracks` resources API with the GeoJSON shape the
spec defines. Position stays decimal degrees, SOG stays SI (m/s) in storage and converts to knots
only at the display edge (the stats readout and the legend), through `shared/lib`.

## 11. Error handling

A missing own position simply records nothing. IndexedDB being unavailable (private mode, quota)
degrades to an in-memory-only active track with a one-time console warning, never a crash. A failed
fetch or save of saved tracks surfaces a non-fatal message and leaves the active track intact. A
corrupt persisted track is discarded in favor of an empty active track. The overlay guards every
MapLibre call so a missing layer or source cannot throw.

## 12. Testing

Unit tests: the recorder policy (interval, min-distance, min-move at anchor, gap and break
detection), the Douglas-Peucker simplifier, the per-segment GeoJSON build (including breaks), the
stats computation, the saved-track client (fetch shape, save body, error paths), and the speed-to-
color ramp. Overlay tests: add, remove, applyTheme, and that shown saved tracks add their layers.
The IndexedDB wrapper is exercised behind its injected seam. Live verification on the boat: record
while moving, confirm the speed coloring and a gap break, save a voyage and see it in the list,
reload and confirm the active track persists.

## 13. Build order

1. `shared/storage` IndexedDB wrapper plus `shared/settings` track settings and the `track` z-band
   and paint keys.
2. `entities/track`: the point model, the recorder policy, the active-track store, and persistence.
3. `features/track-layer`: the per-segment overlay, speed and solid coloring, simplification, and
   theming.
4. `features/tracks`: the saved-track client, save, list, delete, and export, plus the Tracks
   submenu and the speed legend.
5. App wiring, the Layers-submenu toggle, and live verification.

Each step ends with the cleanup gate and one heavy verification at a time, per the build policy.

## 14. Deferred (own later specs)

Color-by-depth and other variables, converting a track to a route, importing GPX, automatic
trip detection and logbook entries, and sharing or syncing tracks across devices beyond what the
Signal K server already provides.
