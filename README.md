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

This is the project floor (Phase 1 of the foundation). It establishes the build, the module
architecture, and the verification gates that every later phase ships through. It does not
yet render a chart or connect to a Signal K stream; those arrive in the following phases.

What is in place now:

- A Svelte 5, Vite, and TypeScript application that builds as a Signal K webapp.
- A Feature-Sliced Design layout (`app`, `views`, `widgets`, `features`, `entities`, and
  `shared`) with machine-enforced module boundaries.
- An SI unit-conversion module in `shared`, built test-first.
- Lint and format with Biome, type-checking with svelte-check, unit tests with Vitest, an
  end-to-end smoke test with Playwright, and architectural boundary checks with
  dependency-cruiser, all wired into CI.

The design and the build plan live in [`docs/superpowers`](docs/superpowers): the foundation
design spec, and the Phase 1 implementation plan.

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
npm run dev        # Vite dev server
npm run check      # type-check (svelte-check)
npm run lint       # Biome lint
npm run format     # Biome format (write)
npm run cruise     # dependency-cruiser boundary check
npm test           # Vitest unit tests
npm run build      # production build into public/
npm run test:e2e   # Playwright end-to-end smoke test
```

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
