<script lang="ts">
import { Navigation } from '@lucide/svelte';

interface Props {
  // The press point in chart pixels, and the chart's pixel size, so the menu clamps inside the
  // visible area instead of overflowing an edge.
  x: number;
  y: number;
  width: number;
  height: number;
  onGoToHere: () => void;
  onClose: () => void;
}

const { x, y, width, height, onGoToHere, onClose }: Props = $props();

const MENU_WIDTH = 150;
const MENU_HEIGHT = 44;
const EDGE = 8;

// Clamp the anchor so the menu (centered on x) stays a margin clear of both side edges.
const left = $derived(
  Math.min(
    Math.max(x, MENU_WIDTH / 2 + EDGE),
    Math.max(MENU_WIDTH / 2 + EDGE, width - MENU_WIDTH / 2 - EDGE),
  ),
);
// Prefer above the press so a finger does not cover the menu; drop below near the top edge.
const above = $derived(y > MENU_HEIGHT + EDGE * 2 || y > height / 2);
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
  style="left: {left}px; top: {top}px; transform: translate(-50%, {above ? '-100%' : '0'});"
>
  <button type="button" role="menuitem" class="item" onclick={onGoToHere}>
    <Navigation size={16} aria-hidden="true" />
    Go to here
  </button>
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
