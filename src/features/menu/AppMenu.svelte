<script lang="ts">
import { Menu } from '@lucide/svelte';
import type { MenuItem } from './menu-item';

interface Props {
  items?: MenuItem[];
  label?: string;
}

const { items = [], label = 'Menu' }: Props = $props();

let menuOpen = $state(false);
let root = $state<HTMLElement>();
let trigger = $state<HTMLButtonElement>();
let popout = $state<HTMLElement>();

// On open, move focus to the first enabled item so a keyboard user lands inside the menu rather
// than having to tab into it. focus-visible keeps this ring-free for pointer and touch opens.
$effect(() => {
  if (menuOpen) popout?.querySelector<HTMLButtonElement>('.item:not(:disabled)')?.focus();
});

function closeMenu(restoreFocus = false): void {
  menuOpen = false;
  // Return focus to the trigger when the menu closes by keyboard or selection, so a keyboard user
  // lands back on the control that opened it rather than at the top of the document.
  if (restoreFocus) trigger?.focus();
}

function select(item: MenuItem): void {
  if (item.disabled) return;
  item.onSelect();
  closeMenu(true);
}

// Close when a pointer goes down outside the menu (focus follows the pointer), or on Escape (focus
// returns to the trigger).
function onWindowPointerDown(event: PointerEvent): void {
  if (menuOpen && root && !root.contains(event.target as Node)) closeMenu();
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (menuOpen && event.key === 'Escape') closeMenu(true);
}

// An item starts a new group when it carries a group label and the item above it does not share it,
// so a caps-label header renders before it. The menu groups itself from the data this way.
function startsGroup(index: number): boolean {
  const group = items[index]?.group;
  return group !== undefined && (index === 0 || items[index - 1]?.group !== group);
}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

<div class="app-menu" bind:this={root}>
  <button
    type="button"
    class="icon-pill trigger"
    bind:this={trigger}
    aria-haspopup="true"
    aria-expanded={menuOpen}
    aria-controls="app-menu-popout"
    aria-label={label}
    title={label}
    onclick={() => (menuOpen = !menuOpen)}
  >
    <Menu size={20} aria-hidden="true" />
  </button>
  {#if menuOpen}
    <div class="popout" id="app-menu-popout" bind:this={popout}>
      {#if items.length === 0}
        <span class="empty">No options</span>
      {:else}
        {#each items as item, i (item.id)}
          {#if startsGroup(i)}
            <div class="group-label caps-label">{item.group}</div>
          {/if}
          <button
            type="button"
            class="item"
            disabled={item.disabled}
            aria-pressed={item.pressed}
            onclick={() => select(item)}
          >
            {#if item.icon}
              {@const Icon = item.icon}
              <Icon size={18} aria-hidden="true" />
            {/if}
            <span>{item.label}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
.app-menu {
  position: relative;
  display: inline-flex;
}
/* The base look is the shared .icon-pill; keep the open state lit without hover, matching its
   hover treatment, so the trigger reads as active while the menu is open. */
.trigger[aria-expanded="true"] {
  border-color: var(--accent);
  background: var(--accent-tint);
}
.popout {
  position: absolute;
  inset-block-start: calc(100% + var(--space-2));
  inset-inline-start: 0;
  z-index: var(--z-menu);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  inline-size: 20rem;
  max-inline-size: calc(100vw - var(--space-4));
  max-block-size: calc(100dvh - 4rem);
  overflow-y: auto;
  padding: var(--space-2);
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
}
.group-label {
  margin-block-start: var(--space-1);
  padding-inline: var(--space-2);
}
.group-label:first-child {
  margin-block-start: 0;
}
.item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  inline-size: 100%;
  min-block-size: var(--control-size);
  padding-block: var(--space-2);
  padding-inline: var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: var(--text-base);
  text-align: start;
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}
.item :global(svg) {
  flex-shrink: 0;
}
.item:hover:not(:disabled) {
  background: var(--accent-tint);
}
.item:active:not(:disabled) {
  filter: brightness(0.94);
}
.item[aria-pressed="true"] {
  color: var(--accent);
  background: var(--accent-tint);
}
.item:disabled {
  color: var(--text-muted);
  opacity: var(--disabled-opacity);
  cursor: default;
}
.empty {
  display: block;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-base);
  color: var(--text-muted);
}
</style>
