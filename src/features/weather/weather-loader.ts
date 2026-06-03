import type { Bbox, RadarData, WeatherGrid, WeatherStore } from '$entities/weather';
import { fetchRadar } from './rainviewer-client';
import { type ForecastOptions, fetchForecast, fetchMarine, mergeMarine } from './weather-client';

export interface WeatherLayersWanted {
  waves: boolean;
  radar: boolean;
}

interface LoaderDeps {
  forecast: typeof fetchForecast;
  marine: typeof fetchMarine;
  radar: typeof fetchRadar;
  now: () => number;
}

export interface WeatherLoader {
  load(
    store: WeatherStore,
    bbox: Bbox,
    opts: ForecastOptions,
    want: WeatherLayersWanted,
  ): Promise<void>;
}

const GRID_TTL_MS = 30 * 60 * 1000;
const RADAR_TTL_MS = 5 * 60 * 1000;
const QUANTIZE_DEG = 0.25;

const quantize = (v: number): number => Math.round(v / QUANTIZE_DEG) * QUANTIZE_DEG;

// A cache key quantized to a coarse grid so small pans reuse a recent fetch. The sampling options
// and whether marine was merged are part of the key, since they change the grid's contents.
export function weatherCacheKey(bbox: Bbox, opts: ForecastOptions, waves: boolean): string {
  return [
    quantize(bbox.west),
    quantize(bbox.south),
    quantize(bbox.east),
    quantize(bbox.north),
    opts.maxCells,
    opts.forecastDays,
    waves ? 'm' : '-',
  ].join(':');
}

const realDeps: LoaderDeps = {
  forecast: fetchForecast,
  marine: fetchMarine,
  radar: fetchRadar,
  now: () => Date.now(),
};

// A weather loader with its own in-memory, viewport-keyed cache. Repeat or adjacent views reuse a
// recent fetch instead of hitting the network again, which keeps panning the mini-map cheap. The
// service-worker cache still backs offline; this avoids the request entirely while the app is open.
// Constructed in App and passed down so it is swappable in tests (deps and clock are injectable).
export function createWeatherLoader(overrides: Partial<LoaderDeps> = {}): WeatherLoader {
  const deps = { ...realDeps, ...overrides };
  const gridCache = new Map<string, { grid: WeatherGrid; expires: number }>();
  let radarCache: { data: RadarData; expires: number } | undefined;

  async function fetchMerged(
    bbox: Bbox,
    opts: ForecastOptions,
    waves: boolean,
  ): Promise<WeatherGrid | undefined> {
    const [base, marine] = await Promise.all([
      deps.forecast(bbox, opts),
      waves ? deps.marine(bbox, opts) : Promise.resolve(undefined),
    ]);
    if (!base) return undefined;
    return marine ? mergeMarine(base, marine) : base;
  }

  return {
    async load(store, bbox, opts, want) {
      store.setStatus('loading');
      const t = deps.now();
      const key = weatherCacheKey(bbox, opts, want.waves);
      const cachedGrid = gridCache.get(key);
      const gridPromise =
        cachedGrid && cachedGrid.expires > t
          ? Promise.resolve(cachedGrid.grid)
          : fetchMerged(bbox, opts, want.waves);

      let radarPromise: Promise<RadarData | undefined>;
      if (!want.radar) radarPromise = Promise.resolve(undefined);
      else if (radarCache && radarCache.expires > t)
        radarPromise = Promise.resolve(radarCache.data);
      else radarPromise = deps.radar();

      const [grid, radar] = await Promise.all([gridPromise, radarPromise]);

      if (grid) {
        gridCache.set(key, { grid, expires: t + GRID_TTL_MS });
        store.setGrid(grid);
      } else {
        store.setStatus(store.grid ? 'stale' : 'error');
      }
      if (radar) {
        radarCache = { data: radar, expires: t + RADAR_TTL_MS };
        store.setRadar(radar);
      }
    },
  };
}
