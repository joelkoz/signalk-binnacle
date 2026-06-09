import { rhumbDistanceMeters } from '$shared/nav';
import { isLonLat, type LonLat, latLonToLonLat, lonLatToLatLon, str } from '$shared/signalk';
import type { Route, Waypoint } from './route-types';

// The Signal K v2 route resource body: a GeoJSON Feature with a LineString, plus name and the
// total SI distance. Per-waypoint names ride in properties.coordinatesMeta, index-aligned.
export interface RouteResourceBody {
  name: string;
  distance: number;
  feature: {
    type: 'Feature';
    geometry: { type: 'LineString'; coordinates: LonLat[] };
    // The Signal K route schema requires every coordinatesMeta entry to carry a name, so it is
    // present only when at least one waypoint is named, and absent for a fully unnamed route.
    properties: { coordinatesMeta?: Array<{ name: string }> };
  };
}

export function routeToFeature(route: Route): RouteResourceBody {
  // The server validates the standard route resource: each coordinatesMeta entry must have a name
  // (or href), so an unnamed-waypoint placeholder of {} is rejected. Emit coordinatesMeta only when
  // a waypoint is named, filling the unnamed gaps with their 1-based index, and omit it otherwise.
  const named = route.waypoints.some((w) => w.name);
  const properties = named
    ? { coordinatesMeta: route.waypoints.map((w, i) => ({ name: w.name ?? `${i + 1}` })) }
    : {};
  return {
    name: route.name,
    distance: routeDistanceMeters(route.waypoints),
    feature: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: route.waypoints.map((w) => latLonToLonLat(w.position)),
      },
      properties,
    },
  };
}

export function featureToRoute(id: string, raw: unknown): Route | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as {
    name?: unknown;
    feature?: {
      geometry?: { type?: unknown; coordinates?: unknown };
      properties?: { coordinatesMeta?: unknown };
    };
  };
  const geom = r.feature?.geometry;
  if (geom?.type !== 'LineString' || !Array.isArray(geom.coordinates)) return undefined;
  const meta = Array.isArray(r.feature?.properties?.coordinatesMeta)
    ? (r.feature?.properties?.coordinatesMeta as Array<{ name?: unknown }>)
    : [];
  const waypoints: Waypoint[] = [];
  geom.coordinates.forEach((coord, i) => {
    if (isLonLat(coord)) {
      const name = str(meta[i]?.name);
      waypoints.push({ position: lonLatToLatLon(coord), ...(name ? { name } : {}) });
    }
  });
  if (waypoints.length < 2) return undefined;
  const name = str(r.name) ?? id;
  return { id, name, waypoints };
}

export function routeDistanceMeters(waypoints: readonly Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    total += rhumbDistanceMeters(waypoints[i - 1].position, waypoints[i].position);
  }
  return total;
}

// The rhumb distance of the legs still ahead, starting at fromIndex (the active destination
// waypoint). The whole-route distance-to-go is this plus the boat's distance to that next waypoint,
// so a passage planner can show total remaining distance and arrival time, not just the next leg.
export function remainingRouteDistanceMeters(
  waypoints: readonly Waypoint[],
  fromIndex: number,
): number {
  let total = 0;
  for (let i = Math.max(0, fromIndex); i < waypoints.length - 1; i += 1) {
    total += rhumbDistanceMeters(waypoints[i].position, waypoints[i + 1].position);
  }
  return total;
}
