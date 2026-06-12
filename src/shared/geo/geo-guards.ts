export interface LatLon {
  latitude: number;
  longitude: number;
}

export function isLatLon(value: unknown): value is LatLon {
  // Finite, not just number: JSON.parse turns an extreme literal into Infinity, and a non-finite
  // coordinate is never valid for any caller.
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isFinite((value as LatLon).latitude) &&
    Number.isFinite((value as LatLon).longitude)
  );
}

// GeoJSON coordinate order is longitude first; Signal K positions and the Course API use a
// {latitude, longitude} object. These two functions are the only place that crosses the two
// orderings, so a mismatch lives in exactly one tested spot.
export type LonLat = [number, number];

// A GeoJSON [lon, lat] coordinate pair. Shared by the route and track GeoJSON parsers, which all
// filter raw coordinate arrays down to numeric pairs before mapping them to LatLon.
export function isLonLat(value: unknown): value is LonLat {
  return Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number';
}

export function lonLatToLatLon([longitude, latitude]: LonLat): LatLon {
  return { latitude, longitude };
}

export function latLonToLonLat(position: LatLon): LonLat {
  return [position.longitude, position.latitude];
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
