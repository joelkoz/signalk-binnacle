import type { LatLon } from '$shared/geo';
import { DEG_TO_RAD } from '$shared/lib';
import { EARTH_RADIUS_M, haversineMeters, normalizeLonDeltaDeg } from './distance';

// Rhumb-line (constant-bearing) distance: the line you actually steer over a short to medium leg.
export function rhumbDistanceMeters(from: LatLon, to: LatLon): number {
  const dLatRad = (to.latitude - from.latitude) * DEG_TO_RAD;
  const dLonRad = normalizeLonDeltaDeg(to.longitude - from.longitude) * DEG_TO_RAD;
  const lat1 = from.latitude * DEG_TO_RAD;
  const lat2 = to.latitude * DEG_TO_RAD;
  const dPhi = Math.log(Math.tan(Math.PI / 4 + lat2 / 2) / Math.tan(Math.PI / 4 + lat1 / 2));
  const q = Math.abs(dPhi) > 1e-12 ? dLatRad / dPhi : Math.cos(lat1);
  return Math.hypot(dLatRad, q * dLonRad) * EARTH_RADIUS_M;
}

// Constant compass bearing from -> to, radians clockwise from true north in [0, 2pi).
export function rhumbBearingRad(from: LatLon, to: LatLon): number {
  const dLonRad = normalizeLonDeltaDeg(to.longitude - from.longitude) * DEG_TO_RAD;
  const lat1 = from.latitude * DEG_TO_RAD;
  const lat2 = to.latitude * DEG_TO_RAD;
  const dPhi = Math.log(Math.tan(Math.PI / 4 + lat2 / 2) / Math.tan(Math.PI / 4 + lat1 / 2));
  return (Math.atan2(dLonRad, dPhi) + 2 * Math.PI) % (2 * Math.PI);
}

// Initial great-circle bearing, for a long-passage readout alongside the rhumb bearing.
export function greatCircleBearingRad(from: LatLon, to: LatLon): number {
  const lat1 = from.latitude * DEG_TO_RAD;
  const lat2 = to.latitude * DEG_TO_RAD;
  const dLon = normalizeLonDeltaDeg(to.longitude - from.longitude) * DEG_TO_RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);
}

// Signed cross-track distance (meters) of `position` from the great-circle leg from -> to.
// Positive is to starboard of the leg (right of the direction of travel), negative to port.
export function crossTrackErrorMeters(from: LatLon, to: LatLon, position: LatLon): number {
  const d13 = haversineMeters(from.latitude, from.longitude, position.latitude, position.longitude);
  const theta13 = greatCircleBearingRad(from, position);
  const theta12 = greatCircleBearingRad(from, to);
  const ratio = Math.max(-1, Math.min(1, (d13 / EARTH_RADIUS_M) * Math.sin(theta13 - theta12)));
  // Starboard-positive, matching the server's calcValues.crossTrackError convention (reconciled
  // during live verification), so the computed fallback agrees with a provider value.
  return Math.asin(ratio) * EARTH_RADIUS_M;
}

// Velocity made good toward the mark: the boat's velocity vector projected onto the bearing to the
// mark. Positive closes the mark, negative opens it. SOG m/s, COG radians clockwise from north.
export function vmgMps(position: LatLon, mark: LatLon, sogMps: number, cogRad: number): number {
  const bearing = rhumbBearingRad(position, mark);
  return sogMps * Math.cos(cogRad - bearing);
}

// Seconds to cover `distanceMeters` at `speedMps`. Undefined for a non-positive speed (no ETA).
export function etaSeconds(distanceMeters: number, speedMps: number): number | undefined {
  if (speedMps <= 0) return undefined;
  return distanceMeters / speedMps;
}

// The side to steer toward to close a cross-track error back onto the leg. The cross-track sign is
// starboard-positive (see crossTrackErrorMeters), so a positive error puts the boat to starboard of
// the track and the correction is to port, and vice versa. Zero or non-finite yields no side.
export function steerSide(crossTrackMeters: number): 'port' | 'starboard' | null {
  if (!Number.isFinite(crossTrackMeters) || crossTrackMeters === 0) return null;
  return crossTrackMeters > 0 ? 'port' : 'starboard';
}
