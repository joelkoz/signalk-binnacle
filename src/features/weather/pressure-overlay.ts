import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import { emptyFeatureCollection } from './feature-collection';
import { WEATHER_LAYER_IDS } from './fills';
import { isobarColors } from './pressure-colors';
import { isobarFeatures } from './pressure-isobars';

const LINE_SOURCE = 'binnacle-weather-pressure';
const LABEL_SOURCE = 'binnacle-weather-pressure-labels';
const LINE_LAYER = 'binnacle-weather-pressure-line';
const LABEL_LAYER = 'binnacle-weather-pressure-label';

export interface PressureOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// Mean-sea-level pressure isobars in the weather band: a line layer of marching-squares contours
// and a sparse label layer of hPa values. Off by default. Rebuilds only when the grid or the
// selected time changes, like the wind overlay.
export function createPressureOverlay(store: WeatherStore): PressureOverlay {
  let lastGrid: unknown;
  let lastTime = Number.NaN;

  return {
    id: WEATHER_LAYER_IDS.pressure,
    title: 'Pressure',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [LINE_LAYER, LABEL_LAYER],
    add(ctx) {
      const colors = isobarColors('day');
      if (!ctx.map.getSource(LINE_SOURCE)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        ctx.map.addSource(LINE_SOURCE, source);
      }
      if (!ctx.map.getSource(LABEL_SOURCE)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        ctx.map.addSource(LABEL_SOURCE, source);
      }
      if (!ctx.map.getLayer(LINE_LAYER)) {
        const layer: LineLayerSpecification = {
          id: LINE_LAYER,
          type: 'line',
          source: LINE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': colors.line, 'line-width': 1.2, 'line-opacity': 1 },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
      }
      if (!ctx.map.getLayer(LABEL_LAYER)) {
        const layer: SymbolLayerSpecification = {
          id: LABEL_LAYER,
          type: 'symbol',
          source: LABEL_SOURCE,
          layout: {
            'text-field': ['to-string', ['get', 'pressureHpa']] as ExpressionSpecification,
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
            'symbol-placement': 'point',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': colors.label,
            'text-halo-color': colors.halo,
            'text-halo-width': 1.4,
            'text-opacity': 1,
          },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
      }
    },
    sync(ctx) {
      const grid = store.grid;
      if (grid === lastGrid && store.selectedTime === lastTime) return;
      lastGrid = grid;
      lastTime = store.selectedTime;
      const lineSource = ctx.map.getSource(LINE_SOURCE) as
        | { setData(d: unknown): void }
        | undefined;
      const labelSource = ctx.map.getSource(LABEL_SOURCE) as
        | { setData(d: unknown): void }
        | undefined;
      if (!grid) {
        lineSource?.setData(emptyFeatureCollection());
        labelSource?.setData(emptyFeatureCollection());
        return;
      }
      const { lines, labels } = isobarFeatures(grid, store.bracket);
      lineSource?.setData(lines);
      labelSource?.setData(labels);
    },
    remove(ctx) {
      if (ctx.map.getLayer(LABEL_LAYER)) ctx.map.removeLayer(LABEL_LAYER);
      if (ctx.map.getLayer(LINE_LAYER)) ctx.map.removeLayer(LINE_LAYER);
      if (ctx.map.getSource(LABEL_SOURCE)) ctx.map.removeSource(LABEL_SOURCE);
      if (ctx.map.getSource(LINE_SOURCE)) ctx.map.removeSource(LINE_SOURCE);
    },
    setVisible(ctx, visible) {
      const v = visible ? 'visible' : 'none';
      ctx.map.setLayoutProperty(LINE_LAYER, 'visibility', v);
      ctx.map.setLayoutProperty(LABEL_LAYER, 'visibility', v);
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-opacity', opacity);
    },
    applyTheme(ctx, paint) {
      const colors = isobarColors(paint.theme);
      ctx.map.setPaintProperty(LINE_LAYER, 'line-color', colors.line);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-color', colors.label);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-halo-color', colors.halo);
    },
  };
}
