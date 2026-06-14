<script lang="ts">
import { TriangleAlert } from '@lucide/svelte';
import type { UnitsStore } from '$entities/units';
import type { WeatherStore } from '$entities/weather';
import {
  formatBearingOr,
  formatDayClock,
  formatFixed,
  formatKnotsOr,
  formatLengthOr,
  formatMetersOrNm,
  formatPrecipRateOr,
  formatPressureOr,
  formatTemperatureOr,
  HOUR_MS,
  lengthUnit,
  PA_PER_HPA,
  pressureUnit,
  temperatureUnit,
} from '$shared/lib';
import { GRID_SOURCE_LABEL } from './fills';
import { createPointConditionsLoader } from './point-conditions';
import {
  conditionsFromSignalK,
  NEAR_NOW_MS,
  nearestInTimeBounded,
  type PointConditions,
  type SignalKWeatherData,
  type WeatherWarning,
} from './signalk-weather';
import {
  PRESSURE_TREND_WINDOW_MS,
  precipUnitLabel,
  pressureTrendPa,
  RAIN_VISIBLE_MM_H,
  readoutAt,
  readoutAtBracket,
  type WeatherReadout,
} from './weather-readout';

interface Props {
  origin: string;
  token?: string;
  // The default provider's display name, or undefined to use the free grid only (no warnings then).
  providerName?: string;
  position?: { latitude: number; longitude: number };
  store: WeatherStore;
  // The imperial-versus-metric display preference; wind stays in knots regardless.
  units: UnitsStore;
}

const { origin, token, providerName, position, store, units }: Props = $props();

const FORECAST_STEPS = 6;
const FREE_STEP_MS = 6 * HOUR_MS;

// Fetches the provider's point answers and persists them, so a panel opened with a failed or
// absent network replays the last conditions for the spot (within the hour) instead of going blank.
const pointLoader = createPointConditionsLoader();

let loading = $state(false);
// The provider's raw answers, kept as data so the conditions DERIVE from them and the selected
// time: scrubbing the slider re-picks the step without refetching. A transient provider failure
// replays the spot's persisted answers while they are within the hour, and past that leaves these
// undefined so the panel falls through to the time-reactive free grid instead of freezing a
// one-shot sample on screen.
let obsData = $state<SignalKWeatherData | undefined>();
let seriesData = $state<SignalKWeatherData[] | undefined>();
let warnings = $state<WeatherWarning[]>([]);
// A sequence guard so a slow earlier load cannot overwrite a newer one.
let seq = 0;

const sourceLabel = $derived(providerName ?? GRID_SOURCE_LABEL);

// A position key rounded to about 110 m. The boat's fix jitters every GPS delta, so keying the
// effects on the rounded string instead of the raw object stops a refetch (and a burst of provider
// 400s) on every tick; weather does not change within 110 m.
const posKey = $derived(
  position ? `${position.latitude.toFixed(3)},${position.longitude.toFixed(3)}` : '',
);

function posCoords(key: string): [number, number] {
  const [lat, lon] = key.split(',').map(Number);
  return [lat, lon];
}

// Provider data: fetch only when the rounded position or the provider changes, not on every scrub
// or GPS jitter; the deriveds below re-pick the step for the selected time without a request.
$effect(() => {
  const key = posKey;
  const provider = providerName;
  // Without a position or a provider there is no provider data to show: clear any stale answers
  // (a provider that disappears at runtime must not keep its warnings on screen).
  if (!key || !provider) {
    clear();
    return;
  }
  const [lat, lon] = posCoords(key);
  void loadProvider(provider, lat, lon);
});

function clear(): void {
  seq += 1; // an in-flight provider load must not repopulate what was just cleared
  obsData = undefined;
  seriesData = undefined;
  warnings = [];
  loading = false;
}

async function loadProvider(provider: string, lat: number, lon: number): Promise<void> {
  const mine = ++seq;
  loading = true;
  const point = await pointLoader.load(origin, provider, lat, lon, token);
  if (mine !== seq) return;
  obsData = point.obs;
  seriesData = point.series;
  // The loader leaves warnings undefined on a transient failure and [] only when the provider
  // genuinely reports none. Warnings have no free fallback, so keep the last set on a failure: a
  // slow or rate-limited provider must not flicker an active gale or small-craft advisory off the
  // panel. A real empty result clears them.
  if (point.warnings) warnings = point.warnings;
  loading = false;
}

// The time the conditions answer for: the scrubbed forecast time once a grid exists, otherwise now.
const targetMs = $derived(store.grid ? store.selectedTime : Date.now());

// The provider's answer for the target time: the latest observation when the target is near now,
// else the bounded nearest forecast step (never an entry days from the target).
const providerCurrent = $derived.by<{ cond: PointConditions; observed: boolean } | undefined>(
  () => {
    if (!providerName) return undefined;
    if (Math.abs(targetMs - Date.now()) < NEAR_NOW_MS && obsData) {
      return { cond: conditionsFromSignalK(obsData), observed: true };
    }
    if (seriesData) {
      const step = nearestInTimeBounded(seriesData, targetMs);
      if (step) return { cond: conditionsFromSignalK(step), observed: false };
    }
    return undefined;
  },
);

// One readout-to-conditions mapper shared by the current block and the forecast rows, so a field
// added to one (as gusts just were) cannot be forgotten in the other.
function conditionsFromReadout(r: WeatherReadout, timeMs: number): PointConditions {
  return {
    timeMs,
    windMs: r.speedMs,
    fromRad: r.fromRad,
    gustMs: r.gustMs,
    pressurePa: r.pressurePa,
    cloudFraction: r.cloudCoverFraction,
    waveHeightM: r.waveHeightM,
    wavePeriodS: r.wavePeriodS,
    waveFromRad: r.waveFromRad,
    precipitationMm: r.precipitationMm,
    precipIsRate: r.precipIsRate,
  };
}

// The free-grid sample at the vessel, blended across the time bracket like the drawn fields.
const freeCurrent = $derived.by<PointConditions | undefined>(() => {
  if (!posKey || !store.grid) return undefined;
  const [lat, lon] = posCoords(posKey);
  const r = readoutAtBracket(store.grid, lon, lat, store.bracket);
  return r ? conditionsFromReadout(r, store.selectedTime) : undefined;
});

const current = $derived(providerCurrent?.cond ?? freeCurrent);
const currentObserved = $derived(providerCurrent?.observed ?? false);

// The barometric tendency, the datum a sailor actually decides by. The provider's qualitative
// string wins when present; otherwise the trailing 3-hour delta computed from the free grid.
const tendencyText = $derived.by<string | undefined>(() => {
  const fromProvider = providerCurrent?.cond.pressureTendency;
  if (fromProvider) return fromProvider;
  if (!posKey || !store.grid) return undefined;
  const [lat, lon] = posCoords(posKey);
  const dPa = pressureTrendPa(store.grid, lon, lat, targetMs);
  if (dPa === undefined) return undefined;
  const dHpa = dPa / PA_PER_HPA;
  const hours = PRESSURE_TREND_WINDOW_MS / HOUR_MS;
  if (Math.abs(dHpa) < 0.5) return 'steady';
  const word = dHpa > 0 ? 'rising' : 'falling';
  // Metric keeps a tenth of a hectopascal: formatPressureOr's whole hPa would round a real
  // 0.7 hPa/3 h trend up to 1. Imperial uses the formatter's hundredths of inHg.
  const value =
    units.mode === 'imperial'
      ? formatPressureOr(Math.abs(dPa), 'imperial')
      : formatFixed(Math.abs(dHpa), 1);
  return `${word} ${value} ${pressureUnit(units.mode)}/${hours} h`;
});

// Parsed once per fetch, so scrubbing (700 ms ticks during playback) filters a stable array
// instead of re-parsing twelve dates per step.
const parsedSeries = $derived(seriesData?.map(conditionsFromSignalK));

const forecast = $derived.by<PointConditions[]>(() => {
  if (providerName && parsedSeries) {
    const rows = parsedSeries
      .filter((c) => !Number.isNaN(c.timeMs) && c.timeMs >= targetMs)
      .slice(0, FORECAST_STEPS);
    // An empty or fully-past provider series must not suppress the free-grid forecast.
    if (rows.length > 0) return rows;
  }
  if (!posKey) return [];
  const [lat, lon] = posCoords(posKey);
  return freeForecast(lat, lon);
});

// The forecast window the rows actually span, so the cadence (6-hourly free, provider-defined
// otherwise) never has to be guessed from the row times.
const forecastHorizonH = $derived(
  forecast.length > 0
    ? Math.max(1, Math.round((forecast[forecast.length - 1].timeMs - targetMs) / HOUR_MS))
    : 0,
);

function freeForecast(lat: number, lon: number): PointConditions[] {
  const grid = store.grid;
  if (!grid) return [];
  const out: PointConditions[] = [];
  let lastMs = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < grid.times.length && out.length < FORECAST_STEPS; i++) {
    const t = grid.times[i];
    if (t < store.selectedTime || t - lastMs < FREE_STEP_MS) continue;
    const r = readoutAt(grid, lon, lat, i);
    if (!r) continue;
    out.push(conditionsFromReadout(r, t));
    lastMs = t;
  }
  return out;
}

// Severity order for the warnings list: the gale must never sit under a marginal advisory.
const WARN_HURRICANE = /hurricane|typhoon/;
const WARN_STORM = /storm/;
const WARN_GALE = /gale/;
const WARN_SMALL_CRAFT = /small craft/;
function severityRank(type: string): number {
  const t = type.toLowerCase();
  if (WARN_HURRICANE.test(t)) return 0;
  if (WARN_STORM.test(t)) return 1;
  if (WARN_GALE.test(t)) return 2;
  if (WARN_SMALL_CRAFT.test(t)) return 3;
  return 4;
}
const sortedWarnings = $derived(
  [...warnings].sort((a, b) => severityRank(a.type) - severityRank(b.type)),
);

const knots = (v: number | undefined) => formatKnotsOr(v, 0);
const bearing = formatBearingOr;
const pressure = (v: number | undefined) => formatPressureOr(v, units.mode);
const temp = (v: number | undefined) => formatTemperatureOr(v, units.mode);
const height = (v: number | undefined) => formatLengthOr(v, units.mode);
const precip = (v: number | undefined) => formatPrecipRateOr(v, units.mode);
const pct = (v: number | undefined) => formatFixed(v === undefined ? undefined : v * 100, 0);

function stepLabel(timeMs: number): string {
  return formatDayClock(timeMs, { minute: false });
}

// The current block's valid time carries the zone (the formatDayClock rationale).
const validLabel = (timeMs: number): string => formatDayClock(timeMs, { zone: true });

const untilLabel = (endTime: string): string => formatDayClock(Date.parse(endTime));
</script>

<section class="conditions" aria-label="Conditions at the vessel">
  <header class="cond-head">
    <span class="caps-label">Here</span>
    <span class="cond-source">{sourceLabel}</span>
  </header>

  {#if !position}
    <p class="cond-empty" role="status">Waiting for a vessel position.</p>
  {:else}
    {#if sortedWarnings.length > 0}
      <ul class="warnings" role="alert">
        {#each sortedWarnings as w (w.startTime + w.type)}
          {@const until = untilLabel(w.endTime)}
          <li class="warning">
            <TriangleAlert size={14} aria-hidden="true" />
            <span>
              <b>{w.type}</b>
              {w.details}
              <span class="warning-meta"> {w.source}{until ? ` · until ${until}` : ''} </span>
            </span>
          </li>
        {/each}
      </ul>
    {:else if !providerName}
      <!-- Silence must be labeled: an empty list would read as "no warnings active" when the free
           sources simply carry none. -->
      <p class="cond-note">Warnings unavailable without a weather provider.</p>
    {/if}

    {#if current}
      <p class="cond-when">
        {currentObserved ? 'Observed' : 'Forecast'}
        · {validLabel(current.timeMs)}
      </p>
      <dl class="now">
        <div>
          <dt>Wind</dt>
          <dd><b>{knots(current.windMs)}</b> kn from {bearing(current.fromRad)}&deg;T</dd>
        </div>
        {#if current.gustMs !== undefined}
          <div>
            <dt>Gust</dt>
            <dd><b>{knots(current.gustMs)}</b> kn</dd>
          </div>
        {/if}
        {#if current.pressurePa !== undefined}
          <div>
            <dt>Pressure</dt>
            <dd>
              <b>{pressure(current.pressurePa)}</b>
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
            <dd><b>{temp(current.airTempK)}</b>{temperatureUnit(units.mode)}</dd>
          </div>
        {/if}
        {#if current.waterTempK !== undefined}
          <div>
            <dt>Water</dt>
            <dd><b>{temp(current.waterTempK)}</b>{temperatureUnit(units.mode)}</dd>
          </div>
        {/if}
        {#if current.visibilityM !== undefined}
          <div>
            <dt>Visibility</dt>
            <dd><b>{formatMetersOrNm(current.visibilityM, units.mode)}</b></dd>
          </div>
        {/if}
        {#if current.cloudFraction !== undefined}
          <div>
            <dt>Cloud</dt>
            <dd><b>{pct(current.cloudFraction)}</b>%</dd>
          </div>
        {/if}
        {#if current.waveHeightM !== undefined}
          <div>
            <dt>Waves</dt>
            <dd>
              <b>{height(current.waveHeightM)}</b>
              {lengthUnit(units.mode)}
              {#if current.wavePeriodS !== undefined}
                / <b>{formatFixed(current.wavePeriodS, 1)}</b> s
              {/if}
              {#if current.waveFromRad !== undefined}
                from {bearing(current.waveFromRad)}&deg;T
              {/if}
            </dd>
          </div>
        {/if}
        {#if current.swellHeightM !== undefined}
          <div>
            <dt>Swell</dt>
            <dd>
              <b>{height(current.swellHeightM)}</b>
              {lengthUnit(units.mode)}
              {#if current.swellPeriodS !== undefined}
                / <b>{formatFixed(current.swellPeriodS, 1)}</b> s
              {/if}
              {#if current.swellFromRad !== undefined}
                from {bearing(current.swellFromRad)}&deg;T
              {/if}
            </dd>
          </div>
        {/if}
        {#if current.precipitationMm !== undefined && current.precipitationMm >= RAIN_VISIBLE_MM_H}
          <div>
            <dt>Rain</dt>
            <dd>
              <b>{precip(current.precipitationMm)}</b>
              {precipUnitLabel(current.precipIsRate, units.mode)}
            </dd>
          </div>
        {/if}
      </dl>
    {:else if loading}
      <p class="cond-empty" role="status">Loading conditions.</p>
    {:else if !providerName && !store.grid}
      <p class="cond-empty" role="status">Turn on a weather layer to load conditions.</p>
    {:else}
      <p class="cond-empty" role="status">No conditions for this point.</p>
    {/if}

    {#if forecast.length > 0}
      <p class="caps-label forecast-head">Forecast · next {forecastHorizonH} h</p>
      <ul class="forecast">
        {#each forecast as step (step.timeMs)}
          <li>
            <span class="f-time">{stepLabel(step.timeMs)}</span>
            <span class="f-wind">
              <b>{knots(step.windMs)}</b>
              kn from {bearing(step.fromRad)}&deg;T
            </span>
            {#if step.precipitationMm !== undefined && step.precipitationMm >= RAIN_VISIBLE_MM_H}
              <span class="f-rain">
                <b>{precip(step.precipitationMm)}</b>
                {precipUnitLabel(step.precipIsRate, units.mode)}
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
.conditions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  inline-size: 15rem;
  max-block-size: 100%;
  overflow-y: auto;
  padding: var(--space-2) 0.6rem;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
}
.cond-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}
.cond-source {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.cond-empty,
.cond-note {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-muted);
}
/* Whether the block is an observation or model output, and for when: forecast data styled as
   present conditions misleads. */
.cond-when {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.warnings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
/* Warning text holds the small-panel body size, never the smallest tier: a gale advisory is the
   highest-stakes content here and must stay readable on a pitching deck. */
.warning {
  display: flex;
  align-items: start;
  gap: 0.35rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--alarm);
  border-radius: var(--radius-sm);
  background: var(--alarm-tint);
  color: var(--text);
  font-size: var(--text-sm);
}
.warning :global(svg) {
  color: var(--alarm);
  flex: 0 0 auto;
  margin-block-start: 0.1rem;
}
/* Let a long unbroken provider string wrap rather than overflow the fixed-width conditions panel. */
.warning span {
  min-inline-size: 0;
  overflow-wrap: anywhere;
}
.warning-meta {
  display: block;
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
.now b,
.forecast b {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
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
/* On a phone the conditions span the weather panel's width as a bottom sheet rather than a fixed
   15rem card that would cover most of the small map. */
@media (max-width: 600px) {
  .conditions {
    inline-size: 100%;
    max-block-size: 45vh;
  }
}
</style>
