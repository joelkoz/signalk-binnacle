<script lang="ts">
import { TriangleAlert } from '@lucide/svelte';
import type { WeatherStore } from '$entities/weather';
import {
  formatFixed,
  HOUR_MS,
  kelvinToCelsius,
  metersPerSecondToKnots,
  pascalsToHectopascals,
  radiansToBearing,
} from '$shared/lib';
import {
  conditionsFromSignalK,
  fetchObservations,
  fetchPointForecasts,
  fetchWeatherWarnings,
  type PointConditions,
  type WeatherWarning,
} from './signalk-weather';
import { RAIN_VISIBLE_MM_H, readoutAt } from './weather-readout';

interface Props {
  origin: string;
  token?: string;
  // The default provider's display name, or undefined to use the free grid only (no warnings then).
  providerName?: string;
  position?: { latitude: number; longitude: number };
  store: WeatherStore;
}

const { origin, token, providerName, position, store }: Props = $props();

const FORECAST_STEPS = 6;
const FREE_STEP_MS = 6 * HOUR_MS;

let loading = $state(false);
let current = $state<PointConditions | undefined>();
let forecast = $state<PointConditions[]>([]);
let warnings = $state<WeatherWarning[]>([]);
// A sequence guard so a slow earlier load cannot overwrite a newer one.
let seq = 0;

const sourceLabel = $derived(providerName ?? 'Open-Meteo');

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

// Provider data: fetch only when the rounded position or the provider changes, not on every scrub or
// GPS jitter. Observations, the point forecast, and warnings do not depend on the selected time.
$effect(() => {
  const key = posKey;
  const provider = providerName;
  if (!key) {
    clear();
    return;
  }
  if (!provider) return; // the free-fallback effect owns the no-provider case
  const [lat, lon] = posCoords(key);
  void loadProvider(lat, lon);
});

// Free fallback: recompute from the grid on rounded-position or selected-time change, but only when
// no provider is configured. With a provider, the effect above owns the conditions.
$effect(() => {
  const key = posKey;
  const provider = providerName;
  void store.selectedTime;
  if (!key || provider) return;
  const [lat, lon] = posCoords(key);
  current = freeCurrent(lat, lon);
  forecast = freeForecast(lat, lon);
  warnings = [];
});

function clear(): void {
  current = undefined;
  forecast = [];
  warnings = [];
}

async function loadProvider(lat: number, lon: number): Promise<void> {
  const mine = ++seq;
  loading = true;
  const [obs, series, warns] = await Promise.all([
    fetchObservations(origin, lat, lon, token),
    fetchPointForecasts(origin, lat, lon, 12, token),
    fetchWeatherWarnings(origin, lat, lon, token),
  ]);
  if (mine !== seq) return;
  current = obs ? conditionsFromSignalK(obs) : freeCurrent(lat, lon);
  forecast = series
    ? series.map(conditionsFromSignalK).slice(0, FORECAST_STEPS)
    : freeForecast(lat, lon);
  warnings = warns ?? [];
  loading = false;
}

function freeCurrent(lat: number, lon: number): PointConditions | undefined {
  const grid = store.grid;
  if (!grid) return undefined;
  const r = readoutAt(grid, lon, lat, store.bracket.lo);
  return r ? { timeMs: store.selectedTime, windMs: r.speedMs, ...readoutFields(r) } : undefined;
}

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
    out.push({ timeMs: t, windMs: r.speedMs, ...readoutFields(r) });
    lastMs = t;
  }
  return out;
}

function readoutFields(r: NonNullable<ReturnType<typeof readoutAt>>): Partial<PointConditions> {
  return {
    fromRad: r.fromRad,
    pressurePa: r.pressurePa,
    cloudFraction: r.cloudCoverFraction,
    waveHeightM: r.waveHeightM,
    wavePeriodS: r.wavePeriodS,
    precipitationMm: r.precipitationMm,
  };
}

const knots = (v: number | undefined) => formatFixed(metersPerSecondToKnots(v), 1);
const bearing = (v: number | undefined) => formatFixed(radiansToBearing(v), 0);
const hpa = (v: number | undefined) => formatFixed(pascalsToHectopascals(v), 0);
const degC = (v: number | undefined) => formatFixed(kelvinToCelsius(v), 0);
const pct = (v: number | undefined) => formatFixed(v === undefined ? undefined : v * 100, 0);

function stepLabel(timeMs: number): string {
  if (Number.isNaN(timeMs)) return '';
  return new Date(timeMs).toLocaleString([], { weekday: 'short', hour: '2-digit' });
}
</script>

<section class="conditions" aria-label="Conditions at the vessel">
  <header class="cond-head">
    <span class="caps-label">Here</span>
    <span class="cond-source">{sourceLabel}</span>
  </header>

  {#if !position}
    <p class="cond-empty" role="status">Waiting for a vessel position.</p>
  {:else}
    {#if warnings.length > 0}
      <ul class="warnings" role="alert">
        {#each warnings as w (w.startTime + w.type)}
          <li class="warning">
            <TriangleAlert size={14} aria-hidden="true" />
            <span>
              <b>{w.type}</b>
              {w.details}
            </span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if current}
      <dl class="now">
        <div>
          <dt>Wind</dt>
          <dd><b>{knots(current.windMs)}</b> kn {bearing(current.fromRad)}&deg;</dd>
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
            <dd><b>{hpa(current.pressurePa)}</b> hPa</dd>
          </div>
        {/if}
        {#if current.airTempK !== undefined}
          <div>
            <dt>Air</dt>
            <dd><b>{degC(current.airTempK)}</b>&deg;C</dd>
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
            <dt>Sea</dt>
            <dd>
              <b>{formatFixed(current.waveHeightM, 1)}</b>
              m
              {#if current.wavePeriodS !== undefined}
                / <b>{formatFixed(current.wavePeriodS, 1)}</b> s
              {/if}
            </dd>
          </div>
        {/if}
        {#if current.precipitationMm !== undefined && current.precipitationMm >= RAIN_VISIBLE_MM_H}
          <div>
            <dt>Rain</dt>
            <dd><b>{formatFixed(current.precipitationMm, 1)}</b> mm/h</dd>
          </div>
        {/if}
      </dl>
    {:else if loading}
      <p class="cond-empty" role="status">Loading conditions.</p>
    {:else}
      <p class="cond-empty" role="status">No conditions for this point</p>
    {/if}

    {#if forecast.length > 0}
      <ul class="forecast">
        {#each forecast as step (step.timeMs)}
          <li>
            <span class="f-time">{stepLabel(step.timeMs)}</span>
            <span class="f-wind"><b>{knots(step.windMs)}</b> kn {bearing(step.fromRad)}&deg;</span>
            {#if step.precipitationMm !== undefined && step.precipitationMm >= RAIN_VISIBLE_MM_H}
              <span class="f-rain"><b>{formatFixed(step.precipitationMm, 1)}</b> mm/h</span>
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
.cond-empty {
  margin: 0;
  font-size: var(--text-sm);
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
.warning {
  display: flex;
  align-items: start;
  gap: 0.35rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--alarm);
  border-radius: var(--radius-sm);
  background: var(--alarm-tint);
  color: var(--text);
  font-size: var(--text-xs);
}
.warning :global(svg) {
  color: var(--alarm);
  flex: 0 0 auto;
  margin-block-start: 0.1rem;
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
.forecast {
  list-style: none;
  margin: 0;
  padding-block-start: 0.4rem;
  border-block-start: 1px solid var(--border);
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
