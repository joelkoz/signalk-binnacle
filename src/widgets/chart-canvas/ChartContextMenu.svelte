<script lang="ts">
import { MapPin, Navigation, Ruler } from '@lucide/svelte';
import { focusOnMount } from '$shared/ui';

interface Props {
  // The press point in chart pixels, and the chart's pixel size, so the menu clamps inside the
  // visible area instead of overflowing an edge.
  x: number;
  y: number;
  width: number;
  height: number;
  onGoToHere: () => void;
  // Optional: absent when the app does not wire dropping. Write access is unknowable client-side,
  // so a refused save surfaces as the Waypoints panel error rather than hiding the item.
  onDropWaypoint?: () => void;
  // Optional: arms the measure tool with its first point at the pressed position, so measuring
  // starts where the navigator is looking instead of via the app menu.
  onMeasureFrom?: () => void;
  onClose: () => void;
}

const { x, y, width, height, onGoToHere, onDropWaypoint, onMeasureFrom, onClose }: Props = $props();

// Wide enough for the longest label ("Measure from here") at the inherited font size; the menu
// is fixed to this width below so the clamp math always matches the rendered box.
const MENU_WIDTH = 200;
const ITEM_HEIGHT = 44;
const MENU_PADDING = 4;
const EDGE = 8;

// Clamp the anchor so the menu (centered on x) stays a margin clear of both side edges.
const left = $derived(
  Math.min(
    Math.max(x, MENU_WIDTH / 2 + EDGE),
    Math.max(MENU_WIDTH / 2 + EDGE, width - MENU_WIDTH / 2 - EDGE),
  ),
);
// Prefer above the press so a finger does not cover the menu; drop below near the top edge.
const itemCount = $derived(1 + (onDropWaypoint ? 1 : 0) + (onMeasureFrom ? 1 : 0));
const menuHeight = $derived(itemCount * ITEM_HEIGHT + MENU_PADDING);
const above = $derived(y > menuHeight + EDGE * 2 || y > height / 2);
const top = $derived(above ? y - EDGE : y + EDGE);

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') onClose();
}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- A transparent backdrop catches the outside tap to dismiss and keeps the press off the map. -->
<button type="button" class="backdrop" aria-label="Dismiss menu" onclick={onClose}></button>
<div
  class="menu"
  role="menu"
  aria-label="Chart actions"
  style="left: {left}px; top: {top}px; inline-size: {MENU_WIDTH}px; transform: translate(-50%, {above
    ? '-100%'
    : '0'});"
>
  <button type="button" role="menuitem" class="item" use:focusOnMount onclick={onGoToHere}>
    <Navigation size={16} aria-hidden="true" />
    Go to here
  </button>
  {#if onDropWaypoint}
    <button type="button" role="menuitem" class="item" onclick={onDropWaypoint}>
      <MapPin size={16} aria-hidden="true" />
      Drop waypoint
    </button>
  {/if}
  {#if onMeasureFrom}
    <button type="button" role="menuitem" class="item" onclick={onMeasureFrom}>
      <Ruler size={16} aria-hidden="true" />
      Measure from here
    </button>
  {/if}
</div>

<style>
.backdrop {
  position: absolute;
  inset: 0;
  z-index: var(--z-overlay);
  padding: 0;
  border: 0;
  background: transparent;
  cursor: default;
}
.menu {
  position: absolute;
  z-index: var(--z-menu);
  padding: 0.2rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-overlay);
  box-shadow: var(--shadow-overlay);
}
.item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  inline-size: 100%;
  min-block-size: var(--control-size);
  padding: 0 0.7rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.item:hover {
  background: var(--accent-tint);
  color: var(--accent);
}
</style>
