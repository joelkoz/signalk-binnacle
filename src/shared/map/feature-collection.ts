// A fresh empty GeoJSON FeatureCollection, the idle state for an overlay's GeoJSON source. Returns a
// new object each call rather than a shared singleton, because MapLibre's setData may retain the
// reference, so the overlays must not alias one mutable instance.
export function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

// Wrap a feature list in a FeatureCollection, so the overlays that build features for setData share
// one spelling of the wrapper instead of each writing the literal.
export function featureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}
