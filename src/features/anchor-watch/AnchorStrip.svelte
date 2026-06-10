<script lang="ts">
import type { AnchorWatch } from '$entities/anchor';
import { formatFixed } from '$shared/lib';

interface Props {
  anchor: AnchorWatch;
  onRaise: () => void;
}

const { anchor, onRaise }: Props = $props();
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
          <button type="button" class="ack ack--warning" onclick={onRaise}>Raise anchor</button>
        </div>
      {/if}
    </div>
    <div class="row">
      <span class="metric">Off anchor <b>{formatFixed(anchor.distanceMeters, 0)}</b> m</span>
      <span class="metric">Radius <b>{formatFixed(anchor.radiusMeters, 0)}</b> m</span>
    </div>
  </aside>
{/if}

<style>
.actions {
  margin-inline-start: auto;
  display: flex;
  gap: var(--space-4);
}
.actions .ack {
  margin-inline-start: 0;
}
/* Acknowledged: the alarm is silenced and the navigator has it in hand, so the strip dims but keeps
   the distance on screen while the server still reports the drag. */
.is-ack {
  opacity: 0.62;
}
.ack-tag {
  margin-inline-start: auto;
  font-weight: 600;
  white-space: nowrap;
}
</style>
