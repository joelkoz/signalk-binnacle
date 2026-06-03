import type { CanvasSourceSpecification, RasterLayerSpecification } from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import type { Theme } from '$shared/ui';
import { precipFieldRgba } from './precip-field';

const FIELD_SOURCE = 'binnacle-weather-precip-field';
const FIELD_LAYER = 'binnacle-weather-precip-field-layer';

type Quad = [[number, number], [number, number], [number, number], [number, number]];
type CanvasFactory = () => HTMLCanvasElement;

export interface PrecipOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function defaultCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

const PLACEHOLDER_COORDS: Quad = [
  [0, 0.0001],
  [0.0001, 0.0001],
  [0.0001, 0],
  [0, 0],
];

// The precipitation overlay: a rain-rate color field drawn to a canvas at grid resolution and
// smoothed by the GPU, in the weather band. Off by default. Redrawn only when the grid, the selected
// time, or the theme changes; the source is animated so MapLibre re-reads the canvas after a redraw.
export function createPrecipOverlay(
  store: WeatherStore,
  makeCanvas: CanvasFactory = defaultCanvas,
): PrecipOverlay {
  const canvas = makeCanvas();
  let theme: Theme = 'day';
  let lastGrid: unknown;
  let lastTime = Number.NaN;
  let lastTheme: Theme | undefined;

  function redraw(): void {
    const grid = store.grid;
    const field = grid ? precipFieldRgba(grid, store.bracket, theme) : undefined;
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
    id: 'weather-precip',
    title: 'Precipitation',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [FIELD_LAYER],
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
      if (!ctx.map.getLayer(FIELD_LAYER)) {
        const layer: RasterLayerSpecification = {
          id: FIELD_LAYER,
          type: 'raster',
          source: FIELD_SOURCE,
          paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
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
    },
    remove(ctx) {
      if (ctx.map.getLayer(FIELD_LAYER)) ctx.map.removeLayer(FIELD_LAYER);
      if (ctx.map.getSource(FIELD_SOURCE)) ctx.map.removeSource(FIELD_SOURCE);
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(FIELD_LAYER, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(FIELD_LAYER, 'raster-opacity', opacity);
    },
    applyTheme(_ctx, paint) {
      theme = paint.theme;
      lastTheme = undefined; // force a field redraw in the theme's colors on the next sync
    },
  };
}
