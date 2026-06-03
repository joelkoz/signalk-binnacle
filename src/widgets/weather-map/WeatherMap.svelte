<script lang="ts">
import { Pause, Play, X } from '@lucide/svelte';
import maplibregl from 'maplibre-gl';
import { onDestroy, onMount } from 'svelte';
import type { Bbox, WeatherStore } from '$entities/weather';
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
  fetchForecast,
  fetchMarine,
  fetchRadar,
  mergeMarine,
  readoutAt,
  stepTime,
  type TimeRange,
  WEATHER_FILL_IDS,
  type WeatherLegend,
  type WeatherReadout,
  weatherLegend,
} from '$features/weather';
import {
  metersPerSecondToKnots,
  PLACEHOLDER,
  pascalsToHectopascals,
  radiansToBearing,
} from '$shared/lib';
import {
  applyBaseTheme,
  baseStyleUrl,
  beforeIdFor,
  captureBaseTheme,
  installSentinels,
  LayerManager,
  type LayerSettings,
  mapThemePaint,
  type OverlayContext,
  restoreBaseTheme,
} from '$shared/map';
import type { MapView } from '$shared/settings';
import type { Theme } from '$shared/ui';

interface Props {
  store: WeatherStore;
  theme: Theme;
  // Where the nav chart is looking, used the first time the panel opens.
  initialView?: MapView;
  // The panel's own remembered view, and a sink to persist it.
  savedView?: MapView;
  onViewChange?: (view: MapView) => void;
  // The panel's own weather-layer visibility, separate from the nav chart's layers.
  savedLayers?: LayerSettings;
  onLayersChange?: (settings: LayerSettings) => void;
  onClose: () => void;
}

const {
  store,
  theme,
  initialView,
  savedView,
  onViewChange,
  savedLayers,
  onLayersChange,
  onClose,
}: Props = $props();

// RainViewer radar tops out at zoom 7, and the Open-Meteo grid is coarse, so capping the mini-map
// zoom keeps every weather source within its real resolution: no "zoom not supported" tiles, no
// pretending a 0.25-degree field has street-level detail.
const MAX_ZOOM = 7;
const MIN_ZOOM = 1;
const DEFAULT_CENTER: [number, number] = [0, 30];
const DEFAULT_ZOOM = 3;
const STEP_MS = 3 * 3_600_000;

let container: HTMLDivElement;
let map: maplibregl.Map | undefined;
let recolor: ((next: Theme) => void) | undefined;
let resizeObserver: ResizeObserver | undefined;
let layersView = $state<LayersView | undefined>();
let frame = 0;
let destroyed = false;

let playing = $state(false);
let playTimer: ReturnType<typeof setInterval> | undefined;
let fetchTimer: ReturnType<typeof setTimeout> | undefined;
let readout = $state<WeatherReadout | undefined>();
let readoutTimer: ReturnType<typeof setTimeout> | undefined;

const items = $derived(layersView?.items ?? []);
const fills = $derived(items.filter((i) => WEATHER_FILL_IDS.includes(i.id)));
const overlayItems = $derived(items.filter((i) => !WEATHER_FILL_IDS.includes(i.id)));
const anyActive = $derived(items.some((i) => i.visible));
const wavesActive = $derived(items.some((i) => i.id === 'weather-waves' && i.visible));
const radarActive = $derived(items.some((i) => i.id === 'weather-radar' && i.visible));
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

// Fetch a forecast for the mini-map's own viewport, debounced. Atmospheric always; marine only
// when waves is on and radar only when radar is on, so a wind-only view pulls nothing extra.
function scheduleFetch(): void {
  if (fetchTimer) clearTimeout(fetchTimer);
  fetchTimer = setTimeout(async () => {
    if (!map || !anyActive) return;
    const b = map.getBounds();
    const bounds: Bbox = {
      west: b.getWest(),
      south: b.getSouth(),
      east: b.getEast(),
      north: b.getNorth(),
    };
    store.setStatus('loading');
    const opts = { maxCells: 600, forecastDays: 5 };
    const [grid, marine, radar] = await Promise.all([
      fetchForecast(bounds, opts),
      wavesActive ? fetchMarine(bounds, opts) : Promise.resolve(undefined),
      radarActive ? fetchRadar() : Promise.resolve(undefined),
    ]);
    if (grid) store.setGrid(marine ? mergeMarine(grid, marine) : grid);
    else store.setStatus(store.grid ? 'stale' : 'error');
    if (radar) store.setRadar(radar);
  }, 400);
}

function onTap(lng: number, lat: number): void {
  if (!anyActive || !store.grid) {
    readout = undefined;
    return;
  }
  readout = readoutAt(store.grid, lng, lat, store.bracket.lo);
  if (readoutTimer) clearTimeout(readoutTimer);
  if (readout) readoutTimer = setTimeout(() => (readout = undefined), 8000);
}

const fmt = (value: number | undefined, digits: number): string =>
  value === undefined ? PLACEHOLDER : value.toFixed(digits);

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
  // The panel opens at its own remembered view, or the nav chart's current view the first time.
  // A one-time snapshot, not reactive: panning the panel must not be overridden by chart moves.
  const startView = savedView ?? initialView;
  try {
    map = new maplibregl.Map({
      container,
      style: baseStyleUrl(),
      center: startView ? [startView.lon, startView.lat] : DEFAULT_CENTER,
      zoom: Math.min(startView ? startView.zoom : DEFAULT_ZOOM, MAX_ZOOM),
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: { compact: true },
    });
  } catch (error) {
    console.error('Weather map failed to initialize', error);
    return;
  }

  const mapInstance = map;
  resizeObserver = new ResizeObserver(() => mapInstance.resize());
  resizeObserver.observe(container);

  let viewPending = false;
  const emitView = () => {
    if (viewPending) return;
    viewPending = true;
    requestAnimationFrame(() => {
      viewPending = false;
      if (destroyed) return;
      const center = mapInstance.getCenter();
      onViewChange?.({ lat: center.lat, lon: center.lng, zoom: mapInstance.getZoom() });
    });
  };
  mapInstance.on('move', emitView);
  mapInstance.on('moveend', scheduleFetch);
  mapInstance.on('click', (e) => onTap(e.lngLat.lng, e.lngLat.lat));

  mapInstance.on('load', async () => {
    const ctx: OverlayContext = { map: mapInstance, beforeIdFor };
    installSentinels(mapInstance);
    const manager = new LayerManager(ctx, {
      saved: savedLayers,
      onChange: onLayersChange,
      // The area fills are mutually exclusive: one at a time so they do not stack into mud. Wind
      // arrows and pressure isobars stay freely combinable on top.
      exclusive: [WEATHER_FILL_IDS],
    });

    // Waves first so the height field sits at the bottom of the band, with wind and pressure over it.
    const wavesOverlay = createWavesOverlay(store);
    await manager.register(wavesOverlay);
    if (destroyed) return;
    const precipOverlay = createPrecipOverlay(store);
    await manager.register(precipOverlay);
    if (destroyed) return;
    const cloudOverlay = createCloudOverlay(store);
    await manager.register(cloudOverlay);
    if (destroyed) return;
    const radarOverlay = createRadarOverlay(store);
    await manager.register(radarOverlay);
    if (destroyed) return;
    const windOverlay = createWindOverlay(store);
    await manager.register(windOverlay);
    if (destroyed) return;
    const pressureOverlay = createPressureOverlay(store);
    await manager.register(pressureOverlay);
    if (destroyed) return;

    const view = new LayersView(manager);
    view.refresh();
    layersView = view;

    const baseColors = captureBaseTheme(mapInstance, mapThemePaint('day'));
    recolor = (next: Theme) => {
      const paint = mapThemePaint(next);
      if (next === 'day') restoreBaseTheme(mapInstance, baseColors);
      else applyBaseTheme(mapInstance, paint);
      manager.applyTheme(paint);
    };
    recolor(theme);

    const tick = () => {
      wavesOverlay.sync(ctx);
      precipOverlay.sync(ctx);
      cloudOverlay.sync(ctx);
      radarOverlay.sync(ctx);
      windOverlay.sync(ctx);
      pressureOverlay.sync(ctx);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
});

onDestroy(() => {
  destroyed = true;
  if (frame) cancelAnimationFrame(frame);
  if (fetchTimer) clearTimeout(fetchTimer);
  if (readoutTimer) clearTimeout(readoutTimer);
  stopPlay();
  resizeObserver?.disconnect();
  map?.remove();
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
    <button type="button" class="close" aria-label="Close weather" onclick={onClose}>
      <X size={18} aria-hidden="true" />
    </button>
  </header>

  <div class="panel-map">
    <div class="map" bind:this={container}></div>
    {#if readout}
      <div class="readout" role="status" aria-live="polite">
        Wind <b>{fmt(metersPerSecondToKnots(readout.speedMs), 0)}</b> kn from
        <b>{fmt(radiansToBearing(readout.fromRad), 0)}</b>&deg;
        {#if layerOn('weather-pressure') && readout.pressurePa !== undefined}
          &middot; <b>{fmt(pascalsToHectopascals(readout.pressurePa), 0)}</b> hPa
        {/if}
        {#if layerOn('weather-waves') && readout.waveHeightM !== undefined}
          &middot; sea <b>{fmt(readout.waveHeightM, 1)}</b> m
          {#if readout.wavePeriodS !== undefined}
            / <b>{fmt(readout.wavePeriodS, 0)}</b> s
          {/if}
        {/if}
        {#if (layerOn('weather-precip') || layerOn('weather-radar')) && readout.precipitationMm !== undefined && readout.precipitationMm >= 0.1}
          &middot; rain <b>{fmt(readout.precipitationMm, 1)}</b> mm/h
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
  max-block-size: min(74vh, 36rem);
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
  min-block-size: 14rem;
}
.map {
  inline-size: 100%;
  block-size: 100%;
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
