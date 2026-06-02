<script lang="ts">
import { Pin, X } from '@lucide/svelte';
import type { UserCharts } from '$entities/user-charts';
import { chartSourceId, type LayerListItem } from '$shared/map';
import AddChartForm from './AddChartForm.svelte';
import LayerRow from './LayerRow.svelte';
import type { LayersView } from './layers-view.svelte';

interface Props {
  view: LayersView;
  userCharts?: UserCharts;
  onClose: () => void;
}

const { view, userCharts, onClose }: Props = $props();

const pinned = $derived(view.items.filter((item) => item.pinned));
const movable = $derived(view.items.filter((item) => !item.pinned));

// The overlay id of each user-imported chart maps back to its source id, so its row can show a
// remove control and a delete hits the right source.
const userChartIds = $derived(
  new Map((userCharts?.sources ?? []).map((source) => [chartSourceId(source.id), source.id])),
);
let addOpen = $state(false);

// Group the movable rows into charts-and-depth versus the live overlays so the list reads as
// organized. Reorder still operates on the live order; a header marks each category change.
function categoryOf(item: LayerListItem): string {
  return item.band === 'basemap' || item.band === 'bathymetry' ? 'Charts & Depth' : 'Overlays';
}

let listEl = $state<HTMLUListElement>();

// The non-pinned id being dragged, and the insertion slot it would land in. The slot is an
// index in the movable list with the dragged row removed, matching view.reorder's contract.
let dragId = $state<string | null>(null);
let dropSlot = $state<number | null>(null);

// The movable rows minus the one being dragged, computed once per drag frame rather than
// re-filtered for every row inside indicatorFor.
const remaining = $derived(
  dragId === null ? movable : movable.filter((item) => item.id !== dragId),
);

function movableIndex(id: string): number {
  return movable.findIndex((item) => item.id === id);
}

// Translate an insertion slot (movable list, dragged row removed) into the id of the row it
// renders against, plus which edge, so a LayerRow can draw the drop indicator.
function indicatorFor(id: string): { before: boolean; after: boolean } {
  if (dragId === null || dropSlot === null || id === dragId) {
    return { before: false, after: false };
  }
  const rowIndex = remaining.findIndex((item) => item.id === id);
  if (rowIndex < 0) return { before: false, after: false };
  if (dropSlot === remaining.length) {
    return { before: false, after: rowIndex === remaining.length - 1 };
  }
  return { before: rowIndex === dropSlot, after: false };
}

function slotFromPointer(clientY: number): number {
  if (!listEl) return 0;
  const rows = [...listEl.querySelectorAll<HTMLElement>('[data-layer-row]')].filter(
    (el) => el.dataset.layerRow !== dragId,
  );
  for (let i = 0; i < rows.length; i++) {
    const rect = rows[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return rows.length;
}

function handlePointerDown(id: string, event: PointerEvent): void {
  if (event.button !== 0 && event.pointerType === 'mouse') return;
  event.preventDefault();
  dragId = id;
  dropSlot = movableIndex(id);
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);

  // One AbortController tears down all three listeners on drop or cancel, so the teardown
  // lives in a single place rather than being repeated per handler.
  const drag = new AbortController();
  const { signal } = drag;
  const finish = (commit: boolean): void => {
    drag.abort();
    handle.releasePointerCapture(event.pointerId);
    if (commit && dragId !== null && dropSlot !== null) view.reorder(dragId, dropSlot);
    dragId = null;
    dropSlot = null;
  };
  handle.addEventListener(
    'pointermove',
    (move) => {
      dropSlot = slotFromPointer(move.clientY);
    },
    { signal },
  );
  handle.addEventListener('pointerup', () => finish(true), { signal });
  handle.addEventListener('pointercancel', () => finish(false), { signal });
}

function handleKeydown(id: string, event: KeyboardEvent): void {
  const from = movableIndex(id);
  if (from < 0) return;
  let to = from;
  if (event.key === 'ArrowUp') to = from - 1;
  else if (event.key === 'ArrowDown') to = from + 1;
  else return;
  event.preventDefault();
  if (to < 0 || to >= movable.length) return;
  view.reorder(id, to);
  // Keep focus on the moved handle as it follows the row to its new position.
  requestAnimationFrame(() => {
    const moved = listEl?.querySelector<HTMLElement>(
      `[data-layer-row="${CSS.escape(id)}"] .handle`,
    );
    moved?.focus();
  });
}
</script>

<aside class="layers-panel" aria-label="Layers">
  <header>
    <h2>Layers</h2>
    <button type="button" class="close" aria-label="Close" onclick={onClose}>
      <X size={18} aria-hidden="true" />
    </button>
  </header>

  <div class="body">
    {#if view.items.length === 0}
      <p class="empty">No layers</p>
    {:else}
      {#if pinned.length > 0}
        <ul class="pinned-list">
          {#each pinned as item (item.id)}
            <li class="pinned-row">
              <span class="pin" aria-hidden="true"><Pin size={16} /></span>
              <span class="title" title={item.title}>{item.title}</span>
              <span class="on-top">On top</span>
            </li>
          {/each}
        </ul>
      {/if}

      <ul class="rows" bind:this={listEl}>
        {#each movable as item, i (item.id)}
          {@const indicator = indicatorFor(item.id)}
          {@const removeId = userChartIds.get(item.id)}
          {#if i === 0 || categoryOf(movable[i - 1]) !== categoryOf(item)}
            <li class="group-label" aria-hidden="true">{categoryOf(item)}</li>
          {/if}
          <LayerRow
            {item}
            {view}
            index={i}
            count={movable.length}
            dragging={dragId === item.id}
            dropBefore={indicator.before}
            dropAfter={indicator.after}
            onHandlePointerDown={(e) => handlePointerDown(item.id, e)}
            onHandleKeydown={(e) => handleKeydown(item.id, e)}
            onRemove={removeId ? () => userCharts?.remove(removeId) : undefined}
          />
        {/each}
      </ul>
    {/if}
    {#if userCharts}
      <div class="add-chart-area">
        {#if addOpen}
          <AddChartForm {userCharts} onDone={() => (addOpen = false)} />
        {:else}
          <button type="button" class="add-chart" onclick={() => (addOpen = true)}>
            + Add a chart
          </button>
        {/if}
      </div>
    {/if}
  </div>
</aside>

<style>
.layers-panel {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  inline-size: 22rem;
  max-inline-size: 100%;
  background: var(--surface-overlay);
  border-inline-end: 1px solid var(--border);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-block-end: 1px solid var(--border);
}
header h2 {
  flex: 1;
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}
.close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-block-size: var(--control-size);
  min-inline-size: var(--control-size);
  padding: 0.5rem;
  border: 0;
  border-radius: var(--radius-sm);
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
  padding: 0.5rem 0.75rem 0.75rem;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.empty {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.pinned-list,
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.pinned-list {
  margin-block-end: 0.45rem;
}
.pinned-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-block-size: var(--control-size);
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.pin {
  display: inline-flex;
  color: var(--text-muted);
}
.pinned-row .title {
  flex: 1;
  min-inline-size: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-md);
  font-weight: 600;
}
.on-top {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--text-muted);
}
.group-label {
  margin-block-start: 0.35rem;
  padding-inline: 0.2rem;
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--text-muted);
}
.group-label:first-child {
  margin-block-start: 0;
}
.add-chart-area {
  margin-block-start: 0.5rem;
  padding-block-start: 0.5rem;
  border-block-start: 1px solid var(--border);
}
.add-chart {
  inline-size: 100%;
  min-block-size: var(--control-size);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.add-chart:hover {
  border-color: var(--accent);
}
@media (max-width: 600px) {
  .layers-panel {
    inline-size: 100%;
    block-size: auto;
    max-block-size: 60vh;
    border-inline-end: 0;
    border-block-start: 1px solid var(--border);
  }
}
</style>
