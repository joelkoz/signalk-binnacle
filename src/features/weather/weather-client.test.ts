import { describe, expect, it, vi } from 'vitest';
import { fetchForecast } from './weather-client';

function res(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

// Open-Meteo returns one object per location for a multi-location request. timeformat=unixtime
// makes hourly.time numeric seconds.
function loc(lat: number, lon: number, speed: number[], dir: number[]): unknown {
  return {
    latitude: lat,
    longitude: lon,
    hourly: {
      time: [1748908800, 1748912400],
      wind_speed_10m: speed,
      wind_direction_10m: dir,
      pressure_msl: [1013, 1012],
      precipitation: [0, 0.2],
      cloud_cover: [10, 50],
    },
  };
}

describe('fetchForecast', () => {
  it('parses a 2x2 grid and derives u/v from speed and direction', async () => {
    const body = [
      loc(0, 0, [10, 10], [90, 90]),
      loc(0, 1, [0, 0], [0, 0]),
      loc(1, 0, [0, 0], [0, 0]),
      loc(1, 1, [0, 0], [0, 0]),
    ];
    const fetchFn = vi.fn(async () => res(body));
    const grid = await fetchForecast(
      { west: 0, south: 0, east: 1, north: 1 },
      { maxCells: 4, forecastDays: 1 },
      fetchFn as unknown as typeof fetch,
    );
    expect(grid?.lats.length).toBe(2);
    expect(grid?.times.length).toBe(2);
    // 10 m/s from 90 degrees (east) blows toward the west: u about -10, v about 0.
    expect(grid?.windU[0][0]).toBeCloseTo(-10, 4);
    expect(grid?.windV[0][0]).toBeCloseTo(0, 4);
    expect(grid?.times[0]).toBe(1748908800000);
    // pressure_msl is hPa on the wire; the grid stores Pa.
    expect(grid?.pressureMsl?.[0]?.[0]).toBe(101300);
    expect(grid?.pressureMsl?.[1]?.[0]).toBe(101200);
  });

  it('returns undefined on a fetch failure', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    const grid = await fetchForecast(
      { west: 0, south: 0, east: 1, north: 1 },
      { maxCells: 4, forecastDays: 1 },
      fetchFn as unknown as typeof fetch,
    );
    expect(grid).toBeUndefined();
  });
});
