<script lang="ts">
import { onDestroy } from 'svelte';
import type { TidesStore } from '$entities/tides';
import { formatClockTime } from '$shared/lib';
import { SlideOver } from '$shared/ui';
import {
  formatCurrentRate,
  formatStationDistance,
  formatTideHeight,
  formatTideHeightFeet,
  nextCurrentEvent,
  nowFraction,
  tideCurvePoints,
  upcomingEvents,
} from './tides-display';

interface Props {
  store: TidesStore;
  // Whether the tide-station layer is shown on the chart; the toggle row only renders when the
  // host wires onToggleStations, so the panel works without the layer.
  stationsShown?: boolean;
  onToggleStations?: (shown: boolean) => void;
  onClose: () => void;
  onBack?: () => void;
}

const { store, stationsShown = false, onToggleStations, onClose, onBack }: Props = $props();

const tide = $derived(store.tide);
const current = $derived(store.current);
// A live clock so "next" events and the now-marker stay current while the panel is open, not frozen
// at the last refresh (a stationary boat may not trigger a reload for hours). Ticks once a minute,
// which is fine for tide and current events that turn over hours apart.
let now = $state(Date.now());
const clock = setInterval(() => {
  now = Date.now();
}, 60_000);
onDestroy(() => clearInterval(clock));

// The upcoming high and low events, computed once, so next-high and next-low each scan the same
// sorted list rather than re-filtering and re-sorting the events twice per recompute.
const upcoming = $derived(tide ? upcomingEvents(tide.events, now) : []);
const nextHigh = $derived(upcoming.find((e) => e.kind === 'high'));
const nextLow = $derived(upcoming.find((e) => e.kind === 'low'));
const curve = $derived(tide ? tideCurvePoints(tide.events) : []);
const nowFrac = $derived(tide ? nowFraction(tide.events, now) : undefined);
const nextCurrent = $derived(current ? nextCurrentEvent(current.events, now) : undefined);
// The rate and set as one string, so no stray whitespace creeps in between the rate and the comma.
const currentRate = $derived(
  nextCurrent
    ? `${formatCurrentRate(nextCurrent.velocityMps)}${nextCurrent.directionDeg !== undefined ? `, ${Math.round(nextCurrent.directionDeg)}°` : ''}`
    : '',
);

const CURVE_W = 240;
const CURVE_H = 60;

// A smooth path through the day's high and low turning points: a quadratic that rounds each corner
// so the rise and fall read as a tide curve rather than a sawtooth.
function curvePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  const px = (p: { x: number; y: number }) => p.x * CURVE_W;
  const py = (p: { x: number; y: number }) => (1 - p.y) * (CURVE_H - 8) + 4;
  let d = `M ${px(points[0]).toFixed(1)} ${py(points[0]).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const mx = (px(prev) + px(cur)) / 2;
    const my = (py(prev) + py(cur)) / 2;
    d += ` Q ${px(prev).toFixed(1)} ${py(prev).toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${px(last).toFixed(1)} ${py(last).toFixed(1)}`;
  return d;
}
</script>

<SlideOver title="Tides" {onClose} {onBack}>
  {#if onToggleStations}
    <button
      type="button"
      class="btn stations"
      class:is-on={stationsShown}
      aria-pressed={stationsShown}
      onclick={() => onToggleStations(!stationsShown)}
    >
      Show stations on chart
    </button>
  {/if}
  {#if !tide && store.status === 'loading'}
    <p class="status" role="status">Finding nearby tide stations...</p>
  {:else if store.status === 'no-coverage'}
    <p class="status" role="status">
      No tide station nearby. NOAA tide predictions cover US waters only.
    </p>
  {:else if tide}
    <div class="station">
      <span class="name" title={tide.station.name}>{tide.station.name}</span>
      <span class="dist caps-label">{formatStationDistance(tide.distanceMeters)} away</span>
    </div>

    <dl class="stats">
      <dt>Next high</dt>
      <dd>
        {#if nextHigh}
          <span class="num">{formatClockTime(nextHigh.timeMs)}</span>,
          {formatTideHeight(nextHigh.heightMeters)}
          ({formatTideHeightFeet(nextHigh.heightMeters)})
        {:else}
          <span class="num">--</span>
        {/if}
      </dd>
      <dt>Next low</dt>
      <dd>
        {#if nextLow}
          <span class="num">{formatClockTime(nextLow.timeMs)}</span>,
          {formatTideHeight(nextLow.heightMeters)}
          ({formatTideHeightFeet(nextLow.heightMeters)})
        {:else}
          <span class="num">--</span>
        {/if}
      </dd>
    </dl>

    {#if curve.length > 1}
      <!-- The curve restates the next-high and next-low numbers in the list above, so it is
           decorative for assistive technology. -->
      <svg class="curve" viewBox={`0 0 ${CURVE_W} ${CURVE_H}`} aria-hidden="true">
        <path class="curve-line" d={curvePath(curve)} fill="none" />
        {#if nowFrac !== undefined}
          <line class="now" x1={nowFrac * CURVE_W} y1="0" x2={nowFrac * CURVE_W} y2={CURVE_H} />
        {/if}
      </svg>
    {/if}

    {#if current}
      <div class="current">
        <span class="caps-label">Tidal current</span>
        <span class="name" title={current.station.name}>{current.station.name}</span>
        <dl class="stats">
          <dt>Next {nextCurrent?.kind === 'ebb' ? 'ebb' : 'flood'}</dt>
          <dd>
            {#if nextCurrent}
              <span class="num">{formatClockTime(nextCurrent.timeMs)}</span>, {currentRate}
            {:else}
              <span class="num">--</span>
            {/if}
          </dd>
        </dl>
      </div>
    {/if}

    {#if store.status === 'error'}
      <p class="status stale" role="status">
        Showing the last update; the latest refresh did not reach NOAA.
      </p>
    {/if}

    <p class="footnote">Heights above MLLW, times in the device's local time.</p>
  {:else if store.status === 'error'}
    <p class="status stale" role="status">Could not load tide predictions. Check the connection.</p>
  {:else}
    <p class="status" role="status">Pan to a US coast to see tide predictions.</p>
  {/if}
</SlideOver>

<style>
/* The box, the 44px touch height, and the lit .is-on state come from the global .btn vocabulary;
   only the full-width row is local. */
.stations {
  inline-size: 100%;
}
.station {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}
.name {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.dist {
  flex-shrink: 0;
  color: var(--text-muted);
}
.stats {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: baseline;
  column-gap: var(--space-3);
  row-gap: var(--space-1);
  margin: 0;
}
.stats dt {
  color: var(--text-muted);
}
.stats dd {
  margin: 0;
  color: var(--text-muted);
}
.stats .num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text);
}
.curve {
  inline-size: 100%;
  block-size: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.curve-line {
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.now {
  stroke: var(--text-muted);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.current {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-block-start: var(--space-2);
  border-block-start: 1px solid var(--border);
}
.status {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.status.stale {
  color: var(--warning);
}
.footnote {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
}
</style>
