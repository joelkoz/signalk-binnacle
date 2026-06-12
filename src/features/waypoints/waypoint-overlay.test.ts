import { describe, expect, it } from 'vitest';
import { WaypointsStore } from '$entities/waypoint';
import { mapThemePaint, type OverlayContext } from '$shared/map';
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

describe('waypoint overlay', () => {
  it('adds the marker and label layers and syncs the store waypoints', () => {
    const overlay = createWaypointOverlay(storeWithWaypoint());
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.sync(ctxFor(map));
    expect(overlay.band).toBe('routes');
    expect(map.getLayer('binnacle-waypoint-marker')).toBeTruthy();
    expect(map.getLayer('binnacle-waypoint-label')).toBeTruthy();
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
    map.sources.get('binnacle-waypoints')?.setData('marker');
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
});
