<script lang="ts">
import type { CourseGuidance } from '$entities/course';
import {
  formatFixed,
  formatKnots,
  formatNm,
  formatTcpaMin,
  PLACEHOLDER,
  radiansToBearing,
} from '$shared/lib';
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
const btw = $derived(formatFixed(radiansToBearing(guidance.bearingToNextRad), 0));
const xte = $derived(
  guidance.crossTrackErrorMeters != null
    ? formatNm(Math.abs(guidance.crossTrackErrorMeters))
    : PLACEHOLDER,
);
const vmg = $derived(
  guidance.velocityMadeGoodMps != null ? formatKnots(guidance.velocityMadeGoodMps) : PLACEHOLDER,
);
const ttg = $derived(
  guidance.timeToGoSeconds != null ? formatTcpaMin(guidance.timeToGoSeconds, 0) : PLACEHOLDER,
);
</script>

{#if guidance.active}
  <aside class="bottom-strip bottom-strip--accent" aria-label="Active route" aria-live="polite">
    <div class="head">
      <span class="title">To</span>
      <span class="name">{guidance.nextPointName ?? '--'}</span>
      {#if guidance.source === 'computed'}
        <span class="note">computing locally</span>
      {/if}
      <button type="button" class="ack" onclick={onStop}>Stop</button>
    </div>
    <div class="row">
      <span class="metric">DTW <b>{dtw}</b> nm</span>
      <span class="metric">BTW <b>{btw}</b>&deg;</span>
      <span class="metric">
        XTE
        {#if steer}
          <span class="steer">{steer}</span>
        {/if}
        <b>{xte}</b>
        nm
      </span>
      <span class="metric">VMG <b>{vmg}</b> kn</span>
      <span class="metric">TTG <b>{ttg}</b> min</span>
    </div>
  </aside>
{/if}

<style>
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-base);
  font-weight: 600;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  font-size: var(--text-base);
}
.steer {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
}
</style>
