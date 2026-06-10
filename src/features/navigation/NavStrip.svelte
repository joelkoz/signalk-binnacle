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
import type { RouteProgress } from './route-progress';

interface Props {
  guidance: CourseGuidance;
  // Whole-route distance and time to go across the legs still ahead, shown as a passage arrival
  // readout when a multi-leg route is active. Undefined for a single leg, where the per-leg numbers
  // already say it.
  routeProgress?: RouteProgress;
  onStop: () => void;
  // Skip the active waypoint forward (1) or back (-1) along the route.
  onSkip?: (delta: number) => void;
}

const { guidance, routeProgress, onStop, onSkip }: Props = $props();

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
// Skip is only possible within the route's extent: no previous at the first point, no next at the
// last. The control reflects what the route allows, so a tap at an end is disabled rather than firing
// a best-effort request the server will reject.
const canSkipBack = $derived(guidance.activePointIndex != null && guidance.activePointIndex > 0);
const canSkipForward = $derived(!guidance.isLastPoint);

const vmg = $derived(formatKnotsOr(guidance.velocityMadeGoodMps));
const ttg = $derived(
  guidance.timeToGoSeconds != null ? formatDuration(guidance.timeToGoSeconds) : PLACEHOLDER,
);
// Whole-route distance still to run, and the arrival clock time (now plus the route time-to-go),
// recomputed each render so the clock stays current as the strip ticks.
const routeDtg = $derived(
  routeProgress ? formatNmOr(routeProgress.distanceToGoMeters) : PLACEHOLDER,
);
const eta = $derived.by(() => {
  if (!routeProgress) return PLACEHOLDER;
  // Prefer the server's estimatedTimeOfArrival (an ISO-8601 instant) when a provider supplies it,
  // since it reflects the server's own time model. Guard against an unparseable string and fall
  // back to a local clock estimate (now plus the route time-to-go) when the server value is absent.
  const iso = guidance.estimatedTimeOfArrivalIso;
  if (iso) {
    const at = new Date(iso);
    if (!Number.isNaN(at.getTime())) {
      return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }
  const ttgSeconds = routeProgress.timeToGoSeconds;
  if (ttgSeconds == null) return PLACEHOLDER;
  return new Date(Date.now() + ttgSeconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
});
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
        <div class="skip-group">
          <button
            type="button"
            class="skip"
            aria-label="Previous waypoint"
            title="Previous waypoint"
            disabled={!canSkipBack}
            onclick={() => onSkip(-1)}
          >
            <SkipBack size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            class="skip"
            aria-label="Next waypoint"
            title="Next waypoint"
            disabled={!canSkipForward}
            onclick={() => onSkip(1)}
          >
            <SkipForward size={15} aria-hidden="true" />
          </button>
        </div>
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
      {#if routeProgress}
        <span class="metric">RTE <b>{routeDtg}</b> nm</span>
        <span class="metric">ETA <b>{eta}</b></span>
      {/if}
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
/* The waypoint-skip pair keeps a guaranteed gutter before the Stop control, so the destructive Stop
   does not sit flush against the skip buttons where a mis-tap on a rolling deck could end navigation
   while reaching for "next waypoint". */
.skip-group {
  display: inline-flex;
  flex-shrink: 0;
  gap: var(--space-1);
  margin-inline-end: var(--space-3);
}
/* Waypoint-skip buttons in the strip head. A full 44px touch target so they are usable underway, with
   the compact icon centered. */
.skip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-block-size: var(--control-size);
  min-inline-size: var(--control-size);
  padding: 0.2rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}
.skip:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent-tint);
}
.skip:disabled {
  color: var(--text-muted);
  opacity: 0.4;
  cursor: default;
}
</style>
