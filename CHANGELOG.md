# Changelog

All notable changes to Binnacle are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
