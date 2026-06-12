import { isLonLat, type LonLat, latLonToLonLat, lonLatToLatLon } from '$shared/geo';
import { str } from '$shared/signalk';
import type { Waypoint } from './waypoint-types';

// The Signal K v2 waypoint resource body: name and description ride at the top level (not in
// feature.properties), and the feature wraps a GeoJSON Point in [longitude, latitude] order,
// per the server's WaypointSchema.
export interface WaypointResourceBody {
  name: string;
  description?: string;
  feature: {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: LonLat };
    properties: Record<string, never>;
  };
}

export function waypointToFeature(waypoint: Waypoint): WaypointResourceBody {
  return {
    name: waypoint.name,
    ...(waypoint.description ? { description: waypoint.description } : {}),
    feature: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: latLonToLonLat(waypoint.position) },
      properties: {},
    },
  };
}

export function featureToWaypoint(id: string, raw: unknown): Waypoint | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const w = raw as {
    name?: unknown;
    description?: unknown;
    feature?: { geometry?: { type?: unknown; coordinates?: unknown } };
  };
  const geom = w.feature?.geometry;
  if (geom?.type !== 'Point' || !isLonLat(geom.coordinates)) return undefined;
  const description = str(w.description);
  return {
    id,
    name: str(w.name) ?? id,
    position: lonLatToLatLon(geom.coordinates),
    ...(description ? { description } : {}),
  };
}
