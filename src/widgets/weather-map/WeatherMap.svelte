<script lang="ts">
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Pause,
  Play,
  X,
} from '@lucide/svelte';
import { onDestroy, onMount } from 'svelte';
import { fly } from 'svelte/transition';
import type { UnitsStore } from '$entities/units';
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
  GRID_SOURCE_LABEL,
  NEAR_NOW_MS,
  nearestInTimeBounded,
  precipUnitLabel,
  RAIN_VISIBLE_MM_H,
  radarScrubbedAway,
  readoutAtBracket,
  readoutFromSignalK,
  stepTime,
  type TimeRange,
  WEATHER_FILL_ID_SET,
  WEATHER_FILL_IDS,
  WEATHER_LAYER_IDS,
  WeatherConditions,
  type WeatherLegend,
  type WeatherLoader,
  type WeatherReadout,
  weatherLegend,
} from '$features/weather';
import {
  Clock,
  formatBearingOr,
  formatClockTime,
  formatDayClock,
  formatFixed,
  formatKnotsOr,
  formatLengthOr,
  formatPrecipRateOr,
  formatPressureOr,
  HOUR_MS,
  lengthUnit,
  MINUTE_MS,
  prefersReducedMotion,
  pressureUnit,
} from '$shared/lib';
import { createThemedMap, type LayerSettings, type ThemedMapHandle } from '$shared/map';
import type { MapView } from '$shared/settings';
import { serverOrigin } from '$shared/signalk';
import { dialog, type Theme } from '$shared/ui';

interface Props {
  store: WeatherStore;
  // The shared, cached weather loader (Open-Meteo plus RainViewer), constructed in App.
  loader: WeatherLoader;
  theme: Theme;
  // The imperial-versus-metric display preference; wind stays in knots regardless.
  units: UnitsStore;
  // Where the nav chart is looking; the panel always opens there rather than keeping its own view.
  initialView?: MapView;
  // The panel's own weather-layer visibility, separate from the nav chart's layers.
  savedLayers?: LayerSettings;
  onLayersChange?: (settings: LayerSettings) => void;
  // Hands up a function that applies a full weather-layer snapshot to the mini-map at runtime, so a
  // profile switch updates the weather layers without remounting the panel.
  onLayersReady?: (apply: (settings: LayerSettings) => void) => void;
  // The Signal K auth token and the default weather provider's display name, when one is configured.
  // With a provider, the tap readout prefers it and falls back to the free grid; without one, the
  // grid answers. The area overlays and radar always use the free sources.
  token?: string;
  providerName?: string;
  // The vessel position, for the "Here" conditions panel.
  position?: { latitude: number; longitude: number };
  // Connectivity, so cached radar is labeled rather than passing as live.
  online?: boolean;
  // When supplied, a leading back button returns to the menu, matching the slide-over convention.
  onBack?: () => void;
  onClose: () => void;
}

const {
  store,
  loader,
  theme,
  units,
  initialView,
  savedLayers,
  onLayersChange,
  onLayersReady,
  token,
  providerName,
  position,
  online = true,
  onBack,
  onClose,
}: Props = $props();

// RainViewer radar tops out at zoom 7, and the Open-Meteo grid is coarse, so capping the mini-map
// zoom keeps every weather source within its real resolution: no "zoom not supported" tiles, no
// pretending a 0.25-degree field has street-level detail.
const MAX_ZOOM = 7;
const MIN_ZOOM = 1;
const DEFAULT_ZOOM = 3;
const STEP_MS = 3 * HOUR_MS;

// A bare Date.now() inside a $derived freezes for as long as its other dependencies hold still,
// so during a long open the stale-age note, the Past/Forecast label, and the now tick would stop
// tracking the wall clock. This coarse minute tick keeps them honest.
const clock = new Clock(MINUTE_MS);

let container: HTMLDivElement;
let mapHandle: ThemedMapHandle | undefined;
let getBounds: (() => Bbox) | undefined;
let recolor: ((next: Theme) => void) | undefined;
let layersView = $state<LayersView | undefined>();

let conditionsOpen = $state(false);
// A one-shot transient note when the user pinches into the zoom cap, so the wall reads as a data
// limit rather than a broken map.
let zoomNote = $state('');
let zoomNoteShown = false;
let zoomNoteTimer: ReturnType<typeof setTimeout> | undefined;

let playing = $state(false);
let playTimer: ReturnType<typeof setInterval> | undefined;
let fetchTimer: ReturnType<typeof setTimeout> | undefined;
let readout = $state<WeatherReadout | undefined>();
let readoutSource = $state<string | undefined>();
// A provider answer is pending and the grid had nothing to show meanwhile, so the tap must not
// look dead on a slow boat link.
let readoutPending = $state(false);
let readoutTimer: ReturnType<typeof setTimeout> | undefined;
// Each tap bumps this so a slow provider response from an earlier tap cannot overwrite a newer one.
let tapSeq = 0;

const items = $derived(layersView?.items ?? []);
const fills = $derived(items.filter((i) => WEATHER_FILL_ID_SET.has(i.id)));
const overlayItems = $derived(items.filter((i) => !WEATHER_FILL_ID_SET.has(i.id)));
const anyActive = $derived(items.some((i) => i.visible));
const wavesActive = $derived(items.some((i) => i.id === WEATHER_LAYER_IDS.waves && i.visible));
const radarActive = $derived(items.some((i) => i.id === WEATHER_LAYER_IDS.radar && i.visible));
const layerOn = (id: string): boolean => items.some((i) => i.id === id && i.visible);

// Surface the loader's status so opening the panel offline or during a rate-limit is honest rather
// than a blank or stale map with no explanation. A refetch over an existing grid stays quiet (the old
// forecast is still shown); only a first-load wait, a hard failure, or a stale fallback show a note.
// A grid missing its requested wave fields is qualified rather than passed off as complete.
const wavesMissing = $derived(wavesActive && !!store.grid?.partialWaves);
const statusNote = $derived.by<string>(() => {
  const wavesNote = wavesMissing ? ' (waves unavailable)' : '';
  switch (store.status) {
    case 'loading':
      return store.grid ? '' : 'Loading forecast';
    case 'error':
      return 'Weather unavailable: offline or rate limited';
    case 'stale': {
      const fetched = store.grid?.fetchedAt;
      const age = fetched === undefined ? undefined : Math.round((clock.now - fetched) / MINUTE_MS);
      return age === undefined
        ? `Showing last forecast${wavesNote}`
        : `Showing forecast fetched ${age} min ago${wavesNote}`;
    }
    default:
      return wavesNote ? `Showing forecast${wavesNote}` : '';
  }
});

// Radar can only show "now": when the slider is parked away from now the overlay hides itself
// (the same radarScrubbedAway predicate, so legend and layer cannot disagree), and the legend says
// so instead of leaving a silently missing layer.
const scrubbedAway = $derived(radarScrubbedAway(store.selectedTime, clock.now));
// The painted frame's valid time, fed by the radar overlay (a callback, not store state).
let radarFrameTime = $state<number | undefined>();
const radarNote = $derived.by<string>(() => {
  if (scrubbedAway) return 'shows now only, hidden while the slider is off now';
  if (!online) return 'cached radar (offline), not live';
  if (radarFrameTime === undefined) return 'radar with short-term nowcast, regional resolution';
  const dMin = Math.round((radarFrameTime - clock.now) / MINUTE_MS);
  const rel = dMin === 0 ? 'now' : dMin > 0 ? `+${dMin} min (nowcast)` : `${dMin} min`;
  return `frame ${rel} · short-term nowcast`;
});
// Keyed on items, theme, and the unit mode only: the live radar note is substituted at render
// time, so the 600 ms frame beat updates one text node instead of rebuilding every legend gradient.
const legends = $derived<WeatherLegend[]>(
  items
    .filter((i) => i.visible)
    .map((i) => weatherLegend(i.id, theme, units.mode))
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
// The label carries the zone (the shared formatDayClock rationale) and whether the slider sits in
// the already-elapsed part of the series.
const timeLabel = $derived(store.grid ? formatDayClock(store.selectedTime, { zone: true }) : '');
const timeKind = $derived(store.selectedTime < clock.now - STEP_MS / 2 ? 'Past' : 'Forecast');
// Where "now" sits on the slider track, for the tick that separates past from forecast.
const nowFrac = $derived.by<number | undefined>(() => {
  if (!range || range.end <= range.start) return undefined;
  const f = (clock.now - range.start) / (range.end - range.start);
  return f >= 0 && f <= 1 ? f : undefined;
});

function setTime(t: number): void {
  // A manual scrub or step takes the wheel: the play timer must not yank the thumb back.
  stopPlay();
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

const READOUT_DISMISS_MS = 8000;
// The pointer or focus is parked on the readout, so nothing (not even a provider upgrade landing
// mid-read) may arm the dismiss timer until it leaves.
let readoutHeld = false;

function clearReadoutTimer(): void {
  if (readoutTimer) clearTimeout(readoutTimer);
  readoutTimer = undefined;
}

function showReadout(value: WeatherReadout | undefined, source: string | undefined): void {
  clearReadoutTimer();
  readout = value;
  readoutSource = value ? source : undefined;
  if (value && !readoutHeld) readoutTimer = setTimeout(dismissReadout, READOUT_DISMISS_MS);
}

function dismissReadout(): void {
  clearReadoutTimer();
  readout = undefined;
  readoutSource = undefined;
  readoutPending = false;
}

// A slow reader must not lose the readout mid-read: hovering or focusing it parks the dismiss
// timer, leaving restarts it.
function holdReadout(): void {
  readoutHeld = true;
  clearReadoutTimer();
}

function releaseReadout(): void {
  readoutHeld = false;
  if (readout && !readoutTimer) readoutTimer = setTimeout(dismissReadout, READOUT_DISMISS_MS);
}

// Conditions at the tapped point for the selected time. The free-grid sample (blended across the
// time bracket, exactly as the fields are drawn) shows IMMEDIATELY; a configured provider then
// upgrades it when it answers, so a slow boat link never leaves the tap looking dead.
async function onTap(lng: number, lat: number): Promise<void> {
  const seq = ++tapSeq;
  const gridSample =
    anyActive && store.grid ? readoutAtBracket(store.grid, lng, lat, store.bracket) : undefined;
  if (!providerName) {
    showReadout(gridSample, gridSample ? GRID_SOURCE_LABEL : undefined);
    return;
  }
  if (gridSample) showReadout(gridSample, GRID_SOURCE_LABEL);
  else readoutPending = true;
  const value = await providerReadout(lat, lng);
  if (seq !== tapSeq) return;
  readoutPending = false;
  if (value) showReadout(value, providerName);
  else if (!gridSample) dismissReadout();
}

// In the readout, show a field when it came from the provider (which returns every point field) or
// when its layer is on. The grid carries all fields regardless of which is drawn, so for the free
// source it is gated to what is visualized.
const showField = (id: string): boolean =>
  readoutSource === GRID_SOURCE_LABEL ? layerOn(id) : true;

async function providerReadout(lat: number, lon: number): Promise<WeatherReadout | undefined> {
  const origin = serverOrigin();
  const target = store.selectedTime;
  if (Math.abs(target - Date.now()) < NEAR_NOW_MS) {
    const obs = await fetchObservations(origin, lat, lon, token);
    const reading = obs && readoutFromSignalK(obs);
    if (reading) return reading;
  }
  // Bounded: past the provider's horizon its last step must not answer for a time days away; the
  // caller falls back to the grid sample instead.
  const series = await fetchPointForecasts(origin, lat, lon, 48, token);
  const step = series && nearestInTimeBounded(series, target);
  return step ? readoutFromSignalK(step) : undefined;
}

// Refetch once when waves or radar is turned on, so the new source appears without a pan. Keyed on
// the rising edge with a plain flag so a failed fetch cannot loop. This creates a $effect, so it MUST
// be called synchronously during component setup (as below), never inside a branch or callback, or
// the effect would be created outside the setup phase and Svelte would error.
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
    // are looking at; the zoom is capped to MAX_ZOOM by createThemedMap.
    view: initialView,
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
    onClick: (lngLat) => void onTap(lngLat.lng, lngLat.lat),
    onLoad: async ({ map, manager, recolor: recolorFn, isDestroyed, runTick }) => {
      // Band order, bottom to top: the waves height field sits at the bottom, then the precip,
      // cloud, and radar fills, with wind arrows and pressure isobars drawn over them.
      const overlays = [
        createWavesOverlay(store),
        createPrecipOverlay(store),
        createCloudOverlay(store),
        createRadarOverlay(store, undefined, undefined, (t) => (radarFrameTime = t)),
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
      // The weather mini-map has no user-reorder UI, so it carries no stacking order: the empty order
      // is intentional, not an oversight. The nav chart, which does reorder, applies layers through
      // MapCommands.applyLayers instead.
      onLayersReady?.((settings) => {
        manager.applySnapshot(settings, []);
        view.refresh();
      });

      recolor = recolorFn;
      recolor(theme);

      getBounds = () => boundsToBbox(map.getBounds());
      map.on('moveend', scheduleFetch);
      // Pinching into the cap reads as a broken map without a word of explanation, once per open.
      map.on('zoomend', () => {
        if (zoomNoteShown || map.getZoom() < MAX_ZOOM - 0.05) return;
        zoomNoteShown = true;
        zoomNote = 'Zoom is capped at the weather data resolution';
        zoomNoteTimer = setTimeout(() => (zoomNote = ''), 5000);
      });
      // The keyboard path to the point readout: Enter on the focused map canvas samples the center
      // (a tap needs a pointer; the canvas is focusable via MapLibre's keyboard support).
      map.getCanvas().addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const center = map.getCenter();
        void onTap(center.lng, center.lat);
      });
      runTick(overlays);
    },
  });
});

onDestroy(() => {
  clock.dispose();
  if (fetchTimer) clearTimeout(fetchTimer);
  if (readoutTimer) clearTimeout(readoutTimer);
  if (zoomNoteTimer) clearTimeout(zoomNoteTimer);
  stopPlay();
  mapHandle?.destroy();
});
</script>

<section
  class="weather-panel"
  id="weather-panel"
  aria-label="Weather"
  tabindex="-1"
  use:dialog={onClose}
  transition:fly={{ y: 20, duration: prefersReducedMotion() ? 0 : 180, opacity: 0.3 }}
>
  <header class="panel-header panel-head">
    {#if onBack}
      <button
        type="button"
        class="icon-btn icon-btn--accent"
        aria-label="Back to menu"
        title="Back to menu"
        onclick={onBack}
      >
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
    {/if}
    <h2 class="panel-title">Weather</h2>
    <div class="layer-bar" role="group" aria-label="Weather layers">
      {#each fills as item (item.id)}
        <button
          type="button"
          class="btn btn-pill btn-compact"
          class:is-on={item.visible}
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
          class="btn btn-pill btn-compact"
          class:is-on={item.visible}
          aria-pressed={item.visible}
          onclick={() => layersView?.toggle(item.id, !item.visible)}
        >
          {item.title}
        </button>
      {/each}
    </div>
    <!-- The separator and caret set the "Here" disclosure apart from the layer toggles it sits
         beside: it opens a panel, they switch map layers. -->
    <span class="bar-sep" aria-hidden="true"></span>
    <button
      type="button"
      class="btn btn-pill btn-compact here-btn"
      class:is-on={conditionsOpen}
      aria-expanded={conditionsOpen}
      aria-controls={conditionsOpen ? 'weather-conditions' : undefined}
      onclick={() => (conditionsOpen = !conditionsOpen)}
    >
      Here
      {#if conditionsOpen}
        <ChevronUp size={14} aria-hidden="true" />
      {:else}
        <ChevronDown size={14} aria-hidden="true" />
      {/if}
    </button>
    <button type="button" class="panel-close" aria-label="Close weather" onclick={onClose}>
      <X size={18} aria-hidden="true" />
    </button>
  </header>

  <div class="panel-map">
    <div class="map" bind:this={container}></div>
    <!-- One column for the floating notes so the readout and a status note stack instead of
         overlapping, on any width. Both containers stay mounted so the live regions announce
         reliably (a region inserted together with its content is skipped by some screen readers). -->
    <div class="map-notes">
      <div
        class="map-note map-note--readout"
        class:show={!!readout || readoutPending}
        role="status"
        onpointerenter={holdReadout}
        onpointerleave={releaseReadout}
        onfocusin={holdReadout}
        onfocusout={releaseReadout}
      >
        {#if readout}
          <span class="readout-line">
            Wind <b>{formatKnotsOr(readout.speedMs, 0)}</b> kn from
            <b>{formatBearingOr(readout.fromRad)}</b>&deg;T
            {#if readout.gustMs !== undefined}
              gust <b>{formatKnotsOr(readout.gustMs, 0)}</b> kn
            {/if}
            {#if showField(WEATHER_LAYER_IDS.pressure) && readout.pressurePa !== undefined}
              &middot; <b>{formatPressureOr(readout.pressurePa, units.mode)}</b>
              {pressureUnit(units.mode)}
            {/if}
            {#if showField(WEATHER_LAYER_IDS.waves) && readout.waveHeightM !== undefined}
              &middot; waves <b>{formatLengthOr(readout.waveHeightM, units.mode)}</b>
              {lengthUnit(units.mode)}
              {#if readout.wavePeriodS !== undefined}
                / <b>{formatFixed(readout.wavePeriodS, 1)}</b> s
              {/if}
              {#if readout.waveFromRad !== undefined}
                from <b>{formatBearingOr(readout.waveFromRad)}</b>&deg;T
              {/if}
            {/if}
            {#if (showField(WEATHER_LAYER_IDS.precip) || showField(WEATHER_LAYER_IDS.radar)) && readout.precipitationMm !== undefined && readout.precipitationMm >= RAIN_VISIBLE_MM_H}
              &middot; rain <b>{formatPrecipRateOr(readout.precipitationMm, units.mode)}</b>
              {precipUnitLabel(readout.precipIsRate, units.mode)}
            {/if}
          </span>
          {#if readoutSource}
            <span class="readout-source">{readoutSource}</span>
          {/if}
          <button
            type="button"
            class="readout-close"
            aria-label="Dismiss readout"
            onclick={dismissReadout}
          >
            <X size={14} aria-hidden="true" />
          </button>
        {:else if readoutPending}
          <span class="readout-line">Fetching conditions</span>
        {/if}
      </div>
      <div class="map-note map-note--status" class:show={!!statusNote || !!zoomNote} role="status">
        {statusNote || zoomNote}
      </div>
    </div>
    {#if conditionsOpen}
      <div
        class="conditions-slot"
        id="weather-conditions"
        role="region"
        aria-label="Conditions and forecast"
      >
        <WeatherConditions
          origin={serverOrigin()}
          {token}
          {providerName}
          {position}
          {store}
          {units}
        />
      </div>
    {/if}
    {#if !anyActive}
      <p class="hint">Turn on a layer above to load weather for this area.</p>
    {/if}
  </div>

  <footer class="panel-foot">
    {#if range}
      <div class="scrubber" role="group" aria-label="Forecast playback">
        <button
          type="button"
          class="icon-btn step"
          aria-label="Earlier"
          onclick={() => setTime(stepTime(store.selectedTime, -1, range))}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="icon-btn step"
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
          class="icon-btn step"
          aria-label="Later"
          onclick={() => setTime(stepTime(store.selectedTime, 1, range))}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <span class="track-wrap">
          <input
            class="track range"
            type="range"
            min={range.start}
            max={range.end}
            step={range.stepMs}
            value={store.selectedTime}
            aria-label="Forecast time"
            aria-valuetext="{timeKind} {timeLabel}"
            oninput={(e) => setTime(Number(e.currentTarget.value))}
          >
          {#if nowFrac !== undefined}
            <!-- The now tick: everything left of it already happened. -->
            <span
              class="now-tick"
              style="inset-inline-start: {nowFrac * 100}%"
              aria-hidden="true"
            ></span>
          {/if}
        </span>
        <span class="time">{timeKind} &middot; {timeLabel}</span>
        <!-- Announce manual time changes (the visible label is too chatty to be live during
             playback, so the mirror empties while playing). -->
        <span class="visually-hidden" role="status">{playing ? '' : timeLabel}</span>
      </div>
    {/if}
    {#if legends.length > 0}
      <div class="legend" role="group" aria-label="Weather legend">
        {#each legends as legend (legend.id)}
          <div class="legend-row">
            <span class="legend-title caps-label">{legend.title}</span>
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
              <!-- The radar note is live (which frame the loop paints, or why it is hidden),
                   substituted here so its 600 ms beat touches one text node, not the legends. -->
              <span class="legend-note">
                {legend.id === WEATHER_LAYER_IDS.radar ? radarNote : legend.note}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    {#if store.grid?.fetchedAt}
      <!-- Provenance, not licensing: which source produced the fields and how old they are. -->
      <p class="provenance">
        {GRID_SOURCE_LABEL}
        &middot; fetched {formatClockTime(store.grid.fetchedAt)}
      </p>
    {/if}
  </footer>
</section>

<style>
.weather-panel {
  position: fixed;
  /* Sit just above the status strip, whose min-block-size is calc(--control-size + --space-2), using
     the same expression so the panel cannot drift out of sync with the strip it clears. */
  inset-block-end: calc(var(--control-size) + var(--space-2));
  inset-inline: 0;
  margin-inline: auto;
  inline-size: min(94vw, 46rem);
  /* A definite height (not max-block-size) so the flex column resolves: the map fills the space
     between the header and footer. With only max-block-size the panel is shrink-to-fit, the map's
     percentage height collapses, and the MapLibre canvas renders blank. */
  block-size: var(--weather-panel-height);
  display: flex;
  flex-direction: column;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg), var(--edge-light);
  color: var(--text);
  /* One above the edge-docked panels so the weather panel, which can be opened while a panel is up,
     sits cleanly on top instead of relying on DOM order against an equal z-index. */
  z-index: calc(var(--z-panel) + 1);
  overflow: hidden;
}
/* On the global .panel-header frame, denser than the slide-over panels so the pill bar fits: a
   shorter block padding, and the close button keeps its tighter end inset. */
.panel-head {
  padding-block: 0.4rem;
  padding-inline-end: var(--space-2);
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
  margin-inline: var(--space-1);
  background: var(--border);
}
.here-btn {
  gap: var(--space-1);
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
/* The floating notes stack in one top column (readout, then status note) so they can never overlap,
   and stay mounted for reliable live-region announcement; an empty note is invisible and inert. */
.map-notes {
  position: absolute;
  inset-block-start: var(--space-2);
  inset-inline: var(--space-2);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  pointer-events: none;
}
/* The floating-pill frame shared by the point readout and the status note, hidden until it has
   something to say. The status modifier is the small centered note that explains an offline open,
   a rate-limited fetch, a stale fallback, or the zoom cap rather than reading as a blank or
   silently outdated map; the readout modifier carries the tapped-point conditions. */
.map-note {
  max-inline-size: calc(100% - var(--space-4));
  padding: 0.3rem 0.6rem;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-overlay);
  font-size: var(--text-sm);
  opacity: 0;
}
.map-note.show {
  opacity: 1;
  pointer-events: auto;
}
.map-note--status {
  align-self: center;
  color: var(--text-muted);
  text-align: center;
}
.map-note--readout {
  position: relative;
  padding-inline-end: var(--space-5);
  color: var(--text);
}
.map-note--readout b {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.readout-source {
  display: block;
  margin-block-start: 0.1rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.readout-close {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1);
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.readout-close:hover {
  color: var(--text);
}
.conditions-slot {
  position: absolute;
  inset-block: var(--space-2);
  inset-inline-end: var(--space-2);
  max-block-size: calc(100% - 2 * var(--space-2));
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
.legend {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.legend-title {
  flex: 0 0 6.5rem;
}
.legend-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.legend-swatch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
/* The chip and bar are element sizes, not spacing, so they stay literals off the --space scale. */
.legend-chip {
  inline-size: 0.85rem;
  block-size: 0.85rem;
  border-radius: var(--radius-sm);
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
  font-family: var(--font-mono);
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
.provenance {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
@media (max-width: 600px) {
  /* On a phone the layer toggles scroll on one row rather than wrapping three rows tall and eating
     the small map area; the edge fade says there is more to scroll to. */
  .layer-bar {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: thin;
    mask-image: linear-gradient(to right, black calc(100% - 1.25rem), transparent);
  }
  /* The "Here" conditions become a full-width bottom sheet instead of a 15rem card covering most of
     the small map, lifted clear of the map attribution line. */
  .conditions-slot {
    inset-block: auto;
    inset-block-end: var(--space-6);
    inset-inline: var(--space-2);
  }
}
</style>
