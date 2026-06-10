<script lang="ts">
import type { MobStore } from '$entities/mob';
import { formatBearingOr, formatNm, PLACEHOLDER } from '$shared/lib';
import { formatElapsed } from './mob-format';

interface Props {
  mob: MobStore;
  // Set the Signal K course destination to the mark, the deliberate second tap (never automatic,
  // since a coupled autopilot may follow the course).
  onSteer: () => void;
  // Clear the mark: recovery complete, or an accidental trigger.
  onCancel: () => void;
}

const { mob, onSteer, onCancel }: Props = $props();

// Recovery ranges are short, so meters until a nautical mile, then nautical miles.
const range = $derived.by(() => {
  const meters = mob.distanceMeters;
  if (meters == null) return { value: PLACEHOLDER, unit: 'm' };
  if (meters < 1852) return { value: Math.round(meters).toString(), unit: 'm' };
  return { value: formatNm(meters), unit: 'nm' };
});
</script>

{#if mob.active}
  <!-- No aria-live here: App owns the assertive MOB channel, mirroring the collision split. -->
  <aside class="bottom-strip bottom-strip--alarm" aria-label="Man overboard">
    <div class="head">
      <span class="title">Man overboard</span>
      {#if mob.acknowledged}
        <span class="note ack-tag">Acknowledged</span>
      {/if}
      <div class="actions">
        <button type="button" class="ack" disabled={!mob.position} onclick={onSteer}>
          Steer to MOB
        </button>
        {#if !mob.acknowledged}
          <button type="button" class="ack ack--warning" onclick={() => mob.acknowledge()}>
            Acknowledge
          </button>
        {/if}
        <button type="button" class="ack ack--warning" onclick={onCancel}>Cancel</button>
      </div>
    </div>
    <div class="row">
      <span class="metric">Bearing <b>{formatBearingOr(mob.bearingRad)}</b>&deg;T</span>
      <span class="metric">Range <b>{range.value}</b> {range.unit}</span>
      {#if mob.elapsedSeconds !== undefined}
        <span class="metric">Elapsed <b>{formatElapsed(mob.elapsedSeconds)}</b></span>
      {/if}
    </div>
  </aside>
{/if}

<style>
.actions {
  margin-inline-start: auto;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.actions .ack {
  margin-inline-start: 0;
}
.ack-tag {
  font-weight: 600;
  white-space: nowrap;
}
</style>
