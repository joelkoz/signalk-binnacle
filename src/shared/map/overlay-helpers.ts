import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { emptyFeatureCollection } from './feature-collection';

// Add an empty GeoJSON source under `id` when the map does not already hold it: the idle state every
// overlay's add() starts from before its first setData. Idempotent, so a re-add after a base-style
// swap finds the source present and leaves its features in place rather than clearing them.
export function ensureGeoJsonSource(map: MapLibreMap, id: string): void {
  if (!map.getSource(id)) {
    map.addSource(id, { type: 'geojson', data: emptyFeatureCollection() });
  }
}

// The many-source form: guard-add each id. An overlay that owns more than one GeoJSON source (rings
// and labels, vectors and trails) calls this so the loop lives in one place.
export function ensureGeoJsonSources(map: MapLibreMap, ids: readonly string[]): void {
  for (const id of ids) ensureGeoJsonSource(map, id);
}

// Set a GeoJSON source's data, narrowing the source handle in one place: the dozen-odd overlays that
// push fresh features otherwise re-spell the `(map.getSource(id) as GeoJSONSource | undefined)?.setData`
// cast at each site. A no-op when the source is absent (the overlay was removed mid-flight).
export function setSourceData(
  map: MapLibreMap,
  sourceId: string,
  data: GeoJSON.GeoJSON | string,
): void {
  (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
}

// The two loops every overlay module's setVisible and remove repeat, shared so the lifecycle
// cannot drift between overlays (a forgotten layer in one loop is an invisible-but-interactive
// or leaked layer).

export function setLayersVisibility(
  map: MapLibreMap,
  layerIds: readonly string[],
  visible: boolean,
): void {
  const value = visible ? 'visible' : 'none';
  for (const id of layerIds) {
    // Guard on getLayer, matching removeLayersAndSources: setLayoutProperty throws on a layer that is
    // not present (for example before add() or after a base-style reload), so a caller can pass its
    // full layer set without tracking which are currently attached.
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', value);
  }
}

// Layers first, then sources: a source cannot be removed while a layer still references it.
export function removeLayersAndSources(
  map: MapLibreMap,
  layerIds: readonly string[],
  sourceIds: readonly string[],
): void {
  for (const id of layerIds) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of sourceIds) {
    if (map.getSource(id)) map.removeSource(id);
  }
}
