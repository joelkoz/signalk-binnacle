# Note Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Signal K notes (POIs) as native structured detail in a slide-in side panel, leveraging Crow's Nest's `properties.crowsNest` schema, with a clean plain-text fallback.

**Architecture:** New `features/notes/notes-detail.ts` (mirrored wire types, `fetchNoteDetail`, a cache-owning loader) and `NoteDetailPanel.svelte`. The overlay reports a selection up instead of opening a popup; the app holds the selection and renders the panel in the chart-host.

**Tech Stack:** Svelte 5 runes, TypeScript, MapLibre GL, Vitest, Biome, dependency-cruiser. Spec: `docs/superpowers/specs/2026-06-02-binnacle-note-detail-design.md`.

**Pi rule:** one heavy verification at a time. Each task ends with the gate (`biome ci`, `cruise`, `check`, `test`, `build`), each command run alone, prefixed `NODE_OPTIONS="--max-old-space-size=2048"`, and a commit only when all are green.

---

## File structure

- Create `src/features/notes/notes-detail.ts`: mirrored types (`NormalizedItemKind`, `NormalizedItem`, `NormalizedSection`, `PoiType`), `NoteDetail`, `plainText`, `safeHttpUrl` (moved from the overlay), `fetchNoteDetail`, `createNoteDetailLoader`.
- Create `src/features/notes/notes-detail.test.ts`.
- Create `src/features/notes/NoteDetailPanel.svelte`.
- Modify `src/features/notes/poi-categories.ts`: add `poiCategoryForType`.
- Modify `src/features/notes/poi-categories.test.ts`: cover it.
- Modify `src/features/notes/notes-client.ts`: prefer `crowsNest.type`; add and export `NoteSelection`.
- Modify `src/features/notes/notes-overlay.ts`: selection callback + `deselect`; remove `popupContent`/`Popup`; put `id` in feature props; drop the moved helpers.
- Modify `src/features/notes/notes-overlay.test.ts`: move `safeHttpUrl` tests out; assert selection behavior.
- Modify `src/features/notes/index.ts`: export the new surface.
- Modify `src/widgets/chart-canvas/commands.ts`: add `clearNoteSelection`.
- Modify `src/widgets/chart-canvas/ChartCanvas.svelte`: thread `onNoteSelect`; wire `clearNoteSelection`.
- Modify `src/app/App.svelte`: selection state, loader, panel render, close handler.
- Modify `CHANGELOG.md`, `README.md`.

---

## Task 1: notes-detail.ts (types, fetch, loader)

**Files:** Create `src/features/notes/notes-detail.ts`, `src/features/notes/notes-detail.test.ts`.

- [ ] **Step 1: Write the failing test.** Create `src/features/notes/notes-detail.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createNoteDetailLoader,
  fetchNoteDetail,
  plainText,
  safeHttpUrl,
} from './notes-detail';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const structured = {
  name: 'Whipple Point Light',
  url: 'https://example/poi/1',
  description: '<h4>Whipple Point Light</h4>',
  properties: {
    attribution: '© USCG',
    sources: ['usclightlist'],
    crowsNest: {
      schemaVersion: 1,
      type: 'Navigational',
      sections: [
        {
          id: 'light',
          title: 'Light',
          items: [
            { label: 'Character', value: 'Fl W 4s', kind: 'text' },
            { label: 'Nominal range', value: 14, kind: 'measure', unit: 'NM' },
          ],
        },
      ],
    },
  },
};

describe('fetchNoteDetail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses a schema-1 detail into sections', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, structured)));
    const detail = await fetchNoteDetail('http://pi', 'tok', 'lll-1');
    expect(detail).toMatchObject({
      id: 'lll-1',
      name: 'Whipple Point Light',
      type: 'Navigational',
      attribution: '© USCG',
      sources: ['usclightlist'],
      url: 'https://example/poi/1',
    });
    expect(detail?.sections).toHaveLength(1);
    expect(detail?.sections?.[0].items[1]).toEqual({
      label: 'Nominal range',
      value: 14,
      kind: 'measure',
      unit: 'NM',
    });
    expect(detail?.fallbackText).toBeUndefined();
  });

  it('falls back to plain text when crowsNest is absent', async () => {
    const body = { name: 'Plain Note', description: '<p>Hello <b>there</b></p>', properties: {} };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, body)));
    const detail = await fetchNoteDetail('http://pi', undefined, 'n1');
    expect(detail?.sections).toBeUndefined();
    expect(detail?.fallbackText).toBe('Hello there');
  });

  it('falls back when the schemaVersion is unrecognized', async () => {
    const body = {
      name: 'Future Note',
      description: '<p>future</p>',
      properties: { crowsNest: { schemaVersion: 2, type: 'Marina', sections: [] } },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, body)));
    const detail = await fetchNoteDetail('http://pi', undefined, 'n2');
    expect(detail?.sections).toBeUndefined();
    expect(detail?.fallbackText).toBe('future');
  });

  it('tries v1 when v2 is not ok', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(200, structured));
    vi.stubGlobal('fetch', fetchMock);
    const detail = await fetchNoteDetail('http://pi', undefined, 'lll-1');
    expect(detail?.name).toBe('Whipple Point Light');
    expect(fetchMock.mock.calls[1][0]).toContain('/signalk/v1/api/resources/notes/lll-1');
  });

  it('returns undefined on error and on a thrown fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));
    expect(await fetchNoteDetail('http://pi', undefined, 'x')).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('net')));
    expect(await fetchNoteDetail('http://pi', undefined, 'x')).toBeUndefined();
  });
});

describe('createNoteDetailLoader', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('caches by id and does not cache a failure', async () => {
    // A failed load does both v2 and v1 (two fetches) and is not cached; the next load
    // succeeds on v2 (one fetch) and is cached, so the third load does not fetch.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {})) // load1 v2
      .mockResolvedValueOnce(jsonResponse(500, {})) // load1 v1
      .mockResolvedValue(jsonResponse(200, structured)); // load2 v2
    vi.stubGlobal('fetch', fetchMock);
    const loader = createNoteDetailLoader('http://pi', 'tok');
    expect(await loader.load('lll-1')).toBeUndefined();
    expect((await loader.load('lll-1'))?.name).toBe('Whipple Point Light');
    await loader.load('lll-1'); // cached, no fetch
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('plainText and safeHttpUrl', () => {
  it('strips tags and collapses whitespace', () => {
    expect(plainText('<p>a   <b>b</b></p>\n c')).toBe('a b c');
  });
  it('allows only http(s) urls', () => {
    expect(safeHttpUrl('https://x.test/p')).toBe('https://x.test/p');
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('not a url')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.** Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/notes/notes-detail` Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `src/features/notes/notes-detail.ts`:

```ts
export type NormalizedItemKind =
  | 'text'
  | 'measure'
  | 'count'
  | 'availability'
  | 'flag'
  | 'rating'
  | 'link'
  | 'note';

export interface NormalizedItem {
  label: string;
  value: string | number | boolean;
  kind?: NormalizedItemKind;
  unit?: string;
}

export interface NormalizedSection {
  id: string;
  title: string;
  items: NormalizedItem[];
}

export type PoiType =
  | 'Marina'
  | 'Anchorage'
  | 'Hazard'
  | 'Business'
  | 'BoatRamp'
  | 'Bridge'
  | 'Dam'
  | 'Ferry'
  | 'Inlet'
  | 'Lock'
  | 'LocalKnowledge'
  | 'Navigational'
  | 'Airport'
  | 'Unknown';

export interface NoteDetail {
  id: string;
  name: string;
  type?: PoiType;
  sections?: NormalizedSection[];
  fallbackText?: string;
  attribution?: string;
  sources?: string[];
  url?: string;
}

const V2 = '/signalk/v2/api/resources/notes';
const V1 = '/signalk/v1/api/resources/notes';

// Reduce HTML to plain text; we never inject provider markup.
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A provider url is untrusted, so follow only http(s); this rejects javascript: and data:.
export function safeHttpUrl(raw: string): string | undefined {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {
    // not a parseable absolute url
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function strArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return out.length > 0 ? out : undefined;
}

function isItemKind(value: unknown): value is NormalizedItemKind {
  return (
    value === 'text' ||
    value === 'measure' ||
    value === 'count' ||
    value === 'availability' ||
    value === 'flag' ||
    value === 'rating' ||
    value === 'link' ||
    value === 'note'
  );
}

function parseItem(raw: unknown): NormalizedItem | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { label?: unknown; value?: unknown; kind?: unknown; unit?: unknown };
  const label = str(r.label);
  if (label === undefined) return undefined;
  const value = r.value;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return undefined;
  }
  const item: NormalizedItem = { label, value };
  if (isItemKind(r.kind)) item.kind = r.kind;
  const unit = str(r.unit);
  if (unit !== undefined) item.unit = unit;
  return item;
}

function parseSections(raw: unknown): NormalizedSection[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const sections: NormalizedSection[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const sec = s as { id?: unknown; title?: unknown; items?: unknown };
    const title = str(sec.title);
    if (title === undefined || !Array.isArray(sec.items)) continue;
    const items = sec.items.map(parseItem).filter((i): i is NormalizedItem => i !== undefined);
    if (items.length === 0) continue;
    sections.push({ id: str(sec.id) ?? title, title, items });
  }
  return sections.length > 0 ? sections : undefined;
}

async function tryFetch(
  url: string,
  token: string | undefined,
  id: string,
): Promise<NoteDetail | undefined> {
  try {
    const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
    const response = await fetch(url, init);
    if (!response.ok) return undefined;
    const body = await response.json();
    if (!body || typeof body !== 'object') return undefined;
    const note = body as {
      name?: unknown;
      title?: unknown;
      url?: unknown;
      description?: unknown;
      properties?: {
        attribution?: unknown;
        sources?: unknown;
        crowsNest?: { schemaVersion?: unknown; type?: unknown; sections?: unknown };
      };
    };
    const props = note.properties ?? {};
    const cn = props.crowsNest;
    const detail: NoteDetail = {
      id,
      name: str(note.name) ?? str(note.title) ?? id,
      type: typeof cn?.type === 'string' ? (cn.type as PoiType) : undefined,
      attribution: str(props.attribution),
      sources: strArray(props.sources),
      url: str(note.url),
    };
    const sections = cn?.schemaVersion === 1 ? parseSections(cn.sections) : undefined;
    if (sections) detail.sections = sections;
    else detail.fallbackText = plainText(str(note.description) ?? '') || undefined;
    return detail;
  } catch {
    return undefined;
  }
}

export async function fetchNoteDetail(
  base: string,
  token: string | undefined,
  id: string,
): Promise<NoteDetail | undefined> {
  const path = `/${encodeURIComponent(id)}`;
  return (
    (await tryFetch(`${base}${V2}${path}`, token, id)) ??
    (await tryFetch(`${base}${V1}${path}`, token, id))
  );
}

export interface NoteDetailLoader {
  load(id: string): Promise<NoteDetail | undefined>;
  clear(): void;
}

// Memoizes detail by id so reopening a marker is instant; a failed fetch is not cached, so it
// stays retryable. An in-flight load is shared rather than duplicated.
export function createNoteDetailLoader(base: string, token: string | undefined): NoteDetailLoader {
  const cache = new Map<string, NoteDetail>();
  const inflight = new Map<string, Promise<NoteDetail | undefined>>();
  return {
    load(id) {
      const cached = cache.get(id);
      if (cached) return Promise.resolve(cached);
      const pending = inflight.get(id);
      if (pending) return pending;
      const promise = fetchNoteDetail(base, token, id).then((detail) => {
        if (detail) cache.set(id, detail);
        inflight.delete(id);
        return detail;
      });
      inflight.set(id, promise);
      return promise;
    },
    clear() {
      cache.clear();
      inflight.clear();
    },
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes.** Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/notes/notes-detail` Expected: PASS.

- [ ] **Step 5: Gate.** Run, one at a time, all green: `/usr/local/bin/biome check --write src/features/notes`, `/usr/local/bin/biome ci .`, `NODE_OPTIONS="--max-old-space-size=2048" npm run check`, `npm run cruise`, `NODE_OPTIONS="--max-old-space-size=2048" npm test`, `NODE_OPTIONS="--max-old-space-size=2048" npm run build`.

- [ ] **Step 6: Commit.**

```bash
git add src/features/notes/notes-detail.ts src/features/notes/notes-detail.test.ts
git commit -m "feat(notes): structured note-detail client, types, and cache loader" --author="Nearl Crews <23341701+NearlCrews@users.noreply.github.com>"
```

---

## Task 2: type-first marker category

**Files:** Modify `src/features/notes/poi-categories.ts`, `src/features/notes/poi-categories.test.ts`, `src/features/notes/notes-client.ts`.

- [ ] **Step 1: Write the failing test.** Add `poiCategoryForType` to the existing
`./poi-categories` import in `src/features/notes/poi-categories.test.ts` (currently
`import { categoryForSkIcon, categoryLabel, poiIconId } from './poi-categories';`), then append:

```ts
describe('poiCategoryForType', () => {
  it('maps known POI types to categories', () => {
    expect(poiCategoryForType('Marina')).toBe('marina');
    expect(poiCategoryForType('BoatRamp')).toBe('ramp');
    expect(poiCategoryForType('Navigational')).toBe('navaid');
    expect(poiCategoryForType('Lock')).toBe('structure');
  });
  it('returns undefined for types with no dedicated marker', () => {
    expect(poiCategoryForType('Unknown')).toBeUndefined();
    expect(poiCategoryForType('Airport')).toBeUndefined();
    expect(poiCategoryForType('LocalKnowledge')).toBeUndefined();
    expect(poiCategoryForType(undefined)).toBeUndefined();
  });
});
```

(The existing `poi-categories.test.ts` already imports from `vitest` and `./poi-categories`; reuse that import line, just add `poiCategoryForType` to it and append the `describe` block.)

- [ ] **Step 2: Run to confirm fail.** Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/notes/poi-categories` Expected: FAIL.

- [ ] **Step 3: Implement `poiCategoryForType`.** In `src/features/notes/poi-categories.ts`, add the import at the top and the function at the bottom:

```ts
import type { PoiType } from './notes-detail';
```

```ts
// Crow's Nest's explicit POI type, mapped to a marker category. Types with no dedicated
// Binnacle marker return undefined so the caller falls back to skIcon inference.
const TYPE_CATEGORY: Partial<Record<PoiType, PoiCategory>> = {
  Marina: 'marina',
  Anchorage: 'anchorage',
  Hazard: 'hazard',
  Business: 'services',
  BoatRamp: 'ramp',
  Bridge: 'bridge',
  Dam: 'structure',
  Lock: 'structure',
  Ferry: 'structure',
  Inlet: 'inlet',
  Navigational: 'navaid',
};

export function poiCategoryForType(type: PoiType | undefined): PoiCategory | undefined {
  return type ? TYPE_CATEGORY[type] : undefined;
}
```

- [ ] **Step 4: Run to confirm pass.** Run: `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/features/notes/poi-categories` Expected: PASS.

- [ ] **Step 5: Use the type in `notes-client.ts` and add `NoteSelection`.** In `src/features/notes/notes-client.ts`:

Change the import line to add the new symbols:

```ts
import { categoryForSkIcon, type PoiCategory, poiCategoryForType } from './poi-categories';
import type { PoiType } from './notes-detail';
```

Add the selection type near `NotePoint`:

```ts
// The marker reference handed to the app when a note is selected; enough to title the panel
// before its detail loads.
export interface NoteSelection {
  id: string;
  name: string;
  category: PoiCategory;
  attribution?: string;
  url?: string;
}
```

In the `note` shape inside `fetchNotes`, add `crowsNest` to `properties`:

```ts
      properties?: { skIcon?: unknown; source?: unknown; attribution?: unknown; crowsNest?: { type?: unknown } };
```

Replace the `category` assignment in the pushed object:

```ts
      category:
        poiCategoryForType(
          typeof props.crowsNest?.type === 'string' ? (props.crowsNest.type as PoiType) : undefined,
        ) ?? categoryForSkIcon(str(props.skIcon)),
```

(`props` is already `note.properties ?? {}`.)

- [ ] **Step 6: Gate** (all six, one at a time, as in Task 1 Step 5).

- [ ] **Step 7: Commit.**

```bash
git add src/features/notes/poi-categories.ts src/features/notes/poi-categories.test.ts src/features/notes/notes-client.ts
git commit -m "feat(notes): use the explicit crowsNest type for the marker category" --author="Nearl Crews <23341701+NearlCrews@users.noreply.github.com>"
```

---

## Task 3: NoteDetailPanel.svelte

**Files:** Create `src/features/notes/NoteDetailPanel.svelte`. No unit test (matches the repo's Svelte components; verified live in Task 5).

- [ ] **Step 1: Create the component.**

```svelte
<script lang="ts">
import { ExternalLink, Star, X } from '@lucide/svelte';
import type { NoteSelection } from './notes-client';
import type { NoteDetail, NormalizedItem } from './notes-detail';
import { safeHttpUrl } from './notes-detail';
import { categoryLabel } from './poi-categories';

interface Props {
  selection: NoteSelection;
  load: (id: string) => Promise<NoteDetail | undefined>;
  onClose: () => void;
}

const { selection, load, onClose }: Props = $props();

let detail = $state<NoteDetail | undefined>();
let loading = $state(true);
let failed = $state(false);
let attempt = $state(0);

// A new selection or a retry re-runs the load; the object identity changes either way.
const request = $derived({ id: selection.id, attempt });

$effect(() => {
  const { id } = request;
  let active = true;
  loading = true;
  failed = false;
  detail = undefined;
  load(id).then((result) => {
    if (!active) return;
    if (result) detail = result;
    else failed = true;
    loading = false;
  });
  return () => {
    active = false;
  };
});

const rating = $derived.by(() => {
  for (const section of detail?.sections ?? []) {
    for (const item of section.items) {
      if (item.kind === 'rating') return Number(item.value);
    }
  }
  return undefined;
});

const credit = $derived(detail?.attribution ?? selection.attribution);
const extraSources = $derived((detail?.sources ?? []).filter((s) => s !== credit));
const sourceUrl = $derived(safeHttpUrl(detail?.url ?? selection.url ?? ''));

function measure(item: NormalizedItem): string {
  return item.unit ? `${item.value} ${item.unit}` : String(item.value);
}
</script>

<aside class="note-panel" aria-label="Point of interest detail">
  <header>
    <div class="heading">
      <h2>{selection.name}</h2>
      <span class="type">{categoryLabel(selection.category)}</span>
    </div>
    {#if rating !== undefined}
      <div class="rating" aria-label={`Rating ${rating} of 5`}>
        {#each [1, 2, 3, 4, 5] as n (n)}
          <Star size={14} fill={n <= Math.round(rating) ? 'currentColor' : 'none'} aria-hidden="true" />
        {/each}
      </div>
    {/if}
    <button type="button" class="close" aria-label="Close detail" onclick={onClose}>
      <X size={18} aria-hidden="true" />
    </button>
  </header>

  <div class="body">
    {#if loading}
      <p class="status">Loading...</p>
    {:else if failed}
      <p class="status">Could not load detail.</p>
      <button type="button" class="retry" onclick={() => (attempt += 1)}>Retry</button>
    {:else if detail?.sections}
      {#each detail.sections as section (section.id)}
        <section>
          <h3>{section.title}</h3>
          <dl>
            {#each section.items as item, i (item.label + i)}
              {@const linkUrl =
                item.kind === 'link' && typeof item.value === 'string'
                  ? safeHttpUrl(item.value)
                  : undefined}
              <div class="item">
                <dt>{item.label}</dt>
                <dd>
                  {#if item.kind === 'availability'}
                    <span class="badge" data-value={String(item.value).toLowerCase()}>{item.value}</span>
                  {:else if item.kind === 'flag'}
                    <span class="badge" data-value={item.value === true ? 'yes' : 'no'}>
                      {item.value === true ? 'Yes' : 'No'}
                    </span>
                  {:else if linkUrl}
                    <a href={linkUrl} target="_blank" rel="noopener noreferrer">{item.label}</a>
                  {:else if item.kind === 'measure'}
                    {measure(item)}
                  {:else if item.kind === 'note'}
                    <span class="prose">{item.value}</span>
                  {:else}
                    {item.value}
                  {/if}
                </dd>
              </div>
            {/each}
          </dl>
        </section>
      {/each}
    {:else if detail?.fallbackText}
      <p class="prose">{detail.fallbackText}</p>
    {:else}
      <p class="status">No additional detail.</p>
    {/if}
  </div>

  {#if credit || sourceUrl}
    <footer>
      {#if credit}<span class="credit">{credit}</span>{/if}
      {#if extraSources.length > 0}<span class="credit">{extraSources.join(', ')}</span>{/if}
      {#if sourceUrl}
        <a class="source-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
          View source <ExternalLink size={13} aria-hidden="true" />
        </a>
      {/if}
    </footer>
  {/if}
</aside>

<style>
.note-panel {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  inline-size: 22rem;
  max-inline-size: 100%;
  background: var(--surface-overlay);
  border-inline-start: 1px solid var(--border);
  box-shadow: -2px 0 12px rgb(0 0 0 / 0.25);
  color: var(--text);
  font-size: 0.85rem;
  overflow: hidden;
}
header {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-block-end: 1px solid var(--border);
}
.heading {
  flex: 1;
  min-inline-size: 0;
}
.heading h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
.type {
  color: var(--text-muted);
  font-size: 0.75rem;
}
.rating {
  display: inline-flex;
  color: var(--select);
}
.close {
  display: inline-flex;
  padding: 0.2rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.close:hover {
  color: var(--text);
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
}
.body section {
  margin-block-end: 0.75rem;
}
.body h3 {
  margin: 0 0 0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
dl {
  margin: 0;
}
.item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
  padding-block: 0.15rem;
}
dt {
  color: var(--text-muted);
}
dd {
  margin: 0;
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.badge {
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.72rem;
  background: var(--surface);
  color: var(--text-muted);
}
.badge[data-value='yes'] {
  color: var(--accent);
}
.badge[data-value='nearby'] {
  color: var(--select);
}
.prose {
  white-space: pre-line;
  text-align: start;
}
.status {
  margin: 0.25rem 0;
  color: var(--text-muted);
}
.retry {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 0.3rem;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-block-start: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.72rem;
}
.source-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-inline-start: auto;
  color: var(--accent);
}
@media (max-inline-size: 600px) {
  .note-panel {
    inline-size: 100%;
    block-size: auto;
    max-block-size: 60vh;
    border-inline-start: 0;
    border-block-start: 1px solid var(--border);
  }
}
</style>
```

- [ ] **Step 2: Gate** (all six, one at a time). `svelte-check` covers the component's types.

- [ ] **Step 3: Commit.**

```bash
git add src/features/notes/NoteDetailPanel.svelte
git commit -m "feat(notes): note detail panel rendering structured sections" --author="Nearl Crews <23341701+NearlCrews@users.noreply.github.com>"
```

---

## Task 4: wire selection through the overlay, ChartCanvas, and App

**Files:** Modify `notes-overlay.ts`, `notes-overlay.test.ts`, `notes/index.ts`, `chart-canvas/commands.ts`, `ChartCanvas.svelte`, `App.svelte`.

- [ ] **Step 1: Overlay selection.** In `src/features/notes/notes-overlay.ts`:

Update imports: drop `Popup`, import the selection type and remove the local helpers.

```ts
import {
  type CircleLayerSpecification,
  type GeoJSONSource,
  type GeoJSONSourceSpecification,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
  type SymbolLayerSpecification,
} from 'maplibre-gl';
import { mapThemePaint, type OverlayContext, type OverlayModule } from '$shared/map';
import { navaidClassify, navaidIconId, registerNavaidIcons } from './navaid-symbols';
import { registerPoiIcons } from './note-icons';
import { type Bbox, fetchNotes, type NotePoint, type NoteSelection } from './notes-client';
import { type PoiCategory, poiIconId } from './poi-categories';
```

Delete `plainText`, `safeHttpUrl`, and `popupContent` from this file (they now live in `notes-detail.ts`). Add `id` to the feature properties in `featureCollection`:

```ts
      properties: {
        id: note.id,
        name: note.name,
        category: note.category,
        icon: iconFor(note),
        url: note.url ?? '',
        source: note.source ?? '',
        attribution: note.attribution ?? '',
      },
```

(`description` is no longer needed in marker props; remove it.)

Change the interface and factory signature:

```ts
interface NotesOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
  deselect(ctx: OverlayContext): void;
}
```

```ts
export function createNotesOverlay(
  serverBase: string,
  token: string | undefined,
  onSelect?: (selection: NoteSelection | undefined) => void,
): NotesOverlay {
```

Remove the `popup` local and the `onClick` popup body; replace `onClick` with selection:

```ts
      onClick = (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const props = feature.properties ?? {};
        setSelected(ctx, feature);
        onSelect?.({
          id: String(props.id ?? ''),
          name: String(props.name ?? 'Point of interest'),
          category: String(props.category) as PoiCategory,
          attribution: String(props.attribution || props.source || '') || undefined,
          url: String(props.url ?? '') || undefined,
        });
      };
```

Add `deselect` to the returned object (next to `sync`):

```ts
    deselect(ctx) {
      setSelected(ctx, undefined);
    },
```

In `remove`, drop the `popup?.remove(); popup = undefined;` lines (no popup anymore); keep the rest.

- [ ] **Step 2: Move the `safeHttpUrl` tests.** In `src/features/notes/notes-overlay.test.ts`, change the import to `import { createNotesOverlay } from './notes-overlay';` (drop `safeHttpUrl`) and delete the `describe('safeHttpUrl', ...)` block (lines 26-36; now covered in `notes-detail.test.ts`). The existing "adds clustered, count, symbol, and selection layers" test remains, so the file is not empty. Optionally add one assertion that the overlay exposes `deselect`:

```ts
  it('exposes deselect to clear the selection ring', () => {
    const overlay = createNotesOverlay('http://pi', undefined);
    expect(typeof overlay.deselect).toBe('function');
  });
```

Do not block the task on simulating a MapLibre click event; the click-to-select path is verified live in Step 6.

- [ ] **Step 3: Export the new surface.** In `src/features/notes/index.ts` add:

```ts
export { default as NoteDetailPanel } from './NoteDetailPanel.svelte';
export {
  createNoteDetailLoader,
  fetchNoteDetail,
  type NoteDetail,
  type NoteDetailLoader,
  type NormalizedItem,
  type NormalizedItemKind,
  type NormalizedSection,
  type PoiType,
} from './notes-detail';
export type { NoteSelection } from './notes-client';
```

(Keep the existing `createNotesOverlay` export; verify `index.ts` still re-exports it.)

- [ ] **Step 4: `MapCommands`.** In `src/widgets/chart-canvas/commands.ts`, add to the interface:

```ts
  // Clear any selected note (drop the selection ring); used when the detail panel closes.
  clearNoteSelection(): void;
```

- [ ] **Step 5: ChartCanvas.** In `src/widgets/chart-canvas/ChartCanvas.svelte`:

Add a prop:

```ts
  onNoteSelect?: (selection: NoteSelection | undefined) => void;
```

Import the type:

```ts
import type { NoteSelection } from '$features/notes';
```

Destructure `onNoteSelect` in `$props()`. Pass it to the overlay and keep the handle:

```ts
    const notesOverlay = createNotesOverlay(serverOrigin(), chartsToken, onNoteSelect);
    await manager.register(notesOverlay);
```

(Replace the existing `createNotesOverlay(serverOrigin(), chartsToken)` call; the variable is already named `notesOverlay`.)

Add `clearNoteSelection` to the `onCommandsReady` object:

```ts
    onCommandsReady?.({
      centerOnVessel: () => { /* unchanged */ },
      clearNoteSelection: () => notesOverlay.deselect(ctx),
    });
```

- [ ] **Step 6: App.** In `src/app/App.svelte`:

Imports:

```ts
import {
  createNoteDetailLoader,
  NoteDetailPanel,
  type NoteDetailLoader,
  type NoteSelection,
} from '$features/notes';
```

State and loader (near the other state):

```ts
let selectedNote = $state<NoteSelection | undefined>();
let noteLoader = $state<NoteDetailLoader | undefined>();
```

In `onMount`, after `chartsToken = token;`:

```ts
  noteLoader = createNoteDetailLoader(serverOrigin(), token);
```

Close handler (near the other handlers):

```ts
function closeNote(): void {
  selectedNote = undefined;
  mapCommands?.clearNoteSelection();
}
```

Wire the callback on `<ChartCanvas>`:

```svelte
      onNoteSelect={(selection) => (selectedNote = selection)}
```

Render the panel inside `.chart-host` (after the `danger-slot`, alongside the legend slot):

```svelte
    {#if selectedNote && noteLoader}
      <div class="note-panel-slot">
        <NoteDetailPanel selection={selectedNote} load={noteLoader.load} onClose={closeNote} />
      </div>
    {/if}
```

Add the slot CSS to App's `<style>`:

```css
.note-panel-slot {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  z-index: 2;
}
@media (max-inline-size: 600px) {
  .note-panel-slot {
    inset-block-start: auto;
    inset-inline: 0;
  }
}
```

- [ ] **Step 7: Gate** (all six, one at a time).

- [ ] **Step 8: Commit.**

```bash
git add src/features/notes src/widgets/chart-canvas src/app/App.svelte
git commit -m "feat(notes): open notes in a slide-in detail panel instead of a popup" --author="Nearl Crews <23341701+NearlCrews@users.noreply.github.com>"
```

---

## Task 5: live verification and docs

**Files:** Modify `CHANGELOG.md`, `README.md`.

- [ ] **Step 1: Build and deploy.** `NODE_OPTIONS="--max-old-space-size=2048" npm run build` writes `public/` (served via the `~/.signalk` symlink). Reload `https://boatpi:3443/binnacle/` 2-3 times so the new service worker activates.

- [ ] **Step 2: Verify live.** On `https://boatpi:3443/binnacle/`, zoom into a POI-rich area and confirm:
  - A marina opens the panel with fuel/dockage/amenities sections, availability badges, and a rating if present.
  - A USCG light opens with the light character, nominal range (NM), and focal plane (ft).
  - A hazard (wreck/rock/obstruction) opens with its S-57 attributes.
  - A note without `crowsNest` (or a non-Crow's-Nest provider) falls back to plain text.
  - Closing the panel clears the selection ring; selecting another marker switches detail.
  - The panel recolors correctly in day, dusk, and night-red.
  - Use a short-lived minted token only if needed for auth, and clear it after; never disable TLS verification.

- [ ] **Step 3: Docs.** Add a CHANGELOG `[Unreleased]` "Added" entry and a README bullet describing the structured note detail panel, the `crowsNest` consumption, and the plain-text fallback. Then commit:

```bash
git add CHANGELOG.md README.md
git commit -m "docs(notes): note detail panel in the changelog and readme" --author="Nearl Crews <23341701+NearlCrews@users.noreply.github.com>"
```

---

## Self-review notes

- Spec coverage: types and fetch and loader (T1), marker-type upgrade (T2), the panel and all kinds (T3), selection flow and the popup removal and App wiring (T4), live verify and degradation check and docs (T5). The fallback contract is exercised in T1 (parse) and T5 (live).
- Type consistency: `NoteDetail`, `NoteSelection`, `NoteDetailLoader`, `PoiType`, and `NormalizedSection`/`NormalizedItem` are defined in T1/T2 and consumed unchanged in T3/T4. `createNotesOverlay`'s third arg (`onSelect`) and `MapCommands.clearNoteSelection` match between the overlay, ChartCanvas, and App.
- `safeHttpUrl` and `plainText` move from `notes-overlay.ts` to `notes-detail.ts` in T1; T4 removes their old definitions and the `safeHttpUrl` re-export, and the overlay test's `safeHttpUrl` block moves to `notes-detail.test.ts` (added in T1).
- The loader's `load` is a closure (no `this`), so passing `noteLoader.load` as a prop is safe.
- SI note: `measure` values are shown in the provider's units verbatim (no conversion), which is intentional for v1 reference data, distinct from Binnacle's SI-store discipline for live telemetry.
