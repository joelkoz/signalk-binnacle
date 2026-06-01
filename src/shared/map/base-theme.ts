import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MapThemePaint } from './map-theme';

// The base map is the OpenFreeMap "liberty" style (OpenMapTiles schema). Its default
// palette is a light day theme, so on dusk and night-red the roads stayed white and the
// landcover green. We recolor it per theme from each layer's source-layer, which is a far
// more stable key than the individual layer ids.

// A layer whose id starts with one of these is owned by an overlay (the chart and every
// binnacle overlay theme their own layers via the layer manager), so the base recolor
// leaves them alone.
const MANAGED_PREFIXES = ['chart-', 'binnacle-'];

interface BaseLayer {
  id: string;
  type: string;
  'source-layer'?: string;
}

function paintProperty(type: string): string | null {
  switch (type) {
    case 'fill':
      return 'fill-color';
    case 'line':
      return 'line-color';
    case 'fill-extrusion':
      return 'fill-extrusion-color';
    default:
      return null;
  }
}

function sourceColor(
  sourceLayer: string | undefined,
  type: string,
  paint: MapThemePaint,
): string | null {
  switch (sourceLayer) {
    case 'water':
    case 'waterway':
      return paint.water;
    case 'park':
    case 'landcover':
      return paint.landcover;
    case 'landuse':
    case 'building':
      return paint.land;
    case 'boundary':
      return paint.boundary;
    case 'transportation':
      return paint.road;
    // Aeroway aprons read as land; runways and taxiways read as roads.
    case 'aeroway':
      return type === 'line' ? paint.road : paint.land;
    default:
      return null;
  }
}

// The paint property and color a base-map layer should take for the theme, or null to
// leave it untouched (raster, unknown source layers). Pure, so it is unit-testable.
export function baseLayerPaint(
  layer: BaseLayer,
  paint: MapThemePaint,
): { property: string; color: string } | null {
  if (layer.type === 'background') return { property: 'background-color', color: paint.background };
  // Every text label (place, road, water names) takes the theme label color.
  if (layer.type === 'symbol') return { property: 'text-color', color: paint.label };
  const property = paintProperty(layer.type);
  if (!property) return null;
  const color = sourceColor(layer['source-layer'], layer.type, paint);
  return color ? { property, color } : null;
}

// Recolor the whole base style for the theme. Skips overlay-owned layers, sets the themed
// color, clears any fill pattern (the wetland hatch, paved-area texture) so the flat color
// shows, and gives label text a background-colored halo for contrast on every theme.
export function applyBaseTheme(map: MapLibreMap, paint: MapThemePaint): void {
  let layers: BaseLayer[];
  try {
    layers = (map.getStyle().layers ?? []) as BaseLayer[];
  } catch {
    return;
  }
  for (const layer of layers) {
    if (MANAGED_PREFIXES.some((prefix) => layer.id.startsWith(prefix))) continue;
    const themed = baseLayerPaint(layer, paint);
    if (!themed) continue;
    try {
      map.setPaintProperty(layer.id, themed.property, themed.color);
      if (layer.type === 'fill') map.setLayoutProperty(layer.id, 'fill-pattern', undefined);
      if (layer.type === 'symbol')
        map.setPaintProperty(layer.id, 'text-halo-color', paint.background);
    } catch {
      // A layer without this property is fine; skip it.
    }
  }
}
