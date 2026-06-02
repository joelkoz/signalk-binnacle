<script lang="ts">
import { ArrowLeft, Trash2 } from '@lucide/svelte';
import type { UserChartSource, UserCharts } from '$entities/user-charts';

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

function formatSize(bytes: number | undefined): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
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
    <button type="button" class="back" aria-label="Back to layers" onclick={onBack}>
      <ArrowLeft size={18} aria-hidden="true" />
    </button>
    <h3>Chart detail</h3>
  </header>

  <label class="name-field">
    <span>Name</span>
    <input type="text" bind:value={name} onblur={saveName}>
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
        <dd>{formatSize(source.byteSize)}</dd>
      </div>
    {/if}
  </dl>

  {#if confirming}
    <div class="confirm">
      <p>Delete this chart?{source.byteSize ? ` Frees ${formatSize(source.byteSize)}.` : ''}</p>
      <div class="actions">
        <button type="button" onclick={() => (confirming = false)}>Cancel</button>
        <button type="button" class="danger" onclick={doDelete}>Delete</button>
      </div>
    </div>
  {:else}
    <button type="button" class="delete" onclick={() => (confirming = true)}>
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
.back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: var(--control-size);
  min-block-size: var(--control-size);
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.back:hover {
  color: var(--text);
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
.name-field span {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--text-muted);
}
.name-field input {
  min-block-size: var(--control-size);
  padding-inline: 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: var(--text-base);
}
dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
dl div {
  display: grid;
  grid-template-columns: 5rem 1fr;
  gap: 0.5rem;
}
dt {
  color: var(--text-muted);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.delete {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-block-size: var(--control-size);
  padding-inline: 0.6rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--alarm);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.confirm {
  padding: 0.5rem;
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
.actions button {
  min-block-size: var(--control-size);
  padding-inline: 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.actions .danger {
  border-color: var(--alarm);
  color: var(--alarm);
}
</style>
