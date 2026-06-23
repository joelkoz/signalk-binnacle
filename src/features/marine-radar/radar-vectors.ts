import type { LatLon } from '$shared/geo';
import { featureCollection } from '$shared/map';

const M_PER_DEG_LAT = 111320;

function offset(center: LatLon, east: number, north: number): [number, number] {
  const lat = center.latitude + north / M_PER_DEG_LAT;
  const lon =
    center.longitude + east / (M_PER_DEG_LAT * Math.cos((center.latitude * Math.PI) / 180));
  return [lon, lat];
}

export function rangeRingFeatures(
  center: LatLon,
  rangeMeters: number,
  rings: number,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let k = 1; k <= rings; k += 1) {
    const radius = (rangeMeters * k) / rings;
    const coordinates: [number, number][] = [];
    for (let i = 0; i < 64; i += 1) {
      const a = (i / 64) * 2 * Math.PI;
      coordinates.push(offset(center, radius * Math.sin(a), radius * Math.cos(a)));
    }
    coordinates.push(coordinates[0]); // close the ring exactly, not via sin(2pi) rounding
    features.push({
      type: 'Feature',
      properties: { ring: k },
      geometry: { type: 'LineString', coordinates },
    });
  }
  return featureCollection(features);
}

export function headingLineFeature(
  center: LatLon,
  headingRad: number,
  rangeMeters: number,
): GeoJSON.Feature {
  const tip = offset(
    center,
    rangeMeters * Math.sin(headingRad),
    rangeMeters * Math.cos(headingRad),
  );
  return {
    type: 'Feature',
    properties: { heading: true },
    geometry: { type: 'LineString', coordinates: [[center.longitude, center.latitude], tip] },
  };
}
