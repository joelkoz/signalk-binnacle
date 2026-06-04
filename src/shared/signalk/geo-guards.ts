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

// GeoJSON coordinate order is longitude first; Signal K positions and the Course API use a
// {latitude, longitude} object. These two functions are the only place that crosses the two
// orderings, so a mismatch lives in exactly one tested spot.
export type LonLat = [number, number];

export function lonLatToLatLon([longitude, latitude]: LonLat): LatLon {
  return { latitude, longitude };
}

export function latLonToLonLat(position: LatLon): LonLat {
  return [position.longitude, position.latitude];
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
