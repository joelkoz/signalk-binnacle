import { describe, expect, it } from 'vitest';
import { reverseRoute } from './route-ops';
import type { Route } from './route-types';

const route: Route = {
  id: 'r1',
  name: 'Harbor run',
  waypoints: [
    { position: { latitude: 1, longitude: 1 }, name: 'Start' },
    { position: { latitude: 2, longitude: 2 } },
    { position: { latitude: 3, longitude: 3 }, name: 'End' },
  ],
};

describe('reverseRoute', () => {
  it('reverses the waypoint order, keeping each name with its point', () => {
    const r = reverseRoute(route);
    expect(r.waypoints.map((w) => w.position.latitude)).toEqual([3, 2, 1]);
    expect(r.waypoints[0].name).toBe('End');
    expect(r.waypoints[2].name).toBe('Start');
  });

  it('gets a fresh id and a "(reverse)" name so it does not overwrite the original', () => {
    const r = reverseRoute(route);
    expect(r.id).not.toBe(route.id);
    expect(r.name).toBe('Harbor run (reverse)');
    // The original is untouched.
    expect(route.waypoints.map((w) => w.position.latitude)).toEqual([1, 2, 3]);
  });
});
