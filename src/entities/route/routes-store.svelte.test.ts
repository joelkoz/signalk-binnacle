import { describe, expect, it } from 'vitest';
import type { Route } from './route-types';
import { RouteStore } from './routes-store.svelte';

const route = (id: string): Route => ({
  id,
  name: id,
  waypoints: [
    { position: { latitude: 0, longitude: 0 } },
    { position: { latitude: 0, longitude: 1 } },
  ],
});

describe('RouteStore', () => {
  it('sets the loaded routes and bumps the version', () => {
    const s = new RouteStore();
    const v0 = s.version;
    s.setRoutes([route('a'), route('b')]);
    expect(s.routes.map((r) => r.id)).toEqual(['a', 'b']);
    expect(s.version).toBeGreaterThan(v0);
  });

  it('toggles a route shown and reports it', () => {
    const s = new RouteStore();
    s.setRoutes([route('a')]);
    expect(s.isShown('a')).toBe(false);
    s.toggleShown('a', true);
    expect(s.isShown('a')).toBe(true);
    expect(s.shownIds.has('a')).toBe(true);
  });

  it('tracks the active route id', () => {
    const s = new RouteStore();
    expect(s.activeId).toBeUndefined();
    s.setActive('a');
    expect(s.activeId).toBe('a');
    s.setActive(undefined);
    expect(s.activeId).toBeUndefined();
  });

  it('holds and clears a working route under edit', () => {
    const s = new RouteStore();
    s.setWorking(route('draft'));
    expect(s.working?.id).toBe('draft');
    s.setWorking(undefined);
    expect(s.working).toBeUndefined();
  });
});
