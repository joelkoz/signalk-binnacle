import { DEG_TO_RAD } from '$shared/lib';

// Mean Earth radius in meters, shared by the great-circle and rhumb-line geodesy.
export const EARTH_RADIUS_M = 6_371_000;

// Wrap a longitude delta into [-180, 180] so a pair straddling the antimeridian does not read as a
// ~360-degree separation. Shared by the rhumb-line geometry and the CPA local projection.
export function normalizeLonDeltaDeg(delta: number): number {
  let d = delta;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
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
