import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { SignalKChart } from './chart-types';
import { type MapThemePaint, mapThemePaint } from './map-theme';

export interface ChartSpecs {
  sources: Record<string, SourceSpecification>;
  layers: LayerSpecification[];
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
  };
}

// How each known vector source-layer is drawn and which theme color it takes. A
// vector tile source paints nothing on its own; MapLibre needs a draw layer per
// source-layer. The two dominant vector base-map schemas are covered so an arbitrary
// user archive renders: Protomaps (earth, roads, boundaries) and OpenMapTiles
// (no earth land polygon, transportation, boundary).
type DrawKind = 'fill' | 'line';
const SOURCE_LAYER_STYLE: Record<string, { kind: DrawKind; paint: keyof MapThemePaint }> = {
  earth: { kind: 'fill', paint: 'land' },
  landcover: { kind: 'fill', paint: 'landcover' },
  landuse: { kind: 'fill', paint: 'landcover' },
  water: { kind: 'fill', paint: 'water' },
  roads: { kind: 'line', paint: 'road' },
  transportation: { kind: 'line', paint: 'road' },
  boundaries: { kind: 'line', paint: 'boundary' },
  boundary: { kind: 'line', paint: 'boundary' },
};

// Drawn back to front: land base, ground cover, water, then line work on top. Water is
// drawn over land on purpose: on a marine chart navigable water must never be hidden by
// an over-generalized land polygon. The tradeoff is that at low zoom a small island
// whose archive water tile lacks a hole merges into the water; it reappears once the
// tiles carry enough detail (a zoom level or two in), which is the safe direction.
const DRAW_ORDER = [
  'earth',
  'landcover',
  'landuse',
  'water',
  'roads',
  'transportation',
  'boundaries',
  'boundary',
];

function vectorDrawLayers(sourceId: string, available: string[]): LayerSpecification[] {
  const paint = mapThemePaint('day');
  // Signal K's charts API often returns an empty layers list for a PMTiles archive;
  // the real source-layer names live in the archive's own metadata. The vector base
  // map uses the standard Protomaps schema, so when no layers are declared, draw the
  // full known set. MapLibre silently ignores a draw layer whose source-layer is
  // absent from the tiles, so emitting all of them is safe.
  const present = available.length > 0 ? new Set(available) : new Set(DRAW_ORDER);
  const layers: LayerSpecification[] = [];
  for (const sourceLayer of DRAW_ORDER) {
    if (!present.has(sourceLayer)) continue;
    const style = SOURCE_LAYER_STYLE[sourceLayer];
    if (!style) continue;
    const id = `${sourceId}-${sourceLayer}`;
    const color = paint[style.paint] as string;
    if (style.kind === 'fill') {
      layers.push({
        id,
        type: 'fill',
        source: sourceId,
        'source-layer': sourceLayer,
        paint: { 'fill-color': color },
      });
    } else {
      layers.push({
        id,
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        paint: { 'line-color': color, 'line-width': sourceLayer === 'boundaries' ? 0.8 : 0.5 },
      });
    }
  }
  return layers;
}

function vectorSpecs(chart: SignalKChart, base: string): ChartSpecs {
  const sourceId = chartSourceId(chart.identifier);
  const raw = chart.url ?? chart.tilemapUrl ?? '';
  const resolved = absolute(raw, base);
  const url = resolved.endsWith('.pmtiles') ? `pmtiles://${resolved}` : resolved;
  const source: SourceSpecification = {
    type: 'vector',
    url,
    ...(chart.minzoom !== undefined ? { minzoom: chart.minzoom } : {}),
    ...(chart.maxzoom !== undefined ? { maxzoom: chart.maxzoom } : {}),
  };
  return {
    sources: { [sourceId]: source },
    layers: vectorDrawLayers(sourceId, chart.layers ?? []),
  };
}

// A chart is vector when it declares a vector type or an MVT/PMTiles payload. Some
// Signal K servers label a vector PMTiles archive as "tilelayer" but mark it with
// format "mvt", so the format and the .pmtiles suffix are checked, not just the type.
function isVector(chart: SignalKChart): boolean {
  if (chart.type === 'tileJSON' || chart.type === 'mapstyleJSON') return true;
  if (chart.format === 'mvt' || chart.format === 'pbf') return true;
  const candidate = chart.url ?? chart.tilemapUrl ?? '';
  return candidate.endsWith('.pmtiles');
}

export function chartToSpecs(chart: SignalKChart, serverBase: string): ChartSpecs {
  return isVector(chart) ? vectorSpecs(chart, serverBase) : rasterSpecs(chart, serverBase);
}
