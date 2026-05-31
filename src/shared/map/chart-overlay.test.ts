import { describe, expect, it, vi } from 'vitest';
import { createChartOverlay } from './chart-overlay';
import type { OverlayContext } from './types';

function fakeMap() {
  const sources = new Set<string>();
  const layers = new Set<string>();
  return {
    sources,
    layers,
    addSource: (id: string) => sources.add(id),
    addLayer: (layer: { id: string }) => layers.add(layer.id),
    getSource: (id: string) => (sources.has(id) ? {} : undefined),
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    removeLayer: (id: string) => layers.delete(id),
    removeSource: (id: string) => sources.delete(id),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
  };
}

function ctxFor(map: ReturnType<typeof fakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

describe('chart overlay', () => {
  it('adds the chart source and layer in the basemap band', () => {
    const overlay = createChartOverlay(
      { identifier: 'noaa', name: 'NOAA', type: 'tilelayer', tilemapUrl: '/t/{z}/{x}/{y}' },
      'http://pi.local',
    );
    const map = fakeMap();
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
    const map = fakeMap();
    overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });

  it('setOpacity uses the adapter opacity property', () => {
    const overlay = createChartOverlay(
      { identifier: 'noaa', name: 'NOAA', type: 'tilelayer', tilemapUrl: '/t/{z}/{x}/{y}' },
      'http://pi.local',
    );
    const map = fakeMap();
    overlay.add(ctxFor(map));
    overlay.setOpacity?.(ctxFor(map), 0.4);
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      expect.stringContaining('chart-noaa'),
      'raster-opacity',
      0.4,
    );
  });
});
