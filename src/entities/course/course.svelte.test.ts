import { describe, expect, it } from 'vitest';
import { OwnVessel } from '$entities/vessel';
import { SignalKStore } from '$shared/signalk';
import { CourseGuidance } from './course.svelte';

function storeWith(self: Record<string, unknown>): SignalKStore {
  const store = new SignalKStore();
  store.applyFrame({
    self: new Map(Object.entries(self)),
    ais: new Map(),
    connection: { phase: 'open', attempt: 0 },
    epoch: 1,
  });
  return store;
}

describe('CourseGuidance', () => {
  it('reports no active leg when there is no nextPoint', () => {
    const store = storeWith({ 'navigation.position': { latitude: 0, longitude: 0 } });
    const g = new CourseGuidance(store, new OwnVessel(store));
    expect(g.active).toBe(false);
  });

  it('uses provider calcValues when present and flags the source server', () => {
    const store = storeWith({
      'navigation.position': { latitude: 0, longitude: 0 },
      'navigation.course.nextPoint': { position: { latitude: 0, longitude: 1 }, name: 'B' },
      'navigation.course.calcValues': {
        crossTrackError: 12,
        distance: 1852,
        bearingTrue: 1.57,
        velocityMadeGood: 3,
      },
    });
    const g = new CourseGuidance(store, new OwnVessel(store));
    expect(g.active).toBe(true);
    expect(g.source).toBe('server');
    expect(g.crossTrackErrorMeters).toBe(12);
    expect(g.distanceToNextMeters).toBe(1852);
  });

  it('seeds the leg from a hydration snapshot and clear wipes every course cell', () => {
    const store = storeWith({ 'navigation.position': { latitude: 0, longitude: 0 } });
    const g = new CourseGuidance(store, new OwnVessel(store));
    expect(g.active).toBe(false);
    g.seed(
      {
        nextPoint: { position: { latitude: 0, longitude: 1 }, name: 'B' },
        previousPoint: { position: { latitude: 0, longitude: 0 } },
        activeRoute: { href: '/resources/routes/r', pointIndex: 0, pointTotal: 2 },
        arrivalCircle: 50,
      },
      { crossTrackError: 7, distance: 1852 },
    );
    expect(g.active).toBe(true);
    expect(g.source).toBe('server');
    expect(g.nextPointName).toBe('B');
    expect(g.distanceToNextMeters).toBe(1852);
    g.clear();
    expect(g.active).toBe(false);
    expect(g.source).toBe('computed');
    expect(g.isLastPoint).toBe(false);
  });

  it('computes the derived values when calcValues is absent and flags the source computed', () => {
    const store = storeWith({
      'navigation.position': { latitude: 0, longitude: 0 },
      'navigation.speedOverGround': 3,
      'navigation.courseOverGroundTrue': 1.5,
      'navigation.course.nextPoint': { position: { latitude: 0, longitude: 1 } },
      'navigation.course.previousPoint': { position: { latitude: 0, longitude: 0 } },
    });
    const g = new CourseGuidance(store, new OwnVessel(store));
    expect(g.active).toBe(true);
    expect(g.source).toBe('computed');
    expect(g.distanceToNextMeters).toBeGreaterThan(0);
    expect(typeof g.bearingToNextRad).toBe('number');
  });
});
