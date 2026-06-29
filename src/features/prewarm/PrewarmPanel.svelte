<script lang="ts">
import { Download, RefreshCw, Square, Trash2 } from '@lucide/svelte';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { onDestroy } from 'svelte';
import type { UnitsStore } from '$entities/units';
import { feetToMeters, lengthUnit, metersToFeet } from '$shared/lib';
import type { AuthController } from '$shared/signalk';
import { LayerToggle, SlideOver, UnitField } from '$shared/ui';
import {
  canPrewarm,
  coveringSources,
  estimateBytes,
  formatBytes,
  isTerminal,
  prewarmableSources,
  regionsFreeBytes,
} from './estimate.js';
import type { CacheStats, SavedRegionDto } from './prewarm-client.js';
import { createPrewarmClient } from './prewarm-client.js';
import type { PrewarmRectangle } from './prewarm-draw.js';
import { createPrewarmRectangle } from './prewarm-draw.js';
import { buildConfigPayload, type PositionWarmSettings } from './settings-payload.js';

interface Props {
  auth: AuthController;
  companionBase: string;
  map: MapLibreMap;
  units: UnitsStore;
  onClose: () => void;
  onBack?: () => void;
}

const { auth, companionBase, map, units, onClose, onBack }: Props = $props();

// The whole-world box stands in for "no box drawn" when enumerating covering sources.
const WORLD_BBOX: [number, number, number, number] = [-180, -90, 180, 90];

// Region builder state.
let stats = $state<CacheStats | null>(null);
let regions = $state<SavedRegionDto[]>([]);
let bbox = $state<[number, number, number, number] | null>(null);
let selectedSources = $state<string[]>([]);
let minzoom = $state(6);
let maxzoom = $state(12);

// Name prep and submission state.
let namePrep = $state(false);
let regionName = $state('');
let submitting = $state(false);
let error = $state<string | null>(null);

// Internal references not read in the template: the draw controller and the per-region poll timers.
let rect: PrewarmRectangle | null = null;
const pollTimers = new Map<string, ReturnType<typeof setInterval>>();

// prewarmableSources() is a pure function with no reactive deps, evaluated once. Used by the
// position-warm section, which is not box-scoped.
const prewarmable = prewarmableSources();

// Rebuild the client when the auth token changes so every call carries the current bearer token.
const client = $derived(createPrewarmClient(companionBase, auth.token ?? undefined));

// Position-warm settings; default OFF per spec, loaded from getConfig on open.
let positionEnabled = $state(false);
let positionRadiusMeters = $state(3704); // ~2 nautical miles
let positionMoveThresholdMeters = $state(1852); // 1 nautical mile
let positionIntervalSecs = $state(60); // server-side floor is 60 s
let positionBaseZoom = $state(12);
let positionSources = $state<string[]>([]);

// Length display unit follows the server unit preference, same as the anchor watch panel.
const mode = $derived(units.mode);
const unit = $derived(lengthUnit(mode));
const positionRadiusDisplay = $derived(
  Math.round(
    mode === 'imperial' ? (metersToFeet(positionRadiusMeters) ?? 0) : positionRadiusMeters,
  ),
);
const positionMoveDisplay = $derived(
  Math.round(
    mode === 'imperial'
      ? (metersToFeet(positionMoveThresholdMeters) ?? 0)
      : positionMoveThresholdMeters,
  ),
);

// Only the sources that cover the current box show; a global source (no bounds) always covers a
// non-empty box, and the style basemap is already excluded.
const sourceList = $derived(coveringSources(bbox ?? WORLD_BBOX, [minzoom, maxzoom]));
// The selected ids restricted to what is currently shown, so a zoom change that drops a source from
// the list never carries a stale id into the estimate or the request.
const activeSourceIds = $derived(
  sourceList.filter((s) => selectedSources.includes(s.id)).map((s) => s.id),
);

const gate = $derived(
  stats !== null &&
    !namePrep &&
    canPrewarm({
      bbox,
      sources: activeSourceIds,
      writeBlocked: auth.writeBlocked,
      stats,
      zoomRange: [minzoom, maxzoom],
    }),
);

const estimateVal = $derived(
  stats !== null && bbox !== null && activeSourceIds.length > 0
    ? estimateBytes(activeSourceIds, bbox, [minzoom, maxzoom], stats.perSourceAvgBytes)
    : 0,
);
const estimateFmt = $derived(formatBytes(estimateVal));
const regionsFreeFmt = $derived(stats !== null ? formatBytes(regionsFreeBytes(stats)) : null);
const pinnedFmt = $derived(stats !== null ? formatBytes(stats.pinnedBytes ?? 0) : null);
const scrollFmt = $derived(stats !== null ? formatBytes(stats.scrollBytes ?? 0) : null);

// Load stats on mount and refresh when the auth token changes (client rebuilds on token change).
// A stale flag guards against a previous slow request overwriting a fresh response when client
// changes (auth token rotates) mid-flight.
$effect(() => {
  let stale = false;
  void client
    .getCacheStats()
    .then((s) => {
      if (!stale) stats = s;
    })
    .catch(() => {});
  return () => {
    stale = true;
  };
});

// Load the saved regions on mount, and resume polling any caught mid-download.
$effect(() => {
  let stale = false;
  void client
    .getRegions()
    .then((list) => {
      if (stale) return;
      regions = list;
      for (const region of list) {
        if (region.status === 'downloading') pollRegion(region.id);
      }
    })
    .catch(() => {});
  return () => {
    stale = true;
  };
});

// Wire up the panel-scoped Terra Draw rectangle instance. The prefixId 'binnacle-prewarm-draw'
// keeps it separate from the route editor's 'binnacle-route-draw' so the two never collide. A new
// box auto-selects every covering source; the owner can then deselect.
$effect(() => {
  const r = createPrewarmRectangle(map);
  r.onChange((newBbox) => {
    bbox = newBbox;
    selectedSources =
      newBbox === null ? [] : coveringSources(newBbox, [minzoom, maxzoom]).map((s) => s.id);
    namePrep = false;
  });
  rect = r;
  return () => {
    r.destroy();
    rect = null;
  };
});

// Clear every poll timer on unmount.
onDestroy(() => {
  for (const timer of pollTimers.values()) clearInterval(timer);
  pollTimers.clear();
});

// Load the persisted position-warm settings on mount.
$effect(() => {
  let stale = false;
  void client
    .getConfig()
    .then((cfg) => {
      if (stale) return;
      const pw = extractPositionWarm(cfg);
      if (pw !== null) {
        positionEnabled = pw.enabled;
        positionRadiusMeters = pw.radiusMeters;
        positionMoveThresholdMeters = pw.moveThresholdMeters;
        positionIntervalSecs = pw.intervalSecs;
        positionBaseZoom = pw.baseZoom;
        positionSources = pw.sources;
      }
    })
    .catch(() => {});
  return () => {
    stale = true;
  };
});

function extractPositionWarm(cfg: unknown): PositionWarmSettings | null {
  if (!cfg || typeof cfg !== 'object') return null;
  const pw = (cfg as Record<string, unknown>).positionWarm;
  if (!pw || typeof pw !== 'object') return null;
  const p = pw as Record<string, unknown>;
  if (
    typeof p.enabled !== 'boolean' ||
    typeof p.radiusMeters !== 'number' ||
    typeof p.moveThresholdMeters !== 'number' ||
    typeof p.intervalSecs !== 'number' ||
    typeof p.baseZoom !== 'number' ||
    !Array.isArray(p.sources)
  )
    return null;
  return {
    enabled: p.enabled,
    radiusMeters: p.radiusMeters,
    moveThresholdMeters: p.moveThresholdMeters,
    intervalSecs: p.intervalSecs,
    baseZoom: p.baseZoom,
    sources: p.sources.filter((s): s is string => typeof s === 'string'),
  };
}

async function savePositionWarm(): Promise<void> {
  if (auth.writeBlocked) return;
  try {
    await client.postConfig(
      buildConfigPayload({
        enabled: positionEnabled,
        radiusMeters: positionRadiusMeters,
        moveThresholdMeters: positionMoveThresholdMeters,
        intervalSecs: positionIntervalSecs,
        baseZoom: positionBaseZoom,
        sources: positionSources,
      }),
    );
  } catch {
    // Save is best-effort; the server enforces its own floor values.
  }
}

function commitPositionRadius(entered: number): void {
  const meters = mode === 'imperial' ? (feetToMeters(entered) ?? entered) : entered;
  positionRadiusMeters = Math.max(1, meters);
  void savePositionWarm();
}

function commitMoveThreshold(entered: number): void {
  const meters = mode === 'imperial' ? (feetToMeters(entered) ?? entered) : entered;
  positionMoveThresholdMeters = Math.max(1, meters);
  void savePositionWarm();
}

async function reloadRegions(): Promise<void> {
  try {
    regions = await client.getRegions();
  } catch {
    // Best-effort refresh; the existing list stays on a transient failure.
  }
}

async function refreshStats(): Promise<void> {
  try {
    stats = await client.getCacheStats();
  } catch {
    // Best-effort; the readout keeps its last value.
  }
}

function stopRegionPoll(id: string): void {
  const timer = pollTimers.get(id);
  if (timer !== undefined) {
    clearInterval(timer);
    pollTimers.delete(id);
  }
}

// Poll a region's warm job to a terminal result. The plugin status route reconciles the persisted
// region status on each poll, so a reload after the terminal tick shows ready, capped, or error.
function pollRegion(id: string): void {
  stopRegionPoll(id);
  const activeClient = client;
  const timer = setInterval(() => {
    void activeClient
      .getRegionJobStatus(id)
      .then((s) => {
        if (isTerminal(s)) {
          stopRegionPoll(id);
          void reloadRegions();
          void refreshStats();
        }
      })
      .catch(() => {});
  }, 2000);
  pollTimers.set(id, timer);
}

function centerOf(box: [number, number, number, number]): { lat: number; lon: number } {
  return { lat: (box[1] + box[3]) / 2, lon: (box[0] + box[2]) / 2 };
}

function coordName(box: [number, number, number, number]): string {
  const { lat, lon } = centerOf(box);
  return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

// The geocode lookup fires once here, on the Download action, never on rectangle drag, which is the
// rate control for the Nominatim usage policy. The name falls back to a coordinate string on failure.
async function prepareDownload(): Promise<void> {
  if (!gate || bbox === null || submitting) return;
  error = null;
  submitting = true;
  const { lat, lon } = centerOf(bbox);
  const fallback = coordName(bbox);
  try {
    const name = await client.geocode(lat, lon);
    regionName = name ?? fallback;
  } catch {
    regionName = fallback;
  } finally {
    submitting = false;
    namePrep = true;
  }
}

async function saveRegion(): Promise<void> {
  if (bbox === null || activeSourceIds.length === 0 || submitting) return;
  const name = regionName.trim() || coordName(bbox);
  error = null;
  submitting = true;
  try {
    const { region } = await client.postRegion({
      bbox,
      sourceIds: activeSourceIds,
      minzoom,
      maxzoom,
      name,
    });
    namePrep = false;
    regionName = '';
    await reloadRegions();
    await refreshStats();
    pollRegion(region.id);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Region download failed';
  } finally {
    submitting = false;
  }
}

function cancelNamePrep(): void {
  namePrep = false;
  regionName = '';
}

async function redownloadRegion(id: string): Promise<void> {
  if (auth.writeBlocked) return;
  error = null;
  try {
    await client.redownloadRegion(id);
    await reloadRegions();
    pollRegion(id);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Re-download failed';
  }
}

async function deleteRegion(id: string): Promise<void> {
  if (auth.writeBlocked) return;
  error = null;
  stopRegionPoll(id);
  try {
    await client.deleteRegion(id);
    await reloadRegions();
    await refreshStats();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Delete failed';
  }
}

function toggleSource(id: string, on: boolean): void {
  selectedSources = on ? [...selectedSources, id] : selectedSources.filter((s) => s !== id);
}

const STATUS_LABELS: Record<SavedRegionDto['status'], string> = {
  downloading: 'Downloading',
  ready: 'Ready',
  capped: 'Cap reached',
  error: 'Error',
  'needs-redownload': 'Needs re-download',
};

function updatedLabel(ts: number | null): string {
  return ts === null ? 'never' : new Date(ts * 1000).toLocaleDateString();
}
</script>

<SlideOver title="Saved regions" closeLabel="Close regions panel" {onClose} {onBack} bodyFlex>
  {#if auth.writeBlocked}
    <p class="muted-note">
      A write token is needed to download a region. Request a read/write token to continue.
    </p>
  {/if}

  <h3 class="caps-label section-head">Region box</h3>
  <div class="panel-controls">
    <button
      type="button"
      class="btn btn--grow"
      disabled={auth.writeBlocked}
      onclick={() => rect?.start()}
    >
      <Square size={16} aria-hidden="true" />
      Draw box
    </button>
    <button
      type="button"
      class="btn btn-ghost"
      disabled={bbox === null || auth.writeBlocked}
      onclick={() => rect?.clear()}
    >
      <Trash2 size={16} aria-hidden="true" />
      Clear
    </button>
  </div>
  {#if bbox !== null}
    <p class="muted-note">
      Box: {bbox[1].toFixed(3)}, {bbox[0].toFixed(3)} to {bbox[3].toFixed(3)},
      {bbox[2].toFixed(3)}
    </p>
  {:else}
    <p class="muted-note">No box drawn. Tap Draw box, then drag on the chart to set the area.</p>
  {/if}

  <h3 class="caps-label section-head">Sources</h3>
  {#each sourceList as source (source.id)}
    <LayerToggle
      title={source.title}
      visible={selectedSources.includes(source.id)}
      disabled={auth.writeBlocked}
      onToggle={(on) => toggleSource(source.id, on)}
    />
  {/each}
  {#if sourceList.length === 0}
    <p class="muted-note">No sources cover this box and zoom range.</p>
  {/if}

  <h3 class="caps-label section-head">Zoom range</h3>
  <UnitField
    label="Minimum zoom"
    value={minzoom}
    min={0}
    max={maxzoom}
    step={1}
    onCommit={(v) => {
      minzoom = Math.round(Math.max(0, Math.min(v, maxzoom)));
    }}
  />
  <UnitField
    label="Maximum zoom"
    value={maxzoom}
    min={minzoom}
    max={22}
    step={1}
    onCommit={(v) => {
      maxzoom = Math.round(Math.max(minzoom, Math.min(v, 22)));
    }}
  />

  <h3 class="caps-label section-head">Estimate</h3>
  {#if stats !== null}
    <dl class="stat-grid">
      <dt>Estimated download</dt>
      <dd>
        <span class="num">{estimateFmt.value}</span>
        <span class="unit">{estimateFmt.unit}</span>
      </dd>
      <dt>Regions free</dt>
      <dd>
        <span class="num">{regionsFreeFmt?.value ?? '--'}</span>
        <span class="unit">{regionsFreeFmt?.unit ?? ''}</span>
      </dd>
      <dt>Pinned</dt>
      <dd>
        <span class="num">{pinnedFmt?.value ?? '--'}</span>
        <span class="unit">{pinnedFmt?.unit ?? ''}</span>
      </dd>
      <dt>Scrolling cache</dt>
      <dd>
        <span class="num">{scrollFmt?.value ?? '--'}</span>
        <span class="unit">{scrollFmt?.unit ?? ''}</span>
      </dd>
    </dl>
    <p class="muted-note">The estimate is a ceiling. Cached 404s cost no bytes.</p>
  {:else}
    <p class="muted-note">Loading cache stats...</p>
  {/if}

  {#if error !== null}
    <p class="alert-note" role="alert">{error}</p>
  {/if}

  {#if namePrep}
    <label class="field">
      <span class="name">Region name</span>
      <input class="input region-name" type="text" bind:value={regionName} aria-label="Region name" />
    </label>
    <div class="panel-controls">
      <button
        type="button"
        class="btn btn-primary btn--grow"
        disabled={submitting}
        onclick={() => void saveRegion()}
      >
        <Download size={16} aria-hidden="true" />
        Save region
      </button>
      <button type="button" class="btn btn-ghost" onclick={cancelNamePrep}>Cancel</button>
    </div>
  {:else}
    <div class="panel-controls">
      <button
        type="button"
        class="btn btn-primary btn--grow"
        disabled={!gate || submitting}
        onclick={() => void prepareDownload()}
      >
        <Download size={16} aria-hidden="true" />
        Download region
      </button>
    </div>
  {/if}

  <h3 class="caps-label section-head">Downloaded regions</h3>
  {#if regions.length === 0}
    <p class="muted-note">No regions saved yet. Draw a box and download to save one.</p>
  {:else}
    {#each regions as region (region.id)}
      {@const cached = formatBytes(region.cachedBytes)}
      <div class="region">
        <div class="region-head">
          <span class="region-name-text">{region.name}</span>
          <span class="caps-label">{STATUS_LABELS[region.status]}</span>
        </div>
        <p class="muted-note">
          <span class="num">{cached.value}</span>
          <span class="unit">{cached.unit}</span>
          cached, updated {updatedLabel(region.lastDownloadedAt)}
        </p>
        <div class="panel-controls">
          <button
            type="button"
            class="btn btn--grow"
            disabled={auth.writeBlocked || region.status === 'downloading'}
            onclick={() => void redownloadRegion(region.id)}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Re-download
          </button>
          <button
            type="button"
            class="btn btn-danger"
            disabled={auth.writeBlocked}
            onclick={() => void deleteRegion(region.id)}
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>
    {/each}
  {/if}

  <h3 class="caps-label section-head">Position warm</h3>
  <LayerToggle
    title="Enable position warm"
    visible={positionEnabled}
    disabled={auth.writeBlocked}
    onToggle={(on) => {
      positionEnabled = on;
      void savePositionWarm();
    }}
  />
  <UnitField
    label="Warm radius"
    {unit}
    value={positionRadiusDisplay}
    min={1}
    step={1}
    onCommit={commitPositionRadius}
  />
  <UnitField
    label="Move threshold"
    {unit}
    value={positionMoveDisplay}
    min={1}
    step={1}
    onCommit={commitMoveThreshold}
  />
  <UnitField
    label="Warm interval"
    unit="s"
    value={positionIntervalSecs}
    min={60}
    step={1}
    onCommit={(v) => {
      positionIntervalSecs = Math.max(60, Math.round(v));
      void savePositionWarm();
    }}
  />
  <UnitField
    label="Base zoom"
    value={positionBaseZoom}
    min={0}
    max={22}
    step={1}
    onCommit={(v) => {
      positionBaseZoom = Math.round(Math.max(0, Math.min(v, 22)));
      void savePositionWarm();
    }}
  />
  <h3 class="caps-label section-head">Position warm sources</h3>
  {#each prewarmable as source (source.id)}
    <LayerToggle
      title={source.title}
      visible={positionSources.includes(source.id)}
      disabled={auth.writeBlocked}
      onToggle={(on) => {
        positionSources = on
          ? [...positionSources, source.id]
          : positionSources.filter((s) => s !== source.id);
        void savePositionWarm();
      }}
    />
  {/each}
  {#if prewarmable.length === 0}
    <p class="muted-note">No prewarmable sources found in the registry.</p>
  {/if}
</SlideOver>

<style>
/* Extra top margin on each section heading so the caps labels breathe inside the bodyFlex column
   without needing nested wrappers or breaking the shared gap rhythm. */
.section-head {
  margin-block-start: var(--space-2);
}

/* The labeled-row shape, matching the shared UnitField so the name row aligns with the zoom fields. */
.field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-block-size: var(--control-size);
}
.name {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* The region name input grows to fill the field row, unlike the fixed-width numeric UnitField. */
.region-name {
  flex: 1;
  min-inline-size: 0;
}

/* A saved-region card: token-driven border and padding so the row reads as one instrument with the
   rest of the panel across all three themes. */
.region {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}

.region-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.region-name-text {
  font-size: var(--text-md);
  overflow-wrap: anywhere;
}
</style>
