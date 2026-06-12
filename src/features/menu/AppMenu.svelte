<script lang="ts">
import { Menu, X } from '@lucide/svelte';
import { scale } from 'svelte/transition';
import { prefersReducedMotion } from '$shared/lib';
import { focusTrap, registerDismiss } from '$shared/ui';
import type { MenuItem } from './menu-item';

interface Props {
  items?: MenuItem[];
  label?: string;
  // The open state is controlled by the parent, so a panel's "back to menu" action can reopen the
  // menu after it closed on selection. The menu renders the current state and requests transitions.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const { items = [], label = 'Menu', open, onOpenChange }: Props = $props();

let trigger = $state<HTMLButtonElement>();
let card = $state<HTMLElement>();

// The items split into contiguous groups by their group label, so each renders as a tile section
// with its caps-label header. The launcher stays generic: it renders whatever it is given.
const groups = $derived.by(() => {
  const out: { label: string; items: MenuItem[] }[] = [];
  for (const item of items) {
    const label = item.group ?? '';
    const last = out.at(-1);
    if (last && last.label === label) last.items.push(item);
    else out.push({ label, items: [item] });
  }
  return out;
});

function closeMenu(restoreFocus = false): void {
  onOpenChange(false);
  // Return focus to the trigger when the launcher closes by keyboard or selection, so a keyboard
  // user lands back on the control that opened it rather than at the top of the document.
  if (restoreFocus) trigger?.focus();
}

function select(item: MenuItem): void {
  if (item.disabled) return;
  item.onSelect();
  closeMenu(true);
}

// On open, move focus to the first enabled tile. A DOM query, not a reactive read, so a
// disabled-state change while open does not re-run this and re-steal focus.
$effect(() => {
  if (open) card?.querySelector<HTMLButtonElement>('.tile:not([disabled])')?.focus();
});

// While open, sit in the shared dismiss stack from dialog.ts rather than owning a window Escape
// listener: with the launcher open over a slide-over, the stack guarantees one Escape closes only
// the topmost (the launcher), marks the event consumed, and leaves the panel for the next Escape.
$effect(() => {
  if (!open) return;
  return registerDismiss(() => closeMenu(true));
});

// Arrow keys step through the tiles in reading order, wrapping; Home and End jump to the ends.
// Tab stays inside via the focus trap, since the launcher is modal over its scrim.
function onCardKeydown(event: KeyboardEvent): void {
  const tiles = [...(card?.querySelectorAll<HTMLButtonElement>('.tile:not([disabled])') ?? [])];
  if (tiles.length === 0) return;
  const at = Math.max(
    0,
    tiles.findIndex((tile) => tile === document.activeElement),
  );
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    tiles[(at + 1) % tiles.length]?.focus();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    tiles[(at - 1 + tiles.length) % tiles.length]?.focus();
  } else if (event.key === 'Home') {
    event.preventDefault();
    tiles[0]?.focus();
  } else if (event.key === 'End') {
    event.preventDefault();
    tiles.at(-1)?.focus();
  }
}
</script>

<button
  type="button"
  class="icon-pill"
  class:is-on={open}
  bind:this={trigger}
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-controls={open ? 'app-menu-launcher' : undefined}
  aria-label={label}
  title={label}
  onclick={() => onOpenChange(!open)}
>
  <Menu size={20} aria-hidden="true" />
</button>
{#if open}
  <!-- The scrim is pointer-only chrome (the click mirrors Escape); the dialog itself is the
       keyboard surface, so the scrim stays out of the accessibility tree. -->
  <div class="scrim" aria-hidden="true" onpointerdown={() => closeMenu()}></div>
  <div
    class="launcher"
    role="dialog"
    aria-modal="true"
    aria-label={label}
    id="app-menu-launcher"
    tabindex="-1"
    bind:this={card}
    use:focusTrap
    onkeydown={onCardKeydown}
    transition:scale={{ start: 0.96, duration: prefersReducedMotion() ? 0 : 140, opacity: 0.4 }}
  >
    <header class="launcher-head">
      <h2 class="panel-title">{label}</h2>
      <button
        type="button"
        class="panel-close"
        aria-label="Close menu"
        title="Close menu"
        onclick={() => closeMenu(true)}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </header>
    {#if items.length === 0}
      <span class="muted-note">No options</span>
    {:else}
      {#each groups as group, gi (gi)}
        <!-- Every menu item carries a group label, so role="group" always has an accessible name
             here; the static role is required by the linter's valid-role rule. -->
        <section class="group" role="group" aria-label={group.label || undefined}>
          {#if group.label}
            <div class="group-label caps-label" aria-hidden="true">{group.label}</div>
          {/if}
          <div class="tiles">
            {#each group.items as item (item.id)}
              <button
                type="button"
                class="tile"
                class:is-on={item.pressed === true}
                aria-pressed={item.pressed === undefined ? undefined : item.pressed}
                disabled={item.disabled}
                onclick={() => select(item)}
              >
                {#if item.icon}
                  {@const Icon = item.icon}
                  <Icon size={22} aria-hidden="true" />
                {/if}
                <span class="tile-label">{item.label}</span>
              </button>
            {/each}
          </div>
        </section>
      {/each}
    {/if}
  </div>
{/if}

<style>
.scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-menu);
  background: var(--scrim);
}
/* Centered on desktop; on a phone the card anchors to the lower half of the screen so the whole
   grid sits in the thumb zone for one-handed use at heel. */
.launcher {
  position: fixed;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  transform: translate(-50%, -50%);
  z-index: var(--z-menu);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  inline-size: min(30rem, calc(100vw - var(--space-4)));
  max-block-size: calc(100dvh - var(--space-6));
  overflow-y: auto;
  padding: var(--space-3);
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg), var(--edge-light);
}
@media (max-width: 600px) {
  .launcher {
    inset-block-start: auto;
    inset-block-end: 0;
    inset-inline-start: 0;
    transform: none;
    inline-size: 100vw;
    max-inline-size: none;
    max-block-size: 80dvh;
    border-inline: 0;
    border-block-end: 0;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
}
.launcher-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.group + .group {
  margin-block-start: var(--space-1);
  padding-block-start: var(--space-2);
  border-block-start: 1px solid var(--border);
}
.group-label {
  padding-inline: var(--space-1);
}
/* Tiles flow in rows, so group membership reads as geometry, not only as a header. minmax keeps
   every tile comfortably past the 44px target in both axes. */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.25rem, 1fr));
  gap: var(--space-1);
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-block-size: 4.5rem;
  padding: var(--space-2) var(--space-1);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}
.tile :global(svg) {
  color: var(--text-muted);
  transition: color var(--transition-fast);
}
.tile:hover:not(:disabled) {
  background: var(--accent-tint);
}
.tile:hover:not(:disabled) :global(svg),
.tile:focus-visible :global(svg) {
  color: var(--accent);
}
.tile:active:not(:disabled) {
  filter: brightness(0.94);
}
.tile.is-on {
  color: var(--accent);
  background: var(--accent-tint);
}
.tile.is-on :global(svg) {
  color: var(--accent);
}
.tile:disabled {
  color: var(--text-muted);
  opacity: var(--disabled-opacity);
  cursor: default;
}
.tile-label {
  text-align: center;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
</style>
