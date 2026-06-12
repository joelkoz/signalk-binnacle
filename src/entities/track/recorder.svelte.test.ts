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
    expect(decideRecord(undefined, undefined, 36.8, -121.7, 0, defaults)).toEqual({
      append: true,
      gap: false,
    });
  });

  it('skips a fix under the interval or under the min distance', () => {
    const last: TrackPoint = { lat: 36.8, lon: -121.7, t: 0, sog: 1 };
    expect(decideRecord(last, 0, 36.80001, -121.7, 5000, defaults).append).toBe(false); // 5 s, ~1 m
    expect(decideRecord(last, 0, 36.801, -121.7, 5000, defaults).append).toBe(false); // 111 m but only 5 s
  });

  it('records once both interval and distance pass', () => {
    const last: TrackPoint = { lat: 36.8, lon: -121.7, t: 0, sog: 1 };
    expect(decideRecord(last, 0, 36.801, -121.7, 12000, defaults)).toEqual({
      append: true,
      gap: false,
    });
  });

  it('records with a break after a genuine fix-stream outage', () => {
    const last: TrackPoint = { lat: 36.8, lon: -121.7, t: 0, sog: 1 };
    // The last considered fix was 6 minutes ago: a real GPS dropout.
    expect(decideRecord(last, 0, 36.8, -121.7, 6 * 60 * 1000, defaults)).toEqual({
      append: true,
      gap: true,
    });
    // No considered-fix time known (a restored track): fall back to the recorded point's time.
    expect(decideRecord(last, undefined, 36.8, -121.7, 6 * 60 * 1000, defaults)).toEqual({
      append: true,
      gap: true,
    });
  });

  it('does not gap a stationary boat whose fix stream is continuous', () => {
    const last: TrackPoint = { lat: 36.8, lon: -121.7, t: 0, sog: 0 };
    // Fixes kept arriving (the latest one minute ago); long-since-recorded is not a dropout,
    // and the min-move threshold vetoes the stationary append.
    expect(decideRecord(last, 5 * 60 * 1000, 36.8, -121.7, 6 * 60 * 1000, defaults)).toEqual({
      append: false,
      gap: false,
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

  it('records nothing after the first point at anchor with continuous fixes', () => {
    const r = recorder();
    // A fix every minute at the same position for half an hour: the min-move check vetoes
    // every append, and the continuous stream means no gap point is ever recorded.
    for (let t = 0; t <= 30 * 60 * 1000; t += 60 * 1000) {
      r.consider(36.8, -121.7, 0, t);
    }
    expect(r.points.length).toBe(1);
  });

  it('starts a break after a genuine fix-stream outage', () => {
    const r = recorder();
    r.consider(36.8, -121.7, 1, 0);
    r.consider(36.8, -121.7, 1, 6 * 60 * 1000); // first fix after a 6-minute GPS outage
    expect(r.points.length).toBe(2);
    expect(r.points[1].gap).toBe(true);
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
      clear: async () => {},
    };
    const r = new TrackRecorder(createTrackSettings(fakeStorage()), store);
    // #restore runs asynchronously in the constructor; let its microtasks settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(r.points).toEqual(seeded);
  });

  it('keeps fixes recorded before the restore resolves', async () => {
    let resolveAll!: (points: TrackPoint[]) => void;
    const store = {
      all: () =>
        new Promise<TrackPoint[]>((resolve) => {
          resolveAll = resolve;
        }),
      append: async () => {},
      clear: async () => {},
    };
    const r = new TrackRecorder(createTrackSettings(fakeStorage()), store);
    r.consider(36.8, -121.7, 1, 20000); // a live fix lands before the store read finishes
    resolveAll([{ lat: 36.7, lon: -121.7, t: 0, sog: 1 }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(r.points.map((p) => p.t)).toEqual([0, 20000]);
  });
});
