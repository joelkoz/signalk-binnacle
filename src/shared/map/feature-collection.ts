// An empty GeoJSON FeatureCollection, the idle state for an overlay's GeoJSON source. One shared
// copy so each overlay does not re-create the literal.
export function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
