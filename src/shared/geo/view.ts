// A map viewport as a center plus zoom: the lat/lon/zoom triple the map factory opens at and emits,
// and the settings layer persists across visits. Defined here, the lowest slice both depend on, so
// the map and settings slices carry one definition and neither has to depend on the other.
export interface MapView {
  lat: number;
  lon: number;
  zoom: number;
}
