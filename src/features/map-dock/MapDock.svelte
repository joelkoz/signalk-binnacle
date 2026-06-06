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
    class="dock-btn"
    aria-label="Center on boat"
    title="Center on boat"
    onclick={onCenter}
  >
    <LocateFixed size={20} aria-hidden="true" />
  </button>
  <button
    type="button"
    class="dock-btn follow"
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
.dock-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--control-size);
  block-size: var(--control-size);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  color: var(--accent);
  cursor: pointer;
  box-shadow: var(--shadow-overlay);
  transition:
    border-color var(--transition-fast),
    background-color var(--transition-fast),
    color var(--transition-fast);
}
.dock-btn:hover {
  border-color: var(--accent);
  background: var(--accent-tint);
}
.dock-btn:active {
  filter: brightness(0.94);
}
/* Follow is a mode toggle: when on, it fills with the accent so its engaged state reads at a glance
   without opening anything, which is the whole point of lifting it onto the chart. */
.dock-btn.follow[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}
</style>
