<script lang="ts">
import { Layers } from '@lucide/svelte';
import type { LayersView } from './layers-view.svelte';

interface Props {
  view: LayersView;
}

const { view }: Props = $props();
</script>

<aside class="layers-panel" aria-label="Layers">
  <h2 class="heading"><Layers size={14} aria-hidden="true" /> Layers</h2>
  {#if view.items.length === 0}
    <p class="empty">No charts configured</p>
  {/if}
  <ul class="list">
    {#each view.items as item (item.id)}
      <li class="row">
        <label class="toggle">
          <input
            type="checkbox"
            checked={item.visible}
            onchange={(e) => view.toggle(item.id, e.currentTarget.checked)}
          >
          <span class="title">{item.title}</span>
        </label>
        {#if item.supportsOpacity}
          <input
            class="opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={item.opacity}
            aria-label={`${item.title} opacity`}
            oninput={(e) => view.setOpacity(item.id, Number(e.currentTarget.value))}
          >
        {/if}
      </li>
    {/each}
  </ul>
</aside>

<style>
.layers-panel {
  position: absolute;
  inset-block-start: 0.75rem;
  inset-inline-start: 0.75rem;
  inline-size: 14rem;
  padding: 0.75rem;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  color: var(--text);
  font-family: var(--font-ui);
}
.heading {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.empty {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.row {
  display: flex;
  flex-direction: column;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.opacity {
  inline-size: 100%;
  margin-block-start: 0.25rem;
}
</style>
