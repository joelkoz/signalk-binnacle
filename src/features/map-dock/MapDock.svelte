<script lang="ts">
import { LocateFixed, Navigation } from '@lucide/svelte';

interface Props {
  following: boolean;
  onCenter: () => void;
  onToggleFollow: () => void;
}

const { following, onCenter, onToggleFollow }: Props = $props();
</script>

<div class="map-dock">
  <button
    type="button"
    class="icon-pill"
    aria-label="Center on boat"
    title="Center on boat"
    onclick={onCenter}
  >
    <LocateFixed size={20} aria-hidden="true" />
  </button>
  <button
    type="button"
    class="icon-pill follow"
    aria-pressed={following}
    aria-label={following ? 'Stop following the boat' : 'Follow the boat'}
    title={following ? 'Stop following' : 'Follow boat'}
    onclick={onToggleFollow}
  >
    <Navigation size={20} aria-hidden="true" />
  </button>
</div>

<style>
.map-dock {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
/* Follow is a mode toggle: when on, it fills with the accent so its engaged state reads at a glance
   without opening anything, which is the whole point of lifting it onto the chart. */
.follow[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}
</style>
