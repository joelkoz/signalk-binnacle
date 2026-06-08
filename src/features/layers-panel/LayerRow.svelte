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
}: Props = $props();

const percent = $derived(Math.round(item.opacity * 100));
</script>

<li
  class="row"
  class:dragging
  class:drop-before={dropBefore}
  class:drop-after={dropAfter}
  data-layer-row={item.id}
>
  <div class="row-main">
    <button
      type="button"
      class="icon-btn handle"
      aria-label={`Move ${item.title}, position ${index + 1} of ${count}`}
      aria-keyshortcuts="ArrowUp ArrowDown"
      onpointerdown={onHandlePointerDown}
      onkeydown={onHandleKeydown}
    >
      <GripVertical size={18} aria-hidden="true" />
    </button>
    <LayerToggle
      title={item.title}
      visible={item.visible}
      onToggle={(visible) => view.toggle(item.id, visible)}
    />
    {#if onManage}
      <button type="button" class="icon-btn" aria-label={`Manage ${item.title}`} onclick={onManage}>
        <Settings2 size={18} aria-hidden="true" />
      </button>
    {/if}
  </div>
  {#if item.supportsOpacity && item.visible}
    <div class="opacity-line">
      <span class="lbl">Opacity</span>
      <input
        class="opacity range"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={item.opacity}
        aria-label={`${item.title} opacity`}
        oninput={(e) => view.setOpacity(item.id, Number(e.currentTarget.value))}
      >
      <span class="opacity-val">{percent}%</span>
    </div>
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
  gap: 0.4rem;
}
/* The drag handle is an .icon-btn that keeps the grab cursor and suppresses touch scrolling so a
   drag starts cleanly on a touchscreen. */
.handle {
  cursor: grab;
  touch-action: none;
}
.opacity-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-block-start: 0.1rem;
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
/* The slider styling comes from the shared .range; only the flex sizing in the row is local. */
.opacity {
  flex: 1;
}
</style>
