import type {
  CircleLayerSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { Waypoint, WaypointsStore } from '$entities/waypoint';
import {
  emptyFeatureCollection,
  type MapThemePaint,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
  removeLayersAndSources,
  setLayersVisibility,
} from '$shared/map';

const SOURCE_ID = 'binnacle-waypoints';
const MARKER_LAYER = 'binnacle-waypoint-marker';
const LABEL_LAYER = 'binnacle-waypoint-label';
const BAND = 'routes';
const LAYERS = [MARKER_LAYER, LABEL_LAYER];

export interface WaypointOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function features(waypoints: readonly Waypoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: waypoints.map((waypoint) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [waypoint.position.longitude, waypoint.position.latitude],
      },
      properties: { name: waypoint.name },
    })),
  };
}

// Standalone waypoints as a small marker disc with the name set beside it, presentational only
// (no click handling). The band matches the route overlay so the Layers panel lists it under
// My routes and tracks. Circle and text layers, so it themes cleanly to night-red.
export function createWaypointOverlay(store: WaypointsStore): WaypointOverlay {
  let paint: MapThemePaint = mapThemePaint('day');
  let lastVersion = -1;

  return {
    id: 'waypoints',
    title: 'Waypoints',
    band: BAND,
    supportsOpacity: true,
    layerIds: LAYERS,
    add(ctx) {
      // Reset the dirty-check so a reattach (after a base-style swap emptied the source)
      // repopulates it on the next sync instead of staying blank.
      lastVersion = -1;
      const before = ctx.beforeIdFor(BAND);
      if (!ctx.map.getSource(SOURCE_ID)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        ctx.map.addSource(SOURCE_ID, source);
      }
      if (!ctx.map.getLayer(MARKER_LAYER)) {
        const layer: CircleLayerSpecification = {
          id: MARKER_LAYER,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': 5,
            'circle-color': paint.note,
            'circle-stroke-color': paint.markerGlyph,
            'circle-stroke-width': 1.5,
          },
        };
        ctx.map.addLayer(layer, before);
      }
      if (!ctx.map.getLayer(LABEL_LAYER)) {
        const layer: SymbolLayerSpecification = {
          id: LABEL_LAYER,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
            'text-offset': [0.8, 0],
            'text-anchor': 'left',
            'text-optional': true,
            'text-max-width': 12,
          },
          paint: {
            'text-color': paint.label,
            'text-halo-color': paint.background,
            'text-halo-width': 1.5,
          },
        };
        ctx.map.addLayer(layer, before);
      }
    },
    sync(ctx) {
      if (store.version === lastVersion) return;
      lastVersion = store.version;
      (ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData(
        features(store.waypoints),
      );
    },
    setVisible(ctx, visible) {
      setLayersVisibility(ctx.map, LAYERS, visible);
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-opacity', opacity);
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-stroke-opacity', opacity);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-opacity', opacity);
    },
    applyTheme(ctx, next) {
      paint = next;
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-color', paint.note);
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-stroke-color', paint.markerGlyph);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-color', paint.label);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-halo-color', paint.background);
    },
    remove(ctx) {
      removeLayersAndSources(ctx.map, LAYERS, [SOURCE_ID]);
    },
  };
}
