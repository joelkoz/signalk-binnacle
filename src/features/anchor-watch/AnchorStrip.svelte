<script lang="ts">
import { onDestroy } from 'svelte';
import type { AnchorWatch } from '$entities/anchor';
import type { UnitsStore } from '$entities/units';
import { formatLengthOr, lengthUnit } from '$shared/lib';
import { ConfirmArm } from '$shared/ui';

interface Props {
  anchor: AnchorWatch;
  units: UnitsStore;
  onRaise: () => void;
}

const { anchor, units, onRaise }: Props = $props();

// Raise ends the watch and silences the alarm in one motion, so it arms a confirm step instead
// of firing on a single tap; the arm times out back to plain Raise on its own.
const raiseArm = new ConfirmArm();
onDestroy(() => raiseArm.disarm());

function tapRaise(): void {
  if (raiseArm.tap()) onRaise();
}
</script>

{#if anchor.dragging}
  <!-- No aria-live here: App owns the assertive anchor channel (a concise spoken summary in a
       persistent role=alert region), mirroring the collision strip's split. -->
  <aside
    class="bottom-strip bottom-strip--alarm"
    class:is-ack={anchor.acknowledged}
    aria-label="Anchor alarm"
  >
    <div class="head">
      <span class="title">Anchor dragging</span>
      {#if anchor.acknowledged}
        <span class="note ack-tag">Acknowledged</span>
      {:else}
        <div class="actions">
          <button type="button" class="ack" onclick={() => anchor.acknowledge()}>
            Acknowledge
          </button>
          <button type="button" class="ack ack--warning" onclick={tapRaise}>
            {raiseArm.armed ? 'Confirm raise?' : 'Raise anchor'}
          </button>
        </div>
      {/if}
    </div>
    <div class="row">
      <span class="metric">
        Off anchor <b>{formatLengthOr(anchor.distanceMeters, units.mode, 0)}</b>
        {lengthUnit(units.mode)}
      </span>
      <span class="metric">
        Radius <b>{formatLengthOr(anchor.radiusMeters, units.mode, 0)}</b>
        {lengthUnit(units.mode)}
      </span>
    </div>
  </aside>
{/if}

<style>
/* A wide gutter between Acknowledge and Raise (over the shared .actions gap), so the two safety
   buttons do not read as twins. */
.bottom-strip .actions {
  gap: var(--space-4);
}
</style>
