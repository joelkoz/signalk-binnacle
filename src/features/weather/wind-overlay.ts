import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
} from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import { emptyFeatureCollection } from './feature-collection';
import { windArrowFeatures } from './wind-arrows';
import { windColorExpression } from './wind-colormap';

const SOURCE_ID = 'binnacle-weather-wind';
const LAYER_ID = 'binnacle-weather-wind-line';

// The wind overlay extends the layer-manager contract with a per-frame sync, called from the map
// widget's animation loop like the other live overlays.
export interface WindOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// The wind layer: a line per grid cell pointing toward the wind, colored by speed, in the weather
// band. Off by default. This is the pipeline-first render; the animated particle layer replaces it
// later. It reads the forecast store and rebuilds only when the grid or the selected time changes.
export function createWindOverlay(store: WeatherStore): WindOverlay {
  let lastGrid: unknown;
  let lastTime = Number.NaN;

  function colorExpr(theme: Parameters<typeof windColorExpression>[0]): ExpressionSpecification {
    return windColorExpression(theme) as unknown as ExpressionSpecification;
  }

  return {
    id: 'weather-wind',
    title: 'Wind',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [LAYER_ID],
    add(ctx) {
      if (!ctx.map.getSource(SOURCE_ID)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        ctx.map.addSource(SOURCE_ID, source);
      }
      if (!ctx.map.getLayer(LAYER_ID)) {
        const layer: LineLayerSpecification = {
          id: LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': colorExpr('day'), 'line-width': 2, 'line-opacity': 1 },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
      }
    },
    sync(ctx) {
      const grid = store.grid;
      if (grid === lastGrid && store.selectedTime === lastTime) return;
      lastGrid = grid;
      lastTime = store.selectedTime;
      const source = ctx.map.getSource(SOURCE_ID) as { setData(d: unknown): void } | undefined;
      source?.setData(grid ? windArrowFeatures(grid, store.bracket) : emptyFeatureCollection());
    },
    remove(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LAYER_ID, 'line-opacity', opacity);
    },
    applyTheme(ctx, paint) {
      ctx.map.setPaintProperty(LAYER_ID, 'line-color', colorExpr(paint.theme));
    },
  };
}
