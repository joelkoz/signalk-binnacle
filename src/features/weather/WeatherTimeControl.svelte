<script lang="ts">
import { CloudSun, Pause, Play, X } from '@lucide/svelte';
import type { WeatherStore } from '$entities/weather';
import type { WeatherLegend } from './legend';
import { advancePlay, clampTime, stepTime, type TimeRange } from './time-scrub';

interface Props {
  store: WeatherStore;
  // Whether any weather layer is on; the button only shows when weather is active.
  active: boolean;
  // Legends for the active weather layers, shown in the expanded window.
  legends: WeatherLegend[];
}

const { store, active, legends }: Props = $props();

let expanded = $state(false);
let playing = $state(false);
let timer: ReturnType<typeof setInterval> | undefined;

const STEP_MS = 3 * 3_600_000;

const range = $derived<TimeRange | undefined>(
  store.grid && store.grid.times.length > 0
    ? {
        start: store.grid.times[0],
        end: store.grid.times[store.grid.times.length - 1],
        stepMs: STEP_MS,
      }
    : undefined,
);

const label = $derived(
  store.grid
    ? new Date(store.selectedTime).toLocaleString([], {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
);

function set(t: number): void {
  if (range) store.setSelectedTime(clampTime(t, range));
}

function stop(): void {
  playing = false;
  if (timer) clearInterval(timer);
  timer = undefined;
}

function togglePlay(): void {
  if (playing || !range) {
    stop();
    return;
  }
  playing = true;
  timer = setInterval(() => store.setSelectedTime(advancePlay(store.selectedTime, range)), 700);
}

$effect(() => () => stop());
</script>

{#if active}
  <button
    type="button"
    class="forecast-btn"
    class:on={expanded}
    onclick={() => (expanded = !expanded)}
  >
    <CloudSun size={16} aria-hidden="true" />
    Forecast
  </button>
{/if}

{#if active && expanded && range}
  <div class="scrubber" role="group" aria-label="Forecast time">
    <button
      type="button"
      class="step"
      aria-label="Earlier"
      onclick={() => set(stepTime(store.selectedTime, -1, range))}
    >
      &#9664;
    </button>
    <button type="button" class="step" aria-label={playing ? 'Pause' : 'Play'} onclick={togglePlay}>
      {#if playing}
        <Pause size={16} aria-hidden="true" />
      {:else}
        <Play size={16} aria-hidden="true" />
      {/if}
    </button>
    <button
      type="button"
      class="step"
      aria-label="Later"
      onclick={() => set(stepTime(store.selectedTime, 1, range))}
    >
      &#9654;
    </button>
    <input
      class="track"
      type="range"
      min={range.start}
      max={range.end}
      step={range.stepMs}
      value={store.selectedTime}
      aria-label="Forecast time"
      oninput={(e) => set(Number(e.currentTarget.value))}
    >
    <span class="time">{label}</span>
    <button type="button" class="step" aria-label="Close" onclick={() => (expanded = false)}>
      <X size={16} aria-hidden="true" />
    </button>
  </div>
{/if}

{#if active && expanded && legends.length > 0}
  <div class="legend" role="group" aria-label="Weather legend">
    {#each legends as legend (legend.id)}
      <div class="legend-row">
        <span class="legend-title">{legend.title}</span>
        <span class="legend-swatches">
          {#each legend.swatches as swatch (swatch.label)}
            <span class="legend-swatch">
              <span class="legend-chip" style="background:{swatch.color}"></span>
              {swatch.label}
            </span>
          {/each}
        </span>
      </div>
    {/each}
  </div>
{/if}

<style>
.forecast-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-block-size: var(--control-size);
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.forecast-btn.on {
  color: var(--accent);
  border-color: var(--accent);
}
.scrubber {
  position: fixed;
  inset-inline: 0.5rem;
  inset-block-end: 2.6rem;
  margin-inline: auto;
  max-inline-size: 32rem;
  z-index: var(--z-menu);
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.6rem;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
}
.scrubber .track {
  flex: 1;
  accent-color: var(--accent);
}
.scrubber .step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-block-size: var(--control-size);
  min-inline-size: var(--control-size);
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.scrubber .time {
  font-variant-numeric: tabular-nums;
  font-size: var(--text-sm);
  white-space: nowrap;
}
.legend {
  position: fixed;
  inset-inline: 0.5rem;
  inset-block-end: 5.4rem;
  margin-inline: auto;
  max-inline-size: 32rem;
  z-index: var(--z-menu);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.45rem 0.6rem;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.legend-title {
  flex: 0 0 6.5rem;
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--text-muted);
}
.legend-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.legend-swatch {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.legend-chip {
  inline-size: 0.85rem;
  block-size: 0.85rem;
  border-radius: 2px;
  border: 1px solid var(--border);
}
</style>
