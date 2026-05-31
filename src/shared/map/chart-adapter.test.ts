import { describe, expect, it } from 'vitest';
import { chartToSpecs } from './chart-adapter';
import type { SignalKChart } from './chart-types';

const base = 'http://pi.local';

describe('chartToSpecs', () => {
  it('builds a raster source and layer for a tilelayer', () => {
    const chart: SignalKChart = {
      identifier: 'noaa',
      name: 'NOAA',
      type: 'tilelayer',
      minzoom: 0,
      maxzoom: 16,
      tilemapUrl: '/signalk/chart-tiles/noaa/{z}/{x}/{y}',
      bounds: [-180, -85, 180, 85],
    };
    const { sources, layers, opacityProperty } = chartToSpecs(chart, base);
    const sourceId = Object.keys(sources)[0];
    expect(sources[sourceId].type).toBe('raster');
    expect((sources[sourceId] as { tiles: string[] }).tiles[0]).toBe(
      'http://pi.local/signalk/chart-tiles/noaa/{z}/{x}/{y}',
    );
    expect(layers[0].type).toBe('raster');
    expect(opacityProperty).toBe('raster-opacity');
  });

  it('builds a vector source for a tileJSON chart', () => {
    const chart: SignalKChart = {
      identifier: 'enc',
      name: 'ENC',
      type: 'tileJSON',
      url: 'http://pi.local/signalk/enc/tilejson.json',
    };
    const { sources } = chartToSpecs(chart, base);
    const sourceId = Object.keys(sources)[0];
    expect(sources[sourceId].type).toBe('vector');
    expect((sources[sourceId] as { url: string }).url).toBe(
      'http://pi.local/signalk/enc/tilejson.json',
    );
  });

  it('resolves a pmtiles url to the pmtiles protocol', () => {
    const chart: SignalKChart = {
      identifier: 'region',
      name: 'Region',
      type: 'tileJSON',
      url: '/signalk/pmtiles/region.pmtiles',
    };
    const { sources } = chartToSpecs(chart, base);
    const sourceId = Object.keys(sources)[0];
    expect((sources[sourceId] as { url: string }).url).toBe(
      'pmtiles://http://pi.local/signalk/pmtiles/region.pmtiles',
    );
  });

  it('builds a raster source for a WMS chart', () => {
    const chart: SignalKChart = {
      identifier: 'wms',
      name: 'WMS',
      type: 'WMS',
      tilemapUrl: '/signalk/wms/{bbox-epsg-3857}',
    };
    const { sources, layers } = chartToSpecs(chart, base);
    const sourceId = Object.keys(sources)[0];
    expect(sources[sourceId].type).toBe('raster');
    expect(layers[0].type).toBe('raster');
  });

  it('passes through an absolute tile url unchanged', () => {
    const chart: SignalKChart = {
      identifier: 'osm',
      name: 'OSM',
      type: 'tilelayer',
      url: 'https://tile.example/{z}/{x}/{y}.png',
    };
    const { sources } = chartToSpecs(chart, base);
    const sourceId = Object.keys(sources)[0];
    expect((sources[sourceId] as { tiles: string[] }).tiles[0]).toBe(
      'https://tile.example/{z}/{x}/{y}.png',
    );
  });
});
