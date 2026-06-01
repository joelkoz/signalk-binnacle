const MS_TO_KNOTS = 1.943844492;
const METERS_PER_NAUTICAL_MILE = 1852;
const DEG_PER_RAD = 180 / Math.PI;

// The store-to-display converters accept null and undefined because a Signal K value
// can be absent (the guards use `== null` to catch both). The inverse converters
// (knotsToMetersPerSecond, degreesToRadians) take a definite number on purpose: they
// run at the input edge on values the caller has already resolved.
export function metersPerSecondToKnots(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value * MS_TO_KNOTS;
}

export function knotsToMetersPerSecond(value: number): number {
  return value / MS_TO_KNOTS;
}

// Normalizes to a 0..360 compass bearing, so this is for bearings (COG, heading,
// variation), not arbitrary signed angles.
export function radiansToDegrees(value: number | null | undefined): number | undefined {
  if (value == null) return undefined;
  return (value * DEG_PER_RAD + 360) % 360;
}

export function degreesToRadians(value: number): number {
  return value / DEG_PER_RAD;
}

export function metersToNauticalMiles(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value / METERS_PER_NAUTICAL_MILE;
}
