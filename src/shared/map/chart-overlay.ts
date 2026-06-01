import { chartSourceId, chartToSpecs } from './chart-adapter';
import type { SignalKChart } from './chart-types';
import { registerPmtilesArchive } from './pmtiles';
import type { OverlayModule } from './types';

const PMTILES_SCHEME = 'pmtiles://';

export function createChartOverlay(chart: SignalKChart, serverBase: string): OverlayModule {
  const specs = chartToSpecs(chart, serverBase);
  const sourceIds = Object.keys(specs.sources);
  const layerIds = specs.layers.map((layer) => layer.id);

  return {
    id: chartSourceId(chart.identifier),
    title: chart.name,
    band: 'basemap',
    supportsOpacity: true,
    add(ctx) {
      for (const sourceId of sourceIds) {
        const spec = specs.sources[sourceId];
        // A PMTiles archive registers a no-store source first so MapLibre resolves the
        // pmtiles:// url to it rather than the default cache-writing fetch source.
        if ('url' in spec && typeof spec.url === 'string' && spec.url.startsWith(PMTILES_SCHEME)) {
          registerPmtilesArchive(spec.url.slice(PMTILES_SCHEME.length));
        }
        if (!ctx.map.getSource(sourceId)) {
          ctx.map.addSource(sourceId, spec);
        }
      }
      for (const layer of specs.layers) {
        if (!ctx.map.getLayer(layer.id)) {
          ctx.map.addLayer(layer, ctx.beforeIdFor('basemap'));
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
