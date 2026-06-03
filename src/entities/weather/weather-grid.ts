export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

// The corner-getter surface of a MapLibre LngLatBounds, so the bbox conversion does not depend on
// the map library type.
export interface MapBoundsLike {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}

// A MapLibre bounds object to a plain Bbox, shared by every map surface that fetches for its view.
export function boundsToBbox(b: MapBoundsLike): Bbox {
  return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
}

// A regular lat/lon forecast grid. Variable arrays are indexed [timeIndex][cellIndex], where
// cellIndex is row-major over (lat, lon). All values are SI.
export interface WeatherGrid {
  lats: number[];
  lons: number[];
  times: number[]; // epoch ms, ascending
  windU: number[][]; // m/s, eastward
  windV: number[][]; // m/s, northward
  // Supplementary fields, present only when fetched; absent (undefined) for a wind-only grid or
  // over cells the provider omits. All SI: pressure in Pa, wave height in m, direction in radians,
  // period in s. Marine fields are NaN over land cells.
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

export function cellIndex(
  grid: { lats: number[]; lons: number[] },
  row: number,
  col: number,
): number {
  return row * grid.lons.length + col;
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
  const top = v00 + (v10 - v00) * cx.f;
  const bot = v01 + (v11 - v01) * cx.f;
  return top + (bot - top) * cy.f;
}

function frac(axisVals: number[], v: number): { i: number; f: number } | undefined {
  if (v < axisVals[0] || v > axisVals[axisVals.length - 1]) return undefined;
  for (let i = 0; i < axisVals.length - 1; i += 1) {
    if (v <= axisVals[i + 1]) {
      const span = axisVals[i + 1] - axisVals[i] || 1;
      return { i, f: (v - axisVals[i]) / span };
    }
  }
  return { i: axisVals.length - 2, f: 1 };
}

export interface TimeBracket {
  lo: number;
  hi: number;
  frac: number;
}

// The two forecast step indices bracketing a selected time and the blend fraction, clamped to the
// ends so scrubbing before or past the forecast shows the nearest step.
export function timeBracket(grid: WeatherGrid, time: number): TimeBracket {
  const t = grid.times;
  if (t.length === 0 || time <= t[0]) return { lo: 0, hi: 0, frac: 0 };
  if (time >= t[t.length - 1]) return { lo: t.length - 1, hi: t.length - 1, frac: 0 };
  for (let i = 0; i < t.length - 1; i += 1) {
    if (time <= t[i + 1]) {
      const span = t[i + 1] - t[i] || 1;
      return { lo: i, hi: i + 1, frac: (time - t[i]) / span };
    }
  }
  return { lo: t.length - 1, hi: t.length - 1, frac: 0 };
}
