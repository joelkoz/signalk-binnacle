import { describe, expect, it, vi } from 'vitest';
import type { Bbox, RadarData, WeatherGrid, WeatherStore } from '$entities/weather';
import { createWeatherLoader, weatherCacheKey } from './weather-loader';

const BBOX: Bbox = { west: 1, south: 2, east: 3, north: 4 };
const OPTS = { maxCells: 600, forecastDays: 5 };
const FAKE_GRID = { id: 'grid' } as unknown as WeatherGrid;
const FAKE_RADAR = { host: 'h', frames: [] } as unknown as RadarData;

function makeStore() {
  const status: string[] = [];
  const grids: unknown[] = [];
  const radars: unknown[] = [];
  const store = {
    grid: undefined as unknown,
    setStatus(s: string) {
      status.push(s);
    },
    setGrid(g: unknown) {
      grids.push(g);
      store.grid = g;
    },
    setRadar(r: unknown) {
      radars.push(r);
    },
  };
  return { store: store as unknown as WeatherStore, status, grids, radars };
}

function makeDeps(nowRef: { ms: number }) {
  return {
    forecast: vi.fn(async () => FAKE_GRID),
    marine: vi.fn(async () => undefined),
    radar: vi.fn(async () => FAKE_RADAR),
    now: () => nowRef.ms,
  };
}

describe('weatherCacheKey', () => {
  it('quantizes nearby bboxes to the same key', () => {
    const a = weatherCacheKey({ west: 1.0, south: 2.0, east: 3.0, north: 4.0 }, OPTS, false);
    const b = weatherCacheKey({ west: 1.01, south: 1.99, east: 3.02, north: 4.0 }, OPTS, false);
    expect(a).toBe(b);
  });

  it('separates marine from atmospheric-only', () => {
    expect(weatherCacheKey(BBOX, OPTS, true)).not.toBe(weatherCacheKey(BBOX, OPTS, false));
  });
});

describe('createWeatherLoader', () => {
  it('reuses a recent grid for the same view, and refetches after the TTL', async () => {
    const nowRef = { ms: 1000 };
    const deps = makeDeps(nowRef);
    const loader = createWeatherLoader(deps);
    const { store } = makeStore();

    await loader.load(store, BBOX, OPTS, { waves: false, radar: false });
    await loader.load(store, BBOX, OPTS, { waves: false, radar: false });
    expect(deps.forecast).toHaveBeenCalledTimes(1);

    nowRef.ms += 31 * 60 * 1000;
    await loader.load(store, BBOX, OPTS, { waves: false, radar: false });
    expect(deps.forecast).toHaveBeenCalledTimes(2);
  });

  it('fetches marine only when waves is wanted', async () => {
    const deps = makeDeps({ ms: 0 });
    const loader = createWeatherLoader(deps);
    const { store } = makeStore();

    await loader.load(store, BBOX, OPTS, { waves: false, radar: false });
    expect(deps.marine).not.toHaveBeenCalled();

    await loader.load(store, BBOX, OPTS, { waves: true, radar: false });
    expect(deps.marine).toHaveBeenCalledTimes(1);
  });

  it('caches radar frames for the radar TTL', async () => {
    const nowRef = { ms: 0 };
    const deps = makeDeps(nowRef);
    const loader = createWeatherLoader(deps);
    const { store, radars } = makeStore();

    await loader.load(store, BBOX, OPTS, { waves: false, radar: true });
    await loader.load(store, BBOX, OPTS, { waves: false, radar: true });
    expect(deps.radar).toHaveBeenCalledTimes(1);
    expect(radars).toHaveLength(2);

    nowRef.ms += 6 * 60 * 1000;
    await loader.load(store, BBOX, OPTS, { waves: false, radar: true });
    expect(deps.radar).toHaveBeenCalledTimes(2);
  });

  it('marks the store error when the first fetch fails, stale when a grid already exists', async () => {
    const deps = makeDeps({ ms: 0 });
    deps.forecast.mockResolvedValue(undefined as unknown as WeatherGrid);
    const loader = createWeatherLoader(deps);
    const { store, status } = makeStore();

    await loader.load(store, BBOX, OPTS, { waves: false, radar: false });
    expect(status).toContain('error');

    store.grid = FAKE_GRID;
    await loader.load(store, BBOX, OPTS, { waves: false, radar: false });
    expect(status).toContain('stale');
  });
});
