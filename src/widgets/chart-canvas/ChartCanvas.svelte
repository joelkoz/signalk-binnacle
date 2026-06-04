<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import type { AisTargets } from '$entities/ais';
import type { CollisionAssessment } from '$entities/collision';
import type { RouteStore } from '$entities/route';
import type { TrackRecorder } from '$entities/track';
import type { OwnVessel } from '$entities/vessel';
import { createAisOverlay } from '$features/ais-layer';
import { fetchCharts } from '$features/charts';
import { createStreamingChartOverlay, STREAMING_CHART_SOURCES } from '$features/depth-charts';
import { LayersView } from '$features/layers-panel';
import { COLLISION_OVERLAY_ID, createCollisionOverlay } from '$features/lookout';
import { createNotesOverlay, type NoteSelection } from '$features/notes';
import { createRouteEditor } from '$features/route-edit';
import { createRouteOverlay } from '$features/route-layer';
import { createTrackOverlay, type SavedTracksSource } from '$features/track-layer';
import { createVesselOverlay, OWN_VESSEL_OVERLAY_ID } from '$features/vessel-layer';
import {
  chartSourceId,
  createChartOverlay,
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
}

const {
  store,
  vessel,
  aisTargets,
  collision,
  recorder,
  routeStore,
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
}: Props = $props();

let container: HTMLDivElement;
let mapHandle: ThemedMapHandle | undefined;

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
      const charts = await fetchCharts(serverOrigin(), chartsToken);
      if (isDestroyed()) return;

      // Build every overlay, then register the whole stack in one batch so the layer order is
      // applied once instead of restacking after each. Registration order is the z-order intent:
      // server charts, then streaming bathymetry just above the base, the notes, AIS, and collision
      // live overlays, then the track beneath the vessel so the boat draws on top of its own trail.
      const routeOverlay = createRouteOverlay(routeStore);
      const notesOverlay = createNotesOverlay(serverOrigin(), chartsToken, onNoteSelect);
      const aisOverlay = createAisOverlay(aisTargets, store);
      const collisionOverlay = createCollisionOverlay(collision);
      const trackOverlay = createTrackOverlay(recorder, trackSettings, savedTracks);
      const overlay = createVesselOverlay(vessel);
      await manager.registerAll([
        ...charts.map((chart) => createChartOverlay(chart, serverOrigin())),
        ...STREAMING_CHART_SOURCES.map((source) => createStreamingChartOverlay(source)),
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
      const routeEditor = createRouteEditor({
        map,
        beforeId: ctx.beforeIdFor('routes'),
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
          await manager.register(createChartOverlay(chart, serverOrigin(), 'bathymetry'));
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
          });
        },
        recenterOnVessel: (latitude, longitude) => {
          map.setCenter([longitude, latitude]);
        },
        clearNoteSelection: () => notesOverlay.deselect(ctx),
        startRouteEdit: (route) => routeEditor.start(route),
        stopRouteEdit: () => routeEditor.stop(),
      });

      runTick([routeOverlay, notesOverlay, aisOverlay, collisionOverlay, trackOverlay, overlay]);
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
