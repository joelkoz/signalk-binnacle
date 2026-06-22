<script lang="ts">
import { LayoutGrid, MapPin, Navigation, Route, Ruler } from '@lucide/svelte';
import { registerDismiss, rovingFocus } from '$shared/ui';

interface Props {
  // The press point in chart pixels, and the chart's pixel size, so the menu clamps inside the
  // visible area instead of overflowing an edge.
  x: number;
  y: number;
  width: number;
  height: number;
  onGoToHere: () => void;
  // Opens the routes panel and starts a new route in drawing mode, so the navigator can build a route
  // straight from the chart instead of going to the panel first.
  onStartRoute: () => void;
  // Optional: absent when the app does not wire dropping. Write access is unknowable client-side,
  // so a refused save surfaces as the Waypoints panel error rather than hiding the item.
  onDropWaypoint?: () => void;
  // Optional: arms the measure tool with its first point at the pressed position, so measuring
  // starts where the navigator is looking instead of via the app menu.
  onMeasureFrom?: () => void;
  // Optional: present only when the press lands in a plotter-extension widget area that can take a
  // widget. Opens the add-widget picker for that area.
  onAddWidget?: () => void;
  onClose: () => void;
}

const {
  x,
  y,
  width,
  height,
  onGoToHere,
  onStartRoute,
  onDropWaypoint,
  onMeasureFrom,
  onAddWidget,
  onClose,
}: Props = $props();

// Escape closes through the shared dismiss stack, so it peels the topmost surface in order rather
// than a raw window listener firing alongside any other open menu. onClose is wrapped so the effect
// does not reactively read the prop (the parent passes a fresh closure each render), which would
// re-register and push this menu back to the top of the stack, breaking last-opened-first order.
$effect(() => registerDismiss(() => onClose()));

// Wide enough for the longest label ("Start a route here") at the inherited font size; the menu
// is fixed to this width below so the clamp math always matches the rendered box.
const MENU_WIDTH = 200;
// Mirrors the .menu-item control height (--control-size, 2.75rem at the 16px base) for the
// above-or-below clamp math; the layout arithmetic needs a pixel number, not a CSS token.
const ITEM_HEIGHT = 44;
// The menu's top plus bottom padding, mirroring 2 * --space-1 (0.25rem each at the 16px base), so
// the clamp height matches the rendered box; the CSS padding below uses the same token.
const MENU_PADDING = 8;
// The clear margin kept from each viewport edge, mirroring --space-2 (0.5rem at the 16px base).
const EDGE = 8;

// Clamp the anchor so the menu (centered on x) stays a margin clear of both side edges.
const left = $derived(
  Math.min(
    Math.max(x, MENU_WIDTH / 2 + EDGE),
    Math.max(MENU_WIDTH / 2 + EDGE, width - MENU_WIDTH / 2 - EDGE),
  ),
);
// Prefer above the press so a finger does not cover the menu; drop below near the top edge.
const itemCount = $derived(
  2 + (onDropWaypoint ? 1 : 0) + (onMeasureFrom ? 1 : 0) + (onAddWidget ? 1 : 0),
);
const menuHeight = $derived(itemCount * ITEM_HEIGHT + MENU_PADDING);
const above = $derived(y > menuHeight + EDGE * 2 || y > height / 2);
const top = $derived(above ? y - EDGE : y + EDGE);
</script>

<!-- A transparent backdrop catches the outside tap to dismiss and keeps the press off the map. -->
<button type="button" class="overlay-backdrop" aria-label="Dismiss menu" onclick={onClose}></button>
<div
  class="popover-card menu"
  role="menu"
  aria-label="Chart actions"
  tabindex="-1"
  use:rovingFocus={'[role="menuitem"]'}
  style="left: {left}px; top: {top}px; inline-size: {MENU_WIDTH}px; transform: translate(-50%, {above
    ? '-100%'
    : '0'});"
>
  <button type="button" role="menuitem" class="menu-item item" onclick={onGoToHere}>
    <Navigation size={16} aria-hidden="true" />
    Go to here
  </button>
  <button type="button" role="menuitem" class="menu-item item" onclick={onStartRoute}>
    <Route size={16} aria-hidden="true" />
    Start a route here
  </button>
  {#if onDropWaypoint}
    <button type="button" role="menuitem" class="menu-item item" onclick={onDropWaypoint}>
      <MapPin size={16} aria-hidden="true" />
      Drop waypoint
    </button>
  {/if}
  {#if onMeasureFrom}
    <button type="button" role="menuitem" class="menu-item item" onclick={onMeasureFrom}>
      <Ruler size={16} aria-hidden="true" />
      Measure from here
    </button>
  {/if}
  {#if onAddWidget}
    <button type="button" role="menuitem" class="menu-item item" onclick={onAddWidget}>
      <LayoutGrid size={16} aria-hidden="true" />
      Add widget
    </button>
  {/if}
</div>

<style>
.menu {
  position: absolute;
  z-index: var(--z-menu);
  padding: var(--space-1);
}
.item {
  white-space: nowrap;
}
</style>
