<script lang="ts">
import { Download, Square, Trash2 } from '@lucide/svelte';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { UnitsStore } from '$entities/units';
import { feetToMeters, lengthUnit, metersToFeet } from '$shared/lib';
import { detectCompanion } from '$shared/map/companion.js';
import type { AuthController } from '$shared/signalk';
import { LayerToggle, SlideOver, UnitField } from '$shared/ui';
import {
  canPrewarm,
  estimateBytes,
  formatBytes,
  freeCapBytes,
  isTerminal,
  prewarmableSources,
} from './estimate.js';
import type { CacheStats, WarmStatus } from './prewarm-client.js';
import { createPrewarmClient } from './prewarm-client.js';
import type { PrewarmRectangle } from './prewarm-draw.js';
import { createPrewarmRectangle } from './prewarm-draw.js';
import { buildConfigPayload, type PositionWarmSettings } from './settings-payload.js';

interface Props {
  auth: AuthController;
  map: MapLibreMap;
  units: UnitsStore;
  onClose: () => void;
  onBack?: () => void;
}

const { auth, map, units, onClose, onBack }: Props = $props();

// Feature-detect: the panel renders nothing until detectCompanion resolves.
let detecting = $state(true);
let companionBase = $state<string | null>(null);

// Panel data
let stats = $state<CacheStats | null>(null);
let bbox = $state<[number, number, number, number] | null>(null);
let selectedSources = $state<string[]>([]);
let minzoom = $state(6);
let maxzoom = $state(12);

// Job state
let jobId = $state<string | null>(null);
let warmStatus = $state<WarmStatus | null>(null);
let jobGone = $state(false);
let error = $state<string | null>(null);
let submitting = $state(false);

// Internal references not read in the template: the draw controller and the poll timer.
let rect: PrewarmRectangle | null = null;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

// prewarmableSources() is a pure function with no reactive deps, evaluated once.
const sources = prewarmableSources();

// Rebuild the client when the auth token changes so every call carries the current bearer token.
const client = $derived(createPrewarmClient(location.origin, auth.token ?? undefined));

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

const gate = $derived(
  stats !== null &&
    canPrewarm({
      bbox,
      sources: selectedSources,
      writeBlocked: auth.writeBlocked,
      stats,
      zoomRange: [minzoom, maxzoom],
    }),
);

const estimateVal = $derived(
  stats !== null && bbox !== null && selectedSources.length > 0
    ? estimateBytes(selectedSources, bbox, [minzoom, maxzoom], stats)
    : 0,
);
const estimateFmt = $derived(formatBytes(estimateVal));
const freeCapFmt = $derived(stats !== null ? formatBytes(freeCapBytes(stats)) : null);

const running = $derived(warmStatus !== null && warmStatus.state === 'running');
const progress = $derived(
  warmStatus !== null && warmStatus.total > 0 ? warmStatus.done / warmStatus.total : 0,
);

// Detect the companion on mount. Reads no reactive deps so runs once.
$effect(() => {
  void detectCompanion(location.origin).then((base) => {
    companionBase = base;
    detecting = false;
  });
});

// Load stats when the companion is found, and refresh when the auth token changes.
// A stale flag guards against a previous slow request overwriting a fresh response when client
// changes (auth token rotates) mid-flight.
$effect(() => {
  if (companionBase === null) return;
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

// Wire up the panel-scoped Terra Draw rectangle instance. The prefixId 'binnacle-prewarm-draw'
// keeps it separate from the route editor's 'binnacle-route-draw' so the two never collide.
$effect(() => {
  const r = createPrewarmRectangle(map);
  r.onChange((newBbox) => {
    bbox = newBbox;
  });
  rect = r;
  return () => {
    r.destroy();
    rect = null;
  };
});

// Clear the poll timer on unmount regardless of job state.
$effect(() => {
  return () => {
    if (pollIntervalId !== null) clearInterval(pollIntervalId);
  };
});

// Load the persisted position-warm settings when the companion is found.
$effect(() => {
  if (companionBase === null) return;
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
  if (auth.writeBlocked || companionBase === null) return;
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
  const meters = mode === 'imperial' ? feetToMeters(entered) : entered;
  positionRadiusMeters = Math.max(1, meters);
  void savePositionWarm();
}

function commitMoveThreshold(entered: number): void {
  const meters = mode === 'imperial' ? feetToMeters(entered) : entered;
  positionMoveThresholdMeters = Math.max(1, meters);
  void savePositionWarm();
}

function stopPolling(): void {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

function startPolling(id: string): void {
  stopPolling();
  // Capture the client at poll-start so every tick in this job uses the same instance.
  const activeClient = client;
  const iv = setInterval(() => {
    void activeClient.getStatus(id).then((s) => {
      // A null status means the container restarted and the in-memory job is gone.
      if (s === null) {
        stopPolling();
        jobGone = true;
        warmStatus = null;
        return;
      }
      warmStatus = s;
      if (isTerminal(s)) {
        stopPolling();
        if (s.state === 'done') {
          // Refresh stats so the free-cap readout reflects the newly cached tiles.
          void client
            .getCacheStats()
            .then((fresh) => {
              stats = fresh;
            })
            .catch(() => {});
        }
      }
    });
  }, 2000);
  pollIntervalId = iv;
}

async function doPrewarm(): Promise<void> {
  if (!gate || bbox === null || submitting) return;
  error = null;
  jobGone = false;
  warmStatus = null;
  submitting = true;
  try {
    const { jobId: id } = await client.postPrewarm({
      bbox,
      sources: selectedSources,
      minzoom,
      maxzoom,
    });
    jobId = id;
    startPolling(id);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Prewarm failed';
  } finally {
    submitting = false;
  }
}

async function doCancel(): Promise<void> {
  if (jobId === null) return;
  stopPolling();
  const id = jobId;
  jobId = null;
  warmStatus = null;
  try {
    await client.cancel(id);
  } catch {
    // Cancel is best-effort: if the container restarted the job is already gone.
  }
}

function toggleSource(id: string, on: boolean): void {
  selectedSources = on ? [...selectedSources, id] : selectedSources.filter((s) => s !== id);
}
</script>

{#if !detecting && companionBase !== null}
  <SlideOver
    title="Tile cache prewarm"
    closeLabel="Close prewarm panel"
    {onClose}
    {onBack}
    bodyFlex
  >
    {#if auth.writeBlocked}
      <p class="muted-note">
        A write token is needed to prewarm the tile cache. Request a read/write token to continue.
      </p>
    {/if}

    <h3 class="caps-label section-head">Cruising box</h3>
    <div class="panel-controls">
      <button
        type="button"
        class="btn btn--grow"
        disabled={running || auth.writeBlocked}
        onclick={() => rect?.start()}
      >
        <Square size={16} aria-hidden="true" />
        Draw box
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        disabled={bbox === null || running || auth.writeBlocked}
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
    {#each sources as source (source.id)}
      <LayerToggle
        title={source.title}
        visible={selectedSources.includes(source.id)}
        disabled={running || auth.writeBlocked}
        onToggle={(on) => toggleSource(source.id, on)}
      />
    {/each}
    {#if sources.length === 0}
      <p class="muted-note">No prewarmable sources found in the registry.</p>
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
        <dt>Free capacity</dt>
        <dd>
          <span class="num">{freeCapFmt?.value ?? '--'}</span>
          <span class="unit">{freeCapFmt?.unit ?? ''}</span>
        </dd>
      </dl>
      <p class="muted-note">The estimate is a ceiling. Cached 404s cost no bytes.</p>
    {:else}
      <p class="muted-note">Loading cache stats...</p>
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
    {#each sources as source (source.id)}
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
    {#if sources.length === 0}
      <p class="muted-note">No prewarmable sources found in the registry.</p>
    {/if}

    {#if error !== null}
      <p class="alert-note" role="alert">{error}</p>
    {/if}

    {#if jobGone}
      <p class="muted-note">
        Job lost: the container restarted and the in-memory job is gone. Click Prewarm to restart.
      </p>
    {:else if warmStatus !== null && isTerminal(warmStatus)}
      {#if warmStatus.state === 'done'}
        {@const doneFmt = formatBytes(warmStatus.bytes)}
        <p class="muted-note">
          Done: {warmStatus.done} tiles cached ({doneFmt.value} {doneFmt.unit}).
        </p>
      {:else if warmStatus.state === 'capped'}
        <p class="alert-note">
          Cap reached after {warmStatus.done} tiles. Free up space or raise the cap, then re-warm.
        </p>
      {:else if warmStatus.state === 'cancelled'}
        <p class="muted-note">Cancelled after {warmStatus.done} tiles.</p>
      {:else}
        <p class="alert-note" role="alert">
          Ended with {warmStatus.errors} error(s). Check the server log, then re-warm.
        </p>
      {/if}
    {/if}

    <div class="panel-controls">
      {#if running}
        <button type="button" class="btn btn-danger btn--grow" onclick={() => void doCancel()}>
          Cancel
        </button>
      {:else}
        <button
          type="button"
          class="btn btn-primary btn--grow"
          disabled={!gate || submitting}
          onclick={() => void doPrewarm()}
        >
          <Download size={16} aria-hidden="true" />
          Prewarm
        </button>
      {/if}
    </div>

    {#if running && warmStatus !== null}
      <div
        class="warm-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuenow={warmStatus.done}
        aria-valuemax={warmStatus.total}
        aria-label="Prewarm progress"
      >
        <div class="warm-fill" style:inline-size="{Math.round(progress * 100)}%"></div>
      </div>
      <p class="muted-note">{warmStatus.done} / {warmStatus.total} tiles</p>
    {/if}
  </SlideOver>
{/if}

<style>
/* Extra top margin on each section heading so the caps labels breathe inside the bodyFlex column
   without needing nested wrappers or breaking the shared gap rhythm. */
.section-head {
  margin-block-start: var(--space-2);
}

/* Token-driven progress bar: same track height and pill radius as the .range slider in forms.css,
   so the two progress indicators read as one visual family across all three themes. */
.warm-track {
  block-size: var(--range-track-h);
  border-radius: var(--radius-pill);
  background: var(--border);
  overflow: hidden;
}

.warm-fill {
  block-size: 100%;
  background: var(--accent);
  transition: inline-size 0.3s ease;
}
</style>
