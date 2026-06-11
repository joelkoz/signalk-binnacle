<script lang="ts">
import {
  Anchor,
  Bell,
  BellOff,
  CloudSun,
  Layers,
  LocateFixed,
  Navigation,
  Radar,
  Route,
  Ruler,
  SlidersHorizontal,
  Spline,
  UserCog,
  Volume2,
  VolumeX,
  Waves,
} from '@lucide/svelte';
import { onDestroy, onMount, tick } from 'svelte';
import { AisTargets } from '$entities/ais';
import { AnchorWatch } from '$entities/anchor';
import { CollisionAssessment } from '$entities/collision';
import { CourseGuidance } from '$entities/course';
import { MeasureStore } from '$entities/measure';
import { type MobMark, MobStore } from '$entities/mob';
import {
  type Profile,
  type ProfileSettings,
  ProfileStore,
  SignalKProfileAdapter,
} from '$entities/profile';
import { RouteStore, remainingRouteDistanceMeters, reverseRoute } from '$entities/route';
import { TidesStore } from '$entities/tides';
import { type TrackPoint, TrackRecorder } from '$entities/track';
import { type UserChartSource, UserCharts, userChartToSignalK } from '$entities/user-charts';
import { OwnVessel } from '$entities/vessel';
import { WeatherStore } from '$entities/weather';
import { AisListPanel } from '$features/ais-list';
import {
  ANCHOR_TONE,
  AnchorPanel,
  AnchorStrip,
  dropAnchorOnServer,
  putServerAnchorPosition,
  raiseServerAnchor,
  setServerRadius,
} from '$features/anchor-watch';
import { AuthBanner } from '$features/auth-banner';
import { deleteChart, putChart } from '$features/charts';
import { LayersPanel, type LayersView } from '$features/layers-panel';
import {
  CollisionMute,
  CollisionNotifier,
  DangerStrip,
  LookoutAlarm,
  ThresholdsPanel,
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
} from '$features/notes';
import {
  createProfileBindings,
  downloadProfileJson,
  ProfileSwitcher,
  ProfilesPanel,
  parseProfilesJson,
} from '$features/profiles';
import {
  activateRoute,
  advancePoint,
  clearCourse,
  deleteRoute,
  downloadRouteGpx,
  fetchRoutes,
  hydrateCourse,
  parseGpxRoutes,
  RoutesPanel,
  saveRoute,
  setDestination,
} from '$features/routing';
import { ThemeToggle } from '$features/theme-toggle';
import { createTidesLoader, TidesPanel } from '$features/tides';
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
import {
  createWeatherLoader,
  defaultProviderName,
  fetchWeatherProviders,
  WEATHER_LAYER_IDS,
} from '$features/weather';
import { GatedAlarm } from '$shared/audio';
import type { LatLon } from '$shared/geo';
import {
  Clock,
  formatBearingOr,
  formatCpaNm,
  formatFixed,
  formatKnotsOr,
  formatLatitude,
  formatLongitude,
  formatTcpaMin,
  uuidv4,
} from '$shared/lib';
import type { LayerSettings } from '$shared/map';
import { etaSeconds } from '$shared/nav';
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
// A one-second reactive clock drives every staleness check (a frozen GPS fix, a dropped feed), so
// they re-evaluate even while no data arrives. Disposed on teardown.
const clock = new Clock();
const vessel = new OwnVessel(store, clock);
const aisTargets = new AisTargets(store);
const client = createSignalKClient();
const auth = new AuthController(serverOrigin());
const net = new OnlineStatus();
const thresholds = createThresholds();
const collision = new CollisionAssessment(vessel, aisTargets, thresholds);
const lookoutAlarm = new LookoutAlarm();
// The collision mute is session-only with a bounded auto-expiring window (see CollisionMute): a mute
// set in a crowded anchorage must never carry silently into the next passage or across a reload, and
// a close, imminent contact escalates past it. Deliberately not a PersistedValue and not part of a
// profile bundle.
const collisionMute = new CollisionMute(clock);
// So other Signal K clients and devices see the same collision alert.
const collisionNotifier = new CollisionNotifier(
  (path, value) =>
    void client.publish({ context: SELF_CONTEXT, updates: [{ values: [{ path, value }] }] }),
);

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
const tidesLoader = createTidesLoader();

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
// The edge-docked panels (routes, layers, tracks, collision thresholds) are mutually exclusive: one
// docks at the leading edge at a time. A single active-panel value enforces that structurally, so
// opening one closes whatever was open without each opener having to clear the others by hand.
type LeftPanel =
  | 'routes'
  | 'layers'
  | 'tracks'
  | 'tides'
  | 'ais'
  | 'anchor'
  | 'thresholds'
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
const profileStore = new ProfileStore();
// True only while a profile is being applied, so the dirty-tracking effect below does not flag the
// active profile as edited by its own apply writes. A plain flag, not reactive, read inside the effect.
let applying = false;
// Handed up by the weather mini-map once it is ready, to push a weather-layer snapshot at runtime.
let applyWeatherLayers = $state<((settings: LayerSettings) => void) | undefined>();

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
// and the top-bar switcher can offer to save the change.
$effect(() => {
  profileBindings.track();
  // markDirty owns the "only when a profile is active" guard, so this effect does not read activeId
  // (which would add a needless dependency that re-runs it on every profile switch).
  if (!applying) profileStore.markDirty();
});

// Seed three starter profiles on first run (no stored profiles), so the feature is not empty and
// teaches the concept. They capture the current defaults and vary the theme; the navigator edits them.
// The ids are stable so the same starters seeded on two devices merge to one on sync, not duplicate.
$effect(() => {
  if (profileStore.profiles.length > 0) return;
  const base = captureProfileSettings();
  const now = Date.now();
  const starter = (id: string, name: string, settings: ProfileSettings): Profile => ({
    id,
    name,
    settings,
    createdAt: now,
    updatedAt: now,
  });
  profileStore.seed([
    starter('binnacle-seed-coastal-day', 'Coastal day', { ...base, theme: 'day' }),
    starter('binnacle-seed-night-passage', 'Night passage', { ...base, theme: 'night-red' }),
    starter('binnacle-seed-at-anchor', 'At anchor', { ...base, theme: 'dusk' }),
  ]);
});

// Once the user is authenticated to a secured server, sync profiles through the SignalK applicationData
// API so they follow the user across devices. Runs once; an unsecured server (status 'unsecured', no
// token) keeps profiles local, since applicationData is disabled without security.
let profilesSynced = false;
$effect(() => {
  if (profilesSynced) return;
  if (auth.status !== 'authenticated' || !auth.token) return;
  profilesSynced = true;
  void profileStore.syncWithServer(new SignalKProfileAdapter(serverOrigin(), auth.token));
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

// Import each valid profile from the picked JSON as a new saved profile (a fresh id, so an import never
// overwrites an existing one); malformed entries are dropped by the parser.
function onImportProfiles(json: string): void {
  for (const imported of parseProfilesJson(json)) {
    profileStore.save(imported.name, imported.settings);
  }
}

// User-imported PMTiles charts: the descriptor list is persisted, the files live in the browser
// PMTiles store, and the chart-canvas registers an overlay per source.
const pmtilesStore = createPmtilesStore();
const userChartsStore = new PersistedValue<UserChartSource[]>('binnacle:user-charts', []);
const userCharts = new UserCharts(
  pmtilesStore,
  userChartsStore.value,
  (sources) => userChartsStore.set(sources),
  // Fly to a freshly imported chart so the user sees it, even when it covers a different area than
  // the current view (charts without known bounds, rare, leave the view unchanged). For a URL chart
  // also register it as a server resource, best-effort, so other Signal K devices discover it. A
  // file chart's bytes cannot be hosted on a stock server, so it stays local.
  (source) => {
    if (source.bounds) mapCommands?.fitBounds(source.bounds);
    if (source.origin.type === 'url' && chartsToken) {
      void putChart(serverOrigin(), chartsToken, userChartToSignalK(source, source.origin.url));
    }
  },
  // On removal, also delete a URL chart's server resource (best-effort); a file chart was never
  // synced, so there is nothing on the server to remove. Gated on a token, like the register above:
  // without auth the write only earns a 401, so do not bother issuing it.
  (source) => {
    if (source.origin.type === 'url' && chartsToken) {
      void deleteChart(serverOrigin(), chartsToken, source.id);
    }
  },
);
// Reclaim any orphaned PMTiles blob (a leftover from a failed-persist import or a degraded delete)
// once at startup, but only when the descriptor set was actually read from storage: a missing or
// unreadable set must never delete a valid chart's blob.
if (userChartsStore.fromStorage) void userCharts.reconcile();
let userChartRegistrar = $state<UserChartRegistrar | undefined>();
const registeredUserCharts = new Map<string, string | undefined>();

// The view changes once per animation frame while panning; persist only after it
// settles so a drag is one write, not hundreds.
let viewSaveTimer: ReturnType<typeof setTimeout> | undefined;
function onViewChange(view: MapView): void {
  mapView = view;
  if (viewSaveTimer) clearTimeout(viewSaveTimer);
  viewSaveTimer = setTimeout(() => {
    mapViewStore.set(view);
    // Refresh tides for the settled view; the loader skips small moves and dedups in flight.
    void tidesLoader.load(tidesStore, view.lat, view.lon);
  }, 400);
}

// Load tides for the current view, so opening the Tides panel shows data without a pan first.
function loadTides(): void {
  const view = mapView ?? savedView;
  if (view) void tidesLoader.load(tidesStore, view.lat, view.lon);
}

let mapCommands = $state<MapCommands | undefined>();

// Follow lock: while on, the map recenters on the boat as each fix arrives. A manual pan
// (dragging the chart) releases it; it does not persist across reloads.
let following = $state(false);

// The app menu's options, grouped from the data: a Navigation group of panel-openers, then an Alarms
// group of the two mute toggles and the threshold editor. Center and Follow live on the bottom status
// strip, not here. Adding an option is a single entry; the menu renders and groups whatever it is given.
const menuItems = $derived<MenuItem[]>([
  {
    id: 'profiles',
    label: 'Profiles',
    icon: UserCog,
    group: 'Navigation',
    onSelect: () => openPanel('profiles'),
  },
  {
    id: 'tracks',
    label: 'Tracks',
    icon: Spline,
    group: 'Navigation',
    onSelect: () => openPanel('tracks'),
  },
  {
    id: 'routes',
    label: 'Routes',
    icon: Route,
    group: 'Navigation',
    disabled: !mapCommands,
    onSelect: () => openPanel('routes'),
  },
  {
    id: 'tides',
    label: 'Tides',
    icon: Waves,
    group: 'Navigation',
    onSelect: () => {
      openPanel('tides');
      loadTides();
    },
  },
  {
    id: 'ais',
    label: 'AIS targets',
    icon: Radar,
    group: 'Navigation',
    onSelect: () => openPanel('ais'),
  },
  {
    id: 'measure',
    label: 'Measure distance',
    icon: Ruler,
    group: 'Navigation',
    onSelect: () => measure.start(),
  },
  {
    id: 'layers',
    label: 'Layers and charts',
    icon: Layers,
    group: 'Navigation',
    disabled: !layersView,
    onSelect: () => openPanel('layers'),
  },
  {
    id: 'anchor',
    label: 'Anchor watch',
    icon: Anchor,
    group: 'Alarms',
    onSelect: () => openPanel('anchor'),
  },
  {
    id: 'mute-alarm',
    label: 'Mute alarm',
    icon: collisionMute.active ? VolumeX : Volume2,
    group: 'Alarms',
    pressed: collisionMute.active,
    onSelect: () => collisionMute.toggle(),
  },
  {
    id: 'mute-arrival',
    label: 'Mute arrival',
    icon: arrivalMuted.value ? BellOff : Bell,
    group: 'Alarms',
    pressed: arrivalMuted.value,
    onSelect: () => arrivalMuted.set(!arrivalMuted.value),
  },
  {
    id: 'collision-thresholds',
    label: 'Collision thresholds',
    icon: SlidersHorizontal,
    group: 'Alarms',
    onSelect: () => openPanel('thresholds'),
  },
]);

// Sound the collision alarm whenever the assessment, acknowledgement, mute, or escalation changes.
// Escalation past the inner ring overrides both acknowledge and mute, so a close, imminent contact
// always sounds.
$effect(() => {
  lookoutAlarm.update(
    collision.assessment.worst,
    collision.suppressed,
    collisionMute.active,
    collision.escalating,
  );
});

// A concise spoken summary of the active collision danger, written into a persistent assertive live
// region so a new threat is announced for a screen-reader or hard-of-hearing operator, not only
// sounded. It mirrors the danger strip's own visibility (contacts present and not acknowledged),
// and contacts[0] is the worst since the list is severity-then-time sorted.
const collisionAlert = $derived.by(() => {
  const { contacts } = collision.assessment;
  if (collision.suppressed || contacts.length === 0) return '';
  const nearest = contacts[0];
  const who = nearest.name || nearest.id;
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
function onMobTrigger(mark: MobMark | undefined): void {
  const committed = mob.trigger(mark);
  publishMobValue(mobNotification(committed.position));
  if (committed.position) {
    mapCommands?.flyTo(committed.position.latitude, committed.position.longitude);
  }
}

function onMobCancel(): void {
  mob.cancel();
  publishMobValue(mobClearNotification());
}

// The deliberate second tap: hand the mark to the course system via the existing goto plumbing.
function onMobSteer(): void {
  const mark = mob.position;
  if (mark) void onGoToHere(mark);
}

// An anchor error shown in the panel until the next anchor action (the boat-error persistence
// rationale on routeError applies here too).
let anchorError = $state<string | undefined>();

async function onDropAnchor(): Promise<void> {
  anchorError = undefined;
  const position = vessel.position;
  if (!position) return;
  const radius = anchor.preferredRadiusMeters;
  // The server drop doubles as the plugin detection: when the anchoralarm plugin answers, it owns
  // the watch (and keeps alarming with the browser closed) and the stream reflects it back. Any
  // failure degrades to the client-side watch; the panel's mode line says which one is running.
  if (await dropAnchorOnServer(serverOrigin(), chartsToken, radius)) return;
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
    () => raiseServerAnchor(serverOrigin(), chartsToken),
    'raise the anchor',
    () => anchor.raiseLocal(),
  );
}

function onSetAnchorRadius(meters: number): Promise<void> {
  anchor.rememberRadius(meters);
  return anchorAction(
    () => setServerRadius(serverOrigin(), chartsToken, meters),
    'set the radius',
    () => anchor.setRadiusLocal(meters),
  );
}

function onAnchorMoved(position: LatLon): Promise<void> {
  return anchorAction(
    () => putServerAnchorPosition(serverOrigin(), chartsToken, position),
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
  const id = uuidv4();
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

// True while a single "go to here" destination is the active course (no saved route is active). It
// is the goto counterpart to routeStore.activeId, so arrival and reconnect rehydration cover both.
let gotoActive = $state(false);
const courseActive = $derived(routeStore.activeId !== undefined || gotoActive);

// Clear the active course on the server and locally. Returns whether the server clear succeeded; the
// local state is cleared only on success, so a failed stop does not desync from a server that is
// still navigating (the next course delta would otherwise revive the nav strip).
async function stopActiveCourse(): Promise<boolean> {
  if (!(await clearCourse(serverOrigin(), chartsToken))) return false;
  routeStore.setActive(undefined);
  gotoActive = false;
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
  // The Signal K resources API requires a UUID for standard route ids, so this must be a real UUID.
  routeStore.setWorking({ id: uuidv4(), name: '', waypoints: [] });
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

// Seed the course cells once from a REST GET, then the stream keeps them live. The v2
// navigation.course paths are not in the v1 full model, so under subscribe=none the stream sends
// nothing until the next change; this makes the nav strip show values immediately on activation.
async function hydrateAndSeedCourse(): Promise<void> {
  const { info, calc } = await hydrateCourse(serverOrigin(), chartsToken);
  courseGuidance.seed(info, calc);
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
function onSkipPoint(delta: number): void {
  void advancePoint(serverOrigin(), chartsToken, delta);
}

// Save the current track as a reusable route, without stopping or clearing the recording, so a
// sailed passage becomes a plan that can be followed again.
async function onSaveTrackAsRoute(name: string): Promise<void> {
  clearRouteError();
  if (recorder.points.length < 2) return;
  const route = trackToRoute(recorder.points, name);
  if (!(await saveRoute(serverOrigin(), chartsToken, route))) {
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
  if (!(await saveRoute(serverOrigin(), chartsToken, route))) {
    flagRouteError('Could not build the route home.');
    return;
  }
  await refreshRoutes();
  if (!(await activateRoute(serverOrigin(), chartsToken, `/resources/routes/${route.id}`))) {
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
  if (!(await saveRoute(serverOrigin(), chartsToken, reversed))) {
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
    if (await saveRoute(serverOrigin(), chartsToken, route)) saved.push(route.id);
  }
  if (saved.length === 0) {
    flagRouteError('Could not save the imported route.');
    return;
  }
  await refreshRoutes();
  for (const id of saved) routeStore.toggleShown(id, true);
}

// Navigate straight to a point the user picked on the chart (long-press or right-click, then "Go to
// here"). A single destination replaces any active route on the server, so clear the local active
// route and mark the goto active, then seed the nav strip from a one-time hydration.
async function onGoToHere(position: LatLon): Promise<void> {
  clearRouteError();
  if (!(await setDestination(serverOrigin(), chartsToken, position))) {
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
      void advancePoint(serverOrigin(), chartsToken, 1).then((ok) => {
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

// On a stream reconnect, re-hydrate what the resubscribe cannot redeliver. The v2 navigation.course
// paths are not in the v1 full model, so under subscribe=none the server sends no cached course
// value on resubscribe, only the next change: without this an active course would freeze on its
// pre-drop geometry (and the arrival alarm and auto-advance would run on stale values) until the
// course next changed. Self-vessel paths are in the v1 model and recover on their own; routes are
// REST resources, so refresh them too. The first open is handled by connectStream; only a later
// open (a genuine reconnect) re-hydrates.
let everOpen = false;
let lastConnectionPhase: ConnectionPhase | undefined;
$effect(() => {
  const phase = store.connection.phase;
  const reconnected = phase === 'open' && lastConnectionPhase !== 'open' && everOpen;
  lastConnectionPhase = phase;
  if (phase === 'open') everOpen = true;
  if (!reconnected) return;
  void refreshRoutes();
  if (courseActive) void hydrateAndSeedCourse();
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
    { path: SK_PATHS.depthBelowTransducer, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.anchorPosition, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.anchorMaxRadius, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.anchorNotification, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.mobNotification, policy: 'instant', minPeriod: 1000 },
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
  if (viewSaveTimer) clearTimeout(viewSaveTimer);
  if (arrivalBannerTimer) clearTimeout(arrivalBannerTimer);
  // Revoke any object URLs still held for file-backed user charts so they do not leak on teardown.
  for (const blobUrl of registeredUserCharts.values()) {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
  window.removeEventListener('pointerdown', primeAudio);
  lookoutAlarm.stop();
  anchorAlarm.stop();
  mobAlarm.stop();
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
    <MobButton
      {mob}
      onTrigger={onMobTrigger}
      onLocate={(position) => mapCommands?.flyTo(position.latitude, position.longitude)}
    />
    <span class="topbar-actions">
      {#if collisionMute.active}
        <button
          type="button"
          class="btn btn-pill btn-warning"
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
      {store}
      {vessel}
      {aisTargets}
      {anchor}
      {mob}
      {measure}
      {collision}
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
      onAnchorMoved={(position) => void onAnchorMoved(position)}
    />
    <div class="banner-slot">
      <AuthBanner {auth} requestsUrl={accessRequestsUrl} />
    </div>
    {#if arrivalBanner}
      <div class="arrival-banner" role="status">Arrived at {arrivalBanner}</div>
    {/if}
    <div class="bottom-stack">
      <NavStrip
        guidance={courseGuidance}
        {routeProgress}
        onStop={onStopCourse}
        onSkip={routeStore.activeId !== undefined ? onSkipPoint : undefined}
      />
      <MeasureStrip {measure} />
      <AnchorStrip {anchor} onRaise={() => void onRaiseAnchor()} />
      <DangerStrip
        {collision}
        muted={collisionMute.active}
        onToggleMute={() => collisionMute.toggle()}
      />
      <MobStrip {mob} onSteer={onMobSteer} onCancel={onMobCancel} />
    </div>
    {#if selectedNote && noteLoader}
      <div class="note-panel-slot">
        <NoteDetailPanel selection={selectedNote} load={noteLoader.load} onClose={closeNote} />
      </div>
    {/if}
    {#if activePanel === 'layers' && layersView}
      <div class="panel-slot">
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
          error={routeError}
          onNew={onNewRoute}
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
          onClose={() => {
            onCancelRouteEdit();
            clearRouteError();
            closePanel();
          }}
          onBack={() => {
            onCancelRouteEdit();
            clearRouteError();
            backToMenu();
          }}
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
          onClose={closePanel}
          onBack={backToMenu}
        />
      </div>
    {/if}
    {#if activePanel === 'tides'}
      <div class="panel-slot">
        <TidesPanel store={tidesStore} onClose={closePanel} onBack={backToMenu} />
      </div>
    {/if}
    {#if activePanel === 'ais'}
      <div class="panel-slot">
        <AisListPanel
          {aisTargets}
          {vessel}
          {collision}
          onLocate={(position) => mapCommands?.flyTo(position.latitude, position.longitude)}
          onClose={closePanel}
          onBack={backToMenu}
        />
      </div>
    {/if}
    {#if activePanel === 'anchor'}
      <div class="panel-slot">
        <AnchorPanel
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
    {#if activePanel === 'thresholds'}
      <div class="panel-slot">
        <ThresholdsPanel {thresholds} onClose={closePanel} onBack={backToMenu} />
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
        loader={weatherLoader}
        theme={theme.theme}
        initialView={mapView ?? savedView}
        savedView={savedWeatherView}
        onViewChange={(view) => weatherViewStore.set(view)}
        savedLayers={weatherLayerSettings.value}
        onLayersChange={(settings) => weatherLayerSettings.set(settings)}
        onLayersReady={(apply) => (applyWeatherLayers = apply)}
        token={chartsToken}
        providerName={weatherProviderName}
        position={vessel.position}
        onClose={() => (weatherPanelOpen = false)}
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
          class:anchor-chip--alarm={anchor.dragging}
          role="status"
          title="Anchor watch: distance from the anchor over the watch radius"
        >
          Anchor <b>{formatFixed(anchor.distanceMeters, 0)}</b>/<b
            >{formatFixed(anchor.radiusMeters, 0)}</b
          >
          m
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
      <button
        type="button"
        class="btn btn-pill"
        class:is-on={weatherPanelOpen}
        aria-expanded={weatherPanelOpen}
        aria-haspopup="true"
        aria-controls={weatherPanelOpen ? 'weather-panel' : undefined}
        onclick={() => (weatherPanelOpen = !weatherPanelOpen)}
      >
        <CloudSun size={16} aria-hidden="true" />
        Forecast
      </button>
    </div>
    <div class="center-cluster">
      <span class="readout">View</span>
      <span class="readout"><b>{formatLatitude(mapView?.lat)}</b></span>
      <span class="readout"><b>{formatLongitude(mapView?.lon)}</b></span>
      <span class="readout">z<b>{formatFixed(mapView?.zoom, 1)}</b></span>
    </div>
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
/* On a phone the brand yields its version string so the muted badge and the Update pill keep room. */
@media (max-width: 600px) {
  .version {
    display: none;
  }
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
  /* Above the weather panel (z-panel + 1) so an active collision danger and its Mute and Acknowledge
     stay reachable while the Forecast mini-map is open. The danger strip is a safety surface, so it
     sits over every panel; only the menu (z-menu) is higher. */
  z-index: calc(var(--z-panel) + 2);
}
.bottom-stack :global(.bottom-strip) {
  pointer-events: auto;
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
/* Center, Follow, and Forecast read as one row of matching labeled pills in the flexible middle. They
   wrap rather than overflow when a narrow phone leaves too little width. */
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
   strip stacks into one centered column: the readouts above, and Center, Follow, and Forecast on a
   single row below within thumb reach. The duplicate position cluster drops (the chart and panels
   still report it); the connection dot is small enough to stay. This block sits after the base rules
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
