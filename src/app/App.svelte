<script lang="ts">
import {
  CloudSun,
  Layers,
  LocateFixed,
  Navigation,
  SlidersHorizontal,
  Spline,
  Volume2,
  VolumeX,
} from '@lucide/svelte';
import { onDestroy, onMount } from 'svelte';
import { AisTargets } from '$entities/ais';
import { CollisionAssessment } from '$entities/collision';
import { type TrackPoint, TrackRecorder } from '$entities/track';
import { type UserChartSource, UserCharts, userChartToSignalK } from '$entities/user-charts';
import { OwnVessel } from '$entities/vessel';
import { WeatherStore } from '$entities/weather';
import { AuthBanner } from '$features/auth-banner';
import { LayersPanel, type LayersView, LayerToggle } from '$features/layers-panel';
import { CollisionNotifier, DangerStrip, LookoutAlarm, ThresholdsPanel } from '$features/lookout';
import { AppMenu, type MenuItem, MenuSubmenu } from '$features/menu';
import {
  createNoteDetailLoader,
  type NoteDetailLoader,
  NoteDetailPanel,
  type NoteSelection,
} from '$features/notes';
import { ThemeToggle } from '$features/theme-toggle';
import type { SavedTracksSource } from '$features/track-layer';
import {
  deleteTrack,
  downloadGeoJson,
  fetchSavedTracks,
  type SavedTrack,
  savedTracksToFeatures,
  saveTrack,
  TracksPanel,
} from '$features/tracks';
import {
  fetchForecast,
  fetchMarine,
  fetchRadar,
  mergeMarine,
  readoutAt,
  type WeatherLegend,
  type WeatherReadout,
  WeatherTimeControl,
  weatherLegend,
} from '$features/weather';
import {
  formatLatitude,
  formatLongitude,
  metersPerSecondToKnots,
  PLACEHOLDER,
  pascalsToHectopascals,
  radiansToBearing,
} from '$shared/lib';
import type { LayerSettings } from '$shared/map';
import { OnlineStatus, registerPwa } from '$shared/pwa';
import {
  createMapView,
  createThresholds,
  createTrackSettings,
  isMapView,
  type MapView,
  PersistedValue,
} from '$shared/settings';
import type { ConnectionPhase, Context } from '$shared/signalk';
import {
  AuthController,
  createSignalKClient,
  SELF_CONTEXT,
  SignalKStore,
  SK_PATHS,
  serverOrigin,
  streamUrl,
} from '$shared/signalk';
import { createPmtilesStore, createTrackStore } from '$shared/storage';
import { createThemeController, type Theme } from '$shared/ui';
import { ChartCanvas, type MapCommands, type UserChartRegistrar } from '$widgets/chart-canvas';

const ALL_VESSELS = 'vessels.*' as Context;

const store = new SignalKStore();
const vessel = new OwnVessel(store);
const aisTargets = new AisTargets(store);
const client = createSignalKClient();
const auth = new AuthController(serverOrigin());
const net = new OnlineStatus();
const thresholds = createThresholds();
const collision = new CollisionAssessment(vessel, aisTargets, thresholds);
const lookoutAlarm = new LookoutAlarm();
const alarmMuted = new PersistedValue<boolean>('binnacle:alarm-muted', false);
// Publish the collision alert to Signal K so other clients and devices share it.
const collisionNotifier = new CollisionNotifier(
  (path, value) =>
    void client.publish({ context: SELF_CONTEXT, updates: [{ values: [{ path, value }] }] }),
);

// Track recording: client-side from navigation.position, persisted whole-voyage in IndexedDB.
const trackSettings = createTrackSettings();
const recorder = new TrackRecorder(trackSettings, createTrackStore<TrackPoint>());

// Weather forecast, fetched browser-side from Open-Meteo for the viewport when a weather layer is on.
const weather = new WeatherStore();

// Saved tracks fetched from /resources/tracks, and the subset the user has chosen to show on
// the chart. The overlay polls savedSource each frame, so a version counter signals changes.
let savedTracks = $state<SavedTrack[]>([]);
let shownSaved = $state<ReadonlySet<string>>(new Set());
let savedVersion = 0;
const savedSource: SavedTracksSource = {
  version: () => savedVersion,
  features: () => savedTracksToFeatures(savedTracks, shownSaved),
};

let layersView = $state<LayersView | undefined>();
let layersPanelOpen = $state(false);
let recolorMap: ((theme: Theme) => void) | undefined;
let chartsToken = $state<string | undefined>();

// The selected POI and a cache-owning detail loader, both set once auth resolves.
let selectedNote = $state<NoteSelection | undefined>();
let noteLoader = $state<NoteDetailLoader | undefined>();
let mapView = $state<MapView | undefined>();
let updateReady = $state(false);
const pwa = registerPwa(() => (updateReady = true));

const theme = createThemeController((next) => recolorMap?.(next));

// Profile state restored across visits: the last map view and the layer settings.
const mapViewStore = createMapView();
const savedView = isMapView(mapViewStore.value) ? mapViewStore.value : undefined;
const layerSettings = new PersistedValue<LayerSettings>('binnacle:layers', {});
const layerOrder = new PersistedValue<string[]>('binnacle:layer-order', []);

// User-imported PMTiles charts: the descriptor list is persisted, the files live in the browser
// PMTiles store, and the chart-canvas registers an overlay per source.
const pmtilesStore = createPmtilesStore();
const userChartsStore = new PersistedValue<UserChartSource[]>('binnacle:user-charts', []);
const userCharts = new UserCharts(pmtilesStore, userChartsStore.value, (sources) =>
  userChartsStore.set(sources),
);
let userChartRegistrar = $state<UserChartRegistrar | undefined>();
const registeredUserCharts = new Map<string, string | undefined>();

// The view changes once per animation frame while panning; persist only after it
// settles so a drag is one write, not hundreds.
let viewSaveTimer: ReturnType<typeof setTimeout> | undefined;
function onViewChange(view: MapView): void {
  mapView = view;
  if (viewSaveTimer) clearTimeout(viewSaveTimer);
  viewSaveTimer = setTimeout(() => mapViewStore.set(view), 400);
  if (weatherActive) scheduleWeather();
}

let mapCommands = $state<MapCommands | undefined>();

// Follow lock: while on, the map recenters on the boat as each fix arrives. A manual pan
// (dragging the chart) releases it; it does not persist across reloads.
let following = $state(false);

// Every weather-band layer, for the menu's Weather section toggles (regardless of visibility); the
// active state, the marine gate, and the legends all derive from this one scan of the layer list.
const weatherLayers = $derived((layersView?.items ?? []).filter((i) => i.band === 'weather'));
// True when any weather layer is on, which gates the forecast fetch and the Forecast control.
const weatherActive = $derived(weatherLayers.some((i) => i.visible));
// True when the waves layer specifically is on, which gates the extra marine fetch so wind-only or
// pressure-only viewing does not pull wave data it will not draw.
const wavesActive = $derived(weatherLayers.some((i) => i.id === 'weather-waves' && i.visible));
// True when the radar layer is on, which gates the RainViewer frame fetch.
const radarActive = $derived(weatherLayers.some((i) => i.id === 'weather-radar' && i.visible));
// Legends for the active weather layers in the current theme, shown in the Forecast window.
const weatherLegends = $derived<WeatherLegend[]>(
  weatherLayers
    .filter((i) => i.visible)
    .map((i) => weatherLegend(i.id, theme.theme))
    .filter((l): l is WeatherLegend => l !== undefined),
);
// The wind value at the last map tap, shown as a transient chip.
let weatherReadout = $state<WeatherReadout | undefined>();

// The app menu's action options. Adding one is a single entry here. "Layers and charts" opens
// the layers slide-over; Tracks and the collision thresholds stay as inline submenus below.
const menuItems = $derived<MenuItem[]>([
  {
    id: 'center-on-boat',
    label: 'Center on boat',
    icon: LocateFixed,
    onSelect: () => mapCommands?.centerOnVessel(),
  },
  {
    id: 'follow-boat',
    label: following ? 'Stop following' : 'Follow boat',
    icon: Navigation,
    onSelect: () => (following = !following),
  },
  {
    id: 'mute-alarm',
    label: alarmMuted.value ? 'Unmute alarm' : 'Mute alarm',
    icon: alarmMuted.value ? VolumeX : Volume2,
    onSelect: () => alarmMuted.set(!alarmMuted.value),
  },
  {
    id: 'layers',
    label: 'Layers and charts',
    icon: Layers,
    disabled: !layersView,
    onSelect: () => (layersPanelOpen = true),
  },
]);

// Sound the collision alarm whenever the assessment, acknowledgement, or mute changes.
$effect(() => {
  lookoutAlarm.update(collision.assessment.worst, collision.suppressed, alarmMuted.value);
});

// Publish the collision notification to Signal K as the assessment changes.
$effect(() => {
  collisionNotifier.update(collision.assessment);
});

// Record the track from the vessel position (about 1 Hz); the recorder thins by the
// configured interval and min-distance. SOG is stored raw in m/s (SI).
$effect(() => {
  const position = vessel.position;
  if (position) recorder.consider(position.latitude, position.longitude, vessel.sogMps ?? 0);
});

// While following, keep the map centered on the boat. Enabling it recenters immediately, and
// each new fix recenters again; a manual pan clears `following` (via onUserPan) and stops it.
$effect(() => {
  const commands = mapCommands;
  const position = vessel.position;
  if (following && position) commands?.recenterOnVessel(position.latitude, position.longitude);
});

// Fetch a forecast for the viewport, debounced, when weather is on. Off by default, so nothing
// fetches at startup. Called when weather is enabled and on every settled view change while on.
let weatherFetchTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleWeather(): void {
  if (weatherFetchTimer) clearTimeout(weatherFetchTimer);
  weatherFetchTimer = setTimeout(async () => {
    const bounds = mapCommands?.getBounds();
    if (!weatherActive || !bounds) return;
    weather.setStatus('loading');
    const opts = { maxCells: 600, forecastDays: 5 };
    // Atmospheric always; marine only when the waves layer is on. Both come from Open-Meteo on the
    // same grid; marine is best-effort so waves degrade without blocking wind and pressure.
    const [grid, marine, radar] = await Promise.all([
      fetchForecast(bounds, opts),
      wavesActive ? fetchMarine(bounds, opts) : Promise.resolve(undefined),
      radarActive ? fetchRadar() : Promise.resolve(undefined),
    ]);
    if (grid) weather.setGrid(marine ? mergeMarine(grid, marine) : grid);
    else weather.setStatus(weather.grid ? 'stale' : 'error');
    if (radar) weather.setRadar(radar);
  }, 500);
}

$effect(() => {
  if (weatherActive && !weather.grid) scheduleWeather();
});

// Refetch once when the waves layer is turned on so its field appears without waiting for a pan.
// Keyed on the edge (a plain flag, not the grid) so a failed marine fetch cannot loop.
let wavesRequested = false;
$effect(() => {
  if (wavesActive && !wavesRequested) {
    wavesRequested = true;
    scheduleWeather();
  } else if (!wavesActive) {
    wavesRequested = false;
  }
});

// Same one-shot pattern for the radar layer, so enabling it fetches the frames right away.
let radarRequested = false;
$effect(() => {
  if (radarActive && !radarRequested) {
    radarRequested = true;
    scheduleWeather();
  } else if (!radarActive) {
    radarRequested = false;
  }
});

// Show the wind and pressure at the tapped point for the selected forecast time; clears after a
// few seconds.
let readoutTimer: ReturnType<typeof setTimeout> | undefined;
function onMapTap(lngLat: { lng: number; lat: number }): void {
  if (!weatherActive || !weather.grid) {
    weatherReadout = undefined;
    return;
  }
  weatherReadout = readoutAt(weather.grid, lngLat.lng, lngLat.lat, weather.bracket.lo);
  if (readoutTimer) clearTimeout(readoutTimer);
  if (weatherReadout) readoutTimer = setTimeout(() => (weatherReadout = undefined), 6000);
}

// Reconcile the registered user-chart overlays with the entity's source list: register an added
// chart (resolving a stored file to a blob url first), unregister a removed one, and free its blob.
$effect(() => {
  const registrar = userChartRegistrar;
  const sources = userCharts.sources;
  if (!registrar) return;
  const wanted = new Set(sources.map((source) => source.id));
  for (const [id, blobUrl] of registeredUserCharts) {
    if (wanted.has(id)) continue;
    registeredUserCharts.delete(id);
    registrar.unregister(id);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
  for (const source of sources) {
    if (registeredUserCharts.has(source.id)) continue;
    // Reserve the slot before the async register so a re-fire cannot double-register; the value
    // is the blob url to revoke later, or undefined while registering or for a url-backed chart.
    registeredUserCharts.set(source.id, undefined);
    void addUserChartOverlay(source, registrar);
  }
});

async function addUserChartOverlay(
  source: UserChartSource,
  registrar: UserChartRegistrar,
): Promise<void> {
  let blobUrl: string | undefined;
  let url: string;
  if (source.origin.type === 'url') {
    url = source.origin.url;
  } else {
    const blob = await userCharts.resolveBlob(source.origin.storeId);
    // The chart can be removed while its blob resolves; the reconcile cleanup then drops the
    // reservation. Bail before creating an object URL or registering a ghost overlay for it.
    if (!blob || !registeredUserCharts.has(source.id)) {
      registeredUserCharts.delete(source.id);
      return;
    }
    blobUrl = URL.createObjectURL(blob);
    registeredUserCharts.set(source.id, blobUrl);
    url = `pmtiles://${blobUrl}`;
  }
  await registrar.register(userChartToSignalK(source, url));
  // If it was removed during registration, undo the overlay and free its blob rather than leave
  // a ghost layer for a deleted chart.
  if (!registeredUserCharts.has(source.id)) {
    registrar.unregister(source.id);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    return;
  }
  recolorMap?.(theme.theme);
}

function bumpSaved(): void {
  savedVersion += 1;
}

async function refreshSavedTracks(): Promise<void> {
  savedTracks = await fetchSavedTracks(serverOrigin(), chartsToken);
  bumpSaved();
}

// crypto.randomUUID needs a secure context; the Signal K server serves over plain http on the
// LAN, so fall back to a timestamp-plus-random id there.
function newTrackId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `track-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

async function onSaveTrack(name: string): Promise<void> {
  if (recorder.points.length < 2) return;
  const id = newTrackId();
  if (!(await saveTrack(serverOrigin(), chartsToken, id, name, recorder.points))) return;
  recorder.clear();
  // Show the new track, then refresh: refreshSavedTracks bumps the version once with both the
  // new list and the new shown set in place.
  shownSaved = new Set(shownSaved).add(id);
  await refreshSavedTracks();
}

async function onDeleteSavedTrack(id: string): Promise<void> {
  if (!(await deleteTrack(serverOrigin(), chartsToken, id))) return;
  const next = new Set(shownSaved);
  next.delete(id);
  shownSaved = next;
  await refreshSavedTracks();
}

function onToggleSaved(id: string): void {
  const next = new Set(shownSaved);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  shownSaved = next;
  bumpSaved();
}

// Flatten a saved track's segments back into points, marking the first point of each later
// segment as a gap so the export re-splits into the same MultiLineString.
function onExportSavedTrack(track: SavedTrack): void {
  const points: TrackPoint[] = [];
  track.points.forEach((segment, segmentIndex) => {
    segment.forEach((point, pointIndex) => {
      points.push(pointIndex === 0 && segmentIndex > 0 ? { ...point, gap: true } : point);
    });
  });
  downloadGeoJson(track.name, points);
}

function closeNote(): void {
  selectedNote = undefined;
  mapCommands?.clearNoteSelection();
}

// Browsers block audio until a user gesture; prime the audio context on the first one so
// the alarm can sound later on its own.
const primeAudio = () => lookoutAlarm.prime();

const CONNECTION_LABELS: Record<ConnectionPhase, string> = {
  open: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  closed: 'Not connected',
};

const connectionLabel = $derived(CONNECTION_LABELS[store.connection.phase]);

const fmt = (value: number | undefined, digits: number) =>
  value === undefined ? PLACEHOLDER : value.toFixed(digits);

const accessRequestsUrl = `${serverOrigin()}/admin/#/security/access/requests`;

// Connect the stream the moment access resolves (an approved token, or an unsecured server),
// not as a one-shot blocking step. A token that arrives after a tab refocus, or from another
// tab, then connects without a reload.
let streamConnected = false;
$effect(() => {
  if (streamConnected) return;
  if (auth.status !== 'authenticated' && auth.status !== 'unsecured') return;
  streamConnected = true;
  void connectStream(auth.token ?? undefined);
});

async function connectStream(token: string | undefined): Promise<void> {
  chartsToken = token;
  noteLoader = createNoteDetailLoader(serverOrigin(), token);
  await client.connect(streamUrl(token), (frame) => store.applyFrame(frame));
  await client.raw.subscribe([
    { path: SK_PATHS.headingTrue, policy: 'instant', minPeriod: 200 },
    { path: SK_PATHS.position, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.courseOverGroundTrue, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.speedOverGround, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.position, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.courseOverGroundTrue, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.speedOverGround, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.headingTrue, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.name, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.aisShipType, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.closestApproach, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
  ]);
  await refreshSavedTracks();
}

onMount(() => {
  window.addEventListener('pointerdown', primeAudio, { once: true });
  // The auth controller owns the focus and cross-tab listeners that pick up an approval.
  auth.watch();
  void auth.probe();
});

onDestroy(() => {
  if (viewSaveTimer) clearTimeout(viewSaveTimer);
  if (weatherFetchTimer) clearTimeout(weatherFetchTimer);
  if (readoutTimer) clearTimeout(readoutTimer);
  window.removeEventListener('pointerdown', primeAudio);
  lookoutAlarm.stop();
  auth.stop();
  net.dispose();
  void client.disconnect();
});
</script>

<main class="binnacle-shell">
  <header class="topbar">
    <span class="topbar-start">
      <AppMenu items={menuItems}>
        <MenuSubmenu label="Weather" icon={CloudSun}>
          <ul class="weather-toggles">
            {#each weatherLayers as layer (layer.id)}
              <li>
                <LayerToggle
                  title={layer.title}
                  visible={layer.visible}
                  onToggle={(visible) => layersView?.toggle(layer.id, visible)}
                />
              </li>
            {/each}
            {#if weatherLayers.length === 0}
              <li class="weather-empty">Weather loads with the chart</li>
            {/if}
          </ul>
        </MenuSubmenu>
        <MenuSubmenu label="Tracks" icon={Spline}>
          <TracksPanel
            {recorder}
            settings={trackSettings}
            saved={savedTracks}
            shown={shownSaved}
            onSave={onSaveTrack}
            onDelete={onDeleteSavedTrack}
            {onToggleSaved}
            onExport={onExportSavedTrack}
          />
        </MenuSubmenu>
        <MenuSubmenu label="Collision thresholds" icon={SlidersHorizontal}>
          <ThresholdsPanel {thresholds} />
        </MenuSubmenu>
      </AppMenu>
      <span class="brand">Binnacle <span class="version">v{__APP_VERSION__}</span></span>
    </span>
    <span class="topbar-actions">
      {#if updateReady}
        <button type="button" class="update" onclick={() => pwa.update()}>Update</button>
      {/if}
      <ThemeToggle controller={theme} />
    </span>
  </header>
  <section class="chart-host" aria-label="Chart">
    <ChartCanvas
      {store}
      {vessel}
      {aisTargets}
      {collision}
      {recorder}
      {weather}
      {trackSettings}
      savedTracks={savedSource}
      {chartsToken}
      initialView={savedView}
      savedLayers={layerSettings.value}
      onLayersChange={(settings) => layerSettings.set(settings)}
      savedOrder={layerOrder.value}
      onOrderChange={(order) => layerOrder.set(order)}
      onReady={(view) => (layersView = view)}
      onMapReady={(recolor) => {
        recolorMap = recolor;
        recolor(theme.theme);
      }}
      onCommandsReady={(commands) => (mapCommands = commands)}
      onUserChartsReady={(registrar) => (userChartRegistrar = registrar)}
      {onViewChange}
      onNoteSelect={(selection) => (selectedNote = selection)}
      onUserPan={() => (following = false)}
      {onMapTap}
    />
    <div class="banner-slot">
      <AuthBanner {auth} requestsUrl={accessRequestsUrl} />
    </div>
    <div class="danger-slot">
      <DangerStrip {collision} />
    </div>
    {#if selectedNote && noteLoader}
      <div class="note-panel-slot">
        <NoteDetailPanel selection={selectedNote} load={noteLoader.load} onClose={closeNote} />
      </div>
    {/if}
    {#if layersPanelOpen && layersView}
      <div class="layers-panel-slot">
        <LayersPanel view={layersView} {userCharts} onClose={() => (layersPanelOpen = false)} />
      </div>
    {/if}
    {#if weatherReadout}
      <div class="weather-readout" role="status" aria-live="polite">
        Wind <b>{fmt(metersPerSecondToKnots(weatherReadout.speedMs), 0)}</b> kn from
        <b>{fmt(radiansToBearing(weatherReadout.fromRad), 0)}</b>&deg;
        {#if weatherReadout.pressurePa !== undefined}
          &middot; <b>{fmt(pascalsToHectopascals(weatherReadout.pressurePa), 0)}</b> hPa
        {/if}
        {#if weatherReadout.waveHeightM !== undefined}
          &middot; sea <b>{fmt(weatherReadout.waveHeightM, 1)}</b> m
          {#if weatherReadout.wavePeriodS !== undefined}
            / <b>{fmt(weatherReadout.wavePeriodS, 0)}</b> s
          {/if}
        {/if}
        {#if weatherReadout.precipitationMm !== undefined && weatherReadout.precipitationMm >= 0.1}
          &middot; rain <b>{fmt(weatherReadout.precipitationMm, 1)}</b> mm/h
        {/if}
        {#if weatherReadout.cloudCoverFraction !== undefined}
          &middot; cloud <b>{fmt(weatherReadout.cloudCoverFraction * 100, 0)}</b>%
        {/if}
      </div>
    {/if}
  </section>
  <footer class="status-strip">
    <div class="forecast-center">
      <WeatherTimeControl store={weather} active={weatherActive} legends={weatherLegends} />
    </div>
    <span class="status" role="status" aria-live="polite">{connectionLabel}</span>
    {#if !net.online}
      <span class="readout offline" role="status" aria-live="polite">Offline</span>
    {/if}
    <span class="readout">SOG <b>{fmt(metersPerSecondToKnots(vessel.sogMps), 1)}</b> kn</span>
    <span class="readout">COG <b>{fmt(radiansToBearing(vessel.cogRad), 0)}</b>&deg;</span>
    <span class="spacer"></span>
    <span class="readout">Center</span>
    <span class="readout"><b>{formatLatitude(mapView?.lat)}</b></span>
    <span class="readout"><b>{formatLongitude(mapView?.lon)}</b></span>
    <span class="readout">z<b>{mapView ? mapView.zoom.toFixed(1) : PLACEHOLDER}</b></span>
  </footer>
</main>

<style>
.binnacle-shell {
  display: grid;
  grid-template-rows: auto 1fr auto;
  /* dvh tracks the visible viewport so the locked (overflow-hidden) shell does not hide the bottom
     strip under a mobile browser's dynamic toolbar. */
  block-size: 100dvh;
  margin-block: 0;
  margin-inline: 0;
  font-family: var(--font-ui);
  background: var(--surface);
  color: var(--text);
}
.banner-slot {
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  z-index: var(--z-overlay);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  border-block-end: 1px solid var(--border);
}
.topbar-start {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.update {
  font: inherit;
  font-size: var(--text-sm);
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--accent);
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--surface-raised);
  cursor: pointer;
}
.brand {
  font-weight: 600;
}
.version {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--text-muted);
}
.chart-host {
  position: relative;
}
.danger-slot {
  position: absolute;
  inset-block-end: 0.75rem;
  inset-inline: 0.75rem;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: var(--z-overlay);
}
.note-panel-slot {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  z-index: var(--z-panel);
}
/* The Layers panel docks at the opposite (leading) edge from the note detail, so both can be
   open at once without overlapping; the menu popout closes on selection, leaving the edge free. */
.layers-panel-slot {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  z-index: var(--z-panel);
}
@media (max-width: 600px) {
  .note-panel-slot,
  .layers-panel-slot {
    inset-block-start: auto;
    inset-inline: 0;
  }
}
.danger-slot :global(.danger-strip) {
  pointer-events: auto;
}
.status-strip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.5rem 1rem;
  border-block-start: 1px solid var(--border);
  color: var(--text-muted);
  font-size: var(--text-md);
}
/* The Forecast control sits centered in the status strip, between the left and right readouts. */
.forecast-center {
  position: absolute;
  inset-block: 0;
  inset-inline: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.forecast-center :global(.forecast-btn) {
  pointer-events: auto;
}
.spacer {
  margin-inline-start: auto;
}
/* Transient wind value from a map tap, bottom-leading so it clears the centered scrubber. */
.weather-readout {
  position: absolute;
  inset-block-end: 0.75rem;
  inset-inline-start: 0.75rem;
  padding: 0.3rem 0.6rem;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
  font-size: var(--text-sm);
  z-index: var(--z-overlay);
}
.offline {
  color: var(--alarm);
}
.readout b {
  color: var(--text);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.weather-toggles {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.weather-empty {
  padding: 0.2rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>
