import type { Map as MapLibreMap } from 'maplibre-gl';
import type { RouteStore } from '$entities/route';
import type { OwnVessel } from '$entities/vessel';
import type { LayersView } from '$features/layers-panel';
import type { RouteEditor } from '$features/route-edit';
import type { WorkingRouteOverlay } from '$features/route-layer';
import { lngLatBoundsToBbox4, normalizeBounds } from '$shared/geo';
import { prefersReducedMotion } from '$shared/lib';
import type { LayerManager, OverlayContext } from '$shared/map';
import type { MapCommands } from './commands';

// The notes overlay handed up so the "clear note selection" command can drop the selection ring.
interface NotesOverlayLike {
  deselect(ctx: OverlayContext): void;
}

export interface MapCommandsDeps {
  map: MapLibreMap;
  ctx: OverlayContext;
  view: LayersView;
  manager: LayerManager;
  vessel: OwnVessel;
  routeStore: RouteStore;
  notesOverlay: NotesOverlayLike;
  // The lazily-imported on-chart route editor, loaded on first use; resolves undefined on a
  // chunk-load failure so route editing degrades rather than throwing.
  loadRouteEditor: () => Promise<RouteEditor | undefined>;
  // The host's working-route overlay binding, read live because it is created after the commands
  // are wired (and after a base-style swap it may be re-created).
  getWorkingRouteOverlay: () => WorkingRouteOverlay | undefined;
  // The latest route editor, read live because loadRouteEditor sets it asynchronously.
  getRouteEditor: () => RouteEditor | undefined;
  // The route-edit generation counter lives in the host so its theme effect and click handler share
  // it. nextEditGeneration starts a new edit (and returns its token), cancelEditGeneration retires
  // any in-flight edit, and currentEditGeneration reads the live token so a stale load bails.
  nextEditGeneration: () => number;
  cancelEditGeneration: () => void;
  currentEditGeneration: () => number;
}

// The imperative map actions the chart exposes to the app shell, built once the map is ready. Pure
// wiring over the injected map, overlays, and route-edit accessors; it owns no state of its own.
export function buildMapCommands(deps: MapCommandsDeps): MapCommands {
  const {
    map,
    ctx,
    view,
    manager,
    vessel,
    routeStore,
    notesOverlay,
    loadRouteEditor,
    getWorkingRouteOverlay,
    getRouteEditor,
    nextEditGeneration,
    cancelEditGeneration,
    currentEditGeneration,
  } = deps;
  return {
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
      const generation = nextEditGeneration();
      void loadRouteEditor().then((editor) => {
        if (generation !== currentEditGeneration()) return;
        editor?.start(route, initialPoint);
        // The editor's Terra Draw line was just added at the top of the routes band; lift the
        // working-route dots and highlight back above it.
        getWorkingRouteOverlay()?.raise(ctx);
      });
    },
    stopRouteEdit: () => {
      cancelEditGeneration();
      getRouteEditor()?.stop();
    },
    applyLayers: (settings, order) => {
      manager.applySnapshot(settings, order);
      view.refresh();
      // applySnapshot restacks the routes band, so re-lift the working overlay above the editor
      // line while a route is being edited.
      if (routeStore.working) getWorkingRouteOverlay()?.raise(ctx);
    },
  };
}
