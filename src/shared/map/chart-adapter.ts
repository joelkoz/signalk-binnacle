import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { SignalKChart } from './chart-types';

export interface ChartSpecs {
  sources: Record<string, SourceSpecification>;
  layers: LayerSpecification[];
  opacityProperty: string;
}

export function chartSourceId(identifier: string): string {
  return `chart-${identifier}`;
}

function absolute(url: string, base: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function tileTemplate(chart: SignalKChart, base: string): string {
  const template = chart.tilemapUrl ?? chart.url ?? '';
  return absolute(template, base);
}

function rasterSpecs(chart: SignalKChart, base: string): ChartSpecs {
  const sourceId = chartSourceId(chart.identifier);
  const layerId = `${sourceId}-layer`;
  const source: SourceSpecification = {
    type: 'raster',
    tiles: [tileTemplate(chart, base)],
    tileSize: 256,
    ...(chart.minzoom !== undefined ? { minzoom: chart.minzoom } : {}),
    ...(chart.maxzoom !== undefined ? { maxzoom: chart.maxzoom } : {}),
    ...(chart.bounds ? { bounds: chart.bounds } : {}),
  };
  return {
    sources: { [sourceId]: source },
    layers: [{ id: layerId, type: 'raster', source: sourceId }],
    opacityProperty: 'raster-opacity',
  };
}

function vectorSpecs(chart: SignalKChart, base: string): ChartSpecs {
  const sourceId = chartSourceId(chart.identifier);
  const raw = chart.url ?? chart.tilemapUrl ?? '';
  const resolved = absolute(raw, base);
  const url = resolved.endsWith('.pmtiles') ? `pmtiles://${resolved}` : resolved;
  const source: SourceSpecification = { type: 'vector', url };
  return {
    sources: { [sourceId]: source },
    layers: [],
    opacityProperty: 'fill-opacity',
  };
}

export function chartToSpecs(chart: SignalKChart, serverBase: string): ChartSpecs {
  switch (chart.type) {
    case 'tileJSON':
      return vectorSpecs(chart, serverBase);
    default:
      return rasterSpecs(chart, serverBase);
  }
}
