<script lang="ts">
import { ArrowLeft, Trash2 } from '@lucide/svelte';
import type { UserChartSource, UserCharts } from '$entities/user-charts';
import { formatBytes } from '$shared/lib';

interface Props {
  source: UserChartSource;
  userCharts: UserCharts;
  onBack: () => void;
}

const { source, userCharts, onBack }: Props = $props();

let confirming = $state(false);
let name = $state('');

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
  onBack();
  await userCharts.remove(source.id);
}
</script>

<div class="detail">
  <header>
    <button type="button" class="icon-btn" aria-label="Back to layers" onclick={onBack}>
      <ArrowLeft size={18} aria-hidden="true" />
    </button>
    <h3>Chart detail</h3>
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

  <dl>
    <div>
      <dt>Type</dt>
      <dd>{source.kind === 'vector' ? 'Vector' : 'Raster'}</dd>
    </div>
    <div>
      <dt>Source</dt>
      <dd>{source.origin.type === 'url' ? 'URL' : 'File (offline)'}</dd>
    </div>
    <div>
      <dt>Zoom</dt>
      <dd>{source.minzoom ?? 0} to {source.maxzoom ?? source.minzoom ?? 0}</dd>
    </div>
    <div>
      <dt>Bounds</dt>
      <dd>{fmtBounds(source.bounds)}</dd>
    </div>
    {#if source.byteSize}
      <div>
        <dt>Size</dt>
        <dd>{formatBytes(source.byteSize)}</dd>
      </div>
    {/if}
  </dl>

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
dl {
  margin: 0;
  display: flex;
  flex-direction: column;
}
dl div {
  display: grid;
  grid-template-columns: 5rem 1fr;
  gap: var(--space-2);
  padding-block: 0.3rem;
}
/* A hairline between spec rows so the detail scans as a table, not a gray block. */
dl div + div {
  border-block-start: 1px solid var(--border);
}
dt {
  color: var(--text-muted);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
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
