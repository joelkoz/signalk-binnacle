<script lang="ts">
import { GripVertical, Settings2 } from '@lucide/svelte';
import type { LayerListItem } from '$shared/map';
import LayerToggle from './LayerToggle.svelte';
import type { LayersView } from './layers-view.svelte';

interface Props {
  item: LayerListItem;
  view: LayersView;
  index: number;
  count: number;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onHandlePointerDown: (event: PointerEvent) => void;
  onHandleKeydown: (event: KeyboardEvent) => void;
  // Present only on a user-imported chart row, which opens a detail (rename, info, delete).
  onManage?: () => void;
  // Sub-layers of this row (a chart facet, for example NOAA ENC data quality). When present, the row
  // renders as a facet group: the drag handle becomes a left gutter and the parent and child toggles
  // stack in one aligned column with the opacity slider last. Each child is a toggle only, disabled
  // while this row is off, so a facet never renders without the chart it annotates.
  subLayers?: LayerListItem[];
  // Set when this row is the top-level facet of a named group (NOAA ENC). The visible group title is
  // drawn by the panel above the card; here it names the listitem so a screen reader speaks the group
  // the row belongs to, since the visible title is decorative.
  groupTitle?: string;
}

const {
  item,
  view,
  index,
  count,
  dragging,
  dropBefore,
  dropAfter,
  onHandlePointerDown,
  onHandleKeydown,
  onManage,
  subLayers = [],
  groupTitle,
}: Props = $props();

// A layer at zero opacity while its toggle stays checked is a silent failure for safety layers
// (AIS, anchor ring), so the slider floor keeps them faintly visible.
const MIN_LAYER_OPACITY = 0.15;
const percent = $derived(Math.round(item.opacity * 100));
// The drag handle moves the whole row, so for a facet group it names the group, otherwise the layer.
// A normal row carries no group title, so this resolves to the layer title there.
const handleLabel = $derived(groupTitle ?? item.title);
</script>

{#snippet dragHandle()}
  <button
    type="button"
    class="icon-btn handle"
    aria-label={`Move ${handleLabel}, position ${index + 1} of ${count}`}
    aria-keyshortcuts="ArrowUp ArrowDown"
    onpointerdown={onHandlePointerDown}
    onkeydown={onHandleKeydown}
  >
    <GripVertical size={18} aria-hidden="true" />
  </button>
{/snippet}

{#snippet manageButton()}
  {#if onManage}
    <button type="button" class="icon-btn" aria-label={`Manage ${item.title}`} onclick={onManage}>
      <Settings2 size={18} aria-hidden="true" />
    </button>
  {/if}
{/snippet}

{#snippet opacityLine()}
  {#if item.supportsOpacity && item.visible}
    <div class="opacity-line">
      <span class="lbl">Opacity</span>
      <input
        class="opacity range"
        type="range"
        min={MIN_LAYER_OPACITY}
        max="1"
        step="0.05"
        value={item.opacity}
        aria-label={`${item.title} opacity`}
        oninput={(e) => view.setOpacity(item.id, Number(e.currentTarget.value))}
      >
      <span class="opacity-val">{percent}%</span>
    </div>
  {/if}
{/snippet}

<li
  class="row"
  class:dragging
  class:drop-before={dropBefore}
  class:drop-after={dropAfter}
  aria-label={groupTitle}
  data-layer-row={item.id}
>
  {#if subLayers.length > 0}
    <!-- A facet group: one handle moves the whole group, and the parent and child toggles share one
         aligned column so their checkboxes line up, with the opacity slider last. -->
    <div class="facet-row">
      {@render dragHandle()}
      <div class="facet-stack">
        <div class="facet-line">
          <LayerToggle
            title={item.title}
            visible={item.visible}
            onToggle={(visible) => view.toggle(item.id, visible)}
          />
          {@render manageButton()}
        </div>
        {#each subLayers as sub (sub.id)}
          <div class="facet-line">
            <LayerToggle
              title={sub.title}
              visible={sub.visible}
              disabled={!item.visible}
              onToggle={(visible) => view.toggle(sub.id, visible)}
            />
          </div>
        {/each}
        {@render opacityLine()}
      </div>
    </div>
  {:else}
    <div class="row-main">
      {@render dragHandle()}
      <LayerToggle
        title={item.title}
        visible={item.visible}
        onToggle={(visible) => view.toggle(item.id, visible)}
      />
      {@render manageButton()}
    </div>
    {@render opacityLine()}
  {/if}
</li>

<style>
.row {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  padding: 0.1rem var(--space-2);
}
.row.dragging {
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: var(--shadow-overlay);
  opacity: 0.9;
}
/* A drop indicator line at the leading or trailing edge of the row the dragged item will land at. */
.row.drop-before::before,
.row.drop-after::after {
  content: "";
  position: absolute;
  inset-inline: 0;
  block-size: 2px;
  background: var(--accent);
}
.row.drop-before::before {
  inset-block-start: -3px;
}
.row.drop-after::after {
  inset-block-end: -3px;
}
.row-main {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
/* The row icon buttons (drag handle, manage) take the denser list-row size so the row tracks the
   toggle height rather than the taller action-control size. */
.row :global(.icon-btn) {
  min-block-size: var(--row-size);
  min-inline-size: var(--row-size);
}
/* The drag handle is an .icon-btn that keeps the grab cursor and suppresses touch scrolling so a
   drag starts cleanly on a touchscreen. */
.handle {
  cursor: grab;
  touch-action: none;
}
/* A facet group: the handle is a left gutter top-aligned with the first facet, and the facets stack
   to its right in one column so every toggle's checkbox shares the same left edge. */
.facet-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
}
.facet-stack {
  flex: 1;
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
}
.facet-line {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.opacity-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.opacity-line .lbl {
  min-inline-size: 3.2rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.opacity-val {
  min-inline-size: 2.4rem;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-align: end;
  color: var(--text-muted);
}
.opacity {
  flex: 1;
}
</style>
