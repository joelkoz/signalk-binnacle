<script lang="ts">
import { Menu } from '@lucide/svelte';
import type { MenuItem } from './menu-item';

interface Props {
  items: MenuItem[];
  label?: string;
}

const { items, label = 'Menu' }: Props = $props();

let menuOpen = $state(false);
let root = $state<HTMLElement>();

function closeMenu(): void {
  menuOpen = false;
}

function select(item: MenuItem): void {
  if (item.disabled) return;
  item.onSelect();
  closeMenu();
}

// Close when a pointer goes down outside the menu, or on Escape.
function onWindowPointerDown(event: PointerEvent): void {
  if (menuOpen && root && !root.contains(event.target as Node)) closeMenu();
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (menuOpen && event.key === 'Escape') closeMenu();
}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

<div class="app-menu" bind:this={root}>
  <button
    type="button"
    class="trigger"
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    aria-label={label}
    title={label}
    onclick={() => (menuOpen = !menuOpen)}
  >
    <Menu size={18} aria-hidden="true" />
  </button>
  {#if menuOpen}
    <ul class="popout" role="menu">
      {#each items as item (item.id)}
        <li role="none">
          <button
            type="button"
            role="menuitem"
            class="item"
            disabled={item.disabled}
            onclick={() => select(item)}
          >
            {#if item.icon}
              {@const Icon = item.icon}
              <Icon size={16} aria-hidden="true" />
            {/if}
            <span>{item.label}</span>
          </button>
        </li>
      {/each}
      {#if items.length === 0}
        <li role="none"><span class="empty">No options</span></li>
      {/if}
    </ul>
  {/if}
</div>

<style>
.app-menu {
  position: relative;
  display: inline-flex;
}
.trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 2rem;
  block-size: 2rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--accent);
  cursor: pointer;
}
.trigger:hover {
  border-color: var(--accent);
}
.popout {
  position: absolute;
  inset-block-start: calc(100% + 0.4rem);
  inset-inline-start: 0;
  z-index: 5;
  min-inline-size: 12rem;
  margin: 0;
  padding: 0.3rem;
  list-style: none;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
}
.item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  inline-size: 100%;
  padding: 0.45rem 0.6rem;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  text-align: start;
  cursor: pointer;
}
.item:hover:not(:disabled) {
  background: var(--surface);
}
.item:disabled {
  color: var(--text-muted);
  cursor: default;
}
.empty {
  display: block;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
