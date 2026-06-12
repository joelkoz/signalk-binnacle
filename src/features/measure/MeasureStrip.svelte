<script lang="ts">
import type { MeasureStore } from '$entities/measure';
import { formatBearingOr, formatMetersOrNm } from '$shared/lib';

interface Props {
  measure: MeasureStore;
}

const { measure }: Props = $props();
</script>

<!-- The shared dialog action owns Escape while a panel is open and calls preventDefault when it
     closes one, so a defaultPrevented Escape was aimed at the topmost slide-over, not at the
     measurement. Ignoring it keeps one Escape from both closing a panel and ending the line. -->
<svelte:window
  onkeydown={(e) => {
    if (measure.active && e.key === 'Escape' && !e.defaultPrevented) measure.stop();
  }}
/>

{#if measure.active}
  <aside class="bottom-strip bottom-strip--accent" aria-label="Measure">
    <div class="head">
      <span class="title">Measure</span>
      {#if measure.points.length === 0}
        <span class="note">Tap the chart to set points</span>
      {/if}
      <div class="actions">
        <button
          type="button"
          class="ack"
          disabled={measure.points.length === 0}
          onclick={() => measure.undo()}
        >
          Undo
        </button>
        <button
          type="button"
          class="ack"
          disabled={measure.points.length === 0}
          onclick={() => measure.clear()}
        >
          Clear
        </button>
        <button type="button" class="ack" onclick={() => measure.stop()}>Done</button>
      </div>
    </div>
    {#if measure.lastLeg}
      <div class="row">
        <span class="metric"> Leg <b>{formatMetersOrNm(measure.lastLeg.distanceMeters)}</b> </span>
        <span class="metric"
          >Bearing <b>{formatBearingOr(measure.lastLeg.bearingRad)}</b>&deg;T</span
        >
        {#if measure.legs.length > 1}
          <span class="metric">Total <b>{formatMetersOrNm(measure.totalMeters)}</b></span>
        {/if}
      </div>
    {/if}
  </aside>
{/if}
