<script lang="ts">
import maplibregl from 'maplibre-gl';
import { onDestroy, onMount } from 'svelte';
import type { AisTargets } from '$entities/ais';
import type { CollisionAssessment } from '$entities/collision';
import type { TrackRecorder } from '$entities/track';
import type { OwnVessel } from '$entities/vessel';
import type { WeatherStore } from '$entities/weather';
import { createAisOverlay } from '$features/ais-layer';
import { fetchCharts } from '$features/charts';
import { createStreamingChartOverlay, STREAMING_CHART_SOURCES } from '$features/depth-charts';
import { LayersView } from '$features/layers-panel';
import { createCollisionOverlay } from '$features/lookout';
import { createNotesOverlay, type NoteSelection } from '$features/notes';
import { createTrackOverlay, type SavedTracksSource } from '$features/track-layer';
import { createVesselOverlay } from '$features/vessel-layer';
import {
  createCloudOverlay,
  createPrecipOverlay,
  createPressureOverlay,
  createRadarOverlay,
  createWavesOverlay,
  createWindOverlay,
} from '$features/weather';
import {
  applyBaseTheme,
  baseStyleUrl,
  beforeIdFor,
  captureBaseTheme,
  chartSourceId,
  createChartOverlay,
  installSentinels,
  LayerManager,
  type LayerSettings,
  mapThemePaint,
  type OverlayContext,
  registerPmtilesProtocol,
  restoreBaseTheme,
} from '$shared/map';
import type { MapView, PersistedValue, TrackSettings } from '$shared/settings';
import { type SignalKStore, serverOrigin } from '$shared/signalk';
import type { Theme } from '$shared/ui';
import type { MapCommands, UserChartRegistrar } from './commands';

interface Props {
  store: SignalKStore;
  vessel: OwnVessel;
  aisTargets: AisTargets;
  collision: CollisionAssessment;
  recorder: TrackRecorder;
  weather: WeatherStore;
  trackSettings: PersistedValue<TrackSettings>;
  // Saved tracks to draw, pulled each frame so show/hide and edits reflect without a remount.
  savedTracks?: SavedTracksSource;
  chartsToken?: string;
  // The view to open at, restored from the last visit; defaults to a world view.
  initialView?: MapView;
  // Saved per-layer visibility and opacity, and a sink for changes to persist.
  savedLayers?: LayerSettings;
  onLayersChange?: (settings: LayerSettings) => void;
  // Saved bottom-to-top order of non-pinned layers, and a sink for reorder changes.
  savedOrder?: string[];
  onOrderChange?: (order: string[]) => void;
  onReady?: (view: LayersView) => void;
  onMapReady?: (recolor: (theme: Theme) => void) => void;
  onCommandsReady?: (commands: MapCommands) => void;
  onUserChartsReady?: (registrar: UserChartRegistrar) => void;
  onViewChange?: (view: MapView) => void;
  onNoteSelect?: (selection: NoteSelection | undefined) => void;
  // Fired when the user pans the map by hand (a drag), so a follow lock can release.
  onUserPan?: () => void;
  // Fired on a map tap with the tapped position, for the weather readout.
  onMapTap?: (lngLat: { lng: number; lat: number }) => void;
}

const {
  store,
  vessel,
  aisTargets,
  collision,
  recorder,
  weather,
  trackSettings,
  savedTracks,
  chartsToken,
  initialView,
  savedLayers,
  onLayersChange,
  savedOrder,
  onOrderChange,
  onReady,
  onMapReady,
  onCommandsReady,
  onUserChartsReady,
  onViewChange,
  onNoteSelect,
  onUserPan,
  onMapTap,
}: Props = $props();

const DEFAULT_CENTER: [number, number] = [0, 30];
const DEFAULT_ZOOM = 2;

let container: HTMLDivElement;
let map: maplibregl.Map | undefined;
let manager: LayerManager | undefined;
let frame = 0;
let destroyed = false;

registerPmtilesProtocol();

onMount(() => {
  try {
    map = new maplibregl.Map({
      container,
      style: baseStyleUrl(),
      center: initialView ? [initialView.lon, initialView.lat] : DEFAULT_CENTER,
      zoom: initialView ? initialView.zoom : DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
  } catch (error) {
    console.error('Map failed to initialize', error);
    return;
  }

  const mapInstance = map;
  // The 'move' event fires many times per drag frame; coalesce to one emit per
  // animation frame so the status strip updates at display rate, not per pixel.
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
  // A drag is the only user gesture that should release a follow lock. dragstart fires only for
  // hand panning (not for programmatic setCenter or for scroll-zoom), so following survives a
  // zoom but ends the moment the user drags the chart away from the boat.
  mapInstance.on('dragstart', () => onUserPan?.());
  mapInstance.on('click', (e) => onMapTap?.({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
  mapInstance.on('load', async () => {
    emitView();
    const ctx: OverlayContext = { map: mapInstance, beforeIdFor };
    installSentinels(mapInstance);
    manager = new LayerManager(ctx, {
      saved: savedLayers,
      onChange: onLayersChange,
      savedOrder,
      onOrderChange,
      // The own vessel and active collision alarms stay pinned on top so a chart or traffic
      // can never hide them; bottom to top, collision sits just beneath the vessel.
      pinned: ['collision', 'own-vessel'],
    });

    const charts = await fetchCharts(serverOrigin(), chartsToken);
    if (destroyed) return;
    for (const chart of charts) {
      await manager.register(createChartOverlay(chart, serverOrigin()));
      if (destroyed) return;
    }

    // App-provided streaming bathymetry sources (off by default), registered after the
    // server charts so they sit just above the base in the bathymetry band.
    for (const source of STREAMING_CHART_SOURCES) {
      await manager.register(createStreamingChartOverlay(source));
      if (destroyed) return;
    }

    // Register waves first so the height field sits at the bottom of the weather band, with the
    // wind arrows and pressure isobars drawn over it.
    const wavesOverlay = createWavesOverlay(weather);
    await manager.register(wavesOverlay);
    if (destroyed) return;

    const precipOverlay = createPrecipOverlay(weather);
    await manager.register(precipOverlay);
    if (destroyed) return;

    const cloudOverlay = createCloudOverlay(weather);
    await manager.register(cloudOverlay);
    if (destroyed) return;

    const radarOverlay = createRadarOverlay(weather);
    await manager.register(radarOverlay);
    if (destroyed) return;

    const windOverlay = createWindOverlay(weather);
    await manager.register(windOverlay);
    if (destroyed) return;

    const pressureOverlay = createPressureOverlay(weather);
    await manager.register(pressureOverlay);
    if (destroyed) return;

    const notesOverlay = createNotesOverlay(serverOrigin(), chartsToken, onNoteSelect);
    await manager.register(notesOverlay);
    if (destroyed) return;

    const aisOverlay = createAisOverlay(aisTargets, store);
    await manager.register(aisOverlay);
    if (destroyed) return;

    const collisionOverlay = createCollisionOverlay(collision);
    await manager.register(collisionOverlay);
    if (destroyed) return;

    // Register the trail before the vessel so the boat draws on top of its own track.
    const trackOverlay = createTrackOverlay(recorder, trackSettings, savedTracks);
    await manager.register(trackOverlay);
    if (destroyed) return;

    const overlay = createVesselOverlay(vessel);
    await manager.register(overlay);
    if (destroyed) return;

    const view = new LayersView(manager);
    view.refresh();
    onReady?.(view);

    const userChartRegistrar: UserChartRegistrar = {
      register: async (chart) => {
        if (destroyed || !manager) return;
        await manager.register(createChartOverlay(chart, serverOrigin(), 'bathymetry'));
        view.refresh();
      },
      unregister: (identifier) => {
        manager?.unregister(chartSourceId(identifier));
        view.refresh();
      },
    };
    onUserChartsReady?.(userChartRegistrar);

    // Snapshot the source style's own colors now, before any recolor, so the day theme can
    // restore the real map rather than approximate it.
    const baseColors = captureBaseTheme(mapInstance, mapThemePaint('day'));

    const recolor = (theme: Theme) => {
      const paint = mapThemePaint(theme);
      // Day shows the source style's real colors; dusk and night-red recolor the base map
      // (background, water, landcover, roads, boundaries, labels). Each overlay, including the
      // chart, recolors its own layers via applyTheme below.
      if (theme === 'day') restoreBaseTheme(mapInstance, baseColors);
      else applyBaseTheme(mapInstance, paint);
      manager?.applyTheme(paint);
    };
    onMapReady?.(recolor);

    onCommandsReady?.({
      centerOnVessel: () => {
        const position = vessel.position;
        if (!position) return;
        const zoom = mapInstance.getZoom();
        mapInstance.flyTo({
          center: [position.longitude, position.latitude],
          zoom: zoom < 12 ? 14 : zoom,
        });
      },
      recenterOnVessel: (latitude, longitude) => {
        mapInstance.setCenter([longitude, latitude]);
      },
      getBounds: () => {
        const b = mapInstance.getBounds();
        return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      },
      clearNoteSelection: () => notesOverlay.deselect(ctx),
    });

    const tick = () => {
      wavesOverlay.sync(ctx);
      precipOverlay.sync(ctx);
      cloudOverlay.sync(ctx);
      radarOverlay.sync(ctx);
      windOverlay.sync(ctx);
      pressureOverlay.sync(ctx);
      notesOverlay.sync(ctx);
      aisOverlay.sync(ctx);
      collisionOverlay.sync(ctx);
      trackOverlay.sync(ctx);
      overlay.sync(ctx);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
});

onDestroy(() => {
  destroyed = true;
  if (frame) cancelAnimationFrame(frame);
  map?.remove();
});
</script>

<div class="chart-canvas" bind:this={container}></div>

<style>
.chart-canvas {
  inline-size: 100%;
  block-size: 100%;
}
</style>
