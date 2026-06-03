import type { RasterLayerSpecification, RasterSourceSpecification } from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import { frameTiles, TILE_SIZE } from './radar-frames';

const SOURCE_ID = 'binnacle-weather-radar';
const LAYER_ID = 'binnacle-weather-radar-layer';
const FRAME_MS = 600; // dwell on each past frame while looping
const PAUSE_MS = 1600; // hold on the latest frame before wrapping, so "now" reads clearly

export interface RadarOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// RainViewer real-time precipitation radar as a themed raster overlay in the weather band. Off by
// default. It loops the past frames (oldest to newest, then a longer hold on the latest) so the rain
// is seen moving. The loop is driven from the per-frame tick rather than its own timer, so it stops
// when the chart unmounts; `now` is injectable for tests. Night-red desaturates and dims the raster
// (it cannot be recolored), the same treatment the depth-charts rasters use.
export function createRadarOverlay(
  store: WeatherStore,
  now: () => number = () => performance.now(),
): RadarOverlay {
  let lastRadar: unknown;
  let frameIndex = 0;
  let lastAdvance = 0;
  let visible = false;

  function showFrame(ctx: OverlayContext, host: string, path: string): void {
    const source = ctx.map.getSource(SOURCE_ID) as { setTiles(t: string[]): void } | undefined;
    source?.setTiles([frameTiles(host, { time: 0, path })]);
  }

  return {
    id: 'weather-radar',
    title: 'Rain radar',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    defaultOpacity: 0.85,
    layerIds: [LAYER_ID],
    add(ctx) {
      // Reset the dirty-check so a reattach (after a base-style swap recreates the source with empty
      // tiles) re-points it at the latest frame on the next sync instead of staying blank.
      lastRadar = undefined;
      if (!ctx.map.getSource(SOURCE_ID)) {
        const spec: RasterSourceSpecification = {
          type: 'raster',
          tiles: [],
          tileSize: TILE_SIZE,
          // RainViewer serves real radar tiles only to zoom 7 (confirmed across regions); from zoom 8
          // up every tile is a "Zoom Level Not Supported" placeholder. Cap the source at 7 so MapLibre
          // overzooms the real tiles instead of fetching placeholders.
          maxzoom: 7,
          attribution: 'RainViewer',
        };
        ctx.map.addSource(SOURCE_ID, spec);
      }
      if (!ctx.map.getLayer(LAYER_ID)) {
        const layer: RasterLayerSpecification = {
          id: LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: { 'raster-opacity': 0.85 },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
      }
    },
    sync(ctx) {
      const radar = store.radar;
      const frames = radar?.frames ?? [];
      // On new radar data, jump to the latest frame and re-point the source immediately.
      if (radar !== lastRadar) {
        lastRadar = radar;
        frameIndex = Math.max(0, frames.length - 1);
        if (radar && frames.length > 0) showFrame(ctx, radar.host, frames[frameIndex].path);
        lastAdvance = now();
        return;
      }
      if (!visible || !radar || frames.length < 2) return;
      // Advance one frame per FRAME_MS, holding PAUSE_MS on the latest before wrapping to the oldest.
      const interval = frameIndex === frames.length - 1 ? PAUSE_MS : FRAME_MS;
      const t = now();
      if (t - lastAdvance < interval) return;
      lastAdvance = t;
      frameIndex = (frameIndex + 1) % frames.length;
      showFrame(ctx, radar.host, frames[frameIndex].path);
    },
    remove(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
    setVisible(ctx, isVisible) {
      visible = isVisible;
      ctx.map.setLayoutProperty(LAYER_ID, 'visibility', isVisible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
    },
    applyTheme(ctx, paint) {
      ctx.map.setPaintProperty(LAYER_ID, 'raster-saturation', paint.rasterSaturation);
      ctx.map.setPaintProperty(LAYER_ID, 'raster-brightness-max', paint.rasterBrightnessMax);
    },
  };
}
