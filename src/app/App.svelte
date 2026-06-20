<script lang="ts">
import {
  Anchor,
  Bell,
  ChartLine,
  CloudSun,
  Layers,
  LocateFixed,
  MapPin,
  Navigation,
  Radar,
  Route,
  Ruler,
  Spline,
  UserCog,
  VolumeX,
  Waves,
} from '@lucide/svelte';
import { onDestroy, onMount, tick, untrack } from 'svelte';
import { AisTargets, vesselLabel } from '$entities/ais';
import { AnchorWatch } from '$entities/anchor';
import { CollisionAssessment } from '$entities/collision';
import { CourseGuidance } from '$entities/course';
import { MeasureStore } from '$entities/measure';
import { type MobMark, MobStore } from '$entities/mob';
import { type ActiveNotification, NotificationsStore } from '$entities/notifications';
import { offerableExtensions, PlotterExtHost, unitsForMode } from '$entities/plotter-ext';
import { type ProfileSettings, ProfileStore, SignalKProfileAdapter } from '$entities/profile';
import {
  type Route as RouteModel,
  RouteStore,
  remainingRouteDistanceMeters,
  reverseRoute,
} from '$entities/route';
import { SymbolsStore } from '$entities/symbols';
import { TidesStore } from '$entities/tides';
import { type TrackPoint, TrackRecorder } from '$entities/track';
import { UnitsStore } from '$entities/units';
import { type UserChartSource, UserCharts, userChartToSignalK } from '$entities/user-charts';
import { OwnVessel } from '$entities/vessel';
import { type Waypoint, WaypointsStore } from '$entities/waypoint';
import { WeatherStore } from '$entities/weather';
import { AisListPanel } from '$features/ais-list';
import {
  ANCHOR_TONE,
  AnchorPanel,
  AnchorStrip,
  resolveAnchorTransport,
} from '$features/anchor-watch';
import { AuthBanner } from '$features/auth-banner';
import { deleteChart, putChart } from '$features/charts';
import { LayersPanel, type LayersView } from '$features/layers-panel';
import {
  AlarmsPanel,
  CollisionMute,
  CollisionNotifier,
  DangerStrip,
  LookoutAlarm,
} from '$features/lookout';
import { MeasureStrip } from '$features/measure';
import { AppMenu, type MenuItem } from '$features/menu';
import {
  MOB_TONE,
  MobButton,
  MobStrip,
  mobClearNotification,
  mobNotification,
} from '$features/mob';
import { ARRIVAL_TONE, NavStrip, type RouteProgress } from '$features/navigation';
import {
  createNoteDetailLoader,
  type NoteDetailLoader,
  NoteDetailPanel,
  type NoteSelection,
  type NotesFilter,
} from '$features/notes';
import {
  addWidgetActionAt,
  PlotterExtHostView,
  ToolbarButtons,
} from '$features/plotter-extensions';
import {
  createProfileBindings,
  downloadProfileJson,
  type ImportedProfile,
  ProfileSwitcher,
  ProfilesPanel,
  seedStarterProfiles,
} from '$features/profiles';
import {
  activateRoute,
  activationFromCourse,
  advancePoint,
  clearCourse,
  type DraftError,
  type DraftedRoute,
  type DraftResult,
  type DraftRouteRequest,
  type DraftView,
  deleteRoute,
  downloadRouteGpx,
  draftRoute,
  fetchRoutes,
  formatDraftFuel,
  groupDraftFlags,
  hydrateCourse,
  parseGpxRoutes,
  RoutesPanel,
  routeDraftAvailable,
  routeHref,
  saveRoute,
  setDestination,
} from '$features/routing';
import { ThemeToggle } from '$features/theme-toggle';
import {
  createTidesLoader,
  fetchSignalkTidesReading,
  SIGNALK_TIDES_PLUGIN_ID,
  TidesPanel,
} from '$features/tides';
import { type SavedTracksSource, trackToRoute } from '$features/track-layer';
import {
  deleteTrack,
  downloadGeoJson,
  fetchSavedTracks,
  type SavedTrack,
  savedTracksToFeatures,
  saveTrack,
  TracksPanel,
} from '$features/tracks';
import { TrendSessionRecorder, TrendsPanel } from '$features/trends';
import {
  deleteWaypoint,
  fetchWaypoints,
  saveWaypoint,
  WaypointDialog,
  WaypointsPanel,
} from '$features/waypoints';
import {
  createWeatherLoader,
  defaultProviderName,
  fetchWeatherProviders,
  WEATHER_LAYER_IDS,
} from '$features/weather';
import { GatedAlarm } from '$shared/audio';
import {
  type Bbox4,
  bboxContainsPoint,
  boundsOfPoints,
  clampToWorld,
  type LatLon,
  padBbox,
} from '$shared/geo';
import {
  Clock,
  formatBearingOr,
  formatCpaNm,
  formatFixed,
  formatKnotsOr,
  formatLatitude,
  formatLengthOr,
  formatLongitude,
  formatTcpaMin,
  lengthUnit,
  nauticalMilesToMeters,
  uuidv4,
} from '$shared/lib';
import type { LayerSettings } from '$shared/map';
import { etaSeconds, routesRoughlyEqual } from '$shared/nav';
import { OnlineStatus, registerPwa } from '$shared/pwa';
import {
  createMapView,
  createThresholds,
  createTrackSettings,
  isMapView,
  type MapView,
  PersistedValue,
} from '$shared/settings';
import type { ConnectionPhase, HistoryProviders } from '$shared/signalk';
import {
  ALL_VESSELS_CONTEXT,
  AuthController,
  acknowledgeNotification,
  createSignalKClient,
  fetchHistoryProviders,
  fetchPlotterExtensions,
  fetchServerFeatures,
  fetchSymbols,
  listResources,
  postMobNotification,
  postNotification,
  putSignalKPath,
  resolveNotification,
  SELF_CONTEXT,
  type ServerFeatures,
  SignalKStore,
  SK_PATHS,
  serverOrigin,
  silenceNotification,
  streamUrl,
  updateNotification,
} from '$shared/signalk';
import { createTrackStore } from '$shared/storage';
import { createThemeController, defaultSaveName, type Theme } from '$shared/ui';
import { ChartCanvas, type MapCommands, type UserChartRegistrar } from '$widgets/chart-canvas';
import { WeatherMap } from '$widgets/weather-map';

// serverOrigin reads location, fixed for the page lifetime: capture once, not at every call site.
const origin = serverOrigin();

const store = new SignalKStore();
// A one-second reactive clock drives every staleness check (a frozen GPS fix, a dropped feed), so
// they re-evaluate even while no data arrives. Disposed on teardown.
const clock = new Clock();
const vessel = new OwnVessel(store, clock);
const aisTargets = new AisTargets(store);
const client = createSignalKClient();
const auth = new AuthController(origin);
const net = new OnlineStatus();
const thresholds = createThresholds();
// Anchored own vessel treats moored and swinging boats as non-hazards, silencing the busy-anchorage
// nuisance; the callback reads anchor (constructed below) lazily, only from inside the assessment.
const collision = new CollisionAssessment(vessel, aisTargets, thresholds, () => anchor.watching);
const lookoutAlarm = new LookoutAlarm();
// The collision mute is session-only with a bounded auto-expiring window (see CollisionMute): a mute
// set in a crowded anchorage must never carry silently into the next passage or across a reload, and
// a close, imminent contact escalates past it. Deliberately not a PersistedValue and not part of a
// profile bundle.
const collisionMute = new CollisionMute(clock);
// Server capability discovery: gates the v2 Notifications transport below; an older server
// falls back to the raw v1 delta publish.
let serverFeatures = $state<ServerFeatures | undefined>();
let historyProviders = $state<HistoryProviders | undefined>();
const notificationsApi = $derived(serverFeatures?.apis.has('notifications') ?? false);

function publishDelta(path: string, value: unknown): void {
  void client.publish({ context: SELF_CONTEXT, updates: [{ values: [{ path, value }] }] });
}

// So other Signal K clients and devices see the same collision alert. On a 2.28 server it rides
// the v2 Notifications API (server-managed id, silence and acknowledge work boat-wide): one id is
// raised, updated in place as the contact develops, and resolved on all-clear. Older servers get
// the v1 delta publish unchanged.
let collisionAlertId: string | undefined;
const collisionNotifier = new CollisionNotifier({
  publish: async (path, value) => {
    // Capture the derived flag once so an await mid-publish cannot see it flip when features
    // resolve, which would mix a v1 delta and a v2 raise on the same assessment change.
    const apiAvailable = notificationsApi;
    if (!apiAvailable) {
      publishDelta(path, value);
      return;
    }
    if (value.state === 'normal') {
      if (collisionAlertId) {
        const cleared = await resolveNotification(origin, chartsToken, collisionAlertId);
        collisionAlertId = undefined;
        // A failed clear would strand a raised alarm on every other station (the server only
        // reaps normal-state entries); the v1 delta still announces the all-clear.
        if (!cleared) publishDelta(path, value);
      }
      return;
    }
    if (collisionAlertId) {
      const updated = await updateNotification(origin, chartsToken, collisionAlertId, {
        state: value.state,
        message: value.message,
      });
      if (updated === 'updated') return;
      if (updated === 'failed') {
        // Transport failure: a fresh raise would also fail and could orphan a duplicate once the
        // link returns. Keep the id for the next change and let the v1 delta carry this one.
        publishDelta(path, value);
        return;
      }
      // The server reaped or lost the id (a restart): raise afresh.
      collisionAlertId = undefined;
    }
    collisionAlertId = await postNotification(origin, chartsToken, {
      state: value.state,
      message: value.message,
      path: 'navigation.collision',
      includePosition: true,
      includeCreatedAt: true,
    });
    // This alarm fires unattended: when even the raise fails, the v1 delta keeps the rest of the
    // boat informed, and the next bucket change retries the v2 path.
    if (!collisionAlertId) publishDelta(path, value);
  },
});

// Muting locally also silences the boat-wide v2 alert, so another station sees a silenced alarm
// rather than one still sounding that this helm has already quieted.
function toggleCollisionMute(): void {
  collisionMute.toggle();
  if (collisionMute.active && collisionAlertId) {
    // A refused boat-wide silence surfaces in the Alarms panel; the local mute itself stands.
    alarmActionError = undefined;
    void silenceNotification(origin, chartsToken, collisionAlertId).then((ok) => {
      if (!ok) {
        alarmActionError = 'Could not silence the alert boat-wide. Other stations may still sound.';
      }
    });
  }
}

// Every notifications.* path on the stream, mirrored for the Alarms panel's active-alert list:
// engine, NMEA2000, autopilot, and plugin alarms all surface without Binnacle knowing any of them.
const notificationsStore = new NotificationsStore(store);

// Silence and acknowledge act on the server's notification id, so the action propagates to every
// station; rows without an id (a v1-only producer) simply do not offer the buttons. A refusal
// (auth, transport) surfaces in the panel, since the alarm keeping on sounding looks identical
// to a slow stream echo otherwise.
let alarmActionError = $state<string | undefined>();
function runNotificationAction(
  notification: ActiveNotification,
  action: (base: string, token: string | undefined, id: string) => Promise<boolean>,
  failMessage: string,
): void {
  if (!notification.id) return;
  alarmActionError = undefined;
  void action(origin, chartsToken, notification.id).then((ok) => {
    if (!ok) alarmActionError = failMessage;
  });
}
function onSilenceNotification(notification: ActiveNotification): void {
  runNotificationAction(
    notification,
    silenceNotification,
    'Could not silence the alert. Check the connection and access.',
  );
}
function onAcknowledgeNotification(notification: ActiveNotification): void {
  runNotificationAction(
    notification,
    acknowledgeNotification,
    'Could not acknowledge the alert. Check the connection and access.',
  );
}

// The anchor watch: server-driven when the anchoralarm plugin answers, client-side otherwise. The
// drag alarm mirrors the collision split: an audible tone here, the strip and live region below.
const anchor = new AnchorWatch(store, vessel);
const anchorAlarm = new GatedAlarm(ANCHOR_TONE);

// Man overboard: one tap on the strip button marks the spot, publishes the boat-wide alarm, and
// raises the recovery strip; a remote station's notifications.mob raises it here too.
const mob = new MobStore(store, vessel, clock);
const mobAlarm = new GatedAlarm(MOB_TONE);

// The measure tool: armed from the menu, fed by chart taps, read by its overlay and strip.
const measure = new MeasureStore();

// Track recording: client-side from navigation.position, persisted whole-voyage in IndexedDB.
const trackSettings = createTrackSettings();
const recorder = new TrackRecorder(trackSettings, createTrackStore<TrackPoint>());

// Routes: planned and stored as Signal K resources, drawn by the route overlay, edited on the chart.
const routeStore = new RouteStore();
// Active-navigation guidance: prefers the server Course API and computes the derived values
// client-side when the calcValues provider is absent. The arrival alarm sounds at the waypoint.
const courseGuidance = new CourseGuidance(store, vessel);
const arrivalAlarm = new GatedAlarm(ARRIVAL_TONE);
const arrivalMuted = new PersistedValue<boolean>('binnacle:arrival-muted', false);
// The speed, in knots, used to turn a planned route's distance into per-waypoint passage times.
const planningSpeedKn = new PersistedValue<number>('binnacle:planning-speed-kn', 5);

// Whole-route distance still to run across the legs ahead, for the passage arrival readout. Only when
// a multi-leg route is active and more than the current leg remains, so a single "go to" or the final
// leg leaves it undefined and the strip shows just the per-leg numbers. Kept separate from the time so
// the geodesy walk re-runs on a waypoint or route change, not on every SOG tick.
const routeDistanceToGoMeters = $derived.by<number | undefined>(() => {
  const idx = courseGuidance.activePointIndex;
  const total = courseGuidance.activePointTotal;
  const toNext = courseGuidance.distanceToNextMeters;
  const id = routeStore.activeId;
  if (id == null || idx == null || total == null || toNext == null || total - idx <= 1) {
    return undefined;
  }
  const route = routeStore.routes.find((r) => r.id === id);
  if (!route) return undefined;
  return toNext + remainingRouteDistanceMeters(route.waypoints, idx);
});

// Pair the distance with the arrival time at the current SOG, so only this divide re-runs per tick.
const routeProgress = $derived.by<RouteProgress | undefined>(() => {
  const distanceToGoMeters = routeDistanceToGoMeters;
  if (distanceToGoMeters == null) return undefined;
  const sog = vessel.sogMps;
  return {
    distanceToGoMeters,
    timeToGoSeconds: sog == null ? undefined : etaSeconds(distanceToGoMeters, sog),
  };
});

// Tides and tidal currents from NOAA CO-OPS (US waters). The store feeds the panel and the nearest
// station markers; the loader caches the station lists and predictions for the session.
const tidesStore = new TidesStore();
// Tide data prefers the signalk-tides plugin when the server runs it (worldwide coverage from
// its configured source), falling back to NOAA CO-OPS exactly as before; a stock server never
// sees a plugin call.
const tidesLoader = createTidesLoader({
  pluginAvailable: () => serverFeatures?.plugins.has(SIGNALK_TIDES_PLUGIN_ID) ?? false,
  pluginTides: (lat, lon) =>
    fetchSignalkTidesReading(lat, lon, { origin: origin, token: chartsToken }),
});

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
// The panel's own weather-layer visibility, separate from the nav chart. Default wind and
// waves on so the first open shows something without hunting through toggles. The panel carries no
// persisted view of its own: it always opens where the nav chart is looking.
const weatherLayerSettings = new PersistedValue<LayerSettings>('binnacle:weather-layers', {
  [WEATHER_LAYER_IDS.wind]: { visible: true, opacity: 1 },
  [WEATHER_LAYER_IDS.waves]: { visible: true, opacity: 0.7 },
});

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
// The edge-docked panels (routes, layers, tracks, collision thresholds) are mutually exclusive: one
// docks at the leading edge at a time. A single active-panel value enforces that structurally, so
// opening one closes whatever was open without each opener having to clear the others by hand.
type LeftPanel =
  | 'routes'
  | 'layers'
  | 'tracks'
  | 'waypoints'
  | 'tides'
  | 'trends'
  | 'ais'
  | 'anchor'
  | 'alarms'
  | 'profiles';
let activePanel = $state<LeftPanel | null>(null);
// The hamburger's open state is owned here, not inside AppMenu, so a panel's back action can reopen
// the menu after it closed on selection.
let menuOpen = $state(false);
const closePanel = (): void => {
  activePanel = null;
};
// Back returns to the menu: close the panel and reopen the hamburger in one update, so the navigator
// can move menu to panel to back to another panel without reopening the menu by hand.
const backToMenu = (): void => {
  activePanel = null;
  menuOpen = true;
};
// On a phone the note detail and a leading panel both collapse to bottom sheets and would overlap,
// so at narrow widths opening one closes the other. On a wide screen they dock to opposite edges and
// coexist, so this exclusion only applies when `narrow` is set (tracked by a matchMedia listener).
let narrow = $state(false);
const openPanel = (panel: LeftPanel): void => {
  activePanel = panel;
  if (narrow) selectedNote = undefined;
};
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
// Which Layers-panel categories the navigator has left open or closed, so the panel reopens that way.
const layerCategoriesOpen = new PersistedValue<Record<string, boolean>>(
  'binnacle:layer-categories',
  {},
);

// Profiles: named bundles of the portable settings (theme, layers, opacity, order, weather layers,
// thresholds, track and planning settings, alarm mutes) the navigator saves and switches between.
// The display-unit preference: follows the server's unit preferences when they resolve, with a
// locally persisted fallback that profiles can carry. The store stays SI; only readouts consult it.
const units = new UnitsStore();
// Samples the live instruments from app start so the Trends panel has an honest in-session
// series on servers with no history provider. Stopped on destroy.
const trendRecorder = new TrendSessionRecorder();

// Standard server waypoints: fetched from /resources/waypoints, rendered by the chart overlay,
// managed in the Waypoints panel, and dropped from the chart's long-press menu.
const waypointsStore = new WaypointsStore();

// Provided chart symbols (signalk-symbol-manager). Constructed empty so the chart can mount
// immediately and hold one stable reference; filled when the fetch lands after access resolves.
// On a stock server the resource type 404s and every icon stays built-in.
const symbolsStore = new SymbolsStore(serverOrigin(), undefined);

// Plotter-extension host: discovers plotterExtensions manifests and runs their widgets, panels,
// buttons, and background runtimes over the published bus. Constructed empty; on a stock server with
// no provider the collection 404s and nothing renders, so the chart is untouched. The adapters
// bridge the host API to the chart commands, the multiplexed Signal K relay, the resource clients,
// and the unit preference.
const plotterExtHost = new PlotterExtHost({
  map: {
    getView: () => {
      const view = mapView ?? savedView;
      const bounds = mapCommands?.getBounds();
      return view && bounds ? { center: [view.lon, view.lat], zoom: view.zoom, bounds } : undefined;
    },
    center: (position) => mapCommands?.flyTo(position[1], position[0]),
    fitBounds: (bounds) => mapCommands?.fitBounds(bounds),
  },
  signalk: {
    ensurePaths: (paths) => {
      if (paths.length > 0) {
        void client.raw.subscribe(
          paths.map((path) => ({ path, policy: 'instant', minPeriod: 1000 })),
        );
      }
    },
    read: (path) => {
      const cell = store.cell(path);
      if (cell.value === undefined) return undefined;
      return {
        value: cell.value,
        timestamp: cell.epoch ? new Date(cell.epoch).toISOString() : undefined,
      };
    },
    put: (path, value) => putSignalKPath(serverOrigin(), chartsToken, path, value),
  },
  resources: {
    list: (type, query) => listResources(serverOrigin(), chartsToken, type, query),
  },
  units: () => unitsForMode(units.mode),
});

// The POI display filter the chart's notes overlay consults, reading through to the host's live
// filter set: an extension's resources.setFilter for `notes` (the POI search pushing its matches)
// hides every marker it does not select, and clearFilter restores them. The version bumps on any
// change so the imperative overlay re-renders without the map moving.
const notesFilter: NotesFilter = {
  version: () => plotterExtHost.filters.version,
  passes: (id, record) => plotterExtHost.filters.passes('notes', id, record),
};

// Discover (or refresh) the offered extensions through the authenticated session. Undefined is the
// stock-server degrade signal: keep whatever is loaded rather than blanking on a transient failure.
async function refreshPlotterExtensions(): Promise<void> {
  const list = await fetchPlotterExtensions(serverOrigin(), chartsToken);
  if (list) plotterExtHost.load(offerableExtensions(list));
}

// Provided chart symbols; absent on a stock server, in which case the built-ins stand. A
// symbol-manager plugin installed or updated while the link was down would otherwise leave stale
// icons until the page reloads, so the reconnect path refreshes these alongside the other resources.
async function refreshSymbols(): Promise<void> {
  const list = await fetchSymbols(serverOrigin(), auth.token ?? undefined);
  if (list) symbolsStore.setSymbols(list);
}

// A development handle for driving the extension host without a server (load a manifest, inspect
// placements), mirroring Freeboard's dev console handle. Stripped from production builds.
if (import.meta.env.DEV) {
  (globalThis as unknown as Record<string, unknown>).binnaclePlotterExt = plotterExtHost;
}
let waypointError = $state<string | undefined>();

async function refreshWaypoints(): Promise<void> {
  const fetched = await fetchWaypoints(origin, chartsToken);
  if (fetched) {
    waypointsStore.setWaypoints(fetched);
    return;
  }
  // A never-loaded list must not read as "no waypoints yet": that claims an empty boat when the
  // fetch failed. Once a load has succeeded, the kept list stands and the failure stays quiet.
  if (waypointsStore.waypoints.length === 0) {
    waypointError = 'Could not load waypoints. Check the connection.';
  }
}

// A dropped waypoint opens the waypoint dialog (name plus icon), seeded at the drop position;
// confirmAddWaypoint saves it. addWaypointAt holds the pending position while the dialog is open.
let addWaypointAt = $state<LatLon | undefined>();
// The waypoint currently open in the edit dialog, or undefined when the dialog is closed.
let editingWaypoint = $state<Waypoint | undefined>();

function onDropWaypoint(position: LatLon): void {
  waypointError = undefined;
  addWaypointAt = position;
}

async function confirmAddWaypoint(result: { name: string; icon?: string }): Promise<void> {
  const position = addWaypointAt;
  addWaypointAt = undefined;
  if (!position) return;
  const waypoint: Waypoint = {
    id: uuidv4(),
    name: result.name,
    position,
    ...(result.icon ? { icon: result.icon } : {}),
  };
  if (!(await saveWaypoint(serverOrigin(), chartsToken, waypoint))) {
    waypointError = 'Could not save the waypoint. Check the connection and write access.';
    activePanel = 'waypoints';
    return;
  }
  await refreshWaypoints();
}

function onOpenEditWaypoint(waypoint: Waypoint): void {
  waypointError = undefined;
  editingWaypoint = waypoint;
}

async function onSaveWaypointEdit(result: { name: string; icon?: string }): Promise<void> {
  const existing = editingWaypoint;
  editingWaypoint = undefined;
  if (!existing) return;
  waypointError = undefined;
  const updated: Waypoint = { ...existing, name: result.name, icon: result.icon };
  if (!(await saveWaypoint(origin, chartsToken, updated))) {
    waypointError = 'Could not save the waypoint. Check the connection and write access.';
    return;
  }
  await refreshWaypoints();
}

async function onDeleteWaypoint(id: string): Promise<void> {
  waypointError = undefined;
  if (!(await deleteWaypoint(origin, chartsToken, id))) {
    waypointError = 'Could not delete the waypoint.';
    return;
  }
  await refreshWaypoints();
}

const profileStore = new ProfileStore();
// True only while a profile is being applied, so the dirty-tracking effect below does not flag the
// active profile as edited by its own apply writes. A plain flag, not reactive, read inside the effect.
let applying = false;
// Handed up by the weather mini-map once it is ready, to push a weather-layer snapshot at runtime.
let applyWeatherLayers = $state<((settings: LayerSettings) => void) | undefined>();
// The mini-map is destroyed with the panel; drop the stale handle on close so a later profile
// apply cannot push a snapshot into a removed map (which would throw and wedge dirty tracking).
$effect(() => {
  if (!weatherPanelOpen) applyWeatherLayers = undefined;
});

// The portable-setting binding table lives in the profiles feature (createProfileBindings); the live
// map-layer push on apply stays here, since this composition root owns the map handles.
const profileBindings = createProfileBindings({
  theme,
  layers: layerSettings,
  layerOrder,
  layerCategories: layerCategoriesOpen,
  weatherLayers: weatherLayerSettings,
  thresholds,
  trackSettings,
  planningSpeedKn,
  arrivalMuted,
  unitsLocal: units.localSetting,
});

function captureProfileSettings(): ProfileSettings {
  return profileBindings.capture();
}

// Write every portable store, then push the layer snapshots to the nav chart and the weather mini-map
// so both update live. The applying guard is held until after the next tick, so the dirty effect runs
// (and skips) within the same flush rather than flagging the apply as an edit.
function applyProfileSettings(s: ProfileSettings): void {
  applying = true;
  profileBindings.apply(s);
  mapCommands?.applyLayers(s.layers, s.layerOrder);
  applyWeatherLayers?.(s.weatherLayers);
  void tick().then(() => {
    applying = false;
  });
}

// Mark the active profile edited when any portable setting changes outside of an apply, so the panel
// and the top-bar switcher can offer to save the change. The primed flag skips the effect's mount
// run, which would otherwise flag a restored active profile as edited at every launch. markDirty is
// untracked: it reads activeId and isDirty, and tracking them would re-run this effect on every
// profile save or switch and instantly re-flag the just-saved profile as dirty. Only the bound
// settings may trigger it.
let dirtyTrackerPrimed = false;
$effect(() => {
  profileBindings.track();
  if (!dirtyTrackerPrimed) {
    dirtyTrackerPrimed = true;
    return;
  }
  if (!applying) untrack(() => profileStore.markDirty());
});

// Starter profiles on first run only (no stored document at all). A one-shot init check, not an
// effect keyed on live emptiness: deleting the last profile must not instantly resurrect them.
if (!profileStore.loadedFromStorage && profileStore.profiles.length === 0) {
  seedStarterProfiles(profileStore, captureProfileSettings());
}

// Once the user is authenticated to a secured server, sync profiles through the SignalK applicationData
// API so they follow the user across devices. Runs once; an unsecured server (status 'unsecured', no
// token) keeps profiles local, since applicationData is disabled without security.
let profilesSynced = false;
$effect(() => {
  if (profilesSynced) return;
  if (auth.status !== 'authenticated' || !auth.token) return;
  const adapter = new SignalKProfileAdapter(origin, auth.token);
  // Latch only on a resolved sync, so a transient failure at first auth does not permanently
  // strand profiles local-only: a later reconnect or token change re-enters and retries.
  void profileStore.syncWithServer(adapter).then((ok) => {
    if (ok) profilesSynced = true;
  });
});

function onApplyProfile(id: string): void {
  const profile = profileStore.profiles.find((p) => p.id === id);
  if (!profile) return;
  applyProfileSettings(profile.settings);
  profileStore.setActive(id);
}

// Apply the default profile once on startup, but only when no profile is already active, so a chosen
// default takes effect on launch without overriding a profile the navigator left active last session.
let defaultApplied = false;
$effect(() => {
  if (defaultApplied) return;
  defaultApplied = true;
  if (profileStore.defaultId && profileStore.activeId === undefined) {
    onApplyProfile(profileStore.defaultId);
  }
});

function onSaveNewProfile(name: string): void {
  const profile = profileStore.save(name, captureProfileSettings());
  profileStore.setActive(profile.id);
}

function onExportProfile(id: string): void {
  const profile = profileStore.profiles.find((p) => p.id === id);
  if (profile) downloadProfileJson(profile);
}

// Save each imported profile as a new one (a fresh id, so an import never overwrites an existing
// profile); the panel already parsed and validated the picked file.
function onImportProfiles(profiles: ImportedProfile[]): void {
  for (const imported of profiles) {
    profileStore.save(imported.name, imported.settings);
  }
}

// User-imported charts: URL descriptors only, persisted locally and synced to the server as chart
// resources so every station sees them. Local .pmtiles FILES are the signalk-pmtiles-plugin's job
// (it serves them as ordinary chart resources Binnacle already renders), not a browser blob store.
const userChartsStore = new PersistedValue<UserChartSource[]>('binnacle:user-charts', []);
// Register (or refresh) a chart as a server resource, best-effort. Gated on a token: without auth
// the write only earns a 401, so do not bother.
function syncUrlChartToServer(source: UserChartSource): void {
  if (chartsToken) {
    void putChart(origin, chartsToken, userChartToSignalK(source, source.origin.url)).then((ok) => {
      // A failed sync leaves the chart visible only on this station, defeating the cross-station
      // intent; a breadcrumb makes "my other helm does not see it" diagnosable.
      if (!ok) console.warn(`User chart "${source.id}" did not sync to the server.`);
    });
  }
}

// Drop a registered user-chart overlay so the reconcile effect can register it afresh (rename) or
// let a removed chart go; one owner for the eviction.
function dropRegisteredUserChart(id: string): void {
  if (!registeredUserCharts.delete(id)) return;
  userChartRegistrar?.unregister(id);
}

const userCharts = new UserCharts(
  userChartsStore.value,
  (sources) => userChartsStore.set(sources),
  // Fly to a freshly imported chart so the user sees it, even when it covers a different area than
  // the current view (charts without known bounds, rare, leave the view unchanged).
  (source) => {
    if (source.bounds) mapCommands?.fitBounds(source.bounds);
    syncUrlChartToServer(source);
  },
  // On removal, also delete the chart's server resource (best-effort).
  (source) => {
    if (chartsToken) {
      void deleteChart(origin, chartsToken, source.id);
    }
  },
  // On rename, drop the registered overlay so the reconcile effect re-registers it under the new
  // name (the overlay title is read once at registration), and refresh the server resource.
  (source) => {
    dropRegisteredUserChart(source.id);
    syncUrlChartToServer(source);
  },
);
let userChartRegistrar = $state<UserChartRegistrar | undefined>();
const registeredUserCharts = new Set<string>();

// Tide data is fetched only while something can display it: the tide-stations layer or the Tides
// panel. With both off (the default) a pan must not issue NOAA station and prediction fetches that
// nothing renders.
const tidesWanted = $derived(
  (layerSettings.value.tides?.visible ?? false) || activePanel === 'tides',
);

// The view changes once per animation frame while panning; persist only after it
// settles so a drag is one write, not hundreds.
let viewSaveTimer: ReturnType<typeof setTimeout> | undefined;
function onViewChange(view: MapView): void {
  mapView = view;
  if (viewSaveTimer) clearTimeout(viewSaveTimer);
  viewSaveTimer = setTimeout(() => {
    mapViewStore.set(view);
    // Refresh tides for the settled view; the loader skips small moves and dedups in flight.
    if (tidesWanted) void tidesLoader.load(tidesStore, view.lat, view.lon);
  }, 400);
}

// Load tides for the current view, so opening the Tides panel shows data without a pan first.
function loadTides(): void {
  const view = mapView ?? savedView;
  if (view) void tidesLoader.load(tidesStore, view.lat, view.lon);
}

// Toggling the tide layer on (or opening the panel) loads tides for the current view, covering the
// fetches the gated pan-settle path skipped while nothing displayed them. The view read is
// untracked: mapView changes every frame of a pan, and depending on it would re-run this per
// frame while the layer is on; the debounced pan-settle path already covers view changes.
$effect(() => {
  if (tidesWanted) untrack(loadTides);
});

let mapCommands = $state<MapCommands | undefined>();

// Follow lock: while on, the map recenters on the boat as each fix arrives. A manual pan
// (dragging the chart) releases it; it does not persist across reloads.
let following = $state(false);

// Show a chart layer at full registration (the persisted snapshot plus the live map), so a feature
// surface can turn its own layer on: starting Measure must reveal a hidden measure layer (or it
// records invisible points), and the Tides panel cross-links its stations layer.
function setLayerVisible(id: string, visible: boolean): void {
  const current = layerSettings.value[id];
  if (current?.visible === visible) return;
  const entry = current ? { ...current, visible } : { visible, opacity: 1 };
  const next = { ...layerSettings.value, [id]: entry };
  layerSettings.set(next);
  mapCommands?.applyLayers(next, layerOrder.value);
}

// Arming always reveals the measure layer first: an armed tool drawing into an invisible layer
// would read as broken. Arming also resets any prior points; both the menu tile and the chart's
// "Measure from here" mean "start a fresh measurement".
function armMeasure(): void {
  setLayerVisible('measure', true);
  measure.start();
}

// The app menu's options, grouped from the data into four intent groups: Navigate (plan and chart),
// Conditions (weather and tides), Safety (traffic, anchor, alarms), and Settings. Center, Follow,
// Charts, and the Forecast pill live on the bottom status strip too, so the chart and weather
// surfaces stay one tap away; the menu rows keep them findable.
// Adding an option is a single entry; the launcher renders and groups whatever it is given.
const menuItems = $derived<MenuItem[]>([
  {
    id: 'routes',
    label: 'Routes',
    icon: Route,
    group: 'Navigate',
    disabled: !mapCommands,
    onSelect: () => openPanel('routes'),
  },
  {
    id: 'tracks',
    label: 'Tracks',
    icon: Spline,
    group: 'Navigate',
    onSelect: () => openPanel('tracks'),
  },
  {
    id: 'waypoints',
    label: 'Waypoints',
    icon: MapPin,
    group: 'Navigate',
    onSelect: () => openPanel('waypoints'),
  },
  {
    id: 'measure',
    label: 'Measure',
    icon: Ruler,
    group: 'Navigate',
    pressed: measure.active,
    onSelect: armMeasure,
  },
  {
    id: 'layers',
    label: 'Layers and charts',
    icon: Layers,
    group: 'Navigate',
    disabled: !layersView,
    onSelect: () => openPanel('layers'),
  },
  {
    id: 'forecast',
    label: 'Forecast',
    icon: CloudSun,
    group: 'Conditions',
    pressed: weatherPanelOpen,
    onSelect: () => (weatherPanelOpen = !weatherPanelOpen),
  },
  {
    id: 'tides',
    label: 'Tides',
    icon: Waves,
    group: 'Conditions',
    onSelect: () => {
      openPanel('tides');
      loadTides();
    },
  },
  {
    id: 'trends',
    label: 'Trends',
    icon: ChartLine,
    group: 'Conditions',
    onSelect: () => openPanel('trends'),
  },
  {
    id: 'ais',
    label: 'AIS targets',
    icon: Radar,
    group: 'Safety',
    onSelect: () => openPanel('ais'),
  },
  {
    id: 'anchor',
    label: 'Anchor watch',
    icon: Anchor,
    group: 'Safety',
    onSelect: () => openPanel('anchor'),
  },
  {
    id: 'alarms',
    label: 'Alarms',
    icon: Bell,
    group: 'Safety',
    onSelect: () => openPanel('alarms'),
  },
  {
    id: 'profiles',
    label: 'Profiles',
    icon: UserCog,
    group: 'Settings',
    onSelect: () => openPanel('profiles'),
  },
]);

// Sound the collision alarm whenever the assessment, acknowledgement, mute, or escalation changes.
// Escalation past the inner ring overrides both acknowledge and mute, so a close, imminent contact
// always sounds. A stale acknowledge expires inside the assessment itself once the situation goes
// all-clear, so the same vessel re-approaching later alarms afresh.
$effect(() => {
  lookoutAlarm.update(
    collision.assessment.worst,
    collision.suppressed,
    collisionMute.active,
    collision.escalating,
    anchor.watching,
  );
});

// AIS staleness pruning, tied to the app lifecycle; the entity owns the TTL and cadence policy.
$effect(() => aisTargets.startPruning());

// A concise spoken summary of the active collision danger, written into a persistent assertive live
// region so a new threat is announced for a screen-reader or hard-of-hearing operator, not only
// sounded. It mirrors the danger strip's own visibility (contacts present and not acknowledged),
// and contacts[0] is the worst since the list is severity-then-time sorted.
const collisionAlert = $derived.by(() => {
  const { contacts } = collision.assessment;
  if (collision.suppressed || contacts.length === 0) return '';
  const nearest = contacts[0];
  const who = vesselLabel(nearest.name, nearest.id);
  const count = contacts.length;
  // Lead with the worst contact's grade (contacts[0] is severity-then-time sorted), so a
  // warning-only situation is not announced as full danger.
  const lead = nearest.severity === 'warning' ? 'Collision warning' : 'Collision danger';
  return `${lead}: ${count} ${count === 1 ? 'contact' : 'contacts'}, nearest ${who}, CPA ${formatCpaNm(nearest.cpaMeters)} nautical miles in ${formatTcpaMin(nearest.tcpaSeconds, 1)} minutes.`;
});
// A muted collision alarm is a safety state, so announce it politely; clearing it on expiry or unmute
// is silent. The mute auto-expires, so the badge shows the minutes left to make the bounded window
// and the coming re-arm obvious.
const muteAlert = $derived(collisionMute.active ? 'Collision alarm muted.' : '');
const muteRemainingMin = $derived(Math.max(1, Math.ceil(collisionMute.remainingMs / 60_000)));

// Publish the collision notification to Signal K as the assessment changes.
$effect(() => {
  collisionNotifier.update(collision.assessment);
});

// One anchor-watch pass per position fix (the method dedupes by fix epoch, so the extra re-runs a
// radius edit or a notification triggers are harmless): client-mode drag detection, plus the
// local bookkeeping a server watch needs.
$effect(() => {
  anchor.updateFix();
});

// Sound the anchor-drag alarm. The acknowledge semantics live in the watch: client mode clears the
// latch outright, server mode silences the current grade until it changes or clears.
$effect(() => {
  anchorAlarm.update(anchor.dragging && !anchor.acknowledged);
});

// The anchor channel of the assertive live region, separate from the collision channel so a drag
// alarm is announced even while a collision alert holds the other region.
const anchorAlert = $derived.by(() => {
  if (anchor.degraded) {
    return 'Anchor watch degraded: no GPS fix, so drag detection has stopped.';
  }
  if (!anchor.dragging || anchor.acknowledged) return '';
  const distance = anchor.distanceMeters;
  const radius = anchor.radiusMeters;
  const where = distance == null ? '' : ` ${Math.round(distance)} meters from the anchor`;
  const limit = radius == null ? '' : `, watch radius ${Math.round(radius)} meters`;
  return `Anchor alarm: the boat is dragging${where}${limit}.`;
});

// Sound the man-overboard alarm while a mark is active and unacknowledged.
$effect(() => {
  mobAlarm.update(mob.active && !mob.acknowledged);
});

// The MOB channel of the assertive live region, the most urgent announcement in the app.
const mobAlert = $derived.by(() => {
  if (!mob.active || mob.acknowledged) return '';
  const distance = mob.distanceMeters;
  const range = distance == null ? '' : `, range ${Math.round(distance)} meters`;
  return `Man overboard${range}. Steer back to the mark.`;
});

function publishMobValue(value: unknown): void {
  void client.publish({
    context: SELF_CONTEXT,
    updates: [{ values: [{ path: SK_PATHS.mobNotification, value }] }],
  });
}

// Commit the press-time mark, tell the whole boat, and bring the mark into view. Guidance only;
// the course (and any coupled autopilot) is touched solely by the strip's deliberate Steer to MOB.
// Without a fix the alarm still raises, position-less, so the crew mobilizes either way.
// The in-flight raise, held so a cancel racing it can resolve whatever id it eventually returns
// instead of stranding a boat-wide emergency nothing ever clears.
let mobAlertPending: Promise<string | undefined> | undefined;
function onMobTrigger(mark: MobMark | undefined): void {
  const committed = mob.trigger(mark);
  if (notificationsApi) {
    // The v2 route attaches the server's own position and timestamp; if the POST fails, fall
    // back to the v1 delta so the boat-wide alarm is never lost to a transport error.
    mobAlertPending = postMobNotification(origin, chartsToken, 'Man overboard');
    void mobAlertPending.then((id) => {
      if (!id) publishMobValue(mobNotification(committed.position));
    });
  } else {
    publishMobValue(mobNotification(committed.position));
  }
  if (committed.position) {
    mapCommands?.flyTo(committed.position.latitude, committed.position.longitude);
  }
}

function onMobCancel(): void {
  mob.cancel();
  const pending = mobAlertPending;
  mobAlertPending = undefined;
  if (pending) {
    // Await the raise a fast cancel may be racing, then clear by id; a failed clear falls back
    // to the v1 delta so no station is left with a raised emergency.
    void pending.then(async (id) => {
      const cleared = id ? await resolveNotification(origin, chartsToken, id) : false;
      if (!cleared) publishMobValue(mobClearNotification());
    });
  } else {
    publishMobValue(mobClearNotification());
  }
}

// The deliberate second tap: hand the mark to the course system via the existing goto plumbing.
function onMobSteer(): void {
  const mark = mob.position;
  if (mark) void onGoToHere(mark);
}

// An anchor error shown in the panel until the next anchor action clears it, rather than
// auto-dismissing: on a boat an error must persist until the operator has acted on it.
let anchorError = $state<string | undefined>();

// The anchor action chain, selected once at resolve time from capabilities: the standard Anchor
// API when the server exposes it (a proposal today, tracked by the weekly watch), otherwise the
// anchoralarm plugin probe. A failed call on the selected transport degrades to the client-local
// watch, never sideways to the other transport: a server that advertises the standard API and
// then fails it has a problem masking would hide. Until features resolve, every action lands on
// the local path.
const anchorTransport = $derived(
  resolveAnchorTransport(origin, chartsToken, {
    standardApiAvailable: serverFeatures?.apis.has('anchor') ?? false,
  }),
);

async function onDropAnchor(): Promise<void> {
  anchorError = undefined;
  const position = vessel.position;
  if (!position) return;
  const radius = anchor.preferredRadiusMeters;
  // The server drop doubles as detection: when the standard API or the anchoralarm plugin answers,
  // the server owns the watch (and keeps alarming with the browser closed) and the stream reflects
  // it back. Any failure degrades to the client-side watch; the panel's mode line says which.
  if (await anchorTransport.drop(radius)) return;
  // A server whose standard Anchor API was feature-detected and then refused the drop has a problem
  // the silent local fallback would hide; surface it, then still start the local watch so the boat
  // is covered. The plugin-probe path cannot tell absent from refused, so it degrades quietly.
  if (anchorTransport.kind === 'standard') {
    anchorError = 'Could not drop the anchor on the server. Check the connection.';
  }
  anchor.dropLocal(position, radius);
}

// Route an anchor action by mode. In server mode the plugin call must succeed; a failure is
// surfaced, never papered over with a local-only change that would desync from a server that is
// still watching. Otherwise the local fallback runs.
async function anchorAction(
  serverCall: () => Promise<boolean>,
  action: string,
  local: () => void,
): Promise<void> {
  anchorError = undefined;
  if (anchor.mode !== 'server') {
    local();
    return;
  }
  if (!(await serverCall())) {
    anchorError = `Could not ${action} on the server. Check the connection.`;
  }
}

function onRaiseAnchor(): Promise<void> {
  return anchorAction(
    () => anchorTransport.raise(),
    'raise the anchor',
    () => anchor.raiseLocal(),
  );
}

function onSetAnchorRadius(meters: number): Promise<void> {
  anchor.rememberRadius(meters);
  return anchorAction(
    () => anchorTransport.setRadius(meters),
    'set the radius',
    () => anchor.setRadiusLocal(meters),
  );
}

function onAnchorMoved(position: LatLon): Promise<void> {
  return anchorAction(
    () => anchorTransport.setPosition(position),
    'move the anchor',
    () => anchor.movePositionLocal(position),
  );
}

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
// chart, unregister a removed one.
$effect(() => {
  const registrar = userChartRegistrar;
  const sources = userCharts.sources;
  if (!registrar) return;
  const wanted = new Set(sources.map((source) => source.id));
  for (const id of registeredUserCharts) {
    if (!wanted.has(id)) dropRegisteredUserChart(id);
  }
  for (const source of sources) {
    if (registeredUserCharts.has(source.id)) continue;
    // Reserve the slot before the async register so a re-fire cannot double-register.
    registeredUserCharts.add(source.id);
    void addUserChartOverlay(source, registrar);
  }
});

async function addUserChartOverlay(
  source: UserChartSource,
  registrar: UserChartRegistrar,
): Promise<void> {
  try {
    await registrar.register(userChartToSignalK(source, source.origin.url));
  } catch (error) {
    // The slot was reserved before this async register; a rejected register (a bad URL or a
    // MapLibre source error) must release it, or the reconcile effect never retries this chart.
    console.error('User chart overlay failed to register', error);
    registeredUserCharts.delete(source.id);
    return;
  }
  // If it was removed during registration, undo the overlay rather than leave a ghost layer.
  if (!registeredUserCharts.has(source.id)) {
    registrar.unregister(source.id);
    return;
  }
  recolorMap?.(theme.theme);
}

function bumpSaved(): void {
  savedVersion += 1;
}

async function refreshSavedTracks(): Promise<void> {
  savedTracks = await fetchSavedTracks(origin, chartsToken);
  bumpSaved();
}

// A failed track save or delete shown in the panel until the next action, so a refused server
// write is not a silent no-op (matching routeError and waypointError).
let trackError = $state<string | undefined>();

async function onSaveTrack(name: string): Promise<void> {
  if (recorder.points.length < 2) return;
  trackError = undefined;
  const id = uuidv4();
  if (!(await saveTrack(origin, chartsToken, id, name, recorder.points))) {
    trackError = 'Could not save the track. Check the connection and access.';
    return;
  }
  recorder.clear();
  // Show the new track, then refresh: refreshSavedTracks bumps the version once with both the
  // new list and the new shown set in place.
  shownSaved = new Set(shownSaved).add(id);
  await refreshSavedTracks();
}

async function onDeleteSavedTrack(id: string): Promise<void> {
  trackError = undefined;
  if (!(await deleteTrack(origin, chartsToken, id))) {
    trackError = 'Could not delete the track. Check the connection and access.';
    return;
  }
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
  const routes = await fetchRoutes(origin, chartsToken);
  // undefined means both endpoints were unreachable: keep the current list rather than blanking the
  // routes the user is looking at over a transient failure. An empty array (reachable, no routes)
  // does clear it.
  if (routes) {
    routeStore.setRoutes(routes);
    return;
  }
  // A never-loaded list must not read as "no routes": that claims an empty boat when the fetch
  // failed, the same asymmetry refreshWaypoints guards against.
  if (routeStore.routes.length === 0) {
    flagRouteError('Could not load routes. Check the connection.');
  }
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

// True while a single "go to here" destination is the active course (no saved route is active). It
// is the goto counterpart to routeStore.activeId, so arrival and reconnect rehydration cover both.
let gotoActive = $state(false);
const courseActive = $derived(routeStore.activeId !== undefined || gotoActive);

// When the stream reports the course gone (cleared from this or another station), drop the local
// activation flags on the falling edge, so the Routes panel cannot keep a stale Active badge for a
// route the server stopped navigating. Falling edge only: during activation the local flags are set
// before the hydration seeds the guidance, and a clear there would race the seed.
let wasGuidanceActive = false;
$effect(() => {
  const active = courseGuidance.active;
  if (!active && wasGuidanceActive && courseActive) {
    routeStore.setActive(undefined);
    gotoActive = false;
  }
  wasGuidanceActive = active;
});

// Clear the active course on the server and locally. Returns whether the server clear succeeded; the
// local state is cleared only on success, so a failed stop does not desync from a server that is
// still navigating (the next course delta would otherwise revive the nav strip).
async function stopActiveCourse(): Promise<boolean> {
  if (!(await clearCourse(origin, chartsToken))) return false;
  routeStore.setActive(undefined);
  gotoActive = false;
  courseGuidance.clear();
  arrivalAlarm.stop();
  return true;
}

// Fly the chart to a position: the shared locate action for the MOB mark and AIS list rows.
function flyToPosition(position: LatLon): void {
  mapCommands?.flyTo(position.latitude, position.longitude);
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

// AI route drafting is served by signalk-crows-nest: the control is hidden unless that plugin is
// detected at the version that ships the route-draft endpoint, and every value the model returns is
// an unverified draft the navigator must check leg by leg before saving.
const draftAvailable = $derived(routeDraftAvailable(serverFeatures?.plugins));
let draftLoading = $state(false);
let draftError = $state<string | undefined>();
// The active AI draft as the panel shows it, or undefined for a hand-drawn working route. These move
// together, so one object beats six cells: setting it marks the working route a draft, clearing it
// returns to the normal hand-drawn save.
let draftView = $state<DraftView | undefined>();
// One in-flight draft at a time: a newer request aborts the prior fetch, and the sequence guard drops
// a stale or cancelled response that resolves after a newer one was issued.
let draftAbort: AbortController | undefined;
let draftSeq = 0;
// The hand-drawn route stashed before an optimize, restored if the navigator cancels the result, so
// Optimize is non-destructive. Set means "the current draft came from Optimize".
let optimizeOriginal = $state<RouteModel | undefined>();
// Set true when an optimize returned an effectively unchanged route, so the panel shows a brief note.
let optimizeUnchanged = $state(false);

const DRAFT_ERROR_MESSAGES: Record<Exclude<DraftError, 'cancelled'>, string> = {
  budget:
    'The daily AI budget is used up. Try again later, or raise the cap in the route-drafting plugin.',
  'no-route':
    'The AI could not draft a usable route for that. Try rephrasing, or a shorter passage.',
  'model-error': 'The AI returned an unusable response. Try again, or rephrase the request.',
  timeout: 'The draft timed out. Check the connection and try again.',
  unreachable:
    'Could not reach the route-drafting plugin. Check it is installed and the server is reachable.',
  unauthorized:
    'AI route drafting needs a Signal K admin session. Sign in to the server as an administrator.',
  'bad-request': 'The draft request was rejected. Try rephrasing the passage.',
};

// Optimize overrides the no-route and bad-request copy: the navigator gave a real drawn route, so the
// failure is that the optimized result was unusable, not that we could not draft from the words.
const OPTIMIZE_ERROR_MESSAGES: Record<Exclude<DraftError, 'cancelled'>, string> = {
  ...DRAFT_ERROR_MESSAGES,
  'no-route':
    'The optimized route came back unusable or too detailed. Simplify the route and try again.',
  'bad-request': 'The drawn route could not be optimized. Simplify it and try again.',
};

// Two routes within this per-waypoint distance count as unchanged, so an optimize that moved nothing
// shows a note instead of forcing a full re-verification.
const UNCHANGED_TOLERANCE_M = nauticalMilesToMeters(0.05);

function clearDraftState(): void {
  draftAbort?.abort();
  draftAbort = undefined;
  // Bump the sequence so any in-flight draft orphans itself instead of landing after a cancel or save.
  draftSeq++;
  draftLoading = false;
  draftError = undefined;
  draftView = undefined;
  optimizeOriginal = undefined;
  optimizeUnchanged = false;
}

// The companion scopes nearby notes and POIs to an area of interest. The live map viewport is that
// area, read via mapCommands.getBounds(); this coarse box around the vessel is only the fallback for
// the rare case a draft is triggered before the map command surface is ready.
const VESSEL_AREA_HALF_DEG = 0.5;
function vesselAreaBounds({ latitude, longitude }: LatLon): Bbox4 {
  return clampToWorld([
    longitude - VESSEL_AREA_HALF_DEG,
    latitude - VESSEL_AREA_HALF_DEG,
    longitude + VESSEL_AREA_HALF_DEG,
    latitude + VESSEL_AREA_HALF_DEG,
  ]);
}

// The shared request path for draft and optimize: one in-flight call, aborting any prior, with the
// sequence guard that drops a superseded or cancelled response. Returns the result, or undefined when
// this call was superseded (the caller does nothing in that case). The GPS-fix precondition lives in
// onDraftRoute only, since optimize works on a drawn route with no fix.
async function runDraft(req: DraftRouteRequest): Promise<DraftResult | undefined> {
  draftAbort?.abort();
  const controller = new AbortController();
  draftAbort = controller;
  const mine = ++draftSeq;
  draftLoading = true;
  let result: DraftResult;
  try {
    result = await draftRoute(origin, chartsToken, req, controller.signal);
  } catch {
    // The client classifies every error itself, so a throw here is unexpected. Guard anyway: a future
    // regression must never strand the spinner with no error and no way back but cancel.
    if (mine !== draftSeq) return undefined;
    draftLoading = false;
    return { ok: false, error: 'model-error', message: 'unexpected' };
  }
  // A newer request (or a cancel) superseded this one: drop the result without touching the UI.
  if (mine !== draftSeq) return undefined;
  draftLoading = false;
  return result;
}

// Open a returned route as a working draft: set it editing, frame it, and build the panel view. The
// id is the caller's: a fresh uuid for a from-scratch draft, the drawn route's id for an optimize, so
// saving an optimized saved route overwrites it rather than orphaning a copy.
function applyDraft(route: DraftedRoute, source: 'draft' | 'optimize', id: string): void {
  const working = { id, name: route.name ?? '', waypoints: route.waypoints };
  routeStore.setWorking(working);
  mapCommands?.startRouteEdit(working);
  // Frame the whole passage so every leg is visible before the navigator verifies it.
  const box = boundsOfPoints(route.waypoints.map((w) => w.position));
  if (box) mapCommands?.fitBounds(padBbox(box, 0.15));
  draftView = {
    name: working.name,
    destination: route.destination?.name,
    note: route.note !== '' ? route.note : undefined,
    fuel: route.fuel ? formatDraftFuel(route.fuel, units.mode) : undefined,
    confidence: route.confidence,
    flags: route.flags ? groupDraftFlags(route.flags) : undefined,
    source,
  };
}

// Tap a leg row: toggle its cross-highlight, and ease the chart to the leg only when it is not
// already in view, so a tap on a visible leg does not jolt the camera. The dot tap on the chart sets
// the waypoint highlight directly in the chart widget; this is the list side.
function onHighlightLeg(index: number): void {
  const cur = routeStore.highlight;
  if (cur?.kind === 'leg' && cur.index === index) {
    routeStore.clearHighlight();
    return;
  }
  routeStore.setHighlight({ kind: 'leg', index });
  const wps = routeStore.working?.waypoints;
  const a = wps?.[index];
  const b = wps?.[index + 1];
  if (!a || !b) return;
  const view = mapCommands?.getBounds();
  if (view && bboxContainsPoint(view, a.position) && bboxContainsPoint(view, b.position)) return;
  const box = boundsOfPoints([a.position, b.position]);
  if (box) mapCommands?.fitBounds(padBbox(box, 0.3));
}

async function onDraftRoute(prompt: string): Promise<void> {
  clearRouteError();
  draftError = undefined;
  const from = vessel.position;
  if (!from) {
    draftError = 'No vessel position yet. Wait for a GPS fix before drafting.';
    return;
  }
  if (vessel.positionStale) {
    draftError = 'Vessel position is stale. Wait for a fresh GPS fix before drafting.';
    return;
  }
  const result = await runDraft({
    prompt,
    from,
    bounds: mapCommands?.getBounds() ?? vesselAreaBounds(from),
    units: units.mode,
  });
  if (!result) return;
  if (!result.ok) {
    // A cancelled draft was aborted by a newer request or a clear; the sequence guard already dropped
    // the superseded ones, so a cancel stays silent here too.
    if (result.error !== 'cancelled') draftError = DRAFT_ERROR_MESSAGES[result.error];
    return;
  }
  applyDraft(result.route, 'draft', uuidv4());
}

// Optimize the drawn working route: send it to the same plugin and present the improved result as a
// non-destructive draft. Stashes the original so Cancel restores it, asserts the optimized marker to
// reject an older same-version build, and shows a note rather than the verify ritual when nothing moved.
async function onOptimizeRoute(hint: string): Promise<void> {
  clearRouteError();
  const working = routeStore.working;
  if (!working || working.waypoints.length < 2) return;
  const positions = working.waypoints.map((w) => w.position);
  // No GPS-fix requirement: the drawn route defines start, end, and area. Send the fix as context when
  // fresh, else fall back to the route's first waypoint.
  const from = vessel.position && !vessel.positionStale ? vessel.position : positions[0];
  // The pad is wider than the draft's 0.15 so the model has room to move waypoints seaward to clear
  // hazards without the server dropping a good turn as out of window. padBbox clamps to the world and
  // unwraps a crossing (dateline) box itself, so a crossing box flows through unchanged.
  const box = boundsOfPoints(positions);
  const bounds = box ? padBbox(box, 0.25) : vesselAreaBounds(positions[0]);
  optimizeOriginal = working;
  optimizeUnchanged = false;
  const result = await runDraft({
    route: positions,
    prompt: hint,
    from,
    bounds,
    units: units.mode,
  });
  if (!result) return;
  if (!result.ok) {
    if (result.error !== 'cancelled') flagRouteError(OPTIMIZE_ERROR_MESSAGES[result.error]);
    optimizeOriginal = undefined;
    return;
  }
  if (!result.optimized) {
    // A crows-nest build that does not yet consume route silently drafted from scratch; do not show
    // that as an optimize. The version gate cannot catch this during the shared 0.10.0 dev window.
    flagRouteError(
      'This route-drafting plugin version cannot optimize a route. Update the plugin.',
    );
    optimizeOriginal = undefined;
    return;
  }
  const optimized = result.route.waypoints.map((w) => w.position);
  if (routesRoughlyEqual(positions, optimized, UNCHANGED_TOLERANCE_M)) {
    // Nothing moved: show the note and drop the optimize stash. Clearing optimizeOriginal flips the
    // panel's Cancel back to normal discard, which is correct since the drawn route is unchanged.
    optimizeUnchanged = true;
    optimizeOriginal = undefined;
    return;
  }
  applyDraft(result.route, 'optimize', working.id);
}

function beginNewRoute(initialPoint?: LatLon): void {
  clearRouteError();
  clearDraftState();
  // A client-chosen route id, known before the PUT, so activation needs no create-response parse.
  // The Signal K resources API requires a UUID for standard route ids, so this must be a real UUID.
  routeStore.setWorking({ id: uuidv4(), name: '', waypoints: [] });
  mapCommands?.startRouteEdit(undefined, initialPoint);
}

// Start a route from the chart context menu: open the routes panel so the editor controls show, begin
// a fresh route, and seed its first waypoint at the chosen spot, so the navigator continues by tapping
// the rest of the passage instead of placing the start by hand.
function onStartRouteHere(position: LatLon): void {
  openPanel('routes');
  beginNewRoute(position);
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
  // A drafted route can reach here with an empty name (no model name and a cleared field), unlike the
  // hand-drawn path that prompts; fall back to a dated name so a route is never saved unnamed.
  const route = { ...working, name: name.trim() || defaultSaveName('Route') };
  if (!(await saveRoute(origin, chartsToken, route))) {
    // A failed write (offline, no write permission, server error) must not lose the work: keep the
    // route under edit, with its name, so the navigator can retry, and tell them it did not save.
    flagRouteError('Could not save the route. It is kept under edit so you can retry.');
    routeStore.setWorking(route);
    return;
  }
  mapCommands?.stopRouteEdit();
  routeStore.setWorking(undefined);
  clearDraftState();
  routeStore.toggleShown(route.id, true);
  await refreshRoutes();
}

// The editing-group Cancel during an optimize draft: put the drawn route back and stay in edit,
// rather than discarding everything. clearDraftState clears the stash and draft view first, so the
// restore reads the captured original, not a value it just nulled.
function onCancelDraft(): void {
  const original = optimizeOriginal;
  clearDraftState();
  if (original) {
    routeStore.setWorking(original);
    mapCommands?.startRouteEdit(original);
  }
}

function onCancelRouteEdit(): void {
  mapCommands?.stopRouteEdit();
  routeStore.setWorking(undefined);
  clearDraftState();
}

// The routes panel's close and back both cancel the in-progress edit and clear any error first.
function closeRoutesPanel(): void {
  onCancelRouteEdit();
  clearRouteError();
  closePanel();
}
function backFromRoutesPanel(): void {
  onCancelRouteEdit();
  clearRouteError();
  backToMenu();
}

// A manual edit of a draft's geometry (a drag, a midpoint insert) accepts it as a hand-drawn route:
// clear the draft view and the optimize stash so the route becomes a normal working route the
// navigator can re-optimize or save without the not-chart-verified banner. It must also supersede a
// draft or optimize still IN FLIGHT (draftView not yet set): clearDraftState bumps draftSeq and aborts,
// so a late result cannot overwrite the user's edit. The geometry is already updated by the editor's
// onChange; clearDraftState drops only the draft state, not the working route. No-op for a plain route.
function onRouteEdited(): void {
  if (
    draftView === undefined &&
    !draftLoading &&
    optimizeOriginal === undefined &&
    !optimizeUnchanged
  ) {
    return;
  }
  clearDraftState();
}

// Seed the course cells once from a REST GET, then the stream keeps them live. The v2
// navigation.course paths are not in the v1 full model, so under subscribe=none the stream sends
// nothing until the next change; this makes the nav strip show values immediately on activation.
// The hydrate start time lets seed() yield to any stream delta that landed while the GET was in
// flight, so a slow hydration cannot roll back a fresher waypoint skip.
async function hydrateAndSeedCourse(): Promise<void> {
  const startedAt = Date.now();
  const { info, calc } = await hydrateCourse(origin, chartsToken);
  courseGuidance.seed(info, calc, startedAt);
  // Reconcile the local activation flags with what the server is actually navigating: a page
  // reload mid-passage restores the Active badge, skip buttons, and route progress, and a course
  // replaced from another station moves the badge to the right route. An undefined activation
  // means the GET failed, so nothing is known and nothing is touched.
  const activation = activationFromCourse(info);
  if (!activation) return;
  if (activation.routeId) {
    if (routeStore.activeId !== activation.routeId) {
      routeStore.setActive(activation.routeId);
      routeStore.toggleShown(activation.routeId, true);
    }
    gotoActive = false;
  } else if (activation.goto) {
    routeStore.setActive(undefined);
    gotoActive = true;
  }
}

async function onDeleteRoute(id: string): Promise<void> {
  clearRouteError();
  // Stop navigating before deleting the active route, so the server is not left navigating a route
  // that no longer exists. Abort the delete if the stop did not take.
  if (id === routeStore.activeId && !(await stopActiveCourse())) {
    flagRouteError('Could not stop the active route, so it was not deleted.');
    return;
  }
  if (!(await deleteRoute(origin, chartsToken, id))) {
    flagRouteError('Could not delete the route.');
    return;
  }
  routeStore.toggleShown(id, false);
  await refreshRoutes();
}

async function onActivateRoute(id: string): Promise<void> {
  clearRouteError();
  if (!(await activateRoute(origin, chartsToken, routeHref(id)))) {
    flagRouteError('Could not activate the route. Check the connection.');
    return;
  }
  routeStore.setActive(id);
  gotoActive = false;
  routeStore.toggleShown(id, true);
  flyToRouteStart(id);
  await hydrateAndSeedCourse();
}

async function onStopCourse(): Promise<void> {
  clearRouteError();
  if (!(await stopActiveCourse())) {
    flagRouteError('Could not stop the active route. Check the connection.');
  }
}

// Skip the active route's waypoint forward (1) or back (-1). Best-effort: the streamed pointIndex
// stays authoritative, so the strip self-corrects even if the server rejects a step past a route end.
// A transport failure is still surfaced, matching the arrival auto-advance.
function onSkipPoint(delta: number): void {
  void advancePoint(origin, chartsToken, delta).then((ok) => {
    if (!ok) flagRouteError('Could not skip the waypoint. Check the connection.');
  });
}

// Save the current track as a reusable route, without stopping or clearing the recording, so a
// sailed passage becomes a plan that can be followed again.
async function onSaveTrackAsRoute(name: string): Promise<void> {
  clearRouteError();
  if (recorder.points.length < 2) return;
  const route = trackToRoute(recorder.points, name);
  if (!(await saveRoute(origin, chartsToken, route))) {
    flagRouteError('Could not save the track as a route.');
    return;
  }
  await refreshRoutes();
  routeStore.toggleShown(route.id, true);
}

// Navigate back along the current track: build a route from it, reverse the geometry so it runs from
// the boat's current position back to the start, then activate it forward. The boat retraces its own
// proven-safe water back out of a channel or anchorage.
async function onTrackHome(): Promise<void> {
  clearRouteError();
  if (recorder.points.length < 2) return;
  const route = trackToRoute(recorder.points, 'Track home');
  route.waypoints.reverse();
  if (!(await saveRoute(origin, chartsToken, route))) {
    flagRouteError('Could not build the route home.');
    return;
  }
  await refreshRoutes();
  if (!(await activateRoute(origin, chartsToken, routeHref(route.id)))) {
    flagRouteError('Could not start navigating home.');
    return;
  }
  routeStore.setActive(route.id);
  gotoActive = false;
  routeStore.toggleShown(route.id, true);
  await hydrateAndSeedCourse();
}

// Save a reversed copy of a route (the return leg), shown on the chart, leaving the original intact.
async function onReverseRoute(id: string): Promise<void> {
  clearRouteError();
  const route = routeStore.routes.find((r) => r.id === id);
  if (!route) return;
  const reversed = reverseRoute(route);
  if (!(await saveRoute(origin, chartsToken, reversed))) {
    flagRouteError('Could not reverse the route.');
    return;
  }
  await refreshRoutes();
  routeStore.toggleShown(reversed.id, true);
}

// Download a saved route as a GPX file so it can be opened in another plotter, MFD, or Freeboard-SK.
function onExportRouteGpx(id: string): void {
  const route = routeStore.routes.find((r) => r.id === id);
  if (route) downloadRouteGpx(route);
}

// Parse a picked GPX file, save each route it carries to the server, and show them on the chart.
async function onImportRouteGpx(gpxText: string): Promise<void> {
  clearRouteError();
  const parsed = parseGpxRoutes(gpxText);
  if (parsed.length === 0) {
    flagRouteError('No routes found in that GPX file.');
    return;
  }
  const saved = [];
  for (const route of parsed) {
    if (await saveRoute(origin, chartsToken, route)) saved.push(route.id);
  }
  if (saved.length === 0) {
    flagRouteError('Could not save the imported route.');
    return;
  }
  if (saved.length < parsed.length) {
    flagRouteError(`Imported ${saved.length} of ${parsed.length} routes; the rest did not save.`);
  }
  await refreshRoutes();
  for (const id of saved) routeStore.toggleShown(id, true);
}

// Navigate straight to a point the user picked on the chart (long-press or right-click, then "Go to
// here"). A single destination replaces any active route on the server, so clear the local active
// route and mark the goto active, then seed the nav strip from a one-time hydration.
async function onGoToHere(position: LatLon): Promise<void> {
  clearRouteError();
  if (!(await setDestination(origin, chartsToken, position))) {
    flagRouteError('Could not set the destination. Check the connection.');
    return;
  }
  routeStore.setActive(undefined);
  gotoActive = true;
  await hydrateAndSeedCourse();
}

// A brief on-screen arrival cue paired with the tone, for a helm that has the volume low. role=status
// (polite) so a screen reader hears it too, distinct from the assertive collision channel. Cleared
// after a few seconds.
let arrivalBanner = $state<string | undefined>();
let arrivalBannerTimer: ReturnType<typeof setTimeout> | undefined;

// Sound the arrival alarm and request the next point when the boat enters the active arrival circle.
let arrivedLast = false;
$effect(() => {
  const arrived = courseGuidance.arrived && courseActive;
  arrivalAlarm.update(arrived && !arrivalMuted.value);
  if (arrived && !arrivedLast) {
    // Rising edge: show the arrival banner for the point just reached, before any auto-advance moves
    // the name on. A single "go to here" has no name, so fall back to a generic label.
    arrivalBanner = courseGuidance.nextPointName ?? 'destination';
    if (arrivalBannerTimer) clearTimeout(arrivalBannerTimer);
    arrivalBannerTimer = setTimeout(() => {
      arrivalBanner = undefined;
    }, 8000);
    // Auto-advance only along a route; a single "go to here" destination has no next point to step to.
    if (routeStore.activeId !== undefined && !courseGuidance.isLastPoint) {
      // The streamed activeRoute.pointIndex stays authoritative, so a server that also auto-advances
      // and this request converge on the same active point. A failed advance is surfaced.
      void advancePoint(origin, chartsToken, 1).then((ok) => {
        if (!ok) flagRouteError('Could not advance to the next waypoint.');
      });
    }
  }
  arrivedLast = arrived;
});

function closeNote(): void {
  selectedNote = undefined;
  mapCommands?.clearNoteSelection();
}
const selectNote = (selection: NoteSelection | undefined): void => {
  selectedNote = selection;
  // Only yield a leading panel when actually opening a note, not when the selection clears.
  if (narrow && selection) activePanel = null;
};

// Browsers block audio until a user gesture; prime the audio contexts on the first one so the
// collision and arrival alarms can sound later on their own.
const primeAudio = () => {
  lookoutAlarm.prime();
  arrivalAlarm.prime();
  anchorAlarm.prime();
  mobAlarm.prime();
};

const CONNECTION_LABELS: Record<ConnectionPhase, string> = {
  open: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  closed: 'Not connected',
};

const connectionLabel = $derived(CONNECTION_LABELS[store.connection.phase]);
// The stream is down (not merely connecting at startup) when it is reconnecting or closed. The badge
// is colored to match, so a mid-passage drop is visible at a glance rather than reading "Connected".
const connectionDown = $derived(
  store.connection.phase === 'reconnecting' || store.connection.phase === 'closed',
);
// The own fix has aged out: the footer dashes SOG and COG and shows a calm "No GPS fix" note rather
// than presenting a frozen speed and course as if they were live.
const fixStale = $derived(vessel.positionStale);

// When the OS reports the network is back, reconnect the stream at once rather than waiting out the
// remaining backoff (up to 30 s). Only on the rising edge of online, and only while the stream is
// actually down, so a healthy connection is never dropped and reopened needlessly.
let wasOnline = net.online;
$effect(() => {
  const online = net.online;
  const down = connectionDown;
  if (online && !wasOnline && down) void client.reconnect();
  wasOnline = online;
});

// The count of AIS targets the lookout is tracking, so a quiet footer chip confirms the watch is live
// and receiving traffic, rather than leaving the navigator to wonder whether an empty danger strip
// means "all clear" or "not working". list() reads aisVersion, so the derived stays reactive.
const aisCount = $derived(aisTargets.list().length);

const accessRequestsUrl = `${origin}/admin/#/security/access/requests`;

// Connect the stream the moment access resolves (an approved token, or an unsecured server),
// not as a one-shot blocking step. A token that arrives after a tab refocus, or from another
// tab, then connects without a reload.
let streamConnected = false;
let streamError = $state(false);
$effect(() => {
  if (streamConnected) return;
  if (auth.status !== 'authenticated' && auth.status !== 'unsecured') return;
  streamConnected = true;
  // A rejected connect (the worker failed to load, a Comlink call threw) would otherwise leave
  // streamConnected latched true with no live data and no signal, indistinguishable from
  // connecting. Surface it; recovery is a reload, so we do not re-enter the effect (that would
  // spin against a dead worker).
  connectStream(auth.token ?? undefined).catch((error) => {
    console.error('Signal K stream failed to connect', error);
    streamError = true;
  });
});

// On a stream reconnect, re-hydrate what the resubscribe cannot redeliver. The v2 navigation.course
// paths are not in the v1 full model, so under subscribe=none the server sends no cached course
// value on resubscribe, only the next change: without this an active course would freeze on its
// pre-drop geometry (and the arrival alarm and auto-advance would run on stale values) until the
// course next changed. Self-vessel paths are in the v1 model and recover on their own; routes are
// REST resources, so refresh them too. The first open is handled by connectStream (including the
// course hydration); only a later open (a genuine reconnect) re-hydrates here.
let everOpen = false;
let lastConnectionPhase: ConnectionPhase | undefined;
$effect(() => {
  const phase = store.connection.phase;
  const reconnected = phase === 'open' && lastConnectionPhase !== 'open' && everOpen;
  lastConnectionPhase = phase;
  if (phase === 'open') everOpen = true;
  if (!reconnected) return;
  void refreshRoutes();
  void refreshWaypoints();
  // A provider plugin enabled while the link was down would otherwise stay undetected.
  void refreshWeatherProvider(auth.token ?? undefined);
  // An extension provider enabled (or disabled) while the link was down would otherwise stay stale.
  void refreshPlotterExtensions();
  // A symbol-manager plugin installed or updated while the link was down would otherwise leave the
  // waypoint and note icons stale until a reload.
  void refreshSymbols();
  // A unit preset changed on the server while the link was down would otherwise hold until the
  // token changes or the page reloads.
  void units.syncFromServer(origin);
  // Unconditional: a course activated from another station while the link was down would otherwise
  // stay unknown here until its next change; the hydration also reconciles the activation flags.
  void hydrateAndSeedCourse();
});

async function connectStream(token: string | undefined): Promise<void> {
  chartsToken = token;
  noteLoader = createNoteDetailLoader(origin, token);
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
    { path: SK_PATHS.depthBelowTransducer, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.windSpeedApparent, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.outsidePressure, policy: 'instant', minPeriod: 5000 },
    { path: SK_PATHS.anchorPosition, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.anchorMaxRadius, policy: 'instant', minPeriod: 1000 },
    // One wildcard row covers every notifications.* path including anchor and MOB; a specific
    // row beside it would have the server deliver those deltas twice.
    { path: SK_PATHS.allNotifications, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.position, context: ALL_VESSELS_CONTEXT, policy: 'fixed', period: 5000 },
    {
      path: SK_PATHS.courseOverGroundTrue,
      context: ALL_VESSELS_CONTEXT,
      policy: 'fixed',
      period: 5000,
    },
    { path: SK_PATHS.speedOverGround, context: ALL_VESSELS_CONTEXT, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.headingTrue, context: ALL_VESSELS_CONTEXT, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.name, context: ALL_VESSELS_CONTEXT, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.aisShipType, context: ALL_VESSELS_CONTEXT, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.closestApproach, context: ALL_VESSELS_CONTEXT, policy: 'fixed', period: 5000 },
  ]);
  // Three independent REST reads, in parallel: saved tracks, routes, and the course snapshot.
  // The course hydration restores an in-progress course after a reload: the v2 course paths send
  // nothing under subscribe=none until the next change, and the local activation flags are
  // session state, so without it a mid-passage reload leaves the nav strip, arrival alarm, and
  // auto-advance dead while the server is still navigating.
  await Promise.all([
    refreshSavedTracks(),
    refreshRoutes(),
    refreshWaypoints(),
    hydrateAndSeedCourse(),
    refreshPlotterExtensions(),
  ]);
}

// Detect a configured Signal K weather provider so the panel can prefer it over the free sources.
// undefined means the TRANSPORT failed (a 401 before the token landed, a slow server): keep the
// current value and let the next trigger retry, so one bad probe cannot lock the whole session
// onto the free fallback. An answered {} genuinely means no provider and clears it.
async function refreshWeatherProvider(token: string | undefined): Promise<void> {
  const providers = await fetchWeatherProviders(origin, token);
  if (providers !== undefined) weatherProviderName = defaultProviderName(providers);
}

// Keyed on the auth token rather than run once at first connect, so a token that arrives later
// (an approval from another tab) or changes re-detects with the right credentials.
$effect(() => {
  if (auth.status !== 'authenticated' && auth.status !== 'unsecured') return;
  void refreshWeatherProvider(auth.token ?? undefined);
  // Resolve the server's unit preferences with the same trigger: per-user resolution rides on the
  // session credentials that exist once access has resolved.
  void units.syncFromServer(origin);
  // Capability discovery; a transport failure keeps the current value so one bad probe cannot
  // drop the session back to v1 transports.
  void fetchServerFeatures(origin, auth.token ?? undefined).then((features) => {
    if (features) serverFeatures = features;
  });
  // History provider discovery: the v2 features list reports the history API even with no
  // provider registered, so the providers route is the real signal.
  void fetchHistoryProviders(origin, auth.token ?? undefined).then((providers) => {
    if (providers) historyProviders = providers;
  });
  symbolsStore.setAuth(auth.token ?? undefined);
  void refreshSymbols();
});

onMount(() => {
  trendRecorder.start(() => ({
    depth: vessel.depthMeters,
    wind: vessel.windSpeedApparentMps,
    pressure: vessel.outsidePressurePa,
    sog: vessel.sogMps,
  }));
  window.addEventListener('pointerdown', primeAudio, { once: true });
  // The auth controller owns the focus and cross-tab listeners that pick up an approval.
  auth.watch();
  void auth.probe();
  // Track the phone breakpoint so the note detail and a leading panel can be made mutually exclusive
  // at narrow widths, where they would otherwise both bottom-dock and overlap.
  const narrowQuery = window.matchMedia('(max-width: 600px)');
  const syncNarrow = (): void => {
    narrow = narrowQuery.matches;
  };
  syncNarrow();
  narrowQuery.addEventListener('change', syncNarrow);
  return () => narrowQuery.removeEventListener('change', syncNarrow);
});

onDestroy(() => {
  trendRecorder.stop();
  if (viewSaveTimer) clearTimeout(viewSaveTimer);
  if (arrivalBannerTimer) clearTimeout(arrivalBannerTimer);
  window.removeEventListener('pointerdown', primeAudio);
  lookoutAlarm.stop();
  anchorAlarm.stop();
  mobAlarm.stop();
  arrivalAlarm.stop();
  auth.stop();
  net.dispose();
  clock.dispose();
  void client.disconnect();
});
</script>

<main class="binnacle-shell">
  <div class="visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
    {collisionAlert}
  </div>
  <div class="visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
    {anchorAlert}
  </div>
  <div class="visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
    {mobAlert}
  </div>
  <div class="visually-hidden" aria-live="polite" aria-atomic="true">{muteAlert}</div>
  <header class="topbar">
    <span class="topbar-start">
      <AppMenu items={menuItems} open={menuOpen} onOpenChange={(next) => (menuOpen = next)} />
      <span class="brand">Binnacle <span class="version">v{__APP_VERSION__}</span></span>
    </span>
    <MobButton {mob} onTrigger={onMobTrigger} onLocate={flyToPosition} />
    <span class="topbar-actions">
      {#if collisionMute.active}
        <button
          type="button"
          class="btn btn-warning btn-pill"
          aria-pressed="true"
          aria-label="Collision alarm muted, {muteRemainingMin} minutes left, tap to unmute"
          title="Collision alarm muted, {muteRemainingMin} min left, tap to unmute"
          onclick={() => collisionMute.unmute()}
        >
          <VolumeX size={16} aria-hidden="true" />
          Muted {muteRemainingMin}m
        </button>
      {/if}
      {#if updateReady}
        <button type="button" class="btn btn-primary btn-pill" onclick={() => pwa.update()}>
          Update
        </button>
      {/if}
      <ProfileSwitcher
        active={profileStore.active}
        isDirty={profileStore.isDirty}
        onClick={() => openPanel('profiles')}
      />
      <ThemeToggle controller={theme} />
    </span>
  </header>
  <section class="chart-host" aria-label="Chart">
    <ChartCanvas
      {units}
      waypoints={waypointsStore}
      {notesFilter}
      symbols={symbolsStore}
      onDropWaypoint={(position) => void onDropWaypoint(position)}
      aisTrailsAvailable={() => serverFeatures?.plugins.has('tracks') ?? false}
      isOnline={() => net.online}
      historyProviders={() => historyProviders}
      {store}
      {vessel}
      {aisTargets}
      {anchor}
      {mob}
      {measure}
      {collision}
      guidance={courseGuidance}
      {recorder}
      {routeStore}
      tides={tidesStore}
      theme={theme.theme}
      {trackSettings}
      savedTracks={savedSource}
      {userCharts}
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
      onNoteSelect={selectNote}
      onUserPan={() => (following = false)}
      {onGoToHere}
      onStartRoute={onStartRouteHere}
      onMeasureFrom={(position) => {
        armMeasure();
        measure.add(position);
      }}
      onRouteEditorError={() =>
        flagRouteError('Could not load the route editor. Check the connection and try again.')}
      {onRouteEdited}
      onAnchorMoved={(position) => void onAnchorMoved(position)}
      resolveAddWidget={(x, y, width, height) =>
        addWidgetActionAt(plotterExtHost, x, y, width, height)}
    />
    <PlotterExtHostView host={plotterExtHost} origin={serverOrigin()} />
    <div class="banner-slot">
      <AuthBanner {auth} requestsUrl={accessRequestsUrl} />
    </div>
    {#if arrivalBanner}
      <div class="arrival-banner" role="status">Arrived at {arrivalBanner}</div>
    {/if}
    <div class="bottom-stack" class:above-weather={weatherPanelOpen}>
      <NavStrip
        guidance={courseGuidance}
        {routeProgress}
        onStop={onStopCourse}
        onSkip={routeStore.activeId !== undefined ? onSkipPoint : undefined}
      />
      <MeasureStrip {measure} {units} />
      <AnchorStrip {anchor} {units} onRaise={() => void onRaiseAnchor()} />
      <DangerStrip {collision} muted={collisionMute.active} onToggleMute={toggleCollisionMute} />
      <MobStrip {mob} {units} onSteer={onMobSteer} onCancel={onMobCancel} />
    </div>
    {#if selectedNote && noteLoader}
      <div class="note-panel-slot">
        <NoteDetailPanel selection={selectedNote} load={noteLoader.load} onClose={closeNote} />
      </div>
    {/if}
    {#if activePanel === 'layers' && layersView}
      <div class="panel-slot" id="layers-panel">
        <LayersPanel
          view={layersView}
          {userCharts}
          categoriesOpen={layerCategoriesOpen}
          onClose={closePanel}
          onBack={backToMenu}
        />
      </div>
    {/if}
    {#if activePanel === 'routes'}
      <div class="panel-slot">
        <RoutesPanel
          routes={routeStore.routes}
          shownIds={routeStore.shownIds}
          working={routeStore.working}
          activeId={routeStore.activeId}
          highlight={routeStore.highlight}
          {onHighlightLeg}
          error={routeError}
          onNew={beginNewRoute}
          {onEditRoute}
          onSave={onSaveRoute}
          onCancelEdit={onCancelRouteEdit}
          onToggleShown={onToggleRouteShown}
          onLocate={flyToRouteStart}
          onActivate={onActivateRoute}
          onStop={onStopCourse}
          onReverse={onReverseRoute}
          onExportGpx={onExportRouteGpx}
          onImportGpx={onImportRouteGpx}
          planningSpeed={planningSpeedKn}
          onDelete={onDeleteRoute}
          {draftAvailable}
          {draftLoading}
          {draftError}
          onDraft={onDraftRoute}
          draft={draftView}
          onOptimize={onOptimizeRoute}
          {onCancelDraft}
          optimizeDraft={optimizeOriginal !== undefined}
          {optimizeUnchanged}
          onClose={closeRoutesPanel}
          onBack={backFromRoutesPanel}
        />
      </div>
    {/if}
    {#if activePanel === 'tracks'}
      <div class="panel-slot">
        <TracksPanel
          {recorder}
          settings={trackSettings}
          saved={savedTracks}
          shown={shownSaved}
          onSave={onSaveTrack}
          onSaveAsRoute={onSaveTrackAsRoute}
          {onTrackHome}
          onDelete={onDeleteSavedTrack}
          {onToggleSaved}
          onExport={onExportSavedTrack}
          error={trackError}
          onClose={closePanel}
          onBack={backToMenu}
        />
      </div>
    {/if}
    {#if activePanel === 'waypoints'}
      <div class="panel-slot">
        <WaypointsPanel
          waypoints={waypointsStore.waypoints}
          error={waypointError}
          onLocate={(waypoint) => flyToPosition(waypoint.position)}
          onGoTo={(waypoint) => void onGoToHere(waypoint.position)}
          onEdit={onOpenEditWaypoint}
          onDelete={(id) => void onDeleteWaypoint(id)}
          onClose={closePanel}
          onBack={backToMenu}
        />
      </div>
    {/if}
    {#if activePanel === 'tides'}
      <div class="panel-slot">
        <TidesPanel
          store={tidesStore}
          {units}
          stationsShown={layerSettings.value.tides?.visible ?? false}
          onToggleStations={(shown) => setLayerVisible('tides', shown)}
          onClose={closePanel}
          onBack={backToMenu}
        />
      </div>
    {/if}
    {#if activePanel === 'trends'}
      <div class="panel-slot">
        <TrendsPanel
          {origin}
          token={chartsToken}
          providers={historyProviders}
          recorder={trendRecorder}
          mode={units.mode}
          theme={theme.theme}
          onClose={closePanel}
          onBack={backToMenu}
        />
      </div>
    {/if}
    {#if activePanel === 'ais'}
      <div class="panel-slot">
        <AisListPanel
          {units}
          {aisTargets}
          {vessel}
          {collision}
          onLocate={flyToPosition}
          onClose={closePanel}
          onBack={backToMenu}
        />
      </div>
    {/if}
    {#if activePanel === 'anchor'}
      <div class="panel-slot">
        <AnchorPanel
          {units}
          {anchor}
          {vessel}
          error={anchorError}
          onDrop={() => void onDropAnchor()}
          onRaise={() => void onRaiseAnchor()}
          onSetRadius={(meters) => void onSetAnchorRadius(meters)}
          onClose={closePanel}
          onBack={backToMenu}
        />
      </div>
    {/if}
    {#if activePanel === 'alarms'}
      <div class="panel-slot">
        <AlarmsPanel
          {thresholds}
          collisionMuted={collisionMute.active}
          collisionMuteRemainingMin={collisionMute.active ? muteRemainingMin : undefined}
          onToggleCollisionMute={toggleCollisionMute}
          arrivalMuted={arrivalMuted.value}
          onToggleArrivalMute={() => arrivalMuted.set(!arrivalMuted.value)}
          notifications={notificationsStore}
          error={alarmActionError}
          onSilence={notificationsApi ? onSilenceNotification : undefined}
          onAcknowledge={notificationsApi ? onAcknowledgeNotification : undefined}
          onClose={closePanel}
          onBack={backToMenu}
        />
      </div>
    {/if}
    {#if activePanel === 'profiles'}
      <div class="panel-slot">
        <ProfilesPanel
          profiles={profileStore.profiles}
          activeId={profileStore.activeId}
          defaultId={profileStore.defaultId}
          isDirty={profileStore.isDirty}
          onApply={onApplyProfile}
          onSaveNew={onSaveNewProfile}
          onUpdate={(id) => {
            profileStore.update(id, captureProfileSettings());
            profileStore.clearDirty();
          }}
          onRename={(id, name) => profileStore.rename(id, name)}
          onRemove={(id) => profileStore.remove(id)}
          onSetDefault={(id) => profileStore.setDefault(id)}
          onExport={onExportProfile}
          onImport={onImportProfiles}
          onClose={closePanel}
          onBack={backToMenu}
        />
      </div>
    {/if}
    {#if weatherPanelOpen}
      <WeatherMap
        store={weather}
        {units}
        loader={weatherLoader}
        theme={theme.theme}
        initialView={mapView ?? savedView}
        savedLayers={weatherLayerSettings.value}
        onLayersChange={(settings) => weatherLayerSettings.set(settings)}
        onLayersReady={(apply) => (applyWeatherLayers = apply)}
        token={chartsToken}
        providerName={weatherProviderName}
        position={vessel.position}
        online={net.online}
        onClose={() => (weatherPanelOpen = false)}
        onBack={() => {
          weatherPanelOpen = false;
          menuOpen = true;
        }}
      />
    {/if}
  </section>
  <footer class="status-strip">
    <div class="strip-start">
      <span
        class="conn"
        class:conn--down={connectionDown}
        role="status"
        aria-live="polite"
        title={connectionLabel}
      >
        <span class="conn-dot" aria-hidden="true"></span>
        <span class="visually-hidden">{connectionLabel}</span>
      </span>
      {#if streamError}
        <span class="readout fix-lost" role="alert" aria-live="assertive">
          Data link failed, reload
        </span>
      {/if}
      {#if !net.online}
        <span class="readout offline" role="status" aria-live="polite">Offline</span>
      {/if}
      {#if fixStale}
        <span class="readout fix-lost" role="status" aria-live="polite">No GPS fix</span>
      {/if}
      {#if store.connection.phase === 'open'}
        <span class="readout lookout" title="AIS targets the lookout is tracking">
          AIS <b>{aisCount}</b>
        </span>
      {/if}
      {#if anchor.watching}
        <span
          class="readout anchor-chip"
          class:anchor-chip--alarm={anchor.dragging || anchor.fixLost}
          role="status"
          title={anchor.fixLost
            ? 'Anchor watch: no GPS fix, drag detection degraded'
            : 'Anchor watch: distance from the anchor over the watch radius'}
        >
          {#if anchor.fixLost}
            Anchor <b>no GPS</b>
          {:else}
            Anchor <b>{formatLengthOr(anchor.distanceMeters, units.mode, 0)}</b>/<b
              >{formatLengthOr(anchor.radiusMeters, units.mode, 0)}</b
            >
            {lengthUnit(units.mode)}
          {/if}
        </span>
      {/if}
      <span class="readout"
        >SOG <b>{formatKnotsOr(fixStale ? undefined : vessel.sogMps)}</b> kn</span
      >
      <span class="readout"
        >COG <b>{formatBearingOr(fixStale ? undefined : vessel.cogRad)}</b>&deg;T</span
      >
    </div>
    <div class="strip-center">
      <button
        type="button"
        class="btn btn-pill"
        aria-label="Center on boat"
        title="Center on boat"
        onclick={() => mapCommands?.centerOnVessel()}
      >
        <LocateFixed size={16} aria-hidden="true" />
        Center
      </button>
      <button
        type="button"
        class="btn btn-pill"
        class:is-on={following}
        aria-pressed={following}
        aria-label="Follow boat"
        title={following ? 'Stop following' : 'Follow boat'}
        onclick={() => (following = !following)}
      >
        <Navigation size={16} aria-hidden="true" />
        Follow
      </button>
      <!-- No aria-label: the accessible name must be the visible "Charts" so voice control
           matches what a user says; the title carries the longer description. -->
      <button
        type="button"
        class="btn btn-pill"
        class:is-on={activePanel === 'layers'}
        aria-expanded={layersView ? activePanel === 'layers' : undefined}
        aria-haspopup="dialog"
        aria-controls={activePanel === 'layers' ? 'layers-panel' : undefined}
        title={layersView ? 'Layers and charts' : 'Layers and charts (chart is loading)'}
        disabled={!layersView}
        onclick={() => (activePanel === 'layers' ? closePanel() : openPanel('layers'))}
      >
        <Layers size={16} aria-hidden="true" />
        Charts
      </button>
      <button
        type="button"
        class="btn btn-pill"
        class:is-on={weatherPanelOpen}
        aria-expanded={weatherPanelOpen}
        aria-haspopup="dialog"
        aria-controls={weatherPanelOpen ? 'weather-panel' : undefined}
        onclick={() => (weatherPanelOpen = !weatherPanelOpen)}
      >
        <CloudSun size={16} aria-hidden="true" />
        Forecast
      </button>
      <ToolbarButtons host={plotterExtHost} />
    </div>
    <div class="center-cluster">
      <span class="readout">View</span>
      <span class="readout"><b>{formatLatitude(mapView?.lat)}</b></span>
      <span class="readout"><b>{formatLongitude(mapView?.lon)}</b></span>
      <span class="readout">z<b>{formatFixed(mapView?.zoom, 1)}</b></span>
    </div>
  </footer>
</main>

{#if addWaypointAt}
  <WaypointDialog
    defaultName={defaultSaveName('Waypoint')}
    symbols={symbolsStore}
    onSave={(result) => void confirmAddWaypoint(result)}
    onCancel={() => (addWaypointAt = undefined)}
  />
{/if}
{#if editingWaypoint}
  <!-- Key on the waypoint so editing a different one remounts the dialog and re-seeds its fields,
       rather than capturing only the first waypoint's name and icon. -->
  {#key editingWaypoint}
    <WaypointDialog
      defaultName={editingWaypoint.name}
      waypoint={editingWaypoint}
      symbols={symbolsStore}
      onSave={(result) => void onSaveWaypointEdit(result)}
      onCancel={() => (editingWaypoint = undefined)}
    />
  {/key}
{/if}

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
/* A brief arrival toast, centered at the top of the chart, paired with the arrival tone so a quiet
   helm still gets the cue. It uses the accent treatment, not an alarm color, since arrival is a
   waypoint event, not a danger. */
.arrival-banner {
  position: absolute;
  inset-block-start: var(--space-3);
  inset-inline: 0;
  margin-inline: auto;
  inline-size: fit-content;
  max-inline-size: calc(100% - var(--space-6));
  padding: var(--space-2) var(--space-4);
  background: var(--accent-tint);
  border: 1px solid var(--accent);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
  font-weight: 600;
  z-index: var(--z-overlay);
}
/* Three columns so the MOB button sits dead center regardless of how wide the brand and the
   action cluster are; the flanks are 1fr each so the center cannot drift. */
.topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-block-end: 1px solid var(--border);
}
.topbar-start {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-inline-size: 0;
}
.topbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  min-inline-size: 0;
}
.brand {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.version {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--text-muted);
}
/* On a phone the brand yields its version string so the muted badge and the Update pill keep room.
   Phone override after the base rule: a media block before a same-specificity base is silently
   defeated by source order. It works here only because the base sets no display. */
@media (max-width: 600px) {
  .version {
    display: none;
  }
}
.chart-host {
  position: relative;
}
/* The nav strip and the danger strip share the bottom-center area. They stack in one column rather
   than overlapping, so when a collision danger appears mid-passage the course guidance is not hidden.
   column-reverse puts the danger strip (last in the DOM, the more urgent) on top, the nav strip below
   it. Either renders nothing when inactive, so a single strip just centers. */
.bottom-stack {
  position: absolute;
  inset-block-end: var(--space-3);
  inset-inline: var(--space-3);
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: var(--space-2);
  pointer-events: none;
  /* Above the weather panel (which sits at z-panel + 1) so an active collision danger and its Mute and
     Acknowledge stay reachable while the Forecast mini-map is open. The danger strip is a safety
     surface, so it sits over every panel; only the menu (z-menu) is higher. */
  z-index: calc(var(--z-panel) + 2);
}
.bottom-stack :global(.bottom-strip) {
  pointer-events: auto;
}
/* While the Forecast panel is open the strips lift to sit on its top edge instead of covering its
   scrubber and legend: the stack outranks the panel by design (safety surfaces stay visible and
   tappable), so clearance has to come from geometry, not stacking order. The panel height is the
   shared --weather-panel-height token, so the two cannot drift apart. */
.bottom-stack.above-weather {
  inset-block-end: calc(var(--control-size) + 2 * var(--space-2) + var(--weather-panel-height));
}
.note-panel-slot {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  z-index: var(--z-panel);
}
/* Routes, layers, tracks, and the collision thresholds all dock at the leading edge, one at a time
   (activePanel is exclusive), opposite the note detail so the two never overlap. Each panel renders
   its own slide-over shell, so the slot only positions it. */
.panel-slot {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  z-index: var(--z-panel);
}
@media (max-width: 600px) {
  .note-panel-slot,
  .panel-slot {
    inset-block-start: auto;
    inset-inline: 0;
    inline-size: auto;
  }
}
/* A three-column grid: the leading readouts, the Forecast button centered in the flexible middle,
   and the trailing position cluster. Forecast is real grid content, not an absolute overlay, so it
   can never paint over or steal taps from the readouts at any width. */
.status-strip {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  /* Tall enough for the Forecast button (a full control-size touch target), so it is not clipped at
     the bottom by the overflow-hidden viewport. */
  min-block-size: calc(var(--control-size) + var(--space-2));
  border-block-start: 1px solid var(--border);
  color: var(--text-muted);
  font-size: var(--text-md);
}
.strip-start {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-inline-size: 0;
}
/* Center, Follow, Charts, and Forecast read as one row of matching labeled pills in the flexible
   middle. They wrap rather than overflow when a narrow phone leaves too little width. */
.strip-center {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
}
/* The center lat, lon, and zoom readout reads as one group at the trailing edge, and is the first
   thing dropped on a phone, where the chart and the panels still report position. */
.center-cluster {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-inline-size: 0;
}
/* On a phone or small tablet the labeled pills and the live readouts do not fit one row, so the
   strip stacks into one centered column: the readouts above, and the labeled pills on a wrapping
   row below within thumb reach. The duplicate position cluster drops (the chart and panels still
   report it); the connection dot is small enough to stay. This block sits after the base rules
   above, so it wins the cascade when the query matches. */
@media (max-width: 900px) {
  .status-strip {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: var(--space-2);
  }
  .strip-start {
    flex-wrap: wrap;
    justify-content: center;
  }
  .center-cluster {
    display: none;
  }
}
.offline {
  color: var(--alarm);
}
/* The connection state is a compact dot (its label stays for assistive tech and the hover title):
   the healthy token while the stream is up, the caution color while it is reconnecting or closed,
   so a mid-passage drop still reads at a glance without the word taking strip space. */
.conn {
  display: inline-flex;
  align-items: center;
}
.conn-dot {
  inline-size: 0.625rem;
  block-size: 0.625rem;
  border-radius: 50%;
  background: var(--ok);
}
.conn--down .conn-dot {
  background: var(--warning);
}
/* A lost own fix is a caution, not an alarm: the boat is still where it was, the position is just no
   longer updating. Warning-colored and calm, beside the dashed SOG and COG. */
.fix-lost {
  color: var(--warning);
  font-weight: 600;
}
/* The lookout chip is muted chrome: it confirms the AIS watch is live without competing with the
   hero SOG and COG. On a phone it drops with the rest of the secondary readouts. */
.lookout {
  color: var(--text-muted);
}
/* The anchor chip confirms the watch is live (distance over radius) as quiet chrome, and turns to
   the alarm color while the boat is dragging so the state reads even with the strip dismissed. */
.anchor-chip {
  color: var(--text-muted);
}
.anchor-chip--alarm {
  color: var(--alarm);
  font-weight: 600;
}
.anchor-chip--alarm b {
  color: var(--alarm);
}
/* Keep each readout on one line, so "SOG -- kn" does not wrap to two lines when the strip is tight. */
.readout {
  white-space: nowrap;
}
.readout b {
  color: var(--text);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
/* Every footer readout number, leading (AIS, SOG, COG) and trailing (the position cluster), takes
   the same instrument-readout size, so the strip reads as one instrument row rather than two
   mismatched type sizes. */
.strip-start .readout b,
.center-cluster .readout b {
  font-size: var(--text-readout);
}
</style>
