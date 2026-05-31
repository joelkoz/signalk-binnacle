const MS_TO_KNOTS = 1.943844492;
const METERS_TO_FEET = 3.280839895;
const METERS_PER_NAUTICAL_MILE = 1852;

export function metersPerSecondToKnots(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value * MS_TO_KNOTS;
}

export function radiansToDegrees(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return ((value * 180) / Math.PI + 360) % 360;
}

export function kelvinToCelsius(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value - 273.15;
}

export function metersToFeet(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value * METERS_TO_FEET;
}

export function metersToNauticalMiles(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value / METERS_PER_NAUTICAL_MILE;
}
