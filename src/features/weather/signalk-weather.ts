import { capitalize, fetchJsonOrUndefined, HOUR_MS, MINUTE_MS, nearestBy } from '$shared/lib';
import { asKeyedObject, authInit } from '$shared/signalk';
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

// How close to now a requested time must be for the latest OBSERVATION to answer instead of a
// forecast step. One constant so the tap readout and the conditions panel switch sources at the
// same distance from now.
export const NEAR_NOW_MS = 90 * MINUTE_MS;

export interface SignalKWeatherData {
  date: string;
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

// The Signal K server serializes each provider as { name, isDefault }. The provider id (the map
// key) is the last resort so detection still works for a provider the server emits without a name.
export interface WeatherProviderInfo {
  name?: string;
  isDefault: boolean;
}

type Fetch = typeof fetch;
const defaultFetch: Fetch = globalThis.fetch.bind(globalThis);

// The configured weather providers keyed by id, or {} when none. undefined on any transport failure.
export async function fetchWeatherProviders(
  origin: string,
  token?: string,
  fetchFn: Fetch = defaultFetch,
): Promise<Record<string, WeatherProviderInfo> | undefined> {
  const body = await fetchJsonOrUndefined<unknown>(
    `${origin}${WEATHER_BASE}/_providers`,
    authInit(token),
    fetchFn,
  );
  if (body === undefined) return undefined;
  return asKeyedObject(body) as Record<string, WeatherProviderInfo> | undefined;
}

// The display name of the default provider, or undefined when none is configured. Drives the "use
// the provider, fall back to free" decision and the source label on readouts. Falls back to the
// provider id (the map key) so a configured provider is always detected even without a name field.
export function defaultProviderName(
  providers: Record<string, WeatherProviderInfo> | undefined,
): string | undefined {
  if (!providers) return undefined;
  // Keep only object-valued entries: a malformed provider map (a value that is null or a string)
  // would otherwise throw when isDefault or name is read off it.
  const entries = Object.entries(providers).filter(
    (entry): entry is [string, WeatherProviderInfo] => !!entry[1] && typeof entry[1] === 'object',
  );
  if (entries.length === 0) return undefined;
  const [id, info] = entries.find(([, p]) => p.isDefault) ?? entries[0];
  return info.name ?? prettyProviderId(id);
}

const PROVIDER_PREFIX = /^(signalk-|sk-)/;
const PROVIDER_WORD_SPLIT = /[-_]+/;

// A raw plugin id like "signalk-weather-accuweather" reads poorly as a source label on readouts;
// strip the convention prefixes and title-case the words.
function prettyProviderId(id: string): string {
  const words = id.replace(PROVIDER_PREFIX, '').split(PROVIDER_WORD_SPLIT).filter(Boolean);
  if (words.length === 0) return id;
  return words.map(capitalize).join(' ');
}

function pointUrl(origin: string, path: string, lat: number, lon: number, count?: number): string {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (count !== undefined) params.set('count', String(count));
  return `${origin}${WEATHER_BASE}/${path}?${params.toString()}`;
}

function entryMs(entry: SignalKWeatherData): number {
  return Date.parse(entry.date);
}

// Latest observation at a point. undefined on failure or when no provider answers. The API does
// not guarantee ordering, so the latest is picked by date rather than trusting index 0: an
// hours-stale buffered entry must never be presented as current.
export async function fetchObservations(
  origin: string,
  lat: number,
  lon: number,
  token?: string,
  fetchFn: Fetch = defaultFetch,
): Promise<SignalKWeatherData | undefined> {
  const many = await fetchWeatherList(pointUrl(origin, 'observations', lat, lon), token, fetchFn);
  if (!many || many.length === 0) return undefined;
  // Nearest to the far future is the latest; entries without a parseable date lose to any dated one.
  return nearestBy(many, entryMs, Number.MAX_SAFE_INTEGER) ?? many[0];
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
  const body = await fetchJsonOrUndefined<unknown>(
    pointUrl(origin, 'warnings', lat, lon),
    authInit(token),
    fetchFn,
  );
  if (body === undefined) return undefined;
  return Array.isArray(body) ? (body as WeatherWarning[]) : undefined;
}

// Some endpoints return a single object, some an array; normalize to an array either way.
async function fetchWeatherList(
  url: string,
  token: string | undefined,
  fetchFn: Fetch,
): Promise<SignalKWeatherData[] | undefined> {
  const body = await fetchJsonOrUndefined<unknown>(url, authInit(token), fetchFn);
  if (body === undefined) return undefined;
  if (Array.isArray(body)) return body as SignalKWeatherData[];
  if (body && typeof body === 'object') return [body as SignalKWeatherData];
  return undefined;
}

// A normalized point reading for the conditions panel, richer than WeatherReadout (it carries air
// temperature, gust, and a timestamp). SI units. Built from either the provider or the free grid.
export interface PointConditions {
  timeMs: number;
  windMs?: number;
  fromRad?: number;
  gustMs?: number;
  pressurePa?: number;
  // The provider's qualitative barometer trend ("falling", "steady"), when it supplies one.
  pressureTendency?: string;
  airTempK?: number;
  cloudFraction?: number;
  waveHeightM?: number;
  wavePeriodS?: number;
  waveFromRad?: number;
  swellHeightM?: number;
  swellPeriodS?: number;
  swellFromRad?: number;
  visibilityM?: number;
  waterTempK?: number;
  precipitationMm?: number;
  // Whether precipitationMm is a rate (mm/h, the free grid) or an accumulation volume over the
  // provider's unspecified period (mm). Displaying a volume as a rate is wrong by the period factor.
  precipIsRate?: boolean;
}

export function conditionsFromSignalK(d: SignalKWeatherData): PointConditions {
  return {
    timeMs: Date.parse(d.date),
    windMs: d.wind?.speedTrue,
    fromRad: d.wind?.directionTrue,
    gustMs: d.wind?.gust,
    pressurePa: d.outside?.pressure,
    pressureTendency: d.outside?.pressureTendency,
    airTempK: d.outside?.temperature,
    cloudFraction: d.outside?.cloudCover,
    waveHeightM: d.water?.waveSignificantHeight,
    wavePeriodS: d.water?.wavePeriod,
    waveFromRad: d.water?.waveDirection,
    swellHeightM: d.water?.swellHeight,
    swellPeriodS: d.water?.swellPeriod,
    swellFromRad: d.water?.swellDirection,
    visibilityM: d.outside?.horizontalVisibility,
    waterTempK: d.water?.temperature,
    precipitationMm: d.outside?.precipitationVolume,
    precipIsRate: false,
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
    gustMs: d.wind?.gust,
    pressurePa: d.outside?.pressure,
    waveHeightM: d.water?.waveSignificantHeight,
    wavePeriodS: d.water?.wavePeriod,
    waveFromRad: d.water?.waveDirection,
    precipitationMm: d.outside?.precipitationVolume,
    precipIsRate: false,
    cloudCoverFraction: d.outside?.cloudCover,
  };
}

// The forecast entry nearest a target time, by parsing each entry's ISO date. undefined for an
// empty series.
export function nearestInTime(
  series: SignalKWeatherData[],
  targetMs: number,
): SignalKWeatherData | undefined {
  return nearestBy(series, entryMs, targetMs);
}

const DEFAULT_SERIES_STEP_MS = 3 * HOUR_MS;

// nearestInTime, but only within one series step of the target: past the series horizon the last
// entry must not answer for a time days away as if it were current. The accepted gap is the series'
// own cadence (from its first two entries), defaulting to 3 hours for a one-entry series.
export function nearestInTimeBounded(
  series: SignalKWeatherData[],
  targetMs: number,
): SignalKWeatherData | undefined {
  const best = nearestInTime(series, targetMs);
  if (!best) return undefined;
  const t0 = Date.parse(series[0]?.date ?? '');
  const t1 = Date.parse(series[1]?.date ?? '');
  const stepMs =
    !Number.isNaN(t0) && !Number.isNaN(t1) && t1 > t0 ? t1 - t0 : DEFAULT_SERIES_STEP_MS;
  return Math.abs(Date.parse(best.date) - targetMs) <= stepMs ? best : undefined;
}
