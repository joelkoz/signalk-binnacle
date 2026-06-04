<script lang="ts">
import { Pause, Play, X } from '@lucide/svelte';
import { onDestroy, onMount } from 'svelte';
import { type Bbox, boundsToBbox, type WeatherStore } from '$entities/weather';
import { LayersView } from '$features/layers-panel';
import {
  advancePlay,
  clampTime,
  createCloudOverlay,
  createPrecipOverlay,
  createPressureOverlay,
  createRadarOverlay,
  createWavesOverlay,
  createWindOverlay,
  fetchObservations,
  fetchPointForecasts,
  nearestInTime,
  readoutAt,
  readoutFromSignalK,
  stepTime,
  type TimeRange,
  WEATHER_FILL_IDS,
  WEATHER_LAYER_IDS,
  WeatherConditions,
  type WeatherLegend,
  type WeatherLoader,
  type WeatherReadout,
  weatherLegend,
} from '$features/weather';
import {
  formatFixed,
  metersPerSecondToKnots,
  pascalsToHectopascals,
  radiansToBearing,
} from '$shared/lib';
import { createThemedMap, type LayerSettings, type ThemedMapHandle } from '$shared/map';
import type { MapView } from '$shared/settings';
import { serverOrigin } from '$shared/signalk';
import type { Theme } from '$shared/ui';

interface Props {
  store: WeatherStore;
  // The shared, cached weather loader (Open-Meteo plus RainViewer), constructed in App.
  loader: WeatherLoader;
  theme: Theme;
  // Where the nav chart is looking, used the first time the panel opens.
  initialView?: MapView;
  // The panel's own remembered view, and a sink to persist it.
  savedView?: MapView;
  onViewChange?: (view: MapView) => void;
  // The panel's own weather-layer visibility, separate from the nav chart's layers.
  savedLayers?: LayerSettings;
  onLayersChange?: (settings: LayerSettings) => void;
  // The Signal K auth token and the default weather provider's display name, when one is configured.
  // With a provider, the tap readout prefers it and falls back to the free grid; without one, the
  // grid answers. The area overlays and radar always use the free sources.
  token?: string;
  providerName?: string;
  // The vessel position, for the "Here" conditions panel.
  position?: { latitude: number; longitude: number };
  onClose: () => void;
}

const {
  store,
  loader,
  theme,
  initialView,
  savedView,
  onViewChange,
  savedLayers,
  onLayersChange,
  token,
  providerName,
  position,
  onClose,
}: Props = $props();

// RainViewer radar tops out at zoom 7, and the Open-Meteo grid is coarse, so capping the mini-map
// zoom keeps every weather source within its real resolution: no "zoom not supported" tiles, no
// pretending a 0.25-degree field has street-level detail.
const MAX_ZOOM = 7;
const MIN_ZOOM = 1;
const DEFAULT_ZOOM = 3;
const STEP_MS = 3 * 3_600_000;
// The free fallback source's label, also used to decide readout field gating.
const GRID_SOURCE = 'Open-Meteo';

let container: HTMLDivElement;
let mapHandle: ThemedMapHandle | undefined;
let getBounds: (() => Bbox) | undefined;
let recolor: ((next: Theme) => void) | undefined;
let layersView = $state<LayersView | undefined>();

let conditionsOpen = $state(false);
let playing = $state(false);
let playTimer: ReturnType<typeof setInterval> | undefined;
let fetchTimer: ReturnType<typeof setTimeout> | undefined;
let readout = $state<WeatherReadout | undefined>();
let readoutSource = $state<string | undefined>();
let readoutTimer: ReturnType<typeof setTimeout> | undefined;
// Each tap bumps this so a slow provider response from an earlier tap cannot overwrite a newer one.
let tapSeq = 0;

const items = $derived(layersView?.items ?? []);
const fills = $derived(items.filter((i) => WEATHER_FILL_IDS.includes(i.id)));
const overlayItems = $derived(items.filter((i) => !WEATHER_FILL_IDS.includes(i.id)));
const anyActive = $derived(items.some((i) => i.visible));
const wavesActive = $derived(items.some((i) => i.id === WEATHER_LAYER_IDS.waves && i.visible));
const radarActive = $derived(items.some((i) => i.id === WEATHER_LAYER_IDS.radar && i.visible));
const layerOn = (id: string): boolean => items.some((i) => i.id === id && i.visible);
const legends = $derived<WeatherLegend[]>(
  items
    .filter((i) => i.visible)
    .map((i) => weatherLegend(i.id, theme))
    .filter((l): l is WeatherLegend => l !== undefined),
);

const range = $derived<TimeRange | undefined>(
  store.grid && store.grid.times.length > 0
    ? {
        start: store.grid.times[0],
        end: store.grid.times[store.grid.times.length - 1],
        stepMs: STEP_MS,
      }
    : undefined,
);
const timeLabel = $derived(
  store.grid
    ? new Date(store.selectedTime).toLocaleString([], {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
);

function setTime(t: number): void {
  if (range) store.setSelectedTime(clampTime(t, range));
}

function stopPlay(): void {
  playing = false;
  if (playTimer) clearInterval(playTimer);
  playTimer = undefined;
}

function togglePlay(): void {
  if (playing || !range) {
    stopPlay();
    return;
  }
  playing = true;
  playTimer = setInterval(
    () => range && store.setSelectedTime(advancePlay(store.selectedTime, range)),
    700,
  );
}

// Fetch a forecast for the mini-map's own viewport, debounced. The loader fetches atmospheric data
// always, marine only when waves is on, and radar only when radar is on, so a wind-only view pulls
// nothing extra, and it caches by view so small pans reuse a recent fetch.
// 200 cells fits one Open-Meteo request (the per-request location cap), so a load is two calls
// (forecast plus marine) rather than six. The grid is coarse anyway, and fewer, smaller requests
// keep well under Open-Meteo's free-tier rate limit.
const FORECAST_OPTS = { maxCells: 200, forecastDays: 5 };
function scheduleFetch(): void {
  if (fetchTimer) clearTimeout(fetchTimer);
  fetchTimer = setTimeout(() => {
    if (!getBounds || !anyActive) return;
    void loader.load(store, getBounds(), FORECAST_OPTS, {
      waves: wavesActive,
      radar: radarActive,
    });
  }, 400);
}

function showReadout(value: WeatherReadout | undefined, source: string | undefined): void {
  readout = value;
  readoutSource = value ? source : undefined;
  if (readoutTimer) clearTimeout(readoutTimer);
  if (value) readoutTimer = setTimeout(() => (readout = undefined), 8000);
}

// Conditions at the tapped point for the selected time. Prefer the configured Signal K weather
// provider (observations when the selected time is near now, else the nearest point-forecast step),
// and fall back to the free grid sample. The provider answer is async, so a sequence guard drops a
// stale response from an earlier tap.
async function onTap(lng: number, lat: number): Promise<void> {
  const seq = ++tapSeq;
  if (providerName) {
    const value = await providerReadout(lat, lng);
    if (seq !== tapSeq) return;
    if (value) {
      showReadout(value, providerName);
      return;
    }
  }
  if (anyActive && store.grid) {
    showReadout(readoutAt(store.grid, lng, lat, store.bracket.lo), GRID_SOURCE);
  } else {
    showReadout(undefined, undefined);
  }
}

// In the readout, show a field when it came from the provider (which returns every point field) or
// when its layer is on. The grid carries all fields regardless of which is drawn, so for the free
// source it is gated to what is visualized.
const showField = (id: string): boolean => (readoutSource === GRID_SOURCE ? layerOn(id) : true);

const NEAR_NOW_MS = 90 * 60 * 1000;

async function providerReadout(lat: number, lon: number): Promise<WeatherReadout | undefined> {
  const origin = serverOrigin();
  const target = store.selectedTime;
  if (Math.abs(target - Date.now()) < NEAR_NOW_MS) {
    const obs = await fetchObservations(origin, lat, lon, token);
    const reading = obs && readoutFromSignalK(obs);
    if (reading) return reading;
  }
  const series = await fetchPointForecasts(origin, lat, lon, 48, token);
  const step = series && nearestInTime(series, target);
  return step ? readoutFromSignalK(step) : undefined;
}

const fmt = formatFixed;

// Refetch once when waves or radar is turned on, so the new source appears without a pan. Keyed on
// the rising edge with a plain flag so a failed fetch cannot loop.
function refetchOnEnable(isActive: () => boolean): void {
  let requested = false;
  $effect(() => {
    if (isActive() && !requested) {
      requested = true;
      scheduleFetch();
    } else if (!isActive()) {
      requested = false;
    }
  });
}
refetchOnEnable(() => wavesActive);
refetchOnEnable(() => radarActive);

// Fetch on first open if a layer is on but no grid is loaded yet.
$effect(() => {
  if (anyActive && !store.grid) scheduleFetch();
});

// Recolor when the theme prop changes; the initial recolor runs inline once the map loads.
$effect(() => {
  recolor?.(theme);
});

onMount(() => {
  mapHandle = createThemedMap({
    container,
    // The panel opens centered on the nav chart's current view, so the forecast is for the area you
    // are looking at; the zoom is capped to MAX_ZOOM by createThemedMap. It falls back to its own
    // remembered view only when the nav chart has not reported one yet.
    view: initialView ?? savedView,
    defaultZoom: DEFAULT_ZOOM,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    managerOptions: {
      saved: savedLayers,
      onChange: onLayersChange,
      // The area fills are mutually exclusive: one at a time so they do not stack into mud. Wind
      // arrows and pressure isobars stay freely combinable on top.
      exclusive: [WEATHER_FILL_IDS],
    },
    onView: (view) => onViewChange?.(view),
    onClick: (lngLat) => void onTap(lngLat.lng, lngLat.lat),
    onLoad: async ({ map, manager, recolor: recolorFn, isDestroyed, runTick }) => {
      // Band order, bottom to top: the waves height field sits at the bottom, then the precip,
      // cloud, and radar fills, with wind arrows and pressure isobars drawn over them.
      const overlays = [
        createWavesOverlay(store),
        createPrecipOverlay(store),
        createCloudOverlay(store),
        createRadarOverlay(store),
        createWindOverlay(store),
        createPressureOverlay(store),
      ];
      for (const overlay of overlays) {
        await manager.register(overlay);
        if (isDestroyed()) return;
      }

      const view = new LayersView(manager);
      view.refresh();
      layersView = view;

      recolor = recolorFn;
      recolor(theme);

      getBounds = () => boundsToBbox(map.getBounds());
      map.on('moveend', scheduleFetch);
      runTick(overlays);
    },
  });
});

onDestroy(() => {
  if (fetchTimer) clearTimeout(fetchTimer);
  if (readoutTimer) clearTimeout(readoutTimer);
  stopPlay();
  mapHandle?.destroy();
});
</script>

<section class="weather-panel" aria-label="Weather">
  <header class="panel-head">
    <span class="panel-title">Weather</span>
    <div class="layer-bar" role="group" aria-label="Weather layers">
      {#each fills as item (item.id)}
        <button
          type="button"
          class="pill"
          class:on={item.visible}
          aria-pressed={item.visible}
          onclick={() => layersView?.toggle(item.id, !item.visible)}
        >
          {item.title}
        </button>
      {/each}
      {#if fills.length > 0 && overlayItems.length > 0}
        <span class="bar-sep" aria-hidden="true"></span>
      {/if}
      {#each overlayItems as item (item.id)}
        <button
          type="button"
          class="pill"
          class:on={item.visible}
          aria-pressed={item.visible}
          onclick={() => layersView?.toggle(item.id, !item.visible)}
        >
          {item.title}
        </button>
      {/each}
    </div>
    <button
      type="button"
      class="pill"
      class:on={conditionsOpen}
      aria-pressed={conditionsOpen}
      onclick={() => (conditionsOpen = !conditionsOpen)}
    >
      Here
    </button>
    <button type="button" class="close" aria-label="Close weather" onclick={onClose}>
      <X size={18} aria-hidden="true" />
    </button>
  </header>

  <div class="panel-map">
    <div class="map" bind:this={container}></div>
    {#if conditionsOpen}
      <div class="conditions-slot">
        <WeatherConditions origin={serverOrigin()} {token} {providerName} {position} {store} />
      </div>
    {/if}
    {#if readout}
      <div class="readout" role="status" aria-live="polite">
        <span class="readout-line">
          Wind <b>{fmt(metersPerSecondToKnots(readout.speedMs), 1)}</b> kn from
          <b>{fmt(radiansToBearing(readout.fromRad), 0)}</b>&deg;
          {#if showField(WEATHER_LAYER_IDS.pressure) && readout.pressurePa !== undefined}
            &middot; <b>{fmt(pascalsToHectopascals(readout.pressurePa), 0)}</b> hPa
          {/if}
          {#if showField(WEATHER_LAYER_IDS.waves) && readout.waveHeightM !== undefined}
            &middot; sea <b>{fmt(readout.waveHeightM, 1)}</b> m
            {#if readout.wavePeriodS !== undefined}
              / <b>{fmt(readout.wavePeriodS, 1)}</b> s
            {/if}
          {/if}
          {#if (showField(WEATHER_LAYER_IDS.precip) || showField(WEATHER_LAYER_IDS.radar)) && readout.precipitationMm !== undefined && readout.precipitationMm >= 0.1}
            &middot; rain <b>{fmt(readout.precipitationMm, 1)}</b> mm/h
          {/if}
        </span>
        {#if readoutSource}
          <span class="readout-source">{readoutSource}</span>
        {/if}
      </div>
    {/if}
    {#if !anyActive}
      <p class="hint">Turn on a layer above to load weather for this area.</p>
    {/if}
  </div>

  <footer class="panel-foot">
    {#if range}
      <div class="scrubber" role="group" aria-label="Forecast time">
        <button
          type="button"
          class="step"
          aria-label="Earlier"
          onclick={() => setTime(stepTime(store.selectedTime, -1, range))}
        >
          &#9664;
        </button>
        <button
          type="button"
          class="step"
          aria-label={playing ? 'Pause' : 'Play'}
          onclick={togglePlay}
        >
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
          onclick={() => setTime(stepTime(store.selectedTime, 1, range))}
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
          oninput={(e) => setTime(Number(e.currentTarget.value))}
        >
        <span class="time">{timeLabel}</span>
      </div>
    {/if}
    {#if legends.length > 0}
      <div class="legend" role="group" aria-label="Weather legend">
        {#each legends as legend (legend.id)}
          <div class="legend-row">
            <span class="legend-title">{legend.title}</span>
            {#if legend.gradient}
              <span class="legend-scale">
                <span class="legend-end">{legend.lowLabel}</span>
                <span class="legend-bar" style="background:{legend.gradient}"></span>
                <span class="legend-end">{legend.highLabel}</span>
              </span>
            {:else if legend.swatches}
              <span class="legend-swatches">
                {#each legend.swatches as swatch (swatch.label)}
                  <span class="legend-swatch">
                    <span class="legend-chip" style="background:{swatch.color}"></span>
                    {swatch.label}
                  </span>
                {/each}
              </span>
            {/if}
            {#if legend.note}
              <span class="legend-note">{legend.note}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </footer>
</section>

<style>
.weather-panel {
  position: fixed;
  inset-block-end: 2.9rem;
  inset-inline: 0;
  margin-inline: auto;
  inline-size: min(94vw, 46rem);
  /* A definite height (not max-block-size) so the flex column resolves: the map fills the space
     between the header and footer. With only max-block-size the panel is shrink-to-fit, the map's
     percentage height collapses, and the MapLibre canvas renders blank. */
  block-size: min(74vh, 36rem);
  display: flex;
  flex-direction: column;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
  z-index: var(--z-panel);
  overflow: hidden;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem 0.4rem 0.7rem;
  border-block-end: 1px solid var(--border);
}
.panel-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--text-muted);
}
.layer-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  flex: 1;
}
.bar-sep {
  inline-size: 1px;
  align-self: stretch;
  margin-inline: 0.15rem;
  background: var(--border);
}
.pill {
  min-block-size: var(--control-size);
  padding: 0.15rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  color: var(--text-muted);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.pill.on {
  color: var(--accent);
  border-color: var(--accent);
}
.close {
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
.panel-map {
  position: relative;
  flex: 1 1 auto;
  min-block-size: 0;
}
/* Absolute fill rather than a percentage height, so the canvas always has real pixels regardless of
   how the flex parent resolves its height. */
.map {
  position: absolute;
  inset: 0;
}
.readout {
  position: absolute;
  inset-block-start: 0.5rem;
  inset-inline-start: 0.5rem;
  padding: 0.3rem 0.6rem;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
  font-size: var(--text-sm);
}
.readout b {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.readout-source {
  display: block;
  margin-block-start: 0.1rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.conditions-slot {
  position: absolute;
  inset-block: 0.5rem;
  inset-inline-end: 0.5rem;
  max-block-size: calc(100% - 1rem);
  display: flex;
}
.hint {
  position: absolute;
  inset-block-end: 0.6rem;
  inset-inline: 0.6rem;
  margin: 0;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.panel-foot {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.45rem 0.6rem;
  border-block-start: 1px solid var(--border);
}
.scrubber {
  display: flex;
  align-items: center;
  gap: 0.4rem;
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
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
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
.legend-scale {
  flex: 1;
  min-inline-size: 8rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.legend-end {
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}
.legend-bar {
  flex: 1;
  block-size: 0.55rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
}
.legend-note {
  flex-basis: 100%;
  font-size: var(--text-xs);
  font-style: italic;
  color: var(--text-muted);
}
</style>
