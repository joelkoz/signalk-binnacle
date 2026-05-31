<script lang="ts">
import type { LayersView } from './layers-view.svelte';

interface Props {
  view: LayersView;
}

const { view }: Props = $props();
</script>

<aside class="layers-panel" aria-label="Layers">
  <h2 class="heading">Layers</h2>
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
  background: rgba(6, 9, 13, 0.85);
  border: 1px solid #243140;
  border-radius: 0.5rem;
  color: #e7edf3;
  font-family: system-ui, sans-serif;
}
.heading {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6f8aa3;
}
.empty {
  margin: 0;
  font-size: 0.8rem;
  color: #6f8aa3;
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
