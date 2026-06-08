import { PLACEHOLDER } from './coords';

const MS_TO_KNOTS = 1.943844492;
const METERS_PER_NAUTICAL_MILE = 1852;
const DEG_PER_RAD = 180 / Math.PI;
const KELVIN_OFFSET = 273.15;
export const PA_PER_HPA = 100;

// Degrees-to-radians as a plain multiplier, for tight numeric loops (haversine, grid sampling)
// that would otherwise each define their own `Math.PI / 180`. The display-edge converter
// degreesToRadians is defined in terms of it.
export const DEG_TO_RAD = Math.PI / 180;

// Milliseconds in a minute, hour, and day, shared by the time-step and TTL constants so the
// factors are named once rather than re-spelled as 60 * 1000 chains across the loaders.
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

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
  return value * DEG_TO_RAD;
}

// A 0..360 heading in degrees: the heading if present, otherwise the course over ground, otherwise
// north. Shared by the vessel and AIS symbol overlays, which both rotate by this.
export function headingDegrees(
  headingRad: number | null | undefined,
  cogRad: number | null | undefined,
): number {
  return radiansToBearing(headingRad) ?? radiansToBearing(cogRad) ?? 0;
}

export function pascalsToHectopascals(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value / PA_PER_HPA;
}

// Signal K temperatures are Kelvin; the display edge shows Celsius.
export function kelvinToCelsius(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value - KELVIN_OFFSET;
}

// A null-safe fixed-digit reading: the placeholder when absent, otherwise the value to `digits`.
// Centralized so the readouts that show "value or --" do not each re-implement it.
export function formatFixed(value: number | null | undefined, digits: number): string {
  return value == null ? PLACEHOLDER : value.toFixed(digits);
}

// Placeholder-aware speed and bearing readouts. Unlike formatKnots (which shows 0.0 for an absent
// value), these show PLACEHOLDER ("--") so the SOG, COG, BTW, and wind-legend readouts never render
// a misleading zero. The convert-then-formatFixed pattern is written once here, not at each site.
export function formatKnotsOr(metersPerSecond: number | null | undefined, digits = 1): string {
  return formatFixed(metersPerSecondToKnots(metersPerSecond), digits);
}

export function formatBearingOr(radians: number | null | undefined, digits = 0): string {
  return formatFixed(radiansToBearing(radians), digits);
}

export function formatHectopascalsOr(pascals: number | null | undefined, digits = 0): string {
  return formatFixed(pascalsToHectopascals(pascals), digits);
}

export function metersToNauticalMiles(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value / METERS_PER_NAUTICAL_MILE;
}

export function nauticalMilesToMeters(value: number): number {
  return value * METERS_PER_NAUTICAL_MILE;
}

// A meters-to-nautical-miles reading for any distance (track length, range), centralized so
// the conversion and rounding do not drift across the readouts that show it. A null input reads as
// 0.00; callers that must show a blank for an absent value (the NavStrip, TracksPanel) guard with
// PLACEHOLDER before calling, so a null never reaches the `?? 0` path in those readouts.
export function formatNm(meters: number, digits = 2): string {
  return (metersToNauticalMiles(meters) ?? 0).toFixed(digits);
}

// A knots reading for a speed in m/s (SI), centralized so the SOG readouts do not drift. As with
// formatNm, a null reads as 0.0; callers that need a blank guard with PLACEHOLDER first.
export function formatKnots(metersPerSecond: number | null | undefined, digits = 1): string {
  return (metersPerSecondToKnots(metersPerSecond) ?? 0).toFixed(digits);
}

// Placeholder-aware nautical-miles reading: PLACEHOLDER when absent, otherwise the value. The
// NavStrip and TracksPanel show a blank rather than a misleading 0.00 for an absent distance, so
// they use this instead of guarding formatNm with `!= null` at each site.
export function formatNmOr(meters: number | null | undefined, digits = 2): string {
  return formatFixed(metersToNauticalMiles(meters), digits);
}

// CPA is just a distance; named for the collision metric at its call sites.
export function formatCpaNm(meters: number, digits = 2): string {
  return formatNm(meters, digits);
}

export function formatTcpaMin(seconds: number, digits = 0): string {
  return (seconds / 60).toFixed(digits);
}

// A time-to-go readout with its own unit: minutes under an hour ("45 min"), hours and minutes above
// ("2h 05m"). TTG on a passage routinely exceeds an hour, where a bare minute count ("420 min")
// reads as nonsense, so the unit is built in rather than appended by the caller.
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}
