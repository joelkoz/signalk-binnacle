<script lang="ts">
import { SkipBack, SkipForward } from '@lucide/svelte';
import type { CourseGuidance } from '$entities/course';
import {
  formatBearingOr,
  formatDuration,
  formatKnotsOr,
  formatNmOr,
  PLACEHOLDER,
} from '$shared/lib';
import { steerSide } from '$shared/nav';

interface Props {
  guidance: CourseGuidance;
  onStop: () => void;
  // Skip the active waypoint forward (1) or back (-1) along the route.
  onSkip?: (delta: number) => void;
}

const { guidance, onStop, onSkip }: Props = $props();

// The side to steer toward to return to the track, as a port (L) or starboard (R) marker. The
// cross-track sign convention lives in steerSide; absent or zero error yields no marker.
const steer = $derived.by<'L' | 'R' | null>(() => {
  const side = steerSide(guidance.crossTrackErrorMeters ?? Number.NaN);
  if (side === null) return null;
  return side === 'port' ? 'L' : 'R';
});

// Each readout shows the placeholder when its value is absent, never a misleading zero.
const dtw = $derived(formatNmOr(guidance.distanceToNextMeters));
const btw = $derived(formatBearingOr(guidance.bearingToNextRad));
const xte = $derived(
  formatNmOr(
    guidance.crossTrackErrorMeters == null ? undefined : Math.abs(guidance.crossTrackErrorMeters),
  ),
);
const vmg = $derived(formatKnotsOr(guidance.velocityMadeGoodMps));
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
      <span class="name" aria-live="polite">{guidance.nextPointName ?? PLACEHOLDER}</span>
      {#if guidance.source === 'computed'}
        <span class="note">computing locally</span>
      {/if}
      {#if onSkip}
        <button
          type="button"
          class="skip"
          aria-label="Previous waypoint"
          title="Previous waypoint"
          onclick={() => onSkip(-1)}
        >
          <SkipBack size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="skip"
          aria-label="Next waypoint"
          title="Next waypoint"
          onclick={() => onSkip(1)}
        >
          <SkipForward size={15} aria-hidden="true" />
        </button>
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
/* Compact waypoint-skip buttons in the strip head, sitting beside the Stop control. */
.skip {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0.2rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}
.skip:hover {
  border-color: var(--accent);
  background: var(--accent-tint);
}
</style>
