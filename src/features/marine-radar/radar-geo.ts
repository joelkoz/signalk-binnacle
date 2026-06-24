import { DEG_TO_RAD } from '$shared/lib';

// Web Mercator is defined on the WGS84 EQUATORIAL radius (6378137), deliberately not the shared mean
// EARTH_RADIUS_M (6371000) the geodesic helpers use: the projection's units come from the equatorial
// value, so the radar quad sizing must match it.
const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * 6378137;

// Mercator units per meter at a latitude. Web Mercator is conformal, so locally one meter east and
// one meter north map to the same delta, and that delta grows as 1/cos(lat). Using one scalar for
// both axes keeps a range ring a circle instead of a cos(lat)-squashed ellipse.
export function metersToMercatorUnits(latDeg: number): number {
  return 1 / (EARTH_CIRCUMFERENCE_M * Math.cos(latDeg * DEG_TO_RAD));
}

export function rangeQuadHalfExtent(latDeg: number, rangeMeters: number): number {
  return rangeMeters * metersToMercatorUnits(latDeg);
}
