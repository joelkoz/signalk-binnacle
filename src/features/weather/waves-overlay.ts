import type { GeoJSONSourceSpecification, LineLayerSpecification } from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import { emptyFeatureCollection } from './feature-collection';
import { type CanvasFactory, createFieldOverlay, type FieldOverlay } from './field-overlay';
import { waveArrowFeatures } from './wave-arrows';
import { waveArrowColor } from './wave-colormap';
import { waveFieldRgba } from './wave-field';

const FIELD_SOURCE = 'binnacle-weather-waves-field';
const FIELD_LAYER = 'binnacle-weather-waves-field-layer';
const ARROW_SOURCE = 'binnacle-weather-waves-arrows';
const ARROW_LAYER = 'binnacle-weather-waves-arrow-layer';

export type WavesOverlay = FieldOverlay;

// The waves overlay: the shared canvas height field plus a sparse direction-arrow line layer. It
// composes createFieldOverlay for the smooth height field and manages the arrow source and layer
// itself, rebuilding the arrows only when the grid or the selected time changes.
export function createWavesOverlay(store: WeatherStore, makeCanvas?: CanvasFactory): WavesOverlay {
  const field = createFieldOverlay(
    store,
    {
      id: 'weather-waves',
      title: 'Waves',
      sourceId: FIELD_SOURCE,
      layerId: FIELD_LAYER,
      fieldRgba: waveFieldRgba,
    },
    makeCanvas,
  );
  let lastGrid: unknown;
  let lastTime = Number.NaN;

  return {
    id: field.id,
    title: field.title,
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [FIELD_LAYER, ARROW_LAYER],
    add(ctx) {
      field.add(ctx);
      if (!ctx.map.getSource(ARROW_SOURCE)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        ctx.map.addSource(ARROW_SOURCE, source);
      }
      if (!ctx.map.getLayer(ARROW_LAYER)) {
        const layer: LineLayerSpecification = {
          id: ARROW_LAYER,
          type: 'line',
          source: ARROW_SOURCE,
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': waveArrowColor('day'), 'line-width': 1.5, 'line-opacity': 1 },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
      }
    },
    sync(ctx) {
      field.sync(ctx);
      const grid = store.grid;
      if (grid === lastGrid && store.selectedTime === lastTime) return;
      lastGrid = grid;
      lastTime = store.selectedTime;
      const source = ctx.map.getSource(ARROW_SOURCE) as { setData(d: unknown): void } | undefined;
      source?.setData(grid ? waveArrowFeatures(grid, store.bracket) : emptyFeatureCollection());
    },
    remove(ctx) {
      if (ctx.map.getLayer(ARROW_LAYER)) ctx.map.removeLayer(ARROW_LAYER);
      if (ctx.map.getSource(ARROW_SOURCE)) ctx.map.removeSource(ARROW_SOURCE);
      field.remove(ctx);
    },
    setVisible(ctx, visible) {
      field.setVisible(ctx, visible);
      ctx.map.setLayoutProperty(ARROW_LAYER, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      field.setOpacity?.(ctx, opacity);
      ctx.map.setPaintProperty(ARROW_LAYER, 'line-opacity', opacity);
    },
    applyTheme(ctx, paint) {
      field.applyTheme?.(ctx, paint);
      ctx.map.setPaintProperty(ARROW_LAYER, 'line-color', waveArrowColor(paint.theme));
    },
  };
}
