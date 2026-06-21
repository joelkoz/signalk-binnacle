<script lang="ts">
import type { UnitsStore } from '$entities/units';
import { formatBearingOr, formatDayClock, formatKnotsOr, formatPrecipRateOr } from '$shared/lib';
import type { PointConditions } from './signalk-weather';
import { precipUnitLabel, RAIN_VISIBLE_MM_H } from './weather-readout';

interface Props {
  forecast: PointConditions[];
  horizonH: number;
  units: UnitsStore;
}

const { forecast, horizonH, units }: Props = $props();

const knots = (v: number | undefined): string => formatKnotsOr(v, 0);
const precip = (v: number | undefined) => formatPrecipRateOr(v, units.mode);

function stepLabel(timeMs: number): string {
  return formatDayClock(timeMs, { minute: false });
}
</script>

<p class="caps-label forecast-head">Forecast · next {horizonH} h</p>
<ul class="forecast">
  {#each forecast as step (step.timeMs)}
    <li>
      <span class="f-time">{stepLabel(step.timeMs)}</span>
      <span class="f-wind">
        <b class="num">{knots(step.windMs)}</b>
        kn from {formatBearingOr(step.fromRad)}&deg;T
      </span>
      {#if step.precipitationMm !== undefined && step.precipitationMm >= RAIN_VISIBLE_MM_H}
        <span class="f-rain">
          <b class="num">{precip(step.precipitationMm)}</b>
          {precipUnitLabel(step.precipIsRate, units.mode)}
        </span>
      {/if}
    </li>
  {/each}
</ul>

<style>
.forecast-head {
  margin: 0;
  padding-block-start: 0.4rem;
  border-block-start: 1px solid var(--border);
}
.forecast {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.forecast li {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-sm);
}
.f-time {
  flex: 0 0 4.5rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.f-wind {
  flex: 1;
}
.f-rain {
  color: var(--text-muted);
  font-size: var(--text-xs);
}
</style>
