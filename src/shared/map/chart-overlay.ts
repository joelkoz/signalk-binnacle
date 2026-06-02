import type { Map as MapLibreMap, MapSourceDataEvent } from 'maplibre-gl';
import { chartSourceId, chartToSpecs, THEME_PAINT_KEY } from './chart-adapter';
import type { SignalKChart } from './chart-types';
import type { MapColorKey } from './map-theme';
import { registerPmtilesArchive } from './pmtiles';
import type { OverlayModule, ZBand } from './types';

const PMTILES_SCHEME = 'pmtiles://';

// How far past a chart's native max zoom its layers keep drawing before they hand off
// to the base map. Zooming past a chart's scale overzooms the top tiles into a blocky,
// low-detail chart, which is worse than the sharp base underneath. Capping the chart a
// step beyond its native max lets the base map show through when you zoom in past the
// chart's detail, so the chart stays useful and aligned with the base at every zoom.
const CHART_OVERZOOM_BUDGET = 1;

const OPACITY_PROPERTY = {
  fill: 'fill-opacity',
  line: 'line-opacity',
  raster: 'raster-opacity',
} as const;

function opacityProperty(layerType: string): string {
  return OPACITY_PROPERTY[layerType as keyof typeof OPACITY_PROPERTY] ?? 'raster-opacity';
}

// Server charts default to the basemap band; a user-imported chart passes 'bathymetry' so it
// layers above the base map.
export function createChartOverlay(
  chart: SignalKChart,
  serverBase: string,
  band: ZBand = 'basemap',
): OverlayModule {
  const specs = chartToSpecs(chart, serverBase);
  const sourceIds = Object.keys(specs.sources);
  const layers = specs.layers.map((layer) => ({
    id: layer.id,
    type: layer.type,
    minzoom: (layer as { minzoom?: number }).minzoom ?? 0,
    themePaint: (layer.metadata as Record<string, MapColorKey> | undefined)?.[THEME_PAINT_KEY],
  }));
  const chartSource = sourceIds[0];
  let onSourceData: ((event: MapSourceDataEvent) => void) | undefined;

  // The native max zoom lives in the source's TileJSON, which a PMTiles archive reports
  // only once it has loaded, so this is applied after the source is loaded. Each layer's
  // own minzoom is preserved (e.g. landuse is held back from low zoom for performance).
  const capToNativeZoom = (map: MapLibreMap): boolean => {
    const source = map.getSource(chartSource) as { maxzoom?: number } | undefined;
    const nativeMax = source?.maxzoom;
    if (nativeMax === undefined) return false;
    for (const layer of layers) {
      if (map.getLayer(layer.id)) {
        map.setLayerZoomRange(layer.id, layer.minzoom, nativeMax + CHART_OVERZOOM_BUDGET);
      }
    }
    return true;
  };

  return {
    id: chartSourceId(chart.identifier),
    title: chart.name,
    band,
    supportsOpacity: true,
    layerIds: layers.map((layer) => layer.id),
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
          ctx.map.addLayer(layer, ctx.beforeIdFor(band));
        }
      }
      // A chart with no sources (the empty mapstyleJSON specs) has nothing to cap, so skip
      // the listener entirely rather than waiting forever on an undefined source id.
      if (!chartSource) return;
      // Clear any listener left by a prior add (the reattach path) before installing a
      // new one, so the handler reference cannot be orphaned.
      if (onSourceData) {
        ctx.map.off('sourcedata', onSourceData);
        onSourceData = undefined;
      }
      const tryCap = () => ctx.map.isSourceLoaded(chartSource) && capToNativeZoom(ctx.map);
      if (!tryCap()) {
        const handler = (event: MapSourceDataEvent) => {
          if (event.sourceId === chartSource && event.isSourceLoaded && tryCap()) {
            ctx.map.off('sourcedata', handler);
            if (onSourceData === handler) onSourceData = undefined;
          }
        };
        onSourceData = handler;
        ctx.map.on('sourcedata', handler);
      }
    },
    remove(ctx) {
      if (onSourceData) {
        ctx.map.off('sourcedata', onSourceData);
        onSourceData = undefined;
      }
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
    applyTheme(ctx, paint) {
      // Recolor this chart's own themed draw layers, so the widget no longer reaches
      // into chart layers by id. Raster layers carry no theme key and are skipped.
      for (const layer of layers) {
        if (!layer.themePaint) continue;
        const property = layer.type === 'line' ? 'line-color' : 'fill-color';
        ctx.map.setPaintProperty(layer.id, property, paint[layer.themePaint]);
      }
    },
  };
}
