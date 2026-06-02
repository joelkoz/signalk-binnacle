import { describe, expect, it } from 'vitest';
import { createTrackSettings } from '$shared/settings';
import { createTrackStore } from '$shared/storage';
import { computeStats, decideRecord, TrackRecorder } from './recorder.svelte';
import type { TrackPoint } from './track-types';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

function recorder(): TrackRecorder {
  return new TrackRecorder(
    createTrackSettings(fakeStorage()),
    createTrackStore<TrackPoint>(undefined),
  );
}

const defaults = { intervalSeconds: 10, minMeters: 10, colorMode: 'speed' as const };

describe('decideRecord', () => {
  it('records the first fix with no gap', () => {
    expect(decideRecord(undefined, 36.8, -121.7, 0, defaults)).toEqual({
      append: true,
      gap: false,
    });
  });

  it('skips a fix under the interval or under the min distance', () => {
    const last: TrackPoint = { lat: 36.8, lon: -121.7, t: 0, sog: 1 };
    expect(decideRecord(last, 36.80001, -121.7, 5000, defaults).append).toBe(false); // 5 s, ~1 m
    expect(decideRecord(last, 36.801, -121.7, 5000, defaults).append).toBe(false); // 111 m but only 5 s
  });

  it('records once both interval and distance pass', () => {
    const last: TrackPoint = { lat: 36.8, lon: -121.7, t: 0, sog: 1 };
    expect(decideRecord(last, 36.801, -121.7, 12000, defaults)).toEqual({
      append: true,
      gap: false,
    });
  });

  it('records with a break after a long time gap', () => {
    const last: TrackPoint = { lat: 36.8, lon: -121.7, t: 0, sog: 1 };
    expect(decideRecord(last, 36.8, -121.7, 6 * 60 * 1000, defaults)).toEqual({
      append: true,
      gap: true,
    });
  });
});

describe('computeStats', () => {
  it('sums non-gap distance, duration, and max sog', () => {
    const stats = computeStats([
      { lat: 0, lon: 0, t: 0, sog: 1 },
      { lat: 0.001, lon: 0, t: 10_000, sog: 3 },
    ]);
    expect(stats.distanceMeters).toBeCloseTo(111.19, 0);
    expect(stats.durationSeconds).toBe(10);
    expect(stats.maxSog).toBe(3);
  });

  it('excludes a gap segment from distance', () => {
    const stats = computeStats([
      { lat: 0, lon: 0, t: 0, sog: 1 },
      { lat: 1, lon: 0, t: 1000, sog: 1, gap: true },
    ]);
    expect(stats.distanceMeters).toBe(0);
  });
});

describe('TrackRecorder', () => {
  it('records on policy and exposes stats', () => {
    const r = recorder();
    r.consider(36.8, -121.7, 1, 0);
    r.consider(36.80001, -121.7, 1, 5000); // too soon and too close
    r.consider(36.801, -121.7, 2, 12000); // 12 s, 111 m
    expect(r.points.map((p) => p.t)).toEqual([0, 12000]);
    expect(r.stats.maxSog).toBe(2);
  });

  it('marks a break on resume', () => {
    const r = recorder();
    r.consider(36.8, -121.7, 1, 0);
    r.pause();
    r.consider(36.9, -121.7, 1, 12000); // dropped while paused
    r.resume();
    r.consider(36.81, -121.7, 1, 24000);
    expect(r.points.length).toBe(2);
    expect(r.points[1].gap).toBe(true);
  });

  it('clear empties the track', () => {
    const r = recorder();
    r.consider(36.8, -121.7, 1, 0);
    r.clear();
    expect(r.points).toEqual([]);
  });

  it('restores persisted points from the store on construction', async () => {
    const seeded: TrackPoint[] = [
      { lat: 36.8, lon: -121.7, t: 0, sog: 1 },
      { lat: 36.81, lon: -121.7, t: 12000, sog: 2 },
    ];
    const store = {
      all: async () => seeded.slice(),
      append: async () => {},
      replace: async () => {},
      clear: async () => {},
    };
    const r = new TrackRecorder(createTrackSettings(fakeStorage()), store);
    // #restore runs asynchronously in the constructor; let its microtasks settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(r.points).toEqual(seeded);
  });
});
