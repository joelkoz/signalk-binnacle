// A fresh empty GeoJSON FeatureCollection, the idle state for an overlay's GeoJSON source. Returns a
// new object each call rather than a shared singleton, because MapLibre's setData may retain the
// reference, so the overlays must not alias one mutable instance.
export function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
