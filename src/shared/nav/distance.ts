import type { LatLon } from '$shared/geo';
import { DEG_TO_RAD } from '$shared/lib';

// Mean Earth radius in meters, shared by the great-circle and rhumb-line geodesy.
export const EARTH_RADIUS_M = 6_371_000;

// Meters per degree at the equator: exact for latitude, and the base for longitude once scaled by
// cos(latitude). One constant serves both axes; the cos factor is what differs. Shared by the CPA
// local projection and the track-to-route simplification tolerance.
export const METERS_PER_DEG = 111_320;

// Wrap a longitude delta into [-180, 180] so a pair straddling the antimeridian does not read as a
// ~360-degree separation. Shared by the rhumb-line geometry and the CPA local projection. Total
// over any input (not just one turn), so an accumulated or out-of-range delta still normalizes.
export function normalizeLonDeltaDeg(delta: number): number {
  return delta - 360 * Math.round(delta / 360);
}

// A closed geodesic circle around a center as a GeoJSON ring (lon/lat pairs, first equals last),
// from the great-circle destination formula. At small radii a flat circle would also do, but the
// exact form costs nothing and stays honest at high latitudes.
export function geodesicCircleRing(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  steps = 64,
): [number, number][] {
  const angular = radiusMeters / EARTH_RADIUS_M;
  const lat = latitude * DEG_TO_RAD;
  const lon = longitude * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinAngular = Math.sin(angular);
  const cosAngular = Math.cos(angular);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const pointLat = Math.asin(sinLat * cosAngular + cosLat * sinAngular * Math.cos(bearing));
    const pointLon =
      lon +
      Math.atan2(Math.sin(bearing) * sinAngular * cosLat, cosAngular - sinLat * Math.sin(pointLat));
    ring.push([pointLon / DEG_TO_RAD, pointLat / DEG_TO_RAD]);
  }
  return ring;
}

// Project a point along a great-circle bearing for a distance. bearing is radians clockwise from
// true north. Returns [longitude, latitude] in decimal degrees (GeoJSON order).
export function geodesicDestination(
  latitude: number,
  longitude: number,
  bearingRad: number,
  distanceMeters: number,
): [number, number] {
  const d = distanceMeters / EARTH_RADIUS_M;
  const lat1 = latitude * DEG_TO_RAD;
  const lon1 = longitude * DEG_TO_RAD;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearingRad),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [lon2 / DEG_TO_RAD, lat2 / DEG_TO_RAD];
}

// Great-circle distance between two lat/lon points in meters.
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Whether two routes are the same to within a per-waypoint tolerance: the same count and every
// waypoint within toleranceMeters of its counterpart. Used to tell an optimize that did not change
// anything from one that did, so the navigator is not asked to re-verify an untouched route.
export function routesRoughlyEqual(
  a: readonly LatLon[],
  b: readonly LatLon[],
  toleranceMeters: number,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const moved = haversineMeters(a[i].latitude, a[i].longitude, b[i].latitude, b[i].longitude);
    if (moved > toleranceMeters) return false;
  }
  return true;
}
