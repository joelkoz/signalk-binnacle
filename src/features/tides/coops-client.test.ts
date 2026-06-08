import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentEvents, fetchTideEvents, fetchTideStations } from './coops-client';

function mockFetch(json: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, json: async () => json })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('coops-client', () => {
  it('parses tide stations into SI positions', async () => {
    mockFetch({ stations: [{ id: '1', name: 'A', lat: 27.7, lng: -82.7 }] });
    expect(await fetchTideStations()).toEqual([
      { id: '1', name: 'A', latitude: 27.7, longitude: -82.7 },
    ]);
  });

  it('parses tide events with meters and a high or low kind', async () => {
    mockFetch({
      predictions: [
        { t: '2026-06-08 09:34', v: '0.532', type: 'H' },
        { t: '2026-06-08 15:17', v: '0.307', type: 'L' },
      ],
    });
    const events = await fetchTideEvents('8726520');
    expect(events[0].heightMeters).toBeCloseTo(0.532);
    expect(events[0].kind).toBe('high');
    expect(events[1].kind).toBe('low');
    expect(Number.isFinite(events[0].timeMs)).toBe(true);
  });

  it('converts current velocity from cm/s to SI m/s and reads the set', async () => {
    mockFetch({
      current_predictions: {
        cp: [
          {
            Type: 'flood',
            Time: '2026-06-08 05:58',
            Velocity_Major: 20.4,
            meanFloodDir: 100,
            meanEbbDir: 280,
          },
          {
            Type: 'slack',
            Time: '2026-06-08 02:27',
            Velocity_Major: 0,
            meanFloodDir: 100,
            meanEbbDir: 280,
          },
        ],
      },
    });
    const events = await fetchCurrentEvents('ACT8451');
    expect(events[0].velocityMps).toBeCloseTo(0.204);
    expect(events[0].directionDeg).toBe(100);
    expect(events[0].kind).toBe('flood');
    expect(events[1].kind).toBe('slack');
    expect(events[1].directionDeg).toBeUndefined();
  });

  it('throws on a non-ok response', async () => {
    mockFetch({}, false, 503);
    await expect(fetchTideStations()).rejects.toThrow();
  });
});
