# Binnacle routing: route planning and active-navigation following (design)

Date: 2026-06-04
Status: approved for planning
Differentiator: weather and routing (the routing half, near-term piece)

## 1. Scope and goals

This spec is the first of two routing sub-projects:

- (a) THIS SPEC: manual route planning plus active-navigation following, display only.
- (b) LATER SPEC: weather and optimal routing (polars, isochrones, currents, and tides).

In scope here:

- Create, edit, rename, delete, show, and hide routes, stored as Signal K resources so they
  sync across every device on the boat.
- Interactive route and waypoint editing on the chart (tap to add a waypoint, drag a vertex, tap
  a midpoint to insert one, delete a vertex).
- Live planning math per leg and for the whole route: distance, bearing, and an ETA preview.
- Activate a route through the Signal K v2 Course API.
- While following, display the active waypoint, cross-track error (XTE), distance and bearing to
  the next waypoint (DTW and BTW), velocity made good (VMG), time to go, and estimated time of
  arrival (ETA), with an arrival alarm at the arrival circle.

Explicitly out of scope (see section 9): autopilot handoff, weather and optimal routing, route
optimization, laylines, GPX import and export, and a single-destination "go to" mode (a natural
fast-follow, noted but not built here).

Design center: the offshore watch and the coastal hop. The plotter plans and follows a route with
honest live guidance and a clear arrival alarm, on modest helm hardware, and it keeps working when
the network or an optional server component is absent.

## 2. Decision: Approach C (server-canonical, client-side fallback)

The active-navigation numbers come from the Signal K server's Course API when available, and from a
small client-side geodesy module when not. Concretely:

- The Course API state machine (the active route, the next and previous points, the arrival circle)
  is BUILT INTO the Signal K server core, so it is reliably present on any server 2.x. Binnacle
  reads it as the source of truth and stays in sync with the autopilot and every other app on the
  boat. Source: github.com/SignalK/signalk-server `src/api/course/index.ts`.
- The derived calculations (XTE, VMG, DTW, BTW, ETA) are produced by a SEPARATE course-provider
  plugin that ships with a standard server install but can be absent, disabled, or return null.
  Source: github.com/SignalK/course-provider-plugin; demo.signalk.org Course_Providers docs.
- Therefore the fallback is narrow and common: when a calc value is missing, compute it client-side
  from the core-provided leg endpoints plus own position, SOG, and COG. This mirrors Binnacle's
  existing "read `navigation.closestApproach` when present, degrade gracefully when absent" stance.
- Planning math (per-leg distance and bearing, totals, ETA preview) is always client-side, because
  it is needed before any route is activated, and that same module is the calc-value fallback.

Rejected alternatives: a thin client that assumes the Course API and breaks without it (not robust
across the real fleet of servers), and a fully self-contained client that reinvents the nav math and
never shares the active route with the autopilot (breaks the Signal K single-spine thesis).

## 3. Architecture (Feature-Sliced Design)

Routing drops in as new slices against stable interfaces. The map already reserves a `routes`
z-band (`src/shared/map/types.ts`), the resource read and write pattern exists (`tracks-client`),
and the worker, store, and subscription registry already carry per-path SI values. No core surgery.

Imports flow downward only; cross-slice data flows through entities, never feature to feature.

- `shared/nav` (extend): pure geodesy, test-first. Rhumb-line distance and bearing, great-circle
  bearing (great-circle distance reuses `haversineMeters`), cross-track error, VMG, and ETA from
  speed. SI in and out. Reuses `DEG_TO_RAD` (`src/shared/lib/units.ts`), the equirectangular
  projection style and antimeridian normalization in `cpa.ts`, and the clockwise-from-north course
  convention (east is `sog*sin(cog)`, north is `sog*cos(cog)`).
- `entities/route`: the domain model. `Waypoint`, `Route`, and derived `RouteLeg` types, plus a
  reactive store holding the loaded routes, the shown subset, the working (under-edit) route, and
  the active route reference. Pure domain, no I/O.
- `entities/course`: a single, source-agnostic guidance view of the active-following state. Fields:
  `source` (`server` or `computed`), the active leg (from core `nextPoint` and `previousPoint`),
  XTE, BTW, DTW, VMG, time to go, ETA, and an `arrived` flag. Fed by `navigation.course.*` from the
  store when the provider is present, else by `shared/nav` from own position and the leg endpoints.
  The nav strip and the route-layer active-leg highlight read ONLY this view.
- `features/routing`: `routes-client` (CRUD routes and waypoints as Signal K resources, mirroring
  `tracks-client`), `course-client` (activate, advance, restart, and clear via the Course API, plus
  the one-time hydration GET), and the route planner panel (list, new, rename, delete, show or hide,
  activate, and clear active). A slide-over like the Tracks panel.
- `features/route-edit`: the Terra Draw integration, isolated so the dependency is contained.
  Starts and stops drawing on the shared map, loads the working route for editing, and writes edits
  back into `entities/route`.
- `features/route-layer`: the MapLibre display overlay in the `routes` band. Draws each shown route
  as a line with waypoint markers, highlights the active route and active leg, and shows the next
  waypoint cue while following. Mirrors `track-layer`, with a custom `sync(ctx)` driven by `runTick`
  and dirty-checked on a version counter. Waypoint markers follow the notes symbol-layer pattern
  (data-driven `icon-image`, no clustering); the active or selected waypoint reuses the notes
  selection-ring pattern.
- `features/navigation`: the nav-data strip. Renders the `entities/course` guidance (active
  waypoint, DTW, BTW, XTE with a steer-left or steer-right sense, VMG, time to go, and ETA) and
  sounds the arrival alarm. Themed for day, dusk, and night-red.
- `app/App.svelte` (wire): constructs the route store, the course guidance, and the clients, and
  passes them down as props. Registers the route overlay in the `ChartCanvas` `registerAll` batch
  and its `sync` in `runTick`, adds the planner to the menu (or a slide-over), mounts the nav strip,
  and primes the arrival alarm on the first pointer gesture alongside the Lookout alarm.
- Coordinate conversion lives in ONE small module in `shared/signalk` (next to the existing `LatLon`
  type and `geo-guards`), so both `entities` and `features` can import it without crossing a
  boundary. It maps between GeoJSON `[lon, lat]` resource bodies and the internal `LatLon`
  (`{latitude, longitude}`) and Course API form. It is the only place that crosses the two orderings,
  and it is tested both directions.

## 4. External APIs (verified reference)

All angles radians, distances meters, speeds m/s, durations seconds, times ISO 8601, positions
decimal degrees. Coordinate-order trap: `[lon, lat]` in RESOURCE bodies, `{latitude, longitude}`
objects in Course API bodies and outputs. Do not cross them.

### 4.1 Resources API (routes and waypoints)

Endpoints (v2 canonical, fall back to v1 on read, exactly as charts, notes, and tracks do):

- `GET /signalk/v2/api/resources/routes` (and `/waypoints`): list, keyed by id.
- `GET .../routes/{id}`: one.
- `POST .../routes`: create, the server assigns and returns the id (a UUID).
- `PUT .../routes/{id}`: create or replace at a client-chosen UUID.
- `DELETE .../routes/{id}`.

Route resource body (TypeBox `RouteSchema` in `@signalk/server-api`):

```json
{
  "name": "Channel to anchorage",
  "description": "optional",
  "distance": 18520,
  "feature": {
    "type": "Feature",
    "geometry": { "type": "LineString", "coordinates": [[-166.7, -60.5], [-166.4, -60.3]] },
    "properties": { "coordinatesMeta": [ /* optional per-point href or name */ ] }
  }
}
```

Waypoint resource body:

```json
{
  "name": "Fairway buoy",
  "type": "Waypoint",
  "feature": {
    "type": "Feature",
    "geometry": { "type": "Point", "coordinates": [-166.7, -60.5] },
    "properties": {}
  }
}
```

`distance` is meters. Create method decision: PUT to a client-generated UUID, mirroring
`tracks-client` (reuse the `crypto.randomUUID` with `newTrackId`-style fallback for an insecure http
context). PUT is chosen over POST so the id is known immediately for activation, without parsing a
POST response, and so a re-save is idempotent. The server also accepts POST (it assigns the id);
Binnacle does not use it. Reference the route from the Course API as `/resources/routes/<uuid>`.
Sources: signalk-server `packages/server-api/src/typebox/resources-schemas.ts`,
`docs/develop/rest-api/resources_api.md`, SignalK/specification `schemas/groups/resources.json`.

### 4.2 Course API (mutations are v2 REST PUT and DELETE)

Base: `/signalk/v2/api/vessels/self/navigation/course`.

- Activate a route: `PUT .../activeRoute` with `{ "href": "/resources/routes/<uuid>", "pointIndex":
  0, "reverse": false }` (pointIndex defaults 0, reverse defaults false, optional `arrivalCircle` in
  meters).
- Set a single destination (the out-of-scope goto, here for completeness): `PUT .../destination`
  with `{ "position": { "latitude": -60.5, "longitude": -166.7 } }` or `{ "href":
  "/resources/waypoints/<uuid>" }`.
- Advance or retreat: `PUT .../activeRoute/nextPoint` with `{ "value": 1 }` (signed increment), or
  set an absolute index with `PUT .../activeRoute/pointIndex` `{ "value": 2 }`.
- Restart from the current position: `PUT .../restart`. Refresh against the route resource:
  `PUT .../activeRoute/refresh`. Set the arrival circle: `PUT .../arrivalCircle` `{ "value": 200 }`.
- Clear: `DELETE .../course`.
- Hydrate: `GET .../course` returns the current state (`activeRoute`, `nextPoint`, `previousPoint`,
  `arrivalCircle`, times); `GET .../course/calcValues` returns the derived values.

Sources: signalk-server `src/api/course/openApi.ts`, `docs/develop/rest-api/course_api.md`.

### 4.3 Course outputs (read from the stream)

Core state (set by the server core, reliably present on 2.x), paths under `navigation.course`:
`activeRoute` (`href`, `pointIndex`, `pointTotal`, `reverse`, `name`), `nextPoint` (`type`,
optional `href`, `position {latitude, longitude}`, optional `name`), `previousPoint` (same shape),
`arrivalCircle` (meters), `startTime` and `targetArrivalTime` (ISO 8601).

Derived calcValues (set by the optional course-provider plugin), paths under
`navigation.course.calcValues`: `calcMethod` (`GreatCircle` or `Rhumbline`), `crossTrackError`
(meters), `bearingTrackTrue` and `bearingTrackMagnetic` (radians), `distance` to next point
(meters), `bearingTrue` and `bearingMagnetic` to next point (radians), `velocityMadeGood` (m/s),
`timeToGo` (seconds), `estimatedTimeOfArrival` (ISO 8601), `targetSpeed` (m/s), and a whole-route
aggregate `route` (`distance`, `timeToGo`, `estimatedTimeOfArrival`). A provider sets a value to
`null` when it cannot be computed. Sources: signalk-server `packages/server-api/src/typebox/
course-schemas.ts`, `coursetypes.ts`, `docs/develop/plugins/course_calculations.md`.

### 4.4 Streaming versus REST (decisive)

Course values STREAM over the existing v1 WebSocket as deltas; no REST polling for live data. The
Course API emits both v1 (`navigation.courseGreatCircle.*`, `navigation.courseRhumbline.*`,
deprecated) and v2 (`navigation.course.*`) deltas via `handleMessage`, and the official
course-provider consumes the v2 paths purely from the stream and publishes `calcValues.*` as deltas.
Source: signalk-server `src/api/course/index.ts`; course-provider-plugin `src/index.ts`.

One caveat: v2 deltas carry the `SKVersion.v2` flag, which keeps them out of the v1 full data model,
so under `subscribe=none` plus explicit subscriptions the server sends no cached value for
`navigation.course.*` until the next change. Therefore: hydrate once with `GET .../course` and
`GET .../course/calcValues` when a course becomes active, then keep it live from the stream. Add the
course paths to `SK_PATHS` and one subscribe line each at `policy: 'instant', minPeriod: 1000` in the
`App.svelte` subscription list; the refcounted registry makes each added path cheap.

### 4.5 Wire types

Mirror the few read shapes in `src/shared/signalk/types.ts` (never import `@signalk/server-api` in
browser or worker code): `CourseInfo`, `ActiveRoute`, `NextPreviousPoint`, and `CourseCalculations`,
with the fields and units above. Canonical definitions: `coursetypes.ts` and the TypeBox schemas in
signalk-server master.

## 5. Data flow

- Plan: the planner "New route" enters edit mode; `features/route-edit` starts Terra Draw in
  LineString mode, its `td-*` layers anchored into the `routes` band via `renderBelowLayerId`. Edits
  flow through Terra Draw `change` and `finish` events into the `entities/route` working route.
  Per-leg and total distance, bearing, and an ETA preview compute live in `shared/nav`.
- Persist: "Save" calls `routes-client.saveRoute`, which PUTs the route resource body to a
  client-generated UUID, returns a success boolean, and syncs to every device. The list reads back
  via the V2-then-V1 fallback. Saved routes draw through `features/route-layer`.
- Activate: "Activate" calls `course-client.activateRoute(href, pointIndex, reverse)`.
- Follow: `entities/course` hydrates once via GET, then subscribes to `navigation.course.*` and
  `calcValues.*`. It exposes the source-agnostic guidance view; the nav strip and the active-leg
  highlight read only it. When a calc value is null or the provider is absent, the view computes it
  from the core leg endpoints plus own position, SOG, and COG, and flags `source: 'computed'`.
- Arrive: when DTW enters the arrival circle, the arrival alarm sounds and the client requests the
  next point (`PUT activeRoute/nextPoint {value: 1}`). The `activeRoute.pointIndex` that comes back
  on the stream is authoritative, so a server that also auto-advances and the client request converge
  on the same active point rather than double-advancing. On the last point the route completes;
  "Stop" calls `DELETE .../course`.

## 6. Geodesy (shared/nav additions)

New pure files under `src/shared/nav/`, exported from its `index.ts`, SI in and out:

- Rhumb-line distance and bearing (the bearing you steer; the default for leg readouts).
- Great-circle bearing (initial bearing); great-circle distance reuses `haversineMeters`.
- Cross-track error: signed perpendicular distance of own position from the active leg, sign giving
  steer-left or steer-right, using the local equirectangular projection from `cpa.ts`.
- VMG toward the active waypoint: project the velocity vector (from SOG and COG) onto the bearing to
  the waypoint, reusing the clockwise-from-north convention.
- ETA from speed: time to go from DTW and an effective speed (calcValues ETA when present, else SOG,
  else a user-entered planned cruise speed), surfaced as both seconds-to-go and an ISO time.

## 7. Error handling and degradation

- calcValues absent or null: compute client-side, flag `source: 'computed'`, and show that state in
  the UI. If even core course state is missing (pre-2.x server), following degrades to the route
  drawn on the chart with no live guidance and a clear notice.
- Resource write fails (no permission, offline, server error): `routes-client` returns false, the
  panel surfaces a non-blocking error, and the working route stays in memory so nothing is lost.
- Activation fails: surface it, stay un-activated, never enter following on a failed PUT.
- Offline or disconnected: planning and editing work fully, saving fails gracefully, the chart and
  position still render. The WebSocket readyState guard covers the stream; REST calls return false.
- Missing or stale course values: placeholders via the `formatFixed` "value or --" convention, never
  stale numbers; the arrival alarm fires only on a real DTW inside the circle.
- Degenerate routes: a route needs two or more points to activate ("Activate" disabled until valid);
  antimeridian and pole handling reuses the longitude normalization in `cpa.ts`.
- Coordinate-order: confined to the one conversion module, tested both directions.

## 8. Testing

- `shared/nav` geodesy: pure unit tests against known references (canonical distances and bearings,
  XTE off a known leg, VMG, antimeridian cases), test-first.
- `entities/route` and `entities/course`: store reducers (add, move, insert, and delete a waypoint),
  active-leg derivation, arrival detection, and source switching (calcValues present versus
  computed) against a fake `SignalKStore`, plus the coordinate-conversion module both directions.
- `routes-client` and `course-client`: fetch-mock tests like `tracks-client` (V2-then-V1 read, the
  POST and PUT body shapes, the `activateRoute` payload, advance, DELETE, and boolean returns).
- `route-layer`: fake-map overlay tests (layers in the `routes` band, active-leg highlight, and
  `setData` on a version change).
- `route-edit`: test the store-to-GeoJSON and back conversion, not Terra Draw internals.
- The Course API wire shapes are verified LIVE against the target server (an explicit build step),
  since mocks cannot prove the real payloads.
- All gates green (test, type-check, lint, dependency-cruiser, and build), per the project.

## 9. Out of scope (YAGNI)

Autopilot handoff (the Autopilot API, its own later spec); weather and optimal routing, polars,
isochrones, currents, and tides in ETA (sub-project b); route optimization, laylines, and tacking;
GPX import and export (a possible fast-follow, since tracks already export GeoJSON); per-waypoint
metadata beyond a name; and a single-destination "go to" mode (nearly free via the Course API
`destination` endpoint and the same guidance view, kept out of v1 to keep the increment focused).

## 10. Dependencies

One new runtime dependency: `terra-draw` (currently 1.31.0, zero deps) plus
`terra-draw-maplibre-gl-adapter` (currently 1.4.1, zero own deps, peer `maplibre-gl >= 4` covers the
project's 5.24). Both bundle locally with no CDN or runtime network, fitting the offline rule. Per
the project's release gate, add them at their latest compatible versions and keep the runtime
`npm audit` clean. Terra Draw owns its `td-*` layers (namespaced via `prefixId`, anchored into the
`routes` band via `renderBelowLayerId`); the LayerManager stays the z-order authority for everything
else. Theming is driven per mode via `updateModeOptions` on a theme change, with a pure-red-on-black
night ramp.

## 11. Items to verify live (against the target Signal K server)

- The `navigation.course.*` subscription behavior under `subscribe=none`: confirm the hydrate-via-GET
  then stream pattern, and that calcValues stream when the provider is installed.
- Whether the server auto-advances at the arrival circle, or the client must PUT `nextPoint`.
- The exact POST response for a new route and waypoint (where the assigned UUID is returned).
- The route and waypoint resource shapes as the target server actually serves and accepts them.
- Terra Draw touch hit tolerance tuning for a gloved hand on a helm display.

## 12. CLAUDE.md update (on implementation)

Refine the existing note that "the v1 stream does not carry v2 data (course, autopilot); read those
over v2 REST in later specs." The accurate rule for course: live `navigation.course.*` values DO
stream over the v1 WebSocket as deltas, but because they carry the `SKVersion.v2` flag they are not
in the v1 full data model, so a one-time v2 REST GET hydrates the initial snapshot and the stream
keeps it live. Mutations (activate, advance, clear) remain v2 REST. Capture this so the next session
does not assume polling.
