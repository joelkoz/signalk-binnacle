<script lang="ts">
import {
  Bell,
  BellOff,
  CloudSun,
  Layers,
  LocateFixed,
  Navigation,
  Route,
  SlidersHorizontal,
  Spline,
  Volume2,
  VolumeX,
} from '@lucide/svelte';
import { onDestroy, onMount } from 'svelte';
import { AisTargets } from '$entities/ais';
import { CollisionAssessment } from '$entities/collision';
import { CourseGuidance } from '$entities/course';
import { RouteStore } from '$entities/route';
import { type TrackPoint, TrackRecorder } from '$entities/track';
import { type UserChartSource, UserCharts, userChartToSignalK } from '$entities/user-charts';
import { OwnVessel } from '$entities/vessel';
import { WeatherStore } from '$entities/weather';
import { AuthBanner } from '$features/auth-banner';
import { LayersPanel, type LayersView } from '$features/layers-panel';
import { CollisionNotifier, DangerStrip, LookoutAlarm, ThresholdsPanel } from '$features/lookout';
import { AppMenu, type MenuItem, MenuSubmenu } from '$features/menu';
import { ArrivalAlarm, NavStrip } from '$features/navigation';
import {
  createNoteDetailLoader,
  type NoteDetailLoader,
  NoteDetailPanel,
  type NoteSelection,
} from '$features/notes';
import {
  activateRoute,
  advancePoint,
  clearCourse,
  deleteRoute,
  fetchRoutes,
  hydrateCourse,
  RoutesPanel,
  saveRoute,
} from '$features/routing';
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
  createWeatherLoader,
  defaultProviderName,
  fetchWeatherProviders,
  WEATHER_LAYER_IDS,
} from '$features/weather';
import {
  clientId,
  formatFixed,
  formatLatitude,
  formatLongitude,
  metersPerSecondToKnots,
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
import { WeatherMap } from '$widgets/weather-map';

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
// So other Signal K clients and devices see the same collision alert.
const collisionNotifier = new CollisionNotifier(
  (path, value) =>
    void client.publish({ context: SELF_CONTEXT, updates: [{ values: [{ path, value }] }] }),
);

// Track recording: client-side from navigation.position, persisted whole-voyage in IndexedDB.
const trackSettings = createTrackSettings();
const recorder = new TrackRecorder(trackSettings, createTrackStore<TrackPoint>());

// Routes: planned and stored as Signal K resources, drawn by the route overlay, edited on the chart.
const routeStore = new RouteStore();
// Active-navigation guidance: prefers the server Course API and computes the derived values
// client-side when the calcValues provider is absent. The arrival alarm sounds at the waypoint.
const courseGuidance = new CourseGuidance(store, vessel);
const arrivalAlarm = new ArrivalAlarm();
const arrivalMuted = new PersistedValue<boolean>('binnacle:arrival-muted', false);

// Weather forecast, fetched browser-side from Open-Meteo. It lives in a dedicated mini-map panel
// (the Forecast button), not on the nav chart, so the chart stays clean and the weather can never
// be zoomed past its data resolution. The panel owns the fetch, keyed off its own viewport.
const weather = new WeatherStore();
// The cached weather loader (Open-Meteo plus RainViewer), constructed here and passed to the panel
// so it is swappable in tests and its in-memory cache lives for the session.
const weatherLoader = createWeatherLoader();
let weatherPanelOpen = $state(false);
// The default Signal K weather provider's display name (for example AccuWeather), detected once the
// stream connects. When set, the weather panel prefers the provider for point data and falls back to
// the free grid; when undefined (no provider configured), the grid answers.
let weatherProviderName = $state<string | undefined>();
// The panel's own weather-layer visibility and view, separate from the nav chart. Default wind and
// waves on so the first open shows something without hunting through toggles.
const weatherLayerSettings = new PersistedValue<LayerSettings>('binnacle:weather-layers', {
  [WEATHER_LAYER_IDS.wind]: { visible: true, opacity: 1 },
  [WEATHER_LAYER_IDS.waves]: { visible: true, opacity: 0.7 },
});
const weatherViewStore = createMapView('binnacle:weather-view');
const savedWeatherView = isMapView(weatherViewStore.value) ? weatherViewStore.value : undefined;

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
let routesPanelOpen = $state(false);
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
}

let mapCommands = $state<MapCommands | undefined>();

// Follow lock: while on, the map recenters on the boat as each fix arrives. A manual pan
// (dragging the chart) releases it; it does not persist across reloads.
let following = $state(false);

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
    id: 'mute-arrival',
    label: arrivalMuted.value ? 'Unmute arrival' : 'Mute arrival',
    icon: arrivalMuted.value ? BellOff : Bell,
    onSelect: () => arrivalMuted.set(!arrivalMuted.value),
  },
  {
    id: 'layers',
    label: 'Layers and charts',
    icon: Layers,
    disabled: !layersView,
    onSelect: () => {
      routesPanelOpen = false;
      layersPanelOpen = true;
    },
  },
  {
    id: 'routes',
    label: 'Routes',
    icon: Route,
    disabled: !mapCommands,
    onSelect: () => {
      layersPanelOpen = false;
      routesPanelOpen = true;
    },
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

async function onSaveTrack(name: string): Promise<void> {
  if (recorder.points.length < 2) return;
  const id = clientId('track');
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

async function refreshRoutes(): Promise<void> {
  const routes = await fetchRoutes(serverOrigin(), chartsToken);
  // undefined means both endpoints were unreachable: keep the current list rather than blanking the
  // routes the user is looking at over a transient failure. An empty array (reachable, no routes)
  // does clear it.
  if (routes) routeStore.setRoutes(routes);
}

// A routing error shown in the panel until the next route action or the panel closes. A boat error
// should not flash and vanish, so it persists rather than auto-clearing on a short timer.
let routeError = $state<string | undefined>();
function flagRouteError(message: string): void {
  routeError = message;
}
function clearRouteError(): void {
  routeError = undefined;
}

// Clear the active course on the server and locally. Returns whether the server clear succeeded; the
// local state is cleared only on success, so a failed stop does not desync from a server that is
// still navigating (the next course delta would otherwise revive the nav strip).
async function stopActiveCourse(): Promise<boolean> {
  if (!(await clearCourse(serverOrigin(), chartsToken))) return false;
  routeStore.setActive(undefined);
  courseGuidance.clear();
  arrivalAlarm.stop();
  return true;
}

// Fly the chart to a saved route's first waypoint, so showing, editing, activating, or tapping a
// route brings it into view rather than leaving the navigator hunting for it across the chart.
function flyToRouteStart(id: string): void {
  const start = routeStore.routes.find((r) => r.id === id)?.waypoints[0]?.position;
  if (start) mapCommands?.flyTo(start.latitude, start.longitude);
}

function onToggleRouteShown(id: string, shown: boolean): void {
  routeStore.toggleShown(id, shown);
  if (shown) flyToRouteStart(id);
}

function onNewRoute(): void {
  clearRouteError();
  // A client-chosen route id, known before the PUT, so activation needs no create-response parse.
  routeStore.setWorking({ id: clientId('route'), name: '', waypoints: [] });
  mapCommands?.startRouteEdit();
}

function onEditRoute(id: string): void {
  const route = routeStore.routes.find((r) => r.id === id);
  if (!route) return;
  routeStore.setWorking(route);
  mapCommands?.startRouteEdit(route);
  flyToRouteStart(id);
}

async function onSaveRoute(name: string): Promise<void> {
  clearRouteError();
  const working = routeStore.working;
  if (!working || working.waypoints.length < 2) return;
  const route = { ...working, name };
  if (!(await saveRoute(serverOrigin(), chartsToken, route))) {
    // A failed write (offline, no write permission, server error) must not lose the work: keep the
    // route under edit, with its name, so the navigator can retry, and tell them it did not save.
    flagRouteError('Could not save the route. It is kept under edit so you can retry.');
    routeStore.setWorking(route);
    return;
  }
  mapCommands?.stopRouteEdit();
  routeStore.setWorking(undefined);
  routeStore.toggleShown(route.id, true);
  await refreshRoutes();
}

function onCancelRouteEdit(): void {
  mapCommands?.stopRouteEdit();
  routeStore.setWorking(undefined);
}

async function onDeleteRoute(id: string): Promise<void> {
  clearRouteError();
  // Stop navigating before deleting the active route, so the server is not left navigating a route
  // that no longer exists. Abort the delete if the stop did not take.
  if (id === routeStore.activeId && !(await stopActiveCourse())) {
    flagRouteError('Could not stop the active route, so it was not deleted.');
    return;
  }
  if (!(await deleteRoute(serverOrigin(), chartsToken, id))) {
    flagRouteError('Could not delete the route.');
    return;
  }
  routeStore.toggleShown(id, false);
  await refreshRoutes();
}

async function onActivateRoute(id: string): Promise<void> {
  clearRouteError();
  if (!(await activateRoute(serverOrigin(), chartsToken, `/resources/routes/${id}`))) {
    flagRouteError('Could not activate the route. Check the connection.');
    return;
  }
  routeStore.setActive(id);
  routeStore.toggleShown(id, true);
  flyToRouteStart(id);
  // The v2 navigation.course paths are not in the v1 full model, so the stream sends nothing until
  // the next change. Seed the cells once from a REST GET so the nav strip shows values immediately,
  // then the stream keeps them live.
  const { info, calc } = await hydrateCourse(serverOrigin(), chartsToken);
  courseGuidance.seed(info, calc);
}

async function onStopCourse(): Promise<void> {
  clearRouteError();
  if (!(await stopActiveCourse())) {
    flagRouteError('Could not stop the active route. Check the connection.');
  }
}

// Sound the arrival alarm and request the next point when the boat enters the active arrival circle.
let arrivedLast = false;
$effect(() => {
  const arrived = courseGuidance.arrived && routeStore.activeId !== undefined;
  arrivalAlarm.update(arrived, arrivalMuted.value);
  if (arrived && !arrivedLast && !courseGuidance.isLastPoint) {
    // Rising edge, and not yet at the last point: request the next point. The streamed
    // activeRoute.pointIndex stays authoritative, so a server that also auto-advances and this
    // request converge on the same active point. A failed advance is surfaced.
    void advancePoint(serverOrigin(), chartsToken, 1).then((ok) => {
      if (!ok) flagRouteError('Could not advance to the next waypoint.');
    });
  }
  arrivedLast = arrived;
});

function closeNote(): void {
  selectedNote = undefined;
  mapCommands?.clearNoteSelection();
}

// Browsers block audio until a user gesture; prime the audio contexts on the first one so the
// collision and arrival alarms can sound later on their own.
const primeAudio = () => {
  lookoutAlarm.prime();
  arrivalAlarm.prime();
};

const CONNECTION_LABELS: Record<ConnectionPhase, string> = {
  open: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  closed: 'Not connected',
};

const connectionLabel = $derived(CONNECTION_LABELS[store.connection.phase]);

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
    { path: SK_PATHS.courseNextPoint, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.coursePreviousPoint, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.courseActiveRoute, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.courseArrivalCircle, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.courseCalcValues, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.position, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.courseOverGroundTrue, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.speedOverGround, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.headingTrue, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.name, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.aisShipType, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.closestApproach, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
  ]);
  await refreshSavedTracks();
  await refreshRoutes();
  // Detect a configured Signal K weather provider so the panel can prefer it over the free sources.
  // Best-effort: a server without the weather API leaves the provider undefined and the grid answers.
  weatherProviderName = defaultProviderName(await fetchWeatherProviders(serverOrigin(), token));
}

onMount(() => {
  window.addEventListener('pointerdown', primeAudio, { once: true });
  // The auth controller owns the focus and cross-tab listeners that pick up an approval.
  auth.watch();
  void auth.probe();
});

onDestroy(() => {
  if (viewSaveTimer) clearTimeout(viewSaveTimer);
  // Revoke any object URLs still held for file-backed user charts so they do not leak on teardown.
  for (const blobUrl of registeredUserCharts.values()) {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
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
      {routeStore}
      theme={theme.theme}
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
    />
    <div class="banner-slot">
      <AuthBanner {auth} requestsUrl={accessRequestsUrl} />
    </div>
    <div class="nav-slot">
      <NavStrip guidance={courseGuidance} onStop={onStopCourse} />
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
    {#if routesPanelOpen}
      <div class="routes-panel-slot">
        <RoutesPanel
          routes={routeStore.routes}
          shownIds={routeStore.shownIds}
          working={routeStore.working}
          activeId={routeStore.activeId}
          error={routeError}
          onNew={onNewRoute}
          {onEditRoute}
          onSave={onSaveRoute}
          onCancelEdit={onCancelRouteEdit}
          onToggleShown={onToggleRouteShown}
          onLocate={flyToRouteStart}
          onActivate={onActivateRoute}
          onStop={onStopCourse}
          onDelete={onDeleteRoute}
          onClose={() => {
            onCancelRouteEdit();
            clearRouteError();
            routesPanelOpen = false;
          }}
        />
      </div>
    {/if}
    {#if weatherPanelOpen}
      <WeatherMap
        store={weather}
        loader={weatherLoader}
        theme={theme.theme}
        initialView={mapView ?? savedView}
        savedView={savedWeatherView}
        onViewChange={(view) => weatherViewStore.set(view)}
        savedLayers={weatherLayerSettings.value}
        onLayersChange={(settings) => weatherLayerSettings.set(settings)}
        token={chartsToken}
        providerName={weatherProviderName}
        position={vessel.position}
        onClose={() => (weatherPanelOpen = false)}
      />
    {/if}
  </section>
  <footer class="status-strip">
    <div class="forecast-center">
      <button
        type="button"
        class="forecast-btn"
        class:on={weatherPanelOpen}
        aria-pressed={weatherPanelOpen}
        onclick={() => (weatherPanelOpen = !weatherPanelOpen)}
      >
        <CloudSun size={16} aria-hidden="true" />
        Forecast
      </button>
    </div>
    <span role="status" aria-live="polite">{connectionLabel}</span>
    {#if !net.online}
      <span class="readout offline" role="status" aria-live="polite">Offline</span>
    {/if}
    <span class="readout"
      >SOG <b>{formatFixed(metersPerSecondToKnots(vessel.sogMps), 1)}</b> kn</span
    >
    <span class="readout">COG <b>{formatFixed(radiansToBearing(vessel.cogRad), 0)}</b>&deg;</span>
    <span class="spacer"></span>
    <span class="readout">Center</span>
    <span class="readout"><b>{formatLatitude(mapView?.lat)}</b></span>
    <span class="readout"><b>{formatLongitude(mapView?.lon)}</b></span>
    <span class="readout">z<b>{formatFixed(mapView?.zoom, 1)}</b></span>
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
/* The nav strip shares the bottom-center area with the danger strip. The danger strip is later in
   the DOM and the more urgent, so on the rare occasion both show, danger paints over the nav strip. */
.nav-slot {
  position: absolute;
  inset-block-end: 0.75rem;
  inset-inline: 0.75rem;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: var(--z-overlay);
}
.nav-slot :global(.nav-strip) {
  pointer-events: auto;
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
/* The Routes panel docks at the same leading edge as the Layers panel; opening one closes the other,
   so they never overlap. RoutesPanel is content-only, so the slot supplies the panel chrome. */
.routes-panel-slot {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  z-index: var(--z-panel);
  inline-size: min(20rem, 82vw);
  overflow-y: auto;
  padding: 0.75rem;
  background: var(--surface);
  border-inline-end: 1px solid var(--border);
}
@media (max-width: 600px) {
  .note-panel-slot,
  .layers-panel-slot,
  .routes-panel-slot {
    inset-block-start: auto;
    inset-inline: 0;
    inline-size: auto;
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
  /* Tall enough for the absolutely-centered Forecast button (a full control-size touch target), so
     it is not clipped at the bottom by the overflow-hidden viewport. */
  min-block-size: calc(var(--control-size) + 0.5rem);
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
.forecast-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-block-size: var(--control-size);
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
  pointer-events: auto;
}
.forecast-btn.on {
  color: var(--accent);
  border-color: var(--accent);
}
.spacer {
  margin-inline-start: auto;
}
.offline {
  color: var(--alarm);
}
.readout b {
  color: var(--text);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
</style>
