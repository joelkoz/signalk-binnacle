import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  type GeoJSONStoreFeatures,
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Route, Waypoint } from '$entities/route';
import { isLonLat, type LatLon, latLonToLonLat, lonLatToLatLon } from '$shared/geo';
import { mapThemePaint } from '$shared/map';
import type { Theme } from '$shared/ui';

// Terra Draw tags every feature with its mode in properties.mode; the on-chart route is a
// single linestring drawn or edited in that mode.
const LINESTRING_MODE = 'linestring';

// The on-chart editing line uses the theme's bright selection accent so it reads vividly against
// blue water and the chart instead of blending in. It reads the one source (the map-theme select,
// which the --select CSS token mirrors) rather than a second copy, so the two can never drift. The
// cast is safe because every theme's select is a hex color.
function drawColor(theme: Theme): `#${string}` {
  return mapThemePaint(theme).select as `#${string}`;
}

export function drawFeatureToWaypoints(feature: GeoJSON.Feature): Waypoint[] {
  const geom = feature.geometry;
  if (geom.type !== 'LineString') return [];
  return geom.coordinates.filter(isLonLat).map((c) => ({ position: lonLatToLatLon(c) }));
}

// Terra Draw rounds coordinates to its store precision, so an untouched point can come back
// perturbed below the millimeter scale; the tolerance absorbs that while still treating any real
// drag as a different position.
const COORD_MATCH_EPSILON_DEG = 1e-9;

function positionsMatch(a: LatLon, b: LatLon): boolean {
  return (
    Math.abs(a.latitude - b.latitude) <= COORD_MATCH_EPSILON_DEG &&
    Math.abs(a.longitude - b.longitude) <= COORD_MATCH_EPSILON_DEG
  );
}

// Terra Draw stamps tracked features with createdAt and updatedAt (epoch ms) in properties.
function featureStamp(feature: GeoJSONStoreFeatures): number {
  const created = feature.properties.createdAt;
  const updated = feature.properties.updatedAt;
  return Math.max(
    typeof created === 'number' ? created : 0,
    typeof updated === 'number' ? updated : 0,
  );
}

// The single waypoints-to-LineString mapper, in the narrower store-feature shape (non-null
// Record<string, JSON> properties) that Terra Draw's addFeatures wants.
export function routeToStoreFeature(route: Route): GeoJSONStoreFeatures<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: { mode: LINESTRING_MODE },
    geometry: {
      type: 'LineString',
      coordinates: route.waypoints.map((w) => latLonToLonLat(w.position)),
    },
  };
}

export interface RouteEditor {
  start(route?: Route): void;
  setTheme(theme: Theme): void;
  stop(): void;
}

export function createRouteEditor(opts: {
  map: MapLibreMap;
  beforeId?: string;
  theme: Theme;
  onChange: (waypoints: Waypoint[]) => void;
}): RouteEditor {
  const color = drawColor(opts.theme);
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({
      map: opts.map,
      prefixId: 'binnacle-route-draw',
      renderBelowLayerId: opts.beforeId,
    }),
    modes: [
      new TerraDrawPointMode({ styles: { pointColor: color, pointWidth: 6 } }),
      new TerraDrawLineStringMode({
        styles: { lineStringColor: color, lineStringWidth: 4 },
      }),
      new TerraDrawSelectMode({
        styles: {
          selectionPointColor: color,
          midPointColor: color,
        },
        flags: {
          linestring: {
            feature: {
              draggable: true,
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
        },
      }),
    ],
  });

  // The last emitted waypoints, seeded from start's route, so a rebuild from Terra Draw
  // coordinates can put the per-waypoint names back on the points that did not move. Terra Draw
  // only carries coordinates, so without this every edit would discard all names and the save
  // would drop coordinatesMeta. anyNamed is kept beside it so the per-pointermove change events
  // of an unnamed route (the common case) skip the O(rebuilt x remembered) scan entirely.
  let remembered: Waypoint[] = [];
  let anyNamed = false;
  const remember = (waypoints: Waypoint[]): void => {
    remembered = waypoints;
    anyNamed = waypoints.some((w) => w.name != null);
  };

  // Re-attach names: a rebuilt coordinate that equals a remembered waypoint's position keeps that
  // waypoint's name, consuming remembered entries in order so a route that visits the same point
  // twice keeps both names in sequence. A dragged point matches nothing and loses its name, which
  // is the honest outcome: the named mark no longer sits there.
  const reconcileNames = (rebuilt: Waypoint[]): Waypoint[] => {
    if (!anyNamed) return rebuilt;
    const consumed: boolean[] = remembered.map(() => false);
    return rebuilt.map((waypoint) => {
      for (let i = 0; i < remembered.length; i += 1) {
        if (consumed[i] || !positionsMatch(remembered[i].position, waypoint.position)) continue;
        consumed[i] = true;
        const name = remembered[i].name;
        return name == null ? waypoint : { ...waypoint, name };
      }
      return waypoint;
    });
  };

  // The change handler must never mutate the Terra Draw store synchronously. Terra Draw commits a
  // tapped coordinate by firing a change event from inside its own update (firstUpdateToLine), and
  // removing a feature during that window clears Terra Draw's in-progress drawing id, so its next
  // history snapshot throws "No feature with this id (undefined), can not get geometry copy" and
  // route drawing dies on the second waypoint. So read() selects the working line synchronously for
  // the panel, and the stale extras are dropped in a microtask, after Terra Draw has finished its
  // commit. pruning suppresses the nested change the removal fires; prunePending coalesces repeated
  // schedules into one. The microtask queue drains between two taps, so the next tap sees one line.
  let pruning = false;
  let prunePending = false;

  // The freshest linestring is the working line (ties keep the later snapshot entry, so the choice
  // is deterministic); any others are stale extras left when a line is finished and a new one tapped.
  const workingLine = (
    lines: GeoJSONStoreFeatures[],
  ): { line: GeoJSONStoreFeatures; extraIds: Array<string | number> } => {
    // The common case once drawing is under way: one line, no extras, so skip the scan and the
    // three-pass filter on the hot read path (read runs on every Terra Draw change event).
    if (lines.length === 1) return { line: lines[0], extraIds: [] };
    let line = lines[0];
    for (const f of lines) {
      if (featureStamp(f) >= featureStamp(line)) line = f;
    }
    const extraIds = lines
      .filter((f) => f !== line)
      .map((f) => f.id)
      .filter((id): id is string | number => id != null);
    return { line, extraIds };
  };

  const prune = (): void => {
    prunePending = false;
    const lines = draw.getSnapshot().filter((f) => f.properties.mode === LINESTRING_MODE);
    if (lines.length <= 1) return;
    const { extraIds } = workingLine(lines);
    if (extraIds.length === 0) return;
    pruning = true;
    try {
      draw.removeFeatures(extraIds);
    } finally {
      pruning = false;
    }
  };

  const read = (): Waypoint[] => {
    const lines = draw.getSnapshot().filter((f) => f.properties.mode === LINESTRING_MODE);
    if (lines.length === 0) return [];
    const { line, extraIds } = workingLine(lines);
    if (extraIds.length > 0 && !prunePending) {
      prunePending = true;
      queueMicrotask(prune);
    }
    return reconcileNames(drawFeatureToWaypoints(line));
  };

  draw.on('change', () => {
    if (pruning) return;
    const next = read();
    remember(next);
    opts.onChange(next);
  });

  return {
    start(route) {
      remember(route ? route.waypoints.slice() : []);
      draw.start();
      if (route && route.waypoints.length > 0) {
        draw.addFeatures([routeToStoreFeature(route)]);
        draw.setMode('select');
      } else {
        draw.setMode(LINESTRING_MODE);
      }
    },
    setTheme(theme) {
      const color = drawColor(theme);
      draw.updateModeOptions('point', { styles: { pointColor: color, pointWidth: 6 } });
      draw.updateModeOptions('linestring', {
        styles: { lineStringColor: color, lineStringWidth: 4 },
      });
      draw.updateModeOptions('select', {
        styles: { selectionPointColor: color, midPointColor: color },
      });
    },
    stop() {
      draw.stop();
    },
  };
}
