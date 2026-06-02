import type { TrackPoint } from '$entities/track';

// Split a flat point list into per-segment coordinate arrays, breaking at gap points so a
// dropout shows as a real break. Each coordinate is GeoJSON [lon, lat]. Single-coordinate
// segments are dropped: a LineString needs two positions, so a lone fix cannot form a line.
export function coordinateSegments(points: readonly TrackPoint[]): [number, number][][] {
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];
  for (const point of points) {
    if (point.gap && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push([point.lon, point.lat]);
  }
  if (current.length > 0) segments.push(current);
  return segments.filter((segment) => segment.length >= 2);
}

// A GeoJSON Feature with MultiLineString geometry: the portable, importable form of a track.
export function toGeoJsonFeature(name: string, points: readonly TrackPoint[]): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: { type: 'MultiLineString', coordinates: coordinateSegments(points) },
    properties: { name, source: 'binnacle' },
  };
}

export function toGeoJsonString(name: string, points: readonly TrackPoint[]): string {
  return JSON.stringify(toGeoJsonFeature(name, points), null, 2);
}

// Trigger a browser download of the track as a .geojson file. Node-guarded so it is inert in
// tests and any non-DOM context.
export function downloadGeoJson(name: string, points: readonly TrackPoint[]): void {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return;
  const blob = new Blob([toGeoJsonString(name, points)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name || 'track'}.geojson`;
  anchor.click();
  URL.revokeObjectURL(url);
}
