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

// Open-Meteo model runs are hours apart, and the time slider shows the right hour from the cached
// 5-day window regardless, so a forecast stays useful far longer than the old 30-minute TTL. An hour
// keeps "now" reasonably fresh while roughly halving the request volume (and the rate-limit risk).
const GRID_TTL_MS = 60 * 60 * 1000;
// Radar is a nowcast: RainViewer publishes a new frame about every 10 minutes, so keep it short.
const RADAR_TTL_MS = 5 * 60 * 1000;
const QUANTIZE_DEG = 0.25;
// Cap the viewport cache so a long session of panning does not grow it without bound.
const MAX_GRID_ENTRIES = 16;
// How long to stop fetching the grid after a failure, so a rate-limited state is not made worse.
const GRID_FAIL_COOLDOWN_MS = 60 * 1000;

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
  // After a grid fetch fails (Open-Meteo rate-limiting returns 429 or 502 with no body), hold off on
  // the next network attempt so panning and resizing do not retry-storm and deepen the rate limit.
  let gridCooldownUntil = 0;

  // Returns the merged grid plus whether it is partial: waves were requested but the marine endpoint
  // failed (commonly an Open-Meteo 429 on the separate marine host). A partial grid still carries
  // wind and pressure, so it is shown, but it is not cached and it triggers the cooldown so the
  // rate-limited marine endpoint is not re-hit on the next pan.
  async function fetchMerged(
    bbox: Bbox,
    opts: ForecastOptions,
    waves: boolean,
  ): Promise<{ grid: WeatherGrid | undefined; partial: boolean }> {
    const [base, marine] = await Promise.all([
      deps.forecast(bbox, opts),
      waves ? deps.marine(bbox, opts) : Promise.resolve(undefined),
    ]);
    if (!base) return { grid: undefined, partial: false };
    return { grid: marine ? mergeMarine(base, marine) : base, partial: waves && !marine };
  }

  return {
    async load(store, bbox, opts, want) {
      store.setStatus('loading');
      const t = deps.now();
      const key = weatherCacheKey(bbox, opts, want.waves);
      const cachedGrid = gridCache.get(key);
      const gridHit = Boolean(cachedGrid && cachedGrid.expires > t);
      // Fetch unless a cached grid covers it, or a recent failure put us in the cooldown window.
      const inCooldown = !gridHit && t < gridCooldownUntil;
      let gridPromise: Promise<{ grid: WeatherGrid | undefined; partial: boolean }>;
      if (gridHit && cachedGrid)
        gridPromise = Promise.resolve({ grid: cachedGrid.grid, partial: false });
      else if (inCooldown) gridPromise = Promise.resolve({ grid: undefined, partial: false });
      else gridPromise = fetchMerged(bbox, opts, want.waves);

      let radarPromise: Promise<RadarData | undefined>;
      if (!want.radar) radarPromise = Promise.resolve(undefined);
      else if (radarCache && radarCache.expires > t)
        radarPromise = Promise.resolve(radarCache.data);
      else radarPromise = deps.radar();

      const [{ grid, partial }, radar] = await Promise.all([gridPromise, radarPromise]);

      if (grid) {
        store.setGrid(grid);
        if (partial) {
          // Waves failed: show the wind and pressure we got, but do not cache (so a later view
          // retries marine) and back off so the rate-limited endpoint is not re-hit on the next pan.
          if (!gridHit && !inCooldown) gridCooldownUntil = t + GRID_FAIL_COOLDOWN_MS;
        } else {
          for (const [k, entry] of gridCache) if (entry.expires <= t) gridCache.delete(k);
          gridCache.set(key, { grid, expires: t + GRID_TTL_MS });
          while (gridCache.size > MAX_GRID_ENTRIES) {
            const oldest = gridCache.keys().next().value;
            if (oldest === undefined) break;
            gridCache.delete(oldest);
          }
        }
      } else {
        // A real fetch attempt (not a cooldown skip) failed: back off before trying again.
        if (!gridHit && !inCooldown) gridCooldownUntil = t + GRID_FAIL_COOLDOWN_MS;
        store.setStatus(store.grid ? 'stale' : 'error');
      }
      if (radar) {
        radarCache = { data: radar, expires: t + RADAR_TTL_MS };
        store.setRadar(radar);
      }
    },
  };
}
