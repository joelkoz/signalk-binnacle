<script lang="ts">
import type { UnitsStore } from '$entities/units';
import {
  formatBearingOr,
  formatDayClock,
  formatFixed,
  formatKnotsOr,
  formatLengthOr,
  formatMetersOrNm,
  formatPercent,
  formatPrecipRateOr,
  formatPressureOr,
  formatTemperatureOr,
  lengthUnit,
  pressureUnit,
  temperatureUnit,
} from '$shared/lib';
import type { PointConditions } from './signalk-weather';
import { precipUnitLabel, RAIN_VISIBLE_MM_H } from './weather-readout';

interface Props {
  current: PointConditions;
  observed: boolean;
  tendencyText?: string;
  units: UnitsStore;
}

const { current, observed, tendencyText, units }: Props = $props();

const knots = (v: number | undefined): string => formatKnotsOr(v, 0);
const pressure = (v: number | undefined) => formatPressureOr(v, units.mode);
const temp = (v: number | undefined) => formatTemperatureOr(v, units.mode);
const height = (v: number | undefined) => formatLengthOr(v, units.mode);
const precip = (v: number | undefined) => formatPrecipRateOr(v, units.mode);

// The current block's valid time carries the zone (the formatDayClock rationale).
const validLabel = (timeMs: number): string => formatDayClock(timeMs, { zone: true });
</script>

<p class="cond-when">{observed ? 'Observed' : 'Forecast'}· {validLabel(current.timeMs)}</p>
<dl class="now">
  <div>
    <dt>Wind</dt>
    <dd>
      <b class="num">{knots(current.windMs)}</b>
      kn from {formatBearingOr(current.fromRad)}&deg;T
    </dd>
  </div>
  {#if current.gustMs !== undefined}
    <div>
      <dt>Gust</dt>
      <dd><b class="num">{knots(current.gustMs)}</b> kn</dd>
    </div>
  {/if}
  {#if current.pressurePa !== undefined}
    <div>
      <dt>Pressure</dt>
      <dd>
        <b class="num">{pressure(current.pressurePa)}</b>
        {pressureUnit(units.mode)}
        {#if tendencyText}
          <span class="trend">{tendencyText}</span>
        {/if}
      </dd>
    </div>
  {/if}
  {#if current.airTempK !== undefined}
    <div>
      <dt>Air</dt>
      <dd><b class="num">{temp(current.airTempK)}</b>{temperatureUnit(units.mode)}</dd>
    </div>
  {/if}
  {#if current.waterTempK !== undefined}
    <div>
      <dt>Water</dt>
      <dd><b class="num">{temp(current.waterTempK)}</b>{temperatureUnit(units.mode)}</dd>
    </div>
  {/if}
  {#if current.visibilityM !== undefined}
    <div>
      <dt>Visibility</dt>
      <dd><b class="num">{formatMetersOrNm(current.visibilityM, units.mode)}</b></dd>
    </div>
  {/if}
  {#if current.cloudFraction !== undefined}
    <div>
      <dt>Cloud</dt>
      <dd><b class="num">{formatPercent(current.cloudFraction)}</b>%</dd>
    </div>
  {/if}
  {#snippet waveBlock(label: string, heightM: number, periodS: number | undefined, fromRad: number | undefined)}
    <div>
      <dt>{label}</dt>
      <dd>
        <b class="num">{height(heightM)}</b>
        {lengthUnit(units.mode)}
        {#if periodS !== undefined}
          / <b class="num">{formatFixed(periodS, 1)}</b> s
        {/if}
        {#if fromRad !== undefined}
          from {formatBearingOr(fromRad)}&deg;T
        {/if}
      </dd>
    </div>
  {/snippet}
  {#if current.waveHeightM !== undefined}
    {@render waveBlock('Waves', current.waveHeightM, current.wavePeriodS, current.waveFromRad)}
  {/if}
  {#if current.swellHeightM !== undefined}
    {@render waveBlock('Swell', current.swellHeightM, current.swellPeriodS, current.swellFromRad)}
  {/if}
  {#if current.precipitationMm !== undefined && current.precipitationMm >= RAIN_VISIBLE_MM_H}
    <div>
      <dt>Rain</dt>
      <dd>
        <b class="num">{precip(current.precipitationMm)}</b>
        {precipUnitLabel(current.precipIsRate, units.mode)}
      </dd>
    </div>
  {/if}
</dl>

<style>
/* Whether the block is an observation or model output, and for when: forecast data styled as
   present conditions misleads. */
.cond-when {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.now {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.3rem 0.6rem;
  margin: 0;
}
.now div {
  display: flex;
  flex-direction: column;
}
.now dt {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.now dd {
  margin: 0;
  font-size: var(--text-sm);
}
/* The current-conditions values are the panel's hero numbers, so they step up over their caps labels
   and the unit text, the instrument-readout gesture. */
.now b {
  font-size: var(--text-lg);
}
.trend {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>
