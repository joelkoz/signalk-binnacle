# Binnacle: AI assistant operating rules

Binnacle is a from-scratch, next-generation marine chart plotter for Signal K, for the
bluewater cruiser and the liveaboard. It is NOT a port of Freeboard-SK or of the earlier
signalk-open-binnacle fork; those are conceptual references only. The project name is
Binnacle, not Open Binnacle. No legacy code is carried forward.

This file is the source of truth for project-scoped AI assistant rules. User-global memory
does not always load reliably across worktrees or fresh clones, so rules that came at the cost
of redoing work live here.

The authoritative design is `docs/superpowers/specs/2026-05-31-binnacle-foundation-design.md`.
Read it before doing architectural work.

## Locked product and stack decisions

- Framework: Svelte 5 (runes), Vite, TypeScript. This was a deliberate clean break from the
  Angular lineage of the prior fork; do not reintroduce Angular.
- Map: MapLibre GL JS 5.x used directly, plus a thin imperative LayerManager for dynamic
  overlays. deck.gl MapboxOverlay is an optional pluggable overlay, not the base.
- Charts: a generic ChartSourceAdapter over the Signal K `/resources/charts` API, plus a
  vector base map. S-57 to vector-tile pipeline and full S-52 styling are a later spec.
- Real-time: a dedicated Web Worker hosts the Signal K WebSocket client, bridged with Comlink,
  batching deltas to one flush per animation frame, feeding a path-keyed fine-grained runes
  store.
- Fonts: Inter (UI) and JetBrains Mono (numeric readouts), self-hosted.
- Icons: lucide-svelte for app chrome. Chart symbols derive from the S-52 Presentation
  Library and OpenBridge, not from a UI icon set.
- Themes: day, dusk, and night-red. Night-red is pure red on true black. No blue at night,
  alarms always distinguishable, brightest pixel low.
- App shell: hybrid chart-centric, structured so the three-mode shell (Watch, Anchor, Inhabit)
  drops in later without a rebuild.
- Layer control: per-layer toggle, opacity slider, and drag-to-reorder z-order.

## Toolchain (lint, format, build)

- Lint and format: Biome (preferred over ESLint and Prettier). Use the system binary at
  `/usr/local/bin/biome`, kept current and not added to `package.json`, so a working tree needs
  Biome installed globally to run `npm run lint` and `npm run format`. CI installs it with the
  `biomejs/setup-biome` action pinned to the same version. Config is `biome.json`. `npm run lint`
  is `biome lint .`, `npm run format` is `biome format --write .`, and CI runs `biome ci .`.
- Biome's `.svelte` support is experimental (it formats and lints the script and style blocks,
  not the control-flow template syntax). It is enabled via `html.experimentalFullSupportEnabled`.
  Re-verify it round-trips Svelte files cleanly whenever `{#if}`, `{#each}`, or other control
  flow is added (Phase 6 onward); if it ever mangles a `.svelte` file, exclude `.svelte` from
  Biome and rely on `svelte-check` for correctness.
- Type-check: `svelte-check --tsconfig ./tsconfig.app.json` (the leaf app config, not the
  solution-style root `tsconfig.json`, which is for `tsc -b` and dependency-cruiser path
  resolution only).
- Keep every dependency at its latest compatible version. The stack is on Vite 8, TypeScript 6,
  Svelte 5, MapLibre GL JS 5.24 (used directly, not svelte-maplibre-gl), pmtiles 4, Comlink 4,
  and `@signalk/server-api` 2.

## Verify before commit and push (hard rule, mechanically enforced)

Never commit or push on a red gate. A commit message must never claim "green" before the gate
has actually run and passed. This was violated repeatedly early on, so it is now enforced by git
hooks in `.githooks/`, wired via `npm run hooks` (a non-lifecycle script, never a `prepare` hook,
per the SignalK pack-banner caveat above):

- `pre-commit` runs `biome ci .` and `npm run cruise`.
- `pre-push` runs the full chain: `biome ci`, `cruise`, `check`, `test`, and a production `build`.
  A failure blocks the push.
- `pre-push` also prints a non-blocking drift report: any uncommitted tracked changes and any
  local branch besides `main`. This exists so stray work is seen at the moment of pushing, not
  rediscovered later with unknown provenance. When it fires, commit, discard, or stash the
  changes and delete merged branches before moving on; do not let the tree drift.

Always commit and push to `main` once the gate is green after any significant change or cleanup:
do not leave significant work uncommitted in the tree. The work is not done until it is on `main`.

## Working-tree hygiene and the scratch directory

The project works directly on `main`, so the working tree should stay clean between commits.
Scratch artifacts (Playwright screenshots, throwaway debug scripts, captured logs) go in the
gitignored `tmp/` directory at the repo root, never loose at the root or inside `src/`. A stray
`*.png` at the repo root is also gitignored as a backstop. Real app and store screenshots
(`signalk.screenshots`) are not scratch: they live under `public/` or `src/` and are committed.

The working rhythm: write every file, run the gate capturing each result to a file and reading it
back (shell output on this Pi intermittently truncates, so trust the file, not a glanced line),
confirm all green, and only then commit and push. Run heavy commands one at a time. Prefer
lead-driven implementation over agent teams on this Pi; `TeamCreate` teams have dropped lane files
silently ("Lock file is already being held" on spawn), which is how broken trees reached commits.

When a team IS explicitly requested for implementation, use parallel **Agent-tool subagents scoped
to disjoint files, not `TeamCreate`** (the Agent tool has no lane-lock plumbing, so it avoids that
failure; it is also what `/cleanup` uses for read-only audits). Each implementer subagent edits a
non-overlapping file set, is forbidden from running heavy commands and git, and reports back; the
lead integrates the shared and wiring files itself, runs the single gate one heavy command at a
time, commits in logical chunks, and only then optionally runs review subagents (code-reviewer,
silent-failure-hunter) on the integrated diff and fixes every finding. No tmux panes or
`shutdown_request` to manage because there is no `TeamCreate`.

## Modularity is a first-class rule

Adding a later feature (weather, tides, routing, the CoPilot, anchor mode, the dashboard,
watch handoff) MUST be a self-contained module dropped in against stable interfaces, never
surgery on the core. The core never hardcodes knowledge of a specific feature.

- Layered structure (Feature-Sliced Design, adapted): imports flow strictly downward,
  `app -> views -> widgets -> features -> entities -> shared`. No same-layer slice-to-slice
  imports. Cross-feature data flows through an `entities` store, never feature to feature.
- Every slice exposes a public API via `index.ts`. Named re-exports only, never `export *`.
  Nothing outside a slice imports its internal files.
- Features are self-contained slices under `features/<name>`, each exposing a public API via its
  `index.ts`. They are composed in `app/App.svelte` by static import, so adding a feature is a new
  slice plus its wiring in `App.svelte`. A `FeatureManifest`/registry that auto-collects features
  is a future option, not yet built.
- Services (the Signal K client, the map instance, the stores) are constructed in `app/App.svelte`
  and passed down as props, not global singletons, so they are swappable in tests.
- Boundaries are machine-enforced and fail the build: path aliases plus a dependency-cruiser gate
  (`no-circular`, the per-layer `entities-go-down-only`, `features-go-down-only`,
  `widgets-go-down-only`, and `views-go-down-only` rules, `shared-imports-nothing-above`, and the
  cross-feature `no-cross-feature` rule). dependency-cruiser is the single boundary enforcer,
  because Biome has no import-boundary rule equivalent to `eslint-plugin-boundaries`.

This is a hard rule. Architectural feedback that came at the cost of redoing significant work
must not be repeatable.

## Signal K conformance: 100% compliance, always

- The foundation ships as a Signal K webapp: keywords `signalk-webapp` and
  `signalk-category-chart-plotters`, a `signalk` manifest with `appIcon`, `displayName`, and
  `screenshots`, the build emitted into the served directory, and `files` shipping it. No
  server plugin is required for the foundation.
- Consume the v1 streaming WebSocket. Connect with `subscribe=none` and issue explicit
  subscriptions: own vessel at high rate (`policy: instant`, heading near 200 ms, others near
  1000 ms), and AIS at a controlled rate (`vessels.*`, `policy: fixed`, period near 5000 ms,
  rendered paths only). Read `self` from `hello` and filter self out of `vessels.*`.
- All values are SI in the store (radians, meters, m/s, Kelvin). The one exception is
  `navigation.position`, which is decimal degrees. Convert only at the display edge in a
  separate pure module.
- CPA and TCPA are not computed by the server core. Read `navigation.closestApproach` when a
  provider populates it, degrade gracefully when absent.
- Charts: discover at `GET /signalk/v2/api/resources/charts` (fall back to v1), branch on
  chart `type`, honor `bounds` and zoom limits. Layering order, visibility, and opacity are
  Binnacle's job.
- Course data (the v2 Course API) DOES stream over the v1 WebSocket as deltas: the server emits
  `navigation.course.*` and `navigation.course.calcValues.*` to delta-stream subscribers. But because
  those deltas carry the `SKVersion.v2` flag, they are NOT in the v1 full data model, so under
  `subscribe=none` the server sends no cached value until the next change. The pattern is therefore
  hydrate the initial snapshot once via a v2 REST GET (`GET /signalk/v2/api/vessels/self/navigation/
  course` and `/calcValues`) when a course becomes active, then keep it live from the stream. Course
  MUTATIONS (activate a route, advance, clear) are v2 REST PUT and DELETE; the stream is read-only for
  course. The course state machine is built into the server core (present on any 2.x server); the
  derived `calcValues` (XTE, VMG, DTW, BTW, ETA) come from a separate course-provider plugin that
  ships by default but can be absent, so compute them client-side as a fallback (the
  `navigation.closestApproach` degrade pattern). Autopilot (v2) is still a later spec.
- Bundle the app's own assets locally (fonts, icons, worker): no CDN for code. The MAP base is
  the deliberate exception: it is an online vector tile source (OpenFreeMap), because shipping a
  world basemap inline is not feasible. Offline operation is achieved by CACHING that source (a
  service-worker runtime cache plus an optional pre-downloaded PMTiles region), not by removing
  it. Do not replace the base map with a flat inline style to satisfy "offline": that yields a
  blank map. Verify reachability before assuming a host is unreachable; OpenFreeMap resolves and
  returns 200 from the boat network.
- The offline/PWA caching (vite-plugin-pwa service worker) only activates in a SECURE CONTEXT:
  HTTPS or http://localhost. The Signal K server serves Binnacle over plain http on the LAN by
  default, where the browser disables the entire serviceWorker and CacheStorage APIs, so offline
  caching is inert. The app must DEGRADE CLEANLY there (registerSW no-ops, OnlineStatus falls back
  to navigator.onLine, zero errors), which it does. To activate offline, enable SSL in the Signal K
  server (Server > Settings > SSL). Do not chase "the service worker is not registering" as a code
  bug without first checking `window.isSecureContext`.
- A SECURE CONTEXT alone is NOT enough: the browser must also TRUST the server's certificate. A
  self-signed certificate (including one the signalk-ssl plugin generates, issued by a local
  "SignalK Local CA") is not trusted by default, and browsers refuse to register a service worker
  from an origin whose certificate they do not trust, even after the user clicks through the page's
  certificate warning. The symptom is `onRegisterError` firing with a SecurityError whose message is
  "An SSL certificate error occurred when fetching the script", and offline caching staying off while
  the page itself loads. The fix is environmental, not code: install the certificate (or its CA root)
  into the browser or OS trust store and mark it trusted, then reload. register.ts detects this case
  and logs an actionable info line rather than an alarming warning. Over plain http the serviceWorker
  API is absent so registerSW no-ops; over https with an untrusted cert the API is present so
  registration is attempted and fails on the cert, which is a different path from the plain-http one.
- Never import `@signalk/server-api` in browser or worker code, not even as a type-only import.
  Its entry barrel re-exports `FullSignalK`, which extends Node's `EventEmitter`; bundled into the
  worker with `events` externalized, the base class is `undefined` and the worker dies at load with
  "Class extends value undefined". Mirror the few wire types the client needs in
  `src/shared/signalk/types.ts` instead. The "events externalized for browser" build warning is the
  tell. The package may be a dev-only dependency for server-side code, but the foundation has none.
- Guard every WebSocket `send` on `readyState === WebSocket.OPEN`. The first subscriptions can be
  issued while the socket is still CONNECTING; dropping the send is safe because the subscription
  registry resubscribes everything on open.
- Every release must hold 100% Signal K compliance, and project files must be written per the
  Signal K spec to achieve it.

## Build policy (every major step)

- Agent team: each major step may use an agent team of up to 6 expert agents, with at least one
  Signal K expert on steps that touch the integration. Give each a distinct, non-overlapping
  lens to avoid file conflicts.
- Cleanup gate: each major step finishes with the `/cleanup` skill.
- Fix everything: fix every finding from review, cleanup, linters, and human review, including
  low and nit. The only acceptable skip is factually refuted or by-design after honest
  scrutiny, with a one-line reason.
- Verification: after fixing, run type-check, tests, lint, and build, and confirm green before
  claiming a step done. Respect the Pi memory budget below.
- Each numbered step in the spec's build order is a major step under this policy.

## Pi memory budget: one heavy verification at a time

This runs on a Raspberry Pi 5 (8 GB RAM, 4 cores). Concurrent heavy verification commands
(type-check, lint, test, build) will OOM-kill the session. Never run more than one heavy
command at a time, whether by the lead or by spawned agents. Agent prompts must explicitly
forbid running heavy commands; agents do edits, the lead runs verification. Prefix heavy
invocations with `NODE_OPTIONS="--max-old-space-size=2048"` as a backstop.

## Style rules (override defaults)

- American English everywhere (color, behavior, center, gray), not British. Code, docs,
  commits, comments, and any text passed to subagents.
- No em dashes anywhere. Use a colon, a comma, or two sentences.
- Always use the Oxford (serial) comma in lists of three or more.
- No "&" in human-readable text (UI labels, headings, prose, comments); always write "and". The
  "&" is fine only where syntax requires it: URL query separators, HTML entities, code operators,
  and TypeScript intersection types.
- Default to no comments. Keep only non-obvious why comments. Delete what comments.
- These apply to text I write and to instructions passed to subagents; brief them on the same
  rules so their output does not reintroduce violations.

## Workflow

- Brainstorming artifacts live in `.superpowers/brainstorm/`, gitignored.
- Design specs live in `docs/superpowers/specs/` and build plans in `docs/superpowers/plans/`.
  These are local-only working notes: `docs/superpowers/` is gitignored and is NOT committed to the
  repo. Each differentiator gets its own brainstorm, spec, and plan: active-safety CoPilot, weather
  and routing, anchor intelligence, the liveaboard dashboard, and multi-station watch handoff. The
  offline and PWA pipeline is the spec immediately after the foundation.
