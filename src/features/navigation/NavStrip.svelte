<script lang="ts">
import type { CourseGuidance } from '$entities/course';
import { formatFixed, formatKnots, formatNm, formatTcpaMin, radiansToBearing } from '$shared/lib';

interface Props {
  guidance: CourseGuidance;
  onStop: () => void;
}

const { guidance, onStop }: Props = $props();

// The side to steer toward to return to the track. A positive cross-track error means the
// boat is to starboard of the track, so steer to port ('L'); a negative error means steer to
// starboard ('R'). Zero or absent yields no marker.
const steer = $derived.by<'L' | 'R' | null>(() => {
  const xte = guidance.crossTrackErrorMeters;
  if (xte == null || xte === 0) return null;
  return xte > 0 ? 'L' : 'R';
});
</script>

{#if guidance.active}
  <aside class="nav-strip" aria-label="Active route" aria-live="polite">
    <div class="head">
      <span class="title">To</span>
      <span class="name">{guidance.nextPointName ?? '--'}</span>
      {#if guidance.source === 'computed'}
        <span class="note">computing locally</span>
      {/if}
      <button type="button" class="ack" onclick={onStop}>Stop</button>
    </div>
    <div class="row">
      <span class="metric">DTW <b>{formatNm(guidance.distanceToNextMeters ?? 0)}</b> nm</span>
      <span class="metric"
        >BTW <b>{formatFixed(radiansToBearing(guidance.bearingToNextRad), 0)}</b>&deg;</span
      >
      <span class="metric">
        XTE
        {#if steer}
          <span class="steer">{steer}</span>
        {/if}
        <b>{formatNm(Math.abs(guidance.crossTrackErrorMeters ?? 0))}</b>
        nm
      </span>
      <span class="metric">VMG <b>{formatKnots(guidance.velocityMadeGoodMps)}</b> kn</span>
      <span class="metric">TTG <b>{formatTcpaMin(guidance.timeToGoSeconds ?? 0, 0)}</b> min</span>
    </div>
  </aside>
{/if}

<style>
.nav-strip {
  inline-size: min(28rem, calc(100% - 1.5rem));
  padding: 0.5rem 0.75rem;
  background: var(--surface-overlay);
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  color: var(--text);
  font-family: var(--font-ui);
}
.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-block-end: 0.4rem;
}
.title {
  font-size: var(--text-md);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--accent);
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-base);
  font-weight: 600;
}
.note {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.ack {
  margin-inline-start: auto;
  font: inherit;
  font-size: var(--text-base);
  padding: 0.5rem 0.9rem;
  min-block-size: var(--control-size);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  color: var(--accent);
  cursor: pointer;
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
.metric b {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text);
}
</style>
