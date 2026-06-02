import type { RasterLayerSpecification, RasterSourceSpecification } from 'maplibre-gl';
import type { OverlayModule } from '$shared/map';
import type { StreamingChartSource } from './streaming-sources';

// Wrap a free hosted bathymetry service as a raster overlay in the bathymetry band. It starts
// hidden, streams and caches as the user pans, and follows the theme: day and dusk show it as
// served, night-red desaturates and dims it because a raster cannot be recolored to true
// night-red.
export function createStreamingChartOverlay(source: StreamingChartSource): OverlayModule {
  const sourceId = `streaming-${source.id}`;
  const layerId = `streaming-${source.id}-layer`;

  return {
    id: source.id,
    title: source.title,
    band: 'bathymetry',
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [layerId],
    add(ctx) {
      if (!ctx.map.getSource(sourceId)) {
        const spec: RasterSourceSpecification = {
          type: 'raster',
          tiles: [...source.tiles],
          tileSize: source.tileSize ?? 256,
          attribution: source.attribution,
        };
        if (source.minzoom !== undefined) spec.minzoom = source.minzoom;
        if (source.maxzoom !== undefined) spec.maxzoom = source.maxzoom;
        if (source.bounds) spec.bounds = source.bounds;
        ctx.map.addSource(sourceId, spec);
      }
      if (!ctx.map.getLayer(layerId)) {
        const layer: RasterLayerSpecification = {
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': 1 },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor('bathymetry'));
      }
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
    applyTheme(ctx, paint) {
      ctx.map.setPaintProperty(layerId, 'raster-saturation', paint.rasterSaturation);
      ctx.map.setPaintProperty(layerId, 'raster-brightness-max', paint.rasterBrightnessMax);
    },
  };
}
