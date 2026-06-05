# Binnacle

[![CI](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/ci.yml)
[![SignalK Webapp CI](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/signalk-webapp-ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/signalk-webapp-ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/nearlcrews)

A next-generation marine chart plotter for [Signal K](https://signalk.org).

> **0.1.0, the first release.** Binnacle 0.1.0 is a complete chart plotter: GPU charts and depth,
> route planning and following, weather, an active collision watch, voyage tracks, and points of
> interest all ship in this release.
>
> **It has not been field-tested at any scale.** It has been developed and verified against a
> single Signal K server, never across a fleet or a range of real-world boats, hardware, and
> conditions. It is also not certified for safety-of-life navigation. Always carry redundant
> means of navigation, cross-check against your primary instruments, and treat every display as
> advisory.

## What it does

Signal K is an open marine data standard that streams a boat's navigation, environment, and
AIS data over a single API. Binnacle displays that data: a GPU-rendered, offline-capable
chart plotter that runs in a browser and is served by the boat's Signal K server.

It is built for low-bandwidth and offline use on modest hardware. It has night-readable
themes, computes collision and course data on the client when no server provider supplies
them, and caches previously viewed areas so they keep rendering without a connection. It runs
on the same Raspberry Pi that hosts the Signal K server.

## Screenshots

<table>
  <tr>
    <td width="50%">
      <img src="https://raw.githubusercontent.com/NearlCrews/signalk-binnacle/main/static/screenshots/01-chart.png" alt="The chart with AIS traffic and the app menu"><br>
      <sub>The chart with AIS traffic, points of interest, and the app menu.</sub>
    </td>
    <td width="50%">
      <img src="https://raw.githubusercontent.com/NearlCrews/signalk-binnacle/main/static/screenshots/02-routes.png" alt="Planning a route on the chart"><br>
      <sub>Planning a route, with the leg count and total distance updating live.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="https://raw.githubusercontent.com/NearlCrews/signalk-binnacle/main/static/screenshots/03-charts.png" alt="NOAA ENC charts and bathymetry layered from the Layers panel"><br>
      <sub>NOAA ENC charts and bathymetry, layered and faded from the Layers panel.</sub>
    </td>
    <td width="50%">
      <img src="https://raw.githubusercontent.com/NearlCrews/signalk-binnacle/main/static/screenshots/04-anchorage.png" alt="An anchorage point-of-interest detail panel"><br>
      <sub>A native anchorage detail from ActiveCaptain, rendered in a side panel.</sub>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img src="https://raw.githubusercontent.com/NearlCrews/signalk-binnacle/main/static/screenshots/05-weather.png" alt="The weather mini-map" width="80%"><br>
      <sub>The weather mini-map: animated wind, pressure isobars, radar, and a time scrubber.</sub>
    </td>
  </tr>
</table>

## Architecture

Binnacle is built on a current web stack and engineered to run on modest helm hardware:

- **Front end.** Svelte 5 with runes, Vite, and TypeScript, linted and formatted with Biome, with
  module boundaries enforced by the build (Feature-Sliced Design plus a dependency-cruiser gate).
- **GPU rendering.** MapLibre GL JS draws the vector base map and chart layers on the GPU. The own
  vessel and every AIS target render as GPU symbol layers that rotate with heading and course, and
  wind draws as a WebGL particle field of thousands of particles advected through the forecast on the
  graphics card.
- **Off-main-thread real-time pipeline.** A dedicated Web Worker hosts the Signal K WebSocket client;
  incoming deltas are coalesced to a single flush per animation frame and fed into a path-keyed,
  fine-grained reactive store, so a busy AIS anchorage updates the readouts without stalling the
  chart render.
- **Minimal network and render work.** Binnacle subscribes to exactly what it draws, at controlled
  rates (own vessel fast, AIS slower), keeps everything in SI internally, and converts only at the
  display edge.
- **Offline caching.** Self-hosted fonts and assets (no CDN for app code), a service-worker runtime
  cache for the base map and chart tiles, and an IndexedDB weather cache, so previously seen areas
  keep rendering with no internet.

## What's new in 0.1.0

The first published release. Binnacle ships its full first feature set as a Signal K webapp:

- **Charts and layers.** A GPU vector base map, server charts, four free streaming bathymetry and
  ENC sources, and your own imported PMTiles, all managed from a Layers panel that toggles, fades,
  and drag-reorders the z-order.
- **Routing.** Draw and save routes as Signal K resources, then follow one with a nav strip (active
  waypoint, cross-track steer side, distance and bearing, velocity made good, and time to go) over
  the v2 Course API, with a client-side fallback and an arrival alarm.
- **Weather.** A zoom-capped weather mini-map with an animated WebGL wind field, isobars, wave,
  precipitation, and cloud fields, animated radar, a tap readout, and a "Here" conditions and
  warnings panel, preferring a configured Signal K weather provider for point data.
- **Lookout, tracks, and points of interest.** Collision danger with chart-highlight rings, an
  audible alarm, and a published notification; voyage track recording; and native point-of-interest
  detail panels.
- **Display and runtime.** Day, dusk, and night-red themes, offline caching, self-hosted assets,
  and an off-main-thread real-time pipeline that runs on a Raspberry Pi.

This release also folds the per-component panel, button, and instrument-strip styling into shared
utilities, shares the Signal K resource clients and the IndexedDB stores behind single helpers, and
completes the App Store manifest (screenshots and a "Works well with" list). See the
[changelog](CHANGELOG.md) for the full list.

## Features

The 0.1.0 release ships Binnacle's full first feature set. The foundation (the build, the module
architecture, the verification gates, the real-time data layer, the map, chart layers, AIS targets,
day, dusk, and night-red theming, and the identity pass) and the differentiating features (charts
and layers, routing, weather, the Lookout collision safety feature, tracks, and points of interest)
are all in place.

Everything in this release:

- A Svelte 5, Vite, and TypeScript application that builds as a Signal K webapp.
- A Feature-Sliced Design layout (`app`, `views`, `widgets`, `features`, `entities`, and
  `shared`) with machine-enforced module boundaries.
- A real-time data layer: a Web Worker Signal K client bridged with Comlink, a path-keyed
  runes store with fine-grained reactivity, per-frame batching, a subscription registry, and
  reconnection. The shell shows live connection state and own-vessel readouts.
- A MapLibre GL map with a vector base and an extensible layer manager, with the own vessel
  drawn as a GPU symbol layer that rotates with heading. "Center on boat" recenters once, and a
  "Follow boat" lock keeps the chart centered on the vessel as it moves until you pan away.
- Chart and depth layers: server charts from `/resources/charts`, four free streaming bathymetry
  and ENC sources (GEBCO, EMODnet, NOAA ENC, and NOAA BlueTopo), and your own PMTiles archives
  imported by URL or file and stored in the browser for offline use. Every layer is managed from a
  Layers panel that toggles, fades, and drag-reorders the z-order.
- Weather: a dedicated weather mini-map opened by the Forecast button, so the navigation chart stays
  clean and the weather stays within its data resolution (the mini-map caps at zoom 7, RainViewer's
  real radar resolution, so it can never be zoomed past the data). Toggle wind, pressure, waves,
  precipitation, cloud, or radar in the panel; wind draws as an animated WebGL particle field (thousands
  of speed-colored particles streaming with fading trails, a custom MapLibre GPU layer with a
  speed-colored arrow fallback when WebGL is unavailable), mean-sea-level pressure as labeled isobar
  contours (marching squares), significant wave height, precipitation, and cloud as smooth color
  fields, and RainViewer precipitation radar as an animated loop. The four area
  fills are mutually exclusive (one at a time) while wind and pressure stay combinable; a time slider
  scrubs the coming days, a legend shows a color ramp per active layer, a tap reads the value at any
  point, and a "Here" panel shows the conditions, forecast, and any gale or storm warnings for the
  vessel's position. Point data (the tap readout and the "Here" panel) prefers a configured Signal K
  weather provider such as AccuWeather and falls back to the free browser-only sources when none is
  set; the area fields and radar are always free (Open-Meteo and RainViewer, no key, no server).
  Results are cached by viewport in memory, and the responses, radar index, and radar tiles are cached
  for offline use. Themed for day, dusk, and night-red (a deep low-brightness red at night, no blue).
- AIS targets: other vessels render as GPU symbols in the traffic band, rotate with course, age
  out when they go silent, and carry CPA and TCPA when a Signal K provider supplies them.
- The active-safety Lookout feature: a collision danger strip with chart-highlight rings, an audible
  alarm, editable CPA and TCPA thresholds, and a published `notifications.navigation.collision` so
  other Signal K clients share the alarm. It surfaces the most dangerous AIS contacts with closest
  point of approach and time to closest approach, computing them on the client when no Signal K
  provider supplies them, and stays dark when nothing is close.
- Tracks: the voyage is recorded behind the boat, colored by speed or solid, with breaks marking
  GPS dropouts. The whole track persists across a refresh, and a Tracks menu shows live stats and
  saves, lists, shows or hides, deletes, and exports tracks via the Signal K `/resources/tracks` API.
- Routes: plan a passage by drawing waypoints on the chart, with the leg count and total distance
  updating live, then save it as a Signal K route resource that syncs across devices. Activate a
  route to follow it: a nav strip shows the active waypoint, cross-track error with a steer side,
  distance and bearing to the waypoint, velocity made good, and time to go, with an arrival alarm.
  Following uses the Signal K v2 Course API, falling back to client-side course calculations when the
  server's course-provider plugin is absent.
- Points of interest: notes from Crow's Nest, ActiveCaptain, the USCG Light List, and other Signal K
  notes providers render as themed, clustered markers, and tapping one opens a slide-in detail panel.
  Binnacle renders Crow's Nest's structured `properties.crowsNest` sections natively (measures,
  availability, ratings, and more), and falls back to the plain-text description for any other
  provider.
- Day, dusk, and night-red themes switched from a top-bar toggle, recoloring the chrome and the
  map base; night-red is pure red on true black to preserve dark adaptation on a night watch.
- Identity: self-hosted Inter and JetBrains Mono typography (offline-first, with tabular numeric
  readouts), Lucide chrome icons, own-ship and AIS symbols that recolor per theme so nothing
  glows blue on a night watch, and the build version shown in the top bar.
- Offline and PWA support: an installable progressive web app that precaches its shell and
  runtime-caches the base map and Signal K charts as you view them, so previously seen areas render
  with no internet, while the live Signal K stream is never cached. Offline caching is optional and
  requires HTTPS (browsers expose service workers only in a secure context); over plain HTTP the app
  runs online-only with no loss of live function. See [Offline operation and SSL](#offline-operation-and-ssl-optional).
- An SI unit-conversion module in `shared`, built test-first.
- Lint and format with Biome, type-checking with svelte-check, unit tests with Vitest, an
  end-to-end smoke test with Playwright, and architectural boundary checks with
  dependency-cruiser, all wired into CI, plus verify-before-push git hooks.

## Installation

Binnacle is delivered as a Signal K webapp: the production build writes static files into
`public/`, which the Signal K server serves same-origin at `/binnacle/`.

### From source (for development)

```bash
git clone https://github.com/NearlCrews/signalk-binnacle.git
cd signalk-binnacle
npm install
npm run build
```

Then link it into your Signal K server (see Development below).

## Requirements

- Signal K server 2.x.
- Node.js >= 22.
- A browser on the helm display, tablet, or phone you want to view the plotter on.

## Offline operation and SSL (optional)

SSL is not required. Binnacle runs fully over plain HTTP, which is how the Signal K server
serves it by default: the chart, AIS, weather, points of interest, tracks, and the Lookout
alarms all work without it.

What SSL enables is the service-worker layer of offline caching. Browsers expose the service
worker and cache-storage APIs only in a secure context (HTTPS or `http://localhost`), so caching
the base map and chart tiles for full offline map rendering activates only when the server is
reached over HTTPS. Over plain HTTP the app degrades cleanly to online-only with no errors and no
loss of live function. The weather forecast is cached separately in IndexedDB, which is not
secure-context gated, so even over plain HTTP a reload or a return to a recent view reuses the last
forecast rather than re-fetching.

If you want offline operation, the simplest way to add HTTPS to Signal K is the
[signalk-ssl](https://www.npmjs.com/package/signalk-ssl) plugin
([source](https://github.com/dirkwa/signalk-ssl)), which generates a local certificate
authority, issues the server certificate, and distributes the root to your phones and tablets
by QR code so they trust it. The Signal K server's built-in SSL settings (Server, then
Settings, then SSL) are an alternative.

## Development

This project targets Node 22 or newer. Lint and format use the Biome binary, which must be
installed and on your `PATH` (CI installs it via the `biomejs/setup-biome` action).

```bash
npm install        # install dependencies
npm run hooks      # install the git pre-commit and pre-push gates (run once)
npm run dev        # Vite dev server
npm run check      # type-check (svelte-check)
npm run lint       # Biome lint
npm run format     # Biome format (write)
npm run cruise     # dependency-cruiser boundary check
npm test           # Vitest unit tests
npm run build      # production build into public/
npm run test:e2e   # Playwright end-to-end smoke test
```

After `npm run hooks`, git runs a fast format, lint, and boundary check before each
commit, and the full type-check, test, and build gate before each push. A failing gate
blocks the action, so a broken tree cannot be committed or pushed. The hooks live in
`.githooks/` and are opt-in via `core.hooksPath`, never a package lifecycle script.

Link the built webapp into your Signal K server's module directory, then add it to the
server config so it loads:

```bash
ln -sfn "$(pwd)" ~/.signalk/node_modules/binnacle
```

```json
{
  "dependencies": {
    "binnacle": "file:../path/to/signalk-binnacle"
  }
}
```

Restart Signal K, then open `http://your-sk-server:3000/binnacle/` in a browser.

## License

Apache-2.0. See [LICENSE](LICENSE) for the full text. The software is provided "AS IS",
without warranty of any kind. It has not been field-tested at scale and is not certified for
navigation. Treat all on-screen information as advisory, and always carry independent means of
position-fixing.

## Support

Find this project useful? You can support its continued development by
[buying me a coffee](https://www.buymeacoffee.com/nearlcrews).
