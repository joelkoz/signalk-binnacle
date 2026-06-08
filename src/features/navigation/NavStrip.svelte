<script lang="ts">
import type { CourseGuidance } from '$entities/course';
import { formatBearingOr, formatDuration, formatKnots, formatNm, PLACEHOLDER } from '$shared/lib';
import { steerSide } from '$shared/nav';

interface Props {
  guidance: CourseGuidance;
  onStop: () => void;
}

const { guidance, onStop }: Props = $props();

// The side to steer toward to return to the track, as a port (L) or starboard (R) marker. The
// cross-track sign convention lives in steerSide; absent or zero error yields no marker.
const steer = $derived.by<'L' | 'R' | null>(() => {
  const side = steerSide(guidance.crossTrackErrorMeters ?? Number.NaN);
  if (side === null) return null;
  return side === 'port' ? 'L' : 'R';
});

// Each readout shows the placeholder when its value is absent, never a misleading zero.
const dtw = $derived(
  guidance.distanceToNextMeters != null ? formatNm(guidance.distanceToNextMeters) : PLACEHOLDER,
);
const btw = $derived(formatBearingOr(guidance.bearingToNextRad));
const xte = $derived(
  guidance.crossTrackErrorMeters != null
    ? formatNm(Math.abs(guidance.crossTrackErrorMeters))
    : PLACEHOLDER,
);
const vmg = $derived(
  guidance.velocityMadeGoodMps != null ? formatKnots(guidance.velocityMadeGoodMps) : PLACEHOLDER,
);
const ttg = $derived(
  guidance.timeToGoSeconds != null ? formatDuration(guidance.timeToGoSeconds) : PLACEHOLDER,
);
</script>

{#if guidance.active}
  <!-- No aria-live on the strip itself: the metrics tick about once a second, and a live region here
       would re-read the whole readout line every tick. Only the destination name is a live region, so
       a screen reader hears the leg change when a waypoint advances, not the numbers churning. -->
  <aside class="bottom-strip bottom-strip--accent" aria-label="Active route">
    <div class="head">
      <span class="title">To</span>
      <span class="name" aria-live="polite">{guidance.nextPointName ?? '--'}</span>
      {#if guidance.source === 'computed'}
        <span class="note">computing locally</span>
      {/if}
      <button type="button" class="ack" onclick={onStop}>Stop</button>
    </div>
    <div class="row">
      <span class="metric">DTW <b>{dtw}</b> nm</span>
      <span class="metric">BTW <b>{btw}</b>&deg;T</span>
      <span class="metric">
        XTE
        {#if steer}
          <span class="steer">{steer}</span>
        {/if}
        <b>{xte}</b>
        nm
      </span>
      <span class="metric">VMG <b>{vmg}</b> kn</span>
      <span class="metric">TTG <b>{ttg}</b></span>
    </div>
  </aside>
{/if}

<style>
/* The destination name takes the row's flexible space and ellipsizes (via the shared .bottom-strip
   .name), so it is what shrinks, while the "computing locally" note keeps its width. */
.name {
  flex: 1;
  min-inline-size: 0;
  font-size: var(--text-base);
  font-weight: 600;
}
.note {
  flex-shrink: 0;
  white-space: nowrap;
}
.steer {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
}
</style>
