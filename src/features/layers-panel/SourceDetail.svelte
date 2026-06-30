<script lang="ts">
import { ArrowLeft, Trash2 } from '@lucide/svelte';
import type { UserChartSource, UserCharts } from '$entities/user-charts';
import { InlineConfirm } from '$shared/ui';
import ChartSpecList from './ChartSpecList.svelte';
import { chartSpecRows } from './chart-spec';

interface Props {
  source: UserChartSource;
  userCharts: UserCharts;
  onBack: () => void;
}

const { source, userCharts, onBack }: Props = $props();

let confirming = $state(false);
let name = $state('');

const spec = $derived(chartSpecRows(source));
const specRows = $derived([
  spec.type,
  { label: 'Source', value: source.origin.url },
  spec.zoom,
  { label: 'Bounds', value: fmtBounds(source.bounds) },
]);

// Seed the editable name from the source, re-syncing if it changes underneath. A fine-grained
// $effect re-runs only when source.name changes, not on every render, so this is the right tool;
// the panel also keys this component by source id, so it starts fresh for each chart.
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

function doDelete(): void {
  // Capture the id before onBack: onBack clears the panel's manageId, which makes the live `source`
  // prop undefined, so reading source.id afterward would throw and the remove would never run.
  const { id } = source;
  onBack();
  userCharts.remove(id);
}
</script>

<div class="detail">
  <header>
    <button
      type="button"
      class="icon-btn icon-btn--accent"
      aria-label="Back to layers"
      onclick={onBack}
    >
      <ArrowLeft size={20} aria-hidden="true" />
    </button>
    <h3 class="panel-title panel-title--sub">Chart detail</h3>
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
    <InlineConfirm
      question="Delete this chart?"
      onConfirm={doDelete}
      onCancel={() => (confirming = false)}
    />
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
  gap: var(--space-2);
  font-size: var(--text-sm);
}
header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.name-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
</style>
