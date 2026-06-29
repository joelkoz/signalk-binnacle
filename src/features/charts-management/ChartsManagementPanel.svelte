<script lang="ts">
import { onDestroy } from 'svelte';
import type { AuthController } from '$shared/signalk';
import { SlideOver } from '$shared/ui';
import type { ManagedChart, ManagedChartsResponse } from './charts-management-client.js';
import { fetchManagedCharts, putChartOverride } from './charts-management-client.js';

interface Props {
  auth: AuthController;
  companionBase: string;
  onClose: () => void;
  onBack?: () => void;
}

const { auth, companionBase, onClose, onBack }: Props = $props();

let data = $state<ManagedChartsResponse | null>(null);
let loadError = $state<string | null>(null);
// Per-field save state keyed as "<identifier>:<field>", so each field tracks independently.
let saveStates = $state<Record<string, string>>({});
// Tracks pending clear-indicator timer ids so they can be cancelled if the panel unmounts.
const timerIds: ReturnType<typeof setTimeout>[] = [];
onDestroy(() => {
  for (const id of timerIds) clearTimeout(id);
});

// Rebuild the token shape the REST clients expect whenever auth changes so every call carries
// the current bearer token, matching the prewarm panel's client-rebuild pattern.
const token = $derived(auth.token ?? undefined);

// Load the chart list on mount and refresh when the auth token changes.
// A stale flag guards against a previous slow request overwriting a fresh response when the
// token rotates mid-flight, matching the prewarm panel's stats-load effect.
$effect(() => {
  // Track the token so a token change triggers a re-fetch with the new credentials.
  void token;
  let stale = false;
  loadError = null;
  void fetchManagedCharts(companionBase, token).then((result) => {
    if (stale) return;
    if (result === undefined) {
      loadError = 'Could not load charts. Check the connection and access.';
    } else {
      data = result;
    }
  });
  return () => {
    stale = true;
  };
});

async function saveOverride(
  chart: ManagedChart,
  field: 'name' | 'description',
  value: string,
): Promise<void> {
  if (auth.writeBlocked || data === null) return;
  const key = `${chart.identifier}:${field}`;
  const override = { ...chart.override, [field]: value };
  saveStates[key] = 'saving';
  const ok = await putChartOverride(companionBase, token, chart.identifier, override);
  saveStates[key] = ok ? 'saved' : 'error';
  if (ok) {
    // Optimistically update the local override so a subsequent save on the same chart
    // carries the latest merged override rather than the stale original.
    data = {
      ...data,
      charts: data.charts.map((c) => (c.identifier === chart.identifier ? { ...c, override } : c)),
    };
    // Clear the saved indicator after a short pause; errors stay until the next action.
    timerIds.push(
      setTimeout(() => {
        saveStates[key] = '';
      }, 2000),
    );
  }
}

function formatBounds(bounds: [number, number, number, number]): string {
  // PMTiles bounds are [west, south, east, north] in decimal degrees.
  return `${bounds[1].toFixed(2)}, ${bounds[0].toFixed(2)} to ${bounds[3].toFixed(2)}, ${bounds[2].toFixed(2)}`;
}
</script>

<SlideOver
  title="Chart management"
  closeLabel="Close chart management panel"
  {onClose}
  {onBack}
  bodyFlex
>
  {#if auth.writeBlocked}
    <p class="muted-note">
      A write token is needed to edit chart names and descriptions. Request a read/write token to
      continue.
    </p>
  {/if}

  <h3 class="caps-label section-head">Charts</h3>

  {#if loadError !== null}
    <p class="alert-note" role="alert">{loadError}</p>
  {:else if data === null}
    <p class="muted-note">Loading charts...</p>
  {:else if data.charts.length === 0}
    <p class="muted-note">No charts found. Add PMTiles files to the server chart directory.</p>
  {:else}
    {#each data.charts as chart (chart.identifier)}
      {@const nameKey = `${chart.identifier}:name`}
      {@const descKey = `${chart.identifier}:description`}
      <div class="chart-card card-frame">
        <p class="chart-file">{chart.fileName}</p>
        <dl class="stat-grid">
          <dt>Format</dt>
          <dd><span>{chart.format.toUpperCase()}</span><span class="unit"></span></dd>
          <dt>Zoom range</dt>
          <dd><span>{chart.minzoom} to {chart.maxzoom}</span><span class="unit"></span></dd>
          {#if chart.bounds}
            <dt>Bounds</dt>
            <dd class="bounds-val">
              <span>{formatBounds(chart.bounds)}</span><span class="unit"></span>
            </dd>
          {/if}
        </dl>
        <label class="field-row">
          <span class="field-label caps-label">Display name</span>
          <input
            class="input field-input"
            type="text"
            value={chart.override.name ?? chart.name}
            disabled={auth.writeBlocked}
            aria-label="Display name for {chart.fileName}"
            onchange={(e) =>
              void saveOverride(chart, 'name', (e.currentTarget as HTMLInputElement).value)}
          >
        </label>
        {#if saveStates[nameKey] === 'saving'}
          <p class="muted-note save-note">Saving...</p>
        {:else if saveStates[nameKey] === 'saved'}
          <p class="muted-note save-note">Saved.</p>
        {:else if saveStates[nameKey] === 'error'}
          <p class="alert-note save-note" role="alert">Could not save the name. Check access.</p>
        {/if}
        <label class="field-row">
          <span class="field-label caps-label">Description</span>
          <input
            class="input field-input"
            type="text"
            value={chart.override.description ?? chart.description}
            disabled={auth.writeBlocked}
            aria-label="Description for {chart.fileName}"
            onchange={(e) =>
              void saveOverride(
                chart,
                'description',
                (e.currentTarget as HTMLInputElement).value,
              )}
          >
        </label>
        {#if saveStates[descKey] === 'saving'}
          <p class="muted-note save-note">Saving...</p>
        {:else if saveStates[descKey] === 'saved'}
          <p class="muted-note save-note">Saved.</p>
        {:else if saveStates[descKey] === 'error'}
          <p class="alert-note save-note" role="alert">
            Could not save the description. Check access.
          </p>
        {/if}
      </div>
    {/each}
  {/if}

  {#if data !== null && data.invalid.length > 0}
    <h3 class="caps-label section-head">Invalid files</h3>
    {#each data.invalid as item (item.fileName)}
      <div class="card-frame invalid-card">
        <p class="chart-file">{item.fileName}</p>
        <p class="alert-note">{item.error}</p>
      </div>
    {/each}
  {/if}

  <p class="muted-note deferred-note">Browser upload of chart archives is not yet available.</p>
</SlideOver>

<style>
/* Extra top margin on each section heading so the caps labels breathe inside the bodyFlex column,
   matching the prewarm panel's .section-head rule. */
.section-head {
  margin-block-start: var(--space-2);
}

/* A raised card per detected chart, layout-only: border, radius, and surface come from .card-frame
   (cards.css) and the local flex column adds the inner spacing. */
.chart-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
}

.invalid-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
}

/* The source file name: mono so it reads as a path, muted so it recedes behind the editable name,
   clipped so a long filename cannot break the card layout. */
.chart-file {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Bounds are coordinate pairs: mono and tabular so the digits line up at a glance. */
.bounds-val {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

/* The labeled text-input row: a column stack so the caps label sits above the full-width input,
   consistent with how the layers panel stacks its chart URL label above its input. */
.field-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field-label {
  display: block;
}

/* Stretch the text input to fill the card width, matching the chart URL input in the layers panel. */
.field-input {
  inline-size: 100%;
  box-sizing: border-box;
}

/* The deferred-upload note sits at the end of the panel body, always present as a clear signal
   that upload is not yet available rather than leaving the user hunting for an upload button. */
.deferred-note {
  margin-block-start: var(--space-1);
}
</style>
