import { rhumbBearingRad, rhumbDistanceMeters } from '$shared/nav';
import { type LonLat, latLonToLonLat, lonLatToLatLon, str } from '$shared/signalk';
import type { Route, RouteLeg, Waypoint } from './route-types';

// The Signal K v2 route resource body: a GeoJSON Feature with a LineString, plus name and the
// total SI distance. Per-waypoint names ride in properties.coordinatesMeta, index-aligned.
export interface RouteResourceBody {
  name: string;
  distance: number;
  feature: {
    type: 'Feature';
    geometry: { type: 'LineString'; coordinates: LonLat[] };
    properties: { coordinatesMeta: Array<{ name?: string }> };
  };
}

export function routeToFeature(route: Route): RouteResourceBody {
  return {
    name: route.name,
    distance: routeDistanceMeters(route.waypoints),
    feature: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: route.waypoints.map((w) => latLonToLonLat(w.position)),
      },
      properties: { coordinatesMeta: route.waypoints.map((w) => ({ name: w.name })) },
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
    if (Array.isArray(coord) && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
      const name = str(meta[i]?.name);
      waypoints.push({ position: lonLatToLatLon([coord[0], coord[1]]), ...(name ? { name } : {}) });
    }
  });
  if (waypoints.length < 2) return undefined;
  const name = str(r.name) ?? id;
  return { id, name, waypoints };
}

export function routeLegs(waypoints: readonly Waypoint[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let i = 1; i < waypoints.length; i += 1) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    legs.push({
      from,
      to,
      distanceMeters: rhumbDistanceMeters(from.position, to.position),
      bearingRad: rhumbBearingRad(from.position, to.position),
    });
  }
  return legs;
}

export function routeDistanceMeters(waypoints: readonly Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    total += rhumbDistanceMeters(waypoints[i - 1].position, waypoints[i].position);
  }
  return total;
}
