import { type LngLatBoundsLike, lngLatBoundsToBbox4 } from '$shared/geo';
import { lerp, nearestBy } from '$shared/lib';

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function boundsToBbox(b: LngLatBoundsLike): Bbox {
  const [west, south, east, north] = lngLatBoundsToBbox4(b);
  return { west, south, east, north };
}

// A regular lat/lon forecast grid. Variable arrays are indexed [timeIndex][cellIndex], where
// cellIndex is row-major over (lat, lon). All values are SI.
export interface WeatherGrid {
  lats: number[];
  lons: number[];
  times: number[]; // epoch ms, ascending
  windU: number[][]; // m/s, eastward
  windV: number[][]; // m/s, northward
  // When the loader fetched this grid from the network (epoch ms), carried through the caches so
  // the panel can state the forecast's age honestly. Absent on grids persisted before this field.
  fetchedAt?: number;
  // Waves were requested but the marine endpoint failed, so the wave fields are missing from an
  // otherwise complete grid; the panel qualifies its stale note with this.
  partialWaves?: boolean;
  // Supplementary fields, present only when fetched; absent (undefined) for a wind-only grid or
  // over cells the provider omits. All SI: pressure in Pa, wave height in m, direction in radians,
  // period in s. Marine fields are NaN over land cells.
  windGust?: number[][]; // m/s
  pressureMsl?: number[][]; // Pa
  precipitation?: number[][]; // mm (hourly total)
  cloudCover?: number[][]; // 0..1 fraction
  waveHeight?: number[][]; // m
  waveDirection?: number[][]; // radians, direction the waves come from
  wavePeriod?: number[][]; // s
}

export interface RadarFrame {
  time: number; // epoch ms
  path: string;
}

export interface RadarData {
  host: string;
  frames: RadarFrame[]; // ascending by time
}

// Sample a bbox into a grid no larger than maxCells, keeping the axes roughly proportional to the
// bbox so neither is starved. Inclusive of both corners so the field covers the whole viewport.
export function sampleGrid(bbox: Bbox, maxCells: number): { lats: number[]; lons: number[] } {
  const w = Math.max(1e-6, bbox.east - bbox.west);
  const h = Math.max(1e-6, bbox.north - bbox.south);
  const aspect = w / h;
  const rows = Math.max(2, Math.round(Math.sqrt(maxCells / aspect)));
  const cols = Math.max(2, Math.floor(maxCells / rows));
  return { lats: axis(bbox.south, bbox.north, rows), lons: axis(bbox.west, bbox.east, cols) };
}

function axis(min: number, max: number, n: number): number[] {
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => min + i * step);
}

// Bilinearly sample one variable array at a lon/lat. Returns undefined when the point is outside the
// grid so the readout can show a blank instead of a wrong value.
export function bilinearAt(
  grid: WeatherGrid,
  values: number[],
  lon: number,
  lat: number,
): number | undefined {
  const cx = frac(grid.lons, lon);
  const cy = frac(grid.lats, lat);
  if (!cx || !cy) return undefined;
  const cols = grid.lons.length;
  const v00 = values[cy.i * cols + cx.i];
  const v10 = values[cy.i * cols + cx.i + 1];
  const v01 = values[(cy.i + 1) * cols + cx.i];
  const v11 = values[(cy.i + 1) * cols + cx.i + 1];
  const top = lerp(v00, v10, cx.f);
  const bot = lerp(v01, v11, cx.f);
  return lerp(top, bot, cy.f);
}

// Find the interval [axis[i], axis[i+1]] bracketing v and the blend fraction within it. Assumes
// axis is sorted ascending and axis[0] <= v <= axis[last]; callers handle the out-of-range cases.
function bracket(axis: number[], v: number): { i: number; f: number } {
  let lo = 0;
  let hi = axis.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (v <= axis[mid + 1]) hi = mid;
    else lo = mid + 1;
  }
  const span = axis[lo + 1] - axis[lo] || 1;
  return { i: lo, f: (v - axis[lo]) / span };
}

function frac(axisVals: number[], v: number): { i: number; f: number } | undefined {
  if (v < axisVals[0] || v > axisVals[axisVals.length - 1]) return undefined;
  return bracket(axisVals, v);
}

export interface TimeBracket {
  lo: number;
  hi: number;
  frac: number;
}

// The grid step nearest a target time, clamped into the series. Used to seed the time slider to
// now on load: Open-Meteo's hourly series starts at 00:00 of the current day, so the first step is
// up to a day in the past and must never be the default.
export function nearestGridTime(times: number[], targetMs: number): number | undefined {
  return nearestBy(times, (t) => t, targetMs);
}

// The two forecast step indices bracketing a selected time and the blend fraction, clamped to the
// ends so scrubbing before or past the forecast shows the nearest step.
export function timeBracket(grid: WeatherGrid, time: number): TimeBracket {
  const t = grid.times;
  if (t.length === 0 || time <= t[0]) return { lo: 0, hi: 0, frac: 0 };
  if (time >= t[t.length - 1]) return { lo: t.length - 1, hi: t.length - 1, frac: 0 };
  const { i, f } = bracket(t, time);
  return { lo: i, hi: i + 1, frac: f };
}
