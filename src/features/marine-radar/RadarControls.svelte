<script lang="ts">
import { Radar } from '@lucide/svelte';
import type { MarineRadarStore } from './marine-radar-store.svelte';
import { widgetKind } from './radar-controls-model';

let {
  store,
  onSetControl,
  onSelectRadar,
}: {
  store: MarineRadarStore;
  onSetControl: (controlId: string, value: number) => void;
  onSelectRadar?: (id: string) => void;
} = $props();

const controls = $derived(store.capabilities);

const statusLabel = $derived.by(() => {
  switch (store.status) {
    case 'connecting':
      return 'Connecting to the radar';
    case 'live':
      return 'Live';
    case 'error':
      return 'No signal from the radar';
    default:
      return '';
  }
});
</script>

<div class="radar-controls">
  {#if statusLabel}
    <p class="radar-head">
      <Radar size={18} aria-hidden="true" />
      <span
        class="caps-label radar-status"
        class:is-error={store.status === 'error'}
        role="status"
        aria-live="polite"
      >
        {statusLabel}
      </span>
    </p>
  {/if}
  {#if store.radars.length === 0}
    <p class="muted-note">No radar connected.</p>
  {/if}
  {#if store.controlsForbidden}
    <p class="alert-note sev-warning" role="status">
      Adjusting radar controls needs read-write access. Approve Binnacle for read and write in the
      Signal K server's access requests, then reconnect.
    </p>
  {/if}
  {#if store.radars.length > 1}
    <label class="caps-label" for="radar-select">Radar</label>
    <select
      id="radar-select"
      class="input"
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
          min={def.range?.min ?? 0}
          max={def.range?.max ?? 100}
          step={def.range?.step ?? 1}
          disabled={def.readOnly}
          value={store.controlValues[def.id] ?? def.range?.min ?? 0}
          aria-label={`${def.name}${def.range?.unit ? ` (${def.range.unit})` : ''}`}
          oninput={(e) => onSetControl(def.id, Number(e.currentTarget.value))}
        >
        <span class="num">{store.controlValues[def.id] ?? '-'}</span>
      {:else if kind === 'toggle'}
        <button
          type="button"
          class="btn"
          aria-label={def.name}
          aria-pressed={Boolean(store.controlValues[def.id])}
          disabled={def.readOnly}
          onclick={() => onSetControl(def.id, store.controlValues[def.id] ? 0 : 1)}
        >
          {store.controlValues[def.id] ? 'On' : 'Off'}
        </button>
      {:else}
        <select
          class="input"
          aria-label={def.name}
          disabled={def.readOnly}
          value={String(store.controlValues[def.id] ?? '')}
          onchange={(e) => onSetControl(def.id, Number(e.currentTarget.value))}
        >
          {#each def.values ?? [] as opt (opt.value)}
            <option value={String(opt.value)}>{opt.label}</option>
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
  gap: var(--space-3);
}
.radar-control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
/* The radar's identity row: the sweep glyph in the accent color paired with the live status. The
   glyph stays branded; the status text carries the muted or alarm state. */
.radar-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
}
.radar-head :global(svg) {
  flex-shrink: 0;
  color: var(--accent);
}
.radar-status {
  color: var(--text-muted);
}
.radar-status.is-error {
  color: var(--alarm);
}
</style>
