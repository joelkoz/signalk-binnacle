import type { RasterLayerSpecification, RasterSourceSpecification } from 'maplibre-gl';
import type { WeatherStore } from '$entities/weather';
import type { OverlayContext, OverlayModule } from '$shared/map';
import { frameTiles, latestFrame } from './radar-frames';

const SOURCE_ID = 'binnacle-weather-radar';
const LAYER_ID = 'binnacle-weather-radar-layer';

export interface RadarOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// RainViewer real-time precipitation radar as a themed raster overlay in the weather band. Off by
// default. Shows the latest frame; it re-points the source at the newest frame whenever the store's
// radar data changes. Night-red desaturates and dims the raster (it cannot be recolored), the same
// treatment the depth-charts rasters use.
export function createRadarOverlay(store: WeatherStore): RadarOverlay {
  let lastRadar: unknown;

  return {
    id: 'weather-radar',
    title: 'Rain radar',
    band: 'weather',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [LAYER_ID],
    add(ctx) {
      if (!ctx.map.getSource(SOURCE_ID)) {
        const spec: RasterSourceSpecification = {
          type: 'raster',
          tiles: [],
          tileSize: 256,
          attribution: 'RainViewer',
        };
        ctx.map.addSource(SOURCE_ID, spec);
      }
      if (!ctx.map.getLayer(LAYER_ID)) {
        const layer: RasterLayerSpecification = {
          id: LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: { 'raster-opacity': 0.8 },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('weather'));
      }
    },
    sync(ctx) {
      if (store.radar === lastRadar) return;
      lastRadar = store.radar;
      const radar = store.radar;
      const frame = radar ? latestFrame(radar.frames) : undefined;
      if (!radar || !frame) return;
      const source = ctx.map.getSource(SOURCE_ID) as { setTiles(t: string[]): void } | undefined;
      source?.setTiles([frameTiles(radar.host, frame)]);
    },
    remove(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
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
