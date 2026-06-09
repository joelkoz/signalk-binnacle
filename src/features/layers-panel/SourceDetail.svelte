<script lang="ts">
import { ArrowLeft, Trash2 } from '@lucide/svelte';
import type { UserChartSource, UserCharts } from '$entities/user-charts';
import { formatBytes } from '$shared/lib';
import ChartSpecList from './ChartSpecList.svelte';

interface Props {
  source: UserChartSource;
  userCharts: UserCharts;
  onBack: () => void;
}

const { source, userCharts, onBack }: Props = $props();

let confirming = $state(false);
let name = $state('');

const specRows = $derived([
  { label: 'Type', value: source.kind === 'vector' ? 'Vector' : 'Raster' },
  { label: 'Source', value: source.origin.type === 'url' ? 'URL' : 'File (offline)' },
  { label: 'Zoom', value: `${source.minzoom ?? 0} to ${source.maxzoom ?? source.minzoom ?? 0}` },
  { label: 'Bounds', value: fmtBounds(source.bounds) },
  ...(source.byteSize ? [{ label: 'Size', value: formatBytes(source.byteSize) }] : []),
]);

// Seed the editable name from the source, resyncing if it changes underneath. The panel keys
// this component by source id, so it starts fresh for each chart.
$effect(() => {
  name = source.name;
});

function saveName(): void {
  const trimmed = name.trim();
  if (trimmed && trimmed !== source.name) userCharts.rename(source.id, trimmed);
}

function fmtBounds(b: [number, number, number, number] | undefined): string {
  if (!b) return 'Unknown';
  const r = (n: number): string => n.toFixed(2);
  return `${r(b[1])}, ${r(b[0])} to ${r(b[3])}, ${r(b[2])}`;
}

async function doDelete(): Promise<void> {
  // Capture the id before onBack: onBack clears the panel's manageId, which makes the live `source`
  // prop undefined, so reading source.id afterward would throw and the remove would never run.
  const { id } = source;
  onBack();
  await userCharts.remove(id);
}
</script>

<div class="detail">
  <header>
    <button type="button" class="icon-btn" aria-label="Back to layers" onclick={onBack}>
      <ArrowLeft size={18} aria-hidden="true" />
    </button>
    <h3 class="panel-title">Chart detail</h3>
  </header>

  <label class="name-field">
    <span class="caps-label">Name</span>
    <input
      class="input"
      type="text"
      bind:value={name}
      onblur={saveName}
      onkeydown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    >
  </label>

  <ChartSpecList rows={specRows} />

  {#if confirming}
    <div class="confirm">
      <p>Delete this chart?{source.byteSize ? ` Frees ${formatBytes(source.byteSize)}.` : ''}</p>
      <div class="actions">
        <button type="button" class="btn" onclick={() => (confirming = false)}>Cancel</button>
        <button type="button" class="btn btn-danger" onclick={doDelete}>Delete</button>
      </div>
    </div>
  {:else}
    <button type="button" class="btn btn-danger" onclick={() => (confirming = true)}>
      <Trash2 size={16} aria-hidden="true" />
      Delete chart
    </button>
  {/if}
</div>

<style>
.detail {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-size: var(--text-sm);
}
header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
header h3 {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 600;
}
.name-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.confirm {
  padding: var(--space-2);
  border: 1px solid var(--alarm);
  border-radius: var(--radius-sm);
}
.confirm p {
  margin: 0 0 0.4rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}
</style>
