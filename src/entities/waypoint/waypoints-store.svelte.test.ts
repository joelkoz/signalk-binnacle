import { describe, expect, it } from 'vitest';
import type { Waypoint } from './waypoint-types';
import { WaypointsStore } from './waypoints-store.svelte';

const waypoint = (id: string): Waypoint => ({
  id,
  name: id,
  position: { latitude: 0, longitude: 0 },
});

describe('WaypointsStore', () => {
  it('sets the loaded waypoints and bumps the version', () => {
    const s = new WaypointsStore();
    const v0 = s.version;
    s.setWaypoints([waypoint('a'), waypoint('b')]);
    expect(s.waypoints.map((w) => w.id)).toEqual(['a', 'b']);
    expect(s.version).toBeGreaterThan(v0);
  });
});
