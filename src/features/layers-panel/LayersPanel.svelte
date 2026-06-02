<script lang="ts">
import type { LayersView } from './layers-view.svelte';

interface Props {
  view: LayersView;
}

const { view }: Props = $props();
</script>

<aside class="layers-panel" aria-label="Layers">
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
  inline-size: 100%;
  color: var(--text);
  font-family: var(--font-ui);
}
.empty {
  margin: 0;
  font-size: var(--text-sm);
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
  min-block-size: var(--control-size);
  font-size: var(--text-base);
  cursor: pointer;
}
.toggle input[type="checkbox"] {
  inline-size: 1.25rem;
  block-size: 1.25rem;
}
.opacity {
  inline-size: 100%;
  min-block-size: var(--control-size);
  margin-block-start: 0.25rem;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
}
.opacity::-webkit-slider-runnable-track {
  block-size: 6px;
  border-radius: var(--radius-pill);
  background: var(--border);
}
.opacity::-moz-range-track {
  block-size: 6px;
  border-radius: var(--radius-pill);
  background: var(--border);
}
.opacity::-webkit-slider-thumb {
  -webkit-appearance: none;
  inline-size: 24px;
  block-size: 24px;
  margin-block-start: -9px;
  border-radius: var(--radius-pill);
  border: none;
  background: var(--accent);
}
.opacity::-moz-range-thumb {
  inline-size: 24px;
  block-size: 24px;
  border-radius: var(--radius-pill);
  border: none;
  background: var(--accent);
}
</style>
