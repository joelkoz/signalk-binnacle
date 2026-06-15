<script lang="ts">
import { X } from '@lucide/svelte';
import type { PlotterExtHost } from '$entities/plotter-ext';

interface Props {
  host: PlotterExtHost;
}

const { host }: Props = $props();

const chips = $derived(host.filters.chips);
</script>

{#if chips.length > 0}
  <div class="pe-chips">
    {#each chips as chip (chip.key)}
      <span class="pe-chip">
        <span class="pe-chip-label">{chip.label ?? `${chip.type} filter`}</span>
        <button
          type="button"
          class="icon-btn"
          title="Clear filter"
          aria-label={`Clear ${chip.label ?? chip.type} filter`}
          onclick={() => host.filters.clearFilter(chip.extensionId, chip.type)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </span>
    {/each}
  </div>
{/if}

<style>
.pe-chips {
  position: absolute;
  inset-block-start: var(--space-3);
  inset-inline-start: 50%;
  transform: translateX(-50%);
  z-index: var(--z-overlay);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  pointer-events: auto;
}
.pe-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding-inline-start: var(--space-3);
  border-radius: var(--radius-pill, 999px);
  background: var(--surface-raised);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  font-size: var(--text-sm);
}
</style>
