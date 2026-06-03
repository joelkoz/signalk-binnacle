import { type Bbox, sampleGrid, type WeatherGrid } from '$entities/weather';
import { PA_PER_HPA } from '$shared/lib';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
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
    pressure_msl?: number[];
    precipitation?: number[];
    cloud_cover?: number[];
  };
}

export interface MarineFields {
  waveHeight: number[][];
  waveDirection: number[][];
  wavePeriod: number[][];
}

interface MarineLoc {
  hourly?: {
    time?: number[];
    wave_height?: number[];
    wave_direction?: number[];
    wave_period?: number[];
  };
}

interface GridLocations<T> {
  locs: T[];
  lats: number[];
  lons: number[];
}

// Fetch one Open-Meteo endpoint for a bbox sampled to a grid, batched under the per-request location
// cap. Returns the per-location records plus the grid axes, or undefined on any failure so callers
// leave the last grid in place and retry.
async function fetchGridLocations<T>(
  baseUrl: string,
  hourly: string,
  extra: Record<string, string>,
  bbox: Bbox,
  opts: ForecastOptions,
  fetchFn: typeof fetch,
): Promise<GridLocations<T> | undefined> {
  const { lats, lons } = sampleGrid(bbox, opts.maxCells);
  const points: Array<{ lat: number; lon: number }> = [];
  for (const lat of lats) for (const lon of lons) points.push({ lat, lon });

  try {
    const chunks = chunk(points, MAX_LOCS_PER_REQUEST);
    const responses = await Promise.all(
      chunks.map((c) =>
        fetchFn(buildUrl(baseUrl, c, hourly, extra, opts), { credentials: 'omit' }),
      ),
    );
    const locs: T[] = [];
    for (const r of responses) {
      if (!r.ok) return undefined;
      const body = (await r.json()) as T | T[];
      for (const l of Array.isArray(body) ? body : [body]) locs.push(l);
    }
    return { locs, lats, lons };
  } catch {
    return undefined;
  }
}

function buildUrl(
  baseUrl: string,
  points: Array<{ lat: number; lon: number }>,
  hourly: string,
  extra: Record<string, string>,
  opts: ForecastOptions,
): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    hourly,
    forecast_days: String(opts.forecastDays),
    timeformat: 'unixtime',
    cell_selection: 'sea',
    ...extra,
  });
  return `${baseUrl}?${params}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function grid2d(steps: number, cells: number, fill = Number.NaN): number[][] {
  return Array.from({ length: steps }, () => new Array(cells).fill(fill));
}

// Fetch an Open-Meteo gridded forecast for the bbox. Wind is converted to u/v on parse, where the
// meteorological direction (where the wind comes from) is reversed to the vector; pressure is hPa on
// the wire, stored Pa. Returns undefined on any failure.
export async function fetchForecast(
  bbox: Bbox,
  opts: ForecastOptions,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<WeatherGrid | undefined> {
  const result = await fetchGridLocations<OmLoc>(
    FORECAST_URL,
    'wind_speed_10m,wind_direction_10m,pressure_msl,precipitation,cloud_cover',
    { wind_speed_unit: 'ms' },
    bbox,
    opts,
    fetchFn,
  );
  return result ? parse(result.locs, result.lats, result.lons) : undefined;
}

function parse(locs: OmLoc[], lats: number[], lons: number[]): WeatherGrid | undefined {
  const first = locs[0]?.hourly;
  if (!first?.time || first.time.length === 0) return undefined;
  const times = first.time.map((t) => Number(t) * 1000);
  const steps = times.length;
  const cells = lats.length * lons.length;
  if (locs.length !== cells) return undefined;
  const windU = grid2d(steps, cells, 0);
  const windV = grid2d(steps, cells, 0);
  const pressureMsl = grid2d(steps, cells);
  const precipitation = grid2d(steps, cells);
  const cloudCover = grid2d(steps, cells);
  for (let c = 0; c < cells; c += 1) {
    const h = locs[c]?.hourly;
    const spd = h?.wind_speed_10m ?? [];
    const dir = h?.wind_direction_10m ?? [];
    const pres = h?.pressure_msl ?? [];
    const precip = h?.precipitation ?? [];
    const cloud = h?.cloud_cover ?? [];
    for (let t = 0; t < steps; t += 1) {
      const s = spd[t] ?? 0;
      const d = (dir[t] ?? 0) * DEG_TO_RAD;
      windU[t][c] = -s * Math.sin(d);
      windV[t][c] = -s * Math.cos(d);
      const hpa = pres[t];
      if (hpa !== undefined) pressureMsl[t][c] = hpa * PA_PER_HPA;
      const mm = precip[t];
      if (mm !== undefined) precipitation[t][c] = mm;
      const cc = cloud[t];
      if (cc !== undefined) cloudCover[t][c] = cc / 100;
    }
  }
  return { lats, lons, times, windU, windV, pressureMsl, precipitation, cloudCover };
}

// Fetch Open-Meteo marine wave data for the same sampled grid as the forecast. Best-effort: returns
// undefined on any failure so waves degrade without affecting wind or pressure. Direction is
// converted from degrees to radians on parse; height stays in meters, period in seconds (SI).
export async function fetchMarine(
  bbox: Bbox,
  opts: ForecastOptions,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<MarineFields | undefined> {
  const result = await fetchGridLocations<MarineLoc>(
    MARINE_URL,
    'wave_height,wave_direction,wave_period',
    {},
    bbox,
    opts,
    fetchFn,
  );
  return result ? parseMarine(result.locs, result.lats.length * result.lons.length) : undefined;
}

function parseMarine(locs: MarineLoc[], cells: number): MarineFields | undefined {
  const first = locs[0]?.hourly;
  if (!first?.time || first.time.length === 0) return undefined;
  if (locs.length !== cells) return undefined;
  const steps = first.time.length;
  const waveHeight = grid2d(steps, cells);
  const waveDirection = grid2d(steps, cells);
  const wavePeriod = grid2d(steps, cells);
  for (let c = 0; c < cells; c += 1) {
    const h = locs[c]?.hourly;
    const wh = h?.wave_height ?? [];
    const wd = h?.wave_direction ?? [];
    const wp = h?.wave_period ?? [];
    for (let t = 0; t < steps; t += 1) {
      waveHeight[t][c] = wh[t] ?? Number.NaN;
      const d = wd[t];
      waveDirection[t][c] = d === undefined ? Number.NaN : d * DEG_TO_RAD;
      wavePeriod[t][c] = wp[t] ?? Number.NaN;
    }
  }
  return { waveHeight, waveDirection, wavePeriod };
}

// Attach marine fields to a forecast grid. The marine fetch uses the same sampled grid and forecast
// horizon, so the cell and step indices align positionally with the wind and pressure arrays.
export function mergeMarine(grid: WeatherGrid, marine: MarineFields): WeatherGrid {
  return {
    ...grid,
    waveHeight: marine.waveHeight,
    waveDirection: marine.waveDirection,
    wavePeriod: marine.wavePeriod,
  };
}
