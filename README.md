# Binnacle

[![CI](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/ci.yml/badge.svg)](https://github.com/NearlCrews/signalk-binnacle/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/nearlcrews)

A next-generation marine chart plotter for [Signal K](https://signalk.org), built for the
bluewater cruiser and the liveaboard.

> **Pre-alpha.** Binnacle is early in active development. It is not certified for
> safety-of-life navigation. Always carry redundant means of navigation, and treat all
> displays as advisory.

## What it does

Signal K is the modern marine data standard, streaming a boat's navigation, environment,
and AIS data over a single open API. Binnacle is the screen for that data: a fast,
offline-first, touch-friendly chart plotter that runs in any browser and is served straight
from the boat's Signal K server.

The design center is the offshore watch and the swinging anchor: a chart you can read on a
night watch, danger that surfaces before you ask for it, and a plotter that keeps working
1,500 nautical miles from the nearest cell tower.

## Status

The foundation is complete: the build, the module architecture, the verification gates, the
real-time data layer, the map, chart layers, AIS targets, day, dusk, and night-red theming, and
the identity pass (typography, iconography, and theme-aware symbols) are all in place. The
differentiating features arrive in the following cycles.

What is in place now:

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
  with no internet, while the live Signal K stream is never cached. Service workers require a secure
  context, so offline caching activates when the Signal K server is served over HTTPS; over plain
  HTTP the app runs online-only.
- An SI unit-conversion module in `shared`, built test-first.
- Lint and format with Biome, type-checking with svelte-check, unit tests with Vitest, an
  end-to-end smoke test with Playwright, and architectural boundary checks with
  dependency-cruiser, all wired into CI, plus verify-before-push git hooks.

The design and the build plans live in [`docs/superpowers`](docs/superpowers): the foundation
design spec, and the per-phase implementation plans.

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
without warranty of any kind. Treat all on-screen information as advisory, and always carry
independent means of position-fixing.

## Support

Find this project useful? You can support its continued development by
[buying me a coffee](https://www.buymeacoffee.com/nearlcrews).
