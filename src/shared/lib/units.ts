const MS_TO_KNOTS = 1.943844492;
const METERS_TO_FEET = 3.280839895;
const METERS_PER_NAUTICAL_MILE = 1852;
const DEG_PER_RAD = 180 / Math.PI;

// Signal K can emit null as well as undefined for an absent value, so the guards
// use `== null` to catch both.
export function metersPerSecondToKnots(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value * MS_TO_KNOTS;
}

export function knotsToMetersPerSecond(value: number): number {
  return value / MS_TO_KNOTS;
}

export function radiansToDegrees(value: number | null | undefined): number | undefined {
  if (value == null) return undefined;
  return (value * DEG_PER_RAD + 360) % 360;
}

export function degreesToRadians(value: number): number {
  return value / DEG_PER_RAD;
}

export function kelvinToCelsius(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value - 273.15;
}

export function metersToFeet(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value * METERS_TO_FEET;
}

export function metersToNauticalMiles(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value / METERS_PER_NAUTICAL_MILE;
}
