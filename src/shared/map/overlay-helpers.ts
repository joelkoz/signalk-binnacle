import type { Map as MapLibreMap } from 'maplibre-gl';

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
    map.setLayoutProperty(id, 'visibility', value);
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
