import { HOUR_MS } from '$shared/lib';
import { createExpiringStore, type ExpiringStore } from '$shared/storage';
import {
  fetchObservations,
  fetchPointForecasts,
  fetchWeatherWarnings,
  type SignalKWeatherData,
  type WeatherWarning,
} from './signalk-weather';

// The provider's point answers for the conditions panel, persisted as one bundle so a panel opened
// with a failed or absent network replays the last conditions for the spot. fetchedAt stamps when
// the bundle was fetched; each entry also carries its own valid time (date), which is what the
// panel's "Observed/Forecast at" line states, so a replay declares its own age.
export interface ProviderPoint {
  fetchedAt: number;
  obs?: SignalKWeatherData;
  series?: SignalKWeatherData[];
  warnings?: WeatherWarning[];
}

interface LoaderDeps {
  observations: typeof fetchObservations;
  forecasts: typeof fetchPointForecasts;
  warnings: typeof fetchWeatherWarnings;
  now: () => number;
  // Persists the bundles across reloads (IndexedDB works over plain http, where the service worker
  // is inert), so the "Here" conditions survive a reload at anchor with no signal.
  persist: ExpiringStore<ProviderPoint>;
}

export interface PointConditionsLoader {
  load(
    origin: string,
    provider: string,
    lat: number,
    lon: number,
    token?: string,
  ): Promise<ProviderPoint>;
}

// Observations age fast; an hour bounds how stale a replayed bundle can be before the panel falls
// back to the free grid instead.
const POINT_TTL_MS = HOUR_MS;
// The boat occupies one or two cells at a time; eight covers a day's passage of distinct spots.
const MAX_POINT_ENTRIES = 8;
// A tenth of a degree (about 11 km): weather is one answer within a cell, so GPS drift at anchor
// maps to one key.
const QUANTIZE_DEG = 0.1;
// Fetch more forecast steps than the panel shows so the rows survive scrubbing past the first few.
const FORECAST_COUNT = 12;

const quantize = (v: number): string => (Math.round(v / QUANTIZE_DEG) * QUANTIZE_DEG).toFixed(1);

export function pointConditionsKey(provider: string, lat: number, lon: number): string {
  return `${provider}:${quantize(lat)},${quantize(lon)}`;
}

const realDeps: LoaderDeps = {
  observations: fetchObservations,
  forecasts: fetchPointForecasts,
  warnings: fetchWeatherWarnings,
  now: () => Date.now(),
  persist: createExpiringStore<ProviderPoint>('binnacle-weather-point', {
    maxEntries: MAX_POINT_ENTRIES,
  }),
};

// Network-first, unlike the weather grid loader: the panel's refetch is already gated on the
// rounded position and the provider, so the network cadence is unchanged and the persisted bundle
// only answers when the provider does not.
export function createPointConditionsLoader(
  overrides: Partial<LoaderDeps> = {},
): PointConditionsLoader {
  const deps = { ...realDeps, ...overrides };
  return {
    async load(origin, provider, lat, lon, token) {
      const t = deps.now();
      const key = pointConditionsKey(provider, lat, lon);
      const [obs, series, warns] = await Promise.all([
        deps.observations(origin, lat, lon, token),
        deps.forecasts(origin, lat, lon, FORECAST_COUNT, token),
        deps.warnings(origin, lat, lon, token),
      ]);
      if (obs || series) {
        const fresh: ProviderPoint = { fetchedAt: t, obs, series, warnings: warns };
        await deps.persist.put(key, fresh, t + POINT_TTL_MS);
        void deps.persist.prune(t);
        return fresh;
      }
      // The provider is unreachable (offline, or it went away mid-session): replay the last
      // conditions for this spot while they are within the hour, instead of dropping straight to
      // the free grid.
      const stored = await deps.persist.get(key);
      if (stored && stored.expires > t) {
        void deps.persist.prune(t);
        // A fresh warnings answer outranks the replayed set: a gale issued since the bundle was
        // stored must not be masked by it.
        return warns ? { ...stored.value, warnings: warns } : stored.value;
      }
      return { fetchedAt: t, warnings: warns };
    },
  };
}
