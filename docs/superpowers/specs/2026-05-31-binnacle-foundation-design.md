# Binnacle: Foundation Design

Date: 2026-05-31
Owner: Nearl Crews
Status: Design draft, approved in brainstorming, pending written-spec review

## 1. What this document is

Binnacle is a from-scratch, next-generation marine chart plotter for Signal K, built for
the bluewater cruiser and the liveaboard. This document specifies the foundation slice: the
usable plotter core that every later feature builds on. It is the first of many specs. The
differentiators (active-safety CoPilot, weather routing, anchor intelligence, the liveaboard
dashboard, and multi-station watch handoff) each get their own brainstorm, spec, and plan on
top of this foundation.

Binnacle is not a port of Freeboard-SK or of the earlier signalk-open-binnacle fork. Those
are conceptual references for what features a chart plotter needs, nothing more. No legacy
code is carried forward. The project name is Binnacle, not Open Binnacle.

The terminal sentence this product must let a user finish, carried from the prior
differentiation work: "Binnacle is the chart plotter for the offshore watch and the swinging
anchor." Everything here serves that.

## 2. Target user (carried context)

Primary: the bluewater cruiser. Long offshore passages, days from shore, redundancy-minded,
dark-cabin night watches, lives by AIS, weather, and the depth sounder. Secondary, same
person: the liveaboard, at anchor or in the marina, using the plotter as a boat dashboard.

Explicitly not the design center: racers, casual day sailors, and power boaters.

Four product pillars guide every decision: state-not-app posture, night-watch first,
offline-first, and active danger surfacing. The foundation slice does not implement the
differentiating features that express pillars 1 and 4, but its architecture must not
foreclose them.

## 3. Scope of this spec

### 3.1 In scope (the foundation slice)

1. App shell: a chart-centric, mode-ready layout (top bar, left layers panel, right info
   panel, bottom status and danger strip).
2. Signal K connection: a path-keyed reactive store fed by a Web Worker, connecting to a
   live Signal K server.
3. MapLibre map with a vector base map.
4. Layered chart rendering: the vector base plus any charts the Signal K server exposes,
   with per-layer toggle, opacity, and drag-to-reorder.
5. Three themes: day, dusk, and night-red.
6. Own-vessel rendering.
7. AIS targets, rendered by class, with CPA and TCPA consumed from Signal K when a provider
   is present.

The foundation connects to a live server. It works against whatever charts the server already
serves.

### 3.2 Out of scope (each its own later spec)

Offline and PWA (the immediate next spec: service worker, OPFS, PMTiles caching), the S-57 to
vector-tile pipeline and full S-52 symbology, weather and GRIB overlays, tides, routing and
weather routing, the Terra Draw route and waypoint editing tools, anchor mode as a primary
surface, the inhabit dashboard, watch handoff, the Course API, and the Autopilot API. The
foundation renders ENC charts only if the server already serves them as tiles; building the
ENC pipeline and the S-52 style is deferred.

### 3.3 Sequencing note

The foundation is built as one coherent slice connecting to a live server. The offline and
PWA pipeline is the very next spec, not part of this one. This keeps the first build testable
without front-loading the hardest offline plumbing.

## 4. Locked decisions

These were settled during brainstorming and are not reopened without cause.

| Area | Decision |
| --- | --- |
| Framework | Svelte 5 (runes), Vite, TypeScript |
| Map engine | MapLibre GL JS 5.x (WebGL2) via svelte-maplibre-gl, plus a thin imperative LayerManager |
| First spec scope | Foundation slice, connecting live first |
| Chart foundation | Vector base (OpenFreeMap / Protomaps PMTiles) plus Signal K `/resources/charts` layered on top |
| UI fonts | Inter (UI text) and JetBrains Mono (numeric readouts), self-hosted |
| App-chrome icons | Lucide (lucide-svelte) |
| Chart symbols | Derived from S-52 Presentation Library and OpenBridge, not a UI icon set |
| Themes | Day, dusk, and night-red. Night-red is pure red on true black |
| App shell | Hybrid: clean chart-centric now, structured so the three-mode shell drops in later |
| Layer control | Per-layer toggle, opacity slider, and drag-to-reorder z-order |
| Delivery | Signal K webapp (no server plugin required for the foundation) |
| Language | American English throughout |

## 5. Technology stack

Versions are current stable as of 2026-05-31 and are pinned at implementation time, then kept
current per the release checklist.

- Runtime and tooling: Node 24 LTS, Vite 8 (Rolldown), TypeScript 5.9.x, Vitest 4 for unit
  and store tests, Playwright for end to end.
- Framework: Svelte 5.x with runes.
- Map: maplibre-gl 5.24.x, svelte-maplibre-gl 2.x, pmtiles 4.x for the PMTiles protocol.
  deck.gl 9.x `MapboxOverlay` is reserved as an optional, pluggable overlay for very large AIS
  fleets and is not in the foundation.
- Draw (later spec): terra-draw with terra-draw-maplibre-gl-adapter.
- Real-time: a dedicated Web Worker hosting the Signal K WebSocket client, bridged to the main
  thread with Comlink.
- Signal K types: `@signalk/server-api` for branded `Path`, `Context`, `SourceRef`, and the
  delta type guards.
- Fonts: Inter and JetBrains Mono, self-hosted and subset.
- Icons: lucide-svelte for chrome; an S-52-derived sprite atlas for chart symbols (later).

## 6. Architecture

### 6.1 Guiding principle: modularity first

Modularity is a first-class requirement, not a cleanup pass. Adding a later feature (weather,
tides, routing, the CoPilot, anchor mode, the dashboard, watch handoff) must mean dropping in a
self-contained module against stable interfaces, never surgery on the core. The core never
hardcodes knowledge of any specific feature.

This is enforced three ways, all of which fail the build on violation:

1. A layered structure with a strict, one-directional dependency rule.
2. Per-feature public APIs: a feature is reachable only through its `index.ts`.
3. Machine-enforced boundaries via path aliases, `eslint-plugin-boundaries`, and
   dependency-cruiser in CI.

### 6.2 Layered structure (Feature-Sliced Design, adapted)

The app uses Feature-Sliced Design layers, adapted for a client-only Vite SPA (no SvelteKit
routing, so pages become views). Imports flow strictly downward:
`app -> views -> widgets -> features -> entities -> shared`. Same-layer imports between
slices are forbidden; cross-feature data flows through an `entities` store, never feature to
feature.

```
src/
  app/          composition root: bootstrap, providers, the feature registry, the one file that lists features
  views/        routable screens / layouts, compose widgets only
  widgets/      self-contained UI blocks (chart canvas, side panel, status bar)
  features/     each capability is one slice: charts, ais, (later) weather, tides, routing, anchor-watch
  entities/     shared domain models: vessel, waypoint, route, chart-source
  shared/       generic, project-agnostic code: signalk client, map helpers, ui primitives, geo math, units, types
```

Each feature slice has `ui`, `model`, `api`, and `lib` segments, a `manifest.ts`, and an
`index.ts` that is its only public surface. Named re-exports only, never `export *`, to keep
tree-shaking and chunking honest.

### 6.3 The feature registry (extensibility)

The core does not branch on feature identity. Every feature exports a `FeatureManifest`
(`id`, `title`, `icon`, optional lazy `panel` and `mapLayer` components loaded via dynamic
`import()`, and a `register(services)` hook). A small registry in `app/` collects manifests
and the shell renders whatever is registered. Adding a feature is a new folder plus one line
in `app/features.ts` (or zero lines if `import.meta.glob` auto-discovery is adopted). Feature
UI is behind dynamic imports so Vite emits a per-feature chunk and only active features load on
constrained hardware.

### 6.4 Dependency injection

Services (the Signal K client, the MapLibre instance, the feature registry, and entity
stores) are injected via typed Svelte `createContext` helpers from a composition-root
provider, not imported as global singletons, so they are swappable in tests. Stateful stores
are created inside the provider and receive their dependencies through their constructors,
which keeps them decoupled and unit-testable with fakes.

### 6.5 The real-time data layer

The Signal K WebSocket client runs in a dedicated Web Worker. The worker owns the socket,
delta parsing, per-path coalescing, the subscription registry, and reconnection. It is bridged
to the main thread with Comlink: coarse awaited methods for connect, subscribe, unsubscribe,
and disconnect, plus a single `Comlink.proxy` callback that delivers one batched frame per
animation frame. AIS position, heading, and speed travel as columnar typed arrays moved with
`Comlink.transfer` (zero-copy) so they can feed the map without per-vessel object churn.

The worker batches: incoming deltas are buffered and collapsed to last-write-wins per path,
then flushed at most once per `requestAnimationFrame`. This collapses many messages per second
into one reactive update per paint, which is the canonical fix for re-render storms.

On the main thread the store is path-keyed with fine-grained Svelte 5 reactivity. Each path is
an independently reactive cell, so a 10 Hz position update never re-runs an unrelated wind
gauge. A `SvelteMap` is used only where a consumer iterates a whole collection, such as the
AIS target set the map renders. Large replace-only values use `$state.raw` to skip proxy
overhead on Pi-class hardware.

All values are kept in Signal K SI units in the store (radians, meters, meters per second,
Kelvin), with one documented exception: `navigation.position` is decimal degrees, which is
what MapLibre wants. Unit conversion and formatting are a separate pure module called only at
the display edge, so a unit-preference change never touches the data model.

Connection state is a reactive signal the UI surfaces (a boat must always know if data is
stale). Reconnection uses full-jitter capped exponential backoff, resets on a successful open,
and re-sends all active subscriptions on reconnect. The server's cached-value replay
repopulates leaves, so a transient disconnect must not blank the store. Per-path staleness uses
each cell's last-received timestamp against the path's metadata timeout.

### 6.6 The map and layer architecture

svelte-maplibre-gl owns the map element, camera, controls, and any statically known layers. A
thin imperative LayerManager, holding the live map instance from context, owns the dynamic,
self-registering overlays (charts, AIS, own-vessel, and later weather, contours, and draw
layers).

Every overlay is an `OverlayModule` with a stable `id`, a `zBand`, and `add`, `remove`,
`setVisible`, and `setOpacity` methods, plus optional `applyTheme` and `reattach`. The manager
holds an ordered registry and the runtime toggle, opacity, and order state, and is the only
thing that touches the map for overlays. Overlays never reference each other.

Z-order is deterministic via sentinel layers: one invisible layer per z-band is installed at
init, and overlays insert with `beforeId` set to the next band's sentinel, so each band's
contents land in its own slot within MapLibre's single flat layer list. Opacity is per layer
type, implemented in each module against the correct paint property. Theme switching for day,
dusk, and night-red is done with `setPaintProperty`, not `setStyle`, so tiles and overlay state
survive a palette change instantly; a genuine base-style swap calls the manager's
`reattachAll` to reinstall every registered overlay.

Charts plug in through a generic `ChartSourceAdapter` keyed on the Signal K chart `type`
(`tilelayer`, `WMS`, `WMTS`, `tileJSON`, `mapstyleJSON`, and S-57 as vector tiles), so XYZ,
TMS, WMS, WMTS, PMTiles, MVT, and ENC sources all resolve to the same OverlayModule interface
and layer in identically. The layer-control model the user picked (toggle, opacity, and
reorder) is exactly this manager's surface, which is what makes "layer on depth and contour
without conflict" a built-in property rather than a bolted-on feature.

Own-vessel and AIS render as GeoJSON-backed symbol layers with data-driven `icon-rotate`, not
DOM markers, so they scale to hundreds of targets and interleave correctly with chart layers.
The vessel icon rotates by `headingTrue` when present and falls back to `courseOverGroundTrue`
when heading is absent. Their update loop lives inside the module and calls `setData` directly,
bypassing framework reactivity on the hot path. deck.gl `MapboxOverlay` (interleaved) is the
documented escape hatch for very large fleets and is itself just another OverlayModule, so it
can be added later without touching the core.

## 7. Signal K integration (conformance)

This section is the conformance contract. Binnacle must reach 100% Signal K plugin/webapp
compliance.

### 7.1 Delivery model

The foundation ships as a pure Signal K webapp: a static bundle served same-origin by the
server at `/binnacle/`. The driving `package.json` keywords are `signalk-webapp` and
`signalk-category-chart-plotters`. The `signalk` manifest carries `appIcon`, `displayName`,
and `screenshots`. The Vite build emits into the directory the server serves, and `files`
ships that directory plus assets. No `main` and no plugin keyword are needed, because every
foundation capability is provided over HTTP and WebSocket by the server core or by separately
installed plugins (charts via `@signalk/charts-plugin` or `signalk-pmtiles-plugin`, CPA and
TCPA via `signalk-derived-data` or `signalk-ais-target-prioritizer`). A companion
`signalk-node-server-plugin` can be added to the same package later if a server-side feature
appears; the foundation does not need one.

All assets are bundled locally. No CDNs, because vessels are routinely offline.

### 7.2 Streaming and subscriptions

Connect to `ws(s)://<host>/signalk/v1/stream`. Read `self` from the `hello` message and store
it. Connect with `subscribe=none` and issue two explicit subscriptions:

1. Own vessel, high rate: `context: vessels.self`, `policy: instant`, with `navigation.headingTrue`
   and `navigation.headingMagnetic` at `minPeriod` around 200 ms (heading drives icon
   rotation and must feel smooth), and `navigation.position`, `navigation.courseOverGroundTrue`,
   and `navigation.speedOverGround` at `minPeriod` around 1000 ms.
2. AIS, controlled rate: `context: vessels.*`, `policy: fixed` (or `ideal`) with `period`
   around 5000 ms, whitelisting only the rendered paths (`navigation.position`,
   `navigation.courseOverGroundTrue`, `navigation.speedOverGround`, `navigation.headingTrue`,
   `navigation.state`, `name`, `mmsi`, and `design.aisShipType`).

Filter self out of the `vessels.*` stream by comparing each delta's `context` to the stored
`self`. Keep `sendCachedValues` on so reconnects repopulate immediately. Re-send subscriptions
after every reconnect.

### 7.3 Authentication

Same-origin in production: the session cookie authenticates both REST and the WebSocket
automatically. Binnacle runs read-only without a token (chart, own vessel, and AIS work when
the server allows read-only access) and prompts for login only on the first write. Tokens are
never placed in a URL in production. Local dev uses a Vite proxy so the dev and production auth
paths do not diverge.

### 7.4 Data model

Own vessel is `vessels.self` (equivalent to the resolved self URN). AIS targets are
`vessels.<urn:mrn:imo:mmsi:...>` carrying the same `navigation.*` paths plus `mmsi`, `name`,
and `design.aisShipType`. Values are SI; `navigation.position` is degrees. CPA and TCPA are not
computed by the server core: read `navigation.closestApproach` (`{ distance, timeTo }` in
meters and seconds) when a provider populates it, and degrade gracefully when absent. Track
`lastUpdate` per vessel and age out AIS targets that go silent (about 6 to 10 minutes).

### 7.5 Charts API

Discover charts at `GET /signalk/v2/api/resources/charts`, falling back to v1 on 404. Branch
on the chart `type` to build a MapLibre source and layer through the `ChartSourceAdapter`.
Honor `bounds`, `minzoom`, and `maxzoom`. The Resources API returns a flat catalog; layering
order, visibility, and opacity are Binnacle's responsibility and live in the LayerManager. The
foundation renders the vector base plus whatever charts the server exposes; if none are
configured, the base map still shows.

### 7.6 Versioning gotcha

The streaming WebSocket carries the v1 model. v2-shaped data (course, autopilot) is read over
v2 REST and does not appear on the v1 stream. The foundation consumes only v1 stream paths
plus the charts resource API, so this is noted for later specs rather than hit now.

## 8. Theming

Three palettes as design tokens, switched by a single signal: day (bright, for direct sun),
dusk (cool and dimmed), and night-red (pure red on true black). Rules enforced across every
surface: no blue at night, alarm states always remain distinguishable, and the brightest pixel
stays low in night-red. Theme switching at the map layer uses `setPaintProperty`. The token
system and the night-color contract follow the OpenBridge marine design system, IEC 62288, and
the IMO MSC.302(87) alert and night-color guidance.

## 9. Error handling and resilience

Connection state is a first-class reactive signal surfaced in the UI. Reconnection uses
full-jitter capped exponential backoff and re-subscribes on reconnect. A transient disconnect
must not blank the store; cached-value replay refills it. Per-path staleness is tracked and
shown rather than presenting frozen data as live. Missing capabilities degrade gracefully: no
charts configured still shows the base map, no CPA provider hides collision data rather than
erroring, and a resource type with no provider hides its feature.

## 10. Testing

Three independently testable seams, which the module boundaries make possible:

1. Pure logic with no DOM or worker: delta reconcile, the frame batcher (with fake timers
   asserting many puts collapse to one flush), the subscription registry, backoff, the chart
   adapters (real Signal K chart JSON fixtures in, MapLibre specs out), and unit conversion.
2. Runes stores in isolation, using `$effect.root` and `flushSync`, asserting that updating
   one path cell does not invalidate an unrelated reader.
3. Components and the worker bridge: component tests for the shell and panels, the worker
   bridge via `@vitest/web-worker`, and Playwright end to end for connect-and-render smoke.

Overlay modules are unit-tested against a mocked map instance, asserting the source and layer
specs produced, the `beforeId` used, and that `remove` undoes everything `add` did. Manager
lifecycle tests cover register, toggle, opacity, theme switch, and reattach after a base-style
swap.

## 11. Build policy (standing process for this project)

This policy applies to every major step of the build and is restated in the project CLAUDE.md.

- Agent team: each major step may use an agent team of up to 6 expert agents of the lead's
  choosing, with at least one Signal K expert on steps that touch the integration. Give each
  teammate a distinct, non-overlapping lens to avoid file conflicts.
- Cleanup gate: each major step finishes with the `/cleanup` skill (full-codebase, cross-checked
  multi-agent cleanup).
- Fix everything: every finding from review, cleanup, linters, and human review is fixed,
  including low and nit. The only acceptable skip is factually refuted or by-design after honest
  scrutiny, with a one-line reason.
- Verification: after fixing, run the project's type-check, tests, lint, and build, and confirm
  green before claiming a step done. Respect the Pi memory budget: one heavy verification
  process at a time.
- Compliance: every release must hold 100% Signal K plugin/webapp compliance, and project files
  must be written per the Signal K spec to achieve it.
- Style: American English, no em dashes, Oxford commas, default to no comments (keep only
  non-obvious why comments). These apply to code, docs, commits, and any text passed to
  subagents.
- Modularity: every new feature is a self-contained slice behind a public `index.ts`, machine
  boundary checks must pass, and the core must not learn about specific features.

## 12. Build order (rough, not a plan)

The implementation plan is writing-plans' job. Rough sequence for the foundation slice:

1. Project floor: Vite, Svelte 5, TypeScript, Vitest, Playwright, ESLint with boundary rules,
   dependency-cruiser, path aliases, the Signal K webapp `package.json`, and a CI gate.
2. The data layer: the worker, Comlink bridge, subscription registry, per-frame batcher,
   reconnection, the path-keyed runes store, and the units module.
3. The map: the svelte-maplibre-gl host, the LayerManager, sentinel z-bands, and the vector
   base map.
4. Charts: the ChartSourceAdapter, charts discovery, and the layer-control UI (toggle,
   opacity, reorder).
5. Vessels: own-vessel and AIS symbol layers, with CPA and TCPA consumption when present.
6. Shell and theming: the chart-centric shell, the status and danger strip, the info and
   layers panels, and the day, dusk, and night-red token system.
7. Identity pass: icon, fonts, and copy.

Each numbered step is a major step under the build policy in section 11.

## 13. Open questions for the implementation plan

- The exact vector base source for the foundation (OpenFreeMap hosted versus a bundled
  Protomaps PMTiles extract). The offline spec will settle bundling; the foundation may use a
  hosted base since it connects live.
- Confirm the route, waypoint, region, and note geometry shapes against the target server live
  before the later resources spec, since providers can add extension fields.
- Whether to adopt `import.meta.glob` feature auto-discovery from the start or begin with the
  explicit manifest list.

## 14. Relationship to later specs

This foundation is the substrate. The offline and PWA spec comes next. Then each differentiator
(active-safety CoPilot, weather and routing, anchor intelligence, the liveaboard dashboard, and
multi-station watch handoff) is its own brainstorm, spec, and plan, each shipping as a
self-contained feature slice that registers against this foundation without modifying it.
