import { chartToSpecs } from './chart-adapter';
import type { SignalKChart } from './chart-types';
import type { OverlayModule } from './types';

export function createChartOverlay(chart: SignalKChart, serverBase: string): OverlayModule {
  const specs = chartToSpecs(chart, serverBase);
  const sourceIds = Object.keys(specs.sources);
  const layerIds = specs.layers.map((layer) => layer.id);

  return {
    id: `chart-${chart.identifier}`,
    title: chart.name,
    band: 'basemap',
    supportsOpacity: true,
    add(ctx) {
      for (const sourceId of sourceIds) {
        if (!ctx.map.getSource(sourceId)) {
          ctx.map.addSource(sourceId, specs.sources[sourceId]);
        }
      }
      for (const layer of specs.layers) {
        if (!ctx.map.getLayer(layer.id)) {
          ctx.map.addLayer(layer as never, ctx.beforeIdFor('basemap'));
        }
      }
    },
    remove(ctx) {
      for (const layerId of layerIds) {
        if (ctx.map.getLayer(layerId)) ctx.map.removeLayer(layerId);
      }
      for (const sourceId of sourceIds) {
        if (ctx.map.getSource(sourceId)) ctx.map.removeSource(sourceId);
      }
    },
    setVisible(ctx, visible) {
      for (const layerId of layerIds) {
        ctx.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    },
    setOpacity(ctx, opacity) {
      for (const layerId of layerIds) {
        ctx.map.setPaintProperty(layerId, specs.opacityProperty, opacity);
      }
    },
  };
}
