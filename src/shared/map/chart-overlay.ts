import { chartSourceId, chartToSpecs } from './chart-adapter';
import type { SignalKChart } from './chart-types';
import { registerPmtilesArchive } from './pmtiles';
import type { OverlayModule } from './types';

const PMTILES_SCHEME = 'pmtiles://';

const OPACITY_PROPERTY = {
  fill: 'fill-opacity',
  line: 'line-opacity',
  raster: 'raster-opacity',
} as const;

function opacityProperty(layerType: string): string {
  return OPACITY_PROPERTY[layerType as keyof typeof OPACITY_PROPERTY] ?? 'raster-opacity';
}

export function createChartOverlay(chart: SignalKChart, serverBase: string): OverlayModule {
  const specs = chartToSpecs(chart, serverBase);
  const sourceIds = Object.keys(specs.sources);
  const layers = specs.layers.map((layer) => ({ id: layer.id, type: layer.type }));

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
      for (const layer of layers) {
        if (ctx.map.getLayer(layer.id)) ctx.map.removeLayer(layer.id);
      }
      for (const sourceId of sourceIds) {
        if (ctx.map.getSource(sourceId)) ctx.map.removeSource(sourceId);
      }
    },
    setVisible(ctx, visible) {
      for (const layer of layers) {
        ctx.map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
      }
    },
    setOpacity(ctx, opacity) {
      for (const layer of layers) {
        ctx.map.setPaintProperty(layer.id, opacityProperty(layer.type), opacity);
      }
    },
  };
}
