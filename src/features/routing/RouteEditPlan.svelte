<script lang="ts">
import { litLegIndices, type Route, type RouteHighlight, routeLegs } from '$entities/route';
import {
  formatBearingOr,
  formatDuration,
  formatDurationParts,
  formatNm,
  knotsToMetersPerSecond,
  PLACEHOLDER,
} from '$shared/lib';
import { etaSeconds } from '$shared/nav';
import type { PersistedValue } from '$shared/settings';
import { UnitField } from '$shared/ui';

interface Props {
  // The route currently under edit on the chart.
  working: Route;
  // Which leg or waypoint of the working route is cross-highlighted, so the matching rows light up.
  highlight: RouteHighlight | undefined;
  // Tap a leg row to highlight it on the chart, and pan the chart to it when it is off-screen.
  onHighlightLeg: (index: number) => void;
  // The planning speed (knots), persisted, that turns leg distances into per-waypoint passage times.
  planningSpeed: PersistedValue<number>;
}

const { working, highlight, onHighlightLeg, planningSpeed }: Props = $props();

const planSpeedMps = $derived(knotsToMetersPerSecond(Math.max(0, planningSpeed.value ?? 0)));
// Each leg's distance, bearing, and the cumulative distance to reach that leg's end waypoint, so the
// plan reads as a leg table the way a navigator lays out a passage, updating live as waypoints are
// dragged or inserted. The per-leg passage times are layered on at render so this geometry walk does
// not re-run when only the planning speed changes.
const workingLegs = $derived.by(() => {
  let cumulativeMeters = 0;
  return routeLegs(working.waypoints).map((leg) => {
    cumulativeMeters += leg.distanceMeters;
    return { ...leg, cumulativeMeters };
  });
});
// The leg rows lit by the current cross-highlight (a leg lights itself; a waypoint lights the legs it
// joins). Keyed off the waypoint count, not the working object, so a same-length drag move does not
// rebuild the Set; a Set so each row checks its lit state in O(1).
const wptCount = $derived(working.waypoints.length);
const litLegs = $derived(new Set(litLegIndices(highlight, wptCount)));
// The whole-route distance is the last leg's cumulative, so the total and the table cannot drift.
const workingDistanceMeters = $derived(workingLegs.at(-1)?.cumulativeMeters ?? 0);
const workingDistanceNm = $derived(formatNm(workingDistanceMeters));
// The whole-passage time at the planning speed, shown alongside the total distance. Split into value
// and unit so a minutes reading lines its "min" up in the unit column under the distance's "nm".
const totalTime = $derived.by(() => {
  const seconds = etaSeconds(workingDistanceMeters, planSpeedMps);
  return seconds == null ? null : formatDurationParts(seconds);
});
</script>

<dl class="stat-grid">
  <dt>Waypoints</dt>
  <dd><span class="num">{wptCount}</span><span class="unit"></span></dd>
  <dt>Distance</dt>
  <dd>
    <span class="num">{workingDistanceNm}</span>
    <span class="unit">nm</span>
  </dd>
  <dt>Time</dt>
  <dd>
    <span class="num">{totalTime ? totalTime.value : PLACEHOLDER}</span>
    <span class="unit">{totalTime ? totalTime.unit : ''}</span>
  </dd>
</dl>
<UnitField
  label="Plan speed"
  unit="kn"
  value={planningSpeed.value}
  min={0}
  step={0.5}
  inputWidth="4rem"
  onCommit={(speed) => planningSpeed.set(Math.max(0, speed))}
/>
{#if workingLegs.length > 0}
  <ol class="legs" aria-label="Legs">
    {#each workingLegs as leg (leg.fromIndex)}
      {@const seconds = etaSeconds(leg.cumulativeMeters, planSpeedMps)}
      <li>
        <button
          type="button"
          class="leg-row"
          class:is-on={litLegs.has(leg.fromIndex)}
          aria-pressed={litLegs.has(leg.fromIndex)}
          aria-label={`Highlight leg ${leg.fromIndex + 1}`}
          onclick={() => onHighlightLeg(leg.fromIndex)}
        >
          <span class="leg-no">{leg.fromIndex + 1}</span>
          <span class="leg-dist num">{formatNm(leg.distanceMeters)} nm</span>
          <span class="leg-brg num">{formatBearingOr(leg.bearingRad)}&deg;T</span>
          <span class="leg-time num">
            {seconds == null ? PLACEHOLDER : formatDuration(seconds)}
          </span>
        </button>
      </li>
    {/each}
  </ol>
{/if}

<style>
/* The leg-by-leg readout for the route under edit: a scrolling list of leg number, distance, bearing,
   and the cumulative passage time to reach that waypoint, mono and tabular so the columns line up. */
.legs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  max-block-size: 18rem;
  overflow-y: auto;
  font-size: var(--text-sm);
}
.leg-row {
  display: grid;
  grid-template-columns: 1.5rem 1fr auto auto;
  gap: var(--space-2);
  align-items: center;
  inline-size: 100%;
  min-block-size: var(--control-size);
  padding: 0 var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.leg-row:hover {
  background: var(--accent-tint);
}
/* The lit leg is set here, not via the global .is-on utility, because the scoped .leg-row base
   outweighs it; the data columns keep their own colors and only the row box changes. */
.leg-row.is-on {
  background: var(--accent-tint);
  border-color: var(--accent);
  border-inline-start-width: var(--active-bar-width);
}
.leg-no {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.leg-dist {
  color: var(--text);
}
.leg-brg {
  color: var(--text-muted);
}
.leg-time {
  color: var(--accent);
  text-align: end;
}
/* The route-edit working-plan stats use the global .stat-grid system in app.css. */
</style>
