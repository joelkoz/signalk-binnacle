import { type Bbox, sampleGrid, type WeatherGrid } from '$entities/weather';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
// Open-Meteo accepts many locations per request; keep batches well under its cap.
const MAX_LOCS_PER_REQUEST = 200;
const DEG_TO_RAD = Math.PI / 180;

export interface ForecastOptions {
  maxCells: number;
  forecastDays: number;
}

interface OmLoc {
  hourly?: {
    time?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
  };
}

// Fetch an Open-Meteo gridded forecast for the bbox. Returns a WeatherGrid, or undefined on any
// failure so the caller leaves the last grid in place and retries. Wind is converted to u/v on
// parse, where the meteorological direction (where the wind comes from) is reversed to the vector.
export async function fetchForecast(
  bbox: Bbox,
  opts: ForecastOptions,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<WeatherGrid | undefined> {
  const { lats, lons } = sampleGrid(bbox, opts.maxCells);
  const points: Array<{ lat: number; lon: number }> = [];
  for (const lat of lats) for (const lon of lons) points.push({ lat, lon });

  try {
    const chunks = chunk(points, MAX_LOCS_PER_REQUEST);
    const responses = await Promise.all(
      chunks.map((c) => fetchFn(buildUrl(c, opts), { credentials: 'omit' })),
    );
    const locs: OmLoc[] = [];
    for (const r of responses) {
      if (!r.ok) return undefined;
      const body = (await r.json()) as OmLoc | OmLoc[];
      for (const l of Array.isArray(body) ? body : [body]) locs.push(l);
    }
    return parse(locs, lats, lons);
  } catch {
    return undefined;
  }
}

function buildUrl(points: Array<{ lat: number; lon: number }>, opts: ForecastOptions): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    hourly: 'wind_speed_10m,wind_direction_10m,pressure_msl,precipitation,cloud_cover',
    wind_speed_unit: 'ms',
    forecast_days: String(opts.forecastDays),
    timeformat: 'unixtime',
    cell_selection: 'sea',
  });
  return `${FORECAST_URL}?${params}`;
}

function parse(locs: OmLoc[], lats: number[], lons: number[]): WeatherGrid | undefined {
  const first = locs[0]?.hourly;
  if (!first?.time || first.time.length === 0) return undefined;
  const times = first.time.map((t) => Number(t) * 1000);
  const steps = times.length;
  const cells = lats.length * lons.length;
  if (locs.length !== cells) return undefined;
  const windU: number[][] = Array.from({ length: steps }, () => new Array(cells).fill(0));
  const windV: number[][] = Array.from({ length: steps }, () => new Array(cells).fill(0));
  for (let c = 0; c < cells; c += 1) {
    const h = locs[c]?.hourly;
    const spd = h?.wind_speed_10m ?? [];
    const dir = h?.wind_direction_10m ?? [];
    for (let t = 0; t < steps; t += 1) {
      const s = spd[t] ?? 0;
      const d = (dir[t] ?? 0) * DEG_TO_RAD;
      windU[t][c] = -s * Math.sin(d);
      windV[t][c] = -s * Math.cos(d);
    }
  }
  return { lats, lons, times, windU, windV };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
