import { bilinearAt, type WeatherGrid } from '$entities/weather';

export interface WeatherReadout {
  speedMs: number;
  fromRad: number; // meteorological direction the wind comes from, radians, 0..2pi
  pressurePa?: number; // present only when the grid carries pressure
  waveHeightM?: number; // present only when the grid carries waves
  wavePeriodS?: number;
}

// Wind speed, from-direction, and (when present) pressure at a lon/lat for a forecast step, sampled
// from the grid. Returns undefined when the point is outside the grid. Values are SI; the display
// converts at its edge.
export function readoutAt(
  grid: WeatherGrid,
  lon: number,
  lat: number,
  timeIndex: number,
): WeatherReadout | undefined {
  const u = bilinearAt(grid, grid.windU[timeIndex], lon, lat);
  const v = bilinearAt(grid, grid.windV[timeIndex], lon, lat);
  if (u === undefined || v === undefined) return undefined;
  const speedMs = Math.hypot(u, v);
  const fromRad = (Math.atan2(-u, -v) + 2 * Math.PI) % (2 * Math.PI);
  const pressureField = grid.pressureMsl?.[timeIndex];
  const pressurePa = pressureField ? bilinearAt(grid, pressureField, lon, lat) : undefined;
  const waveField = grid.waveHeight?.[timeIndex];
  const waveHeightM = waveField ? bilinearAt(grid, waveField, lon, lat) : undefined;
  const periodField = grid.wavePeriod?.[timeIndex];
  const wavePeriodS = periodField ? bilinearAt(grid, periodField, lon, lat) : undefined;
  return { speedMs, fromRad, pressurePa, waveHeightM, wavePeriodS };
}
