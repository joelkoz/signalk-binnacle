import type { RasterLayerSpecification, RasterSourceSpecification } from 'maplibre-gl';
import { applyRasterTheme, type OverlayModule } from '$shared/map';
import type { StreamingChartSource } from './streaming-sources';

// The prefix on every streaming source and layer id. The base-theme recolor skips ids under this
// prefix (it carries the same literal, since shared cannot import this feature), so the id scheme
// lives in one place here.
const STREAMING_PREFIX = 'streaming-';
const streamingSourceId = (id: string): string => `${STREAMING_PREFIX}${id}`;
const streamingLayerId = (id: string): string => `${STREAMING_PREFIX}${id}-layer`;

// Wrap a free hosted bathymetry service as a raster overlay in the bathymetry band. It starts
// hidden, streams and caches as the user pans, and follows the theme: day and dusk show it as
// served, night-red desaturates and dims it because a raster cannot be recolored to true
// night-red.
export function createStreamingChartOverlay(source: StreamingChartSource): OverlayModule {
  const sourceId = streamingSourceId(source.id);
  const layerId = streamingLayerId(source.id);

  return {
    id: source.id,
    title: source.title,
    band: 'bathymetry',
    parent: source.parent,
    group: source.group,
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
        // No initial raster-opacity: the layer manager sets it via setOpacity right after add,
        // and MapLibre defaults raster-opacity to 1 anyway, so an inline value would be redundant.
        const layer: RasterLayerSpecification = {
          id: layerId,
          type: 'raster',
          source: sourceId,
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
      applyRasterTheme(ctx.map, layerId, paint);
    },
  };
}
