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

// Radians to a 0..360 compass bearing (COG, heading). The 0..360 normalization is the reason
// this is bearing-specific; it must not be reused for an arbitrary signed angle.
export function radiansToBearing(value: number | null | undefined): number | undefined {
  if (value == null) return undefined;
  return (value * DEG_PER_RAD + 360) % 360;
}

export function degreesToRadians(value: number): number {
  return value / DEG_PER_RAD;
}

export function metersToNauticalMiles(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value / METERS_PER_NAUTICAL_MILE;
}

export function nauticalMilesToMeters(value: number): number {
  return value * METERS_PER_NAUTICAL_MILE;
}

// A meters-to-nautical-miles reading for any distance (track length, range), centralized so
// the conversion and rounding do not drift across the readouts that show it.
export function formatNm(meters: number, digits = 2): string {
  return (metersToNauticalMiles(meters) ?? 0).toFixed(digits);
}

// CPA is just a distance; named for the collision metric at its call sites.
export function formatCpaNm(meters: number, digits = 2): string {
  return formatNm(meters, digits);
}

export function formatTcpaMin(seconds: number, digits = 0): string {
  return (seconds / 60).toFixed(digits);
}
