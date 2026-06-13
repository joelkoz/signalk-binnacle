<script lang="ts">
import { Check } from '@lucide/svelte';
import type { LayerListItem } from '$shared/map';
import { registerDismiss, rovingFocus } from '$shared/ui';

interface Props {
  // The mutually-exclusive area fills (the LayerManager enforces one-at-a-time) and the freely
  // combinable overlays, already split by the parent.
  fills: LayerListItem[];
  overlays: LayerListItem[];
  // The source and fetch-age line, surfaced in the menu too so it is not hidden behind a click;
  // undefined before any grid loads.
  provenance: string | undefined;
  onToggle: (id: string, next: boolean) => void;
  onClose: () => void;
}

const { fills, overlays, provenance, onToggle, onClose }: Props = $props();

const groups = $derived(
  [
    { label: 'Area fill', items: fills },
    { label: 'Overlays', items: overlays },
  ].filter((group) => group.items.length > 0),
);

// Escape closes through the shared dismiss stack, so a menu opened over the weather panel peels off
// before the panel itself, in last-opened-first order.
$effect(() => registerDismiss(onClose));
</script>

<!-- A transparent backdrop catches an outside tap to dismiss and keeps the press off the map. -->
<button
  type="button"
  class="overlay-backdrop"
  aria-label="Close weather layers"
  onclick={onClose}
></button>
<!-- Non-modal on purpose: a toolbar dropdown over the map, not a modal. No focus trap, so Tab can
     leave into the map and footer; do not "correct" this into a focusTrap. rovingFocus lands the
     keyboard on the first row and moves it with the arrow keys. -->
<div class="menu" role="group" aria-label="Weather layers" use:rovingFocus={'.menu-row'}>
  {#each groups as group (group.label)}
    <p class="caps-label">{group.label}</p>
    {#each group.items as item (item.id)}
      <button
        type="button"
        class="menu-row"
        class:is-on={item.visible}
        aria-pressed={item.visible}
        onclick={() => onToggle(item.id, !item.visible)}
      >
        <span>{item.title}</span>
        {#if item.visible}
          <Check size={16} aria-hidden="true" />
        {/if}
      </button>
    {/each}
  {/each}
  {#if provenance}
    <p class="provenance muted-note">{provenance}</p>
  {/if}
</div>

<style>
/* Anchored under the floating trigger (which sits at --space-2 and is one --control-size tall),
   scrolling inside its own box so it grows down the list rather than along the header. */
.menu {
  position: absolute;
  z-index: var(--z-menu);
  inset-block-start: calc(var(--space-2) + var(--control-size) + var(--space-1));
  inset-inline-start: var(--space-2);
  inline-size: 15rem;
  max-inline-size: calc(100cqw - 2 * var(--space-2));
  max-block-size: min(60vh, 24rem);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-overlay);
  box-shadow: var(--shadow-overlay);
}
.menu .caps-label {
  margin: var(--space-1) 0 0.1rem;
}
.menu .caps-label:first-child {
  margin-block-start: 0;
}
.menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  inline-size: 100%;
  min-block-size: var(--control-size);
  padding: 0 0.6rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  text-align: start;
  cursor: pointer;
}
.menu-row:hover {
  background: var(--surface-raised);
}
/* The lit on-state reads accent-on-near-black by brightness, so it holds in night-red where hue
   barely separates; the trailing check is the redundant shape cue. */
.menu-row.is-on {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-tint);
}
.menu .provenance {
  margin: var(--space-1) 0 0;
  padding: 0 0.6rem;
}
/* On a narrow weather panel (not a narrow viewport: the panel is min(94vw, 46rem) and can be narrow
   on a wide screen), dock the card to the bottom of the map as a sheet instead of covering the
   small map from the top. Keyed off the panel-map container width, set by the parent. */
@container (max-width: 26rem) {
  .menu {
    inset-block: auto var(--space-2);
    inset-inline: var(--space-2);
    inline-size: auto;
    max-inline-size: none;
    max-block-size: min(50vh, 18rem);
  }
}
</style>
