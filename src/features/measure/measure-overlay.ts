import type {
  CircleLayerSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { MeasureStore } from '$entities/measure';
import type { LatLon } from '$shared/geo';
import { formatMetersOrNm } from '$shared/lib';
import {
  emptyFeatureCollection,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
  removeLayersAndSources,
  setLayersVisibility,
} from '$shared/map';

const SRC = 'binnacle-measure';
const LINE_LAYER = 'binnacle-measure-line';
const VERTEX_LAYER = 'binnacle-measure-vertex';
const LABEL_LAYER = 'binnacle-measure-label';
const LAYERS = [LINE_LAYER, VERTEX_LAYER, LABEL_LAYER];

function features(measure: MeasureStore): GeoJSON.FeatureCollection {
  const points = measure.points;
  if (points.length === 0) return emptyFeatureCollection();
  const coordinates = points.map<[number, number]>((point) => [point.longitude, point.latitude]);
  const out: GeoJSON.Feature[] = coordinates.map((position, index) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: position },
    properties:
      // The running total rides on the last vertex, so the chart answers "how far" at the
      // cursor without a glance down at the strip.
      index === coordinates.length - 1 && coordinates.length > 1
        ? { label: formatMetersOrNm(measure.totalMeters) }
        : {},
  }));
  if (coordinates.length > 1) {
    out.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { line: true },
    });
  }
  return { type: 'FeatureCollection', features: out };
}

export interface MeasureOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// The on-chart measurement: tapped vertices, the dashed line through them, and the running total
// labeled at the last point. Renders nothing while no measurement is in progress.
export function createMeasureOverlay(measure: MeasureStore): MeasureOverlay {
  let paint = mapThemePaint('day');
  let lastPoints: readonly LatLon[] | undefined;

  return {
    id: 'measure',
    title: 'Measure',
    band: 'routes',
    supportsOpacity: true,
    layerIds: LAYERS,
    add(ctx) {
      const { map } = ctx;
      const before = ctx.beforeIdFor('routes');
      if (!map.getSource(SRC)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        map.addSource(SRC, source);
      }
      if (!map.getLayer(LINE_LAYER)) {
        const layer: LineLayerSpecification = {
          id: LINE_LAYER,
          type: 'line',
          source: SRC,
          filter: ['has', 'line'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': paint.select,
            'line-width': 2,
            'line-dasharray': [2, 2],
          },
        };
        map.addLayer(layer, before);
      }
      if (!map.getLayer(VERTEX_LAYER)) {
        const layer: CircleLayerSpecification = {
          id: VERTEX_LAYER,
          type: 'circle',
          source: SRC,
          filter: ['!', ['has', 'line']],
          paint: {
            'circle-radius': 5,
            'circle-color': paint.select,
            'circle-stroke-color': paint.markerGlyph,
            'circle-stroke-width': 1.5,
          },
        };
        map.addLayer(layer, before);
      }
      if (!map.getLayer(LABEL_LAYER)) {
        const layer: SymbolLayerSpecification = {
          id: LABEL_LAYER,
          type: 'symbol',
          source: SRC,
          filter: ['has', 'label'],
          layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 12,
            'text-offset': [0, 1.3],
            'text-optional': true,
          },
          paint: {
            'text-color': paint.select,
            'text-halo-color': paint.background,
            'text-halo-width': 1.5,
          },
        };
        map.addLayer(layer, before);
      }
      // Force a redraw so a reattach after a base-style swap repopulates the emptied source.
      lastPoints = undefined;
    },
    sync(ctx) {
      const points = measure.points;
      if (points === lastPoints) return;
      lastPoints = points;
      (ctx.map.getSource(SRC) as GeoJSONSource | undefined)?.setData(features(measure));
    },
    setVisible(ctx, visible) {
      setLayersVisibility(ctx.map, LAYERS, visible);
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity);
      ctx.map.setPaintProperty(VERTEX_LAYER, 'circle-opacity', opacity);
      ctx.map.setPaintProperty(VERTEX_LAYER, 'circle-stroke-opacity', opacity);
      // text-opacity fades the halo with the glyphs, so the label needs no halo-specific handling.
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-opacity', opacity);
    },
    applyTheme(ctx, next) {
      paint = next;
      ctx.map.setPaintProperty(LINE_LAYER, 'line-color', paint.select);
      ctx.map.setPaintProperty(VERTEX_LAYER, 'circle-color', paint.select);
      ctx.map.setPaintProperty(VERTEX_LAYER, 'circle-stroke-color', paint.markerGlyph);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-color', paint.select);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-halo-color', paint.background);
    },
    remove(ctx) {
      removeLayersAndSources(ctx.map, LAYERS, [SRC]);
    },
  };
}
