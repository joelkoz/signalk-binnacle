import { authInit } from '$shared/signalk';
import type { WeatherReadout } from './weather-readout';

// The Signal K Weather API v2 is point-only (a single lat/lon per request). A provider plugin (for
// example AccuWeather, OpenWeather, or Open-Meteo) feeds it and normalizes to the Signal K schema,
// so values are SI: m/s, radians, Kelvin, Pascals, and ratios. Binnacle prefers the provider for
// point data (the tap readout and the vessel conditions) and falls back to the free area sources
// when no provider is configured.
//
// These types mirror the few fields Binnacle reads from @signalk/server-api's WeatherData. That
// package must never be imported in browser code: its barrel re-exports a class that extends Node's
// EventEmitter and dies at load when bundled.

const WEATHER_BASE = '/signalk/v2/api/weather';

export type SignalKWeatherKind = 'observation' | 'point' | 'daily';

export interface SignalKWeatherData {
  date: string;
  type?: SignalKWeatherKind;
  description?: string;
  outside?: {
    temperature?: number; // K
    feelsLikeTemperature?: number; // K
    minTemperature?: number; // K
    maxTemperature?: number; // K
    dewPointTemperature?: number; // K
    pressure?: number; // Pa
    pressureTendency?: string;
    relativeHumidity?: number; // ratio 0..1
    cloudCover?: number; // ratio 0..1
    precipitationVolume?: number; // mm
    precipitationType?: string;
    uvIndex?: number;
    horizontalVisibility?: number; // m
  };
  wind?: {
    speedTrue?: number; // m/s
    directionTrue?: number; // rad, direction the wind comes from
    gust?: number; // m/s
    gustDirection?: number; // rad
  };
  water?: {
    temperature?: number; // K
    waveSignificantHeight?: number; // m
    wavePeriod?: number; // s
    waveDirection?: number; // rad
    swellHeight?: number; // m
    swellPeriod?: number; // s
    swellDirection?: number; // rad
    surfaceCurrentSpeed?: number; // m/s
    surfaceCurrentDirection?: number; // rad
  };
  sun?: { sunrise?: string; sunset?: string };
}

export interface WeatherWarning {
  startTime: string;
  endTime: string;
  details: string;
  source: string;
  type: string;
}

export interface WeatherProviderInfo {
  provider: string;
  isDefault: boolean;
}

type Fetch = typeof fetch;
const defaultFetch: Fetch = (...args) => globalThis.fetch(...args);

// The configured weather providers keyed by id, or {} when none. undefined on any transport failure.
export async function fetchWeatherProviders(
  origin: string,
  token?: string,
  fetchFn: Fetch = defaultFetch,
): Promise<Record<string, WeatherProviderInfo> | undefined> {
  try {
    const res = await fetchFn(`${origin}${WEATHER_BASE}/_providers`, authInit(token));
    if (!res.ok) return undefined;
    const body = await res.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
    return body as Record<string, WeatherProviderInfo>;
  } catch {
    return undefined;
  }
}

// The display name of the default provider, or undefined when none is configured. Drives the "use
// the provider, fall back to free" decision and the source label on readouts.
export function defaultProviderName(
  providers: Record<string, WeatherProviderInfo> | undefined,
): string | undefined {
  if (!providers) return undefined;
  const entries = Object.values(providers);
  const chosen = entries.find((p) => p.isDefault) ?? entries[0];
  return chosen?.provider;
}

function pointUrl(origin: string, path: string, lat: number, lon: number, count?: number): string {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (count !== undefined) params.set('count', String(count));
  return `${origin}${WEATHER_BASE}/${path}?${params.toString()}`;
}

// Latest observation at a point. undefined on failure or when no provider answers.
export async function fetchObservations(
  origin: string,
  lat: number,
  lon: number,
  token?: string,
  fetchFn: Fetch = defaultFetch,
): Promise<SignalKWeatherData | undefined> {
  const many = await fetchWeatherList(pointUrl(origin, 'observations', lat, lon), token, fetchFn);
  return many?.[0];
}

// A point forecast series (ascending in time), capped at `count` steps. undefined on failure.
export async function fetchPointForecasts(
  origin: string,
  lat: number,
  lon: number,
  count: number,
  token?: string,
  fetchFn: Fetch = defaultFetch,
): Promise<SignalKWeatherData[] | undefined> {
  return fetchWeatherList(pointUrl(origin, 'forecasts/point', lat, lon, count), token, fetchFn);
}

export async function fetchWeatherWarnings(
  origin: string,
  lat: number,
  lon: number,
  token?: string,
  fetchFn: Fetch = defaultFetch,
): Promise<WeatherWarning[] | undefined> {
  try {
    const res = await fetchFn(pointUrl(origin, 'warnings', lat, lon), authInit(token));
    if (!res.ok) return undefined;
    const body = await res.json();
    return Array.isArray(body) ? (body as WeatherWarning[]) : undefined;
  } catch {
    return undefined;
  }
}

// Some endpoints return a single object, some an array; normalize to an array either way.
async function fetchWeatherList(
  url: string,
  token: string | undefined,
  fetchFn: Fetch,
): Promise<SignalKWeatherData[] | undefined> {
  try {
    const res = await fetchFn(url, authInit(token));
    if (!res.ok) return undefined;
    const body = await res.json();
    if (Array.isArray(body)) return body as SignalKWeatherData[];
    if (body && typeof body === 'object') return [body as SignalKWeatherData];
    return undefined;
  } catch {
    return undefined;
  }
}

// A normalized point reading for the conditions panel, richer than WeatherReadout (it carries air
// temperature, gust, and a timestamp). SI units. Built from either the provider or the free grid.
export interface PointConditions {
  timeMs: number;
  windMs?: number;
  fromRad?: number;
  gustMs?: number;
  pressurePa?: number;
  airTempK?: number;
  cloudFraction?: number;
  waveHeightM?: number;
  wavePeriodS?: number;
  precipitationMm?: number;
}

export function conditionsFromSignalK(d: SignalKWeatherData): PointConditions {
  return {
    timeMs: Date.parse(d.date),
    windMs: d.wind?.speedTrue,
    fromRad: d.wind?.directionTrue,
    gustMs: d.wind?.gust,
    pressurePa: d.outside?.pressure,
    airTempK: d.outside?.temperature,
    cloudFraction: d.outside?.cloudCover,
    waveHeightM: d.water?.waveSignificantHeight,
    wavePeriodS: d.water?.wavePeriod,
    precipitationMm: d.outside?.precipitationVolume,
  };
}

// Map a Signal K point reading to the same WeatherReadout the grid sampler produces, so the tap
// readout renders identically whichever source answered. Returns undefined when wind is absent,
// which lets the caller fall back to the grid. Values are already SI.
export function readoutFromSignalK(d: SignalKWeatherData): WeatherReadout | undefined {
  const speedMs = d.wind?.speedTrue;
  const fromRad = d.wind?.directionTrue;
  if (speedMs === undefined || fromRad === undefined) return undefined;
  return {
    speedMs,
    fromRad,
    pressurePa: d.outside?.pressure,
    waveHeightM: d.water?.waveSignificantHeight,
    wavePeriodS: d.water?.wavePeriod,
    precipitationMm: d.outside?.precipitationVolume,
    cloudCoverFraction: d.outside?.cloudCover,
  };
}

// The forecast entry nearest a target time, by parsing each entry's ISO date. undefined for an
// empty series.
export function nearestInTime(
  series: SignalKWeatherData[],
  targetMs: number,
): SignalKWeatherData | undefined {
  let best: SignalKWeatherData | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const entry of series) {
    const t = Date.parse(entry.date);
    if (Number.isNaN(t)) continue;
    const gap = Math.abs(t - targetMs);
    if (gap < bestGap) {
      bestGap = gap;
      best = entry;
    }
  }
  return best;
}
