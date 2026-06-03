import type { CanvasSourceSpecification, RasterLayerSpecification } from 'maplibre-gl';
import type { TimeBracket, WeatherGrid, WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import type { Theme } from '$shared/ui';
import type { FieldBitmap } from './field-rgba';

export type Quad = [[number, number], [number, number], [number, number], [number, number]];
export type CanvasFactory = () => HTMLCanvasElement;

export interface FieldOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

export interface FieldOverlayOptions {
  id: string;
  title: string;
  sourceId: string;
  layerId: string;
  fieldRgba: (grid: WeatherGrid, bracket: TimeBracket, theme: Theme) => FieldBitmap | undefined;
}

export function defaultCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

// A degenerate default extent; replaced with the grid bbox on the first sync that has data.
const PLACEHOLDER_COORDS: Quad = [
  [0, 0.0001],
  [0.0001, 0.0001],
  [0.0001, 0],
  [0, 0],
];

// A weather scalar field rendered as a MapLibre canvas source drawn at grid resolution and smoothed
// by the GPU (raster-resampling linear), in the weather band. Off by default. The canvas is redrawn
// only when the grid, the selected time, or the theme changes. The source is animated so MapLibre
// re-reads the canvas after each redraw; the per-frame re-upload of a grid-resolution texture (a few
// KB) is negligible next to the vector-tile redraw, and it avoids the version-dependent canvas
// re-read behavior of a static source. Shared by the waves and precipitation overlays; waves
// composes this and adds its own arrow layer on top.
export function createFieldOverlay(
  store: WeatherStore,
  options: FieldOverlayOptions,
  makeCanvas: CanvasFactory = defaultCanvas,
): FieldOverlay {
  const { id, title, sourceId, layerId, fieldRgba } = options;
  const canvas = makeCanvas();
  let theme: Theme = 'day';
  let lastGrid: unknown;
  let lastTime = Number.NaN;
  let lastTheme: Theme | undefined;

  function redraw(): void {
    const grid = store.grid;
    const field = grid ? fieldRgba(grid, store.bracket, theme) : undefined;
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
    id,
    title,
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [layerId],
    add(ctx) {
      if (!ctx.map.getSource(sourceId)) {
        const source: CanvasSourceSpecification = {
          type: 'canvas',
          canvas,
          coordinates: PLACEHOLDER_COORDS,
          animate: true,
        };
        ctx.map.addSource(sourceId, source);
      }
      if (!ctx.map.getLayer(layerId)) {
        const layer: RasterLayerSpecification = {
          id: layerId,
          type: 'raster',
          source: sourceId,
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
      const source = ctx.map.getSource(sourceId) as { setCoordinates(c: Quad): void } | undefined;
      if (coords) source?.setCoordinates(coords);
    },
    remove(ctx) {
      if (ctx.map.getLayer(layerId)) ctx.map.removeLayer(layerId);
      if (ctx.map.getSource(sourceId)) ctx.map.removeSource(sourceId);
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(layerId, 'raster-opacity', opacity);
    },
    applyTheme(_ctx, paint) {
      theme = paint.theme;
      lastTheme = undefined; // force a field redraw in the theme's colors on the next sync
    },
  };
}
