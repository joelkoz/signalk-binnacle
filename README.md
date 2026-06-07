# Binnacle

[![CI](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/ci.yml)
[![SignalK Webapp CI](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/signalk-webapp-ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/signalk-webapp-ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/nearlcrews)

A WebGL chart plotter for [Signal K](https://signalk.org).

> **0.1.3.** This release refines the interface: a grouped, fully keyboard-navigable app menu with
> edge-docked Tracks, Routes, and Layers panels and back-to-menu navigation, Center, Follow, and
> Forecast as three matching labeled controls in the bottom status strip, a cleaner phone layout, an
> opt-in NOAA ENC data-quality overlay, and reduced-motion support. See the
> [changelog](CHANGELOG.md) for the full list.
>
> **It has not been field-tested at any scale.** It has been developed and verified against a single
> Signal K server, never across a fleet or a range of real-world boats, hardware, and conditions. It
> is also not certified for safety-of-life navigation. Always carry redundant means of navigation,
> cross-check against your primary instruments, and treat every display as advisory.

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
  sources, and your own imported PMTiles, in a toggle, fade, and drag-reorder Layers panel.
- **Routing:** draw and save routes as Signal K resources and follow one with a nav strip
  (cross-track, distance, bearing, velocity made good, and time to go) over the v2 Course API, with
  an arrival alarm.
- **Weather:** a zoom-capped mini-map with animated WebGL wind, pressure isobars, waves,
  precipitation, cloud, and radar, a tap-for-value readout, and a conditions and warnings panel.
- **Lookout:** a collision watch with CPA and TCPA, chart-highlight rings, an audible alarm, and a
  published Signal K notification.
- **Tracks:** record, save, show, and export your voyage track.
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
