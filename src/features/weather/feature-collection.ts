// An empty GeoJSON FeatureCollection, the idle state for the weather overlays' GeoJSON sources and
// the empty return for the arrow builders. One copy so the literal does not drift.
export function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
