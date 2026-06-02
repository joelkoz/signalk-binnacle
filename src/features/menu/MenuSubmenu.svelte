<script lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/svelte';
import type { Component, Snippet } from 'svelte';

interface Props {
  label: string;
  icon?: Component;
  children: Snippet;
}

const { label, icon, children }: Props = $props();

// Submenus start collapsed; the menu is minimal until you drill into a section.
let expanded = $state(false);

// Tie the trigger to its content region for assistive tech.
const contentId = $derived(`submenu-${label.toLowerCase().replace(/\s+/g, '-')}`);
</script>

<div class="submenu">
  <button
    type="button"
    class="submenu-trigger"
    aria-expanded={expanded}
    aria-controls={contentId}
    onclick={() => (expanded = !expanded)}
  >
    {#if icon}
      {@const Icon = icon}
      <Icon size={16} aria-hidden="true" />
    {/if}
    <span class="submenu-label">{label}</span>
    {#if expanded}
      <ChevronDown size={16} aria-hidden="true" />
    {:else}
      <ChevronRight size={16} aria-hidden="true" />
    {/if}
  </button>
  {#if expanded}
    <div class="submenu-content" id={contentId}>{@render children()}</div>
  {/if}
</div>

<style>
.submenu {
  display: block;
}
.submenu-trigger {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  inline-size: 100%;
  padding-block: 0.55rem;
  padding-inline: 0.6rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: var(--text-base);
  text-align: start;
  cursor: pointer;
}
.submenu-trigger:hover {
  background: var(--surface);
}
.submenu-trigger[aria-expanded="true"] {
  color: var(--accent);
  font-weight: 600;
}
.submenu-label {
  flex: 1;
}
.submenu-content {
  margin-block: 0.1rem 0.3rem;
  margin-inline-start: 0.85rem;
  padding-inline-start: 0.6rem;
  border-inline-start: 1px solid var(--border);
}
</style>
