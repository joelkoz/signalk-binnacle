# Binnacle note detail panel: design spec

Status: approved 2026-06-02.

## Goal

Render Signal K `notes` (points of interest from Crow's Nest, ActiveCaptain, the USCG Light
List, OpenSeaMap, and NOAA ENC) as native, structured detail in a slide-in side panel, instead
of the current plain-text-and-external-link popup. Leverage the new presentation-neutral
`properties.crowsNest` schema that Crow's Nest publishes alongside the HTML description, and
degrade cleanly to plain text for any provider that does not carry it.

## Background

Binnacle today fetches only the notes list (`GET /resources/notes?bbox=`) and, on marker click,
shows a small MapLibre popup with the name, category, attribution, and a "View details" link
that leaves the chart for an external source viewer. The list carries no description for
Crow's Nest POIs, so there is effectively no on-chart detail.

Crow's Nest now publishes, on every note, a normalized view under `properties.crowsNest`,
carried alongside (never instead of) the HTML `description`. The integration contract is
documented in `~/src/signalk-crows-nest/docs/notes-resource-format.md`. The format is live on
this boat's server (the server symlinks the repo working tree) and was confirmed against a real
detail response. The schema-bearing commits are post-0.7.0 and unpublished, so other users on
the released Crow's Nest will not have sections until a Crow's Nest 0.8.0 is cut; Binnacle must
degrade cleanly regardless.

## The wire contract (mirrored, not imported)

Per the project rule against importing external packages into browser code, Binnacle mirrors the
few wire types it needs in a new `features/notes/notes-detail.ts`. The schema is `schemaVersion`
1:

```ts
type NormalizedItemKind =
  | 'text' | 'measure' | 'count' | 'availability' | 'flag' | 'rating' | 'link' | 'note';

interface NormalizedItem {
  label: string;
  value: string | number | boolean;
  kind?: NormalizedItemKind; // absent means text
  unit?: string;             // for 'measure', e.g. "NM", "ft", "m"
}

interface NormalizedSection {
  id: string;    // stable machine id, e.g. "light", "fuel", "remarks"
  title: string; // human heading, e.g. "Light"
  items: NormalizedItem[];
}

type PoiType =
  | 'Marina' | 'Anchorage' | 'Hazard' | 'Business' | 'BoatRamp' | 'Bridge'
  | 'Dam' | 'Ferry' | 'Inlet' | 'Lock' | 'LocalKnowledge' | 'Navigational'
  | 'Airport' | 'Unknown';
```

Endpoints:

- List: `GET /signalk/v2/api/resources/notes?bbox=[w,s,e,n]` (v1 fallback). Each entry carries
  `properties.crowsNest = { schemaVersion, type }` (no sections, no description). Unchanged from
  today except that we now read `crowsNest.type`.
- Detail: `GET /signalk/v2/api/resources/notes/{id}` (v1 fallback). Adds
  `properties.crowsNest.sections` plus the HTML `description`, `properties.attribution`, and
  `properties.sources` (every source that corroborated a deduped POI).

Fallback contract: if `properties.crowsNest` is absent, or `schemaVersion` is not 1, or
`sections` is not an array, render the plain-text reduction of the HTML `description`. An unknown
`kind` renders as text. New section ids and item labels are rendered as they arrive; nothing is
hardcoded to an expected set.

## Architecture (Feature-Sliced)

Everything notes-specific stays in `features/notes`. The app shell owns the selection state and
renders the panel. No new cross-feature imports; imports flow down only.

Files:

- Create `src/features/notes/notes-detail.ts`: mirrored types above, `NoteDetail`, the detail
  fetch, and a cache-owning loader factory.
- Create `src/features/notes/NoteDetailPanel.svelte`: the slide-in panel.
- Modify `src/features/notes/notes-client.ts`: prefer `crowsNest.type` for the marker category;
  export the selection type.
- Modify `src/features/notes/poi-categories.ts`: add `poiCategoryForType(type)`.
- Modify `src/features/notes/notes-overlay.ts`: replace the click popup with a selection
  callback and a `deselect` command, and remove `popupContent`. `safeHttpUrl` and `plainText`
  move to `notes-detail.ts` (the overlay no longer needs them once `popupContent` is gone);
  `fetchNoteDetail` uses `plainText`, the panel uses `safeHttpUrl`. Their tests move with them.
- Modify `src/features/notes/index.ts`: export `NoteDetailPanel`, `createNoteDetailLoader`,
  `NoteDetail`, `NoteSelection`, and the section types.
- Modify `src/widgets/chart-canvas/ChartCanvas.svelte`: thread an `onNoteSelect` callback to the
  overlay and expose `clearNoteSelection` on `MapCommands`.
- Modify `src/widgets/chart-canvas/commands.ts`: add `clearNoteSelection()` to `MapCommands`.
- Modify `src/app/App.svelte`: hold `selectedNote`, construct the loader, render the panel, and
  clear the ring on close.

## Data layer

```ts
interface NoteDetail {
  id: string;
  name: string;
  type?: PoiType;
  sections?: NormalizedSection[]; // structured path
  fallbackText?: string;          // plain text from the HTML description
  attribution?: string;
  sources?: string[];
  url?: string;
}

// Primitive: one GET, v2 then v1, same auth as the list. Returns undefined on a network or
// parse failure so the panel can show a retry state.
async function fetchNoteDetail(
  base: string, token: string | undefined, id: string,
): Promise<NoteDetail | undefined>;

// Cache-owning loader so reopening a marker is instant and tests can inject a fetcher.
interface NoteDetailLoader {
  load(id: string): Promise<NoteDetail | undefined>;
  clear(): void;
}
function createNoteDetailLoader(
  base: string, token: string | undefined,
): NoteDetailLoader;
```

Parsing in `fetchNoteDetail`: read `crowsNest`. If `schemaVersion === 1` and `sections` is an
array, populate `sections`; else set `fallbackText = plainText(description)`. Always populate
`name`, `type`, `attribution`, `sources`, and `url` when present. The loader memoizes by id in a
`Map<string, NoteDetail>`; a `load` for an in-flight or cached id reuses it. The loader does not
cache `undefined` (a failed fetch is retryable).

Marker category upgrade: `poiCategoryForType(type: PoiType): PoiCategory | undefined` maps
`Marina -> marina`, `Anchorage -> anchorage`, `Hazard -> hazard`, `Business -> services`,
`BoatRamp -> ramp`, `Bridge -> bridge`, `Dam -> structure`, `Lock -> structure`,
`Ferry -> structure`, `Inlet -> inlet`, `Navigational -> navaid`, and
`LocalKnowledge`/`Airport`/`Unknown -> undefined`. In `notes-client`, the marker category is
`poiCategoryForType(crowsNest.type) ?? categoryForSkIcon(skIcon)`, so an explicit type wins and a
note without `crowsNest` keeps today's behavior. `navaid` still resolves its type-specific symbol
from the name via the existing `navaidClassify`.

## Selection flow

```ts
interface NoteSelection {
  id: string;
  name: string;
  category: PoiCategory;
  attribution?: string;
  url?: string;
}
```

- `createNotesOverlay(serverBase, token, onSelect?)`: on marker click, draw the selection ring
  and call `onSelect(selection)` built from the marker feature properties. The overlay no longer
  creates a MapLibre `Popup`. It gains `deselect(ctx)` which clears the ring.
- `ChartCanvas` passes `onNoteSelect` into the overlay and adds
  `clearNoteSelection: () => notesOverlay.deselect(ctx)` to the `MapCommands` it hands back via
  `onCommandsReady`.
- `App` holds `let selectedNote = $state<NoteSelection | undefined>()`, sets it from
  `onNoteSelect`, renders `<NoteDetailPanel>` when defined, and on panel close sets it to
  `undefined` and calls `mapCommands.clearNoteSelection()`. Selecting a different marker replaces
  the selection and moves the ring.

## The panel

`NoteDetailPanel.svelte`, props:

```ts
interface Props {
  selection: NoteSelection;
  load: (id: string) => Promise<NoteDetail | undefined>;
  onClose: () => void;
}
```

Layout: a right-side slide-in inside the chart-host, full chart height, themed from the CSS
tokens (day, dusk, and night-red), matching the existing panel styling. On a narrow viewport
(max-inline-size breakpoint) it becomes a bottom sheet (docked to the block end, capped height,
scrollable). The chart stays interactive; the marker stays ringed.

Behavior: a `$state` holds `detail`, `loading`, and `error`. An `$effect` keyed on
`selection.id` calls `load(id)`, tracking the requested id and ignoring a stale resolve so a fast
marker switch cannot show the wrong detail. The header (name from `selection`, type label,
rating stars if a `rating` item is present, close button) shows immediately; the body shows a
loading state until `load` resolves.

Rendering, one shape across all sources, dispatched by `kind`:

- `measure`: `label` then `value unit` (shown in provider units; no conversion in v1).
- `availability`: a badge reading Yes, Nearby, or No.
- `flag`: an on/off toggle from the boolean value.
- `rating`: 0-to-5 stars from the numeric value.
- `count`, `text`, and any unknown kind: `label : value` as text.
- `note`: prose (preserves line breaks as text, never markup).
- `link`: an anchor through `safeHttpUrl` (http and https only), opened in a new tab.

Footer: `attribution`, then each entry of `sources` not already covered, then a secondary
external "View source" link from `url` (also `safeHttpUrl`-guarded). The note `name` is the panel
title and is never repeated inside the sections.

States: loading, loaded-with-sections, loaded-with-fallback-text, loaded-but-empty ("No
additional detail"), and error-with-retry (a button that re-calls `load`).

## Security and degradation

- All section values render as `textContent`; links are scheme-checked. No `{@html}`, so the
  HTML-injection surface that the plain-text reduction guarded against is gone on the structured
  path and retained (plain text) on the fallback path.
- No `crowsNest`, an unknown `schemaVersion`, or a non-Crow's-Nest provider all fall back to the
  plain-text description, so the panel works against any Signal K notes source. This preserves
  Binnacle's "100% Signal K compliance, degrade cleanly" rule.
- The feature ships independent of a Crow's Nest release: with sections it is rich, without them
  it matches today's information (plus the in-app panel instead of an external bounce).

## Testing

- `notes-detail.test.ts`: `fetchNoteDetail` parses a schema-1 detail into `sections`; falls back
  to `fallbackText` when `crowsNest` is absent or `schemaVersion` is unrecognized; returns
  `undefined` on a non-ok response and on a thrown fetch; the loader caches by id (one fetch for
  two `load`s) and does not cache a failure.
- `poi-categories.test.ts`: `poiCategoryForType` maps the known types and returns `undefined` for
  `Unknown`, `Airport`, and `LocalKnowledge`; `notes-client` prefers the type over the skIcon.
- `notes-overlay.test.ts`: a marker click calls `onSelect` with the selection and rings the
  marker; `deselect` clears the ring; no `Popup` is created.
- The panel has no unit test (matching the repo's other Svelte components); it is verified live.

## Build order

Each step ends with the full gate (`biome ci`, `cruise`, `check`, `test`, `build`), one heavy
command at a time per the Pi budget, and a commit only on green.

1. `notes-detail.ts`: mirrored types, `fetchNoteDetail`, and `createNoteDetailLoader`
   (test-first). Move `safeHttpUrl` and `plainText` here and re-export.
2. `poi-categories.ts` plus `notes-client.ts`: `poiCategoryForType` and the type-first marker
   category (test).
3. `NoteDetailPanel.svelte`: render sections by kind, the states, and the responsive layout.
4. Wiring: overlay selection callback and `deselect`, remove the popup, `ChartCanvas` plus
   `MapCommands.clearNoteSelection`, and the App panel and selection state.
5. Live-verify on `https://boatpi:3443/binnacle/` against a marina, a light, a hazard, and a
   non-Crow's-Nest note (fallback). Then CHANGELOG and README.

## Out of scope (later)

- Unit conversion of `measure` values to the user's preferred units (shown as provider units for
  now).
- Reviews pagination or media beyond what the sections carry.
- Persisting the last-opened note across a refresh.
- Cutting the Crow's Nest 0.8.0 release that publishes the schema (a separate repo's task).
