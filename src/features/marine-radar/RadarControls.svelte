<script lang="ts">
import type { MarineRadarStore } from './marine-radar-store.svelte';
import { widgetKind } from './radar-controls-model';

let {
  store,
  onSetControl,
  onSelectRadar,
}: {
  store: MarineRadarStore;
  onSetControl: (controlId: string, value: number, units?: string) => void;
  onSelectRadar?: (id: string) => void;
} = $props();

const controls = $derived(store.selected?.controls ?? []);

const statusLabel = $derived.by(() => {
  switch (store.status) {
    case 'connecting':
      return 'Connecting to the radar';
    case 'live':
      return 'Live';
    case 'standby':
      return 'Standby';
    case 'error':
      return 'No signal from the radar';
    default:
      return '';
  }
});
</script>

<div class="radar-controls">
  {#if statusLabel}
    <p class="caps-label radar-status" class:is-error={store.status === 'error'}>{statusLabel}</p>
  {/if}
  {#if store.radars.length > 1}
    <label class="caps-label" for="radar-select">Radar</label>
    <select
      id="radar-select"
      class="segmented"
      value={store.selectedId}
      onchange={(e) => onSelectRadar?.(e.currentTarget.value)}
    >
      {#each store.radars as r (r.id)}
        <option value={r.id}>{r.name}</option>
      {/each}
    </select>
  {/if}

  {#each controls as def (def.id)}
    {@const kind = widgetKind(def)}
    <div class="radar-control">
      <span class="caps-label">{def.name}</span>
      {#if kind === 'slider'}
        <input
          type="range"
          class="range"
          min={def.minValue ?? 0}
          max={def.maxValue ?? 100}
          step={def.stepValue ?? 1}
          disabled={def.isReadOnly}
          value={store.controlValues[def.id] ?? def.minValue ?? 0}
          aria-label={`${def.name}${def.units ? ` (${def.units})` : ''}`}
          oninput={(e) => onSetControl(def.id, Number(e.currentTarget.value), def.units)}
        >
        <span class="num">{store.controlValues[def.id] ?? '-'}</span>
      {:else if kind === 'toggle'}
        <button
          type="button"
          class="btn"
          disabled={def.isReadOnly}
          onclick={() => onSetControl(def.id, store.controlValues[def.id] ? 0 : 1)}
        >
          {store.controlValues[def.id] ? 'On' : 'Off'}
        </button>
      {:else if kind === 'button'}
        <button
          type="button"
          class="btn"
          disabled={def.isReadOnly}
          onclick={() => onSetControl(def.id, 1)}
        >
          {def.name}
        </button>
      {:else}
        <select
          class="segmented"
          aria-label={def.name}
          disabled={def.isReadOnly}
          value={String(store.controlValues[def.id] ?? '')}
          onchange={(e) => onSetControl(def.id, Number(e.currentTarget.value))}
        >
          {#each Object.entries(def.descriptions ?? {}) as [ optionValue, label ] (optionValue)}
            <option value={optionValue}>{label}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/each}
</div>

<style>
.radar-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.radar-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.radar-status {
  margin: 0;
  color: var(--text-muted);
}
.radar-status.is-error {
  color: var(--danger, #ff6b6b);
}
</style>
