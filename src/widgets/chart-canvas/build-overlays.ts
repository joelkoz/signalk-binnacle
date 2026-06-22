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
import type { OwnVessel } from '$entities/vessel';
import type { WaypointsStore } from '$entities/waypoint';
import {
  createAisOverlay,
  createAisTrailsOverlay,
  createAisVectorsOverlay,
} from '$features/ais-layer';
import { createAnchorOverlay } from '$features/anchor-watch';
import { createCollisionOverlay } from '$features/lookout';
import { createMeasureOverlay } from '$features/measure';
import { createMobOverlay } from '$features/mob';
import { createCourseOverlay, createRouteOverlay } from '$features/route-layer';
import { createTidesOverlay } from '$features/tides';
import { createTimeTravelOverlay, type TimeTravelStore } from '$features/time-travel';
import {
  createHistoryTrackOverlay,
  createTrackOverlay,
  type SavedTracksSource,
} from '$features/track-layer';
import { createVesselOverlay } from '$features/vessel-layer';
import { createWaypointOverlay } from '$features/waypoints';
import type { LatLon } from '$shared/geo';
import type { OverlayContext, OverlayModule } from '$shared/map';
import type { PersistedValue, TrackSettings } from '$shared/settings';
import type { HistoryProviders, SignalKStore } from '$shared/signalk';

// The notes overlay is built in the host (it is also handed to the map commands as the
// selection-clearing target), so it is injected here rather than created in this module.
interface NotesOverlayLike extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

export interface DynamicOverlaysDeps {
  // The server origin and read token, shared by the AIS-trail and history-track overlays.
  origin: string;
  chartsToken?: string;
  store: SignalKStore;
  vessel: OwnVessel;
  aisTargets: AisTargets;
  anchor: AnchorWatch;
  mob: MobStore;
  measure: MeasureStore;
  collision: CollisionAssessment;
  guidance: CourseGuidance;
  recorder: TrackRecorder;
  routeStore: RouteStore;
  tides: TidesStore;
  units: UnitsStore;
  waypoints: WaypointsStore;
  symbols?: SymbolsStore;
  trackSettings: PersistedValue<TrackSettings>;
  savedTracks?: SavedTracksSource;
  // The already-built notes overlay, woven into the stack at its band position.
  notesOverlay: NotesOverlayLike;
  onAnchorMoved?: (position: LatLon) => void;
  aisTrailsAvailable: () => boolean;
  historyProviders: () => HistoryProviders | undefined;
  timeTravel: TimeTravelStore;
}

// The store-driven overlay stack, in z order within each band (tides under the safety overlays, the
// own vessel on top). One list feeds both manager registration (OverlayModule) and the per-frame
// tick (Syncable), so the return type is left inferred as the concrete union that satisfies both,
// rather than widened to OverlayModule[], which would drop the sync method the tick requires.
export function buildDynamicOverlays(deps: DynamicOverlaysDeps) {
  const {
    origin,
    chartsToken,
    store,
    vessel,
    aisTargets,
    anchor,
    mob,
    measure,
    collision,
    guidance,
    recorder,
    routeStore,
    tides,
    units,
    waypoints,
    symbols,
    trackSettings,
    savedTracks,
    notesOverlay,
    onAnchorMoved,
    aisTrailsAvailable,
    historyProviders,
    timeTravel,
  } = deps;
  return [
    createTidesOverlay(tides, units),
    createAnchorOverlay(anchor, vessel, onAnchorMoved),
    createMeasureOverlay(measure, units),
    createRouteOverlay(routeStore),
    createCourseOverlay(guidance, vessel),
    createWaypointOverlay(waypoints, symbols),
    notesOverlay,
    createAisTrailsOverlay(origin, chartsToken, aisTrailsAvailable, () => store.selfContext),
    createAisVectorsOverlay(aisTargets, () => collision.assessment),
    createAisOverlay(aisTargets),
    createCollisionOverlay(collision),
    createMobOverlay(mob, vessel),
    createHistoryTrackOverlay(origin, chartsToken, historyProviders),
    createTrackOverlay(recorder, trackSettings, savedTracks),
    createVesselOverlay(vessel),
    createTimeTravelOverlay(timeTravel),
  ];
}
