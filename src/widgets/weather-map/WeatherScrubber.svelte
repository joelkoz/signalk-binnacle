<script lang="ts">
import { ChevronLeft, ChevronRight, Pause, Play } from '@lucide/svelte';
import type { TimeRange } from '$features/weather';

interface Props {
  range: TimeRange;
  selectedTime: number;
  playing: boolean;
  timeKind: string;
  timeLabel: string;
  // Where "now" sits on the slider track (0..1), for the tick that separates past from forecast;
  // undefined when now is off the track.
  nowFrac?: number;
  onStep: (dir: 1 | -1) => void;
  onTogglePlay: () => void;
  onSetTime: (t: number) => void;
}

const {
  range,
  selectedTime,
  playing,
  timeKind,
  timeLabel,
  nowFrac,
  onStep,
  onTogglePlay,
  onSetTime,
}: Props = $props();
</script>

<div class="scrubber" role="group" aria-label="Forecast playback">
  <button type="button" class="icon-btn step" aria-label="Earlier" onclick={() => onStep(-1)}>
    <ChevronLeft size={16} aria-hidden="true" />
  </button>
  <button
    type="button"
    class="icon-btn step"
    aria-label={playing ? 'Pause' : 'Play'}
    onclick={onTogglePlay}
  >
    {#if playing}
      <Pause size={16} aria-hidden="true" />
    {:else}
      <Play size={16} aria-hidden="true" />
    {/if}
  </button>
  <button type="button" class="icon-btn step" aria-label="Later" onclick={() => onStep(1)}>
    <ChevronRight size={16} aria-hidden="true" />
  </button>
  <span class="track-wrap">
    <input
      class="track range"
      type="range"
      min={range.start}
      max={range.end}
      step={range.stepMs}
      value={selectedTime}
      aria-label="Forecast time"
      aria-valuetext="{timeKind} {timeLabel}"
      oninput={(e) => onSetTime(Number(e.currentTarget.value))}
    >
    {#if nowFrac !== undefined}
      <!-- The now tick: everything left of it already happened. -->
      <span class="now-tick" style="inset-inline-start: {nowFrac * 100}%" aria-hidden="true"></span>
    {/if}
  </span>
  <span class="time">{timeKind} &middot; {timeLabel}</span>
  <!-- Announce manual time changes (the visible label is too chatty to be live during
       playback, so the mirror empties while playing). -->
  <span class="visually-hidden" role="status">{playing ? '' : timeLabel}</span>
</div>

<style>
.scrubber {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
/* The slider styling comes from the shared .range; the wrap exists so the now tick can be
   positioned over the track. */
.track-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
}
.track {
  inline-size: 100%;
}
.now-tick {
  position: absolute;
  inset-block: 0.45rem;
  inline-size: 2px;
  background: var(--accent);
  pointer-events: none;
}
.scrubber .step {
  flex: 0 0 auto;
}
.scrubber .time {
  font-variant-numeric: tabular-nums;
  font-size: var(--text-sm);
  white-space: nowrap;
}
</style>
