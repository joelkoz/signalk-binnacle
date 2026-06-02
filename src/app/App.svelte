<script lang="ts">
import { Layers, LocateFixed, SlidersHorizontal, Spline, Volume2, VolumeX } from '@lucide/svelte';
import { onDestroy, onMount } from 'svelte';
import { AisTargets } from '$entities/ais';
import { CollisionAssessment } from '$entities/collision';
import { type TrackPoint, TrackRecorder } from '$entities/track';
import { OwnVessel } from '$entities/vessel';
import { AuthBanner } from '$features/auth-banner';
import { LayersPanel, type LayersView } from '$features/layers-panel';
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
  SpeedLegend,
  savedTracksToFeatures,
  saveTrack,
  TracksPanel,
} from '$features/tracks';
import { formatLatitude, formatLongitude, PLACEHOLDER } from '$shared/lib';
import { type LayerSettings, mapThemePaint } from '$shared/map';
import { OnlineStatus, registerPwa } from '$shared/pwa';
import {
  createMapView,
  createThresholds,
  createTrackSettings,
  isMapView,
  type MapView,
  PersistedValue,
} from '$shared/settings';
import type { Context } from '$shared/signalk';
import {
  AuthController,
  createSignalKClient,
  SELF_CONTEXT,
  SignalKStore,
  SK_PATHS,
  serverOrigin,
  streamUrl,
} from '$shared/signalk';
import { createTrackStore } from '$shared/storage';
import { createThemeController, type Theme } from '$shared/ui';
import { ChartCanvas, type MapCommands } from '$widgets/chart-canvas';

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
let recolorMap: ((theme: Theme) => void) | undefined;
let chartsToken = $state<string | undefined>();

// The selected POI and a cache-owning detail loader, both set once auth resolves.
let selectedNote = $state<NoteSelection | undefined>();
let noteLoader = $state<NoteDetailLoader | undefined>();
let mapView = $state<MapView | undefined>();
let updateReady = $state(false);
const pwa = registerPwa(() => (updateReady = true));

const theme = createThemeController((next) => recolorMap?.(next));

// Track speed-legend colors follow the active theme's track paint tokens.
const legendPaint = $derived(mapThemePaint(theme.theme));

// Profile state restored across visits: the last map view and the layer settings.
const mapViewStore = createMapView();
const savedView = isMapView(mapViewStore.value) ? mapViewStore.value : undefined;
const layerSettings = new PersistedValue<LayerSettings>('binnacle:layers', {});

// The view changes once per animation frame while panning; persist only after it
// settles so a drag is one write, not hundreds.
let viewSaveTimer: ReturnType<typeof setTimeout> | undefined;
function onViewChange(view: MapView): void {
  mapView = view;
  if (viewSaveTimer) clearTimeout(viewSaveTimer);
  viewSaveTimer = setTimeout(() => mapViewStore.set(view), 400);
}

let mapCommands = $state<MapCommands | undefined>();

// The app menu's action options. Adding one is a single entry here; the layers controls
// are rendered into the menu as a submenu below (see the AppMenu children).
const menuItems = $derived<MenuItem[]>([
  {
    id: 'center-on-boat',
    label: 'Center on boat',
    icon: LocateFixed,
    onSelect: () => mapCommands?.centerOnVessel(),
  },
  {
    id: 'mute-alarm',
    label: alarmMuted.value ? 'Unmute alarm' : 'Mute alarm',
    icon: alarmMuted.value ? VolumeX : Volume2,
    onSelect: () => alarmMuted.set(!alarmMuted.value),
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

const CONNECTION_LABELS: Record<string, string> = {
  open: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  closed: 'Not connected',
};

const connectionLabel = $derived(CONNECTION_LABELS[store.connection.phase] ?? 'Not connected');

const fmt = (value: number | undefined, digits: number) =>
  value === undefined ? PLACEHOLDER : value.toFixed(digits);

let accessTimer: ReturnType<typeof setTimeout> | undefined;

// Resolve once the server is open to us: either unsecured or an approved token. A
// denied or still-pending request never resolves, so the stream stays disconnected
// until the user re-requests; the pending timer is cleared on destroy.
function waitForAccess(): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (auth.status === 'authenticated' || auth.status === 'unsecured') resolve();
      else accessTimer = setTimeout(tick, 500);
    };
    tick();
  });
}

onMount(async () => {
  window.addEventListener('pointerdown', primeAudio, { once: true });
  await auth.probe();
  await waitForAccess();
  const token = auth.token ?? undefined;
  chartsToken = token;
  noteLoader = createNoteDetailLoader(serverOrigin(), token);
  await client.connect(streamUrl(token), (frame) => store.applyFrame(frame));
  await client.raw.subscribe([
    { path: SK_PATHS.headingTrue, policy: 'instant', minPeriod: 200 },
    { path: SK_PATHS.position, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.courseOverGroundTrue, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.speedOverGround, policy: 'instant', minPeriod: 1000 },
  ]);
  await client.raw.subscribe([
    { path: SK_PATHS.position, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.courseOverGroundTrue, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.speedOverGround, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.headingTrue, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.name, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.aisShipType, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.closestApproach, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
  ]);
  await refreshSavedTracks();
});

onDestroy(() => {
  if (accessTimer) clearTimeout(accessTimer);
  if (viewSaveTimer) clearTimeout(viewSaveTimer);
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
        {#if layersView}
          <MenuSubmenu label="Layers" icon={Layers}>
            <LayersPanel view={layersView} />
          </MenuSubmenu>
        {/if}
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
      {trackSettings}
      savedTracks={savedSource}
      {chartsToken}
      initialView={savedView}
      savedLayers={layerSettings.value}
      onLayersChange={(settings) => layerSettings.set(settings)}
      onReady={(view) => (layersView = view)}
      onMapReady={(recolor) => {
        recolorMap = recolor;
        recolor(theme.theme);
      }}
      onCommandsReady={(commands) => (mapCommands = commands)}
      {onViewChange}
      onNoteSelect={(selection) => (selectedNote = selection)}
    />
    <div class="banner-slot">
      <AuthBanner {auth} />
    </div>
    <div class="danger-slot">
      <DangerStrip {collision} />
    </div>
    {#if trackSettings.value.colorMode === 'speed'}
      <div class="legend-slot">
        <SpeedLegend
          slow={legendPaint.trackSlow}
          mid={legendPaint.trackMid}
          fast={legendPaint.trackFast}
        />
      </div>
    {/if}
    {#if selectedNote && noteLoader}
      <div class="note-panel-slot">
        <NoteDetailPanel selection={selectedNote} load={noteLoader.load} onClose={closeNote} />
      </div>
    {/if}
  </section>
  <footer class="status-strip">
    <span class="status" role="status" aria-live="polite">{connectionLabel}</span>
    {#if !net.online}
      <span class="readout offline" role="status" aria-live="polite">Offline</span>
    {/if}
    <span class="readout">SOG <b>{fmt(vessel.sogKnots, 1)}</b> kn</span>
    <span class="readout">COG <b>{fmt(vessel.cogDegrees, 0)}</b>&deg;</span>
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
  block-size: 100vh;
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
.legend-slot {
  position: absolute;
  inset-block-start: 0.75rem;
  inset-inline-end: 0.75rem;
  z-index: var(--z-overlay);
}
.note-panel-slot {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  z-index: var(--z-panel);
}
@media (max-width: 600px) {
  .note-panel-slot {
    inset-block-start: auto;
    inset-inline: 0;
  }
}
.danger-slot :global(.danger-strip) {
  pointer-events: auto;
}
.status-strip {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.5rem 1rem;
  border-block-start: 1px solid var(--border);
  color: var(--text-muted);
  font-size: var(--text-md);
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
