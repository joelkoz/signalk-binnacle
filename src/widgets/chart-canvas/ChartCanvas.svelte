<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import type { AisTargets } from '$entities/ais';
import type { AnchorWatch } from '$entities/anchor';
import type { CollisionAssessment } from '$entities/collision';
import type { CourseGuidance } from '$entities/course';
import type { MeasureStore } from '$entities/measure';
import type { MobStore } from '$entities/mob';
import type { RouteStore } from '$entities/route';
import type { SymbolsStore } from '$entities/symbols';
import type { TidesStore } from '$entities/tides';
import type { TrackRecorder } from '$entities/track';
import type { UnitsStore } from '$entities/units';
import type { UserCharts } from '$entities/user-charts';
import type { OwnVessel } from '$entities/vessel';
import type { WaypointsStore } from '$entities/waypoint';
import {
  createAisOverlay,
  createAisTrailsOverlay,
  createAisVectorsOverlay,
} from '$features/ais-layer';
import { createAnchorOverlay } from '$features/anchor-watch';
import { BOUNDARY_SOURCES, createBoundaryOverlay } from '$features/boundaries-overlay';
import { fetchCharts } from '$features/charts';
import { createStreamingChartOverlay, STREAMING_CHART_SOURCES } from '$features/depth-charts';
import { LayersView } from '$features/layers-panel';
import { COLLISION_OVERLAY_ID, createCollisionOverlay } from '$features/lookout';
import { createMeasureOverlay } from '$features/measure';
import { createMobOverlay, MOB_OVERLAY_ID } from '$features/mob';
import { createMpaOverlay, MPA_SOURCES } from '$features/mpa-overlays';
import { createNotesOverlay, type NoteSelection } from '$features/notes';
import { buildOceanSources, createOceanOverlay } from '$features/ocean-conditions';
import type { RouteEditor } from '$features/route-edit';
import { createCourseOverlay, createRouteOverlay } from '$features/route-layer';
import { createSeamarkOverlay, SEAMARK_SOURCES } from '$features/seamark-overlay';
import { createTidesOverlay } from '$features/tides';
import {
  createHistoryTrackOverlay,
  createTrackOverlay,
  type SavedTracksSource,
} from '$features/track-layer';
import { createVesselOverlay, OWN_VESSEL_OVERLAY_ID } from '$features/vessel-layer';
import { createWaypointOverlay } from '$features/waypoints';
import { type LatLon, lngLatBoundsToBbox4, normalizeBounds } from '$shared/geo';
import { prefersReducedMotion } from '$shared/lib';
import {
  chartSourceId,
  createChartOverlay,
  createThemedMap,
  type LayerSettings,
  registerPmtilesProtocol,
  type ThemedMapHandle,
} from '$shared/map';
import type { MapView, PersistedValue, TrackSettings } from '$shared/settings';
import { type HistoryProviders, type SignalKStore, serverOrigin } from '$shared/signalk';
import type { Theme } from '$shared/ui';
import ChartContextMenu from './ChartContextMenu.svelte';
import type { MapCommands, UserChartRegistrar } from './commands';

interface Props {
  store: SignalKStore;
  vessel: OwnVessel;
  aisTargets: AisTargets;
  // The anchor watch, drawn as the swing circle, rode line, and draggable drop-point marker.
  anchor: AnchorWatch;
  // The man-overboard mark, pinned with the collision ring so nothing can hide it.
  mob: MobStore;
  // The measure tool; while armed, chart taps append measurement points.
  measure: MeasureStore;
  collision: CollisionAssessment;
  // Active-navigation guidance, drawn as the vessel-to-destination course line and destination
  // marker so a single-point "go to here" and an active route's current leg show on the chart.
  guidance: CourseGuidance;
  recorder: TrackRecorder;
  // The route store, drawn by the route overlay and edited on the chart via Terra Draw.
  routeStore: RouteStore;
  // The tides store, drawn as nearest-station markers and fed by the tides loader in App.
  tides: TidesStore;
  // The display-unit preference, threaded into the overlays that label distances and heights.
  units: UnitsStore;
  // Standard server waypoints, drawn as named markers in the routes band.
  waypoints: WaypointsStore;
  // Provided chart symbols (signalk-symbol-manager), empty on a stock server.
  symbols?: SymbolsStore;
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
  // Set a single "go to here" destination at a chart point the user long-pressed or right-clicked.
  onGoToHere?: (position: LatLon) => void;
  // Open the routes panel and start a new route in drawing mode, from the chart context menu.
  onStartRoute?: (position: LatLon) => void;
  // Drop a standard waypoint at a long-pressed chart position; a refused save surfaces in the
  // Waypoints panel (write access is unknowable client-side).
  onDropWaypoint?: (position: LatLon) => void;
  // Arm the measure tool seeded with the long-pressed chart position as its first point.
  onMeasureFrom?: (position: LatLon) => void;
  // The lazily-imported route editor chunk failed to load, so the app can surface it.
  onRouteEditorError?: () => void;
  // Whether the server runs the tracks plugin, read per tick so trails light up when known.
  aisTrailsAvailable?: () => boolean;
  // Connectivity, so the notes overlay can serve expired cached POIs while offline instead of
  // blanking them at TTL expiry.
  isOnline?: () => boolean;
  // The known history providers, for the 24 h track history overlay; undefined gates its fetches.
  historyProviders?: () => HistoryProviders | undefined;
  // Commit a drag-to-adjust of the anchor marker (the app PUTs it server-side or moves it locally).
  onAnchorMoved?: (position: LatLon) => void;
}

const {
  store,
  vessel,
  aisTargets,
  anchor,
  mob,
  measure,
  units,
  waypoints,
  symbols,
  collision,
  guidance,
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
  onGoToHere,
  onStartRoute,
  onDropWaypoint,
  onMeasureFrom,
  onRouteEditorError,
  aisTrailsAvailable,
  isOnline,
  historyProviders,
  onAnchorMoved,
}: Props = $props();

let container: HTMLDivElement;
let mapHandle: ThemedMapHandle | undefined;
let routeEditor: RouteEditor | undefined;
// The open "go to here" menu, anchored at the press point in chart pixels with the chart size
// captured for edge clamping, or undefined when closed.
let chartMenu = $state<
  { x: number; y: number; lat: number; lon: number; width: number; height: number } | undefined
>();

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
      // The own vessel, an active MOB mark, and active collision alarms stay pinned on top so a
      // chart or traffic can never hide them; bottom to top, collision, then the MOB mark, then
      // the vessel itself.
      pinned: [COLLISION_OVERLAY_ID, MOB_OVERLAY_ID, OWN_VESSEL_OVERLAY_ID],
    },
    onView: (view) => onViewChange?.(view),
    onUserPan: () => onUserPan?.(),
    onContextMenu: (point) => {
      // No context menu at all while drawing or editing a route (this suppresses every item,
      // not just "Go to here"): Terra Draw owns the chart taps then.
      if (!onGoToHere || routeStore.working) return;
      chartMenu = {
        x: point.x,
        y: point.y,
        lat: point.lat,
        lon: point.lng,
        width: container.clientWidth,
        height: container.clientHeight,
      };
    },
    onLoad: async ({ map, ctx, manager, recolor, isDestroyed, runTick }) => {
      // A pan or zoom moves the chart out from under the menu's pixel anchor, so dismiss it on move.
      map.on('movestart', () => {
        chartMenu = undefined;
      });
      // While the measure tool is armed, plain taps append measurement points. Route editing wins
      // when both are somehow active, since Terra Draw owns the chart taps then.
      map.on('click', (e) => {
        if (!measure.active || routeStore.working) return;
        measure.add({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
      });
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
      const notesOverlay = createNotesOverlay(origin, chartsToken, onNoteSelect, symbols, {
        isOnline: isOnline ?? (() => true),
      });
      // One list feeds both registration and the per-frame tick, so the two cannot drift. The order
      // sets z within each band (tides under the safety overlays, the own vessel on top).
      const dynamicOverlays = [
        createTidesOverlay(tides, units),
        createAnchorOverlay(anchor, vessel, onAnchorMoved),
        createMeasureOverlay(measure, units),
        createRouteOverlay(routeStore),
        createCourseOverlay(guidance, vessel),
        createWaypointOverlay(waypoints, symbols),
        notesOverlay,
        createAisTrailsOverlay(
          origin,
          chartsToken,
          aisTrailsAvailable ?? (() => false),
          () => store.selfContext,
        ),
        createAisVectorsOverlay(aisTargets, () => collision.assessment),
        createAisOverlay(aisTargets, store),
        createCollisionOverlay(collision),
        createMobOverlay(mob, vessel),
        createHistoryTrackOverlay(origin, chartsToken, historyProviders ?? (() => undefined)),
        createTrackOverlay(recorder, trackSettings, savedTracks),
        createVesselOverlay(vessel),
      ];
      await manager.registerAll([
        ...charts.map((chart) => createChartOverlay(chart, origin)),
        ...STREAMING_CHART_SOURCES.map((source) => createStreamingChartOverlay(source)),
        ...buildOceanSources().map((source) => createOceanOverlay(source)),
        // Within the safety band, registration order is z, so the seamark navigation aids draw over
        // the reference area fills and boundary lines beneath them.
        ...BOUNDARY_SOURCES.map((source) => createBoundaryOverlay(source)),
        ...MPA_SOURCES.map((source) => createMpaOverlay(source)),
        ...SEAMARK_SOURCES.map((source) => createSeamarkOverlay(source)),
        ...dynamicOverlays,
      ]);
      if (isDestroyed()) return;

      // The Terra Draw route editor draws into its own layers anchored in the routes band. It writes
      // edits back into the working route, which the panel reads for its live distance and count.
      // Loaded on first use, not at startup: Terra Draw and its adapter are a few hundred kB that
      // route editing alone needs, so deferring them cuts cold-load parse on Pi-class clients.
      const editorBeforeId = ctx.beforeIdFor('routes');
      let editorLoading: Promise<RouteEditor | undefined> | undefined;
      const loadRouteEditor = (): Promise<RouteEditor | undefined> => {
        editorLoading ??= import('$features/route-edit')
          .then(({ createRouteEditor }) => {
            if (isDestroyed()) return undefined;
            routeEditor = createRouteEditor({
              map,
              beforeId: editorBeforeId,
              theme,
              onChange: (waypoints) => {
                const working = routeStore.working;
                if (working) routeStore.setWorking({ ...working, waypoints });
              },
            });
            return routeEditor;
          })
          .catch((error) => {
            // A chunk-load failure (offline, a cache miss over a flaky link) must not leave a
            // permanently rejected memoized promise that kills route editing for the session;
            // clear it so a later attempt re-imports, and surface the failure.
            console.error('Route editor failed to load', error);
            editorLoading = undefined;
            onRouteEditorError?.();
            return undefined;
          });
        return editorLoading;
      };

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
        fitBounds: (bounds) => {
          // normalizeBounds rejects a malformed (non-finite or inverted) descriptor, unwraps an
          // antimeridian crossing, and pads a degenerate box, so the widget just issues the move.
          const corners = normalizeBounds(bounds);
          if (!corners) return;
          map.fitBounds(corners, {
            padding: 40,
            maxZoom: 16,
            duration: prefersReducedMotion() ? 0 : 800,
          });
        },
        getBounds: () => lngLatBoundsToBbox4(map.getBounds()),
        clearNoteSelection: () => notesOverlay.deselect(ctx),
        startRouteEdit: (route, initialPoint) => {
          void loadRouteEditor().then((editor) => editor?.start(route, initialPoint));
        },
        stopRouteEdit: () => routeEditor?.stop(),
        applyLayers: (settings, order) => {
          manager.applySnapshot(settings, order);
          view.refresh();
        },
      });

      runTick(dynamicOverlays);
    },
  });
});

onDestroy(() => mapHandle?.destroy());
</script>

<div class="chart-canvas" bind:this={container}>
  {#if chartMenu}
    {@const menu = chartMenu}
    <ChartContextMenu
      x={menu.x}
      y={menu.y}
      width={menu.width}
      height={menu.height}
      onGoToHere={() => {
        onGoToHere?.({ latitude: menu.lat, longitude: menu.lon });
        chartMenu = undefined;
      }}
      onStartRoute={() => {
        onStartRoute?.({ latitude: menu.lat, longitude: menu.lon });
        chartMenu = undefined;
      }}
      onDropWaypoint={onDropWaypoint
        ? () => {
            onDropWaypoint({ latitude: menu.lat, longitude: menu.lon });
            chartMenu = undefined;
          }
        : undefined}
      onMeasureFrom={onMeasureFrom
        ? () => {
            onMeasureFrom({ latitude: menu.lat, longitude: menu.lon });
            chartMenu = undefined;
          }
        : undefined}
      onClose={() => {
        chartMenu = undefined;
      }}
    />
  {/if}
</div>

<style>
.chart-canvas {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
}
</style>
