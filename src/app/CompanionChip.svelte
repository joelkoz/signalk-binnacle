<script lang="ts">
import type { CompanionState } from '$features/prewarm';
import { formatBytes } from '$shared/lib';

let {
  present,
  state,
  cacheBytes,
}: {
  present: boolean;
  state: CompanionState;
  cacheBytes: number | null;
} = $props();

// The offline-charts chip is a passive presenter: distinct visible text per state so the meaning never
// rides on the dot color alone (WCAG 1.4.1), and a richer accessible name in the hover title. The byte
// figure renders in muted chrome, not a hero readout tier, so it sits quietly beside the brand.
const bytes = $derived(formatBytes(cacheBytes ?? 0));
const text = $derived.by(() => {
  if (state === 'serving') return `Offline charts ${bytes.value} ${bytes.unit}`;
  if (state === 'needs-auth') return 'Offline charts: sign in';
  return 'Offline charts: no reply';
});
const title = $derived.by(() => {
  if (state === 'serving') return `Chart Locker: cache ${bytes.value} ${bytes.unit}`;
  if (state === 'needs-auth') return 'Chart Locker: detected, sign in to see cache size';
  return 'Chart Locker: not responding';
});
</script>

{#if present}
  <span class="companion-chip" class:companion-chip--down={state === 'down'} {title}>
    <span class="status-dot" aria-hidden="true"></span>
    {text}
  </span>
{/if}

<style>
/* The offline-charts chip is quiet chrome beside the brand: it confirms the Chart Locker companion is
   present without competing with the "Binnacle Chartplotter" title. Its dot (the global .status-dot)
   warns only when the companion is not responding; the serving and needs-sign-in states carry the
   healthy token, since the state is distinguished by the visible text, not a third dot hue. Single line
   so the cache figure never wraps under the brand. */
.companion-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-sm);
  white-space: nowrap;
}
.companion-chip--down {
  --dot-color: var(--warning);
}
/* On a phone the topbar is tighter than the old strip, so the chip yields like the version badge does,
   leaving room for the brand, the MOB button, and the action pills. The down state still reaches the
   operator through the LiveRegions announce. */
@media (max-width: 600px) {
  .companion-chip {
    display: none;
  }
}
</style>
