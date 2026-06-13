import type { Bbox, RadarData, WeatherGrid, WeatherStore } from '$entities/weather';
import { HOUR_MS, MINUTE_MS } from '$shared/lib';
import { createExpiringStore, type ExpiringStore, MemoryCache } from '$shared/storage';
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
  // Persists fetched grids across reloads (and over plain http, where the service worker is inert),
  // so a reload or a return to a recent view reuses the forecast instead of re-fetching.
  persist: ExpiringStore<WeatherGrid>;
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
const GRID_TTL_MS = HOUR_MS;
// Radar is a nowcast: RainViewer publishes a new frame about every 10 minutes, so keep it short.
const RADAR_TTL_MS = 5 * MINUTE_MS;
// The viewport bucket size for the weather grid cache: coarser than the point-conditions cell
// (shared geo COORD_CELL_DEG, 0.1) on purpose, because a forecast grid covers a wider area than a
// single point reading, so a 0.25 degree bucket reuses one grid across nearby pans.
const QUANTIZE_DEG = 0.25;
// Cap the viewport cache so a long session of panning does not grow it without bound.
const MAX_GRID_ENTRIES = 16;
// How long to stop fetching the grid after a failure, so a rate-limited state is not made worse.
const GRID_FAIL_COOLDOWN_MS = MINUTE_MS;

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
  // Cap the persistent L2 to match the in-memory L1 intent (MAX_GRID_ENTRIES), rather than leaning
  // on the store's larger default, so the two tiers are a deliberate pair on a constrained device.
  persist: createExpiringStore<WeatherGrid>('binnacle-weather', { maxEntries: MAX_GRID_ENTRIES }),
};

// A weather loader with its own in-memory, viewport-keyed cache. Repeat or adjacent views reuse a
// recent fetch instead of hitting the network again, which keeps panning the mini-map cheap. The
// service-worker cache still backs offline; this avoids the request entirely while the app is open.
// Constructed in App and passed down so it is swappable in tests (deps and clock are injectable).
export function createWeatherLoader(overrides: Partial<LoaderDeps> = {}): WeatherLoader {
  const deps = { ...realDeps, ...overrides };
  const gridCache = new MemoryCache<WeatherGrid>(MAX_GRID_ENTRIES, GRID_TTL_MS);
  let radarCache: { data: RadarData; expires: number } | undefined;
  // After a grid fetch fails (Open-Meteo rate-limiting returns 429 or 502 with no body), hold off on
  // the next network attempt so panning and resizing do not retry-storm and deepen the rate limit.
  // The cooldowns are per endpoint: a marine 429 must not block the healthy atmospheric fetch, or a
  // waves-off pan would still show "Showing last forecast" for the cooldown of a host it never hits.
  let gridCooldownUntil = 0;
  let marineCooldownUntil = 0;
  // Bumped at each load's entry so an older viewport's slow response cannot land after a newer
  // one and overwrite its grid, radar, or status (the WeatherConditions sequence-guard pattern).
  let loadSeq = 0;

  // Returns the merged grid plus whether it is partial: waves were requested but the marine endpoint
  // failed (commonly an Open-Meteo 429 on the separate marine host). A partial grid still carries
  // wind and pressure, so it is shown, but it is not cached, and only the MARINE endpoint backs off.
  async function fetchMerged(
    bbox: Bbox,
    opts: ForecastOptions,
    waves: boolean,
    t: number,
  ): Promise<{ grid: WeatherGrid | undefined; partial: boolean }> {
    const tryMarine = waves && t >= marineCooldownUntil;
    const [base, marine] = await Promise.all([
      deps.forecast(bbox, opts),
      tryMarine ? deps.marine(bbox, opts) : Promise.resolve(undefined),
    ]);
    if (tryMarine && !marine) marineCooldownUntil = deps.now() + GRID_FAIL_COOLDOWN_MS;
    if (!base) return { grid: undefined, partial: false };
    const partial = waves && !marine;
    // Stamp provenance onto the grid itself so it survives both cache tiers: the panel states the
    // forecast's age from fetchedAt, and qualifies the display when the wave fields are missing.
    const grid: WeatherGrid = { ...(marine ? mergeMarine(base, marine) : base), fetchedAt: t };
    if (partial) grid.partialWaves = true;
    return { grid, partial };
  }

  return {
    async load(store, bbox, opts, want) {
      const seq = ++loadSeq;
      store.setStatus('loading');
      const t = deps.now();
      const key = weatherCacheKey(bbox, opts, want.waves);

      // Resolve the grid from the in-memory cache, then the persistent (IndexedDB) cache, then the
      // network. `fromNetwork` distinguishes a fresh fetch (which is cached and which arms the
      // cooldown on failure) from a cache hit or a cooldown skip.
      const resolveGrid = async (): Promise<{
        grid: WeatherGrid | undefined;
        partial: boolean;
        fromNetwork: boolean;
      }> => {
        const mem = gridCache.get(key, t);
        if (mem) return { grid: mem, partial: false, fromNetwork: false };
        const stored = await deps.persist.get(key);
        if (stored && stored.expires > t) {
          // Promote the L2 hit into L1 with the persisted absolute expiry, so the in-memory copy
          // expires exactly when the persisted entry would, rather than restarting the TTL from now.
          gridCache.putAt(key, stored.value, stored.expires, t);
          // Prune here too, not only after a network fetch: a long offline session keeps hitting the
          // cache and would otherwise never evict expired L2 entries.
          void deps.persist.prune(t);
          return { grid: stored.value, partial: false, fromNetwork: false };
        }
        if (t < gridCooldownUntil) return { grid: undefined, partial: false, fromNetwork: false };
        const fetched = await fetchMerged(bbox, opts, want.waves, t);
        return { ...fetched, fromNetwork: true };
      };

      let radarPromise: Promise<RadarData | undefined>;
      if (!want.radar) radarPromise = Promise.resolve(undefined);
      else if (radarCache && radarCache.expires > t)
        radarPromise = Promise.resolve(radarCache.data);
      // Stamp the TTL only on a real fetch: re-stamping on cache hits would slide the expiry
      // forever under steady loads and the nowcast would never refresh.
      else
        radarPromise = deps.radar().then((fresh) => {
          if (fresh) radarCache = { data: fresh, expires: t + RADAR_TTL_MS };
          return fresh;
        });

      const [{ grid, partial, fromNetwork }, radar] = await Promise.all([
        resolveGrid(),
        radarPromise,
      ]);
      // Re-read at each store write (not once): the persist await below is another window in which
      // a newer load can start.
      const superseded = () => seq !== loadSeq;

      if (grid) {
        if (!superseded()) store.setGrid(grid, t);
        // A partial grid (waves failed) is shown but never cached, so a later view retries marine;
        // the marine backoff itself was armed inside fetchMerged, and the healthy atmospheric
        // endpoint stays unblocked. The caches are still written when superseded: they are keyed
        // by viewport, so the data stays valid for a return to this view.
        if (!partial && fromNetwork) {
          // The cache computes its own expiry as `t + GRID_TTL_MS`; persist stores the same absolute
          // value so the two tiers expire together.
          gridCache.put(key, grid, t);
          // Persist for reloads and offline; the put never throws (it degrades to memory).
          await deps.persist.put(key, grid, t + GRID_TTL_MS);
          void deps.persist.prune(t);
        }
      } else {
        // A real network attempt (not a cache hit or a cooldown skip) failed: back off before retry.
        if (fromNetwork) gridCooldownUntil = t + GRID_FAIL_COOLDOWN_MS;
        if (!superseded()) store.setStatus(store.grid ? 'stale' : 'error');
      }
      if (radar && !superseded()) store.setRadar(radar);
    },
  };
}
