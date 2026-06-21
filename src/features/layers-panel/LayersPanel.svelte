<script lang="ts">
import { ChevronRight, Pin, Plus } from '@lucide/svelte';
import type { UserCharts } from '$entities/user-charts';
import { chartSourceId, type LayerListItem } from '$shared/map';
import type { PersistedValue } from '$shared/settings';
import { SlideOver } from '$shared/ui';
import AddChartForm from './AddChartForm.svelte';
import LayerRow from './LayerRow.svelte';
import { CATEGORY_DEFAULT_OPEN, CATEGORY_ORDER, layerCategory } from './layer-category';
import { createLayerReorder } from './layers-reorder.svelte';
import type { LayersView } from './layers-view.svelte';
import SourceDetail from './SourceDetail.svelte';

interface Props {
  view: LayersView;
  userCharts?: UserCharts;
  // Per-category open/closed state, persisted so the panel reopens the way it was left.
  categoriesOpen?: PersistedValue<Record<string, boolean>>;
  onClose: () => void;
  onBack?: () => void;
}

const { view, userCharts, categoriesOpen, onClose, onBack }: Props = $props();

const pinned = $derived(view.items.filter((item) => item.pinned));
// Sub-layers (a chart facet, for example the NOAA ENC data quality overlay) are not their own
// movable rows: they nest under their parent's row, so they are excluded from the reorderable list
// and grouped by parent id below.
const movable = $derived(view.items.filter((item) => !item.pinned && !item.parent));
const childrenByParent = $derived.by(() => {
  const map = new Map<string, LayerListItem[]>();
  for (const item of view.items) {
    if (!item.parent) continue;
    const list = map.get(item.parent);
    if (list) list.push(item);
    else map.set(item.parent, [item]);
  }
  return map;
});

// Bucket the movable rows into categories, keeping each row's index in `movable` so the drag handlers
// (which address rows by their movable index) keep working unchanged. The categories render in
// CATEGORY_ORDER, which matches the map z-order, so the panel order equals the stack and a collapsed
// category's rows stay in the DOM (hidden) in their movable position.
const categories = $derived.by(() => {
  const byId = new Map<string, { title: string; rows: { item: LayerListItem; i: number }[] }>();
  movable.forEach((item, i) => {
    const cat = layerCategory(item);
    const bucket = byId.get(cat.id);
    if (bucket) bucket.rows.push({ item, i });
    else byId.set(cat.id, { title: cat.title, rows: [{ item, i }] });
  });
  return CATEGORY_ORDER.flatMap((id) => {
    const bucket = byId.get(id);
    return bucket ? [{ id, title: bucket.title, rows: bucket.rows }] : [];
  });
});

function isOpen(id: string): boolean {
  return categoriesOpen?.value[id] ?? CATEGORY_DEFAULT_OPEN[id] ?? true;
}

function toggleCategory(id: string): void {
  if (!categoriesOpen) return;
  categoriesOpen.set({ ...categoriesOpen.value, [id]: !isOpen(id) });
}

// The overlay id of each user-imported chart maps back to its source id, so its row can open a
// detail (rename, info, delete) for the right source.
const userChartIds = $derived(
  new Map((userCharts?.sources ?? []).map((source) => [chartSourceId(source.id), source.id])),
);
let addOpen = $state(false);
let manageId = $state<string | undefined>();
const manageSource = $derived(
  manageId ? userCharts?.sources.find((source) => source.id === manageId) : undefined,
);

let listEl = $state<HTMLUListElement>();

// The imperative pointer-and-keyboard drag-reorder controller, given the live list element so it
// can measure rows and refocus the moved handle. It owns the drag state and announcement; the
// template reads them back through its getters.
const reorder = createLayerReorder(
  () => view,
  () => movable,
  () => listEl,
);
</script>

<!-- While a chart detail is open it shows its own "Back to layers" control, so the panel-level
     "Back to menu" arrow is suppressed to avoid two stacked back buttons. -->
<SlideOver
  title="Layers and charts"
  closeLabel="Close layers and charts"
  {onClose}
  onBack={manageSource ? undefined : onBack}
>
  <div class="visually-hidden" aria-live="polite">{reorder.reorderAnnouncement}</div>
  {#if manageSource && userCharts}
    {#key manageSource.id}
      <SourceDetail source={manageSource} {userCharts} onBack={() => (manageId = undefined)} />
    {/key}
  {:else}
    {#if view.items.length === 0}
      <p class="muted-note">No layers</p>
    {:else}
      {#if pinned.length > 0}
        <ul class="pinned-list">
          {#each pinned as item (item.id)}
            <li class="pinned-row">
              <span class="pin" aria-hidden="true"><Pin size={16} /></span>
              <span class="title" title={item.title}>{item.title}</span>
              <span class="caps-label">On top</span>
            </li>
          {/each}
        </ul>
      {/if}

      <ul class="rows" bind:this={listEl}>
        {#each categories as cat (cat.id)}
          {@const expanded = isOpen(cat.id)}
          {@const panelId = `layer-cat-${cat.id}`}
          <li class="category">
            <h3 class="category-head">
              <button
                type="button"
                class="category-toggle"
                aria-expanded={expanded}
                aria-controls={panelId}
                onclick={() => toggleCategory(cat.id)}
              >
                <ChevronRight
                  class={expanded ? 'chev chev-open' : 'chev'}
                  size={16}
                  aria-hidden="true"
                />
                <span class="category-title caps-label">{cat.title}</span>
                <span class="category-count" aria-hidden="true">{cat.rows.length}</span>
              </button>
            </h3>
            <ul class="category-rows" id={panelId} hidden={!expanded}>
              {#each cat.rows as { item, i }, j (item.id)}
                {@const indicator = reorder.indicatorFor(item.id)}
                {@const removeId = userChartIds.get(item.id)}
                {@const prev = cat.rows[j - 1]?.item}
                <!-- Emit a named group's title once, on its first facet within the category. -->
                {#if item.group && item.group.id !== prev?.group?.id}
                  <li class="facet-group-label caps-label" aria-hidden="true">
                    {item.group.title}
                  </li>
                {/if}
                <LayerRow
                  {item}
                  {view}
                  index={i}
                  count={movable.length}
                  groupTitle={item.group?.title}
                  subLayers={childrenByParent.get(item.id) ?? []}
                  dragging={reorder.dragId === item.id}
                  dropBefore={indicator.before}
                  dropAfter={indicator.after}
                  onHandlePointerDown={(e) => reorder.handlePointerDown(item.id, e)}
                  onHandleKeydown={(e) => reorder.handleKeydown(item.id, e)}
                  onManage={removeId ? () => (manageId = removeId) : undefined}
                />
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
    {/if}
    {#if userCharts}
      <div class="add-chart-area">
        {#if addOpen}
          <AddChartForm {userCharts} onDone={() => (addOpen = false)} />
        {:else}
          <button type="button" class="btn" onclick={() => (addOpen = true)}>
            <Plus size={16} aria-hidden="true" />
            Add a chart
          </button>
        {/if}
      </div>
    {/if}
  {/if}
</SlideOver>

<style>
.pinned-list,
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.pinned-list {
  margin-block-end: var(--space-1);
}
.pinned-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-block-size: var(--row-size);
  padding: var(--space-1) var(--space-2);
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
.category {
  list-style: none;
}
.category-head {
  margin: 0;
}
/* The whole header is the disclosure control: a chevron that rotates open, the category title, and a
   count of the rows it holds, sized to a full touch target. */
.category-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  inline-size: 100%;
  min-block-size: var(--control-size);
  padding-inline: var(--space-1);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}
.category-toggle:hover {
  background: var(--accent-tint);
}
.category-toggle :global(.chev) {
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}
.category-toggle :global(.chev-open) {
  transform: rotate(90deg);
}
.category-title {
  flex: 1;
  min-inline-size: 0;
  text-align: start;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.category-count {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.category-rows {
  list-style: none;
  margin: var(--space-1) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.category-rows[hidden] {
  display: none;
}
/* A named-group title (a multi-facet chart) sits directly above its facet card and binds to it: the
   negative end margin cancels the .category-rows gap so the card hugs its title, while the gap to the
   card above stays. The leading indent aligns it over the card. */
.facet-group-label {
  margin-block-start: var(--space-1);
  margin-block-end: calc(-1 * var(--space-1));
  padding-inline: 0.2rem;
}
.facet-group-label:first-child {
  margin-block-start: 0;
}
.add-chart-area {
  margin-block-start: var(--space-2);
  padding-block-start: var(--space-2);
  border-block-start: 1px solid var(--border);
}
</style>
