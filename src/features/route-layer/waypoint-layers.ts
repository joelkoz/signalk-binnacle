import type {
  CircleLayerSpecification,
  Map as MapLibreMap,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { MapThemePaint } from '$shared/map';

// The route waypoint dot and its name-or-number label, shared by the saved-route overlay and the
// working-route overlay so a restyle lands in one place. The id and source differ per overlay; the
// paint comes from the theme.

export function waypointCircleLayer(
  id: string,
  source: string,
  paint: MapThemePaint,
): CircleLayerSpecification {
  return {
    id,
    type: 'circle',
    source,
    paint: {
      'circle-radius': 4,
      'circle-color': paint.note,
      'circle-stroke-color': paint.markerGlyph,
      'circle-stroke-width': 1,
    },
  };
}

export function waypointLabelLayer(
  id: string,
  source: string,
  paint: MapThemePaint,
): SymbolLayerSpecification {
  return {
    id,
    type: 'symbol',
    source,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-offset': [0, 1.1],
      'text-optional': true,
    },
    paint: {
      'text-color': paint.label,
      'text-halo-color': paint.background,
      'text-halo-width': 1.5,
    },
  };
}

// Recolor the dot and label layers for a theme, shared by both overlays' theme paths.
export function recolorWaypointLayers(
  map: MapLibreMap,
  circleId: string,
  labelId: string,
  paint: MapThemePaint,
): void {
  map.setPaintProperty(circleId, 'circle-color', paint.note);
  map.setPaintProperty(circleId, 'circle-stroke-color', paint.markerGlyph);
  map.setPaintProperty(labelId, 'text-color', paint.label);
  map.setPaintProperty(labelId, 'text-halo-color', paint.background);
}
