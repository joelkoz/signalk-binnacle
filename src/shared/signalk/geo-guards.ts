export interface LatLon {
  latitude: number;
  longitude: number;
}

export function isLatLon(value: unknown): value is LatLon {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LatLon).latitude === 'number' &&
    typeof (value as LatLon).longitude === 'number'
  );
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
