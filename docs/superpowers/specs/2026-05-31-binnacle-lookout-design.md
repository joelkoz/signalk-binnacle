# Binnacle Differentiator: Lookout (Active-Safety) Design

Status: approved. This is the first differentiator spec after the completed foundation. It follows
the foundation design (`2026-05-31-binnacle-foundation-design.md`) and the project rules in
`CLAUDE.md`: Feature-Sliced Design with machine-enforced boundaries, modularity as a drop-in rule,
SI units in the store, offline-first, 100% Signal K conformance, and night-watch-first theming.

The feature is named Lookout, after the crew role posted to watch for collision danger. (It was
brainstormed under the working name "CoPilot," renamed to avoid the Microsoft trademark.)

## 1. Purpose

Lookout surfaces collision danger before the navigator asks for it: the "active danger surfacing"
pillar of the product. It watches AIS traffic against the own vessel, ranks targets by closest point
of approach (CPA) and time to CPA (TCPA), and raises a graded alert through a danger strip, a chart
highlight, an audible alarm, and the Signal K notifications tree. It is a self-contained feature
dropped in against the stable interfaces the foundation already exposes (the `OwnVessel` and
`AisTargets` entities, the `LayerManager` safety band, the theme tokens, and the worker), never
surgery on the core.

## 2. Decisions locked in this brainstorm

1. **CPA/TCPA source: server-preferred with a client-side fallback.** When a Signal K provider
   populates `navigation.closestApproach`, Lookout uses it. When it is absent (common offshore with
   no derived-data plugin installed), Lookout computes CPA and TCPA itself from the own vessel and
   target position and velocity. The provider value always wins when present, so the boat's
   better-tuned provider is never overridden.
2. **Alert stack: visual, audible, and Signal K notifications.** A color-graded danger strip
   (theme-aware, using the `--alarm` token), a synthesized Web Audio alarm tone (no asset, works
   offline) with acknowledge and mute, and publication to the Signal K `notifications` tree so the
   server and other devices react.
3. **v1 on-screen scope: danger strip, chart highlight, and acknowledge/mute.** The strip lists the
   most dangerous targets; those targets are highlighted on the chart in the safety band; an
   acknowledge/mute control silences the audio until severity escalates.
4. **Thresholds: user-configurable from the start.** A settings panel lets the navigator set the CPA
   distance and TCPA time thresholds for the danger and warning bands, persisted locally, with tuned
   defaults out of the box.
5. **Notification granularity: one notification for the single worst target.** v1 publishes a single
   `notifications.navigation.collision` for the worst current contact, not one per target, to avoid
   flooding the tree. Per-target notifications are a later refinement.
6. **Settings surface: a small standalone panel** reusing the layers-panel styling, rather than
   waiting on a future general settings surface.

## 3. Architecture

Imports flow down only (`app -> views -> widgets -> features -> entities -> shared`). The danger
assessment is shared state consumed by several surfaces (the strip, the chart highlight, the audio,
and the notifications publisher), so it lives in an `entities` store, never feature to feature. The
feature slice is `features/lookout`; the cross-feature data lives in `entities/collision`.

### shared (lowest layer, pure and injectable)

- `shared/nav/cpa.ts`: pure CPA/TCPA math, built test-first. Input is SI: own and target latitude,
  longitude (degrees, the one position exception), speed over ground (m/s), and course over ground
  (radians). It projects to a local east-north plane around the own vessel, forms the relative
  position and relative velocity, solves `tcpa = -(dr . dv) / (dv . dv)` clamped to `tcpa >= 0`
  (a target already past or opening returns `closing: false`), and returns
  `{ cpaMeters, tcpaSeconds, closing }`. Small-angle local projection is accurate at the ranges that
  matter for collision (within a few nautical miles); the limit is noted explicitly.
- `shared/audio/alarm.ts`: an `AlarmTone` over the Web Audio API: an oscillator plus gain envelope
  producing a distinguishable two-tone beep, `start`/`stop`/`mute`, created lazily on first user
  gesture (browsers block autoplay until interaction). No audio asset ships; it is synthesized.
- `shared/settings/persisted.svelte.ts`: a small generic persisted-settings runes helper (the same
  shape as the theme controller: validate, persist to `localStorage`, expose a reactive value),
  reused for the Lookout thresholds. Generalizing the theme controller's persistence into this
  helper is an allowed refactor; the theme controller may adopt it.
- `shared/signalk`: add an outbound notifications path. The worker gains a `publishNotification`
  method that sends a Signal K delta for `notifications.*` over the existing v1 WebSocket (or v2 REST
  if the stream rejects writes), bridged through Comlink like the existing client. This is the
  foundation's first server write path and stays isolated in `shared/signalk`.

### entities (cross-feature shared state)

- `entities/collision/collision.svelte.ts`: a `CollisionAssessment` store. It reads `OwnVessel` and
  `AisTargets` and the threshold settings, and on each AIS update produces a ranked list of
  `DangerContact { id, name, cpaMeters, tcpaSeconds, severity, source }` where `severity` is
  `danger | warning | clear`, `source` is `provider | computed`, and the list is sorted most
  dangerous first. For each target it prefers `navigation.closestApproach` (the provider value, which
  `AisTargetView` already exposes as `cpaMeters`/`tcpaSeconds`) and falls back to `shared/nav/cpa`.
  Targets that are opening or have passed are `clear`. It exposes the worst current severity, the
  ranked contacts, and an `acknowledged` flag managed by the UI.

### features (drop-in, behind the public index)

- `features/lookout`: one feature slice exposing several pieces through its `index.ts`:
  - `DangerStrip.svelte`: the shell strip. Renders the top dangerous contacts with CPA and TCPA in
    tabular monospace, color-graded by severity from the theme tokens, an acknowledge/mute button,
    and a "no CPA provider, computing locally" affordance when `source` is `computed`. Empty and calm
    when nothing is dangerous (the brightest-pixel-low rule at night).
  - `createCollisionOverlay`: an `OverlayModule` in the existing `safety` z-band that highlights
    danger and warning contacts on the chart (a graded ring or halo around the AIS symbol), dirty
    checked against the assessment version, and theme-aware via the `applyTheme` seam added in the
    foundation.
  - `LookoutAlarm`: wires the `CollisionAssessment` worst severity to `shared/audio/alarm` and to
    `shared/signalk` notifications, honoring acknowledge/mute and only re-alarming when severity
    escalates or a new danger appears.
  - `ThresholdSettings.svelte`: the configurable-thresholds panel (CPA nm and TCPA minutes for the
    danger and warning bands), bound to the persisted settings.
- The feature self-registers following the current foundation wiring pattern (direct registration in
  `app`/the chart widget, as the existing overlays do). The design's `FeatureManifest` registry is
  still deferred; this feature does not require it and must not be blocked on it.

### app / views / widgets

- The danger strip mounts in the shell's bottom danger-strip slot (the foundation shell already
  reserves status and danger strip rows). The settings panel opens from the shell chrome. The
  collision overlay registers with the `LayerManager` alongside the AIS overlay.

## 4. Data flow

1. The worker delivers batched AIS targets and own-vessel data to the store each animation frame
   (existing foundation behavior).
2. `CollisionAssessment` recomputes when the AIS version or own-vessel fix changes: per target, take
   the provider CPA/TCPA if present, else compute it; classify against the current thresholds; drop
   opening/passed targets to `clear`; rank by severity then TCPA.
3. The danger strip renders the ranked contacts; the collision overlay highlights danger and warning
   targets in the safety band; `LookoutAlarm` sounds the tone and publishes a single notification for
   the worst unacknowledged contact.
4. Acknowledge/mute silences the audio and marks the current danger acknowledged until severity
   escalates or a new danger appears.
5. The settings panel edits thresholds; the assessment recomputes immediately and persists.

## 5. Signal K conformance

- Consume `navigation.closestApproach` (already subscribed in the foundation) for provider CPA/TCPA.
- Publish to the `notifications` tree per the Signal K notification spec: a single value at
  `notifications.navigation.collision` of `{ state, method, message }` with `state` mapping danger to
  `alarm` and warning to `warn`, `method` including `visual` and `sound`. Update on change only;
  clear to `normal` when danger passes; never spam per frame.
- Degrade gracefully: no AIS yields no dangers; no own position or course yields a "position needed"
  state rather than a crash or a false all-clear; no CPA provider silently uses the computed fallback
  and labels it.
- Offline-first: the alarm tone is synthesized (no asset), settings live in `localStorage`, and the
  computed fallback means Lookout works with zero server-side plugins.
- All values SI in the store and the math; convert to nautical miles and minutes only at the display
  edge, reusing the foundation's unit module (`$shared/lib`).

## 6. Modularity

Lookout is a drop-in feature against stable interfaces: it reads the `OwnVessel` and `AisTargets`
entities, registers an overlay in the `LayerManager` safety band, mounts UI in reserved shell slots,
draws color from the theme tokens, and uses the worker's new notification path. The core holds no
Lookout-specific knowledge; removing the `features/lookout` folder and its registrations removes the
feature cleanly. dependency-cruiser must stay green (no cross-feature imports, public-API only).

## 7. Build order (each a major step: ends with /cleanup and the gate)

1. CPA/TCPA math in `shared/nav` (test-first) and the `CollisionAssessment` entity (provider
   preferred, computed fallback, thresholds, classification, ranking), with unit tests.
2. The danger strip widget and its shell slot, theme-aware, with the acknowledge/mute control.
3. The collision chart-highlight overlay in the safety band, dirty-checked and theme-aware.
4. The audible alarm (`shared/audio`) wired to severity, with mute and acknowledge.
5. Signal K notifications publishing (the worker write path in `shared/signalk`).
6. The configurable thresholds settings panel and persistence (`shared/settings`).

Each step is independently testable and shippable. Steps may be split across more than one
implementation plan, but this is one spec.

## 8. Deferred (own later specs)

COLREGS classification and bearing-sector logic, drawn guard zones and range rings, trial-maneuver
projection, own-track and target-track prediction beyond the CPA point, per-ship-class danger
weighting, per-target notifications, and radar overlay. These build on Lookout but are out of scope
for v1.
