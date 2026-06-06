<script lang="ts">
import { Menu } from '@lucide/svelte';
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

let root = $state<HTMLElement>();
let trigger = $state<HTMLButtonElement>();
let popout = $state<HTMLElement>();
// The id of the item that holds the roving tabindex 0 (the rest are -1), so Tab moves into and out
// of the menu as one stop while Arrow keys move between items, per the WAI-ARIA menu pattern.
let activeId = $state('');

// The items split into contiguous groups by their group label, so each renders inside a role=group
// with an accessible name and its caps-label header.
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

function itemButtons(): HTMLButtonElement[] {
  return [...(popout?.querySelectorAll<HTMLButtonElement>('.item:not([disabled])') ?? [])];
}
function focusItem(button: HTMLButtonElement | null | undefined): void {
  if (!button) return;
  activeId = button.dataset.id ?? '';
  button.focus();
}

// On open, give the roving focus to the first enabled item. The lookup is a DOM query, not a reactive
// read, so a disabled-state change while the menu is open (for example mapCommands resolving) does
// not re-run this and re-steal focus.
$effect(() => {
  if (open) focusItem(popout?.querySelector<HTMLButtonElement>('.item:not([disabled])'));
});

function closeMenu(restoreFocus = false): void {
  onOpenChange(false);
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
  if (open && root && !root.contains(event.target as Node)) closeMenu();
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (open && event.key === 'Escape') closeMenu(true);
}

// Arrow keys move the roving focus between enabled items, wrapping; Home and End jump to the ends.
function onPopoutKeydown(event: KeyboardEvent): void {
  const buttons = itemButtons();
  if (buttons.length === 0) return;
  const at = Math.max(
    0,
    buttons.findIndex((b) => b.dataset.id === activeId),
  );
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    focusItem(buttons[(at + 1) % buttons.length]);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    focusItem(buttons[(at - 1 + buttons.length) % buttons.length]);
  } else if (event.key === 'Home') {
    event.preventDefault();
    focusItem(buttons[0]);
  } else if (event.key === 'End') {
    event.preventDefault();
    focusItem(buttons.at(-1));
  }
}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

<div class="app-menu" bind:this={root}>
  <button
    type="button"
    class="icon-pill trigger"
    bind:this={trigger}
    aria-haspopup="true"
    aria-expanded={open}
    aria-controls={open ? 'app-menu-popout' : undefined}
    aria-label={label}
    title={label}
    onclick={() => onOpenChange(!open)}
  >
    <Menu size={20} aria-hidden="true" />
  </button>
  {#if open}
    <div
      class="popout"
      role="menu"
      tabindex="-1"
      aria-label={label}
      id="app-menu-popout"
      bind:this={popout}
      onkeydown={onPopoutKeydown}
    >
      {#if items.length === 0}
        <span class="empty">No options</span>
      {:else}
        {#each groups as group, gi (gi)}
          <div class="group" role="group" aria-label={group.label || undefined}>
            {#if group.label}
              <div class="group-label caps-label" aria-hidden="true">{group.label}</div>
            {/if}
            {#each group.items as item (item.id)}
              <!-- A plain action is a menuitem; a toggle (the mutes) is a menuitemcheckbox carrying
                   aria-checked. Split into two static roles so the role is never a dynamic value. -->
              {#if item.pressed === undefined}
                <button
                  type="button"
                  class="item"
                  role="menuitem"
                  data-id={item.id}
                  tabindex={item.id === activeId ? 0 : -1}
                  disabled={item.disabled}
                  onclick={() => select(item)}
                >
                  {#if item.icon}
                    {@const Icon = item.icon}
                    <Icon size={18} aria-hidden="true" />
                  {/if}
                  <span>{item.label}</span>
                </button>
              {:else}
                <button
                  type="button"
                  class="item"
                  role="menuitemcheckbox"
                  aria-checked={item.pressed}
                  data-id={item.id}
                  tabindex={item.id === activeId ? 0 : -1}
                  disabled={item.disabled}
                  onclick={() => select(item)}
                >
                  {#if item.icon}
                    {@const Icon = item.icon}
                    <Icon size={18} aria-hidden="true" />
                  {/if}
                  <span>{item.label}</span>
                </button>
              {/if}
            {/each}
          </div>
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
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.group-label {
  padding-inline: var(--space-2);
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
.item[aria-checked="true"] {
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
