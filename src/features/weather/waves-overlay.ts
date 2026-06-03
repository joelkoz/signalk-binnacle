import type {
  CanvasSourceSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
  RasterLayerSpecification,
} from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import type { Theme } from '$shared/ui';
import { waveArrowFeatures } from './wave-arrows';
import { waveArrowColor } from './wave-colormap';
import { waveFieldRgba } from './wave-field';

const FIELD_SOURCE = 'binnacle-weather-waves-field';
const ARROW_SOURCE = 'binnacle-weather-waves-arrows';
const FIELD_LAYER = 'binnacle-weather-waves-field-layer';
const ARROW_LAYER = 'binnacle-weather-waves-arrow-layer';

type Quad = [[number, number], [number, number], [number, number], [number, number]];
type CanvasFactory = () => HTMLCanvasElement;

export interface WavesOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function defaultCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

// A degenerate default extent; replaced with the grid bbox on the first sync that has data.
const PLACEHOLDER_COORDS: Quad = [
  [0, 0.0001],
  [0.0001, 0.0001],
  [0.0001, 0],
  [0, 0],
];

// The waves overlay: a wave-height color field drawn to a canvas at grid resolution and smoothed by
// the GPU (raster-resampling linear), plus a sparse direction-arrow line layer, both in the weather
// band. Off by default. The canvas is redrawn only when the grid, the selected time, or the theme
// changes; MapLibre re-reads the small canvas each frame (animate true), which is cheap.
export function createWavesOverlay(
  store: WeatherStore,
  makeCanvas: CanvasFactory = defaultCanvas,
): WavesOverlay {
  const canvas = makeCanvas();
  let theme: Theme = 'day';
  let lastGrid: unknown;
  let lastTime = Number.NaN;
  let lastTheme: Theme | undefined;

  function redraw(): void {
    const grid = store.grid;
    const field = grid ? waveFieldRgba(grid, store.bracket, theme) : undefined;
    const context = canvas.getContext('2d');
    if (!field || !context) return;
    canvas.width = field.width;
    canvas.height = field.height;
    const image = context.createImageData(field.width, field.height);
    image.data.set(field.data);
    context.putImageData(image, 0, 0);
  }

  function fieldCoords(): Quad | undefined {
    const grid = store.grid;
    if (!grid || grid.lons.length === 0 || grid.lats.length === 0) return undefined;
    const w = grid.lons[0];
    const e = grid.lons[grid.lons.length - 1];
    const s = grid.lats[0];
    const n = grid.lats[grid.lats.length - 1];
    return [
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ];
  }

  return {
    id: 'weather-waves',
    title: 'Waves',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [FIELD_LAYER, ARROW_LAYER],
    add(ctx) {
      if (!ctx.map.getSource(FIELD_SOURCE)) {
        const source: CanvasSourceSpecification = {
          type: 'canvas',
          canvas,
          coordinates: PLACEHOLDER_COORDS,
          animate: true,
        };
        ctx.map.addSource(FIELD_SOURCE, source);
      }
      if (!ctx.map.getSource(ARROW_SOURCE)) {
        const source: GeoJSONSourceSpecification = { type: 'geojson', data: emptyCollection() };
        ctx.map.addSource(ARROW_SOURCE, source);
      }
      if (!ctx.map.getLayer(FIELD_LAYER)) {
        const layer: RasterLayerSpecification = {
          id: FIELD_LAYER,
          type: 'raster',
          source: FIELD_SOURCE,
          paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
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
      const grid = store.grid;
      if (grid === lastGrid && store.selectedTime === lastTime && theme === lastTheme) return;
      lastGrid = grid;
      lastTime = store.selectedTime;
      lastTheme = theme;
      redraw();
      const coords = fieldCoords();
      const fieldSource = ctx.map.getSource(FIELD_SOURCE) as
        | { setCoordinates?(c: Quad): void }
        | undefined;
      if (coords) fieldSource?.setCoordinates?.(coords);
      const arrowSource = ctx.map.getSource(ARROW_SOURCE) as
        | { setData(d: unknown): void }
        | undefined;
      arrowSource?.setData(grid ? waveArrowFeatures(grid, store.bracket) : emptyCollection());
    },
    remove(ctx) {
      if (ctx.map.getLayer(ARROW_LAYER)) ctx.map.removeLayer(ARROW_LAYER);
      if (ctx.map.getLayer(FIELD_LAYER)) ctx.map.removeLayer(FIELD_LAYER);
      if (ctx.map.getSource(ARROW_SOURCE)) ctx.map.removeSource(ARROW_SOURCE);
      if (ctx.map.getSource(FIELD_SOURCE)) ctx.map.removeSource(FIELD_SOURCE);
    },
    setVisible(ctx, visible) {
      const v = visible ? 'visible' : 'none';
      ctx.map.setLayoutProperty(FIELD_LAYER, 'visibility', v);
      ctx.map.setLayoutProperty(ARROW_LAYER, 'visibility', v);
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(FIELD_LAYER, 'raster-opacity', opacity);
      ctx.map.setPaintProperty(ARROW_LAYER, 'line-opacity', opacity);
    },
    applyTheme(ctx, paint) {
      theme = paint.theme;
      lastTheme = undefined; // force a field redraw in the theme's colors on the next sync
      ctx.map.setPaintProperty(ARROW_LAYER, 'line-color', waveArrowColor(paint.theme));
    },
  };
}
