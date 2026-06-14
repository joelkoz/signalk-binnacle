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
  start(route?: Route, initialPoint?: LatLon): void;
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

  // While a fresh route is being drawn, Terra Draw keeps a trailing "ghost" coordinate on the line
  // that follows the cursor until the next tap commits it, so the in-progress line always carries
  // one coordinate more than the points the navigator has actually placed. We drop that ghost from
  // the emitted waypoints so the panel count, the save gate, and a saved route reflect placed points,
  // not the cursor. When editing a saved route in select mode every coordinate is real, so nothing
  // is dropped. The finish event (double-tap or Enter completes the line and removes the ghost)
  // clears the flag so the completed line's coordinates are then all kept.
  let drawing = false;

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

  // The route linestrings in the store. Terra Draw stamps its auxiliary cursor and closing-point
  // features with the SAME properties.mode as the line, so the geometry type is checked too: a Point
  // carrying mode 'linestring' is the cursor point, not the route, and reading it as the working line
  // would emit zero waypoints and make the drawn line vanish. Matching on mode alone is the bug.
  const linestrings = (): GeoJSONStoreFeatures[] =>
    draw
      .getSnapshot()
      .filter((f) => f.properties.mode === LINESTRING_MODE && f.geometry.type === 'LineString');

  // The change handler must never mutate the Terra Draw store synchronously. Terra Draw commits a
  // tapped coordinate by firing a change event from inside its own update, and removing a feature
  // during that window clears Terra Draw's in-progress drawing id, so its next history snapshot
  // throws "No feature with this id (undefined), can not get geometry copy" and route drawing dies.
  // So read() selects the working line synchronously for the panel, and the stale extras are dropped
  // in a microtask, after Terra Draw has finished its commit. pruning suppresses the nested change
  // the removal fires; prunePending coalesces repeated schedules into one. The microtask queue drains
  // between two taps, so the next tap sees one line.
  let pruning = false;
  let prunePending = false;

  // Terra Draw appends features in creation order, so the line being drawn or edited is the last
  // entry; any earlier linestrings are stale extras left when one line was finished and a new one
  // started, and those get pruned.
  const workingLine = (
    lines: GeoJSONStoreFeatures[],
  ): { line: GeoJSONStoreFeatures; extraIds: Array<string | number> } => {
    const line = lines[lines.length - 1];
    const extraIds = lines
      .slice(0, -1)
      .map((f) => f.id)
      .filter((id): id is string | number => id != null);
    return { line, extraIds };
  };

  const prune = (): void => {
    prunePending = false;
    const lines = linestrings();
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
    const lines = linestrings();
    if (lines.length === 0) return [];
    const { line, extraIds } = workingLine(lines);
    if (extraIds.length > 0 && !prunePending) {
      prunePending = true;
      queueMicrotask(prune);
    }
    const placed = drawFeatureToWaypoints(line);
    // Drop the trailing cursor ghost while drawing a fresh route (see `drawing` above).
    const waypoints = drawing && placed.length > 0 ? placed.slice(0, -1) : placed;
    return reconcileNames(waypoints);
  };

  draw.on('change', () => {
    if (pruning) return;
    const next = read();
    remember(next);
    opts.onChange(next);
  });

  // Completing a line (double-tap or Enter) removes Terra Draw's trailing ghost, so stop dropping a
  // coordinate; the finished line's coordinates are then all placed points.
  draw.on('finish', () => {
    drawing = false;
  });

  // "Start a route here" seeds the first waypoint at a chosen spot. Terra Draw has no API to seed an
  // in-progress line, so replay the exact path a real opening tap takes: dispatch a pointer down and
  // up at the point's screen pixel on the map canvas, which Terra Draw's adapter reads as the first
  // click. Deferred a microtask so linestring mode's listeners are attached first.
  const placeFirstPoint = (point: LatLon): void => {
    queueMicrotask(() => {
      const canvas = opts.map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const { x, y } = opts.map.project([point.longitude, point.latitude]);
      const event = {
        clientX: rect.left + x,
        clientY: rect.top + y,
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
      } as const;
      canvas.dispatchEvent(new PointerEvent('pointerdown', event));
      canvas.dispatchEvent(new PointerEvent('pointerup', event));
    });
  };

  return {
    start(route, initialPoint) {
      remember(route ? route.waypoints.slice() : []);
      draw.start();
      if (route && route.waypoints.length > 0) {
        drawing = false;
        draw.addFeatures([routeToStoreFeature(route)]);
        draw.setMode('select');
      } else {
        drawing = true;
        draw.setMode(LINESTRING_MODE);
        if (initialPoint) placeFirstPoint(initialPoint);
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
