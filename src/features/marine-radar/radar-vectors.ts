import type { LatLon } from '$shared/geo';
import { featureCollection } from '$shared/map';
import { geodesicCircleRing, geodesicDestination } from '$shared/nav';

export function rangeRingFeatures(
  center: LatLon,
  rangeMeters: number,
  rings: number,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let k = 1; k <= rings; k += 1) {
    const coordinates = geodesicCircleRing(
      center.latitude,
      center.longitude,
      (rangeMeters * k) / rings,
    );
    // geodesicCircleRing's last point is sin(2pi)-rounded, not exactly the first; close it exactly.
    coordinates[coordinates.length - 1] = coordinates[0];
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
  const tip = geodesicDestination(center.latitude, center.longitude, headingRad, rangeMeters);
  return {
    type: 'Feature',
    properties: { heading: true },
    geometry: { type: 'LineString', coordinates: [[center.longitude, center.latitude], tip] },
  };
}
