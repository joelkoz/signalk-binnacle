import type { RasterLayerSpecification, RasterSourceSpecification } from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import {
  applyRasterTheme,
  type MapThemePaint,
  type OverlayContext,
  type OverlayModule,
} from '$shared/map';
import { WEATHER_LAYER_IDS } from './fills';
import { frameTiles, TILE_SIZE } from './radar-frames';

const SOURCE_ID = 'binnacle-weather-radar';
const LAYER_ID = 'binnacle-weather-radar-layer';
const FRAME_MS = 600; // dwell on each past frame while looping
const PAUSE_MS = 1600; // hold on the latest frame before wrapping, so "now" reads clearly
const DEFAULT_OPACITY = 0.85; // one source for both the OverlayModule default and the initial paint

export interface RadarOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// RainViewer real-time precipitation radar as a themed raster overlay in the weather band. Off by
// default. It loops the past frames (oldest to newest, then a longer hold on the latest) so the rain
// is seen moving. The loop is driven from the per-frame tick rather than its own timer, so it stops
// when the chart unmounts; `now` is injectable for tests. Night-red desaturates and dims the raster
// (it cannot be recolored), the same treatment the depth-charts rasters use.
//
// The source and layer are created lazily, only once a real frame exists, and removed nowhere except
// in remove(). A raster source's tiles cannot be a usable placeholder: an empty array crashes the
// tile-URL builder, and a data-URL tile fails to decode. So instead of a placeholder, the layer
// simply does not exist until there is a real frame to point it at. The desired visibility, opacity,
// and theme are tracked and applied when the layer is created or changed.
export function createRadarOverlay(
  store: WeatherStore,
  now: () => number = () => performance.now(),
): RadarOverlay {
  let lastRadar: unknown;
  let frameIndex = 0;
  let lastAdvance = 0;
  let desiredVisible = false;
  let opacity = DEFAULT_OPACITY;
  let lastPaint: MapThemePaint | undefined;

  // Point the source at the current frame, creating the source and layer the first time a frame is
  // available. A no-op when there is no radar data yet, so the layer never exists empty.
  function applyFrame(ctx: OverlayContext): void {
    const radar = store.radar;
    const frames = radar?.frames ?? [];
    if (!radar || frames.length === 0) return;
    const path = frames[Math.min(frameIndex, frames.length - 1)].path;
    const url = frameTiles(radar.host, { time: 0, path });

    const source = ctx.map.getSource(SOURCE_ID) as { setTiles(t: string[]): void } | undefined;
    if (source) {
      source.setTiles([url]);
    } else {
      const spec: RasterSourceSpecification = {
        type: 'raster',
        tiles: [url],
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
        layout: { visibility: desiredVisible ? 'visible' : 'none' },
        paint: { 'raster-opacity': opacity },
      };
      ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
      if (lastPaint) recolor(ctx, lastPaint);
    }
  }

  function recolor(ctx: OverlayContext, paint: MapThemePaint): void {
    applyRasterTheme(ctx.map, LAYER_ID, paint);
  }

  return {
    id: WEATHER_LAYER_IDS.radar,
    title: 'Rain radar',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    defaultOpacity: DEFAULT_OPACITY,
    layerIds: [LAYER_ID],
    add() {
      // Nothing is created until a frame lands. Reset the dirty-check so the next sync re-points the
      // source (after a base-style swap recreated nothing) instead of assuming it is current.
      lastRadar = undefined;
    },
    sync(ctx) {
      const radar = store.radar;
      const frames = radar?.frames ?? [];
      // On new radar data, jump to the latest frame and point the source at it (creating it).
      if (radar !== lastRadar) {
        lastRadar = radar;
        frameIndex = Math.max(0, frames.length - 1);
        if (radar && frames.length > 0) applyFrame(ctx);
        lastAdvance = now();
        return;
      }
      if (!desiredVisible || !ctx.map.getLayer(LAYER_ID) || !radar || frames.length < 2) return;
      // Advance one frame per FRAME_MS, holding PAUSE_MS on the latest before wrapping to the oldest.
      const interval = frameIndex === frames.length - 1 ? PAUSE_MS : FRAME_MS;
      const t = now();
      if (t - lastAdvance < interval) return;
      lastAdvance = t;
      frameIndex = (frameIndex + 1) % frames.length;
      applyFrame(ctx);
    },
    remove(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
    setVisible(ctx, isVisible) {
      desiredVisible = isVisible;
      if (ctx.map.getLayer(LAYER_ID)) {
        ctx.map.setLayoutProperty(LAYER_ID, 'visibility', isVisible ? 'visible' : 'none');
      } else if (isVisible) {
        // Toggled on while a frame is already loaded: create and show it now.
        applyFrame(ctx);
      }
    },
    setOpacity(ctx, value) {
      opacity = value;
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.setPaintProperty(LAYER_ID, 'raster-opacity', value);
    },
    applyTheme(ctx, paint) {
      lastPaint = paint;
      if (ctx.map.getLayer(LAYER_ID)) recolor(ctx, paint);
    },
  };
}
