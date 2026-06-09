import { DEG_TO_RAD } from '$shared/lib';
import { normalizeLonDeltaDeg } from './distance';

export interface Kinematics {
  latitude: number;
  longitude: number;
  sogMps: number;
  cogRad: number;
}

export interface CpaResult {
  cpaMeters: number;
  tcpaSeconds: number;
  closing: boolean;
}

// Meters per degree at the equator: exact for latitude, and the base for longitude once
// scaled by cos(latitude). One constant serves both axes; the cos factor is what differs.
export const METERS_PER_DEG = 111_320;

// Local east-north projection around the own vessel. Accurate within the few
// nautical miles that matter for collision; large separations are not the use case.
function toLocalMeters(origin: Kinematics, point: Kinematics): [number, number] {
  // Normalize the longitude delta so a pair straddling the antimeridian does not read as a
  // ~360-degree separation.
  const dLon = normalizeLonDeltaDeg(point.longitude - origin.longitude);
  // East meters per degree shrink with latitude: METERS_PER_DEG times cos(latitude).
  const east = dLon * METERS_PER_DEG * Math.cos(origin.latitude * DEG_TO_RAD);
  const north = (point.latitude - origin.latitude) * METERS_PER_DEG;
  return [east, north];
}

function velocity(k: Kinematics): [number, number] {
  // Course is clockwise from north, so the east component is sin and north is cos.
  return [k.sogMps * Math.sin(k.cogRad), k.sogMps * Math.cos(k.cogRad)];
}

export function computeCpa(own: Kinematics, target: Kinematics): CpaResult {
  const [rx, ry] = toLocalMeters(own, target);
  const [ovx, ovy] = velocity(own);
  const [tvx, tvy] = velocity(target);
  const dvx = tvx - ovx;
  const dvy = tvy - ovy;
  const dv2 = dvx * dvx + dvy * dvy;
  const rangeNow = Math.hypot(rx, ry);
  if (dv2 === 0) {
    // No relative motion: range is constant and they never close.
    return { cpaMeters: rangeNow, tcpaSeconds: 0, closing: false };
  }
  const tcpa = -(rx * dvx + ry * dvy) / dv2;
  if (tcpa <= 0) {
    // CPA is in the past (opening or already passed).
    return { cpaMeters: rangeNow, tcpaSeconds: 0, closing: false };
  }
  const cx = rx + dvx * tcpa;
  const cy = ry + dvy * tcpa;
  return { cpaMeters: Math.hypot(cx, cy), tcpaSeconds: tcpa, closing: true };
}
