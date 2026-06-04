import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { RouteStore } from '$entities/route';
import {
  emptyFeatureCollection,
  type MapThemePaint,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
} from '$shared/map';
import { routeLineFeatures, waypointFeatures } from './route-features';

const LINE_SRC = 'binnacle-route-lines';
const LINE_LAYER = 'binnacle-route-line';
const WPT_SRC = 'binnacle-route-waypoints';
const WPT_LAYER = 'binnacle-route-waypoint';
const WPT_LABEL_LAYER = 'binnacle-route-waypoint-label';
const BAND = 'routes';
const LAYERS = [LINE_LAYER, WPT_LAYER, WPT_LABEL_LAYER];

// The active route draws in the selection accent and a touch heavier, every other shown route in
// the note color, so the route being followed stands apart from the planned ones.
function lineColor(paint: MapThemePaint): ExpressionSpecification {
  return ['case', ['get', 'active'], paint.select, paint.note];
}

const LINE_WIDTH: ExpressionSpecification = ['case', ['get', 'active'], 3, 2];

export interface RouteOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

export function createRouteOverlay(store: RouteStore): RouteOverlay {
  let paint: MapThemePaint = mapThemePaint('day');
  let lastVersion = -1;

  return {
    id: 'routes',
    title: 'Routes',
    band: BAND,
    supportsOpacity: true,
    layerIds: LAYERS,
    add(ctx) {
      // Reset the dirty-check so a reattach (after a base-style swap emptied the sources)
      // repopulates them on the next sync instead of staying blank.
      lastVersion = -1;
      const before = ctx.beforeIdFor(BAND);
      if (!ctx.map.getSource(LINE_SRC)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        ctx.map.addSource(LINE_SRC, source);
      }
      if (!ctx.map.getSource(WPT_SRC)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        ctx.map.addSource(WPT_SRC, source);
      }
      if (!ctx.map.getLayer(LINE_LAYER)) {
        const layer: LineLayerSpecification = {
          id: LINE_LAYER,
          type: 'line',
          source: LINE_SRC,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': lineColor(paint),
            'line-width': LINE_WIDTH,
            'line-dasharray': [2, 1],
          },
        };
        ctx.map.addLayer(layer, before);
      }
      if (!ctx.map.getLayer(WPT_LAYER)) {
        const layer: CircleLayerSpecification = {
          id: WPT_LAYER,
          type: 'circle',
          source: WPT_SRC,
          paint: {
            'circle-radius': 4,
            'circle-color': paint.note,
            'circle-stroke-color': paint.markerGlyph,
            'circle-stroke-width': 1,
          },
        };
        ctx.map.addLayer(layer, before);
      }
      if (!ctx.map.getLayer(WPT_LABEL_LAYER)) {
        const layer: SymbolLayerSpecification = {
          id: WPT_LABEL_LAYER,
          type: 'symbol',
          source: WPT_SRC,
          layout: {
            'text-field': ['get', 'name'],
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
        ctx.map.addLayer(layer, before);
      }
    },
    sync(ctx) {
      if (store.version === lastVersion) return;
      lastVersion = store.version;
      (ctx.map.getSource(LINE_SRC) as GeoJSONSource | undefined)?.setData(
        routeLineFeatures(store.routes, store.shownIds, store.activeId),
      );
      (ctx.map.getSource(WPT_SRC) as GeoJSONSource | undefined)?.setData(
        waypointFeatures(store.routes, store.shownIds),
      );
    },
    setVisible(ctx, visible) {
      const value = visible ? 'visible' : 'none';
      for (const id of LAYERS) {
        ctx.map.setLayoutProperty(id, 'visibility', value);
      }
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity);
      ctx.map.setPaintProperty(WPT_LAYER, 'circle-opacity', opacity);
    },
    applyTheme(ctx, next) {
      paint = next;
      ctx.map.setPaintProperty(LINE_LAYER, 'line-color', lineColor(paint));
      ctx.map.setPaintProperty(WPT_LAYER, 'circle-color', paint.note);
      ctx.map.setPaintProperty(WPT_LAYER, 'circle-stroke-color', paint.markerGlyph);
      ctx.map.setPaintProperty(WPT_LABEL_LAYER, 'text-color', paint.label);
      ctx.map.setPaintProperty(WPT_LABEL_LAYER, 'text-halo-color', paint.background);
    },
    remove(ctx) {
      for (const id of LAYERS) {
        if (ctx.map.getLayer(id)) ctx.map.removeLayer(id);
      }
      for (const src of [LINE_SRC, WPT_SRC]) {
        if (ctx.map.getSource(src)) ctx.map.removeSource(src);
      }
    },
  };
}
