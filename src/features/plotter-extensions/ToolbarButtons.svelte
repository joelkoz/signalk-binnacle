<script lang="ts">
import { MoreHorizontal, Puzzle } from '@lucide/svelte';
import type { PlotterExtHost } from '$entities/plotter-ext';
import { registerDismiss, rovingFocus } from '$shared/ui';

interface Props {
  host: PlotterExtHost;
}

const { host }: Props = $props();

// Binnacle's icon set is lucide, not Material, so a manifest `icon` (a Material name) is not
// rendered directly; a generic extension glyph stands in, with the title as the accessible name.
const buttons = $derived(host.buttons);

// The footer shows at most this many extension controls. Past the limit the last slot becomes a
// "More" menu holding every action beyond the first two, so the strip never grows without bound.
const MAX_VISIBLE = 3;
const inline = $derived(buttons.length > MAX_VISIBLE ? buttons.slice(0, MAX_VISIBLE - 1) : buttons);
const overflow = $derived(buttons.length > MAX_VISIBLE ? buttons.slice(MAX_VISIBLE - 1) : []);

let moreOpen = $state(false);
let trigger = $state<HTMLButtonElement>();

type Entry = (typeof buttons)[number];
const key = (entry: Entry): string => `${entry.extensionId}/${entry.button.id}`;
const run = (entry: Entry): void => host.dispatchButton(entry.extensionId, entry.button.action);

function closeMore(restoreFocus = false): void {
  moreOpen = false;
  if (restoreFocus) trigger?.focus();
}

function pick(entry: Entry): void {
  run(entry);
  closeMore(true);
}

// If the overflow set empties while the menu is open (an extension unloaded), close it so a stray
// empty popover never lingers over the strip.
$effect(() => {
  if (moreOpen && overflow.length === 0) moreOpen = false;
});

// Escape peels this menu through the shared dismiss stack, in last-opened-first order with any other
// open surface, rather than a raw window listener.
$effect(() => {
  if (!moreOpen) return;
  return registerDismiss(() => closeMore(true));
});
</script>

{#if buttons.length > 0}
  <div class="pe-toolbar" role="toolbar" aria-label="Extension actions">
    {#each inline as entry (key(entry))}
      <button
        type="button"
        class="btn btn-pill"
        title={entry.button.title}
        aria-label={entry.button.title}
        onclick={() => run(entry)}
      >
        <Puzzle size={16} aria-hidden="true" />
        {entry.button.title}
      </button>
    {/each}
    {#if overflow.length > 0}
      <div class="pe-more">
        <button
          type="button"
          class="btn btn-pill"
          class:is-on={moreOpen}
          bind:this={trigger}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-controls={moreOpen ? 'pe-more-menu' : undefined}
          aria-label="More extension actions"
          title="More extension actions"
          onclick={() => (moreOpen = !moreOpen)}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
          More
        </button>
        {#if moreOpen}
          <!-- A transparent backdrop catches the outside tap to dismiss without reaching the chart. -->
          <button
            type="button"
            class="overlay-backdrop"
            aria-label="Dismiss menu"
            onclick={() => closeMore()}
          ></button>
          <div
            class="popover-card pe-more-menu"
            role="menu"
            id="pe-more-menu"
            aria-label="More extension actions"
            tabindex="-1"
            use:rovingFocus={'[role="menuitem"]'}
          >
            {#each overflow as entry (key(entry))}
              <button
                type="button"
                role="menuitem"
                class="menu-item pe-more-item"
                title={entry.button.title}
                onclick={() => pick(entry)}
              >
                <Puzzle size={16} aria-hidden="true" />
                <span class="pe-more-label">{entry.button.title}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
/* The toolbar contributes its buttons directly to the footer strip's flex row, so they read as one
   continuous row of pills with the built-in controls rather than a nested group with its own gap. */
.pe-toolbar {
  display: contents;
}
.pe-more {
  position: relative;
}
/* The strip sits at the bottom of the screen, so the menu opens upward from the More button and is
   end-aligned to never overflow the right viewport edge. It scrolls when the action list is long. */
.pe-more-menu {
  position: absolute;
  inset-block-end: calc(100% + var(--space-1));
  inset-inline-end: 0;
  z-index: var(--z-menu);
  display: flex;
  flex-direction: column;
  min-inline-size: 12rem;
  max-block-size: min(50dvh, 20rem);
  overflow-y: auto;
  padding: 0.2rem;
}
.pe-more-item {
  text-align: start;
}
.pe-more-label {
  overflow-wrap: anywhere;
}
</style>
