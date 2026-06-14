import { afterEach, describe, expect, it, vi } from 'vitest';
import { SymbolsStore, symbolIconId } from '$entities/symbols';
import { WaypointsStore } from '$entities/waypoint';
import { mapThemePaint, type OverlayContext } from '$shared/map';
import type { SkSymbol } from '$shared/signalk';
import { createFakeMap } from '$shared/testing/fake-map';
import { createWaypointOverlay } from './waypoint-overlay';

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

function storeWithWaypoint(): WaypointsStore {
  const store = new WaypointsStore();
  store.setWaypoints([
    { id: 'w1', name: 'Anchorage', position: { latitude: 44.1, longitude: -86.5 } },
  ]);
  return store;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

function waypointSymbol(): SkSymbol {
  return {
    uuid: 'w9',
    aliases: ['custom:waypoint'],
    name: 'Waypoint flag',
    url: '/s/w9.svg',
    roles: ['waypoint'],
    anchor: [12, 24],
  };
}

function symbolsStore(
  symbol: SkSymbol,
  rasterize: SymbolsStore['rasterize'] = vi.fn().mockResolvedValue({
    image: { width: 48, height: 48, data: new Uint8ClampedArray(4) } as never,
    cssWidth: 24,
    cssHeight: 24,
    scale: 1,
  }),
): SymbolsStore {
  return new SymbolsStore('http://pi', undefined, [symbol], rasterize);
}

describe('waypoint overlay', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds the marker and label layers and syncs the store waypoints', () => {
    const overlay = createWaypointOverlay(storeWithWaypoint());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.sync(ctxFor(map));
    expect(overlay.band).toBe('routes');
    expect(map.getLayer('binnacle-waypoint-marker')).toBeTruthy();
    expect(map.getLayer('binnacle-waypoint-label')).toBeTruthy();
    expect(map.getLayer('binnacle-waypoint-symbol')).toBeUndefined();
    const fc = map.sources.get('binnacle-waypoints')?.data as GeoJSON.FeatureCollection;
    expect(fc.features).toHaveLength(1);
    expect((fc.features[0].geometry as GeoJSON.Point).coordinates).toEqual([-86.5, 44.1]);
    expect(fc.features[0].properties).toEqual({ name: 'Anchorage' });
  });

  it('sync is a no-op when the store version is unchanged', () => {
    const store = storeWithWaypoint();
    const overlay = createWaypointOverlay(store);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.sync(ctxFor(map));
    map.sources.get('binnacle-waypoints')?.setData?.('marker');
    overlay.sync(ctxFor(map));
    expect(map.sources.get('binnacle-waypoints')?.data).toBe('marker');
  });

  it('applyTheme recolors the layers', () => {
    const overlay = createWaypointOverlay(storeWithWaypoint());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.applyTheme?.(ctxFor(map), mapThemePaint('night-red'));
    expect(map.setPaintProperty).toHaveBeenCalled();
  });

  it('remove tears down layers and sources', () => {
    const overlay = createWaypointOverlay(storeWithWaypoint());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });

  it('swaps the disc for a provided waypoint-override symbol once its image registers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => '<svg/>' } as unknown as Response),
    );
    const overlay = createWaypointOverlay(storeWithWaypoint(), symbolsStore(waypointSymbol()));
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(map.getLayer('binnacle-waypoint-symbol')).toBeTruthy();
    expect(overlay.layerIds).toEqual([
      'binnacle-waypoint-marker',
      'binnacle-waypoint-symbol',
      'binnacle-waypoint-label',
    ]);
    await settle();
    expect(map.hasImage(symbolIconId('w9'))).toBe(true);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'binnacle-waypoint-symbol',
      'icon-offset',
      [0, -12],
    );
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'binnacle-waypoint-symbol',
      'visibility',
      'visible',
    );
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'binnacle-waypoint-marker',
      'visibility',
      'none',
    );
  });

  it('keeps the disc when the symbol SVG fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    const overlay = createWaypointOverlay(storeWithWaypoint(), symbolsStore(waypointSymbol()));
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    await settle();
    expect(map.hasImage(symbolIconId('w9'))).toBe(false);
    expect(map.setLayoutProperty).not.toHaveBeenCalledWith(
      'binnacle-waypoint-symbol',
      'icon-offset',
      expect.anything(),
    );
    expect(map.setLayoutProperty).not.toHaveBeenCalledWith(
      'binnacle-waypoint-marker',
      'visibility',
      'none',
    );
  });

  it('ignores a symbols store without a waypoint-role override of the waypoint id', () => {
    const noteOnly: SkSymbol = { ...waypointSymbol(), roles: ['note'] };
    const overlay = createWaypointOverlay(storeWithWaypoint(), symbolsStore(noteOnly));
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(map.getLayer('binnacle-waypoint-symbol')).toBeUndefined();
    // The id list names the symbol layer unconditionally (teardown skips absent layers), so a
    // late-filling symbols store can add it without the manager's list going stale.
    expect(overlay.layerIds).toEqual([
      'binnacle-waypoint-marker',
      'binnacle-waypoint-symbol',
      'binnacle-waypoint-label',
    ]);
  });
});
