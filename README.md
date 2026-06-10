# Binnacle

[![CI](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/ci.yml)
[![SignalK Webapp CI](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/signalk-webapp-ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/signalk-webapp-ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/nearlcrews)

A WebGL chart plotter for [Signal K](https://signalk.org).

> **It has not been field-tested at any scale.** It has been developed and verified against a single
> Signal K server, never across a fleet or a range of real-world boats, hardware, and conditions. It
> is also not certified for safety-of-life navigation. Always carry redundant means of navigation,
> cross-check against your primary instruments, and treat every display as advisory.

## What's new in 0.3.1

A pass over the existing features for safety, honesty under failure, performance, and accessibility:

- **Honest under failure.** When the GPS feed stops, the footer shows "No GPS fix" and dashes the
  speed and course instead of holding a frozen value out as live, and the collision and course math
  stand down. The connection badge reads "Reconnecting" or "Not connected" during an outage.
- **Safer alarms.** The collision mute is now session-only and auto-expires after ten minutes, a close
  and imminent contact overrides mute and acknowledge, and acknowledging keeps the danger readout on
  screen while the target is still closing.
- **Steering at a glance.** A cross-track deviation needle on the nav strip, an arrival banner paired
  with the tone, and an "AIS" chip confirming the collision watch is live.
- **Lighter on the hardware.** The chart's idle render loops no longer run at full frame rate at
  anchor, and the weather and wind layers stop forcing continuous GPU work.
- **More accessible.** Opening a panel moves focus into it, disclosure toggles announce their state,
  confirm steps focus their new control, and route delete asks before it removes a saved route.

See the [changelog](CHANGELOG.md) for the full list.

## What it does

Signal K is an open marine data standard that streams a boat's navigation, environment, and AIS data
over a single API. Binnacle displays that data: a GPU-rendered, offline-capable chart plotter that
runs in a browser and is served by the boat's Signal K server.

It is built for low-bandwidth, offline use on modest hardware. It has night-readable themes, computes
collision and course data on the client when no server provider supplies them, and caches viewed
areas so they keep rendering without a connection. It runs on the same Raspberry Pi that hosts the
Signal K server.

## Features

Binnacle ships its full feature set as a Signal K webapp:

- **Charts and layers:** a GPU vector base map, server charts, four streaming bathymetry and ENC
  sources (NOAA ENC, BlueTopo, and EMODnet each add a nested survey-quality facet; GEBCO is global
  base bathymetry), and your own imported PMTiles, in a collapsible, categorized Layers panel with
  per-layer toggle, fade, and drag-reorder.
- **Overlays:** free, key-free OpenSeaMap seamarks, marine protected areas, maritime boundaries, and
  NASA GIBS ocean conditions (sea-surface temperature and sea ice), each with its source attribution.
- **Routing:** draw and save routes as Signal K resources, or tap **Go to here** (long-press or
  right-click the chart) to navigate straight to a point. Follow a route with a nav strip (cross-track,
  distance, bearing, velocity made good, and time to go) over the v2 Course API, with an arrival alarm
  and skip-waypoint controls. A plan speed turns the route into a **passage plan** with per-waypoint and
  whole-route arrival times, and routes **import and export as GPX** to move between Binnacle and other
  plotters and MFDs.
- **Profiles:** save named bundles of your settings (theme, which layers are on and their order, the
  weather layers, the collision thresholds, and the track and planning settings), switch between them
  in one tap, set a default, export and import them as files, and sync them across devices through the
  server when you are logged in.
- **Weather:** a zoom-capped mini-map with animated WebGL wind, pressure isobars, waves,
  precipitation, cloud, and radar, a tap-for-value readout, and a conditions and warnings panel.
- **Tides:** the nearest NOAA tide station's next high and low with a 48-hour curve, and the nearest
  tidal-current station's next flood or ebb, for US waters.
- **Lookout:** a collision watch with CPA and TCPA, chart-highlight rings, an audible alarm, and a
  published Signal K notification, plus a sortable **AIS target list** (by range, CPA, or name) with
  live range and bearing and tap-to-locate on the chart.
- **Anchor watch:** drop the anchor at the boat, set the swing radius (or capture it from the live
  distance), and get a drag alarm that latches until acknowledged. It drives the
  signalk-anchoralarm-plugin when installed (so the alarm keeps running with the browser closed) and
  falls back to a fully in-browser watch when it is not, with a draggable drop-point marker on the
  chart.
- **Man overboard:** an always-visible MOB button in the top bar with a confirm pop-out. Confirming
  marks the spot, publishes the boat-wide Signal K alarm, and raises a recovery strip with live
  bearing, range, and elapsed time, plus an opt-in **Steer to MOB** handoff to the course system. An
  MOB raised by another station shows here too.
- **Measure:** tap points on the chart for per-leg range and bearing and a running total, labeled at
  the last point.
- **Tracks:** record, save, show, and export your voyage track as GeoJSON, save a track as a reusable
  route, reverse a route for the return leg, or navigate home by retracing your track.
- **Points of interest:** Crow's Nest, ActiveCaptain, and other notes as themed markers with a
  structured detail panel.
- **Themes and offline:** day, dusk, and night-red themes, offline caching, and self-hosted assets.

See the [changelog](CHANGELOG.md) for the full list.

## Architecture

Binnacle is built on a current web stack and engineered to run on modest helm hardware:

- **Front end.** Svelte 5 with runes, Vite, and TypeScript, linted and formatted with Biome, with
  module boundaries enforced by the build (Feature-Sliced Design plus a dependency-cruiser gate).
- **GPU rendering.** MapLibre GL JS draws the vector base map and chart layers on the GPU. The own
  vessel and every AIS target render as GPU symbol layers, and wind draws as a WebGL particle field
  advected through the forecast on the graphics card.
- **Off-main-thread real-time pipeline.** A dedicated Web Worker hosts the Signal K WebSocket client;
  deltas are coalesced to one flush per animation frame and fed into a path-keyed reactive store, so a
  busy AIS anchorage updates the readouts without stalling the chart render.
- **Minimal network and render work.** Binnacle subscribes to exactly what it draws, keeps everything
  in SI internally, and converts only at the display edge.
- **Offline caching.** Self-hosted fonts and assets (no CDN for app code), a service-worker runtime
  cache for the base map and chart tiles, and an IndexedDB weather cache.

## Installation

Binnacle is a Signal K webapp. Install it from the Signal K server's **App Store** (Apps and Plugins,
then Store): search for Binnacle, install, and open it from the **Webapps** list. The production build
ships inside the package, so there is nothing to build.

## Requirements

- Signal K server 2.x.
- Node.js >= 22 (for building from source).
- A browser on the helm display, tablet, or phone.

## Offline operation and SSL (optional)

SSL is not required. Binnacle runs fully over plain HTTP, which is how the Signal K server serves it
by default: the chart, AIS, weather, points of interest, tracks, and the Lookout alarms all work
without it.

What SSL enables is the service-worker layer of offline caching. Browsers expose the service worker
and cache-storage APIs only in a secure context (HTTPS or `http://localhost`), so caching the base
map and chart tiles for full offline map rendering activates only when the server is reached over
HTTPS. Over plain HTTP the app degrades cleanly to online-only with no loss of live function. The
weather forecast is cached separately in IndexedDB, which is not secure-context gated, so even over
plain HTTP a reload reuses the last forecast rather than re-fetching.

To add HTTPS to Signal K, the simplest way is the
[signalk-ssl](https://www.npmjs.com/package/signalk-ssl) plugin
([source](https://github.com/dirkwa/signalk-ssl)), which generates a local certificate authority,
issues the server certificate, and distributes the root to your devices by QR code. The Signal K
server's built-in SSL settings (Server, then Settings, then SSL) are an alternative.

One more step is required, and it is easy to miss: your browser has to **trust** that certificate,
not just reach it. A self-signed certificate, including one the signalk-ssl plugin generates, is not
trusted by default, and browsers refuse to register a service worker from an origin whose certificate
they do not trust, even after you click through the page's certificate warning. So if you only accept
the one-time warning, the page loads but offline caching never activates, and the console shows a
message like "service worker registration failed: an SSL certificate error occurred." To fix it,
install the certificate authority's root (the QR code or `.pem` the plugin gives you) into your
browser or operating system trust store and mark it trusted, then reload over HTTPS. Once the
certificate is trusted, the service worker registers and the base map and chart tiles cache for
offline use.

## Development

This project targets Node 22 or newer. Lint and format use the Biome binary, which must be installed
and on your `PATH` (CI installs it via the `biomejs/setup-biome` action).

```bash
git clone https://github.com/NearlCrews/signalk-binnacle.git
cd signalk-binnacle
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

After `npm run hooks`, git runs a fast format, lint, and boundary check before each commit, and the
full type-check, test, and build gate before each push. The hooks live in `.githooks/` and are opt-in
via `core.hooksPath`, never a package lifecycle script.

To run a local build inside your own Signal K server, link it into the server's module directory and
add it to the server config so it loads:

```bash
ln -sfn "$(pwd)" ~/.signalk/node_modules/signalk-binnacle
```

```json
{
  "dependencies": {
    "signalk-binnacle": "file:../path/to/signalk-binnacle"
  }
}
```

Restart Signal K, then open `http://your-sk-server:3000/signalk-binnacle/` in a browser.

## License

Apache-2.0. See [LICENSE](LICENSE) for the full text. The software is provided "AS IS", without
warranty of any kind. It has not been field-tested at scale and is not certified for navigation.
Treat all on-screen information as advisory, and always carry independent means of position-fixing.

## Support

Find this project useful? You can support its continued development by
[buying me a coffee](https://www.buymeacoffee.com/nearlcrews).
