import { bilinearAt, type WeatherGrid } from '$entities/weather';

// Below this rate (mm/h) precipitation is not worth showing in a readout: a trace that rounds to
// nothing. Shared by the readouts that gate a rain line on it so the threshold is defined once.
export const RAIN_VISIBLE_MM_H = 0.1;

export interface WeatherReadout {
  speedMs: number;
  fromRad: number; // meteorological direction the wind comes from, radians, 0..2pi
  pressurePa?: number; // present only when the grid carries pressure
  waveHeightM?: number; // present only when the grid carries waves
  wavePeriodS?: number;
  precipitationMm?: number; // mm/h, present only when the grid carries precipitation
  cloudCoverFraction?: number; // 0..1, present only when the grid carries cloud cover
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
  const pressurePa = pressureField
    ? nanToUndef(bilinearAt(grid, pressureField, lon, lat))
    : undefined;
  const waveField = grid.waveHeight?.[timeIndex];
  const waveHeightM = waveField ? nanToUndef(bilinearAt(grid, waveField, lon, lat)) : undefined;
  const periodField = grid.wavePeriod?.[timeIndex];
  const wavePeriodS = periodField ? nanToUndef(bilinearAt(grid, periodField, lon, lat)) : undefined;
  const precipField = grid.precipitation?.[timeIndex];
  const precipitationMm = precipField
    ? nanToUndef(bilinearAt(grid, precipField, lon, lat))
    : undefined;
  const cloudField = grid.cloudCover?.[timeIndex];
  const cloudCoverFraction = cloudField
    ? nanToUndef(bilinearAt(grid, cloudField, lon, lat))
    : undefined;
  return {
    speedMs,
    fromRad,
    pressurePa,
    waveHeightM,
    wavePeriodS,
    precipitationMm,
    cloudCoverFraction,
  };
}

// Marine fields are NaN over land; collapse those to undefined so the display shows nothing rather
// than "NaN" and the chip can guard with a plain presence check.
function nanToUndef(v: number | undefined): number | undefined {
  return v === undefined || Number.isNaN(v) ? undefined : v;
}
