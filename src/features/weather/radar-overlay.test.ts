import { describe, expect, it, vi } from 'vitest';
import { WeatherStore } from '$entities/weather';
import { mapThemePaint, type OverlayContext } from '$shared/map';
import { createFakeMap } from '$shared/testing/fake-map';
import { createRadarOverlay } from './radar-overlay';

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

function storeWithRadar(): WeatherStore {
  const store = new WeatherStore();
  store.setRadar({
    host: 'https://tilecache.rainviewer.com',
    frames: [
      { time: 1000, path: '/v2/radar/a' },
      { time: 2000, path: '/v2/radar/b' },
    ],
  });
  return store;
}

describe('radar overlay', () => {
  it('adds a raster source and layer in the weather band', () => {
    const overlay = createRadarOverlay(storeWithRadar());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(overlay.band).toBe('weather');
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(1);
  });

  it('points the source at the latest frame on sync', () => {
    const overlay = createRadarOverlay(storeWithRadar());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.sync(ctxFor(map));
    const source = [...map.sources.values()][0];
    expect(vi.mocked(source.setTiles)).toHaveBeenCalledWith([
      'https://tilecache.rainviewer.com/v2/radar/b/256/{z}/{x}/{y}/2/1_1.png',
    ]);
  });

  it('removes its layer and source', () => {
    const overlay = createRadarOverlay(storeWithRadar());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });

  it('stays hidden when shown before a frame, then reveals once a frame lands', () => {
    const overlay = createRadarOverlay(storeWithRadar());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    // Toggled on before any frame: the empty-tiles source must not be revealed (it would crash the
    // raster tile loader), so the only visibility the layer ever takes here is 'none'.
    overlay.setVisible(ctxFor(map), true);
    const visibilityCalls = vi
      .mocked(map.setLayoutProperty)
      .mock.calls.filter(([, prop]) => prop === 'visibility');
    expect(visibilityCalls.every(([, , value]) => value === 'none')).toBe(true);

    // A frame lands on sync: now the layer is revealed.
    overlay.sync(ctxFor(map));
    expect(vi.mocked(map.setLayoutProperty)).toHaveBeenCalledWith(
      'binnacle-weather-radar-layer',
      'visibility',
      'visible',
    );
  });

  it('recolors for the theme without throwing', () => {
    const overlay = createRadarOverlay(storeWithRadar());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(() => overlay.applyTheme?.(ctxFor(map), mapThemePaint('night-red'))).not.toThrow();
  });
});
