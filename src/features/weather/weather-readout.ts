import { bilinearAt, type WeatherGrid } from '$entities/weather';

export interface WindReadout {
  speedMs: number;
  fromRad: number; // meteorological direction the wind comes from, radians, 0..2pi
}

// Wind speed and from-direction at a lon/lat for a forecast step, sampled from the grid. Returns
// undefined when the point is outside the grid. Values are SI; the display converts at its edge.
export function readoutAt(
  grid: WeatherGrid,
  lon: number,
  lat: number,
  timeIndex: number,
): WindReadout | undefined {
  const u = bilinearAt(grid, grid.windU[timeIndex], lon, lat);
  const v = bilinearAt(grid, grid.windV[timeIndex], lon, lat);
  if (u === undefined || v === undefined) return undefined;
  const speedMs = Math.hypot(u, v);
  const fromRad = (Math.atan2(-u, -v) + 2 * Math.PI) % (2 * Math.PI);
  return { speedMs, fromRad };
}
