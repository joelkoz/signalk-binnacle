<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import type { AisTargets } from '$entities/ais';
import type { CollisionAssessment } from '$entities/collision';
import type { RouteStore } from '$entities/route';
import type { TidesStore } from '$entities/tides';
import type { TrackRecorder } from '$entities/track';
import type { UserCharts } from '$entities/user-charts';
import type { OwnVessel } from '$entities/vessel';
import { createAisOverlay } from '$features/ais-layer';
import { BOUNDARY_SOURCES } from '$features/boundaries-overlay';
import { fetchCharts } from '$features/charts';
import { createStreamingChartOverlay, STREAMING_CHART_SOURCES } from '$features/depth-charts';
import { LayersView } from '$features/layers-panel';
import { COLLISION_OVERLAY_ID, createCollisionOverlay } from '$features/lookout';
import { MPA_SOURCES } from '$features/mpa-overlays';
import { createNotesOverlay, type NoteSelection } from '$features/notes';
import { buildOceanSources } from '$features/ocean-conditions';
import { createRouteEditor, type RouteEditor } from '$features/route-edit';
import { createRouteOverlay } from '$features/route-layer';
import { SEAMARK_SOURCES } from '$features/seamark-overlay';
import { createTidesOverlay } from '$features/tides';
import { createTrackOverlay, type SavedTracksSource } from '$features/track-layer';
import { createVesselOverlay, OWN_VESSEL_OVERLAY_ID } from '$features/vessel-layer';
import { prefersReducedMotion } from '$shared/lib';
import {
  chartSourceId,
  createChartOverlay,
  createRasterOverlay,
  createThemedMap,
  type LayerSettings,
  registerPmtilesProtocol,
  type ThemedMapHandle,
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
  // The route store, drawn by the route overlay and edited on the chart via Terra Draw.
  routeStore: RouteStore;
  // The tides store, drawn as nearest-station markers and fed by the tides loader in App.
  tides: TidesStore;
  // The active theme, so the on-chart route editor restyles its draw layers per theme.
  theme: Theme;
  trackSettings: PersistedValue<TrackSettings>;
  // Saved tracks to draw, pulled each frame so show/hide and edits reflect without a remount.
  savedTracks?: SavedTracksSource;
  // The user's imported charts, so a server chart that is also a local user chart (a URL chart this
  // device synced to the server) is registered once, from the local descriptor, not twice.
  userCharts?: UserCharts;
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
}

const {
  store,
  vessel,
  aisTargets,
  collision,
  recorder,
  routeStore,
  tides,
  theme,
  trackSettings,
  savedTracks,
  userCharts,
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
}: Props = $props();

let container: HTMLDivElement;
let mapHandle: ThemedMapHandle | undefined;
let routeEditor: RouteEditor | undefined;

// Restyle the on-chart route editor whenever the theme changes (the saved-route overlay recolors
// through the layer manager; the Terra Draw editing line is restyled here).
$effect(() => {
  routeEditor?.setTheme(theme);
});

registerPmtilesProtocol();

onMount(() => {
  // createThemedMap defaults to the world view ([0, 30], zoom 2) when no saved view is passed.
  mapHandle = createThemedMap({
    container,
    view: initialView,
    managerOptions: {
      saved: savedLayers,
      onChange: onLayersChange,
      savedOrder,
      onOrderChange,
      // The own vessel and active collision alarms stay pinned on top so a chart or traffic can
      // never hide them; bottom to top, collision sits just beneath the vessel.
      pinned: [COLLISION_OVERLAY_ID, OWN_VESSEL_OVERLAY_ID],
    },
    onView: (view) => onViewChange?.(view),
    onUserPan: () => onUserPan?.(),
    onLoad: async ({ map, ctx, manager, recolor, isDestroyed, runTick }) => {
      // The server origin is fixed for the session, so resolve it once and reuse it for the chart
      // fetch, the overlays built here, and the user-chart registrar closure below.
      const origin = serverOrigin();
      // A URL chart this device synced to the server comes back from the charts API with the same id
      // as its local user-chart descriptor. Drop those server entries so the chart registers once,
      // from the local descriptor (the manageable version); other devices, with no local descriptor,
      // still see it as a server chart.
      const localChartIds = new Set((userCharts?.sources ?? []).map((source) => source.id));
      // undefined is a transient failure; there are no server charts registered yet to keep, so this
      // session shows none (a reachable-empty server is the same []). Charts are registered once at
      // load, so a reconnect does not currently re-fetch them.
      const charts = ((await fetchCharts(origin, chartsToken)) ?? []).filter(
        (chart) => !localChartIds.has(chart.identifier),
      );
      if (isDestroyed()) return;

      // Build every overlay, then register the whole stack in one batch so the layer order is
      // applied once instead of restacking after each. The inter-band order comes from Z_ORDER (own
      // vessel and collision pinned on top, then the navigator's routes and track, then AIS and the
      // safety overlays, the ocean fields, and the charts at the base); the order below sets only the
      // order within a band.
      const routeOverlay = createRouteOverlay(routeStore);
      const notesOverlay = createNotesOverlay(origin, chartsToken, onNoteSelect);
      const aisOverlay = createAisOverlay(aisTargets, store);
      const collisionOverlay = createCollisionOverlay(collision);
      const trackOverlay = createTrackOverlay(recorder, trackSettings, savedTracks);
      const tidesOverlay = createTidesOverlay(tides);
      const overlay = createVesselOverlay(vessel);
      await manager.registerAll([
        ...charts.map((chart) => createChartOverlay(chart, origin)),
        ...STREAMING_CHART_SOURCES.map((source) => createStreamingChartOverlay(source)),
        // Within the safety band, registration order is z, so the seamark navigation aids draw over
        // the reference area fills and boundary lines beneath them.
        ...buildOceanSources().map((source) => createRasterOverlay(source, 'weather')),
        ...BOUNDARY_SOURCES.map((source) => createRasterOverlay(source, 'safety')),
        ...MPA_SOURCES.map((source) => createRasterOverlay(source, 'safety')),
        ...SEAMARK_SOURCES.map((source) => createRasterOverlay(source, 'safety')),
        tidesOverlay,
        routeOverlay,
        notesOverlay,
        aisOverlay,
        collisionOverlay,
        trackOverlay,
        overlay,
      ]);
      if (isDestroyed()) return;

      // The Terra Draw route editor draws into its own layers anchored in the routes band. It writes
      // edits back into the working route, which the panel reads for its live distance and count.
      routeEditor = createRouteEditor({
        map,
        beforeId: ctx.beforeIdFor('routes'),
        theme,
        onChange: (waypoints) => {
          const working = routeStore.working;
          if (working) routeStore.setWorking({ ...working, waypoints });
        },
      });

      const view = new LayersView(manager);
      view.refresh();
      onReady?.(view);

      const userChartRegistrar: UserChartRegistrar = {
        register: async (chart) => {
          if (isDestroyed()) return;
          await manager.register(createChartOverlay(chart, origin, 'bathymetry'));
          view.refresh();
        },
        unregister: (identifier) => {
          manager.unregister(chartSourceId(identifier));
          view.refresh();
        },
      };
      onUserChartsReady?.(userChartRegistrar);

      onMapReady?.(recolor);

      onCommandsReady?.({
        centerOnVessel: () => {
          const position = vessel.position;
          if (!position) return;
          const zoom = map.getZoom();
          map.flyTo({
            center: [position.longitude, position.latitude],
            zoom: zoom < 12 ? 14 : zoom,
            ...(prefersReducedMotion() ? { duration: 0 } : {}),
          });
        },
        recenterOnVessel: (latitude, longitude) => {
          map.setCenter([longitude, latitude]);
        },
        flyTo: (latitude, longitude) => {
          const zoom = map.getZoom();
          map.flyTo({
            center: [longitude, latitude],
            zoom: zoom < 11 ? 12 : zoom,
            ...(prefersReducedMotion() ? { duration: 0 } : {}),
          });
        },
        fitBounds: ([west, south, east, north]) => {
          map.fitBounds(
            [
              [west, south],
              [east, north],
            ],
            { padding: 40, maxZoom: 16, duration: prefersReducedMotion() ? 0 : 800 },
          );
        },
        clearNoteSelection: () => notesOverlay.deselect(ctx),
        startRouteEdit: (route) => routeEditor?.start(route),
        stopRouteEdit: () => routeEditor?.stop(),
      });

      runTick([
        tidesOverlay,
        routeOverlay,
        notesOverlay,
        aisOverlay,
        collisionOverlay,
        trackOverlay,
        overlay,
      ]);
    },
  });
});

onDestroy(() => mapHandle?.destroy());
</script>

<div class="chart-canvas" bind:this={container}></div>

<style>
.chart-canvas {
  inline-size: 100%;
  block-size: 100%;
}
</style>
