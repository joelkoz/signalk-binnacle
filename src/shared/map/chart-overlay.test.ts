import { describe, expect, it } from 'vitest';
import { createFakeMap } from '$shared/testing/fake-map';
import { createChartOverlay } from './chart-overlay';
import type { OverlayContext } from './types';

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

describe('chart overlay', () => {
  it('adds the chart source and layer in the basemap band', () => {
    const overlay = createChartOverlay(
      { identifier: 'noaa', name: 'NOAA', type: 'tilelayer', tilemapUrl: '/t/{z}/{x}/{y}' },
      'http://pi.local',
    );
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(overlay.band).toBe('basemap');
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(1);
  });

  it('remove deletes the layer and source', () => {
    const overlay = createChartOverlay(
      { identifier: 'noaa', name: 'NOAA', type: 'tilelayer', tilemapUrl: '/t/{z}/{x}/{y}' },
      'http://pi.local',
    );
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });

  it('setOpacity uses raster-opacity for a raster chart', () => {
    const overlay = createChartOverlay(
      { identifier: 'noaa', name: 'NOAA', type: 'tilelayer', tilemapUrl: '/t/{z}/{x}/{y}' },
      'http://pi.local',
    );
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.setOpacity?.(ctxFor(map), 0.4);
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      expect.stringContaining('chart-noaa'),
      'raster-opacity',
      0.4,
    );
  });

  it('setOpacity uses fill-opacity and line-opacity for a vector chart', () => {
    const overlay = createChartOverlay(
      { identifier: 'vec', name: 'Vec', type: 'tileJSON', url: '/v/tilejson.json', layers: [] },
      'http://pi.local',
    );
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.setOpacity?.(ctxFor(map), 0.5);
    expect(map.setPaintProperty).toHaveBeenCalledWith('chart-vec-water', 'fill-opacity', 0.5);
    expect(map.setPaintProperty).toHaveBeenCalledWith('chart-vec-roads', 'line-opacity', 0.5);
  });

  it('caps chart layers one zoom past the source native max zoom', () => {
    const overlay = createChartOverlay(
      {
        identifier: 'noaa',
        name: 'NOAA',
        type: 'tilelayer',
        tilemapUrl: '/t/{z}/{x}/{y}',
        maxzoom: 14,
      },
      'http://pi.local',
    );
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(map.setLayerZoomRange).toHaveBeenCalledWith(
      expect.stringContaining('chart-noaa'),
      0,
      15,
    );
  });
});
