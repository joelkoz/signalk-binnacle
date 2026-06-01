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

const METERS_PER_DEG_LAT = 111_320;

// Local east-north projection around the own vessel. Accurate within the few
// nautical miles that matter for collision; large separations are not the use case.
function toLocalMeters(origin: Kinematics, point: Kinematics): [number, number] {
  const east =
    (point.longitude - origin.longitude) *
    METERS_PER_DEG_LAT *
    Math.cos((origin.latitude * Math.PI) / 180);
  const north = (point.latitude - origin.latitude) * METERS_PER_DEG_LAT;
  return [east, north];
}

function velocity(k: Kinematics): [number, number] {
  // Course is measured clockwise from north, so east = sin, north = cos.
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
